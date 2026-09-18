// 자동 검증 — 렌더러 안에서 돈다. scripts/check.js 가 Electron 에 넣어 실행한다.
// 그동안 실제로 났던 버그를 하나씩 되짚는다. 새 버그를 만나면 여기에 항목을 더한다.
(async () => {
  const T = window.__tpTest, D = window.__tp;
  const out = [];
  const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (n) => Math.round(n * 100) / 100;

  try {
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
    while (Date.now() - t0 < 40000) {
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
    ok('보온등까지 스스로 간다', reached < 4.5, `${round(startDist)} → ${round(reached)} (${Math.round((Date.now() - t0) / 1000)}초)`);
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
    const sameName = !back.error && back.birds[0] && back.birds[0].name === NAME;
    ok('농장 코드를 만들고 다시 읽는다', sameName,
      back.error || `${back.birds.length}마리(${back.birds.map((b) => b.name).join(',')}) · ${code.length}자`);
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
  } catch (e) {
    ok('검사 도중 오류', false, String(e && e.stack || e));
  }
  return out;
})()
