import { useState, useMemo } from "react";
import {
  Home, ChevronRight, BarChart2, Briefcase,
  Plus, Trash2, ArrowLeft, TrendingUp, Users, Pencil,
  BookOpen, ChevronDown, ChevronUp, ArrowUpDown, Brain,
} from "lucide-react";
import {
  useMfhKnowledgeBase,
  useMfhModelDetail,
  useSetMfhClientPrice,
  useUpdateMfhClientPrice,
  useDeleteMfhClientPrice,
  useUpdateMfhModel,
  useListClients,
  usePatchKnowledgeRecord,
  type MfhKnowledgeBaseEntry,
  type MfhKbRecord,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

function fmt(n: number | string | null | undefined, style: "currency" | "decimal" = "currency") {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(v)) return "—";
  if (style === "currency") return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

const CT_COLORS: Record<string, string> = {
  VOG: "bg-blue-100 text-blue-700",
  Hybrid: "bg-purple-100 text-purple-700",
  Drywall: "bg-emerald-100 text-emerald-700",
};
function ctBadge(name: string | null | undefined) {
  const cls = (name && CT_COLORS[name]) ?? "bg-slate-100 text-slate-600";
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{name ?? "—"}</span>;
}

// ── Stat Tile ─────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/30 rounded-xl p-3 text-center">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-bold text-foreground text-base leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Model Card (list) ─────────────────────────────────────────────────────────
function ModelCard({ model, onClick }: { model: MfhKnowledgeBaseEntry; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-2xl p-4 hover:border-amber-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground text-sm">{model.name}</h3>
            {ctBadge(model.constructionTypeName)}
            {!model.active && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
            )}
          </div>
          {model.manufacturerName && (
            <p className="text-xs text-muted-foreground mt-0.5">{model.manufacturerName}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 flex-shrink-0 mt-0.5 transition-colors" />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Jobs</p>
          <p className="font-bold text-sm text-foreground">{model.jobCount}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Avg Invoice</p>
          <p className="font-bold text-sm text-amber-600">{fmt(model.avgInvoice)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Avg Prod. Hrs</p>
          <p className="font-bold text-sm text-foreground">{model.avgProductiveHours != null ? fmt(model.avgProductiveHours, "decimal") : "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Baseline</p>
          <p className="font-bold text-sm text-foreground">{model.basePrice ? fmt(model.basePrice) : "—"}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {model.acceptedCount > 0 ? (
          <p className="text-[10px] text-amber-600 font-medium">Based on {model.acceptedCount} accepted job{model.acceptedCount !== 1 ? "s" : ""}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">No KB data yet</p>
        )}
        {model.notes && (
          <p className="text-xs text-muted-foreground line-clamp-1 italic flex-1 ml-2 text-right">{model.notes}</p>
        )}
      </div>
    </button>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function ModelDetail({ modelId, onClose }: { modelId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const patchKbRecord = usePatchKnowledgeRecord();
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);
  const [showBasis, setShowBasis] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editRecordForm, setEditRecordForm] = useState({
    productiveHours: "", travelHours: "", crewSize: "", daysOnSite: "",
    invoiceAmount: "", materialCost: "", consumablesCost: "",
    grossProfit: "", netProfit: "", callbacks: "0",
    warrantyVisit: false, missingMaterialsNotes: "", factoryDefectNotes: "", editReason: "",
  });

  function startEditRecord(r: MfhKbRecord) {
    setEditingRecordId(r.id);
    setEditRecordForm({
      productiveHours: r.productiveHours ? parseFloat(r.productiveHours).toString() : "",
      travelHours: r.travelHours ? parseFloat(r.travelHours).toString() : "",
      crewSize: r.crewSize != null ? String(r.crewSize) : "",
      daysOnSite: r.daysOnSite != null ? String(r.daysOnSite) : "",
      invoiceAmount: r.invoiceAmount ? parseFloat(r.invoiceAmount).toString() : "",
      materialCost: r.materialCost ? parseFloat(r.materialCost).toString() : "",
      consumablesCost: r.consumablesCost ? parseFloat(r.consumablesCost).toString() : "",
      grossProfit: r.grossProfit ? parseFloat(r.grossProfit).toString() : "",
      netProfit: r.netProfit ? parseFloat(r.netProfit).toString() : "",
      callbacks: String(r.callbacks ?? 0),
      warrantyVisit: r.warrantyVisit ?? false,
      missingMaterialsNotes: r.missingMaterialsNotes ?? "",
      factoryDefectNotes: r.factoryDefectNotes ?? "",
      editReason: "",
    });
  }

  async function handleSaveRecord(r: MfhKbRecord) {
    try {
      await patchKbRecord.mutateAsync({
        jobId: r.jobId,
        productiveHours: editRecordForm.productiveHours ? parseFloat(editRecordForm.productiveHours) : undefined,
        travelHours: editRecordForm.travelHours ? parseFloat(editRecordForm.travelHours) : undefined,
        crewSize: editRecordForm.crewSize ? parseInt(editRecordForm.crewSize) : undefined,
        daysOnSite: editRecordForm.daysOnSite ? parseInt(editRecordForm.daysOnSite) : undefined,
        invoiceAmount: editRecordForm.invoiceAmount ? parseFloat(editRecordForm.invoiceAmount) : undefined,
        materialCost: editRecordForm.materialCost ? parseFloat(editRecordForm.materialCost) : undefined,
        consumablesCost: editRecordForm.consumablesCost ? parseFloat(editRecordForm.consumablesCost) : undefined,
        grossProfit: editRecordForm.grossProfit ? parseFloat(editRecordForm.grossProfit) : undefined,
        netProfit: editRecordForm.netProfit ? parseFloat(editRecordForm.netProfit) : undefined,
        callbacks: parseInt(editRecordForm.callbacks) || 0,
        warrantyVisit: editRecordForm.warrantyVisit,
        missingMaterialsNotes: editRecordForm.missingMaterialsNotes || null,
        factoryDefectNotes: editRecordForm.factoryDefectNotes || null,
        editReason: editRecordForm.editReason || null,
      });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base", modelId] });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
      setEditingRecordId(null);
      toast({ title: "Record updated" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }
  const { data, isLoading } = useMfhModelDetail(modelId);
  const { data: clients = [] } = useListClients();
  const setPrice = useSetMfhClientPrice();
  const updatePrice = useUpdateMfhClientPrice();
  const deletePrice = useDeleteMfhClientPrice();
  const updateModel = useUpdateMfhModel();

  const [addingClient, setAddingClient] = useState(false);
  const [clientForm, setClientForm] = useState({ clientId: "", price: "", notes: "" });
  const [expandedJobs, setExpandedJobs] = useState(false);
  const [editingCp, setEditingCp] = useState<{ id: number; price: string; notes: string } | null>(null);

  const [editingBaseline, setEditingBaseline] = useState(false);
  const [baselineVal, setBaselineVal] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const { model, jobs, clientPricing, knowledgeRecords = [] } = data;
  const margin = model.avgInvoice != null && model.avgDealerPrice != null
    ? model.avgInvoice - model.avgDealerPrice
    : null;

  const jobsToShow = expandedJobs ? jobs : jobs.slice(0, 5);

  async function handleAddClientPrice() {
    if (!clientForm.clientId || !clientForm.price) return;
    try {
      await setPrice.mutateAsync({
        modelId,
        clientId: parseInt(clientForm.clientId),
        price: parseFloat(clientForm.price),
        notes: clientForm.notes || undefined,
      });
      setClientForm({ clientId: "", price: "", notes: "" });
      setAddingClient(false);
      toast({ title: "Client price saved" });
    } catch {
      toast({ title: "Failed to save price", variant: "destructive" });
    }
  }

  async function handleUpdateClientPrice() {
    if (!editingCp || !editingCp.price) return;
    try {
      await updatePrice.mutateAsync({ id: editingCp.id, modelId, price: parseFloat(editingCp.price), notes: editingCp.notes || undefined });
      setEditingCp(null);
      toast({ title: "Client price updated" });
    } catch {
      toast({ title: "Failed to update price", variant: "destructive" });
    }
  }

  async function handleDeleteClientPrice(id: number) {
    try {
      await deletePrice.mutateAsync({ id, modelId });
      toast({ title: "Removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  }

  async function handleSaveBaseline() {
    try {
      const price = parseFloat(baselineVal);
      await updateModel.mutateAsync({ id: modelId, basePrice: isNaN(price) ? null : String(price) });
      qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
      setEditingBaseline(false);
      toast({ title: "Baseline price saved" });
    } catch {
      toast({ title: "Failed to save baseline", variant: "destructive" });
    }
  }

  const usedClientIds = new Set(clientPricing.map(c => c.clientId));
  const availableClients = clients.filter(c => !usedClientIds.has(c.id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors flex-shrink-0 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-foreground text-lg">{model.name}</h2>
            {ctBadge(model.constructionTypeName)}
            {!model.active && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>}
          </div>
          {model.manufacturerName && <p className="text-sm text-muted-foreground">{model.manufacturerName}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="KB Jobs" value={String(model.jobCount)} />
        <StatTile label="Avg Invoice (KB)" value={fmt(model.avgInvoice)} />
        <StatTile label="Avg Prod. Hours" value={model.avgProductiveHours != null ? `${fmt(model.avgProductiveHours, "decimal")} hrs` : model.avgHours != null ? `${fmt(model.avgHours, "decimal")} hrs` : "—"} />
        <StatTile label="Avg Margin" value={margin != null ? fmt(margin) : "—"} sub={margin != null && model.avgDealerPrice ? `dealer ${fmt(model.avgDealerPrice)}` : undefined} />
      </div>
      {model.acceptedCount > 0 ? (
        <p className="text-xs text-amber-600 font-medium -mt-1">Based on {model.acceptedCount} accepted job{model.acceptedCount !== 1 ? "s" : ""}</p>
      ) : (
        <p className="text-xs text-muted-foreground/60 -mt-1">No accepted KB records yet</p>
      )}

      {/* Baseline price */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <p className="font-semibold text-foreground text-sm">Clayton Baseline Price</p>
          </div>
          {!editingBaseline && (
            <button onClick={() => { setBaselineVal(model.basePrice ?? ""); setEditingBaseline(true); }}
              className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-amber-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editingBaseline ? (
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <input
                autoFocus
                type="number"
                className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background text-sm"
                placeholder="e.g. 1500"
                value={baselineVal}
                onChange={e => setBaselineVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveBaseline(); if (e.key === "Escape") setEditingBaseline(false); }}
              />
            </div>
            <button onClick={handleSaveBaseline} disabled={updateModel.isPending}
              className="px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {updateModel.isPending ? "…" : "Save"}
            </button>
            <button onClick={() => setEditingBaseline(false)}
              className="px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <p className="text-2xl font-bold text-foreground">
            {model.basePrice ? fmt(model.basePrice) : <span className="text-muted-foreground text-sm">Not set — click edit to add</span>}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Standard Clayton trim-out price used as the starting point for quotes on this model.</p>
      </div>

      {/* Notes */}
      {model.notes && (
        <div className="bg-muted/20 border border-border rounded-xl p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{model.notes}</p>
        </div>
      )}

      {/* Client pricing */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-500" />
            <p className="font-semibold text-foreground text-sm">Client-Specific Prices</p>
            {clientPricing.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{clientPricing.length}</span>
            )}
          </div>
          {!addingClient && (
            <button onClick={() => setAddingClient(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors">
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>

        {addingClient && (
          <div className="px-4 py-3 border-b border-border bg-amber-50/30 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground">Client</label>
                <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                  value={clientForm.clientId} onChange={e => setClientForm(f => ({ ...f, clientId: e.target.value }))}>
                  <option value="">Select client…</option>
                  {availableClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground">Price</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <input type="number" className="w-full pl-5 pr-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                    placeholder="e.g. 1400" value={clientForm.price} onChange={e => setClientForm(f => ({ ...f, price: e.target.value }))} />
                </div>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground">Notes (optional)</label>
              <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                placeholder="e.g. Volume discount" value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAddingClient(false); setClientForm({ clientId: "", price: "", notes: "" }); }}
                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">Cancel</button>
              <button onClick={handleAddClientPrice} disabled={!clientForm.clientId || !clientForm.price || setPrice.isPending}
                className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50">
                {setPrice.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {clientPricing.length === 0 && !addingClient ? (
          <div className="px-4 py-5 text-center">
            <Users className="w-7 h-7 text-muted-foreground/30 mx-auto mb-1.5" />
            <p className="text-xs text-muted-foreground">No client-specific prices yet.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border/50">
              {clientPricing.map(cp => (
                editingCp?.id === cp.id ? (
                  <tr key={cp.id} className="bg-amber-50/30">
                    <td className="px-4 py-2.5 font-medium text-foreground">{cp.clientName ?? "Unknown Client"}</td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <input autoFocus type="number" className="w-24 pl-5 pr-2 py-1 rounded-lg border border-amber-300 bg-background text-xs"
                          value={editingCp.price} onChange={e => setEditingCp(prev => prev ? { ...prev, price: e.target.value } : null)} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input className="w-full px-2 py-1 rounded-lg border border-border bg-background text-xs" placeholder="Notes…"
                        value={editingCp.notes} onChange={e => setEditingCp(prev => prev ? { ...prev, notes: e.target.value } : null)} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={handleUpdateClientPrice} disabled={updatePrice.isPending}
                        className="px-2 py-1 rounded bg-amber-500 text-white text-[10px] font-semibold hover:bg-amber-600 mr-1 disabled:opacity-50">
                        {updatePrice.isPending ? "…" : "Save"}
                      </button>
                      <button onClick={() => setEditingCp(null)} className="px-2 py-1 rounded border border-border text-[10px] text-muted-foreground hover:bg-muted/50">Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={cp.id} className="hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-medium text-foreground">{cp.clientName ?? "Unknown Client"}</td>
                    <td className="px-4 py-2.5 text-amber-600 font-semibold">{fmt(cp.price)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground italic">{cp.notes ?? ""}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditingCp({ id: cp.id, price: cp.price, notes: cp.notes ?? "" })}
                          className="p-1 rounded hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeleteClientPrice(cp.id)}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Learning History */}
      {knowledgeRecords.length > 0 && (() => {
        const accepted = (knowledgeRecords as MfhKbRecord[]).filter(r => r.status === "accepted");
        const excluded = (knowledgeRecords as MfhKbRecord[]).filter(r => r.status === "excluded");

        async function toggleStatus(r: MfhKbRecord) {
          const newStatus = r.status === "accepted" ? "excluded" : "accepted";
          try {
            await patchKbRecord.mutateAsync({ jobId: r.jobId, status: newStatus });
            qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base", modelId] });
            qc.invalidateQueries({ queryKey: ["/api/mfh/knowledge-base"] });
            toast({ title: newStatus === "accepted" ? "Record included in averages" : "Record excluded from averages" });
          } catch {
            toast({ title: "Failed to update", variant: "destructive" });
          }
        }

        return (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Brain className="w-4 h-4 text-amber-500" />
              <p className="font-semibold text-foreground text-sm">Learning History</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{accepted.length} taught</span>
              {excluded.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{excluded.length} excluded</span>
              )}
            </div>

            {/* Averages summary with "Why?" expandable */}
            {accepted.length > 0 && (
              <div className="border-b border-border bg-amber-50/40">
                <div className="px-4 py-2.5">
                  <div className="grid grid-cols-4 gap-2 mb-1.5">
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600">Avg Prod. Hrs</p>
                      <p className="font-bold text-xs text-amber-700">{model.avgProductiveHours != null ? model.avgProductiveHours.toFixed(1) : "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600">Avg Invoice</p>
                      <p className="font-bold text-xs text-amber-700">{fmt(model.avgInvoice)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600">Avg Net Profit</p>
                      <p className="font-bold text-xs text-amber-700">{fmt(model.avgNetProfit)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-amber-600">Avg Crew</p>
                      <p className="font-bold text-xs text-amber-700">{model.avgCrewSize != null ? model.avgCrewSize.toFixed(1) : "—"}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowBasis(b => !b)}
                    className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 font-semibold transition-colors">
                    {showBasis ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Why these averages? ({accepted.length} job{accepted.length !== 1 ? "s" : ""})
                  </button>
                  {showBasis && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-white overflow-hidden">
                      <table className="w-full text-[10px]">
                        <thead className="bg-amber-50">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-semibold text-amber-700">Job</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-amber-700">Prod. Hrs</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-amber-700">Invoice</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-amber-700">Net Profit</th>
                            <th className="text-right px-2 py-1.5 font-semibold text-amber-700">Crew</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {accepted.map(r => (
                            <tr key={r.id} className="hover:bg-amber-50/50">
                              <td className="px-2 py-1.5 text-foreground font-medium truncate max-w-[90px]">{r.jobTitle}</td>
                              <td className="px-2 py-1.5 text-right text-foreground">{r.productiveHours ? parseFloat(r.productiveHours).toFixed(1) : "—"}</td>
                              <td className="px-2 py-1.5 text-right text-amber-600">{r.invoiceAmount ? fmt(parseFloat(r.invoiceAmount)) : "—"}</td>
                              <td className="px-2 py-1.5 text-right text-foreground">{r.netProfit ? fmt(parseFloat(r.netProfit)) : "—"}</td>
                              <td className="px-2 py-1.5 text-right text-foreground">{r.crewSize ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Individual records */}
            <div className="divide-y divide-border/50">
              {(knowledgeRecords as MfhKbRecord[]).map(r => {
                const isExpanded = expandedRecordId === r.id;
                return (
                  <div key={r.id} className="text-xs">
                    {/* Row header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/10 cursor-pointer"
                      onClick={() => setExpandedRecordId(isExpanded ? null : r.id)}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleStatus(r); }}
                        disabled={patchKbRecord.isPending}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors cursor-pointer hover:opacity-80 disabled:opacity-50 ${r.status === "accepted" ? "bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600" : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"}`}
                        title={r.status === "accepted" ? "Click to exclude from averages" : "Click to include in averages"}
                      >
                        {r.status === "accepted" ? "Taught" : "Excluded"}
                      </button>
                      <span className="font-medium text-foreground flex-1 truncate">{r.jobTitle}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {r.taughtAt && <span className="text-[10px] text-muted-foreground">{fmtDate(new Date(r.taughtAt).toISOString().split("T")[0])}</span>}
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Collapsed preview */}
                    {!isExpanded && (
                      <div className="grid grid-cols-4 gap-2 px-4 pb-2.5 text-center">
                        <div><p className="text-[10px] text-muted-foreground">Prod. Hrs</p><p className="font-semibold text-foreground">{r.productiveHours ? parseFloat(r.productiveHours).toFixed(1) : "—"}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Crew</p><p className="font-semibold text-foreground">{r.crewSize ?? "—"}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Invoice</p><p className="font-semibold text-amber-600">{r.invoiceAmount ? fmt(parseFloat(r.invoiceAmount)) : "—"}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Net Profit</p><p className="font-semibold text-foreground">{r.netProfit ? fmt(parseFloat(r.netProfit)) : "—"}</p></div>
                      </div>
                    )}

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-2 bg-muted/5 border-t border-border/50">
                        {editingRecordId === r.id ? (
                          /* ── Edit Form ── */
                          <div className="space-y-3 pt-2">
                            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Edit Record Fields</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: "Prod. Hrs", key: "productiveHours" as const, type: "number" },
                                { label: "Travel Hrs", key: "travelHours" as const, type: "number" },
                                { label: "Crew Size", key: "crewSize" as const, type: "number" },
                                { label: "Days On-Site", key: "daysOnSite" as const, type: "number" },
                                { label: "Invoice Amount", key: "invoiceAmount" as const, type: "number" },
                                { label: "Material Cost", key: "materialCost" as const, type: "number" },
                                { label: "Consumables", key: "consumablesCost" as const, type: "number" },
                                { label: "Gross Profit", key: "grossProfit" as const, type: "number" },
                                { label: "Net Profit", key: "netProfit" as const, type: "number" },
                                { label: "Callbacks", key: "callbacks" as const, type: "number" },
                              ].map(({ label, key, type }) => {
                                const orig = r.originalValues?.[key];
                                const curr = editRecordForm[key];
                                const changed = orig != null && curr !== "" && Math.abs(parseFloat(String(curr)) - parseFloat(String(orig))) > 0.01;
                                return (
                                  <div key={key}>
                                    <div className="flex items-center gap-1 mb-0.5">
                                      <label className="text-[10px] font-semibold text-muted-foreground">{label}</label>
                                      {orig != null && changed && <span className="text-[9px] text-amber-600 font-semibold">✏️ edited</span>}
                                      {orig != null && !changed && <span className="text-[9px] text-blue-500 font-semibold">auto</span>}
                                    </div>
                                    <input
                                      type={type}
                                      step="any"
                                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background"
                                      value={editRecordForm[key] as string}
                                      onChange={e => setEditRecordForm(f => ({ ...f, [key]: e.target.value }))}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2">
                              <input type="checkbox" id={`kb-warranty-${r.id}`} className="rounded"
                                checked={editRecordForm.warrantyVisit}
                                onChange={e => setEditRecordForm(f => ({ ...f, warrantyVisit: e.target.checked }))} />
                              <label htmlFor={`kb-warranty-${r.id}`} className="text-xs text-foreground">Warranty visit needed</label>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground">Edit Reason (optional)</label>
                              <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background mt-0.5"
                                placeholder="Why are these values being changed?"
                                value={editRecordForm.editReason}
                                onChange={e => setEditRecordForm(f => ({ ...f, editReason: e.target.value }))} />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => setEditingRecordId(null)}
                                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">Cancel</button>
                              <button onClick={() => handleSaveRecord(r)} disabled={patchKbRecord.isPending}
                                className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50">
                                {patchKbRecord.isPending ? "Saving…" : "Save Changes"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read-only view ── */
                          <>
                            <div className="grid grid-cols-3 gap-2 pt-2">
                              <div><p className="text-[10px] text-muted-foreground">Prod. Hrs</p><p className="font-semibold">{r.productiveHours ? parseFloat(r.productiveHours).toFixed(1) : "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Travel Hrs</p><p className="font-semibold">{r.travelHours ? parseFloat(r.travelHours).toFixed(1) : "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Crew Size</p><p className="font-semibold">{r.crewSize ?? "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Days On-Site</p><p className="font-semibold">{r.daysOnSite ?? "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Invoice</p><p className="font-semibold text-amber-600">{r.invoiceAmount ? fmt(parseFloat(r.invoiceAmount)) : "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Material Cost</p><p className="font-semibold">{r.materialCost ? fmt(parseFloat(r.materialCost)) : "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Gross Profit</p><p className="font-semibold">{r.grossProfit ? fmt(parseFloat(r.grossProfit)) : "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Net Profit</p><p className="font-semibold">{r.netProfit ? fmt(parseFloat(r.netProfit)) : "—"}</p></div>
                              <div><p className="text-[10px] text-muted-foreground">Callbacks</p><p className="font-semibold">{r.callbacks ?? 0}</p></div>
                            </div>
                            {r.warrantyVisit && <p className="text-[10px] text-amber-600">🔧 Warranty visit needed</p>}
                            {r.editReason && <p className="text-[10px] text-muted-foreground italic">Edit note: {r.editReason}</p>}
                            {r.originalValues && (
                              <p className="text-[10px] text-blue-600/70">Original auto-computed values preserved for comparison.</p>
                            )}
                            <div className="flex items-center gap-2 pt-1">
                              <button onClick={() => startEditRecord(r)}
                                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors">
                                Edit Fields
                              </button>
                              <button
                                onClick={() => toggleStatus(r)}
                                disabled={patchKbRecord.isPending}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50 ${r.status === "accepted" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}
                              >
                                {r.status === "accepted" ? "Exclude from averages" : "Include in averages"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {jobs.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-foreground text-sm">Completed Jobs</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{jobs.length}</span>
            </div>
            {jobs.length > 5 && (
              <button onClick={() => setExpandedJobs(e => !e)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {expandedJobs ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show all</>}
              </button>
            )}
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Job</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Client</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Quoted</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Year</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase">Closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {jobsToShow.map(job => (
                <tr key={job.id} className="hover:bg-muted/10">
                  <td className="px-4 py-2 font-medium text-foreground max-w-[140px] truncate">{job.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">{job.clientName ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-amber-600 font-semibold">{fmt(job.mfhQuotedPrice)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{job.mfhModelYear ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{fmtDate(job.closedAt ?? job.startDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
type SortKey = "name" | "manufacturerName" | "constructionTypeName" | "basePrice" | "jobCount" | "avgInvoice";

function SortHeader({ label, sortKey, current, dir, onSort }: { label: string; sortKey: SortKey; current: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void }) {
  const active = current === sortKey;
  return (
    <button onClick={() => onSort(sortKey)} className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap transition-colors ${active ? "text-amber-600" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
      {active ? (dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}

export default function MfhKnowledgeBase() {
  const { data: models = [], isLoading } = useMfhKnowledgeBase();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | string>("active");
  const [sortKey, setSortKey] = useState<SortKey>("jobCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const manufacturers = [...new Set(models.map(m => m.manufacturerName).filter(Boolean))] as string[];

  const filtered = models.filter(m => {
    if (filter === "all") return true;
    if (filter === "active") return m.active;
    return m.manufacturerName === filter;
  });

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number | null = null;
      let bv: string | number | null = null;
      if (sortKey === "name") { av = a.name; bv = b.name; }
      else if (sortKey === "manufacturerName") { av = a.manufacturerName ?? ""; bv = b.manufacturerName ?? ""; }
      else if (sortKey === "constructionTypeName") { av = a.constructionTypeName ?? ""; bv = b.constructionTypeName ?? ""; }
      else if (sortKey === "basePrice") { av = a.basePrice ? parseFloat(a.basePrice) : -1; bv = b.basePrice ? parseFloat(b.basePrice) : -1; }
      else if (sortKey === "jobCount") { av = a.jobCount; bv = b.jobCount; }
      else if (sortKey === "avgInvoice") { av = a.avgInvoice ?? -1; bv = b.avgInvoice ?? -1; }
      if (av == null) av = -1;
      if (bv == null) bv = -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(k: SortKey) {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" || k === "manufacturerName" || k === "constructionTypeName" ? "asc" : "desc"); }
  }

  const totalJobs = filtered.reduce((s, m) => s + m.jobCount, 0);
  const modelsWithJobs = filtered.filter(m => m.jobCount > 0);
  const modelsWithKbInvoice = modelsWithJobs.filter(m => m.avgInvoice != null);
  const avgInvoiceAll = modelsWithKbInvoice.length > 0
    ? modelsWithKbInvoice.reduce((s, m) => s + (m.avgInvoice ?? 0), 0) / modelsWithKbInvoice.length
    : null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border flex-shrink-0 bg-card/50">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-foreground text-base leading-tight">Home Knowledge Base</h1>
          <p className="text-xs text-muted-foreground">Manufactured home models · baselines · live stats from completed jobs</p>
        </div>
      </div>

      {selectedId != null ? (
        <div className="flex-1 overflow-y-auto p-4">
          <ModelDetail modelId={selectedId} onClose={() => setSelectedId(null)} />
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="flex gap-3 px-4 py-3 border-b border-border bg-muted/20 flex-shrink-0 overflow-x-auto">
            <div className="flex items-center gap-2 flex-shrink-0 bg-card border border-border rounded-xl px-3 py-1.5">
              <Home className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">{models.length} models</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 bg-card border border-border rounded-xl px-3 py-1.5">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">{totalJobs} completed jobs</span>
            </div>
            {avgInvoiceAll != null && (
              <div className="flex items-center gap-2 flex-shrink-0 bg-card border border-border rounded-xl px-3 py-1.5">
                <BarChart2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-foreground">Avg invoice {fmt(avgInvoiceAll)}</span>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-1.5 px-4 py-2.5 flex-shrink-0 overflow-x-auto border-b border-border/50">
            {["active", "all", ...manufacturers].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${filter === f ? "bg-amber-500 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                {f === "active" ? "Active" : f === "all" ? "All" : f}
              </button>
            ))}
          </div>

          {/* Sortable list */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Home className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No models found</p>
                <p className="text-xs text-muted-foreground">Add models in the Home Library on the Jobs page.</p>
              </div>
            ) : (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left">
                      <SortHeader label="Model" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-left hidden sm:table-cell">
                      <SortHeader label="Builder" sortKey="manufacturerName" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-left hidden sm:table-cell">
                      <SortHeader label="Type" sortKey="constructionTypeName" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader label="Baseline" sortKey="basePrice" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-right">
                      <SortHeader label="Jobs" sortKey="jobCount" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2.5 text-right hidden md:table-cell">
                      <SortHeader label="Avg Invoice" sortKey="avgInvoice" current={sortKey} dir={sortDir} onSort={handleSort} />
                    </th>
                    <th className="w-8 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(m => (
                    <tr key={m.id} onClick={() => setSelectedId(m.id)}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">{m.name}</span>
                          {!m.active && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>}
                          <span className="sm:hidden">{ctBadge(m.constructionTypeName)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground sm:hidden mt-0.5">{m.manufacturerName}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground hidden sm:table-cell">{m.manufacturerName ?? "—"}</td>
                      <td className="px-3 py-3 hidden sm:table-cell">{ctBadge(m.constructionTypeName)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-amber-700 text-sm">
                        {m.basePrice ? fmt(m.basePrice) : <span className="text-muted-foreground/50 font-normal text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <p className="font-bold text-foreground text-sm">{m.jobCount}</p>
                        {m.acceptedCount > 0 && <p className="text-[10px] text-amber-600">KB accepted</p>}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground text-sm hidden md:table-cell">
                        {fmt(m.avgInvoice)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 transition-colors ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
