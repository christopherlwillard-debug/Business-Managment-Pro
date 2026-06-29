import { Router } from "express";

// Phase 1 stub — MFH library routes are temporarily unavailable while the
// production database migration (0041_mfh_home_series) is applied.
// Phase 2 will restore the full implementation.
const MAINTENANCE = { error: "MFH library is temporarily under maintenance. Please check back in a few minutes." };

export const mfhLibraryRouter = Router();
export const mfhJobRouter = Router();

mfhLibraryRouter.use((_req, res) => res.status(503).json(MAINTENANCE));
mfhJobRouter.use((_req, res) => res.status(503).json(MAINTENANCE));

export default mfhLibraryRouter;
