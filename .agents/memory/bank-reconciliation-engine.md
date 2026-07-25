---
name: Bank reconciliation engine
description: Architecture and key decisions for the smart bank-transaction matching/reconciliation system built across tasks #1316–#1323.
---

# Bank Reconciliation Engine

## Provider registry (matchingEngine.ts)

`artifacts/api-server/src/lib/matchingEngine.ts` exports:
- `getSuggestions(txnId)` — runs all four providers in parallel, returns up to 7 `ScoredMatch` sorted by score
- `attemptAutoMatch(txnId)` — filters to `matchType === "expense"` only, auto-links if top ≥95 AND second ≤85
- `reconcileExpense(expenseId)` — expense→transaction direction; called fire-and-forget from expenses POST/PUT

**Providers:**
| Provider | Txn type | Max score | Action |
|----------|----------|-----------|--------|
| `expenseProvider` | debit | 95 | `matchExpenseMutation` |
| `invoiceProvider` | credit | 75 | `fileAsIncomeMutation` with invoiceId |
| `recurringProvider` | debit | 55 | Pre-fills `File as Expense` form |
| `subPaymentProvider` | debit | 75 | Informational only (no endpoint yet) |

**Why `expense` is optional in `ScoredMatch`:** The field was made optional when adding matchType (different providers return different fields). Always check `s.matchType === "expense" && s.expense != null` before using `s.expense`.

## Auto-match triggers
- On Plaid sync: new debit txn → `attemptAutoMatch` → updates `bank_transactions.status = "matched"`
- On expense create: `reconcileExpense` fire-and-forget from `expenses.ts` POST
- On expense edit: `reconcileExpense` fire-and-forget from `expenses.ts` PUT

## Match locking
- `match-expense` route (line 748-753 in plaid.ts): checks `alreadyLinked` — expense already matched to another txn returns 409
- `sub_payment` suggestions are informational only; no `match-sub-payment` endpoint exists yet (Task #1324)

## Banking.tsx features (#1317–#1323)
- **Inbox bar**: shows unmatched debit count + filed count + "Auto-match on" indicator; gear opens settings sheet
- **Settings sheet**: auto-match toggle + confidence threshold slider (localStorage); learned vendor rules list
- **Vendor rules (#1322)**: localStorage "banking-vendor-rules"; `learnVendorRule()` called in `fileAsExpenseMutation.onSuccess`
- **Month-end wizard (#1323)**: Reconcile button → sheet with statement balance input, debit/credit totals, unmatched list
- **Match sheet**: shows suggestions for both debit ("Match to Expense") and credit ("Match to Invoice") transactions; `matchType` badge on each suggestion card
- **Default categories**: Banking.tsx uses "Tools/Equipment"; SubcontractorPortal.tsx uses "Tools/Supplies"

## Sub payment linking (pending — Task #1324)
Need: `POST /api/plaid/transactions/:txnId/match-sub-payment` that sets `sub_payment_records.bankTransactionId = txnId` and `bank_transactions.status = "matched"`. The unmatch route must also clear that column. Currently the sub_payment suggestions are shown but clicking does nothing.

**Why:**
The `bankTransactionsTable` has no `matchedSubPaymentId` column; the link is stored on `sub_payment_records.bankTransactionId` (reverse FK). Adding a new column would require a schema migration; the reverse-FK approach avoids that.
