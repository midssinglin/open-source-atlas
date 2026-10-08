// 共用邏輯：網頁（app.js）與靜態頁產生器（scripts/build.mjs）都會載入。
// 在瀏覽器中定義於 window.Atlas；在 Node 中由 build.mjs 以 vm 執行後取用。
(function (root) {
  const SRC = {
    github: { n: "GitHub", m: "GH" }, gitlab: { n: "GitLab", m: "GL" }, codeberg: { n: "Codeberg", m: "CB" },
    gitea: { n: "Gitea", m: "GT" }, bitbucket: { n: "Bitbucket", m: "BB" },
  };
  const MODES = { docker: "容器部署", local: "本機安裝", build: "原始碼編譯", read: "閱讀學習", hw: "需實體硬體", cloud: "需雲端帳號" };
  const DIFFS = ["入門", "入門–進階", "中階", "進階"];
  const RISK = {
    pipe: { w: 12, l: "管線安裝腳本" }, root: { w: 8, l: "需要 root / 管理員權限" }, sock: { w: 14, l: "掛載 docker.sock" },
    priv: { w: 10, l: "特權容器" }, bin: { w: 4, l: "預編譯執行檔" }, keys: { w: 3, l: "需外部帳號或金鑰" }, telem: { w: 5, l: "遙測 / 資料外送" },
    offensive: { w: 6, l: "攻擊性內容" }, beta: { w: 6, l: "測試階段" }, intercept: { w: 6, l: "攔截加密流量" }, exec: { w: 8, l: "執行任意程式碼" },
    mirror: { w: 3, l: "鏡像儲存庫" }, dl: { w: 3, l: "自動下載大型資源" }, weak: { w: 8, l: "預設弱密碼" }, unmaint: { w: 0, l: "已停止維護" },
    expose: { w: 5, l: "對外開放服務" }, token: { w: 2, l: "本機儲存權杖" }, lic: { w: 3, l: "授權條款需留意" }, policy: { w: 0, l: "貢獻規範" },
    breaking: { w: 2, l: "版本相容性" }, vuln: { w: 6, l: "刻意存在漏洞" }, blob: { w: 5, l: "內含無原始碼的二進位元件" }, brick: { w: 3, l: "刷寫韌體風險" }, tos: { w: 3, l: "可能違反服務條款" },
  };
  const LIC = {
    permissive: { t: "寬鬆授權", d: "可自由使用、修改與商用，散布時保留原作者著作權與授權聲明即可。" },
    copyleft: { t: "Copyleft 授權", d: "可使用與修改；若散布修改後的版本，必須以相同授權公開原始碼。" },
    agpl: { t: "強 Copyleft（含網路）", d: "除散布外，若把修改版架成網路服務讓他人使用，也必須公開原始碼。" },
    mpl: { t: "檔案層級 Copyleft", d: "修改過的 MPL 檔案需公開，其餘自寫的程式可用其他授權。" },
    source: { t: "原始碼可見授權", d: "原始碼公開但不是 OSI 認可的開源授權（例如 BSL、SSPL），通常限制商業託管或競品使用。" },
    noassert: { t: "非標準授權", d: "平台無法辨識授權類型（常見於 fair-code、加上品牌條款或多重授權的專案）。商用或再散布前請直接閱讀 LICENSE 檔。" },
    none: { t: "未標示授權", d: "沒有授權檔時著作權預設保留，可閱讀與學習，但複製、修改或散布需取得作者同意。" },
  };
  function licKind(l) {
    if (!l) return "none";
    if (l === "NOASSERTION") return "noassert";
    if (/^(BUSL|SSPL|Elastic|BSL)/i.test(l)) return "source";
    if (/^AGPL/.test(l)) return "agpl";
    if (/^(L?GPL|EUPL)/.test(l)) return "copyleft";
    if (/^MPL/.test(l)) return "mpl";
    return "permissive";
  }
  const fmt = (n) => (n == null ? "—" : n >= 1e5 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 依星數歷史計算每週成長（星數 / 7 天）
  function growth(hist) {
    if (!hist || hist.length < 2) return null;
    const [d1, s1] = hist[hist.length - 1];
    let j = hist.length - 2;
    const target = new Date(d1) - 28 * 864e5; // 盡量用近 4 週平均，抹平單週雜訊
    while (j > 0 && new Date(hist[j - 1][0]) >= target) j--;
    const [d0, s0] = hist[j];
    const days = (new Date(d1) - new Date(d0)) / 864e5;
    if (days < 3 || s0 == null || s1 == null) return null;
    const perWeek = ((s1 - s0) / days) * 7;
    return { perWeek: Math.round(perWeek), pct: s0 ? Math.round((perWeek / s0) * 10000) / 100 : null, since: d0 };
  }

  // 靜態風險評估：授權、維護、社群、OpenSSF Scorecard、依賴漏洞、已知與自動偵測風險
  function assess(p, todayISO) {
    const today = new Date((todayISO || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
    const daysSince = (d) => (d ? Math.round((today - new Date(d + "T00:00:00Z")) / 864e5) : null);
    const sig = [];
    let s = 90;
    const add = (d, l, t, g) => { s += d; sig.push([d, l, t, g || "meta"]); };
    const lk = licKind(p.lic);
    if (lk === "none") add(-8, "未標示授權", "沒有 LICENSE，法律上預設保留所有權利");
    else if (lk === "noassert") add(-5, "非標準授權", "請閱讀 LICENSE 確認可用範圍");
    else if (lk === "source") add(-4, "原始碼可見授權", p.lic + "：非 OSI 開源授權，使用前確認限制");
    else add(0, "授權明確", p.lic);
    if (p.ar) add(-30, "儲存庫已封存", "不會再收到修補，包含安全更新");
    const ds = daysSince(p.p);
    if (ds !== null) {
      if (ds > 365) add(-15, "超過一年未更新", "最後更新 " + p.p);
      else if (ds > 180) add(-7, "半年以上未更新", "最後更新 " + p.p);
      else add(0, "近期仍有維護", "最後更新 " + p.p);
    } else add(-2, "更新時間未知", "此平台未提供可擷取的更新時間");
    if (p.s != null) {
      if (p.s >= 10000) add(4, "社群規模大", "星數 " + fmt(p.s) + "，被大量使用與檢視");
      else if (p.s >= 1000) add(2, "社群規模中等", "星數 " + fmt(p.s));
      else if (p.s < 100) add(-3, "社群規模小", "星數 " + p.s + "，檢視的人較少");
      const age = daysSince(p.c);
      if (p.f && age !== null && age < 365 && p.s / p.f > 25) add(-10, "星數成長異常", "新專案星數 / Fork 比偏高，請留意刷星");
    } else add(0, "平台無星數", "Bitbucket 不提供公開星數");
    if (p.sc) {
      const v = p.sc.score;
      if (v >= 7) add(4, "OpenSSF Scorecard " + v + "/10", "分支保護、程式碼審查、相依更新等安全實務良好", "sec");
      else if (v >= 4) add(0, "OpenSSF Scorecard " + v + "/10", "安全實務中等，詳見下方各項分數", "sec");
      else add(-6, "OpenSSF Scorecard " + v + "/10", "多項安全實務未落實（如分支保護、簽章發布）", "sec");
    }
    const sec = p.sec;
    if (sec && !sec.stale) {
      const sv = sec.sev || {};
      if (!sec.lockfiles) add(0, "依賴漏洞：無可掃描檔案", "沒有找到 osv-scanner 支援的鎖定檔", "sec");
      else if (sv.critical) add(-10, "依賴漏洞：嚴重 " + sv.critical + " 個", "鎖定檔中有 CVSS ≥ 9 的已知漏洞", "sec");
      else if (sv.high) add(-6, "依賴漏洞：高風險 " + sv.high + " 個", "鎖定檔中有 CVSS ≥ 7 的已知漏洞", "sec");
      else if (sec.vulns) add(-2, "依賴漏洞：" + sec.vulns + " 個中低風險", "鎖定檔中有已知漏洞，嚴重度中低", "sec");
      else add(2, "依賴漏洞：未發現", sec.packages + " 個套件比對 OSV 資料庫無已知漏洞", "sec");
    }
    for (const [k, t] of p.r || []) { const R = RISK[k] || { w: 3, l: k }; add(-R.w, R.l, t, "risk"); }
    for (const [k, t] of p.auto || []) { const R = RISK[k] || { w: 3, l: k }; add(-Math.ceil(R.w / 2), "自動偵測：" + R.l, t, "risk"); }
    s = Math.max(0, Math.min(100, Math.round(s)));
    const level = s >= 80 ? "ok" : s >= 60 ? "warn" : "risk";
    return { score: s, level, label: { ok: "低風險", warn: "需留意", risk: "高風險" }[level], sig };
  }

  // 把 README 的 docker run 指令轉成 docker-compose.yml
  function shellSplit(cmd) {
    const out = []; let cur = ""; let q = null; let has = false;
    for (let i = 0; i < cmd.length; i++) {
      const c = cmd[i];
      if (q) { if (c === q) q = null; else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; has = true; continue; }
      if (c === "\\" && cmd[i + 1] === "\n") { i++; continue; }
      if (/\s/.test(c)) { if (cur || has) { out.push(cur); cur = ""; has = false; } continue; }
      cur += c; has = true;
    }
    if (cur || has) out.push(cur);
    return out;
  }
  function dockerRunToCompose(cmd, fallbackName) {
    const m = cmd.match(/docker\s+run\s+([\s\S]+)/);
    if (!m) return null;
    const t = shellSplit(m[1]);
    const svc = { ports: [], volumes: [], environment: [] };
    let name = null, image = null, rest = [];
    const named = new Set();
    const takes = new Set(["-p", "--publish", "-v", "--volume", "-e", "--env", "--name", "--restart", "--network", "--net", "--hostname", "-h", "--shm-size", "--entrypoint", "-w", "--workdir", "--gpus", "--device", "--add-host", "--cap-add"]);
    for (let i = 0; i < t.length; i++) {
      let a = t[i], v = null;
      if (image) { rest.push(a); continue; }
      if (a.startsWith("--") && a.includes("=")) { [a, v] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]; }
      if (takes.has(a)) {
        if (v === null) v = t[++i];
        v = String(v).replace(/\$\(pwd\)|\$PWD|\$\{PWD\}/g, ".");
        if (a === "-p" || a === "--publish") svc.ports.push(v);
        else if (a === "-v" || a === "--volume") { svc.volumes.push(v); const src = v.split(":")[0]; if (src && !/[\/.~$]/.test(src[0])) named.add(src); }
        else if (a === "-e" || a === "--env") svc.environment.push(v);
        else if (a === "--name") name = v;
        else if (a === "--restart") svc.restart = v;
        else if (a === "--network" || a === "--net") { if (v === "host") svc.network_mode = "host"; }
        else if (a === "--hostname" || a === "-h") svc.hostname = v;
        else if (a === "--shm-size") svc.shm_size = v;
        else if (a === "--entrypoint") svc.entrypoint = v;
        else if (a === "-w" || a === "--workdir") svc.working_dir = v;
        else if (a === "--device") (svc.devices ||= []).push(v);
        else if (a === "--cap-add") (svc.cap_add ||= []).push(v);
        else if (a === "--add-host") (svc.extra_hosts ||= []).push(v);
        continue;
      }
      if (a === "--privileged") { svc.privileged = true; continue; }
      if (a.startsWith("-")) continue; // -d、-it、--rm 等
      image = a;
    }
    if (!image || /[<>]/.test(image) || t.includes("--rm")) return null; // 一次性安裝程式或含佔位符時不轉換
    const svcName = (name || fallbackName || "app").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const q = (x) => (/^[\w./:@-]+$/.test(x) && !/^\d+:\d+$/.test(x) ? x : JSON.stringify(x));
    const L = ["# 由開源實作圖鑑依官方 docker run 指令自動轉換，使用前請對照原專案文件確認", "services:", `  ${svcName}:`, `    image: ${q(image)}`];
    if (name) L.push(`    container_name: ${q(name)}`);
    if (svc.restart) L.push(`    restart: ${svc.restart}`); else L.push("    restart: unless-stopped");
    for (const k of ["hostname", "shm_size", "entrypoint", "working_dir", "network_mode"]) if (svc[k]) L.push(`    ${k}: ${q(svc[k])}`);
    if (svc.privileged) L.push("    privileged: true  # 官方指令要求特權模式，請評估風險");
    if (rest.length) L.push(`    command: ${JSON.stringify(rest)}`);
    for (const [k, arr] of [["ports", svc.ports], ["volumes", svc.volumes], ["environment", svc.environment], ["devices", svc.devices], ["cap_add", svc.cap_add], ["extra_hosts", svc.extra_hosts]]) {
      if (arr && arr.length && !(k === "ports" && svc.network_mode === "host")) { L.push(`    ${k}:`); arr.forEach((x) => L.push(`      - ${q(x)}`)); }
    }
    if (named.size) { L.push("volumes:"); named.forEach((n) => L.push(`  ${n}:`)); }
    return L.join("\n") + "\n";
  }
  function composeFor(p) {
    if (p.compose) return p.compose;
    const cmd = (p.ins || []).find((c) => /docker\s+run\s/.test(c));
    return cmd ? dockerRunToCompose(cmd, p.n.split("/").pop()) : null;
  }

  // 一鍵試用連結
  function trialLinks(p, siteUrl) {
    const L = [];
    const compose = composeFor(p);
    const composeUrl = p.composeUrl || (compose && siteUrl ? `${siteUrl}compose/${p.id}.yml` : null);
    if (composeUrl) L.push({ k: "pwd", t: "Play with Docker", d: "免費的線上 Docker 環境，4 小時內可直接跑起來", href: `https://labs.play-with-docker.com/?stack=${encodeURIComponent(composeUrl)}` });
    if (p.src === "github") L.push({ k: "codespaces", t: "GitHub Codespaces", d: "雲端 VS Code 開發環境，個人帳號每月有免費時數", href: `https://codespaces.new/${p.n}` });
    if (["github", "gitlab", "bitbucket"].includes(p.src)) L.push({ k: "gitpod", t: "Gitpod", d: "雲端開發環境，支援 GitHub / GitLab / Bitbucket", href: `https://gitpod.io/#${p.url}` });
    return { compose, composeUrl, links: L };
  }

  root.Atlas = { SRC, MODES, DIFFS, RISK, LIC, licKind, fmt, esc, growth, assess, dockerRunToCompose, composeFor, trialLinks };
})(typeof window !== "undefined" ? window : globalThis);
