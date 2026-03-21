import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
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
router.use("/portal", portalRouter);
router.use("/vendors", vendorsRouter);
router.use("/compliance-items", complianceItemsRouter);

export default router;
