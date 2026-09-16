// 티처펫 — 위생: 배설물 · 암모니아 · 깔짚
// 실제 수치: 닭 1마리 하루 12~16회 배설(100~150g), 암모니아 15ppm에서 사람이 냄새를 느끼고
// 25ppm부터 성장·산란·호흡기에 손상이 온다. 젖은 깔짚에서는 콕시듐 난포낭이 수개월 산다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config, ENT = TP.entities;

  let world = null, bounds = null;

  function init(w, getBounds) { world = w; bounds = getBounds; }

  // 배설물 하나 = 엔티티 하나
  function dropPoop(x, z, cecal, savedId, born) {
    const mesh = world.makePoop(cecal, cecal ? 1.15 : 1);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    const e = {
      id: savedId || U.uid('p'), kind: 'poop', x, z, cecal: !!cecal, born: born || U.now(),
      pos: () => ({ x: e.x, z: e.z }),
      mesh,
      update() { return true; },
      dispose() { world.removePickable(mesh); world.scene.remove(mesh); },
    };
    world.addPickable(mesh, { type: 'poop', id: e.id });
    return ENT.add(e);
  }

  function poops() { return ENT.byKind('poop'); }
  function count() { return ENT.count('poop'); }

  // 저장/복원
  function serialize() { return poops().map((p) => ({ id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), cecal: p.cecal, born: p.born })); }
  function restore(list) {
    for (const p of poops()) ENT.remove(p);
    for (const d of list || []) dropPoop(d.x, d.z, d.cecal, d.id, d.born);
  }

  // 닭이 배설한다. 하루 2~3개(실제 12~16회를 압축), 그중 12%가 맹장 똥.
  function maybePoop(bird, dt, now) {
    if (bird.d.stage === 'egg' || bird.inCoop) return null;
    const perDay = C.HYGIENE.poopPerBirdPerDay;
    const chance = dt * perDay / (10 * 3600);          // 깨어 있는 10시간 기준
    if (Math.random() > chance) return null;
    const cecal = Math.random() < C.HYGIENE.cecalRatio;
    const b = bounds ? bounds() : { min: -20, max: 20 };
    const x = Math.max(b.min, Math.min(b.max, bird.x - bird.dir * 0.4));
    return dropPoop(x, bird.z, cecal);
  }

  // 암모니아: 배설물 개수 × 머문 시간. 깔짚이 신선하면 덜 오른다.
  function tickAmmonia(state, dt) {
    const n = count();
    const beddingFactor = 0.4 + (1 - (state.bedding ?? 100) / 100) * 1.1;
    const vacuum = state.equipment && state.equipment.vacuum ? (1 - C.RULE.automationEffect) : 1;
    const rise = n * C.HYGIENE.ppmPerPoopHour * beddingFactor * vacuum * (dt / 3600);
    const fall = C.HYGIENE.ventPerHour * (dt / 3600);   // 환기로 자연 감소
    state.ammonia = Math.max(0, Math.min(60, (state.ammonia || 0) + rise - fall));
    state.bedding = Math.max(0, (state.bedding ?? 100) - dt * (100 / (C.HYGIENE.beddingDays * 24 * 3600)) * (1 + n * 0.08));
    return state.ammonia;
  }

  const level = (ppm) => (ppm >= C.HYGIENE.penaltyPpm ? 'bad' : ppm >= C.HYGIENE.smellPpm ? 'smell' : 'ok');
  const LABEL = { ok: '깨끗해요', smell: '냄새가 나요 — 치워 주세요', bad: '암모니아가 심해요! 성장·산란이 멈춰요' };

  // 로봇 청소기가 있으면 스스로 조금씩 치운다 (효과 50% — 사람의 청소를 대신하지 못한다)
  function vacuumTick(state, dt) {
    if (!state.equipment || !state.equipment.vacuum) return 0;
    const list = poops();
    if (!list.length) return 0;
    if (Math.random() > dt / 26) return 0;              // 약 26초에 하나
    ENT.remove(list[0]);
    return 1;
  }

  TP.hygiene = { init, dropPoop, poops, count, serialize, restore, maybePoop, tickAmmonia, level, LABEL, vacuumTick };
})(typeof window !== 'undefined' ? window : module.exports);
