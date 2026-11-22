// ecraft launcher - 平台适配层
// 在 Electron 渲染进程（nodeIntegration）与 Capacitor/浏览器（安卓 WebView）之间统一能力
(function () {
  const isElectron = !!(window.process && window.process.versions && window.process.versions.node);

  if (isElectron) {
    const fs = require('fs');
    const fsp = require('fs/promises');
    const path = require('path');
    const crypto = require('crypto');

    window.ECraftAdapter = {
      kind: 'electron',
      platform: window.process.platform, // win32 | darwin | linux
      sep: path.sep,
      join: (...p) => path.join(...p),
      dirname: path.dirname,
      async getEnv() {
        return await window.ecNative.invoke('ec:platform');
      },
      async ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); },
      async exists(p) { try { await fsp.access(p); return true; } catch { return false; } },
      async writeFile(p, data) {
        await this.ensureDir(path.dirname(p));
        await fsp.writeFile(p, data);
      },
      async writeText(p, text) { await this.writeFile(p, Buffer.from(text, 'utf-8')); },
      async readFile(p) { return await fsp.readFile(p); },
      async readText(p) { return await fsp.readFile(p, 'utf-8'); },
      async readJSON(p) { return JSON.parse(await fsp.readFile(p, 'utf-8')); },
      async writeJSON(p, obj) { await this.writeText(p, JSON.stringify(obj, null, 2)); },
      async listDir(p) {
        try {
          const items = await fsp.readdir(p, { withFileTypes: true });
          return items.filter(i => i.isDirectory()).map(i => i.name);
        } catch { return []; }
      },
      async unzipJar(jarPath, destDir) { await this._unzip(jarPath, destDir); },
      async _unzip(jarPath, destDir) {
        // 简易 zip 提取（JAR = ZIP），用于 natives
        const { execSync } = require('child_process');
        await this.ensureDir(destDir);
        if (this.platform === 'win32') {
          const ps = `Expand-Archive -Force -LiteralPath '${jarPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}'`;
          execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore' });
        } else {
          execSync(`unzip -o -q '${jarPath.replace(/'/g, `'\\''`)}' -d '${destDir.replace(/'/g, `'\\''`)}'`, { stdio: 'ignore' });
        }
      },
      async md5hex(str) {
        return crypto.createHash('md5').update(str, 'utf8').digest('hex');
      },
      async fetchBuf(url, onChunk) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        const total = Number(res.headers.get('content-length')) || 0;
        const reader = res.body.getReader();
        const chunks = []; let got = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (onChunk && total) onChunk(got, total);
        }
        return Buffer.concat(chunks);
      },
      async pickJava() { return await window.ecNative.invoke('ec:pick-java'); },
      async spawnGame(cmd, cwd) { return await window.ecNative.invoke('ec:spawn', { cmd, cwd }); },
      onGameLog(cb) { window.ecNative.on('ec:game-log', d => cb(String(d))); },
      onGameExit(cb) { window.ecNative.on('ec:game-exit', code => cb(code)); },
      win(action) { if (window.ecNative) window.ecNative.invoke('ec:window', action); },
      reveal(p) { return window.ecNative.invoke('ec:reveal', p); }
    };
  } else {
    // 安卓 / 浏览器：使用 Capacitor Filesystem 插件
    const Cap = () => window.Capacitor && window.Capacitor.Plugins;
    const FS = () => { const p = Cap().Filesystem; if (!p) throw new Error('Filesystem 插件不可用'); return p; };
    const BASE = '.minecraft'; // 应用专属外部存储根（引擎 DIR_GAME_HOME）下的 .minecraft 目录

    window.ECraftAdapter = {
      kind: 'web',
      platform: 'android',
      sep: '/',
      join: (...p) => p.join('/').replace(/\/+/g, '/'),
      dirname: p => p.split('/').slice(0, -1).join('/'),
      async getEnv() {
        return { platform: 'android', isElectron: false, home: '/data', gameRoot: BASE };
      },
      async ensureDir(dir) {
        const rel = dir.startsWith(BASE + '/') ? dir.slice(BASE.length + 1) : dir;
        try { await FS().mkdir({ path: rel, directory: 'EXTERNAL', recursive: true }); } catch (e) { /* 已存在 */ }
      },
      async exists(p) {
        const rel = p.startsWith(BASE + '/') ? p.slice(BASE.length + 1) : p;
        try { await FS().stat({ path: rel, directory: 'EXTERNAL' }); return true; } catch { return false; }
      },
      async writeFile(p, data) {
        const rel = p.startsWith(BASE + '/') ? p.slice(BASE.length + 1) : p;
        const b64 = (window.bufToB64 = window.bufToB64 || ((u8) => {
          let s = ''; const CH = 0x8000;
          for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
          return btoa(s);
        }));
        const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        await this.ensureDir(this.dirname(p));
        await FS().writeFile({ path: rel, directory: 'EXTERNAL', data: b64(u8) });
      },
      async writeText(p, t) { await this.writeFile(p, new TextEncoder().encode(t)); },
      async readFile(p) {
        const rel = p.startsWith(BASE + '/') ? p.slice(BASE.length + 1) : p;
        const r = await FS().readFile({ path: rel, directory: 'EXTERNAL' });
        const bin = atob(r.data);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
      },
      async readText(p) {
        const u8 = await this.readFile(p);
        return new TextDecoder().decode(u8);
      },
      async readJSON(p) { return JSON.parse(await this.readText(p)); },
      async writeJSON(p, o) { await this.writeText(p, JSON.stringify(o, null, 2)); },
      async listDir(p) {
        const rel = p.startsWith(BASE + '/') ? p.slice(BASE.length + 1) : p;
        try {
          const r = await FS().readdir({ path: rel, directory: 'EXTERNAL' });
          return (r.files || []).filter(f => f.type === 'directory').map(f => f.name);
        } catch { return []; }
      },
      async unzipJar() { /* 安卓端暂不支持启动，无需提取 natives */ },
      async md5hex(str) {
        // 离线 UUID 用：MD5（Capacitor 环境无 crypto 原生 md5，用纯 JS 实现）
        return window.jsMd5(str);
      },
      async fetchBuf(url, onChunk) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        const total = Number(res.headers.get('content-length')) || 0;
        const reader = res.body.getReader();
        const chunks = []; let got = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (onChunk && total) onChunk(got, total);
        }
        const all = new Uint8Array(got);
        let off = 0;
        for (const c of chunks) { all.set(c, off); off += c.length; }
        return all;
      },
      async pickJava() { return null; },
      async spawnGame(versionId, username) {
        // 走原生引擎（Pojav 内核）启动游戏
        const g = Cap().EcraftGame;
        if (!g) throw new Error('原生游戏引擎不可用（请更新安装包）');
        return await g.launch({ versionId, username: username || 'Steve' });
      },
      async gameDir() {
        const g = Cap().EcraftGame;
        if (!g) return null;
        try { return (await g.gameDir()).path; } catch { return null; }
      },
      onGameLog() {}, onGameExit() {},
      win() {}, reveal() {}
    };
  }
})();
