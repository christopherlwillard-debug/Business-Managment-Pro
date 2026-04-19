import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProspect,
  useGetProspect,
  useCreateProspectDepositLink,
  useAddProspectServiceVisit,
  useDeleteProspectServiceVisit,
  useUpdateProspectServiceVisit,
  getListJobsQueryKey,
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
  Trash2,
  Pencil,
  Receipt,
  Briefcase,
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ProspectDrawer({ prospect, open, onClose, onUpdated, scheduledAddressMap, onAddToRoute }: ProspectDrawerProps) {
  const updateMutation = useUpdateProspect();
  const depositLinkMutation = useCreateProspectDepositLink();
  const addVisitMutation = useAddProspectServiceVisit();
  const deleteVisitMutation = useDeleteProspectServiceVisit();
  const updateVisitMutation = useUpdateProspectServiceVisit();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const detailQuery = useGetProspect(open && prospect ? prospect.id : null);

  const detail: (Prospect & { statusHistory?: ProspectDetail["statusHistory"]; serviceVisits?: ProspectDetail["serviceVisits"] }) | null = detailQuery.data ?? prospect;

  const [showDepositInput, setShowDepositInput] = useState(false);
  const [depositAmtStr, setDepositAmtStr] = useState("50");
  const [depositMode, setDepositMode] = useState<"flat" | "percent">("percent");
  const [isGeneratingDeposit, setIsGeneratingDeposit] = useState(false);
  const [newDepositUrl, setNewDepositUrl] = useState<string | null>(null);

  const [showServicePanel, setShowServicePanel] = useState(false);
  const [serviceDateStr, setServiceDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [serviceNotes, setServiceNotes] = useState("");
  const [servicePriceStr, setServicePriceStr] = useState("");

  const [showRouteInput, setShowRouteInput] = useState(false);
  const [routeDateStr, setRouteDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [addingToRoute, setAddingToRoute] = useState(false);

  const [confirmDeleteVisitId, setConfirmDeleteVisitId] = useState<number | null>(null);
  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
  const [editVisitDate, setEditVisitDate] = useState("");
  const [editVisitNotes, setEditVisitNotes] = useState("");
  const [editVisitPrice, setEditVisitPrice] = useState("");
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  const [showCreateJobPanel, setShowCreateJobPanel] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [jobStartDate, setJobStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobNotes, setJobNotes] = useState("");
  const [jobStatusVal, setJobStatusVal] = useState<"scheduled" | "in_progress">("scheduled");
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [createdJobId, setCreatedJobId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setShowDepositInput(false);
      setDepositAmtStr("50");
      setDepositMode("percent");
      setNewDepositUrl(null);
      setShowServicePanel(false);
      setServiceDateStr(new Date().toISOString().slice(0, 10));
      setServiceNotes("");
      setServicePriceStr("");
      setShowRouteInput(false);
      setRouteDateStr(new Date().toISOString().slice(0, 10));
      setConfirmDeleteVisitId(null);
      setEditingVisitId(null);
      setEditVisitDate("");
      setEditVisitNotes("");
      setEditVisitPrice("");
      setShowCreateJobPanel(false);
      setJobTitle("");
      setJobStartDate(new Date().toISOString().slice(0, 10));
      setJobNotes("");
      setJobStatusVal("scheduled");
      setIsCreatingJob(false);
      setCreatedJobId(null);
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
    try {
      const parsedPrice = servicePriceStr.trim() !== "" ? parseFloat(servicePriceStr) : null;
      await addVisitMutation.mutateAsync({
        id: prospect.id,
        servicedAt: serviceDateStr,
        notes: serviceNotes.trim() || null,
        price: parsedPrice != null && !isNaN(parsedPrice) ? parsedPrice : null,
      });
      const isFirstVisit = (detail?.serviceVisits?.length ?? 0) === 0;
      toast({
        title: isFirstVisit ? "Job marked as serviced" : "Visit recorded",
        description: "Resealing follow-up date has been updated automatically.",
      });
      setShowServicePanel(false);
      setServiceNotes("");
      setServicePriceStr("");
      detailQuery.refetch();
      onUpdated();
    } catch {
      toast({ title: "Error recording service visit", variant: "destructive" });
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

  type EstimateLineItemShape = { description: string; quantity: number; unitCost: number; category?: string };
  type InvoiceLineItemShape = { description: string; quantity: number; unitPrice: number };

  async function resolveClientId(name: string | null | undefined, email: string | null | undefined, phone: string | null | undefined): Promise<number | undefined> {
    if (!name?.trim()) return undefined;
    try {
      const res = await fetch(`${BASE}/api/clients`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email ?? undefined, phone: phone ?? undefined }),
      });
      if (res.ok) {
        const client = await res.json() as { id: number };
        return client.id;
      }
    } catch {
    }
    return undefined;
  }

  const handleCreateQuote = async () => {
    if (!prospect) return;
    setIsCreatingQuote(true);
    try {
      const lineItems: EstimateLineItemShape[] = p.roughQuote != null
        ? [{ description: `Asphalt Sealing — ${p.address}`, quantity: 1, unitCost: p.roughQuote, category: "Labor" }]
        : [];

      const clientId = await resolveClientId(p.contactName, p.contactEmail, p.contactPhone);

      const res = await fetch(`${BASE}/api/estimates`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Quote — ${p.address}`,
          jobType: "Asphalt Sealing",
          businessLine: "asphalt_sealing",
          status: "draft",
          clientId,
          lineItems,
        }),
      });
      if (!res.ok) throw new Error("Failed to create estimate");
      const estimate = await res.json() as { id: number };
      await updateMutation.mutateAsync({ id: prospect.id, linkedEstimateId: estimate.id });
      detailQuery.refetch();
      onUpdated();
      toast({ title: "Quote created", description: "Opening estimate…" });
      setLocation(`/estimates?open=${estimate.id}`);
      onClose();
    } catch {
      toast({ title: "Failed to create quote", variant: "destructive" });
    } finally {
      setIsCreatingQuote(false);
    }
  };

  const handleViewQuote = () => {
    if (!p.linkedEstimateId) return;
    setLocation(`/estimates?open=${p.linkedEstimateId}`);
    onClose();
  };

  const handleCreateInvoice = async () => {
    if (!prospect) return;
    setIsCreatingInvoice(true);
    try {
      let lineItems: InvoiceLineItemShape[] = [];

      if (p.linkedEstimateId) {
        const estRes = await fetch(`${BASE}/api/estimates/${p.linkedEstimateId}`, { credentials: "include" });
        if (estRes.ok) {
          const est = await estRes.json() as { lineItems?: EstimateLineItemShape[] };
          if (Array.isArray(est.lineItems) && est.lineItems.length > 0) {
            lineItems = est.lineItems.map((li) => ({
              description: li.description,
              quantity: Number(li.quantity),
              unitPrice: Number(li.unitCost),
            }));
          }
        }
      }

      if (lineItems.length === 0 && p.roughQuote != null) {
        lineItems = [{ description: `Asphalt Sealing — ${p.address}`, quantity: 1, unitPrice: Number(p.roughQuote) }];
      }
      if (lineItems.length === 0) {
        lineItems = [{ description: `Asphalt Sealing — ${p.address}`, quantity: 1, unitPrice: 0 }];
      }

      const clientId = await resolveClientId(p.contactName, p.contactEmail, p.contactPhone);

      const today = new Date().toISOString().slice(0, 10);
      const invRes = await fetch(`${BASE}/api/invoices`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issueDate: today,
          status: "draft",
          locationName: p.address,
          city: p.city ?? undefined,
          state: p.state ?? "KY",
          businessLine: "asphalt_sealing",
          lineItems,
        }),
      });
      if (!invRes.ok) throw new Error("Failed to create invoice");
      const invoice = await invRes.json() as { id: number };

      await updateMutation.mutateAsync({ id: prospect.id, linkedInvoiceId: invoice.id });
      detailQuery.refetch();
      onUpdated();
      toast({ title: "Invoice created", description: "Opening invoice…" });
      setLocation(`/invoices?open=${invoice.id}`);
      onClose();
    } catch {
      toast({ title: "Failed to create invoice", variant: "destructive" });
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  const handleViewInvoice = () => {
    if (!p.linkedInvoiceId) return;
    setLocation(`/invoices?open=${p.linkedInvoiceId}`);
    onClose();
  };

  const handleCreateJob = async () => {
    setIsCreatingJob(true);
    try {
      const clientId = await resolveClientId(p.contactName, p.contactEmail, p.contactPhone);
      const resolvedTitle = jobTitle.trim() || `Job — ${p.address}`;
      const res = await fetch(`${BASE}/api/jobs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resolvedTitle,
          clientId: clientId ?? null,
          status: jobStatusVal,
          address: p.address,
          city: p.city ?? undefined,
          state: p.state ?? undefined,
          startDate: jobStartDate || undefined,
          notes: jobNotes.trim() || undefined,
          businessLine: "asphalt_sealing",
        }),
      });
      if (!res.ok) throw new Error("Failed to create job");
      const job = await res.json() as { id: number };

      if (p.status !== "won" && p.status !== "serviced") {
        await updateMutation.mutateAsync({ id: prospect.id, status: "won" });
      }

      setCreatedJobId(job.id);
      setShowCreateJobPanel(false);
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      detailQuery.refetch();
      onUpdated();
      toast({ title: "Job created!", description: `"${resolvedTitle}" has been added to Jobs.` });
    } catch {
      toast({ title: "Failed to create job", variant: "destructive" });
    } finally {
      setIsCreatingJob(false);
    }
  };

  const statusHistory = detailQuery.data?.statusHistory ?? [];

  const scheduledDate = scheduledAddressMap
    ? (scheduledAddressMap.get(buildFullAddress(p).trim().toLowerCase()) ?? null)
    : null;

  const depositUrl = newDepositUrl ?? p.squarePaymentLinkUrl ?? p.stripePaymentLinkUrl;
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
                Online Customer
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
                <strong>Address looks like an email.</strong> This prospect was likely auto-imported from an online payment — consider updating the address field below.
              </span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Service History — shown when job has been serviced at least once */}
          {p.status === "serviced" && (
            <section className="space-y-2.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5" />
                Service History
              </h3>
              {p.followUpDate && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                  <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
                  Next reseal due: <span className="font-semibold ml-0.5">{formatDate(p.followUpDate)}</span>
                </div>
              )}
              {detail?.serviceVisits && detail.serviceVisits.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                  {detail.serviceVisits.map((v, i) => (
                    <div key={v.id} className="px-4 py-3">
                      {editingVisitId === v.id ? (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Date</label>
                            <input
                              type="date"
                              value={editVisitDate}
                              onChange={(e) => setEditVisitDate(e.target.value)}
                              className="text-sm border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Notes</label>
                            <textarea
                              value={editVisitNotes}
                              onChange={(e) => setEditVisitNotes(e.target.value)}
                              rows={2}
                              placeholder="Optional notes…"
                              className="text-sm border border-border rounded px-2 py-1 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Price</label>
                            <input
                              type="number"
                              value={editVisitPrice}
                              onChange={(e) => setEditVisitPrice(e.target.value)}
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                              className="text-sm border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => {
                                if (!editVisitDate) return;
                                const parsed = parseFloat(editVisitPrice);
                                const priceVal = editVisitPrice !== "" && !isNaN(parsed) ? parsed : null;
                                updateVisitMutation.mutate(
                                  {
                                    prospectId: p.id,
                                    visitId: v.id,
                                    servicedAt: editVisitDate,
                                    notes: editVisitNotes || null,
                                    price: priceVal,
                                  },
                                  {
                                    onSuccess: () => {
                                      setEditingVisitId(null);
                                      onUpdated();
                                      toast({ title: "Visit updated", description: "Service visit saved." });
                                    },
                                    onError: () => {
                                      toast({ title: "Error", description: "Failed to update service visit.", variant: "destructive" });
                                    },
                                  }
                                );
                              }}
                              disabled={updateVisitMutation.isPending || !editVisitDate}
                              className="text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingVisitId(null)}
                              className="text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {formatDate(v.servicedAt)}
                              </p>
                              {i === 0 && (
                                <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">Most recent</span>
                              )}
                            </div>
                            {v.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>
                            )}
                            {v.price != null && (
                              <p className="text-xs text-emerald-700 font-medium mt-0.5">{formatCurrency(v.price)}</p>
                            )}
                            {confirmDeleteVisitId === v.id ? (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs text-destructive">Remove this visit?</span>
                                <button
                                  onClick={() => {
                                    deleteVisitMutation.mutate(
                                      { prospectId: p.id, visitId: v.id },
                                      {
                                        onSuccess: () => {
                                          setConfirmDeleteVisitId(null);
                                          onUpdated();
                                          toast({ title: "Visit removed", description: "Service visit deleted and dates updated." });
                                        },
                                        onError: () => {
                                          toast({ title: "Error", description: "Failed to delete service visit.", variant: "destructive" });
                                        },
                                      }
                                    );
                                  }}
                                  disabled={deleteVisitMutation.isPending}
                                  className="text-xs px-2 py-0.5 bg-destructive text-destructive-foreground rounded hover:opacity-90 transition-opacity"
                                >
                                  Yes, remove
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteVisitId(null)}
                                  className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => {
                                setConfirmDeleteVisitId(null);
                                setEditingVisitId(v.id);
                                setEditVisitDate(v.servicedAt);
                                setEditVisitNotes(v.notes ?? "");
                                setEditVisitPrice(v.price != null ? String(v.price) : "");
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Edit this visit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteVisitId(confirmDeleteVisitId === v.id ? null : v.id)}
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete this visit"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : p.servicedAt ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-foreground">Job completed — {formatDate(p.servicedAt)}</p>
                </div>
              ) : null}
              {(() => {
                const visits = detail?.serviceVisits ?? [];
                const hasPricedVisit = visits.some((v) => v.price != null);
                if (!hasPricedVisit) return null;
                const totalEarned = visits.reduce((sum, v) => {
                  const n = Number(v.price);
                  return sum + (v.price != null && Number.isFinite(n) ? n : 0);
                }, 0);
                return (
                  <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Total earned</span>
                    <span className="text-sm font-bold text-emerald-700">{formatCurrency(totalEarned)}</span>
                  </div>
                );
              })()}
            </section>
          )}

          {/* Quote & Invoice Section */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Quote & Invoice
            </h3>
            {p.linkedEstimateId ? (
              <button
                onClick={handleViewQuote}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                View Quote{p.linkedEstimateNumber ? ` — ${p.linkedEstimateNumber}` : ""}
              </button>
            ) : (p.status === "cold" || p.status === "contacted" || p.status === "quoted" || p.status === "won") && (
              <button
                onClick={handleCreateQuote}
                disabled={isCreatingQuote}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
              >
                <FileText className="w-3.5 h-3.5" />
                {isCreatingQuote ? "Creating Quote…" : "Create Quote"}
              </button>
            )}
            {(p.status === "won" || p.status === "serviced") && !createdJobId && (
              p.linkedInvoiceId ? (
                <button
                  onClick={handleViewInvoice}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  View Invoice
                </button>
              ) : (
                <button
                  onClick={handleCreateInvoice}
                  disabled={isCreatingInvoice}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  {isCreatingInvoice ? "Creating Invoice…" : "Create Invoice"}
                </button>
              )
            )}

            {/* ── Create Job ── */}
            {(p.status === "quoted" || p.status === "won") && !createdJobId && (
              showCreateJobPanel ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-green-900 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5" />
                      New Job
                    </p>
                    <button
                      onClick={() => setShowCreateJobPanel(false)}
                      className="p-1 text-green-700 hover:bg-green-100 rounded transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-green-800">Job Title</label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder={`Job — ${p.address}`}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400/30 bg-background"
                    />
                  </div>

                  {p.contactName && (
                    <div className="flex items-center gap-1.5 text-xs text-green-700">
                      <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                      <span>Client: <strong>{p.contactName}</strong> will be auto-linked</span>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-green-800">Scheduled Date</label>
                    <input
                      type="date"
                      value={jobStartDate}
                      onChange={e => setJobStartDate(e.target.value)}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400/30 bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-green-800">Status</label>
                    <select
                      value={jobStatusVal}
                      onChange={e => setJobStatusVal(e.target.value as "scheduled" | "in_progress")}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400/30 bg-background"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-green-800">Notes (optional)</label>
                    <textarea
                      value={jobNotes}
                      onChange={e => setJobNotes(e.target.value)}
                      placeholder="Any notes for this job…"
                      rows={2}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400/30 resize-none bg-background"
                    />
                  </div>

                  <div className="flex gap-1.5 pt-0.5">
                    <button
                      onClick={handleCreateJob}
                      disabled={isCreatingJob}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                    >
                      <Briefcase className="w-3.5 h-3.5" />
                      {isCreatingJob ? "Creating…" : "Create Job"}
                    </button>
                    <button
                      onClick={() => setShowCreateJobPanel(false)}
                      className="px-3 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setJobTitle(`Job — ${p.address}`);
                    setJobStartDate(new Date().toISOString().slice(0, 10));
                    setShowCreateJobPanel(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  Create Job
                </button>
              )
            )}

            {/* Job created — View / Invoice CTAs */}
            {createdJobId && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs font-medium text-green-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                  Job created successfully!
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setLocation("/jobs"); onClose(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-green-300 bg-green-50 text-green-800 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    View Job
                  </button>
                  <button
                    onClick={() => { setLocation("/invoices"); onClose(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Create Invoice
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Actions Section */}
          {(showDepositActions || p.depositPaidAt || p.status === "won" || p.status === "serviced") && (
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

              {/* Mark as Serviced / Record Another Visit */}
              {(p.status === "won" || p.status === "serviced") && !showServicePanel && (
                <button
                  onClick={() => { setShowServicePanel(true); setServiceDateStr(new Date().toISOString().slice(0, 10)); setServiceNotes(""); setServicePriceStr(""); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {p.status === "serviced" ? "Record Another Visit" : "Mark as Serviced"}
                </button>
              )}

              {/* Service visit panel */}
              {showServicePanel && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2.5">
                  <p className="text-sm font-medium text-indigo-900">
                    {p.status === "serviced" ? "Record another service visit" : "Confirm service date"}
                  </p>
                  <p className="text-xs text-indigo-700">Recording this will update the resealing follow-up to ~2.5 years out.</p>
                  <input
                    type="date"
                    value={serviceDateStr}
                    onChange={(e) => setServiceDateStr(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-background"
                  />
                  <input
                    type="text"
                    value={serviceNotes}
                    onChange={(e) => setServiceNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full px-2.5 py-1.5 text-sm border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-background"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={servicePriceStr}
                      onChange={(e) => setServicePriceStr(e.target.value)}
                      placeholder="Amount charged (optional)"
                      className="w-full pl-6 pr-2.5 py-1.5 text-sm border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400/30 bg-background"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleMarkServiced}
                      disabled={addVisitMutation.isPending}
                      className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {addVisitMutation.isPending ? "Saving…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => { setShowServicePanel(false); setServicePriceStr(""); }}
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
                      {addingToRoute ? "Locating…" : "Add"}
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
                  if (event.type === "service_visit_added") {
                    return (
                      <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                        <BadgeCheck className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            Service visit recorded{event.newValue ? ` — ${formatDate(event.newValue)}` : ""}
                          </p>
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
