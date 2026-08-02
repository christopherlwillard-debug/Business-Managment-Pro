import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Briefcase, Receipt, Navigation,
  UsersRound,
  Settings, Menu, X, BookOpen, LogOut, Package, Route, Wrench, Crosshair, CreditCard, FileText, FilePen, Landmark, ScrollText,
  Sun, Moon, Building2, ChevronDown, Globe, Home,
  type LucideIcon,
} from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useUserPermissions, type SectionKey } from "@/contexts/UserPermissions";
import { useNavigationBlocker } from "@/contexts/NavigationBlockerContext";

const BOTTOM_NAV_MAP: Record<string, { name: string; icon: LucideIcon }> = {
  "/jobs": { name: "Jobs", icon: Briefcase },
  "/expenses": { name: "Expenses", icon: Receipt },
  "/mileage": { name: "Mileage", icon: Navigation },
  "/people": { name: "People", icon: UsersRound },
  "/materials": { name: "Materials", icon: Package },
  "/route-planner": { name: "Route Planner", icon: Route },
  "/assets": { name: "Assets", icon: Wrench },
  "/aerial-quote": { name: "Aerial Quote", icon: Crosshair },
  "/accounting": { name: "Accounting & Tax", icon: BookOpen },
  "/square-transactions": { name: "Square Transactions", icon: CreditCard },
  "/settings": { name: "Settings", icon: Settings },
};

const DEFAULT_BOTTOM_NAV_HREFS = ["/route-planner", "/people", "/accounting"];

const BIZ_BADGE: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  general_contracting: { dot: "bg-blue-500",    text: "text-blue-700",    bg: "bg-blue-50 hover:bg-blue-100",       border: "border-blue-200"    },
  asphalt_sealing:     { dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50 hover:bg-amber-100",     border: "border-amber-200"   },
  real_estate:         { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 hover:bg-emerald-100", border: "border-emerald-200" },
};
const DEFAULT_BIZ_BADGE = { dot: "bg-muted-foreground/50", text: "text-muted-foreground", bg: "bg-muted/60 hover:bg-muted", border: "border-border" };

const DEFAULT_FEATURES = ["invoices", "expenses", "mileage", "estimates", "subcontractors", "compliance", "clients"];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isStudioMode = location.startsWith("/website");
  const { guardNavigate } = useNavigationBlocker();
  const { isDark, toggle: toggleTheme } = useTheme();

  const { logout } = useAuth();
  const { canView, isOwner, companyName: ctxCompanyName, logoUrl: ctxLogoUrl } = useUserPermissions();
  const { data: settings } = useGetSettings();

  const { activeBusiness, hasSelection, businesses, clearSelection } = useBusiness();

  const globalFeatures: string[] = (settings?.enabledFeatures as string[] | undefined) ?? DEFAULT_FEATURES;

  let effectiveFeatures: string[];
  if (!hasSelection) {
    effectiveFeatures = globalFeatures;
  } else if (activeBusiness) {
    effectiveFeatures = activeBusiness.enabledFeatures ?? globalFeatures;
  } else {
    if (businesses.length === 0) {
      effectiveFeatures = globalFeatures;
    } else {
      const allSets = businesses.map(b => b.enabledFeatures ?? globalFeatures);
      effectiveFeatures = [...new Set(allSets.flat())];
    }
  }

  const bizBadge = activeBusiness
    ? (BIZ_BADGE[activeBusiness.type] ?? DEFAULT_BIZ_BADGE)
    : DEFAULT_BIZ_BADGE;

  interface NavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    /** Single feature key that must be enabled (AND). null = always shown. */
    feature: string | null;
    /** Any one of these feature keys must be enabled (OR). Evaluated after `feature`. */
    anyFeatures?: string[];
    section: SectionKey | null;
    altSection?: SectionKey;
    ownerOnly?: boolean;
    group?: "operations" | "business_tools" | "finance";
  }

  const allNavItems: NavItem[] = [
    { name: "Dashboard",            href: "/",                     icon: LayoutDashboard, feature: null,           section: null,       ownerOnly: true  },
    { name: "Jobs",                  href: "/jobs",                 icon: Briefcase,       feature: "jobs",         section: "jobs",     group: "operations" },
    { name: "Expenses",              href: "/expenses",             icon: Receipt,         feature: "expenses",     section: "expenses", group: "operations" },
    { name: "Mileage",               href: "/mileage",              icon: Navigation,      feature: "mileage",      section: "mileage",  group: "operations" },
    { name: "People",                href: "/people",               icon: UsersRound,      feature: null,           anyFeatures: ["clients", "subcontractors"], section: "clients", altSection: "subcontractors", ownerOnly: false, group: "operations" },
    { name: "Materials",             href: "/materials",            icon: Package,         feature: null,           section: null,       ownerOnly: true,  group: "business_tools" },
    { name: "Route Planner",         href: "/route-planner",        icon: Route,           feature: null,           section: null,       ownerOnly: true,  group: "business_tools" },
    { name: "Assets",                href: "/assets",               icon: Wrench,          feature: null,           section: null,       ownerOnly: true,  group: "business_tools" },
    { name: "Aerial Quote",          href: "/aerial-quote",         icon: Crosshair,       feature: null,           section: null,       ownerOnly: true,  group: "business_tools" },
    { name: "Website",               href: "/website",              icon: Globe,           feature: null,           section: null,       ownerOnly: true,  group: "business_tools" },
    { name: "Home Knowledge Base",   href: "/mfh-homes",            icon: Home,            feature: null,           section: null,       ownerOnly: true,  group: "business_tools" },
    { name: "Estimates",             href: "/estimates",            icon: FilePen,         feature: "estimates",    section: null,       ownerOnly: true,  group: "finance" },
    { name: "Invoices",              href: "/invoices",             icon: FileText,        feature: "invoices",     section: null,       ownerOnly: true,  group: "finance" },
    { name: "Square Transactions",   href: "/square-transactions",  icon: CreditCard,      feature: null,           section: null,       ownerOnly: true,  group: "finance" },
    { name: "Banking",               href: "/banking",              icon: Landmark,        feature: null,           section: null,       ownerOnly: true,  group: "finance" },
    { name: "Bid Opportunities",     href: "/bids",                 icon: ScrollText,      feature: null,           section: null,       ownerOnly: true,  group: "finance" },
    { name: "Accounting & Tax",      href: "/accounting",           icon: BookOpen,        feature: "invoices",     section: "invoices", group: "finance" },
    { name: "Settings",              href: "/settings",             icon: Settings,        feature: null,           section: null,       ownerOnly: true  },
  ];

  const navigation = allNavItems.filter((item) => {
    if (item.ownerOnly && !isOwner) return false;
    if (!isOwner) {
      if (item.feature === null && item.section === null && !item.ownerOnly) return true;
      const hasSectionAccess =
        (item.section !== null && canView(item.section)) ||
        (item.altSection !== undefined && canView(item.altSection));
      if (!hasSectionAccess) return false;
      return item.section !== null || item.altSection !== undefined;
    }
    // Owner feature-based filtering
    if (item.feature !== null && !effectiveFeatures.includes(item.feature)) return false;
    if (item.anyFeatures && item.anyFeatures.length > 0) {
      if (!item.anyFeatures.some(f => effectiveFeatures.includes(f))) return false;
    }
    return true;
  });

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: activeBidCount = 0 } = useQuery<number>({
    queryKey: ["bids-active-count"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/bids`, { credentials: "include" });
      if (!res.ok) return 0;
      const data = await res.json() as Array<{ status: string }>;
      return data.filter((b) => b.status !== "dismissed").length;
    },
    staleTime: 60_000,
    enabled: isOwner,
  });

  const companyName = (isOwner ? settings?.companyName : ctxCompanyName) || ctxCompanyName || "BuildPro";
  const logoUrl = (isOwner ? settings?.logoUrl : ctxLogoUrl) ?? ctxLogoUrl ?? null;
  const initials = companyName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const [logoImgError, setLogoImgError] = useState(false);
  const logoUrlRef = useRef(logoUrl);
  if (logoUrlRef.current !== logoUrl) {
    logoUrlRef.current = logoUrl;
    if (logoImgError) setLogoImgError(false);
  }

  interface BottomNavItem {
    name: string;
    href: string;
    icon: LucideIcon;
    action?: () => void;
    section: SectionKey | null;
  }

  let bottomNavItems: BottomNavItem[];

  if (isOwner) {
    // Fixed bottom nav for owners: Home · Jobs · Routes · Accounting · More
    bottomNavItems = [
      { name: "Home",       href: "/",             icon: LayoutDashboard, section: null },
      { name: "Jobs",       href: "/jobs",          icon: Briefcase,       section: null },
      { name: "Routes",     href: "/route-planner", icon: Route,           section: null },
      { name: "Accounting", href: "/accounting",    icon: BookOpen,        section: null },
      { name: "More",       href: "#",              icon: Menu, action: () => setMobileMenuOpen(true), section: null },
    ];
  } else {
    const nonOwnerItems: BottomNavItem[] = [
      { name: "Home", href: "/", icon: LayoutDashboard, section: null },
      { name: "Jobs", href: "/jobs", icon: Briefcase, section: "jobs" },
      { name: "People", href: "/people", icon: UsersRound, section: "clients" },
      { name: "Mileage", href: "/mileage", icon: Navigation, section: "mileage" },
      { name: "Expenses", href: "/expenses", icon: Receipt, section: "expenses" },
      { name: "More", href: "#", icon: Menu, action: () => setMobileMenuOpen(true), section: null },
    ];
    bottomNavItems = nonOwnerItems.filter((item) => {
      if (item.section !== null && !canView(item.section)) return false;
      return true;
    });
  }

  const GROUP_LABELS: Record<string, string> = {
    operations: "Operations",
    business_tools: "Business Tools",
    finance: "Finance",
  };

  function renderNavItems(items: NavItem[]) {
    const result: React.ReactNode[] = [];
    let lastGroup: string | undefined = undefined;

    for (const item of items) {
      const currentGroup = item.group;
      if (currentGroup && currentGroup !== lastGroup) {
        result.push(
          <div key={`divider-${currentGroup}`} className={cn("mt-3 mb-1 px-3", isStudioMode && "lg:hidden")}>
            <p className="text-[10px] font-bold tracking-widest uppercase text-primary-foreground/30 select-none">
              {GROUP_LABELS[currentGroup]}
            </p>
          </div>
        );
      } else if (!currentGroup && lastGroup) {
        result.push(<div key="divider-bottom" className={cn("my-2 border-t border-primary-foreground/10", isStudioMode && "lg:hidden")} />);
      }
      lastGroup = currentGroup;

      const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
      const isBids = item.href === "/bids";
      const dest = item.href;
      result.push(
        <Link
          key={item.name}
          href={item.href}
          onClick={(e) => {
            e.preventDefault();
            guardNavigate(() => {
              setMobileMenuOpen(false);
              setLocation(dest);
            });
          }}
          className={cn(
            "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
            isActive
              ? "bg-accent/10 text-accent"
              : "text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white",
            isStudioMode && "lg:justify-center lg:px-0"
          )}
          title={isStudioMode ? item.name : undefined}
        >
          <item.icon className={cn(
            "w-5 h-5 flex-shrink-0",
            isStudioMode ? "lg:mx-auto" : "mr-3",
            isActive ? "text-accent" : "text-primary-foreground/50 group-hover:text-primary-foreground/80"
          )} />
          <span className={cn("flex-1", isStudioMode && "lg:hidden")}>{item.name}</span>
          {isBids && activeBidCount > 0 && (
            <span className={cn(
              "ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
              isActive
                ? "bg-accent/30 text-accent"
                : "bg-primary-foreground/20 text-primary-foreground/80"
            )}>
              {activeBidCount}
            </span>
          )}
        </Link>
      );
    }

    return result;
  }

  function openBusinessSwitcher() {
    guardNavigate(() => {
      clearSelection();
      setLocation("/");
      setMobileMenuOpen(false);
    });
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile sidebar backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/80 lg:hidden backdrop-blur-sm transition-opacity duration-200 ${mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar — desktop always visible, mobile slides in */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 bg-primary text-primary-foreground transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col",
        // Desktop width: collapse to icon rail in Studio mode
        isStudioMode ? "w-64 lg:w-14" : "w-64",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className={cn(
          "flex items-center h-16 bg-primary border-b border-primary-foreground/10 flex-shrink-0",
          isStudioMode ? "lg:justify-center px-4 lg:px-0" : "justify-between px-4"
        )}>
          <Link href="/" className="flex items-center" onClick={(e) => { e.preventDefault(); guardNavigate(() => { setMobileMenuOpen(false); setLocation("/"); }); }}>
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

        {/* Business switcher / context badge — only shown for owners; hidden in Studio mode */}
        {isOwner && (
          <div className={cn("px-3 py-2 border-b border-primary-foreground/10", isStudioMode && "lg:hidden")}>
            <button
              onClick={openBusinessSwitcher}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-white transition-colors"
            >
              {activeBusiness ? (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${BIZ_BADGE[activeBusiness.type]?.dot ?? DEFAULT_BIZ_BADGE.dot}`} />
              ) : (
                <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-primary-foreground/50" />
              )}
              <span className="truncate flex-1 text-left">{activeBusiness?.name ?? "All Businesses"}</span>
              <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" />
            </button>
          </div>
        )}

        {/* Nav items — scrollable, grouped with dividers */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <nav className="space-y-0.5">
            {renderNavItems(navigation)}
          </nav>
        </div>

        {/* Bottom sidebar actions */}
        <div className={cn(
          "flex-shrink-0 pb-4 border-t border-primary-foreground/10 pt-3 space-y-0.5",
          isStudioMode ? "lg:px-1 px-3" : "px-3"
        )}>
          <button
            onClick={toggleTheme}
            className={cn(
              "w-full flex items-center py-2.5 rounded-lg text-sm font-medium text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white transition-colors group",
              isStudioMode ? "lg:justify-center lg:px-0 px-3" : "px-3"
            )}
            aria-label="Toggle dark mode"
            title={isStudioMode ? (isDark ? "Light mode" : "Dark mode") : undefined}
          >
            {isDark ? (
              <Sun className={cn("w-5 h-5 flex-shrink-0 text-primary-foreground/50 group-hover:text-primary-foreground/80", isStudioMode ? "lg:mx-auto" : "mr-3")} />
            ) : (
              <Moon className={cn("w-5 h-5 flex-shrink-0 text-primary-foreground/50 group-hover:text-primary-foreground/80", isStudioMode ? "lg:mx-auto" : "mr-3")} />
            )}
            <span className={cn(isStudioMode && "lg:hidden")}>{isDark ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            onClick={logout}
            className={cn(
              "w-full flex items-center py-2.5 rounded-lg text-sm font-medium text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-white transition-colors group",
              isStudioMode ? "lg:justify-center lg:px-0 px-3" : "px-3"
            )}
            title={isStudioMode ? "Log out" : undefined}
          >
            <LogOut className={cn("w-5 h-5 flex-shrink-0 text-primary-foreground/50 group-hover:text-primary-foreground/80", isStudioMode ? "lg:mx-auto" : "mr-3")} />
            <span className={cn(isStudioMode && "lg:hidden")}>Log out</span>
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

          {/* Mobile: business context badge (shown when a business is selected) */}
          {isOwner && hasSelection ? (
            <button
              onClick={openBusinessSwitcher}
              className={cn(
                "lg:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                bizBadge.bg, bizBadge.text, bizBadge.border
              )}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bizBadge.dot}`} />
              <span className="max-w-[120px] truncate">{activeBusiness?.name ?? "All Businesses"}</span>
            </button>
          ) : (
            /* Mobile: show logo mark centered when no business context badge */
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
          )}

          {/* Desktop: business context badge */}
          {isOwner && hasSelection ? (
            <button
              onClick={openBusinessSwitcher}
              className={cn(
                "hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors",
                bizBadge.bg, bizBadge.text, bizBadge.border
              )}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${bizBadge.dot}`} />
              {activeBusiness?.name ?? "All Businesses"}
            </button>
          ) : (
            <div className="flex-1 hidden lg:block" />
          )}

          <Link href="/settings" className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm hover:bg-primary/20 transition-colors" title="Settings" onClick={(e) => { e.preventDefault(); guardNavigate(() => setLocation("/settings")); }}>
            {initials}
          </Link>
        </header>

        {/* Page content — add bottom padding on mobile for the bottom nav */}
        {location === "/aerial-quote" || location.startsWith("/website") ? (
          <main className="flex-1 overflow-hidden bg-background relative flex flex-col">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 relative">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        )}
      </div>

      {/* Mobile bottom navigation bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch shadow-lg">
        {bottomNavItems.map((item) => {
          const isActive = item.href !== "#" && (location === item.href || (item.href !== "/" && location.startsWith(item.href)));

          if (item.action) {
            return (
              <button
                key={item.name}
                type="button"
                onClick={item.action}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold tracking-wide transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.name}
              </button>
            );
          }

          const dest = item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                guardNavigate(() => setLocation(dest));
              }}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold tracking-wide transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
