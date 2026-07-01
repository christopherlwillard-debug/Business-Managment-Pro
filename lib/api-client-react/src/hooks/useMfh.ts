import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface MfhConstructionType { id: number; name: string; }
export interface MfhManufacturer { id: number; name: string; active: boolean; createdAt?: string; }
export interface MfhModel {
  id: number;
  manufacturerId: number;
  name: string;
  constructionTypeId: number;
  constructionTypeName?: string | null;
  benchmarkId?: number | null;
  benchmarkName?: string | null;
  benchmarkHours?: string | null;
  checklistTemplateId?: number | null;
  checklistTemplateName?: string | null;
  defaultAddonKeys?: string[];
  basePrice?: string | null;
  notes?: string | null;
  active: boolean;
  introducedYear?: number | null;
  discontinuedYear?: number | null;
}

export interface LaborEntry {
  id: number;
  jobId: number;
  personName: string;
  workerType: string;
  linkedSubcontractorId?: number | null;
  productiveHours: string;
  travelHours: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaborSummary {
  entries: LaborEntry[];
  summary: {
    crewCount: number;
    totalProductiveHours: number;
    totalTravelHours: number;
    totalHours: number;
  };
}

export interface KnowledgeRecord {
  id?: number;
  jobId: number;
  mfhModelId?: number | null;
  builderId?: number | null;
  builderNameSnapshot?: string | null;
  modelNameSnapshot?: string | null;
  status: string;
  taughtAt?: string | null;
  productiveHours?: number | string | null;
  travelHours?: number | string | null;
  crewSize?: number | null;
  daysOnSite?: number | null;
  invoiceAmount?: number | string | null;
  materialCost?: number | string | null;
  consumablesCost?: number | string | null;
  grossProfit?: number | string | null;
  netProfit?: number | string | null;
  callbacks?: number;
  warrantyVisit?: boolean;
  missingMaterialsNotes?: string | null;
  factoryDefectNotes?: string | null;
  originalProductiveHours?: number | string | null;
  originalValues?: Record<string, unknown> | null;
  editReason?: string | null;
  editedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  isDraft?: boolean;
}

export interface MfhKbRecord {
  id: number;
  jobId: number;
  jobTitle: string;
  status: string;
  taughtAt?: string | null;
  productiveHours?: string | null;
  travelHours?: string | null;
  crewSize?: number | null;
  daysOnSite?: number | null;
  invoiceAmount?: string | null;
  materialCost?: string | null;
  consumablesCost?: string | null;
  grossProfit?: string | null;
  netProfit?: string | null;
  callbacks?: number;
  warrantyVisit?: boolean;
  originalValues?: Record<string, unknown> | null;
  editReason?: string | null;
  editedAt?: string | null;
}

export interface MfhKnowledgeBaseEntry {
  id: number;
  manufacturerId: number;
  manufacturerName?: string | null;
  name: string;
  constructionTypeId: number;
  constructionTypeName?: string | null;
  basePrice?: string | null;
  notes?: string | null;
  active: boolean;
  introducedYear?: number | null;
  discontinuedYear?: number | null;
  jobCount: number;
  avgQuotedPrice?: number | null;
  avgDealerPrice?: number | null;
  avgHours?: number | null;
  avgProductiveHours?: number | null;
  avgTravelHours?: number | null;
  avgCrewSize?: number | null;
  avgDaysOnSite?: number | null;
  avgMaterialCost?: number | null;
  avgConsumablesCost?: number | null;
  avgGrossProfit?: number | null;
  avgNetProfit?: number | null;
  acceptedCount?: number;
  avgInvoice?: number | null;
}

export interface MfhKbJob {
  id: number;
  title: string;
  status: string;
  clientId?: number | null;
  clientName?: string | null;
  mfhModelYear?: number | null;
  mfhQuotedPrice?: string | null;
  mfhDealerPrice?: string | null;
  mfhGuideName?: string | null;
  closedAt?: string | null;
  startDate?: string | null;
  address?: string | null;
  city?: string | null;
}

export interface MfhKbClientPrice {
  id: number;
  clientId: number;
  clientName?: string | null;
  price: string;
  notes?: string | null;
}

export interface MfhModelDetail {
  model: MfhKnowledgeBaseEntry;
  jobs: MfhKbJob[];
  clientPricing: MfhKbClientPrice[];
  knowledgeRecords?: MfhKbRecord[];
}
export interface MfhPricingGuide { id: number; manufacturerId: number; name: string; isDealerGuide: boolean; }
export interface MfhGuideItem { id: number; guideId: number; modelId: number; basePrice: string; }
export interface MfhGuideAddon { id: number; guideId: number; addonKey: string; label: string; price: string; isPerDay: boolean; }

export interface MfhPanelData {
  models: MfhModel[];
  guides: MfhPricingGuide[];
  guideItems: MfhGuideItem[];
  guideAddons: MfhGuideAddon[];
  constructionTypes: MfhConstructionType[];
  benchmarks: Array<{ id: number; jobType: string; estimatedHours?: string | null }>;
  templates: Array<{ id: number; name: string }>;
  clientOverrides: Record<number, string>;
}

export interface MfhLibraryData {
  manufacturers: MfhManufacturer[];
  models: MfhModel[];
  constructionTypes: MfhConstructionType[];
  benchmarks: Array<{ id: number; jobType: string; estimatedHours?: string | null }>;
  templates: Array<{ id: number; name: string }>;
}

export interface MfhJobData {
  id: number;
  mfhManufacturerId?: number | null;
  mfhModelId?: number | null;
  mfhModelYear?: number | null;
  mfhDealerPrice?: string | null;
  mfhQuotedPrice?: string | null;
  mfhGuideName?: string | null;
  mfhSelectedAddons?: string[] | null;
  mfhTravelDays?: number | null;
}

export function useListMfhManufacturers() {
  return useQuery({
    queryKey: ["/api/mfh/manufacturers"],
    queryFn: () => customFetch<MfhManufacturer[]>("/api/mfh/manufacturers", { method: "GET" }),
  });
}

export function useCreateMfhManufacturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      customFetch<MfhManufacturer>("/api/mfh/manufacturers", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/manufacturers"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] }); },
  });
}

export function useUpdateMfhManufacturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; active?: boolean }) =>
      customFetch<MfhManufacturer>(`/api/mfh/manufacturers/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/manufacturers"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] }); },
  });
}

export function useDeleteMfhManufacturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<{ ok: boolean }>(`/api/mfh/manufacturers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/manufacturers"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] }); },
  });
}

export function useListMfhConstructionTypes() {
  return useQuery({
    queryKey: ["/api/mfh/construction-types"],
    queryFn: () => customFetch<MfhConstructionType[]>("/api/mfh/construction-types", { method: "GET" }),
  });
}

export function useCreateMfhConstructionType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) =>
      customFetch<MfhConstructionType>("/api/mfh/construction-types", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/construction-types"] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] });
    },
  });
}

export function useMfhPanelData(manufacturerId: number | null, clientId?: number | null) {
  return useQuery({
    queryKey: ["/api/mfh/panel-data", manufacturerId, clientId],
    queryFn: () => {
      const url = `/api/mfh/panel-data?manufacturerId=${manufacturerId}${clientId ? `&clientId=${clientId}` : ""}`;
      return customFetch<MfhPanelData>(url, { method: "GET" });
    },
    enabled: manufacturerId != null,
  });
}

export function useMfhLibraryData() {
  return useQuery({
    queryKey: ["/api/mfh/library-data"],
    queryFn: () => customFetch<MfhLibraryData>("/api/mfh/library-data", { method: "GET" }),
  });
}

export function useMfhJobData(jobId: number) {
  return useQuery({
    queryKey: ["/api/mfh/jobs", jobId],
    queryFn: () => customFetch<MfhJobData>(`/api/mfh/jobs/${jobId}`, { method: "GET" }),
  });
}

export function useCreateMfhModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MfhModel> & { manufacturerId: number; name: string; constructionTypeId: number }) =>
      customFetch<MfhModel>("/api/mfh/models", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => { qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data", vars.manufacturerId] }); qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] }); },
  });
}

export function useUpdateMfhModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<MfhModel> & { id: number }) =>
      customFetch<MfhModel>(`/api/mfh/models/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] }); },
  });
}

export function useDeleteMfhModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<{ ok: boolean }>(`/api/mfh/models/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/library-data"] }); },
  });
}

export function useCreateMfhGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { manufacturerId: number; name: string; isDealerGuide?: boolean }) =>
      customFetch<MfhPricingGuide>("/api/mfh/guides", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data", vars.manufacturerId] }),
  });
}

export function useUpdateMfhGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; isDealerGuide?: boolean }) =>
      customFetch<MfhPricingGuide>(`/api/mfh/guides/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

export function useDeleteMfhGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<{ ok: boolean }>(`/api/mfh/guides/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

export function useUpsertMfhGuideItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { guideId: number; modelId: number; basePrice: number }) =>
      customFetch<MfhGuideItem>("/api/mfh/guide-items/upsert", { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

export function useCreateMfhGuideAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { guideId: number; addonKey: string; label: string; price: number; isPerDay: boolean }) =>
      customFetch<MfhGuideAddon>("/api/mfh/guide-addons", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

export function useUpdateMfhGuideAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; label?: string; price?: number; isPerDay?: boolean }) =>
      customFetch<MfhGuideAddon>(`/api/mfh/guide-addons/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

export function useDeleteMfhGuideAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<{ ok: boolean }>(`/api/mfh/guide-addons/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

export function useApplyMfhPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { jobId: number; manufacturerId: number; modelId: number; modelYear?: number | null; guideId?: number | null; selectedAddonKeys?: string[]; travelDays?: number; manualPrice?: number | null }) =>
      customFetch<{ ok: boolean; estimateId: number | null; mfhTotal: number }>(
        `/api/mfh/jobs/${data.jobId}/apply`,
        { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/jobs", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["/api/estimates"] });
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      qc.invalidateQueries({ queryKey: ["checklist-summaries"] });
    },
  });
}

export function useUpdateMfhPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { jobId: number; guideId?: number | null; modelId: number; selectedAddonKeys?: string[]; travelDays?: number }) =>
      customFetch<{ ok: boolean }>(
        `/api/mfh/jobs/${data.jobId}/update-pricing`,
        { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/jobs", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["/api/estimates"] });
    },
  });
}

export function useResetMfhPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { jobId: number; guideId?: number | null; modelId: number; selectedAddonKeys?: string[]; travelDays?: number }) =>
      customFetch<{ ok: boolean }>(
        `/api/mfh/jobs/${data.jobId}/reset`,
        { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/jobs", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["/api/estimates"] });
    },
  });
}

export function useMfhKnowledgeBase() {
  return useQuery({
    queryKey: ["/api/mfh/knowledge-base"],
    queryFn: () => customFetch<MfhKnowledgeBaseEntry[]>("/api/mfh/knowledge-base", { method: "GET" }),
  });
}

export function useMfhModelDetail(modelId: number | null) {
  return useQuery({
    queryKey: ["/api/mfh/knowledge-base", modelId],
    queryFn: () => customFetch<MfhModelDetail>(`/api/mfh/knowledge-base/${modelId}`, { method: "GET" }),
    enabled: modelId != null,
  });
}

export function useSetMfhClientPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { modelId: number; clientId: number; price: number; notes?: string }) =>
      customFetch<{ id: number; modelId: number; clientId: number; price: string; notes?: string | null }>(
        "/api/mfh/client-pricing",
        { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base", vars.modelId] });
    },
  });
}

export function useUpdateMfhClientPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId, price, notes }: { id: number; modelId: number; price: number; notes?: string }) =>
      customFetch<{ id: number; modelId: number; clientId: number; price: string; notes?: string | null }>(
        `/api/mfh/client-pricing/${id}`,
        { method: "PATCH", body: JSON.stringify({ price, notes }), headers: { "Content-Type": "application/json" } }
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base", vars.modelId] });
    },
  });
}

export function useDeleteMfhClientPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId }: { id: number; modelId: number }) =>
      customFetch<{ ok: boolean }>(`/api/mfh/client-pricing/${id}`, { method: "DELETE" }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base", vars.modelId] });
    },
  });
}

// ── Labor Entries ─────────────────────────────────────────────────────────────

export function useJobLaborEntries(jobId: number | null | undefined) {
  return useQuery({
    queryKey: ["/api/jobs/labor-entries", jobId],
    queryFn: () => customFetch<LaborSummary>(`/api/jobs/${jobId}/labor-entries`, { method: "GET" }),
    enabled: jobId != null,
  });
}

export function useAddLaborEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { jobId: number; personName: string; workerType: string; linkedSubcontractorId?: number | null; productiveHours: number; travelHours?: number }) =>
      customFetch<LaborEntry>(`/api/jobs/${data.jobId}/labor-entries`, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ["/api/jobs/labor-entries", vars.jobId] }),
  });
}

export function usePatchLaborEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, id, ...data }: { jobId: number; id: number; personName?: string; workerType?: string; productiveHours?: number; travelHours?: number }) =>
      customFetch<LaborEntry>(`/api/jobs/${jobId}/labor-entries/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ["/api/jobs/labor-entries", vars.jobId] }),
  });
}

export function useDeleteLaborEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, id }: { jobId: number; id: number }) =>
      customFetch<{ ok: boolean }>(`/api/jobs/${jobId}/labor-entries/${id}`, { method: "DELETE" }),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: ["/api/jobs/labor-entries", vars.jobId] }),
  });
}

// ── Knowledge Records ─────────────────────────────────────────────────────────

export function useJobKnowledgeRecord(jobId: number | null | undefined) {
  return useQuery({
    queryKey: ["/api/jobs/knowledge-record", jobId],
    queryFn: () => customFetch<KnowledgeRecord>(`/api/jobs/${jobId}/knowledge-record`, { method: "GET" }),
    enabled: jobId != null,
  });
}

export function useSaveKnowledgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<KnowledgeRecord> & { jobId: number }) =>
      customFetch<KnowledgeRecord>(`/api/jobs/${data.jobId}/knowledge-record`, { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/jobs/knowledge-record", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
    },
  });
}

export function useAcceptKnowledgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) =>
      customFetch<KnowledgeRecord>(`/api/jobs/${jobId}/knowledge-record/accept`, { method: "POST" }),
    onSuccess: (_r, jobId) => {
      qc.invalidateQueries({ queryKey: ["/api/jobs/knowledge-record", jobId] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
    },
  });
}

export function useExcludeKnowledgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: number) =>
      customFetch<KnowledgeRecord>(`/api/jobs/${jobId}/knowledge-record/exclude`, { method: "POST" }),
    onSuccess: (_r, jobId) => {
      qc.invalidateQueries({ queryKey: ["/api/jobs/knowledge-record", jobId] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
    },
  });
}

export function usePatchKnowledgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, ...data }: Partial<KnowledgeRecord> & { jobId: number }) =>
      customFetch<KnowledgeRecord>(`/api/jobs/${jobId}/knowledge-record`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/jobs/knowledge-record", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
    },
  });
}

// ── MH Production Billing (Task #1062) ────────────────────────────────────────
// Master catalog item ("Production Billing Item"). Prices/descriptions/rules are
// all data-driven and editable in Settings.
export interface ProductionServiceType {
  id: number;
  businessId?: number | null;
  name: string;
  itemKey?: string | null;
  invoiceDescription?: string | null;
  billingType: string;
  taxable: boolean;
  category?: string | null;
  price?: string | null;
  priceVog?: string | null;
  priceHybrid?: string | null;
  priceDrywall?: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

// A client's Production pricing profile row. Any null price* falls back to master.
export interface ProductionPriceOverride {
  id: number;
  clientId: number;
  serviceTypeId: number;
  profileKind: string;
  price?: string | null;
  priceVog?: string | null;
  priceHybrid?: string | null;
  priceDrywall?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionBillingTypeOption {
  value: string;
  quantityBased: boolean;
}

export interface ProductionServiceTypeInput {
  name: string;
  invoiceDescription?: string | null;
  billingType?: string;
  taxable?: boolean;
  category?: string | null;
  price?: number | string | null;
  priceVog?: number | string | null;
  priceHybrid?: number | string | null;
  priceDrywall?: number | string | null;
  sortOrder?: number;
  businessId?: number | null;
}

export function useListProductionServiceTypes(businessId?: number | null, includeInactive?: boolean) {
  return useQuery({
    queryKey: ["/api/production-service-types", businessId ?? null, includeInactive ?? false],
    queryFn: () => {
      const params = new URLSearchParams();
      if (businessId) params.set("businessId", String(businessId));
      if (includeInactive) params.set("includeInactive", "true");
      const qs = params.toString();
      return customFetch<ProductionServiceType[]>(
        `/api/production-service-types${qs ? `?${qs}` : ""}`,
        { method: "GET" }
      );
    },
  });
}

// Catalog health — lets Settings surface a clear warning when the seed failed
// (e.g. schema drift because a change hasn't been Published yet) instead of the
// catalog silently degrading. `ok:true` with `itemCount:0` = genuinely empty;
// `ok:false` = seed/schema failure, re-publish needed.
export interface ProductionCatalogStatus {
  ok: boolean;
  seedError: string | null;
  readError: string | null;
  itemCount: number | null;
}

export function useProductionCatalogStatus() {
  return useQuery({
    queryKey: ["/api/production-service-types/status"],
    queryFn: () => customFetch<ProductionCatalogStatus>(
      "/api/production-service-types/status",
      { method: "GET" }
    ),
  });
}

export function useProductionBillingTypes() {
  return useQuery({
    queryKey: ["/api/production-service-types/billing-types"],
    queryFn: () => customFetch<ProductionBillingTypeOption[]>(
      "/api/production-service-types/billing-types",
      { method: "GET" }
    ),
    staleTime: Infinity,
  });
}

export function useCreateProductionServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductionServiceTypeInput) =>
      customFetch<ProductionServiceType>("/api/production-service-types", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/production-service-types"] }),
  });
}

export function useUpdateProductionServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ProductionServiceTypeInput> & { id: number; active?: boolean }) =>
      customFetch<ProductionServiceType>(`/api/production-service-types/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/production-service-types"] }),
  });
}

export function useDeleteProductionServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<ProductionServiceType>(`/api/production-service-types/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/production-service-types"] }),
  });
}

// ── Client Production pricing profile (overrides) ─────────────────────────────
export function useProductionPriceOverrides(clientId?: number | null) {
  return useQuery({
    queryKey: ["/api/production-service-types/overrides", clientId ?? null],
    queryFn: () => customFetch<ProductionPriceOverride[]>(
      `/api/production-service-types/overrides?clientId=${clientId}`,
      { method: "GET" }
    ),
    enabled: clientId != null,
  });
}

export function useUpsertProductionPriceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      clientId: number;
      serviceTypeId: number;
      price?: number | string | null;
      priceVog?: number | string | null;
      priceHybrid?: number | string | null;
      priceDrywall?: number | string | null;
    }) =>
      customFetch<ProductionPriceOverride>("/api/production-service-types/overrides", {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_r, vars) =>
      qc.invalidateQueries({ queryKey: ["/api/production-service-types/overrides", vars.clientId] }),
  });
}

export function useDeleteProductionPriceOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; clientId: number }) =>
      customFetch<ProductionPriceOverride>(`/api/production-service-types/overrides/${id}`, { method: "DELETE" }),
    onSuccess: (_r, vars) =>
      qc.invalidateQueries({ queryKey: ["/api/production-service-types/overrides", vars.clientId] }),
  });
}

// ── Apply Production Pricing (build DRAFT invoice from checked items) ──────────
export interface ApplyProductionPricingResult {
  invoice?: unknown;
  created?: boolean;
  updated?: boolean;
  conflict?: "draft";
  invoiceId?: number;
  invoiceNumber?: string;
  lockedExisting?: { invoiceId: number; invoiceNumber: string; status: string } | null;
  error?: string;
}

export function useApplyProductionPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { jobId: number; quantities?: Record<number, number>; overwrite?: boolean }) =>
      customFetch<ApplyProductionPricingResult>(
        `/api/jobs/${data.jobId}/apply-production-pricing`,
        {
          method: "POST",
          body: JSON.stringify({ quantities: data.quantities ?? {}, overwrite: data.overwrite === true }),
          headers: { "Content-Type": "application/json" },
        }
      ),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/jobs", vars.jobId] });
    },
  });
}
