export interface SageHomeRequirementItem {
  title: string;
  completed: boolean;
  skipped: boolean;
  completedAt: string | null;
}

export function getSageHomeDocumentationReadiness(
  items: SageHomeRequirementItem[],
  additionalWorkOccurred: boolean,
  now = Date.now(),
) {
  const requiredItems = items.filter(item =>
    !item.title.includes("highly recommended; optional") &&
    (!item.title.startsWith("Conditional additional-work:") || additionalWorkOccurred)
  );
  const missingItems = requiredItems.filter(item => !item.completed && !item.skipped);
  const readinessMissing = requiredItems.filter(item =>
    !/Submit invoice to/i.test(item.title) && !item.completed && !item.skipped
  );
  const invoiceItem = requiredItems.find(item => /Submit invoice to/i.test(item.title));
  const completionAt = requiredItems.find(item =>
    /Remove tools and debris and thoroughly clean/i.test(item.title)
  )?.completedAt ?? null;
  const invoiceSubmittedAt = invoiceItem?.completedAt ?? null;
  const invoiceDueAt = completionAt
    ? new Date(new Date(completionAt).getTime() + 24 * 60 * 60 * 1000)
    : null;
  const invoiceWasLate = !!invoiceDueAt && !!invoiceSubmittedAt &&
    new Date(invoiceSubmittedAt).getTime() > invoiceDueAt.getTime();
  const invoiceIsOverdue = !!invoiceDueAt && !invoiceSubmittedAt && now > invoiceDueAt.getTime();

  return {
    requiredItems,
    missingItems,
    readinessMissing,
    homeownerPaperworkPending: requiredItems.filter(item =>
      /homeowner paperwork|referral form/i.test(item.title) && !item.completed && !item.skipped
    ).length,
    externalSubmissionPending: requiredItems.filter(item =>
      /Lead Perfection|Submit invoice to/i.test(item.title) && !item.completed && !item.skipped
    ).length,
    invoiceItem,
    invoiceSubmitted: !!invoiceSubmittedAt,
    invoiceDueAt,
    invoiceWasLate,
    invoiceIsOverdue,
  };
}
