import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "../custom-fetch";

export interface ClientProfile {
  client: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    notes: string | null;
    nextServiceDate: string | null;
    serviceIntervalMonths: number | null;
    businessLine: string | null;
    businessId?: number | null;
    squareCustomerId: string | null;
    createdAt: string;
  };
  jobs: Array<{
    id: number;
    title: string;
    status: string;
    address: string | null;
    scheduledDate: string | null;
    createdAt: string;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
    issueDate: string | null;
    dueDate: string | null;
    createdAt: string;
  }>;
  squarePayments: Array<{
    id: number;
    squarePaymentId: string;
    amountCents: number;
    description: string | null;
    invoiceNumber: string | null;
    paidAt: string;
  }>;
  linkedProspects: Array<{
    id: number;
    address: string;
    contactName: string | null;
    status: string;
    roughQuote: string | null;
    servicedAt: string | null;
    createdAt: string;
  }>;
  routeStops: Array<{
    id: number;
    title: string | null;
    address: string;
    scheduledDate: string | null;
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
  otherIncome: Array<{
    id: number;
    date: string;
    description: string;
    amount: string;
    paymentMethod: string;
    source: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  summary: {
    totalJobs: number;
    totalInvoices: number;
    paidInvoices: number;
    totalRevenueCents: number;
    squareRevenueCents: number;
    otherRevenueCents: number;
    paidInvoicesTotal: number;
    upcomingStops: number;
  };
}

export function useClientProfile(id: number | null, businessId?: number | null) {
  const query = businessId != null ? `?businessId=${encodeURIComponent(String(businessId))}` : "";
  return useQuery({
    queryKey: ["/api/clients", id, "profile", businessId ?? null],
    queryFn: () => customFetch<ClientProfile>(`/api/clients/${id}/profile${query}`, { method: "GET" }),
    enabled: id !== null && id > 0,
    staleTime: 30_000,
  });
}

export function useUpdateClientServiceDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nextServiceDate, serviceIntervalMonths, sourceBusinessId, sourceBusinessLine }: {
      id: number;
      nextServiceDate: string | null;
      serviceIntervalMonths: number | null;
      sourceBusinessId?: number;
      sourceBusinessLine?: string;
    }) =>
      customFetch<unknown>(`/api/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextServiceDate, serviceIntervalMonths, sourceBusinessId, sourceBusinessLine }),
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      qc.invalidateQueries({ queryKey: ["/api/clients", id, "profile"] });
    },
  });
}
