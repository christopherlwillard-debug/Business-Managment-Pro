import { useState } from "react";
import {
  ChevronDown, ChevronUp, Zap, Link2, CheckCircle2,
  AlertCircle, Clock, ExternalLink, Database, Building2,
  Users, ShoppingCart, ClipboardCheck, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidSourceConnection, SourceCategory } from "./types";

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_ORDER: SourceCategory[] = [
  "jobs_contracts", "auctions_surplus", "hauling_material", "both",
];

const CATEGORY_LABELS: Record<SourceCategory, string> = {
  jobs_contracts:   "Jobs & Contracts",
  auctions_surplus: "Auctions & Surplus",
  hauling_material: "Hauling & Material",
  both:             "Multiple Categories",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms  = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

// ── Small toggle switch ───────────────────────────────────────────────────────

function ToggleSwitch({
  enabled, onChange, disabled,
}: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        enabled ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn(
        "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
        enabled ? "translate-x-4" : "translate-x-0.5",
      )} />
    </button>
  );
}

// ── Automated source row ──────────────────────────────────────────────────────

function AutoSourceRow({
  source, onToggle, disabled,
}: {
  source: BidSourceConnection;
  onToggle: (enabled: boolean) => void;
  disabled: boolean;
}) {
  const isActive  = source.connectionStatus === "active";
  const isError   = source.connectionStatus === "error";
  const isNew     = source.connectionStatus === "not_configured";
  const [errExpanded, setErrExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 py-3 px-4">
      <div className="flex items-center gap-2">
        {/* Status dot */}
        <span className={cn(
          "flex-shrink-0 w-2 h-2 rounded-full",
          isActive ? "bg-emerald-500"
          : isError ? "bg-red-500"
          : "bg-muted-foreground/30"
        )} />

        {/* Name */}
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
          {source.name}
        </span>

        {/* Auto-synced badge */}
        <span className="hidden sm:inline-flex items-center gap-1 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          <Zap className="w-3 h-3" />
          Auto-synced
        </span>

        {/* Toggle */}
        <ToggleSwitch enabled={source.enabled} onChange={onToggle} disabled={disabled} />
      </div>

      {/* Health info line */}
      {(isActive || isError || !isNew) && (
        <div className="ml-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {isActive && (
            <>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {relativeTime(source.lastSyncSuccessAt)}
              </span>
              {source.recordsImported != null && source.recordsImported > 0 && (
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  {source.recordsImported} records
                </span>
              )}
            </>
          )}
          {isError && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <button
                type="button"
                className="text-left hover:underline"
                onClick={() => setErrExpanded(v => !v)}
              >
                {errExpanded
                  ? source.lastSyncError
                  : (source.lastSyncError ?? "Sync error").slice(0, 60) + ((source.lastSyncError?.length ?? 0) > 60 ? "…" : "")}
              </button>
            </span>
          )}
          {isNew && !source.enabled && (
            <span className="text-muted-foreground/60">Disabled — skip on next sync</span>
          )}
          {isNew && source.enabled && (
            <span className="text-muted-foreground/60">Will sync on next refresh</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Portal source row ─────────────────────────────────────────────────────────

function PortalSourceRow({
  source, onToggle, onPortalSave, disabled,
}: {
  source: BidSourceConnection;
  onToggle: (enabled: boolean) => void;
  onPortalSave: (portalUrl: string, portalLabel: string) => void;
  disabled: boolean;
}) {
  const [urlInput,   setUrlInput]   = useState(source.portalUrl   ?? "");
  const [labelInput, setLabelInput] = useState(source.portalLabel ?? "");
  const [editing, setEditing] = useState(false);

  const hasUrl  = !!(source.portalUrl?.trim());
  const isDirty = urlInput !== (source.portalUrl ?? "") || labelInput !== (source.portalLabel ?? "");

  function handleSave() {
    onPortalSave(normalizeUrl(urlInput), labelInput.trim() || source.name);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") { setEditing(false); setUrlInput(source.portalUrl ?? ""); setLabelInput(source.portalLabel ?? ""); }
  }

  return (
    <div className="flex flex-col gap-1.5 py-3 px-4">
      <div className="flex items-center gap-2">
        {/* Status dot — always gray for portal-only */}
        <span className={cn(
          "flex-shrink-0 w-2 h-2 rounded-full",
          hasUrl && source.enabled ? "bg-sky-500" : "bg-muted-foreground/25"
        )} />

        {/* Name */}
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
          {source.name}
        </span>

        {/* Portal link badge */}
        <span className="hidden sm:inline-flex items-center gap-1 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          <Link2 className="w-3 h-3" />
          Portal link
        </span>

        {/* Open button — only if URL is set */}
        {hasUrl && (
          <a
            href={source.portalUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        )}

        {/* Toggle */}
        <ToggleSwitch enabled={source.enabled} onChange={onToggle} disabled={disabled} />
      </div>

      {/* URL area */}
      <div className="ml-4">
        {editing ? (
          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="https://bidnet.com/..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full max-w-xs px-2.5 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground/50"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={!urlInput.trim() || disabled}
                className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setUrlInput(source.portalUrl ?? ""); setLabelInput(source.portalLabel ?? ""); }}
                className="px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : hasUrl ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-xs">{source.portalUrl}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-primary hover:underline flex-shrink-0"
            >
              Edit URL
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground/70 hover:text-primary transition-colors"
          >
            + Set URL to track this source
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface SourceManagementPanelProps {
  sources:              BidSourceConnection[];
  onUpdate:             (slug: string, patch: { enabled?: boolean; portalUrl?: string; portalLabel?: string }) => void;
  isUpdating:           boolean;
  showPrivatePathways?: boolean;
}

// ── Private T&M / On-Call Pathways (static educational content) ───────────────

const PRIVATE_PATHWAYS = [
  {
    id: "prequalification",
    icon: ClipboardCheck,
    title: "ISN / Avetta / PEC Safe prequalification",
    description: "Plants and refineries use these platforms to pre-screen contractors before allowing them on site. Once approved, the plant contacts you for as-needed T&M work — no bidding required.",
    details: ["Register at ISNetworld.com, Avetta.com, or PECSafe.com (check which platform each plant uses).", "Upload: certificate of insurance, OSHA 300 log, written safety program, crew cert copies.", "Allow 2–4 weeks for review. Renewals are annual.", "Once on the approved list, you get phone calls for unplanned maintenance needs."],
    firstStep: "Search 'ISN Avetta PEC' + your target plant's name to find which platform they use, then register.",
    plants: "Refineries, chemical plants, automotive plants, utilities, food processing facilities.",
  },
  {
    id: "prime_sub",
    icon: Building2,
    title: "Prime-contractor sub portals",
    description: "Large industrial maintenance IDIQs (Indefinite Delivery contracts) are often won by primes like AECOM, Fluor, Day & Zimmermann, Jacobs, or Honeywell. They issue T&M task orders to subs.",
    details: ["Identify primes winning industrial maintenance work in your region via USASpending.gov (filter by NAICS 811310).", "Find the prime's supplier or small business portal on their website.", "Submit a 1-page capability statement: crew certs, OSHA record, equipment, past industrial work.", "Contact the prime's Small Business Liaison Officer (SBLO) by name if you can find them."],
    firstStep: "Go to USASpending.gov, filter awards by NAICS 811310 in your state, identify the top primes, then visit their supplier pages.",
    plants: "AECOM, Fluor, Day & Zimmermann, Jacobs, Honeywell FM&T, Bechtel, local MRO primes.",
  },
  {
    id: "direct_contact",
    icon: Users,
    title: "Direct plant / maintenance-manager contact",
    description: "Most on-call industrial relationships start with a direct conversation. The right contact is the maintenance manager or reliability engineer — not procurement.",
    details: ["Identify target plants (refineries, chemical plants, manufacturers) within your radius.", "Find the maintenance manager on LinkedIn or the plant's website.", "Call or email with a 3-sentence intro: who you are, what you do, one credential (e.g. 'We hold AWS D1.1 welder certs and a clean OSHA record').", "Ask specifically: 'Do you use outside contractors for on-call mechanical work? How do I get on your approved contractor list?'"],
    firstStep: "Make a list of 5 industrial facilities within 1 hour of your base. Find one contact name each. Send outreach emails this week.",
    plants: "Any industrial facility: refinery, chemical plant, food processing, power generation, wastewater treatment.",
  },
  {
    id: "purchasing_portal",
    icon: ShoppingCart,
    title: "Industrial purchasing portals (Ariba / Fieldglass / Coupa)",
    description: "Large manufacturers post maintenance task orders on procurement platforms. Registering as a supplier gives you access to a steady stream of work orders.",
    details: ["Register on SAP Ariba (ariba.com), SAP Fieldglass, Coupa, or Oracle iSupplier — check which platform your target customer uses.", "Set your NAICS codes (811310, 238190, 238290, 238910) precisely.", "Plants post maintenance task orders with scope, location, and estimated hours — respond with your T&M rate + crew qualifications.", "Keep your profile current: insurance certificates, safety metrics, certifications."],
    firstStep: "Register as an Ariba supplier at ariba.com/register. It's free and covers the largest share of industrial purchasing.",
    plants: "Major manufacturers (automotive, aerospace, chemical, energy) using SAP ERP systems.",
  },
  {
    id: "approved_contractor_list",
    icon: CheckCircle2,
    title: "Approved Contractor List (ACL) registration",
    description: "Plants maintain short lists of pre-vetted contractors for specific trades. Being on an ACL is the primary private-market path for a small industrial crew.",
    details: ["Call or email the plant's safety or maintenance department and ask: 'Do you maintain an approved contractor list for mechanical/industrial maintenance?'", "Request the application. Requirements typically include: insurance cert (minimum limits vary), written safety program, crew qualifications, EMR (Experience Modification Rate) below 1.0.", "Some plants post ACL applications on their website under 'Vendors' or 'Suppliers'.", "Once on the list, you receive calls for scheduled outages and unplanned breakdowns."],
    firstStep: "Call 3 industrial facilities near you and ask about their ACL process. The maintenance or safety department handles this.",
    plants: "Most industrial plants maintain ACLs. Look for refineries, chemical plants, paper mills, steel mills, power plants.",
  },
];

function PrivatePathwaysPanel() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mt-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Zap className="w-4 h-4 text-orange-500" />
          <span className="font-semibold text-foreground">Private T&M / On-Call Pathways</span>
          <span className="text-xs text-muted-foreground">5 proven paths for industrial crews</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Intro */}
          <div className="px-5 py-3 bg-orange-50/50 dark:bg-orange-900/10 border-b border-border/50">
            <p className="text-xs text-muted-foreground">
              Federal bids are only a fraction of industrial maintenance work. Most T&M and on-call contracts are awarded through these private-market paths — usually before a job is ever publicly posted.
            </p>
          </div>

          {/* Pathways */}
          <div className="divide-y divide-border/40">
            {PRIVATE_PATHWAYS.map((path) => {
              const PathIcon = path.icon;
              const isExpanded = expanded === path.id;
              return (
                <div key={path.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : path.id)}
                    className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors text-left"
                  >
                    <PathIcon className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{path.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{path.description}</p>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 space-y-3 bg-muted/10">
                      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 flex gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-semibold text-primary uppercase tracking-wide">First step</p>
                          <p className="text-xs text-foreground leading-snug">{path.firstStep}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What to do</p>
                        <ol className="space-y-1.5">
                          {path.details.map((d, i) => (
                            <li key={i} className="flex gap-2 text-xs text-foreground leading-snug">
                              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {i + 1}
                              </span>
                              {d}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">
                        <span className="font-medium">Common with:</span> {path.plants}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SourceManagementPanel({
  sources, onUpdate, isUpdating, showPrivatePathways,
}: SourceManagementPanelProps) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  // Header summary
  const activeCount  = sources.filter(s => s.connectionStatus === "active").length;
  const errorCount   = sources.filter(s => s.connectionStatus === "error").length;
  const enabledCount = sources.filter(s => s.enabled).length;

  const summaryParts: string[] = [];
  if (activeCount > 0)  summaryParts.push(`${activeCount} active`);
  if (errorCount > 0)   summaryParts.push(`${errorCount} with errors`);
  if (summaryParts.length === 0) summaryParts.push(`${enabledCount} enabled`);

  // Group by category, preserving order
  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, rows: sources.filter(s => s.category === cat) }))
    .filter(g => g.rows.length > 0);

  return (
    <>
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground">Bid Sources</span>
          <span className="text-xs text-muted-foreground">{summaryParts.join(" · ")}</span>
          {errorCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3" />
              {errorCount}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {/* Content */}
      {open && (
        <div className="border-t border-border divide-y divide-border/50">
          {grouped.map(({ cat, rows }) => (
            <div key={cat}>
              {/* Category section header */}
              <div className="px-4 pt-3 pb-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>

              {/* Source rows */}
              <div className="divide-y divide-border/30">
                {rows.map(src => (
                  src.automatedDiscovery ? (
                    <AutoSourceRow
                      key={src.slug}
                      source={src}
                      onToggle={(enabled) => onUpdate(src.slug, { enabled })}
                      disabled={isUpdating}
                    />
                  ) : (
                    <PortalSourceRow
                      key={src.slug}
                      source={src}
                      onToggle={(enabled) => onUpdate(src.slug, { enabled })}
                      onPortalSave={(portalUrl, portalLabel) => onUpdate(src.slug, { portalUrl, portalLabel })}
                      disabled={isUpdating}
                    />
                  )
                ))}
              </div>
            </div>
          ))}

          {/* Footer note */}
          <div className="px-5 py-3 bg-muted/20">
            <p className="text-xs text-muted-foreground/70">
              Automated sources sync on "Refresh Bids". Portal sources are bookmarks — visit them to find and apply to bids manually.
            </p>
          </div>
        </div>
      )}
    </div>
    {showPrivatePathways && <PrivatePathwaysPanel />}
    </>
  );
}
