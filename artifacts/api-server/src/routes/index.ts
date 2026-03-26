import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import path from "path";
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

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

// Portal routes are public — token-based auth is handled inside the router
router.use("/portal", portalRouter);

// All other routes require a valid session
router.use(requireAuth);

// Serve uploaded files (receipts, logos, etc.) — behind auth
router.use("/uploads", express.static(path.resolve("uploads")));

router.use("/clients", clientsRouter);
router.use("/jobs", jobsRouter);
router.use("/invoices", invoicesRouter);
router.use("/expenses", expensesRouter);
router.use("/mileage", mileageRouter);
router.use("/subcontractors", subcontractorsRouter);
router.use("/estimates", estimatesRouter);
router.use("/daily-logs", dailyLogsRouter);
router.use("/settings", settingsRouter);
router.use("/reports", reportsRouter);
router.use("/uploads", uploadsRouter);
router.use("/vendors", vendorsRouter);
router.use("/compliance-items", complianceItemsRouter);
router.use("/expense-import", expenseImportRouter);
router.use("/payments", paymentsRouter);
router.use("/tax-reports", taxReportsRouter);
router.use("/recurring-expenses", recurringExpensesRouter);
router.use("/materials", materialsRouter);
router.use("/material-lists", materialListsRouter);

export default router;
