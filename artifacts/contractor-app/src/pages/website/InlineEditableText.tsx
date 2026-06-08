import { useLayoutEffect, useRef } from "react";
import { useInlineEditContext } from "./InlineEditContext";

type InlineAs = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div" | "a" | "li" | "strong";

interface InlineEditableTextProps {
  id: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
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
 *   • Escape  — single-line: cancel/revert (stopPropagation, no section deselect)
 *               multiline:  commit (save current text, stopPropagation)
 *   • Enter   — single-line: commit; multiline: newline
 *   • Tab     — commit + advance focus to next editable in same section (via context moveToNext)
 *   • Blur    — always commits
 *
 * Safe to render outside the Provider (static element, no dblclick behavior).
 */
export function InlineEditableText({
  id,
  value,
  placeholder = "Double-click to edit",
  multiline = false,
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
      ctx.startEditing(id, value, onCommit, multiline);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      // stopPropagation prevents the global keydown handler from deselecting the section.
      e.stopPropagation();
      if (multiline) {
        // For multiline text (paragraphs, FAQ answers): Escape = commit (save current draft).
        // Enter inserts newlines so Escape is the only way to finish.
        ctx?.commitEdit();
      } else {
        // For single-line fields (headings, button labels, stat values, etc.):
        // Escape = cancel/revert. The original snapshot is restored via cancelEdit().
        ctx?.cancelEdit();
      }
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      ctx?.commitEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      ctx?.commitEdit();
      // Navigation is delegated to context so the extension contract is not
      // coupled to DOM event simulation inside this component.
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
