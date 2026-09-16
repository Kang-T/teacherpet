// 티처펫 — 3D 병아리 (three.js, 절차적 애니메이션)
// createChick(THREE, opts) → { group, update(dt, ctl), setLookTarget(v3) }
(function (global) {
  function createChick(THREE, opts = {}) {
    const P = Object.assign({
      body: 0xFFE352, belly: 0xFFF5C4, beak: 0xFF9438, leg: 0xF7A23A, cheek: 0xFF9DB0, eye: 0x1E1410,
      scale: 1, comb: 0, tail: 0, wattle: 0, // 어린닭·암탉·수탉용 부품 크기 (0이면 없음)
    }, opts);
    const mat = (color, extra = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.9, metalness: 0, sheen: 0.8, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xFFFFFF), 0.5) }, extra));
    const hard = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0 }, extra));
    const S = (r, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h);

    const group = new THREE.Group();           // 발 밑 원점
    const root = new THREE.Group(); group.add(root);   // 점프·찌그러짐
    const bodyPivot = new THREE.Group(); root.add(bodyPivot); bodyPivot.position.y = 0.55;

    // 몸통 (달걀형)
    const body = new THREE.Mesh(S(0.9), mat(P.body)); body.scale.set(1, 0.95, 1.02); body.position.y = 0.42; body.castShadow = true; bodyPivot.add(body);
    const belly = new THREE.Mesh(S(0.7), mat(P.belly)); belly.scale.set(1, 0.85, 0.5); belly.position.set(0, 0.2, 0.58); bodyPivot.add(belly);
    // 날개
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.74, 0.7, -0.02); bodyPivot.add(pivot);
      const w = new THREE.Mesh(S(0.4), mat(P.body)); w.scale.set(0.42, 0.95, 0.7); w.position.set(side * 0.1, -0.36, 0.05); w.castShadow = true; pivot.add(w);
      wings.push(pivot);
    }
    // 꼬리 (닭용)
    if (P.tail) {
      const n = P.tail > 1 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const col = P.tail > 1 ? [0x2F6B4F, 0x1F4E3A, 0x3E7D5A, 0x24523F, 0x2F6B4F][i] : P.body;
        const f = new THREE.Mesh(S(0.24), P.tail > 1 ? hard(col, { roughness: 0.5 }) : mat(col)); f.scale.set(0.32, 1.35 * P.tail, 0.55);
        const spread = (i - (n - 1) / 2) * 0.16;
        f.position.set(spread, 0.95 + P.tail * 0.35 - Math.abs(spread) * 0.4, -0.95 - Math.abs(spread) * 0.2); f.rotation.x = -0.75 + Math.abs(spread) * 0.3; f.rotation.z = spread * 0.9; bodyPivot.add(f);
      }
    }
    if (P.ruff) { const r = new THREE.Mesh(S(0.86), mat(P.ruff)); r.scale.set(1.0, 0.42, 0.98); r.position.set(0, 1.08, 0.28); bodyPivot.add(r); }
    // 머리
    const neck = new THREE.Group(); neck.position.set(0, 1.0, 0.28); bodyPivot.add(neck);
    const head = new THREE.Group(); neck.add(head);
    const skull = new THREE.Mesh(S(0.98), mat(P.body)); skull.position.y = 0.6; skull.castShadow = true; head.add(skull);
    // 눈
    const eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(side * 0.4, 0.7, 0.8); eye.rotation.y = side * 0.35; head.add(eye);
      const ball = new THREE.Mesh(S(0.24), hard(P.eye, { roughness: 0.12 })); eye.add(ball);
      const hl = new THREE.Mesh(S(0.085), hard(0xFFFFFF, { emissive: 0xFFFFFF, emissiveIntensity: 0.8 })); hl.position.set(-0.07 * side + 0.03, 0.1, 0.19); eye.add(hl);
      const hl2 = new THREE.Mesh(S(0.04), hard(0xFFFFFF, { emissive: 0xFFFFFF, emissiveIntensity: 0.7 })); hl2.position.set(0.07 * side, -0.09, 0.2); eye.add(hl2);
      eyes.push(eye);
      const cheek = new THREE.Mesh(S(0.2), hard(P.cheek, { transparent: true, opacity: 0.5, roughness: 1 })); cheek.scale.set(1, 0.7, 0.3); cheek.position.set(side * 0.62, 0.42, 0.72); head.add(cheek);
    }
    // 부리 (위/아래)
    const beakTop = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 24), hard(P.beak, { roughness: 0.45 })); beakTop.rotation.x = Math.PI / 2; beakTop.position.set(0, 0.5, 1.1); head.add(beakTop);
    const beakBot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 24), hard(0xE0761F, { roughness: 0.45 })); beakBot.rotation.x = Math.PI / 2; beakBot.position.set(0, 0.42, 1.05); head.add(beakBot);
    // 머리털 / 볏
    if (P.comb) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const k = 1 - Math.abs(i - (n - 1) / 2) / n; // 가운데가 크게
        const c = new THREE.Mesh(S(0.19 * P.comb * (0.7 + k * 0.6)), hard(0xE8323C, { roughness: 0.55 }));
        c.scale.set(0.55, 1.25, 0.9); c.position.set(0, 1.45 + k * 0.12 * P.comb, 0.42 - i * 0.26); c.rotation.z = (i - (n - 1) / 2) * 0.12; head.add(c);
      }
    } else {
      for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 12), mat(0xF2C230)); t.position.set((i - 1) * 0.1, 1.62, -0.05 + (i - 1) * 0.05); t.rotation.z = (i - 1) * 0.35; t.rotation.x = -0.2; head.add(t); }
    }
    if (P.wattle) { const w = new THREE.Mesh(S(0.13 * P.wattle), hard(0xE8323C, { roughness: 0.55 })); w.scale.set(0.6, 1.2, 0.6); w.position.set(0, 0.2, 0.95); head.add(w); }
    // 다리·발
    const legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 0.3, 0.6, 0.08); root.add(pivot);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.6, 12), hard(P.leg)); leg.position.y = -0.3; pivot.add(leg);
      for (let t = -1; t <= 1; t++) { const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.36, 10), hard(P.leg)); toe.rotation.x = Math.PI / 2; toe.rotation.y = t * 0.55; toe.position.set(t * 0.13, -0.6, 0.16); pivot.add(toe); }
      legs.push(pivot);
    }
    group.scale.setScalar(P.scale);

    // ---- 애니메이션 상태 ----
    const st = { t: 0, phase: 0, blinkAt: 2 + Math.random() * 3, blink: 0, look: new THREE.Vector3(0, 1.5, 5), lookSmooth: new THREE.Vector3(0, 1.5, 5), yaw: 0, yawTarget: 0, squash: 0, squashV: 0, beakOpen: 0 };
    const lerp = (a, b, k) => a + (b - a) * k;
    const tmp = new THREE.Vector3();

    function update(dt, ctl) {
      // ctl: { anim, moving(0..1), dir(-1|1), speed, jumpY, lookTarget(v3 world) }
      st.t += dt;
      const a = ctl.anim || 'idle';
      // 방향 전환은 몸을 부드럽게 돌려서
      // rotation.y = θ 이면 정면(+z)이 (sinθ, 0, cosθ)를 향한다 → +x로 가려면 θ > 0
      const face = ctl.dir > 0 ? 1 : -1;
      st.yawTarget = face * 0.8;                          // 서 있을 땐 얼굴이 보이는 3/4
      if (ctl.moving > 0.5) st.yawTarget = face * 1.3;    // 걸을 땐 진행 방향(거의 옆모습)
      if (a === 'sleep' || a === 'brood') st.yawTarget = face * 0.7;
      if (a === 'crow' || a === 'happy' || a === 'jump' || a === 'eat' || a === 'drink' || a === 'peck') st.yawTarget = face * 0.9;
      st.yaw = lerp(st.yaw, st.yawTarget, 1 - Math.exp(-dt * 6));
      root.rotation.y = st.yaw;

      // 걷기: 다리 교차 + 몸 좌우 흔들림 + 살짝 통통
      st.phase += dt * (a === 'walk' ? 9 : 0) * (ctl.speed || 1);
      const mv = ctl.moving || 0;
      const sw = Math.sin(st.phase);
      legs[0].rotation.x = sw * 0.7 * mv; legs[1].rotation.x = -sw * 0.7 * mv;
      bodyPivot.rotation.z = -sw * 0.08 * mv;
      bodyPivot.rotation.x = 0.05 * mv;
      const hop = Math.abs(Math.cos(st.phase)) * 0.06 * mv;

      // 숨쉬기
      const br = Math.sin(st.t * 2.4) * 0.018;
      let sy = 1 + br, sx = 1 - br * 0.5;
      // 착지 찌그러짐 (스프링)
      st.squashV += (-st.squash * 140 - st.squashV * 14) * dt; st.squash += st.squashV * dt;
      sy *= 1 - st.squash; sx *= 1 + st.squash * 0.7;
      const squat = a === 'brood' || a === 'sleep';
      st.squat = lerp(st.squat || 0, squat ? 1 : 0, 1 - Math.exp(-dt * 5));
      sy *= 1 - st.squat * 0.18; sx *= 1 + st.squat * 0.08;
      for (const l of legs) { l.visible = st.squat < 0.7; if (a === 'carry') l.rotation.x = 0.6 + Math.sin(st.t * 7 + (l === legs[0] ? 0 : 1.5)) * 0.25; }
      root.scale.set(sx, sy, sx);
      root.position.y = (ctl.jumpY || 0) + hop - st.squat * 0.45;

      // 머리: 시선 따라가기 (제한된 yaw/pitch), 자는 중엔 숙임
      if (ctl.lookTarget) st.look.copy(ctl.lookTarget);
      st.lookSmooth.lerp(st.look, 1 - Math.exp(-dt * 4));
      neck.getWorldPosition(tmp);
      const local = tmp.sub(st.lookSmooth).multiplyScalar(-1); // 목 → 목표
      // 월드 → 몸 기준으로 회전
      const inv = new THREE.Quaternion(); bodyPivot.getWorldQuaternion(inv); inv.invert(); local.applyQuaternion(inv);
      let hy = Math.atan2(local.x, local.z), hp = -Math.atan2(local.y, Math.hypot(local.x, local.z));
      hy = Math.max(-1.0, Math.min(1.0, hy)); hp = Math.max(-0.5, Math.min(0.6, hp));
      let targetPitch = hp, targetYaw = hy, targetRoll = 0;
      if (a === 'peck') { const k = Math.max(0, Math.sin(st.t * 9)); targetPitch = 0.9 * k + 0.2; targetYaw = 0; bodyPivot.rotation.x = 0.35 * k + 0.1; }
      if (a === 'sleep') { targetPitch = 0.62 + Math.sin(st.t * 1.1) * 0.04; targetYaw = 0; targetRoll = 0.05; }
      if (a === 'happy' || a === 'jump') { targetPitch = -0.35; }
      if (a === 'crow') { targetPitch = -0.7; targetYaw = 0; bodyPivot.rotation.x = -0.15; }
      if (a === 'eat') { const k = Math.max(0, Math.sin(st.t * 5)); targetPitch = 0.75 * k + 0.25; targetYaw = 0; bodyPivot.rotation.x = 0.28 * k + 0.08; }
      if (a === 'drink') { const k = Math.sin(st.t * 3); targetPitch = k > 0 ? 0.6 * k : -0.55 * -k; targetYaw = 0; bodyPivot.rotation.x = k > 0 ? 0.15 * k : -0.05 * -k; }
      if (a === 'sad') { targetPitch = 0.45; targetRoll = Math.sin(st.t * 1.2) * 0.08; }
      if (a === 'brood') { targetPitch = 0.15; targetRoll = Math.sin(st.t * 0.8) * 0.06; }
      if (a === 'carry') { targetPitch = -0.2; targetRoll = Math.sin(st.t * 6) * 0.1; }
      if (a === 'idle' && ctl.curious) { targetRoll = Math.sin(st.t * 1.7) * 0.18; }
      head.rotation.y = lerp(head.rotation.y, targetYaw, 1 - Math.exp(-dt * 6));
      head.rotation.x = lerp(head.rotation.x, targetPitch, 1 - Math.exp(-dt * 6));
      head.rotation.z = lerp(head.rotation.z, targetRoll, 1 - Math.exp(-dt * 4));

      // 날개
      let wing = 0.15;
      if (a === 'walk') wing = 0.15 + Math.abs(sw) * 0.1;
      if (a === 'flap' || a === 'happy' || a === 'jump' || a === 'crow') wing = 0.6 + Math.sin(st.t * 22) * 0.55;
      if (a === 'sleep') wing = 0.05;
      if (a === 'sad') wing = -0.1;
      if (a === 'brood') wing = 0.35;
      if (a === 'carry') wing = 0.9 + Math.sin(st.t * 18) * 0.3;
      wings[0].rotation.z = wing; wings[1].rotation.z = -wing;

      // 눈 깜빡임 / 감기
      st.blinkAt -= dt;
      if (st.blinkAt < 0) { st.blink = 0.14; st.blinkAt = 2 + Math.random() * 4; }
      st.blink = Math.max(0, st.blink - dt);
      const closed = a === 'sleep' ? 0.08 : st.blink > 0 ? 0.1 : 1;
      for (const e of eyes) e.scale.y = lerp(e.scale.y, closed, 1 - Math.exp(-dt * 25));
      // 부리 (울기·먹기)
      const open = (a === 'crow' || a === 'eat') ? Math.max(0, Math.sin(st.t * (a === 'eat' ? 12 : 6))) * 0.5 : 0;
      st.beakOpen = lerp(st.beakOpen, open, 1 - Math.exp(-dt * 20));
      beakBot.rotation.x = Math.PI / 2 + st.beakOpen; beakTop.rotation.x = Math.PI / 2 - st.beakOpen * 0.3;
    }
    function land() { st.squashV = -3.2; }
    return { group, update, land, state: st };
  }
  global.TP_CHICK3D = { createChick };
})(typeof window !== 'undefined' ? window : module.exports);
