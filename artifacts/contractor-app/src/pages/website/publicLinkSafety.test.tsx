import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CTASection } from "./sections/CTASection";
import { FooterSection, type FooterContent } from "./sections/FooterSection";
import { HeroSection } from "./sections/HeroSection";
import { StickyCTASection } from "./sections/StickyCTASection";

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("Website Studio public link safety", () => {
  it("sanitizes primary and secondary CTA destinations", () => {
    const markup = render(createElement(CTASection, {
      settings: { brandColor: "#123456" },
      content: {
        heading: "Get started",
        primaryLabel: "Unsafe primary",
        primaryConfig: { url: "javascript:alert(1)", newTab: true },
        secondaryLabel: "Unsafe secondary",
        secondaryConfig: { url: "data:text/html,unsafe", newTab: true },
      },
    }));

    expect(markup).not.toMatch(/href="(?:javascript|data):/i);
    expect(markup.match(/href="#contact"/g)).toHaveLength(2);
    expect(markup).not.toContain('target="_blank"');
  });

  it("sanitizes hero button and secondary CTA destinations", () => {
    const markup = render(createElement(HeroSection, {
      settings: { brandColor: "#123456" },
      content: {
        headline: "Welcome",
        subheadline: "A safer website",
        ctaLabel: "Get a quote",
        bgColor: "#123456",
        ctaButton: { url: "javascript:alert(1)", newTab: true },
        secondaryCta: { label: "More", href: "//attacker.example", enabled: true },
      },
    }));

    expect(markup).not.toMatch(/href="(?:javascript|data):/i);
    expect(markup).not.toContain('href="//attacker.example');
    expect(markup).toContain('href="#contact"');
    expect(markup).toContain('href="#"');
    expect(markup).not.toContain('target="_blank"');
  });

  it("sanitizes sticky CTA actions, including malformed persisted values", () => {
    const markup = render(createElement(StickyCTASection, {
      settings: { brandColor: "#123456" },
      content: {
        primaryLabel: "Open",
        primaryAction: "javascript:alert(1)",
        primaryActionType: "url",
        secondaryLabel: "Unsafe",
        secondaryAction: "data:text/html,unsafe",
        secondaryActionType: "url",
      },
    }));

    expect(markup).not.toMatch(/href="(?:javascript|data):/i);
    expect(markup.match(/href="#"/g)).toHaveLength(2);
  });

  it("sanitizes footer links, legal URLs, and social destinations", () => {
    const content: FooterContent = {
      columns: [
        {
          id: "logo",
          component: "LogoBlock",
          width: 40,
          props: { tagline: "", showVeteranBadge: false, credentialChips: [] },
        },
        {
          id: "links",
          component: "LinksBlock",
          width: 60,
          props: {
            heading: "Links",
            links: [
              { id: "unsafe", label: "Unsafe", href: "javascript:alert(1)" },
              { id: "safe", label: "Safe", href: "https://example.com" },
            ],
          },
        },
      ],
      socialLinks: [
        { platform: "facebook", url: "javascript:alert(1)" },
        { platform: "instagram", url: "https://instagram.com/example" },
      ],
      privacyPolicyUrl: "javascript:alert(1)",
      termsUrl: "//attacker.example/terms",
    };
    const markup = render(createElement(FooterSection, {
      content,
      settings: { brandColor: "#123456" },
      businessName: "Example",
    }));

    expect(markup).not.toMatch(/href="(?:javascript|data):/i);
    expect(markup).not.toContain('href="//attacker.example');
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('href="https://instagram.com/example"');
    expect(markup).toContain('aria-label="Instagram"');
    expect(markup).not.toContain("Privacy Policy");
    expect(markup).not.toContain(">Terms</a>");
  });
});
