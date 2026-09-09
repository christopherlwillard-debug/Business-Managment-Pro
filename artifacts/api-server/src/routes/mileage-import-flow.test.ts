import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "@workspace/db";
import {
  businessesTable,
  expensesTable,
  mileageImportsTable,
  mileageLogsTable,
} from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import mileageRouter from "./mileage";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: "mileage-import-flow-test" };
  next();
});
app.use("/mileage", mileageRouter);

const createdBusinessIds = new Set<number>();

async function createBusiness(label: string): Promise<number> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [business] = await db
    .insert(businessesTable)
    .values({
      name: `Mileage import flow ${label}`,
      slug: `mileage-import-flow-${label}-${nonce}`,
      type: "other",
    })
    .returning({ id: businessesTable.id });
  createdBusinessIds.add(business.id);
  return business.id;
}

function trip(sourceTripKey: string, miles: number) {
  return {
    date: "2026-09-01",
    miles,
    startLocation: "100 Main St",
    endLocation: "200 Oak St",
    classification: "business",
    sourceTripKey,
  };
}

async function activeLogs(businessId: number) {
  return db
    .select()
    .from(mileageLogsTable)
    .where(and(
      eq(mileageLogsTable.businessId, businessId),
      isNull(mileageLogsTable.voidedAt),
    ));
}

async function activeMileageExpenses(businessId: number) {
  return db
    .select()
    .from(expensesTable)
    .where(and(
      eq(expensesTable.businessId, businessId),
      eq(expensesTable.category, "mileage"),
      isNull(expensesTable.voidedAt),
    ));
}

afterEach(async () => {
  for (const businessId of createdBusinessIds) {
    await db.delete(expensesTable).where(eq(expensesTable.businessId, businessId));
    await db.delete(mileageLogsTable).where(eq(mileageLogsTable.businessId, businessId));
    await db.delete(mileageImportsTable).where(eq(mileageImportsTable.businessId, businessId));
    await db.delete(businessesTable).where(eq(businessesTable.id, businessId));
  }
  createdBusinessIds.clear();
});

describe("mileage import financial integrity — real database", () => {
  it("rolls back the batch and trips when monthly expense creation fails", async () => {
    const businessId = await createBusiness("atomic-failure");
    const triggerName = `mileage_import_failure_${businessId}`;
    const functionName = `${triggerName}_fn`;

    await db.execute(sql.raw(`
      CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
      BEGIN
        IF NEW.business_id = ${businessId} AND NEW.mileage_import_id IS NOT NULL THEN
          RAISE EXCEPTION 'forced mileage aggregate failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON expenses
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `));

    try {
      const response = await request(app)
        .post("/mileage/bulk")
        .send({
          businessId,
          source: "mileiq",
          filename: "must-rollback.csv",
          fileHash: `must-rollback-${businessId}`,
          trips: [trip("09/01/2026 07:00|09/01/2026 07:20", 10)],
        });

      expect(response.status).toBe(500);
      expect(await activeLogs(businessId)).toHaveLength(0);
      expect(await activeMileageExpenses(businessId)).toHaveLength(0);

      const imports = await db
        .select()
        .from(mileageImportsTable)
        .where(eq(mileageImportsTable.businessId, businessId));
      expect(imports).toHaveLength(0);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName} ON expenses`));
      await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${functionName}()`));
    }
  });

  it("recalculates the original aggregate after a void and keeps a corrected re-import unique", async () => {
    const businessId = await createBusiness("void-reimport");
    const correctedKey = "09/01/2026 08:00|09/01/2026 08:15";
    const secondKey = "09/01/2026 09:00|09/01/2026 09:30";

    const initial = await request(app)
      .post("/mileage/bulk")
      .send({
        businessId,
        source: "mileiq",
        filename: "initial.csv",
        fileHash: `initial-${businessId}`,
        trips: [trip(correctedKey, 10), trip(secondKey, 20)],
      });

    expect(initial.status).toBe(201);
    expect(initial.body).toMatchObject({
      imported: 2,
      duplicatesSkipped: 0,
      expensesCreated: 1,
    });

    let expenses = await activeMileageExpenses(businessId);
    expect(expenses).toHaveLength(1);
    expect(Number(expenses[0].amount)).toBeCloseTo(22.8, 2);

    const logs = await activeLogs(businessId);
    const logToCorrect = logs.find(log => log.sourceTripKey === correctedKey);
    expect(logToCorrect).toBeDefined();

    const voided = await request(app)
      .post(`/mileage/${logToCorrect!.id}/void`)
      .send({ reason: "Corrected provider export" });

    expect(voided.status).toBe(200);
    expenses = await activeMileageExpenses(businessId);
    expect(expenses).toHaveLength(1);
    expect(Number(expenses[0].amount)).toBeCloseTo(15.2, 2);

    const corrected = await request(app)
      .post("/mileage/bulk")
      .send({
        businessId,
        source: "mileiq",
        filename: "corrected.csv",
        fileHash: `corrected-${businessId}`,
        trips: [trip(correctedKey, 12)],
      });

    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({ imported: 1, duplicatesSkipped: 0, expensesCreated: 1 });

    const repeated = await request(app)
      .post("/mileage/bulk")
      .send({
        businessId,
        source: "mileiq",
        filename: "corrected-again.csv",
        fileHash: `corrected-again-${businessId}`,
        trips: [trip(correctedKey, 12)],
      });

    expect(repeated.status).toBe(201);
    expect(repeated.body).toMatchObject({ imported: 0, duplicatesSkipped: 1, expensesCreated: 0 });

    const finalLogs = await activeLogs(businessId);
    expect(finalLogs).toHaveLength(2);
    expect(finalLogs.filter(log => log.sourceTripKey === correctedKey)).toHaveLength(1);

    const finalExpenses = await activeMileageExpenses(businessId);
    expect(finalExpenses).toHaveLength(2);
    expect(finalExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0)).toBeCloseTo(24.32, 2);
  });

  it("voids the monthly aggregate when its final imported business drive is voided", async () => {
    const businessId = await createBusiness("void-final-drive");
    const sourceTripKey = "09/01/2026 11:00|09/01/2026 11:20";

    const imported = await request(app)
      .post("/mileage/bulk")
      .send({
        businessId,
        source: "mileiq",
        filename: "single-drive.csv",
        fileHash: `single-drive-${businessId}`,
        trips: [trip(sourceTripKey, 10)],
      });

    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({
      imported: 1,
      duplicatesSkipped: 0,
      expensesCreated: 1,
    });
    expect(await activeLogs(businessId)).toHaveLength(1);
    expect(await activeMileageExpenses(businessId)).toHaveLength(1);

    const [log] = await db
      .select()
      .from(mileageLogsTable)
      .where(and(
        eq(mileageLogsTable.businessId, businessId),
        eq(mileageLogsTable.sourceTripKey, sourceTripKey),
      ));
    expect(log).toBeDefined();

    const voided = await request(app)
      .post(`/mileage/${log!.id}/void`)
      .send({ reason: "Final drive corrected" });

    expect(voided.status).toBe(200);
    expect(await activeLogs(businessId)).toHaveLength(0);
    expect(await activeMileageExpenses(businessId)).toHaveLength(0);

    const [preservedLog] = await db
      .select()
      .from(mileageLogsTable)
      .where(eq(mileageLogsTable.id, log!.id));
    expect(preservedLog).toMatchObject({
      businessId,
      sourceTripKey,
      voidReason: "Final drive corrected",
    });
    expect(preservedLog?.voidedAt).toBeTruthy();

    const preservedExpenses = await db
      .select()
      .from(expensesTable)
      .where(eq(expensesTable.mileageImportId, imported.body.importId));
    expect(preservedExpenses).toHaveLength(1);
    expect(preservedExpenses[0]).toMatchObject({
      businessId,
      category: "mileage",
      mileageImportId: imported.body.importId,
      voidReason: "Mileage import aggregate no longer has active trips",
    });
    expect(preservedExpenses[0]?.voidedAt).toBeTruthy();
    expect(Number(preservedExpenses[0]?.amount)).toBeCloseTo(7.6, 2);
  });

  it("allows only one concurrent same-key insert and permits re-import after rollback", async () => {
    const businessId = await createBusiness("concurrency");
    const sourceTripKey = "09/01/2026 10:00|09/01/2026 10:20";
    const payload = {
      businessId,
      source: "mileiq",
      trips: [trip(sourceTripKey, 8)],
    };

    const [first, second] = await Promise.all([
      request(app).post("/mileage/bulk").send({
        ...payload,
        filename: "concurrent-a.csv",
        fileHash: `concurrent-a-${businessId}`,
      }),
      request(app).post("/mileage/bulk").send({
        ...payload,
        filename: "concurrent-b.csv",
        fileHash: `concurrent-b-${businessId}`,
      }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect([first.body.imported, second.body.imported].sort()).toEqual([0, 1]);
    expect(await activeLogs(businessId)).toHaveLength(1);
    expect(await activeMileageExpenses(businessId)).toHaveLength(1);

    const winningImportId = first.body.imported === 1 ? first.body.importId : second.body.importId;
    const rollback = await request(app).delete(`/mileage/imports/${winningImportId}/rollback`);
    expect(rollback.status).toBe(200);
    expect(await activeLogs(businessId)).toHaveLength(0);
    expect(await activeMileageExpenses(businessId)).toHaveLength(0);

    const reimport = await request(app)
      .post("/mileage/bulk")
      .send({
        ...payload,
        filename: "after-rollback.csv",
        fileHash: `after-rollback-${businessId}`,
      });

    expect(reimport.status).toBe(201);
    expect(reimport.body).toMatchObject({ imported: 1, duplicatesSkipped: 0, expensesCreated: 1 });
    expect(await activeLogs(businessId)).toHaveLength(1);

    const finalExpenses = await activeMileageExpenses(businessId);
    expect(finalExpenses).toHaveLength(1);
    expect(Number(finalExpenses[0].amount)).toBeCloseTo(6.08, 2);

    const [{ activeKeyCount }] = await db
      .select({ activeKeyCount: sql<number>`count(*)::int` })
      .from(mileageLogsTable)
      .where(and(
        eq(mileageLogsTable.businessId, businessId),
        eq(mileageLogsTable.source, "mileiq"),
        eq(mileageLogsTable.sourceTripKey, sourceTripKey),
        isNull(mileageLogsTable.voidedAt),
      ));
    expect(activeKeyCount).toBe(1);
  });
});