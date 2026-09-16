# 캐릭터 이미지 생성 (Hugging Face FLUX.1-schnell Space, 토큰: ~/.config/teacherpet/hf_token)
# 사용: python3 scripts/gen-assets.py [species...] [--poses idle,walk] [--seeds 777,778] [--out assets-src]
# 이미 있는 파일은 건너뛴다(재시작 가능). 결과: assets-src/<species>/<pose>_s<seed>.png (흰 배경 원본)
import sys, os, json, time, urllib.request, argparse

TOKEN = open(os.path.expanduser("~/.config/teacherpet/hf_token")).read().strip().strip('"').strip("'")
HOST = "https://evalstate-flux1-schnell.hf.space/gradio_api"

STYLE = ("3D rendered like a Pixar toy, big round glossy black eyes with highlights, soft fluffy texture, "
         "soft studio lighting, subtle soft shadow under body, isolated on plain pure white background, "
         "centered, full body, clean game sprite style")
SPECIES = {
    "hamster": "Adorable chibi golden hamster mascot, warm orange-cream fur, puffy cheeks, tiny pink nose, small round ears",
    "chick": "Adorable chibi baby chick mascot, fluffy round yellow body, tiny orange beak, little orange feet, small wing nubs, a tiny tuft of down on its head",
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
SPECIAL = {
    "hamster": ("wheel", "running inside a small pastel blue hamster exercise wheel, side view, wheel fully visible"),
    "chick": ("peck", "pecking seeds on the ground with beak down, side view"),
    "turtle": ("hide", "hiding inside its shell with only the shell visible and tiny eyes peeking out from the opening, side view"),
    "rabbit": ("hop", "big high hop in mid-air with ears streaming back, side view"),
    "cockatiel": ("fly", "flying with wings spread wide upward, side view, in mid-air"),
}
POSES_BIRD = dict(POSES, walk="hopping forward on the ground, side view, wings folded", eat="eating a seed held in one foot, front three-quarter view")

def gen(prompt, seed, out):
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
    a = ap.parse_args()
    poses = a.poses.split(","); seeds = [int(s) for s in a.seeds.split(",")]
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
                prompt = f"{SPECIES[sp]}, {desc}, {STYLE}"
                for attempt in range(3):
                    t0 = time.time()
                    try: st = gen(prompt, seed, out)
                    except Exception as e: st = f"exc {e}"
                    print(f"{sp}/{pose} s{seed}: {st} ({time.time()-t0:.0f}s)", flush=True)
                    if st == "ok": break
                    time.sleep(20 * (attempt + 1))
                time.sleep(2)
main()
