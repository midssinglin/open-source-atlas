// 半自動收錄：挑選候選專案，讀取 README，請 Claude 起草策展欄位，附加到 data/curated.json 供人工審核（由 workflow 開 PR）
// 執行：ANTHROPIC_API_KEY=xxx COUNT=5 node scripts/draft.mjs
//      指定專案：NAMES="github:owner/repo,gitlab:group/project" node scripts/draft.mjs
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), "utf8"));
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const COUNT = Math.max(1, Math.min(20, parseInt(process.env.COUNT || "5", 10)));
const NAMES = (process.env.NAMES || "").split(",").map((s) => s.trim()).filter(Boolean);
const GH = process.env.GITHUB_TOKEN;
if (!KEY) { console.error("缺少 ANTHROPIC_API_KEY（請在 repo Settings → Secrets and variables → Actions 新增）"); process.exit(1); }

const URLS = { github: "https://github.com/", gitlab: "https://gitlab.com/", codeberg: "https://codeberg.org/", gitea: "https://gitea.com/", bitbucket: "https://bitbucket.org/" };
const PFX = { github: "gh", gitlab: "gl", codeberg: "cb", gitea: "gt", bitbucket: "bb" };
const CATS = ["學習資源", "自架服務", "AI 與 LLM", "遊戲開發", "DevOps 與雲原生", "資安與網路", "IoT 與硬體", "Web 與 App 框架", "開發工具", "桌面與行動應用"];
const DIFFS = ["入門", "入門–進階", "中階", "進階"];
const MODES = ["docker", "local", "build", "read", "hw", "cloud"];
const RISKS = ["pipe", "root", "sock", "priv", "bin", "keys", "telem", "offensive", "beta", "intercept", "exec", "mirror", "dl", "weak", "expose", "token", "lic", "breaking", "vuln", "blob", "brick", "tos"];

async function text(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": "open-source-atlas drafter", ...headers }, signal: AbortSignal.timeout(20000) });
  return r.ok ? r.text() : null;
}
async function readme(src, n) {
  if (src === "github") return text(`https://api.github.com/repos/${n}/readme`, { Accept: "application/vnd.github.raw", ...(GH && { Authorization: `Bearer ${GH}` }) });
  if (src === "gitlab") {
    const meta = await text(`https://gitlab.com/api/v4/projects/${encodeURIComponent(n)}`);
    const br = meta ? JSON.parse(meta).default_branch : "main";
    return text(`https://gitlab.com/api/v4/projects/${encodeURIComponent(n)}/repository/files/README.md/raw?ref=${br}`);
  }
  if (src === "codeberg" || src === "gitea") return text(`https://${src === "gitea" ? "gitea.com" : "codeberg.org"}/api/v1/repos/${n}/raw/README.md`);
  if (src === "bitbucket") return text(`https://api.bitbucket.org/2.0/repositories/${n}/src/HEAD/README.md`);
  return null;
}

const curatedDoc = await read("data/curated.json");
const curated = curatedDoc.projects;
const have = new Set(curated.map((c) => `${c.src}:${c.n.toLowerCase()}`));
const cand = (await read("data/candidates.json").catch(() => ({ items: [] }))).items;
const pick = NAMES.length
  ? NAMES.map((s) => { const [src, ...r] = s.split(":"); const n = r.join(":"); return cand.find((c) => c.src === src && c.n === n) || { src, n }; })
  : cand.filter((c) => !have.has(`${c.src}:${c.n.toLowerCase()}`)).slice(0, COUNT);

const example = curated.find((c) => c.id === "gh-louislam-uptime-kuma") || curated[0];
const exampleOut = Object.fromEntries(["cat", "diff", "modes", "ov", "feat", "tasks", "sw", "hw", "he", "os", "ins", "insN", "r", "q"].map((k) => [k, example[k] ?? null]));

const SYSTEM = `你是「開源實作圖鑑」的編輯，替台灣的學習者整理開源專案。只輸出一個 JSON 物件，不要任何其他文字。
欄位：
- cat：從 ${JSON.stringify(CATS)} 擇一
- diff：從 ${JSON.stringify(DIFFS)} 擇一
- modes：從 ${JSON.stringify(MODES)} 選 1–3 個（docker=容器部署, local=本機安裝, build=原始碼編譯, read=閱讀學習, hw=需實體硬體, cloud=需雲端帳號）
- ov：2–3 句繁體中文概覽，說明它是什麼、適合誰
- feat：3–4 個主要功能（繁體中文短句）
- tasks：2 個具體的動手練習題（繁體中文，要能實際完成）
- sw / hw / os：README 明確提到的軟體、硬體、作業系統需求（字串陣列）；README 沒寫但你很確定的常識可加，並把 he 設為 true
- he：hw 是否含估計值
- ins：README 中主要安裝 / 執行路徑的 shell 指令，必須逐字照抄，最多 4 行；沒有就給 []
- insN：對安裝指令的補充說明，沒有則為 null
- r：已知風險，格式 [[key, 繁體中文說明]]，key 只能是 ${JSON.stringify(RISKS)}（pipe=curl|sh 安裝, root=需 sudo, sock=掛載 docker.sock, priv=特權容器, bin=預編譯執行檔, keys=需外部帳號金鑰, telem=遙測, offensive=攻擊性內容, beta=測試階段, exec=執行任意程式碼, dl=下載大型資源, weak=預設弱密碼, expose=對外開放服務）
- q：從 README 逐字擷取一句不超過 14 個英文單字的代表性句子，找不到就 null
不要捏造 README 沒有的指令或數字。`;

async function draft(c) {
  const md = (await readme(c.src, c.n)) || "";
  const user = `範例輸出（另一個專案）：\n${JSON.stringify(exampleOut)}\n\n請整理這個專案：\n平台：${c.src}\n名稱：${c.n}\n描述：${c.d || ""}\n語言：${c.lang || ""}\n主題：${(c.top || []).join(", ")}\n星數：${c.s ?? "未知"}\n\nREADME（截斷）：\n${md.slice(0, 24000)}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const raw = j.content.map((b) => b.text || "").join("");
  const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  // 驗證與清理
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
  const entry = {
    id: `${PFX[c.src]}-${c.n.replace(/[^a-zA-Z0-9]+/g, "-")}`.toLowerCase().replace(/-+$/, ""),
    src: c.src, n: c.n, url: URLS[c.src] + c.n,
    cat: CATS.includes(obj.cat) ? obj.cat : "開發工具",
    diff: DIFFS.includes(obj.diff) ? obj.diff : "中階",
    modes: arr(obj.modes).filter((m) => MODES.includes(m)).slice(0, 3),
    ov: String(obj.ov || c.d || "").trim(), feat: arr(obj.feat).slice(0, 5), tasks: arr(obj.tasks).slice(0, 3),
    sw: arr(obj.sw), hw: arr(obj.hw), he: !!obj.he, os: arr(obj.os), ins: arr(obj.ins).slice(0, 4).filter((x) => md.includes(x.split("\n")[0].slice(0, 30))),
    insN: obj.insN || null,
    r: (Array.isArray(obj.r) ? obj.r : []).filter((x) => Array.isArray(x) && RISKS.includes(x[0]) && typeof x[1] === "string"),
    q: typeof obj.q === "string" && md.includes(obj.q) ? obj.q : null,
    rm: true, ai: new Date().toISOString().slice(0, 10),
  };
  if (!entry.modes.length) entry.modes = ["local"];
  if (!entry.ov || entry.feat.length < 2 || entry.tasks.length < 1) throw new Error("草稿內容不完整");
  return entry;
}

const added = [];
for (const c of pick) {
  if (have.has(`${c.src}:${c.n.toLowerCase()}`)) { console.log(`略過（已收錄）：${c.n}`); continue; }
  try {
    const e = await draft(c);
    curated.push(e); have.add(`${c.src}:${c.n.toLowerCase()}`); added.push(e);
    console.log(`✓ ${c.n} → ${e.cat} / ${e.diff}`);
  } catch (err) { console.log(`✗ ${c.n}: ${err.message}`); }
}
await writeFile(new URL("data/curated.json", ROOT), JSON.stringify(curatedDoc, null, 1) + "\n");
const summary = added.map((e) => `- **${e.n}**（${e.cat}・${e.diff}）：${e.ov.slice(0, 80)}${e.ov.length > 80 ? "…" : ""}${e.ins.length ? "" : "（未找到可逐字引用的安裝指令）"}`).join("\n");
await writeFile(new URL("draft-summary.md", ROOT), added.length
  ? `由 Claude（${MODEL}）依 README 起草的 ${added.length} 筆收錄草稿。合併前請檢查：分類與難度是否合理、安裝指令是否與 README 一致、風險是否遺漏。\n\n${summary}\n`
  : "沒有產生新的草稿。\n");
console.log(`新增 ${added.length} 筆草稿`);
