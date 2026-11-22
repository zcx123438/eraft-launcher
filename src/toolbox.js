// ecraft launcher v2.0 - 工具箱：错误分析 / JAR 完整性检测 / 音乐播放器
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  /* ============ 1. 错误分析 ============ */
  const RULES = [
    {
      id: 'oom', re: /java\.lang\.OutOfMemoryError[:\s]*(Java heap space|Metaspace|unable to create)/i,
      title: '内存不足（OutOfMemoryError）', level: 'high',
      desc: 'Java 分配的内存用完了，游戏运行中被强制终止。',
      fix: '在启动器「主页」把内存滑块调大到 4096~8192 MB；装了大量模组时建议 8192MB。若调大后仍崩溃，说明电脑物理内存不够，请关闭其他程序。'
    },
    {
      id: 'reserve', re: /Could not reserve enough space for (object heap|code cache)/i,
      title: '无法分配内存（32 位 Java 或设置过大）', level: 'high',
      desc: '通常是使用了 32 位 Java，或内存设置超过了系统可用量。',
      fix: '请安装 64 位 Java（Adoptium JDK 17/21），然后把启动器内存设置降到 2048~4096MB。'
    },
    {
      id: 'classver', re: /UnsupportedClassVersionError.*?(\d+\.\d+)/i,
      title: 'Java 版本不匹配', level: 'high',
      desc: '类文件版本过低/过高：当前 Java 无法运行该内容（$1）。',
      fix: 'Minecraft 1.17+ 需要 Java 17+，1.20.5+ 需要 Java 21；旧版本（1.16 及以下）用 Java 8。在「设置」里更换 Java 路径。'
    },
    {
      id: 'opengl', re: /(Pixel format not accelerated|OpenGL|GLX|WGL|Failed to create (OpenGL|window))/i,
      title: '显卡 / OpenGL 初始化失败', level: 'high',
      desc: '显卡驱动过旧、集显卡不支持，或远程/虚拟机环境缺少 OpenGL 支持。',
      fix: '更新显卡驱动到最新；笔记本请在显卡控制面板里把 Minecraft/java 设为使用独立显卡；虚拟机中建议使用 VIRGL 或改用真机。'
    },
    {
      id: 'mixin', re: /(Mixin apply failed|MixinTargetContext|mixin\.transformer|Critical injection failure)/i,
      title: 'Mixin 注入失败（模组冲突）', level: 'medium',
      desc: '两个及以上模组修改了同一段游戏代码，注入时冲突。',
      fix: '按崩溃日志中列出的模组（看 "Mixin ... from mod xxx"）逐个禁用排查；把模组更新到与当前游戏版本匹配的最新版。'
    },
    {
      id: 'dupmod', re: /(Duplicate (mod|module)|Found (duplicate|multiple) versions|duplicate key)/i,
      title: '模组重复安装', level: 'medium',
      desc: '同一个模组装了两份或两个版本（常见于 mods 文件夹）。',
      fix: '打开游戏目录 mods 文件夹，删除同名/同一模组的旧版本文件，只保留一个。'
    },
    {
      id: 'ncdf', re: /(NoClassDefFoundError|NoSuchMethodError|NoSuchFieldError)[:\s]+([\w\/\.\$\u4e00-\u9fa5]+)/i,
      title: '依赖缺失或版本不匹配', level: 'medium',
      desc: '缺少类/方法（$2），一般是模组没装前置、前置版本不对，或模组与游戏版本不符。',
      fix: '查看报错中的 mod id，安装其前置（Fabric 需要 Fabric API；Forge 按模组页面要求），并确认所有模组针对同一 Minecraft 版本。'
    },
    {
      id: 'mainclass', re: /(Could not find or load main class|Error occurred during initialization)/i,
      title: '主类缺失 / 客户端文件损坏', level: 'high',
      desc: '核心 jar 缺失或损坏，游戏根本没能启动。',
      fix: '用「工具箱 → JAR 完整性检测」检查客户端 jar；确认损坏后在启动器「下载」页重新安装该版本。'
    },
    {
      id: 'download', re: /(Failed to download|DownloadException|hash check failed|ETag|checksum)/i,
      title: '资源下载失败 / 文件校验不过', level: 'medium',
      desc: '网络问题导致资源文件下载不完整或损坏。',
      fix: '重试安装该版本（启动器会自动续传缺失文件）；网络不稳定时确认「设置」里开启了 BMCLAPI 镜像。'
    },
    {
      id: 'modsdir', re: /((|Getting|Reading) .*\.(jar|toml)|Exception in thread "main" .* (forge|fabric))/i,
      title: '加载器 / 模组目录问题', level: 'low',
      desc: '加载器读取 mods 目录时出错。',
      fix: '检查 mods 文件夹里是否有非 jar 文件（压缩包没解压完的残留）、损坏的 jar（可用 JAR 检测排查）。'
    },
    {
      id: 'auth', re: /(Invalid session|Failed to verify|authentication|登录|会话)/i,
      title: '登录会话失效', level: 'low',
      desc: '离线模式令牌无效或正版登录过期。',
      fix: '离线模式请确认玩家名不含中文与特殊符号；正版请重新登录微软账号。'
    },
    {
      id: 'exit1', re: /(Process exited with code (1|-1)|Game exited with code)/i,
      title: '游戏异常退出（退出码）', level: 'low',
      desc: '退出码非 0 表示非正常结束，具体原因看日志更早的 Exception。',
      fix: '在上方日志中搜索 "Exception" 或 "ERROR" 找到第一处报错，再粘贴到本工具分析。'
    }
  ];

  $('#btn-analyze').onclick = () => {
    const text = $('#crash-input').value.trim();
    const box = $('#crash-result');
    if (!text) { box.style.display = ''; box.innerHTML = '<div class="dim">请先粘贴日志内容。</div>'; return; }
    const found = [];
    for (const r of RULES) {
      const m = text.match(r.re);
      if (m) found.push({ ...r, match: m });
    }
    // 提取崩溃报告路径与 Java 版本等附加信息
    const extras = [];
    const cr = text.match(/(Crash report saved to[^\n]*|崩溃报告[^\n]*)/i);
    if (cr) extras.push('📄 ' + cr[1]);
    const jv = text.match(/(JVM version|java\.version|Java version)[:= ]+([\d\._]+)/i);
    if (jv) extras.push('☕ 检测到 Java 版本: ' + jv[2]);
    const modcnt = text.match(/(\d+) mods? (were )?loaded/i);
    if (modcnt) extras.push('🧩 已加载模组数量: ' + modcnt[1]);

    const order = { high: 0, medium: 1, low: 2 };
    found.sort((a, b) => order[a.level] - order[b.level]);

    if (!found.length) {
      box.style.display = '';
      box.innerHTML = `<div class="crash-item ok">✅ 未匹配到常见错误特征。<br>
        <span class="dim">可能原因：① 日志里没有关键报错；② 是较少见的问题。建议把完整日志发到社区，或用「JAR 完整性检测」先排除文件损坏。</span></div>
        ${extras.length ? '<div class="crash-item low">' + extras.join('<br>') + '</div>' : ''}`;
      return;
    }
    const LEVEL = { high: ['🔴 严重', 'high'], medium: ['🟠 中等', 'medium'], low: ['🟡 轻微', 'low'] };
    box.style.display = '';
    box.innerHTML = `<div class="crash-sum">共发现 <b>${found.length}</b> 个疑似问题（按严重程度排序）</div>` +
      found.map((f, i) => {
        const [tag, cls] = LEVEL[f.level];
        const desc = f.desc.replace('$1', f.match && f.match[1] || '').replace('$2', f.match && f.match[2] || '');
        return `<div class="crash-item ${cls}">
          <b>${i + 1}. ${tag}｜${f.title}</b>
          <p>${desc}</p>
          <p class="fix">💡 解决方案：${f.fix}</p>
        </div>`;
      }).join('') +
      (extras.length ? `<div class="crash-item low">${extras.join('<br>')}</div>` : '');
  };
  $('#btn-analyze-clear').onclick = () => { $('#crash-input').value = ''; $('#crash-result').style.display = 'none'; };
  $('#crash-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('#crash-input').value = await f.text();
    $('#btn-analyze').click();
  };

  /* ============ 2. JAR 完整性检测 ============ */
  // CRC32 表
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const u16 = (d, o) => d[o] | (d[o + 1] << 8);
  const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const dec = new TextDecoder();

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { return null; }
  }

  function setJarBar(pct) { $('#jar-bar').style.width = pct.toFixed(1) + '%'; }

  $('#jar-file').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    $('#jar-result').style.display = '';
    $('#jar-report').innerHTML = '<div class="dim">正在读取文件…</div>';
    setJarBar(2);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const report = await checkJar(buf, file.name, setJarBar);
      $('#jar-report').innerHTML = renderJarReport(report, file);
    } catch (err) {
      $('#jar-report').innerHTML = `<div class="crash-item high"><b>❌ 无法解析该文件</b><p>${String(err.message || err)}</p>
        <p class="fix">💡 这通常意味着文件根本不是合法的 jar/zip（下载中断或伪造文件）。请删除后重新下载。</p></div>`;
    }
    e.target.value = '';
  };

  async function checkJar(d, name, onProgress) {
    // 1. EOCD
    let eocd = -1;
    for (let i = d.length - 22; i >= Math.max(0, d.length - 66000); i--) {
      if (d[i] === 0x50 && d[i + 1] === 0x4B && d[i + 2] === 0x05 && d[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('找不到 ZIP 结束标记（EOCD）——文件已被截断或不是 ZIP/JAR 格式');
    const entriesCount = u16(d, eocd + 10);
    const cdOffset = u32(d, eocd + 16);
    const isZip64 = entriesCount === 0xFFFF || cdOffset === 0xFFFFFFFF;

    // 2. 遍历中央目录
    const entries = [];
    let p = cdOffset;
    for (let i = 0; i < entriesCount; i++) {
      if (p + 46 > d.length || !(d[p] === 0x50 && d[p + 1] === 0x4B && d[p + 2] === 0x01 && d[p + 3] === 0x02)) {
        return { fatal: `中央目录在第 ${i} 个条目处损坏（期望 PK\\x01\\x02，实际 ${hexAt(d, p)}）`, entries, checked: 0, bad: [] };
      }
      const method = u16(d, p + 10);
      const crc = u32(d, p + 16);
      const csize = u32(d, p + 20);
      const usize = u32(d, p + 24);
      const nameLen = u16(d, p + 28);
      const extraLen = u16(d, p + 30);
      const cmtLen = u16(d, p + 32);
      const lho = u32(d, p + 42);
      const fname = dec.decode(d.subarray(p + 46, p + 46 + nameLen));
      entries.push({ fname, method, crc, csize, usize, lho });
      p += 46 + nameLen + extraLen + cmtLen;
    }

    // 3. 逐条目校验
    const bad = []; let checked = 0; let skipped = 0;
    const canInflate = typeof DecompressionStream !== 'undefined';
    for (const ent of entries) {
      // 本地文件头
      const o = ent.lho;
      if (o + 30 > d.length || !(d[o] === 0x50 && d[o + 1] === 0x4B && d[o + 2] === 0x03 && d[o + 3] === 0x04)) {
        bad.push({ name: ent.fname, why: '本地文件头损坏或偏移错误' });
        continue;
      }
      const lnLen = u16(d, o + 26), leLen = u16(d, o + 28);
      const dataStart = o + 30 + lnLen + leLen;
      if (dataStart + ent.csize > d.length) {
        bad.push({ name: ent.fname, why: '数据超出文件末尾（文件被截断）' });
        continue;
      }
      const data = d.subarray(dataStart, dataStart + ent.csize);
      if (ent.method === 0) {
        if (crc32(data) !== ent.crc) bad.push({ name: ent.fname, why: 'CRC 校验失败（内容损坏）' });
        checked++;
      } else if (ent.method === 8 && canInflate) {
        const raw = await inflateRaw(data);
        if (raw === null) { skipped++; }
        else if (raw.length !== ent.usize || crc32(raw) !== ent.crc) {
          bad.push({ name: ent.fname, why: '解压后 CRC/大小不匹配（内容损坏）' });
        }
        checked++;
      } else {
        skipped++; // 无法解压校验（结构校验已通过）
      }
      onProgress(2 + (checked / entries.length) * 96);
    }

    // 4. 识别类型
    const names = new Set(entries.map(x => x.fname));
    const has = n => names.has(n);
    let kind = '普通 JAR / ZIP';
    if (has('fabric.mod.json')) kind = '🧩 Fabric 模组';
    else if (has('quilt.mod.json')) kind = '🧩 Quilt 模组';
    else if (has('META-INF/mods.toml') || has('META-INF/mods.toml '.trim())) kind = '🧩 Forge 模组（1.13+）';
    else if (has('mcmod.info')) kind = '🧩 Forge 模组（旧版）';
    else if (has('META-INF/MANIFEST.MF')) {
      kind = '📦 标准 JAR（含清单）';
      if ([...names].some(n => n.startsWith('net/minecraft/') || n === 'net/minecraft/client/main/Main.class')) kind = '🎮 Minecraft 客户端';
      else if ([...names].some(n => n.startsWith('org/spongepowered/asm/'))) kind = '🧩 Forge 核心 / ASM 库';
    }
    const manifestOk = has('META-INF/MANIFEST.MF');

    return { entries, checked, bad, skipped, kind, manifestOk, isZip64, fileName: name, totalSize: d.length };
  }

  function hexAt(d, p) {
    if (p + 4 > d.length) return 'EOF';
    return [...d.subarray(p, p + 4)].map(x => x.toString(16).padStart(2, '0')).join(' ');
  }

  function renderJarReport(r, file) {
    const sizeStr = (r.totalSize / 1048576).toFixed(2) + ' MB';
    const head = `
      <table class="jar-table">
        <tr><td>文件</td><td>${r.fileName || file.name}</td></tr>
        <tr><td>大小</td><td>${sizeStr}</td></tr>
        <tr><td>条目数</td><td>${r.entries.length}</td></tr>
        <tr><td>已校验</td><td>${r.checked} 条${r.skipped ? `（${r.skipped} 条跳过深度校验）` : ''}</td></tr>
        <tr><td>识别类型</td><td>${r.kind}</td></tr>
        <tr><td>清单文件</td><td>${r.manifestOk ? '✅ META-INF/MANIFEST.MF 存在' : '⚠️ 缺少 META-INF/MANIFEST.MF'}</td></tr>
      </table>`;
    if (r.fatal) {
      return head + `<div class="crash-item high"><b>❌ 判定：文件已损坏</b><p>${r.fatal}</p>
        <p class="fix">💡 建议：删除该文件并重新下载 / 重新安装对应版本。</p></div>`;
    }
    if (r.bad.length) {
      return head + `<div class="crash-item high"><b>❌ 判定：JAR 已损坏</b>
        <p>发现 ${r.bad.length} 个损坏条目：</p>
        ${r.bad.slice(0, 10).map(b => `<p class="bad-entry">・${b.name} — ${b.why}</p>`).join('')}
        ${r.bad.length > 10 ? `<p class="dim">…等共 ${r.bad.length} 条</p>` : ''}
        <p class="fix">💡 建议：该 jar 会导致启动报错（NoClassDefFoundError / ZipException）。删除后重新下载，或重新安装对应版本。</p></div>`;
    }
    return head + `<div class="crash-item ok"><b>✅ 判定：JAR 完好无损</b>
      <p>ZIP 结构正确、全部条目 CRC 校验通过${r.manifestOk ? '、清单完整' : ''}，可以放心使用。</p>
      ${r.isZip64 ? '<p class="dim">提示：该文件为 ZIP64 格式（超大 jar）。</p>' : ''}</div>`;
  }

  /* ============ 3. 音乐播放器 ============ */
  const audio = $('#music-audio');
  const playlist = []; // {name, url}
  let cur = -1;
  const fmt = s => isNaN(s) ? '00:00' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  $('#music-files').onchange = e => {
    for (const f of e.target.files) playlist.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
    e.target.value = '';
    $('#music-empty-hint').style.display = 'none';
    renderList();
    if (cur < 0) play(0);
  };

  function renderList() {
    const ul = $('#music-list');
    ul.innerHTML = playlist.length ? '' : '<li class="dim">播放列表为空</li>';
    playlist.forEach((t, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="vname">${i === cur ? '▶ ' : ''}${i + 1}. ${t.name}</span>`;
      li.style.cursor = 'pointer';
      li.onclick = () => play(i);
      const del = document.createElement('button');
      del.textContent = '移除';
      del.style.background = '#c33';
      del.onclick = ev => { ev.stopPropagation(); playlist.splice(i, 1); if (i === cur) { cur = -1; audio.pause(); } else if (i < cur) cur--; renderList(); };
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function play(i) {
    if (!playlist.length) return;
    cur = (i + playlist.length) % playlist.length;
    audio.src = playlist[cur].url;
    audio.play();
    $('#music-now').textContent = '🎧 正在播放：' + playlist[cur].name;
    renderList();
  }

  $('#music-play').onclick = () => {
    if (!playlist.length) return;
    if (cur < 0) { play(0); return; }
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  };
  audio.onplay = () => $('#music-play').textContent = '⏸';
  audio.onpause = () => $('#music-play').textContent = '▶';
  audio.onended = () => play(cur + 1);
  $('#music-next').onclick = () => play(cur + 1);
  $('#music-prev').onclick = () => play(cur - 1);
  audio.ontimeupdate = () => {
    if (audio.duration) $('#music-seek').value = (audio.currentTime / audio.duration) * 1000;
    $('#music-time').textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
  };
  $('#music-seek').oninput = e => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; };
  $('#music-vol').oninput = e => audio.volume = e.target.value / 100;
  audio.volume = 0.8;

  // 暴露内部实现（供测试与扩展使用）
  window.ToolboxInternals = { checkJar, crc32, analyzeCrash: (text) => RULES.filter(r => r.re.test(text)).map(r => r.id) };
})();
