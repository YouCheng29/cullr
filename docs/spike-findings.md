# 技術 Spike：瀏覽器能否抽 RAW 內嵌預覽？

**結論：可行（純前端、不需後端、不需重 WASM）。** 用真實 RAW 樣本在 Node 驗證過，
邏輯已 port 進 `src/lib/extract-preview.ts` 並通過測試。

## 方法
RAW 檔內嵌一張（或多張）JPEG 預覽。掃描 JPEG 串流（`FFD8 … FFD9`），對每段
解析真正的 SOF 尺寸、剔除 sentinel/垃圾與「宣告尺寸巨大但位元組過小」的 tile 標頭
（DNG tiled-JPEG 會產生這種假命中），取最大的有效預覽。

> exifr 能讀 EXIF（相機、既有星等），但**抓不到大預覽**（只給 ~160×120 縮圖）——
> 所以 metadata 用 exifr、預覽用自寫抽取器。

## 實測結果（真實樣本）

| 格式 | 結果 | 備註 |
|---|---|---|
| Nikon NEF (D70) | ✅ 3008×2000、565KB | 全尺寸預覽 |
| Sony ARW (A900) | ✅ 1616×1080、737KB | 預覽被縮小，選片夠用；100% peep 受限 |
| Leica DNG (M8) | ⛔ 正確回 `null` | tiled JPEG，碎片化；盲掃會誤判 65535，加合理性過濾後正確排除 |
| Canon CR2 / Fuji RAF / Olympus ORF / Panasonic RW2 | ✅ 預期可行 | 同為 TIFF 結構、同法 |
| Canon CR3 | ⏭️ v0.5 | 非 TIFF（ISO-BMFF 容器），需 LibRaw-wasm |

## v0 決策
- **支援**：JPEG/PNG/WebP + TIFF-based RAW（NEF/CR2/ARW/ORF/RW2/RAF）——涵蓋絕大多數相機。
- **延後到 v0.5**：DNG（tiled）、CR3 → LibRaw-wasm；以及部分格式的全 RAW 解碼（真 100% peep）。
- v0 對不支援格式**誠實回報「不支援」、不顯示垃圾**。

## 驗證如何重現
`src/lib/extract-preview.ts` 的核心已對上述真檔在 Node 跑過（NEF→3008、ARW→1616、
DNG→null）。新增格式時，拿該格式真檔丟進同一支驗證即可。
