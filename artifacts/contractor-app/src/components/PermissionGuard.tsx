import { useUserPermissions, type SectionKey } from "@/contexts/UserPermissions";
import { Lock } from "lucide-react";

interface PermissionGuardProps {
  section?: SectionKey;
  anySectionOf?: SectionKey[];
  ownerOnly?: boolean;
  children: React.ReactNode;
}

export function PermissionGuard({ section, anySectionOf, ownerOnly, children }: PermissionGuardProps) {
  const { canView, isOwner, accessStatus } = useUserPermissions();

  if (accessStatus === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const blocked =
    (ownerOnly && !isOwner) ||
    (section !== undefined && !isOwner && !canView(section)) ||
    (anySectionOf !== undefined && !isOwner && !anySectionOf.some(s => canView(s)));

  if (blocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {ownerOnly
              ? "Only the account owner can access this section."
              : "You don't have permission to view this section."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Contact the account owner to request access.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
