/**
 * Embedded-preview extractor for TIFF-based RAW (NEF / CR2 / ARW / ORF / RW2 …).
 *
 * Verified in a Node spike against real samples:
 *   - Nikon NEF  → 3008×2000 (full-res preview)
 *   - Sony ARW   → 1616×1080 (downsized preview, fine for culling)
 *   - Leica DNG  → correctly returns null (tiled JPEG → carve unreliable; v0.5
 *                  will handle DNG/CR3 via LibRaw-wasm)
 *
 * Strategy: scan for embedded JPEG streams (FFD8 … FFD9), validate each by
 * parsing its real SOF dimensions, reject sentinel/garbage and implausibly
 * tiny-for-their-claimed-size streams (DNG tile headers), and return the
 * largest valid one. Pure bytes in → byte range out; runs anywhere.
 */
export type PreviewHit = { start: number; end: number; width: number; height: number };

function sofDims(buf: Uint8Array, view: DataView, start: number, len: number): { w: number; h: number } | null {
  let i = start + 2;
  while (i < len - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15 except DHT(C4)/JPG(C8)/DAC(CC) carry the real dimensions.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > len) return null;
      return { h: view.getUint16(i + 5), w: view.getUint16(i + 7) }; // JPEG is big-endian
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const segLen = view.getUint16(i + 2);
    if (!segLen) return null;
    i += 2 + segLen;
  }
  return null;
}

export function extractPreview(bytes: Uint8Array): PreviewHit | null {
  const len = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, len);
  let best: (PreviewHit & { px: number }) | null = null;

  for (let i = 0; i < len - 3; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const d = sofDims(bytes, view, i, len);
    if (!d || d.w <= 0 || d.h <= 0 || d.w >= 30000 || d.h >= 30000) continue;
    let end = -1;
    for (let j = i + 2; j < len - 1; j++) {
      if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) { end = j + 2; break; }
    }
    if (end < 0) continue;
    const px = d.w * d.h;
    const byteLen = end - i;
    // Plausibility: a real JPEG of `px` pixels can't fit in a tiny stream.
    // Drops DNG tiled-JPEG tile headers that declare the full image size.
    if (px > 2_000_000 && byteLen < px / 40) { i = end - 1; continue; }
    if (!best || px > best.px) best = { start: i, end, width: d.w, height: d.h, px };
    i = end - 1;
  }
  return best ? { start: best.start, end: best.end, width: best.width, height: best.height } : null;
}

const RAW_EXTS = new Set(["nef", "cr2", "arw", "orf", "rw2", "raf", "pef", "srw", "tif", "tiff"]);
const JPEG_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

export function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}
export function isRaw(name: string): boolean { return RAW_EXTS.has(ext(name)); }
export function isDirectImage(name: string): boolean { return JPEG_EXTS.has(ext(name)); }
export function isSupported(name: string): boolean { return isRaw(name) || isDirectImage(name); }
