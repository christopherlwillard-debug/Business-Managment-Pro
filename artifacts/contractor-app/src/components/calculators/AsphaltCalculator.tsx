import { useState, useMemo } from "react";
import { X, Copy, ChevronRight, Plus, Trash2, CreditCard } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface AsphaltCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[]) => void;
  onRequestDeposit?: (totalAmount: number) => void;
}

interface Section {
  id: number;
  label: string;
  length: string;
  width: string;
  manualSF: string;
}

function sectionSF(s: Section): number {
  const manual = parseFloat(s.manualSF);
  if (!isNaN(manual) && manual > 0) return manual;
  const l = parseFloat(s.length) || 0;
  const w = parseFloat(s.width) || 0;
  return l * w;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ceil50(n: number) {
  return Math.ceil(n / 50) * 50;
}

type SizeTier = "small" | "medium" | "large";

const TIER_RATES: Record<SizeTier, { label: string; sfRange: string; rateRange: string; defaultRate: number; maxSF: number }> = {
  small:  { label: "Small",  sfRange: "< 1,000 SF",           rateRange: "$0.30–$0.50/SF", defaultRate: 0.40, maxSF: 999 },
  medium: { label: "Medium", sfRange: "1,000–3,000 SF",       rateRange: "$0.22–$0.35/SF", defaultRate: 0.28, maxSF: 3000 },
  large:  { label: "Large",  sfRange: "> 3,000 SF",           rateRange: "$0.15–$0.25/SF", defaultRate: 0.20, maxSF: Infinity },
};

function autoTier(sf: number): SizeTier {
  if (sf < 1000) return "small";
  if (sf <= 3000) return "medium";
  return "large";
}

let nextId = 1;
function makeSection(label?: string): Section {
  return { id: nextId++, label: label ?? "Section", length: "", width: "", manualSF: "" };
}

const CRACK_REPAIR_RATE_DEFAULT = 2.50;
const OIL_STAIN_RATE_DEFAULT = 0.35;
const SECOND_COAT_RATE_DEFAULT = 0.15;

export function AsphaltCalculator({ onClose, onUseNumbers, onRequestDeposit }: AsphaltCalculatorProps) {
  const [sections, setSections] = useState<Section[]>([makeSection("Driveway / Lot")]);

  const [manualTier, setManualTier] = useState<SizeTier | null>(null);
  const [customRate, setCustomRate] = useState<string>("");

  const [crackLF, setCrackLF] = useState("");
  const [crackRate, setCrackRate] = useState(CRACK_REPAIR_RATE_DEFAULT);

  const [secondCoat, setSecondCoat] = useState(false);
  const [secondCoatRate, setSecondCoatRate] = useState(SECOND_COAT_RATE_DEFAULT);

  const [oilStain, setOilStain] = useState(false);
  const [oilStainRate, setOilStainRate] = useState(OIL_STAIN_RATE_DEFAULT);

  const [materialCost, setMaterialCost] = useState("");

  const [copied, setCopied] = useState(false);

  const calc = useMemo(() => {
    const totalSF = sections.reduce((s, sec) => s + sectionSF(sec), 0);
    const tier = manualTier ?? autoTier(totalSF);
    const tierInfo = TIER_RATES[tier];
    const sealRate = customRate !== "" ? (parseFloat(customRate) || 0) : tierInfo.defaultRate;

    const sealAmt = totalSF * sealRate;

    const crackLFNum = parseFloat(crackLF) || 0;
    const crackAmt = crackLFNum * crackRate;

    const secondCoatAmt = secondCoat ? totalSF * secondCoatRate : 0;
    const oilStainAmt = oilStain ? totalSF * oilStainRate : 0;

    const matCostRaw = parseFloat(materialCost) || 0;

    const subtotal = sealAmt + crackAmt + secondCoatAmt + oilStainAmt + matCostRaw;
    const final = Math.max(300, ceil50(subtotal));
    const profit = final - matCostRaw;

    return {
      totalSF,
      tier,
      tierInfo,
      sealRate,
      sealAmt,
      crackLFNum,
      crackAmt,
      secondCoatAmt,
      oilStainAmt,
      matCostRaw,
      subtotal,
      final,
      profit,
    };
  }, [sections, manualTier, customRate, crackLF, crackRate, secondCoat, secondCoatRate, oilStain, oilStainRate, materialCost]);

  function addSection() {
    setSections(s => [...s, makeSection(`Section ${s.length + 1}`)]);
  }

  function removeSection(id: number) {
    setSections(s => s.filter(sec => sec.id !== id));
  }

  function updateSection(id: number, field: keyof Section, value: string) {
    setSections(s => s.map(sec => sec.id === id ? { ...sec, [field]: value } : sec));
  }

  function handleTierClick(tier: SizeTier) {
    setManualTier(tier);
    setCustomRate(String(TIER_RATES[tier].defaultRate));
  }

  function buildLines(): DraftLine[] {
    const lines: DraftLine[] = [];

    if (calc.sealAmt > 0) {
      lines.push({
        category: "Labor",
        description: `Asphalt Sealing – ${calc.tierInfo.label} Lot (${calc.totalSF.toFixed(0)} SF @ $${fmt(calc.sealRate)}/SF)`,
        quantity: parseFloat(calc.totalSF.toFixed(1)),
        unit: "SF",
        unitCost: calc.sealRate,
      });
    }

    if (calc.crackAmt > 0) {
      lines.push({
        category: "Labor",
        description: "Crack Repair",
        quantity: parseFloat(calc.crackLFNum.toFixed(1)),
        unit: "LF",
        unitCost: crackRate,
      });
    }

    if (calc.secondCoatAmt > 0) {
      lines.push({
        category: "Labor",
        description: `Second Coat (${calc.totalSF.toFixed(0)} SF)`,
        quantity: parseFloat(calc.totalSF.toFixed(1)),
        unit: "SF",
        unitCost: secondCoatRate,
      });
    }

    if (calc.oilStainAmt > 0) {
      lines.push({
        category: "Labor",
        description: `Oil Stain Treatment (${calc.totalSF.toFixed(0)} SF)`,
        quantity: parseFloat(calc.totalSF.toFixed(1)),
        unit: "SF",
        unitCost: oilStainRate,
      });
    }

    if (calc.matCostRaw > 0) {
      lines.push({
        category: "Material",
        description: "Sealer & Supplies",
        quantity: 1,
        unit: "LOT",
        unitCost: calc.matCostRaw,
      });
    }

    const adjustment = calc.final - calc.subtotal;
    if (adjustment > 0.005) {
      lines.push({
        category: "Other",
        description: "Rounding Adjustment (to nearest $50)",
        quantity: 1,
        unit: "LOT",
        unitCost: adjustment,
      });
    }

    return lines;
  }

  function copyQuote() {
    const { totalSF, tier, tierInfo, sealRate, sealAmt, crackLFNum, crackAmt, secondCoatAmt, oilStainAmt, matCostRaw, subtotal, final, profit } = calc;

    const lines = [
      "=== ASPHALT SEALING ESTIMATE (Willard's General Contracting) ===",
      "",
      `Lot size: ${totalSF.toFixed(0)} SF (${tierInfo.label} tier — ${tierInfo.sfRange})`,
      `Rate: $${fmt(sealRate)}/SF  (market range: ${tierInfo.rateRange})`,
      "",
      `Sealing (${totalSF.toFixed(0)} SF × $${fmt(sealRate)}/SF): $${fmt(sealAmt)}`,
    ];

    if (crackAmt > 0) {
      lines.push(`Crack Repair (${crackLFNum.toFixed(0)} LF × $${fmt(crackRate)}/LF): $${fmt(crackAmt)}`);
    }
    if (secondCoatAmt > 0) {
      lines.push(`Second Coat (${totalSF.toFixed(0)} SF × $${fmt(secondCoatRate)}/SF): $${fmt(secondCoatAmt)}`);
    }
    if (oilStainAmt > 0) {
      lines.push(`Oil Stain Treatment (${totalSF.toFixed(0)} SF × $${fmt(oilStainRate)}/SF): $${fmt(oilStainAmt)}`);
    }
    if (matCostRaw > 0) {
      lines.push(`Materials: $${fmt(matCostRaw)}`);
    }

    lines.push(
      "",
      `Subtotal: $${fmt(subtotal)}`,
      `Final Price: $${fmt(final)}`,
      "",
      `Est. Profit (excl. materials): $${fmt(profit)}`,
      ""
    );

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  const sectionHd = "text-xs font-bold uppercase tracking-wider text-gray-500 mb-2";

  const activeTier = manualTier ?? calc.tier;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Asphalt Sealing Calculator</h2>
            <p className="text-xs text-gray-500">Lot size → auto-tier pricing → add-ons → profit estimate</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* 1. Area / Sections */}
          <div>
            <p className={sectionHd}>1 · Lot / Driveway Area</p>
            <div className="space-y-2">
              {sections.map((sec) => (
                <div key={sec.id} className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[100px]">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Label</label>
                    <input
                      value={sec.label}
                      onChange={e => updateSection(sec.id, "label", e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Length (ft)</label>
                    <input
                      type="number" min="0" step="1"
                      value={sec.length}
                      onChange={e => updateSection(sec.id, "length", e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Width (ft)</label>
                    <input
                      type="number" min="0" step="1"
                      value={sec.width}
                      onChange={e => updateSection(sec.id, "width", e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Or SF</label>
                    <input
                      type="number" min="0" step="1"
                      value={sec.manualSF}
                      onChange={e => updateSection(sec.id, "manualSF", e.target.value)}
                      placeholder="manual"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-16 text-right pb-1.5">
                    <div className="text-[10px] text-gray-400 font-semibold">SF</div>
                    <div className="text-sm font-bold text-amber-700">{sectionSF(sec).toFixed(0)}</div>
                  </div>
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSection(sec.id)}
                      className="pb-1.5 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSection}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add another section
            </button>
            <div className="mt-3 bg-amber-50 rounded-lg px-4 py-2 inline-flex items-center gap-3">
              <span className="text-xs font-semibold text-amber-700">Total area:</span>
              <span className="text-lg font-black text-amber-800">{calc.totalSF.toFixed(0)} SF</span>
              <span className="text-xs text-amber-600">across {sections.length} section(s)</span>
            </div>
          </div>

          {/* 2. Pricing tier */}
          <div>
            <p className={sectionHd}>2 · Pricing Tier</p>
            <div className="flex gap-2 mb-3">
              {(Object.entries(TIER_RATES) as [SizeTier, typeof TIER_RATES[SizeTier]][]).map(([key, info]) => {
                const isActive = activeTier === key;
                const isAuto = (manualTier === null) && key === calc.tier;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTierClick(key)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors ${
                      isActive
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                    }`}
                  >
                    {info.label}
                    <div className={`text-[10px] font-normal mt-0.5 ${isActive ? "text-amber-100" : "text-gray-400"}`}>
                      {info.sfRange}
                    </div>
                    <div className={`text-[10px] font-normal ${isActive ? "text-amber-100" : "text-gray-400"}`}>
                      {info.rateRange}
                    </div>
                    {isAuto && !isActive && (
                      <div className="text-[9px] mt-0.5 text-amber-500 font-semibold">auto</div>
                    )}
                    {isAuto && isActive && (
                      <div className="text-[9px] mt-0.5 text-amber-200 font-semibold">auto-selected</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">$/SF (editable)</label>
              <input
                type="number" min="0" step="0.01"
                value={customRate !== "" ? customRate : calc.tierInfo.defaultRate}
                onChange={e => { setCustomRate(e.target.value); }}
                className="w-28 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* 3. Add-ons */}
          <div>
            <p className={sectionHd}>3 · Add-ons</p>
            <div className="space-y-3">

              {/* Crack repair */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-700 w-44 shrink-0">Crack Repair</label>
                <input
                  type="number" min="0" step="1"
                  value={crackLF}
                  onChange={e => setCrackLF(e.target.value)}
                  placeholder="LF"
                  className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-xs text-gray-400">LF @</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.25"
                    value={crackRate}
                    onChange={e => setCrackRate(parseFloat(e.target.value) || 0)}
                    className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                  />
                </div>
                <span className="text-xs text-gray-400">/LF</span>
                {calc.crackLFNum > 0 && (
                  <span className="text-xs font-bold text-gray-600">= ${fmt(calc.crackAmt)}</span>
                )}
              </div>

              {/* Second coat */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 w-44 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={secondCoat}
                    onChange={e => setSecondCoat(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-gray-700">Second Coat</span>
                </label>
                {secondCoat && (
                  <>
                    <span className="text-xs text-gray-400">{calc.totalSF.toFixed(0)} SF @</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={secondCoatRate}
                        onChange={e => setSecondCoatRate(parseFloat(e.target.value) || 0)}
                        className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                      />
                    </div>
                    <span className="text-xs text-gray-400">/SF</span>
                    <span className="text-xs font-bold text-gray-600">= ${fmt(calc.secondCoatAmt)}</span>
                  </>
                )}
              </div>

              {/* Oil stain treatment */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 w-44 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oilStain}
                    onChange={e => setOilStain(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-gray-700">Oil Stain Treatment</span>
                </label>
                {oilStain && (
                  <>
                    <span className="text-xs text-gray-400">{calc.totalSF.toFixed(0)} SF @</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={oilStainRate}
                        onChange={e => setOilStainRate(parseFloat(e.target.value) || 0)}
                        className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                      />
                    </div>
                    <span className="text-xs text-gray-400">/SF</span>
                    <span className="text-xs font-bold text-gray-600">= ${fmt(calc.oilStainAmt)}</span>
                  </>
                )}
              </div>

            </div>
          </div>

          {/* 4. Material cost */}
          <div>
            <p className={sectionHd}>4 · Material Cost (for profit calc)</p>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Sealer & supplies ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number" min="0" step="10"
                  value={materialCost}
                  onChange={e => setMaterialCost(e.target.value)}
                  placeholder="0"
                  className="pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-36"
                />
              </div>
            </div>
          </div>

          {/* Results panel */}
          <div className="bg-gray-900 text-white rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Results</p>
            <div className="space-y-1.5">
              {calc.sealAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Sealing ({calc.totalSF.toFixed(0)} SF × ${fmt(calc.sealRate)})</span>
                  <span className="font-semibold">${fmt(calc.sealAmt)}</span>
                </div>
              )}
              {calc.crackAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Crack Repair ({calc.crackLFNum.toFixed(0)} LF)</span>
                  <span className="font-semibold">${fmt(calc.crackAmt)}</span>
                </div>
              )}
              {calc.secondCoatAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Second Coat</span>
                  <span className="font-semibold">${fmt(calc.secondCoatAmt)}</span>
                </div>
              )}
              {calc.oilStainAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Oil Stain Treatment</span>
                  <span className="font-semibold">${fmt(calc.oilStainAmt)}</span>
                </div>
              )}
              {calc.matCostRaw > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Materials</span>
                  <span className="font-semibold">${fmt(calc.matCostRaw)}</span>
                </div>
              )}

              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Subtotal</span>
                  <span className="font-semibold">${fmt(calc.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="font-bold text-amber-400 text-base">Final Price</span>
                  <span className="font-bold text-amber-400 text-xl">${fmt(calc.final)}</span>
                </div>
                <p className="text-[10px] text-gray-500 mb-3">Rounded up to nearest $50 · Minimum $300</p>
                {calc.matCostRaw > 0 && (
                  <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-lg px-4 py-2 flex items-center justify-between">
                    <span className="text-emerald-300 text-sm font-semibold">Est. Profit (excl. materials)</span>
                    <span className="text-emerald-300 text-lg font-black">${fmt(calc.profit)}</span>
                  </div>
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
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            {onRequestDeposit && calc.final > 0 && (
              <button
                type="button"
                onClick={() => { onRequestDeposit(calc.final); }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                Get Payment Link (${fmt(calc.final)})
              </button>
            )}
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
