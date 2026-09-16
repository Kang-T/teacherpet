# 흰 배경 이미지 → 투명 PNG (가장자리에서 흰색·회색 그림자 영역을 채워 나가며 알파 계산). python cutout.py in.png out.png
import sys, numpy as np
from PIL import Image
from collections import deque
args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = [a for a in sys.argv[1:] if a.startswith("--")]
src, dst = args[0], args[1]
keep_shadow = "--shadow" in opts
size = next((int(o.split("=")[1]) for o in opts if o.startswith("--size=")), 0)
im = np.asarray(Image.open(src).convert("RGB")).astype(np.int32)
h, w, _ = im.shape
mx = im.max(axis=2); mn = im.min(axis=2)
sat = mx - mn                   # 채도 (배경·그림자는 낮음)
lum = im.mean(axis=2)
bgish = (sat < 26) & (lum > 120)   # 흰색~밝은 회색(그림자 포함)
# 가장자리에서 연결된 배경 영역만 채움 (몸 안의 크림색 배는 남김)
mask = np.zeros((h, w), bool); q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bgish[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if bgish[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for ny, nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
        if 0 <= ny < h and 0 <= nx < w and bgish[ny, nx] and not mask[ny, nx]:
            mask[ny, nx] = True; q.append((ny, nx))
out = np.zeros((h, w, 4), np.uint8)
out[..., :3] = im
out[..., 3] = 255
# 배경 영역: 그림자는 반투명 검정으로, 흰색은 완전 투명
shadow = np.clip((255 - lum) / 255 * 1.6, 0, 1)   # 밝기 기반 그림자 진하기
out[mask, 0:3] = 30
out[mask, 3] = (shadow[mask] * 255).astype(np.uint8) if keep_shadow else 0
# 가장자리 흰 테두리 제거: 배경과 맞닿은 3px 안쪽 전경 픽셀은 '흰색 위에 합성된 것'으로 보고 알파를 되돌린다
edge = np.zeros_like(mask)
m = mask.copy()
for _ in range(3):
    grown = m.copy()
    grown[1:, :] |= m[:-1, :]; grown[:-1, :] |= m[1:, :]; grown[:, 1:] |= m[:, :-1]; grown[:, :-1] |= m[:, 1:]
    edge |= grown & ~mask; m = grown
ys, xs = np.where(edge)
for y, x in zip(ys, xs):
    r, g, b = im[y, x]
    a = min(1.0, max(0.0, (255 - min(r, g, b)) / 140.0))   # 밝을수록 투명
    if a <= 0.02: out[y, x] = (0, 0, 0, 0); continue
    out[y, x, 0:3] = [int(max(0, min(255, (c - (1 - a) * 255) / a))) for c in (r, g, b)]
    out[y, x, 3] = int(a * 255)
# 경계 부드럽게: 배경과 맞닿은 전경 픽셀의 흰 기운 제거 (1px 링)
img = Image.fromarray(out, "RGBA")
# 여백 자르기 (알파 기준) + 아래쪽 그림자는 남김
a = np.asarray(img)[..., 3]
ys, xs = np.where(a > 8)
img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
if size:
    r = size / max(img.size); img = img.resize((max(1, round(img.size[0] * r)), max(1, round(img.size[1] * r))), Image.LANCZOS)
img.save(dst, optimize=True); print("saved", dst, img.size)
