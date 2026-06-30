import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface MfhConstructionType { id: number; name: string; }
export interface MfhManufacturer { id: number; name: string; createdAt?: string; }
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
  notes?: string | null;
  active: boolean;
  introducedYear?: number | null;
  discontinuedYear?: number | null;
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
}

export interface MfhLibraryData {
  manufacturers: MfhManufacturer[];
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
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      customFetch<MfhManufacturer>(`/api/mfh/manufacturers/${id}`, { method: "PATCH", body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" } }),
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

export function useMfhPanelData(manufacturerId: number | null) {
  return useQuery({
    queryKey: ["/api/mfh/panel-data", manufacturerId],
    queryFn: () => customFetch<MfhPanelData>(`/api/mfh/panel-data?manufacturerId=${manufacturerId}`, { method: "GET" }),
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
    mutationFn: (data: { jobId: number; manufacturerId: number; modelId: number; modelYear?: number | null; guideId: number; selectedAddonKeys: string[]; travelDays?: number }) =>
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
    mutationFn: (data: { jobId: number; guideId: number; modelId: number; selectedAddonKeys: string[]; travelDays?: number }) =>
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
    mutationFn: (data: { jobId: number; guideId: number; modelId: number; selectedAddonKeys: string[]; travelDays?: number }) =>
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
