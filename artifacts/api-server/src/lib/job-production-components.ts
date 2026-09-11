import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessesTable,
  checklistTemplatesTable,
  jobChecklistsTable,
  jobKnowledgeRecordVersionsTable,
  jobKnowledgeRecordsTable,
  jobProductionComponentsTable,
  jobsTable,
  materialListItemsTable,
  materialListsTable,
  mfhModelsTable,
  productionPriceOverridesTable,
  productionServiceTypesTable,
  type InteriorFinishVariant,
  type Job,
  type JobProductionComponent,
  type ProductionComponentKey,
  type ProductionComponentSourceService,
  type ProductionComponentStatus,
} from "@workspace/db/schema";

const INTERIOR_VARIANTS = new Set<InteriorFinishVariant>(["vog", "hybrid", "drywall"]);
const COMPONENT_STATUSES = new Set<ProductionComponentStatus>([
  "planned",
  "in_progress",
  "paused",
  "completed",
  "not_applicable",
]);

type ServiceRow = typeof productionServiceTypesTable.$inferSelect;

export type ProductionComponentView = {
  id: number | null;
  jobId: number;
  businessId: number | null;
  componentKey: ProductionComponentKey;
  componentInstanceKey: string;
  componentLabel: string;
  variant: InteriorFinishVariant | null;
  sourceServiceIds: number[];
  sourceServices: ProductionComponentSourceService[];
  snapshotVersion: number;
  status: ProductionComponentStatus;
  expectedLaborHours: number | null;
  expectedDurationDays: number | null;
  expectedCrewSize: number | null;
  checklistContext: Record<string, unknown> | null;
  materialContext: Record<string, unknown> | null;
  pricingContext: Record<string, unknown> | null;
  knowledgeContext: Record<string, unknown> | null;
  capturedAt: string | null;
  persisted: boolean;
};

type ComponentDraft = {
  jobId: number;
  businessId: number | null;
  componentKey: ProductionComponentKey;
  componentInstanceKey: string;
  componentLabel: string;
  variant: InteriorFinishVariant | null;
  sourceServiceIds: number[];
  sourceServices: ProductionComponentSourceService[];
  expectedLaborHours: string | null;
  expectedDurationDays: number | null;
  expectedCrewSize: number | null;
  checklistContext: Record<string, unknown> | null;
  materialContext: Record<string, unknown> | null;
  pricingContext: Record<string, unknown> | null;
  knowledgeContext: Record<string, unknown> | null;
};

function normalized(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedInteriorVariant(value: string | null | undefined): InteriorFinishVariant | null {
  const valueKey = normalized(value);
  if (INTERIOR_VARIANTS.has(valueKey as InteriorFinishVariant)) return valueKey as InteriorFinishVariant;
  if (valueKey.endsWith("_vog")) return "vog";
  if (valueKey.endsWith("_hybrid")) return "hybrid";
  if (valueKey.endsWith("_drywall")) return "drywall";
  return null;
}

export function isProductionComponentStatus(value: unknown): value is ProductionComponentStatus {
  return typeof value === "string" && COMPONENT_STATUSES.has(value as ProductionComponentStatus);
}

/**
 * Converts the existing service catalog into Willard's approved component
 * structure. Service-only catalog rows never enter this function's result.
 * Unknown production work is intentionally represented as Custom so a legacy
 * catalog label cannot become a prohibited top-level component.
 */
export function classifyProductionService(
  service: Pick<ServiceRow, "name" | "itemKey" | "category" | "appliesTo">,
  fallbackInteriorVariant: string | null | undefined,
): { componentKey: ProductionComponentKey; componentLabel: string; variant: InteriorFinishVariant | null } | null {
  if (service.appliesTo !== "production") return null;

  const key = normalized(service.itemKey);
  const name = normalized(service.name);
  const category = normalized(service.category);
  const combined = `${key}_${name}`;
  const interiorVariant = normalizedInteriorVariant(key) ?? normalizedInteriorVariant(name) ?? normalizedInteriorVariant(fallbackInteriorVariant);

  // Travel/pricing surcharges are not physical production components even when
  // the legacy billing catalog stored them under appliesTo=production.
  if (category === "travel" || key.includes("surcharge") || name.includes("surcharge")) return null;

  if (
    key.includes("vog") ||
    name.includes("vog") ||
    key.includes("hybrid") ||
    name.includes("hybrid") ||
    key.includes("drywall") ||
    name.includes("drywall") ||
    key.includes("interior") ||
    name.includes("interior") ||
    combined.includes("trim_out")
  ) {
    return { componentKey: "interior_finish", componentLabel: "Interior Finish", variant: interiorVariant };
  }

  if (key.includes("siding") || name.includes("siding") || combined.includes("exterior_trim")) {
    return { componentKey: "siding", componentLabel: "Siding", variant: null };
  }

  if (
    key.includes("plumb") ||
    name.includes("plumb") ||
    key.includes("waterline") ||
    name.includes("waterline") ||
    key.includes("heat_wrap") ||
    name.includes("heat_wrap")
  ) {
    return { componentKey: "plumbing", componentLabel: "Plumbing", variant: null };
  }

  if (key.includes("skirt") || name.includes("skirt")) {
    return { componentKey: "skirting", componentLabel: "Skirting", variant: null };
  }

  return { componentKey: "custom", componentLabel: "Custom", variant: null };
}

function sourceServiceSnapshot(service: ServiceRow): ProductionComponentSourceService {
  return {
    id: service.id,
    name: service.name,
    itemKey: service.itemKey ?? null,
    category: service.category ?? null,
    appliesTo: service.appliesTo,
  };
}

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
}

function rowToView(row: JobProductionComponent): ProductionComponentView {
  return {
    id: row.id,
    jobId: row.jobId,
    businessId: row.businessId,
    componentKey: row.componentKey as ProductionComponentKey,
    componentInstanceKey: row.componentInstanceKey,
    componentLabel: row.componentLabel,
    variant: (row.variant as InteriorFinishVariant | null) ?? null,
    sourceServiceIds: row.sourceServiceIds ?? [],
    sourceServices: row.sourceServices ?? [],
    snapshotVersion: row.snapshotVersion,
    status: row.status as ProductionComponentStatus,
    expectedLaborHours: row.expectedLaborHours == null ? null : Number(row.expectedLaborHours),
    expectedDurationDays: row.expectedDurationDays,
    expectedCrewSize: row.expectedCrewSize,
    checklistContext: row.checklistContext ?? null,
    materialContext: row.materialContext ?? null,
    pricingContext: row.pricingContext ?? null,
    knowledgeContext: row.knowledgeContext ?? null,
    capturedAt: iso(row.capturedAt),
    persisted: true,
  };
}

function draftFingerprint(draft: ComponentDraft): string {
  return JSON.stringify({
    businessId: draft.businessId,
    componentKey: draft.componentKey,
    componentInstanceKey: draft.componentInstanceKey,
    componentLabel: draft.componentLabel,
    variant: draft.variant,
    sourceServiceIds: draft.sourceServiceIds,
    sourceServices: draft.sourceServices,
    expectedLaborHours: draft.expectedLaborHours,
    expectedDurationDays: draft.expectedDurationDays,
    expectedCrewSize: draft.expectedCrewSize,
    checklistContext: draft.checklistContext,
    materialContext: draft.materialContext,
    pricingContext: draft.pricingContext,
    knowledgeContext: draft.knowledgeContext,
  });
}

function rowFingerprint(row: JobProductionComponent): string {
  return draftFingerprint({
    jobId: row.jobId,
    businessId: row.businessId,
    componentKey: row.componentKey as ProductionComponentKey,
    componentInstanceKey: row.componentInstanceKey,
    componentLabel: row.componentLabel,
    variant: (row.variant as InteriorFinishVariant | null) ?? null,
    sourceServiceIds: row.sourceServiceIds ?? [],
    sourceServices: row.sourceServices ?? [],
    expectedLaborHours: row.expectedLaborHours == null ? null : String(row.expectedLaborHours),
    expectedDurationDays: row.expectedDurationDays,
    expectedCrewSize: row.expectedCrewSize,
    checklistContext: row.checklistContext ?? null,
    materialContext: row.materialContext ?? null,
    pricingContext: row.pricingContext ?? null,
    knowledgeContext: row.knowledgeContext ?? null,
  });
}

async function buildDrafts(job: Job): Promise<ComponentDraft[]> {
  if (job.workflow !== "mh_production") return [];

  const serviceIds = Array.isArray(job.mhProductionServices)
    ? job.mhProductionServices.map(Number).filter(Number.isInteger)
    : [];
  if (!serviceIds.length) return [];

  const serviceScope = job.businessId == null
    ? isNull(productionServiceTypesTable.businessId)
    : or(isNull(productionServiceTypesTable.businessId), eq(productionServiceTypesTable.businessId, job.businessId));
  const services = await db
    .select()
    .from(productionServiceTypesTable)
    .where(and(inArray(productionServiceTypesTable.id, serviceIds), serviceScope));
  if (!services.length) return [];
  services.sort((a, b) => a.id - b.id);

  const [modelContext] = job.mfhModelId
    ? await db
      .select({
        modelId: mfhModelsTable.id,
        modelName: mfhModelsTable.name,
        checklistTemplateId: mfhModelsTable.checklistTemplateId,
        checklistTemplateName: checklistTemplatesTable.name,
      })
      .from(mfhModelsTable)
      .leftJoin(checklistTemplatesTable, eq(mfhModelsTable.checklistTemplateId, checklistTemplatesTable.id))
      .where(eq(mfhModelsTable.id, job.mfhModelId))
      .limit(1)
    : [];

  const [jobChecklist] = await db
    .select({
      checklistId: jobChecklistsTable.id,
      templateId: jobChecklistsTable.templateId,
      templateName: jobChecklistsTable.templateName,
    })
    .from(jobChecklistsTable)
    .where(eq(jobChecklistsTable.jobId, job.id))
    .orderBy(desc(jobChecklistsTable.updatedAt))
    .limit(1);

  const materialLists = await db.select().from(materialListsTable).where(eq(materialListsTable.jobId, job.id));
  const materialItems = materialLists.length
    ? await db.select().from(materialListItemsTable).where(inArray(materialListItemsTable.listId, materialLists.map(list => list.id)))
    : [];

  const [knowledgeRecord] = await db
    .select()
    .from(jobKnowledgeRecordsTable)
    .where(eq(jobKnowledgeRecordsTable.jobId, job.id))
    .limit(1);
  const [knowledgeVersion] = knowledgeRecord
    ? await db
      .select()
      .from(jobKnowledgeRecordVersionsTable)
      .where(eq(jobKnowledgeRecordVersionsTable.knowledgeRecordId, knowledgeRecord.id))
      .orderBy(desc(jobKnowledgeRecordVersionsTable.snapshotAt))
      .limit(1)
    : [];

  const overrides = job.clientId
    ? await db
      .select()
      .from(productionPriceOverridesTable)
      .where(and(
        eq(productionPriceOverridesTable.clientId, job.clientId),
        eq(productionPriceOverridesTable.profileKind, "production"),
        inArray(productionPriceOverridesTable.serviceTypeId, serviceIds),
      ))
    : [];
  const overridesByService = new Map(overrides.map(override => [override.serviceTypeId, override]));

  const pricingSnapshotFor = (service: ServiceRow) => ({
    id: service.id,
    name: service.name,
    itemKey: service.itemKey ?? null,
    billingType: service.billingType,
    price: service.price,
    priceVog: service.priceVog,
    priceHybrid: service.priceHybrid,
    priceDrywall: service.priceDrywall,
    override: overridesByService.get(service.id)
      ? {
        id: overridesByService.get(service.id)!.id,
        price: overridesByService.get(service.id)!.price,
        priceVog: overridesByService.get(service.id)!.priceVog,
        priceHybrid: overridesByService.get(service.id)!.priceHybrid,
        priceDrywall: overridesByService.get(service.id)!.priceDrywall,
      }
      : null,
  });

  const fallbackVariant = job.mfhConstructionType?.replace(/^(FIELD|LOT)_/i, "");
  const grouped = new Map<string, ComponentDraft>();
  for (const service of services) {
    const classification = classifyProductionService(service, fallbackVariant);
    if (!classification) continue;
    const instanceKey = classification.componentKey === "custom"
      ? `custom:${service.id}`
      : `${classification.componentKey}:${classification.variant ?? "unspecified"}`;
    const existing = grouped.get(instanceKey);
    if (existing) {
      existing.sourceServiceIds.push(service.id);
      existing.sourceServices.push(sourceServiceSnapshot(service));
      const pricingServices = Array.isArray(existing.pricingContext?.services)
        ? existing.pricingContext.services as unknown[]
        : [];
      pricingServices.push(pricingSnapshotFor(service));
      existing.pricingContext = { ...existing.pricingContext, services: pricingServices };
      continue;
    }

    const pricingServices = [pricingSnapshotFor(service)];

    grouped.set(instanceKey, {
      jobId: job.id,
      businessId: job.businessId,
      componentKey: classification.componentKey,
      componentInstanceKey: instanceKey,
      componentLabel: classification.componentLabel,
      variant: classification.variant,
      sourceServiceIds: [service.id],
      sourceServices: [sourceServiceSnapshot(service)],
      expectedLaborHours: job.manHours == null ? null : String(job.manHours),
      expectedDurationDays: job.daysOnJob ?? null,
      expectedCrewSize: knowledgeRecord?.crewSize ?? null,
      checklistContext: {
        modelId: modelContext?.modelId ?? job.mfhModelId ?? null,
        modelName: modelContext?.modelName ?? null,
        checklistTemplateId: jobChecklist?.templateId ?? modelContext?.checklistTemplateId ?? null,
        checklistTemplateName: jobChecklist?.templateName ?? modelContext?.checklistTemplateName ?? null,
        jobChecklistId: jobChecklist?.checklistId ?? null,
      },
      materialContext: {
        lists: materialLists.map(list => ({
          id: list.id,
          name: list.name,
          itemIds: materialItems.filter(item => item.listId === list.id).map(item => item.id),
        })),
      },
      pricingContext: {
        clientId: job.clientId ?? null,
        homeType: job.mfhConstructionType ?? null,
        profileKind: "production",
        services: pricingServices,
      },
      knowledgeContext: {
        source: knowledgeRecord ? "job_knowledge_record" : "none",
        knowledgeRecordId: knowledgeRecord?.id ?? null,
        knowledgeStatus: knowledgeRecord?.status ?? null,
        knowledgeUpdatedAt: iso(knowledgeRecord?.updatedAt),
        latestVersionId: knowledgeVersion?.id ?? null,
        latestVersionSnapshotAt: iso(knowledgeVersion?.snapshotAt),
      },
    });
  }

  for (const draft of grouped.values()) {
    draft.sourceServiceIds.sort((a, b) => a - b);
    draft.sourceServices.sort((a, b) => a.id - b.id);
    const pricingServices = Array.isArray(draft.pricingContext?.services)
      ? draft.pricingContext.services as Array<{ id: number }>
      : [];
    pricingServices.sort((a, b) => a.id - b.id);
  }

  return Array.from(grouped.values()).sort((a, b) => a.componentInstanceKey.localeCompare(b.componentInstanceKey));
}

export async function getCurrentJobProductionComponents(jobId: number): Promise<JobProductionComponent[]> {
  return db
    .select()
    .from(jobProductionComponentsTable)
    .where(and(eq(jobProductionComponentsTable.jobId, jobId), isNull(jobProductionComponentsTable.supersededAt)))
    .orderBy(asc(jobProductionComponentsTable.id));
}

export async function getJobProductionComponents(job: Job): Promise<ProductionComponentView[]> {
  const current = await getCurrentJobProductionComponents(job.id);
  if (current.length) return current.map(rowToView);

  const drafts = await buildDrafts(job);
  return drafts.map((draft): ProductionComponentView => ({
    id: null,
    jobId: draft.jobId,
    businessId: draft.businessId,
    componentKey: draft.componentKey,
    componentInstanceKey: draft.componentInstanceKey,
    componentLabel: draft.componentLabel,
    variant: draft.variant,
    sourceServiceIds: draft.sourceServiceIds,
    sourceServices: draft.sourceServices,
    snapshotVersion: 0,
    status: "planned",
    expectedLaborHours: draft.expectedLaborHours == null ? null : Number(draft.expectedLaborHours),
    expectedDurationDays: draft.expectedDurationDays,
    expectedCrewSize: draft.expectedCrewSize,
    checklistContext: draft.checklistContext,
    materialContext: draft.materialContext,
    pricingContext: draft.pricingContext,
    knowledgeContext: draft.knowledgeContext,
    capturedAt: null,
    persisted: false,
  }));
}

export async function syncJobProductionComponents(job: Job): Promise<ProductionComponentView[]> {
  const drafts = await buildDrafts(job);
  const existingRows = await db
    .select()
    .from(jobProductionComponentsTable)
    .where(eq(jobProductionComponentsTable.jobId, job.id));
  const currentByInstance = new Map(
    existingRows.filter(row => row.supersededAt == null).map(row => [row.componentInstanceKey, row]),
  );
  const draftsByInstance = new Map(drafts.map(draft => [draft.componentInstanceKey, draft]));

  await db.transaction(async (tx) => {
    const now = new Date();
    for (const draft of drafts) {
      const current = currentByInstance.get(draft.componentInstanceKey);
      if (current && rowFingerprint(current) === draftFingerprint(draft)) {
        if (current.status === "not_applicable") {
          await tx.update(jobProductionComponentsTable)
            .set({ status: "planned", updatedAt: now })
            .where(eq(jobProductionComponentsTable.id, current.id));
        }
        continue;
      }

      if (current) {
        await tx.update(jobProductionComponentsTable)
          .set({ supersededAt: now, updatedAt: now })
          .where(eq(jobProductionComponentsTable.id, current.id));
      }
      const priorVersions = existingRows
        .filter(row => row.componentInstanceKey === draft.componentInstanceKey)
        .map(row => row.snapshotVersion);
      const snapshotVersion = (priorVersions.length ? Math.max(...priorVersions) : 0) + 1;
      await tx.insert(jobProductionComponentsTable).values({
        ...draft,
        snapshotVersion,
        status: "planned",
        capturedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const current of currentByInstance.values()) {
      if (!draftsByInstance.has(current.componentInstanceKey) && current.status !== "not_applicable") {
        await tx.update(jobProductionComponentsTable)
          .set({ status: "not_applicable", updatedAt: now })
          .where(eq(jobProductionComponentsTable.id, current.id));
      }
    }
  });

  const current = await getCurrentJobProductionComponents(job.id);
  return current.map(rowToView);
}

export async function setJobProductionComponentStatus(
  jobId: number,
  componentInstanceKey: string,
  status: ProductionComponentStatus,
): Promise<ProductionComponentView | null> {
  if (!isProductionComponentStatus(status)) return null;
  const [row] = await db
    .update(jobProductionComponentsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(
      eq(jobProductionComponentsTable.jobId, jobId),
      eq(jobProductionComponentsTable.componentInstanceKey, componentInstanceKey),
      isNull(jobProductionComponentsTable.supersededAt),
    ))
    .returning();
  return row ? rowToView(row) : null;
}

export { rowToView };