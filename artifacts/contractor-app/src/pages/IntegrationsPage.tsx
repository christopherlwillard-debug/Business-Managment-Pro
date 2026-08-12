import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, KeyRound, AlertTriangle, Shield } from "lucide-react";
import IntegrationCard, { type IntegrationStatus } from "./integrations/IntegrationCard";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORY_ORDER = ["procurement", "financial", "fuel_maps", "ai", "communication"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  procurement:   "Government & Procurement",
  financial:     "Financial",
  fuel_maps:     "Fuel & Maps",
  ai:            "AI & Intelligence",
  communication: "Communication",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  procurement:   "APIs used for federal and local bid discovery, SAM.gov contract data, and procurement award intelligence.",
  financial:     "Banking connections and financial data sources. Credentials are platform-wide — separate Plaid items link individual bank accounts per business.",
  fuel_maps:     "Mapping, geocoding, and fuel price data used across Route Planner, mileage tracking, and vehicle expense calculations.",
  ai:            "AI inference services for bid analysis, summaries, and procurement education. Managed through Replit's AI proxy — no manual key needed.",
  communication: "Outbound notification channels for invoices, compliance reminders, and alerts.",
};

export default function IntegrationsPage() {
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading, error } = useQuery<IntegrationStatus[]>({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load integrations");
      return res.json();
    },
  });

  function handleUpdated() {
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
  }

  const grouped = CATEGORY_ORDER.reduce<Record<string, IntegrationStatus[]>>((acc, cat) => {
    acc[cat] = integrations.filter(i => i.category === cat);
    return acc;
  }, {} as Record<string, IntegrationStatus[]>);

  const totalConfigured = integrations.filter(i =>
    i.effectiveStatus === "active" || i.effectiveStatus === "env_only" || i.effectiveStatus === "managed"
  ).length;
  const totalIssues = integrations.filter(i =>
    i.effectiveStatus === "invalid"
  ).length;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground">Integrations & APIs</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Manage API credentials used by the platform. Keys are encrypted and stored securely — only a masked hint is displayed here. Replace any key at any time; the new key is tested before the old one is replaced.
          </p>
        </div>
        {!isLoading && (
          <div className="flex-shrink-0 text-right space-y-0.5">
            <div className="text-sm font-medium text-foreground">{totalConfigured} / {integrations.length} configured</div>
            {totalIssues > 0 && (
              <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3 h-3" />
                {totalIssues} with invalid key{totalIssues > 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Security notice ───────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30 text-xs text-muted-foreground">
        <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary/60" />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">Credential security</p>
          <p>Keys are stored AES-256-GCM encrypted in the database. Only the last 4 characters (hint) are ever shown in this interface. Full credentials are never logged, never returned from the API, and never sent to AI services. A new key is always tested against the real API before it replaces the existing one.</p>
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Failed to load integrations. Check that the API server is running.
        </div>
      )}

      {/* ── Integration groups ───────────────────────────────────────────────── */}
      {!isLoading && !error && CATEGORY_ORDER.map(category => {
        const items = grouped[category] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[category]}</h2>
              <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[category]}</p>
            </div>
            <div className="space-y-2">
              {items.map(integration => (
                <IntegrationCard
                  key={integration.slug}
                  integration={integration}
                  onUpdated={handleUpdated}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* ── Platform vs business note ────────────────────────────────────────── */}
      {!isLoading && !error && integrations.length > 0 && (
        <div className="text-xs text-muted-foreground border-t border-border pt-4 space-y-1">
          <p className="font-medium text-foreground">Platform vs. business credentials</p>
          <p>
            The integrations above are <strong>platform-wide</strong> — a single key covers all businesses in the account.
            Per-business connections (such as individual Plaid bank item links) are managed from the Banking page under each business.
          </p>
        </div>
      )}
    </div>
  );
}
