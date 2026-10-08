// 依賴漏洞掃描：對每個收錄專案做「只含鎖定檔」的稀疏淺層 clone，用 osv-scanner 比對 OSV 漏洞資料庫，
// 結果寫入 data/security.json。需要 PATH 中有 git 與 osv-scanner（v2）。
// 執行：node scripts/osv.mjs        可用 ONLY_IDS=id1,id2 只掃描部分專案
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const ROOT = new URL("../", import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), "utf8"));
const ONLY = process.env.ONLY_IDS ? new Set(process.env.ONLY_IDS.split(",")) : null;
const TODAY = new Date().toISOString().slice(0, 10);

// osv-scanner 支援的鎖定檔 / 清單檔
const LOCKFILES = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "npm-shrinkwrap.json",
  "go.mod", "Cargo.lock", "poetry.lock", "uv.lock", "Pipfile.lock", "pdm.lock", "requirements.txt",
  "Gemfile.lock", "composer.lock", "pubspec.lock", "mix.lock", "gradle.lockfile", "pom.xml",
  "packages.lock.json", "conan.lock", "renv.lock",
];
const SPARSE = LOCKFILES.flatMap((f) => [`/${f}`, `/*/${f}`, `/*/*/${f}`]);
const EXCLUDE_DIRS = /(^|\/)(test|tests|testdata|fixtures?|examples?|e2e|docs?|third_party|vendor|node_modules)\//i;

const projects = (await read("data/projects.json")).projects.filter((p) => !ONLY || ONLY.has(p.id));
const prev = await read("data/security.json").catch(() => ({ projects: {} }));
const result = { updatedAt: new Date().toISOString(), projects: { ...prev.projects } };

function sevBucket(s) {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return "unknown";
  return n >= 9 ? "critical" : n >= 7 ? "high" : n >= 4 ? "medium" : "low";
}

async function scan(p) {
  const dir = await mkdtemp(join(tmpdir(), "osv-"));
  try {
    const url = p.url.endsWith(".git") ? p.url : p.url + ".git";
    await run("git", ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", "--quiet", url, dir], { timeout: 240_000 });
    await run("git", ["-C", dir, "sparse-checkout", "set", "--no-cone", ...SPARSE], { timeout: 60_000 });
    await run("git", ["-C", dir, "checkout", "--quiet"], { timeout: 240_000 });
    // git ls-files 會列出所有索引項目（sparse-checkout 只影響是否實體存在），
    // 因此這裡以「檔名是否為已知鎖定檔」且「確實存在於磁碟」來篩選。
    const names = new Set(LOCKFILES);
    const { stdout: files } = await run("git", ["-C", dir, "ls-files"], { maxBuffer: 64 << 20 });
    const lockfiles = files.split("\n")
      .filter((f) => f && names.has(f.split("/").pop()) && !EXCLUDE_DIRS.test(f))
      .filter((f) => existsSync(join(dir, f)));
    if (!lockfiles.length) return { date: TODAY, lockfiles: 0, packages: 0, vulns: 0, sev: {}, top: [] };

    let out = "";
    try {
      ({ stdout: out } = await run("osv-scanner", ["scan", "source", "--format", "json", ...lockfiles.flatMap((f) => ["-L", join(dir, f)])], { timeout: 300_000, maxBuffer: 256 << 20 }));
    } catch (e) {
      // 找到漏洞時 osv-scanner 以非 0 結束碼離開，但仍會輸出 JSON
      out = e.stdout || "";
      if (!out.trim().startsWith("{")) throw new Error((e.stderr || e.message).slice(0, 200));
    }
    const j = JSON.parse(out);
    const ids = new Map(); // id -> {sev, pkg}
    let packages = 0;
    for (const r of j.results || []) {
      for (const pk of r.packages || []) {
        packages++;
        for (const g of pk.groups || []) {
          const id = (g.aliases || g.ids || [])[0] || g.ids?.[0];
          if (!id) continue;
          const sev = sevBucket(g.max_severity);
          const old = ids.get(id);
          if (!old || (parseFloat(g.max_severity) || 0) > (parseFloat(old.score) || 0)) ids.set(id, { sev, score: g.max_severity, pkg: `${pk.package?.name}@${pk.package?.version}` });
        }
      }
    }
    const sev = {};
    for (const v of ids.values()) sev[v.sev] = (sev[v.sev] || 0) + 1;
    const order = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };
    const top = [...ids.entries()].sort((a, b) => order[b[1].sev] - order[a[1].sev]).slice(0, 8).map(([id, v]) => [id, v.sev, v.pkg]);
    return { date: TODAY, lockfiles: lockfiles.length, packages, vulns: ids.size, sev, top };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let done = 0, failed = 0;
const queue = [...projects];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const p = queue.shift();
    try {
      result.projects[p.id] = await scan(p);
      const r = result.projects[p.id];
      console.log(`✓ ${p.n}: ${r.lockfiles} 個鎖定檔、${r.packages} 個套件、${r.vulns} 個已知漏洞`);
      done++;
    } catch (e) {
      failed++;
      console.log(`✗ ${p.n}: ${String(e.message).split("\n")[0]}`);
      if (result.projects[p.id]) result.projects[p.id].stale = true;
    }
  }
}));
console.log(`完成 ${done}、失敗 ${failed}`);
if (!ONLY) await writeFile(new URL("data/security.json", ROOT), JSON.stringify(result) + "\n");
