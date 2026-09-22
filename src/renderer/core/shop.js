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
  // 값은 고르게 — 그날 번 코인(용돈 3~6, 도감·퀴즈 몇 개)으로 살 것이 늘 하나는 있고,
  // 몇 주를 모아야 사는 큰 목표도 몇 개 둔다. (아이들이 "꾸미기가 너무 적어요" 했다 — 18개였다)
  // style: 모자 모양 틀. 같은 틀에 색만 바꿔 여러 개를 만든다 (chick3d.js setHat).
  // season: 그 철에만 판다. 한 번 산 것은 언제든 쓴다. (SEASONS 참고)
  const ITEMS = [
    // ── 모자 ──
    { id: 'flower2', kind: 'hat', name: '분홍 꽃', icon: '🌸', price: 4, style: 'flower', color: 0xF4A6C0, core: 0xFFE07A },
    { id: 'ribbon2', kind: 'hat', name: '파란 리본', icon: '🎗️', price: 5, style: 'ribbon', color: 0x6FA8E8 },
    { id: 'leaf', kind: 'hat', name: '낙엽관', icon: '🍂', price: 8, color: 0xD08A3C, brim: 1.05, crown: 0, top: 0 },
    { id: 'flower', kind: 'hat', name: '꽃 한 송이', icon: '🌼', price: 9, style: 'flower', color: 0xFFE07A },
    { id: 'ribbon', kind: 'hat', name: '리본', icon: '🎀', price: 10, style: 'ribbon', color: 0xF07F9A },
    { id: 'straw', kind: 'hat', name: '밀짚모자', icon: '👒', price: 12, color: 0xE8C87A, brim: 1.25, crown: 0.72, top: 0.40, band: 0xD9574F },
    { id: 'party', kind: 'hat', name: '고깔모자', icon: '🎉', price: 15, style: 'cone', color: 0x6FB7E8, crown: 0.58, top: 1.05, ball: 0xFFE07A },
    { id: 'beanie', kind: 'hat', name: '털모자', icon: '🧶', price: 16, style: 'beanie', color: 0x8FC7A0, pom: 0xFFF5E6 },
    { id: 'cap', kind: 'hat', name: '야구모자', icon: '🧢', price: 18, style: 'cap', color: 0xD9574F },
    { id: 'beret', kind: 'hat', name: '베레모', icon: '🎨', price: 20, style: 'beret', color: 0x3F5E8C },
    { id: 'tophat', kind: 'hat', name: '신사 모자', icon: '🎩', price: 35, style: 'brim', color: 0x2E2A28, brim: 0.95, crown: 0.55, top: 0.9, band: 0xC0392B },
    { id: 'halo', kind: 'hat', name: '천사 고리', icon: '😇', price: 45, style: 'halo', color: 0xFFE07A },
    { id: 'crown', kind: 'hat', name: '왕관', icon: '👑', price: 60, style: 'crown', color: 0xF2C14E, gem: 0xD9574F },
    // 계절
    { id: 'gat', kind: 'hat', name: '갓', icon: '🎎', price: 20, style: 'gat', color: 0x2A2622, season: 'chuseok' },
    { id: 'pumpkin', kind: 'hat', name: '호박 모자', icon: '🎃', price: 12, style: 'pumpkin', color: 0xF0892E, season: 'halloween' },
    { id: 'witch', kind: 'hat', name: '마녀 모자', icon: '🧙', price: 18, style: 'witch', color: 0x5B3F8C, band: 0xF0892E, season: 'halloween' },
    { id: 'santa', kind: 'hat', name: '산타 모자', icon: '🎅', price: 15, style: 'santa', color: 0xD9322E, season: 'christmas' },
    { id: 'bokgeon', kind: 'hat', name: '색동 복건', icon: '🧧', price: 18, style: 'bokgeon', color: 0x2E3A5C, season: 'seollal' },

    // ── 닭장 지붕 ──
    { id: 'red', kind: 'coop', name: '빨간 지붕', icon: '🏠', price: 0, roof: 0xD9574F, ridge: 0xB84640 },
    { id: 'yellow', kind: 'coop', name: '노란 지붕', icon: '🟨', price: 8, roof: 0xF2C14E, ridge: 0xD4A233 },
    { id: 'pink', kind: 'coop', name: '분홍 지붕', icon: '🩷', price: 12, roof: 0xF09AB4, ridge: 0xD27A96 },
    { id: 'blue', kind: 'coop', name: '파란 지붕', icon: '🔵', price: 20, roof: 0x5E93D6, ridge: 0x3F6FAE },
    { id: 'green', kind: 'coop', name: '초록 지붕', icon: '🟢', price: 20, roof: 0x6FAF62, ridge: 0x4E8A46 },
    { id: 'purple', kind: 'coop', name: '보라 지붕', icon: '🟣', price: 24, roof: 0x9B7BC8, ridge: 0x7A5BA8 },
    { id: 'straw2', kind: 'coop', name: '초가 지붕', icon: '🌾', price: 28, roof: 0xD9B268, ridge: 0xB8924C },
    { id: 'giwa', kind: 'coop', name: '기와 지붕', icon: '🏯', price: 45, roof: 0x5A6573, ridge: 0x3E4752 },

    // ── 마당 장식물 — 놓고 끌어서 자리를 정한다 ──
    { id: 'rock', kind: 'deco', name: '둥근 바위', icon: '🪨', price: 3 },
    { id: 'sunflower', kind: 'deco', name: '해바라기', icon: '🌻', price: 5 },
    { id: 'mushroom', kind: 'deco', name: '빨간 버섯', icon: '🍄', price: 6 },
    { id: 'pot', kind: 'deco', name: '꽃 화분', icon: '🪴', price: 7 },
    { id: 'haybale', kind: 'deco', name: '짚단', icon: '🌾', price: 8 },
    { id: 'fence', kind: 'deco', name: '울타리', icon: '🚧', price: 10 },
    { id: 'stones', kind: 'deco', name: '징검돌', icon: '⚪', price: 12 },
    { id: 'flowerbed', kind: 'deco', name: '화단', icon: '💐', price: 14 },
    { id: 'mailbox', kind: 'deco', name: '우체통', icon: '📮', price: 16 },
    { id: 'bench', kind: 'deco', name: '나무 벤치', icon: '🪑', price: 18 },
    { id: 'pond', kind: 'deco', name: '작은 웅덩이', icon: '💧', price: 18 },
    { id: 'birdhouse', kind: 'deco', name: '새집', icon: '🐦', price: 20 },
    { id: 'scarecrow', kind: 'deco', name: '허수아비', icon: '🧣', price: 22 },
    { id: 'tree', kind: 'deco', name: '사과나무', icon: '🍎', price: 25 },
    { id: 'swing', kind: 'deco', name: '그네', icon: '🪵', price: 26 },
    { id: 'parasol', kind: 'deco', name: '파라솔', icon: '⛱️', price: 28 },
    { id: 'lamppost', kind: 'deco', name: '가로등', icon: '💡', price: 30 },
    { id: 'windmill', kind: 'deco', name: '풍차', icon: '🌬️', price: 45 },
    { id: 'well', kind: 'deco', name: '우물', icon: '🪣', price: 60 },
    { id: 'statue', kind: 'deco', name: '황금 닭 동상', icon: '🏆', price: 100 },
    // 계절
    { id: 'moonlantern', kind: 'deco', name: '보름달 등불', icon: '🌕', price: 15, season: 'chuseok' },
    { id: 'jackolantern', kind: 'deco', name: '호박 등불', icon: '🎃', price: 12, season: 'halloween' },
    { id: 'xmastree', kind: 'deco', name: '크리스마스 나무', icon: '🎄', price: 30, season: 'christmas' },
    { id: 'snowman', kind: 'deco', name: '눈사람', icon: '⛄', price: 20, season: 'christmas' },
    { id: 'kite', kind: 'deco', name: '방패연', icon: '🪁', price: 14, season: 'seollal' },

    // ── 바닥 (tuft = 마당에 심는 풀포기 색. null 이면 풀을 뽑는다) ──
    { id: 'grass', kind: 'ground', name: '잔디', icon: '🌱', price: 0, near: '#7BBE5B', mid: '#8FCB6B', far: '#B7DE93', tuft: '#9BDA6E' },
    { id: 'dirt', kind: 'ground', name: '흙마당', icon: '🟤', price: 6, near: '#B99164', mid: '#C9A377', far: '#DCC19B', tuft: null },
    { id: 'sand', kind: 'ground', name: '모래마당', icon: '🏖️', price: 16, near: '#D9C58C', mid: '#E4D3A2', far: '#EFE3C2', tuft: null },
    { id: 'autumn', kind: 'ground', name: '단풍 마당', icon: '🍁', price: 20, near: '#B5A05A', mid: '#C4AE68', far: '#D8C590', tuft: '#E0843A' },
    { id: 'pebble', kind: 'ground', name: '자갈 마당', icon: '🪨', price: 22, near: '#B6AFA2', mid: '#C4BEB2', far: '#D6D1C6', tuft: null },
    { id: 'clover', kind: 'ground', name: '클로버밭', icon: '🍀', price: 24, near: '#5FA85A', mid: '#74B968', far: '#9BD189', tuft: '#7FCB63' },
    { id: 'flowerfield', kind: 'ground', name: '꽃밭', icon: '🌷', price: 35, near: '#79B85A', mid: '#8CC76A', far: '#B4DB92', tuft: '#F4A6C0' },
    { id: 'snow', kind: 'ground', name: '눈 마당', icon: '❄️', price: 15, near: '#EEF2F6', mid: '#E6ECF2', far: '#F5F8FA', tuft: null, season: 'christmas' },
  ];

  // 철마다 파는 것 — 날짜만 본다 (서버 없음). 추석·설날은 해마다 날짜가 바뀌어 넉넉히 잡았다.
  const SEASONS = {
    chuseok: { name: '추석', icon: '🌕', from: '09-01', to: '10-15' },
    halloween: { name: '핼러윈', icon: '🎃', from: '10-16', to: '11-07' },
    christmas: { name: '크리스마스', icon: '🎄', from: '12-01', to: '12-31' },
    seollal: { name: '설날', icon: '🧧', from: '01-10', to: '02-28' },
  };
  function inSeason(it, day) {
    if (!it || !it.season) return true;
    const S = SEASONS[it.season]; if (!S) return false;
    const md = String(day || '').slice(5, 10);
    return md >= S.from && md <= S.to;
  }

  const byId = {};
  for (const it of ITEMS) byId[it.kind + ':' + it.id] = it;

  const get = (kind, id) => byId[kind + ':' + id] || null;
  const of = (kind) => ITEMS.filter((it) => it.kind === kind);
  // 값이 0 인 것은 처음부터 가지고 있다 (빨간 지붕·잔디)
  const free = (kind, id) => { const it = get(kind, id); return !!it && it.price === 0; };

  TP.shop = { ITEMS, get, of, free, SEASONS, inSeason };
})(typeof window !== 'undefined' ? window : module.exports);
