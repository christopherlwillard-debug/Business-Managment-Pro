import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Import Layout & Pages
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Invoices from "./pages/Invoices";
import Expenses from "./pages/Expenses";
import Mileage from "./pages/Mileage";
import Estimates from "./pages/Estimates";
import Subcontractors from "./pages/Subcontractors";
import DailyLogs from "./pages/DailyLogs";
import Compliance from "./pages/Compliance";
import Clients from "./pages/Clients";
import Settings from "./pages/Settings";
import Accounting from "./pages/Accounting";
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

function Router() {
  return (
    <Switch>
      {/* Public portal route — no AppLayout */}
      <Route path="/portal/:token" component={SubcontractorPortal} />

      {/* All main app routes inside AppLayout */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/jobs" component={Jobs} />
            <Route path="/invoices" component={Invoices} />
            <Route path="/expenses" component={Expenses} />
            <Route path="/mileage" component={Mileage} />
            <Route path="/estimates" component={Estimates} />
            <Route path="/subcontractors" component={Subcontractors} />
            <Route path="/daily-logs" component={DailyLogs} />
            <Route path="/compliance" component={Compliance} />
            <Route path="/clients" component={Clients} />
            <Route path="/settings" component={Settings} />
            <Route path="/accounting" component={Accounting} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
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
