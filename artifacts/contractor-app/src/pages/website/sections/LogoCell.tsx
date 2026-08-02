import { useState } from "react";
import { ImagePlus, Pencil, Copy, EyeOff, Eye, Trash2 } from "lucide-react";
import type { CardComponent } from "../website-types";

// ── Props ──────────────────────────────────────────────────────────────────────

interface LogoCellProps {
  item: CardComponent;
  logoMaxHeight: number;
  normalizePadding: boolean;
  showHoverEffect: boolean;
  grayscaleUntilHover: boolean;
  roundedCorners: boolean;
  isEditing?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleHide: () => void;
  dragHandle?: React.ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LogoCell({
  item,
  logoMaxHeight,
  normalizePadding,
  showHoverEffect,
  grayscaleUntilHover,
  roundedCorners,
  isEditing,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onToggleHide,
  dragHandle,
}: LogoCellProps) {
  const [hovered, setHovered] = useState(false);

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
    <img
      src={item.imageUrl}
      alt={item.imageAlt ?? item.title ?? "logo"}
      className={`w-full object-contain ${grayCls}`}
      style={{ maxHeight: logoMaxHeight, height: logoMaxHeight }}
      draggable={false}
    />
  ) : isEditing ? (
    <div
      className="w-full flex flex-col items-center justify-center gap-1 text-muted-foreground/40"
      style={{ height: logoMaxHeight }}
    >
      <ImagePlus className="w-5 h-5" />
      <span className="text-[10px]">Add logo</span>
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
      onClick={() => isEditing && onSelect()}
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
