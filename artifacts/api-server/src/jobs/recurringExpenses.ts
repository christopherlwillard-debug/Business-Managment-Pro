import cron from "node-cron";
import { db } from "@workspace/db";
import { recurringExpensesTable, expensesTable } from "@workspace/db/schema";
import { lte, eq, and } from "drizzle-orm";
import { advanceDate, localDateStr } from "../routes/recurring-expenses.js";

async function processRecurringExpenses() {
  const today = localDateStr();
  try {
    const due = await db
      .select()
      .from(recurringExpensesTable)
      .where(
        and(
          eq(recurringExpensesTable.active, true),
          lte(recurringExpensesTable.nextDueDate, today)
        )
      );

    if (due.length === 0) return;
    console.log(`[recurring-expenses] Processing ${due.length} template(s)`);

    for (const template of due) {
      await db.insert(expensesTable).values({
        description: template.description,
        amount: template.amount,
        category: template.category,
        vendor: template.vendor,
        jobId: template.jobId,
        notes: template.notes,
        date: template.nextDueDate,
        recurringExpenseId: template.id,
      });

      const next = advanceDate(template.nextDueDate, template.frequency);
      if (template.endDate && next > template.endDate) {
        await db
          .update(recurringExpensesTable)
          .set({ active: false })
          .where(eq(recurringExpensesTable.id, template.id));
        console.log(`[recurring-expenses] Template #${template.id} completed (past end date)`);
      } else {
        await db
          .update(recurringExpensesTable)
          .set({ nextDueDate: next })
          .where(eq(recurringExpensesTable.id, template.id));
        console.log(`[recurring-expenses] Template #${template.id} generated for ${template.nextDueDate}, next: ${next}`);
      }
    }
  } catch (err) {
    console.error("[recurring-expenses] Job error:", err);
  }
}

export function startRecurringExpensesJob() {
  // Run once on startup to catch any missed entries
  processRecurringExpenses();
  // Schedule daily at midnight
  cron.schedule("0 0 * * *", processRecurringExpenses);
}
