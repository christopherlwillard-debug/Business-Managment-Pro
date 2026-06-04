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
  sortOrder: number;
  enabledFeatures: string[] | null;
  parentBusinessId: number | null;
  createdAt: string;
}

interface BusinessContextValue {
  businesses: Business[];
  activeBusiness: Business | null;
  hasSelection: boolean;
  setActiveBusiness: (b: Business | null) => void;
  clearSelection: () => void;
  isLoading: boolean;
  refresh: () => void;
}

const BusinessContext = createContext<BusinessContextValue>({
  businesses: [],
  activeBusiness: null,
  hasSelection: false,
  setActiveBusiness: () => {},
  clearSelection: () => {},
  isLoading: true,
  refresh: () => {},
});

const STORAGE_KEY_MODE = "buildpro_selection_mode";

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusinessState] = useState<Business | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/businesses`, { credentials: "include" })
      .then(res => (res.ok ? res.json() : []))
      .then((data: Business[]) => {
        setBusinesses(data);
        const savedMode = localStorage.getItem(STORAGE_KEY_MODE) ?? "unset";
        if (savedMode === "unset") {
          setHasSelection(false);
          setActiveBusinessState(null);
        } else if (savedMode === "all") {
          setHasSelection(true);
          setActiveBusinessState(null);
        } else {
          const id = parseInt(savedMode, 10);
          const saved = !isNaN(id) ? data.find(b => b.id === id) ?? null : null;
          setHasSelection(true);
          setActiveBusinessState(saved);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [tick]);

  function setActiveBusiness(b: Business | null) {
    setActiveBusinessState(b);
    setHasSelection(true);
    if (b) {
      localStorage.setItem(STORAGE_KEY_MODE, String(b.id));
    } else {
      localStorage.setItem(STORAGE_KEY_MODE, "all");
    }
  }

  function clearSelection() {
    setActiveBusinessState(null);
    setHasSelection(false);
    localStorage.setItem(STORAGE_KEY_MODE, "unset");
  }

  const refresh = () => setTick(t => t + 1);

  return (
    <BusinessContext.Provider value={{ businesses, activeBusiness, hasSelection, setActiveBusiness, clearSelection, isLoading, refresh }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
