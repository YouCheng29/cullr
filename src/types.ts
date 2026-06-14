export type Pick = "unrated" | "pick" | "reject";

export type Photo = {
  id: string;
  name: string;
  handle: FileSystemFileHandle;
  thumb?: ImageBitmap;   // small preview for the grid (filled by the worker)
  width?: number;
  height?: number;
  sharpness?: number;    // relative Laplacian-variance score
  soft?: boolean;        // auto-flag: likely out-of-focus (confirm, never auto-delete)
  rating: number;        // 0–5 stars
  pick: Pick;
  error?: string;        // e.g. unsupported format (DNG/CR3 in v0)
};

export type WorkerIn = { id: string; file: File };
export type WorkerOut =
  | { id: string; ok: true; thumb: ImageBitmap; width: number; height: number; sharpness: number }
  | { id: string; ok: false; error: string };
