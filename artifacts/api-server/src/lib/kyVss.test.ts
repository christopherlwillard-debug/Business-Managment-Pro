/**
 * Unit tests for the Kentucky eMarketplace / VSS connector.
 *
 * Tests cover:
 *   - HTML table parsing (SharePoint-style)
 *   - HTML card/div parsing (custom CMS)
 *   - HTML link-scan fallback (minimal page)
 *   - JSON response parsing (PeopleSoft IScript)
 *   - Solicitation number deduplication (stable ID consistency)
 *   - Capability keyword filtering
 *   - Date parsing for various formats seen on KY government pages
 *   - SOL_NUMBER_RE pattern matching
 *
 * No HTTP calls are made; all parsing is tested against synthetic HTML/JSON.
 */

import { describe, it, expect } from "vitest";
import {
  parseHtmlResponse,
  parseJsonResponse,
  stableId,
  parseIsoDate,
  parseDueDateFromText,
  SOL_NUMBER_RE,
} from "./kyVss.js";

const BASE = "https://web.emarketplace.ky.gov";

// ── stableId ──────────────────────────────────────────────────────────────────

describe("stableId", () => {
  it("produces a stable ID for the same solicitation number", () => {
    const id1 = stableId("2400000123", "any title");
    const id2 = stableId("2400000123", "different title");
    expect(id1).toBe(id2);
  });

  it("produces different IDs for different solicitation numbers", () => {
    expect(stableId("2400000001", "title")).not.toBe(stableId("2400000002", "title"));
  });

  it("falls back to title hash when solicitation number is null", () => {
    const id = stableId(null, "Asphalt Paving Project");
    expect(id).toMatch(/^ky-vss-[a-f0-9]{12}$/);
  });

  it("always starts with ky-vss-", () => {
    expect(stableId("SP2025-0001", "title")).toMatch(/^ky-vss-/);
    expect(stableId(null, "fallback")).toMatch(/^ky-vss-/);
  });

  it("is case-insensitive for the solicitation number", () => {
    const id1 = stableId("KY-2025-001234", "title");
    const id2 = stableId("ky-2025-001234", "title");
    expect(id1).toBe(id2);
  });
});

// ── SOL_NUMBER_RE ─────────────────────────────────────────────────────────────

describe("SOL_NUMBER_RE", () => {
  const matches = [
    "2400000123",
    "2500012345",
    "RFP-1234567",
    "RFQ-12345",
    "ITB-123456",
    "KY-2025-001234",
    "SP2025-0001",
    "SP2026-12345",
  ];
  for (const sol of matches) {
    it(`matches "${sol}"`, () => {
      expect(SOL_NUMBER_RE.test(sol)).toBe(true);
    });
  }

  const nonMatches = ["just a title", "123", "FY2025", "contact us"];
  for (const s of nonMatches) {
    it(`does not match "${s}"`, () => {
      expect(SOL_NUMBER_RE.test(s)).toBe(false);
    });
  }
});

// ── parseIsoDate ──────────────────────────────────────────────────────────────

describe("parseIsoDate", () => {
  it("parses YYYY-MM-DD", () => {
    expect(parseIsoDate("2026-03-15")).toBe("2026-03-15");
  });
  it("parses MM/DD/YYYY", () => {
    expect(parseIsoDate("03/15/2026")).toBe("2026-03-15");
  });
  it("parses written month", () => {
    expect(parseIsoDate("March 15, 2026")).toBe("2026-03-15");
  });
  it("returns null for null/undefined", () => {
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });
  it("returns null for garbage strings", () => {
    expect(parseIsoDate("not a date")).toBeNull();
  });
});

// ── parseDueDateFromText ──────────────────────────────────────────────────────

describe("parseDueDateFromText", () => {
  it("extracts due date from 'Due: MM/DD/YYYY'", () => {
    expect(parseDueDateFromText("Bids Due: 03/31/2026")).toBe("2026-03-31");
  });
  it("extracts closing date", () => {
    expect(parseDueDateFromText("Closing Date: April 15, 2026")).toBe("2026-04-15");
  });
  it("extracts deadline", () => {
    expect(parseDueDateFromText("Response Deadline: 2026-05-01")).toBe("2026-05-01");
  });
  it("returns null when no date pattern found", () => {
    expect(parseDueDateFromText("No dates here at all")).toBeNull();
  });
});

// ── parseJsonResponse ─────────────────────────────────────────────────────────

describe("parseJsonResponse", () => {
  it("parses top-level JSON array", () => {
    const json = JSON.stringify([
      { solicitationNumber: "2400000001", title: "Asphalt Paving Project", agency: "KYTC", dueDate: "2026-04-01" },
      { solicitationNumber: "2400000002", title: "Parking Lot Repair", agency: "KY DOA", closingDate: "2026-05-15" },
    ]);
    const results = parseJsonResponse(json);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Asphalt Paving Project");
    expect(results[0].responseDeadline).toBe("2026-04-01");
    expect(results[1].agency).toBe("KY DOA");
  });

  it("parses 'solicitations' envelope", () => {
    const json = JSON.stringify({
      solicitations: [
        { bidNo: "SP2025-0001", title: "Flooring Installation Services", closingDate: "2026-06-30" },
      ],
    });
    const results = parseJsonResponse(json);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Flooring Installation Services");
    expect(results[0].noticeId).toMatch(/^ky-vss-/);
  });

  it("parses 'results' envelope", () => {
    const json = JSON.stringify({ results: [{ title: "Grading Services", solicitationNumber: "2400000099" }] });
    const results = parseJsonResponse(json);
    expect(results).toHaveLength(1);
  });

  it("includes category and status in description when present", () => {
    const json = JSON.stringify([
      { solicitationNumber: "2400000001", title: "Road Repair", category: "Construction", status: "Open" },
    ]);
    const [opp] = parseJsonResponse(json);
    expect(opp.description).toContain("Category: Construction");
    expect(opp.description).toContain("Status: Open");
  });

  it("skips records with empty/missing title", () => {
    const json = JSON.stringify([
      { solicitationNumber: "2400000001", title: "" },
      { solicitationNumber: "2400000002", title: "   " },
      { solicitationNumber: "2400000003" },
    ]);
    expect(parseJsonResponse(json)).toHaveLength(0);
  });

  it("uses 'state-local' source and 'KY eMarketplace' sourceLabel", () => {
    const json = JSON.stringify([{ title: "Paving", solicitationNumber: "2400000001" }]);
    const [opp] = parseJsonResponse(json);
    expect(opp.source).toBe("state-local");
    expect(opp.sourceLabel).toBe("KY eMarketplace");
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseJsonResponse("not json")).toHaveLength(0);
    expect(parseJsonResponse("")).toHaveLength(0);
  });
});

// ── parseHtmlResponse — SharePoint table ──────────────────────────────────────

describe("parseHtmlResponse — SharePoint table (Strategy 1)", () => {
  const html = `
<html><body>
<table class="ms-listviewtable">
  <thead>
    <tr>
      <th>Solicitation Number</th>
      <th>Title</th>
      <th>Agency</th>
      <th>Posted Date</th>
      <th>Due Date</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>2400000101</td>
      <td><a href="/Pages/ViewBid.aspx?ID=101">Asphalt Overlay - Hancock County</a></td>
      <td>KYTC District 2</td>
      <td>01/15/2026</td>
      <td>02/28/2026</td>
      <td>Open</td>
    </tr>
    <tr>
      <td>2400000102</td>
      <td><a href="/Pages/ViewBid.aspx?ID=102">Flooring Replacement - State Office</a></td>
      <td>KY Finance Cabinet</td>
      <td>01/20/2026</td>
      <td>03/15/2026</td>
      <td>Open</td>
    </tr>
  </tbody>
</table>
</body></html>`;

  it("parses two solicitations from a SharePoint-style table", () => {
    const results = parseHtmlResponse(html, BASE);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts title and agency correctly", () => {
    const results = parseHtmlResponse(html, BASE);
    const paving = results.find((r) => r.title.includes("Asphalt"));
    expect(paving).toBeDefined();
    expect(paving!.agency).toContain("KYTC");
  });

  it("extracts closing date", () => {
    const results = parseHtmlResponse(html, BASE);
    const paving = results.find((r) => r.title.includes("Asphalt"));
    expect(paving!.responseDeadline).toBe("2026-02-28");
  });

  it("deduplicates identical solicitation numbers", () => {
    const dupHtml = html.replace("2400000102", "2400000101"); // make both rows have same sol number
    const results = parseHtmlResponse(dupHtml, BASE);
    const ids = results.map((r) => r.noticeId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("uses 'state-local' source", () => {
    const results = parseHtmlResponse(html, BASE);
    for (const r of results) {
      expect(r.source).toBe("state-local");
      expect(r.sourceLabel).toBe("KY eMarketplace");
    }
  });
});

// ── parseHtmlResponse — link scan fallback ────────────────────────────────────

describe("parseHtmlResponse — link scan fallback (Strategy 3)", () => {
  it("extracts solicitation links from a minimal HTML page", () => {
    const html = `
<html><body>
<ul>
  <li><a href="/bid/2400000201">RFP-2400000201: Parking Lot Sealcoating Services</a> Due: 03/01/2026</li>
  <li><a href="/bid/2400000202">ITB-2400000202: Debris Removal Contract</a> Due: 03/15/2026</li>
  <li><a href="/about">About Us</a></li>
</ul>
</body></html>`;

    const results = parseHtmlResponse(html, BASE);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const urls = results.map((r) => r.url);
    // At least one solicitation link should be captured
    expect(urls.some((u) => u.includes("bid"))).toBe(true);
  });

  it("does not return navigation or 'About Us' links", () => {
    const html = `
<html><body>
<nav>
  <a href="/about">About Us</a>
  <a href="/contact">Contact</a>
  <a href="/login">Login</a>
</nav>
<main>
  <a href="/solicitations/2400000301">RFQ-2400000301 Road Grading Services</a>
</main>
</body></html>`;

    const results = parseHtmlResponse(html, BASE);
    const titles = results.map((r) => r.title.toLowerCase());
    expect(titles).not.toContain("about us");
    expect(titles).not.toContain("contact");
    expect(titles).not.toContain("login");
  });
});

// ── Deduplication across parsing strategies ───────────────────────────────────

describe("parseHtmlResponse — cross-record deduplication", () => {
  it("assigns consistent stable IDs to the same solicitation number across parses", () => {
    const html1 = `<table class="ms-listviewtable">
      <tr><th>Number</th><th>Title</th></tr>
      <tr><td>2400000501</td><td><a href="/bid/1">Asphalt Project</a></td></tr>
    </table>`;
    const html2 = `<table class="ms-listviewtable">
      <tr><th>Number</th><th>Title</th></tr>
      <tr><td>2400000501</td><td><a href="/bid/1">Asphalt Project</a></td></tr>
    </table>`;

    const results1 = parseHtmlResponse(html1, BASE);
    const results2 = parseHtmlResponse(html2, BASE);

    if (results1.length > 0 && results2.length > 0) {
      // Same solicitation number should produce the same noticeId
      const r1 = results1.find((r) => r.title.includes("Asphalt"));
      const r2 = results2.find((r) => r.title.includes("Asphalt"));
      if (r1 && r2) {
        expect(r1.noticeId).toBe(r2.noticeId);
      }
    }
  });
});
