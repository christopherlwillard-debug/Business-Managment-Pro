import { describe, expect, it } from "vitest";
import {
  OWNER_WITHDRAWAL_EXPENSE_CATEGORIES,
  isOwnerWithdrawalExpenseCategory,
  isOwnerWithdrawalExpenseCategoryInsensitive,
} from "./owner-withdrawals.js";

describe("owner withdrawal expense compatibility", () => {
  it("recognizes every historical owner-withdrawal category, including Owner Pay", () => {
    expect(OWNER_WITHDRAWAL_EXPENSE_CATEGORIES).toEqual([
      "Owner Pay",
      "Owner Draw",
      "Owner Compensation",
      "Owner Withdrawal",
    ]);
    for (const category of OWNER_WITHDRAWAL_EXPENSE_CATEGORIES) {
      expect(isOwnerWithdrawalExpenseCategory(category)).toBe(true);
    }
  });

  it("supports case-insensitive API validation without broad false positives", () => {
    expect(isOwnerWithdrawalExpenseCategoryInsensitive(" owner pay ")).toBe(true);
    expect(isOwnerWithdrawalExpenseCategoryInsensitive("Materials")).toBe(false);
  });
});