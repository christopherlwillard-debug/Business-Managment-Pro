import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface Material {
  id: number;
  name: string;
  description?: string | null;
  unit: string;
  unitCost: number;
  category?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export type InsertMaterial = Omit<Material, "id" | "createdAt">;

export function useListMaterials(opts?: { search?: string; category?: string; includeInactive?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.search) params.append("search", opts.search);
  if (opts?.category) params.append("category", opts.category);
  if (opts?.includeInactive) params.append("includeInactive", "true");
  const qs = params.toString();
  return useQuery({
    queryKey: ["/api/materials", qs],
    queryFn: () => customFetch<Material[]>(`/api/materials${qs ? `?${qs}` : ""}`, { method: "GET" }),
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertMaterial) =>
      customFetch<Material>("/api/materials", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/materials"] }),
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Material) =>
      customFetch<Material>(`/api/materials/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/materials"] }),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/materials"] }),
  });
}
