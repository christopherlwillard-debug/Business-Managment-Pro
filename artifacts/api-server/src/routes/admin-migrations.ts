import { Router, Request, Response } from "express";
import { db, mfhManufacturersTable, mfhModelsTable, jobsTable, clientsTable, subPaymentRecordsTable, productionServiceTypesTable, expensesTable } from "@workspace/db";
import { jobSubcontractorsTable, invoicesTable, clientBillingProfilesTable, businessesTable } from "@workspace/db/schema";
import { isNull, and, inArray, sql, ilike, eq, ne } from "drizzle-orm";

const router = Router();

// ── All routes require MIGRATION_KEY header auth (set in index.ts) ────────────
//
// POLICY: Remove an endpoint from this file once you have confirmed it has run
// successfully in production. One-time fixes and DDL migrations that are already
// applied to the production schema have no reason to stay mounted permanently.
// Keep only:
//   • Genuinely re-runnable operations (idempotent recalculations, re-seeds)
//   • Diagnostic tools with ongoing value
//   • Bulk-cleanup tools with safety guards that may be needed again
// ─────────────────────────────────────────────────────────────────────────────

// Repair the confirmed General Contracting ownership of Wil-1047 and Wil-1049.
// This is intentionally exact, dry-run by default, and safe to rerun.
router.post("/repair-wil-1047-1049-ownership", async (req: Request, res: Response) => {
  try {
    const { dryRun = true } = (req.body ?? {}) as { dryRun?: boolean };
    const [business] = await db.select({
      id: businessesTable.id,
      slug: businessesTable.slug,
      name: businessesTable.name,
    }).from(businessesTable)
      .where(eq(businessesTable.slug, "general_contracting"))
      .limit(1);
    if (!business) return res.status(409).json({ error: "General Contracting business was not found." });

    const targetNumbers = ["Wil-1047", "Wil-1049"];
    const invoiceRows = await db.select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      jobId: invoicesTable.jobId,
      businessId: invoicesTable.businessId,
      businessLine: invoicesTable.businessLine,
    }).from(invoicesTable)
      .where(inArray(invoicesTable.invoiceNumber, targetNumbers));
    if (invoiceRows.length !== 2 || new Set(invoiceRows.map(row => row.invoiceNumber)).size !== 2) {
      return res.status(409).json({
        error: "Expected exactly one Wil-1047 and one Wil-1049 invoice.",
        found: invoiceRows.map(row => ({ id: row.id, invoiceNumber: row.invoiceNumber })),
      });
    }
    const invoice1049 = invoiceRows.find(row => row.invoiceNumber === "Wil-1049");
    if (!invoice1049?.jobId) {
      return res.status(409).json({ error: "Wil-1049 is not linked to a job." });
    }
    const [job1049] = await db.select({
      id: jobsTable.id,
      businessId: jobsTable.businessId,
      businessLine: jobsTable.businessLine,
    }).from(jobsTable)
      .where(eq(jobsTable.id, invoice1049.jobId))
      .limit(1);
    if (!job1049) return res.status(409).json({ error: "Wil-1049's linked job was not found." });

    const conflicting = [
      ...invoiceRows
        .filter(row => row.businessId != null && row.businessId !== business.id)
        .map(row => `invoice ${row.invoiceNumber}`),
      ...(job1049.businessId != null && job1049.businessId !== business.id ? ["Wil-1049 job"] : []),
    ];
    if (conflicting.length > 0) {
      return res.status(409).json({
        error: "A target record is already owned by another business.",
        conflicting,
      });
    }

    const plan = {
      business,
      invoices: invoiceRows.map(row => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        from: { businessId: row.businessId, businessLine: row.businessLine },
        to: { businessId: business.id, businessLine: business.slug },
      })),
      job: {
        id: job1049.id,
        from: { businessId: job1049.businessId, businessLine: job1049.businessLine },
        to: { businessId: business.id, businessLine: business.slug },
      },
    };
    if (dryRun) return res.json({ ok: true, dryRun: true, plan });

    await db.transaction(async tx => {
      await tx.update(invoicesTable)
        .set({ businessId: business.id, businessLine: business.slug })
        .where(inArray(invoicesTable.id, invoiceRows.map(row => row.id)));
      await tx.update(jobsTable)
        .set({ businessId: business.id, businessLine: business.slug })
        .where(eq(jobsTable.id, job1049.id));
    });
    console.log("[admin/migrations] repaired Wil-1047/Wil-1049 General Contracting ownership", JSON.stringify(plan));
    res.json({ ok: true, dryRun: false, updatedInvoices: invoiceRows.length, updatedJobs: 1, plan });
  } catch (err) {
    console.error("[admin/migrations] repair-wil-1047-1049-ownership failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Recompute sub payment statuses for records where advances were applied but status is still "partial"
router.post("/recompute-sub-payment-status", async (_req: Request, res: Response) => {
  try {
    // Find all partial job_subcontractors records
    const partialRows = await db
      .select({
        jobId: jobSubcontractorsTable.jobId,
        subId: jobSubcontractorsTable.subcontractorId,
        amountOwed: jobSubcontractorsTable.amountOwed,
      })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.paymentStatus, "partial"));

    let fixed = 0;
    for (const row of partialRows) {
      const [sumRow] = await db
        .select({
          cashPaid: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), '0')`,
          advancesApplied: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.advanceAmount}), '0')`,
        })
        .from(subPaymentRecordsTable)
        .where(and(
          eq(subPaymentRecordsTable.jobId, row.jobId),
          eq(subPaymentRecordsTable.subcontractorId, row.subId),
          sql`(${subPaymentRecordsTable.isReversal} IS NULL OR ${subPaymentRecordsTable.isReversal} = false)`,
        ));
      const cashPaid = parseFloat(sumRow?.cashPaid ?? "0");
      const advances = parseFloat(sumRow?.advancesApplied ?? "0");
      const effectivePaid = cashPaid + advances;
      const owedAmt = row.amountOwed != null ? parseFloat(row.amountOwed) : null;
      if (owedAmt != null && effectivePaid >= owedAmt - 0.005) {
        await db.update(jobSubcontractorsTable)
          .set({ paymentStatus: "paid" })
          .where(and(
            eq(jobSubcontractorsTable.jobId, row.jobId),
            eq(jobSubcontractorsTable.subcontractorId, row.subId),
          ));
        fixed++;
      }
    }
    res.json({ ok: true, scanned: partialRows.length, fixed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Migration failed" });
  }
});

// Categorize production service types by applicability (production vs service).
//
// Background: the "Services Included" list on MH Production jobs used to show
// every catalog item, including service/warranty-only items. The applies_to
// column (default 'production') now scopes each item. This migration flips the
// known service-only items (Service Call, Mileage, Materials, Warranty Repair)
// to applies_to='service', matched by itemKey first, then by normalized name
// for legacy rows without an itemKey.
//
// dryRun=true (default) returns the plan without changing data. Idempotent:
// rows already set to 'service' are skipped.
router.post("/categorize-service-types", async (req: Request, res: Response) => {
  try {
    const { dryRun = true } = (req.body ?? {}) as { dryRun?: boolean };

    const SERVICE_ITEM_KEYS = new Set(["service_call", "mileage", "materials", "warranty_repair"]);
    const SERVICE_NAMES = new Set(["service call", "mileage", "materials", "warranty repair"]);
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

    const rows = await db.select({
      id: productionServiceTypesTable.id,
      itemKey: productionServiceTypesTable.itemKey,
      name: productionServiceTypesTable.name,
      appliesTo: productionServiceTypesTable.appliesTo,
    }).from(productionServiceTypesTable);

    const toService = rows.filter(r =>
      r.appliesTo !== "service" &&
      ((r.itemKey && SERVICE_ITEM_KEYS.has(r.itemKey)) || (!r.itemKey && SERVICE_NAMES.has(norm(r.name))))
    );

    const plan = toService.map(r => ({ id: r.id, itemKey: r.itemKey, name: r.name, from: r.appliesTo, to: "service" }));

    if (toService.length === 0) {
      return res.json({ ok: true, dryRun, already_clean: true, message: "All service-only items are already categorized.", plan: [] });
    }

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        message: "Dry-run — no data changed. Pass { dryRun: false } to set applies_to='service' on the listed rows.",
        plan,
      });
    }

    await db.update(productionServiceTypesTable)
      .set({ appliesTo: "service" })
      .where(inArray(productionServiceTypesTable.id, toService.map(r => r.id)));

    console.log(`[admin/migrations] categorize-service-types executed:`, JSON.stringify(plan));
    res.json({ ok: true, dryRun: false, updated: toService.length, plan });
  } catch (err) {
    console.error("[admin/migrations] categorize-service-types failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Seed Clayton Homes of Evansville client + Factory Billback billing profile.
// Idempotent: skips client creation if already exists, skips profile if already present.
router.post("/seed-clayton-billback", async (_req: Request, res: Response) => {
  try {
    // 1. Upsert client
    let clientId: number;
    const existing = await db.select({
      id: clientsTable.id,
      mileageSurchargeEnabled: clientsTable.mileageSurchargeEnabled,
      mileageSurchargeTriggerMiles: clientsTable.mileageSurchargeTriggerMiles,
      mileageSurchargeDailyRate: clientsTable.mileageSurchargeDailyRate,
    })
      .from(clientsTable)
      .where(ilike(clientsTable.name, "Clayton Homes of Evansville"))
      .limit(1);

    if (existing.length > 0) {
      clientId = existing[0].id;
      await db.update(clientsTable)
        .set({
          mileageSurchargeEnabled: existing[0].mileageSurchargeEnabled || true,
          mileageSurchargeTriggerMiles: existing[0].mileageSurchargeTriggerMiles ?? "60",
          mileageSurchargeDailyRate: existing[0].mileageSurchargeDailyRate ?? "150",
        })
        .where(eq(clientsTable.id, clientId));
    } else {
      const [inserted] = await db.insert(clientsTable).values({
        name: "Clayton Homes of Evansville",
        address: "19410 US-41",
        city: "Evansville",
        state: "IN",
        zip: "47725",
        mileageSurchargeEnabled: true,
        mileageSurchargeTriggerMiles: "60",
        mileageSurchargeDailyRate: "150",
      }).returning({ id: clientsTable.id });
      clientId = inserted.id;
    }

    // 2. Insert billing profile if not already present
    const existingProfile = await db.select({ id: clientBillingProfilesTable.id })
      .from(clientBillingProfilesTable)
      .where(and(
        eq(clientBillingProfilesTable.clientId, clientId),
        ilike(clientBillingProfilesTable.name, "Factory Billback"),
      ))
      .limit(1);

    let profileAction = "skipped";
    if (existingProfile.length === 0) {
      await db.insert(clientBillingProfilesTable).values({
        clientId,
        name: "Factory Billback",
        repairRate1Tech: "33.00",
        repairRate2Tech: "50.00",
        driveRate1Tech: "15.00",
        driveRate2Tech: "30.00",
        mileageRate: "0.35",
        partsReimbursable: true,
        defaultTechCount: 2,
        billingNotes: "All work must be completed before billing. Pictures required for all repairs — send to Michelle/Service @ (812)215-9619. Mileage calculated from home center to customer site. No mileage on contracted work unless >60 miles from Home Center ($150/Day).",
        active: true,
      });
      profileAction = "created";
    }

    console.log(`[admin/migrations] seed-clayton-billback: clientId=${clientId}, profile=${profileAction}`);
    res.json({
      ok: true,
      clientId,
      clientAction: existing.length > 0 ? "existing" : "created",
      profileAction,
    });
  } catch (err) {
    console.error("[admin/migrations] seed-clayton-billback failed:", err);
    res.status(500).json({ error: "Seed failed", detail: String(err) });
  }
});

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

// ── Diagnostic: list all unnumbered draft invoices ────────────────────────────
router.get("/diag-draft-invoices", async (_req: Request, res: Response) => {
  try {
    const drafts = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        total: invoicesTable.total,
        issueDate: invoicesTable.issueDate,
        createdAt: invoicesTable.createdAt,
        clientId: invoicesTable.clientId,
        jobId: invoicesTable.jobId,
        clientName: clientsTable.name,
        lineItems: invoicesTable.lineItems,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(clientsTable.id, invoicesTable.clientId))
      .where(isNull(invoicesTable.invoiceNumber));
    res.json({ count: drafts.length, drafts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Delete a specific draft/ghost invoice by id ────────────────────────────────
router.delete("/cleanup-draft-invoice/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [inv] = await db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, status: invoicesTable.status })
      .from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.invoiceNumber) return res.status(400).json({ error: `Invoice has invoice number ${inv.invoiceNumber} — only unnumbered ghost invoices can be deleted here.` });
    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    res.json({ deleted: true, id, wasStatus: inv.status });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Bulk delete ghost draft invoices (status=draft, invoice_number IS NULL).
// A ghost invoice is an unnumbered draft that has no corresponding active/issued invoice
// on its job — it was never shown to the customer and can be safely deleted.
// Invoices whose job already has a real (numbered or non-draft) invoice are left alone.
// Idempotent: safe to call multiple times.
router.post("/delete-ghost-draft-invoices", async (_req: Request, res: Response) => {
  try {
    // Find all unnumbered draft invoices
    const ghosts = await db
      .select({
        id: invoicesTable.id,
        jobId: invoicesTable.jobId,
        clientId: invoicesTable.clientId,
        total: invoicesTable.total,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "draft"), isNull(invoicesTable.invoiceNumber)));

    if (ghosts.length === 0) {
      return res.json({ ok: true, deleted: 0, skipped: 0, details: [] });
    }

    const deleted: number[] = [];
    const skipped: { id: number; reason: string }[] = [];

    for (const ghost of ghosts) {
      if (!ghost.jobId) {
        // No job link — definitely orphaned
        await db.delete(invoicesTable).where(eq(invoicesTable.id, ghost.id));
        deleted.push(ghost.id);
        continue;
      }

      // Check whether this job has any other non-draft, non-cancelled invoices
      const [realInvoice] = await db
        .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
        .from(invoicesTable)
        .where(and(
          eq(invoicesTable.jobId, ghost.jobId),
          ne(invoicesTable.id, ghost.id),
          ne(invoicesTable.status, "draft"),
          ne(invoicesTable.status, "cancelled"),
        ))
        .limit(1);

      if (realInvoice) {
        // Job has a real invoice — the draft is a ghost; delete it
        await db.delete(invoicesTable).where(eq(invoicesTable.id, ghost.id));
        deleted.push(ghost.id);
      } else {
        // This unnumbered draft is the only invoice on the job — it may be intentional
        skipped.push({ id: ghost.id, reason: `Only invoice on job ${ghost.jobId} — kept` });
      }
    }

    console.log(`[admin/migrations] delete-ghost-draft-invoices: deleted=${deleted.length}, skipped=${skipped.length}`);
    res.json({ ok: true, deleted: deleted.length, skipped: skipped.length, deletedIds: deleted, details: skipped });
  } catch (err) {
    console.error("[admin/migrations] delete-ghost-draft-invoices failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Fix stale mileage expense amounts — Aug 2026 forensic repair.
// After the Aug 2026 manual mileage correction updated mileage_logs miles+deduction_amount,
// the three linked expense rows were not updated. This endpoint corrects expenses.amount
// to match mileage_logs.deduction_amount for Feb/Mar/May 2026.
// Idempotent: skips rows whose amount already equals the correct value.
// POLICY: Remove after confirmed in production.
router.post("/fix-mileage-expense-amounts-aug2026", async (_req: Request, res: Response) => {
  try {
    const corrections = [
      { expId: 9,  month: "Feb", oldAmt: "79.75",  newAmt: "80.55",  newDesc: "Mileage: 7 trips total for February (111.10 mi)" },
      { expId: 38, month: "Mar", oldAmt: "237.08", newAmt: "200.61", newDesc: "Mileage: 37 trips (276.70 mi)" },
      { expId: 87, month: "May", oldAmt: "673.52", newAmt: "674.03", newDesc: "Mileage: MileIQ monthly total — 65 business trips (929.70 mi)" },
    ];

    const applied: typeof corrections = [];
    const skipped: typeof corrections = [];

    for (const c of corrections) {
      const [row] = await db
        .select({ amount: expensesTable.amount, description: expensesTable.description })
        .from(expensesTable)
        .where(eq(expensesTable.id, c.expId));

      if (!row) {
        console.warn(`[fix-mileage-expense-amounts] expId=${c.expId} not found — skipped`);
        skipped.push(c);
        continue;
      }

      if (parseFloat(row.amount ?? "0").toFixed(2) === c.newAmt) {
        skipped.push(c);
        continue;
      }

      await db
        .update(expensesTable)
        .set({ amount: c.newAmt, description: c.newDesc })
        .where(eq(expensesTable.id, c.expId));

      console.log(`[fix-mileage-expense-amounts] expId=${c.expId} (${c.month}): $${c.oldAmt} → $${c.newAmt}`);
      applied.push(c);
    }

    const result = {
      ok: true,
      applied: applied.map(c => ({ expId: c.expId, month: c.month, newAmount: c.newAmt })),
      skipped: skipped.map(c => ({ expId: c.expId, month: c.month, reason: "already correct or not found" })),
    };
    console.log("[fix-mileage-expense-amounts] complete:", JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error("[fix-mileage-expense-amounts] failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

export default router;
