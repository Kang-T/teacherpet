// 티처펫 — 저장 상태와 마이그레이션.
// ⚠️ 스키마를 바꿀 때는 반드시 MIGRATIONS에 한 단계를 추가한다. 버전을 올리기만 하면 사용자의 닭이 사라진다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config;
  const VERSION = 4;

  function defaultState() {
    return {
      version: VERSION,
      flock: [], basket: 0, coins: 0, album: [],
      feed: 60, water: 60, lastFeedRefill: 0, lastWaterRefill: 0,
      worms: 3, lastWormGift: '',
      bedding: 100,                     // 깔짚 신선도 0~100
      poops: [],                        // { id, x, z, cecal, born }
      ammonia: 0,                       // ppm
      inventory: { grit: 0 },
      feedType: 'starter',            // 모이통에 넣은 사료 종류
      equipment: { lamp: null, vacuum: false, autofeeder: false },
      lampPower: 1,                     // 보온등 출력 0~1 (1주차 35℃로 시작해 자라면 낮춘다)
      freezes: C.RULE.careFreezePerTerm,
      settings: {
        size: 4, sound: true, classMin: 40, breakMin: 10, autoBreak: true,
        homeSide: 'left', lifeEnd: 'retire', pauseWeekends: true, quiet: false,
        propPos: {}, propHidden: {},
      },
      names: '', pickUsed: [], todos: [], lastCrow: '', lastSeen: U.now(),
    };
  }

  function ensureBird(d) {
    if (d.energy === undefined) d.energy = 80;
    if (d.boredom === undefined) d.boredom = 20;
    if (d.social === undefined) d.social = 20;
    if (d.stress === undefined) d.stress = 0;
    if (d.aff === undefined) d.aff = 50;
    if (d.momId === undefined) d.momId = null;
    if (d.care === undefined) d.care = {};        // { 날짜: {ate, drank, brooded} }  ← 저장된다
    if (d.health === undefined) d.health = 100;
    if (d.clean === undefined) d.clean = 85;
    if (d.hurt === undefined) d.hurt = null;
    if (d.lastDust === undefined) d.lastDust = '';
    if (d.sick === undefined) d.sick = null;
    if (d.children === undefined) d.children = 0;
    if (d.z === undefined) d.z = U.rand(-1.4, 1.4);
    delete d.exp;                                  // v3에서 NaN이 새던 필드
    delete d.fertile;                              // 읽는 곳이 없었다
    return d;
  }

  // --- 마이그레이션 체인 ---
  const MIGRATIONS = {
    // v3 → v4 : 돌본 기록을 저장 데이터로, 위생·장비·학사일정 필드 추가
    3(s) {
      s.flock = (s.flock || []).map((d) => {
        const care = {};
        for (const day of d.careDays || []) care[day] = { ate: true, drank: true, brooded: true };
        d.care = care;
        return d;
      });
      s.bedding = 100; s.poops = []; s.ammonia = 0;
      s.inventory = { grit: 0 }; s.feedType = 'starter';
      s.equipment = { lamp: null, vacuum: false, autofeeder: false };
      s.lampPower = 1;
      s.freezes = C.RULE.careFreezePerTerm;
      s.settings = Object.assign({ pauseWeekends: true, quiet: false, propPos: {}, propHidden: {} }, s.settings || {});
      delete s.lastAttend;                         // 쓰기만 하고 읽지 않던 필드
      s.version = 4;
      return s;
    },
  };

  function migrate(saved) {
    if (!saved || typeof saved !== 'object') return null;
    let s = saved, guard = 0;
    while (s.version < VERSION && guard++ < 20) {
      const step = MIGRATIONS[s.version];
      if (!step) { console.warn('마이그레이션 경로 없음: v' + s.version + ' → v' + VERSION); return null; }
      s = step(s);
    }
    if (s.version > VERSION) { console.warn('저장 데이터가 이 앱보다 새 버전입니다 (v' + s.version + ')'); return null; }
    const base = defaultState();
    const out = Object.assign(base, s);
    out.settings = Object.assign(base.settings, s.settings || {});
    out.inventory = Object.assign(base.inventory, s.inventory || {});
    out.equipment = Object.assign(base.equipment, s.equipment || {});
    out.flock = (out.flock || []).map(ensureBird);
    out.version = VERSION;
    return out;
  }

  // --- 돌본 날 계산 (저장 데이터 기준) ---
  function markCare(d, what, day) {
    day = day || U.today();
    d.care = d.care || {};
    d.care[day] = Object.assign({}, d.care[day], { [what]: true });
  }
  function isCared(d, day) {
    const c = (d.care || {})[day || U.today()];
    if (!c) return false;
    return d.stage === 'egg' ? !!c.brooded : !!(c.ate && c.drank);
  }
  // 현재 단계에 들어온 뒤로 돌본 날이 며칠인가
  function daysCared(d) {
    return Object.keys(d.care || {}).filter((day) => day >= (d.stageSince || '') && isCared(d, day)).length;
  }
  function caredToday(d) { return isCared(d, U.today()); }

  TP.state = { VERSION, defaultState, ensureBird, migrate, markCare, isCared, daysCared, caredToday };
})(typeof window !== 'undefined' ? window : module.exports);
