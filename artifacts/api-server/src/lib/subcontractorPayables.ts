export type SubcontractorBalanceStatus = "known" | "unknown";

export interface SubcontractorBalanceResolution {
  paid: number;
  remainingAmount: number | null;
  balanceStatus: SubcontractorBalanceStatus;
  balanceReason: string | null;
  outstanding: boolean;
}

export interface SubcontractorPayableItem {
  subcontractorId: number | null;
  subName: string | null;
  jobId: number | null;
  jobTitle: string;
  compensationType: string | null;
  amount: number | null;
  balanceStatus: SubcontractorBalanceStatus;
  balanceReason: string | null;
  paymentStatus: string | null;
  businessLine: string | null;
}

export function groupSubcontractorPayables<T extends SubcontractorPayableItem>(rows: T[]) {
  const groups = new Map<number, {
    subcontractorId: number;
    subName: string;
    knownTotal: number;
    unresolvedCount: number;
    isComplete: boolean;
    items: T[];
  }>();
  for (const row of rows) {
    if (row.subcontractorId == null) continue;
    let group = groups.get(row.subcontractorId);
    if (!group) {
      group = {
        subcontractorId: row.subcontractorId,
        subName: row.subName ?? `Sub #${row.subcontractorId}`,
        knownTotal: 0,
        unresolvedCount: 0,
        isComplete: true,
        items: [],
      };
      groups.set(row.subcontractorId, group);
    }
    group.items.push(row);
    if (row.amount == null) {
      group.unresolvedCount += 1;
      group.isComplete = false;
    } else {
      group.knownTotal += row.amount;
    }
  }
  return [...groups.values()]
    .map(group => ({ ...group, jobCount: group.items.length }))
    .sort((a, b) => a.subName.localeCompare(b.subName));
}

export function resolveSubcontractorBalance(input: {
  totalOwed: number | null;
  amountPaid: number | null;
  ledgerPaid: number | null;
  paymentStatus: string | null;
  unknownReason: string;
  legacyAllocationPaid?: boolean;
}): SubcontractorBalanceResolution {
  const ledgerPaid = Number.isFinite(input.ledgerPaid) ? Math.max(0, input.ledgerPaid ?? 0) : 0;
  const recordedPaid = Number.isFinite(input.amountPaid) ? Math.max(0, input.amountPaid ?? 0) : 0;
  const paid = Math.max(ledgerPaid, recordedPaid);

  // Preserve the established treatment of legacy allocations explicitly confirmed
  // paid and backed by a real ledger record.
  if ((input.paymentStatus === "paid" || input.legacyAllocationPaid) && ledgerPaid > 0) {
    return {
      paid,
      remainingAmount: 0,
      balanceStatus: "known",
      balanceReason: null,
      outstanding: false,
    };
  }

  if (input.totalOwed == null || !Number.isFinite(input.totalOwed)) {
    return {
      paid,
      remainingAmount: null,
      balanceStatus: "unknown",
      balanceReason: input.unknownReason,
      outstanding: true,
    };
  }

  const remainingAmount = Math.max(0, input.totalOwed - paid);
  if (
    remainingAmount <= 0.005 &&
    (
      input.paymentStatus === "unpaid" ||
      input.paymentStatus === "partial" ||
      (input.totalOwed <= 0.005 && paid <= 0.005)
    )
  ) {
    return {
      paid,
      remainingAmount: null,
      balanceStatus: "unknown",
      balanceReason: "Payroll is not marked settled; confirm the amount or record the actual payment in Job Payroll.",
      outstanding: true,
    };
  }
  return {
    paid,
    remainingAmount,
    balanceStatus: "known",
    balanceReason: null,
    outstanding: remainingAmount > 0.005,
  };
}
