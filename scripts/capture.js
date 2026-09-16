// 개발용: HTML을 열어 PNG로 저장. npx electron scripts/capture.js <html> <png> [w] [h]
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const [,, html, out, w = 1400, h = 820] = process.argv;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.resolve(html));
  await new Promise((r) => setTimeout(r, 800));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG()); console.log('saved', out); app.quit();
});
