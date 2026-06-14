import { useCallback, useMemo, useRef, useState } from "react";
import { isSupported } from "./lib/extract-preview";
import type { Photo, WorkerOut } from "./types";

// File System Access API typings are partial in TS DOM lib; narrow what we use.
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

const SOFT_PERCENTILE = 0.2; // flag the softest 20% of a shoot (relative, per-shoot)

async function* walk(dir: FileSystemDirectoryHandle): AsyncGenerator<FileSystemFileHandle> {
  // @ts-expect-error values() is not yet in the TS lib but is widely shipped
  for await (const entry of dir.values()) {
    if (entry.kind === "file") yield entry as FileSystemFileHandle;
    else yield* walk(entry as FileSystemDirectoryHandle);
  }
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const getWorker = () => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./worker/preview.worker.ts", import.meta.url), { type: "module" });
    }
    return workerRef.current;
  };

  const openFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      alert("此瀏覽器不支援開啟資料夾，請用桌面版 Chrome / Edge。");
      return;
    }
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    setBusy(true);
    const handles: FileSystemFileHandle[] = [];
    for await (const h of walk(dir)) if (isSupported(h.name)) handles.push(h);

    const initial: Photo[] = handles.map((handle, i) => ({
      id: `${i}-${handle.name}`,
      name: handle.name,
      handle,
      rating: 0,
      pick: "unrated",
    }));
    setPhotos(initial);

    const worker = getWorker();
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      setPhotos((prev) =>
        prev.map((p) =>
          p.id !== m.id
            ? p
            : m.ok
              ? { ...p, thumb: m.thumb, width: m.width, height: m.height, sharpness: m.sharpness }
              : { ...p, error: m.error },
        ),
      );
    };
    for (const p of initial) {
      const file = await p.handle.getFile();
      worker.postMessage({ id: p.id, file });
    }
    setBusy(false);
  }, []);

  // Relative "soft" flag: softest SOFT_PERCENTILE of scored photos.
  const softThreshold = useMemo(() => {
    const scores = photos.filter((p) => p.sharpness != null).map((p) => p.sharpness!).sort((a, b) => a - b);
    if (scores.length < 5) return -Infinity;
    return scores[Math.floor(scores.length * SOFT_PERCENTILE)];
  }, [photos]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Cullr</h1>
        <span style={{ color: "#888", fontSize: 13 }}>瀏覽器 RAW 選片器・照片不上傳</span>
        <button onClick={openFolder} disabled={busy} style={{ marginLeft: "auto", padding: "6px 14px" }}>
          {busy ? "讀取中…" : "開啟資料夾"}
        </button>
      </header>

      {photos.length === 0 ? (
        <p style={{ color: "#888" }}>開啟一個資料夾開始選片。所有處理都在你的電腦本機完成。</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
          {photos.map((p) => {
            const soft = p.sharpness != null && p.sharpness <= softThreshold;
            return (
              <figure key={p.id} style={{ margin: 0, border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                {p.thumb ? (
                  <ThumbCanvas bitmap={p.thumb} />
                ) : (
                  <div style={{ aspectRatio: "3/2", display: "grid", placeItems: "center", color: "#bbb", fontSize: 12 }}>
                    {p.error ? "✕ 不支援" : "…"}
                  </div>
                )}
                {soft && (
                  <span style={{ position: "absolute", top: 6, left: 6, background: "#d33", color: "#fff", fontSize: 11, padding: "1px 6px", borderRadius: 4 }}>
                    可能失焦
                  </span>
                )}
                <figcaption style={{ fontSize: 11, padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.name}>
                  {p.name}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
      {/* TODO(你接手): 鍵盤流(←/→/1-5/P/X)、篩選(全部/已選/星等)、100% loupe、匯出選用清單 / 複製檔案、XMP 星等寫回 */}
    </div>
  );
}

function ThumbCanvas({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} style={{ width: "100%", display: "block", aspectRatio: `${bitmap.width}/${bitmap.height}` }} />;
}
