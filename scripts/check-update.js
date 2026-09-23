#!/usr/bin/env node
// 업데이트 검사 — 새 버전을 올렸을 때 아이 기기에 '새 것만' 깔리는가
//   npm run check:update
//
// 왜 필요한가
//   선생님이 "업데이트할 때마다 병아리나 기능이 화면 아래에 붙어 있다"고 알려 왔다.
//   GitHub Pages 는 파일마다 '10분 동안은 다시 묻지 말고 쓰라'(max-age=600)고 알려 준다.
//   서비스 워커가 새 버전을 받을 때 이 브라우저 임시 저장본을 그대로 가져오면,
//   새 HTML 에 옛 CSS·JS 가 섞인다. 새로 생긴 창·단추는 모양이 없어 화면 맨 아래에 쌓이고,
//   다음 배포 때까지 그대로 남는다.
//
// 여기서는 그 상황을 그대로 만든다 — GitHub Pages 와 같은 캐시 헤더로 옛 판을 한 번 열고,
// 파일을 새 판으로 바꾼 뒤 다시 열어, 서비스 워커 캐시에 새 판이 들어갔는지 본다.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const built = spawnSync(process.execPath, [path.join(__dirname, 'build-web.js')], { cwd: ROOT, encoding: 'utf8' });
  if (built.status !== 0) { console.error(built.stderr || built.stdout); process.exit(2); }
  if (!chrome) { console.error('크롬을 찾지 못했습니다 (CHROME_PATH)'); process.exit(2); }

  // 옛 판(A)을 임시 폴더에 두고 GitHub Pages 처럼 서빙한다
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-site-'));
  fs.cpSync(WEB, site, { recursive: true });
  const srv = http.createServer((req, rep) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(site, u === '/' ? 'index.html' : u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(site, 'index.html');
    rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    fs.createReadStream(f).pipe(rep);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/`;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-upd-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
  if (process.env.CI) args.unshift('--no-sandbox', '--disable-dev-shm-usage');
  const child = spawn(chrome, args, { stdio: 'ignore' });
  const done = (code, msg) => { if (msg) console.log(msg); try { child.kill(); } catch (_) {} srv.close(); setTimeout(() => { for (const d of [profile, site]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } process.exit(code); }, 400); };
  setTimeout(() => done(2, '시간 초과'), 180000);

  let ws = null;
  for (let i = 0; i < 150 && !ws; i++) {
    await sleep(100);
    const pf = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(pf)) { const [p, sub] = fs.readFileSync(pf, 'utf8').trim().split('\n'); ws = `ws://127.0.0.1:${p}${sub}`; }
  }
  if (!ws) done(2, '크롬 디버깅 포트를 못 찾았습니다');
  const sock = new WebSocket(ws);
  await new Promise((r) => sock.addEventListener('open', r));
  let id = 0; const wait = new Map();
  sock.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  const send = (method, params, sessionId) => new Promise((r) => { const n = ++id; wait.set(n, r); sock.send(JSON.stringify({ id: n, method, params: params || {}, sessionId })); });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
  await S('Page.enable'); await S('Runtime.enable');

  // 1) 옛 판을 연다 — 서비스 워커가 옛 판을 캐시한다 (첫 방문)
  await S('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { await sleep(200); if (await ev('!!(navigator.serviceWorker && navigator.serviceWorker.controller)')) break; }
  const keysA = await ev('caches.keys()');

  // 2) 새 판(B)을 올린다 — 같은 주소의 파일 내용만 바뀐다 (실제 배포와 같다)
  const MARK = '/* 새판-' + Date.now() + ' */';
  fs.appendFileSync(path.join(site, 'style.css'), '\n' + MARK + '\n');
  fs.appendFileSync(path.join(site, 'app.js'), '\n' + MARK + '\n');
  const swf = path.join(site, 'sw.js');
  fs.writeFileSync(swf, fs.readFileSync(swf, 'utf8').replace(/const CACHE = '([^']+)'/, "const CACHE = '$1-B'"));

  // 3) 아이가 다음 날 다시 연다 — 새 서비스 워커가 설치되고 한 번 새로고침된다
  await S('Page.navigate', { url });
  let keysB = null;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    try { keysB = await ev('caches.keys()'); } catch (_) {}
    if (keysB && keysB.some((k) => k.endsWith('-B'))) break;
  }
  await sleep(1500);
  const got = await ev(`(async () => {
    const k = (await caches.keys()).find((x) => x.endsWith('-B'));
    if (!k) return { cache: null };
    const c = await caches.open(k);
    const css = await (await c.match('./style.css')).text();
    const js = await (await c.match('./app.js')).text();
    return { cache: k, css: css.includes(${JSON.stringify(MARK)}), js: js.includes(${JSON.stringify(MARK)}) };
  })()`);

  const ok = got && got.cache && got.css && got.js;
  console.log(`  ${ok ? '✅' : '❌'}  새 버전을 올리면 새 파일만 캐시된다 (옛 CSS·JS 가 섞이지 않는다)`);
  console.log(`      옛 캐시 ${JSON.stringify(keysA)} → 새 캐시 ${got && got.cache} · style.css 새 판 ${got && got.css} · app.js 새 판 ${got && got.js}`);
  done(ok ? 0 : 1);
})();
