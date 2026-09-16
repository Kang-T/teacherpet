// 티처펫 — 렌더러. 닭 한살이(알→병아리→어린닭→암탉/수탉) 시뮬레이션 + 교사 도구
(() => {
  const api = window.teacherpet;
  const THREE = window.THREE;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const now = () => Date.now();
  const today = () => new Date().toISOString().slice(0, 10);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => 'c' + now().toString(36) + Math.floor(Math.random() * 1000);

  // ---- 규칙 (한살이) ----
  const RULE = {
    maxFlock: 6,
    daysEgg: 3, daysChick: 7, daysYoung: 7, daysToOld: 60, daysToLeave: 90,
    feedPerMeal: 15, waterPerDrink: 12,
    refillCooldownMin: 60,
  };
  const PX_PER_UNIT = { 3: 24, 4: 33, 6: 50 }; // 크기 설정 → 3D 1유닛의 픽셀 수 (암탉 ≈ 2.85유닛)
  const STAGE_KO = { egg: '알', chick: '병아리', young: '어린닭', hen: '암탉', rooster: '수탉' };
  const NAMES = ['삐약이', '노랑이', '콩콩', '햇살', '보리', '구름', '달걀이', '방울', '초코', '땅콩', '꼬꼬', '모카', '레몬', '솜이', '토리', '봄이'];

  // ---- 상태 ----
  function defaultState() {
    return {
      version: 3,
      flock: [], basket: 0, coins: 0, album: [],
      feed: 60, water: 60, lastFeedRefill: 0, lastWaterRefill: 0, worms: 3, lastWormGift: '',
      settings: { size: 4, sound: true, classMin: 40, breakMin: 10, autoBreak: true, homeSide: 'left', lifeEnd: 'retire' },
      names: '', pickUsed: [], todos: [], lastAttend: '', lastCrow: '', lastSeen: now(),
    };
  }
  let state = defaultState();
  let dirty = false;
  const markDirty = () => { dirty = true; };
  async function persist() { state.lastSeen = now(); for (const b of birds) { b.d.x = toFrac(b.x); b.d.z = b.z; } await api.saveState(state); dirty = false; }
  setInterval(() => { if (dirty) persist(); }, 3000);
  setInterval(persist, 60000);

  // ---- 3D 무대 ----
  const world = window.TP_WORLD.create($('#stageHost'));
  const canvas = world.renderer.domElement;
  let W = innerWidth, H = innerHeight;
  const XMARGIN = 1.2; // 화면 가장자리 여유(유닛)
  function resize() {
    W = innerWidth; H = innerHeight;
    world.fit(W, H, PX_PER_UNIT[state.settings.size]);
    layoutHome();
    for (const b of birds) b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN);
  }
  addEventListener('resize', resize);
  // 닭장 세트 배치 (월드 유닛). 왼쪽 가장자리 기준, 오른쪽이면 거울
  const PROP_NAMES = ['coop', 'nest', 'feeder', 'waterer', 'basket', 'wormbucket', 'lamp'];
  function home() {
    const left = state.settings.homeSide === 'left';
    const bx = (d) => (left ? world.xMin + d : world.xMax - d);
    const def = {
      coop: { x: bx(3.0), z: -2.4 }, nest: { x: bx(7.0), z: -0.9 }, feeder: { x: bx(9.8), z: 0.5 },
      waterer: { x: bx(12.2), z: -0.5 }, basket: { x: bx(14.6), z: 0.7 }, wormbucket: { x: bx(16.8), z: 0.2 }, lamp: { x: bx(19.0), z: 0.3 },
    };
    const pos = state.settings.propPos || {}, hid = state.settings.propHidden || {};
    const out = { flip: !left };
    for (const k of PROP_NAMES) {
      const u = pos[k];
      out[k] = u ? { x: world.xMin + u.fx * (world.xMax - world.xMin), z: u.z } : def[k];
      out[k].visible = !hid[k];
    }
    return out;
  }
  const propVisible = (k) => !(state.settings.propHidden || {})[k];
  function warmSpot() { if (!propVisible('lamp')) return null; const L = home().lamp; const f = home().flip ? -1 : 1; return { x: L.x + 1.2 * f, z: L.z }; }
  function layoutHome() { world.setProps(home()); world.setSupplies(state.feed, state.water, state.basket); world.setWormCount(state.worms); }
  const toWorldX = (frac) => world.xMin + XMARGIN + frac * (world.xMax - world.xMin - XMARGIN * 2);
  const toFrac = (x) => clamp((x - world.xMin - XMARGIN) / (world.xMax - world.xMin - XMARGIN * 2), 0, 1);

  // ---- 닭 ----
  let birds = [];      // 런타임 객체 (d = 저장 데이터)
  let selectedId = null, hoverId = null, visible = true, mode = 'free';

  function newBird(stage, opts = {}) {
    return Object.assign({
      id: uid(), name: pick(NAMES), stage, sex: null, fertile: true, born: now(), stageSince: today(),
      careDays: [], hunger: 70, thirst: 70, happy: 70, aff: 50, trait: pick(Object.keys(TRAIT)), energy: 80, boredom: 20, social: 20, stress: 0, momId: null, eggsLaid: 0, lastLaid: '', brooding: null, x: rand(0.3, 0.8), old: false, pets: 0,
    }, opts);
  }
  function makeRuntime(d) {
    if (d.z === undefined) d.z = rand(-1.4, 1.4);
    if (d.aff === undefined) d.aff = 50;
    ensureNeeds(d);
    const b3 = world.addBird(d.id, d.stage);
    return { d, b3, x: toWorldX(d.x), z: d.z, dir: Math.random() < 0.5 ? 1 : -1, anim: d.stage === 'egg' ? 'egg' : 'idle', animT: 0, animDur: rand(2, 4),
      f: 0, y: 0, vy: 0, targetX: null, carrying: false, box: null, icon: null, iconUntil: 0, goal: null, inCoop: false, lastMeal: 0, lastDrink: 0,
      tagEl: null, iconEl: null, look: new THREE.Vector3(0, 2, 8), lookAt: 0 };
  }
  function disposeRuntime(b) { world.removeBird(b.d.id); if (b.tagEl) b.tagEl.remove(); if (b.iconEl) b.iconEl.remove(); }
  const SPEED = { egg: 0, chick: 1.6, young: 1.9, hen: 1.5, rooster: 1.8 };   // 유닛/초
  const SPECIAL = { chick: 'peck', young: 'flap', hen: 'peck', rooster: 'crow' };
  const spec = (b) => ({ speed: SPEED[b.d.stage] || 1.5, special: SPECIAL[b.d.stage] || 'peck' });
  const height = (b) => world.heightOf(b.b3);
  const isAdult = (b) => b.d.stage === 'hen' || b.d.stage === 'rooster';
  const hasRooster = () => birds.some((b) => b.d.stage === 'rooster');
  const POSE = { idle: 'idle', sit: 'idle', walk: 'walk', sleep: 'sleep', eat: 'eat', drink: 'lookup', jump: 'happy', happy: 'happy', fall: 'happy', carry: 'happy',
    sad: 'sad', egg: 'egg', gofeed: 'walk', gowater: 'walk', gocoop: 'walk', gonest: 'walk', peck: 'peck', flap: 'flap', brood: 'brood', crow: 'crow' };

  function setAnim(b, anim, dur) { b.anim = anim; b.animT = 0; b.animDur = dur; }
  function jump(b, v = 300) { setAnim(b, 'jump', 0.9); b.vy = v / 60; }   // 유닛/초
  function showIcon(b, icon, ms = 2500) { b.icon = icon; b.iconUntil = now() + ms; }
  function goTo(b, x, anim) { if (b.onRoof) { leaveRoof(b); return; } b.inCoop = false; setVisible(b, true); b.targetX = clamp(x, world.xMin + XMARGIN, world.xMax - XMARGIN); b.dir = b.targetX > b.x ? 1 : -1; setAnim(b, anim, 25); }
  function setVisible(b, v) { b.b3.holder.visible = v; }
  const GRAV = 22; // 유닛/초²
  // ---- 간식(벌레) · 부르기 ----
  let worm = null;   // { model, x, y, z, held, vy, bornAt }
  const eligible = (b) => b.d.stage !== 'egg' && !b.d.brooding && !b.carrying;
  const affect = (b, delta) => { b.d.aff = clamp(b.d.aff + delta, 0, 100); markDirty(); };
  // ===== MIND: 성격 · 욕구 · 기분 · 관계 (docs/설계_닭의_마음.md) =====
  const BASE = { approach: 1, flee: 1, affGain: 1, energy: 1, appetite: 1, curiosity: 1, sociable: 1, playful: 1, bold: 1, stubborn: 1, greedy: 1, tidy: 1, sleepy: 1, noisy: 1 };
  const TRAIT = {
    '호기심쟁이': { curiosity: 1.8, approach: 1.5 }, '겁쟁이': { flee: 1.9, bold: 0.4, affGain: 0.8 }, '장난꾸러기': { playful: 1.7, greedy: 1.3 }, '느긋이': { energy: 0.6, bold: 1.5 },
    '먹보': { appetite: 1.8, greedy: 1.8 }, '잠꾸러기': { sleepy: 1.8, energy: 0.7 }, '수다쟁이': { noisy: 1.9 }, '외톨이': { sociable: 0.4 },
    '대장': { bold: 1.6, stubborn: 1.4 }, '응석받이': { affGain: 1.6, approach: 1.4 }, '고집불통': { stubborn: 2.0 }, '부끄럼쟁이': { approach: 0.6, affGain: 1.2, flee: 1.2 },
    '모험가': { curiosity: 1.6, energy: 1.4 }, '깔끔이': { tidy: 2.0 }, '춤꾼': { playful: 1.5, energy: 1.3 }, '새침이': { affGain: 0.9, stubborn: 1.3 },
    '친절이': { sociable: 1.8 }, '왈가닥': { energy: 1.6, noisy: 1.4 }, '몽상가': { curiosity: 0.7, energy: 0.7 }, '개구쟁이': { playful: 1.8, bold: 1.3 },
  };
  const TRAIT_DESC = {
    '호기심쟁이': '커서와 새 물건에 먼저 다가가요', '겁쟁이': '작은 소리에도 도망가요. 친해지면 오래 가요', '장난꾸러기': '친구를 쫓고 벌레를 먼저 낚아채요', '느긋이': '뭐든 천천히, 잘 안 놀라요',
    '먹보': '모이통 옆이 집이에요', '잠꾸러기': '자주 졸고 오래 자요', '수다쟁이': '늘 재잘재잘, 수탉이면 자주 울어요', '외톨이': '혼자가 편해요',
    '대장': '모이통에서 안 비켜요', '응석받이': '쓰다듬어 달라고 졸라요', '고집불통': '불러도 잘 안 와요', '부끄럼쟁이': '힐끔 보고 물러나요. 친해지면 붙어 다녀요',
    '모험가': '화면 끝까지 멀리 산책해요', '깔끔이': '깃털을 자주 다듬어요', '춤꾼': '기분 좋으면 폴짝폴짝', '새침이': '좋아하다가도 획 돌아서요',
    '친절이': '다른 닭을 챙겨요', '왈가닥': '빠르고 시끄러워요', '몽상가': '멍하니 먼 곳을 봐요', '개구쟁이': '자는 친구를 깨우고 도망가요',
  };
  const TRAIT_NAMES = Object.keys(TRAIT);
  const LEGACY_TRAIT = { '호기심': '호기심쟁이', '장난꾸러기': '장난꾸러기', '겁쟁이': '겁쟁이', '느긋': '느긋이' };
  const trait = (b) => Object.assign({}, BASE, TRAIT[b.d.trait] || {});
  // 욕구 기본값 채우기
  function ensureNeeds(d) {
    if (d.energy === undefined) d.energy = 80;
    if (d.boredom === undefined) d.boredom = 20;
    if (d.social === undefined) d.social = 20;
    if (d.stress === undefined) d.stress = 0;
    if (d.momId === undefined) d.momId = null;
    if (LEGACY_TRAIT[d.trait]) d.trait = LEGACY_TRAIT[d.trait];
    if (!TRAIT[d.trait]) d.trait = pick(TRAIT_NAMES);
  }
  // 기분: 욕구·관계에서 계산
  function moodOf(b) {
    const d = b.d;
    const hungerDef = Math.max(0, 40 - d.hunger) / 40, thirstDef = Math.max(0, 40 - d.thirst) / 40;
    const valence = clamp((d.aff - 50) / 110 + (d.happy - 60) / 160 - hungerDef * 0.9 - thirstDef * 0.8 - d.stress / 100 - Math.max(0, d.social - 70) / 150 - Math.max(0, d.boredom - 80) / 200, -1, 1);
    const arousal = clamp(d.energy / 200 + d.stress / 150 + Math.max(0, 50 - d.boredom) / 300 + 0.15, 0, 1);
    return { valence, arousal, sleepy: clamp(1 - d.energy / 100, 0, 1) };
  }
  const RANK = { rooster: 3, hen: 2, young: 1, chick: 0, egg: -1 };
  const rank = (b) => RANK[b.d.stage] + (b.d.trait === '대장' ? 1 : 0);
  const isYoungling = (b) => b.d.stage === 'chick' || b.d.stage === 'young';
  const momOf = (b) => b.d.momId ? birds.find((h) => h.d.id === b.d.momId) || null : null;
  const kidsOf = (h) => birds.filter((k) => k.d.momId === h.d.id && isYoungling(k));
  const near = (a, c, r) => Math.abs(a.x - c.x) < r && Math.abs(a.z - c.z) < r;
  function chaseTarget(b) { if (worm && !(b.d.hunger > 95) && !((b.anim === 'sleep' || b.inCoop || b.anim === 'roost') && Math.abs(worm.x - b.x) > 2.5)) return { x: worm.x, z: worm.z, kind: 'worm' }; if (b.callTarget) { if (b.callTarget.follow) { const o = birds.find((q) => q.d.id === b.callTarget.follow); if (o) { b.callTarget.x = o.x; b.callTarget.z = o.z; } } return Object.assign({ kind: 'call' }, b.callTarget); } return null; }
  function spawnWorm(px, py) {
    if (state.worms <= 0) { toast('🪱 벌레가 없어요. 닭장 메뉴에서 달걀 코인으로 살 수 있어요'); return false; }
    if (worm) return false;
    state.worms -= 1; markDirty(); world.setWormCount(state.worms);
    const m = world.makeWorm(); world.scene.add(m.group);
    const gp = world.screenToPlaneZ(px, py, 1.2) || { x: 0, y: 1 };
    worm = { model: m, x: gp.x, y: Math.max(0.3, gp.y), z: 1.2, held: true, vy: 0, bornAt: now() };
    return true;
  }
  function removeWorm() { if (!worm) return; world.scene.remove(worm.model.group); worm = null; for (const b of birds) if (b.anim === 'chase' || b.anim === 'beg') decide(b); }
  function eatWorm(b) {
    removeWorm(); b.goal = 'treat'; setAnim(b, 'eat', 1.6); showIcon(b, '😋', 2000);
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
    add('eat', ((100 - d.hunger) / 100) ** 1.5 * 2.2 * T.appetite * (feedOk ? 1 : 0) * (mode === 'class' ? 0.3 : 1) * (d.stress > 60 ? 0.3 : 1), () => goTo(b, propVisible('feeder') ? hm.feeder.x + (hm.flip ? -1 : 1) * rand(1.1, 1.6) : b.x, 'gofeed'));
    add('drink', ((100 - d.thirst) / 100) ** 1.5 * 2.2 * (waterOk ? 1 : 0) * (mode === 'class' ? 0.3 : 1), () => goTo(b, propVisible('waterer') ? hm.waterer.x + (hm.flip ? -1 : 1) * rand(1.1, 1.5) : b.x, 'gowater'));
    const sleepGate = M.sleepy > 0.6 || mode === 'class' || (d.stage === 'chick' && M.sleepy > 0.45);
    add('sleep', (sleepGate ? (M.sleepy ** 2) * 2.6 * T.sleepy * (mode === 'class' ? 1.6 : 1) * (mode === 'break' ? 0.4 : 1) : 0) + (d.old && M.sleepy > 0.4 ? 0.3 : 0), () => {
      const ws = warmSpot();
      if (d.stage === 'chick' && ws && mode !== 'class') goTo(b, ws.x + rand(-0.9, 0.9), 'golamp-sleep');
      else if (mode !== 'class' && !b.inCoop && propVisible('coop') && !isYoungling(b) && Math.random() < 0.6) goTo(b, hm.coop.x + (hm.flip ? -1 : 1) * 0.3, 'gocoop');
      else if (mom && Math.random() < 0.6) goTo(b, mom.x + rand(-1.2, 1.2), 'gomom-sleep');
      else setAnim(b, 'sleep', rand(15, 35));
    });
    // 놀이 · 사회
    if (mode !== 'class' && d.stress < 50) {
      add('play', (d.boredom / 100) * 1.6 * T.playful * (d.energy / 100) * (mode === 'break' ? 2 : 1), () => {
        const f = friends.filter((o) => isYoungling(o) && o.anim !== 'sleep');
        if (f.length && Math.random() < 0.6) { const o = pick(f); b.playWith = o.d.id; b.callTarget = { x: o.x, z: o.z, follow: o.d.id }; setAnim(b, 'chase', 6); o.playFlee = b.d.id; if (o.anim === 'idle' || o.anim === 'walk') { goTo(o, o.x + (o.x > b.x ? 1 : -1) * rand(3, 6), 'walk'); o.fleeing = true; } }
        else if (Math.random() < 0.5) setAnim(b, 'flap', rand(1.5, 3)); else { goTo(b, b.x + (Math.random() < 0.5 ? -1 : 1) * rand(4, 9), 'walk'); b.fleeing = true; }
      });
      add('social', (d.social / 100) * 1.4 * T.sociable * (friends.length || mom ? 1 : 0) * (isYoungling(b) && mom ? 1.5 : 1), () => {
        const target = mom && Math.random() < 0.7 ? mom : pick(friends);
        if (target) goTo(b, target.x + (b.x < target.x ? -1 : 1) * rand(1.2, 2), 'walk');
      });
      // 어미 돌봄
      if (kids.length) add('care', 0.9 * T.sociable * (kids.some((k) => !near(k, b, 3)) ? 1 : 0.5), () => { const k = pick(kids); b.careKid = k.d.id; goTo(b, k.x + (b.x < k.x ? -1 : 1) * 1.1, 'gokid'); });
    }
    // 선생님(커서)
    if (gp && mode !== 'class') {
      add('approach', (d.aff / 100) * T.approach * T.curiosity * (cursorDist > 2 && cursorDist < 10 ? 1 : 0) * 0.9, () => { goTo(b, gp.x - Math.sign(gp.x - b.x) * 1.4, 'walk'); b.curious = true; });
      add('flee', ((100 - d.aff) / 100) * T.flee * (d.aff < 40 && cursorDist < 3.5 ? 1.6 : 0) * (1 - T.bold * 0.2), () => { goTo(b, b.x - Math.sign(gp.x - b.x || 1) * rand(3, 6), 'walk'); b.fleeing = true; showIcon(b, '💨', 1200); });
    }
    // 기본
    add('walk', 0.35 * T.curiosity * (d.energy / 100) * (mode === 'class' ? 0 : 1), () => goTo(b, b.x + rand(-1, 1) * rand(3, 10) * (d.old ? 0.6 : 1) * (T.curiosity > 1.4 ? 1.6 : 1), 'walk'));
    add('preen', 0.16 * T.tidy, () => setAnim(b, 'preen', rand(2.5, 4.5)));
    if (d.stage === 'chick' && warmSpot() && mode !== 'class') { const ws = warmSpot(); add('warm', (Math.abs(b.x - ws.x) > 1.6 ? 0.55 : 0.1) * (1 + M.sleepy), () => goTo(b, ws.x + rand(-0.9, 0.9), 'golamp')); }
    // 수탉: 지붕에 올라가 울기
    if (d.stage === 'rooster' && propVisible('coop') && mode !== 'class' && !b.onRoof) add('roof', 0.22 * T.noisy * T.bold, () => goTo(b, hm.coop.x, 'goroof'));
    if (b.onRoof) { add('crowroof', 0.6 * T.noisy, () => { setAnim(b, 'crow', 2.4); crowSound(); startleKids(b); }); add('roost', 0.5, () => setAnim(b, 'roost', rand(6, 14))); add('down', 0.35, () => leaveRoof(b)); }
    add('idle', mode === 'class' ? 1.2 : 0.3, () => setAnim(b, mode === 'class' ? 'sit' : 'idle', rand(2, 5)));
    // 기쁨 세기: 1(미소) → 2(폴짝·날개짓) → 3(신나서 뛰어다니기)
    const joy = M.valence > 0.25 ? (M.valence - 0.25) / 0.75 : 0;
    if (joy > 0) add('happy', (0.25 + joy * 0.9) * T.playful * (mode === 'break' ? 2 : 1), () => { if (joy > 0.65) burst(b, 'ecstatic'); else if (joy > 0.3) { setAnim(b, 'flap', 1.2); setTimeout(() => { if (b.anim === 'flap' || b.anim === 'idle') jump(b, 300); }, 900); } else jump(b, 240); });
    else if (mode === 'break') add('happy', 0.3 * T.playful, () => jump(b, 280));
    // 슬픔 세기: 1(처짐) → 2(눈물) → 3(주저앉아 엉엉 + 빙글)
    const grief = M.valence < -0.25 ? (-M.valence - 0.25) / 0.75 : 0;
    if (grief > 0 && d.stress < 70) add('grieve', 0.4 + grief * 0.9, () => { if (grief > 0.65) burst(b, 'wail'); else setAnim(b, 'sad', rand(3, 6)); });
    // 화남: 긴장 높고 친밀도 낮으면 발 구르기
    if (d.stress > 55 && d.aff < 45) add('stomp', 0.5 + d.stress / 200, () => setAnim(b, 'stomp', rand(1.5, 2.5)));
    if (d.stage === 'rooster') add('crow', 0.12 * T.noisy * (mode === 'class' ? 0 : 1), () => { setAnim(b, 'crow', 2.2); crowSound(); startleKids(b); });
    if (d.stage === 'chick' || d.stage === 'hen') add('peck', 0.25 * T.appetite * (mode === 'class' ? 0 : 1), () => setAnim(b, 'peck', rand(2, 4)));
    if (d.stage === 'young') add('flap', 0.2 * T.playful * (mode === 'class' ? 0 : 1), () => setAnim(b, 'flap', rand(1.5, 3)));
    if (d.hunger < 30 || d.thirst < 30) add('sad', 0.8, () => setAnim(b, 'sad', rand(3, 6)));
    // 소프트맥스 선택 (온도 0.35)
    const mx = Math.max(...cands.map((c) => c.score));
    const ws = cands.map((c) => Math.exp((c.score - mx) / 0.35));
    let r = Math.random() * ws.reduce((a, w) => a + w, 0), chosen = cands[0];
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { chosen = cands[i]; break; } }
    if (chosen) { b.lastChoice = chosen.name; chosen.run(); }
    if (!['sleep', 'gocoop', 'gomom-sleep'].includes(b.anim)) b.inCoop = false;
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
  function jumpToRoof(b) {
    const c = home().coop, h = world3dRoof(), vy = Math.sqrt(2 * GRAV * h) + 1.2;
    const dur = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * GRAV * h))) / GRAV;
    b.onRoof = true; leapTo(b, c.x, c.z, vy, dur); setAnim(b, 'jump', 2.2); showIcon(b, '⬆️', 900);
  }
  function leaveRoof(b) {
    const c = home().coop, h = world3dRoof(), vy = 2.2;
    const dur = (vy + Math.sqrt(vy * vy + 2 * GRAV * h)) / GRAV;
    b.onRoof = false; b.y = Math.max(b.y, h);
    const side = b.x > c.x ? 1 : -1;
    leapTo(b, clamp(c.x + side * rand(1.6, 2.4), world.xMin + XMARGIN, world.xMax - XMARGIN), clamp(c.z + rand(2.4, 3.0), -1.8, 1.8), vy, dur);
    setAnim(b, 'fall', 99); showIcon(b, '⬇️', 700);
  }
  // 수탉 울음 → 근처 새끼들이 놀란다
  function startleKids(r) {
    for (const k of birds) {
      if (!isYoungling(k) || !eligible(k) || Math.abs(k.x - r.x) > 8) continue;
      const T = trait(k); if (T.bold >= 1.5 || Math.random() < (T.bold - 0.4) * 0.4) continue;
      k.d.stress = clamp(k.d.stress + 25, 0, 100); k.inCoop = false; setVisible(k, true);
      setAnim(k, 'startle', 0.7); k.vy = 3; showIcon(k, '❗', 900);
      setTimeout(() => { if (k.anim === 'startle' || k.anim === 'idle') { goTo(k, k.x + (Math.sign(k.x - r.x) || 1) * rand(2, 4) * T.flee, 'walk'); k.fleeing = true; } }, 700);
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
      const playing = ['chase', 'beg', 'pet', 'flap', 'play', 'jump'].includes(b.anim);
      b.d.boredom = clamp(b.d.boredom + (playing ? -dt * 4 : sleeping ? 0 : dt * (100 / (3 * 3600)) * T.playful), 0, 100);
      const friendNear = birds.some((o) => o !== b && o.d.stage !== 'egg' && !o.inCoop && near(o, b, 2.2));
      b.d.social = clamp(b.d.social + (friendNear ? -dt * 1.5 : dt * (100 / (4 * 3600)) * T.sociable), 0, 100);
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
    // 감정 폭발 진행 (신남: 뛰어다니며 파닥 / 엉엉: 주저앉아 빙글빙글)
    if (b.anim === 'ecstatic') {
      b.burstT = (b.burstT || 0) + dt; b.dir = Math.sin(b.burstT * 2.2) > 0 ? 1 : -1;
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
      b.vy -= GRAV * dt; b.y += b.vy * dt;
      if (b.y <= gY && b.vy <= 0) {
        if (b.anim === 'fall' && b.vy < -6) b.d.stress = clamp(b.d.stress + 15, 0, 100);
        b.y = gY; b.vy = 0; b.b3.model.land();
        if (b.anim === 'fall' || b.anim === 'jump') setAnim(b, b.onRoof ? 'roost' : 'idle', rand(0.6, 1.5));
      }
    }
    if (b.anim === 'fall') return;
    // 겹침 방지: 가까운 닭끼리 서로 살짝 밀어낸다 (알·품는 닭 제외)
    if (b.d.stage !== 'egg' && !b.d.brooding && !b.inCoop && !b.onRoof && !b.leap) {
      for (const o of birds) {
        if (o === b || o.d.stage === 'egg' || o.inCoop || o.carrying || o.onRoof) continue;
        const dx = b.x - o.x, dz = b.z - o.z, minD = 0.55 * (height(b) + height(o)) * 0.55;
        const dist = Math.hypot(dx, dz * 1.6);
        if (dist < minD && dist > 0.001) { const push = (minD - dist) * dt * 2.2; b.x += (dx / dist) * push; b.z = clamp(b.z + (dz / dist) * push * 0.6, -1.8, 1.8); }
      }
      b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN);
    }
    // 벌레가 나타나면 하던 일을 멈추고 달려간다
    const tgt = chaseTarget(b);
    if (tgt && eligible(b) && !['chase', 'beg', 'eat'].includes(b.anim) && !(tgt.kind === 'call' && (b.anim === 'sleep' || b.inCoop) && b.d.aff < 60)) { b.inCoop = false; setVisible(b, true); b.targetX = null; if (b.onRoof) { leaveRoof(b); return; } setAnim(b, 'chase', 30); }
    if (b.anim === 'chase') {
      if (!tgt) { decide(b); return; }
      if (tgt.kind === 'worm') { // 반원으로 둘러싸도록 자리 배정
        const crowd = birds.filter((q) => q.anim === 'chase' || q.anim === 'beg'); const i = crowd.indexOf(b), n = Math.max(1, crowd.length);
        const ang = Math.PI * (0.15 + 0.7 * (n === 1 ? 0.5 : i / (n - 1)));
        tgt.x = worm.x + Math.cos(ang) * (1.6 + 0.55 * height(b)); tgt.z = worm.z - 0.3 - Math.sin(ang) * 1.7;
      }
      const dx = tgt.x - b.x, dist = Math.abs(dx), reach = tgt.kind === 'worm' ? 0.35 : 0.5;
      if (dist > reach) {
        b.dir = dx > 0 ? 1 : -1;
        b.x += b.dir * s.speed * 2.4 * (b.d.old ? 0.7 : 1) * dt;
        b.z += (tgt.z - b.z) * Math.min(1, dt * 2.5);
        if (Math.abs(b.x - tgt.x) < dist * 0.02) b.x = tgt.x;
      } else if (tgt.kind === 'worm') {
        if (!worm.held && worm.y <= 0.05) { eatWorm(b); return; }
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
    if (['gofeed', 'gowater', 'gocoop', 'gonest', 'walk', 'gokid', 'gomom-sleep', 'golamp', 'golamp-sleep', 'goroof'].includes(b.anim) && b.targetX !== null) {
      const speed = s.speed * (mode === 'break' ? 1.4 : 1) * (b.d.old ? 0.6 : 1) * (b.fleeing ? 2 : 1);
      b.dir = b.targetX > b.x ? 1 : -1;
      b.x += b.dir * speed * dt;
      if (Math.abs(b.targetX - b.x) < 0.08) {
        b.x = b.targetX; b.targetX = null;
        if (b.anim === 'gofeed') { b.goal = 'eat'; setAnim(b, 'eat', 3); }
        else if (b.anim === 'gowater') { b.goal = 'drink'; setAnim(b, 'drink', 2.5); }
        else if (b.anim === 'gocoop') { b.inCoop = true; setVisible(b, false); setAnim(b, 'sleep', rand(15, 30)); showIcon(b, '💤', 3000); }
        else if (b.anim === 'gonest') setAnim(b, 'brood', rand(8, 20));
        else if (b.anim === 'gokid') { const k = birds.find((q) => q.d.id === b.careKid); setAnim(b, 'nuzzle', 2.2); if (k) { showIcon(k, '❤️', 1500); k.d.stress = clamp(k.d.stress - 30, 0, 100); k.d.social = clamp(k.d.social - 30, 0, 100); if (k.anim === 'idle' || k.anim === 'walk') setAnim(k, 'pet', 2); } b.d.social = clamp(b.d.social - 20, 0, 100); }
        else if (b.anim === 'golamp') { b.z = clamp(home().lamp.z + rand(-0.6, 0.6), -2, 2); setAnim(b, Math.random() < 0.5 ? 'idle' : 'preen', rand(4, 9)); showIcon(b, '🔥', 1200); b.d.stress = clamp(b.d.stress - 10, 0, 100); }
        else if (b.anim === 'golamp-sleep') { b.z = clamp(home().lamp.z + rand(-0.6, 0.6), -2, 2); setAnim(b, 'sleep', rand(20, 40)); showIcon(b, '💤', 2000); }
        else if (b.anim === 'goroof') jumpToRoof(b);
        else if (b.anim === 'gomom-sleep') { setAnim(b, 'sleep', rand(15, 35)); const m = momOf(b); if (m && eligible(m) && (m.anim === 'idle' || m.anim === 'walk' || m.anim === 'preen')) { m.targetX = null; setAnim(m, 'brood', rand(15, 35)); } }
        else setAnim(b, 'idle', rand(1, 3));
        b.fleeing = false;
      }
      if (b.x < world.xMin + XMARGIN || b.x > world.xMax - XMARGIN) { b.x = clamp(b.x, world.xMin + XMARGIN, world.xMax - XMARGIN); b.dir *= -1; b.targetX = null; setAnim(b, 'idle', 1); }
    }
    b.animT += dt;
    if (b.animT >= b.animDur) {
      if (b.anim === 'eat' && b.goal === 'eat' && trait(b).stubborn < 1.4) {
        const boss = birds.find((o) => o !== b && rank(o) > rank(b) && (o.anim === 'gofeed' || o.anim === 'eat') && Math.abs(o.x - b.x) < 1.6);
        if (boss) { b.goal = null; showIcon(b, '😣', 1200); goTo(b, b.x + (Math.sign(b.x - boss.x) || 1) * rand(2, 3.5), 'walk'); b.d.stress = clamp(b.d.stress + 8, 0, 100); return; }
      }
      if (b.anim === 'eat' && b.goal === 'treat') {
        b.d.happy = clamp(b.d.happy + 15, 0, 100); b.d.hunger = clamp(b.d.hunger + 8, 0, 100); b.d.exp += 3; b.goal = null; affect(b, 6 * trait(b).affGain); careTick(b, 'ate'); markDirty(); renderCoop(); if (moodOf(b).valence > 0.55) burst(b, 'ecstatic'); else jump(b, 260); showIcon(b, '❤️', 1500);
      } else if (b.anim === 'eat' && b.goal === 'eat') {
        if (state.feed >= RULE.feedPerMeal) { state.feed -= RULE.feedPerMeal; world.setSupplies(state.feed, state.water, state.basket); b.d.hunger = clamp(b.d.hunger + 35, 0, 100); b.d.happy = clamp(b.d.happy + 5, 0, 100); b.lastMeal = now(); careTick(b, 'ate'); markDirty(); renderCoop(); }
        b.goal = null;
      } else if (b.anim === 'drink' && b.goal === 'drink') {
        if (state.water >= RULE.waterPerDrink) { state.water -= RULE.waterPerDrink; world.setSupplies(state.feed, state.water, state.basket); b.d.thirst = clamp(b.d.thirst + 40, 0, 100); b.lastDrink = now(); careTick(b, 'drank'); markDirty(); renderCoop(); }
        b.goal = null;
      }
      if (b.anim === 'sleep' && b.inCoop && Math.random() < 0.5) { setAnim(b, 'sleep', rand(15, 30)); return; }
      decide(b);
    }
  }

  // ---- 하루 단위 성장 규칙 ----
  // 하루에 먹고 마시면 그날이 '돌본 날'. 알은 품어진 날이 '돌본 날'.
  function careTick(b, what) {
    const d = today();
    b._care = b._care || {}; b._care[d] = b._care[d] || {}; b._care[d][what] = true;
    if (b._care[d].ate && b._care[d].drank && !b.d.careDays.includes(d)) { b.d.careDays.push(d); growCheck(b); layCheck(b); }
  }
  function broodTick(egg) { const d = today(); if (!egg.d.careDays.includes(d)) { egg.d.careDays.push(d); growCheck(egg); markDirty(); } }
  function daysCared(b) { return b.d.careDays.filter((d) => d >= b.d.stageSince).length; }
  function advance(b, stage) { b.d.stage = stage; b.d.stageSince = today(); b.d.careDays = []; world.setStage(b.b3, stage); b.anim = 'idle'; }
  function growCheck(b) {
    const n = daysCared(b);
    if (b.d.stage === 'egg' && n >= RULE.daysEgg) {
      if (b.hatching === undefined || b.hatching === null) startHatching(b);
    } else if (b.d.stage === 'chick' && n >= RULE.daysChick) {
      advance(b, 'young'); jump(b, 280); toast(`${b.d.name}(이)가 어린닭이 됐어요. 볏이 보이기 시작해요`, true, 7000); chime();
    } else if (b.d.stage === 'young' && n >= RULE.daysYoung) {
      const adults = birds.filter(isAdult);
      let sex = Math.random() < 0.5 ? 'f' : 'm';
      if (adults.length === 0) sex = 'f'; else if (adults.length === 1) sex = adults[0].d.sex === 'f' ? 'm' : 'f';
      b.d.sex = sex; advance(b, sex === 'f' ? 'hen' : 'rooster'); jump(b, 300);
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
  function farewell(b) {
    const natural = state.settings.lifeEnd === 'natural';
    state.album.push({ name: b.d.name, stage: STAGE_KO[b.d.stage], born: new Date(b.d.born).toISOString().slice(0, 10), left: today(), eggs: b.d.eggsLaid, children: b.d.children || 0, natural });
    disposeRuntime(b); birds = birds.filter((x) => x !== b); state.flock = state.flock.filter((x) => x.id !== b.d.id);
    toast(natural ? `🌿 ${b.d.name}(이)가 자연으로 돌아갔어요. 앨범에서 만나요` : `🚜 ${b.d.name}(이)가 농장으로 떠났어요. 앨범에서 만나요`, true, 12000);
    markDirty(); renderCoop();
  }
  // 암탉: 돌본 날 하루 1알
  function layCheck(hen) {
    if (hen.d.stage !== 'hen' || hen.d.old || hen.d.lastLaid === today()) return;
    hen.d.lastLaid = today(); hen.d.eggsLaid += 1; showIcon(hen, '🥚', 4000);
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
  function draw(dt) {
    const t = performance.now() / 1000;
    for (const b of birds) {
      const m = b.b3;
      m.holder.position.set(b.x, 0, b.z);
      // 시선: 커서가 최근에 움직였으면 커서를, 아니면 이따금 다른 곳을
      const moving = ['walk', 'gofeed', 'gowater', 'gocoop', 'gonest', 'chase', 'gokid', 'gomom-sleep', 'golamp', 'golamp-sleep', 'goroof'].includes(b.anim) ? 1 : 0;
      if (worm && (b.anim === 'chase' || b.anim === 'beg')) b.look.set(worm.x, worm.y + 0.3, worm.z);
      else if (moving) b.look.set(b.x + b.dir * 8, 1.4, b.z + 3);                  // 걸을 땐 앞을 본다
      else if (b.carrying) b.look.copy(world.pointAlongRay(mouse.x, mouse.y, 30));
      else if (now() - mouse.movedAt < 4000 && mouse.x >= 0) b.look.copy(world.pointAlongRay(mouse.x, mouse.y, 30));
      else if (t > b.lookAt) {
        b.lookAt = t + rand(2, 5);
        const kids = kidsOf(b), mom = momOf(b);
        if (kids.length && Math.random() < 0.5) { const k = pick(kids); b.look.set(k.x, 0.6, k.z); }
        else if (mom && Math.random() < 0.4) b.look.set(mom.x, 1.5, mom.z);
        else b.look.set(b.x + rand(-6, 6), rand(0.5, 4), rand(2, 10));
      }
      const anim = ['gofeed', 'gowater', 'gocoop', 'gonest', 'chase', 'gokid', 'gomom-sleep', 'golamp', 'golamp-sleep', 'goroof'].includes(b.anim) ? 'walk' : b.anim === 'sit' ? 'idle' : b.anim === 'fall' ? 'carry' : b.anim;
      m.model.update(dt, { anim, moving, dir: b.dir, jumpY: b.y, lookTarget: b.look, curious: mode !== 'class', wobble: b.f === 1, hatch: b.hatching || 0, speed: b.anim === 'chase' || b.fleeing ? 2.2 : 1, mood: b.d.stage === 'egg' ? null : moodOf(b) });
      if (b.f === 1 && b.d.stage === 'egg' && t > (b.wobbleUntil || 0)) b.f = 0;
      // 오버레이(아이콘·이름표) 위치
      const top = world.project(b.x, height(b) + b.y + 0.2, b.z);
      b.box = m.holder.visible ? { top: top.y, x: top.x } : null;
      const showIconNow = b.icon && now() < b.iconUntil && m.holder.visible;
      if (showIconNow) { if (!b.iconEl) { b.iconEl = document.createElement('div'); b.iconEl.className = 'icon'; overlay.appendChild(b.iconEl); } b.iconEl.textContent = b.icon; b.iconEl.style.left = top.x + 'px'; b.iconEl.style.top = (top.y - 4 + Math.sin(t * 4) * 2) + 'px'; b.iconEl.style.display = ''; }
      else if (b.iconEl) b.iconEl.style.display = 'none';
      const showTag = m.holder.visible && (hoverId === b.d.id || (selectedId === b.d.id && !panel.classList.contains('hidden')));
      if (showTag) { if (!b.tagEl) { b.tagEl = document.createElement('div'); b.tagEl.className = 'tag'; overlay.appendChild(b.tagEl); } b.tagEl.textContent = `${b.d.name} · ${STAGE_KO[b.d.stage]}${b.d.sex ? (b.d.sex === 'f' ? ' ♀' : ' ♂') : ''}`; b.tagEl.style.left = top.x + 'px'; b.tagEl.style.top = (top.y - (showIconNow ? 34 : 4)) + 'px'; b.tagEl.style.display = ''; }
      else if (b.tagEl) b.tagEl.style.display = 'none';
    }
    if (worm) {
      if (!worm.held) { if (worm.y > 0 || worm.vy > 0) { worm.vy -= GRAV * dt; worm.y += worm.vy * dt; if (worm.y <= 0) { worm.y = 0; worm.vy = 0; } } if (now() - worm.bornAt > 90000) removeWorm(); }
      if (worm) { worm.model.group.position.set(worm.x, worm.y + 0.12, worm.z); worm.model.update(dt); }
    }
    tickCuriosity(dt);
    if (visible) world.render();
  }
  // 커서가 바닥 근처에 잠시 머물면 가까운 닭 한 마리가 다가와 본다
  let curiousT = 0;
  function tickCuriosity(dt) {
    curiousT -= dt; if (curiousT > 0 || mode === 'class' || worm) return; curiousT = 0.7;
    const idle = now() - mouse.movedAt;
    if (mouse.x < 0 || idle < 1200 || idle > 5000 || mouse.y < H * 0.55) return;
    const gp = world.screenToGround(mouse.x, mouse.y); if (!gp) return;
    let best = null, bd = 7;
    for (const b of birds) { if (!eligible(b) || b.anim !== 'idle') continue; const d = Math.abs(b.x - gp.x); if (d > 1.8 && d < bd) { bd = d; best = b; } }
    if (best) { goTo(best, gp.x - Math.sign(gp.x - best.x) * 1.5, 'walk'); best.curious = true; }
  }

  let last = performance.now();
  let acc = 0;
  function loop(t) {
    const dt = Math.min(0.1, (t - last) / 1000); last = t; acc += dt;
    if (acc >= 1 / 32) { for (const b of birds) update(b, acc); draw(acc); acc = 0; }
    tickTimer(); requestAnimationFrame(loop);
  }

  // ---- 마우스 ----
  let ignoring = true;
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.setIgnoreMouse(v); } }
  function birdAt(x, y) { const h = world.pick(x, y); return h && h.type === 'bird' ? birds.find((b) => b.d.id === h.id) || null : null; }
  function propAt(x, y) { const h = world.pick(x, y); return h && h.type === 'prop' ? h.name : null; }
  const PROP_KO = { lamp: '보온등 — 병아리들이 따뜻한 불빛 아래 모여요', coop: '닭장 — 클릭하면 메뉴', nest: '둥지 — 클릭하면 알 품어주기', feeder: '모이통', waterer: '물통', basket: '달걀 바구니', wormbucket: '벌레통 — 끌어다 놓으면 닭들이 달려와요' };
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
      const eggs = birds.filter((b) => b.d.stage === 'egg' && !b.d.careDays.includes(today()));
      if (!eggs.length) { toast(birds.some((b) => b.d.stage === 'egg') ? '오늘은 이미 품어줬어요. 내일 또 만나요' : '둥지에 알이 없어요'); return; }
      for (const e of eggs) { broodTick(e); e.f = 1; e.wobbleUntil = performance.now() / 1000 + 1; showIcon(e, '✨'); }
      toast(`🤲 알 ${eggs.length}개를 따뜻하게 품어줬어요`); renderCoop();
    }
    else if (name === 'basket') { openPanel('coop'); toast(state.basket ? `🧺 달걀 ${state.basket}개가 모였어요` : '🧺 아직 달걀이 없어요'); }
    else if (name === 'coop') togglePanel();
  }
  function interactiveAt(x, y) { const el = document.elementFromPoint(x, y); if (el && el.closest && el.closest('.ui')) return true; return visible && !!world.pick(x, y); }
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
      if (drag.worm) { if (worm) { const p = world.screenToPlaneZ(e.clientX, e.clientY, 1.2); if (p) { worm.x = clamp(p.x, world.xMin + 0.5, world.xMax - 0.5); worm.y = Math.max(0.15, p.y); } } setIgnore(false); return; }
      if (drag.prop) { // 소품 옮기기
        const gp = world.screenToGround(e.clientX, e.clientY);
        if (gp && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) {
          drag.moved = true; state.settings.propPos = state.settings.propPos || {};
          state.settings.propPos[drag.prop] = { fx: clamp((gp.x - drag.offX - world.xMin) / (world.xMax - world.xMin), 0.01, 0.99), z: clamp(gp.z - drag.offZ, -3.2, 2.2) };
          layoutHome(); markDirty();
        }
        setIgnore(false); return;
      }
      // 닭 들어 올리기
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; drag.b.carrying = true; drag.b.inCoop = false; setVisible(drag.b, true); setAnim(drag.b, 'carry', 99); if (drag.b.d.aff < 40 && Math.random() < 0.5) showIcon(drag.b, '😣', 1500); }
      if (drag.moved) {
        const p = world.screenToPlaneZ(e.clientX, e.clientY, drag.b.z);
        if (p) { drag.b.x = clamp(p.x - drag.offX, world.xMin + XMARGIN, world.xMax - XMARGIN); drag.b.y = Math.max(0, p.y - height(drag.b) * 0.5); }
      }
      setIgnore(false); return;
    }
    mouse = { x: e.clientX, y: e.clientY, movedAt: now() };
    const hit = visible ? world.pick(e.clientX, e.clientY) : null;
    const b = hit && hit.type === 'bird' ? birds.find((q) => q.d.id === hit.id) : null;
    hoverId = b ? b.d.id : null;
    hoverProp = hit && hit.type === 'prop' ? hit.name : null;
    if (b && b.d.stage !== 'egg') rubTick(b, e.clientX); else if (rub.id && now() - rub.lastT > 400) rubEnd();
    if (hoverProp) { propTag.textContent = propLabel(hoverProp); propTag.style.display = ''; propTag.style.left = e.clientX + 'px'; propTag.style.top = (e.clientY - 14) + 'px'; }
    else propTag.style.display = 'none';
    const overUi = !!(document.elementFromPoint(e.clientX, e.clientY) || {}).closest?.('.ui');
    setIgnore(!(hit || overUi));
    canvas.style.cursor = b ? 'grab' : hoverProp ? 'pointer' : 'default';
  });
  setInterval(() => { if (rub.id && now() - rub.lastT > 700) rubEnd(); }, 300);
  canvas.addEventListener('mousedown', (e) => {
    const b = birdAt(e.clientX, e.clientY);
    if (e.button === 2) return;
    if (!b) {
      const pr = propAt(e.clientX, e.clientY);
      if (pr === 'wormbucket') { if (spawnWorm(e.clientX, e.clientY)) { drag = { worm: true, sx: e.clientX, sy: e.clientY }; canvas.style.cursor = 'grabbing'; } }
      else if (pr) { const gp = world.screenToGround(e.clientX, e.clientY), L = home()[pr]; drag = { prop: pr, sx: e.clientX, sy: e.clientY, offX: gp ? gp.x - L.x : 0, offZ: gp ? gp.z - L.z : 0, moved: false }; canvas.style.cursor = 'grabbing'; }
      else closePanel();
      return;
    }
    const p = world.screenToPlaneZ(e.clientX, e.clientY, b.z);
    drag = { b, offX: p ? p.x - b.x : 0, sx: e.clientX, sy: e.clientY, moved: false };
    canvas.style.cursor = 'grabbing';
  });
  addEventListener('mouseup', (e) => {
    if (!drag) return;
    if (drag.worm) { if (worm) worm.held = false; drag = null; canvas.style.cursor = 'default'; setIgnore(!interactiveAt(e.clientX, e.clientY)); return; }
    if (drag.prop) { if (!drag.moved) propClick(drag.prop); else toast('📦 자리를 옮겼어요 (설정에서 초기화 가능)'); drag = null; canvas.style.cursor = 'pointer'; setIgnore(!interactiveAt(e.clientX, e.clientY)); return; }
    const b = drag.b;
    if (drag.moved) { b.carrying = false; b.d.x = toFrac(b.x); b.targetX = null; if (b.y > 0) { setAnim(b, 'fall', 99); b.vy = 0; } else decide(b); markDirty(); }
    else touch(b);
    drag = null; canvas.style.cursor = 'grab'; setIgnore(!interactiveAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const b = birdAt(e.clientX, e.clientY); if (!b || b.d.stage === 'egg') return;
    scold(b);
  });
  function scold(b) {
    b.inCoop = false; setVisible(b, true); b.targetX = null; b.callTarget = null;
    affect(b, -6 * trait(b).flee); b.d.happy = clamp(b.d.happy - 4, 10, 100); b.d.stress = clamp(b.d.stress + 40, 0, 100);
    setAnim(b, 'scold', 0.9); b.vy = 2.5; showIcon(b, '💢', 900);
    b.scolds = (b.scolds || 0) + 1; setTimeout(() => { b.scolds = Math.max(0, (b.scolds || 1) - 1); }, 60000);
    if (b.scolds >= 3) { setTimeout(() => burst(b, 'wail'), 1000); return; }
    setTimeout(() => { if (b.anim === 'scold' || b.anim === 'idle') { showIcon(b, pick(['😢', '😳', '🥺']), 2200); const away = mouse.x >= 0 ? Math.sign(b.x - (world.screenToGround(mouse.x, mouse.y) || { x: b.x }).x) || 1 : b.dir; goTo(b, b.x + away * rand(3, 6) * trait(b).flee, 'walk'); b.fleeing = true; } }, 900);
    renderCoop();
  }
  canvas.addEventListener('dblclick', (e) => {
    const b = birdAt(e.clientX, e.clientY);
    if (b) { selectedId = b.d.id; if (b.d.stage === 'egg') { openPanel('coop'); return; } showIcon(b, '📣', 2000); const n = callFlock(b.x, b.z, b); toast(n ? `📣 ${b.d.name}(이)가 친구들을 불렀어요` : `📣 ${b.d.name}: 올 친구가 없네요`); }
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePanel(); $('#albumModal').classList.add('hidden'); } });
  function touch(b) {
    selectedId = b.d.id;
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
  function pipSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; for (let i = 0; i < 3; i++) tone(1400, 900, t + i * 0.13, 0.06, 'square', 0.07); } catch (_) {} }
  function peepSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; [880, 1180, 980, 1320].forEach((f, i) => tone(f, f * 1.15, t + i * 0.16, 0.13, 'sine', 0.13)); } catch (_) {} }
  function crowSound() { if (!state.settings.sound) return; try { const t = ac().currentTime; tone(520, 620, t, 0.18, 'sawtooth', 0.12); tone(700, 760, t + 0.2, 0.18, 'sawtooth', 0.12); tone(880, 980, t + 0.4, 0.35, 'sawtooth', 0.14); tone(760, 520, t + 0.78, 0.5, 'sawtooth', 0.1); } catch (_) {} }
  function morningCrow() {
    const r = birds.find((b) => b.d.stage === 'rooster');
    if (!r || state.lastCrow === today()) return;
    state.lastCrow = today(); setAnim(r, 'crow', 2.5); crowSound(); toast('🐓 꼬끼오! 좋은 아침이에요', true, 6000); markDirty();
  }

  // ---- 타이머 / 집중 모드 ----
  let timer = null; const pill = $('#timerPill');
  function startTimer(kind) {
    const min = kind === 'class' ? state.settings.classMin : state.settings.breakMin;
    timer = { kind, endsAt: now() + min * 60000 }; mode = kind;
    pill.classList.remove('hidden', 'class', 'break', 'ending'); pill.classList.add(kind);
    $('#timerKind').textContent = kind === 'class' ? '수업' : '쉬는 시간';
    for (const b of birds) { if (b.d.stage === 'egg') continue; b.inCoop = false; b.targetX = null; if (kind === 'class') setAnim(b, 'sit', rand(3, 6)); else if (!b.d.brooding) jump(b, 300); }
    if (kind === 'break') { const r = birds.find((b) => b.d.stage === 'rooster'); if (r) { setAnim(r, 'crow', 2.5); crowSound(); } }
    toast(kind === 'class' ? '📚 수업 시작 — 닭들이 조용히 앉아요' : '☕ 쉬는 시간!', false, 4000);
    renderTimerTab();
  }
  function stopTimer(silent) { timer = null; mode = 'free'; pill.classList.add('hidden'); if (!silent) for (const b of birds) if (b.d.stage !== 'egg') decide(b); renderTimerTab(); }
  let lastTickSec = -1;
  function tickTimer() {
    if (!timer) return;
    const left = timer.endsAt - now(), sec = Math.max(0, Math.ceil(left / 1000));
    if (sec !== lastTickSec) { lastTickSec = sec; const txt = fmt(sec); $('#timerLeft').textContent = txt; $('#timerBig').textContent = txt; pill.classList.toggle('ending', sec <= 60 && sec > 0); }
    if (left <= 0) {
      const wasClass = timer.kind === 'class'; chime();
      if (wasClass && state.settings.autoBreak) startTimer('break');
      else { stopTimer(true); toast(wasClass ? '수업 끝! 잘하셨어요' : '쉬는 시간 끝, 자리로!', true, 6000); for (const b of birds) if (b.d.stage !== 'egg' && !b.d.brooding) jump(b, 300); }
    }
  }
  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  function renderTimerTab() {
    $('#timerBig').textContent = timer ? fmt(Math.max(0, Math.ceil((timer.endsAt - now()) / 1000))) : fmt(state.settings.classMin * 60);
    $('#classMin').value = state.settings.classMin; $('#breakMin').value = state.settings.breakMin; $('#autoBreak').checked = state.settings.autoBreak;
  }

  // ---- 패널 ----
  const panel = $('#panel');
  function openPanel(tab) { panel.classList.remove('hidden'); if (tab) showTab(tab); renderCoop(); renderTimerTab(); renderTodos(); renderSettings(); }
  function closePanel() { panel.classList.add('hidden'); }
  function togglePanel() { panel.classList.contains('hidden') ? openPanel() : closePanel(); }
  function showTab(name) { $$('.tabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name)); $$('section.tab').forEach((s) => s.classList.toggle('active', s.dataset.tab === name)); }
  $$('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#closePanel').addEventListener('click', closePanel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderCoop() {
    if (panel.classList.contains('hidden')) return;
    $('#feedBar').style.width = state.feed + '%'; $('#waterBar').style.width = state.water + '%';
    $('#basketCount').textContent = state.basket; $('#coinCount').textContent = state.coins; $('#wormCount').textContent = state.worms;
    const fl = Math.max(0, RULE.refillCooldownMin * 60000 - (now() - state.lastFeedRefill)), wl = Math.max(0, RULE.refillCooldownMin * 60000 - (now() - state.lastWaterRefill));
    $('#btnFeed').textContent = fl ? `${Math.ceil(fl / 60000)}분 후` : '채우기'; $('#btnWater').textContent = wl ? `${Math.ceil(wl / 60000)}분 후` : '채우기';
    const box = $('#flockList'); box.innerHTML = '';
    $('#starterBox').classList.toggle('hidden', birds.length > 0);
    const order = { rooster: 0, hen: 1, young: 2, chick: 3, egg: 4 };
    for (const b of birds.slice().sort((a, c) => order[a.d.stage] - order[c.d.stage])) {
      const need = { egg: RULE.daysEgg, chick: RULE.daysChick, young: RULE.daysYoung }[b.d.stage];
      const n = daysCared(b);
      const card = document.createElement('div'); card.className = 'petCard' + (selectedId === b.d.id ? ' selected' : '');
      const days = Math.max(1, Math.ceil((now() - b.d.born) / 86400000));
      const broodedToday = b.d.stage === 'egg' && b.d.careDays.includes(today());
      card.innerHTML = `
        <div class="head"><span class="name">${esc(b.d.name)}</span>
          <span class="sex ${b.d.sex || ''}">${STAGE_KO[b.d.stage]}${b.d.sex ? (b.d.sex === 'f' ? ' ♀' : ' ♂') : ''}${b.d.old ? ' · 노년' : ''}</span>
          <span class="stage">${days}일째 · ${b.d.trait}${b.d.stage === 'hen' ? ` · 알 ${b.d.eggsLaid}개` : ''}${b.d.brooding ? ' · 품는 중' : ''}</span></div>
        ${need ? `<div class="stat"><b>${b.d.stage === 'egg' ? '부화' : '성장'}</b><div class="bar exp"><i style="width:${Math.min(100, n / need * 100)}%"></i></div><span>${n}/${need}일</span></div>` : ''}
        ${b.d.stage !== 'egg' ? `<div class="stat"><b>배부름</b><div class="bar"><i style="width:${b.d.hunger}%"></i></div></div><div class="stat"><b>물</b><div class="bar water"><i style="width:${b.d.thirst}%"></i></div></div><div class="stat"><b>에너지</b><div class="bar exp"><i style="width:${b.d.energy}%"></i></div></div><div class="stat"><b>친밀도</b><div class="bar happy"><i style="width:${b.d.aff}%"></i></div><span>${b.d.aff >= 70 ? '❤️ 좋아함' : b.d.aff < 30 ? '😒 서먹함' : '🙂 보통'}</span></div><div class="hint">${b.d.trait} — ${TRAIT_DESC[b.d.trait] || ''}${b.d.momId ? ` · 엄마: ${(birds.find((h) => h.d.id === b.d.momId) || {}).d?.name || '떠남'}` : ''}${b.d.stress > 50 ? ' · 😰 긴장' : ''}${b.d.boredom > 70 ? ' · 🥱 심심' : ''}</div>` : ''}
        <div class="actions">
          ${b.d.stage === 'egg' ? `<button class="small primary" data-act="brood" ${broodedToday ? 'disabled' : ''}>🤲 ${broodedToday ? '오늘 품었어요' : '품어주기'}</button>` : ''}
          <button class="small" data-act="rename">✏️ 이름</button><button class="small" data-act="find">📍 찾기</button><button class="small danger" data-act="release">농장으로 보내기</button>
        </div>`;
      card.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act; selectedId = b.d.id;
        if (act === 'brood') { broodTick(b); b.f = 1; b.wobbleUntil = performance.now() / 1000 + 1; setAnim(b, 'egg', 1.5); showIcon(b, '✨'); }
        else if (act === 'rename') { const nm = prompt('새 이름을 정해 주세요', b.d.name); if (nm && nm.trim()) { b.d.name = nm.trim().slice(0, 12); markDirty(); } }
        else if (act === 'find') { b.x = (world.xMin + world.xMax) / 2; b.d.x = 0.5; b.inCoop = false; setVisible(b, true); if (b.d.stage !== 'egg') jump(b, 300); hoverId = b.d.id; setTimeout(() => { if (hoverId === b.d.id) hoverId = null; }, 3000); }
        else if (act === 'release') { if (e.target.dataset.confirm) farewell(b); else { e.target.dataset.confirm = '1'; e.target.textContent = '정말요? 한 번 더'; return; } }
        renderCoop();
      });
      box.appendChild(card);
    }
    const hens = birds.filter((b) => b.d.stage === 'hen').length;
    $('#coopHint').textContent = birds.length >= RULE.maxFlock ? '닭장이 꽉 찼어요 (6마리). 새 알은 바구니로 가요.' : hens && !hasRooster() ? '수탉이 없어서 지금 낳는 알은 부화하지 않아요.' : '';
  }
  $('#btnFeed').addEventListener('click', () => { if (now() - state.lastFeedRefill < RULE.refillCooldownMin * 60000) return; state.feed = 100; state.lastFeedRefill = now(); markDirty(); renderCoop(); world.setSupplies(state.feed, state.water, state.basket); toast('🌾 모이통을 채웠어요'); for (const b of birds) if (b.d.stage !== 'egg' && b.d.hunger < 70 && !b.d.brooding) decide(b); });
  $('#btnWater').addEventListener('click', () => { if (now() - state.lastWaterRefill < RULE.refillCooldownMin * 60000) return; state.water = 100; state.lastWaterRefill = now(); markDirty(); renderCoop(); world.setSupplies(state.feed, state.water, state.basket); toast('💧 물통을 채웠어요'); });
  $('#btnStarter').addEventListener('click', () => {
    const hm = home();
    for (let i = 0; i < 2; i++) { const d = newBird('egg', { name: NAMES[i], x: toFrac(hm.nest.x + (i ? 0.45 : -0.35)), z: hm.nest.z + (i ? 0.3 : -0.2) }); state.flock.push(d); const rt = makeRuntime(d); rt.x = hm.nest.x + (i ? 0.45 : -0.35); birds.push(rt); }
    toast('🥚 알 두 개가 둥지에 도착했어요. 매일 품어주면 3일 뒤 태어나요', true, 8000); markDirty(); renderCoop();
  });
  $('#btnBuyWorm').addEventListener('click', () => { if (state.coins < 1) { toast('🪙 코인이 부족해요. 암탉이 낳은 달걀이 코인이 돼요'); return; } state.coins -= 1; state.worms += 1; markDirty(); world.setWormCount(state.worms); renderCoop(); toast('🪱 벌레 한 마리를 샀어요'); });
  $('#btnWhistle').addEventListener('click', () => { const gp = mouse.x >= 0 ? world.screenToGround(mouse.x, mouse.y) : null; const x = gp ? clamp(gp.x, world.xMin + 2, world.xMax - 2) : (world.xMin + world.xMax) / 2; const n = callFlock(x, 0.5, null); toast(n ? '🎵 휘익~ 닭들이 달려와요' : '🎵 부를 닭이 없어요'); closePanel(); });
  $('#btnAlbum').addEventListener('click', () => {
    const list = $('#albumList'); list.innerHTML = state.album.length ? '' : '<p class="hint">아직 기록이 없어요.</p>';
    for (const a of state.album.slice().reverse()) { const el = document.createElement('div'); el.className = 'albumItem'; el.innerHTML = `<b>${esc(a.name)}</b> (${a.stage}) · ${a.born} ~ ${a.left}<br>낳은 알 ${a.eggs}개 · 자손 ${a.children}마리 · ${a.natural ? '자연으로' : '농장으로'}`; list.appendChild(el); }
    $('#albumModal').classList.remove('hidden');
  });
  $('#closeAlbum').addEventListener('click', () => $('#albumModal').classList.add('hidden'));

  // 타이머 탭
  $('#btnClass').addEventListener('click', () => startTimer('class'));
  $('#btnBreak').addEventListener('click', () => startTimer('break'));
  $('#btnStop').addEventListener('click', () => stopTimer());
  $('#classMin').addEventListener('change', (e) => { state.settings.classMin = clamp(+e.target.value || 40, 1, 180); markDirty(); renderTimerTab(); });
  $('#breakMin').addEventListener('change', (e) => { state.settings.breakMin = clamp(+e.target.value || 10, 1, 60); markDirty(); renderTimerTab(); });
  $('#autoBreak').addEventListener('change', (e) => { state.settings.autoBreak = e.target.checked; markDirty(); });
  pill.addEventListener('click', () => openPanel('timer'));

  // 뽑기 탭
  const namesEl = $('#names');
  namesEl.addEventListener('input', () => { state.names = namesEl.value; markDirty(); renderPickInfo(); });
  const nameList = () => state.names.split('\n').map((s) => s.trim()).filter(Boolean);
  function renderPickInfo() { const all = nameList(), left = all.filter((n) => !state.pickUsed.includes(n)); $('#pickInfo').textContent = all.length ? `전체 ${all.length}명 · 아직 안 뽑힌 ${left.length}명` : ''; }
  let picking = false;
  $('#btnPick').addEventListener('click', () => {
    if (picking) return;
    const all = nameList(), exclude = $('#pickExclude').checked;
    let pool = exclude ? all.filter((n) => !state.pickUsed.includes(n)) : all.slice();
    const n = clamp(+$('#pickCount').value || 1, 1, 10);
    if (!all.length) { $('#pickResult').textContent = '이름을 먼저 적어 주세요'; return; }
    if (pool.length < n) { if (exclude) { state.pickUsed = []; pool = all.slice(); } if (pool.length < n) { $('#pickResult').textContent = '사람이 부족해요'; return; } }
    picking = true; const res = $('#pickResult'); let ticks = 0;
    const iv = setInterval(() => {
      res.textContent = pick(pool);
      if (++ticks > 18) {
        clearInterval(iv); const chosen = [], tmp = pool.slice();
        for (let i = 0; i < n; i++) { const k = Math.floor(Math.random() * tmp.length); chosen.push(tmp.splice(k, 1)[0]); }
        res.textContent = chosen.join(', '); if (exclude) state.pickUsed.push(...chosen);
        markDirty(); renderPickInfo(); picking = false;
        toast('🎲 ' + chosen.join(', '), true, 6000); for (const b of birds) if (b.d.stage !== 'egg' && !b.d.brooding) jump(b, 300);
      }
    }, 80);
  });
  $('#btnPickReset').addEventListener('click', () => { state.pickUsed = []; markDirty(); renderPickInfo(); $('#pickResult').textContent = ''; });

  // 할 일 탭
  function renderTodos() {
    const ul = $('#todoList'); ul.innerHTML = '';
    state.todos.forEach((t, i) => {
      const li = document.createElement('li'); li.className = t.done ? 'done' : '';
      li.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span><button class="small" data-del>삭제</button>`;
      li.querySelector('input').addEventListener('change', (e) => { t.done = e.target.checked; markDirty(); renderTodos(); if (t.done) toast('✅ ' + t.text); });
      li.querySelector('[data-del]').addEventListener('click', () => { state.todos.splice(i, 1); markDirty(); renderTodos(); });
      ul.appendChild(li);
    });
  }
  function addTodo() { const v = $('#todoInput').value.trim(); if (!v) return; state.todos.push({ text: v, done: false }); $('#todoInput').value = ''; markDirty(); renderTodos(); }
  $('#btnTodoAdd').addEventListener('click', addTodo);
  $('#todoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

  // 설정 탭
  function renderSettings() {
    $('#soundOn').checked = state.settings.sound;
    $$('[data-prop]').forEach((c) => { c.checked = propVisible(c.dataset.prop); });
    $$('[data-size]').forEach((b) => b.classList.toggle('primary', +b.dataset.size === state.settings.size));
    $$('[data-home]').forEach((b) => b.classList.toggle('primary', b.dataset.home === state.settings.homeSide));
    $$('[data-lifeend]').forEach((b) => b.classList.toggle('primary', b.dataset.lifeend === state.settings.lifeEnd));
  }
  $$('[data-size]').forEach((b) => b.addEventListener('click', () => { state.settings.size = +b.dataset.size; markDirty(); renderSettings(); resize(); }));
  $$('[data-prop]').forEach((c) => c.addEventListener('change', () => { state.settings.propHidden = state.settings.propHidden || {}; state.settings.propHidden[c.dataset.prop] = !c.checked; markDirty(); layoutHome(); }));
  $('#btnResetProps').addEventListener('click', () => { state.settings.propPos = {}; markDirty(); layoutHome(); toast('소품 배치를 처음으로 되돌렸어요'); });
  $$('[data-home]').forEach((b) => b.addEventListener('click', () => { state.settings.homeSide = b.dataset.home; markDirty(); renderSettings(); layoutHome(); }));
  $$('[data-lifeend]').forEach((b) => b.addEventListener('click', () => { state.settings.lifeEnd = b.dataset.lifeend; markDirty(); renderSettings(); }));
  $('#soundOn').addEventListener('change', (e) => { state.settings.sound = e.target.checked; markDirty(); if (e.target.checked) chime(); });
  $('#autostart').addEventListener('change', (e) => api.setAutostart(e.target.checked));
  $('#btnQuit').addEventListener('click', async () => { await persist(); api.quit(); });

  api.on('ui:toggle-menu', togglePanel);
  api.on('timer:start', (k) => startTimer(k));
  api.on('timer:stop', () => stopTimer());
  api.on('pet:size', (s) => { state.settings.size = s; markDirty(); resize(); });
  api.on('pet:toggle-visible', () => { visible = !visible; canvas.style.display = visible ? '' : 'none'; overlay.style.display = visible ? '' : 'none'; });
  api.on('work-area', () => setTimeout(resize, 50));

  // ---- 시작 ----
  async function init() {
    const saved = await api.loadState();
    if (saved && saved.version === 3) { state = Object.assign(defaultState(), saved); state.settings = Object.assign(defaultState().settings, saved.settings || {}); }
    // 자리 비운 시간만큼 배고픔·목마름 (시간당 4, 최대 40)
    const loss = Math.min(40, Math.max(0, now() - (state.lastSeen || now())) / 3600000 * 4);
    for (const d of state.flock) { ensureNeeds(d); d.hunger = clamp(d.hunger - loss, 15, 100); d.thirst = clamp(d.thirst - loss, 15, 100); d.energy = clamp(d.energy + loss * 1.5, 0, 100); d.stress = 0; }
    resize();
    birds = state.flock.map(makeRuntime);
    world.setSupplies(state.feed, state.water, state.basket);
    const info = await api.info();
    $('#version').textContent = 'v' + info.version; $('#autostart').checked = !!info.openAtLogin;
    namesEl.value = state.names; renderPickInfo();
    if (!birds.length) openPanel('coop');
    if (state.lastAttend !== today()) { state.lastAttend = today(); markDirty(); }
    if (state.lastWormGift !== today()) { state.lastWormGift = today(); state.worms = Math.min(9, (state.worms || 0) + 3); world.setWormCount(state.worms); markDirty(); if (birds.length) setTimeout(() => toast('🪱 오늘의 벌레 3마리가 벌레통에 도착했어요'), 4000); }
    for (const b of birds) decide(b);
    setTimeout(morningCrow, 2500);
    setTimeout(() => { const fans = birds.filter((b) => eligible(b) && b.d.aff >= 70); if (fans.length) { const cx = (world.xMin + world.xMax) / 2; for (const b of fans) { b.callTarget = { x: cx + rand(-2, 2), z: rand(-0.5, 1) }; setAnim(b, 'chase', 30); } toast('❤️ 닭들이 선생님을 반기러 달려와요'); } }, 1800);
    requestAnimationFrame(loop);
  }
  // 디버그 훅 (자동 캡처용)
  window.__tp = { at: (name) => { const b = birds.find((q) => q.d.name === name); if (!b) return null; const pt = world.project(b.x, 1, b.z); return { x: Math.round(pt.x), y: Math.round(pt.y) }; }, center: (name) => { const b = birds.find((q) => q.d.name === name); if (b) { b.x = (world.xMin + world.xMax) / 2; b.z = 0.5; } return !!b; }, hatch: (name) => { const b = birds.find((q) => q.d.name === name && q.d.stage === 'egg'); if (b) startHatching(b); return !!b; }, roof: () => { const r = birds.find((q) => q.d.stage === 'rooster'); if (r) { r.x = home().coop.x + 2.2; r.z = 1; goTo(r, home().coop.x, 'goroof'); return r.d.name; } return null; }, leave: () => { const r = birds.find((q) => q.d.onRoof); if (r) { leaveRoof(r); return r.d.name; } return null; }, set: (name, k, v) => { const b = birds.find((q) => q.d.name === name); if (b) b.d[k] = v; }, choices: () => birds.map((b) => b.d.name + ':' + (b.lastChoice || '-') + '/' + b.anim + ' v' + moodOf(b).valence.toFixed(2)), pick: (x, y) => world.pick(x, y), propPos: (k) => { const p = world.props[k]; return p ? { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), vis: p.visible } : null; }, settings: () => state.settings, spawnWorm: (px, py) => spawnWorm(px, py), moveWorm: (px, py) => { if (worm) { const p = world.screenToPlaneZ(px, py, 1.2); if (p) { worm.x = p.x; worm.y = Math.max(0.15, p.y); } } }, releaseWorm: () => { if (worm) worm.held = false; }, whistle: () => $('#btnWhistle').click(), birds: () => birds.map((b) => ({ name: b.d.name, anim: b.anim, x: +b.x.toFixed(1) })) };
  init();
})();
