import { useState, useMemo } from "react";
import { X, Copy, ChevronRight, Zap } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface SidingCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[]) => void;
}

type LaborTier = "on-lot" | "standard" | "premium";

const LABOR_TIERS: Record<LaborTier, { label: string; rate: number; range: string }> = {
  "on-lot":   { label: "On the Lot",  rate: 1.50, range: "$1–$2/SF" },
  "standard": { label: "Standard",    rate: 2.00, range: "$2–$2.50/SF" },
  "premium":  { label: "Premium",     rate: 3.00, range: "$3/SF" },
};

const DOUBLE_WIDE = { width: 36, length: 90, height: 13.6 };

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtSF(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function ceil50(n: number) {
  return Math.ceil(n / 50) * 50;
}

export function SidingCalculator({ onClose, onUseNumbers }: SidingCalculatorProps) {
  const [width, setWidth]   = useState("");
  const [length, setLength] = useState("");
  const [height, setHeight] = useState("");

  const [tier, setTier]       = useState<LaborTier>("standard");
  const [laborRate, setLaborRate] = useState(LABOR_TIERS["standard"].rate);

  const [winQty, setWinQty]   = useState(0);
  const [winRate, setWinRate] = useState(100);
  const [doorQty, setDoorQty] = useState(0);
  const [doorRate, setDoorRate] = useState(137.5);
  const [copied, setCopied] = useState(false);

  const [tearoff, setTearoff]   = useState(false);
  const [tearRate, setTearRate] = useState(1.50);

  const [materialCost, setMaterialCost] = useState("");

  function applyDoubleWide() {
    setWidth(String(DOUBLE_WIDE.width));
    setLength(String(DOUBLE_WIDE.length));
    setHeight(String(DOUBLE_WIDE.height));
  }

  function handleTierChange(t: LaborTier) {
    setTier(t);
    setLaborRate(LABOR_TIERS[t].rate);
  }

  const calc = useMemo(() => {
    const w = parseFloat(width)   || 0;
    const l = parseFloat(length)  || 0;
    const h = parseFloat(height)  || 0;

    const endWallSF   = 2 * w * h;
    const longWallSF  = 2 * l * h;
    const totalSF     = endWallSF + longWallSF;

    const endLaborAmt  = endWallSF  * laborRate;
    const longLaborAmt = longWallSF * laborRate;
    const laborTotal   = endLaborAmt + longLaborAmt;

    const openingsAmt  = winQty * winRate + doorQty * doorRate;
    const tearoffAmt   = tearoff ? totalSF * tearRate : 0;

    const rawMat       = parseFloat(materialCost) || 0;
    const matMarkup    = rawMat * 0.40;
    const matTotal     = rawMat + matMarkup;

    const subtotal  = laborTotal + openingsAmt + tearoffAmt + matTotal;
    const final     = Math.max(500, ceil50(subtotal));

    return {
      w, l, h,
      endWallSF, longWallSF, totalSF,
      endLaborAmt, longLaborAmt, laborTotal,
      openingsAmt, tearoffAmt,
      rawMat, matMarkup, matTotal,
      subtotal, final,
    };
  }, [width, length, height, laborRate, winQty, winRate, doorQty, doorRate, tearoff, tearRate, materialCost]);

  function buildLines(): DraftLine[] {
    const lines: DraftLine[] = [];
    if (calc.endLaborAmt > 0) {
      lines.push({
        category: "Labor",
        description: `Siding Labor – End Walls (${fmtSF(calc.endWallSF)} SF)`,
        quantity: parseFloat(fmtSF(calc.endWallSF)),
        unit: "SF",
        unitCost: laborRate,
      });
    }
    if (calc.longLaborAmt > 0) {
      lines.push({
        category: "Labor",
        description: `Siding Labor – Long Walls (${fmtSF(calc.longWallSF)} SF)`,
        quantity: parseFloat(fmtSF(calc.longWallSF)),
        unit: "SF",
        unitCost: laborRate,
      });
    }
    if (winQty > 0) {
      lines.push({ category: "Labor", description: "Window Surcharge", quantity: winQty, unit: "EA", unitCost: winRate });
    }
    if (doorQty > 0) {
      lines.push({ category: "Labor", description: "Door Surcharge", quantity: doorQty, unit: "EA", unitCost: doorRate });
    }
    if (calc.tearoffAmt > 0) {
      lines.push({
        category: "Labor",
        description: `Tear-off & Disposal (${fmtSF(calc.totalSF)} SF)`,
        quantity: parseFloat(fmtSF(calc.totalSF)),
        unit: "SF",
        unitCost: tearRate,
      });
    }
    if (calc.matTotal > 0) {
      lines.push({ category: "Material", description: "Siding Materials (w/ 40% markup)", quantity: 1, unit: "LOT", unitCost: calc.matTotal });
    }
    const adjustment = calc.final - calc.subtotal;
    if (adjustment > 0.005) {
      lines.push({ category: "Other", description: "Rounding Adjustment (to nearest $50)", quantity: 1, unit: "LOT", unitCost: adjustment });
    }
    return lines;
  }

  function copyQuote() {
    const { endWallSF, longWallSF, totalSF, endLaborAmt, longLaborAmt, openingsAmt, tearoffAmt, matTotal, subtotal, final } = calc;
    const lines = [
      "=== SIDING ESTIMATE (Willard's General Contracting) ===",
      "",
      `Structure: ${calc.w}W × ${calc.l}L × ${calc.h}H ft`,
      `  End walls: ${fmtSF(endWallSF)} SF | Long walls: ${fmtSF(longWallSF)} SF | Total: ${fmtSF(totalSF)} SF`,
      "",
      `Labor Tier: ${LABOR_TIERS[tier].label} (${LABOR_TIERS[tier].range})`,
      `  End walls:  per end $${fmt((endWallSF / 2) * laborRate)}  |  both ends $${fmt(endLaborAmt)}`,
      `  Long walls: per side $${fmt((longWallSF / 2) * laborRate)}  |  both sides $${fmt(longLaborAmt)}`,
    ];
    if (winQty > 0) lines.push(`  Window surcharge (${winQty} @ $${fmt(winRate)}): $${fmt(winQty * winRate)}`);
    if (doorQty > 0) lines.push(`  Door surcharge (${doorQty} @ $${fmt(doorRate)}): $${fmt(doorQty * doorRate)}`);
    if (openingsAmt > 0) lines.push(`  Openings total: $${fmt(openingsAmt)}`);
    if (tearoffAmt > 0) lines.push(`  Tear-off & disposal: $${fmt(tearoffAmt)}`);
    if (matTotal > 0) {
      lines.push(`  Materials (raw $${fmt(calc.rawMat)} + 40% markup): $${fmt(matTotal)}`);
    }
    lines.push("", `Subtotal: $${fmt(subtotal)}`, `Final Price: $${fmt(final)}`, "");
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  const hasStructure = calc.w > 0 && calc.l > 0 && calc.h > 0;

  const rowCls = "flex items-center justify-between py-1.5 text-sm";
  const sectionHd = "text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 mt-4 first:mt-0";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Siding Calculator</h2>
              <p className="text-xs text-gray-500">Wall dimensions → labor → openings → tearoff → materials</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* 1. Structure */}
          <div>
            <p className={sectionHd}>1 · Structure</p>
            <button
              type="button"
              onClick={applyDoubleWide}
              className="mb-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" /> Standard Double Wide (36 × 90 × 13.6 ft)
            </button>
            <div className="grid grid-cols-3 gap-3">
              {([["Width (ft)", width, setWidth], ["Length (ft)", length, setLength], ["Height (ft)", height, setHeight]] as const).map(([label, val, setter]) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                  <input
                    type="number" min="0" step="0.1"
                    value={val}
                    onChange={e => setter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            {hasStructure && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "End Walls", value: calc.endWallSF },
                  { label: "Long Walls", value: calc.longWallSF },
                  { label: "Total SF", value: calc.totalSF, bold: true },
                ].map(({ label, value, bold }) => (
                  <div key={label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
                    <div className={`text-sm ${bold ? "font-bold text-amber-700" : "font-semibold text-gray-700"}`}>
                      {fmtSF(value)} SF
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Labor */}
          <div>
            <p className={sectionHd}>2 · Labor</p>
            <div className="flex gap-2 mb-3">
              {(Object.entries(LABOR_TIERS) as [LaborTier, typeof LABOR_TIERS[LaborTier]][]).map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTierChange(key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                    tier === key
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                  }`}
                >
                  {t.label}
                  <div className={`text-[10px] font-normal mt-0.5 ${tier === key ? "text-amber-100" : "text-gray-400"}`}>{t.range}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Rate ($/SF)</label>
              <input
                type="number" min="0" step="0.25"
                value={laborRate}
                onChange={e => setLaborRate(parseFloat(e.target.value) || 0)}
                className="w-28 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            {hasStructure && (
              <div className="space-y-2">
                {/* End walls breakdown */}
                <div className="bg-blue-50 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-1">End Walls</div>
                  <div className="grid grid-cols-2 gap-x-4 text-xs text-blue-700">
                    <div>Per end: <span className="font-bold">${fmt((calc.endWallSF / 2) * laborRate)}</span></div>
                    <div>Both ends: <span className="font-bold">${fmt(calc.endLaborAmt)}</span></div>
                    <div className="col-span-2 text-[10px] text-blue-400 mt-0.5">{fmtSF(calc.endWallSF / 2)} SF/end × $${laborRate} × 2</div>
                  </div>
                </div>
                {/* Long walls breakdown */}
                <div className="bg-blue-50 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-1">Long Walls</div>
                  <div className="grid grid-cols-2 gap-x-4 text-xs text-blue-700">
                    <div>Per side: <span className="font-bold">${fmt(calc.longWallSF * laborRate / 2)}</span></div>
                    <div>Both sides: <span className="font-bold">${fmt(calc.longLaborAmt)}</span></div>
                    <div className="col-span-2 text-[10px] text-blue-400 mt-0.5">{fmtSF(calc.longWallSF / 2)} SF/side × $${laborRate} × 2</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Openings */}
          <div>
            <p className={sectionHd}>3 · Openings (labor surcharge — customer supplies trim)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Windows</label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0"
                    value={winQty || ""}
                    onChange={e => setWinQty(parseInt(e.target.value) || 0)}
                    placeholder="Qty"
                    className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="text-gray-400 self-center">@</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="5"
                      value={winRate}
                      onChange={e => setWinRate(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <span className="text-gray-400 self-center text-xs">ea</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Exterior Doors</label>
                <div className="flex gap-2">
                  <input
                    type="number" min="0"
                    value={doorQty || ""}
                    onChange={e => setDoorQty(parseInt(e.target.value) || 0)}
                    placeholder="Qty"
                    className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="text-gray-400 self-center">@</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="5"
                      value={doorRate}
                      onChange={e => setDoorRate(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <span className="text-gray-400 self-center text-xs">ea</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Tear-off */}
          <div>
            <p className={sectionHd}>4 · Tear-off & Disposal</p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={tearoff}
                  onChange={e => setTearoff(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                <span className="text-sm font-medium text-gray-700">Include tear-off</span>
              </label>
              {tearoff && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-semibold whitespace-nowrap">$/SF</label>
                  <input
                    type="number" min="0" step="0.25"
                    value={tearRate}
                    onChange={e => setTearRate(parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {hasStructure && <span className="text-xs text-gray-400">= ${fmt(calc.tearoffAmt)}</span>}
                </div>
              )}
            </div>
          </div>

          {/* 5. Materials */}
          <div>
            <p className={sectionHd}>5 · Materials</p>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Raw cost ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number" min="0" step="100"
                  value={materialCost}
                  onChange={e => setMaterialCost(e.target.value)}
                  placeholder="0"
                  className="pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-36"
                />
              </div>
              {calc.rawMat > 0 && (
                <div className="text-xs text-gray-500">
                  + 40% markup = <span className="font-bold text-gray-800">${fmt(calc.matTotal)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Results panel */}
          <div className="bg-gray-900 text-white rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Results</p>
            <div className="space-y-1.5">
              {[
                { label: "End walls labor",  value: calc.endLaborAmt,  show: hasStructure },
                { label: "Long walls labor", value: calc.longLaborAmt, show: hasStructure },
                { label: "Openings",         value: calc.openingsAmt,  show: calc.openingsAmt > 0 },
                { label: "Tear-off",         value: calc.tearoffAmt,   show: tearoff },
                { label: "Materials (w/ 40% markup)", value: calc.matTotal, show: calc.matTotal > 0 },
              ].filter(r => r.show).map(({ label, value }) => (
                <div key={label} className={rowCls}>
                  <span className="text-gray-300">{label}</span>
                  <span className="font-semibold">${fmt(value)}</span>
                </div>
              ))}

              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className={rowCls}>
                  <span className="text-gray-300">Subtotal</span>
                  <span className="font-semibold">${fmt(calc.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-amber-400 text-base">Final Price</span>
                  <span className="font-bold text-amber-400 text-xl">${fmt(calc.final)}</span>
                </div>
                <p className="text-[10px] text-gray-500">Rounded up to nearest $50 · Minimum $500</p>
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
