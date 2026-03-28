import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type SectionKey =
  | "expenses"
  | "jobs"
  | "invoices"
  | "clients"
  | "mileage"
  | "subcontractors"
  | "daily_logs"
  | "estimates"
  | "compliance";

export type SectionPermission = { view: boolean; edit: boolean };
export type Permissions = Record<SectionKey, SectionPermission>;

export type AccessStatus = "owner" | "admin" | "pending" | "rejected" | "loading";

interface UserPermissionsState {
  accessStatus: AccessStatus;
  isOwner: boolean;
  permissions: Permissions | null;
  canView: (section: SectionKey) => boolean;
  canEdit: (section: SectionKey) => boolean;
  refresh: () => void;
}

const defaultPermissions: UserPermissionsState = {
  accessStatus: "loading",
  isOwner: false,
  permissions: null,
  canView: () => false,
  canEdit: () => false,
  refresh: () => {},
};

const UserPermissionsContext = createContext<UserPermissionsState>(defaultPermissions);

export function UserPermissionsProvider({ children }: { children: ReactNode }) {
  const [accessStatus, setAccessStatus] = useState<AccessStatus>("loading");
  const [isOwner, setIsOwner] = useState(false);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/auth/me`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          setAccessStatus("pending");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setIsOwner(data.isOwner ?? false);
        setAccessStatus(data.accessStatus ?? "pending");
        setPermissions(data.permissions ?? null);
      })
      .catch(() => {
        setAccessStatus("pending");
      });
  }, [tick]);

  const refresh = () => setTick((t) => t + 1);

  const canView = (section: SectionKey): boolean => {
    if (isOwner) return true;
    return permissions?.[section]?.view ?? false;
  };

  const canEdit = (section: SectionKey): boolean => {
    if (isOwner) return true;
    return permissions?.[section]?.edit ?? false;
  };

  return (
    <UserPermissionsContext.Provider value={{ accessStatus, isOwner, permissions, canView, canEdit, refresh }}>
      {children}
    </UserPermissionsContext.Provider>
  );
}

export function useUserPermissions() {
  return useContext(UserPermissionsContext);
}
