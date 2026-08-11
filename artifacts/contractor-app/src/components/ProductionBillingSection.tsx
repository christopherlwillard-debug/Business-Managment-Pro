import { useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, Check, Save, RotateCcw, Package, Users2, AlertTriangle,
  ChevronUp, ChevronDown, Zap,
} from "lucide-react";
import {
  useListProductionServiceTypes,
  useProductionBillingTypes,
  useProductionCatalogStatus,
  useCreateProductionServiceType,
  useUpdateProductionServiceType,
  useDeleteProductionServiceType,
  useProductionPriceOverrides,
  useUpsertProductionPriceOverride,
  useDeleteProductionPriceOverride,
  useListClients,
  useListServiceAddonPrompts,
  useCreateServiceAddonPrompt,
  useUpdateServiceAddonPrompt,
  useDeleteServiceAddonPrompt,
  type ProductionServiceType,
  type ProductionServiceTypeInput,
  type ServiceAddonPrompt,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const inp =
  "w-full px-3 py-2 rounded-xl border border-border bg-background focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none text-sm transition-colors";

function priceOrNull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

function fmtPrice(v?: string | null): string {
  if (v == null || v === "") return "—";
  const n = parseFloat(v);
  return Number.isFinite(n) ? formatCurrency(n) : "—";
}

// ── Master catalog editor modal ──────────────────────────────────────────────
function ServiceTypeEditorModal({
  open,
  onClose,
  editing,
  billingTypeOptions,
  businessId,
}: {
  open: boolean;
  onClose: () => void;
  editing: ProductionServiceType | null;
  billingTypeOptions: string[];
  businessId?: number | null;
}) {
  const { toast } = useToast();
  const createMut = useCreateProductionServiceType();
  const updateMut = useUpdateProductionServiceType();

  const [name, setName] = useState("");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [category, setCategory] = useState("");
  const [appliesTo, setAppliesTo] = useState<"production" | "service">("production");
  const [billingType, setBillingType] = useState("");
  const [taxable, setTaxable] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [price, setPrice] = useState("");
  const [priceVog, setPriceVog] = useState("");
  const [priceHybrid, setPriceHybrid] = useState("");
  const [priceDrywall, setPriceDrywall] = useState("");
  const [priceLotVog, setPriceLotVog] = useState("");
  const [priceLotHybrid, setPriceLotHybrid] = useState("");
  const [priceLotDrywall, setPriceLotDrywall] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setInvoiceDescription(editing?.invoiceDescription ?? "");
    setCategory(editing?.category ?? "");
    setAppliesTo(editing?.appliesTo === "service" ? "service" : "production");
    setBillingType(editing?.billingType ?? billingTypeOptions[0] ?? "");
    setTaxable(editing?.taxable ?? false);
    setSortOrder(String(editing?.sortOrder ?? 0));
    setPrice(editing?.price ?? "");
    setPriceVog(editing?.priceVog ?? "");
    setPriceHybrid(editing?.priceHybrid ?? "");
    setPriceDrywall(editing?.priceDrywall ?? "");
    setPriceLotVog(editing?.priceLotVog ?? "");
    setPriceLotHybrid(editing?.priceLotHybrid ?? "");
    setPriceLotDrywall(editing?.priceLotDrywall ?? "");
  }, [open, editing, billingTypeOptions]);

  if (!open) return null;

  const busy = createMut.isPending || updateMut.isPending;

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Give this billing item a name.", variant: "destructive" });
      return;
    }
    const payload: ProductionServiceTypeInput = {
      name: name.trim(),
      invoiceDescription: priceOrNull(invoiceDescription),
      billingType,
      taxable,
      category: priceOrNull(category),
      appliesTo,
      price: priceOrNull(price),
      priceVog: priceOrNull(priceVog),
      priceHybrid: priceOrNull(priceHybrid),
      priceDrywall: priceOrNull(priceDrywall),
      priceLotVog: priceOrNull(priceLotVog),
      priceLotHybrid: priceOrNull(priceLotHybrid),
      priceLotDrywall: priceOrNull(priceLotDrywall),
      sortOrder: parseInt(sortOrder) || 0,
      businessId: businessId ?? null,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Billing item updated" });
      } else {
        await createMut.mutateAsync(payload);
        toast({ title: "Billing item created" });
      }
      onClose();
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="w-4.5 h-4.5 text-amber-600" />
          </div>
          <h3 className="font-bold text-foreground">{editing ? "Edit Billing Item" : "New Billing Item"}</h3>
          <button onClick={onClose} disabled={busy} className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Name</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Set & Trim" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Invoice description</label>
            <textarea
              className={`${inp} min-h-[64px] resize-y`}
              value={invoiceDescription}
              onChange={e => setInvoiceDescription(e.target.value)}
              placeholder="How this line reads on the invoice (defaults to the name)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Category</label>
              <input className={inp} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Labor" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Billing type</label>
              <select className={inp} value={billingType} onChange={e => setBillingType(e.target.value)}>
                {billingTypeOptions.map(bt => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Applies to</label>
            <div className="flex gap-2">
              {(["production", "service"] as const).map(opt => (
                <button key={opt} type="button" onClick={() => setAppliesTo(opt)}
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    appliesTo === opt
                      ? "bg-amber-600 border-amber-600 text-white"
                      : "bg-background border-border text-muted-foreground hover:border-amber-300"
                  }`}>
                  {opt === "production" ? "Production jobs" : "Service jobs only"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Production items appear in the "Services Included" list on MH Production jobs. Service-only items (e.g. Service Call, Warranty Repair) are kept out of that list.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Display order</label>
              <input type="number" className={inp} value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 mt-6 cursor-pointer select-none">
              <input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} className="w-4 h-4 rounded border-border text-amber-600 focus:ring-amber-400" />
              <span className="text-sm text-foreground">Taxable</span>
            </label>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-foreground mb-2">Master pricing</p>
            <div className="mb-3">
              <label className="block text-[11px] text-muted-foreground mb-1">Base price</label>
              <input className={inp} value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" inputMode="decimal" />
            </div>
            {([
              { label: "Field", fields: [["priceVog", setPriceVog, priceVog, "VOG"], ["priceHybrid", setPriceHybrid, priceHybrid, "Hybrid"], ["priceDrywall", setPriceDrywall, priceDrywall, "Drywall"]] as [string, (v: string) => void, string, string][] },
              { label: "Lot Model", fields: [["priceLotVog", setPriceLotVog, priceLotVog, "VOG"], ["priceLotHybrid", setPriceLotHybrid, priceLotHybrid, "Hybrid"], ["priceLotDrywall", setPriceLotDrywall, priceLotDrywall, "Drywall"]] as [string, (v: string) => void, string, string][] },
            ]).map(group => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{group.label}</p>
                <div className="grid grid-cols-3 gap-2">
                  {group.fields.map(([, setter, val, lbl]) => (
                    <div key={lbl}>
                      <label className="block text-[11px] text-muted-foreground mb-1">{lbl}</label>
                      <input className={inp} value={val} onChange={e => setter(e.target.value)} placeholder="(uses base)" inputMode="decimal" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground mt-2">
              Leave a construction-type price blank to fall back to the base price.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex gap-2 flex-shrink-0">
          <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={busy} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Master catalog card ───────────────────────────────────────────────────────
type PriceDraft = { price: string; priceVog: string; priceHybrid: string; priceDrywall: string; priceLotVog: string; priceLotHybrid: string; priceLotDrywall: string };
function emptyPriceDraft(): PriceDraft {
  return { price: "", priceVog: "", priceHybrid: "", priceDrywall: "", priceLotVog: "", priceLotHybrid: "", priceLotDrywall: "" };
}
function isPerType(d: PriceDraft) {
  return !!(d.priceVog || d.priceHybrid || d.priceDrywall || d.priceLotVog || d.priceLotHybrid || d.priceLotDrywall);
}

function CatalogCard({ businessId }: { businessId?: number | null }) {
  const { toast } = useToast();
  const { data: serviceTypes = [], isLoading } = useListProductionServiceTypes(businessId, true);
  const { data: billingTypes = [] } = useProductionBillingTypes();
  const { data: catalogStatus } = useProductionCatalogStatus();
  const updateMut = useUpdateProductionServiceType();
  const deleteMut = useDeleteProductionServiceType();

  const seedFailed = catalogStatus != null && catalogStatus.ok === false;
  const seedErrorMessage = catalogStatus?.seedError ?? catalogStatus?.readError ?? null;

  const billingTypeOptions = useMemo(() => billingTypes.map(bt => bt.value), [billingTypes]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionServiceType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProductionServiceType | null>(null);

  const sorted = useMemo(
    () => [...serviceTypes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [serviceTypes],
  );

  // ── Inline price editing ──────────────────────────────────────────────────
  const [draftPrices, setDraftPrices] = useState<Record<number, PriceDraft>>({});
  const [savingPriceId, setSavingPriceId] = useState<number | null>(null);

  useEffect(() => {
    setDraftPrices(prev => {
      const next: Record<number, PriceDraft> = {};
      for (const st of sorted) {
        // Only seed from DB if the row isn't already being edited
        next[st.id] = prev[st.id] ?? {
          price: st.price ?? "",
          priceVog: st.priceVog ?? "",
          priceHybrid: st.priceHybrid ?? "",
          priceDrywall: st.priceDrywall ?? "",
          priceLotVog: st.priceLotVog ?? "",
          priceLotHybrid: st.priceLotHybrid ?? "",
          priceLotDrywall: st.priceLotDrywall ?? "",
        };
      }
      return next;
    });
  }, [sorted]);

  function setDraftField(stId: number, field: keyof PriceDraft, value: string) {
    setDraftPrices(prev => ({
      ...prev,
      [stId]: { ...(prev[stId] ?? emptyPriceDraft()), [field]: value },
    }));
  }

  function switchToPerType(stId: number) {
    setDraftPrices(prev => {
      const cur = prev[stId] ?? emptyPriceDraft();
      // Move the existing flat price into Field VOG as a starting point
      return { ...prev, [stId]: { price: "", priceVog: cur.price, priceHybrid: "", priceDrywall: "", priceLotVog: "", priceLotHybrid: "", priceLotDrywall: "" } };
    });
  }

  function switchToFlat(stId: number) {
    setDraftPrices(prev => {
      const cur = prev[stId] ?? emptyPriceDraft();
      // Move the first non-empty per-type price to flat
      const flat = cur.priceVog || cur.priceHybrid || cur.priceDrywall || cur.priceLotVog || cur.priceLotHybrid || cur.priceLotDrywall || "";
      return { ...prev, [stId]: { price: flat, priceVog: "", priceHybrid: "", priceDrywall: "", priceLotVog: "", priceLotHybrid: "", priceLotDrywall: "" } };
    });
  }

  async function savePrices(st: ProductionServiceType) {
    const d = draftPrices[st.id];
    if (!d) return;
    setSavingPriceId(st.id);
    try {
      await updateMut.mutateAsync({
        id: st.id,
        price: d.price !== "" ? d.price : null,
        priceVog: d.priceVog !== "" ? d.priceVog : null,
        priceHybrid: d.priceHybrid !== "" ? d.priceHybrid : null,
        priceDrywall: d.priceDrywall !== "" ? d.priceDrywall : null,
        priceLotVog: d.priceLotVog !== "" ? d.priceLotVog : null,
        priceLotHybrid: d.priceLotHybrid !== "" ? d.priceLotHybrid : null,
        priceLotDrywall: d.priceLotDrywall !== "" ? d.priceLotDrywall : null,
      });
      toast({ title: "Price saved" });
    } catch (e) {
      toast({ title: "Could not save price", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingPriceId(null);
    }
  }

  // ── Sort order controls ───────────────────────────────────────────────────
  async function moveSort(st: ProductionServiceType, direction: "up" | "down") {
    const idx = sorted.findIndex(s => s.id === st.id);
    const neighbor = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!neighbor) return;
    const myOrder = st.sortOrder ?? 0;
    const neighborOrder = neighbor.sortOrder ?? 0;
    try {
      await Promise.all([
        updateMut.mutateAsync({ id: st.id, sortOrder: neighborOrder }),
        updateMut.mutateAsync({ id: neighbor.id, sortOrder: myOrder }),
      ]);
    } catch (e) {
      toast({ title: "Could not reorder", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  async function toggleActive(st: ProductionServiceType) {
    try {
      await updateMut.mutateAsync({ id: st.id, active: !st.active });
    } catch (e) {
      toast({ title: "Could not update", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync(confirmDelete.id);
      toast({ title: "Billing item removed" });
      setConfirmDelete(null);
    } catch (e) {
      toast({ title: "Could not remove", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  return (
    <Card className="border-border/50 shadow-md bg-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Production Billing Catalog
            </CardTitle>
            <CardDescription>Master pricing for each production service. Changes take effect on new invoices.</CardDescription>
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {seedFailed && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-800">Catalog may be showing the wrong prices</p>
              <p className="text-sm text-red-700 mt-0.5">
                The production billing catalog couldn't finish loading its standard items, so the
                list below may be incomplete or out of date. Do not build invoices from it until
                this is resolved — re-publish the app to apply the latest changes, then reload.
              </p>
              {seedErrorMessage && (
                <p className="text-[11px] text-red-600/80 mt-1.5 font-mono break-words">{seedErrorMessage}</p>
              )}
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {seedFailed
              ? "The catalog couldn't be loaded — see the warning above."
              : "No billing items yet. Add your first billable production item."}
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((st, idx) => {
              const d = draftPrices[st.id] ?? emptyPriceDraft();
              const perType = isPerType(d);
              const saving = savingPriceId === st.id;
              return (
                <li key={st.id} className={`rounded-xl border border-border ${st.active ? "bg-background" : "bg-muted/40 opacity-70"}`}>
                  {/* Top row: name + action controls */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{st.name}</p>
                        {st.category && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">{st.category}</span>}
                        {st.appliesTo === "service" && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 flex-shrink-0">Service only</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{st.billingType}{st.taxable ? " · taxable" : ""}</p>
                    </div>
                    {/* Sort arrows */}
                    <div className="flex flex-col gap-0 flex-shrink-0">
                      <button
                        onClick={() => moveSort(st, "up")}
                        disabled={idx === 0 || updateMut.isPending}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"
                        title="Move up">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveSort(st, "down")}
                        disabled={idx === sorted.length - 1 || updateMut.isPending}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20"
                        title="Move down">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => toggleActive(st)}
                      title={st.active ? "Active — click to deactivate" : "Inactive — click to activate"}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${st.active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {st.active ? "Active" : "Inactive"}
                    </button>
                    <button onClick={() => { setEditing(st); setModalOpen(true); }} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted flex-shrink-0" title="Edit details">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setConfirmDelete(st)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 flex-shrink-0" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inline price editor */}
                  <div className="px-3 pb-3 border-t border-border/40 pt-2.5">
                    {perType ? (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Price by construction type</p>
                          <button
                            type="button"
                            onClick={() => switchToFlat(st.id)}
                            className="text-[10px] text-amber-600 hover:underline">
                            Use flat rate instead
                          </button>
                        </div>
                        {([
                          { label: "Field", fields: [["priceVog","VOG"],["priceHybrid","Hybrid"],["priceDrywall","Drywall"]] as const },
                          { label: "Lot Model", fields: [["priceLotVog","VOG"],["priceLotHybrid","Hybrid"],["priceLotDrywall","Drywall"]] as const },
                        ] as const).map(group => (
                          <div key={group.label} className="mb-1.5 last:mb-0">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{group.label}</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {group.fields.map(([field, lbl]) => (
                                <div key={field}>
                                  <label className="block text-[10px] text-muted-foreground mb-0.5">{lbl}</label>
                                  <input
                                    className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:border-amber-400 focus:ring-1 focus:ring-amber-200 outline-none"
                                    value={d[field]}
                                    onChange={e => setDraftField(st.id, field, e.target.value)}
                                    onBlur={() => savePrices(st)}
                                    placeholder="—"
                                    inputMode="decimal"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-[10px] text-muted-foreground mb-0.5">Flat rate</label>
                          <input
                            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:border-amber-400 focus:ring-1 focus:ring-amber-200 outline-none"
                            value={d.price}
                            onChange={e => setDraftField(st.id, "price", e.target.value)}
                            onBlur={() => savePrices(st)}
                            placeholder="—"
                            inputMode="decimal"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => switchToPerType(st.id)}
                          className="text-[10px] text-amber-600 hover:underline pb-2 flex-shrink-0 whitespace-nowrap">
                          Per construction type →
                        </button>
                      </div>
                    )}
                    {saving && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <ServiceTypeEditorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        billingTypeOptions={billingTypeOptions}
        businessId={businessId}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6">
            <h3 className="font-bold text-foreground">Remove "{confirmDelete.name}"?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This billing item will no longer be available for new invoices. Existing invoices are not affected.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmDelete(null)} disabled={deleteMut.isPending} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-muted disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteMut.isPending} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Per-client Pricing Profiles card ──────────────────────────────────────────
type Draft = { price: string; priceVog: string; priceHybrid: string; priceDrywall: string; priceLotVog: string; priceLotHybrid: string; priceLotDrywall: string };

function emptyDraft(): Draft {
  return { price: "", priceVog: "", priceHybrid: "", priceDrywall: "", priceLotVog: "", priceLotHybrid: "", priceLotDrywall: "" };
}

function PricingProfilesCard({ businessId }: { businessId?: number | null }) {
  const { toast } = useToast();
  const { data: clients = [] } = useListClients();
  const { data: serviceTypes = [] } = useListProductionServiceTypes(businessId);
  const [clientId, setClientId] = useState<number | null>(null);
  const { data: overrides = [], isLoading: overridesLoading } = useProductionPriceOverrides(clientId);
  const upsertMut = useUpsertProductionPriceOverride();
  const deleteMut = useDeleteProductionPriceOverride();

  const clientList = clients as Array<{ id: number; name: string }>;
  const sorted = useMemo(
    () => [...serviceTypes].filter(s => s.active).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)),
    [serviceTypes],
  );

  const overrideByService = useMemo(() => {
    const m = new Map<number, (typeof overrides)[number]>();
    for (const o of overrides) m.set(o.serviceTypeId, o);
    return m;
  }, [overrides]);

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Re-seed local drafts whenever the selected client's overrides load/change.
  useEffect(() => {
    const next: Record<number, Draft> = {};
    for (const st of sorted) {
      const o = overrideByService.get(st.id);
      next[st.id] = {
        price: o?.price ?? "",
        priceVog: o?.priceVog ?? "",
        priceHybrid: o?.priceHybrid ?? "",
        priceDrywall: o?.priceDrywall ?? "",
        priceLotVog: o?.priceLotVog ?? "",
        priceLotHybrid: o?.priceLotHybrid ?? "",
        priceLotDrywall: o?.priceLotDrywall ?? "",
      };
    }
    setDrafts(next);
  }, [overrideByService, sorted]);

  function setField(stId: number, field: keyof Draft, value: string) {
    setDrafts(prev => ({ ...prev, [stId]: { ...(prev[stId] ?? emptyDraft()), [field]: value } }));
  }

  async function saveRow(stId: number) {
    if (clientId == null) return;
    const d = drafts[stId] ?? emptyDraft();
    setSavingId(stId);
    try {
      await upsertMut.mutateAsync({
        clientId,
        serviceTypeId: stId,
        price: priceOrNull(d.price),
        priceVog: priceOrNull(d.priceVog),
        priceHybrid: priceOrNull(d.priceHybrid),
        priceDrywall: priceOrNull(d.priceDrywall),
        priceLotVog: priceOrNull(d.priceLotVog),
        priceLotHybrid: priceOrNull(d.priceLotHybrid),
        priceLotDrywall: priceOrNull(d.priceLotDrywall),
      });
      toast({ title: "Override saved" });
    } catch (e) {
      toast({ title: "Could not save", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function clearRow(stId: number) {
    if (clientId == null) return;
    const o = overrideByService.get(stId);
    setSavingId(stId);
    try {
      if (o) await deleteMut.mutateAsync({ id: o.id, clientId });
      setDrafts(prev => ({ ...prev, [stId]: emptyDraft() }));
      toast({ title: "Override cleared", description: "This item now uses the master price." });
    } catch (e) {
      toast({ title: "Could not clear", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card className="border-border/50 shadow-md bg-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Users2 className="w-5 h-5 text-amber-500" />
          Client Pricing Profiles
        </CardTitle>
        <CardDescription>Per-client price overrides. Blank fields fall back to the master catalog price.</CardDescription>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Client</label>
          <select
            className={inp}
            value={clientId ?? ""}
            onChange={e => setClientId(e.target.value ? parseInt(e.target.value) : null)}>
            <option value="">Select a client…</option>
            {clientList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {clientId == null ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Select a client to view and edit their Production pricing profile.</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No active billing items in the catalog yet.</p>
        ) : overridesLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
        ) : (
          <ul className="space-y-2">
            {sorted.map(st => {
              const d = drafts[st.id] ?? emptyDraft();
              const hasOverride = overrideByService.has(st.id);
              const saving = savingId === st.id;
              return (
                <li key={st.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-foreground truncate flex-1">{st.name}</p>
                    {hasOverride
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 flex-shrink-0">Override</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground flex-shrink-0">Master {fmtPrice(st.price)}</span>}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5">Base</label>
                      <input className={inp} value={d.price} onChange={e => setField(st.id, "price", e.target.value)} placeholder={fmtPrice(st.price)} inputMode="decimal" />
                    </div>
                    {([
                      { grpLabel: "Field", cols: [["priceVog","VOG",st.priceVog],["priceHybrid","Hybrid",st.priceHybrid],["priceDrywall","Drywall",st.priceDrywall]] as [keyof Draft, string, string|null|undefined][] },
                      { grpLabel: "Lot Model", cols: [["priceLotVog","VOG",st.priceLotVog],["priceLotHybrid","Hybrid",st.priceLotHybrid],["priceLotDrywall","Drywall",st.priceLotDrywall]] as [keyof Draft, string, string|null|undefined][] },
                    ]).map(group => (
                      <div key={group.grpLabel}>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{group.grpLabel}</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {group.cols.map(([field, lbl, master]) => (
                            <div key={field}>
                              <label className="block text-[10px] text-muted-foreground mb-0.5">{lbl}</label>
                              <input className={inp} value={d[field]} onChange={e => setField(st.id, field, e.target.value)} placeholder={fmtPrice(master)} inputMode="decimal" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2 justify-end">
                    <button
                      onClick={() => clearRow(st.id)}
                      disabled={saving || (!hasOverride && !d.price && !d.priceVog && !d.priceHybrid && !d.priceDrywall && !d.priceLotVog && !d.priceLotHybrid && !d.priceLotDrywall)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-medium hover:bg-muted disabled:opacity-40">
                      <RotateCcw className="w-3.5 h-3.5" /> Clear
                    </button>
                    <button
                      onClick={() => saveRow(st.id)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Service Add-on Prompts card ─────────────────────────────────────────────
function ServiceAddonPromptsCard({ serviceTypes, businessId }: { serviceTypes: ProductionServiceType[]; businessId: number | null }) {
  const { data: prompts = [], isLoading } = useListServiceAddonPrompts(businessId);
  const create = useCreateServiceAddonPrompt();
  const update = useUpdateServiceAddonPrompt();
  const remove = useDeleteServiceAddonPrompt();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTrigger, setFormTrigger] = useState<number | "">("");
  const [formAddon, setFormAddon] = useState<number | "">("");
  const [formLabel, setFormLabel] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setFormTrigger("");
    setFormAddon("");
    setFormLabel("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(p: ServiceAddonPrompt) {
    setEditingId(p.id);
    setFormTrigger(p.triggerServiceTypeId);
    setFormAddon(p.addonServiceTypeId);
    setFormLabel(p.promptLabel);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formTrigger || !formAddon || !formLabel.trim()) {
      toast({ title: "All fields required", variant: "destructive" });
      return;
    }
    if (formTrigger === formAddon) {
      toast({ title: "Trigger and add-on must be different services", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingId != null) {
        await update.mutateAsync({
          id: editingId,
          triggerServiceTypeId: formTrigger as number,
          addonServiceTypeId: formAddon as number,
          promptLabel: formLabel.trim(),
        });
      } else {
        await create.mutateAsync({
          triggerServiceTypeId: formTrigger as number,
          addonServiceTypeId: formAddon as number,
          promptLabel: formLabel.trim(),
          businessId,
        });
      }
      toast({ title: editingId ? "Prompt updated" : "Prompt added" });
      resetForm();
    } catch (err: unknown) {
      // Surface server-side conflict (duplicate trigger) as a clear message
      const serverMsg = (err as { body?: { error?: string } })?.body?.error;
      toast({
        title: serverMsg ?? "Failed to save",
        description: serverMsg ? undefined : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this add-on prompt?")) return;
    try {
      await remove.mutateAsync(id);
      toast({ title: "Prompt removed" });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  }

  const activeTypes = serviceTypes.filter(s => s.active);

  return (
    <Card className="border-border/50 shadow-md bg-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" /> Service Add-on Prompts
            </CardTitle>
            <CardDescription className="mt-1">
              When a trigger service is checked on a job, the app will ask whether to also add the
              linked add-on service. Edit this table instead of changing code.
            </CardDescription>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Prompt
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">

        {/* Form */}
        {showForm && (
          <div className="border border-border/60 rounded-xl p-4 space-y-3 bg-muted/20">
            <p className="text-sm font-semibold text-foreground">
              {editingId ? "Edit prompt" : "New add-on prompt"}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Trigger service (when checked…)
                </label>
                <select
                  value={formTrigger}
                  onChange={e => setFormTrigger(e.target.value ? Number(e.target.value) : "")}
                  className={inp}
                >
                  <option value="">Select service…</option>
                  {activeTypes.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Add-on service (prompt to add)
                </label>
                <select
                  value={formAddon}
                  onChange={e => setFormAddon(e.target.value ? Number(e.target.value) : "")}
                  className={inp}
                >
                  <option value="">Select service…</option>
                  {activeTypes.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Prompt text shown to Willard
              </label>
              <input
                type="text"
                className={inp}
                placeholder="e.g. Will you also be heat wrapping the waterline on this plumbing hookup?"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingId ? "Update" : "Save"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : prompts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No add-on prompts configured yet. The Plumbing → Heat Wrap prompt will be seeded
            automatically on first use.
          </p>
        ) : (
          <ul className="space-y-2">
            {prompts.map(p => (
              <li key={p.id} className="flex items-start gap-3 rounded-xl border border-border/50 bg-background p-3">
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    {p.triggerServiceType?.name ?? `#${p.triggerServiceTypeId}`}
                    {" "}→{" "}
                    {p.addonServiceType?.name ?? `#${p.addonServiceTypeId}`}
                  </p>
                  <p className="text-sm text-foreground">{p.promptLabel}</p>
                  {p.addonServiceType?.price && (
                    <p className="text-xs text-amber-600 font-semibold">
                      Add-on price: ${parseFloat(p.addonServiceType.price).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ProductionBillingSection() {
  const { activeBusiness } = useBusiness();
  const businessId = activeBusiness?.id ?? null;
  const { data: serviceTypes = [] } = useListProductionServiceTypes(businessId, false);
  return (
    <div className="space-y-5 pb-8">
      <CatalogCard businessId={businessId} />
      <PricingProfilesCard businessId={businessId} />
      <ServiceAddonPromptsCard serviceTypes={serviceTypes} businessId={businessId} />
    </div>
  );
}
