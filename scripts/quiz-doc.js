// 퀴즈 문항 검토용 문서를 만든다 — src/renderer/sim/quiz.js 가 원본이다.
//   npm run quiz-doc   →   docs/퀴즈_초안_검토용.md
// 문서를 손으로 고치지 말고, quiz.js 를 고친 뒤 다시 만든다 (둘이 어긋나지 않게).
const fs = require('fs');
const path = require('path');
global.window = global;
require('../src/renderer/sim/quiz.js');
const { Q, READY, PER_DAY } = global.TP.quiz;
const L = 'ㄱㄴㄷㄹ';
const out = [
  '# 할머니 퀴즈 — 문항 검토용',
  '',
  `> 이 문서는 \`src/renderer/sim/quiz.js\` 에서 만들어집니다 (\`npm run quiz-doc\`). 고칠 곳은 번호로 알려 주세요.`,
  '',
  `- 지금 상태: **${READY ? '켜짐 — 아이들에게 나옵니다' : '꺼짐 — 검토가 끝나면 켭니다'}**`,
  `- 하루 ${PER_DAY}문제, 맞히면 1코인. 틀려도 잃는 것은 없고 까닭을 알려 줍니다.`,
  '- 화면에서는 보기 순서가 섞여 나옵니다.',
  '- 출처: 실과 [6실04-08] 동식물 기르기 · 과학 [4과04-03] 한살이 유형 · 게임 안에서 실제로 보이는 것',
  '',
  '---',
  '',
];
Q.forEach((x, i) => {
  out.push(`### ${i + 1}. ${x.q}`, '');
  x.c.forEach((c, j) => out.push(`${L[j]}. ${c}${j === x.a ? '  ✅' : ''}`));
  out.push('', `> 할머니: ${x.why}`, '');
});
const file = path.join(__dirname, '..', 'docs', '퀴즈_초안_검토용.md');
fs.writeFileSync(file, out.join('\n'));
console.log(`${Q.length}문항 → ${path.relative(process.cwd(), file)}`);
