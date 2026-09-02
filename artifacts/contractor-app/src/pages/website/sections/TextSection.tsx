import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Bold, Italic, Link2, Underline } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface TextContent {
  heading?: string;
  subheading?: string;
  body: string;
  alignment?: "left" | "center" | "right";
  maxWidth?: "sm" | "md" | "lg" | "full";
}

export function defaultTextContent(): TextContent {
  return {
    heading: "About This Page",
    subheading: "",
    body: "Write your content here. This block supports multi-line text and is great for explaining your services, policies, or telling your story.",
    alignment: "left",
    maxWidth: "md",
  };
}

interface TextSectionProps {
  content: TextContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: TextContent) => void;
  blockStyle?: BlockStyle;
}

const MAX_WIDTH_MAP: Record<string, string> = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  full: "max-w-full",
};

const ALIGN_MAP: Record<string, string> = {
  left: "text-left",
  center: "text-center mx-auto",
  right: "text-right ml-auto",
};

const RICH_TEXT_TAGS = new Set(["A", "B", "BR", "DIV", "EM", "FONT", "I", "P", "SPAN", "STRONG", "U"]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|tel:|#|\/)/i.test(href.trim());
}

function safeColor(value: string): string | null {
  const color = value.trim();
  if (
    /^#[\da-f]{3,8}$/i.test(color) ||
    /^(rgb|hsl)a?\([\d\s.,%+-]+\)$/i.test(color) ||
    /^[a-z]{1,30}$/i.test(color)
  ) {
    return color;
  }
  return null;
}

/**
 * Keep rich text deliberately small and predictable. Text blocks only need
 * inline emphasis, links, colors, and line breaks; dropping unknown elements
 * prevents pasted markup from bringing scripts, images, or layout with it.
 */
export function sanitizeRichText(value: string): string {
  if (!value) return "";
  if (typeof DOMParser === "undefined") {
    return escapeHtml(value).replace(/\r?\n/g, "<br />");
  }

  // Plain-text content from older Text Blocks should keep its line breaks.
  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return escapeHtml(value).replace(/\r?\n/g, "<br />");
  }

  const parsed = new DOMParser().parseFromString(`<div>${value}</div>`, "text/html");

  function serialize(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "IMG") return "";

    const children = Array.from(element.childNodes).map(serialize).join("");
    if (!RICH_TEXT_TAGS.has(tag)) return children;
    if (tag === "BR") return "<br />";
    if (tag === "B") return `<strong>${children}</strong>`;
    if (tag === "I") return `<em>${children}</em>`;

    if (tag === "A") {
      const href = element.getAttribute("href")?.trim() ?? "";
      return isSafeHref(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children}</a>`
        : children;
    }

    if (tag === "SPAN") {
      const color = safeColor(element.style.color ?? "");
      return color ? `<span style="color:${escapeHtml(color)}">${children}</span>` : children;
    }

    if (tag === "FONT") {
      const color = safeColor(element.getAttribute("color") ?? element.style.color ?? "");
      return color ? `<span style="color:${escapeHtml(color)}">${children}</span>` : children;
    }

    // contenteditable commonly represents each body line as a DIV or P.
    // Convert those block boundaries to the same BR representation used by
    // legacy plain text.
    if (tag === "DIV" || tag === "P") return `${children}<br />`;
    return `<${tag.toLowerCase()}>${children}</${tag.toLowerCase()}>`;
  }

  return serialize(parsed.body).replace(/(?:<br \/>)+$/, "");
}

function editableHtml(value: string): string {
  return sanitizeRichText(value);
}

interface RichTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
  style?: CSSProperties;
  minHeight?: string;
  singleLine?: boolean;
}

function RichTextField({
  value,
  onChange,
  placeholder,
  className,
  style,
  minHeight = "42px",
  singleLine = false,
}: RichTextFieldProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  function selectionBelongsToEditor(selection: Selection | null): boolean {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !editorRef.current) {
      return false;
    }
    const range = selection.getRangeAt(0);
    return editorRef.current.contains(range.commonAncestorContainer);
  }

  function rememberSelection() {
    const selection = window.getSelection();
    if (selectionBelongsToEditor(selection)) {
      savedRangeRef.current = selection!.getRangeAt(0).cloneRange();
      setHasSelection(true);
    } else if (!linkMode) {
      setHasSelection(false);
    }
  }

  function restoreSelection() {
    const range = savedRangeRef.current;
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorRef.current?.focus();
  }

  function emitChange() {
    const editor = editorRef.current;
    if (editor) onChange(sanitizeRichText(editor.innerHTML));
  }

  function runCommand(command: string, commandValue?: string) {
    restoreSelection();
    document.execCommand(command, false, commandValue);
    emitChange();
    rememberSelection();
  }

  function openLinkEditor() {
    restoreSelection();
    const selection = window.getSelection();
    const anchor = selection?.anchorNode instanceof Element
      ? selection.anchorNode.closest("a")
      : selection?.anchorNode?.parentElement?.closest("a");
    setLinkUrl(anchor?.getAttribute("href") ?? "");
    setLinkMode(true);
  }

  function applyLink() {
    if (linkUrl.trim()) {
      runCommand("createLink", linkUrl.trim());
    } else {
      runCommand("unlink");
    }
    setLinkMode(false);
    setLinkUrl("");
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const nextHtml = editableHtml(value);
    // Do not replace the live DOM while the user is typing; doing so moves the
    // caret and makes applying multiple formats to one selection unreliable.
    if (document.activeElement !== editor && editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [value]);

  useEffect(() => {
    const handleSelectionChange = () => rememberSelection();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  });

  function handleInput(event: FormEvent<HTMLDivElement>) {
    const editor = event.currentTarget;
    onChange(sanitizeRichText(editor.innerHTML));
    rememberSelection();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (singleLine && event.key === "Enter") {
      event.preventDefault();
    }
  }

  function handleToolbarMouseDown(event: ReactMouseEvent) {
    // Keep the browser selection in place when focus moves to a toolbar item.
    event.preventDefault();
  }

  return (
    <div className="relative">
      {hasSelection && (
        <div
          className="absolute bottom-full left-0 z-30 mb-1 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-lg backdrop-blur-sm"
          role="toolbar"
          aria-label="Text formatting"
          data-rich-text-toolbar
          onMouseDown={event => {
            // Buttons prevent their own default action so the selection stays
            // intact. Let inputs receive focus normally (notably the color
            // picker); the saved range is restored when the command runs.
            if ((event.target as HTMLElement).closest("button")) {
              handleToolbarMouseDown(event);
            }
          }}
        >
          {linkMode ? (
            <form
              className="flex items-center gap-1 px-1"
              onSubmit={event => {
                event.preventDefault();
                applyLink();
              }}
            >
              <input
                autoFocus
                type="url"
                value={linkUrl}
                onChange={event => setLinkUrl(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setLinkMode(false);
                  }
                }}
                placeholder="https://example.com"
                aria-label="Link URL"
                className="h-6 w-44 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
              <button type="submit" className="rounded px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkMode(false);
                  setLinkUrl("");
                }}
                className="rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <button type="button" title="Bold" aria-label="Bold" onMouseDown={event => { handleToolbarMouseDown(event); runCommand("bold"); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Bold className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Italic" aria-label="Italic" onMouseDown={event => { handleToolbarMouseDown(event); runCommand("italic"); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Italic className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Underline" aria-label="Underline" onMouseDown={event => { handleToolbarMouseDown(event); runCommand("underline"); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Underline className="h-3.5 w-3.5" />
              </button>
              <label title="Text color" aria-label="Text color" className="relative cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <span className="block h-3.5 w-3.5 rounded-full border border-muted-foreground/60 bg-foreground" />
                <input
                  type="color"
                  defaultValue="#111827"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={event => runCommand("foreColor", event.target.value)}
                />
              </label>
              <button type="button" title="Add link" aria-label="Add link" onMouseDown={event => { handleToolbarMouseDown(event); openLinkEditor(); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Link2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={!singleLine}
        aria-label={placeholder}
        data-rich-text-field
        className={`${className} ${!value ? "empty:before:text-muted-foreground" : ""}`}
        style={{ ...style, minHeight, whiteSpace: "pre-wrap" }}
        onInput={handleInput}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onFocus={rememberSelection}
        onBlur={() => {
          // A toolbar click is protected by onMouseDown; this only hides the
          // controls when the user genuinely moves away from the field.
          window.setTimeout(() => {
            if (!linkMode && document.activeElement !== editorRef.current && !selectionBelongsToEditor(window.getSelection())) {
              setHasSelection(false);
            }
          }, 0);
        }}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
      />
      {!value && (
        <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
          {placeholder}
        </span>
      )}
    </div>
  );
}

export function TextSection({ content, settings, isEditing, onChange, blockStyle }: TextSectionProps) {
  const alignment = content.alignment ?? "left";
  const maxWidth = content.maxWidth ?? "md";
  const maxWClass = MAX_WIDTH_MAP[maxWidth] ?? "max-w-3xl";
  const alignClass = ALIGN_MAP[alignment] ?? "text-left";

  function update(patch: Partial<TextContent>) {
    onChange?.({ ...content, ...patch });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-14" isEditing={false}>
        <div className={`${maxWClass} ${alignClass}`}>
          {content.heading && (
            <h2
              className="text-3xl md:text-4xl font-bold mb-3"
              style={{ color: "var(--theme-text, #111827)" }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(content.heading) }}
            />
          )}
          {content.subheading && (
            <p
              className="text-lg mb-5"
              style={{ color: "var(--theme-text-muted, #6b7280)" }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(content.subheading) }}
            />
          )}
          {content.body && (
            <div
              className="text-base leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--theme-text-muted, #374151)" }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(content.body) }}
            />
          )}
          {!content.heading && !content.body && (
            <p className="text-muted-foreground text-sm italic">Click to add text content…</p>
          )}
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-6" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Text Block</p>

        <div className="flex gap-3 items-center">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Alignment</p>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["left", "center", "right"] as const).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => update({ alignment: a })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors capitalize ${
                    alignment === a
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1">Max Width</p>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["sm", "md", "lg", "full"] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => update({ maxWidth: w })}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors uppercase ${
                    maxWidth === w
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <RichTextField
          value={content.heading ?? ""}
          onChange={heading => update({ heading })}
          placeholder="Heading (optional)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xl font-bold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          singleLine
        />

        <RichTextField
          value={content.subheading ?? ""}
          onChange={subheading => update({ subheading })}
          placeholder="Subheading (optional)"
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          minHeight="36px"
          singleLine
        />

        <RichTextField
          value={content.body}
          onChange={body => update({ body })}
          placeholder="Write your content here…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          minHeight="144px"
        />
      </div>
    </BlockStyleWrapper>
  );
}
