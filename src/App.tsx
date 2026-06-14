import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractPreview, isRaw, isSupported } from "./lib/extract-preview";
import { clampIndex, picksToText, step, toCsv, toggleRating, visiblePhotos, softThreshold, type Filter } from "./lib/selection";
import { Loupe, clampScale } from "./Loupe";
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
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grid, setGrid] = useState(false);
  const [loupeUrl, setLoupeUrl] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const fullUrlCache = useRef<Map<string, string>>(new Map());
  const gridRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => visiblePhotos(photos, filter), [photos, filter]);
  const soft = useMemo(() => softThreshold(photos, SOFT_PERCENTILE), [photos]);
  const focusIdx = clampIndex(focus, visible.length);
  const focused = visible[focusIdx];

  const patch = useCallback((id: string, p: Partial<Photo>) => {
    setPhotos((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  // columns currently rendered (for up/down row navigation)
  const cols = useCallback(() => {
    const el = gridRef.current;
    if (!el) return 1;
    const kids = Array.from(el.children) as HTMLElement[];
    if (kids.length === 0) return 1;
    const top = kids[0].offsetTop;
    let n = 0;
    for (const k of kids) { if (k.offsetTop === top) n++; else break; }
    return Math.max(1, n);
  }, []);

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

  const openFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      alert("此瀏覽器不支援開啟資料夾，請用『或選擇檔案』，或改用桌面版 Chrome / Edge。");
      return;
    }
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    setBusy(true);
    const files: File[] = [];
    for await (const h of walk(dir)) if (isSupported(h.name)) files.push(await h.getFile());
    ingest(files);
    setBusy(false);
  }, [ingest]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    ingest(Array.from(e.target.files ?? []));
  }, [ingest]);

  // Copy picked ORIGINAL files into a folder the user chooses → a "keepers" folder.
  const copyPicks = useCallback(async () => {
    const picks = photos.filter((p) => p.pick === "pick");
    if (picks.length === 0) return;
    if (!window.showDirectoryPicker) { alert("此瀏覽器不支援寫入資料夾，請用桌面版 Chrome / Edge。"); return; }
    const dest = await window.showDirectoryPicker({ mode: "readwrite" });
    setBusy(true);
    for (const p of picks) {
      const fh = await dest.getFileHandle(p.name, { create: true });
      const w = await fh.createWritable();
      await w.write(await p.file.arrayBuffer());
      await w.close();
    }
    setBusy(false);
    alert(`已複製 ${picks.length} 張選用原檔到所選資料夾。`);
  }, [photos]);

  // lazy full-size preview for loupe; reset zoom/pan when the photo changes
  useEffect(() => {
    if (!loupe || !focused) { setLoupeUrl(null); return; }
    setScale(1); setPan({ x: 0, y: 0 });
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (photos.length === 0) return;
      const f = focused;
      const len = visible.length;
      const move = (d: number) => setFocus((i) => clampIndex(clampIndex(i, len) + d, len));
      switch (e.key) {
        case "ArrowRight": setFocus((i) => step(clampIndex(i, len), len, 1)); break;
        case "ArrowLeft": setFocus((i) => step(clampIndex(i, len), len, -1)); break;
        case "ArrowDown": move(cols()); break;
        case "ArrowUp": move(-cols()); break;
        case "1": case "2": case "3": case "4": case "5":
          if (f) patch(f.id, { rating: toggleRating(f.rating, Number(e.key)) }); break;
        case "`": if (f) patch(f.id, { rating: 0 }); break;               // clear stars (left hand)
        case "a": case "A": case "p": case "P":                            // pick
          if (f) patch(f.id, { pick: f.pick === "pick" ? "unrated" : "pick" }); break;
        case "s": case "S": case "x": case "X":                            // reject
          if (f) patch(f.id, { pick: f.pick === "reject" ? "unrated" : "reject" }); break;
        case "d": case "D": case "u": case "U":                            // reset
          if (f) patch(f.id, { pick: "unrated", rating: 0 }); break;
        case "f": case "F": setLoupe((v) => !v); break;
        case "Escape": setLoupe(false); break;
        // loupe-only zoom controls
        case "+": case "=": if (loupe) setScale((s) => clampScale(s * 1.4)); break;
        case "-": if (loupe) setScale((s) => clampScale(s / 1.4)); break;
        case "0": if (loupe) { setScale(() => 1); setPan(() => ({ x: 0, y: 0 })); } break;
        case "g": case "G": if (loupe) setGrid((v) => !v); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, visible.length, focused, loupe, patch, cols]);

  const pickCount = photos.filter((p) => p.pick === "pick").length;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Cullr</h1>
        <span style={{ color: "#888", fontSize: 13 }}>瀏覽器 RAW 選片器・照片不上傳</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={openFolder} disabled={busy} style={{ padding: "6px 14px" }}>
            {busy ? "處理中…" : "開啟資料夾"}
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
          <span style={{ color: "#888", marginLeft: "auto" }}>{visible.length} 張顯示・{pickCount} 已選</span>
          <button onClick={copyPicks} disabled={!pickCount || busy}>複製選用到資料夾</button>
          <button onClick={() => download("picks.txt", picksToText(photos))} disabled={!pickCount}>選用清單.txt</button>
          <button onClick={() => download("cull.csv", toCsv(photos))}>CSV</button>
        </div>
      )}

      <p style={{ color: "#aaa", fontSize: 12, margin: "0 0 12px" }}>
        右手 ←/→/↑/↓ 切換・左手 1–5 星・` 清星・A 選用・S 淘汰・D 還原・F 放大（+/− 縮放・拖曳平移・G 九宮格・Esc 關）
      </p>

      {photos.length === 0 ? (
        <p style={{ color: "#888" }}>開啟一個資料夾或選擇檔案開始選片。所有處理都在你的電腦本機完成。</p>
      ) : (
        <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {visible.map((p, i) => {
            const isSoft = p.sharpness != null && p.sharpness <= soft;
            const isFocus = i === focusIdx;
            return (
              <figure key={p.id} onClick={() => setFocus(i)} onDoubleClick={() => { setFocus(i); setLoupe(true); }}
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
        <Loupe photo={focused} url={loupeUrl} scale={scale} setScale={setScale} pan={pan} setPan={setPan}
          grid={grid} setGrid={setGrid} onClose={() => setLoupe(false)} />
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
