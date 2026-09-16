// 티처펫 — 온도와 질병
// 온도: 1주차 35℃에서 매주 2.8℃씩 내린다. 화면에 숫자를 띄우지 않고 병아리의 배치와 소리로 알린다.
//   너무 추움 → 등 아래 빽빽이 뭉치고 시끄럽게 삑삑 / 너무 더움 → 가장자리로 흩어져 헐떡이고 조용함
// 질병: 초보자 폐사 원인 4종. 증상이 보일 땐 이미 24~48시간 지난 상태다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config;

  const ROOM_C = 21, LAMP_MAX_C = 15;

  // 병아리가 필요로 하는 온도 (돌본 날 = 주령)
  function needC(bird, caredDays) {
    if (bird.stage !== 'chick') return null;
    return Math.max(C.BROOD.minC, C.BROOD.startC - C.BROOD.dropPerDay * caredDays);
  }
  // 어느 자리의 실제 온도
  function tempAt(x, lamp, lampPower) {
    if (!lamp || !lampPower) return ROOM_C;
    const d = Math.abs(x - lamp.x);
    const fall = Math.max(0, 1 - (d / 4.5) ** 1.6);       // 유효 반경 4.5유닛
    return ROOM_C + LAMP_MAX_C * lampPower * fall;
  }
  function comfort(bird, caredDays, x, lamp, lampPower) {
    const need = needC(bird, caredDays);
    if (need === null) return { state: 'na', need: null, actual: null, diff: 0 };
    const actual = tempAt(x, lamp, lampPower);
    const diff = actual - need;
    const t = C.BROOD.tolerance;
    return { state: diff < -t ? 'cold' : diff > t ? 'hot' : 'ok', need, actual, diff };
  }

  // ── 질병 ──
  const DISEASE = {
    cold:  { name: '저체온', icon: '🥶', why: '너무 추운 곳에 오래 있었어요', cure: '보온등을 켜고 온도를 맞춰 하루를 보내면 나아요', drain: 9 },
    pasty: { name: '항문 막힘', icon: '💧', why: '온도가 맞지 않아 배설물이 굳었어요', cure: '닭을 클릭해서 닦아 주세요', drain: 7 },
    cocci: { name: '콕시듐증', icon: '🩸', why: '더러운 깔짚과 암모니아 때문이에요', cure: '약을 사서 물에 타 주세요 (닭장 메뉴)', drain: 14 },
    crop:  { name: '소낭 막힘', icon: '🚫', why: '그릿(모래) 없이 간식을 너무 많이 먹었어요', cure: '하루 동안 사료를 끊고 물만 주세요', drain: 8 },
  };
  const info = (k) => DISEASE[k] || null;

  function fallSick(d, kind) {
    if (d.sick) return false;
    d.sick = { type: kind, since: U.today() };
    return true;
  }
  function cure(d) { const was = d.sick; d.sick = null; d.health = Math.min(100, (d.health || 0) + 25); return was; }

  // 매 틱 위험도 평가 → 병에 걸릴지
  function riskTick(bird, ctx, dt) {
    const d = bird.d;
    if (d.sick || d.stage === 'egg') return null;
    const hours = dt / 3600;
    // ① 저체온 — 추운 상태가 누적되면
    if (ctx.comfort && ctx.comfort.state === 'cold') {
      d.coldHours = (d.coldHours || 0) + hours;
      if (d.coldHours > 6 && Math.random() < hours * 0.5) return 'cold';
    } else d.coldHours = Math.max(0, (d.coldHours || 0) - hours * 2);
    // ② 항문 막힘 — 2주 미만 병아리가 온도를 벗어났을 때 (추워도 더워도)
    if (d.stage === 'chick' && ctx.comfort && ctx.comfort.state !== 'ok') {
      if (Math.random() < hours * 0.12) return 'pasty';
    }
    // ③ 콕시듐증 — 암모니아가 높고 깔짚이 젖었을 때. 3~6주(어린 것)가 가장 취약
    if (ctx.ammonia >= C.HYGIENE.penaltyPpm) {
      const vuln = (d.stage === 'chick' || d.stage === 'young') ? 1.8 : 0.6;
      const dirty = (100 - (ctx.bedding ?? 100)) / 100;
      if (Math.random() < hours * 0.09 * vuln * (0.4 + dirty)) return 'cocci';
    }
    // ④ 소낭 막힘 — 그릿 없이 간식을 3번 이상
    if ((d.treatsNoGrit || 0) >= 3 && Math.random() < hours * 0.8) return 'crop';
    return null;
  }

  // 아프면 건강이 깎이고, 오래 두면 쇠약해진다 (죽지는 않는다 — 기획서 결정 ①-B)
  function sickTick(d, dt) {
    if (!d.sick) return;
    const info2 = DISEASE[d.sick.type];
    d.health = Math.max(0, (d.health ?? 100) - dt * (info2.drain / 3600));
    d.stress = Math.min(100, (d.stress || 0) + dt * (4 / 3600));
  }

  TP.health = { ROOM_C, needC, tempAt, comfort, DISEASE, info, fallSick, cure, riskTick, sickTick };
})(typeof window !== 'undefined' ? window : module.exports);
