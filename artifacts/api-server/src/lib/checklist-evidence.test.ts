import { describe, expect, it } from "vitest";
import {
  hasRequiredChecklistEvidence,
  hasValidPdfEvidenceHeader,
  isSupportedChecklistEvidenceType,
} from "./checklist-evidence.js";

describe("checklist evidence file validation", () => {
  it("accepts supported image types and PDF", () => {
    expect(isSupportedChecklistEvidenceType("image/jpeg")).toBe(true);
    expect(isSupportedChecklistEvidenceType("image/heic")).toBe(true);
    expect(isSupportedChecklistEvidenceType("application/pdf")).toBe(true);
  });

  it("rejects other file types and mislabeled PDFs", () => {
    expect(isSupportedChecklistEvidenceType("application/zip")).toBe(false);
    expect(hasValidPdfEvidenceHeader("application/pdf", Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(hasValidPdfEvidenceHeader("application/pdf", Buffer.from("not a PDF"))).toBe(false);
  });

  it("requires a photo for photo items and any supported file for document items", () => {
    expect(hasRequiredChecklistEvidence("image", [{ mediaType: "image" }])).toBe(true);
    expect(hasRequiredChecklistEvidence("image", [{ mediaType: "pdf" }])).toBe(false);
    expect(hasRequiredChecklistEvidence("document", [{ mediaType: "pdf" }])).toBe(true);
    expect(hasRequiredChecklistEvidence("document", [])).toBe(false);
    expect(hasRequiredChecklistEvidence(null, [])).toBe(true);
  });
});
