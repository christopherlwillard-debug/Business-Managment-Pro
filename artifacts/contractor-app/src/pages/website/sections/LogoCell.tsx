import { useState, useEffect } from "react";
import { ImagePlus, Pencil, Copy, EyeOff, Eye, Trash2 } from "lucide-react";
import type { CardComponent } from "../website-types";

// ── Optical sizing cache ───────────────────────────────────────────────────────
// Persists across renders; maps imageUrl → scale factor (naturalH / visibleH)
const opticalScaleCache = new Map<string, number>();

function measureOpticalScale(
  imageUrl: string,
  onResult: (scale: number) => void,
): void {
  const cached = opticalScaleCache.get(imageUrl);
  if (cached !== undefined) { onResult(cached); return; }

  const img = new window.Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const W = img.naturalWidth, H = img.naturalHeight;
      if (W === 0 || H === 0) { onResult(1); return; }
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { onResult(1); return; }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, W, H).data;

      let topRow = 0, bottomRow = H - 1, found = false;
      // First non-transparent row from top
      top: for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] > 10) { topRow = y; found = true; break top; }
        }
      }
      if (!found) { opticalScaleCache.set(imageUrl, 1); onResult(1); return; }
      // Last non-transparent row from bottom
      bottom: for (let y = H - 1; y >= 0; y--) {
        for (let x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] > 10) { bottomRow = y; break bottom; }
        }
      }

      const visibleH = bottomRow - topRow + 1;
      // scale = how much to magnify so visible content fills logoMaxHeight
      // (applied via CSS transform; capped at 3× to prevent extreme blowup)
      const scale = Math.min(3, H / Math.max(1, visibleH));
      opticalScaleCache.set(imageUrl, scale);
      onResult(scale);
    } catch {
      onResult(1);
    }
  };
  img.onerror = () => onResult(1);
  img.src = imageUrl;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface LogoCellProps {
  item: CardComponent;
  logoMaxHeight: number;
  normalizePadding: boolean;
  showHoverEffect: boolean;
  grayscaleUntilHover: boolean;
  roundedCorners: boolean;
  /** When true, scales each logo so its visible artwork height ≈ logoMaxHeight */
  opticalSizing?: boolean;
  isEditing?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHide: () => void;
  dragHandle?: React.ReactNode;
  /** Called when user clicks the empty placeholder — should open the media picker */
  onPickImage?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LogoCell({
  item,
  logoMaxHeight,
  normalizePadding,
  showHoverEffect,
  grayscaleUntilHover,
  roundedCorners,
  opticalSizing = false,
  isEditing,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onToggleHide,
  dragHandle,
  onPickImage,
}: LogoCellProps) {
  const [hovered, setHovered] = useState(false);
  const [imgScale, setImgScale] = useState<number>(1);

  // Measure optical scale whenever url or opticalSizing changes
  useEffect(() => {
    if (!opticalSizing || !item.imageUrl) { setImgScale(1); return; }
    measureOpticalScale(item.imageUrl, setImgScale);
  }, [opticalSizing, item.imageUrl]);

  // Hide non-editing hidden items
  if (!isEditing && item.hidden) return null;

  const hasUrl = item.clickAction === "url" && !!item.clickTarget;

  // ── CSS classes ────────────────────────────────────────────────────────────
  const cellPad   = normalizePadding ? "p-5" : "p-3";
  const radius    = roundedCorners ? "rounded-xl" : "rounded-lg";
  const hoverCls  = showHoverEffect
    ? "hover:scale-105 hover:shadow-lg transition-all duration-200"
    : "transition-all duration-150";
  const grayCls   = grayscaleUntilHover && !isEditing
    ? "grayscale hover:grayscale-0 transition-all duration-300"
    : "";
  const hiddenOp  = isEditing && item.hidden ? "opacity-40" : "";
  const selRing   = selected && isEditing ? "ring-2 ring-primary ring-offset-2" : "";
  const cursor    = isEditing ? "cursor-pointer" : hasUrl ? "cursor-pointer" : "";

  // ── Image or placeholder ───────────────────────────────────────────────────
  const imgEl = item.imageUrl ? (
    // Wrap in a fixed-height container so the optical scale transform clips cleanly
    <div
      style={{ height: logoMaxHeight, width: "100%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <img
        src={item.imageUrl}
        alt={item.imageAlt ?? item.title ?? "logo"}
        className={`object-contain ${grayCls}`}
        style={{
          height: logoMaxHeight,
          maxWidth: "100%",
          transform: opticalSizing && imgScale !== 1 ? `scale(${imgScale})` : undefined,
          transformOrigin: "center",
          transition: "transform 0.15s ease",
        }}
        draggable={false}
      />
    </div>
  ) : isEditing ? (
    <div
      className="w-full flex flex-col items-center justify-center gap-1 text-primary/50 hover:text-primary transition-colors"
      style={{ height: logoMaxHeight }}
    >
      <ImagePlus className="w-5 h-5" />
      <span className="text-[10px]">{onPickImage ? "Click to pick logo" : "Add logo"}</span>
    </div>
  ) : null;

  // ── Edit toolbar ───────────────────────────────────────────────────────────
  const editToolbar = isEditing ? (
    <div className="absolute top-1.5 right-1.5 z-20 opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center gap-0.5 bg-white/95 dark:bg-gray-900/95 rounded-md shadow-md px-1 py-0.5 border border-border/50">
      {dragHandle && (
        <span className="text-muted-foreground cursor-grab active:cursor-grabbing px-0.5">
          {dragHandle}
        </span>
      )}
      <button type="button" onClick={e => { e.stopPropagation(); onSelect(); }}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit">
        <Pencil className="w-3 h-3" />
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); onDuplicate(); }}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Duplicate">
        <Copy className="w-3 h-3" />
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); onToggleHide(); }}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={item.hidden ? "Show" : "Hide"}>
        {item.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }}
        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors" title="Delete">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  ) : null;

  const cell = (
    <div
      data-universal-card
      className={`group/logo relative flex items-center justify-center bg-card border border-border/60 ${cellPad} ${radius} ${hoverCls} ${hiddenOp} ${selRing} ${cursor}`}
      style={{ minHeight: logoMaxHeight + (normalizePadding ? 40 : 24) }}
      onClick={() => {
        if (!isEditing) return;
        // Empty cell with media library available → open picker directly
        if (!item.imageUrl && onPickImage) {
          onPickImage();
        } else {
          onSelect();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editToolbar}
      {imgEl}
    </div>
  );

  // Wrap in <a> for clickable logos in view mode
  if (!isEditing && hasUrl && item.clickTarget) {
    const isExternal = /^https?:\/\//.test(item.clickTarget);
    return (
      <a
        href={item.clickTarget}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        title={item.title}
        aria-label={item.title}
        className={hovered ? "opacity-90" : ""}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {cell}
      </a>
    );
  }

  return cell;
}
