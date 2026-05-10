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

type PricingMode = "per-end" | "per-sf";
type LaborTier = "on-lot" | "standard" | "premium";

const LABOR_TIERS: Record<LaborTier, { label: string; rate: number; range: string }> = {
  "on-lot":   { label: "On the Lot", rate: 1.50, range: "$1–$2/SF"    },
  "standard": { label: "Standard",   rate: 2.00, range: "$2–$2.50/SF" },
  "premium":  { label: "Premium",    rate: 3.00, range: "$3/SF"        },
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
  const [mode, setMode] = useState<PricingMode>("per-end");

  // Per End state
  const [endCount, setEndCount] = useState(2);
  const [endRate, setEndRate]   = useState(600);

  // Per SF state
  const [width, setWidth]   = useState("");
  const [length, setLength] = useState("");
  const [height, setHeight] = useState("");
  const [tier, setTier]         = useState<LaborTier>("standard");
  const [laborRate, setLaborRate] = useState(LABOR_TIERS["standard"].rate);

  // Add-ons (always visible)
  const [winQty, setWinQty]   = useState(0);
  const [winRate, setWinRate] = useState(150);
  const [doorQty, setDoorQty] = useState(0);
  const [doorRate, setDoorRate] = useState(250);

  // Tear-off
  const [tearoff, setTearoff]     = useState(false);
  const [tearFlat, setTearFlat]   = useState("");    // flat $ for Per End mode
  const [tearRate, setTearRate]   = useState(1.50);  // $/SF for Per SF mode

  // Materials
  const [materialCost, setMaterialCost] = useState("");

  const [copied, setCopied] = useState(false);

  function handleModeChange(m: PricingMode) {
    setMode(m);
  }

  function handleTierChange(t: LaborTier) {
    setTier(t);
    setLaborRate(LABOR_TIERS[t].rate);
  }

  function applyDoubleWide() {
    if (mode === "per-end") {
      setEndCount(2);
    } else {
      setWidth(String(DOUBLE_WIDE.width));
      setLength(String(DOUBLE_WIDE.length));
      setHeight(String(DOUBLE_WIDE.height));
    }
  }

  const calc = useMemo(() => {
    let base = 0;
    let endWallSF = 0, longWallSF = 0, totalSF = 0;
    let endLaborAmt = 0, longLaborAmt = 0;
    const w = parseFloat(width) || 0;
    const l = parseFloat(length) || 0;
    const h = parseFloat(height) || 0;

    if (mode === "per-end") {
      base = endCount * endRate;
    } else {
      endWallSF   = 2 * w * h;
      longWallSF  = 2 * l * h;
      totalSF     = endWallSF + longWallSF;
      endLaborAmt  = endWallSF  * laborRate;
      longLaborAmt = longWallSF * laborRate;
      base = endLaborAmt + longLaborAmt;
    }

    const openingsAmt = winQty * winRate + doorQty * doorRate;

    let tearoffAmt = 0;
    if (tearoff) {
      tearoffAmt = mode === "per-end"
        ? (parseFloat(tearFlat) || 0)
        : totalSF * tearRate;
    }

    const rawMat    = parseFloat(materialCost) || 0;
    const matMarkup = rawMat * 0.40;
    const matTotal  = rawMat + matMarkup;

    const subtotal = base + openingsAmt + tearoffAmt + matTotal;

    // Per End: no rounding/minimum — base is already the floor
    // Per SF: $600 minimum, round up to nearest $50
    const final = mode === "per-end"
      ? subtotal
      : Math.max(600, ceil50(subtotal));

    return {
      base, w, l, h,
      endWallSF, longWallSF, totalSF,
      endLaborAmt, longLaborAmt,
      openingsAmt, tearoffAmt,
      rawMat, matMarkup, matTotal,
      subtotal, final,
    };
  }, [
    mode, endCount, endRate,
    width, length, height, laborRate,
    winQty, winRate, doorQty, doorRate,
    tearoff, tearFlat, tearRate,
    materialCost,
  ]);

  const hasStructure = calc.w > 0 && calc.l > 0 && calc.h > 0;

  function buildLines(): DraftLine[] {
    const lines: DraftLine[] = [];

    if (mode === "per-end") {
      if (calc.base > 0) {
        lines.push({
          category: "Labor",
          description: `Siding – ${endCount} End${endCount !== 1 ? "s" : ""} of Home`,
          quantity: endCount,
          unit: "EA",
          unitCost: endRate,
        });
      }
    } else {
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
    }

    if (winQty > 0) {
      lines.push({ category: "Labor", description: "Window Add-On", quantity: winQty, unit: "EA", unitCost: winRate });
    }
    if (doorQty > 0) {
      lines.push({ category: "Labor", description: "Exterior Door Add-On", quantity: doorQty, unit: "EA", unitCost: doorRate });
    }

    if (calc.tearoffAmt > 0) {
      if (mode === "per-end") {
        lines.push({ category: "Labor", description: "Tear-off & Disposal", quantity: 1, unit: "LOT", unitCost: calc.tearoffAmt });
      } else {
        lines.push({
          category: "Labor",
          description: `Tear-off & Disposal (${fmtSF(calc.totalSF)} SF)`,
          quantity: parseFloat(fmtSF(calc.totalSF)),
          unit: "SF",
          unitCost: tearRate,
        });
      }
    }

    if (calc.matTotal > 0) {
      lines.push({ category: "Material", description: "Siding Materials (w/ 40% markup)", quantity: 1, unit: "LOT", unitCost: calc.matTotal });
    }

    if (mode === "per-sf") {
      const adjustment = calc.final - calc.subtotal;
      if (adjustment > 0.005) {
        lines.push({ category: "Other", description: "Rounding / Minimum Adjustment", quantity: 1, unit: "LOT", unitCost: adjustment });
      }
    }

    return lines;
  }

  function copyQuote() {
    const lines: string[] = [
      "=== SIDING ESTIMATE (Willard's General Contracting) ===",
      "",
    ];

    if (mode === "per-end") {
      lines.push(`Pricing: Per End of Home — ${endCount} end${endCount !== 1 ? "s" : ""} × $${fmt(endRate)} = $${fmt(calc.base)}`);
    } else {
      lines.push(
        `Structure: ${calc.w}W × ${calc.l}L × ${calc.h}H ft`,
        `  End walls: ${fmtSF(calc.endWallSF)} SF  |  Long walls: ${fmtSF(calc.longWallSF)} SF  |  Total: ${fmtSF(calc.totalSF)} SF`,
        `Labor tier: ${LABOR_TIERS[tier].label} (${LABOR_TIERS[tier].range}) @ $${fmt(laborRate)}/SF`,
        `  End walls labor: $${fmt(calc.endLaborAmt)}`,
        `  Long walls labor: $${fmt(calc.longLaborAmt)}`,
      );
    }

    if (winQty > 0)  lines.push(`Windows (${winQty} × $${fmt(winRate)}): $${fmt(winQty * winRate)}`);
    if (doorQty > 0) lines.push(`Exterior Doors (${doorQty} × $${fmt(doorRate)}): $${fmt(doorQty * doorRate)}`);
    if (calc.tearoffAmt > 0) lines.push(`Tear-off & Disposal: $${fmt(calc.tearoffAmt)}`);
    if (calc.matTotal > 0)   lines.push(`Materials (raw $${fmt(calc.rawMat)} + 40% markup): $${fmt(calc.matTotal)}`);

    lines.push("", `Subtotal: $${fmt(calc.subtotal)}`, `Final Price: $${fmt(calc.final)}`, "");

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  const sectionHd = "text-xs font-bold uppercase tracking-wider text-gray-500 mb-2";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Siding Calculator</h2>
            <p className="text-xs text-gray-500">Per-end flat rate · windows & doors · tear-off · materials</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-xl self-start w-fit">
            <button
              type="button"
              onClick={() => handleModeChange("per-end")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === "per-end"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Per End
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("per-sf")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === "per-sf"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Per SF <span className="text-[10px] font-normal">(repairs)</span>
            </button>
          </div>

          {/* Double Wide preset — always available */}
          <button
            type="button"
            onClick={applyDoubleWide}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            {mode === "per-end"
              ? "Standard Double Wide → 2 Ends"
              : "Standard Double Wide (36 × 90 × 13.6 ft)"}
          </button>

          {/* ── PER END MODE ───────────────────────────────────────────── */}
          {mode === "per-end" && (
            <div>
              <p className={sectionHd}>1 · Base Price (Per End of Home)</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Number of Ends</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEndCount(Math.max(1, endCount - 1))}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-bold text-gray-900">{endCount}</span>
                    <button
                      type="button"
                      onClick={() => setEndCount(Math.min(4, endCount + 1))}
                      className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Rate per End</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="50"
                      value={endRate}
                      onChange={e => setEndRate(parseFloat(e.target.value) || 0)}
                      className="pl-7 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-28"
                    />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider">Base Price</div>
                  <div className="text-xl font-black text-amber-800">${fmt(calc.base)}</div>
                  <div className="text-[10px] text-amber-500">{endCount} × ${fmt(endRate)}</div>
                </div>
              </div>
            </div>
          )}

          {/* ── PER SF MODE ────────────────────────────────────────────── */}
          {mode === "per-sf" && (
            <>
              {/* Structure */}
              <div>
                <p className={sectionHd}>1 · Structure (Wall Dimensions)</p>
                <div className="grid grid-cols-3 gap-3">
                  {([["Width (ft)", width, setWidth], ["Length (ft)", length, setLength], ["Height (ft)", height, setHeight]] as const).map(([label, val, setter]) => (
                    <div key={label}>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                      <input
                        type="number" min="0" step="0.1"
                        value={val}
                        onChange={e => setter(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  ))}
                </div>
                {hasStructure && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { label: "End Walls",  value: calc.endWallSF },
                      { label: "Long Walls", value: calc.longWallSF },
                      { label: "Total SF",   value: calc.totalSF, bold: true },
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

              {/* Labor */}
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-1">End Walls</div>
                      <div className="text-xs text-blue-700">
                        Per end: <span className="font-bold">${fmt((calc.endWallSF / 2) * laborRate)}</span>
                      </div>
                      <div className="text-xs text-blue-700">
                        Both ends: <span className="font-bold">${fmt(calc.endLaborAmt)}</span>
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded-lg px-3 py-2">
                      <div className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mb-1">Long Walls</div>
                      <div className="text-xs text-blue-700">
                        Per side: <span className="font-bold">${fmt((calc.longWallSF / 2) * laborRate)}</span>
                      </div>
                      <div className="text-xs text-blue-700">
                        Both sides: <span className="font-bold">${fmt(calc.longLaborAmt)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── ADD-ONS (always visible) ───────────────────────────────── */}
          <div>
            <p className={sectionHd}>{mode === "per-end" ? "2" : "3"} · Add-Ons (Windows &amp; Doors)</p>
            <div className="grid grid-cols-2 gap-4">
              {/* Windows */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Windows</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" min="0"
                    value={winQty || ""}
                    onChange={e => setWinQty(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
                  />
                  <span className="text-gray-400 text-xs shrink-0">@</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="5"
                      value={winRate}
                      onChange={e => setWinRate(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <span className="text-gray-400 text-xs shrink-0">ea</span>
                </div>
                {winQty > 0 && (
                  <div className="mt-1 text-xs font-semibold text-amber-700">= ${fmt(winQty * winRate)}</div>
                )}
              </div>
              {/* Doors */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Exterior Doors</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" min="0"
                    value={doorQty || ""}
                    onChange={e => setDoorQty(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-center"
                  />
                  <span className="text-gray-400 text-xs shrink-0">@</span>
                  <div className="flex-1 relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="5"
                      value={doorRate}
                      onChange={e => setDoorRate(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <span className="text-gray-400 text-xs shrink-0">ea</span>
                </div>
                {doorQty > 0 && (
                  <div className="mt-1 text-xs font-semibold text-amber-700">= ${fmt(doorQty * doorRate)}</div>
                )}
              </div>
            </div>
          </div>

          {/* ── TEAR-OFF ───────────────────────────────────────────────── */}
          <div>
            <p className={sectionHd}>{mode === "per-end" ? "3" : "4"} · Tear-off &amp; Disposal</p>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={tearoff}
                  onChange={e => setTearoff(e.target.checked)}
                  className="w-4 h-4 accent-amber-500"
                />
                <span className="text-sm font-medium text-gray-700">Include tear-off</span>
              </label>
              {tearoff && mode === "per-end" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-semibold">Flat $</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number" min="0" step="50"
                      value={tearFlat}
                      onChange={e => setTearFlat(e.target.value)}
                      placeholder="0"
                      className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-24"
                    />
                  </div>
                </div>
              )}
              {tearoff && mode === "per-sf" && (
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

          {/* ── MATERIALS ─────────────────────────────────────────────── */}
          <div>
            <p className={sectionHd}>{mode === "per-end" ? "4" : "5"} · Materials</p>
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

          {/* ── RESULTS ────────────────────────────────────────────────── */}
          <div className="bg-gray-900 text-white rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Results</p>
            <div className="space-y-1.5">

              {mode === "per-end" ? (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">
                    Base — {endCount} end{endCount !== 1 ? "s" : ""} × ${fmt(endRate)}
                  </span>
                  <span className="font-semibold">${fmt(calc.base)}</span>
                </div>
              ) : (
                <>
                  {calc.endLaborAmt > 0 && (
                    <div className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-gray-300">End walls labor</span>
                      <span className="font-semibold">${fmt(calc.endLaborAmt)}</span>
                    </div>
                  )}
                  {calc.longLaborAmt > 0 && (
                    <div className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-gray-300">Long walls labor</span>
                      <span className="font-semibold">${fmt(calc.longLaborAmt)}</span>
                    </div>
                  )}
                </>
              )}

              {calc.openingsAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">
                    Add-ons
                    {winQty > 0 && doorQty > 0 && ` (${winQty}W + ${doorQty}D)`}
                    {winQty > 0 && doorQty === 0 && ` (${winQty} window${winQty !== 1 ? "s" : ""})`}
                    {doorQty > 0 && winQty === 0 && ` (${doorQty} door${doorQty !== 1 ? "s" : ""})`}
                  </span>
                  <span className="font-semibold">${fmt(calc.openingsAmt)}</span>
                </div>
              )}

              {calc.tearoffAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Tear-off & Disposal</span>
                  <span className="font-semibold">${fmt(calc.tearoffAmt)}</span>
                </div>
              )}

              {calc.matTotal > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Materials (w/ 40% markup)</span>
                  <span className="font-semibold">${fmt(calc.matTotal)}</span>
                </div>
              )}

              <div className="border-t border-gray-700 pt-2 mt-2">
                {calc.subtotal !== calc.final && (
                  <div className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-gray-300">Subtotal</span>
                    <span className="font-semibold">${fmt(calc.subtotal)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-amber-400 text-base">Final Price</span>
                  <span className="font-bold text-amber-400 text-xl">${fmt(calc.final)}</span>
                </div>
                {mode === "per-sf" && (
                  <p className="text-[10px] text-gray-500">Rounded up to nearest $50 · Minimum $600</p>
                )}
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
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
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
