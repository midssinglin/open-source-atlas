# 擴充收錄的共用工具：把 BATCH 清單附加到 data/curated.json
import json, re, sys
PATH = "/home/claude/open-source-atlas/data/curated.json"
URL = {"github": "https://github.com/{}", "gitlab": "https://gitlab.com/{}", "codeberg": "https://codeberg.org/{}", "gitea": "https://gitea.com/{}", "bitbucket": "https://bitbucket.org/{}"}
PFX = {"github": "gh", "gitlab": "gl", "codeberg": "cb", "gitea": "gt", "bitbucket": "bb"}

def add_batch(batch):
    doc = json.load(open(PATH))
    have = {p["id"] for p in doc["projects"]}
    added = 0
    for e in batch:
        src, n = e["src"], e["n"]
        pid = PFX[src] + "-" + re.sub(r"[^a-zA-Z0-9]+", "-", n).lower().strip("-")
        if pid in have:
            print("skip dup", pid); continue
        have.add(pid)
        full = dict(id=pid, src=src, n=n, url=URL[src].format(n), cat=e["cat"], diff=e["diff"],
                    modes=e["modes"], ov=e["ov"], feat=e["feat"], tasks=e["tasks"],
                    sw=e.get("sw", []), hw=e.get("hw", []), he=e.get("he", False), os=e.get("os", []),
                    ins=e.get("ins", []), insN=e.get("insN"), r=e.get("r", []), q=None, rm=True,
                    lic=e.get("lic"), home=e.get("home"))
        doc["projects"].append(full)
        added += 1
    json.dump(doc, open(PATH, "w"), ensure_ascii=False, indent=1)
    print(f"added {added}, total {len(doc['projects'])}")
