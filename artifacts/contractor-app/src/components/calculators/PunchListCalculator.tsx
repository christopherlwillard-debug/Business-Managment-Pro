import { useState, useMemo } from "react";
import { X, Copy, Check, ChevronRight } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface PunchListCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[], append: boolean) => void;
}

type ServiceType = "half-day" | "full-day";

const SERVICE_OPTIONS: Record<ServiceType, { label: string; subtitle: string; range: string; default: number }> = {
  "half-day": { label: "Half-Day Service", subtitle: "Up to 4 hours", range: "$400–$600", default: 500 },
  "full-day":  { label: "Full-Day Service", subtitle: "Up to 8 hours", range: "$800–$1,200", default: 1000 },
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

export function PunchListCalculator({ onClose, onUseNumbers }: PunchListCalculatorProps) {
  const [serviceType, setServiceType] = useState<ServiceType>("half-day");
  const [servicePrice, setServicePrice] = useState(SERVICE_OPTIONS["half-day"].default);
  const [helperCount, setHelperCount] = useState(0);
  const [helperRate, setHelperRate] = useState(275);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [appendMode, setAppendMode] = useState(true);

  function handleServiceChange(t: ServiceType) {
    setServiceType(t);
    setServicePrice(SERVICE_OPTIONS[t].default);
  }

  const calc = useMemo(() => {
    const helperAmt = helperCount * helperRate;
    const total = servicePrice + helperAmt;
    return { helperAmt, total };
  }, [servicePrice, helperCount, helperRate]);

  function buildLines(): DraftLine[] {
    const lines: DraftLine[] = [];
    const opt = SERVICE_OPTIONS[serviceType];
    lines.push({
      category: "Labor",
      description: `Punch List — ${opt.label} (${opt.subtitle})${notes ? ` — ${notes}` : ""}`,
      quantity: 1,
      unit: "LOT",
      unitCost: servicePrice,
    });
    if (helperCount > 0) {
      lines.push({
        category: "Labor",
        description: `Additional Helper${helperCount > 1 ? "s" : ""} (${helperCount} × $${helperRate}/day)`,
        quantity: helperCount,
        unit: "DAY",
        unitCost: helperRate,
      });
    }
    return lines;
  }

  function handleCopy() {
    const opt = SERVICE_OPTIONS[serviceType];
    const lines = [
      "Punch List Service — Willard's General Contracting",
      `Service: ${opt.label} (${opt.subtitle})  — ${opt.range}`,
      `Price: $${fmtInt(servicePrice)}`,
      helperCount > 0 ? `Additional Helpers: ${helperCount} × $${helperRate}/day = $${fmtInt(calc.helperAmt)}` : null,
      notes ? `Notes: ${notes}` : null,
      "─────────────────────",
      `TOTAL: $${fmtInt(calc.total)}`,
      "",
      "NOTE: Materials billed separately at cost.",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Punch List Calculator</h2>
            <p className="text-xs text-gray-500">Half-day or full-day service · helpers · materials billed separately</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* 1. Service type */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">1 · Service Duration</p>
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(SERVICE_OPTIONS) as [ServiceType, typeof SERVICE_OPTIONS[ServiceType]][]).map(([key, opt]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleServiceChange(key)}
                  className={`py-3 px-4 rounded-xl border-2 text-left transition-all ${
                    serviceType === key
                      ? "border-amber-500 bg-amber-50"
                      : "border-gray-200 hover:border-amber-300"
                  }`}
                >
                  <div className={`text-sm font-bold ${serviceType === key ? "text-amber-700" : "text-gray-700"}`}>{opt.label}</div>
                  <div className={`text-xs mt-0.5 ${serviceType === key ? "text-amber-600" : "text-gray-400"}`}>{opt.subtitle}</div>
                  <div className={`text-xs font-semibold mt-1 ${serviceType === key ? "text-amber-500" : "text-gray-400"}`}>{opt.range}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Service price */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">2 · Service Price</p>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-xl">$</span>
              <input
                type="number" min="0" step="25"
                value={servicePrice}
                onChange={e => setServicePrice(parseFloat(e.target.value) || 0)}
                className="flex-1 px-4 py-3 border-2 border-gray-200 focus:border-amber-400 rounded-xl text-2xl font-bold text-gray-900 focus:outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Range: {SERVICE_OPTIONS[serviceType].range} — adjust as needed
            </p>
          </div>

          {/* 3. Helpers */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">3 · Additional Helpers</p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700 whitespace-nowrap">Number of helpers</label>
                <input
                  type="number" min="0" max="10"
                  value={helperCount || ""}
                  onChange={e => setHelperCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
                />
              </div>
              <span className="text-gray-400 text-sm">@</span>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-sm">$</span>
                <input
                  type="number" min="0" step="25"
                  value={helperRate}
                  onChange={e => setHelperRate(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-gray-400 text-sm">/day</span>
              </div>
              {helperCount > 0 && (
                <span className="text-sm font-bold text-amber-700">= ${fmtInt(calc.helperAmt)}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Typical range: $200–$350/day per helper</p>
          </div>

          {/* 4. Scope notes */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">4 · Scope Notes (optional)</p>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Touch-ups, door adjustments, caulk gaps…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Materials notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">Materials Billed Separately</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Any materials used during the punch list visit are invoiced at cost. Add a separate Materials line item to the estimate if known in advance.
            </p>
          </div>

          {/* Results */}
          <div className="bg-gray-900 rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Total</p>
            {calc.helperAmt > 0 && (
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-gray-300">{SERVICE_OPTIONS[serviceType].label}</span>
                <span className="font-semibold text-white">${fmt(servicePrice)}</span>
              </div>
            )}
            {calc.helperAmt > 0 && (
              <div className="flex justify-between py-1.5 text-sm border-b border-gray-700">
                <span className="text-gray-300">Helpers ({helperCount} × ${helperRate})</span>
                <span className="font-semibold text-white">${fmt(calc.helperAmt)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-3">
              <span className="font-bold text-amber-400 text-base">Service Total</span>
              <span className="font-bold text-amber-400 text-2xl">${fmt(calc.total)}</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">+ Materials at cost (billed separately)</p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button" onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-colors ${
              copied ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy Quote"}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Add to estimate:</span>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setAppendMode(true)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${appendMode ? "bg-amber-500 text-white" : "text-gray-500 hover:text-gray-700"}`}
              >
                Append
              </button>
              <button
                type="button"
                onClick={() => setAppendMode(false)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${!appendMode ? "bg-amber-500 text-white" : "text-gray-500 hover:text-gray-700"}`}
              >
                Replace
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              type="button"
              onClick={() => { onUseNumbers(buildLines(), appendMode); onClose(); }}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
            >
              {appendMode ? "Append to Estimate" : "Replace Lines"} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
