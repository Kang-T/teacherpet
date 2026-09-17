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
  function saveState(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; }
    catch (e) {
      // 저장 공간이 꽉 찼을 때 (localStorage는 보통 5MB)
      console.error('저장 실패', e);
      if (!window.__tpSaveWarned) { window.__tpSaveWarned = true; alert('브라우저 저장 공간이 부족해 저장하지 못했습니다.\n시크릿 모드에서는 저장이 되지 않습니다.'); }
      return false;
    }
  }

  window.teacherpet = {
    loadState: async () => loadState(),
    saveState: async (s) => saveState(s),
    loadPrices: async () => {
      try { const r = await fetch('prices.json', { cache: 'no-cache' }); return await r.json(); }
      catch (e) { console.warn('단가 파일을 읽지 못했습니다', e); return null; }
    },
    pricesPath: async () => '(웹 버전에서는 prices.json 파일을 고칠 수 없습니다)',
    savePrices: async () => false,
    workArea: async () => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }),
    info: async () => ({ version: window.__TP_VERSION || '웹', platform: 'web', openAtLogin: false }),
    setIgnoreMouse: () => {},              // 웹에는 클릭 통과가 필요 없다
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
      catch (e) { alert('올바른 티처펫 파일이 아닙니다.'); }
    };
    r.readAsText(file);
  };
})();
