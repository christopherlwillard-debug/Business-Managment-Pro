import { Router } from "express";
import { db } from "@workspace/db";
import { bidOpportunitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchBidDocument } from "../lib/bidDocumentFetcher.js";

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

router.post("/:id/summarize", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    const [bid] = await db
      .select()
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.id, id))
      .limit(1);

    if (!bid) {
      res.status(404).json({ error: "Bid not found" });
      return;
    }

    if (bid.aiSummary) {
      res.json({ summary: bid.aiSummary, cached: true });
      return;
    }

    const doc = await fetchBidDocument({
      noticeId: bid.noticeId,
      url: bid.url,
      source: bid.source,
      description: bid.description,
    });

    const prompt = `You are analyzing a government bid solicitation for an asphalt and sealcoating contractor. Extract key information and return ONLY valid JSON (no markdown, no code fences).

Solicitation content:
${doc.text}

Return JSON with exactly these fields:
{
  "description": "Plain-English description of the work (1-2 sentences)",
  "estimatedValue": "Dollar amount if listed, or null",
  "requirements": ["array of key requirements: bonding, insurance, certifications, prevailing wage, etc."],
  "veteranPreference": true or false (is SDVOSB or veteran-owned preference mentioned?),
  "importantDates": [{"label": "Event name", "date": "Date or deadline"}],
  "isFit": true or false (is NAICS 237310 asphalt/sealcoating work a good fit based on the scope?),
  "fitReason": "Brief explanation of why it is or isn't a fit for an asphalt/sealcoating contractor"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let summary: Record<string, unknown>;
    try {
      summary = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      summary = jsonMatch ? JSON.parse(jsonMatch[0]) : { description: raw };
    }

    await db
      .update(bidOpportunitiesTable)
      .set({ aiSummary: summary, aiSummaryAt: new Date() })
      .where(eq(bidOpportunitiesTable.id, id));

    res.json({ summary, cached: false });
  } catch (err) {
    console.error("[bids] POST /bids/:id/summarize error:", err);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

export default router;
