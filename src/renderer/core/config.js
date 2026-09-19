// 티처펫 — 상수. 단계·수치를 바꿀 때는 이 파일만 고친다.
(function (g) {
  const TP = (g.TP = g.TP || {});

  // 1 "돌본 날" = 실제 3일. (기획서 4-1)
  const DAY_SCALE = 3;
  const STAGE_DAYS = { egg: 7, chick: 14, young: 28, adult: 40, old: 20 };

  TP.config = {
    DAY_SCALE,
    STAGE_DAYS,
    RULE: {
      maxFlock: 6,
      // 성장에 필요한 "돌본 날"
      daysEgg: STAGE_DAYS.egg, daysChick: STAGE_DAYS.chick, daysYoung: STAGE_DAYS.young,
      daysToOld: STAGE_DAYS.adult, daysToLeave: STAGE_DAYS.adult + STAGE_DAYS.old,
      feedPerMeal: 15, waterPerDrink: 12,
      refillCooldownMin: 60,
      offlineCapHours: 12,          // 오프라인 진행 상한
      careFreezePerTerm: 3,         // 학기당 돌봄 프리즈
      automationEffect: 0.5,        // 자동화는 효과의 절반만
    },
    // 크기 설정 → 3D 1유닛의 픽셀 수 (암탉 ≈ 2.85유닛)
    PX_PER_UNIT: { 3: 24, 4: 33, 6: 50 },
    STAGE_KO: { egg: '알', chick: '병아리', young: '어린닭', hen: '암탉', rooster: '수탉' },
    STAGE_ORDER: { rooster: 0, hen: 1, young: 2, chick: 3, egg: 4 },
    SPEED: { egg: 0, chick: 1.6, young: 1.9, hen: 1.5, rooster: 1.8 },  // 유닛/초
    RANK: { rooster: 3, hen: 2, young: 1, chick: 0, egg: -1 },
    NAMES: ['삐약이', '노랑이', '콩콩', '햇살', '보리', '구름', '달걀이', '방울', '초코', '땅콩', '꼬꼬', '모카', '레몬', '솜이', '토리', '봄이'],
    PROP_NAMES: ['coop', 'nest', 'feeder', 'waterer', 'basket', 'wormbucket', 'lamp', 'dustpit', 'perch'],
    PROP_KO: {
      coop: '닭장 — 클릭하면 메뉴', nest: '둥지 — 클릭하면 알 품어주기', feeder: '모이통', waterer: '물통',
      basket: '달걀 바구니', wormbucket: '벌레통 — 끌어다 놓으면 닭들이 달려와요', lamp: '보온등 — 병아리들이 따뜻한 불빛 아래 모여요',
      dustpit: '모래밭 — 여기서 모래 목욕을 해요 (깃털이 깨끗해져요)',
      perch: '횟대 — 닭은 높은 곳에서 자요. 졸리면 올라가요',
    },
    // 병아리 보온: 필요 온도 = 35 − 2.8 × (병아리 돌본 날)  (기획서 4-2)
    BROOD: { startC: 35, dropPerDay: 1.2, tolerance: 2, minC: 21 },   // 실제 '주당 2.8℃'를 돌본 날(=3일) 단위로 환산
    // 사료 3단계: 단계에 맞는 사료를 줘야 잘 자란다
    FEED: {
      starter: { name: '스타터', protein: '18~20%', ok: ['chick'], desc: '0~6주. 단백질이 높아요' },
      grower:  { name: '그로워', protein: '15~18%', ok: ['young'], desc: '6~20주. 성장기용' },
      layer:   { name: '레이어', protein: '16~18% + 칼슘 3~4%', ok: ['hen', 'rooster'], desc: '산란기용. 칼슘이 많아요' },
    },
    // 청결: 깃털이 더러워지는 속도와 회복량
    CLEAN: { decayPerHour: 4, dustBathGain: 55, preenGain: 7, dullBelow: 40 },
    // 위생: 암모니아 임계 (기획서 4-4)
    // 위생 (기획서 4-4). 실제 닭은 하루 12~16회 배설하지만, 앱이 켜져 있는 동안 눈에 보이고
    // 청소가 하루 일과가 되도록 시간당 기준으로 올려 잡았다.
    HYGIENE: {
      poopPerBirdPerHour: 12, afterMealChance: 0.85, cecalRatio: 0.12,
      smellPpm: 15, penaltyPpm: 25, ppmPerPoopHour: 0.35, ventPerHour: 0.8,
      beddingDays: 7, maxPoops: 20,
    },
    // 이별 방식
    LIFE_END: { retire: '농장으로 떠나요', natural: '자연으로 돌아가요', safe: '떠나지 않아요 (안심 모드)' },
    prices: null,   // prices.json 로드 후 채워짐
    // 할머니에게 편지 — 구글 폼 주소. 새 창으로 열기만 하고 우리 앱은 아무것도 보내지 않는다.
    // 비워 두면 편지 버튼이 동작하지 않는다.
    LETTER_FORM: 'https://forms.gle/3iB9pFV38ibDhf2s8',
  };

  // file:// 에서는 fetch가 막히므로 메인 프로세스를 거친다.
  TP.config.loadPrices = async function (api) {
    let p = null;
    try { p = api && api.loadPrices ? await api.loadPrices() : null; } catch (e) { console.warn('단가 로드 실패', e); }
    TP.config.prices = p || { 기준일: '—', 품목: {} };
    return TP.config.prices;
  };
  TP.config.price = (key) => ((TP.config.prices || {}).품목 || {})[key] || null;
})(typeof window !== 'undefined' ? window : module.exports);
