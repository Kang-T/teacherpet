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
    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC9D6EA, 1.6));
    const sun = new THREE.DirectionalLight(0xFFF6E8, 2.2); sun.position.set(6, 14, 12); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -0.0005;
    scene.add(sun); scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0xDDEEFF, 0.8); rim.position.set(-8, 6, -6); scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    const world = { renderer, scene, camera, birds: new Map(), props: {}, pxPerUnit: 50, xMin: -10, xMax: 10, W: 1, H: 1 };
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); const tmp = new THREE.Vector3();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // ---- 카메라: 화면 아래쪽에 바닥선이 오고, 1유닛이 pxPerUnit 픽셀이 되도록 ----
    function fit(W, H, pxPerUnit) {
      world.W = W; world.H = H; world.pxPerUnit = pxPerUnit;
      renderer.setSize(W, H, false);
      renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px';
      camera.aspect = W / H; camera.fov = 30;
      const D = H / (2 * pxPerUnit * Math.tan(THREE.MathUtils.degToRad(15)));
      const elev = THREE.MathUtils.degToRad(11);
      camera.position.set(0, D * Math.sin(elev), D * Math.cos(elev));
      // lookAt 높이를 이분 탐색: 바닥 원점이 화면 y = 96% 지점에 오도록
      let lo = -50, hi = 50;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2; camera.lookAt(0, mid, 0); camera.updateMatrixWorld();
        tmp.set(0, 0, 0).project(camera);
        if (tmp.y > -0.93) lo = mid; else hi = mid;  // 원점이 너무 위에 있으면 lookAt을 올린다
      }
      camera.lookAt(0, (lo + hi) / 2, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const a = screenToGround(0, H * 0.96), b = screenToGround(W, H * 0.96);
      world.xMin = a ? a.x : -10; world.xMax = b ? b.x : 10;
      const span = Math.max(20, (world.xMax - world.xMin) * 0.8);
      sun.shadow.camera.left = -span; sun.shadow.camera.right = span; sun.shadow.camera.top = span * 0.6; sun.shadow.camera.bottom = -span * 0.6;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = D * 3; sun.shadow.camera.updateProjectionMatrix();
      sun.position.set(6, 14, 12).multiplyScalar(Math.max(1, D / 30));
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
    function setStage(b, stage) {
      if (b.model) { b.holder.remove(b.model.group); }
      if (stage === 'egg') { b.model = makeEgg(); }
      else b.model = C.createChick(THREE, STAGE_PRESET[stage]);
      b.stage = stage; b.holder.add(b.model.group);
      b.meshes = []; b.model.group.traverse((o) => { if (o.isMesh) { o.userData.birdId = b.id; b.meshes.push(o); } });
    }
    function removeBird(id) { const b = world.birds.get(id); if (b) { scene.remove(b.holder); world.birds.delete(id); } }
    function heightOf(b) { // 모델 높이(월드 유닛)
      if (b.stage === 'egg') return 1.3;
      return { chick: 1.7, young: 2.2, hen: 2.85, rooster: 3.3 }[b.stage] || 2;
    }
    // 알 (품질감: 크림색 + 살구색 점)
    function makeEgg() {
      const group = new THREE.Group();
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0xFFF6E6, roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color(0xFFE8D0) }));
      m.scale.set(1, 1.3, 1); m.position.y = 0.65; m.castShadow = true; group.add(m);
      for (const [x, y, z] of [[-0.18, 0.85, 0.42], [0.22, 0.6, 0.4], [0.05, 1.05, 0.35], [-0.3, 0.5, 0.35]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xF4B78F, roughness: 1 })); s.scale.set(1, 1, 0.3); s.position.set(x, y, z); s.lookAt(0, 0.65, 0); group.add(s);
      }
      const st = { t: 0 };
      function update(dt, ctl) { st.t += dt; group.rotation.z = ctl.wobble ? Math.sin(st.t * 14) * 0.12 : Math.sin(st.t * 1.2) * 0.02; group.position.y = ctl.jumpY || 0; }
      return { group, update, land() {}, state: st };
    }

    // ---- 소품 ----
    const hard = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0 }, extra));
    function shadowed(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; } }); return o; }
    function makeCoop() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 2.6), hard(0xE9C9A0)); body.position.y = 1.1; g.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.55, 1.5, 4, 1), hard(0xE0645A)); roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 0.95); roof.position.y = 2.95; g.add(roof);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 24, 1, false, 0, Math.PI), hard(0x5B3A21)); door.rotation.x = Math.PI / 2; door.rotation.z = 0; door.position.set(0, 0.62, 1.31); g.add(door);
      const doorB = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.62, 0.1), hard(0x5B3A21)); doorB.position.set(0, 0.31, 1.31); g.add(doorB);
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.6), hard(0xC9A272)); ramp.position.set(0, 0.25, 2.0); ramp.rotation.x = 0.32; g.add(ramp);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.1), hard(0xBFE3F7, { roughness: 0.3 })); win.position.set(1.61, 1.5, 0.3); win.rotation.y = Math.PI / 2; g.add(win);
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
    function setProps(layout) { // layout: { coop:{x,z}, nest:{x,z}, ... , flip }
      const makers = { coop: makeCoop, nest: makeNest, feeder: makeFeeder, waterer: makeWaterer, basket: makeBasket };
      for (const k of Object.keys(makers)) {
        if (!world.props[k]) { world.props[k] = makers[k](); scene.add(world.props[k]); }
        const p = world.props[k], L = layout[k];
        p.position.set(L.x, 0, L.z); p.rotation.y = layout.flip ? Math.PI : 0;
        if (k === 'coop') p.rotation.y = layout.flip ? -0.35 : 0.35;
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

    function pick(px, py) {
      ndc.set((px / world.W) * 2 - 1, -(py / world.H) * 2 + 1); ray.setFromCamera(ndc, camera);
      const meshes = []; for (const b of world.birds.values()) if (b.holder.visible) meshes.push(...b.meshes);
      const hits = ray.intersectObjects(meshes, false);
      return hits.length ? hits[0].object.userData.birdId : null;
    }
    function render() { renderer.render(scene, camera); }

    Object.assign(world, { fit, screenToGround, screenToPlaneZ, project, pointAlongRay, addBird, setStage, removeBird, heightOf, setProps, setSupplies, pick, render });
    return world;
  }
  global.TP_WORLD = { create, STAGE_PRESET };
})(typeof window !== 'undefined' ? window : module.exports);
