export interface ContractRequirementItem {
  requirementKey?: string | null;
  requirementStatus?: "required" | "recommended" | "conditional" | null;
  conditionKey?: string | null;
  title: string;
  completed: boolean;
  skipped: boolean;
  completedAt: string | null;
}

export function getContractDocumentationReadiness(
  items: ContractRequirementItem[],
  additionalWorkOccurred: boolean,
  now = Date.now(),
  deadlineHours: number | null = 24,
) {
  const applies = (item: ContractRequirementItem) => {
    if (item.requirementStatus === "recommended") return false;
    if (item.requirementStatus === "required") return true;
    if (item.requirementStatus === "conditional") {
      return item.conditionKey === "additional_work" && additionalWorkOccurred;
    }
    if (item.title.includes("highly recommended; optional")) return false;
    return !item.title.startsWith("Conditional additional-work:") || additionalWorkOccurred;
  };
  const requiredItems = items.filter(applies);
  const invoiceItem = requiredItems.find(item =>
    item.requirementKey === "invoice_submission" || /Submit invoice to/i.test(item.title)
  );
  const completionAt = requiredItems.find(item =>
    item.requirementKey === "installation_cleanup_complete" ||
    /Remove tools and debris and thoroughly clean/i.test(item.title)
  )?.completedAt ?? null;
  const invoiceSubmittedAt = invoiceItem?.completedAt ?? null;
  const hours = deadlineHours && deadlineHours > 0 ? deadlineHours : 24;
  const invoiceDueAt = completionAt
    ? new Date(new Date(completionAt).getTime() + hours * 60 * 60 * 1000)
    : null;
  const invoiceWasLate = !!invoiceDueAt && !!invoiceSubmittedAt &&
    new Date(invoiceSubmittedAt).getTime() > invoiceDueAt.getTime();
  const invoiceIsOverdue = !!invoiceDueAt && !invoiceSubmittedAt && now > invoiceDueAt.getTime();
  return {
    requiredItems,
    missingItems: requiredItems.filter(item => !item.completed && !item.skipped),
    readinessMissing: requiredItems.filter(item =>
      item !== invoiceItem && !item.completed && !item.skipped
    ),
    homeownerPaperworkPending: requiredItems.filter(item =>
      ["homeowner_signed_paperwork", "referral_form"].includes(item.requirementKey ?? "") ||
      /homeowner paperwork|referral form/i.test(item.title)
    ).filter(item => !item.completed && !item.skipped).length,
    externalSubmissionPending: requiredItems.filter(item =>
      ["lead_perfection_upload", "invoice_submission"].includes(item.requirementKey ?? "") ||
      /Lead Perfection|Submit invoice to/i.test(item.title)
    ).filter(item => !item.completed && !item.skipped).length,
    invoiceItem,
    invoiceSubmitted: !!invoiceSubmittedAt,
    invoiceDueAt,
    invoiceWasLate,
    invoiceIsOverdue,
  };
}
