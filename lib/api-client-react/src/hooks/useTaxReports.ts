import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

// Types for tax reports
export interface ScheduleCLineItem {
  line: number;
  description: string;
  amount: number;
}

export interface ScheduleCReport {
  year: number;
  grossReceipts: number;
  expenses: Record<string, number>;
  expensesByCategory: Record<string, { amount: number; count: number }>;
  scheduleLines: ScheduleCLineItem[];
  totalExpenses: number;
  grossProfit: number;
  mileageData: {
    totalBusinessMiles: number;
    ratePerMile: number | null;
    ratePeriods: {
      effectiveDate: string;
      periodStart: string;
      periodEnd: string;
      rate: number;
      miles: number;
      deduction: number;
    }[];
    deduction: number;
    logCount: number;
  };
  mealsBreakdown?: {
    receiptCount: number;
    totalSpend: number;
    deductibleAmount: number;
    explicitOverrideCount: number;
  };
  dataQuality: {
    uncategorizedExpenses: number;
    invoicesDraft: number;
    mileageLogsWithoutClassification: number;
    warnings: string[];
  };
}

export interface Payment {
  id: number;
  subcontractorId: number;
  subcontractorName?: string;
  amount: number;
  paymentDate: string;
  year: number;
  description?: string;
  invoiceNumber?: string;
  notes?: string;
  createdAt?: string;
}

// Get Schedule C report for a specific year, optionally filtered by business
export function useScheduleCReport(year: number = new Date().getFullYear(), businessLine?: string) {
  return useQuery({
    queryKey: ["/api/tax-reports/schedule-c", year, businessLine ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams({ year: String(year) });
      if (businessLine) params.set("businessLine", businessLine);
      return customFetch<ScheduleCReport>(`/api/tax-reports/schedule-c?${params}`, { method: "GET" });
    },
  });
}

// List all payments with filters
export function usePaymentsList(year?: number, subcontractorId?: number) {
  const params = new URLSearchParams();
  if (year) params.append("year", year.toString());
  if (subcontractorId) params.append("subcontractorId", subcontractorId.toString());
  
  return useQuery({
    queryKey: ["/api/payments", year, subcontractorId],
    queryFn: () => customFetch<Payment[]>(`/api/payments?${params.toString()}`, { method: "GET" }),
  });
}

// Get a single payment
export function usePayment(id: number) {
  return useQuery({
    queryKey: ["/api/payments", id],
    queryFn: () => customFetch<Payment>(`/api/payments/${id}`, { method: "GET" }),
    enabled: !!id,
  });
}

// Create payment
export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Payment, "id" | "createdAt">) =>
      customFetch<Payment>("/api/payments", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-reports"] });
    },
  });
}

// Update payment
export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Payment> & { id: number }) =>
      customFetch<Payment>(`/api/payments/${id}`, { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-reports"] });
    },
  });
}

// Delete payment
export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-reports"] });
    },
  });
}
