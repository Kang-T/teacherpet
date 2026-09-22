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
  // 소프트웨어 렌더링(CI)에서는 프레임이 3fps 까지 떨어진다. 시뮬레이션은 프레임마다
  // 최대 0.1초씩 흐르므로, 느린 게 아니라 '한 걸음이 커진' 상태가 된다.
  // 뛰어오르는 궤적이나 '다가가서 쫀다' 같은 시간 순서는 그 상태에서 결과가 달라진다 —
  // 거기서 재는 숫자는 크롬북 성능과도, 실제 동작과도 상관이 없다.
  // 그래서 이런 항목은 CI 에서 재서 적기만 하고 판정하지 않는다. 판정은 GPU 있는 기계에서 한다.
  const okMotion = (name, pass, detail) =>
    ok(name, SOFT || pass, SOFT ? `${detail || ''} — 소프트웨어 렌더링이라 판정하지 않음` : detail);

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
    // 어떤 날씨에도, 등을 제대로 켜면 1일차 병아리가 따뜻해져야 한다.
    // (7단계에서 날씨가 마당을 −5℃ 까지 내리자, 추운 날엔 등을 최대로 켜도
    //  35℃ 에 못 미쳐 아이가 무엇을 해도 병아리가 계속 추워했다)
    const badDays = [];
    for (const k of ['clear', 'cloudy', 'rain', 'wind', 'hot', 'cold']) {
      T.setWeather(k);
      const ws2 = T.warmSpot();             // 따뜻한 자리는 기둥이 아니라 갓 아래다
      D.lamp(1);
      T.place(NAME, ws2.x, ws2.z); T.holdStill(NAME, 6);
      await wait(200);
      T.place(NAME, ws2.x, ws2.z); T.holdStill(NAME, 6);   // 걸어 나가지 않게 한 번 더
      await wait(220);
      const st3 = T.stateOf(NAME).comfort;
      if (st3 === 'cold') badDays.push(k);
    }
    ok('어떤 날씨에도 등을 켜면 따뜻해진다', badDays.length === 0,
      badDays.length ? `아직 추운 날씨: ${badDays.join(',')}` : '6가지 날씨 모두 ok');
    T.setWeather('clear');

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
    okMotion('안내를 고르면 시작한 것으로 기록된다', T.onboarded(), '');
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
    okMotion('횟대에 올라가면 그 높이에 선다', !!best,
      best ? `y ${best.y} (횟대 ${best.perchY})` : traj.join(' '));
    // 부르면 내려와야 한다 — 높은 데 있는 걸 잊고 부르면 공중을 걸어 다니게 된다
    D.whistle();
    await wait(2600);
    const down = T.perchState(NAME);
    okMotion('부르면 횟대에서 내려온다', down && !down.onPerch && down.y < 0.4,
      down ? `y ${down.y} · ${down.anim}` : '없음');

    // ── 16. 커서를 쪼는가, 커서 '밑'을 쪼는가 ──
    // 닭이 커서의 바닥 그림자로 걸어가면, 그 자리에서 커서는 정확히 발밑이 된다.
    // 그러면 고개를 들 이유가 없어 늘 땅을 쫀다.
    // '다가올지 말지'는 무작위라, 그걸 끼워 두면 검사 결과가 25~48px 사이를 오간다.
    // 그래서 둘로 나눈다: ① 설 자리를 어디로 잡는가 ② 그 자리에서 부리가 커서로 가는가.
    D.set(NAME, 'stress', 0); D.set(NAME, 'aff', 95);
    T.place(NAME, -4, -7);
    await wait(400);
    const aim = T.screenOfPoint(1.5, 0, -7);
    T.setMouse(aim.x, aim.y);
    await wait(300);

    const sf = T.standFor(NAME);
    // 화면의 커서는 언제나 땅의 한 점을 가리킨다. 그러니 '커서를 쫀다'는 그 땅점을 쫀다는 뜻이다.
    // 문제는 닭이 그 점 '위에' 서는 것이었다 — 제 몸으로 자리를 가린 채 발밑을 찍는다.
    // 한 걸음 뒤(카메라 쪽, z 가 큰 쪽)에 서야 앞으로 목을 뻗는 모습이 된다.
    ok('커서 점 위가 아니라 한 걸음 뒤에 선다',
      sf && sf.stand.z > sf.ground.z + 0.5,
      sf ? `설 자리 z ${sf.stand.z} · 커서 점 z ${sf.ground.z}` : '없음');

    // 그 자리에 세워 놓고 쪼게 한 뒤, 부리가 화면에서 커서와 얼마나 떨어지는지 본다
    if (sf) T.place(NAME, sf.stand.x, sf.stand.z);
    T.holdStill(NAME, 8);                       // 재는 동안 딴 데로 걸어가면 숫자가 흔들린다
    await wait(250);
    T.peckNow(NAME);
    let bestPx = 1e9, bestAt = null, highest = 0;
    for (let i = 0; i < 26; i++) {
      T.setMouse(aim.x, aim.y);
      await wait(110);
      const bk = T.beakScreen(NAME);
      if (!bk) continue;
      const dpx = Math.hypot(bk.x - aim.x, bk.y - aim.y);
      if (dpx < bestPx) { bestPx = dpx; bestAt = bk; }
      if (bk.wy > highest) highest = bk.wy;
    }
    // ⚠️ 화면상 거리만 재면 옛 동작이 더 좋게 나온다(25px vs 30px).
    //    닭이 커서의 바닥점에 서면 부리가 화면상으로는 커서에 닿기 때문이다 —
    //    그런데 그게 바로 '커서 밑을 쫀다'는 그 모습이다. 재야 할 것은 고개를 들었는가다.
    okMotion('부리가 화면의 커서에 닿는다', bestPx < 45,
      `가장 가까울 때 ${Math.round(bestPx)}px 차 · 그때 부리 높이 ${bestAt ? bestAt.wy : '-'} (기준 45px)`);

    // ── 17. 어른 닭은 날개가 있다 ──
    // 높은 데서 내려도 다치지 않아야 한다. 병아리는 다친다 — 그게 조심해야 할 이유다.
    D.grow(NAME, 'hen');
    D.set(NAME, 'hurt', null); D.set(NAME, 'health', 100);
    await wait(300);
    T.dropFrom(NAME, 7);
    await wait(2600);
    const adultHurt = T.stateOf(NAME);
    ok('어른 닭은 떨어뜨려도 안 다친다', !T.hurtOf(NAME), T.hurtOf(NAME) ? '다침' : '멀쩡');

    // ── 18. 보온등 단계 ──
    // 껐다 켰다만 되면 '온도를 맞춘다'가 메뉴 속에 숨는다. 눌러서 한 칸씩 돌아야 한다.
    const seq = [];
    D.lamp(0);
    for (let i = 0; i < 5; i++) { T.clickProp('lamp'); await wait(160); seq.push(D.lamp()); }
    // ── 19. 소품을 뚫고 다니지 않는가 ──
    // 모이통·바구니를 그대로 통과해서 몸이 반쯤 박혀 보였다.
    // 소품 한가운데에 놓고 제자리에 붙잡은 뒤, 스스로 밀려 나오는지 본다.
    // (붙잡지 않으면 닭이 딴 데로 걸어가 버려서 검사가 헛돈다 — 실제로 그렇게 속았다)
    D.grow(NAME, 'hen');
    const fx2 = D.propPos('feeder');
    T.place(NAME, fx2.x, fx2.z);
    T.holdStill(NAME, 8);
    let overWorst = 0, overProp = '';
    for (let i = 0; i < 12; i++) {
      await wait(130);
      T.holdStill(NAME, 8);                     // 계속 붙잡아 둔다
      const st4 = T.insideProp(NAME);
      if (st4 && st4.over > overWorst) { overWorst = st4.over; overProp = st4.prop; }
    }
    const last4 = T.insideProp(NAME);
    okMotion('소품 속에 박히면 스스로 밀려 나온다', last4 && last4.over <= 0.06,
      last4 ? `끝에 ${last4.prop || '없음'} 에 ${last4.over} 겹침 (도중 최대 ${overWorst} · ${overProp})` : '없음');
    // 그래도 먹을 수는 있어야 한다 — 너무 멀리 밀어내면 모이통을 못 쓴다
    const afterPush = T.stateOf(NAME);
    const gapFeeder = Math.hypot(afterPush.x - fx2.x, afterPush.z - fx2.z);
    okMotion('밀려나도 모이통에 닿는 거리에 남는다', gapFeeder < 2.2,
      `모이통에서 ${gapFeeder.toFixed(2)} (기준 2.2)`);

    // ── 20. 벌레를 한 번에 물지 않는다 ──
    // 닿자마자 물면 '잡았다'는 느낌이 없다. 한두 번 놓쳐야 쫓는 맛이 난다.
    // 다만 영영 못 잡으면 아이가 지치므로, 놓치는 횟수는 두 번까지여야 한다.
    D.grow(NAME, 'chick');                     // 병아리가 가장 자주 놓친다
    D.set(NAME, 'hunger', 40); D.set(NAME, 'stress', 0);
    let sawEscape = false, caught = false, maxEsc = 0; const trace = [];
    let caughtCount = 0;
    for (let round = 0; round < 6; round++) {
      T.place(NAME, 2, -6);
      const wp = T.dropWormAt(3.2, -6);
      if (!wp) break;
      for (let i = 0; i < 60; i++) {
        await wait(90);
        const w2 = T.wormState();
        if (!w2) { caught = true; caughtCount++; break; }      // 물고 바로 먹어치운 것
        maxEsc = Math.max(maxEsc, w2.escapes);
        if (w2.escapes > 0) sawEscape = true;
        if (w2.carrier) { caught = true; caughtCount++; break; }
        if (i % 6 === 0) {
          const bb2 = D.birds().find((q) => q.name === NAME);
          trace.push(`${bb2 ? bb2.anim : '-'}/${Math.hypot((bb2 ? bb2.x : 0) - w2.x, (bb2 ? bb2.z : 0) - w2.z).toFixed(1)}/e${w2.escapes}`);
        }
      }
    }
    okMotion('벌레를 한 번에 물지 않고 놓치기도 한다', sawEscape, `놓친 횟수 최대 ${maxEsc}`);
    okMotion('그래도 결국 잡는다', caughtCount >= 4, `6판 중 ${caughtCount}판 성공 (놓친 횟수 최대 ${maxEsc}) ` + (caughtCount >= 4 ? '' : trace.slice(-12).join(' ')));
    ok('벌레가 두 번 넘게 도망치지는 못한다', maxEsc <= 2, `최대 ${maxEsc}회 (기준 2)`);

    // ── 21. 모이통 둘 ──
    // 통이 하나면 병아리와 암탉이 같이 있을 때 한쪽은 반드시 틀린 사료를 먹는다.
    // 아이가 제대로 할 방법이 없는 상태였다 — 그건 배움이 아니라 벌이다.
    T.showProp('feeder2', true);
    T.setFeed('starter', 'layer');
    D.grow(NAME, 'chick');
    const pickChick = T.feederFor(NAME);
    D.grow(NAME, 'hen');
    const pickHen = T.feederFor(NAME);
    ok('닭마다 제 사료가 든 통으로 간다',
      pickChick === 'feeder' && pickHen === 'feeder2',
      `병아리 → ${pickChick} · 암탉 → ${pickHen}`);
    // 틀린 사료를 먹어도 건강은 깎지 않는다 (덜 배부르기만)
    T.setFeed('layer', 'layer');
    D.grow(NAME, 'chick');
    D.set(NAME, 'health', 100); D.set(NAME, 'hunger', 10);
    const h0 = T.birdStats(NAME).health;
    for (let i = 0; i < 4; i++) T.feedNow(NAME);
    const h1 = T.birdStats(NAME).health;
    ok('틀린 사료를 먹어도 건강은 깎이지 않는다', h1 >= h0, `건강 ${h0} → ${h1}`);
    const hun = T.birdStats(NAME).hunger;
    ok('틀린 사료는 덜 배부르다', hun > 10 && hun < 10 + 4 * 30, `배부름 10 → ${Math.round(hun)} (맞으면 4번에 +140)`);
    T.setFeed('starter', 'grower');

    // ── 22. 암탉이 갓 깬 병아리를 품는다 ──
    // 알을 품던 그대로 새끼를 날개 밑에 품는다. 보온등은 원래 이것을 대신하는 물건이라,
    // 품은 병아리는 등이 꺼져 있어도 따뜻해야 한다.
    T.setWeather('cold');
    T.setMouse(-1, -1);                        // 앞 검사가 켜 둔 커서를 끈다 (안 그러면 커서를 쫓는다)
    D.lamp(0);                                 // 등을 끈다 — 어미만으로 따뜻해지는지 본다
    const momName = T.addBird('hen', '어미');
    const mom = momName ? { name: momName } : null;
    if (mom) {
      D.grow(NAME, 'chick');
      T.makeMom(mom.name, NAME);
      T.place(mom.name, 0, -8); T.place(NAME, 0.4, -7.7);
      T.hoverNow(mom.name);
      let tucked = false;
      for (let i = 0; i < 26; i++) {
        // 앞 검사가 걸어 둔 holdStill 때문에 병아리가 한참 판단을 안 한다.
        // 그 상태로 기다리면 품기가 아니라 '기다림'을 재게 된다.
        T.decideNow(NAME);
        await wait(200);
        const hs = T.hoverState(NAME);
        if (hs && hs.tucked) { tucked = true; break; }
      }
      okMotion('병아리가 어미 날개 밑으로 든다', tucked,
        tucked ? '' : `새끼 ${JSON.stringify(T.hoverState(NAME))} · 어미 ${JSON.stringify(T.hoverState(mom.name))}`);
      const hs2 = T.hoverState(NAME);
      okMotion('품긴 병아리는 보온등이 꺼져 있어도 따뜻하다',
        !tucked || hs2.comfort === 'ok', `보온등 0 · 추운 날 · 상태 ${hs2 ? hs2.comfort : '-'}`);
    }
    T.setWeather('clear'); D.lamp(1);

    // ── 23. 모이통은 따로 찬다 ──
    // 어느 통을 눌러도 둘 다 차면, 통을 둘로 나눈 뜻이 없다 (사료를 따로 쓰려고 나눈 것이다).
    T.showProp('feeder2', true);
    T.setFeedAmounts(0, 0);
    T.fillFeeder('feeder');
    const fa = T.feedAmounts();
    ok('한 통을 채워도 다른 통은 그대로', fa.a > 90 && fa.b === 0, `빨강 ${fa.a}% · 파랑 ${fa.b}%`);
    T.fillFeeder('feeder2');
    const fb = T.feedAmounts();
    ok('다른 통도 따로 채워진다', fb.a > 90 && fb.b > 90, `빨강 ${fb.a}% · 파랑 ${fb.b}%`);
    // 오른쪽 버튼으로 사료 바꾸기
    T.setFeed('starter', 'grower');
    const cy = T.cycleFeed('feeder');
    ok('오른쪽 버튼으로 사료가 바뀐다', cy.a === 'grower' && cy.b === 'grower', `빨강 starter → ${cy.a}`);
    T.setFeed('starter', 'grower');

    // ── 24. 달걀은 팔아야 코인이 된다 ──
    // 예전에는 낳는 순간 코인이 들어와서, 바구니가 그냥 숫자판이었다.
    const e0 = T.eggs();
    T.setEggs(3);
    const e1 = T.eggs();
    ok('알을 낳아도 코인이 저절로 늘지 않는다', e1.coins === e0.coins, `코인 ${e0.coins} → ${e1.coins}`);
    T.sellEggs();                              // 할머니가 묻는다
    // 할머니 말은 한 글자씩 찍히고, 다 찍혀야 버튼이 생긴다.
    // 글자는 프레임마다 찍히므로 소프트웨어 렌더링(CI 3fps)에서는 몇 배 느리다 — 시간으로 넉넉히 기다린다.
    for (let i = 0; i < 100 && !T.grannyButtons().length; i++) await wait(150);
    T.clickGranny(0);                          // '팔게요'
    for (let i = 0; i < 30 && T.eggs().basket !== 0; i++) await wait(150);
    const e2 = T.eggs();
    ok('바구니를 누르면 달걀이 코인이 된다', e2.basket === 0 && e2.coins === e1.coins + 3,
      `달걀 3개 → 코인 ${e1.coins} → ${e2.coins}`);

    // ── 25. 커서에 질린다 ──
    // 가만히 둔 커서를 끝없이 쪼아 대던 것. 한 번 쪼면 커서가 움직여야 다시 쫀다.
    ok('커서가 오래 멈춰 있으면 흥미를 잃는다', T.cursorBored() > 2 && T.cursorBored() < 30,
      `${T.cursorBored()}초 뒤 흥미를 잃음`);

    // ── 26. 땅을 두 번 누르면 휘파람 ──
    T.place(NAME, -6, -10);
    D.set(NAME, 'aff', 95); D.set(NAME, 'stress', 0);
    const wpt = T.screenOfPoint(5, 0, -5);
    const called = T.whistleAt(wpt.x, wpt.y);
    ok('땅을 두 번 누르면 닭을 부른다', called > 0, `${called}마리가 달려옴`);
    // 누른 곳으로 와야 한다. 예전에는 앞뒤 위치가 -1.6~1.6 에 묶여 있어서(바탕화면 펫 시절의 흔적)
    // 마당 어디를 눌러도 맨 앞줄로 모였다.
    {
      const far = T.screenOfPoint(-4, 0, -20);
      let tgt = null;
      for (let i = 0; i < 5 && !tgt; i++) {
        D.set(NAME, 'aff', 95);
        T.whistleAt(far.x, far.y);
        tgt = T.callTargetOf(NAME);
      }
      ok('부르면 누른 자리로 온다 (맨 앞줄이 아니라)', !!tgt && Math.abs(tgt.z - (-20)) < 1.5, tgt ? `누른 곳 z -20 · 가는 곳 z ${tgt.z}` : '부름에 안 옴');
      const lk = T.lookSpot();
      let t2 = null;
      // 앞의 부름이 남아 있으면 그 자리를 잰다 — 먼저 비운다
      for (let i = 0; i < 5 && !t2; i++) { T.holdStill(NAME, 1); D.set(NAME, 'aff', 95); T.whistleAt(-1, -1); t2 = T.callTargetOf(NAME); }
      ok('휘파람 단추는 보고 있는 곳으로 부른다', !!t2 && Math.abs(t2.z - lk.z) < 1.5, t2 ? `화면 가운데 z ${lk.z.toFixed(1)} · 가는 곳 z ${t2.z}` : '부름에 안 옴');
    }

    // ── 27. 이름 바꾸기 창이 실제로 화면에 보인다 ──
    // prompt() 를 걷어내고 화면 안 입력창으로 바꾸면서 CSS 를 빠뜨려,
    // 버튼은 멀쩡한데 창이 화면 밖에 그려져 이름을 못 바꾸는 일이 있었다.
    // '보이는가'는 좌표로 본다 — 숨김 여부만 보면 또 놓친다.
    T.openMenu('coop');
    await wait(400);
    const pen = document.querySelector('#flockList [data-act="rename"]');
    ok('닭장 카드에 이름 바꾸기 단추가 있다', !!pen, pen ? '' : '✏️ 단추를 못 찾음');
    if (pen) {
      pen.click();
      await wait(300);
      const card = document.querySelector('.askCard');
      const r = card.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      const onTop = card.contains(document.elementFromPoint(cx, cy));
      ok('이름 바꾸기 창이 화면 안에 보인다',
        r.width > 100 && r.height > 60 && r.top >= 0 && r.left >= 0
        && r.bottom <= innerHeight && r.right <= innerWidth && onTop,
        `창 위치 ${Math.round(r.left)},${Math.round(r.top)} 크기 ${Math.round(r.width)}×${Math.round(r.height)} · 화면 ${innerWidth}×${innerHeight} · 맨 앞 ${onTop}`);
      document.querySelector('#askInput').value = '깜별이';
      document.querySelector('#askOk').click();
      await wait(400);
      ok('이름이 실제로 바뀐다', !!T.stateOf('깜별이'), '새 이름으로 찾은 닭: ' + (T.stateOf('깜별이') ? '있음' : '없음'));
    }
    T.closeMenu();

    // ── 27-2. 모든 창이 화면 맨 앞에 뜬다 ──
    // 이름 바꾸기 창에 이어 가게 창도 위치 CSS 가 없어 3D 화면 뒤에 깔려 있었다.
    // 창을 하나씩 열어 '가운데 한 점을 누르면 그 창이 눌리는가'로 잰다.
    {
      const front = (sel) => {
        const el = document.querySelector(sel); if (!el) return 'no-el';
        const r = el.getBoundingClientRect();
        if (r.width < 50 || r.height < 50) return `작음 ${Math.round(r.width)}×${Math.round(r.height)}`;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(30, r.height / 2));
        return el.contains(hit) ? 'ok' : `뒤에 깔림 (${r.left | 0},${r.top | 0})`;
      };
      document.querySelector('#btnShop').click(); await wait(200);
      const shopF = front('.shopCard');
      document.querySelector('#closeShop').click(); await wait(100);
      document.querySelector('#btnDex').click(); await wait(200);
      const jF = front('.jCard');
      document.querySelector('#closeJournal').click(); await wait(100);
      T.openMenu('coop'); await wait(200);
      const pF = front('#panel');
      T.closeMenu();
      ok('가게·관찰일지·메뉴 창이 모두 맨 앞에 뜬다', shopF === 'ok' && jF === 'ok' && pF === 'ok', `가게 ${shopF} · 관찰일지 ${jF} · 메뉴 ${pF}`);
      document.querySelector('#btnShop').click(); await wait(150);
      document.querySelector('#shopModal').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      ok('가게는 바깥을 눌러도 닫힌다', document.querySelector('#shopModal').classList.contains('hidden'), '');
    }

    // ── 28. 행동 도감 ──
    // 아이들이 지렁이 9마리를 10분 만에 다 주고 "또 할 거 없어요?" 했다. 지켜보게 만드는 장치.
    const c28 = T.coins();
    const d1 = T.dexTry(NAME, 'dustbath');
    ok('행동하는 순간 누르면 도감에 오른다', d1 === 'new' && T.dexState().ids.includes('dustbath'), `결과 ${d1}`);
    ok('처음 찾은 행동은 1코인', T.coins() === c28 + 1, `코인 ${c28} → ${T.coins()}`);
    const d2 = T.dexTry(NAME, 'dustbath');
    ok('두 번째부터는 설명만 (코인 없음)', d2 === 'seen' && T.coins() === c28 + 1, `결과 ${d2} · 코인 ${T.coins()}`);
    // 방금 끝난 행동은 1.5초 봐준다 (아이 손이 닭보다 느리다). 그 뒤에는 평범하게 서 있는 것일 뿐이다.
    ok('방금 끝난 행동도 잠깐은 알아본다', T.dexTry(NAME, 'idle') === 'seen', '');
    await wait(1700);
    ok('평범하게 서 있을 때는 도감에 안 오른다', T.dexTry(NAME, 'idle') === null, '');
    const fc = T.farmCode();
    const fcBack = fc ? T.readFarmCode(fc) : null;
    ok('농장 코드로 옮겨도 도감이 따라간다', !!(fcBack && fcBack.dex && fcBack.dex.includes('dustbath')), fcBack ? `코드 속 도감 ${JSON.stringify(fcBack.dex)}` : '코드 없음');

    // ── 29. 땅 파기 — 진짜 마우스로 ──
    // 꾹 누르면 파고, 끌면 화면 옮기기. 둘이 섞이면 확대한 아이가 화면을 옮기다 땅을 판다.
    const cv = document.querySelector('#stageHost canvas');
    let spot = null;
    for (const [gx, gz] of [[5, -6], [-5, -6], [6, 2], [-6, 2], [0, 4], [8, -12], [-8, -12]]) {
      const sp = T.screenOfPoint(gx, 0, gz);
      if (!sp) continue;
      const hit = T.pickAt(sp.x, sp.y);
      if (!hit || hit.type === 'ground') { spot = sp; break; }
    }
    ok('파 볼 빈 땅을 찾았다', !!spot, '');
    if (spot && cv) {
      const fire = (type, x, y) => (type === 'mouseup' ? window : cv).dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
      T.clearWorm();
      const t0 = T.digState().tries;
      fire('mousedown', spot.x, spot.y);
      await wait(1100 + 900 * SLOW);
      fire('mouseup', spot.x, spot.y);
      ok('빈 땅을 꾹 누르고 있으면 판다', T.digState().tries === t0 + 1, `판 횟수 ${t0} → ${T.digState().tries}`);
      const t1 = T.digState().tries;
      fire('mousedown', spot.x, spot.y);
      await wait(150);
      fire('mousemove', spot.x + 40, spot.y + 10);
      await wait(1100 + 900 * SLOW);
      fire('mouseup', spot.x + 40, spot.y + 10);
      ok('누른 채 끌면 파지 않는다', T.digState().tries === t1, `판 횟수 ${t1} → ${T.digState().tries}`);
    }
    T.clearWorm();
    const got = T.digAt(4, -6, true);
    ok('지렁이가 나오면 마당에 기어 나온다', got === 'worm' && T.digState().worm, `결과 ${got}`);
    T.clearWorm();
    for (let i = 0; i < 10 && T.digState().found < T.digState().max; i++) { T.digAt(4, -6, true); T.clearWorm(); }
    const over = T.digAt(4, -6, true);
    ok('하루에 찾는 지렁이 수에는 끝이 있다', over === 'done', `${T.digState().found}/${T.digState().max} 뒤 결과 ${over}`);
    T.clearWorm();

    // ── 30. 코인이 모자랄 때 — 그 아이에게 맞는 길만 ──
    T.setEggs(0);
    const w0 = T.coinWays();
    ok('팔 달걀이 없으면 달걀 팔기를 권하지 않는다', !w0.some((w) => w.includes('바구니')), w0.join(' / '));
    T.setEggs(2);
    ok('달걀이 있으면 팔기를 알려 준다', T.coinWays().some((w) => w.includes('바구니')), '');
    T.setEggs(0);

    // ── 31. 퀴즈는 선생님 검토 전에는 숨어 있다 ──
    T.openMenu('coop');
    await wait(200);
    const qb = document.querySelector('#btnQuiz');
    ok('퀴즈 단추는 켜졌을 때만 보인다', T.quizReady() ? !qb.classList.contains('hidden') : qb.classList.contains('hidden'), `READY ${T.quizReady()}`);
    T.closeMenu();
    const qid = T.quizAsk();
    for (let i = 0; i < 100 && T.grannyButtons().length < 4; i++) await wait(150);
    ok('퀴즈는 보기 4개로 묻는다', !!qid && T.grannyButtons().length === 4, `문제 ${qid} · 보기 ${T.grannyButtons().length}`);
    T.clickGranny(0);
    for (let i = 0; i < 100 && !/맞았다|답은/.test(T.grannyText()); i++) await wait(150);
    ok('답하면 맞았는지와 까닭을 알려 준다', /맞았다|답은/.test(T.grannyText()), T.grannyText().slice(0, 40));
    for (let i = 0; i < 40 && !T.grannyButtons().length; i++) await wait(150);
    const gb = T.grannyButtons();
    if (gb.length) T.clickGranny(gb.length - 1);

    // ── 32. 손 커서 ──
    // 모양이 곧 '여기서 무엇을 할 수 있는지'다. 진짜 마우스 움직임으로 바뀌는지 본다.
    {
      const cvs = document.querySelector('#stageHost canvas');
      const mv = (type, x, y) => (type === 'mouseup' ? window : cvs).dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
      const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth); im.onerror = () => res(0); im.src = 'cursor/open@2x.png'; });
      ok('손 커서 그림이 웹에 실려 있다', img === 64, `open@2x.png 폭 ${img}px`);
      T.plainCursor(false);
      let ground = null;
      for (const [gx, gz] of [[5, -6], [-5, -6], [6, 2], [-6, 2], [0, 4], [8, -12], [-8, -12]]) {
        const sp = T.screenOfPoint(gx, 0, gz); const hit = sp && T.pickAt(sp.x, sp.y);
        if (sp && (!hit || hit.type === 'ground')) { ground = sp; break; }
      }
      if (ground) { mv('mousemove', ground.x, ground.y); await wait(60); }
      ok('빈 땅 위에서는 편 손', /cursor\/open\.png/.test(T.cursor().css), T.cursor().css.slice(0, 60));
      // 닭은 스스로 움직인다(닭장에 들어가기도 한다). 한 시점의 좌표로 재지 말고, 닭이 있는 곳을 따라가며 확인한다.
      const guest = T.addBird('hen', '손님');
      let petSeen = false, bs = null;
      const tp = Date.now();
      while (Date.now() - tp < 3000 * SLOW) {
        T.holdStill(guest, 4);
        bs = T.screenOfBird(guest);
        if (bs) { mv('mousemove', bs.x, bs.y); await wait(80); if (T.cursor().kind === 'pet') { petSeen = true; break; } }
        await wait(200);
      }
      ok('닭 위에서는 쓰다듬는 손', petSeen, `${T.cursor().kind} · 닭 화면 ${bs ? bs.x + ',' + bs.y : '-'}`);
      // 닭이 앞에서 밥을 먹고 있으면 그 자리는 '닭 위'다 — 닭이 가리지 않은 기구를 골라 잰다
      let propName = null;
      for (const k of ['basket', 'wormbucket', 'nest', 'feeder2', 'waterer', 'feeder', 'lamp']) {
        const ps = D.screenOf(k); const h = ps && T.pickAt(ps.x, ps.y);
        if (h && h.type === 'prop') { mv('mousemove', ps.x, ps.y); await wait(60); propName = k; break; }
      }
      ok('기구 위에서는 가리키는 손', !!propName && /cursor\/point\.png/.test(T.cursor().css), `${propName || '-'} 위 · ${T.cursor().kind}`);
      // 닭은 계속 움직인다 — 누르기 바로 전에 빈 땅을 다시 고른다 (고른 자리에 닭이 걸어 들어오면 파기가 아니라 쓰다듬기가 된다)
      ground = null;
      for (const [gx, gz] of [[8, -12], [-8, -12], [5, -6], [-5, -6], [6, 2], [-6, 2], [0, 4], [10, -18], [-10, -18]]) {
        const sp = T.screenOfPoint(gx, 0, gz); const hit = sp && T.pickAt(sp.x, sp.y);
        if (sp && (!hit || hit.type === 'ground')) { ground = sp; break; }
      }
      if (ground) {
        T.clearWorm();
        mv('mousemove', ground.x, ground.y); await wait(60);
        const hitAt = T.pickAt(ground.x, ground.y);
        mv('mousedown', ground.x, ground.y);
        const holding0 = T.digState().holding;
        // 누르는 동안(0.25~1.1초) 한 번이라도 호미가 되는지 본다 — 한 시점만 보면 느린 기계에서 이미 다 판 뒤일 수 있다
        let during = 'open';
        const t0h = Date.now();
        while (Date.now() - t0h < 1000) { if (T.cursor().kind === 'hoe') { during = 'hoe'; break; } await wait(40); }
        mv('mouseup', ground.x, ground.y);
        await wait(100);
        ok('땅을 꾹 누르면 호미 쥔 손', during === 'hoe' && T.cursor().kind !== 'hoe', `누르는 중 ${during} → 뗀 뒤 ${T.cursor().kind}` + (during === 'hoe' ? '' : ` · 누른 곳 ${hitAt ? hitAt.type : '빈 곳'} · 파기 시작 ${holding0} · ${ground.x},${ground.y}`));
        T.clearWorm();
      }
      T.setCursorKind('open');
      T.peckHand();
      await wait(80);
      const mid = T.cursor().kind;
      await wait(500);
      ok('닭이 쪼면 손이 잠깐 움찔한다', mid === 'flinch' && T.cursor().kind === 'open', `${mid} → ${T.cursor().kind}`);
      const plain = T.plainCursor(true);
      ok('설정에서 기본 화살표로 돌릴 수 있다', plain === 'default', plain);
      T.plainCursor(false);
    }

    // ── 33. 꾸미기 ── 아이들이 "너무 적어요" 했다 (18개였다)
    {
      const items = T.shopItems();
      const prices = items.filter((i) => i.price > 0).map((i) => i.price);
      ok('꾸미기 물건이 50개가 넘는다', items.length >= 50, `${items.length}개`);
      ok('싼 것부터 큰 목표까지 값이 고르다', Math.min(...prices) <= 5 && Math.max(...prices) >= 60, `${Math.min(...prices)} ~ ${Math.max(...prices)}코인`);
      const kinds = T.decoKinds();
      const noModel = items.filter((i) => i.kind === 'deco' && !kinds.includes(i.id)).map((i) => i.id);
      const badDeco = T.tryAllDecos();
      ok('모든 마당 장식에 3D 모형이 있다', !noModel.length && !badDeco.length, [...noModel, ...badDeco].join(', '));
      const badHat = T.tryAllHats(NAME);
      ok('모든 모자가 오류 없이 씌워진다', !badHat.length, badHat.join(', '));
      const SH = window.TP.shop;
      ok('철 한정 물건은 그 철에만 판다',
        SH.inSeason(SH.get('hat', 'santa'), '2026-12-20') && !SH.inSeason(SH.get('hat', 'santa'), '2026-09-22')
        && SH.inSeason(SH.get('hat', 'gat'), '2026-09-22') && SH.inSeason(SH.get('deco', 'rock'), '2026-06-01'), '');

      // 보관함 — 치워도 코인이 사라지지 않는다
      T.coins(50);
      const before = T.decoState().placed.filter((k) => k === 'rock').length;
      T.shopPick('deco', 'rock');
      const c1 = T.coins();
      ok('장식을 사면 마당에 놓인다', T.decoState().placed.filter((k) => k === 'rock').length === before + 1 && c1 === 47, `코인 50 → ${c1}`);
      T.storeDeco('rock');
      const ds = T.decoState();
      ok('[보관]하면 보관함에 들어간다 (코인은 그대로)', (ds.stored.rock || 0) >= 1 && T.coins() === c1, `보관함 ${JSON.stringify(ds.stored)} · 코인 ${T.coins()}`);
      T.shopPick('deco', 'rock');
      ok('보관함에서 다시 놓으면 공짜다', T.coins() === c1 && (T.decoState().stored.rock || 0) === (ds.stored.rock - 1), `코인 ${T.coins()}`);

      // 모자 벗기기 — 닭을 고르지 않고 가게를 열어도 모자를 씌울 수 있다
      const who = T.openShopUi('hat');
      ok('가게를 열면 모자 씌울 닭이 골라져 있다', !!who, `고른 닭 ${who}`);
      T.hatRaw(who, 'cap');
      T.openShopUi('hat');
      await wait(100);
      const offBtn = document.querySelector('#shopGrid [data-act="hatoff"]');
      if (offBtn) offBtn.click();
      await wait(100);
      ok('모자 벗기기 단추로 벗는다', !!offBtn && !document.querySelector('#shopGrid [data-act="hatoff"]'), offBtn ? '' : '단추가 없음');
      document.querySelector('#closeShop').click();
    }

    // ── 34. 마당 장식에 부딪힌다 ──
    {
      const wb = T.addBird('hen', '벽돌이');
      T.clearWorm();
      T.setDecosRaw([{ kind: 'well', x: 0, z: -10 }, { kind: 'fence', x: 8, z: -18 }, { kind: 'pond', x: -8, z: -6 }, { kind: 'well', x: 0, z: -22 }]);
      // 장식 한가운데 놓아도 밖으로 나온다
      T.place(wb, 0, -10); T.holdStill(wb, 6);
      await wait(900 * SLOW + 300);
      const in1 = T.insideDeco(wb);
      ok('장식 속에 들어가 있으면 밖으로 밀려난다', in1.over < 0.12, `우물에 ${in1.over} 박힘`);
      // 울타리는 길다 — 원 하나가 아니라 막대로 막아야 끝부분도 막힌다
      T.place(wb, 9.1, -18); T.holdStill(wb, 6);
      await wait(900 * SLOW + 300);
      const in2 = T.insideDeco(wb);
      ok('긴 울타리는 끝부분도 막힌다', in2.over < 0.12, `울타리에 ${in2.over} 박힘`);
      // 건너편으로 걸어가면 뚫지 않고 비껴 돌아간다
      T.place(wb, -4.5, -22);
      T.walkTo(wb, 4.5, -22);
      let worst = 0; const tw = Date.now();
      // 닭은 가다가 스스로 다른 일을 고르기도 한다 — 여기서 재려는 것은 '길 찾기'라 목적지를 계속 다시 준다
      const trail = [];
      while (Date.now() - tw < 9000 * SLOW) {
        worst = Math.max(worst, T.insideDeco(wb).over);
        const me = D.birds().find((q) => q.name === wb);
        trail.push(`${me.x.toFixed(1)},${me.z.toFixed(1)}:${me.anim}`);
        if (me.x > 3.5) break;
        if (me.anim !== 'walk') T.walkTo(wb, 4.5, -22);
        await wait(120);
      }
      window.__trail = trail;
      const endX = D.birds().find((q) => q.name === wb).x;
      ok('걸어가도 우물을 뚫고 지나가지 않는다', worst < 0.3, `가장 깊이 박힌 정도 ${worst.toFixed(2)}`);
      okMotion('우물에 막히면 옆으로 돌아서 건너간다', endX > 3, `x -4.5 → ${endX}` + (endX > 3 ? '' : ` · 발자국 ${trail.filter((_, i) => i % 6 === 0).slice(-8).join(' ')}`));
      // 기구와 장식 사이 틈에 끼여도 영영 제자리걸음하지 않는다
      T.place(wb, -4.5, -10.5);
      T.walkTo(wb, 4.5, -10);
      let gaveUp = false; const tg = Date.now();
      while (Date.now() - tg < 7000 * SLOW) { const me = D.birds().find((q) => q.name === wb); if (me.anim !== 'walk' || me.x > 3.5) { gaveUp = true; break; } await wait(150); }
      okMotion('틈에 끼이면 제자리걸음하지 않고 돌아선다', gaveUp, gaveUp ? '' : '7초 넘게 같은 곳을 향해 걷는 중');
      // 벌레가 웅덩이 속으로 기어 들어가면 닭이 영영 못 잡는다
      // (땅 파기는 앞 검사에서 오늘 몫을 다 써서, 벌레통에서 떨어뜨린다)
      T.dropWormAt(-8, -6);
      await wait(700 * SLOW + 200);
      const w = T.wormState();
      const wd = w ? Math.hypot(w.x - (-8), (w.z - (-6)) * 1.35) : -1;
      ok('벌레는 웅덩이 속에 있지 않는다', !!w && wd >= 1.1, w ? `웅덩이 가운데서 ${wd.toFixed(2)}` : '벌레가 안 나왔다 (검사 준비 실패)');
      T.clearWorm();
      T.setDecosRaw([]);
    }

    // ── 35. 친구 닭 놀러 오기 ──
    // 예전에는 친구 코드를 넣으면 우리 닭이 친구 닭으로 '바뀌었다'. 초대인 줄 알고 넣은 아이가 농장을 잃을 수 있었다.
    {
      const mine0 = T.ownCount();
      const code = T.farmCode();
      const n = T.receive(code);
      for (let i = 0; i < 100 && T.grannyButtons().length < 2; i++) await wait(150);
      const btns = T.grannyButtons();
      ok('코드를 넣으면 먼저 "놀러 오게 할까?"를 묻는다', /놀러/.test(btns[0] || ''), btns.join(' / '));
      T.clickGranny(0);                                        // 놀러 오게 하기
      await wait(300);
      for (let i = 0; i < 60 && T.grannyButtons().length && !T.visitors().length; i++) {
        const bb = T.grannyButtons(); const all = bb.findIndex((t) => /모두/.test(t));
        if (all >= 0) T.clickGranny(all); await wait(200);
      }
      const vs = T.visitors();
      ok('친구 닭이 놀러 온다', vs.length >= 1 && vs.length <= 3, `${vs.length}마리 · ${vs.map((v) => v.name).join(', ')}`);
      ok('놀러 와도 우리 닭은 그대로다', T.ownCount() === mine0, `우리 닭 ${mine0} → ${T.ownCount()}`);
      const fc2 = T.readFarmCode(T.farmCode());
      ok('놀러 온 닭은 내 닭 코드에 섞이지 않는다', fc2 && fc2.birds.length === mine0, `코드 속 ${fc2 ? fc2.birds.length : '-'}마리`);
      ok('손님은 최대 3마리', T.invite([{ name: 'a', stage: 'hen' }, { name: 'b', stage: 'hen' }, { name: 'c', stage: 'hen' }, { name: 'd', stage: 'hen' }]) <= 3 - vs.length && T.visitors().length <= 3, `${T.visitors().length}마리`);
      const left = T.ageVisitors();
      ok('다음 날이면 집으로 돌아간다', left === 0 && T.ownCount() === mine0, `남은 손님 ${left}`);
      // 옮겨 오기는 한 번 더 묻고, 그때도 '놀러 오게 할래요'가 먼저다
      T.receive(code);
      for (let i = 0; i < 100 && T.grannyButtons().length < 2; i++) await wait(150);
      T.clickGranny(1);                                        // 내 닭 옮겨 오기
      for (let i = 0; i < 100 && !/되돌릴 수 없어/.test(T.grannyText()); i++) await wait(150);
      for (let i = 0; i < 60 && T.grannyButtons().length < 2; i++) await wait(150);
      const b2 = T.grannyButtons();
      ok('옮겨 오기는 한 번 더 묻고, 안전한 쪽이 먼저다', /되돌릴 수 없어/.test(T.grannyText()) && /놀러/.test(b2[0] || ''), b2.join(' / '));
      T.ageVisitors();
      for (let i = 0; i < 20 && T.grannyButtons().length; i++) { const bb = T.grannyButtons(); T.clickGranny(bb.length - 1); await wait(200); if (T.visitors().length) T.ageVisitors(); }
    }

    ok('보온등이 꺼짐→약→중→강→꺼짐 으로 돈다',
      seq.length === 5 && seq[0] === 0.35 && seq[1] === 0.65 && seq[2] === 1 && seq[3] === 0 && seq[4] === 0.35,
      seq.join(' → '));
  } catch (e) {
    ok('검사 도중 오류', false, String(e && e.stack || e));
  }
  return out;
})()
