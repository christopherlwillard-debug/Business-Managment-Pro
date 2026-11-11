import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "wouter";
import {
  useListEstimates, useListClients, useGetSettings,
  useCreateEstimate, useUpdateEstimate, useConvertEstimateToJob,
  getListEstimatesQueryKey,
  useGetEstimateQuoteCenter, getGetEstimateQuoteCenterQueryKey,
  Estimate, CreateEstimateRequest, CreateEstimateRequestStatus, AppSettings,
  useCreateQuickCharge,
  useCreateEstimateDepositLink,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { roundQuoteMoney } from "@/lib/aerialQuotePricing";
import { belongsToSelectedBusiness } from "@/lib/businessOwnership";
import {
  Calculator, FileText, Plus, Trash2, Edit2, X,
  ChevronRight, Check, Briefcase, DollarSign, Layers, ClipboardList,
  CreditCard, ExternalLink, Copy, CheckCircle2,
  Mail,
} from "lucide-react";
import { AllTradesCalculator } from "@/components/calculators/AllTradesCalculator";
import { AsphaltCalculator } from "@/components/calculators/AsphaltCalculator";
import { ContractingCalculator } from "@/components/calculators/ContractingCalculator";
import { FlooringCalculator } from "@/components/calculators/FlooringCalculator";
import { PlumbingCalculator } from "@/components/calculators/PlumbingCalculator";
import { PunchListCalculator } from "@/components/calculators/PunchListCalculator";
import { CustomerQuotePreview } from "@/components/CustomerQuotePreview";
import { QuoteSendDialog } from "@/components/estimates/QuoteSendDialog";
import { QuoteHistoryPanel } from "@/components/estimates/QuoteHistoryPanel";
import { QuoteCenterBoard } from "@/components/estimates/QuoteCenterBoard";

// ─── Asphalt Sealing Proposal template seed data ─────────────────────────────
const ASPHALT_SEALING_PROPOSAL = {
  jobType: "Asphalt Sealing",
  notes: `PAYMENT TERMS: 50% deposit required before work begins. Remaining balance due upon project completion. We accept cash, check, and all major credit cards.\n\nWARRANTY: Workmanship is warranted for 1 year from the date of service. Sealer manufacturer's warranty applies to materials. Warranty is void if surface is damaged by traffic within 24 hours of application.\n\nSCOPE NOTES: Price is based on surface area provided. Any additional cracks, potholes, or damage found on-site will be quoted separately before work proceeds. Driveways should be clear of vehicles and debris on the day of service.\n\nEXCLUSIONS: Structural repairs, removal of oil stains deeper than surface level, and landscaping disturbance are not included unless specifically listed above.`,
  lineItems: [
    { category: "Labor", description: "Surface preparation — sweep, blow clean, remove debris", quantity: 1, unit: "LOT", unitCost: 0 },
    { category: "Labor", description: "Crack filling — clean and fill existing cracks", quantity: 1, unit: "LOT", unitCost: 0 },
    { category: "Material", description: "Crack filler material", quantity: 1, unit: "LOT", unitCost: 0 },
    { category: "Labor", description: "Sealer application — 1 coat (squeegee & brush method)", quantity: 1000, unit: "SF", unitCost: 0.18 },
    { category: "Material", description: "Coal tar / asphalt-based sealer", quantity: 1, unit: "LOT", unitCost: 0 },
    { category: "Labor", description: "Edges and borders — hand-brush detail work", quantity: 1, unit: "LOT", unitCost: 0 },
    { category: "Labor", description: "Cleanup and site restoration", quantity: 1, unit: "LOT", unitCost: 0 },
  ],
} as const;

type EstimateTemplate = "blank" | "asphalt_sealing_proposal";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

function StatusMenu({ current, onChange }: { current: string; onChange: (status: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(value => !value)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[current] ?? "bg-gray-100 text-gray-700"}`}>
        {current} <ChevronRight className="h-3 w-3 rotate-90" />
      </button>
      {open && <div className="absolute left-0 top-full z-20 mt-1 min-w-[100px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
        {(["draft", "sent", "won", "lost"] as const).filter(status => status !== current).map(status => (
          <button key={status} onClick={() => { onChange(status); setOpen(false); }} className="block w-full px-4 py-2 text-left text-xs font-semibold capitalize hover:bg-gray-50">{status}</button>
        ))}
      </div>}
    </div>
  );
}

// ─── Template picker modal ────────────────────────────────────────────────────
function TemplatePicker({ onSelect, onClose, businessLine }: {
  onSelect: (template: EstimateTemplate) => void;
  onClose: () => void;
  businessLine: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">New Quote</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-500 mb-4">Choose a starting point for your quote:</p>
          <div className="space-y-3">
            <button
              onClick={() => onSelect("blank")}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-amber-100 flex items-center justify-center shrink-0 transition-colors">
                <FileText className="w-5 h-5 text-gray-500 group-hover:text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Blank Quote</p>
                <p className="text-xs text-gray-500 mt-0.5">Start from scratch with empty line items and no preset values.</p>
              </div>
            </button>
            {businessLine === "asphalt_sealing" && (
              <button
                onClick={() => onSelect("asphalt_sealing_proposal")}
                className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-700 hover:bg-gray-50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-gray-700 flex items-center justify-center shrink-0 transition-colors">
                  <ClipboardList className="w-5 h-5 text-gray-500 group-hover:text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Asphalt Sealing Proposal</p>
                  <p className="text-xs text-gray-500 mt-0.5">Pre-filled with standard scope of work: surface prep, crack fill, sealer coat, edges, and cleanup. Includes standard payment terms and warranty language.</p>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  return roundQuoteMoney(q * u);
}

// ─── Estimate modal ───────────────────────────────────────────────────────────
export function EstimateModal({
  initial,
  prelinkedJobId,
  prelinkedJobTitle,
  prelinkedJobAddress,
  prelinkedClientId,
  fromTemplate,
  initialBusinessLine,
  onClose,
  onSave,
}: {
  initial?: Estimate;
  prelinkedJobId?: number;
  prelinkedJobTitle?: string;
  prelinkedJobAddress?: string;
  prelinkedClientId?: number;
  fromTemplate?: EstimateTemplate;
  initialBusinessLine?: string;
  onClose: () => void;
  onSave: (req: CreateEstimateRequest) => void;
}) {
  const qc = useQueryClient();
  const { data: clients = [] } = useListClients();
  const { data: settings } = useGetSettings();
  const { businesses } = useBusiness();
  const s = (settings ?? {}) as AppSettings;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const seedData = fromTemplate === "asphalt_sealing_proposal" ? ASPHALT_SEALING_PROPOSAL : null;
  const initialBusinessId = typeof initial?.businessId === "number" ? initial.businessId : null;
  const initialOwner = initialBusinessId == null
    ? undefined
    : businesses.find(business => business.id === initialBusinessId);

  const [title, setTitle]     = useState(initial?.title ?? "");
  const [clientId, setClientId] = useState<string>(String(initial?.clientId ?? prelinkedClientId ?? ""));
  const selectedClient = clients.find(client => client.id === Number(clientId));
  const clientAddress = selectedClient
    ? [selectedClient.address, selectedClient.city, selectedClient.state, selectedClient.zip].filter(Boolean).join(", ")
    : "";
  const defaultWorkAddress = prelinkedJobAddress || clientAddress;
  const [workAddress, setWorkAddress] = useState<string>(
    typeof initial?.workAddress === "string" ? initial.workAddress : (prelinkedJobAddress ?? ""),
  );
  const [jobType] = useState(initial?.jobType ?? seedData?.jobType ?? "");
  const [notes, setNotes]     = useState(initial?.notes ?? seedData?.notes ?? "");
  const [customerNotes, setCustomerNotes] = useState<string>(
    typeof initial?.customerNotes === "string" ? initial.customerNotes : "",
  );
  const [markup, setMarkup]   = useState(String(initial?.markupPercent ?? ""));
  const [cont, setCont]       = useState(String(initial?.contingencyPercent ?? ""));
  const businessLine = initial
    ? (initialOwner?.slug ?? initial.businessLine ?? "")
    : (fromTemplate === "asphalt_sealing_proposal" ? "asphalt_sealing" : (initialBusinessLine ?? "general_contracting"));
  const selectedBusiness = businesses.find(business => business.slug === businessLine) ?? initialOwner;
  const [lines, setLines]     = useState<DraftLine[]>(
    initial?.lineItems?.length
      ? initial.lineItems.map(l => ({
          category: l.category,
          description: l.description,
          quantity: String(l.quantity),
          unit: l.unit ?? "HR",
          unitCost: String(l.unitCost),
        }))
      : seedData?.lineItems.length
        ? seedData.lineItems.map(l => ({
            category: l.category,
            description: l.description,
            quantity: String(l.quantity),
            unit: l.unit,
            unitCost: String(l.unitCost),
          }))
        : [emptyLine()]
  );
  const [showAllTradesCalc, setShowAllTradesCalc]       = useState(false);
  const [showAsphaltCalc, setShowAsphaltCalc]           = useState(false);
  const [showContractingCalc, setShowContractingCalc]   = useState(false);
  const [showFlooringCalc, setShowFlooringCalc]         = useState(false);
  const [showPlumbingCalc, setShowPlumbingCalc]         = useState(false);
  const [showPunchListCalc, setShowPunchListCalc]       = useState(false);
  const [depositLinkResult, setDepositLinkResult] = useState<{ url: string; amount: number } | null>(null);
  const createQuickCharge = useCreateQuickCharge();

  const isTaxLine = (line: DraftLine) => line.category.trim().toLowerCase() === "tax";
  const subtotal = roundQuoteMoney(lines.filter(line => !isTaxLine(line)).reduce((acc, line) => acc + lineTotal(line), 0));
  const taxAmount = roundQuoteMoney(lines.filter(isTaxLine).reduce((acc, line) => acc + lineTotal(line), 0));
  const markupAmt = markup ? roundQuoteMoney(subtotal * (parseFloat(markup) / 100)) : 0;
  const afterMarkup = subtotal + markupAmt;
  const contAmt = cont ? roundQuoteMoney(afterMarkup * (parseFloat(cont) / 100)) : 0;
  const grandTotal = roundQuoteMoney(afterMarkup + contAmt + taxAmount);

  const effectiveLogoUrl: string | null =
    (businessLine === "asphalt_sealing" ? (s.dbaLogoUrl ?? s.logoUrl) : s.logoUrl) ?? null;

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
      workAddress: workAddress.trim() || defaultWorkAddress || null,
      jobType: jobType || null,
      notes: notes || null,
      customerNotes: customerNotes || null,
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
      businessLine: selectedBusiness?.slug ?? (initialBusinessId != null ? null : (businessLine || null)),
      ...(selectedBusiness
        ? { businessId: selectedBusiness.id }
        : initialBusinessId != null
          ? { businessId: initialBusinessId }
          : {}),
    };
    const jobId = prelinkedJobId ?? (initial as Estimate & { jobId?: number })?.jobId ?? null;
    if (jobId) (req as unknown as Record<string, unknown>).jobId = jobId;
    onSave(req);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl my-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            {effectiveLogoUrl ? (
              <img src={`${base}${effectiveLogoUrl}`} alt="Logo" className="h-7 w-auto object-contain flex-shrink-0" />
            ) : (
              <Calculator className="w-5 h-5 text-amber-500" />
            )}
            <h2 className="text-lg font-bold text-gray-900">
              {initial ? "Edit Quote" : "Build Quote"}
            </h2>
            {(prelinkedJobTitle ?? (initial as Estimate & { jobTitle?: string })?.jobTitle) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <Briefcase className="w-3 h-3" />
                {prelinkedJobTitle ?? (initial as Estimate & { jobTitle?: string })?.jobTitle}
              </span>
            )}
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ml-2 ${businessLine === "asphalt_sealing" ? "bg-gray-800 text-white" : "bg-amber-100 text-amber-800"}`}>
              {businessLine === "asphalt_sealing" ? "Asphalt Sealing" : "Contracting"}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Template banner */}
          {fromTemplate === "asphalt_sealing_proposal" && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-medium">
              <ClipboardList className="w-4 h-4 shrink-0 text-gray-300" />
              <span>Starting from: <span className="font-bold text-white">Asphalt Sealing Proposal</span></span>
              <span className="ml-auto text-xs text-gray-400 font-normal">All fields are editable</span>
            </div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Quote Title *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder={prelinkedJobId ? "e.g. Siding, Trim Work, Drywall Finishing…" : "e.g. Johnson Kitchen Remodel"}
              />
            </div>
            {prelinkedClientId && !initial ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Client</label>
                <div className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-700">
                  {clients.find(c => c.id === prelinkedClientId)?.name ?? "Linked to job"}
                </div>
              </div>
            ) : (
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
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Work address</label>
              <input
                value={workAddress}
                onChange={e => setWorkAddress(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder={defaultWorkAddress || "Enter the service or job location"}
                autoComplete="street-address"
              />
              <p className="mt-1 text-xs text-gray-500">
                {prelinkedJobAddress
                  ? "Prefilled from this job. You can change it for this quote."
                  : "Defaults to the client address when left blank. Saved on this quote."}
              </p>
            </div>
            {/* Trade-specific calculators */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Calculators</label>
              {businessLine !== "asphalt_sealing" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAllTradesCalc(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors"
                  >
                    <Calculator className="w-3.5 h-3.5" /> All Trades
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowContractingCalc(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-700 text-white text-xs font-bold hover:bg-zinc-600 transition-colors"
                  >
                    <Calculator className="w-3.5 h-3.5" /> Contracting
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFlooringCalc(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-700 text-white text-xs font-bold hover:bg-zinc-600 transition-colors"
                  >
                    <Calculator className="w-3.5 h-3.5" /> Flooring
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPlumbingCalc(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-700 text-white text-xs font-bold hover:bg-zinc-600 transition-colors"
                  >
                    <Calculator className="w-3.5 h-3.5" /> Plumbing
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPunchListCalc(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-700 text-white text-xs font-bold hover:bg-zinc-600 transition-colors"
                  >
                    <Calculator className="w-3.5 h-3.5" /> Punch List
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAsphaltCalc(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-700 text-white text-xs font-bold hover:bg-gray-800 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" /> Asphalt Sealing Calculator
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
                    <option>Adjustment</option>
                    <option>Tax</option>
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
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Internal notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Private estimating or job notes — not shown to customers."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer-facing notes and terms</label>
                <textarea
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                  rows={3}
                  placeholder="Payment terms, exclusions, or instructions for the customer."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
                />
                <p className="mt-1 text-xs text-gray-500">This text appears on the customer quote preview. Keep private details in Internal notes.</p>
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
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Sales tax</span>
                  <span className="text-gray-700 font-medium">+ {formatCurrency(taxAmount)}</span>
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

      {/* All Trades calculator overlay */}
      {showAllTradesCalc && (
        <AllTradesCalculator
          onClose={() => setShowAllTradesCalc(false)}
          calculatorDefaults={s.calculatorDefaults ?? null}
          onSaveDefaults={async (defaults) => {
            const base = import.meta.env.BASE_URL.replace(/\/$/, "");
            const res = await fetch(`${base}/api/settings`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ calculatorDefaults: defaults }),
            });
            if (!res.ok) throw new Error(`Failed to save rates: ${res.status}`);
            qc.invalidateQueries({ queryKey: ["settings"] });
          }}
          onUseNumbers={(calcLines, append) => {
            const mapped = calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            }));
            setLines(prev => append ? [...prev, ...mapped] : mapped);
          }}
        />
      )}

      {/* Asphalt Sealing calculator overlay */}
      {showAsphaltCalc && (
        <AsphaltCalculator
          onClose={() => setShowAsphaltCalc(false)}
          onUseNumbers={calcLines => {
            setLines(calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            })));
          }}
          onRequestDeposit={async (totalAmount, description) => {
            try {
              const charge = await createQuickCharge.mutateAsync({
                label: description || `Asphalt Sealing — ${title || "New Estimate"}`,
                amount: totalAmount,
                notes: title ? `Estimate: ${title}` : "Asphalt sealing calculator quote",
              });
              if (charge.squarePaymentLinkUrl) {
                setDepositLinkResult({ url: charge.squarePaymentLinkUrl, amount: totalAmount });
                setShowAsphaltCalc(false);
              }
            } catch {
              alert("Failed to create payment link. Make sure Square is configured.");
            }
          }}
        />
      )}

      {/* Contracting calculator overlay */}
      {showContractingCalc && (
        <ContractingCalculator
          onClose={() => setShowContractingCalc(false)}
          onUseNumbers={(calcLines, append) => {
            const mapped = calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            }));
            setLines(prev => append ? [...prev, ...mapped] : mapped);
          }}
        />
      )}

      {/* Flooring calculator overlay */}
      {showFlooringCalc && (
        <FlooringCalculator
          onClose={() => setShowFlooringCalc(false)}
          onUseNumbers={(calcLines, append) => {
            const mapped = calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            }));
            setLines(prev => append ? [...prev, ...mapped] : mapped);
          }}
        />
      )}

      {/* Plumbing calculator overlay */}
      {showPlumbingCalc && (
        <PlumbingCalculator
          onClose={() => setShowPlumbingCalc(false)}
          onUseNumbers={(calcLines, append) => {
            const mapped = calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            }));
            setLines(prev => append ? [...prev, ...mapped] : mapped);
          }}
        />
      )}

      {/* Punch List calculator overlay */}
      {showPunchListCalc && (
        <PunchListCalculator
          onClose={() => setShowPunchListCalc(false)}
          onUseNumbers={(calcLines, append) => {
            const mapped = calcLines.map(l => ({
              category: l.category,
              description: l.description,
              quantity: String(l.quantity),
              unit: l.unit,
              unitCost: String(l.unitCost),
            }));
            setLines(prev => append ? [...prev, ...mapped] : mapped);
          }}
        />
      )}

      {/* Deposit link result modal */}
      {depositLinkResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" /> Payment Link Ready
              </h3>
              <button type="button" onClick={() => setDepositLinkResult(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              A Square payment link for <strong>${depositLinkResult.amount.toFixed(2)}</strong> has been created.
              Share this link with your customer to collect payment.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 break-all font-mono">{depositLinkResult.url}</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(depositLinkResult.url)}
                className="flex-1 py-2 text-sm font-semibold border border-gray-300 rounded-xl hover:bg-gray-50"
              >
                Copy Link
              </button>
              <a
                href={depositLinkResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
              >
                Open <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Estimates() {
  const { canEdit } = useUserPermissions();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeBusiness, businesses } = useBusiness();

  const createMut   = useCreateEstimate();
  const updateMut   = useUpdateEstimate();
  const convertMut  = useConvertEstimateToJob();
  const depositLinkMut = useCreateEstimateDepositLink();
  const { data: clients = [] } = useListClients();

  const [modal, setModal]         = useState<"create" | number | null>(null);
  const [previewEstimate, setPreviewEstimate] = useState<Estimate | null>(null);
  const [sendTarget, setSendTarget] = useState<Estimate | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Estimate | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<EstimateTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [deletingEstimateId, setDeletingEstimateId] = useState<number | null>(null);
  const [converting, setConverting] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [depositLinkResult, setDepositLinkResult] = useState<{ url: string; title: string } | null>(null);
  const [generatingDepositId, setGeneratingDepositId] = useState<number | null>(null);
  const hasWillardsDivisions = activeBusiness != null
    && activeBusiness.legalBusinessId === activeBusiness.id
    && businesses.some(business => business.id !== activeBusiness.id && business.legalBusinessId === activeBusiness.id);
  const defaultTab = hasWillardsDivisions ? "all" : activeBusiness?.slug ?? businesses[0]?.slug ?? "";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  useEffect(() => {
    if (activeBusiness) {
      setActiveTab(hasWillardsDivisions ? "all" : activeBusiness.slug);
    } else if (businesses.length > 0 && !businesses.find(b => b.slug === activeTab)) {
      setActiveTab(businesses[0].slug);
    }
  }, [activeBusiness, businesses, hasWillardsDivisions]);

  const activeBusinessLine = activeTab === "all"
    ? activeBusiness?.slug ?? businesses[0]?.slug ?? ""
    : activeTab;
  const selectedBusiness = businesses.find(business => business.slug === activeBusinessLine);
  const estimateParams = activeBusiness
    ? (hasWillardsDivisions && activeTab === "all"
      ? { businessId: activeBusiness.id }
      : { businessLine: activeBusinessLine })
    : (activeBusinessLine ? { businessLine: activeBusinessLine } : undefined);
  const { data: estimates = [], isLoading, isError, error: estimatesError, refetch } = useListEstimates(estimateParams);
  const {
    data: quoteCenter,
    isLoading: quoteCenterLoading,
    isError: quoteCenterError,
    error: quoteCenterLoadError,
    refetch: refetchQuoteCenter,
  } = useGetEstimateQuoteCenter(estimateParams);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListEstimatesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetEstimateQuoteCenterQueryKey(estimateParams) });
  };

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || isLoading || estimates.length === 0) return;
    const id = parseInt(openId);
    if (isNaN(id)) return;
    const found = estimates.find(e => e.id === id);
    if (found) {
      setModal(id);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete("open");
        return next;
      }, { replace: true });
    }
  }, [searchParams, estimates, isLoading]);

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
        ...(typeof est.businessId === "number"
          ? { businessId: est.businessId }
          : { businessLine: est.businessLine ?? null }),
      },
    });
    invalidate();
  }

  async function handleDelete(id: number) {
    const estimate = estimates.find(item => item.id === id);
    const params = new URLSearchParams();
    if (typeof estimate?.businessId === "number") params.set("businessId", String(estimate.businessId));
    else params.set("businessLine", estimate?.businessLine ?? activeBusinessLine);
    setDeletingEstimateId(id);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/api/estimates/${id}?${params.toString()}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not delete this quote.");
      }
      invalidate();
      setDeleteTarget(null);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Could not delete this quote.", variant: "destructive" });
    } finally {
      setDeletingEstimateId(null);
    }
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

  async function handleRequestDeposit(est: Estimate) {
    setGeneratingDepositId(est.id);
    try {
      const result = await depositLinkMut.mutateAsync({ id: est.id, depositPercent: 50 });
      setDepositLinkResult({ url: result.paymentLinkUrl, title: est.title });
      invalidate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create deposit link";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setGeneratingDepositId(null);
    }
  }

  const editingEstimate = useMemo(() => {
    if (typeof modal === "number") return estimates.find(e => e.id === modal);
    return undefined;
  }, [modal, estimates]);

  const tabEstimates = useMemo(() =>
    activeTab === "all"
      ? estimates
      : selectedBusiness
      ? estimates.filter(estimate => belongsToSelectedBusiness(estimate, selectedBusiness))
      : [],
    [estimates, selectedBusiness, activeTab]);

  const filtered = filterStatus === "all" ? tabEstimates : tabEstimates.filter(estimate => estimate.status === filterStatus);
  const totals: Record<string, number> = {
    all: tabEstimates.length,
    draft: tabEstimates.filter(estimate => estimate.status === "draft").length,
    sent: tabEstimates.filter(estimate => estimate.status === "sent").length,
    won: tabEstimates.filter(estimate => estimate.status === "won").length,
    lost: tabEstimates.filter(estimate => estimate.status === "lost").length,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Quote Center</h1>
          <p className="text-muted-foreground mt-1">Create service, maintenance, and project quotes in one place.</p>
        </div>
        {canEdit("estimates") && (
          <button
            onClick={() => activeBusinessLine === "asphalt_sealing" ? setShowTemplatePicker(true) : setModal("create")}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold bg-amber-500 text-white hover:bg-amber-600 shadow-md transition-all hover:shadow-lg active:scale-95 text-sm"
          >
            <Calculator className="w-4 h-4 mr-2" /> Build Quote
          </button>
        )}
      </div>

      {/* Business line tabs — only shown in All Businesses mode */}
      {(activeBusiness === null || hasWillardsDivisions) && (
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(hasWillardsDivisions
          ? [{ id: activeBusiness!.id, slug: "all", name: "All Willard's" }, ...businesses.filter(b => b.legalBusinessId === activeBusiness!.id && b.id !== activeBusiness!.id)]
          : businesses).map(b => (
          <button
            key={b.slug}
            onClick={() => { setActiveTab(b.slug); setFilterStatus("all"); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === b.slug ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {b.name}
          </button>
        ))}
      </div>
      )}

      {(quoteCenterLoading || isLoading) ? (
        <div className="space-y-3" aria-label="Loading Quote Center">
          {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl border border-[#dce2e4] bg-card" />)}
        </div>
      ) : quoteCenterError || isError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Quote Center could not be loaded.</p>
          <p className="mt-1">{quoteCenterLoadError instanceof Error ? quoteCenterLoadError.message : estimatesError instanceof Error ? estimatesError.message : "Please try again."}</p>
          <button onClick={() => { void refetchQuoteCenter(); void refetch(); }} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-red-100">Retry</button>
        </div>
      ) : (
        <QuoteCenterBoard
          items={quoteCenter?.items ?? []}
          summary={quoteCenter?.summary}
          estimates={tabEstimates}
          centerParams={estimateParams}
          canEdit={canEdit("estimates")}
          onEdit={estimate => setModal(estimate.id)}
          onPreview={setPreviewEstimate}
          onSend={setSendTarget}
          onHistory={setHistoryTarget}
          onConvert={estimate => { void handleConvert(estimate.id); }}
          onDeposit={estimate => {
            if (estimate.depositPaidAt) return;
            if (estimate.squarePaymentLinkUrl ?? estimate.stripePaymentLinkUrl) {
              setDepositLinkResult({ url: (estimate.squarePaymentLinkUrl ?? estimate.stripePaymentLinkUrl)!, title: estimate.title });
            } else {
              void handleRequestDeposit(estimate);
            }
          }}
          onDeleteDraft={estimate => setDeleteTarget(estimate.id)}
        />
      )}

      <div className="hidden" aria-hidden="true">
      {/* Summary bar */}
      {tabEstimates.length > 0 && (
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
            <p className="text-xl font-bold text-emerald-600">—</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {tabEstimates.length > 0 && (
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
              {filterStatus === "all"
                ? `No ${businesses.find(b => b.slug === activeTab)?.name ?? activeTab} quotes yet`
                : `No ${filterStatus} quotes`}
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {filterStatus === "all"
                ? 'Tap "Build Quote" to create your first quote.'
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
                  <button
                    onClick={() => setPreviewEstimate(est)}
                    className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
                  >
                    <FileText className="w-3 h-3" /> Customer Preview
                  </button>
                  {canEdit("estimates") && est.status !== "lost" && (
                    <button
                      onClick={() => setSendTarget(est)}
                      className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-50 transition-colors"
                    >
                      <Mail className="w-3 h-3" /> Send Quote
                    </button>
                  )}
                  {canEdit("estimates") && (
                    <button
                      onClick={() => setHistoryTarget(est)}
                      className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      <FileText className="w-3 h-3" /> Quote History
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
                  {/* Deposit button / status for asphalt sealing estimates */}
                  {(est.businessLine === "asphalt_sealing" || est.jobType === "Asphalt Sealing") &&
                    (est.status === "sent" || est.status === "won") &&
                    parseFloat(String(est.total)) > 0 && (
                    est.depositPaidAt ? (
                      <div className="flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-1.5 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                        Deposit Received{est.depositPaidAmount != null ? ` — ${formatCurrency(Number(est.depositPaidAmount))}` : ""}
                      </div>
                    ) : canEdit("estimates") && (
                      (est.squarePaymentLinkUrl ?? est.stripePaymentLinkUrl) ? (
                        <button
                          onClick={() => setDepositLinkResult({ url: (est.squarePaymentLinkUrl ?? est.stripePaymentLinkUrl)!, title: est.title })}
                          className="flex items-center gap-1 text-xs text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 font-semibold transition-colors"
                        >
                          <CreditCard className="w-3 h-3" /> Deposit Link
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRequestDeposit(est)}
                          disabled={generatingDepositId === est.id}
                          className="flex items-center gap-1 text-xs text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-60"
                        >
                          <CreditCard className="w-3 h-3" />
                          {generatingDepositId === est.id ? "Generating…" : "Request 50% Deposit"}
                        </button>
                      )
                    )
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
      </div>

      {/* Template picker */}
      {showTemplatePicker && (
        <TemplatePicker
          businessLine={activeBusinessLine}
          onSelect={template => {
            setActiveTemplate(template);
            setShowTemplatePicker(false);
            setModal("create");
          }}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}

      {/* Modals */}
      {previewEstimate && (
        <CustomerQuotePreview estimate={previewEstimate} onClose={() => setPreviewEstimate(null)} />
      )}
      {sendTarget && (
        <QuoteSendDialog
          estimate={{ id: sendTarget.id, title: sendTarget.title, total: sendTarget.total }}
          recipient={clients.find(client => client.id === sendTarget.clientId)?.email ?? ""}
          businessId={typeof sendTarget.businessId === "number" ? sendTarget.businessId : null}
          businessLine={sendTarget.businessLine ?? activeBusinessLine}
          onClose={() => setSendTarget(null)}
          onSent={invalidate}
        />
      )}
      {historyTarget && (
        <QuoteHistoryPanel
          estimate={{ id: historyTarget.id, title: historyTarget.title }}
          businessId={typeof historyTarget.businessId === "number" ? historyTarget.businessId : null}
          businessLine={historyTarget.businessLine ?? activeBusinessLine}
          onClose={() => setHistoryTarget(null)}
        />
      )}
      {modal === "create" && (
        <EstimateModal
          fromTemplate={activeTemplate ?? undefined}
          initialBusinessLine={activeBusinessLine}
          onClose={() => { setModal(null); setActiveTemplate(null); }}
          onSave={async req => { await handleCreate(req); setActiveTemplate(null); }}
        />
      )}
      {typeof modal === "number" && editingEstimate && (
        <EstimateModal
          initial={editingEstimate}
          onClose={() => setModal(null)}
          onSave={req => handleUpdate(editingEstimate.id, req)}
        />
      )}

      {/* Deposit link result modal */}
      {depositLinkResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Deposit Link Ready</h3>
                  <p className="text-sm text-gray-500 truncate max-w-[240px]">{depositLinkResult.title}</p>
                </div>
                <button
                  onClick={() => setDepositLinkResult(null)}
                  className="ml-auto p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <p className="text-xs text-gray-500 mb-1 font-medium">Square Payment Link (50% Deposit)</p>
                <p className="text-sm text-gray-800 break-all font-mono">{depositLinkResult.url}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(depositLinkResult.url)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-semibold text-sm hover:bg-amber-600 transition-colors"
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
                Share this link with the customer to collect the 50% deposit via Square.
              </p>
            </div>
          </div>
        </div>
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
                disabled={deletingEstimateId === deleteTarget}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
              >
                {deletingEstimateId === deleteTarget ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
