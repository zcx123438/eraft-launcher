// ecraft launcher - 启动器内核（跨平台）
// 负责版本清单获取、客户端/依赖库/资源文件下载、启动命令构建
(function () {
  const MIRROR = 'https://bmclapi2.bangbang93.com';
  const OFFICIAL_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

  function mapUrl(url, mirror) {
    if (!mirror || !url) return url;
    if (url.includes('resources.download.minecraft.net')) {
      return url.replace('https://resources.download.minecraft.net', MIRROR + '/assets');
    }
    if (url.includes('libraries.minecraft.net')) {
      return url.replace('https://libraries.minecraft.net', MIRROR + '/maven');
    }
    if (url.includes('launchermeta.mojang.com') || url.includes('piston-meta.mojang.com')) {
      return url.replace(/^https:\/\/(launchermeta|piston-meta)\.mojang\.com/, MIRROR);
    }
    return url;
  }

  function osName(platform) {
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'osx';
    return 'linux';
  }

  function libPathOf(lib) {
    const d = lib.downloads && lib.downloads.artifact;
    if (d && d.path) return d.path;
    // 回退：按 maven 坐标拼路径
    const [group, artifact, version] = lib.name.split(':');
    const cls = lib.url ? '' : '';
    return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
  }

  async function sha1(buf) {
    const d = await crypto.subtle.digest('SHA-1', buf.buffer ? buf : new Uint8Array(buf));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  window.ECraftCore = {
    mirrorEnabled: true,

    async fetchJSON(url) {
      // 镜像优先，失败自动回退官方源
      try {
        const res = await fetch(mapUrl(url, this.mirrorEnabled));
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return await res.json();
      } catch (e) {
        if (!this.mirrorEnabled) throw e;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return await res.json();
      }
    },

    // 版本清单
    async getVersions() {
      let manifest;
      try {
        manifest = await this.fetchJSON(OFFICIAL_MANIFEST);
      } catch (e) {
        const res = await fetch(`${MIRROR}/mc/game/version_manifest_v2.json`);
        if (!res.ok) throw e;
        manifest = await res.json();
      }
      const list = manifest.versions || [];
      return {
        latest: manifest.latest || {},
        release: list.filter(v => v.type === 'release'),
        snapshot: list.filter(v => v.type === 'snapshot'),
        old: list.filter(v => v.type === 'old_beta' || v.type === 'old_alpha')
      };
    },

    // 校验规则（标准 Mojang rules 语义：按顺序覆盖，只看适用条目）
    ruleOk(lib, platform) {
      const rules = lib.rules;
      if (!rules || !rules.length) return true;
      const os = osName(platform);
      let allowed = false;
      for (const r of rules) {
        if (r.os && r.os.name !== os) continue;
        if (r.features && Object.keys(r.features).length) continue;
        allowed = r.action === 'allow';
      }
      return allowed;
    },

    // 解析继承链，合并版本 JSON
    async resolveVersion(id, adapter, gameRoot) {
      const vdir = adapter.join(gameRoot, 'versions', id);
      let json = null;
      // 优先本地
      try { json = await adapter.readJSON(adapter.join(vdir, `${id}.json`)); } catch {}
      if (!json) {
        const vs = await this.getVersions();
        const meta = [...vs.release, ...vs.snapshot, ...vs.old].find(v => v.id === id);
        if (!meta) throw new Error(`未找到版本 ${id}`);
        json = await this.fetchJSON(meta.url);
      }
      if (json.inheritsFrom) {
        const parentDir = adapter.join(gameRoot, 'versions', json.inheritsFrom);
        let parent = null;
        try { parent = await adapter.readJSON(adapter.join(parentDir, `${json.inheritsFrom}.json`)); } catch {}
        if (!parent) {
          const vs = await this.getVersions();
          const meta = [...vs.release, ...vs.snapshot, ...vs.old].find(v => v.id === json.inheritsFrom);
          parent = await this.fetchJSON(meta.url);
        }
        const merged = JSON.parse(JSON.stringify(parent));
        merged.inheritsFrom = null;
        merged.id = id;
        merged.mainClass = json.mainClass || parent.mainClass;
        if (json.minecraftArguments && parent.minecraftArguments) {
          merged.minecraftArguments = parent.minecraftArguments + ' ' + json.minecraftArguments;
        }
        if (parent.arguments || json.arguments) {
          merged.arguments = {
            game: [...((parent.arguments && parent.arguments.game) || []), ...((json.arguments && json.arguments.game) || [])],
            jvm: [...((parent.arguments && parent.arguments.jvm) || []), ...((json.arguments && json.arguments.jvm) || [])]
          };
        }
        merged.libraries = [...(json.libraries || []), ...(parent.libraries || [])];
        if (json.jar) merged.jar = json.jar;
        json = merged;
      }
      return { json, vdir };
    },

    // 下载单个文件（带镜像回退官方）
    async downloadTo(url, dest, adapter, onChunk) {
      const candidates = this.mirrorEnabled ? [mapUrl(url, true), url] : [url];
      let lastErr;
      for (const u of candidates) {
        try {
          const buf = await adapter.fetchBuf(u, onChunk);
          await adapter.writeFile(dest, buf);
          return buf;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('下载失败: ' + url);
    },

    // 安装一个版本
    async install(id, adapter, gameRoot, onProgress) {
      const P = (stage, done, total, text) => onProgress && onProgress({ stage, done, total, text: text || '' });
      P('解析版本', 0, 1, id);

      // 1. 版本 JSON
      const vs = await this.getVersions();
      const meta = [...vs.release, ...vs.snapshot, ...vs.old].find(v => v.id === id);
      if (!meta) throw new Error(`未找到版本 ${id}`);
      let json;
      try { json = await this.fetchJSON(meta.url); }
      catch { const r = await fetch(meta.url); json = await r.json(); }

      const vdir = adapter.join(gameRoot, 'versions', id);
      const jarId = json.jar || id;
      const jarDir = jarId === id ? vdir : adapter.join(gameRoot, 'versions', jarId);

      // 2. 客户端 jar（镜像专用端点优先，回退官方）
      const officialClientUrl = (json.downloads && json.downloads.client && json.downloads.client.url) || null;
      P('下载客户端', 0, 1, jarId);
      const clientJarPath = adapter.join(jarDir, `${jarId}.jar`);
      if (!(await adapter.exists(clientJarPath))) {
        const mirrorUrl = `${MIRROR}/version/${jarId}/client`;
        let ok = false;
        if (this.mirrorEnabled) {
          try {
            const buf = await adapter.fetchBuf(mirrorUrl, (d, t) => P('下载客户端', d, t, jarId));
            await adapter.writeFile(clientJarPath, buf); ok = true;
          } catch (e) { /* 回退官方 */ }
        }
        if (!ok) {
          if (!officialClientUrl) throw new Error('无法获取客户端下载地址');
          const buf = await adapter.fetchBuf(officialClientUrl, (d, t) => P('下载客户端', d, t, jarId));
          await adapter.writeFile(clientJarPath, buf);
        }
      }
      await adapter.writeJSON(adapter.join(vdir, `${id}.json`), json);

      // 3. 依赖库
      const libs = (json.libraries || []).filter(l => this.ruleOk(l, adapter.platform));
      let doneLibs = 0;
      const libPaths = [];
      for (const lib of libs) {
        const d = lib.downloads && lib.downloads.artifact;
        if (!d) { // 极老版本没有 downloads，尝试 maven 官方
          const p = libPathOf(lib);
          const url = (lib.url || 'https://libraries.minecraft.net/') + p.replace(/^\/+/, '');
          const dest = adapter.join(gameRoot, 'libraries', p);
          libPaths.push(dest);
          if (!(await adapter.exists(dest))) {
            try { await this.downloadTo(url, dest, adapter); } catch {}
          }
          doneLibs++; P('下载依赖库', doneLibs, libs.length, lib.name);
          continue;
        }
        const dest = adapter.join(gameRoot, 'libraries', d.path);
        libPaths.push(dest);
        if (!(await adapter.exists(dest))) {
          try { await this.downloadTo(d.url, dest, adapter); }
          catch (e) { /* 跳过失败的可选库 */ }
        }
        doneLibs++; P('下载依赖库', doneLibs, libs.length, d.path.split('/').pop());

        // natives
        const nativesId = { windows: 'natives-windows', osx: 'natives-macos', linux: 'natives-linux' }[osName(adapter.platform)];
        const cls = lib.downloads && lib.downloads.classifiers;
        if (cls && cls[nativesId] && adapter.platform !== 'android') {
          const nDest = adapter.join(gameRoot, 'libraries', cls[nativesId].path);
          if (!(await adapter.exists(nDest))) {
            try { await this.downloadTo(cls[nativesId].url, nDest, adapter); } catch {}
          }
          const nDir = adapter.join(vdir, 'natives');
          try { await adapter.unzipJar(nDest, nDir); } catch {}
        }
      }

      // 4. 资源文件（assets）
      const assetIndex = json.assetIndex;
      let assetsIndexName = json.assets;
      if (assetIndex) {
        assetsIndexName = json.assets || assetIndex.id;
        const idxPath = adapter.join(gameRoot, 'assets', 'indexes', `${assetsIndexName}.json`);
        P('下载资源索引', 0, 1, assetsIndexName);
        let index;
        if (await adapter.exists(idxPath)) {
          index = await adapter.readJSON(idxPath);
        } else {
          index = await this.fetchJSON(assetIndex.url).catch(async () => {
            const r = await fetch(assetIndex.url); return await r.json();
          });
          await adapter.writeJSON(idxPath, index);
        }
        const objects = Object.values(index.objects || {});
        let doneA = 0;
        const CONC = 16;
        let cursor = 0;
        async function worker() {
          while (cursor < objects.length) {
            const obj = objects[cursor++];
            const h2 = obj.hash.slice(0, 2);
            const dest = adapter.join(gameRoot, 'assets', 'objects', h2, obj.hash);
            const exists = await adapter.exists(dest);
            let ok = exists;
            if (!ok) {
              try {
                await this.downloadTo(`https://resources.download.minecraft.net/${h2}/${obj.hash}`, dest, adapter);
                ok = true;
              } catch {}
            }
            doneA++; P('下载资源文件', doneA, objects.length, `${doneA}/${objects.length}`);
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONC, objects.length) }, worker.bind(this)));
      }

      P('完成', 1, 1, id);
      return { id, vdir, jarPath: clientJarPath, libPaths, assetsIndexName, json };
    },

    // 离线登录 UUID（与官方离线模式一致：UUID v3 of "OfflinePlayer:<name>"）
    async offlineUUID(name, adapter) {
      const str = 'OfflinePlayer:' + name;
      let hex = null;
      if (adapter && adapter.md5hex) hex = await adapter.md5hex(str);
      else if (window.jsMd5) hex = window.jsMd5(str);
      if (!hex) throw new Error('无法计算离线 UUID（缺少 MD5 实现）');
      const h = hex.split('');
      h[12] = '3'; h[16] = '8'; // version 3, variant
      return [
        h.slice(0, 8).join(''), h.slice(8, 12).join(''), h.slice(12, 16).join(''),
        h.slice(16, 20).join(''), h.slice(20, 32).join('')
      ].join('-');
    },

    // 构建启动命令
    async buildCommand(installResult, adapter, gameRoot, opts) {
      const { json, jarPath, libPaths, assetsIndexName, vdir } = installResult;
      const isWin = adapter.platform === 'win32';
      const sep = isWin ? ';' : ':';
      const nativesDir = adapter.join(vdir, 'natives');
      const assetsRoot = adapter.join(gameRoot, 'assets');

      const uuid = opts.uuid || await this.offlineUUID(opts.username, adapter);
      const subs = {
        auth_player_name: opts.username,
        auth_uuid: uuid,
        auth_access_token: opts.accessToken || uuid,
        auth_xuid: '0',
        clientid: 'ecraft-launcher',
        user_type: 'offline',
        version_name: json.id,
        version_type: json.type || 'release',
        game_directory: gameRoot,
        assets_root: assetsRoot,
        assets_index_name: assetsIndexName || json.assets,
        game_assets: adapter.join(gameRoot, 'assets', 'virtual', 'legacy'),
        natives_directory: nativesDir,
        launcher_name: 'ecraft launcher',
        launcher_version: '1.0.0',
        classpath: [...libPaths, jarPath].join(sep),
        classpath_separator: sep,
        user_properties: '{}'
      };

      // JVM 参数
      let jvmArgs;
      if (json.arguments && json.arguments.jvm) {
        jvmArgs = json.arguments.jvm.filter(a => typeof a === 'string').map(a => fill(a, subs));
      } else {
        jvmArgs = [
          '-Djava.library.path=' + nativesDir,
          '-cp', subs.classpath
        ];
      }
      const mem = opts.memoryMB || 2048;
      const cmd = [
        opts.javaPath || 'java',
        `-Xmx${mem}M`, `-Xms${Math.min(512, mem)}M`,
        ...jvmArgs,
        json.mainClass
      ];

      // 游戏参数
      let gameArgs;
      if (json.arguments && json.arguments.game) {
        gameArgs = json.arguments.game.filter(a => typeof a === 'string').map(a => fill(a, subs));
      } else if (json.minecraftArguments) {
        gameArgs = json.minecraftArguments.split(' ').map(a => fill(a, subs));
      } else {
        gameArgs = [];
      }
      // 窗口标题
      gameArgs.push('--width', String(opts.width || 854), '--height', String(opts.height || 480));
      return [...cmd, ...gameArgs];

      function fill(s, m) { return s.replace(/\$\{(\w+)\}/g, (x, k) => (k in m ? m[k] : x)); }
    },

    // 启动游戏（桌面端）
    async launch(id, adapter, gameRoot, opts, onProgress, onLog) {
      if (adapter.platform === 'android') throw new Error('安卓端暂不支持启动游戏，请使用 Windows / macOS 版本');
      const info = await this.install(id, adapter, gameRoot, onProgress);
      const cmd = await this.buildCommand(info, adapter, gameRoot, opts);
      onLog && onLog('$ ' + cmd.join(' '));
      const r = await adapter.spawnGame(cmd, gameRoot);
      return { ...r, cmd };
    }
  };

  function fill(s, m) { return s.replace(/\$\{(\w+)\}/g, (x, k) => (k in m ? m[k] : x)); }
})();
