import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  mileageLogsTable, expensesTable, businessesTable, recurringExpensesTable,
  checklistTemplatesTable, checklistTemplateSectionsTable, checklistTemplateItemsTable,
  mfhManufacturersTable, mfhModelsTable, jobsTable, clientsTable,
} from "@workspace/db/schema";
import { isNull, isNotNull, and, inArray, or, like, asc, sql, ilike, eq } from "drizzle-orm";

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

// Fix MFH data hierarchy.
//
// Background: Some builder entries were mistakenly stored as floor-plan *models* under a dealer
// manufacturer (e.g. "Southern", "Giles", "Norris" stored as models under "Clayton").
// This migration promotes those model rows to proper top-level manufacturers.
//
// Safety design:
//   • dryRun=true (default): returns a full analysis plan — no data is changed.
//   • dryRun=false: executes the migration inside a transaction.
//   • dealerManufacturerIds (optional): explicit list of manufacturer IDs to treat as dealers.
//     If omitted, auto-detection uses EXACT case-insensitive name match against client names
//     (safer than a substring match — avoids false positives).
//   • preservedModelIds (optional): model IDs that are legitimate floor-plan entries and should
//     NOT be promoted to manufacturers. They are re-parented to a "Uncategorized" manufacturer.
//
// Idempotent: safe to re-run — existing manufacturer entries are not duplicated (skipped if
// a name-match already exists), and the endpoint returns early if no suspects are found.
router.post("/fix-mfh-hierarchy", async (req, res) => {
  try {
    const {
      dryRun = true,
      dealerManufacturerIds,
      preservedModelIds = [],
    } = (req.body ?? {}) as {
      dryRun?: boolean;
      dealerManufacturerIds?: number[];
      preservedModelIds?: number[];
    };

    // ── Step 1: identify dealer manufacturers ───────────────────────────────
    const allManufacturers = await db.select().from(mfhManufacturersTable);
    let suspectManufacturers: typeof allManufacturers;

    if (dealerManufacturerIds && dealerManufacturerIds.length > 0) {
      // Explicit allowlist — most precise; bypasses auto-detection entirely.
      suspectManufacturers = allManufacturers.filter(m => dealerManufacturerIds.includes(m.id));
      const missing = dealerManufacturerIds.filter(id => !allManufacturers.some(m => m.id === id));
      if (missing.length > 0) return res.status(400).json({ error: `Manufacturer IDs not found: ${missing.join(", ")}` });
    } else {
      // Auto-detect: manufacturers whose name EXACTLY matches any client name (case-insensitive).
      // Exact match is intentionally stricter than substring to avoid false positives.
      const allClients = await db.select({ name: clientsTable.name }).from(clientsTable);
      const clientNameSet = new Set(allClients.map(c => c.name?.toLowerCase().trim() ?? ""));
      suspectManufacturers = allManufacturers.filter(m => clientNameSet.has(m.name.toLowerCase().trim()));
    }

    if (suspectManufacturers.length === 0) {
      return res.json({
        ok: true,
        dryRun,
        already_clean: true,
        message: "No dealer-named manufacturers found — already migrated or data is correct",
        plan: [],
      });
    }

    // ── Step 2: build migration plan (always runs, even in execute mode) ────
    const plan: Array<{
      dealerManufacturer: { id: number; name: string };
      modelsToPromote: Array<{ id: number; name: string; alreadyExistsAsBuilder: boolean }>;
      modelsToPreserve: Array<{ id: number; name: string }>;
      affectedJobIds: number[];
    }> = [];

    for (const suspect of suspectManufacturers) {
      const allModels = await db.select().from(mfhModelsTable)
        .where(eq(mfhModelsTable.manufacturerId, suspect.id));

      const toPromote = allModels.filter(m => !preservedModelIds.includes(m.id));
      const toPreserve = allModels.filter(m => preservedModelIds.includes(m.id));
      const promoteModelIds = toPromote.map(m => m.id);

      const modelsToPromote = await Promise.all(toPromote.map(async model => {
        const dup = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable)
          .where(ilike(mfhManufacturersTable.name, model.name)).limit(1);
        return { id: model.id, name: model.name, alreadyExistsAsBuilder: dup.length > 0 };
      }));

      // Collect all job IDs that reference this dealer or its promoted models.
      const jobRows: Array<{ id: number }> = [];
      if (promoteModelIds.length > 0) {
        const byModel = await db.select({ id: jobsTable.id }).from(jobsTable)
          .where(inArray(jobsTable.mfhModelId, promoteModelIds));
        jobRows.push(...byModel);
      }
      const byMfg = await db.select({ id: jobsTable.id }).from(jobsTable)
        .where(eq(jobsTable.mfhManufacturerId, suspect.id));
      jobRows.push(...byMfg);

      plan.push({
        dealerManufacturer: { id: suspect.id, name: suspect.name },
        modelsToPromote,
        modelsToPreserve: toPreserve.map(m => ({ id: m.id, name: m.name })),
        affectedJobIds: [...new Set(jobRows.map(j => j.id))],
      });
    }

    // ── Step 3: return plan if dry-run ──────────────────────────────────────
    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        message: "Dry-run complete — pass { dryRun: false } to execute. Review affectedJobIds; those jobs will have their builder/model cleared and will need manual re-assignment.",
        plan,
      });
    }

    // ── Step 4: execute inside a transaction ────────────────────────────────
    const result: {
      promoted: string[];
      skipped: string[];
      preserved: string[];
      deletedDealers: string[];
      clearedJobIds: number[];
    } = { promoted: [], skipped: [], preserved: [], deletedDealers: [], clearedJobIds: [] };

    await db.transaction(async (tx) => {
      for (const item of plan) {
        const { dealerManufacturer, modelsToPromote, modelsToPreserve, affectedJobIds } = item;
        const promoteModelIds = modelsToPromote.map(m => m.id);

        // Promote models → manufacturers (skip if already exists)
        for (const model of modelsToPromote) {
          if (!model.alreadyExistsAsBuilder) {
            await tx.insert(mfhManufacturersTable).values({ name: model.name });
            result.promoted.push(model.name);
          } else {
            result.skipped.push(model.name);
          }
        }

        // Re-parent any preserved (legitimate floor-plan) models to "Uncategorized"
        if (modelsToPreserve.length > 0) {
          const [uncategorized] = await tx.insert(mfhManufacturersTable)
            .values({ name: "Uncategorized" })
            .onConflictDoNothing()
            .returning();
          const uncategorizedId = uncategorized?.id
            ?? (await tx.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable).where(ilike(mfhManufacturersTable.name, "Uncategorized")).limit(1))[0]?.id;
          if (uncategorizedId) {
            await tx.execute(
              sql`UPDATE mfh_models SET manufacturer_id = ${uncategorizedId} WHERE id = ANY(ARRAY[${sql.raw(modelsToPreserve.map(m => m.id).join(","))}]::integer[])`
            );
          }
          result.preserved.push(...modelsToPreserve.map(m => m.name));
        }

        // Null-clear MFH fields on all affected jobs (must happen before deleting models)
        if (promoteModelIds.length > 0) {
          await tx.execute(
            sql`UPDATE jobs SET mfh_manufacturer_id = NULL, mfh_model_id = NULL WHERE mfh_model_id = ANY(ARRAY[${sql.raw(promoteModelIds.join(","))}]::integer[])`
          );
        }
        await tx.execute(
          sql`UPDATE jobs SET mfh_manufacturer_id = NULL, mfh_model_id = NULL WHERE mfh_manufacturer_id = ${dealerManufacturer.id}`
        );
        result.clearedJobIds.push(...affectedJobIds);

        // Delete promoted model rows (they now exist as manufacturers)
        if (promoteModelIds.length > 0) {
          await tx.delete(mfhModelsTable).where(inArray(mfhModelsTable.id, promoteModelIds));
        }

        // Delete the dealer manufacturer entry
        await tx.delete(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, dealerManufacturer.id));
        result.deletedDealers.push(dealerManufacturer.name);
      }
    });

    result.clearedJobIds = [...new Set(result.clearedJobIds)];
    console.log(`[admin/migrations] fix-mfh-hierarchy executed:`, JSON.stringify(result));
    res.json({ ok: true, dryRun: false, result });
  } catch (err) {
    console.error("[admin/migrations] fix-mfh-hierarchy failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

export default router;
