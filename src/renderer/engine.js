// 티처펫 — 이미지 기반 캐릭터 엔진
// 포즈 이미지(PNG, 투명 배경)를 절차적 움직임(숨쉬기·통통·기울기·찌그러짐)과 합쳐 살아 있는 느낌을 낸다.
(function (global) {
  const SPECIES = {
    // 닭 한살이 (형태별로 이미지 폴더가 다르다)
    chick: { name: '병아리', special: 'peck', speed: 55, height: 0.55 },
    young: { name: '어린닭', special: 'flap', speed: 65, height: 0.75 },
    hen: { name: '암탉', special: 'brood', speed: 50, height: 0.95 },
    rooster: { name: '수탉', special: 'crow', speed: 60, height: 1.05 },
    hamster: { name: '햄스터', special: 'wheel', speed: 70, foodName: '해바라기씨', cry: '찍찍!', flyer: false, height: 1.0 },
    turtle: { name: '거북이', special: 'hide', speed: 18, foodName: '상추', cry: '...느긋', flyer: false, height: 0.8 },
    rabbit: { name: '토끼', special: 'hop', speed: 65, foodName: '당근', cry: '깡총!', flyer: false, height: 1.15 },
    cockatiel: { name: '앵무새', special: 'fly', speed: 160, foodName: '씨앗', cry: '삐이!', flyer: true, height: 1.0 },
  };
  const POSES = ['idle', 'walk', 'sleep', 'eat', 'lookup', 'happy', 'sad', 'side'];

  // 이미지 캐시. 없는 포즈는 대체 포즈로 내려간다.
  const FALLBACK = { walk: 'side', side: 'idle', sleep: 'idle', eat: 'idle', lookup: 'idle', happy: 'idle', sad: 'idle',
    wheel: 'walk', peck: 'walk', hide: 'idle', hop: 'happy', fly: 'happy', perch: 'idle', flap: 'happy', brood: 'sleep', crow: 'lookup', egg: null };
  const cache = {};
  function img(species, pose) {
    const key = species + '/' + pose;
    if (cache[key] !== undefined) return cache[key];
    const im = new Image();
    im.onload = () => { cache[key] = im; };
    im.onerror = () => { cache[key] = null; };
    cache[key] = false; // 로딩 중
    im.src = species === 'props' ? `assets/props/${pose}.png` : `assets/pets/${species}/${pose}.png`;
    return false;
  }
  function pick(species, pose) {
    let p = pose, guard = 0;
    while (p && guard++ < 8) {
      const r = img(species, p);
      if (r) return { im: r, pose: p };
      if (r === false) return null; // 아직 로딩 중
      p = FALLBACK[p] === undefined ? 'idle' : FALLBACK[p];
      if (p === pose) break;
    }
    return null;
  }
  const propCache = {};
  function prop(name) {
    if (propCache[name] !== undefined) return propCache[name];
    const im = new Image();
    im.onload = () => { propCache[name] = im; };
    im.onerror = () => { propCache[name] = null; };
    propCache[name] = false;
    im.src = `assets/props/${name}.png`;
    return false;
  }
  function preload(species) { for (const p of POSES) img(species, p); img(species, SPECIES[species].special); img(species, 'egg'); }

  // 절차적 움직임: 포즈·시간에 따라 스케일/기울기/오프셋을 돌려준다.
  function motion(anim, t, f) {
    const m = { sx: 1, sy: 1, rot: 0, dy: 0 };
    switch (anim) {
      case 'idle': case 'sit': case 'perch': {
        const b = Math.sin(t * 2.2) * 0.015; m.sy = 1 + b; m.sx = 1 - b * 0.6; break;
      }
      case 'walk': case 'peck': {
        const ph = t * 11;
        m.dy = -Math.abs(Math.sin(ph)) * 7;
        m.rot = Math.sin(ph) * 0.06;
        m.sy = 1 + Math.cos(ph * 2) * 0.03; m.sx = 1 - Math.cos(ph * 2) * 0.03; break;
      }
      case 'sleep': { const b = Math.sin(t * 1.1) * 0.025; m.sy = 1 + b; m.sx = 1 - b * 0.5; break; }
      case 'eat': { m.rot = Math.sin(t * 9) * 0.035; m.sy = 1 + Math.sin(t * 9) * 0.02; break; }
      case 'lookup': { m.rot = Math.sin(t * 3) * 0.03; break; }
      case 'sad': { m.sy = 0.96; m.sx = 1.03; m.rot = Math.sin(t * 1.5) * 0.02; break; }
      case 'wheel': { m.dy = -Math.abs(Math.sin(t * 16)) * 3; m.rot = Math.sin(t * 16) * 0.02; break; }
      case 'hide': { m.rot = Math.sin(t * 5) * 0.05; break; }
      case 'flap': { m.sy = 1 + Math.abs(Math.sin(t * 12)) * 0.06; m.dy = -Math.abs(Math.sin(t * 12)) * 5; break; }
      case 'brood': { const b = Math.sin(t * 1.3) * 0.02; m.sy = 1 + b; m.sx = 1 - b; break; }
      case 'crow': { m.rot = -0.06 + Math.sin(t * 20) * 0.02; m.sy = 1.03; break; }
      case 'egg': { m.rot = Math.sin(t * 6) * 0.12 * (f ? 1 : 0); break; }
      case 'fly': { m.sy = 1 + Math.sin(t * 14) * 0.08; m.dy = Math.sin(t * 14) * 4; m.rot = -0.08; break; }
      case 'happy': case 'jump': case 'hop': case 'fall': break;
      default: break;
    }
    return m;
  }

  // 그리기. x = 발 중앙, ground = 바닥 y, y = 바닥에서 띄운 높이(px), h = 목표 높이(px)
  function drawEggFallback(ctx, o) {
    const h = o.height, w = h * 0.78, m = motion(o.anim, o.t, o.f);
    ctx.save(); ctx.translate(o.x, o.ground - o.y); ctx.rotate(m.rot);
    ctx.globalAlpha = 0.2; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, -2, w * 0.45, h * 0.07, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(-w * 0.2, -h * 0.65, w * 0.1, 0, -h * 0.5, h * 0.7);
    g.addColorStop(0, '#FFFDF6'); g.addColorStop(1, '#E9D9B8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,170,120,.45)'; for (const [dx, dy, r] of [[-0.15, -0.6, 0.06], [0.18, -0.45, 0.05], [0.02, -0.28, 0.045]]) { ctx.beginPath(); ctx.arc(dx * w, dy * h, r * h, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return { w, h, left: o.x - w / 2, top: o.ground - o.y - h };
  }

  function drawPet(ctx, o) {
    const r = pick(o.species, o.pose);
    if (!r) { if (o.pose === 'egg' && img(o.species, o.pose) === null) return drawEggFallback(ctx, o); return null; }
    const { im } = r;
    const h = o.height, w = h * im.width / im.height;
    const m = motion(o.anim, o.t, o.f);
    // 착지 찌그러짐
    if (o.squash > 0) { m.sy *= 1 - o.squash * 0.25; m.sx *= 1 + o.squash * 0.25; }
    // 바닥 그림자
    const shH = o.y > 0 ? Math.max(0.3, 1 - o.y / 220) : 1;
    ctx.save();
    ctx.globalAlpha = 0.22 * shH;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(o.x, o.ground - 2, w * 0.38 * shH, h * 0.06 * shH, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(o.x, o.ground - o.y + m.dy);
    ctx.rotate(m.rot * (o.dir < 0 ? -1 : 1));
    ctx.scale(m.sx * (o.dir < 0 ? -1 : 1), m.sy);
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
    return { w, h: h * m.sy, left: o.x - w / 2, top: o.ground - o.y - h * m.sy + m.dy };
  }

  function drawProp(ctx, name, x, ground, height, flip) {
    const im = prop(name);
    if (!im) return null;
    const w = height * im.width / im.height;
    ctx.save();
    ctx.translate(x, ground);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -height, w, height);
    ctx.restore();
    return { w, h: height, left: x - w / 2, top: ground - height };
  }

  global.TP_ENGINE = { SPECIES, POSES, drawPet, drawProp, preload, prop, img };
})(typeof window !== 'undefined' ? window : module.exports);
