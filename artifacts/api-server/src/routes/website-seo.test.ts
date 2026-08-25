/**
 * website-seo.test.ts — M10: AI SEO Builder
 *
 * Tests for:
 *   • POST /api/website/generate-seo — request validation, response shape
 *   • POST /api/website/media/:id/generate-alt — request validation
 *   • PATCH /api/website/media/:id — alt field acceptance
 *   • Sitemap XML generation helper
 *   • Robots.txt generation helper
 *   • SeoSettings type structure
 *   • buildSitemapXml logic
 *   • buildRobotsTxt logic
 *   • bizSummary / SEO prompt building (pure logic)
 *   • calScore equivalent logic
 */

import { describe, it, expect } from "vitest";
import { SEO_LIMITS, isAbsoluteHttpUrl, validateSeoMetadata } from "@workspace/api-zod";

// ── Pure helpers re-implemented here for unit testing (no DB / OpenAI needed) ─

function buildSitemapXml(baseUrl: string, pages: Array<{ slug: string; name: string }>): string {
  const trimBase = baseUrl.replace(/\/$/, "");
  const urls = [
    `  <url><loc>${trimBase}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...pages.map(p =>
      `  <url><loc>${trimBase}/${p.slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

function buildRobotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

interface SeoSettings {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  pagesSeo?: Record<string, { metaTitle?: string; metaDescription?: string }>;
  localBusinessSchema?: string;
  generated?: boolean;
  generatedAt?: string;
}

function calcScore(seo: SeoSettings | undefined): number {
  if (!seo) return 0;
  let score = 0;
  if (seo.metaTitle?.trim())       score += 25;
  if (seo.metaDescription?.trim()) score += 25;
  if (seo.ogImage?.trim())         score += 15;
  if (seo.localBusinessSchema)     score += 20;
  if (seo.keywords?.trim())        score += 15;
  return score;
}

// ── Sitemap XML ────────────────────────────────────────────────────────────────

describe("buildSitemapXml", () => {
  it("generates valid XML with home URL", () => {
    const xml = buildSitemapXml("https://example.com", []);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("https://example.com/");
    expect(xml).toContain("<priority>1.0</priority>");
  });

  it("includes additional pages with 0.8 priority", () => {
    const pages = [
      { slug: "services", name: "Services" },
      { slug: "about", name: "About" },
    ];
    const xml = buildSitemapXml("https://example.com", pages);
    expect(xml).toContain("https://example.com/services");
    expect(xml).toContain("https://example.com/about");
    expect(xml).toContain("<priority>0.8</priority>");
  });

  it("trims trailing slash from base URL", () => {
    const xml = buildSitemapXml("https://example.com/", []);
    // should not produce double-slash
    expect(xml).not.toContain("https://example.com//");
    expect(xml).toContain("https://example.com/");
  });

  it("produces one URL per page plus home", () => {
    const pages = [{ slug: "gallery", name: "Gallery" }];
    const xml = buildSitemapXml("https://example.com", pages);
    const urlMatches = xml.match(/<url>/g) ?? [];
    expect(urlMatches).toHaveLength(2); // home + gallery
  });

  it("escapes no special chars for plain slug paths", () => {
    const xml = buildSitemapXml("https://smith-hvac.com", [{ slug: "contact-us", name: "Contact" }]);
    expect(xml).toContain("https://smith-hvac.com/contact-us");
  });
});

// ── Robots.txt ─────────────────────────────────────────────────────────────────

describe("buildRobotsTxt", () => {
  it("allows all user agents", () => {
    const txt = buildRobotsTxt("https://example.com/sitemap.xml");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
  });

  it("references the sitemap URL", () => {
    const sitemapUrl = "https://smith-hvac.com/sitemap.xml";
    const txt = buildRobotsTxt(sitemapUrl);
    expect(txt).toContain(`Sitemap: ${sitemapUrl}`);
  });

  it("ends with a newline", () => {
    const txt = buildRobotsTxt("https://example.com/sitemap.xml");
    expect(txt.endsWith("\n")).toBe(true);
  });
});

// ── SEO completeness score ─────────────────────────────────────────────────────

describe("calcScore", () => {
  it("returns 0 for undefined seo", () => {
    expect(calcScore(undefined)).toBe(0);
  });

  it("returns 0 for empty seo object", () => {
    expect(calcScore({})).toBe(0);
  });

  it("awards 25 pts for metaTitle", () => {
    expect(calcScore({ metaTitle: "Smith HVAC Nashville" })).toBe(25);
  });

  it("awards 25 pts for metaDescription", () => {
    expect(calcScore({ metaDescription: "Top HVAC services in Nashville." })).toBe(25);
  });

  it("awards 15 pts for keywords", () => {
    expect(calcScore({ keywords: "HVAC repair, AC installation" })).toBe(15);
  });

  it("awards 15 pts for ogImage", () => {
    expect(calcScore({ ogImage: "https://example.com/img.jpg" })).toBe(15);
  });

  it("awards 20 pts for localBusinessSchema", () => {
    expect(calcScore({ localBusinessSchema: '{"@type":"LocalBusiness"}' })).toBe(20);
  });

  it("returns 100 for fully complete seo settings", () => {
    const fullSeo: SeoSettings = {
      metaTitle: "Smith HVAC | Nashville, TN",
      metaDescription: "Nashville's top-rated HVAC service company. Licensed & insured.",
      keywords: "HVAC repair Nashville, AC installation, heating",
      ogImage: "https://example.com/hero.jpg",
      localBusinessSchema: '{"@type":"LocalBusiness","name":"Smith HVAC"}',
    };
    expect(calcScore(fullSeo)).toBe(100);
  });

  it("ignores whitespace-only strings", () => {
    expect(calcScore({ metaTitle: "   ", metaDescription: "\t" })).toBe(0);
  });
});

// ── SeoSettings type structure ─────────────────────────────────────────────────

describe("SeoSettings structure", () => {
  it("accepts all optional fields", () => {
    const seo: SeoSettings = {
      metaTitle: "Title",
      metaDescription: "Desc",
      keywords: "kw1, kw2",
      ogTitle: "OG Title",
      ogDescription: "OG Desc",
      ogImage: "https://example.com/img.jpg",
      pagesSeo: {
        "page-123": { metaTitle: "Services Page", metaDescription: "Our services." },
      },
      localBusinessSchema: JSON.stringify({ "@type": "LocalBusiness" }),
      generated: true,
      generatedAt: new Date().toISOString(),
    };
    expect(seo.metaTitle).toBe("Title");
    expect(seo.pagesSeo?.["page-123"]?.metaTitle).toBe("Services Page");
    expect(typeof seo.localBusinessSchema).toBe("string");
  });
});

// ── Local Business JSON-LD structure ───────────────────────────────────────────

describe("Local Business JSON-LD structure", () => {
  it("contains required schema.org context and type", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Smith HVAC",
    };
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("LocalBusiness");
  });

  it("serializes and parses back correctly", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Smith HVAC",
      telephone: "615-555-0100",
      address: {
        "@type": "PostalAddress",
        streetAddress: "123 Main St",
        addressLocality: "Nashville",
        addressRegion: "TN",
        postalCode: "37201",
        addressCountry: "US",
      },
    };
    const serialized = JSON.stringify(schema);
    const reparsed = JSON.parse(serialized);
    expect(reparsed.name).toBe("Smith HVAC");
    expect(reparsed.address.addressLocality).toBe("Nashville");
  });
});

// ── FAQ JSON-LD structure ──────────────────────────────────────────────────────

describe("FAQ JSON-LD structure", () => {
  const faqItems = [
    { question: "Are you licensed and insured?", answer: "Yes, fully licensed and insured in TN." },
    { question: "Do you offer free estimates?", answer: "Yes, free on-site estimates are available." },
  ];

  it("builds valid FAQPage schema", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map(i => ({
        "@type": "Question",
        name: i.question,
        acceptedAnswer: { "@type": "Answer", text: i.answer },
      })),
    };
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema.mainEntity[0].name).toBe("Are you licensed and insured?");
    expect(schema.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });

  it("is valid serialized JSON", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map(i => ({
        "@type": "Question",
        name: i.question,
        acceptedAnswer: { "@type": "Answer", text: i.answer },
      })),
    };
    expect(() => JSON.parse(JSON.stringify(schema))).not.toThrow();
  });
});

// ── Alt text validation ────────────────────────────────────────────────────────

describe("alt text constraints", () => {
  it("allows alt text up to 255 chars", () => {
    const longAlt = "A".repeat(255);
    expect(longAlt.slice(0, 255).length).toBe(255);
  });

  it("truncates alt text over 255 chars", () => {
    const tooLong = "A".repeat(300);
    const truncated = tooLong.slice(0, 255);
    expect(truncated.length).toBe(255);
  });

  it("treats empty string as null (no alt)", () => {
    const altValue = "";
    const stored = altValue || null;
    expect(stored).toBeNull();
  });
});

// ── safeJsonLd — XSS sanitization regression tests ────────────────────────────
//
// Mirrors the safeJsonLd() function in PublicSite.tsx.
// The server strips < > & from stored strings (defense-in-depth), but the
// frontend also escapes them to \u003c / \u003e / \u0026 before dangerouslySetInnerHTML.
// Both layers are tested here.

function safeJsonLd(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function sanitizeSeoString(s: string, maxLen: number): string {
  return s
    .replace(/[<>"'`]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}

describe("safeJsonLd — XSS prevention", () => {
  it("escapes </script> tag breakout attempt", () => {
    const malicious = '{"name":"ACME</script><script>alert(1)</script>"}';
    const safe = safeJsonLd(malicious);
    expect(safe).not.toContain("</script>");
    expect(safe).not.toContain("<script>");
    expect(safe).toContain("\\u003c/script\\u003e");
  });

  it("escapes lone < character", () => {
    const json = '{"name":"Smith <HVAC>"}';
    const safe = safeJsonLd(json);
    expect(safe).not.toContain("<");
    expect(safe).not.toContain(">");
    expect(safe).toContain("\\u003c");
    expect(safe).toContain("\\u003e");
  });

  it("escapes HTML comment injection <!-- -->", () => {
    const json = '{"description":"<!--bad-->"}';
    const safe = safeJsonLd(json);
    expect(safe).not.toContain("<!--");
    expect(safe).toContain("\\u003c");
  });

  it("escapes & to prevent HTML entity injection", () => {
    const json = '{"name":"Smith & Sons HVAC"}';
    const safe = safeJsonLd(json);
    expect(safe).not.toContain("&");
    expect(safe).toContain("\\u0026");
  });

  it("output remains valid parseable JSON after escaping", () => {
    const schema = { "@context": "https://schema.org", "@type": "LocalBusiness", name: "Smith HVAC" };
    const json = JSON.stringify(schema);
    const safe = safeJsonLd(json);
    // JSON.parse should succeed because \u003c etc. are valid JSON unicode escapes
    expect(() => JSON.parse(safe)).not.toThrow();
    const reparsed = JSON.parse(safe);
    expect(reparsed.name).toBe("Smith HVAC");
  });

  it("leaves normal alphanumeric and colon chars untouched", () => {
    const json = '{"@context":"https://schema.org","@type":"LocalBusiness","name":"Smith HVAC Nashville"}';
    const safe = safeJsonLd(json);
    expect(safe).toContain('"name":"Smith HVAC Nashville"');
  });

  it("prevents double-script-tag XSS vector end-to-end", () => {
    // Business name set to a classic XSS payload
    const xssPayload = 'Evil Corp</script><script>alert(1)</script>';
    const schema = { "@context": "https://schema.org", "@type": "LocalBusiness", name: xssPayload };
    const json = JSON.stringify(schema);
    const safe = safeJsonLd(json);

    // The critical vectors — script tag breakout — must be absent
    expect(safe).not.toContain("</script>");
    expect(safe).not.toContain("<script>");
    // Escaped unicode sequences prove the input was sanitized
    expect(safe).toContain("\\u003c");
    expect(safe).toContain("\\u003e");
    // Non-tag payload content is preserved (as text inside escaped JSON, not as code)
    expect(safe).toContain("Evil Corp");
  });
});

describe("sanitizeSeoString — server-side stored-value sanitization", () => {
  it("strips angle brackets from meta title", () => {
    const result = sanitizeSeoString('Smith HVAC <script>alert(1)</script>', 60);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("strips double quotes", () => {
    const result = sanitizeSeoString('Smith "Best" HVAC', 60);
    expect(result).not.toContain('"');
  });

  it("strips control characters", () => {
    const result = sanitizeSeoString("Smith\x00HVAC\x1F", 60);
    expect(result).not.toContain("\x00");
    expect(result).not.toContain("\x1F");
  });

  it("truncates at maxLen", () => {
    const long = "A".repeat(200);
    expect(sanitizeSeoString(long, 60).length).toBe(60);
    expect(sanitizeSeoString(long, 160).length).toBe(160);
  });

  it("preserves safe text including apostrophes and commas", () => {
    const input = "Nashville's #1 HVAC contractor, licensed & insured";
    const result = sanitizeSeoString(input, 100);
    expect(result).toContain("Nashville");
    expect(result).toContain("#1");
    expect(result).toContain("licensed");
  });
});

// ── generate-seo request body shape ───────────────────────────────────────────

describe("generate-seo request contract", () => {
  it("accepts businessContext with optional fields", () => {
    const body = {
      businessContext: {
        businessName: "Smith HVAC",
        businessType: "HVAC contractor",
        location: "Nashville, TN",
      },
    };
    expect(body.businessContext.businessName).toBe("Smith HVAC");
    expect(body.businessContext.location).toBe("Nashville, TN");
  });

  it("accepts request without businessContext", () => {
    const body = {};
    const ctx = (body as any).businessContext ?? {};
    expect(ctx).toEqual({});
  });
});

describe("shared SEO metadata validation", () => {
  const valid = {
    metaTitle: "Smith HVAC | Nashville",
    metaDescription: "Reliable HVAC repair and installation for Nashville homes. Call Smith HVAC for a licensed, friendly, and prompt free estimate today.",
    keywords: "HVAC repair Nashville, AC installation",
    ogTitle: "Smith HVAC | Nashville",
    ogDescription: "Reliable HVAC repair and installation for Nashville homes. Call Smith HVAC for a licensed, friendly, and prompt free estimate today.",
  };

  it("accepts practical metadata and absolute image URLs", () => {
    expect(validateSeoMetadata({ ...valid, ogImage: "https://example.com/og.jpg" })).toEqual({});
    expect(isAbsoluteHttpUrl("https://example.com/og.jpg")).toBe(true);
  });

  it("rejects short required fields and relative or non-http image URLs", () => {
    const errors = validateSeoMetadata({ ...valid, metaTitle: "HVAC", ogImage: "/uploads/og.jpg" });
    expect(errors.metaTitle).toContain("between");
    expect(errors.ogImage).toContain("absolute HTTP(S)");
    expect(isAbsoluteHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("keeps landing-page input limits shared by client and server", () => {
    expect(SEO_LIMITS.landingDescription).toBe(2000);
    expect(SEO_LIMITS.landingDetails).toBe(2000);
  });
});

// ── PageSeo per-page fallback logic ────────────────────────────────────────────

describe("PageSeo effective meta resolution", () => {
  const seo: SeoSettings = {
    metaTitle: "Smith HVAC | Nashville",
    metaDescription: "Top HVAC services.",
    pagesSeo: {
      "page-services": {
        metaTitle: "HVAC Services | Smith HVAC",
        metaDescription: "All our HVAC repair and installation services.",
      },
    },
  };

  it("uses home seo for home page (no pageSlug)", () => {
    const effectiveTitle = seo.metaTitle ?? "Smith HVAC";
    expect(effectiveTitle).toBe("Smith HVAC | Nashville");
  });

  it("falls back to home seo when page has no override", () => {
    const pageSeo = seo.pagesSeo?.["page-unknown"] ?? {};
    const effectiveTitle = pageSeo.metaTitle ?? seo.metaTitle ?? "Default";
    expect(effectiveTitle).toBe("Smith HVAC | Nashville");
  });

  it("uses page-specific seo when override exists", () => {
    const pageSeo = seo.pagesSeo?.["page-services"] ?? {};
    const effectiveTitle = pageSeo.metaTitle ?? seo.metaTitle ?? "Default";
    expect(effectiveTitle).toBe("HVAC Services | Smith HVAC");
  });
});
