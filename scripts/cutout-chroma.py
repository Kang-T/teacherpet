# 초록(또는 마젠타) 크로마키 배경 이미지 → 투명 PNG. python scripts/cutout-chroma.py in.png out.png [--size=512] [--key=green|magenta]
import sys, numpy as np
from PIL import Image
args = [a for a in sys.argv[1:] if not a.startswith("--")]; opts = [a for a in sys.argv[1:] if a.startswith("--")]
src, dst = args[0], args[1]
size = next((int(o.split("=")[1]) for o in opts if o.startswith("--size=")), 0)
key = next((o.split("=")[1] for o in opts if o.startswith("--key=")), "green")
im = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
if key == "green":
    # 초록 우세도: g가 r,b보다 얼마나 큰가. 0 = 전경, 큰 값 = 배경
    dom = g - np.maximum(r, b)
else:
    dom = (r + b) / 2 - g
lo, hi = 10.0, 70.0                       # 이 사이에서 알파가 1→0으로 부드럽게
alpha = np.clip(1 - (dom - lo) / (hi - lo), 0, 1)
# 스필 제거: 남은 초록 기운을 이웃 채널 최대값으로 눌러 준다
out = im.copy()
if key == "green":
    spill = np.maximum(0, g - np.maximum(r, b)); out[..., 1] = g - spill * 0.8
else:
    spill = np.maximum(0, (r + b) / 2 - g); out[..., 0] = r - spill * 0.8; out[..., 2] = b - spill * 0.8
rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
img = Image.fromarray(rgba, "RGBA")
a = np.asarray(img)[..., 3]; ys, xs = np.where(a > 8)
img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
if size:
    k = size / max(img.size); img = img.resize((max(1, round(img.size[0] * k)), max(1, round(img.size[1] * k))), Image.LANCZOS)
img.save(dst, optimize=True); print("saved", dst, img.size)
