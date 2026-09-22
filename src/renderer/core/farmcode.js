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
  function dexBits(state) {
    const L = (TP.dex && TP.dex.LIST) || [];
    let n = 0;
    L.forEach((e, i) => { if (state.dex && state.dex[e.id]) n += 2 ** i; });
    return n;
  }
  function dexFrom(n) {
    const L = (TP.dex && TP.dex.LIST) || [];
    n = Math.max(0, Math.floor(Number(n) || 0));
    return L.filter((e, i) => Math.floor(n / 2 ** i) % 2 === 1).map((e) => e.id);
  }
  function make(state) {
    const flock = (state.flock || []).filter((d) => d.stage !== 'egg');
    if (!flock.length) return null;
    const body = {
      v: VER,
      c: Math.round(state.coins || 0),
      // 행동 도감 — 찾은 칸을 비트로 (학교 크롬북에서 모은 도감이 집에서 사라지지 않게). 없으면 옛 코드와 같다.
      ...(dexBits(state) ? { x: dexBits(state) } : {}),
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
    return { coins: Math.max(0, body.c | 0), birds, dex: dexFrom(body.x) };
  }

  // ── 놀러 가기 코드 (짧은 코드) ──
  // 닭 한 마리를 친구 마당에 놀러 보낼 때 쓴다. 교실에서 말로 불러 줄 수 있게 '이름-네 글자'.
  //   앞 두 글자: 단계(2비트)·성별(1비트)·성격(5비트)   뒤 두 글자: 오타 확인
  // 헷갈리는 글자(0·O·1·I)는 쓰지 않고, 대소문자는 가리지 않는다. 기기 옮기기는 긴 농장 코드가 맡는다.
  const B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const VSTAGES = ['chick', 'young', 'hen', 'rooster'];
  function chk10(str) {                   // 10비트 확인값
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) & 1023;
  }
  const two = (n) => B32[(n >> 5) & 31] + B32[n & 31];
  function short(d) {
    if (!d || !d.name) return null;
    const st = VSTAGES.indexOf(d.stage);
    if (st < 0) return null;             // 알은 놀러 갈 수 없다
    const ti = Math.max(0, Math.min(31, traits().indexOf(d.trait)));
    const payload = (st << 6) | ((d.sex === 'f' ? 0 : 1) << 5) | ti;
    const name = String(d.name).replace(/\s+/g, '').slice(0, 12);
    return name + '-' + two(payload) + two(chk10(name.toUpperCase() + '|' + payload));
  }
  function readShort(code) {
    const m = String(code || '').trim().replace(/\s+/g, '').toUpperCase().match(/^(.+)-([0-9A-Z]{4})$/);
    if (!m) return null;
    const raw = String(code).trim().replace(/\s+/g, '');
    const name = raw.slice(0, raw.lastIndexOf('-'));
    const t = m[2].split('').map((c) => B32.indexOf(c));
    if (t.some((x) => x < 0)) return null;
    const payload = (t[0] << 5) | t[1], check = (t[2] << 5) | t[3];
    if (payload > 255 || chk10(name.toUpperCase() + '|' + payload) !== check) return null;   // 이름의 대소문자도 가리지 않는다
    const stage = VSTAGES[payload >> 6], sex = (payload >> 5) & 1 ? 'm' : 'f', trait = traits()[payload & 31] || traits()[0] || '느긋이';
    return { name: name.slice(0, 12), stage, sex, trait };
  }

  TP.farmcode = { make, read, short, readShort, VER };
})(typeof window !== 'undefined' ? window : module.exports);
