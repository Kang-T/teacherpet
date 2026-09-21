// 손 모양 커서를 그린다 — SVG 원본 → PNG (32px, 64px) 
//   node scripts/make-cursors.js   →   src/renderer/cursor/*.png  +  src/renderer/core/cursors.js (기준점)
// (assets/ 는 웹에 싣지 않는 폴더라 쓰지 않는다)
//
// 왜 PNG 인가: 크롬은 커서 그림이 크면(>32px 권장) 무시하고 화살표로 돌아간다.
// 고해상도 화면에서는 64px 를 2배로 쓴다 (image-set).
// 살색을 쓰지 않는다 — 크림색이라 누구의 손이든 될 수 있다.
// hot: 64 기준 기준점. 닭은 커서 '밑의 땅 한 점'을 쪼므로 이 점이 정확해야 한다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = '#2B1B0E', FILL = '#FFF3D6', LINE = '#B08A5A';
const cap = (x, y, w, h, t = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}" ${t}/>`;
// thumbs: [x1,y1,x2,y2] — 손바닥 안쪽(x1,y1)에서 손끝(x2,y2)까지. 둥근 선으로 그려 손바닥에 붙인다.
const shape = (parts, extra = '', thumbs = []) => {
  const tl = (w, c) => thumbs.map(([a, b, x, y]) => `<line x1="${a}" y1="${b}" x2="${x}" y2="${y}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
  return `<g stroke="${OUT}" stroke-width="6" stroke-linejoin="round" fill="${OUT}">${parts}</g>${tl(15, OUT)}`
    + `<g fill="${FILL}">${parts}</g>${tl(9, FILL)}${extra}`;
};
const lines = (arr, w = 2) => `<g stroke="${LINE}" stroke-width="${w}" stroke-linecap="round" fill="none">${arr.map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join('')}</g>`;

const openParts = (spread = 0) => [
  cap(19, 9, 7.6, 26, `transform="rotate(${-spread} 23 34)"`),
  cap(27.5, 5, 7.6, 30, `transform="rotate(${-spread / 3} 31 34)"`),
  cap(36, 7, 7.6, 28, `transform="rotate(${spread / 3} 40 34)"`),
  cap(44, 13, 7.6, 22, `transform="rotate(${spread} 48 34)"`),
  `<rect x="18" y="26" width="34" height="28" rx="13"/>`,
].join('');
const openHand = (spread) => shape(openParts(spread), lines([[27, 24, 27, 31], [35.5, 24, 35.5, 31], [43.5, 25, 43.5, 31]]), [[25, 46, 11 - spread / 2, 32 - spread / 3]]);

const CURSORS = {
  // 빈 땅 위 — 편 손
  open: { hot: [33, 38], svg: openHand(0) },
  // 닭 위 — 쓰다듬는 손 (살짝 기울이고, 옆에 쓰다듬는 줄)
  pet: { hot: [33, 38], svg: `<g transform="rotate(-18 34 38)">${openHand(0)}</g>`
    + `<g stroke="${OUT}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M54 18 q5 5 0 10"/><path d="M58 13 q8 10 0 20"/></g>` },
  // 닭을 끌 때 — 쥔 손
  grab: { hot: [33, 38], svg: shape([
    `<rect x="14" y="22" width="38" height="30" rx="12"/>`,
    `<circle cx="20" cy="24" r="6"/><circle cx="29" cy="21" r="6"/><circle cx="38" cy="21" r="6"/><circle cx="47" cy="24" r="6"/>`,
  ].join(''), `<g stroke="${OUT}" stroke-width="3" fill="${FILL}"><rect x="13" y="33" width="26" height="10" rx="5"/></g>` + lines([[24.5, 17, 24.5, 27], [33.5, 16, 33.5, 27], [42.5, 17, 42.5, 27]])) },
  // 기구·똥·장식 위 — 가리키는 손 (손끝이 기준점)
  point: { hot: [26, 4], svg: shape([
    cap(22, 2, 8.6, 36),
    `<rect x="18" y="28" width="32" height="26" rx="12"/>`,
    `<circle cx="35" cy="30" r="5.5"/><circle cx="42" cy="31" r="5.5"/><circle cx="48" cy="35" r="5"/>`,
  ].join(''), lines([[30.5, 32, 30.5, 38], [38.5, 33, 38.5, 38]]), [[25, 46, 12, 36]]) },
  // 땅을 꾹 누르는 중 — 호미 쥔 손 (호미 날 끝이 기준점 = 누른 자리)
  hoe: { hot: [7, 57], svg:
      // 짧은 나무 손잡이 + 휘어진 세모 날 — 삽이 아니라 호미로 보여야 한다
      `<g stroke="${OUT}" stroke-width="10" stroke-linecap="round"><line x1="50" y1="12" x2="27" y2="37"/></g>`
    + `<g stroke="#A8743F" stroke-width="5" stroke-linecap="round"><line x1="50" y1="12" x2="27" y2="37"/></g>`
    + `<path d="M29 33 Q22 34 18 40 L6 58 Q18 54 30 46 Q34 40 29 33 Z" fill="#9AA6AE" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>`
    + `<g transform="rotate(-45 46 17)">${shape([`<rect x="35" y="8" width="23" height="18" rx="7"/>`, `<circle cx="39" cy="9" r="4"/><circle cx="46" cy="7.5" r="4"/><circle cx="53" cy="9" r="4"/>`].join(''))}</g>` },
  // 닭에게 쪼인 순간 — 움찔 (손가락이 벌어지고 놀란 줄)
  flinch: { hot: [33, 38], svg: openHand(12)
    + `<g stroke="${OUT}" stroke-width="3" stroke-linecap="round"><line x1="6" y1="10" x2="11" y2="16"/><line x1="4" y1="22" x2="10" y2="23"/><line x1="14" y1="3" x2="16" y2="10"/></g>` },
};

const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!chrome) { console.error('크롬을 찾지 못했습니다 (CHROME_PATH)'); process.exit(1); }
const outDir = path.join(__dirname, '..', 'src', 'renderer', 'cursor');
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpcur-'));
const hots = {};
for (const [name, c] of Object.entries(CURSORS)) {
  for (const px of [32, 64]) {
    const html = path.join(tmp, `${name}${px}.html`);
    fs.writeFileSync(html, `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 64 64">${c.svg}</svg></body></html>`);
    const file = path.join(outDir, px === 32 ? `${name}.png` : `${name}@2x.png`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${px},${px}`, `--screenshot=${file}`, 'file://' + html], { stdio: 'ignore' });
  }
  hots[name] = [Math.round(c.hot[0] / 2), Math.round(c.hot[1] / 2)];
}
// 기준점은 JS 로 싣는다 — 페이지는 fetch 가 막혀 있어(connect-src 'none') JSON 을 못 읽는다
fs.writeFileSync(path.join(__dirname, '..', 'src', 'renderer', 'core', 'cursors.js'),
  '// 만든 곳: scripts/make-cursors.js — 손으로 고치지 말 것. 커서 그림의 기준점(32px 기준).\n'
  + '(function (g) { const TP = g.TP = g.TP || {}; TP.cursorHot = ' + JSON.stringify(hots) + '; })(typeof window !== \'undefined\' ? window : module.exports);\n');
console.log('커서 ' + Object.keys(CURSORS).length + '종 → ' + path.relative(process.cwd(), outDir));
console.log(JSON.stringify(hots));
