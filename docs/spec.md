# Cullr — 產品 spec（v0）

## 一句話
瀏覽器版 RAW 選片器：**照片不上傳、免費、AI 輔助**，取代要 $139 的 Photo Mechanic
與要月費的 Aftershoot，且檔案全程留在使用者電腦。

## 目標族群
接案 / 婚攝 / 活動攝影——一次要從幾百~幾千張挑出 keeper 的人。

## 為什麼會贏（四個賣點）
1. **免費**（對手收費或月費）
2. **隱私**：照片不離開電腦（對手多要安裝或上傳）
3. **快**：鍵盤流選片
4. **AI 輔助**：自動標出該丟的，人做最後決定（永不自動刪）

## 核心原則
- **AI 標記、人決定**：自動化只縮小候選，不替使用者刪檔。
- **一次只做好一件事**：不重做 Lightroom，只做「選片」這一步（調色是之後的 pipeline 第二環）。
- **照片永遠本機處理**（見 `architecture.md`）。

## v0 範圍（一個週末做出可動 demo）

**必做**
- 開資料夾（File System Access API；Chrome/Edge 桌機）→ fallback：多檔選取
- 虛擬化縮圖牆 + 底部 filmstrip（上千張不卡）
- JPEG 直接渲染；TIFF-based RAW（NEF/CR2/ARW/ORF/RW2/RAF）走內嵌預覽抽取（Web Worker）
- 鍵盤流：`←/→` 切換、`1–5` 星等、`P` 選用、`X` 淘汰、`F` 全螢幕、`Z` 100% loupe
- 篩選：全部 / 已選 / 已淘汰 / 星等≥N
- 輸出：選用清單匯出 `.txt`/`.csv`；複製選中檔到新資料夾（File System Access 寫入）
- 全程前端、零上傳、零帳號

**v0 已完成（scaffold）**
- 開資料夾 → worker 抽預覽 + 算銳利度 → 縮圖牆 + 自動標「可能失焦」

**接手要做**：鍵盤流、篩選、loupe、匯出（見 `App.tsx` 的 TODO）

## 後期 roadmap
- **v1**：連拍 / 相似群組（perceptual hash）— 最有感的自動化
- **v2**：閉眼 / 人臉品質偵測；DNG/CR3 全 RAW 解碼（LibRaw-wasm）
- **整合殺手鐧**：星等寫回 XMP sidecar → Lightroom 也讀得到選片結果

## 技術選型
- Vite + React + TypeScript，純靜態 SPA（部署 GitHub Pages / Cloudflare Pages，零伺服器）
- File System Access API（讀＋寫）、Web Worker（預覽抽取 + 銳利度）、`createImageBitmap`/canvas

## 已知限制
- File System Access = Chromium 桌機限定（Safari/Firefox 需唯讀 fallback）
- 部分格式（ARW）內嵌預覽非滿版 → 真正 100% pixel-peep 需 v2 全 RAW 解碼

## Demo 完成定義
開含 ~500 張 JPEG+NEF 的資料夾 → 滑順瀏覽 → 鍵盤評分 → 100% loupe → 匯出選用清單 → 部署到一個網址。
