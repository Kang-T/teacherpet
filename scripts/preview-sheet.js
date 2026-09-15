// 개발용: 모든 캐릭터·동작을 한 장의 PNG로 뽑아 확인한다. node scripts/preview-sheet.js → build/sheet.png
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const SP = require('../src/renderer/sprites.js').TP_SPRITES;
function hex(c){const n=parseInt(c.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255,255];}
function png(w,h,rgba){const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);}
const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcT[n]=c>>>0;}
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))]);}
const s=6, cw=SP.W*s+12, chh=SP.H*s+12;
const anims={chick:['idle','walk','sleep','eat','peck','jump'],hamster:['idle','walk','sleep','eat','wheel','jump'],turtle:['idle','walk','sleep','eat','hide','jump'],rabbit:['idle','walk','sleep','eat','twitch','hop']};
const rows=Object.keys(anims); const cols=8;
const W=cw*cols, H=chh*(rows.length*2+1);
const buf=Buffer.alloc(W*H*4); const bg=hex('#DDEEFF'); for(let i=0;i<W*H;i++)buf.set(bg,i*4);
function at(ox,oy){return SP.painter((x,y,w,h,c)=>{const col=hex(c);for(let yy=0;yy<h*s;yy++)for(let xx=0;xx<w*s;xx++){const px=ox+x*s+xx,py=oy+y*s+yy;if(px>=0&&py>=0&&px<W&&py<H)buf.set(col,(py*W+px)*4);}});}
let r=0;
for(const sp of rows){ for(const f of [0,1]){ anims[sp].forEach((a,i)=>{ SP.SPECIES[sp].draw(at(6+i*cw,6+r*chh),{anim:a,f,t:0.1,blink:false,happy:a==='jump',adult:f===1,species:sp}); });
  SP.egg(at(6+6*cw,6+r*chh),{f,species:sp,crack:f===1}); SP.food[sp](at(6+7*cw,6+r*chh)); r++; } }
fs.writeFileSync(path.join(__dirname,'..','build','sheet.png'),png(W,H,buf)); console.log('sheet written');
