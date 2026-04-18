import { useState, useMemo } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListProspects,
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
  useListEstimates,
  type Prospect,
  type Estimate,
  type ProspectStatus,
  type ProspectPropertyType,
} from "@workspace/api-client-react";
import { ProspectDrawer } from "@/components/ProspectDrawer";
import {
  Target, Plus, Edit2, Trash2, Phone, MapPin, DollarSign,
  Maximize2, Building2, CheckCircle2, AlertCircle, CreditCard,
  BadgeCheck, CalendarClock, Route, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PROPERTY_TYPES: ProspectPropertyType[] = ["Church", "Retail", "Apartment", "Industrial", "Other"];

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

const FILTER_OPTIONS = [
  { value: "", label: "All" },
  ...STATUS_OPTIONS,
  { value: "due_for_resealing", label: "Due for Resealing" },
  { value: "follow_up_due", label: "Follow-up Due" },
];

function isFollowUpDue(followUpDate: string | null | undefined): boolean {
  if (!followUpDate) return false;
  const due = new Date(followUpDate);
  const now = new Date();
  const in60 = new Date(now);
  in60.setDate(in60.getDate() + 60);
  return due <= in60;
}

function isDueForResealing(p: { status: ProspectStatus; followUpDate?: string | null }): boolean {
  if (p.status !== "serviced") return false;
  if (!p.followUpDate) return false;
  const due = new Date(p.followUpDate);
  const now = new Date();
  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  return due <= in90;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type FormData = {
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string;
  estimatedSqft: string;
  roughQuote: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  status: string;
  linkedEstimateId: string;
};

const EMPTY_FORM: FormData = {
  address: "",
  city: "",
  state: "",
  zip: "",
  propertyType: "Other",
  estimatedSqft: "",
  roughQuote: "",
  contactName: "",
  contactPhone: "",
  notes: "",
  status: "cold",
  linkedEstimateId: "",
};

function prospectToForm(p: Prospect): FormData {
  return {
    address: p.address,
    city: p.city ?? "",
    state: p.state ?? "",
    zip: p.zip ?? "",
    propertyType: p.propertyType,
    estimatedSqft: p.estimatedSqft != null ? String(p.estimatedSqft) : "",
    roughQuote: p.roughQuote != null ? String(p.roughQuote) : "",
    contactName: p.contactName ?? "",
    contactPhone: p.contactPhone ?? "",
    notes: p.notes ?? "",
    status: p.status,
    linkedEstimateId: p.linkedEstimateId != null ? String(p.linkedEstimateId) : "",
  };
}

type RouteStop = {
  id: number;
  address: string;
  scheduledDate: string | null;
  status: string;
};

function buildFullAddress(p: Prospect): string {
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Prospects() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const locationSearch = searchParams.get("location") ?? "";
  function setLocationSearch(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set("location", value);
        } else {
          next.delete("location");
        }
        return next;
      },
      { replace: true }
    );
  }
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const { data: prospects = [], isLoading, refetch } = useListProspects();
  const { data: estimates = [] } = useListEstimates();
  const createMutation = useCreateProspect();
  const updateMutation = useUpdateProspect();
  const deleteMutation = useDeleteProspect();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: routeStops = [] } = useQuery<RouteStop[]>({
    queryKey: ["route-stops-upcoming"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/route-stops?startDate=${todayStr}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const scheduledAddressMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const stop of routeStops) {
      if (!stop.scheduledDate) continue;
      if (stop.status === "completed" || stop.status === "skipped") continue;
      const key = stop.address.trim().toLowerCase();
      const existing = map.get(key);
      if (!existing || stop.scheduledDate < existing) {
        map.set(key, stop.scheduledDate);
      }
    }
    return map;
  }, [routeStops]);

  const [drawerProspectId, setDrawerProspectId] = useState<number | null>(null);
  const drawerProspect = drawerProspectId != null ? (prospects.find((p) => p.id === drawerProspectId) ?? null) : null;

  const [routeTargetId, setRouteTargetId] = useState<number | null>(null);
  const [routeDateStr, setRouteDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [addingToRouteId, setAddingToRouteId] = useState<number | null>(null);

  async function handleAddToRoute(p: Prospect) {
    setAddingToRouteId(p.id);
    try {
      const fullAddress = buildFullAddress(p);
      const res = await fetch(`${BASE}/api/route-stops`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: p.contactName ?? p.address,
          address: fullAddress,
          scheduledDate: routeDateStr,
          status: "scheduled",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Added to Route Plan", description: `${p.address} scheduled for ${routeDateStr}. Open Route Planner to optimize.` });
      setRouteTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["route-stops-upcoming"] });
    } catch {
      toast({ title: "Failed to add to route", variant: "destructive" });
    } finally {
      setAddingToRouteId(null);
    }
  }

  const hasLocationFilter = locationSearch.trim().length > 0;

  const locationFiltered = prospects.filter((p) => {
    if (hasLocationFilter) {
      const q = locationSearch.trim().toLowerCase();
      const inCity = p.city?.toLowerCase().includes(q) ?? false;
      const inState = p.state?.toLowerCase().includes(q) ?? false;
      const inZip = p.zip?.toLowerCase().includes(q) ?? false;
      if (!inCity && !inState && !inZip) return false;
    }
    return true;
  });

  const filtered = locationFiltered.filter((p) => {
    if (statusFilter === "follow_up_due" && !isFollowUpDue(p.followUpDate)) return false;
    if (statusFilter === "due_for_resealing" && !isDueForResealing(p)) return false;
    if (statusFilter && statusFilter !== "follow_up_due" && statusFilter !== "due_for_resealing" && p.status !== statusFilter) return false;
    return true;
  });

  const openCreate = () => {
    setEditingProspect(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEdit = (p: Prospect) => {
    setEditingProspect(p);
    setForm(prospectToForm(p));
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingProspect(null);
    setForm(EMPTY_FORM);
  };

  const handleFormChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      address: form.address,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      propertyType: form.propertyType,
      estimatedSqft: form.estimatedSqft ? parseInt(form.estimatedSqft) : null,
      roughQuote: form.roughQuote ? parseFloat(form.roughQuote) : null,
      contactName: form.contactName || null,
      contactPhone: form.contactPhone || null,
      notes: form.notes || null,
      status: form.status as ProspectStatus,
      linkedEstimateId: form.linkedEstimateId ? parseInt(form.linkedEstimateId) : null,
    };

    try {
      if (editingProspect) {
        await updateMutation.mutateAsync({ id: editingProspect.id, ...payload });
        toast({ title: "Prospect updated" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Prospect added" });
      }
      closeDialog();
      refetch();
    } catch (err) {
      console.error(err);
      toast({ title: "Error saving prospect", variant: "destructive" });
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Prospect deleted" });
      refetch();
    } catch {
      toast({ title: "Error deleting prospect", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Prospects</h1>
          <p className="text-muted-foreground mt-1">Willard's Asphalt Sealing — customer pipeline &amp; job history</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Prospect
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              statusFilter === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {opt.label}
            {opt.value === "" && (
              <span className="ml-1.5 text-xs opacity-70">({locationFiltered.length})</span>
            )}
            {opt.value === "follow_up_due" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({locationFiltered.filter((p) => isFollowUpDue(p.followUpDate)).length})
              </span>
            )}
            {opt.value === "due_for_resealing" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({locationFiltered.filter((p) => isDueForResealing(p)).length})
              </span>
            )}
            {opt.value !== "" && opt.value !== "follow_up_due" && opt.value !== "due_for_resealing" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({locationFiltered.filter((p) => p.status === opt.value).length})
              </span>
            )}
          </button>
        ))}
      </div>
      {hasLocationFilter && (
        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span>Filtered by: <span className="font-semibold">{locationSearch.trim()}</span> — counts reflect this location only</span>
        </div>
      )}
      </div>

      {/* Location search */}
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card transition-colors focus-within:ring-2 focus-within:ring-primary/20 ${
          hasLocationFilter ? "border-primary" : "border-border"
        }`}>
          <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={locationSearch}
            onChange={(e) => setLocationSearch(e.target.value)}
            placeholder="Filter by city, state, or zip…"
            className="text-sm bg-transparent outline-none placeholder:text-muted-foreground w-48 sm:w-64"
          />
          {hasLocationFilter && (
            <button
              onClick={() => setLocationSearch("")}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear location filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading prospects…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Target className="w-10 h-10 opacity-30" />
          <p className="text-sm">
            {statusFilter ? `No ${statusFilter} prospects` : "No prospects yet"}
          </p>
          {!statusFilter && (
            <button
              onClick={openCreate}
              className="text-sm text-primary hover:underline"
            >
              Log your first prospect
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.cold;
            const propColor = PROPERTY_TYPE_COLORS[p.propertyType] ?? PROPERTY_TYPE_COLORS.Other;
            const fullAddr = buildFullAddress(p);
            const scheduledDate = scheduledAddressMap.get(fullAddr.trim().toLowerCase()) ?? null;
            return (
              <Card
                key={p.id}
                className="border border-border hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setDrawerProspectId(p.id)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 text-muted-foreground mb-1">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground block truncate">{p.address}</span>
                          {(p.city || p.state || p.zip) && (
                            <span className="text-xs text-muted-foreground">
                              {[p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
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

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {p.estimatedSqft != null && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Maximize2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{p.estimatedSqft.toLocaleString()} sqft</span>
                      </div>
                    )}
                    {p.roughQuote != null && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{formatCurrency(p.roughQuote)}</span>
                      </div>
                    )}
                    {p.contactName && (
                      <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                        <span className="font-medium text-foreground">{p.contactName}</span>
                      </div>
                    )}
                    {p.contactPhone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{p.contactPhone}</span>
                      </div>
                    )}
                    {p.lastPaidAt && (
                      <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 text-xs">
                        <CreditCard className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" />
                        <span>Last paid: {formatDate(p.lastPaidAt)}</span>
                      </div>
                    )}
                    {p.status === "serviced" && p.servicedAt && (
                      <div className="flex items-center gap-1.5 col-span-2 text-xs text-indigo-700">
                        <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Serviced on {formatDate(p.servicedAt)}</span>
                      </div>
                    )}
                    {p.followUpDate && (
                      <div className={`flex items-center gap-1.5 col-span-2 text-xs ${isDueForResealing(p) ? "text-indigo-700 font-medium" : isFollowUpDue(p.followUpDate) ? "text-amber-700" : "text-muted-foreground"}`}>
                        <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{p.status === "serviced" ? "Reseal due:" : "Follow-up:"} {formatDate(p.followUpDate)}</span>
                      </div>
                    )}
                  </div>

                  {p.linkedEstimateNumber && (
                    <div className="text-xs text-muted-foreground border-t border-border pt-2">
                      Estimate: <span className="font-medium text-foreground">{p.linkedEstimateNumber}</span>
                    </div>
                  )}

                  {p.notes && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-2">{p.notes}</p>
                  )}

                  {p.depositPaidAt && (
                    <div className="border-t border-border pt-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs font-medium text-emerald-800">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        Deposit Received{p.depositPaidAmount != null ? ` — $${p.depositPaidAmount.toFixed(2)}` : ""}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border pt-2">
                    {scheduledDate ? (
                      <div className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-green-200 rounded text-xs font-medium text-green-700 bg-green-50 cursor-default select-none">
                        <Route className="w-3 h-3" />
                        Already Scheduled — {formatShortDate(scheduledDate)}
                      </div>
                    ) : routeTargetId === p.id ? (
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="date"
                          value={routeDateStr}
                          onChange={e => setRouteDateStr(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/40"
                          autoFocus
                        />
                        <button
                          onClick={() => handleAddToRoute(p)}
                          disabled={addingToRouteId === p.id}
                          className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60"
                        >
                          {addingToRouteId === p.id ? "…" : "Add"}
                        </button>
                        <button
                          onClick={() => setRouteTargetId(null)}
                          className="px-2 py-1 text-xs text-muted-foreground border border-border rounded hover:bg-muted"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setRouteDateStr(new Date().toISOString().slice(0, 10)); setRouteTargetId(p.id); }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Route className="w-3 h-3" />
                        Add to Route Plan
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Prospect Profile Drawer */}
      <ProspectDrawer
        prospect={drawerProspect}
        open={drawerProspectId != null}
        onClose={() => setDrawerProspectId(null)}
        onUpdated={() => refetch()}
        scheduledAddressMap={scheduledAddressMap}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProspect ? "Edit Prospect" : "Log New Prospect"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => handleFormChange("address", e.target.value)}
                placeholder="123 Main St"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-foreground mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => handleFormChange("city", e.target.value)}
                  placeholder="Owensboro"
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => handleFormChange("state", e.target.value)}
                  placeholder="KY"
                  maxLength={2}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Zip</label>
                <input
                  type="text"
                  value={form.zip}
                  onChange={(e) => handleFormChange("zip", e.target.value)}
                  placeholder="42301"
                  maxLength={10}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Property Type</label>
                <select
                  value={form.propertyType}
                  onChange={(e) => handleFormChange("propertyType", e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => handleFormChange("status", e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Est. Square Footage</label>
                <input
                  type="number"
                  min="0"
                  value={form.estimatedSqft}
                  onChange={(e) => handleFormChange("estimatedSqft", e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Rough Quote ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.roughQuote}
                  onChange={(e) => handleFormChange("roughQuote", e.target.value)}
                  placeholder="e.g. 2500"
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Contact Name</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => handleFormChange("contactName", e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => handleFormChange("contactPhone", e.target.value)}
                  placeholder="(502) 555-0100"
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Link to Estimate (optional)</label>
              <select
                value={form.linkedEstimateId}
                onChange={(e) => handleFormChange("linkedEstimateId", e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">None</option>
                {(estimates as Estimate[]).map((est) => (
                  <option key={est.id} value={est.id}>{est.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => handleFormChange("notes", e.target.value)}
                placeholder="Property access details, owner info, follow-up notes…"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {isSaving ? "Saving…" : editingProspect ? "Save Changes" : "Log Prospect"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Delete Prospect?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.address}</span> from your pipeline.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirmed}
              disabled={isDeleting}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
