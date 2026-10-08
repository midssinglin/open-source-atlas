// 每週資料更新
// 讀取 data/curated.json，向各平台 API 取得最新指標、README、頂層檔案樹與 OpenSSF Scorecard，
// 掃描 README 風險訊號、累積星數歷史，並寫出：
//   data/projects.json   專案資料（網站主要讀取）
//   data/readme/<id>.md  README 原文
//   data/history.json    每週星數 / Fork 歷史
//   data/candidates.json 自動發現的候選專案
// 執行：GITHUB_TOKEN=xxx node scripts/update.mjs   （Node 20+，無外部相依）
import { readFile, writeFile, mkdir } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), "utf8"));
const write = (p, d) => writeFile(new URL(p, ROOT), typeof d === "string" ? d : JSON.stringify(d) + "\n");

const GH_TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "midssinglin/open-source-atlas";
const ONLY = process.env.ONLY_IDS ? new Set(process.env.ONLY_IDS.split(",")) : null; // 偵錯用
const HOSTS = { codeberg: "codeberg.org", gitea: "gitea.com" };
const UA = { "User-Agent": `${REPO} data updater` };
const README_MAX = 150_000;
const day = (s) => (s ? String(s).slice(0, 10) : null);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);

async function get(url, { json = true, headers = {}, tries = 3 } = {}) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(25000), redirect: "follow" });
      if (r.status === 404 || r.status === 410) return null;
      if (r.status === 403 || r.status === 429) throw new Error(`rate-limited ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return json ? r.json() : r.text();
    } catch (e) {
      if (t === tries) throw e;
      await new Promise((res) => setTimeout(res, 2000 * t));
    }
  }
}
const gh = (path, opt = {}) =>
  get(`https://api.github.com${path}`, {
    ...opt,
    headers: { Accept: "application/vnd.github+json", ...(GH_TOKEN && { Authorization: `Bearer ${GH_TOKEN}` }), ...(opt.headers || {}) },
  });
const soft = (p) => p.catch(() => null);

// ---------- README 風險掃描 ----------
const PATTERNS = [
  ["pipe", /(curl|wget)\b[^\n`]*\|\s*(sudo\s+)?(ba|z)?sh\b|\b(ba)?sh\s+<\(\s*(curl|wget)/i, "README 含有把下載內容直接交給 shell 執行的指令"],
  ["root", /(^|[\s`$])sudo\s+(?!apt(-get)?\s+(update|install)|dnf\s+install|yum\s+install|pacman\s+-S)/m, "README 的指令使用 sudo（排除一般套件安裝）"],
  ["sock", /docker\.sock/i, "README 提到掛載 docker.sock"],
  ["priv", /--privileged|privileged:\s*true/i, "README 使用特權容器"],
  ["telem", /\btelemetry\b|anonymous (usage )?(statistics|stats|data)/i, "README 提到遙測或匿名統計"],
];
const scanReadme = (t) => (t ? PATTERNS.filter(([, re]) => re.test(t.slice(0, 200000))).map(([k, , m]) => [k, m]) : []);

const SPDX = { mit: "MIT", "apache-2.0": "Apache-2.0", "gpl-3.0": "GPL-3.0", "gpl-2.0": "GPL-2.0", "agpl-3.0": "AGPL-3.0", "lgpl-3.0": "LGPL-3.0", "lgpl-2.1": "LGPL-2.1", "bsd-3-clause": "BSD-3-Clause", "bsd-2-clause": "BSD-2-Clause", "mpl-2.0": "MPL-2.0", zlib: "Zlib", "eupl-1.2": "EUPL-1.2" };
const normLic = (k) => (k ? SPDX[String(k).toLowerCase()] || k : null);
const treeOf = (items, nameKey, typeKey, dirVal) =>
  (items || []).slice(0, 80).map((x) => [String(x[nameKey]).split("/").pop(), x[typeKey] === dirVal ? "d" : "f"])
    .sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === "d" ? -1 : 1));

// ---------- 各平台抓取 ----------
const fetchers = {
  async github(n) {
    const r = await gh(`/repos/${n}`);
    if (!r) return null;
    const [readme, contents] = await Promise.all([
      soft(gh(`/repos/${r.full_name}/readme`, { json: false, headers: { Accept: "application/vnd.github.raw" } })),
      soft(gh(`/repos/${r.full_name}/contents`)),
    ]);
    const br = r.default_branch;
    return {
      canon: r.full_name, d: r.description, lang: r.language, s: r.stargazers_count, f: r.forks_count, i: r.open_issues_count,
      lic: r.license?.spdx_id ?? null, top: (r.topics || []).slice(0, 8), c: day(r.created_at), p: day(r.pushed_at),
      ar: r.archived, home: r.homepage || null, br, readme, tree: Array.isArray(contents) ? treeOf(contents, "name", "type", "dir") : null,
      rb: `https://raw.githubusercontent.com/${r.full_name}/${br}/`, lb: `https://github.com/${r.full_name}/blob/${br}/`,
    };
  },
  async gitlab(n) {
    const base = `https://gitlab.com/api/v4/projects/${encodeURIComponent(n)}`;
    const r = await get(`${base}?license=true`);
    if (!r) return null;
    const br = r.default_branch || "main";
    const [langs, tree] = await Promise.all([soft(get(`${base}/languages`)), soft(get(`${base}/repository/tree?per_page=100&ref=${encodeURIComponent(br)}`))]);
    const lang = langs ? Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    let readme = null;
    const rf = r.readme_url ? decodeURIComponent(r.readme_url.split(`/-/blob/${br}/`)[1] || "") : "";
    for (const f of [rf, "README.md", "README.rst", "README"].filter(Boolean)) {
      readme = await soft(get(`${base}/repository/files/${encodeURIComponent(f)}/raw?ref=${encodeURIComponent(br)}`, { json: false, tries: 1 }));
      if (readme) break;
    }
    return {
      d: r.description, lang, s: r.star_count, f: r.forks_count, i: r.open_issues_count ?? null,
      lic: normLic(r.license?.key), top: (r.topics || r.tag_list || []).slice(0, 8), c: day(r.created_at),
      p: day(r.last_activity_at), ar: r.archived, br, readme, tree: tree ? treeOf(tree, "name", "type", "tree") : null,
      rb: `https://gitlab.com/${n}/-/raw/${br}/`, lb: `https://gitlab.com/${n}/-/blob/${br}/`,
    };
  },
  codeberg: (n) => giteaLike(HOSTS.codeberg, n),
  gitea: (n) => giteaLike(HOSTS.gitea, n),
  async bitbucket(n) {
    const base = `https://api.bitbucket.org/2.0/repositories/${n}`;
    const r = await get(base);
    if (!r) return null;
    const br = r.mainbranch?.name || "master";
    const [forks, src] = await Promise.all([soft(get(`${base}/forks?pagelen=1`)), soft(get(`${base}/src/${encodeURIComponent(br)}/?pagelen=100`))]);
    let readme = null;
    for (const f of ["README.md", "README.rst", "README"]) {
      readme = await soft(get(`${base}/src/${encodeURIComponent(br)}/${f}`, { json: false, tries: 1 }));
      if (readme) break;
    }
    return {
      d: r.description || null, lang: r.language || null, s: null, f: forks?.size ?? null, i: null,
      c: day(r.created_on), p: day(r.updated_on), home: r.website || null, br, readme,
      tree: src?.values ? treeOf(src.values, "path", "type", "commit_directory") : null,
      rb: `https://bitbucket.org/${n}/raw/${br}/`, lb: `https://bitbucket.org/${n}/src/${br}/`,
    };
  },
};
async function giteaLike(host, n) {
  const base = `https://${host}/api/v1/repos/${n}`;
  const r = await get(base);
  if (!r) return null;
  const br = r.default_branch || "main";
  const [topics, contents] = await Promise.all([soft(get(`${base}/topics`)), soft(get(`${base}/contents?ref=${encodeURIComponent(br)}`))]);
  let readme = null;
  for (const f of ["README.md", "README", "README.rst"]) {
    readme = await soft(get(`${base}/raw/${f}?ref=${encodeURIComponent(br)}`, { json: false, tries: 1 }));
    if (readme) break;
  }
  return {
    d: r.description, lang: r.language || null, s: r.stars_count, f: r.forks_count, i: r.open_issues_count,
    lic: r.licenses?.[0] ? normLic(r.licenses[0]) : undefined, top: (topics?.topics || []).slice(0, 8),
    c: day(r.created_at), p: day(r.updated_at), ar: r.archived, home: r.website || null, br, readme,
    tree: Array.isArray(contents) ? treeOf(contents, "name", "type", "dir") : null,
    rb: `https://${host}/${n}/raw/branch/${br}/`, lb: `https://${host}/${n}/src/branch/${br}/`,
  };
}

// ---------- OpenSSF Scorecard ----------
async function scorecard(src, n) {
  const host = { github: "github.com", gitlab: "gitlab.com" }[src];
  if (!host) return null;
  const r = await soft(get(`https://api.securityscorecards.dev/projects/${host}/${n}`, { tries: 2 }));
  if (!r || typeof r.score !== "number") return null;
  return {
    score: Math.round(r.score * 10) / 10, date: day(r.date),
    checks: (r.checks || []).filter((c) => c.score >= 0).map((c) => [c.name, c.score]).sort((a, b) => a[1] - b[1]),
  };
}

// ---------- 自動發現候選專案 ----------
async function discover(known) {
  const out = [];
  const age = (c) => Math.max(1, Math.round((Date.now() - new Date(c)) / 864e5));
  const push = (src, x) => {
    if (known.has(`${src}:${x.n.toLowerCase()}`)) return;
    out.push({ src, ...x, g: x.s != null && x.c ? Math.round((x.s / age(x.c)) * 10) / 10 : null });
  };
  const tasks = [
    ["github", async () => {
      for (const q of [`created:>${daysAgo(45)} stars:>300 archived:false`, `created:>${daysAgo(365)} stars:>3000 archived:false`]) {
        const r = await gh(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=25`);
        (r?.items || []).forEach((x) => push("github", { n: x.full_name, url: x.html_url, d: x.description, lang: x.language, s: x.stargazers_count, f: x.forks_count, lic: x.license?.spdx_id ?? null, c: day(x.created_at), p: day(x.pushed_at), top: (x.topics || []).slice(0, 6) }));
      }
    }],
    ["gitlab", async () => {
      const r = await get(`https://gitlab.com/api/v4/projects?order_by=star_count&sort=desc&per_page=20&last_activity_after=${daysAgo(30)}T00:00:00Z`);
      (r || []).forEach((x) => push("gitlab", { n: x.path_with_namespace, url: x.web_url, d: x.description, s: x.star_count, f: x.forks_count, c: day(x.created_at), p: day(x.last_activity_at), top: (x.topics || []).slice(0, 6) }));
    }],
    ...Object.entries(HOSTS).map(([src, host]) => [src, async () => {
      const r = await get(`https://${host}/api/v1/repos/search?sort=stars&order=desc&limit=25`);
      (r?.data || []).forEach((x) => push(src, { n: x.full_name, url: x.html_url, d: x.description, lang: x.language, s: x.stars_count, f: x.forks_count, c: day(x.created_at), p: day(x.updated_at), top: (x.topics || []).slice(0, 6) }));
    }]),
  ];
  const status = {};
  for (const [src, fn] of tasks) {
    try { await fn(); status[src] = "ok"; } catch (e) { status[src] = String(e.message || e); }
  }
  const seen = new Set();
  const items = out.filter((x) => { const k = x.src + x.n; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.g ?? 0) - (a.g ?? 0)).slice(0, 50);
  return { status, items };
}

// ---------- 主流程 ----------
const curated = (await read("data/curated.json")).projects.filter((c) => !ONLY || ONLY.has(c.id));
const prev = await read("data/projects.json").catch(() => ({ projects: [] }));
const prevById = new Map(prev.projects.map((p) => [p.id, p]));
const history = await read("data/history.json").catch(() => ({}));
await mkdir(new URL("data/readme/", ROOT), { recursive: true });

const status = {};
const out = new Map();
const queue = [...curated];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const old = prevById.get(c.id) || {};
    const st = (status[c.src] ||= { ok: 0, fail: 0, errors: [] });
    let live = null;
    try { live = await fetchers[c.src](c.n); if (!live) st.errors.push(`${c.n}: 找不到（404）`); }
    catch (e) { st.errors.push(`${c.n}: ${e.message}`); }
    if (live) st.ok++; else st.fail++;
    const { readme, ...metrics } = live || {};
    const merged = { ...old, ...c };
    for (const [k, v] of Object.entries(metrics)) if (v !== undefined && v !== null) merged[k] = v;
    if (c.lic && (!metrics.lic || metrics.lic === "NOASSERTION")) merged.lic = c.lic;
    if (merged.s === undefined) merged.s = null;
    if (live) merged.sc = await scorecard(c.src, metrics.canon || c.n);
    const known = new Set(c.r.map(([k]) => k));
    if (readme !== undefined && readme !== null) {
      merged.auto = scanReadme(readme).filter(([k]) => !known.has(k));
      await write(`data/readme/${c.id}.md`, readme.length > README_MAX ? readme.slice(0, README_MAX) + "\n\n…（README 過長，已截斷）" : readme);
      merged.hasReadme = true;
    } else {
      merged.auto = old.auto || [];
    }
    delete merged.canon;
    merged.url = c.url;
    if (live && merged.s != null) {
      const h = (history[c.id] ||= []);
      if (h.at(-1)?.[0] === TODAY) h.pop();
      h.push([TODAY, merged.s, merged.f ?? null]);
      if (h.length > 104) h.splice(0, h.length - 104);
    }
    out.set(c.id, merged);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
const projects = curated.map((c) => out.get(c.id));

const cand = await discover(new Set((await read("data/curated.json")).projects.map((c) => `${c.src}:${c.n.toLowerCase()}`)));

for (const [src, s] of Object.entries(status)) console.log(`${src}: ok ${s.ok}, fail ${s.fail}${s.errors.length ? "\n  " + s.errors.join("\n  ") : ""}`);
console.log("scorecard:", projects.filter((p) => p.sc).length, "| readme:", projects.filter((p) => p.hasReadme).length, "| candidates:", cand.items.length, cand.status);
const failRate = Object.values(status).reduce((a, s) => a + s.fail, 0) / curated.length;
if (failRate > 0.5) { console.error("超過一半的專案抓取失敗，保留舊資料並中止。"); process.exit(1); }
if (ONLY) { console.log("ONLY_IDS 模式：不寫入檔案"); process.exit(0); }

const now = new Date().toISOString();
for (const s of Object.values(status)) s.errors = s.errors.slice(0, 10);
await write("data/projects.json", { updatedAt: now, repo: REPO, status, projects });
await write("data/history.json", history);
await write("data/candidates.json", { updatedAt: now, status: cand.status, items: cand.items });
