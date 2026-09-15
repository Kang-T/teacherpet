// 티처펫 — 도트 캐릭터 그리기
// 모든 캐릭터는 24×20 격자(오른쪽 보기 기준)에 그린다. 바닥 = y 20.
// 화면에서는 픽셀 하나를 s×s 크기로 확대한다 (s = 3/4/6).
(function (global) {
  const K = '#2B1B0E'; // 눈·윤곽 어두운색
  const W = '#FFFFFF';
  const PINK = '#F7A5B4';
  const BLUSH = '#FFB3A7';

  // 픽셀 페인터: r(x,y,w,h,color) 하나만 있으면 어디서든(브라우저 canvas·Node 버퍼) 쓸 수 있다.
  function painter(fillRect) {
    const P = {
      r: fillRect,
      p: (x, y, c) => fillRect(x, y, 1, 1, c),
      // 모서리를 깎은 둥근 사각형. o가 있으면 1px 윤곽선을 먼저 그린다.
      blob(x, y, w, h, c, o) {
        if (o) P.blob(x - 1, y - 1, w + 2, h + 2, o);
        for (let j = 0; j < h; j++) {
          const d = Math.min(j, h - 1 - j);
          let ins = 0;
          if (h >= 11 && w >= 10) ins = d === 0 ? 4 : d === 1 ? 2 : d === 2 ? 1 : 0;
          else if (h >= 9 && w >= 8) ins = d === 0 ? 3 : d === 1 ? 1 : 0;
          else if (h >= 7) ins = d === 0 ? 2 : d === 1 ? 1 : 0;
          else if (h >= 4) ins = d === 0 ? 1 : 0;
          if (w <= 3) ins = 0;
          fillRect(x + ins, y + j, w - ins * 2, 1, c);
        }
      },
      // 픽셀 원 테두리 (쳇바퀴용)
      ring(cx, cy, rad, c) {
        for (let a = 0; a < 360; a += 3) {
          const x = Math.round(cx + Math.cos(a * Math.PI / 180) * rad);
          const y = Math.round(cy + Math.sin(a * Math.PI / 180) * rad);
          fillRect(x, y, 1, 1, c);
        }
      },
      line(x0, y0, x1, y1, c) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= n; i++) {
          fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, c);
        }
      },
    };
    return P;
  }

  // 어른 표시: 머리 위 작은 리본
  function bow(P, x, y) {
    P.r(x, y, 2, 2, '#FF6B8A');
    P.r(x + 3, y, 2, 2, '#FF6B8A');
    P.p(x + 2, y + 1, '#D93A5C');
  }

  function eye(P, x, y, closed) {
    if (closed) P.r(x, y + 2, 2, 1, K);
    else { P.r(x, y, 2, 3, K); P.p(x + 1, y, W); }
  }

  // ---------- 병아리 ----------
  function chick(P, o) {
    const Y = '#FFD93D', YD = '#E9BC1F', O = '#B8860B', OR = '#FF8A3D', L = '#F2A93B', BELLY = '#FFE98A';
    const sleep = o.anim === 'sleep';
    const eat = o.anim === 'eat' || o.anim === 'peck';
    const bob = (o.anim === 'idle' || o.anim === 'sit') && o.f ? 1 : 0;
    const by = sleep ? 8 : 6 + bob;
    if (!sleep) {
      const a = o.anim === 'walk' ? (o.f ? 1 : 0) : 0;
      P.r(9 + a, 16, 1, 3, L); P.r(8 + a, 19, 3, 1, L);
      P.r(13 - a, 16, 1, 3, L); P.r(12 - a, 19, 3, 1, L);
    }
    P.blob(5, by, 13, sleep ? 10 : 11, Y, O);
    P.blob(8, by + 5, 6, 4, BELLY);
    P.p(10, by - 1, YD); P.p(11, by - 2, YD); P.p(12, by - 1, YD); // 머리털
    let wy = by + 5;
    if (o.anim === 'walk' && o.f) wy = by + 4;
    if (o.anim === 'jump' || o.anim === 'happy') wy = by + 2;
    P.blob(6, wy, 5, 4, YD, O); // 날개
    const ey = by + 3 + (eat ? 2 : 0);
    eye(P, 14, ey, sleep || o.blink);
    const bky = by + 6 + (eat ? 2 : 0);
    if (o.anim === 'peck' && o.f) { P.r(17, bky - 1, 2, 1, OR); P.r(17, bky + 1, 2, 1, OR); }
    else { P.r(17, bky, 2, 1, OR); P.p(18, bky + 1, OR); }
    if (o.happy) P.p(15, by + 7, BLUSH);
    if (o.adult) bow(P, 7, by - 2);
  }

  // ---------- 햄스터 ----------
  function hamster(P, o) {
    const B = '#E5A85C', BD = '#8B5A2B', CREAM = '#FFF3DA', PAW = '#C98A45', GREY = '#9AA3AD', GD = '#5D6873';
    const sleep = o.anim === 'sleep';
    const wheel = o.anim === 'wheel';
    const bob = (o.anim === 'idle' || o.anim === 'sit') && o.f ? 1 : 0;
    if (wheel) {
      const ang = (o.t * 360) % 360;
      for (let k = 0; k < 4; k++) {
        const a = (ang + k * 90) * Math.PI / 180;
        P.line(12, 10, Math.round(12 + Math.cos(a) * 9), Math.round(10 + Math.sin(a) * 9), GREY);
      }
    }
    const by = sleep ? 9 : wheel ? 5 : 7 + bob;
    // 귀
    P.r(6, by - 2, 3, 3, B); P.p(6, by - 2, BD); P.p(7, by - 1, PINK);
    P.r(10, by - 2, 3, 3, B); P.p(12, by - 2, BD); P.p(11, by - 1, PINK);
    P.blob(4, by, 16, sleep ? 9 : 11, B, BD);
    P.blob(9, by + 4, 8, sleep ? 4 : 6, CREAM);
    P.p(3, by + 6, BD); // 꼬리
    eye(P, 14, by + 2, sleep || o.blink);
    P.p(18, by + 5, '#E08090'); // 코
    P.r(15, by + 6, 2, 2, PINK); // 볼주머니
    if (o.anim === 'eat' && o.f) P.r(15, by + 6, 3, 2, PINK);
    if (o.happy) P.p(17, by + 7, BLUSH);
    // 발
    const a = (o.anim === 'walk' || wheel) ? (o.f ? 1 : -1) : 0;
    if (wheel) { P.r(6 + a, 16, 3, 2, PAW); P.r(15 - a, 16, 3, 2, PAW); }
    else if (!sleep) { P.r(7 + a, 17, 3, 1, PAW); P.r(15 - a, 17, 3, 1, PAW); }
    else { P.r(7, 18, 3, 1, PAW); P.r(15, 18, 3, 1, PAW); }
    if (wheel) { P.ring(12, 10, 10, GD); P.ring(12, 10, 9, GREY); }
    if (o.adult) bow(P, 7, by - 4);
  }

  // ---------- 거북이 ----------
  function turtle(P, o) {
    const G = '#5FBF63', GD = '#2E7D32', GL = '#8ADB8E', SK = '#B9D67A', SKD = '#7FA24B';
    const hide = o.anim === 'hide';
    const sleep = o.anim === 'sleep';
    const wob = hide && o.f ? 1 : 0;
    const sy = hide ? 9 : 7;
    const a = o.anim === 'walk' ? (o.f ? 1 : -1) : 0;
    if (!hide) {
      P.r(7 + a, 15, 3, 3, SK); P.r(14 - a, 15, 3, 3, SK);
      P.p(7 + a, 17, SKD); P.p(16 - a, 17, SKD);
      P.p(4, 13, SK); P.p(3, 14, SK); // 꼬리
      const hy = sleep ? 11 : 9;
      P.blob(17, hy, 5, 4, SK, SKD);
      if (sleep || o.blink) P.p(19, hy + 2, K); else { P.r(19, hy + 1, 1, 2, K); }
      if (!sleep) P.p(21, hy + 3, SKD);
      if (o.happy) P.p(18, hy + 3, BLUSH);
    }
    P.blob(5 + wob, sy, 14, 8, G, GD);
    P.r(6 + wob, sy + 6, 12, 1, GL);
    P.blob(7 + wob, sy + 2, 3, 2, GD);
    P.blob(11 + wob, sy + 1, 3, 2, GD);
    P.blob(15 + wob, sy + 3, 3, 2, GD);
    P.blob(11 + wob, sy + 4, 3, 2, GD);
    if (o.adult) bow(P, 10 + wob, sy - 2);
  }

  // ---------- 토끼 ----------
  function rabbit(P, o) {
    const C = '#F7F1E4', CD = '#B8AA96', IN = '#F9BFCB', N = '#E9899A';
    const sleep = o.anim === 'sleep';
    const hop = o.anim === 'jump' || o.anim === 'hop';
    const bob = (o.anim === 'idle' || o.anim === 'sit') && o.f ? 1 : 0;
    const by = sleep ? 9 : 7 + bob;
    // 귀
    if (hop) {
      P.blob(7, by - 6, 2, 7, C, CD); P.r(8, by - 5, 1, 4, IN);
      P.blob(10, by - 7, 2, 8, C, CD); P.r(11, by - 6, 1, 5, IN);
    } else {
      P.blob(9, by - 7, 2, 8, C, CD); P.r(10, by - 6, 1, 5, IN);
      if (o.anim === 'twitch' && o.f) { P.blob(13, by - 4, 3, 5, C, CD); P.r(14, by - 3, 1, 3, IN); }
      else { P.blob(13, by - 7, 2, 8, C, CD); P.r(14, by - 6, 1, 5, IN); }
    }
    P.blob(6, by, 12, sleep ? 9 : 10, C, CD);
    P.blob(9, by + 5, 6, 4, W);
    P.blob(3, by + 5, 3, 3, W, CD); // 꼬리
    eye(P, 13, by + 3, sleep || o.blink);
    P.p(16, by + 6, N);
    P.p(15, by + 7, BLUSH);
    if (o.anim === 'eat' && o.f) P.p(17, by + 7, N);
    // 발
    if (hop) { P.r(6, 17, 4, 2, C); P.r(13, 17, 5, 2, C); }
    else if (o.anim === 'walk') { P.r(7 + (o.f ? 1 : 0), 17, 4, 2, C); P.r(12 - (o.f ? 1 : 0), 17, 4, 2, C); }
    else { P.r(7, 17, 4, 2, C); P.r(12, 17, 4, 2, C); }
    P.r(7, 18, 4, 1, CD); P.r(12, 18, 4, 1, CD);
    if (o.adult) bow(P, 15, by - 2);
  }

  // ---------- 알 ----------
  const SPOT = { chick: '#F2C230', hamster: '#D08A45', turtle: '#5FBF63', rabbit: '#E9B7C0' };
  function egg(P, o) {
    const wob = o.f ? 1 : 0;
    const x = 7 + wob;
    P.blob(x, 5, 10, 14, '#FFF8E7', '#C9B79C');
    P.blob(x + 2, 8, 6, 8, '#FFFDF7');
    const c = SPOT[o.species] || '#DDD';
    P.p(x + 3, 9, c); P.r(x + 6, 11, 2, 2, c); P.p(x + 2, 14, c); P.p(x + 7, 15, c);
    if (o.crack) { P.line(x + 3, 6, x + 5, 8, K); P.line(x + 5, 8, x + 6, 6, K); P.line(x + 6, 6, x + 8, 8, K); }
  }

  // ---------- 먹이 (8×8 격자) ----------
  const food = {
    chick(P) { P.p(2, 5, '#8B5A2B'); P.p(4, 6, '#A0522D'); P.p(5, 4, '#8B5A2B'); P.p(3, 7, '#A0522D'); P.p(6, 7, '#8B5A2B'); },
    hamster(P) { P.blob(2, 1, 4, 7, '#3E2A14'); P.r(3, 2, 1, 5, '#D9D0B8'); P.p(5, 4, '#D9D0B8'); },
    turtle(P) { P.blob(1, 3, 6, 5, '#7BD27F', '#3E8E41'); P.r(3, 4, 1, 3, '#C9F2CB'); },
    rabbit(P) { P.r(3, 0, 2, 2, '#4CAF50'); P.p(2, 1, '#4CAF50'); P.blob(2, 2, 4, 6, '#FF8A3D', '#C25E1F'); P.p(3, 4, '#FFB070'); },
  };

  const SPECIES = {
    chick: { name: '병아리', draw: chick, special: 'peck', speed: 32, foodName: '모이', cry: '삐약!' },
    hamster: { name: '햄스터', draw: hamster, special: 'wheel', speed: 48, foodName: '해바라기씨', cry: '찍찍!' },
    turtle: { name: '거북이', draw: turtle, special: 'hide', speed: 9, foodName: '상추', cry: '...느긋' },
    rabbit: { name: '토끼', draw: rabbit, special: 'hop', speed: 40, foodName: '당근', cry: '깡총!' },
  };

  global.TP_SPRITES = { painter, SPECIES, egg, food, W: 24, H: 20 };
})(typeof window !== 'undefined' ? window : module.exports);
