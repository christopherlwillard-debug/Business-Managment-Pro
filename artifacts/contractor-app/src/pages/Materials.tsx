import { useState } from "react";
import {
  useListMaterials,
  useCreateMaterial,
  useUpdateMaterial,
  useDeleteMaterial,
  type Material,
  useListMaterialLists,
  useCreateMaterialList,
  useUpdateMaterialList,
  useDeleteMaterialList,
  useAttachMaterialListToInvoice,
  useMaterialListInvoiceAssignmentHistory,
  useListInvoices,
  type MaterialList,
  type MaterialListItem,
  type MaterialListItemInput,
  useListJobs,
  type Job,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import {
  Package, Plus, Search, Pencil, Trash2, X, Check,
  ListChecks, Filter, AlertTriangle, ChevronDown, ChevronUp,
  ClipboardList, Link2, Briefcase,
} from "lucide-react";

const UNIT_OPTIONS = ["ea", "sqft", "lf", "hr", "lb", "bag", "gal", "ton", "cy"];

function materialRequestError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  const detail = error.message.replace(/^HTTP \d+\s+[^:]+:\s*/i, "").trim();
  if (/unauthorized/i.test(detail)) return "Your session expired. Log in again, then retry.";
  if (/owner access|required|forbidden/i.test(detail)) return "Your account does not currently have permission to manage the Price Book.";
  return detail || fallback;
}

function emptyMaterialForm(): Partial<Material> {
  return { name: "", description: "", unit: "ea", unitCost: 0, category: "", isActive: true };
}

// ─── Material List Editor Dialog ───────────────────────────────────────────────
export function MaterialListDialog({
  open,
  onClose,
  editList,
  materials,
  jobs,
  initialJobId,
}: {
  open: boolean;
  onClose: () => void;
  editList: MaterialList | null;
  materials: Material[];
  jobs: Job[];
  initialJobId?: number;
}) {
  const createList = useCreateMaterialList();
  const updateList = useUpdateMaterialList();

  const [name, setName] = useState(editList?.name ?? "");
  const [jobId, setJobId] = useState<number | "">(editList?.jobId ?? initialJobId ?? "");
  const [markup, setMarkup] = useState(editList?.markup ?? 40);
  const [items, setItems] = useState<MaterialListItemInput[]>(
    editList?.items.map(i => ({
      id: i.id,
      materialId: i.materialId ?? null,
      nameSnapshot: i.nameSnapshot,
      unitSnapshot: i.unitSnapshot,
      unitCostSnapshot: i.unitCostSnapshot,
      qty: i.qty,
      addToJobExpenses: i.addToJobExpenses ?? false,
      expenseId: i.expenseId ?? null,
    })) ?? []
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const filtered = materials.filter(m =>
    m.isActive && (!search || m.name.toLowerCase().includes(search.toLowerCase()))
  );

  function addItem(m: Material) {
    const existing = items.findIndex(i => i.materialId === m.id);
    if (existing >= 0) {
      setItems(prev => prev.map((it, idx) => idx === existing ? { ...it, qty: it.qty + 1 } : it));
    } else {
      setItems(prev => [...prev, {
        materialId: m.id,
        nameSnapshot: m.name,
        unitSnapshot: m.unit,
        unitCostSnapshot: m.unitCost,
        qty: 1,
        addToJobExpenses: false,
      }]);
    }
  }

  function toggleJobExpense(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, addToJobExpenses: !(it.addToJobExpenses ?? false) } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function setQty(idx: number, val: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(0.01, val) } : it));
  }

  const subtotal = items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * (markup / 100 + 1), 0);

  async function handleSave() {
    if (!name.trim()) { setError("List name is required."); return; }
    if (items.length === 0) { setError("Add at least one item."); return; }
    if (!jobId && items.some(it => it.addToJobExpenses)) { setError("Select a job to link expenses."); return; }
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        jobId: jobId ? Number(jobId) : null,
        markup,
        items,
      };
      if (editList) {
        await updateList.mutateAsync({ id: editList.id, ...payload });
      } else {
        await createList.mutateAsync(payload);
      }
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">{editList ? "Edit Material List" : "New Material List"}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          {/* Left: Catalog picker */}
          <div className="lg:w-80 border-r border-gray-100 flex flex-col flex-shrink-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add from Catalog</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search materials…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                  <Package className="w-8 h-8" />
                  <p className="text-sm">No materials found</p>
                </div>
              ) : filtered.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-amber-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{m.name}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(m.unitCost)}/{m.unit}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem(m)}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: List details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 space-y-4 flex-shrink-0">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">List Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Kitchen Remodel Materials"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Linked Job</label>
                  <select
                    value={jobId}
                    onChange={e => setJobId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">No job</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Markup %</label>
                  <input
                    type="number" min="0" max="200" step="5"
                    value={markup}
                    onChange={e => setMarkup(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 py-12">
                  <ListChecks className="w-10 h-10" />
                  <p className="text-sm text-center px-4">Add materials from the catalog on the left</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Material</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Qty</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Unit Cost</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Extended</th>
                      <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-center whitespace-nowrap" title="Add Cost to Job Expenses">Job Exp.</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((it, idx) => {
                      const extended = it.unitCostSnapshot * it.qty * (markup / 100 + 1);
                      const isChecked = it.addToJobExpenses ?? false;
                      return (
                        <tr key={idx} className={`hover:bg-gray-50 transition-colors ${isChecked ? "bg-emerald-50/40" : ""}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-sm">{it.nameSnapshot}</p>
                            <p className="text-[10px] text-gray-400">{it.unitSnapshot}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number" min="0.01" step="0.5"
                              value={it.qty}
                              onChange={e => setQty(idx, parseFloat(e.target.value) || 0)}
                              className="w-16 text-right px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ml-auto block"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-gray-500">
                            {formatCurrency(it.unitCostSnapshot)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-amber-700 text-xs whitespace-nowrap">
                            {formatCurrency(extended)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleJobExpense(idx)}
                              title={isChecked ? "Remove cost from Job Expenses" : "Add cost to Job Expenses"}
                              className={`w-5 h-5 rounded flex items-center justify-center border transition-colors mx-auto ${isChecked ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 text-transparent hover:border-emerald-400"}`}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </td>
                          <td className="pr-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-gray-300 hover:text-red-400 transition-colors"
                            >
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

            {/* Footer with totals */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50 flex-shrink-0">
                <div className="text-xs text-gray-500">
                  {items.length} item{items.length !== 1 ? "s" : ""} · {markup}% markup
                </div>
                <div className="text-sm font-bold text-amber-700">
                  Total (w/ markup): {formatCurrency(subtotal)}
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : editList ? "Update List" : "Save List"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Material List Card ─────────────────────────────────────────────────────────
function MaterialListCard({
  list,
  onEdit,
  onDelete,
}: {
  list: MaterialList;
  onEdit: (list: MaterialList) => void;
  onDelete: (list: MaterialList) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | "">("");
  const attachMutation = useAttachMaterialListToInvoice();
  const { data: allInvoices = [] } = useListInvoices();
  const { data: assignmentHistory = [] } = useMaterialListInvoiceAssignmentHistory(list.id, expanded);
  const invoices = allInvoices as any[];
  const draftInvoicesForClient = invoices.filter(
    inv => inv.status === "draft" && list.clientId != null && inv.clientId === list.clientId,
  );
  const currentInvoice = invoices.find(inv => inv.id === list.invoiceId);
  const invoiceLabel = (inv: any) => {
    if (!inv) return "Unassigned";
    const jobLocation = [inv.jobTitle, inv.locationName || [inv.city, inv.state].filter(Boolean).join(", ")]
      .filter(Boolean).join(" · ");
    return `${inv.invoiceNumber || `Invoice #${inv.id}`}${jobLocation ? ` — ${jobLocation}` : ""}`;
  };

  const subtotal = list.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * (list.markup / 100 + 1), 0);

  async function handleAttach(invoiceId: number | null) {
    if (invoiceId === (list.invoiceId ?? null)) {
      setShowInvoicePicker(false);
      return;
    }
    const destination = invoices.find(inv => inv.id === invoiceId);
    const sourceIsFinalized = !!currentInvoice && currentInvoice.status !== "draft";
    let confirmed = false;
    if (sourceIsFinalized) {
      const destinationLabel = invoiceId == null ? "Unassigned" : invoiceLabel(destination);
      const accepted = window.confirm(
        `${list.name} is currently on ${invoiceLabel(currentInvoice)}. Moving it to ${destinationLabel} will not change the sent/paid invoice and may bill these materials again. Continue?`,
      );
      if (!accepted) return;
      confirmed = true;
    }
    setAttaching(true);
    setAttachMsg(null);
    setShowInvoicePicker(false);
    try {
      await attachMutation.mutateAsync({ id: list.id, invoiceId, confirmAfterFinalized: confirmed });
      setAttachMsg({
        ok: true,
        text: invoiceId == null ? "Material list unassigned." : `Assigned to ${invoiceLabel(destination)}.`,
      });
    } catch (error) {
      setAttachMsg({
        ok: false,
        text: error instanceof Error ? error.message : "Could not change the invoice assignment.",
      });
    } finally {
      setAttaching(false);
    }
  }

  function handleAttachClick() {
    setAttachMsg(null);
    if (draftInvoicesForClient.length === 0 && !list.invoiceId) {
      setAttachMsg({ ok: false, text: "No draft invoice for this client. Create a draft invoice first." });
      return;
    }
    setSelectedInvoiceId(list.invoiceId ?? "");
    setShowInvoicePicker(true);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-sm">{list.name}</h3>
              {list.jobTitle && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold">
                  <Briefcase className="w-2.5 h-2.5" />
                  {list.jobTitle}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>{list.items.length} item{list.items.length !== 1 ? "s" : ""}</span>
              <span className="text-gray-300">·</span>
              <span>{list.markup}% markup</span>
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-amber-700">{formatCurrency(subtotal)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onEdit(list)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(list)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Assign this list to any draft invoice for its client */}
        {list.jobId && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] text-gray-500">
              Invoice: <span className="font-semibold text-gray-700">{invoiceLabel(currentInvoice)}</span>
            </p>
            {!showInvoicePicker ? (
              <button
                onClick={handleAttachClick}
                disabled={attaching}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-50 transition-colors disabled:opacity-60"
              >
                <Link2 className="w-3.5 h-3.5" />
                {attaching ? "Saving…" : list.invoiceId ? "Change Invoice" : "Assign to Invoice"}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
                  Choose a draft for {list.clientId ? (currentInvoice?.clientName || "this client") : "this client"}:
                </p>
                <select
                  value={selectedInvoiceId}
                  onChange={e => setSelectedInvoiceId(e.target.value ? Number(e.target.value) : "")}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                >
                  <option value="">Unassigned</option>
                  {draftInvoicesForClient.map((inv: any) => (
                    <option key={inv.id} value={inv.id}>
                      {invoiceLabel(inv)}{inv.clientName ? ` · ${inv.clientName}` : ""}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAttach(selectedInvoiceId === "" ? null : Number(selectedInvoiceId))}
                    disabled={attaching}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60"
                  >
                    <Link2 className="w-3 h-3" /> Save Assignment
                  </button>
                  <button
                    onClick={() => setShowInvoicePicker(false)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {attachMsg && (
              <p className={`mt-1.5 text-xs ${attachMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
                {attachMsg.text}
              </p>
            )}
            {expanded && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Assignment history</p>
                {assignmentHistory.length === 0 ? (
                  <p className="mt-1 text-xs text-gray-400">No invoice changes recorded.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {assignmentHistory.map(event => (
                      <li key={event.id} className="text-xs text-gray-600">
                        {new Date(event.createdAt).toLocaleString()}: {event.action} —{" "}
                        {event.previousInvoiceLabel || "Unassigned"} → {event.destinationInvoiceLabel || "Unassigned"}
                        {event.confirmedAfterFinalized ? " (confirmed after sent/paid)" : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && list.items.length > 0 && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Item</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Qty</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Unit Cost</th>
                <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Extended</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.items.map(item => {
                const extended = item.unitCostSnapshot * item.qty * (list.markup / 100 + 1);
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-800">{item.nameSnapshot}</p>
                      <p className="text-gray-400">{item.unitSnapshot}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{item.qty}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(item.unitCostSnapshot)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">{formatCurrency(extended)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right font-bold text-gray-700 text-xs">Total</td>
                <td className="px-3 py-2 text-right font-bold text-amber-700">{formatCurrency(subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function Materials() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialForm, setMaterialForm] = useState<Partial<Material>>(emptyMaterialForm());
  const [materialFormError, setMaterialFormError] = useState("");
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState<Material | null>(null);

  const [showListDialog, setShowListDialog] = useState(false);
  const [editingList, setEditingList] = useState<MaterialList | null>(null);
  const [deleteListTarget, setDeleteListTarget] = useState<MaterialList | null>(null);

  const {
    data: materials = [],
    isLoading: materialsLoading,
    isError: materialsFailed,
    error: materialsError,
    refetch: refetchMaterials,
    isFetching: materialsRefetching,
  } = useListMaterials({
    search: search || undefined,
    category: categoryFilter || undefined,
    includeInactive: showInactive,
  });
  const { data: allActiveMaterials = [] } = useListMaterials({ includeInactive: false });
  const { data: materialLists = [], isLoading: listsLoading } = useListMaterialLists();
  const { data: jobs = [] } = useListJobs();

  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const deleteList = useDeleteMaterialList();

  const categories = Array.from(
    new Set(allActiveMaterials.map(m => m.category).filter(Boolean) as string[])
  ).sort();

  const MARKUP = 1.4;

  function openCreateMaterial() {
    setEditingMaterial(null);
    setMaterialForm(emptyMaterialForm());
    setMaterialFormError("");
    setShowMaterialForm(true);
  }

  function openEditMaterial(m: Material) {
    setEditingMaterial(m);
    setMaterialForm({ ...m });
    setMaterialFormError("");
    setShowMaterialForm(true);
  }

  async function handleSaveMaterial() {
    if (!materialForm.name?.trim()) { setMaterialFormError("Name is required."); return; }
    setMaterialFormError("");
    try {
      if (editingMaterial) {
        await updateMaterial.mutateAsync({ ...editingMaterial, ...materialForm } as Material);
      } else {
        await createMaterial.mutateAsync({
          name: materialForm.name!,
          description: materialForm.description || undefined,
          unit: materialForm.unit || "ea",
          unitCost: materialForm.unitCost ?? 0,
          category: materialForm.category || undefined,
          isActive: materialForm.isActive !== false,
        });
      }
      setShowMaterialForm(false);
    } catch (error) {
      setMaterialFormError(materialRequestError(error, "Failed to save. Please try again."));
    }
  }

  async function handleDeleteMaterial() {
    if (!deleteMaterialTarget) return;
    await deleteMaterial.mutateAsync(deleteMaterialTarget.id);
    setDeleteMaterialTarget(null);
  }

  async function handleDeleteList() {
    if (!deleteListTarget) return;
    await deleteList.mutateAsync(deleteListTarget.id);
    setDeleteListTarget(null);
  }

  function openNewList() {
    setEditingList(null);
    setShowListDialog(true);
  }

  function openEditList(list: MaterialList) {
    setEditingList(list);
    setShowListDialog(true);
  }

  return (
    <div className="space-y-8">
      {/* ── Price Book ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-amber-500" /> Price Book
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Your materials catalog with unit costs.</p>
          </div>
          <button
            onClick={openCreateMaterial}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add Material
          </button>
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
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show inactive
          </label>
        </div>

        {/* Materials table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {materialsLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : materialsFailed ? (
            <div className="flex flex-col items-center justify-center min-h-48 px-6 py-10 text-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-700">Materials couldn&apos;t load</p>
                <p className="text-sm text-gray-500 mt-1">
                  {materialRequestError(materialsError, "The Price Book could not connect. Your saved materials have not been deleted.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refetchMaterials()}
                disabled={materialsRefetching}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow disabled:opacity-60"
              >
                {materialsRefetching ? "Retrying…" : "Retry"}
              </button>
            </div>
          ) : materials.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
              <Package className="w-10 h-10" />
              <div className="text-center">
                <p className="font-semibold text-gray-600">No materials yet</p>
                <p className="text-sm mt-1">Add materials to build your price book.</p>
              </div>
              <button
                onClick={openCreateMaterial}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow"
              >
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
                    <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Markup (40%)</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Status</th>
                    <th className="text-center px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {materials.map(m => (
                    <tr key={m.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{m.name}</p>
                        {m.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{m.description}</p>
                        )}
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
                          <button
                            onClick={() => openEditMaterial(m)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteMaterialTarget(m)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
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
      </div>

      {/* ── Material Lists ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-amber-500" /> Material Lists
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Job-linked material lists that can be attached to invoices.</p>
          </div>
          <button
            onClick={openNewList}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> New List
          </button>
        </div>

        {listsLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : materialLists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 gap-3">
            <ListChecks className="w-10 h-10" />
            <div className="text-center">
              <p className="font-semibold text-gray-600">No material lists yet</p>
              <p className="text-sm mt-1">Create a list to track materials for a specific job and attach them to invoices.</p>
            </div>
            <button
              onClick={openNewList}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow"
            >
              <Plus className="w-4 h-4" /> Create First List
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {materialLists.map(list => (
              <MaterialListCard
                key={list.id}
                list={list}
                onEdit={openEditList}
                onDelete={l => setDeleteListTarget(l)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Material Create/Edit Dialog ─────────────────────────────────────────── */}
      {showMaterialForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingMaterial ? "Edit Material" : "New Material"}</h2>
              <button onClick={() => setShowMaterialForm(false)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {materialFormError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {materialFormError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name *</label>
                <input
                  type="text"
                  placeholder="e.g. 2x4 Lumber (8ft)"
                  value={materialForm.name || ""}
                  onChange={e => setMaterialForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional description or notes…"
                  value={materialForm.description || ""}
                  onChange={e => setMaterialForm(f => ({ ...f, description: e.target.value }))}
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
                      value={materialForm.unitCost ?? ""}
                      onChange={e => setMaterialForm(f => ({ ...f, unitCost: parseFloat(e.target.value) || 0 }))}
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Unit</label>
                  <select
                    value={materialForm.unit || "ea"}
                    onChange={e => setMaterialForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  >
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Lumber, Concrete, Electrical…"
                  value={materialForm.category || ""}
                  onChange={e => setMaterialForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={materialForm.isActive !== false}
                  onChange={e => setMaterialForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700 cursor-pointer">Active (visible in catalog)</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowMaterialForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMaterial}
                disabled={createMaterial.isPending || updateMaterial.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow-sm disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {editingMaterial ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Material Confirm ─────────────────────────────────────────────── */}
      {deleteMaterialTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete Material</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteMaterialTarget.name}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteMaterialTarget(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMaterial}
                disabled={deleteMaterial.isPending}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-sm disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete List Confirm ─────────────────────────────────────────────────── */}
      {deleteListTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete Material List</h3>
                <p className="text-sm text-gray-500">All items in this list will be removed.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700">
              Are you sure you want to delete <strong>{deleteListTarget.name}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteListTarget(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                disabled={deleteList.isPending}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors shadow-sm disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Material List Dialog ────────────────────────────────────────────────── */}
      {showListDialog && (
        <MaterialListDialog
          key={editingList?.id ?? "new"}
          open={showListDialog}
          onClose={() => { setShowListDialog(false); setEditingList(null); }}
          editList={editingList}
          materials={allActiveMaterials}
          jobs={jobs as Job[]}
        />
      )}
    </div>
  );
}
