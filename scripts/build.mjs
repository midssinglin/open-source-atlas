// 產生部署用的 _site/：網站檔案、每個專案的靜態 SEO 頁（p/<id>/）、docker-compose 檔、sitemap 與 robots.txt
// 執行：SITE_URL=https://xxx.github.io/repo/ node scripts/build.mjs
import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("_site/", ROOT);
const SITE = (process.env.SITE_URL || "https://midssinglin.github.io/open-source-atlas/").replace(/\/?$/, "/");
const read = (p) => readFile(new URL(p, ROOT), "utf8");
const readJ = async (p, d) => { try { return JSON.parse(await read(p)); } catch { return d; } };
const out = async (p, c) => { const u = new URL(p, OUT); await mkdir(new URL("./", u), { recursive: true }); await writeFile(u, c); };

// 在 Node 中載入 core.js
const ctx = { globalThis: {} };
vm.createContext(ctx);
vm.runInContext(await read("core.js"), ctx);
const { SRC, MODES, LIC, licKind, fmt, esc, assess, composeFor, growth } = ctx.globalThis.Atlas;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await out("index.html", (await read("index.html")).replaceAll("%SITE%", SITE));
for (const f of ["core.js", "app.js"]) await out(f, await read(f));
await cp(new URL("data/", ROOT), new URL("data/", OUT), { recursive: true });
await out(".nojekyll", "");

const DATA = await readJ("data/projects.json", { projects: [] });
const SEC = await readJ("data/security.json", { projects: {} });
const HIST = await readJ("data/history.json", {});
const TODAY = new Date().toISOString().slice(0, 10);

const page = (p) => {
  p.sec = SEC.projects?.[p.id] || null;
  const a = assess(p, TODAY);
  const g = growth(HIST[p.id]);
  const i = p.n.lastIndexOf("/");
  const url = `${SITE}p/${p.id}/`;
  const title = `${p.n.slice(i + 1)}：${p.cat}開源專案介紹、安裝與安全評估 | 開源實作圖鑑`;
  const desc = p.ov.length > 150 ? p.ov.slice(0, 148) + "…" : p.ov;
  const ld = {
    "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: p.n.slice(i + 1), description: p.ov,
    codeRepository: p.url, programmingLanguage: p.lang || undefined, license: p.lic && p.lic !== "NOASSERTION" ? `https://spdx.org/licenses/${p.lic}.html` : undefined,
    author: { "@type": "Organization", name: p.n.slice(0, i) }, url, keywords: [p.cat, ...(p.top || [])].join(", "),
    dateModified: p.p || undefined, inLanguage: "zh-Hant",
  };
  const li = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>文件未特別列出。</p>");
  return `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="開源實作圖鑑">
<meta property="og:title" content="${esc(p.n)} · ${esc(p.cat)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}og/${p.id}.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>
:root{--bg:#F1F4EF;--surface:#fff;--ink:#17201C;--muted:#5A6862;--line:#D5DDD6;--accent:#0B6E5F;--ok:#2C7A3A;--warn:#9A5B00;--risk:#B3261E}
@media (prefers-color-scheme:dark){:root{--bg:#0F1513;--surface:#161F1C;--ink:#E3EBE7;--muted:#97A69F;--line:#28352F;--accent:#3FC2A6;--ok:#74C982;--warn:#E6A84A;--risk:#F2857B;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 18px 64px}
a{color:var(--accent)} h1{font-size:clamp(24px,4vw,34px);line-height:1.2;margin:8px 0;font-family:ui-monospace,Menlo,monospace;overflow-wrap:anywhere}
h2{font-size:19px;margin:28px 0 8px} .muted{color:var(--muted)} .cta{display:inline-block;margin:14px 8px 0 0;padding:9px 16px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none}
.cta.alt{background:none;border:1.5px solid var(--line);color:var(--ink)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:18px 0}
.facts div{background:var(--surface);padding:8px 12px}.facts span{display:block;font-size:11px;color:var(--muted)}.facts b{font-family:ui-monospace,Menlo,monospace}
pre{background:var(--surface);border:1px solid var(--line);padding:12px;border-radius:8px;overflow-x:auto;font-size:13px}
.score{font-size:28px;font-weight:800;color:var(--${a.level === "ok" ? "ok" : a.level === "warn" ? "warn" : "risk"})}
</style></head><body><main>
<a href="../../">← 開源實作圖鑑</a>
<p class="muted">${esc(SRC[p.src].n)} · ${esc(p.cat)} · ${esc(p.diff)}</p>
<h1>${esc(p.n)}</h1>
<p>${esc(p.ov)}</p>
<a class="cta" href="../../#${p.id}">在互動版開啟（README 原文、一鍵試用、收藏）</a><a class="cta alt" href="${esc(p.url)}" rel="noopener">原始碼 ↗</a>
<div class="facts">
<div><span>星數</span><b>${p.s == null ? "—" : fmt(p.s)}</b></div><div><span>每週成長</span><b>${g ? (g.perWeek >= 0 ? "+" : "") + fmt(g.perWeek) : "—"}</b></div>
<div><span>Fork</span><b>${fmt(p.f)}</b></div><div><span>語言</span><b>${esc(p.lang || "—")}</b></div>
<div><span>授權</span><b>${esc(p.lic || "未標示")}</b></div><div><span>最後更新</span><b>${p.p || "—"}</b></div>
</div>
<h2>主要功能</h2>${li(p.feat)}
<h2>實操練習</h2>${li(p.tasks)}
<h2>安裝與部署</h2>${p.ins && p.ins.length ? `<pre>${p.ins.map((c) => "$ " + esc(c)).join("\n")}</pre>` : "<p>請依官方文件安裝。</p>"}
<h2>系統需求</h2><h3>軟體</h3>${li(p.sw)}<h3>硬體</h3>${li(p.hw)}<h3>作業系統</h3>${li(p.os)}
<h2>安全評估</h2><p><span class="score">${a.score}</span> / 100 · ${a.label}</p>
<ul>${a.sig.filter((s) => s[0] !== 0).map(([d, l, t]) => `<li>${d > 0 ? "+" : ""}${d}　${esc(l)}：${esc(t)}</li>`).join("")}</ul>
<p class="muted">靜態風險評估，不是防毒掃描。執行前請比對官方雜湊值並在隔離環境測試。</p>
<h2>授權</h2><p><b>${esc(p.lic || "未標示授權")}</b>：${esc(LIC[licKind(p.lic)].d)}</p>
<p class="muted">資料更新於 ${esc((DATA.updatedAt || "").slice(0, 10))} · 專案內容版權屬原作者</p>
</main></body></html>`;
};

let composeN = 0;
for (const p of DATA.projects) {
  await out(`p/${p.id}/index.html`, page(p));
  const c = composeFor(p);
  if (c) { await out(`compose/${p.id}.yml`, c); composeN++; }
}

const urls = [`${SITE}`, ...DATA.projects.map((p) => `${SITE}p/${p.id}/`)];
await out("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u, k) => `  <url><loc>${u}</loc><lastmod>${(k ? DATA.projects[k - 1].p : null) || (DATA.updatedAt || TODAY).slice(0, 10)}</lastmod></url>`).join("\n")}\n</urlset>\n`);
await out("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
await out("404.html", `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${SITE}"><title>找不到頁面</title><a href="${SITE}">回到開源實作圖鑑</a>`);
console.log(`built ${DATA.projects.length} pages, ${composeN} compose files → _site/ (${SITE})`);
