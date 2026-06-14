# 開發指南

## 環境需求
- Node 22+（建議 24；專案測試用 Node 內建 type-stripping 直接跑 `.ts`）
- pnpm 10+
- 桌面版 Chrome 或 Edge（File System Access API；Firefox/Safari 目前僅唯讀 fallback）

## 常用指令
```bash
pnpm install          # 安裝依賴
pnpm dev              # 本機開發伺服器（Vite）
pnpm test             # 單元測試（node --test，跑 tests/）
pnpm exec tsc --noEmit  # 型別檢查
pnpm build            # 產出 dist/（tsc -b + vite build）
pnpm preview          # 預覽 production build
```

## 專案結構
```
src/
  lib/
    extract-preview.ts   # RAW 內嵌 JPEG 預覽抽取（已 Node 測試）
    sharpness.ts         # Laplacian variance 銳利度評分（AI 輔助 #1）
  worker/
    preview.worker.ts    # 在 worker 跑抽取 + 銳利度，回傳縮圖 ImageBitmap
  App.tsx                # 開資料夾 + 縮圖牆 +「可能失焦」標記（UI 待長）
  types.ts               # Photo / Worker 訊息型別
tests/                   # 自包含單元測試（不需外部 RAW 檔）
docs/                    # spec / architecture / spike / validation / 本檔
```

## 資料流（一張照片的生命週期）
1. `App` 用 `showDirectoryPicker()` 取得資料夾，遞迴列出支援的檔案 handle。
2. 每個檔 `getFile()` 後丟進 `preview.worker`。
3. Worker：RAW → `extractPreview()` 切出內嵌 JPEG；JPEG/PNG/WebP → 直接用。
   再 `createImageBitmap` 縮成縮圖、`OffscreenCanvas` 取像素算 `laplacianVariance`。
4. Worker 把 `ImageBitmap`（transferable）+ 銳利度回傳，`App` 更新該張狀態。
5. UI 依全體分數的相對門檻（最軟的 ~20%）標「可能失焦」。

## 在瀏覽器實測 v0（scaffold 階段必做一次）
> 演算法核心已 Node 驗證；UI/worker 的瀏覽器整合需手動確認一次。
1. `pnpm dev`，用 Chrome 開出現的 localhost。
2. 點「開啟資料夾」，選一個**含 JPEG 與 NEF/CR2/ARW 的真實資料夾**。
3. 確認：縮圖陸續出現、RAW 也有縮圖、明顯失焦的有「可能失焦」標記。
4. DNG/CR3 顯示「✕ 不支援」屬預期（v0.5 才支援）。

## 新增支援格式時
拿該格式的**真實 RAW 檔**，依 `tests/` 的方式或 `docs/spike-findings.md` 的 Node 流程
驗證 `extractPreview()` 能抽出合理尺寸的預覽，再加進 `extract-preview.ts` 的副檔名集合。

## 程式慣例
- 純前端、零後端、不上傳（見 `docs/architecture.md`）。
- 重運算放 worker，不擋 UI。
- 自動化只標記、不替使用者刪檔。

## 鍵盤操作
- 右手導航：←/→（前/後）、↑/↓（上下一列）
- 左手功能：1–5 星、`（清星）、A 選用、S 淘汰、D 還原、F 放大
- 別名：P=選用、X=淘汰、U=還原
- 放大檢視（loupe）：+/− 縮放、滾輪縮放、拖曳平移、G 九宮格、0 符合畫面、Esc 關
- 匯出：複製選用原檔到資料夾 / 選用清單.txt / CSV
