import express, { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import path from "path";
import { db, accessRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import healthRouter from "./health";
import authRouter from "./auth";
import { invalidateOwnerCache } from "./owner-cache";
import {
  sectionGuard,
  getOwnerId,
  getRequestUserId,
  getRequestUser,
  wrapAsync,
  WRITE_METHODS,
} from "./guards";
import clientsRouter from "./clients";
import jobsRouter from "./jobs";
import invoicesRouter from "./invoices";
import expensesRouter from "./expenses";
import mileageRouter from "./mileage";
import jobMileageRouter from "./job-mileage";
import subcontractorsRouter from "./subcontractors";
import estimatesRouter from "./estimates";
import dailyLogsRouter from "./daily-logs";
import settingsRouter from "./settings";
import reportsRouter from "./reports";
import uploadsRouter from "./uploads";
import portalRouter from "./portal";
import vendorsRouter from "./vendors";
import complianceItemsRouter from "./compliance-items";
import kyFilingSettingsRouter from "./ky-filing-settings";
import expenseImportRouter from "./expense-import";
import paymentsRouter from "./payments";
import taxReportsRouter from "./tax-reports";
import recurringExpensesRouter from "./recurring-expenses";
import clientBillingProfilesRouter from "./client-billing-profiles";
import materialsRouter from "./materials";
import materialListsRouter from "./material-lists";
import registeredAgentRouter from "./registered-agent";
import form1099sRouter from "./form-1099s";
import teamRouter from "./team";
import otherIncomeRouter from "./other-income";
import storageRouter from "./storage";
import routeStopsRouter from "./route-stops";
import prospectsRouter from "./prospects";
import estimatedTaxPaymentsRouter from "./estimated-tax-payments";
import assetsRouter from "./assets";
import geocodeRouter from "./geocode";
import integrationsRouter from "./integrations";
import dashboardTasksRouter from "./dashboard-tasks";
import squareInvoiceRouter from "./square-invoice";
import quickChargesRouter from "./quick-charges";
import squareDepositRouter from "./square-deposit";
import squareStatusRouter from "./square-status";
import payPublicRouter from "./pay-public";
import squareMobileRouter from "./square-payments";
import squareTransactionsRouter from "./square-transactions";
import squareCustomersRouter from "./square-customers";
import pdfRouter from "./pdf";
import plaidRouter from "./plaid.js";
import bidsRouter from "./bids.js";
import grantsRouter from "./grants.js";
import aerialRouter from "./aerial.js";
import dashboardRouter from "./dashboard.js";
import businessesRouter from "./businesses";
import contactsRouter from "./contacts";
import jobSubHoursRouter from "./job-sub-hours";
import subHoursAliasRouter from "./sub-hours-alias";
import jobTypeBenchmarksRouter from "./job-type-benchmarks";
import wixIntegrationRouter from "./wix-integration";
import { websiteRouter, websitePublicRouter } from "./website";
import errorsRouter from "./errors";
import adminErrorsRouter from "./admin-errors";
import adminMigrationsRouter from "./admin-migrations";
import ownerCapitalRouter from "./owner-capital";
import checklistTemplatesRouter from "./checklist-templates";
import jobChecklistsRouter from "./job-checklists";
import { mfhLibraryRouter, mfhJobRouter } from "./mfh";
import laborEntriesRouter from "./mfh-labor";
import productionServiceTypesRouter from "./production-service-types";
import serviceAddonPromptsRouter from "./service-addon-prompts";
import tripsRouter from "./trips";
import investmentsRouter from "./investments";
import vehiclesRouter from "./vehicles";
import propertyLookupRouter from "./property-lookup";
import equipmentRouter from "./equipment.js";
import crewRouter from "./crew";

export type { SectionKey, SectionPermission, Permissions } from "./guards";
export { invalidateOwnerCache };

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const requireOwnerForWrites: RequestHandler = wrapAsync(async (req, res, next) => {
  const isWrite = WRITE_METHODS.has(req.method.toUpperCase());
  if (!isWrite) { next(); return; }
  const userId = getRequestUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ownerId = await getOwnerId();
  if (ownerId === userId) { next(); return; }
  res.status(403).json({ error: "Owner access required" });
});

const requireOwner: RequestHandler = wrapAsync(async (req, res, next) => {
  const userId = getRequestUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ownerId = await getOwnerId();
  if (ownerId === userId) { next(); return; }
  res.status(403).json({ error: "Owner access required" });
});

const requireAccess: RequestHandler = wrapAsync(async (req, res, next) => {
  const userId = getRequestUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ownerId = await getOwnerId();
  if (ownerId === userId) { next(); return; }

  const [record] = await db
    .select({ status: accessRequestsTable.status })
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.userId, userId));

  if (record?.status === "approved") { next(); return; }
  if (record?.status === "rejected") { res.status(403).json({ error: "ACCESS_REJECTED" }); return; }
  if (record?.status === "pending") { res.status(403).json({ error: "ACCESS_PENDING" }); return; }

  const user = getRequestUser(req);
  const userEmail = user?.email ? user.email.trim().toLowerCase() : null;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || userId;

  if (userEmail) {
    const [inviteRecord] = await db
      .select({ id: accessRequestsTable.id })
      .from(accessRequestsTable)
      .where(and(
        eq(accessRequestsTable.userEmail, userEmail),
        eq(accessRequestsTable.status, "invited"),
      ));

    if (inviteRecord) {
      await db
        .update(accessRequestsTable)
        .set({
          userId,
          userName,
          profileImageUrl: user?.profileImageUrl ?? null,
          status: "approved",
          resolvedAt: new Date(),
        })
        .where(eq(accessRequestsTable.id, inviteRecord.id));
      next();
      return;
    }
  }

  await db
    .insert(accessRequestsTable)
    .values({
      userId,
      userName,
      userEmail,
      profileImageUrl: user?.profileImageUrl ?? null,
      status: "pending",
      requestedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: accessRequestsTable.userId,
      set: {
        userName,
        userEmail,
        profileImageUrl: user?.profileImageUrl ?? null,
      },
    });

  res.status(403).json({ error: "ACCESS_PENDING" });
});

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(errorsRouter);

// Pre-auth: allow MIGRATION_KEY header to bypass auth for one-time seed/migration operations.
// router.use() strips the "/admin/migrations" prefix before passing to the subrouter,
// so route matching inside adminMigrationsRouter works correctly.
// If no valid key is present, next() falls through to requireAuth → requireOwner → same router.
router.use("/admin/migrations", (req, res, next) => {
  const key = req.headers["x-migration-key"];
  const envKey = process.env["MIGRATION_KEY"];
  if (envKey && key === envKey) {
    return adminMigrationsRouter(req, res, next);
  }
  next();
});

router.use("/portal", portalRouter);
router.use("/pay", payPublicRouter);
router.use("/public/site", websitePublicRouter);
router.use("/integrations/wix", wixIntegrationRouter);

// Development-only: inject a session for a known userId, bypassing OIDC (for automated testing)
if (process.env.NODE_ENV !== "production") {
  router.get("/dev-test-login", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) { res.status(400).json({ error: "userId required" }); return; }
    try {
      const { db: dbConn, usersTable: ut } = await import("@workspace/db");
      const { eq: eqFn } = await import("drizzle-orm");
      const { createSession, SESSION_COOKIE, SESSION_TTL } = await import("../lib/auth");
      const [user] = await dbConn.select().from(ut).where(eqFn(ut.id, userId)).limit(1);
      if (!user) { res.status(404).json({ error: "User not found" }); return; }
      const sid = await createSession({
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
        access_token: "dev-test-token",
        expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      });
      res.cookie(SESSION_COOKIE, sid, { httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: SESSION_TTL });
      res.redirect((req.query.returnTo as string) || "/");
    } catch (err) {
      console.error("dev-test-login error", err);
      res.status(500).json({ error: "Internal error" });
    }
  });
}

router.use(requireAuth);
router.use(requireAccess);


router.use("/uploads", express.static(path.resolve("uploads")));

router.use("/pdf", pdfRouter);
router.use("/clients", sectionGuard("clients"), clientsRouter);
router.use("/jobs", sectionGuard("jobs"), jobsRouter);
router.use("/invoices", sectionGuard("invoices"), invoicesRouter);
router.use("/expenses", sectionGuard("expenses"), expensesRouter);
router.use("/mileage", sectionGuard("mileage"), jobMileageRouter);
router.use("/mileage", sectionGuard("mileage"), mileageRouter);
router.use("/subcontractors", sectionGuard("subcontractors"), subcontractorsRouter);
router.use("/estimates", sectionGuard("estimates"), estimatesRouter);
router.use("/daily-logs", sectionGuard("daily_logs"), dailyLogsRouter);
router.use("/compliance-items", sectionGuard("compliance"), complianceItemsRouter);
router.use("/ky-filing-settings", sectionGuard("compliance"), kyFilingSettingsRouter);

router.use("/settings", requireOwnerForWrites, settingsRouter);
router.use("/reports", reportsRouter);
router.use("/uploads", uploadsRouter);
router.use("/vendors", requireOwner, vendorsRouter);
router.use("/expense-import", sectionGuard("expenses"), expenseImportRouter);
router.use("/payments", sectionGuard("invoices"), paymentsRouter);
router.use("/tax-reports", sectionGuard("invoices"), taxReportsRouter);
router.use("/recurring-expenses", sectionGuard("expenses"), recurringExpensesRouter);
router.use("/client-billing-profiles", sectionGuard("clients"), clientBillingProfilesRouter);
router.use("/materials", requireOwner, materialsRouter);
router.use("/material-lists", sectionGuard("jobs"), materialListsRouter);
router.use("/registered-agent", sectionGuard("compliance"), registeredAgentRouter);
router.use("/1099s", sectionGuard("subcontractors"), form1099sRouter);
router.use("/team", teamRouter);
router.use("/other-income", sectionGuard("invoices"), otherIncomeRouter);
router.use(storageRouter);
router.use("/route-stops", requireOwner, routeStopsRouter);
router.use("/prospects", requireOwner, prospectsRouter);
router.use("/estimated-tax-payments", requireOwner, estimatedTaxPaymentsRouter);
router.use("/assets", requireOwner, assetsRouter);
router.use(geocodeRouter);
router.use("/invoices", sectionGuard("invoices"), squareInvoiceRouter);
router.use("/quick-charges", requireOwner, quickChargesRouter);
router.use(requireOwner, squareDepositRouter);
router.use(requireOwner, squareStatusRouter);
router.use(requireOwner, squareMobileRouter);
router.use(requireOwner, squareTransactionsRouter);
router.use("/square/customers", requireOwner, squareCustomersRouter);
router.use("/plaid", plaidRouter);
router.use("/bids", requireOwner, bidsRouter);
router.use("/grants", requireOwner, grantsRouter);
router.use(requireOwner, aerialRouter);
router.use("/dashboard", requireOwner, dashboardRouter);
router.use("/businesses", requireOwner, businessesRouter);
router.use("/contacts", requireOwner, contactsRouter);
router.use("/owner-capital", requireOwner, ownerCapitalRouter);
router.use("/jobs", sectionGuard("jobs"), jobSubHoursRouter);
// Canonical /api/sub-hours/:id endpoints (PUT + DELETE by ID)
router.use("/sub-hours", sectionGuard("jobs"), subHoursAliasRouter);
router.use("/job-type-benchmarks", requireOwner, jobTypeBenchmarksRouter);
router.use("/website", requireOwner, websiteRouter);
router.use("/admin/errors", requireOwner, adminErrorsRouter);
router.use("/admin/migrations", requireOwner, adminMigrationsRouter);
router.use("/checklist-templates", requireOwner, checklistTemplatesRouter);
router.use("/jobs", sectionGuard("jobs"), jobChecklistsRouter);

// Job-card MFH endpoints (apply/update/reset/snapshot) — usable by anyone with Jobs permission.
router.use("/mfh", sectionGuard("jobs"), mfhJobRouter);
router.use("/mfh", sectionGuard("jobs"), requireOwnerForWrites, mfhLibraryRouter);
router.use("/jobs", sectionGuard("jobs"), laborEntriesRouter);
router.use("/production-service-types", sectionGuard("jobs"), requireOwnerForWrites, productionServiceTypesRouter);
router.use("/service-addon-prompts", sectionGuard("jobs"), requireOwnerForWrites, serviceAddonPromptsRouter);
router.use("/trips", requireOwner, tripsRouter);
router.use("/investments", requireOwner, investmentsRouter);
router.use("/vehicles", requireOwner, vehiclesRouter);
router.use(requireOwner, propertyLookupRouter);
router.use("/equipment", requireOwner, equipmentRouter);

router.get("/integrations/wix/config", requireOwner, (req, res) => {
  const token = process.env["WIX_WEBHOOK_SECRET"] ?? null;
  const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const webhookUrl = `${protocol}://${host}/api/integrations/wix`;
  res.json({ webhookUrl, token });
});

// Integrations & APIs management — registered AFTER the specific /integrations/wix/* routes
// so those take priority for wix paths.
router.use("/integrations", requireOwner, integrationsRouter);
router.use("/dashboard-tasks", requireOwner, dashboardTasksRouter);
router.use("/crew", requireOwner, crewRouter);

export default router;
