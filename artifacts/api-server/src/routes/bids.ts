import { Router } from "express";
import { db } from "@workspace/db";
import { bidOpportunitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    let rows;
    if (status && typeof status === "string") {
      rows = await db
        .select()
        .from(bidOpportunitiesTable)
        .where(eq(bidOpportunitiesTable.status, status))
        .orderBy(desc(bidOpportunitiesTable.createdAt));
    } else {
      rows = await db
        .select()
        .from(bidOpportunitiesTable)
        .orderBy(desc(bidOpportunitiesTable.createdAt));
    }
    res.json(rows);
  } catch (err) {
    console.error("[bids] GET /bids error:", err);
    res.status(500).json({ error: "Failed to load bids" });
  }
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { status } = req.body as { status?: string };
  const allowed = ["new", "interested", "dismissed"];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status. Must be new, interested, or dismissed." });
    return;
  }

  try {
    const [updated] = await db
      .update(bidOpportunitiesTable)
      .set({ status })
      .where(eq(bidOpportunitiesTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Bid not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error("[bids] PATCH /bids/:id error:", err);
    res.status(500).json({ error: "Failed to update bid" });
  }
});

export default router;
