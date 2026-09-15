// 앱 아이콘(build/icon.png 512px)과 트레이 아이콘을 스프라이트 코드로 직접 만든다. 외부 라이브러리 없음.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const SP = require('../src/renderer/sprites.js').TP_SPRITES;

function hex(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const crc = (buf) => {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crc ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size, s, ox, oy, drawFn, bg, mono) {
  const buf = Buffer.alloc(size * size * 4);
  if (bg) {
    const c = hex(bg);
    for (let i = 0; i < size * size; i++) buf.set(c, i * 4);
  }
  const P = SP.painter((x, y, w, h, color) => {
    const c = mono ? [0, 0, 0, 255] : hex(color);
    for (let yy = 0; yy < h * s; yy++) for (let xx = 0; xx < w * s; xx++) {
      const px = ox + x * s + xx, py = oy + y * s + yy;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      buf.set(c, (py * size + px) * 4);
    }
  });
  drawFn(P);
  return png(size, size, buf);
}

const root = path.join(__dirname, '..');
const chick = SP.SPECIES.chick.draw;
const opts = { anim: 'idle', f: 0, t: 0, blink: false, happy: true, adult: false, species: 'chick' };

// 앱 아이콘: 둥근 노란 배경 위 병아리 (512px)
{
  const size = 512, s = 18;
  const buf = Buffer.alloc(size * size * 4);
  const bgc = hex('#FFE9A8'), edge = hex('#2B1B0E');
  const r = size / 2 - 8;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2, y - size / 2);
    if (d < r - 10) buf.set(bgc, (y * size + x) * 4);
    else if (d < r) buf.set(edge, (y * size + x) * 4);
  }
  const P = SP.painter((x, y, w, h, color) => {
    const c = hex(color);
    const ox = (size - SP.W * s) / 2, oy = (size - SP.H * s) / 2 + 10;
    for (let yy = 0; yy < h * s; yy++) for (let xx = 0; xx < w * s; xx++) {
      const px = Math.round(ox + x * s + xx), py = Math.round(oy + y * s + yy);
      if (px >= 0 && py >= 0 && px < size && py < size) buf.set(c, (py * size + px) * 4);
    }
  });
  chick(P, opts);
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), png(size, size, buf));
}
// 트레이 (윈도우: 컬러 32px / 맥: 검정 실루엣 템플릿 22px)
fs.mkdirSync(path.join(root, 'src', 'renderer', 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'renderer', 'assets', 'tray.png'), render(32, 1, 4, 8, (P) => chick(P, opts)));
fs.writeFileSync(path.join(root, 'src', 'renderer', 'assets', 'trayTemplate.png'), render(22, 1, -1, 1, (P) => chick(P, opts), null, true));
fs.writeFileSync(path.join(root, 'src', 'renderer', 'assets', 'trayTemplate@2x.png'), render(44, 2, -2, 2, (P) => chick(P, opts), null, true));
console.log('icons written');
