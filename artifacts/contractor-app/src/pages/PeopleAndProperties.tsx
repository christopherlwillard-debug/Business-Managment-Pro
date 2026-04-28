import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListProspects,
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
  useProspectRevenueSummary,
  useConvertProspectToClient,
  type Prospect,
  type ProspectStatus,
  type ProspectPropertyType,
} from "@workspace/api-client-react";
import {
  useListClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
} from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { ProspectDrawer } from "@/components/ProspectDrawer";
import { AIProspectImportDialog } from "@/components/AIProspectImportDialog";
import { ClientProfileDrawer } from "@/components/ClientProfileDrawer";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useLocation } from "wouter";
import {
  Target, Plus, Edit2, Trash2, Phone, MapPin, DollarSign,
  Maximize2, Building2, CheckCircle2, AlertCircle, CreditCard,
  BadgeCheck, CalendarClock, Route, X, TrendingUp, UserCheck, Loader2,
  ListPlus, Search, Users, Mail, ChevronRight, Calendar, AlertTriangle,
  HardHat, Layers, Upload, LayoutList, LayoutGrid,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type BusinessLine = "asphalt" | "contracting" | "";
type TabKey = "prospects" | "clients";

const BUSINESS_LINES: { value: BusinessLine; label: string; shortLabel: string; color: string; badge: string }[] = [
  { value: "asphalt",     label: "Willard's Asphalt",     shortLabel: "Asphalt",     color: "bg-blue-600 text-white border-blue-600",   badge: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "contracting", label: "Willard's Contracting",  shortLabel: "Contracting", color: "bg-amber-600 text-white border-amber-600", badge: "bg-amber-100 text-amber-700 border-amber-200" },
];

function BusinessLineBadge({ line }: { line: string | null | undefined }) {
  const def = BUSINESS_LINES.find(b => b.value === line);
  if (def) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${def.badge}`}>
        {line === "asphalt" ? <HardHat className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
        {def.shortLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-500 border-gray-200">
      Untagged
    </span>
  );
}

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

const PROSPECT_FILTER_OPTIONS = [
  { value: "", label: "All" },
  ...STATUS_OPTIONS,
  { value: "due_for_resealing", label: "Due for Resealing" },
  { value: "follow_up_due", label: "Follow-up Due" },
];

function isFollowUpDue(followUpDate: string | null | undefined): boolean {
  if (!followUpDate) return false;
  const due = new Date(followUpDate);
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  return due <= in60;
}

function isDueForResealing(p: { status: ProspectStatus; followUpDate?: string | null }): boolean {
  if (p.status !== "serviced") return false;
  if (!p.followUpDate) return false;
  const due = new Date(p.followUpDate);
  const in90 = new Date();
  in90.setDate(in90.getDate() + 90);
  return due <= in90;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isDueSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const in90 = new Date();
  in90.setDate(in90.getDate() + 90);
  return d <= in90;
}

function buildFullAddress(p: Prospect): string {
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
}

function parseAddressParts(address: string): Record<string, string> {
  const params: Record<string, string> = {};
  const zipMatch = address.match(/\b(\d{5})\b/);
  if (zipMatch) params.postalcode = zipMatch[1];
  const parts = address.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return params;
  if (parts.length === 1) { params.street = parts[0]; return params; }
  params.street = parts[0];
  const stateMatch = address.match(/\b([A-Za-z]{2})\b(?=\s*(?:\d{5}|,|$))/);
  if (stateMatch) params.state = stateMatch[1].toUpperCase();
  if (parts.length >= 2) {
    let rawCity = parts[1];
    if (params.state) rawCity = rawCity.replace(new RegExp(`\\b${params.state}\\b`, "i"), "");
    if (params.postalcode) rawCity = rawCity.replace(params.postalcode, "");
    const city = rawCity.trim().replace(/,+$/, "").trim();
    if (city) params.city = city;
  }
  return params;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const qs = new URLSearchParams(parseAddressParts(address)).toString();
    const res = await fetch(`${BASE}/api/geocode?${qs}`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* geocoding failed */ }
  return null;
}

type ProspectForm = {
  address: string; city: string; state: string; zip: string;
  propertyType: string; estimatedSqft: string; roughQuote: string;
  contactName: string; contactPhone: string; notes: string;
  status: string; businessLine: BusinessLine;
};

const EMPTY_PROSPECT_FORM: ProspectForm = {
  address: "", city: "", state: "", zip: "", propertyType: "Other",
  estimatedSqft: "", roughQuote: "", contactName: "", contactPhone: "",
  notes: "", status: "cold", businessLine: "",
};

function prospectToForm(p: Prospect, defaultLine: BusinessLine): ProspectForm {
  return {
    address: p.address, city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "",
    propertyType: p.propertyType, estimatedSqft: p.estimatedSqft != null ? String(p.estimatedSqft) : "",
    roughQuote: p.roughQuote != null ? String(p.roughQuote) : "",
    contactName: p.contactName ?? "", contactPhone: p.contactPhone ?? "", notes: p.notes ?? "",
    status: p.status, businessLine: (p.businessLine as BusinessLine) ?? defaultLine,
  };
}

type RouteStop = { id: number; address: string; scheduledDate: string | null; status: string };

export default function PeopleAndProperties() {
  const { canEdit, canView, isOwner } = useUserPermissions();
  const [, navigate] = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const rawTab = (searchParams.get("tab") ?? (isOwner ? "prospects" : "clients")) as TabKey;
  const activeTab = (!isOwner && rawTab === "prospects") ? "clients" : rawTab;
  const activeLine = (searchParams.get("line") ?? "") as BusinessLine;
  const [searchQuery, setSearchQuery] = useState("");

  function setTab(tab: TabKey) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });
  }

  function setLine(line: BusinessLine) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (line) next.set("line", line); else next.delete("line");
      return next;
    }, { replace: true });
  }

  const { data: prospects = [], isLoading: prospectsLoading, refetch: refetchProspects } = useListProspects();
  const { data: clients, isLoading: clientsLoading, refetch: refetchClients } = useListClients();
  const { data: revenue, isLoading: revenueLoading } = useProspectRevenueSummary();

  const createProspect = useCreateProspect();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();
  const convertMutation = useConvertProspectToClient();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const [convertingId, setConvertingId] = useState<number | null>(null);

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
      if (!stop.scheduledDate || stop.status === "completed" || stop.status === "skipped") continue;
      const key = stop.address.trim().toLowerCase();
      const existing = map.get(key);
      if (!existing || stop.scheduledDate < existing) map.set(key, stop.scheduledDate);
    }
    return map;
  }, [routeStops]);

  const [prospectStatusFilter, setProspectStatusFilter] = useState<string>("");
  const cityFilter = searchParams.get("city") ?? "";
  function setCityFilter(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set("city", value); else next.delete("city");
      return next;
    }, { replace: true });
  }

  const [prospectSort, setProspectSort] = useState<"newest" | "az">("newest");
  const [clientDueFilter, setClientDueFilter] = useState(false);
  const [clientSort, setClientSort] = useState<"newest" | "az">("newest");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingClientId, setSyncingClientId] = useState<number | null>(null);
  const [clientViewMode, setClientViewMode] = useState<"list" | "card">(() => {
    try { return (localStorage.getItem("buildpro_client_view") as "list" | "card") || "list"; } catch { return "list"; }
  });

  function toggleClientView(mode: "list" | "card") {
    setClientViewMode(mode);
    try { localStorage.setItem("buildpro_client_view", mode); } catch { /* ignore */ }
  }

  const uniqueCities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of prospects) {
      const city = p.city?.trim();
      if (city) {
        const key = city.toLowerCase();
        if (!seen.has(key)) seen.set(key, city);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [prospects]);

  function matchesSearch(text: string) {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  }

  const filteredProspects = useMemo(() => {
    let list = prospects.filter(p => {
      if (activeLine && p.businessLine !== activeLine) return false;
      if (cityFilter && (p.city?.trim() ?? "").toLowerCase() !== cityFilter.toLowerCase()) return false;
      if (prospectStatusFilter === "follow_up_due" && !isFollowUpDue(p.followUpDate)) return false;
      if (prospectStatusFilter === "due_for_resealing" && !isDueForResealing(p)) return false;
      if (prospectStatusFilter && prospectStatusFilter !== "follow_up_due" && prospectStatusFilter !== "due_for_resealing" && p.status !== prospectStatusFilter) return false;
      if (!matchesSearch([p.address, p.city, p.contactName, p.contactPhone].filter(Boolean).join(" "))) return false;
      return true;
    });
    if (prospectSort === "az") list = [...list].sort((a, b) => a.address.localeCompare(b.address));
    else list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }, [prospects, activeLine, cityFilter, prospectStatusFilter, searchQuery, prospectSort]);

  const filteredClients = useMemo(() => {
    let list = (clients ?? []).filter((c: Client) => {
      if (activeLine) {
        if (c.businessLine !== activeLine) return false;
      } else {
        if (c.businessLine) return false;
      }
      if (clientDueFilter && !isDueSoon(c.nextServiceDate)) return false;
      if (!matchesSearch([c.name, c.address, c.city, c.phone, c.email].filter(Boolean).join(" "))) return false;
      return true;
    });
    if (clientSort === "az") list = [...list].sort((a, b) => (a.address ?? a.name ?? "").localeCompare(b.address ?? b.name ?? ""));
    else list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }, [clients, activeLine, clientDueFilter, clientSort, searchQuery]);

  const [drawerProspectId, setDrawerProspectId] = useState<number | null>(null);
  const drawerProspect = drawerProspectId != null ? (prospects.find(p => p.id === drawerProspectId) ?? null) : null;
  const [profileClientId, setProfileClientId] = useState<number | null>(null);

  useEffect(() => {
    const openId = searchParams.get("openProspect");
    if (!openId || prospects.length === 0) return;
    const id = parseInt(openId, 10);
    if (!isNaN(id)) {
      setDrawerProspectId(id);
      setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete("openProspect"); return n; }, { replace: true });
    }
  }, [searchParams, prospects]);

  const [routeTargetId, setRouteTargetId] = useState<number | null>(null);
  const [routeDateStr, setRouteDateStr] = useState(todayStr);
  const [addingToRouteId, setAddingToRouteId] = useState<number | null>(null);

  async function handleAddToRoute(p: Prospect, date?: string) {
    const effectiveDate = date ?? routeDateStr;
    setAddingToRouteId(p.id);
    try {
      const fullAddress = buildFullAddress(p);
      const coords = await geocodeAddress(fullAddress);
      const res = await fetch(`${BASE}/api/route-stops`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: p.contactName ?? p.address, address: fullAddress,
          scheduledDate: effectiveDate, status: "scheduled",
          prospectId: p.id, lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Added to Route Plan", description: `${p.address} scheduled for ${effectiveDate}.` });
      setRouteTargetId(null);
      queryClient.invalidateQueries({ queryKey: ["route-stops-upcoming"] });
      queryClient.invalidateQueries({ queryKey: ["/api/route-stops"] });
    } catch {
      toast({ title: "Failed to add to route", variant: "destructive" });
    } finally {
      setAddingToRouteId(null);
    }
  }

  async function handleConvertToClient(p: Prospect, e: React.MouseEvent) {
    e.stopPropagation();
    setConvertingId(p.id);
    try {
      const client = await convertMutation.mutateAsync(p.id);
      toast({ title: `${client.name} added to Clients`, description: "Prospect converted successfully" });
      refetchProspects();
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number } | null;
      if (e?.message?.includes("409") || e?.status === 409) {
        toast({ title: "Already converted", description: "This prospect is already linked to a client" });
      } else {
        toast({ title: "Conversion failed", variant: "destructive" });
      }
    } finally {
      setConvertingId(null);
    }
  }

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [prospectDialogOpen, setProspectDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [deleteProspectTarget, setDeleteProspectTarget] = useState<Prospect | null>(null);
  const [isDeletingProspect, setIsDeletingProspect] = useState(false);
  const [prospectForm, setProspectForm] = useState<ProspectForm>(EMPTY_PROSPECT_FORM);
  const [prospectFormLineError, setProspectFormLineError] = useState(false);

  function openCreateProspect(prefillAddress = "") {
    setEditingProspect(null);
    setProspectForm({ ...EMPTY_PROSPECT_FORM, address: prefillAddress, businessLine: activeLine });
    setProspectDialogOpen(true);
  }

  function openEditProspect(p: Prospect) {
    setEditingProspect(p);
    setProspectForm(prospectToForm(p, activeLine));
    setProspectDialogOpen(true);
  }

  function closeProspectDialog() {
    setProspectDialogOpen(false);
    setEditingProspect(null);
    setProspectForm(EMPTY_PROSPECT_FORM);
    setProspectFormLineError(false);
  }

  async function handleProspectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prospectForm.businessLine) {
      setProspectFormLineError(true);
      return;
    }
    setProspectFormLineError(false);
    const payload = {
      address: prospectForm.address, city: prospectForm.city || null,
      state: prospectForm.state || null, zip: prospectForm.zip || null,
      propertyType: prospectForm.propertyType as ProspectPropertyType,
      estimatedSqft: prospectForm.estimatedSqft ? parseInt(prospectForm.estimatedSqft) : null,
      roughQuote: prospectForm.roughQuote ? parseFloat(prospectForm.roughQuote) : null,
      contactName: prospectForm.contactName || null,
      contactPhone: prospectForm.contactPhone || null,
      notes: prospectForm.notes || null,
      status: prospectForm.status as ProspectStatus,
      businessLine: prospectForm.businessLine || null,
    };
    try {
      if (editingProspect) {
        await updateProspect.mutateAsync({ id: editingProspect.id, ...payload });
        toast({ title: "Prospect updated" });
      } else {
        await createProspect.mutateAsync(payload);
        toast({ title: "Prospect added" });
      }
      closeProspectDialog();
      refetchProspects();
    } catch (err: unknown) {
      let description = "Server temporarily unavailable — please try again";
      if (err && typeof err === "object" && "status" in err) {
        const status = (err as { status: number; data?: unknown }).status;
        const data = (err as { data?: unknown }).data;
        const serverMsg = data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error : null;
        description = status >= 400 && status < 500 ? (serverMsg ?? "Please check your input and try again") : description;
      }
      toast({ title: "Couldn't save prospect", description, variant: "destructive" });
    }
  }

  async function handleDeleteProspect() {
    if (!deleteProspectTarget) return;
    setIsDeletingProspect(true);
    try {
      await deleteProspect.mutateAsync(deleteProspectTarget.id);
      toast({ title: "Prospect deleted" });
      refetchProspects();
    } catch {
      toast({ title: "Error deleting prospect", variant: "destructive" });
    } finally {
      setIsDeletingProspect(false);
      setDeleteProspectTarget(null);
    }
  }

  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientPrefillAddress, setClientPrefillAddress] = useState("");
  const [clientDialogKey, setClientDialogKey] = useState(0);
  const [deleteClientTarget, setDeleteClientTarget] = useState<Client | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [clientFormLine, setClientFormLine] = useState<BusinessLine>("");
  const [clientFormLineError, setClientFormLineError] = useState(false);

  async function handleSyncClient(clientId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSyncingClientId(clientId);
    try {
      const res = await fetch(`${BASE}/api/square/customers/sync/${clientId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Failed to sync";
        try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
        toast({ title: msg, variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Client synced to Square" });
    } catch {
      toast({ title: "Network error syncing to Square", variant: "destructive" });
    } finally {
      setSyncingClientId(null);
    }
  }

  async function handleSyncAllToSquare() {
    setSyncingAll(true);
    try {
      const res = await fetch(`${BASE}/api/square/customers/sync-all`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Failed to sync clients to Square";
        try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* ignore */ }
        toast({ title: msg, variant: "destructive" });
        return;
      }
      const body = await res.json() as { synced: number; failed: number };
      toast({
        title: body.failed === 0
          ? `${body.synced} client${body.synced !== 1 ? "s" : ""} synced to Square`
          : `${body.synced} synced, ${body.failed} failed`,
      });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch {
      toast({ title: "Network error syncing to Square", variant: "destructive" });
    } finally {
      setSyncingAll(false);
    }
  }

  function openCreateClient(prefillAddress = "") {
    setEditingClient(null);
    setClientPrefillAddress(prefillAddress);
    setClientFormLine(activeLine);
    setClientFormLineError(false);
    setClientDialogKey(k => k + 1);
    setClientDialogOpen(true);
  }

  function openEditClient(c: Client, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingClient(c);
    setClientPrefillAddress("");
    setClientFormLine((c.businessLine as BusinessLine) ?? "");
    setClientFormLineError(false);
    setClientDialogKey(k => k + 1);
    setClientDialogOpen(true);
  }

  function closeClientDialog() {
    setClientDialogOpen(false);
    setEditingClient(null);
    setClientPrefillAddress("");
    setClientFormLineError(false);
  }

  async function handleClientSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientFormLine) {
      setClientFormLineError(true);
      return;
    }
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      email: formData.get("email") as string || null,
      phone: formData.get("phone") as string || null,
      address: formData.get("address") as string || null,
      city: formData.get("city") as string || null,
      state: formData.get("state") as string || null,
      zip: formData.get("zip") as string || null,
      notes: formData.get("notes") as string || null,
      businessLine: clientFormLine,
    };
    try {
      if (editingClient) {
        await updateClient.mutateAsync({ id: editingClient.id, data: payload });
      } else {
        await createClient.mutateAsync({ data: payload });
      }
      closeClientDialog();
      refetchClients();
    } catch (err) {
      console.error(err);
      toast({ title: "Couldn't save client", variant: "destructive" });
    }
  }

  async function handleDeleteClient() {
    if (!deleteClientTarget) return;
    setIsDeletingClient(true);
    try {
      await deleteClient.mutateAsync({ id: deleteClientTarget.id });
      refetchClients();
    } catch {
      toast({ title: "Error deleting client", variant: "destructive" });
    } finally {
      setIsDeletingClient(false);
      setDeleteClientTarget(null);
    }
  }

  const isSavingProspect = createProspect.isPending || updateProspect.isPending;
  const isSavingClient = createClient.isPending || updateClient.isPending;

  const searchHasText = searchQuery.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">People</h1>
          <p className="text-muted-foreground mt-1">All prospects and clients across your business lines</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "prospects" && canEdit("clients") && (
            <button
              onClick={() => setIsImportDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ListPlus className="w-4 h-4" />
              Import
            </button>
          )}
          <button
            onClick={() => activeTab === "prospects" ? openCreateProspect() : openCreateClient()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {activeTab === "prospects" ? "Log Prospect" : "Add Client"}
          </button>
        </div>
      </div>

      {/* Business Line Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setLine("")}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            activeLine === ""
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          {activeTab === "clients" ? "Unassigned" : "All Lines"}
        </button>
        {BUSINESS_LINES.map(bl => (
          <button
            key={bl.value}
            onClick={() => setLine(bl.value)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              activeLine === bl.value ? bl.color : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {bl.value === "asphalt" ? <HardHat className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
            {bl.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder={activeTab === "prospects" ? "Search by address, contact, or phone…" : "Search by name, address, or phone…"}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {searchHasText && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["prospects", "clients"] as TabKey[]).filter(tab => tab === "clients" || isOwner).map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
            <span className="ml-2 text-xs opacity-60">
              ({tab === "prospects" ? filteredProspects.length : filteredClients.length})
            </span>
          </button>
        ))}
      </div>

      {/* ───── PROSPECTS TAB ───── */}
      {activeTab === "prospects" && (
        <div className="space-y-4">
          {/* Revenue summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "This Month", value: revenue?.thisMonth ?? 0 },
              { label: "This Year", value: revenue?.thisYear ?? 0 },
              { label: "All Time", value: revenue?.allTime ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />{label}
                </span>
                {revenueLoading
                  ? <div className="h-7 w-20 bg-muted animate-pulse rounded mt-0.5" />
                  : <span className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{formatCurrency(value)}</span>
                }
              </div>
            ))}
          </div>

          {/* Prospect filters */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card transition-colors ${cityFilter ? "border-primary" : "border-border"}`}>
                <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <select
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  className="text-sm bg-transparent outline-none text-foreground cursor-pointer pr-1"
                >
                  <option value="">All cities</option>
                  {uniqueCities.map(city => <option key={city} value={city}>{city}</option>)}
                </select>
                {cityFilter && (
                  <button onClick={() => setCityFilter("")} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium ml-auto">
                <button onClick={() => setProspectSort("newest")} className={`px-3 py-1.5 transition-colors ${prospectSort === "newest" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}>Newest</button>
                <button onClick={() => setProspectSort("az")} className={`px-3 py-1.5 transition-colors ${prospectSort === "az" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}>A–Z</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {PROSPECT_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setProspectStatusFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    prospectStatusFilter === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                  {opt.value === "" && <span className="ml-1.5 text-xs opacity-70">({filteredProspects.length})</span>}
                  {opt.value === "follow_up_due" && <span className="ml-1.5 text-xs opacity-70">({filteredProspects.filter(p => isFollowUpDue(p.followUpDate)).length})</span>}
                  {opt.value === "due_for_resealing" && <span className="ml-1.5 text-xs opacity-70">({filteredProspects.filter(p => isDueForResealing(p)).length})</span>}
                  {opt.value !== "" && opt.value !== "follow_up_due" && opt.value !== "due_for_resealing" && (
                    <span className="ml-1.5 text-xs opacity-70">({filteredProspects.filter(p => p.status === opt.value).length})</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {prospectsLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading prospects…</div>
          ) : filteredProspects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Target className="w-10 h-10 opacity-30" />
              <p className="text-sm">
                {searchHasText ? `No prospects match "${searchQuery}"` : "No prospects found"}
              </p>
              {searchHasText && (
                <button
                  onClick={() => openCreateProspect(searchQuery)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add as new prospect
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProspects.map(p => {
                const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.cold;
                const propColor = PROPERTY_TYPE_COLORS[p.propertyType] ?? PROPERTY_TYPE_COLORS.Other;
                const fullAddr = buildFullAddress(p);
                const scheduledDate = scheduledAddressMap.get(fullAddr.trim().toLowerCase()) ?? null;
                return (
                  <Card key={p.id} className="border border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDrawerProspectId(p.id)}>
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
                          <button onClick={e => { e.stopPropagation(); openEditProspect(p); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDeleteProspectTarget(p); }} className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>{badge.label}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${propColor}`}>
                          <Building2 className="w-3 h-3" />{p.propertyType}
                        </span>
                        <BusinessLineBadge line={p.businessLine} />
                        {scheduledDate && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">
                            <Route className="w-3 h-3" />On Route {formatShortDate(scheduledDate)}
                          </span>
                        )}
                        {p.source === "stripe_payment" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-violet-100 text-violet-700 border-violet-200">
                            <BadgeCheck className="w-3 h-3" />Online Customer
                          </span>
                        )}
                        {isFollowUpDue(p.followUpDate) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-100 text-amber-700 border-amber-200">
                            <CalendarClock className="w-3 h-3" />Follow-up Due
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {p.estimatedSqft != null && <div className="flex items-center gap-1.5 text-muted-foreground"><Maximize2 className="w-3.5 h-3.5 flex-shrink-0" /><span>{p.estimatedSqft.toLocaleString()} sqft</span></div>}
                        {p.roughQuote != null && <div className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5 flex-shrink-0" /><span>{formatCurrency(p.roughQuote)}</span></div>}
                        {p.measuredSqFt != null && <div className="flex items-center gap-1.5 text-muted-foreground col-span-2"><Maximize2 className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" /><span className="text-blue-600 font-medium">{p.measuredSqFt.toLocaleString()} SF measured</span></div>}
                        {p.contactName && <div className="flex items-center gap-1.5 text-muted-foreground col-span-2"><span className="font-medium text-foreground">{p.contactName}</span></div>}
                        {p.contactPhone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5 flex-shrink-0" /><span>{p.contactPhone}</span></div>}
                        {p.lastPaidAt && <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 text-xs"><CreditCard className="w-3.5 h-3.5 flex-shrink-0 text-violet-500" /><span>Last paid: {formatDate(p.lastPaidAt)}</span></div>}
                        {p.status === "serviced" && p.servicedAt && <div className="flex items-center gap-1.5 col-span-2 text-xs text-indigo-700"><BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" /><span>Serviced on {formatDate(p.servicedAt)}</span></div>}
                        {p.followUpDate && <div className={`flex items-center gap-1.5 col-span-2 text-xs ${isDueForResealing(p) ? "text-indigo-700 font-medium" : isFollowUpDue(p.followUpDate) ? "text-amber-700" : "text-muted-foreground"}`}><CalendarClock className="w-3.5 h-3.5 flex-shrink-0" /><span>{p.status === "serviced" ? "Reseal due:" : "Follow-up:"} {formatDate(p.followUpDate)}</span></div>}
                      </div>
                      {p.linkedEstimateNumber && <div className="text-xs text-muted-foreground border-t border-border pt-2">Estimate: <span className="font-medium text-foreground">{p.linkedEstimateNumber}</span></div>}
                      {p.notes && <p className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-2">{p.notes}</p>}
                      {p.depositPaidAt && (
                        <div className="border-t border-border pt-2">
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-xs font-medium text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            Deposit Received{p.depositPaidAmount != null ? ` — $${p.depositPaidAmount.toFixed(2)}` : ""}
                          </div>
                        </div>
                      )}
                      {(p.status === "won" || p.status === "serviced") && (
                        <div className="border-t border-border pt-2">
                          {p.clientId ? (
                            <div className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-emerald-200 rounded text-xs font-medium text-emerald-700 bg-emerald-50 cursor-default select-none">
                              <UserCheck className="w-3 h-3" />Client Created
                            </div>
                          ) : (
                            <button onClick={e => handleConvertToClient(p, e)} disabled={convertingId === p.id} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-primary/40 rounded text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-60">
                              {convertingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                              {convertingId === p.id ? "Converting…" : "Convert to Client"}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="border-t border-border pt-2">
                        {scheduledDate ? (
                          <div className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-green-200 rounded text-xs font-medium text-green-700 bg-green-50 cursor-default select-none">
                            <Route className="w-3 h-3" />Already Scheduled — {formatShortDate(scheduledDate)}
                          </div>
                        ) : routeTargetId === p.id ? (
                          <div className="flex gap-1.5 items-center">
                            <input type="date" value={routeDateStr} onChange={e => setRouteDateStr(e.target.value)} className="flex-1 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/40" autoFocus />
                            <button onClick={() => handleAddToRoute(p)} disabled={addingToRouteId === p.id} className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-60">
                              {addingToRouteId === p.id ? "Locating…" : "Add"}
                            </button>
                            <button onClick={() => setRouteTargetId(null)} className="px-2 py-1 text-xs text-muted-foreground border border-border rounded hover:bg-muted">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setRouteDateStr(todayStr); setRouteTargetId(p.id); }} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Route className="w-3 h-3" />Add to Route Plan
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───── CLIENTS TAB ───── */}
      {activeTab === "clients" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setClientDueFilter(f => !f)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                clientDueFilter ? "bg-amber-500 text-white border-amber-500" : "bg-card text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1.5" />Due for service
            </button>
            <button
              onClick={handleSyncAllToSquare}
              disabled={syncingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-border bg-card text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60"
              title="Sync all clients to Square Customer Directory"
            >
              {syncingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Sync All to Square
            </button>
            <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium ml-auto">
              <button onClick={() => setClientSort("newest")} className={`px-3 py-1.5 transition-colors ${clientSort === "newest" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}>Newest</button>
              <button onClick={() => setClientSort("az")} className={`px-3 py-1.5 transition-colors ${clientSort === "az" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}>A–Z</button>
            </div>
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button onClick={() => toggleClientView("list")} title="List view" className={`p-1.5 transition-colors ${clientViewMode === "list" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}><LayoutList className="w-4 h-4" /></button>
              <button onClick={() => toggleClientView("card")} title="Card view" className={`p-1.5 transition-colors ${clientViewMode === "card" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted"}`}><LayoutGrid className="w-4 h-4" /></button>
            </div>
          </div>

          {(() => {
            const activeLineLabel = activeLine
              ? (BUSINESS_LINES.find(b => b.value === activeLine)?.shortLabel ?? activeLine)
              : "Unassigned";
            const emptyLabel = searchHasText
              ? `No clients match "${searchQuery}"`
              : `No ${activeLineLabel.toLowerCase()} clients`;

            if (clientsLoading) {
              return clientViewMode === "list" ? (
                <div className="space-y-1">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-card rounded-xl border border-border/50 animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => <div key={i} className="h-40 bg-card rounded-2xl border border-border/50 animate-pulse" />)}
                </div>
              );
            }

            if (filteredClients.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border-2 border-dashed border-border rounded-2xl bg-card/50">
                  <Users className="w-12 h-12 opacity-30 mx-auto" />
                  <p className="text-sm">{emptyLabel}</p>
                  {searchHasText && (
                    <button
                      onClick={() => openCreateClient(searchQuery)}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add as new client
                    </button>
                  )}
                </div>
              );
            }

            if (clientViewMode === "list") {
              return (
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  {filteredClients.map((client, idx) => {
                    const dueSoon = isDueSoon(client.nextServiceDate);
                    return (
                      <div
                        key={client.id}
                        onClick={() => setProfileClientId(client.id)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                          idx !== 0 && "border-t border-border/50"
                        )}
                      >
                        {/* Overdue dot */}
                        <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dueSoon ? "bg-amber-400" : "bg-transparent")} />

                        {/* Name */}
                        <span className="font-medium text-sm text-foreground truncate min-w-0 flex-1">{client.name}</span>

                        {/* Business line badge — hidden on small screens */}
                        <div className="hidden sm:block flex-shrink-0">
                          <BusinessLineBadge line={client.businessLine} />
                        </div>

                        {/* Phone */}
                        {client.phone ? (
                          <a
                            href={`tel:${client.phone}`}
                            onClick={e => e.stopPropagation()}
                            className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors flex-shrink-0 w-32"
                          >
                            <Phone className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{client.phone}</span>
                          </a>
                        ) : (
                          <span className="hidden md:block w-32 flex-shrink-0" />
                        )}

                        {/* City */}
                        {client.city ? (
                          <span className="hidden lg:block text-xs text-muted-foreground truncate flex-shrink-0 w-24">{client.city}</span>
                        ) : (
                          <span className="hidden lg:block w-24 flex-shrink-0" />
                        )}

                        {/* Next service */}
                        {client.nextServiceDate ? (
                          <span className={cn("hidden xl:block text-xs flex-shrink-0 w-24", dueSoon ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                            {formatDate(client.nextServiceDate)}
                          </span>
                        ) : (
                          <span className="hidden xl:block w-24 flex-shrink-0" />
                        )}

                        {/* Square sync dot */}
                        {client.squareCustomerId && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Synced to Square" />
                        )}

                        {/* Actions */}
                        <div className="flex gap-0.5 flex-shrink-0 ml-1">
                          <button
                            onClick={e => handleSyncClient(client.id, e)}
                            disabled={syncingClientId === client.id}
                            title={client.squareCustomerId ? "Re-sync to Square" : "Sync to Square"}
                            className={cn("p-1.5 rounded-lg transition-colors", client.squareCustomerId ? "text-emerald-600 hover:bg-emerald-50" : "text-muted-foreground hover:bg-muted")}
                          >
                            {syncingClientId === client.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={e => openEditClient(client, e)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); setDeleteClientTarget(client); }} className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredClients.map(client => {
                  const dueSoon = isDueSoon(client.nextServiceDate);
                  return (
                    <Card key={client.id} onClick={() => setProfileClientId(client.id)} className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-card overflow-hidden group cursor-pointer">
                      <div className={cn("h-2 transition-colors", dueSoon ? "bg-amber-400 group-hover:bg-amber-500" : "bg-primary/20 group-hover:bg-primary")} />
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-3 gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-xl font-bold font-display text-foreground truncate">{client.name}</h3>
                            {client.nextServiceDate && (
                              <p className={cn("text-xs mt-0.5 flex items-center gap-1", dueSoon ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                                <Calendar className="w-3 h-3" />Next service: {formatDate(client.nextServiceDate)}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={e => handleSyncClient(client.id, e)}
                              disabled={syncingClientId === client.id}
                              title={client.squareCustomerId ? "Re-sync to Square" : "Sync to Square Customer Directory"}
                              className={cn(
                                "p-2 rounded-lg transition-colors",
                                client.squareCustomerId
                                  ? "text-emerald-600 hover:bg-emerald-50"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              {syncingClientId === client.id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Upload className="w-4 h-4" />}
                            </button>
                            <button onClick={e => openEditClient(client, e)} className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" title="Edit client">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDeleteClientTarget(client); }} className="p-2 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete client">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mb-3 flex items-center gap-2 flex-wrap">
                          <BusinessLineBadge line={client.businessLine} />
                          {client.squareCustomerId && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              <Upload className="w-3 h-3" /> Square
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {client.phone && <div className="flex items-center text-sm text-muted-foreground"><Phone className="w-4 h-4 mr-3 text-primary/60" />{client.phone}</div>}
                          {client.email && <div className="flex items-center text-sm text-muted-foreground truncate"><Mail className="w-4 h-4 mr-3 text-primary/60 flex-shrink-0" /><span className="truncate">{client.email}</span></div>}
                          {(client.address || client.city || client.state || client.zip) && (
                            <div className="flex items-start text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4 mr-3 mt-0.5 text-primary/60 flex-shrink-0" />
                              <span className="line-clamp-2">
                                {client.address && <>{client.address}<br /></>}
                                {[client.city, client.state, client.zip].filter(Boolean).join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 flex items-center text-xs text-primary/60 group-hover:text-primary transition-colors font-medium">
                          View profile <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Drawers ── */}
      <ProspectDrawer
        prospect={drawerProspect}
        open={drawerProspectId != null}
        onClose={() => setDrawerProspectId(null)}
        onUpdated={() => refetchProspects()}
        scheduledAddressMap={scheduledAddressMap}
        onAddToRoute={handleAddToRoute}
      />
      {profileClientId !== null && (
        <ClientProfileDrawer
          clientId={profileClientId}
          onClose={() => setProfileClientId(null)}
          onAddToRoute={id => { setProfileClientId(null); navigate(`${BASE}/route-planner?clientId=${id}`); }}
        />
      )}

      {/* ── AI Import ── */}
      {canEdit("clients") && (
        <AIProspectImportDialog
          open={isImportDialogOpen}
          onClose={() => setIsImportDialogOpen(false)}
          onImported={() => refetchProspects()}
        />
      )}

      {/* ── Prospect Create/Edit Dialog ── */}
      <Dialog open={prospectDialogOpen} onOpenChange={open => { if (!open) closeProspectDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProspect ? "Edit Prospect" : "Log New Prospect"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProspectSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Business Line <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {BUSINESS_LINES.map(bl => (
                  <button
                    key={bl.value}
                    type="button"
                    onClick={() => { setProspectForm(f => ({ ...f, businessLine: bl.value })); setProspectFormLineError(false); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      prospectForm.businessLine === bl.value ? bl.color : "bg-card text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {bl.value === "asphalt" ? <HardHat className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                    {bl.shortLabel}
                  </button>
                ))}
              </div>
              {prospectFormLineError && <p className="text-xs text-red-500 mt-1">Please select a business line</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Street Address <span className="text-red-500">*</span></label>
              <input type="text" required value={prospectForm.address} onChange={e => setProspectForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-sm font-medium text-foreground mb-1">City</label>
                <input type="text" value={prospectForm.city} onChange={e => setProspectForm(f => ({ ...f, city: e.target.value }))} placeholder="Owensboro" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">State</label>
                <input type="text" value={prospectForm.state} onChange={e => setProspectForm(f => ({ ...f, state: e.target.value }))} placeholder="KY" maxLength={2} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 uppercase" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Zip</label>
                <input type="text" value={prospectForm.zip} onChange={e => setProspectForm(f => ({ ...f, zip: e.target.value }))} placeholder="42301" maxLength={10} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Property Type</label>
                <select value={prospectForm.propertyType} onChange={e => setProspectForm(f => ({ ...f, propertyType: e.target.value }))} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Status</label>
                <select value={prospectForm.status} onChange={e => setProspectForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Est. Square Footage</label>
                <input type="number" min="0" value={prospectForm.estimatedSqft} onChange={e => setProspectForm(f => ({ ...f, estimatedSqft: e.target.value }))} placeholder="e.g. 5000" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Rough Quote ($)</label>
                <input type="number" min="0" step="0.01" value={prospectForm.roughQuote} onChange={e => setProspectForm(f => ({ ...f, roughQuote: e.target.value }))} placeholder="e.g. 2500" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Contact Name</label>
                <input type="text" value={prospectForm.contactName} onChange={e => setProspectForm(f => ({ ...f, contactName: e.target.value }))} placeholder="John Smith" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Contact Phone</label>
                <input type="tel" value={prospectForm.contactPhone} onChange={e => setProspectForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="(502) 555-0100" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
              <textarea rows={3} value={prospectForm.notes} onChange={e => setProspectForm(f => ({ ...f, notes: e.target.value }))} placeholder="Property access details, owner info, follow-up notes…" className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={closeProspectDialog} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={isSavingProspect} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
                {isSavingProspect ? "Saving…" : editingProspect ? "Save Changes" : "Log Prospect"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Prospect Delete Dialog ── */}
      <Dialog open={!!deleteProspectTarget} onOpenChange={open => { if (!open) setDeleteProspectTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />Delete Prospect?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            This will permanently remove <span className="font-medium text-foreground">{deleteProspectTarget?.address}</span> from your pipeline.
          </p>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setDeleteProspectTarget(null)} disabled={isDeletingProspect} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60">Cancel</button>
            <button onClick={handleDeleteProspect} disabled={isDeletingProspect} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
              {isDeletingProspect ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Client Create/Edit Dialog ── */}
      <Dialog open={clientDialogOpen} onOpenChange={open => { if (!open) closeClientDialog(); }}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">{editingClient ? "Edit Client" : "Add Client"}</DialogTitle>
          </DialogHeader>
          <form key={clientDialogKey} onSubmit={handleClientSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Business Line <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {BUSINESS_LINES.map(bl => (
                  <button key={bl.value} type="button" onClick={() => { setClientFormLine(bl.value); setClientFormLineError(false); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${clientFormLine === bl.value ? bl.color : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
                    {bl.value === "asphalt" ? <HardHat className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                    {bl.shortLabel}
                  </button>
                ))}
              </div>
              {clientFormLineError && <p className="text-xs text-red-500 mt-1">Please select a business line</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Name / Company *</label>
              <input name="name" required defaultValue={editingClient?.name || ""} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input name="email" type="email" defaultValue={editingClient?.email || ""} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input name="phone" defaultValue={editingClient?.phone || ""} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input name="address" defaultValue={editingClient?.address || clientPrefillAddress} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 mb-3" placeholder="Street" />
              <div className="grid grid-cols-5 gap-2">
                <input name="city" defaultValue={editingClient?.city || ""} className="col-span-2 px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="City" />
                <input name="state" defaultValue={editingClient?.state || ""} maxLength={2} className="col-span-1 px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 uppercase" placeholder="ST" />
                <input name="zip" defaultValue={editingClient?.zip || ""} className="col-span-2 px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="Zip" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea name="notes" defaultValue={editingClient?.notes || ""} className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 resize-none" rows={3} placeholder="Additional notes…" />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={closeClientDialog} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={isSavingClient} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {isSavingClient ? "Saving..." : "Save Client"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Client Delete Dialog ── */}
      {deleteClientTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteClientTarget(null)} />
          <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">Permanently delete client?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-semibold text-foreground">{deleteClientTarget.name}</span> will be{" "}
                  <span className="font-semibold text-red-600">permanently deleted</span> and cannot be recovered.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteClientTarget(null)} disabled={isDeletingClient} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteClient} disabled={isDeletingClient} className="px-4 py-2 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {isDeletingClient ? "Deleting…" : <><Trash2 className="w-4 h-4" />Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
