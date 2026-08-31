import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function sendHealthResponse(_req: Request, res: Response) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

// Keep the API mount point probeable as well as the explicit health endpoint.
// Some artifact promotion probes use the service path (/api) instead of the
// configured startup path (/api/healthz).
router.get("/", sendHealthResponse);
router.get("/healthz", sendHealthResponse);

export default router;
