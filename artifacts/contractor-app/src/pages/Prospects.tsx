import { useState } from "react";
import {
  useListProspects,
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
  useConvertProspectToClient,
  useCreateProspectDepositLink,
  useListEstimates,
  type Prospect,
  type Estimate,
  type ProspectStatus,
  type ProspectPropertyType,
} from "@workspace/api-client-react";
import {
  Target, Plus, Edit2, Trash2, Phone, MapPin, DollarSign,
  Maximize2, Building2, CheckCircle2, AlertCircle, UserPlus,
  CreditCard, Copy, ExternalLink, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const PROPERTY_TYPES: ProspectPropertyType[] = ["Church", "Retail", "Apartment", "Industrial", "Other"];

const STATUS_OPTIONS: { value: ProspectStatus; label: string }[] = [
  { value: "cold", label: "Cold" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STATUS_BADGE: Record<ProspectStatus, { label: string; className: string }> = {
  cold: { label: "Cold", className: "bg-slate-100 text-slate-700 border-slate-200" },
  contacted: { label: "Contacted", className: "bg-blue-100 text-blue-700 border-blue-200" },
  quoted: { label: "Quoted", className: "bg-amber-100 text-amber-700 border-amber-200" },
  won: { label: "Won", className: "bg-green-100 text-green-700 border-green-200" },
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
];

type FormData = {
  address: string;
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

export default function Prospects() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prospect | null>(null);
  const [convertTarget, setConvertTarget] = useState<Prospect | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const { data: prospects = [], isLoading, refetch } = useListProspects();
  const { data: estimates = [] } = useListEstimates();
  const createMutation = useCreateProspect();
  const updateMutation = useUpdateProspect();
  const deleteMutation = useDeleteProspect();
  const convertMutation = useConvertProspectToClient();
  const depositLinkMutation = useCreateProspectDepositLink();
  const { toast } = useToast();

  const [depositLinkResult, setDepositLinkResult] = useState<{ url: string; address: string } | null>(null);
  const [generatingDepositId, setGeneratingDepositId] = useState<number | null>(null);

  async function handleRequestDeposit(p: Prospect) {
    setGeneratingDepositId(p.id);
    try {
      const result = await depositLinkMutation.mutateAsync({ id: p.id });
      setDepositLinkResult({ url: result.paymentLinkUrl, address: p.address });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create deposit link";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setGeneratingDepositId(null);
    }
  }

  const filtered = statusFilter
    ? prospects.filter((p) => p.status === statusFilter)
    : prospects;

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

  const handleConvertConfirmed = async () => {
    if (!convertTarget) return;
    setIsConverting(true);
    try {
      const client = await convertMutation.mutateAsync(convertTarget.id);
      toast({ title: `Converted to client: ${client.name}` });
      refetch();
    } catch {
      toast({ title: "Error converting to client", variant: "destructive" });
    } finally {
      setIsConverting(false);
      setConvertTarget(null);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Prospects</h1>
          <p className="text-muted-foreground mt-1">Commercial asphalt leads and pre-sale pipeline</p>
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
              <span className="ml-1.5 text-xs opacity-70">({prospects.length})</span>
            )}
            {opt.value !== "" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({prospects.filter((p) => p.status === opt.value).length})
              </span>
            )}
          </button>
        ))}
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
            return (
              <Card key={p.id} className="border border-border hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">{p.address}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
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
                  </div>

                  {p.linkedEstimateNumber && (
                    <div className="text-xs text-muted-foreground border-t border-border pt-2">
                      Estimate: <span className="font-medium text-foreground">{p.linkedEstimateNumber}</span>
                    </div>
                  )}

                  {p.notes && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-2">{p.notes}</p>
                  )}

                  {(p.roughQuote != null || p.stripePaymentLinkUrl) && (
                    <div className="border-t border-border pt-2 space-y-1.5">
                      {p.stripePaymentLinkUrl ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(p.stripePaymentLinkUrl!);
                              toast({ title: "Deposit link copied!" });
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 transition-colors"
                          >
                            <Copy className="w-3 h-3" /> Copy Deposit Link
                          </button>
                          <a
                            href={p.stripePaymentLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center px-2.5 py-1.5 border border-border rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRequestDeposit(p)}
                          disabled={generatingDepositId === p.id}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-60"
                        >
                          <CreditCard className="w-3 h-3" />
                          {generatingDepositId === p.id ? "Creating…" : "Request 50% Deposit"}
                        </button>
                      )}
                    </div>
                  )}

                  {p.status === "won" && (
                    <div className="border-t border-border pt-2">
                      <button
                        onClick={() => setConvertTarget(p)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Convert to Client
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProspect ? "Edit Prospect" : "Log New Prospect"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => handleFormChange("address", e.target.value)}
                placeholder="123 Main St, Louisville, KY"
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
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

      {/* Convert to Client confirmation */}
      <Dialog open={!!convertTarget} onOpenChange={(open) => { if (!open) setConvertTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Convert to Client?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            A new client record will be created from <span className="font-medium text-foreground">{convertTarget?.address}</span>. You can edit their full details from the Clients page.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setConvertTarget(null)}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConvertConfirmed}
              disabled={isConverting}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
            >
              {isConverting ? "Converting…" : "Convert to Client"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Deposit link result modal */}
      {depositLinkResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-400" />
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Deposit Link Ready</h3>
                  <p className="text-sm text-gray-500 truncate max-w-[240px]">{depositLinkResult.address}</p>
                </div>
                <button
                  onClick={() => setDepositLinkResult(null)}
                  className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs text-gray-500 mb-1 font-medium">Stripe Payment Link</p>
                <p className="text-sm text-gray-800 break-all font-mono">{depositLinkResult.url}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(depositLinkResult.url);
                    toast({ title: "Link copied!" });
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
                <a
                  href={depositLinkResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open
                </a>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Share this with the prospect to collect the deposit via Stripe.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
