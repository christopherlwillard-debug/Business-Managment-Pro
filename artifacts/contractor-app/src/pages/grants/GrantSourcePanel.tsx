import { useState } from "react";
import {
  ChevronDown, ChevronUp, Zap, Link2, AlertCircle,
  Clock, Database, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrantSourceConnection } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, disabled }: {
  enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
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

function AutoSourceRow({ source, onToggle, disabled }: {
  source: GrantSourceConnection;
  onToggle: (enabled: boolean) => void;
  disabled: boolean;
}) {
  const isActive = source.connectionStatus === "active";
  const isError  = source.connectionStatus === "error";
  const isNew    = source.connectionStatus === "not_configured";
  const [errExpanded, setErrExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 py-3 px-4">
      <div className="flex items-center gap-2">
        {/* Status dot */}
        <span className={cn(
          "flex-shrink-0 w-2 h-2 rounded-full",
          isActive ? "bg-emerald-500" : isError ? "bg-red-500" : "bg-muted-foreground/30"
        )} />

        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{source.name}</span>

        {/* Auto-synced badge */}
        <span className="hidden sm:inline-flex items-center gap-1 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          <Zap className="w-3 h-3" />
          Auto-synced
        </span>

        <ToggleSwitch enabled={source.enabled} onChange={onToggle} disabled={disabled} />
      </div>

      {/* Health info */}
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
                {source.recordsImported} grants imported
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
        {isNew && (
          <span className="text-muted-foreground/60">
            {source.enabled ? "Will sync on next refresh" : "Disabled — skip on next sync"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Manual source row ─────────────────────────────────────────────────────────

function ManualSourceRow({ source }: { source: GrantSourceConnection }) {
  const hasUrl = !!(source.websiteUrl?.trim());

  return (
    <div className="flex flex-col gap-1.5 py-3 px-4">
      <div className="flex items-center gap-2">
        {/* Always gray dot for manual */}
        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-muted-foreground/25" />
        <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{source.name}</span>

        {/* Manual badge */}
        <span className="hidden sm:inline-flex items-center gap-1 flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          <Link2 className="w-3 h-3" />
          Manual
        </span>

        {/* Direct link */}
        {hasUrl && (
          <a
            href={source.websiteUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        )}
      </div>

      {source.notes && (
        <p className="ml-4 text-xs text-muted-foreground/60 leading-snug">{source.notes}</p>
      )}
    </div>
  );
}

// ── Category grouping ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  general:      "Federal Sources",
  small_business: "Small Business",
  veteran:      "Veteran Programs",
  state_local:  "State & Local (KY)",
  workforce:    "Workforce",
  rural:        "Rural Development",
  economic_dev: "Economic Development",
};

const CATEGORY_ORDER = ["general", "small_business", "veteran", "state_local", "workforce", "rural", "economic_dev"];

// ── Main panel ────────────────────────────────────────────────────────────────

interface GrantSourcePanelProps {
  sources:    GrantSourceConnection[];
  onUpdate:   (slug: string, patch: { enabled?: boolean }) => void;
  isUpdating: boolean;
}

export default function GrantSourcePanel({ sources, onUpdate, isUpdating }: GrantSourcePanelProps) {
  const [open, setOpen] = useState(false);

  if (sources.length === 0) return null;

  const activeCount  = sources.filter(s => s.connectionStatus === "active").length;
  const errorCount   = sources.filter(s => s.connectionStatus === "error").length;
  const automatedCount = sources.filter(s => s.automatedDiscovery).length;

  const summaryParts: string[] = [];
  if (activeCount > 0)  summaryParts.push(`${activeCount} active`);
  if (errorCount > 0)   summaryParts.push(`${errorCount} with errors`);
  if (summaryParts.length === 0) summaryParts.push(`${automatedCount} automated + ${sources.length - automatedCount} manual`);

  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, rows: sources.filter(s => s.category === cat) }))
    .filter(g => g.rows.length > 0);

  // Any categories not in CATEGORY_ORDER go at the end
  const knownCats = new Set(CATEGORY_ORDER);
  const otherRows = sources.filter(s => !knownCats.has(s.category));

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
          <span className="font-semibold text-foreground">Grant Sources</span>
          <span className="text-xs text-muted-foreground">{summaryParts.join(" · ")}</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-border">
          {grouped.map(({ cat, rows }) => (
            <div key={cat}>
              <div className="px-4 py-2 bg-muted/20 border-b border-border/50">
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/70">
                  {CATEGORY_LABELS[cat] ?? cat}
                </p>
              </div>
              <div className="divide-y divide-border/40">
                {rows.map(src => src.automatedDiscovery ? (
                  <AutoSourceRow
                    key={src.slug}
                    source={src}
                    onToggle={(enabled) => onUpdate(src.slug, { enabled })}
                    disabled={isUpdating}
                  />
                ) : (
                  <ManualSourceRow key={src.slug} source={src} />
                ))}
              </div>
            </div>
          ))}

          {/* Uncategorized sources */}
          {otherRows.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-muted/20 border-b border-border/50">
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/70">Other</p>
              </div>
              <div className="divide-y divide-border/40">
                {otherRows.map(src => src.automatedDiscovery ? (
                  <AutoSourceRow
                    key={src.slug}
                    source={src}
                    onToggle={(enabled) => onUpdate(src.slug, { enabled })}
                    disabled={isUpdating}
                  />
                ) : (
                  <ManualSourceRow key={src.slug} source={src} />
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 bg-muted/10 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Automated sources sync when you click Refresh. Manual sources are direct links — visit them to find opportunities not available via API.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
