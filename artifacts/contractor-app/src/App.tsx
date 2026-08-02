import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { isBuildProMode } from "@/lib/runtimeMode";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { UserPermissionsProvider, useUserPermissions, type SectionKey } from "@/contexts/UserPermissions";
import { GoogleAuthProvider } from "@/contexts/GoogleAuth";
import { PermissionGuard } from "./components/PermissionGuard";
import { BusinessProvider, useBusiness } from "@/contexts/BusinessContext";
import { NavigationBlockerProvider } from "@/contexts/NavigationBlockerContext";

import { AppLayout } from "./components/AppLayout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Mileage = lazy(() => import("./pages/Mileage"));
const Clients = lazy(() => import("./pages/Clients"));
const Settings = lazy(() => import("./pages/Settings"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Estimates = lazy(() => import("./pages/Estimates"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Materials = lazy(() => import("./pages/Materials"));
const RoutePlanner = lazy(() => import("./pages/RoutePlanner"));
const Prospects = lazy(() => import("./pages/Prospects"));
const PeopleAndProperties = lazy(() => import("./pages/PeopleAndProperties"));
const Assets = lazy(() => import("./pages/Assets"));
const SubcontractorPortal = lazy(() => import("./pages/SubcontractorPortal"));
const SubLogin = lazy(() => import("./pages/SubLogin"));
const AerialQuote = lazy(() => import("./pages/AerialQuote"));
const Pay = lazy(() => import("./pages/Pay"));
const QuickCharge = lazy(() => import("./pages/QuickCharge"));
const SquareTransactions = lazy(() => import("./pages/SquareTransactions"));
const Banking = lazy(() => import("./pages/Banking"));
const BidOpportunities = lazy(() => import("./pages/BidOpportunities"));
const BusinessSelector = lazy(() => import("./pages/BusinessSelector"));
const NotFound = lazy(() => import("./pages/not-found"));
const WebsiteEditor = lazy(() => import("./pages/website/WebsiteEditor"));
const PublicSite = lazy(() => import("./pages/website/PublicSite"));
const AdminErrorLog = lazy(() => import("./pages/AdminErrorLog"));
const ChecklistTemplates = lazy(() => import("./pages/ChecklistTemplates"));
const JobStatusPage = lazy(() => import("./pages/JobStatusPage"));
const MfhKnowledgeBase = lazy(() => import("./pages/MfhKnowledgeBase"));
const TripPacket = lazy(() => import("./pages/TripPacket"));
const JobPayroll = lazy(() => import("./pages/JobPayroll"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
  { section: "expenses", href: "/expenses" },
  { section: "mileage", href: "/mileage" },
  { section: "clients", href: "/clients" },
  { section: "subcontractors", href: "/subcontractors" },
  { section: "invoices", href: "/accounting" },
];

function LegacyRedirect({ to, hash }: { to: string; hash: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    window.location.hash = hash;
    setLocation(to, { replace: true });
  }, []);
  return null;
}

function TabRedirect({ tab }: { tab: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(`/people?tab=${tab}`, { replace: true });
  }, []);
  return null;
}

function HomeRoute() {
  const { isOwner, permissions } = useUserPermissions();
  const { activeBusiness, hasSelection, isLoading: bizLoading } = useBusiness();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isOwner && permissions) {
      const first = SECTION_ROUTES.find(r => permissions[r.section]?.view);
      if (first) setLocation(first.href);
    }
  }, [isOwner, permissions, setLocation]);

  if (isOwner && bizLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isOwner && !hasSelection) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
        <BusinessSelector onSelect={() => {}} />
      </Suspense>
    );
  }

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
    <NavigationBlockerProvider>
    <BusinessProvider>
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
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
          <Route path="/subcontractors">
            <PermissionGuard section="subcontractors"><TabRedirect tab="subcontractors" /></PermissionGuard>
          </Route>
          <Route path="/clients">
            <TabRedirect tab="clients" />
          </Route>
          <Route path="/people">
            <PermissionGuard anySectionOf={["clients", "subcontractors"]}><PeopleAndProperties /></PermissionGuard>
          </Route>
          <Route path="/settings">
            <PermissionGuard ownerOnly><Settings /></PermissionGuard>
          </Route>
          <Route path="/accounting">
            <PermissionGuard section="invoices"><Accounting /></PermissionGuard>
          </Route>
          <Route path="/estimates">
            <PermissionGuard ownerOnly><Estimates /></PermissionGuard>
          </Route>
          <Route path="/invoices">
            <PermissionGuard ownerOnly><Invoices /></PermissionGuard>
          </Route>
          <Route path="/materials">
            <PermissionGuard ownerOnly><Materials /></PermissionGuard>
          </Route>
          <Route path="/route-planner">
            <PermissionGuard ownerOnly><RoutePlanner /></PermissionGuard>
          </Route>
          <Route path="/prospects">
            <TabRedirect tab="prospects" />
          </Route>
          <Route path="/assets">
            <PermissionGuard ownerOnly><Assets /></PermissionGuard>
          </Route>
          <Route path="/aerial-quote">
            <PermissionGuard ownerOnly><AerialQuote /></PermissionGuard>
          </Route>
          <Route path="/quick-charge">
            <PermissionGuard ownerOnly><QuickCharge /></PermissionGuard>
          </Route>
          <Route path="/square-transactions">
            <PermissionGuard ownerOnly><SquareTransactions /></PermissionGuard>
          </Route>
          <Route path="/banking">
            <PermissionGuard ownerOnly><Banking /></PermissionGuard>
          </Route>
          <Route path="/bids">
            <PermissionGuard ownerOnly><BidOpportunities /></PermissionGuard>
          </Route>
          <Route path="/address-book">
            <PermissionGuard ownerOnly><TabRedirect tab="contacts" /></PermissionGuard>
          </Route>
          <Route path="/website">
            <PermissionGuard ownerOnly><WebsiteEditor /></PermissionGuard>
          </Route>
          <Route path="/admin/errors">
            <PermissionGuard ownerOnly><AdminErrorLog /></PermissionGuard>
          </Route>
          <Route path="/checklist-templates">
            <PermissionGuard ownerOnly><ChecklistTemplates /></PermissionGuard>
          </Route>
          <Route path="/mfh-homes">
            <PermissionGuard ownerOnly><MfhKnowledgeBase /></PermissionGuard>
          </Route>
          <Route path="/trip-packet/:jobId">
            <PermissionGuard section="jobs"><TripPacket /></PermissionGuard>
          </Route>
          <Route path="/jobs/:id/payroll">
            <PermissionGuard ownerOnly><JobPayroll /></PermissionGuard>
          </Route>
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
    </BusinessProvider>
    </NavigationBlockerProvider>
  );
}

function Router() {
  const onCustomDomain = !isBuildProMode();
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <Switch>
        <Route path="/portal/:token" component={SubcontractorPortal} />
        <Route path="/sub-login" component={SubLogin} />
        <Route path="/status/:token" component={JobStatusPage} />
        <Route path="/pay/:payToken" component={Pay} />
        <Route path="/site/:slug/:page" component={PublicSite} />
        <Route path="/site/:slug" component={PublicSite} />
        <Route>
          {onCustomDomain ? <PublicSite /> : <AdminApp />}
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <GoogleAuthProvider>
            <UserPermissionsProvider>
              <Router />
            </UserPermissionsProvider>
          </GoogleAuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
