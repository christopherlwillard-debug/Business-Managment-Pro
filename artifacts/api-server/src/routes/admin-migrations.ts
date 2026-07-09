import { Router, Request, Response } from "express";
import { db, mfhManufacturersTable, mfhModelsTable, jobsTable, clientsTable, mileageLogsTable, expensesTable, subPaymentRecordsTable, productionServiceTypesTable } from "@workspace/db";
import { invoicesTable, materialListsTable, materialListItemsTable } from "@workspace/db/schema";
import { isNull, isNotNull, and, inArray, or, like, asc, sql, ilike, eq } from "drizzle-orm";
import { recalcImportExpenses } from "./mileage";
import { syncMaterialsToJobInvoice } from "./material-lists";

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

// Consolidate per-trip mileage import expenses into one monthly aggregate per import.
//
// Background: CSV imports used to create one expense per drive (~70+ for June 2026).
// The new model creates ONE expense per month per import ("<Month> <Year> IRS Mileage",
// linked via expenses.mileage_import_id). This migration converts existing imports:
//   1. Finds imported logs that still carry a per-trip expense (import_id AND expense_id set)
//   2. Nulls the logs' expense_id and deletes those per-trip expenses (in a transaction)
//   3. Recalculates the monthly aggregate expense(s) for each affected import
//
// dryRun=true (default) returns the plan without changing data. Idempotent: once
// converted, no logs match the criteria and the endpoint reports nothing to do.
router.post("/consolidate-mileage-expenses", async (req: Request, res: Response) => {
  try {
    const { dryRun = true } = (req.body ?? {}) as { dryRun?: boolean };

    const logs = await db
      .select({
        id: mileageLogsTable.id,
        date: mileageLogsTable.date,
        miles: mileageLogsTable.miles,
        importId: mileageLogsTable.importId,
        expenseId: mileageLogsTable.expenseId,
        classification: mileageLogsTable.classification,
      })
      .from(mileageLogsTable)
      .where(and(
        isNotNull(mileageLogsTable.importId),
        isNotNull(mileageLogsTable.expenseId),
      ));

    if (logs.length === 0) {
      return res.json({ ok: true, dryRun, already_clean: true, message: "No per-trip import expenses found — nothing to consolidate.", plan: [] });
    }

    // Group by import, then by month, for the plan report
    const byImport = new Map<number, Map<string, { trips: number; miles: number; expenseIds: number[] }>>();
    for (const log of logs) {
      const importId = log.importId!;
      const ym = (log.date ?? "").slice(0, 7);
      const months = byImport.get(importId) ?? new Map();
      const entry = months.get(ym) ?? { trips: 0, miles: 0, expenseIds: [] };
      entry.trips += 1;
      entry.miles += parseFloat(log.miles ?? "0");
      entry.expenseIds.push(log.expenseId!);
      months.set(ym, entry);
      byImport.set(importId, months);
    }

    // Sum the amounts of the per-trip expenses being replaced (for verification)
    const allExpenseIds = logs.map(l => l.expenseId!) ;
    const linkedExpenses = allExpenseIds.length > 0
      ? await db.select({ id: expensesTable.id, amount: expensesTable.amount })
          .from(expensesTable)
          .where(inArray(expensesTable.id, allExpenseIds))
      : [];
    const amountById = new Map(linkedExpenses.map(e => [e.id, parseFloat(e.amount ?? "0")]));

    const plan = [...byImport.entries()].map(([importId, months]) => ({
      importId,
      months: [...months.entries()].map(([ym, m]) => ({
        month: ym,
        trips: m.trips,
        totalMiles: Number(m.miles.toFixed(2)),
        perTripExpensesToDelete: m.expenseIds.length,
        sumOfPerTripAmounts: Number(m.expenseIds.reduce((s, id) => s + (amountById.get(id) ?? 0), 0).toFixed(2)),
      })),
    }));

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        message: "Dry-run — no data changed. Pass { dryRun: false } to consolidate. Each import will get one aggregate expense per month; per-trip expenses are deleted.",
        totalLogsAffected: logs.length,
        plan,
      });
    }

    const affectedLogIds = logs.map(l => l.id);
    const deletableExpenseIds = [...new Set(allExpenseIds)].filter(id => amountById.has(id));

    await db.transaction(async (tx) => {
      await tx.update(mileageLogsTable)
        .set({ expenseId: null })
        .where(inArray(mileageLogsTable.id, affectedLogIds));
      if (deletableExpenseIds.length > 0) {
        await tx.delete(expensesTable).where(inArray(expensesTable.id, deletableExpenseIds));
      }
    });

    // Rebuild monthly aggregates for each affected import (shared logic with the live routes)
    const recalcErrors: Array<{ importId: number; error: string }> = [];
    for (const importId of byImport.keys()) {
      try {
        await recalcImportExpenses(importId);
      } catch (err) {
        recalcErrors.push({ importId, error: String(err) });
      }
    }

    const result = {
      logsUnlinked: affectedLogIds.length,
      perTripExpensesDeleted: deletableExpenseIds.length,
      importsRecalculated: byImport.size - recalcErrors.length,
      recalcErrors,
      plan,
    };
    console.log(`[admin/migrations] consolidate-mileage-expenses executed:`, JSON.stringify(result));
    res.json({ ok: true, dryRun: false, result });
  } catch (err) {
    console.error("[admin/migrations] consolidate-mileage-expenses failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
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

// Consolidate per-item material invoice lines into one aggregate "Materials" line
// and strip the auto-attached materials PDF from existing draft invoice records.
//
// Background: before Task #1118, each material item got its own invoice line and
// the materials PDF was stored as an invoice attachment. Task #1118 changed this
// so new syncs produce a single "Materials" line and the PDF goes out via email.
// This migration retrofits existing draft invoices to match the new behavior.
//
// Idempotent: invoices already consolidated (single "Materials" line, no attachment)
// are processed harmlessly — syncMaterialsToJobInvoice will leave them as-is.
router.post("/consolidate-material-invoice-lines", async (_req: Request, res: Response) => {
  try {
    // Fetch all draft invoices that have a jobId (materials are job-scoped)
    const draftInvoices = await db
      .select({
        id: invoicesTable.id,
        jobId: invoicesTable.jobId,
        lineItems: invoicesTable.lineItems,
        attachments: invoicesTable.attachments,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "draft"), isNotNull(invoicesTable.jobId)));

    // Filter to invoices that have per-item material lines OR a Materials PDF attachment
    const MATERIALS_PREFIX = "Materials — ";
    const needsWork = draftInvoices.filter(inv => {
      const lines = Array.isArray(inv.lineItems) ? (inv.lineItems as any[]) : [];
      const hasPerItemLines = lines.some(
        li => li.source === "material" || li.description === "Materials"
      );
      const attachments = Array.isArray(inv.attachments) ? (inv.attachments as any[]) : [];
      const hasAttachment = attachments.some(a => a.name?.startsWith(MATERIALS_PREFIX));
      return hasPerItemLines || hasAttachment;
    });

    if (needsWork.length === 0) {
      return res.json({ ok: true, invoicesFixed: 0, message: "Already clean — nothing to do." });
    }

    // For each affected invoice: re-sync lines (consolidates per-item → single aggregate)
    // then strip the Materials PDF attachment in a separate targeted update
    const errors: Array<{ invoiceId: number; error: string }> = [];
    let fixed = 0;

    for (const inv of needsWork) {
      try {
        // 1. Re-sync line items (syncMaterialsToJobInvoice only touches lineItems/subtotal/tax/total)
        await syncMaterialsToJobInvoice(inv.jobId as number);

        // 2. Strip the Materials — attachment from this invoice record
        const attachments = Array.isArray(inv.attachments) ? (inv.attachments as any[]) : [];
        const stripped = attachments.filter(a => !a.name?.startsWith(MATERIALS_PREFIX));
        await db.update(invoicesTable)
          .set({ attachments: stripped })
          .where(eq(invoicesTable.id, inv.id));

        fixed++;
      } catch (err) {
        errors.push({ invoiceId: inv.id, error: String(err) });
      }
    }

    console.log(`[admin/migrations] consolidate-material-invoice-lines: fixed=${fixed}, errors=${errors.length}`);
    res.json({ ok: true, invoicesFixed: fixed, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("[admin/migrations] consolidate-material-invoice-lines failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Strip old-style per-item material lines that lack source:"material" tagging.
//
// Background: before Task #1118, syncMaterialsToJobInvoice wrote individual
// line items per material-list entry (no source field). Task #1118 changed it
// to a single aggregate "Materials" line (source:"material"). The previous
// migration (consolidate-material-invoice-lines) correctly creates the aggregate
// line but cannot detect the old per-item lines because they have no source tag.
// This migration cross-references material list item names (nameSnapshot) against
// invoice line descriptions to identify and remove those orphaned old lines.
//
// Idempotent: invoices with no matching old-style lines are untouched.
router.post("/strip-legacy-material-lines", async (_req: Request, res: Response) => {
  try {
    // Get all draft invoices with a jobId
    const draftInvoices = await db
      .select({
        id: invoicesTable.id,
        jobId: invoicesTable.jobId,
        lineItems: invoicesTable.lineItems,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "draft"), isNotNull(invoicesTable.jobId)));

    let fixed = 0;
    const errors: Array<{ invoiceId: number; error: string }> = [];

    for (const inv of draftInvoices) {
      try {
        const jobId = inv.jobId as number;
        const lines = Array.isArray(inv.lineItems) ? (inv.lineItems as any[]) : [];

        // Only process invoices that have at least one sourced "Materials" aggregate line —
        // meaning consolidation already ran; we just need to strip the legacy per-item lines.
        const hasAggregateLine = lines.some(
          li => li.source === "material" && li.description === "Materials"
        );
        if (!hasAggregateLine) continue;

        // Fetch all material list item nameSnapshots for this job
        const lists = await db
          .select({ id: materialListsTable.id })
          .from(materialListsTable)
          .where(eq(materialListsTable.jobId, jobId));

        if (lists.length === 0) continue;

        const listIds = lists.map(l => l.id);
        const items = await db
          .select({ nameSnapshot: materialListItemsTable.nameSnapshot })
          .from(materialListItemsTable)
          .where(inArray(materialListItemsTable.listId, listIds));

        if (items.length === 0) continue;

        const materialNames = new Set(items.map(i => i.nameSnapshot));

        // Find lines that match a material item name AND have no source tag
        // (these are the old per-item lines written before the source field existed)
        const oldStyleLines = lines.filter(
          li => !li.source && materialNames.has(li.description)
        );

        if (oldStyleLines.length === 0) continue;

        // Remove old-style lines, keep everything else
        const stripped = lines.filter(
          li => li.source || !materialNames.has(li.description)
        );

        // Recompute totals
        const subtotal = stripped.reduce((s: number, li: any) => s + (li.quantity ?? 1) * (li.unitPrice ?? 0), 0);
        const [existing] = await db.select({ taxRate: invoicesTable.taxRate }).from(invoicesTable).where(eq(invoicesTable.id, inv.id));
        const taxRate = existing?.taxRate ? parseFloat(existing.taxRate) : 0;
        const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;

        await db.update(invoicesTable)
          .set({
            lineItems: stripped,
            subtotal: subtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
            total: (subtotal + taxAmount).toFixed(2),
          })
          .where(eq(invoicesTable.id, inv.id));

        fixed++;
      } catch (err) {
        errors.push({ invoiceId: inv.id, error: String(err) });
      }
    }

    console.log(`[admin/migrations] strip-legacy-material-lines: fixed=${fixed}, errors=${errors.length}`);
    res.json({ ok: true, invoicesFixed: fixed, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("[admin/migrations] strip-legacy-material-lines failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
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
