import cron from "node-cron";
import { db } from "@workspace/db";
import { recurringExpensesTable, expensesTable } from "@workspace/db/schema";
import { lte, eq, and } from "drizzle-orm";
import { advanceDate, localDateStr } from "../routes/recurring-expenses.js";

const FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "yearly"] as const;

/**
 * Generate every overdue occurrence for each active template.
 *
 * The template row is locked inside the same transaction as occurrence
 * creation and schedule advancement. Multiple app replicas can all discover
 * the same due template, but only the first transaction can generate it;
 * later transactions re-read the advanced row after acquiring the lock.
 */
export async function processRecurringExpenses(today: string = localDateStr()): Promise<void> {
  try {
    const due = await db
      .select({ id: recurringExpensesTable.id })
      .from(recurringExpensesTable)
      .where(
        and(
          eq(recurringExpensesTable.active, true),
          lte(recurringExpensesTable.nextDueDate, today),
        ),
      )
      .orderBy(recurringExpensesTable.id);

    if (due.length === 0) return;
    console.log("[recurring-expenses] Processing " + due.length + " due template(s)");

    for (const { id } of due) {
      try {
        const result = await db.transaction(async (tx) => {
          const [template] = await tx
            .select()
            .from(recurringExpensesTable)
            .where(eq(recurringExpensesTable.id, id))
            .for("update")
            .limit(1);

          // Another worker may have processed the template while this one
          // waited for the row lock.
          if (!template || !template.active || template.nextDueDate > today) {
            return { generated: 0, nextDueDate: template?.nextDueDate ?? null, deactivated: false };
          }
          if (!FREQUENCIES.includes(template.frequency as typeof FREQUENCIES[number])) {
            throw new Error("Unsupported frequency: " + String(template.frequency));
          }

          let nextDueDate = template.nextDueDate;
          let generated = 0;

          // Catch up all missed periods, but never create an occurrence after
          // the configured end date. Existing occurrences are treated as
          // already generated so a prior partial run cannot duplicate them.
          while (nextDueDate <= today && (!template.endDate || nextDueDate <= template.endDate)) {
            const [existing] = await tx
              .select({ id: expensesTable.id })
              .from(expensesTable)
              .where(and(
                eq(expensesTable.recurringExpenseId, template.id),
                eq(expensesTable.date, nextDueDate),
              ))
              .limit(1);

            if (!existing) {
              await tx.insert(expensesTable).values({
                description: template.description,
                amount: template.amount,
                category: template.category,
                vendor: template.vendor,
                jobId: template.jobId,
                notes: template.notes,
                date: nextDueDate,
                recurringExpenseId: template.id,
                businessId: template.businessId,
              });
              generated++;
            }

            const next = advanceDate(nextDueDate, template.frequency, template.startDate);
            if (next <= nextDueDate) {
              throw new Error("Recurring expense schedule did not advance");
            }
            nextDueDate = next;
          }

          const deactivated = Boolean(template.endDate && nextDueDate > template.endDate);
          await tx
            .update(recurringExpensesTable)
            .set({
              nextDueDate,
              ...(deactivated ? { active: false } : {}),
            })
            .where(eq(recurringExpensesTable.id, template.id));

          return { generated, nextDueDate, deactivated };
        });

        if (result.generated > 0) {
          console.log(
            "[recurring-expenses] Template #" + id + " generated " +
            result.generated + " occurrence(s); next due: " + result.nextDueDate,
          );
        } else if (result.deactivated) {
          console.log("[recurring-expenses] Template #" + id + " completed at its end date");
        }
      } catch (err) {
        // A bad template should not prevent unrelated businesses' templates
        // from being processed during the same worker run.
        console.error("[recurring-expenses] Template #" + id + " failed:", err);
      }
    }
  } catch (err) {
    console.error("[recurring-expenses] Job error:", err);
  }
}

export function startRecurringExpensesJob() {
  // Run once on startup to catch any missed entries.
  void processRecurringExpenses();
  // Schedule daily at midnight.
  cron.schedule("0 0 * * *", () => void processRecurringExpenses());
}
