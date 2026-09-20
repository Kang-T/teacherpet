// 웹 전용 UI — 트레이 메뉴 대신 화면 버튼, 구름, 첫 방문 안내, 저장 경고, 모두 지우기.
// (예전에는 build-web.js 안의 템플릿 문자열이라 문법 검사도 못 했다. 이제 진짜 파일이다.)
(function () {
  const $ = (s) => document.querySelector(s);

  $('#wbMenu').addEventListener('click', () => window.__tpEmit('ui:toggle-menu'));
  for (const b of document.querySelectorAll('#webbar [data-size]')) {
    b.addEventListener('click', () => window.__tpEmit('pet:size', +b.dataset.size));
  }
  $('#wbFile').addEventListener('change', (e) => { if (e.target.files[0]) window.__tpImport(e.target.files[0]); });

  // ---- 모두 지우기 ----
  // 개인정보보호법 제30조의 '삭제 요구' 절차를 버튼 하나로 갈음한다.
  // 되돌릴 수 없으므로 두 번 묻고, 먼저 내보내기를 권한다.
  $('#wbWipe').addEventListener('click', () => {
    // confirm() 은 미리보기·내장 브라우저에서 막히는 일이 있다. 막히면 false 가 돌아와
    // 버튼이 통째로 죽는다. 버튼 자리에서 직접 두 번 묻는다.
    const btn = $('#wbWipe');
    if (btn.dataset.step === '1') {
      btn.dataset.step = '2';
      btn.textContent = '정말 지울까요? 한 번 더';
      setTimeout(() => { if (btn.dataset.step === '2') { btn.dataset.step = ''; btn.textContent = '🗑️ 모두 지우기'; } }, 6000);
      return;
    }
    if (btn.dataset.step !== '2') {
      btn.dataset.step = '1';
      btn.textContent = '먼저 [내보내기] 하셨나요? 누르면 계속';
      setTimeout(() => { if (btn.dataset.step === '1') { btn.dataset.step = ''; btn.textContent = '🗑️ 모두 지우기'; } }, 8000);
      return;
    }
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('teacherpet.')) localStorage.removeItem(k);
    } catch (e) { /* 저장이 막힌 브라우저 — 지울 것도 없다 */ }
    location.reload();
  });

  // ---- 저장이 되는 브라우저인지 먼저 확인한다 ----
  // 시크릿 창·크롬북 로그아웃 초기화·사파리 7일 삭제 때문에, 기기 저장은 '보관소'가 아니라 '캐시'다.
  function storageWorks() {
    try { localStorage.setItem('teacherpet.__t', '1'); localStorage.removeItem('teacherpet.__t'); return true; }
    catch (e) { return false; }
  }
  if (!storageWorks()) {
    const bar = document.createElement('div');
    bar.id = 'nosave';
    bar.textContent = '⚠️ 이 창에서는 저장이 되지 않아요 (시크릿 창일 수 있어요). 끝나면 꼭 [내보내기]를 눌러 주세요.';
    document.body.appendChild(bar);
  }

  // ---- 첫 방문 안내 (소리는 사용자가 한 번 누른 뒤에야 재생할 수 있다) ----
  const SEEN = 'teacherpet.welcomed';
  let seen = false;
  try { seen = !!localStorage.getItem(SEEN); } catch (e) { seen = false; }
  function begin() { $('#welcome') && $('#welcome').remove(); window.__tpEmit('ui:begin'); }

  // ---- 지난 농장이 있으면 먼저 묻는다 ----
  // 학교 공용 PC 에서는 앞 사람의 농장이 그대로 남아 있다. 묻지 않으면 섞인다.
  function savedFarm() {
    try {
      const s = JSON.parse(localStorage.getItem('teacherpet.state.v1') || 'null');
      const n = s && Array.isArray(s.flock) ? s.flock.length : 0;
      return n ? { n, names: s.flock.map((b) => b.name).filter(Boolean).slice(0, 4) } : null;
    } catch (e) { return null; }
  }
  // ---- 환영 카드는 여기 한 곳에서만 갈라진다 ----
  // 갈림길을 두 군데로 나눴더니, 한쪽이 바꿔 끼운 버튼을 다른 쪽이 붙잡으려다 터졌다.
  //  1) 지난 농장이 있다      → 이어서 키우기 / 새로 시작
  //  2) 처음 왔다            → 시작하기
  //  3) 와 본 적 있고 농장은 없다 → 묻지 않고 바로 할머니 이야기로
  const remember = () => { try { localStorage.setItem(SEEN, '1'); } catch (e) { /* 저장 불가 브라우저 */ } };
  const card = $('#welcome');
  const prev = card ? savedFarm() : null;
  if (prev) {
    card.innerHTML = `<h2>\u{1F414} 다시 왔어요</h2>
      <p>지난번 농장에 <b>${prev.n}마리</b>가 있어요.<br>${prev.names.join(' \u00b7 ')}</p>
      <p class="tiny">내 농장이 아니라면 새로 시작하세요.<br>지난 농장은 지워집니다.</p>
      <div class="wRow">
        <button class="primary" id="wbResume">이어서 키우기</button>
        <button id="wbFresh">새로 시작</button>
      </div>`;
    $('#wbResume').addEventListener('click', () => { remember(); begin(); });
    $('#wbFresh').addEventListener('click', () => {
      // 한 번 더 묻는다. confirm() 은 미리보기·내장 브라우저에서 막히는 일이 있고,
      // 막히면 false 가 돌아와 버튼을 눌러도 아무 일이 없다. 카드 안에서 묻는 편이 확실하다.
      const row = $('#wbFresh').parentElement;
      row.innerHTML = '';
      const back = document.createElement('button');
      back.textContent = '아니요';
      back.addEventListener('click', () => location.reload());
      const go = document.createElement('button');
      go.className = 'primary danger';
      go.textContent = `네, ${prev.n}마리를 지울게요`;
      go.addEventListener('click', () => {
        // 지우는 일은 앱이 한다. 여기서 지우고 새로고침하면, 새로고침이 끝나기 전에
        // 앱의 3초 자동 저장이 한 번 더 돌아 방금 지운 농장이 되살아난다.
        if (window.__tpWipe) { window.__tpWipe(); return; }
        try { for (const k of Object.keys(localStorage)) if (k.startsWith('teacherpet.')) localStorage.removeItem(k); } catch (e) {}
        location.reload();
      });
      row.appendChild(go); row.appendChild(back);
    });
  } else if (seen || !card) {
    // 환영 카드가 사라지는 순간 = 할머니 이야기가 시작되는 순간.
    // 여기서 알리지 않으면 이미 본 사람은 이야기가 영영 시작되지 않는다.
    begin();
  } else {
    $('#wbStart').addEventListener('click', () => { remember(); begin(); });
  }

  // ---- 구름 ----
  // 이 카메라로는 하늘이 화면에 안 들어온다(scenery.js 머리말 참조).
  // 화면 위쪽의 '하늘'은 아주 멀어서 하늘색이 된 땅이다. 그래서 구름은 캔버스 '위'에 얹는다.
  // 한 조각이 아니라 덩어리 대여섯 개를 겹쳐야 구름처럼 보인다.
  const box = $('#clouds');
  function makeClouds(n, kind) {
    box.innerHTML = '';
    document.body.dataset.wx = kind || 'clear';
    const windy = kind === 'wind', heavy = kind === 'rain' || kind === 'cloudy';
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'cloud';
      const w = (64 + Math.random() * 78) * (heavy ? 1.35 : 1);
      // 맨 위 띠 안에만. 더 내려오면 마당 위에 안개처럼 깔려 보인다.
      const top = (0.5 + Math.random() * 9).toFixed(1);
      c.style.cssText = `width:${w.toFixed(0)}px;height:${(w * 0.4).toFixed(0)}px;left:${(Math.random() * 116 - 8).toFixed(1)}%;top:${top}%;opacity:${((heavy ? 0.6 : 0.42) + Math.random() * 0.26).toFixed(2)}`;
      // 덩어리 대여섯 개를 겹쳐야 구름처럼 보인다
      const lumps = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < lumps; k++) {
        const b2 = document.createElement('i');
        const r = (26 + Math.random() * 24);                  // 지름 (구름 너비의 %)
        b2.style.cssText = `width:${r.toFixed(0)}%;padding-bottom:${r.toFixed(0)}%;left:${(k / lumps * 66 + Math.random() * 12).toFixed(0)}%;bottom:${(Math.random() * 22).toFixed(0)}%`;
        c.appendChild(b2);
      }
      box.appendChild(c);
      const drift = (30 + Math.random() * 60) * (windy ? 3.4 : 1);
      const dur = (110 + Math.random() * 130) / (windy ? 4.5 : 1);
      c.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${drift}px)` }],
        { duration: dur * 1000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    }
  }
  window.__tpClouds = makeClouds;
  const pending = window.__tpWx;
  makeClouds(pending ? pending.clouds : 7, pending ? pending.key : 'clear');

  // 궂은 날 마당 위에 얇게 덮이는 그늘 (투명도는 --wx-dim 이 정한다)
  if (!$('#wxdim')) { const dim = document.createElement('div'); dim.id = 'wxdim'; document.body.appendChild(dim); }

  // ---- 가만히 있으면 버튼이 사라진다 ----
  // 화면에 남는 것은 마당과 닭뿐. 손을 대면 다시 나타난다.
  // (참고한 햄스터 웹앱이 널리 퍼진 이유의 절반이 이 결정이었다.)
  let idleTimer = null;
  const HIDE_AFTER = 4000;
  function busy() {   // 메뉴를 보는 중이거나 꾸미는 중이면 숨기지 않는다
    return !!document.querySelector('#panel:not(.hidden)')
      || !!document.querySelector('#welcome');
  }
  function arm() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      // 아직 볼 일이 남았으면 숨기지 말고 '다시 재 본다' — 여기서 그냥 끝내면 영영 안 숨는다
      if (busy()) { arm(); return; }
      document.body.classList.add('uiIdle');
    }, HIDE_AFTER);
  }
  function wake() { document.body.classList.remove('uiIdle'); arm(); }
  for (const ev of ['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel']) {
    addEventListener(ev, wake, { passive: true });
  }
  wake();

  // 모바일: 두 손가락 확대 방지
  document.addEventListener('gesturestart', (e) => e.preventDefault());
})();
