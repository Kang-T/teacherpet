// 티처펫 — 제네릭 행위자 목록.
// 닭이 아닌 것(벌레·배설물·청소 로봇…)은 전부 여기에 등록한다.
// entity 규약: { id, kind, update(dt) -> false면 제거, dispose(), pick(x,y) -> bool(선택), pos() -> {x,z} }
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util;
  const items = new Map();

  const entities = {
    add(e) {
      if (!e.id) e.id = U.uid('e');
      items.set(e.id, e);
      TP.bus.emit('entity:add', e);
      return e;
    },
    remove(id) {
      const e = typeof id === 'string' ? items.get(id) : id;
      if (!e) return false;
      try { e.dispose && e.dispose(); } catch (err) { console.error('dispose', err); }
      items.delete(e.id);
      TP.bus.emit('entity:remove', e);
      return true;
    },
    get: (id) => items.get(id) || null,
    byKind: (kind) => Array.from(items.values()).filter((e) => e.kind === kind),
    count: (kind) => (kind ? entities.byKind(kind).length : items.size),
    all: () => Array.from(items.values()),
    nearest(kind, x, z) {
      let best = null, bd = Infinity;
      for (const e of entities.byKind(kind)) {
        if (!e.pos) continue;
        const p = e.pos(), d = Math.hypot(p.x - x, p.z - z);   // 앞뒤에 가중치를 주던 것은 마당이 얕던 시절 보정이다
        if (d < bd) { bd = d; best = e; }
      }
      return best ? { entity: best, dist: bd } : null;
    },
    tickAll(dt) {
      for (const e of Array.from(items.values())) {
        if (!e.update) continue;
        let alive = true;
        try { alive = e.update(dt) !== false; } catch (err) { console.error('entity update', e.kind, err); }
        if (!alive) entities.remove(e);
      }
    },
    clear() { for (const e of Array.from(items.values())) entities.remove(e); },
  };
  TP.entities = entities;
})(typeof window !== 'undefined' ? window : module.exports);
