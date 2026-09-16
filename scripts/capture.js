// 개발용: HTML을 열어 PNG로 저장. npx electron scripts/capture.js <html> <png> [w] [h]
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const [,, html, out, w = 1400, h = 820] = process.argv;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, msg, line, src) => console.log(`[console:${level}] ${msg} (${src.split('/').pop()}:${line})`));
  await win.loadURL('file://' + path.resolve(html.split('?')[0]) + (html.includes('?') ? '?' + html.split('?')[1] : ''));
  await new Promise((r) => setTimeout(r, 800));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG()); console.log('saved', out); app.quit();
});
