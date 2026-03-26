import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";

// Import Layout & Pages
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
import Invoices from "./pages/Invoices";
import SubcontractorPortal from "./pages/SubcontractorPortal";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AdminApp() {
  const { isLoading, isAuthenticated, login } = useAuth();

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

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/jobs" component={Jobs} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/mileage" component={Mileage} />
        <Route path="/estimates" component={Estimates} />
        <Route path="/subcontractors" component={Subcontractors} />
        <Route path="/clients" component={Clients} />
        <Route path="/settings" component={Settings} />
        <Route path="/accounting" component={Accounting} />
        <Route path="/invoices" component={Invoices} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public portal route — no auth required */}
      <Route path="/portal/:token" component={SubcontractorPortal} />

      {/* All main app routes require login */}
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
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
