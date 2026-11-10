import { Router } from "express";
import { db } from "@workspace/db";
import {
  complianceItemsTable,
  routeStopsTable,
  clientsTable,
  prospectsTable,
  invoicesTable,
  jobsTable,
  jobChecklistsTable,
  jobChecklistItemsTable,
  jobSubcontractorsTable,
  subcontractorsTable,
  jobStartPhotosTable,
  expensesTable,
  subPaymentRecordsTable,
  ownerCapitalEntriesTable,
} from "@workspace/db/schema";
import { eq, asc, lte, ne, and, or, isNotNull, desc, inArray, isNull, not, lt } from "drizzle-orm";
import { wrapAsync } from "./guards";
import { OWNER_WITHDRAWAL_EXPENSE_CATEGORIES } from "../lib/owner-withdrawals.js";
import { hasRequestedBusiness, invalidBusinessScope, mutationBusinessPredicate, requestedBusiness } from "../lib/business-scope.js";

const router = Router();

function formatComplianceItem(item: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let computedStatus = item.status;
  if (item.status !== "complete") {
    if (diffDays < 0) computedStatus = "overdue";
    else if (diffDays <= 30) computedStatus = "due-soon";
    else computedStatus = "upcoming";
  }
  return { id: item.id, title: item.title, dueDate: item.dueDate, computedStatus, daysUntilDue: diffDays };
}

router.get("/today", wrapAsync(async (req, res) => {
  const scope = await requestedBusiness(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const routeStopScope = scope
    ? or(
        and(
          isNotNull(routeStopsTable.clientId),
          mutationBusinessPredicate(
            { businessId: clientsTable.businessId, businessLine: clientsTable.businessLine },
            scope,
          ),
        ),
        and(
          isNotNull(routeStopsTable.prospectId),
          mutationBusinessPredicate(
            { businessId: prospectsTable.businessId, businessLine: prospectsTable.businessLine },
            scope,
          ),
        ),
      )
    : undefined;

  const [complianceRows, routeStopRows, prospectRows, overdueInvoiceRows] = await Promise.all([
    db.select({
      id: complianceItemsTable.id,
      title: complianceItemsTable.title,
      dueDate: complianceItemsTable.dueDate,
      status: complianceItemsTable.status,
    })
      .from(complianceItemsTable)
      .orderBy(asc(complianceItemsTable.dueDate)),

    db.select({
      id: routeStopsTable.id,
      title: routeStopsTable.title,
      address: routeStopsTable.address,
      status: routeStopsTable.status,
      clientName: clientsTable.name,
      prospectContactName: prospectsTable.contactName,
    })
      .from(routeStopsTable)
      .leftJoin(clientsTable, eq(routeStopsTable.clientId, clientsTable.id))
      .leftJoin(prospectsTable, eq(routeStopsTable.prospectId, prospectsTable.id))
      .where(and(eq(routeStopsTable.scheduledDate, todayStr), routeStopScope)),

    db.select({
      id: prospectsTable.id,
      address: prospectsTable.address,
      contactName: prospectsTable.contactName,
      contactPhone: prospectsTable.contactPhone,
      followUpDate: prospectsTable.followUpDate,
      status: prospectsTable.status,
    })
      .from(prospectsTable)
      .where(
        and(
          isNotNull(prospectsTable.followUpDate),
          lte(prospectsTable.followUpDate, todayStr),
          ne(prospectsTable.status, "lost"),
          scope
            ? mutationBusinessPredicate(
                { businessId: prospectsTable.businessId, businessLine: prospectsTable.businessLine },
                scope,
              )
            : undefined,
        )
      ),

    db.select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      clientName: clientsTable.name,
      dueDate: invoicesTable.dueDate,
      total: invoicesTable.total,
    })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(and(
        eq(invoicesTable.status, "overdue"),
        scope
          ? mutationBusinessPredicate(
              { businessId: invoicesTable.businessId, businessLine: invoicesTable.businessLine },
              scope,
            )
          : undefined,
      )),
  ]);

  res.json({
    complianceItems: complianceRows.map(formatComplianceItem),
    routeStops: routeStopRows,
    followUpProspects: prospectRows,
    overdueInvoices: overdueInvoiceRows.map(r => ({
      ...r,
      total: parseFloat(r.total ?? "0"),
    })),
  });
}));

// ─── Continue Working ──────────────────────────────────────────────────────────
// Returns the most-recently-active job (by checklist updatedAt fallback createdAt).
router.get("/continue-working", wrapAsync(async (req, res) => {
  const scope = await requestedBusiness(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;
  const activeWhere = and(
    ne(jobsTable.status, "closed"),
    ne(jobsTable.status, "cancelled"),
    scope
      ? mutationBusinessPredicate(
          { businessId: jobsTable.businessId, businessLine: jobsTable.businessLine },
          scope,
        )
      : undefined,
  );

  // Primary: jobs that have checklist activity — innerJoin ensures only rows with a real
  // checklist record are returned. Secondary sort on jobsTable.id is a deterministic tiebreaker.
  const [withChecklist] = await db
    .select({
      jobId: jobsTable.id,
      title: jobsTable.title,
      clientName: clientsTable.name,
    })
    .from(jobsTable)
    .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
    .innerJoin(jobChecklistsTable, eq(jobChecklistsTable.jobId, jobsTable.id))
    .where(activeWhere)
    .orderBy(desc(jobChecklistsTable.updatedAt), desc(jobsTable.id))
    .limit(1);

  // Fallback: any active job, most recently created first
  const [recent] = withChecklist
    ? [withChecklist]
    : await db
        .select({ jobId: jobsTable.id, title: jobsTable.title, clientName: clientsTable.name })
        .from(jobsTable)
        .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
        .where(activeWhere)
        .orderBy(desc(jobsTable.createdAt), desc(jobsTable.id))
        .limit(1);

  if (!recent) { res.json(null); return; }

  const jobId = recent.jobId;

  // Parallel fetches: checklist items, invoice status, crew names, cover photo
  const [allItems, invoiceRows, crewRows, photoRows] = await Promise.all([
    db.select({ completed: jobChecklistItemsTable.completed })
      .from(jobChecklistItemsTable)
      .innerJoin(jobChecklistsTable, eq(jobChecklistItemsTable.jobChecklistId, jobChecklistsTable.id))
      .where(eq(jobChecklistsTable.jobId, jobId)),

    db.select({ status: invoicesTable.status })
      .from(invoicesTable)
      .where(eq(invoicesTable.jobId, jobId))
      .orderBy(desc(invoicesTable.createdAt))
      .limit(1),

    db.select({ name: subcontractorsTable.name })
      .from(jobSubcontractorsTable)
      .innerJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobSubcontractorsTable.jobId, jobId)),

    db.select({ objectPath: jobStartPhotosTable.objectPath })
      .from(jobStartPhotosTable)
      .innerJoin(jobChecklistsTable, eq(jobStartPhotosTable.jobChecklistId, jobChecklistsTable.id))
      .where(eq(jobChecklistsTable.jobId, jobId))
      .orderBy(asc(jobStartPhotosTable.createdAt))
      .limit(1),
  ]);

  const total = allItems.length;
  const done = allItems.filter(i => i.completed).length;
  const percentComplete = total > 0 ? Math.round((done / total) * 100) : 0;

  res.json({
    jobId,
    title: recent.title,
    clientName: recent.clientName,
    coverPhotoPath: photoRows[0]?.objectPath ?? null,
    checklistDone: done,
    checklistTotal: total,
    percentComplete,
    invoiceStatus: invoiceRows[0]?.status ?? null,
    crewNames: crewRows.map(c => c.name),
  });
}));

// ─── Recent Activity Feed ──────────────────────────────────────────────────────
// Aggregates the last 10 events across expenses, invoices, sub payments, and
// canonical owner withdrawals.
router.get("/recent-activity", wrapAsync(async (req, res) => {
  const OWNER_CATS = OWNER_WITHDRAWAL_EXPENSE_CATEGORIES;
  const scope = await requestedBusiness(req);
  if (invalidBusinessScope(res, scope, hasRequestedBusiness(req))) return;

  const [expenses, invoicesRows, subPays, ownerPay] = await Promise.all([
    // Regular expenses (not owner withdrawals, not auto-generated sub hours)
    db.select({
      id: expensesTable.id,
      description: expensesTable.description,
      amount: expensesTable.amount,
      category: expensesTable.category,
      createdAt: expensesTable.createdAt,
    })
      .from(expensesTable)
      .where(and(
        not(inArray(expensesTable.category, [...OWNER_CATS, "mileage"])),
        isNull(expensesTable.jobSubHoursId),
        scope
          ? mutationBusinessPredicate(
              { businessId: expensesTable.businessId, businessLine: expensesTable.businessLine },
              scope,
            )
          : undefined,
      ))
      .orderBy(desc(expensesTable.createdAt))
      .limit(10),

    // Recent invoices
    db.select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      status: invoicesTable.status,
      total: invoicesTable.total,
      clientName: clientsTable.name,
      createdAt: invoicesTable.createdAt,
    })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(scope
        ? mutationBusinessPredicate(
            { businessId: invoicesTable.businessId, businessLine: invoicesTable.businessLine },
            scope,
          )
        : undefined)
      .orderBy(desc(invoicesTable.createdAt))
      .limit(10),

    // Recent sub payments
    db.select({
      id: subPaymentRecordsTable.id,
      amount: subPaymentRecordsTable.amount,
      subName: subcontractorsTable.name,
      jobTitle: jobsTable.title,
      createdAt: subPaymentRecordsTable.createdAt,
    })
      .from(subPaymentRecordsTable)
      .leftJoin(subcontractorsTable, eq(subPaymentRecordsTable.subcontractorId, subcontractorsTable.id))
      .leftJoin(jobsTable, eq(subPaymentRecordsTable.jobId, jobsTable.id))
      .where(scope
        ? mutationBusinessPredicate(
            { businessId: jobsTable.businessId, businessLine: jobsTable.businessLine },
            scope,
          )
        : undefined)
      .orderBy(desc(subPaymentRecordsTable.createdAt))
      .limit(5),

    // Recent owner withdrawals. The canonical ledger is authoritative; legacy
    // owner-category expenses are excluded above so an event cannot appear twice.
    db.select({
      id: ownerCapitalEntriesTable.id,
      amount: ownerCapitalEntriesTable.amount,
      createdAt: ownerCapitalEntriesTable.createdAt,
    })
      .from(ownerCapitalEntriesTable)
      .where(and(
        lt(ownerCapitalEntriesTable.amount, "0"),
        isNull(ownerCapitalEntriesTable.voidedAt),
        scope ? eq(ownerCapitalEntriesTable.businessId, scope.id) : undefined,
      ))
      .orderBy(desc(ownerCapitalEntriesTable.createdAt))
      .limit(5),
  ]);

  const now = new Date();
  function relTime(d: Date): string {
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const events = [
    ...expenses.map(e => ({
      type: "expense",
      icon: "receipt",
      description: `${e.category}: ${e.description}`,
      amount: parseFloat(e.amount ?? "0"),
      date: e.createdAt.toISOString(),
      relativeTime: relTime(e.createdAt),
      linkPath: "/expenses",
    })),
    ...invoicesRows.map(i => ({
      type: "invoice",
      icon: "filetext",
      description: `Invoice #${i.invoiceNumber}${i.clientName ? ` · ${i.clientName}` : ""} — ${i.status}`,
      amount: parseFloat(i.total ?? "0"),
      date: i.createdAt.toISOString(),
      relativeTime: relTime(i.createdAt),
      linkPath: `/invoices?openInvoice=${i.id}`,
    })),
    ...subPays.map(p => ({
      type: "sub_payment",
      icon: "hardhat",
      description: `Paid ${p.subName ?? "subcontractor"}${p.jobTitle ? ` · ${p.jobTitle}` : ""}`,
      amount: parseFloat(p.amount ?? "0"),
      date: p.createdAt.toISOString(),
      relativeTime: relTime(p.createdAt),
      linkPath: "/people",
    })),
    ...ownerPay.map(p => ({
      type: "owner_pay",
      icon: "wallet",
      description: "Owner withdrawal recorded",
      amount: Math.abs(parseFloat(p.amount ?? "0")),
      date: p.createdAt.toISOString(),
      relativeTime: relTime(p.createdAt),
      linkPath: "/accounting",
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  res.json(events);
}));

export default router;
