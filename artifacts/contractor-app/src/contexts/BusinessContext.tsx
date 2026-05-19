import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface Business {
  id: number;
  name: string;
  slug: string;
  type: string;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  taxId: string | null;
  createdAt: string;
}

interface BusinessContextValue {
  businesses: Business[];
  activeBusiness: Business | null;
  setActiveBusiness: (b: Business | null) => void;
  isLoading: boolean;
  refresh: () => void;
}

const BusinessContext = createContext<BusinessContextValue>({
  businesses: [],
  activeBusiness: null,
  setActiveBusiness: () => {},
  isLoading: true,
  refresh: () => {},
});

const STORAGE_KEY = "buildpro_active_business_id";

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusinessState] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/businesses`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Business[]) => {
        setBusinesses(data);
        const savedId = localStorage.getItem(STORAGE_KEY);
        if (savedId) {
          const saved = data.find(b => b.id === parseInt(savedId, 10));
          if (saved) setActiveBusinessState(saved);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [tick]);

  function setActiveBusiness(b: Business | null) {
    setActiveBusinessState(b);
    if (b) {
      localStorage.setItem(STORAGE_KEY, String(b.id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const refresh = () => setTick(t => t + 1);

  return (
    <BusinessContext.Provider value={{ businesses, activeBusiness, setActiveBusiness, isLoading, refresh }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
