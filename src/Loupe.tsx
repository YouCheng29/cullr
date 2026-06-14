import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "./types";

const MAX_ZOOM = 2; // 200% of the preview's own pixels

/**
 * Full-screen pixel-peeping view. Zoom is measured in CSS-px per IMAGE-px, so
 * 100% = the preview's actual pixels (and therefore larger than the screen →
 * you pan to inspect), while "符合畫面" shows the whole photo at whatever %
 * fits. Owns its own zoom/pan/grid + the +/-/0/g keys; App keeps arrows,
 * rating, F and Esc so you can still navigate and rate while peeping.
 */
export function Loupe({ photo, url, onClose }: { photo: Photo; url: string | null; onClose: () => void }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [vp, setVp] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);          // css-px per image-px
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grid, setGrid] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // latest values for the native wheel handler (avoids re-attaching the listener)
  const natRef = useRef(nat); natRef.current = nat;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const panRef = useRef(pan); panRef.current = pan;

  // "fit" = the largest zoom that shows the whole photo, never upscaling.
  const fit = nat && vp.w > 0 ? Math.min(vp.w / nat.w, vp.h / nat.h, 1) : 1;
  const clamp = useCallback((z: number) => Math.min(MAX_ZOOM, Math.max(fit, z)), [fit]);

  const measure = useCallback(() => {
    const el = viewportRef.current;
    if (el) setVp({ w: el.clientWidth, h: el.clientHeight });
  }, []);
  useEffect(() => { measure(); window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure]);

  // reset to fit whenever the photo changes
  useEffect(() => { setNat(null); setPan({ x: 0, y: 0 }); }, [url]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
  };
  // once we know natural + viewport, snap to fit
  useEffect(() => { if (nat && vp.w > 0) { setZoom(Math.min(vp.w / nat.w, vp.h / nat.h, 1)); setPan({ x: 0, y: 0 }); } }, [nat, vp.w, vp.h]);

  // Native (non-passive) wheel handler: React's onWheel is passive so it can't
  // preventDefault — without this the photo grid behind the loupe scrolls.
  // Also zooms toward the cursor (the point under the mouse stays put).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const n = natRef.current;
      if (!n) return;
      const rect = el.getBoundingClientRect();
      const fitNow = Math.min(rect.width / n.w, rect.height / n.h, 1);
      const oldZoom = zoomRef.current;
      const newZoom = Math.min(MAX_ZOOM, Math.max(fitNow, oldZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      if (newZoom === oldZoom) return;
      const k = newZoom / oldZoom;
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      const op = panRef.current;
      let np = newZoom === fitNow ? { x: 0, y: 0 } : { x: cx * (1 - k) + k * op.x, y: cy * (1 - k) + k * op.y };
      const mx = Math.max(0, (n.w * newZoom - rect.width) / 2);
      const my = Math.max(0, (n.h * newZoom - rect.height) / 2);
      np = { x: Math.min(mx, Math.max(-mx, np.x)), y: Math.min(my, Math.max(-my, np.y)) };
      setZoom(newZoom);
      setPan(np);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // keyboard: zoom only (App owns arrows/rating/F/Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+": case "=": setZoom((z) => clamp(z * 1.4)); break;
        case "-": setZoom((z) => { const nz = clamp(z / 1.4); if (nz === fit) setPan({ x: 0, y: 0 }); return nz; }); break;
        case "0": setZoom(fit); setPan({ x: 0, y: 0 }); break;        // 符合畫面 (1–5 stay rating; 100% is on the button)
        case "g": case "G": setGrid((v) => !v); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clamp, fit]);

  const dispW = nat ? nat.w * zoom : 0;
  const dispH = nat ? nat.h * zoom : 0;
  // clamp pan so the image can't be dragged completely off-screen
  const maxPanX = Math.max(0, (dispW - vp.w) / 2);
  const maxPanY = Math.max(0, (dispH - vp.h) / 2);
  const clampPan = (p: { x: number; y: number }) => ({
    x: Math.min(maxPanX, Math.max(-maxPanX, p.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, p.y)),
  });
  const pct = Math.round(zoom * 100);
  const canPan = dispW > vp.w + 1 || dispH > vp.h + 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 10, display: "flex", flexDirection: "column" }}>
      <div style={{ color: "#ccc", fontSize: 13, padding: "8px 12px", display: "flex", gap: 12, alignItems: "center" }}>
        <span>{photo.name}</span>
        <span style={{ color: "#e8a000" }}>{"★".repeat(photo.rating)}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setZoom((z) => clamp(z / 1.4))}>−</button>
          <span style={{ minWidth: 52, textAlign: "center" }}>{pct}%</span>
          <button onClick={() => setZoom((z) => clamp(z * 1.4))}>＋</button>
          <button onClick={() => { setZoom(fit); setPan({ x: 0, y: 0 }); }}>符合畫面</button>
          <button onClick={() => setZoom(clamp(1))}>100%</button>
          <button onClick={() => setGrid((g) => !g)} style={{ fontWeight: grid ? 700 : 400 }}>九宮格</button>
          <button onClick={onClose}>✕ 關閉</button>
        </span>
      </div>

      <div
        ref={viewportRef}
        style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative", display: "grid", placeItems: "center", cursor: canPan ? (drag.current ? "grabbing" : "grab") : "default" }}
        onMouseDown={(e) => { if (canPan) drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; }}
        onMouseMove={(e) => { if (drag.current) setPan(clampPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })); }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={photo.name}
            draggable={false}
            onLoad={onImgLoad}
            style={{
              width: nat ? dispW : "auto",
              height: nat ? dispH : "auto",
              maxWidth: nat ? "none" : "100%",
              maxHeight: nat ? "none" : "100%",
              imageOrientation: "from-image",
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              transition: drag.current ? "none" : "transform 0.05s",
            }}
          />
        ) : (
          <span style={{ color: "#888" }}>{photo.error ? "此格式無法預覽（DNG/CR3 留待 v0.5）" : "載入中…"}</span>
        )}

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
