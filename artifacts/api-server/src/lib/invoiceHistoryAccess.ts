import type { RequestHandler } from "express";

export function ownerOnlyInvoiceHistory(resolveOwnerId: () => Promise<string | null>): RequestHandler {
  return (req, res, next) => {
    void resolveOwnerId().then(ownerId => {
      const userId = (req.user as { id?: string } | undefined)?.id;
      if (!userId || !ownerId || ownerId !== userId) {
        res.status(403).json({ error: "Owner access required" });
        return;
      }
      next();
    }).catch(next);
  };
}
