/**
 * Historical expense category values that represent owner withdrawals.
 * These values remain readable for migration/reporting compatibility, but new
 * owner withdrawals belong only in owner_capital_entries.
 */
export const OWNER_WITHDRAWAL_EXPENSE_CATEGORIES = [
  "Owner Pay",
  "Owner Draw",
  "Owner Compensation",
  "Owner Withdrawal",
] as const;

const OWNER_WITHDRAWAL_EXPENSE_CATEGORY_SET = new Set<string>(
  OWNER_WITHDRAWAL_EXPENSE_CATEGORIES,
);

export function isOwnerWithdrawalExpenseCategory(category: string | null | undefined): boolean {
  return category != null && OWNER_WITHDRAWAL_EXPENSE_CATEGORY_SET.has(category);
}

export function isOwnerWithdrawalExpenseCategoryInsensitive(category: string | null | undefined): boolean {
  const normalized = category?.trim().toLowerCase();
  return normalized != null && OWNER_WITHDRAWAL_EXPENSE_CATEGORIES.some(
    candidate => candidate.toLowerCase() === normalized,
  );
}