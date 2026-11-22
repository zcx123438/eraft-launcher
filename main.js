// ecraft launcher - Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');

let win = null;

function gameRoot() {
  // 游戏根目录：便携模式下为 exe 旁的 .minecraft，否则用用户目录
  const portable = path.join(path.dirname(app.getPath('exe')), '.ecraft');
  try {
    fs.mkdirSync(portable, { recursive: true });
    return portable;
  } catch (e) {
    return path.join(os.homedir(), '.ecraft');
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 640,
    minWidth: 860,
    minHeight: 560,
    frame: false,
    backgroundColor: '#f3f4f8',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---------- IPC ----------
ipcMain.handle('ec:platform', () => ({
  platform: process.platform, // win32 / darwin / linux / android 由渲染端判断
  isElectron: true,
  home: os.homedir(),
  gameRoot: gameRoot()
}));

ipcMain.handle('ec:window', (e, action) => {
  if (!win) return;
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === 'close') win.close();
});

ipcMain.handle('ec:pick-java', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '选择 Java (java/javaw 可执行文件)',
    properties: ['openFile'],
    filters: [{ name: 'Java', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('ec:reveal', async (e, p) => {
  if (p && fs.existsSync(p)) shell.openPath(p);
});

// 启动游戏进程（桌面端独占能力）
ipcMain.handle('ec:spawn', async (e, opts) => {
  const { cmd, cwd } = opts;
  const bin = process.platform === 'win32' ? cmd[0].replace(/java$/i, 'javaw') : cmd[0];
  const child = spawn(bin, cmd.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; if (out.length > 100000) out = out.slice(-50000); });
  child.stderr.on('data', d => { out += d; if (out.length > 100000) out = out.slice(-50000); });
  win.webContents.send('ec:game-log', out.slice(-4000));
  const timer = setInterval(() => win.webContents.send('ec:game-log', out.slice(-4000)), 1500);
  child.on('close', code => {
    clearInterval(timer);
    win.webContents.send('ec:game-exit', code);
  });
  return { pid: child.pid };
});
