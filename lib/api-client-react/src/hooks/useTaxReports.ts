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
    ratePerMile: number;
    deduction: number;
    logCount: number;
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

export interface SubcontractorPayments {
  year: number;
  subcontractorId: number;
  totalPayments: number;
  paymentCount: number;
  payments: Payment[];
}

export interface SubcontractorPaymentSummary {
  id: number;
  name: string;
  totalPayments: number;
  paymentCount: number;
}

export interface AllSubcontractorsPayments {
  year: number;
  subcontractors: SubcontractorPaymentSummary[];
}

// Get Schedule C report for a specific year
export function useScheduleCReport(year: number = new Date().getFullYear()) {
  return useQuery({
    queryKey: ["/api/tax-reports/schedule-c", year],
    queryFn: () => customFetch<ScheduleCReport>(`/api/tax-reports/schedule-c?year=${year}`, { method: "GET" }),
  });
}

// Get payments for a specific subcontractor
export function useSubcontractorPayments(subcontractorId: number, year: number = new Date().getFullYear()) {
  return useQuery({
    queryKey: ["/api/tax-reports/subcontractor", subcontractorId, year],
    queryFn: () => customFetch<SubcontractorPayments>(`/api/tax-reports/subcontractor/${subcontractorId}?year=${year}`, { method: "GET" }),
    enabled: !!subcontractorId,
  });
}

// Get all subcontractors with their payment totals (admin view)
export function useAllSubcontractorsPayments(year: number = new Date().getFullYear()) {
  return useQuery({
    queryKey: ["/api/tax-reports/admin/all-subcontractors", year],
    queryFn: () => customFetch<AllSubcontractorsPayments>(`/api/tax-reports/admin/all-subcontractors?year=${year}`, { method: "GET" }),
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
