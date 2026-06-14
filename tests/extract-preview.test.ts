import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPreview } from "../src/lib/extract-preview.ts";
import { laplacianVariance } from "../src/lib/sharpness.ts";

// Build a minimal buffer with an embedded baseline JPEG (SOI + SOF0 + EOI)
// of the given dimensions, preceded by `prefix` filler bytes.
function withEmbeddedJpeg(w: number, h: number, prefix = 8, padBytes = 10): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, ...Array(padBytes).fill(0)];
  const bytes = [...Array(prefix).fill(0), 0xff, 0xd8, ...sof, 0xff, 0xd9];
  return new Uint8Array(bytes);
}

test("extractPreview finds an embedded JPEG and reads its real dimensions", () => {
  const buf = withEmbeddedJpeg(1600, 1067);
  const hit = extractPreview(buf);
  assert.ok(hit, "should find a preview");
  assert.equal(hit!.width, 1600);
  assert.equal(hit!.height, 1067);
  assert.equal(hit!.start, 8, "preview starts after the prefix");
});

test("extractPreview returns null when there is no embedded JPEG", () => {
  assert.equal(extractPreview(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])), null);
});

test("extractPreview rejects implausible tiny-stream-huge-dims (DNG tile guard)", () => {
  // SOF claims 20000x20000 (4e8 px) but the stream is tiny → must be rejected.
  const buf = withEmbeddedJpeg(20000, 20000, 8, 4);
  assert.equal(extractPreview(buf), null);
});

test("extractPreview picks the largest valid preview among several", () => {
  // Both under the 2 MP plausibility threshold so the tiny-stream guard
  // doesn't apply — this isolates the "largest wins" behaviour.
  const small = withEmbeddedJpeg(800, 600, 0, 6);
  const big = withEmbeddedJpeg(1600, 1000, 0, 6);
  const buf = new Uint8Array([...small, ...big]);
  const hit = extractPreview(buf);
  assert.equal(hit!.width, 1600);
});

test("laplacianVariance scores a sharp pattern far above a flat field", () => {
  const W = 64, H = 64;
  const flat = new Uint8ClampedArray(W * H).fill(128);
  const checker = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) checker[y * W + x] = (x + y) % 2 ? 255 : 0;
  assert.ok(laplacianVariance(checker, W, H) > laplacianVariance(flat, W, H) * 100);
});
