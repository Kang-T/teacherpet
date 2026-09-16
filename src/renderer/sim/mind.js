// 티처펫 — 성격·기분·서열. (docs/설계_닭의_마음.md 의 코드 대응물)
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config;

  const BASE = { approach: 1, flee: 1, affGain: 1, energy: 1, appetite: 1, curiosity: 1, sociable: 1, playful: 1, bold: 1, stubborn: 1, greedy: 1, tidy: 1, sleepy: 1, noisy: 1 };
  const TRAIT = {
    '호기심쟁이': { curiosity: 1.8, approach: 1.5 }, '겁쟁이': { flee: 1.9, bold: 0.4, affGain: 0.8 },
    '장난꾸러기': { playful: 1.7, greedy: 1.3 }, '느긋이': { energy: 0.6, bold: 1.5 },
    '먹보': { appetite: 1.8, greedy: 1.8 }, '잠꾸러기': { sleepy: 1.8, energy: 0.7 },
    '수다쟁이': { noisy: 1.9 }, '외톨이': { sociable: 0.4 },
    '대장': { bold: 1.6, stubborn: 1.4 }, '응석받이': { affGain: 1.6, approach: 1.4 },
    '고집불통': { stubborn: 2.0 }, '부끄럼쟁이': { approach: 0.6, affGain: 1.2, flee: 1.2 },
    '모험가': { curiosity: 1.6, energy: 1.4 }, '깔끔이': { tidy: 2.0 },
    '춤꾼': { playful: 1.5, energy: 1.3 }, '새침이': { affGain: 0.9, stubborn: 1.3 },
    '친절이': { sociable: 1.8 }, '왈가닥': { energy: 1.6, noisy: 1.4 },
    '몽상가': { curiosity: 0.7, energy: 0.7 }, '개구쟁이': { playful: 1.8, bold: 1.3 },
  };
  const TRAIT_DESC = {
    '호기심쟁이': '커서와 새 물건에 먼저 다가가요', '겁쟁이': '작은 소리에도 도망가요. 친해지면 오래 가요',
    '장난꾸러기': '친구를 쫓고 벌레를 먼저 낚아채요', '느긋이': '뭐든 천천히, 잘 안 놀라요',
    '먹보': '모이통 옆이 집이에요', '잠꾸러기': '자주 졸고 오래 자요',
    '수다쟁이': '늘 재잘재잘, 수탉이면 자주 울어요', '외톨이': '혼자가 편해요',
    '대장': '모이통에서 안 비켜요', '응석받이': '쓰다듬어 달라고 졸라요',
    '고집불통': '불러도 잘 안 와요', '부끄럼쟁이': '힐끔 보고 물러나요. 친해지면 붙어 다녀요',
    '모험가': '화면 끝까지 멀리 산책해요', '깔끔이': '깃털과 모래 목욕을 자주 해요',
    '춤꾼': '기분 좋으면 폴짝폴짝', '새침이': '좋아하다가도 획 돌아서요',
    '친절이': '다른 닭을 챙겨요', '왈가닥': '빠르고 시끄러워요',
    '몽상가': '멍하니 먼 곳을 봐요', '개구쟁이': '자는 친구를 깨우고 도망가요',
  };
  const LEGACY = { '호기심': '호기심쟁이', '겁쟁이': '겁쟁이', '장난꾸러기': '장난꾸러기', '느긋': '느긋이' };
  const NAMES = Object.keys(TRAIT);

  function normalizeTrait(d) {
    if (LEGACY[d.trait]) d.trait = LEGACY[d.trait];
    if (!TRAIT[d.trait]) d.trait = U.pick(NAMES);
    return d.trait;
  }
  const trait = (b) => Object.assign({}, BASE, TRAIT[(b.d || b).trait] || {});

  // 기분: 욕구·관계에서 파생. 보통(-0.25~0.25)은 무표정 구간.
  function moodOf(b) {
    const d = b.d || b;
    const hungerDef = Math.max(0, 40 - d.hunger) / 40, thirstDef = Math.max(0, 40 - d.thirst) / 40;
    const sickPenalty = d.sick ? 0.35 : 0;
    const valence = U.clamp(
      (d.aff - 50) / 110 + (d.happy - 60) / 160
      - hungerDef * 0.9 - thirstDef * 0.8 - d.stress / 100
      - Math.max(0, d.social - 70) / 150 - Math.max(0, d.boredom - 80) / 200
      - sickPenalty, -1, 1);
    const arousal = U.clamp(d.energy / 200 + d.stress / 150 + Math.max(0, 50 - d.boredom) / 300 + 0.15, 0, 1);
    return { valence, arousal, sleepy: U.clamp(1 - d.energy / 100, 0, 1) };
  }
  const rank = (b) => (C.RANK[(b.d || b).stage] || 0) + ((b.d || b).trait === '대장' ? 1 : 0);

  TP.mind = { BASE, TRAIT, TRAIT_DESC, NAMES, normalizeTrait, trait, moodOf, rank };
})(typeof window !== 'undefined' ? window : module.exports);
