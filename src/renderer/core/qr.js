// QR 코드 만들기 — 바이트 모드, 오류정정 M, 1~20판(version).
// 왜 직접 넣었나: 개인정보 때문에 CSP 가 바깥 주소를 전부 막아 두었다(connect-src 'none').
// 그래서 인터넷에서 QR 라이브러리를 불러올 수 없다. 필요한 만큼만 여기에 담는다.
// 읽는 쪽은 만들지 않았다 — 카메라를 켜는 순간 개인정보 이야기가 완전히 달라진다.
(function (g) {
  const TP = (g.TP = g.TP || {});

  // ---- GF(256) — 오류정정 계산에 쓰는 셈판 ----
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  function genPoly(n) {                    // (x+a^0)(x+a^1)...(x+a^(n-1))
    let p = [1];
    for (let i = 0; i < n; i++) {
      const q = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= mul(p[j], EXP[i]); }
      p = q;
    }
    return p;
  }
  function ecBytes(data, n) {
    const gp = genPoly(n), res = new Uint8Array(data.length + n);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const f = res[i];
      if (!f) continue;
      for (let j = 0; j < gp.length; j++) res[i + j] ^= mul(gp[j], f);
    }
    return res.slice(data.length);
  }

  // ---- 판(version)별 묶음표 — 오류정정 M 만 ----
  // [묶음당 오류정정 글자수, 1군 묶음수, 1군 자료수, 2군 묶음수, 2군 자료수]
  const BLOCKS = {
    1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44], 11: [30, 1, 50, 4, 51], 12: [22, 6, 36, 2, 37],
    13: [22, 8, 37, 1, 38], 14: [24, 4, 40, 5, 41], 15: [24, 5, 41, 5, 42], 16: [28, 7, 45, 3, 46],
    17: [28, 10, 46, 1, 47], 18: [26, 9, 43, 4, 44], 19: [26, 3, 44, 11, 45], 20: [26, 3, 41, 13, 42],
  };
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38],
    8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58],
    13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70], 16: [6, 26, 50, 74],
    17: [6, 30, 54, 78], 18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90],
  };
  const dataCount = (v) => { const b = BLOCKS[v]; return b[1] * b[2] + b[3] * b[4]; };

  // ---- 자료를 비트로 ----
  function bitsFor(bytes, v) {
    const out = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) out.push((val >> i) & 1); };
    put(0b0100, 4);                                  // 바이트 모드
    put(bytes.length, v <= 9 ? 8 : 16);              // 글자 수
    for (const b of bytes) put(b, 8);
    const cap = dataCount(v) * 8;
    for (let i = 0; i < 4 && out.length < cap; i++) out.push(0);   // 마침 표시
    while (out.length % 8) out.push(0);
    const pad = [0xEC, 0x11];
    for (let i = 0; out.length < cap; i++) put(pad[i % 2], 8);
    const cw = new Uint8Array(out.length / 8);
    for (let i = 0; i < cw.length; i++) { let x = 0; for (let j = 0; j < 8; j++) x = (x << 1) | out[i * 8 + j]; cw[i] = x; }
    return cw;
  }

  // 묶음을 나눠 오류정정을 붙이고, 번갈아 가며 다시 엮는다
  function interleave(cw, v) {
    const [ec, n1, d1, n2, d2] = BLOCKS[v];
    const blocks = [], ecs = [];
    let at = 0;
    for (let i = 0; i < n1 + n2; i++) {
      const len = i < n1 ? d1 : d2;
      const blk = cw.slice(at, at + len); at += len;
      blocks.push(blk); ecs.push(ecBytes(blk, ec));
    }
    const out = [];
    for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
    return out;
  }

  // ---- 판 그리기 ----
  function skeleton(v) {
    const n = v * 4 + 17;
    const m = [], used = [];
    for (let i = 0; i < n; i++) { m.push(new Array(n).fill(0)); used.push(new Array(n).fill(0)); }
    const set = (r, c, val) => { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = val; used[r][c] = 1; } };
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const inSq = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const on = inSq && ((r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(r0 + r, c0 + c, on ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }
    for (const r of ALIGN[v]) for (const c of ALIGN[v]) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        set(r + dr, c + dc, on ? 1 : 0);
      }
    }
    set(n - 8, 8, 1);                                  // 늘 검은 칸
    // 형식 자리 비워 두기 — 6번은 건너뛴다. (6,8)·(8,6) 은 시간줄이라 여기서 지우면 안 된다.
    for (let i = 0; i < 9; i++) { if (i === 6) continue; set(8, i, 0); set(i, 8, 0); }
    for (let i = 0; i < 8; i++) { set(8, n - 1 - i, 0); set(n - 1 - i, 8, 0); }
    if (v >= 7) {
      let d = v;
      for (let i = 0; i < 12; i++) { d = (d << 1) ^ ((d >> 11) * 0x1F25); }
      const bits = ((v << 12) | d) >>> 0;
      for (let i = 0; i < 18; i++) {
        const b = (bits >> i) & 1;
        set(Math.floor(i / 3), n - 11 + (i % 3), b);
        set(n - 11 + (i % 3), Math.floor(i / 3), b);
      }
    }
    return { n, m, used };
  }

  function place(sk, bytes) {
    const { n, m, used } = sk;
    let bit = 0;
    const total = bytes.length * 8;
    const next = () => (bit < total ? (bytes[bit >> 3] >> (7 - (bit & 7))) & 1 : 0);
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                            // 세로 시간줄은 건너뛴다
      for (let i = 0; i < n; i++) {
        const up = ((n - 1 - col) >> 1) % 2 === 0;
        const row = up ? n - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (used[row][c]) continue;
          m[row][c] = next(); bit++;
        }
      }
    }
  }

  const MASK = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function formatBits(mask) {
    const data = (0b00 << 3) | mask;                   // 00 = 오류정정 M
    let d = data;
    for (let i = 0; i < 10; i++) d = (d << 1) ^ ((d >> 9) * 0x537);
    return (((data << 10) | d) ^ 0x5412) >>> 0;
  }
  function putFormat(m, n, mask) {
    const f = formatBits(mask);
    for (let i = 0; i < 15; i++) {
      const b = (f >> (14 - i)) & 1;      // 위쪽 비트부터 놓는다
      if (i < 6) m[8][i] = b; else if (i < 8) m[8][i + 1] = b;
      else if (i === 8) m[7][8] = b; else m[14 - i][8] = b;
      if (i < 8) m[n - 1 - i][8] = b; else m[8][n - 15 + i] = b;
    }
    m[n - 8][8] = 1;
  }

  function penalty(m, n) {
    let p = 0, dark = 0;
    const run = (get) => {
      for (let a = 0; a < n; a++) {
        let last = -1, len = 0;
        for (let b = 0; b < n; b++) {
          const v = get(a, b);
          if (v === last) { len++; if (len === 5) p += 3; else if (len > 5) p += 1; }
          else { last = v; len = 1; }
        }
      }
    };
    run((a, b) => m[a][b]); run((a, b) => m[b][a]);
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const hit = (get, a, b) => { for (let i = 0; i < 11; i++) if (get(a, b + i) !== pat[i]) return false; return true; };
    for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) {
      if (hit((x, y) => m[x][y], a, b)) p += 40;
      if (hit((x, y) => m[y][x], a, b)) p += 40;
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  }

  // ---- 바깥에서 쓰는 것 ----
  // make(text) → { n, rows:[[0|1,...], ...] }   못 담으면 null
  function make(text, forceMask) {
    const bytes = new TextEncoder().encode(String(text));
    let v = 0;
    for (let i = 1; i <= 20; i++) {
      const head = 4 + (i <= 9 ? 8 : 16);
      if (bytes.length * 8 + head <= dataCount(i) * 8) { v = i; break; }
    }
    if (!v) return null;                               // 20판으로도 안 담기는 글
    const stream = interleave(bitsFor(bytes, v), v);
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      if (forceMask !== undefined && mask !== forceMask) continue;   // 검사용
      const sk = skeleton(v);
      place(sk, stream);
      for (let r = 0; r < sk.n; r++) for (let c = 0; c < sk.n; c++) {
        if (!sk.used[r][c] && MASK[mask](r, c)) sk.m[r][c] ^= 1;
      }
      putFormat(sk.m, sk.n, mask);
      const p = penalty(sk.m, sk.n);
      if (!best || p < best.p) best = { p, n: sk.n, rows: sk.m };
    }
    return { n: best.n, rows: best.rows };
  }

  // 그림으로 — 흰 테두리(quiet zone) 4칸은 규격이다. 없으면 잘 안 읽힌다.
  function svg(text, px) {
    const q = make(text);
    if (!q) return '';
    const pad = 4, side = q.n + pad * 2;
    let d = '';
    for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) {
      if (q.rows[r][c]) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${px || 180}" height="${px || 180}" shape-rendering="crispEdges">`
      + `<rect width="${side}" height="${side}" fill="#fff"/><path d="${d}" fill="#1B1B1B"/></svg>`;
  }

  TP.qr = { make, svg };
})(typeof window !== 'undefined' ? window : module.exports);
