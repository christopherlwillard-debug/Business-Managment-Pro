import { useState, useEffect, useRef } from "react";
import {
  useListMaterials,
  useCreateMaterial,
  useUpdateMaterial,
  useDeleteMaterial,
  type Material,
  useGetSettings,
  type AppSettings,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import {
  Package, Plus, Search, Pencil, Trash2, X, Check,
  ShoppingCart, Printer, Filter,
  AlertTriangle, ArrowLeft,
} from "lucide-react";

const UNIT_OPTIONS = ["ea", "sqft", "lf", "hr", "lb", "bag", "gal", "ton", "cy"];

type View = "catalog" | "quote-builder" | "quote-print";

interface QuoteItem {
  material: Material;
  qty: number;
}

interface QuoteInfo {
  clientName: string;
  jobDescription: string;
  date: string;
  taxRate: number;
}

const MARKUP = 1.4;
const DEFAULT_TAX = 6;

function emptyForm(): Partial<Material> {
  return { name: "", description: "", unit: "ea", unitCost: 0, category: "", isActive: true };
}

export default function Materials() {
  const [view, setView] = useState<View>("catalog");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<Partial<Material>>(emptyForm());
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);

  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteInfo, setQuoteInfo] = useState<QuoteInfo>({
    clientName: "",
    jobDescription: "",
    date: new Date().toISOString().split("T")[0],
    taxRate: DEFAULT_TAX,
  });

  const { data: materials = [], isLoading } = useListMaterials({
    search: search || undefined,
    category: categoryFilter || undefined,
    includeInactive: showInactive,
  });
  const { data: allActiveMaterials = [] } = useListMaterials({ includeInactive: false });
  const { data: settings } = useGetSettings();
  const s = (settings ?? {}) as AppSettings;

  const taxInitialized = useRef(false);
  useEffect(() => {
    if (!taxInitialized.current && s.defaultTaxRate != null) {
      taxInitialized.current = true;
      setQuoteInfo(prev => ({ ...prev, taxRate: s.defaultTaxRate as number }));
    }
  }, [s.defaultTaxRate]);

  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();

  const categories = Array.from(new Set(allActiveMaterials.map(m => m.category).filter(Boolean) as string[])).sort();

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError("");
    setShowForm(true);
  }

  function openEdit(m: Material) {
    setEditing(m);
    setForm({ ...m });
    setFormError("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name?.trim()) { setFormError("Name is required."); return; }
    setFormError("");
    try {
      if (editing) {
        await updateMaterial.mutateAsync({ ...editing, ...form } as Material);
      } else {
        await createMaterial.mutateAsync({
          name: form.name!,
          description: form.description || undefined,
          unit: form.unit || "ea",
          unitCost: form.unitCost ?? 0,
          category: form.category || undefined,
          isActive: form.isActive !== false,
        });
      }
      setShowForm(false);
    } catch {
      setFormError("Failed to save. Please try again.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMaterial.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  function addToQuote(m: Material) {
    setQuoteItems(prev => {
      const existing = prev.find(qi => qi.material.id === m.id);
      if (existing) return prev.map(qi => qi.material.id === m.id ? { ...qi, qty: qi.qty + 1 } : qi);
      return [...prev, { material: m, qty: 1 }];
    });
  }

  function removeFromQuote(id: number) {
    setQuoteItems(prev => prev.filter(qi => qi.material.id !== id));
  }

  function setQty(id: number, val: number) {
    setQuoteItems(prev => prev.map(qi => qi.material.id === id ? { ...qi, qty: Math.max(0, val) } : qi));
  }

  const quoteSubtotal = quoteItems.reduce((s, qi) => s + qi.material.unitCost * qi.qty * MARKUP, 0);
  const quoteTax = quoteSubtotal * (quoteInfo.taxRate / 100);
  const quoteTotal = quoteSubtotal + quoteTax;

  const filteredForQuote = allActiveMaterials.filter(m =>
    !quoteSearch || m.name.toLowerCase().includes(quoteSearch.toLowerCase())
  );

  const companyName = s.companyName || "BuildPro";
  const companyAddress = [s.companyAddress, s.companyCity, s.companyState, s.companyZip].filter(Boolean).join(", ");
  const companyPhone = s.companyPhone || "";
  const companyEmail = s.companyEmail || "";

  if (view === "quote-print") {
    return <QuotePrint
      items={quoteItems}
      info={quoteInfo}
      companyName={companyName}
      companyAddress={companyAddress}
      companyPhone={companyPhone}
      companyEmail={companyEmail}
      onBack={() => setView("quote-builder")}
    />;
  }

  if (view === "quote-builder") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("catalog")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Catalog
          </button>
          <h1 className="text-xl font-bold text-gray-900 ml-2">Material Quote Builder</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Catalog */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-3">Add from Catalog</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search materials…"
                  value={quoteSearch}
                  onChange={e => setQuoteSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {filteredForQuote.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <Package className="w-8 h-8" />
                  <p className="text-sm">No materials found</p>
                </div>
              ) : filteredForQuote.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{m.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(m.unitCost)} / {m.unit}
                      {m.category && <span className="ml-2 text-gray-300">· {m.category}</span>}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-amber-600 font-semibold">{formatCurrency(m.unitCost * MARKUP)}/{m.unit}</p>
                    <p className="text-[10px] text-gray-400">w/ markup</p>
                  </div>
                  <button onClick={() => addToQuote(m)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors shadow-sm">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Quote */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Quote Summary</h2>
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                  {quoteItems.length} item{quoteItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text" placeholder="Client name"
                  value={quoteInfo.clientName}
                  onChange={e => setQuoteInfo(i => ({ ...i, clientName: e.target.value }))}
                  className="col-span-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <input
                  type="text" placeholder="Job / project description"
                  value={quoteInfo.jobDescription}
                  onChange={e => setQuoteInfo(i => ({ ...i, jobDescription: e.target.value }))}
                  className="col-span-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Date</label>
                  <input type="date"
                    value={quoteInfo.date}
                    onChange={e => setQuoteInfo(i => ({ ...i, date: e.target.value }))}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Tax %</label>
                  <input type="number" min="0" max="100" step="0.1"
                    value={quoteInfo.taxRate}
                    onChange={e => setQuoteInfo(i => ({ ...i, taxRate: parseFloat(e.target.value) || 0 }))}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {quoteItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <ShoppingCart className="w-8 h-8" />
                  <p className="text-sm">Add items from the catalog</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Item</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Qty</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Unit</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {quoteItems.map(qi => {
                      const extended = qi.material.unitCost * qi.qty * MARKUP;
                      return (
                        <tr key={qi.material.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <p className="font-medium text-gray-900 text-xs">{qi.material.name}</p>
                            <p className="text-[10px] text-gray-400">{formatCurrency(qi.material.unitCost * MARKUP)}/{qi.material.unit}</p>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number" min="0" step="1"
                              value={qi.qty}
                              onChange={e => setQty(qi.material.id, parseFloat(e.target.value) || 0)}
                              className="w-16 text-right px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ml-auto block"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-500">{qi.material.unit}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 text-xs whitespace-nowrap">
                            {formatCurrency(extended)}
                          </td>
                          <td className="pr-3 py-2 text-center">
                            <button onClick={() => removeFromQuote(qi.material.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {quoteItems.length > 0 && (
              <div className="border-t border-gray-100 p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal <span className="text-xs text-gray-400">(w/ 40% markup)</span></span>
                  <span className="font-semibold">{formatCurrency(quoteSubtotal)}</span>
                </div>
                {quoteInfo.taxRate > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Sales Tax ({quoteInfo.taxRate}%)</span>
                    <span>{formatCurrency(quoteTax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                  <span>Total</span>
                  <span className="text-amber-600">{formatCurrency(quoteTotal)}</span>
                </div>
                <button
                  onClick={() => setView("quote-print")}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm active:scale-95">
                  <Printer className="w-4 h-4" /> Preview / Print Quote
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Catalog view
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" /> Materials
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your materials catalog and build client quotes.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView("quote-builder")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
            <ShoppingCart className="w-4 h-4 text-amber-500" /> Create Quote
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95">
            <Plus className="w-4 h-4" /> Add Material
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search materials…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm appearance-none cursor-pointer"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
            className="rounded" />
          Show inactive
        </label>
      </div>

      {/* Materials table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : materials.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
            <Package className="w-10 h-10" />
            <div className="text-center">
              <p className="font-semibold text-gray-600">No materials yet</p>
              <p className="text-sm mt-1">Add materials to build your price book and generate client quotes.</p>
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow">
              <Plus className="w-4 h-4" /> Add First Material
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Name</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Category</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Unit Cost</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Unit</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Markup Price</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Status</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {materials.map(m => (
                  <tr key={m.id} className="hover:bg-amber-50/30 transition-colors group">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{m.name}</p>
                      {m.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{m.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {m.category ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {m.category}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">{formatCurrency(m.unitCost)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{m.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">
                      {formatCurrency(m.unitCost * MARKUP)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        m.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {m.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {m.isActive && (
                          <button onClick={() => addToQuote(m)}
                            title="Add to quote"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                            <ShoppingCart className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => openEdit(m)}
                          title="Edit"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(m)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editing ? "Edit Material" : "New Material"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name *</label>
                <input
                  type="text" placeholder="e.g. 2x4 Lumber (8ft)"
                  value={form.name || ""}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea
                  rows={2} placeholder="Optional description or notes…"
                  value={form.description || ""}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Unit Cost *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={form.unitCost ?? ""}
                      onChange={e => setForm(f => ({ ...f, unitCost: parseFloat(e.target.value) || 0 }))}
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Unit</label>
                  <select
                    value={form.unit || "ea"}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  >
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
                <input
                  type="text" placeholder="e.g. Lumber, Concrete, Hardware…"
                  value={form.category || ""}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  list="category-suggestions"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <datalist id="category-suggestions">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive !== false}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded accent-amber-500"
                />
                <span className="text-sm text-gray-700">Active (visible in catalog & quote builder)</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave}
                disabled={createMaterial.isPending || updateMaterial.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95 disabled:opacity-60">
                <Check className="w-4 h-4" />
                {editing ? "Save Changes" : "Add Material"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete Material</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Remove <strong>{deleteTarget.name}</strong> from the catalog? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                disabled={deleteMaterial.isPending}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 shadow transition-all active:scale-95 disabled:opacity-60">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quote Print View ─────────────────────────────────────────────────────────
function QuotePrint({
  items, info, companyName, companyAddress, companyPhone, companyEmail, onBack,
}: {
  items: QuoteItem[];
  info: QuoteInfo;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  onBack: () => void;
}) {
  const subtotal = items.reduce((s, qi) => s + qi.material.unitCost * qi.qty * MARKUP, 0);
  const tax = subtotal * (info.taxRate / 100);
  const total = subtotal + tax;

  return (
    <div className="space-y-4">
      {/* Print controls — hidden during print */}
      <div className="flex items-center gap-3 print-hide">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Quote Builder
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95 ml-auto">
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      {/* Printable area */}
      <div className="invoice-print-area max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        {/* Color bar */}
        <div className="h-2 bg-gradient-to-r from-amber-500 to-amber-400" />

        <div className="p-8 space-y-7">
          {/* Header */}
          <div className="flex justify-between items-start gap-6">
            <div>
              <p className="text-xl font-extrabold text-gray-900">{companyName}</p>
              {companyAddress && <p className="text-xs text-gray-400 mt-1">{companyAddress}</p>}
              {companyPhone && <p className="text-xs text-gray-400">{companyPhone}</p>}
              {companyEmail && <p className="text-xs text-gray-400">{companyEmail}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-black tracking-widest text-gray-200 uppercase">Quote</p>
              <p className="text-xs text-gray-400 mt-1">Date: {info.date}</p>
            </div>
          </div>

          {/* Client / Job */}
          {(info.clientName || info.jobDescription) && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 grid grid-cols-2 gap-4">
              {info.clientName && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Prepared For</p>
                  <p className="font-semibold text-gray-900 mt-1">{info.clientName}</p>
                </div>
              )}
              {info.jobDescription && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Project</p>
                  <p className="text-gray-700 mt-1 text-sm">{info.jobDescription}</p>
                </div>
              )}
            </div>
          )}

          {/* Items table */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800">
                  <th className="text-left pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Item</th>
                  <th className="text-center pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-16">Qty</th>
                  <th className="text-center pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-12">Unit</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-28">Unit Price</th>
                  <th className="text-right pb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(qi => {
                  const unitPrice = qi.material.unitCost * MARKUP;
                  const extended = unitPrice * qi.qty;
                  return (
                    <tr key={qi.material.id}>
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-gray-900">{qi.material.name}</p>
                        {qi.material.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{qi.material.description}</p>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-gray-700">{qi.qty}</td>
                      <td className="py-2.5 text-center text-gray-500 text-xs">{qi.material.unit}</td>
                      <td className="py-2.5 text-right text-gray-700">{formatCurrency(unitPrice)}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-900">{formatCurrency(extended)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              {info.taxRate > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Sales Tax ({info.taxRate}%)</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-300 pt-2">
                <span>Total</span>
                <span className="text-amber-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400 text-center">
              This quote is valid for 30 days. Prices include a 40% material handling markup.
              {info.taxRate > 0 ? ` Sales tax at ${info.taxRate}% included.` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
