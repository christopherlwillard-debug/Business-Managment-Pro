import { useState } from "react";
import {
  Home, ChevronRight, BarChart2, Briefcase,
  Plus, Trash2, ArrowLeft, TrendingUp, Users, Pencil,
  BookOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  useMfhKnowledgeBase,
  useMfhModelDetail,
  useSetMfhClientPrice,
  useDeleteMfhClientPrice,
  useUpdateMfhModel,
  useListClients,
  type MfhKnowledgeBaseEntry,
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
          <p className="font-bold text-sm text-amber-600">{fmt(model.avgInvoice ?? model.avgQuotedPrice)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Avg Hours</p>
          <p className="font-bold text-sm text-foreground">{model.avgHours != null ? fmt(model.avgHours, "decimal") : "—"}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Baseline</p>
          <p className="font-bold text-sm text-foreground">{model.basePrice ? fmt(model.basePrice) : "—"}</p>
        </div>
      </div>

      {model.notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-1 italic">{model.notes}</p>
      )}
    </button>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function ModelDetail({ modelId, onClose }: { modelId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useMfhModelDetail(modelId);
  const { data: clients = [] } = useListClients();
  const setPrice = useSetMfhClientPrice();
  const deletePrice = useDeleteMfhClientPrice();
  const updateModel = useUpdateMfhModel();

  const [addingClient, setAddingClient] = useState(false);
  const [clientForm, setClientForm] = useState({ clientId: "", price: "", notes: "" });
  const [expandedJobs, setExpandedJobs] = useState(false);

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

  const { model, jobs, clientPricing } = data;
  const margin = (model.avgInvoice ?? model.avgQuotedPrice ?? null) != null && model.avgDealerPrice != null
    ? (model.avgInvoice ?? model.avgQuotedPrice ?? 0) - model.avgDealerPrice
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
        <StatTile label="Completed Jobs" value={String(model.jobCount)} />
        <StatTile label="Avg Invoice" value={fmt(model.avgInvoice ?? model.avgQuotedPrice)} />
        <StatTile label="Avg Hours" value={model.avgHours != null ? `${fmt(model.avgHours, "decimal")} hrs` : "—"} />
        <StatTile label="Avg Margin" value={margin != null ? fmt(margin) : "—"} sub={margin != null && model.avgDealerPrice ? `dealer ${fmt(model.avgDealerPrice)}` : undefined} />
      </div>

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
                <tr key={cp.id} className="hover:bg-muted/10">
                  <td className="px-4 py-2.5 font-medium text-foreground">{cp.clientName ?? "Unknown Client"}</td>
                  <td className="px-4 py-2.5 text-amber-600 font-semibold">{fmt(cp.price)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground italic">{cp.notes ?? ""}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => handleDeleteClientPrice(cp.id)}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Related jobs */}
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
export default function MfhKnowledgeBase() {
  const { data: models = [], isLoading } = useMfhKnowledgeBase();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | string>("active");

  const manufacturers = [...new Set(models.map(m => m.manufacturerName).filter(Boolean))] as string[];

  const filtered = models.filter(m => {
    if (filter === "all") return true;
    if (filter === "active") return m.active;
    return m.manufacturerName === filter;
  });

  const totalJobs = filtered.reduce((s, m) => s + m.jobCount, 0);
  const modelsWithJobs = filtered.filter(m => m.jobCount > 0);
  const avgInvoiceAll = modelsWithJobs.length > 0
    ? modelsWithJobs.reduce((s, m) => s + (m.avgInvoice ?? m.avgQuotedPrice ?? 0), 0) / modelsWithJobs.length
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

          {/* List */}
          <div className="flex-1 overflow-y-auto p-4">
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
              <div className="space-y-3">
                {filtered.map(m => (
                  <ModelCard key={m.id} model={m} onClick={() => setSelectedId(m.id)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
