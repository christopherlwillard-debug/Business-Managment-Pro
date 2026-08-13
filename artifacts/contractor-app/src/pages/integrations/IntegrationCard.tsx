import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Eye, EyeOff,
  ExternalLink, RefreshCw, KeyRound, Trash2, ChevronDown, ChevronUp,
  Link2, User, Globe, Activity, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SyncHealth {
  connectionStatus:  string;
  lastSyncAt:        string | null;
  lastSyncSuccessAt: string | null;
  lastSyncError:     string | null;
  recordsImported:   number | null;
  siteHealth?:       Array<{ slug: string; site: string; success: boolean; count: number; error?: string }>;
}

export interface IntegrationStatus {
  slug:                string;
  name:                string;
  shortName:           string;
  description:         string;
  category:            string;
  scope:               string;
  credentialType:      string;
  credentialLabel:     string;
  credentialHelp:      string;
  docsUrl?:            string;
  defaultPortalUrl?:   string;
  renewalPeriodDays?:  number;
  managed?:            boolean;
  managedNote?:        string;
  fields?:             Array<{ key: string; label: string; placeholder?: string; sensitive?: boolean }>;
  autoSync?:           boolean;
  syncSchedule?:       string;
  bidSourceSlug?:      string;
  comingSoon?:         boolean;
  scopeNote?:          string;
  // DB fields (no encrypted values)
  keyHint:             string | null;
  usernameHint:        string | null;
  portalUrl:           string | null;
  status:              string;
  lastVerifiedAt:      string | null;
  lastVerifyError:     string | null;
  lastUsedAt:          string | null;
  expiresAt:           string | null;
  renewalReminderDaysOverride: number | null;
  notes:               string | null;
  // Derived
  envConfigured:       boolean;
  dbConfigured:        boolean;
  effectiveStatus:     string;
  // Sync health
  syncHealth:          SyncHealth | null;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

interface StatusConfig {
  dot:   string;
  badge: string;
  label: string;
}

function getStatusConfig(status: string): StatusConfig {
  switch (status) {
    case "managed":           return { dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",     label: "Managed"        };
    case "active":            return { dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800", label: "Connected"      };
    case "env_only":          return { dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",   label: "Connected" };
    case "invalid":           return { dot: "bg-red-500",     badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",             label: "Invalid"        };
    case "syncing":           return { dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800", label: "Auto-Syncing"   };
    case "sync_error":        return { dot: "bg-red-500",     badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",             label: "Sync Error"     };
    case "portal_saved":      return { dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800", label: "Portal Saved"   };
    case "portal_configured": return { dot: "bg-green-500",   badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800", label: "Configured"     };
    case "portal_only":       return { dot: "bg-slate-400",   badge: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700",  label: "Portal Link"    };
    case "not_configured":    return { dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border", label: "Not Configured" };
    case "unconfigured":      return { dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border", label: "Not Configured" };
    case "coming_soon":       return { dot: "bg-muted-foreground/20", badge: "bg-muted/50 text-muted-foreground border-border", label: "Coming Soon"  };
    default:                  return { dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border", label: status             };
  }
}

export default function IntegrationCard({ integration, onUpdated }: { integration: IntegrationStatus; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // API key / client_secret_pair state
  const [credential, setCredential] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [showPasswordReveal, setShowPasswordReveal] = useState(false);

  // Portal credential state
  const [portalUrl, setPortalUrl] = useState(integration.portalUrl ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);

  const isPortalType   = ["portal_only", "username_password"].includes(integration.credentialType);
  const isAutoSync     = integration.autoSync ?? false;
  const isManaged      = integration.managed  ?? false;
  const isComingSoon   = integration.comingSoon ?? false;

  const statusCfg    = getStatusConfig(integration.effectiveStatus);
  const renewalDays  = integration.renewalPeriodDays ?? 30;
  const expiryDays   = daysUntil(integration.expiresAt);
  const isExpiringSoon = expiryDays !== null && expiryDays <= renewalDays && expiryDays > 0;
  const isExpired      = expiryDays !== null && expiryDays <= 0;

  function invalidateQueries() {
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
    onUpdated();
  }

  // ── Test current API-key credential ─────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/test`, {
        method: "POST", credentials: "include",
      });
      return res.json() as Promise<{ ok: boolean; message?: string; error?: string }>;
    },
    onSuccess: () => invalidateQueries(),
  });

  // ── Update API key credential ────────────────────────────────────────────────
  const updateApiKeyMutation = useMutation({
    mutationFn: async () => {
      let body: Record<string, string>;
      if (integration.credentialType === "client_secret_pair") {
        body = fields;
      } else {
        body = { credential };
      }
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed");
      return data;
    },
    onSuccess: () => {
      setShowUpdateForm(false);
      setCredential("");
      setFields({});
      invalidateQueries();
    },
  });

  // ── Remove API key credential ────────────────────────────────────────────────
  const removeApiKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/credential`, {
        method: "DELETE", credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => invalidateQueries(),
  });

  // ── Save portal credentials ──────────────────────────────────────────────────
  const savePortalMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (portalUrl.trim()) body.portalUrl = portalUrl.trim();
      if (username.trim())  body.username  = username.trim();
      if (password.trim())  body.password  = password.trim();
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      return data;
    },
    onSuccess: () => {
      setShowUpdateForm(false);
      setUsername("");
      setPassword("");
      invalidateQueries();
    },
  });

  // ── Remove portal credentials ────────────────────────────────────────────────
  const removePortalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/portal`, {
        method: "DELETE", credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => invalidateQueries(),
  });

  const isSubmitting = updateApiKeyMutation.isPending || savePortalMutation.isPending;
  const isTesting    = testMutation.isPending;

  const borderClass = isExpired || integration.effectiveStatus === "invalid" || integration.effectiveStatus === "sync_error"
    ? "border-red-300 dark:border-red-800"
    : isExpiringSoon
    ? "border-yellow-300 dark:border-yellow-700"
    : "border-border";

  return (
    <div className={cn("bg-card border rounded-xl p-4 flex flex-col gap-3 transition-colors", borderClass)}>

      {/* ── Header row ────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <span className={cn("inline-block w-2.5 h-2.5 rounded-full", statusCfg.dot)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{integration.name}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", statusCfg.badge)}>
              {statusCfg.label}
            </span>
            {integration.scope === "business" && (
              <span className="text-xs px-1.5 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground">per-business</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{integration.description}</p>
        </div>
        <button
          onClick={() => setShowDetails(d => !d)}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
          title="Toggle details"
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Auto-sync health panel ─────────────────────────────────────────────── */}
      {isAutoSync && integration.syncHealth && (
        <div className="ml-5 space-y-1.5">
          {/* Main sync health row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              <span className="font-medium">
                {integration.syncHealth.connectionStatus === "active" ? "Syncing normally" : integration.syncHealth.connectionStatus === "error" ? "Sync failed" : "Not yet synced"}
              </span>
            </div>
            {integration.syncHealth.lastSyncSuccessAt && (
              <span>Last success: {relativeTime(integration.syncHealth.lastSyncSuccessAt)}</span>
            )}
            {integration.syncHealth.recordsImported != null && (
              <span>{integration.syncHealth.recordsImported.toLocaleString()} records</span>
            )}
            {integration.syncSchedule && (
              <span className="text-muted-foreground/60">{integration.syncSchedule}</span>
            )}
          </div>
          {/* Sync error */}
          {integration.syncHealth.lastSyncError && (
            <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span className="line-clamp-2">{integration.syncHealth.lastSyncError}</span>
            </div>
          )}
          {/* Per-site breakdown for KY/IN multi-site */}
          {integration.syncHealth.siteHealth && integration.syncHealth.siteHealth.length > 0 && showDetails && (
            <div className="space-y-0.5 pl-4 border-l border-border">
              {integration.syncHealth.siteHealth.map(site => (
                <div key={site.slug} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", site.success ? "bg-green-500" : "bg-red-400")} />
                  <span className="font-medium">{site.site}</span>
                  {site.success ? (
                    <span className="text-muted-foreground/60">{site.count} records</span>
                  ) : (
                    <span className="text-red-600/80 dark:text-red-400/80 truncate">{site.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {isAutoSync && !integration.syncHealth && (
        <div className="ml-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>No sync data yet — sync runs {integration.syncSchedule ?? "on schedule"}.</span>
        </div>
      )}

      {/* ── Renewal / expiry warnings ──────────────────────────────────────────── */}
      {(isExpired || isExpiringSoon) && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ml-5",
          isExpired
            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
            : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800"
        )}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {isExpired
            ? `This credential expired ${Math.abs(expiryDays!)} day(s) ago. Replace it to restore the integration.`
            : `Renewal due in ${expiryDays} day(s). Update before expiry to avoid service interruption.`
          }
        </div>
      )}

      {/* ── SAM.gov annual renewal reminder ───────────────────────────────────── */}
      {integration.slug === "sam_gov" && !integration.expiresAt && integration.effectiveStatus !== "unconfigured" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground border border-border bg-muted/30 ml-5">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          SAM.gov system account keys expire annually. Update the key before it expires to avoid losing federal bid discovery.
        </div>
      )}

      {/* ── Portal URL display (for portal types with a saved URL) ───────────── */}
      {isPortalType && integration.portalUrl && !showUpdateForm && (
        <div className="ml-5 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <a
            href={integration.portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate flex-1"
          >
            {integration.portalUrl}
          </a>
          <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        </div>
      )}

      {/* ── Portal credential hints (for username_password type) ─────────────── */}
      {integration.credentialType === "username_password" && !showUpdateForm && (
        <div className="ml-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {integration.usernameHint && (
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3" />
              <span className="font-mono">{integration.usernameHint}</span>
            </div>
          )}
          {integration.keyHint && (
            <div className="flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" />
              <span className="font-mono">{integration.keyHint}</span>
              <span className="text-muted-foreground/60">(password stored)</span>
            </div>
          )}
        </div>
      )}

      {/* ── Details row ────────────────────────────────────────────────────────── */}
      {showDetails && (
        <div className="text-xs text-muted-foreground space-y-1.5 pl-5 border-l-2 border-muted">
          {/* API key hint */}
          {!isPortalType && integration.keyHint && (
            <div className="flex items-center gap-2">
              <KeyRound className="w-3 h-3 flex-shrink-0" />
              <span className="font-mono">{integration.keyHint.replace(/./g, "•").slice(0, -4) + integration.keyHint.slice(-4)}</span>
              {integration.dbConfigured && <span className="text-muted-foreground/60">(stored in app)</span>}
            </div>
          )}
          {integration.effectiveStatus === "env_only" && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
              Connected via environment variable.
            </div>
          )}
          {integration.lastVerifiedAt && !isPortalType && !isAutoSync && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-green-500" />
              Last verified {relativeTime(integration.lastVerifiedAt)}
            </div>
          )}
          {integration.lastVerifyError && !isAutoSync && (
            <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
              <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {integration.lastVerifyError}
            </div>
          )}
          {integration.managed && integration.managedNote && (
            <div className="text-blue-600 dark:text-blue-400">{integration.managedNote}</div>
          )}
          {integration.scopeNote && (
            <div className="text-muted-foreground/70">{integration.scopeNote}</div>
          )}
          {integration.docsUrl && (
            <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              {isPortalType ? "Visit portal" : "Get API key / docs"}
            </a>
          )}
          {integration.syncSchedule && !isAutoSync && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Sync schedule: {integration.syncSchedule}
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────────────── */}
      {!isManaged && !isComingSoon && !isAutoSync && (
        <div className="flex flex-wrap gap-2 pl-5">
          {/* Test current (API-key types only) */}
          {!isPortalType && (
            <button
              onClick={() => testMutation.mutate()}
              disabled={isTesting || ["unconfigured", "not_configured"].includes(integration.effectiveStatus)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Test Connection
            </button>
          )}

          {/* Open portal (portal types with a URL) */}
          {isPortalType && (integration.portalUrl || integration.defaultPortalUrl) && (
            <a
              href={integration.portalUrl ?? integration.defaultPortalUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Open Portal
            </a>
          )}

          {/* Add/Update button */}
          <button
            onClick={() => {
              setShowUpdateForm(f => !f);
              updateApiKeyMutation.reset();
              savePortalMutation.reset();
              if (!showUpdateForm) {
                setPortalUrl(integration.portalUrl ?? "");
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              showUpdateForm
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {isPortalType ? <Link2 className="w-3 h-3" /> : <KeyRound className="w-3 h-3" />}
            {showUpdateForm ? "Cancel" : isPortalType
              ? (integration.effectiveStatus === "portal_only" || integration.effectiveStatus === "not_configured" ? "Save Portal" : "Update Portal")
              : (integration.effectiveStatus === "unconfigured" ? "Add Key" : "Update Key")
            }
          </button>

          {/* Remove */}
          {(integration.dbConfigured || (isPortalType && integration.portalUrl)) && !showUpdateForm && (
            <button
              onClick={() => {
                if (!confirm(`Remove stored credentials for ${integration.shortName}?`)) return;
                if (isPortalType) removePortalMutation.mutate();
                else removeApiKeyMutation.mutate();
              }}
              disabled={removeApiKeyMutation.isPending || removePortalMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-red-600 dark:text-red-400 hover:border-red-300 dark:hover:border-red-700 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          )}
        </div>
      )}

      {/* ── Test result ─────────────────────────────────────────────────────────── */}
      {testMutation.isSuccess && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ml-5",
          testMutation.data?.ok
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
        )}>
          {testMutation.data?.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {testMutation.data?.ok ? "Connection successful." : (testMutation.data?.error ?? "Test failed.")}
        </div>
      )}

      {/* ── Inline update form — API key / client_secret_pair ─────────────────── */}
      {showUpdateForm && !isPortalType && (
        <form onSubmit={e => { e.preventDefault(); updateApiKeyMutation.mutate(); }}
              className="space-y-3 pl-5 pt-1 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">{integration.credentialHelp}</p>

          {integration.credentialType === "client_secret_pair" && integration.fields ? (
            <div className="space-y-2">
              {integration.fields.map(field => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-medium text-foreground">{field.label}</label>
                  <div className="relative">
                    <input
                      type={field.sensitive && !showSecrets[field.key] ? "password" : "text"}
                      placeholder={field.placeholder}
                      value={fields[field.key] ?? ""}
                      onChange={e => setFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                      autoComplete="off" spellCheck={false}
                      className="w-full px-3 py-2 pr-9 text-xs font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {field.sensitive && (
                      <button type="button"
                        onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showSecrets[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative">
              <input
                type={showPasswordReveal ? "text" : "password"}
                placeholder={`New ${integration.credentialLabel}`}
                value={credential}
                onChange={e => setCredential(e.target.value)}
                autoComplete="off" spellCheck={false}
                className="w-full px-3 py-2 pr-9 text-xs font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button type="button" onClick={() => setShowPasswordReveal(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPasswordReveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              {isSubmitting ? "Testing & Saving…" : "Test & Save"}
            </button>
            <span className="text-xs text-muted-foreground">Key is tested first — existing credential unchanged if test fails.</span>
          </div>

          {updateApiKeyMutation.isError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {(updateApiKeyMutation.error as Error).message}
            </div>
          )}
        </form>
      )}

      {/* ── Inline update form — portal (portal_only or username_password) ──────── */}
      {showUpdateForm && isPortalType && (
        <form onSubmit={e => { e.preventDefault(); savePortalMutation.mutate(); }}
              className="space-y-3 pl-5 pt-1 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">{integration.credentialHelp}</p>

          {/* Portal URL */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Portal URL</label>
            <input
              type="url"
              placeholder={integration.defaultPortalUrl ?? "https://..."}
              value={portalUrl}
              onChange={e => setPortalUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Username + Password (only for username_password type) */}
          {integration.credentialType === "username_password" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Username / Email
                  {integration.usernameHint && (
                    <span className="ml-2 font-normal text-muted-foreground font-mono">
                      (current: {integration.usernameHint})
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="username or email"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="off"
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Password
                  {integration.keyHint && (
                    <span className="ml-2 font-normal text-muted-foreground font-mono">
                      (current: {integration.keyHint})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPortalPassword ? "text" : "password"}
                    placeholder="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="off"
                    className="w-full px-3 py-2 pr-9 text-xs font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={() => setShowPortalPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPortalPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              {isSubmitting ? "Saving…" : "Save Portal"}
            </button>
            <span className="text-xs text-muted-foreground">Credentials stored encrypted — only hints are displayed.</span>
          </div>

          {savePortalMutation.isError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {(savePortalMutation.error as Error).message}
            </div>
          )}
          {savePortalMutation.isSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              Portal credentials saved.
            </div>
          )}
        </form>
      )}

      {/* ── Coming soon badge ────────────────────────────────────────────────────── */}
      {isComingSoon && (
        <div className="ml-5 text-xs text-muted-foreground italic">
          Integration planned for a future release.
        </div>
      )}
    </div>
  );
}
