import { useLayoutEffect, useRef } from "react";
import { useInlineEditContext, type EnterBehavior, type EscapeBehavior } from "./InlineEditContext";

type InlineAs = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div" | "a" | "li" | "strong";

interface InlineEditableTextProps {
  id: string;
  value: string;
  placeholder?: string;
  /**
   * Controls what the Enter key does while editing.
   * "newline" (default) — inserts a line break (suits headings, paragraphs, all running text).
   * "commit"            — saves and exits (suits single-line labels like button text).
   */
  enterBehavior?: EnterBehavior;
  /**
   * Controls what the Escape key does while editing.
   * "commit" (default) — saves the current draft (the only exit key when Enter inserts newlines).
   * "cancel"           — reverts to the original value without saving.
   */
  escapeBehavior?: EscapeBehavior;
  as?: InlineAs;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

/**
 * InlineEditableText
 *
 * Three interaction states when wrapped in InlineEditContext.Provider:
 *
 *   1. Default    — renders as a normal HTML element; cursor is "text" to hint editability.
 *   2. Selected   — single-click selects the element (blue ring + floating toolbar visible).
 *                   Press Enter or double-click to advance to editing mode.
 *   3. Editing    — contenteditable with full keyboard controls.
 *
 * Keyboard contract (editing mode):
 *   Escape  — escapeBehavior="commit" (default): save and exit
 *             escapeBehavior="cancel":            revert to original, no save
 *   Enter   — enterBehavior="newline" (default): insert newline
 *             enterBehavior="commit":             save and exit
 *   Tab     — save and advance focus to next editable in same section
 *
 * Keyboard contract (selected mode):
 *   Enter   — enter editing mode
 *
 * Safe to render outside the Provider (renders as a static element).
 */
export function InlineEditableText({
  id,
  value,
  placeholder = "Click to select, double-click to edit",
  enterBehavior = "newline",
  escapeBehavior = "commit",
  as: Tag = "span",
  className = "",
  style,
  onCommit,
}: InlineEditableTextProps) {
  const ctx = useInlineEditContext();
  const isActive = ctx !== null && ctx.editingId === id;
  const isSelected = ctx !== null && ctx.selectedId === id && !isActive;
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!isActive || !ref.current) return;
    if (ref.current.textContent !== ctx!.draft) {
      ref.current.textContent = ctx!.draft;
    }
    ref.current.focus();
    const sel = window.getSelection();
    if (sel && ref.current) {
      const range = document.createRange();
      if (ref.current.childNodes.length > 0) {
        range.selectNodeContents(ref.current);
        range.collapse(false);
      } else {
        range.setStart(ref.current, 0);
        range.collapse(true);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (ctx && !isActive) {
      ctx.selectElement(id);
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (ctx && !ctx.editingId) {
      ctx.startEditing(id, value, onCommit, enterBehavior, escapeBehavior);
    }
  }

  // Keyboard handler for the selected-but-not-editing state
  function handleSelectedKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ctx?.startEditing(id, value, onCommit, enterBehavior, escapeBehavior);
    }
  }

  function handleEditingKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      // stopPropagation keeps the global keydown handler from deselecting the section.
      e.stopPropagation();
      if (escapeBehavior === "commit") {
        ctx?.commitEdit();
      } else {
        ctx?.cancelEdit();
      }
    } else if (e.key === "Enter" && enterBehavior === "commit") {
      e.preventDefault();
      ctx?.commitEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      ctx?.commitEdit();
      ctx?.moveToNext(id);
    }
  }

  const EL = Tag as React.ElementType;
  const empty = !value;

  if (isActive) {
    return (
      <EL
        ref={ref}
        className={`${className} outline-none cursor-text ring-2 ring-inset ring-primary/70 rounded-sm`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        onInput={(e: React.FormEvent<HTMLElement>) =>
          ctx!.updateDraft(e.currentTarget.textContent ?? "")
        }
        onKeyDown={handleEditingKeyDown}
        onBlur={() => ctx?.commitEdit()}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        data-inline-editable={id}
      />
    );
  }

  // Selected (ring visible, toolbar floating above, ready for Enter/double-click to edit)
  if (isSelected) {
    return (
      <EL
        ref={ref}
        tabIndex={0}
        className={`${className}${empty ? " opacity-40 italic" : ""} ring-2 ring-inset ring-primary/70 rounded-sm cursor-text outline-none`}
        style={style}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleSelectedKeyDown}
        data-inline-editable={id}
      >
        {empty ? placeholder : value}
      </EL>
    );
  }

  // Default: static display, single-click to select
  return (
    <EL
      ref={ref}
      className={`${className}${empty && ctx ? " opacity-40 italic" : ""}${ctx ? " cursor-text" : ""}`}
      style={style}
      tabIndex={ctx ? 0 : undefined}
      aria-label={ctx ? (empty ? placeholder : value) : undefined}
      onClick={ctx ? handleClick : undefined}
      onDoubleClick={ctx ? handleDoubleClick : undefined}
      onKeyDown={ctx ? handleSelectedKeyDown : undefined}
      data-inline-editable={id}
    >
      {empty && ctx ? placeholder : value}
    </EL>
  );
}
