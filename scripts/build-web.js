// 티처펫 웹 빌드 — 렌더러를 그대로 가져다 web/ 에 정적 사이트로 만든다.
// 렌더러 코드는 손대지 않는다. Electron 자리에 web/shim.js 를 끼울 뿐이다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'renderer');
const WEB = path.join(ROOT, 'src', 'web');
const OUT = path.join(ROOT, 'web');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function copyDir(from, to, skip = []) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(SRC, OUT, ['assets']);                      // 2D 잔재 이미지는 웹에 싣지 않는다
fs.copyFileSync(path.join(WEB, 'shim.js'), path.join(OUT, 'shim.js'));
fs.copyFileSync(path.join(WEB, 'web.css'), path.join(OUT, 'web.css'));

// ---- index.html 을 웹용으로 ----
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">',
  '<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="web.css">\n<link rel="manifest" href="manifest.json">\n<meta name="theme-color" content="#8FC7F5">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
// CSP: 웹에서는 manifest/이미지가 필요하다
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'self\'">');
// shim 을 three 보다 먼저
// CSP(default-src 'self')에서는 인라인 스크립트가 막힌다 — 전부 외부 파일로
fs.writeFileSync(path.join(OUT, 'boot.js'), `window.__TP_VERSION=${JSON.stringify(pkg.version)};\n`);
html = html.replace('<script src="vendor/three.global.js"></script>',
  '<script src="boot.js"></script>\n<script src="shim.js"></script>\n<script src="vendor/three.global.js"></script>');
// 화면 버튼 + 환영 카드 + 구름
html = html.replace('<div id="stageHost"></div>', `<div id="stageHost"></div>
<div id="clouds"></div>
<div id="webbar">
  <button id="wbMenu" title="닭장 열기">🐔 닭장</button>
  <span class="sep"></span>
  <button data-size="3" title="작게">작게</button>
  <button data-size="4" title="보통">보통</button>
  <button data-size="6" title="크게">크게</button>
  <span class="sep"></span>
  <button id="wbExport" title="이 반의 닭들을 파일로 내보내기">내보내기</button>
  <button id="wbImport" title="파일에서 불러오기">불러오기</button>
  <input type="file" id="wbFile" accept="application/json" hidden>
</div>
<div id="welcome">
  <h2>🐣 티처펫</h2>
  <p>알에서 시작해 병아리 · 어린닭 · 암탉과 수탉까지,<br>닭의 한살이를 우리 반이 함께 키웁니다.</p>
  <p>모이와 물을 챙긴 날만 하루로 셉니다.<br>커서를 가만히 두면 닭들이 궁금해서 다가와요.</p>
  <button class="primary" id="wbStart">시작하기</button>
</div>`);
html = html.replace('</body>', `<script src="web-ui.js"></script>\n</body>`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- 웹 전용 UI 동작 ----
fs.writeFileSync(path.join(OUT, 'web-ui.js'), `// 트레이 메뉴 대신 화면 버튼 / 구름 / 첫 방문 안내
(function () {
  const $ = (s) => document.querySelector(s);
  $('#wbMenu').addEventListener('click', () => window.__tpEmit('ui:toggle-menu'));
  for (const b of document.querySelectorAll('#webbar [data-size]')) {
    b.addEventListener('click', () => window.__tpEmit('pet:size', +b.dataset.size));
  }
  $('#wbExport').addEventListener('click', () => window.__tpExport());
  $('#wbImport').addEventListener('click', () => $('#wbFile').click());
  $('#wbFile').addEventListener('change', (e) => { if (e.target.files[0]) window.__tpImport(e.target.files[0]); });

  // 첫 방문 안내 (소리는 사용자가 한 번 누른 뒤에야 재생할 수 있다)
  const SEEN = 'teacherpet.welcomed';
  if (localStorage.getItem(SEEN)) $('#welcome').remove();
  else $('#wbStart').addEventListener('click', () => { localStorage.setItem(SEEN, '1'); $('#welcome').remove(); });

  // 구름 몇 조각
  const box = $('#clouds');
  for (let i = 0; i < 7; i++) {
    const c = document.createElement('div');
    c.className = 'cloud';
    const w = 60 + Math.random() * 130, h = w * (0.28 + Math.random() * 0.14);
    c.style.cssText = \`width:\${w}px;height:\${h}px;left:\${Math.random() * 100}%;top:\${2 + Math.random() * 22}%;opacity:\${0.5 + Math.random() * 0.4}\`;
    box.appendChild(c);
    const drift = 40 + Math.random() * 70, dur = 90 + Math.random() * 120;
    c.animate([{ transform: 'translateX(0)' }, { transform: \`translateX(\${drift}px)\` }],
      { duration: dur * 1000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }

  // 모바일: 두 손가락 확대 방지
  document.addEventListener('gesturestart', (e) => e.preventDefault());
})();
`);

// ---- PWA ----
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  name: '티처펫 — 우리 반 닭 키우기', short_name: '티처펫',
  start_url: './', display: 'standalone', orientation: 'landscape',
  background_color: '#8FC7F5', theme_color: '#8FC7F5', lang: 'ko',
  description: '알에서 암탉·수탉까지, 닭의 한살이를 우리 반이 함께 키웁니다.',
  icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));
fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(OUT, 'icon.png'));

fs.writeFileSync(path.join(OUT, 'sw-reg.js'), "if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));\n");
const files = [];
(function walk(dir, base = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel); else files.push('./' + rel);
  }
})(OUT);
fs.writeFileSync(path.join(OUT, 'sw.js'), `// 오프라인에서도 열리도록 캐시한다
const CACHE = 'teacherpet-${pkg.version}';
const FILES = ${JSON.stringify(files.concat(['./']), null, 2)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
`);
fs.writeFileSync(path.join(OUT, 'sw-reg.js'),
  "if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));\n");
html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').replace('</body>', '<script src="sw-reg.js"></script>\n</body>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const total = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f.slice(2))).size, 0);
console.log(`web/ 빌드 완료 — 파일 ${files.length}개, ${(total / 1024 / 1024).toFixed(2)} MB`);
