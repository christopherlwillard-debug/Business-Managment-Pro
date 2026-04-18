import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface QuickCharge {
  id: number;
  label: string;
  amount: number;
  customerName?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  stripePaymentLinkId?: string | null;
  stripePaymentLinkUrl?: string | null;
  stripePaymentIntentId?: string | null;
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
  invoice: unknown;
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

export function useListQuickCharges() {
  return useQuery({
    queryKey: ["/api/quick-charges"],
    queryFn: () => customFetch<QuickCharge[]>("/api/quick-charges", { method: "GET" }),
    refetchInterval: 15_000,
  });
}

export interface CreateQuickChargeRequestWithBase extends CreateQuickChargeRequest {
  payPageBaseUrl?: string | null;
}

export function useCreateQuickCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateQuickChargeRequestWithBase) =>
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

export interface StripeStatus {
  connected: boolean;
  message?: string;
  accountId?: string;
  displayName?: string | null;
  country?: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}

export function useStripeStatus() {
  return useQuery({
    queryKey: ["/api/stripe/status"],
    queryFn: () => customFetch<StripeStatus>("/api/stripe/status", { method: "GET" }),
    staleTime: 60_000,
  });
}

export interface CreatePaySessionResponse {
  payUrl: string;
  payToken: string;
}

export function useCreateInvoicePaySession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payPageBaseUrl }: { id: number; payPageBaseUrl: string }) =>
      customFetch<CreatePaySessionResponse>(`/api/invoices/${id}/pay-session`, {
        method: "POST",
        body: JSON.stringify({ payPageBaseUrl }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
    },
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

export interface CreateEstimateDepositLinkResponse {
  paymentLinkUrl: string;
  paymentLinkId: string;
  depositAmount: number;
  estimate: unknown;
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
