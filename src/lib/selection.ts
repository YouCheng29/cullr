/**
 * Pure selection / navigation / export logic for the culling UI.
 * No DOM — unit-tested, and keeps App.tsx thin.
 */
import type { Photo } from "../types";

export type Filter =
  | { kind: "all" }
  | { kind: "picks" }
  | { kind: "rejects" }
  | { kind: "rating"; min: number };

export function visiblePhotos(photos: Photo[], filter: Filter): Photo[] {
  switch (filter.kind) {
    case "all": return photos;
    case "picks": return photos.filter((p) => p.pick === "pick");
    case "rejects": return photos.filter((p) => p.pick === "reject");
    case "rating": return photos.filter((p) => p.rating >= filter.min);
  }
}

/** Move a focus index by `dir` within `[0, len)`, clamped at both ends. */
export function step(index: number, len: number, dir: -1 | 1): number {
  if (len <= 0) return 0;
  return Math.min(len - 1, Math.max(0, index + dir));
}

/** Keep an index valid after the visible list shrinks/grows. */
export function clampIndex(index: number, len: number): number {
  if (len <= 0) return 0;
  return Math.min(len - 1, Math.max(0, index));
}

/** Cycle a star rating: pressing the same digit again clears it (toggle). */
export function toggleRating(current: number, digit: number): number {
  return current === digit ? 0 : digit;
}

/** Newline-separated picked filenames (for a quick copy/import list). */
export function picksToText(photos: Photo[]): string {
  return photos.filter((p) => p.pick === "pick").map((p) => p.name).join("\n");
}

/** CSV of the whole shoot's decisions (name,rating,pick,sharpness). */
export function toCsv(photos: Photo[]): string {
  const head = "name,rating,pick,sharpness";
  const rows = photos.map((p) =>
    [p.name, p.rating, p.pick, p.sharpness != null ? Math.round(p.sharpness) : ""].join(","),
  );
  return [head, ...rows].join("\n");
}

/** Relative "soft" threshold: the score at the given percentile (e.g. 0.2). */
export function softThreshold(photos: Photo[], percentile: number): number {
  const scores = photos.filter((p) => p.sharpness != null).map((p) => p.sharpness!).sort((a, b) => a - b);
  if (scores.length < 5) return -Infinity;
  return scores[Math.floor(scores.length * percentile)];
}
