// 티처펫 — 애니메이션 메타 테이블.
// 새 행동을 추가할 때 고칠 곳은 여기 한 곳이다. (예전에는 6곳에 배열이 복붙돼 있었다)
//   pose            : 3D 모델에 넘길 포즈 이름
//   moving          : 걷는 중인가 (다리·머리 흔들림)
//   goal            : 목표 지점으로 이동하는 행동인가
//   priority        : 클수록 잘 안 끊긴다 (벌레·부름 인터럽트 기준)
//   playing         : 심심함이 해소되는가
//   keepsCoop       : 닭장 안 상태를 유지하는가
//   stationary      : 자리를 잡고 하는 긴 행동인가 (도중에 이동하지 않음)
(function (g) {
  const TP = (g.TP = g.TP || {});
  const A = {
    // --- 기본 ---
    idle:        { pose: 'idle',   priority: 0 },
    sit:         { pose: 'idle',   priority: 0 },
    walk:        { pose: 'walk',   moving: 1, goal: 1, priority: 0 },
    // --- 생리 ---
    sleep:       { pose: 'sleep',  priority: 2, keepsCoop: 1, stationary: 1 },
    eat:         { pose: 'eat',    priority: 3, stationary: 1 },
    drink:       { pose: 'lookup', priority: 3, stationary: 1 },
    sad:         { pose: 'sad',    priority: 1 },
    // --- 목표 이동 ---
    gofeed:      { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    gowater:     { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    gocoop:      { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    gonest:      { pose: 'walk',   moving: 1, goal: 1, priority: 2 },
    gokid:       { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    'gomom-sleep': { pose: 'walk', moving: 1, goal: 1, priority: 1 },
    follow:      { pose: 'walk',   moving: 1, goal: 1, priority: 2 },
    panic:       { pose: 'walk',   moving: 1, goal: 1, priority: 7 },
    golamp:      { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    'golamp-sleep': { pose: 'walk', moving: 1, goal: 1, priority: 1 },
    goroof:      { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    godust:      { pose: 'walk',   moving: 1, goal: 1, priority: 1 },
    // --- 반응 ---
    chase:       { pose: 'walk',   moving: 1, priority: 4, playing: 1 },
    beg:         { pose: 'beg',    priority: 4, playing: 1 },
    jump:        { pose: 'happy',  priority: 3, playing: 1 },
    happy:       { pose: 'happy',  priority: 3, playing: 1 },
    fall:        { pose: 'flutter',priority: 5 },
    flutter:     { pose: 'flutter',priority: 5 },
    carry:       { pose: 'carry',  priority: 6 },
    pet:         { pose: 'pet',    priority: 5, playing: 1 },
    scold:       { pose: 'scold',  priority: 6 },
    startle:     { pose: 'startle',priority: 6 },
    // --- 감정 폭발 ---
    ecstatic:    { pose: 'ecstatic', priority: 5, playing: 1 },
    wail:        { pose: 'wail',   priority: 5, stationary: 1 },
    stomp:       { pose: 'stomp',  priority: 4 },
    // --- 생태 ---
    scratch:     { pose: 'scratch',priority: 1, stationary: 1 },   // 땅 긁기 (새 기본 idle)
    peck:        { pose: 'peck',   priority: 1 },
    preen:       { pose: 'preen',  priority: 1, stationary: 1 },
    dustbath:    { pose: 'dustbath', priority: 3, stationary: 1, playing: 1 },
    sunbathe:    { pose: 'sunbathe', priority: 2, stationary: 1 },
    flap:        { pose: 'flap',   priority: 1, playing: 1 },
    stretch:     { pose: 'stretch',priority: 1 },
    nuzzle:      { pose: 'nuzzle', priority: 2, stationary: 1 },
    brood:       { pose: 'brood',  priority: 4, stationary: 1 },
    crow:        { pose: 'crow',   priority: 3, stationary: 1 },
    roost:       { pose: 'roost',  priority: 2, stationary: 1 },
    squat:       { pose: 'squat',  priority: 2, stationary: 1 },   // submissive squat
    alert:       { pose: 'alert',  priority: 6, stationary: 1 },   // 지상 경보 — 꼿꼿이 경계
    crouch:      { pose: 'crouch', priority: 6, stationary: 1 },   // 공중 경보 — 납작 웅크림
    guard:       { pose: 'guard',  priority: 2, stationary: 1 },   // 수탉의 파수
    tidbit:      { pose: 'tidbit', priority: 3, stationary: 1 },   // 먹이 부르기
    huddle:      { pose: 'huddle', priority: 2, stationary: 1 },   // 병아리 뭉치기
    peckat:      { pose: 'peckat', priority: 3, stationary: 1 },   // 커서를 쪼기
    cock:        { pose: 'cock',   priority: 2, stationary: 1 },   // 고개 갸웃
    gopeckat:    { pose: 'walk',   moving: 1, goal: 1, priority: 3 },
    sick:        { pose: 'sick',   priority: 3, stationary: 1 },   // 아픔 — 깃털 부풀리고 웅크림
    pant:        { pose: 'pant',   priority: 2, stationary: 1 },   // 더위 — 헐떡임
    gowarm:      { pose: 'walk',   moving: 1, goal: 1, priority: 3 },
    gocool:      { pose: 'walk',   moving: 1, goal: 1, priority: 3 },
    gohuddle:    { pose: 'walk',   moving: 1, goal: 1, priority: 2 },
    gopeek:      { pose: 'walk',   moving: 1, goal: 1, priority: 2 },
    spar:        { pose: 'happy',  priority: 3, playing: 1 },      // 겨루기
    // --- 알 ---
    egg:         { pose: 'egg',    priority: 0, stationary: 1 },
    hatch:       { pose: 'egg',    priority: 9, stationary: 1 },   // 부화 중엔 무엇도 끼어들 수 없다
  };
  const DEF = { pose: 'idle', moving: 0, goal: 0, priority: 0, playing: 0, keepsCoop: 0, stationary: 0 };
  TP.actions = {
    meta: (anim) => Object.assign({}, DEF, A[anim] || {}),
    pose: (anim) => (A[anim] || DEF).pose || 'idle',
    isMoving: (anim) => !!(A[anim] || {}).moving,
    isGoal: (anim) => !!(A[anim] || {}).goal,
    isPlaying: (anim) => !!(A[anim] || {}).playing,
    keepsCoop: (anim) => !!(A[anim] || {}).keepsCoop,
    isStationary: (anim) => !!(A[anim] || {}).stationary,
    priority: (anim) => (A[anim] || DEF).priority || 0,
    // 새 행동이 현재 행동을 끊을 수 있는가
    canInterrupt: (current, next) => ((A[next] || DEF).priority || 0) > ((A[current] || DEF).priority || 0),
    all: () => Object.keys(A),
  };
})(typeof window !== 'undefined' ? window : module.exports);
