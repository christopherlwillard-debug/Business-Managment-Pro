import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PackageSearch, ExternalLink, CheckCircle2, AlertCircle, Info,
  ChevronDown, ChevronUp, Warehouse, ArrowRight, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusiness } from "@/contexts/BusinessContext";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import type {
  EquipmentSource,
  EquipmentSourceCategory,
  EquipmentCategory,
  EquipmentInventoryItem,
} from "./equipment/types";
import {
  CATEGORY_META,
  SOURCE_CATEGORY_META,
  EQUIPMENT_CATEGORIES,
} from "./equipment/types";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Category → relevant portal slugs ─────────────────────────────────────────
const CATEGORY_PORTAL_SLUGS: Partial<Record<EquipmentCategory, string[]>> = {
  earthmoving:     ["ironplanet", "govplanet", "rba", "purple_wave", "govdeals"],
  asphalt_sealing: ["ironplanet", "equipment_trader", "govdeals", "gsa_auctions"],
  hauling:         ["govdeals", "gsa_auctions", "govplanet", "municibid", "facebook_marketplace"],
  trailers:        ["govdeals", "purple_wave", "hibid", "facebook_marketplace", "craigslist"],
  compaction:      ["ironplanet", "rba", "govplanet", "equipment_trader"],
  attachments:     ["ironplanet", "hibid", "equipment_trader", "facebook_marketplace"],
  tools:           ["govdeals", "municibid", "hibid", "facebook_marketplace", "craigslist"],
};

// ── Business capability → equipment categories they likely need ───────────────
const BUSINESS_EQUIPMENT_NEEDS: Record<string, EquipmentCategory[]> = {
  general_contracting: ["earthmoving", "hauling", "trailers", "compaction", "attachments", "tools"],
  asphalt_sealing:     ["asphalt_sealing", "earthmoving", "hauling", "trailers", "compaction", "tools"],
};

// ── Source card ────────────────────────────────────────────────────────────────
function SourceCard({ source }: { source: EquipmentSource }) {
  const [expanded, setExpanded] = useState(false);
  const catMeta = SOURCE_CATEGORY_META[source.category as EquipmentSourceCategory] ?? SOURCE_CATEGORY_META.government_surplus;

  return (
    <div className="border border-border rounded-lg bg-card p-3 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm text-foreground truncate">{source.name}</span>
            {/* Automation badge — honest labeling */}
            {source.automatedDiscovery ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                <Zap className="w-2.5 h-2.5" />
                Automated
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                Manual Visit
              </span>
            )}
          </div>
          <span className={cn("inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border mt-1", catMeta.color)}>
            {catMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {source.baseUrl && (
            <a
              href={source.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Visit
            </a>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && source.notes && (
        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
          {source.notes}
        </p>
      )}
    </div>
  );
}

// ── Category × source quick-link grid ─────────────────────────────────────────
function CategorySourceLinks({
  category,
  sources,
}: {
  category: EquipmentCategory;
  sources:  EquipmentSource[];
}) {
  const meta     = CATEGORY_META[category];
  const slugs    = CATEGORY_PORTAL_SLUGS[category] ?? [];
  const relevant = sources.filter(s => slugs.includes(s.slug) && s.baseUrl);
  if (!relevant.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-base">{meta.emoji}</span>
        <span className="text-sm font-semibold text-foreground">{meta.label}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">— {meta.examples}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {relevant.map(source => (
          <a
            key={source.slug}
            href={source.baseUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors",
              source.category === "government_surplus"
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
            )}
          >
            <ExternalLink className="w-2.5 h-2.5" />
            {source.name}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Equipment gap insight panel ────────────────────────────────────────────────
function EquipmentGapsPanel({
  businesses,
  activeBusiness,
  inventory,
}: {
  businesses:     Array<{ type: string; name: string }>;
  activeBusiness: { type: string; name: string } | null;
  inventory:      EquipmentInventoryItem[];
}) {
  const ownedCategories = new Set(inventory.map(i => i.category as EquipmentCategory));

  // Determine which business types to show gaps for
  const relevantTypes = activeBusiness
    ? [activeBusiness.type]
    : businesses.map(b => b.type);

  const allNeeded = new Set<EquipmentCategory>(
    relevantTypes.flatMap(type => BUSINESS_EQUIPMENT_NEEDS[type] ?? [])
  );

  const gaps    = Array.from(allNeeded).filter(cat => !ownedCategories.has(cat));
  const covered = Array.from(allNeeded).filter(cat =>  ownedCategories.has(cat));

  if (!allNeeded.size) return null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          Equipment Profile Insight
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Based on your business{businesses.length > 1 ? "es" : ""}, here's how your current inventory compares to what you typically need:
        </p>

        {gaps.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-amber-700">⚡ Equipment gaps to consider:</p>
            <div className="flex flex-wrap gap-1.5">
              {gaps.map(cat => (
                <span key={cat} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
                  {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}
                </span>
              ))}
            </div>
          </div>
        )}

        {covered.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-green-700">✅ Categories you have covered:</p>
            <div className="flex flex-wrap gap-1.5">
              {covered.map(cat => (
                <span key={cat} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-800">
                  {CATEGORY_META[cat].emoji} {CATEGORY_META[cat].label}
                </span>
              ))}
            </div>
          </div>
        )}

        {inventory.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Add equipment to My Equipment to see what you have vs. what you're missing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FindEquipment() {
  const { businesses, activeBusiness } = useBusiness();
  const [, navigate]                   = useLocation();
  const [sourceView, setSourceView]    = useState<"all" | EquipmentSourceCategory>("all");

  const { data: sources = [] } = useQuery<EquipmentSource[]>({
    queryKey: ["equipment-sources"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/equipment/sources`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<EquipmentSource[]>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: inventory = [] } = useQuery<EquipmentInventoryItem[]>({
    queryKey: ["equipment-inventory"],
    queryFn: async () => {
      const res = await fetch(`${base}/api/equipment/inventory`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json() as Promise<EquipmentInventoryItem[]>;
    },
  });

  // Source grouping
  const sourcesByCategory = sources.reduce<Record<string, EquipmentSource[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  const filteredSources = sourceView === "all"
    ? sources
    : (sourcesByCategory[sourceView] ?? []);

  const CATEGORY_ORDER: EquipmentSourceCategory[] = [
    "government_surplus",
    "commercial_auction",
    "marketplace",
  ];

  // Which equipment categories to show for quick links
  const relevantCategories: EquipmentCategory[] = activeBusiness
    ? (BUSINESS_EQUIPMENT_NEEDS[activeBusiness.type] ?? EQUIPMENT_CATEGORIES.slice())
    : EQUIPMENT_CATEGORIES.slice();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <PackageSearch className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Find Equipment &amp; Assets</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Government surplus, heavy equipment auctions, and commercial marketplaces — all in one place.
          Track opportunities, mark decisions, and connect equipment purchases to the work you're bidding on.
        </p>
      </div>

      {/* ── Equipment gap insight ── */}
      <EquipmentGapsPanel
        businesses={businesses}
        activeBusiness={activeBusiness}
        inventory={inventory}
      />

      {/* ── My Equipment shortcut ── */}
      <div
        className="flex items-center justify-between p-3 rounded-lg border border-dashed border-border bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
        onClick={() => navigate("/equipment/inventory")}
        role="button"
      >
        <div className="flex items-center gap-2.5">
          <Warehouse className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              My Equipment
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {inventory.length === 0
                  ? "Nothing logged yet"
                  : `${inventory.length} item${inventory.length === 1 ? "" : "s"} in your profile`}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Track what you own so the system can identify gaps and unused capacity
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>

      {/* ── Source catalog ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Where to Look</h2>

          {/* Automation legend */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                <Zap className="w-2.5 h-2.5" />
                Automated
              </span>
              = BuildPro finds listings automatically
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                Manual Visit
              </span>
              = you browse the site yourself
            </span>
          </div>
        </div>

        {/* Source category filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {([
            { value: "all",                label: `All Sources (${sources.length})` },
            { value: "government_surplus", label: `Gov Surplus (${(sourcesByCategory.government_surplus ?? []).length})` },
            { value: "commercial_auction", label: `Commercial Auction (${(sourcesByCategory.commercial_auction ?? []).length})` },
            { value: "marketplace",        label: `Marketplace (${(sourcesByCategory.marketplace ?? []).length})` },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSourceView(value as typeof sourceView)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border whitespace-nowrap",
                sourceView === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Source grid — grouped by category when showing all */}
        {sourceView === "all" ? (
          <div className="space-y-5">
            {CATEGORY_ORDER.filter(cat => sourcesByCategory[cat]?.length).map(cat => {
              const catMeta = SOURCE_CATEGORY_META[cat];
              const catSources = sourcesByCategory[cat] ?? [];
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded border", catMeta.color)}>
                      {catMeta.label}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{catMeta.description}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {catSources.map(source => (
                      <SourceCard key={source.slug} source={source} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredSources.map(source => (
              <SourceCard key={source.slug} source={source} />
            ))}
          </div>
        )}
      </div>

      {/* ── Quick links by equipment type ── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-foreground">Search by Equipment Type</h2>
        <p className="text-xs text-muted-foreground -mt-2">
          Shortcut links to relevant portals by what you're looking for.
          Government surplus sources are highlighted in blue.
        </p>
        <div className="space-y-4">
          {relevantCategories
            .filter(cat => CATEGORY_PORTAL_SLUGS[cat]?.length)
            .map(cat => (
              <CategorySourceLinks key={cat} category={cat} sources={sources} />
            ))}
        </div>
      </div>

      {/* ── Future opportunities placeholder ── */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
          <PackageSearch className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Live Listings — Coming Soon</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            When government surplus portals release public APIs or structured data feeds,
            BuildPro will automatically pull matching opportunities here — scored against your
            capabilities, inventory gaps, and active bid pipeline.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground border border-border px-2 py-1 rounded-md">BUY — Ready to acquire</span>
          <span className="text-xs text-muted-foreground border border-border px-2 py-1 rounded-md">BID NOW — Active auction</span>
          <span className="text-xs text-muted-foreground border border-border px-2 py-1 rounded-md">WATCH — Monitor price</span>
          <span className="text-xs text-muted-foreground border border-border px-2 py-1 rounded-md">PASS — Not interested</span>
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          In the meantime, use the portal links above to browse manually and add promising finds to your watchlist.
        </p>
      </div>

    </div>
  );
}
