// 每週資料更新：讀取 data/curated.json，向各平台 API 取得最新指標，
// 掃描 README 的風險訊號，並寫出 data/projects.json 與 data/candidates.json。
// 執行：GITHUB_TOKEN=xxx node scripts/update.mjs   （Node 20+，無外部相依）
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), "utf8"));
const write = (p, d) => writeFile(new URL(p, ROOT), JSON.stringify(d, null, 0) + "\n");

const GH_TOKEN = process.env.GITHUB_TOKEN || "";
const REPO = process.env.GITHUB_REPOSITORY || "midssinglin/open-source-atlas";
const HOSTS = { codeberg: "codeberg.org", gitea: "gitea.com" };
const UA = { "User-Agent": `${REPO} data updater` };
const day = (s) => (s ? String(s).slice(0, 10) : null);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

async function get(url, { json = true, headers = {}, tries = 3 } = {}) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (r.status === 404) return null;
      if (r.status === 403 || r.status === 429) throw new Error(`rate-limited ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return json ? r.json() : r.text();
    } catch (e) {
      if (t === tries) throw e;
      await new Promise((res) => setTimeout(res, 1500 * t));
    }
  }
}
const gh = (path, opt = {}) =>
  get(`https://api.github.com${path}`, {
    ...opt,
    headers: { Accept: "application/vnd.github+json", ...(GH_TOKEN && { Authorization: `Bearer ${GH_TOKEN}` }), ...(opt.headers || {}) },
  });

// ---------- README 風險掃描 ----------
const PATTERNS = [
  ["pipe", /(curl|wget)\b[^\n`]*\|\s*(sudo\s+)?(ba|z)?sh\b|\b(ba)?sh\s+<\(\s*(curl|wget)/i, "README 含有把下載內容直接交給 shell 執行的指令"],
  ["root", /(^|[\s`$])sudo\s+(?!apt(-get)?\s+(update|install))/m, "README 的指令使用 sudo（排除一般套件安裝）"],
  ["sock", /docker\.sock/i, "README 提到掛載 docker.sock"],
  ["priv", /--privileged|privileged:\s*true/i, "README 使用特權容器"],
  ["telem", /\btelemetry\b|anonymous (usage )?(statistics|stats|data)/i, "README 提到遙測或匿名統計"],
];
function scanReadme(text) {
  if (!text) return [];
  const body = text.slice(0, 200000);
  return PATTERNS.filter(([, re]) => re.test(body)).map(([k, , t]) => [k, t]);
}

const SPDX = { mit: "MIT", "apache-2.0": "Apache-2.0", "gpl-3.0": "GPL-3.0", "gpl-2.0": "GPL-2.0", "agpl-3.0": "AGPL-3.0", "lgpl-3.0": "LGPL-3.0", "bsd-3-clause": "BSD-3-Clause", "bsd-2-clause": "BSD-2-Clause", "mpl-2.0": "MPL-2.0", zlib: "Zlib" };
const normLic = (k) => (k ? SPDX[String(k).toLowerCase()] || k : null);

// ---------- 各平台抓取 ----------
const fetchers = {
  async github(n) {
    const r = await gh(`/repos/${n}`);
    if (!r) return null;
    const readme = await gh(`/repos/${n}/readme`, { json: false, headers: { Accept: "application/vnd.github.raw" } }).catch(() => null);
    return {
      d: r.description, lang: r.language, s: r.stargazers_count, f: r.forks_count, i: r.open_issues_count,
      lic: r.license?.spdx_id ?? null, top: (r.topics || []).slice(0, 8), c: day(r.created_at), p: day(r.pushed_at),
      ar: r.archived, home: r.homepage || null, readme,
    };
  },
  async gitlab(n) {
    const base = `https://gitlab.com/api/v4/projects/${encodeURIComponent(n)}`;
    const r = await get(`${base}?license=true`);
    if (!r) return null;
    const langs = await get(`${base}/languages`).catch(() => null);
    const lang = langs ? Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null : null;
    let readme = null;
    for (const f of ["README.md", "README.rst", "README"]) {
      readme = await get(`${base}/repository/files/${encodeURIComponent(f)}/raw?ref=${encodeURIComponent(r.default_branch || "HEAD")}`, { json: false, tries: 1 }).catch(() => null);
      if (readme) break;
    }
    return {
      d: r.description, lang, s: r.star_count, f: r.forks_count, i: r.open_issues_count ?? null,
      lic: normLic(r.license?.key), top: (r.topics || r.tag_list || []).slice(0, 8), c: day(r.created_at),
      p: day(r.last_activity_at), ar: r.archived, readme,
    };
  },
  async codeberg(n) { return giteaLike(HOSTS.codeberg, n); },
  async gitea(n) { return giteaLike(HOSTS.gitea, n); },
  async bitbucket(n) {
    const base = `https://api.bitbucket.org/2.0/repositories/${n}`;
    const r = await get(base);
    if (!r) return null;
    const forks = await get(`${base}/forks?pagelen=1`).catch(() => null);
    const readme = await get(`${base}/src/${encodeURIComponent(r.mainbranch?.name || "master")}/README.md`, { json: false, tries: 1 }).catch(() => null);
    return {
      d: r.description || null, lang: r.language || null, s: null, f: forks?.size ?? null, i: null,
      c: day(r.created_on), p: day(r.updated_on), home: r.website || null, readme,
    };
  },
};
async function giteaLike(host, n) {
  const base = `https://${host}/api/v1/repos/${n}`;
  const r = await get(base);
  if (!r) return null;
  const topics = await get(`${base}/topics`).catch(() => null);
  let readme = null;
  for (const f of ["README.md", "README"]) {
    readme = await get(`${base}/raw/${f}`, { json: false, tries: 1 }).catch(() => null);
    if (readme) break;
  }
  return {
    d: r.description, lang: r.language || null, s: r.stars_count, f: r.forks_count, i: r.open_issues_count,
    lic: r.licenses?.[0] ? normLic(r.licenses[0]) : undefined, top: (topics?.topics || []).slice(0, 8),
    c: day(r.created_at), p: day(r.updated_at), ar: r.archived, home: r.website || null, readme,
  };
}

// ---------- 自動發現候選專案 ----------
async function discover(known) {
  const out = [];
  const push = (src, x) => { if (!known.has(`${src}:${x.n.toLowerCase()}`)) out.push({ src, ...x }); };
  const tasks = [
    ["github", async () => {
      const q = encodeURIComponent(`created:>${daysAgo(45)} stars:>300 archived:false`);
      const r = await gh(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=25`);
      (r?.items || []).forEach((x) => push("github", { n: x.full_name, url: x.html_url, d: x.description, lang: x.language, s: x.stargazers_count, f: x.forks_count, lic: x.license?.spdx_id ?? null, c: day(x.created_at), p: day(x.pushed_at), top: (x.topics || []).slice(0, 6) }));
    }],
    ["gitlab", async () => {
      const r = await get(`https://gitlab.com/api/v4/projects?order_by=star_count&sort=desc&per_page=20&last_activity_after=${daysAgo(30)}T00:00:00Z`);
      (r || []).forEach((x) => push("gitlab", { n: x.path_with_namespace, url: x.web_url, d: x.description, s: x.star_count, f: x.forks_count, c: day(x.created_at), p: day(x.last_activity_at), top: (x.topics || []).slice(0, 6) }));
    }],
    ...Object.entries(HOSTS).map(([src, host]) => [src, async () => {
      const r = await get(`https://${host}/api/v1/repos/search?sort=stars&order=desc&limit=20`);
      (r?.data || []).forEach((x) => push(src, { n: x.full_name, url: x.html_url, d: x.description, lang: x.language, s: x.stars_count, f: x.forks_count, c: day(x.created_at), p: day(x.updated_at), top: (x.topics || []).slice(0, 6) }));
    }]),
  ];
  const status = {};
  for (const [src, fn] of tasks) {
    try { await fn(); status[src] = "ok"; } catch (e) { status[src] = String(e.message || e); }
  }
  return { status, items: out.sort((a, b) => (b.s ?? 0) - (a.s ?? 0)).slice(0, 40) };
}

// ---------- 主流程 ----------
const curated = (await read("data/curated.json")).projects;
const prev = await read("data/projects.json").catch(() => ({ projects: [] }));
const prevById = new Map(prev.projects.map((p) => [p.id, p]));
const status = {};
const projects = [];

const queue = [...curated];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const old = prevById.get(c.id) || {};
    const st = (status[c.src] ||= { ok: 0, fail: 0, errors: [] });
    let live = null;
    try { live = await fetchers[c.src](c.n); } catch (e) { st.errors.push(`${c.n}: ${e.message}`); }
    if (live) st.ok++; else st.fail++;
    const { readme, ...metrics } = live || {};
    const merged = { ...old, ...c };
    for (const [k, v] of Object.entries(metrics)) if (v !== undefined && v !== null) merged[k] = v;
    // 授權：策展值優先於平台回傳的 NOASSERTION / 空值
    if (c.lic && (!metrics.lic || metrics.lic === "NOASSERTION")) merged.lic = c.lic;
    if (merged.s === undefined) merged.s = null;
    const known = new Set(c.r.map(([k]) => k));
    merged.auto = readme === undefined ? old.auto || [] : scanReadme(readme).filter(([k]) => !known.has(k));
    merged.url = c.url;
    projects.push(merged);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
projects.sort((a, b) => curated.findIndex((c) => c.id === a.id) - curated.findIndex((c) => c.id === b.id));

const knownKeys = new Set(curated.map((c) => `${c.src}:${c.n.toLowerCase()}`));
const cand = await discover(knownKeys);

for (const [src, s] of Object.entries(status)) console.log(`${src}: ok ${s.ok}, fail ${s.fail}${s.errors.length ? "\n  " + s.errors.join("\n  ") : ""}`);
console.log("candidates:", cand.items.length, cand.status);
const failRate = Object.values(status).reduce((a, s) => a + s.fail, 0) / curated.length;
if (failRate > 0.5) { console.error("超過一半的專案抓取失敗，保留舊資料並中止。"); process.exit(1); }

const now = new Date().toISOString();
for (const s of Object.values(status)) s.errors = s.errors.slice(0, 5);
await write("data/projects.json", { updatedAt: now, repo: REPO, status, projects });
await write("data/candidates.json", { updatedAt: now, status: cand.status, items: cand.items });
