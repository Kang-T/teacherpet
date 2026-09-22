// 티처펫 — 3D 무대 (three.js). 카메라 보정, 소품(닭장·둥지·모이통·물통·바구니), 알, 좌표 변환, 피킹.
(function (global) {
  const THREE = global.THREE;
  global.TP_WORLD_PERCH_Y = 0.95;      // 횟대 높이 (app.js 가 닭을 올릴 때 쓴다)
  const C = global.TP_CHICK3D;

  const STAGE_PRESET = {
    chick: { scale: 0.62 },
    young: { scale: 0.8, body: 0xFFE9A8, belly: 0xFFF7DE, comb: 0.6, tail: 0.3 },
    hen: { scale: 0.98, body: 0xFDF6EC, belly: 0xFFFFFF, comb: 1.0, wattle: 1.0, tail: 0.7 },
    rooster: { scale: 1.1, body: 0xFBF3E4, belly: 0xF7DFA8, comb: 1.5, wattle: 1.3, tail: 1.6, ruff: 0xF3D48E },
  };

  function create(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.id = 'stage';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // 약한 원근 — 화면 전체가 마당이 되면서 공간감이 필요해졌다.
    // 화각(FOV)을 좁게 잡고 카메라를 멀리 두면, 깊이는 느껴지되 크기 차이가 과하지 않다.
    // (바탕화면 펫 시절에는 화면 하단 띠만 썼기 때문에 원근이 오히려 어색했다.)
    const FOV = 22;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 900);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC9D6EA, 1.6));
    const sun = new THREE.DirectionalLight(0xFFF6E8, 2.2); sun.position.set(6, 14, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -0.0005;
    scene.add(sun); scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0xDDEEFF, 0.8); rim.position.set(-8, 6, -6); scene.add(rim);

    // 마당은 화면과 무관하게 '고정된 크기의 장소'다.
    // 예전에는 xMin/xMax/zMin/zMax 를 화면 가장자리에서 역산했는데,
    // 그러면 확대하거나 각도를 바꾸는 순간 소품과 닭의 위치가 통째로 움직였다.
    const YARD = { w: 32, d: 30 };
    // 마당 밖 풍경 — 바닥·울타리·나무·밭·언덕·구름. 마당 크기를 알아야 울타리를 세운다.
    const scenery = global.TP_SCENERY.build(THREE, scene, YARD);
    const world = {
      renderer, scene, camera, birds: new Map(), props: {}, decos: new Map(), pxPerUnit: 40,
      xMin: -YARD.w / 2, xMax: YARD.w / 2, zMin: -YARD.d, zMax: 0.6,
      YARD, view: { zoom: 1, elev: 24, tx: 0, tz: -YARD.d * 0.42 },
      roamTop: 0.35, W: 1, H: 1,
    };
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); const tmp = new THREE.Vector3();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // ---- 카메라: 화면 아래쪽에 바닥선이 오고, 1유닛이 pxPerUnit 픽셀이 되도록 ----
    function fit(W, H) {
      if (!(W > 1 && H > 1)) return;
      world.W = W; world.H = H;
      renderer.setSize(W, H, false);
      renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px';
      camera.aspect = W / H; camera.fov = FOV;

      const v = world.view;
      const elev = THREE.MathUtils.degToRad(v.elev);
      // 마당 전체가 화면에 들어오는 배율을 먼저 구하고, 거기에 사용자의 확대를 곱한다
      const pxW = W / (YARD.w + 3);
      const pxH = H / (YARD.d * Math.sin(elev) + 9);
      const px = Math.min(pxW, pxH) * v.zoom;
      world.pxPerUnit = px;

      const halfH = H / (2 * px);
      const D = halfH / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      // 카메라는 바라보는 점(target) 주위를 돈다. 마당은 가만히 있는다.
      const tx = v.tx, tz = v.tz;
      camera.position.set(tx, D * Math.sin(elev), tz + D * Math.cos(elev));
      camera.up.set(0, 1, 0);
      camera.lookAt(tx, 0, tz);
      camera.near = Math.max(1, D * 0.15); camera.far = D * 6;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      scenery.setCamDist(D);        // 지평선(안개)이 확대와 함께 따라오게

      // 마당 경계(xMin/xMax/zMin/zMax)는 화면이 어떻든 바뀌지 않는다.
      const span = Math.max(30, (world.xMax - world.xMin) * 0.8);
      const zSpan = Math.max(30, (world.zMax - world.zMin) * 0.8);
      sun.shadow.camera.left = -span; sun.shadow.camera.right = span;
      sun.shadow.camera.top = zSpan; sun.shadow.camera.bottom = -zSpan;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 600;
      sun.shadow.camera.updateProjectionMatrix();
      sun.position.set(30, 90, 60);
      sun.target.position.set(0, 0, (world.zMin + world.zMax) / 2);
      sun.target.updateMatrixWorld();
    }
    function screenToGround(px, py) {
      ndc.set((px / world.W) * 2 - 1, -(py / world.H) * 2 + 1); ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3(); return ray.ray.intersectPlane(groundPlane, p) ? p : null;
    }
    function screenToPlaneZ(px, py, z) {
      ndc.set((px / world.W) * 2 - 1, -(py / world.H) * 2 + 1); ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p) ? p : null;
    }
    function project(x, y, z) { tmp.set(x, y, z).project(camera); return { x: (tmp.x + 1) / 2 * world.W, y: (1 - tmp.y) / 2 * world.H }; }
    function pointAlongRay(px, py, dist) { ndc.set((px / world.W) * 2 - 1, -(py / world.H) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.at(dist, new THREE.Vector3()); }

    // ---- 새 ----
    function addBird(id, stage) {
      const holder = new THREE.Group(); scene.add(holder);
      const b = { id, holder, model: null, stage: null, meshes: [] };
      setStage(b, stage);
      world.birds.set(id, b); return b;
    }
    // 모델을 버릴 때는 GPU 자원까지 놓아준다 — 안 하면 자랄 때마다 샌다.
    // chick3d 와 makeEgg 는 개체마다 지오메트리·머티리얼을 새로 만들므로 공유 걱정이 없다.
    function disposeGroup(g) {
      if (!g) return;
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x && x.dispose());
        else if (m) m.dispose();
      });
    }
    function setStage(b, stage) {
      if (b.model) { b.holder.remove(b.model.group); disposeGroup(b.model.group); }
      if (stage === 'egg') { b.model = makeEgg(); }
      else b.model = C.createChick(THREE, STAGE_PRESET[stage]);
      b.stage = stage; b.holder.add(b.model.group);
      b.meshes = []; b.model.group.traverse((o) => { if (o.isMesh) { o.userData.birdId = b.id; b.meshes.push(o); } });
    }
    function removeBird(id) { const b = world.birds.get(id); if (b) { scene.remove(b.holder); disposeGroup(b.holder); world.birds.delete(id); } }
    function heightOf(b) { // 모델 높이(월드 유닛)
      if (b.stage === 'egg') return 1.3;
      return { chick: 1.7, young: 2.2, hen: 2.85, rooster: 3.3 }[b.stage] || 2;
    }
    // 알 (품질감: 크림색 + 살구색 점)
    function makeEgg() {
      const group = new THREE.Group();
      const shellMat = () => new THREE.MeshPhysicalMaterial({ color: 0xFFF6E6, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0xFFE8D0), side: THREE.DoubleSide });
      const R = 0.5, CUT = 1.15, BASE = 0.65;   // CUT = 껍질이 갈라지는 위도(rad)
      // 아래 껍질(그릇) + 위 껍질(뚜껑) — 부화 때 뚜껑만 열린다
      const bottomPivot = new THREE.Group(); bottomPivot.position.y = BASE; bottomPivot.scale.set(1, 1.3, 1); group.add(bottomPivot);
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24, 0, Math.PI * 2, CUT, Math.PI - CUT), shellMat()); bottom.castShadow = true; bottomPivot.add(bottom);
      const topPivot = new THREE.Group(); topPivot.position.y = BASE; topPivot.scale.set(1, 1.3, 1); group.add(topPivot);
      const top = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24, 0, Math.PI * 2, 0, CUT), shellMat()); top.castShadow = true; topPivot.add(top);
      // 점무늬
      for (const [x, y, z, onTop] of [[-0.18, 0.2, 0.42, 1], [0.22, -0.05, 0.4, 0], [0.05, 0.4, 0.35, 1], [-0.3, -0.15, 0.35, 0]]) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xF4B78F, roughness: 1 }));
        sp.scale.set(1, 1, 0.3); sp.position.set(x, y, z); sp.lookAt(0, 0, 0); (onTop ? topPivot : bottomPivot).add(sp);
      }
      // 갈라지는 선의 톱니 금
      const cracks = [];
      const ringR = R * Math.sin(CUT), ringY = R * Math.cos(CUT);
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.035), new THREE.MeshStandardMaterial({ color: 0x8A6A4A, roughness: 1 }));
        c.position.set(Math.cos(a) * ringR * 1.02, (ringY + (i % 2 ? 0.05 : -0.05)) * 1.3 + BASE, Math.sin(a) * ringR * 1.02);
        c.lookAt(0, c.position.y, 0); c.visible = false; group.add(c); cracks.push(c);
      }
      // 부리가 뚫은 구멍(pip)
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2A1A10, roughness: 1 }));
      pip.scale.set(1, 1, 0.35); pip.position.set(0.1, BASE + 0.3, 0.44); pip.lookAt(0.1, BASE + 0.3, 0); pip.visible = false; group.add(pip);
      // 안에서 내미는 노란 부리 끝
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xFF9438, roughness: 0.45 }));
      beak.rotation.x = Math.PI / 2; beak.position.set(0.1, BASE + 0.3, 0.46); beak.visible = false; group.add(beak);

      const st = { t: 0 };
      function update(dt, ctl) {
        st.t += dt;
        const h = ctl.hatch || 0;
        if (h <= 0) {
          group.rotation.z = ctl.wobble ? Math.sin(st.t * 14) * 0.12 : Math.sin(st.t * 1.2) * 0.02;
          group.position.y = ctl.jumpY || 0;
          topPivot.position.y = BASE; topPivot.rotation.set(0, 0, 0); topPivot.position.x = 0; topPivot.position.z = 0;
          pip.visible = beak.visible = false; for (const c of cracks) c.visible = false;
          return;
        }
        // ① 흔들림이 점점 세진다  ② 구멍(pip)  ③ 금이 빙 둘러(zip)  ④ 뚜껑이 열린다
        const shake = h < 0.8 ? 0.06 + h * 0.3 : Math.max(0, (1 - h) / 0.2) * 0.3;
        group.rotation.z = Math.sin(st.t * (12 + h * 26)) * shake;
        group.rotation.x = Math.sin(st.t * (9 + h * 18)) * shake * 0.4;
        pip.visible = h > 0.2;
        if (pip.visible) pip.scale.set(Math.min(1.3, 0.5 + (h - 0.2) * 3), Math.min(1.3, 0.5 + (h - 0.2) * 3), 0.35);
        beak.visible = h > 0.24 && h < 0.72 && Math.sin(st.t * 7) > 0.2;
        const zip = clamp01((h - 0.3) / 0.38);
        for (let i = 0; i < cracks.length; i++) cracks[i].visible = i / cracks.length < zip;
        const open = clamp01((h - 0.72) / 0.28);
        topPivot.position.y = BASE + open * 0.5;
        topPivot.position.x = open * 0.45;
        topPivot.position.z = open * 0.15;
        topPivot.rotation.z = open * 1.5;
        topPivot.rotation.x = open * 0.5;
        bottomPivot.scale.set(1 + open * 0.05, 1.3 - open * 0.15, 1 + open * 0.05);
        group.position.y = ctl.jumpY || 0;
      }
      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      return { group, update, land() {}, state: st };
    }

    // 배설물 — 일반 똥(흰 모자 있음) / 맹장 똥(흐물, 흰 모자 없음, 냄새 지독)
    function makePoop(cecal, scale) {
      const g = new THREE.Group();
      const sc = scale || 1;
      if (cecal) {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), hard(0x7A5A32, { roughness: 1 }));
        body.scale.set(1.5, 0.45, 1.1); body.position.y = 0.08; body.castShadow = true; g.add(body);
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), hard(0x8B6A3A, { roughness: 1 }));
        blob.scale.set(1.2, 0.5, 1); blob.position.set(0.12, 0.13, 0.05); g.add(blob);
      } else {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), hard(0x6E5535, { roughness: 1 }));
        body.scale.set(1, 0.85, 1); body.position.y = 0.12; body.castShadow = true; g.add(body);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), hard(0xF2EFE4, { roughness: 1 }));
        cap.scale.set(1, 0.7, 1); cap.position.y = 0.22; g.add(cap);
      }
      g.scale.setScalar(sc);
      scene.add(g);
      return g;
    }
    // 먼지 구름 (모래 목욕·착지)
    const puffs = [];
    const puffGeo = new THREE.SphereGeometry(0.18, 8, 6);
    function puff(x, z, n, spread, color) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const mat = new THREE.MeshBasicMaterial({ color: color || 0xD9C9A8, transparent: true, opacity: 0.55, depthWrite: false });
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(puffGeo, mat.clone());
        const a = Math.random() * Math.PI * 2, r = Math.random() * (spread || 0.6);
        m.position.set(Math.cos(a) * r, 0.1 + Math.random() * 0.3, Math.sin(a) * r * 0.6);
        m.userData.v = { x: Math.cos(a) * (0.5 + Math.random()), y: 0.6 + Math.random() * 1.1, z: Math.sin(a) * (0.3 + Math.random() * 0.6) };
        m.scale.setScalar(0.5 + Math.random() * 0.7);
        g.add(m);
      }
      scene.add(g); puffs.push({ g, t: 0 });
    }
    // 반짝임 (모래 목욕 직후 깃털이 반들반들)
    const sparks = [];
    function sparkle(x, z, h) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const geo = new THREE.OctahedronGeometry(0.11, 0);
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xFFF6C8, transparent: true, opacity: 0.95, depthWrite: false }));
        const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.55;
        m.position.set(Math.cos(a) * r, h * (0.2 + Math.random() * 0.9), Math.sin(a) * r * 0.6);
        m.userData.d = 0.18 + Math.random() * 0.5;
        m.userData.rise = 0.35 + Math.random() * 0.5;
        m.scale.setScalar(0.6 + Math.random() * 0.8);
        g.add(m);
      }
      scene.add(g); sparks.push({ g, t: 0 });
    }
    function tickSparks(dt) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s2 = sparks[i]; s2.t += dt;
        for (const m of s2.g.children) {
          m.position.y += m.userData.rise * dt;
          m.rotation.y += dt * 7; m.rotation.x += dt * 5;
          const k = Math.max(0, 1 - (s2.t - m.userData.d) / 0.85);
          m.material.opacity = s2.t < m.userData.d ? 0 : 0.95 * k;
          m.scale.setScalar((0.6 + Math.sin(s2.t * 12) * 0.25) * k + 0.05);
        }
        if (s2.t > 1.7) { scene.remove(s2.g); for (const m of s2.g.children) m.material.dispose(); sparks.splice(i, 1); }
      }
    }
    function tickPuffs(dt) {
      // 풍차 날개는 천천히 돈다
      for (const o of world.decos.values()) if (o.userData.spin) o.userData.spin.rotation.z += dt * 0.9;
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]; p.t += dt;
        for (const m of p.g.children) {
          m.position.x += m.userData.v.x * dt; m.position.y += m.userData.v.y * dt; m.position.z += m.userData.v.z * dt;
          m.userData.v.y -= 1.6 * dt;
          m.scale.multiplyScalar(1 + dt * 0.9);
          m.material.opacity = Math.max(0, 0.55 * (1 - p.t / 1.1));
        }
        if (p.t > 1.1) { scene.remove(p.g); for (const m of p.g.children) m.material.dispose(); puffs.splice(i, 1); }
      }
    }

    // 부화하고 남은 껍질 조각 (잠시 바닥에 남는다)
    const shellPiles = [];
    function addShells(x, z) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const mat = () => new THREE.MeshPhysicalMaterial({ color: 0xFFF6E6, roughness: 0.55, side: THREE.DoubleSide, transparent: true, opacity: 1 });
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 0, 1.15), mat());
      a.scale.set(1, 1.3, 1); a.rotation.set(Math.PI * 0.62, Math.random() * 3, 0.35); a.position.set(-0.45, 0.14, 0.15); a.castShadow = true; g.add(a);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, Math.PI * 2, 1.15, Math.PI - 1.15), mat());
      b.scale.set(1, 1.3, 1); b.rotation.set(-0.3, Math.random() * 3, -0.25); b.position.set(0.4, 0.16, -0.1); b.castShadow = true; g.add(b);
      scene.add(g); shellPiles.push({ g, born: performance.now() });
      return g;
    }
    function tickShells() {
      const t = performance.now();
      for (let i = shellPiles.length - 1; i >= 0; i--) {
        const s = shellPiles[i], age = (t - s.born) / 1000;
        if (age > 120) { scene.remove(s.g); shellPiles.splice(i, 1); }
        else if (age > 100) s.g.traverse((o) => { if (o.isMesh) o.material.opacity = 1 - (age - 100) / 20; });
      }
    }

    // ---- 소품 ----
    const hard = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, extra));
    function shadowed(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; } }); return o; }
    let coopSkin = { roof: 0xD9574F, ridge: 0xB84640 };
    function makeCoop() {
      const g = new THREE.Group();
      const wood = hard(0xE3BF92), trim = hard(0xFFF7EC), dark = hard(0x5B3A21), roofC = hard(coopSkin.roof);
      // 몸체 (앞면이 +z)
      const W = 3.6, D = 2.6, Hh = 2.0;
      const body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), wood); body.position.y = Hh / 2 + 0.1; g.add(body);
      // 바닥 받침(기둥)
      for (const [x, z] of [[-W / 2 + 0.2, D / 2 - 0.2], [W / 2 - 0.2, D / 2 - 0.2], [-W / 2 + 0.2, -D / 2 + 0.2], [W / 2 - 0.2, -D / 2 + 0.2]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), dark); leg.position.set(x, 0.05, z); g.add(leg); }
      // 박공 지붕: 삼각기둥(Shape → Extrude), 처마 여유
      const rh = 1.1, ow = 0.35;
      const tri = new THREE.Shape(); tri.moveTo(-W / 2 - ow, 0); tri.lineTo(W / 2 + ow, 0); tri.lineTo(0, rh); tri.closePath();
      const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: D + ow * 2, bevelEnabled: false }), trim); gable.position.set(0, Hh + 0.1, -D / 2 - ow); g.add(gable);
      const slopeLen = Math.hypot(W / 2 + ow, rh) + 0.12, ang = Math.atan2(rh, W / 2 + ow);
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.12, D + ow * 2 + 0.2), roofC);
        panel.position.set(side * (W / 2 + ow) / 2, Hh + 0.1 + rh / 2 + 0.06, 0); panel.rotation.z = -side * ang; g.add(panel);
      }
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, D + ow * 2 + 0.3), hard(coopSkin.ridge)); ridge.position.set(0, Hh + 0.1 + rh + 0.06, 0); g.add(ridge); g.userData.roofMats = [roofC, ridge.material];
      // 문 (아치) + 문틀
      const arch = new THREE.Shape(); arch.moveTo(-0.55, 0); arch.lineTo(-0.55, 0.7); arch.absarc(0, 0.7, 0.55, Math.PI, 0, true); arch.lineTo(0.55, 0); arch.closePath();
      const door = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.08, bevelEnabled: false }), dark); door.position.set(0, 0.1, D / 2 - 0.02); g.add(door);
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.06, bevelEnabled: false }), trim); frame.scale.set(1.14, 1.1, 1); frame.position.set(0, 0.1, D / 2 - 0.06); g.add(frame);
      // 경사로 + 발판
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.7), hard(0xC9A272)); ramp.position.set(0, 0.16, D / 2 + 0.75); ramp.rotation.x = 0.22; g.add(ramp);
      for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.08), dark); c.position.set(0, 0.2 + (3 - i) * 0.07, D / 2 + 0.35 + i * 0.36); c.rotation.x = 0.22; g.add(c); }
      // 창문 + 창틀 (옆면)
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.7), hard(0xBFE3F7, { roughness: 0.25 })); win.position.set(W / 2 + 0.02, 1.4, 0.2); g.add(win);
      const wf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.82), trim); wf.position.set(W / 2, 1.4, 0.2); g.add(wf);
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.05), trim); bar1.position.set(W / 2 + 0.04, 1.4, 0.2); g.add(bar1);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.72), trim); bar2.position.set(W / 2 + 0.04, 1.4, 0.2); g.add(bar2);
      // 모서리 기둥 장식
      for (const x of [-W / 2, W / 2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, Hh, 0.14), trim); post.position.set(x, Hh / 2 + 0.1, D / 2); g.add(post); }
      // 풍향계 대신 작은 닭 실루엣 원반
      const vane = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), dark); vane.position.set(0, Hh + 0.1 + rh + 0.35, 0); g.add(vane);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), hard(0xF2B84B, { roughness: 0.4 })); ball.position.set(0, Hh + 0.1 + rh + 0.62, 0); g.add(ball);
      return shadowed(g);
    }
    function makeNest() {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.28, 12, 32), hard(0xD9B26A)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.28; g.add(ring);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.3, 24), hard(0xC49A55)); inner.position.y = 0.15; g.add(inner);
      for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), hard(0xE8C888)); const a = i / 14 * Math.PI * 2; s.position.set(Math.cos(a) * 0.8, 0.32, Math.sin(a) * 0.8); s.rotation.set(Math.random() * 0.6, a, Math.PI / 2 + (Math.random() - 0.5) * 0.6); g.add(s); }
      return shadowed(g);
    }
    function makeFeeder(tint) {
      const g = new THREE.Group();
      const body = hard(tint === undefined ? 0xE0524E : tint);
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.75, 0.35, 32), body); tray.position.y = 0.18; g.add(tray);
      const grain = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 32), hard(0xF0C070, { roughness: 1 })); grain.position.y = 0.4; g.add(grain); g.userData.grain = grain;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 24), body); tower.position.y = 0.85; g.add(tower);
      return shadowed(g);
    }
    const makeFeeder2 = () => makeFeeder(0x6FA8DC);      // 두 번째 통은 파랑 — 한눈에 구별되게
    function makeWaterer() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.7, 0.3, 32), hard(0xE0524E)); base.position.y = 0.15; g.add(base);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 32), hard(0x7EC8FF, { roughness: 0.15, transparent: true, opacity: 0.85 })); water.position.y = 0.32; g.add(water); g.userData.water = water;
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 24), new THREE.MeshPhysicalMaterial({ color: 0xDDEFFF, roughness: 0.1, transparent: true, opacity: 0.55, transmission: 0 })); jar.position.y = 0.95; g.add(jar);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.2, 24), hard(0xE0524E)); cap.position.y = 1.65; g.add(cap);
      return shadowed(g);
    }
    function makeBasket() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.8, 24), hard(0xD8A868)); body.position.y = 0.4; g.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 10, 32), hard(0xB58445)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.8; g.add(rim);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 10, 32, Math.PI), hard(0xB58445)); handle.position.y = 0.8; g.add(handle);
      const eggs = new THREE.Group(); eggs.position.y = 0.75; g.add(eggs); g.userData.eggs = eggs;
      return shadowed(g);
    }
    function makeLamp() {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.12, 24), hard(0x555B66)); base.position.y = 0.06; g.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 10), hard(0x6E7683)); pole.position.y = 1.7; g.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), hard(0x6E7683)); arm.rotation.z = Math.PI / 2; arm.position.set(0.6, 3.25, 0); g.add(arm);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.8, 24, 1, true), hard(0xC0392B, { side: THREE.DoubleSide })); shade.position.set(1.2, 2.95, 0); g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xFFE2A8, emissive: 0xFFB347, emissiveIntensity: 2.2 })); bulb.position.set(1.2, 2.75, 0); g.add(bulb);
      const light = new THREE.PointLight(0xFFB870, 18, 7, 2); light.position.set(1.2, 2.6, 0); g.add(light);
      g.userData.light = light;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0xFFB870, transparent: true, opacity: 0.18, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(1.2, 0.02, 0); glow.raycast = () => {}; g.add(glow);
      g.userData.glow = glow;
      // 켜져 있다는 것이 한눈에 보이도록 빛기둥을 세운다
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(1.7, 2.75, 28, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xFFC978, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(1.2, 1.4, 0); beam.raycast = () => {}; g.add(beam);   // 빛은 클릭을 가로채지 않는다
      g.userData.beam = beam;
      g.userData.bulb = bulb;
      g.userData.shade = shade;
      g.userData.warmSpot = { dx: 1.2, dz: 0 };
      return shadowed(g);
    }
    function makeDustPit() {
      const g = new THREE.Group();
      const sand = hard(0xE8D5A8, { roughness: 1 }), sandD = hard(0xCDB584, { roughness: 1 });
      // 얕게 파인 모래 구덩이
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.22, 36), sand); rim.position.y = 0.11; rim.scale.z = 0.62; g.add(rim);
      const hollow = new THREE.Mesh(new THREE.SphereGeometry(1.75, 32, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), sandD);
      hollow.scale.set(1, 0.22, 0.62); hollow.position.y = 0.23; g.add(hollow);
      // 가장자리에 흩어진 모래알
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, r = 2.1 + Math.random() * 0.9;
        const gr = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 6, 5), Math.random() < 0.5 ? sand : sandD);
        gr.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r * 0.62); gr.scale.y = 0.6; g.add(gr);
      }
      // 발자국·긁힌 자국
      for (let i = 0; i < 6; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.1), sandD);
        t.position.set((Math.random() - 0.5) * 2.4, 0.23, (Math.random() - 0.5) * 1.2);
        t.rotation.y = Math.random() * 1.2 - 0.6; g.add(t);
      }
      return shadowed(g);
    }
    // 횟대 — 닭은 높은 곳에서 잔다. 어린닭이 되면 할머니가 놓아 준다.
    const PERCH_Y = global.TP_WORLD_PERCH_Y;
    function makePerch() {
      const g = new THREE.Group();
      const wood = hard(0xC49A63), dark = hard(0x9B7A50);
      for (const side of [-1, 1]) {
        // A 자 다리
        for (const lean of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, PERCH_Y * 1.12, 7), dark);
          leg.position.set(side * 1.5, PERCH_Y / 2, lean * 0.3);
          leg.rotation.x = lean * 0.28;
          leg.castShadow = true; g.add(leg);
        }
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 10), wood);
      bar.rotation.z = Math.PI / 2; bar.position.y = PERCH_Y;
      bar.castShadow = true; g.add(bar);
      // 아래 가로대 (흔들리지 않게 받치는 나무)
      const brace = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.07, 0.07), dark);
      brace.position.y = PERCH_Y * 0.42; g.add(brace);
      return shadowed(g);
    }
    function makeWormBucket() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.7, 24), hard(0x8FB8E8)); body.position.y = 0.35; g.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 24), hard(0x6E9AD0)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.7; g.add(rim);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), hard(0x6B4A2E, { roughness: 1 })); soil.position.y = 0.66; soil.userData.part = 'worms'; g.add(soil);
      const worms = new THREE.Group(); worms.position.y = 0.72; worms.userData.part = 'worms'; g.add(worms); g.userData.worms = worms;
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.02), hard(0xFFF7EC)); label.position.set(0, 0.35, 0.5); g.add(label);
      return shadowed(g);
    }
    function makeWorm() {
      const g = new THREE.Group(); const segs = [];
      for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.11 - i * 0.008, 12, 8), hard(i ? 0xF29AA6 : 0xE87F8E, { roughness: 0.6 })); m.position.x = (i - 2) * 0.16; m.castShadow = true; g.add(m); segs.push(m); }
      const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), hard(0x2A1A10)); e1.position.set(-0.36, 0.06, 0.07); g.add(e1);
      const e2 = e1.clone(); e2.position.z = -0.07; g.add(e2);
      let t = 0;
      return { group: g, update(dt) { t += dt; segs.forEach((m, i) => { m.position.y = Math.sin(t * 9 + i * 1.1) * 0.05; m.position.z = Math.sin(t * 6 + i * 0.9) * 0.04; }); } };
    }
    // 통 안의 벌레 — 흙에서 고개를 내민 모양.
    // 예전에는 누운 벌레를 방사형으로 깔았더니 위에서 보면 문어 다리처럼 보였다.
    function makeBucketWorm(seed) {
      const g = new THREE.Group();
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);                       // 0=흙 속, 1=끝
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 - i * 0.008, 10, 8),
          hard(i === n - 1 ? 0xE87F8E : 0xF2A2AC, { roughness: 0.6 }));
        // 흙에서 솟아올랐다가 앞으로 꺾이는 곡선
        m.position.set(Math.sin(t * 2.0) * 0.16, t * 0.19, -Math.cos(t * 1.4) * 0.05);
        m.castShadow = true;
        g.add(m);
      }
      g.rotation.y = seed * 2.4;
      return g;
    }
    function setWormCount(n) {
      const b = world.props.wormbucket; if (!b) return;
      const ws = b.userData.worms; const k = Math.min(3, n);
      while (ws.children.length > k) ws.remove(ws.children[ws.children.length - 1]);
      while (ws.children.length < k) {
        const i = ws.children.length;
        const w = makeBucketWorm(i + 0.4);
        // 통 안쪽에 옹기종기 — 테두리 밖으로 뻗지 않게 반경을 좁힌다
        w.position.set(Math.cos(i * 2.3) * 0.17, -0.04, Math.sin(i * 2.3) * 0.17);
        ws.add(w);
      }
    }
    function setProps(layout) { // layout: { coop:{x,z}, nest:{x,z}, ... , flip }
      const makers = { coop: makeCoop, nest: makeNest, feeder: makeFeeder, feeder2: makeFeeder2, waterer: makeWaterer, basket: makeBasket, wormbucket: makeWormBucket, lamp: makeLamp, dustpit: makeDustPit, perch: makePerch };
      for (const k of Object.keys(makers)) {
        if (!world.props[k]) { world.props[k] = makers[k](); world.props[k].userData.propName = k; scene.add(world.props[k]); }
        const p = world.props[k], L = layout[k];
        p.position.set(L.x, 0, L.z); p.rotation.y = layout.flip ? Math.PI : 0;
        if (k === 'coop') p.rotation.y = layout.flip ? -0.25 : 0.25;
        p.visible = L.visible !== false;
        p.userData.layout = L;
      }
    }
    // ── 마당 장식물 ──
    // 아이가 사서 놓는 것. 닭의 판단에는 들어가지 않는다 — 걸어서 지나간다.
    // 장식물을 빚는 작은 도구들
    const sph = (r) => new THREE.SphereGeometry(r, 16, 12);
    const cyl = (rt, rb, h, n = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
    function mk(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
    const decoMakers = {
      flowerbed() {
        const g = new THREE.Group();
        const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.22, 20), hard(0x8B6A4A));
        soil.position.y = 0.11; g.add(soil);
        const cols = [0xF07F9A, 0xFFE07A, 0xEF8A5A, 0xC79BE0];
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2, r = 0.25 + (i % 3) * 0.26;
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), hard(0x6FAF62));
          stem.position.set(Math.cos(a) * r, 0.42, Math.sin(a) * r); g.add(stem);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), hard(cols[i % 4]));
          head.scale.y = 0.7; head.position.set(Math.cos(a) * r, 0.64, Math.sin(a) * r); head.castShadow = true; g.add(head);
        }
        return g;
      },
      scarecrow() {
        const g = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), hard(0x9B7A50));
        post.position.y = 1.1; post.castShadow = true; g.add(post);
        const arms = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), hard(0x9B7A50));
        arms.position.y = 1.55; g.add(arms);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.3), hard(0x7FA9D8));
        body.position.y = 1.36; body.castShadow = true; g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), hard(0xE8C87A));
        head.position.y = 1.98; head.castShadow = true; g.add(head);
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 18), hard(0xC9A35E));
        hat.position.y = 2.2; g.add(hat);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.24, 16), hard(0xC9A35E));
        crown.position.y = 2.33; g.add(crown);
        return g;
      },
      swing() {
        const g = new THREE.Group();
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8), hard(0xA9814F));
          leg.position.set(side * 0.85, 0.9, 0); leg.rotation.z = side * 0.16; leg.castShadow = true; g.add(leg);
        }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 8), hard(0xA9814F));
        bar.rotation.z = Math.PI / 2; bar.position.y = 1.78; g.add(bar);
        for (const side of [-1, 1]) {
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), hard(0xE8DCC0));
          rope.position.set(side * 0.34, 1.3, 0); g.add(rope);
        }
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.34), hard(0xD9A05B));
        seat.position.y = 0.84; seat.castShadow = true; g.add(seat);
        return g;
      },
      fence() {
        const g = new THREE.Group();
        for (let i = -2; i <= 2; i++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), hard(0xE8DCC0));
          post.position.set(i * 0.6, 0.45, 0); post.castShadow = true; g.add(post);
        }
        for (const y of [0.34, 0.66]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 0.08), hard(0xE8DCC0));
          rail.position.set(0, y, 0); g.add(rail);
        }
        return g;
      },
      pond() {
        const g = new THREE.Group();
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.14, 24), hard(0xA9987A));
        rim.position.y = 0.07; g.add(rim);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.1, 24), hard(0x6FC2DE, { roughness: 0.15 }));
        water.position.y = 0.12; g.add(water);
        for (let i = 0; i < 5; i++) {
          const a = i / 5 * Math.PI * 2;
          const st = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), hard(0x9E9280));
          st.scale.y = 0.55; st.position.set(Math.cos(a) * 1.14, 0.12, Math.sin(a) * 1.14); g.add(st);
        }
        return g;
      },
      // ── 2026-09-22 추가 — 아이들이 "꾸미기가 너무 적어요" 했다 ──
      rock() {
        const g = new THREE.Group();
        const a = mk(new THREE.DodecahedronGeometry(0.55, 1), hard(0xA39C90, { roughness: 0.9 }), 0, 0.32, 0); a.scale.set(1.2, 0.7, 1);
        mk(new THREE.DodecahedronGeometry(0.28, 1), hard(0x8F887C, { roughness: 0.9 }), 0.55, 0.16, 0.25, g);
        g.add(a); return g;
      },
      sunflower() {
        const g = new THREE.Group();
        mk(cyl(0.05, 0.06, 1.5, 6), hard(0x5E9A45), 0, 0.75, 0, g);
        const leafM = hard(0x6FAF62);
        for (const sd of [-1, 1]) { const l = mk(sph(0.22), leafM, sd * 0.2, 0.6, 0, g); l.scale.set(1.4, 0.3, 0.7); l.rotation.z = sd * 0.5; }
        const face = new THREE.Group(); face.position.set(0, 1.55, 0.05); face.rotation.x = -0.35; g.add(face);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const p = mk(sph(0.14), hard(0xFFC83D), Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0, face); p.scale.set(1.5, 0.7, 0.3); p.rotation.z = a; }
        mk(cyl(0.26, 0.26, 0.1, 18), hard(0x7A4A24), 0, 0, 0.02, face).rotation.x = Math.PI / 2;
        return g;
      },
      mushroom() {
        const g = new THREE.Group();
        mk(cyl(0.2, 0.26, 0.55, 12), hard(0xFFF5E6), 0, 0.27, 0, g);
        const cap = mk(new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hard(0xD9463C), 0, 0.5, 0, g); cap.scale.y = 0.75;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mk(sph(0.08), hard(0xFFFFFF), Math.cos(a) * 0.34, 0.72, Math.sin(a) * 0.34, g); }
        mk(sph(0.08), hard(0xFFFFFF), 0, 0.92, 0, g);
        return g;
      },
      pot() {
        const g = new THREE.Group();
        mk(cyl(0.38, 0.28, 0.5, 16), hard(0xC9744A), 0, 0.25, 0, g);
        mk(cyl(0.42, 0.42, 0.08, 16), hard(0xB5623C), 0, 0.5, 0, g);
        const cols = [0xF07F9A, 0xFFE07A, 0xC79BE0];
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; mk(cyl(0.03, 0.03, 0.4, 6), hard(0x6FAF62), Math.cos(a) * 0.14, 0.72, Math.sin(a) * 0.14, g); mk(sph(0.13), hard(cols[i]), Math.cos(a) * 0.14, 0.94, Math.sin(a) * 0.14, g); }
        return g;
      },
      haybale() {
        const g = new THREE.Group();
        const b = mk(cyl(0.55, 0.55, 1.1, 20), hard(0xE3C46A, { roughness: 0.95 }), 0, 0.55, 0, g); b.rotation.z = Math.PI / 2;
        for (const x of [-0.3, 0.3]) { const r = mk(cyl(0.565, 0.565, 0.06, 20), hard(0xB0843A), x, 0.55, 0, g); r.rotation.z = Math.PI / 2; }
        return g;
      },
      stones() {
        const g = new THREE.Group();
        for (let i = 0; i < 5; i++) { const s = mk(cyl(0.32, 0.34, 0.1, 14), hard(0xC9C2B4, { roughness: 0.9 }), (i - 2) * 0.62, 0.05, Math.sin(i * 1.7) * 0.25, g); s.scale.z = 0.8; }
        return g;
      },
      mailbox() {
        const g = new THREE.Group();
        mk(cyl(0.07, 0.07, 1.1, 8), hard(0x8B6A4A), 0, 0.55, 0, g);
        const box = mk(new THREE.BoxGeometry(0.5, 0.4, 0.7), hard(0xD9463C), 0, 1.2, 0, g); box.castShadow = true;
        const top = mk(cyl(0.25, 0.25, 0.7, 16, true), hard(0xD9463C), 0, 1.4, 0, g); top.rotation.x = Math.PI / 2;
        mk(new THREE.BoxGeometry(0.04, 0.3, 0.08), hard(0xFFE07A), 0.27, 1.45, 0.2, g);
        return g;
      },
      bench() {
        const g = new THREE.Group();
        const wood = hard(0xB5824E);
        mk(new THREE.BoxGeometry(1.8, 0.1, 0.5), wood, 0, 0.55, 0, g).castShadow = true;
        mk(new THREE.BoxGeometry(1.8, 0.4, 0.08), wood, 0, 0.85, -0.24, g);
        for (const x of [-0.75, 0.75]) for (const z of [-0.18, 0.18]) mk(new THREE.BoxGeometry(0.1, 0.55, 0.1), hard(0x7A5A3A), x, 0.27, z, g);
        return g;
      },
      birdhouse() {
        const g = new THREE.Group();
        mk(cyl(0.06, 0.06, 1.5, 8), hard(0x8B6A4A), 0, 0.75, 0, g);
        mk(new THREE.BoxGeometry(0.55, 0.55, 0.5), hard(0x8FC7E8), 0, 1.75, 0, g).castShadow = true;
        const roof = mk(new THREE.ConeGeometry(0.5, 0.4, 4), hard(0xD9574F), 0, 2.22, 0, g); roof.rotation.y = Math.PI / 4;
        mk(cyl(0.1, 0.1, 0.05, 14), hard(0x3A2A1A), 0, 1.8, 0.26, g).rotation.x = Math.PI / 2;
        return g;
      },
      tree() {
        const g = new THREE.Group();
        mk(cyl(0.16, 0.22, 1.4, 10), hard(0x8B6A4A), 0, 0.7, 0, g).castShadow = true;
        for (const [x, y, z, r] of [[0, 1.9, 0, 0.85], [0.5, 1.6, 0.2, 0.55], [-0.5, 1.65, -0.1, 0.6], [0.1, 2.4, -0.2, 0.55]]) mk(sph(r), hard(0x62A852), x, y, z, g).castShadow = true;
        for (const [x, y, z] of [[0.6, 1.9, 0.5], [-0.4, 2.0, 0.6], [0.2, 1.5, 0.75], [-0.7, 1.5, 0.3], [0.5, 2.4, 0.3]]) mk(sph(0.12), hard(0xD9322E), x, y, z, g);
        return g;
      },
      parasol() {
        const g = new THREE.Group();
        mk(cyl(0.04, 0.04, 2.1, 8), hard(0xEEEEEE), 0, 1.05, 0, g);
        const cols = [0xF07F9A, 0xFFFFFF];
        for (let i = 0; i < 8; i++) {
          const seg = mk(new THREE.ConeGeometry(1.2, 0.5, 8, 1, true, i / 8 * Math.PI * 2, Math.PI / 4), hard(cols[i % 2], { side: THREE.DoubleSide }), 0, 2.2, 0, g);
          seg.castShadow = true;
        }
        mk(new THREE.BoxGeometry(0.9, 0.08, 0.9), hard(0xF5EBD8), 0.9, 0.35, 0.2, g);
        return g;
      },
      lamppost() {
        const g = new THREE.Group();
        mk(cyl(0.07, 0.1, 2.3, 10), hard(0x3E4752), 0, 1.15, 0, g);
        const glowM = hard(0xFFF3C4, { roughness: 0.3 }); if (glowM.emissive) glowM.emissive.setHex(0xB8902A);
        mk(sph(0.26), glowM, 0, 2.45, 0, g);
        mk(new THREE.ConeGeometry(0.34, 0.22, 16), hard(0x3E4752), 0, 2.75, 0, g);
        return g;
      },
      windmill() {
        const g = new THREE.Group();
        mk(cyl(0.45, 0.7, 2.4, 12), hard(0xF1E7D2), 0, 1.2, 0, g).castShadow = true;
        mk(new THREE.ConeGeometry(0.6, 0.6, 12), hard(0xC9574F), 0, 2.7, 0, g);
        const hub = new THREE.Group(); hub.position.set(0, 2.2, 0.55); g.add(hub);
        for (let i = 0; i < 4; i++) { const b = mk(new THREE.BoxGeometry(0.22, 1.3, 0.04), hard(0xE8DCC0), 0, 0.65, 0); const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2 + 0.3; arm.add(b); hub.add(arm); }
        mk(sph(0.1), hard(0x7A5A3A), 0, 0, 0.03, hub);
        g.userData.spin = hub;                               // 바람개비 날개 (render 에서 돌린다)
        return g;
      },
      well() {
        const g = new THREE.Group();
        mk(cyl(0.8, 0.85, 0.7, 20, true), hard(0xA89E8E, { roughness: 0.9, side: THREE.DoubleSide }), 0, 0.35, 0, g).castShadow = true;
        mk(new THREE.TorusGeometry(0.82, 0.1, 8, 24), hard(0x9C9282), 0, 0.72, 0, g).rotation.x = Math.PI / 2;
        mk(cyl(0.72, 0.72, 0.04, 20), hard(0x3E6E8C, { roughness: 0.2 }), 0, 0.4, 0, g);
        for (const x of [-0.75, 0.75]) mk(new THREE.BoxGeometry(0.1, 1.5, 0.1), hard(0x8B6A4A), x, 1.1, 0, g);
        const roof = mk(new THREE.ConeGeometry(1.1, 0.6, 4), hard(0xC9574F), 0, 2.0, 0, g); roof.rotation.y = Math.PI / 4;
        const bucket = mk(cyl(0.16, 0.12, 0.22, 12), hard(0x8B6A4A), 0, 1.25, 0, g);
        mk(cyl(0.012, 0.012, 0.45, 4), hard(0xE8DCC0), 0, 1.58, 0, g);
        void bucket; return g;
      },
      statue() {
        const g = new THREE.Group();
        mk(new THREE.BoxGeometry(1.0, 0.5, 1.0), hard(0xE8E1D2, { roughness: 0.8 }), 0, 0.25, 0, g).castShadow = true;
        const gold = hard(0xF2C14E, { roughness: 0.25, metalness: 0.6 });
        const body = mk(sph(0.42), gold, 0, 0.95, 0, g); body.scale.set(1.15, 1, 1); body.castShadow = true;
        mk(sph(0.26), gold, 0.28, 1.45, 0, g);
        mk(new THREE.ConeGeometry(0.08, 0.2, 8), gold, 0.55, 1.43, 0, g).rotation.z = -Math.PI / 2;
        for (let i = 0; i < 3; i++) mk(sph(0.08), gold, 0.2 + i * 0.09, 1.72 - Math.abs(i - 1) * 0.04, 0, g);
        const tail = mk(new THREE.ConeGeometry(0.2, 0.5, 8), gold, -0.45, 1.2, 0, g); tail.rotation.z = 0.7;
        return g;
      },
      moonlantern() {
        const g = new THREE.Group();
        mk(cyl(0.05, 0.05, 1.8, 8), hard(0x8B6A4A), 0, 0.9, 0, g);
        mk(new THREE.BoxGeometry(0.7, 0.05, 0.05), hard(0x8B6A4A), 0.3, 1.8, 0, g);
        const m = hard(0xFFE9A8, { roughness: 0.4 }); if (m.emissive) m.emissive.setHex(0xC08A20);
        mk(sph(0.34), m, 0.6, 1.45, 0, g);
        mk(cyl(0.012, 0.012, 0.3, 4), hard(0x6B4A2E), 0.6, 1.66, 0, g);
        return g;
      },
      jackolantern() {
        const g = new THREE.Group();
        const orange = hard(0xF0892E);
        const p = mk(sph(0.5), orange, 0, 0.42, 0, g); p.scale.set(1.15, 0.85, 1.05); p.castShadow = true;
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const r = mk(sph(0.22), orange, Math.cos(a) * 0.42, 0.42, Math.sin(a) * 0.38, g); r.scale.set(0.8, 1.7, 0.8); }
        const glow = hard(0xFFE07A); if (glow.emissive) glow.emissive.setHex(0xCC8800);
        for (const x of [-0.18, 0.18]) mk(new THREE.ConeGeometry(0.08, 0.14, 3), glow, x, 0.52, 0.5, g).rotation.x = Math.PI / 2;
        const mouth = mk(new THREE.BoxGeometry(0.36, 0.08, 0.05), glow, 0, 0.32, 0.52, g); void mouth;
        mk(cyl(0.05, 0.07, 0.2, 8), hard(0x5E8C3A), 0, 0.85, 0, g);
        return g;
      },
      xmastree() {
        const g = new THREE.Group();
        mk(cyl(0.14, 0.16, 0.4, 8), hard(0x8B6A4A), 0, 0.2, 0, g);
        const green = hard(0x3E8C4E);
        [[0.95, 0.9, 0.75], [0.75, 0.8, 1.3], [0.52, 0.7, 1.8]].forEach(([r, h, y]) => { mk(new THREE.ConeGeometry(r, h, 14), green, 0, y, 0, g).castShadow = true; });
        const star = hard(0xFFE07A); if (star.emissive) star.emissive.setHex(0x886600);
        mk(new THREE.OctahedronGeometry(0.16), star, 0, 2.25, 0, g);
        const cols = [0xD9322E, 0xFFE07A, 0x5E93D6, 0xF4A6C0];
        for (let i = 0; i < 10; i++) { const a = i * 2.2, y = 0.6 + (i % 5) * 0.3, r = 0.85 - (y - 0.6) * 0.5; mk(sph(0.07), hard(cols[i % 4]), Math.cos(a) * r, y, Math.sin(a) * r, g); }
        return g;
      },
      snowman() {
        const g = new THREE.Group();
        const snow = hard(0xFAFCFF, { roughness: 0.95 });
        mk(sph(0.55), snow, 0, 0.5, 0, g).castShadow = true;
        mk(sph(0.38), snow, 0, 1.28, 0, g).castShadow = true;
        for (const x of [-0.12, 0.12]) mk(sph(0.04), hard(0x1E1410), x, 1.38, 0.34, g);
        mk(new THREE.ConeGeometry(0.06, 0.28, 8), hard(0xF0892E), 0, 1.28, 0.48, g).rotation.x = Math.PI / 2;
        mk(new THREE.TorusGeometry(0.34, 0.07, 8, 20), hard(0xD9322E), 0, 1.05, 0, g).rotation.x = Math.PI / 2;
        mk(cyl(0.25, 0.25, 0.3, 14), hard(0x2E2A28), 0, 1.75, 0, g);
        mk(cyl(0.36, 0.36, 0.04, 14), hard(0x2E2A28), 0, 1.6, 0, g);
        return g;
      },
      kite() {
        const g = new THREE.Group();
        mk(cyl(0.04, 0.04, 2.0, 6), hard(0x8B6A4A), 0, 1.0, 0, g);
        const k = new THREE.Group(); k.position.set(0, 2.1, 0); k.rotation.z = 0.12; g.add(k);
        mk(new THREE.BoxGeometry(0.9, 1.1, 0.03), hard(0xFFFFFF, { roughness: 0.9 }), 0, 0, 0, k).castShadow = true;
        mk(cyl(0.18, 0.18, 0.04, 18), hard(0xD9322E), 0, 0.05, 0.02, k).rotation.x = Math.PI / 2;
        mk(new THREE.BoxGeometry(0.9, 0.12, 0.035), hard(0x5E93D6), 0, 0.5, 0.01, k);
        for (const x of [-0.35, 0.35]) mk(new THREE.BoxGeometry(0.06, 0.8, 0.02), hard(x < 0 ? 0xF2C14E : 0x6FAF62), x, -0.85, 0, k);
        return g;
      },
    };
    // decos: [{ uid, kind, x, z }]
    function setDecos(list) {
      const keep = new Set();
      for (const d of list || []) {
        if (!decoMakers[d.kind]) continue;
        keep.add(d.uid);
        let o = world.decos.get(d.uid);
        if (!o) { o = decoMakers[d.kind](); o.userData.decoUid = d.uid; o.userData.decoKind = d.kind; scene.add(o); world.decos.set(d.uid, o); }
        o.position.set(d.x, 0, d.z);
      }
      for (const [uid, o] of world.decos) {
        if (keep.has(uid)) continue;
        scene.remove(o); disposeGroup(o); world.decos.delete(uid);
      }
    }
    function setCoopSkin(spec) {
      coopSkin = { roof: spec.roof, ridge: spec.ridge };
      const c = world.props.coop;
      if (!c || !c.userData.roofMats) return;
      c.userData.roofMats[0].color.setHex(spec.roof);
      c.userData.roofMats[1].color.setHex(spec.ridge);
    }
    function setSupplies(feed, water, basketCount, feed2) {
      const f = world.props.feeder, f2 = world.props.feeder2, w = world.props.waterer, b = world.props.basket;
      // 통마다 따로 찬다 — 하나를 채웠는데 둘 다 차면 통이 둘인 뜻이 없다
      for (const [fx, amt] of [[f, feed], [f2, feed2 === undefined ? feed : feed2]]) {
        if (!fx) continue;
        fx.userData.grain.visible = amt > 5;
        fx.userData.grain.scale.set(0.4 + amt / 100 * 0.6, 1, 0.4 + amt / 100 * 0.6);
      }
      if (w) { w.userData.water.visible = water > 5; w.userData.water.scale.set(0.5 + water / 200, 1, 0.5 + water / 200); }
      if (b) {
        const eggs = b.userData.eggs; const n = Math.min(6, basketCount);
        while (eggs.children.length > n) eggs.remove(eggs.children[eggs.children.length - 1]);
        while (eggs.children.length < n) { const i = eggs.children.length; const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), hard(0xFFF6E6, { roughness: 0.5 })); e.scale.set(1, 1.25, 1); const a = i * 2.1; e.position.set(Math.cos(a) * 0.32 * (i ? 1 : 0), 0.05 + (i > 3 ? 0.25 : 0), Math.sin(a) * 0.32 * (i ? 1 : 0)); e.rotation.z = (Math.random() - 0.5) * 0.6; eggs.add(e); }
      }
    }

    // 추가로 집을 수 있는 오브젝트(배설물 등)를 등록해 두면 함께 판정한다
    const extras = new Map();     // mesh(Group) → { type, id }
    function addPickable(obj, info) { extras.set(obj, info); }
    function removePickable(obj) { extras.delete(obj); }
    function pick(px, py) {
      ndc.set((px / world.W) * 2 - 1, -(py / world.H) * 2 + 1); ray.setFromCamera(ndc, camera);
      const meshes = []; for (const b of world.birds.values()) if (b.holder.visible) meshes.push(...b.meshes);
      const birdHits = ray.intersectObjects(meshes, false);
      const propObjs = Object.values(world.props).filter((o) => o.visible);
      const propHits = propObjs.length ? ray.intersectObjects(propObjs, true) : [];
      const exObjs = Array.from(extras.keys());
      const exHits = exObjs.length ? ray.intersectObjects(exObjs, true) : [];
      const cands = [];
      if (birdHits[0]) cands.push({ d: birdHits[0].distance, v: { type: 'bird', id: birdHits[0].object.userData.birdId } });
      if (propHits[0]) {
        let o = propHits[0].object, part = null;
        while (o && !o.userData.propName) { if (!part && o.userData.part) part = o.userData.part; o = o.parent; }
        if (o) cands.push({ d: propHits[0].distance, v: { type: 'prop', name: o.userData.propName, part } });
      }
      if (exHits[0]) { let o = exHits[0].object; while (o && !extras.has(o)) o = o.parent; if (o) cands.push({ d: exHits[0].distance - 0.4, v: extras.get(o) }); }
      // 장식물은 소품보다 살짝 뒤로 미룬다 — 겹쳐 놓았을 때 원래 쓰던 것이 먼저 잡혀야 한다
      const decoObjs = Array.from(world.decos.values());
      const decoHits = decoObjs.length ? ray.intersectObjects(decoObjs, true) : [];
      if (decoHits[0]) {
        let o = decoHits[0].object;
        while (o && !o.userData.decoUid) o = o.parent;
        if (o) cands.push({ d: decoHits[0].distance + 0.25, v: { type: 'deco', uid: o.userData.decoUid, kind: o.userData.decoKind } });
      }
      cands.sort((a, b2) => a.d - b2.d);
      return cands.length ? cands[0].v : null;
    }
    let lastRender = performance.now();
    function render() { const t = performance.now(); const d = Math.min(0.1, (t - lastRender) / 1000); tickPuffs(d); tickSparks(d); scenery.tick(d); lastRender = t; tickShells(); renderer.render(scene, camera); if (pendingShot) takeShot(); }

    world.decoKinds = Object.keys(decoMakers);
    Object.assign(world, { makeWorm, setWormCount, addShells, puff, sparkle, makePoop, addPickable, removePickable, fit, screenToGround, screenToPlaneZ, project, pointAlongRay, addBird, setStage, removeBird, heightOf, setProps, setSupplies, pick, render });
    // 관찰일지용 사진 — 화면에서 한 곳을 잘라 작은 JPEG 로 돌려준다.
    // WebGL 캔버스는 '그린 직후'에만 읽을 수 있다(preserveDrawingBuffer 가 꺼져 있어서).
    // 그래서 여기서 바로 찍지 않고 예약해 두었다가 render() 안에서 찍는다.
    let pendingShot = null;
    function capture(cx, cy, outW, outH) {
      return new Promise((res) => {
        if (pendingShot) pendingShot.res(null);          // 밀린 예약은 버린다
        pendingShot = { cx, cy, outW, outH, res };
      });
    }
    function takeShot() {
      const s = pendingShot; pendingShot = null;
      try {
        const src = renderer.domElement;
        const dpr = src.width / Math.max(1, world.W);
        const cw = s.outW * 1.5, ch = s.outH * 1.5;   // 주인공이 화면을 채우도록 바짝
        let sx = (s.cx - cw / 2) * dpr, sy = (s.cy - ch / 2) * dpr;
        sx = Math.max(0, Math.min(sx, src.width - cw * dpr));
        sy = Math.max(0, Math.min(sy, src.height - ch * dpr));
        const c = document.createElement('canvas');
        c.width = s.outW; c.height = s.outH;
        const g2 = c.getContext('2d');
        g2.fillStyle = '#9CCB6B'; g2.fillRect(0, 0, s.outW, s.outH);   // 캔버스가 투명하므로 잔디색을 깔고
        g2.drawImage(src, sx, sy, cw * dpr, ch * dpr, 0, 0, s.outW, s.outH);
        s.res(c.toDataURL('image/jpeg', 0.62));
      } catch (e) { s.res(null); }
    }
    // 보온등이 켜졌는지 눈으로 알 수 있어야 한다. 예전에는 세기와 무관하게 늘 켜져 있었다.
    function setLamp(power) {
      const g = world.props.lamp;
      if (!g || !g.userData.light) return;
      const u = g.userData;
      const p = Math.max(0, Math.min(1, power || 0));
      const on = p > 0.02;
      u.light.intensity = 30 * p;
      u.light.visible = on;
      u.glow.material.opacity = 0.10 + 0.34 * p;
      u.glow.scale.setScalar(0.8 + 0.5 * p);
      u.glow.visible = on;
      u.beam.material.opacity = 0.07 + 0.16 * p;
      u.beam.visible = on;
      // 전구 — 꺼지면 회색으로 식는다
      u.bulb.material.emissiveIntensity = 0.15 + 3.2 * p;
      u.bulb.material.color.setHex(on ? 0xFFE2A8 : 0xBDB6AA);
      u.bulb.material.emissive.setHex(on ? 0xFFB347 : 0x2A2620);
      // 갓 안쪽도 은은하게 물든다
      if (!u.shade.material.emissive) return;
      u.shade.material.emissive.setHex(0xFF9A4A);
      u.shade.material.emissiveIntensity = p * 0.55;
    }
    Object.assign(world, { capture, setLamp, setCoopSkin, setDecos, scenery });

    return world;
  }
  global.TP_WORLD = { create, STAGE_PRESET, COOP_ROOF_Y: 3.35, PERCH_Y: 0.95 };
})(typeof window !== 'undefined' ? window : module.exports);
