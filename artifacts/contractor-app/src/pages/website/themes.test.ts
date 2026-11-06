import { describe, expect, it } from "vitest";
import {
  buildThemeCssVarBlock,
  sanitizeWebsiteCssColor,
  sanitizeWebsiteFontFamily,
} from "./themes";

describe("Website Studio theme CSS boundaries", () => {
  it("accepts common safe colors and rejects CSS declarations or URL injection", () => {
    expect(sanitizeWebsiteCssColor("#2563eb")).toBe("#2563eb");
    expect(sanitizeWebsiteCssColor("rgba(0, 0, 0, 0.08)")).toBe("rgba(0, 0, 0, 0.08)");
    expect(sanitizeWebsiteCssColor("red")).toBe("red");
    expect(sanitizeWebsiteCssColor("red; background: url(https://attacker.example/x)")).toBeUndefined();
    expect(sanitizeWebsiteCssColor("url(https://attacker.example/x)")).toBeUndefined();
  });

  it("allows normal font families but rejects style-breaking font values", () => {
    expect(sanitizeWebsiteFontFamily("Source Sans 3")).toBe("Source Sans 3");
    expect(sanitizeWebsiteFontFamily("Arial, sans-serif")).toBe("Arial, sans-serif");
    expect(sanitizeWebsiteFontFamily("Inter';}</style><script>alert(1)</script>")).toBeUndefined();
    expect(sanitizeWebsiteFontFamily("x".repeat(81))).toBeUndefined();
  });

  it("falls back to trusted theme values instead of emitting injected CSS", () => {
    const css = buildThemeCssVarBlock("modern", {
      brandColor: "red; background-image: url(https://attacker.example/x)",
      headingFont: "Inter';}</style><script>alert(1)</script>",
      buttonRadius: "calc(1px); color:red",
      cardShadow: "0 0 0; background-image:url(https://attacker.example/x)",
      focusRingColor: "url(https://attacker.example/x)",
    });
    expect(css).not.toContain("attacker.example");
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("<script>");
    expect(css).toContain("--theme-primary: #2563EB;");
    expect(css).toContain("--theme-font-heading: 'Inter', system-ui, sans-serif;");
  });
});
