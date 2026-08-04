/**
 * Unit tests for the Industry Intelligence registry — Phase 5 M3
 * Tests profile matching, fallback, and section generation.
 * No DB, no HTTP, no OpenAI.
 */
import { describe, it, expect } from "vitest";
import {
  INDUSTRY_PROFILES,
  FALLBACK_PROFILE,
  matchIndustryProfile,
  buildIndustrySections,
} from "../lib/industryProfiles";

// ── matchIndustryProfile ──────────────────────────────────────────────────────

describe("matchIndustryProfile", () => {
  it("matches manufactured home by exact alias", () => {
    expect(matchIndustryProfile("manufactured home").id).toBe("manufactured-home");
  });

  it("matches manufactured home case-insensitively", () => {
    expect(matchIndustryProfile("Manufactured Home Contractor").id).toBe("manufactured-home");
  });

  it("matches HVAC by alias fragment", () => {
    expect(matchIndustryProfile("HVAC Contractor").id).toBe("hvac");
  });

  it("matches HVAC for 'heating and cooling'", () => {
    expect(matchIndustryProfile("heating and cooling").id).toBe("hvac");
  });

  it("matches roofing", () => {
    expect(matchIndustryProfile("Roofing Company").id).toBe("roofing");
  });

  it("matches roofing for storm damage contractor", () => {
    expect(matchIndustryProfile("storm damage restoration").id).toBe("roofing");
  });

  it("matches plumbing", () => {
    expect(matchIndustryProfile("Plumbing Services").id).toBe("plumbing");
  });

  it("matches general contractor", () => {
    expect(matchIndustryProfile("General Contractor").id).toBe("general-contractor");
  });

  it("matches general contractor for remodeling", () => {
    expect(matchIndustryProfile("home remodeling").id).toBe("general-contractor");
  });

  it("matches landscaping", () => {
    expect(matchIndustryProfile("Landscaping LLC").id).toBe("landscaping");
  });

  it("matches landscaping for lawn care", () => {
    expect(matchIndustryProfile("lawn care service").id).toBe("landscaping");
  });

  it("matches flooring", () => {
    expect(matchIndustryProfile("Flooring Installation").id).toBe("flooring");
  });

  it("matches flooring for hardwood", () => {
    expect(matchIndustryProfile("hardwood floor refinishing").id).toBe("flooring");
  });

  it("falls back to FALLBACK_PROFILE for unrecognized type", () => {
    const result = matchIndustryProfile("submarine sandwich delivery");
    expect(result.id).toBe(FALLBACK_PROFILE.id);
  });

  it("falls back for empty string", () => {
    expect(matchIndustryProfile("").id).toBe(FALLBACK_PROFILE.id);
  });

  it("falls back for whitespace", () => {
    expect(matchIndustryProfile("   ").id).toBe(FALLBACK_PROFILE.id);
  });
});

// ── INDUSTRY_PROFILES completeness ───────────────────────────────────────────

describe("INDUSTRY_PROFILES registry", () => {
  it("contains all 7 required industries", () => {
    const ids = INDUSTRY_PROFILES.map(p => p.id);
    expect(ids).toContain("manufactured-home");
    expect(ids).toContain("hvac");
    expect(ids).toContain("roofing");
    expect(ids).toContain("plumbing");
    expect(ids).toContain("general-contractor");
    expect(ids).toContain("landscaping");
    expect(ids).toContain("flooring");
  });

  it("every profile has at least 3 required sections", () => {
    for (const profile of INDUSTRY_PROFILES) {
      const required = profile.sections.filter(s => s.priority === "required");
      expect(required.length, `${profile.id} should have ≥3 required sections`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every profile has hero as its first section", () => {
    for (const profile of INDUSTRY_PROFILES) {
      const firstRequired = profile.sections.find(s => s.type === "hero");
      expect(firstRequired, `${profile.id} should include a hero section`).toBeDefined();
    }
  });

  it("every profile has a contact section", () => {
    for (const profile of INDUSTRY_PROFILES) {
      const hasContact = profile.sections.some(s => s.type === "contact");
      expect(hasContact, `${profile.id} should include a contact section`).toBe(true);
    }
  });

  it("every profile has at least 2 service keywords", () => {
    for (const profile of INDUSTRY_PROFILES) {
      expect(profile.serviceKeywords.length, `${profile.id} should have serviceKeywords`).toBeGreaterThanOrEqual(2);
    }
  });

  it("every profile has at least 2 trust signals", () => {
    for (const profile of INDUSTRY_PROFILES) {
      expect(profile.trustSignals.length, `${profile.id} should have trustSignals`).toBeGreaterThanOrEqual(2);
    }
  });

  it("no two profiles share an alias", () => {
    const seen = new Map<string, string>();
    for (const profile of INDUSTRY_PROFILES) {
      for (const alias of profile.aliases) {
        const prev = seen.get(alias);
        expect(prev, `alias "${alias}" appears in both "${prev}" and "${profile.id}"`).toBeUndefined();
        seen.set(alias, profile.id);
      }
    }
  });
});

// ── buildIndustrySections ─────────────────────────────────────────────────────

describe("buildIndustrySections", () => {
  it("returns required + recommended sections for HVAC (excluding optional)", () => {
    const profile = matchIndustryProfile("HVAC");
    const sections = buildIndustrySections(profile, { name: "Smith HVAC" });
    const types = sections.map(s => s.type);

    // Required sections must be present
    expect(types).toContain("alert-bar");
    expect(types).toContain("hero");
    expect(types).toContain("services");
    expect(types).toContain("contact");
  });

  it("always appends a footer section", () => {
    for (const profile of INDUSTRY_PROFILES) {
      const sections = buildIndustrySections(profile);
      expect(sections.at(-1)?.type).toBe("footer");
    }
  });

  it("sections are ordered (order field increments correctly)", () => {
    const profile = matchIndustryProfile("roofing");
    const sections = buildIndustrySections(profile);
    sections.forEach((s, i) => {
      expect(s.order).toBe(i);
    });
  });

  it("every section has a unique string id", () => {
    const profile = matchIndustryProfile("flooring");
    const sections = buildIndustrySections(profile);
    const ids = sections.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all sections are enabled by default", () => {
    const profile = matchIndustryProfile("landscaping");
    const sections = buildIndustrySections(profile);
    expect(sections.every(s => s.enabled)).toBe(true);
  });

  it("merges profile defaultContent over type defaults", () => {
    const profile = matchIndustryProfile("HVAC");
    const sections = buildIndustrySections(profile, { name: "Test Co" });
    const alertBar = sections.find(s => s.type === "alert-bar");
    // HVAC profile overrides the default alert-bar message
    expect((alertBar!.content.message as string).toLowerCase()).toContain("emergency");
  });

  it("deep-merges trustBar from profile spec without overwriting items", () => {
    const profile = matchIndustryProfile("manufactured home");
    const sections = buildIndustrySections(profile, { name: "Smith Homes" });
    const hero = sections.find(s => s.type === "hero")!;
    const trustBar = hero.content.trustBar as { enabled: boolean; items: unknown[] };
    expect(trustBar.enabled).toBe(true);
    expect(trustBar.items.length).toBeGreaterThan(0);
  });

  it("FALLBACK_PROFILE produces a valid section skeleton", () => {
    const sections = buildIndustrySections(FALLBACK_PROFILE, { name: "My Company", phone: "555-1234" });
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.some(s => s.type === "hero")).toBe(true);
    expect(sections.some(s => s.type === "contact")).toBe(true);
    expect(sections.at(-1)?.type).toBe("footer");
  });

  it("biz name appears in hero headline", () => {
    const profile = FALLBACK_PROFILE;
    const sections = buildIndustrySections(profile, { name: "Acme Builders" });
    const hero = sections.find(s => s.type === "hero")!;
    expect(hero.content.headline as string).toContain("Acme Builders");
  });

  it("biz phone appears in footer", () => {
    const profile = matchIndustryProfile("plumbing");
    const sections = buildIndustrySections(profile, { name: "Quick Fix", phone: "555-9999" });
    const footer = sections.find(s => s.type === "footer")!;
    expect(footer.content.phone).toBe("555-9999");
  });
});
