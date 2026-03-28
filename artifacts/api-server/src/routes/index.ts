import express, { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import path from "path";
import { db, settingsTable, accessRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import healthRouter from "./health";
import authRouter from "./auth";
import clientsRouter from "./clients";
import jobsRouter from "./jobs";
import invoicesRouter from "./invoices";
import expensesRouter from "./expenses";
import mileageRouter from "./mileage";
import subcontractorsRouter from "./subcontractors";
import estimatesRouter from "./estimates";
import dailyLogsRouter from "./daily-logs";
import settingsRouter from "./settings";
import reportsRouter from "./reports";
import uploadsRouter from "./uploads";
import portalRouter from "./portal";
import vendorsRouter from "./vendors";
import complianceItemsRouter from "./compliance-items";
import expenseImportRouter from "./expense-import";
import paymentsRouter from "./payments";
import taxReportsRouter from "./tax-reports";
import recurringExpensesRouter from "./recurring-expenses";
import materialsRouter from "./materials";
import materialListsRouter from "./material-lists";
import registeredAgentRouter from "./registered-agent";
import form1099sRouter from "./form-1099s";
import teamRouter from "./team";

export type SectionKey =
  | "expenses"
  | "jobs"
  | "invoices"
  | "clients"
  | "mileage"
  | "subcontractors"
  | "daily_logs"
  | "estimates"
  | "compliance";

export type SectionPermission = { view: boolean; edit: boolean };
export type Permissions = Record<SectionKey, SectionPermission>;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let cachedOwnerId: string | null | undefined = undefined;

async function getOwnerId(): Promise<string | null> {
  if (cachedOwnerId !== undefined) return cachedOwnerId;
  const [settings] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
  cachedOwnerId = settings?.ownerUserId ?? null;
  return cachedOwnerId;
}

export function invalidateOwnerCache() {
  cachedOwnerId = undefined;
}

function getRequestUserId(req: Request): string | undefined {
  return (req.user as { id?: string } | undefined)?.id;
}

function wrapAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next); };
}

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

async function requireAccess(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).user?.id as string;
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

  const user = (req as any).user as any;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || userId;

  await db
    .insert(accessRequestsTable)
    .values({
      userId,
      userName,
      userEmail: user?.email ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      status: "pending",
      requestedAt: new Date(),
    })
    .onConflictDoNothing();

  res.status(403).json({ error: "ACCESS_PENDING" });
}

function sectionGuard(section: SectionKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id as string;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const ownerId = await getOwnerId();
    if (ownerId === userId) { next(); return; }

    const [record] = await db
      .select({ permissions: accessRequestsTable.permissions })
      .from(accessRequestsTable)
      .where(and(eq(accessRequestsTable.userId, userId), eq(accessRequestsTable.status, "approved")));

    if (!record) { res.status(403).json({ error: "Forbidden" }); return; }

    const perms = record.permissions as Permissions | null;
    const sectionPerms = perms?.[section];

    if (!sectionPerms) { res.status(403).json({ error: "Forbidden" }); return; }

    const isWrite = WRITE_METHODS.has(req.method.toUpperCase());
    const allowed = isWrite ? sectionPerms.edit : sectionPerms.view;

    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  };
}

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use("/portal", portalRouter);

router.use(requireAuth);
router.use(requireAccess as any);

router.use("/uploads", express.static(path.resolve("uploads")));

router.use("/clients", sectionGuard("clients") as any, clientsRouter);
router.use("/jobs", sectionGuard("jobs") as any, jobsRouter);
router.use("/invoices", sectionGuard("invoices") as any, invoicesRouter);
router.use("/expenses", sectionGuard("expenses") as any, expensesRouter);
router.use("/mileage", sectionGuard("mileage") as any, mileageRouter);
router.use("/subcontractors", sectionGuard("subcontractors") as any, subcontractorsRouter);
router.use("/estimates", sectionGuard("estimates") as any, estimatesRouter);
router.use("/daily-logs", sectionGuard("daily_logs") as any, dailyLogsRouter);
router.use("/compliance-items", sectionGuard("compliance") as any, complianceItemsRouter);

router.use("/settings", requireOwnerForWrites, settingsRouter);
router.use("/reports", requireOwnerForWrites, reportsRouter);
router.use("/uploads", uploadsRouter);
router.use("/vendors", requireOwnerForWrites, vendorsRouter);
router.use("/expense-import", requireOwnerForWrites, expenseImportRouter);
router.use("/payments", requireOwnerForWrites, paymentsRouter);
router.use("/tax-reports", requireOwner, taxReportsRouter);
router.use("/recurring-expenses", requireOwnerForWrites, recurringExpensesRouter);
router.use("/materials", requireOwner, materialsRouter);
router.use("/material-lists", requireOwnerForWrites, materialListsRouter);
router.use("/registered-agent", requireOwnerForWrites, registeredAgentRouter);
router.use("/1099s", requireOwnerForWrites, form1099sRouter);
router.use("/team", teamRouter);

export default router;
