// 티처펫 — 공용 유틸 + 이벤트 버스 (의존 없음)
(function (g) {
  const TP = (g.TP = g.TP || {});
  const listeners = {};
  // 날짜 문자열(YYYY-MM-DD)은 그 기기의 달력 날짜다. 한국이면 자정에 하루가 바뀐다.
  // 예전에는 세계 표준시(UTC) 날짜를 써서, 한국에서는 아침 9시에 하루가 바뀌었다 —
  // 아침 8시와 10시에 돌보면 이틀로 셌다 (2026-10-03 고침).
  // 바꾸는 날 한 번은 '오늘'이 하루 앞당겨질 수 있다(한국은 늘 앞으로만). 뒤로 가지 않으므로 기록이 꼬이지 않는다.
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  TP.util = {
    $: (s) => document.querySelector(s),
    $$: (s) => Array.from(document.querySelectorAll(s)),
    now: () => Date.now(),
    today: () => ymd(new Date()),
    ymd,
    // 아래 셋은 날짜 문자열끼리의 셈이라 UTC 로 계산해도 시간대와 상관없이 맞다
    addDays: (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
    rand: (a, b) => a + Math.random() * (b - a),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    uid: (p = 'c') => p + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    // 날짜 차이(일). 주말·공휴일 제외는 state.js의 학사일정이 담당한다.
    daysBetween: (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000),
    isWeekend: (d) => { const w = new Date(String(d).slice(0, 10) + 'T00:00:00Z').getUTCDay(); return w === 0 || w === 6; },
  };
  // 모듈 간 역방향 호출을 script 순서 제약 없이 푸는 최소 이벤트 버스
  TP.bus = {
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    off(ev, fn) { if (listeners[ev]) listeners[ev] = listeners[ev].filter((f) => f !== fn); },
    emit(ev, payload) { for (const fn of listeners[ev] || []) { try { fn(payload); } catch (e) { console.error('bus', ev, e); } } },
  };
})(typeof window !== 'undefined' ? window : module.exports);
