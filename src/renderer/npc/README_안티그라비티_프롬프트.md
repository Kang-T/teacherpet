# 할머니 일러스트 — Antigravity 생성 안내

이 폴더(`src/renderer/npc/`)에 **PNG 파일을 그대로 떨어뜨려 주시면** 제가 코드에 연결합니다.

## 만들어 주실 파일 (4개)

| 파일 이름 | 무엇 | 언제 쓰나 |
|---|---|---|
| `granny.png` | 할머니 — 평소 표정 | 대부분의 대사 |
| `granny_smile.png` | 할머니 — 웃는 표정 | 칭찬·성장·부화 |
| `granny_worry.png` | 할머니 — 걱정스러운 표정 | 아플 때·방치했을 때 |
| `kid_back.png` | 아이 뒷모습 (선택) | 첫 대화 장면에서 할머니를 마주 보는 연출 |

**규격 (네 파일 공통)**
- **512 × 512 px, 배경 투명 PNG**
- 인물은 **가슴 위까지**(bust). 머리 꼭대기와 프레임 위쪽 사이에 약간 여백
- 얼굴이 **살짝 오른쪽을 보는 3/4 각도** (화면 왼쪽에 놓고 오른쪽 대사창을 바라보게 됩니다)
- 표정 3종은 **같은 인물·같은 각도·같은 옷**이어야 합니다. 표정만 달라야 해요

---

## 프롬프트 (그대로 복사해서 쓰세요)

### 1) 평소 표정 — `granny.png`

```
A warm, kind Korean grandmother character portrait for a children's educational
farm game. Bust shot from the chest up, three-quarter view facing slightly to
the right. Soft rounded shapes, no harsh outlines, gentle low-saturation pastel
palette (warm cream, dusty rose, soft sage green, muted terracotta). Flat
stylized 3D look with soft ambient shading — like a friendly claymation or a
soft-shaded Pixar-lite render, NOT photorealistic, NOT anime.

She has silver-grey hair tied back in a small neat bun, warm brown eyes with
gentle crow's feet, a calm closed-mouth smile. She wears a simple cream-coloured
traditional Korean work jacket with a soft sage apron over it, and a light
patterned headscarf. Rosy cheeks. Kind, unhurried expression — like someone who
has raised chickens her whole life.

Clean transparent background. Centred composition. Soft rim light from the upper
left. 512x512.
```

### 2) 웃는 표정 — `granny_smile.png`

위 프롬프트에서 표정 문장만 바꾸세요.
```
...a warm open-mouthed laugh, eyes crinkled almost shut with delight, head
tilted very slightly. Same character, same outfit, same angle, same palette.
```

### 3) 걱정스러운 표정 — `granny_worry.png`

```
...gently concerned expression, eyebrows drawn slightly together, mouth a small
soft line, one hand raised near her chin. Not angry, not sad — the look of
someone quietly worried about a small animal. Same character, same outfit,
same angle, same palette.
```

### 4) 아이 뒷모습 (선택) — `kid_back.png`

```
The back view of a young Korean child (about 9 years old) standing and looking
up at someone, seen from behind and slightly to the side. Only the back of the
head, shoulders and upper back are visible. Short dark hair, a simple
mustard-yellow shirt. Same soft stylized 3D look, same low-saturation pastel
palette, soft shading, no outlines. Clean transparent background. 512x512.
```

---

## 확인해 주실 것

- [ ] 배경이 **정말 투명**한가 (흰 배경이면 대화창에 흰 네모가 생깁니다)
- [ ] 표정 3종의 **옷·머리·각도가 같은가**
- [ ] 파일 하나가 **300KB 이하**인가 (넘으면 제가 줄이겠습니다)
- [ ] 얼굴이 프레임에 꽉 차지 않고 **위아래 여백**이 조금 있는가

## 다 되면

이 폴더에 넣어 두시고 "할머니 그림 넣었어" 라고만 알려 주세요.
제가 대화창에 연결하고, 상황에 맞는 표정이 나오도록 붙이겠습니다.
그림이 없는 동안에는 임시 그림이 대신 나옵니다 — 넣으시면 자동으로 바뀝니다.

---
---

# 2차 — 움직이는 것처럼 보이게 (2026-09-18)

첫 4장 잘 받았습니다. 이제 **두 장만 더 있으면 할머니가 말하는 것처럼 보입니다.**

애니메이션 파일(GIF·영상)은 필요 없습니다. **정지 그림을 바꿔 끼워서** 만듭니다.
코드는 이미 넣어 뒀으니, 파일만 이 폴더에 떨어뜨리면 자동으로 살아납니다.
없으면 지금처럼 정지 그림으로 조용히 동작합니다.

## 꼭 필요한 2장

| 파일 | 무엇 | 어떻게 쓰이나 |
|---|---|---|
| `granny_blink.png` | **눈만 감은** 할머니 | 4초쯤마다 0.13초 깜빡입니다 |
| `granny_talk.png` | **입만 벌린** 할머니 | 말하는 동안 0.17초 간격으로 번갈아 나옵니다 |

> ⚠️ **가장 중요** — 이 두 장은 `granny.png` 와 **완전히 같은 그림**이어야 합니다.
> 머리·옷·각도·크기·빛이 1픽셀이라도 달라지면 깜빡일 때 얼굴이 덜컥거립니다.
> **눈만**, **입만** 달라야 합니다.

### 가장 확실한 방법
Antigravity에서 **`granny.png` 를 올려 놓고 "이 그림에서 눈만 감게 해 줘"**
(image-to-image / 편집)로 만드는 것이 새로 생성하는 것보다 훨씬 잘 맞습니다.
새로 생성하면 거의 확실히 얼굴이 달라집니다.

### 프롬프트 (편집용)
```
Same image, identical in every way — same character, same pose, same outfit,
same lighting, same size and position. Change ONLY the eyes: both eyes gently
closed, as in a natural blink. Soft curved closed eyelids with the same warm
expression. Everything else pixel-identical. Transparent background.
```
```
Same image, identical in every way — same character, same pose, same outfit,
same lighting, same size and position. Change ONLY the mouth: mouth open in a
relaxed mid-speech shape, as if saying "ah". Same warm expression, same eyes.
Everything else pixel-identical. Transparent background.
```

## 있으면 좋은 것 (급하지 않음)

| 파일 | 언제 쓸까 |
|---|---|
| `granny_proud.png` | 병아리가 어린닭이 되었을 때, 첫 알을 낳았을 때 — 대견해하는 얼굴 |
| `granny_think.png` | 무언가 알려 줄 때 — 한 손을 턱에 대고 생각하는 얼굴 |
| `kid_back_happy.png` | 아이가 폴짝 뛰는 뒷모습 — 첫 병아리를 받는 순간 |

프롬프트는 1차 문서의 것을 그대로 쓰되 표정 문장만 바꾸면 됩니다.

## 규격 (1차와 동일)
512×512, 배경 투명 PNG. 용량은 신경 쓰지 마세요 — 제가 줄입니다.
(1차 때 780KB → 223KB로 줄였고 화질 차이는 눈에 안 보입니다.)
