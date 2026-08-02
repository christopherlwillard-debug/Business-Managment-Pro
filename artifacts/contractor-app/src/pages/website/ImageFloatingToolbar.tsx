/**
 * ImageFloatingToolbar
 *
 * Portal-rendered floating pill toolbar that appears above a selected image component.
 * Provides quick access to: Replace, Focal Point, Crop, Alt Text, Border Radius, Object Fit.
 *
 * Positions itself via getBoundingClientRect on the component's [data-section-canvas-id] wrapper,
 * following the same pattern as FloatingTextToolbar.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ImagePlus, Crosshair, Crop, FileText, RectangleHorizontal, AlignCenter, X, Check,
} from "lucide-react";
import type { ImageCompProps } from "./sections/ContentSection";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToolbarMode = null | "alt" | "border-radius" | "object-fit" | "focal-point" | "crop";

export interface ImageFloatingToolbarProps {
  /** ID of the canvas component wrapper — used to query DOM position. */
  componentId: string | null;
  /** Current image component props. */
  imageProps: ImageCompProps | null;
  /** Open the media library to pick a replacement image. */
  onReplaceImage: () => void;
  /**
   * Update image props.
   * `commit = true` → push to undo history (start-of-interaction or confirm).
   * `commit = false` → live update (drag/slider move, no history).
   */
  onUpdateProps: (partial: Partial<ImageCompProps>, commit: boolean) => void;
}

// ─── Main toolbar ─────────────────────────────────────────────────────────────

export function ImageFloatingToolbar({
  componentId,
  imageProps,
  onReplaceImage,
  onUpdateProps,
}: ImageFloatingToolbarProps) {
  const [mode, setMode] = useState<ToolbarMode>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number>(0);

  // Alt text draft
  const [altDraft, setAltDraft] = useState("");
  // Border radius draft
  const [radiusDraft, setRadiusDraft] = useState(0);
  // Track whether we already pushed history for the current slider drag
  const radiusHistoryPushed = useRef(false);

  // Track element position
  useEffect(() => {
    if (!componentId) { setRect(null); setMode(null); return; }

    function updateRect() {
      const el = document.querySelector<HTMLElement>(`[data-section-canvas-id="${componentId}"]`);
      if (!el) { setRect(null); return; }
      setRect(el.getBoundingClientRect());
    }

    updateRect();

    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateRect);
    });
    const el = document.querySelector<HTMLElement>(`[data-section-canvas-id="${componentId}"]`);
    if (el) obs.observe(el);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      cancelAnimationFrame(rafRef.current);
    };
  }, [componentId]);

  // Reset mode when selection changes
  useEffect(() => {
    setMode(null);
    radiusHistoryPushed.current = false;
  }, [componentId]);

  // Sync drafts from live props
  useEffect(() => {
    if (!imageProps) return;
    setAltDraft(imageProps.alt ?? "");
    setRadiusDraft(imageProps.borderRadius ?? 0);
  }, [imageProps?.alt, imageProps?.borderRadius, componentId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rect || !componentId || !imageProps) return null;

  const TOOLBAR_H = 40;
  const GAP = 6;
  const toolbarTop = Math.max(4, rect.top - TOOLBAR_H - GAP);
  // If not enough space above, show below instead
  const finalTop = rect.top - TOOLBAR_H - GAP < 4 ? rect.bottom + GAP : toolbarTop;
  const centerX = rect.left + rect.width / 2;

  const btn = "p-1.5 rounded hover:bg-white/20 transition-colors text-white/70 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50";
  const activeBtn = "p-1.5 rounded bg-white/25 text-white focus:outline-none";

  function toggleMode(m: ToolbarMode) {
    setMode(prev => (prev === m ? null : m));
  }

  function commitAlt() {
    onUpdateProps({ alt: altDraft }, true);
    setMode(null);
  }

  return createPortal(
    <>
      {/* ── Floating pill ────────────────────────────────────── */}
      <div
        data-image-toolbar="true"
        style={{
          position: "fixed",
          top: finalTop,
          left: centerX,
          transform: "translateX(-50%)",
          zIndex: 9999,
          pointerEvents: "auto",
        }}
        className="flex items-center gap-0.5 bg-gray-900/97 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-2xl border border-white/10"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {/* Replace */}
        <button type="button" onClick={e => { e.stopPropagation(); onReplaceImage(); }}
          className={btn} title="Replace image (R)">
          <ImagePlus className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />

        {/* ── Sub-mode content ── */}
        {mode === "alt" ? (
          <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
            <input
              autoFocus
              type="text"
              placeholder="Describe the image…"
              value={altDraft}
              onChange={e => setAltDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitAlt(); }
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMode(null); setAltDraft(imageProps.alt ?? ""); }
              }}
              className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white placeholder-white/40 outline-none w-48 focus:border-white/50"
            />
            <button type="button" onMouseDown={e => { e.preventDefault(); commitAlt(); }}
              className="text-xs font-medium text-white/80 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/20 transition-colors">OK</button>
            <button type="button" onMouseDown={e => { e.preventDefault(); setMode(null); setAltDraft(imageProps.alt ?? ""); }} className={btn}><X className="w-3 h-3" /></button>
          </div>
        ) : mode === "border-radius" ? (
          <div className="flex items-center gap-1.5 px-1" onMouseDown={e => e.stopPropagation()}>
            <span className="text-white/50 text-[10px] whitespace-nowrap">Radius</span>
            <input
              type="range" min={0} max={48} value={radiusDraft}
              onMouseDown={() => { if (!radiusHistoryPushed.current) { radiusHistoryPushed.current = true; onUpdateProps({ borderRadius: radiusDraft }, true); } }}
              onChange={e => {
                const v = Number(e.target.value);
                setRadiusDraft(v);
                onUpdateProps({ borderRadius: v }, false);
              }}
              onMouseUp={() => { radiusHistoryPushed.current = false; }}
              className="w-28 accent-white h-1"
            />
            <span className="text-white/70 text-xs font-mono w-8 text-right tabular-nums">{radiusDraft}px</span>
            <button type="button" onClick={() => setMode(null)} className={btn}><Check className="w-3 h-3" /></button>
          </div>
        ) : mode === "object-fit" ? (
          <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
            {(["cover", "contain", "fill"] as const).map(f => (
              <button key={f} type="button"
                onClick={() => { onUpdateProps({ objectFit: f }, true); }}
                className={`px-2 py-0.5 rounded text-xs capitalize transition-colors ${
                  (imageProps.objectFit ?? "cover") === f
                    ? "bg-white text-gray-900 font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/20"
                }`}>
                {f}
              </button>
            ))}
            <button type="button" onClick={() => setMode(null)} className={`${btn} ml-1`}><Check className="w-3 h-3" /></button>
          </div>
        ) : (
          /* ── Default button row ── */
          <>
            {/* Focal Point */}
            <button type="button" onClick={() => toggleMode("focal-point")}
              className={mode === "focal-point" ? activeBtn : btn}
              title="Set focal point">
              <Crosshair className="w-3.5 h-3.5" />
            </button>

            {/* Crop */}
            <button type="button" onClick={() => toggleMode("crop")}
              className={mode === "crop" ? activeBtn : btn}
              title="Crop">
              <Crop className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3.5 bg-white/20 mx-0.5 flex-shrink-0" />

            {/* Alt Text */}
            <button type="button" onClick={() => toggleMode("alt")}
              className={btn} title="Alt text">
              <FileText className="w-3.5 h-3.5" />
            </button>

            {/* Border Radius */}
            <button type="button" onClick={() => toggleMode("border-radius")}
              className={btn} title="Border radius">
              <RectangleHorizontal className="w-3.5 h-3.5" />
            </button>

            {/* Object Fit */}
            <button type="button" onClick={() => toggleMode("object-fit")}
              className={btn} title="Object fit (cover / contain / fill)">
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* ── Focal Point Overlay ── */}
      {mode === "focal-point" && (
        <FocalPointOverlay
          componentId={componentId}
          focalX={imageProps.focalX ?? 50}
          focalY={imageProps.focalY ?? 50}
          onCommit={(x, y) => {
            onUpdateProps({ focalX: x, focalY: y }, true);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}

      {/* ── Crop Overlay ── */}
      {mode === "crop" && (
        <CropOverlay
          componentId={componentId}
          cropX={imageProps.cropX ?? 0}
          cropY={imageProps.cropY ?? 0}
          cropW={imageProps.cropW ?? 100}
          cropH={imageProps.cropH ?? 100}
          onCommit={(x, y, w, h) => {
            onUpdateProps({ cropX: x, cropY: y, cropW: w, cropH: h }, true);
            setMode(null);
          }}
          onReset={() => {
            onUpdateProps({ cropX: 0, cropY: 0, cropW: 100, cropH: 100 }, true);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </>,
    document.body,
  );
}

// ─── Focal Point Overlay ──────────────────────────────────────────────────────

function FocalPointOverlay({
  componentId,
  focalX,
  focalY,
  onCommit,
  onCancel,
}: {
  componentId: string;
  focalX: number;
  focalY: number;
  onCommit: (x: number, y: number) => void;
  onCancel: () => void;
}) {
  const [pos, setPos] = useState({ x: focalX, y: focalY });
  const [imgRect, setImgRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-section-canvas-id="${componentId}"]`);
    const img = el?.querySelector<HTMLImageElement>("img");
    const target = img ?? el;
    if (target) setImgRect(target.getBoundingClientRect());
  }, [componentId]);

  if (!imgRect) return null;

  function pctFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - imgRect!.left) / imgRect!.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - imgRect!.top) / imgRect!.height) * 100)));
    return { x, y };
  }

  const dotLeft = imgRect.left + (pos.x / 100) * imgRect.width;
  const dotTop  = imgRect.top  + (pos.y / 100) * imgRect.height;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998]"
      style={{ cursor: "crosshair" }}
      onMouseDown={e => {
        if (
          e.clientX >= imgRect.left && e.clientX <= imgRect.right &&
          e.clientY >= imgRect.top  && e.clientY <= imgRect.bottom
        ) {
          setPos(pctFromEvent(e));
        } else {
          onCancel();
        }
      }}
    >
      {/* Dark tint */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Image boundary highlight */}
      <div
        className="absolute border-2 border-white/60 pointer-events-none"
        style={{ left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height }}
      />

      {/* Rule-of-thirds grid */}
      <div
        className="absolute pointer-events-none"
        style={{ left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height }}
      >
        <div className="absolute top-1/3 left-0 right-0 border-t border-white/20" />
        <div className="absolute top-2/3 left-0 right-0 border-t border-white/20" />
        <div className="absolute top-0 bottom-0 left-1/3 border-l border-white/20" />
        <div className="absolute top-0 bottom-0 left-2/3 border-l border-white/20" />
      </div>

      {/* Focal point crosshair */}
      <div
        className="absolute pointer-events-none"
        style={{ left: dotLeft, top: dotTop, transform: "translate(-50%, -50%)" }}
      >
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="5" fill="rgba(255,255,255,0.35)" stroke="white" strokeWidth="2" />
          <line x1="14" y1="0" x2="14" y2="8" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="14" y1="20" x2="14" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="0" y1="14" x2="8" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <line x1="20" y1="14" x2="28" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Instruction label + buttons */}
      <div
        className="fixed flex items-center gap-2"
        style={{
          left: imgRect.left + imgRect.width / 2,
          top: Math.min(imgRect.bottom + 8, window.innerHeight - 48),
          transform: "translateX(-50%)",
          pointerEvents: "auto",
          zIndex: 9999,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="bg-gray-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          Click to set focal point · {pos.x}%, {pos.y}%
        </div>
        <button type="button"
          onClick={e => { e.stopPropagation(); onCommit(pos.x, pos.y); }}
          className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded hover:opacity-90">
          Apply
        </button>
        <button type="button"
          onClick={e => { e.stopPropagation(); onCancel(); }}
          className="bg-gray-700 text-white text-xs font-medium px-3 py-1.5 rounded hover:opacity-80">
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ─── Crop Overlay ─────────────────────────────────────────────────────────────

type CropHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

interface CropState { x: number; y: number; w: number; h: number }

function CropOverlay({
  componentId,
  cropX, cropY, cropW, cropH,
  onCommit, onReset, onCancel,
}: {
  componentId: string;
  cropX: number; cropY: number; cropW: number; cropH: number;
  onCommit: (x: number, y: number, w: number, h: number) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState<CropState>({ x: cropX, y: cropY, w: cropW, h: cropH });
  const [imgRect, setImgRect] = useState<DOMRect | null>(null);
  const dragRef = useRef<{
    handle: CropHandleId;
    startX: number; startY: number;
    startCrop: CropState;
  } | null>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-section-canvas-id="${componentId}"]`);
    const img = el?.querySelector<HTMLImageElement>("img");
    const target = img ?? el;
    if (target) setImgRect(target.getBoundingClientRect());
  }, [componentId]);

  if (!imgRect) return null;

  // Pixel coords of the crop rectangle
  const px = imgRect.left + (crop.x / 100) * imgRect.width;
  const py = imgRect.top  + (crop.y / 100) * imgRect.height;
  const pw = (crop.w / 100) * imgRect.width;
  const ph = (crop.h / 100) * imgRect.height;

  function clampCrop(c: CropState): CropState {
    const x = Math.max(0, Math.min(95, c.x));
    const y = Math.max(0, Math.min(95, c.y));
    const w = Math.max(5, Math.min(100 - x, c.w));
    const h = Math.max(5, Math.min(100 - y, c.h));
    return { x, y, w, h };
  }

  function onHandlePointerDown(handle: CropHandleId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !imgRect) return;
    const dx = ((e.clientX - d.startX) / imgRect.width) * 100;
    const dy = ((e.clientY - d.startY) / imgRect.height) * 100;
    let { x, y, w, h } = d.startCrop;

    switch (d.handle) {
      case "nw": x += dx; y += dy; w -= dx; h -= dy; break;
      case "n":             y += dy; h -= dy;          break;
      case "ne":            y += dy; w += dx; h -= dy; break;
      case "e":                      w += dx;           break;
      case "se":                     w += dx; h += dy;  break;
      case "s":                               h += dy;  break;
      case "sw": x += dx; w -= dx; h += dy;  break;
      case "w":  x += dx; w -= dx;            break;
      case "move": x += dx; y += dy;          break;
    }
    setCrop(clampCrop({ x, y, w, h }));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const handleSize = 10;
  const handles: { id: CropHandleId; style: React.CSSProperties; cursor: string }[] = [
    { id: "nw", style: { top: -handleSize/2, left: -handleSize/2 },                          cursor: "nw-resize" },
    { id: "n",  style: { top: -handleSize/2, left: `calc(50% - ${handleSize/2}px)` },         cursor: "n-resize"  },
    { id: "ne", style: { top: -handleSize/2, right: -handleSize/2 },                          cursor: "ne-resize" },
    { id: "e",  style: { top: `calc(50% - ${handleSize/2}px)`, right: -handleSize/2 },        cursor: "e-resize"  },
    { id: "se", style: { bottom: -handleSize/2, right: -handleSize/2 },                       cursor: "se-resize" },
    { id: "s",  style: { bottom: -handleSize/2, left: `calc(50% - ${handleSize/2}px)` },      cursor: "s-resize"  },
    { id: "sw", style: { bottom: -handleSize/2, left: -handleSize/2 },                        cursor: "sw-resize" },
    { id: "w",  style: { top: `calc(50% - ${handleSize/2}px)`, left: -handleSize/2 },         cursor: "w-resize"  },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Global dark overlay */}
      <div className="absolute inset-0 bg-black/55 pointer-events-none" />

      {/* Image boundary box */}
      <div
        className="absolute border border-white/30 pointer-events-none"
        style={{ left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height }}
      />

      {/* Crop rectangle — "bright" window in the dark overlay using box-shadow */}
      <div
        className="absolute border-2 border-white"
        style={{
          left: px,
          top: py,
          width: Math.max(pw, 20),
          height: Math.max(ph, 20),
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          cursor: dragRef.current?.handle === "move" ? "grabbing" : "grab",
        }}
        onPointerDown={e => onHandlePointerDown("move", e)}
      >
        {/* Rule-of-thirds grid */}
        <div className="absolute top-1/3 left-0 right-0 border-t border-white/30 pointer-events-none" />
        <div className="absolute top-2/3 left-0 right-0 border-t border-white/30 pointer-events-none" />
        <div className="absolute top-0 bottom-0 left-1/3 border-l border-white/30 pointer-events-none" />
        <div className="absolute top-0 bottom-0 left-2/3 border-l border-white/30 pointer-events-none" />

        {/* Resize handles */}
        {handles.map(hd => (
          <div
            key={hd.id}
            className="absolute bg-white border-2 border-gray-800 z-10"
            style={{
              ...hd.style,
              width: handleSize,
              height: handleSize,
              cursor: hd.cursor,
            }}
            onPointerDown={e => { e.stopPropagation(); onHandlePointerDown(hd.id, e); }}
          />
        ))}
      </div>

      {/* Buttons */}
      <div
        className="fixed flex items-center gap-2"
        style={{
          left: Math.min(Math.max(px + pw / 2, 100), window.innerWidth - 100),
          top: Math.min(py + Math.max(ph, 20) + 12, window.innerHeight - 50),
          transform: "translateX(-50%)",
          pointerEvents: "auto",
          zIndex: 9999,
        }}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="bg-gray-900/90 text-white/70 text-[10px] px-2 py-1 rounded whitespace-nowrap font-mono">
          {Math.round(crop.w)}% × {Math.round(crop.h)}%
        </div>
        <button type="button"
          onClick={() => onCommit(Math.round(crop.x), Math.round(crop.y), Math.round(crop.w), Math.round(crop.h))}
          className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded hover:opacity-90 flex items-center gap-1">
          <Check className="w-3 h-3" /> Apply
        </button>
        <button type="button"
          onClick={onReset}
          className="bg-gray-700 text-white text-xs font-medium px-3 py-1.5 rounded hover:opacity-80">
          Reset
        </button>
        <button type="button"
          onClick={onCancel}
          className="bg-gray-700 text-white text-xs font-medium px-2 py-1.5 rounded hover:opacity-80">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
