import { test } from "node:test";
import assert from "node:assert/strict";
import {
  visiblePhotos, step, clampIndex, toggleRating, picksToText, toCsv, softThreshold,
} from "../src/lib/selection.ts";
import type { Photo } from "../src/types.ts";

function photo(p: Partial<Photo> & { name: string }): Photo {
  return { id: p.name, handle: {} as FileSystemFileHandle, rating: 0, pick: "unrated", ...p };
}

const photos: Photo[] = [
  photo({ name: "a", pick: "pick", rating: 5, sharpness: 100 }),
  photo({ name: "b", pick: "reject", rating: 1, sharpness: 10 }),
  photo({ name: "c", pick: "unrated", rating: 3, sharpness: 50 }),
];

test("visiblePhotos filters by kind", () => {
  assert.deepEqual(visiblePhotos(photos, { kind: "all" }).map((p) => p.name), ["a", "b", "c"]);
  assert.deepEqual(visiblePhotos(photos, { kind: "picks" }).map((p) => p.name), ["a"]);
  assert.deepEqual(visiblePhotos(photos, { kind: "rejects" }).map((p) => p.name), ["b"]);
  assert.deepEqual(visiblePhotos(photos, { kind: "rating", min: 3 }).map((p) => p.name), ["a", "c"]);
});

test("step clamps at both ends", () => {
  assert.equal(step(0, 3, -1), 0);
  assert.equal(step(0, 3, 1), 1);
  assert.equal(step(2, 3, 1), 2);
  assert.equal(step(0, 0, 1), 0);
});

test("clampIndex keeps index valid", () => {
  assert.equal(clampIndex(5, 3), 2);
  assert.equal(clampIndex(-1, 3), 0);
  assert.equal(clampIndex(0, 0), 0);
});

test("toggleRating toggles same digit off", () => {
  assert.equal(toggleRating(0, 3), 3);
  assert.equal(toggleRating(3, 3), 0);
  assert.equal(toggleRating(2, 5), 5);
});

test("picksToText lists picked names", () => {
  assert.equal(picksToText(photos), "a");
});

test("toCsv emits header + a row per photo", () => {
  const csv = toCsv(photos).split("\n");
  assert.equal(csv[0], "name,rating,pick,sharpness");
  assert.equal(csv[1], "a,5,pick,100");
  assert.equal(csv.length, 4);
});

test("softThreshold returns -Infinity below 5 scored photos", () => {
  assert.equal(softThreshold(photos, 0.2), -Infinity);
});
