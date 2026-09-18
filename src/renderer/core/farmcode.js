// 농장 코드 — 닭들만 짧은 글자로 담아 다른 기기로 데려간다.
// 전체 저장 데이터(사진·장부 포함)는 수십 KB라 손으로 옮길 수 없다. 그건 '파일로 저장'이 맡는다.
// 여기서는 '누가 얼마나 자랐는지'만 담는다. 사진과 일지는 따라가지 않는다 — 그건 솔직히 밝혀야 한다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config;
  const traits = () => (TP.mind && TP.mind.NAMES) || [];   // sim/mind.js 는 이 파일보다 늦게 실행된다

  const VER = 1;
  const STAGES = ['egg', 'chick', 'young', 'hen', 'rooster'];

  // 사람이 옮겨 적을 수 있게 base64url 로 (+/= 는 헷갈린다)
  function toB64(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function sum(s) {                       // 한 글자만 틀려도 알아채도록
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36).toUpperCase().slice(-3);
  }

  // 돌본 날 수만 담고, 되살릴 때 그만큼의 날짜를 만들어 준다
  function caredCount(d) {
    return Object.keys(d.care || {}).filter((day) => day >= (d.stageSince || '') && TP.state.isCared(d, day)).length;
  }
  function make(state) {
    const flock = (state.flock || []).filter((d) => d.stage !== 'egg');
    if (!flock.length) return null;
    const body = {
      v: VER,
      c: Math.round(state.coins || 0),
      b: flock.map((d) => [
        d.name || '',
        Math.max(0, STAGES.indexOf(d.stage)),
        d.sex === 'f' ? 0 : 1,
        Math.max(0, traits().indexOf(d.trait)),
        caredCount(d),
        Math.round(d.eggsLaid || 0),
      ]),
    };
    const core = toB64(JSON.stringify(body));
    return '농장-' + core + '-' + sum(core);
  }

  function read(code) {
    const s = String(code || '').trim().replace(/\s+/g, '');
    const m = s.match(/^농장-([A-Za-z0-9_-]+)-([A-Z0-9]{3})$/);
    if (!m) return { error: '농장 코드가 아닌 것 같아요. "농장-" 으로 시작하는지 확인해 주세요.' };
    if (sum(m[1]) !== m[2]) return { error: '코드가 조금 달라요. 한 글자씩 다시 확인해 볼까요?' };
    let body;
    try { body = JSON.parse(fromB64(m[1])); } catch (e) { return { error: '코드를 읽지 못했어요.' }; }
    if (!body || body.v !== VER || !Array.isArray(body.b)) return { error: '이 코드는 다른 버전이에요.' };
    const today = U.today();
    const birds = body.b.slice(0, C.RULE.maxFlock).map((r) => {
      const stage = STAGES[r[1]] || 'chick';
      const care = {};
      for (let i = 0; i < Math.min(r[4] | 0, 400); i++) {      // 돌본 날을 그만큼 만들어 준다
        care[U.addDays(today, -(i + 1))] = { ate: true, drank: true, brooded: true };
      }
      return {
        name: String(r[0] || '').slice(0, 12), stage,
        sex: r[2] === 0 ? 'f' : 'm',
        trait: traits()[r[3]] || traits()[0] || '느긋이',
        care, eggsLaid: Math.max(0, r[5] | 0),
        stageSince: U.addDays(today, -Math.min(r[4] | 0, 400) - 1),
      };
    });
    return { coins: Math.max(0, body.c | 0), birds };
  }

  TP.farmcode = { make, read, VER };
})(typeof window !== 'undefined' ? window : module.exports);
