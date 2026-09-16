// 티처펫 — 벡터(부드러운 일러스트) 캐릭터
// 모든 캐릭터는 200×200 상자 안에 그린다. 바닥 = y 200. 오른쪽을 보는 것이 기본.
(function (global) {
  const OUT = '#5A3A1E';

  // 여러 도형을 "먼저 전부 윤곽선, 그다음 전부 채움"으로 그려서 겹치는 곳에 선이 남지 않게 한다.
  function group(ctx, shapes, fill, outline = OUT, lw = 5) {
    if (outline) {
      ctx.lineWidth = lw; ctx.strokeStyle = outline; ctx.lineJoin = 'round';
      for (const s of shapes) { ctx.beginPath(); s(ctx); ctx.stroke(); }
    }
    ctx.fillStyle = fill;
    for (const s of shapes) { ctx.beginPath(); s(ctx); ctx.fill(); }
  }
  const ell = (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  const circ = (x, y, r) => (c) => c.arc(x, y, r, 0, Math.PI * 2);
  function fillShape(ctx, shape, fill) { ctx.fillStyle = fill; ctx.beginPath(); shape(ctx); ctx.fill(); }
  function grad(ctx, x0, y0, x1, y1, c0, c1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }

  function eyeDot(ctx, x, y, r, closed) {
    if (closed) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y - 2, r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      return;
    }
    fillShape(ctx, circ(x, y, r), '#2A1A10');
    fillShape(ctx, circ(x - r * 0.35, y - r * 0.35, r * 0.38), '#FFF');
    fillShape(ctx, circ(x + r * 0.3, y + r * 0.3, r * 0.16), '#FFF');
  }
  function blush(ctx, x, y, r) { ctx.globalAlpha = 0.55; fillShape(ctx, ell(x, y, r, r * 0.7), '#FF8FA3'); ctx.globalAlpha = 1; }

  // ---------- 햄스터 ----------
  const H = { body: '#F2B76B', dark: '#D8934A', cream: '#FFF6E5', pinkIn: '#FFB9C6' };

  function hamsterFront(ctx, o) {
    const bob = o.f ? 2 : 0;
    const body = grad(ctx, 40, 60, 160, 200, '#F7C47F', H.dark);
    // 귀
    group(ctx, [circ(62, 44 + bob, 19), circ(138, 44 + bob, 19)], H.body);
    fillShape(ctx, circ(62, 46 + bob, 10), H.pinkIn); fillShape(ctx, circ(138, 46 + bob, 10), H.pinkIn);
    // 몸+머리
    group(ctx, [ell(100, 92 + bob, 64, 56), ell(100, 140, 68, 54)], body);
    // 배·볼
    fillShape(ctx, ell(100, 150, 42, 38), H.cream);
    fillShape(ctx, ell(70, 108 + bob, 27, 21), H.cream); fillShape(ctx, ell(130, 108 + bob, 27, 21), H.cream);
    if (o.pose === 'eat' && o.f) { fillShape(ctx, ell(66, 110 + bob, 31, 24), H.cream); fillShape(ctx, ell(134, 110 + bob, 31, 24), H.cream); }
    // 눈·코·입
    eyeDot(ctx, 78, 90 + bob, 8, o.blink); eyeDot(ctx, 122, 90 + bob, 8, o.blink);
    fillShape(ctx, ell(100, 102 + bob, 5, 4), '#E8788F');
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(93, 108 + bob); ctx.quadraticCurveTo(96.5, 113 + bob, 100, 108 + bob); ctx.quadraticCurveTo(103.5, 113 + bob, 107, 108 + bob); ctx.stroke();
    blush(ctx, 58, 104 + bob, 9); blush(ctx, 142, 104 + bob, 9);
    // 수염
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(90,58,30,.6)';
    for (const s of [-1, 1]) for (const dy of [-4, 4]) { ctx.beginPath(); ctx.moveTo(100 + s * 34, 104 + bob + dy); ctx.lineTo(100 + s * 58, 100 + bob + dy * 2.2); ctx.stroke(); }
    // 발
    group(ctx, [ell(76, 190, 17, 8), ell(124, 190, 17, 8)], H.dark, OUT, 4);
    // 손 (+ 먹이)
    if (o.pose === 'eat') {
      fillShape(ctx, ell(100, 126 + bob, 9, 14, 0.2), '#3E2A14'); fillShape(ctx, ell(100, 126 + bob, 4, 9, 0.2), '#D9D0B8');
      group(ctx, [ell(88, 132 + bob, 12, 9), ell(112, 132 + bob, 12, 9)], H.cream, OUT, 3.5);
    } else group(ctx, [ell(80, 156, 13, 9), ell(120, 156, 13, 9)], H.cream, OUT, 3.5);
  }

  function hamsterSide(ctx, o) {
    const run = o.pose === 'wheel';
    const walk = o.pose === 'walk' || run;
    const leg = walk ? (o.f ? 10 : -10) : 0;
    const body = grad(ctx, 40, 60, 160, 200, '#F7C47F', H.dark);
    const hy = o.pose === 'drink' ? -16 : 0; // 물 마실 때 고개 들기
    // 꼬리
    group(ctx, [ell(176, 150, 8, 6)], H.dark, OUT, 3.5);
    // 뒷다리 (뒤)
    group(ctx, [ell(150 + leg * 0.6, 186, 16, 9)], H.dark, OUT, 4);
    // 귀
    group(ctx, [circ(62, 66 + hy, 17), circ(92, 60 + hy, 15)], H.body);
    fillShape(ctx, circ(62, 68 + hy, 9), H.pinkIn); fillShape(ctx, circ(92, 62 + hy, 8), H.pinkIn);
    // 몸+머리
    group(ctx, [ell(70, 106 + hy, 48, 42), ell(118, 136, 66, 50)], body);
    fillShape(ctx, ell(122, 158, 44, 30), H.cream);
    fillShape(ctx, ell(48, 122 + hy, 24, 18), H.cream);
    if (run || walk) blush(ctx, 40, 116 + hy, 8);
    eyeDot(ctx, 48, 100 + hy, 7, o.blink || o.pose === 'sleep');
    fillShape(ctx, ell(24, 114 + hy, 5, 4), '#E8788F');
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(90,58,30,.6)';
    for (const dy of [-3, 3]) { ctx.beginPath(); ctx.moveTo(34, 118 + hy + dy); ctx.lineTo(8, 116 + hy + dy * 3); ctx.stroke(); }
    // 앞다리·뒷다리 (앞)
    group(ctx, [ell(84 - leg, 188, 15, 8), ell(140 - leg * 0.6, 190, 16, 9)], H.dark, OUT, 4);
  }

  function hamsterSleep(ctx, o) {
    const br = o.f ? 3 : 0;
    const body = grad(ctx, 40, 90, 160, 200, '#F7C47F', H.dark);
    group(ctx, [circ(58, 128, 15)], H.body);
    fillShape(ctx, circ(58, 130, 8), H.pinkIn);
    group(ctx, [ell(110, 150 - br * 0.5, 72, 46 + br), ell(70, 150, 42, 36)], body);
    fillShape(ctx, ell(58, 160, 22, 14), H.cream);
    eyeDot(ctx, 50, 142, 7, true);
    fillShape(ctx, ell(30, 154, 4, 3.5), '#E8788F');
    blush(ctx, 42, 156, 7);
    group(ctx, [ell(150, 190, 16, 8)], H.dark, OUT, 4);
    // zzz
    ctx.fillStyle = '#6FA8DC'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText('z', 120 + (o.f ? 4 : 0), 90); ctx.font = 'bold 16px sans-serif'; ctx.fillText('z', 140, 70 + (o.f ? -4 : 0));
  }

  function drawHamster(ctx, o) {
    if (o.pose === 'sleep') hamsterSleep(ctx, o);
    else if (o.pose === 'front' || o.pose === 'eat' || o.pose === 'idle') hamsterFront(ctx, o);
    else hamsterSide(ctx, o);
  }

  // ---------- 앵무새 (왕관앵무) ----------
  const C = { body: '#E4E7EC', dark: '#B9BFC9', head: '#FFE066', cheek: '#FF9F4A', beak: '#C9C2B6' };
  function drawCockatiel(ctx, o) {
    const fly = o.pose === 'fly';
    const flap = fly ? (o.f ? -1 : 1) : 0;
    const body = grad(ctx, 60, 60, 160, 200, '#F4F6F9', C.dark);
    // 꼬리
    group(ctx, [ell(150, 150, 14, 42, -0.55)], C.dark, OUT, 4);
    // 뒤 날개 (날 때)
    if (fly) group(ctx, [ell(120, 110 + flap * 30, 20, 48, 0.9 * flap)], C.dark, OUT, 4);
    // 몸+머리
    group(ctx, [ell(110, 130, 44, 52), circ(72, 78, 34)], body);
    fillShape(ctx, circ(72, 78, 34), C.head);
    // 볏
    group(ctx, [
      (c) => { c.moveTo(66, 48); c.quadraticCurveTo(72, 4, 96, 14); c.quadraticCurveTo(82, 22, 84, 50); c.closePath(); },
      (c) => { c.moveTo(72, 50); c.quadraticCurveTo(90, 12, 110, 22); c.quadraticCurveTo(94, 30, 90, 54); c.closePath(); },
    ], C.head, OUT, 3.5);
    // 날개 (접힘 / 펼침)
    if (fly) group(ctx, [ell(112, 118 + flap * 34, 22, 52, -0.9 * flap)], C.body, OUT, 4);
    else group(ctx, [ell(122, 128, 20, 40, -0.35)], '#D3D8E0', OUT, 3.5);
    fillShape(ctx, ell(118, 122, 8, 16, -0.35), '#FFFFFF');
    // 볼·눈·부리
    fillShape(ctx, circ(60, 92, 11), C.cheek);
    eyeDot(ctx, 58, 72, 6.5, o.blink);
    group(ctx, [(c) => { c.moveTo(40, 82); c.quadraticCurveTo(28, 88, 36, 100); c.quadraticCurveTo(44, 96, 44, 88); c.closePath(); }], C.beak, OUT, 3);
    // 발 (앉을 때)
    if (!fly) {
      ctx.strokeStyle = '#B98A5A'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const x of [96, 112]) { ctx.beginPath(); ctx.moveTo(x, 176); ctx.lineTo(x, 192); ctx.moveTo(x - 7, 194); ctx.lineTo(x + 8, 194); ctx.stroke(); }
    }
  }

  // ---------- 소품 ----------
  function drawWheel(ctx, t, r = 90) {
    const cx = 100, cy = 200 - r - 4;
    ctx.lineWidth = 8; ctx.strokeStyle = '#8FA0B5'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#B7C3D3';
    for (let k = 0; k < 6; k++) { const a = t * 3 + k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
    fillShape(ctx, circ(cx, cy, 9), '#6F7F94');
    ctx.strokeStyle = '#8FA0B5'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, 200); ctx.stroke();
  }
  function drawBottle(ctx) {
    group(ctx, [(c) => { c.roundRect(70, 20, 60, 130, 14); }], 'rgba(200,225,245,.85)', '#7F9DB8', 4);
    fillShape(ctx, (c) => { c.roundRect(76, 60, 48, 84, 10); }, 'rgba(120,180,240,.7)');
    group(ctx, [(c) => { c.roundRect(60, 10, 80, 22, 8); }], '#6FCF6F', '#3E8E41', 4);
    group(ctx, [(c) => { c.moveTo(96, 150); c.lineTo(104, 150); c.lineTo(112, 190); c.lineTo(104, 194); c.closePath(); }], '#C9CED6', '#7F8794', 3);
    fillShape(ctx, circ(108, 192, 4), '#7EC8FF');
  }
  function drawBowl(ctx) {
    group(ctx, [(c) => { c.moveTo(40, 150); c.quadraticCurveTo(100, 220, 160, 150); c.lineTo(160, 140); c.lineTo(40, 140); c.closePath(); }], '#F4A6B7', '#B8657A', 4);
    fillShape(ctx, ell(100, 142, 60, 12), '#FFD6DF');
    for (const [x, y] of [[80, 136], [100, 130], [120, 136], [92, 144], [110, 144]]) { fillShape(ctx, ell(x, y, 7, 4, 0.5), '#3E2A14'); fillShape(ctx, ell(x, y, 3, 1.6, 0.5), '#D9D0B8'); }
  }
  function drawHouse(ctx) {
    group(ctx, [(c) => { c.moveTo(20, 110); c.lineTo(100, 30); c.lineTo(180, 110); c.lineTo(180, 196); c.lineTo(20, 196); c.closePath(); }], '#9AD97F', '#4E8A3B', 4);
    fillShape(ctx, (c) => { c.moveTo(12, 116); c.lineTo(100, 26); c.lineTo(188, 116); c.lineTo(176, 116); c.lineTo(100, 44); c.lineTo(24, 116); c.closePath(); }, '#5FA84A');
    group(ctx, [(c) => { c.arc(100, 150, 36, Math.PI, 0); c.lineTo(136, 196); c.lineTo(64, 196); c.closePath(); }], '#2F4A2A', '#4E8A3B', 4);
  }

  global.TP_VECTOR = { drawHamster, drawCockatiel, drawWheel, drawBottle, drawBowl, drawHouse, group, ell, circ };
})(typeof window !== 'undefined' ? window : module.exports);
