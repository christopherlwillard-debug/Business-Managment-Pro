import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, Briefcase, FileText, Receipt, Navigation, 
  Calculator, HardHat, ClipboardList, ShieldAlert, Users, 
  Settings, Menu, X, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetSettings } from "@workspace/api-client-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { data: settings, isLoading } = useGetSettings();
  const enabledFeatures = settings?.enabledFeatures || [
    "invoices", "expenses", "mileage", 
    "estimates", "subcontractors", "daily_logs", "compliance", "clients"
  ];

  const allNavItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, feature: null },
    { name: 'Jobs', href: '/jobs', icon: Briefcase, feature: 'jobs' },
    { name: 'Estimates', href: '/estimates', icon: Calculator, feature: 'estimates' },
    { name: 'Invoices', href: '/invoices', icon: FileText, feature: 'invoices' },
    { name: 'Expenses', href: '/expenses', icon: Receipt, feature: 'expenses' },
    { name: 'Daily Logs', href: '/daily-logs', icon: ClipboardList, feature: 'daily_logs' },
    { name: 'Mileage', href: '/mileage', icon: Navigation, feature: 'mileage' },
    { name: 'Subcontractors', href: '/subcontractors', icon: HardHat, feature: 'subcontractors' },
    { name: 'Clients', href: '/clients', icon: Users, feature: 'clients' },
    { name: 'Compliance', href: '/compliance', icon: ShieldAlert, feature: 'compliance' },
  ];

  const navigation = allNavItems.filter(item => 
    item.feature === null || enabledFeatures.includes(item.feature)
  );

  const pageTransition = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/80 lg:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-primary text-primary-foreground transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between h-16 px-6 bg-primary border-b border-primary-foreground/10">
          <Link href="/" className="flex items-center gap-2 text-xl font-display font-bold tracking-wider">
            <Building2 className="w-6 h-6 text-accent" />
            <span className="truncate">{settings?.companyName || 'BuildPro'}</span>
          </Link>
          <button className="lg:hidden text-primary-foreground/70 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="h-[calc(100vh-4rem)] overflow-y-auto py-4 px-3 flex flex-col justify-between">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
              return (
                <Link key={item.name} href={item.href} onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                    isActive 
                      ? "bg-accent/10 text-accent" 
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 mr-3 flex-shrink-0", isActive ? "text-accent" : "text-primary-foreground/50 group-hover:text-primary-foreground/80")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          
          <div className="mt-8 pt-4 border-t border-primary-foreground/10">
            <Link href="/settings" onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                location.startsWith('/settings')
                  ? "bg-accent/10 text-accent" 
                  : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white"
              )}
            >
              <Settings className={cn("w-5 h-5 mr-3 flex-shrink-0", location.startsWith('/settings') ? "text-accent" : "text-primary-foreground/50")} />
              Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex-shrink-0 h-16 bg-card border-b border-border flex items-center px-4 sm:px-6 lg:px-8 justify-between shadow-sm z-10">
          <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="flex-1 flex justify-end items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {settings?.companyName?.charAt(0) || 'BP'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 relative">
          <AnimatePresence mode="wait">
            <motion.div key={location} {...pageTransition} className="max-w-7xl mx-auto h-full">
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
