import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Home, BookOpen, X, Plus, Trash2, Pencil, Check,
  AlertTriangle, RefreshCw, DollarSign, Info, TrendingUp,
  RotateCcw, Eye, ChevronRight,
} from "lucide-react";
import {
  useListMfhManufacturers,
  useMfhPanelData,
  useMfhJobData,
  useApplyMfhPricing,
  useResetMfhPricing,
  useUpdateMfhPricing,
  useMfhLibraryData,
  useCreateMfhManufacturer,
  useUpdateMfhManufacturer,
  useDeleteMfhManufacturer,
  useCreateMfhConstructionType,
  useCreateMfhModel,
  useUpdateMfhModel,
  useDeleteMfhModel,
  useCreateMfhGuide,
  useDeleteMfhGuide,
  useUpsertMfhGuideItem,
  useCreateMfhGuideAddon,
  useUpdateMfhGuideAddon,
  useDeleteMfhGuideAddon,
  type MfhModel,
  type MfhGuideAddon,
} from "@workspace/api-client-react";

function fmt(n: string | number | null | undefined, signed = false) {
  if (n == null || n === "") return "—";
  const v = parseFloat(String(n));
  if (isNaN(v)) return "—";
  const s = v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return signed && v > 0 ? `+${s}` : s;
}

// ─── Home Library Modal (4 tabs) ──────────────────────────────────────────────
type LibTab = "manufacturers" | "models" | "pricing" | "addons";

function HomeLibraryModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<LibTab>("manufacturers");
  const [activeMfgId, setActiveMfgId] = useState<number | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<number | null>(null);

  const { data: libData } = useMfhLibraryData();
  const { data: manufacturers = [] } = useListMfhManufacturers();
  const { data: panelData } = useMfhPanelData(activeMfgId);

  const createMfg = useCreateMfhManufacturer();
  const updateMfg = useUpdateMfhManufacturer();
  const deleteMfg = useDeleteMfhManufacturer();
  const createConstructionType = useCreateMfhConstructionType();
  const createModel = useCreateMfhModel();
  const updateModel = useUpdateMfhModel();
  const deleteModel = useDeleteMfhModel();
  const createGuide = useCreateMfhGuide();
  const deleteGuide = useDeleteMfhGuide();
  const upsertItem = useUpsertMfhGuideItem();
  const createAddon = useCreateMfhGuideAddon();
  const updateAddon = useUpdateMfhGuideAddon();
  const deleteAddon = useDeleteMfhGuideAddon();

  const [newMfgName, setNewMfgName] = useState("");
  const [editingMfgId, setEditingMfgId] = useState<number | null>(null);
  const [editingMfgName, setEditingMfgName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: number; label: string } | null>(null);

  // Models tab state
  const [editingModel, setEditingModel] = useState<MfhModel | null>(null);
  const [newModelForm, setNewModelForm] = useState<Partial<MfhModel> | null>(null);
  const [newTypeName, setNewTypeName] = useState("");
  const [showNewType, setShowNewType] = useState(false);

  // Pricing tab state
  const [editingPrice, setEditingPrice] = useState<{ guideId: number; modelId: number; val: string } | null>(null);
  const [newGuideName, setNewGuideName] = useState("");
  const [newGuideIsDealer, setNewGuideIsDealer] = useState(false);

  // Addons tab state
  const [editingAddon, setEditingAddon] = useState<MfhGuideAddon | null>(null);
  const [newAddonForm, setNewAddonForm] = useState<{ label: string; addonKey: string; price: string; isPerDay: boolean } | null>(null);

  useEffect(() => {
    if (activeMfgId == null && manufacturers.length > 0) setActiveMfgId(manufacturers[0].id);
  }, [manufacturers, activeMfgId]);

  useEffect(() => {
    if (activeGuideId == null && panelData?.guides.length) setActiveGuideId(panelData.guides[0].id);
  }, [panelData?.guides, activeGuideId]);

  const models = panelData?.models ?? [];
  const guides = panelData?.guides ?? [];
  const guideItems = panelData?.guideItems ?? [];
  const guideAddons = panelData?.guideAddons ?? [];
  const constructionTypes = libData?.constructionTypes ?? panelData?.constructionTypes ?? [];
  const benchmarks = libData?.benchmarks ?? panelData?.benchmarks ?? [];
  const templates = libData?.templates ?? panelData?.templates ?? [];

  const addConstructionType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    try {
      const created = await createConstructionType.mutateAsync({ name });
      setNewModelForm(prev => prev ? { ...prev, constructionTypeId: created.id } : prev);
      setNewTypeName("");
      setShowNewType(false);
    } catch {
      toast({ title: "Couldn't add type", description: "Please try again.", variant: "destructive" });
    }
  };

  const priceFor = (guideId: number, modelId: number) =>
    guideItems.find(i => i.guideId === guideId && i.modelId === modelId)?.basePrice ?? "0";

  const activeAddons = guideAddons.filter(a => a.guideId === activeGuideId);
  const TABS: { id: LibTab; label: string }[] = [
    { id: "manufacturers", label: "Manufacturers" },
    { id: "models", label: "Models" },
    { id: "pricing", label: "Pricing" },
    { id: "addons", label: "Add-ons" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-foreground">Home Library</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Manufacturer selector */}
        <div className="px-5 pt-3 pb-0 flex items-center gap-3 flex-shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">Manufacturer:</span>
          <div className="flex gap-1 flex-wrap flex-1">
            {manufacturers.map(m => (
              <button
                key={m.id}
                onClick={() => { setActiveMfgId(m.id); setActiveGuideId(null); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${activeMfgId === m.id ? "bg-amber-500 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
              >{m.name}</button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5 mt-3 flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${tab === t.id ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Manufacturers Tab ── */}
          {tab === "manufacturers" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Add, rename, or remove manufacturers. Deleting a manufacturer removes all its models, guides, and pricing.</p>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr><th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th><th className="w-20 px-4 py-2.5"></th></tr>
                  </thead>
                  <tbody>
                    {manufacturers.map(m => (
                      <tr key={m.id} className="border-t border-border hover:bg-muted/10">
                        <td className="px-4 py-2.5">
                          {editingMfgId === m.id ? (
                            <div className="flex gap-2">
                              <input className="flex-1 px-2 py-1 text-sm rounded-lg border border-border bg-background" value={editingMfgName}
                                onChange={e => setEditingMfgName(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { updateMfg.mutate({ id: m.id, name: editingMfgName }); setEditingMfgId(null); } if (e.key === "Escape") setEditingMfgId(null); }}
                                autoFocus />
                              <button onClick={() => { updateMfg.mutate({ id: m.id, name: editingMfgName }); setEditingMfgId(null); }} className="text-emerald-600"><Check className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <span className="font-medium text-foreground">{m.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { setEditingMfgId(m.id); setEditingMfgName(m.name); }} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-amber-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setConfirmDelete({ type: "manufacturer", id: m.id, label: m.name })} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border bg-muted/10">
                      <td className="px-4 py-2.5 flex gap-2">
                        <input className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" placeholder="New manufacturer…" value={newMfgName} onChange={e => setNewMfgName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && newMfgName.trim()) { createMfg.mutate({ name: newMfgName.trim() }); setNewMfgName(""); } }} />
                        <button onClick={() => { if (newMfgName.trim()) { createMfg.mutate({ name: newMfgName.trim() }); setNewMfgName(""); } }} disabled={!newMfgName.trim()}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-40 transition-colors">Add</button>
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Models Tab ── */}
          {tab === "models" && activeMfgId && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type (auto)</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Benchmark</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Checklist</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Active</th>
                      <th className="w-16 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map(model => (
                      <tr key={model.id} className="border-t border-border hover:bg-muted/10">
                        {editingModel?.id === model.id ? (
                          <td colSpan={6} className="px-3 py-3">
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium">Model Name</label>
                                  <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingModel.name}
                                    onChange={e => setEditingModel({ ...editingModel, name: e.target.value })} />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium">Construction Type</label>
                                  <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingModel.constructionTypeId}
                                    onChange={e => setEditingModel({ ...editingModel, constructionTypeId: parseInt(e.target.value) })}>
                                    {constructionTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium">Benchmark (optional)</label>
                                  <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingModel.benchmarkId ?? ""}
                                    onChange={e => setEditingModel({ ...editingModel, benchmarkId: e.target.value ? parseInt(e.target.value) : null })}>
                                    <option value="">— None —</option>
                                    {benchmarks.map(b => <option key={b.id} value={b.id}>{b.jobType}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium">Checklist Template (optional)</label>
                                  <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingModel.checklistTemplateId ?? ""}
                                    onChange={e => setEditingModel({ ...editingModel, checklistTemplateId: e.target.value ? parseInt(e.target.value) : null })}>
                                    <option value="">— None —</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium">Introduced Year</label>
                                  <input type="number" className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingModel.introducedYear ?? ""}
                                    onChange={e => setEditingModel({ ...editingModel, introducedYear: e.target.value ? parseInt(e.target.value) : null })} placeholder="e.g. 2020" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium">Discontinued Year</label>
                                  <input type="number" className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingModel.discontinuedYear ?? ""}
                                    onChange={e => setEditingModel({ ...editingModel, discontinuedYear: e.target.value ? parseInt(e.target.value) : null })} placeholder="e.g. 2024" />
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground font-medium">Notes</label>
                                <textarea className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background resize-none" rows={2} value={editingModel.notes ?? ""}
                                  onChange={e => setEditingModel({ ...editingModel, notes: e.target.value })} placeholder="e.g. Use 2x4 marriage trim · Needs 8' porch flashing" />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Default Add-ons (pre-checked when this model is chosen)</label>
                                <div className="flex gap-3 flex-wrap">
                                  {(panelData?.guideAddons ?? []).filter((a, i, arr) => arr.findIndex(x => x.addonKey === a.addonKey) === i).map(addon => (
                                    <label key={addon.addonKey} className="flex items-center gap-1.5 cursor-pointer text-xs">
                                      <input type="checkbox"
                                        checked={(editingModel.defaultAddonKeys ?? []).includes(addon.addonKey)}
                                        onChange={e => {
                                          const keys = editingModel.defaultAddonKeys ?? [];
                                          setEditingModel({ ...editingModel, defaultAddonKeys: e.target.checked ? [...keys, addon.addonKey] : keys.filter(k => k !== addon.addonKey) });
                                        }}
                                        className="w-3.5 h-3.5 accent-amber-500" />
                                      {addon.label}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 cursor-pointer text-xs">
                                  <input type="checkbox" checked={editingModel.active !== false}
                                    onChange={e => setEditingModel({ ...editingModel, active: e.target.checked })}
                                    className="w-4 h-4 accent-amber-500" />
                                  Active (shown in job dropdowns)
                                </label>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingModel(null)} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground transition-colors">Cancel</button>
                                <button
                                  onClick={() => {
                                    updateModel.mutate({
                                      id: editingModel.id,
                                      name: editingModel.name,
                                      constructionTypeId: editingModel.constructionTypeId,
                                      benchmarkId: editingModel.benchmarkId ?? null,
                                      checklistTemplateId: editingModel.checklistTemplateId ?? null,
                                      notes: editingModel.notes ?? null,
                                      defaultAddonKeys: editingModel.defaultAddonKeys ?? [],
                                      active: editingModel.active !== false,
                                      introducedYear: editingModel.introducedYear ?? null,
                                      discontinuedYear: editingModel.discontinuedYear ?? null,
                                    });
                                    setEditingModel(null);
                                  }}
                                  className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-semibold transition-colors">Save</button>
                              </div>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium text-foreground">{model.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{model.constructionTypeName ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{model.benchmarkName ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{model.checklistTemplateName ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${model.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                {model.active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => setEditingModel(model)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-amber-600 transition-colors"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => setConfirmDelete({ type: "model", id: model.id, label: model.name })} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add model form */}
              {newModelForm == null ? (
                <button onClick={() => setNewModelForm({ manufacturerId: activeMfgId, active: true, defaultAddonKeys: [] })}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-amber-300 transition-colors w-full">
                  <Plus className="w-3.5 h-3.5" /> Add Model
                </button>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-2">
                  <p className="text-xs font-semibold text-amber-700">New Model</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-muted-foreground font-medium">Name</label>
                      <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newModelForm.name ?? ""} onChange={e => setNewModelForm({ ...newModelForm, name: e.target.value })} placeholder="e.g. Appalachia" /></div>
                    <div><label className="text-[10px] text-muted-foreground font-medium">Construction Type</label>
                      <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newModelForm.constructionTypeId ?? ""} onChange={e => setNewModelForm({ ...newModelForm, constructionTypeId: parseInt(e.target.value) })}>
                        <option value="">Select…</option>
                        {constructionTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                      </select>
                      {showNewType ? (
                        <div className="flex gap-1 mt-1">
                          <input autoFocus className="flex-1 px-2 py-1 text-xs rounded-lg border border-border bg-background" placeholder="e.g. VOG, Hybrid, Drywall…" value={newTypeName}
                            onChange={e => setNewTypeName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && newTypeName.trim()) addConstructionType();
                              if (e.key === "Escape") { setNewTypeName(""); setShowNewType(false); }
                            }} />
                          <button type="button" disabled={!newTypeName.trim() || createConstructionType.isPending}
                            onClick={addConstructionType}
                            className="px-2 py-1 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-semibold disabled:opacity-40">Add</button>
                          <button type="button" onClick={() => { setNewTypeName(""); setShowNewType(false); }}
                            className="px-1.5 py-1 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted/50"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setShowNewType(true)}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:text-amber-700"><Plus className="w-2.5 h-2.5" /> New type</button>
                      )}
                    </div>
                    <div><label className="text-[10px] text-muted-foreground font-medium">Benchmark (optional)</label>
                      <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newModelForm.benchmarkId ?? ""} onChange={e => setNewModelForm({ ...newModelForm, benchmarkId: e.target.value ? parseInt(e.target.value) : undefined })}>
                        <option value="">— None —</option>
                        {benchmarks.map(b => <option key={b.id} value={b.id}>{b.jobType}</option>)}
                      </select></div>
                    <div><label className="text-[10px] text-muted-foreground font-medium">Checklist Template (optional)</label>
                      <select className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newModelForm.checklistTemplateId ?? ""} onChange={e => setNewModelForm({ ...newModelForm, checklistTemplateId: e.target.value ? parseInt(e.target.value) : undefined })}>
                        <option value="">— None —</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select></div>
                  </div>
                  <div><label className="text-[10px] text-muted-foreground font-medium">Notes</label>
                    <textarea className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background resize-none" rows={2} value={newModelForm.notes ?? ""} onChange={e => setNewModelForm({ ...newModelForm, notes: e.target.value })} placeholder="e.g. Use 2x4 marriage trim" /></div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setNewModelForm(null)} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">Cancel</button>
                    <button
                      disabled={!newModelForm.name?.trim() || !newModelForm.constructionTypeId}
                      onClick={() => {
                        createModel.mutate({ manufacturerId: activeMfgId!, name: newModelForm.name!.trim(), constructionTypeId: newModelForm.constructionTypeId!, benchmarkId: newModelForm.benchmarkId, checklistTemplateId: newModelForm.checklistTemplateId, notes: newModelForm.notes, defaultAddonKeys: newModelForm.defaultAddonKeys ?? [], active: true });
                        setNewModelForm(null);
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-semibold disabled:opacity-40">Add Model</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Pricing Tab ── */}
          {tab === "pricing" && activeMfgId && (
            <div className="space-y-4">
              {/* Guide selector + add */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1 flex-wrap">
                  {guides.map(g => (
                    <div key={g.id} className="flex items-center gap-0.5">
                      <button onClick={() => setActiveGuideId(g.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${activeGuideId === g.id ? "bg-amber-500 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                        {g.name}{g.isDealerGuide ? " ★" : ""}
                      </button>
                      <button onClick={() => setConfirmDelete({ type: "guide", id: g.id, label: g.name })} className="p-0.5 text-muted-foreground hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 items-center ml-auto">
                  <input className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background w-32" placeholder="Guide name…" value={newGuideName} onChange={e => setNewGuideName(e.target.value)} />
                  <label className="flex items-center gap-1 text-xs cursor-pointer text-muted-foreground">
                    <input type="checkbox" checked={newGuideIsDealer} onChange={e => setNewGuideIsDealer(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500" /> Dealer
                  </label>
                  <button onClick={() => { if (newGuideName.trim() && activeMfgId) { createGuide.mutate({ manufacturerId: activeMfgId, name: newGuideName.trim(), isDealerGuide: newGuideIsDealer }); setNewGuideName(""); setNewGuideIsDealer(false); } }} disabled={!newGuideName.trim()}
                    className="px-3 py-1.5 text-xs rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 font-semibold disabled:opacity-40 transition-colors">Add Guide</button>
                </div>
              </div>

              {activeGuideId && models.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Model</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Base Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map(model => {
                        const curPrice = priceFor(activeGuideId!, model.id);
                        const isEditing = editingPrice?.guideId === activeGuideId && editingPrice?.modelId === model.id;
                        return (
                          <tr key={model.id} className="border-t border-border hover:bg-muted/10">
                            <td className="px-4 py-2.5 font-medium text-foreground">{model.name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{model.constructionTypeName}</td>
                            <td className="px-4 py-2.5">
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <input type="number" className="w-28 px-2 py-1 rounded-lg border border-border bg-background text-xs" value={editingPrice?.val ?? ""}
                                    onChange={e => setEditingPrice(p => p ? { ...p, val: e.target.value } : null)}
                                    onKeyDown={e => { if (e.key === "Enter") { upsertItem.mutate({ guideId: activeGuideId!, modelId: model.id, basePrice: parseFloat(editingPrice?.val ?? "0") }); setEditingPrice(null); } if (e.key === "Escape") setEditingPrice(null); }}
                                    autoFocus />
                                  <button onClick={() => { upsertItem.mutate({ guideId: activeGuideId!, modelId: model.id, basePrice: parseFloat(editingPrice?.val ?? "0") }); setEditingPrice(null); }} className="text-emerald-600"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditingPrice(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              ) : (
                                <button onClick={() => setEditingPrice({ guideId: activeGuideId!, modelId: model.id, val: curPrice })}
                                  className="font-mono hover:text-amber-600 hover:underline text-left">{fmt(curPrice)}</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Add-ons Tab ── */}
          {tab === "addons" && activeMfgId && (
            <div className="space-y-4">
              <div className="flex gap-1 flex-wrap mb-3">
                {guides.map(g => (
                  <button key={g.id} onClick={() => setActiveGuideId(g.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${activeGuideId === g.id ? "bg-amber-500 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
                    {g.name}{g.isDealerGuide ? " ★" : ""}
                  </button>
                ))}
              </div>

              {activeGuideId && (
                <div className="space-y-2">
                  {activeAddons.map(addon => (
                    <div key={addon.id} className="rounded-xl border border-border px-4 py-3">
                      {editingAddon?.id === addon.id ? (
                        <div className="grid grid-cols-4 gap-2 items-end">
                          <div><label className="text-[10px] text-muted-foreground font-medium">Label</label>
                            <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingAddon.label} onChange={e => setEditingAddon({ ...editingAddon, label: e.target.value })} /></div>
                          <div><label className="text-[10px] text-muted-foreground font-medium">Price</label>
                            <input type="number" className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={editingAddon.price} onChange={e => setEditingAddon({ ...editingAddon, price: e.target.value })} /></div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Per Day</label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                              <input type="checkbox" checked={editingAddon.isPerDay} onChange={e => setEditingAddon({ ...editingAddon, isPerDay: e.target.checked })} className="w-4 h-4 accent-amber-500" /> Per day
                            </label>
                          </div>
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { updateAddon.mutate({ id: editingAddon.id, label: editingAddon.label, price: parseFloat(editingAddon.price), isPerDay: editingAddon.isPerDay }); setEditingAddon(null); }} className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingAddon(null)} className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{addon.label}</p>
                            <p className="text-xs text-muted-foreground">Key: <code className="bg-muted/50 px-1 rounded">{addon.addonKey}</code></p>
                          </div>
                          <span className="font-mono text-sm font-bold text-foreground">{fmt(addon.price)}{addon.isPerDay ? "/day" : ""}</span>
                          <div className="flex gap-1">
                            <button onClick={() => setEditingAddon(addon)} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-amber-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setConfirmDelete({ type: "addon", id: addon.id, label: addon.label })} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {newAddonForm == null ? (
                    <button onClick={() => setNewAddonForm({ label: "", addonKey: "", price: "0", isPerDay: false })}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-amber-300 transition-colors w-full">
                      <Plus className="w-3.5 h-3.5" /> Add add-on
                    </button>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3">
                      <div className="grid grid-cols-4 gap-2 items-end">
                        <div><label className="text-[10px] text-muted-foreground font-medium">Label</label>
                          <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newAddonForm.label} onChange={e => setNewAddonForm({ ...newAddonForm, label: e.target.value })} placeholder="e.g. Vinyl Ends" /></div>
                        <div><label className="text-[10px] text-muted-foreground font-medium">Key (unique)</label>
                          <input className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newAddonForm.addonKey} onChange={e => setNewAddonForm({ ...newAddonForm, addonKey: e.target.value })} placeholder="e.g. vinyl_ends" /></div>
                        <div><label className="text-[10px] text-muted-foreground font-medium">Price</label>
                          <input type="number" className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background" value={newAddonForm.price} onChange={e => setNewAddonForm({ ...newAddonForm, price: e.target.value })} /></div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium block mb-1">Per Day</label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <input type="checkbox" checked={newAddonForm.isPerDay} onChange={e => setNewAddonForm({ ...newAddonForm, isPerDay: e.target.checked })} className="w-4 h-4 accent-amber-500" /> Per day
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end mt-2">
                        <button onClick={() => setNewAddonForm(null)} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted/50 text-muted-foreground">Cancel</button>
                        <button disabled={!newAddonForm.label.trim() || !newAddonForm.addonKey.trim()}
                          onClick={() => {
                            createAddon.mutate({ guideId: activeGuideId!, addonKey: newAddonForm.addonKey.trim(), label: newAddonForm.label.trim(), price: parseFloat(newAddonForm.price) || 0, isPerDay: newAddonForm.isPerDay });
                            setNewAddonForm(null);
                          }}
                          className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-semibold disabled:opacity-40">Add</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!activeMfgId && tab !== "manufacturers" && (
            <p className="text-sm text-muted-foreground text-center py-8">Select or create a manufacturer first.</p>
          )}
        </div>

        {/* Confirm delete */}
        {confirmDelete && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-2xl z-10">
            <div className="bg-card rounded-xl shadow-lg p-5 max-w-xs w-full text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
              <p className="text-sm font-semibold">Delete "{confirmDelete.label}"?</p>
              <p className="text-xs text-muted-foreground">This cannot be undone. All related data will be removed.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-xl text-xs font-medium bg-muted/50 hover:bg-muted">Cancel</button>
                <button onClick={() => {
                  if (confirmDelete.type === "manufacturer") deleteMfg.mutate(confirmDelete.id);
                  if (confirmDelete.type === "model") deleteModel.mutate(confirmDelete.id);
                  if (confirmDelete.type === "guide") deleteGuide.mutate(confirmDelete.id);
                  if (confirmDelete.type === "addon") deleteAddon.mutate(confirmDelete.id);
                  setConfirmDelete(null);
                }} className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-500 text-white hover:bg-red-600">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MFH Panel (on job card) ──────────────────────────────────────────────────
export interface MfhJobData {
  id: number;
  jobType?: string | null;
  mfhManufacturerId?: number | null;
  mfhModelId?: number | null;
  mfhModelYear?: number | null;
  mfhDealerPrice?: string | null;
  mfhQuotedPrice?: string | null;
  mfhGuideName?: string | null;
}

export function MfhPanel({
  job,
  onClose,
  onViewEstimates,
}: {
  job: MfhJobData;
  onClose: () => void;
  onViewEstimates?: () => void;
}) {
  const qc = useQueryClient();
  const { data: manufacturers = [] } = useListMfhManufacturers();

  // The jobs list/detail does not carry MFH fields, so fetch the dedicated snapshot
  // (invalidated on apply/update/reset) as the source of truth for hydration.
  const { data: mfhSnapshot } = useMfhJobData(job.id);
  const j = (mfhSnapshot ?? job) as MfhJobData;

  // Mode: "select" = config dropdowns; "spec" = read-only spec sheet after apply
  const alreadyApplied = j.mfhManufacturerId != null && j.mfhModelId != null;
  const [mode, setMode] = useState<"select" | "spec">(alreadyApplied ? "spec" : "select");

  const [manufacturerId, setManufacturerId] = useState<number | null>(j.mfhManufacturerId ?? null);
  const [modelId, setModelId] = useState<number | null>(j.mfhModelId ?? null);
  const [modelYear, setModelYear] = useState<string>(j.mfhModelYear ? String(j.mfhModelYear) : "");
  const [guideId, setGuideId] = useState<number | null>(null);
  const [selectedAddonKeys, setSelectedAddonKeys] = useState<string[]>([]);
  const [travelDays, setTravelDays] = useState<string>("1");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: panelData, isLoading } = useMfhPanelData(manufacturerId);
  const applyMfh = useApplyMfhPricing();
  const updatePricing = useUpdateMfhPricing();
  const resetMfh = useResetMfhPricing();

  const models = panelData?.models ?? [];
  const guides = panelData?.guides ?? [];
  const guideItems = panelData?.guideItems ?? [];
  const guideAddons = panelData?.guideAddons ?? [];

  // Hydrate config + spec mode from the persisted snapshot once it loads.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !mfhSnapshot) return;
    if (mfhSnapshot.mfhManufacturerId != null && mfhSnapshot.mfhModelId != null) {
      setManufacturerId(mfhSnapshot.mfhManufacturerId);
      setModelId(mfhSnapshot.mfhModelId);
      setModelYear(mfhSnapshot.mfhModelYear ? String(mfhSnapshot.mfhModelYear) : "");
      if (Array.isArray(mfhSnapshot.mfhSelectedAddons)) setSelectedAddonKeys(mfhSnapshot.mfhSelectedAddons);
      if (mfhSnapshot.mfhTravelDays != null) setTravelDays(String(mfhSnapshot.mfhTravelDays));
      setMode("spec");
      hydrated.current = true;
    }
  }, [mfhSnapshot]);

  // Auto-select first guide
  useEffect(() => {
    if (guideId == null && guides.length > 0) {
      // If job has a saved guide name, try to match it
      if (j.mfhGuideName) {
        const match = guides.find(g => g.name === j.mfhGuideName);
        if (match) { setGuideId(match.id); return; }
      }
      setGuideId(guides[0].id);
    }
  }, [guides, guideId, j.mfhGuideName]);

  // Auto-pre-check default add-ons when model changes
  const selectedModel = models.find(m => m.id === modelId);
  useEffect(() => {
    if (selectedModel && selectedAddonKeys.length === 0 && !hydrated.current) {
      setSelectedAddonKeys(selectedModel.defaultAddonKeys ?? []);
    }
  }, [selectedModel]);

  const activeGuide = guides.find(g => g.id === guideId);
  const activeAddons = guideAddons.filter(a => a.guideId === guideId);
  const dealerGuide = guides.find(g => g.isDealerGuide);

  const quotedPrice = modelId && guideId ? parseFloat(guideItems.find(i => i.guideId === guideId && i.modelId === modelId)?.basePrice ?? "0") : null;
  const dealerPrice = modelId && dealerGuide ? parseFloat(guideItems.find(i => i.guideId === dealerGuide.id && i.modelId === modelId)?.basePrice ?? "0") : null;

  function addonTotal() {
    return activeAddons.filter(a => selectedAddonKeys.includes(a.addonKey))
      .reduce((s, a) => s + parseFloat(a.price) * (a.isPerDay ? (parseInt(travelDays) || 1) : 1), 0);
  }

  const baseForTotal = quotedPrice ?? 0;
  const totalQuoted = quotedPrice != null ? baseForTotal + addonTotal() : null;
  const totalDealer = dealerPrice != null ? dealerPrice + addonTotal() : null;
  const profit = totalQuoted != null && totalDealer != null ? totalQuoted - totalDealer : null;
  const hasTravelAddon = activeAddons.some(a => selectedAddonKeys.includes(a.addonKey) && a.isPerDay);

  // Spec-sheet values (from job snapshot when in spec mode)
  const snapDealerPrice = j.mfhDealerPrice ? parseFloat(j.mfhDealerPrice) : null;
  const snapQuotedPrice = j.mfhQuotedPrice ? parseFloat(j.mfhQuotedPrice) : null;
  const snapProfit = snapDealerPrice != null && snapQuotedPrice != null ? snapQuotedPrice - snapDealerPrice : null;

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function handleApply() {
    if (!manufacturerId || !modelId || !guideId) return;
    await applyMfh.mutateAsync({
      jobId: job.id, manufacturerId, modelId,
      modelYear: modelYear ? parseInt(modelYear) : null,
      guideId, selectedAddonKeys,
      travelDays: hasTravelAddon ? parseInt(travelDays) || 1 : undefined,
    });
    qc.invalidateQueries({ queryKey: ["/api/jobs"] });
    setMode("spec");
    showFeedback("✓ Applied — estimate & checklist updated!");
  }

  async function handleUpdatePricing() {
    if (!guideId || !modelId) return;
    await updatePricing.mutateAsync({
      jobId: job.id, guideId, modelId, selectedAddonKeys,
      travelDays: hasTravelAddon ? parseInt(travelDays) || 1 : undefined,
    });
    qc.invalidateQueries({ queryKey: ["/api/jobs"] });
    showFeedback("✓ MFH line items updated!");
  }

  async function handleReset() {
    if (!guideId || !modelId) return;
    await resetMfh.mutateAsync({
      jobId: job.id, guideId, modelId, selectedAddonKeys,
      travelDays: hasTravelAddon ? parseInt(travelDays) || 1 : undefined,
    });
    qc.invalidateQueries({ queryKey: ["/api/jobs"] });
    setConfirmReset(false);
    showFeedback("✓ Reset to guide pricing!");
  }

  return (
    <>
      {libraryOpen && <HomeLibraryModal onClose={() => setLibraryOpen(false)} />}

      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-foreground">Manufactured Home</span>
              {mode === "spec" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Applied ✓</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setLibraryOpen(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 border border-amber-200 transition-colors">
                <BookOpen className="w-3 h-3" /> Home Library
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* ── SPEC-SHEET MODE ── */}
          {mode === "spec" && (
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {feedback && <p className="text-xs text-center text-emerald-600 font-medium">{feedback}</p>}

              {/* Snapshot info */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div><span className="text-muted-foreground">Manufacturer</span><p className="font-semibold text-foreground mt-0.5">{manufacturers.find(m => m.id === j.mfhManufacturerId)?.name ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Model</span><p className="font-semibold text-foreground mt-0.5">{selectedModel?.name ?? models.find(m => m.id === j.mfhModelId)?.name ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Construction <span className="text-[9px] bg-muted/50 px-1 py-0.5 rounded font-mono">(auto)</span></span><p className="font-semibold text-foreground mt-0.5">{selectedModel?.constructionTypeName ?? models.find(m => m.id === j.mfhModelId)?.constructionTypeName ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Model Year</span><p className="font-semibold text-foreground mt-0.5">{j.mfhModelYear ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Guide</span><p className="font-semibold text-foreground mt-0.5">{j.mfhGuideName ?? activeGuide?.name ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Benchmark</span><p className="font-semibold text-foreground mt-0.5">{selectedModel?.benchmarkName ?? models.find(m => m.id === j.mfhModelId)?.benchmarkName ?? "—"}</p></div>
                </div>

                {/* Pricing row */}
                <div className="rounded-lg bg-white/60 dark:bg-card border border-amber-100 p-2.5 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Dealer Cost</p>
                    <p className="font-mono font-bold text-sm text-foreground">{fmt(snapDealerPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">My Price</p>
                    <p className="font-mono font-bold text-sm text-amber-700">{fmt(snapQuotedPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />Profit</p>
                    <p className={`font-mono font-bold text-sm ${snapProfit != null && snapProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(snapProfit, true)}</p>
                  </div>
                </div>

                {/* Model notes */}
                {(selectedModel?.notes ?? models.find(m => m.id === j.mfhModelId)?.notes) && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-100/60 rounded-lg p-2">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <p>{selectedModel?.notes ?? models.find(m => m.id === j.mfhModelId)?.notes}</p>
                  </div>
                )}

                {/* Active add-ons */}
                {selectedAddonKeys.length > 0 && activeAddons.filter(a => selectedAddonKeys.includes(a.addonKey)).length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">Add-ons Applied</p>
                    <div className="space-y-0.5">
                      {activeAddons.filter(a => selectedAddonKeys.includes(a.addonKey)).map(a => (
                        <div key={a.addonKey} className="flex justify-between text-xs">
                          <span className="text-foreground">✓ {a.label}</span>
                          <span className="font-mono text-muted-foreground">{fmt(a.price)}{a.isPerDay ? `/day × ${travelDays}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Guide selector for update/reset */}
              {guides.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Guide for Update/Reset</label>
                  <div className="flex gap-2">
                    {guides.map(g => (
                      <button key={g.id} onClick={() => setGuideId(g.id)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${guideId === g.id ? "bg-amber-500 border-amber-500 text-white" : "bg-background border-border text-muted-foreground hover:border-amber-300"}`}>
                        {g.name}{g.isDealerGuide ? " ★" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm reset inline */}
              {confirmReset && (
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Reset MFH pricing?</p>
                  <p className="text-xs text-orange-700">This will replace all Manufactured Home line items with current guide pricing. Any custom line items you added will be preserved.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmReset(false)} className="flex-1 py-2 rounded-xl text-xs font-medium bg-white border border-border hover:bg-muted/30 transition-colors">Cancel</button>
                    <button onClick={handleReset} disabled={resetMfh.isPending}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">{resetMfh.isPending ? "Resetting…" : "Reset"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SELECT MODE ── */}
          {mode === "select" && (
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {/* Manufacturer */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Manufacturer</label>
                <select className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  value={manufacturerId ?? ""} onChange={e => { setManufacturerId(e.target.value ? parseInt(e.target.value) : null); setModelId(null); setGuideId(null); setSelectedAddonKeys([]); }}>
                  <option value="">Select manufacturer…</option>
                  {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {/* Model + Year */}
              {manufacturerId && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Model</label>
                    {isLoading ? <div className="h-10 rounded-xl bg-muted/30 animate-pulse" /> : (
                      <select className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        value={modelId ?? ""} onChange={e => { setModelId(e.target.value ? parseInt(e.target.value) : null); setSelectedAddonKeys([]); }}>
                        <option value="">Select model…</option>
                        {models.map(m => <option key={m.id} value={m.id}>{m.name} — {m.constructionTypeName}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Year</label>
                    <input type="number" className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      placeholder="2024" value={modelYear} min={1950} max={new Date().getFullYear() + 1} onChange={e => setModelYear(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Model info */}
              {selectedModel && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-amber-800">{selectedModel.name}</p>
                    <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-mono">{selectedModel.constructionTypeName} <span className="opacity-60">(auto)</span></span>
                  </div>
                  <div className="flex gap-4 text-xs">
                    {selectedModel.benchmarkName && <div><span className="text-muted-foreground">Benchmark:</span> <span className="font-medium">{selectedModel.benchmarkName}</span></div>}
                    {selectedModel.checklistTemplateName && <div><span className="text-muted-foreground">Checklist:</span> <span className="font-medium">{selectedModel.checklistTemplateName}</span></div>}
                  </div>
                  {selectedModel.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-100/60 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <p>{selectedModel.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Guide selector */}
              {manufacturerId && modelId && guides.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Pricing Guide</label>
                  <div className="flex gap-2">
                    {guides.map(g => (
                      <button key={g.id} onClick={() => setGuideId(g.id)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${guideId === g.id ? "bg-amber-500 border-amber-500 text-white" : "bg-background border-border text-muted-foreground hover:border-amber-300"}`}>
                        {g.name}{g.isDealerGuide ? " ★" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing side-by-side */}
              {modelId && guideId && quotedPrice != null && (
                <div className="rounded-xl border border-border bg-muted/20 p-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Dealer Cost</p>
                    <p className="font-mono font-bold text-sm text-foreground">{fmt(dealerGuide && guideId !== dealerGuide.id ? dealerPrice : quotedPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">My Price</p>
                    <p className="font-mono font-bold text-sm text-amber-700">{fmt(quotedPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />Profit</p>
                    <p className={`font-mono font-bold text-sm ${profit != null && profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(profit, true)}</p>
                  </div>
                </div>
              )}

              {/* Add-ons */}
              {modelId && activeAddons.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Add-ons</label>
                  <div className="space-y-2">
                    {activeAddons.map(addon => {
                      const checked = selectedAddonKeys.includes(addon.addonKey);
                      return (
                        <div key={addon.id} className="space-y-1">
                          <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={e => { if (e.target.checked) setSelectedAddonKeys(k => [...k, addon.addonKey]); else setSelectedAddonKeys(k => k.filter(x => x !== addon.addonKey)); }} className="w-4 h-4 accent-amber-500" />
                            <span className="flex-1 text-sm text-foreground">{addon.label}</span>
                            <span className="font-mono text-sm text-muted-foreground">{fmt(addon.price)}{addon.isPerDay ? "/day" : ""}</span>
                          </label>
                          {checked && addon.isPerDay && (
                            <div className="ml-6 flex items-center gap-2">
                              <label className="text-xs text-muted-foreground">Days:</label>
                              <input type="number" min={1} max={30} value={travelDays} onChange={e => setTravelDays(e.target.value)} className="w-16 px-2 py-1 text-xs rounded-lg border border-border bg-background" />
                              <span className="text-xs text-muted-foreground">= {fmt(parseFloat(addon.price) * (parseInt(travelDays) || 1))}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Total */}
              {totalQuoted != null && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">Total ({activeGuide?.name})</span>
                  </div>
                  <span className="font-mono text-lg font-bold text-emerald-700">{fmt(totalQuoted)}</span>
                </div>
              )}

              {feedback && <p className="text-xs text-center text-emerald-600 font-medium">{feedback}</p>}
            </div>
          )}

          {/* Footer buttons */}
          <div className="px-4 py-3 border-t border-border space-y-2 flex-shrink-0">
            {mode === "spec" && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleUpdatePricing} disabled={!guideId || !modelId || updatePricing.isPending}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />{updatePricing.isPending ? "Updating…" : "Update Pricing"}
                </button>
                <button onClick={() => setConfirmReset(true)} disabled={!guideId || !modelId}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to Guide
                </button>
                {onViewEstimates && (
                  <button onClick={() => { onClose(); onViewEstimates(); }}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border border-border text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> View Estimate
                  </button>
                )}
                <button onClick={() => { hydrated.current = false; setMode("select"); setGuideId(null); setSelectedAddonKeys([]); }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border border-border text-muted-foreground hover:bg-muted/50 transition-colors ${onViewEstimates ? "" : "col-span-2"}`}>
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Change Home
                </button>
              </div>
            )}
            {mode === "select" && (
              <button onClick={handleApply} disabled={!manufacturerId || !modelId || !guideId || applyMfh.isPending}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                <Home className="w-4 h-4" />
                {applyMfh.isPending ? "Applying…" : "Apply"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
