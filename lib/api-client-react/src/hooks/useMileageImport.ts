import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface MileageImportRecord {
  id: number;
  businessId: number | null;
  userId: string | null;
  source: string;
  filename: string;
  fileHash: string | null;
  status: "completed" | "rolled_back" | "failed" | "partial";
  tripsFound: number;
  tripsImported: number;
  duplicatesSkipped: number;
  totalMiles: number | null;
  estimatedDeduction: number | null;
  errorSummary: string | null;
  rolledBackAt: string | null;
  importedAt: string;
}

export interface BulkImportTrip {
  date: string;
  miles: number;
  startLocation: string;
  endLocation: string;
  classification: "business" | "personal";
  notes?: string;
}

export interface BulkImportRequest {
  trips: BulkImportTrip[];
  businessId: number;
  filename: string;
  fileHash?: string;
  source?: string;
  skipPersonal?: boolean;
}

export interface BulkImportResult {
  imported: number;
  duplicatesSkipped: number;
  importId: number;
  totalMiles: number;
  estimatedDeduction: number;
  fileAlreadyImported: boolean;
}

export function useListMileageImports(businessId: number | undefined) {
  return useQuery<MileageImportRecord[]>({
    queryKey: ["mileage-imports", businessId],
    queryFn: () =>
      customFetch<MileageImportRecord[]>(`/api/mileage/imports?businessId=${businessId}`),
    enabled: !!businessId,
  });
}

export function useBulkImportMileage() {
  const queryClient = useQueryClient();
  return useMutation<BulkImportResult, Error, BulkImportRequest>({
    mutationFn: (data) =>
      customFetch<BulkImportResult>("/api/mileage/bulk", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-imports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mileage"] });
    },
  });
}

export function useRollbackMileageImport() {
  const queryClient = useQueryClient();
  return useMutation<MileageImportRecord, Error, { id: number }>({
    mutationFn: ({ id }) =>
      customFetch<MileageImportRecord>(`/api/mileage/imports/${id}/rollback`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage-imports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mileage"] });
    },
  });
}
