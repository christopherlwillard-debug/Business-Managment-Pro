import { Router } from "express";
import { db } from "@workspace/db";
import {
  bidOpportunitiesTable,
  bidCapabilityProfilesTable,
  bidBusinessSettingsTable,
  businessesTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { BUILDPRO_AI_MINI_MODEL } from "../ai-models";
import { fetchBidDocument } from "../lib/bidDocumentFetcher.js";
import { runBidSync } from "../jobs/bidSync.js";
import { CapabilityDefinition, getCapabilitiesForBusinessType } from "../lib/bidCapabilitySeeds.js";

type BidStage = "new" | "reviewing" | "bidding" | "submitted" | "won" | "lost" | "no_bid";
const VALID_STAGES: BidStage[] = ["new", "reviewing", "bidding", "submitted", "won", "lost", "no_bid"];

type SetAsideType = "sdvosb" | "small_business" | "open" | "other";

interface AiSummary {
  description:      string | null;
  estimatedValue:   string | null;
  requirements:     string[];
  veteranPreference: boolean;
  importantDates:   Array<{ label: string; date: string }>;
  isFit:            boolean;
  fitReason:        string | null;
  setAsideType:     SetAsideType;
  noticeType:       string | null;   // solicitation|sources_sought|presolicitation|combined_synopsis|award|other
  bondingRequired:  boolean;
  capabilityMatch:  string | null;   // which capability profile(s) this fits
  licenseRisk:      string | null;   // any licensing/bonding/insurance concern
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
        const date  = typeof x.date  === "string" ? x.date  : String(x.date  ?? "");
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
    description:       toStr(raw.description),
    estimatedValue:    toStr(raw.estimatedValue),
    requirements:      toStrArr(raw.requirements),
    veteranPreference: raw.veteranPreference === true,
    importantDates:    toDates(raw.importantDates),
    isFit:             raw.isFit === true,
    fitReason:         toStr(raw.fitReason),
    setAsideType,
    noticeType:        toStr(raw.noticeType),
    bondingRequired:   raw.bondingRequired === true,
    capabilityMatch:   toStr(raw.capabilityMatch),
    licenseRisk:       toStr(raw.licenseRisk),
  };
}

// ── AI prompt builder — capability-aware ──────────────────────────────────────

async function buildSummarizePrompt(
  doc: { text: string },
  businessId: number,
  businessType: string
): Promise<string> {
  // Load DB capability profiles if available, fall back to seed definitions
  const dbCaps = await db
    .select()
    .from(bidCapabilityProfilesTable)
    .where(and(
      eq(bidCapabilityProfilesTable.businessId, businessId),
      eq(bidCapabilityProfilesTable.active, true),
    ));

  const capabilities: CapabilityDefinition[] = dbCaps.length > 0
    ? dbCaps.map((row) => ({
        capabilityKey:    row.capabilityKey,
        name:             row.name,
        description:      row.description ?? "",
        naicsCodes:       (row.naicsCodes as string[]) ?? [],
        keywords:         (row.keywords as string[]) ?? [],
        negativeKeywords: (row.negativeKeywords as string[]) ?? [],
        equipment:        (row.equipment as string[]) ?? [],
        localKeywords:    (row.localKeywords as string[]) ?? [],
        active:           row.active,
        sortOrder:        row.sortOrder,
      }))
    : getCapabilitiesForBusinessType(businessType);

  const capList = capabilities
    .map((c) => `  • ${c.name}: ${c.description}`)
    .join("\n");

  const equipmentList = [...new Set(capabilities.flatMap((c) => c.equipment))].join(", ");

  // Set-aside context from DB settings
  const settingsRow = await db
    .select()
    .from(bidBusinessSettingsTable)
    .where(eq(bidBusinessSettingsTable.businessId, businessId))
    .then((rows) => rows[0] ?? null);

  const certLines: string[] = [];
  if (settingsRow?.isSdvosb)        certLines.push("SDVOSB (Service-Disabled Veteran-Owned Small Business)");
  if (settingsRow?.isVosb)          certLines.push("VOSB (Veteran-Owned Small Business)");
  if (settingsRow?.isSmallBusiness) certLines.push("Small Business");
  if (settingsRow?.isHubzone)       certLines.push("HUBZone");
  if (settingsRow?.is8a)            certLines.push("8(a)");
  const certBlock = certLines.length > 0
    ? `\nCertifications held: ${certLines.join(", ")}.`
    : "\nNo special certifications — evaluate set-asides that require SDVOSB/VOSB/8(a) as potentially ineligible.";

  return `You are analyzing a government bid solicitation for a small contractor.

BUSINESS CAPABILITIES:
${capList}

EQUIPMENT AVAILABLE: ${equipmentList || "standard hand tools and power tools"}
${certBlock}

EVALUATION RULES — read these before scoring isFit:
1. A keyword appearing in the title or description is NOT sufficient to call this a fit.
   Ask: could this contractor realistically WIN and PERFORM the full scope of work?
2. Scale matters. A contract requiring 20 trucks, a fleet of heavy equipment, or a dedicated
   facility is not a fit for a small owner-operator even if the work category matches.
3. Scope must match equipment. "Debris removal" is only a fit if the volume/type is achievable
   with a dump trailer. "Hauling" is only a fit if it's material/debris hauling — not freight/LTL.
4. Certification barriers are disqualifying. If the contract requires a license, bond, or
   certification the contractor clearly lacks (e.g., HazMat, CDL Class A, EPA), mark isFit=false.
5. When unsure, be conservative. A false positive wastes Willard's time reviewing an unsuitable bid.
6. Mark isFit=true only when the scope, scale, equipment, and certification requirements are all
   clearly achievable for this contractor. Explain specifically which capability matches.

SOLICITATION CONTENT:
${doc.text}

Return ONLY valid JSON (no markdown, no code fences) with exactly these fields:
{
  "description": "Plain-English 1-2 sentence summary of the actual work required",
  "estimatedValue": "Dollar amount or range if mentioned, else null",
  "requirements": ["key requirements: bonding, insurance, certifications, prevailing wage, SCA, etc."],
  "veteranPreference": true or false (is SDVOSB, VOSB, or veteran-owned preference mentioned?),
  "importantDates": [{"label": "Event name", "date": "Date or deadline"}],
  "isFit": true or false — see EVALUATION RULES above; keyword presence alone is NOT a fit,
  "fitReason": "Specific explanation: which capability matches AND why the scale/scope is achievable — or exactly why it is not a fit",
  "setAsideType": one of "sdvosb", "small_business", "open", or "other" (HUBZone/8a/WOSB/etc.),
  "noticeType": one of "solicitation", "sources_sought", "presolicitation", "combined_synopsis", "award", or "other",
  "bondingRequired": true or false,
  "capabilityMatch": "Name of the specific matching capability (e.g. 'Debris & Waste Removal / Hauling') or null if not a fit",
  "licenseRisk": "Specific license, bond, or certification that may be a barrier, or null"
}`;
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

// GET /api/bids — list opportunities for a business
router.get("/", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId query param is required" }); return; }

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

// GET /api/bids/settings — bid settings + source health for a business
router.get("/settings", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const settings = await db
      .select()
      .from(bidBusinessSettingsTable)
      .where(eq(bidBusinessSettingsTable.businessId, bizId))
      .then((rows) => rows[0] ?? null);

    res.json(settings ?? {
      businessId: bizId,
      profileStatus: "active",
      isSmallBusiness: true,
      isSdvosb: false,
      isVosb: false,
      isHubzone: false,
      is8a: false,
    });
  } catch (err) {
    console.error("[bids] GET /bids/settings error:", err);
    res.status(500).json({ error: "Failed to load bid settings" });
  }
});

// GET /api/bids/capabilities — capability profiles for a business
router.get("/capabilities", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const rows = await db
      .select()
      .from(bidCapabilityProfilesTable)
      .where(eq(bidCapabilityProfilesTable.businessId, bizId))
      .orderBy(bidCapabilityProfilesTable.sortOrder);

    res.json(rows);
  } catch (err) {
    console.error("[bids] GET /bids/capabilities error:", err);
    res.status(500).json({ error: "Failed to load capability profiles" });
  }
});

// PATCH /api/bids/:id — update stage/notes
router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rawBizId = req.body?.businessId ?? req.query.businessId;
  const bizId = rawBizId ? parseInt(String(rawBizId), 10) : NaN;
  if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

  const { stage, notes, status } = req.body as { stage?: string; notes?: string; status?: string };
  const updates: Record<string, unknown> = {};

  if (stage !== undefined) {
    if (!VALID_STAGES.includes(stage as BidStage)) {
      res.status(400).json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` });
      return;
    }
    updates.stage = stage;
    if (stage === "no_bid")     updates.status = "dismissed";
    else if (stage === "reviewing") updates.status = "interested";
    else if (stage === "new")   updates.status = "new";
  }

  if (notes !== undefined)  updates.notes = notes;

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
      .where(and(eq(bidOpportunitiesTable.id, id), eq(bidOpportunitiesTable.businessId, bizId)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Bid not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[bids] PATCH /bids/:id error:", err);
    res.status(500).json({ error: "Failed to update bid" });
  }
});

// POST /api/bids/:id/summarize — on-demand AI summarization
router.post("/:id/summarize", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rawBizId = req.body?.businessId ?? req.query.businessId;
  const bizId = rawBizId ? parseInt(String(rawBizId), 10) : NaN;
  if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

  try {
    const [bid] = await db
      .select()
      .from(bidOpportunitiesTable)
      .where(and(eq(bidOpportunitiesTable.id, id), eq(bidOpportunitiesTable.businessId, bizId)))
      .limit(1);

    if (!bid) { res.status(404).json({ error: "Bid not found" }); return; }

    if (bid.aiSummary) {
      res.json({ summary: bid.aiSummary, cached: true });
      return;
    }

    const [business] = await db
      .select({ type: businessesTable.type })
      .from(businessesTable)
      .where(eq(businessesTable.id, bizId))
      .limit(1);

    const doc = await fetchBidDocument({ noticeId: bid.noticeId, url: bid.url, source: bid.source, description: bid.description });
    const prompt = await buildSummarizePrompt(doc, bizId, business?.type ?? "general_contracting");

    const completion = await openai.chat.completions.create({
      model: BUILDPRO_AI_MINI_MODEL,
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
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

// POST /api/bids/sync — trigger background sync
router.post("/sync", async (req, res) => {
  try {
    const rawId = req.body?.businessId ?? req.query.businessId;
    const bizId = rawId ? parseInt(String(rawId), 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    const [biz] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.id, bizId))
      .limit(1);

    if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

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
