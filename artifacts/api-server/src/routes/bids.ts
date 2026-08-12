import { Router } from "express";
import { db } from "@workspace/db";
import {
  bidOpportunitiesTable,
  bidCapabilityProfilesTable,
  bidBusinessSettingsTable,
  bidSourceCatalogTable,
  bidSourceConnectionsTable,
  businessesTable,
} from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { deriveCapabilityCategories } from "../lib/bidCategories.js";
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
  businessType: string,
  source?: string | null,
  opportunityType?: string | null,
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
7. For any license, bond, or certification you are uncertain about — do not make a legal
   conclusion. Use language like "verify whether [requirement] applies" or "confirm if
   [specific license] is required for this scope."
${
  (source === "subnet" || opportunityType === "subcontracting") ? `
OPPORTUNITY TYPE: Subcontracting (SBA SUBNet)
This is NOT a prime government contract — a prime contractor is seeking a subcontractor.
Set-aside and certification requirements apply to the prime, not necessarily the sub.
For bonding, clearance, or prevailing wage items, note "Verify with prime contractor"
rather than treating them as definitive barriers. Evaluate isFit on whether the described
scope of work is performable by this contractor as a subcontractor.` :
  (source === "gsa-forecast" || opportunityType === "forecast") ? `
OPPORTUNITY TYPE: GSA Forecast / Planned Acquisition (Early Intel)
This is NOT an active solicitation — it is an agency forecast of a future acquisition.
Requirements and scope may change before the actual solicitation is released.
Evaluate fit based on the described scope but frame requirements as "anticipated."` :
  (opportunityType === "sources_sought") ? `
OPPORTUNITY TYPE: Sources Sought / RFI (Market Research)
The agency is researching market capabilities — this is not accepting bids yet.
Responding builds agency awareness. Evaluate isFit on whether this contractor's
capabilities align with the described need.` :
  (opportunityType === "presolicitation") ? `
OPPORTUNITY TYPE: Pre-Solicitation (Early Notice)
The agency has announced a planned solicitation — not yet accepting bids.
Evaluate fit based on the described scope so Willard can track it for the actual posting.` : ""
}

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

// ── GET /api/bids/unified — all-business deduplicated feed ───────────────────
// IMPORTANT: registered before PATCH /:id so Express doesn't match "unified" as an id.
router.get("/unified", async (req, res) => {
  try {
    const { scoringBusinessId } = req.query;
    const rawScoringId = scoringBusinessId ? parseInt(scoringBusinessId as string, 10) : NaN;
    const validScoringId = !isNaN(rawScoringId) ? rawScoringId : null;

    // Load all businesses (single-tenant — no per-user filter needed)
    const allBusinesses = await db
      .select({ id: businessesTable.id, name: businessesTable.name })
      .from(businessesTable);

    if (allBusinesses.length === 0) { res.json([]); return; }

    const bizNameById = new Map(allBusinesses.map((b) => [b.id, b.name]));
    const bizIds = allBusinesses.map((b) => b.id);

    // Query all bid_opportunities for all businesses in a single round-trip
    const allRows = await db
      .select()
      .from(bidOpportunitiesTable)
      .where(inArray(bidOpportunitiesTable.businessId, bizIds))
      .orderBy(desc(bidOpportunitiesTable.createdAt));

    if (allRows.length === 0) { res.json([]); return; }

    // Group by noticeId — insertion order preserved (newest first per above ORDER BY)
    const grouped = new Map<string, (typeof allRows)>();
    for (const row of allRows) {
      const g = grouped.get(row.noticeId);
      if (g) g.push(row);
      else grouped.set(row.noticeId, [row]);
    }

    // Build the deduplicated unified response
    const unified: Array<Record<string, unknown>> = [];

    for (const [, group] of grouped) {
      // Representative = highest opportunityScore; newest on tie
      let rep = group[0];
      for (const row of group.slice(1)) {
        const repScore = rep.opportunityScore ?? -1;
        const rowScore = row.opportunityScore ?? -1;
        if (rowScore > repScore) { rep = row; continue; }
        if (rowScore === repScore && row.createdAt > rep.createdAt) rep = row;
      }

      // Apply scoring-business perspective: use that business's row for isFit/score/stage
      const displayRep = { ...rep };
      if (validScoringId) {
        const scoringRow = group.find((r) => r.businessId === validScoringId);
        if (scoringRow) {
          displayRep.id                 = scoringRow.id;
          displayRep.businessId         = scoringRow.businessId;
          displayRep.stage              = scoringRow.stage;
          displayRep.notes              = scoringRow.notes;
          displayRep.aiSummary          = scoringRow.aiSummary;
          displayRep.aiSummaryAt        = scoringRow.aiSummaryAt;
          displayRep.opportunityScore   = scoringRow.opportunityScore;
          displayRep.capabilityMatches  = scoringRow.capabilityMatches;
          displayRep.educationSummary   = scoringRow.educationSummary;
          displayRep.educationSummaryAt = scoringRow.educationSummaryAt;
        }
      }

      // Relevant business names (all businesses that have this noticeId)
      const relevantBusinessNames = group
        .map((r) => (r.businessId != null ? (bizNameById.get(r.businessId) ?? null) : null))
        .filter((n): n is string => typeof n === "string");

      // Capability categories derived from NAICS code + source
      const capabilityCategories = deriveCapabilityCategories(
        displayRep.naicsCode ?? null,
        displayRep.source,
      );

      unified.push({ ...displayRep, capabilityCategories, relevantBusinessNames });
    }

    // Sort: highest score first, newest on tie
    unified.sort((a, b) => {
      const aScore = (a.opportunityScore as number | null) ?? -1;
      const bScore = (b.opportunityScore as number | null) ?? -1;
      if (bScore !== aScore) return bScore - aScore;
      return new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime();
    });

    res.json(unified);
  } catch (err) {
    console.error("[bids] GET /bids/unified error:", err);
    res.status(500).json({ error: "Failed to load unified bid feed" });
  }
});

// ── GET /api/bids/sources — catalog + per-business connection status ──────────
// IMPORTANT: registered before PATCH /:id so Express doesn't match "sources" as an id.
router.get("/sources", async (req, res) => {
  try {
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    // Load the full global catalog
    const catalog = await db
      .select()
      .from(bidSourceCatalogTable)
      .where(eq(bidSourceCatalogTable.isGloballyActive, true))
      .orderBy(bidSourceCatalogTable.category, bidSourceCatalogTable.slug);

    // Load all connection rows for this business in one query
    const connections = await db
      .select()
      .from(bidSourceConnectionsTable)
      .where(eq(bidSourceConnectionsTable.businessId, bizId));

    const connBySlug = new Map(connections.map((c) => [c.catalogSlug, c]));

    const merged = catalog.map((src) => {
      const conn = connBySlug.get(src.slug);
      return {
        slug:               src.slug,
        name:               src.name,
        category:           src.category,
        connectionMethod:   src.connectionMethod,
        automatedDiscovery: src.automatedDiscovery,
        notes:              src.notes,
        isGloballyActive:   src.isGloballyActive,
        // Connection state (defaults when no row exists)
        // Automated sources default to enabled=true (they sync unless explicitly disabled).
        // Portal-only sources default to enabled=false (require manual user configuration).
        enabled:            conn?.enabled          ?? (src.automatedDiscovery ? true : false),
        connectionStatus:   conn?.connectionStatus ?? (src.connectionMethod === "portal_link_only" ? "portal_only" : "not_configured"),
        lastSyncAt:         conn?.lastSyncAt?.toISOString()        ?? null,
        lastSyncSuccessAt:  conn?.lastSyncSuccessAt?.toISOString() ?? null,
        lastSyncError:      conn?.lastSyncError      ?? null,
        recordsImported:    conn?.recordsImported    ?? null,
        portalUrl:          conn?.portalUrl          ?? null,
        portalLabel:        conn?.portalLabel        ?? null,
      };
    });

    res.json(merged);
  } catch (err) {
    console.error("[bids] GET /bids/sources error:", err);
    res.status(500).json({ error: "Failed to load bid sources" });
  }
});

// ── PATCH /api/bids/sources/:slug — enable/disable or set portal URL ──────────
// IMPORTANT: registered before PATCH /:id so Express doesn't match "sources" as an id.
router.patch("/sources/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { businessId } = req.query;
    const bizId = businessId ? parseInt(businessId as string, 10) : NaN;
    if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

    // Validate the slug exists in the catalog
    const [catalog] = await db
      .select()
      .from(bidSourceCatalogTable)
      .where(eq(bidSourceCatalogTable.slug, slug as string))
      .limit(1);

    if (!catalog) { res.status(404).json({ error: "Source not found" }); return; }

    const { enabled, portalUrl, portalLabel } = req.body as {
      enabled?: boolean;
      portalUrl?: string;
      portalLabel?: string;
    };

    const patch: Partial<typeof bidSourceConnectionsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (enabled !== undefined) patch.enabled = enabled;

    // Portal URL / label only allowed for portal-link-only sources
    const isPortalOnly = catalog.connectionMethod === "portal_link_only";
    if (isPortalOnly) {
      if (portalUrl !== undefined) patch.portalUrl = portalUrl || null;
      if (portalLabel !== undefined) patch.portalLabel = portalLabel || null;
    }

    // Derive connectionStatus
    if (enabled !== undefined) {
      patch.connectionStatus = !enabled
        ? "not_configured"
        : isPortalOnly
          ? "portal_only"
          : "not_configured"; // sync engine will update to "active"/"error" after first run
    } else if (isPortalOnly && (portalUrl !== undefined || portalLabel !== undefined)) {
      // Setting a portal URL on a portal-only source implicitly activates it
      patch.connectionStatus = "portal_only";
      if (patch.enabled === undefined) patch.enabled = true;
    }

    await db
      .insert(bidSourceConnectionsTable)
      .values({
        businessId: bizId,
        catalogSlug: slug as string,
        enabled:          patch.enabled          ?? false,
        connectionStatus: patch.connectionStatus ?? "not_configured",
        portalUrl:        patch.portalUrl,
        portalLabel:      patch.portalLabel,
      })
      .onConflictDoUpdate({
        target: [bidSourceConnectionsTable.businessId, bidSourceConnectionsTable.catalogSlug],
        set:    patch as Record<string, unknown>,
      });

    res.json({ ok: true });
  } catch (err) {
    console.error("[bids] PATCH /bids/sources/:slug error:", err);
    res.status(500).json({ error: "Failed to update source" });
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

    // Allow callers to bypass the cache and force a fresh summary (e.g. after
    // the solicitation has been amended or the user clicks "Regenerate").
    const force = req.body?.force === true;
    if (bid.aiSummary && !force) {
      res.json({ summary: bid.aiSummary, cached: true });
      return;
    }

    const [business] = await db
      .select({ type: businessesTable.type })
      .from(businessesTable)
      .where(eq(businessesTable.id, bizId))
      .limit(1);

    const doc = await fetchBidDocument({ noticeId: bid.noticeId, url: bid.url, source: bid.source, description: bid.description });
    const prompt = await buildSummarizePrompt(doc, bizId, business?.type ?? "general_contracting", bid.source, bid.opportunityType);

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

// ── Education analysis ─────────────────────────────────────────────────────

interface EducationRequirementData { item: string; plain: string; action: string }
interface EducationTermData        { term: string; plain: string }
interface EducationSummaryData {
  whatTheGovIsBuying: string;
  noticeTypeContext:   string;
  capabilityVerdict:  string;
  whyItFits:          string[];
  whyYouMayPass:      string[];
  requirements:       EducationRequirementData[];
  howToRespond:       string[];
  questionsForCO:     string[];
  nextStep:           string;
  detectedTerms:      EducationTermData[];
}

function buildEducationPrompt(
  bid: typeof bidOpportunitiesTable.$inferSelect,
  capabilities: CapabilityDefinition[],
  existingSummary: Record<string, unknown> | null,
): string {
  const capList = capabilities
    .filter((c) => c.active)
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");

  const equipList = [...new Set(capabilities.flatMap((c) => (c as CapabilityDefinition & { equipment?: string[] }).equipment ?? []))].join(", ");

  const bidLines = [
    `Title: ${bid.title}`,
    bid.agency            ? `Agency: ${bid.agency}`                              : null,
    bid.naicsCode         ? `NAICS Code: ${bid.naicsCode}`                       : null,
    bid.opportunityType   ? `Opportunity Type: ${bid.opportunityType}`           : null,
    bid.noticeType        ? `Notice Type: ${bid.noticeType}`                     : null,
    bid.source            ? `Source: ${bid.source}`                              : null,
    bid.responseDeadline  ? `Response Deadline: ${bid.responseDeadline}`         : null,
    bid.description       ? `\nDescription:\n${bid.description.slice(0, 2500)}`  : null,
  ].filter(Boolean).join("\n");

  let existingBlock = "";
  if (existingSummary && Object.keys(existingSummary).length > 0) {
    existingBlock = `\nEXISTING AI ANALYSIS (ground your education in this — do not contradict it):
- Fit: ${existingSummary["isFit"] === true ? "FIT" : existingSummary["isFit"] === false ? "NOT FIT" : "UNKNOWN"}
- Reason: ${existingSummary["fitReason"] ?? "N/A"}
- Requirements: ${Array.isArray(existingSummary["requirements"]) ? (existingSummary["requirements"] as string[]).join("; ") : "None"}
- License risk: ${existingSummary["licenseRisk"] ?? "None identified"}
- Bonding required: ${existingSummary["bondingRequired"] === true ? "YES" : existingSummary["bondingRequired"] === false ? "NO" : "Unknown"}
- Set-aside type: ${existingSummary["setAsideType"] ?? "Unknown"}`;
  }

  return `You are an expert government contracting advisor helping a small contractor who is COMPLETELY NEW to government contracting. Explain this opportunity in plain English — like talking to a capable tradesperson who has never bid on a government contract before.

RULE: Do NOT give legal advice. For anything involving licenses, certifications, or bonds, use "Verify before bidding:" language — never say "you cannot do this."

CONTRACTOR PROFILE:
${capList}

Equipment: ${equipList || "standard hand tools and power tools"}
${existingBlock}

OPPORTUNITY:
${bidLines}

---
PROCUREMENT GLOSSARY (use these definitions in your explanations):
Solicitation: Government's formal "we need something" announcement — your invitation to compete.
Sources Sought/RFI: Market research — NOT accepting bids yet. Government asking who can do this.
Pre-Solicitation: Early heads-up that a solicitation is coming — not accepting bids yet.
IFB: Invitation for Bid — lowest qualified price wins.
RFP: Request for Proposal — best overall value wins (price + approach + past performance).
RFQ: Request for Quotation — used for simpler or smaller purchases.
Set-Aside: Contract reserved for specific business types (small businesses, veteran-owned, etc.).
SDVOSB: Service-Disabled Veteran-Owned Small Business set-aside type.
NAICS Code: Industry classification code that categorizes the type of work.
Incumbent: Company currently doing the work on an existing contract.
Period of Performance: How long the contract runs.
Option Year: Extension the government can add after the base contract period.
Past Performance: Your track record on prior contracts — scored in proposals.
Bid Bond: Deposit (5-10% of bid) proving you are serious; returned if you don't win.
Performance Bond: Insurance guaranteeing you will finish the work.
Payment Bond: Insurance guaranteeing you will pay your subs and suppliers.
Prevailing Wage/Davis-Bacon: Government-set minimum pay rates for workers on federal contracts.
Contracting Officer (CO): Government employee managing the contract — your main contact.
FAR: Federal Acquisition Regulation — the rulebook for federal government purchasing.

---
Return ONLY valid JSON (no markdown, no code fences) with EXACTLY these fields:
{
  "whatTheGovIsBuying": "1-2 plain English sentences on what work actually needs to be done. Concrete: what, where, how often. No jargon.",
  "noticeTypeContext": "What this specific notice type means for this contractor RIGHT NOW. Action-oriented. E.g. for Sources Sought: 'The government is not yet accepting bids. They are researching who can do this work. You should respond with a brief capability statement to get on their radar.'",
  "capabilityVerdict": "good_fit OR possible_fit OR need_more_info OR likely_not_fit",
  "whyItFits": ["Specific reason referencing contractor capabilities by name — 3 to 5 items"],
  "whyYouMayPass": ["Honest concern — use Verify before bidding: language for license/cert issues — 0 to 4 items, empty array if no real concerns"],
  "requirements": [
    { "item": "Plain English requirement name", "plain": "What this means and what to do about it", "action": "must_have OR verify OR nice_to_have OR likely_disqualifier" }
  ],
  "howToRespond": ["Step 1 specific to this notice type", "Step 2", "Step 3", "Step 4"],
  "questionsForCO": ["Specific question relevant to this bid scope — 3 to 5 questions"],
  "nextStep": "Single most important thing to do TODAY. Starts with an action verb. One sentence.",
  "detectedTerms": [{ "term": "procurement term from the description", "plain": "definition in plain English" }]
}

RULES:
1. whyItFits: name specific contractor capabilities (e.g. "Your asphalt sealing capability directly matches...").
2. requirements action: use "likely_disqualifier" ONLY for hard requirements clearly not meetable (HazMat cert, CDL-A, security clearance). Still write "Verify before bidding:" in the plain field.
3. howToRespond: tailor to notice type. Sources Sought → respond with capability statement. Active solicitation → download and read solicitation first.
4. questionsForCO: specific questions, not generic. "What is the square footage to be sealed?" not "What are the requirements?"
5. nextStep: starts with a verb, specific, and actionable today.
6. detectedTerms: only terms from the opportunity description a new contractor would find confusing.
7. All arrays are required — use [] when nothing applies. nextStep must be non-empty.`;
}

function sanitizeEducation(raw: Record<string, unknown>): EducationSummaryData {
  const VALID_VERDICTS = ["good_fit", "possible_fit", "need_more_info", "likely_not_fit"];
  const VALID_ACTIONS  = ["must_have", "verify", "nice_to_have", "likely_disqualifier"];
  return {
    whatTheGovIsBuying: typeof raw["whatTheGovIsBuying"] === "string" ? raw["whatTheGovIsBuying"] : "",
    noticeTypeContext:   typeof raw["noticeTypeContext"]   === "string" ? raw["noticeTypeContext"]   : "",
    capabilityVerdict:  VALID_VERDICTS.includes(raw["capabilityVerdict"] as string)
      ? (raw["capabilityVerdict"] as string) : "need_more_info",
    whyItFits:    Array.isArray(raw["whyItFits"])    ? (raw["whyItFits"]    as unknown[]).filter((x): x is string => typeof x === "string") : [],
    whyYouMayPass: Array.isArray(raw["whyYouMayPass"]) ? (raw["whyYouMayPass"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    requirements: Array.isArray(raw["requirements"])
      ? (raw["requirements"] as Record<string, unknown>[]).map((r) => ({
          item:   typeof r["item"]   === "string" ? r["item"]   : "",
          plain:  typeof r["plain"]  === "string" ? r["plain"]  : "",
          action: VALID_ACTIONS.includes(r["action"] as string) ? (r["action"] as string) : "verify",
        })).filter((r) => r.item)
      : [],
    howToRespond:   Array.isArray(raw["howToRespond"])   ? (raw["howToRespond"]   as unknown[]).filter((x): x is string => typeof x === "string") : [],
    questionsForCO: Array.isArray(raw["questionsForCO"]) ? (raw["questionsForCO"] as unknown[]).filter((x): x is string => typeof x === "string") : [],
    nextStep:       typeof raw["nextStep"] === "string" ? raw["nextStep"] : "",
    detectedTerms: Array.isArray(raw["detectedTerms"])
      ? (raw["detectedTerms"] as Record<string, unknown>[]).map((t) => ({
          term:  typeof t["term"]  === "string" ? t["term"]  : "",
          plain: typeof t["plain"] === "string" ? t["plain"] : "",
        })).filter((t) => t.term && t.plain)
      : [],
  };
}

// POST /api/bids/:id/educate — on-demand education analysis for new contractors
router.post("/:id/educate", async (req, res) => {
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rawBizId = req.body?.businessId ?? req.query["businessId"];
  const bizId = rawBizId ? parseInt(String(rawBizId), 10) : NaN;
  if (isNaN(bizId)) { res.status(400).json({ error: "businessId is required" }); return; }

  // Optional: force=true regenerates even if already cached
  const force = req.body?.force === true || req.query["force"] === "true";

  try {
    const [bid] = await db
      .select()
      .from(bidOpportunitiesTable)
      .where(and(eq(bidOpportunitiesTable.id, id), eq(bidOpportunitiesTable.businessId, bizId)))
      .limit(1);

    if (!bid) { res.status(404).json({ error: "Bid not found" }); return; }

    if (bid.educationSummary && !force) {
      res.json({ education: bid.educationSummary, cached: true });
      return;
    }

    const [business] = await db
      .select({ type: businessesTable.type })
      .from(businessesTable)
      .where(eq(businessesTable.id, bizId))
      .limit(1);

    // Load DB capability profiles if available, fall back to seed definitions
    // (same pattern as buildSummarizePrompt — ensures both AI paths use the same source)
    const dbEduCaps = await db
      .select()
      .from(bidCapabilityProfilesTable)
      .where(and(
        eq(bidCapabilityProfilesTable.businessId, bizId),
        eq(bidCapabilityProfilesTable.active, true),
      ));

    const capabilities: CapabilityDefinition[] = dbEduCaps.length > 0
      ? dbEduCaps.map((row) => ({
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
      : getCapabilitiesForBusinessType(business?.type ?? "general_contracting");

    const existingSummary = bid.aiSummary as Record<string, unknown> | null;
    const prompt = buildEducationPrompt(bid, capabilities, existingSummary);

    const completion = await openai.chat.completions.create({
      model: BUILDPRO_AI_MINI_MODEL,
      max_completion_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try   { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

    const education = sanitizeEducation(parsed);

    await db
      .update(bidOpportunitiesTable)
      .set({ educationSummary: education as unknown as Record<string, unknown>, educationSummaryAt: new Date() })
      .where(eq(bidOpportunitiesTable.id, id));

    res.json({ education, cached: false });
  } catch (err) {
    console.error("[bids] POST /bids/:id/educate error:", err);
    res.status(500).json({ error: "Failed to generate education analysis" });
  }
});


export default router;
