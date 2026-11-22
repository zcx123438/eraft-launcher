// ecraft launcher - 界面控制器
(function () {
  const A = window.ECraftAdapter;
  const C = window.ECraftCore;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let env = null;
  let allVersions = null;
  let installed = [];
  let launching = false;

  if (A.kind !== 'electron') document.body.classList.add('web');

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  function setProgress(title, done, total, text) {
    $('#progress-card').style.display = '';
    $('#progress-title').textContent = title;
    const pct = total ? Math.min(100, (done / total) * 100) : 0;
    $('#bar-fill').style.width = pct.toFixed(1) + '%';
    $('#progress-text').textContent = text || '';
  }

  function hideProgress() { $('#progress-card').style.display = 'none'; }

  // ---------- 设置 ----------
  const SKEY = 'ecraft-settings';
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; }
  }
  function saveSettings(s) { localStorage.setItem(SKEY, JSON.stringify(s)); }

  // ---------- 导航 ----------
  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.page').forEach(p => p.classList.remove('active'));
    $('#page-' + btn.dataset.page).classList.add('active');
  }));

  // 标题栏
  $('#tb-min').onclick = () => A.win('minimize');
  $('#tb-max').onclick = () => A.win('maximize');
  $('#tb-close').onclick = () => A.win('close');

  // 内存滑块
  $('#memory').addEventListener('input', e => {
    $('#memory-label').textContent = e.target.value + ' MB';
  });

  // ---------- 已安装版本 ----------
  async function refreshInstalled() {
    const vdir = A.join(env.gameRoot, 'versions');
    installed = await A.listDir(vdir);
    const ul = $('#installed-list');
    ul.innerHTML = '';
    if (!installed.length) {
      ul.innerHTML = '<li class="dim">还没有安装版本，去「下载」页安装一个吧。</li>';
    } else {
      for (const v of installed.sort()) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="vname">${v}<span class="tag">已安装</span></span>`;
        ul.appendChild(li);
      }
    }
    // 同步到主页下拉框
    const sel = $('#version-select');
    sel.innerHTML = installed.length
      ? installed.slice().sort().map(v => `<option value="${v}">${v}</option>`).join('')
      : '<option value="">（请先在「下载」页安装版本）</option>';
    const s = loadSettings();
    if (s.lastVersion && installed.includes(s.lastVersion)) sel.value = s.lastVersion;
  }

  // ---------- 版本清单 / 下载页 ----------
  let currentTab = 'release';
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    currentTab = t.dataset.tab;
    renderDlList();
  }));

  function renderDlList() {
    const ul = $('#dl-list');
    if (!allVersions) return;
    const list = allVersions[currentTab] || [];
    ul.innerHTML = '';
    for (const v of list.slice(0, 200)) {
      const li = document.createElement('li');
      const tagTxt = v.id === (allVersions.latest && allVersions.latest.release) ? '最新'
        : v.id === (allVersions.latest && allVersions.latest.snapshot) ? '最新快照' : '';
      li.innerHTML = `<span class="vname">${v.id}${tagTxt ? `<span class="tag">${tagTxt}</span>` : ''}</span>
        <span class="dim">${v.releaseTime ? v.releaseTime.slice(0, 10) : ''}</span>`;
      const btn = document.createElement('button');
      btn.textContent = '安装';
      btn.onclick = () => installVersion(v.id, btn);
      li.appendChild(btn);
      ul.appendChild(li);
    }
  }

  async function loadVersions() {
    try {
      allVersions = await C.getVersions();
      $('#mirror-tag').textContent = C.mirrorEnabled ? '镜像：BMCLAPI' : '下载源：Mojang 官方';
      renderDlList();
    } catch (e) {
      $('#dl-list').innerHTML = `<li class="dim">版本清单获取失败：${e.message}</li>`;
    }
  }

  async function installVersion(id, btn) {
    btn.disabled = true;
    btn.textContent = '下载中…';
    try {
      await C.install(id, A, env.gameRoot, p => {
        setProgress(p.stage, p.done, p.total, p.text);
      });
      toast(`版本 ${id} 安装完成！`);
      hideProgress();
      await refreshInstalled();
      $('#version-select').value = id;
      saveSettings({ ...loadSettings(), lastVersion: id });
    } catch (e) {
      toast('安装失败：' + e.message, 4000);
      setProgress('失败', 0, 1, e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '安装';
    }
  }

  // ---------- 启动 ----------
  $('#btn-launch').onclick = async () => {
    if (launching) return;
    const id = $('#version-select').value;
    if (!id) { toast('请先安装一个版本（去「下载」页）'); return; }
    launching = true;
    $('#btn-launch').disabled = true;
    $('#log-card').style.display = '';
    $('#log').textContent = '';
    const s = loadSettings();
    const username = $('#username').value.trim() || 'Steve';
    const opts = {
      username,
      javaPath: s.javaPath || '',
      memoryMB: Number($('#memory').value) || 2048
    };
    saveSettings({ ...s, lastVersion: id, username });
    try {
      if (A.platform === 'android' && A.spawnGame && !A.isElectron) {
        // 安卓端：交给原生引擎（Pojav 内核）渲染启动
        hideProgress();
        setProgress('正在进入游戏', 1, 1, '引擎启动中，请稍候…');
        await A.spawnGame(id, username);
        toast(`游戏启动中（${username}）`);
      } else {
        await C.launch(id, A, env.gameRoot, opts,
          p => setProgress('启动准备 · ' + p.stage, p.done, p.total, p.text),
          line => { $('#log').textContent += line + '\n'; $('#log').scrollTop = 1e9; }
        );
        toast(`游戏已启动（${username}）`);
        hideProgress();
        setProgress('游戏运行中', 1, 1, 'Minecraft 窗口应已弹出');
      }
    } catch (e) {
      toast('启动失败：' + e.message, 5000);
      $('#log').textContent += '[错误] ' + e.message + '\n';
    } finally {
      launching = false;
      $('#btn-launch').disabled = false;
    }
  };

  $('#btn-refresh').onclick = async () => { await loadVersions(); await refreshInstalled(); toast('已刷新'); };

  A.onGameLog && A.onGameLog(d => {
    $('#log-card').style.display = '';
    $('#log').textContent += d + '\n';
    $('#log').scrollTop = 1e9;
  });
  A.onGameExit && A.onGameExit(code => {
    setProgress('游戏已退出', 1, 1, '退出码 ' + code);
    $('#log').textContent += `\n[进程退出，退出码 ${code}]\n`;
  });

  // ---------- 设置页 ----------
  $('#btn-pick-java').onclick = async () => {
    const p = await A.pickJava();
    if (p) $('#set-java').value = p;
  };
  $('#btn-open-dir').onclick = () => A.reveal(env.gameRoot);
  $('#btn-save').onclick = () => {
    const s = loadSettings();
    s.username = $('#set-username').value.trim() || 'Steve';
    s.javaPath = $('#set-java').value.trim();
    s.mirror = $('#set-mirror').checked;
    saveSettings(s);
    C.mirrorEnabled = s.mirror;
    $('#username').value = s.username;
    toast('设置已保存');
    loadVersions();
  };

  // ---------- 初始化 ----------
  (async function init() {
    env = await A.getEnv();
    const s = loadSettings();
    C.mirrorEnabled = s.mirror !== false;
    $('#set-mirror').checked = C.mirrorEnabled;
    $('#set-gamedir').value = env.gameRoot;
    $('#username').value = s.username || 'Steve';
    $('#set-username').value = s.username || 'Steve';
    $('#set-java').value = s.javaPath || '';
    if (env.platform !== 'win32' && !s.javaPath) {
      $('#java-hint').textContent = '提示：macOS 可执行 brew install openjdk@17，或留空使用系统 java（需 Java 8+）';
    }
    await refreshInstalled();
    await loadVersions();
    if (A.kind === 'web') {
      const li = document.createElement('li');
      // 安卓端提示
      toast('安卓版：支持浏览与下载管理，游戏启动请使用 Windows / macOS 版');
    }
  })();
})();
