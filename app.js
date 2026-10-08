// 開源實作圖鑑：網頁互動邏輯（依賴 core.js 的 window.Atlas）
(async function () {
  const { SRC, MODES, DIFFS, LIC, licKind, fmt, esc, growth, assess, trialLinks } = window.Atlas;
  const $ = (id) => document.getElementById(id);
  const SITE = new URL(".", location.href).href;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const getJSON = (u, fallback) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);

  // ---------- 載入資料 ----------
  let DATA;
  try {
    DATA = await fetch("data/projects.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  } catch (e) {
    $("loadingView").textContent = "資料載入失敗（" + e.message + "）。請重新整理；若持續失敗，可能部署尚未完成。";
    return;
  }
  const [CAND, HIST, SEC, PATHS] = await Promise.all([
    getJSON("data/candidates.json", { items: [] }), getJSON("data/history.json", {}),
    getJSON("data/security.json", { projects: {} }), getJSON("data/paths.json", { paths: [] }),
  ]);
  const TODAY = new Date().toISOString().slice(0, 10);
  const SNAP = (DATA.updatedAt || "").slice(0, 10);

  const P = DATA.projects.map((p) => {
    p.sec = SEC.projects?.[p.id] || null;
    p.hist = HIST[p.id] || [];
    p.g = growth(p.hist);
    p.a = assess(p, TODAY);
    p.hay = [p.n, p.d, p.ov, p.lang, p.cat, p.diff, (p.top || []).join(" "), (p.feat || []).join(" "), p.modes.map((m) => MODES[m]).join(" "), SRC[p.src].n].join(" ").toLowerCase();
    return p;
  });
  const byId = new Map(P.map((p) => [p.id, p]));
  const CI = (CAND.items || []).map((c) => Object.assign({ r: [], auto: [] }, c, { a: assess(Object.assign({ r: [], auto: [] }, c), TODAY) }));
  $("loadingView").hidden = true;

  // ---------- 收藏 ----------
  let favs = new Set(store.get("atlas-favs", []));
  const saveFavs = () => { store.set("atlas-favs", [...favs]); $("favN").textContent = favs.size || ""; };
  function toggleFav(id) {
    favs.has(id) ? favs.delete(id) : favs.add(id);
    saveFavs();
    toast(favs.has(id) ? "已加入收藏" : "已移出收藏");
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => { b.setAttribute("aria-pressed", favs.has(id)); b.title = favs.has(id) ? "取消收藏" : "加入收藏"; });
    if (view === "favs") renderFavs();
  }
  const favBtn = (id, big) => `<button class="fav${big ? " big" : ""}" data-fav="${id}" aria-pressed="${favs.has(id)}" title="${favs.has(id) ? "取消收藏" : "加入收藏"}" aria-label="收藏"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>${big ? '<span>收藏</span>' : ""}</button>`;

  // ---------- 狀態與篩選 ----------
  const state = { q: "", sort: store.get("atlas-sort", "stars"), src: new Set(), cat: new Set(), modes: new Set(), safe: new Set(), diff: new Set() };
  $("sort").value = state.sort;
  const CATS = [...new Set(P.map((p) => p.cat))];
  const SAFE = [["ok", "低風險"], ["warn", "需留意"], ["risk", "高風險"]];
  function matches(p, skip) {
    if (state.q) { const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean); if (!terms.every((t) => p.hay.includes(t))) return false; }
    if (skip !== "src" && state.src.size && !state.src.has(p.src)) return false;
    if (skip !== "cat" && state.cat.size && !state.cat.has(p.cat)) return false;
    if (skip !== "modes" && state.modes.size && ![...state.modes].every((m) => p.modes.includes(m))) return false;
    if (skip !== "safe" && state.safe.size && !state.safe.has(p.a.level)) return false;
    if (skip !== "diff" && state.diff.size && !state.diff.has(p.diff)) return false;
    return true;
  }
  function chipGroup(el, key, opts, countFn) {
    el.innerHTML = opts.map(([v, l]) => {
      const c = countFn(v), on = state[key].has(v);
      return `<button class="chip" data-k="${key}" data-v="${esc(v)}" aria-pressed="${on}" ${!c && !on ? "disabled" : ""}>${esc(l)}<span class="c">${c}</span></button>`;
    }).join("");
  }
  function renderFilters() {
    const cnt = (key, test) => (v) => P.filter((p) => matches(p, key) && test(p, v)).length;
    chipGroup($("f-src"), "src", Object.keys(SRC).map((k) => [k, SRC[k].n]), cnt("src", (p, v) => p.src === v));
    chipGroup($("f-cat"), "cat", CATS.map((c) => [c, c]), cnt("cat", (p, v) => p.cat === v));
    chipGroup($("f-modes"), "modes", Object.entries(MODES), cnt("modes", (p, v) => p.modes.includes(v)));
    chipGroup($("f-safe"), "safe", SAFE, cnt("safe", (p, v) => p.a.level === v));
    chipGroup($("f-diff"), "diff", DIFFS.map((d) => [d, d]), cnt("diff", (p, v) => p.diff === v));
    const n = ["src", "cat", "modes", "safe", "diff"].reduce((a, k) => a + state[k].size, 0);
    $("activeCount").textContent = n ? `已選 ${n}` : "";
  }
  const num = (v) => (v == null ? -Infinity : v);
  const SORTS = {
    stars: (a, b) => num(b.s) - num(a.s) || (b.p || "").localeCompare(a.p || ""),
    growth: (a, b) => num(b.g?.perWeek) - num(a.g?.perWeek) || num(b.s) - num(a.s),
    forks: (a, b) => num(b.f) - num(a.f) || num(b.s) - num(a.s),
    recent: (a, b) => (b.p || "").localeCompare(a.p || "") || num(b.s) - num(a.s),
    safety: (a, b) => b.a.score - a.a.score || num(b.s) - num(a.s),
    name: (a, b) => a.n.split("/").pop().localeCompare(b.n.split("/").pop()),
  };
  const growthTag = (p) => (p.g && p.g.perWeek > 0 ? `<span class="tag up">▲ ${fmt(p.g.perWeek)}/週</span>` : "");
  function statCell(p) {
    if (state.sort === "forks") return `<span class="big num">${fmt(p.f)}</span>Fork`;
    if (state.sort === "recent") return `<span class="big num">${p.p ? p.p.slice(5) : "—"}</span>${p.p ? p.p.slice(0, 4) : "未知"}`;
    if (state.sort === "growth") return p.g ? `<span class="big num">${p.g.perWeek > 0 ? "+" : ""}${fmt(p.g.perWeek)}</span>星 / 週` : `<span class="big num">—</span>累積中`;
    return `<span class="big num">${p.s == null ? "—" : fmt(p.s)}</span>${p.s == null ? "無星數" : "星數"}`;
  }
  function rowHTML(p) {
    const i = p.n.lastIndexOf("/");
    return `<div class="row" data-go="${p.id}">
      <span class="mark ${p.src}" title="${SRC[p.src].n}">${SRC[p.src].m}</span>
      <span class="rmain">
        <a class="rname" href="#${p.id}"><span class="owner">${esc(p.n.slice(0, i))}/</span>${esc(p.n.slice(i + 1))}</a>
        <span class="rdesc">${esc(p.ov)}</span>
        <span class="tags"><span class="tag cat">${esc(p.cat)}</span><span class="tag">${esc(p.diff)}</span>${growthTag(p)}${p.lang ? `<span class="tag">${esc(p.lang)}</span>` : ""}${p.modes.map((m) => `<span class="tag">${MODES[m]}</span>`).join("")}</span>
      </span>
      <span class="stat">${statCell(p)}</span>
      <span class="safe"><span class="pill ${p.a.level}"><i></i>${p.a.label}</span><span class="sc">安全 ${p.a.score}/100</span></span>
      ${favBtn(p.id)}
    </div>`;
  }
  function renderList() {
    renderFilters();
    const list = P.filter((p) => matches(p)).sort(SORTS[state.sort]);
    $("count").textContent = `顯示 ${list.length} / ${P.length} 個專案`;
    $("list").innerHTML = list.length ? list.map(rowHTML).join("") : `<div class="empty">沒有符合條件的專案。試試減少篩選條件或換個關鍵字。</div>`;
  }

  // ---------- 收藏頁 ----------
  function renderFavs() {
    const list = [...favs].map((id) => byId.get(id)).filter(Boolean);
    $("favCount").textContent = list.length ? `${list.length} 個收藏` : "";
    $("favList").innerHTML = list.length ? list.map(rowHTML).join("") :
      `<div class="empty">還沒有收藏。在專案列表或詳情頁按 ☆ 就能加入，收藏會存在這台裝置的瀏覽器中。</div>`;
  }
  $("favExport").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "open-source-atlas", exportedAt: new Date().toISOString(), favorites: [...favs], progress: store.get("atlas-progress", {}) }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `atlas-favorites-${TODAY}.json` });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("已匯出收藏與學習進度");
  };
  $("favImport").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const ids = (j.favorites || []).filter((id) => byId.has(id));
      ids.forEach((id) => favs.add(id)); saveFavs();
      if (j.progress) { const cur = store.get("atlas-progress", {}); for (const [k, v] of Object.entries(j.progress)) cur[k] = [...new Set([...(cur[k] || []), ...v])]; store.set("atlas-progress", cur); }
      toast(`已匯入 ${ids.length} 個收藏`); renderFavs();
    } catch (err) { toast("檔案格式不正確，請選擇從本站匯出的 JSON"); }
    e.target.value = "";
  };

  // ---------- 學習路徑 ----------
  function renderPaths() {
    const prog = store.get("atlas-progress", {});
    $("pathList").innerHTML = (PATHS.paths || []).map((path) => {
      const steps = path.steps.filter((s) => byId.has(s.id));
      const done = (prog[path.id] || []).filter((id) => steps.some((s) => s.id === id)).length;
      const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
      return `<article class="path">
        <header><div><h3>${esc(path.title)}</h3><p>${esc(path.desc)}</p></div>
          <div class="pmeta"><span class="tag">${esc(path.level)}</span><span class="tag">約 ${esc(path.time)}</span><span class="pnum num">${done}/${steps.length}</span></div></header>
        <div class="meter"><i style="width:${pct}%;background:var(--accent)"></i></div>
        <ol class="steps">${steps.map((s, i) => {
          const p = byId.get(s.id), on = (prog[path.id] || []).includes(s.id);
          return `<li class="${on ? "done" : ""}">
            <label class="chk"><input type="checkbox" data-path="${path.id}" data-step="${s.id}" ${on ? "checked" : ""}><span class="num">${i + 1}</span></label>
            <div><a href="#${p.id}" class="mono">${esc(p.n)}</a> <span class="pill ${p.a.level}" style="font-size:11px"><i></i>${p.a.label}</span><p>${esc(s.goal)}</p></div>
          </li>`;
        }).join("")}</ol></article>`;
    }).join("") || `<div class="empty">尚未設定學習路徑。</div>`;
  }
  document.addEventListener("change", (e) => {
    const c = e.target.closest("[data-path]"); if (!c) return;
    const prog = store.get("atlas-progress", {}); const set = new Set(prog[c.dataset.path] || []);
    c.checked ? set.add(c.dataset.step) : set.delete(c.dataset.step);
    prog[c.dataset.path] = [...set]; store.set("atlas-progress", prog); renderPaths();
  });

  // ---------- 候選 ----------
  function renderCand() {
    $("candCount").textContent = `${CI.length} 個候選專案，依日均星數排序`;
    $("candAt").textContent = CAND.updatedAt ? "抓取於 " + CAND.updatedAt.slice(0, 10) : "";
    $("candList").innerHTML = CI.length ? CI.map((p) => {
      const i = p.n.lastIndexOf("/");
      return `<div class="row ext"><span class="mark ${p.src}" title="${SRC[p.src].n}">${SRC[p.src].m}</span>
        <span class="rmain"><a class="rname" href="${esc(p.url)}" target="_blank" rel="noopener"><span class="owner">${esc(p.n.slice(0, i))}/</span>${esc(p.n.slice(i + 1))} ↗</a>
          <span class="rdesc">${esc(p.d || "（沒有描述）")}</span>
          <span class="tags"><span class="tag">未審核</span>${p.lang ? `<span class="tag">${esc(p.lang)}</span>` : ""}${(p.top || []).slice(0, 4).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}${p.c ? `<span class="tag">建立於 ${p.c}</span>` : ""}</span></span>
        <span class="stat"><span class="big num">${fmt(p.s)}</span>${p.g != null ? `日均 ${p.g} 星` : "星數"}</span>
        <span class="safe"><span class="pill ${p.a.level}"><i></i>${p.a.label}</span><span class="sc">初評 ${p.a.score}/100</span></span></div>`;
    }).join("") : `<div class="empty">第一次排程執行後，這裡會出現每週自動抓到的新興熱門專案。</div>`;
  }

  // ---------- 詳情頁 ----------
  function cites(p) {
    const i = p.n.lastIndexOf("/"), o = p.n.slice(0, i), r = p.n.slice(i + 1), y = (p.p || SNAP).slice(0, 4), plat = SRC[p.src].n;
    return {
      APA: `${o}. (${y}). ${r} [Computer software]. ${plat}. ${p.url}`,
      BibTeX: `@software{${(o + "_" + r).replace(/[^A-Za-z0-9_]/g, "_")}_${y},\n  author = {${o}},\n  title = {${r}},\n  year = {${y}},\n  publisher = {${plat}},\n  url = {${p.url}},\n  note = {License: ${p.lic || "unspecified"}. Accessed ${TODAY}}\n}`,
      Markdown: `[${p.n}](${p.url}) — ${p.lic || "未標示授權"}（${plat}，取用於 ${TODAY}）`,
    };
  }
  const ul = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="note">文件未特別列出。</p>');
  function sparkline(h) {
    if (!h || h.length < 2) return `<p class="note">星數歷史從 ${h && h[0] ? h[0][0] : "下次更新"} 開始累積，每週記錄一次，兩週後就能看到趨勢。</p>`;
    const W = 320, H = 90, pad = 6, xs = h.map((x) => new Date(x[0]).getTime()), ys = h.map((x) => x[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys) || 1;
    const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - pad * 2), Y = (v) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - pad * 2 - 12);
    const pts = h.map((x, i) => `${X(xs[i]).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(" ");
    const last = h.at(-1);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="星數從 ${fmt(ys[0])} 變為 ${fmt(last[1])}">
      <polygon points="${X(xs[0])},${H - pad} ${pts} ${X(xs.at(-1))},${H - pad}" fill="var(--accent-soft)"/>
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${X(xs.at(-1))}" cy="${Y(last[1])}" r="3.5" fill="var(--accent)"/>
      <text x="${W - pad}" y="12" text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--mono)">${fmt(last[1])}</text>
      <text x="${pad}" y="12" font-size="11" fill="var(--muted)" font-family="var(--mono)">${fmt(ys[0])}</text></svg>
      <p class="note">${h[0][0]} → ${last[0]}，共 ${h.length} 筆紀錄${h.length >= 2 && (() => { const g = growth(h); return g ? `，近期每週 ${g.perWeek >= 0 ? "+" : ""}${fmt(g.perWeek)} 星（${g.pct ?? 0}%）` : ""; })()}</p>`;
  }
  function treeHTML(p) {
    if (!p.tree || !p.tree.length) return '<p class="note">下次每週更新後會顯示頂層檔案結構。</p>';
    return `<ul class="tree">${p.tree.map(([n, t]) => `<li class="${t}"><a href="${esc((p.lb || p.url + "/") + n)}" target="_blank" rel="noopener">${t === "d" ? "▸ " : ""}${esc(n)}${t === "d" ? "/" : ""}</a></li>`).join("")}</ul>`;
  }
  function secHTML(p) {
    let h = "";
    if (p.sc) {
      h += `<h4>OpenSSF Scorecard <span class="mono">${p.sc.score}/10</span></h4><ul class="checks">${p.sc.checks.slice(0, 18).map(([n, s]) =>
        `<li><span>${esc(n)}</span><span class="bar"><i style="width:${s * 10}%;background:${s >= 7 ? "var(--ok)" : s >= 4 ? "var(--warn)" : "var(--risk)"}"></i></span><span class="mono num">${s}</span></li>`).join("")}</ul>
        <p class="note">資料日期 ${p.sc.date}，來源 <a href="https://scorecard.dev/viewer/?uri=${p.src === "gitlab" ? "gitlab.com" : "github.com"}/${esc(p.n)}" target="_blank" rel="noopener">scorecard.dev</a></p>`;
    } else h += `<p class="note">OpenSSF Scorecard 目前只涵蓋 GitHub 等部分平台，此專案沒有資料。</p>`;
    const s = p.sec;
    if (s) {
      const sv = s.sev || {};
      h += `<h4>依賴漏洞（OSV）</h4>`;
      if (!s.lockfiles) h += `<p class="note">沒有找到可掃描的鎖定檔（package-lock.json、go.mod、Cargo.lock 等）。</p>`;
      else {
        h += `<p class="sev">${["critical", "high", "medium", "low"].map((k) => `<span class="sv ${k}">${{ critical: "嚴重", high: "高", medium: "中", low: "低" }[k]} <b class="num">${sv[k] || 0}</b></span>`).join("")}</p>
          <p class="note">掃描 ${s.lockfiles} 個鎖定檔、${s.packages} 個套件，共 ${s.vulns} 個已知漏洞（${s.date}${s.stale ? "，本週掃描失敗，沿用舊結果" : ""}）。漏洞可能只出現在開發用依賴，不一定影響使用者。</p>`;
        if (s.top && s.top.length) h += `<ul class="vulns">${s.top.map(([id, sev, pkg]) => `<li><a class="mono" href="https://osv.dev/vulnerability/${encodeURIComponent(id)}" target="_blank" rel="noopener">${esc(id)}</a><span class="sv ${sev}">${{ critical: "嚴重", high: "高", medium: "中", low: "低", unknown: "未知" }[sev]}</span><span class="mono pkg">${esc(pkg)}</span></li>`).join("")}</ul>`;
      }
    } else h += `<h4>依賴漏洞（OSV）</h4><p class="note">下次每週更新會用 osv-scanner 掃描這個專案的依賴。</p>`;
    return h;
  }
  function trialHTML(p) {
    const t = trialLinks(p, SITE);
    let h = "";
    if (t.compose) h += `<div class="code"><button class="copy" data-copy="compose">複製</button><pre id="composeBox">${esc(t.compose)}</pre></div>
      <div class="dlinks" style="margin-top:8px"><button class="btn" id="composeDl">下載 docker-compose.yml</button></div>
      <p class="note">存成 docker-compose.yml 後執行 <span class="mono">docker compose up -d</span>。</p>`;
    else if (p.composeUrl) h += `<p>官方提供 compose 檔：<a href="${esc(p.composeUrl)}" target="_blank" rel="noopener" class="mono">docker-compose.yml ↗</a></p>`;
    if (t.links.length) h += `<ul class="trial">${t.links.map((l) => `<li><a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.t)} ↗</a><span>${esc(l.d)}</span></li>`).join("")}</ul>`;
    return h || '<p class="note">這個專案需要實體硬體或特定作業系統，沒有適合的線上試用方式。</p>';
  }
  function renderDetail(p) {
    const a = p.a, lk = LIC[licKind(p.lic)], C = cites(p), i = p.n.lastIndexOf("/");
    const col = { ok: "var(--ok)", warn: "var(--warn)", risk: "var(--risk)" }[a.level];
    const cmd = p.ins && p.ins.length ? `<div class="code"><button class="copy" data-copy="ins">複製</button><pre>${p.ins.map((c) => `<span class="ps">$ </span>${esc(c)}`).join("\n")}</pre></div>` : '<p class="note">文件未提供可直接複製的指令，請依官方網站的安裝說明操作。</p>';
    const groups = [["sec", "安全實務與依賴"], ["risk", "安裝與執行風險"], ["meta", "授權、維護與社群"]];
    $("detailView").innerHTML = `
    <a class="back" href="#">← 回到專案列表</a>
    <div class="dhead">
      <span class="mark ${p.src}">${SRC[p.src].m}</span>
      <div style="min-width:0">
        <h2><span style="color:var(--muted);font-weight:400">${esc(p.n.slice(0, i))}/</span>${esc(p.n.slice(i + 1))}</h2>
        ${p.d ? `<p class="orig">${esc(p.d)}</p>` : ""}
        <div class="dlinks">
          <a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">在 ${SRC[p.src].n} 查看原始碼 ↗</a>
          ${p.home ? `<a class="btn" href="${esc(p.home)}" target="_blank" rel="noopener">官方網站 ↗</a>` : ""}
          ${favBtn(p.id, true)}
          <button class="btn" id="shareBtn">複製分享連結</button>
        </div>
      </div>
    </div>
    <div class="facts">
      <div class="fact"><span>星數</span><b class="num">${p.s == null ? "—" : p.s.toLocaleString()}</b></div>
      <div class="fact"><span>每週成長</span><b class="num">${p.g ? (p.g.perWeek >= 0 ? "+" : "") + fmt(p.g.perWeek) : "累積中"}</b></div>
      <div class="fact"><span>Fork</span><b class="num">${p.f == null ? "—" : p.f.toLocaleString()}</b></div>
      <div class="fact"><span>開放議題</span><b class="num">${p.i == null ? "—" : p.i.toLocaleString()}</b></div>
      <div class="fact"><span>主要語言</span><b>${esc(p.lang || "—")}</b></div>
      <div class="fact"><span>授權</span><b>${esc(p.lic || "未標示")}</b></div>
      <div class="fact"><span>最後更新</span><b class="num">${p.p || "—"}</b></div>
    </div>
    <div class="dgrid">
      <div style="min-width:0">
        <section class="sec"><h3>概覽</h3><p>${esc(p.ov)}</p>
          <div class="tags"><span class="tag cat">${esc(p.cat)}</span><span class="tag">${esc(p.diff)}</span>${p.modes.map((m) => `<span class="tag">${MODES[m]}</span>`).join("")}${(p.top || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
          ${p.ai ? `<p class="note">這份介紹由 AI 依 README 起草（${esc(p.ai)}），經維護者審核後收錄。</p>` : ""}</section>
        <section class="sec"><h3>主要功能</h3>${ul(p.feat)}</section>
        <section class="sec"><h3>實操練習</h3><ol class="tasks">${p.tasks.map((t) => `<li><span>${esc(t)}</span></li>`).join("")}</ol></section>
        <section class="sec"><h3>安裝與部署</h3>${cmd}${p.insN ? `<p class="note">${esc(p.insN)}</p>` : ""}</section>
        <section class="sec"><h3>一鍵試用</h3>${trialHTML(p)}</section>
        <section class="sec"><h3>系統需求</h3><div class="req">
          <div><h4>軟體</h4>${ul(p.sw)}</div>
          <div><h4>硬體${p.he && p.hw && p.hw.length ? '<span class="est">含估計值</span>' : ""}</h4>${ul(p.hw)}</div>
          <div><h4>作業系統 / 平台</h4>${ul(p.os)}</div></div></section>
        <section class="sec"><h3>README 原文</h3>${p.hasReadme ? `<button class="btn" id="readmeBtn">載入 README</button><div id="readmeBox" class="readme" hidden></div><p class="note">內容來自原專案，版權與授權屬原作者（${esc(p.lic || "未標示授權")}）。</p>` : '<p class="note">下次每週更新後會收錄 README 原文。</p>'}</section>
        <section class="sec"><h3>檔案結構</h3>${treeHTML(p)}</section>
      </div>
      <div style="min-width:0">
        <section class="sec panel"><h3>安全評估</h3>
          <div class="gauge"><span class="n num" style="color:${col}">${a.score}</span><span class="pill ${a.level}"><i></i>${a.label}</span></div>
          <div class="meter" role="img" aria-label="安全分數 ${a.score} / 100"><i style="width:${a.score}%;background:${col}"></i></div>
          <div class="scale"><span>0</span><span>60</span><span>80</span><span>100</span></div>
          ${groups.map(([g, t]) => { const items = a.sig.filter((x) => x[3] === g); return items.length ? `<h4 class="sg">${t}</h4><ul class="signals">${items.map(([d, l, x]) => `<li><span class="d num ${d < 0 ? "neg" : d > 0 ? "pos" : ""}">${d > 0 ? "+" + d : d < 0 ? d : "·"}</span><span><b>${esc(l)}</b><br><span style="color:var(--muted)">${esc(x)}</span></span></li>`).join("")}</ul>` : ""; }).join("")}
          <details class="check"><summary>執行前的安全檢查清單</summary><ol>
            <li>只從上方的官方原始碼連結或官方網站下載，避開同名的轉載與「破解版」。</li>
            <li>遇到 <span class="mono">curl … | sh</span> 這類指令，先把腳本下載下來讀過再執行。</li>
            <li>下載執行檔後比對官方公布的 SHA256 或簽章；也可把檔案上傳到 VirusTotal 交叉掃描。</li>
            <li>第一次執行時放在虛擬機或容器中，不要用主力電腦的管理員帳號。</li>
            <li>用 osv-scanner、npm audit 或 pip-audit 檢查你實際安裝的版本。</li>
            <li>對外開放的服務要改掉預設密碼，並放在反向代理與 HTTPS 之後。</li></ol></details>
        </section>
        <section class="sec panel"><h3>安全細節</h3>${secHTML(p)}</section>
        <section class="sec panel"><h3>星數趨勢</h3>${sparkline(p.hist)}</section>
        <section class="sec panel"><h3>授權與引用</h3>
          <div class="lic-box"><b>${esc(p.lic || "未標示授權")}</b><span>${lk.t}：${lk.d}</span></div>
          ${p.q ? `<blockquote>“${esc(p.q)}”<cite>— ${esc(p.n)} README，${esc(p.lic || "未標示授權")}</cite></blockquote>` : ""}
          <div style="margin-top:16px">
            <div class="cite-tabs" role="tablist">${Object.keys(C).map((k, j) => `<button role="tab" data-cite="${k}" aria-selected="${j === 0}">${k}</button>`).join("")}</div>
            <div class="code"><button class="copy" data-copy="cite">複製</button><pre id="citeBox" style="white-space:pre-wrap;word-break:break-word">${esc(C.APA)}</pre></div>
            <p class="note">引用程式碼片段時，請一併附上原專案連結與授權名稱。</p></div>
        </section>
      </div>
    </div>`;
    const v = $("detailView");
    v.querySelectorAll("[data-cite]").forEach((b) => (b.onclick = () => { v.querySelectorAll("[data-cite]").forEach((x) => x.setAttribute("aria-selected", x === b)); $("citeBox").textContent = C[b.dataset.cite]; }));
    v.querySelector('[data-copy="cite"]').onclick = (e) => copy($("citeBox").textContent, e.target);
    const ci = v.querySelector('[data-copy="ins"]'); if (ci) ci.onclick = (e) => copy(p.ins.join("\n"), e.target);
    const cc = v.querySelector('[data-copy="compose"]'); if (cc) cc.onclick = (e) => copy($("composeBox").textContent, e.target);
    const dl = $("composeDl"); if (dl) dl.onclick = () => {
      const a2 = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([$("composeBox").textContent], { type: "text/yaml" })), download: "docker-compose.yml" });
      document.body.appendChild(a2); a2.click(); a2.remove();
    };
    $("shareBtn").onclick = (e) => copy(`${SITE}p/${p.id}/`, e.target, "已複製分享連結");
    const rb = $("readmeBtn"); if (rb) rb.onclick = () => loadReadme(p, rb);
  }

  // ---------- README（marked + DOMPurify，按需載入）----------
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  let mdReady = null;
  async function loadReadme(p, btn) {
    btn.disabled = true; btn.textContent = "載入中…";
    try {
      mdReady ||= Promise.all([loadScript("https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"), loadScript("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js")]);
      const [text] = await Promise.all([fetch(`data/readme/${p.id}.md`).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }), mdReady]);
      const box = $("readmeBox");
      box.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text, { gfm: true }), { ADD_ATTR: ["target"] });
      const abs = (u) => /^([a-z]+:|#|\/\/)/i.test(u);
      box.querySelectorAll("img[src]").forEach((img) => { const s = img.getAttribute("src"); if (!abs(s)) img.src = (p.rb || "") + s.replace(/^\.?\//, ""); img.loading = "lazy"; });
      box.querySelectorAll("a[href]").forEach((a) => { const h = a.getAttribute("href"); if (!abs(h)) a.href = (p.lb || p.url + "/") + h.replace(/^\.?\//, ""); if (!h.startsWith("#")) { a.target = "_blank"; a.rel = "noopener"; } });
      box.hidden = false; btn.remove();
    } catch (e) { btn.disabled = false; btn.textContent = "載入失敗，再試一次"; }
  }

  // ---------- 共用：通知與複製 ----------
  let tt;
  function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 1800); }
  function copy(text, btn, okMsg) {
    const fallback = () => { const pre = btn.parentElement.querySelector("pre"); if (pre) { const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(rg); toast("已選取文字，請按 Ctrl/⌘ + C 複製"); } else toast(text); };
    try { navigator.clipboard.writeText(text).then(() => toast(okMsg || "已複製"), fallback); } catch (e) { fallback(); }
  }

  // ---------- 路由與分頁 ----------
  let view = "main";
  const VIEWS = { main: "listView", favs: "favView", paths: "pathView", cand: "candView" };
  function route() {
    const h = location.hash.slice(1), p = byId.get(h);
    Object.values(VIEWS).forEach((v) => ($(v).hidden = true)); $("detailView").hidden = true;
    if (p) { renderDetail(p); $("detailView").hidden = false; window.scrollTo(0, 0); document.title = p.n + " · 開源實作圖鑑"; return; }
    view = VIEWS[h] ? h : "main";
    document.title = "開源實作圖鑑";
    document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === view));
    if (view === "favs") renderFavs(); else if (view === "paths") renderPaths(); else if (view === "cand") renderCand(); else renderList();
    $(VIEWS[view]).hidden = false;
  }
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.tab === "main" ? "" : b.dataset.tab; if (b.dataset.tab === "main") route(); }));

  // ---------- 即時更新（瀏覽器直接讀各平台 API）----------
  const LIVE_KEY = "atlas-live-v1", COOL_KEY = "atlas-live-cool", COOLDOWN = 5 * 60 * 1000;
  const API = {
    github: (n) => [`https://api.github.com/repos/${n}`, (r) => ({ s: r.stargazers_count, f: r.forks_count, i: r.open_issues_count, p: (r.pushed_at || "").slice(0, 10), ar: r.archived })],
    gitlab: (n) => [`https://gitlab.com/api/v4/projects/${encodeURIComponent(n)}`, (r) => ({ s: r.star_count, f: r.forks_count, i: r.open_issues_count, p: (r.last_activity_at || "").slice(0, 10), ar: r.archived })],
    codeberg: (n) => [`https://codeberg.org/api/v1/repos/${n}`, (r) => ({ s: r.stars_count, f: r.forks_count, i: r.open_issues_count, p: (r.updated_at || "").slice(0, 10), ar: r.archived })],
    gitea: (n) => [`https://gitea.com/api/v1/repos/${n}`, (r) => ({ s: r.stars_count, f: r.forks_count, i: r.open_issues_count, p: (r.updated_at || "").slice(0, 10), ar: r.archived })],
    bitbucket: (n) => [`https://api.bitbucket.org/2.0/repositories/${n}`, (r) => ({ p: (r.updated_on || "").slice(0, 10) })],
  };
  const hhmm = (iso) => { const d = new Date(iso); return d.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" }) + " " + d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }); };
  const liveLine = (m) => ($("liveStatus").innerHTML = m);
  function applyLive(cache) {
    for (const p of P) { const v = cache.v[p.id]; if (!v) continue; for (const k in v) if (v[k] !== null && v[k] !== undefined && v[k] !== "") p[k] = v[k]; p.a = assess(p, TODAY); }
    liveLine(`<span class="dot"></span>即時數據 ${hhmm(cache.at)}`);
    route();
  }
  async function liveRefresh() {
    const btn = $("liveBtn"); btn.disabled = true; btn.classList.add("busy"); liveLine("正在向各平台讀取…");
    const res = {}, stats = {}; let ghLimited = false; const q = [...P];
    async function worker() {
      while (q.length) {
        const p = q.shift(), st = stats[p.src] || (stats[p.src] = { ok: 0, n: 0 }); st.n++;
        if (p.src === "github" && ghLimited) continue;
        const [url, map] = API[p.src](p.n);
        try {
          const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
          const r = await fetch(url, { signal: ctl.signal }); clearTimeout(tm);
          if ((r.status === 403 || r.status === 429) && p.src === "github") { ghLimited = true; continue; }
          if (!r.ok) continue; res[p.id] = map(await r.json()); st.ok++;
        } catch (e) {}
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    btn.classList.remove("busy");
    const n = Object.keys(res).length;
    const parts = Object.keys(SRC).filter((k) => stats[k]).map((k) => `${SRC[k].n} ${stats[k].ok}/${stats[k].n}`);
    if (n) { const cache = { at: new Date().toISOString(), v: res }; store.set(LIVE_KEY, cache); applyLive(cache); }
    const fails = Object.keys(stats).filter((k) => stats[k].ok < stats[k].n).map((k) => SRC[k].n);
    toast(n ? `已更新 ${n} 個專案：${parts.join("、")}` : "目前無法連到平台，沿用每週資料");
    if (fails.length) liveLine(`${n ? '<span class="dot"></span>即時數據 ' + hhmm(new Date().toISOString()) + " · " : ""}${fails.join("、")} 部分未更新${ghLimited ? "（GitHub 每小時限 60 次）" : ""}`);
    store.set(COOL_KEY, Date.now());
    setTimeout(() => (btn.disabled = false), COOLDOWN);
  }
  $("liveBtn").addEventListener("click", liveRefresh);
  { const left = COOLDOWN - (Date.now() - (store.get(COOL_KEY, 0) || 0)); if (left > 0) { $("liveBtn").disabled = true; setTimeout(() => ($("liveBtn").disabled = false), left); } }

  // ---------- 初始化 ----------
  const bySrc = {}; P.forEach((p) => (bySrc[p.src] = (bySrc[p.src] || 0) + 1));
  $("tally").innerHTML = `<span><b>${P.length}</b> 個專案</span>` + Object.keys(SRC).map((k) => `<span>${SRC[k].n} <b>${bySrc[k] || 0}</b></span>`).join("");
  $("snap").textContent = "每週資料 " + SNAP; $("snap2").textContent = SNAP;
  $("mainN").textContent = P.length; $("candN").textContent = CI.length || ""; $("pathN").textContent = (PATHS.paths || []).length || "";
  saveFavs();
  liveLine("每週資料 " + SNAP);
  if (DATA.repo) $("adminLine").innerHTML = `維護者：<a href="https://github.com/${esc(DATA.repo)}/actions/workflows/update-and-deploy.yml" target="_blank" rel="noopener">在 GitHub Actions 手動執行完整更新</a> · <a href="https://github.com/${esc(DATA.repo)}" target="_blank" rel="noopener">原始碼</a>`;

  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fav]"); if (f) { e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); return; }
    const c = e.target.closest(".chip"); if (c) { const set = state[c.dataset.k], v = c.dataset.v; set.has(v) ? set.delete(v) : set.add(v); renderList(); return; }
    const row = e.target.closest(".row[data-go]"); if (row && !e.target.closest("a,button,input,label")) location.hash = row.dataset.go;
  });
  let deb; $("q").addEventListener("input", (e) => { clearTimeout(deb); deb = setTimeout(() => { state.q = e.target.value.trim(); renderList(); }, 120); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; store.set("atlas-sort", state.sort); renderList(); });
  $("reset").addEventListener("click", () => { ["src", "cat", "modes", "safe", "diff"].forEach((k) => state[k].clear()); state.q = ""; $("q").value = ""; renderList(); });
  $("railToggle").addEventListener("click", () => { const b = $("railBody"), o = b.dataset.open !== "true"; b.dataset.open = o; $("railToggle").setAttribute("aria-expanded", o); });
  window.addEventListener("hashchange", route);
  route();
  { const c = store.get(LIVE_KEY, null); if (c && c.at > (DATA.updatedAt || "") && Date.now() - new Date(c.at) < 7 * 864e5) applyLive(c); }
})();
