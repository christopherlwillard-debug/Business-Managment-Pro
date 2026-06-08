import { useLayoutEffect, useRef } from "react";
import { useInlineEditContext } from "./InlineEditContext";

type InlineAs = "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div" | "a" | "li" | "strong";

interface InlineEditableTextProps {
  /** Unique stable ID for this editable field (e.g. `{sectionId}-headline`) */
  id: string;
  /** Current text value */
  value: string;
  /** Shown in editing mode when value is empty */
  placeholder?: string;
  /** Allow Enter key to insert newlines (paragraphs, FAQ answers, etc.) */
  multiline?: boolean;
  /** HTML element to render as */
  as?: InlineAs;
  className?: string;
  style?: React.CSSProperties;
  /** Called with the final committed value when the user exits editing */
  onCommit: (value: string) => void;
}

/**
 * InlineEditableText
 *
 * Renders as a normal HTML element by default. When the user double-clicks
 * (inside the canvas editor where InlineEditContext.Provider wraps the tree),
 * it switches to a contenteditable element with a blue ring.
 *
 * Keyboard contract:
 *   • Escape  — cancel (revert to original value)
 *   • Enter   — commit for single-line elements; newline for multiline
 *   • Tab     — commit and move focus to the next editable in DOM order
 *   • Blur    — always commits
 *
 * Safe to render without the Provider (e.g. public site, preview mode) —
 * it simply renders a static element with no double-click behavior.
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
    // Set content imperatively to avoid React cursor-reset during typing
    if (ref.current.textContent !== ctx!.draft) {
      ref.current.textContent = ctx!.draft;
    }
    ref.current.focus();
    // Place cursor at end of text
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
      ctx.startEditing(id, value, onCommit);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      ctx?.cancelEdit();
    } else if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      ctx?.commitEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      ctx?.commitEdit();
      // Move focus to the next InlineEditableText in DOM order
      requestAnimationFrame(() => {
        const all = Array.from(
          document.querySelectorAll<HTMLElement>("[data-inline-editable]")
        );
        const idx = all.findIndex(el => el.dataset.inlineEditable === id);
        if (idx >= 0 && idx + 1 < all.length) {
          all[idx + 1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        }
      });
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
