const CHECKLIST_EVIDENCE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isSupportedChecklistEvidenceType(mimeType: string): boolean {
  return CHECKLIST_EVIDENCE_IMAGE_TYPES.has(mimeType) || mimeType === "application/pdf";
}

export function hasValidPdfEvidenceHeader(mimeType: string, bytes: Buffer): boolean {
  return mimeType !== "application/pdf" || bytes.subarray(0, 5).equals(Buffer.from("%PDF-"));
}

export function hasRequiredChecklistEvidence(
  requiredEvidenceType: string | null,
  evidence: Array<{ mediaType: string }>,
): boolean {
  if (!requiredEvidenceType) return true;
  if (requiredEvidenceType === "image") return evidence.some(file => file.mediaType === "image");
  return evidence.length > 0;
}
