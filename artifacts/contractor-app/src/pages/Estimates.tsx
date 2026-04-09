import { useState, useMemo } from "react";
import {
  useListEstimates, useListClients,
  useCreateEstimate, useUpdateEstimate, useDeleteEstimate, useConvertEstimateToJob,
  getListEstimatesQueryKey,
  Estimate, CreateEstimateRequest, CreateEstimateRequestStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Calculator, FileText, Plus, Trash2, Edit2, X,
  ChevronRight, Check, Briefcase, DollarSign, Layers,
} from "lucide-react";
import { TrimCalculator } from "@/components/calculators/TrimCalculator";
import { SidingCalculator } from "@/components/calculators/SidingCalculator";
import { FlooringCalculator } from "@/components/calculators/FlooringCalculator";
import { PlumbingCalculator } from "@/components/calculators/PlumbingCalculator";

// ─── Trade templates ──────────────────────────────────────────────────────────
const TRADE_TEMPLATES: Record<string, Array<{ category: string; description: string; quantity: number; unit: string; unitCost: number }>> = {
  "Trim Work": [
    { category: "Labor", description: "Trim installation labor", quantity: 100, unit: "LF", unitCost: 2.5 },
    { category: "Material", description: "Base trim material", quantity: 100, unit: "LF", unitCost: 1.25 },
    { category: "Material", description: "Door casing sets", quantity: 4, unit: "EA", unitCost: 18 },
    { category: "Material", description: "Window casing sets", quantity: 4, unit: "EA", unitCost: 22 },
    { category: "Labor", description: "Caulk & nail hole fill", quantity: 1, unit: "LOT", unitCost: 150 },
  ],
  "Siding": [
    { category: "Labor", description: "Siding installation labor", quantity: 20, unit: "SQ", unitCost: 120 },
    { category: "Material", description: "Vinyl/LP siding material", quantity: 20, unit: "SQ", unitCost: 180 },
    { category: "Material", description: "House wrap / WRB", quantity: 20, unit: "SQ", unitCost: 25 },
    { category: "Material", description: "J-channel & trim", quantity: 1, unit: "LOT", unitCost: 350 },
    { category: "Labor", description: "Tearoff & disposal", quantity: 1, unit: "LOT", unitCost: 400 },
  ],
  "Plumbing": [
    { category: "Labor", description: "Rough-in plumbing labor", quantity: 16, unit: "HR", unitCost: 85 },
    { category: "Labor", description: "Finish plumbing labor", quantity: 8, unit: "HR", unitCost: 85 },
    { category: "Material", description: "Pipe & fittings allowance", quantity: 1, unit: "LOT", unitCost: 500 },
    { category: "Material", description: "Fixtures allowance", quantity: 1, unit: "LOT", unitCost: 800 },
  ],
  "Drywall": [
    { category: "Labor", description: "Hang drywall", quantity: 50, unit: "SHT", unitCost: 12 },
    { category: "Labor", description: "Tape, mud & sand", quantity: 1000, unit: "SF", unitCost: 0.75 },
    { category: "Material", description: "1/2\" drywall sheets", quantity: 50, unit: "SHT", unitCost: 14 },
    { category: "Material", description: "Joint compound & tape", quantity: 1, unit: "LOT", unitCost: 120 },
    { category: "Labor", description: "Texture / prime coat", quantity: 1000, unit: "SF", unitCost: 0.5 },
  ],
  "Painting": [
    { category: "Labor", description: "Interior painting labor", quantity: 1000, unit: "SF", unitCost: 1.5 },
    { category: "Material", description: "Paint (walls)", quantity: 5, unit: "GAL", unitCost: 45 },
    { category: "Material", description: "Primer", quantity: 2, unit: "GAL", unitCost: 35 },
    { category: "Labor", description: "Trim painting", quantity: 1, unit: "LOT", unitCost: 350 },
    { category: "Material", description: "Supplies (brushes, rollers, tape)", quantity: 1, unit: "LOT", unitCost: 80 },
  ],
  "Roofing": [
    { category: "Labor", description: "Shingle installation", quantity: 25, unit: "SQ", unitCost: 80 },
    { category: "Material", description: "Architectural shingles", quantity: 25, unit: "SQ", unitCost: 150 },
    { category: "Material", description: "Underlayment / felt", quantity: 25, unit: "SQ", unitCost: 20 },
    { category: "Material", description: "Ridge cap & flashing", quantity: 1, unit: "LOT", unitCost: 300 },
    { category: "Labor", description: "Tearoff & disposal", quantity: 25, unit: "SQ", unitCost: 30 },
  ],
  "Concrete": [
    { category: "Labor", description: "Form & pour labor", quantity: 200, unit: "SF", unitCost: 4.5 },
    { category: "Material", description: "Concrete (3000 PSI)", quantity: 3, unit: "YD", unitCost: 160 },
    { category: "Material", description: "Rebar / wire mesh", quantity: 1, unit: "LOT", unitCost: 200 },
    { category: "Labor", description: "Finish & cure", quantity: 200, unit: "SF", unitCost: 1.5 },
  ],
  "Flooring": [
    { category: "Labor", description: "Flooring installation", quantity: 500, unit: "SF", unitCost: 2.5 },
    { category: "Material", description: "Flooring material", quantity: 550, unit: "SF", unitCost: 3.5 },
    { category: "Material", description: "Underlayment", quantity: 550, unit: "SF", unitCost: 0.6 },
    { category: "Labor", description: "Subfloor prep", quantity: 500, unit: "SF", unitCost: 0.75 },
    { category: "Material", description: "Transitions & thresholds", quantity: 1, unit: "LOT", unitCost: 150 },
  ],
  "Electrical": [
    { category: "Labor", description: "Rough-in wiring labor", quantity: 20, unit: "HR", unitCost: 95 },
    { category: "Labor", description: "Finish electrical labor", quantity: 10, unit: "HR", unitCost: 95 },
    { category: "Material", description: "Wire, boxes & breakers", quantity: 1, unit: "LOT", unitCost: 600 },
    { category: "Material", description: "Fixtures & devices", quantity: 1, unit: "LOT", unitCost: 400 },
  ],
  "HVAC": [
    { category: "Labor", description: "HVAC installation labor", quantity: 24, unit: "HR", unitCost: 110 },
    { category: "Material", description: "Equipment / unit", quantity: 1, unit: "EA", unitCost: 3500 },
    { category: "Material", description: "Ductwork material", quantity: 1, unit: "LOT", unitCost: 800 },
    { category: "Labor", description: "Duct installation", quantity: 16, unit: "HR", unitCost: 85 },
  ],
  "General": [
    { category: "Labor", description: "General labor", quantity: 8, unit: "HR", unitCost: 65 },
    { category: "Material", description: "Materials allowance", quantity: 1, unit: "LOT", unitCost: 500 },
  ],
};

const JOB_TYPES = Object.keys(TRADE_TEMPLATES);

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent:  "bg-blue-100 text-blue-700",
  won:   "bg-emerald-100 text-emerald-700",
  lost:  "bg-red-100 text-red-700",
};

// ─── Local line-item type (editable) ─────────────────────────────────────────
interface DraftLine {
  category: string;
  description: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

const emptyLine = (): DraftLine => ({
  category: "Labor", description: "", quantity: "1", unit: "HR", unitCost: "0",
});

function lineTotal(l: DraftLine): number {
  const q = parseFloat(l.quantity) || 0;
  const u = parseFloat(l.unitCost) || 0;
  return q * u;
}

// ─── Estimate modal ───────────────────────────────────────────────────────────
export function EstimateModal({
  initial,
  prelinkedJobId,
  prelinkedJobTitle,
  onClose,
  onSave,
}: {
  initial?: Estimate;
  prelinkedJobId?: number;
  prelinkedJobTitle?: string;
  onClose: () => void;
  onSave: (req: CreateEstimateRequest) => void;
}) {
  const { data: clients = [] } = useListClients();

  const [title, setTitle]     = useState(initial?.title ?? "");
  const [clientId, setClientId] = useState<string>(String(initial?.clientId ?? ""));
  const [jobType, setJobType] = useState(initial?.jobType ?? "");
  const [notes, setNotes]     = useState(initial?.notes ?? "");
  const [markup, setMarkup]   = useState(String(initial?.markupPercent ?? ""));
  const [cont, setCont]       = useState(String(initial?.contingencyPercent ?? ""));
  const [lines, setLines]     = useState<DraftLine[]>(
    initial?.lineItems?.length
      ? initial.lineItems.map(l => ({
          category: l.category,
          description: l.description,
          quantity: String(l.quantity),
          unit: l.unit ?? "HR",
          unitCost: String(l.unitCost),
        }))
      : [emptyLine()]
  );
  const [templateApplied, setTemplateApplied] = useState(false);
  const [showTrimCalc, setShowTrimCalc]     = useState(false);
  const [showSidingCalc, setShowSidingCalc] = useState(false);
  const [showFlooringCalc, setShowFlooringCalc] = useState(false);
  const [showPlumbingCalc, setShowPlumbingCalc] = useState(false);

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const markupAmt = markup ? subtotal * (parseFloat(markup) / 100) : 0;
  const afterMarkup = subtotal + markupAmt;
  const contAmt = cont ? afterMarkup * (parseFloat(cont) / 100) : 0;
  const grandTotal = afterMarkup + contAmt;

  function applyTemplate() {
    const tpl = TRADE_TEMPLATES[jobType];
    if (!tpl) return;
    setLines(tpl.map(t => ({
      category: t.category,
      description: t.description,
      quantity: String(t.quantity),
      unit: t.unit,
      unitCost: String(t.unitCost),
    })));
    setTemplateApplied(true);
  }

  function updateLine(i: number, field: keyof DraftLine, val: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()]);
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    if (!title.trim()) return;
    const req: CreateEstimateRequest = {
      title: title.trim(),
      clientId: clientId ? parseInt(clientId) : null,
      jobType: jobType || null,
      notes: notes || null,
      markupPercent: markup ? parseFloat(markup) : null,
      contingencyPercent: cont ? parseFloat(cont) : null,
      status: (initial?.status ?? "draft") as CreateEstimateRequestStatus,
      lineItems: lines.map(l => ({
        category: l.category,
        description: l.description,
        quantity: parseFloat(l.quantity) || 0,
        unit: l.unit || null,
        unitCost: parseFloat(l.unitCost) || 0,
      })),
    };
    const jobId = prelinkedJobId ?? (initial as Estimate & { jobId?: number })?.jobId ?? null;
    if (jobId) (req as Record<string, unknown>).jobId = jobId;
    onSave(req);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl my-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <Calculator className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">
              {initial ? "Edit Estimate" : "Build Estimate"}
            </h2>
            {(prelinkedJobTitle ?? (initial as Estimate & { jobTitle?: string })?.jobTitle) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <Briefcase className="w-3 h-3" />
                {prelinkedJobTitle ?? (initial as Estimate & { jobTitle?: string })?.jobTitle}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Estimate Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="e.g. Johnson Kitchen Remodel"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Client</label>
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="">— No client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Job Type / Trade</label>
              <div className="flex gap-2">
                <select
                  value={jobType}
                  onChange={e => { setJobType(e.target.value); setTemplateApplied(false); }}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                >
                  <option value="">— Select trade —</option>
                  {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {jobType && TRADE_TEMPLATES[jobType] && !templateApplied && (
                  <button
                    type="button"
                    onClick={applyTemplate}
                    className="px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-semibold hover:bg-amber-600 transition-colors whitespace-nowrap"
                  >
                    Use Template
                  </button>
                )}
                {templateApplied && (
                  <span className="flex items-center gap-1 px-3 text-xs text-emerald-600 font-semibold whitespace-nowrap">
                    <Check className="w-3.5 h-3.5" /> Applied
                  </span>
                )}
              </div>
              {jobType && TRADE_TEMPLATES[jobType] && !templateApplied && (
                <p className="text-xs text-amber-600 mt-1">Tap "Use Template" to pre-fill line items for {jobType}</p>
              )}
              {/* Trade-specific interactive calculator buttons */}
              {jobType === "Trim Work" && (
                <button
                  type="button"
                  onClick={() => setShowTrimCalc(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" /> Open Trim Calculator
                </button>
              )}
              {jobType === "Siding" && (
                <button
                  type="button"
                  onClick={() => setShowSidingCalc(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" /> Open Siding Calculator
                </button>
              )}
              {jobType === "Flooring" && (
                <button
                  type="button"
                  onClick={() => setShowFlooringCalc(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" /> Open Flooring Calculator
                </button>
              )}
              {jobType === "Plumbing" && (
                <button
                  type="button"
                  onClick={() => setShowPlumbingCalc(true)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" /> Open Plumbing Calculator
                </button>
              )}
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</label>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1 text-xs text-amber-600 font-semibold hover:text-amber-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>

            {/* Header row */}
            <div className="hidden sm:grid grid-cols-[120px_1fr_70px_60px_90px_80px_28px] gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1 mb-1">
              <span>Category</span><span>Description</span><span>Qty</span><span>Unit</span><span>Unit Cost</span><span className="text-right">Total</span><span />
            </div>

            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[120px_1fr_70px_60px_90px_80px_28px] gap-1.5 p-2 sm:p-0 bg-gray-50 sm:bg-transparent rounded-xl sm:rounded-none">
                  {/* mobile label */}
                  <div className="sm:hidden text-[10px] font-bold text-gray-400 uppercase tracking-wider">Row {i + 1}</div>
                  <select
                    value={l.category}
                    onChange={e => updateLine(i, "category", e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    <option>Labor</option>
                    <option>Material</option>
                    <option>Subcontractor</option>
                    <option>Equipment</option>
                    <option>Other</option>
                  </select>
                  <input
                    value={l.description}
                    onChange={e => updateLine(i, "description", e.target.value)}
                    placeholder="Description"
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    value={l.quantity}
                    onChange={e => updateLine(i, "quantity", e.target.value)}
                    min="0"
                    step="any"
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    value={l.unit}
                    onChange={e => updateLine(i, "unit", e.target.value)}
                    placeholder="HR"
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <input
                    type="number"
                    value={l.unitCost}
                    onChange={e => updateLine(i, "unitCost", e.target.value)}
                    min="0"
                    step="any"
                    placeholder="0.00"
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <div className="flex items-center justify-between sm:justify-end gap-1">
                    <span className="text-xs font-semibold text-gray-700 sm:w-20 sm:text-right">
                      {formatCurrency(lineTotal(l))}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      className="text-gray-300 hover:text-red-400 disabled:opacity-30 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals + markup/contingency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Markup %</label>
                <input
                  type="number"
                  value={markup}
                  onChange={e => setMarkup(e.target.value)}
                  min="0" step="0.5" placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Contingency %</label>
                <input
                  type="number"
                  value={cont}
                  onChange={e => setCont(e.target.value)}
                  min="0" step="0.5" placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Scope notes, exclusions, payment terms…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
            </div>

            {/* Live totals panel */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Running Total</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              {markup && parseFloat(markup) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Markup ({markup}%)</span>
                  <span className="text-emerald-600 font-medium">+ {formatCurrency(markupAmt)}</span>
                </div>
              )}
              {cont && parseFloat(cont) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Contingency ({cont}%)</span>
                  <span className="text-blue-600 font-medium">+ {formatCurrency(contAmt)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-bold text-gray-900">Grand Total</span>
                <span className="font-bold text-lg text-amber-600">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            <Check className="w-4 h-4" /> {initial ? "Save Changes" : "Create Estimate"}
          </button>
        </div>
      </div>

      {/* Trim calculator overlay */}
      {showTrimCalc && (
        <TrimCalculator
          onClose={() => setShowTrimCalc(false)}
          onUseNumbers={calcLines => {
            setLines(calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            })));
            setTemplateApplied(true);
          }}
        />
      )}

      {/* Siding calculator overlay */}
      {showSidingCalc && (
        <SidingCalculator
          onClose={() => setShowSidingCalc(false)}
          onUseNumbers={calcLines => {
            setLines(calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            })));
            setTemplateApplied(true);
          }}
        />
      )}

      {/* Flooring calculator overlay */}
      {showFlooringCalc && (
        <FlooringCalculator
          onClose={() => setShowFlooringCalc(false)}
          onUseNumbers={calcLines => {
            setLines(calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            })));
            setTemplateApplied(true);
          }}
        />
      )}

      {/* Plumbing calculator overlay */}
      {showPlumbingCalc && (
        <PlumbingCalculator
          onClose={() => setShowPlumbingCalc(false)}
          onUseNumbers={calcLines => {
            setLines(calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            })));
            setTemplateApplied(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Status change dropdown ───────────────────────────────────────────────────
const STATUS_SEQUENCE = ["draft", "sent", "won", "lost"] as const;

function StatusMenu({ current, onChange }: { current: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide cursor-pointer ${STATUS_STYLES[current] ?? "bg-gray-100 text-gray-700"}`}
      >
        {current} <ChevronRight className="w-3 h-3 rotate-90" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[100px]">
          {STATUS_SEQUENCE.filter(s => s !== current).map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className="block w-full text-left px-4 py-2 text-xs font-semibold hover:bg-gray-50 capitalize"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Estimates() {
  const { canEdit } = useUserPermissions();
  const qc = useQueryClient();
  const { data: estimates = [], isLoading } = useListEstimates();

  const createMut   = useCreateEstimate();
  const updateMut   = useUpdateEstimate();
  const deleteMut   = useDeleteEstimate();
  const convertMut  = useConvertEstimateToJob();

  const [modal, setModal]         = useState<"create" | number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [converting, setConverting] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListEstimatesQueryKey() });

  async function handleCreate(req: CreateEstimateRequest) {
    await createMut.mutateAsync({ data: req });
    invalidate();
    setModal(null);
  }

  async function handleUpdate(id: number, req: CreateEstimateRequest) {
    await updateMut.mutateAsync({ id, data: req });
    invalidate();
    setModal(null);
  }

  async function handleStatusChange(est: Estimate, status: string) {
    const lineItems = est.lineItems?.map(l => ({
      category: l.category,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit ?? null,
      unitCost: l.unitCost,
    })) ?? [];
    await updateMut.mutateAsync({
      id: est.id,
      data: {
        title: est.title,
        clientId: est.clientId ?? null,
        jobType: est.jobType ?? null,
        notes: est.notes ?? null,
        markupPercent: est.markupPercent ?? null,
        contingencyPercent: est.contingencyPercent ?? null,
        status: status as CreateEstimateRequestStatus,
        lineItems,
      },
    });
    invalidate();
  }

  async function handleDelete(id: number) {
    await deleteMut.mutateAsync({ id });
    invalidate();
    setDeleteTarget(null);
  }

  async function handleConvert(id: number) {
    setConverting(id);
    try {
      await convertMut.mutateAsync({ id });
      invalidate();
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
    } finally {
      setConverting(null);
    }
  }

  const editingEstimate = useMemo(() => {
    if (typeof modal === "number") return estimates.find(e => e.id === modal);
    return undefined;
  }, [modal, estimates]);

  const filtered = filterStatus === "all" ? estimates : estimates.filter(e => e.status === filterStatus);

  const totals = useMemo<Record<string, number>>(() => ({
    all:   estimates.length,
    draft: estimates.filter(e => e.status === "draft").length,
    sent:  estimates.filter(e => e.status === "sent").length,
    won:   estimates.filter(e => e.status === "won").length,
    lost:  estimates.filter(e => e.status === "lost").length,
  }), [estimates]);

  const totalValue = estimates.filter(e => e.status === "won").reduce((s, e) => s + e.total, 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Estimates & Bidding</h1>
          <p className="text-muted-foreground mt-1">Build proposals with trade-specific calculators.</p>
        </div>
        {canEdit("estimates") && (
          <button
            onClick={() => setModal("create")}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold bg-amber-500 text-white hover:bg-amber-600 shadow-md transition-all hover:shadow-lg active:scale-95 text-sm"
          >
            <Calculator className="w-4 h-4 mr-2" /> Build Estimate
          </button>
        )}
      </div>

      {/* Summary bar */}
      {estimates.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-xl border border-border/50 p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Layers className="w-3 h-3" /> Total Estimates</p>
            <p className="text-2xl font-bold text-foreground">{totals.all}</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Open / Sent</p>
            <p className="text-2xl font-bold text-blue-600">{totals.draft + totals.sent}</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Check className="w-3 h-3" /> Won</p>
            <p className="text-2xl font-bold text-emerald-600">{totals.won}</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-4">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Won Value</p>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {estimates.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["all", "draft", "sent", "won", "lost"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${filterStatus === s ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {s === "all" ? `All (${totals.all})` : `${s} (${totals[s] ?? 0})`}
            </button>
          ))}
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {isLoading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-52 bg-card rounded-2xl border border-border/50 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <Calculator className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              {filterStatus === "all" ? "No estimates yet" : `No ${filterStatus} estimates`}
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {filterStatus === "all"
                ? 'Tap "Build Estimate" to create your first bid.'
                : "Change the filter to see other estimates."}
            </p>
          </div>
        ) : (
          filtered.map(est => (
            <div key={est.id} className="bg-card rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-shadow flex flex-col">
              {/* Card header */}
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-2 mb-3">
                  {canEdit("estimates") ? (
                    <StatusMenu
                      current={est.status}
                      onChange={s => handleStatusChange(est, s)}
                    />
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[est.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {est.status}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{formatDate(est.createdAt)}</span>
                </div>

                <h3 className="text-base font-bold text-foreground leading-snug mb-1">{est.title}</h3>
                {est.clientName && (
                  <p className="text-sm text-muted-foreground mb-1">{est.clientName}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {est.jobType && (
                    <span className="inline-block text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                      {est.jobType}
                    </span>
                  )}
                  {(est as Estimate & { jobTitle?: string }).jobTitle && (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 font-medium">
                      <Briefcase className="w-2.5 h-2.5" />
                      {(est as Estimate & { jobTitle?: string }).jobTitle}
                    </span>
                  )}
                </div>

                {/* Line items summary */}
                {est.lineItems && est.lineItems.length > 0 && (
                  <div className="mt-3 space-y-0.5">
                    {est.lineItems.slice(0, 3).map((l, i) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate max-w-[70%]">{l.description}</span>
                        <span>{formatCurrency(l.total ?? l.quantity * l.unitCost)}</span>
                      </div>
                    ))}
                    {est.lineItems.length > 3 && (
                      <p className="text-xs text-muted-foreground italic">+{est.lineItems.length - 3} more items</p>
                    )}
                  </div>
                )}
              </div>

              {/* Total row */}
              <div className="px-5 py-3 border-t border-border/50 bg-muted/20 rounded-b-2xl">
                <div className="flex items-end justify-between">
                  <div>
                    {(est.markupPercent || est.contingencyPercent) && (
                      <p className="text-xs text-muted-foreground">
                        Subtotal {formatCurrency(est.subtotal)}
                        {est.markupPercent ? ` + ${est.markupPercent}% markup` : ""}
                        {est.contingencyPercent ? ` + ${est.contingencyPercent}% contingency` : ""}
                      </p>
                    )}
                    <p className="text-xl font-bold text-foreground">{formatCurrency(est.total)}</p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {canEdit("estimates") && (
                    <button
                      onClick={() => setModal(est.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                  )}
                  {(est.status === "sent" || est.status === "won") && canEdit("estimates") && (
                    <button
                      onClick={() => handleConvert(est.id)}
                      disabled={converting === est.id}
                      className="flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-60"
                    >
                      <Briefcase className="w-3 h-3" />
                      {converting === est.id ? "Converting…" : "Convert to Job"}
                    </button>
                  )}
                  {canEdit("estimates") && (
                    <button
                      onClick={() => setDeleteTarget(est.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 border border-border rounded-lg px-3 py-1.5 hover:border-red-200 hover:bg-red-50 transition-colors ml-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modals */}
      {modal === "create" && (
        <EstimateModal
          onClose={() => setModal(null)}
          onSave={handleCreate}
        />
      )}
      {typeof modal === "number" && editingEstimate && (
        <EstimateModal
          initial={editingEstimate}
          onClose={() => setModal(null)}
          onSave={req => handleUpdate(editingEstimate.id, req)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete estimate?</h3>
                <p className="text-sm text-gray-500">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
