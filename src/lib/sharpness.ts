/**
 * v0 AI-assist #1: a cheap, fully-local sharpness score so the tool can
 * auto-flag soft / out-of-focus shots for the photographer to confirm.
 *
 * Method: variance of the Laplacian on a downscaled grayscale copy — the
 * classic blur metric. High variance = lots of edge energy = sharp; low =
 * soft. Cheap enough to run on every thumbnail in a worker. (Burst grouping
 * and eyes-closed detection are v1/v2 — see README.)
 *
 * NOTE: the score is relative; calibrate the "soft" threshold against a real
 * shoot in the UI rather than hard-coding an absolute cutoff.
 */
export function laplacianVariance(gray: Uint8ClampedArray, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // 4-neighbour Laplacian kernel
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Downscaled grayscale from RGBA ImageData-like bytes (luma BT.601). */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  for (let p = 0, q = 0; q < w * h; p += 4, q++) {
    out[q] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) | 0;
  }
  return out;
}
