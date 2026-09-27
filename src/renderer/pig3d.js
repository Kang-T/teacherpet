// 돼지 3D 모형 — 어미(sow) · 새끼(piglet) · 어린 돼지(grower)
//
// chick3d.js 와 같은 방식: 코드로 빚고, update(dt, 상태) 로 매 프레임 자세를 바꾼다.
// 앞은 +z (닭과 같다). 몸통 가운데 발바닥이 원점.
// 진흙 목욕을 하면 몸 색이 흙빛으로 물들고(mud 0~1), 시간이 지나면 마른다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const SIZE = { piglet: 0.42, grower: 0.68, sow: 1 };
  const HEIGHT = { piglet: 0.95, grower: 1.45, sow: 2.1 };

  function createPig(THREE, opts = {}) {
    const stage = opts.stage || 'sow';
    const k = SIZE[stage] || 1;
    const group = new THREE.Group();
    // 눕기·뒹굴기는 몸통 가운데를 축으로 굴린다 (발바닥을 축으로 굴리면 몸이 비스듬히 뜨고 다리가 들린다)
    const CY = 1.15 * k;                                       // 몸통 가운데 높이
    const roll = new THREE.Group(); roll.position.y = CY; group.add(roll);
    const body = new THREE.Group(); body.position.y = -CY; roll.add(body);
    const PINK = new THREE.Color(0xF6BFB8), BELLY = new THREE.Color(0xFBD9D3), MUD = new THREE.Color(0x8A6848);
    const skinMats = [];
    const skin = (c) => { const m = new THREE.MeshStandardMaterial({ color: c.clone(), roughness: 0.85 }); m.userData.base = c.clone(); skinMats.push(m); return m; };
    const hard = (c, r = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * k, y * k, z * k); m.castShadow = true; parent.add(m); return m; };
    const S = (r, w = 24, h = 18) => new THREE.SphereGeometry(r * k, w, h);

    // 몸통 — 앞뒤로 긴 둥근 몸. 새끼는 머리가 상대적으로 크다(귀엽게)
    const torso = mesh(S(1), skin(PINK), 0, 1.15, 0); torso.scale.set(1.0, 0.88, 1.45);
    const belly = mesh(S(0.82), skin(BELLY), 0, 0.92, 0.05); belly.scale.set(0.92, 0.6, 1.25);
    // 머리
    const headK = stage === 'piglet' ? 1.22 : stage === 'grower' ? 1.1 : 1;
    const head = new THREE.Group(); head.position.set(0, 1.35 * k, 1.35 * k); body.add(head);
    const skull = mesh(S(0.62 * headK), skin(PINK), 0, 0, 0, head); skull.scale.set(1, 0.95, 0.95);
    // 코 — 납작한 원반 + 콧구멍 둘
    const snout = mesh(new THREE.CylinderGeometry(0.3 * headK * k, 0.34 * headK * k, 0.28 * k, 20), skin(new THREE.Color(0xF19C98)), 0, -0.1 * headK, 0.62 * headK, head);
    snout.rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.055 * headK * k, 0.055 * headK * k, 0.05 * k, 10), hard(0x7A3E3A), sx * 0.11 * headK, -0.1 * headK, 0.77 * headK, head).rotation.x = Math.PI / 2;
    // 눈 — 까만 눈에 하얀 반짝임
    const eyes = [];
    for (const sx of [-1, 1]) {
      const e = mesh(S(0.085 * headK, 12, 10), hard(0x1E1410, 0.3), sx * 0.27 * headK, 0.13 * headK, 0.5 * headK, head); eyes.push(e);
      mesh(S(0.03 * headK, 8, 6), hard(0xFFFFFF, 0.2), sx * 0.27 * headK + 0.02 * k, 0.17 * headK, 0.57 * headK, head);
      // 볼 — 분홍 볼터치
      const ch = mesh(S(0.1 * headK, 10, 8), hard(0xF58FA0, 0.9), sx * 0.4 * headK, -0.08 * headK, 0.42 * headK, head); ch.scale.set(1, 0.6, 0.4);
    }
    // 귀 — 앞으로 접힌 세모 귀
    const ears = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * 0.36 * headK * k, 0.46 * headK * k, 0.05 * k); head.add(pivot);
      const ear = mesh(new THREE.ConeGeometry(0.22 * headK * k, 0.46 * headK * k, 4), skin(PINK), 0, 0.18 * headK, 0.05, pivot);
      ear.scale.z = 0.35; ear.rotation.set(0.55, 0, sx * -0.35);
      ears.push(pivot);
    }
    // 다리 넷 — 짧고 굵게, 발굽은 진하게
    const legs = [];
    for (const [lx, lz] of [[-0.5, 0.75], [0.5, 0.75], [-0.5, -0.75], [0.5, -0.75]]) {
      const pivot = new THREE.Group(); pivot.position.set(lx * k, 0.62 * k, lz * k); body.add(pivot);
      mesh(new THREE.CylinderGeometry(0.2 * k, 0.18 * k, 0.55 * k, 12), skin(PINK), 0, -0.28, 0, pivot);
      mesh(new THREE.CylinderGeometry(0.19 * k, 0.2 * k, 0.12 * k, 12), hard(0x5A3A30), 0, -0.58, 0, pivot);
      legs.push(pivot);
    }
    // 꼬불 꼬리
    const tail = new THREE.Group(); tail.position.set(0, 1.35 * k, -1.42 * k); body.add(tail);
    const curl = mesh(new THREE.TorusGeometry(0.13 * k, 0.045 * k, 8, 16, Math.PI * 1.6), skin(PINK), 0, 0, 0, tail);
    curl.rotation.y = Math.PI / 2;
    // 새끼 돼지는 어미에게 없는 작은 점무늬를 하나 준다 — 여럿이 있어도 구분되게
    if (stage !== 'sow' && opts.spot) {
      const sp = mesh(S(0.32, 12, 10), skin(new THREE.Color(opts.spot)), 0.45, 1.35, -0.2); sp.scale.set(0.35, 0.7, 0.8);
    }

    const st = { t: Math.random() * 10, lie: 0, sit: 0, headPitch: 0, earFlap: 0, mud: 0, blink: 0, blinkAt: 2 + Math.random() * 3 };
    const lerp = (a, b, t) => a + (b - a) * t;
    function update(dt, s) {
      s = s || {};
      st.t += dt;
      const a = s.anim || 'idle';
      const moving = !!s.moving;
      const fast = s.speed || 1;
      // 자세 두 가지
      //  · 옆으로 눕기(어미·어린 돼지의 잠, 젖 먹이기, 진흙 목욕, 배 보이기) — 옆구리를 바닥에 대고 다리를 옆으로 뻗는다
      //  · 엎드리기(새끼 돼지의 잠) — 배를 깔고 다리를 몸 밑에 접는다
      const sternal = stage === 'piglet' && a === 'sleep';
      const lieT = !sternal && (a === 'sleep' || a === 'nurse' || a === 'mud' || a === 'flop') ? 1 : 0;
      const sitT = sternal ? 1 : 0;
      st.lie = lerp(st.lie, lieT, 1 - Math.exp(-dt * 3.5));
      st.sit = lerp(st.sit || 0, sitT, 1 - Math.exp(-dt * 4));
      // 옆으로 누우면 몸통 너비(반지름 1.0)가 높이가 된다. 살이 바닥에 조금 눌리게 0.92
      const flopExtra = a === 'flop' ? 0.35 : 0;                // 배를 더 드러낸다
      roll.rotation.z = st.lie * (Math.PI / 2 + flopExtra) + (a === 'mud' ? Math.sin(st.t * 2.6) * 0.3 * st.lie : 0);
      roll.position.y = CY + (0.92 * k - CY) * st.lie - st.sit * 0.5 * k;
      // 다리 — 걸을 때는 번갈아, 누우면 앞다리는 앞으로 뒷다리는 뒤로 편하게 뻗고, 엎드리면 몸 밑에 접는다
      const sw = moving ? Math.sin(st.t * 11 * fast) * 0.55 : 0;
      const relax = st.lie * 0.35, tuck = st.sit * 1.35;
      legs[0].rotation.x = sw - relax + tuck; legs[1].rotation.x = -sw - relax * 0.8 + tuck;   // 앞다리
      legs[2].rotation.x = -sw + relax - tuck; legs[3].rotation.x = sw + relax * 0.8 - tuck;   // 뒷다리
      // 위쪽 다리(몸의 +x 쪽, 누우면 위로 오는 쪽)는 아래 다리 위로 축 늘어뜨린다 — 공중에 뻣뻣하게 뜨지 않게
      legs[0].rotation.z = legs[2].rotation.z = st.lie * 0.12;
      legs[1].rotation.z = legs[3].rotation.z = -st.lie * 0.55;
      legs[1].rotation.x += st.lie * 0.25; legs[3].rotation.x -= st.lie * 0.25;             // 살짝 굽혀 편하게
      if (a === 'flop') { legs[0].rotation.x += Math.sin(st.t * 3) * 0.15; legs[2].rotation.x -= Math.sin(st.t * 3) * 0.15; }   // 배 보이며 발을 까딱
      body.position.y = -CY + (moving ? Math.abs(Math.sin(st.t * 11 * fast)) * 0.06 * k : 0);
      // 숨쉬기 — 누워 있으면 배가 오르내리는 게 보인다
      const breath = 1 + Math.sin(st.t * (lieT || sitT ? 1.6 : 2.2)) * (lieT || sitT ? 0.025 : 0.012);
      torso.scale.set(1.0 * breath, 0.88 * breath, 1.45);
      // 머리 — 먹기·코로 파기·젖 먹기는 고개를 숙인다
      const down = (a === 'eat' || a === 'root' || a === 'suckle' || a === 'drink') ? 0.7 : a === 'sniff' ? 0.3 : 0;
      st.headPitch = lerp(st.headPitch, down, 1 - Math.exp(-dt * 6));
      head.rotation.x = st.headPitch + (a === 'root' ? Math.sin(st.t * 14) * 0.12 : 0) + st.sit * 0.25;
      head.rotation.y = a === 'root' ? Math.sin(st.t * 3) * 0.3 : Math.sin(st.t * 0.7) * 0.08 * (1 - st.lie);
      head.rotation.z = -st.lie * 0.18;                          // 누우면 머리를 땅에 기댄다
      // 코를 씰룩 — 늘 조금, 냄새 맡을 때 크게
      snout.scale.y = 1 + Math.sin(st.t * (a === 'sniff' || a === 'root' ? 18 : 4)) * 0.06;
      // 귀 — 걸으면 펄럭
      const flap = moving ? Math.sin(st.t * 11) * 0.25 : Math.sin(st.t * 1.3) * 0.05;
      ears.forEach((e, i) => { e.rotation.x = flap * (i ? 1 : -1); });
      // 꼬리 — 기분 좋으면 빙글빙글
      tail.rotation.z = st.t * (a === 'happy' || a === 'suckle' || a === 'eat' ? 9 : 1.5);
      // 눈 깜빡임 · 잘 때 감기
      st.blinkAt -= dt;
      if (st.blinkAt <= 0) { st.blink = 0.15; st.blinkAt = 2.5 + Math.random() * 4; }
      st.blink = Math.max(0, st.blink - dt);
      const shut = a === 'sleep' || st.blink > 0 ? 0.12 : 1;
      for (const e of eyes) e.scale.y = shut;
      // 진흙 — 몸 색을 흙빛으로
      const mud = Math.max(0, Math.min(1, s.mud || 0));
      if (Math.abs(mud - st.mud) > 0.01) {
        st.mud = mud;
        for (const m of skinMats) m.color.copy(m.userData.base).lerp(MUD, mud * 0.75);
      }
      // 뛰어오르기(놀 때)
      group.position.y = s.jumpY || 0;
    }
    return { group, update, height: (HEIGHT[stage] || 2), state: st };
  }

  TP.pig3d = { createPig, HEIGHT, SIZE };
})(typeof window !== 'undefined' ? window : module.exports);
