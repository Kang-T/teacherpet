// 티처펫 — 공용 유틸 + 이벤트 버스 (의존 없음)
(function (g) {
  const TP = (g.TP = g.TP || {});
  const listeners = {};
  TP.util = {
    $: (s) => document.querySelector(s),
    $$: (s) => Array.from(document.querySelectorAll(s)),
    now: () => Date.now(),
    today: () => new Date().toISOString().slice(0, 10),
    rand: (a, b) => a + Math.random() * (b - a),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    uid: (p = 'c') => p + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    // 날짜 차이(일). 주말·공휴일 제외는 state.js의 학사일정이 담당한다.
    daysBetween: (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000),
    isWeekend: (d) => { const w = new Date(d).getDay(); return w === 0 || w === 6; },
  };
  // 모듈 간 역방향 호출을 script 순서 제약 없이 푸는 최소 이벤트 버스
  TP.bus = {
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    off(ev, fn) { if (listeners[ev]) listeners[ev] = listeners[ev].filter((f) => f !== fn); },
    emit(ev, payload) { for (const fn of listeners[ev] || []) { try { fn(payload); } catch (e) { console.error('bus', ev, e); } } },
  };
})(typeof window !== 'undefined' ? window : module.exports);
