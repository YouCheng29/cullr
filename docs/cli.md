# CLI — Cullr 的 headless / 自動化半邊

互動選片（看照片、判斷）永遠在 GUI；CLI 做**可腳本化、非視覺**的部分，並與瀏覽器
app **共用同一份純 core**（`src/lib/extract-preview.ts` 等）——一份邏輯、兩個前端
（browser worker + Node CLI）。

## 用法
```bash
# 報告資料夾內容（哪些 RAW 有可抽預覽）
node cli/cullr.ts <folder>

# 把所有 RAW 的內嵌預覽批次抽成 JPEG 到 <out-dir>
node cli/cullr.ts <folder> --extract <out-dir>

# 也有 npm script
pnpm cull <folder> [--extract <out-dir>]
```

範例輸出：
```
  ✓ NEF   shot001.nef  3008x2000
  ✕ DNG   shot002.dng  (內嵌預覽無法讀取，DNG/CR3 留待 v0.5)
  image   ref.jpg
總結: 2 個 RAW（1 有預覽, 1 無）、1 張一般圖片
```

## 定位
- **GUI = 心臟**（互動選片）；**CLI = 互補的自動化**（批次抽預覽、報告、之後接 cron/NAS/server）。
- 別讓 CLI 拖延「GUI 能用」。

## Roadmap
- **v0（現在）**：批次抽內嵌預覽 + 報告。已對真實 NEF/ARW/DNG 跑過驗證。
- **v1**：銳利度報告 / 自動標失焦（需在 Node 端加 JPEG 解碼，如 sharp）。
- **v1.5**：依 picks 清單搬/複製檔案、連拍分組報告。
- **v2**：CR3/DNG 全解碼（Node libraw 綁定比瀏覽器 WASM 容易——CLI 可先支援全格式）。

## 驗證
CLI v0 已對 `spike` 的真實樣本端到端跑過（NEF→3008×2000、ARW→1616×1080、DNG→誠實回報無預覽）。
core 邏輯另有單元測試（`tests/`，CI 跑）。
