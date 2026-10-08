"""產生社群分享預覽圖（1200x630）：_site/og/site.png 與每個專案的 _site/og/<id>.png
需要 Pillow 與 Noto Sans CJK 字型（GitHub Actions 中由 workflow 安裝 fonts-noto-cjk）。"""
import json, os, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "_site", "og")
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-{w}.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-{w}.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-{w}.ttc",
]
def font(weight, size):
    for c in FONT_CANDIDATES:
        p = c.format(w=weight)
        if os.path.exists(p):
            return ImageFont.truetype(p, size, index=2)  # index 2 = TC
    sys.exit("找不到 Noto Sans CJK 字型")

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
