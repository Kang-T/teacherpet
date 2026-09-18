// 티처펫 — 저장 상태와 마이그레이션.
// ⚠️ 스키마를 바꿀 때는 반드시 MIGRATIONS에 한 단계를 추가한다. 버전을 올리기만 하면 사용자의 닭이 사라진다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config;
  const VERSION = 6;

  function defaultState() {
    return {
      version: VERSION,
      flock: [], basket: 0, coins: 0, album: [], away: [],   // away = 떠났지만 돌아올 수 있는 닭
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
        size: 4, sound: true,
        homeSide: 'left', lifeEnd: 'retire', useCalendar: true, pauseWeekends: true, quiet: false,   // 주말에는 쉰다 — 기본값
        holidays: [], vacation: null, paused: false,
        propPos: {}, propHidden: {},
      },
      chapter: 0, onboarded: false, borrowed: null,   // borrowed = 친구에게 빌린 수탉(씨알 코드)
      lastCrow: '', lastSeen: U.now(), openedDays: [],
    };
  }

  function ensureBird(d) {
    if (d.energy === undefined) d.energy = 80;
    if (d.boredom === undefined) d.boredom = 20;
    if (d.social === undefined) d.social = 20;
    if (d.stress === undefined) d.stress = 0;
    if (d.aff === undefined) d.aff = 50;
    if (d.momId === undefined) d.momId = null;
    // 성별은 태어날 때 정해진다. 다만 이미 어른이면 단계가 곧 성별이라 그쪽을 따른다.
    if (d.stage === 'hen') d.sex = 'f';
    else if (d.stage === 'rooster') d.sex = 'm';
    else if (!d.sex) d.sex = Math.random() < 0.5 ? 'f' : 'm';
    if (d.care === undefined) d.care = {};        // { 날짜: {ate, drank, brooded} }  ← 저장된다
    if (d.health === undefined) d.health = 100;
    if (d.clean === undefined) d.clean = 85;
    if (d.hurt === undefined) d.hurt = null;
    if (d.lastDust === undefined) d.lastDust = '';
    if (d.frozen === undefined) d.frozen = [];
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
        if (!d.care) {                       // 이미 care가 있으면 덮어쓰지 않는다
          const care = {};
          for (const day of d.careDays || []) care[day] = { ate: true, drank: true, brooded: true };
          d.care = care;
        }
        delete d.careDays;
        return d;
      });
      s.bedding = 100; s.poops = []; s.ammonia = 0;
      s.inventory = { grit: 0 }; s.feedType = 'starter';
      s.equipment = { lamp: null, vacuum: false, autofeeder: false };
      s.lampPower = 1;
      s.freezes = C.RULE.careFreezePerTerm;
      s.settings = Object.assign({ pauseWeekends: true, quiet: false, propPos: {}, propHidden: {}, holidays: [], vacation: null, paused: false, useCalendar: false }, s.settings || {});
      s.away = [];
      delete s.lastAttend;                         // 쓰기만 하고 읽지 않던 필드
      s.version = 4;
      return s;
    },
    // v5 → v6 : 성별을 태어날 때 정하도록 바꿨다.
    // 예전에는 어른이 될 때 랜덤으로 뽑고, 첫 마리는 무조건 암탉으로 강제했다.
    // 이제는 태어날 때 정해지고 어린닭이 되어야 드러난다 — 실제로도 전문 감별사가 있어야 구별한다.
    5(s) {
      s.flock = (s.flock || []).map((d) => {
        // 이미 어른이면 단계가 곧 성별이다. 여기서 무작위로 덮으면 암탉이 수컷이 된다.
        if (d.stage === 'hen') d.sex = 'f';
        else if (d.stage === 'rooster') d.sex = 'm';
        else if (!d.sex) d.sex = Math.random() < 0.5 ? 'f' : 'm';
        return d;
      });
      s.chapter = s.flock && s.flock.length ? 4 : 0;   // 이미 키우던 사람은 안내를 다시 보지 않는다
      s.onboarded = !!(s.flock && s.flock.length);
      s.borrowed = null;
      s.settings = s.settings || {};
      if (!s.settings.guide && s.onboarded) s.settings.guide = 'sometimes';
      s.version = 6;
      return s;
    },
    // v4 → v5 : 데스크톱 펫 시절의 죽은 필드 제거 (수업 타이머 · 뽑기 · 할 일)
    4(s) {
      delete s.names; delete s.pickUsed; delete s.todos;
      if (s.settings) { delete s.settings.classMin; delete s.settings.breakMin; delete s.settings.autoBreak; }
      s.version = 5;
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
    // ⚠️ 중첩 객체의 기본값은 평면 병합 '전에' 붙들어 둔다.
    //    Object.assign(base, s) 가 base.settings 를 s.settings 로 통째로 바꿔치기 하므로,
    //    그 뒤에 base.settings 를 병합하면 자기 자신에 자기 자신을 병합하는 꼴이 되어
    //    저장 데이터에 없는 기본값(homeSide, pauseWeekends 등)이 전부 사라진다.
    const dSettings = base.settings, dInventory = base.inventory, dEquipment = base.equipment;
    const out = Object.assign(base, s);
    out.settings = Object.assign(dSettings, s.settings || {});
    out.inventory = Object.assign(dInventory, s.inventory || {});
    out.equipment = Object.assign(dEquipment, s.equipment || {});
    out.away = s.away || [];
    out.openedDays = s.openedDays || [];
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
