// 티처펫 — 3D 무대 (three.js). 카메라 보정, 소품(닭장·둥지·모이통·물통·바구니), 알, 좌표 변환, 피킹.
(function (global) {
  const THREE = global.THREE;
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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // 마당은 화면과 무관하게 '고정된 크기의 장소'다.
    // 예전에는 xMin/xMax/zMin/zMax 를 화면 가장자리에서 역산했는데,
    // 그러면 확대하거나 각도를 바꾸는 순간 소품과 닭의 위치가 통째로 움직였다.
    const YARD = { w: 32, d: 30 };
    const world = {
      renderer, scene, camera, birds: new Map(), props: {}, pxPerUnit: 40,
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
    function makeCoop() {
      const g = new THREE.Group();
      const wood = hard(0xE3BF92), trim = hard(0xFFF7EC), dark = hard(0x5B3A21), roofC = hard(0xD9574F);
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
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, D + ow * 2 + 0.3), hard(0xB84640)); ridge.position.set(0, Hh + 0.1 + rh + 0.06, 0); g.add(ridge);
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
    function makeFeeder() {
      const g = new THREE.Group();
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.75, 0.35, 32), hard(0xE0524E)); tray.position.y = 0.18; g.add(tray);
      const grain = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 32), hard(0xF0C070, { roughness: 1 })); grain.position.y = 0.4; g.add(grain); g.userData.grain = grain;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.0, 24), hard(0xE0524E)); tower.position.y = 0.85; g.add(tower);
      return shadowed(g);
    }
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
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0xFFB870, transparent: true, opacity: 0.18, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(1.2, 0.02, 0); g.add(glow);
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
    function makeWormBucket() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.7, 24), hard(0x8FB8E8)); body.position.y = 0.35; g.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 24), hard(0x6E9AD0)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.7; g.add(rim);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), hard(0x6B4A2E, { roughness: 1 })); soil.position.y = 0.66; g.add(soil);
      const worms = new THREE.Group(); worms.position.y = 0.72; g.add(worms); g.userData.worms = worms;
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
    function setWormCount(n) {
      const b = world.props.wormbucket; if (!b) return;
      const ws = b.userData.worms; const k = Math.min(4, n);
      while (ws.children.length > k) ws.remove(ws.children[ws.children.length - 1]);
      while (ws.children.length < k) { const i = ws.children.length; const w = makeWorm().group; w.scale.setScalar(0.8); w.position.set(Math.cos(i * 1.7) * 0.2, 0, Math.sin(i * 1.7) * 0.2); w.rotation.y = i * 1.3; ws.add(w); }
    }
    function setProps(layout) { // layout: { coop:{x,z}, nest:{x,z}, ... , flip }
      const makers = { coop: makeCoop, nest: makeNest, feeder: makeFeeder, waterer: makeWaterer, basket: makeBasket, wormbucket: makeWormBucket, lamp: makeLamp, dustpit: makeDustPit };
      for (const k of Object.keys(makers)) {
        if (!world.props[k]) { world.props[k] = makers[k](); world.props[k].userData.propName = k; scene.add(world.props[k]); }
        const p = world.props[k], L = layout[k];
        p.position.set(L.x, 0, L.z); p.rotation.y = layout.flip ? Math.PI : 0;
        if (k === 'coop') p.rotation.y = layout.flip ? -0.25 : 0.25;
        p.visible = L.visible !== false;
        p.userData.layout = L;
      }
    }
    function setSupplies(feed, water, basketCount) {
      const f = world.props.feeder, w = world.props.waterer, b = world.props.basket;
      if (f) { f.userData.grain.visible = feed > 5; f.userData.grain.scale.set(0.4 + feed / 100 * 0.6, 1, 0.4 + feed / 100 * 0.6); }
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
      if (propHits[0]) { let o = propHits[0].object; while (o && !o.userData.propName) o = o.parent; if (o) cands.push({ d: propHits[0].distance, v: { type: 'prop', name: o.userData.propName } }); }
      if (exHits[0]) { let o = exHits[0].object; while (o && !extras.has(o)) o = o.parent; if (o) cands.push({ d: exHits[0].distance - 0.4, v: extras.get(o) }); }
      cands.sort((a, b2) => a.d - b2.d);
      return cands.length ? cands[0].v : null;
    }
    let lastRender = performance.now();
    function render() { const t = performance.now(); const d = Math.min(0.1, (t - lastRender) / 1000); tickPuffs(d); tickSparks(d); lastRender = t; tickShells(); renderer.render(scene, camera); if (pendingShot) takeShot(); }

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
    Object.assign(world, { capture });

    return world;
  }
  global.TP_WORLD = { create, STAGE_PRESET, COOP_ROOF_Y: 3.35 };
})(typeof window !== 'undefined' ? window : module.exports);
