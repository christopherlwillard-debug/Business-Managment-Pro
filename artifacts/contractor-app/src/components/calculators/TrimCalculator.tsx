import { useState, useMemo } from "react";
import { X, Copy, Check } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface TrimCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[]) => void;
}

type BaseTier  = "basic" | "standard" | "large";
type CrownTier = "basic" | "standard" | "large";
type FinishOption = "install" | "caulk" | "paint";

const BASE_TIERS: Record<BaseTier, { label: string; range: string; default: number }> = {
  basic:    { label: "Basic (3–5\")",    range: "$6–$10/ft",   default: 8 },
  standard: { label: "Standard (5–7\")", range: "$10–$15/ft",  default: 12.5 },
  large:    { label: "Large (7\"+)",     range: "$15–$25/ft",  default: 20 },
};

const CROWN_TIERS: Record<CrownTier, { label: string; range: string; default: number }> = {
  basic:    { label: "Basic",    range: "$10–$15/ft",  default: 12.5 },
  standard: { label: "Standard", range: "$15–$22/ft",  default: 18.5 },
  large:    { label: "Large",    range: "$22–$35+/ft", default: 28.5 },
};

const FINISH_OPTIONS: Record<FinishOption, { label: string; emoji: string; range: string; default: number }> = {
  install: { label: "Install Only",        emoji: "🚪", range: "$0/ft",    default: 0 },
  caulk:   { label: "Caulk + Fill",        emoji: "🪚", range: "$2–$4/ft", default: 3 },
  paint:   { label: "Full Paint Finish",   emoji: "🎨", range: "$4–$7/ft", default: 5.5 },
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function ceil50(n: number): number {
  return Math.ceil(n / 50) * 50;
}

export function TrimCalculator({ onClose, onUseNumbers }: TrimCalculatorProps) {
  const [roomLength, setRoomLength]   = useState("20");
  const [roomWidth, setRoomWidth]     = useState("15");
  const [ceilingHeight, setCeilingHeight] = useState("9");

  const [baseTier, setBaseTier]    = useState<BaseTier>("standard");
  const [baseRate, setBaseRate]    = useState(BASE_TIERS["standard"].default);

  const [crownTier, setCrownTier]  = useState<CrownTier>("standard");
  const [crownRate, setCrownRate]  = useState(CROWN_TIERS["standard"].default);

  const [outsideCorners, setOutsideCorners] = useState(4);
  const [outsidePrice, setOutsidePrice]     = useState(20);
  const [non90Count, setNon90Count]         = useState(0);
  const [non90Price, setNon90Price]         = useState(37.5);
  const [vaulted, setVaulted]               = useState(false);
  const [vaultPct, setVaultPct]             = useState(30);
  const [repairs, setRepairs]               = useState(0);
  const [demo, setDemo]                     = useState(0);

  const [finishOption, setFinishOption] = useState<FinishOption>("paint");
  const [finishRate, setFinishRate]     = useState(FINISH_OPTIONS["paint"].default);

  const [materials, setMaterials] = useState(0);

  const [copied, setCopied] = useState(false);

  function handleBaseTier(t: BaseTier) {
    setBaseTier(t);
    setBaseRate(BASE_TIERS[t].default);
  }
  function handleCrownTier(t: CrownTier) {
    setCrownTier(t);
    setCrownRate(CROWN_TIERS[t].default);
  }
  function handleFinish(f: FinishOption) {
    setFinishOption(f);
    setFinishRate(FINISH_OPTIONS[f].default);
  }

  const calc = useMemo(() => {
    const len = parseFloat(roomLength) || 0;
    const wid = parseFloat(roomWidth)  || 0;
    const linearFeet = 2 * (len + wid);

    let baseLabor   = linearFeet * baseRate;
    let crownLabor  = linearFeet * crownRate;
    let finishLabor = linearFeet * finishRate;
    let trimLabor   = baseLabor + crownLabor + finishLabor;

    if (vaulted && trimLabor > 0) {
      const mult = 1 + (vaultPct / 100);
      const vaultedDelta = trimLabor * mult - trimLabor;
      baseLabor   += (baseLabor   / trimLabor) * vaultedDelta;
      crownLabor  += (crownLabor  / trimLabor) * vaultedDelta;
      finishLabor += (finishLabor / trimLabor) * vaultedDelta;
      trimLabor    = trimLabor * mult;
    } else if (vaulted && trimLabor === 0) {
      // All rates are 0 — nothing to scale, leave as-is
    }

    const cornersAmt  = outsideCorners * outsidePrice;
    const anglesAmt   = non90Count * non90Price;
    const addOnsTotal = cornersAmt + anglesAmt + repairs + demo;

    const subtotal   = trimLabor + addOnsTotal + materials;
    const rounded    = ceil50(subtotal);
    const finalPrice = Math.max(rounded, 500);
    const adjustment = finalPrice - subtotal;

    // Quick formula shows raw computed total (before round-up/min), matching HTML tool
    const rawTotal = linearFeet * (baseRate + crownRate + finishRate) + addOnsTotal + materials;
    const quickFormula = `${fmtInt(linearFeet)} ft × ($${baseRate} + $${crownRate} + $${finishRate})${addOnsTotal > 0 ? ` + $${fmtInt(addOnsTotal)}` : ""}${materials > 0 ? ` + $${fmtInt(materials)}` : ""} = $${fmtInt(rawTotal)}`;

    return {
      linearFeet,
      baseLabor, crownLabor, finishLabor,
      cornersAmt, anglesAmt, addOnsTotal,
      subtotal, rounded, finalPrice, adjustment,
      quickFormula,
    };
  }, [
    roomLength, roomWidth, ceilingHeight,
    baseRate, crownRate, finishRate,
    vaulted, vaultPct,
    outsideCorners, outsidePrice, non90Count, non90Price,
    repairs, demo, materials,
  ]);

  function handleCopyQuote() {
    const text = [
      "🧰 Trim Work Estimate",
      `Room: ${roomLength}×${roomWidth} ft, ${ceilingHeight} ft ceiling (${fmtInt(calc.linearFeet)} linear ft)`,
      `Baseboard: ${BASE_TIERS[baseTier].label} @ $${baseRate}/ft`,
      `Crown Moulding: ${CROWN_TIERS[crownTier].label} @ $${crownRate}/ft`,
      `Finishing: ${FINISH_OPTIONS[finishOption].label} @ $${finishRate}/ft`,
      vaulted ? `Vaulted Ceiling: +${vaultPct}% uplift applied` : null,
      outsideCorners > 0 ? `Outside Corners: ${outsideCorners} × $${outsidePrice} = $${fmtInt(calc.cornersAmt)}` : null,
      non90Count > 0     ? `Non-90° Angles: ${non90Count} × $${non90Price} = $${fmtInt(calc.anglesAmt)}` : null,
      repairs > 0        ? `Repairs: $${fmtInt(repairs)}` : null,
      demo > 0           ? `Demo/Removal: $${fmtInt(demo)}` : null,
      materials > 0      ? `Materials: $${fmtInt(materials)}` : null,
      `─────────────────────`,
      `✅ FINAL PRICE: $${fmtInt(calc.finalPrice)}`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleUseNumbers() {
    const lines: DraftLine[] = [];

    if (calc.baseLabor > 0) {
      lines.push({
        category: "Labor",
        description: `Trim – Baseboard (${BASE_TIERS[baseTier].label}) @ $${baseRate}/ft${vaulted ? ` +${vaultPct}% vaulted` : ""}`,
        quantity: calc.linearFeet > 0 ? calc.linearFeet : 1,
        unit: calc.linearFeet > 0 ? "LF" : "LOT",
        unitCost: calc.linearFeet > 0 ? baseRate * (vaulted ? 1 + vaultPct / 100 : 1) : calc.baseLabor,
      });
    }

    if (calc.crownLabor > 0) {
      lines.push({
        category: "Labor",
        description: `Trim – Crown Moulding (${CROWN_TIERS[crownTier].label}) @ $${crownRate}/ft${vaulted ? ` +${vaultPct}% vaulted` : ""}`,
        quantity: calc.linearFeet > 0 ? calc.linearFeet : 1,
        unit: calc.linearFeet > 0 ? "LF" : "LOT",
        unitCost: calc.linearFeet > 0 ? crownRate * (vaulted ? 1 + vaultPct / 100 : 1) : calc.crownLabor,
      });
    }

    if (calc.finishLabor > 0) {
      lines.push({
        category: "Labor",
        description: `Trim – Finishing (${FINISH_OPTIONS[finishOption].label}) @ $${finishRate}/ft${vaulted ? ` +${vaultPct}% vaulted` : ""}`,
        quantity: calc.linearFeet > 0 ? calc.linearFeet : 1,
        unit: calc.linearFeet > 0 ? "LF" : "LOT",
        unitCost: calc.linearFeet > 0 ? finishRate * (vaulted ? 1 + vaultPct / 100 : 1) : calc.finishLabor,
      });
    }

    if (outsideCorners > 0) {
      lines.push({
        category: "Labor",
        description: `Outside Corners`,
        quantity: outsideCorners,
        unit: "EA",
        unitCost: outsidePrice,
      });
    }

    if (non90Count > 0) {
      lines.push({
        category: "Labor",
        description: `Non-90° Angles`,
        quantity: non90Count,
        unit: "EA",
        unitCost: non90Price,
      });
    }

    if (repairs > 0) {
      lines.push({
        category: "Labor",
        description: `Wall/Ceiling Repairs`,
        quantity: 1,
        unit: "LOT",
        unitCost: repairs,
      });
    }

    if (demo > 0) {
      lines.push({
        category: "Labor",
        description: `Demo/Removal`,
        quantity: 1,
        unit: "LOT",
        unitCost: demo,
      });
    }

    if (materials > 0) {
      lines.push({
        category: "Material",
        description: `Trim Materials`,
        quantity: 1,
        unit: "LOT",
        unitCost: materials,
      });
    }

    const adjustment = calc.finalPrice - calc.subtotal;
    if (adjustment > 0.005) {
      lines.push({
        category: "Other",
        description: "Rounding Adjustment (to nearest $50)",
        quantity: 1,
        unit: "LOT",
        unitCost: adjustment,
      });
    }

    onUseNumbers(lines);
    onClose();
  }

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-xl font-medium";
  const smallInput = "bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base text-center";

  function TierBtn<T extends string>({
    value, current, onClick, label, range,
  }: { value: T; current: T; onClick: (v: T) => void; label: string; range: string }) {
    const active = value === current;
    return (
      <button
        type="button"
        onClick={() => onClick(value)}
        className={`flex-1 py-2.5 px-2 rounded-xl border text-xs font-semibold transition-colors text-center ${
          active
            ? "border-amber-500 bg-amber-500/20 text-amber-300"
            : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}
      >
        <div className="font-bold">{label}</div>
        <div className={`text-[10px] mt-0.5 ${active ? "text-amber-400" : "text-zinc-500"}`}>{range}</div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/75 overflow-y-auto py-4 px-2">
      <div className="bg-zinc-900 w-full max-w-2xl rounded-2xl border border-zinc-700 shadow-2xl mb-4">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-bold text-white text-base">Trim Work Calculator</h2>
              <p className="text-xs text-zinc-400">Baseboard + Crown Moulding • Per Room</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* 1. Room Measurements */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>📏</span> 1. Room Measurements
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Length (ft)</label>
                <input
                  type="number" step="0.1" min="0"
                  value={roomLength}
                  onChange={e => setRoomLength(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Width (ft)</label>
                <input
                  type="number" step="0.1" min="0"
                  value={roomWidth}
                  onChange={e => setRoomWidth(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Ceiling Height (ft)</label>
                <input
                  type="number" step="0.1" min="0"
                  value={ceilingHeight}
                  onChange={e => setCeilingHeight(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {/* Perimeter display */}
            <div className="mt-3 bg-zinc-950 rounded-xl p-3 border border-zinc-700 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">Perimeter = 2 × (Length + Width)</p>
                <p className="text-xs text-zinc-500 mt-0.5">Approx. linear feet for baseboard &amp; crown</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-amber-400 font-mono">{fmtInt(calc.linearFeet)} ft</p>
                <p className="text-xs text-zinc-500">linear feet</p>
              </div>
            </div>
          </section>

          {/* 2. Trim Tiers */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>🪵</span> 2. Select Trim Type
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Baseboard */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Baseboard</label>
                <div className="flex gap-1.5 mb-2">
                  {(["basic", "standard", "large"] as BaseTier[]).map(t => (
                    <TierBtn
                      key={t}
                      value={t}
                      current={baseTier}
                      onClick={handleBaseTier}
                      label={t === "basic" ? "Basic" : t === "standard" ? "Standard" : "Large"}
                      range={BASE_TIERS[t].range}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={baseRate}
                    onChange={e => setBaseRate(parseFloat(e.target.value) || 0)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-1.5 text-white text-lg font-mono"
                  />
                  <span className="text-zinc-400 text-sm">/ft</span>
                </div>
              </div>
              {/* Crown */}
              <div>
                <label className="block text-xs text-zinc-400 mb-2">Crown Moulding</label>
                <div className="flex gap-1.5 mb-2">
                  {(["basic", "standard", "large"] as CrownTier[]).map(t => (
                    <TierBtn
                      key={t}
                      value={t}
                      current={crownTier}
                      onClick={handleCrownTier}
                      label={t === "basic" ? "Basic" : t === "standard" ? "Standard" : "Large"}
                      range={CROWN_TIERS[t].range}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-400 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={crownRate}
                    onChange={e => setCrownRate(parseFloat(e.target.value) || 0)}
                    className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-1.5 text-white text-lg font-mono"
                  />
                  <span className="text-zinc-400 text-sm">/ft</span>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Add-Ons */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>➕</span> 3. Add-Ons
            </h3>
            <div className="space-y-3">
              {/* Outside corners */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">Outside Corners</label>
                  <input
                    type="number" min="0"
                    value={outsideCorners}
                    onChange={e => setOutsideCorners(parseInt(e.target.value) || 0)}
                    className={`${smallInput} w-full`}
                  />
                </div>
                <span className="text-zinc-500 pt-5">×</span>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">$ per corner</label>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 text-sm">$</span>
                    <input
                      type="number" step="1" min="0"
                      value={outsidePrice}
                      onChange={e => setOutsidePrice(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base"
                    />
                  </div>
                </div>
                <div className="pt-5 text-right min-w-[64px]">
                  <span className="text-sm font-mono text-amber-300">${fmtInt(outsideCorners * outsidePrice)}</span>
                </div>
              </div>

              {/* Non-90 angles */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">Non-90° Angles</label>
                  <input
                    type="number" min="0"
                    value={non90Count}
                    onChange={e => setNon90Count(parseInt(e.target.value) || 0)}
                    className={`${smallInput} w-full`}
                  />
                </div>
                <span className="text-zinc-500 pt-5">×</span>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">$ per angle</label>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 text-sm">$</span>
                    <input
                      type="number" step="0.5" min="0"
                      value={non90Price}
                      onChange={e => setNon90Price(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base"
                    />
                  </div>
                </div>
                <div className="pt-5 text-right min-w-[64px]">
                  <span className="text-sm font-mono text-amber-300">${fmtInt(non90Count * non90Price)}</span>
                </div>
              </div>

              {/* Vaulted ceiling */}
              <div className="flex items-center justify-between bg-zinc-950 rounded-xl p-3 border border-zinc-700">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={vaulted}
                    onChange={e => setVaulted(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <label className="text-sm font-medium text-zinc-200">Vaulted Ceiling</label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-sm">+</span>
                  <input
                    type="number" step="1" min="10" max="60"
                    value={vaultPct}
                    onChange={e => setVaultPct(parseInt(e.target.value) || 30)}
                    disabled={!vaulted}
                    className="w-16 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-1 text-white text-sm text-center disabled:opacity-40"
                  />
                  <span className="text-zinc-400 text-sm">%</span>
                </div>
              </div>

              {/* Repairs & demo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Repairs ($)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 text-sm">$</span>
                    <input
                      type="number" step="1" min="0"
                      value={repairs}
                      onChange={e => setRepairs(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Demo/Removal ($)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 text-sm">$</span>
                    <input
                      type="number" step="1" min="0"
                      value={demo}
                      onChange={e => setDemo(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-zinc-700">
                <span className="text-xs text-zinc-400">Add-On Total</span>
                <span className="text-lg font-mono font-bold text-white">${fmt(calc.addOnsTotal)}</span>
              </div>
            </div>
          </section>

          {/* 4. Finishing */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>🎨</span> 4. Finishing Options
            </h3>
            <div className="flex gap-2">
              {(["install", "caulk", "paint"] as FinishOption[]).map(f => {
                const opt = FINISH_OPTIONS[f];
                const active = f === finishOption;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFinish(f)}
                    className={`flex-1 py-3 px-2 rounded-xl border text-center transition-colors ${
                      active
                        ? "border-amber-500 bg-amber-500/20 text-amber-300"
                        : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    <div className="text-xl mb-1">{opt.emoji}</div>
                    <div className="text-xs font-semibold leading-tight">{opt.label}</div>
                    <div className={`text-[10px] mt-0.5 ${active ? "text-amber-400" : "text-zinc-600"}`}>{opt.range}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 bg-zinc-950 rounded-xl px-3 py-2 border border-zinc-700">
              <span className="text-xs text-zinc-400 flex-1">Finish Rate</span>
              <span className="text-zinc-400">$</span>
              <input
                type="number" step="0.01" min="0"
                value={finishRate}
                onChange={e => setFinishRate(parseFloat(e.target.value) || 0)}
                className="w-20 bg-transparent text-white font-mono text-lg text-right focus:outline-none"
              />
              <span className="text-zinc-400">/ft</span>
            </div>
          </section>

          {/* 5. Materials */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>🧱</span> 5. Material Cost (with markup)
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-3xl text-zinc-400">$</span>
              <input
                type="number" step="1" min="0"
                value={materials}
                onChange={e => setMaterials(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-4 py-3 text-white text-3xl font-semibold"
              />
            </div>
          </section>

          {/* 6. Live Results Panel */}
          <section className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-5 border border-amber-500/30 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <span>💰</span> 6. Labor &amp; Total Estimate
            </h3>

            {/* Mini labor grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "BASEBOARD", val: calc.baseLabor },
                { label: "CROWN",     val: calc.crownLabor },
                { label: "FINISHING", val: calc.finishLabor },
              ].map(({ label, val }) => (
                <div key={label} className="bg-black/30 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-amber-400 tracking-widest font-bold">{label}</p>
                  <p className="font-mono text-xl font-bold text-white mt-0.5">${fmtInt(val)}</p>
                  <p className="text-[10px] text-zinc-500">LF × rate</p>
                </div>
              ))}
            </div>

            {/* Itemized breakdown */}
            <div className="bg-black/40 rounded-xl p-4 space-y-0">
              {[
                { label: "Baseboard Labor",  val: calc.baseLabor },
                { label: "Crown Labor",      val: calc.crownLabor },
                { label: "Finishing",        val: calc.finishLabor },
                { label: "Materials",        val: materials },
                { label: "Add-Ons",          val: calc.addOnsTotal },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-zinc-700/60 last:border-b-0 text-sm">
                  <span className="text-zinc-300">{label}</span>
                  <span className="font-mono text-white">${fmtInt(val)}</span>
                </div>
              ))}

              <div className="flex justify-between pt-3 text-base">
                <span className="font-semibold text-zinc-200">SUBTOTAL</span>
                <span className="font-mono font-bold text-white text-xl">${fmtInt(calc.subtotal)}</span>
              </div>

              {calc.adjustment > 0 && (
                <div className="flex justify-between text-xs text-zinc-400 mt-1">
                  <span>Min charge / round-up adjustment</span>
                  <span className="text-emerald-400 font-medium">+${fmtInt(calc.adjustment)}</span>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-amber-400/50 flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-amber-400 uppercase tracking-widest">✅ Final Price</p>
                  <p className="font-mono text-4xl font-black text-white mt-0.5">${fmtInt(calc.finalPrice)}</p>
                </div>
              </div>
            </div>

            {/* Quick formula */}
            <div className="mt-3 bg-zinc-950/80 border border-dashed border-zinc-600 rounded-xl p-3">
              <p className="text-xs text-zinc-500 mb-1 font-medium">⚡ Quick Formula</p>
              <p className="font-mono text-sm text-amber-300 leading-relaxed break-words">{calc.quickFormula}</p>
            </div>
          </section>

          {/* Pro Notes */}
          <section className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50">
            <h4 className="text-xs font-semibold text-amber-400 mb-2">💡 Pro Notes</h4>
            <ul className="space-y-1 text-xs text-zinc-400">
              <li>• Always round up to the nearest $50–$100</li>
              <li>• Minimum per room: $500 (auto-applied above)</li>
              <li>• Charge extra for small/tight rooms or complex layouts</li>
              <li>• Don&apos;t include paint unless clearly selected</li>
              <li>• Vaulted ceilings add complexity — add 20–40% to trim labor</li>
            </ul>
          </section>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleCopyQuote}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-600 bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Quote"}
            </button>
            <button
              type="button"
              onClick={handleUseNumbers}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition-colors"
            >
              Use These Numbers →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrimCalculator;
