import { type ReactNode } from "react";
import {
  ChevronUp, ChevronDown, Copy, EyeOff, Eye, Plus, Trash2, Lock, Pencil,
} from "lucide-react";

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
 */
export interface EditableWrapperProps {
  /** Stable unique id — used for data-section-canvas-id */
  id: string;
  /** Human-readable type label shown in the badge (e.g. "Hero Section") */
  label: string;
  /** Whether this object is currently selected / active */
  isSelected: boolean;
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
  /** Optional extra toolbar buttons inserted before the Delete button */
  extraToolbar?: ReactNode;
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
}

export function EditableWrapper({
  id,
  label,
  isSelected,
  isHidden,
  isFirst,
  isLast,
  isHeader,
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
}: EditableWrapperProps) {
  return (
    <div
      data-section-canvas-id={id}
      className={`group/sec relative cursor-pointer transition-all ${
        isSelected
          ? "ring-2 ring-inset ring-primary/60"
          : "hover:ring-2 hover:ring-inset hover:ring-muted-foreground/20"
      } ${isHidden ? "opacity-50" : ""}`}
      onClick={onSelect}
      onDoubleClick={onDoubleClickPrimary ? (e) => {
        // Only fire when the user double-clicked the wrapper itself, not an
        // InlineEditableText child (those handle their own dblclick and
        // stopPropagation() in handleDoubleClick — so this only fires on
        // background areas of the section where no editable was targeted).
        if ((e.target as HTMLElement).dataset.inlineEditable) return;
        e.stopPropagation();
        onDoubleClickPrimary();
      } : undefined}
    >
      {/* Type label badge — faint on hover, solid primary when selected */}
      <div className="absolute top-1 left-1 z-10 flex items-center gap-1.5 pointer-events-none">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-all duration-150 ${
            isSelected
              ? "bg-primary text-primary-foreground opacity-100"
              : "bg-foreground/70 text-background opacity-0 group-hover/sec:opacity-100"
          }`}
        >
          {isHeader && <Lock className="w-2.5 h-2.5" />}
          {label}
        </span>

        {/* Hint text for the locked header */}
        {isSelected && isHeader && (
          <span className="text-[10px] text-primary-foreground/70 bg-primary/60 px-1.5 py-0.5 rounded">
            Edit nav &amp; CTA
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
          Not shown for the locked header section. */}
      {!isHeader && (
        <div
          className={`absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 bg-gray-900/90 backdrop-blur-sm rounded-lg px-1 py-1 shadow-lg transition-opacity ${
            isSelected ? "opacity-100" : "opacity-0 group-hover/sec:opacity-100"
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Edit — always first in toolbar; opens inspector / focuses first editable field */}
          {onEdit && (
            <>
              <button
                type="button"
                onClick={onEdit}
                title="Edit (Enter)"
                className="p-1 rounded text-white hover:bg-white/20 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-3.5 bg-white/20 mx-0.5" />
            </>
          )}

          {/* Move controls */}
          {onMoveUp && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onMoveUp(); }}
              disabled={isFirst}
              title="Move up"
              className={`p-1 rounded text-white transition-colors ${
                isFirst ? "opacity-25 cursor-not-allowed" : "hover:bg-white/20"
              }`}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onMoveDown(); }}
              disabled={isLast}
              title="Move down"
              className={`p-1 rounded text-white transition-colors ${
                isLast ? "opacity-25 cursor-not-allowed" : "hover:bg-white/20"
              }`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Separator between move controls and action controls */}
          {(onMoveUp || onMoveDown) && <div className="w-px h-3.5 bg-white/20 mx-0.5" />}

          {/* Duplicate */}
          {onDuplicate && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDuplicate(); }}
              title="Duplicate"
              className="p-1 rounded text-white hover:bg-white/20 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Hide / Show */}
          {onToggleHide && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggleHide(); }}
              title={isHidden ? "Show" : "Hide"}
              className="p-1 rounded text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Add section below */}
          {onInsertBelow && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onInsertBelow(); }}
              title="Add section below"
              className="p-1 rounded text-white hover:bg-white/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Extra toolbar items (caller-supplied, e.g. image Replace button) */}
          {extraToolbar}

          {/* Delete — always last, with red accent */}
          {onDelete && (
            <>
              <div className="w-px h-3.5 bg-white/20 mx-0.5" />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete(); }}
                title="Delete (Del)"
                className="p-1 rounded text-red-300 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
