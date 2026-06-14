import { useRef } from "react";
import type { Photo } from "./types";

const MIN = 1, MAX = 8;
export const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));

/**
 * Full-screen pixel-peeping view: gradual zoom (buttons / wheel / keys),
 * drag-to-pan, and an optional rule-of-thirds (九宮格) overlay. Zoom/pan
 * state lives in App so the single keyboard handler can drive it too.
 */
export function Loupe({
  photo, url, scale, setScale, pan, setPan, grid, setGrid, onClose,
}: {
  photo: Photo;
  url: string | null;
  scale: number;
  setScale: (f: (s: number) => number) => void;
  pan: { x: number; y: number };
  setPan: (f: (p: { x: number; y: number }) => { x: number; y: number }) => void;
  grid: boolean;
  setGrid: (f: (g: boolean) => boolean) => void;
  onClose: () => void;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 10, display: "flex", flexDirection: "column" }}>
      <div style={{ color: "#ccc", fontSize: 13, padding: "8px 12px", display: "flex", gap: 12, alignItems: "center" }}>
        <span>{photo.name}</span>
        <span style={{ color: "#e8a000" }}>{"★".repeat(photo.rating)}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setScale((s) => clampScale(s / 1.4))}>−</button>
          <span style={{ minWidth: 48, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => clampScale(s * 1.4))}>＋</button>
          <button onClick={() => { setScale(() => 1); setPan(() => ({ x: 0, y: 0 })); }}>符合畫面</button>
          <button onClick={() => setGrid((g) => !g)} style={{ fontWeight: grid ? 700 : 400 }}>九宮格</button>
          <button onClick={onClose}>✕ 關閉</button>
        </span>
      </div>

      <div
        style={{ flex: 1, overflow: "hidden", position: "relative", cursor: scale > 1 ? (drag.current ? "grabbing" : "grab") : "default" }}
        onMouseDown={(e) => { if (scale > 1) drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; }}
        onMouseMove={(e) => { if (drag.current) setPan(() => ({ x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y })); }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onWheel={(e) => {
          setScale((s) => {
            const ns = clampScale(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
            if (ns === 1) setPan(() => ({ x: 0, y: 0 }));
            return ns;
          });
        }}
        onClick={(e) => { if (e.target === e.currentTarget && scale === 1) onClose(); }}
      >
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={photo.name}
              draggable={false}
              style={{
                maxWidth: "100%", maxHeight: "100%", objectFit: "contain",
                imageOrientation: "from-image",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transition: drag.current ? "none" : "transform 0.08s",
              }}
            />
          ) : (
            <span style={{ color: "#888" }}>{photo.error ? "此格式無法預覽（DNG/CR3 留待 v0.5）" : "載入中…"}</span>
          )}
        </div>

        {grid && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {[33.333, 66.666].map((p) => (
              <div key={"v" + p} style={{ position: "absolute", top: 0, bottom: 0, left: `${p}%`, width: 1, background: "rgba(255,255,255,0.4)" }} />
            ))}
            {[33.333, 66.666].map((p) => (
              <div key={"h" + p} style={{ position: "absolute", left: 0, right: 0, top: `${p}%`, height: 1, background: "rgba(255,255,255,0.4)" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
