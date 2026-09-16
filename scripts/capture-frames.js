// 개발용: 페이지를 열어 연속 프레임 캡처. npx electron scripts/capture-frames.js <html> <outdir> [frames] [intervalMs] [w] [h]
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const [,, html, outdir, frames = 60, interval = 100, w = 900, h = 600] = process.argv;
app.whenReady().then(async () => {
  fs.mkdirSync(outdir, { recursive: true });
  const win = new BrowserWindow({ width: +w, height: +h, show: false, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (_e, level, msg, line, src) => console.log(`[console:${level}] ${msg} (${src.split('/').pop()}:${line})`));
  await win.loadURL('file://' + path.resolve(html.split('?')[0]) + (html.includes('?') ? '?' + html.split('?')[1] : ''));
  await new Promise((r) => setTimeout(r, 600));
  const times = []; const t0 = Date.now();
  for (let i = 0; i < +frames; i++) {
    times.push(Date.now() - t0);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outdir, `f${String(i).padStart(3, '0')}.png`), img.toPNG());
    await new Promise((r) => setTimeout(r, +interval));
  }
  fs.writeFileSync(path.join(outdir, 'times.json'), JSON.stringify(times));
  console.log('captured', frames); app.quit();
});
