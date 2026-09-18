// 티처펫 — 렌더러. 닭 한살이 시뮬레이션 + 교사 도구
// 상수는 core/config.js, 저장·마이그레이션은 core/state.js, 성격·기분은 sim/mind.js,
// 애니메이션 메타는 sim/actions.js, 닭이 아닌 오브젝트는 sim/entities.js 에 있다.
(() => {
  const api = window.teacherpet;
  const THREE = window.THREE;
  const { util: U, config: C, state: ST, mind: MIND, actions: ACT, entities: ENT, hygiene: HYG, health: HLT, school: SCH, granny: GR, journal: JR, bus } = window.TP;
  const { $, $$, now, today, rand, pick, clamp, uid, esc } = U;
  const { RULE, PX_PER_UNIT, STAGE_KO, STAGE_ORDER, SPEED, NAMES, PROP_NAMES, PROP_KO } = C;
  const { trait, moodOf, rank, TRAIT_DESC } = MIND;

  // ---- 상태 ----
  let state = ST.defaultState();
  let dirty = false;
  const markDirty = () => { dirty = true; };
  async function persist() {
    state.lastSeen = now();
    const r2 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : v);
    for (const b of birds) {
      b.d.x = Math.round(toFrac(b.x) * 1e4) / 1e4; b.d.z = r2(b.z);
      // 반올림은 기댓값 편향이 0이라 욕구가 느려지지 않는다
      for (const k of ['hunger', 'thirst', 'happy', 'aff', 'energy', 'boredom', 'social', 'stress', 'health', 'clean']) b.d[k] = r2(b.d[k]);
    }
    state.poops = HYG.serialize();
    await api.saveState(state);
    dirty = false;
  }
  setInterval(() => { if (dirty) persist(); }, 3000);
  setInterval(persist, 60000);

  // ---- 3D 무대 ----
  const world = window.TP_WORLD.create($('#stageHost'));
  const canvas = world.renderer.domElement;
  let W = innerWidth, H = innerHeight;
  const XMARGIN = 1.2; // 화면 가장자리 여유(유닛)
  const BASE_PX = 33;  // 기준 배율. 확대/축소는 마우스 휠, 시점은 우클릭 드래그.
  function resize() {
    if (innerWidth < 2 || innerHeight < 2) return;   // 숨겨진 탭·회전 중에는 건드리지 않는다
    W = innerWidth; H = innerHeight;
    // 마당을 화면의 얼마까지 쓸지 — 세로로 길수록 넓게 쓴다.
    // 가로 데스크톱은 기존 0.35 근처, 세로 태블릿·휴대폰은 0.16까지 내려가
    // 하늘만 가득하던 화면이 마당으로 채워진다.
    world.roamTop = clamp(0.46 - 0.22 * (H / Math.max(1, W)), 0.16, 0.38);
    world.elevDeg = clamp(state.settings.elev ?? 24, 16, 55);
    // 하늘과 잔디의 경계(CSS)도 같은 값을 따라간다
    document.documentElement.style.setProperty('--horizon', (world.roamTop * 100).toFixed(1) + '%');
    world.fit(W, H, BASE_PX * clamp(state.settings.zoom ?? 1, 0.55, 2.2));
    layoutHome();
    for (const b of birds) b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN);
  }
  addEventListener('resize', resize);
  // 닭장 세트 배치 (월드 유닛). 왼쪽 가장자리 기준, 오른쪽이면 거울
  // 매 프레임 닭마다 불리므로 캐시한다. 배치가 바뀌는 곳은 layoutHome() 하나뿐이다.
  let homeCache = null;
  const LAYOUT_SPAN = 25.5;   // 기본 배치가 필요로 하는 가로 폭(유닛)
  function home() {
    if (homeCache) return homeCache;
    const left = state.settings.homeSide === 'left';
    // 화면이 좁으면(세로 태블릿·휴대폰) 배치 전체를 같은 비율로 줄여 화면 안에 넣는다.
    // 넓은 화면에서는 k = 1 이라 기존 배치 그대로다.
    const avail = (world.xMax - world.xMin) - XMARGIN * 2;
    const k = clamp(avail / LAYOUT_SPAN, 0.42, 1);
    const bx = (d) => (left ? world.xMin + XMARGIN + d * k : world.xMax - XMARGIN - d * k);
    // 앞뒤 위치는 '마당 깊이의 몇 %'로 정한다. 0 = 맨 뒤, 1 = 맨 앞.
    // 고정 좌표를 쓰면 세로 화면에서 소품이 전부 화면 맨 아래에 몰린다.
    const zNear = world.zMax - 0.8, zFar = world.zMin + 1.0;
    const USE = 0.78;                       // 맨 뒤쪽은 빈 마당으로 남겨 둔다
    const bz = (t) => zNear - (zNear - zFar) * USE * (1 - t);
    // 관련된 것끼리 모은다 — 닭장·둥지·보온등은 뒤쪽 한 덩어리(잠자리),
    // 모이통·물통은 가운데(매일 쓰는 것), 바구니·벌레통은 앞쪽(손이 자주 가는 것),
    // 모래 목욕터는 구석. 아이가 "여기가 자는 곳, 여기가 먹는 곳"으로 읽을 수 있게.
    const def = {
      coop: { x: bx(2.0), z: bz(0.06) }, nest: { x: bx(6.2), z: bz(0.20) }, lamp: { x: bx(4.0), z: bz(0.40) },
      feeder: { x: bx(9.4), z: bz(0.62) }, waterer: { x: bx(12.6), z: bz(0.56) },
      basket: { x: bx(16.0), z: bz(0.92) }, wormbucket: { x: bx(19.0), z: bz(0.86) },
      dustpit: { x: bx(22.6), z: bz(0.30) },
    };
    const pos = state.settings.propPos || {}, hid = state.settings.propHidden || {};
    const out = { flip: !left };
    for (const k of PROP_NAMES) {
      const u = pos[k];
      out[k] = u ? { x: world.xMin + u.fx * (world.xMax - world.xMin), z: u.z } : def[k];
      out[k].visible = !hid[k];
    }
    return (homeCache = out);
  }
  const propVisible = (k) => !(state.settings.propHidden || {})[k];
  // 꾸미기 모드 — 평소에는 소품이 고정이다.
  // 교실에서 "화면이 이상해졌어요"는 수업 흐름을 끊는 1순위 사고라, 옮기려면 모드를 켜야 한다.
  let editMode = false;
  function setEdit(on) {
    editMode = !!on;
    document.body.classList.toggle('editing', editMode);
    const t = $('#editTip');
    if (t) t.classList.toggle('hidden', !editMode);
    const btn = $('#wbEdit');
    if (btn) btn.classList.toggle('on', editMode);
  }
  // ── 관찰일지 ──
  // 아이가 따로 적지 않아도 한살이의 '순간'이 스스로 쌓인다.
  async function note(kind, b, once) {
    if (!b || !b.d) return;
    if (once && JR.has(state, kind, b.d.id)) return;
    let photo = null;
    try {
      const pt = world.project(b.x, height(b) * 0.55, b.z);
      const inside = pt && pt.x > 30 && pt.x < world.W - 30 && pt.y > 30 && pt.y < world.H - 30;
      const cx = inside ? pt.x : world.W / 2, cy = inside ? pt.y : world.H * 0.6;
      // 사진은 '그리기 직후'에만 찍을 수 있는데, 탭이 숨겨져 있으면 그리기가 멈춘다.
      // 그때 기다리기만 하면 기록이 통째로 날아간다. 사진은 포기하되 기록은 반드시 남긴다.
      photo = await Promise.race([
        world.capture(cx, cy, 200, 130),
        new Promise((r) => setTimeout(() => r(null), 1500)),
      ]);
    } catch (e) { /* 사진은 없어도 기록은 남는다 */ }
    if (JR.record(state, kind, b, photo)) markDirty();
  }

  // ══════════ 할머니 ══════════
  // 잔소리하지 않고, 실패를 나무라지 않는다. 물어보면 알려주고, 아니면 곁에 있을 뿐이다.
  const guideCfg = () => GR.GUIDE[(state.settings || {}).guide] || GR.GUIDE.often;
  // 초상 — npc/granny.png 이 있으면 그걸 쓰고, 없으면 임시 svg 로 떨어진다.
  // (CSP 가 통신을 막고 있어 파일 존재를 미리 확인할 수 없다. img 의 onerror 로 갈아탄다.)
  const FACE = { normal: 'granny', smile: 'granny_smile', worry: 'granny_worry', proud: 'granny_proud', think: 'granny_think' };
  let curMood = 'normal';
  // 눈 깜빡임은 그림이 더 있어야 한다. 없으면 조용히 건너뛴다.
  // (입 움직임도 만들어 봤으나 두 장을 번갈아 쓰는 방식이 어색해서 뺐다.)
  const extra = {};
  for (const k of ['blink']) {
    const im = new Image();
    im.onload = () => { extra[k] = true; };
    im.src = 'npc/granny_' + k + '.png';
  }
  function frameSrc(kind) {
    if (kind && curMood === 'normal' && extra[kind]) return 'npc/granny_' + kind + '.png';
    return 'npc/' + (FACE[curMood] || FACE.normal) + '.png';
  }
  function setFace(mood) {
    curMood = FACE[mood] ? mood : 'normal';
    const img = $('#gImg'), src = frameSrc(null);
    if (img.getAttribute('src') === src) return;
    img.onerror = () => { img.onerror = null; img.src = 'npc/granny.svg'; };
    img.src = src;
  }
  // 이따금 눈을 깜빡인다 — 정지 그림 한 장 더면 살아 있는 것처럼 보인다.
  // 말하는 중에도 깜빡인다. 사람도 그렇다.
  let blinking = false;
  setInterval(() => {
    const card = $('#granny');
    if (!card || card.classList.contains('hidden') || !extra.blink || blinking) return;
    const img = $('#gImg');
    blinking = true;
    img.src = frameSrc('blink');
    setTimeout(() => { blinking = false; img.src = frameSrc(null); }, 130);
  }, 4200);

  let talking = false, typeTimer = null;
  function stopTyping(full) {
    clearInterval(typeTimer); talking = false;
    if (full !== undefined) $('#gSay').innerHTML = esc(full).replace(/\n/g, '<br>');
    if (!blinking) $('#gImg').src = frameSrc(null);
  }
  function grannySay(text, btns, mood) {
    setFace(mood);
    const card = $('#granny'), box = $('#gBtns'), say = $('#gSay');
    stopTyping();
    box.innerHTML = '';
    card.classList.remove('hidden');

    // 한 글자씩 — 말하고 있다는 느낌이 여기서 나온다. 누르면 바로 다 보인다.
    let i = 0;
    talking = true;
    say.innerHTML = '';
    const finish = () => {
      stopTyping(text);
      for (const b of (btns || [])) {
        const el = document.createElement('button');
        if (b.primary) el.className = 'primary';
        el.innerHTML = esc(b.label) + (b.sub ? `<small>${esc(b.sub)}</small>` : '');
        el.addEventListener('click', b.fn);
        box.appendChild(el);
      }
    };
    typeTimer = setInterval(() => {
      i += 1;
      say.innerHTML = esc(text.slice(0, i)).replace(/\n/g, '<br>');
      if (i >= text.length) finish();
    }, 28);
    card.onclick = () => { if (talking) finish(); };
  }
  function grannyHide() { $('#granny').classList.add('hidden'); }
  function askGranny() {
    const line = GR.advise(state, birds, HYG, (d) => ST.caredToday(d));
    grannySay(line, [{ label: '알겠어요', primary: true, fn: grannyHide }], adviceMood(line));
  }
  // 말의 내용에 따라 표정이 바뀐다
  const adviceMood = (line) => (/별일 없|잘했|고맙/.test(line) ? 'smile' : /아파|다쳤|비었|심하/.test(line) ? 'worry' : 'think');
  // 할머니가 먼저 말을 거는 건 '자주 여쭤볼래요'를 고른 아이에게만
  function nudge() {
    if (!guideCfg().nudge) return;
    if (!$('#granny').classList.contains('hidden')) return;
    if (stepIdx >= 0) return;                       // 첫날 안내 중에는 끼어들지 않는다
    if (now() - lastNudge < 90000) return;
    const line = GR.advise(state, birds, HYG, (d) => ST.caredToday(d));
    if (line === lastLine) return;                  // 같은 말을 두 번 하지 않는다
    lastNudge = now(); lastLine = line;
    grannySay(line, [{ label: '알겠어요', primary: true, fn: grannyHide }], adviceMood(line));
  }
  let lastNudge = 0, lastLine = '';

  // ── 장 ──
  function chapter(n) {
    if ((state.chapter || 0) >= n) return;
    state.chapter = n; markDirty();
    const c = GR.CHAPTERS[n];
    if (c) later0(() => grannySay(c.say, [{ label: '네', primary: true, fn: grannyHide }], n >= 3 ? 'proud' : 'smile'), 1400);
  }
  const later0 = (fn, ms) => setTimeout(fn, ms);

  // ── 첫날 안내: 한 번에 하나씩 ──
  let stepIdx = -1;
  function startSteps() { stepIdx = 0; showStep(); }
  function showStep() {
    const s = GR.STEPS[stepIdx];
    if (!s) { stepIdx = -1; grannyHide(); return; }
    grannySay(s.say, s.last ? [{ label: '알겠어요', primary: true, fn: () => { stepIdx = -1; state.onboarded = true; markDirty(); grannyHide(); } }] : []);
  }
  function checkStep() {
    if (stepIdx < 0) return;
    const s = GR.STEPS[stepIdx];
    if (s && s.done(state)) { stepIdx += 1; showStep(); }
  }

  // ── 대사 장면 — 한 줄씩 넘긴다 (게임 NPC 대화처럼) ──
  function scene(lines, then, mood) {
    let i = 0;
    const step = () => {
      if (i >= lines.length) { then(); return; }
      const line = lines[i++];
      grannySay(line, [{ label: i >= lines.length ? '네' : '계속', primary: true, fn: step }], mood);
    };
    step();
  }
  function startIntro() {
    $('#granny').classList.remove('choose');
    const kid = $('#gKid');
    kid.src = 'npc/kid_back.png'; kid.classList.remove('hidden');   // 아이가 할머니를 마주 본다
    scene([
      '어서 오너라. 먼 길 왔구나.',
      '여기가 우리 농장이란다. 닭들이랑 나랑, 둘이 오래 살았지.',
      '오늘부터 이 마당은 네가 돌보는 거야.',
    ], askGuide);
  }

  // ── 처음 한 번: 안내 수준 고르기 ──
  function askGuide() {
    const pickGuide = (k) => {
      state.settings.guide = k;
      if (GR.GUIDE[k].detail) state.settings.detail = true;
      markDirty();
      $('#granny').classList.remove('choose');
      scene(['그래. 그럼 이 아이부터 보자꾸나.'], () => giveFirstChick(), 'smile');
    };
    $('#granny').classList.add('choose');
    grannySay('그런데 말이다 — 내가 옆에서 얼마나 거들어 줄까?',
      Object.keys(GR.GUIDE).map((k) => ({ label: GR.GUIDE[k].label, sub: GR.GUIDE[k].desc, primary: k === 'often', fn: () => pickGuide(k) })));
  }

  // ── 품앗이: 친구의 수탉을 잠시 빌린다 ──
  // 성별이 무작위라 혼자서는 다음 세대가 없다. 친구에게 코드를 받아야 알이 생긴다.
  function borrowedOk() {
    const b = state.borrowed;
    return !!(b && b.until && today() <= b.until);
  }

  // 보온등을 켜고 끌 때 눈에 보이게 — 숫자가 아니라 빛으로 알 수 있어야 한다
  function lampEffect(power) {
    const hm = home();
    if (!propVisible('lamp')) return;
    const p = world.props.lamp;
    if (p) {
      const t0 = performance.now(), from = p.scale.x;
      const pop = () => {
        const k = Math.min(1, (performance.now() - t0) / 260);
        const s = from * (1 + Math.sin(k * Math.PI) * 0.12);
        p.scale.setScalar(s);
        if (k < 1) requestAnimationFrame(pop); else p.scale.setScalar(1);
      };
      requestAnimationFrame(pop);
    }
    if (power > 0.05) { world.sparkle(hm.lamp.x + 1.2, hm.lamp.z, 1.2); world.puff(hm.lamp.x + 1.2, hm.lamp.z, 5, 0.7, 0xFFD9A0); }
    else world.puff(hm.lamp.x + 1.2, hm.lamp.z, 6, 0.8, 0xBFC7D0);
    for (const b of birds) if (b.d.stage === 'chick') showIcon(b, power > 0.05 ? '☀️' : '❄️', 1600);
  }

  // ── 씨알 코드 ──
  // 친구의 수탉을 잠시 빌려 오는 표. 이름·기기 정보·어떤 식별자도 들어가지 않는다.
  // 말로 불러 주거나 칠판에 적어도 되게 짧게 만든다. 네트워크를 전혀 타지 않는다.
  const TRAITS = MIND.NAMES;
  function hash36(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36).toUpperCase();
  }
  function makeSeedCode(name, trait, day) {
    const ti = Math.max(0, TRAITS.indexOf(trait));
    const head = ti.toString(36).toUpperCase();
    return name + '-' + head + hash36(name + '|' + ti + '|' + day).slice(-3);
  }
  // 오늘·어제·그제 것까지 받아 준다 (쉬는 시간에 받아 집에서 넣는 경우)
  function readSeedCode(code) {
    const m = String(code || '').trim().replace(/\s+/g, '').match(/^(.+)-([0-9A-Za-z])([0-9A-Za-z]{3})$/);
    if (!m) return null;
    const name = m[1], head = m[2].toUpperCase(), tail = m[3].toUpperCase();
    const ti = parseInt(head, 36);
    if (!(ti >= 0 && ti < TRAITS.length)) return null;
    for (let back = 0; back <= 2; back++) {
      const day = U.addDays(today(), -back);
      if (hash36(name + '|' + ti + '|' + day).slice(-3) === tail) return { name, trait: TRAITS[ti], day };
    }
    return null;
  }

  // 이 닭이 지금 자리에서 느끼는 온도 (병아리만 의미가 있다)
  function comfortOf(b) {
    const ws = warmSpot();
    return HLT.comfort(b.d, daysCared(b), b.x, ws, ws ? (state.lampPower ?? 0.6) : 0);
  }
  function warmSpot() { if (!propVisible('lamp')) return null; const L = home().lamp; const f = home().flip ? -1 : 1; return { x: L.x + 1.2 * f, z: L.z }; }
  HYG.init(world, () => ({ min: world.xMin + XMARGIN, max: world.xMax - XMARGIN }));
  function layoutHome() { homeCache = null; world.setProps(home()); world.setSupplies(state.feed, state.water, state.basket); world.setWormCount(state.worms); }
  const toWorldX = (frac) => world.xMin + XMARGIN + frac * (world.xMax - world.xMin - XMARGIN * 2);
  const toFrac = (x) => clamp((x - world.xMin - XMARGIN) / (world.xMax - world.xMin - XMARGIN * 2), 0, 1);

  // ---- 닭 ----
  let birds = [];      // 런타임 객체 (d = 저장 데이터)
  let selectedId = null, hoverId = null, visible = true;

  function newBird(stage, opts = {}) {
    return Object.assign({
      id: uid(), name: pick(NAMES), stage, sex: Math.random() < 0.5 ? 'f' : 'm', fertile: true, born: now(), stageSince: today(),
      care: {}, hunger: 70, thirst: 70, happy: 70, aff: 50, trait: pick(MIND.NAMES),
      energy: 80, boredom: 20, social: 20, stress: 0, health: 100, sick: null, momId: null, children: 0,
      eggsLaid: 0, lastLaid: '', brooding: null, x: rand(0.3, 0.8), z: 0, old: false, pets: 0,
    }, opts);
  }
  function makeRuntime(d) {
    ST.ensureBird(d); MIND.normalizeTrait(d);
    const b3 = world.addBird(d.id, d.stage);
    return { d, b3, x: toWorldX(d.x), z: d.z, dir: Math.random() < 0.5 ? 1 : -1, anim: d.stage === 'egg' ? 'egg' : 'idle', animT: 0, animDur: rand(2, 4),
      f: 0, y: 0, vy: 0, targetX: null, carrying: false, box: null, icon: null, iconUntil: 0, goal: null, inCoop: false, lastMeal: 0, lastDrink: 0,
      tagEl: null, iconEl: null, look: new THREE.Vector3(0, 2, 8), lookAt: 0 };
  }
  function disposeRuntime(b) { world.removeBird(b.d.id); if (b.tagEl) b.tagEl.remove(); if (b.iconEl) b.iconEl.remove(); }
  const SPECIAL = { chick: 'peck', young: 'flap', hen: 'peck', rooster: 'crow' };
  const spec = (b) => ({ speed: SPEED[b.d.stage] || 1.5, special: SPECIAL[b.d.stage] || 'peck' });
  const height = (b) => world.heightOf(b.b3);
  const isAdult = (b) => b.d.stage === 'hen' || b.d.stage === 'rooster';
  const hasRooster = () => birds.some((b) => b.d.stage === 'rooster') || borrowedOk();
  // 볏과 꽁지깃이 자라야 암수를 알 수 있다. 병아리 때는 사람도 구별하지 못한다.
  const sexKnown = (d) => d.stage === 'young' || d.stage === 'hen' || d.stage === 'rooster';
  const sexMark = (d) => (sexKnown(d) ? (d.sex === 'f' ? ' ♀' : ' ♂') : '');

  function setAnim(b, anim, dur) { b.anim = anim; b.animT = 0; b.animDur = dur; }
  // 방향은 0.5초에 한 번만 바꾼다 — 화면 끝이나 양쪽에 닭이 있을 때 매 프레임 뒤집히며 떨던 문제
  function faceDir(b, d) {
    if (!d || d === b.dir) return;
    if (now() - (b.dirAt || 0) < 500) return;
    b.dir = d; b.dirAt = now();
  }
  function jump(b, v = 300) { if (b.d.hurt) { setAnim(b, 'sad', 1.5); showIcon(b, '🤕', 1200); return; } setAnim(b, 'jump', 0.9); b.vy = v / 60; }   // 유닛/초
  function showIcon(b, icon, ms = 2500) { b.icon = icon; b.iconUntil = now() + ms; }
  function goTo(b, x, anim) { if (b.onRoof) { leaveRoof(b); return; } b.inCoop = false; setVisible(b, true); b.targetX = clamp(x, world.xMin + XMARGIN, world.xMax - XMARGIN); b.dir = b.targetX > b.x ? 1 : -1; setAnim(b, anim, 25); }
  function setVisible(b, v) { b.b3.holder.visible = v; }
  const GRAV = 22; // 유닛/초²
  // ---- 간식(벌레) · 부르기 ----
  let worm = null;   // { model, x, y, z, held, vy, bornAt }
  const eligible = (b) => b.d.stage !== 'egg' && !b.d.brooding && !b.carrying;
  const affect = (b, delta) => { b.d.aff = clamp(b.d.aff + delta, 0, 100); markDirty(); };
  // ---- 마음 도우미 (sim/mind.js 위에) ----
  const isYoungling = (b) => b.d.stage === 'chick' || b.d.stage === 'young';
  const momOf = (b) => b.d.momId ? birds.find((h) => h.d.id === b.d.momId) || null : null;
  const kidsOf = (h) => birds.filter((k) => k.d.momId === h.d.id && isYoungling(k));
  const clampZ = (z) => clamp(z, world.zMin + 0.4, world.zMax - 0.4);
  const near = (a, c, r) => Math.abs(a.x - c.x) < r && Math.abs(a.z - c.z) < r;
  // 무리의 중심 (알·닭장 안은 제외)
  function flockCenter(except) {
    let sum = 0, n = 0;
    for (const q of birds) { if (q === except || q.d.stage === 'egg' || q.inCoop) continue; sum += q.x; n++; }
    return n ? sum / n : null;
  }
  function chaseTarget(b) { const car = wormCarrier(); if (car && car !== b) return { x: car.x, z: car.z, kind: 'worm' };
    if (worm && !(b.d.hunger > 95) && !((b.anim === 'sleep' || b.inCoop || b.anim === 'roost') && Math.abs(worm.x - b.x) > 2.5)) return { x: worm.x, z: worm.z, kind: 'worm' }; if (b.callTarget) { if (b.callTarget.follow) { const o = birds.find((q) => q.d.id === b.callTarget.follow); if (o) { b.callTarget.x = o.x; b.callTarget.z = o.z; } } return Object.assign({ kind: 'call' }, b.callTarget); } return null; }
  function spawnWorm(px, py) {
    if (state.worms <= 0) { toast('🪱 벌레가 없어요. 닭장 메뉴에서 달걀 코인으로 살 수 있어요'); return false; }
    if (worm) return false;
    state.worms -= 1; markDirty(); world.setWormCount(state.worms);
    const m = world.makeWorm(); world.scene.add(m.group);
    const gp = world.screenToPlaneZ(px, py, 1.2) || { x: 0, y: 1 };
    worm = { model: m, x: gp.x, y: Math.max(0.3, gp.y), z: 1.2, held: true, vy: 0, bornAt: now() };
    return true;
  }
  function removeWorm() { if (!worm) return; world.scene.remove(worm.model.group); worm = null; for (const b of birds) { b.wormRun = 0; b.fleeing = false; if (b.anim === 'chase' || b.anim === 'beg') decide(b); } }
  function eatWorm(b) {
    removeWorm(); b.goal = 'treat'; setAnim(b, 'eat', 1.6); showIcon(b, '😋', 2000);
  }
  // 물고 달아나기(worm running) — 실제 닭의 놀이 행동. 한 마리가 물고 뛰면 나머지가 전원 추격한다.
  function grabWorm(b) {
    if (!worm || worm.carrier) return;
    worm.carrier = b.d.id; worm.held = false;
    b.wormRun = rand(3.5, 7.5); b.fleeing = true;
    setAnim(b, 'chase', 30); showIcon(b, '🪱', 1800);
    b.d.boredom = clamp(b.d.boredom - 25, 0, 100);
    toast(`🪱 ${b.d.name}(이)가 벌레를 물고 달아나요!`, false, 3500);
  }
  function stealWorm(from, to) {
    worm.carrier = to.d.id; to.wormRun = rand(2.5, 5); to.fleeing = true;
    setAnim(to, 'chase', 30); showIcon(to, '🪱', 1500); showIcon(from, '😮', 1500);
    from.wormRun = 0; from.fleeing = false; setAnim(from, 'chase', 20);
    from.d.boredom = clamp(from.d.boredom - 20, 0, 100);
  }
  const wormCarrier = () => (worm && worm.carrier ? birds.find((q) => q.d.id === worm.carrier) : null);
  // 새끼를 들어 올리면 어미가 놀라 그 아래로 달려와 올려다본다
  function momPanic(kid) {
    const mom = momOf(kid);
    if (!mom || !eligible(mom)) return null;
    mom.inCoop = false; setVisible(mom, true); mom.targetX = null; mom.leap = null;
    if (mom.onRoof) leaveRoof(mom);
    mom.panicKid = kid.d.id;
    mom.d.stress = clamp(mom.d.stress + 45, 0, 100);
    goTo(mom, kid.x, 'panic');
    showIcon(mom, '😰', 3000);
    toast(`😰 ${mom.d.name}(이)가 ${kid.d.name}(이)를 보고 달려와요`, false, 4000);
    return mom;
  }
  function momRelief(kid) {
    const mom = birds.find((q) => q.panicKid === kid.d.id);
    if (!mom) return;
    mom.panicKid = null;
    mom.d.stress = clamp(mom.d.stress - 30, 0, 100);
    mom.careKid = kid.d.id;
    goTo(mom, kid.x + (mom.x < kid.x ? -1 : 1) * 1.0, 'gokid');
    showIcon(mom, '❤️', 2500);
  }
  function callFlock(x, z, except) {
    let n = 0;
    for (const b of birds) { if (!eligible(b) || b === except) continue; if ((b.d.aff < 35 && Math.random() < 0.7) || (trait(b).stubborn >= 1.4 && Math.random() < 0.5)) { showIcon(b, '😒', 1500); continue; } b.callTarget = { x: clamp(x + rand(-1.6, 1.6), world.xMin + XMARGIN, world.xMax - XMARGIN), z: clamp(z + rand(-0.8, 0.8), -1.6, 1.6) }; b.inCoop = false; setVisible(b, true); setAnim(b, 'chase', 30); n++; }
    return n;
  }

  // 알림 카드 (동물은 말하지 않는다 — 사건만 화면 구석에)
  function toast(text, big = false, ms = 5000) {
    const el = document.createElement('div'); el.className = 'toast' + (big ? ' big' : ''); el.textContent = text;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), ms);
  }

  function decide(b) {
    const hm = home();
    if (b.d.stage === 'egg') { setAnim(b, 'egg', rand(3, 6)); return; }
    b.fleeing = false; b.curious = false;
    const T = trait(b), d = b.d, M = moodOf(b);
    // 품는 암탉은 둥지에 머문다 (가끔 밥 먹으러)
    if (d.brooding && b.anim !== 'gofeed' && b.anim !== 'gowater') {
      if (Math.random() < 0.15 && d.hunger < 60 && state.feed > 0) { goTo(b, hm.feeder.x + (hm.flip ? -1 : 1) * 1.3, 'gofeed'); return; }
      if (Math.abs(b.x - hm.nest.x) > 0.2) { goTo(b, hm.nest.x, 'gonest'); return; }
      setAnim(b, 'brood', rand(8, 20)); return;
    }
    const gp = (mouse.x >= 0 && now() - mouse.movedAt < 3000) ? world.screenToGround(mouse.x, mouse.y) : null;
    const cursorDist = gp ? Math.abs(gp.x - b.x) : 99;
    const mom = momOf(b), kids = kidsOf(b);
    const friends = birds.filter((o) => o !== b && eligible(o) && !o.inCoop && isYoungling(o) === isYoungling(b));
    const cands = [];
    const add = (name, score, run) => { if (score > 0) cands.push({ name, score, run }); };
    const feedOk = state.feed >= RULE.feedPerMeal && now() - b.lastMeal > 60000, waterOk = state.water >= RULE.waterPerDrink && now() - b.lastDrink > 60000;
    // 생리 욕구
    add('eat', ((100 - d.hunger) / 100) ** 1.5 * 2.2 * T.appetite * (feedOk ? 1 : 0) * (d.stress > 60 ? 0.3 : 1), () => goTo(b, propVisible('feeder') ? hm.feeder.x + (hm.flip ? -1 : 1) * rand(1.1, 1.6) : b.x, 'gofeed'));
    add('drink', ((100 - d.thirst) / 100) ** 1.5 * 2.2 * (waterOk ? 1 : 0), () => goTo(b, propVisible('waterer') ? hm.waterer.x + (hm.flip ? -1 : 1) * rand(1.1, 1.5) : b.x, 'gowater'));
    const sleepGate = M.sleepy > 0.6 || (d.stage === 'chick' && M.sleepy > 0.45);
    add('sleep', (sleepGate ? (M.sleepy ** 2) * 2.6 * (d.stage === 'chick' ? 1.8 : 1) * T.sleepy : 0) + (d.old && M.sleepy > 0.4 ? 0.3 : 0), () => {
      const ws = warmSpot();
      if (d.stage === 'chick' && ws) goTo(b, ws.x + rand(-0.9, 0.9), 'golamp-sleep');
      else if (!b.inCoop && propVisible('coop') && !isYoungling(b) && Math.random() < 0.6) goTo(b, hm.coop.x + (hm.flip ? -1 : 1) * 0.3, 'gocoop');
      else if (mom && Math.random() < 0.6) goTo(b, mom.x + rand(-1.2, 1.2), 'gomom-sleep');
      else setAnim(b, 'sleep', rand(15, 35));
    });
    // 놀이 · 사회
    if (d.stress < 50) {
      add('play', (d.boredom / 100) * 1.6 * T.playful * (d.energy / 100), () => {
        const f = friends.filter((o) => isYoungling(o) && o.anim !== 'sleep');
        if (f.length && Math.random() < 0.6) { const o = pick(f); b.playWith = o.d.id; b.callTarget = { x: o.x, z: o.z, follow: o.d.id }; setAnim(b, 'chase', 6); o.playFlee = b.d.id; if (o.anim === 'idle' || o.anim === 'walk') { goTo(o, o.x + (o.x > b.x ? 1 : -1) * rand(3, 6), 'walk'); o.fleeing = true; } }
        else if (Math.random() < 0.5) setAnim(b, 'flap', rand(1.5, 3)); else { goTo(b, b.x + (Math.random() < 0.5 ? -1 : 1) * rand(4, 9), 'walk'); b.fleeing = true; }
      });
      // 각인: 병아리는 어미가 멀어지면 종종 따라간다 (10~12일까지 바짝 붙어 다닌다)
      if (mom && isYoungling(b)) {
        const gap = Math.abs(mom.x - b.x);
        add('follow', gap > 3.5 ? 2.2 * (d.stage === 'chick' ? 1.4 : 0.7) : 0.2, () => goTo(b, mom.x + (b.x < mom.x ? -1 : 1) * rand(0.8, 1.6), 'follow'));
      }
      add('social', (d.social / 100) * 1.4 * T.sociable * (friends.length || mom ? 1 : 0) * (isYoungling(b) && mom ? 1.5 : 1), () => {
        const target = mom && Math.random() < 0.7 ? mom : pick(friends);
        if (target) goTo(b, target.x + (b.x < target.x ? -1 : 1) * rand(1.2, 2), 'walk');
      });
      // 어미 돌봄
      if (kids.length) add('care', 0.9 * T.sociable * (kids.some((k) => !near(k, b, 3)) ? 1 : 0.5), () => { const k = pick(kids); b.careKid = k.d.id; goTo(b, k.x + (b.x < k.x ? -1 : 1) * 1.1, 'gokid'); });
    }
    // 선생님(커서)
    if (gp) {
      add('approach', (d.aff / 100) * T.approach * T.curiosity * (cursorDist > 2 && cursorDist < 10 ? 1 : 0) * 0.9, () => { goTo(b, gp.x - Math.sign(gp.x - b.x) * 1.4, 'walk'); b.curious = true; });
      add('flee', ((100 - d.aff) / 100) * T.flee * (d.aff < 40 && cursorDist < 3.5 ? 1.6 : 0) * (1 - T.bold * 0.2), () => { goTo(b, b.x - Math.sign(gp.x - b.x || 1) * rand(3, 6), 'walk'); b.fleeing = true; showIcon(b, '💨', 1200); });
    }
    // ── 생태 (실제 닭의 활동 시간 배분을 반영) ──
    // 땅 긁기 = 활동 시간의 34%. 먹이통이 가득해도 긁는다(逆무임승차). 이것이 기본 자세다.
    // 긁기: 암탉이 가장 오래, 병아리는 짧게, 수탉은 덜 (파수를 보느라)
    const SCR = { chick: [0.9, 2, 4], young: [1.2, 3, 6], hen: [1.4, 5, 10], rooster: [0.9, 3, 7] }[d.stage] || [1.3, 4, 9];
    if (d.sick) SCR[0] *= 0.25;
    add('scratch', SCR[0] * (d.hurt ? 0.4 : 1) * T.appetite * (0.6 + d.energy / 200) * (d.stress > 60 ? 0.3 : 1), () => setAnim(b, 'scratch', rand(SCR[1], SCR[2])));
    // 모래 목욕 — 이틀에 한 번, 평균 27분(게임 12초). 전염된다.
    const dustGap = d.lastDust ? U.daysBetween(d.lastDust, today()) : 99;
    const dirty = Math.max(0, 70 - (d.clean ?? 85)) / 70;         // 더러울수록 하고 싶어진다
    add('dustbath', (dustGap >= 2 ? 1.2 : 0.05) * (1 + dirty * 2.2) * T.tidy * ({ chick: 0.45, young: 0.8, hen: 1.3, rooster: 1 }[d.stage] || 1) * (1 + (b.dustUrge || 0)) * (d.stress > 50 ? 0.2 : 1), () => {
      if (propVisible('dustpit') && Math.abs(b.x - hm.dustpit.x) > 1.6) goTo(b, hm.dustpit.x + rand(-1.2, 1.2), 'godust');
      else startDustBath(b);
    });
    // 햇볕 쬐기 — 끝나면 반드시 깃털 다듬기로 이어진다
    add('sunbathe', 0.35 * T.tidy * (M.valence > -0.2 ? 1 : 0.2), () => setAnim(b, 'sunbathe', rand(5, 9)));
    // 편안함 행동
    add('stretch', 0.22 * (d.energy / 100), () => setAnim(b, 'stretch', rand(1.4, 2.2)));
    add('shake', 0.3, () => setAnim(b, 'shake', 1.0));
    // 산책: 혼자 너무 멀어지면 무리 쪽으로 돌아간다 (닭은 몰려다닌다)
    const fc = flockCenter(b);
    const strayed = fc !== null ? Math.abs(b.x - fc) : 0;
    add('walk', 0.9 * T.curiosity * (d.energy / 100), () => {
      b.walkZ = clampZ(b.z + rand(-1, 1) * rand(0.6, 3.5) * T.curiosity);
      let tx = b.x + rand(-1, 1) * rand(3, 10) * (d.old ? 0.6 : 1) * (T.curiosity > 1.4 ? 1.6 : 1);
      if (fc !== null) {
        const pull = clamp((strayed - 3) / 9, 0, 1) * T.sociable * 0.75;     // 멀수록 강하게 끌린다
        tx = tx * (1 - pull) + (fc + rand(-1.8, 1.8)) * pull;
      }
      goTo(b, tx, 'walk');
    });
    // 무리에서 멀어지면 불안해져서 돌아간다
    if (fc !== null && strayed > 7) add('regroup', (strayed - 7) / 6 * 1.8 * T.sociable, () => { goTo(b, fc + rand(-1.5, 1.5), 'walk'); showIcon(b, '👀', 1400); });
    add('preen', 0.16 * T.tidy, () => setAnim(b, 'preen', rand(2.5, 4.5)));
    // "저게 뭐지?" — 멀리서 커서가 얼쩡거리면 겁내면서도 조금씩 다가가 목을 빼고 본다
    if (d.stage === 'chick' && warmSpot()) { const ws = warmSpot(); add('warm', (Math.abs(b.x - ws.x) > 1.6 ? 0.55 : 0.1) * (1 + M.sleepy), () => goTo(b, ws.x + rand(-0.9, 0.9), 'golamp')); }
    // 수탉: 지붕에 올라가 울기
    if (isAdult(b) && propVisible('coop') && !b.onRoof) {
      // 수탉은 울려고, 암탉은 졸릴 때 높은 곳으로 (서열이 높을수록 자주)
      const wantRoof = d.stage === 'rooster' ? 0.22 * T.noisy * T.bold : 0.18 * (M.sleepy > 0.45 ? 1.8 : 0.4) * T.bold;
      add('roof', wantRoof * (1 + rank(b) * 0.15), () => goTo(b, hm.coop.x + roostSlot(b), 'goroof'));
    }
    if (b.onRoof) { add('crowroof', 0.6 * T.noisy, () => { setAnim(b, 'crow', 2.4); crowSound(); startleKids(b); }); add('roost', 0.5, () => setAnim(b, 'roost', rand(6, 14))); add('down', 0.35, () => leaveRoof(b)); }
    add('idle', 0.18, () => setAnim(b, 'idle', rand(1.5, 3.5)));
    // 기쁨 세기: 1(미소) → 2(폴짝·날개짓) → 3(신나서 뛰어다니기)
    const joy = M.valence > 0.25 ? (M.valence - 0.25) / 0.75 : 0;
    if (joy > 0) add('happy', (0.25 + joy * 0.9) * T.playful, () => {
      if (joy > 0.65) burst(b, 'ecstatic');
      else if (joy > 0.3 && isYoungling(b)) frolic(b);        // 까불며 뛰기 — 어린 것만
      else if (joy > 0.3) { setAnim(b, 'flap', 1.2); later(b, 900, () => { if (b.anim === 'flap' || b.anim === 'idle') jump(b, 300); }); }
      else jump(b, 240);
    });
    // 목적 없는 폭발적 질주 — 10주 이후 사라지는 어린 시절의 행동
    if (isYoungling(b) && !d.hurt) add('frolic', 0.5 * T.playful * (d.energy / 100) * (d.stress < 40 ? 1 : 0.2), () => frolic(b));
    // 슬픔 세기: 1(처짐) → 2(눈물) → 3(주저앉아 엉엉 + 빙글)
    const grief = M.valence < -0.25 ? (-M.valence - 0.25) / 0.75 : 0;
    if (grief > 0 && d.stress < 70) add('grieve', 0.4 + grief * 0.9, () => { if (grief > 0.65) burst(b, 'wail'); else setAnim(b, 'sad', rand(3, 6)); });
    // 화남: 긴장 높고 친밀도 낮으면 발 구르기
    if (d.stress > 55 && d.aff < 45) add('stomp', 0.5 + d.stress / 200, () => setAnim(b, 'stomp', rand(1.5, 2.5)));
    // ════ 단계별 고유 행동 ════
    const kidsNear = birds.filter((q) => q !== b && isYoungling(q) && eligible(q));
    // 온도 반응 — 숫자를 보지 않고 병아리의 모습으로 알 수 있게
    if (d.stage === 'chick' && b.comfort) {
      const ws = warmSpot();
      if (b.comfort.state === 'cold') {
        add('gowarm', 3.2, () => {
          if (ws && Math.abs(b.x - ws.x) > 1.0) goTo(b, ws.x + rand(-0.7, 0.7), 'gowarm');
          else { setAnim(b, 'huddle', rand(3, 6)); showIcon(b, '🥶', 2200); peepSound(); }   // 시끄럽게 삑삑
        });
      } else if (b.comfort.state === 'hot') {
        add('gocool', 3.0, () => {
          if (ws && Math.abs(b.x - ws.x) < 4.5) goTo(b, ws.x + (b.x < ws.x ? -1 : 1) * rand(4.5, 7), 'gocool');
          else { setAnim(b, 'pant', rand(3, 6)); showIcon(b, '🥵', 2200); }                  // 조용히 헐떡인다
        });
      }
    }
    if (d.stage === 'chick') {
      // 병아리: 서로 몸을 붙여 뭉친다. 춥거나 놀랐을 때 특히.
      const buddy = kidsNear.sort((x, y) => Math.abs(x.x - b.x) - Math.abs(y.x - b.x))[0];
      const wantHuddle = (d.stress / 60) + (M.sleepy * 0.6) + 0.35;
      if (buddy) add('huddle', wantHuddle * T.sociable * 1.3, () => {
        if (Math.abs(buddy.x - b.x) > 1.0) goTo(b, buddy.x + (b.x < buddy.x ? -0.7 : 0.7), 'gohuddle');
        else { setAnim(b, 'huddle', rand(4, 9)); b.d.stress = clamp(b.d.stress - 12, 0, 100); b.d.social = clamp(b.d.social - 25, 0, 100); }
      });
      else if (warmSpot()) add('huddle', wantHuddle * 0.8, () => goTo(b, warmSpot().x + rand(-0.6, 0.6), 'golamp'));
      add('peck', 0.9 * T.appetite, () => setAnim(b, 'peck', rand(1.5, 3)));      // 짧게 자주 쫀다
    }
    if (d.stage === 'young') {
      // 어린닭: 날개 연습을 아주 자주 한다. 또래끼리 가슴을 부딪치며 겨룬다.
      add('flap', 1.1 * T.playful * (d.energy / 100), () => { setAnim(b, 'flap', rand(1.8, 3.2)); if (Math.random() < 0.5) later(b, 800, () => { if (b.anim === 'flap') jump(b, 260); }); });
      const rival = kidsNear.filter((q) => q.d.stage === 'young' && Math.abs(q.x - b.x) < 6)[0];
      if (rival && !d.hurt) add('spar', 0.7 * T.playful * T.bold, () => {
        b.sparWith = rival.d.id;
        goTo(b, rival.x + (b.x < rival.x ? -0.9 : 0.9), 'walk');
        later(b, 900, () => { if (!eligible(b)) return; setAnim(b, 'spar', 1.6); jump(b, 230); showIcon(b, '⚔️', 1400);
          if (eligible(rival) && ACT.canInterrupt(rival.anim, 'spar')) { setAnim(rival, 'spar', 1.6); jump(rival, 230); rival.d.boredom = clamp(rival.d.boredom - 30, 0, 100); }
          b.d.boredom = clamp(b.d.boredom - 30, 0, 100); });
      });
    }
    if (d.stage === 'hen') {
      // 주인 없는 알이 있으면 품어 준다 (품는 암탉이 없으면 부화가 진행되지 않는다)
      const orphan = birds.find((q) => q.d.stage === 'egg' && !birds.some((h2) => h2.d.brooding === q.d.id));
      if (orphan && !d.brooding && !d.old) add('adopt', 2.4 * T.sociable, () => startBrooding(b, orphan));
      // 암탉: 둥지를 들여다보고, 오래 긁는다
      if (propVisible('nest')) add('checknest', 0.35 * (d.lastLaid === today() ? 0.1 : 1), () => goTo(b, hm.nest.x + rand(-0.8, 0.8), 'gonest'));
    }
    if (d.stage === 'rooster') {
      // 수탉: 무리가 먹는 동안 자기는 먹지 않고 서서 경계한다
      const othersEating = birds.some((q) => q !== b && (q.anim === 'eat' || q.anim === 'gofeed'));
      add('guard', (othersEating ? 1.5 : 0.5) * T.bold, () => setAnim(b, 'guard', rand(4, 9)));
      // 먹이를 찾으면 자기가 먹지 않고 암탉을 부른다 (tidbitting)
      const hens = birds.filter((q) => q.d.stage === 'hen' && eligible(q));
      if (hens.length && state.feed >= RULE.feedPerMeal) add('tidbit', 0.8 * T.sociable, () => {
        setAnim(b, 'tidbit', rand(3, 5)); showIcon(b, '🌾', 2600); crowSound();
        for (const h of hens) if (Math.abs(h.x - b.x) < 12 && ACT.canInterrupt(h.anim, 'chase')) {
          h.callTarget = { x: b.x + rand(-1.4, 1.4), z: b.z }; h.inCoop = false; setVisible(h, true); setAnim(h, 'chase', 12);
        }
      });
    }
    if (d.stage === 'rooster') add('crow', 0.12 * T.noisy * (1 + rank(b) * 0.2), () => {
      setAnim(b, 'crow', 2.2); crowSound(); startleKids(b); note('firstCrow', b, true);
      // 아래 서열 수탉들이 이어 운다
      const lower = birds.filter((q) => q !== b && q.d.stage === 'rooster' && eligible(q) && rank(q) < rank(b)).sort((x, y) => rank(y) - rank(x));
      lower.forEach((r, i) => later(r, (i + 1) * 1500, () => { if (eligible(r) && ACT.canInterrupt(r.anim, 'crow')) { setAnim(r, 'crow', 2.2); crowSound(); showIcon(r, '🎵', 1800); } }));
    });
    if (d.stage === 'hen') add('peck', 0.3 * T.appetite, () => setAnim(b, 'peck', rand(2, 4)));

    if (d.sick) add('sick', 2.6 + (100 - (d.health ?? 100)) / 40, () => { setAnim(b, 'sick', rand(5, 11)); if (Math.random() < 0.3) showIcon(b, HLT.info(d.sick.type).icon, 2000); });
    if (d.hunger < 30 || d.thirst < 30 || d.hurt) add('sad', d.hurt ? 1.6 : 0.8, () => setAnim(b, 'sad', rand(3, 6)));
    // 첫 산란이 가까운 어린닭은 손을 뻗으면 납작 웅크린다
    if (d.stage === 'young' && daysCared(b) >= RULE.daysYoung - 4) add('squat', 0.4, () => { setAnim(b, 'squat', rand(2, 3.5)); showIcon(b, '🥚', 1500); });
    // 소프트맥스 선택 (온도 0.35)
    const mx = Math.max(...cands.map((c) => c.score));
    const ws = cands.map((c) => Math.exp((c.score - mx) / 0.35));
    let r = Math.random() * ws.reduce((a, w) => a + w, 0), chosen = cands[0];
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { chosen = cands[i]; break; } }
    b.lastCands = cands.map((c) => c.name + ':' + c.score.toFixed(2)).sort();
    if (chosen) { b.lastChoice = chosen.name; chosen.run(); }
    if (!ACT.keepsCoop(b.anim) && b.anim !== 'gocoop' && b.anim !== 'gomom-sleep') b.inCoop = false;
  }
  // setTimeout 안전판 — 그 사이 닭이 떠났으면 실행하지 않는다
  function later(b, ms, fn) { const id = b.d.id; setTimeout(() => { if (birds.some((q) => q.d.id === id)) fn(); }, ms); }

  // 모래 목욕: 5단계를 12초에 (실제 평균 27분). 옆의 닭에게 전염된다.
  const DUST_SEC = 12;
  function startDustBath(b) {
    note('firstDust', b, true);
    b.targetX = null; b.inCoop = false; setVisible(b, true);
    b.dustPhase = 0; b.dustT = 0;
    setAnim(b, 'dustbath', DUST_SEC + 1);
    b.d.lastDust = today(); markDirty();
    // 전염: 반경 안의 닭들에게 목욕 욕구를 퍼뜨린다 (참여자가 많을수록 각자는 짧아진다)
    let joined = 0;
    for (const o of birds) {
      if (o === b || !eligible(o) || !near(o, b, 5)) continue;
      o.dustUrge = (o.dustUrge || 0) + 1.2; joined++;
      setTimeout(() => { if (o.dustUrge) o.dustUrge = Math.max(0, o.dustUrge - 1.2); }, 30000);
    }
    b.dustCrowd = joined;
  }
  // 조심스러운 접근: 조금 다가가 → 멈춰 목을 빼고 본다 → 또 조금. 겁쟁이는 더 자주 멈춘다.
  function peek(b) {
    const T = trait(b);
    const step = rand(1.6, 3.2) / Math.max(0.6, T.flee);
    const dir = Math.sign(lure.x - b.x) || 1;
    b.peekLeft = (b.peekLeft || 0) > 0 ? b.peekLeft - 1 : Math.round(rand(2, 4));
    b.curious = true;
    goTo(b, b.x + dir * Math.max(0.6, Math.min(step, Math.abs(lure.x - b.x) - 0.8)), 'gopeek');
  }
  function frolic(b) {
    b.targetX = null; b.inCoop = false; setVisible(b, true);
    b.frolicT = rand(1.2, 2.6); b.dir = Math.random() < 0.5 ? 1 : -1;
    setAnim(b, 'chase', 30); b.fleeing = true; b.frolicking = true;
    b.d.boredom = clamp(b.d.boredom - 35, 0, 100);
    showIcon(b, '💨', 900);
  }

  // 감정 폭발 (세기 3): 신남 = 뛰어다니며 파닥, 엉엉 = 주저앉아 빙글빙글 울기
  function burst(b, kind) {
    b.targetX = null; b.inCoop = false; setVisible(b, true);
    setAnim(b, kind, kind === 'ecstatic' ? rand(4, 6) : rand(4, 7));
    b.burstT = 0; b.spin = 0;
    if (kind === 'ecstatic') showIcon(b, pick(['🎉', '✨', '💖']), 1500); else showIcon(b, '😭', 1500);
  }
  const world3dRoof = () => window.TP_WORLD.COOP_ROOF_Y;
  // 포물선 도약: 나는 동안 x·z를 함께 옮겨서 닭장을 통과하지 않는다
  function leapTo(b, x1, z1, vy, dur) { b.leap = { x0: b.x, z0: b.z, x1, z1, t: 0, dur }; b.vy = vy; }
  // 홰(지붕) 자리는 서열이 정한다. 1위가 용마루 한가운데, 아래로 갈수록 양쪽 끝.
  function roostSlot(b) {
    const onRoof = birds.filter((q) => q.onRoof || q.anim === 'goroof');
    const order = onRoof.concat(onRoof.includes(b) ? [] : [b]).sort((x, y) => rank(y) - rank(x));
    const i = Math.max(0, order.indexOf(b));
    // 0 → 가운데, 1 → 오른쪽, 2 → 왼쪽, ...
    const side = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2);
    return side * 1.15;
  }
  function jumpToRoof(b) {
    const c = home().coop, h = world3dRoof(), vy = Math.sqrt(2 * GRAV * h) + 1.2;
    const dur = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * GRAV * h))) / GRAV;
    b.roostOffset = roostSlot(b);
    b.onRoof = true;
    leapTo(b, clamp(c.x + b.roostOffset, world.xMin + XMARGIN, world.xMax - XMARGIN), c.z, vy, dur);
    setAnim(b, 'jump', 2.2); showIcon(b, '⬆️', 900);
  }
  function leaveRoof(b) {
    const c = home().coop, h = world3dRoof(), vy = 2.2;
    const dur = (vy + Math.sqrt(vy * vy + 2 * GRAV * h)) / GRAV;
    b.onRoof = false; b.y = Math.max(b.y, h);
    const side = b.x > c.x ? 1 : -1;
    leapTo(b, clamp(c.x + side * rand(1.6, 2.4), world.xMin + XMARGIN, world.xMax - XMARGIN), clampZ(c.z + rand(2.4, 3.0)), vy, dur);
    setAnim(b, 'fall', 99); showIcon(b, '⬇️', 700);
  }
  // ── 경보 ──
  // 공중(aerial): 납작 웅크리고 하늘을 본다 / 지상(ground): 목을 빼고 꼿꼿이 경계한다
  // 한 마리가 놀라면 정서가 전염되어 무리 전체가 흩어진다.
  let lastAlarm = 0, fastFrames = 0;
  function soundAlarm(kind, srcX, radius) {
    if (now() - lastAlarm < 9000) return 0;        // 자주 놀라면 피곤하다
    lastAlarm = now();
    let n = 0;
    for (const b of birds) {
      if (!eligible(b) || Math.abs(b.x - srcX) > (radius || 10)) continue;
      const T = trait(b);
      if (Math.random() > 0.85 - T.bold * 0.3) continue;          // 대담한 성격은 안 놀란다
      b.d.stress = clamp(b.d.stress + (kind === 'aerial' ? 34 : 22) * T.flee, 0, 100);
      b.inCoop = false; setVisible(b, true); b.targetX = null; b.dustPhase = 0;
      if (b.onRoof) { leaveRoof(b); continue; }
      setAnim(b, kind === 'aerial' ? 'crouch' : 'alert', rand(1.0, 1.8));   // 짧게 놀라고 곧 흩어진다
      if (n === 0) showIcon(b, '❗', 1800);
      n++;
    }
    if (n) {
      // 경계가 풀리면 흩어졌다가 다시 모인다
      for (const b of birds) if (b.anim === 'crouch' || b.anim === 'alert') {
        later(b, 1100 + Math.random() * 900, () => {
          if (b.anim !== 'crouch' && b.anim !== 'alert') return;
          const T = trait(b);
          goTo(b, b.x + (Math.sign(b.x - srcX) || 1) * rand(3, 6) * T.flee, 'walk');
          b.fleeing = true;
        });
      }
    }
    return n;
  }
  // 커서가 멀리서 계속 얼쩡거리면 호기심이 쌓인다 (겁은 나지만 보고 싶은 상태)
  let lure = { x: 0, active: 0, at: 0 };
  function trackLure(x, y, speed) {
    if (speed > 2200) { lure.active = Math.max(0, lure.active - 0.03); return; }   // 휙 지나가면 유인이 아니라 위협
    if (speed < 90 && cursorStill < 0.5) { lure.active = Math.max(0, lure.active - 0.012); return; }
    const gp = world.screenToGround(x, y); if (!gp) return;
    lure.x = gp.x; lure.at = now();
    lure.active = Math.min(1, lure.active + 0.06);
  }
  // 눈앞에 커서가 오면 쫀다. 닭은 눈에 띄는 건 일단 쪼아 본다.
  let peckScan = 0;
  function tickCursorPeck(dt) {
    peckScan -= dt; if (peckScan > 0) return; peckScan = 0.4;
    if (!cursorSpot) return;
    const still = cursorStill > 0.7;                 // 커서가 멈춰 있어야 관심을 보인다

    for (const b of birds) {
      if (!eligible(b) || b.d.hurt) continue;
      const dx = cursorSpot.x - b.x, d2 = Math.abs(dx), dz = Math.abs(b.z - cursorSpot.z);

      // 이미 쪼는 중 — 제자리에서 좌우로만 맞추고, 높으면 폴짝 뛰어 잡으려 한다
      if (b.anim === 'peckat') {
        if (!still || d2 > 2.8) { setAnim(b, 'idle', 0.6); continue; }
        faceDir(b, dx > 0 ? 1 : -1);
        if (d2 > 0.5) b.x = clamp(b.x + Math.sign(dx) * spec(b).speed * 0.45 * dt, world.xMin + XMARGIN, world.xMax - XMARGIN);
        // 커서가 머리보다 한참 위면 뛰어서 닿으려 한다
        const head = world.project(b.x, height(b), b.z);
        if (head && mouse.y < head.y - 26 && b.y === 0 && b.vy === 0 && Math.random() < 0.55) {
          b.vy = rand(3.4, 5.2) * (mouse.y < head.y - 90 ? 1.25 : 1);
          if (Math.random() < 0.35) showIcon(b, '✨', 700);
        }
        continue;
      }
      // 다가가는 중이면 그대로 둔다
      if (b.anim === 'gopeckat') { if (!still) { b.targetX = null; decide(b); } continue; }
      if (!still) continue;

      const T = trait(b);
      // ① 눈앞이면 바로 쫀다
      if (d2 < 1.6 && dz < 3.6) {
        if (!ACT.canInterrupt(b.anim, 'peckat') || b.d.stress > 60) continue;
        if (Math.random() > 0.8 * T.curiosity) continue;
        b.targetX = null; b.inCoop = false; setVisible(b, true);
        faceDir(b, dx > 0 ? 1 : -1);
        setAnim(b, 'peckat', rand(2.5, 5));
        b.d.boredom = clamp(b.d.boredom - 12, 0, 100);
        continue;
      }
      // ② 멀리 있어도, 커서가 오래 멈춰 있으면 궁금해서 보러 온다
      const reach = 3.5 + cursorStill * 1.8;
      if (d2 < reach && d2 >= 1.6 && ACT.canInterrupt(b.anim, 'gopeckat') && b.d.stress < 55) {
        if (Math.random() > 0.45 * T.curiosity * T.approach) continue;
        b.curious = true;
        goTo(b, cursorSpot.x - Math.sign(dx) * 0.7, 'gopeckat');
        if (Math.random() < 0.35) showIcon(b, '👀', 1600);
      }
    }
  }
  // 커서가 닭 근처에서 갑자기 빠르게 움직이면 놀란다
  function checkCursorScare(x, y, vx, vy) {
    if (!visible) return;
    const speed = Math.hypot(vx, vy);
    fastFrames = speed > 2200 ? fastFrames + 1 : 0;
    if (fastFrames < 2) return;
    fastFrames = 0;                                     // px/초
    const gp = world.screenToGround(x, y); if (!gp) return;
    if (!birds.some((b) => eligible(b) && Math.abs(b.x - gp.x) < 6)) return;
    soundAlarm(vy > Math.abs(vx) * 0.6 ? 'aerial' : 'ground', gp.x, 8);
  }

  // 수탉 울음 → 근처 새끼들이 놀란다
  function startleKids(r) {
    for (const k of birds) {
      if (!isYoungling(k) || !eligible(k) || Math.abs(k.x - r.x) > 8) continue;
      const T = trait(k); if (T.bold >= 1.5 || Math.random() < (T.bold - 0.4) * 0.4) continue;
      k.d.stress = clamp(k.d.stress + 25, 0, 100); k.inCoop = false; setVisible(k, true);
      setAnim(k, 'startle', 0.7); k.vy = 3; showIcon(k, '❗', 900);
      later(k, 700, () => { if (k.anim === 'startle' || k.anim === 'idle') { goTo(k, k.x + (Math.sign(k.x - r.x) || 1) * rand(2, 4) * T.flee, 'walk'); k.fleeing = true; } });
    }
  }
  function update(b, dt) {
    const s = spec(b);
    if (b.d.stage !== 'egg') {
      b.d.hunger = clamp(b.d.hunger - dt * (100 / (8 * 3600)), 0, 100);
      b.d.thirst = clamp(b.d.thirst - dt * (100 / (6 * 3600)), 0, 100);
      b.d.happy = clamp(b.d.happy - dt * (100 / (12 * 3600)), 10, 100);
      if (b.d.hunger < 30 || b.d.thirst < 30) b.d.aff = clamp(b.d.aff - dt * (3 / 3600), 0, 100);
      const T = trait(b), sleeping = b.anim === 'sleep';
      b.d.energy = clamp(b.d.energy + (sleeping ? dt * 0.12 : -dt * (100 / (14 * 3600)) * T.energy * (b.anim === 'chase' || b.fleeing || b.anim === 'ecstatic' ? 2.5 : 1)), 0, 100);
      const playing = ACT.isPlaying(b.anim);
      b.d.boredom = clamp(b.d.boredom + (playing ? -dt * 4 : sleeping ? 0 : dt * (100 / (3 * 3600)) * T.playful), 0, 100);
      const friendNear = birds.some((o) => o !== b && o.d.stage !== 'egg' && !o.inCoop && near(o, b, 2.2));
      const fcx = flockCenter(b);
      const alone = fcx !== null && Math.abs(b.x - fcx) > 7;
      b.d.social = clamp(b.d.social + (friendNear ? -dt * 1.5 : dt * (100 / (4 * 3600)) * T.sociable * (alone ? 2.5 : 1)), 0, 100);
      b.d.clean = clamp((b.d.clean ?? 85) - dt * (C.CLEAN.decayPerHour / 3600), 0, 100);
      if (HYG.maybePoop(b, dt)) { markDirty(); if (Math.random() < 0.4) showIcon(b, '💩', 1200); }
      // 온도와 질병
      const cf = comfortOf(b);
      b.comfort = cf;
      if (cf.state === 'cold') b.d.stress = clamp(b.d.stress + dt * (6 / 3600), 0, 100);
      const risk = HLT.riskTick(b, { comfort: cf, ammonia: state.ammonia || 0, bedding: state.bedding ?? 100 }, dt);
      if (risk && HLT.fallSick(b.d, risk)) {
        const inf = HLT.info(risk);
        showIcon(b, inf.icon, 5000);
        toast(`${inf.icon} ${b.d.name}(이)가 ${inf.name}에 걸렸어요 — ${inf.why}\n${inf.cure}`, true, 14000);
        markDirty(); renderCoop();
      }
      HLT.sickTick(b.d, dt);
      const momNear = momOf(b) && near(momOf(b), b, 2.5);
      b.d.stress = clamp(b.d.stress - dt * (50 / 900) * (momNear ? 3 : 1), 0, 100);
      if (b.d.hunger < 30 && now() > b.iconUntil) showIcon(b, '🌾', 1500);
      else if (b.d.thirst < 30 && now() > b.iconUntil) showIcon(b, '💧', 1500);
    }
    if (b.anim === 'hatch') {
      const prev = b.hatching || 0;
      b.hatching = Math.min(1, prev + dt / HATCH_SEC);
      if (prev < 0.2 && b.hatching >= 0.2) { pipSound(); toast('🐣 부리로 껍질을 톡톡 쪼기 시작했어요', false, 5000); }
      else if (prev < 0.3 && b.hatching >= 0.3) { pipSound(); toast('🐣 껍질을 빙 둘러 깨는 중이에요', false, 5000); }
      else if (prev < 0.72 && b.hatching >= 0.72) pipSound();
      if (b.hatching >= 1) finishHatch(b);
      return;
    }
    if (b.carrying) return;
    // 놀란 어미는 새끼 밑을 따라다니며 올려다본다
    if (b.panicKid) {
      const kid = birds.find((q) => q.d.id === b.panicKid);
      if (!kid || !kid.carrying) { b.panicKid = null; if (kid) momRelief(kid); }
      else {
        const dx = kid.x - b.x;
        if (Math.abs(dx) > 0.6) { faceDir(b, dx > 0 ? 1 : -1); b.x = clamp(b.x + b.dir * s.speed * 2.2 * dt, world.xMin + XMARGIN, world.xMax - XMARGIN); if (b.anim !== 'panic') setAnim(b, 'panic', 30); }
        else if (b.anim !== 'flap') setAnim(b, 'flap', 1.2);
        b.look.set(kid.x, kid.y + height(kid) * 0.6, kid.z);
        if (now() > (b.panicIconAt || 0)) { b.panicIconAt = now() + 2200; showIcon(b, pick(['😰', '❗', '🆘']), 1600); }
        return;
      }
    }
    // 품는 중: 알을 몸 아래에 두고, 가끔 부리로 알을 돌린다
    if (b.d.brooding) {
      const egg = birds.find((q) => q.d.id === b.d.brooding);
      if (!egg) b.d.brooding = null;
      else if (b.anim === 'brood') {
        egg.x = b.x; egg.z = b.z + 0.12; egg.y = 0;
        if (now() > (b.turnAt || 0)) {
          b.turnAt = now() + rand(9000, 16000);
          egg.f = 1; egg.wobbleUntil = performance.now() / 1000 + 0.8;
          showIcon(b, '🥚', 2200);
        }
      }
    }
    // 모래 목욕 진행 — 5단계, 먼지는 3단계(날개 떨기)와 5단계(털기)에 터진다
    if (b.anim === 'dustbath') {
      const dur = DUST_SEC * (b.dustCrowd > 1 ? 0.65 : 1);     // 붐비면 짧게 끝난다
      b.dustT = (b.dustT || 0) + dt;
      const prev = b.dustPhase || 0;
      b.dustPhase = Math.min(1, b.dustT / dur);
      const SAND = 0xE3CFA0;
      if (prev < 0.22 && b.dustPhase >= 0.22) world.puff(b.x, b.z, 6, 0.5, SAND);
      if (prev < 0.42 && b.dustPhase >= 0.42) world.puff(b.x, b.z, 14, 0.8, SAND);
      if (prev < 0.52 && b.dustPhase >= 0.52) world.puff(b.x, b.z, 14, 0.9, SAND);
      if (prev < 0.62 && b.dustPhase >= 0.62) world.puff(b.x, b.z, 12, 1.0, SAND);
      if (prev < 0.75 && b.dustPhase >= 0.75) world.puff(b.x, b.z, 8, 0.8, SAND);
      if (prev < 0.93 && b.dustPhase >= 0.93) world.puff(b.x, b.z, 22, 1.3, SAND);
      if (b.dustPhase >= 1) {
        b.d.boredom = clamp(b.d.boredom - 45, 0, 100);
        b.d.happy = clamp(b.d.happy + 8, 0, 100);
        b.d.clean = clamp((b.d.clean ?? 85) + C.CLEAN.dustBathGain, 0, 100);
        b.dustUrge = 0; markDirty(); renderCoop();
        world.sparkle(b.x, b.z, height(b));
        showIcon(b, '✨', 2600);
        toast(`🛁 ${b.d.name}(이)가 모래 목욕을 마쳤어요 — 깃털이 반짝반짝`, false, 4000);
        setAnim(b, 'preen', rand(3, 5));                        // 목욕 뒤엔 깃털을 다듬는다
      }
      return;
    }
    // 까불며 뛰기 — 폭발적 질주 + 급격한 방향 전환
    if (b.frolicking) {
      b.frolicT -= dt;
      if (Math.random() < dt * 1.6) faceDir(b, -b.dir);
      b.x = clamp(b.x + b.dir * s.speed * 2.8 * dt, world.xMin + XMARGIN, world.xMax - XMARGIN);
      if (b.y === 0 && b.vy === 0 && Math.random() < dt * 1.8) b.vy = rand(3, 5);
      if (b.frolicT <= 0) { b.frolicking = false; b.fleeing = false; decide(b); }
      return;
    }
    // 벌레를 물고 달아나는 중
    if (worm && worm.carrier === b.d.id) {
      b.wormRun -= dt;
      const chasers = birds.filter((o) => o !== b && (o.anim === 'chase' || o.anim === 'beg'));
      let near0 = null, nd = Infinity;
      for (const o of chasers) { const d2 = Math.abs(o.x - b.x); if (d2 < nd) { nd = d2; near0 = o; } }
      // 도망 방향: 쫓는 놈이 확실히 가까이 붙었을 때만 튼다. 끝에 몰리면 돌파한다.
      const atEdge = b.x < world.xMin + XMARGIN + 1.2 || b.x > world.xMax - XMARGIN - 1.2;
      if (near0 && nd < 2.2) {
        const away = Math.sign(b.x - near0.x) || 1;
        if (atEdge && Math.sign(b.x) === away) faceDir(b, -away);   // 벽을 등졌으면 뚫고 나간다
        else faceDir(b, away);
      }
      b.x = clamp(b.x + b.dir * s.speed * 2.5 * dt, world.xMin + XMARGIN, world.xMax - XMARGIN);
      worm.x = b.x + b.dir * 0.45; worm.z = b.z + 0.1; worm.y = height(b) * 0.5;
      if (near0 && nd < 0.75 && Math.random() < dt * 0.9) { stealWorm(b, near0); return; }
      const cornered = b.x <= world.xMin + XMARGIN + 0.05 || b.x >= world.xMax - XMARGIN - 0.05;
      if (b.wormRun <= 0 || (cornered && nd < 0.9)) { b.fleeing = false; eatWorm(b); }
      return;
    }
    // 감정 폭발 진행 (신남: 뛰어다니며 파닥 / 엉엉: 주저앉아 빙글빙글)
    if (b.anim === 'ecstatic') {
      b.burstT = (b.burstT || 0) + dt; faceDir(b, Math.sin(b.burstT * 2.2) > 0 ? 1 : -1);
      b.x = clamp(b.x + b.dir * s.speed * 2.6 * dt, world.xMin + XMARGIN, world.xMax - XMARGIN);
      if (b.y === 0 && b.vy === 0 && Math.random() < dt * 2.5) b.vy = rand(4, 6.5);
      b.spin = (b.spin || 0) + dt * 5; b.b3.holder.rotation.y = Math.sin(b.spin) * 0.6;
    } else if (b.anim === 'wail') {
      b.spin = (b.spin || 0) + dt * 1.6; b.b3.holder.rotation.y = b.spin;
    } else if (b.b3.holder.rotation.y !== 0) { b.b3.holder.rotation.y *= Math.max(0, 1 - dt * 6); if (Math.abs(b.b3.holder.rotation.y) < 0.01) b.b3.holder.rotation.y = 0; }
    if (b.leap) {
      b.leap.t += dt;
      const k = Math.min(1, b.leap.t / b.leap.dur);
      b.x = b.leap.x0 + (b.leap.x1 - b.leap.x0) * k;
      b.z = b.leap.z0 + (b.leap.z1 - b.leap.z0) * k;
      if (Math.abs(b.leap.x1 - b.leap.x0) > 0.2) b.dir = b.leap.x1 > b.leap.x0 ? 1 : -1;
      if (k >= 1) b.leap = null;
    }
    // 중력 (지붕 위면 지붕이 바닥)
    const gY = b.onRoof ? world3dRoof() : 0;
    if (b.y > gY || b.vy > 0) {
      const fluttering = b.anim === 'fall';
      b.vyPrev = b.vy;
      b.vy -= GRAV * (fluttering ? 0.9 : 1) * dt;           // 닭은 날지 못한다 — 퍼덕여도 10%만 느려진다
      if (fluttering && b.vy < -9) b.vy = -9;
      b.y += b.vy * dt;
      if (b.y <= gY && b.vy <= 0) {
        b.y = gY; b.vy = 0; b.b3.model.land();
        if (b.anim === 'fall') {
          const hard = -b.vyPrev || 0;
          world.puff(b.x, b.z, 7, 0.45);                     // 착지 먼지
          b.d.stress = clamp(b.d.stress + (isYoungling(b) ? 18 : 6), 0, 100);
          // 높은 데서 떨어지면 다친다. 어린 것일수록 쉽게 다친다.
          const hurtLine = isYoungling(b) ? 6.5 : 8.5;
          if (hard > hurtLine && !b.onRoof) {
            b.d.hurt = { since: today(), heals: 1 };
            b.d.health = clamp(b.d.health - (isYoungling(b) ? 25 : 12), 0, 100);
            b.d.stress = clamp(b.d.stress + 25, 0, 100);
            showIcon(b, '🤕', 4000); peepSound();
            toast(`🤕 ${b.d.name}(이)가 떨어지며 다쳤어요. 하루 쉬면 나아요`, true, 8000);
            setAnim(b, 'sad', rand(3, 5));
            const mom = momOf(b); if (mom && eligible(mom)) { mom.careKid = b.d.id; goTo(mom, b.x + (mom.x < b.x ? -1 : 1) * 1.0, 'gokid'); showIcon(mom, '😰', 3000); }
            markDirty(); renderCoop();
          } else {
            if (isYoungling(b)) showIcon(b, '😵', 1600);
            setAnim(b, b.onRoof ? 'roost' : 'idle', rand(0.8, 1.6));
          }
        } else if (b.anim === 'jump') setAnim(b, b.onRoof ? 'roost' : 'idle', rand(0.6, 1.5));
      }
    }
    if (b.anim === 'fall') return;
    // 겹침 방지: 가까운 닭끼리 서로 살짝 밀어낸다 (알·품는 닭 제외)
    // 겹침: 느긋하게 있을 때만 서로 밀어낸다. 달리거나 도망칠 때는 그냥 스쳐 지나간다.
    const FAST = b.anim === 'chase' || b.frolicking || b.fleeing || b.anim === 'panic' || b.anim === 'spar';
    if (b.d.stage !== 'egg' && !b.d.brooding && !b.inCoop && !b.onRoof && !b.leap && !FAST) {
      for (const o of birds) {
        if (o === b || o.d.stage === 'egg' || o.inCoop || o.carrying || o.onRoof) continue;
        if (o.anim === 'chase' || o.frolicking || o.fleeing || o.anim === 'panic') continue;   // 달려오는 놈은 통과시킨다
        const dx = b.x - o.x, dz = b.z - o.z, minD = 0.55 * (height(b) + height(o)) * 0.55;
        const dist = Math.hypot(dx, dz * 1.6);
        if (dist < minD && dist > 0.001) {
          // 서열이 낮은 쪽이 더 많이 밀린다
          const mine = rank(b), theirs = rank(o);
          const share = mine > theirs ? 0.35 : mine < theirs ? 1.5 : 1;
          const push = (minD - dist) * dt * 2.2 * share;
          b.x += (dx / dist) * push;
          b.z = clampZ(b.z + (dz / dist) * push * 0.6);
        }
      }
      b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN);
    }
    // 벌레가 나타나면 하던 일을 멈추고 달려간다
    const tgt = chaseTarget(b);
    if (tgt && eligible(b) && ACT.canInterrupt(b.anim, 'chase') && !(tgt.kind === 'call' && (b.anim === 'sleep' || b.inCoop) && b.d.aff < 60)) {
      b.inCoop = false; setVisible(b, true); b.targetX = null;
      if (b.onRoof) { leaveRoof(b); return; }
      setAnim(b, 'chase', 30);
    }
    if (b.anim === 'chase') {
      if (!tgt) { decide(b); return; }
      // 선생님 손에 들려 있으면 반원으로 둘러싸 조르고, 바닥에 놓여 있으면 바로 앞까지 간다
      let reach = 0.5;
      if (tgt.kind === 'worm' && worm && !worm.carrier) {
        if (worm.held || worm.y > 0.4) {
          const crowd = birds.filter((q) => q.anim === 'chase' || q.anim === 'beg');
          const i = Math.max(0, crowd.indexOf(b)), n = Math.max(1, crowd.length);
          const ang = Math.PI * (0.15 + 0.7 * (n === 1 ? 0.5 : i / (n - 1)));
          tgt.x = worm.x + Math.cos(ang) * (0.9 + 0.35 * height(b));
          tgt.z = worm.z - 0.3 - Math.sin(ang) * 1.5;
          reach = 0.35;
        } else {
          tgt.x = worm.x; tgt.z = worm.z;            // 바닥의 벌레는 정확히 그 자리로
          reach = 0.22 + 0.06 * height(b);
        }
      }
      const dx = tgt.x - b.x, dist = Math.abs(dx);
      if (dist > reach) {
        faceDir(b, dx > 0 ? 1 : -1);
        b.x += b.dir * s.speed * 2.4 * (b.d.old ? 0.7 : 1) * dt;
        b.z += (tgt.z - b.z) * Math.min(1, dt * 2.5);
        if (Math.abs(b.x - tgt.x) < dist * 0.02) b.x = tgt.x;
      } else if (tgt.kind === 'worm') {
        const car = wormCarrier();
        if (car && car !== b) { if (Math.random() < 0.45) stealWorm(car, b); else { setAnim(b, 'beg', rand(0.4, 0.8)); if (b.y === 0) b.vy = 3.2; } return; }
        if (!worm.held && worm.y <= 0.35 && !worm.carrier) { grabWorm(b); return; }
        setAnim(b, 'beg', rand(0.6, 1.2)); if (Math.random() < 0.35) { b.vy = 3.5; }
      } else { const wasPlay = !!b.callTarget.follow; b.callTarget = null; jump(b, 240); if (wasPlay) { b.d.boredom = clamp(b.d.boredom - 40, 0, 100); const o = birds.find((q) => q.playFlee === b.d.id); if (o) { o.playFlee = null; o.d.boredom = clamp(o.d.boredom - 40, 0, 100); showIcon(o, '😆', 1200); } showIcon(b, '😆', 1200); } else showIcon(b, '❤️', 1500); return; }
      b.animT += dt; if (b.animT > b.animDur) { b.callTarget = null; decide(b); }
      return;
    }
    if (b.anim === 'beg') {
      b.animT += dt;
      if (!worm) { decide(b); return; }
      if (Math.abs(worm.x - b.x) > 2.4) { setAnim(b, 'chase', 30); return; }
      if (!worm.held && worm.y <= 0.05) { eatWorm(b); return; }
      if (b.animT > b.animDur) { setAnim(b, 'beg', rand(0.6, 1.2)); if (Math.random() < 0.4 && b.y === 0) b.vy = 3.2; }
      return;
    }
    if (ACT.isGoal(b.anim) && b.targetX !== null) {
      const speed = s.speed * (b.d.old ? 0.6 : 1) * (b.fleeing ? 2 : 1) * (b.d.hurt ? 0.45 : 1) * (b.d.sick ? 0.55 : 1);
      faceDir(b, b.targetX > b.x ? 1 : -1);
      b.x += b.dir * speed * dt;
      if (b.walkZ !== undefined && Math.abs(b.walkZ - b.z) > 0.03) b.z += Math.sign(b.walkZ - b.z) * Math.min(Math.abs(b.walkZ - b.z), speed * 0.5 * dt);
      if (Math.abs(b.targetX - b.x) < 0.08) {
        b.x = b.targetX; b.targetX = null; b.walkZ = undefined;
        if (b.anim === 'gofeed') { b.goal = 'eat'; setAnim(b, 'eat', 3); }
        else if (b.anim === 'gowater') { b.goal = 'drink'; setAnim(b, 'drink', 2.5); }
        else if (b.anim === 'gocoop') { b.inCoop = true; setVisible(b, false); setAnim(b, 'sleep', rand(15, 30)); showIcon(b, '💤', 3000); }
        else if (b.anim === 'gonest') setAnim(b, 'brood', rand(8, 20));
        else if (b.anim === 'gopeek') {
          setAnim(b, 'cock', rand(0.7, 1.3));                  // 멈춰 서서 고개를 갸웃한다
          later(b, 1000, () => {
            if (b.anim !== 'cock') return;
            const gap = Math.abs(lure.x - b.x);
            // 충분히 가까워졌으면 이제 부리로 쪼아 본다
            if (gap < 2.0) { faceDir(b, lure.x > b.x ? 1 : -1); setAnim(b, 'peckat', rand(2.5, 5)); b.d.boredom = clamp(b.d.boredom - 12, 0, 100); return; }
            if ((b.peekLeft || 0) > 0 && lure.active > 0.3 && now() - lure.at < 4000) peek(b);
            else { b.peekLeft = 0; decide(b); }
          });
        }
        else if (b.anim === 'gowarm') { b.z = clampZ((warmSpot() || { z: b.z }).z + rand(-0.6, 0.6)); setAnim(b, 'huddle', rand(4, 8)); showIcon(b, '🥶', 2000); }
        else if (b.anim === 'gocool') { setAnim(b, 'pant', rand(3, 6)); showIcon(b, '🥵', 2000); }
        else if (b.anim === 'gopeckat') setAnim(b, 'peckat', rand(2.5, 5));
        else if (b.anim === 'gohuddle') { setAnim(b, 'huddle', rand(4, 9)); b.d.stress = clamp(b.d.stress - 12, 0, 100); b.d.social = clamp(b.d.social - 25, 0, 100); }
        else if (b.anim === 'godust') { b.z = clamp(home().dustpit.z + rand(-0.5, 0.5), -2.2, 2.2); startDustBath(b); }
        else if (b.anim === 'panic') { setAnim(b, 'flap', 1.2); }
        else if (b.anim === 'follow') { b.z = clamp(momOf(b) ? momOf(b).z + rand(-0.6, 0.6) : b.z, -1.8, 1.8); setAnim(b, 'scratch', rand(3, 6)); b.d.social = clamp(b.d.social - 35, 0, 100); }
        else if (b.anim === 'gokid') { const k = birds.find((q) => q.d.id === b.careKid); setAnim(b, 'nuzzle', 2.2); if (k) { showIcon(k, '❤️', 1500); k.d.stress = clamp(k.d.stress - 30, 0, 100); k.d.social = clamp(k.d.social - 30, 0, 100); if (k.anim === 'idle' || k.anim === 'walk') setAnim(k, 'pet', 2); } b.d.social = clamp(b.d.social - 20, 0, 100); }
        else if (b.anim === 'golamp') { b.z = clamp(home().lamp.z + rand(-0.6, 0.6), -2, 2); setAnim(b, Math.random() < 0.5 ? 'idle' : 'preen', rand(4, 9)); showIcon(b, '🔥', 1200); b.d.stress = clamp(b.d.stress - 10, 0, 100); }
        else if (b.anim === 'golamp-sleep') { b.z = clamp(home().lamp.z + rand(-0.6, 0.6), -2, 2); setAnim(b, 'sleep', rand(20, 40)); showIcon(b, '💤', 2000); }
        else if (b.anim === 'goroof') jumpToRoof(b);
        else if (b.anim === 'gomom-sleep') { setAnim(b, 'sleep', rand(15, 35)); const m = momOf(b); if (m && eligible(m) && (m.anim === 'idle' || m.anim === 'walk' || m.anim === 'preen')) { m.targetX = null; setAnim(m, 'brood', rand(15, 35)); } }
        else setAnim(b, 'idle', rand(1, 3));
        b.fleeing = false;
      }
      if (b.x < world.xMin + XMARGIN || b.x > world.xMax - XMARGIN) { b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN); b.dir = -b.dir; b.dirAt = now(); b.targetX = null; setAnim(b, 'idle', 1); }
    }
    b.animT += dt;
    if (b.animT >= b.animDur) {
      if (b.anim === 'eat' && b.goal === 'eat' && trait(b).stubborn < 1.4) {
        const boss = birds.find((o) => o !== b && rank(o) > rank(b) && (o.anim === 'gofeed' || o.anim === 'eat') && Math.abs(o.x - b.x) < 1.6);
        if (boss) { b.goal = null; showIcon(b, '😣', 1200); goTo(b, b.x + (Math.sign(b.x - boss.x) || 1) * rand(2, 3.5), 'walk'); b.d.stress = clamp(b.d.stress + 8, 0, 100); return; }
      }
      if (b.anim === 'eat' && b.goal === 'treat') {
        b.d.happy = clamp(b.d.happy + 15, 0, 100); b.d.hunger = clamp(b.d.hunger + 8, 0, 100); b.goal = null; affect(b, 6 * trait(b).affGain); careTick(b, 'ate'); markDirty(); renderCoop(); if (moodOf(b).valence > 0.55) burst(b, 'ecstatic'); else jump(b, 260); showIcon(b, '❤️', 1500);
      } else if (b.anim === 'eat' && b.goal === 'eat') {
        if (state.feed >= RULE.feedPerMeal) {
          state.feed -= RULE.feedPerMeal; world.setSupplies(state.feed, state.water, state.basket);
          const fd = C.FEED[state.feedType || 'starter'];
          const right = fd.ok.includes(b.d.stage);
          b.d.hunger = clamp(b.d.hunger + (right ? 35 : 18), 0, 100);
          b.d.happy = clamp(b.d.happy + (right ? 5 : 0), 0, 100);
          if (!right) {
            b.d.wrongFeed = (b.d.wrongFeed || 0) + 1;
            showIcon(b, '⚠️', 2200);
            // 어린 것에게 칼슘 많은 레이어 사료는 몸에 부담이 된다
            if (state.feedType === 'layer' && isYoungling(b)) b.d.health = clamp(b.d.health - 3, 0, 100);
            if (b.d.wrongFeed === 3) toast(`⚠️ ${b.d.name}(이)에게 ${fd.name} 사료는 맞지 않아요 — ${STAGE_KO[b.d.stage]}에게 맞는 사료로 바꿔 주세요`, true, 10000);
          } else b.d.wrongFeed = 0;
          b.lastMeal = now(); careTick(b, 'ate');
          HYG.poopAfterMeal(b, (ms, fn) => later(b, ms, () => { if (fn()) { showIcon(b, '💩', 1400); markDirty(); renderCoop(); } }));
          markDirty(); renderCoop();
        }
        b.goal = null;
      } else if (b.anim === 'drink' && b.goal === 'drink') {
        if (state.water >= RULE.waterPerDrink) { state.water -= RULE.waterPerDrink; world.setSupplies(state.feed, state.water, state.basket); b.d.thirst = clamp(b.d.thirst + 40, 0, 100); b.lastDrink = now(); careTick(b, 'drank'); later(b, 200, () => { if (b.anim === 'drink' || b.anim === 'idle') setAnim(b, 'shake', 1.0); });
          if (Math.random() < 0.45) HYG.poopAfterMeal(b, (ms, fn) => later(b, ms, () => { if (fn()) { showIcon(b, '💩', 1400); markDirty(); renderCoop(); } }));
          markDirty(); renderCoop(); }
        b.goal = null;
      }
      if (b.anim === 'preen') b.d.clean = clamp((b.d.clean ?? 85) + C.CLEAN.preenGain, 0, 100);
      if (b.anim === 'sunbathe') { setAnim(b, 'preen', rand(3, 5)); return; }
      if (b.anim === 'scratch' && Math.random() < 0.65) { goTo(b, b.x + rand(-1, 1) * rand(0.8, 2.6), 'walk'); return; }   // 볕을 쬐면 반드시 깃털을 다듬는다
      if (b.anim === 'sleep' && b.inCoop && Math.random() < 0.5) { setAnim(b, 'sleep', rand(15, 30)); return; }
      decide(b);
    }
  }

  // ---- 하루 단위 성장 규칙 ----
  // 하루에 먹고 마시면 그날이 '돌본 날'. 알은 품어진 날이 '돌본 날'.
  // 먹고+마신 날만 "돌본 날". 기록은 저장 데이터(b.d.care)에 남는다 — 껐다 켜도 유지.
  function careTick(b, what) {
    const wasCared = ST.caredToday(b.d);
    ST.markCare(b.d, what); forgetCare(b);
    markDirty();
    if (!wasCared && ST.caredToday(b.d)) {
      if ((b.d.wrongFeed || 0) >= 2) { showIcon(b, '⚠️', 2500); }
      if (b.d.hurt) { b.d.hurt = null; b.d.health = clamp(b.d.health + 25, 0, 100); showIcon(b, '💚', 3000); toast(`💚 ${b.d.name}(이)의 다리가 다 나았어요`, false, 5000); note('healed', b); }
      growCheck(b); layCheck(b); tryReturn();
      if (daysCared(b) >= 3) chapter(2);
    }
  }
  function broodTick(egg) {
    if (ST.caredToday(egg.d)) return;
    ST.markCare(egg.d, 'brooded'); forgetCare(egg); markDirty(); growCheck(egg);
  }
  // 돌본 날 수는 매 프레임 불리지만 계산은 기록 전체를 훑는다.
  // 기록이 바뀌는 곳은 careTick·brood·advance 셋뿐이므로 그때만 다시 센다.
  function daysCared(b) {
    const day = today();
    if (b._dc === undefined || b._dcDay !== day) { b._dcDay = day; b._dc = ST.daysCared(b.d); }
    return b._dc;
  }
  const forgetCare = (b) => { b._dc = undefined; };
  function advance(b, stage) { b.d.stage = stage; b.d.stageSince = today(); forgetCare(b); world.setStage(b.b3, stage); b.anim = 'idle'; }
  function growCheck(b) {
    if (HYG.level(state.ammonia) === 'bad') { showIcon(b, '🤢', 2000); return; }   // 암모니아가 심하면 자라지 못한다
    if (b.d.sick) { showIcon(b, HLT.info(b.d.sick.type).icon, 2000); return; }      // 아픈 동안은 자라지 않는다
    const n = daysCared(b);
    if (b.d.stage === 'egg' && n >= RULE.daysEgg) {
      if (b.hatching === undefined || b.hatching === null) startHatching(b);
    } else if (b.d.stage === 'chick' && n >= RULE.daysChick) {
      advance(b, 'young'); jump(b, 280); chime(); later0(() => note('young', b), 700);
      toast(`${b.d.name}(이)가 어린닭이 됐어요. 볏이 자라서 ${b.d.sex === 'f' ? '암컷' : '수컷'}인 걸 알 수 있어요`, true, 8000);
      chapter(3);
    } else if (b.d.stage === 'young' && n >= RULE.daysYoung) {
      const sex = b.d.sex || (Math.random() < 0.5 ? 'f' : 'm');
      b.d.sex = sex; advance(b, sex === 'f' ? 'hen' : 'rooster'); jump(b, 300); later0(() => note('adult', b), 700);
      if (sex === 'f' && (state.settings.propHidden || {}).nest) {
        // 첫 암탉 — 이제 둥지와 바구니가 필요해졌다
        state.settings.propHidden = Object.assign({}, state.settings.propHidden, { nest: false, basket: false });
        layoutHome(); markDirty();
        later0(() => scene(['알을 낳기 시작할 테니 둥지가 있어야겠구나.', '둥지랑 달걀 바구니를 마당에 놓아 두었단다.'], grannyHide, 'proud'), 2600);
      }
      chapter(4);
      toast(sex === 'f' ? `🐔 ${b.d.name}(이)가 암탉이 됐어요! 이제 알을 낳을 수 있어요` : `🐓 ${b.d.name}(이)가 수탉이 됐어요! 꼬끼오~`, true, 8000); chime();
      if (sex === 'm') crowSound();
    } else if (isAdult(b) && !b.d.old && n >= RULE.daysToOld) {
      b.d.old = true; toast(`${b.d.name}(이)가 나이가 들었어요. 천천히 걷고 알은 더 낳지 않아요`, false, 8000);
    } else if (isAdult(b) && b.d.old && n >= RULE.daysToLeave) {
      farewell(b);
    }
    markDirty();
  }
  // 부화: 톡톡(pip) → 빙 둘러 깨기(zip) → 뚜껑 열림 → 젖은 병아리가 마르며 일어선다
  const HATCH_SEC = 12;
  function startHatching(b) {
    b.hatching = 0; b.targetX = null; b.leap = null; b.inCoop = false; setVisible(b, true);
    setAnim(b, 'hatch', 99);
    toast(`🥚 ${b.d.name}... 알이 움직여요!`, true, 6000);
    const mom = birds.find((h) => h.d.brooding === b.d.id);
    if (mom) { mom.targetX = null; setAnim(mom, 'brood', HATCH_SEC); showIcon(mom, '👀', 4000); }
    markDirty();
  }
  function finishHatch(b) {
    const mom = birds.find((h) => h.d.brooding === b.d.id);
    world.addShells(b.x, b.z);
    advance(b, 'chick');
    b.hatching = null; b.newborn = 4;
    b.d.energy = 55; b.d.hunger = 60; b.d.thirst = 60; b.d.stress = 30;
    setAnim(b, 'idle', 3); showIcon(b, '🐣', 3500);
    if (mom) {
      mom.d.brooding = null; mom.d.children = (mom.d.children || 0) + 1; b.d.momId = mom.d.id;
      setAnim(mom, 'nuzzle', 3); showIcon(mom, '❤️', 3000);
      toast(`🐣 ${b.d.name}(이)가 태어났어요! 엄마는 ${mom.d.name}`, true, 10000);
    } else toast(`🐣 ${b.d.name}(이)가 태어났어요!`, true, 10000);
    chime(); peepSound();
    markDirty(); renderCoop();
  }
  // ── 이별 ──
  // 기본은 "완화된 이별": 오래 방치하면 편지를 남기고 떠나지만, 다시 잘 돌보면 돌아온다.
  // 안심 모드에서는 아무도 떠나지 않는다.
  const LEAVE_WARN = 3, LEAVE_DAYS = 5, RETURN_DAYS = 3;
  function depart(b, reason) {
    const safe = state.settings.lifeEnd === 'safe';
    if (safe && reason === 'neglect') return false;
    const rec = {
      id: b.d.id, name: b.d.name, stage: STAGE_KO[b.d.stage], trait: b.d.trait,
      born: new Date(b.d.born).toISOString().slice(0, 10), left: today(),
      eggs: b.d.eggsLaid || 0, children: b.d.children || 0, reason,
    };
    if (reason === 'neglect') {
      state.away.push(Object.assign({ data: b.d, progress: 0 }, rec));
      toast(`✉️ ${b.d.name}(이)가 편지를 남기고 떠났어요 — "더 잘 돌봐줄 농장에 잠시 다녀올게요"`, true, 14000);
      toast(`${RETURN_DAYS}일 연속으로 남은 친구들을 잘 돌보면 ${b.d.name}(이)가 돌아와요`, false, 12000);
    } else {
      state.album.push(rec);
      toast(reason === 'natural' ? `🌿 ${b.d.name}(이)가 자연으로 돌아갔어요. 앨범에서 만나요`
        : `🚜 ${b.d.name}(이)가 넓은 농장으로 은퇴했어요. 앨범에서 만나요`, true, 13000);
    }
    disposeRuntime(b);
    birds = birds.filter((x) => x !== b);
    state.flock = state.flock.filter((x) => x.id !== b.d.id);
    markDirty(); renderCoop();
    return true;
  }
  const farewell = (b) => depart(b, state.settings.lifeEnd === 'natural' ? 'natural' : 'retire');

  // 떠난 닭이 돌아온다
  function tryReturn() {
    if (!state.away.length) return;
    const caredToday = birds.length
      ? birds.every((q) => q.d.stage === 'egg' || ST.caredToday(q.d))
      : (state.feed > 40 && state.water > 40);
    if (!caredToday) return;
    for (const a of state.away.slice()) {
      if (a.lastProgressDay === today()) continue;
      a.lastProgressDay = today(); a.progress = (a.progress || 0) + 1;
      if (a.progress >= RETURN_DAYS && birds.length < RULE.maxFlock) {
        state.away = state.away.filter((x) => x !== a);
        const d = a.data; d.aff = clamp((d.aff || 50) + 10, 0, 100); d.stress = 20;
        state.flock.push(d);
        const rt = makeRuntime(d); rt.x = (world.xMin + world.xMax) / 2; birds.push(rt);
        jump(rt, 320); showIcon(rt, '❤️', 5000);
        toast(`🎉 ${a.name}(이)가 돌아왔어요!`, true, 14000); chime();
      } else {
        toast(`✉️ ${a.name}(이)에게 소식이 갔어요 (${a.progress}/${RETURN_DAYS}일)`, false, 6000);
      }
    }
    markDirty(); renderCoop();
  }

  // 방치를 확인한다 — 등교일만 센다. 주말·방학은 세지 않는다.
  function checkNeglect() {
    if (state.settings.lifeEnd === 'safe') return;
    for (const b of birds.slice()) {
      if (b.d.stage === 'egg') continue;
      try {
      let missed = SCH.neglectedDays(b.d, state);
      if (missed.length >= LEAVE_DAYS && state.freezes > 0) {
        const used = SCH.useFreeze(b.d, missed.slice(0, missed.length - (LEAVE_WARN - 1)), state);
        if (used) { toast(`🧊 돌봄 프리즈 ${used}개를 써서 ${b.d.name}의 빠진 날을 덮었어요 (남은 프리즈 ${state.freezes}개)`, true, 10000); missed = SCH.neglectedDays(b.d, state); }
      }
      if (missed.length >= LEAVE_DAYS) { depart(b, 'neglect'); continue; }
      if (missed.length >= LEAVE_WARN) {
        b.d.stress = clamp(b.d.stress + 30, 0, 100);
        b.d.aff = clamp(b.d.aff - 10, 0, 100);
        showIcon(b, '🥺', 5000);
        toast(`🥺 ${b.d.name}(이)가 ${missed.length}일째 혼자예요. ${LEAVE_DAYS - missed.length}일 더 지나면 떠나요`, true, 12000);
      }
      } catch (err) { console.error('checkNeglect', b.d.name, err); }
    }
    markDirty();
  }

  // 암탉: 돌본 날 하루 1알
  // 품기를 시작한다 — 알을 둥지로 옮기고 그 위에 앉는다
  function startBrooding(hen, egg) {
    const hm = home();
    hen.d.brooding = egg.d.id;
    egg.x = hm.nest.x; egg.z = hm.nest.z; egg.d.x = toFrac(egg.x); egg.d.z = egg.z;
    hen.inCoop = false; setVisible(hen, true);
    goTo(hen, hm.nest.x, 'gonest');
    showIcon(hen, '🥚', 3000);
    toast(`🥚 ${hen.d.name}(이)가 ${egg.d.name}을(를) 품기 시작했어요. 매일 품어야 부화해요`, true, 9000);
    markDirty(); renderCoop();
  }
  function layCheck(hen) {
    if (hen.d.stage !== 'hen' || hen.d.old || hen.d.lastLaid === today()) return;
    if (HYG.level(state.ammonia) === 'bad') { showIcon(hen, '🚫', 2200); return; }  // 암모니아가 심하면 알을 낳지 않는다
    hen.d.lastLaid = today(); hen.d.eggsLaid += 1; showIcon(hen, '🥚', 4000);
    if (hen.d.eggsLaid === 1) later0(() => note('firstEgg', hen), 600);
    const fertile = hasRooster();
    const room = birds.length < RULE.maxFlock;
    if (fertile && room && !hen.d.brooding) {
      const egg = newBird('egg', { fertile: true, x: toFrac(home().nest.x), z: home().nest.z, name: pick(NAMES.filter((n) => !birds.some((b) => b.d.name === n))) || pick(NAMES) });
      state.flock.push(egg); const rt = makeRuntime(egg); rt.x = home().nest.x; rt.z = home().nest.z; birds.push(rt);
      hen.d.brooding = egg.id; world.setSupplies(state.feed, state.water, state.basket);
      toast(`🥚 ${hen.d.name}(이)가 둥지에 알을 낳았어요. 품기 시작!`, true, 8000);
    } else {
      state.coins += 1; state.basket += 1; world.setSupplies(state.feed, state.water, state.basket);
      toast(fertile && !room ? `🥚 ${hen.d.name}(이)가 알을 낳았어요 → 닭장이 꽉 차서 바구니로` : `🥚 ${hen.d.name}(이)가 알을 낳았어요 → 수탉이 없어서 바구니로 (무정란)`, false, 8000);
    }
    markDirty(); renderCoop();
  }
  // 품는 암탉이 둥지에 있으면 매일 알의 '돌본 날'이 쌓인다 (1분마다 확인)
  setInterval(() => { for (const h of birds) if (h.d.brooding && h.anim === 'brood') { const egg = birds.find((e) => e.d.id === h.d.brooding); if (egg) broodTick(egg); else h.d.brooding = null; } }, 60000);

  // ---- 그리기 (3D) ----
  const overlay = $('#bubbles');
  let mouse = { x: -1, y: -1, movedAt: 0 };
  // 커서가 실제로 가리키는 지점(바닥 위 살짝 띄운 곳). 닭들은 이 점을 본다.
  let cursorSpot = null, cursorStill = 0, cursorSpeed = 0, lastCursor = { x: 0, y: 0, t: 0 };
  function updateCursorSpot(dt) {
    if (mouse.x < 0 || !visible || now() - mouse.movedAt > 45000) { cursorSpot = null; cursorStill = 0; cursorSpeed = 0; return; }
    const gp = world.screenToGround(mouse.x, mouse.y);
    cursorSpot = gp ? { x: gp.x, y: 0.3, z: clampZ(gp.z) } : null;
    // 커서가 얼마나 가만히 있는가 — 멈춰 있어야 닭이 다가와 쫀다
    const moved = Math.hypot(mouse.x - lastCursor.x, mouse.y - lastCursor.y);
    cursorSpeed = moved / Math.max(dt, 0.001);
    lastCursor = { x: mouse.x, y: mouse.y };
    cursorStill = moved < 6 ? Math.min(8, cursorStill + dt) : 0;
    if (cursorSpot && cursorStill > 0.4) {
      lure.x = cursorSpot.x; lure.at = now();
      lure.active = Math.min(1, lure.active + dt * 0.5);       // 가만히 있을수록 궁금해진다
    }
  }
  function draw(dt) {
    const t = performance.now() / 1000;
    updateCursorSpot(dt);
    for (const b of birds) {
      const m = b.b3;
      m.holder.position.set(b.x, 0, b.z);
      // 시선: 커서가 최근에 움직였으면 커서를, 아니면 이따금 다른 곳을
      const moving = ACT.isMoving(b.anim) ? 1 : 0;
      // 쪼거나 갸웃할 때는 '화면 위의 커서 그 자체'를 겨눈다 (바닥 그림자가 아니라)
      if ((b.anim === 'peckat' || b.anim === 'cock' || b.anim === 'gopeckat') && mouse.x >= 0) {
        const pt = world.screenToPlaneZ(mouse.x, mouse.y, b.z);
        if (pt) { b.look.set(pt.x, Math.max(0.05, pt.y), b.z); b.aimed = true; }
      } else b.aimed = false;
      if (b.aimed) { /* 위에서 이미 조준함 */ } else
      if (worm && (b.anim === 'chase' || b.anim === 'beg')) b.look.set(worm.x, worm.y + 0.3, worm.z);
      else if (moving) b.look.set(b.x + b.dir * 8, 1.4, b.z + 3);                  // 걸을 땐 앞을 본다
      else if (b.carrying && cursorSpot) b.look.set(cursorSpot.x, cursorSpot.y, cursorSpot.z);
      else if (cursorSpot && now() - mouse.movedAt < 5000) b.look.set(cursorSpot.x, cursorSpot.y, cursorSpot.z);
      else if (t > b.lookAt) {
        b.lookAt = t + rand(2, 5);
        const kids = kidsOf(b), mom = momOf(b);
        if (kids.length && Math.random() < 0.5) { const k = pick(kids); b.look.set(k.x, 0.6, k.z); }
        else if (mom && Math.random() < 0.4) b.look.set(mom.x, 1.5, mom.z);
        else b.look.set(b.x + rand(-6, 6), rand(0.5, 4), rand(2, 10));
      }
      const anim = ACT.pose(b.anim);
      m.model.update(dt, { anim, moving, dir: b.dir, jumpY: b.y, lookTarget: b.look, curious: true, wobble: b.f === 1, hatch: b.hatching || 0, phase: b.dustPhase || 0, holdWorm: !!(worm && worm.carrier === b.d.id), sick: !!b.d.sick, hurt: !!b.d.hurt, dull: Math.max(0, (C.CLEAN.dullBelow - (b.d.clean ?? 85)) / C.CLEAN.dullBelow), speed: b.anim === 'chase' || b.fleeing ? 2.2 : 1, mood: b.d.stage === 'egg' ? null : moodOf(b) });
      if (b.f === 1 && b.d.stage === 'egg' && t > (b.wobbleUntil || 0)) b.f = 0;
      // 오버레이(아이콘·이름표) 위치
      const top = world.project(b.x, height(b) + b.y + 0.2, b.z);
      b.box = m.holder.visible ? { top: top.y, x: top.x } : null;
      const showIconNow = b.icon && now() < b.iconUntil && m.holder.visible;
      if (showIconNow) { if (!b.iconEl) { b.iconEl = document.createElement('div'); b.iconEl.className = 'icon'; overlay.appendChild(b.iconEl); } b.iconEl.textContent = b.icon; b.iconEl.style.left = top.x + 'px'; b.iconEl.style.top = (top.y - 4 + Math.sin(t * 4) * 2) + 'px'; b.iconEl.style.display = ''; }
      else if (b.iconEl) b.iconEl.style.display = 'none';
      const showTag = m.holder.visible && (hoverId === b.d.id || (selectedId === b.d.id && !panel.classList.contains('hidden')));
      if (showTag) { if (!b.tagEl) { b.tagEl = document.createElement('div'); b.tagEl.className = 'tag'; overlay.appendChild(b.tagEl); } b.tagEl.textContent = `${b.d.name} · ${STAGE_KO[b.d.stage]}${sexMark(b.d)}`; b.tagEl.style.left = top.x + 'px'; b.tagEl.style.top = (top.y - (showIconNow ? 34 : 4)) + 'px'; b.tagEl.style.display = ''; }
      else if (b.tagEl) b.tagEl.style.display = 'none';
    }
    if (worm) {
      if (!worm.held && !worm.carrier) { if (worm.y > 0 || worm.vy > 0) { worm.vy -= GRAV * dt; worm.y += worm.vy * dt; if (worm.y <= 0) { worm.y = 0; worm.vy = 0; } } if (now() - worm.bornAt > 90000) removeWorm(); }
      if (worm) { worm.model.group.visible = !worm.carrier; worm.model.group.position.set(worm.x, worm.y + 0.12, worm.z); worm.model.update(dt); }
    }
    tickHygiene(dt);
    tickCursorPeck(dt);
    if (visible) world.render();
  }
  // 위생: 암모니아 누적 · 로봇청소기 · 경고
  let hygT = 0, lastHygLevel = 'ok';
  function tickHygiene(dt) {
    hygT += dt; if (hygT < 1) return;
    const step = hygT; hygT = 0;
    HYG.tickAmmonia(state, step);
    if (HYG.vacuumTick(state, step)) markDirty();
    const lv = HYG.level(state.ammonia);
    if (lv !== lastHygLevel) {
      lastHygLevel = lv;
      if (lv === 'smell') toast('😷 냄새가 나기 시작해요 — 닭장을 치워 주세요 (똥을 클릭하면 치워져요)', true, 9000);
      else if (lv === 'bad') toast('🚨 암모니아가 심해요! 닭들이 자라지도 알을 낳지도 못해요', true, 12000);
      renderCoop();
    }
    if (lv !== 'ok' && Math.random() < step / 12) {
      const b = pick(birds.filter(eligible));
      if (b) showIcon(b, lv === 'bad' ? '🤢' : '😷', 1800);
    }
  }
  let last = performance.now();
  let acc = 0;
  function loop(t) {
    const dt = Math.min(0.1, (t - last) / 1000); last = t; acc += dt;
    if (acc >= 1 / 32) { for (const b of birds) update(b, acc); draw(acc); acc = 0; }
   requestAnimationFrame(loop);
  }

  // ---- 마우스 ----
  function birdAt(x, y) { const h = world.pick(x, y); return h && h.type === 'bird' ? birds.find((b) => b.d.id === h.id) || null : null; }
  function propAt(x, y) { const h = world.pick(x, y); return h && h.type === 'prop' ? h.name : null; }
  function poopAt(x, y) { const h = world.pick(x, y); return h && h.type === 'poop' ? ENT.get(h.id) : null; }
  function sweep(p) {
    if (!p) return false;
    world.puff(p.x, p.z, 5, 0.3, 0xBFAE8C);
    ENT.remove(p);
    state.ammonia = Math.max(0, (state.ammonia || 0) - 1.2);
    sweepSound(); markDirty(); renderCoop();
    return true;
  }
  let hoverProp = null;
  const propTag = document.createElement('div'); propTag.className = 'tag'; propTag.style.display = 'none'; $('#bubbles').appendChild(propTag);
  function propLabel(name) {
    if (name === 'feeder') return `🌾 모이통 ${Math.round(state.feed)}% — 클릭하면 채우기`;
    if (name === 'waterer') return `💧 물통 ${Math.round(state.water)}% — 클릭하면 채우기`;
    if (name === 'basket') return `🧺 달걀 ${state.basket}개 · 🪙 ${state.coins}`;
    if (name === 'wormbucket') return `🪱 벌레 ${state.worms}마리 — 잡아서 끌어다 놓기`;
    return PROP_KO[name] || name;
  }
  function propClick(name) {
    const hm = home();
    if (name === 'feeder') { if (now() - state.lastFeedRefill < RULE.refillCooldownMin * 60000) { toast(`모이는 ${Math.ceil((RULE.refillCooldownMin * 60000 - (now() - state.lastFeedRefill)) / 60000)}분 후에 다시 채울 수 있어요`); return; } $('#btnFeed').click(); }
    else if (name === 'waterer') { if (now() - state.lastWaterRefill < RULE.refillCooldownMin * 60000) { toast(`물은 ${Math.ceil((RULE.refillCooldownMin * 60000 - (now() - state.lastWaterRefill)) / 60000)}분 후에 다시 채울 수 있어요`); return; } $('#btnWater').click(); }
    else if (name === 'nest') {
      const eggs = birds.filter((b) => b.d.stage === 'egg' && !ST.caredToday(b.d));
      if (!eggs.length) { toast(birds.some((b) => b.d.stage === 'egg') ? '오늘은 이미 품어줬어요. 내일 또 만나요' : '둥지에 알이 없어요'); return; }
      for (const e of eggs) { broodTick(e); e.f = 1; e.wobbleUntil = performance.now() / 1000 + 1; showIcon(e, '✨'); }
      toast(`🤲 알 ${eggs.length}개를 따뜻하게 품어줬어요`); renderCoop();
    }
    else if (name === 'basket') { openPanel('coop'); toast(state.basket ? `🧺 달걀 ${state.basket}개가 모였어요` : '🧺 아직 달걀이 없어요'); }
    else if (name === 'coop') togglePanel();
  }
  let drag = null;
  // 문지르기(쓰다듬기): 버튼을 누르지 않고 닭 위에서 마우스를 왔다갔다 하면 발동
  const rub = { id: null, lastX: 0, sign: 0, rev: 0, dist: 0, lastT: 0, active: false, tickT: 0 };
  function rubTick(b, x) {
    const t = now();
    if (rub.id !== b.d.id || t - rub.lastT > 900) { Object.assign(rub, { id: b.d.id, lastX: x, sign: 0, rev: 0, dist: 0, active: false }); }
    const dx = x - rub.lastX; rub.lastX = x; rub.lastT = t;
    if (Math.abs(dx) > 1) { const sg = Math.sign(dx); if (rub.sign && sg !== rub.sign) rub.rev++; rub.sign = sg; rub.dist += Math.abs(dx); }
    if (!rub.active && rub.dist > 70 && rub.rev >= 2 && eligible(b) && !b.carrying) {
      rub.active = true; rub.tickT = t; b.inCoop = false; setVisible(b, true); b.targetX = null; setAnim(b, 'pet', 1.5); showIcon(b, '❤️', 900);
      if (b.d.aff < 25 && trait(b).flee > 1.2 && Math.random() < 0.5) { rub.active = false; scoldFlee(b); return; }
    }
    if (rub.active) {
      if (b.anim !== 'pet') setAnim(b, 'pet', 1.5); else b.animT = 0;
      if (t - rub.tickT > 500) { rub.tickT = t; affect(b, 2 * trait(b).affGain); b.d.happy = clamp(b.d.happy + 2, 0, 100); b.d.pets += 1; showIcon(b, pick(['❤️', '💕', '🎵', '😊']), 900); }
    }
  }
  function rubEnd() { if (rub.active) { const b = birds.find((q) => q.d.id === rub.id); if (b && b.anim === 'pet') setAnim(b, 'idle', rand(1, 2)); renderCoop(); } rub.id = null; rub.active = false; }
  function scoldFlee(b) { showIcon(b, '💨', 1200); const gx = mouse.x >= 0 ? (world.screenToGround(mouse.x, mouse.y) || { x: b.x }).x : b.x; goTo(b, b.x + (Math.sign(b.x - gx) || 1) * rand(3, 5), 'walk'); b.fleeing = true; }

  addEventListener('mousemove', (e) => {
    if (drag) {
      if (drag.sweeping) { sweep(poopAt(e.clientX, e.clientY)); return; }
      if (drag.worm) { if (worm) { const p = world.screenToPlaneZ(e.clientX, e.clientY, 1.2); if (p) { worm.x = clamp(p.x, world.xMin + 0.5, world.xMax - 0.5); worm.y = Math.max(0.15, p.y); } } return; }
      if (drag.prop) { // 소품 옮기기
        const gp = world.screenToGround(e.clientX, e.clientY);
        if (gp && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) {
          drag.moved = true; state.settings.propPos = state.settings.propPos || {};
          state.settings.propPos[drag.prop] = { fx: clamp((gp.x - drag.offX - world.xMin) / (world.xMax - world.xMin), 0.01, 0.99), z: clamp(gp.z - drag.offZ, -3.2, 2.2) };
          layoutHome(); markDirty();
        }
        return;
      }
      // 닭 들어 올리기
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
        drag.moved = true; drag.b.carrying = true; drag.b.inCoop = false; setVisible(drag.b, true); setAnim(drag.b, 'carry', 99);
        if (isYoungling(drag.b)) { drag.b.d.stress = clamp(drag.b.d.stress + 30, 0, 100); showIcon(drag.b, '😣', 2000); peepSound(); momPanic(drag.b); }
        else if (drag.b.d.aff < 40 && Math.random() < 0.5) showIcon(drag.b, '😣', 1500);
      }
      if (drag.moved) {
        const p = world.screenToPlaneZ(e.clientX, e.clientY, drag.b.z);
        if (p) { drag.b.x = clamp(p.x - drag.offX, world.xMin + XMARGIN, world.xMax - XMARGIN); drag.b.y = Math.max(0, p.y - height(drag.b) * 0.5); }
      }
      return;
    }
    const dtm = Math.max(16, now() - (mouse.movedAt || now()));
    const mvx = (e.clientX - mouse.x) / dtm * 1000, mvy = (e.clientY - mouse.y) / dtm * 1000;
    checkCursorScare(e.clientX, e.clientY, mvx, mvy);
    trackLure(e.clientX, e.clientY, Math.hypot(mvx, mvy));
    mouse = { x: e.clientX, y: e.clientY, movedAt: now() };
    const hit = visible ? world.pick(e.clientX, e.clientY) : null;
    const b = hit && hit.type === 'bird' ? birds.find((q) => q.d.id === hit.id) : null;
    hoverId = b ? b.d.id : null;
    hoverProp = hit && hit.type === 'prop' ? hit.name : null;
    const hoverPoop = hit && hit.type === 'poop';
    if (b && b.d.stage !== 'egg') rubTick(b, e.clientX); else if (rub.id && now() - rub.lastT > 400) rubEnd();
    if (hoverPoop) { const e2 = ENT.get(hit.id); propTag.textContent = e2 && e2.cecal ? '💩 맹장 똥 — 흐물흐물하고 냄새가 나지만 정상이에요 (클릭·드래그로 치우기)' : '💩 똥 — 클릭하거나 드래그해서 치우세요'; propTag.style.display = ''; propTag.style.left = e.clientX + 'px'; propTag.style.top = (e.clientY - 14) + 'px'; }
    else if (hoverProp) { propTag.textContent = propLabel(hoverProp); propTag.style.display = ''; propTag.style.left = e.clientX + 'px'; propTag.style.top = (e.clientY - 14) + 'px'; }
    else propTag.style.display = 'none';
    canvas.style.cursor = b ? 'grab' : (hoverProp || hoverPoop) ? 'pointer' : 'default';
  });
  setInterval(() => { if (rub.id && now() - rub.lastT > 700) rubEnd(); }, 300);
  setInterval(() => { if (birds.length && state.onboarded) nudge(); }, 20000);
  canvas.addEventListener('mousedown', (e) => {
    const b = birdAt(e.clientX, e.clientY);
    if (e.button === 2) return;
    if (!b) {
      const pp = poopAt(e.clientX, e.clientY);
      if (pp) { sweep(pp); drag = { sweeping: true, sx: e.clientX, sy: e.clientY }; canvas.style.cursor = 'grabbing'; return; }
      const pr = propAt(e.clientX, e.clientY);
      if (pr === 'wormbucket') { if (spawnWorm(e.clientX, e.clientY)) { drag = { worm: true, sx: e.clientX, sy: e.clientY }; canvas.style.cursor = 'grabbing'; } }
      else if (pr && editMode) { const gp = world.screenToGround(e.clientX, e.clientY), L = home()[pr]; drag = { prop: pr, sx: e.clientX, sy: e.clientY, offX: gp ? gp.x - L.x : 0, offZ: gp ? gp.z - L.z : 0, moved: false }; canvas.style.cursor = 'grabbing'; }
      else if (pr) { propClick(pr); }
      else closePanel();
      return;
    }
    const p = world.screenToPlaneZ(e.clientX, e.clientY, b.z);
    drag = { b, offX: p ? p.x - b.x : 0, sx: e.clientX, sy: e.clientY, moved: false };
    canvas.style.cursor = 'grabbing';
  });
  addEventListener('mouseup', (e) => {
    if (!drag) return;
    if (drag.sweeping) { drag = null; canvas.style.cursor = 'default'; return; }
    if (drag.worm) { if (worm) worm.held = false; drag = null; canvas.style.cursor = 'default'; return; }
    if (drag.prop) { if (!drag.moved) propClick(drag.prop); else toast('📦 자리를 옮겼어요 (설정에서 초기화 가능)'); drag = null; canvas.style.cursor = 'pointer'; return; }
    const b = drag.b;
    if (drag.moved) {
      b.carrying = false; b.d.x = toFrac(b.x); b.targetX = null;
      if (b.y > 0) { setAnim(b, 'fall', 99); b.vy = 0; } else decide(b);
      momRelief(b);
      markDirty();
    }
    else touch(b);
    drag = null; canvas.style.cursor = 'grab';
  });
  // 확대·축소 — 작게/보통/크게 버튼 대신 휠. 아이들이 쓰던 방식 그대로다.
  // 땅을 두 번 누르면 닭들이 저를 부르는 줄 알고 달려온다
  canvas.addEventListener('dblclick', (e) => {
    if (editMode) return;
    if (birdAt(e.clientX, e.clientY) || propAt(e.clientX, e.clientY)) return;
    const gp = world.screenToGround(e.clientX, e.clientY);
    if (!gp) return;
    const x = clamp(gp.x, world.xMin + XMARGIN, world.xMax - XMARGIN);
    const z = clampZ(gp.z);
    world.puff(x, z, 6, 0.5, 0xFFF3C4);
    const n = callFlock(x, z, null);
    if (n) chime();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = clamp((state.settings.zoom ?? 1) * (e.deltaY > 0 ? 0.92 : 1.087), 0.55, 2.2);
    if (Math.abs(z - (state.settings.zoom ?? 1)) < 0.001) return;
    state.settings.zoom = z; markDirty(); resize();
  }, { passive: false });

  // 시점 — 우클릭을 누른 채 위아래로 움직이면 내려다보는 각도가 바뀐다 (지도 앱과 같은 조작)
  let tilt = null;
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2) { tilt = { y: e.clientY, from: state.settings.elev ?? 24 }; e.preventDefault(); } });
  addEventListener('mousemove', (e) => {
    if (!tilt) return;
    const v = clamp(tilt.from + (e.clientY - tilt.y) * 0.16, 16, 55);
    if (Math.abs(v - (state.settings.elev ?? 24)) < 0.15) return;
    state.settings.elev = v; resize();
  });
  addEventListener('mouseup', () => { if (tilt) { tilt = null; markDirty(); } });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const b = birdAt(e.clientX, e.clientY); if (!b || b.d.stage === 'egg') return;
    scold(b);
  });
  function scold(b) {
    b.inCoop = false; setVisible(b, true); b.targetX = null; b.callTarget = null;
    affect(b, -6 * trait(b).flee); b.d.happy = clamp(b.d.happy - 4, 10, 100); b.d.stress = clamp(b.d.stress + 40, 0, 100);
    setAnim(b, 'scold', 0.9); b.vy = 2.5; showIcon(b, '💢', 900);
    soundAlarm('ground', b.x, 7);
    b.scolds = (b.scolds || 0) + 1; setTimeout(() => { b.scolds = Math.max(0, (b.scolds || 1) - 1); }, 60000);
    if (b.scolds >= 3) { later(b, 1000, () => burst(b, 'wail')); return; }
    later(b, 900, () => { if (b.anim === 'scold' || b.anim === 'idle') { showIcon(b, pick(['😢', '😳', '🥺']), 2200); const away = mouse.x >= 0 ? Math.sign(b.x - (world.screenToGround(mouse.x, mouse.y) || { x: b.x }).x) || 1 : b.dir; goTo(b, b.x + away * rand(3, 6) * trait(b).flee, 'walk'); b.fleeing = true; } });
    renderCoop();
  }
  canvas.addEventListener('dblclick', (e) => {
    const b = birdAt(e.clientX, e.clientY);
    if (b) { selectedId = b.d.id; if (b.d.stage === 'egg') { openPanel('coop'); return; } showIcon(b, '📣', 2000); const n = callFlock(b.x, b.z, b); toast(n ? `📣 ${b.d.name}(이)가 친구들을 불렀어요` : `📣 ${b.d.name}: 올 친구가 없네요`); }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePanel(); $('#journalModal').classList.add('hidden'); grannyHide(); } });
  function treat(b) {
    const k = b.d.sick && b.d.sick.type;
    if (k === 'pasty') { HLT.cure(b.d); showIcon(b, '✨', 3000); toast(`💧 ${b.d.name}(이)의 엉덩이를 닦아 줬어요. 다 나았어요`, true, 7000); markDirty(); renderCoop(); return true; }
    if (k === 'cold') { toast(`🥶 ${b.d.name}(이)는 따뜻하게 해 줘야 나아요. 보온등을 켜고 온도를 맞춰 주세요`, false, 8000); return false; }
    if (k === 'cocci') { toast(`🩸 콕시듐증은 약이 필요해요. 닭장 메뉴에서 약을 사서 물에 타 주세요`, false, 8000); return false; }
    if (k === 'crop') { toast(`🚫 하루 동안 사료를 끊고 물만 주면 나아요. 그릿도 사 두세요`, false, 8000); return false; }
    return false;
  }
  function touch(b) {
    selectedId = b.d.id;
    if (b.d.sick && treat(b)) return;
    if (b.d.stage === 'egg') { b.f = 1; b.wobbleUntil = performance.now() / 1000 + 1; setAnim(b, 'egg', 1.5); showIcon(b, '✨', 1500); return; }
    if (now() - (b.lastPet || 0) > 20000) { b.d.happy = clamp(b.d.happy + 3, 0, 100); b.d.pets += 1; b.lastPet = now(); affect(b, 1.5 * trait(b).affGain); markDirty(); }
    b.inCoop = false; setVisible(b, true); if (b.d.brooding) { showIcon(b, '❤️'); return; }
    jump(b, 240); showIcon(b, '❤️');
  }

  // ---- 소리 ----
  let audio = null;
  const ac = () => (audio = audio || new (window.AudioContext || window.webkitAudioContext)());
  function tone(f0, f1, t0, dur, type = 'triangle', vol = 0.2) {
    const o = ac().createOscillator(), g = ac().createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac().destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function chime() { if (!state.settings.sound) return; try { const t = ac().currentTime; [523, 659, 784].forEach((f, i) => tone(f, f, t + i * 0.18, 0.5)); } catch (_) {} }
  function sweepSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; tone(2200, 700, t, 0.09, 'triangle', 0.09); } catch (_) {} }
  function pipSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; for (let i = 0; i < 3; i++) tone(1400, 900, t + i * 0.13, 0.06, 'square', 0.07); } catch (_) {} }
  function peepSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; [880, 1180, 980, 1320].forEach((f, i) => tone(f, f * 1.15, t + i * 0.16, 0.13, 'sine', 0.13)); } catch (_) {} }
  function crowSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; tone(520, 620, t, 0.18, 'sawtooth', 0.12); tone(700, 760, t + 0.2, 0.18, 'sawtooth', 0.12); tone(880, 980, t + 0.4, 0.35, 'sawtooth', 0.14); tone(760, 520, t + 0.78, 0.5, 'sawtooth', 0.1); } catch (_) {} }
  // 수탉은 항상 서열 1위부터 내림차순으로 이어 운다. 1위가 없으면 2위가 첫 울음을 맡는다.
  function crowChain(announce) {
    const roosters = birds.filter((q) => q.d.stage === 'rooster' && eligible(q)).sort((a, c) => rank(c) - rank(a));
    if (!roosters.length) return 0;
    roosters.forEach((r, i) => {
      later(r, i * 1600, () => {
        if (!eligible(r)) return;
        r.inCoop = false; setVisible(r, true); r.targetX = null;
        setAnim(r, 'crow', 2.4); crowSound(); startleKids(r);
        if (i === 0 && announce) toast('🐓 꼬끼오! 좋은 아침이에요', true, 6000);
        else if (i > 0) showIcon(r, '🎵', 2000);
      });
    });
    return roosters.length;
  }
  function morningCrow() {
    if (state.lastCrow === today()) return;
    if (crowChain(true)) { state.lastCrow = today(); markDirty(); }
  }

  // ---- 패널 ----
  const panel = $('#panel');
  function openPanel(tab) { panel.classList.remove('hidden'); if (tab) showTab(tab); renderCoop(); renderSettings(); }
  function closePanel() { panel.classList.add('hidden'); }
  function togglePanel() { panel.classList.contains('hidden') ? openPanel() : closePanel(); }
  function showTab(name) { $$('.tabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name)); $$('section.tab').forEach((s) => s.classList.toggle('active', s.dataset.tab === name)); }
  $$('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#closePanel').addEventListener('click', closePanel);

  const DOING = {
    idle: '두리번거리는 중', sit: '앉아 있는 중', walk: '산책 중', scratch: '땅을 긁는 중', peck: '땅을 쪼는 중',
    eat: '먹는 중', drink: '물 마시는 중', sleep: '자는 중', preen: '깃털을 다듬는 중', dustbath: '모래 목욕 중',
    sunbathe: '햇볕 쬐는 중', stretch: '기지개 켜는 중', flap: '날개를 퍼덕이는 중', frolic: '까불며 뛰는 중',
    brood: '알을 품는 중 🥚', gonest: '둥지로 가는 중', nuzzle: '새끼를 다독이는 중', huddle: '친구와 붙어 있는 중',
    crow: '우는 중 🐓', guard: '망을 보는 중', tidbit: '먹이를 알리는 중', roost: '홰에 앉아 있는 중',
    chase: '쫓아가는 중', beg: '조르는 중', jump: '폴짝', happy: '신난 중', ecstatic: '신나서 뛰는 중',
    wail: '엉엉 우는 중', sad: '시무룩한 중', stomp: '화난 중', scold: '혼나는 중', startle: '놀란 중',
    alert: '경계하는 중', crouch: '납작 엎드린 중', pet: '쓰다듬 받는 중', carry: '들려 있는 중', fall: '떨어지는 중',
    sick: '아파서 웅크린 중', pant: '더워서 헐떡이는 중', egg: '알 속에서 자라는 중', hatch: '알을 깨는 중 🐣',
    spar: '겨루는 중', squat: '웅크린 중', follow: '엄마를 따라가는 중', gofeed: '밥 먹으러 가는 중',
    gowater: '물 마시러 가는 중', gocoop: '닭장으로 가는 중', godust: '모래밭으로 가는 중', gopeek: '살피러 가는 중',
    gowarm: '따뜻한 데로 가는 중', gocool: '시원한 데로 가는 중', golamp: '보온등으로 가는 중', gokid: '새끼에게 가는 중',
    panic: '새끼에게 달려가는 중', gohuddle: '친구에게 가는 중', goroof: '지붕에 오르는 중',
  };
  const doing = (b) => DOING[b.anim] || '';
  // ── 숫자 대신 말 ──
  // 게이지는 초등 저·중학년에게 읽히지 않는다. 물통이 비어 보이고 닭이 웅크린 것이 지표다.
  // 여기 카드에서도 숫자 대신 말로 적고, 숫자는 '자세히 보기'를 켠 사람에게만 보인다.
  const detailOn = () => !!(state.settings || {}).detail;
  function levelSay(v, words) {           // words = [바닥, 적음, 보통, 넉넉]
    const i = v < 12 ? 0 : v < 35 ? 1 : v < 70 ? 2 : 3;
    return words[i] + (detailOn() ? ` (${Math.round(v)}%)` : '');
  }
  // 이 닭이 지금 무엇을 바라는가 — 급한 것부터
  function needSay(d) {
    const out = [];
    if (d.sick) out.push('🤒 아파요');
    if (d.hurt) out.push('🤕 다쳤어요');
    if (d.hunger < 35) out.push('🌾 배가 고파요');
    if (d.thirst < 35) out.push('💧 목이 말라요');
    if ((d.clean ?? 85) < 40) out.push('🛁 꾀죄죄해요');
    if (d.energy < 25) out.push('😴 졸려요');
    if (d.stress > 50) out.push('😰 놀랐어요');
    if (d.boredom > 70) out.push('🥱 심심해요');
    if (!out.length) out.push(d.aff >= 70 ? '❤️ 기분이 좋아요' : '🙂 별일 없어요');
    return out.slice(0, 3).join(' · ');
  }
  const affSay = (v) => (v >= 70 ? '❤️ 나를 좋아해요' : v < 30 ? '😒 아직 서먹해요' : '🙂 조금씩 친해지는 중');

  function renderCoop() {
    if (panel.classList.contains('hidden')) return;
    $('#feedSay').textContent = levelSay(state.feed, ['텅 비었어요', '거의 없어요', '조금 남았어요', '넉넉해요']);
    $('#waterSay').textContent = levelSay(state.water, ['텅 비었어요', '거의 없어요', '조금 남았어요', '넉넉해요']);
    $('#basketCount').textContent = state.basket; $('#coinCount').textContent = state.coins; $('#wormCount').textContent = state.worms;
    const lv = HYG.level(state.ammonia), n = HYG.count();
    $('#poopCount').textContent = n;
    $('#ammLabel').textContent = HYG.LABEL[lv] + (detailOn() ? ` (${Math.round(state.ammonia || 0)}ppm)` : '');
    $('#ammLabel').className = 'say ' + (lv === 'ok' ? '' : lv);
    const fd = C.FEED[state.feedType || 'starter'];
    $$('[data-feed]').forEach((x) => x.classList.toggle('primary', x.dataset.feed === (state.feedType || 'starter')));
    const wrong = birds.filter((q) => q.d.stage !== 'egg' && !fd.ok.includes(q.d.stage));
    $('#feedHint').textContent = wrong.length ? `⚠️ ${wrong.map((q) => STAGE_KO[q.d.stage]).filter((v, i, a) => a.indexOf(v) === i).join('·')}에게는 안 맞아요` : `✅ ${fd.protein}`;
    $$('[data-lamp]').forEach((x) => x.classList.toggle('primary', Math.abs(+x.dataset.lamp - (state.lampPower ?? 0.6)) < 0.02));
    const chicks = birds.filter((q) => q.d.stage === 'chick');
    const cold = chicks.filter((q) => q.comfort && q.comfort.state === 'cold').length;
    const hot = chicks.filter((q) => q.comfort && q.comfort.state === 'hot').length;
    $('#lampHint').textContent = !chicks.length ? '병아리가 없어요' : cold ? `🥶 추워하는 병아리 ${cold}마리` : hot ? `🥵 더워하는 병아리 ${hot}마리` : '✅ 병아리들이 편안해요';
    $('#bedSay').textContent = levelSay(state.bedding ?? 100, ['다 젖었어요', '축축해요', '조금 눅눅해요', '보송보송해요']);
    $('#btnBedding').textContent = (state.bedding ?? 100) > 70 ? '아직 깨끗' : '갈기';
    const fl = Math.max(0, RULE.refillCooldownMin * 60000 - (now() - state.lastFeedRefill)), wl = Math.max(0, RULE.refillCooldownMin * 60000 - (now() - state.lastWaterRefill));
    $('#btnFeed').textContent = fl ? `${Math.ceil(fl / 60000)}분 후` : '채우기'; $('#btnWater').textContent = wl ? `${Math.ceil(wl / 60000)}분 후` : '채우기';
    const box = $('#flockList'); box.innerHTML = '';
    $('#starterBox').classList.toggle('hidden', birds.length > 0);
    const order = STAGE_ORDER;
    for (const b of birds.slice().sort((a, c) => order[a.d.stage] - order[c.d.stage])) {
      const need = { egg: RULE.daysEgg, chick: RULE.daysChick, young: RULE.daysYoung }[b.d.stage];
      const n = daysCared(b);
      const card = document.createElement('div'); card.className = 'petCard' + (selectedId === b.d.id ? ' selected' : '');
      const days = Math.max(1, Math.ceil((now() - b.d.born) / 86400000));
      const broodedToday = b.d.stage === 'egg' && ST.caredToday(b.d);
      card.innerHTML = `
        <div class="head"><span class="name">${esc(b.d.name)}</span>
          <span class="sex ${sexKnown(b.d) ? b.d.sex : ''}">${STAGE_KO[b.d.stage]}${sexMark(b.d)}${b.d.old ? ' · 노년' : ''}</span>
          <span class="stage">${doing(b)}</span></div>
        <div class="head"><span class="stage">${days}일째 · ${b.d.trait}${b.d.stage === 'hen' ? ` · 알 ${b.d.eggsLaid}개` : ''}${b.d.brooding ? ' · 품는 중' : ''}</span></div>
        ${need ? `<div class="stat"><b>${b.d.stage === 'egg' ? '부화' : '성장'}</b><span class="say">${n >= need ? '곧 자라요!' : `${need - n}번 더 돌보면 자라요`}${detailOn() ? ` (${n}/${need}일)` : ''}</span></div>` : ''}
        ${b.d.stage !== 'egg' ? `<div class="stat"><b>지금</b><span class="say">${needSay(b.d)}</span></div>
        <div class="stat"><b>나와</b><span class="say">${affSay(b.d.aff)}${detailOn() ? ` (${Math.round(b.d.aff)}%)` : ''}</span></div>
        ${detailOn() ? `<div class="nums">배부름 ${Math.round(b.d.hunger)} · 물 ${Math.round(b.d.thirst)} · 기운 ${Math.round(b.d.energy)} · 깨끗함 ${Math.round(b.d.clean ?? 85)} · 긴장 ${Math.round(b.d.stress || 0)}</div>` : ''}
        <div class="hint">${b.d.trait} — ${TRAIT_DESC[b.d.trait] || ''}${b.d.momId ? ` · 엄마: ${(birds.find((h) => h.d.id === b.d.momId) || {}).d?.name || '떠남'}` : ''}</div>` : ''}
        <div class="actions">
          ${b.d.stage === 'egg' ? `<button class="small primary" data-act="brood" ${broodedToday ? 'disabled' : ''}>🤲 ${broodedToday ? '오늘 품었어요' : '품어주기'}</button>` : ''}
          <button class="small" data-act="rename">✏️ 이름</button><button class="small" data-act="find">📍 찾기</button><button class="small danger" data-act="release">농장으로 보내기</button>
        </div>`;
      card.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act; selectedId = b.d.id;
        if (act === 'brood') { broodTick(b); b.f = 1; b.wobbleUntil = performance.now() / 1000 + 1; setAnim(b, 'egg', 1.5); showIcon(b, '✨'); }
        else if (act === 'rename') { const nm = prompt('새 이름을 정해 주세요', b.d.name); if (nm && nm.trim()) { b.d.name = nm.trim().slice(0, 12); markDirty(); } }
        else if (act === 'find') { b.x = (world.xMin + world.xMax) / 2; b.d.x = 0.5; b.inCoop = false; setVisible(b, true); if (b.d.stage !== 'egg') jump(b, 300); hoverId = b.d.id; setTimeout(() => { if (hoverId === b.d.id) hoverId = null; }, 3000); }
        else if (act === 'release') { if (e.target.dataset.confirm) depart(b, 'retire'); else { e.target.dataset.confirm = '1'; e.target.textContent = '정말요? 한 번 더'; return; } }
        renderCoop();
      });
      box.appendChild(card);
    }
    const bw = state.borrowed;
    $('#seedHint').textContent = borrowedOk()
      ? `친구네 ${bw.name}(이)가 와 있어요 (${bw.until}까지)`
      : birds.some((b) => b.d.stage === 'rooster') ? '수탉이 있어요 — 친구에게 코드를 나눠 줄 수 있어요' : '';
    const hens = birds.filter((b) => b.d.stage === 'hen').length;
    $('#coopHint').textContent = birds.length >= RULE.maxFlock ? '닭장이 꽉 찼어요 (6마리). 새 알은 바구니로 가요.' : hens && !hasRooster() ? '수탉이 없어서 지금 낳는 알은 부화하지 않아요. 친구에게 씨알 코드를 받아 보세요.' : '';
  }
  $('#btnFeed').addEventListener('click', () => { if (now() - state.lastFeedRefill < RULE.refillCooldownMin * 60000) return; state.feed = 100; state.lastFeedRefill = now(); markDirty(); renderCoop(); checkStep(); world.setSupplies(state.feed, state.water, state.basket); toast('🌾 모이통을 채웠어요'); for (const b of birds) if (b.d.stage !== 'egg' && b.d.hunger < 70 && !b.d.brooding) decide(b); });
  $('#btnWater').addEventListener('click', () => { if (now() - state.lastWaterRefill < RULE.refillCooldownMin * 60000) return; state.water = 100; state.lastWaterRefill = now(); markDirty(); renderCoop(); checkStep(); world.setSupplies(state.feed, state.water, state.basket); toast('💧 물통을 채웠어요'); });
  $('#btnStarter').addEventListener('click', () => giveFirstChick());
  // 첫 병아리는 할머니가 건넨다. 알이 아니라 병아리로 시작하는 이유는,
  // 알로 시작하면 7일 동안 할 수 있는 일이 '품기' 버튼 하나뿐이기 때문이다.
  function giveFirstChick() {
    if (birds.length) return;
    // 아이가 처음 받는 병아리다. 반드시 눈에 잘 띄는 곳에 둔다.
    // (닭장 옆에 두었더니 마당 뒤쪽 구석이라 화면 밖으로 밀렸다)
    const cx = (world.xMin + world.xMax) / 2;
    const cz = world.zMax - (world.zMax - world.zMin) * 0.22;
    const d = newBird('chick', { x: toFrac(cx), z: cz });
    state.flock.push(d);
    const rt = makeRuntime(d); rt.x = cx; rt.z = cz; birds.push(rt);
    // 알을 받을 자리는 아직 필요 없다. 첫 암탉이 나오면 할머니가 가져다 주신다.
    state.settings.propHidden = Object.assign({}, state.settings.propHidden, { nest: true, basket: true });
    layoutHome();
    state.chapter = 1; state.onboarded = false; markDirty(); renderCoop(); closePanel();
    $('#gAsk').classList.remove('hidden');
    later0(() => note('start', rt), 900);
    const kid = $('#gKid');
    kid.src = 'npc/kid_back_happy.png';        // 병아리를 받고 폴짝 뛴다
    scene([GR.CHAPTERS[1].say, `이름은 "${d.name}"라고 불러 두었단다. 마음에 안 들면 바꾸어도 좋아.`],
      () => { kid.classList.add('hidden');     // 이제 플레이어가 그 아이다
        $('#gAsk').classList.remove('hidden'); startSteps(); }, 'proud');
  }
  $$('[data-feed]').forEach((x) => x.addEventListener('click', () => {
    state.feedType = x.dataset.feed; for (const q of birds) q.d.wrongFeed = 0;
    markDirty(); renderCoop();
    const f = C.FEED[state.feedType];
    toast(`🌾 모이통에 ${f.name} 사료를 넣었어요 — ${f.desc}`, false, 4500);
  }));
  $$('[data-lamp]').forEach((x) => x.addEventListener('click', () => { setTimeout(checkStep, 60); lampEffect(+x.dataset.lamp);
    state.lampPower = +x.dataset.lamp; markDirty(); renderCoop();
    toast(`🔥 보온등 ${x.textContent}`, false, 2500);
  }));
  $('#btnBuyMed').addEventListener('click', () => {
    const sick = birds.filter((q) => q.d.sick && q.d.sick.type === 'cocci');
    if (!sick.length) { toast('💊 지금은 약이 필요한 닭이 없어요'); return; }
    const price = (C.price('약_콕시듐') || { 가격: 12000 }).가격;
    if (state.coins < price) { toast(`🪙 코인이 부족해요 (약 ${price.toLocaleString()}코인)`); return; }
    state.coins -= price;
    for (const q of sick) { HLT.cure(q.d); showIcon(q, '💚', 3500); }
    markDirty(); renderCoop();
    toast(`💊 약을 물에 타 줬어요 — ${sick.length}마리가 나았어요`, true, 8000);
  });
  $('#btnBedding').addEventListener('click', () => {
    if ((state.bedding ?? 100) > 70) { toast('깔짚이 아직 깨끗해요'); return; }
    state.bedding = 100; state.ammonia = Math.max(0, (state.ammonia || 0) * 0.35);
    markDirty(); renderCoop(); toast('🌾 깔짚을 새로 깔았어요 — 공기가 한결 나아졌어요', false, 4500);
  });
  // PowerWash의 "남은 곳 보기" — 놓친 똥을 잠깐 반짝여 알려준다
  $('#btnFindPoop').addEventListener('click', () => {
    const list = HYG.poops();
    if (!list.length) { toast('✨ 치울 게 없어요. 아주 깨끗합니다'); return; }
    for (const p2 of list) world.sparkle(p2.x, p2.z, 0.9);
    toast(`🔦 남은 똥 ${list.length}개를 표시했어요`, false, 3500);
  });
  $('#btnBuyWorm').addEventListener('click', () => { if (state.coins < 1) { toast('🪙 코인이 부족해요. 암탉이 낳은 달걀이 코인이 돼요'); return; } state.coins -= 1; state.worms += 1; markDirty(); world.setWormCount(state.worms); renderCoop(); toast('🪱 벌레 한 마리를 샀어요'); });
  $('#btnWhistle').addEventListener('click', () => { const gp = mouse.x >= 0 ? world.screenToGround(mouse.x, mouse.y) : null; const x = gp ? clamp(gp.x, world.xMin + 2, world.xMax - 2) : (world.xMin + world.xMax) / 2; const n = callFlock(x, 0.5, null); toast(n ? '🎵 휘익~ 닭들이 달려와요' : '🎵 부를 닭이 없어요'); closePanel(); });
  $('#btnAlbum').addEventListener('click', () => { renderJournal(); $('#journalModal').classList.remove('hidden'); closePanel(); });
  function journalLines() {
    const out = [];
    for (const e of (state.journal || [])) out.push(`${e.day}  ${JR.KINDS[e.kind] ? JR.KINDS[e.kind].icon : '·'} ${e.text}`);
    for (const a of (state.album || [])) out.push(`${a.left}  🌾 ${a.name}(${a.stage}) — ${a.born} 부터 함께. 낳은 알 ${a.eggs}개, 자손 ${a.children}마리`);
    return out;
  }
  function renderJournal() {
    const box = $('#journalList'); box.innerHTML = '';
    const js = (state.journal || []);
    if (!js.length && !(state.album || []).length) { box.innerHTML = '<p class="hint">아직 기록이 없어요. 닭이 자라면 그때그때 이곳에 쌓입니다.</p>'; return; }
    for (const e of js) {                       // 오래된 것부터 — 자라온 이야기가 된다
      const k = JR.KINDS[e.kind] || { icon: '·', title: '' };
      const el = document.createElement('div'); el.className = 'jItem';
      el.innerHTML = `${e.photo ? `<img class="jShot" src="${e.photo}" alt="">` : '<div class="jShot noshot">' + k.icon + '</div>'}
        <div class="jBody"><div class="jTop"><b>${k.icon} ${esc(k.title)}</b><span class="jDay">${e.day}</span></div>
        <p>${esc(e.text)}</p></div>`;
      box.appendChild(el);
    }
    for (const a of (state.album || [])) {
      const el = document.createElement('div'); el.className = 'jItem';
      el.innerHTML = `<div class="jShot noshot">🌾</div><div class="jBody">
        <div class="jTop"><b>🌾 ${esc(a.name)}</b><span class="jDay">${a.left}</span></div>
        <p>${a.born} 부터 함께 지냈어요. 낳은 알 ${a.eggs}개 · 자손 ${a.children}마리</p></div>`;
      box.appendChild(el);
    }
  }
  $('#btnJPrint').addEventListener('click', () => window.print());
  $('#btnJCopy').addEventListener('click', () => {
    const txt = ['📔 우리 닭 관찰일지', ''].concat(journalLines()).join('\n');
    try { navigator.clipboard.writeText(txt); toast('📋 복사했어요. 패들렛이나 문서에 붙여 넣으세요', false, 6000); }
    catch (e) { toast('복사가 안 되는 브라우저예요. 인쇄를 써 보세요', false, 6000); }
  });
  $('#closeJournal').addEventListener('click', () => $('#journalModal').classList.add('hidden'));

  // 타이머 탭

  // 설정 탭
  function renderSettings() {
    $('#soundOn').checked = state.settings.sound;
    const cal = !!state.settings.useCalendar;
    $('#useCalendar').checked = cal;
    $('#pauseWeekends').checked = state.settings.pauseWeekends !== false;
    for (const el of ['#pauseWeekends', '#vacationOn', '#btnAddHoliday']) { const n = $(el); if (n) n.disabled = !cal; }
    $('#vacationOn').checked = !!state.settings.vacation;
    const v = state.settings.vacation;
    $('#calInfo').textContent = (cal ? '' : '학사일정을 켜면 주말·공휴일·방학에 시간이 멈춥니다. ')
      + `🧊 돌봄 프리즈 ${state.freezes}개 남음` + (v ? ` · 🏖️ 방학 ${v.from}~${v.to}` : '')
      + ((state.settings.holidays || []).length ? ` · 🗓️ 쉬는 날 ${state.settings.holidays.length}일` : '');
    $$('[data-prop]').forEach((c) => { c.checked = propVisible(c.dataset.prop); });
    $$('[data-size]').forEach((b) => b.classList.toggle('primary', +b.dataset.size === state.settings.size));
    $$('[data-home]').forEach((b) => b.classList.toggle('primary', b.dataset.home === state.settings.homeSide));
    $$('[data-lifeend]').forEach((b) => b.classList.toggle('primary', b.dataset.lifeend === state.settings.lifeEnd));
  }
  $('#btnViewReset').addEventListener('click', () => { state.settings.zoom = 1; state.settings.elev = 24; markDirty(); resize(); toast('화면을 처음 시점으로 되돌렸어요'); });
  $$('[data-prop]').forEach((c) => c.addEventListener('change', () => { state.settings.propHidden = state.settings.propHidden || {}; state.settings.propHidden[c.dataset.prop] = !c.checked; markDirty(); layoutHome(); }));
  $('#btnMore').addEventListener('click', () => {
    const hidden = $('#moreBox').classList.toggle('hidden');
    $('#btnMore').textContent = hidden ? '⋯ 더 보기' : '⋯ 접기';
  });
  $('#btnLetter').addEventListener('click', () => {
    const url = C.LETTER_FORM;
    if (!url) { toast('편지함이 아직 준비되지 않았어요', false, 6000); return; }
    grannySay('고치고 싶은 것이나 하고 싶은 말이 있으면 적어 보렴.\n\n새 창이 열린단다. 거기 쓴 것은 할머니(만든 사람)에게 가니까,\n이름이나 학교는 적지 않아도 된단다.',
      [{ label: '편지 쓰러 가기', primary: true, fn: () => { grannyHide(); if (api.openExternal) api.openExternal(url); else window.open(url, '_blank', 'noopener'); } },
       { label: '다음에요', fn: grannyHide }], 'smile');
  });
  $('#btnSeedMake').addEventListener('click', () => {
    const r = birds.find((b) => b.d.stage === 'rooster');
    if (!r) { toast('아직 수탉이 없어요. 수탉이 자라면 친구에게 씨알 코드를 나눠 줄 수 있어요', false, 7000); return; }
    const code = makeSeedCode(r.d.name, r.d.trait, today());
    state.coins += 2; markDirty();                     // 나눠 주는 쪽도 이득이 있어야 품앗이가 된다
    grannySay(`${r.d.name}(이)의 씨알 코드란다.\n\n        ${code}\n\n친구에게 불러 주렴. 오늘 것은 사흘까지 쓸 수 있단다.\n(이름 말고는 아무것도 들어 있지 않아. 인터넷으로도 가지 않는단다.)`,
      [{ label: '복사하기', primary: true, fn: () => { try { navigator.clipboard.writeText(code); toast('📋 코드를 복사했어요'); } catch (e) { toast('코드를 손으로 적어 주세요'); } } },
       { label: '닫기', fn: grannyHide }]);
  });
  $('#btnSeedUse').addEventListener('click', () => {
    const inp = prompt('친구에게 받은 씨알 코드를 넣어 주세요 (예: 우렁-A3F7)', '');
    if (!inp) return;
    const s = readSeedCode(inp);
    if (!s) { toast('코드가 조금 다른 것 같아요. 한 글자씩 다시 확인해 볼까요?', false, 7000); return; }
    if (state.borrowed && state.borrowed.code === inp.trim() && borrowedOk()) { toast('이 코드는 이미 쓰고 있어요', false, 6000); return; }
    state.borrowed = { name: s.name, trait: s.trait, until: U.addDays(today(), 2), code: inp.trim() };
    markDirty(); renderCoop();
    grannySay(`친구네 수탉 ${s.name}(이)가 놀러 왔구나. (${s.trait})\n사흘 동안은 우리 암탉이 낳는 알에서 병아리가 태어난단다.`,
      [{ label: '고마워요', primary: true, fn: grannyHide }]);
  });
  $('#gAsk').addEventListener('click', () => { if ($('#granny').classList.contains('hidden')) askGranny(); else grannyHide(); });
  $('#btnResetProps').addEventListener('click', () => { state.settings.propPos = {}; markDirty(); layoutHome(); toast('소품 배치를 처음으로 되돌렸어요'); });
  $$('[data-home]').forEach((b) => b.addEventListener('click', () => { state.settings.homeSide = b.dataset.home; markDirty(); renderSettings(); layoutHome(); }));
  $$('[data-lifeend]').forEach((b) => b.addEventListener('click', () => { state.settings.lifeEnd = b.dataset.lifeend; markDirty(); renderSettings(); toast({ safe: '안심 모드 — 아무도 떠나지 않아요', retire: '오래 방치하면 잠시 떠나요 (다시 돌보면 돌아와요)', natural: '나이가 다 되면 자연으로 돌아가요 (고학년용)' }[b.dataset.lifeend], false, 7000); }));
  $('#useCalendar').addEventListener('change', (e) => {
    state.settings.useCalendar = e.target.checked; markDirty(); renderSettings();
    toast(e.target.checked ? '🗓️ 학사일정을 씁니다 — 주말·공휴일·방학엔 시간이 멈춰요' : '🗓️ 학사일정을 끕니다 — 매일 시간이 흘러요', false, 7000);
  });
  $('#pauseWeekends').addEventListener('change', (e) => { state.settings.pauseWeekends = e.target.checked; markDirty(); });
  $('#vacationOn').addEventListener('change', (e) => {
    if (e.target.checked) {
      const from = prompt('방학 시작일 (예: 2026-12-24)', today());
      const to = from ? prompt('방학 끝나는 날 (예: 2027-02-28)', from) : null;
      if (from && to) { state.settings.vacation = { from, to }; toast(`🏖️ ${from} ~ ${to} 은 시간이 멈춰요`, true, 8000); }
      else e.target.checked = false;
    } else state.settings.vacation = null;
    markDirty(); renderSettings();
  });
  $('#btnAddHoliday').addEventListener('click', () => {
    const d = prompt('쉬는 날을 추가해요 (예: 2026-10-05)', today());
    if (!d) return;
    state.settings.holidays = (state.settings.holidays || []).concat([d]);
    markDirty(); renderSettings(); toast(`🗓️ ${d} 을(를) 쉬는 날로 저장했어요`, false, 6000);
  });
  $('#soundOn').addEventListener('change', (e) => { state.settings.sound = e.target.checked; markDirty(); if (e.target.checked) chime(); });
  $('#autostart').addEventListener('change', (e) => api.setAutostart(e.target.checked));
  $('#btnQuit').addEventListener('click', async () => { await persist(); api.quit(); });

  let dayMark = today();
  setInterval(() => {
    if (today() !== dayMark) { dayMark = today(); SCH.markOpened(state); checkNeglect(); tryReturn(); }
    if (!panel.classList.contains('hidden')) renderCoop();
  }, 1200);
  api.on('ui:toggle-menu', togglePanel);
  api.on('pet:size', (s) => { state.settings.zoom = clamp(s / 4, 0.55, 2.2); markDirty(); resize(); });
  api.on('ui:toggle-edit', () => setEdit(!editMode));
  $('#btnEdit').addEventListener('click', () => { setEdit(!editMode); $('#btnEdit').textContent = editMode ? '소품 옮기기 끄기' : '소품 옮기기 켜기'; if (editMode) closePanel(); });
  $('#chkDetail').checked = detailOn();
  $('#chkDetail').addEventListener('change', (e) => { state.settings.detail = e.target.checked; markDirty(); renderCoop(); });
  $('#editDone').addEventListener('click', () => { setEdit(false); $('#btnEdit').textContent = '소품 옮기기 켜기'; });
  api.on('pet:toggle-visible', () => { visible = !visible; canvas.style.display = visible ? '' : 'none'; overlay.style.display = visible ? '' : 'none'; });
  api.on('work-area', () => setTimeout(resize, 50));

  // ---- 시작 ----
  async function init() {
    await C.loadPrices(api);
    const saved = await api.loadState();
    const migrated = ST.migrate(saved);
    if (migrated) state = migrated;
    else if (saved) toast('저장 데이터를 읽지 못해 새로 시작합니다', true, 9000);
    // 자리 비운 시간만큼 배고픔·목마름 (시간당 4, 최대 40)
    // 주말·방학은 시간이 흐르지 않는다. 그리고 한 번에 12시간을 넘겨 흐르지 않는다.
    const awayH = SCH.effectiveAwayHours(state.lastSeen, now(), state);
    const loss = Math.min(40, awayH * 4);
    state.feed = clamp(state.feed - awayH * 4, 0, 100);
    state.water = clamp(state.water - awayH * 5, 0, 100);
    state.bedding = clamp(state.bedding - awayH * 1.2, 0, 100);
    for (const d of state.flock) { ST.ensureBird(d); d.hunger = clamp(d.hunger - loss, 15, 100); d.thirst = clamp(d.thirst - loss, 15, 100); d.energy = clamp(d.energy + loss * 1.5, 0, 100); d.stress = 0; }
    resize();
    birds = state.flock.map(makeRuntime);
    checkNeglect();        // 지난 등교일을 먼저 정산한 뒤 오늘을 시작한다
    SCH.markOpened(state); markDirty();
    tryReturn();
    world.setSupplies(state.feed, state.water, state.basket);
    HYG.restore(state.poops);
    const info = await api.info();
    $('#version').textContent = 'v' + info.version; $('#autostart').checked = !!info.openAtLogin;
    if (!state.settings.guide) {
      // 웹은 환영 카드가 사라진 뒤(ui:begin), 데스크톱은 바로 시작한다.
      let began = false;
      const begin = () => { if (began) return; began = true; later0(startIntro, 250); };
      api.on('ui:begin', begin);
      if (!document.querySelector('#welcome')) later0(begin, 700);
    } else { $('#gAsk').classList.remove('hidden'); if (!birds.length) openPanel('coop'); }
    if (state.lastAttend !== today()) { state.lastAttend = today(); markDirty(); }
    if (state.lastWormGift !== today()) { state.lastWormGift = today(); state.worms = Math.min(9, (state.worms || 0) + 3); world.setWormCount(state.worms); markDirty(); if (birds.length) setTimeout(() => toast('🪱 오늘의 벌레 3마리가 벌레통에 도착했어요'), 4000); }
    for (const b of birds) decide(b);

    // 돌아온 걸 반기는 인사 — 벌점 화면이 아니라 선물로
    if (birds.length && awayH > 0.5) {
      const gained = state.basket;
      later(birds[0], 1200, () => {
        const parts = [];
        if (gained) parts.push(`달걀 ${gained}개`);
        if (state.worms) parts.push(`벌레 ${state.worms}마리`);
        toast(`👋 다시 오셨네요! ${parts.length ? parts.join(' · ') + '가 기다리고 있어요' : '닭들이 기다렸어요'}`, true, 9000);
      });
    }

    setTimeout(morningCrow, 2500);
    setTimeout(() => { const fans = birds.filter((b) => eligible(b) && b.d.aff >= 70); if (fans.length) { const cx = (world.xMin + world.xMax) / 2; for (const b of fans) { b.callTarget = { x: cx + rand(-2, 2), z: rand(-0.5, 1) }; setAnim(b, 'chase', 30); } toast('❤️ 닭들이 선생님을 반기러 달려와요'); } }, 1800);
    requestAnimationFrame(loop);
  }
  // 디버그 훅 (자동 캡처용)
  window.__tp = { runNeglect: () => { checkNeglect(); return birds.length; }, frozen: (n) => { const b = birds.find((q) => q.d.name === n); return b ? b.d.frozen : null; }, freezes: () => state.freezes, away: () => state.away.map((a) => a.name + ':' + (a.progress || 0)), album: () => state.album.length, journal: () => (state.journal || []).map((e) => e.kind + ':' + e.text + (e.photo ? ' [사진]' : '')), neglect: (name) => { const b = birds.find((q) => q.d.name === name); return b ? SCH.neglectedDays(b.d, state) : null; }, why: (n) => { const b = birds.find((q) => q.d.name === n); if (!b) return null; decide(b); return { choice: b.lastChoice, cands: b.lastCands }; }, lamp: (v) => { state.lampPower = v; return state.lampPower; }, comfort: () => birds.filter((q) => q.d.stage === 'chick').map((q) => ({ name: q.d.name, days: daysCared(q), st: q.comfort && q.comfort.state, need: q.comfort && +q.comfort.need.toFixed(1), act: q.comfort && +q.comfort.actual.toFixed(1) })), sickOf: (n) => { const b = birds.find((q) => q.d.name === n); return b ? b.d.sick : null; }, makeSick: (n, k) => { const b = birds.find((q) => q.d.name === n); if (b) { HLT.fallSick(b.d, k); return b.d.sick; } return null; }, poop: (n) => { for (let i = 0; i < (n || 1); i++) HYG.dropPoop(rand(world.xMin + 2, world.xMax - 2), rand(-1.5, 1.5), Math.random() < 0.15); markDirty(); return HYG.count(); }, poopCount: () => HYG.count(), amm: () => +(state.ammonia || 0).toFixed(1), setAmm: (v) => { state.ammonia = v; }, care: (name, what) => { const b = birds.find((q) => q.d.name === name); if (b) { careTick(b, what); return JSON.stringify(b.d.care); } return null; }, careOf: (name) => { const b = birds.find((q) => q.d.name === name); return b ? { care: b.d.care, days: daysCared(b), stage: b.d.stage } : null; }, at: (name) => { const b = birds.find((q) => q.d.name === name); if (!b) return null; const pt = world.project(b.x, 1, b.z); return { x: Math.round(pt.x), y: Math.round(pt.y) }; }, center: (name) => { const b = birds.find((q) => q.d.name === name); if (b) { b.x = (world.xMin + world.xMax) / 2; b.z = 0.5; } return !!b; }, hatch: (name) => { const b = birds.find((q) => q.d.name === name && q.d.stage === 'egg'); if (b) startHatching(b); return !!b; }, roof: () => { const r = birds.find((q) => q.d.stage === 'rooster'); if (r) { r.x = home().coop.x + 2.2; r.z = 1; goTo(r, home().coop.x, 'goroof'); return r.d.name; } return null; }, leave: () => { const r = birds.find((q) => q.d.onRoof); if (r) { leaveRoof(r); return r.d.name; } return null; }, set: (name, k, v) => { const b = birds.find((q) => q.d.name === name); if (b) b.d[k] = v; }, choices: () => birds.map((b) => b.d.name + ':' + (b.lastChoice || '-') + '/' + b.anim + ' v' + moodOf(b).valence.toFixed(2)), pick: (x, y) => world.pick(x, y), propPos: (k) => { const p = world.props[k]; return p ? { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), vis: p.visible } : null; }, settings: () => state.settings, spawnWorm: (px, py) => spawnWorm(px, py), moveWorm: (px, py) => { if (worm) { const p = world.screenToPlaneZ(px, py, 1.2); if (p) { worm.x = p.x; worm.y = Math.max(0.15, p.y); } } }, releaseWorm: () => { if (worm) worm.held = false; }, whistle: () => $('#btnWhistle').click(), birds: () => birds.map((b) => ({ name: b.d.name, anim: b.anim, x: +b.x.toFixed(1) })), grow: (n, s) => { const b = birds.find((q) => q.d.name === n); if (b) advance(b, s); return !!b; }, world: () => ({ xMin: +world.xMin.toFixed(2), xMax: +world.xMax.toFixed(2), zMin: +world.zMin.toFixed(2), zMax: +world.zMax.toFixed(2), roamTop: world.roamTop, px: world.pxPerUnit, W: world.W, H: world.H }), screenOf: (k) => { const p = world.props[k]; if (!p) return null; const s = world.project(p.position.x, 0.5, p.position.z); return { x: Math.round(s.x), y: Math.round(s.y), pctY: +(s.y / world.H * 100).toFixed(1) }; }, gpu: () => ({ geo: world.renderer.info.memory.geometries, tex: world.renderer.info.memory.textures, calls: world.renderer.info.render.calls }) };
  init();
})();
