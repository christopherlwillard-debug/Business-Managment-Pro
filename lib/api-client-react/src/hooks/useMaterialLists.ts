import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface MaterialListItem {
  id: number;
  listId: number;
  materialId?: number | null;
  nameSnapshot: string;
  unitSnapshot: string;
  unitCostSnapshot: number;
  qty: number;
}

export interface MaterialList {
  id: number;
  name: string;
  jobId?: number | null;
  jobTitle?: string | null;
  markup: number;
  createdAt: string;
  items: MaterialListItem[];
}

export interface MaterialListItemInput {
  materialId?: number | null;
  nameSnapshot: string;
  unitSnapshot?: string;
  unitCostSnapshot: number;
  qty: number;
}

export interface CreateMaterialListRequest {
  name: string;
  jobId?: number | null;
  markup?: number;
  items?: MaterialListItemInput[];
}

const QK = "/api/material-lists";

export function useListMaterialLists(opts?: { jobId?: number }) {
  const params = new URLSearchParams();
  if (opts?.jobId) params.append("jobId", String(opts.jobId));
  const qs = params.toString();
  return useQuery({
    queryKey: [QK, qs],
    queryFn: () => customFetch<MaterialList[]>(`/api/material-lists${qs ? `?${qs}` : ""}`, { method: "GET" }),
  });
}

export function useGetMaterialList(id: number | null) {
  return useQuery({
    queryKey: [QK, id],
    queryFn: () => customFetch<MaterialList>(`/api/material-lists/${id}`, { method: "GET" }),
    enabled: id != null,
  });
}

export function useCreateMaterialList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMaterialListRequest) =>
      customFetch<MaterialList>("/api/material-lists", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateMaterialList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & CreateMaterialListRequest) =>
      customFetch<MaterialList>(`/api/material-lists/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteMaterialList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/material-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export interface AttachToInvoiceRequest {
  id: number;
  invoiceId?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
}

export function useAttachMaterialListToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AttachToInvoiceRequest) =>
      customFetch<{ invoiceId: number | null; created: boolean }>(
        `/api/material-lists/${id}/attach-to-invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
  });
}
