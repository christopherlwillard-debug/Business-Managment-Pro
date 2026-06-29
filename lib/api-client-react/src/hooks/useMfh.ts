import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface MfhConstructionType { id: number; name: string; }

// Home Series — the priced entity (construction type, pricing, benchmark,
// checklist, default add-ons, notes). There is no dealer/manufacturer entity;
// the dealer is captured by the job's Client field.
export interface MfhHomeSeries {
  id: number;
  name: string;
  constructionTypeId: number;
  constructionTypeName?: string | null;
  benchmarkId?: number | null;
  benchmarkName?: string | null;
  benchmarkHours?: string | null;
  checklistTemplateId?: number | null;
  checklistTemplateName?: string | null;
  defaultAddonKeys?: string[];
  notes?: string | null;
  active: boolean;
  introducedYear?: number | null;
  discontinuedYear?: number | null;
}

// Model — the genuine model name (Farmhouse, Freedom, …) under a series.
// Optional and descriptive; inherits the series' construction type / pricing /
// checklist / benchmark / add-ons.
export interface MfhModel {
  id: number;
  homeSeriesId: number;
  name: string;
  notes?: string | null;
  active: boolean;
  introducedYear?: number | null;
  discontinuedYear?: number | null;
}

export interface MfhPricingGuide { id: number; name: string; isDealerGuide: boolean; }
export interface MfhGuideItem { id: number; guideId: number; homeSeriesId: number; basePrice: string; }
export interface MfhGuideAddon { id: number; guideId: number; addonKey: string; label: string; price: string; isPerDay: boolean; }

export interface MfhPanelData {
  series: MfhHomeSeries[];
  models: MfhModel[];
  guides: MfhPricingGuide[];
  guideItems: MfhGuideItem[];
  guideAddons: MfhGuideAddon[];
  constructionTypes: MfhConstructionType[];
  benchmarks: Array<{ id: number; jobType: string; estimatedHours?: string | null }>;
  templates: Array<{ id: number; name: string }>;
}

export interface MfhLibraryData {
  constructionTypes: MfhConstructionType[];
  benchmarks: Array<{ id: number; jobType: string; estimatedHours?: string | null }>;
  templates: Array<{ id: number; name: string }>;
}

export interface MfhJobData {
  id: number;
  mfhSeriesId?: number | null;
  mfhModelId?: number | null;
  mfhModelYear?: number | null;
  mfhDealerPrice?: string | null;
  mfhQuotedPrice?: string | null;
  mfhGuideName?: string | null;
  mfhSelectedAddons?: string[] | null;
  mfhTravelDays?: number | null;
}

// ── Home Series ───────────────────────────────────────────────────────────────
export function useListMfhSeries() {
  return useQuery({
    queryKey: ["/api/mfh/series"],
    queryFn: () => customFetch<MfhHomeSeries[]>("/api/mfh/series", { method: "GET" }),
  });
}

export function useCreateMfhSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MfhHomeSeries> & { name: string; constructionTypeId: number }) =>
      customFetch<MfhHomeSeries>("/api/mfh/series", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/series"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); },
  });
}

export function useUpdateMfhSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<MfhHomeSeries> & { id: number }) =>
      customFetch<MfhHomeSeries>(`/api/mfh/series/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/series"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); },
  });
}

export function useDeleteMfhSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<{ ok: boolean }>(`/api/mfh/series/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/series"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); },
  });
}

// ── Construction types ──────────────────────────────────────────────────────
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

// ── Panel / library data ────────────────────────────────────────────────────
export function useMfhPanelData() {
  return useQuery({
    queryKey: ["/api/mfh/panel-data"],
    queryFn: () => customFetch<MfhPanelData>("/api/mfh/panel-data", { method: "GET" }),
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

// ── Models ──────────────────────────────────────────────────────────────────
export function useListMfhModels(seriesId: number | null) {
  return useQuery({
    queryKey: ["/api/mfh/models", seriesId],
    queryFn: () => customFetch<MfhModel[]>(`/api/mfh/models?seriesId=${seriesId}`, { method: "GET" }),
    enabled: seriesId != null,
  });
}

export function useCreateMfhModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MfhModel> & { homeSeriesId: number; name: string }) =>
      customFetch<MfhModel>("/api/mfh/models", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: (_r, vars) => { qc.invalidateQueries({ queryKey: ["/api/mfh/models", vars.homeSeriesId] }); qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); },
  });
}

export function useUpdateMfhModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<MfhModel> & { id: number }) =>
      customFetch<MfhModel>(`/api/mfh/models/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/models"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); },
  });
}

export function useDeleteMfhModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => customFetch<{ ok: boolean }>(`/api/mfh/models/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/mfh/models"] }); qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }); },
  });
}

// ── Guides (global) ─────────────────────────────────────────────────────────
export function useCreateMfhGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; isDealerGuide?: boolean }) =>
      customFetch<MfhPricingGuide>("/api/mfh/guides", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
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
    mutationFn: (data: { guideId: number; homeSeriesId: number; basePrice: number }) =>
      customFetch<MfhGuideItem>("/api/mfh/guide-items/upsert", { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mfh/panel-data"] }),
  });
}

// ── Guide add-ons ───────────────────────────────────────────────────────────
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

// ── Apply / update / reset on a job ─────────────────────────────────────────
export function useApplyMfhPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { jobId: number; seriesId: number; modelId?: number | null; modelYear?: number | null; guideId: number; selectedAddonKeys: string[]; travelDays?: number }) =>
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
    mutationFn: (data: { jobId: number; guideId: number; seriesId: number; selectedAddonKeys: string[]; travelDays?: number }) =>
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
    mutationFn: (data: { jobId: number; guideId: number; seriesId: number; selectedAddonKeys: string[]; travelDays?: number }) =>
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
