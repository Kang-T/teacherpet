// 할머니 — 이 게임의 유일한 화자.
// 잔소리하지 않고, 실패를 나무라지 않는다. 물어보면 알려주고, 아니면 곁에 있을 뿐이다.
// 여기는 '무슨 말을 할지'만 담는다. 언제 띄울지는 app.js 가 정한다.
(function (g) {
  const TP = (g.TP = g.TP || {});

  // 안내 수준 — 학년 대신 아이가 직접 고른다. '난이도'라는 말은 쓰지 않는다.
  const GUIDE = {
    often:     { label: '자주 여쭤볼래요', desc: '할머니가 먼저 알려주세요', nudge: true,  detail: false },
    sometimes: { label: '가끔 여쭤볼래요', desc: '물어보면 알려주세요',      nudge: false, detail: false },
    alone:     { label: '혼자 해볼래요',   desc: '스스로 알아낼 거예요',      nudge: false, detail: true },
  };

  const INTRO = [
    '어서 오너라. 여기가 우리 농장이란다.',
    '오늘부터 이 마당은 네가 돌보는 거야.',
  ];

  // 첫날 한 번에 하나씩 — 네 가지만 알면 된다
  const STEPS = [
    { id: 'feed',  say: '먼저 모이통을 채워 주렴. 마당에 있는 모이통을 눌러 보렴.', done: (s) => s.feed >= 90 },
    { id: 'water', say: '물도 있어야지. 물통을 눌러 채워 주고.',                  done: (s) => s.water >= 90 },
    { id: 'warm',  say: '보온등은 이미 켜 두었단다. 갓 난 병아리는 추워서, 이 불빛 아래로 모여들 거야.', next: true, done: () => false },
    { id: 'again', say: '잘했다. 이제 하루에 한 번씩 들러서 모이와 물만 챙겨 주면 된단다.', done: () => false, last: true },
  ];

  // 미션 — 화면에 늘 떠 있는 '지금 할 일'. 순서대로 하나씩 보여 준다.
  // when: 이 조건이 처음 참이 될 때 나타난다(없으면 처음부터). done: 이 조건이 참이면 완료.
  // ctx = { s: state, birds, poops, caredToday }
  const QUESTS = [
    { id: 'feed',  icon: '🌾', title: '모이통 채우기',       hint: '마당의 모이통을 눌러 보세요',                 done: (c) => c.s.feed >= 90 },
    { id: 'water', icon: '💧', title: '물통 채우기',         hint: '마당의 물통을 눌러 보세요',                   done: (c) => c.s.water >= 90 },
    { id: 'warm',  icon: '🔥', title: '보온등 세기 바꿔 보기', hint: '보온등을 눌러 세기를 바꿔 보세요. 병아리는 추위를 타니 끄지는 마세요', done: (c) => !!((c.s.quest || {}).acts || {}).lamp },
    { id: 'worm',  icon: '🐛', title: '병아리에게 벌레 주기', hint: '벌레통에서 벌레를 끌어다 병아리 앞에 놓아 보세요', done: (c) => !!((c.s.quest || {}).acts || {}).worm },
    { id: 'pet',   icon: '🤚', title: '병아리 쓰다듬기',     hint: '병아리를 마우스로 살살 문질러 보세요',          done: (c) => !!((c.s.quest || {}).acts || {}).pet },
    { id: 'poop',  icon: '🧹', title: '똥 치우기',           hint: '마당의 똥을 눌러 치우세요. 안 치우면 냄새가 나요', when: (c) => c.poops >= 2, done: (c) => c.poops === 0 },
    { id: 'young', icon: '🌱', title: '병아리를 어린닭으로 키우기', hint: '매일 모이와 물을 챙기면 며칠 뒤 어린닭이 돼요', done: (c) => c.birds.some((b) => ['young', 'hen', 'rooster'].includes(b.d.stage)) },
    { id: 'adult', icon: '🐔', title: '어른 닭으로 키우기',   hint: '어린닭도 매일 돌보면 암탉·수탉이 돼요',          done: (c) => c.birds.some((b) => ['hen', 'rooster'].includes(b.d.stage)) },
  ];

  // 장 — 한살이를 따라간다
  const CHAPTERS = {
    1: { title: '병아리를 받다',  say: '이 아이는 네가 맡아 보렴. 갓 나서 아직 아무것도 모른단다.' },
    2: { title: '이름과 성격',    say: '가만 보면 이 아이만의 버릇이 있지? 이름을 지어 주면 더 정이 간단다.' },
    3: { title: '어린닭',         say: '볏이 자라기 시작했구나. 이제 암컷인지 수컷인지 알 수 있단다.' },
    4: { title: '어른이 되다',    say: '이제 네가 농부구나.' },
  };

  // 물어보면 알려준다 — 급한 것부터 하나만
  function advise(s, birds, HYG, caredToday) {
    const chicks = birds.filter((b) => b.d.stage === 'chick');
    const cold = chicks.filter((b) => b.comfort && b.comfort.state === 'cold');
    const hot = chicks.filter((b) => b.comfort && b.comfort.state === 'hot');
    const sick = birds.find((b) => b.d.sick);
    const hurt = birds.find((b) => b.d.hurt);
    const hungry = birds.filter((b) => b.d.stage !== 'egg' && b.d.hunger < 30);
    const thirsty = birds.filter((b) => b.d.stage !== 'egg' && b.d.thirst < 30);
    const dirty = birds.filter((b) => (b.d.clean ?? 85) < 35);
    const eggs = birds.filter((b) => b.d.stage === 'egg');
    const lv = HYG ? HYG.level(s.ammonia) : 'ok';

    if (sick) return `${sick.d.name}(이)가 아파 보이는구나. 약을 사서 먹여 보렴.`;
    if (hurt) return `${hurt.d.name}(이)가 다쳤단다. 오늘 잘 챙겨 주면 낫는단다.`;
    if (s.water < 15) return '물통이 비었구나. 물 없이는 하루도 못 버틴단다.';
    if (s.feed < 15) return '모이통이 비었어. 채워 주렴.';
    if (cold.length) return '병아리가 웅크리고 있지? 추운 거란다. 보온등을 조금 올려 보렴.';
    if (hot.length) return '병아리가 헐떡이는구나. 너무 더운 거야. 보온등을 낮춰 주렴.';
    if (lv === 'bad') return '닭장 냄새가 심하구나. 똥을 치우고 깔짚을 갈아야 한단다.';
    if (lv === 'smell') return '슬슬 냄새가 나는구나. 똥을 좀 치워 주렴.';
    if (thirsty.length) return '목말라 하는 아이가 있구나. 물통을 채워 주렴.';
    if (hungry.length) return '배고파하는 아이가 있어. 모이를 챙겨 주렴.';
    if (dirty.length) return '깃털이 꾀죄죄하구나. 모래 목욕터가 있으면 알아서 씻는단다.';
    if ((s.bedding ?? 100) < 30) return '깔짚이 축축해졌구나. 갈아 주면 좋아한단다.';
    if (eggs.length && caredToday && eggs.some((e) => !caredToday(e.d))) return '둥지의 알을 품어 주렴. 매일 한 번씩이면 된단다.';
    return '오늘은 별일 없구나. 가만히 보고 있는 것도 돌보는 거란다.';
  }

  TP.granny = { GUIDE, INTRO, STEPS, QUESTS, CHAPTERS, advise };
})(typeof window !== 'undefined' ? window : module.exports);
