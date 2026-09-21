// 티처펫 — 렌더러. 닭 한살이 시뮬레이션 + 교사 도구
// 상수는 core/config.js, 저장·마이그레이션은 core/state.js, 성격·기분은 sim/mind.js,
// 애니메이션 메타는 sim/actions.js, 닭이 아닌 오브젝트는 sim/entities.js 에 있다.
(() => {
  const api = window.teacherpet;
  const THREE = window.THREE;
  const { util: U, config: C, state: ST, mind: MIND, actions: ACT, entities: ENT, hygiene: HYG, health: HLT, school: SCH, granny: GR, journal: JR, farmcode: FC, qr: QR, weather: WX, shop: SHOP, bus } = window.TP;
  const { $, $$, now, today, rand, pick, clamp, uid, esc } = U;
  const { RULE, PX_PER_UNIT, STAGE_KO, STAGE_ORDER, SPEED, NAMES, PROP_NAMES, PROP_KO } = C;
  const { trait, moodOf, rank, TRAIT_DESC } = MIND;

  // ---- 상태 ----
  let state = ST.defaultState();
  let dirty = false;
  let wiping = false;                 // '새로 시작'을 누른 뒤에는 무슨 일이 있어도 저장하지 않는다
  const markDirty = () => { dirty = true; };
  async function persist() {
    if (wiping) return;
    state.lastSeen = now();
    const r2 = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : v);
    for (const b of birds) {
      b.d.x = Math.round(toFrac(b.x) * 1e4) / 1e4; b.d.z = r2(b.z);
      // 반올림은 기댓값 편향이 0이라 욕구가 느려지지 않는다
      for (const k of ['hunger', 'thirst', 'happy', 'aff', 'energy', 'boredom', 'social', 'stress', 'health', 'clean']) b.d[k] = r2(b.d[k]);
    }
    state.poops = HYG.serialize();
    if (wiping) return;               // 기다리는 사이에 지우기가 시작됐을 수 있다
    await api.saveState(state);
    dirty = false;
  }
  const saveSoon = setInterval(() => { if (dirty) persist(); }, 3000);
  const saveSlow = setInterval(persist, 60000);

  // 지난 농장을 지우고 처음부터 — 저장을 먼저 멈춘 뒤에 지운다.
  // 지우고 새로고침만 하면, 새로고침이 끝나기 전에 3초 저장이 한 번 더 돌아
  // 방금 지운 농장이 그대로 되살아난다. ('새로 시작이 안 된다'의 진짜 원인)
  window.__tpWipe = function () {
    wiping = true;
    clearInterval(saveSoon); clearInterval(saveSlow);
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('teacherpet.')) localStorage.removeItem(k);
    } catch (e) { /* 저장을 못 쓰는 브라우저 */ }
    location.reload();
  };

  let payAllowanceRef = null;      // init 안에서 만들어진다 (돌본 직후에도 확인하려고 밖에 둔다)

  // ---- 꾸미기 ----
  // 겉모습만 바꾼다. 어떤 수치에도 손대지 않는다 (그래야 돈 쓴 아이가 유리해지지 않는다).
  function applyDecor() {
    const f = state.farm;
    const skin = SHOP.get('coop', f.coopSkin) || SHOP.get('coop', 'red');
    world.setCoopSkin(skin);
    world.setDecos(f.decos);
    const gr = SHOP.get('ground', f.ground) || SHOP.get('ground', 'grass');
    world.scenery.setGround(gr.near, gr.mid, gr.tuft === undefined ? '#9BDA6E' : gr.tuft);   // 바닥은 이제 진짜 3D 땅이다
    for (const b of birds) applyHat(b);
  }
  function applyHat(b) {
    if (!b.b3 || !b.b3.model || !b.b3.model.setHat) return;   // 알에는 씌우지 않는다
    const id = b.d.hat || null;
    b.b3.model.setHat(id, id ? SHOP.get('hat', id) : null);
  }

  // ---- 오늘의 날씨 ----
  // 날짜와 '우리 반'만으로 정해진다. 저장하지 않는다 — 언제 물어도 같은 답이 나오기 때문이다.
  let wx = WX.of(today(), '');
  function applyWeather(forceKey) {
    wx = forceKey ? Object.assign({ key: forceKey }, WX.KINDS[forceKey]) : WX.of(today(), state.classCode);
    HLT.setRoom(wx.room);                       // 추운 날은 마당 전체가 춥다 → 병아리가 보온등을 찾는다
    const r = document.documentElement.style;
    r.setProperty('--sky1', wx.sky[0]);
    r.setProperty('--sky2', wx.sky[1]);
    r.setProperty('--sky3', wx.sky[2]);
    r.setProperty('--wx-dim', String(wx.dim));
    // 화면 위쪽의 '하늘'은 사실 아주 멀어서 하늘색이 된 땅이다.
    // 그래서 안개 색과 CSS 하늘의 아래쪽 색이 같아야 경계가 안 보인다.
    world.scenery.setSkyTone(wx.sky[2], wx.haze);
    world.scenery.setWind(wx.key === 'wind' ? 1 : 0);
    window.__tpWx = { clouds: wx.clouds, key: wx.key };
    if (window.__tpClouds) window.__tpClouds(wx.clouds, wx.key);
    const line = $('#wxLine');
    if (line) line.textContent = `${wx.icon} ${wx.name}${state.classCode ? ' · ' + state.classCode + '반' : ''}`;
    // 왼쪽 위 배지 — 아이가 오늘 무슨 날인지 언제든 볼 수 있어야 한다
    $('#wxIcon').textContent = wx.icon;
    $('#wxName').textContent = wx.name;
    $('#wxClass').textContent = state.classCode ? state.classCode + '반' : '';
    $('#wxBadge').classList.remove('hidden');
    refreshTemp();
    for (const b of birds) decide(b);
  }

  // ---- 3D 무대 ----
  const world = window.TP_WORLD.create($('#stageHost'));
  const canvas = world.renderer.domElement;
  let W = innerWidth, H = innerHeight;
  const XMARGIN = 1.2; // 화면 가장자리 여유(유닛)
  const BASE_PX = 33;  // 기준 배율. 확대/축소는 마우스 휠, 시점은 우클릭 드래그.
  function resize() {
    if (innerWidth < 2 || innerHeight < 2) return;   // 숨겨진 탭·회전 중에는 건드리지 않는다
    W = innerWidth; H = innerHeight;
    world.view.zoom = clamp(state.settings.zoom ?? 1, 0.6, 2.4);
    world.view.elev = clamp(state.settings.elev ?? 24, 16, 55);
    world.fit(W, H);
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
      basket: { x: bx(7.8), z: bz(0.30) },                 // 달걀은 둥지에서 나온다 — 바구니도 그 옆에
      perch: { x: bx(13.2), z: bz(0.18) },
      feeder: { x: bx(9.4), z: bz(0.62) }, feeder2: { x: bx(11.0), z: bz(0.86) },
      waterer: { x: bx(13.8), z: bz(0.52) },
      wormbucket: { x: bx(19.0), z: bz(0.86) },
      dustpit: { x: bx(22.6), z: bz(0.30) },
    };
    const pos = (state.farm && state.farm.placements) || {}, hid = state.settings.propHidden || {};
    const out = { flip: !left };
    for (const k of PROP_NAMES) {
      const u = pos[k];
      out[k] = (u && typeof u.x === 'number') ? { x: clamp(u.x, world.xMin + 1, world.xMax - 1), z: clampZ(u.z) } : def[k];
      out[k].visible = !hid[k];
    }
    return (homeCache = out);
  }
  const propVisible = (k) => !(state.settings.propHidden || {})[k];
  // 소품의 '단단한 속' — 닭이 밀려나는 반지름 (0 이면 막지 않는다).
  // 먹고 마시려면 붙어서야 하므로 실제로 쓰는 자리보다 작게 잡는다.
  // 둥지(품는다)·모래밭(들어가 목욕한다)·횟대(올라탄다)는 닭이 겹쳐야 하는 물건이라 0 이다.
  const PROP_SOLID = {
    coop: 1.65, nest: 0, feeder: 0.6, feeder2: 0.6, waterer: 0.6,
    basket: 0.5, wormbucket: 0.45, lamp: 0.2, dustpit: 0, perch: 0,
  };
  // 소품은 언제나 끌어서 옮길 수 있다. 눌렀다 떼면 동작하고, 끌면 자리를 옮긴다.
  // (모드를 따로 켜게 했더니 오히려 번거로웠다)
  // ── 닭 카드에 쓸 그 아이의 모습 ──
  // 화면에서 그 닭만 잘라 작은 그림으로. 단계가 바뀌거나 한참 지났을 때만 새로 찍는다.
  let shotBusy = false;
  async function shotFor(b) {
    if (shotBusy) return;
    const key = b.d.stage + '|' + (b.d.sex || '');
    if (b.thumbKey === key && now() - (b.thumbAt || 0) < 60000) return;
    if (!visible || b.inCoop) return;
    const pt = world.project(b.x, height(b) * 0.55, b.z);
    if (!pt || pt.x < 40 || pt.x > world.W - 40 || pt.y < 40 || pt.y > world.H - 40) return;
    shotBusy = true;
    try {
      const img = await Promise.race([
        world.capture(pt.x, pt.y, 96, 96),
        new Promise((r) => setTimeout(() => r(null), 1200)),
      ]);
      if (img) { b.thumb = img; b.thumbKey = key; b.thumbAt = now(); renderCoop(); }
    } catch (e) { /* 없어도 그만 */ }
    shotBusy = false;
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
  // opts.code — 농장 코드처럼 '읽고 옮겨 적는' 글자. 한 글자씩 찍으면 95자를 30초 동안 기다려야 하고
  // 말풍선 밖으로 넘친다. 그래서 코드는 처음부터 통째로, 줄바꿈되는 상자에 따로 보여 준다.
  function grannySay(text, btns, mood, opts) {
    setFace(mood);
    const card = $('#granny'), box = $('#gBtns'), say = $('#gSay');
    const code = opts && opts.code ? String(opts.code) : '';
    // QR 은 우리가 만든 그림이라 그대로 넣는다 (바깥에서 온 글이 아니다)
    const qrHtml = opts && opts.qr ? `<div class="gQr">${opts.qr}</div>` : '';
    const codeHtml = qrHtml + (code ? `<div class="gCode">${esc(code)}</div>` : '');
    const draw = (n) => { say.innerHTML = esc(text.slice(0, n)).replace(/\n/g, '<br>') + codeHtml; };
    stopTyping();
    box.innerHTML = '';
    card.classList.remove('hidden');

    // 한 글자씩 — 말하고 있다는 느낌이 여기서 나온다. 누르면 바로 다 보인다.
    let i = 0;
    talking = true;
    draw(0);
    const finish = () => {
      stopTyping(); draw(text.length);
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
      draw(i);
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
      if (birds.length) {
        // 이미 닭이 있는 농장. 첫 병아리를 또 줄 수는 없으니 여기서 안내를 끝낸다.
        // (예전에는 그냥 giveFirstChick 을 불렀고, 그 함수는 닭이 있으면 조용히 되돌아가
        //  '네'를 눌러도 아무 일도 일어나지 않는 막다른 길이 됐다)
        state.onboarded = true; markDirty();
        scene(['그래. 그럼 우리 아이들을 보러 가자꾸나.'],
          () => { grannyHide(); $('#gAsk').classList.remove('hidden'); startSteps(); }, 'smile');
        return;
      }
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
    world.setLamp(propVisible('lamp') ? power : 0);
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
    // 어미 날개 밑에 든 병아리는 보온등이 없어도 따뜻하다.
    // 보온등은 원래 어미를 대신하는 물건이다 — 이 놀이에서 그게 그대로 보인다.
    if (b.tucked) return { state: 'ok', need: HLT.needC(b.d, daysCared(b)), actual: HLT.needC(b.d, daysCared(b)), diff: 0 };
    const ws = warmSpot();
    return HLT.comfort(b.d, daysCared(b), b.x, b.z, ws, ws ? (state.lampPower ?? 0.6) : 0);
  }
  // 지금 이 농장이 몇 도인가. 아이가 숫자로 확인할 수 있어야 '온도를 맞춘다'가 성립한다.
  function tempLine() {
    const room = Math.round(HLT.roomC());
    const ws = warmSpot();
    if (!ws || !(state.lampPower > 0.02)) return `마당 ${room}℃`;
    const under = Math.round(HLT.tempAt(ws.x, ws.z, ws, state.lampPower));
    return `마당 ${room}℃ · 등 아래 ${under}℃`;
  }
  // 배지의 온도 — 병아리가 있으면 '지금 몇 도인지'와 '몇 도가 필요한지'를 같이 보여 준다.
  // 그게 이 놀이에서 아이가 배워야 할 단 하나의 숫자다.
  function refreshTemp() {
    const el = $('#wxTemp'); if (!el) return;
    const chick = birds.find((b) => b.d.stage === 'chick');
    if (!chick) { el.textContent = '· 🌡️ ' + Math.round(HLT.roomC()) + '℃'; el.classList.remove('warn'); return; }
    const need = Math.round(HLT.needC(chick.d, daysCared(chick)));
    const nowC = Math.round(chick.comfort ? chick.comfort.actual : HLT.roomC());
    el.textContent = `· 🌡️ ${nowC}℃ (필요 ${need}℃)`;
    el.classList.toggle('warn', !!chick.comfort && chick.comfort.state !== 'ok');
  }
  // 이 닭에게 맞는 모이통. 통이 둘이면 제 단계에 맞는 사료가 든 통으로 간다.
  // (맞는 통이 없으면 가까운 통으로 — 그래야 굶지 않고, ⚠️ 로 아이에게 알려진다)
  const feedAmt = (key) => (key === 'feeder2' ? (state.feed2 ?? 0) : (state.feed ?? 0));
  const feedKind = (key) => (key === 'feeder2' ? (state.feedType2 || 'grower') : (state.feedType || 'starter'));
  function feederFor(b) {
    const hm = home();
    const list = [];
    if (propVisible('feeder')) list.push({ key: 'feeder', L: hm.feeder, type: feedKind('feeder') });
    if (propVisible('feeder2')) list.push({ key: 'feeder2', L: hm.feeder2, type: feedKind('feeder2') });
    if (!list.length) return null;
    // 빈 통에는 가지 않는다 (통마다 따로 차므로 한쪽만 비어 있을 수 있다)
    const has = list.filter((f) => feedAmt(f.key) >= RULE.feedPerMeal);
    const pool0 = has.length ? has : list;
    const right = pool0.filter((f) => (C.FEED[f.type] || {}).ok?.includes(b.d.stage));
    const pool = right.length ? right : pool0;
    // 맞는 통이 여럿이면 가까운 쪽
    return pool.reduce((a, c) => (gapTo(b, c.L.x, c.L.z) < gapTo(b, a.L.x, a.L.z) ? c : a));
  }
  // 한 입 먹는 순간. 어느 통에서 먹었는지(b.feederKey)로 사료를 정한다.
  function eatTick(b) {
    const which = b.feederKey === 'feeder2' ? 'feeder2' : 'feeder';
    if (feedAmt(which) >= RULE.feedPerMeal) {
      if (which === 'feeder2') state.feed2 -= RULE.feedPerMeal; else state.feed -= RULE.feedPerMeal;
      syncSupplies();
      const fd = C.FEED[feedKind(which)];
      const right = fd.ok.includes(b.d.stage);
      b.d.hunger = clamp(b.d.hunger + (right ? 35 : 18), 0, 100);
      b.d.happy = clamp(b.d.happy + (right ? 5 : 0), 0, 100);
      if (!right) {
        // 덜 배부른 것으로 끝낸다. 건강까지 깎으면, 통이 하나뿐이던 시절처럼
        // 아이가 어쩔 수 없는 이유로 닭이 아파진다.
        b.d.wrongFeed = (b.d.wrongFeed || 0) + 1;
        showIcon(b, '⚠️', 2200);
        if (b.d.wrongFeed === 3) toast(`⚠️ ${b.d.name}(이)에게 ${fd.name} 사료는 맞지 않아요 — ${STAGE_KO[b.d.stage]}에게 맞는 사료로 바꿔 주세요`, true, 10000);
      } else b.d.wrongFeed = 0;
      b.lastMeal = now(); careTick(b, 'ate');
      HYG.poopAfterMeal(b, (ms, fn) => later(b, ms, () => { if (fn()) { showIcon(b, '💩', 1400); markDirty(); renderCoop(); } }));
      markDirty(); renderCoop();
    }
    b.goal = null;
  }
  // 통 하나만 채운다. 예전에는 어느 통을 눌러도 둘 다 찼는데,
  // 그러면 통을 둘로 나눈 뜻이 없다 (사료를 따로 쓰려고 나눈 것이다).
  const refillKey = (k) => (k === 'feeder2' ? 'lastFeedRefill2' : 'lastFeedRefill');
  function fillFeeder(k) {
    const rk = refillKey(k);
    const left = RULE.refillCooldownMin * 60000 - (now() - (state[rk] || 0));
    if (left > 0) { toast(`${k === 'feeder2' ? '파란' : '빨간'} 통은 ${Math.ceil(left / 60000)}분 후에 다시 채울 수 있어요`); return false; }
    if (k === 'feeder2') state.feed2 = 100; else state.feed = 100;
    state[rk] = now();
    markDirty(); renderCoop(); checkStep(); syncSupplies();
    toast(`🌾 ${k === 'feeder2' ? '파란' : '빨간'} 통을 채웠어요 — ${C.FEED[feedKind(k)].name}`);
    for (const b of birds) if (b.d.stage !== 'egg' && b.d.hunger < 70 && !b.d.brooding) decide(b);
    return true;
  }
  // 오른쪽 버튼으로 사료를 바로 바꾼다 (메뉴를 열지 않고)
  const FEED_ORDER = ['starter', 'grower', 'layer'];
  function cycleFeed(k) {
    const cur = feedKind(k);
    const next = FEED_ORDER[(FEED_ORDER.indexOf(cur) + 1) % FEED_ORDER.length];
    if (k === 'feeder2') state.feedType2 = next; else state.feedType = next;
    for (const q of birds) q.d.wrongFeed = 0;
    markDirty(); renderCoop();
    const f = C.FEED[next];
    toast(`🌾 ${k === 'feeder2' ? '파란' : '빨간'} 통 → ${f.name} (${f.desc})`, false, 4500);
  }
  // 달걀 팔기 — 바구니를 누르면 판다.
  // 낳는 순간 코인이 들어오던 예전 방식은 바구니를 숫자판으로 만들었다.
  // 모았다가 파는 일이 아이 손에 있어야 '모으는 재미'가 생긴다.
  const EGG_PRICE = 1;
  function doSellEggs() {
    const n = state.basket | 0;
    if (!n) return false;
    const pay = n * EGG_PRICE;
    state.basket = 0; state.coins += pay;
    markDirty(); renderCoop(); syncSupplies();
    toast(`🪙 달걀 ${n}개를 팔아 ${pay}코인을 받았어요`, true, 6000);
    return true;
  }
  function sellEggs() {
    const n = state.basket | 0;
    if (!n) { toast('🧺 아직 달걀이 없어요. 암탉이 낳으면 여기 모여요', false, 5000); return false; }
    // 할머니가 묻는다. confirm() 은 미리보기·내장 브라우저에서 막히는 일이 있어
    // 버튼을 눌러도 아무 일이 없는 것처럼 보인다.
    grannySay(`달걀이 ${n}개 모였구나. 장에 내다 팔까?\n🪙 ${n * EGG_PRICE}코인을 받는단다.`,
      [{ label: '팔게요', primary: true, fn: () => { grannyHide(); doSellEggs(); } },
       { label: '더 모을래요', fn: grannyHide }], 'smile');
    return true;
  }
  // 휘파람 — 화면의 한 점으로 닭들을 부른다. 메뉴 버튼과 땅 더블클릭이 같은 곳을 쓴다.
  function whistleAt(px, py) {
    const gp = (px >= 0 && py >= 0) ? world.screenToGround(px, py) : null;
    const x = gp ? clamp(gp.x, world.xMin + 2, world.xMax - 2) : (world.xMin + world.xMax) / 2;
    const z = gp ? clampZ(gp.z) : 0.5;
    const n = callFlock(x, z, null);
    if (gp) world.sparkle(x, z, 0.5);
    toast(n ? '🎵 휘익~ 닭들이 달려와요' : '🎵 부를 닭이 없어요');
    return n;
  }
  // 화면 안에서 묻는다. prompt() 는 미리보기·내장 브라우저에서 막히는 일이 있고,
  // 막히면 null 이 돌아와 '눌러도 아무 일이 없는' 것처럼 보인다.
  function askText(question, initial) {
    return new Promise((res) => {
      const box = $('#askModal'), inp = $('#askInput');
      $('#askQ').textContent = question;
      inp.value = initial === undefined || initial === null ? '' : String(initial);
      box.classList.remove('hidden');
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
      const done = (v) => {
        box.classList.add('hidden');
        $('#askOk').removeEventListener('click', ok);
        $('#askNo').removeEventListener('click', no);
        inp.removeEventListener('keydown', key);
        box.removeEventListener('click', bg);
        res(v);
      };
      const ok = () => done(inp.value);
      const no = () => done(null);
      const key = (e) => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') no(); };
      const bg = (e) => { if (e.target === box) no(); };
      $('#askOk').addEventListener('click', ok);
      $('#askNo').addEventListener('click', no);
      inp.addEventListener('keydown', key);
      box.addEventListener('click', bg);
    });
  }
  function warmSpot() { if (!propVisible('lamp')) return null; const L = home().lamp; const f = home().flip ? -1 : 1; return { x: L.x + 1.2 * f, z: L.z }; }
  HYG.init(world, () => ({ min: world.xMin + XMARGIN, max: world.xMax - XMARGIN }));
  // 모이통 둘·물통·바구니의 겉모습을 한 번에 맞춘다 (호출부가 흩어져 있어 한 곳으로 모았다)
  const syncSupplies = () => world.setSupplies(state.feed, state.water, state.basket, state.feed2);
  function layoutHome() { homeCache = null; world.setProps(home()); world.setLamp(propVisible('lamp') ? (state.lampPower ?? 0) : 0); syncSupplies(); world.setWormCount(state.worms); }
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
    if (d.hat && b3.model && b3.model.setHat) b3.model.setHat(d.hat, SHOP.get('hat', d.hat));
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

  // ── 손 커서 ──
  // 닭은 커서를 '무언가'로 대한다 (다가오고, 한 번 쪼고, 가만히 두면 흥미를 잃는다).
  // 화살표보다 손이어야 "닭이 내 손을 쪼았다"가 된다. 모양이 곧 '여기서 무엇을 할 수 있는지'다.
  // 브라우저가 그리는 진짜 커서 모양만 바꾼다 — 그림을 직접 따라다니게 하면 느린 크롬북에서 손이 늦게 따라온다.
  const CUR_HOT = TP.cursorHot || {};
  const CUR_NATIVE = { open: 'default', pet: 'grab', grab: 'grabbing', point: 'pointer', hoe: 'crosshair', flinch: 'default' };
  let curKind = 'open', curHold = 0;        // curHold: 이 시각까지는 움찔 모양을 유지한다
  function setCur(kind, force) {
    if (!force && now() < curHold) { curKind = kind; return; }
    curKind = kind;
    const nat = CUR_NATIVE[kind] || 'default';
    if (state.settings.plainCursor || !CUR_HOT[kind]) { canvas.style.cursor = nat; return; }
    const [hx, hy] = CUR_HOT[kind];
    // 먼저 1배 그림을 넣고, 고해상도 판을 덧씌운다. 브라우저가 image-set 을 모르면 두 번째는 무시되고 첫 번째가 남는다.
    canvas.style.cursor = `url(cursor/${kind}.png) ${hx} ${hy}, ${nat}`;
    canvas.style.cursor = `-webkit-image-set(url(cursor/${kind}.png) 1x, url(cursor/${kind}@2x.png) 2x) ${hx} ${hy}, ${nat}`;
  }
  // 닭이 커서를 쪼는 순간 — 손이 움찔한다. 아프다는 표현은 없다, "앗" 정도.
  function handPecked(b, delay) {
    // 멀리 있는 닭이 허공을 쫀 것까지 손이 움찔하면 이상하다 — 부리가 커서 가까이 있을 때만
    if (b) { const hp = world.project(b.x, height(b) * 0.6, b.z); if (!hp || Math.hypot(mouse.x - hp.x, mouse.y - hp.y) > 140) return; }
    setTimeout(() => {
      const back = curKind;
      setCur('flinch', true); curHold = now() + 300;
      setTimeout(() => { curHold = 0; setCur(curKind === 'flinch' ? back : curKind, true); }, 300);
    }, delay ?? 250);
  }
  function setAnim(b, anim, dur) {
    if (b.anim !== anim) { b.prevAnim = b.anim; b.prevAnimAt = now(); }   // 행동 도감: 방금 끝난 행동도 잠깐 봐준다
    b.anim = anim; b.animT = 0; b.animDur = dur;
  }
  // 방향은 0.5초에 한 번만 바꾼다 — 화면 끝이나 양쪽에 닭이 있을 때 매 프레임 뒤집히며 떨던 문제
  function faceDir(b, d) {
    if (!d || d === b.dir) return;
    if (now() - (b.dirAt || 0) < 500) return;
    b.dir = d; b.dirAt = now();
  }
  function jump(b, v = 300) { if (b.d.hurt) { setAnim(b, 'sad', 1.5); showIcon(b, '🤕', 1200); return; } setAnim(b, 'jump', 0.9); b.vy = v / 60; }   // 유닛/초
  function showIcon(b, icon, ms = 2500) { b.icon = icon; b.iconUntil = now() + ms; }
  // 앞뒤 목표(z)까지 받는다. 예전에는 좌우로만 걸어간 뒤 도착하는 순간 z 를 툭 바꿔서,
  // 마당이 깊어지자 20칸을 순간이동하는 것처럼 보였다.
  function goTo(b, x, anim, z) {
    if (isHigh(b)) { leaveHigh(b); return; }
    b.inCoop = false; setVisible(b, true);
    b.targetX = clamp(x, world.xMin + XMARGIN, world.xMax - XMARGIN);
    b.targetZ = (z === undefined || z === null) ? null : clampZ(z);
    b.dir = b.targetX > b.x ? 1 : -1;
    setAnim(b, anim, 25);
  }
  function setVisible(b, v) { b.b3.holder.visible = v; }
  const GRAV = 22; // 유닛/초²
  // ---- 간식(벌레) · 부르기 ----
  let worm = null;   // { model, x, y, z, held, vy, bornAt, escapes, dir, dartUntil }
  // 벌레는 가만히 누워 있지 않는다. 꿈틀대며 기어가고, 닭이 다가오면 달아난다.
  // 다만 두 번까지만 빠져나간다 — 영영 못 잡으면 아이가 지친다.
  const WORM_ESCAPE_MAX = 2;
  const eligible = (b) => b.d.stage !== 'egg' && !b.d.brooding && !b.carrying;
  const affect = (b, delta) => { b.d.aff = clamp(b.d.aff + delta, 0, 100); markDirty(); };
  // ---- 마음 도우미 (sim/mind.js 위에) ----
  const isYoungling = (b) => b.d.stage === 'chick' || b.d.stage === 'young';
  const momOf = (b) => b.d.momId ? birds.find((h) => h.d.id === b.d.momId) || null : null;
  const kidsOf = (h) => birds.filter((k) => k.d.momId === h.d.id && isYoungling(k));
  const clampZ = (z) => clamp(z, world.zMin + 0.4, world.zMax - 0.4);
  const near = (a, c, r) => Math.abs(a.x - c.x) < r && Math.abs(a.z - c.z) < r;
  // 마당이 깊어진 뒤로는 거리를 좌우로만 재면 안 된다.
  // (좌우만 재던 탓에 순간이동·못 쫓아감·헛놀람·엉뚱한 온도가 연달아 나왔다)
  const gap2 = (a, c) => Math.hypot(a.x - c.x, (a.z || 0) - (c.z || 0));
  const gapTo = (b, x, z) => Math.hypot(b.x - x, b.z - (z === undefined ? b.z : z));
  // 무리의 중심 (알·닭장 안은 제외)
  function flockCenter(except) {
    let sx = 0, sz = 0, n = 0;
    for (const q of birds) { if (q === except || q.d.stage === 'egg' || q.inCoop) continue; sx += q.x; sz += q.z; n++; }
    return n ? { x: sx / n, z: sz / n } : null;
  }
  function chaseTarget(b) { const car = wormCarrier(); if (car && car !== b) return { x: car.x, z: car.z, kind: 'worm' };
    if (worm && !(b.d.hunger > 95) && !((b.anim === 'sleep' || b.inCoop || b.anim === 'roost') && gapTo(b, worm.x, worm.z) > 2.5)) return { x: worm.x, z: worm.z, kind: 'worm' }; if (b.callTarget) { if (b.callTarget.follow) { const o = birds.find((q) => q.d.id === b.callTarget.follow); if (o) { b.callTarget.x = o.x; b.callTarget.z = o.z; } } return Object.assign({ kind: 'call' }, b.callTarget); } return null; }
  const HOLD_Y = 1.3;                       // 손에 들고 있을 때의 높이
  // 커서가 가리키는 '마당 바닥' 위의 자리. 마당 밖으로는 나가지 않는다.
  function wormSpot(px, py) {
    const g = world.screenToGround(px, py);
    if (!g) return null;
    return { x: clamp(g.x, world.xMin + 0.8, world.xMax - 0.8), z: clampZ(g.z) };
  }
  // 벌레통을 눌러 벌레를 꺼내고, 그대로 끌어다 놓을 수 있게 한다
  function spawnWormAt(px, py) {
    // 뗄 때 꺼내는 것이므로 바로 놓아 준다. 들고 있는 상태로 두면 공중에 떠 버린다.
    if (spawnWorm(px, py) && worm) { worm.held = false; worm.y = 0.9; worm.vy = 0; }
  }
  function spawnWorm(px, py) {
    if (state.worms <= 0) { toast(digToday().found < DIG_MAX ? '🪱 벌레통이 비었어요. 마당 빈 땅을 꾹 누르고 있으면 흙 속 지렁이를 찾을 수 있어요' : '🪱 벌레통이 비었어요. 내일 아침에 3마리가 또 와요', false, 6000); return false; }
    if (worm) return false;
    const sp = wormSpot(px, py);
    if (!sp) return false;
    state.worms -= 1; markDirty(); world.setWormCount(state.worms);
    const m = world.makeWorm(); world.scene.add(m.group);
    worm = { model: m, x: sp.x, y: HOLD_Y, z: sp.z, held: true, vy: 0, bornAt: now(), escapes: 0, dir: rand(0, Math.PI * 2), turnAt: 0, dartUntil: 0 };
    return true;
  }
  // 벌레가 기어간다. 닭이 가까이 오면 반대쪽으로 달아나지만, 닭보다 느리다.
  // (벌레 속도 1.5 vs 병아리 1.5·암탉 1.8 — 쫓기면 결국 잡힌다)
  function tickWormCrawl(dt) {
    if (!worm || worm.held || worm.carrier) return;
    let near = null, nd = 1e9;
    for (const b of birds) {
      if (!eligible(b)) continue;
      const d = Math.hypot(b.x - worm.x, b.z - worm.z);
      if (d < nd) { nd = d; near = b; }
    }
    const scared = near && nd < 3.4 && worm.escapes < WORM_ESCAPE_MAX;
    let speed;
    if (now() < worm.dartUntil) speed = 3.2;            // 헛챈 직후 — 쏙 달아난다
    else if (scared) speed = 1.5;
    else speed = 0.22;                                   // 평소엔 느릿느릿 꿈틀
    if (scared || now() < worm.dartUntil) {
      const away = Math.atan2(worm.z - near.z, worm.x - near.x);
      // 곧장 반대로만 가면 뻔하다. 조금씩 비틀며 달아난다.
      worm.dir += Math.atan2(Math.sin(away - worm.dir), Math.cos(away - worm.dir)) * Math.min(1, dt * 6);
      worm.dir += Math.sin(now() / 240) * dt * 1.6;
    } else if (now() > worm.turnAt) {
      worm.turnAt = now() + rand(900, 2200);
      worm.dir += rand(-1.2, 1.2);
    }
    const nx = worm.x + Math.cos(worm.dir) * speed * dt;
    const nz = worm.z + Math.sin(worm.dir) * speed * dt;
    const cx = clamp(nx, world.xMin + 1.2, world.xMax - 1.2);
    const cz = clampZ(nz);
    if (cx !== nx || cz !== nz) worm.dir += Math.PI * 0.6;    // 울타리에 닿으면 튕겨 돌아선다
    worm.x = cx; worm.z = cz;
  }
  function removeWorm() { if (!worm) return; world.scene.remove(worm.model.group); worm = null; for (const b of birds) { b.wormRun = 0; b.fleeing = false; if (b.anim === 'chase' || b.anim === 'beg') decide(b); } }
  function eatWorm(b) {
    removeWorm(); b.goal = 'treat'; setAnim(b, 'eat', 1.6); showIcon(b, '😋', 2000);
  }
  // 벌레를 부리로 찍는다 — 단번에 물리지 않는다.
  // 닿자마자 물면 '잡았다'는 느낌이 없다. 한두 번 놓쳐야 쫓는 맛이 난다.
  // 다만 놓치는 횟수는 벌레마다 두 번까지다(WORM_ESCAPE_MAX). 영영 못 잡으면 아이가 지친다.
  function stabWorm(b) {
    if (!worm || worm.carrier) return;
    faceDir(b, worm.x > b.x ? 1 : -1);
    const T = trait(b);
    // 큰 닭일수록, 대담할수록 한 번에 잘 문다. 병아리는 자주 놓친다.
    const skill = (b.d.stage === 'chick' ? 0.32 : b.d.stage === 'young' ? 0.5 : 0.66) * (0.8 + T.bold * 0.25);
    if (worm.escapes >= WORM_ESCAPE_MAX || Math.random() < skill) { grabWorm(b); return; }
    // 헛챘다 — 벌레가 쏙 빠져나간다
    worm.escapes += 1;
    worm.dartUntil = now() + rand(420, 800);
    worm.dir = Math.atan2(worm.z - b.z, worm.x - b.x) + rand(-0.6, 0.6);
    setAnim(b, 'peckat', rand(0.45, 0.8));
    b.d.boredom = clamp(b.d.boredom - 8, 0, 100);
    if (Math.random() < 0.5) showIcon(b, '💢', 900);
    later(b, 500, () => { if (b.anim === 'peckat' && worm && !worm.carrier) setAnim(b, 'chase', 30); });
  }
  // 물고 달아나기(worm running) — 실제 닭의 놀이 행동. 한 마리가 물고 뛰면 나머지가 전원 추격한다.
  function grabWorm(b) {
    if (!worm || worm.carrier) return;
    worm.carrier = b.d.id; worm.held = false;
    // 물고 달아나기는 '뺏길 상대'가 있을 때만 한다. 혼자면 그냥 자리에서 먹는다.
    const rivals = birds.filter((q) => q !== b && eligible(q));
    b.wormRun = rivals.length ? rand(3.5, 7.5) : 0;
    b.fleeing = rivals.length > 0;
    setAnim(b, 'chase', 30); showIcon(b, '🪱', 1800);
    b.d.boredom = clamp(b.d.boredom - 25, 0, 100);
    toast(rivals.length ? `🪱 ${b.d.name}(이)가 벌레를 물고 달아나요!` : `🪱 ${b.d.name}(이)가 벌레를 물었어요`, false, 3500);
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
    if (isHigh(mom)) leaveHigh(mom);
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
    for (const b of birds) { if (!eligible(b) || b === except) continue; if ((b.d.aff < 35 && Math.random() < 0.7) || (trait(b).stubborn >= 1.4 && Math.random() < 0.5)) { showIcon(b, '😒', 1500); continue; } if (isHigh(b)) leaveHigh(b); b.callTarget = { x: clamp(x + rand(-1.6, 1.6), world.xMin + XMARGIN, world.xMax - XMARGIN), z: clamp(z + rand(-0.8, 0.8), -1.6, 1.6) }; b.inCoop = false; setVisible(b, true); setAnim(b, 'chase', 30); n++; }
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
    b.fleeing = false; b.curious = false; b.dashing = false;
    // 품는 어미는 아무 데도 가지 않는다. 자세만 되돌리는 것으로는 부족했다 —
    // 닭장으로 들어가 버리면 그 순간 품기가 끝나 새끼가 파고들 틈이 없었다.
    if (b.hovering && !b.carrying && !b.d.hurt) { if (b.anim !== 'hover') setAnim(b, 'hover', rand(10, 18)); return; }
    if (b.tucked) { if (b.anim !== 'tuck') setAnim(b, 'tuck', rand(8, 16)); return; }
    const T = trait(b), d = b.d, M = moodOf(b);
    // 어느 통이든 모이가 남아 있는가 (통마다 따로 차므로 한쪽만 비어 있을 수 있다)
    const anyFeed = Math.max(propVisible('feeder') ? (state.feed ?? 0) : 0, propVisible('feeder2') ? (state.feed2 ?? 0) : 0);
    // 품는 암탉은 둥지에 머문다 (가끔 밥 먹으러)
    if (d.brooding && b.anim !== 'gofeed' && b.anim !== 'gowater') {
      if (Math.random() < 0.15 && d.hunger < 60 && anyFeed > 0) { const fd3 = feederFor(b); b.feederKey = fd3 ? fd3.key : null; const L3 = fd3 ? fd3.L : hm.feeder; goTo(b, L3.x + (hm.flip ? -1 : 1) * 1.3, 'gofeed', L3.z + rand(-0.4, 0.4)); return; }
      if (gapTo(b, hm.nest.x, hm.nest.z) > 0.2) { goTo(b, hm.nest.x, 'gonest', hm.nest.z); return; }
      setAnim(b, 'brood', rand(8, 20)); return;
    }
    const gp = (mouse.x >= 0 && now() - mouse.movedAt < 3000) ? world.screenToGround(mouse.x, mouse.y) : null;
    const cursorDist = gp ? gapTo(b, gp.x, gp.z) : 99;
    const mom = momOf(b), kids = kidsOf(b);
    const friends = birds.filter((o) => o !== b && eligible(o) && !o.inCoop && isYoungling(o) === isYoungling(b));
    const cands = [];
    const add = (name, score, run) => { if (score > 0) cands.push({ name, score, run }); };
    const feedOk = anyFeed >= RULE.feedPerMeal && now() - b.lastMeal > 60000, waterOk = state.water >= RULE.waterPerDrink && now() - b.lastDrink > 60000;
    // 생리 욕구
    add('eat', ((100 - d.hunger) / 100) ** 1.5 * 2.2 * T.appetite * (feedOk ? 1 : 0) * (d.stress > 60 ? 0.3 : 1), () => {
      const fd2 = feederFor(b);
      b.feederKey = fd2 ? fd2.key : null;                 // 어느 통에서 먹었는지 기억한다
      if (!fd2) { goTo(b, b.x, 'gofeed'); return; }
      goTo(b, fd2.L.x + (hm.flip ? -1 : 1) * rand(1.1, 1.6), 'gofeed', fd2.L.z + rand(-0.4, 0.4));
    });
    add('drink', ((100 - d.thirst) / 100) ** 1.5 * 2.2 * (waterOk ? 1 : 0), () => goTo(b, propVisible('waterer') ? hm.waterer.x + (hm.flip ? -1 : 1) * rand(1.1, 1.5) : b.x, 'gowater', propVisible('waterer') ? hm.waterer.z + rand(-0.4, 0.4) : undefined));
    // 어미가 품고 있으면 새끼는 혼자 자지 않는다 — 품에 들어가 잔다
    const momHover = d.stage === 'chick' && !b.tucked && (momOf(b) || {}).hovering;
    const sleepGate = !momHover && (M.sleepy > 0.6 || (d.stage === 'chick' && M.sleepy > 0.45));
    add('sleep', (sleepGate ? (M.sleepy ** 2) * 2.6 * (d.stage === 'chick' ? 1.8 : 1) * T.sleepy : 0) + (d.old && M.sleepy > 0.4 ? 0.3 : 0), () => {
      const ws = warmSpot();
      if (d.stage === 'chick' && ws) goTo(b, ws.x + rand(-0.9, 0.9), 'golamp-sleep', ws.z + rand(-0.6, 0.6));
      else if (!b.inCoop && propVisible('coop') && !isYoungling(b) && Math.random() < 0.6) goTo(b, hm.coop.x + (hm.flip ? -1 : 1) * 0.3, 'gocoop', hm.coop.z);
      else if (mom && Math.random() < 0.6) goTo(b, mom.x + rand(-1.2, 1.2), 'gomom-sleep', mom.z + rand(-0.8, 0.8));
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
        const gap = gap2(b, mom);
        add('follow', gap > 3.5 ? 2.2 * (d.stage === 'chick' ? 1.4 : 0.7) : 0.2, () => goTo(b, mom.x + (b.x < mom.x ? -1 : 1) * rand(0.8, 1.6), 'follow', mom.z + rand(-0.6, 0.6)));
      }
      add('social', (d.social / 100) * 1.4 * T.sociable * (friends.length || mom ? 1 : 0) * (isYoungling(b) && mom ? 1.5 : 1), () => {
        const target = mom && Math.random() < 0.7 ? mom : pick(friends);
        if (target) goTo(b, target.x + (b.x < target.x ? -1 : 1) * rand(1.2, 2), 'walk');
      });
      // 어미 돌봄
      if (kids.length) add('care', 0.9 * T.sociable * (kids.some((k) => !near(k, b, 3)) ? 1 : 0.5), () => { const k = pick(kids); b.careKid = k.d.id; goTo(b, k.x + (b.x < k.x ? -1 : 1) * 1.1, 'gokid'); });
      // 품기 — 알을 품던 그대로 갓 깬 병아리를 날개 밑에 품는다.
      // 추워하거나 졸린 새끼가 있으면 어미가 먼저 자리를 잡고 앉는다.
      const chicks = kids.filter((k) => k.d.stage === 'chick');
      const needWarm = chicks.filter((k) => (k.comfort && k.comfort.state === 'cold') || moodOf(k).sleepy > 0.5 || k.newborn);
      if (chicks.length && !b.hovering) {
        add('hover', (needWarm.length ? 2.6 : 0.5) * T.sociable, () => {
          const c0 = needWarm[0] || chicks[0];
          if (gap2(b, c0) > 2.2) goTo(b, c0.x + rand(-0.6, 0.6), 'gohover', clampZ(c0.z + rand(-0.4, 0.4)));
          else startHover(b);
        });
      }
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
    add('scratch', wx.outdoor * SCR[0] * (d.hurt ? 0.4 : 1) * T.appetite * (0.6 + d.energy / 200) * (d.stress > 60 ? 0.3 : 1), () => setAnim(b, 'scratch', rand(SCR[1], SCR[2])));
    // 모래 목욕 — 이틀에 한 번, 평균 27분(게임 12초). 전염된다.
    const dustGap = d.lastDust ? U.daysBetween(d.lastDust, today()) : 99;
    const dirty = Math.max(0, 70 - (d.clean ?? 85)) / 70;         // 더러울수록 하고 싶어진다
    add('dustbath', wx.dust * (dustGap >= 2 ? 1.2 : 0.05) * (1 + dirty * 2.2) * T.tidy * ({ chick: 0.45, young: 0.8, hen: 1.3, rooster: 1 }[d.stage] || 1) * (1 + (b.dustUrge || 0)) * (d.stress > 50 ? 0.2 : 1), () => {
      if (propVisible('dustpit') && gapTo(b, hm.dustpit.x, hm.dustpit.z) > 1.6) goTo(b, hm.dustpit.x + rand(-1.2, 1.2), 'godust', hm.dustpit.z + rand(-0.5, 0.5));
      else startDustBath(b);
    });
    // 햇볕 쬐기 — 끝나면 반드시 깃털 다듬기로 이어진다
    add('sunbathe', 0.35 * wx.dust * T.tidy * (M.valence > -0.2 ? 1 : 0.2), () => setAnim(b, 'sunbathe', rand(5, 9)));
    // 편안함 행동
    add('stretch', 0.22 * (d.energy / 100), () => setAnim(b, 'stretch', rand(1.4, 2.2)));
    add('shake', 0.3, () => setAnim(b, 'shake', 1.0));
    // 산책: 혼자 너무 멀어지면 무리 쪽으로 돌아간다 (닭은 몰려다닌다)
    const fc = flockCenter(b);
    const strayed = fc ? gap2(b, fc) : 0;
    add('walk', wx.outdoor * 0.9 * T.curiosity * (d.energy / 100), () => {
      b.walkZ = clampZ(b.z + rand(-1, 1) * rand(0.6, 3.5) * T.curiosity);
      let tx = b.x + rand(-1, 1) * rand(3, 10) * (d.old ? 0.6 : 1) * (T.curiosity > 1.4 ? 1.6 : 1);
      if (fc !== null) {
        const pull = clamp((strayed - 3) / 9, 0, 1) * T.sociable * 0.75;     // 멀수록 강하게 끌린다
        tx = tx * (1 - pull) + (fc.x + rand(-1.8, 1.8)) * pull;
      }
      goTo(b, tx, 'walk');
    });
    // 무리에서 멀어지면 불안해져서 돌아간다
    if (fc && strayed > 7) add('regroup', (strayed - 7) / 6 * 1.8 * T.sociable, () => { goTo(b, fc.x + rand(-1.5, 1.5), 'walk', fc.z + rand(-1.2, 1.2)); showIcon(b, '👀', 1400); });
    add('preen', 0.16 * T.tidy, () => setAnim(b, 'preen', rand(2.5, 4.5)));
    // 궂은 날엔 처마 밑으로 — 닭은 비를 맞으면 체온을 잃는다.
    // 이미 처마 밑이면 그 자리에 머문다(다시 부르지 않는다).
    if (wx.indoor > 0 && propVisible('coop')) {
      const ex = hm.coop.x + (hm.flip ? -1 : 1) * 1.5, ez = hm.coop.z + 1.1;
      const far = gapTo(b, ex, ez) > 2.4;
      add('shelter', wx.indoor * (far ? 2.6 : 0.9) * (d.stage === 'chick' ? 1.3 : 1),
        () => {
          if (far) goTo(b, ex + rand(-1.1, 1.1), 'gocoop', ez + rand(-0.5, 0.5));
          else if (d.stage === 'chick') setAnim(b, 'huddle', rand(4, 8));   // 뭉치기는 병아리 자세다
          else setAnim(b, 'preen', rand(3, 6));                             // 어른은 처마 밑에서 깃털을 다듬는다
        });
    }
    // "저게 뭐지?" — 멀리서 커서가 얼쩡거리면 겁내면서도 조금씩 다가가 목을 빼고 본다
    if (d.stage === 'chick' && warmSpot()) { const ws = warmSpot(); add('warm', (gapTo(b, ws.x, ws.z) > 1.6 ? 0.55 : 0.1) * (1 + M.sleepy), () => goTo(b, ws.x + rand(-0.9, 0.9), 'golamp', ws.z + rand(-0.6, 0.6))); }
    // 수탉: 지붕에 올라가 울기
    if (isAdult(b) && propVisible('coop') && !isHigh(b)) {
      // 수탉은 울려고, 암탉은 졸릴 때 높은 곳으로 (서열이 높을수록 자주)
      const wantRoof = d.stage === 'rooster' ? 0.22 * T.noisy * T.bold : 0.18 * (M.sleepy > 0.45 ? 1.8 : 0.4) * T.bold;
      add('roof', wantRoof * (1 + rank(b) * 0.15), () => goTo(b, hm.coop.x + roostSlot(b), 'goroof', hm.coop.z + 1.2));
    }
    if (b.onRoof) { add('crowroof', 0.6 * T.noisy, () => { setAnim(b, 'crow', 2.4); crowSound(); startleKids(b); }); add('roost', 0.5, () => setAnim(b, 'roost', rand(6, 14))); add('down', 0.35, () => leaveRoof(b)); }
    // 횟대 — 닭은 원래 나무 위에서 자는 새다. 졸릴수록 오르고 싶어 한다.
    // 병아리는 아직 못 오른다 (날갯죽지가 여물지 않았다).
    if (!b.onPerch && !b.onRoof && d.stage !== 'chick' && d.stage !== 'egg' && propVisible('perch') && !d.brooding) {
      const p = hm.perch;
      const near = gapTo(b, p.x, p.z) < 2.2;
      add('perch', (0.25 + M.sleepy * 1.9) * T.bold * (near ? 1.5 : 1),
        () => { if (near) jumpToPerch(b); else goTo(b, p.x + rand(-1, 1), 'goperch', p.z + rand(-0.4, 0.4)); });
    }
    if (b.onPerch) {
      add('roostperch', 0.9 + M.sleepy, () => setAnim(b, 'roost', rand(6, 16)));
      add('preenperch', 0.25 * T.tidy, () => setAnim(b, 'preen', rand(2.5, 4)));
      add('downperch', 0.3 * (1 - M.sleepy), () => leavePerch(b));
    }
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
    // 어미가 품고 있으면 파고든다. 추울수록·졸릴수록 더.
    if (d.stage === 'chick' && !b.tucked) {
      const mom2 = momOf(b);
      if (mom2 && mom2.hovering) {
        const cold2 = b.comfort && b.comfort.state === 'cold' ? 2.2 : 0;
        add('tuck', 2.0 + cold2 * 2.2 + M.sleepy * 4.0, () => {
          if (gap2(b, mom2) > 1.1) goTo(b, mom2.x + rand(-0.5, 0.5), 'gotuck', clampZ(mom2.z + rand(-0.3, 0.3)));
          else tuckUnder(b, mom2);
        });
      }
    }
    if (d.stage === 'chick' && b.comfort) {
      const ws = warmSpot();
      if (b.comfort.state === 'cold') {
        add('gowarm', 3.2, () => {
          if (ws && gapTo(b, ws.x, ws.z) > 1.0) goTo(b, ws.x + rand(-0.7, 0.7), 'gowarm', ws.z + rand(-0.6, 0.6));
          else {
            setAnim(b, 'huddle', rand(3, 6));
            // 판단이 3~6초마다 다시 돌아서, 그때마다 알리면 아이콘과 울음이 끝없이 도배된다.
            // 춥다는 건 한 번 알면 되는 것이지 계속 소리칠 일이 아니다.
            if (now() - (b.coldTold || 0) > 14000) {
              b.coldTold = now(); showIcon(b, '🥶', 2200); peepSound();
            }
          }
        });
      } else if (b.comfort.state === 'hot') {
        add('gocool', 3.0, () => {
          if (ws && gapTo(b, ws.x, ws.z) < 4.5) goTo(b, ws.x + (b.x < ws.x ? -1 : 1) * rand(4.5, 7), 'gocool');
          else { setAnim(b, 'pant', rand(3, 6)); showIcon(b, '🥵', 2200); }                  // 조용히 헐떡인다
        });
      }
    }
    if (d.stage === 'chick') {
      // 병아리: 서로 몸을 붙여 뭉친다. 춥거나 놀랐을 때 특히.
      const buddy = kidsNear.sort((x, y) => gap2(x, b) - gap2(y, b))[0];
      const wantHuddle = (d.stress / 60) + (M.sleepy * 0.6) + 0.35;
      if (buddy) add('huddle', wantHuddle * T.sociable * 1.3, () => {
        if (gap2(buddy, b) > 1.0) goTo(b, buddy.x + (b.x < buddy.x ? -0.7 : 0.7), 'gohuddle');
        else { setAnim(b, 'huddle', rand(4, 9)); b.d.stress = clamp(b.d.stress - 12, 0, 100); b.d.social = clamp(b.d.social - 25, 0, 100); }
      });
      else if (warmSpot()) add('huddle', wantHuddle * 0.8, () => goTo(b, warmSpot().x + rand(-0.6, 0.6), 'golamp'));
      add('peck', 0.9 * T.appetite, () => setAnim(b, 'peck', rand(1.5, 3)));      // 짧게 자주 쫀다
    }
    if (d.stage === 'young') {
      // 어린닭: 날개 연습을 아주 자주 한다. 또래끼리 가슴을 부딪치며 겨룬다.
      add('flap', 1.1 * T.playful * (d.energy / 100), () => { setAnim(b, 'flap', rand(1.8, 3.2)); if (Math.random() < 0.5) later(b, 800, () => { if (b.anim === 'flap') jump(b, 260); }); });
      const rival = kidsNear.filter((q) => q.d.stage === 'young' && gap2(q, b) < 6)[0];
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
      if (propVisible('nest')) add('checknest', 0.35 * (d.lastLaid === today() ? 0.1 : 1), () => goTo(b, hm.nest.x + rand(-0.8, 0.8), 'gonest', hm.nest.z + rand(-0.4, 0.4)));
    }
    if (d.stage === 'rooster') {
      // 수탉: 무리가 먹는 동안 자기는 먹지 않고 서서 경계한다
      const othersEating = birds.some((q) => q !== b && (q.anim === 'eat' || q.anim === 'gofeed'));
      add('guard', (othersEating ? 1.5 : 0.5) * T.bold, () => setAnim(b, 'guard', rand(4, 9)));
      // 먹이를 찾으면 자기가 먹지 않고 암탉을 부른다 (tidbitting)
      const hens = birds.filter((q) => q.d.stage === 'hen' && eligible(q));
      if (hens.length && state.feed >= RULE.feedPerMeal) add('tidbit', 0.8 * T.sociable, () => {
        setAnim(b, 'tidbit', rand(3, 5)); showIcon(b, '🌾', 2600); crowSound();
        for (const h of hens) if (gap2(h, b) < 12 && ACT.canInterrupt(h.anim, 'chase')) {
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
    goTo(b, b.x + dir * Math.max(0.6, Math.min(step, Math.abs(lure.x - b.x) - 0.8)), 'gopeek', lure.z);
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
  const perchY = () => window.TP_WORLD.PERCH_Y;
  // 그 닭에게 '바닥'이 어디인가. 지붕 위면 지붕, 횟대 위면 횟대.
  const floorY = (b) => (b.onRoof ? world3dRoof() : b.onPerch ? perchY() : 0);
  // 지붕이든 횟대든 '높은 데'에서 내려오게 한다. 부르는 쪽이 둘을 따로 챙기지 않게.
  const isHigh = (b) => !!(b.onRoof || b.onPerch);
  function leaveHigh(b) { if (b.onRoof) leaveRoof(b); else if (b.onPerch) leavePerch(b); }
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
  // 횟대 자리 — 서열이 높을수록 가운데. 지붕과 같은 규칙이다.
  function perchSlot(b) {
    const on = birds.filter((q) => q.onPerch || q.anim === 'goperch');
    const order = on.concat(on.includes(b) ? [] : [b]).sort((x, y) => rank(y) - rank(x));
    const i = Math.max(0, order.indexOf(b));
    const side = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2);
    return side * 1.0;
  }
  function jumpToPerch(b) {
    const p = home().perch, h = perchY(), vy = Math.sqrt(2 * GRAV * h) + 1.0;
    const dur = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * GRAV * h))) / GRAV;
    b.perchOffset = perchSlot(b);
    b.onPerch = true;
    leapTo(b, clamp(p.x + b.perchOffset, world.xMin + XMARGIN, world.xMax - XMARGIN), p.z, vy, dur);
    setAnim(b, 'jump', 1.8); showIcon(b, '⬆️', 800);
  }
  function leavePerch(b) {
    const p = home().perch, h = perchY(), vy = 1.6;
    const dur = (vy + Math.sqrt(vy * vy + 2 * GRAV * h)) / GRAV;
    b.onPerch = false; b.y = Math.max(b.y, h);
    const side = b.x > p.x ? 1 : -1;
    leapTo(b, clamp(p.x + side * rand(1.2, 1.9), world.xMin + XMARGIN, world.xMax - XMARGIN), clampZ(p.z + rand(1.4, 2.0)), vy, dur);
    setAnim(b, 'fall', 99); showIcon(b, '⬇️', 600);
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
  function soundAlarm(kind, srcX, srcZ, radius) {
    if (now() - lastAlarm < 9000) return 0;        // 자주 놀라면 피곤하다
    lastAlarm = now();
    let n = 0;
    for (const b of birds) {
      if (!eligible(b) || Math.hypot(b.x - srcX, b.z - (srcZ === undefined ? b.z : srcZ)) > (radius || 10)) continue;
      const T = trait(b);
      if (Math.random() > 0.85 - T.bold * 0.3) continue;          // 대담한 성격은 안 놀란다
      b.d.stress = clamp(b.d.stress + (kind === 'aerial' ? 34 : 22) * T.flee, 0, 100);
      b.inCoop = false; setVisible(b, true); b.targetX = null; b.dustPhase = 0;
      if (isHigh(b)) { leaveHigh(b); continue; }
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
  let lure = { x: 0, z: 0, active: 0, at: 0 };
  function trackLure(x, y, speed) {
    if (speed > 2200) { lure.active = Math.max(0, lure.active - 0.03); return; }   // 휙 지나가면 유인이 아니라 위협
    if (speed < 90 && cursorStill < 0.5) { lure.active = Math.max(0, lure.active - 0.012); return; }
    const gp = world.screenToGround(x, y); if (!gp) return;
    lure.x = gp.x; lure.z = gp.z; lure.at = now();
    lure.active = Math.min(1, lure.active + 0.06);
  }
  // 눈앞에 커서가 오면 쫀다. 닭은 눈에 띄는 건 일단 쪼아 본다.
  let peckScan = 0;
  // 커서를 '그 자리에서' 쪼게 하려면, 닭이 커서의 바닥 그림자에 서면 안 된다.
  // 그 자리에 서는 순간 커서는 정확히 닭의 발밑이 되어, 고개를 들 이유가 없어진다.
  // 카메라 쪽으로 조금 앞에 세워야 커서가 머리 높이로 올라온다.
  // (화면의 커서는 광선 하나다. 그 광선 위에서 높이가 머리만큼 되는 지점을 찾는다)
  // 커서를 '닭의 머리보다 조금 위'에 두어야 고개를 치켜든다.
  // 키의 0.6 배로 낮췄더니 머리보다 아래가 되어 오히려 내려다보며 땅을 쪼았다(부리 1.91).
  // 0.7~0.86 구간에서는 부리가 키의 79% 까지 올라가고 화면의 커서와도 20px 안에 든다.
  // 화면의 커서는 언제나 땅의 한 점을 가리킨다. 그러니 '커서를 쫀다'는 것은
  // 그 땅점을 쫀다는 뜻이다. 문제는 닭이 그 점 '위에' 올라서는 것이었다 —
  // 그러면 제 몸으로 자리를 가린 채 발밑을 내리찍게 된다.
  // 한 걸음 물러서서 앞으로 목을 뻗게 하면, 부리가 커서 쪽으로 나아가는 게 보인다.
  const PECK_BACK = 1.05;
  function cursorStand() {
    if (!cursorSpot || mouse.x < 0) return null;
    return { x: cursorSpot.x, z: clampZ(cursorSpot.z + PECK_BACK) };
  }

  const CURSOR_BORED = 9;      // 초. 이만큼 가만히 있으면 닭들이 흥미를 잃는다
  function tickCursorPeck(dt) {
    peckScan -= dt; if (peckScan > 0) return; peckScan = 0.4;
    if (!cursorSpot) return;
    // 커서가 멈춰 있어야 관심을 보인다. 다만 너무 오래 그대로면 질린다 —
    // 움직이지 않는 것에 닭이 계속 매달려 있으면 그것대로 이상하다.
    const still = cursorStill > 0.7 && cursorStill < CURSOR_BORED;

    for (const b of birds) {
      if (!eligible(b) || b.d.hurt) continue;
      if (b.hovering || b.tucked) continue;        // 품는 중에는 커서에 반응하지 않는다
      if (b.peckedFor === mouse.movedAt) continue; // 이 자리에서는 이미 쪼았다 — 커서가 움직여야 다시
      // 거리는 '커서를 쪼려면 서야 할 자리'를 기준으로 잰다 (바닥 그림자가 아니라)
      const stand0 = cursorStand() || cursorSpot;
      const dx = stand0.x - b.x, d2 = Math.abs(dx), dz = Math.abs(b.z - stand0.z);

      // 이미 쪼는 중 — 제자리에서 좌우로만 맞추고, 높으면 폴짝 뛰어 잡으려 한다
      if (b.anim === 'peckat') {
        if (!still || d2 > 2.8) { setAnim(b, 'idle', 0.6); continue; }
        if (b.peckedFor === mouse.movedAt && b.animT > 0.5) { setAnim(b, 'idle', rand(0.6, 1.2)); continue; }
        faceDir(b, dx > 0 ? 1 : -1);
        if (d2 > 0.5) b.x = clamp(b.x + Math.sign(dx) * spec(b).speed * 0.45 * dt, world.xMin + XMARGIN, world.xMax - XMARGIN);
        // 앞뒤도 슬금슬금 맞춘다 — 앞뒤가 어긋나면 커서가 옆으로 비껴 보인다
        if (Math.abs(b.z - stand0.z) > 0.4) b.z = clampZ(b.z + Math.sign(stand0.z - b.z) * spec(b).speed * 0.35 * dt);
        // 커서가 머리보다 한참 위면 뛰어서 닿으려 한다
        const head = world.project(b.x, height(b), b.z);
        const high = head && mouse.y < head.y - 26;
        if (high && b.y === 0 && b.vy === 0) {
          const Tp = trait(b);
          // 드센 수탉은 높이 있는 손에 날아오른다. 실제 수탉이 무리를 지키는 행동이다.
          // (이 놀이에서는 다치게 하지 않는다 — 소리치고 날아올라 부리로 툭 건드릴 뿐)
          const fierce = b.d.stage === 'rooster' && Tp.bold * Tp.stubborn >= 1.7 && b.d.aff < 75;
          if (fierce && Math.random() < 0.5) {
            b.vy = rand(7.0, 9.0);                      // 훌쩍 날아오른다
            b.flyStrike = now();
            showIcon(b, '💢', 1400);
            crowSound();
            if (Math.random() < 0.5) toast(`🐓 ${b.d.name}(이)가 날아올라요 — 무리를 지키는 거예요`, false, 4000);
          } else if (Math.random() < 0.55) {
            b.vy = rand(3.4, 5.2) * (mouse.y < head.y - 90 ? 1.25 : 1);
            if (Math.random() < 0.35) showIcon(b, '✨', 700);
          }
        }
        continue;
      }
      // 다가가는 중이면 그대로 둔다
      if (b.anim === 'gopeckat') { if (!still) { b.targetX = null; decide(b); } continue; }
      if (!still) continue;

      const T = trait(b);
      // ① 눈앞이면 바로 쫀다. 배고프면 쪼는 데서 그치지 않고 보챈다.
      const hungry0 = Math.max(0, (40 - b.d.hunger) / 40);
      if (d2 < 1.6 && dz < 3.6) {
        if (!ACT.canInterrupt(b.anim, 'peckat') || b.d.stress > 60) continue;
        if (Math.random() > (0.8 + hungry0 * 0.6) * T.curiosity) continue;
        b.targetX = null; b.inCoop = false; setVisible(b, true);
        faceDir(b, dx > 0 ? 1 : -1);
        // 배고프면 졸라댄다 — 폴짝 뛰고, 날개를 퍼덕이고, 참다 못해 발을 구른다.
        // 실제로 배고픈 닭은 사람 발치까지 와서 보챈다. 성질부리는 게 아니라 조르는 것이다.
        if (hungry0 > 0.35 && Math.random() < 0.5 + hungry0 * 0.4) {
          const how = Math.random();
          if (how < 0.45) { setAnim(b, 'beg', rand(0.8, 1.4)); if (b.y === 0) b.vy = 3.2 + hungry0 * 1.6; }
          else if (how < 0.75) setAnim(b, 'flap', rand(0.7, 1.1));
          else setAnim(b, 'stomp', rand(1.0, 1.8));                 // 참다 못해 발 구르기
          if (now() > b.iconUntil) showIcon(b, hungry0 > 0.7 ? '😤' : '🌾', 1500);
          b.d.boredom = clamp(b.d.boredom - 8, 0, 100);
          continue;
        }
        // 한 번만 쫀다. 커서가 다시 움직이기 전에는 또 쪼지 않는다.
        // (예전에는 2.5~5초 동안 계속 쪼아 대서, 가만히 둬도 끝없이 쪼았다)
        b.peckedFor = mouse.movedAt;
        setAnim(b, 'peckat', rand(0.7, 1.1));
        handPecked(b);
        b.d.boredom = clamp(b.d.boredom - 12, 0, 100);
        continue;
      }
      // ② 멀리 있어도, 커서가 오래 멈춰 있으면 궁금해서 보러 온다
      // 배고프면 훨씬 멀리서도 달려온다. 사람 손을 먹이 주는 손으로 알기 때문이다.
      const hungry = Math.max(0, (40 - b.d.hunger) / 40);          // 0~1
      const reach = (3.5 + cursorStill * 1.8) * (1 + hungry * 1.6);
      if (d2 < reach && d2 >= 1.6 && ACT.canInterrupt(b.anim, 'gopeckat') && b.d.stress < 55) {
        if (Math.random() > (0.45 + hungry * 0.5) * T.curiosity * T.approach) continue;
        b.curious = true;
        const stand = cursorStand() || cursorSpot;
        // 늘 같은 걸음으로 오면 심심하다. 성격과 그날 기분에 따라 두 가지로 온다.
        //  · 조심조심 — 조금 가다 멈춰 고개를 갸웃하고, 또 조금 (겁 많은 닭·낯선 사이)
        //  · 냅다 달려오기 — 한달음에 와서 쫀다 (대담한 닭·친한 사이·배고플 때)
        const boldNow = T.bold * (0.6 + b.d.aff / 130) * (1 + hungry * 1.4) / Math.max(0.5, T.flee);
        if (Math.random() < boldNow * 0.45) {
          b.dashTo = { x: stand.x - Math.sign(dx) * 0.7, z: stand.z };
          goTo(b, b.dashTo.x, 'gopeckat', b.dashTo.z);
          b.dashing = true;                                   // 달리는 걸음 (draw 에서 속도를 올린다)
          if (Math.random() < 0.4) showIcon(b, '❗', 1200);
        } else {
          b.dashing = false;
          lure.x = stand.x; lure.z = stand.z; lure.at = now();
          b.peekLeft = Math.round(rand(2, 4));
          peek(b);                                            // 조심스러운 접근 (멈췄다 보고 또 간다)
          if (Math.random() < 0.35) showIcon(b, '👀', 1600);
        }
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
    if (!birds.some((b) => eligible(b) && Math.hypot(b.x - gp.x, b.z - gp.z) < 5)) return;
    soundAlarm(vy > Math.abs(vx) * 0.6 ? 'aerial' : 'ground', gp.x, gp.z, 6);
  }

  // 수탉 울음 → 근처 새끼들이 놀란다
  function startleKids(r) {
    for (const k of birds) {
      if (!isYoungling(k) || !eligible(k) || gap2(k, r) > 8) continue;
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
      b.d.thirst = clamp(b.d.thirst - dt * wx.thirst * (100 / (6 * 3600)), 0, 100);   // 무더위엔 물이 빨리 준다
      b.d.happy = clamp(b.d.happy - dt * (100 / (12 * 3600)), 10, 100);
      if (b.d.hunger < 30 || b.d.thirst < 30) b.d.aff = clamp(b.d.aff - dt * (3 / 3600), 0, 100);
      const T = trait(b), sleeping = b.anim === 'sleep';
      b.d.energy = clamp(b.d.energy + (sleeping ? dt * 0.12 : -dt * (100 / (14 * 3600)) * T.energy * (b.anim === 'chase' || b.fleeing || b.anim === 'ecstatic' ? 2.5 : 1)), 0, 100);
      const playing = ACT.isPlaying(b.anim);
      b.d.boredom = clamp(b.d.boredom + (playing ? -dt * 4 : sleeping ? 0 : dt * (100 / (3 * 3600)) * T.playful), 0, 100);
      const friendNear = birds.some((o) => o !== b && o.d.stage !== 'egg' && !o.inCoop && near(o, b, 2.2));
      const fcx = flockCenter(b);
      const alone = fcx && gap2(b, fcx) > 7;
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
      for (const o of chasers) { const d2 = gap2(o, b); if (d2 < nd) { nd = d2; near0 = o; } }
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
    // 중력 (지붕이나 횟대 위면 그것이 바닥)
    const gY = floorY(b);
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
          // 어른 닭은 날개가 있다. 높은 데서 떨어져도 퍼덕여 내려앉지 다치지 않는다.
          // (병아리·어린닭은 날갯죽지가 여물지 않아 다친다 — 그게 이 놀이에서 조심해야 할 이유다)
          const hurtLine = isYoungling(b) ? 6.5 : 8.5;
          if (hard > hurtLine && !isHigh(b) && !isAdult(b)) {
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
            // 어른이 높은 데서 내려오면 날개를 크게 퍼덕여 받는다
            else if (hard > 6.5) { setAnim(b, 'flap', rand(0.9, 1.4)); world.puff(b.x, b.z, 9, 0.5); }
            if (b.anim !== 'flap') setAnim(b, isHigh(b) ? 'roost' : 'idle', rand(0.8, 1.6));
          }
        } else if (b.anim === 'jump') setAnim(b, isHigh(b) ? 'roost' : 'idle', rand(0.6, 1.5));
      }
    }
    if (b.anim === 'fall') return;
    // 겹침 방지: 가까운 닭끼리 서로 살짝 밀어낸다 (알·품는 닭 제외)
    // 겹침: 느긋하게 있을 때만 서로 밀어낸다. 달리거나 도망칠 때는 그냥 스쳐 지나간다.
    const FAST = b.anim === 'chase' || b.frolicking || b.fleeing || b.anim === 'panic' || b.anim === 'spar';
    if (b.d.stage !== 'egg' && !b.d.brooding && !b.inCoop && !isHigh(b) && !b.leap && !FAST && !b.tucked && !b.hovering) {
      for (const o of birds) {
        if (o === b || o.d.stage === 'egg' || o.inCoop || o.carrying || isHigh(o) || o.tucked || o.hovering) continue;
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
    // 소품을 뚫고 지나가지 않게 한다.
    // 다만 모이통·물통은 붙어서 먹어야 하므로, '쓰는 자리'보다 작은 속만 막는다.
    // 둥지·모래밭·횟대는 닭이 올라타거나 들어가는 물건이라 아예 막지 않는다.
    if (b.d.stage !== 'egg' && !b.d.brooding && !b.inCoop && !isHigh(b) && !b.leap && !b.carrying) {
      const hm2 = home();
      for (const k of PROP_NAMES) {
        const r = PROP_SOLID[k];
        if (!r || !propVisible(k)) continue;
        if (k === 'coop' && (b.anim === 'gocoop' || b.anim === 'goroof')) continue;   // 들어가는 중이면 통과
        const L = hm2[k]; if (!L) continue;
        const dx = b.x - L.x, dz = (b.z - L.z) * 1.35;          // 앞뒤는 납작하게 본다 (내려다보는 화면)
        const dist = Math.hypot(dx, dz);
        const rr = r + height(b) * 0.16;                         // 큰 닭일수록 조금 더 비켜선다
        if (dist < rr && dist > 0.001) {
          const push = (rr - dist) * Math.min(1, dt * 7);
          b.x = clamp(b.x + (dx / dist) * push, world.xMin + XMARGIN, world.xMax - XMARGIN);
          b.z = clampZ(b.z + (dz / dist) * push * 0.7);
        }
      }
    }
    // 벌레가 나타나면 하던 일을 멈추고 달려간다
    const tgt = chaseTarget(b);
    if (tgt && eligible(b) && ACT.canInterrupt(b.anim, 'chase') && !(tgt.kind === 'call' && (b.anim === 'sleep' || b.inCoop) && b.d.aff < 60)) {
      b.inCoop = false; setVisible(b, true); b.targetX = null;
      if (isHigh(b)) { leaveHigh(b); return; }
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
          // 바닥의 벌레도 여럿이면 빙 둘러선다. 한 점에 겹쳐 서면 서로 밀기만 한다.
          const crowd = birds.filter((q) => q.anim === 'chase' || q.anim === 'beg');
          const i = Math.max(0, crowd.indexOf(b)), n = Math.max(1, crowd.length);
          if (n > 1) {
            const ang = (i / n) * Math.PI * 2;
            tgt.x = worm.x + Math.cos(ang) * 0.6;
            tgt.z = worm.z + Math.sin(ang) * 0.4;
          } else { tgt.x = worm.x; tgt.z = worm.z; }
          reach = 0.22 + 0.06 * height(b);
        }
      }
      // 거리는 앞뒤까지 함께 본다. 좌우로만 재면 벌레가 바로 앞이나 뒤에 있을 때
      // 이미 도착한 줄 알고 그 자리에 서 버린다.
      const dx = tgt.x - b.x, dz = (tgt.z === undefined ? b.z : tgt.z) - b.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach) {
        if (Math.abs(dx) > 0.12) faceDir(b, dx > 0 ? 1 : -1);
        const step = s.speed * 2.4 * (b.d.old ? 0.7 : 1) * dt;
        const k = Math.min(1, step / Math.max(0.0001, dist));
        b.x += dx * k;
        b.z = clampZ(b.z + dz * k);
      } else if (tgt.kind === 'worm') {
        const car = wormCarrier();
        if (car && car !== b) { if (Math.random() < 0.45) stealWorm(car, b); else { setAnim(b, 'beg', rand(0.4, 0.8)); if (b.y === 0) b.vy = 3.2; } return; }
        if (!worm.held && worm.y <= 0.35 && !worm.carrier) { stabWorm(b); return; }
        setAnim(b, 'beg', rand(0.6, 1.2)); if (Math.random() < 0.35) { b.vy = 3.5; }
      } else { const wasPlay = !!b.callTarget.follow; b.callTarget = null; jump(b, 240); if (wasPlay) { b.d.boredom = clamp(b.d.boredom - 40, 0, 100); const o = birds.find((q) => q.playFlee === b.d.id); if (o) { o.playFlee = null; o.d.boredom = clamp(o.d.boredom - 40, 0, 100); showIcon(o, '😆', 1200); } showIcon(b, '😆', 1200); } else showIcon(b, '❤️', 1500); return; }
      b.animT += dt; if (b.animT > b.animDur) { b.callTarget = null; decide(b); }
      return;
    }
    if (b.anim === 'beg') {
      b.animT += dt;
      if (!worm) { decide(b); return; }
      if (Math.hypot(worm.x - b.x, worm.z - b.z) > 2.4) { setAnim(b, 'chase', 30); return; }
      if (!worm.held && worm.y <= 0.05) { eatWorm(b); return; }
      if (b.animT > b.animDur) { setAnim(b, 'beg', rand(0.6, 1.2)); if (Math.random() < 0.4 && b.y === 0) b.vy = 3.2; }
      return;
    }
    if (ACT.isGoal(b.anim) && b.targetX !== null) {
      const speed = s.speed * (b.d.old ? 0.6 : 1) * (b.fleeing ? 2 : 1) * (b.dashing ? 2.1 : 1) * (b.d.hurt ? 0.45 : 1) * (b.d.sick ? 0.55 : 1);
      const tz = (b.targetZ !== null && b.targetZ !== undefined) ? b.targetZ
        : (b.walkZ !== undefined ? b.walkZ : b.z);
      const gx = b.targetX - b.x, gz = tz - b.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 0.08) {
        const k = Math.min(1, speed * dt / gd);
        b.x += gx * k; b.z = clampZ(b.z + gz * k);
        if (Math.abs(gx) > 0.05) faceDir(b, gx > 0 ? 1 : -1);
      }
      if (gd <= 0.08) {
        b.dashing = false;
        b.x = b.targetX; if (b.targetZ !== null && b.targetZ !== undefined) b.z = b.targetZ;
        b.targetX = null; b.targetZ = null; b.walkZ = undefined;
        if (b.anim === 'gofeed') { b.goal = 'eat'; setAnim(b, 'eat', 3); }
        else if (b.anim === 'gowater') { b.goal = 'drink'; setAnim(b, 'drink', 2.5); }
        else if (b.anim === 'gocoop') { b.inCoop = true; setVisible(b, false); setAnim(b, 'sleep', rand(15, 30)); showIcon(b, '💤', 3000); }
        else if (b.anim === 'gonest') setAnim(b, 'brood', rand(8, 20));
        else if (b.anim === 'gohover') startHover(b);
        else if (b.anim === 'gotuck') { const m2 = momOf(b); if (m2 && m2.hovering) tuckUnder(b, m2); else decide(b); }
        else if (b.anim === 'gopeek') {
          setAnim(b, 'cock', rand(0.7, 1.3));                  // 멈춰 서서 고개를 갸웃한다
          later(b, 1000, () => {
            if (b.anim !== 'cock') return;
            const gap = gapTo(b, lure.x, lure.z);
            // 충분히 가까워졌으면 이제 부리로 쪼아 본다
            if (gap < 2.0) { faceDir(b, lure.x > b.x ? 1 : -1); setAnim(b, 'peckat', rand(2.5, 5)); handPecked(b); b.d.boredom = clamp(b.d.boredom - 12, 0, 100); return; }
            if ((b.peekLeft || 0) > 0 && lure.active > 0.3 && now() - lure.at < 4000) peek(b);
            else { b.peekLeft = 0; decide(b); }
          });
        }
        else if (b.anim === 'gowarm') {
          setAnim(b, 'huddle', rand(4, 8));
          if (now() - (b.coldTold || 0) > 14000) { b.coldTold = now(); showIcon(b, '🥶', 2000); }
        }
        else if (b.anim === 'gocool') { setAnim(b, 'pant', rand(3, 6)); showIcon(b, '🥵', 2000); }
        else if (b.anim === 'gopeckat') setAnim(b, 'peckat', rand(2.5, 5));
        else if (b.anim === 'gohuddle') { setAnim(b, 'huddle', rand(4, 9)); b.d.stress = clamp(b.d.stress - 12, 0, 100); b.d.social = clamp(b.d.social - 25, 0, 100); }
        else if (b.anim === 'godust') { startDustBath(b); }
        else if (b.anim === 'panic') { setAnim(b, 'flap', 1.2); }
        else if (b.anim === 'follow') { setAnim(b, 'scratch', rand(3, 6)); b.d.social = clamp(b.d.social - 35, 0, 100); }
        else if (b.anim === 'gokid') { const k = birds.find((q) => q.d.id === b.careKid); setAnim(b, 'nuzzle', 2.2); if (k) { showIcon(k, '❤️', 1500); k.d.stress = clamp(k.d.stress - 30, 0, 100); k.d.social = clamp(k.d.social - 30, 0, 100); if (k.anim === 'idle' || k.anim === 'walk') setAnim(k, 'pet', 2); } b.d.social = clamp(b.d.social - 20, 0, 100); }
        else if (b.anim === 'golamp') { setAnim(b, Math.random() < 0.5 ? 'idle' : 'preen', rand(4, 9)); showIcon(b, '🔥', 1200); b.d.stress = clamp(b.d.stress - 10, 0, 100); }
        else if (b.anim === 'golamp-sleep') { setAnim(b, 'sleep', rand(20, 40)); showIcon(b, '💤', 2000); }
        else if (b.anim === 'goroof') jumpToRoof(b);
        else if (b.anim === 'goperch') jumpToPerch(b);
        else if (b.anim === 'gomom-sleep') { setAnim(b, 'sleep', rand(15, 35)); const m = momOf(b); if (m && eligible(m) && (m.anim === 'idle' || m.anim === 'walk' || m.anim === 'preen')) { m.targetX = null; setAnim(m, 'brood', rand(15, 35)); } }
        else setAnim(b, 'idle', rand(1, 3));
        b.fleeing = false;
      }
      if (b.x < world.xMin + XMARGIN || b.x > world.xMax - XMARGIN) { b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN); b.dir = -b.dir; b.dirAt = now(); b.targetX = null; setAnim(b, 'idle', 1); }
    }
    b.animT += dt;
    if (b.animT >= b.animDur) {
      if (b.anim === 'eat' && b.goal === 'eat' && trait(b).stubborn < 1.4) {
        const boss = birds.find((o) => o !== b && rank(o) > rank(b) && (o.anim === 'gofeed' || o.anim === 'eat') && gap2(o, b) < 1.6);
        if (boss) { b.goal = null; showIcon(b, '😣', 1200); goTo(b, b.x + (Math.sign(b.x - boss.x) || 1) * rand(2, 3.5), 'walk'); b.d.stress = clamp(b.d.stress + 8, 0, 100); return; }
      }
      if (b.anim === 'eat' && b.goal === 'treat') {
        b.d.happy = clamp(b.d.happy + 15, 0, 100); b.d.hunger = clamp(b.d.hunger + 8, 0, 100); b.goal = null; affect(b, 6 * trait(b).affGain); careTick(b, 'ate'); markDirty(); renderCoop(); if (moodOf(b).valence > 0.55) burst(b, 'ecstatic'); else jump(b, 260); showIcon(b, '❤️', 1500);
      } else if (b.anim === 'eat' && b.goal === 'eat') {
        eatTick(b);
      } else if (b.anim === 'drink' && b.goal === 'drink') {
        if (state.water >= RULE.waterPerDrink) { state.water -= RULE.waterPerDrink; syncSupplies(); b.d.thirst = clamp(b.d.thirst + 40, 0, 100); b.lastDrink = now(); careTick(b, 'drank'); later(b, 200, () => { if (b.anim === 'drink' || b.anim === 'idle') setAnim(b, 'shake', 1.0); });
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
      if (payAllowanceRef) payAllowanceRef();     // 마지막 한 마리를 챙긴 순간 바로 준다

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
  function advance(b, stage) { b.d.stage = stage; b.d.stageSince = today(); forgetCare(b); world.setStage(b.b3, stage); applyHat(b); b.anim = 'idle'; }
  function growCheck(b) {
    if (HYG.level(state.ammonia) === 'bad') { showIcon(b, '🤢', 2000); return; }   // 암모니아가 심하면 자라지 못한다
    if (b.d.sick) { showIcon(b, HLT.info(b.d.sick.type).icon, 2000); return; }      // 아픈 동안은 자라지 않는다
    const n = daysCared(b);
    if (b.d.stage === 'egg' && n >= RULE.daysEgg) {
      if (b.hatching === undefined || b.hatching === null) startHatching(b);
    } else if (b.d.stage === 'chick' && n >= RULE.daysChick) {
      advance(b, 'young'); jump(b, 280); chime(); later0(() => note('young', b), 700);
      toast(`${b.d.name}(이)가 어린닭이 됐어요. 볏이 자라서 ${b.d.sex === 'f' ? '암컷' : '수컷'}인 걸 알 수 있어요`, true, 8000);
      if ((state.settings.propHidden || {}).perch) {
        // 닭은 높은 데서 잔다. 어린닭이 되면 그 습성이 나오므로 그때 횟대를 준다.
        state.settings.propHidden = Object.assign({}, state.settings.propHidden, { perch: false });
        layoutHome(); markDirty();
        later0(() => scene(['이제 높은 데서 자고 싶을 게다. 닭은 원래 나무 위에서 자는 새란다.',
          '횟대를 놓아 주었으니, 졸리면 올라가 잘 게다.'], grannyHide, 'proud'), 2600);
      }
      // 단계가 섞이면 먹는 것이 달라진다. 통이 하나면 한쪽은 반드시 틀린 사료를 먹게 된다.
      if ((state.settings.propHidden || {}).feeder2 && birds.some((q) => q !== b && q.d.stage === 'chick')) {
        state.settings.propHidden = Object.assign({}, state.settings.propHidden, { feeder2: false });
        state.feedType2 = 'grower';
        layoutHome(); markDirty(); renderCoop();
        later0(() => scene([
          '이젠 먹는 것이 달라진단다. 병아리와 어린닭은 필요한 것이 다르거든.',
          '통을 하나 더 놓아 주었으니, 파란 통에는 어린닭 사료를 담으렴.',
        ], grannyHide, 'proud'), 5200);
      }
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
  // ── 품기 ──
  // 실제 암탉은 알을 품던 그대로 갓 깬 병아리를 날개 밑에 품는다.
  // 보온등은 원래 이것을 대신하는 물건이다 — 그래서 품은 병아리는 등이 없어도 따뜻하다.
  function startHover(mom) {
    mom.hovering = now();
    mom.targetX = null; mom.targetZ = null;
    setAnim(mom, 'hover', rand(14, 26));
    showIcon(mom, '🪶', 2200);
  }
  function stopHover(mom) {
    if (!mom.hovering) return;
    mom.hovering = 0;
    for (const k of birds) if (k.tuckedTo === mom.d.id) untuck(k);
    decide(mom);
  }
  function tuckUnder(k, mom) {
    k.tucked = now(); k.tuckedTo = mom.d.id;
    k.targetX = null; k.targetZ = null; k.callTarget = null;
    // 어미 품 안쪽에 자리를 잡는다 (앞뒤로 살짝 흩어져 앉는다)
    k.x = clamp(mom.x + rand(-0.45, 0.45), world.xMin + XMARGIN, world.xMax - XMARGIN);
    k.z = clampZ(mom.z + rand(0.1, 0.5));
    setAnim(k, 'tuck', rand(10, 20));
    if (Math.random() < 0.5) showIcon(k, '💛', 1800);
    k.d.stress = clamp(k.d.stress - 25, 0, 100);
    affect(k, 2);
  }
  function untuck(k) {
    if (!k.tucked) return;
    k.tucked = 0; k.tuckedTo = null;
    setAnim(k, 'idle', rand(0.6, 1.2));
  }
  // 품기는 오래 가지 않는다. 어미가 일어나면 새끼들도 나온다.
  function tickHover(dt) {
    for (const b of birds) {
      if (b.hovering) {
        // 들어 올리거나 다치면 품기를 그만둔다
        if (b.carrying || b.d.hurt || b.inCoop || isHigh(b)) { stopHover(b); continue; }
        if (now() - b.hovering > 40000) { stopHover(b); continue; }
        // 품는 동안에는 자리를 지킨다. 다른 판단이 끼어들어 일어서면 새끼가 파고들 틈이 없다.
        if (b.anim !== 'hover' && b.anim !== 'gohover' && b.anim !== 'nuzzle') {
          b.targetX = null; b.targetZ = null;
          setAnim(b, 'hover', rand(10, 18));
        }
      }
      if (b.tucked) {
        const mom = birds.find((q) => q.d.id === b.tuckedTo);
        if (!mom || !mom.hovering || b.carrying) { untuck(b); continue; }
        // 어미 곁에 붙어 있게 (어미가 조금 움직여도 따라간다)
        if (gap2(b, mom) > 1.2) { b.x = mom.x + rand(-0.4, 0.4); b.z = clampZ(mom.z + rand(0.1, 0.45)); }
        if (now() - b.tucked > 22000) untuck(b);
      }
    }
  }
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
      // 갓 깬 병아리는 곧바로 어미 날개 밑으로 든다 — 실제로 그렇게 몸을 말린다
      later(mom, 3200, () => { if (!mom.d.hurt && !mom.carrying) startHover(mom); });
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
      hen.d.brooding = egg.id; syncSupplies();
      toast(`🥚 ${hen.d.name}(이)가 둥지에 알을 낳았어요. 품기 시작!`, true, 8000);
    } else {
      state.basket += 1; syncSupplies();
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
      lure.x = cursorSpot.x; lure.z = cursorSpot.z; lure.at = now();
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
        // 커서가 가리키는 땅점을 본다. 닭은 그보다 한 걸음 뒤에 서 있으므로
        // 앞으로·아래로 목을 뻗는 자세가 된다 (제자리에서 발밑을 찍는 게 아니라).
        const pt = cursorSpot || world.screenToPlaneZ(mouse.x, mouse.y, b.z);
        if (pt) { b.look.set(pt.x, 0.12, pt.z === undefined ? b.z : pt.z); b.aimed = true; }
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
      const mdx = b.x - (b.lastX === undefined ? b.x : b.lastX);
      const mdz = b.z - (b.lastZ === undefined ? b.z : b.lastZ);
      if (Math.hypot(mdx, mdz) > 0.004) { b.heading = Math.atan2(mdx, mdz); b.headAt = now(); }
      else if (now() - (b.headAt || 0) > 350) b.heading = undefined;   // 멈추면 원래 자세로
      b.lastX = b.x; b.lastZ = b.z;
      m.model.update(dt, { anim, moving, dir: b.dir, heading: b.heading, jumpY: b.y, lookTarget: b.look, curious: true, wobble: b.f === 1, hatch: b.hatching || 0, phase: b.dustPhase || 0, holdWorm: !!(worm && worm.carrier === b.d.id), sick: !!b.d.sick, hurt: !!b.d.hurt, dull: Math.max(0, (C.CLEAN.dullBelow - (b.d.clean ?? 85)) / C.CLEAN.dullBelow), speed: (b.anim === 'chase' || b.fleeing) ? 2.2 : b.dashing ? 2.0 : 1, mood: b.d.stage === 'egg' ? null : moodOf(b) });
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
    tickDig();
    if (worm) {
      if (!worm.held && !worm.carrier) {
        if (worm.y > 0 || worm.vy > 0) { worm.vy -= GRAV * dt; worm.y += worm.vy * dt; if (worm.y <= 0) { worm.y = 0; worm.vy = 0; } }
        if (worm.y <= 0.02) tickWormCrawl(dt);
        if (now() - worm.bornAt > 90000) removeWorm();
      }
      if (worm) {
        worm.model.group.visible = !worm.carrier;
        worm.model.group.position.set(worm.x, worm.y + 0.12, worm.z);
        if (!worm.held && !worm.carrier) worm.model.group.rotation.y = -worm.dir + Math.PI / 2;   // 가는 쪽으로 몸을 튼다
        worm.model.update(dt);
      }
    }
    tickHygiene(dt);
    tickHover(dt);
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
    if (acc >= 1 / 32) { for (const b of birds) update(b, acc); tickFollow(); draw(acc); acc = 0; }
   requestAnimationFrame(loop);
  }

  // ---- 마우스 ----
  function birdAt(x, y) { const h = world.pick(x, y); return h && h.type === 'bird' ? birds.find((b) => b.d.id === h.id) || null : null; }
  function propAt(x, y) { const h = world.pick(x, y); return h && h.type === 'prop' ? h.name : null; }
  const propPartAt = (x, y) => { const h = world.pick(x, y); return h && h.type === 'prop' ? h.part : null; };
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
    if (name === 'feeder' || name === 'feeder2') return `🌾 ${name === 'feeder2' ? '파란' : '빨간'} 통 · ${C.FEED[feedKind(name)].name} ${Math.round(feedAmt(name))}% — 클릭 채우기 · 오른쪽 클릭 사료 바꾸기`;
    if (name === 'waterer') return `💧 물통 ${Math.round(state.water)}% — 클릭하면 채우기`;
    if (name === 'basket') return state.basket ? `🧺 달걀 ${state.basket}개 — 클릭하면 팔아요 (🪙 ${state.basket * EGG_PRICE})` : '🧺 달걀 바구니 — 아직 비었어요';
    if (name === 'wormbucket') return `🪱 벌레 ${state.worms}마리 — 잡아서 끌어다 놓기`;
    return PROP_KO[name] || name;
  }
  function propClick(name) {
    const hm = home();
    if (name === 'feeder' || name === 'feeder2') { fillFeeder(name); }
    else if (name === 'waterer') { if (now() - state.lastWaterRefill < RULE.refillCooldownMin * 60000) { toast(`물은 ${Math.ceil((RULE.refillCooldownMin * 60000 - (now() - state.lastWaterRefill)) / 60000)}분 후에 다시 채울 수 있어요`); return; } $('#btnWater').click(); }
    else if (name === 'nest') {
      const eggs = birds.filter((b) => b.d.stage === 'egg' && !ST.caredToday(b.d));
      if (!eggs.length) { toast(birds.some((b) => b.d.stage === 'egg') ? '오늘은 이미 품어줬어요. 내일 또 만나요' : '둥지에 알이 없어요'); return; }
      for (const e of eggs) { broodTick(e); e.f = 1; e.wobbleUntil = performance.now() / 1000 + 1; showIcon(e, '✨'); }
      toast(`🤲 알 ${eggs.length}개를 따뜻하게 품어줬어요`); renderCoop();
    }
    else if (name === 'basket') sellEggs();
    else if (name === 'coop') togglePanel();
    else if (name === 'lamp') {
      // 껐다 켰다만 되면 '온도를 맞춘다'는 이 놀이의 핵심이 메뉴 속에 숨는다.
      // 누를 때마다 한 칸씩 돌아가게 해서, 온도 조절을 손끝에서 하게 한다.
      const STEPS = [0, 0.35, 0.65, 1];
      const cur = state.lampPower ?? 0;
      let i = 0;
      for (let k = 0; k < STEPS.length; k++) if (Math.abs(STEPS[k] - cur) < 0.06) i = k;
      const next = STEPS[(i + 1) % STEPS.length];
      state.lampPower = next;
      if (next > 0) state.lampLast = next;
      markDirty(); renderCoop(); lampEffect(next); setTimeout(checkStep, 60);
      const NAME = { 0.35: '약', 0.65: '중', 1: '강' };
      toast(next === 0 ? '🌙 보온등을 껐어요' : `🔥 보온등 ${NAME[next]} (${tempLine()})`, false, 4000);
    }
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
      if (drag.pan) {
        // 누른 자리의 땅이 손끝에 붙어 따라오게 한다 (휠 확대가 쓰는 방법과 같다).
        // 카메라가 움직인 뒤 다시 재므로, 몇 프레임이면 정확히 맞춰진다.
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) {
          drag.moved = true; follow = null;
          const cur = world.screenToGround(e.clientX, e.clientY);
          if (cur && drag.gx !== undefined) {
            world.view.tx += drag.gx - cur.x; world.view.tz += drag.gz - cur.z;
            panClamp(); world.fit(W, H);
          } else if (cur) { drag.gx = cur.x; drag.gz = cur.z; }
        }
        return;
      }
      if (drag.worm) { if (worm) { const sp = wormSpot(e.clientX, e.clientY); if (sp) { worm.x = sp.x; worm.z = sp.z; worm.y = HOLD_Y; } } return; }
      if (drag.deco) {  // 장식물 옮기기
        const gp = world.screenToGround(e.clientX, e.clientY);
        if (gp && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) {
          drag.moved = true;
          drag.deco.x = clamp(gp.x - drag.offX, world.xMin + 1, world.xMax - 1);
          drag.deco.z = clampZ(gp.z - drag.offZ);
          world.setDecos(state.farm.decos); markDirty();
        }
        return;
      }
      if (drag.prop) { // 소품 옮기기
        const gp = world.screenToGround(e.clientX, e.clientY);
        if (gp && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) {
          drag.moved = true; state.farm.placements = state.farm.placements || {};
          state.farm.placements[drag.prop] = { x: clamp(gp.x - drag.offX, world.xMin + 1, world.xMax - 1), z: clampZ(gp.z - drag.offZ) };   // 마당 전체가 범위다
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
        // 위로 크게 들어 올리면 공중으로, 아니면 바닥을 따라 앞뒤·좌우로 옮긴다.
        // (예전에는 언제나 들어 올리기여서 앞뒤로 옮길 수가 없었다)
        const lifted = (drag.sy - e.clientY) > 55;
        if (lifted) {
          const p = world.screenToPlaneZ(e.clientX, e.clientY, drag.b.z);
          if (p) { drag.b.x = clamp(p.x - drag.offX, world.xMin + XMARGIN, world.xMax - XMARGIN); drag.b.y = Math.max(0, p.y - height(drag.b) * 0.5); }
        } else {
          const g = world.screenToGround(e.clientX, e.clientY);
          if (g) { drag.b.x = clamp(g.x - drag.offX, world.xMin + XMARGIN, world.xMax - XMARGIN); drag.b.z = clampZ(g.z - (drag.offZ || 0)); drag.b.y = 0; }
        }
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
    setCur(b ? 'pet' : (hoverProp || hoverPoop) ? 'point' : 'open');
  });
  setInterval(() => { if (rub.id && now() - rub.lastT > 700) rubEnd(); }, 300);
  setInterval(() => { if (birds.length && state.onboarded) nudge(); }, 20000);
  setInterval(() => tellOnce(), 15000);
  canvas.addEventListener('mousemove', (e) => { if (digging && Math.hypot(e.clientX - digging.px, e.clientY - digging.py) > 8) cancelDig(); });
  addEventListener('mouseup', () => cancelDig());
  addEventListener('blur', () => cancelDig());
  setInterval(refreshTemp, 1000);          // 병아리가 움직이면 온도도 바뀐다
  canvas.addEventListener('mousedown', (e) => {
    const b = birdAt(e.clientX, e.clientY);
    if (e.button === 2) return;
    if (!b) {
      const pp = poopAt(e.clientX, e.clientY);
      if (pp) { sweep(pp); drag = { sweeping: true, sx: e.clientX, sy: e.clientY }; setCur('grab'); return; }
      const dc = world.pick(e.clientX, e.clientY);
      if (dc && dc.type === 'deco') {
        const d0 = state.farm.decos.find((q) => q.uid === dc.uid);
        const gp0 = world.screenToGround(e.clientX, e.clientY);
        if (d0) { drag = { deco: d0, sx: e.clientX, sy: e.clientY, offX: gp0 ? gp0.x - d0.x : 0, offZ: gp0 ? gp0.z - d0.z : 0, moved: false }; setCur('grab'); return; }
      }
      const pr = propAt(e.clientX, e.clientY);
      if (pr === 'wormbucket' && propPartAt(e.clientX, e.clientY) === 'worms') {
        // 통 위의 벌레를 집으면 그대로 끌고 다닌다. 통 몸통을 잡으면 통이 움직인다.
        if (spawnWorm(e.clientX, e.clientY)) { drag = { worm: true, sx: e.clientX, sy: e.clientY }; setCur('grab'); }
      }
      else if (pr) { const gp = world.screenToGround(e.clientX, e.clientY), L = home()[pr]; drag = { prop: pr, sx: e.clientX, sy: e.clientY, offX: gp ? gp.x - L.x : 0, offZ: gp ? gp.z - L.z : 0, moved: false }; setCur('grab'); }
      else {
        // 빈 땅을 끌면 화면이 따라온다 — 확대했을 때만. 다 보이는 상태에서 밀면 오히려 헷갈린다.
        // 누르기만 하고 놓으면 예전처럼 메뉴가 닫힌다 (mouseup 에서 moved 를 본다).
        const gp = world.view.zoom > 1.05 ? world.screenToGround(e.clientX, e.clientY) : null;
        startDig(e.clientX, e.clientY);          // 꾹 누르고 있으면 판다 — 움직이면 취소되고 화면 옮기기가 된다
        if (gp) { drag = { pan: true, sx: e.clientX, sy: e.clientY, gx: gp.x, gz: gp.z, moved: false }; setCur('grab'); }
        else closePanel();
      }
      return;
    }
    const p = world.screenToPlaneZ(e.clientX, e.clientY, b.z);
    const g0 = world.screenToGround(e.clientX, e.clientY);
    drag = { b, offX: p ? p.x - b.x : 0, offZ: g0 ? g0.z - b.z : 0, sx: e.clientX, sy: e.clientY, moved: false };
    setCur('grab');
  });
  addEventListener('mouseup', (e) => {
    if (!drag) return;
    if (drag.sweeping) { drag = null; setCur('open'); return; }
    if (drag.pan) { if (!drag.moved) closePanel(); else markDirty(); drag = null; setCur('open'); return; }
    if (drag.deco) {
      // 끌지 않고 눌렀다 떼면 '치울까?' 하고 묻는다 (마당에서 빼는 유일한 길)
      if (!drag.moved) {
        const d0 = drag.deco, it = SHOP.get('deco', d0.kind);
        // 할머니가 묻는다 — confirm() 은 내장 브라우저에서 막히면 '아니요'가 되어 버린다
        grannySay(`${it ? it.icon + ' ' + it.name : '장식'}을(를) 마당에서 치울까?\n코인은 돌려받지 못한단다.`,
          [{ label: '치울래요', primary: true, fn: () => {
            grannyHide();
            state.farm.decos = state.farm.decos.filter((q) => q.uid !== d0.uid);
            world.setDecos(state.farm.decos); markDirty(); toast('🧹 마당에서 치웠어요');
          } },
           { label: '그냥 둘래요', fn: grannyHide }], 'think');
      } else toast('📦 자리를 옮겼어요');
      drag = null; setCur('open'); return;
    }
    if (drag.worm) { if (worm) worm.held = false; drag = null; setCur('open'); return; }
    if (drag.prop) {
      // 벌레통은 눌렀다 떼면 벌레가 나오고, 끌면 통이 움직인다
      if (!drag.moved) { if (drag.prop === 'wormbucket') toast('🪱 통 위의 벌레를 집어서 끌어다 놓으세요', false, 5000); else propClick(drag.prop); }
      else toast('📦 자리를 옮겼어요');
      drag = null; setCur('point'); return;
    }
    const b = drag.b;
    if (drag.moved) {
      b.carrying = false; b.d.x = toFrac(b.x); b.d.z = b.z; b.targetX = null;
      if (b.y > 0) { setAnim(b, 'fall', 99); b.vy = 0; } else decide(b);
      momRelief(b);
      markDirty();
    }
    else touch(b);
    drag = null; setCur('pet');
  });
  // ── 찾기: 그 아이에게 화면을 옮기고 잠시 따라다닌다 ──
  let follow = null;
  function followBird(b) {
    follow = { id: b.d.id, until: now() + 9000 };
    state.settings.zoom = clamp(Math.max(state.settings.zoom ?? 1, 1.7), 0.6, 2.4);
    hoverId = b.d.id;
    later(b, 9000, () => { if (hoverId === b.d.id) hoverId = null; });
    toast(`📍 ${b.d.name}(이)를 따라가요`, false, 3000);
    resize();
  }
  function tickFollow() {
    if (!follow) return;
    const b = birds.find((q) => q.d.id === follow.id);
    if (!b || now() > follow.until) { follow = null; return; }
    const v = world.view;
    v.tx += (b.x - v.tx) * 0.12;
    v.tz += (b.z - v.tz) * 0.12;
    panClamp(); world.fit(W, H);
  }

  // 확대·축소 — 커서 아래의 땅을 붙잡고 확대한다.
  // 그 지점이 제자리에 있어야 '확대'로 느껴진다. 예전에는 화면이 통째로 미끄러졌다.
  // 바라보는 지점은 언제나 마당 안에 있어야 한다.
  // 안 그러면 아이가 빈 구석을 확대하다 닭을 잃어버린다.
  function panClamp() {
    const v = world.view;
    v.tx = clamp(v.tx, world.xMin + 2, world.xMax - 2);
    v.tz = clamp(v.tz, world.zMin + 2, world.zMax - 2);
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); follow = null;
    const z0 = world.view.zoom;
    const z1 = clamp(z0 * (e.deltaY > 0 ? 0.9 : 1.111), 0.6, 2.4);
    if (Math.abs(z1 - z0) < 0.001) return;
    const before = world.screenToGround(e.clientX, e.clientY);
    state.settings.zoom = z1; world.view.zoom = z1; world.fit(W, H);
    const after = world.screenToGround(e.clientX, e.clientY);
    if (before && after) { world.view.tx += before.x - after.x; world.view.tz += before.z - after.z; panClamp(); }
    markDirty(); resize();
  }, { passive: false });

  // 시점 — 오른쪽 버튼을 누른 채 위아래로. 마당은 가만히 있고 카메라만 돈다.
  let tilt = null;
  canvas.addEventListener('mousedown', (e) => { if (e.button === 2) { follow = null; tilt = { y: e.clientY, from: world.view.elev }; e.preventDefault(); } });
  addEventListener('mousemove', (e) => {
    if (!tilt) return;
    const v = clamp(tilt.from + (e.clientY - tilt.y) * 0.16, 16, 55);
    if (Math.abs(v - world.view.elev) < 0.15) return;
    state.settings.elev = v; resize();
  });
  addEventListener('mouseup', () => { if (tilt) { tilt = null; markDirty(); } });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // 모이통을 오른쪽 버튼으로 누르면 사료가 바뀐다 (메뉴를 열지 않고)
    const pr = propAt(e.clientX, e.clientY);
    if (pr === 'feeder' || pr === 'feeder2') { cycleFeed(pr); return; }
    const b = birdAt(e.clientX, e.clientY); if (!b || b.d.stage === 'egg') return;
    scold(b);
  });
  function scold(b) {
    b.inCoop = false; setVisible(b, true); b.targetX = null; b.callTarget = null;
    affect(b, -6 * trait(b).flee); b.d.happy = clamp(b.d.happy - 4, 10, 100); b.d.stress = clamp(b.d.stress + 40, 0, 100);
    setAnim(b, 'scold', 0.9); b.vy = 2.5; showIcon(b, '💢', 900);
    soundAlarm('ground', b.x, b.z, 7);
    b.scolds = (b.scolds || 0) + 1; setTimeout(() => { b.scolds = Math.max(0, (b.scolds || 1) - 1); }, 60000);
    if (b.scolds >= 3) { later(b, 1000, () => burst(b, 'wail')); return; }
    later(b, 900, () => { if (b.anim === 'scold' || b.anim === 'idle') { showIcon(b, pick(['😢', '😳', '🥺']), 2200); const away = mouse.x >= 0 ? Math.sign(b.x - (world.screenToGround(mouse.x, mouse.y) || { x: b.x }).x) || 1 : b.dir; goTo(b, b.x + away * rand(3, 6) * trait(b).flee, 'walk'); b.fleeing = true; } });
    renderCoop();
  }
  canvas.addEventListener('dblclick', (e) => {
    const b = birdAt(e.clientX, e.clientY);
    if (b) { selectedId = b.d.id; if (b.d.stage === 'egg') { openPanel('coop'); return; } showIcon(b, '📣', 2000); const n = callFlock(b.x, b.z, b); toast(n ? `📣 ${b.d.name}(이)가 친구들을 불렀어요` : `📣 ${b.d.name}: 올 친구가 없네요`); return; }
    // 빈 땅을 두 번 누르면 휘파람 — 그 자리로 부른다.
    // 메뉴에서 버튼을 찾는 것보다, 부르고 싶은 자리를 바로 짚는 편이 빠르다.
    if (poopAt(e.clientX, e.clientY) || propAt(e.clientX, e.clientY)) return;
    whistleAt(e.clientX, e.clientY);
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

  // ── 행동 도감 ──
  // 닭이 무언가 하는 순간 클릭하면 모인다. 처음 보면 1코인과 함께 '왜 그러는지'를 알려 준다.
  // 이미 본 행동은 코인 없이 설명만 다시 — 클릭이 곧 '지금 뭐 해?'라는 질문이 된다.
  const DEX = TP.dex, QUIZ = TP.quiz;
  const DEX_GRACE = 1500;                  // 방금 끝난 행동도 이만큼은 봐준다 (아이 손은 닭보다 느리다)
  function dexOf(b) {
    let e = DEX.match(b.anim, b.d.stage);
    if (!e && b.prevAnim && now() - (b.prevAnimAt || 0) < DEX_GRACE) e = DEX.match(b.prevAnim, b.d.stage);
    return e;
  }
  function dexSpot(b) {
    if (b.d.stage === 'egg') return null;
    const e = dexOf(b);
    if (!e) return null;
    if (!state.dex[e.id]) {
      state.dex[e.id] = { day: today(), by: b.d.name };
      state.coins += 1; markDirty(); renderCoop(); chime();
      toast(`📔 새 행동 발견! ${e.icon} ${e.name}  +1🪙  (${dexCount()}/${DEX.LIST.length})`, true, 6000);
      toast(e.why, false, 9000);
      return 'new';
    }
    if (now() - (b.dexSaidAt || 0) > 6000) { b.dexSaidAt = now(); toast(`${e.icon} ${b.d.name}: ${e.name} — ${e.why}`, false, 6000); }
    return 'seen';
  }
  const dexCount = () => DEX.LIST.filter((e) => state.dex[e.id]).length;

  // ── 땅 파기 ──
  // 빈 땅을 꾹 누르고 있으면 흙이 튀다가 가끔 지렁이가 나온다. 끌면 파기가 아니라 화면 옮기기다.
  // 하루에 찾을 수 있는 수는 정해져 있다 — 지렁이가 끝없이 나오면 또 10분 만에 할 게 없어진다.
  const DIG_HOLD = 1100;                   // 이만큼 누르고 있으면 한 번 판다 (ms)
  const DIG_MAX = 5;                       // 하루에 찾는 지렁이
  const DIG_CHANCE = 0.4;
  const DIG_PITY = 3;                      // 이만큼 연달아 허탕이면 다음엔 꼭 나온다 (운이 나빠 포기하지 않게)
  let digging = null;
  function inYard(x, z) { return x > world.xMin + 0.6 && x < world.xMax - 0.6 && z > world.zMin + 0.6 && z < world.zMax - 0.6; }
  function startDig(px, py) {
    const g = world.screenToGround(px, py);
    if (!g || !inYard(g.x, g.z)) return false;
    digging = { px, py, x: g.x, z: g.z, t0: now(), lastPuff: 0 };
    return true;
  }
  function cancelDig() { if (digging && digging.hoe && curKind === 'hoe') setCur('open'); digging = null; }
  function tickDig() {
    if (!digging) return;
    const t = now() - digging.t0;
    if (t > 250 && !digging.hoe) { digging.hoe = true; setCur('hoe'); }
    if (t > 250 && now() - digging.lastPuff > 170) { world.puff(digging.x, digging.z, 3, 0.3, 0x9A7A55); digging.lastPuff = now(); }
    if (t >= DIG_HOLD) { const d = digging; digging = null; digAt(d.x, d.z); setTimeout(() => { if (curKind === 'hoe') setCur('open'); }, 350); }
  }
  function digToday() {
    if (state.dig.day !== today()) state.dig = { day: today(), found: 0, tries: 0, miss: 0 };
    return state.dig;
  }
  function digAt(x, z, force) {
    const dg = digToday();
    dg.tries += 1;
    world.puff(x, z, 9, 0.55, 0x8B6B47);
    if (dg.found >= DIG_MAX) { markDirty(); toast('🕳️ 흙만 나왔어요. 오늘은 땅속 벌레가 다 숨었나 봐요 — 내일 또 파 보세요', false, 6000); return 'done'; }
    const hit = force === true || (force !== false && (Math.random() < DIG_CHANCE || dg.miss >= DIG_PITY));
    if (!hit) {
      dg.miss += 1; markDirty();
      toast(pick(['🕳️ 흙만 나왔어요. 조금 옆을 파 볼까요?', '🪨 작은 돌멩이! 닭은 이런 돌을 삼켜서 모래주머니에서 먹이를 갈아요', '🌱 풀뿌리만 나왔어요. 한 번 더!']), false, 4500);
      return 'miss';
    }
    dg.found += 1; dg.miss = 0; markDirty();
    if (!worm) {
      const m = world.makeWorm(); world.scene.add(m.group);
      worm = { model: m, x: clamp(x, world.xMin + XMARGIN, world.xMax - XMARGIN), y: 0, z: clampZ(z), held: false, vy: 0, bornAt: now(), escapes: 0, dir: rand(0, Math.PI * 2), turnAt: 0, dartUntil: 0 };
      toast(`🪱 지렁이다! 닭들이 알아챘어요 (오늘 ${dg.found}/${DIG_MAX})`, true, 5000);
      for (const b of birds) if (eligible(b)) decide(b);
    } else {
      state.worms = Math.min(12, state.worms + 1); world.setWormCount(state.worms); renderCoop();
      toast(`🪱 지렁이를 찾아 벌레통에 넣었어요 (오늘 ${dg.found}/${DIG_MAX})`, false, 5000);
    }
    return 'worm';
  }

  // ── 코인이 모자랄 때 — 그 아이가 지금 할 수 있는 길만 알려 준다 ──
  // 예전에는 늘 "달걀을 팔아 보세요"였다. 병아리로 막 시작한 아이에게는 팔 달걀이 없다.
  function coinWays() {
    const ways = [];
    if (state.allowance.day !== today() && birds.some((b) => b.d.stage !== 'egg')) ways.push('모든 닭에게 모이와 물을 챙겨 주면 할머니가 용돈을 주세요');
    if (dexCount() < DEX.LIST.length) ways.push('닭이 무언가 하는 순간 클릭하면 행동 도감이 채워지고 코인이 생겨요');
    if (QUIZ.READY && quizLeft() > 0) ways.push('할머니 퀴즈를 맞혀 보세요');
    if (state.basket > 0) ways.push('달걀 바구니를 눌러 달걀을 팔 수 있어요');
    else if (birds.some((b) => b.d.stage === 'hen')) ways.push('암탉이 알을 낳으면 팔 수 있어요');
    return ways;
  }
  function coinShort(need) {
    const ways = coinWays();
    toast(`🪙 코인이 모자라요${need ? ` (${need}개 필요)` : ''}`, false, 6000);
    if (ways.length) toast('💡 ' + ways.slice(0, 2).join('\n💡 '), false, 8000);
    else toast('💡 오늘은 코인을 다 모았어요. 내일 또 돌봐 주세요', false, 6000);
  }

  // ── 할머니 퀴즈 ── (QUIZ.READY 가 false 면 나오지 않는다 — 문항 검토 전)
  function quizToday() {
    if (state.quiz.day !== today()) { state.quiz.day = today(); state.quiz.n = 0; }
    return state.quiz;
  }
  function quizLeft() { return Math.max(0, QUIZ.PER_DAY - quizToday().n); }
  function askQuiz(force) {
    if (!QUIZ.READY && !force) return null;
    const qs = quizToday();
    if (qs.n >= QUIZ.PER_DAY) { grannySay('오늘 문제는 다 풀었구나. 내일 또 내 주마.', [{ label: '네!', primary: true, fn: grannyHide }], 'smile'); return null; }
    let pool = QUIZ.Q.filter((x) => !qs.done.includes(x.id));
    if (!pool.length) { qs.done = []; pool = QUIZ.Q.slice(); }
    const item = pick(pool);
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const answer = (i) => {
      qs.n += 1; qs.done.push(item.id);
      const right = i === item.a;
      if (right) state.coins += 1;
      markDirty(); renderCoop();
      const more = qs.n < QUIZ.PER_DAY;
      grannySay(`${right ? '맞았다! 🪙 1코인' : `아쉽구나. 답은 「${item.c[item.a]}」란다.`}\n${item.why}`,
        [more ? { label: '다음 문제', primary: true, fn: () => askQuiz(force) } : { label: '내일 또 풀래요', primary: true, fn: grannyHide },
         ...(more ? [{ label: '그만할래요', fn: grannyHide }] : [])], right ? 'proud' : 'think');
    };
    grannySay(`할머니 퀴즈 (${qs.n + 1}/${QUIZ.PER_DAY})\n${item.q}`, order.map((i) => ({ label: item.c[i], fn: () => answer(i) })), 'think');
    return item.id;
  }

  // ── 할머니가 한 번씩만 알려 주는 것 ──
  // 용돈 조건과 도감은 알려 주지 않으면 아이들이 끝내 모른다 (실제로 "코인 어떻게 얻어요?"가 나왔다).
  function tellOnce() {
    if (!state.onboarded || talking || !$('#granny').classList.contains('hidden')) return;
    if (!birds.some((b) => b.d.stage !== 'egg')) return;
    const t = state.told;
    if (!t.allowance) {
      t.allowance = now(); markDirty();
      grannySay('모든 닭에게 모이랑 물을 챙겨 주면, 그날 할머니가 용돈을 주마.\n그 돈으로 벌레도 사고 마당도 꾸밀 수 있단다.', [{ label: '네!', primary: true, fn: grannyHide }], 'smile');
      return;
    }
    if (!t.dex && now() - t.allowance > 3 * 60 * 1000) {
      t.dex = now(); markDirty();
      grannySay('닭이 무얼 하는지 가만히 보다가, 그 순간 눌러 보렴.\n모래 목욕, 깃털 다듬기, 기지개…… 처음 보는 행동을 찾으면 관찰일지에 적어 두고 1코인을 주마.', [{ label: '찾아볼게요', primary: true, fn: grannyHide }], 'smile');
    }
  }

  function touch(b) {
    selectedId = b.d.id;
    dexSpot(b);
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
  function openPanel(tab) { panel.classList.remove('hidden'); document.body.classList.add('menuOpen'); if (tab) showTab(tab); renderCoop(); renderSettings(); }
  function closePanel() { panel.classList.add('hidden'); document.body.classList.remove('menuOpen'); }
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
    $('#feedSay').textContent = propVisible('feeder2')
      ? `빨강 ${levelSay(state.feed, ['텅 빔', '거의 없음', '조금', '넉넉'])} · 파랑 ${levelSay(state.feed2 ?? 0, ['텅 빔', '거의 없음', '조금', '넉넉'])}`
      : levelSay(state.feed, ['텅 비었어요', '거의 없어요', '조금 남았어요', '넉넉해요']);
    $('#waterSay').textContent = levelSay(state.water, ['텅 비었어요', '거의 없어요', '조금 남았어요', '넉넉해요']);
    $('#basketCount').textContent = state.basket; $('#coinCount').textContent = state.coins; $('#wormCount').textContent = state.worms;
    $('#dexCount').textContent = `${dexCount()}/${DEX.LIST.length}`;
    $('#btnQuiz').classList.toggle('hidden', !QUIZ.READY);
    if (QUIZ.READY) $('#quizLeft').textContent = quizLeft();
    const lv = HYG.level(state.ammonia), n = HYG.count();
    $('#poopCount').textContent = n;
    $('#ammLabel').textContent = HYG.LABEL[lv] + (detailOn() ? ` (${Math.round(state.ammonia || 0)}ppm)` : '');
    $('#ammLabel').className = 'say ' + (lv === 'ok' ? '' : lv);
    const fd = C.FEED[state.feedType || 'starter'];
    const fd2 = C.FEED[state.feedType2 || 'grower'];
    const has2 = propVisible('feeder2');
    $$('[data-feed]').forEach((x) => x.classList.toggle('primary', x.dataset.feed === (state.feedType || 'starter')));
    $$('[data-feed2]').forEach((x) => x.classList.toggle('primary', x.dataset.feed2 === (state.feedType2 || 'grower')));
    $('#feed2Row').classList.toggle('hidden', !has2);
    // 통이 둘이면 '둘 중 어느 것도 맞지 않는 닭'만 경고한다.
    // 통이 하나뿐이던 시절의 경고를 그대로 두면, 통을 제대로 나눠 놓고도 계속 혼난다.
    const okFor = (q) => fd.ok.includes(q.d.stage) || (has2 && fd2.ok.includes(q.d.stage));
    const wrong = birds.filter((q) => q.d.stage !== 'egg' && !okFor(q));
    $('#feedHint').textContent = wrong.length
      ? `⚠️ ${wrong.map((q) => STAGE_KO[q.d.stage]).filter((v, i, a) => a.indexOf(v) === i).join('·')}에게 맞는 사료가 없어요`
      : (has2 ? `✅ ${fd.protein} · ${fd2.protein}` : `✅ ${fd.protein}`);
    $$('[data-lamp]').forEach((x) => x.classList.toggle('primary', Math.abs(+x.dataset.lamp - (state.lampPower ?? 0.6)) < 0.02));
    const chicks = birds.filter((q) => q.d.stage === 'chick');
    const cold = chicks.filter((q) => q.comfort && q.comfort.state === 'cold').length;
    const hot = chicks.filter((q) => q.comfort && q.comfort.state === 'hot').length;
    $('#lampHint').textContent = !chicks.length ? '병아리가 없어요' : cold ? `🥶 추워하는 병아리 ${cold}마리` : hot ? `🥵 더워하는 병아리 ${hot}마리` : '✅ 병아리들이 편안해요';
    $('#bedSay').textContent = levelSay(state.bedding ?? 100, ['다 젖었어요', '축축해요', '조금 눅눅해요', '보송보송해요']);
    $('#btnBedding').textContent = (state.bedding ?? 100) > 70 ? '아직 깨끗' : '갈기';
    const fl = Math.min(Math.max(0, RULE.refillCooldownMin * 60000 - (now() - state.lastFeedRefill)), propVisible('feeder2') ? Math.max(0, RULE.refillCooldownMin * 60000 - (now() - (state.lastFeedRefill2 || 0))) : Infinity), wl = Math.max(0, RULE.refillCooldownMin * 60000 - (now() - state.lastWaterRefill));
    $('#btnFeed').textContent = fl ? `${Math.ceil(fl / 60000)}분 후` : '채우기'; $('#btnWater').textContent = wl ? `${Math.ceil(wl / 60000)}분 후` : '채우기';
    const box = $('#flockList'); box.innerHTML = '';
    $('#starterBox').classList.toggle('hidden', birds.length > 0);
    const order = STAGE_ORDER;
    for (const b of birds.slice().sort((a, c) => order[a.d.stage] - order[c.d.stage])) {
      const need = { egg: RULE.daysEgg, chick: RULE.daysChick, young: RULE.daysYoung }[b.d.stage];
      const n = daysCared(b);
      const card = document.createElement('div'); card.className = 'petCard' + (selectedId === b.d.id ? ' selected' : '');
      shotFor(b);                                   // 그 아이의 지금 모습을 옆에 보여준다
      const days = Math.max(1, Math.ceil((now() - b.d.born) / 86400000));
      const broodedToday = b.d.stage === 'egg' && ST.caredToday(b.d);
      card.innerHTML = `
        <div class="head"><span class="name">${esc(b.d.name)}</span><button class="iconBtn" data-act="rename" title="이름 바꾸기">✏️</button>
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
          <button class="small" data-act="find">📍 찾기</button>${b.d.stage === 'egg' ? '' : `<button class="small" data-act="hat">${b.d.hat ? '🧢 모자 바꾸기' : '🧢 모자'}</button>`}<button class="small danger" data-act="release">농장으로 보내기</button>
        </div>
        ${b.thumb ? `<img class="petShot" src="${b.thumb}" alt="">` : '<div class="petShot noshot">🐔</div>'}`;
      card.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act; selectedId = b.d.id;
        if (act === 'brood') { broodTick(b); b.f = 1; b.wobbleUntil = performance.now() / 1000 + 1; setAnim(b, 'egg', 1.5); showIcon(b, '✨'); }
        else if (act === 'rename') { askText('새 이름을 정해 주세요', b.d.name).then((nm) => { if (nm && nm.trim()) { b.d.name = nm.trim().slice(0, 12); markDirty(); renderCoop(); } }); }
        else if (act === 'find') { b.inCoop = false; setVisible(b, true); if (b.d.stage !== 'egg') jump(b, 300); followBird(b); closePanel(); }
        else if (act === 'hat') { openShop('hat', b); return; }
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
  // 메뉴 버튼은 두 통을 한 번에 (마당에서 통을 직접 누르면 그 통만)
  $('#btnFeed').addEventListener('click', () => { const a = fillFeeder('feeder'); const b2 = propVisible('feeder2') ? fillFeeder('feeder2') : false; if (!a && !b2) return; });
  $('#btnWater').addEventListener('click', () => { if (now() - state.lastWaterRefill < RULE.refillCooldownMin * 60000) return; state.water = 100; state.lastWaterRefill = now(); markDirty(); renderCoop(); checkStep(); syncSupplies(); toast('💧 물통을 채웠어요'); });
  $('#btnStarter').addEventListener('click', () => { if (!giveFirstChick()) toast('이미 닭이 있어요', false, 4000); });
  // 첫 병아리는 할머니가 건넨다. 알이 아니라 병아리로 시작하는 이유는,
  // 알로 시작하면 7일 동안 할 수 있는 일이 '품기' 버튼 하나뿐이기 때문이다.
  function giveFirstChick() {
    if (birds.length) return false;        // 부르는 쪽이 '못 줬다'는 걸 알 수 있어야 한다
    // 아이가 처음 받는 병아리다. 반드시 눈에 잘 띄는 곳에 둔다.
    // (닭장 옆에 두었더니 마당 뒤쪽 구석이라 화면 밖으로 밀렸다)
    const cx = (world.xMin + world.xMax) / 2;
    const cz = world.zMax - (world.zMax - world.zMin) * 0.22;
    const d = newBird('chick', { x: toFrac(cx), z: cz });
    state.flock.push(d);
    const rt = makeRuntime(d); rt.x = cx; rt.z = cz; birds.push(rt);
    // 알을 받을 자리는 아직 필요 없다. 첫 암탉이 나오면 할머니가 가져다 주신다.
    state.settings.propHidden = Object.assign({}, state.settings.propHidden, { nest: true, basket: true, perch: true, feeder2: true });
    layoutHome();
    state.chapter = 1; state.onboarded = false; markDirty(); renderCoop(); closePanel();
    $('#gAsk').classList.remove('hidden');
    later0(() => note('start', rt), 900);
    scene([GR.CHAPTERS[1].say, `이름은 "${d.name}"라고 불러 두었단다. 마음에 안 들면 바꾸어도 좋아.`],
      () => { $('#gAsk').classList.remove('hidden'); startSteps(); }, 'proud');
    return true;
  }
  $$('[data-feed]').forEach((x) => x.addEventListener('click', () => {
    state.feedType = x.dataset.feed; for (const q of birds) q.d.wrongFeed = 0;
    markDirty(); renderCoop();
    const f = C.FEED[state.feedType];
    toast(`🌾 빨간 통에 ${f.name} 사료를 넣었어요 — ${f.desc}`, false, 4500);
  }));
  $$('[data-feed2]').forEach((x) => x.addEventListener('click', () => {
    state.feedType2 = x.dataset.feed2; for (const q of birds) q.d.wrongFeed = 0;
    markDirty(); renderCoop();
    const f = C.FEED[state.feedType2];
    toast(`🌾 파란 통에 ${f.name} 사료를 넣었어요 — ${f.desc}`, false, 4500);
  }));
  $$('[data-lamp]').forEach((x) => x.addEventListener('click', () => { setTimeout(checkStep, 60); lampEffect(+x.dataset.lamp);
    state.lampPower = +x.dataset.lamp; markDirty(); renderCoop(); world.setLamp(state.lampPower);
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
  $('#btnSellEggs').addEventListener('click', () => sellEggs());
    $('#btnBuyWorm').addEventListener('click', () => { if (state.coins < 1) { coinShort(1); return; } state.coins -= 1; state.worms += 1; markDirty(); world.setWormCount(state.worms); renderCoop(); toast('🪱 벌레 한 마리를 샀어요'); });
  $('#btnWhistle').addEventListener('click', () => { whistleAt(mouse.x, mouse.y); closePanel(); });
  $('#btnAlbum').addEventListener('click', () => { renderJournal(); $('#journalModal').classList.remove('hidden'); closePanel(); });
  $('#btnDex').addEventListener('click', () => { renderJournal(); $('#journalModal').classList.remove('hidden'); closePanel(); });
  $('#btnQuiz').addEventListener('click', () => { closePanel(); askQuiz(); });
  function journalLines() {
    const out = [];
    for (const e of (state.journal || [])) out.push(`${e.day}  ${JR.KINDS[e.kind] ? JR.KINDS[e.kind].icon : '·'} ${e.text}`);
    for (const a of (state.album || [])) out.push(`${a.left}  🌾 ${a.name}(${a.stage}) — ${a.born} 부터 함께. 낳은 알 ${a.eggs}개, 자손 ${a.children}마리`);
    return out;
  }
  function renderJournal() {
    const box = $('#journalList'); box.innerHTML = '';
    // 행동 도감 — 못 본 행동도 이름은 보여 준다. 무엇을 찾아야 할지 알아야 지켜보게 된다.
    const dx = document.createElement('div'); dx.className = 'dexBox'; dx.id = 'dexBox';
    dx.innerHTML = `<div class="dexHead"><b>🔍 행동 도감</b><span>${dexCount()} / ${DEX.LIST.length}</span></div>
      <p class="hint">닭이 그 행동을 하는 순간 눌러 보세요. 처음 찾으면 🪙 1코인!</p>
      <div class="dexGrid">${DEX.LIST.map((e) => {
        const got = state.dex[e.id];
        return `<div class="dexCell ${got ? 'got' : ''}" title="${got ? esc(e.why) : '아직 못 봤어요'}"><span class="di">${got ? e.icon : '❔'}</span><span class="dn">${esc(e.name)}</span>${got ? `<span class="dw">${esc(e.why)}</span><span class="dd">${esc(got.day.slice(5).replace('-', '/'))} · ${esc(got.by || '')}</span>` : ''}</div>`;
      }).join('')}</div>`;
    box.appendChild(dx);
    const js = (state.journal || []);
    if (!js.length && !(state.album || []).length) { box.insertAdjacentHTML('beforeend', '<p class="hint">아직 자라온 기록이 없어요. 닭이 자라면 그때그때 이곳에 쌓입니다.</p>'); return; }
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
    $('#classCode').value = state.classCode || '';
    $('#wxLine').textContent = `${wx.icon} ${wx.name}${state.classCode ? ' · ' + state.classCode + '반' : ''}`;
    $('#soundOn').checked = state.settings.sound;
    $('#plainCursor').checked = !!state.settings.plainCursor;
    const cal = !!state.settings.useCalendar;
    $('#useCalendar').checked = cal;
    $('#pauseWeekends').checked = state.settings.pauseWeekends !== false;
    for (const el of ['#pauseWeekends', '#vacationOn', '#btnAddHoliday']) { const n = $(el); if (n) n.disabled = !cal; }
    $('#vacationOn').checked = !!state.settings.vacation;
    const v = state.settings.vacation;
    $('#calInfo').textContent = (cal ? '' : '학사일정을 켜면 주말·공휴일·방학에 시간이 멈춥니다. ')
      + `🧊 돌봄 프리즈 ${state.freezes}개 남음` + (v ? ` · 🏖️ 방학 ${v.from}~${v.to}` : '')
      + ((state.settings.holidays || []).length ? ` · 🗓️ 쉬는 날 ${state.settings.holidays.length}일` : '');
      $$('[data-size]').forEach((b) => b.classList.toggle('primary', +b.dataset.size === state.settings.size));
      }
  $('#btnAdv').addEventListener('click', () => {
    const hid = $('#advBox').classList.toggle('hidden');
    $('#btnAdv').textContent = hid ? '⋯ 자세한 설정' : '⋯ 접기';
  });
  $('#btnPrivacy2').addEventListener('click', () => { if (api.openExternal) api.openExternal(location.origin + location.pathname + 'privacy.html'); else location.href = 'privacy.html'; });
  $('#btnWipe2').addEventListener('click', () => { const b = document.querySelector('#wbWipe'); if (b) b.click(); else toast('데스크톱 버전에서는 설정 폴더를 지워 주세요', false, 7000); });
  $('#btnExport2').addEventListener('click', () => { if (window.__tpExport) { state.lastBackup = today(); markDirty(); window.__tpExport(); } else toast('웹 버전에서만 됩니다', false, 5000); });
  $('#btnImport2').addEventListener('click', () => { const f = document.querySelector('#wbFile'); if (f) f.click(); else toast('웹 버전에서만 됩니다', false, 5000); });
  $('#btnViewReset').addEventListener('click', () => { state.settings.zoom = 1; state.settings.elev = 24; world.view.tx = 0; world.view.tz = world.zMin * 0.42; markDirty(); resize(); toast('화면을 처음 시점으로 되돌렸어요'); });
  // 카메라로 찍으면 바로 열리도록 QR 에는 주소를 담는다.
  // '#' 뒤는 서버로 전송되지 않는다 — 그래서 닭 이름이 우리 서버에도, 남의 서버에도 남지 않는다.
  function codeUrl(code) {
    if (!/^https?:$/.test(location.protocol)) return code;   // 데스크톱(file://)은 글자 그대로
    return location.origin + location.pathname + '#f=' + code.replace(/^농장-/, '');
  }
  // 우리 반 — 숫자만 남는다 (weather.cleanClass). 기기 안에만 있고 어디로도 보내지 않는다.
  $('#classCode').addEventListener('change', (e) => {
    const v = WX.cleanClass(e.target.value);
    e.target.value = v;                      // 정리된 모습을 그대로 보여 준다
    if (v === state.classCode) return;
    state.classCode = v; markDirty(); applyWeather();
    toast(v ? `${v}반 날씨로 맞췄어요 — ${wx.icon} ${wx.name}` : `전국 공통 날씨로 돌렸어요 — ${wx.icon} ${wx.name}`, false, 5000);
  });

  // 오늘 자랑 글 — 이름도 학교도 반도 들어가지 않는다. 숫자와 날씨뿐이다.
  function bragText() {
    const chicks = birds.filter((b) => b.d.stage === 'chick').length;
    const days = birds.length ? Math.max(...birds.map((b) => daysCared(b))) : 0;
    const out = [`🐔 우리 농장 ${days}일차`, `${wx.icon} 오늘은 ${wx.name}`];
    if (chicks) out.push(`🐤 병아리 ${chicks}마리 무사해요`);
    else if (birds.length) out.push(`🐓 닭 ${birds.length}마리와 지내요`);
    const last = (state.journal || []).slice(-1)[0];
    if (last && last.text) out.push(`📔 ${last.text}`);
    return out.join('\n');
  }
  $('#btnBrag').addEventListener('click', () => {
    if (!birds.length) { toast('아직 자랑할 닭이 없어요', false, 5000); return; }
    const t = bragText();
    const done = () => toast('📋 자랑 글을 복사했어요');
    const fail = () => grannySay('복사가 안 되는구나. 이대로 옮겨 적으렴.',
      [{ label: '알겠어요', primary: true, fn: grannyHide }], 'think', { code: t });
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(t);
      if (p && p.then) p.then(done, fail); else fail();
    } catch (e) { fail(); }
  });

  // ---- 할머니의 가게 ----
  let shopKind = 'hat', shopBird = null;      // shopBird = 모자를 씌울 닭
  const owned = (kind, id) => SHOP.free(kind, id) || (state.owned[kind] || []).includes(id);
  function equipped(kind, id) {
    if (kind === 'coop') return state.farm.coopSkin === id;
    if (kind === 'ground') return state.farm.ground === id;
    if (kind === 'hat') return !!shopBird && shopBird.d.hat === id;
    return false;                              // 장식물은 '입는' 것이 아니라 놓는 것
  }
  function openShop(kind, bird) {
    shopKind = kind || 'hat'; shopBird = bird || null;
    $$('.stab').forEach((t) => t.classList.toggle('on', t.dataset.kind === shopKind));
    renderShop(); closePanel();
    $('#shopModal').classList.remove('hidden');
  }
  function renderShop() {
    $('#shopCoins').textContent = '🪙 ' + state.coins;
    const hint = {
      hat: shopBird ? `${shopBird.d.name}에게 씌울 모자예요. 다시 누르면 벗어요.`
        : '먼저 닭장 상태에서 닭을 고르고 [모자 씌우기]를 누르세요.',
      coop: '닭장 지붕 색을 고르세요.',
      deco: '사면 마당에 놓여요. 끌어서 자리를 옮길 수 있어요.',
      ground: '마당 바닥을 고르세요.',
    }[shopKind];
    $('#shopHint').textContent = hint + ' 꾸미기는 겉모습만 바꿔요.';
    const grid = $('#shopGrid');
    grid.innerHTML = '';
    for (const it of SHOP.of(shopKind)) {
      const has = owned(shopKind, it.id), on = equipped(shopKind, it.id);
      const poor = !has && state.coins < it.price;
      const el = document.createElement('button');
      el.className = 'shopItem' + (on ? ' on' : has ? ' own' : '') + (poor ? ' cant' : '');
      el.innerHTML = `<span class="si">${esc(it.icon)}</span><span class="sn">${esc(it.name)}</span>`
        + `<span class="sp">${on ? '입고 있어요' : has ? (shopKind === 'deco' ? '🪙 ' + it.price : '가지고 있어요') : '🪙 ' + it.price}</span>`;
      el.addEventListener('click', () => pickShop(it, has));
      grid.appendChild(el);
    }
  }
  function pickShop(it, has) {
    // 장식물은 살 때마다 하나씩 더 놓인다. 나머지는 한 번 사면 계속 쓴다.
    if (!has || it.kind === 'deco') {
      if (state.coins < it.price) { coinShort(it.price); return; }
      state.coins -= it.price;
      if (!has) (state.owned[it.kind] = state.owned[it.kind] || []).push(it.id);
    }
    if (it.kind === 'coop') state.farm.coopSkin = it.id;
    else if (it.kind === 'ground') state.farm.ground = it.id;
    else if (it.kind === 'deco') {
      if (state.farm.decos.length >= 12) { toast('마당이 꽉 찼어요. 장식을 하나 치우고 다시 놓아 주세요', false, 6000); return; }
      const spot = { x: rand(world.xMin + 4, world.xMax - 4), z: clampZ(rand(world.zMin + 5, world.zMax - 3)) };
      state.farm.decos.push({ uid: uid(), kind: it.id, x: spot.x, z: spot.z });
      toast(`${it.icon} ${it.name}을(를) 마당에 놓았어요. 끌어서 옮겨 보세요`, false, 6000);
    } else if (it.kind === 'hat') {
      if (!shopBird) { toast('먼저 닭을 고르세요', false, 5000); return; }
      shopBird.d.hat = shopBird.d.hat === it.id ? null : it.id;
      applyHat(shopBird);
    }
    markDirty(); applyDecor(); renderShop(); renderCoop();
  }
  $$('.stab').forEach((t) => t.addEventListener('click', () => openShop(t.dataset.kind, shopBird)));
  $('#closeShop').addEventListener('click', () => $('#shopModal').classList.add('hidden'));
  $('#shopModal').addEventListener('click', (e) => { if (e.target.id === 'shopModal') $('#shopModal').classList.add('hidden'); });
  $('#btnShop').addEventListener('click', () => openShop('hat', null));

  $('#btnCodeMake').addEventListener('click', () => {
    const code = FC.make(state);
    if (!code) { toast('아직 데려갈 닭이 없어요', false, 5000); return; }
    const qr = QR.svg(codeUrl(code), 168);
    grannySay('우리 닭들을 적어 두었단다.\n휴대폰 사진기로 이 그림을 비추면 바로 열린단다.\n(사진과 일지는 따라가지 않아. 그건 [파일로 저장]으로 챙기렴.)',
      [{ label: '복사하기',
         primary: true,
         // 복사는 약속(Promise)으로 끝난다. try/catch 로만 감싸면 실패가 새어 나가
         // "복사했어요" 라고 거짓말을 하게 된다. 성공한 뒤에만 알린다.
         fn: () => {
           const done = () => toast('📋 농장 코드를 복사했어요');
           const fail = () => toast('복사가 안 돼요. 코드를 손으로 적어 주세요', false, 6000);
           try {
             const p = navigator.clipboard && navigator.clipboard.writeText(code);
             if (p && p.then) p.then(done, fail); else fail();
           } catch (e) { fail(); }
         } },
       { label: '닫기', fn: grannyHide }], 'think', { code, qr });
  });
  // 코드를 실제로 받아들이는 곳 — 손으로 넣든 QR 로 들어오든 여기 하나를 지난다
  function applyFarmCode(r) {
    state.flock = r.birds.map((b) => newBird(b.stage, b));
    state.coins = r.coins;
    for (const id of (r.dex || [])) if (!state.dex[id]) state.dex[id] = { day: today(), by: '' };   // 도감은 합친다 — 잃을 이유가 없다
    for (const b of birds) world.removeBird(b.d.id);
    birds = state.flock.map(makeRuntime);
    for (const b of birds) { b.x = rand(world.xMin + 4, world.xMax - 4); b.z = clampZ(rand(world.zMin + 4, world.zMax - 2)); decide(b); }
    markDirty(); renderCoop();
  }
  $('#btnCodeUse').addEventListener('click', async () => {
    const inp = await askText('농장 코드를 넣어 주세요', '');
    if (!inp) return;
    const r = FC.read(inp);
    if (r.error) { toast(r.error, false, 7000); return; }
    if (birds.length) {
      // 되돌릴 수 없는 일이라 한 번 더 묻는다. 할머니가 묻는 편이 확실하다 —
      // confirm() 은 내장 브라우저에서 막히면 '아니요'로 처리된다.
      grannySay(`지금 마당에 있는 ${birds.length}마리는 사라지고, 코드 속 ${r.birds.length}마리가 온단다.\n되돌릴 수 없어. 그래도 할까?`,
        [{ label: '네, 바꿀래요', primary: true, fn: () => { grannyHide(); applyFarmCode(r); welcomeArrivals(r); } },
         { label: '아니요', fn: grannyHide }], 'think');
      return;
    }
    applyFarmCode(r);
    welcomeArrivals(r);
  });
  function welcomeArrivals(r) {
    grannySay(`${r.birds.length}마리가 도착했구나. ${r.birds.map((b) => b.name).join(', ')}.`,
      [{ label: '반가워요', primary: true, fn: grannyHide }], 'smile');
  }
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
  $('#btnSeedUse').addEventListener('click', async () => {
    const inp = await askText('친구에게 받은 씨알 코드를 넣어 주세요 (예: 우렁-A3F7)', '');
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
  $('#btnResetProps').addEventListener('click', () => { state.farm.placements = {}; markDirty(); layoutHome(); toast('소품 배치를 처음으로 되돌렸어요'); });
  $('#useCalendar').addEventListener('change', (e) => {
    state.settings.useCalendar = e.target.checked; markDirty(); renderSettings();
    toast(e.target.checked ? '🗓️ 학사일정을 씁니다 — 주말·공휴일·방학엔 시간이 멈춰요' : '🗓️ 학사일정을 끕니다 — 매일 시간이 흘러요', false, 7000);
  });
  $('#pauseWeekends').addEventListener('change', (e) => { state.settings.pauseWeekends = e.target.checked; markDirty(); });
  $('#vacationOn').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const from = await askText('방학 시작일 (예: 2026-12-24)', today());
      const to = from ? await askText('방학 끝나는 날 (예: 2027-02-28)', from) : null;
      if (from && to) { state.settings.vacation = { from, to }; toast(`🏖️ ${from} ~ ${to} 은 시간이 멈춰요`, true, 8000); }
      else e.target.checked = false;
    } else state.settings.vacation = null;
    markDirty(); renderSettings();
  });
  $('#btnAddHoliday').addEventListener('click', async () => {
    const d = await askText('쉬는 날을 추가해요 (예: 2026-10-05)', today());
    if (!d) return;
    state.settings.holidays = (state.settings.holidays || []).concat([d]);
    markDirty(); renderSettings(); toast(`🗓️ ${d} 을(를) 쉬는 날로 저장했어요`, false, 6000);
  });
  $('#soundOn').addEventListener('change', (e) => { state.settings.sound = e.target.checked; markDirty(); if (e.target.checked) chime(); });
  $('#plainCursor').addEventListener('change', (e) => { state.settings.plainCursor = e.target.checked; markDirty(); setCur(curKind, true); });
  $('#autostart').addEventListener('change', (e) => api.setAutostart(e.target.checked));
  $('#btnQuit').addEventListener('click', async () => { await persist(); api.quit(); });

  let dayMark = today();
  setInterval(() => {
    if (today() !== dayMark) { dayMark = today(); SCH.markOpened(state); checkNeglect(); tryReturn(); }
    if (!panel.classList.contains('hidden')) renderCoop();
  }, 1200);
  api.on('ui:toggle-menu', togglePanel);
  api.on('pet:size', (s) => { state.settings.zoom = clamp(s / 4, 0.55, 2.2); markDirty(); resize(); });
  $('#chkDetail').checked = detailOn();
  $('#chkDetail').addEventListener('change', (e) => { state.settings.detail = e.target.checked; markDirty(); renderCoop(); });
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
    syncSupplies();
    HYG.restore(state.poops);
    const info = await api.info();
    $('#version').textContent = 'v' + info.version; $('#autostart').checked = !!info.openAtLogin;
    // 환영 카드가 떠 있는 동안에는 할머니가 끼어들면 안 된다.
    // (카드 뒤에서 말이 시작돼 버튼이 화면 밖으로 삐져나가던 문제)
    const afterWelcome = (fn, delay) => {
      let done = false;
      const go = () => { if (done) return; done = true; later0(fn, delay || 0); };
      if (!document.querySelector('#welcome')) go();
      else api.on('ui:begin', go);
    };

    // QR 을 찍고 들어온 경우 — 주소의 '#' 뒤에 코드가 실려 온다.
    // 주소는 먼저 지운다. 남겨 두면 새로고침할 때마다 같은 닭이 또 들어온다.
    let incoming = null;
    const hash = (location.hash || '').match(/^#f=([A-Za-z0-9_-]+-[A-Z0-9]{3})$/);
    if (hash) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
      const r = FC.read('농장-' + hash[1]);
      if (r.error) toast(r.error, false, 7000); else incoming = r;
    }
    if (incoming) {
      const names = incoming.birds.map((b) => b.name).join(', ');
      afterWelcome(() => grannySay(
        `찍어 온 농장에 ${incoming.birds.length}마리가 있구나.\n${names}.\n\n`
        + (birds.length ? `지금 마당에 있는 ${birds.length}마리는 사라진단다. 그래도 데려올까?` : '데려올까?'),
        [{ label: '데려올래요', primary: true, fn: () => { applyFarmCode(incoming); grannySay(`${names} — 잘 왔구나.`, [{ label: '반가워요', primary: true, fn: grannyHide }], 'smile'); } },
         { label: '아니요', fn: grannyHide }], 'think'), 700);
    }

    // 할머니 용돈 — 모이·물을 다 챙긴 날에만. 기다리면 쌓이는 게 아니라 돌봐야 쌓인다.
    // 연속으로 챙기면 조금 더 준다 (최대 +3).
    function payAllowance() {
      if (!birds.length || !state.onboarded) return;
      const day = today();
      if (state.allowance.day === day) return;
      if (!birds.every((b) => b.d.stage === 'egg' || ST.caredToday(b.d))) return;
      const yest = U.addDays(day, -1);
      state.allowance.streak = state.allowance.day === yest ? Math.min(3, (state.allowance.streak || 0) + 1) : 0;
      const pay = 3 + state.allowance.streak;
      state.allowance.day = day; state.coins += pay; markDirty(); renderCoop();
      toast(`🪙 할머니가 용돈 ${pay}코인을 주셨어요${state.allowance.streak ? ` (${state.allowance.streak + 1}일 연속!)` : ''}`, false, 7000);
    }
    payAllowanceRef = payAllowance;
    payAllowance();

    // 오늘 날씨를 하루 한 번 알려 준다. 날씨가 바뀌는 건 아이가 어쩔 수 없는 일이니,
    // 혼내는 말이 아니라 '오늘은 이런 날이니 이걸 보아라' 하는 말로 한다.
    applyDecor();
    applyWeather();
    let toldWeather = false;
    if (birds.length && state.onboarded && state.wxTold !== today() && !incoming) {
      state.wxTold = today(); markDirty(); toldWeather = true;
      afterWelcome(() => grannySay(`${wx.icon} ${wx.name}.\n${wx.say}`,
        [{ label: '알겠어요', primary: true, fn: grannyHide }],
        wx.key === 'clear' ? 'smile' : (wx.key === 'rain' || wx.key === 'cold' || wx.key === 'hot') ? 'worry' : 'think'), 2200);
    }

    // 오래 안 챙겼으면 한 번 일러 준다. 기기 저장은 언젠가 반드시 날아간다.
    if (birds.length && state.onboarded && !incoming && !toldWeather) {
      const last = state.lastBackup || '';
      const days = last ? U.daysBetween(last, today()) : 99;
      if (days >= 7 && state.backupNagged !== today()) {
        state.backupNagged = today(); markDirty();
        // 앞말과 뒷말을 따로 만든다. 삼항연산자에 문자열을 바로 이어 붙이면
        // 뒷말이 '한 번도 안 챙긴 경우'에만 붙어서, 날짜가 있는 쪽은 이유 없이 한 줄만 뜬다.
        const head = last ? `저장해 둔 지 ${days}일이 지났구나.` : '우리 농장을 아직 한 번도 챙겨 두지 않았구나.';
        const tail = '\n\n기기를 바꾸거나 인터넷 기록을 지우면 아이들이 사라진단다.\n설정에서 [파일로 저장]을 눌러 두렴.';
        afterWelcome(() => grannySay(head + tail,
          [{ label: '지금 저장할게요', primary: true, fn: () => { grannyHide(); openPanel('settings'); } },
           { label: '나중에요', fn: grannyHide }], 'worry'), 5000);
      }
    }
    if (!state.settings.guide) {
      // 웹은 환영 카드가 사라진 뒤(ui:begin), 데스크톱은 바로 시작한다.
      afterWelcome(startIntro, 250);
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
    setCur('open', true);
    requestAnimationFrame(loop);
  }
  // 디버그 훅 (자동 캡처용)
  // 자동 검증(scripts/check.js)에서 쓰는 훅
  window.__tpTest = {
    place(name, x, z) { const b = birds.find((q) => q.d.name === name); if (!b) return null; b.x = x; b.z = z; b.targetX = null; b.targetZ = null; b.y = 0; return { x: b.x, z: b.z }; },
    stateOf(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null;
      return { x: +b.x.toFixed(3), z: +b.z.toFixed(3), y: +b.y.toFixed(3), anim: b.anim, stage: b.d.stage, trait: b.d.trait, head: b.heading === undefined ? null : +b.heading.toFixed(3), dir: b.dir, comfort: b.comfort ? b.comfort.state : null }; },
    pickAt(px, py) { return world.pick(px, py); },
    screenOfBird(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null; const s = world.project(b.x, height(b) * 0.5, b.z); return { x: Math.round(s.x), y: Math.round(s.y) }; },
    screenOfPoint(x, y, z) { const s = world.project(x, y, z); return { x: Math.round(s.x), y: Math.round(s.y) }; },
    poopsRaw() { return HYG.serialize(); },
    wormState() { return worm ? { x: +worm.x.toFixed(2), y: +worm.y.toFixed(2), z: +worm.z.toFixed(2), held: !!worm.held, carrier: worm.carrier || null, escapes: worm.escapes || 0 } : null; },
    dropWormAt(x, z) {
      if (worm) removeWorm();
      state.worms = Math.max(1, state.worms);
      const sp = world.project(x, 0, z);
      if (!spawnWorm(sp.x, sp.y)) return null;
      worm.held = false; worm.y = 0; worm.vy = 0; worm.x = x; worm.z = clampZ(z);
      return { x: worm.x, z: worm.z };
    },
    props() { const out = {}; for (const k of PROP_NAMES) { const p = world.props[k]; if (p) out[k] = { x: +p.position.x.toFixed(3), z: +p.position.z.toFixed(3) }; } return out; },
    view() { return { zoom: +world.view.zoom.toFixed(3), elev: +world.view.elev.toFixed(2), tx: +world.view.tx.toFixed(3), tz: +world.view.tz.toFixed(3) }; },
    setView(zoom, elev) { if (zoom !== undefined) state.settings.zoom = zoom; if (elev !== undefined) state.settings.elev = elev; resize(); },
    giveChick() { giveFirstChick(); return birds.length; },
    dropPoopAt(x, z) { return HYG.dropPoop(x, z, false); },
    farmCode() { return FC.make(state); },
    readFarmCode(code) { return FC.read(code); },
    fixBird(raw) { const d = ST.ensureBird(Object.assign({ id: 'x', name: '테스트', stage: 'chick' }, raw)); return { x: d.x, z: d.z }; },
    qr(text, mask) { const q = QR.make(text, mask); return q ? { n: q.n, rows: q.rows } : null; },
    wipeReady() { return typeof window.__tpWipe === 'function'; },
    weather() { return { key: wx.key, name: wx.name, room: wx.room, dust: wx.dust, indoor: wx.indoor }; },
    weatherOn(day, klass) { const w = WX.of(day, klass); return w.key; },
    setClass(v) { state.classCode = WX.cleanClass(v); applyWeather(); return { code: state.classCode, wx: wx.key }; },
    setWeather(key) {
      const k = WX.KINDS[key];
      if (!k) return null;
      applyWeather(key);                        // 배지·하늘·구름까지 함께 바뀌어야 화면과 규칙이 어긋나지 않는다
      return { key: wx.key, room: HLT.roomC() };
    },
    roomC() { return HLT.roomC(); },
    cleanClass(v) { return WX.cleanClass(v); },
    brag() { return bragText(); },
    coins(n) { if (n !== undefined) { state.coins = n; renderCoop(); } return state.coins; },
    buy(kind, id) { const it = SHOP.get(kind, id); if (!it) return 'no-item'; pickShop(it, owned(kind, id)); return { coins: state.coins, owned: state.owned[kind], farm: { coop: state.farm.coopSkin, ground: state.farm.ground, decos: state.farm.decos.length } }; },
    hatOn(name, id) { const b = birds.find((q) => q.d.name === name); if (!b) return null; shopBird = b; const it = SHOP.get('hat', id); if (it) pickShop(it, owned('hat', id)); return b.d.hat; },
    birdStats(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null;
      return { health: b.d.health, hunger: b.d.hunger, thirst: b.d.thirst, happy: b.d.happy, energy: b.d.energy, clean: b.d.clean, stress: b.d.stress, aff: b.d.aff }; },
    placements() { return JSON.parse(JSON.stringify(state.farm.placements)); },
    scenery() { return world.scenery; },
    sceneryToggle(name, on) { const p = world.scenery.parts[name]; if (p) p.visible = on; return p ? p.visible : null; },
    askGuide() { askGuide(); return true; },
    grannyButtons() { return [...document.querySelectorAll('#gBtns button')].map((b) => b.textContent); },
    clickGranny(i) { const b = document.querySelectorAll('#gBtns button')[i || 0]; if (!b) return false; b.click(); return true; },
    dexTry(name, anim) { const b = birds.find((q) => q.d.name === name); if (!b) return null; setAnim(b, anim, 5); b.animT = 0; return dexSpot(b); },
    dexClick(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null; touch(b); return dexCount(); },
    dexState() { return { count: dexCount(), total: DEX.LIST.length, ids: Object.keys(state.dex) }; },
    digAt(x, z, force) { return digAt(x, z, force); },
    digState() { return Object.assign({}, digToday(), { max: DIG_MAX, holding: !!digging, worm: !!worm, bucket: state.worms }); },
    clearWorm() { if (worm) removeWorm(); return !worm; },
    coinWays() { return coinWays(); },
    quizReady() { return QUIZ.READY; },
    quizAsk() { return askQuiz(true); },
    quizState() { return Object.assign({}, quizToday(), { done: quizToday().done.length }); },
    told() { return Object.assign({}, state.told); },
    tellOnce() { tellOnce(); return Object.assign({}, state.told); },
        cursor() { return { kind: curKind, css: canvas.style.cursor }; },
    setCursorKind(k) { setCur(k, true); return canvas.style.cursor; },
    peckHand() { handPecked(null, 0); return true; },
    plainCursor(on) { state.settings.plainCursor = !!on; setCur(curKind, true); return canvas.style.cursor; },
    openMenu(tab) { openPanel(tab || 'coop'); return !document.querySelector('#panel').classList.contains('hidden'); },
    closeMenu() { closePanel(); return true; },
    grannyOpen() { return !document.querySelector('#granny').classList.contains('hidden'); },
    grannyText() { const e = document.querySelector('#gSay'); return e ? e.textContent.trim() : ''; },
    onboarded() { return !!state.onboarded; },
    showProp(k, on) { state.settings.propHidden = Object.assign({}, state.settings.propHidden, { [k]: !on }); layoutHome(); return propVisible(k); },
    perchUp(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null; jumpToPerch(b); return true; },
    // 부리 끝이 화면 어디에 찍히는가 — 커서와 얼마나 떨어졌는지 재려고
    beakScreen(name) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      const m = b.b3 && b.b3.model; if (!m || !m.beakTip) return null;
      const w = m.beakTip(); const s2 = world.project(w.x, w.y, w.z);
      // tall = 그 닭의 키. 부리를 '얼마나 치켜들었나'는 키에 견주어야 뜻이 있다.
      return { x: Math.round(s2.x), y: Math.round(s2.y), wy: +w.y.toFixed(2), tall: +height(b).toFixed(2) };
    },
    dropFrom(name, h) { const b = birds.find((q) => q.d.name === name); if (!b) return null; b.y = h; b.vy = 0; b.carrying = false; setAnim(b, 'fall', 99); return true; },
    hurtOf(name) { const b = birds.find((q) => q.d.name === name); return b ? !!b.d.hurt : null; },
    clickProp(k) { propClick(k); return true; },
    // 품기 검사용
    addBird(stage, name) {
      const d = newBird(stage || 'hen', { name: name || ('검사' + birds.length) });
      state.flock.push(d);
      const rt = makeRuntime(d);
      rt.x = rand(world.xMin + 4, world.xMax - 4); rt.z = clampZ(rand(world.zMin + 5, world.zMax - 3));
      birds.push(rt); renderCoop();
      return d.name;
    },
    makeMom(momName, kidName) {
      const m = birds.find((q) => q.d.name === momName), k = birds.find((q) => q.d.name === kidName);
      if (!m || !k) return null;
      k.d.momId = m.d.id; m.d.children = (m.d.children || 0) + 1;
      return true;
    },
    hoverNow(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null; startHover(b); return !!b.hovering; },
    hoverState(name) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      return { hovering: !!b.hovering, tucked: !!b.tucked, anim: b.anim, comfort: b.comfort ? b.comfort.state : null };
    },
    feedAmounts() { return { a: Math.round(state.feed ?? 0), b: Math.round(state.feed2 ?? 0) }; },
    setFeedAmounts(a, b2) { state.feed = a; state.feed2 = b2; state.lastFeedRefill = 0; state.lastFeedRefill2 = 0; syncSupplies(); renderCoop(); return { a: Math.round(state.feed ?? 0), b: Math.round(state.feed2 ?? 0) }; },
    fillFeeder(k) { return fillFeeder(k); },
    cycleFeed(k) { cycleFeed(k); return { a: state.feedType, b: state.feedType2 }; },
    eggs() { return { basket: state.basket, coins: state.coins }; },
    setEggs(n) { state.basket = n; renderCoop(); return state.basket; },
    sellEggs() { return sellEggs(); },
    decideNow(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null; b.animT = 999; decide(b); return b.anim; },
    whistleAt(px, py) { return whistleAt(px, py); },
    cursorBored() { return CURSOR_BORED; },
    setFeed(a, b2) { state.feedType = a; if (b2) state.feedType2 = b2; renderCoop(); return { a: state.feedType, b: state.feedType2 }; },
    feederFor(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null; const f = feederFor(b); return f ? f.key : null; },
    // 먹는 순간만 떼어 내 부른다 (걸어가는 시간을 기다리지 않고 사료 판정을 보려고)
    feedNow(name) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      const f = feederFor(b); b.feederKey = f ? f.key : null;
      state.feed = 100; b.goal = 'eat'; setAnim(b, 'eat', 3);
      eatTick(b);
      return true;
    },
    // 제자리에 붙잡아 둔다 — 밀려나는지만 보려면 스스로 걸어가면 안 된다
    // 커서를 쪼려면 닭이 어디에 서야 하는가 (바닥 그림자가 아니라 그보다 앞)
    standFor(name) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      const st = cursorStand();
      const gp2 = cursorSpot;
      if (!st || !gp2) return null;
      return { stand: { x: +st.x.toFixed(2), z: +st.z.toFixed(2) }, ground: { x: +gp2.x.toFixed(2), z: +gp2.z.toFixed(2) } };
    },
    holdStill(name, secs) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      b.targetX = null; b.targetZ = null; b.callTarget = null; b.goal = null;
      setAnim(b, 'idle', secs || 6);
      return true;
    },
    // 닭이 소품 속에 박혀 있는가 — '통과한다'를 숫자로 재려고
    insideProp(name) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      const hm2 = home(); let worst = 0, which = '';
      for (const k of PROP_NAMES) {
        const r = PROP_SOLID[k]; if (!r || !propVisible(k)) continue;
        const L = hm2[k]; if (!L) continue;
        const d = Math.hypot(b.x - L.x, (b.z - L.z) * 1.35);
        const over = (r + height(b) * 0.16) - d;
        if (over > worst) { worst = over; which = k; }
      }
      return { over: +worst.toFixed(2), prop: which };
    },
    warmSpot() { const w = warmSpot(); return w ? { x: +w.x.toFixed(2), z: +w.z.toFixed(2) } : null; },
    setMouse(px, py) { mouse.x = px; mouse.y = py; mouse.movedAt = now(); return { x: mouse.x, y: mouse.y }; },
    peckNow(name) {
      const b = birds.find((q) => q.d.name === name); if (!b) return null;
      const st = cursorStand() || cursorSpot;
      if (st) faceDir(b, st.x > b.x ? 1 : -1);          // 게임에서도 쪼기 전에 커서 쪽으로 돌아선다
      setAnim(b, 'peckat', 6);
      return true;
    },
    perchState(name) { const b = birds.find((q) => q.d.name === name); if (!b) return null;
      return { onPerch: !!b.onPerch, y: +b.y.toFixed(2), anim: b.anim, perchY: window.TP_WORLD.PERCH_Y }; },
    gpuName() {
      try {
        const gl = world.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
      } catch (e) { return ''; }
    },
    movePropTo(k, x, z) { state.farm.placements[k] = { x, z }; layoutHome(); const p = world.props[k]; return p ? { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2) } : null; },
  };
  window.__tp = { runNeglect: () => { checkNeglect(); return birds.length; }, frozen: (n) => { const b = birds.find((q) => q.d.name === n); return b ? b.d.frozen : null; }, freezes: () => state.freezes, away: () => state.away.map((a) => a.name + ':' + (a.progress || 0)), album: () => state.album.length, journal: () => (state.journal || []).map((e) => e.kind + ':' + e.text + (e.photo ? ' [사진]' : '')), neglect: (name) => { const b = birds.find((q) => q.d.name === name); return b ? SCH.neglectedDays(b.d, state) : null; }, why: (n) => { const b = birds.find((q) => q.d.name === n); if (!b) return null; decide(b); return { choice: b.lastChoice, cands: b.lastCands }; }, lamp: (v) => { if (v !== undefined) { state.lampPower = v; world.setLamp(v); } return state.lampPower; }, comfort: () => birds.filter((q) => q.d.stage === 'chick').map((q) => ({ name: q.d.name, days: daysCared(q), st: q.comfort && q.comfort.state, need: q.comfort && +q.comfort.need.toFixed(1), act: q.comfort && +q.comfort.actual.toFixed(1) })), sickOf: (n) => { const b = birds.find((q) => q.d.name === n); return b ? b.d.sick : null; }, makeSick: (n, k) => { const b = birds.find((q) => q.d.name === n); if (b) { HLT.fallSick(b.d, k); return b.d.sick; } return null; }, poop: (n) => { for (let i = 0; i < (n || 1); i++) HYG.dropPoop(rand(world.xMin + 2, world.xMax - 2), rand(world.zMin + 2, world.zMax - 2), Math.random() < 0.15); markDirty(); return HYG.count(); }, poopCount: () => HYG.count(), amm: () => +(state.ammonia || 0).toFixed(1), setAmm: (v) => { state.ammonia = v; }, care: (name, what) => { const b = birds.find((q) => q.d.name === name); if (b) { careTick(b, what); return JSON.stringify(b.d.care); } return null; }, careOf: (name) => { const b = birds.find((q) => q.d.name === name); return b ? { care: b.d.care, days: daysCared(b), stage: b.d.stage } : null; }, at: (name) => { const b = birds.find((q) => q.d.name === name); if (!b) return null; const pt = world.project(b.x, 1, b.z); return { x: Math.round(pt.x), y: Math.round(pt.y) }; }, center: (name) => { const b = birds.find((q) => q.d.name === name); if (b) { b.x = (world.xMin + world.xMax) / 2; b.z = 0.5; } return !!b; }, hatch: (name) => { const b = birds.find((q) => q.d.name === name && q.d.stage === 'egg'); if (b) startHatching(b); return !!b; }, roof: () => { const r = birds.find((q) => q.d.stage === 'rooster'); if (r) { r.x = home().coop.x + 2.2; r.z = 1; goTo(r, home().coop.x, 'goroof'); return r.d.name; } return null; }, leave: () => { const r = birds.find((q) => q.d.onRoof); if (r) { leaveRoof(r); return r.d.name; } return null; }, set: (name, k, v) => { const b = birds.find((q) => q.d.name === name); if (b) b.d[k] = v; }, choices: () => birds.map((b) => b.d.name + ':' + (b.lastChoice || '-') + '/' + b.anim + ' v' + moodOf(b).valence.toFixed(2)), pick: (x, y) => world.pick(x, y), propPos: (k) => { const p = world.props[k]; return p ? { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), vis: p.visible } : null; }, settings: () => state.settings, spawnWorm: (px, py) => spawnWorm(px, py), moveWorm: (px, py) => { if (worm) { const sp = wormSpot(px, py); if (sp) { worm.x = sp.x; worm.z = sp.z; worm.y = HOLD_Y; } } }, releaseWorm: () => { if (worm) worm.held = false; }, whistle: () => $('#btnWhistle').click(), birds: () => birds.map((b) => ({ name: b.d.name, anim: b.anim, x: +b.x.toFixed(2), z: +b.z.toFixed(2), head: b.heading === undefined ? null : +b.heading.toFixed(2) })), grow: (n, s) => { const b = birds.find((q) => q.d.name === n); if (b) advance(b, s); return !!b; }, world: () => ({ xMin: +world.xMin.toFixed(2), xMax: +world.xMax.toFixed(2), zMin: +world.zMin.toFixed(2), zMax: +world.zMax.toFixed(2), roamTop: world.roamTop, px: world.pxPerUnit, W: world.W, H: world.H }), screenOf: (k) => { const p = world.props[k]; if (!p) return null; const s = world.project(p.position.x, 0.5, p.position.z); return { x: Math.round(s.x), y: Math.round(s.y), pctY: +(s.y / world.H * 100).toFixed(1) }; }, gpu: () => ({ geo: world.renderer.info.memory.geometries, tex: world.renderer.info.memory.textures, calls: world.renderer.info.render.calls }) };
  init();
})();
