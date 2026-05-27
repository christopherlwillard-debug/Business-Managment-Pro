import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface QuickCharge {
  id: number;
  label: string;
  amount: number;
  customerName?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  squarePaymentLinkId?: string | null;
  squarePaymentLinkUrl?: string | null;
  payToken?: string | null;
  qrCodeDataUrl?: string | null;
  status: string;
  paidAt?: string | null;
  createdAt: string;
}

export interface CreateQuickChargeRequest {
  label: string;
  amount: number;
  customerName?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
}

export interface CreateInvoicePaymentLinkResponse {
  paymentLinkUrl: string;
  paymentLinkId: string;
  invoice: { remindersSentAt?: string[] | null } | null;
  emailSent?: boolean;
  emailWarning?: string;
}

export interface CreateDepositLinkRequest {
  depositAmount?: number;
  depositPercent?: number;
}

export interface CreateDepositLinkResponse {
  paymentLinkUrl: string;
  paymentLinkId: string;
  depositAmount: number;
  prospect: unknown;
}

export interface SquareStatus {
  connected: boolean;
  message?: string;
  merchantId?: string | null;
  businessName?: string | null;
  country?: string | null;
  currency?: string | null;
}

export interface CreateEstimateDepositLinkResponse {
  paymentLinkUrl: string;
  paymentLinkId: string;
  depositAmount: number;
  estimate: unknown;
}

export function useListQuickCharges() {
  return useQuery({
    queryKey: ["/api/quick-charges"],
    queryFn: () => customFetch<QuickCharge[]>("/api/quick-charges", { method: "GET" }),
    refetchInterval: 15_000,
  });
}

export function useCreateQuickCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateQuickChargeRequest) =>
      customFetch<QuickCharge>("/api/quick-charges", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/quick-charges"] }),
  });
}

export function useDeleteQuickCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/quick-charges/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/quick-charges"] }),
  });
}

export function useCreateInvoicePaymentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      customFetch<CreateInvoicePaymentLinkResponse>(`/api/invoices/${invoiceId}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
  });
}

export function useDeleteInvoicePaymentLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      customFetch<{ success: boolean; invoice: unknown }>(`/api/invoices/${invoiceId}/payment-link`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
  });
}

export function useSquareStatus() {
  return useQuery({
    queryKey: ["/api/square/status"],
    queryFn: () => customFetch<SquareStatus>("/api/square/status", { method: "GET" }),
    staleTime: 60_000,
  });
}

export function useCreateProspectDepositLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & CreateDepositLinkRequest) =>
      customFetch<CreateDepositLinkResponse>(`/api/prospects/${id}/deposit-link`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prospects"] });
    },
  });
}

export interface SquareTransaction {
  id: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  amountCents: number;
  currency: string;
  buyerEmail: string | null;
  cardBrand: string | null;
  last4: string | null;
  cardholderName: string | null;
  note: string | null;
  referenceId: string | null;
  sourceType: string | null;
  receiptUrl: string | null;
  receiptNumber: string | null;
}

export interface SquareLiveTransactionsResponse {
  connected: boolean;
  message?: string;
  transactions: SquareTransaction[];
  summary?: {
    totalCents: number;
    completedCount: number;
    totalCount: number;
    days: number;
  };
}

export function useSquareLiveTransactions(days: number = 30) {
  return useQuery({
    queryKey: ["/api/square/live-transactions", days],
    queryFn: () =>
      customFetch<SquareLiveTransactionsResponse>(
        `/api/square/live-transactions?days=${days}`,
        { method: "GET" }
      ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateEstimateDepositLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & CreateDepositLinkRequest) =>
      customFetch<CreateEstimateDepositLinkResponse>(`/api/estimates/${id}/deposit-link`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/estimates"] });
    },
  });
}
