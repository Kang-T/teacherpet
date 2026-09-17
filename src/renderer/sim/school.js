// 티처펫 — 학사일정 · 오프라인 진행 · 돌봄 프리즈
// "주말과 방학에는 시간이 멈춘다"가 이 파일의 핵심이다. 학교에 없는 날을 벌하지 않기 위해서다.
(function (g) {
  const TP = (g.TP = g.TP || {});
  const U = TP.util, C = TP.config;

  // 매년 반복되는 날 (MM-DD) — 음력 명절은 해마다 다르므로 settings.holidays 로 보완한다
  const FIXED = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];

  const key = (d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));
  const md = (d) => key(d).slice(5);

  function isHoliday(d, st) {
    const k = key(d);
    if (FIXED.includes(md(k))) return true;
    const extra = (st && st.settings && st.settings.holidays) || [];
    return extra.includes(k);
  }
  function inVacation(d, st) {
    const v = (st && st.settings && st.settings.vacation) || null;   // { from, to }
    return !!(v && v.from && v.to && key(d) >= v.from && key(d) <= v.to);
  }
  // 등교일인가 = 시간이 흐르는 날인가
  function isSchoolDay(d, st) {
    if (st && st.settings && st.settings.pauseWeekends === false) return true;
    if (U.isWeekend(key(d))) return false;
    if (isHoliday(d, st)) return false;
    if (inVacation(d, st)) return false;
    return true;
  }
  // 두 날짜 사이의 등교일 목록 (both exclusive of from, inclusive of to)
  function schoolDaysBetween(from, to, st) {
    const out = [];
    const a = new Date(key(from)), b = new Date(key(to));
    for (let d = new Date(a.getTime() + 86400000); d <= b; d = new Date(d.getTime() + 86400000)) {
      if (isSchoolDay(d, st)) out.push(key(d));
    }
    return out;
  }
  // 자리를 비운 시간 중 "실제로 흐른" 시간 (주말·방학 제외, 12시간 상한)
  function effectiveAwayHours(lastSeenMs, nowMs, st) {
    if (!lastSeenMs || nowMs <= lastSeenMs) return 0;
    let ms = 0;
    const startDay = new Date(key(new Date(lastSeenMs)));
    for (let d = new Date(startDay); d.getTime() <= nowMs; d = new Date(d.getTime() + 86400000)) {
      if (!isSchoolDay(d, st)) continue;
      const dayStart = Math.max(lastSeenMs, d.getTime());
      const dayEnd = Math.min(nowMs, d.getTime() + 86400000);
      if (dayEnd > dayStart) ms += dayEnd - dayStart;
    }
    return Math.min(C.RULE.offlineCapHours, ms / 3600000);
  }
  // 돌보지 않고 흘려보낸 등교일 수 (프리즈로 덮은 날은 빼고)
  function neglectedDays(bird, st) {
    const cared = Object.keys(bird.care || {}).filter((day) => TP.state.isCared(bird, day)).sort();
    const last = cared.length ? cared[cared.length - 1] : (bird.stageSince || U.today());
    const frozen = (bird.frozen || []);
    return schoolDaysBetween(last, U.today(), st).filter((day) => !frozen.includes(day));
  }
  // 프리즈를 써서 빠진 날을 덮는다
  function useFreeze(bird, days, st) {
    if (!days.length || st.freezes <= 0) return 0;
    const use = Math.min(st.freezes, days.length);
    bird.frozen = (bird.frozen || []).concat(days.slice(0, use));
    st.freezes -= use;
    return use;
  }
  function termReset(st) { st.freezes = C.RULE.careFreezePerTerm; }

  TP.school = { FIXED, isHoliday, inVacation, isSchoolDay, schoolDaysBetween, effectiveAwayHours, neglectedDays, useFreeze, termReset, key };
})(typeof window !== 'undefined' ? window : module.exports);
