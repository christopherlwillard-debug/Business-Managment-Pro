import { useState } from "react";
import {
  ChevronDown, ChevronUp, Zap, Link2, CheckCircle2,
  AlertCircle, Clock, ExternalLink, Database,
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
  sources:    BidSourceConnection[];
  onUpdate:   (slug: string, patch: { enabled?: boolean; portalUrl?: string; portalLabel?: string }) => void;
  isUpdating: boolean;
}

export default function SourceManagementPanel({
  sources, onUpdate, isUpdating,
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
  );
}
