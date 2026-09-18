#!/usr/bin/env node
// 자동 검증 — Electron 을 띄워 실제로 시뮬레이션을 돌리고 결과를 확인한다.
//   npm run check
// 브라우저 미리보기(숨겨진 탭)에서는 그리기와 클릭 판정이 멈춰 확인할 수 없다.
// 데스크톱에서는 정상으로 돌기 때문에, 움직임·클릭 검사는 여기서 한다.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const probe = path.join(__dirname, 'checks.probe.js');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'teacherpet-check-'));

// 안내 화면을 건너뛴 깨끗한 상태에서 시작한다
fs.writeFileSync(path.join(userData, 'state.json'), JSON.stringify({
  version: 6, flock: [], basket: 0, coins: 0, album: [], away: [],
  feed: 100, water: 100, worms: 9, bedding: 100, poops: [], ammonia: 0,
  chapter: 4, onboarded: true, borrowed: null, lampPower: 1,
  settings: { size: 4, sound: false, guide: 'alone', detail: true, useCalendar: false, zoom: 1, elev: 24 },
  openedDays: [], lastSeen: Date.now(),
}));

const env = Object.assign({}, process.env, {
  TEACHERPET_USERDATA: userData,
  TEACHERPET_CHECK_FILE: probe,
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
});

// CI(리눅스)에서는 Chromium 샌드박스 도우미가 root 소유가 아니라 실행이 막힌다.
// 우리 코드를 우리 기계에서 돌리는 검사이므로 거기서만 끈다.
const args = ['electron', '.'];
if (process.env.CI) args.splice(2, 0, '--no-sandbox');
const child = spawn('npx', args, { cwd: ROOT, env });
let buf = '';
const timer = setTimeout(() => { console.error('시간 초과 — Electron 을 종료합니다'); child.kill(); }, 300000);

child.stdout.on('data', (d) => { buf += d; });
child.stderr.on('data', (d) => { buf += d; });

child.on('close', () => {
  clearTimeout(timer);
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (e) { /* 임시 폴더 */ }

  const line = buf.split('\n').reverse().find((l) => l.includes('CHECK|'));
  if (!line) {
    console.error('검사 결과를 받지 못했습니다.\n--- 출력 ---\n' + buf.slice(-2500));
    process.exit(2);
  }
  let res;
  try { res = JSON.parse(line.slice(line.indexOf('CHECK|') + 6)); }
  catch (e) { console.error('결과를 읽지 못했습니다: ' + line.slice(0, 300)); process.exit(2); }

  if (res && res.fatal) { console.error('검사 중 오류: ' + res.fatal); process.exit(2); }

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
  process.exit(bad === 0 ? 0 : 1);
});
