import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Briefcase, Receipt, Navigation,
  HardHat, Users,
  Settings, Menu, X, BookOpen, LogOut, Package, Images, Inbox, Globe, Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useUserPermissions, type SectionKey } from "@/contexts/UserPermissions";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { logout } = useAuth();
  const { canView, isOwner, companyName: ctxCompanyName, logoUrl: ctxLogoUrl } = useUserPermissions();
  const { data: settings } = useGetSettings();

  const enabledFeatures: string[] = settings?.enabledFeatures ?? [
    "invoices", "expenses", "mileage",
    "estimates", "subcontractors", "compliance", "clients",
  ];

  interface NavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    feature: string | null;
    section: SectionKey | null;
    ownerOnly?: boolean;
  }

  const allNavItems: NavItem[] = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, feature: null, section: null, ownerOnly: true },
    { name: "Jobs", href: "/jobs", icon: Briefcase, feature: "jobs", section: "jobs" },
    { name: "Expenses", href: "/expenses", icon: Receipt, feature: "expenses", section: "expenses" },
    { name: "Mileage", href: "/mileage", icon: Navigation, feature: "mileage", section: "mileage" },
    { name: "Subcontractors", href: "/subcontractors", icon: HardHat, feature: "subcontractors", section: "subcontractors" },
    { name: "Clients", href: "/clients", icon: Users, feature: "clients", section: "clients" },
    { name: "Materials", href: "/materials", icon: Package, feature: null, section: null, ownerOnly: true },
    { name: "Portfolio", href: "/portfolio", icon: Images, feature: null, section: null },
    { name: "Inquiries", href: "/inquiries", icon: Inbox, feature: null, section: null },
    { name: "Website Services", href: "/website-services", icon: Globe, feature: null, section: null },
    { name: "Services Guide", href: "/pricing-guide", icon: Tag, feature: null, section: null, ownerOnly: true },
    { name: "Accounting & Tax", href: "/accounting", icon: BookOpen, feature: null, section: "invoices" },
    { name: "Settings", href: "/settings", icon: Settings, feature: null, section: null, ownerOnly: true },
  ];

  const navigation = allNavItems.filter((item) => {
    if (item.ownerOnly && !isOwner) return false;
    if (!isOwner) {
      if (item.feature === null && item.section === null && !item.ownerOnly) return true;
      if (item.section !== null && !canView(item.section)) return false;
      return item.section !== null;
    }
    if (item.feature !== null && !enabledFeatures.includes(item.feature)) return false;
    return true;
  });

  const companyName = (isOwner ? settings?.companyName : ctxCompanyName) || ctxCompanyName || "BuildPro";
  const logoUrl = (isOwner ? settings?.logoUrl : ctxLogoUrl) ?? ctxLogoUrl ?? null;
  const initials = companyName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [logoImgError, setLogoImgError] = useState(false);
  // Reset error when logo URL changes (e.g. user uploads a new logo)
  const logoUrlRef = useRef(logoUrl);
  if (logoUrlRef.current !== logoUrl) {
    logoUrlRef.current = logoUrl;
    if (logoImgError) setLogoImgError(false);
  }

  const pageTransition = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.18 },
  };

  interface BottomNavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    action?: () => void;
    section: SectionKey | null;
  }

  const allBottomNavItems: BottomNavItem[] = [
    { name: "Home", href: "/", icon: LayoutDashboard, section: null },
    { name: "Jobs", href: "/jobs", icon: Briefcase, section: "jobs" },
    { name: "Clients", href: "/clients", icon: Users, section: "clients" },
    { name: "Mileage", href: "/mileage", icon: Navigation, section: "mileage" },
    { name: "Expenses", href: "/expenses", icon: Receipt, section: "expenses" },
    { name: "More", href: "#", icon: Menu, action: () => setMobileMenuOpen(true), section: null },
  ];

  const bottomNavItems = allBottomNavItems.filter((item) => {
    if (item.section !== null && !isOwner && !canView(item.section)) return false;
    return true;
  });

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

      {/* Sidebar — desktop always visible, mobile slides in */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-primary text-primary-foreground transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 bg-primary border-b border-primary-foreground/10 flex-shrink-0">
          <Link href="/" className="flex items-center" onClick={() => setMobileMenuOpen(false)}>
            {logoUrl && !logoImgError ? (
              <img
                src={`${base}${logoUrl}`}
                className="w-12 h-12 rounded-lg object-contain bg-white/10"
                alt="Logo"
                onError={() => setLogoImgError(true)}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-accent-foreground font-display font-bold text-xl select-none">
                {initials}
              </div>
            )}
          </Link>
          <button className="lg:hidden text-primary-foreground/70 hover:text-white p-1" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Nav items — scrollable, Settings always included */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 mr-3 flex-shrink-0",
                    isActive ? "text-accent" : "text-primary-foreground/50 group-hover:text-primary-foreground/80"
                  )} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Logout button at bottom of sidebar */}
        <div className="flex-shrink-0 px-3 pb-4 border-t border-primary-foreground/10 pt-3">
          <button
            onClick={logout}
            className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white transition-colors group"
          >
            <LogOut className="w-5 h-5 mr-3 flex-shrink-0 text-primary-foreground/50 group-hover:text-primary-foreground/80" />
            Log out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex-shrink-0 h-14 bg-card border-b border-border flex items-center px-4 sm:px-6 justify-between shadow-sm z-10">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Mobile: show logo mark centered */}
          <div className="lg:hidden absolute left-1/2 -translate-x-1/2">
            {logoUrl && !logoImgError ? (
              <img
                src={`${base}${logoUrl}`}
                className="w-8 h-8 rounded object-contain"
                alt="Logo"
                onError={() => setLogoImgError(true)}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-sm select-none">
                {initials}
              </div>
            )}
          </div>

          <div className="flex-1 hidden lg:block" />

          <Link href="/settings" className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm hover:bg-primary/20 transition-colors" title="Settings">
            {initials}
          </Link>
        </header>

        {/* Page content — add bottom padding on mobile for the bottom nav */}
        <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 relative">
          <AnimatePresence mode="wait">
            <motion.div key={location} {...pageTransition} className="max-w-7xl mx-auto">
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom navigation bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch shadow-lg">
        {bottomNavItems.map((item) => {
          const isActive = item.href !== "#" && (location === item.href || (item.href !== "/" && location.startsWith(item.href)));
          const Element = item.action ? "button" : Link;

          return (
            <Element
              key={item.name}
              {...(item.action ? { onClick: item.action, type: "button" } : { href: item.href })}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold tracking-wide transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.name}
            </Element>
          );
        })}
      </nav>
    </div>
  );
}
