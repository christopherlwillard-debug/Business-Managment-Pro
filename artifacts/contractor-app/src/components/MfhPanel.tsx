import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Home, ChevronDown, ChevronUp, BookOpen, X, Plus, Trash2,
  Pencil, Check, AlertTriangle, RefreshCw, DollarSign, Info,
} from "lucide-react";
import {
  useListMfhManufacturers,
  useMfhPanelData,
  useMfhJobData,
  useApplyMfhPricing,
  useResetMfhPricing,
  useMfhLibraryData,
  useCreateMfhManufacturer,
  useUpdateMfhManufacturer,
  useDeleteMfhManufacturer,
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
  type MfhPricingGuide,
  type MfhGuideAddon,
} from "@workspace/api-client-react";

function fmt(n: string | number | null | undefined) {
  if (n == null || n === "") return "—";
  const v = parseFloat(String(n));
  if (isNaN(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Home Library Modal ────────────────────────────────────────────────────────
function HomeLibraryModal({ onClose }: { onClose: () => void }) {
  const { data: libraryData } = useMfhLibraryData();
  const { data: manufacturers = [] } = useListMfhManufacturers();
  const createMfg = useCreateMfhManufacturer();
  const updateMfg = useUpdateMfhManufacturer();
  const deleteMfg = useDeleteMfhManufacturer();
  const createModel = useCreateMfhModel();
  const updateModel = useUpdateMfhModel();
  const deleteModel = useDeleteMfhModel();
  const createGuide = useCreateMfhGuide();
  const deleteGuide = useDeleteMfhGuide();
  const upsertItem = useUpsertMfhGuideItem();
  const createAddon = useCreateMfhGuideAddon();
  const updateAddon = useUpdateMfhGuideAddon();
  const deleteAddon = useDeleteMfhGuideAddon();
  const { data: panelData } = useMfhPanelData(manufacturers[0]?.id ?? null);

  const [activeMfgId, setActiveMfgId] = useState<number | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<number | null>(null);
  const [newMfgName, setNewMfgName] = useState("");
  const [editingMfgId, setEditingMfgId] = useState<number | null>(null);
  const [editingMfgName, setEditingMfgName] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelCtId, setNewModelCtId] = useState<number | "">("");
  const [editingModel, setEditingModel] = useState<MfhModel | null>(null);
  const [newGuideName, setNewGuideName] = useState("");
  const [newGuideIsDealer, setNewGuideIsDealer] = useState(false);
  const [editingPrice, setEditingPrice] = useState<{ guideId: number; modelId: number; val: string } | null>(null);
  const [newAddon, setNewAddon] = useState<{ label: string; addonKey: string; price: string; isPerDay: boolean } | null>(null);
  const [editingAddon, setEditingAddon] = useState<MfhGuideAddon | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ type: string; id: number } | null>(null);

  const { data: activePanelData } = useMfhPanelData(activeMfgId);

  const mfg = manufacturers.find(m => m.id === activeMfgId) ?? null;
  const models = activePanelData?.models ?? [];
  const guides = activePanelData?.guides ?? [];
  const guideItems = activePanelData?.guideItems ?? [];
  const guideAddons = activePanelData?.guideAddons ?? [];
  const constructionTypes = libraryData?.constructionTypes ?? activePanelData?.constructionTypes ?? [];

  useEffect(() => {
    if (activeMfgId == null && manufacturers.length > 0) {
      setActiveMfgId(manufacturers[0].id);
    }
  }, [manufacturers, activeMfgId]);

  useEffect(() => {
    if (activeGuideId == null && guides.length > 0) setActiveGuideId(guides[0].id);
  }, [guides, activeGuideId]);

  const activeGuide = guides.find(g => g.id === activeGuideId) ?? null;
  const activeAddons = guideAddons.filter(a => a.guideId === activeGuideId);

  function priceFor(guideId: number, modelId: number) {
    return guideItems.find(i => i.guideId === guideId && i.modelId === modelId)?.basePrice ?? "0";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-foreground">Home Library</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Manufacturers */}
          <div className="w-52 flex-shrink-0 border-r border-border overflow-y-auto p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">Manufacturers</p>
            {manufacturers.map(m => (
              <button
                key={m.id}
                onClick={() => { setActiveMfgId(m.id); setActiveGuideId(null); }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${activeMfgId === m.id ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : "hover:bg-muted/50 text-foreground"}`}
              >
                {editingMfgId === m.id ? (
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <input
                      className="flex-1 px-1 py-0.5 text-xs rounded border border-border bg-background"
                      value={editingMfgName}
                      onChange={e => setEditingMfgName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { updateMfg.mutate({ id: m.id, name: editingMfgName }); setEditingMfgId(null); }
                        if (e.key === "Escape") setEditingMfgId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => { updateMfg.mutate({ id: m.id, name: editingMfgName }); setEditingMfgId(null); }} className="text-emerald-600"><Check className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between group">
                    <span className="truncate">{m.name}</span>
                    <div className="hidden group-hover:flex gap-0.5">
                      <button onClick={e => { e.stopPropagation(); setEditingMfgId(m.id); setEditingMfgName(m.name); }} className="p-0.5 hover:text-amber-600"><Pencil className="w-2.5 h-2.5" /></button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId({ type: "manufacturer", id: m.id }); }} className="p-0.5 hover:text-red-500"><Trash2 className="w-2.5 h-2.5" /></button>
                    </div>
                  </div>
                )}
              </button>
            ))}
            {/* Add manufacturer */}
            <div className="flex gap-1 mt-2">
              <input
                className="flex-1 px-2 py-1.5 text-xs rounded-xl border border-border bg-background"
                placeholder="New manufacturer…"
                value={newMfgName}
                onChange={e => setNewMfgName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newMfgName.trim()) { createMfg.mutate({ name: newMfgName.trim() }); setNewMfgName(""); }
                }}
              />
              <button
                onClick={() => { if (newMfgName.trim()) { createMfg.mutate({ name: newMfgName.trim() }); setNewMfgName(""); } }}
                className="p-1.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                disabled={!newMfgName.trim()}
              ><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          {/* Right: Models + Guides */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {!mfg && (
              <p className="text-sm text-muted-foreground text-center py-8">Select or create a manufacturer.</p>
            )}
            {mfg && (
              <>
                {/* Models section */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{mfg.name} — Models</p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Construction</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Checklist</th>
                          <th className="px-3 py-2 w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.map(model => (
                          <tr key={model.id} className="border-t border-border hover:bg-muted/10">
                            {editingModel?.id === model.id ? (
                              <>
                                <td className="px-3 py-1.5">
                                  <input
                                    className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                                    value={editingModel.name}
                                    onChange={e => setEditingModel({ ...editingModel, name: e.target.value })}
                                  />
                                </td>
                                <td className="px-3 py-1.5">
                                  <select
                                    className="w-full px-1 py-1 text-xs rounded border border-border bg-background"
                                    value={editingModel.constructionTypeId}
                                    onChange={e => setEditingModel({ ...editingModel, constructionTypeId: parseInt(e.target.value) })}
                                  >
                                    {constructionTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-1.5">
                                  <select
                                    className="w-full px-1 py-1 text-xs rounded border border-border bg-background"
                                    value={editingModel.checklistTemplateId ?? ""}
                                    onChange={e => setEditingModel({ ...editingModel, checklistTemplateId: e.target.value ? parseInt(e.target.value) : null })}
                                  >
                                    <option value="">— None —</option>
                                    {(activePanelData?.templates ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-1.5">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => { updateModel.mutate({ id: editingModel.id, name: editingModel.name, constructionTypeId: editingModel.constructionTypeId, checklistTemplateId: editingModel.checklistTemplateId ?? null }); setEditingModel(null); }}
                                      className="p-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                    ><Check className="w-3 h-3" /></button>
                                    <button onClick={() => setEditingModel(null)} className="p-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground"><X className="w-3 h-3" /></button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2 font-medium text-foreground">{model.name}</td>
                                <td className="px-3 py-2 text-muted-foreground">{model.constructionTypeName ?? "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground">{model.checklistTemplateName ?? "—"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    <button onClick={() => setEditingModel(model)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-amber-600"><Pencil className="w-3 h-3" /></button>
                                    <button onClick={() => setConfirmDeleteId({ type: "model", id: model.id })} className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                        {/* Add model row */}
                        <tr className="border-t border-border bg-muted/10">
                          <td className="px-3 py-2">
                            <input
                              className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                              placeholder="Model name…"
                              value={newModelName}
                              onChange={e => setNewModelName(e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              className="w-full px-1 py-1 text-xs rounded border border-border bg-background"
                              value={newModelCtId}
                              onChange={e => setNewModelCtId(parseInt(e.target.value))}
                            >
                              <option value="">Type…</option>
                              {constructionTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => {
                                if (newModelName.trim() && newModelCtId && activeMfgId) {
                                  createModel.mutate({ manufacturerId: activeMfgId, name: newModelName.trim(), constructionTypeId: newModelCtId as number });
                                  setNewModelName(""); setNewModelCtId("");
                                }
                              }}
                              disabled={!newModelName.trim() || !newModelCtId}
                              className="p-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-40"
                            ><Plus className="w-3 h-3" /></button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Guides section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{mfg.name} — Pricing Guides</p>
                    <div className="flex gap-2 items-center">
                      <input className="text-xs px-2 py-1 rounded border border-border bg-background w-32" placeholder="Guide name…" value={newGuideName} onChange={e => setNewGuideName(e.target.value)} />
                      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                        <input type="checkbox" checked={newGuideIsDealer} onChange={e => setNewGuideIsDealer(e.target.checked)} className="w-3 h-3" />
                        Dealer
                      </label>
                      <button
                        onClick={() => {
                          if (newGuideName.trim() && activeMfgId) {
                            createGuide.mutate({ manufacturerId: activeMfgId, name: newGuideName.trim(), isDealerGuide: newGuideIsDealer });
                            setNewGuideName(""); setNewGuideIsDealer(false);
                          }
                        }}
                        disabled={!newGuideName.trim()}
                        className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs hover:bg-amber-200 disabled:opacity-40"
                      >Add Guide</button>
                    </div>
                  </div>

                  {/* Guide tabs */}
                  <div className="flex gap-1 mb-2 flex-wrap">
                    {guides.map(g => (
                      <div key={g.id} className="flex items-center gap-0.5">
                        <button
                          onClick={() => setActiveGuideId(g.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${activeGuideId === g.id ? "bg-amber-500 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                        >
                          {g.name}{g.isDealerGuide ? " ★" : ""}
                        </button>
                        <button onClick={() => setConfirmDeleteId({ type: "guide", id: g.id })} className="p-1 text-muted-foreground hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>

                  {activeGuide && (
                    <div className="space-y-3">
                      {/* Price grid */}
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/30">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Model</th>
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Base Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {models.map(model => {
                              const curPrice = priceFor(activeGuideId!, model.id);
                              const isEditing = editingPrice?.guideId === activeGuideId && editingPrice?.modelId === model.id;
                              return (
                                <tr key={model.id} className="border-t border-border hover:bg-muted/10">
                                  <td className="px-3 py-2 font-medium text-foreground">{model.name}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{model.constructionTypeName}</td>
                                  <td className="px-3 py-2">
                                    {isEditing ? (
                                      <div className="flex gap-1">
                                        <input
                                          type="number"
                                          className="w-24 px-2 py-0.5 text-xs rounded border border-border bg-background"
                                          value={editingPrice?.val ?? ""}
                                          onChange={e => setEditingPrice(p => p ? { ...p, val: e.target.value } : null)}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") {
                                              upsertItem.mutate({ guideId: activeGuideId!, modelId: model.id, basePrice: parseFloat(editingPrice?.val ?? "0") });
                                              setEditingPrice(null);
                                            }
                                            if (e.key === "Escape") setEditingPrice(null);
                                          }}
                                          autoFocus
                                        />
                                        <button onClick={() => { upsertItem.mutate({ guideId: activeGuideId!, modelId: model.id, basePrice: parseFloat(editingPrice?.val ?? "0") }); setEditingPrice(null); }} className="text-emerald-600"><Check className="w-3 h-3" /></button>
                                        <button onClick={() => setEditingPrice(null)} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setEditingPrice({ guideId: activeGuideId!, modelId: model.id, val: curPrice })}
                                        className="text-left font-mono hover:text-amber-600 hover:underline"
                                      >{fmt(curPrice)}</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Add-ons */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Add-ons</p>
                        <div className="space-y-1.5">
                          {activeAddons.map(addon => (
                            <div key={addon.id} className="flex items-center gap-2 text-xs">
                              {editingAddon?.id === addon.id ? (
                                <>
                                  <input className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs" value={editingAddon.label} onChange={e => setEditingAddon({ ...editingAddon, label: e.target.value })} placeholder="Label" />
                                  <input type="number" className="w-20 px-2 py-1 rounded border border-border bg-background text-xs" value={editingAddon.price} onChange={e => setEditingAddon({ ...editingAddon, price: e.target.value })} placeholder="Price" />
                                  <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap"><input type="checkbox" checked={editingAddon.isPerDay} onChange={e => setEditingAddon({ ...editingAddon, isPerDay: e.target.checked })} className="w-3 h-3" />Per Day</label>
                                  <button onClick={() => { updateAddon.mutate({ id: editingAddon.id, label: editingAddon.label, price: parseFloat(editingAddon.price), isPerDay: editingAddon.isPerDay }); setEditingAddon(null); }} className="text-emerald-600"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditingAddon(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-foreground">{addon.label}</span>
                                  <span className="font-mono text-muted-foreground">{fmt(addon.price)}{addon.isPerDay ? "/day" : ""}</span>
                                  <button onClick={() => setEditingAddon(addon)} className="text-muted-foreground hover:text-amber-600"><Pencil className="w-3 h-3" /></button>
                                  <button onClick={() => deleteAddon.mutate(addon.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                </>
                              )}
                            </div>
                          ))}
                          {/* New add-on row */}
                          {newAddon ? (
                            <div className="flex items-center gap-2 text-xs">
                              <input className="w-24 px-2 py-1 rounded border border-border bg-background" value={newAddon.addonKey} onChange={e => setNewAddon({ ...newAddon, addonKey: e.target.value })} placeholder="Key (e.g. vinyl_ends)" />
                              <input className="flex-1 px-2 py-1 rounded border border-border bg-background" value={newAddon.label} onChange={e => setNewAddon({ ...newAddon, label: e.target.value })} placeholder="Label" />
                              <input type="number" className="w-20 px-2 py-1 rounded border border-border bg-background" value={newAddon.price} onChange={e => setNewAddon({ ...newAddon, price: e.target.value })} placeholder="Price" />
                              <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap"><input type="checkbox" checked={newAddon.isPerDay} onChange={e => setNewAddon({ ...newAddon, isPerDay: e.target.checked })} className="w-3 h-3" />Per Day</label>
                              <button
                                onClick={() => {
                                  if (newAddon.label && newAddon.addonKey && activeGuideId) {
                                    createAddon.mutate({ guideId: activeGuideId, addonKey: newAddon.addonKey, label: newAddon.label, price: parseFloat(newAddon.price) || 0, isPerDay: newAddon.isPerDay });
                                    setNewAddon(null);
                                  }
                                }}
                                className="text-emerald-600"
                              ><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setNewAddon(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setNewAddon({ label: "", addonKey: "", price: "0", isPerDay: false })}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 px-1 py-1"
                            ><Plus className="w-3 h-3" /> Add add-on</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Confirm delete dialog */}
        {confirmDeleteId && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-2xl">
            <div className="bg-card rounded-xl shadow-lg p-5 max-w-xs w-full text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
              <p className="text-sm font-semibold text-foreground">Delete this {confirmDeleteId.type}?</p>
              <p className="text-xs text-muted-foreground">This cannot be undone. All related data will be removed.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDeleteId(null)} className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-muted/50 hover:bg-muted transition-colors">Cancel</button>
                <button
                  onClick={() => {
                    if (confirmDeleteId.type === "manufacturer") deleteMfg.mutate(confirmDeleteId.id);
                    if (confirmDeleteId.type === "model") deleteModel.mutate(confirmDeleteId.id);
                    if (confirmDeleteId.type === "guide") deleteGuide.mutate(confirmDeleteId.id);
                    setConfirmDeleteId(null);
                  }}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MFH Panel (on job card) ──────────────────────────────────────────────────
export function MfhPanel({ job, onClose }: { job: { id: number; jobType?: string | null; mfhManufacturerId?: number | null; mfhModelId?: number | null; mfhModelYear?: number | null; mfhDealerPrice?: string | null; mfhQuotedPrice?: string | null; mfhGuideName?: string | null }; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: manufacturers = [] } = useListMfhManufacturers();
  const [manufacturerId, setManufacturerId] = useState<number | null>(job.mfhManufacturerId ?? null);
  const [modelId, setModelId] = useState<number | null>(job.mfhModelId ?? null);
  const [modelYear, setModelYear] = useState<string>(job.mfhModelYear ? String(job.mfhModelYear) : "");
  const [guideId, setGuideId] = useState<number | null>(null);
  const [selectedAddonKeys, setSelectedAddonKeys] = useState<string[]>([]);
  const [travelDays, setTravelDays] = useState<string>("1");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [applied, setApplied] = useState(false);

  const { data: panelData, isLoading } = useMfhPanelData(manufacturerId);
  const applyMfh = useApplyMfhPricing();
  const resetMfh = useResetMfhPricing();

  const models = panelData?.models ?? [];
  const guides = panelData?.guides ?? [];
  const guideAddons = panelData?.guideAddons ?? [];
  const guideItems = panelData?.guideItems ?? [];

  // Auto-select first guide
  useEffect(() => {
    if (guideId == null && guides.length > 0) {
      setGuideId(guides[0].id);
    }
  }, [guides, guideId]);

  // Auto-select model defaults for addon keys
  const selectedModel = models.find(m => m.id === modelId);
  useEffect(() => {
    if (selectedModel && selectedAddonKeys.length === 0) {
      setSelectedAddonKeys(selectedModel.defaultAddonKeys ?? []);
    }
  }, [selectedModel]);

  const activeGuide = guides.find(g => g.id === guideId);
  const activeAddons = guideAddons.filter(a => a.guideId === guideId);
  const basePrice = guideItems.find(i => i.guideId === guideId && i.modelId === modelId)?.basePrice ?? null;
  const dealerGuide = guides.find(g => g.isDealerGuide);
  const dealerPrice = dealerGuide ? guideItems.find(i => i.guideId === dealerGuide.id && i.modelId === modelId)?.basePrice : null;

  function addonTotal() {
    return activeAddons
      .filter(a => selectedAddonKeys.includes(a.addonKey))
      .reduce((s, a) => s + parseFloat(a.price) * (a.isPerDay ? (parseInt(travelDays) || 1) : 1), 0);
  }

  const totalQuoted = basePrice != null ? parseFloat(basePrice) + addonTotal() : null;
  const hasTravelAddon = activeAddons.some(a => selectedAddonKeys.includes(a.addonKey) && a.isPerDay);

  const alreadyApplied = job.mfhManufacturerId != null && job.mfhModelId != null;

  async function handleApply() {
    if (!manufacturerId || !modelId || !guideId) return;
    await applyMfh.mutateAsync({
      jobId: job.id,
      manufacturerId,
      modelId,
      modelYear: modelYear ? parseInt(modelYear) : null,
      guideId,
      selectedAddonKeys,
      travelDays: hasTravelAddon ? parseInt(travelDays) || 1 : undefined,
    });
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
    qc.invalidateQueries({ queryKey: ["/api/jobs"] });
  }

  async function handleReset() {
    if (!guideId || !modelId) return;
    await resetMfh.mutateAsync({
      jobId: job.id,
      guideId,
      modelId,
      selectedAddonKeys,
      travelDays: hasTravelAddon ? parseInt(travelDays) || 1 : undefined,
    });
    setConfirmReset(false);
  }

  return (
    <>
      {libraryOpen && <HomeLibraryModal onClose={() => setLibraryOpen(false)} />}

      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-3">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-foreground">Manufactured Home</span>
              {alreadyApplied && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Applied</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLibraryOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors border border-amber-200"
              ><BookOpen className="w-3.5 h-3.5" /> Home Library</button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {/* Manufacturer */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Manufacturer</label>
              <select
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                value={manufacturerId ?? ""}
                onChange={e => { setManufacturerId(e.target.value ? parseInt(e.target.value) : null); setModelId(null); setGuideId(null); setSelectedAddonKeys([]); }}
              >
                <option value="">Select manufacturer…</option>
                {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            {/* Model + Year */}
            {manufacturerId && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Model</label>
                  {isLoading ? (
                    <div className="h-10 rounded-xl bg-muted/30 animate-pulse" />
                  ) : (
                    <select
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      value={modelId ?? ""}
                      onChange={e => { setModelId(e.target.value ? parseInt(e.target.value) : null); setSelectedAddonKeys([]); }}
                    >
                      <option value="">Select model…</option>
                      {models.map(m => <option key={m.id} value={m.id}>{m.name} — {m.constructionTypeName}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Year</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    placeholder="e.g. 2024"
                    value={modelYear}
                    min={1950}
                    max={new Date().getFullYear() + 1}
                    onChange={e => setModelYear(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Pricing Guide */}
            {manufacturerId && modelId && guides.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Pricing Guide</label>
                <div className="flex gap-2">
                  {guides.map(g => (
                    <button
                      key={g.id}
                      onClick={() => setGuideId(g.id)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${guideId === g.id ? "bg-amber-500 border-amber-500 text-white" : "bg-background border-border text-muted-foreground hover:border-amber-300"}`}
                    >
                      {g.name}{g.isDealerGuide ? " ★" : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Model info card */}
            {selectedModel && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-amber-800">{selectedModel.name}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{selectedModel.constructionTypeName ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Checklist:</span> <span className="font-medium">{selectedModel.checklistTemplateName ?? "—"}</span></div>
                </div>
                {selectedModel.notes && <p className="text-xs text-muted-foreground italic">{selectedModel.notes}</p>}
              </div>
            )}

            {/* Price display */}
            {modelId && guideId && basePrice != null && (
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Base ({activeGuide?.name})</span>
                  <span className="font-mono font-bold text-foreground">{fmt(basePrice)}</span>
                </div>
                {dealerPrice && dealerGuide?.id !== guideId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Dealer Guide</span>
                    <span className="font-mono text-muted-foreground">{fmt(dealerPrice)}</span>
                  </div>
                )}
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
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              if (e.target.checked) setSelectedAddonKeys(k => [...k, addon.addonKey]);
                              else setSelectedAddonKeys(k => k.filter(x => x !== addon.addonKey));
                            }}
                            className="w-4 h-4 accent-amber-500"
                          />
                          <span className="flex-1 text-sm text-foreground">{addon.label}</span>
                          <span className="font-mono text-sm text-muted-foreground">{fmt(addon.price)}{addon.isPerDay ? "/day" : ""}</span>
                        </label>
                        {checked && addon.isPerDay && (
                          <div className="ml-6 flex items-center gap-2">
                            <label className="text-xs text-muted-foreground">Days:</label>
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={travelDays}
                              onChange={e => setTravelDays(e.target.value)}
                              className="w-16 px-2 py-1 text-xs rounded-lg border border-border bg-background"
                            />
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
                  <span className="text-sm font-semibold text-emerald-700">Total (this guide)</span>
                </div>
                <span className="font-mono text-lg font-bold text-emerald-700">{fmt(totalQuoted)}</span>
              </div>
            )}

            {/* Already applied info */}
            {alreadyApplied && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">MFH pricing already applied. Clicking Apply again will replace MFH line items in the estimate with current selections.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border space-y-2">
            {applied && (
              <p className="text-xs text-center text-emerald-600 font-medium">✓ Applied to job estimate!</p>
            )}
            <div className="flex gap-2">
              {alreadyApplied && (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset to Guide
                </button>
              )}
              <button
                onClick={handleApply}
                disabled={!manufacturerId || !modelId || !guideId || applyMfh.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                {applyMfh.isPending ? "Applying…" : "Apply"}
              </button>
            </div>

            {/* Confirm reset dialog */}
            {confirmReset && (
              <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Reset MFH pricing?</p>
                <p className="text-xs text-orange-700">This will replace all Manufactured Home line items with current guide pricing. Any custom line items you added will be preserved.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmReset(false)} className="flex-1 py-2 rounded-xl text-xs font-medium bg-white border border-border hover:bg-muted/30 transition-colors">Cancel</button>
                  <button
                    onClick={handleReset}
                    disabled={resetMfh.isPending}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                  >{resetMfh.isPending ? "Resetting…" : "Reset"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
