import { Router } from "express";
import { db } from "@workspace/db";
import {
  complianceItemsTable,
  routeStopsTable,
  clientsTable,
  prospectsTable,
  invoicesTable,
} from "@workspace/db/schema";
import { eq, asc, lte, ne, and, isNotNull } from "drizzle-orm";
import { wrapAsync } from "./guards";

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
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const [complianceRows, routeStopRows, prospectRows, overdueInvoiceRows] = await Promise.all([
    // Compliance items
    db.select({
      id: complianceItemsTable.id,
      title: complianceItemsTable.title,
      dueDate: complianceItemsTable.dueDate,
      status: complianceItemsTable.status,
    })
      .from(complianceItemsTable)
      .orderBy(asc(complianceItemsTable.dueDate)),

    // Today's route stops
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
      .where(eq(routeStopsTable.scheduledDate, todayStr)),

    // Follow-up prospects due today or earlier, not lost
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
        )
      ),

    // Overdue invoices
    db.select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      clientName: clientsTable.name,
      dueDate: invoicesTable.dueDate,
      total: invoicesTable.total,
    })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.status, "overdue")),
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

export default router;
