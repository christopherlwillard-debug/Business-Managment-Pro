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
  onCommit: (value: string) => void;
}

/**
 * InlineEditableText
 *
 * Renders as a normal HTML element. When double-clicked inside the canvas
 * editor (where InlineEditContext.Provider wraps the tree), it switches to
 * a contenteditable element with a blue ring.
 *
 * Keyboard contract:
 *   Escape  — escapeBehavior="commit" (default): save and exit
 *             escapeBehavior="cancel":            revert to original, no save
 *             stopPropagation in both cases — prevents global handler from deselecting section
 *   Enter   — enterBehavior="newline" (default): insert newline (no action)
 *             enterBehavior="commit":             save and exit
 *   Tab     — save and advance focus to next editable in same section (via context moveToNext)
 *   Blur    — always saves
 *
 * Safe to render outside the Provider (renders as a static element).
 */
export function InlineEditableText({
  id,
  value,
  placeholder = "Double-click to edit",
  enterBehavior = "newline",
  escapeBehavior = "commit",
  as: Tag = "span",
  className = "",
  style,
  onCommit,
}: InlineEditableTextProps) {
  const ctx = useInlineEditContext();
  const isActive = ctx !== null && ctx.editingId === id;
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

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (ctx && !ctx.editingId) {
      ctx.startEditing(id, value, onCommit, enterBehavior, escapeBehavior);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
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
        onKeyDown={handleKeyDown}
        onBlur={() => ctx?.commitEdit()}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        data-inline-editable={id}
      />
    );
  }

  return (
    <EL
      ref={ref}
      className={`${className}${empty && ctx ? " opacity-40 italic" : ""}`}
      style={style}
      onDoubleClick={ctx ? handleDoubleClick : undefined}
      data-inline-editable={id}
    >
      {empty && ctx ? placeholder : value}
    </EL>
  );
}
