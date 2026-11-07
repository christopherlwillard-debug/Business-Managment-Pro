import { useState, useRef, type ReactNode } from "react";
import {
  ChevronUp, ChevronDown, Copy, EyeOff, Eye, Plus, Trash2, Lock, Pencil, Sparkles, Settings2,
} from "lucide-react";
import type { BlockStyle } from "./sections/BlockStyleWrapper";

// ── Padding guide helpers ─────────────────────────────────────────────────────

const PADDING_SNAP_VALUES = [0, 8, 16, 24, 32, 48, 64, 80, 96, 128, 160, 200];

function snapPadding(v: number): number {
  return PADDING_SNAP_VALUES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/**
 * Renders two drag-to-adjust horizontal guides inside the section:
 * one at the top padding boundary, one at the bottom.
 * Dragging adjusts paddingTop / paddingBottom live with snapping.
 * Only visible in editor mode (parent controls rendering).
 */
function PaddingGuides({
  paddingTop,
  paddingBottom,
  onDragStart,
  onChangeLive,
}: {
  paddingTop: number;
  paddingBottom: number;
  /** Called once on the first pointer-down — caller should push a history snapshot. */
  onDragStart: () => void;
  /** Live update during drag (no history push; snapshot was taken on drag start). */
  onChangeLive: (paddingTop: number, paddingBottom: number) => void;
}) {
  const [dragging, setDragging] = useState<"top" | "bottom" | null>(null);
  const [liveTop, setLiveTop] = useState<number | null>(null);
  const [liveBottom, setLiveBottom] = useState<number | null>(null);
  const [snapFlash, setSnapFlash] = useState<"top" | "bottom" | null>(null);
  const dragStartedRef = useRef(false);
  const dragRef = useRef<{ startY: number; startPadding: number } | null>(null);

  const displayTop = liveTop ?? paddingTop;
  const displayBottom = liveBottom ?? paddingBottom;

  function flashSnap(which: "top" | "bottom") {
    setSnapFlash(which);
    setTimeout(() => setSnapFlash(s => (s === which ? null : s)), 200);
  }

  function handlePointerDownTop(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startPadding: paddingTop };
    setDragging("top");
    if (!dragStartedRef.current) { dragStartedRef.current = true; onDragStart(); }
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handlePointerDownBottom(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startPadding: paddingBottom };
    setDragging("bottom");
    if (!dragStartedRef.current) { dragStartedRef.current = true; onDragStart(); }
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMoveTop(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging !== "top" || !dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    // Drag UP (negative delta) → increase paddingTop
    const raw = dragRef.current.startPadding - delta;
    const snapped = snapPadding(Math.max(0, Math.min(200, raw)));
    if (snapped !== (liveTop ?? paddingTop)) flashSnap("top");
    setLiveTop(snapped);
    onChangeLive(snapped, liveBottom ?? paddingBottom);
  }

  function handlePointerMoveBottom(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging !== "bottom" || !dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    // Drag DOWN (positive delta) → increase paddingBottom
    const raw = dragRef.current.startPadding + delta;
    const snapped = snapPadding(Math.max(0, Math.min(200, raw)));
    if (snapped !== (liveBottom ?? paddingBottom)) flashSnap("bottom");
    setLiveBottom(snapped);
    onChangeLive(liveTop ?? paddingTop, snapped);
  }

  function handlePointerUp() {
    setDragging(null);
    setLiveTop(null);
    setLiveBottom(null);
    dragStartedRef.current = false;
    dragRef.current = null;
  }

  function handleGuideKeyDown(e: React.KeyboardEvent<HTMLDivElement>, which: "top" | "bottom") {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragStartedRef.current) { dragStartedRef.current = true; onDragStart(); }
    const current = which === "top" ? (liveTop ?? paddingTop) : (liveBottom ?? paddingBottom);
    const next = e.key === "Home"
      ? 0
      : e.key === "End"
        ? 200
        : Math.max(0, Math.min(200, current + (e.key === "ArrowUp" ? 8 : -8)));
    if (which === "top") {
      setLiveTop(next);
      onChangeLive(next, liveBottom ?? paddingBottom);
    } else {
      setLiveBottom(next);
      onChangeLive(liveTop ?? paddingTop, next);
    }
    handlePointerUp();
  }

  const topActive = dragging === "top" || snapFlash === "top";
  const bottomActive = dragging === "bottom" || snapFlash === "bottom";

  return (
    <>
      {/* ── Top padding guide ─────────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 z-30 select-none pointer-events-none"
        style={{ top: displayTop }}
      >
        {/* 16 px hit area centred on the guide line */}
        <div
          className="absolute left-0 right-0 cursor-ns-resize"
          style={{ top: -8, height: 16, pointerEvents: "auto" }}
          onPointerDown={handlePointerDownTop}
          onPointerMove={handlePointerMoveTop}
          onPointerUp={handlePointerUp}
          onKeyDown={e => handleGuideKeyDown(e, "top")}
          onClick={e => e.stopPropagation()}
          role="slider"
          tabIndex={0}
          aria-label="Top section padding"
          aria-valuemin={0}
          aria-valuemax={200}
          aria-valuenow={displayTop}
        >
          {/* Visual dashed line */}
          <div
            className={`absolute left-6 right-6 border-t-2 border-dashed transition-colors duration-100 ${
              topActive ? "border-blue-400" : "border-primary/55"
            }`}
            style={{ top: 7 }}
          />
          {/* Value label — above the line */}
          <span
            className={`absolute left-6 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium whitespace-nowrap pointer-events-none transition-colors duration-100 ${
              topActive ? "bg-blue-500 text-white" : "bg-primary/75 text-primary-foreground"
            }`}
            style={{ top: -18 }}
          >
            ↕ {displayTop}px
          </span>
        </div>
      </div>

      {/* ── Bottom padding guide ──────────────────────────────────────── */}
      <div
        className="absolute left-0 right-0 z-30 select-none pointer-events-none"
        style={{ bottom: displayBottom }}
      >
        <div
          className="absolute left-0 right-0 cursor-ns-resize"
          style={{ top: -8, height: 16, pointerEvents: "auto" }}
          onPointerDown={handlePointerDownBottom}
          onPointerMove={handlePointerMoveBottom}
          onPointerUp={handlePointerUp}
          onKeyDown={e => handleGuideKeyDown(e, "bottom")}
          onClick={e => e.stopPropagation()}
          role="slider"
          tabIndex={0}
          aria-label="Bottom section padding"
          aria-valuemin={0}
          aria-valuemax={200}
          aria-valuenow={displayBottom}
        >
          {/* Visual dashed line */}
          <div
            className={`absolute left-6 right-6 border-t-2 border-dashed transition-colors duration-100 ${
              bottomActive ? "border-blue-400" : "border-primary/55"
            }`}
            style={{ top: 7 }}
          />
          {/* Value label — below the line */}
          <span
            className={`absolute left-6 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium whitespace-nowrap pointer-events-none transition-colors duration-100 ${
              bottomActive ? "bg-blue-500 text-white" : "bg-primary/75 text-primary-foreground"
            }`}
            style={{ top: 16 }}
          >
            ↕ {displayBottom}px
          </span>
        </div>
      </div>
    </>
  );
}

// ── Tooltip-aware toolbar button ──────────────────────────────────────────────
// Wraps a button with a small floating label that appears after a 150 ms hover
// delay so it never flickers on quick mouse-overs.

function ToolbarBtn({
  onClick,
  disabled,
  tooltip,
  className,
  children,
}: {
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  tooltip: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className="relative group/btn flex-shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={className}
        aria-label={tooltip}
      >
        {children}
      </button>
      {/* Tooltip */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-1.5 py-0.5 bg-gray-950/95 text-white text-[10px] font-medium rounded
          whitespace-nowrap shadow-lg border border-white/10
          opacity-0 group-hover/btn:opacity-100
          transition-opacity duration-100 delay-150
          z-[9999]"
      >
        {tooltip}
      </span>
    </div>
  );
}

/**
 * EditableWrapper — the shared architectural foundation for every editable
 * object in the website editor canvas: sections, rows, columns, and
 * individual components (heading, paragraph, button, image, spacer, divider,
 * video, testimonial, FAQ item, gallery image, footer element, etc.).
 *
 * All hover/selection/toolbar state is driven here — never re-implemented
 * per-section or per-component. Future section or component types inherit
 * all interactions with zero custom implementation.
 *
 * Universal toolbar contract: Edit · Move ↑↓ · Duplicate · Hide · Delete
 * (move, duplicate, hide, insert-below, and delete are all optional so the
 * same wrapper works for both the locked header and free-floating items).
 *
 * Interaction model: Single Click = Select, Double Click = Edit, Right Click = Actions
 */
export interface EditableWrapperProps {
  /** Stable unique id — used for data-section-canvas-id */
  id: string;
  /** Human-readable type label shown in the badge (e.g. "Hero Section") */
  label: string;
  /** Whether this object is currently selected / active */
  isSelected: boolean;
  /** M8: True when this element is part of a Shift+click multi-selection (cyan ring). */
  isMultiSelected?: boolean;
  /** When true the canvas renders it dimmed and with a "Hidden" badge */
  isHidden?: boolean;
  /** Suppresses move-up when the item is first in its container */
  isFirst?: boolean;
  /** Suppresses move-down when the item is last in its container */
  isLast?: boolean;
  /**
   * Marks the wrapper as the locked header section.
   * Hides move/hide/delete controls and shows "Edit nav & CTA" hint.
   */
  isHeader?: boolean;
  /**
   * When true, shows a lock badge and suppresses all toolbar actions.
   * Only the context-menu unlock action is available.
   */
  locked?: boolean;
  /** Optional extra toolbar buttons inserted before the Delete button */
  extraToolbar?: ReactNode;
  /** Opens the Advanced inspector drawer for this element */
  onAdvanced?: () => void;
  children: ReactNode;
  /** Called when the user clicks the element to select it */
  onSelect: (e: React.MouseEvent) => void;
  /**
   * Called when the user clicks the Edit (pencil) toolbar button or presses
   * Enter with this item selected. For sections this opens/focuses the
   * settings panel; for components it focuses the first editable field in
   * the component inspector panel. Always implement this to satisfy the
   * universal Edit · Duplicate · Hide · Delete toolbar contract.
   */
  onEdit?: () => void;
  /**
   * Called when the user double-clicks the wrapper area (not on an
   * InlineEditableText element directly). Allows the parent to activate
   * inline editing on the section's primary text target.
   */
  onDoubleClickPrimary?: () => void;
  onDuplicate?: () => void;
  onToggleHide?: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onInsertBelow?: () => void;
  /** Called on double-click — mirrors the Edit action (Double Click = Edit contract) */
  onDoubleClick?: (e: React.MouseEvent) => void;
  /** Called on right-click — opens the canvas context menu */
  onContextMenu?: (e: React.MouseEvent) => void;
  /**
   * Called when the user double-clicks a canvas element that carries a
   * `data-element-type` attribute.  Receives the element type string and a
   * human-readable label so the inspector can show a breadcrumb.
   */
  onSubElementSelect?: (type: string, label: string) => void;
  /**
   * Section block-style — when provided (editor mode only), padding guide
   * handles are shown on hover/selection so the user can drag-adjust
   * paddingTop / paddingBottom directly on the canvas.
   */
  blockStyle?: BlockStyle;
  /**
   * Called once on the first pointer-down of a padding drag.
   * Caller should push a history snapshot here (before any live updates).
   * If undefined, padding guides are not rendered.
   */
  onPaddingDragStart?: () => void;
  /** Live padding update during drag (no history push — snapshot is taken on drag start). */
  onPaddingChangeLive?: (paddingTop: number, paddingBottom: number) => void;
}

/** Maps data-element-type values to human-readable labels for the breadcrumb. */
const ELEMENT_TYPE_LABELS: Record<string, string> = {
  heading:    "Heading",
  subheading: "Subheading",
  paragraph:  "Paragraph",
  logo:       "Logo",
  image:      "Image",
  button:     "Button",
  phone:      "Phone Number",
  email:      "Email",
  address:    "Address",
  hours:      "Hours",
  badge:      "Badge",
  background: "Background",
  tagline:    "Tagline",
  copyright:  "Copyright",
  social:     "Social Links",
};

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']") !== null;
}

export function EditableWrapper({
  id,
  label,
  isSelected,
  isMultiSelected,
  isHidden,
  isFirst,
  isLast,
  isHeader,
  locked,
  extraToolbar,
  children,
  onSelect,
  onEdit,
  onDoubleClickPrimary,
  onDuplicate,
  onToggleHide,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertBelow,
  onDoubleClick,
  onContextMenu,
  onSubElementSelect,
  blockStyle,
  onPaddingDragStart,
  onPaddingChangeLive,
  onAdvanced,
}: EditableWrapperProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Show padding guides when hovered or selected, and guide callbacks are provided.
  const showPaddingGuides =
    !locked &&
    !isHidden &&
    !!onPaddingDragStart &&
    !!onPaddingChangeLive &&
    (isHovered || isSelected);

  return (
    <div
      data-section-canvas-id={id}
      role="group"
      tabIndex={locked ? -1 : 0}
      aria-label={`${label}${isSelected ? ", selected" : ""}${isHidden ? ", hidden" : ""}`}
      aria-selected={isSelected}
      className={`group/sec relative transition-all duration-100 ${
        locked
          ? "cursor-not-allowed"
          : "cursor-pointer"
      } ${
        isSelected && !locked
          ? "ring-2 ring-inset ring-primary/60 bg-primary/[0.02]"
          : isMultiSelected && !locked
          ? "ring-2 ring-inset ring-cyan-500/60 bg-cyan-500/[0.02]"
          : !locked
          ? "hover:ring-2 hover:ring-inset hover:ring-primary/40 hover:bg-primary/[0.02]"
          : "ring-2 ring-inset ring-slate-400/40"
      } ${isHidden ? "opacity-50" : ""}`}
      onClick={locked ? undefined : onSelect}
      onKeyDown={locked ? undefined : e => {
        if (isTextEditingTarget(e.target)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onSelect(e as unknown as React.MouseEvent);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={locked ? undefined : (e) => {
        // If the user double-clicked directly on an InlineEditableText element,
        // that element's own handleDoubleClick has already called e.stopPropagation()
        // and started editing — nothing to do here. Only proceed when the target is
        // a background area (no data-inline-editable attribute).
        if ((e.target as HTMLElement).dataset.inlineEditable) return;
        e.stopPropagation();

        // ── Sub-element drill-down ────────────────────────────────────────────
        // Check if the double-clicked element (or an ancestor) carries a
        // data-element-type attribute.  If so, notify the parent so it can
        // mark that element as selected and update the inspector breadcrumb.
        const elWithType = (e.target as HTMLElement).closest<HTMLElement>("[data-element-type]");
        if (elWithType && onSubElementSelect) {
          const elType  = elWithType.dataset.elementType ?? "";
          const elLabel = elWithType.dataset.elementLabel ?? ELEMENT_TYPE_LABELS[elType] ?? elType;
          onSubElementSelect(elType, elLabel);
        }

        // Capture cursor position so we can target the correct editable after re-render.
        const { clientX, clientY } = e;
        requestAnimationFrame(() => {
          // After the section activates and InlineEditableText elements render,
          // find the element under the cursor. Prefer the exact element; fall back
          // to the section's first editable.
          const elAtCursor = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
          const target =
            elAtCursor?.closest<HTMLElement>("[data-inline-editable]") ??
            document.querySelector<HTMLElement>(`[data-section-canvas-id="${id}"] [data-inline-editable]`);
          if (target) target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        });
        // Also call the legacy prop if provided (kept for compatibility).
        onDoubleClickPrimary?.();
        // Also call the right-click-system's onDoubleClick if provided.
        onDoubleClick?.(e);
      }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e); }}
    >
      {/* Type label chip — hover-only, pill style, minimal weight */}
      <div className="absolute top-1 left-1 z-10 flex items-center gap-1.5 pointer-events-none">
        <span
          className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 transition-all duration-150 border ${
            isSelected
              ? "bg-black/50 backdrop-blur-sm text-white/85 border-white/20 opacity-80"
              : "bg-black/30 backdrop-blur-sm text-white/65 border-white/10 opacity-0 group-hover/sec:opacity-60"
          }`}
        >
          {(isHeader || locked) && <Lock className="w-2 h-2" />}
          {label}
        </span>

        {/* Hint text for the locked header */}
        {isSelected && isHeader && (
          <span className="text-[10px] text-primary-foreground/70 bg-primary/60 px-1.5 py-0.5 rounded">
            Edit nav &amp; CTA
          </span>
        )}

        {/* Locked-state badge */}
        {locked && !isHeader && (
          <span className="text-[10px] bg-slate-600/80 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <Lock className="w-2.5 h-2.5" />
            Locked
          </span>
        )}

        {/* Hidden-state badge */}
        {isHidden && (
          <span className="text-[10px] bg-orange-500/80 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <EyeOff className="w-2.5 h-2.5" />
            Hidden
          </span>
        )}
      </div>

      {/* Floating action toolbar — invisible until hover/selection.
          Universal contract: Edit · Move ↑↓ · Duplicate · Hide · Delete
          Not shown for the locked header section or locked items. */}
      {!isHeader && !locked && (
        <div
          className={`absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-gray-900/90 backdrop-blur-sm rounded-lg px-1 py-1 shadow-lg transition-opacity duration-150 ease-out ${
            isSelected ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Edit — always first in toolbar; opens inspector / focuses first editable field */}
          {onEdit && (
            <>
              <ToolbarBtn
                onClick={onEdit}
                tooltip="Edit"
                className="p-1 rounded text-white hover:bg-white/20 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <div className="w-px h-3.5 bg-white/20 mx-0.5" />
            </>
          )}

          {/* Move controls */}
          {onMoveUp && (
            <ToolbarBtn
              onClick={e => { e.stopPropagation(); onMoveUp(); }}
              disabled={isFirst}
              tooltip="Move up"
              className={`p-1 rounded text-white transition-colors ${
                isFirst ? "opacity-25 cursor-not-allowed" : "hover:bg-white/20"
              }`}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </ToolbarBtn>
          )}
          {onMoveDown && (
            <ToolbarBtn
              onClick={e => { e.stopPropagation(); onMoveDown(); }}
              disabled={isLast}
              tooltip="Move down"
              className={`p-1 rounded text-white transition-colors ${
                isLast ? "opacity-25 cursor-not-allowed" : "hover:bg-white/20"
              }`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </ToolbarBtn>
          )}

          {/* Separator between move controls and action controls */}
          {(onMoveUp || onMoveDown) && <div className="w-px h-3.5 bg-white/20 mx-0.5" />}

          {/* Duplicate */}
          {onDuplicate && (
            <ToolbarBtn
              onClick={e => { e.stopPropagation(); onDuplicate(); }}
              tooltip="Duplicate"
              className="p-1 rounded text-white hover:bg-white/20 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </ToolbarBtn>
          )}

          {/* Hide / Show */}
          {onToggleHide && (
            <ToolbarBtn
              onClick={e => { e.stopPropagation(); onToggleHide(); }}
              tooltip={isHidden ? "Show" : "Hide"}
              className="p-1 rounded text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </ToolbarBtn>
          )}

          {/* Add section below */}
          {onInsertBelow && (
            <ToolbarBtn
              onClick={e => { e.stopPropagation(); onInsertBelow(); }}
              tooltip="Add section below"
              className="p-1 rounded text-white hover:bg-white/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </ToolbarBtn>
          )}

          {/* Extra toolbar items (caller-supplied, e.g. image Replace button) */}
          {extraToolbar}

          {/* Advanced settings — opens the inspector drawer */}
          {onAdvanced && (
            <>
              <div className="w-px h-3.5 bg-white/20 mx-0.5" />
              <ToolbarBtn
                onClick={e => { e.stopPropagation(); onAdvanced(); }}
                tooltip="Advanced settings"
                className="p-1 rounded text-blue-300 hover:bg-blue-400/20 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </ToolbarBtn>
            </>
          )}

          {/* AI slot — reserved for Phase 4; always visible but disabled until enabled */}
          <>
            <div className="w-px h-3.5 bg-white/20 mx-0.5" />
            <ToolbarBtn
              disabled
              tooltip="AI Rewrite (coming soon)"
              className="p-1 rounded text-purple-300/40 cursor-not-allowed transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </>

          {/* Delete — always last, with red accent */}
          {onDelete && (
            <>
              <div className="w-px h-3.5 bg-white/20 mx-0.5" />
              <ToolbarBtn
                onClick={e => { e.stopPropagation(); onDelete(); }}
                tooltip="Delete"
                className="p-1 rounded text-red-300 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </ToolbarBtn>
            </>
          )}
        </div>
      )}

      {children}

      {/* Padding guides — only in editor mode, only when hovered or selected */}
      {showPaddingGuides && (
        <PaddingGuides
          paddingTop={blockStyle?.paddingTop ?? 0}
          paddingBottom={blockStyle?.paddingBottom ?? 0}
          onDragStart={onPaddingDragStart!}
          onChangeLive={onPaddingChangeLive!}
        />
      )}
    </div>
  );
}
