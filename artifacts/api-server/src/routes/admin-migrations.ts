import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mileageLogsTable, expensesTable, businessesTable, recurringExpensesTable,
  checklistTemplatesTable, checklistTemplateSectionsTable, checklistTemplateItemsTable,
} from "@workspace/db/schema";
import { isNull, isNotNull, and, inArray, or, like, asc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/backfill-mileage-business", async (_req, res) => {
  try {
    const [primaryBusiness] = await db
      .select({ id: businessesTable.id, name: businessesTable.name })
      .from(businessesTable)
      .orderBy(asc(businessesTable.sortOrder), asc(businessesTable.id))
      .limit(1);

    if (!primaryBusiness) {
      res.status(400).json({ error: "No businesses found — cannot backfill" });
      return;
    }

    const orphanLogs = await db
      .select({ id: mileageLogsTable.id, expenseId: mileageLogsTable.expenseId })
      .from(mileageLogsTable)
      .where(and(isNull(mileageLogsTable.businessId), isNull(mileageLogsTable.subcontractorId)));

    if (orphanLogs.length === 0) {
      res.json({ updated: 0, expensesUpdated: 0, businessId: primaryBusiness.id, businessName: primaryBusiness.name });
      return;
    }

    const orphanIds = orphanLogs.map(l => l.id);
    const linkedExpenseIds = orphanLogs.map(l => l.expenseId).filter((id): id is number => id != null);

    await db
      .update(mileageLogsTable)
      .set({ businessId: primaryBusiness.id })
      .where(inArray(mileageLogsTable.id, orphanIds));

    let expensesUpdated = 0;
    if (linkedExpenseIds.length > 0) {
      await db
        .update(expensesTable)
        .set({ businessId: primaryBusiness.id })
        .where(inArray(expensesTable.id, linkedExpenseIds));
      expensesUpdated = linkedExpenseIds.length;
    }

    console.log(
      `[admin/migrations] backfill-mileage-business: tagged ${orphanIds.length} mileage logs ` +
      `and ${expensesUpdated} linked expenses → businessId=${primaryBusiness.id} (${primaryBusiness.name})`
    );

    res.json({
      updated: orphanIds.length,
      expensesUpdated,
      businessId: primaryBusiness.id,
      businessName: primaryBusiness.name,
    });
  } catch (err) {
    console.error("[admin/migrations] backfill-mileage-business failed:", err);
    res.status(500).json({ error: "Migration failed" });
  }
});

// Phase 2 cleanup: delete expense rows created by the pay-worker dual-write
// (Task #892). Phase 1 (Task #888) wrote both to sub_payment_records AND to
// expenses; Phase 2 removes the expense write. This endpoint deletes the
// historical pay-worker expense rows so the books aren't double-counted.
// Safe to run multiple times (idempotent — returns 0 on subsequent runs).
router.post("/delete-payworker-expenses", async (_req, res) => {
  // Phantom rows created by the old pay-worker dual-write code have:
  //   subcontractorId IS NOT NULL  (they are linked to a sub)
  //   jobSubHoursId  IS NULL       (they were NOT created by the hours-logging flow)
  //   description ending in "— Labor Pay", "— Fixed Pay", or "— Allocation Pay"
  const payWorkerCondition = and(
    isNotNull(expensesTable.subcontractorId),
    isNull(expensesTable.jobSubHoursId),
    or(
      like(expensesTable.description, "%\u2014 Labor Pay"),
      like(expensesTable.description, "%\u2014 Fixed Pay"),
      like(expensesTable.description, "%\u2014 Allocation Pay"),
    ),
  );

  try {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(expensesTable)
      .where(payWorkerCondition);
    const before = countRow?.count ?? 0;

    if (before === 0) {
      console.log("[admin/migrations] delete-payworker-expenses: 0 rows found — already clean");
      res.json({ deleted: 0, message: "No pay-worker expense rows found — DB already clean" });
      return;
    }

    await db.delete(expensesTable).where(payWorkerCondition);

    console.log(`[admin/migrations] delete-payworker-expenses: deleted ${before} rows`);
    res.json({ deleted: before });
  } catch (err) {
    console.error("[admin/migrations] delete-payworker-expenses failed:", err);
    res.status(500).json({ error: "Migration failed" });
  }
});

// Backfill: assign the primary business to recurring_expenses rows with null businessId.
// Idempotent — returns 0 on subsequent runs when all rows are already assigned.
router.post("/backfill-recurring-business", async (_req, res) => {
  try {
    const [primaryBusiness] = await db
      .select({ id: businessesTable.id, name: businessesTable.name })
      .from(businessesTable)
      .orderBy(asc(businessesTable.sortOrder), asc(businessesTable.id))
      .limit(1);

    if (!primaryBusiness) {
      res.status(400).json({ error: "No businesses found — cannot backfill" });
      return;
    }

    const orphans = await db
      .select({ id: recurringExpensesTable.id })
      .from(recurringExpensesTable)
      .where(isNull(recurringExpensesTable.businessId));

    if (orphans.length === 0) {
      res.json({ updated: 0, businessId: primaryBusiness.id, businessName: primaryBusiness.name });
      return;
    }

    await db
      .update(recurringExpensesTable)
      .set({ businessId: primaryBusiness.id })
      .where(isNull(recurringExpensesTable.businessId));

    console.log(
      `[admin/migrations] backfill-recurring-business: tagged ${orphans.length} recurring expenses ` +
      `→ businessId=${primaryBusiness.id} (${primaryBusiness.name})`
    );

    res.json({ updated: orphans.length, businessId: primaryBusiness.id, businessName: primaryBusiness.name });
  } catch (err) {
    console.error("[admin/migrations] backfill-recurring-business failed:", err);
    res.status(500).json({ error: "Migration failed" });
  }
});

// Seed the "Manufactured Home Trim-Out" checklist template.
// Safe to re-run — no-op if any templates already exist.
// Can be triggered without a browser session via X-Migration-Key header
// (see pre-auth mount in index.ts).
router.post("/seed-checklist-templates", async (_req, res) => {
  try {
    const existing = await db.select({ id: checklistTemplatesTable.id }).from(checklistTemplatesTable).limit(1);
    if (existing.length > 0) {
      res.json({ seeded: false, message: "Templates already exist — skipping" });
      return;
    }

    const [tmpl] = await db
      .insert(checklistTemplatesTable)
      .values({ name: "Manufactured Home Trim-Out", category: "Manufactured Homes", active: true })
      .returning({ id: checklistTemplatesTable.id });

    const sections = [
      {
        name: "Interior Trim Out",
        items: [
          "Pick up all supplies from Home Center",
          "Turn on heating or air if applicable",
          "Mud/Texture all drywall cracks",
          "Mud/Paint all ceiling cracks and dings",
          "Install trim and mate-line transition bars",
          "Fix loose trim throughout home",
          "Seam carpet if needed",
          "Paint all areas needing paint",
          "Square and install mate-line interior doors",
          "Square and adjust interior doors",
          "Caulk interior doors (Drywall Homes)",
          "Install interior light fixtures",
          "Hang ceiling fans or loose lighting",
          "Remove shipping materials",
          "Repair damaged wall panels",
          "Install toilet tank lids",
          "Caulk throughout where needed",
          "Install appliance shelves and remove strapping",
          "Remove appliance plastic and packaging",
          "Stack extra materials neatly",
          "Clean home completely",
          "Install window screens",
          "Turn off water main shutoff when done",
          "Turn checklist in with bill",
          "Turn in all needed parts",
        ],
      },
      {
        name: "Exterior Trim Out",
        items: [
          "Install vinyl siding on both ends",
          "Install soffit on ends",
          "Install fascia on ends",
          "Install drip edge",
          "Caulk all shipping material holes",
          "Paint fascia and repair shipping damage",
          "Install exterior light fixtures",
          "Turn off water main shutoff",
          "Leave breakers on and lights off",
          "Turn checklist in with bill",
          "Turn in all needed parts",
        ],
      },
      {
        name: "Vinyl Skirting",
        items: [
          "Install vinyl skirting",
          'Install bracing where needed (over 40")',
          "Install skirting door and leave key inside",
          "Turn checklist in with bill",
          "Turn in all needed parts",
        ],
      },
    ];

    let totalItems = 0;
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const [section] = await db
        .insert(checklistTemplateSectionsTable)
        .values({ templateId: tmpl.id, name: sec.name, sortOrder: si })
        .returning({ id: checklistTemplateSectionsTable.id });

      for (let ii = 0; ii < sec.items.length; ii++) {
        await db
          .insert(checklistTemplateItemsTable)
          .values({ sectionId: section.id, title: sec.items[ii], sortOrder: ii });
      }
      totalItems += sec.items.length;
    }

    console.log(`[admin/migrations] seed-checklist-templates: inserted template id=${tmpl.id}, ${sections.length} sections, ${totalItems} items`);
    res.json({ seeded: true, templateId: tmpl.id, sections: sections.length, items: totalItems });
  } catch (err) {
    console.error("[admin/migrations] seed-checklist-templates failed:", err);
    res.status(500).json({ error: "Seed failed" });
  }
});

// ── MFH Home Series schema migration (0041) ────────────────────────────────
// Applies the mfh_home_series restructure on production AFTER Phase 1 is live.
// Safe to re-run (guards A+B match post-merge.sh). Call via:
//   curl -X POST https://<domain>/api/admin/migrations/apply-0041-mfh-home-series \
//     -H "x-migration-key: $MIGRATION_KEY"
router.post("/apply-0041-mfh-home-series", async (_req, res) => {
  try {
    const checkResult = await db.execute(sql`
      SELECT
        EXISTS(SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='mfh_home_series')::boolean AS has_home_series,
        EXISTS(SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='mfh_models')::boolean      AS has_models
    `);
    const row = checkResult.rows[0] as { has_home_series: boolean; has_models: boolean };

    if (row.has_home_series) {
      console.log("[admin/migrations] apply-0041: already applied — mfh_home_series exists");
      res.json({ applied: false, message: "Already migrated — mfh_home_series exists" });
      return;
    }
    if (!row.has_models) {
      console.log("[admin/migrations] apply-0041: fresh DB — Drizzle push will handle schema");
      res.json({ applied: false, message: "Fresh DB — Drizzle push handles schema (no mfh_models to rename)" });
      return;
    }

    // Run the full migration as a single DO block (matches post-merge.sh logic exactly)
    await db.execute(sql`
      DO $$
      BEGIN
        -- A: Rename old mfh_models (priced series rows) to mfh_home_series
        ALTER TABLE mfh_models RENAME TO mfh_home_series;
        ALTER SEQUENCE mfh_models_id_seq RENAME TO mfh_home_series_id_seq;
        ALTER TABLE mfh_home_series RENAME CONSTRAINT mfh_models_pkey TO mfh_home_series_pkey;

        -- B: Remove the dealer link from the series
        ALTER TABLE mfh_home_series DROP COLUMN manufacturer_id;

        -- C: Make pricing guides global (drop manufacturer_id)
        ALTER TABLE mfh_pricing_guides DROP COLUMN manufacturer_id;

        -- D: Align the guide-items FK column name
        ALTER TABLE mfh_guide_items RENAME COLUMN model_id TO home_series_id;

        -- E: Create the genuine model level beneath a series
        CREATE TABLE mfh_models (
          id              serial    PRIMARY KEY,
          home_series_id  integer   NOT NULL REFERENCES mfh_home_series(id) ON DELETE CASCADE,
          name            text      NOT NULL,
          notes           text,
          active          boolean   NOT NULL DEFAULT true,
          introduced_year   integer,
          discontinued_year integer,
          created_at      timestamp NOT NULL DEFAULT now()
        );

        -- F: Remap job-level MFH references
        ALTER TABLE jobs ADD COLUMN mfh_series_id integer;
        UPDATE jobs SET mfh_series_id = mfh_model_id WHERE mfh_model_id IS NOT NULL;
        UPDATE jobs SET mfh_model_id = NULL;
        ALTER TABLE jobs DROP CONSTRAINT jobs_mfh_manufacturer_id_fkey;
        ALTER TABLE jobs DROP CONSTRAINT jobs_mfh_model_id_fkey;
        ALTER TABLE jobs DROP COLUMN mfh_manufacturer_id;
        ALTER TABLE jobs ADD CONSTRAINT jobs_mfh_series_id_fkey
          FOREIGN KEY (mfh_series_id) REFERENCES mfh_home_series(id) ON DELETE SET NULL;
        ALTER TABLE jobs ADD CONSTRAINT jobs_mfh_model_id_fkey
          FOREIGN KEY (mfh_model_id) REFERENCES mfh_models(id) ON DELETE SET NULL;

        -- G: Drop the now-obsolete manufacturer table
        DROP TABLE mfh_manufacturers;

        RAISE NOTICE '0041_mfh_home_series: migration applied';
      END
      $$
    `);

    console.log("[admin/migrations] apply-0041-mfh-home-series: migration applied successfully");
    res.json({ applied: true, message: "0041_mfh_home_series migration applied — mfh_home_series created, mfh_manufacturers dropped" });
  } catch (err) {
    console.error("[admin/migrations] apply-0041-mfh-home-series failed:", err);
    res.status(500).json({ error: "Migration failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
