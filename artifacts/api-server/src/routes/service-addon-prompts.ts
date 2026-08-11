import { Router } from "express";
import { db, serviceAddonPromptsTable, productionServiceTypesTable } from "@workspace/db";
import { eq, asc, and, ne } from "drizzle-orm";
import { wrapAsync } from "./guards";
import { ensureProductionBillingSeed } from "../lib/productionBilling.js";

const router = Router();

// ── Auto-seed: create the classic Plumbing → Heat Wrap pair on first boot ──────
// ensureProductionBillingSeed() runs first so service-type rows exist before we
// look them up.  Uses ON CONFLICT DO NOTHING against the unique index so it is
// safe to call repeatedly.
let seedAttempted = false;
async function ensureAddonSeed() {
  if (seedAttempted) return;
  seedAttempted = true;
  try {
    await ensureProductionBillingSeed();          // guarantee plumbing/heat-wrap rows

    const existing = await db
      .select({ id: serviceAddonPromptsTable.id })
      .from(serviceAddonPromptsTable)
      .limit(1);
    if (existing.length > 0) return;

    const types = await db
      .select({ id: productionServiceTypesTable.id, itemKey: productionServiceTypesTable.itemKey })
      .from(productionServiceTypesTable);

    const plumbing = types.find(t => t.itemKey === "plumbing_hookup");
    const heatWrap = types.find(t => t.itemKey === "heat_wrap_waterline");
    if (plumbing && heatWrap) {
      await db
        .insert(serviceAddonPromptsTable)
        .values({
          triggerServiceTypeId: plumbing.id,
          addonServiceTypeId:   heatWrap.id,
          promptLabel:
            "Will you also be heat wrapping the waterline on this plumbing hookup?",
          businessId: null,
        })
        .onConflictDoNothing();
    }
  } catch {
    seedAttempted = false;           // allow retry on next request
  }
}

// ── Scope validation ───────────────────────────────────────────────────────────
// A service type is in-scope for a given promptBusinessId when:
//   • the service type is global (businessId null), OR
//   • it belongs to the same business as the prompt.
// A global prompt (businessId null) may only reference global service types.
function isServiceTypeInScope(svcBusinessId: number | null, promptBusinessId: number | null): boolean {
  if (promptBusinessId === null) return svcBusinessId === null;   // global prompt: global svc only
  return svcBusinessId === null || svcBusinessId === promptBusinessId;
}

// ── Response shape ─────────────────────────────────────────────────────────────
interface ServiceAddonPromptRow {
  id: number;
  businessId: number | null;
  triggerServiceTypeId: number;
  addonServiceTypeId: number;
  promptLabel: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  triggerServiceType: { id: number; name: string; itemKey: string | null; price: string | null } | null;
  addonServiceType:   { id: number; name: string; itemKey: string | null; price: string | null } | null;
}

// Returns at most ONE prompt per trigger service type.
// Business-scoped prompts take precedence over global (null businessId) ones so
// per-business configuration always wins over the shared seed.
async function fetchPromptsWithServices(
  businessId: number | null,
  activeOnly = true,
): Promise<ServiceAddonPromptRow[]> {
  const rows = await db
    .select()
    .from(serviceAddonPromptsTable)
    .orderBy(asc(serviceAddonPromptsTable.id));

  const allTypes = await db
    .select({
      id:      productionServiceTypesTable.id,
      name:    productionServiceTypesTable.name,
      itemKey: productionServiceTypesTable.itemKey,
      price:   productionServiceTypesTable.price,
    })
    .from(productionServiceTypesTable);

  const typeMap = new Map(allTypes.map(t => [t.id, t]));

  // Filter to rows visible for this business context
  const filtered = rows.filter(r => {
    if (activeOnly && !r.active) return false;
    if (businessId != null && r.businessId != null && r.businessId !== businessId) return false;
    return true;
  });

  // Deduplicate: one prompt per trigger, business-specific beats global
  const byTrigger = new Map<number, typeof filtered[0]>();
  for (const row of filtered) {
    const existing = byTrigger.get(row.triggerServiceTypeId);
    if (!existing) {
      byTrigger.set(row.triggerServiceTypeId, row);
    } else if (existing.businessId === null && row.businessId !== null) {
      // Business-scoped prompt overrides the global seed
      byTrigger.set(row.triggerServiceTypeId, row);
    }
  }

  return Array.from(byTrigger.values()).map(r => ({
    ...r,
    triggerServiceType: typeMap.get(r.triggerServiceTypeId) ?? null,
    addonServiceType:   typeMap.get(r.addonServiceTypeId)   ?? null,
  }));
}

// ── Duplicate detection helper ─────────────────────────────────────────────────
// Finds existing prompts for the given trigger+businessId scope (excluding an
// optional own ID for PUT).  Selects id AND businessId so scope comparison works.
async function findDuplicatePrompt(
  triggerServiceTypeId: number,
  promptBusinessId: number | null,
  excludeId?: number,
): Promise<boolean> {
  const candidates = await db
    .select({
      id:         serviceAddonPromptsTable.id,
      businessId: serviceAddonPromptsTable.businessId,
    })
    .from(serviceAddonPromptsTable)
    .where(
      excludeId != null
        ? and(
            eq(serviceAddonPromptsTable.triggerServiceTypeId, triggerServiceTypeId),
            ne(serviceAddonPromptsTable.id, excludeId),
          )
        : eq(serviceAddonPromptsTable.triggerServiceTypeId, triggerServiceTypeId),
    );

  return candidates.some(c => {
    const cBid: number | null = (c as { id: number; businessId?: number | null }).businessId ?? null;
    // Same scope: both global, or both belong to the same business
    return promptBusinessId === null ? cBid === null : cBid === promptBusinessId;
  });
}

// ── GET / — list prompts for this business (deduplicated, business wins) ────────
router.get("/", wrapAsync(async (req, res) => {
  await ensureAddonSeed();
  const raw = req.query.businessId;
  const businessId = raw ? parseInt(raw as string) : null;
  const bId = businessId != null && !isNaN(businessId) ? businessId : null;
  const rows = await fetchPromptsWithServices(bId, true);
  res.json(rows);
}));

// ── POST / — create a prompt ───────────────────────────────────────────────────
router.post("/", wrapAsync(async (req, res) => {
  const body = req.body as {
    triggerServiceTypeId?: number;
    addonServiceTypeId?: number;
    promptLabel?: string;
    businessId?: number | null;
  };

  if (!body.triggerServiceTypeId || !body.addonServiceTypeId) {
    return res.status(400).json({ error: "triggerServiceTypeId and addonServiceTypeId are required" });
  }
  if (!body.promptLabel?.trim()) {
    return res.status(400).json({ error: "promptLabel is required" });
  }
  if (body.triggerServiceTypeId === body.addonServiceTypeId) {
    return res.status(400).json({ error: "Trigger and add-on services must be different" });
  }

  const promptBusinessId: number | null = typeof body.businessId === "number" ? body.businessId : null;

  // Validate both service types are in scope
  const [triggerRow] = await db
    .select({ id: productionServiceTypesTable.id, businessId: productionServiceTypesTable.businessId })
    .from(productionServiceTypesTable)
    .where(eq(productionServiceTypesTable.id, body.triggerServiceTypeId));
  const [addonRow] = await db
    .select({ id: productionServiceTypesTable.id, businessId: productionServiceTypesTable.businessId })
    .from(productionServiceTypesTable)
    .where(eq(productionServiceTypesTable.id, body.addonServiceTypeId));

  if (!triggerRow || !addonRow) {
    return res.status(400).json({ error: "One or both service types not found" });
  }
  if (!isServiceTypeInScope(triggerRow.businessId, promptBusinessId)) {
    return res.status(400).json({ error: "Trigger service type does not belong to this business" });
  }
  if (!isServiceTypeInScope(addonRow.businessId, promptBusinessId)) {
    return res.status(400).json({ error: "Add-on service type does not belong to this business" });
  }

  // Enforce one prompt per trigger per scope
  if (await findDuplicatePrompt(body.triggerServiceTypeId, promptBusinessId)) {
    return res.status(409).json({
      error:
        "A prompt already exists for this trigger service in this business scope. Edit or delete it first.",
    });
  }

  try {
    const [row] = await db
      .insert(serviceAddonPromptsTable)
      .values({
        triggerServiceTypeId: body.triggerServiceTypeId,
        addonServiceTypeId:   body.addonServiceTypeId,
        promptLabel:          body.promptLabel.trim(),
        businessId:           promptBusinessId,
      })
      .returning();
    res.status(201).json(row);
  } catch (err: unknown) {
    // Map unique-index violation to 409 (race condition between check and insert)
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("uq_addon_prompt_trigger") || msg.includes("unique")) {
      return res.status(409).json({
        error: "A prompt already exists for this trigger service in this business scope.",
      });
    }
    throw err;
  }
}));

// ── PUT /:id — update a prompt ─────────────────────────────────────────────────
router.put("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [current] = await db
    .select()
    .from(serviceAddonPromptsTable)
    .where(eq(serviceAddonPromptsTable.id, id));
  if (!current) return res.status(404).json({ error: "Not found" });

  const b = req.body as Record<string, unknown>;

  const newTrigger  = typeof b.triggerServiceTypeId === "number" ? b.triggerServiceTypeId : current.triggerServiceTypeId;
  const newAddon    = typeof b.addonServiceTypeId   === "number" ? b.addonServiceTypeId   : current.addonServiceTypeId;
  const newBid: number | null = "businessId" in b
    ? (typeof b.businessId === "number" ? b.businessId : null)
    : current.businessId;

  // Validate scope whenever service types or businessId are changing
  const scopeChanging = newTrigger !== current.triggerServiceTypeId
    || newAddon !== current.addonServiceTypeId
    || newBid !== current.businessId;

  if (scopeChanging) {
    const [triggerRow] = await db
      .select({ id: productionServiceTypesTable.id, businessId: productionServiceTypesTable.businessId })
      .from(productionServiceTypesTable)
      .where(eq(productionServiceTypesTable.id, newTrigger));
    const [addonRow] = await db
      .select({ id: productionServiceTypesTable.id, businessId: productionServiceTypesTable.businessId })
      .from(productionServiceTypesTable)
      .where(eq(productionServiceTypesTable.id, newAddon));

    if (!triggerRow || !addonRow) return res.status(400).json({ error: "One or both service types not found" });
    if (!isServiceTypeInScope(triggerRow.businessId, newBid)) return res.status(400).json({ error: "Trigger service type does not belong to this business" });
    if (!isServiceTypeInScope(addonRow.businessId,   newBid)) return res.status(400).json({ error: "Add-on service type does not belong to this business" });
  }

  // Check for duplicates whenever trigger OR businessId changes
  const triggerOrScopeChanging = newTrigger !== current.triggerServiceTypeId || newBid !== current.businessId;
  if (triggerOrScopeChanging) {
    if (await findDuplicatePrompt(newTrigger, newBid, id)) {
      return res.status(409).json({ error: "A prompt already exists for that trigger in this business scope" });
    }
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.triggerServiceTypeId === "number") set.triggerServiceTypeId = newTrigger;
  if (typeof b.addonServiceTypeId   === "number") set.addonServiceTypeId   = newAddon;
  if (typeof b.promptLabel === "string" && b.promptLabel.trim()) set.promptLabel = b.promptLabel.trim();
  if ("active" in b) set.active = b.active === true;
  if ("businessId" in b) set.businessId = newBid;

  try {
    const [row] = await db
      .update(serviceAddonPromptsTable)
      .set(set)
      .where(eq(serviceAddonPromptsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("uq_addon_prompt_trigger") || msg.includes("unique")) {
      return res.status(409).json({
        error: "A prompt already exists for that trigger in this business scope.",
      });
    }
    throw err;
  }
}));

// ── DELETE /:id — hard delete ──────────────────────────────────────────────────
router.delete("/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [row] = await db
    .delete(serviceAddonPromptsTable)
    .where(eq(serviceAddonPromptsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
}));

export default router;
