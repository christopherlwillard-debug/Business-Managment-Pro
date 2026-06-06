import { Router } from "express";
import { db } from "@workspace/db";
import { bidOpportunitiesTable, businessesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { fetchBidDocument } from "../lib/bidDocumentFetcher.js";
import { runBidSync } from "../jobs/bidSync.js";

type BidStage = "new" | "reviewing" | "bidding" | "submitted" | "won" | "lost" | "no_bid";
const VALID_STAGES: BidStage[] = ["new", "reviewing", "bidding", "submitted", "won", "lost", "no_bid"];

type SetAsideType = "sdvosb" | "small_business" | "open" | "other";

interface AiSummary {
  description: string | null;
  estimatedValue: string | null;
  requirements: string[];
  veteranPreference: boolean;
  importantDates: Array<{ label: string; date: string }>;
  isFit: boolean;
  fitReason: string | null;
  setAsideType: SetAsideType;
  bondingRequired: boolean;
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

  const VALID_SET_ASIDE: SetAsideType[] = ["sdvosb", "small_business", "open", "other"];
  const rawSetAside = typeof raw.setAsideType === "string" ? raw.setAsideType : "";
  const setAsideType: SetAsideType = VALID_SET_ASIDE.includes(rawSetAside as SetAsideType)
    ? (rawSetAside as SetAsideType)
    : "other";

  return {
    description: toStr(raw.description),
    estimatedValue: toStr(raw.estimatedValue),
    requirements: toStrArr(raw.requirements),
    veteranPreference: raw.veteranPreference === true,
    importantDates: toDates(raw.importantDates),
    isFit: raw.isFit === true,
    fitReason: toStr(raw.fitReason),
    setAsideType,
    bondingRequired: raw.bondingRequired === true,
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
  "fitReason": "Brief explanation of why it is or isn't a fit for this contractor",
  "setAsideType": one of "sdvosb" (SDVOSB/VOSB set-aside), "small_business" (small business set-aside), "open" (full and open competition, no set-aside), or "other" (HUBZone, 8(a), WOSB, etc.),
  "bondingRequired": true or false (is a performance bond, bid bond, or payment bond explicitly required?)
}`;
}

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;

    if (isNaN(bizId)) {
      res.status(400).json({ error: "businessId query param is required" });
      return;
    }

    const rows = await db
      .select()
      .from(bidOpportunitiesTable)
      .where(eq(bidOpportunitiesTable.businessId, bizId))
      .orderBy(desc(bidOpportunitiesTable.createdAt));

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

  const rawBizId = req.body?.businessId ?? req.query.businessId;
  const bizId = rawBizId ? parseInt(String(rawBizId), 10) : NaN;
  if (isNaN(bizId)) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }

  const { stage, notes, status } = req.body as { stage?: string; notes?: string; status?: string };
  const updates: Record<string, unknown> = {};

  if (stage !== undefined) {
    if (!VALID_STAGES.includes(stage as BidStage)) {
      res.status(400).json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` });
      return;
    }
    updates.stage = stage;
    if (stage === "no_bid") updates.status = "dismissed";
    else if (stage === "reviewing") updates.status = "interested";
    else if (stage === "new") updates.status = "new";
  }

  if (notes !== undefined) {
    updates.notes = notes;
  }

  if (status !== undefined && stage === undefined) {
    const allowed = ["new", "interested", "dismissed"];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: "Invalid status. Must be new, interested, or dismissed." });
      return;
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }

  try {
    const [updated] = await db
      .update(bidOpportunitiesTable)
      .set(updates)
      .where(and(
        eq(bidOpportunitiesTable.id, id),
        eq(bidOpportunitiesTable.businessId, bizId),
      ))
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

  const rawBizId = req.body?.businessId ?? req.query.businessId;
  const bizId = rawBizId ? parseInt(String(rawBizId), 10) : NaN;
  if (isNaN(bizId)) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }

  try {
    const [bid] = await db
      .select()
      .from(bidOpportunitiesTable)
      .where(and(
        eq(bidOpportunitiesTable.id, id),
        eq(bidOpportunitiesTable.businessId, bizId),
      ))
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
    const rawId = req.body?.businessId ?? req.query.businessId;
    const bizId = rawId ? parseInt(String(rawId), 10) : NaN;
    if (isNaN(bizId)) {
      res.status(400).json({ error: "businessId is required" });
      return;
    }

    // Validate the business exists before syncing
    const [biz] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.id, bizId))
      .limit(1);

    if (!biz) {
      res.status(404).json({ error: "Business not found" });
      return;
    }

    // Respond immediately — scraping county sites takes 1-3 minutes and
    // would cause the browser to drop the connection before results arrive.
    // The frontend re-fetches bids at 15 s, 60 s, and 120 s to pick them up.
    res.json({ ok: true, syncing: true });

    runBidSync(bizId)
      .then((r) => console.log(`[bids] Sync complete for business ${bizId}: ${JSON.stringify(r)}`))
      .catch((err) => console.error(`[bids] Background sync error for business ${bizId}:`, err));
  } catch (err) {
    console.error("[bids] POST /bids/sync error:", err);
    res.status(500).json({ error: "Bid sync failed" });
  }
});

export default router;
