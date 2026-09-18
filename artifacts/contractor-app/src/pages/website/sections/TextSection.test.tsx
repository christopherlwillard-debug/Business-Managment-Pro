// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TextSection, sanitizeRichText, type TextContent } from "./TextSection";
import { TextStyleToolbar } from "./TextStyleToolbar";

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;

describe("sanitizeRichText", () => {
  it("keeps bold, italic, underline, color, links, and line breaks", () => {
    const result = sanitizeRichText(
      '<strong>Bold</strong> <em>Italic</em> <u>Underline</u> ' +
      '<span style="color: #336699">Color</span> ' +
      '<a href="https://example.com">Link</a><br>Next line',
    );

    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<em>Italic</em>");
    expect(result).toContain("<u>Underline</u>");
    expect(result).toContain('style="color:#336699"');
    expect(result).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>',
    );
    expect(result).toContain("<br />Next line");
  });

  it("normalizes the inline tags emitted by browser formatting commands", () => {
    const result = sanitizeRichText(
      '<b>Bold</b><i>Italic</i><font color="#c2410c">Warm</font>' +
      '<div>First line</div><div>Second line</div>',
    );

    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<em>Italic</em>");
    expect(result).toContain('<span style="color:#c2410c">Warm</span>');
    expect(result).toContain("First line<br />Second line");
  });

  it("keeps existing plain-text blocks and converts their line breaks", () => {
    expect(sanitizeRichText("First line\nSecond line\r\nThird line"))
      .toBe("First line<br />Second line<br />Third line");
  });

  it("removes unsafe markup while retaining visible text outside it", () => {
    const result = sanitizeRichText(
      'Keep this <script>alert("remove me")</script> ' +
      '<img src="x" onerror="alert(1)">and this ' +
      '<span onclick="alert(2)">visible text</span>',
    );

    expect(result).toContain("Keep this");
    expect(result).toContain("and this");
    expect(result).toContain("visible text");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onclick");
  });

  it("removes javascript links but preserves the link label", () => {
    const result = sanitizeRichText(
      '<a href="javascript:alert(1)">Unsafe label</a> ' +
      '<a href="mailto:hello@example.com">Email</a> ' +
      '<a href="/contact">Contact</a>',
    );

    expect(result).toContain("Unsafe label");
    expect(result).not.toContain("javascript:");
    expect(result).toContain(
      '<a href="mailto:hello@example.com" target="_blank" rel="noopener noreferrer">Email</a>',
    );
    expect(result).toContain(
      '<a href="/contact" target="_blank" rel="noopener noreferrer">Contact</a>',
    );
  });

  it("keeps supported unordered and ordered list structure with readable items", () => {
    const result = sanitizeRichText(
      '<ul class="pasted-list"><li><strong>First</strong></li><li>Second</li></ul>' +
      '<ol style="margin: 0"><li>Third</li><li><em>Fourth</em></li></ol>',
    );

    expect(result).toContain("<ul><li><strong>First</strong></li><li>Second</li></ul>");
    expect(result).toContain("<ol><li>Third</li><li><em>Fourth</em></li></ol>");
    expect(result).not.toContain("class=");
    expect(result).not.toContain("style=");
  });

  it("strips unsafe pasted descendants without dropping safe list text", () => {
    const result = sanitizeRichText(
      '<ul><li>Keep <script>alert("remove")</script> this</li>' +
      '<li><img src="tracking.gif">Another <span onclick="alert(1)">item</span></li></ul>',
    );

    expect(result).toContain("<ul><li>Keep  this</li><li>Another item</li></ul>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("alert");
  });
});

describe("TextSection public rendering", () => {
  it("renders sanitized rich text from a saved Text Block", () => {
    const markup = renderToStaticMarkup(
      <TextSection
        content={{
          heading: "<strong>Formatted heading</strong>",
          subheading: "",
          body: "Line one<br>Line two<ul><li>List item</li></ul>",
        }}
        settings={{ brandColor: "#2563eb" }}
      />,
    );

    expect(markup).toContain("<strong>Formatted heading</strong>");
    expect(markup).toContain("Line one<br />Line two");
    expect(markup).toContain("<ul><li>List item</li></ul>");
    expect(markup).toContain("list-disc");
    expect(markup).toContain("list-decimal");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("TextSection editing accessibility", () => {
  let host: HTMLDivElement;
  let root: Root;
  let execCommand: ReturnType<typeof vi.fn>;
  let latestContent: TextContent;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    latestContent = {
      heading: "Heading",
      subheading: "Subheading",
      body: "Keyboard formatting",
    };
    execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  function renderEditor() {
    act(() => {
      root.render(
        <TextSection
          content={latestContent}
          settings={{ brandColor: "#2563eb" }}
          isEditing
          onChange={next => { latestContent = next; }}
        />,
      );
    });
  }

  function selectBodyText() {
    const editor = host.querySelector<HTMLDivElement>("#text-block-body");
    if (!editor) throw new Error("Body editor not found");
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    return editor;
  }

  it("exposes useful editor instructions and keyboard-reachable formatting controls", () => {
    renderEditor();

    const editors = Array.from(host.querySelectorAll<HTMLElement>("[data-rich-text-field]"));
    expect(editors.map(editor => editor.getAttribute("aria-label"))).toEqual([
      "Heading (optional)",
      "Subheading (optional)",
      "Write your content here…",
    ]);
    expect(editors.every(editor => editor.getAttribute("aria-describedby"))).toBe(true);

    const editor = selectBodyText();
    const toolbar = host.querySelector<HTMLElement>("[data-rich-text-toolbar]");
    expect(toolbar?.getAttribute("role")).toBe("toolbar");
    expect(toolbar?.getAttribute("aria-label")).toBe("Write your content here… formatting toolbar");
    expect(toolbar?.getAttribute("aria-controls")).toBe("text-block-body");

    const controls = Array.from(toolbar?.querySelectorAll<HTMLElement>("[data-rich-text-control]") ?? []);
    expect(controls).toHaveLength(7);
    expect(controls.every(control => control.getAttribute("aria-label"))).toBe(true);

    act(() => {
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(document.activeElement).toBe(controls[controls.length - 1]);
  });

  it("runs formatting from keyboard activation while preserving the text selection", () => {
    renderEditor();
    const editor = selectBodyText();
    const bold = host.querySelector<HTMLButtonElement>('[data-rich-text-toolbar] [aria-label="Bold"]');
    if (!bold) throw new Error("Bold control not found");

    act(() => {
      bold.focus();
      bold.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      bold.click();
    });

    expect(execCommand).toHaveBeenCalledWith("bold", false, undefined);
    expect(window.getSelection()?.toString()).toBe("Keyboard formatting");
    expect(document.activeElement).toBe(editor);
    expect(latestContent.body).toBe("Keyboard formatting");
  });

  it("returns focus to the editor after applying or canceling a link", () => {
    renderEditor();
    const editor = selectBodyText();
    const link = host.querySelector<HTMLButtonElement>('[data-rich-text-toolbar] [aria-label="Add link"]');
    if (!link) throw new Error("Link control not found");

    act(() => link.click());
    const cancel = host.querySelector<HTMLButtonElement>('[data-rich-text-toolbar] [aria-label="Cancel link"]');
    if (!cancel) throw new Error("Cancel link control not found");
    act(() => cancel.click());
    expect(document.activeElement).toBe(editor);
    expect(window.getSelection()?.toString()).toBe("Keyboard formatting");

    const linkAfterCancel = host.querySelector<HTMLButtonElement>('[data-rich-text-toolbar] [aria-label="Add link"]');
    if (!linkAfterCancel) throw new Error("Link control not found after cancel");
    act(() => linkAfterCancel.click());
    const apply = host.querySelector<HTMLButtonElement>('[data-rich-text-toolbar] [aria-label="Apply link"]');
    if (!apply) throw new Error("Apply link control not found");
    act(() => apply.click());
    expect(document.activeElement).toBe(editor);
    expect(window.getSelection()?.toString()).toBe("Keyboard formatting");
  });

  it("gives the shared text style toolbar named, stateful controls", () => {
    const markup = renderToStaticMarkup(
      <TextStyleToolbar style={{ fontWeight: "700", textAlign: "center" }} onChange={() => {}} />,
    );

    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Text style formatting"');
    expect(markup).toContain('aria-label="Font family"');
    expect(markup).toContain('aria-label="Font size"');
    expect(markup).toContain('aria-label="Bold"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Text color"');
  });
});