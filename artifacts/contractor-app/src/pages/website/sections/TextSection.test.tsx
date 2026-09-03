// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TextSection, sanitizeRichText } from "./TextSection";

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
});

describe("TextSection public rendering", () => {
  it("renders sanitized rich text from a saved Text Block", () => {
    const markup = renderToStaticMarkup(
      <TextSection
        content={{
          heading: "<strong>Formatted heading</strong>",
          subheading: "",
          body: "Line one\nLine two",
        }}
        settings={{ brandColor: "#2563eb" }}
      />,
    );

    expect(markup).toContain("<strong>Formatted heading</strong>");
    expect(markup).toContain("Line one<br />Line two");
    expect(markup).not.toContain("dangerouslySetInnerHTML");
  });
});