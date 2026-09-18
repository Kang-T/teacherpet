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
    if (!confirm('이 기기에 저장된 닭과 기록을 모두 지웁니다.\n되돌릴 수 없어요.\n\n먼저 [내보내기]로 저장해 두시겠어요?\n\n확인 = 계속 진행, 취소 = 그만두기')) return;
    if (!confirm('정말 지울까요?\n\n닭, 이름, 돌본 기록, 설정이 모두 사라집니다.')) return;
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
      if (!confirm(`지난 농장의 닭 ${prev.n}마리가 사라집니다.\n정말 새로 시작할까요?`)) return;
      // 지우는 일은 앱이 한다. 여기서 지우고 새로고침하면, 새로고침이 끝나기 전에
      // 앱의 3초 자동 저장이 한 번 더 돌아 방금 지운 농장이 되살아난다.
      if (window.__tpWipe) { window.__tpWipe(); return; }
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('teacherpet.')) localStorage.removeItem(k); } catch (e) {}
      location.reload();
    });
  } else if (seen || !card) {
    // 환영 카드가 사라지는 순간 = 할머니 이야기가 시작되는 순간.
    // 여기서 알리지 않으면 이미 본 사람은 이야기가 영영 시작되지 않는다.
    begin();
  } else {
    $('#wbStart').addEventListener('click', () => { remember(); begin(); });
  }

  // ---- 구름 몇 조각 ----
  const box = $('#clouds');
  for (let i = 0; i < 7; i++) {
    const c = document.createElement('div');
    c.className = 'cloud';
    const w = 60 + Math.random() * 130, h = w * (0.28 + Math.random() * 0.14);
    // 구름은 하늘 띠 안에만 (--horizon 은 화면 비율에 따라 바뀐다)
    const band = (0.06 + Math.random() * 0.62).toFixed(2);
    c.style.cssText = `width:${w}px;height:${h}px;left:${Math.random() * 100}%;top:calc(var(--horizon, 33%) * ${band});opacity:${0.5 + Math.random() * 0.4}`;
    box.appendChild(c);
    const drift = 40 + Math.random() * 70, dur = 90 + Math.random() * 120;
    c.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${drift}px)` }],
      { duration: dur * 1000, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }

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
