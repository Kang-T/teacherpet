// 티처펫 — 할머니의 작은 가게 (꾸미기)
//
// 규칙 두 가지를 지킨다.
//  1. 뽑기가 없다. 값이 정해져 있고, 사기 전에 무엇을 사는지 보인다.
//  2. 겉모습만 바꾼다. 모자를 씌워도 더 빨리 자라거나 덜 아프지 않는다.
//     그래야 '잘 돌봤는가'가 유일한 기준으로 남고, 돈을 더 쓴 아이가 유리해지지 않는다.
(function (g) {
  const TP = (g.TP = g.TP || {});

  // hat  — 닭 한 마리씩 씌운다 (bird.hat)
  // coop — 닭장 지붕 색 (farm.coopSkin)
  // deco — 마당에 놓는 장식물 (farm.decos[])
  // ground — 마당 바닥 (farm.ground)
  const ITEMS = [
    // 모자
    { id: 'straw', kind: 'hat', name: '밀짚모자', icon: '🧑‍🌾', price: 12, color: 0xE8C87A, brim: 1.25, crown: 0.72, top: 0.40 },
    { id: 'ribbon', kind: 'hat', name: '리본', icon: '🎀', price: 10, color: 0xF07F9A },
    { id: 'leaf', kind: 'hat', name: '낙엽관', icon: '🍂', price: 8, color: 0xD08A3C, brim: 1.05, crown: 0, top: 0 },
    { id: 'party', kind: 'hat', name: '고깔모자', icon: '🎉', price: 15, color: 0x6FB7E8, brim: 0.62, crown: 0.58, top: 1.05 },
    { id: 'flower', kind: 'hat', name: '꽃 한 송이', icon: '🌼', price: 9, color: 0xFFE07A },

    // 닭장 지붕
    { id: 'red', kind: 'coop', name: '빨간 지붕', icon: '🏠', price: 0, roof: 0xD9574F, ridge: 0xB84640 },
    { id: 'blue', kind: 'coop', name: '파란 지붕', icon: '🔵', price: 20, roof: 0x5E93D6, ridge: 0x3F6FAE },
    { id: 'green', kind: 'coop', name: '초록 지붕', icon: '🟢', price: 20, roof: 0x6FAF62, ridge: 0x4E8A46 },
    { id: 'straw2', kind: 'coop', name: '초가 지붕', icon: '🟡', price: 28, roof: 0xD9B268, ridge: 0xB8924C },

    // 마당 장식물 — 놓고 끌어서 자리를 정한다
    { id: 'flowerbed', kind: 'deco', name: '화단', icon: '🌻', price: 14 },
    { id: 'scarecrow', kind: 'deco', name: '허수아비', icon: '🧣', price: 22 },
    { id: 'swing', kind: 'deco', name: '그네', icon: '🪵', price: 26 },
    { id: 'fence', kind: 'deco', name: '울타리', icon: '🚧', price: 10 },
    { id: 'pond', kind: 'deco', name: '작은 웅덩이', icon: '💧', price: 18 },

    // 바닥 (tuft = 마당에 심는 풀포기 색. null 이면 풀을 뽑는다)
    { id: 'grass', kind: 'ground', name: '잔디', icon: '🌱', price: 0, near: '#7BBE5B', mid: '#8FCB6B', far: '#B7DE93', tuft: '#9BDA6E' },
    { id: 'dirt', kind: 'ground', name: '흙마당', icon: '🟤', price: 16, near: '#B99164', mid: '#C9A377', far: '#DCC19B', tuft: null },
    { id: 'sand', kind: 'ground', name: '모래마당', icon: '🏖️', price: 16, near: '#D9C58C', mid: '#E4D3A2', far: '#EFE3C2', tuft: null },
    { id: 'clover', kind: 'ground', name: '클로버밭', icon: '🍀', price: 24, near: '#5FA85A', mid: '#74B968', far: '#9BD189', tuft: '#7FCB63' },
  ];

  const byId = {};
  for (const it of ITEMS) byId[it.kind + ':' + it.id] = it;

  const get = (kind, id) => byId[kind + ':' + id] || null;
  const of = (kind) => ITEMS.filter((it) => it.kind === kind);
  // 값이 0 인 것은 처음부터 가지고 있다 (빨간 지붕·잔디)
  const free = (kind, id) => { const it = get(kind, id); return !!it && it.price === 0; };

  TP.shop = { ITEMS, get, of, free };
})(typeof window !== 'undefined' ? window : module.exports);
