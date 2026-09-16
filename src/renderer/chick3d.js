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
      const hl = new THREE.Mesh(S(0.085), hard(0xFFFFFF, { emissive: 0xFFFFFF, emissiveIntensity: 0.8 })); hl.position.set(-0.07 * side + 0.03, 0.1, 0.19); eye.add(hl); eye.userData.hl = hl;
      const hl2 = new THREE.Mesh(S(0.04), hard(0xFFFFFF, { emissive: 0xFFFFFF, emissiveIntensity: 0.7 })); hl2.position.set(0.07 * side, -0.09, 0.2); eye.add(hl2); eye.userData.hl2 = hl2;
      // 눈꺼풀: 위(졸림·화남)와 아래(웃음)에서 덮는 반구
      const lidMat = mat(P.body);
      const lidTop = new THREE.Mesh(new THREE.SphereGeometry(0.255, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat); lidTop.rotation.x = -Math.PI; lidTop.position.z = -0.01; eye.add(lidTop); eye.userData.lidTop = lidTop;
      const lidBot = new THREE.Mesh(new THREE.SphereGeometry(0.255, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat); lidBot.position.z = -0.01; eye.add(lidBot); eye.userData.lidBot = lidBot;
      lidTop.rotation.x = -Math.PI * 0.5 - 1.6; lidBot.rotation.x = Math.PI * 0.5 + 1.6; // 기본: 활짝
      // 눈썹
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.07), hard(0x8B5A2B)); brow.position.set(side * 0.4, 1.06, 0.8); brow.rotation.y = side * 0.35; brow.visible = false; head.add(brow); eye.userData.brow = brow;
      const tear = new THREE.Mesh(S(0.07), hard(0x7EC8FF, { roughness: 0.2, transparent: true, opacity: 0.9 })); tear.scale.set(0.8, 1.3, 0.8); tear.position.set(side * 0.12, -0.3, 0.16); tear.visible = false; eye.add(tear); eye.userData.tear = tear;
      eyes.push(eye);
      const cheek = new THREE.Mesh(S(0.2), hard(P.cheek, { transparent: true, opacity: 0.5, roughness: 1 })); cheek.scale.set(1, 0.7, 0.3); cheek.position.set(side * 0.62, 0.42, 0.72); head.add(cheek); eye.userData.cheek = cheek;
    }
    // 부리 (위/아래)
    const beakTop = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 24), hard(P.beak, { roughness: 0.45 })); beakTop.rotation.x = Math.PI / 2; beakTop.position.set(0, 0.5, 1.1); head.add(beakTop);
    const beakBot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 24), hard(0xE0761F, { roughness: 0.45 })); beakBot.rotation.x = Math.PI / 2; beakBot.position.set(0, 0.42, 1.05); head.add(beakBot);
    // 부리에 문 벌레 (물고 달아나기)
    const heldWorm = new THREE.Group(); heldWorm.position.set(0, 0.42, 1.25); heldWorm.visible = false; head.add(heldWorm);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(S(0.075 - i * 0.006), hard(i ? 0xF29AA6 : 0xE87F8E, { roughness: 0.6 }));
      seg.position.set((i - 2) * 0.1, 0, 0); heldWorm.add(seg);
    }
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
    const st = { t: 0, phase: 0, actT: 0, lastAnim: '', bob: 0, roll: 0, blinkAt: 2 + Math.random() * 3, blink: 0, look: new THREE.Vector3(0, 1.5, 5), lookSmooth: new THREE.Vector3(0, 1.5, 5), yaw: 0, yawTarget: 0, squash: 0, squashV: 0, beakOpen: 0 };
    const lerp = (a, b, k) => a + (b - a) * k;
    const tmp = new THREE.Vector3();

    function update(dt, ctl) {
      // ctl: { anim, moving(0..1), dir(-1|1), speed, jumpY, lookTarget(v3 world) }
      st.t += dt;
      const a = ctl.anim || 'idle';
      if (a !== st.lastAnim) { st.actT = 0; st.lastAnim = a; } else st.actT += dt;
      const mood = ctl.mood || { valence: 0, arousal: 0.5, sleepy: 0 };
      // 방향 전환은 몸을 부드럽게 돌려서
      // rotation.y = θ 이면 정면(+z)이 (sinθ, 0, cosθ)를 향한다 → +x로 가려면 θ > 0
      const face = ctl.dir > 0 ? 1 : -1;
      st.yawTarget = face * 0.8;                          // 서 있을 땐 얼굴이 보이는 3/4
      if (ctl.moving > 0.5) st.yawTarget = face * 1.3;    // 걸을 땐 진행 방향(거의 옆모습)
      if (a === 'beg') st.yawTarget = face * 0.5;
      if (a === 'sleep' || a === 'brood' || a === 'roost' || a === 'wail') st.yawTarget = face * 0.7;
      if (a === 'scratch') st.yawTarget = face * 0.85;
      if (a === 'dustbath' || a === 'sunbathe') st.yawTarget = face * 0.6;
      if (a === 'squat') st.yawTarget = face * 0.75;
      if (a === 'ecstatic' || a === 'stomp') st.yawTarget = face * 0.5;
      if (a === 'pet') st.yawTarget = face * 0.55;
      if (a === 'scold' || a === 'startle' || a === 'flutter') st.yawTarget = face * 0.4;
      if (a === 'crow' || a === 'happy' || a === 'jump' || a === 'eat' || a === 'drink' || a === 'peck') st.yawTarget = face * 0.9;
      st.yaw = lerp(st.yaw, st.yawTarget, 1 - Math.exp(-dt * 6));
      root.rotation.y = st.yaw;

      // ── 땅 긁기 (활동 시간의 34%. 닭다움의 핵심)
      //    쫀다 → 쫀 자리로 올라선다 → 오른발·왼발로 뒤로 긁는다 → 뒤로 물러선다 → 고개 기울여 확인
      let scratchZ = 0, scratchPitch = null, scratchYaw = null;
      if (a === 'scratch') {
        const T = st.actT % 3.0;
        if (T < 0.45) {                       // ① 앞을 한 번 쫀다
          const k = Math.sin((T / 0.45) * Math.PI);
          scratchPitch = 0.25 + k * 0.75; scratchYaw = 0;
          bodyPivot.rotation.x = 0.1 + k * 0.28;
        } else if (T < 0.8) {                 // ② 쫀 자리로 한 걸음 올라선다
          const k = (T - 0.45) / 0.35;
          scratchZ = k * 0.32; scratchPitch = 0.45; scratchYaw = 0;
          bodyPivot.rotation.x = 0.16;
          legs[0].rotation.x = Math.sin(k * Math.PI) * 0.55;
        } else if (T < 1.85) {                // ③ 오른발·왼발 교대로 뒤로 긁기 (오른발 먼저)
          const k = (T - 0.8) / 0.35;         // 0~3 구간
          const idx = Math.floor(k);          // 0=오른, 1=왼, 2=오른
          const f = k - idx;
          const leg = legs[idx % 2 === 0 ? 0 : 1];
          leg.rotation.x = -Math.sin(f * Math.PI) * 1.25;          // 뒤로 차낸다
          legs[idx % 2 === 0 ? 1 : 0].rotation.x = Math.sin(f * Math.PI) * 0.2;
          scratchZ = 0.32 - f * 0.05;
          scratchPitch = 0.5; scratchYaw = 0;
          bodyPivot.rotation.x = 0.18;
          bodyPivot.rotation.z = (idx % 2 === 0 ? -1 : 1) * Math.sin(f * Math.PI) * 0.1;
        } else if (T < 2.25) {                // ④ 뒤로 물러선다 (파낸 곳이 발밑에 가려지므로)
          const k = (T - 1.85) / 0.4;
          scratchZ = 0.27 * (1 - k) - k * 0.2;
          scratchPitch = 0.4 - k * 0.2;
          bodyPivot.rotation.x = 0.14 * (1 - k);
          legs[0].rotation.x = Math.sin(k * Math.PI) * 0.35; legs[1].rotation.x = Math.sin(k * Math.PI) * 0.35;
        } else {                              // ⑤ 고개를 기울여 한쪽 눈으로 확인
          scratchZ = -0.2;
          scratchPitch = 0.55; scratchYaw = 0.35;
        }
        root.position.z = scratchZ;
      } else if (root.position.z !== 0) root.position.z = lerp(root.position.z, 0, 1 - Math.exp(-dt * 8));

      // 걷기: 다리 교차 + 몸 좌우 흔들림 + 살짝 통통
      st.phase += dt * (a === 'walk' ? 9 : 0) * (ctl.speed || 1);
      const run = (ctl.speed || 1) > 1.5 ? 1 : 0;
      const mv = ctl.moving || 0;
      const sw = Math.sin(st.phase);
      legs[0].rotation.x = sw * 0.7 * mv; legs[1].rotation.x = -sw * 0.7 * mv;
      bodyPivot.rotation.z = -sw * 0.08 * mv;
      bodyPivot.rotation.x = 0.05 * mv + 0.22 * run * mv;
      let hop = Math.abs(Math.cos(st.phase)) * 0.06 * mv;
      if (a === 'stomp') { const k = Math.sin(st.t * 16); legs[0].rotation.x = k * 0.9; legs[1].rotation.x = -k * 0.9; hop = Math.abs(k) * 0.12; }
      if (a === 'ecstatic') { hop = Math.abs(Math.sin(st.t * 14)) * 0.25; bodyPivot.rotation.z = Math.sin(st.t * 14) * 0.12; }

      // 숨쉬기
      const br = Math.sin(st.t * 2.4) * 0.018;
      let sy = 1 + br, sx = 1 - br * 0.5;
      // 착지 찌그러짐 (스프링)
      st.squashV += (-st.squash * 140 - st.squashV * 14) * dt; st.squash += st.squashV * dt;
      sy *= 1 - st.squash; sx *= 1 + st.squash * 0.7;
      // 앉기(잠·품기): 몸을 찌그러뜨리지 않고 다리를 접어 몸을 내린다
      // 옆으로 눕는 자세(햇볕·모래목욕 4단계)는 몸 전체를 굴린다
      const P = ctl.phase || 0;
      const lieTarget = a === 'sunbathe' ? 1 : (a === 'dustbath' && P >= 0.66 && P < 0.9) ? 1 : 0;
      st.roll = lerp(st.roll, lieTarget, 1 - Math.exp(-dt * 4));
      const squat = a === 'brood' || a === 'sleep' || a === 'roost' || a === 'wail' || a === 'squat'
        || (a === 'dustbath' && P >= 0.18 && P < 0.66);
      st.squat = lerp(st.squat || 0, squat ? 1 : 0, 1 - Math.exp(-dt * 5));
      if (a === 'sleep') { const b2 = Math.sin(st.t * 1.1) * 0.02; sy = 1 + b2; sx = 1 - b2 * 0.5; }
      for (const l of legs) {
        l.visible = st.squat < 0.7;
        if (a === 'carry') l.rotation.x = 0.6 + Math.sin(st.t * 7 + (l === legs[0] ? 0 : 1.5)) * 0.25;
        else if (a === 'flutter') l.rotation.x = -0.35 + Math.sin(st.t * 12 + (l === legs[0] ? 0 : 1)) * 0.15;   // 다리를 앞으로 뻗어 착지 준비
      }
      if (a === 'scold') { sx *= 1.04; sy *= 0.96; }
      root.scale.set(sx, sy, sx);
      // 옆으로 누울 때는 몸 중심(y≈1.0)을 축으로 굴리고, 가라앉지 않게 들어 올린다
      const lieAng = st.roll * 1.05;
      const CY = 1.0;
      root.position.y = (ctl.jumpY || 0) + hop - st.squat * 0.5 + st.roll * (CY - Math.cos(lieAng) * CY) + st.roll * 0.12;
      root.rotation.z = lieAng * (ctl.dir > 0 ? 1 : -1);
      if (st.roll > 0.5) for (const l of legs) l.visible = false;
      // 스트레칭: 같은 쪽 다리를 뒤로 뻗는다
      if (a === 'stretch') { const k = Math.sin(Math.min(1, st.actT / 1.2) * Math.PI); legs[1].rotation.x = -k * 1.1; }
      bodyPivot.rotation.z += (a === 'pet' ? Math.sin(st.t * 3) * 0.06 : 0) + (a === 'scold' ? Math.sin(st.t * 30) * 0.03 : 0);

      // 머리 hold–thrust: 걷는 동안 머리를 공간의 한 점에 "정지"시켰다가 탄도처럼 앞으로 내던진다.
      // (닭의 눈은 눈구멍에 고정되어 있어 머리 자체로 시야를 안정시킨다. 등속 보간이면 닭처럼 안 보인다.)
      if (a === 'walk' && mv > 0.3) {
        const f = ((st.phase / (Math.PI * 2)) % 1 + 1) % 1;
        const back = f < 0.72 ? f / 0.72 : 1 - (f - 0.72) / 0.28;   // 천천히 뒤로 → 순간 앞으로
        st.bob = back;
        neck.position.z = 0.28 - back * 0.34;
        neck.position.y = 1.0 + back * 0.05;
      } else if (st.bob > 0.001) {
        st.bob = lerp(st.bob, 0, 1 - Math.exp(-dt * 10));
        neck.position.z = 0.28 - st.bob * 0.34; neck.position.y = 1.0 + st.bob * 0.05;
      }

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
      if (a === 'sleep') { targetPitch = 0.42 + Math.sin(st.t * 1.1) * 0.03; targetYaw = 0.25 * (ctl.dir > 0 ? 1 : -1); targetRoll = 0.04; }
      if (a === 'pet') { targetPitch = 0.15; targetRoll = Math.sin(st.t * 3) * 0.22; }
      if (a === 'scold') { targetPitch = -0.15; targetYaw = Math.sin(st.t * 24) * 0.25; targetRoll = 0; }
      if (a === 'happy' || a === 'jump') { targetPitch = -0.35; }
      if (a === 'crow') { targetPitch = -0.7; targetYaw = 0; bodyPivot.rotation.x = -0.15; }
      if (a === 'eat') { const k = Math.max(0, Math.sin(st.t * 5)); targetPitch = 0.75 * k + 0.25; targetYaw = 0; bodyPivot.rotation.x = 0.28 * k + 0.08; }
      if (a === 'drink') { const k = Math.sin(st.t * 3); targetPitch = k > 0 ? 0.6 * k : -0.55 * -k; targetYaw = 0; bodyPivot.rotation.x = k > 0 ? 0.15 * k : -0.05 * -k; }
      if (a === 'sad') { targetPitch = 0.45; targetRoll = Math.sin(st.t * 1.2) * 0.08; }
      if (a === 'brood') { targetPitch = 0.15; targetRoll = Math.sin(st.t * 0.8) * 0.06; }
      if (a === 'carry') { targetPitch = -0.2; targetRoll = Math.sin(st.t * 6) * 0.1; }
      if (a === 'flutter') { targetPitch = -0.45; targetRoll = Math.sin(st.t * 9) * 0.14; targetYaw = 0; }
      if (a === 'preen') { targetYaw = 1.25 * (Math.sin(st.t * 0.9) > 0 ? 1 : -1); targetPitch = 0.55 + Math.sin(st.t * 9) * 0.08; targetRoll = 0.2; }
      if (a === 'nuzzle') { targetPitch = 0.75 + Math.sin(st.t * 5) * 0.1; targetYaw = 0.3 * Math.sin(st.t * 2.5); }
      if (a === 'startle') { targetPitch = -0.35; targetYaw = Math.sin(st.t * 30) * 0.15; }
      if (a === 'scratch' && scratchPitch !== null) { targetPitch = scratchPitch; targetYaw = scratchYaw; }
      // 모래 목욕 5단계 (Vestergaard 1982): 자리 파기 → 부리로 흙 긁어모으기 → 날개 떨어 먼지 튕기기 → 옆으로 누워 문지르기 → 일어나 털기
      if (a === 'dustbath') {
        const P = ctl.phase || 0;
        if (P < 0.18) { targetPitch = 0.7; targetYaw = Math.sin(st.t * 4) * 0.3; }
        else if (P < 0.4) { targetPitch = 0.85 + Math.sin(st.t * 7) * 0.12; targetYaw = Math.sin(st.t * 3.5) * 0.5; }
        else if (P < 0.66) { targetPitch = 0.35; targetYaw = Math.sin(st.t * 11) * 0.2; targetRoll = Math.sin(st.t * 11) * 0.1; }
        else if (P < 0.9) { targetPitch = 0.15; targetYaw = Math.sin(st.t * 2.5) * 0.45; targetRoll = -0.35; }
        else { targetPitch = -0.1; targetRoll = Math.sin(st.t * 26) * 0.18; }
      }
      // 햇볕 쬐기: 옆으로 누워 한쪽 날개를 펼치고 깃털을 세운다 (초보자가 죽은 줄 알고 놀라는 자세)
      if (a === 'sunbathe') { targetPitch = -0.15; targetRoll = 0.3; targetYaw = 0.35; }
      // 날개·다리 동시 뻗기: 같은 쪽 날개와 다리를 뒤로 쭉
      if (a === 'stretch') { const k = Math.sin(Math.min(1, st.actT / 1.2) * Math.PI); targetPitch = -0.2 * k; targetRoll = 0.18 * k; }
      // submissive squat: 몸을 낮추고 날개를 살짝 벌린다 (첫 산란 임박 신호)
      if (a === 'squat') { targetPitch = 0.25; targetRoll = 0; }
      if (a === 'ecstatic') { targetPitch = -0.45 + Math.sin(st.t * 12) * 0.15; targetRoll = Math.sin(st.t * 8) * 0.3; }
      if (a === 'wail') { targetPitch = 0.35 + Math.sin(st.t * 3) * 0.25; targetYaw = Math.sin(st.t * 2.2) * 0.6; targetRoll = Math.sin(st.t * 2.2) * 0.2; }
      if (a === 'stomp') { targetPitch = 0.1; targetYaw = Math.sin(st.t * 16) * 0.35; }
      if (a === 'roost') { targetPitch = -0.1; targetRoll = Math.sin(st.t * 1.5) * 0.06; }
      if (a === 'beg') { targetRoll = Math.sin(st.t * 5) * 0.12; }
      if (a === 'idle' && ctl.curious) { targetRoll = Math.sin(st.t * 1.7) * 0.18; }
      if (a === 'idle' || a === 'walk') { targetPitch += Math.max(0, -mood.valence) * 0.25 - Math.max(0, mood.arousal - 0.6) * 0.1; }
      head.rotation.y = lerp(head.rotation.y, targetYaw, 1 - Math.exp(-dt * 6));
      head.rotation.x = lerp(head.rotation.x, targetPitch, 1 - Math.exp(-dt * 6));
      head.rotation.z = lerp(head.rotation.z, targetRoll, 1 - Math.exp(-dt * 4));

      // 날개
      let wing = 0.15;
      if (a === 'walk') wing = 0.15 + Math.abs(sw) * 0.1;
      if (a === 'flap' || a === 'happy' || a === 'jump' || a === 'crow' || a === 'beg') wing = 0.6 + Math.sin(st.t * 22) * 0.55;
      if (a === 'walk' && run) wing = 0.5 + Math.abs(sw) * 0.35;
      if (a === 'sleep') wing = 0.05;
      if (a === 'pet') wing = 0.25 + Math.sin(st.t * 3) * 0.1;
      if (a === 'scold' || a === 'startle') wing = 1.1;
      if (a === 'ecstatic') wing = 1.0 + Math.sin(st.t * 30) * 0.7;
      if (a === 'wail') wing = -0.15 + Math.sin(st.t * 3) * 0.1;
      if (a === 'stomp') wing = 0.8 + Math.abs(Math.sin(st.t * 16)) * 0.4;
      if (a === 'roost') wing = 0.12;
      if (a === 'preen') wing = 0.45 + Math.max(0, Math.sin(st.t * 0.9)) * 0.4;
      if (a === 'scratch') wing = 0.1;
      if (a === 'squat') wing = 0.45;
      if (a === 'dustbath') {
        const P = ctl.phase || 0;
        if (P < 0.4) wing = 0.3;
        else if (P < 0.66) wing = 0.9 + Math.sin(st.t * 30) * 0.8;      // 날개를 떨어 흙을 튕겨 올린다
        else if (P < 0.9) wing = 1.15 + Math.sin(st.t * 6) * 0.25;
        else wing = 0.8 + Math.sin(st.t * 28) * 0.7;
      }
      if (a === 'sunbathe') wing = 1.35 + Math.sin(st.t * 0.8) * 0.12;   // 한쪽 날개를 펼쳐 피부까지 볕을 쬔다
      if (a === 'stretch') wing = 0.15 + Math.sin(Math.min(1, st.actT / 1.2) * Math.PI) * 1.5;
      if (a === 'sad') wing = -0.1;
      if (a === 'brood') wing = 0.35;
      if (a === 'carry') wing = 0.9 + Math.sin(st.t * 18) * 0.3;
      if (a === 'flutter') wing = 1.25 + Math.sin(st.t * 34) * 0.75;   // 날개를 크게 퍼덕여 낙하를 늦춘다
      wing -= Math.max(0, -mood.valence) * 0.2;
      wings[0].rotation.z = wing; wings[1].rotation.z = -wing;

      // 표정: 기분 → 눈꺼풀·눈썹·볼
      // 보통(-0.25~0.25)은 무표정. 그 밖에서만 표정이 나타나고, 커질수록 과장된다
      const v = mood.valence;
      let smile = v > 0.25 ? Math.min(1, (v - 0.25) / 0.5) : 0;
      if (a === 'pet' || a === 'happy' || a === 'jump' || a === 'ecstatic' || (a === 'eat' && v > -0.2)) smile = Math.max(smile, 0.9);
      const droop = Math.max(0, mood.sleepy - 0.45) * 1.8 + (a === 'sleep' ? 1 : 0);
      const angry = (v < -0.3 && mood.arousal > 0.45 && a !== 'wail') || a === 'scold' || a === 'stomp' ? Math.min(1, 0.5 + (-v)) : 0;
      const sad = (v < -0.25 && !angry) || a === 'wail' ? Math.min(1, Math.max(a === 'wail' ? 1 : 0, 0.4 + (-v - 0.25) / 0.5)) : 0;
      for (const e of eyes) {
        const side = Math.sign(e.position.x);
        const topT = -Math.PI * 0.5 - 1.6 + Math.min(1, droop + angry * 0.6 + sad * 0.25) * 1.55;
        const botT = Math.PI * 0.5 + 1.6 - Math.min(1, smile) * 1.6;
        e.userData.lidTop.rotation.x = lerp(e.userData.lidTop.rotation.x, topT, 1 - Math.exp(-dt * 8));
        e.userData.lidBot.rotation.x = lerp(e.userData.lidBot.rotation.x, botT, 1 - Math.exp(-dt * 8));
        const br = e.userData.brow; br.visible = angry > 0.15 || sad > 0.15;
        const target = angry > 0.15 ? side * 0.75 * angry : -side * 0.65 * sad; // 안쪽 내려감(화) / 안쪽 올라감(슬픔)
        br.rotation.z = lerp(br.rotation.z, target, 1 - Math.exp(-dt * 6)); br.position.y = 1.06 - angry * 0.12 + sad * 0.06;
        e.userData.tear.visible = sad > 0.6 && Math.sin(st.t * 2) > -0.3;
        const covered = Math.max(smile, droop, angry * 0.6) > 0.7 || a === 'sleep';
        e.userData.hl.visible = !covered; e.userData.hl2.visible = !covered;
        e.userData.cheek.material.opacity = 0.12 + smile * 0.55;
      }
      // 눈 깜빡임 / 감기
      st.blinkAt -= dt;
      if (st.blinkAt < 0) { st.blink = 0.14; st.blinkAt = 2 + Math.random() * 4; }
      st.blink = Math.max(0, st.blink - dt);
      const closed = a === 'sleep' ? 0.08 : (a === 'sunbathe' || a === 'dustbath') ? 0.4 : st.blink > 0 ? 0.1 : 1;
      for (const e of eyes) e.scale.y = lerp(e.scale.y, closed, 1 - Math.exp(-dt * 25));
      // 부리 (울기·먹기)
      const open = (a === 'crow' || a === 'eat') ? Math.max(0, Math.sin(st.t * (a === 'eat' ? 12 : 6))) * 0.5 : 0;
      st.beakOpen = lerp(st.beakOpen, open, 1 - Math.exp(-dt * 20));
      beakBot.rotation.x = Math.PI / 2 + st.beakOpen; beakTop.rotation.x = Math.PI / 2 - st.beakOpen * 0.3;
      // 문 벌레는 달릴 때 흔들린다
      heldWorm.visible = !!ctl.holdWorm;
      if (heldWorm.visible) { heldWorm.rotation.z = Math.sin(st.t * 16) * 0.5; heldWorm.rotation.y = Math.sin(st.t * 11) * 0.3; }
    }
    function land() { st.squashV = -3.2; }
    return { group, update, land, state: st };
  }
  global.TP_CHICK3D = { createChick };
})(typeof window !== 'undefined' ? window : module.exports);
