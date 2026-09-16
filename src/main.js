// 티처펫 — 메인 프로세스
// 투명·프레임 없는 창을 바탕화면 작업영역 전체에 깔고, 펫 위에 마우스가 있을 때만 클릭을 받는다.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 중복 실행 방지 — 두 번 켜면 기존 창을 앞으로
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// 테스트용: 저장 위치를 바꿔서 실제 데이터와 섞이지 않게 한다
if (process.env.TEACHERPET_USERDATA) app.setPath('userData', process.env.TEACHERPET_USERDATA);

let win = null;
let tray = null;
const statePath = () => path.join(app.getPath('userData'), 'state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('state save failed', e);
    return false;
  }
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function createWindow() {
  const wa = workArea();
  win = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 기본은 클릭 통과. 렌더러가 펫/UI 위에 마우스가 있을 때만 끈다.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // 디버그: 환경변수로 지정한 경로에 몇 초 뒤 화면을 저장 (맥에서 자동 검증용)
  const shot = process.env.TEACHERPET_SHOT;
  if (shot) {
    win.webContents.on('console-message', (_e, level, msg, line, src) => { if (level >= 2) console.log(`[renderer:${level}] ${msg} (${src.split('/').pop()}:${line})`); });
    const delay = Number(process.env.TEACHERPET_SHOT_DELAY || 4000);
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(shot, img.toPNG());
        console.log('shot saved', shot);
      } catch (e) {
        console.error('shot failed', e);
      }
      if (process.env.TEACHERPET_SHOT_QUIT) app.quit();
    }, delay);
  }

  // 해상도·작업표시줄이 바뀌면 창을 다시 맞춘다
  const refit = () => {
    if (!win) return;
    const a = workArea();
    win.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height });
    win.webContents.send('work-area', a);
  };
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);

  win.on('closed', () => { win = null; });
}

function createTray() {
  const iconFile = process.platform === 'win32' ? 'tray.png' : 'trayTemplate.png';
  let icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', iconFile));
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('티처펫');
  rebuildTrayMenu();
  tray.on('click', () => send('ui:toggle-menu'));
}

function rebuildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings();
  const menu = Menu.buildFromTemplate([
    { label: '펫 메뉴 열기', click: () => send('ui:toggle-menu') },
    { type: 'separator' },
    { label: '수업 시작 (타이머)', click: () => send('timer:start', 'class') },
    { label: '쉬는 시간 시작', click: () => send('timer:start', 'break') },
    { label: '타이머 정지', click: () => send('timer:stop') },
    { type: 'separator' },
    {
      label: '펫 크기',
      submenu: [
        { label: '작게', click: () => send('pet:size', 3) },
        { label: '보통', click: () => send('pet:size', 4) },
        { label: '크게 (전자칠판)', click: () => send('pet:size', 6) },
      ],
    },
    { label: '펫 숨기기/보이기', click: () => send('pet:toggle-visible') },
    { type: 'separator' },
    {
      label: '컴퓨터 켤 때 자동 실행',
      type: 'checkbox',
      checked: login.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath });
      },
    },
    { label: '도움말 (GitHub)', click: () => shell.openExternal('https://github.com/Kang-T/teacherpet#readme') },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function send(ch, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(ch, payload);
}

// ---- IPC ----
ipcMain.handle('state:load', () => loadState());
ipcMain.handle('state:save', (_e, s) => saveState(s));
ipcMain.handle('work-area', () => workArea());
ipcMain.on('mouse:ignore', (_e, ignore) => {
  if (!win) return;
  win.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  openAtLogin: app.getLoginItemSettings().openAtLogin,
}));
ipcMain.on('app:set-autostart', (_e, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath });
  rebuildTrayMenu();
});

app.on('second-instance', () => {
  if (win) { win.show(); send('ui:toggle-menu'); }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => app.quit());
