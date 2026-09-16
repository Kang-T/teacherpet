// 티처펫 — 렌더러 (펫 행동·그리기·UI). 캐릭터 그림은 engine.js(이미지 기반)
(() => {
  const E = window.TP_ENGINE;
  const api = window.teacherpet;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const now = () => Date.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const FEED_COOLDOWN_MIN = 30, WATER_COOLDOWN_MIN = 20;
  const MAX_PETS = 3;
  const HEIGHT = { 3: 110, 4: 150, 6: 230 }; // 크기 설정 → 캐릭터 높이(px)
  const CHATTER = [
    '선생님, 물 한 잔 드셨어요?', '잠깐 기지개 한 번 펴요!', '오늘도 수고 많으세요',
    '창밖 한 번 보고 눈을 쉬어요', '어깨 한 번 돌려 볼까요?', '선생님 오늘 웃으셨어요?',
    '심호흡 세 번, 후우~', '조금만 더 힘내요!',
  ];
  const PET_LINES = ['좋아요~', '헤헤', '더 쓰다듬어 주세요', '선생님 최고!', '간지러워요!'];
  const NAME_POOL = {
    chick: ['삐약이', '노랑이', '콩콩', '병아', '햇살'],
    hamster: ['햄토리', '볼볼이', '땅콩', '쳇바퀴', '도토리'],
    turtle: ['느림보', '거부기', '초록이', '단단이', '꾸벅'],
    rabbit: ['깡총이', '토실이', '당근', '솜사탕', '하양이'],
    cockatiel: ['삐삐', '노랑볏', '앵두', '휘파람', '코코'],
  };

  // ---------- 상태 ----------
  function defaultState() {
    return {
      version: 2,
      pets: [],
      settings: { size: 4, sound: true, classMin: 40, breakMin: 10, autoBreak: true, chatter: true, homeSide: 'left' },
      names: '', pickUsed: [], todos: [], lastAttend: '', lastSeen: now(),
    };
  }
  let state = defaultState();
  let dirty = false;
  const markDirty = () => { dirty = true; };
  async function persist() { state.lastSeen = now(); await api.saveState(state); dirty = false; }
  setInterval(() => { if (dirty) persist(); }, 3000);
  setInterval(persist, 60000);

  // ---------- 화면 ----------
  const canvas = $('#stage');
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    for (const p of pets) p.x = clamp(p.x, 40, W - 40);
  }
  window.addEventListener('resize', resize);
  const groundY = () => H;

  // 집(소품) 배치 — 이미지가 없으면 그냥 안 그려진다
  function home() {
    const s = HEIGHT[state.settings.size] / 150;
    const left = state.settings.homeSide === 'left';
    const bx = (x) => (left ? x : W - x);
    return {
      house: { x: bx(150 * s + 20), h: 190 * s },
      bowl: { x: bx(330 * s + 20), h: 60 * s },
      bottle: { x: bx(420 * s + 20), h: 130 * s },
      flip: !left,
    };
  }

  // ---------- 펫 ----------
  let pets = [];
  let selectedId = null;
  let visible = true;
  let mode = 'free'; // free | class | break

  function newPetData(species) {
    return {
      id: 'p' + now().toString(36) + Math.floor(Math.random() * 1000),
      species, name: pick(NAME_POOL[species]), stage: 'egg',
      hunger: 70, thirst: 70, happy: 70, exp: 0, feeds: 0,
      lastFed: 0, lastWater: 0, born: now(), hatched: 0, x: rand(0.3, 0.8),
    };
  }
  function makeRuntime(d) {
    if (d.thirst === undefined) d.thirst = 70;
    if (d.lastWater === undefined) d.lastWater = 0;
    E.preload(d.species);
    return {
      d, x: d.x * W, dir: Math.random() < 0.5 ? 1 : -1,
      anim: d.stage === 'egg' ? 'egg' : 'idle', animT: 0, animDur: rand(2, 4),
      f: 0, frameT: 0, y: 0, vy: 0, targetX: null, targetY: null, carrying: false, squash: 0,
      bubbleUntil: 0, bubbleEl: null, lastPet: 0, lastNeedLine: 0, box: null, inHouse: false, goal: null,
    };
  }
  const sp = (p) => E.SPECIES[p.d.species];
  function petHeight(p) {
    const base = HEIGHT[state.settings.size] * sp(p).height;
    return p.d.stage === 'egg' ? base * 0.6 : p.d.stage === 'baby' ? base * 0.72 : base;
  }
  const POSE_OF = { idle: 'idle', sit: 'idle', walk: 'walk', sleep: 'sleep', eat: 'eat', drink: 'lookup', talk: 'lookup',
    jump: 'happy', happy: 'happy', fall: 'happy', carry: 'happy', sad: 'sad', egg: 'egg', gohome: 'walk', gofood: 'walk', gowater: 'walk',
    wheel: 'wheel', peck: 'peck', hide: 'hide', hop: 'hop', fly: 'fly', perch: 'idle' };

  function say(p, text, ms = 3000, big = false) {
    if (!p.bubbleEl) { p.bubbleEl = document.createElement('div'); p.bubbleEl.className = 'bubble'; $('#bubbles').appendChild(p.bubbleEl); }
    p.bubbleEl.textContent = text; p.bubbleEl.classList.toggle('big', big); p.bubbleUntil = now() + ms;
  }
  function setAnim(p, anim, dur) { p.anim = anim; p.animT = 0; p.animDur = dur; p.f = 0; p.frameT = 0; }
  function jump(p, v = 320) { setAnim(p, 'jump', 0.9); p.vy = v; }
  const needy = (p) => p.d.hunger < 30 || p.d.thirst < 30;

  function decide(p) {
    const s = sp(p);
    if (p.d.stage === 'egg') { setAnim(p, 'egg', rand(2, 5)); return; }
    let table;
    if (mode === 'class') table = [['sit', 5, [4, 9]], ['sleep', 2, [10, 30]], ['idle', 2, [3, 6]]];
    else if (mode === 'break') table = [['walk', 4, 0], [s.special, 3, 0], ['jump', 2, 0], ['idle', 1, [1, 2]]];
    else table = [['idle', 3, [2, 5]], ['walk', 4, 0], ['sleep', p.d.happy < 40 ? 2 : 1, [12, 25]], [s.special, 2, 0], ['jump', p.d.happy > 70 ? 1 : 0, 0], ['sad', needy(p) ? 3 : 0, [3, 6]]];
    if (p.d.species === 'turtle' && mode !== 'class') table.push(['sleep', 1, [10, 25]]);
    const total = table.reduce((a, r) => a + r[1], 0);
    let r = Math.random() * total, choice = table[0];
    for (const row of table) { r -= row[1]; if (r <= 0) { choice = row; break; } }
    const [anim, , dur] = choice;
    if (anim === 'walk') {
      p.targetX = clamp(p.x + rand(-1, 1) * rand(150, 500), 40, W - 40);
      p.dir = p.targetX > p.x ? 1 : -1;
      setAnim(p, 'walk', 10);
    } else if (anim === 'jump') jump(p, 300);
    else if (anim === 'sleep' && E.prop('house') && mode !== 'class' && !p.inHouse) {
      const hm = home(); p.targetX = hm.house.x; p.dir = p.targetX > p.x ? 1 : -1; setAnim(p, 'gohome', 12);
    } else if (anim === 'peck') setAnim(p, 'peck', rand(2, 3.5));
    else if (anim === 'wheel') setAnim(p, 'wheel', rand(5, 9));
    else if (anim === 'hide') setAnim(p, 'hide', rand(3, 6));
    else if (anim === 'hop') { p.targetX = clamp(p.x + p.dir * rand(200, 500), 40, W - 40); setAnim(p, 'hop', 6); }
    else if (anim === 'fly') {
      p.targetX = rand(60, W - 60); p.targetY = rand(H * 0.3, H * 0.75); p.dir = p.targetX > p.x ? 1 : -1; setAnim(p, 'fly', 30);
    } else setAnim(p, anim, rand(dur[0], dur[1]));
    if (p.anim !== 'sleep' && p.anim !== 'gohome') p.inHouse = false;
  }

  function update(p, dt) {
    const s = sp(p);
    const hpx = petHeight(p);
    p.frameT += dt; if (p.frameT > 0.5) { p.frameT = 0; p.f = p.f ? 0 : 1; }
    if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 4);
    // 스탯 감소 (활동 중: 배고픔 8시간, 목마름 6시간, 행복 12시간에 100)
    p.d.hunger = clamp(p.d.hunger - dt * (100 / (8 * 3600)), 0, 100);
    p.d.thirst = clamp(p.d.thirst - dt * (100 / (6 * 3600)), 0, 100);
    p.d.happy = clamp(p.d.happy - dt * (100 / (12 * 3600)), 10, 100);
    if (needy(p) && now() - p.lastNeedLine > 180000 && mode !== 'class' && p.d.stage !== 'egg') {
      p.lastNeedLine = now();
      say(p, p.d.thirst < 30 ? pick(['목말라요...', '물 주세요~']) : pick(['배고파요...', '꼬르륵', s.foodName + ' 먹고 싶어요']));
    }
    if (p.carrying) return;

    // 날기(앵무새): 목표점까지 직선 비행, 도착하면 다음 목표 또는 착지
    if (p.anim === 'fly') {
      const dx = p.targetX - p.x, dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const spd = s.speed * (hpx / 150);
      if (dist < 12) {
        if (p.goal || Math.random() < 0.4 || p.animT > 20) { p.targetY = 0; }
        else { p.targetX = rand(60, W - 60); p.targetY = rand(H * 0.3, H * 0.75); }
        p.dir = p.targetX > p.x ? 1 : -1;
      } else {
        p.x += dx / dist * spd * dt; p.y += dy / dist * spd * dt;
      }
      if (p.targetY === 0 && p.y < 8) {
        p.y = 0; p.squash = 0.6;
        if (p.goal === 'eat') { setAnim(p, 'eat', 3); }
        else if (p.goal === 'drink') { setAnim(p, 'drink', 2.5); }
        else setAnim(p, 'perch', rand(3, 7));
      }
      p.animT += dt; return;
    }

    // 중력
    if (p.y > 0 || p.vy > 0) {
      p.vy -= 1100 * dt; p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0; p.vy = 0; p.squash = 1;
        if (p.anim === 'fall' || p.anim === 'jump') setAnim(p, 'idle', rand(0.6, 1.5));
      }
    }
    if (p.anim === 'fall') return;

    // 목표 지점으로 걷기 (먹이·물·집·산책)
    if (['gofood', 'gowater', 'gohome', 'walk', 'hop'].includes(p.anim) && p.targetX !== null) {
      let speed = s.speed * (hpx / 150) * (mode === 'break' ? 1.4 : 1);
      if (p.anim === 'hop' || (p.d.species === 'rabbit' && p.anim !== 'gohome')) {
        if (p.y === 0 && p.vy === 0) p.vy = (p.anim === 'hop' ? 420 : 240) * (hpx / 150);
        speed = p.y > 0 ? speed * 1.3 : 0;
      }
      p.dir = p.targetX > p.x ? 1 : -1;
      p.x += p.dir * speed * dt;
      if (Math.abs(p.targetX - p.x) < 6) {
        p.x = p.targetX; p.targetX = null;
        if (p.anim === 'gofood') setAnim(p, 'eat', 3);
        else if (p.anim === 'gowater') setAnim(p, 'drink', 2.5);
        else if (p.anim === 'gohome') { p.inHouse = true; setAnim(p, 'sleep', rand(15, 30)); }
        else setAnim(p, 'idle', rand(1, 3));
      }
      if (p.x < 40 || p.x > W - 40) { p.x = clamp(p.x, 40, W - 40); p.dir *= -1; p.targetX = null; setAnim(p, 'idle', 1); }
    }

    p.animT += dt;
    if (p.animT >= p.animDur) {
      if (p.anim === 'eat' && p.goal === 'eat') {
        p.d.hunger = clamp(p.d.hunger + 35, 0, 100); p.d.happy = clamp(p.d.happy + 10, 0, 100);
        p.d.exp += 10; p.d.feeds += 1; p.d.lastFed = now(); p.goal = null;
        say(p, pick(['냠냠, 맛있어요!', '고마워요 선생님!', '배불러요~'])); growCheck(p); markDirty(); renderPetList();
      } else if (p.anim === 'drink' && p.goal === 'drink') {
        p.d.thirst = clamp(p.d.thirst + 40, 0, 100); p.d.happy = clamp(p.d.happy + 5, 0, 100);
        p.d.exp += 5; p.d.lastWater = now(); p.goal = null;
        say(p, pick(['꿀꺽꿀꺽', '시원해요!', '물 최고'])); markDirty(); renderPetList();
      }
      if (p.anim === 'egg') growCheck(p);
      decide(p);
    }
  }

  function growCheck(p) {
    if (p.d.stage === 'egg' && (p.d.feeds >= 3 || now() - p.d.born > 24 * 3600 * 1000)) {
      p.d.stage = 'baby'; p.d.hatched = now(); jump(p, 300);
      say(p, `톡톡... ${p.d.name}(이)가 태어났어요! ${sp(p).cry}`, 6000, true); chime();
    } else if (p.d.stage === 'baby' && p.d.exp >= 100) {
      p.d.stage = 'adult'; jump(p, 360);
      say(p, `${p.d.name}(이)가 어른이 됐어요!`, 6000, true); chime();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!visible) return;
    const t = performance.now() / 1000;
    const hm = home();
    E.drawProp(ctx, 'bowl', hm.bowl.x, groundY(), hm.bowl.h, hm.flip);
    E.drawProp(ctx, 'bottle', hm.bottle.x, groundY(), hm.bottle.h, hm.flip);
    for (const p of pets) if (p.inHouse) drawOne(p, t);
    E.drawProp(ctx, 'house', hm.house.x, groundY(), hm.house.h, hm.flip);
    for (const p of pets) if (!p.inHouse) drawOne(p, t);
  }
  function drawOne(p, t) {
    const box = E.drawPet(ctx, {
      species: p.d.species, pose: POSE_OF[p.anim] || 'idle', anim: p.anim, t: t + (p.d.id.charCodeAt(1) || 0),
      f: p.f, x: p.x, y: p.y, ground: groundY(), height: petHeight(p), dir: p.dir, squash: p.squash,
    });
    p.box = box;
    if (!box) return;
    if (p.d.stage !== 'egg' || selectedId === p.d.id) {
      ctx.font = 'bold 13px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const label = p.d.name + (p.anim === 'sleep' ? ' 💤' : '');
      const tw = ctx.measureText(label).width + 14, ty = box.top - 6;
      ctx.fillStyle = selectedId === p.d.id ? 'rgba(255,217,61,.95)' : 'rgba(255,253,245,.9)';
      ctx.strokeStyle = '#2B1B0E'; ctx.lineWidth = 2;
      roundRect(ctx, p.x - tw / 2, ty - 20, tw, 20, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2B1B0E'; ctx.fillText(label, p.x, ty - 3);
    }
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function placeBubbles() {
    const t = now();
    for (const p of pets) {
      if (!p.bubbleEl) continue;
      if (t > p.bubbleUntil || !visible || !p.box) { p.bubbleEl.style.display = 'none'; continue; }
      p.bubbleEl.style.display = '';
      p.bubbleEl.style.left = clamp(p.x, 140, W - 140) + 'px';
      p.bubbleEl.style.top = (p.box.top - 40) + 'px';
    }
  }

  // ---------- 메인 루프 ----------
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    for (const p of pets) update(p, dt);
    draw(); placeBubbles(); tickTimer(); tickChatter(dt);
    requestAnimationFrame(loop);
  }

  // ---------- 마우스 ----------
  let ignoring = true;
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.setIgnoreMouse(v); } }
  function petAt(x, y) {
    for (let i = pets.length - 1; i >= 0; i--) {
      const b = pets[i].box; if (!b) continue;
      const pad = b.w * 0.12;
      if (x >= b.left + pad && x <= b.left + b.w - pad && y >= b.top && y <= b.top + b.h) return pets[i];
    }
    return null;
  }
  function interactiveAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest && el.closest('.ui')) return true;
    return visible && !!petAt(x, y);
  }
  let drag = null;
  window.addEventListener('mousemove', (e) => {
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.moved = true; drag.p.carrying = true; drag.p.inHouse = false; setAnim(drag.p, 'carry', 99); }
      if (drag.moved) {
        drag.p.x = clamp(e.clientX - drag.offX, 40, W - 40);
        drag.p.y = Math.max(0, groundY() - (e.clientY + petHeight(drag.p) * 0.55));
      }
      setIgnore(false); return;
    }
    setIgnore(!interactiveAt(e.clientX, e.clientY));
    canvas.style.cursor = (visible && petAt(e.clientX, e.clientY)) ? 'grab' : 'default';
  });
  canvas.addEventListener('mousedown', (e) => {
    const p = petAt(e.clientX, e.clientY);
    if (!p) { closePanel(); return; }
    drag = { p, offX: e.clientX - p.x, sx: e.clientX, sy: e.clientY, moved: false };
    pets = pets.filter((q) => q !== p).concat(p);
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const p = drag.p;
    if (drag.moved) {
      p.carrying = false; p.d.x = p.x / W; p.targetX = null; p.goal = null;
      if (sp(p).flyer && p.y > 30) { p.targetX = p.x; p.targetY = p.y; setAnim(p, 'fly', 30); }
      else if (p.y > 0) { setAnim(p, 'fall', 99); p.vy = 0; } else decide(p);
      markDirty();
    } else petTouch(p);
    drag = null; canvas.style.cursor = 'grab';
    setIgnore(!interactiveAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('dblclick', (e) => { const p = petAt(e.clientX, e.clientY); if (p) { selectedId = p.d.id; openPanel('pets'); } });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  function petTouch(p) {
    selectedId = p.d.id;
    if (p.d.stage === 'egg') { say(p, pick(['(꿈틀)', '(따뜻해요)', '톡... 톡...'])); setAnim(p, 'egg', 2); p.f = 1; return; }
    const t = now();
    if (t - p.lastPet > 20000) { p.d.happy = clamp(p.d.happy + 3, 0, 100); p.d.exp += 1; p.lastPet = t; markDirty(); }
    p.inHouse = false;
    if (!(sp(p).flyer && p.y > 0)) jump(p, 260);
    say(p, mode === 'class' ? pick(['쉿... 수업 중이에요', '(조용히 꼬리 흔들기)']) : pick(PET_LINES.concat([sp(p).cry])));
    renderPetList();
  }

  // ---------- 먹이 · 물 ----------
  function goTo(p, x, goal, walkAnim) {
    p.inHouse = false; p.goal = goal;
    p.targetX = clamp(x, 40, W - 40); p.dir = p.targetX > p.x ? 1 : -1;
    if (sp(p).flyer && p.y > 0) { p.targetY = 0; setAnim(p, 'fly', 30); }
    else setAnim(p, walkAnim, 20);
  }
  function feed(id) {
    const p = pets.find((q) => q.d.id === id); if (!p) return;
    const t = now(), left = FEED_COOLDOWN_MIN * 60000 - (t - p.d.lastFed);
    if (left > 0) { say(p, `아직 배불러요 (${Math.ceil(left / 60000)}분 후에 주세요)`); return; }
    if (p.d.stage === 'egg') {
      p.d.feeds += 1; p.d.lastFed = t; p.d.exp += 5;
      say(p, pick(['(따끈따끈)', '(안에서 톡톡)', '(살짝 흔들림)'])); setAnim(p, 'egg', 2); p.f = 1;
      growCheck(p); markDirty(); renderPetList(); return;
    }
    const hm = home();
    goTo(p, E.prop('bowl') ? hm.bowl.x + (hm.flip ? -1 : 1) * hm.bowl.h * 0.9 : p.x + p.dir * 80, 'eat', 'gofood');
    say(p, sp(p).foodName + '다!');
  }
  function water(id) {
    const p = pets.find((q) => q.d.id === id); if (!p || p.d.stage === 'egg') return;
    const t = now(), left = WATER_COOLDOWN_MIN * 60000 - (t - p.d.lastWater);
    if (left > 0) { say(p, `방금 마셨어요 (${Math.ceil(left / 60000)}분 후에 주세요)`); return; }
    const hm = home();
    goTo(p, E.prop('bottle') ? hm.bottle.x + (hm.flip ? 1 : -1) * hm.bottle.h * 0.45 : p.x - p.dir * 80, 'drink', 'gowater');
    say(p, '물이다!');
  }

  // ---------- 타이머 / 집중 모드 ----------
  let timer = null;
  const pill = $('#timerPill');
  function startTimer(kind) {
    const min = kind === 'class' ? state.settings.classMin : state.settings.breakMin;
    timer = { kind, total: min * 60000, endsAt: now() + min * 60000 };
    mode = kind;
    pill.classList.remove('hidden', 'class', 'break', 'ending'); pill.classList.add(kind);
    $('#timerKind').textContent = kind === 'class' ? '수업' : '쉬는 시간';
    for (const p of pets) {
      if (p.d.stage === 'egg') continue;
      p.inHouse = false; p.targetX = null; p.goal = null;
      if (kind === 'class') { if (p.anim !== 'fly') setAnim(p, 'sit', rand(3, 6)); say(p, pick(['쉿, 수업 시간이에요', '집중!', '조용히 있을게요'])); }
      else { if (p.anim !== 'fly') jump(p, 320); say(p, pick(['쉬는 시간이다!', '놀자 놀자!', sp(p).cry]), 4000, true); }
    }
    renderTimerTab();
  }
  function stopTimer(silent) {
    timer = null; mode = 'free'; pill.classList.add('hidden');
    if (!silent) for (const p of pets) if (p.d.stage !== 'egg' && p.anim !== 'fly') decide(p);
    renderTimerTab();
  }
  let lastTickSec = -1;
  function tickTimer() {
    if (!timer) return;
    const left = timer.endsAt - now(), sec = Math.max(0, Math.ceil(left / 1000));
    if (sec !== lastTickSec) {
      lastTickSec = sec; const txt = fmt(sec);
      $('#timerLeft').textContent = txt; $('#timerBig').textContent = txt;
      pill.classList.toggle('ending', sec <= 60 && sec > 0);
    }
    if (left <= 0) {
      const wasClass = timer.kind === 'class';
      chime();
      if (wasClass && state.settings.autoBreak) startTimer('break');
      else {
        stopTimer(true);
        for (const p of pets) if (p.d.stage !== 'egg') { if (p.anim !== 'fly') jump(p, 320); say(p, wasClass ? '수업 끝! 잘하셨어요' : '쉬는 시간 끝, 자리로!', 5000, true); }
      }
    }
  }
  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  function renderTimerTab() {
    $('#timerBig').textContent = timer ? fmt(Math.max(0, Math.ceil((timer.endsAt - now()) / 1000))) : fmt(state.settings.classMin * 60);
    $('#classMin').value = state.settings.classMin; $('#breakMin').value = state.settings.breakMin;
    $('#autoBreak').checked = state.settings.autoBreak;
  }
  let chatterT = rand(120, 240);
  function tickChatter(dt) {
    if (!state.settings.chatter || mode === 'class' || !pets.length) return;
    chatterT -= dt;
    if (chatterT <= 0) {
      chatterT = rand(180, 420);
      const p = pick(pets.filter((q) => q.d.stage !== 'egg'));
      if (p && p.anim !== 'sleep') say(p, pick(CHATTER), 5000);
    }
  }

  // ---------- 소리 ----------
  let audio = null;
  function chime() {
    if (!state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.5);
        o.connect(g).connect(audio.destination); o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.55);
      });
    } catch (_) { /* 소리 없어도 동작 */ }
  }

  // ---------- 패널 UI ----------
  const panel = $('#panel');
  function openPanel(tab) { panel.classList.remove('hidden'); if (tab) showTab(tab); renderPetList(); renderTimerTab(); renderTodos(); renderSettings(); }
  function closePanel() { panel.classList.add('hidden'); }
  function togglePanel() { panel.classList.contains('hidden') ? openPanel() : closePanel(); }
  function showTab(name) {
    $$('.tabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('section.tab').forEach((s) => s.classList.toggle('active', s.dataset.tab === name));
  }
  $$('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#closePanel').addEventListener('click', closePanel);

  const STAGE_KO = { egg: '알', baby: '아기', adult: '어른' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function renderPetList() {
    if (panel.classList.contains('hidden')) return;
    const box = $('#petList'); box.innerHTML = '';
    if (!pets.length) box.innerHTML = '<p class="hint">아직 친구가 없어요. 아래에서 첫 친구를 입양해 보세요!</p>';
    for (const p of pets) {
      const s = sp(p);
      const card = document.createElement('div');
      card.className = 'petCard' + (selectedId === p.d.id ? ' selected' : '');
      const days = Math.max(1, Math.ceil((now() - p.d.born) / 86400000));
      const feedLeft = Math.max(0, FEED_COOLDOWN_MIN * 60000 - (now() - p.d.lastFed));
      const waterLeft = Math.max(0, WATER_COOLDOWN_MIN * 60000 - (now() - p.d.lastWater));
      card.innerHTML = `
        <div class="head"><span class="name">${esc(p.d.name)}</span>
          <span class="stage">${s.name} · ${STAGE_KO[p.d.stage]} · 함께한 지 ${days}일 · 먹이 ${p.d.feeds}번</span></div>
        ${p.d.stage === 'egg'
          ? `<div class="stat"><b>부화</b><div class="bar exp"><i style="width:${Math.min(100, p.d.feeds / 3 * 100)}%"></i></div><span>${Math.min(3, p.d.feeds)}/3</span></div>`
          : `<div class="stat"><b>배부름</b><div class="bar"><i style="width:${p.d.hunger}%"></i></div></div>
             <div class="stat"><b>물</b><div class="bar water"><i style="width:${p.d.thirst}%"></i></div></div>
             <div class="stat"><b>행복</b><div class="bar happy"><i style="width:${p.d.happy}%"></i></div></div>
             ${p.d.stage === 'baby' ? `<div class="stat"><b>성장</b><div class="bar exp"><i style="width:${Math.min(100, p.d.exp)}%"></i></div><span>${Math.min(100, Math.floor(p.d.exp))}/100</span></div>` : ''}`}
        <div class="actions">
          <button class="small primary" data-act="feed">${p.d.stage === 'egg' ? '🤲 품어주기' : '🍽 ' + s.foodName}${feedLeft ? ` (${Math.ceil(feedLeft / 60000)}분 후)` : ''}</button>
          ${p.d.stage === 'egg' ? '' : `<button class="small primary" data-act="water">💧 물${waterLeft ? ` (${Math.ceil(waterLeft / 60000)}분 후)` : ''}</button>`}
          <button class="small" data-act="rename">✏️ 이름</button>
          <button class="small" data-act="find">📍 찾기</button>
          <button class="small danger" data-act="release">보내주기</button>
        </div>`;
      card.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        selectedId = p.d.id;
        if (act === 'feed') feed(p.d.id);
        else if (act === 'water') water(p.d.id);
        else if (act === 'rename') {
          const n = window.prompt('새 이름을 정해 주세요', p.d.name);
          if (n && n.trim()) { p.d.name = n.trim().slice(0, 12); markDirty(); say(p, `제 이름은 ${p.d.name}!`); }
        } else if (act === 'find') { p.x = W / 2; p.d.x = 0.5; p.inHouse = false; if (!(sp(p).flyer && p.y > 0)) jump(p, 300); say(p, '여기 있어요!'); }
        else if (act === 'release') {
          if (e.target.dataset.confirm) {
            pets = pets.filter((q) => q !== p); state.pets = state.pets.filter((q) => q.id !== p.d.id);
            if (p.bubbleEl) p.bubbleEl.remove(); markDirty();
          } else { e.target.dataset.confirm = '1'; e.target.textContent = '정말요? 한 번 더'; return; }
        }
        renderPetList();
      });
      box.appendChild(card);
    }
    $('#adoptBox').style.display = pets.length >= MAX_PETS ? 'none' : '';
  }
  $$('#adoptButtons button').forEach((b) => b.addEventListener('click', () => {
    if (pets.length >= MAX_PETS) return;
    const d = newPetData(b.dataset.species); state.pets.push(d);
    const p = makeRuntime(d); pets.push(p); selectedId = d.id;
    say(p, '알이 도착했어요! 품어주면 부화해요', 5000); markDirty(); renderPetList();
  }));

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
  function renderPickInfo() {
    const all = nameList(), left = all.filter((n) => !state.pickUsed.includes(n));
    $('#pickInfo').textContent = all.length ? `전체 ${all.length}명 · 아직 안 뽑힌 ${left.length}명` : '';
  }
  let picking = false;
  $('#btnPick').addEventListener('click', () => {
    if (picking) return;
    const all = nameList(), exclude = $('#pickExclude').checked;
    let pool = exclude ? all.filter((n) => !state.pickUsed.includes(n)) : all.slice();
    const n = clamp(+$('#pickCount').value || 1, 1, 10);
    if (!all.length) { $('#pickResult').textContent = '이름을 먼저 적어 주세요'; return; }
    if (pool.length < n) { if (exclude) { state.pickUsed = []; pool = all.slice(); } if (pool.length < n) { $('#pickResult').textContent = '사람이 부족해요'; return; } }
    picking = true;
    const res = $('#pickResult'); let ticks = 0;
    const iv = setInterval(() => {
      res.textContent = pick(pool);
      if (++ticks > 18) {
        clearInterval(iv);
        const chosen = [], tmp = pool.slice();
        for (let i = 0; i < n; i++) { const k = Math.floor(Math.random() * tmp.length); chosen.push(tmp.splice(k, 1)[0]); }
        res.textContent = chosen.join(', ');
        if (exclude) state.pickUsed.push(...chosen);
        markDirty(); renderPickInfo(); picking = false;
        const p = pets.find((q) => q.d.id === selectedId) || pets[0];
        if (p && p.d.stage !== 'egg') { if (p.anim !== 'fly') jump(p, 300); say(p, chosen.join(', ') + '!', 5000, true); }
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
      li.querySelector('input').addEventListener('change', (e) => { t.done = e.target.checked; markDirty(); renderTodos(); if (t.done && pets[0]) say(pets[0], '하나 해냈다! 👏'); });
      li.querySelector('[data-del]').addEventListener('click', () => { state.todos.splice(i, 1); markDirty(); renderTodos(); });
      ul.appendChild(li);
    });
  }
  function addTodo() { const v = $('#todoInput').value.trim(); if (!v) return; state.todos.push({ text: v, done: false }); $('#todoInput').value = ''; markDirty(); renderTodos(); }
  $('#btnTodoAdd').addEventListener('click', addTodo);
  $('#todoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

  // 설정 탭
  function renderSettings() {
    $('#soundOn').checked = state.settings.sound; $('#chatterOn').checked = state.settings.chatter;
    $$('[data-size]').forEach((b) => b.classList.toggle('primary', +b.dataset.size === state.settings.size));
    $$('[data-home]').forEach((b) => b.classList.toggle('primary', b.dataset.home === state.settings.homeSide));
  }
  $$('[data-size]').forEach((b) => b.addEventListener('click', () => setSize(+b.dataset.size)));
  $$('[data-home]').forEach((b) => b.addEventListener('click', () => { state.settings.homeSide = b.dataset.home; markDirty(); renderSettings(); }));
  function setSize(s) { state.settings.size = s; markDirty(); renderSettings(); }
  $('#soundOn').addEventListener('change', (e) => { state.settings.sound = e.target.checked; markDirty(); if (e.target.checked) chime(); });
  $('#chatterOn').addEventListener('change', (e) => { state.settings.chatter = e.target.checked; markDirty(); });
  $('#autostart').addEventListener('change', (e) => api.setAutostart(e.target.checked));
  $('#btnQuit').addEventListener('click', async () => { await persist(); api.quit(); });

  api.on('ui:toggle-menu', togglePanel);
  api.on('timer:start', (kind) => startTimer(kind));
  api.on('timer:stop', () => stopTimer());
  api.on('pet:size', (s) => setSize(s));
  api.on('pet:toggle-visible', () => { visible = !visible; });
  api.on('work-area', () => setTimeout(resize, 50));

  // ---------- 시작 ----------
  async function init() {
    resize();
    ['house', 'bowl', 'bottle'].forEach(E.prop);
    const saved = await api.loadState();
    if (saved && (saved.version === 1 || saved.version === 2)) {
      state = Object.assign(defaultState(), saved, { version: 2 });
      state.settings = Object.assign(defaultState().settings, saved.settings || {});
    }
    const away = Math.max(0, now() - (state.lastSeen || now()));
    const loss = Math.min(40, away / 3600000 * 5);
    for (const d of state.pets) { d.hunger = clamp(d.hunger - loss, 20, 100); d.thirst = clamp((d.thirst ?? 70) - loss, 20, 100); }
    pets = state.pets.map(makeRuntime);
    if (pets.length) selectedId = pets[0].d.id;
    const info = await api.info();
    $('#version').textContent = 'v' + info.version;
    $('#autostart').checked = !!info.openAtLogin;
    namesEl.value = state.names; renderPickInfo();
    if (!pets.length) openPanel('pets');
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastAttend !== today) {
      state.lastAttend = today;
      for (const p of pets) { p.d.exp += 5; if (p.d.stage !== 'egg') say(p, pick(['출석! 오늘도 반가워요', '좋은 아침이에요 선생님!', '오늘도 파이팅!']), 5000); }
      markDirty();
    }
    for (const p of pets) decide(p);
    requestAnimationFrame(loop);
  }
  init();
})();
