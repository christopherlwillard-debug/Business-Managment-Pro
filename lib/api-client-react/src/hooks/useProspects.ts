import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";
import type {
  Prospect,
  CreateProspectRequest,
  UpdateProspectRequest,
  ProspectStatus,
  ProspectStatusEvent,
  ProspectDetail,
  ProspectServiceVisit,
  AddServiceVisitRequest,
  ProspectRevenueSummary,
} from "../generated/api.schemas";

export interface ListProspectsParams {
  status?: ProspectStatus;
}

export type { Prospect, CreateProspectRequest, UpdateProspectRequest, ProspectStatus };
export type { ProspectStatusEvent, ProspectDetail, ProspectServiceVisit, AddServiceVisitRequest };
export type { ProspectRevenueSummary };
export { ProspectStatus as ProspectStatusEnum } from "../generated/api.schemas";
export { ProspectPropertyType as ProspectPropertyTypeEnum } from "../generated/api.schemas";
export type { ProspectPropertyType } from "../generated/api.schemas";

export function useGetProspect(id: number | null) {
  return useQuery({
    queryKey: ["/api/prospects", id],
    queryFn: () => customFetch<ProspectDetail>(`/api/prospects/${id}`, { method: "GET" }),
    enabled: id != null,
  });
}

export function useListProspects(opts?: ListProspectsParams) {
  const params = new URLSearchParams();
  if (opts?.status) params.append("status", opts.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ["/api/prospects", qs],
    queryFn: () => customFetch<Prospect[]>(`/api/prospects${qs ? `?${qs}` : ""}`, { method: "GET" }),
  });
}

export function useCreateProspect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProspectRequest) =>
      customFetch<Prospect>("/api/prospects", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/prospects"] }),
  });
}

export function useUpdateProspect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateProspectRequest & { id: number }) =>
      customFetch<Prospect>(`/api/prospects/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/prospects"] }),
  });
}

export function useDeleteProspect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/prospects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/prospects"] }),
  });
}

export function useAddProspectServiceVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: AddServiceVisitRequest & { id: number }) =>
      customFetch<ProspectDetail>(`/api/prospects/${id}/service-visits`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/prospects"] });
      qc.invalidateQueries({ queryKey: ["/api/prospects", variables.id] });
      qc.invalidateQueries({ queryKey: ["/api/prospects/revenue-summary"] });
    },
  });
}

export function useUpdateProspectServiceVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      prospectId,
      visitId,
      ...data
    }: {
      prospectId: number;
      visitId: number;
      servicedAt?: string;
      notes?: string | null;
      price?: number | null;
    }) =>
      customFetch<ProspectDetail>(`/api/prospects/${prospectId}/service-visits/${visitId}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/prospects"] });
      qc.invalidateQueries({ queryKey: ["/api/prospects", variables.prospectId] });
      qc.invalidateQueries({ queryKey: ["/api/prospects/revenue-summary"] });
    },
  });
}

export function useDeleteProspectServiceVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prospectId, visitId }: { prospectId: number; visitId: number }) =>
      customFetch<ProspectDetail>(`/api/prospects/${prospectId}/service-visits/${visitId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/prospects"] });
      qc.invalidateQueries({ queryKey: ["/api/prospects", variables.prospectId] });
      qc.invalidateQueries({ queryKey: ["/api/prospects/revenue-summary"] });
    },
  });
}

export function useProspectRevenueSummary() {
  return useQuery({
    queryKey: ["/api/prospects/revenue-summary"],
    queryFn: () => customFetch<ProspectRevenueSummary>("/api/prospects/revenue-summary", { method: "GET" }),
    staleTime: 60_000,
  });
}

export function useConvertProspectToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ id: number; name: string; createdAt: string }>(`/api/prospects/${id}/convert-to-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prospects"] });
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });
}
