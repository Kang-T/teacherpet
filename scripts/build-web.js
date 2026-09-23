// 티처펫 웹 빌드 — 렌더러를 그대로 가져다 web/ 에 정적 사이트로 만든다.
// 렌더러 코드는 손대지 않는다. Electron 자리에 web/shim.js 를 끼울 뿐이다.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'renderer');
const WEB = path.join(ROOT, 'src', 'web');
const OUT = path.join(ROOT, 'web');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// 문자열 치환은 원문이 한 글자만 바뀌어도 조용히 실패한다. 반드시 확인하고 넘어간다.
function must(html, needle, replacement, what) {
  if (!html.includes(needle)) throw new Error(`빌드 중단 — index.html 에서 "${what}" 자리를 찾지 못했습니다.\n  찾던 것: ${needle.slice(0, 80)}`);
  return html.replace(needle, replacement);
}

// 맥이 폴더마다 만드는 .DS_Store 같은 부스러기는 빌드에 넣지 않는다.
// (서비스 워커의 캐시 목록에까지 들어가 있었다)
const JUNK = /^(\.DS_Store|Thumbs\.db|\._.*)$/;

function copyDir(from, to, skip = []) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.includes(e.name) || JUNK.test(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(SRC, OUT, ['assets', '안티그라비티_프롬프트.md']);   // 트레이 아이콘·작업 안내문은 웹에 싣지 않는다
fs.copyFileSync(path.join(WEB, 'shim.js'), path.join(OUT, 'shim.js'));
fs.copyFileSync(path.join(WEB, 'web.css'), path.join(OUT, 'web.css'));
for (const f of ['privacy.html', 'school.html']) fs.copyFileSync(path.join(WEB, f), path.join(OUT, f));

// ---- 단가를 스크립트로 구워 넣는다 ----
// 네트워크 요청을 0으로 만들기 위해서다. fetch 가 하나라도 남으면
// CSP 를 connect-src 'none' 으로 잠글 수 없고, "아무것도 보내지 않는다"를 코드로 보증할 수 없다.
const prices = JSON.parse(fs.readFileSync(path.join(SRC, 'prices.json'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'prices.data.js'), `window.__TP_PRICES=${JSON.stringify(prices)};\n`);

// ---- index.html 을 웹용으로 ----
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = must(html, '<link rel="stylesheet" href="style.css">',
  '<link rel="stylesheet" href="style.css">\n<link rel="stylesheet" href="web.css">\n<link rel="manifest" href="manifest.json">\n<meta name="theme-color" content="#8FC7F5">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">', '스타일시트 링크');
// CSP — 개인정보 0 수집을 코드로 강제하는 층.
// connect-src 'none' 이면 실수로 들어간 fetch/XHR/WebSocket/sendBeacon 이
// 브라우저 단에서 차단된다. 체크리스트보다 이 한 줄이 강하다.
// (문서 컨텍스트에만 적용되므로 스크립트·이미지 로딩과 서비스워커는 정상이다.)
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data:; font-src 'self'; connect-src 'none'; "
  + "form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";
if (!/<meta http-equiv="Content-Security-Policy"[^>]*>/.test(html)) throw new Error('빌드 중단 — CSP meta 태그를 찾지 못했습니다.');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
// shim 을 three 보다 먼저
// CSP(default-src 'self')에서는 인라인 스크립트가 막힌다 — 전부 외부 파일로
fs.writeFileSync(path.join(OUT, 'boot.js'), `window.__TP_VERSION=${JSON.stringify(pkg.version)};\n`);
html = must(html, '<script src="vendor/three.global.js"></script>',
  '<script src="boot.js"></script>\n<script src="prices.data.js"></script>\n<script src="shim.js"></script>\n<script src="vendor/three.global.js"></script>',
  'three.js 스크립트 태그');
// 화면 버튼 + 환영 카드 + 구름
html = must(html, '<div id="stageHost"></div>', `<div id="stageHost"></div>
<div id="webbar">
  <button id="wbMenu" title="닭장 열기">🐔</button>
  <input type="file" id="wbFile" accept="application/json" hidden>
  <button id="wbWipe" hidden></button>
</div>
<div id="welcome">
  <h2>🐣 티처펫</h2>
  <p>알에서 시작해 병아리 · 어린닭 · 암탉과 수탉까지,<br>닭의 한살이를 우리 반이 함께 키웁니다.</p>
  <p>모이와 물을 챙긴 날만 하루로 셉니다.<br>커서를 가만히 두면 닭들이 궁금해서 다가와요.</p>
  <p class="tiny">이름도 학교도 묻지 않아요. 아무것도 인터넷으로 보내지 않습니다.<br>
  닭은 <b>이 기기 안에만</b> 저장돼요 — 가끔 설정의 [파일로 저장]으로 챙겨 두세요.
  <a href="privacy.html">자세히</a></p>
  <button class="primary" id="wbStart">시작하기</button>
</div>`, '무대 컨테이너');
html = must(html, '</body>', `<div id="clouds"></div>\n<script src="web-ui.js"></script>\n</body>`, '</body>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// ---- 웹 전용 UI 동작 ---- (src/web/web-ui.js 를 그대로 복사)
fs.copyFileSync(path.join(WEB, 'web-ui.js'), path.join(OUT, 'web-ui.js'));

// ---- PWA ----
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  name: '티처펫 — 우리 반 닭 키우기', short_name: '티처펫',
  start_url: './', display: 'standalone', orientation: 'landscape',
  background_color: '#8FC7F5', theme_color: '#8FC7F5', lang: 'ko',
  description: '알에서 암탉·수탉까지, 닭의 한살이를 우리 반이 함께 키웁니다.',
  icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));
fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(OUT, 'icon.png'));

fs.writeFileSync(path.join(OUT, 'sw-reg.js'), `// 새 배포가 올라오면 한 번만 새로고침해서 통째로 갈아 끼운다.
// 이걸 안 하면 이미 방문한 기기가 옛 앱을 계속 쓴다 — 학교 기기에서는 치명적이다.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  // 첫 방문에는 새로고침할 이유가 없다 — 갈아 끼울 옛 앱이 없기 때문이다.
  // 그런데 clients.claim() 은 첫 방문에도 controllerchange 를 일으킨다.
  // 그대로 두면 처음 열 때마다 화면이 두 번 뜨는 것처럼 보인다.
  var hadOld = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadOld || refreshing) return;
    refreshing = true; location.reload();
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
`);
// confirm/prompt/alert 은 미리보기·내장 브라우저에서 막힌다. 막히면 false/null 이 돌아와
// 버튼이 조용히 죽는다 — 실제로 '새로 시작'이 그래서 안 먹었다.
// 다시 들어오지 못하게 여기서 막는다. 물어볼 일은 화면 안에서 묻는다(askText·grannySay).
{
  const DIALOG = /(^|[^.\w])(confirm|prompt|alert)\s*\(/;
  const bad = [];
  for (const f of ['app.js', 'web-ui.js', 'shim.js']) {
    const t = fs.readFileSync(path.join(OUT, f), 'utf8');
    t.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (DIALOG.test(code)) bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  if (bad.length) {
    console.error('브라우저 대화상자(confirm/prompt/alert)는 쓰지 않습니다 — 내장 브라우저에서 막혀 버튼이 죽습니다.');
    console.error('화면 안에서 묻는 askText() 나 grannySay() 를 쓰세요.\n' + bad.join('\n'));
    process.exit(1);
  }
}

const files = [];
(function walk(dir, base = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (JUNK.test(e.name)) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel); else files.push('./' + rel);
  }
})(OUT);
// ⚠️ 캐시 이름은 버전이 아니라 '내용 해시'로 만든다.
// 예전에는 teacherpet-<package.json 버전> 이라, 코드를 고쳐도 버전을 올리지 않으면
// 이미 방문한 사람에게 옛 앱이 영원히 서빙됐다. 학교 기기에서는 치명적이다.
const hash = crypto.createHash('sha1');
for (const f of files.slice().sort()) hash.update(f).update(fs.readFileSync(path.join(OUT, f.replace('./', ''))));
const BUILD = hash.digest('hex').slice(0, 10);

fs.writeFileSync(path.join(OUT, 'sw.js'), `// 오프라인에서도 열리도록 캐시한다
const CACHE = 'teacherpet-${pkg.version}-${BUILD}';
const FILES = ${JSON.stringify(files.concat(['./']), null, 2)};
// ⚠️ cache: 'reload' — 브라우저 임시 저장본을 건너뛰고 서버에서 새로 받는다.
// GitHub Pages 는 파일마다 max-age=600 을 주므로, 그냥 받으면 10분 안의 옛 CSS·JS 가 새 캐시에 섞였다.
// (새 HTML + 옛 CSS → 새 창·단추가 모양 없이 화면 맨 아래에 쌓여, 다음 배포 때까지 남았다)
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 전부 캐시 우선 — 한 배포의 파일들이 항상 같은 세대로 묶여 있어야 한다.
  // (페이지만 네트워크 우선으로 두면 새 HTML + 옛 JS 가 섞여 더 위험하다.)
  // 새 배포는 내용 해시가 바뀌어 새 캐시가 만들어지고, skipWaiting + claim 으로
  // 즉시 넘겨받은 뒤 sw-reg.js 가 한 번 새로고침해 통째로 갈린다.
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
`);
html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').replace('</body>', '<script src="sw-reg.js"></script>\n</body>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const total = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f.slice(2))).size, 0);
console.log(`web/ 빌드 완료 — 파일 ${files.length}개, ${(total / 1024 / 1024).toFixed(2)} MB`);
