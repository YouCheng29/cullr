# Cullr — 瀏覽器版 RAW 選片器（v0 scaffold）

> 拍完幾百上千張，從裡面快速挑出 keeper。**照片不上傳、免費、AI 輔助**——
> 取代要 $139 的 Photo Mechanic / 要月費的 Aftershoot，且檔案全程留在你的電腦。

## 為什麼

Lightroom/Photo Mechanic 好用但貴，而選片是整個流程最痛、最花時間的一步。
Cullr 只做這一件事，把它做到順、做到免費，AI 幫你先標出該丟的，**人做最後決定**
（永不自動刪）。

## 現狀：這是骨架（v0）

技術上最大的風險——「瀏覽器能不能讀 RAW 內嵌預覽」——**已用真實 RAW 驗證可行**
（見下）。骨架已打通整條 pipeline：開資料夾 → worker 抽預覽 + 算銳利度 → 縮圖牆 +
「可能失焦」自動標記。**鍵盤流、篩選、100% loupe、匯出**留給後續長（見 App.tsx 的 TODO）。

## 已驗證（Node spike，真實樣本）

| 格式 | 結果 |
|---|---|
| Nikon NEF | ✅ 抽出全尺寸預覽 3008×2000 |
| Sony ARW | ✅ 抽出預覽 1616×1080（非滿版，選片夠用） |
| Canon CR2 / Fuji RAF / Olympus ORF / Panasonic RW2 | ✅ 同為 TIFF 結構、同法可抽 |
| Leica DNG（tiled）/ Canon CR3（非 TIFF） | ⏭️ v0 誠實回 null、不顯示垃圾；v0.5 用 LibRaw-wasm |

`extract-preview.ts` 與 `sharpness.ts` 的核心邏輯已在 Node 對真檔通過測試。

## 跑起來

```bash
pnpm install
pnpm dev          # 桌面版 Chrome / Edge 開啟（需要 File System Access API）
```

> ⚠️ UI / worker 尚未在瀏覽器實跑驗證過（scaffold 階段）——`pnpm dev` 後請在
> Chrome 實測「開啟資料夾」流程。演算法核心（抽預覽、銳利度）已 Node 驗證。

## Roadmap

- **v0（現在）**：開資料夾、縮圖牆、銳利度自動標記「可能失焦」
- **接手要做**：鍵盤流（`←/→` 切換、`1–5` 星、`P` 選用、`X` 淘汰）、篩選、100% loupe、匯出選用清單 / 複製檔案到新資料夾
- **v1**：連拍/相似群組（perceptual hash）— 最有感的自動化
- **v2**：閉眼/人臉品質偵測；DNG/CR3 全 RAW 解碼（LibRaw-wasm）
- **整合殺手鐧**：把星等寫回 XMP sidecar，讓 Lightroom 也讀得到選片結果

## 設計原則

- **零後端、零上傳**：隱私就是產品；可部署到任何靜態主機（GitHub Pages / Cloudflare Pages）。
- **AI 標記、人決定**：自動化只縮小候選、不替使用者刪檔。
- **一次只做好一件事**：不重做 Lightroom，只做選片。

## 已知限制

- File System Access API：Chromium 桌機限定（Safari/Firefox 需唯讀 fallback）。
- 部分格式（ARW）內嵌預覽非滿版 → 100% pixel-peep 需 v2 的全 RAW 解碼。

## 文件

- [產品 spec](docs/spec.md)
- [架構原則（照片永遠本機）](docs/architecture.md)
- [技術 spike：RAW 預覽抽取驗證](docs/spike-findings.md)
- [驗證計畫（競品＋訪談）](docs/validation-plan.md)
