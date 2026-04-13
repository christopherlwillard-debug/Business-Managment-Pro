import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";
import type {
  Prospect,
  CreateProspectRequest,
  UpdateProspectRequest,
  ListProspectsParams,
  ProspectStatus,
} from "../generated/api.schemas";

export type { Prospect, CreateProspectRequest, UpdateProspectRequest, ListProspectsParams, ProspectStatus };
export { ProspectStatus as ProspectStatusEnum } from "../generated/api.schemas";
export { ProspectPropertyType as ProspectPropertyTypeEnum } from "../generated/api.schemas";
export type { ProspectPropertyType } from "../generated/api.schemas";

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
