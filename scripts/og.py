"""產生社群分享預覽圖（1200x630）：_site/og/site.png 與每個專案的 _site/og/<id>.png
需要 Pillow 與 Noto Sans CJK 字型（GitHub Actions 中由 workflow 安裝 fonts-noto-cjk）。"""
import json, os, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "_site", "og")
os.makedirs(OUT, exist_ok=True)

import glob
DIRS = ["/usr/share/fonts/opentype/noto", "/usr/share/fonts/noto-cjk", "/usr/share/fonts/truetype/noto", "/usr/share/fonts"]

def find_font(weight):
    # 優先找該字重的獨立檔，找不到就退回 Regular / 任一 Noto Sans CJK 檔
    pats = [f"NotoSansCJK-{weight}.ttc", f"NotoSansCJK-{weight}.otf", f"NotoSansCJK*-{weight}.*",
            "NotoSansCJK-Regular.ttc", "NotoSansCJK*.ttc", "NotoSansCJK*.otf", "NotoSansCJK*.ttf"]
    for d in DIRS:
        for pat in pats:
            hits = sorted(glob.glob(os.path.join(d, "**", pat), recursive=True))
            if hits:
                return hits[0]
    return None

def tc_index(path):
    # 在 ttc collection 中找繁體中文（TC）那一個 face；找不到就用 0
    try:
        from PIL import ImageFont as IF
        for i in range(12):
            try:
                f = IF.truetype(path, 20, index=i)
                name = " ".join(str(x) for x in f.getname())
                if "TC" in name or "Traditional" in name:
                    return i
            except Exception:
                break
    except Exception:
        pass
    return 0

_CACHE = {}
def font(weight, size):
    path = find_font(weight)
    if not path:
        sys.exit("找不到 Noto Sans CJK 字型")
    if path not in _CACHE:
        _CACHE[path] = tc_index(path)
    return ImageFont.truetype(path, size, index=_CACHE[path])

BG, INK, MUTED, ACCENT, LINE = "#F1F4EF", "#17201C", "#5A6862", "#0B6E5F", "#D5DDD6"
PLAT = {"github": ("GitHub", "#24292F"), "gitlab": ("GitLab", "#D9480F"), "codeberg": ("Codeberg", "#2378C8"), "gitea": ("Gitea", "#5E8F1F"), "bitbucket": ("Bitbucket", "#1F5FD1")}

def wrap(draw, text, f, width):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=f) > width and ch not in "，。、；：！？）」』…,.":
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur: lines.append(cur)
    return lines

def card(path, eyebrow, title, body, plat=None):
    im = Image.new("RGB", (1200, 630), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1200, 14], fill=ACCENT)
    d.text((72, 64), eyebrow, font=font("Medium", 30), fill=MUTED)
    tf = font("Bold", 64)
    tl = wrap(d, title, tf, 1056)[:2]
    y = 120
    for line in tl:
        d.text((72, y), line, font=tf, fill=INK); y += 82
    bf = font("Regular", 32)
    for line in wrap(d, body, bf, 1056)[:4]:
        d.text((72, y + 20), line, font=bf, fill=INK); y += 48
    d.line([72, 540, 1128, 540], fill=LINE, width=2)
    d.text((72, 560), "開源實作圖鑑", font=font("Bold", 30), fill=ACCENT)
    if plat:
        name, color = PLAT[plat]
        f = font("Medium", 26)
        w = d.textlength(name, font=f)
        d.rounded_rectangle([1128 - w - 36, 556, 1128, 598], radius=10, fill=color)
        d.text((1128 - w - 18, 560), name, font=f, fill="#FFFFFF")
    im.save(path, optimize=True)

data = json.load(open(os.path.join(ROOT, "data", "projects.json"), encoding="utf-8"))
card(os.path.join(OUT, "site.png"), "GitHub · GitLab · Codeberg · Gitea · Bitbucket", "開源實作圖鑑",
     f"精選 {len(data['projects'])} 個值得學習、部署與動手練習的開源專案，附系統需求、學習路徑與安全評估。")
for p in data["projects"]:
    card(os.path.join(OUT, f"{p['id']}.png"), f"{p['cat']} · {p['diff']}", p["n"], p["ov"], p["src"])
print("og images:", len(data["projects"]) + 1)
