import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { UserPermissionsProvider, useUserPermissions, type SectionKey } from "@/contexts/UserPermissions";
import { PermissionGuard } from "./components/PermissionGuard";

import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Expenses from "./pages/Expenses";
import Mileage from "./pages/Mileage";
import Estimates from "./pages/Estimates";
import Subcontractors from "./pages/Subcontractors";
import Clients from "./pages/Clients";
import Settings from "./pages/Settings";
import Accounting from "./pages/Accounting";
import Materials from "./pages/Materials";
import SubcontractorPortal from "./pages/SubcontractorPortal";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function AccessPendingScreen() {
  const { companyName: ctxCompany, userName, profileImageUrl } = useUserPermissions();
  const companyName = ctxCompany || "the company";
  const { logout } = useAuth();
  const initials = userName
    ? userName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-4 shadow-lg">
        {profileImageUrl ? (
          <img src={profileImageUrl} alt={userName ?? "User"} className="w-16 h-16 rounded-full mx-auto object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto text-amber-700 font-bold text-xl">
            {initials}
          </div>
        )}
        <h1 className="text-xl font-bold text-foreground">Access Requested</h1>
        {userName && <p className="text-sm text-muted-foreground">Signed in as <span className="font-medium text-foreground">{userName}</span></p>}
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your request to access <span className="font-semibold text-foreground">{companyName}</span> has been submitted.
          The owner will review and approve your access soon.
        </p>
        <p className="text-xs text-muted-foreground">Once approved, refresh this page to get started.</p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={logout}
            className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessRejectedScreen() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-4 shadow-lg">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your access request was not approved. Please contact the account owner if you believe this is a mistake.
        </p>
        <button
          onClick={logout}
          className="w-full px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

const SECTION_ROUTES: { section: SectionKey; href: string }[] = [
  { section: "jobs", href: "/jobs" },
  { section: "estimates", href: "/estimates" },
  { section: "expenses", href: "/expenses" },
  { section: "mileage", href: "/mileage" },
  { section: "clients", href: "/clients" },
  { section: "subcontractors", href: "/subcontractors" },
  { section: "invoices", href: "/accounting" },
];

function HomeRoute() {
  const { isOwner, permissions } = useUserPermissions();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isOwner && permissions) {
      const first = SECTION_ROUTES.find(r => permissions[r.section]?.view);
      if (first) setLocation(first.href);
    }
  }, [isOwner, permissions, setLocation]);

  if (isOwner) return <Dashboard />;

  if (permissions && !SECTION_ROUTES.some(r => permissions[r.section]?.view)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <p className="text-sm font-medium">No sections assigned</p>
        <p className="text-xs">Ask the owner to grant you access to at least one section.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Redirecting…
    </div>
  );
}

function AdminApp() {
  const { isLoading, isAuthenticated, login } = useAuth();
  const { accessStatus } = useUserPermissions();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">BuildPro</h1>
          <p className="text-muted-foreground">Sign in to access your business dashboard</p>
        </div>
        <button
          onClick={login}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Log in
        </button>
      </div>
    );
  }

  if (accessStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (accessStatus === "pending") return <AccessPendingScreen />;
  if (accessStatus === "rejected") return <AccessRejectedScreen />;

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/jobs">
          <PermissionGuard section="jobs"><Jobs /></PermissionGuard>
        </Route>
        <Route path="/expenses">
          <PermissionGuard section="expenses"><Expenses /></PermissionGuard>
        </Route>
        <Route path="/mileage">
          <PermissionGuard section="mileage"><Mileage /></PermissionGuard>
        </Route>
        <Route path="/estimates">
          <PermissionGuard section="estimates"><Estimates /></PermissionGuard>
        </Route>
        <Route path="/subcontractors">
          <PermissionGuard section="subcontractors"><Subcontractors /></PermissionGuard>
        </Route>
        <Route path="/clients">
          <PermissionGuard section="clients"><Clients /></PermissionGuard>
        </Route>
        <Route path="/settings">
          <PermissionGuard ownerOnly><Settings /></PermissionGuard>
        </Route>
        <Route path="/accounting">
          <PermissionGuard section="invoices"><Accounting /></PermissionGuard>
        </Route>
        <Route path="/materials">
          <PermissionGuard ownerOnly><Materials /></PermissionGuard>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/portal/:token" component={SubcontractorPortal} />
      <Route>
        <AdminApp />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <UserPermissionsProvider>
            <Router />
          </UserPermissionsProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
