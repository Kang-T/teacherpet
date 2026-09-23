// 티처펫 웹 — Electron의 window.teacherpet 을 브라우저용으로 대체한다.
// 렌더러 코드(app.js 등)는 한 줄도 고치지 않고 그대로 쓴다.
(function () {
  const KEY = 'teacherpet.state.v1';
  const listeners = {};
  const emit = (ch, payload) => { for (const fn of listeners[ch] || []) { try { fn(payload); } catch (e) { console.error(e); } } };

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { console.warn('저장 데이터를 읽지 못했습니다', e); return null; }
  }
  // 화면 알림 — alert() 는 내장 브라우저에서 막혀 조용히 사라진다
  function note(text, ms) {
    const t = document.querySelector('#toasts');
    if (!t) return;
    const el = document.createElement('div'); el.className = 'toast big'; el.textContent = text;
    t.appendChild(el); setTimeout(() => el.remove(), ms || 6000);
  }
  function saveState(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; }
    catch (e) {
      // 저장 공간이 꽉 찼을 때 (localStorage는 보통 5MB)
      console.error('저장 실패', e);
      if (!window.__tpSaveWarned) { window.__tpSaveWarned = true; note('⚠️ 브라우저 저장 공간이 부족해 저장하지 못했어요. 시크릿 창에서는 저장되지 않아요', 12000); }
      return false;
    }
  }

  window.teacherpet = {
    loadState: async () => loadState(),
    saveState: async (s) => saveState(s),
    // 단가는 빌드할 때 prices.data.js 로 구워 넣는다 — 네트워크 요청 0을 지키기 위해서다.
    loadPrices: async () => window.__TP_PRICES || null,
    pricesPath: async () => '(웹 버전에서는 prices.json 파일을 고칠 수 없습니다)',
    savePrices: async () => false,
    workArea: async () => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }),
    info: async () => ({ version: window.__TP_VERSION || '웹', platform: 'web', openAtLogin: false }),
    quit: () => { document.body.classList.add('tp-hidden'); emit('pet:toggle-visible'); },
    openExternal: (url) => { if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
    setAutostart: () => {},
    on: (ch, fn) => { (listeners[ch] = listeners[ch] || []).push(fn); },
  };
  window.__tpEmit = emit;   // 화면 버튼이 트레이 메뉴 역할을 대신한다

  // 데이터 내보내기/가져오기 — 기기를 옮기거나 반을 넘겨줄 때
  window.__tpExport = function () {
    const data = localStorage.getItem(KEY) || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `티처펫_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  window.__tpImport = function (file) {
    const r = new FileReader();
    r.onload = () => {
      try { JSON.parse(r.result); localStorage.setItem(KEY, r.result); location.reload(); }
      catch (e) {
        // alert() 는 내장 브라우저에서 막힌다 — 화면 알림으로
        note('올바른 티처펫 파일이 아니에요', 6000);
      }
    };
    r.readAsText(file);
  };
})();
