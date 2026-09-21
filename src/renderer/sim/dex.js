// 행동 도감 — 닭이 그 행동을 하는 순간 클릭하면 모인다.
//
// 왜 만들었나: 아이들이 지렁이 9마리를 10분 만에 다 주고 "또 할 거 없어요?" 하고 물었다.
// 닳는 할 거리(지렁이·코인)를 더 풀면 금방 또 바닥난다. 대신 닭을 '지켜보게' 만든다.
// 닭은 이미 40가지 넘는 행동을 하는데, 아이들은 그걸 볼 이유가 없었다.
// 과학 [4과04-01] "관찰한 내용을 글과 그림으로 표현" · 실과 [6실04-08] 동물 기르기와 붙는다.
//
// anims: 그 순간의 b.anim 가운데 하나면 발견. 방금 끝난 행동도 1.5초까지는 봐준다(아이 손이 느리다).
// stages: 비우면 누구나. why: 발견했을 때 보여 주는 한 줄 — 5학년이 읽을 말로.
//
// ⚠️ 순서를 바꾸거나 중간에 끼우지 말 것. 농장 코드에 '몇 번째 칸'으로 담긴다. 새 행동은 맨 뒤에 붙인다.
(function (g) {
  const TP = g.TP = g.TP || {};
  const LIST = [
    { id: 'dustbath', icon: '🏖️', name: '모래 목욕', anims: ['dustbath'],
      why: '닭은 물 대신 모래로 씻어요. 깃털 사이의 진드기와 묵은 기름을 털어 내요.' },
    { id: 'preen', icon: '🪶', name: '깃털 다듬기', anims: ['preen'],
      why: '꼬리 위 기름샘에서 기름을 부리로 찍어 깃털에 발라요. 그래서 비에 잘 젖지 않아요.' },
    { id: 'stretch', icon: '🙆', name: '기지개', anims: ['stretch'],
      why: '한쪽 다리와 같은 쪽 날개를 함께 쭉 펴요. 오래 앉아 있다 일어나면 자주 해요.' },
    { id: 'sunbathe', icon: '☀️', name: '햇볕 쬐기', anims: ['sunbathe'],
      why: '날개를 펼치고 옆으로 누워 볕을 쬐어요. 몸을 데우고 뼈에 필요한 비타민 D를 만들어요.' },
    { id: 'scratch', icon: '🦶', name: '땅 긁기', anims: ['scratch'],
      why: '발로 땅을 뒤로 긁어 흙 속의 벌레와 씨앗을 찾아요. 긁고 → 한 발 물러나 → 쪼아요.' },
    { id: 'peck', icon: '🐤', name: '쪼기', anims: ['peck', 'peckat', 'gopeckat'],
      why: '닭은 이가 없어요. 부리로 쪼아 통째로 삼키고, 모래주머니에서 작은 돌로 갈아 소화해요.' },
    { id: 'eat', icon: '🌾', name: '모이 먹기', anims: ['eat'],
      why: '병아리 때와 클 때 먹는 사료가 달라요. 자라는 몸에 필요한 영양이 달라지기 때문이에요.' },
    { id: 'drink', icon: '💧', name: '물 마시기', anims: ['drink'],
      why: '닭은 물을 빨아 마시지 못해요. 부리로 떠서 고개를 하늘로 들어 목으로 흘려 넘겨요.' },
    { id: 'flap', icon: '🪽', name: '날갯짓', anims: ['flap', 'flutter'],
      why: '닭도 날 수 있어요! 멀리는 못 가지만 횃대나 울타리 정도는 날아올라요.' },
    { id: 'shake', icon: '💫', name: '부르르 털기', anims: ['shake'],
      why: '온몸을 부르르 털어 흐트러진 깃털을 제자리로 돌리고 먼지를 떨어내요.' },
    { id: 'sleep', icon: '😴', name: '낮잠', anims: ['sleep'],
      why: '병아리는 하루에도 여러 번 짧게 자요. 자는 동안 몸이 자라요.' },
    { id: 'roost', icon: '🌙', name: '횃대에서 자기', anims: ['roost'],
      why: '닭은 밤에 높은 곳에 올라 자요. 앉으면 발가락이 저절로 오므라들어 떨어지지 않아요.' },
    { id: 'huddle', icon: '🫂', name: '옹기종기', anims: ['huddle'], stages: ['chick'],
      why: '어린 병아리는 스스로 체온을 지키지 못해서 따뜻한 곳에 서로 붙어 있어요.' },
    { id: 'hover', icon: '🐔', name: '날개 밑에 품기', anims: ['hover'],
      why: '엄마 닭은 병아리를 날개 밑에 품어 자기 체온을 나눠 줘요. 살아 있는 보온등이에요.' },
    { id: 'brood', icon: '🥚', name: '알 품기', anims: ['brood'],
      why: '알은 21일 동안 품어야 깨어나요. 엄마 닭은 하루에도 여러 번 알을 굴려 고루 데워요.' },
    { id: 'tidbit', icon: '📣', name: '꾹꾹 부르기', anims: ['tidbit'],
      why: '맛있는 것을 찾으면 "꾹꾹꾹" 소리를 내며 먹이를 들었다 놨다 해서 병아리를 불러요.' },
    { id: 'crow', icon: '🐓', name: '꼬끼오', anims: ['crow'],
      why: '수탉만 울어요. "여기는 우리 자리야" 하고 알리는 소리예요. 새벽에만 우는 건 아니에요.' },
    { id: 'guard', icon: '👀', name: '망보기', anims: ['guard', 'alert'],
      why: '고개를 곧게 들고 하늘과 주변을 살펴요. 위험하면 소리를 내어 무리에게 알려요.' },
    { id: 'pant', icon: '🥵', name: '헐떡이기', anims: ['pant'],
      why: '닭은 땀을 흘리지 못해요. 더우면 입을 벌리고 헐떡이며 몸의 열을 내보내요.' },
    { id: 'squat', icon: '🧺', name: '몸 낮추기', anims: ['squat', 'crouch'],
      why: '다 자란 암탉이 알 낳을 때가 가까워지면 몸을 낮추고 가만히 앉아 있곤 해요.' },
    { id: 'beg', icon: '🍚', name: '보채기', anims: ['beg'],
      why: '배고픈 닭은 사람을 졸졸 따라다니며 보채요. 모이통을 먼저 살펴 주세요.' },
    { id: 'spar', icon: '🥇', name: '서열 정하기 놀이', anims: ['spar', 'stomp'],
      why: '어린 닭끼리 가슴을 부풀리고 마주 서서 누가 먼저 먹을지 차례를 정해요. 금방 끝나요.' },
  ];
  const BY_ANIM = {};
  for (const e of LIST) for (const a of e.anims) BY_ANIM[a] = e;

  // 지금 이 닭이 하는 행동이 도감의 어느 칸인가 (없으면 null)
  function match(anim, stage) {
    const e = BY_ANIM[anim];
    if (!e) return null;
    if (e.stages && stage && !e.stages.includes(stage)) return null;
    return e;
  }

  TP.dex = { LIST, match, get: (id) => LIST.find((e) => e.id === id) || null };
})(typeof window !== 'undefined' ? window : module.exports);
