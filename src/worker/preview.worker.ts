/// <reference lib="webworker" />
import { extractPreview, isRaw } from "../lib/extract-preview";
import { laplacianVariance, toGray } from "../lib/sharpness";
import type { WorkerIn, WorkerOut } from "../types";

const THUMB_MAX = 480; // grid thumbnail long edge
const ANALYZE_MAX = 256; // downscale for the sharpness pass (cheap + stable)

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { id, file } = e.data;
  try {
    let blob: Blob;
    if (isRaw(file.name)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const hit = extractPreview(bytes);
      if (!hit) throw new Error("此格式的內嵌預覽無法讀取（DNG/CR3 等留待 v0.5）");
      blob = new Blob([bytes.subarray(hit.start, hit.end)], { type: "image/jpeg" });
    } else {
      blob = file; // JPEG/PNG/WebP render directly
    }

    // Apply EXIF orientation so the grid thumbnail matches the loupe <img>
    // (which auto-orients). Without this, portrait shots show sideways in the
    // grid but upright in the loupe — a visible mismatch.
    const src = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const scale = Math.min(1, THUMB_MAX / Math.max(src.width, src.height));
    const tw = Math.max(1, Math.round(src.width * scale));
    const th = Math.max(1, Math.round(src.height * scale));
    const thumb = await createImageBitmap(src, { resizeWidth: tw, resizeHeight: th, resizeQuality: "medium" });

    // sharpness on a small grayscale copy
    const aScale = Math.min(1, ANALYZE_MAX / Math.max(src.width, src.height));
    const aw = Math.max(1, Math.round(src.width * aScale));
    const ah = Math.max(1, Math.round(src.height * aScale));
    const canvas = new OffscreenCanvas(aw, ah);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(src, 0, 0, aw, ah);
    const { data } = ctx.getImageData(0, 0, aw, ah);
    const sharpness = laplacianVariance(toGray(data, aw, ah), aw, ah);
    src.close();

    const out: WorkerOut = { id, ok: true, thumb, width: src.width, height: src.height, sharpness };
    (self as unknown as Worker).postMessage(out, [thumb]);
  } catch (err) {
    const out: WorkerOut = { id, ok: false, error: err instanceof Error ? err.message : "處理失敗" };
    (self as unknown as Worker).postMessage(out);
  }
};
