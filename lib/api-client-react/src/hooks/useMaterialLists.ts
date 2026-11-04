import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";
import { updateMaterialListInvoiceAssignment } from "../generated/api";
import type { MaterialListInvoiceAssignmentHistoryEvent } from "../generated/api.schemas";

export interface MaterialListItem {
  id: number;
  listId: number;
  materialId?: number | null;
  nameSnapshot: string;
  unitSnapshot: string;
  unitCostSnapshot: number;
  qty: number;
  addToJobExpenses?: boolean;
  expenseId?: number | null;
}

export interface MaterialList {
  id: number;
  name: string;
  jobId?: number | null;
  jobTitle?: string | null;
  clientId?: number | null;
  invoiceId?: number | null;
  markup: number;
  createdAt: string;
  items: MaterialListItem[];
}

export interface MaterialListItemInput {
  id?: number | null;          // existing item id, used by the API to match rows on update
  materialId?: number | null;
  nameSnapshot: string;
  unitSnapshot?: string;
  unitCostSnapshot: number;
  qty: number;
  addToJobExpenses?: boolean;
  expenseId?: number | null;
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
  invoiceId: number | null;
  confirmAfterFinalized: boolean;
}

export function useAttachMaterialListToInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, invoiceId, confirmAfterFinalized }: AttachToInvoiceRequest) =>
      updateMaterialListInvoiceAssignment(id, { invoiceId, confirmAfterFinalized }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}

export function useMaterialListInvoiceAssignmentHistory(id: number, enabled: boolean) {
  return useQuery({
    queryKey: [QK, id, "invoice-assignment-history"],
    enabled,
    queryFn: () => customFetch<MaterialListInvoiceAssignmentHistoryEvent[]>(
      `/api/material-lists/${id}/invoice-assignment-history`,
      { method: "GET" },
    ),
  });
}
