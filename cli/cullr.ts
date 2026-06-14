#!/usr/bin/env node
/**
 * Cullr CLI — the headless / automatable half of Cullr.
 *
 * Reuses the SAME pure core as the browser app (src/lib/extract-preview.ts) —
 * one isomorphic core, two frontends (browser worker + Node CLI). The CLI does
 * the scriptable parts (batch preview extraction + a report); interactive
 * culling stays in the GUI where a human can actually look at the photos.
 *
 * Usage:
 *   node cli/cullr.ts <folder>                  # report what's inside
 *   node cli/cullr.ts <folder> --extract <dir>  # write embedded previews to <dir>
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { extractPreview, isRaw, isDirectImage, isSupported, ext } from "../src/lib/extract-preview.ts";

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const folder = args.find((a) => !a.startsWith("--"));
  const extractIdx = args.indexOf("--extract");
  const outDir = extractIdx >= 0 ? args[extractIdx + 1] : null;
  return { folder, outDir };
}

async function main() {
  const { folder, outDir } = parseArgs(process.argv);
  if (!folder) {
    console.error("用法: node cli/cullr.ts <folder> [--extract <out-dir>]");
    process.exit(1);
  }
  if (outDir) await mkdir(outDir, { recursive: true });

  let raws = 0, previews = 0, noPreview = 0, images = 0;
  const rows: string[] = [];

  for await (const path of walk(folder)) {
    const name = basename(path);
    if (!isSupported(name)) continue;

    if (isDirectImage(name)) {
      images++;
      rows.push(`  image   ${name}`);
      continue;
    }
    // RAW: extract the embedded preview
    raws++;
    const bytes = new Uint8Array(await readFile(path));
    const hit = extractPreview(bytes);
    if (!hit) {
      noPreview++;
      rows.push(`  ✕ ${ext(name).toUpperCase().padEnd(5)} ${name}  (內嵌預覽無法讀取，DNG/CR3 留待 v0.5)`);
      continue;
    }
    previews++;
    rows.push(`  ✓ ${ext(name).toUpperCase().padEnd(5)} ${name}  ${hit.width}x${hit.height}`);
    if (outDir) {
      const out = join(outDir, name.replace(/\.[^.]+$/, "") + ".jpg");
      await writeFile(out, bytes.subarray(hit.start, hit.end));
    }
  }

  console.log(rows.join("\n") || "  (找不到支援的檔案)");
  console.log(
    `\n總結: ${raws} 個 RAW（${previews} 有預覽, ${noPreview} 無）、${images} 張一般圖片` +
      (outDir ? `\n已輸出 ${previews} 張預覽到 ${outDir}` : "\n（加 --extract <dir> 可把預覽寫出）"),
  );
}

main().catch((e) => {
  console.error("錯誤:", e instanceof Error ? e.message : e);
  process.exit(1);
});
