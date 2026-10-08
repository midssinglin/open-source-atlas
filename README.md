# 開源實作圖鑑 · Open-Source Atlas

從 GitHub、GitLab、Codeberg、Gitea、Bitbucket 精選值得**學習、部署與動手練習**的開源專案，附系統需求、安裝指令、實操練習與靜態安全評估。

🔗 網站：https://midssinglin.github.io/open-source-atlas/

## 功能

- **分類與標籤**：依來源平台、性質（10 類）、實操方式、難度、安全等級篩選
- **排序與搜尋**：星數、Fork 數、最近更新、安全分數、名稱；全文搜尋名稱、用途、語言與標籤
- **詳情頁**：中文概覽、主要功能、實操練習建議、可複製的安裝指令、APA / BibTeX / Markdown 引用與授權說明
- **需求與安全**：軟硬體需求（估計值會標示），0–100 安全分數並逐條列出扣分原因
- **每週自動更新**：GitHub Actions 每週一 03:17（台北時間）重新抓取各平台指標、掃描 README 風險訊號、發現新興熱門專案，並重新部署
- **即時更新按鈕**：在瀏覽器直接向各平台 API 讀取最新星數與更新時間（結果只存在訪客自己的瀏覽器）

## 專案結構

```
index.html                       網站（單一檔案，無建置步驟）
data/curated.json                人工策展內容：分類、概覽、功能、練習、需求、安裝指令、已知風險
data/projects.json               自動產生：策展內容 + 各平台最新指標 + README 自動偵測的風險
data/candidates.json             自動產生：每週發現、尚未審核的熱門候選專案
scripts/update.mjs               資料更新腳本（Node 20+，無外部相依）
.github/workflows/update-and-deploy.yml   排程更新 + 部署到 GitHub Pages
```

## 本機開發

```bash
# 預覽網站（需要本機伺服器，因為頁面會 fetch data/*.json）
python3 -m http.server 8000
# 開啟 http://localhost:8000

# 手動更新資料（GitHub 權杖可提高 API 額度，非必要）
GITHUB_TOKEN=你的權杖 node scripts/update.mjs
```

## 新增專案

1. 在 `data/curated.json` 的 `projects` 陣列加一筆，`id` 格式為 `平台縮寫-owner-repo`（`gh` / `gl` / `cb` / `gt` / `bb`）
2. 推送到 `main`，或到 Actions 頁面手動執行 **更新資料並部署**（勾選「重新抓取各平台資料」）

風險鍵值（`r` 欄位）可用：`pipe` `root` `sock` `priv` `bin` `keys` `telem` `offensive` `beta` `intercept` `exec` `mirror` `dl` `weak` `expose` `token` `lic` `breaking` 等，權重定義在 `index.html` 的 `RISK`。

## 安全分數說明

安全分數是依授權、維護狀態、社群規模、安裝方式與權限需求計算的**靜態風險評估，不是防毒掃描**。執行任何專案前，請依詳情頁的檢查清單自行確認（比對 SHA256、VirusTotal 交叉掃描、先在虛擬機或容器中執行等）。

## 授權

本站程式碼採 MIT 授權。各專案的名稱、描述與 README 引文屬原作者所有，依各自授權使用。
