import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.post("/errors", (req, res) => {
  const { message, stack, componentStack, location } = req.body ?? {};

  const timestamp = new Date().toISOString();
  const loc = location ?? "unknown";

  console.error(
    `[crash-report] ${timestamp} | location=${loc} | message=${message ?? "(none)"}\n` +
      `  stack: ${stack ?? "(none)"}\n` +
      (componentStack ? `  componentStack: ${componentStack}` : ""),
  );

  res.status(204).end();
});

export default router;
