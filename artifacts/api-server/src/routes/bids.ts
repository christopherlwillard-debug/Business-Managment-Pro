import { Router } from "express";
import { db } from "@workspace/db";
import { bidOpportunitiesTable, businessesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchBidDocument } from "../lib/bidDocumentFetcher.js";
import { runBidSync } from "../jobs/bidSync.js";

interface AiSummary {
  description: string | null;
  estimatedValue: string | null;
  requirements: string[];
  veteranPreference: boolean;
  importantDates: Array<{ label: string; date: string }>;
  isFit: boolean;
  fitReason: string | null;
}

function sanitizeSummary(raw: Record<string, unknown>): AiSummary {
  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const toStrArr = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  };

  const toDates = (v: unknown): Array<{ label: string; date: string }> => {
    if (!Array.isArray(v)) return [];
    return v.flatMap((x) => {
      if (x && typeof x === "object" && "label" in x && "date" in x) {
        const label = typeof x.label === "string" ? x.label : String(x.label ?? "");
        const date = typeof x.date === "string" ? x.date : String(x.date ?? "");
        return label ? [{ label, date }] : [];
      }
      return [];
    });
  };

  return {
    description: toStr(raw.description),
    estimatedValue: toStr(raw.estimatedValue),
    requirements: toStrArr(raw.requirements),
    veteranPreference: raw.veteranPreference === true,
    importantDates: toDates(raw.importantDates),
    isFit: raw.isFit === true,
    fitReason: toStr(raw.fitReason),
  };
}

function buildSummarizePrompt(doc: { text: string }, businessType: string): string {
  const isAsphalt = businessType === "asphalt_sealing";
  const contractorDesc = isAsphalt
    ? "an asphalt and sealcoating contractor (NAICS 237310 — highway/street/pavement work)"
    : "a general contractor (commercial/institutional building construction, renovation, site work, tenant improvement)";
  const fitHint = isAsphalt
    ? "NAICS 237310 asphalt/sealcoating/pavement work"
    : "general contracting: commercial building, renovation, remodeling, site preparation, or tenant improvement work";

  return `You are analyzing a government bid solicitation for ${contractorDesc}. Extract key information and return ONLY valid JSON (no markdown, no code fences).

Solicitation content:
${doc.text}

Return JSON with exactly these fields:
{
  "description": "Plain-English description of the work (1-2 sentences)",
  "estimatedValue": "Dollar amount if listed, or null",
  "requirements": ["array of key requirements: bonding, insurance, certifications, prevailing wage, etc."],
  "veteranPreference": true or false (is SDVOSB or veteran-owned preference mentioned?),
  "importantDates": [{"label": "Event name", "date": "Date or deadline"}],
  "isFit": true or false (is this a good fit based on the scope: ${fitHint}?),
  "fitReason": "Brief explanation of why it is or isn't a fit for this contractor"
}`;
}

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { status, businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;

    if (isNaN(bizId)) {
      res.status(400).json({ error: "businessId query param is required" });
      return;
    }

    let rows;
    if (status && typeof status === "string") {
      rows = await db
        .select()
        .from(bidOpportunitiesTable)
        .where(and(
          eq(bidOpportunitiesTable.businessId, bizId),
          eq(bidOpportunitiesTable.status, status)
        ))
        .orderBy(desc(bidOpportunitiesTable.createdAt));
    } else {
      rows = await db
        .select()
        .from(bidOpportunitiesTable)
        .where(eq(bidOpportunitiesTable.businessId, bizId))
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

    // Look up the business type to customize the AI prompt
    let businessType = "general_contracting";
    if (bid.businessId) {
      const [biz] = await db
        .select({ type: businessesTable.type })
        .from(businessesTable)
        .where(eq(businessesTable.id, bid.businessId))
        .limit(1);
      if (biz) businessType = biz.type;
    }

    const doc = await fetchBidDocument({
      noticeId: bid.noticeId,
      url: bid.url,
      source: bid.source,
      description: bid.description,
    });

    const prompt = buildSummarizePrompt(doc, businessType);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { description: raw };
    }

    const summary = sanitizeSummary(parsed);

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

router.post("/sync", async (req, res) => {
  try {
    const { businessId } = req.body as { businessId?: number };
    if (!businessId || isNaN(Number(businessId))) {
      res.status(400).json({ error: "businessId is required" });
      return;
    }
    const result = await runBidSync(Number(businessId));
    res.json({
      ok: true,
      newFederal: result.newFederal,
      newLocal: result.newLocal,
      total: result.total,
    });
  } catch (err) {
    console.error("[bids] POST /bids/sync error:", err);
    res.status(500).json({ error: "Bid sync failed" });
  }
});

export default router;
