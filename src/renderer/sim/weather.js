// 티처펫 — 오늘의 날씨
//
// 날씨는 '오늘 날짜 + 우리 반' 두 글자만으로 정해진다. 서버도, 통신도, 저장도 없다.
// 같은 날 같은 반이면 누구 기기에서든 똑같은 날씨가 나온다 (Wordle 이 쓰는 방법).
// 그래서 "야, 오늘 비 와서 우리 닭 다 처마 밑에 있어" "우리도!" 가 성립한다 — 서버 코드 0줄로.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util;

  function hash(s) {                       // FNV-1a. 짧고, 한 글자만 바뀌어도 값이 확 달라진다
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  // room = 마당 기본 온도를 몇 도 올리고 내리는가 (보온등 계산에 그대로 들어간다)
  // dust/outdoor/indoor/thirst = 닭의 하루를 얼마나 바꾸는가
  const KINDS = {
    clear:  { name: '맑음', icon: '☀️', w: 32, room: 0, dust: 1.35, outdoor: 1, indoor: 0, thirst: 1,
      sky: ['#8FC7F5', '#BFE0FA', '#DFF0FB'], clouds: 6, dim: 0,
      say: '오늘은 볕이 좋구나. 닭들이 모래 목욕을 하겠어.' },
    cloudy: { name: '흐림', icon: '☁️', w: 24, room: -1, dust: 0.8, outdoor: 0.95, indoor: 0.1, thirst: 1,
      sky: ['#A3B3C2', '#C4D0DA', '#DCE4EA'], clouds: 14, dim: 0.1,
      say: '하늘이 낮구나. 비가 올지도 모르겠다.' },
    rain:   { name: '비', icon: '🌧️', w: 15, room: -3, dust: 0, outdoor: 0.35, indoor: 1, thirst: 0.8,
      sky: ['#788795', '#94A3B0', '#B2BEC8'], clouds: 18, dim: 0.22,
      say: '오늘은 비가 오는구나. 닭들이 젖으면 안 된단다.' },
    wind:   { name: '바람', icon: '💨', w: 11, room: -2, dust: 0.6, outdoor: 0.8, indoor: 0.35, thirst: 1,
      sky: ['#8FBEE4', '#B6D2E8', '#D8E8F2'], clouds: 10, dim: 0.06,
      say: '바람이 제법 부는구나. 닭들이 깃털을 세울 게다.' },
    hot:    { name: '무더위', icon: '🔥', w: 9, room: 6, dust: 1.1, outdoor: 0.6, indoor: 0.25, thirst: 1.9,
      sky: ['#79B9EF', '#BFE2F7', '#F3EBCE'], clouds: 3, dim: 0,
      say: '오늘은 몹시 덥구나. 물통을 자주 보아라.' },
    cold:   { name: '추위', icon: '❄️', w: 9, room: -5, dust: 0.5, outdoor: 0.6, indoor: 0.5, thirst: 0.7,
      sky: ['#9FC4E8', '#CBDEF0', '#E8F0F8'], clouds: 9, dim: 0.04,
      say: '오늘은 춥구나. 병아리가 보온등을 찾을 게다.' },
  };
  const ORDER = ['clear', 'cloudy', 'rain', 'wind', 'hot', 'cold'];
  const TOTAL = ORDER.reduce((s, k) => s + KINDS[k].w, 0);

  function raw(day, klass) {
    let r = hash((klass || '') + '|' + day) % TOTAL;
    for (const k of ORDER) { r -= KINDS[k].w; if (r < 0) return k; }
    return 'clear';
  }
  // 사흘 내리 같은 날씨면 다음 것으로 민다.
  // 날짜만 보고 계산하므로 여전히 저장이 필요 없다 — 어제도 그제도 그 자리에서 다시 구한다.
  function keyOf(day, klass) {
    const k = raw(day, klass);
    const y = U.addDays(day, -1), y2 = U.addDays(day, -2);
    if (raw(y, klass) === k && raw(y2, klass) === k) return ORDER[(ORDER.indexOf(k) + 1) % ORDER.length];
    return k;
  }
  function of(day, klass) {
    const key = keyOf(day || U.today(), klass);
    return Object.assign({ key }, KINDS[key]);
  }

  // 학급 코드에서 '숫자만' 남긴다.
  // 아이가 쓰는 칸이라 이름을 적어 넣을 수 있다. 기기 안에만 있고 어디로도 보내지 않지만,
  // 애초에 들어갈 수 없게 막는 편이 맞다. '5학년 3반' 도 '5-3' 도 '53' 도 모두 5-3 이 된다.
  function cleanClass(s) {
    const nums = String(s || '').match(/\d+/g);
    if (!nums) return '';
    return nums.slice(0, 2).map((n) => n.slice(0, 2)).join('-');
  }

  TP.weather = { of, KINDS, ORDER, cleanClass, hash };
})(typeof window !== 'undefined' ? window : module.exports);
