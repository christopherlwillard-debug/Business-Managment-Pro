/**
 * Grant sync orchestration.
 *
 * For each business with grants enabled:
 *   1. Bootstrap source connection rows.
 *   2. Fetch from Grants.gov (the only automated source in v1).
 *   3. Score each result against the business profile.
 *   4. Upsert into grant_opportunities (keyed on externalId + businessId).
 *   5. Write connection health.
 *
 * Respects the enabled flag on grant_source_connections — a user who disables
 * the Grants.gov source will not get refreshed data.
 *
 * Only rescores records where stage = 'new' — user-set stages (saved/applied/
 * no_interest) are never overwritten.
 *
 * Cron scheduling is NOT wired up in v1. Sync is triggered manually via
 * POST /api/grants/sync.
 */

import { db } from "@workspace/db";
import {
  grantOpportunitiesTable,
  grantSourceConnectionsTable,
  bidBusinessSettingsTable,
  businessesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fetchGrantsGovOpportunities } from "../lib/grantsFetcher.js";
import { scoreGrantOpportunity } from "../lib/grantScoring.js";
import { bootstrapGrantConnections, writeGrantConnectionHealth } from "../lib/grantSourceSeeds.js";

// ── Load or create bid business settings for grants scoring ──────────────────

async function loadProfileForGrants(businessId: number) {
  const existing = await db
    .select({
      isSdvosb:        bidBusinessSettingsTable.isSdvosb,
      isVosb:          bidBusinessSettingsTable.isVosb,
      isSmallBusiness: bidBusinessSettingsTable.isSmallBusiness,
      isHubzone:       bidBusinessSettingsTable.isHubzone,
      is8a:            bidBusinessSettingsTable.is8a,
      homeZip:         bidBusinessSettingsTable.homeZip,
    })
    .from(bidBusinessSettingsTable)
    .where(eq(bidBusinessSettingsTable.businessId, businessId))
    .then((rows) => rows[0] ?? null);

  if (existing) return existing;

  // Default profile — no certifications
  return {
    isSdvosb:        false,
    isVosb:          false,
    isSmallBusiness: true,
    isHubzone:       false,
    is8a:            false,
    homeZip:         null,
  };
}

// ── Check whether Grants.gov source is enabled for this business ──────────────

async function isGrantsGovEnabled(businessId: number): Promise<boolean> {
  const row = await db
    .select({ enabled: grantSourceConnectionsTable.enabled })
    .from(grantSourceConnectionsTable)
    .where(and(
      eq(grantSourceConnectionsTable.businessId, businessId),
      eq(grantSourceConnectionsTable.catalogSlug, "grants_gov"),
    ))
    .then((rows) => rows[0] ?? null);

  // No row = first run; treat as enabled (same fallback as bid sources)
  return row?.enabled ?? true;
}

// ── Upsert one grant opportunity ──────────────────────────────────────────────

async function upsertGrantOpportunity(
  businessId:  number,
  externalId:  string,
  fields:      {
    title:            string;
    agency:           string | null;
    description:      string | null;
    postedDate:       string | null;
    deadline:         string | null;
    fundingMin:       number | null;
    fundingMax:       number | null;
    opportunityType:  string;
    grantCategories:  string[];
    useOfFunds:       string | null;
    keyRequirements:  string[];
    applicationUrl:   string;
    source:           string;
    fitScore:         number;
    eligibilityLabel: string;
    matchReasons:     string[];
  },
): Promise<"inserted" | "rescored" | "skipped"> {
  // Check if user has already acted on this grant (stage != 'new')
  const existing = await db
    .select({ id: grantOpportunitiesTable.id, stage: grantOpportunitiesTable.stage })
    .from(grantOpportunitiesTable)
    .where(and(
      eq(grantOpportunitiesTable.externalId, externalId),
      eq(grantOpportunitiesTable.businessId, businessId),
    ))
    .then((rows) => rows[0] ?? null);

  if (existing && existing.stage !== "new") {
    // User has acted on this grant — update non-stage fields (new data) but
    // preserve the stage and notes. This keeps the record fresh without overriding
    // user decisions.
    await db
      .update(grantOpportunitiesTable)
      .set({
        title:           fields.title,
        agency:          fields.agency,
        description:     fields.description,
        postedDate:      fields.postedDate,
        deadline:        fields.deadline,
        fundingMin:      fields.fundingMin,
        fundingMax:      fields.fundingMax,
        applicationUrl:  fields.applicationUrl,
        grantCategories: fields.grantCategories,
        useOfFunds:      fields.useOfFunds,
        // Re-score even for user-acted rows so the fit score stays current
        fitScore:         fields.fitScore,
        eligibilityLabel: fields.eligibilityLabel,
        matchReasons:     fields.matchReasons,
      })
      .where(eq(grantOpportunitiesTable.id, existing.id));
    return "skipped"; // stage not touched
  }

  // New or stage='new' — full upsert
  await db
    .insert(grantOpportunitiesTable)
    .values({
      businessId,
      externalId,
      ...fields,
      keyRequirements: fields.keyRequirements,
      grantCategories: fields.grantCategories,
      matchReasons:    fields.matchReasons,
      stage:           "new",
    })
    .onConflictDoUpdate({
      target: [grantOpportunitiesTable.externalId, grantOpportunitiesTable.businessId],
      set: {
        title:            fields.title,
        agency:           fields.agency,
        description:      fields.description,
        postedDate:       fields.postedDate,
        deadline:         fields.deadline,
        fundingMin:       fields.fundingMin,
        fundingMax:       fields.fundingMax,
        opportunityType:  fields.opportunityType,
        grantCategories:  fields.grantCategories,
        useOfFunds:       fields.useOfFunds,
        keyRequirements:  fields.keyRequirements,
        applicationUrl:   fields.applicationUrl,
        fitScore:         fields.fitScore,
        eligibilityLabel: fields.eligibilityLabel,
        matchReasons:     fields.matchReasons,
      },
    });

  return existing ? "rescored" : "inserted";
}

// ── Main sync function ────────────────────────────────────────────────────────

export interface GrantSyncResult {
  businessId:     number;
  businessName:   string;
  inserted:       number;
  rescored:       number;
  skipped:        number;
  httpAttempted:  number;
  httpAccepted:   number;
  error:          string | null;
}

export async function runGrantSync(businessId?: number): Promise<GrantSyncResult[]> {
  // Resolve the list of businesses to sync
  const businesses = businessId
    ? await db.select({ id: businessesTable.id, name: businessesTable.name })
        .from(businessesTable)
        .where(eq(businessesTable.id, businessId))
    : await db.select({ id: businessesTable.id, name: businessesTable.name })
        .from(businessesTable);

  const results: GrantSyncResult[] = [];

  for (const biz of businesses) {
    const result: GrantSyncResult = {
      businessId:    biz.id,
      businessName:  biz.name ?? `Business ${biz.id}`,
      inserted:      0,
      rescored:      0,
      skipped:       0,
      httpAttempted: 0,
      httpAccepted:  0,
      error:         null,
    };

    try {
      // Bootstrap source connection rows (idempotent)
      await bootstrapGrantConnections(biz.id);

      // Check if Grants.gov is enabled for this business
      if (!(await isGrantsGovEnabled(biz.id))) {
        console.log(`[grant-sync] Grants.gov disabled for business ${biz.id} — skipping`);
        results.push(result);
        continue;
      }

      // Load business profile for scoring
      const profile = await loadProfileForGrants(biz.id);

      // Fetch from Grants.gov
      const fetchResult = await fetchGrantsGovOpportunities(3); // max 3 pages
      result.httpAttempted = fetchResult.httpCallsAttempted;
      result.httpAccepted  = fetchResult.httpCallsAccepted;

      // Score and upsert each opportunity
      for (const opp of fetchResult.opportunities) {
        const scoring = scoreGrantOpportunity(opp, profile);
        const outcome = await upsertGrantOpportunity(biz.id, opp.id, {
          title:            opp.title,
          agency:           opp.agency,
          description:      opp.description,
          postedDate:       opp.postedDate,
          deadline:         opp.deadline,
          fundingMin:       opp.fundingMin,
          fundingMax:       opp.fundingMax,
          opportunityType:  opp.opportunityType,
          grantCategories:  opp.grantCategories,
          useOfFunds:       opp.useOfFunds,
          keyRequirements:  [],   // not available in v1 API response; future: parse from description
          applicationUrl:   opp.applicationUrl,
          source:           "grants_gov",
          fitScore:         scoring.fitScore,
          eligibilityLabel: scoring.eligibilityLabel,
          matchReasons:     scoring.matchReasons,
        });

        if (outcome === "inserted") result.inserted++;
        else if (outcome === "rescored") result.rescored++;
        else result.skipped++;
      }

      // Write connection health — success
      await writeGrantConnectionHealth(biz.id, "grants_gov", true, null, result.inserted + result.rescored);

      console.log(
        `[grant-sync] Business ${biz.id}: ${result.inserted} inserted, ` +
        `${result.rescored} rescored, ${result.skipped} skipped`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.error = msg;
      console.error(`[grant-sync] Business ${biz.id} failed:`, err);
      await writeGrantConnectionHealth(biz.id, "grants_gov", false, msg);
    }

    results.push(result);
  }

  return results;
}
