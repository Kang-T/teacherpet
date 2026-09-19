#!/usr/bin/env node
// 자동 검증 — 아이들이 실제로 쓰는 그 코드(web/ 빌드)를 헤드리스 크롬으로 연다.
//   npm run check
//
// 왜 이렇게 바꿨나
//   예전에는 Electron 으로 src/renderer/index.html 을 열었다. 화면이 뜨는 창이 필요했기 때문이다
//   (미리보기 탭은 배경이라 rAF 가 멈춰 움직임·클릭 판정을 확인할 수 없다).
//   그런데 이 앱은 웹앱이다. 아이들은 web/ 빌드를 쓰는데 검사는 Electron 경로만 보고 있었다.
//   웹 전용 코드(web-ui.js·서비스 워커·CSP·환영 카드)는 한 번도 검사를 거치지 않았고,
//   실제로 '이어하기/새로 시작' 같은 버그가 전부 그 틈으로 빠져나갔다.
//
//   헤드리스 크롬은 창을 띄우지 않으면서도 진짜 GPU 로 그리고 rAF 가 60fps 로 돈다.
//   새 의존성도 없다 — 크롬에 CDP 로 붙고, Node 22+ 의 내장 WebSocket 을 쓴다.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const probeFile = path.join(__dirname, 'checks.probe.js');

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const guesses = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  for (const g of guesses) if (fs.existsSync(g)) return g;
  // 마지막 수단: 저장소에 이미 있는 Electron 안의 크로미움
  try {
    const e = require(path.join(ROOT, 'node_modules', 'electron'));
    if (e && fs.existsSync(e)) return e;
  } catch (_) { /* 없으면 아래에서 알린다 */ }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(dir, u === '/' ? 'index.html' : u);
      if (!f.startsWith(dir)) { rep.writeHead(403).end(); return; }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

// ── CDP (크롬 개발자 도구 프로토콜) — 의존성 없이 ──
function connect(url) {
  return new Promise((res, rej) => {
    const sock = new WebSocket(url);
    let id = 0; const waiting = new Map(); const logs = [];
    sock.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && waiting.has(m.id)) {
        const w = waiting.get(m.id); waiting.delete(m.id);
        m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
        return;
      }
      // 페이지에서 난 오류를 모은다 — 웹 전용 코드가 터지면 여기 찍힌다
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params && m.params.exceptionDetails;
        logs.push(String((d && (d.exception && d.exception.description)) || (d && d.text) || '오류'));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        logs.push((m.params.args || []).map((a) => a.description || a.value).join(' '));
      }
    });
    sock.addEventListener('error', rej);
    sock.addEventListener('open', () => res({
      logs,
      send: (method, params, sessionId) => new Promise((r2, j2) => {
        const n = ++id; waiting.set(n, { res: r2, rej: j2 });
        sock.send(JSON.stringify({ id: n, method, params: params || {}, sessionId }));
      }),
      close: () => sock.close(),
    }));
  });
}

(async () => {
  // 1) 아이들이 받는 그 빌드를 새로 만든다
  const built = spawnSync(process.execPath, [path.join(__dirname, 'build-web.js')], { cwd: ROOT, encoding: 'utf8' });
  if (built.status !== 0) { console.error('web 빌드 실패\n' + (built.stderr || built.stdout)); process.exit(2); }

  const exe = chromePath();
  if (!exe) {
    console.error('크롬을 찾지 못했습니다. CHROME_PATH 환경변수로 알려 주세요.');
    process.exit(2);
  }

  const { srv, port } = await serve(WEB);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'teacherpet-chrome-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--window-size=900,1200',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ];
  if (process.env.CI) args.unshift('--no-sandbox', '--disable-dev-shm-usage');
  const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeErr = '';
  child.stderr.on('data', (d) => { chromeErr += d; });

  const cleanup = () => {
    try { child.kill(); } catch (_) {}
    try { srv.close(); } catch (_) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  };
  const die = (code, msg) => { if (msg) console.error(msg); cleanup(); process.exit(code); };
  const timer = setTimeout(() => die(2, '시간 초과 — 크롬을 종료합니다'), 300000);

  // 2) 디버깅 포트를 기다린다
  const portFile = path.join(profile, 'DevToolsActivePort');
  let wsUrl = null;
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (fs.existsSync(portFile)) {
      const [p, sub] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      wsUrl = `ws://127.0.0.1:${p}${sub}`;
      break;
    }
  }
  if (!wsUrl) die(2, '크롬 디버깅 포트를 못 찾았습니다.\n' + chromeErr.slice(-1200));

  const cdp = await connect(wsUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  await S('Runtime.enable');
  await S('Page.enable');

  // 3) 깨끗한 상태로 시작한다 — 환영 카드를 건너뛰고, 안내는 '혼자 할래요'
  await S('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        localStorage.setItem('teacherpet.welcomed', '1');
        localStorage.setItem('teacherpet.state.v1', JSON.stringify({
          version: 7, flock: [], basket: 0, coins: 0, album: [], away: [],
          feed: 100, water: 100, worms: 9, bedding: 100, poops: [], ammonia: 0,
          chapter: 4, onboarded: true, borrowed: null, lampPower: 1,
          settings: { size: 4, sound: false, guide: 'alone', detail: true, useCalendar: false, zoom: 1, elev: 24 },
          openedDays: [], lastSeen: Date.now(),
        }));
      } catch (e) {}
    `,
  });

  await S('Page.navigate', { url: `http://127.0.0.1:${port}/` });

  // 4) 앱이 준비될 때까지 (검사 훅이 생길 때까지)
  const ev = async (expression, awaitPromise) => {
    const r = await S('Runtime.evaluate', { expression, awaitPromise: !!awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
  // ⚠️ 서비스 워커가 처음 설치되면 sw-reg.js 가 페이지를 한 번 새로고침한다.
  //    그 전에 검사를 시작하면 실행 중이던 것이 통째로 날아간다
  //    ("Inspected target navigated or closed"). 새로고침이 끝난 뒤에 시작한다.
  let ready = false;
  const hooksUp = '!!(window.__tpTest && window.__tp && window.TP && window.TP.weather)';
  const swSettled = '(!("serviceWorker" in navigator) || !!navigator.serviceWorker.controller)';
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const st = await ev(`[${hooksUp}, ${swSettled}]`);
      if (st && st[0] && st[1]) { ready = true; break; }
      // 워커가 끝내 안 잡히면(파일이 없거나 등록 실패) 훅만 보고 진행한다
      if (st && st[0] && i > 90) { ready = true; break; }
    } catch (_) { /* 새로고침 중이거나 아직 로딩 */ }
  }
  if (!ready) die(2, '앱이 준비되지 않았습니다.\n페이지 오류: ' + cdp.logs.slice(0, 6).join('\n'));
  await new Promise((r) => setTimeout(r, 1500));          // 첫 장면이 자리를 잡게

  // 5) 검사 본체
  const code = fs.readFileSync(probeFile, 'utf8');
  let res;
  try { res = await ev(code, true); }
  catch (e) { die(2, '검사 중 오류: ' + String(e && e.message || e)); }
  if (res && res.fatal) die(2, '검사 중 오류: ' + res.fatal);

  clearTimeout(timer);

  // 6) 페이지에서 난 오류도 결과에 넣는다 — 웹 전용 코드가 터지면 여기서 잡힌다
  const noise = /favicon|DevTools|Download the React|ServiceWorker registration|sw\.js/i;
  const errs = cdp.logs.filter((l) => l && !noise.test(l));
  res.push({ name: '페이지에서 난 오류가 없다', pass: errs.length === 0, detail: errs.length ? errs[0].slice(0, 150) : '' });

  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  let bad = 0;
  console.log('');
  for (const r of res) {
    if (!r.pass) bad++;
    console.log(`  ${r.pass ? '✅' : '❌'}  ${pad(r.name, 34)}  ${r.detail}`);
  }
  console.log('');
  console.log(bad === 0 ? `  전부 통과 (${res.length}개)` : `  ❌ ${bad}개 실패 / ${res.length}개`);
  console.log('');
  cleanup();
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error('검사기 오류: ' + (e && e.stack || e)); process.exit(2); });
