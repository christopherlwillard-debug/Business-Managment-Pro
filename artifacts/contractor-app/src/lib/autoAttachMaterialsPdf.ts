/**
 * Triggers the server-side materials sync for a job.
 * The materials PDF is now sent as an email attachment (like checklists) —
 * it is no longer uploaded and stored on the invoice record itself.
 *
 * Kept as a no-op wrapper so all call sites continue to compile without changes.
 */
export async function autoAttachMaterialsPdf(
  _jobId: number,
  _jobTitle: string,
  _companyName?: string
): Promise<void> {
  // PDF attachment to the invoice record removed — the server now attaches the
  // materials breakdown PDF to the invoice email automatically (see invoices.ts).
}
