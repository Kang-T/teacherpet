// 관찰일지 — 한살이의 '순간'을 스스로 적어 둔다.
// 아이가 따로 기록하지 않아도, 다 키우고 나면 그대로 관찰일지이자 평가 자료가 된다.
// (과학 [4과04-03] '한살이 과정을 조사하여 자료를 만들어 공유하기'가 붙는 자리)
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util;

  const MAX = 60;        // 기록은 60개까지
  const MAX_PHOTO = 20;  // 사진은 최근 20장까지 (기기 저장 공간을 아낀다)

  // kind → { icon, 제목, 본문(닭 이름을 받아 만든다) }
  const KINDS = {
    start:     { icon: '🐤', title: '첫 만남',     line: (n) => `할머니에게 ${n}(이)를 받았어요.` },
    hatch:     { icon: '🐣', title: '부화',       line: (n) => `알에서 ${n}(이)가 나왔어요. 21일을 기다렸어요.` },
    young:     { icon: '🐥', title: '어린닭',     line: (n, d) => `${n}(이)의 볏이 자랐어요. ${d.sex === 'f' ? '암컷' : '수컷'}이었어요.` },
    adult:     { icon: '🐔', title: '어른',       line: (n, d) => (d.sex === 'f' ? `${n}(이)가 암탉이 되었어요.` : `${n}(이)가 수탉이 되었어요.`) },
    firstEgg:  { icon: '🥚', title: '첫 알',      line: (n) => `${n}(이)가 처음으로 알을 낳았어요.` },
    firstCrow: { icon: '📣', title: '첫 울음',    line: (n) => `${n}(이)가 처음으로 꼬끼오 하고 울었어요.` },
    firstDust: { icon: '🛁', title: '첫 모래 목욕', line: (n) => `${n}(이)가 모래에 몸을 비볐어요. 닭은 물이 아니라 모래로 씻어요.` },
    healed:    { icon: '💚', title: '다 나았어요', line: (n) => `${n}(이)가 아팠다가 나았어요.` },
    left:      { icon: '🌾', title: '떠남',       line: (n) => `${n}(이)가 넓은 농장으로 떠났어요.` },
    back:      { icon: '🏡', title: '돌아옴',     line: (n) => `${n}(이)가 돌아왔어요.` },
  };

  function record(state, kind, bird, photo) {
    const k = KINDS[kind];
    if (!k) return null;
    state.journal = state.journal || [];
    const d = bird && bird.d ? bird.d : bird || {};
    const e = {
      id: U.uid(), kind, of: d.id || '', day: U.today(), at: U.now(),
      name: d.name || '', stage: d.stage || '',
      text: k.line(d.name || '이 아이', d),
    };
    if (photo) e.photo = photo;
    state.journal.push(e);
    // 오래된 것부터 사진을 떼고, 그래도 넘치면 기록을 줄인다
    const withPhoto = state.journal.filter((x) => x.photo);
    for (let i = 0; i < withPhoto.length - MAX_PHOTO; i++) delete withPhoto[i].photo;
    if (state.journal.length > MAX) state.journal = state.journal.slice(-MAX);
    return e;
  }
  // 같은 종류를 이 닭에 대해 이미 적었는가 ('첫 ○○'은 한 번만)
  function has(state, kind, id) {
    return (state.journal || []).some((e) => e.kind === kind && e.of === id);
  }

  TP.journal = { KINDS, record, has, MAX, MAX_PHOTO };
})(typeof window !== 'undefined' ? window : module.exports);
