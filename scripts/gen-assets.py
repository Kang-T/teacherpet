# 캐릭터 이미지 생성 (Hugging Face FLUX.1-schnell Space, 토큰: ~/.config/teacherpet/hf_token)
# 사용: python3 scripts/gen-assets.py [species...] [--poses idle,walk] [--seeds 777,778] [--out assets-src]
# 이미 있는 파일은 건너뛴다(재시작 가능). 결과: assets-src/<species>/<pose>_s<seed>.png (흰 배경 원본)
import sys, os, json, time, urllib.request, urllib.error, argparse
BACKEND = "zero"

TOKEN = open(os.path.expanduser("~/.config/teacherpet/hf_token")).read().strip().strip('"').strip("'")
HOST = "https://evalstate-flux1-schnell.hf.space/gradio_api"

BG = {"white": "isolated on plain pure white background",
      "green": "isolated on a plain solid bright green chroma key background, no shadow on the background",
      "magenta": "isolated on a plain solid bright magenta chroma key background, no shadow on the background"}
BGNAME = "white"
def STYLE_(): return ("3D rendered like a Pixar toy, big round glossy black eyes with highlights, soft fluffy texture, "
         "soft studio lighting, " + BG[BGNAME] + ", centered, full body, clean game sprite style")
SPECIES = {
    # 닭 한살이 4형태 (같은 식구로 보이게 색·눈·부리 묘사를 맞춘다)
    "chick": "Adorable chibi baby chick mascot, fluffy round yellow body, tiny orange beak, little orange feet, small wing nubs, a tiny tuft of down on its head",
    "young": "Adorable chibi young chicken (pullet) mascot, slightly taller than a chick, fluffy pale yellow-cream feathers with a few white feathers coming in, a tiny pink comb bud on its head, small orange beak, orange feet",
    "hen": "Adorable chibi plump white hen mascot, soft cream-white feathers, round body, small red comb and red wattle, small orange beak, orange feet, gentle motherly expression",
    "rooster": "Adorable chibi rooster mascot, cream-white body with golden neck feathers, a big bright red comb and red wattle, glossy dark green arched tail feathers, small orange beak, orange feet, proud cheerful expression",
    "hamster": "Adorable chibi golden hamster mascot, warm orange-cream fur, puffy cheeks, tiny pink nose, small round ears",
    "turtle": "Adorable chibi baby turtle mascot, round smooth green shell with soft pastel hexagon pattern, light green skin, stubby legs",
    "rabbit": "Adorable chibi white bunny mascot, long upright ears with soft pink inner ears, fluffy cotton tail, tiny pink nose",
    "cockatiel": "Adorable chibi cockatiel parrot mascot, light grey plump body, pale yellow head with a tall curved yellow crest, round orange cheek patches, small grey beak",
}
POSES = {
    "idle": "sitting upright calmly, three-quarter view facing right, relaxed happy expression",
    "walk": "walking to the right, three-quarter side view, mid-stride with one foot forward, cheerful",
    "sleep": "curled up sleeping on the floor, eyes gently closed, peaceful, side view",
    "eat": "sitting and holding its favorite food with both front paws, nibbling, cheeks full, front three-quarter view",
    "lookup": "looking up with mouth open expectantly, front three-quarter view, standing on hind legs",
    "happy": "jumping with joy in mid-air, arms raised, big smile, sparkling eyes, front view",
    "sad": "sitting slumped, droopy ears, big teary eyes, hungry and pouting, front view",
}
PROPS = {
    "coop": "A small cozy wooden chicken coop, pastel painted wood with a rounded doorway and a little ramp, soft red roof",
    "nest": "A small round straw nest, cozy and neat, empty",
    "feeder": "A small round red plastic chicken feeder tray filled with grain and seeds",
    "waterer": "A small red and white plastic chicken waterer (drinker) with a clear water reservoir",
    "basket": "A small woven wicker basket with a handle, containing a few cream-colored eggs",
    "house": "A small cozy pet house, pastel mint green with a rounded arched doorway and soft roof",
    "bowl": "A small round pastel pink ceramic pet food bowl filled with sunflower seeds and pellets",
    "bottle": "A small pet water bottle with a green cap, clear body filled with blue water and a metal drinking nozzle at the bottom, upright",
    "egg": "A cute round pastel cream egg with soft peach polka dots, sitting upright",
}
SPECIAL = {
    "chick": ("peck", "pecking seeds on the ground with beak down, side view"),
    "young": ("flap", "flapping its small wings excitedly while standing, front three-quarter view"),
    "hen": ("brood", "sitting down fluffed up on a straw nest, brooding eggs, calm closed-eye expression, side view"),
    "rooster": ("crow", "standing tall with chest out, head raised high and beak wide open crowing, side view"),
    "hamster": ("wheel", "running inside a small pastel blue hamster exercise wheel, side view, wheel fully visible"),
    "turtle": ("hide", "hiding inside its shell with only the shell visible and tiny eyes peeking out from the opening, side view"),
    "rabbit": ("hop", "big high hop in mid-air with ears streaming back, side view"),
    "cockatiel": ("fly", "flying with wings spread wide upward, side view, in mid-air"),
}
POSES_BIRD = dict(POSES, walk="hopping forward on the ground, side view, wings folded", eat="eating a seed held in one foot, front three-quarter view")

def gen_fal(prompt, seed, out):
    # HF 라우터 → fal.ai FLUX.1-schnell (HF 크레딧 과금, 장당 약 $0.003)
    body = {"prompt": prompt, "image_size": "square_hd", "num_inference_steps": 4, "seed": seed, "enable_safety_checker": False}
    req = urllib.request.Request("https://router.huggingface.co/fal-ai/fal-ai/flux/schnell", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        return "error " + e.read().decode()[:200]
    url = res["images"][0]["url"]
    open(out, "wb").write(urllib.request.urlopen(url, timeout=120).read())
    return "ok"

def gen(prompt, seed, out):
    if BACKEND == "fal": return gen_fal(prompt, seed, out)
    data = {"data": [prompt, seed, False, 1024, 1024, 4]}
    req = urllib.request.Request(f"{HOST}/call/infer", data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN})
    ev = json.load(urllib.request.urlopen(req, timeout=60))["event_id"]
    req = urllib.request.Request(f"{HOST}/call/infer/{ev}", headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=900) as r:
        for line in r:
            l = line.decode().strip()
            if l.startswith("event: error"): return "error"
            if l.startswith("data:") and l[5:].strip() not in ("", "null"):
                try: res = json.loads(l[5:])
                except Exception: continue
                if isinstance(res, list) and res and isinstance(res[0], dict) and res[0].get("url"):
                    req = urllib.request.Request(res[0]["url"], headers={"Authorization": "Bearer " + TOKEN})
                    open(out, "wb").write(urllib.request.urlopen(req, timeout=120).read())
                    return "ok"
    return "no-url"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("species", nargs="*", default=list(SPECIES))
    ap.add_argument("--poses", default="idle")
    ap.add_argument("--seeds", default="777")
    ap.add_argument("--out", default="assets-src")
    ap.add_argument("--bg", default="white", help="white | green | magenta (흰 동물은 green으로)")
    ap.add_argument("--backend", default="zero", help="zero(ZeroGPU 스페이스, 무료 할당량) | fal(HF 라우터→fal.ai, 크레딧 과금)")
    a = ap.parse_args()
    global BACKEND, BGNAME; BACKEND = a.backend; BGNAME = a.bg
    if a.bg != "white" and a.out == "assets-src": a.out = "assets-src-" + a.bg
    poses = a.poses.split(","); seeds = [int(s) for s in a.seeds.split(",")]
    if a.species == ["props"]:
        for name, desc in PROPS.items():
            out = os.path.join(a.out, "props", f"{name}_s{seeds[0]}.png")
            if os.path.exists(out): print("skip", out); continue
            os.makedirs(os.path.dirname(out), exist_ok=True)
            st = gen(f"{desc}, {STYLE_()}", seeds[0], out); print(f"props/{name}: {st}", flush=True); time.sleep(1)
        return
    for sp in a.species:
        table = POSES_BIRD if sp == "cockatiel" else POSES
        for pose in poses:
            for seed in seeds:
                out = os.path.join(a.out, sp, f"{pose}_s{seed}.png")
                if os.path.exists(out): print("skip", out); continue
                os.makedirs(os.path.dirname(out), exist_ok=True)
                if pose == "special": name, desc = SPECIAL[sp]; out = os.path.join(a.out, sp, f"{name}_s{seed}.png")
                else: desc = table[pose]
                if os.path.exists(out): print("skip", out); continue
                prompt = f"{SPECIES[sp]}, {desc}, {STYLE_()}"
                for attempt in range(3):
                    t0 = time.time()
                    try: st = gen(prompt, seed, out)
                    except Exception as e: st = f"exc {e}"
                    print(f"{sp}/{pose} s{seed}: {st} ({time.time()-t0:.0f}s)", flush=True)
                    if st == "ok": break
                    time.sleep(20 * (attempt + 1))
                time.sleep(2)
main()
