// 티처펫 — 마당 밖 풍경
//
// 예전에는 하늘도 풀밭도 CSS 그라데이션 한 장이었다. 바닥이 아예 없었고,
// 지평선은 그냥 '색이 바뀌는 지점'이었다. 그래서 시점을 기울여도 먼 것과 가까운 것이
// 똑같이 움직였다 — 공간처럼 보이지 않았던 진짜 이유가 이것이다.
//
// 여기서는 진짜 바닥을 깔고, 그 위에 울타리·나무·밭·언덕을 올린다.
// 결은 소품과 같게: 매끄러운 면, 파스텔, 선 없음.
//
// ⚠️ 이 카메라로는 하늘이 화면에 들어오지 않는다.
//    시야각이 22°(위아래 ±11°)인데 내려다보는 각이 16~55°다. 화면 맨 위조차
//    수평선보다 5° 아래를 본다. 그래서 '하늘에 3D 구름을 띄우는' 방법은 쓸 수 없다 —
//    아무리 높이 멀리 두어도 화면 밖(위)이다. 실제로 만들어 띄워 보고 알았다.
//    대신 먼 바닥을 안개로 하늘색에 녹여 지평선을 만든다. 화면 위쪽의 '하늘'은
//    사실 아주 멀어서 하늘색이 된 땅이다. 구름은 그 위에 얹는다(web-ui.js).
(function (g) {
  const S = {};

  // 멀수록 옅고 푸르스름하게 (공기원근). 손으로 섞는다 — 안개만으로는 밋밋하다.
  function fade(THREE, hex, t, skyHex) {
    const c = new THREE.Color(hex), sky = new THREE.Color(skyHex);
    return c.lerp(sky, t);
  }

  function build(THREE, scene, YARD) {
    const hard = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, extra || {}));
    const root = new THREE.Group(); scene.add(root);

    // ── 바닥 ──
    // 마당보다 훨씬 넓게 깔고, 먼 쪽은 안개로 하늘에 녹인다.
    // 카메라가 멀리(100유닛 넘게) 있어서 바닥이 넉넉해야 한다. 가장자리가 보이면 세상이 끊긴다.
    const groundMat = hard(0x8FCB6B);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -YARD.d / 2;
    ground.receiveShadow = true;
    root.add(ground);

    // 마당 안쪽은 닭이 밟고 다녀 조금 닳은 색 — 경계를 울타리와 함께 읽히게 한다
    const patchMat = hard(0x9AD478);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(YARD.w + 2, YARD.d + 2), patchMat);
    patch.rotation.x = -Math.PI / 2; patch.position.set(0, 0.014, -YARD.d / 2 + 0.3);
    patch.receiveShadow = true;
    root.add(patch);
    // 울타리 밖으로 한 뼘 더 — 마당 흙이 들판으로 번지듯 이어지게
    const patchEdge = new THREE.Mesh(new THREE.PlaneGeometry(YARD.w + 7, YARD.d + 7), hard(0x8FCB6B));
    patchEdge.rotation.x = -Math.PI / 2; patchEdge.position.set(0, 0.008, -YARD.d / 2 + 0.3);
    patchEdge.receiveShadow = true;
    root.add(patchEdge);

    // ── 울타리 ──
    // 닭이 돌아서는 바로 그 줄에 세운다. 보이지 않던 벽에 이유를 준다.
    // 앞쪽(카메라 쪽)은 세우지 않는다 — 시야를 가로막는다.
    const fence = new THREE.Group(); root.add(fence);
    const postMat = hard(0xF2E7CE), railMat = hard(0xEADCBE);
    const x0 = -YARD.w / 2, x1 = YARD.w / 2, z0 = -YARD.d, z1 = 0.6;
    const POST_H = 1.15, STEP = 2.2;
    const postGeo = new THREE.BoxGeometry(0.17, POST_H, 0.17);
    const spots = [];
    for (let x = x0; x <= x1 + 0.01; x += STEP) spots.push([x, z0]);              // 뒤
    for (let z = z0; z <= z1 + 0.01; z += STEP) { spots.push([x0, z]); spots.push([x1, z]); }   // 옆
    for (let x = x0 + STEP; x <= x1 - STEP + 0.01; x += STEP) spots.push([x, z1, 0.62]);            // 앞 (낮게)
    const posts = new THREE.InstancedMesh(postGeo, postMat, spots.length);
    posts.castShadow = true; posts.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const sc = new THREE.Vector3(), q0 = new THREE.Quaternion(), pos = new THREE.Vector3();
    spots.forEach(([x, z, k], i) => {
      const f = k || 1;                       // 앞쪽 기둥은 낮다
      sc.set(1, f, 1); pos.set(x, POST_H * f / 2, z);
      m4.compose(pos, q0, sc); posts.setMatrixAt(i, m4);
    });
    posts.instanceMatrix.needsUpdate = true;
    fence.add(posts);
    const rail = (w, d, x, y, z) => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), railMat);
      r.position.set(x, y, z); r.castShadow = true; fence.add(r);
    };
    for (const y of [0.45, 0.85]) {
      rail(YARD.w + 0.2, 0.09, 0, y, z0);
      const sideLen = z1 - z0;
      rail(0.09, sideLen, x0, y, z0 + sideLen / 2);
      rail(0.09, sideLen, x1, y, z0 + sideLen / 2);
    }
    // 앞쪽(카메라 쪽)은 낮게 한 줄만. 마당을 닫아 주되 닭을 가리지 않는다.
    rail(YARD.w + 0.2, 0.09, 0, 0.42, z1);

    // ── 나무 ──
    // 마당 뒤와 옆으로. 바람 불면 살짝 흔들린다.
    const trees = new THREE.Group(); root.add(trees);
    // 층: 마당(0~-30) → 가까운 나무(-10~-45) → 밭(-48~-68) → 먼 나무(-52~-70) → 언덕(-72~-95)
    // 그보다 멀면 안개가 다 먹는다. 처음엔 -180 에 언덕을 뒀다가 영영 안 보여서 당겼다.
    const TREE_SPOTS = [
      [-24, -12, 1.0], [-20, -26, 1.25], [-31, -34, 1.5], [24, -10, 1.1], [21, -24, 1.3],
      [32, -33, 1.45], [-13, -41, 1.2], [9, -43, 1.35], [-35, -20, 1.15], [36, -19, 1.1],
      [-44, -30, 1.3], [45, -28, 1.25],
      [-30, -56, 1.5], [33, -58, 1.55], [-52, -52, 1.4], [54, -50, 1.45], [-2, -66, 1.5],
    ];
    for (const [tx, tz, s] of TREE_SPOTS) {
      const t = new THREE.Group();
      const far = Math.min(1, (-tz) / 90) * 0.55;            // 멀수록 하늘색에 섞는다
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.30 * s, 2.2 * s, 7),
        hard(fade(THREE, 0xA9814F, far, 0xBFE0FA)));
      trunk.position.y = 1.1 * s; trunk.castShadow = true; t.add(trunk);
      const leafC = fade(THREE, 0x6FAF62, far, 0xBFE0FA);
      for (const [dy, r, dx, dz] of [[2.6, 1.55, 0, 0], [3.5, 1.15, 0.5, 0.25], [3.3, 1.05, -0.55, -0.3]]) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r * s, 12, 9), hard(leafC));
        blob.position.set(dx * s, dy * s, dz * s); blob.castShadow = true; t.add(blob);
      }
      t.position.set(tx, 0, tz);
      t.userData.sway = Math.random() * Math.PI * 2;
      trees.add(t);
    }

    // ── 밭 ──
    // 4편(1차 산업)으로 가는 길목을 지금부터 깔아 둔다.
    // 이랑을 입체(높이 0.1)로 만들었더니 빛을 받아 흰 바코드처럼 보였다.
    // 멀리서 안개까지 먹으면 더 하얘진다. 그래서 이랑은 '납작한 색 띠'로만 둔다.
    const fields = new THREE.Group(); root.add(fields);
    for (const [fx, fz, w, d, hue, dark] of [
      [-38, -50, 28, 15, 0xA8BE72, 0x93AC63], [38, -54, 32, 15, 0x9DB878, 0x8AA668],
      [0, -62, 36, 13, 0xAEC07C, 0x99AE6C],
    ]) {
      const base = new THREE.Mesh(new THREE.PlaneGeometry(w, d), hard(fade(THREE, hue, 0.1, 0xBFE0FA)));
      base.rotation.x = -Math.PI / 2; base.position.set(fx, 0.02, fz); fields.add(base);
      const rows = Math.floor(d / 2.8);
      const rowGeo = new THREE.PlaneGeometry(w * 0.9, 1.1);
      const rowMat = hard(fade(THREE, dark, 0.1, 0xBFE0FA));
      const inst = new THREE.InstancedMesh(rowGeo, rowMat, rows);
      const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      const rp = new THREE.Vector3(), rs = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < rows; i++) {
        rp.set(fx, 0.035, fz - d / 2 + 1.5 + i * 2.8);
        m4.compose(rp, rq, rs); inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      fields.add(inst);
    }

    // ── 먼 언덕 ──
    // 납작한 반구를 늘여서. 안개가 짙게 먹는 자리에 둬야 '멀다'고 읽힌다.
    const hills = new THREE.Group(); root.add(hills);
    for (const [hx, hz, w, h, t] of [
      [-58, -78, 96, 10, 0.3], [26, -84, 120, 13, 0.34], [96, -76, 88, 9, 0.28],
      [-14, -94, 160, 16, 0.4], [-124, -88, 110, 11, 0.36], [130, -92, 116, 13, 0.38],
    ]) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        hard(fade(THREE, 0x7FA86A, t, 0xBFE0FA)));
      dome.scale.set(w / 2, h, w / 3.2);
      dome.position.set(hx, -0.5, hz);
      hills.add(dome);
    }

    // ── 앞마당 ──
    // 세로로 긴 화면에서는 마당이 위쪽에 몰리고 아래 40%가 텅 빈다.
    // (마당은 32×30 인데 24° 로 내려다보면 화면에서 납작해진다 — 세로 여백이 남는다)
    // 울타리 앞을 길과 덤불로 채워, 빈 풀밭 대신 '마당으로 들어오는 길'이 되게 한다.
    const front = new THREE.Group(); root.add(front);
    const pathMat = hard(0xC3B393);
    const pathShape = new THREE.Shape();
    pathShape.moveTo(-1.5, 0); pathShape.lineTo(1.5, 0); pathShape.lineTo(2.6, 26); pathShape.lineTo(-2.6, 26); pathShape.closePath();
    const path = new THREE.Mesh(new THREE.ShapeGeometry(pathShape), pathMat);
    path.rotation.x = -Math.PI / 2; path.rotation.z = Math.PI;      // 마당 쪽에서 카메라 쪽으로 넓어진다
    path.position.set(0, 0.014, z1 + 0.2);
    front.add(path);
    // 덤불 — 앞쪽 양옆 모서리를 잡아 준다 (사진에서 앞 모서리를 눌러 주는 역할)
    for (const [bx, bz, bs] of [[-13, 7, 1.25], [-9.5, 15, 1.0], [12.5, 6, 1.15], [9, 14, 1.35],
                                [-17, 19, 1.5], [16, 21, 1.4], [-21, 4, 1.1], [20, 3, 1.2]]) {
      const bush = new THREE.Group();
      for (const [dx, dy, dz, r] of [[0, 0, 0, 1.0], [0.85, -0.15, 0.2, 0.7], [-0.8, -0.2, -0.25, 0.65]]) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r * bs, 11, 8), hard(0x66A45C));
        blob.position.set(dx * bs, dy * bs + 0.75 * bs, dz * bs); blob.castShadow = true; bush.add(blob);
      }
      bush.position.set(bx, 0, bz);
      front.add(bush);
    }
    // 길가 들꽃 몇 송이
    const petalMat = hard(0xFFE07A), petal2 = hard(0xF6A8C0);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const fz = 3 + Math.random() * 20;
      const fxp = side * (3.2 + fz * 0.13 + Math.random() * 2.2);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), i % 3 ? petalMat : petal2);
      f.position.set(fxp, 0.16, fz); f.scale.y = 0.7; front.add(f);
    }

    // ── 안개 ── 먼 바닥이 하늘로 자연스럽게 사라지게
    scene.fog = new THREE.Fog(0xBFE0FA, 70, 330);

    // ── 밖에서 조절하는 것들 ──
    // 바닥재(잔디·흙·모래·클로버) — 울타리 '안'만 바꾼다.
    // 바깥 들판까지 같이 바꿨더니 흙마당을 고른 순간 온 세상이 흙이 됐다.
    function setGround(near, mid) {
      patchMat.color.set(near);
      patchEdge.material.color.set(mid);
    }
    // 날씨 — 안개 색이 곧 '하늘' 색이다. CSS 하늘과 같은 색을 줘야 경계가 안 보인다.
    function setSkyTone(hex) { scene.fog.color.set(hex); }
    // 안개 거리는 카메라가 얼마나 멀리 있느냐에 따라 달라져야 한다.
    // 확대하면 카메라가 가까워지므로(fit 참조), 고정값을 쓰면 확대할 때마다 지평선이 튄다.
    function setCamDist(D) { scene.fog.near = D * 0.95; scene.fog.far = D * 1.8; }
    let windy = 0;
    const setWind = (v) => { windy = v; };

    let t = 0;
    function tick(dt) {
      t += dt;
      // 나무는 바람 불 때만 눈에 띄게 흔들린다
      const amp = 0.012 + windy * 0.05;
      for (const tr of trees.children) tr.rotation.z = Math.sin(t * (0.6 + windy * 1.8) + tr.userData.sway) * amp;
    }

    return { root, parts: { ground, patch, fence, trees, fields, hills, front }, setGround, setSkyTone, setCamDist, setWind, tick };
  }

  S.build = build;
  g.TP_SCENERY = S;
})(typeof window !== 'undefined' ? window : module.exports);
