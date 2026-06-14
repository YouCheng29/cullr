#!/usr/bin/env node
/**
 * Cullr CLI — the headless / automatable half of Cullr.
 *
 * Reuses the SAME pure core as the browser app (src/lib/*) — one isomorphic
 * core, two frontends (browser worker + Node CLI). The CLI does the scriptable
 * parts (batch preview extraction + a sharpness report that auto-flags the
 * softest shots); interactive culling stays in the GUI where a human can look.
 *
 * Usage:
 *   node cli/cullr.ts <folder>                  # report (with sharpness + soft flag)
 *   node cli/cullr.ts <folder> --extract <dir>  # also write embedded previews to <dir>
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import jpeg from "jpeg-js";
import { extractPreview, isRaw, isDirectImage, isSupported, ext } from "../src/lib/extract-preview.ts";
import { laplacianVariance, toGray } from "../src/lib/sharpness.ts";

const ANALYZE_MAX = 256; // downscale long edge before the sharpness pass (matches the browser)
const SOFT_PERCENTILE = 0.2;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Nearest-neighbour subsample of RGBA to <= maxEdge long edge. */
function subsample(rgba: Uint8Array, w: number, h: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  if (scale === 1) return { rgba, w, h };
  const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      const si = (sy * w + sx) * 4, di = (y * nw + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = 255;
    }
  }
  return { rgba: out, w: nw, h: nh };
}

function sharpnessOf(jpegBytes: Uint8Array): number | null {
  try {
    const { data, width, height } = jpeg.decode(jpegBytes, { useTArray: true, maxMemoryUsageInMB: 512 });
    const s = subsample(data as Uint8Array, width, height, ANALYZE_MAX);
    return laplacianVariance(toGray(new Uint8ClampedArray(s.rgba), s.w, s.h), s.w, s.h);
  } catch {
    return null;
  }
}

type Row = { name: string; kind: "raw" | "image" | "nopreview"; w?: number; h?: number; sharp?: number | null };

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith("--"));
  const ei = args.indexOf("--extract");
  const outDir = ei >= 0 ? args[ei + 1] : null;
  if (!folder) { console.error("用法: node cli/cullr.ts <folder> [--extract <out-dir>]"); process.exit(1); }
  if (outDir) await mkdir(outDir, { recursive: true });

  const rows: Row[] = [];
  for await (const path of walk(folder)) {
    const name = basename(path);
    if (!isSupported(name)) continue;
    if (isDirectImage(name)) {
      const bytes = new Uint8Array(await readFile(path));
      rows.push({ name, kind: "image", sharp: sharpnessOf(bytes) });
      continue;
    }
    const bytes = new Uint8Array(await readFile(path));
    const hit = extractPreview(bytes);
    if (!hit) { rows.push({ name, kind: "nopreview" }); continue; }
    const jpegBytes = bytes.subarray(hit.start, hit.end);
    rows.push({ name, kind: "raw", w: hit.width, h: hit.height, sharp: sharpnessOf(jpegBytes) });
    if (outDir) await writeFile(join(outDir, name.replace(/\.[^.]+$/, "") + ".jpg"), jpegBytes);
  }

  // relative soft threshold over everything we could score
  const scores = rows.map((r) => r.sharp).filter((s): s is number => s != null).sort((a, b) => a - b);
  const soft = scores.length >= 5 ? scores[Math.floor(scores.length * SOFT_PERCENTILE)] : -Infinity;

  for (const r of rows) {
    if (r.kind === "nopreview") { console.log(`  ✕ ${ext(r.name).toUpperCase().padEnd(5)} ${r.name}  (預覽無法讀取，DNG/CR3 留待 v0.5)`); continue; }
    const flag = r.sharp != null && r.sharp <= soft ? "  ⚠ 可能失焦" : "";
    const dim = r.w ? `${r.w}x${r.h}` : "image";
    const sc = r.sharp != null ? `sharp=${Math.round(r.sharp)}` : "sharp=?";
    console.log(`  ✓ ${(r.kind === "raw" ? ext(r.name).toUpperCase() : "IMG").padEnd(5)} ${r.name}  ${dim}  ${sc}${flag}`);
  }
  const raws = rows.filter((r) => r.kind === "raw").length;
  const none = rows.filter((r) => r.kind === "nopreview").length;
  const imgs = rows.filter((r) => r.kind === "image").length;
  const softN = rows.filter((r) => r.sharp != null && r.sharp <= soft).length;
  console.log(`\n總結: ${raws} RAW（有預覽）, ${none} 無預覽, ${imgs} 圖片・⚠ ${softN} 張可能失焦` +
    (outDir ? `\n已輸出 ${raws} 張預覽到 ${outDir}` : "\n（加 --extract <dir> 可把預覽寫出）"));
}

main().catch((e) => { console.error("錯誤:", e instanceof Error ? e.message : e); process.exit(1); });
