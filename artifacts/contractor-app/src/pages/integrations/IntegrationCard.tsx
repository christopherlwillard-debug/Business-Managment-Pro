import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, Eye, EyeOff, ExternalLink, RefreshCw, KeyRound, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  renewalPeriodDays?:  number;
  managed?:            boolean;
  managedNote?:        string;
  fields?:             Array<{ key: string; label: string; placeholder?: string; sensitive?: boolean }>;
  // DB fields (no encrypted values)
  keyHint:             string | null;
  status:              string;
  lastVerifiedAt:      string | null;
  lastVerifyError:     string | null;
  lastUsedAt:          string | null;
  expiresAt:           string | null;
  renewalReminderDaysOverride: number | null;
  // Derived
  envConfigured:       boolean;
  dbConfigured:        boolean;
  effectiveStatus:     string; // "managed" | "active" | "env_only" | "invalid" | "unconfigured"
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
    case "managed":      return { dot: "bg-blue-500",     badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",   label: "Managed" };
    case "active":       return { dot: "bg-green-500",    badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800", label: "Connected" };
    case "env_only":     return { dot: "bg-yellow-400",   badge: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800", label: "Env Key" };
    case "invalid":      return { dot: "bg-red-500",      badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",   label: "Invalid Key" };
    case "unconfigured": return { dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border", label: "Not Configured" };
    default:             return { dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border", label: status };
  }
}

export default function IntegrationCard({ integration, onUpdated }: { integration: IntegrationStatus; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [credential, setCredential] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testOnly, setTestOnly] = useState(false);

  const statusCfg = getStatusConfig(integration.effectiveStatus);
  const renewalDays = integration.renewalPeriodDays ?? 30;
  const expiryDays  = daysUntil(integration.expiresAt);
  const isExpiringSoon = expiryDays !== null && expiryDays <= renewalDays && expiryDays > 0;
  const isExpired      = expiryDays !== null && expiryDays <= 0;

  function invalidateQueries() {
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
    onUpdated();
  }

  // ── Test current credential ──────────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/test`, {
        method: "POST",
        credentials: "include",
      });
      return res.json() as Promise<{ ok: boolean; message?: string; error?: string }>;
    },
    onSuccess: () => {
      invalidateQueries();
    },
  });

  // ── Update credential ───────────────────────────────────────────────────────
  const updateMutation = useMutation({
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
      const data = await res.json() as { ok: boolean; message?: string; error?: string; keyHint?: string; lastVerifiedAt?: string; status?: string };
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

  // ── Remove stored credential ─────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/integrations/${integration.slug}/credential`, {
        method: "DELETE",
        credentials: "include",
      });
      return res.json();
    },
    onSuccess: () => { invalidateQueries(); },
  });

  function handleUpdateSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate();
  }

  const isSubmitting = updateMutation.isPending;
  const isTesting    = testMutation.isPending;

  return (
    <div className={cn(
      "bg-card border rounded-xl p-4 flex flex-col gap-3 transition-colors",
      isExpired           ? "border-red-300 dark:border-red-800" :
      isExpiringSoon      ? "border-yellow-300 dark:border-yellow-700" :
      integration.effectiveStatus === "invalid" ? "border-red-300 dark:border-red-800" : "border-border"
    )}>
      {/* ── Header row ── */}
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className="mt-0.5 flex-shrink-0">
          <span className={cn("inline-block w-2.5 h-2.5 rounded-full", statusCfg.dot)} />
        </div>

        {/* Title + badge */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{integration.name}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", statusCfg.badge)}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{integration.description}</p>
        </div>

        {/* Toggle details */}
        <button
          onClick={() => setShowDetails(d => !d)}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5"
          title="Toggle details"
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Renewal warning ─────────────────────────────────────────────────── */}
      {(isExpired || isExpiringSoon) && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border",
          isExpired
            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
            : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800"
        )}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {isExpired
            ? `This credential expired ${Math.abs(expiryDays!)} day(s) ago. Replace it to restore the integration.`
            : `Renewal due in ${expiryDays} day(s). SAM.gov system account keys expire annually.`
          }
        </div>
      )}

      {/* ── SAM.gov renewal reminder (no DB expiresAt yet) ─────────────────── */}
      {integration.slug === "sam_gov" && !integration.expiresAt && integration.effectiveStatus !== "unconfigured" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground border border-border bg-muted/30">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          SAM.gov system account keys expire annually. Update the key before it expires to avoid losing federal bid discovery.
        </div>
      )}

      {/* ── Details row (collapsed by default) ─────────────────────────────── */}
      {showDetails && (
        <div className="text-xs text-muted-foreground space-y-1 pl-5 border-l-2 border-muted">
          {integration.keyHint && (
            <div className="flex items-center gap-2">
              <KeyRound className="w-3 h-3 flex-shrink-0" />
              <span className="font-mono">{integration.keyHint.replace(/./g, "•").slice(0, -4) + integration.keyHint.slice(-4)}</span>
              {integration.dbConfigured && (
                <span className="text-muted-foreground/60">(stored in app)</span>
              )}
            </div>
          )}
          {integration.effectiveStatus === "env_only" && (
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              Using environment variable. Add the key here to manage it from the app.
            </div>
          )}
          {integration.lastVerifiedAt && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-green-500" />
              Last verified {relativeTime(integration.lastVerifiedAt)}
            </div>
          )}
          {integration.lastVerifyError && (
            <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
              <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {integration.lastVerifyError}
            </div>
          )}
          {integration.managed && integration.managedNote && (
            <div className="text-blue-600 dark:text-blue-400">{integration.managedNote}</div>
          )}
          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              Get API key / docs
            </a>
          )}
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      {!integration.managed && (
        <div className="flex flex-wrap gap-2 pl-5">
          {/* Test current */}
          <button
            onClick={() => testMutation.mutate()}
            disabled={isTesting || integration.effectiveStatus === "unconfigured"}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isTesting
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
            Test Connection
          </button>

          {/* Update key */}
          <button
            onClick={() => { setShowUpdateForm(f => !f); updateMutation.reset(); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              showUpdateForm
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            <KeyRound className="w-3 h-3" />
            {showUpdateForm ? "Cancel" : integration.effectiveStatus === "unconfigured" ? "Add Key" : "Update Key"}
          </button>

          {/* Remove stored (only if a DB-managed credential exists) */}
          {integration.dbConfigured && !showUpdateForm && (
            <button
              onClick={() => {
                if (confirm(`Remove the stored key for ${integration.shortName}? The integration will fall back to the environment variable if one is set.`)) {
                  removeMutation.mutate();
                }
              }}
              disabled={removeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-red-600 dark:text-red-400 hover:border-red-300 dark:hover:border-red-700 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Remove Key
            </button>
          )}
        </div>
      )}

      {/* ── Test result ─────────────────────────────────────────────────────── */}
      {testMutation.isSuccess && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ml-5",
          testMutation.data?.ok
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
        )}>
          {testMutation.data?.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
          }
          {testMutation.data?.ok ? "Connection successful." : (testMutation.data?.error ?? "Test failed.")}
        </div>
      )}

      {/* ── Inline credential update form ──────────────────────────────────── */}
      {showUpdateForm && (
        <form onSubmit={handleUpdateSubmit} className="space-y-3 pl-5 pt-1 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">{integration.credentialHelp}</p>

          {integration.credentialType === "client_secret_pair" && integration.fields ? (
            /* Multi-field (e.g., Plaid clientId + secret) */
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
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full px-3 py-2 pr-9 text-xs font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {field.sensitive && (
                      <button
                        type="button"
                        onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecrets[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Single-field */
            <div className="relative">
              <input
                type={testOnly ? "text" : "password"}
                placeholder={`New ${integration.credentialLabel}`}
                value={credential}
                onChange={e => setCredential(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 pr-9 text-xs font-mono border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => setTestOnly(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {testOnly ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              {isSubmitting ? "Testing & Saving…" : "Test & Save"}
            </button>
            <span className="text-xs text-muted-foreground">The key is tested first — if it fails, the existing credential is unchanged.</span>
          </div>

          {/* Update result */}
          {updateMutation.isError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {(updateMutation.error as Error).message}
            </div>
          )}
          {updateMutation.isSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              {updateMutation.data?.message ?? "Key saved."}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
