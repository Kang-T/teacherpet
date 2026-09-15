// 티처펫 — 렌더러 (펫 행동·그리기·UI)
(() => {
  const SP = window.TP_SPRITES;
  const api = window.teacherpet;
  const GW = SP.W, GH = SP.H;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const now = () => Date.now();
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const FEED_COOLDOWN_MIN = 30;
  const MAX_PETS = 3;
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
  };

  // ---------- 상태 ----------
  function defaultState() {
    return {
      version: 1,
      pets: [],
      settings: { size: 4, sound: true, classMin: 40, breakMin: 10, autoBreak: true, chatter: true },
      names: '',
      pickUsed: [],
      todos: [],
      lastAttend: '',
      lastSeen: now(),
    };
  }
  let state = defaultState();
  let dirty = false;
  const markDirty = () => { dirty = true; };
  async function persist() {
    state.lastSeen = now();
    await api.saveState(state);
    dirty = false;
  }
  setInterval(() => { if (dirty) persist(); }, 3000);
  setInterval(persist, 60000);

  // ---------- 화면 ----------
  const canvas = $('#stage');
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    for (const p of pets) p.x = clamp(p.x, 40, W - 40);
  }
  window.addEventListener('resize', resize);
  const groundY = () => H;

  // ---------- 펫 ----------
  let pets = [];
  let foods = []; // {x, species, petId}
  let selectedId = null;
  let visible = true;
  let mode = 'free'; // free | class | break

  function newPetData(species) {
    return {
      id: 'p' + now().toString(36) + Math.floor(Math.random() * 1000),
      species,
      name: pick(NAME_POOL[species]),
      stage: 'egg',
      hunger: 70, happy: 70, exp: 0, feeds: 0,
      lastFed: 0, born: now(), hatched: 0,
      x: rand(0.2, 0.8),
    };
  }

  function makeRuntime(d) {
    return {
      d, x: d.x * W, dir: Math.random() < 0.5 ? 1 : -1,
      anim: d.stage === 'egg' ? 'egg' : 'idle', animT: 0, animDur: rand(2, 4),
      f: 0, frameT: 0, y: 0, vy: 0, targetX: null, carrying: false,
      blink: false, blinkAt: rand(2, 6), bubbleUntil: 0, bubbleEl: null,
      lastPet: 0, lastHungryLine: 0,
    };
  }

  function petScale(p) {
    const s = state.settings.size;
    return p.d.stage === 'baby' ? Math.max(2, s - 1) : s;
  }
  function petBox(p) {
    const s = petScale(p);
    const bw = GW * s, bh = GH * s;
    return { s, left: p.x - bw / 2, top: groundY() - bh - p.y, w: bw, h: bh };
  }
  function speciesOf(p) { return SP.SPECIES[p.d.species]; }

  function say(p, text, ms = 3000, big = false) {
    if (!p.bubbleEl) {
      p.bubbleEl = document.createElement('div');
      p.bubbleEl.className = 'bubble';
      $('#bubbles').appendChild(p.bubbleEl);
    }
    p.bubbleEl.textContent = text;
    p.bubbleEl.classList.toggle('big', big);
    p.bubbleUntil = now() + ms;
  }

  function setAnim(p, anim, dur) {
    p.anim = anim; p.animT = 0; p.animDur = dur; p.f = 0; p.frameT = 0;
  }

  const FRAME_MS = {
    walk: 0.18, idle: 0.6, sit: 0.8, sleep: 1.0, eat: 0.25, peck: 0.15, wheel: 0.08,
    hide: 0.35, twitch: 0.3, hop: 0.2, jump: 0.15, happy: 0.15, egg: 0.5,
  };

  function decide(p) {
    const sp = speciesOf(p);
    if (p.d.stage === 'egg') { setAnim(p, 'egg', rand(2, 5)); return; }
    let table;
    if (mode === 'class') table = [['sit', 5, [4, 9]], ['sleep', 2, [10, 30]], ['idle', 2, [3, 6]]];
    else if (mode === 'break') table = [['walk', 4, 0], [sp.special, 3, 0], ['jump', 2, 0], ['idle', 1, [1, 2]]];
    else table = [['idle', 3, [2, 5]], ['walk', 4, 0], ['sleep', p.d.happy < 40 ? 2 : 1, [8, 18]], [sp.special, 2, 0], ['jump', p.d.happy > 70 ? 1 : 0, 0]];
    if (p.d.species === 'turtle' && mode !== 'class') table.push(['sleep', 1, [10, 25]]);
    const total = table.reduce((a, r) => a + r[1], 0);
    let r = Math.random() * total, choice = table[0];
    for (const row of table) { r -= row[1]; if (r <= 0) { choice = row; break; } }
    const [anim, , dur] = choice;
    if (anim === 'walk') {
      p.targetX = clamp(p.x + rand(-1, 1) * rand(120, 420), 40, W - 40);
      p.dir = p.targetX > p.x ? 1 : -1;
      setAnim(p, p.d.species === 'rabbit' ? 'hop' : 'walk', 9);
    } else if (anim === 'jump') {
      setAnim(p, 'jump', 0.7); p.vy = 260;
    } else if (anim === 'peck') setAnim(p, 'peck', rand(1.5, 2.5));
    else if (anim === 'wheel') setAnim(p, 'wheel', rand(4, 8));
    else if (anim === 'hide') setAnim(p, 'hide', rand(3, 6));
    else if (anim === 'hop') { setAnim(p, 'twitch', rand(1.5, 2.5)); }
    else setAnim(p, anim, rand(dur[0], dur[1]));
  }

  function update(p, dt) {
    const sp = speciesOf(p);
    const s = petScale(p);
    // 깜빡임
    p.blinkAt -= dt;
    if (p.blinkAt < 0) { p.blink = true; if (p.blinkAt < -0.15) { p.blink = false; p.blinkAt = rand(2, 6); } }
    // 프레임 토글
    p.frameT += dt;
    const fm = FRAME_MS[p.anim] || 0.4;
    if (p.frameT > (p.d.species === 'turtle' && p.anim === 'walk' ? fm * 2.2 : fm)) { p.frameT = 0; p.f = p.f ? 0 : 1; }
    // 스탯 감소 (활동 중: 8시간에 100)
    p.d.hunger = clamp(p.d.hunger - dt * (100 / (8 * 3600)), 0, 100);
    p.d.happy = clamp(p.d.happy - dt * (100 / (12 * 3600)), 10, 100);
    if (p.d.hunger < 30 && now() - p.lastHungryLine > 180000 && mode !== 'class' && p.d.stage !== 'egg') {
      p.lastHungryLine = now(); say(p, pick(['배고파요...', '꼬르륵', sp.foodName + ' 먹고 싶어요']));
    }

    if (p.carrying) return;
    // 중력
    if (p.y > 0 || p.vy > 0) {
      p.vy -= 900 * dt; p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; if (p.anim === 'fall') setAnim(p, 'idle', 1); }
    }
    if (p.anim === 'fall') return;

    // 먹이 찾아가기
    const food = foods.find((f) => f.petId === p.d.id);
    if (food && p.anim !== 'eat') {
      const dx = food.x - p.x;
      if (Math.abs(dx) > 6 * s) {
        p.dir = dx > 0 ? 1 : -1;
        if (p.anim !== 'walk' && p.anim !== 'hop') setAnim(p, p.d.species === 'rabbit' ? 'hop' : 'walk', 99);
        p.targetX = food.x;
      } else {
        setAnim(p, 'eat', 2.5);
        p.targetX = null;
      }
    }

    // 이동
    if (p.anim === 'walk' || p.anim === 'hop') {
      let speed = sp.speed * (s / 4);
      if (mode === 'break') speed *= 1.4;
      if (p.anim === 'hop') {
        if (p.y === 0 && p.vy === 0) p.vy = 150 * (s / 4);
        speed = p.y > 0 ? speed : 0;
      }
      p.x += p.dir * speed * dt;
      if (p.targetX !== null && Math.abs(p.targetX - p.x) < 4) { p.targetX = null; if (!food) setAnim(p, 'idle', rand(1, 3)); }
      if (p.x < 40 || p.x > W - 40) { p.x = clamp(p.x, 40, W - 40); p.dir *= -1; p.targetX = null; }
    }

    p.animT += dt;
    if (p.animT >= p.animDur) {
      if (p.anim === 'eat' && food) {
        foods = foods.filter((f) => f !== food);
        p.d.hunger = clamp(p.d.hunger + 30, 0, 100);
        p.d.happy = clamp(p.d.happy + 10, 0, 100);
        p.d.exp += 10; p.d.feeds += 1; p.d.lastFed = now();
        say(p, pick(['냠냠, 맛있어요!', '고마워요 선생님!', '배불러요~']));
        growCheck(p);
        markDirty(); renderPetList();
      }
      if (p.anim === 'egg' && p.d.stage === 'egg') growCheck(p);
      decide(p);
    }
  }

  function growCheck(p) {
    if (p.d.stage === 'egg' && (p.d.feeds >= 3 || now() - p.d.born > 24 * 3600 * 1000)) {
      p.d.stage = 'baby'; p.d.hatched = now();
      setAnim(p, 'jump', 0.8); p.vy = 260;
      say(p, `톡톡... ${p.d.name}(이)가 태어났어요! ${speciesOf(p).cry}`, 6000, true);
      chime();
    } else if (p.d.stage === 'baby' && p.d.exp >= 100) {
      p.d.stage = 'adult';
      setAnim(p, 'jump', 0.8); p.vy = 300;
      say(p, `${p.d.name}(이)가 어른이 됐어요! 🎀`, 6000, true);
      chime();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (!visible) return;
    const s0 = state.settings.size;
    // 먹이
    for (const f of foods) {
      const fs = s0;
      ctx.save(); ctx.translate(f.x - 4 * fs, groundY() - 8 * fs);
      SP.food[f.species](SP.painter((x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * fs, y * fs, w * fs, h * fs); }));
      ctx.restore();
    }
    for (const p of pets) {
      const b = petBox(p);
      ctx.save();
      ctx.translate(Math.round(b.left), Math.round(b.top));
      if (p.dir < 0) { ctx.translate(b.w, 0); ctx.scale(-1, 1); }
      const P = SP.painter((x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * b.s, y * b.s, w * b.s, h * b.s); });
      const o = {
        anim: p.anim, f: p.f, t: performance.now() / 1000, blink: p.blink,
        happy: p.d.happy > 75, adult: p.d.stage === 'adult', species: p.d.species,
        crack: p.d.feeds >= 2,
      };
      if (p.d.stage === 'egg') SP.egg(P, o);
      else speciesOf(p).draw(P, o);
      ctx.restore();
      // 이름표
      if (p.d.stage !== 'egg' || selectedId === p.d.id) {
        ctx.font = `bold ${Math.max(11, 3 * b.s)}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const label = p.d.name + (p.anim === 'sleep' ? ' 💤' : '');
        const tw = ctx.measureText(label).width + 12;
        const ty = b.top - 4;
        ctx.fillStyle = selectedId === p.d.id ? 'rgba(255,217,61,.95)' : 'rgba(255,253,245,.9)';
        ctx.strokeStyle = '#2B1B0E'; ctx.lineWidth = 2;
        roundRect(ctx, p.x - tw / 2, ty - 18, tw, 18, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2B1B0E'; ctx.fillText(label, p.x, ty - 2);
      }
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
      if (t > p.bubbleUntil || !visible) { p.bubbleEl.style.display = 'none'; continue; }
      const b = petBox(p);
      p.bubbleEl.style.display = '';
      const left = clamp(p.x, 140, W - 140);
      p.bubbleEl.style.left = left + 'px';
      p.bubbleEl.style.top = (b.top - 36) + 'px';
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

  // ---------- 마우스 (클릭 통과 제어) ----------
  let ignoring = true;
  function setIgnore(v) { if (v !== ignoring) { ignoring = v; api.setIgnoreMouse(v); } }
  function petAt(x, y) {
    for (let i = pets.length - 1; i >= 0; i--) {
      const b = petBox(pets[i]);
      if (x >= b.left + b.s * 2 && x <= b.left + b.w - b.s * 2 && y >= b.top && y <= b.top + b.h) return pets[i];
    }
    return null;
  }
  function interactiveAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest && el.closest('.ui')) return true;
    return visible && !!petAt(x, y);
  }
  let drag = null; // {p, offX, moved}
  window.addEventListener('mousemove', (e) => {
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) { drag.moved = true; drag.p.carrying = true; setAnim(drag.p, 'idle', 99); }
      if (drag.moved) {
        drag.p.x = clamp(e.clientX - drag.offX, 40, W - 40);
        const b = petBox(drag.p);
        drag.p.y = Math.max(0, groundY() - (e.clientY + b.h * 0.6));
      }
      setIgnore(false); return;
    }
    const hit = interactiveAt(e.clientX, e.clientY);
    setIgnore(!hit);
    canvas.style.cursor = (visible && petAt(e.clientX, e.clientY)) ? 'grab' : 'default';
  });
  canvas.addEventListener('mousedown', (e) => {
    const p = petAt(e.clientX, e.clientY);
    if (!p) { closePanel(); return; }
    drag = { p, offX: e.clientX - p.x, sx: e.clientX, sy: e.clientY, moved: false };
    pets = pets.filter((q) => q !== p).concat(p); // 맨 앞으로
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const p = drag.p;
    if (drag.moved) {
      p.carrying = false; p.d.x = p.x / W;
      if (p.y > 0) { setAnim(p, 'fall', 99); p.vy = 0; } else decide(p);
      markDirty();
    } else {
      petTouch(p);
    }
    drag = null;
    canvas.style.cursor = 'grab';
    setIgnore(!interactiveAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('dblclick', (e) => {
    const p = petAt(e.clientX, e.clientY);
    if (p) { selectedId = p.d.id; openPanel('pets'); }
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

  function petTouch(p) {
    selectedId = p.d.id;
    if (p.d.stage === 'egg') { say(p, pick(['(꿈틀)', '(따뜻해요)', '톡... 톡...'])); setAnim(p, 'egg', 2); return; }
    const t = now();
    if (t - p.lastPet > 20000) { p.d.happy = clamp(p.d.happy + 3, 0, 100); p.d.exp += 1; p.lastPet = t; markDirty(); }
    setAnim(p, 'jump', 0.6); p.vy = 220;
    say(p, mode === 'class' ? pick(['쉿... 수업 중이에요', '(조용히 꼬리 흔들기)']) : pick(PET_LINES.concat([speciesOf(p).cry])));
    renderPetList();
  }

  // ---------- 먹이 ----------
  function feed(id) {
    const p = pets.find((q) => q.d.id === id); if (!p) return;
    const t = now();
    const left = FEED_COOLDOWN_MIN * 60000 - (t - p.d.lastFed);
    if (left > 0) { say(p, `아직 배불러요 (${Math.ceil(left / 60000)}분 후에 주세요)`); return; }
    if (foods.some((f) => f.petId === id)) return;
    if (p.d.stage === 'egg') {
      // 알은 "품어주기": 즉시 반영
      p.d.feeds += 1; p.d.lastFed = t; p.d.exp += 5;
      say(p, pick(['(따끈따끈)', '(안에서 톡톡)', '(살짝 흔들림)']));
      setAnim(p, 'egg', 2);
      growCheck(p); markDirty(); renderPetList(); return;
    }
    const x = clamp(p.x + p.dir * rand(60, 120) * (state.settings.size / 4), 40, W - 40);
    foods.push({ x, species: p.d.species, petId: id });
    say(p, speciesOf(p).foodName + '다!');
  }

  // ---------- 타이머 / 집중 모드 ----------
  let timer = null; // {kind, endsAt, total}
  const pill = $('#timerPill');
  function startTimer(kind) {
    const min = kind === 'class' ? state.settings.classMin : state.settings.breakMin;
    timer = { kind, total: min * 60000, endsAt: now() + min * 60000 };
    setMode(kind);
    pill.classList.remove('hidden', 'class', 'break', 'ending');
    pill.classList.add(kind);
    $('#timerKind').textContent = kind === 'class' ? '수업' : '쉬는 시간';
    for (const p of pets) {
      if (p.d.stage === 'egg') continue;
      if (kind === 'class') { setAnim(p, 'sit', rand(3, 6)); say(p, pick(['쉿, 수업 시간이에요', '집중!', '조용히 있을게요'])); }
      else { setAnim(p, 'jump', 0.7); p.vy = 280; say(p, pick(['쉬는 시간이다!', '놀자 놀자!', speciesOf(p).cry]), 4000, true); }
    }
    renderTimerTab();
  }
  function stopTimer(silent) {
    timer = null; setMode('free');
    pill.classList.add('hidden');
    if (!silent) for (const p of pets) if (p.d.stage !== 'egg') decide(p);
    renderTimerTab();
  }
  function setMode(m) { mode = m; }
  let lastTickSec = -1;
  function tickTimer() {
    if (!timer) return;
    const left = timer.endsAt - now();
    const sec = Math.max(0, Math.ceil(left / 1000));
    if (sec !== lastTickSec) {
      lastTickSec = sec;
      const txt = fmt(sec);
      $('#timerLeft').textContent = txt; $('#timerBig').textContent = txt;
      pill.classList.toggle('ending', sec <= 60 && sec > 0);
    }
    if (left <= 0) {
      const wasClass = timer.kind === 'class';
      chime();
      if (wasClass && state.settings.autoBreak) startTimer('break');
      else {
        stopTimer(true);
        for (const p of pets) if (p.d.stage !== 'egg') { setAnim(p, 'jump', 0.7); p.vy = 280; say(p, wasClass ? '수업 끝! 잘하셨어요' : '쉬는 시간 끝, 자리로!', 5000, true); }
      }
    }
  }
  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  function renderTimerTab() {
    $('#timerBig').textContent = timer ? fmt(Math.max(0, Math.ceil((timer.endsAt - now()) / 1000))) : fmt(state.settings.classMin * 60);
    $('#classMin').value = state.settings.classMin;
    $('#breakMin').value = state.settings.breakMin;
    $('#autoBreak').checked = state.settings.autoBreak;
  }

  // 펫이 가끔 말 걸기
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
        o.connect(g).connect(audio.destination);
        o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.55);
      });
    } catch (_) { /* 소리 없어도 동작 */ }
  }

  // ---------- 패널 UI ----------
  const panel = $('#panel');
  function openPanel(tab) {
    panel.classList.remove('hidden');
    if (tab) showTab(tab);
    renderPetList(); renderTimerTab(); renderTodos(); renderSettings();
  }
  function closePanel() { panel.classList.add('hidden'); }
  function togglePanel() { panel.classList.contains('hidden') ? openPanel() : closePanel(); }
  function showTab(name) {
    $$('.tabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('section.tab').forEach((s) => s.classList.toggle('active', s.dataset.tab === name));
  }
  $$('.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#closePanel').addEventListener('click', closePanel);

  const STAGE_KO = { egg: '알', baby: '아기', adult: '어른' };
  function renderPetList() {
    if (panel.classList.contains('hidden')) return;
    const box = $('#petList');
    box.innerHTML = '';
    if (!pets.length) box.innerHTML = '<p class="hint">아직 친구가 없어요. 아래에서 첫 친구를 입양해 보세요!</p>';
    for (const p of pets) {
      const sp = speciesOf(p);
      const card = document.createElement('div');
      card.className = 'petCard' + (selectedId === p.d.id ? ' selected' : '');
      const days = Math.max(1, Math.ceil((now() - p.d.born) / 86400000));
      const feedLeft = Math.max(0, FEED_COOLDOWN_MIN * 60000 - (now() - p.d.lastFed));
      card.innerHTML = `
        <div class="head">
          <span class="name">${esc(p.d.name)}</span>
          <span class="stage">${sp.name} · ${STAGE_KO[p.d.stage]} · 함께한 지 ${days}일 · 먹이 ${p.d.feeds}번</span>
        </div>
        ${p.d.stage === 'egg'
          ? `<div class="stat"><b>부화</b><div class="bar exp"><i style="width:${Math.min(100, p.d.feeds / 3 * 100)}%"></i></div><span>${Math.min(3, p.d.feeds)}/3</span></div>`
          : `<div class="stat"><b>배부름</b><div class="bar"><i style="width:${p.d.hunger}%"></i></div></div>
             <div class="stat"><b>행복</b><div class="bar happy"><i style="width:${p.d.happy}%"></i></div></div>
             ${p.d.stage === 'baby' ? `<div class="stat"><b>성장</b><div class="bar exp"><i style="width:${Math.min(100, p.d.exp)}%"></i></div><span>${Math.min(100, Math.floor(p.d.exp))}/100</span></div>` : ''}`}
        <div class="actions">
          <button class="small primary" data-act="feed">${p.d.stage === 'egg' ? '🤲 품어주기' : '🍽 ' + sp.foodName + ' 주기'}${feedLeft ? ` (${Math.ceil(feedLeft / 60000)}분 후)` : ''}</button>
          <button class="small" data-act="rename">✏️ 이름</button>
          <button class="small" data-act="find">📍 찾기</button>
          <button class="small danger" data-act="release">보내주기</button>
        </div>`;
      card.addEventListener('click', (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        selectedId = p.d.id;
        if (act === 'feed') feed(p.d.id);
        else if (act === 'rename') {
          const n = window.prompt('새 이름을 정해 주세요', p.d.name);
          if (n && n.trim()) { p.d.name = n.trim().slice(0, 12); markDirty(); say(p, `제 이름은 ${p.d.name}!`); }
        } else if (act === 'find') { p.x = W / 2; p.d.x = 0.5; setAnim(p, 'jump', 0.7); p.vy = 260; say(p, '여기 있어요!'); }
        else if (act === 'release') {
          if (e.target.dataset.confirm) {
            pets = pets.filter((q) => q !== p); state.pets = state.pets.filter((q) => q.id !== p.d.id);
            if (p.bubbleEl) p.bubbleEl.remove();
            foods = foods.filter((f) => f.petId !== p.d.id);
            markDirty();
          } else { e.target.dataset.confirm = '1'; e.target.textContent = '정말요? 한 번 더'; return; }
        }
        renderPetList();
      });
      box.appendChild(card);
    }
    $('#adoptBox').style.display = pets.length >= MAX_PETS ? 'none' : '';
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  $$('#adoptButtons button').forEach((b) => b.addEventListener('click', () => {
    if (pets.length >= MAX_PETS) return;
    const d = newPetData(b.dataset.species);
    state.pets.push(d);
    const p = makeRuntime(d); pets.push(p); selectedId = d.id;
    say(p, '알이 도착했어요! 품어주면 부화해요', 5000);
    markDirty(); renderPetList();
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
  function nameList() { return state.names.split('\n').map((s) => s.trim()).filter(Boolean); }
  function renderPickInfo() {
    const all = nameList();
    const left = all.filter((n) => !state.pickUsed.includes(n));
    $('#pickInfo').textContent = all.length ? `전체 ${all.length}명 · 아직 안 뽑힌 ${left.length}명` : '';
  }
  let picking = false;
  $('#btnPick').addEventListener('click', () => {
    if (picking) return;
    const all = nameList();
    const exclude = $('#pickExclude').checked;
    let pool = exclude ? all.filter((n) => !state.pickUsed.includes(n)) : all.slice();
    const n = clamp(+$('#pickCount').value || 1, 1, 10);
    if (!all.length) { $('#pickResult').textContent = '이름을 먼저 적어 주세요'; return; }
    if (pool.length < n) { if (exclude) { state.pickUsed = []; pool = all.slice(); } if (pool.length < n) { $('#pickResult').textContent = '사람이 부족해요'; return; } }
    picking = true;
    const res = $('#pickResult');
    let ticks = 0;
    const iv = setInterval(() => {
      res.textContent = pick(pool);
      if (++ticks > 18) {
        clearInterval(iv);
        const chosen = [];
        const tmp = pool.slice();
        for (let i = 0; i < n; i++) { const k = Math.floor(Math.random() * tmp.length); chosen.push(tmp.splice(k, 1)[0]); }
        res.textContent = chosen.join(', ');
        if (exclude) state.pickUsed.push(...chosen);
        markDirty(); renderPickInfo(); picking = false;
        const p = pets.find((q) => q.d.id === selectedId) || pets[0];
        if (p && p.d.stage !== 'egg') { setAnim(p, 'jump', 0.7); p.vy = 260; say(p, chosen.join(', ') + '!', 5000, true); }
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
      li.querySelector('input').addEventListener('change', (e) => { t.done = e.target.checked; markDirty(); renderTodos(); if (t.done) { const p = pets[0]; if (p) say(p, '하나 해냈다! 👏'); } });
      li.querySelector('[data-del]').addEventListener('click', () => { state.todos.splice(i, 1); markDirty(); renderTodos(); });
      ul.appendChild(li);
    });
  }
  function addTodo() {
    const v = $('#todoInput').value.trim(); if (!v) return;
    state.todos.push({ text: v, done: false }); $('#todoInput').value = ''; markDirty(); renderTodos();
  }
  $('#btnTodoAdd').addEventListener('click', addTodo);
  $('#todoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

  // 설정 탭
  function renderSettings() {
    $('#soundOn').checked = state.settings.sound;
    $('#chatterOn').checked = state.settings.chatter;
    $$('[data-size]').forEach((b) => b.classList.toggle('primary', +b.dataset.size === state.settings.size));
  }
  $$('[data-size]').forEach((b) => b.addEventListener('click', () => setSize(+b.dataset.size)));
  function setSize(s) { state.settings.size = s; markDirty(); renderSettings(); }
  $('#soundOn').addEventListener('change', (e) => { state.settings.sound = e.target.checked; markDirty(); if (e.target.checked) chime(); });
  $('#chatterOn').addEventListener('change', (e) => { state.settings.chatter = e.target.checked; markDirty(); });
  $('#autostart').addEventListener('change', (e) => api.setAutostart(e.target.checked));
  $('#btnQuit').addEventListener('click', async () => { await persist(); api.quit(); });

  // 메인 프로세스에서 오는 명령 (트레이 메뉴)
  api.on('ui:toggle-menu', togglePanel);
  api.on('timer:start', (kind) => startTimer(kind));
  api.on('timer:stop', () => stopTimer());
  api.on('pet:size', (s) => setSize(s));
  api.on('pet:toggle-visible', () => { visible = !visible; });
  api.on('work-area', () => setTimeout(resize, 50));

  // ---------- 시작 ----------
  async function init() {
    resize();
    const saved = await api.loadState();
    if (saved && saved.version === 1) {
      state = Object.assign(defaultState(), saved);
      state.settings = Object.assign(defaultState().settings, saved.settings || {});
    }
    // 자리 비운 시간만큼 살짝 배고파짐 (시간당 5, 최대 40)
    const away = Math.max(0, now() - (state.lastSeen || now()));
    const loss = Math.min(40, away / 3600000 * 5);
    for (const d of state.pets) { d.hunger = clamp(d.hunger - loss, 20, 100); }
    pets = state.pets.map(makeRuntime);
    if (pets.length) selectedId = pets[0].d.id;

    const info = await api.info();
    $('#version').textContent = 'v' + info.version;
    $('#autostart').checked = !!info.openAtLogin;
    namesEl.value = state.names; renderPickInfo();

    // 첫 실행이면 메뉴를 열어 입양 안내
    if (!pets.length) openPanel('pets');

    // 출석 (하루 한 번)
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
