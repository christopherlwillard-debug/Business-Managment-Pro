import { useState, useMemo } from "react";
import { X, Copy, ChevronRight, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface PlumbingCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[]) => void;
}

interface AddOn {
  id: number;
  label: string;
  amount: string;
}

const BASE_CHARGE = 1000;
const EXTRA_DROP_RATE = 125;

const QUICK_EXAMPLES = [
  { drops: 2,  total: 1000 },
  { drops: 4,  total: 1250 },
  { drops: 9,  total: 1875 },
  { drops: 10, total: 2000 },
];

const INCLUDED_ITEMS = [
  "Trip & job-site setup",
  "Main city sewer tie-in",
  "First 2 drops",
  "Basic fittings & pipe allowance",
  "Pressure testing",
  "Cleanup",
];

let nextId = 1;
function makeAddOn(): AddOn {
  return { id: nextId++, label: "", amount: "" };
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PlumbingCalculator({ onClose, onUseNumbers }: PlumbingCalculatorProps) {
  const [drops, setDrops]           = useState(2);
  const [addOns, setAddOns]         = useState<AddOn[]>([]);
  const [includedOpen, setIncludedOpen] = useState(false);
  const [copied, setCopied]         = useState(false);

  const calc = useMemo(() => {
    const extraDrops  = Math.max(0, drops - 2);
    const extraAmt    = extraDrops * EXTRA_DROP_RATE;
    const addOnTotal  = addOns.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    const total       = BASE_CHARGE + extraAmt + addOnTotal;
    return { extraDrops, extraAmt, addOnTotal, total };
  }, [drops, addOns]);

  function addAddOn() {
    setAddOns(a => [...a, makeAddOn()]);
  }

  function removeAddOn(id: number) {
    setAddOns(a => a.filter(x => x.id !== id));
  }

  function updateAddOn(id: number, field: "label" | "amount", value: string) {
    setAddOns(a => a.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  function buildLines(): DraftLine[] {
    const lines: DraftLine[] = [
      {
        category: "Labor",
        description: "Plumbing – Base Charge (2 drops)",
        quantity: 1,
        unit: "LOT",
        unitCost: BASE_CHARGE,
      },
    ];
    if (calc.extraDrops > 0) {
      lines.push({
        category: "Labor",
        description: `Plumbing – Additional Drops (${calc.extraDrops} × $${EXTRA_DROP_RATE})`,
        quantity: calc.extraDrops,
        unit: "EA",
        unitCost: EXTRA_DROP_RATE,
      });
    }
    for (const addon of addOns) {
      const amt = parseFloat(addon.amount) || 0;
      if (amt > 0 && addon.label.trim()) {
        lines.push({
          category: "Labor",
          description: addon.label.trim(),
          quantity: 1,
          unit: "LOT",
          unitCost: amt,
        });
      }
    }
    return lines;
  }

  function copyQuote() {
    const { extraDrops, extraAmt, addOnTotal, total } = calc;
    const lines = [
      "=== PLUMBING ESTIMATE (Willard's General Contracting) ===",
      "",
      `Drops: ${drops}  (${drops <= 2 ? "all included in base" : `2 included + ${extraDrops} additional`})`,
      "",
      `Base charge (first 2 drops):  $${fmt(BASE_CHARGE)}`,
    ];
    if (extraAmt > 0) {
      lines.push(`Additional drops (${extraDrops} × $${EXTRA_DROP_RATE}):  $${fmt(extraAmt)}`);
    }
    for (const addon of addOns) {
      const amt = parseFloat(addon.amount) || 0;
      if (amt > 0 && addon.label.trim()) {
        lines.push(`${addon.label.trim()}:  $${fmt(amt)}`);
      }
    }
    if (addOnTotal > 0) {
      lines.push(`Add-ons total:  $${fmt(addOnTotal)}`);
    }
    lines.push("", `TOTAL ESTIMATE:  $${fmt(total)}`, "");
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Plumbing Calculator</h2>
              <p className="text-xs text-gray-500">Flat-rate drop model · $1,000 base + $125/drop after 2</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* 1. Drops */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">1 · Number of Drops</p>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <input
                  type="number"
                  min={2}
                  value={drops}
                  onChange={e => setDrops(Math.max(2, parseInt(e.target.value) || 2))}
                  className="w-28 text-center text-4xl font-black text-gray-900 border-2 border-gray-200 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                <div className="text-xs text-gray-400 mt-1 font-semibold">min 2</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-700 mb-1">
                  {drops <= 2
                    ? <span className="text-green-600">All {drops} drops included in base charge</span>
                    : <span className="text-amber-700">{calc.extraDrops} additional drop{calc.extraDrops !== 1 ? "s" : ""} beyond the 2 included</span>
                  }
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm font-mono text-gray-700">
                  $1,000 + ({calc.extraDrops} × $125) ={" "}
                  <span className="font-black text-amber-700">${fmt(BASE_CHARGE + calc.extraAmt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. What's included */}
          <div>
            <button
              type="button"
              onClick={() => setIncludedOpen(o => !o)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
            >
              2 · What&apos;s Included in the Base Charge
              {includedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {includedOpen && (
              <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {INCLUDED_ITEMS.map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 rounded-lg px-3 py-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 3. Add-ons */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">3 · Add-ons (optional)</p>
            <div className="space-y-2">
              {addOns.map(addon => (
                <div key={addon.id} className="flex items-center gap-2">
                  <input
                    value={addon.label}
                    onChange={e => updateAddOn(addon.id, "label", e.target.value)}
                    placeholder="e.g. Water Heater Hookup"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="relative w-28">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      value={addon.amount}
                      onChange={e => updateAddOn(addon.id, "amount", e.target.value)}
                      placeholder="0"
                      className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAddOn(addon.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addAddOn}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add extra line item
            </button>
          </div>

          {/* Quick reference table */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Quick Reference</p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_EXAMPLES.map(ex => (
                <button
                  key={ex.drops}
                  type="button"
                  onClick={() => setDrops(ex.drops)}
                  className={`rounded-lg border px-3 py-2 text-center transition-colors hover:border-amber-300 ${
                    drops === ex.drops ? "border-amber-500 bg-amber-50" : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="text-xs text-gray-500 font-semibold">{ex.drops} drops</div>
                  <div className={`text-sm font-black ${drops === ex.drops ? "text-amber-700" : "text-gray-700"}`}>
                    ${ex.total.toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Results panel */}
          <div className="bg-gray-900 text-white rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Results</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-300">Base charge (first 2 drops)</span>
                <span className="font-semibold">${fmt(BASE_CHARGE)}</span>
              </div>
              {calc.extraDrops > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Additional drops ({calc.extraDrops} × ${EXTRA_DROP_RATE})</span>
                  <span className="font-semibold">${fmt(calc.extraAmt)}</span>
                </div>
              )}
              {addOns.filter(a => parseFloat(a.amount) > 0 && a.label.trim()).map(addon => (
                <div key={addon.id} className="flex items-center justify-between py-1 text-sm pl-3">
                  <span className="text-gray-400 truncate mr-4 text-xs">{addon.label}</span>
                  <span className="font-medium text-gray-300 shrink-0">${fmt(parseFloat(addon.amount) || 0)}</span>
                </div>
              ))}
              {calc.addOnTotal > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Add-ons</span>
                  <span className="font-semibold">${fmt(calc.addOnTotal)}</span>
                </div>
              )}
              <div className="border-t border-gray-700 pt-3 mt-2">
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-amber-400 text-base">TOTAL ESTIMATE</span>
                  <span className="font-bold text-amber-400 text-xl">${fmt(calc.total)}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={copyQuote}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-colors ${
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy Quote"}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { onUseNumbers(buildLines()); onClose(); }}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
            >
              Use These Numbers <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
