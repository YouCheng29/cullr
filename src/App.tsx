import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractPreview, isRaw, isSupported } from "./lib/extract-preview";
import { clampIndex, picksToText, step, toCsv, toggleRating, visiblePhotos, softThreshold, type Filter } from "./lib/selection";
import type { Photo, Pick, WorkerOut } from "./types";

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

const SOFT_PERCENTILE = 0.2;

async function* walk(dir: FileSystemDirectoryHandle): AsyncGenerator<FileSystemFileHandle> {
  // @ts-expect-error values() ships widely but isn't in the TS lib yet
  for await (const entry of dir.values()) {
    if (entry.kind === "file") yield entry as FileSystemFileHandle;
    else yield* walk(entry as FileSystemDirectoryHandle);
  }
}

/** Full-size preview as an object URL (RAW → embedded preview, else the file). */
async function loadFullUrl(file: File): Promise<string | null> {
  if (isRaw(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hit = extractPreview(bytes);
    if (!hit) return null;
    return URL.createObjectURL(new Blob([bytes.subarray(hit.start, hit.end)], { type: "image/jpeg" }));
  }
  return URL.createObjectURL(file);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [focus, setFocus] = useState(0);
  const [loupe, setLoupe] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [loupeUrl, setLoupeUrl] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const fullUrlCache = useRef<Map<string, string>>(new Map());

  const visible = useMemo(() => visiblePhotos(photos, filter), [photos, filter]);
  const soft = useMemo(() => softThreshold(photos, SOFT_PERCENTILE), [photos]);
  const focused = visible[clampIndex(focus, visible.length)];

  const patch = useCallback((id: string, p: Partial<Photo>) => {
    setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  // Common pipeline for both entry points: take Files → grid → worker.
  const ingest = useCallback((files: File[]) => {
    const supported = files.filter((f) => isSupported(f.name));
    const initial: Photo[] = supported.map((file, i) => ({
      id: `${i}-${file.name}`, name: file.name, file, rating: 0, pick: "unrated" as Pick,
    }));
    setPhotos(initial);
    setFocus(0);

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./worker/preview.worker.ts", import.meta.url), { type: "module" });
      workerRef.current.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        setPhotos((prev) => prev.map((p) =>
          p.id !== m.id ? p
            : m.ok ? { ...p, thumb: m.thumb, width: m.width, height: m.height, sharpness: m.sharpness }
            : { ...p, error: m.error }));
      };
    }
    for (const p of initial) workerRef.current!.postMessage({ id: p.id, file: p.file });
  }, []);

  // Entry 1: folder picker (Chromium desktop).
  const openFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      alert("此瀏覽器不支援開啟資料夾，請用下方『或選擇檔案』，或改用桌面版 Chrome / Edge。");
      return;
    }
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    setBusy(true);
    const files: File[] = [];
    for await (const h of walk(dir)) if (isSupported(h.name)) files.push(await h.getFile());
    ingest(files);
    setBusy(false);
  }, [ingest]);

  // Entry 2: <input type=file> fallback (cross-browser + automatable in tests).
  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    ingest(Array.from(e.target.files ?? []));
  }, [ingest]);

  // Load the full-size preview when entering loupe / moving focus in loupe.
  useEffect(() => {
    if (!loupe || !focused) { setLoupeUrl(null); return; }
    let alive = true;
    const cached = fullUrlCache.current.get(focused.id);
    if (cached) { setLoupeUrl(cached); return; }
    loadFullUrl(focused.file).then((url) => {
      if (!alive) { if (url) URL.revokeObjectURL(url); return; }
      if (url) fullUrlCache.current.set(focused.id, url);
      setLoupeUrl(url);
    });
    return () => { alive = false; };
  }, [loupe, focused]);

  useEffect(() => () => {
    for (const url of fullUrlCache.current.values()) URL.revokeObjectURL(url);
    fullUrlCache.current.clear();
  }, []);

  // Keyboard flow
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (photos.length === 0) return;
      const f = focused;
      switch (e.key) {
        case "ArrowRight": setFocus((i) => step(clampIndex(i, visible.length), visible.length, 1)); break;
        case "ArrowLeft": setFocus((i) => step(clampIndex(i, visible.length), visible.length, -1)); break;
        case "1": case "2": case "3": case "4": case "5":
          if (f) patch(f.id, { rating: toggleRating(f.rating, Number(e.key)) }); break;
        case "0": if (f) patch(f.id, { rating: 0 }); break;
        case "p": case "P": if (f) patch(f.id, { pick: f.pick === "pick" ? "unrated" : "pick" }); break;
        case "x": case "X": if (f) patch(f.id, { pick: f.pick === "reject" ? "unrated" : "reject" }); break;
        case "u": case "U": if (f) patch(f.id, { pick: "unrated", rating: 0 }); break;
        case "f": case "F": setLoupe((v) => !v); break;
        case "z": case "Z": if (loupe) setZoom((v) => !v); break;
        case "Escape": setLoupe(false); setZoom(false); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, visible.length, focused, loupe, patch]);

  const pickCount = photos.filter((p) => p.pick === "pick").length;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Cullr</h1>
        <span style={{ color: "#888", fontSize: 13 }}>瀏覽器 RAW 選片器・照片不上傳</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={openFolder} disabled={busy} style={{ padding: "6px 14px" }}>
            {busy ? "讀取中…" : "開啟資料夾"}
          </button>
          <label style={{ fontSize: 13, color: "#555", cursor: "pointer" }}>
            或選擇檔案
            <input type="file" multiple accept="image/*,.nef,.cr2,.cr3,.arw,.orf,.rw2,.raf,.dng,.heic"
              onChange={onPickFiles} style={{ display: "none" }} data-testid="file-input" />
          </label>
        </div>
      </header>

      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, fontSize: 13, flexWrap: "wrap" }}>
          {(["all", "picks", "rejects"] as const).map((k) => (
            <button key={k} onClick={() => { setFilter({ kind: k }); setFocus(0); }}
              style={{ padding: "3px 10px", fontWeight: filter.kind === k ? 700 : 400 }}>
              {k === "all" ? "全部" : k === "picks" ? "已選" : "已淘汰"}
            </button>
          ))}
          <button onClick={() => { setFilter({ kind: "rating", min: 3 }); setFocus(0); }}
            style={{ padding: "3px 10px", fontWeight: filter.kind === "rating" ? 700 : 400 }}>★3+</button>
          <span style={{ color: "#888", marginLeft: "auto" }}>
            {visible.length} 張顯示・{pickCount} 已選
          </span>
          <button onClick={() => download("picks.txt", picksToText(photos))} disabled={!pickCount}>匯出選用清單</button>
          <button onClick={() => download("cull.csv", toCsv(photos))}>匯出 CSV</button>
        </div>
      )}

      <p style={{ color: "#aaa", fontSize: 12, margin: "0 0 12px" }}>
        鍵盤：←/→ 切換・1–5 星・0 清除・P 選用・X 淘汰・U 還原・F 放大檢視・Z 100%・Esc 關閉
      </p>

      {photos.length === 0 ? (
        <p style={{ color: "#888" }}>開啟一個資料夾開始選片。所有處理都在你的電腦本機完成。</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {visible.map((p, i) => {
            const isSoft = p.sharpness != null && p.sharpness <= soft;
            const isFocus = i === clampIndex(focus, visible.length);
            return (
              <figure key={p.id} onClick={() => setFocus(i)}
                style={{ margin: 0, border: isFocus ? "2px solid #2b7" : "1px solid #ddd", borderRadius: 6, overflow: "hidden", position: "relative", cursor: "pointer", opacity: p.pick === "reject" ? 0.45 : 1 }}>
                {p.thumb ? <ThumbCanvas bitmap={p.thumb} /> : (
                  <div style={{ aspectRatio: "3/2", display: "grid", placeItems: "center", color: "#bbb", fontSize: 12 }}>
                    {p.error ? "✕ 不支援" : "…"}
                  </div>
                )}
                {isSoft && <Badge color="#d33" pos="left">可能失焦</Badge>}
                {p.pick === "pick" && <Badge color="#2b7" pos="right">✓ 選用</Badge>}
                {p.pick === "reject" && <Badge color="#999" pos="right">✕</Badge>}
                <figcaption style={{ fontSize: 11, padding: "4px 6px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</span>
                  <span style={{ color: "#e8a000" }}>{p.rating ? "★".repeat(p.rating) : ""}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      {loupe && focused && (
        <div onClick={() => setLoupe(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 10, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#ccc", fontSize: 13, padding: "8px 12px", display: "flex", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <span>{focused.name}</span>
            <span style={{ color: "#e8a000" }}>{"★".repeat(focused.rating)}</span>
            <span style={{ marginLeft: "auto" }}>{zoom ? "100%（Z 縮回）" : "符合畫面（Z 放大）"}・Esc 關閉</span>
          </div>
          <div style={{ flex: 1, overflow: zoom ? "auto" : "hidden", display: "grid", placeItems: zoom ? "start" : "center" }}
            onClick={(e) => e.stopPropagation()}>
            {loupeUrl
              ? <img src={loupeUrl} alt={focused.name}
                  style={zoom ? { maxWidth: "none" } : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              : <span style={{ color: "#888" }}>{focused.error ? "此格式無法預覽" : "載入中…"}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children, color, pos }: { children: React.ReactNode; color: string; pos: "left" | "right" }) {
  return (
    <span style={{ position: "absolute", top: 6, [pos]: 6, background: color, color: "#fff", fontSize: 11, padding: "1px 6px", borderRadius: 4 }}>
      {children}
    </span>
  );
}

function ThumbCanvas({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} style={{ width: "100%", display: "block", aspectRatio: `${bitmap.width}/${bitmap.height}` }} />;
}
