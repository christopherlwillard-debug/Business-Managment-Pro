export type DivisionAllocationInput = { businessId: number; amount: string };

export function validateDivisionAllocationAmounts(
  raw: unknown,
  sourceAmount: unknown,
  allowedDivisionIds: ReadonlySet<number>,
  isSharedOverhead: boolean,
): DivisionAllocationInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error("divisionAllocations must be an array");
  if (raw.length > 0 && !isSharedOverhead) {
    throw new Error("Only shared overhead can be allocated to divisions");
  }
  const sourceCents = Math.round(Number(sourceAmount) * 100);
  if (!Number.isInteger(sourceCents) || sourceCents <= 0) {
    throw new Error("Source expense amount must be greater than zero");
  }
  const normalized: DivisionAllocationInput[] = [];
  const seen = new Set<number>();
  let allocatedCents = 0;
  for (const item of raw) {
    const businessId = Number((item as any)?.businessId);
    const amountCents = Math.round(Number((item as any)?.amount) * 100);
    if (!Number.isSafeInteger(businessId) || !allowedDivisionIds.has(businessId)) {
      throw new Error("Each allocation must target a division under the expense’s legal owner");
    }
    if (seen.has(businessId)) throw new Error("A division can only be allocated once per expense");
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error("Each division allocation must be greater than zero");
    }
    allocatedCents += amountCents;
    seen.add(businessId);
    normalized.push({ businessId, amount: (amountCents / 100).toFixed(2) });
  }
  if (allocatedCents > sourceCents) {
    throw new Error("Division allocations cannot exceed the source expense amount");
  }
  return normalized;
}
