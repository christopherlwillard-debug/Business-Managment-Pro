import { Router, Request, Response } from "express";
import { db, mfhManufacturersTable, mfhModelsTable, jobsTable, clientsTable, mileageLogsTable, expensesTable, subPaymentRecordsTable, productionServiceTypesTable } from "@workspace/db";
import { jobSubcontractorsTable, invoicesTable, materialListsTable, materialListItemsTable, clientBillingProfilesTable, settingsTable, jobSubHoursTable, subcontractorsTable } from "@workspace/db/schema";
import { isNull, isNotNull, and, inArray, or, like, asc, desc, sql, ilike, eq, ne } from "drizzle-orm";
import { recalcImportExpenses } from "./mileage";
import { syncMaterialsToJobInvoice } from "./material-lists";

const router = Router();

// ── All routes require MIGRATION_KEY header auth (set in index.ts) ────────────

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
      await db.select({ expenseId: (subPaymentRecordsTable as any).expenseId })
        .from(subPaymentRecordsTable)
        .where(isNotNull((subPaymentRecordsTable as any).expenseId))
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

// Strip phantom zero-dollar unsourced lines from draft invoices that have been
// consolidated (have a "Materials" aggregate line with source="material").
// These $0 lines have no financial impact but look wrong on the printed invoice.
// Targets lines where unitPrice=0, quantity=1, and no source field.
// Idempotent: invoices with no matching lines are untouched.
router.post("/strip-phantom-zero-lines", async (_req: Request, res: Response): Promise<void> => {
  try {
    const draftInvoices = await db
      .select({ id: invoicesTable.id, lineItems: invoicesTable.lineItems })
      .from(invoicesTable)
      .where(eq(invoicesTable.status, "draft"));

    let fixed = 0;
    const affected: number[] = [];

    for (const inv of draftInvoices) {
      const lines = Array.isArray(inv.lineItems) ? (inv.lineItems as any[]) : [];

      // Only touch invoices that have already been consolidated (have a Materials aggregate)
      const hasAggregateLine = lines.some(
        li => li.source === "material" && li.description === "Materials"
      );
      if (!hasAggregateLine) continue;

      // Find phantom lines: no source, unitPrice=0, quantity=1
      const phantomLines = lines.filter(
        li => !li.source && (li.unitPrice === 0 || li.unitPrice === "0") && (li.quantity === 1 || li.quantity === "1")
      );
      if (phantomLines.length === 0) continue;

      const stripped = lines.filter(
        li => li.source || !(
          (li.unitPrice === 0 || li.unitPrice === "0") && (li.quantity === 1 || li.quantity === "1")
        )
      );

      const subtotal = stripped.reduce((s: number, li: any) => s + (parseFloat(li.quantity) || 1) * (parseFloat(li.unitPrice) || 0), 0);
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
      affected.push(inv.id);
    }

    console.log(`[admin/migrations] strip-phantom-zero-lines: fixed=${fixed}, affected=${affected}`);
    res.json({ ok: true, invoicesFixed: fixed, affected });
  } catch (err) {
    console.error("[admin/migrations] strip-phantom-zero-lines failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Seed Clayton Homes of Evansville client + Factory Billback billing profile.
// Idempotent: skips client creation if already exists, skips profile if already present.
router.post("/seed-clayton-billback", async (_req: Request, res: Response) => {
  try {
    // 1. Upsert client
    let clientId: number;
    const existing = await db.select({ id: clientsTable.id })
      .from(clientsTable)
      .where(ilike(clientsTable.name, "Clayton Homes of Evansville"))
      .limit(1);

    if (existing.length > 0) {
      clientId = existing[0].id;
    } else {
      const [inserted] = await db.insert(clientsTable).values({
        name: "Clayton Homes of Evansville",
        address: "19410 US-41",
        city: "Evansville",
        state: "IN",
        zip: "47725",
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

// Clear invoice numbers from all draft invoices so they receive sequential
// numbers in send order (not creation order). Idempotent: drafts already
// without a number are unaffected. Non-draft invoices are never touched.
router.post("/clear-draft-invoice-numbers", async (_req: Request, res: Response) => {
  try {
    const draftsWithNumbers = await db
      .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "draft"), isNotNull(invoicesTable.invoiceNumber)));

    if (draftsWithNumbers.length === 0) {
      return res.json({ ok: true, cleared: 0, message: "No draft invoices with numbers found — nothing to do." });
    }

    const ids = draftsWithNumbers.map(r => r.id);
    await db.update(invoicesTable)
      .set({ invoiceNumber: null })
      .where(inArray(invoicesTable.id, ids));

    const cleared = draftsWithNumbers.map(r => ({ id: r.id, wasNumber: r.invoiceNumber }));
    console.log(`[admin/migrations] clear-draft-invoice-numbers: cleared ${ids.length} drafts`, cleared);
    res.json({ ok: true, cleared: ids.length, invoices: cleared });
  } catch (err) {
    console.error("[admin/migrations] clear-draft-invoice-numbers failed:", err);
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

// Add invoice progression columns: accepted_at, sent_at, sent_method
// Safe to run multiple times — uses IF NOT EXISTS DDL.
router.post("/add-invoice-progression-columns", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS sent_method TEXT;
    `);
    res.json({ ok: true, message: "Invoice progression columns ensured (accepted_at, sent_at, sent_method)" });
  } catch (err) {
    console.error("[admin/migrations] add-invoice-progression-columns failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Add last_manual_paid_at column for manual payment date tracking.
// Safe to run multiple times — uses IF NOT EXISTS DDL.
router.post("/add-invoice-manual-paid-at", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS last_manual_paid_at TIMESTAMPTZ;
    `);
    res.json({ ok: true, message: "last_manual_paid_at column ensured on invoices" });
  } catch (err) {
    console.error("[admin/migrations] add-invoice-manual-paid-at failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Add accepted_at, sent_at, sent_method columns to invoices (missing from production)
router.post("/add-invoice-lifecycle-columns", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sent_method TEXT;
    `);
    res.json({ ok: true, message: "accepted_at, sent_at, sent_method columns ensured on invoices" });
  } catch (err) {
    console.error("[admin/migrations] add-invoice-lifecycle-columns failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// One-time fix: rename Wil-1032 → Wil-1031 on invoice id=32 (1031 was skipped due to
// the missing accepted_at column crash during the approval attempt)
router.post("/fix-invoice-1031", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`
      UPDATE invoices SET invoice_number = 'Wil-1031' WHERE id = 32 AND invoice_number = 'Wil-1032'
    `);
    res.json({ ok: true, message: "Invoice id=32 renumbered to Wil-1031" });
  } catch (err) {
    console.error("[admin/migrations] fix-invoice-1031 failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Add man_hours column to jobs table
router.post("/add-man-hours", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS man_hours NUMERIC(8,2)`);
    res.json({ ok: true, message: "man_hours column ensured" });
  } catch (err) {
    console.error("[admin/migrations] add-man-hours failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Add active column to mfh_models (was missing from migration 0044 which only added it to mfh_manufacturers)
router.post("/add-mfh-models-active", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`ALTER TABLE mfh_models ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`);
    res.json({ ok: true, message: "mfh_models.active column ensured" });
  } catch (err) {
    console.error("[admin/migrations] add-mfh-models-active failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Fix invoice Wil-1036 → Wil-1032 and reset the counter to 1033.
//
// Background: 4 draft invoices were created (consuming numbers 1032–1035 from
// the settings counter) then had their numbers cleared on server restart.
// The counter stayed at 1036, so the next sent invoice (drywall repair, id=33)
// got Wil-1036 instead of Wil-1032. The two pending drafts (ids 34, 35) will
// then get 1037/1038 instead of 1033/1034.
//
// Fix: rename id=33 → Wil-1032, reset counter to 1033.
// Idempotent: no-op if id=33 already has number Wil-1032.
router.post("/fix-invoice-1036-sequence", async (_req: Request, res: Response) => {
  try {
    const TARGET_ID = 33;
    const WRONG_NUM = "Wil-1036";
    const RIGHT_NUM = "Wil-1032";
    const NEW_COUNTER = 1033;

    // Check current state
    const [inv] = await db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber })
      .from(invoicesTable).where(eq(invoicesTable.id, TARGET_ID));

    if (!inv) return res.status(404).json({ error: `Invoice id=${TARGET_ID} not found` });

    if (inv.invoiceNumber === RIGHT_NUM) {
      return res.json({ ok: true, alreadyFixed: true, message: `Invoice id=${TARGET_ID} already has number ${RIGHT_NUM} — nothing to do.` });
    }

    if (inv.invoiceNumber !== WRONG_NUM) {
      return res.status(409).json({
        error: `Invoice id=${TARGET_ID} has unexpected number "${inv.invoiceNumber}" (expected "${WRONG_NUM}"). Aborting to avoid unintended changes.`,
      });
    }

    // Verify Wil-1032 isn't already taken by another invoice
    const [conflict] = await db.select({ id: invoicesTable.id })
      .from(invoicesTable).where(eq(invoicesTable.invoiceNumber, RIGHT_NUM));
    if (conflict) {
      return res.status(409).json({ error: `${RIGHT_NUM} is already used by invoice id=${conflict.id}` });
    }

    await db.transaction(async (tx) => {
      // 1. Rename the invoice
      await tx.update(invoicesTable)
        .set({ invoiceNumber: RIGHT_NUM })
        .where(eq(invoicesTable.id, TARGET_ID));

      // 2. Reset the counter so the two pending drafts get 1033 and 1034
      const [s] = await tx.select().from(settingsTable).limit(1);
      if (s) {
        await tx.update(settingsTable)
          .set({ invoiceNextNumber: NEW_COUNTER })
          .where(eq(settingsTable.id, s.id));
      }
    });

    console.log(`[admin/migrations] fix-invoice-1036-sequence: renamed id=${TARGET_ID} ${WRONG_NUM}→${RIGHT_NUM}, counter reset to ${NEW_COUNTER}`);
    res.json({ ok: true, renamed: `${WRONG_NUM} → ${RIGHT_NUM}`, counterResetTo: NEW_COUNTER });
  } catch (err) {
    console.error("[admin/migrations] fix-invoice-1036-sequence failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Fix Dewayne Lamb's rateSnapshot on Peters Booneville job so the P&L
// Hourly Workers figure reflects his agreed $25/hr work + $15/hr travel rates.
router.post("/fix-dewayne-rate-snapshots", async (_req: Request, res: Response) => {
  try {
    // Find sub by name
    const [sub] = await db
      .select({ id: subcontractorsTable.id, name: subcontractorsTable.name })
      .from(subcontractorsTable)
      .where(ilike(subcontractorsTable.name, "%dewayne%"));
    if (!sub) return res.status(404).json({ error: "Dewayne not found in subcontractors" });

    // Find job by name
    const [job] = await db
      .select({ id: jobsTable.id, title: jobsTable.title })
      .from(jobsTable)
      .where(and(ilike(jobsTable.title, "%peter%"), ilike(jobsTable.title, "%booneville%")));
    if (!job) return res.status(404).json({ error: "Peters Booneville job not found" });

    // Fetch existing hour entries
    const hours = await db
      .select({ id: jobSubHoursTable.id, hours: jobSubHoursTable.hours, hourType: jobSubHoursTable.hourType, rateSnapshot: jobSubHoursTable.rateSnapshot })
      .from(jobSubHoursTable)
      .where(and(eq(jobSubHoursTable.jobId, job.id), eq(jobSubHoursTable.subcontractorId, sub.id)));

    if (hours.length === 0) return res.status(404).json({ error: "No hour entries found for this sub/job", subId: sub.id, jobId: job.id });

    let workFixed = 0;
    let travelFixed = 0;
    for (const h of hours) {
      const isTravel = h.hourType === "travel";
      const correctRate = isTravel ? 15 : 25;
      const currentRate = h.rateSnapshot != null ? parseFloat(String(h.rateSnapshot)) : null;
      if (currentRate !== correctRate) {
        await db.update(jobSubHoursTable)
          .set({ rateSnapshot: correctRate.toString() })
          .where(eq(jobSubHoursTable.id, h.id));
        isTravel ? travelFixed++ : workFixed++;
      }
    }

    const newLaborCost = hours.reduce((sum, h) => {
      const rate = h.hourType === "travel" ? 15 : 25;
      return sum + (parseFloat(String(h.hours)) * rate);
    }, 0);

    console.log(`[admin/migrations] fix-dewayne-rate-snapshots: sub=${sub.name}(${sub.id}), job="${job.title}"(${job.id}), workFixed=${workFixed}, travelFixed=${travelFixed}, newLaborCost=${newLaborCost}`);
    res.json({ ok: true, sub: sub.name, job: job.title, workRowsFixed: workFixed, travelRowsFixed: travelFixed, newLaborCost, entries: hours.map(h => ({ id: h.id, hours: h.hours, hourType: h.hourType, oldRate: h.rateSnapshot })) });
  } catch (err) {
    console.error("[admin/migrations] fix-dewayne-rate-snapshots failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Diagnostic: show all job_sub_hours + Subcontractor expenses for Peters Booneville
// Helps trace the source of the $1,140 P&L sub labor cost figure.
router.get("/diag-peters-booneville", async (_req: Request, res: Response) => {
  try {
    const [job] = await db
      .select({ id: jobsTable.id, title: jobsTable.title })
      .from(jobsTable)
      .where(and(ilike(jobsTable.title, "%peter%"), ilike(jobsTable.title, "%booneville%")));
    if (!job) return res.status(404).json({ error: "Job not found" });

    const hours = await db
      .select({
        id: jobSubHoursTable.id,
        subId: jobSubHoursTable.subcontractorId,
        subName: subcontractorsTable.name,
        hours: jobSubHoursTable.hours,
        hourType: jobSubHoursTable.hourType,
        rateSnapshot: jobSubHoursTable.rateSnapshot,
        cost: sql<string>`${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)`,
        date: jobSubHoursTable.date,
      })
      .from(jobSubHoursTable)
      .leftJoin(subcontractorsTable, eq(subcontractorsTable.id, jobSubHoursTable.subcontractorId))
      .where(eq(jobSubHoursTable.jobId, job.id));

    const expRows = await db
      .select({
        id: expensesTable.id,
        category: expensesTable.category,
        amount: expensesTable.amount,
        description: expensesTable.description,
        jobSubHoursId: expensesTable.jobSubHoursId,
      })
      .from(expensesTable)
      .where(eq(expensesTable.jobId, job.id));

    const sprRows = await db
      .select({
        id: subPaymentRecordsTable.id,
        subId: subPaymentRecordsTable.subcontractorId,
        subName: subcontractorsTable.name,
        amount: subPaymentRecordsTable.amount,
        advanceAmount: subPaymentRecordsTable.advanceAmount,
        compType: jobSubcontractorsTable.compensationType,
        isReversal: subPaymentRecordsTable.isReversal,
      })
      .from(subPaymentRecordsTable)
      .leftJoin(subcontractorsTable, eq(subcontractorsTable.id, subPaymentRecordsTable.subcontractorId))
      .leftJoin(jobSubcontractorsTable, and(
        eq(jobSubcontractorsTable.jobId, subPaymentRecordsTable.jobId),
        eq(jobSubcontractorsTable.subcontractorId, subPaymentRecordsTable.subcontractorId),
      ))
      .where(eq(subPaymentRecordsTable.jobId, job.id));

    const totalHoursLabor = hours.reduce((s, h) => s + parseFloat(String(h.cost)), 0);
    const subcontractorExpenses = expRows.filter(e => e.category === "Subcontractor" && !e.jobSubHoursId);
    const flatSubCost = subcontractorExpenses.reduce((s, e) => s + parseFloat(String(e.amount ?? "0")), 0);

    res.json({ job, hours, subcontractorExpenses, sprRows, totalHoursLabor, flatSubCost, computedSubLaborCost: totalHoursLabor + (flatSubCost > 0 ? flatSubCost : 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ── List all draft invoices (null invoice number) ─────────────────────────────
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

// One-time fix: assign <prefix>1036 to the current unnumbered draft invoice
// and reset the counter to 1037 so the next issued invoice is <prefix>1037.
// Reads the prefix from settings so it works in any environment.
// Idempotent: if <prefix>1036 is already assigned, reports success and does nothing.
router.post("/rename-invoice-1038-to-1036", async (_req: Request, res: Response) => {
  const NEW_COUNTER = 1037;

  try {
    const [s] = await db.select().from(settingsTable).limit(1);
    const prefix = s?.invoicePrefix ?? "INV-";
    const TARGET_NUMBER = `${prefix}1036`;

    // Idempotent: already done
    const [already] = await db.select({ id: invoicesTable.id, status: invoicesTable.status })
      .from(invoicesTable)
      .where(eq(invoicesTable.invoiceNumber, TARGET_NUMBER))
      .limit(1);
    if (already) {
      return res.json({ ok: true, alreadyDone: true, invoiceId: already.id, invoiceNumber: TARGET_NUMBER });
    }

    // Find the most recent unnumbered draft invoice
    const [target] = await db.select({ id: invoicesTable.id, status: invoicesTable.status })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.status, "draft"), isNull(invoicesTable.invoiceNumber)))
      .orderBy(sql`${invoicesTable.id} DESC`)
      .limit(1);
    if (!target) return res.status(404).json({ error: "No unnumbered draft invoice found." });

    await db.transaction(async (tx) => {
      await tx.update(invoicesTable)
        .set({ invoiceNumber: TARGET_NUMBER, status: "approved", acceptedAt: new Date() })
        .where(eq(invoicesTable.id, target.id));

      if (s) {
        await tx.update(settingsTable)
          .set({ invoiceNextNumber: NEW_COUNTER })
          .where(eq(settingsTable.id, s.id));
      }
    });

    console.log(`[admin/migrations] rename-invoice-1038-to-1036: id=${target.id} assigned ${TARGET_NUMBER}, counter→${NEW_COUNTER}`);
    res.json({ ok: true, invoiceId: target.id, invoiceNumber: TARGET_NUMBER, counterResetTo: NEW_COUNTER });
  } catch (err) {
    console.error("[admin/migrations] rename-invoice-1038-to-1036 failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// ── Bulk delete all ghost draft invoices (status=draft, invoice_number IS NULL) ──
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

// One-time fix: delete the ghost draft invoice (id=38) created by the materials sync bug.
// It has no invoice number and was never issued. Safe to delete.
// Idempotent: if already deleted, returns { ok: true, alreadyDone: true }.
router.post("/delete-drywall-ghost-invoice", async (_req: Request, res: Response) => {
  try {
    const [existing] = await db.select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, 38), eq(invoicesTable.status, "draft"), isNull(invoicesTable.invoiceNumber)))
      .limit(1);

    if (!existing) {
      return res.json({ ok: true, alreadyDone: true });
    }

    await db.delete(invoicesTable)
      .where(and(eq(invoicesTable.id, 38), eq(invoicesTable.status, "draft"), isNull(invoicesTable.invoiceNumber)));

    console.log("[admin/migrations] delete-drywall-ghost-invoice: deleted invoice id=38");
    res.json({ ok: true, deleted: true, invoiceId: 38 });
  } catch (err) {
    console.error("[admin/migrations] delete-drywall-ghost-invoice failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Assign investment accounts with no business to General Contracting (id=1)
router.post("/assign-null-business-investments", async (_req: Request, res: Response) => {
  try {
    const updated = await db.execute(
      sql`UPDATE investment_accounts SET business_id = 1 WHERE business_id IS NULL RETURNING id, name`
    );
    const rows = updated.rows as { id: number; name: string }[];
    console.log(`[admin/migrations] assign-null-business-investments: updated ${rows.length} row(s)`, rows);
    res.json({ ok: true, updated: rows.length, rows });
  } catch (err) {
    console.error("[admin/migrations] assign-null-business-investments failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// ─── Owner Compensation Migration ────────────────────────────────────────────
// One-time migration: rename 'Owner Draw' → 'Owner Compensation' for all
// expense records that are linked to a job (i.e. job compensation, not true
// equity withdrawals). Safe to run multiple times (idempotent).
router.post("/migrate-owner-draw-to-compensation", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`UPDATE expenses SET category = 'Owner Compensation' WHERE category = 'Owner Draw' AND job_id IS NOT NULL`
    );
    const migrated = result.rowCount ?? 0;
    console.log(`[admin/migrations] migrate-owner-draw-to-compensation: migrated=${migrated}`);
    res.json({ ok: true, migrated });
  } catch (err) {
    console.error("[admin/migrations] migrate-owner-draw-to-compensation failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Validate migrated Owner Compensation records against Job Financials.
// For each completed job, recalculates expected take-home and compares it
// to the recorded Owner Compensation amount. Returns verified count + mismatch log.
router.post("/validate-owner-compensation", async (_req: Request, res: Response) => {
  try {
    const GROWTH_PCT = 0.05;
    const TAX_PCT    = 0.25;

    const completedJobs = await db.select({
      id: jobsTable.id, title: jobsTable.title, jobNumber: jobsTable.jobNumber,
    }).from(jobsTable).where(eq(jobsTable.status, "closed"));

    if (completedJobs.length === 0) {
      return res.json({ ok: true, validated: 0, verified: 0, mismatches: [] });
    }
    const jobIds = completedJobs.map(j => j.id);

    // Revenue per job
    const invoiceRows = await db.select({
      jobId: invoicesTable.jobId, total: invoicesTable.total,
    }).from(invoicesTable).where(inArray(invoicesTable.jobId, jobIds));
    const revenueByJob = new Map<number, number>();
    for (const r of invoiceRows) {
      if (!r.jobId) continue;
      revenueByJob.set(r.jobId, (revenueByJob.get(r.jobId) ?? 0) + parseFloat(r.total ?? "0"));
    }

    // Hourly sub cost per job
    const hoursCostRows = await db.select({
      jobId: jobSubHoursTable.jobId,
      cost: sql<string>`COALESCE(SUM(${jobSubHoursTable.hours} * COALESCE(${jobSubHoursTable.rateSnapshot}, 0)), 0)`,
    }).from(jobSubHoursTable).where(inArray(jobSubHoursTable.jobId, jobIds)).groupBy(jobSubHoursTable.jobId);
    const hoursCostByJob = new Map(hoursCostRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));

    // Fixed sub cost per job
    const fixedSubRows = await db.select({
      jobId: jobSubcontractorsTable.jobId,
      cost: sql<string>`COALESCE(SUM(COALESCE(${jobSubcontractorsTable.fixedAmount}, 0)), 0)`,
    }).from(jobSubcontractorsTable)
      .where(and(inArray(jobSubcontractorsTable.jobId, jobIds), eq(jobSubcontractorsTable.compensationType, "fixed")))
      .groupBy(jobSubcontractorsTable.jobId);
    const fixedCostByJob = new Map(fixedSubRows.map(r => [r.jobId, parseFloat(r.cost ?? "0")]));

    // Allocation pct per job
    const allocRows = await db.select({
      jobId: jobSubcontractorsTable.jobId,
      totalAllocPct: sql<string>`COALESCE(SUM(COALESCE(${jobSubcontractorsTable.allocationPct}, 0)), 0)`,
    }).from(jobSubcontractorsTable)
      .where(and(inArray(jobSubcontractorsTable.jobId, jobIds), eq(jobSubcontractorsTable.compensationType, "allocation")))
      .groupBy(jobSubcontractorsTable.jobId);
    const allocPctByJob = new Map(allocRows.map(r => [r.jobId, parseFloat(r.totalAllocPct ?? "0")]));

    // Owner Compensation expenses per job (both categories during transition window)
    const ownerCompRows = await db.select({
      jobId: expensesTable.jobId, amount: expensesTable.amount, id: expensesTable.id,
    }).from(expensesTable).where(and(
      inArray(expensesTable.jobId as any, jobIds),
      inArray(expensesTable.category, ["Owner Compensation", "Owner Draw"]),
    ));
    const ownerCompByJob = new Map<number, { amount: number; id: number }[]>();
    for (const r of ownerCompRows) {
      if (!r.jobId) continue;
      const list = ownerCompByJob.get(r.jobId) ?? [];
      list.push({ amount: parseFloat(r.amount ?? "0"), id: r.id });
      ownerCompByJob.set(r.jobId, list);
    }

    const mismatches: any[] = [];
    const verified: any[] = [];

    for (const job of completedJobs) {
      const revenue = revenueByJob.get(job.id) ?? 0;
      if (revenue < 0.01) continue; // skip jobs with no revenue
      const hourlyCost    = hoursCostByJob.get(job.id) ?? 0;
      const fixedCost     = fixedCostByJob.get(job.id) ?? 0;
      const afterWorkers  = Math.max(0, revenue - hourlyCost - fixedCost);
      const growthReserve = afterWorkers * GROWTH_PCT;
      const toSplit       = afterWorkers - growthReserve;
      const totalAllocPct = allocPctByJob.get(job.id) ?? 0;
      const ownerPct      = totalAllocPct > 0 ? Math.max(0, 100 - totalAllocPct) : 100;
      const ownerShare    = toSplit * (ownerPct / 100);
      const expectedTakeHome = ownerShare * (1 - TAX_PCT);

      const records      = ownerCompByJob.get(job.id) ?? [];
      const totalRecorded = records.reduce((s, r) => s + r.amount, 0);
      const round2 = (n: number) => Math.round(n * 100) / 100;

      if (records.length === 0) {
        if (expectedTakeHome > 0.01) {
          mismatches.push({ jobId: job.id, jobNumber: job.jobNumber, title: job.title, issue: "no_record", expectedAmount: round2(expectedTakeHome), migratedAmount: 0, variance: round2(expectedTakeHome) });
        }
      } else {
        const variance = Math.abs(totalRecorded - expectedTakeHome);
        if (variance > 0.05) {
          mismatches.push({ jobId: job.id, jobNumber: job.jobNumber, title: job.title, issue: "amount_mismatch", expectedAmount: round2(expectedTakeHome), migratedAmount: round2(totalRecorded), variance: round2(variance) });
        } else {
          verified.push({ jobId: job.id, jobNumber: job.jobNumber, title: job.title });
        }
      }
    }

    console.log(`[admin/migrations] validate-owner-compensation: verified=${verified.length}, mismatches=${mismatches.length}`);
    res.json({ ok: true, validated: completedJobs.length, verified: verified.length, mismatches });
  } catch (err) {
    console.error("[admin/migrations] validate-owner-compensation failed:", err);
    res.status(500).json({ error: "Validation failed", detail: String(err) });
  }
});

// Fix owner draw/compensation expenses that have overflow date strings stored due
// to a past timezone bug (e.g. "2026-06-32" meaning July 2, "2026-06-55" meaning
// July 25).  Finds all owner-pay expense rows where the day portion of the date
// is > 28 (impossible for any real month-end), computes the correct ISO date via
// the multi-argument Date constructor (which reliably overflows), and writes the
// corrected date back.
//
// dryRun=true (default) returns the plan without changing data.  Idempotent: once
// corrected, no rows have day > 28 that need fixing (genuine end-of-month dates
// like the 29th, 30th, 31st are preserved — only clearly-overflow values > 31 are
// touched, plus days 29-31 are re-validated to ensure they're still calendar-valid).
//
// Strategy: fix ANY day > 31 unconditionally (definitely overflow).  Days 29-31
// are left as-is since they can be valid calendar dates for months with 29-31 days.
router.post("/fix-owner-draw-dates", async (req: Request, res: Response): Promise<void> => {
  try {
    const { dryRun = true } = (req.body ?? {}) as { dryRun?: boolean };

    const PAY_CATEGORIES = ["Owner Compensation", "Owner Draw", "Owner Withdrawal"];

    const rows = await db
      .select({ id: expensesTable.id, date: expensesTable.date, category: expensesTable.category })
      .from(expensesTable)
      .where(inArray(expensesTable.category, PAY_CATEGORIES));

    type Plan = { id: number; category: string | null; storedDate: string; correctedDate: string };
    const plan: Plan[] = [];

    for (const row of rows) {
      if (!row.date) continue;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
      if (!match) continue;
      const [, y, mo, d] = match.map(Number);
      if (d <= 28) continue; // 1-28 are always valid; skip

      // Use the multi-argument constructor to resolve overflow correctly
      const corrected = new Date(y, mo - 1, d, 12, 0, 0);
      if (isNaN(corrected.getTime())) continue;

      const correctedStr =
        `${corrected.getFullYear()}-${String(corrected.getMonth() + 1).padStart(2, "0")}-${String(corrected.getDate()).padStart(2, "0")}`;

      // Only record as a fix if the resolved date is actually different
      if (correctedStr === row.date) continue;

      plan.push({ id: row.id, category: row.category, storedDate: row.date, correctedDate: correctedStr });
    }

    if (plan.length === 0) {
      res.json({ ok: true, dryRun, already_clean: true, message: "No overflow dates found — nothing to fix.", plan: [] });
      return;
    }

    if (dryRun) {
      res.json({
        ok: true,
        dryRun: true,
        message: `Dry-run — no data changed. Pass { dryRun: false } to correct ${plan.length} row(s).`,
        plan,
      });
      return;
    }

    let fixed = 0;
    const errors: Array<{ id: number; error: string }> = [];
    for (const fix of plan) {
      try {
        await db.update(expensesTable)
          .set({ date: fix.correctedDate })
          .where(eq(expensesTable.id, fix.id));
        fixed++;
      } catch (err) {
        errors.push({ id: fix.id, error: String(err) });
      }
    }

    console.log(`[admin/migrations] fix-owner-draw-dates: fixed=${fixed}, errors=${errors.length}`, JSON.stringify(plan));
    res.json({ ok: true, dryRun: false, fixed, errors: errors.length ? errors : undefined, plan });
  } catch (err) {
    console.error("[admin/migrations] fix-owner-draw-dates failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

// Add M9 Photo Optimizer columns to website_media table.
// Safe to run multiple times — uses IF NOT EXISTS DDL.
router.post("/add-website-media-optimizer-columns", async (_req: Request, res: Response) => {
  try {
    await db.execute(sql`
      ALTER TABLE website_media
        ADD COLUMN IF NOT EXISTS webp_object_path VARCHAR(512),
        ADD COLUMN IF NOT EXISTS thumbnail_object_path VARCHAR(512),
        ADD COLUMN IF NOT EXISTS display_object_path VARCHAR(512),
        ADD COLUMN IF NOT EXISTS optimized BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    res.json({ ok: true, message: "website_media optimizer columns ensured (webp_object_path, thumbnail_object_path, display_object_path, optimized)" });
  } catch (err) {
    console.error("[admin/migrations] add-website-media-optimizer-columns failed:", err);
    res.status(500).json({ error: "Migration failed", detail: String(err) });
  }
});

export default router;
