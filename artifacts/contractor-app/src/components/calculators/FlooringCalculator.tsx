import { useState, useMemo } from "react";
import { X, Copy, ChevronRight, Plus, Trash2 } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface FlooringCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[]) => void;
}

type FlooringType = "Carpet" | "Laminate" | "LVP" | "Hardwood" | "Tile";
type QuoteMode = "full" | "labor";
type RateTier = "low" | "mid" | "high";

interface TypeRates {
  full: { low: number; mid: number; high: number; range: string };
  labor: { low: number; mid: number; high: number; range: string };
}

const FLOORING_RATES: Record<FlooringType, TypeRates> = {
  Carpet: {
    full:  { low: 3.00, mid: 5.00, high: 7.00,  range: "$3–$7/SF"   },
    labor: { low: 1.50, mid: 2.75, high: 4.00,  range: "$1.50–$4/SF" },
  },
  Laminate: {
    full:  { low: 4.00, mid: 6.50, high: 9.00,  range: "$4–$9/SF"   },
    labor: { low: 1.50, mid: 2.75, high: 4.00,  range: "$1.50–$4/SF" },
  },
  LVP: {
    full:  { low: 4.00, mid: 7.00, high: 10.00, range: "$4–$10/SF"  },
    labor: { low: 1.50, mid: 2.75, high: 4.00,  range: "$1.50–$4/SF" },
  },
  Hardwood: {
    full:  { low: 6.00, mid: 11.50, high: 25.00, range: "$6–$25/SF" },
    labor: { low: 3.00, mid: 4.50,  high: 6.00,  range: "$3–$6/SF"  },
  },
  Tile: {
    full:  { low: 7.00, mid: 13.50, high: 20.00, range: "$7–$20+/SF" },
    labor: { low: 4.00, mid: 6.00,  high: 8.00,  range: "$4–$8+/SF"  },
  },
};

const FLOORING_TYPES: FlooringType[] = ["Carpet", "Laminate", "LVP", "Hardwood", "Tile"];

interface Room {
  id: number;
  label: string;
  length: string;
  width: string;
  manualSF: string;
}

function roomSF(room: Room): number {
  const manual = parseFloat(room.manualSF);
  if (!isNaN(manual) && manual > 0) return manual;
  const l = parseFloat(room.length) || 0;
  const w = parseFloat(room.width) || 0;
  return l * w;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ceil50(n: number) {
  return Math.ceil(n / 50) * 50;
}

let nextId = 1;
function makeRoom(label?: string): Room {
  return { id: nextId++, label: label ?? "Room", length: "", width: "", manualSF: "" };
}

export function FlooringCalculator({ onClose, onUseNumbers }: FlooringCalculatorProps) {
  const [flooringType, setFlooringType] = useState<FlooringType>("LVP");
  const [mode, setMode] = useState<QuoteMode>("full");
  const [tier, setTier] = useState<RateTier>("mid");
  const [rate, setRate] = useState(FLOORING_RATES["LVP"].full.mid);

  const [rooms, setRooms] = useState<Room[]>([makeRoom("Room 1")]);

  const [subfloorCost, setSubfloorCost] = useState("");
  const [removalSF, setRemovalSF] = useState("");
  const [removalRate, setRemovalRate] = useState(1.00);
  const [underlayment, setUnderlayment] = useState(false);
  const [underlayRate, setUnderlayRate] = useState(0.50);
  const [transQty, setTransQty] = useState(0);
  const [transRate, setTransRate] = useState(50);
  const [stairQty, setStairQty] = useState(0);
  const [stairRate, setStairRate] = useState(65);

  const [copied, setCopied] = useState(false);

  function handleTypeChange(t: FlooringType) {
    setFlooringType(t);
    const rates = FLOORING_RATES[t][mode];
    setRate(rates[tier]);
  }

  function handleModeChange(m: QuoteMode) {
    setMode(m);
    const rates = FLOORING_RATES[flooringType][m];
    setRate(rates[tier]);
  }

  function handleTierChange(t: RateTier) {
    setTier(t);
    setRate(FLOORING_RATES[flooringType][mode][t]);
  }

  function addRoom() {
    setRooms(r => [...r, makeRoom(`Room ${r.length + 1}`)]);
  }

  function removeRoom(id: number) {
    setRooms(r => r.filter(rm => rm.id !== id));
  }

  function updateRoom(id: number, field: keyof Room, value: string) {
    setRooms(r => r.map(rm => rm.id === id ? { ...rm, [field]: value } : rm));
  }

  const calc = useMemo(() => {
    const totalSF = rooms.reduce((s, r) => s + roomSF(r), 0);
    const installAmt = totalSF * rate;

    const subfloor = parseFloat(subfloorCost) || 0;
    const remSF    = parseFloat(removalSF) || 0;
    const remAmt   = remSF * removalRate;
    const underAmt = underlayment ? totalSF * underlayRate : 0;
    const transAmt = transQty * transRate;
    const stairAmt = stairQty * stairRate;

    const subtotal = installAmt + subfloor + remAmt + underAmt + transAmt + stairAmt;
    const final    = Math.max(500, ceil50(subtotal));

    return { totalSF, installAmt, subfloor, remSF, remAmt, underAmt, transAmt, stairAmt, subtotal, final };
  }, [rooms, rate, subfloorCost, removalSF, removalRate, underlayment, underlayRate, transQty, transRate, stairQty, stairRate]);

  function buildLines(): DraftLine[] {
    const lines: DraftLine[] = [];
    const typeName = flooringType;
    const modeSuffix = mode === "labor" ? " (Labor Only)" : "";

    if (calc.installAmt > 0) {
      lines.push({
        category: mode === "labor" ? "Labor" : "Material",
        description: `Flooring – ${typeName} Install${modeSuffix} (${calc.totalSF.toFixed(0)} SF)`,
        quantity: parseFloat(calc.totalSF.toFixed(1)),
        unit: "SF",
        unitCost: rate,
      });
    }
    if (calc.subfloor > 0) {
      lines.push({ category: "Labor", description: "Subfloor Prep", quantity: 1, unit: "LOT", unitCost: calc.subfloor });
    }
    if (calc.remAmt > 0) {
      lines.push({ category: "Labor", description: "Old Floor Removal", quantity: parseFloat(calc.remSF.toFixed(1)), unit: "SF", unitCost: removalRate });
    }
    if (calc.underAmt > 0) {
      lines.push({ category: "Material", description: `Underlayment (${calc.totalSF.toFixed(0)} SF)`, quantity: parseFloat(calc.totalSF.toFixed(1)), unit: "SF", unitCost: underlayRate });
    }
    if (calc.transAmt > 0) {
      lines.push({ category: "Material", description: "Transitions", quantity: transQty, unit: "EA", unitCost: transRate });
    }
    if (calc.stairAmt > 0) {
      lines.push({ category: "Labor", description: "Stair Installation", quantity: stairQty, unit: "EA", unitCost: stairRate });
    }
    return lines;
  }

  function copyQuote() {
    const { totalSF, installAmt, subfloor, remAmt, underAmt, transAmt, stairAmt, subtotal, final } = calc;
    const typeRates = FLOORING_RATES[flooringType][mode];
    const lines = [
      "=== FLOORING ESTIMATE (Willard's General Contracting) ===",
      "",
      `Type: ${flooringType}  |  Mode: ${mode === "full" ? "Materials + Labor" : "Labor Only"}`,
      `Rate: $${fmt(rate)}/SF  (${typeRates.range})`,
      `Total area: ${totalSF.toFixed(1)} SF across ${rooms.length} room(s)`,
      "",
      `Flooring install (${totalSF.toFixed(1)} SF × $${fmt(rate)}/SF): $${fmt(installAmt)}`,
    ];
    if (subfloor > 0)  lines.push(`Subfloor prep: $${fmt(subfloor)}`);
    if (remAmt > 0)    lines.push(`Old floor removal (${calc.remSF.toFixed(1)} SF × $${fmt(removalRate)}): $${fmt(remAmt)}`);
    if (underAmt > 0)  lines.push(`Underlayment (${totalSF.toFixed(1)} SF × $${fmt(underlayRate)}): $${fmt(underAmt)}`);
    if (transAmt > 0)  lines.push(`Transitions (${transQty} × $${fmt(transRate)}): $${fmt(transAmt)}`);
    if (stairAmt > 0)  lines.push(`Stairs (${stairQty} × $${fmt(stairRate)}): $${fmt(stairAmt)}`);
    lines.push("", `Subtotal: $${fmt(subtotal)}`, `Final Price: $${fmt(final)}`, "");
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  const currentRates = FLOORING_RATES[flooringType][mode];
  const sectionHd = "text-xs font-bold uppercase tracking-wider text-gray-500 mb-2";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Flooring Calculator</h2>
              <p className="text-xs text-gray-500">Type · Mode · Area · Rate · Add-ons → live price</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* 1. Flooring type */}
          <div>
            <p className={sectionHd}>1 · Flooring Type</p>
            <div className="flex gap-2 flex-wrap">
              {FLOORING_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    flooringType === t
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Quote mode */}
          <div>
            <p className={sectionHd}>2 · Quote Mode</p>
            <div className="flex gap-2">
              {(["full", "labor"] as QuoteMode[]).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                    mode === m
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                  }`}
                >
                  {m === "full" ? "Materials + Labor" : "Labor Only"}
                  <div className={`text-[10px] font-normal mt-0.5 ${mode === m ? "text-amber-100" : "text-gray-400"}`}>
                    {currentRates.range}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Room area */}
          <div>
            <p className={sectionHd}>3 · Room Area</p>
            <div className="space-y-2">
              {rooms.map((room, idx) => (
                <div key={room.id} className="flex items-end gap-2 flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Label</label>
                    <input
                      value={room.label}
                      onChange={e => updateRoom(room.id, "label", e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Length (ft)</label>
                    <input
                      type="number" min="0" step="0.5"
                      value={room.length}
                      onChange={e => updateRoom(room.id, "length", e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Width (ft)</label>
                    <input
                      type="number" min="0" step="0.5"
                      value={room.width}
                      onChange={e => updateRoom(room.id, "width", e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-[10px] font-semibold text-gray-400 mb-1">Or SF</label>
                    <input
                      type="number" min="0" step="1"
                      value={room.manualSF}
                      onChange={e => updateRoom(room.id, "manualSF", e.target.value)}
                      placeholder="manual"
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="w-16 text-right pb-1.5">
                    <div className="text-[10px] text-gray-400 font-semibold">SF</div>
                    <div className="text-sm font-bold text-amber-700">{roomSF(room).toFixed(0)}</div>
                  </div>
                  {rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRoom(room.id)}
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
              onClick={addRoom}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add another room
            </button>
            <div className="mt-3 bg-amber-50 rounded-lg px-4 py-2 inline-flex items-center gap-3">
              <span className="text-xs font-semibold text-amber-700">Total area:</span>
              <span className="text-lg font-black text-amber-800">{calc.totalSF.toFixed(1)} SF</span>
              <span className="text-xs text-amber-600">across {rooms.length} room(s)</span>
            </div>
          </div>

          {/* 4. Rate */}
          <div>
            <p className={sectionHd}>4 · Rate — {currentRates.range}</p>
            <div className="flex gap-2 mb-3">
              {(["low", "mid", "high"] as RateTier[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTierChange(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors capitalize ${
                    tier === t
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                  }`}
                >
                  {t}
                  <div className={`text-[10px] font-normal mt-0.5 ${tier === t ? "text-amber-100" : "text-gray-400"}`}>
                    ${fmt(currentRates[t])}/SF
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">$/SF (editable)</label>
              <input
                type="number" min="0" step="0.25"
                value={rate}
                onChange={e => setRate(parseFloat(e.target.value) || 0)}
                className="w-28 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* 5. Add-ons */}
          <div>
            <p className={sectionHd}>5 · Add-ons</p>
            <div className="space-y-3">

              {/* Subfloor repair */}
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 w-44 shrink-0">Subfloor prep / repairs</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="50"
                    value={subfloorCost}
                    onChange={e => setSubfloorCost(e.target.value)}
                    placeholder="0"
                    className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-28"
                  />
                </div>
                <span className="text-xs text-gray-400">flat cost</span>
              </div>

              {/* Old flooring removal */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-700 w-44 shrink-0">Old flooring removal</label>
                <input
                  type="number" min="0"
                  value={removalSF}
                  onChange={e => setRemovalSF(e.target.value)}
                  placeholder="SF"
                  className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-xs text-gray-400">SF @</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="0.25"
                    value={removalRate}
                    onChange={e => setRemovalRate(parseFloat(e.target.value) || 0)}
                    className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                  />
                </div>
                <span className="text-xs text-gray-400">/SF</span>
                {parseFloat(removalSF) > 0 && (
                  <span className="text-xs font-bold text-gray-600">= ${fmt(calc.remAmt)}</span>
                )}
              </div>

              {/* Underlayment */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 w-44 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={underlayment}
                    onChange={e => setUnderlayment(e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-gray-700">Underlayment</span>
                </label>
                {underlayment && (
                  <>
                    <span className="text-xs text-gray-400">{calc.totalSF.toFixed(0)} SF @</span>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.05"
                        value={underlayRate}
                        onChange={e => setUnderlayRate(parseFloat(e.target.value) || 0)}
                        className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                      />
                    </div>
                    <span className="text-xs text-gray-400">/SF</span>
                    <span className="text-xs font-bold text-gray-600">= ${fmt(calc.underAmt)}</span>
                  </>
                )}
              </div>

              {/* Transitions */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-700 w-44 shrink-0">Transitions / thresholds</label>
                <input
                  type="number" min="0"
                  value={transQty || ""}
                  onChange={e => setTransQty(parseInt(e.target.value) || 0)}
                  placeholder="Qty"
                  className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-xs text-gray-400">@</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="5"
                    value={transRate}
                    onChange={e => setTransRate(parseFloat(e.target.value) || 0)}
                    className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                  />
                </div>
                <span className="text-xs text-gray-400">ea</span>
                {transQty > 0 && <span className="text-xs font-bold text-gray-600">= ${fmt(calc.transAmt)}</span>}
              </div>

              {/* Stairs */}
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-700 w-44 shrink-0">Stairs</label>
                <input
                  type="number" min="0"
                  value={stairQty || ""}
                  onChange={e => setStairQty(parseInt(e.target.value) || 0)}
                  placeholder="Qty"
                  className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <span className="text-xs text-gray-400">stairs @</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min="0" step="5"
                    value={stairRate}
                    onChange={e => setStairRate(parseFloat(e.target.value) || 0)}
                    className="pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-20"
                  />
                </div>
                <span className="text-xs text-gray-400">ea</span>
                {stairQty > 0 && <span className="text-xs font-bold text-gray-600">= ${fmt(calc.stairAmt)}</span>}
              </div>

            </div>
          </div>

          {/* Results panel */}
          <div className="bg-gray-900 text-white rounded-xl p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Results</p>
            <div className="space-y-1.5">
              {calc.installAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">
                    Flooring install ({calc.totalSF.toFixed(1)} SF × ${fmt(rate)}/SF)
                  </span>
                  <span className="font-semibold">${fmt(calc.installAmt)}</span>
                </div>
              )}
              {calc.subfloor > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Subfloor prep</span>
                  <span className="font-semibold">${fmt(calc.subfloor)}</span>
                </div>
              )}
              {calc.remAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Old floor removal</span>
                  <span className="font-semibold">${fmt(calc.remAmt)}</span>
                </div>
              )}
              {calc.underAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Underlayment</span>
                  <span className="font-semibold">${fmt(calc.underAmt)}</span>
                </div>
              )}
              {calc.transAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Transitions</span>
                  <span className="font-semibold">${fmt(calc.transAmt)}</span>
                </div>
              )}
              {calc.stairAmt > 0 && (
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-gray-300">Stairs</span>
                  <span className="font-semibold">${fmt(calc.stairAmt)}</span>
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
