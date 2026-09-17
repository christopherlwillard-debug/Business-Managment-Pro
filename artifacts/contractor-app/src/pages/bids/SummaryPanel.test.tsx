// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DeepReadSection } from "./SummaryPanel";
import type { DeepRead, DeepReadEvidence, DeepReadEvidenceMap } from "./types";

function makeEvidence(
  status: DeepReadEvidence["status"],
  source: string | null = null,
  excerpt: string | null = null,
): DeepReadEvidence {
  return { status, source, excerpt };
}

function makeDeepRead(overrides: Partial<DeepRead> = {}): DeepRead {
  const evidence: DeepReadEvidenceMap = {
    submissionDeadline: makeEvidence("missing"),
    siteVisit: makeEvidence("missing"),
    insuranceRequirements: {
      generalLiability: makeEvidence("missing"),
      workersCompensation: makeEvidence("missing"),
      auto: makeEvidence("missing"),
      other: [],
    },
    bonding: makeEvidence("missing"),
    prevailingWage: makeEvidence("missing"),
    smallBusinessSubcontracting: makeEvidence("missing"),
    evaluationCriteria: [],
    pointOfContact: makeEvidence("missing"),
    awardSlots: makeEvidence("missing"),
    redFlags: [],
  };

  return {
    submissionDeadline: {
      date: "2026-03-01",
      time: "5:00 PM",
      timezone: "Eastern",
      raw: "March 1, 2026 at 5:00 PM Eastern",
    },
    siteVisit: null,
    insuranceRequirements: {
      generalLiability: null,
      workersCompensation: null,
      auto: null,
      other: [],
    },
    bonding: {
      required: false,
      amounts: null,
      details: null,
    },
    prevailingWage: {
      required: false,
      wageDeterminationNumber: null,
      details: null,
    },
    smallBusinessSubcontracting: {
      required: false,
      details: null,
    },
    evaluationCriteria: [],
    pointOfContact: null,
    awardSlots: null,
    redFlags: [],
    evidence,
    ...overrides,
  };
}

describe("DeepReadSection evidence display", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  function render(deepRead: DeepRead) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <DeepReadSection
          deepRead={deepRead}
          officialSourceUrl="https://sam.gov/official-solicitation"
        />,
      );
    });
    return container;
  }

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("shows confirmed source and excerpt beneath the extracted value", () => {
    const deepRead = makeDeepRead({
      evidence: {
        ...makeDeepRead().evidence!,
        submissionDeadline: makeEvidence(
          "confirmed",
          "Solicitation Section L",
          "Responses are due by 5:00 PM Eastern.",
        ),
      },
    });

    const view = render(deepRead);

    expect(view.textContent).toContain("March 1, 2026 at 5:00 PM Eastern");
    expect(view.textContent).toContain("Source · Solicitation Section L");
    expect(view.textContent).toContain("“Responses are due by 5:00 PM Eastern.”");

    const sourceLink = view.querySelector(
      'a[aria-label="Open official solicitation for this finding"]',
    );
    expect(sourceLink).not.toBeNull();
    expect(sourceLink?.getAttribute("href")).toBe("https://sam.gov/official-solicitation");
    expect(sourceLink?.getAttribute("target")).toBe("_blank");
    expect(sourceLink?.getAttribute("rel")).toContain("noopener");
  });

  it("labels ambiguous and missing evidence for manual verification", () => {
    const deepRead = makeDeepRead({
      siteVisit: {
        date: null,
        time: null,
        timezone: null,
        location: null,
      },
      evidence: {
        ...makeDeepRead().evidence!,
        siteVisit: makeEvidence("ambiguous", "Site visit notice", "A site visit may be required."),
        insuranceRequirements: {
          ...makeDeepRead().evidence!.insuranceRequirements,
          generalLiability: makeEvidence("missing", "Insurance section"),
        },
      },
    });

    const view = render(deepRead);

    expect(view.textContent).toContain("Manual verification recommended");
    expect(view.textContent).toContain("· Site visit notice");
    expect(view.textContent).toContain("Manual verification needed");
    expect(view.textContent).toContain("· Insurance section");
    expect(view.querySelector('a[aria-label="Open official solicitation for this finding"]')).toBeNull();
  });

  it("keeps evaluation and red-flag evidence aligned with their list items", () => {
    const deepRead = makeDeepRead({
      evaluationCriteria: ["Lowest evaluated price", "Relevant experience"],
      redFlags: ["Short response window", "Missing insurance detail"],
      evidence: {
        ...makeDeepRead().evidence!,
        evaluationCriteria: [
          makeEvidence("confirmed", "Evaluation factor 1", "Price is weighted most heavily."),
          makeEvidence("ambiguous", "Evaluation factor 2", "Experience may be considered."),
        ],
        redFlags: [
          makeEvidence("confirmed", "Deadline section", "The response window is unusually short."),
          makeEvidence("missing", "Insurance section"),
        ],
      },
    });

    const view = render(deepRead);
    const sections = Array.from(view.querySelectorAll("section"));
    const evaluationSection = sections.find((section) =>
      section.querySelector("h4")?.textContent?.includes("Evaluation criteria"),
    );
    const redFlagsSection = sections.find((section) =>
      section.querySelector("h4")?.textContent?.includes("Red flags"),
    );

    const evaluationItems = evaluationSection?.querySelectorAll("li");
    expect(evaluationItems).toHaveLength(2);
    expect(evaluationItems?.[0].textContent).toContain("Lowest evaluated price");
    expect(evaluationItems?.[0].textContent).toContain("Price is weighted most heavily.");
    expect(evaluationItems?.[0].textContent).not.toContain("Experience may be considered.");
    expect(evaluationItems?.[1].textContent).toContain("Relevant experience");
    expect(evaluationItems?.[1].textContent).toContain("Manual verification recommended");

    const redFlagItems = redFlagsSection?.querySelectorAll("li");
    expect(redFlagItems).toHaveLength(2);
    expect(redFlagItems?.[0].textContent).toContain("Short response window");
    expect(redFlagItems?.[0].textContent).toContain("The response window is unusually short.");
    expect(redFlagItems?.[1].textContent).toContain("Missing insurance detail");
    expect(redFlagItems?.[1].textContent).toContain("Manual verification needed");
  });

  it("keeps legacy deep reads readable when the evidence map is absent", () => {
    const deepRead = makeDeepRead({ evidence: undefined });

    const view = render(deepRead);

    expect(view.textContent).toContain("Full Requirements");
    expect(view.textContent).toContain("March 1, 2026 at 5:00 PM Eastern");
    expect(view.textContent).toContain("Not stated in the solicitation");
    expect(view.textContent).not.toContain("undefined");
  });
});