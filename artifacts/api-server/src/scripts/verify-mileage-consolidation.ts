// One-off verification script for Task #1072 (run: pnpm --filter @workspace/api-server exec tsx src/scripts/verify-mileage-consolidation.ts)
import { db } from "@workspace/db";
import { mileageLogsTable, mileageImportsTable, expensesTable, businessesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { recalcImportExpenses } from "../routes/mileage";

function fail(msg: string): never {
  console.error("❌ FAIL:", msg);
  process.exit(1);
}

async function main() {
  const [biz] = await db.select().from(businessesTable).limit(1);
  if (!biz) fail("no business found in dev DB");

  // ── Seed a fake import with trips across two months ──────────────────────
  const [imp] = await db.insert(mileageImportsTable).values({
    businessId: biz.id,
    source: "mileiq",
    filename: "verify-test.csv",
    status: "completed",
    tripsFound: 4,
    tripsImported: 4,
  }).returning();

  const logs = await db.insert(mileageLogsTable).values([
    { date: "2026-06-05", miles: "10.00", classification: "business", ratePerMile: "0.725", deductionAmount: "7.25", source: "mileiq", businessId: biz.id, importId: imp.id, expenseId: null },
    { date: "2026-06-20", miles: "20.00", classification: "business", ratePerMile: "0.725", deductionAmount: "14.50", source: "mileiq", businessId: biz.id, importId: imp.id, expenseId: null },
    { date: "2026-06-21", miles: "5.00", classification: "personal", ratePerMile: "0.725", deductionAmount: "0", source: "mileiq", businessId: biz.id, importId: imp.id, expenseId: null },
    { date: "2026-07-01", miles: "8.00", classification: "business", ratePerMile: "0.725", deductionAmount: "5.80", source: "mileiq", businessId: biz.id, importId: imp.id, expenseId: null },
  ]).returning();

  // ── Test 1: recalc creates one expense per month ──────────────────────────
  await recalcImportExpenses(imp.id);
  let expenses = await db.select().from(expensesTable).where(eq(expensesTable.mileageImportId, imp.id));
  if (expenses.length !== 2) fail(`expected 2 monthly expenses, got ${expenses.length}`);
  const june = expenses.find(e => e.description === "June 2026 IRS Mileage");
  const july = expenses.find(e => e.description === "July 2026 IRS Mileage");
  if (!june || !july) fail(`descriptions wrong: ${expenses.map(e => e.description).join(", ")}`);
  if (june.amount !== "21.75") fail(`June amount expected 21.75, got ${june.amount}`);
  if (july.amount !== "5.80") fail(`July amount expected 5.80, got ${july.amount}`);
  if (june.date !== "2026-06-20") fail(`June date expected 2026-06-20 (last business trip), got ${june.date}`);
  if (june.category !== "mileage" || june.vendor !== "IRS Mileage") fail("June category/vendor wrong");
  if (!june.notes?.includes("2 trips") || !june.notes?.includes("30.00 mi")) fail(`June notes wrong: ${june.notes}`);
  console.log("✅ Test 1: one expense per month, correct amounts/dates/notes");

  // ── Test 2: deleting a trip recalcs the month ─────────────────────────────
  await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, logs[1].id));
  await recalcImportExpenses(imp.id);
  expenses = await db.select().from(expensesTable).where(eq(expensesTable.mileageImportId, imp.id));
  const june2 = expenses.find(e => e.description === "June 2026 IRS Mileage");
  if (june2?.amount !== "7.25") fail(`after delete, June expected 7.25, got ${june2?.amount}`);
  if (june2?.id !== june.id) fail("June expense should be updated in place, not recreated");
  console.log("✅ Test 2: trip delete recalculates monthly expense in place");

  // ── Test 3: removing all business trips in a month deletes its aggregate ──
  await db.delete(mileageLogsTable).where(eq(mileageLogsTable.id, logs[3].id));
  await recalcImportExpenses(imp.id);
  expenses = await db.select().from(expensesTable).where(eq(expensesTable.mileageImportId, imp.id));
  if (expenses.length !== 1 || expenses[0].description !== "June 2026 IRS Mileage") {
    fail(`expected only June to remain, got: ${expenses.map(e => e.description).join(", ")}`);
  }
  console.log("✅ Test 3: month with no remaining business trips loses its aggregate expense");

  // ── Test 4: legacy consolidation (simulate old per-trip expenses) ─────────
  const [legacyImp] = await db.insert(mileageImportsTable).values({
    businessId: biz.id, source: "mileiq", filename: "verify-legacy.csv", status: "completed", tripsFound: 2, tripsImported: 2,
  }).returning();
  const [pe1] = await db.insert(expensesTable).values({
    date: "2026-06-03", description: "Mileage: Business trip (10.00 mi)", vendor: "IRS Mileage", category: "mileage", amount: "7.25", businessId: biz.id,
  }).returning();
  const [pe2] = await db.insert(expensesTable).values({
    date: "2026-06-04", description: "Mileage: Business trip (4.00 mi)", vendor: "IRS Mileage", category: "mileage", amount: "2.90", businessId: biz.id,
  }).returning();
  const legacyLogs = await db.insert(mileageLogsTable).values([
    { date: "2026-06-03", miles: "10.00", classification: "business", ratePerMile: "0.725", deductionAmount: "7.25", source: "mileiq", businessId: biz.id, importId: legacyImp.id, expenseId: pe1.id },
    { date: "2026-06-04", miles: "4.00", classification: "business", ratePerMile: "0.725", deductionAmount: "2.90", source: "mileiq", businessId: biz.id, importId: legacyImp.id, expenseId: pe2.id },
  ]).returning();

  // Simulate what the migration endpoint does
  await db.transaction(async (tx) => {
    await tx.update(mileageLogsTable).set({ expenseId: null }).where(inArray(mileageLogsTable.id, legacyLogs.map(l => l.id)));
    await tx.delete(expensesTable).where(inArray(expensesTable.id, [pe1.id, pe2.id]));
  });
  await recalcImportExpenses(legacyImp.id);
  const legacyExpenses = await db.select().from(expensesTable).where(eq(expensesTable.mileageImportId, legacyImp.id));
  if (legacyExpenses.length !== 1) fail(`legacy: expected 1 aggregate, got ${legacyExpenses.length}`);
  if (legacyExpenses[0].amount !== "10.15") fail(`legacy: expected 10.15, got ${legacyExpenses[0].amount}`);
  const oldOnes = await db.select().from(expensesTable).where(inArray(expensesTable.id, [pe1.id, pe2.id]));
  if (oldOnes.length !== 0) fail("legacy per-trip expenses were not deleted");
  console.log("✅ Test 4: legacy per-trip expenses consolidate into one monthly aggregate with exact total");

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await db.delete(mileageLogsTable).where(inArray(mileageLogsTable.importId, [imp.id, legacyImp.id]));
  await db.delete(expensesTable).where(inArray(expensesTable.mileageImportId, [imp.id, legacyImp.id]));
  await db.delete(mileageImportsTable).where(inArray(mileageImportsTable.id, [imp.id, legacyImp.id]));
  console.log("✅ Cleanup done — all seeded rows removed");
  console.log("ALL TESTS PASSED");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
