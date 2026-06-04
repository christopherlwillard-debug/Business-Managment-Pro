import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart2, Home, Plus, Edit2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

type Benchmark = {
  id: number;
  jobType: string;
  estimatedHours: number | null;
  estimatedLaborCost: number | null;
  estimatedMaterialCost: number | null;
  notes: string | null;
};

type ActualRow = {
  groupKey: string;
  groupBy: string;
  jobCount: number;
  avgRevenue: number;
  avgCost: number;
  avgProfit: number;
  avgDays: number | null;
  jobs: { id: number; title: string; startDate: string | null; endDate: string | null }[];
};

type Actuals = { byJobType: ActualRow[]; byHomeModel: ActualRow[] };

const EMPTY_BM = { jobType: "", estimatedHours: "", estimatedLaborCost: "", estimatedMaterialCost: "", notes: "" };

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function JobTypeAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const fieldCls = "w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20";

  useEffect(() => {
    fetch(`${BASE_URL}/api/job-type-benchmarks/actuals`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const jobTypes: string[] = data.byJobType?.map((r: { groupKey: string }) => r.groupKey) ?? [];
        const homeModels: string[] = data.byHomeModel?.map((r: { groupKey: string }) => r.groupKey) ?? [];
        setSuggestions(Array.from(new Set([...jobTypes, ...homeModels])).sort());
      })
      .catch(() => {});
  }, []);

  const filtered = suggestions.filter(s => !value.trim() || s.toLowerCase().includes(value.toLowerCase()));

  return (
    <div className="relative">
      <label className="block text-xs font-medium mb-1">Job Type *</label>
      <input
        className={fieldCls}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Model Home, Spec Home, Flooring…"
        required
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 12).map(s => (
            <button key={s} type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
              onMouseDown={() => { onChange(s); setOpen(false); }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BmForm({ val, set, onSubmit, onCancel, submitLabel, saving }: {
  val: typeof EMPTY_BM;
  set: React.Dispatch<React.SetStateAction<typeof EMPTY_BM>>;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
}) {
  const fieldCls = "w-full px-3 py-2 text-sm rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20";
  return (
    <form onSubmit={onSubmit} className="space-y-3 p-4 rounded-xl border border-border bg-muted/20">
      <JobTypeAutocomplete value={val.jobType} onChange={v => set(f => ({ ...f, jobType: v }))} />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Est. Hours</label>
          <input type="number" step="0.5" min="0" className={fieldCls} value={val.estimatedHours} onChange={e => set(f => ({ ...f, estimatedHours: e.target.value }))} placeholder="—" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Est. Labor $</label>
          <input type="number" step="0.01" min="0" className={fieldCls} value={val.estimatedLaborCost} onChange={e => set(f => ({ ...f, estimatedLaborCost: e.target.value }))} placeholder="—" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Est. Materials $</label>
          <input type="number" step="0.01" min="0" className={fieldCls} value={val.estimatedMaterialCost} onChange={e => set(f => ({ ...f, estimatedMaterialCost: e.target.value }))} placeholder="—" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Notes</label>
        <input className={fieldCls} value={val.notes} onChange={e => set(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this job type benchmark…" />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">Cancel</button>
        <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">{saving ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

export function JobBenchmarksPanel() {
  const { toast } = useToast();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [actuals, setActuals] = useState<Actuals>({ byJobType: [], byHomeModel: [] });
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_BM);
  const [editForm, setEditForm] = useState(EMPTY_BM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [bmRes, actRes] = await Promise.allSettled([
        fetch(`${BASE_URL}/api/job-type-benchmarks`).then(r => r.json()),
        fetch(`${BASE_URL}/api/job-type-benchmarks/actuals`).then(r => r.ok ? r.json() : null),
      ]);
      if (bmRes.status === "fulfilled") setBenchmarks(Array.isArray(bmRes.value) ? bmRes.value : []);
      if (actRes.status === "fulfilled" && actRes.value) setActuals(actRes.value);
    } finally {
      setLoading(false);
    }
  }

  const actualsMap = useMemo(() => {
    const m = new Map<string, ActualRow>();
    for (const a of actuals.byJobType) m.set(a.groupKey.toLowerCase(), a);
    return m;
  }, [actuals]);

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.jobType.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/job-type-benchmarks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: form.jobType,
          estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : null,
          estimatedLaborCost: form.estimatedLaborCost ? parseFloat(form.estimatedLaborCost) : null,
          estimatedMaterialCost: form.estimatedMaterialCost ? parseFloat(form.estimatedMaterialCost) : null,
          notes: form.notes || null,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      await load();
      setShowAdd(false);
      setForm(EMPTY_BM);
      toast({ title: "Benchmark added" });
    } catch (err: unknown) {
      toast({ title: (err as Error).message || "Failed to add benchmark", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      await fetch(`${BASE_URL}/api/job-type-benchmarks/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: editForm.jobType,
          estimatedHours: editForm.estimatedHours ? parseFloat(editForm.estimatedHours) : null,
          estimatedLaborCost: editForm.estimatedLaborCost ? parseFloat(editForm.estimatedLaborCost) : null,
          estimatedMaterialCost: editForm.estimatedMaterialCost ? parseFloat(editForm.estimatedMaterialCost) : null,
          notes: editForm.notes || null,
        }),
      });
      await load();
      setEditId(null);
      toast({ title: "Benchmark updated" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`${BASE_URL}/api/job-type-benchmarks/${id}`, { method: "DELETE" });
    setBenchmarks(prev => prev.filter(b => b.id !== id));
    toast({ title: "Benchmark removed" });
  }

  function startEdit(bm: Benchmark) {
    setEditId(bm.id);
    setEditForm({
      jobType: bm.jobType,
      estimatedHours: bm.estimatedHours != null ? String(bm.estimatedHours) : "",
      estimatedLaborCost: bm.estimatedLaborCost != null ? String(bm.estimatedLaborCost) : "",
      estimatedMaterialCost: bm.estimatedMaterialCost != null ? String(bm.estimatedMaterialCost) : "",
      notes: bm.notes ?? "",
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" /> Job Type Benchmarks</CardTitle>
            <CardDescription className="mt-1">Set estimated hours, labor, and material costs by job type to compare against actual performance.</CardDescription>
          </div>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAdd && (
          <BmForm val={form} set={setForm} onSubmit={handleAdd} onCancel={() => { setShowAdd(false); setForm(EMPTY_BM); }} submitLabel="Add Benchmark" saving={saving} />
        )}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />)}</div>
        ) : benchmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No benchmarks yet — add one to start tracking estimated vs actual performance.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {benchmarks.map(bm => (
              <div key={bm.id}>
                {editId === bm.id ? (
                  <BmForm val={editForm} set={setEditForm} onSubmit={e => { e.preventDefault(); handleUpdate(bm.id); }} onCancel={() => setEditId(null)} submitLabel="Save Changes" saving={saving} />
                ) : (
                  <div className="rounded-xl border border-border p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground">{bm.jobType}</p>
                        <div className="flex flex-wrap gap-3 mt-1.5">
                          {bm.estimatedHours != null && <span className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{bm.estimatedHours}h</span> est.</span>}
                          {bm.estimatedLaborCost != null && <span className="text-xs text-muted-foreground">Labor: <span className="font-medium text-foreground">{fmtMoney(bm.estimatedLaborCost)}</span></span>}
                          {bm.estimatedMaterialCost != null && <span className="text-xs text-muted-foreground">Materials: <span className="font-medium text-foreground">{fmtMoney(bm.estimatedMaterialCost)}</span></span>}
                        </div>
                        {bm.notes && <p className="text-xs text-muted-foreground mt-1">{bm.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => startEdit(bm)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(bm.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {(() => {
                      const act = actualsMap.get(bm.jobType.toLowerCase());
                      if (!act) return <p className="text-xs text-muted-foreground/60 italic">No completed jobs yet for this type.</p>;
                      return (
                        <div className="pt-2 border-t border-border/50">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                            Actuals — {act.jobCount} completed job{act.jobCount !== 1 ? "s" : ""}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Revenue {fmtMoney(act.avgRevenue)}</span>
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Cost {fmtMoney(act.avgCost)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${act.avgProfit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              Profit {fmtMoney(act.avgProfit)}
                            </span>
                            {act.avgDays != null && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">{act.avgDays}d avg</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function HomeModelPerformancePanel() {
  const [actuals, setActuals] = useState<Actuals>({ byJobType: [], byHomeModel: [] });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${BASE_URL}/api/job-type-benchmarks/actuals`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setActuals(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const rows = actuals.byHomeModel;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Home className="w-4 h-4 text-primary" /> Home Model Performance</CardTitle>
          <CardDescription className="mt-1">
            Actual averages from completed jobs, grouped by home model. Tag jobs with a Home Model to build this data over time.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Home className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No data yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">Tag jobs with a Home Model to start building your performance data. Complete those jobs to see averages here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(row => {
              const isOpen = expanded.has(row.groupKey);
              return (
                <div key={row.groupKey} className="rounded-xl border border-border overflow-hidden">
                  <button type="button"
                    className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleExpand(row.groupKey)}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{row.groupKey}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <span className="text-xs text-muted-foreground">{row.jobCount} job{row.jobCount !== 1 ? "s" : ""}</span>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">~{fmtMoney(row.avgRevenue)} rev</span>
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">~{fmtMoney(row.avgCost)} cost</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.avgProfit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          ~{fmtMoney(row.avgProfit)} profit
                        </span>
                        {row.avgDays != null && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">~{row.avgDays}d</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-muted-foreground">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>
                  {isOpen && row.jobs.length > 0 && (
                    <div className="border-t border-border/50 divide-y divide-border/30">
                      {row.jobs.map(j => (
                        <div key={j.id} className="px-4 py-2.5 flex items-center justify-between gap-3 bg-muted/10">
                          <p className="text-sm text-foreground flex-1 min-w-0 truncate">{j.title}</p>
                          {j.startDate && (
                            <p className="text-xs text-muted-foreground flex-shrink-0">
                              {j.startDate}{j.endDate && j.endDate !== j.startDate ? ` → ${j.endDate}` : ""}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BenchmarksTab() {
  return (
    <div className="space-y-6">
      <JobBenchmarksPanel />
      <HomeModelPerformancePanel />
    </div>
  );
}
