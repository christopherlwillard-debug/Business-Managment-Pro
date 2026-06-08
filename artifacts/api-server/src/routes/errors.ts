import { Router, type IRouter } from "express";
import { db, clientErrorsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

const router: IRouter = Router();

const PRUNE_DAYS = 30;

router.post("/errors", async (req, res) => {
  const { message, stack, componentStack, location } = req.body ?? {};
  const userAgent = req.headers["user-agent"] ?? null;

  const timestamp = new Date().toISOString();
  const loc = location ?? "unknown";

  console.error(
    `[crash-report] ${timestamp} | location=${loc} | message=${message ?? "(none)"}\n` +
      `  stack: ${stack ?? "(none)"}\n` +
      (componentStack ? `  componentStack: ${componentStack}` : ""),
  );

  try {
    await db.insert(clientErrorsTable).values({
      message: message ?? "(none)",
      stack: stack ?? null,
      componentStack: componentStack ?? null,
      location: loc,
      userAgent: userAgent as string | null,
    });

    const cutoff = new Date(Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000);
    await db.delete(clientErrorsTable).where(lt(clientErrorsTable.createdAt, cutoff));
  } catch (err) {
    console.error("[crash-report] failed to persist error:", err);
  }

  res.status(204).end();
});

export default router;
