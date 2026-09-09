import { routeStopsTable, squarePaymentsTable } from "@workspace/db/schema";

/**
 * These tables predate canonical business ownership in production. Keep the
 * client-profile projection explicit until their production schemas are
 * migrated so Drizzle does not select model-only columns such as business_id.
 * Access remains scoped through the already-authorized client foreign key.
 */
export const clientProfileSquarePaymentColumns = {
  id: squarePaymentsTable.id,
  squarePaymentId: squarePaymentsTable.squarePaymentId,
  amountCents: squarePaymentsTable.amountCents,
  description: squarePaymentsTable.description,
  invoiceId: squarePaymentsTable.invoiceId,
  invoiceNumber: squarePaymentsTable.invoiceNumber,
  clientName: squarePaymentsTable.clientName,
  clientId: squarePaymentsTable.clientId,
  paidAt: squarePaymentsTable.paidAt,
  createdAt: squarePaymentsTable.createdAt,
};

export const clientProfileRouteStopColumns = {
  id: routeStopsTable.id,
  title: routeStopsTable.title,
  address: routeStopsTable.address,
  lat: routeStopsTable.lat,
  lng: routeStopsTable.lng,
  notes: routeStopsTable.notes,
  scheduledDate: routeStopsTable.scheduledDate,
  status: routeStopsTable.status,
  estimatedDurationMinutes: routeStopsTable.estimatedDurationMinutes,
  sortOrder: routeStopsTable.sortOrder,
  blockNumber: routeStopsTable.blockNumber,
  crewLabel: routeStopsTable.crewLabel,
  clientId: routeStopsTable.clientId,
  prospectId: routeStopsTable.prospectId,
  jobId: routeStopsTable.jobId,
  createdAt: routeStopsTable.createdAt,
};