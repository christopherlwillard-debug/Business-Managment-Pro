import express, { type Express, type Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";
import squareWebhookRouter from "./routes/square-webhook";
import publicStatusRouter from "./routes/public-status";
import publicQuotesRouter from "./routes/public-quotes";
import seoCrawlRouter from "./routes/seo-crawl";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());

// ── Root-level SEO crawl routes (sitemap.xml + robots.txt) ────────────────────
// Registered before JSON body parsing and auth so that search-engine crawlers
// on custom domains receive correct XML/plaintext instead of the SPA fallback.
app.use(seoCrawlRouter);

app.use(express.json({
  limit: "25mb",
  verify: (req, _res, buffer) => {
    // Square signs the exact request bytes, not a JSON re-serialization.
    const request = req as Request & { rawBody?: string };
    if (request.originalUrl.startsWith("/api/webhooks/square")) {
      request.rawBody = buffer.toString("utf8");
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Public provider callback: parse JSON and retain the exact signed body first,
// but keep this route ahead of the authenticated application router.
app.use("/api/webhooks/square", squareWebhookRouter);

// Public routes — no auth required
app.use("/api/public", publicStatusRouter);
app.use("/api/public/quotes", publicQuotesRouter);

app.use(authMiddleware);

app.use("/api", router);

// ── Global JSON error handler ──────────────────────────────────────────────────
// Catches any error passed to next(err) by wrapAsync and returns structured JSON
// instead of Express's default HTML error page. Must be registered last.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

export default app;
