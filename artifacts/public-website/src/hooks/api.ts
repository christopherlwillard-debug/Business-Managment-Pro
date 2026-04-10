import { useQuery, useMutation } from "@tanstack/react-query";

interface Service {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  priceDisplay: string | null;
  priceNote: string | null;
  whatsIncluded: string[] | null;
  addOns: string[] | null;
}

export function useServices() {
  return useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/public/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
  });
}

interface PortfolioItem {
  id: string;
  url: string;
  caption: string | null;
  category: string | null;
}

export function usePortfolio() {
  return useQuery<PortfolioItem[]>({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/public/portfolio");
      if (!res.ok) throw new Error("Failed to fetch portfolio");
      return res.json();
    },
  });
}

interface ContactData {
  name: string;
  phone?: string;
  email?: string;
  service?: string;
  message: string;
  bestTime?: string;
}

interface FeaturedClient {
  id: number;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  sortOrder: number | null;
  active: boolean;
}

export function useFeaturedClients() {
  return useQuery<FeaturedClient[]>({
    queryKey: ["featured-clients"],
    queryFn: async () => {
      const res = await fetch("/api/public/featured-clients");
      if (!res.ok) throw new Error("Failed to fetch featured clients");
      return res.json();
    },
  });
}

export function useContact() {
  return useMutation({
    mutationFn: async (data: ContactData) => {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
  });
}
