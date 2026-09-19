// 자동 검증 — 렌더러 안에서 돈다. scripts/check.js 가 Electron 에 넣어 실행한다.
// 그동안 실제로 났던 버그를 하나씩 되짚는다. 새 버그를 만나면 여기에 항목을 더한다.
(async () => {
  const T = window.__tpTest, D = window.__tp, TPU = window.TP.util;
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (n) => Math.round(n * 100) / 100;
  // 그래픽카드 없이(CI 의 SwiftShader) 그리면 프레임이 3fps 까지 떨어진다.
  // 시뮬레이션은 프레임마다 최대 0.1초씩만 흐르므로, 실시간의 1/3 속도가 된다.
  // '몇 초 안에 도착하는가' 류의 검사는 그만큼 더 기다려 줘야 한다.
  const gpuName = (window.__tpTest.gpuName && window.__tpTest.gpuName()) || '';
  const SOFT = /llvmpipe|swiftshader|softwarerasterizer|software/i.test(gpuName);
  const SLOW = SOFT ? 4 : 1;

  try {
    // 날씨가 마당 온도를 바꾼다(7단계). 날짜에 맡기면 온도 검사가 그날그날 결과가 달라진다.
    // 그래서 검사 내내 '맑음'으로 못 박는다 — 날씨 자체를 보는 검사는 따로 있다.
    T.setWeather('clear');

    // 준비: 병아리 한 마리
    if (D.birds().length === 0) T.giveChick();
    await wait(600);
    const bird = D.birds()[0];
    if (!bird) { ok('준비: 병아리 받기', false, '병아리가 생기지 않음'); return out; }
    ok('준비: 병아리 받기', true, bird.name);
    const NAME = bird.name;
    const yard0 = D.world();
    const props0 = T.props();

    // ── 1. 확대·시점이 마당을 건드리지 않는다 ──
    T.setView(2.0, 45); await wait(400);
    const yard1 = D.world(), props1 = T.props();
    const sameYard = ['xMin', 'xMax', 'zMin', 'zMax'].every((k) => Math.abs(yard0[k] - yard1[k]) < 0.01);
    const samePropsZoom = Object.keys(props0).every((k) => props1[k]
      && Math.abs(props0[k].x - props1[k].x) < 0.01 && Math.abs(props0[k].z - props1[k].z) < 0.01);
    ok('확대·시점을 바꿔도 마당 경계가 그대로', sameYard, `${yard0.xMin}~${yard0.xMax} → ${yard1.xMin}~${yard1.xMax}`);
    ok('확대·시점을 바꿔도 소품이 제자리', samePropsZoom);
    T.setView(1, 24); await wait(400);

    // ── 2. 보온등까지 걸어간다 (순간이동 없이) ──
    D.lamp(1);
    const lamp = D.propPos('lamp');
    // 램프에서 떼어 놓고, 추워서 찾아가게 만든다.
    // 너무 멀리 두면 걸음이 느려(병아리) 제한 시간 안에 못 온다 — 실제로 있을 법한 거리로.
    T.place(NAME, lamp.x + 13, lamp.z + 6);
    D.set(NAME, 'stress', 0);
    await wait(300);
    const start = T.stateOf(NAME);
    const startDist = Math.hypot(start.x - lamp.x, start.z - lamp.z);
    const path = [];
    let maxStep = 0, jumpAt = null;
    const t0 = Date.now();
    let prev = start;
    while (Date.now() - t0 < 40000 * SLOW) {
      await wait(60);
      const s = T.stateOf(NAME);
      if (!s) break;
      path.push(s);
      const step = Math.hypot(s.x - prev.x, s.z - prev.z);
      // 뛰어오르거나(들기·점프) 지붕으로 도약할 때는 크게 움직인다 — 그건 제외
      if (s.y < 0.05 && prev.y < 0.05 && step > maxStep) { maxStep = step; jumpAt = `${prev.anim}→${s.anim}`; }
      prev = s;
      if (Math.hypot(s.x - lamp.x, s.z - lamp.z) < 3.2) break;
    }
    const last = T.stateOf(NAME);
    const reached = Math.hypot(last.x - lamp.x, last.z - lamp.z);
    ok('보온등까지 스스로 간다', reached < 4.5, `${round(startDist)} → ${round(reached)} (${Math.round((Date.now() - t0) / 1000)}초${SOFT ? ', 소프트웨어 렌더링이라 여유를 줌' : ''})`);
    // 0.06초에 2유닛 넘게 움직이면 순간이동이다 (걷기 속도의 수십 배)
    ok('가는 동안 순간이동이 없다', maxStep < 2.0, `한 번에 최대 ${round(maxStep)} (${jumpAt || '-'})`);

    // ── 3. 움직이는 동안 가는 쪽을 본다 ──
    let headChecked = 0, headBad = 0, worstHead = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const dx = b.x - a.x, dz = b.z - a.z;
      if (Math.hypot(dx, dz) < 0.06 || b.head === null) continue;
      const want = Math.atan2(dx, dz);
      let diff = Math.abs(((b.head - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      headChecked++;
      if (diff > worstHead) worstHead = diff;
      if (diff > 0.6) headBad++;                       // 약 34도까지 허용
    }
    ok('움직이는 동안 가는 쪽을 본다', headChecked > 5 && headBad === 0,
      `표본 ${headChecked}개 중 어긋남 ${headBad}개, 최대 ${round(worstHead * 57.3)}도`);

    // ── 4. 마당 밖으로 나가지 않는다 ──
    const outside = path.filter((s) => s.x < yard0.xMin - 0.5 || s.x > yard0.xMax + 0.5 || s.z < yard0.zMin - 0.5 || s.z > yard0.zMax + 0.5);
    ok('마당 밖으로 나가지 않는다', outside.length === 0, `벗어난 표본 ${outside.length}개`);

    // ── 5. 보온등 아래에서 따뜻해한다 ──
    T.place(NAME, lamp.x + 1.2, lamp.z); await wait(500);
    const warm = T.stateOf(NAME).comfort;
    T.place(NAME, yard0.xMin + 2, yard0.zMin + 2); await wait(500);
    const coldFar = T.stateOf(NAME).comfort;
    ok('보온등 아래는 따뜻하다', warm === 'ok' || warm === 'hot', `상태 ${warm}`);
    ok('보온등에서 멀면 춥다', coldFar === 'cold', `상태 ${coldFar}`);

    // ── 6. 클릭이 닿는다 ──
    T.place(NAME, lamp.x + 1.2, lamp.z); await wait(400);
    const bs = T.screenOfBird(NAME);
    const hitBird = T.pickAt(bs.x, bs.y);
    ok('닭을 클릭할 수 있다', hitBird && hitBird.type === 'bird', JSON.stringify(hitBird));
    // 보온등 불빛 한가운데에 똥을 놓고 집어 본다 (빛이 클릭을 가로채던 문제)
    T.dropPoopAt(lamp.x + 1.2, lamp.z + 0.6); await wait(400);
    const ps = T.screenOfPoint(lamp.x + 1.2, 0.12, lamp.z + 0.6);
    const hitPoop = T.pickAt(ps.x, ps.y);
    ok('보온등 불빛 아래의 똥을 집을 수 있다', hitPoop && hitPoop.type === 'poop', JSON.stringify(hitPoop));

    // ── 7. 벌레는 바닥에 떨어지고 마당 안에 있다 ──
    const mid = T.screenOfPoint((yard0.xMin + yard0.xMax) / 2, 0, (yard0.zMin + yard0.zMax) / 2);
    D.spawnWorm(mid.x, mid.y); D.releaseWorm();
    await wait(1800);
    const w = T.wormState();
    ok('벌레가 바닥에 떨어진다', w && w.y < 0.25, w ? `높이 ${w.y}` : '벌레 없음');
    ok('벌레가 마당 안에 있다', w && w.z <= yard0.zMax + 0.5 && w.z >= yard0.zMin - 0.5, w ? `z ${w.z} (마당 ${yard0.zMin}~${yard0.zMax})` : '벌레 없음');
    // ── 8. 농장 코드가 왕복한다 ──
    const code = T.farmCode();
    const back = code ? T.readFarmCode(code) : { error: '코드를 만들지 못했다' };
    const was = T.stateOf(NAME);
    const b0 = !back.error && back.birds[0];
    const sameName = b0 && b0.name === NAME;
    ok('농장 코드를 만들고 다시 읽는다', sameName,
      back.error || `${back.birds.length}마리(${back.birds.map((b) => b.name).join(',')}) · ${code.length}자`);
    // 이름만 보면, 성격이나 돌본 날이 조용히 사라져도 모른다
    ok('성격과 단계도 함께 따라온다', b0 && b0.trait && b0.stage === (was ? was.stage : b0.stage),
      b0 ? `${b0.stage} · ${b0.trait}` : '-');
    if (code) {
      const i = Math.floor(code.length / 2);                 // 가운데 한 글자를 바꿔 본다
      const broken = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
      const r2 = T.readFarmCode(broken);
      ok('한 글자만 틀려도 걸러낸다', !!r2.error, r2.error || '거르지 못했다');
    }

    // ── 9. 자리가 빠진 저장 데이터를 읽어도 닭이 마당에 선다 ──
    // (손으로 만든 저장·옛 저장에 x 가 없으면 NaN 자리에 서서 영영 보이지 않았다)
    const fixed = T.fixBird({});
    const okNum = (v) => typeof v === 'number' && isFinite(v);
    ok('자리가 빠진 저장도 숫자 자리를 얻는다', okNum(fixed.x) && okNum(fixed.z), JSON.stringify(fixed));
    const fixed2 = T.fixBird({ x: null, z: NaN });
    ok('자리가 망가진 저장도 고쳐 읽는다', okNum(fixed2.x) && okNum(fixed2.z), JSON.stringify(fixed2));

    // ── 10. QR ──
    // 실제로 읽히는지는 jsQR 로 판 1~20 · 마스크 8종(180가지)을 확인했다.
    // 여기서는 규격에서 값이 정해진 자리만 본다 — 그 자리가 틀리면 어떤 사진기도 못 읽는다.
    const q = T.qr('https://kang-t.github.io/teacherpet/#f=eyJ2IjoxfQ-AKE');
    const n = q ? q.n : 0;
    const at = (r, c) => q.rows[r][c];
    const finder = (r0, c0) => {
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        const want = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0;
        if (at(r0 + r, c0 + c) !== want) return false;
      }
      return true;
    };
    ok('QR 판 크기가 규격대로다', q && (n - 17) % 4 === 0 && n >= 21, q ? `${n}칸` : '못 만듦');
    ok('QR 모서리 표식 3개가 제자리', q && finder(0, 0) && finder(0, n - 7) && finder(n - 7, 0), '');
    let timing = true;
    for (let i = 8; i < n - 8; i++) { if (at(6, i) !== (i % 2 === 0 ? 1 : 0) || at(i, 6) !== (i % 2 === 0 ? 1 : 0)) timing = false; }
    ok('QR 시간줄이 끊기지 않는다', q && timing, '형식 자리를 비우다 (6,8)·(8,6) 을 지우던 문제');
    ok('QR 늘 검은 칸이 검다', q && at(n - 8, 8) === 1, '');
    const m0 = T.qr('같은 글', 0), m3 = T.qr('같은 글', 3);
    let sameMask = true;
    if (m0 && m3) { for (let r = 0; r < m0.n && sameMask; r++) for (let c = 0; c < m0.n; c++) if (m0.rows[r][c] !== m3.rows[r][c]) { sameMask = false; break; } }
    ok('QR 마스크가 실제로 다르게 나온다', m0 && m3 && !sameMask, '');
    ok('새로 시작이 저장을 먼저 멈춘다', T.wipeReady(), '__tpWipe 가 없으면 지운 농장이 되살아난다');

    // ── 11. 날씨 (날짜 시드) ──
    // 서버가 없으니, '같은 날 같은 반이면 같은 날씨'가 유일한 약속이다. 그게 깨지면 기능 자체가 무의미해진다.
    const D1 = '2026-09-19', D2 = '2026-09-20';
    const a1 = T.weatherOn(D1, '5-3'), a2 = T.weatherOn(D1, '5-3');
    ok('같은 날 같은 반이면 늘 같은 날씨', a1 === a2, `${a1} = ${a2}`);
    let differs = 0;
    for (const c of ['5-3', '5-4', '6-1', '3-2', '1-1', '2-7']) if (T.weatherOn(D1, c) !== a1) differs++;
    ok('반이 다르면 날씨가 갈린다', differs >= 2, `6개 반 중 ${differs}개가 5-3과 다름`);
    let kinds = {};
    let day = D1;
    for (let i = 0; i < 120; i++) { kinds[T.weatherOn(day, '5-3')] = 1; day = TPU.addDays(day, 1); }
    ok('넉 달이면 6가지 날씨가 다 나온다', Object.keys(kinds).length === 6, Object.keys(kinds).join(','));
    let changes = 0, lastWx = null; day = D1;
    for (let i = 0; i < 30; i++) { const k = T.weatherOn(day, '5-3'); if (lastWx && k !== lastWx) changes++; lastWx = k; day = TPU.addDays(day, 1); }
    ok('날씨가 날마다 굳지 않고 바뀐다', changes >= 10, `30일 중 ${changes}번 바뀜`);
    let run = 1, worst = 1; lastWx = null; day = D1;
    for (let i = 0; i < 365; i++) { const k = T.weatherOn(day, '5-3'); run = k === lastWx ? run + 1 : 1; worst = Math.max(worst, run); lastWx = k; day = TPU.addDays(day, 1); }
    ok('같은 날씨가 나흘 넘게 이어지지 않는다', worst <= 3, `1년 최장 ${worst}일 연속`);

    // 학급 코드에 이름이 들어가면 안 된다 — 아이가 쓰는 칸이다
    ok('학급 코드는 숫자만 남는다', T.cleanClass('5학년 3반 강경욱') === '5-3' && T.cleanClass('강경욱') === '',
      `'5학년 3반 강경욱' → '${T.cleanClass('5학년 3반 강경욱')}' · '강경욱' → '${T.cleanClass('강경욱')}'`);

    // 날씨가 마당 온도를 실제로 움직이는가 (추운 날 병아리가 보온등을 찾는 근거)
    const rooms = {};
    for (const c of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']) {
      const r = T.setClass(c); rooms[r.wx] = T.roomC();
    }
    const spread = Object.keys(rooms).length > 1
      && Math.max(...Object.values(rooms)) - Math.min(...Object.values(rooms)) >= 3;
    ok('날씨에 따라 마당 온도가 달라진다', spread,
      Object.keys(rooms).map((k) => `${k} ${rooms[k]}℃`).join(' · '));
    T.setClass('');

    // 자랑 글에 식별자가 섞이면 안 된다. 이 앱은 '아무것도 보내지 않는다'로 서 있다.
    T.setClass('5-3');
    const brag = T.brag();
    const leaks = brag.includes('5-3') || /학년|반$|학교/m.test(brag);
    ok('자랑 글에 반·학교가 들어가지 않는다', !leaks, JSON.stringify(brag));
    T.setClass('');

    // ── 12. 꾸미기 ──
    // 이 기능의 약속은 하나다: 겉모습만 바꾼다. 그게 깨지면 '잘 돌봤는가'가 기준이 아니게 된다.
    const before = T.birdStats(NAME);
    T.coins(200);
    const r1 = T.buy('coop', 'blue');
    const r2 = T.buy('ground', 'dirt');
    const r3 = T.buy('deco', 'flowerbed');
    const hat = T.hatOn(NAME, 'straw');
    await wait(400);
    const after = T.birdStats(NAME);
    let drift = 0, driftKey = '';
    for (const k of Object.keys(before || {})) {
      const d2 = Math.abs(after[k] - before[k]);
      if (d2 > drift) { drift = d2; driftKey = k; }
    }
    ok('꾸며도 닭의 수치가 그대로다', before && after && drift < 0.1,
      `가장 많이 움직인 값 ${driftKey} ${drift.toFixed(4)} (0.4초 동안의 자연 감소분, 기준 0.1)`);
    ok('산 것이 실제로 입혀진다', r1.farm.coop === 'blue' && r2.farm.ground === 'dirt' && hat === 'straw',
      `지붕 ${r1.farm.coop} · 바닥 ${r2.farm.ground} · 모자 ${hat}`);
    ok('장식물이 마당에 놓인다', r3.farm.decos >= 1, `${r3.farm.decos}개`);
    // 값을 내고 산다 — 공짜가 아니어야 '돌보면 쌓인다'가 의미를 가진다
    const spent = 200 - T.coins();
    ok('코인이 실제로 줄어든다', spent > 0, `${spent}코인 썼음`);
    // 다시 사도 이미 가진 것은 또 받지 않는다
    const c0 = T.coins(); T.buy('coop', 'blue');
    ok('가진 것을 다시 눌러도 돈이 나가지 않는다', T.coins() === c0, `${c0} → ${T.coins()}`);
    // 모자를 다시 누르면 벗는다
    ok('모자를 다시 누르면 벗는다', T.hatOn(NAME, 'straw') === null, '');
    // 돈이 없으면 못 산다
    T.coins(0);
    const poor = T.buy('coop', 'green');
    ok('돈이 모자라면 사지지 않는다', poor.farm.coop !== 'green', `지붕 ${poor.farm.coop}`);

    // 소품 자리가 settings 가 아니라 farm 에 남는다 (8단계 속 공사)
    T.movePropTo('lamp', 3.5, -8);
    const pl = T.placements();
    ok('소품 자리는 farm 에 마당 좌표로 남는다', pl.lamp && Math.abs(pl.lamp.x - 3.5) < 0.01 && Math.abs(pl.lamp.z + 8) < 0.01,
      JSON.stringify(pl.lamp));
    ok('옮긴 자리가 화면에도 반영된다', Math.abs(D.propPos('lamp').x - 3.5) < 0.2, JSON.stringify(D.propPos('lamp')));

    // ── 13. 배경이 무겁지 않은가 ──
    // 학교 크롬북에서 돌아가야 한다. 마당 밖 풍경을 올린 뒤 프레임이 무너지지 않았는지 본다.
    // (브라우저 미리보기는 숨은 탭이라 rAF 가 멈춘다 — 이 측정은 Electron 에서만 뜻이 있다.)
    const frames = [];
    await new Promise((res) => {
      let last = performance.now();
      const t0 = last;
      const f = () => {
        const n = performance.now();
        frames.push(n - last); last = n;
        if (n - t0 < 2500) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    frames.shift();
    frames.sort((a, b) => a - b);
    const midMs = frames.length ? frames[Math.floor(frames.length / 2)] : 999;
    const p95 = frames.length ? frames[Math.floor(frames.length * 0.95)] : 999;
    const calls = D.gpu().calls;
    const fpsLine = `중간 ${midMs.toFixed(1)}ms (${(1000 / midMs).toFixed(0)}fps) · 최악5% ${p95.toFixed(1)}ms · ${frames.length}프레임`;
    // CI(xvfb)는 그래픽카드 없이 소프트웨어로 그린다. 거기서 잰 프레임 수는
    // 학교 크롬북 성능과 아무 상관이 없어서, 알리기만 하고 떨어뜨리지는 않는다.
    ok('배경을 올려도 프레임이 버틴다', SOFT || (frames.length > 30 && midMs < 24),
      SOFT ? `${fpsLine} — 소프트웨어 렌더링(${gpuName})이라 판정하지 않음` : fpsLine);
    ok('드로우콜이 예산 안에 있다', calls < 480, `${calls}개 (기준 480)`);

    // ── 14. 할머니 대화가 막다른 길로 끝나지 않는가 ──
    // 닭이 이미 있는 농장에서 안내를 고르면 '네'를 눌러도 아무 일이 없었다.
    // (giveFirstChick 이 닭이 있으면 조용히 되돌아갔다)
    // '버튼이 눌리는가'가 아니라 '누르면 무언가 달라지는가'를 봐야 잡힌다.
    const hadBirds = D.birds().length;
    T.askGuide();
    await wait(500);
    T.clickGranny(0);                          // 안내 수준 고르기
    await wait(500);
    const stuck = [];
    for (let i = 0; i < 8 && T.grannyOpen(); i++) {
      const before = T.grannyText();
      if (!T.clickGranny(0)) break;
      await wait(550);
      const after = T.grannyOpen() ? T.grannyText() : '(닫힘)';
      if (before === after) stuck.push(before.slice(0, 24));
      else stuck.length = 0;                   // 달라졌으면 막힌 게 아니다
      if (stuck.length >= 2) break;            // 두 번 눌러도 그대로면 막다른 길
    }
    ok('안내를 고른 뒤 눌러도 반응 없는 곳이 없다', stuck.length < 2,
      stuck.length >= 2 ? `"${stuck[0]}..." 에서 멈춤` : '끝까지 진행됨');
    ok('안내를 고르면 시작한 것으로 기록된다', T.onboarded(), '');
    ok('대화가 끝나도 닭이 그대로다', D.birds().length === hadBirds, `${hadBirds} → ${D.birds().length}마리`);

    // ── 15. 횟대 ──
    // 닭은 높은 데서 자는 새다. 올라갔으면 떠 있어야 하고, 내려오면 땅에 닿아야 한다.
    T.showProp('perch', true);
    D.grow(NAME, 'hen');                       // 병아리는 아직 못 오른다
    D.set(NAME, 'energy', 4);                  // 졸려야 횟대에 머문다 (안 졸리면 바로 내려온다)
    await wait(400);
    T.perchUp(NAME);
    const traj = [];
    let best = null;
    for (let i = 0; i < 14; i++) {
      await wait(120);
      const st2 = T.perchState(NAME);
      traj.push(`${st2.y}/${st2.anim}${st2.onPerch ? '+' : '-'}`);
      if (st2.onPerch && Math.abs(st2.y - st2.perchY) < 0.08) { best = st2; break; }
    }
    ok('횟대에 올라가면 그 높이에 선다', !!best,
      best ? `y ${best.y} (횟대 ${best.perchY})` : traj.join(' '));
    // 부르면 내려와야 한다 — 높은 데 있는 걸 잊고 부르면 공중을 걸어 다니게 된다
    D.whistle();
    await wait(2600);
    const down = T.perchState(NAME);
    ok('부르면 횟대에서 내려온다', down && !down.onPerch && down.y < 0.4,
      down ? `y ${down.y} · ${down.anim}` : '없음');
  } catch (e) {
    ok('검사 도중 오류', false, String(e && e.stack || e));
  }
  return out;
})()
