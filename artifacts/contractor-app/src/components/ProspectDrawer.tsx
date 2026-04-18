import { useState, useEffect } from "react";
import {
  useUpdateProspect,
  useGetProspect,
  useCreateProspectDepositLink,
  type Prospect,
  type ProspectDetail,
  type ProspectStatus,
  type ProspectPropertyType,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MapPin,
  Phone,
  Mail,
  Building2,
  DollarSign,
  CalendarClock,
  CreditCard,
  CheckCircle2,
  BadgeCheck,
  AlertTriangle,
  Edit2,
  Check,
  X,
  FileText,
  Clock,
  ArrowRight,
  History,
  Copy,
  ExternalLink,
  Link,
  Link2Off,
  Route,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "cold", label: "Cold" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "serviced", label: "Serviced" },
  { value: "lost", label: "Lost" },
];

const STATUS_BADGE: Record<ProspectStatus, { label: string; className: string }> = {
  cold: { label: "Cold", className: "bg-slate-100 text-slate-700 border-slate-200" },
  contacted: { label: "Contacted", className: "bg-blue-100 text-blue-700 border-blue-200" },
  quoted: { label: "Quoted", className: "bg-amber-100 text-amber-700 border-amber-200" },
  won: { label: "Won", className: "bg-green-100 text-green-700 border-green-200" },
  serviced: { label: "Serviced", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  lost: { label: "Lost", className: "bg-red-100 text-red-700 border-red-200" },
};

const PROPERTY_TYPE_COLORS: Record<string, string> = {
  Church: "bg-purple-100 text-purple-700 border-purple-200",
  Retail: "bg-orange-100 text-orange-700 border-orange-200",
  Apartment: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Industrial: "bg-zinc-100 text-zinc-700 border-zinc-200",
  Other: "bg-gray-100 text-gray-700 border-gray-200",
};

const PROPERTY_TYPES: ProspectPropertyType[] = ["Church", "Retail", "Apartment", "Industrial", "Other"];

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isFollowUpDue(followUpDate: string | null | undefined): boolean {
  if (!followUpDate) return false;
  const due = new Date(followUpDate);
  const now = new Date();
  const in60 = new Date(now);
  in60.setDate(in60.getDate() + 60);
  return due <= in60;
}

function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

interface InlineEditProps {
  label: string;
  value: string;
  displayValue?: string;
  type?: "text" | "tel" | "email" | "number" | "date" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
}

function InlineEdit({ label, value, displayValue, type = "text", options, placeholder, onSave, className }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`space-y-1 ${className ?? ""}`}>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
        <div className="flex gap-1.5 items-start">
          {type === "textarea" ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              rows={3}
              autoFocus
              className="flex-1 px-2.5 py-1.5 text-sm border border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none bg-background"
            />
          ) : type === "select" && options ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="flex-1 px-2.5 py-1.5 text-sm border border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="flex-1 px-2.5 py-1.5 text-sm border border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={handleCancel}
            className="p-1.5 text-muted-foreground hover:bg-muted rounded transition-colors"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group space-y-0.5 ${className ?? ""}`}>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-foreground flex-1">
          {(displayValue ?? value) || <span className="text-muted-foreground italic">Not set</span>}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all"
          title={`Edit ${label}`}
        >
          <Edit2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function buildFullAddress(p: { address: string; city?: string | null; state?: string | null; zip?: string | null }): string {
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ProspectDrawerProps {
  prospect: Prospect | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  scheduledAddressMap?: Map<string, string>;
  onAddToRoute?: (p: Prospect, date: string) => Promise<void>;
}

export function ProspectDrawer({ prospect, open, onClose, onUpdated, scheduledAddressMap, onAddToRoute }: ProspectDrawerProps) {
  const updateMutation = useUpdateProspect();
  const depositLinkMutation = useCreateProspectDepositLink();
  const { toast } = useToast();
  const detailQuery = useGetProspect(open && prospect ? prospect.id : null);

  const detail: (Prospect & { statusHistory?: ProspectDetail["statusHistory"] }) | null = detailQuery.data ?? prospect;

  const [showDepositInput, setShowDepositInput] = useState(false);
  const [depositAmtStr, setDepositAmtStr] = useState("50");
  const [depositMode, setDepositMode] = useState<"flat" | "percent">("percent");
  const [isGeneratingDeposit, setIsGeneratingDeposit] = useState(false);
  const [newDepositUrl, setNewDepositUrl] = useState<string | null>(null);

  const [showServicePanel, setShowServicePanel] = useState(false);
  const [serviceDateStr, setServiceDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [isMarkingServiced, setIsMarkingServiced] = useState(false);

  const [showRouteInput, setShowRouteInput] = useState(false);
  const [routeDateStr, setRouteDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [addingToRoute, setAddingToRoute] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowDepositInput(false);
      setDepositAmtStr("50");
      setDepositMode("percent");
      setNewDepositUrl(null);
      setShowServicePanel(false);
      setServiceDateStr(new Date().toISOString().slice(0, 10));
      setShowRouteInput(false);
      setRouteDateStr(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  if (!prospect) return null;

  const badAddress = looksLikeEmail(prospect.address);
  const badge = STATUS_BADGE[detail?.status ?? prospect.status] ?? STATUS_BADGE.cold;
  const propColor = PROPERTY_TYPE_COLORS[detail?.propertyType ?? prospect.propertyType] ?? PROPERTY_TYPE_COLORS.Other;

  const save = async (field: string, value: string | number | null) => {
    try {
      await updateMutation.mutateAsync({ id: prospect.id, [field]: value } as Parameters<typeof updateMutation.mutateAsync>[0]);
      detailQuery.refetch();
      onUpdated();
    } catch {
      toast({ title: `Failed to update ${field}`, variant: "destructive" });
      throw new Error("save failed");
    }
  };

  const saveField = (field: string) => async (raw: string) => {
    let parsed: string | number | null = raw || null;
    if (field === "estimatedSqft") parsed = raw ? parseInt(raw) : null;
    if (field === "roughQuote") parsed = raw ? parseFloat(raw) : null;
    await save(field, parsed);
  };

  const handleStatusSave = async (value: string) => {
    if (value === "serviced" && (detail?.status ?? prospect.status) !== "serviced") {
      setServiceDateStr(new Date().toISOString().slice(0, 10));
      setShowServicePanel(true);
      return;
    }
    await saveField("status")(value);
  };

  const handleRequestDeposit = async () => {
    setIsGeneratingDeposit(true);
    try {
      let depositAmount: number | undefined;
      let depositPercent: number | undefined;
      const val = parseFloat(depositAmtStr);
      if (!isNaN(val) && val > 0) {
        if (depositMode === "flat") depositAmount = val;
        else depositPercent = val;
      }
      const result = await depositLinkMutation.mutateAsync({ id: prospect.id, depositAmount, depositPercent });
      setNewDepositUrl(result.paymentLinkUrl);
      setShowDepositInput(false);
      detailQuery.refetch();
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create deposit link";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setIsGeneratingDeposit(false);
    }
  };

  const handleMarkServiced = async () => {
    setIsMarkingServiced(true);
    try {
      await updateMutation.mutateAsync({ id: prospect.id, status: "serviced", servicedAt: serviceDateStr });
      toast({ title: "Job marked as serviced", description: "Resealing follow-up date has been set automatically." });
      setShowServicePanel(false);
      detailQuery.refetch();
      onUpdated();
    } catch {
      toast({ title: "Error marking as serviced", variant: "destructive" });
    } finally {
      setIsMarkingServiced(false);
    }
  };

  const copyDepositLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Deposit link copied!" });
  };

  const handleRouteAdd = async () => {
    if (!onAddToRoute || !prospect) return;
    setAddingToRoute(true);
    try {
      await onAddToRoute(prospect, routeDateStr);
      setShowRouteInput(false);
    } finally {
      setAddingToRoute(false);
    }
  };

  const p = detail ?? prospect;
  const statusHistory = detailQuery.data?.statusHistory ?? [];

  const scheduledDate = scheduledAddressMap
    ? (scheduledAddressMap.get(buildFullAddress(p).trim().toLowerCase()) ?? null)
    : null;

  const depositUrl = newDepositUrl ?? p.stripePaymentLinkUrl;
  const showDepositActions = !p.depositPaidAt && (p.roughQuote != null || depositUrl);
  const showRequestBtn = !depositUrl && !showDepositInput;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Header area */}
        <div className="px-6 pt-6 pb-4 border-b border-border bg-muted/30">
          <SheetHeader>
            <SheetTitle className="flex items-start gap-2 pr-6">
              <MapPin className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
              <span className="text-base font-semibold leading-snug">{p.address}</span>
            </SheetTitle>
          </SheetHeader>

          {/* Badges row */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
              {badge.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${propColor}`}>
              <Building2 className="w-3 h-3" />
              {p.propertyType}
            </span>
            {scheduledDate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">
                <Route className="w-3 h-3" />
                On Route {formatShortDate(scheduledDate)}
              </span>
            )}
            {p.source === "stripe_payment" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-100 text-violet-700 border-violet-200">
                <BadgeCheck className="w-3 h-3" />
                Stripe Customer
              </span>
            )}
            {isFollowUpDue(p.followUpDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-100 text-amber-700 border-amber-200">
                <CalendarClock className="w-3 h-3" />
                Follow-up Due
              </span>
            )}
          </div>

          {/* Bad address warning */}
          {badAddress && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>Address looks like an email.</strong> This prospect was likely auto-imported from Stripe — consider updating the address field below.
              </span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Serviced Job Info — shown when job is complete */}
          {p.status === "serviced" && (
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5" />
                Job Record
              </h3>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-900">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  Job completed{p.servicedAt ? ` — ${formatDate(p.servicedAt)}` : ""}
                </div>
                {p.followUpDate && (
                  <div className="flex items-center gap-2 text-xs text-indigo-700">
                    <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
                    Reseal follow-up: <span className="font-medium ml-0.5">{formatDate(p.followUpDate)}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Actions Section */}
          {(showDepositActions || p.depositPaidAt || p.status === "won") && (
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Actions
              </h3>

              {/* Deposit paid badge */}
              {p.depositPaidAt ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-medium text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  Deposit received{p.depositPaidAmount != null ? ` — ${formatCurrency(p.depositPaidAmount)}` : ""}
                </div>
              ) : depositUrl ? (
                /* Existing deposit link */
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Deposit link ready — share with prospect to collect payment.</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => copyDepositLink(depositUrl)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Deposit Link
                    </button>
                    <a
                      href={depositUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Open in browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : showRequestBtn ? (
                /* Request deposit button */
                <button
                  onClick={() => { setShowDepositInput(true); setDepositAmtStr("50"); setDepositMode("percent"); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Request Deposit
                </button>
              ) : showDepositInput ? (
                /* Deposit amount input */
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
                  <p className="text-xs font-medium text-foreground">Set deposit amount</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setDepositMode("percent")}
                      className={`flex-1 py-1.5 text-xs rounded border transition-colors ${depositMode === "percent" ? "bg-amber-500 text-white border-amber-500" : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      % of quote
                    </button>
                    <button
                      onClick={() => setDepositMode("flat")}
                      className={`flex-1 py-1.5 text-xs rounded border transition-colors ${depositMode === "flat" ? "bg-amber-500 text-white border-amber-500" : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      Flat $
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder={depositMode === "percent" ? "e.g. 50" : "Amount"}
                      value={depositAmtStr}
                      onChange={(e) => setDepositAmtStr(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400/30 bg-background"
                      autoFocus
                    />
                    <button
                      onClick={handleRequestDeposit}
                      disabled={isGeneratingDeposit}
                      className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-60 transition-colors"
                    >
                      {isGeneratingDeposit ? "…" : "Generate"}
                    </button>
                    <button
                      onClick={() => { setShowDepositInput(false); setDepositAmtStr("50"); }}
                      className="px-2.5 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Mark as Serviced */}
              {p.status === "won" && !showServicePanel && (
                <button
                  onClick={() => { setShowServicePanel(true); setServiceDateStr(new Date().toISOString().slice(0, 10)); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                  Mark as Serviced
                </button>
              )}

              {/* Mark as Serviced panel */}
              {showServicePanel && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2.5">
                  <p className="text-sm font-medium text-indigo-900">Confirm service date</p>
                  <p className="text-xs text-indigo-700">Recording this will set a resealing follow-up ~2.5 years out.</p>
                  <input
                    type="date"
                    value={serviceDateStr}
                    onChange={(e) => setServiceDateStr(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-background"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleMarkServiced}
                      disabled={isMarkingServiced}
                      className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {isMarkingServiced ? "Saving…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowServicePanel(false)}
                      className="flex-1 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Route Plan Section */}
          {onAddToRoute && (
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5" />
                Route Plan
              </h3>
              {scheduledDate ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm font-medium text-green-800">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  Already Scheduled — {formatShortDate(scheduledDate)}
                </div>
              ) : showRouteInput ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">Pick a date to add this stop</p>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={routeDateStr}
                      onChange={(e) => setRouteDateStr(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
                      autoFocus
                    />
                    <button
                      onClick={handleRouteAdd}
                      disabled={addingToRoute}
                      className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                    >
                      {addingToRoute ? "…" : "Add"}
                    </button>
                    <button
                      onClick={() => setShowRouteInput(false)}
                      className="px-2.5 py-1.5 text-sm text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setRouteDateStr(new Date().toISOString().slice(0, 10)); setShowRouteInput(true); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Route className="w-3.5 h-3.5" />
                  Add to Route Plan
                </button>
              )}
            </section>
          )}

          {/* Contact Info Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              Contact Info
            </h3>
            <div className="grid gap-4">
              <InlineEdit
                label="Name"
                value={p.contactName ?? ""}
                placeholder="Contact name"
                onSave={saveField("contactName")}
              />
              <InlineEdit
                label="Phone"
                value={p.contactPhone ?? ""}
                type="tel"
                placeholder="(555) 000-0000"
                onSave={saveField("contactPhone")}
              />
              <InlineEdit
                label="Email"
                value={p.contactEmail ?? ""}
                type="email"
                placeholder="contact@example.com"
                onSave={saveField("contactEmail")}
              />
              <InlineEdit
                label="Address"
                value={p.address}
                placeholder="123 Main St, Louisville, KY"
                onSave={saveField("address")}
              />
            </div>
          </section>

          {/* Property & Quote Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Property & Quote
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InlineEdit
                label="Status"
                value={p.status}
                displayValue={STATUS_OPTIONS.find((s) => s.value === p.status)?.label}
                type="select"
                options={STATUS_OPTIONS}
                onSave={handleStatusSave}
              />
              <InlineEdit
                label="Property Type"
                value={p.propertyType}
                type="select"
                options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))}
                onSave={saveField("propertyType")}
              />
              <InlineEdit
                label="Est. Square Footage"
                value={p.estimatedSqft != null ? String(p.estimatedSqft) : ""}
                displayValue={p.estimatedSqft != null ? `${p.estimatedSqft.toLocaleString()} sqft` : ""}
                type="number"
                placeholder="e.g. 5000"
                onSave={saveField("estimatedSqft")}
              />
              <InlineEdit
                label="Rough Quote"
                value={p.roughQuote != null ? String(p.roughQuote) : ""}
                displayValue={p.roughQuote != null ? formatCurrency(p.roughQuote) : ""}
                type="number"
                placeholder="e.g. 2500"
                onSave={saveField("roughQuote")}
              />
            </div>
          </section>

          {/* Follow-up Date */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Follow-up
            </h3>
            <InlineEdit
              label="Follow-up Date"
              value={p.followUpDate ?? ""}
              displayValue={p.followUpDate ? (formatDate(p.followUpDate) ?? "") : ""}
              type="date"
              onSave={saveField("followUpDate")}
            />
          </section>

          {/* Activity Section */}
          {statusHistory.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Activity
              </h3>
              <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                {statusHistory.map((event) => {
                  if (event.type === "deposit_received") {
                    const amount = event.newValue ? parseFloat(event.newValue) : null;
                    return (
                      <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">Deposit Received</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                        </div>
                        {amount != null && !isNaN(amount) && (
                          <span className="text-sm font-semibold text-emerald-700">{formatCurrency(amount)}</span>
                        )}
                      </div>
                    );
                  }
                  if (event.type === "payment_link_created") {
                    return (
                      <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                        <ExternalLink className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">Payment link created</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                        </div>
                      </div>
                    );
                  }
                  if (event.type === "estimate_linked") {
                    return (
                      <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                        <Link className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            Estimate linked
                            {event.newValue && (
                              <> — <span className="font-medium">{event.newValue}</span></>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                        </div>
                      </div>
                    );
                  }
                  if (event.type === "estimate_unlinked") {
                    return (
                      <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                        <Link2Off className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">Estimate unlinked</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          {event.oldValue ? (
                            <>
                              <span className="font-medium">{statusLabel(event.oldValue)}</span>
                              {" → "}
                              <span className="font-medium">{statusLabel(event.newValue ?? "")}</span>
                            </>
                          ) : (
                            <span className="font-medium">{statusLabel(event.newValue ?? "")}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Payment History Section */}
          {(p.source === "stripe_payment" || p.depositPaidAt || p.lastPaidAt || p.depositPaidAmount != null) && (
            <section className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Payment History
              </h3>
              <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                {p.depositPaidAt && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Deposit Received</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(p.depositPaidAt)}</p>
                    </div>
                    {p.depositPaidAmount != null && (
                      <span className="text-sm font-semibold text-emerald-700">{formatCurrency(p.depositPaidAmount)}</span>
                    )}
                  </div>
                )}
                {p.lastPaidAt && (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <Clock className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Last Payment</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(p.lastPaidAt)}</p>
                    </div>
                  </div>
                )}
                {!p.depositPaidAt && !p.lastPaidAt && (
                  <div className="px-4 py-3">
                    <p className="text-sm text-muted-foreground italic">No payment events yet</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notes Section */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Notes
            </h3>
            <InlineEdit
              label="Notes"
              value={p.notes ?? ""}
              type="textarea"
              placeholder="Property access details, owner info, follow-up notes…"
              onSave={saveField("notes")}
            />
          </section>

          {/* Metadata */}
          <section className="pt-2 border-t border-border space-y-1">
            {p.linkedEstimateNumber && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <DollarSign className="w-3 h-3" />
                Linked estimate: <span className="font-medium text-foreground">{p.linkedEstimateNumber}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="w-3 h-3" />
              Source: <span className="font-medium text-foreground capitalize">{(p.source ?? "manual").replace("_", " ")}</span>
            </div>
            {p.createdAt && (
              <p className="text-xs text-muted-foreground">Added {formatDate(p.createdAt)}</p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
