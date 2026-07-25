/**
 * Smart expense-to-bank-transaction matching engine.
 * Scores candidates on amount (45), vendor similarity (25), date proximity (20),
 * historical match bonus (5), and category hint (5).
 */

import { db } from "@workspace/db";
import { bankTransactionsTable } from "@workspace/db";
import { expensesTable, invoicesTable, clientsTable, subPaymentRecordsTable } from "@workspace/db/schema";
import { eq, isNull, and, not, isNotNull } from "drizzle-orm";

// ─── Provider Types ───────────────────────────────────────────────────────────

export type MatchType = "expense" | "invoice" | "sub_payment" | "recurring";

// ─── Vendor Normalization ────────────────────────────────────────────────────

/** Known vendor alias pairs: normalized bank description → canonical name */
const VENDOR_ALIASES: [RegExp, string][] = [
  [/\bAMZN\b/,                     "AMAZON"],
  [/AMAZON\s*MARKETPLACE/,          "AMAZON"],
  [/WAL[\s-]?MART(\s+SUPERCENTER)?/,"WALMART"],
  [/LOWE'?S/,                       "LOWES"],
  [/THE\s+HOME\s+DEPOT/,            "HOME DEPOT"],
  [/HOMEDEPOT/,                     "HOME DEPOT"],
  [/TRACTOR\s+SUPPLY\s*(CO\.?)?/,   "TRACTOR SUPPLY"],
  [/HARBOR\s+FREIGHT\s*(TOOLS?)?/,  "HARBOR FREIGHT"],
  [/ACE\s+HARDWARE/,                "ACE HARDWARE"],
  [/MURPHY\s*(OIL|USA)?/,           "MURPHY"],
  [/DOLLAR\s+GENERAL/,              "DOLLAR GENERAL"],
  [/FAMILY\s+DOLLAR/,               "FAMILY DOLLAR"],
  [/MENARDS?/,                      "MENARDS"],
  [/SHERWIN[\s-]?WILLIAMS/,         "SHERWIN WILLIAMS"],
  [/FASTENAL/,                      "FASTENAL"],
  [/GRAINGER/,                      "GRAINGER"],
];

export function normalizeVendor(raw: string): string {
  if (!raw) return "";
  let n = raw.toUpperCase().trim();

  // Apply known alias patterns first
  for (const [pattern, canonical] of VENDOR_ALIASES) {
    if (pattern.test(n)) { n = canonical; break; }
  }

  // Strip store/location numbers:  #1842  or  STORE 4312
  n = n.replace(/#\w+/g, " ").replace(/\bSTORE\s+\d+\b/g, " ");
  // Strip trailing all-digit segments (transaction location codes)
  n = n.replace(/\s+\d{3,}$/, "");
  // Strip legal suffixes
  n = n.replace(/\b(INC|LLC|CO|CORP|LTD|LP|COMPANY)\b\.?/g, " ");
  // Strip leading articles
  n = n.replace(/^(THE|A|AN)\s+/, "");
  // Remove punctuation
  n = n.replace(/['.,-]/g, " ");
  // Collapse whitespace
  return n.replace(/\s+/g, " ").trim();
}

// ─── Levenshtein Similarity ──────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Use two-row optimization
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

/** Returns 0–1 similarity between two vendor strings (after normalizing both). */
export function vendorSimilarity(raw1: string, raw2: string): number {
  const a = normalizeVendor(raw1);
  const b = normalizeVendor(raw2);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export interface ExpenseCandidate {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: string;
  vendor: string | null;
  jobId: number | null;
}

export interface ScoredMatch {
  score: number;
  reasons: string[];
  matchType: MatchType;
  /** Present for matchType === "expense" */
  expense?: ExpenseCandidate;
  /** Present for matchType === "invoice" */
  invoiceId?: number;
  invoiceNumber?: string | null;
  invoiceDescription?: string;
  clientName?: string | null;
  /** Present for matchType === "recurring" */
  recurringCategory?: string;
  recurringLabel?: string;
  /** Present for matchType === "sub_payment" */
  subPaymentId?: number;
  subPaymentDescription?: string;
  subcontractorId?: number | null;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00").getTime();
  const b = new Date(dateB + "T00:00:00").getTime();
  return Math.abs(Math.round((a - b) / 86_400_000));
}

export function scoreMatch(
  txn: { date: string; description: string; amount: string },
  expense: ExpenseCandidate,
): ScoredMatch {
  let score = 0;
  const reasons: string[] = [];

  // ── Amount (45 pts) ──────────────────────────────────────────────────────
  const txnAmt = Math.abs(parseFloat(txn.amount));
  const expAmt = Math.abs(parseFloat(expense.amount));
  const diff = Math.abs(txnAmt - expAmt);
  if (diff < 0.005) {
    score += 45; reasons.push("Exact Amount");
  } else if (diff < 0.10) {
    score += 40; reasons.push("Near-Exact Amount");
  } else if (diff < 1.00) {
    score += 30; reasons.push("Close Amount");
  } else if (txnAmt > 0 && diff / txnAmt < 0.05) {
    score += 20; reasons.push("Amount Within 5%");
  }

  // ── Vendor (25 pts) ──────────────────────────────────────────────────────
  const expVendorStr = expense.vendor ?? expense.description;
  const sim = vendorSimilarity(txn.description, expVendorStr);
  if (sim >= 0.95) {
    score += 25; reasons.push("Vendor Match");
  } else if (sim >= 0.75) {
    score += 18; reasons.push("Similar Vendor");
  } else if (sim >= 0.50) {
    score += 10; reasons.push("Partial Vendor Match");
  }

  // ── Date (20 pts) ────────────────────────────────────────────────────────
  const days = daysBetween(txn.date, expense.date);
  if (days === 0) {
    score += 20; reasons.push("Same Date");
  } else if (days <= 1) {
    score += 16; reasons.push("Within 1 Day");
  } else if (days <= 3) {
    score += 12; reasons.push("Within 3 Days");
  } else if (days <= 7) {
    score += 6;  reasons.push("Within 7 Days");
  }

  // ── Category hint (5 pts) ────────────────────────────────────────────────
  const cat = (expense.category ?? "").toLowerCase();
  const knownBusinessCats = ["materials", "tools/equipment", "tools/supplies", "fuel/travel", "subcontractor", "repairs/maintenance"];
  if (knownBusinessCats.some(c => cat.includes(c))) {
    score += 5;
  }

  return { score, reasons, matchType: "expense", expense };
}

// ─── Invoice Provider ────────────────────────────────────────────────────────

/** Known recurring subscription patterns: [regex, category, label] */
const RECURRING_PATTERNS: [RegExp, string, string][] = [
  [/\bNETFLIX\b/i,                    "Office/Admin",          "Netflix (Recurring)"],
  [/\bSPOTIFY\b/i,                    "Office/Admin",          "Spotify (Recurring)"],
  [/\bADOBE\b/i,                      "Office/Admin",          "Adobe (Subscription)"],
  [/\bQUICKBOOKS\b|\bINTUIT\b/i,      "Professional Services", "QuickBooks (Subscription)"],
  [/\bGOOGLE\s*(ONE|WORKSPACE|ADS)\b/i,"Office/Admin",         "Google (Subscription)"],
  [/\bAMAZON\s*PRIME\b/i,             "Office/Admin",          "Amazon Prime (Recurring)"],
  [/\bAPPLE\b/i,                      "Office/Admin",          "Apple (Subscription)"],
  [/\bHULU\b/i,                       "Office/Admin",          "Hulu (Recurring)"],
  [/\bCOMCAST\b|\bXFINITY\b/i,        "Utilities",             "Comcast/Xfinity (Bill)"],
  [/\bVERIZON\b/i,                    "Utilities",             "Verizon (Bill)"],
  [/\bAT&?T\b/i,                      "Utilities",             "AT&T (Bill)"],
  [/\bSPECTRUM\b/i,                   "Utilities",             "Spectrum (Bill)"],
  [/\bGEICO\b|\bSTATE\s*FARM\b|\bALLSTATE\b|\bPROGRESSIVE\b/i, "Insurance", "Insurance (Recurring)"],
  [/\bCONED\b|\bDUKE\s*ENERGY\b|\bNATIONAL\s*GRID\b|\bAMEREN\b/i, "Utilities", "Utility (Bill)"],
  [/\bPAYROLL\b|\bGUSTOPAY\b|\bRUNPAYROLL\b/i, "Professional Services", "Payroll Service"],
  [/\bFRESHBOOKS\b|\bWAVE\b|\bZOHO\b/i, "Professional Services", "Accounting Software"],
  [/\bZOOM\b/i,                        "Office/Admin",          "Zoom (Subscription)"],
  [/\bSLACK\b/i,                       "Office/Admin",          "Slack (Subscription)"],
  [/\bDROPBOX\b/i,                     "Office/Admin",          "Dropbox (Subscription)"],
  [/\bSQUARESPACE\b|\bWIX\b|\bWEBFLOW\b/i, "Office/Admin",    "Website Hosting"],
];

async function invoiceProvider(txn: { id: number; date: string; description: string; amount: string; transactionType: string }): Promise<ScoredMatch[]> {
  // Invoice matching is only for credit (income) transactions
  if (txn.transactionType !== "credit") return [];

  const txnAmt = Math.abs(parseFloat(txn.amount));

  // Fetch sent/accepted invoices not yet fully matched to bank transactions
  const invoices = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      issueDate: invoicesTable.issueDate,
      dueDate: invoicesTable.dueDate,
      total: invoicesTable.total,
      clientName: clientsTable.name,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .where(
      and(
        // Only look at accepted invoices (awaiting payment) or sent
        eq(invoicesTable.status, "accepted"),
      )
    );

  const results: ScoredMatch[] = [];

  for (const inv of invoices) {
    let score = 0;
    const reasons: string[] = [];

    // Amount (45 pts)
    const invAmt = Math.abs(parseFloat(inv.total ?? "0"));
    const diff = Math.abs(txnAmt - invAmt);
    if (diff < 0.005) {
      score += 45; reasons.push("Exact Amount");
    } else if (diff < 1.00) {
      score += 30; reasons.push("Close Amount");
    } else if (invAmt > 0 && diff / invAmt < 0.05) {
      score += 15; reasons.push("Amount Within 5%");
    }

    // Date — compare to issueDate and dueDate, use best
    const daysFromIssue = daysBetween(txn.date, inv.issueDate);
    const daysFromDue = inv.dueDate ? daysBetween(txn.date, inv.dueDate) : Infinity;
    const bestDays = Math.min(daysFromIssue, daysFromDue);
    if (bestDays <= 2) {
      score += 20; reasons.push("Same Week as Invoice");
    } else if (bestDays <= 7) {
      score += 12; reasons.push("Within 7 Days");
    } else if (bestDays <= 30) {
      score += 5;  reasons.push("Same Month");
    }

    // Client name hint (10 pts) — if txn description contains the client name
    if (inv.clientName) {
      const normClient = normalizeVendor(inv.clientName);
      const normDesc = normalizeVendor(txn.description);
      const sim = vendorSimilarity(normClient, normDesc);
      if (sim >= 0.7) {
        score += 10; reasons.push("Client Name Match");
      }
    }

    if (score >= 20) {
      results.push({
        score,
        reasons,
        matchType: "invoice",
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDescription: `Invoice ${inv.invoiceNumber ?? `#${inv.id}`}${inv.clientName ? ` — ${inv.clientName}` : ""}`,
        clientName: inv.clientName,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─── Recurring Provider ───────────────────────────────────────────────────────

async function recurringProvider(txn: { date: string; description: string; amount: string; transactionType: string }): Promise<ScoredMatch[]> {
  // Only for debits
  if (txn.transactionType !== "debit") return [];

  for (const [pattern, category, label] of RECURRING_PATTERNS) {
    if (pattern.test(txn.description)) {
      return [{
        score: 55,
        reasons: ["Recurring Subscription Detected"],
        matchType: "recurring",
        recurringCategory: category,
        recurringLabel: label,
      }];
    }
  }
  return [];
}

// ─── Sub Payment Provider ─────────────────────────────────────────────────────

async function subPaymentProvider(txn: { date: string; description: string; amount: string; transactionType: string }): Promise<ScoredMatch[]> {
  // Only for debits
  if (txn.transactionType !== "debit") return [];

  const txnAmt = Math.abs(parseFloat(txn.amount));

  // Find sub payment records without a bank transaction link
  const sprRows = await db
    .select({
      id: subPaymentRecordsTable.id,
      amount: subPaymentRecordsTable.amount,
      paymentDate: subPaymentRecordsTable.paymentDate,
      description: subPaymentRecordsTable.description,
      subcontractorId: subPaymentRecordsTable.subcontractorId,
    })
    .from(subPaymentRecordsTable)
    .where(isNull(subPaymentRecordsTable.bankTransactionId));

  const results: ScoredMatch[] = [];
  for (const spr of sprRows) {
    let score = 0;
    const reasons: string[] = [];

    // Amount (45 pts)
    const sprAmt = Math.abs(parseFloat(spr.amount));
    const diff = Math.abs(txnAmt - sprAmt);
    if (diff < 0.005) {
      score += 45; reasons.push("Exact Amount");
    } else if (diff < 1.00) {
      score += 30; reasons.push("Close Amount");
    } else if (sprAmt > 0 && diff / sprAmt < 0.05) {
      score += 15; reasons.push("Amount Within 5%");
    }

    // Date (20 pts)
    const days = daysBetween(txn.date, spr.paymentDate);
    if (days === 0) {
      score += 20; reasons.push("Same Date");
    } else if (days <= 3) {
      score += 12; reasons.push("Within 3 Days");
    } else if (days <= 7) {
      score += 6; reasons.push("Within 7 Days");
    }

    // Sub payment hint (10 pts)
    score += 10; reasons.push("Sub Payment Record");

    if (score >= 30) {
      results.push({
        score,
        reasons,
        matchType: "sub_payment",
        subPaymentId: spr.id,
        subPaymentDescription: spr.description ?? `Sub payment #${spr.id}`,
        subcontractorId: spr.subcontractorId,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 2);
}

// ─── Suggestions Query ────────────────────────────────────────────────────────

/** Runs the expense provider against all unmatched expenses for a given transaction. */
async function expenseProvider(txn: { id: number; date: string; description: string; amount: string; transactionType: string }): Promise<ScoredMatch[]> {
  if (txn.transactionType !== "debit") return [];

  // Get IDs of already-matched expenses (exclude them from candidates)
  const matchedRows = await db
    .select({ id: bankTransactionsTable.matchedExpenseId })
    .from(bankTransactionsTable)
    .where(and(
      not(eq(bankTransactionsTable.id, txn.id)),
      isNotNull(bankTransactionsTable.matchedExpenseId),
    ));
  const matchedIds = new Set(matchedRows.map(r => r.id).filter((id): id is number => id !== null));

  const allExpenses = await db
    .select({
      id: expensesTable.id,
      date: expensesTable.date,
      description: expensesTable.description,
      category: expensesTable.category,
      amount: expensesTable.amount,
      vendor: expensesTable.vendor,
      jobId: expensesTable.jobId,
    })
    .from(expensesTable);

  const candidates = allExpenses.filter(e => !matchedIds.has(e.id));

  return candidates
    .map(exp => scoreMatch(txn, exp))
    .filter(m => m.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/**
 * Unified suggestions query — runs all relevant providers based on transaction type
 * and returns the top 5 suggestions across all provider types.
 */
export async function getSuggestions(txnId: number): Promise<ScoredMatch[]> {
  // Load the transaction (including transactionType for provider routing)
  const [txn] = await db
    .select({
      id: bankTransactionsTable.id,
      date: bankTransactionsTable.date,
      description: bankTransactionsTable.description,
      amount: bankTransactionsTable.amount,
      transactionType: bankTransactionsTable.transactionType,
    })
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, txnId));

  if (!txn) return [];

  const txnRef = {
    id: txn.id,
    date: txn.date ?? "",
    description: txn.description ?? "",
    amount: txn.amount,
    transactionType: txn.transactionType ?? "debit",
  };

  // Run all providers in parallel
  const [expenseResults, invoiceResults, recurringResults, subPayResults] = await Promise.all([
    expenseProvider(txnRef),
    invoiceProvider(txnRef),
    recurringProvider(txnRef),
    subPaymentProvider(txnRef),
  ]);

  // Combine and sort across providers
  // For display: show expense matches first (most actionable), then others
  const all = [...expenseResults, ...invoiceResults, ...subPayResults, ...recurringResults];

  // De-duplicate by matchType+id
  const seen = new Set<string>();
  const deduped: ScoredMatch[] = [];
  for (const m of all) {
    const key = `${m.matchType}:${m.expense?.id ?? m.invoiceId ?? m.subPaymentId ?? "recurring"}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(m);
    }
  }

  return deduped.sort((a, b) => b.score - a.score).slice(0, 7);
}

// ─── Expense → Transaction direction ─────────────────────────────────────────

/**
 * When an expense is created or edited, scan all unmatched debit bank transactions
 * and auto-link if there's a confident, unambiguous match.
 * Never blocks the caller — fire-and-forget with internal error logging.
 */
export async function reconcileExpense(expenseId: number): Promise<void> {
  try {
    // Skip if this expense is already linked to a bank transaction
    const [existingLink] = await db
      .select({ id: bankTransactionsTable.id })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.matchedExpenseId, expenseId))
      .limit(1);
    if (existingLink) return;

    // Load the expense
    const [expense] = await db
      .select({
        id: expensesTable.id,
        date: expensesTable.date,
        description: expensesTable.description,
        category: expensesTable.category,
        amount: expensesTable.amount,
        vendor: expensesTable.vendor,
        jobId: expensesTable.jobId,
      })
      .from(expensesTable)
      .where(eq(expensesTable.id, expenseId));
    if (!expense) return;

    // Get already-matched expense IDs so we exclude them from candidate txn selection
    const matchedTxns = await db
      .select({ id: bankTransactionsTable.id, amount: bankTransactionsTable.amount, date: bankTransactionsTable.date, description: bankTransactionsTable.description })
      .from(bankTransactionsTable)
      .where(eq(bankTransactionsTable.status, "unmatched"));

    if (matchedTxns.length === 0) return;

    // Score each unmatched debit transaction against this expense
    const scored = matchedTxns
      .map(txn => ({
        txnId: txn.id,
        result: scoreMatch(
          { date: txn.date, description: txn.description, amount: txn.amount },
          expense,
        ),
      }))
      .sort((a, b) => b.result.score - a.result.score);

    if (scored.length === 0) return;

    const best = scored[0];
    const secondBest = scored[1];
    if (best.result.score >= 95 && (secondBest === undefined || secondBest.result.score <= 85)) {
      await db
        .update(bankTransactionsTable)
        .set({ status: "matched", matchedExpenseId: expenseId })
        .where(eq(bankTransactionsTable.id, best.txnId));
    }
  } catch (err) {
    console.error("[reconcileExpense] auto-match failed:", err);
  }
}

// ─── Auto-Match Logic ────────────────────────────────────────────────────────

/**
 * Attempts to auto-match a newly imported transaction.
 * Rules: top score ≥ 95 AND second-best score ≤ 85 (prevents ambiguous auto-match).
 * Returns the matched expense id if auto-matched, null otherwise.
 */
export async function attemptAutoMatch(txnId: number): Promise<number | null> {
  const suggestions = await getSuggestions(txnId);
  // Auto-match only considers expense-type suggestions (most reliable, direct DB link)
  const expenseSuggestions = suggestions.filter(s => s.matchType === "expense" && s.expense != null);
  if (expenseSuggestions.length === 0) return null;

  const best = expenseSuggestions[0];
  const secondBest = expenseSuggestions[1];

  if (best.score >= 95 && (secondBest === undefined || secondBest.score <= 85)) {
    return best.expense!.id;
  }
  return null;
}
