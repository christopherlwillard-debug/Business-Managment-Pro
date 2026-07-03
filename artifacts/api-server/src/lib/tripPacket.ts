import { db } from "@workspace/db";
import {
  jobsTable,
  clientsTable,
  jobSubcontractorsTable,
  subcontractorsTable,
  expensesTable,
  dailyLogsTable,
  invoicesTable,
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobFinishedPhotosTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

// Travel-related expense categories. "Fuel/Travel" exists today;
// the others are added by the travel-expense linking task and will
// automatically be picked up here once expenses use them.
export const TRAVEL_CATEGORIES = [
  "fuel/travel",
  "travel/lodging",
  "meals",
  "parking/tolls",
];

export function isTravelCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return TRAVEL_CATEGORIES.includes(category.trim().toLowerCase());
}

/** Convert a raw DB object path to a serving URL (same rules as expenses route). */
export function toServingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
  if (raw.startsWith("/uploads/")) return `/api${raw}`;
  return raw;
}

export interface PacketPhoto {
  url: string;      // serving URL for the browser
  rawPath: string;  // raw stored path (used by PDF generator to download bytes)
}

export interface PacketExpense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  vendor: string | null;
  businessPurpose: string | null; // expense notes field
  receiptUrl: string | null;      // serving URL
  receiptRawPath: string | null;  // raw stored path
}

export interface PacketDailyLog {
  id: number;
  date: string;
  weather: string | null;
  crewCount: number | null;
  workCompleted: string | null;
  issues: string | null;
  materialsUsed: string | null;
  hoursWorked: string | null;
  notes: string | null;
  authorName: string | null;
  photos: PacketPhoto[];
}

export interface PacketInvoice {
  id: number;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  total: number;
  amountPaid: number | null;
  paidAt: string | null;
}

export interface TripPacketData {
  generatedAt: string;
  companyName: string | null;
  job: {
    id: number;
    title: string;
    description: string | null;
    status: string;
    jobType: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    locationName: string | null;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  };
  client: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  } | null;
  crew: string[];
  travelExpenses: PacketExpense[];
  travelTotal: number;
  otherExpenses: { count: number; total: number };
  dailyLogs: PacketDailyLog[];
  finishedPhotos: PacketPhoto[];
  checklist: {
    templateName: string;
    completedItems: number;
    totalItems: number;
    percent: number;
  } | null;
  invoices: PacketInvoice[];
}

export async function buildTripPacketData(jobId: number): Promise<TripPacketData | null> {
  const [jobRow] = await db
    .select({
      id: jobsTable.id,
      title: jobsTable.title,
      description: jobsTable.description,
      status: jobsTable.status,
      jobType: jobsTable.jobType,
      address: jobsTable.address,
      city: jobsTable.city,
      state: jobsTable.state,
      locationName: jobsTable.locationName,
      startDate: jobsTable.startDate,
      endDate: jobsTable.endDate,
      notes: jobsTable.notes,
      clientName: clientsTable.name,
      clientEmail: clientsTable.email,
      clientPhone: clientsTable.phone,
      clientAddress: clientsTable.address,
      clientCity: clientsTable.city,
      clientState: clientsTable.state,
    })
    .from(jobsTable)
    .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
    .where(eq(jobsTable.id, jobId));

  if (!jobRow) return null;

  const [crewRows, expenseRows, logRows, invoiceRows, checklistRows, settingsRows] = await Promise.all([
    db.select({ name: subcontractorsTable.name })
      .from(jobSubcontractorsTable)
      .innerJoin(subcontractorsTable, eq(jobSubcontractorsTable.subcontractorId, subcontractorsTable.id))
      .where(eq(jobSubcontractorsTable.jobId, jobId)),
    db.select()
      .from(expensesTable)
      .where(eq(expensesTable.jobId, jobId))
      .orderBy(asc(expensesTable.date)),
    db.select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.jobId, jobId))
      .orderBy(asc(dailyLogsTable.date)),
    db.select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      status: invoicesTable.status,
      issueDate: invoicesTable.issueDate,
      total: invoicesTable.total,
      amountPaid: invoicesTable.amountPaid,
      squarePaidAt: invoicesTable.squarePaidAt,
      stripePaidAt: invoicesTable.stripePaidAt,
    })
      .from(invoicesTable)
      .where(eq(invoicesTable.jobId, jobId))
      .orderBy(asc(invoicesTable.issueDate)),
    db.select()
      .from(jobChecklistsTable)
      .where(eq(jobChecklistsTable.jobId, jobId))
      .limit(1),
    db.select({ companyName: settingsTable.companyName }).from(settingsTable).limit(1),
  ]);

  // ── Expenses: travel vs other ─────────────────────────────────────────────
  const travelExpenses: PacketExpense[] = [];
  let travelTotal = 0;
  let otherCount = 0;
  let otherTotal = 0;
  for (const e of expenseRows) {
    const amount = parseFloat(e.amount ?? "0");
    if (isTravelCategory(e.category)) {
      travelExpenses.push({
        id: e.id,
        description: e.description,
        amount,
        category: e.category,
        date: e.date,
        vendor: e.vendor ?? null,
        businessPurpose: e.notes ?? null,
        receiptUrl: toServingUrl(e.receiptUrl),
        receiptRawPath: e.receiptUrl ?? null,
      });
      travelTotal += amount;
    } else if (e.category !== "Owner Draw") {
      otherCount += 1;
      otherTotal += amount;
    }
  }

  // ── Daily logs with photos ────────────────────────────────────────────────
  const dailyLogs: PacketDailyLog[] = logRows.map((l) => {
    const rawPhotos: string[] = Array.isArray(l.photoUrls) ? (l.photoUrls as string[]) : [];
    return {
      id: l.id,
      date: l.date,
      weather: l.weather ?? null,
      crewCount: l.crewCount ?? null,
      workCompleted: l.workCompleted ?? null,
      issues: l.issues ?? null,
      materialsUsed: l.materialsUsed ?? null,
      hoursWorked: l.hoursWorked ?? null,
      notes: l.notes ?? null,
      authorName: l.authorName ?? null,
      photos: rawPhotos
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map((p) => ({ url: toServingUrl(p) as string, rawPath: p })),
    };
  });

  // ── Checklist (signed completion doc) + finished photos ──────────────────
  let checklist: TripPacketData["checklist"] = null;
  let finishedPhotos: PacketPhoto[] = [];
  if (checklistRows.length > 0) {
    const cl = checklistRows[0];
    const [sections, items, finishedRows] = await Promise.all([
      db.select()
        .from(jobChecklistSectionsTable)
        .where(eq(jobChecklistSectionsTable.jobChecklistId, cl.id)),
      db.select()
        .from(jobChecklistItemsTable)
        .where(eq(jobChecklistItemsTable.jobChecklistId, cl.id)),
      db.select()
        .from(jobFinishedPhotosTable)
        .where(eq(jobFinishedPhotosTable.jobChecklistId, cl.id))
        .orderBy(asc(jobFinishedPhotosTable.createdAt)),
    ]);
    const activeSectionIds = new Set(sections.filter(s => s.active).map(s => s.id));
    const activeItems = items.filter(i => activeSectionIds.has(i.jobChecklistSectionId) && !i.skipped);
    const completedItems = activeItems.filter(i => i.completed);
    checklist = {
      templateName: cl.templateName,
      completedItems: completedItems.length,
      totalItems: activeItems.length,
      percent: activeItems.length === 0 ? 0 : Math.round((completedItems.length / activeItems.length) * 100),
    };
    finishedPhotos = finishedRows.map(p => ({
      url: toServingUrl(p.objectPath) as string,
      rawPath: p.objectPath,
    }));
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  const invoices: PacketInvoice[] = invoiceRows.map((inv) => {
    const paidAtDate = inv.squarePaidAt ?? inv.stripePaidAt ?? null;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issueDate: inv.issueDate,
      total: parseFloat(inv.total ?? "0"),
      amountPaid: inv.amountPaid != null ? parseFloat(inv.amountPaid) : null,
      paidAt: paidAtDate instanceof Date ? paidAtDate.toISOString() : paidAtDate,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    companyName: settingsRows[0]?.companyName ?? null,
    job: {
      id: jobRow.id,
      title: jobRow.title,
      description: jobRow.description,
      status: jobRow.status,
      jobType: jobRow.jobType,
      address: jobRow.address,
      city: jobRow.city,
      state: jobRow.state,
      locationName: jobRow.locationName,
      startDate: jobRow.startDate,
      endDate: jobRow.endDate,
      notes: jobRow.notes,
    },
    client: jobRow.clientName
      ? {
          name: jobRow.clientName,
          email: jobRow.clientEmail,
          phone: jobRow.clientPhone,
          address: jobRow.clientAddress,
          city: jobRow.clientCity,
          state: jobRow.clientState,
        }
      : null,
    crew: crewRows.map(r => r.name).filter(Boolean),
    travelExpenses,
    travelTotal,
    otherExpenses: { count: otherCount, total: otherTotal },
    dailyLogs,
    finishedPhotos,
    checklist,
    invoices,
  };
}
