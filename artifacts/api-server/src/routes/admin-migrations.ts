import { Router, Request, Response } from "express";
import { db, mfhManufacturersTable, mfhModelsTable, jobsTable, clientsTable, mileageLogsTable, expensesTable, subPaymentRecordsTable } from "@workspace/db";
import { isNull, isNotNull, and, inArray, or, like, asc, sql, ilike, eq } from "drizzle-orm";

const router = Router();

// ── All routes require MIGRATION_KEY header auth (set in index.ts) ────────────

// Remove orphan mileage logs
router.post("/remove-orphan-mileage", async (_req: Request, res: Response) => {
  try {
    const orphanIds = (
      await db.select({ id: mileageLogsTable.id }).from(mileageLogsTable)
        .where(isNull(mileageLogsTable.jobId))
    ).map(r => r.id);
    if (orphanIds.length === 0) return res.json({ ok: true, removed: 0 });
    await db.delete(mileageLogsTable)
      .where(inArray(mileageLogsTable.id, orphanIds));
    res.json({ ok: true, removed: orphanIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Migration failed" });
  }
});

// Remove pay-worker expenses (obsolete since sub_payment_records became the sole ledger)
router.delete("/delete-payworker-expenses", async (_req: Request, res: Response) => {
  try {
    const linkedExpenseIds = (
      await db.select({ expenseId: subPaymentRecordsTable.expenseId })
        .from(subPaymentRecordsTable)
        .where(isNotNull(subPaymentRecordsTable.expenseId))
    ).map(r => r.expenseId!);

    if (linkedExpenseIds.length === 0) return res.json({ ok: true, deleted: 0 });

    await db.delete(expensesTable)
      .where(inArray(expensesTable.id, linkedExpenseIds));

    res.json({ ok: true, deleted: linkedExpenseIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── (add more one-time migration endpoints above this line) ───────────────────

// Seed MFH manufacturers if none exist
router.post("/seed-mfh-manufacturers", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable).limit(1);
    if (existing.length > 0) return res.json({ ok: true, skipped: true, message: "Already seeded" });

    const names = [
      "Southern", "Giles", "Norris", "Destiny", "Redman",
      "Champion", "Fleetwood", "Clayton", "Skyline", "Palm Harbor",
    ];
    for (const name of names) {
      await db.insert(mfhManufacturersTable).values({ name }).onConflictDoNothing();
    }
    res.json({ ok: true, seeded: names.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Seed failed" });
  }
});

// Fix MFH data hierarchy.
//
// Background: Some builder entries were mistakenly stored as floor-plan *models* under a dealer
// manufacturer (e.g. "Southern", "Giles", "Norris" stored as models under "Clayton").
// This migration promotes those wrongly-stored model rows to proper top-level manufacturers.
//
// Safety design
// ─────────────
// • dryRun=true (default): returns a full classified plan — NO data changes.
// • dryRun=false: executes inside a single DB transaction (rolls back fully on any error).
// • dealerManufacturerIds (optional): explicit list of manufacturer IDs to treat as dealers.
//   Omit to use auto-detection (exact case-insensitive name match against client names).
//   If auto-detection finds nothing, the response includes all manufacturer IDs for inspection.
// • preservedModelIds (optional): model IDs that are legitimate floor-plan entries; these are
//   re-parented to "Uncategorized" instead of being promoted+deleted.
//
// Job classification (key for data safety)
// ─────────────────────────────────────────
// • Promoted model jobs  → mfh_manufacturer_id AND mfh_model_id set to NULL (invalid ref).
// • Preserved model jobs → mfh_manufacturer_id updated to "Uncategorized"; mfh_model_id kept.
// • Manufacturer-only    → mfh_manufacturer_id set to NULL (no model was set anyway).
//
// Pre-delete gate: before deleting the dealer manufacturer row, the transaction verifies
// zero jobs still reference it. If any remain, the transaction aborts and rolls back fully.
//
// Idempotent: existing manufacturer name-matches are skipped (not duplicated).
router.post("/fix-mfh-hierarchy", async (req: Request, res: Response) => {
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

    // ── Step 1: identify dealer manufacturers ─────────────────────────────
    const allManufacturers = await db.select().from(mfhManufacturersTable);
    let suspectManufacturers: typeof allManufacturers;

    if (dealerManufacturerIds && dealerManufacturerIds.length > 0) {
      // Explicit allowlist — bypasses auto-detection entirely (most precise).
      const missing = dealerManufacturerIds.filter(id => !allManufacturers.some(m => m.id === id));
      if (missing.length > 0) {
        return res.status(400).json({ error: `Manufacturer IDs not found: ${missing.join(", ")}` });
      }
      suspectManufacturers = allManufacturers.filter(m => dealerManufacturerIds.includes(m.id));
    } else {
      // Auto-detect: exact case-insensitive name match against client names.
      // Intentionally stricter than substring to avoid false positives.
      const allClients = await db.select({ name: clientsTable.name }).from(clientsTable);
      const clientNameSet = new Set(allClients.map(c => c.name?.toLowerCase().trim() ?? ""));
      suspectManufacturers = allManufacturers.filter(m => clientNameSet.has(m.name.toLowerCase().trim()));
    }

    if (suspectManufacturers.length === 0) {
      return res.json({
        ok: true,
        dryRun,
        already_clean: true,
        message:
          "No dealer-named manufacturers found via auto-detection. " +
          "If the problem persists, inspect allManufacturers and pass dealerManufacturerIds[] explicitly.",
        allManufacturers: allManufacturers.map(m => ({ id: m.id, name: m.name })),
        plan: [],
      });
    }

    // ── Step 2: build classified migration plan ────────────────────────────
    type PlanEntry = {
      dealerManufacturer: { id: number; name: string };
      modelsToPromote: Array<{ id: number; name: string; alreadyExistsAsBuilder: boolean }>;
      modelsToPreserve: Array<{ id: number; name: string }>;
      jobsToClear: Array<{ id: number; reason: string }>;
      jobsToRemap: Array<{ id: number; toManufacturer: "Uncategorized" }>;
    };
    const plan: PlanEntry[] = [];

    for (const suspect of suspectManufacturers) {
      const allModels = await db.select().from(mfhModelsTable)
        .where(eq(mfhModelsTable.manufacturerId, suspect.id));

      const toPromote = allModels.filter(m => !preservedModelIds.includes(m.id));
      const toPreserve = allModels.filter(m => preservedModelIds.includes(m.id));
      const promoteModelIds = toPromote.map(m => m.id);
      const preserveModelIds = toPreserve.map(m => m.id);

      const modelsToPromote = await Promise.all(toPromote.map(async model => {
        const dup = await db.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable)
          .where(ilike(mfhManufacturersTable.name, model.name)).limit(1);
        return { id: model.id, name: model.name, alreadyExistsAsBuilder: dup.length > 0 };
      }));

      // Classify jobs by which model they reference (or manufacturer-only).
      const jobsToClear: PlanEntry["jobsToClear"] = [];
      const jobsToRemap: PlanEntry["jobsToRemap"] = [];
      const classifiedJobIds = new Set<number>();

      // Preserved-model jobs → remap (manufacturer updated to Uncategorized, model kept)
      if (preserveModelIds.length > 0) {
        const rows = await db.select({ id: jobsTable.id })
          .from(jobsTable).where(inArray(jobsTable.mfhModelId, preserveModelIds));
        for (const r of rows) {
          jobsToRemap.push({ id: r.id, toManufacturer: "Uncategorized" });
          classifiedJobIds.add(r.id);
        }
      }

      // Promoted-model jobs → clear both fields (model no longer exists as a model)
      if (promoteModelIds.length > 0) {
        const rows = await db.select({ id: jobsTable.id, mfhModelId: jobsTable.mfhModelId })
          .from(jobsTable).where(inArray(jobsTable.mfhModelId, promoteModelIds));
        for (const r of rows) {
          const modelName = toPromote.find(m => m.id === r.mfhModelId)?.name ?? "unknown";
          jobsToClear.push({ id: r.id, reason: `model "${modelName}" was a wrongly-stored builder` });
          classifiedJobIds.add(r.id);
        }
      }

      // Manufacturer-only (or unclassified) jobs → clear both fields
      const remaining = await db.select({ id: jobsTable.id })
        .from(jobsTable).where(eq(jobsTable.mfhManufacturerId, suspect.id));
      for (const r of remaining) {
        if (!classifiedJobIds.has(r.id)) {
          jobsToClear.push({ id: r.id, reason: `manufacturer "${suspect.name}" set but no model — ref will be invalid after migration` });
        }
      }

      plan.push({
        dealerManufacturer: { id: suspect.id, name: suspect.name },
        modelsToPromote,
        modelsToPreserve: toPreserve.map(m => ({ id: m.id, name: m.name })),
        jobsToClear,
        jobsToRemap,
      });
    }

    // ── Step 3: dry-run returns plan for review ───────────────────────────
    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        message:
          "Dry-run — no data changed. Review the plan carefully, then pass { dryRun: false } to execute. " +
          "jobsToClear will lose their MFH assignment and need manual re-selection. " +
          "jobsToRemap keep their model but are re-parented to 'Uncategorized'.",
        plan,
      });
    }

    // ── Step 4: execute inside a single transaction ───────────────────────
    const result = {
      promoted: [] as string[],
      skipped: [] as string[],
      preserved: [] as string[],
      deletedDealers: [] as string[],
      clearedJobIds: [] as number[],
      remappedJobIds: [] as number[],
    };

    await db.transaction(async (tx) => {
      for (const item of plan) {
        const { dealerManufacturer, modelsToPromote, modelsToPreserve, jobsToClear, jobsToRemap } = item;
        const promoteModelIds = modelsToPromote.map(m => m.id);
        const preserveModelIds = modelsToPreserve.map(m => m.id);

        // 4a. Create "Uncategorized" if preserved models need re-parenting.
        let uncategorizedId: number | null = null;
        if (preserveModelIds.length > 0) {
          const [ins] = await tx.insert(mfhManufacturersTable)
            .values({ name: "Uncategorized" })
            .onConflictDoNothing()
            .returning();
          uncategorizedId = ins?.id
            ?? (await tx.select({ id: mfhManufacturersTable.id }).from(mfhManufacturersTable)
              .where(ilike(mfhManufacturersTable.name, "Uncategorized")).limit(1))[0]?.id
            ?? null;
        }

        // 4b. Promote wrongly-stored models to top-level manufacturers.
        for (const model of modelsToPromote) {
          if (!model.alreadyExistsAsBuilder) {
            await tx.insert(mfhManufacturersTable).values({ name: model.name });
            result.promoted.push(model.name);
          } else {
            result.skipped.push(model.name);
          }
        }

        // 4c. Re-parent preserved floor-plan models to "Uncategorized".
        if (preserveModelIds.length > 0 && uncategorizedId !== null) {
          await tx.execute(
            sql`UPDATE mfh_models SET manufacturer_id = ${uncategorizedId} WHERE id = ANY(ARRAY[${sql.raw(preserveModelIds.join(","))}]::integer[])`
          );
          result.preserved.push(...modelsToPreserve.map(m => m.name));
        }

        // 4d. Remap preserved-model jobs: update manufacturer only, keep model intact.
        if (jobsToRemap.length > 0 && uncategorizedId !== null) {
          const remapIds = jobsToRemap.map(j => j.id);
          await tx.execute(
            sql`UPDATE jobs SET mfh_manufacturer_id = ${uncategorizedId} WHERE id = ANY(ARRAY[${sql.raw(remapIds.join(","))}]::integer[])`
          );
          result.remappedJobIds.push(...remapIds);
        }

        // 4e. Clear promoted-model jobs and manufacturer-only jobs (both fields to NULL).
        if (jobsToClear.length > 0) {
          const clearIds = jobsToClear.map(j => j.id);
          await tx.execute(
            sql`UPDATE jobs SET mfh_manufacturer_id = NULL, mfh_model_id = NULL WHERE id = ANY(ARRAY[${sql.raw(clearIds.join(","))}]::integer[])`
          );
          result.clearedJobIds.push(...clearIds);
        }

        // 4f. Delete promoted model rows (their names now exist as manufacturers).
        if (promoteModelIds.length > 0) {
          await tx.delete(mfhModelsTable).where(inArray(mfhModelsTable.id, promoteModelIds));
        }

        // 4g. Pre-delete safety gate: confirm zero jobs still reference the dealer manufacturer.
        //     If any remain (e.g. remapped jobs still point to old manufacturer), abort.
        const stillReferenced = await tx.select({ id: jobsTable.id })
          .from(jobsTable).where(eq(jobsTable.mfhManufacturerId, dealerManufacturer.id)).limit(1);
        if (stillReferenced.length > 0) {
          throw new Error(
            `Safety gate: manufacturer "${dealerManufacturer.name}" (id=${dealerManufacturer.id}) ` +
            `still has job references after clearing. Transaction rolled back — no data changed.`
          );
        }

        // 4h. Safe to delete the dealer manufacturer.
        await tx.delete(mfhManufacturersTable).where(eq(mfhManufacturersTable.id, dealerManufacturer.id));
        result.deletedDealers.push(dealerManufacturer.name);
      }
    });

    result.clearedJobIds = [...new Set(result.clearedJobIds)];
    result.remappedJobIds = [...new Set(result.remappedJobIds)];
    console.log(`[admin/migrations] fix-mfh-hierarchy executed:`, JSON.stringify(result));
    res.json({ ok: true, dryRun: false, result });
  } catch (err) {
    console.error("[admin/migrations] fix-mfh-hierarchy failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

export default router;
