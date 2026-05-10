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
  const [roomLength, setRoomLength] = useState("20");
  const [roomWidth, setRoomWidth]   = useState("15");

  const [baseRate, setBaseRate]   = useState(5.00);
  const [crownRate, setCrownRate] = useState(8.00);
  const [includeCrown, setIncludeCrown] = useState(true);

  const [outsideCorners, setOutsideCorners] = useState(0);
  const [outsidePrice, setOutsidePrice]     = useState(30);

  const [doorJams, setDoorJams]     = useState(0);
  const [doorJamPrice, setDoorJamPrice] = useState(350);

  const [marriageLine, setMarriageLine] = useState(false);
  const [marriagePrice, setMarriagePrice] = useState(1400);

  const [ceilPatch, setCeilPatch] = useState(false);
  const [ceilPatchPrice, setCeilPatchPrice] = useState(200);

  const [vaulted, setVaulted]   = useState(false);
  const [vaultPct, setVaultPct] = useState(30);
  const [repairs, setRepairs]   = useState(0);
  const [demo, setDemo]         = useState(0);
  const [materials, setMaterials] = useState(0);

  const [copied, setCopied] = useState(false);

  const calc = useMemo(() => {
    const len = parseFloat(roomLength) || 0;
    const wid = parseFloat(roomWidth) || 0;
    const linearFeet = 2 * (len + wid);

    const vaultMult = vaulted ? 1 + vaultPct / 100 : 1;

    const baseLabor  = linearFeet * baseRate * vaultMult;
    const crownLabor = includeCrown ? linearFeet * crownRate * vaultMult : 0;

    const cornersAmt    = outsideCorners * outsidePrice;
    const doorJamAmt    = doorJams * doorJamPrice;
    const marriageAmt   = marriageLine ? marriagePrice : 0;
    const ceilPatchAmt  = ceilPatch ? ceilPatchPrice : 0;
    const addOnsTotal   = cornersAmt + doorJamAmt + marriageAmt + ceilPatchAmt + repairs + demo;

    const subtotal   = baseLabor + crownLabor + addOnsTotal + materials;
    const rounded    = ceil50(subtotal);
    const finalPrice = Math.max(rounded, 500);
    const adjustment = finalPrice - subtotal;

    return {
      linearFeet,
      baseLabor, crownLabor,
      cornersAmt, doorJamAmt, marriageAmt, ceilPatchAmt,
      addOnsTotal, subtotal, rounded, finalPrice, adjustment,
    };
  }, [
    roomLength, roomWidth,
    baseRate, crownRate, includeCrown,
    vaulted, vaultPct,
    outsideCorners, outsidePrice,
    doorJams, doorJamPrice,
    marriageLine, marriagePrice,
    ceilPatch, ceilPatchPrice,
    repairs, demo, materials,
  ]);

  function handleCopyQuote() {
    const lines = [
      "Trim Work Estimate — Willard's General Contracting",
      `Room: ${roomLength}×${roomWidth} ft  (${fmtInt(calc.linearFeet)} linear ft)`,
      `Trim / Baseboard: ${fmtInt(calc.linearFeet)} LF × $${baseRate}/ft${vaulted ? ` +${vaultPct}%` : ""} = $${fmtInt(calc.baseLabor)}`,
      includeCrown ? `Crown Moulding: ${fmtInt(calc.linearFeet)} LF × $${crownRate}/ft${vaulted ? ` +${vaultPct}%` : ""} = $${fmtInt(calc.crownLabor)}` : null,
      outsideCorners > 0 ? `Crown Outside Corners: ${outsideCorners} × $${outsidePrice} = $${fmtInt(calc.cornersAmt)}` : null,
      doorJams > 0       ? `Door Jams: ${doorJams} × $${doorJamPrice} = $${fmtInt(calc.doorJamAmt)}` : null,
      marriageLine       ? `Double Wide Marriage Line (Ceiling + Wall Seams): $${fmtInt(calc.marriageAmt)}` : null,
      ceilPatch          ? `Small Ceiling Patch & Texture Blend: $${fmtInt(calc.ceilPatchAmt)}` : null,
      repairs > 0        ? `Repairs: $${fmtInt(repairs)}` : null,
      demo > 0           ? `Demo/Removal: $${fmtInt(demo)}` : null,
      materials > 0      ? `Materials: $${fmtInt(materials)}` : null,
      `─────────────────────`,
      `FINAL PRICE: $${fmtInt(calc.finalPrice)}`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleUseNumbers() {
    const lines: DraftLine[] = [];
    const vaultMult = vaulted ? 1 + vaultPct / 100 : 1;

    if (calc.baseLabor > 0) {
      lines.push({
        category: "Labor",
        description: `Trim / Baseboard @ $${baseRate}/LF${vaulted ? ` +${vaultPct}% vaulted` : ""}`,
        quantity: calc.linearFeet,
        unit: "LF",
        unitCost: baseRate * vaultMult,
      });
    }

    if (calc.crownLabor > 0) {
      lines.push({
        category: "Labor",
        description: `Crown Moulding @ $${crownRate}/LF${vaulted ? ` +${vaultPct}% vaulted` : ""}`,
        quantity: calc.linearFeet,
        unit: "LF",
        unitCost: crownRate * vaultMult,
      });
    }

    if (outsideCorners > 0) {
      lines.push({
        category: "Labor",
        description: "Crown Outside Corners",
        quantity: outsideCorners,
        unit: "EA",
        unitCost: outsidePrice,
      });
    }

    if (doorJams > 0) {
      lines.push({
        category: "Labor",
        description: "Door Jam Installation",
        quantity: doorJams,
        unit: "EA",
        unitCost: doorJamPrice,
      });
    }

    if (marriageLine) {
      lines.push({
        category: "Labor",
        description: "Double Wide Marriage Line — Ceiling + Wall Seams & Texture Blending",
        quantity: 1,
        unit: "LOT",
        unitCost: marriagePrice,
      });
    }

    if (ceilPatch) {
      lines.push({
        category: "Labor",
        description: "Small Ceiling Patch & Texture Blend",
        quantity: 1,
        unit: "LOT",
        unitCost: ceilPatchPrice,
      });
    }

    if (repairs > 0) {
      lines.push({ category: "Labor", description: "Wall/Ceiling Repairs", quantity: 1, unit: "LOT", unitCost: repairs });
    }
    if (demo > 0) {
      lines.push({ category: "Labor", description: "Demo/Removal", quantity: 1, unit: "LOT", unitCost: demo });
    }
    if (materials > 0) {
      lines.push({ category: "Material", description: "Trim Materials", quantity: 1, unit: "LOT", unitCost: materials });
    }

    if (calc.adjustment > 0.005) {
      lines.push({ category: "Other", description: "Rounding Adjustment (to nearest $50)", quantity: 1, unit: "LOT", unitCost: calc.adjustment });
    }

    onUseNumbers(lines);
    onClose();
  }

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-xl font-medium";
  const rateInput = "flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-xl font-mono";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/75 overflow-y-auto py-4 px-2">
      <div className="bg-zinc-900 w-full max-w-2xl rounded-2xl border border-zinc-700 shadow-2xl mb-4">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-bold text-white text-base">Trim Work Calculator</h2>
            <p className="text-xs text-zinc-400">Baseboard · Crown Moulding · Door Jams · Ceiling Services</p>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Length (ft)</label>
                <input type="number" step="0.1" min="0" value={roomLength} onChange={e => setRoomLength(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Width (ft)</label>
                <input type="number" step="0.1" min="0" value={roomWidth} onChange={e => setRoomWidth(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="mt-3 bg-zinc-950 rounded-xl p-3 border border-zinc-700 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">Perimeter = 2 × (Length + Width)</p>
                <p className="text-xs text-zinc-500 mt-0.5">Linear feet for baseboard &amp; crown</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-amber-400 font-mono">{fmtInt(calc.linearFeet)} ft</p>
                <p className="text-xs text-zinc-500">linear feet</p>
              </div>
            </div>
          </section>

          {/* 2. Rates */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>🪵</span> 2. Labor Rates
            </h3>
            <div className="space-y-3">
              {/* Baseboard */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300 w-36 shrink-0">Trim / Baseboard</span>
                <span className="text-zinc-400">$</span>
                <input type="number" step="0.25" min="0" value={baseRate} onChange={e => setBaseRate(parseFloat(e.target.value) || 0)} className={rateInput} />
                <span className="text-zinc-400 text-sm whitespace-nowrap">/LF</span>
                {calc.baseLabor > 0 && <span className="text-amber-300 font-mono text-sm whitespace-nowrap">${fmtInt(calc.baseLabor)}</span>}
              </div>

              {/* Crown toggle + rate */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={includeCrown} onChange={e => setIncludeCrown(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                  <span className="text-sm text-zinc-300">Include Crown Moulding</span>
                </label>
                {includeCrown && (
                  <div className="flex items-center gap-3 pl-6">
                    <span className="text-sm text-zinc-300 w-28 shrink-0">Crown Moulding</span>
                    <span className="text-zinc-400">$</span>
                    <input type="number" step="0.25" min="0" value={crownRate} onChange={e => setCrownRate(parseFloat(e.target.value) || 0)} className={rateInput} />
                    <span className="text-zinc-400 text-sm whitespace-nowrap">/LF</span>
                    {calc.crownLabor > 0 && <span className="text-amber-300 font-mono text-sm whitespace-nowrap">${fmtInt(calc.crownLabor)}</span>}
                  </div>
                )}
              </div>

              {/* Vaulted */}
              <div className="flex items-center justify-between bg-zinc-950 rounded-xl p-3 border border-zinc-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={vaulted} onChange={e => setVaulted(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                  <span className="text-sm text-zinc-200">Vaulted Ceiling Uplift</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-sm">+</span>
                  <input type="number" step="5" min="10" max="60" value={vaultPct} onChange={e => setVaultPct(parseInt(e.target.value) || 30)} disabled={!vaulted}
                    className="w-16 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-1 text-white text-sm text-center disabled:opacity-40" />
                  <span className="text-zinc-400 text-sm">%</span>
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

              {/* Crown outside corners */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300 w-40 shrink-0">Crown Outside Corners</span>
                <input type="number" min="0" value={outsideCorners} onChange={e => setOutsideCorners(parseInt(e.target.value) || 0)}
                  className="w-16 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-2 text-white text-base text-center" />
                <span className="text-zinc-500">×</span>
                <span className="text-zinc-400">$</span>
                <input type="number" step="1" min="0" value={outsidePrice} onChange={e => setOutsidePrice(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-2 text-white text-base" />
                {outsideCorners > 0 && <span className="text-amber-300 font-mono text-sm whitespace-nowrap">${fmtInt(calc.cornersAmt)}</span>}
              </div>

              {/* Door jams */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300 w-40 shrink-0">Door Jams</span>
                <input type="number" min="0" value={doorJams} onChange={e => setDoorJams(parseInt(e.target.value) || 0)}
                  className="w-16 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-2 text-white text-base text-center" />
                <span className="text-zinc-500">×</span>
                <span className="text-zinc-400">$</span>
                <input type="number" step="1" min="0" value={doorJamPrice} onChange={e => setDoorJamPrice(parseFloat(e.target.value) || 0)}
                  className="w-20 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-2 text-white text-base" />
                {doorJams > 0 && <span className="text-amber-300 font-mono text-sm whitespace-nowrap">${fmtInt(calc.doorJamAmt)}</span>}
              </div>

              {/* Repairs & demo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Repairs ($)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 text-sm">$</span>
                    <input type="number" step="1" min="0" value={repairs} onChange={e => setRepairs(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Demo/Removal ($)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 text-sm">$</span>
                    <input type="number" step="1" min="0" value={demo} onChange={e => setDemo(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-base" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Ceiling Services */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>🏠</span> 4. Ceiling Services
            </h3>
            <div className="space-y-3">

              {/* Marriage line */}
              <div className="bg-zinc-950 rounded-xl p-3 border border-zinc-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={marriageLine} onChange={e => setMarriageLine(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-zinc-200">Double Wide Marriage Line</span>
                    <p className="text-xs text-zinc-500 mt-0.5">Ceiling + wall seams and texture blending</p>
                  </div>
                  <div className="text-right">
                    {marriageLine ? (
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-400 text-sm">$</span>
                        <input type="number" step="50" min="0" value={marriagePrice} onChange={e => setMarriagePrice(parseFloat(e.target.value) || 0)}
                          className="w-24 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-1 text-amber-300 text-base font-mono text-right" />
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-sm">$1,400</span>
                    )}
                  </div>
                </label>
              </div>

              {/* Ceiling patch */}
              <div className="bg-zinc-950 rounded-xl p-3 border border-zinc-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ceilPatch} onChange={e => setCeilPatch(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-zinc-200">Small Ceiling Patch</span>
                    <p className="text-xs text-zinc-500 mt-0.5">Patch and texture blend</p>
                  </div>
                  <div className="text-right">
                    {ceilPatch ? (
                      <div className="flex items-center gap-1">
                        <span className="text-zinc-400 text-sm">$</span>
                        <input type="number" step="25" min="0" value={ceilPatchPrice} onChange={e => setCeilPatchPrice(parseFloat(e.target.value) || 0)}
                          className="w-24 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-1 text-amber-300 text-base font-mono text-right" />
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-sm">$200</span>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* 5. Materials */}
          <section className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
              <span>🧱</span> 5. Material Cost
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-3xl text-zinc-400">$</span>
              <input type="number" step="1" min="0" value={materials} onChange={e => setMaterials(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-amber-500 focus:outline-none rounded-xl px-4 py-3 text-white text-3xl font-semibold" />
            </div>
          </section>

          {/* 6. Results */}
          <section className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-5 border border-amber-500/30 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
              <span>💰</span> 6. Estimate Summary
            </h3>
            <div className="bg-black/40 rounded-xl p-4 space-y-0">
              {[
                { label: "Trim / Baseboard", val: calc.baseLabor, show: calc.baseLabor > 0 },
                { label: "Crown Moulding", val: calc.crownLabor, show: calc.crownLabor > 0 },
                { label: `Crown Outside Corners (${outsideCorners})`, val: calc.cornersAmt, show: calc.cornersAmt > 0 },
                { label: `Door Jams (${doorJams})`, val: calc.doorJamAmt, show: calc.doorJamAmt > 0 },
                { label: "Marriage Line", val: calc.marriageAmt, show: calc.marriageAmt > 0 },
                { label: "Ceiling Patch", val: calc.ceilPatchAmt, show: calc.ceilPatchAmt > 0 },
                { label: "Repairs", val: repairs, show: repairs > 0 },
                { label: "Demo/Removal", val: demo, show: demo > 0 },
                { label: "Materials", val: materials, show: materials > 0 },
              ].filter(r => r.show).map(({ label, val }) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-zinc-700/60 last:border-b-0 text-sm">
                  <span className="text-zinc-300">{label}</span>
                  <span className="font-mono text-white">${fmtInt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 text-base">
                <span className="font-semibold text-zinc-200">SUBTOTAL</span>
                <span className="font-mono font-bold text-white text-xl">${fmtInt(calc.subtotal)}</span>
              </div>
              {calc.adjustment > 0.005 && (
                <div className="flex justify-between text-xs text-zinc-400 mt-1">
                  <span>Min charge / round-up adjustment</span>
                  <span className="text-emerald-400 font-medium">+${fmtInt(calc.adjustment)}</span>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-amber-400/50 flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-amber-400 uppercase tracking-widest">Final Price</p>
                  <p className="font-mono text-4xl font-black text-white mt-0.5">${fmtInt(calc.finalPrice)}</p>
                </div>
                <p className="text-[10px] text-zinc-500 text-right">Rounded to nearest $50<br />Minimum $500</p>
              </div>
            </div>
          </section>

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleCopyQuote}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-600 bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Quote"}
            </button>
            <button type="button" onClick={handleUseNumbers}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition-colors">
              Use These Numbers →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
