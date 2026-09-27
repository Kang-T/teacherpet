// 돼지 가족 — 2편 확장 (2026-09-27)
//
// 닭과 따로 산다. 닭 코드(app.js 의 birds)는 건드리지 않는다 — 아이들 저장이 옮겨지는 위험을 만들지 않으려고.
// 선생님이 켜면(설정 스위치 또는 링크 ?pig=1) 할머니가 새끼를 밴 어미 돼지를 데려온다.
//
// 배우는 것 (로드맵 2편 · docs/기획_2편_확장팩_후보.md 안 A)
//   · 닭은 알, 돼지는 새끼를 낳아 젖을 먹인다 — 과학 [4과04-03] 한살이 유형이 다양하다
//   · 돼지는 땀을 거의 못 흘려 진흙으로 몸을 식힌다
//   · 돼지는 똥 누는 곳을 한쪽 구석으로 가린다 — '더럽다'는 오해
//
// 붙잡아 두지 않는다 (로드맵 부록 C)
//   · 돼지 가족의 하루 돌봄은 여물통 한 번 채우기뿐이다. 새끼는 어미 젖을 먹는다(따로 먹이지 않는다).
//   · 도축·판매 없음. 다 자란 돼지는 '큰 농장으로 이사'한다.
(function (g) {
  const TP = (g.TP = g.TP || {});

  // 돌본 날 — 어미가 여물을 먹은 날. [보통, 수업용 빠르게]
  const DAYS = { pregnant: [5, 2], piglet: [10, 3], grower: [20, 5] };
  const LITTER = 4;                            // 실제 한 배 8~12마리. 느린 크롬북과 화면을 생각해 넷만 보여 준다
  const SPEED = { sow: 1.1, grower: 1.5, piglet: 1.9 };
  const SPOTS = [0xD99A8F, 0xB98A7A, 0xF2D2C0, 0x9C7B6E];
  const NAMES = ['꿀꿀이', '분홍이', '콩떡이', '말랑이', '동글이', '호빵이', '두부', '보리떡', '감자', '고구마', '도토리', '찹쌀이'];
  const TROUGH_COOLDOWN = 60 * 60000, WALLOW_COOLDOWN = 30 * 60000;

  function create(ctx) {
    const { world, now, today, rand, clamp, clampZ, pick, toast, markDirty } = ctx;
    const S = () => ctx.state();
    let pigs = [];                              // 런타임 { d, m, x, z, ... }
    const fast = () => !!(S().settings && S().settings.fast);
    const need = (k) => DAYS[k][fast() ? 1 : 0];

    // ── 저장 ──
    function P() {
      const s = S();
      if (!s.pigs || typeof s.pigs !== 'object') s.pigs = {};
      const p = s.pigs;
      if (!Array.isArray(p.list)) p.list = [];
      for (const k of ['trough', 'wallow', 'lastTrough', 'lastWallow']) if (typeof p[k] !== 'number') p[k] = 0;
      if (!Array.isArray(p.album)) p.album = [];
      return p;
    }
    const on = () => !!P().on;
    const caredOn = (d, day) => !!((d.care || {})[day || today()] || {}).ate;
    const caredSince = (d) => Object.keys(d.care || {}).filter((day) => day >= (d.stageSince || '') && caredOn(d, day)).length;
    const sow = () => pigs.find((q) => q.d.stage === 'sow');

    function newRec(stage, extra) {
      const used = new Set(P().list.map((d) => d.name));
      const free = NAMES.filter((n) => !used.has(n));
      return Object.assign({ id: 'pig' + Math.random().toString(36).slice(2, 9), name: pick(free.length ? free : NAMES), stage, born: now(), stageSince: today(), care: {}, hunger: 80, mud: 0, x: 0, z: 0, spot: pick(SPOTS) }, extra || {});
    }
    function spawn(d) {
      const m = world.addPig(d.id, d.stage, d.stage === 'sow' ? null : d.spot);
      const rt = { d, m, x: d.x, z: d.z, y: 0, vy: 0, dir: 1, heading: 0, anim: 'idle', animT: 0, animDur: 2, tx: null, tz: null, goal: null, icon: null, iconUntil: 0, iconEl: null, tagEl: null };
      pigs.push(rt); return rt;
    }
    function despawn(rt) { world.removePig(rt.d.id); if (rt.iconEl) rt.iconEl.remove(); if (rt.tagEl) rt.tagEl.remove(); pigs = pigs.filter((q) => q !== rt); }

    // ── 켜기·끄기 ──
    function load() {
      for (const rt of pigs.slice()) despawn(rt);
      if (!on()) return;
      for (const d of P().list) {
        if (typeof d.x !== 'number' || !isFinite(d.x)) { const h = ctx.home(); d.x = h.trough.x + rand(-2, 2); d.z = h.trough.z + rand(-1, 2); }
        spawn(d);
      }
    }
    function enable(v, quiet) {
      const p = P();
      if (!!p.on === !!v) return;
      p.on = !!v; markDirty();
      ctx.layout();
      if (v && !p.list.length) {
        const h = ctx.home();
        p.list.push(newRec('sow', { name: '복순이', pregnant: true, x: h.trough.x + 1.5, z: h.trough.z + 1.2 }));
        p.trough = 60; p.wallow = 40;
        ctx.later(() => { const s0 = pigs.find((q) => q.d.stage === 'sow'); if (s0) ctx.note('pigArrive', s0); }, 300);
        if (!quiet) ctx.later(() => ctx.say('이웃 농장에서 어미 돼지를 한 마리 데려왔단다. 이름은 복순이야.\n곧 새끼를 낳을 게다. 닭은 알을 낳지만, 돼지는 새끼를 낳아 젖을 먹인단다.\n돼지 여물통만 하루 한 번 채워 주렴.', 'proud'), 1200);
      } else if (!v && !quiet) toast('🐷 돼지 가족은 이웃 농장에 잠시 놀러 갔어요. 다시 켜면 돌아와요', false, 6000);
      load();
      ctx.refresh();
    }

    // ── 돌봄 ──
    function fillTrough() {
      const p = P();
      const left = TROUGH_COOLDOWN - (now() - p.lastTrough);
      if (left > 0 && p.trough > 50) { toast(`🐷 여물이 아직 넉넉해요 (${Math.ceil(left / 60000)}분 뒤에 다시 채울 수 있어요)`, false, 5000); return false; }
      p.trough = 100; p.lastTrough = now(); markDirty(); world.setTrough(p.trough);
      toast('🐷 여물통을 채웠어요. 돼지들이 몰려와요', false, 4000);
      for (const rt of pigs) if (rt.d.stage !== 'piglet') rt.d.hunger = Math.min(rt.d.hunger, 55);   // 여물 냄새에 몰려온다
      for (const rt of pigs) decide(rt);
      ctx.refresh();
      return true;
    }
    function waterWallow() {
      const p = P();
      const left = WALLOW_COOLDOWN - (now() - p.lastWallow);
      if (left > 0 && p.wallow > 60) { toast(`🟤 진흙탕이 아직 촉촉해요 (${Math.ceil(left / 60000)}분 뒤에 다시)`, false, 5000); return false; }
      p.wallow = 100; p.lastWallow = now(); markDirty(); world.setWallow(p.wallow);
      toast(ctx.hot() ? '🟤 진흙탕에 물을 부었어요. 더운 날엔 돼지가 뒹굴러 와요' : '🟤 진흙탕에 물을 부었어요. 더운 날 돼지가 좋아해요', false, 5000);
      for (const rt of pigs) decide(rt);
      ctx.refresh();
      return true;
    }
    function markAte(rt) {
      const day = today();
      rt.d.care = rt.d.care || {};
      rt.d.care[day] = Object.assign({}, rt.d.care[day], { ate: true });
      // 새끼는 어미 젖을 먹는다 — 어미가 먹은 날은 젖먹이 새끼도 돌본 날이다
      if (rt.d.stage === 'sow') for (const q of pigs) if (q.d.stage === 'piglet') q.d.care[day] = Object.assign({}, q.d.care[day], { ate: true });
      markDirty(); grow(); ctx.cared();
    }
    const caredToday = () => !on() || !pigs.length || pigs.every((rt) => caredOn(rt.d));

    // ── 자라기 ──
    function grow() {
      const p = P();
      const s0 = sow();
      if (s0 && s0.d.pregnant && caredSince(s0.d) >= need('pregnant')) {
        s0.d.pregnant = false; s0.d.stageSince = today();
        const n = LITTER;
        for (let i = 0; i < n; i++) {
          const d = newRec('piglet', { x: s0.x + rand(-1, 1), z: s0.z + rand(-0.8, 0.8), mom: s0.d.id });
          p.list.push(d); const rt = spawn(d); rt.anim = 'pile';
        }
        markDirty();
        ctx.note('pigBirth', s0);
        ctx.later(() => ctx.say(`복순이가 새끼 ${n}마리를 낳았구나!\n닭은 알을 품어 병아리가 깨어나지만, 돼지는 이렇게 새끼로 태어난단다.\n새끼들은 한동안 어미 젖만 먹을 게다. 추위를 많이 타니 보온등 곁에 있게 해 주렴.`, 'proud'), 800);
      }
      for (const rt of pigs.slice()) {
        const d = rt.d;
        if (d.stage === 'piglet' && caredSince(d) >= need('piglet')) {
          d.stage = 'grower'; d.stageSince = today(); world.setPigStage(rt.m, 'grower'); markDirty();
          toast(`🐷 ${d.name}(이)가 젖을 떼고 어린 돼지가 됐어요. 이제 여물을 먹어요`, true, 7000);
        } else if (d.stage === 'grower' && caredSince(d) >= need('grower')) {
          p.album.push({ name: d.name, born: new Date(d.born).toISOString().slice(0, 10), left: today() });
          p.list = p.list.filter((x) => x.id !== d.id); despawn(rt); markDirty();
          ctx.say(`${d.name}(이)가 다 자랐구나. 우리 마당은 좁아서, 큰 농장으로 이사 간단다.\n거기엔 친구 돼지들이 많아. 잘 키워 줘서 고맙다.`, 'smile');
        }
      }
      ctx.refresh();
    }

    // ── 행동 ──
    function goTo(rt, x, z, arrive, goal) { rt.tx = clamp(x, world.xMin + 1.5, world.xMax - 1.5); rt.tz = clampZ(z); rt.arrive = arrive; rt.goal = goal || null; setAnim(rt, 'walk', 30); }
    function setAnim(rt, a, dur) { rt.anim = a; rt.animT = 0; rt.animDur = dur; }
    // 젖 먹는 자리 — 어미 배 쪽에 새끼마다 제 자리가 있다 (진짜 새끼 돼지도 자기 젖꼭지 자리가 정해져 있다)
    // 어미는 오른쪽 옆구리를 대고 누우므로 배는 몸의 +x 쪽을 향한다
    function teat(s0, rt) {
      const kids = pigs.filter((q) => q.d.stage === 'piglet');
      const i = Math.max(0, kids.indexOf(rt)), n = Math.max(1, kids.length);
      const h = s0.heading || 0;
      const bx = Math.cos(h), bz = -Math.sin(h);                 // 배 쪽 (몸의 +x)
      const fx = Math.sin(h), fz = Math.cos(h);                  // 머리 쪽 (몸의 +z)
      const along = (i - (n - 1) / 2) * 0.55;                     // 몸통을 따라 나란히
      return { x: s0.x + bx * 1.45 + fx * along, z: s0.z + bz * 1.45 + fz * along };
    }
    // 젖을 줄 때는 배를 화면 쪽(+z)으로 두고 눕는다 — 새끼들이 어미 등 뒤에 가려지지 않게.
    // 배는 몸의 +x 쪽이므로 머리를 왼쪽(-x)으로 두면 배가 앞을 본다.
    function faceBellyToView(rt) { rt.heading = -Math.PI / 2 + 0.62 + rand(-0.15, 0.15); }   // 정면보다 비스듬히 — 옆모습과 젖 먹는 새끼가 함께 보인다
    function toilet() { const h = ctx.home(); return { x: h.wallow.x + (h.flip ? -3.2 : 3.2), z: h.wallow.z + 2.2 }; }
    function decide(rt) {
      const d = rt.d, h = ctx.home(), p = P(), s0 = sow();
      rt.tx = null; rt.tz = null; rt.goal = null;
      // 아무도 안 볼 때는 잔다 (닭과 같다)
      if (ctx.resting()) {
        if (d.stage === 'piglet' && s0) { goTo(rt, s0.x + rand(-0.9, 0.9), s0.z + rand(-0.9, 0.9), 'pile'); return; }
        setAnim(rt, 'sleep', rand(20, 40)); return;
      }
      if (d.stage === 'piglet') {
        // 어미가 젖을 주면 달려간다 · 어미가 자면 곁에 붙어 잔다 · 아니면 따라다니며 논다
        if (s0 && s0.anim === 'nurse') { const t = teat(s0, rt); goTo(rt, t.x, t.z, 'suckle'); return; }
        if (s0 && s0.anim === 'sleep') { goTo(rt, s0.x + rand(-1, 1), s0.z + rand(-1, 1), 'pile'); return; }
        const cold = ctx.cold();
        const ws = ctx.warmSpot();
        const r = Math.random();
        if (cold && ws && r < 0.5) { goTo(rt, ws.x + rand(-0.8, 0.8), ws.z + rand(-0.6, 0.6), 'pile'); return; }
        if (r < 0.25) { setAnim(rt, 'zoom', rand(2.5, 4)); rt.zoomDir = rand(0, Math.PI * 2); return; }
        if (r < 0.45) { goTo(rt, rt.x + rand(-2.5, 2.5), rt.z + rand(-1.5, 1.5), 'root'); return; }
        if (s0) { goTo(rt, s0.x + rand(-2, 2), s0.z + rand(-1.5, 1.5), 'idle'); return; }
        setAnim(rt, 'idle', rand(2, 4)); return;
      }
      // 어미·어린 돼지
      const kids = pigs.filter((q) => q.d.stage === 'piglet');
      if (d.stage === 'sow' && kids.length && Math.random() < 0.35) { faceBellyToView(rt); setAnim(rt, 'nurse', rand(8, 14)); for (const q of kids) decide(q); return; }
      if (d.hunger < 60 && p.trough > 5) { goTo(rt, h.trough.x + rand(-0.9, 0.9), h.trough.z + 0.85, 'eat', 'trough'); return; }
      // 더운 날은 꼭, 아니어도 진흙이 촉촉하면 가끔 뒹군다 (돼지는 진흙을 좋아한다)
      if (p.wallow > 20 && (d.mud || 0) < 0.5 && (ctx.hot() || (p.wallow > 40 && Math.random() < 0.18))) { goTo(rt, h.wallow.x + rand(-1, 1), h.wallow.z + rand(-0.5, 0.5), 'mud', 'wallow'); return; }
      const r = Math.random();
      if (r < 0.08) { const t = toilet(); goTo(rt, t.x + rand(-0.5, 0.5), t.z + rand(-0.4, 0.4), 'toilet'); return; }
      if (r < 0.35) { goTo(rt, rt.x + rand(-4, 4), rt.z + rand(-3, 3), 'root'); return; }
      if (r < 0.5) { setAnim(rt, 'sleep', rand(10, 20)); return; }
      if (r < 0.75) { goTo(rt, h.trough.x + rand(-5, 5), h.trough.z + rand(-3, 4), 'sniff'); return; }
      setAnim(rt, 'idle', rand(2, 5));
    }
    function arrived(rt) {
      const p = P(), a = rt.arrive || 'idle';
      rt.tx = null; rt.tz = null;
      if (a === 'eat') {
        const h = ctx.home(), near = Math.hypot(rt.x - h.trough.x, rt.z - h.trough.z) < 3.2;
        if (p.trough > 5 && near) { setAnim(rt, 'eat', 4); rt.eating = true; }
        else { setAnim(rt, 'sniff', 2); showIcon(rt, '❓', 1500); }
      } else if (a === 'mud') { setAnim(rt, 'mud', rand(5, 8)); p.wallow = Math.max(0, p.wallow - 6); world.setWallow(p.wallow); markDirty(); }
      else if (a === 'toilet') { setAnim(rt, 'toilet', 2); ctx.poop(rt.x, rt.z); }
      else if (a === 'root') { setAnim(rt, 'root', rand(3, 5)); }
      else if (a === 'suckle') { const s0 = sow(); if (s0 && s0.anim === 'nurse') { rt.heading = Math.atan2(s0.x - rt.x, s0.z - rt.z); setAnim(rt, 'suckle', Math.max(1.5, s0.animDur - s0.animT)); } else decide(rt); }
      else if (a === 'pile') { setAnim(rt, 'pile', rand(12, 25)); }
      else setAnim(rt, a, rand(2, 4));
    }
    function finished(rt) {
      if (rt.anim === 'eat' && rt.eating) {
        rt.eating = false; const p = P();
        p.trough = Math.max(0, p.trough - (rt.d.stage === 'sow' ? 12 : 7)); world.setTrough(p.trough);
        rt.d.hunger = 100; showIcon(rt, '😋', 1500); markAte(rt);
      }
      if (rt.anim === 'mud') { rt.d.mud = 1; showIcon(rt, '😌', 1500); markDirty(); }
      decide(rt);
    }
    function showIcon(rt, icon, ms) { rt.icon = icon; rt.iconUntil = now() + (ms || 2000); }

    // ── 쓰다듬기 ──
    function touch(id) {
      const rt = pigs.find((q) => q.d.id === id); if (!rt) return null;
      ctx.dex(rt);                                   // 그 순간의 행동이 도감에 오를 수 있다
      rt.tx = null;
      if (rt.d.stage === 'piglet') { rt.vy = 3.4; setAnim(rt, 'happy', 1.2); showIcon(rt, '💗', 1500); }
      else if (rt.anim !== 'nurse' && rt.anim !== 'eat') { setAnim(rt, 'flop', 3.5); showIcon(rt, '🥰', 2000); }
      else showIcon(rt, '💗', 1200);
      return rt.anim;
    }

    // ── 매 프레임 ──
    function tick(dt) {
      if (!on()) return;
      const p = P();
      // 진흙탕은 마르고, 돼지 몸의 진흙도 마른다
      p.wallow = Math.max(0, p.wallow - dt * (ctx.hot() ? 0.03 : 0.012));
      world.setWallow(p.wallow); world.setTrough(p.trough);
      for (const rt of pigs) {
        const d = rt.d;
        d.hunger = Math.max(0, d.hunger - dt * (100 / (8 * 3600)));
        d.mud = Math.max(0, (d.mud || 0) - dt / 900);
        const sp = SPEED[d.stage] || 1.2;
        let moving = false;
        if (rt.tx !== null) {
          const dx = rt.tx - rt.x, dz = rt.tz - rt.z, dist = Math.hypot(dx, dz);
          // 막혀서 1.5초 동안 거의 못 가면(장식·기구가 길을 막음) 거기서 멈춘다 — 닿지 못할 곳을 향해 제자리걸음하지 않게
          if (!rt.prog || Math.hypot(rt.x - rt.prog.x, rt.z - rt.prog.z) > 0.3) rt.prog = { x: rt.x, z: rt.z, t: now() };
          const stuck = now() - rt.prog.t > 1500;
          if (dist < 0.15 || (stuck && dist < 2.5)) { rt.prog = null; arrived(rt); }
          else if (stuck) { rt.prog = null; rt.tx = null; decide(rt); }
          else { const st = Math.min(dist, sp * dt); rt.x += dx / dist * st; rt.z = clampZ(rt.z + dz / dist * st); rt.heading = Math.atan2(dx, dz); moving = true; }
        } else if (rt.anim === 'zoom') {
          rt.zoomDir += rand(-2, 2) * dt;
          rt.x = clamp(rt.x + Math.sin(rt.zoomDir) * sp * 1.6 * dt, world.xMin + 1.5, world.xMax - 1.5);
          rt.z = clampZ(rt.z + Math.cos(rt.zoomDir) * sp * 1.6 * dt);
          rt.heading = rt.zoomDir; moving = true;
          if (rt.y === 0 && Math.random() < dt * 2.5) rt.vy = 2.6;
        }
        if (rt.anim === 'root' && Math.random() < dt * 2) world.puff(rt.x + Math.sin(rt.heading) * 0.7, rt.z + Math.cos(rt.heading) * 0.7, 2, 0.25, 0x8B6B47);
        // 뛰기
        if (rt.y > 0 || rt.vy > 0) { rt.vy -= 14 * dt; rt.y = Math.max(0, rt.y + rt.vy * dt); if (rt.y === 0) rt.vy = 0; }
        ctx.keepOut(rt, rt.m.model.height * 0.28);
        rt.animT += dt;
        if (rt.tx === null && rt.animT > rt.animDur) finished(rt);
        d.x = rt.x; d.z = rt.z;
        // 그리기
        rt.m.holder.position.set(rt.x, 0, rt.z);
        rt.m.holder.rotation.y = rt.heading;
        rt.m.model.update(dt, { anim: rt.anim === 'pile' ? 'sleep' : rt.anim === 'toilet' ? 'idle' : rt.anim, moving, speed: rt.anim === 'zoom' ? 1.8 : 1, mud: d.mud, jumpY: rt.y });
        const top = world.project(rt.x, rt.m.model.height + 0.3 + rt.y, rt.z);
        const showI = rt.icon && now() < rt.iconUntil;
        if (showI) { if (!rt.iconEl) { rt.iconEl = document.createElement('div'); rt.iconEl.className = 'icon'; ctx.overlay.appendChild(rt.iconEl); } rt.iconEl.textContent = rt.icon; rt.iconEl.style.left = top.x + 'px'; rt.iconEl.style.top = top.y + 'px'; rt.iconEl.style.display = ''; }
        else if (rt.iconEl) rt.iconEl.style.display = 'none';
        if ((rt.anim === 'sleep' || rt.anim === 'pile') && ctx.sleeping() && !showI) showIcon(rt, '💤', 3000);
        const tag = ctx.hoverPig() === d.id;
        if (tag) { if (!rt.tagEl) { rt.tagEl = document.createElement('div'); rt.tagEl.className = 'tag'; ctx.overlay.appendChild(rt.tagEl); } rt.tagEl.textContent = `${d.name} · ${KO[d.stage]}${d.pregnant ? ' · 새끼 밴 어미' : ''}`; rt.tagEl.style.left = top.x + 'px'; rt.tagEl.style.top = (top.y - (showI ? 30 : 0)) + 'px'; rt.tagEl.style.display = ''; }
        else if (rt.tagEl) rt.tagEl.style.display = 'none';
      }
    }
    setInterval(() => { if (on()) for (const rt of pigs) if (rt.tx === null && rt.anim === 'idle' && rt.animT > rt.animDur) decide(rt); }, 1000);

    const KO = { sow: '어미 돼지', piglet: '새끼 돼지', grower: '어린 돼지' };
    // 닭장 메뉴에 들어갈 요약
    function summary() {
      const p = P();
      return {
        on: on(), trough: Math.round(p.trough), wallow: Math.round(p.wallow),
        list: pigs.map((rt) => {
          const d = rt.d;
          const key = d.stage === 'sow' ? (d.pregnant ? 'pregnant' : null) : d.stage;
          const left = key ? Math.max(0, need(key) - caredSince(d)) : null;
          return { id: d.id, name: d.name, stage: d.stage, ko: KO[d.stage], pregnant: !!d.pregnant, left, caredToday: caredOn(d), anim: rt.anim };
        }),
        album: p.album.length,
      };
    }

    return {
      load, enable, on, tick, touch, fillTrough, waterWallow, caredToday, summary, decide: () => pigs.forEach(decide),
      list: () => pigs, wakeAll: () => pigs.forEach(decide),
      _nurse: (dur) => { const s0 = sow(); if (!s0) return false; s0.tx = null; faceBellyToView(s0); setAnim(s0, 'nurse', dur || 20); for (const q of pigs) if (q.d.stage === 'piglet') decide(q); return true; },
      // 검사용
      _grow: grow, _rt: (name) => pigs.find((q) => q.d.name === name), _feedAll: () => { for (const rt of pigs) markAte(rt); },
      _forceDays: (n) => { for (const rt of pigs) { for (let i = 1; i <= n; i++) { const day = ctx.addDays(today(), -i); rt.d.care[day] = { ate: true }; } rt.d.stageSince = ctx.addDays(today(), -n - 1); } grow(); },
    };
  }

  TP.pigs = { create, DAYS, LITTER };
})(typeof window !== 'undefined' ? window : module.exports);
