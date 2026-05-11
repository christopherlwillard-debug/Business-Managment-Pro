import { useState, useMemo, useEffect } from "react";
import { X, Copy, Check, ChevronDown, ChevronRight, Plus, Trash2, Zap } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface AllTradesCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[], append: boolean) => void;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

// ─── Top-level trade section shell ────────────────────────────────────────────

function TradeSectionShell({
  title, subtitle, enabled, onToggle, total, children,
}: {
  title: string; subtitle: string; enabled: boolean; onToggle: () => void; total: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-2xl border transition-colors ${enabled ? "border-amber-500/40 bg-zinc-800/60" : "border-zinc-700 bg-zinc-800/30"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? "bg-amber-500" : "bg-zinc-600"}`}>
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
        </button>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold leading-tight ${enabled ? "text-white" : "text-zinc-400"}`}>{title}</p>
            <p className="text-xs text-zinc-500 truncate">{subtitle}</p>
          </div>
          {enabled && total > 0 && (
            <span className="text-amber-400 font-mono font-bold text-sm shrink-0">${fmtInt(total)}</span>
          )}
          {open ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
        </button>
      </div>
      <div className={`px-4 pb-4 border-t border-zinc-700/60 pt-3 ${(!open || !enabled) ? "hidden" : ""}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Sub-section shell (used inside Contracting for Trim/Siding/Drywall/Other) ─

function SubSectionShell({
  title, subtitle, enabled, onToggle, total, children,
}: {
  title: string; subtitle: string; enabled: boolean; onToggle: () => void; total: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-xl border transition-colors ${enabled ? "border-amber-500/30 bg-zinc-900/70" : "border-zinc-700/50 bg-zinc-900/30"}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={onToggle}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${enabled ? "bg-amber-500" : "bg-zinc-600"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "left-4.5" : "left-0.5"}`} />
        </button>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left">
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold leading-tight ${enabled ? "text-zinc-100" : "text-zinc-500"}`}>{title}</p>
            <p className="text-[10px] text-zinc-600 truncate">{subtitle}</p>
          </div>
          {enabled && total > 0 && (
            <span className="text-amber-400 font-mono font-bold text-xs shrink-0">${fmtInt(total)}</span>
          )}
          {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
        </button>
      </div>
      <div className={`px-3 pb-3 border-t border-zinc-700/40 pt-3 space-y-2.5 ${(!open || !enabled) ? "hidden" : ""}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

function TierBtn({ label, range, active, onClick }: { label: string; range: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 py-2 px-1 rounded-xl border text-center transition-colors ${active ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-amber-400"}`}>
      <div className="text-xs font-bold">{label}</div>
      <div className={`text-[10px] mt-0.5 ${active ? "text-black/70" : "text-zinc-500"}`}>{range}</div>
    </button>
  );
}

function NumField({ label, value, onChange, prefix, suffix, step = "1", small = false }: {
  label?: string; value: string | number; onChange: (v: string) => void;
  prefix?: string; suffix?: string; step?: string; small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-zinc-400">{label}</span>}
      <div className="flex items-center gap-1">
        {prefix && <span className="text-zinc-400 text-sm">{prefix}</span>}
        <input type="number" step={step} min="0" value={value} onChange={e => onChange(e.target.value)}
          className={`bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl text-white ${small ? "w-20 px-2 py-1.5 text-sm" : "flex-1 px-3 py-2 text-base"}`} />
        {suffix && <span className="text-zinc-400 text-sm">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Trim section ──────────────────────────────────────────────────────────────

type TrimTier = "small" | "medium" | "large";
const TRIM_TIERS: Record<TrimTier, { label: string; range: string; rate: number }> = {
  small:  { label: "Small",  range: "< 60 LF",   rate: 7.00 },
  medium: { label: "Medium", range: "60–120 LF",  rate: 5.50 },
  large:  { label: "Large",  range: "120+ LF",    rate: 4.50 },
};

function TrimSection({ onTotalChange }: { onTotalChange: (t: number) => void }) {
  const [lf, setLf] = useState("");
  const [roomL, setRoomL] = useState("");
  const [roomW, setRoomW] = useState("");
  const [tier, setTier] = useState<TrimTier>("medium");
  const [rate, setRate] = useState(TRIM_TIERS.medium.rate);
  const [crown, setCrown] = useState(false);
  const [crownRate, setCrownRate] = useState(8);
  const [doorJamsOn, setDoorJamsOn] = useState(false);
  const [doorJams, setDoorJams] = useState("0");
  const [doorRate, setDoorRate] = useState(350);
  const [marriage, setMarriage] = useState(false);
  const [marriageAmt, setMarriageAmt] = useState(1400);
  const [ceilPatch, setCeilPatch] = useState(false);
  const [ceilAmt, setCeilAmt] = useState(200);
  const [vaulted, setVaulted] = useState(false);
  const [vaultPct, setVaultPct] = useState(30);

  function calcPerimeter() {
    const l = parseFloat(roomL) || 0;
    const w = parseFloat(roomW) || 0;
    if (l > 0 && w > 0) {
      const perim = String(Math.round(2 * (l + w)));
      setLf(perim); setRoomL(""); setRoomW("");
      autoTier(parseFloat(perim));
    }
  }
  function autoTier(feet: number) {
    if (feet < 60)        { setTier("small");  setRate(TRIM_TIERS.small.rate);  }
    else if (feet <= 120) { setTier("medium"); setRate(TRIM_TIERS.medium.rate); }
    else                  { setTier("large");  setRate(TRIM_TIERS.large.rate);  }
  }
  function handleTier(t: TrimTier) { setTier(t); setRate(TRIM_TIERS[t].rate); }

  const total = useMemo(() => {
    const feet = parseFloat(lf) || 0;
    const vm = vaulted ? 1 + vaultPct / 100 : 1;
    return feet * rate * vm
      + (crown ? feet * crownRate * vm : 0)
      + (doorJamsOn ? (parseInt(doorJams) || 0) * doorRate : 0)
      + (marriage ? marriageAmt : 0)
      + (ceilPatch ? ceilAmt : 0);
  }, [lf, rate, vaulted, vaultPct, crown, crownRate, doorJamsOn, doorJams, doorRate, marriage, marriageAmt, ceilPatch, ceilAmt]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <NumField label="Linear Feet" value={lf} onChange={v => { setLf(v); autoTier(parseFloat(v) || 0); }} suffix="LF" />
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <p className="text-xs text-zinc-400">Or enter room size to calculate LF:</p>
          <div className="flex items-end gap-2">
            <NumField label="Length ft" value={roomL} onChange={setRoomL} small />
            <span className="text-zinc-500 pb-2">×</span>
            <NumField label="Width ft" value={roomW} onChange={setRoomW} small />
            <button type="button" onClick={calcPerimeter} disabled={!roomL || !roomW}
              className="px-3 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold disabled:opacity-40 hover:bg-amber-400 transition-colors whitespace-nowrap">
              <Zap className="w-3.5 h-3.5 inline mr-1" />Calc LF
            </button>
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Labor Tier</p>
        <div className="flex gap-2">
          {(Object.entries(TRIM_TIERS) as [TrimTier, typeof TRIM_TIERS[TrimTier]][]).map(([k, t]) => (
            <TierBtn key={k} label={t.label} range={t.range} active={tier === k} onClick={() => handleTier(k)} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-zinc-400">Rate</span>
          <NumField value={rate} onChange={v => setRate(parseFloat(v) || 0)} prefix="$" suffix="/LF" step="0.25" small />
          {parseFloat(lf) > 0 && <span className="text-amber-400 text-xs font-mono">${fmtInt(parseFloat(lf) * rate)}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-700">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={vaulted} onChange={e => setVaulted(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-zinc-200">Vaulted Ceiling Uplift</span>
        </label>
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 text-xs">+</span>
          <input type="number" min="10" max="60" step="5" value={vaultPct} onChange={e => setVaultPct(parseInt(e.target.value) || 30)} disabled={!vaulted}
            className="w-14 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-lg px-2 py-1 text-white text-sm text-center disabled:opacity-40" />
          <span className="text-zinc-400 text-xs">%</span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons</p>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={crown} onChange={e => setCrown(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200">Crown Moulding</span>
            {crown && parseFloat(lf) > 0 && <span className="ml-auto text-amber-300 text-xs font-mono">${fmtInt(parseFloat(lf) * crownRate * (vaulted ? 1 + vaultPct / 100 : 1))}</span>}
          </label>
          {crown && (<div className="flex items-center gap-2 pl-6"><NumField value={crownRate} onChange={v => setCrownRate(parseFloat(v) || 0)} prefix="$" suffix="/LF" step="0.5" small /><span className="text-xs text-zinc-500">(same LF as base)</span></div>)}
        </div>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={doorJamsOn} onChange={e => setDoorJamsOn(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200 flex-1">Door Jams</span>
            {doorJamsOn && parseInt(doorJams) > 0 && <span className="text-amber-300 text-xs font-mono">${fmtInt(parseInt(doorJams) * doorRate)}</span>}
            {!doorJamsOn && <span className="text-zinc-500 text-sm">$350/ea</span>}
          </label>
          {doorJamsOn && (<div className="flex items-center gap-2 pl-6"><NumField label="Count" value={doorJams} onChange={setDoorJams} small /><span className="text-zinc-500 mt-4">×</span><NumField label="$/ea" value={doorRate} onChange={v => setDoorRate(parseFloat(v) || 0)} prefix="$" small /></div>)}
        </div>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={marriage} onChange={e => setMarriage(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <div className="flex-1"><span className="text-sm text-zinc-200">Double Wide Marriage Line</span><p className="text-xs text-zinc-500">Ceiling + wall seams & texture blending</p></div>
            {marriage ? <NumField value={marriageAmt} onChange={v => setMarriageAmt(parseFloat(v) || 0)} prefix="$" small /> : <span className="text-zinc-500 text-sm">$1,400</span>}
          </label>
        </div>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ceilPatch} onChange={e => setCeilPatch(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <div className="flex-1"><span className="text-sm text-zinc-200">Ceiling Patch</span><p className="text-xs text-zinc-500">Patch & texture blend</p></div>
            {ceilPatch ? <NumField value={ceilAmt} onChange={v => setCeilAmt(parseFloat(v) || 0)} prefix="$" small /> : <span className="text-zinc-500 text-sm">$200</span>}
          </label>
        </div>
      </div>
      {total > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <span className="text-sm text-amber-300 font-semibold">Trim Work Total</span>
          <span className="text-amber-400 font-mono font-bold">${fmtInt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Siding section ────────────────────────────────────────────────────────────

type SidingTier = "on-lot" | "standard" | "premium";
const SIDING_TIERS: Record<SidingTier, { label: string; range: string; rate: number }> = {
  "on-lot":   { label: "On the Lot", range: "$1–2/SF",    rate: 1.50 },
  "standard": { label: "Standard",   range: "$2–2.50/SF", rate: 2.00 },
  "premium":  { label: "Premium",    range: "$3/SF",      rate: 3.00 },
};
type SideRow = { length: string; height: string };

function SidingSection({ onTotalChange }: { onTotalChange: (t: number) => void }) {
  const [sf, setSf] = useState("");
  const [sides, setSides] = useState<SideRow[]>([{ length: "", height: "" }]);
  const [tier, setTier] = useState<SidingTier>("standard");
  const [rate, setRate] = useState(SIDING_TIERS.standard.rate);
  const [windows, setWindows] = useState("");
  const [winRate, setWinRate] = useState(150);
  const [doors, setDoors] = useState("");
  const [doorRate, setDoorRate] = useState(250);
  const [tearoff, setTearoff] = useState(false);
  const [tearMode, setTearMode] = useState<"flat" | "sf">("flat");
  const [tearFlat, setTearFlat] = useState("");
  const [tearSfRate, setTearSfRate] = useState(1.5);

  function updateSide(idx: number, field: keyof SideRow, val: string) {
    setSides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  }
  function addSidesToSf() {
    const sideSf = sides.reduce((sum, s) => sum + (parseFloat(s.length) || 0) * (parseFloat(s.height) || 0), 0);
    if (sideSf === 0) return;
    setSf(String(Math.round((parseFloat(sf) || 0) + sideSf)));
    setSides([{ length: "", height: "" }]);
  }
  const sidesSf = sides.reduce((sum, s) => sum + (parseFloat(s.length) || 0) * (parseFloat(s.height) || 0), 0);
  const anySideFilled = sides.some(s => s.length && s.height);
  function handleTier(t: SidingTier) { setTier(t); setRate(SIDING_TIERS[t].rate); }

  const total = useMemo(() => {
    const sqft = parseFloat(sf) || 0;
    return sqft * rate
      + (parseInt(windows) || 0) * winRate
      + (parseInt(doors) || 0) * doorRate
      + (tearoff ? (tearMode === "flat" ? parseFloat(tearFlat) || 0 : sqft * tearSfRate) : 0);
  }, [sf, rate, windows, winRate, doors, doorRate, tearoff, tearMode, tearFlat, tearSfRate]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <NumField label="Square Feet (SF)" value={sf} onChange={setSf} suffix="SF" />
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <p className="text-xs text-zinc-400">Or calculate by side (Length × Height):</p>
          {sides.map((side, idx) => {
            const sideSf = (parseFloat(side.length) || 0) * (parseFloat(side.height) || 0);
            return (
              <div key={idx} className="flex items-end gap-1">
                <NumField label="Length ft" value={side.length} onChange={v => updateSide(idx, "length", v)} small />
                <span className="text-zinc-500 pb-2">×</span>
                <NumField label="Height ft" value={side.height} onChange={v => updateSide(idx, "height", v)} small />
                {side.length && side.height && sideSf > 0 && <span className="text-amber-400 text-xs font-mono pb-2 whitespace-nowrap">= {Math.round(sideSf)} SF</span>}
                {sides.length > 1 && (
                  <button type="button" onClick={() => setSides(prev => prev.filter((_, i) => i !== idx))}
                    className="pb-2 text-zinc-500 hover:text-red-400 text-lg leading-none ml-1">×</button>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => setSides(prev => [...prev, { length: "", height: "" }])}
              className="text-xs text-zinc-400 hover:text-amber-400 border border-zinc-700 hover:border-amber-700 rounded-lg px-2 py-1 transition-colors">+ Add Side</button>
            <button type="button" onClick={addSidesToSf} disabled={!anySideFilled}
              className="px-3 py-1 rounded-xl bg-amber-500 text-black text-xs font-bold disabled:opacity-40 hover:bg-amber-400 transition-colors">Add to SF</button>
            {anySideFilled && sidesSf > 0 && (
              <span className="text-xs text-zinc-500">{sides.filter(s => s.length && s.height).length} side{sides.filter(s => s.length && s.height).length !== 1 ? "s" : ""} = {Math.round(sidesSf)} SF</span>
            )}
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Labor Tier</p>
        <div className="flex gap-2">
          {(Object.entries(SIDING_TIERS) as [SidingTier, typeof SIDING_TIERS[SidingTier]][]).map(([k, t]) => (
            <TierBtn key={k} label={t.label} range={t.range} active={tier === k} onClick={() => handleTier(k)} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-zinc-400">Rate</span>
          <NumField value={rate} onChange={v => setRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" small />
          {parseFloat(sf) > 0 && <span className="text-amber-400 text-xs font-mono">${fmtInt(parseFloat(sf) * rate)}</span>}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons</p>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-sm text-zinc-200 mb-2">Windows</p>
          <div className="flex items-center gap-2">
            <NumField label="Count" value={windows} onChange={setWindows} small />
            <span className="text-zinc-500 mt-4">×</span>
            <NumField label="$/ea" value={winRate} onChange={v => setWinRate(parseFloat(v) || 0)} prefix="$" small />
            {parseInt(windows) > 0 && <span className="text-amber-300 text-xs font-mono mt-4">${fmtInt(parseInt(windows) * winRate)}</span>}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-sm text-zinc-200 mb-2">Exterior Doors</p>
          <div className="flex items-center gap-2">
            <NumField label="Count" value={doors} onChange={setDoors} small />
            <span className="text-zinc-500 mt-4">×</span>
            <NumField label="$/ea" value={doorRate} onChange={v => setDoorRate(parseFloat(v) || 0)} prefix="$" small />
            {parseInt(doors) > 0 && <span className="text-amber-300 text-xs font-mono mt-4">${fmtInt(parseInt(doors) * doorRate)}</span>}
          </div>
        </div>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={tearoff} onChange={e => setTearoff(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200">Tear-off & Disposal</span>
          </label>
          {tearoff && (
            <div className="pl-6 space-y-2">
              <div className="flex gap-2">
                <button type="button" onClick={() => setTearMode("flat")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${tearMode === "flat" ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300"}`}>Flat $</button>
                <button type="button" onClick={() => setTearMode("sf")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${tearMode === "sf" ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300"}`}>$/SF</button>
              </div>
              {tearMode === "flat" ? <NumField value={tearFlat} onChange={setTearFlat} prefix="$" /> : <NumField value={tearSfRate} onChange={v => setTearSfRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" />}
            </div>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <span className="text-sm text-amber-300 font-semibold">Siding Total</span>
          <span className="text-amber-400 font-mono font-bold">${fmtInt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Drywall section ───────────────────────────────────────────────────────────

type DrywallTier = "patch" | "partial" | "full";
const DRYWALL_TIERS: Record<DrywallTier, { label: string; range: string; rate: number }> = {
  patch:   { label: "Patch / Repair", range: "$2–3/SF",    rate: 2.50 },
  partial: { label: "Partial Room",   range: "$1.50–2/SF", rate: 1.75 },
  full:    { label: "Full / New",     range: "$1–1.50/SF", rate: 1.25 },
};

function DrywallSection({ onTotalChange }: { onTotalChange: (t: number) => void }) {
  const [sf, setSf] = useState("");
  const [tier, setTier] = useState<DrywallTier>("patch");
  const [rate, setRate] = useState(DRYWALL_TIERS.patch.rate);
  const [texture, setTexture] = useState(false);
  const [textureAmt, setTextureAmt] = useState(150);
  const [corners, setCorners] = useState("");
  const [cornerRate, setCornerRate] = useState(25);

  function handleTier(t: DrywallTier) { setTier(t); setRate(DRYWALL_TIERS[t].rate); }

  const total = useMemo(() => {
    const sqft = parseFloat(sf) || 0;
    return sqft * rate + (texture ? textureAmt : 0) + (parseInt(corners) || 0) * cornerRate;
  }, [sf, rate, texture, textureAmt, corners, cornerRate]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      <NumField label="Square Feet (SF)" value={sf} onChange={setSf} suffix="SF" />
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Labor Tier</p>
        <div className="flex gap-2">
          {(Object.entries(DRYWALL_TIERS) as [DrywallTier, typeof DRYWALL_TIERS[DrywallTier]][]).map(([k, t]) => (
            <TierBtn key={k} label={t.label} range={t.range} active={tier === k} onClick={() => handleTier(k)} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-zinc-400">Rate</span>
          <NumField value={rate} onChange={v => setRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" small />
          {parseFloat(sf) > 0 && <span className="text-amber-400 text-xs font-mono">${fmtInt(parseFloat(sf) * rate)}</span>}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons</p>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={texture} onChange={e => setTexture(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200 flex-1">Texture Match</span>
            {texture ? <NumField value={textureAmt} onChange={v => setTextureAmt(parseFloat(v) || 0)} prefix="$" small /> : <span className="text-zinc-500 text-sm">$150</span>}
          </label>
        </div>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-sm text-zinc-200 mb-2">Corner Bead</p>
          <div className="flex items-center gap-2">
            <NumField label="Count" value={corners} onChange={setCorners} small />
            <span className="text-zinc-500 mt-4">×</span>
            <NumField label="$/ea" value={cornerRate} onChange={v => setCornerRate(parseFloat(v) || 0)} prefix="$" small />
            {parseInt(corners) > 0 && <span className="text-amber-300 text-xs font-mono mt-4">${fmtInt(parseInt(corners) * cornerRate)}</span>}
          </div>
        </div>
      </div>
      {total > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <span className="text-sm text-amber-300 font-semibold">Drywall Total</span>
          <span className="text-amber-400 font-mono font-bold">${fmtInt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Other Work section ────────────────────────────────────────────────────────

interface OtherRow { id: number; desc: string; amount: string; }

function OtherWorkSection({ onRowsChange }: { onRowsChange: (rows: OtherRow[]) => void }) {
  const [rows, setRows] = useState<OtherRow[]>([{ id: Date.now(), desc: "", amount: "" }]);
  let idCounter = Date.now();

  function addRow() {
    const updated = [...rows, { id: ++idCounter, desc: "", amount: "" }];
    setRows(updated); onRowsChange(updated);
  }
  function updateRow(id: number, field: "desc" | "amount", val: string) {
    const updated = rows.map(r => r.id === id ? { ...r, [field]: val } : r);
    setRows(updated); onRowsChange(updated);
  }
  function removeRow(id: number) {
    if (rows.length === 1) return;
    const updated = rows.filter(r => r.id !== id);
    setRows(updated); onRowsChange(updated);
  }

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.id} className="flex gap-2 items-center">
          <input type="text" value={row.desc} onChange={e => updateRow(row.id, "desc", e.target.value)}
            placeholder="Description"
            className="flex-1 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-sm" />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-zinc-400 text-sm">$</span>
            <input type="number" min="0" step="1" value={row.amount} onChange={e => updateRow(row.id, "amount", e.target.value)}
              placeholder="0"
              className="w-24 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-2 text-white text-sm text-right" />
          </div>
          <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length === 1}
            className="text-zinc-600 hover:text-red-400 disabled:opacity-30 p-1 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold hover:text-amber-400 transition-colors px-1 py-1">
        <Plus className="w-3.5 h-3.5" /> Add Row
      </button>
    </div>
  );
}

// ─── Contracting trade section (wraps Trim / Siding / Drywall / Other) ─────────

function ContractingTradeSection({
  onTotalChange,
  onLinesChange,
}: {
  onTotalChange: (t: number) => void;
  onLinesChange: (lines: DraftLine[]) => void;
}) {
  const [trimOn, setTrimOn]     = useState(false);
  const [sidingOn, setSidingOn] = useState(false);
  const [drywallOn, setDrywallOn] = useState(false);
  const [otherOn, setOtherOn]   = useState(false);

  const [trimTotal, setTrimTotal]       = useState(0);
  const [sidingTotal, setSidingTotal]   = useState(0);
  const [drywallTotal, setDrywallTotal] = useState(0);
  const [otherRows, setOtherRows]       = useState<OtherRow[]>([{ id: Date.now(), desc: "", amount: "" }]);

  const otherTotal = otherRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const total =
    (trimOn ? trimTotal : 0) +
    (sidingOn ? sidingTotal : 0) +
    (drywallOn ? drywallTotal : 0) +
    (otherOn ? otherTotal : 0);

  const lines = useMemo((): DraftLine[] => {
    const out: DraftLine[] = [];
    if (trimOn && trimTotal > 0)
      out.push({ category: "Labor", description: "Trim Work", quantity: 1, unit: "LOT", unitCost: Math.round(trimTotal) });
    if (sidingOn && sidingTotal > 0)
      out.push({ category: "Labor", description: "Siding", quantity: 1, unit: "LOT", unitCost: Math.round(sidingTotal) });
    if (drywallOn && drywallTotal > 0)
      out.push({ category: "Labor", description: "Drywall", quantity: 1, unit: "LOT", unitCost: Math.round(drywallTotal) });
    if (otherOn)
      otherRows.filter(r => r.desc.trim() && parseFloat(r.amount) > 0).forEach(r =>
        out.push({ category: "Labor", description: r.desc.trim(), quantity: 1, unit: "LOT", unitCost: Math.round(parseFloat(r.amount)) })
      );
    return out;
  }, [trimOn, trimTotal, sidingOn, sidingTotal, drywallOn, drywallTotal, otherOn, otherRows]);

  useEffect(() => { onTotalChange(total); }, [total]);
  useEffect(() => { onLinesChange(lines); }, [lines]);

  return (
    <div className="space-y-2">
      <SubSectionShell title="Trim Work" subtitle="Baseboard · Crown Moulding · Door Jams · Ceiling Services" enabled={trimOn} onToggle={() => setTrimOn(o => !o)} total={trimTotal}>
        <TrimSection onTotalChange={setTrimTotal} />
      </SubSectionShell>
      <SubSectionShell title="Siding" subtitle="SF-based · On-lot / Standard / Premium · Windows & Doors" enabled={sidingOn} onToggle={() => setSidingOn(o => !o)} total={sidingTotal}>
        <SidingSection onTotalChange={setSidingTotal} />
      </SubSectionShell>
      <SubSectionShell title="Drywall" subtitle="Patch / Partial / Full · Texture match · Corner bead" enabled={drywallOn} onToggle={() => setDrywallOn(o => !o)} total={drywallTotal}>
        <DrywallSection onTotalChange={setDrywallTotal} />
      </SubSectionShell>
      <SubSectionShell title="Other Work" subtitle="Freeform — any description + flat dollar amount" enabled={otherOn} onToggle={() => setOtherOn(o => !o)} total={otherTotal}>
        <OtherWorkSection onRowsChange={setOtherRows} />
      </SubSectionShell>
    </div>
  );
}

// ─── Flooring section ──────────────────────────────────────────────────────────

type FlooringType = "Carpet" | "Laminate" | "LVP" | "Hardwood" | "Tile";
type QuoteMode = "full" | "labor";
type FlooringRateTier = "low" | "mid" | "high";
interface FlooringRoom { id: number; label: string; length: string; width: string; manualSF: string; }

const FLOORING_RATES: Record<FlooringType, { full: { low: number; mid: number; high: number; range: string }; labor: { low: number; mid: number; high: number; range: string } }> = {
  Carpet:   { full: { low: 3, mid: 5, high: 7, range: "$3–$7/SF" },      labor: { low: 2, mid: 4.5, high: 6, range: "$2–$6/SF" } },
  Laminate: { full: { low: 4, mid: 6.5, high: 9, range: "$4–$9/SF" },    labor: { low: 2, mid: 4.5, high: 6, range: "$2–$6/SF" } },
  LVP:      { full: { low: 4, mid: 7, high: 10, range: "$4–$10/SF" },    labor: { low: 2, mid: 4.5, high: 6, range: "$2–$6/SF" } },
  Hardwood: { full: { low: 6, mid: 11.5, high: 25, range: "$6–$25/SF" }, labor: { low: 3, mid: 4.5, high: 6, range: "$3–$6/SF" } },
  Tile:     { full: { low: 7, mid: 13.5, high: 20, range: "$7–$20+/SF" }, labor: { low: 4, mid: 6, high: 8, range: "$4–$8+/SF" } },
};
const FLOORING_TYPES: FlooringType[] = ["Carpet", "Laminate", "LVP", "Hardwood", "Tile"];

function roomSF(room: FlooringRoom): number {
  const m = parseFloat(room.manualSF);
  if (!isNaN(m) && m > 0) return m;
  return (parseFloat(room.length) || 0) * (parseFloat(room.width) || 0);
}

let floorRoomId = 1000;
function makeRoom(label?: string): FlooringRoom {
  return { id: floorRoomId++, label: label ?? "Room", length: "", width: "", manualSF: "" };
}

function FlooringSection({ onTotalChange }: { onTotalChange: (t: number, lines: DraftLine[]) => void }) {
  const [flooringType, setFlooringType] = useState<FlooringType>("LVP");
  const [mode, setMode] = useState<QuoteMode>("labor");
  const [tier, setTier] = useState<FlooringRateTier>("mid");
  const [rate, setRate] = useState(FLOORING_RATES["LVP"].labor.mid);
  const [rooms, setRooms] = useState<FlooringRoom[]>([makeRoom("Room 1")]);
  const [subfloorCost, setSubfloorCost] = useState("");
  const [removalSF, setRemovalSF] = useState("");
  const [removalRate, setRemovalRate] = useState(1.00);
  const [underlayment, setUnderlayment] = useState(false);
  const [underlayRate, setUnderlayRate] = useState(0.50);
  const [transQty, setTransQty] = useState(0);
  const [transRate, setTransRate] = useState(50);
  const [stairQty, setStairQty] = useState(0);
  const [stairRate, setStairRate] = useState(65);

  function handleTypeChange(t: FlooringType) { setFlooringType(t); setRate(FLOORING_RATES[t][mode][tier]); }
  function handleModeChange(m: QuoteMode) { setMode(m); setRate(FLOORING_RATES[flooringType][m][tier]); }
  function handleTierChange(t: FlooringRateTier) { setTier(t); setRate(FLOORING_RATES[flooringType][mode][t]); }
  function updateRoom(id: number, field: keyof FlooringRoom, value: string) {
    setRooms(r => r.map(rm => rm.id === id ? { ...rm, [field]: value } : rm));
  }

  const calc = useMemo(() => {
    const totalSF = rooms.reduce((s, r) => s + roomSF(r), 0);
    const installAmt = totalSF * rate;
    const subfloor = parseFloat(subfloorCost) || 0;
    const remSF = parseFloat(removalSF) || 0;
    const remAmt = remSF * removalRate;
    const underAmt = underlayment ? totalSF * underlayRate : 0;
    const transAmt = transQty * transRate;
    const stairAmt = stairQty * stairRate;
    const subtotal = installAmt + subfloor + remAmt + underAmt + transAmt + stairAmt;
    const final = Math.max(500, Math.ceil(subtotal / 50) * 50);
    return { totalSF, installAmt, subfloor, remSF, remAmt, underAmt, transAmt, stairAmt, subtotal, final };
  }, [rooms, rate, subfloorCost, removalSF, removalRate, underlayment, underlayRate, transQty, transRate, stairQty, stairRate]);

  const lines = useMemo((): DraftLine[] => {
    const out: DraftLine[] = [];
    const modeSuffix = mode === "labor" ? " (Labor Only)" : "";
    if (calc.installAmt > 0) out.push({ category: mode === "labor" ? "Labor" : "Material", description: `Flooring – ${flooringType} Install${modeSuffix} (${calc.totalSF.toFixed(0)} SF)`, quantity: parseFloat(calc.totalSF.toFixed(1)), unit: "SF", unitCost: rate });
    if (calc.subfloor > 0) out.push({ category: "Labor", description: "Subfloor Prep", quantity: 1, unit: "LOT", unitCost: calc.subfloor });
    if (calc.remAmt > 0) out.push({ category: "Labor", description: "Old Floor Removal", quantity: parseFloat(calc.remSF.toFixed(1)), unit: "SF", unitCost: removalRate });
    if (calc.underAmt > 0) out.push({ category: "Material", description: `Underlayment (${calc.totalSF.toFixed(0)} SF)`, quantity: parseFloat(calc.totalSF.toFixed(1)), unit: "SF", unitCost: underlayRate });
    if (calc.transAmt > 0) out.push({ category: "Material", description: "Transitions", quantity: transQty, unit: "EA", unitCost: transRate });
    if (calc.stairAmt > 0) out.push({ category: "Labor", description: "Stair Installation", quantity: stairQty, unit: "EA", unitCost: stairRate });
    const adj = calc.final - calc.subtotal;
    if (adj > 0.005) out.push({ category: "Other", description: "Rounding Adjustment (to nearest $50)", quantity: 1, unit: "LOT", unitCost: adj });
    return out;
  }, [calc, flooringType, mode, rate, removalRate, underlayRate, transQty, transRate, stairQty, stairRate]);

  useEffect(() => { onTotalChange(calc.final, lines); }, [calc.final, lines]);

  const currentRates = FLOORING_RATES[flooringType][mode];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Flooring Type</p>
        <div className="flex gap-1.5 flex-wrap">
          {FLOORING_TYPES.map(t => (
            <button key={t} type="button" onClick={() => handleTypeChange(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${flooringType === t ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-amber-400"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Quote Mode</p>
        <div className="flex gap-2">
          {(["full", "labor"] as QuoteMode[]).map(m => (
            <button key={m} type="button" onClick={() => handleModeChange(m)}
              className={`flex-1 py-2 rounded-xl border text-center transition-colors ${mode === m ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-amber-400"}`}>
              <div className="text-xs font-bold">{m === "full" ? "Materials + Labor" : "Labor Only"}</div>
              <div className={`text-[10px] mt-0.5 ${mode === m ? "text-black/70" : "text-zinc-500"}`}>{currentRates.range}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Rooms</p>
        <div className="space-y-2">
          {rooms.map((room) => (
            <div key={room.id} className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
              <div className="flex items-center gap-2 mb-2">
                <input value={room.label} onChange={e => updateRoom(room.id, "label", e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-lg px-2 py-1 text-white text-xs" />
                {rooms.length > 1 && (
                  <button type="button" onClick={() => setRooms(r => r.filter(rm => rm.id !== room.id))}
                    className="text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
              <div className="flex items-end gap-2">
                <NumField label="Length ft" value={room.length} onChange={v => updateRoom(room.id, "length", v)} small />
                <span className="text-zinc-500 pb-2">×</span>
                <NumField label="Width ft" value={room.width} onChange={v => updateRoom(room.id, "width", v)} small />
                <span className="text-zinc-400 text-xs pb-2">or</span>
                <NumField label="SF direct" value={room.manualSF} onChange={v => updateRoom(room.id, "manualSF", v)} small />
                {roomSF(room) > 0 && <span className="text-amber-400 text-xs font-mono pb-2 whitespace-nowrap">= {roomSF(room).toFixed(0)} SF</span>}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRooms(r => [...r, makeRoom(`Room ${r.length + 1}`)])}
          className="mt-2 flex items-center gap-1.5 text-xs text-amber-500 font-semibold hover:text-amber-400 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add room
        </button>
        {calc.totalSF > 0 && <p className="text-xs text-zinc-400 mt-1">Total: <span className="text-amber-400 font-mono">{calc.totalSF.toFixed(1)} SF</span></p>}
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Rate — {currentRates.range}</p>
        <div className="flex gap-2 mb-2">
          {(["low", "mid", "high"] as FlooringRateTier[]).map(t => (
            <TierBtn key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} range={`$${fmt(currentRates[t])}/SF`} active={tier === t} onClick={() => handleTierChange(t)} />
          ))}
        </div>
        <NumField label="$/SF (editable)" value={rate} onChange={v => setRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" small />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons</p>
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200 w-36 shrink-0">Subfloor prep</span>
            <NumField value={subfloorCost} onChange={setSubfloorCost} prefix="$" small />
            <span className="text-xs text-zinc-500">flat</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200 w-36 shrink-0">Old floor removal</span>
            <NumField value={removalSF} onChange={setRemovalSF} suffix="SF" small />
            <span className="text-xs text-zinc-500">@</span>
            <NumField value={removalRate} onChange={v => setRemovalRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" small />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={underlayment} onChange={e => setUnderlayment(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200">Underlayment</span>
            {underlayment && <NumField value={underlayRate} onChange={v => setUnderlayRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.05" small />}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200 w-36 shrink-0">Transitions</span>
            <NumField value={transQty || ""} onChange={v => setTransQty(parseInt(v) || 0)} suffix="ea" small />
            <span className="text-xs text-zinc-500">@</span>
            <NumField value={transRate} onChange={v => setTransRate(parseFloat(v) || 0)} prefix="$" suffix="/ea" step="5" small />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200 w-36 shrink-0">Stairs</span>
            <NumField value={stairQty || ""} onChange={v => setStairQty(parseInt(v) || 0)} suffix="ea" small />
            <span className="text-xs text-zinc-500">@</span>
            <NumField value={stairRate} onChange={v => setStairRate(parseFloat(v) || 0)} prefix="$" suffix="/ea" step="5" small />
          </div>
        </div>
      </div>
      {calc.final > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <span className="text-sm text-amber-300 font-semibold">Flooring Total</span>
          <span className="text-amber-400 font-mono font-bold">${fmtInt(calc.final)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Plumbing section ──────────────────────────────────────────────────────────

const PLUMBING_BASE = 1000;
const PLUMBING_DROP_RATE = 125;

interface PlumbAddOn { id: number; label: string; amount: string; }
let plumbId = 2000;

function PlumbingSection({ onTotalChange }: { onTotalChange: (t: number, lines: DraftLine[]) => void }) {
  const [drops, setDrops] = useState(2);
  const [addOns, setAddOns] = useState<PlumbAddOn[]>([]);

  const calc = useMemo(() => {
    const extraDrops = Math.max(0, drops - 2);
    const extraAmt = extraDrops * PLUMBING_DROP_RATE;
    const addOnTotal = addOns.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    return { extraDrops, extraAmt, addOnTotal, total: PLUMBING_BASE + extraAmt + addOnTotal };
  }, [drops, addOns]);

  const lines = useMemo((): DraftLine[] => {
    const out: DraftLine[] = [
      { category: "Labor", description: "Plumbing – Base Charge (2 drops)", quantity: 1, unit: "LOT", unitCost: PLUMBING_BASE },
    ];
    if (calc.extraDrops > 0) {
      out.push({
        category: "Labor",
        description: `Plumbing – Additional Drops (${calc.extraDrops} × $${PLUMBING_DROP_RATE})`,
        quantity: calc.extraDrops,
        unit: "EA",
        unitCost: PLUMBING_DROP_RATE,
      });
    }
    for (const addon of addOns) {
      const amt = parseFloat(addon.amount) || 0;
      if (amt > 0 && addon.label.trim()) {
        out.push({ category: "Labor", description: addon.label.trim(), quantity: 1, unit: "LOT", unitCost: amt });
      }
    }
    return out;
  }, [calc.extraDrops, addOns]);

  useEffect(() => { onTotalChange(calc.total, lines); }, [calc.total, lines]);

  function updateAddOn(id: number, field: "label" | "amount", value: string) {
    setAddOns(a => a.map(x => x.id === id ? { ...x, [field]: value } : x));
  }

  return (
    <div className="space-y-3">
      <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
        <p className="text-xs text-zinc-400 mb-2">Number of Drops <span className="text-zinc-600">(min 2)</span></p>
        <div className="flex items-center gap-4">
          <input type="number" min={2} value={drops} onChange={e => setDrops(Math.max(2, parseInt(e.target.value) || 2))}
            className="w-24 text-center text-3xl font-black bg-zinc-800 border-2 border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white" />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${drops <= 2 ? "text-emerald-400" : "text-amber-400"}`}>
              {drops <= 2 ? "All drops included in base" : `${calc.extraDrops} extra drop${calc.extraDrops !== 1 ? "s" : ""} beyond 2`}
            </p>
            <p className="text-xs text-zinc-500 font-mono mt-1">${fmtInt(PLUMBING_BASE)} + ({calc.extraDrops} × ${PLUMBING_DROP_RATE}) = <span className="text-amber-400">${fmtInt(PLUMBING_BASE + calc.extraAmt)}</span></p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {[{ drops: 2, total: 1000 }, { drops: 4, total: 1250 }, { drops: 9, total: 1875 }, { drops: 10, total: 2000 }].map(ex => (
            <button key={ex.drops} type="button" onClick={() => setDrops(ex.drops)}
              className={`px-3 py-1.5 rounded-lg border text-xs text-center transition-colors ${drops === ex.drops ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-amber-600"}`}>
              <div className="font-semibold">{ex.drops} drops</div>
              <div>${ex.total.toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons (optional)</p>
        {addOns.map(addon => (
          <div key={addon.id} className="flex items-center gap-2">
            <input value={addon.label} onChange={e => updateAddOn(addon.id, "label", e.target.value)}
              placeholder="e.g. Water Heater Hookup"
              className="flex-1 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-sm" />
            <NumField value={addon.amount} onChange={v => updateAddOn(addon.id, "amount", v)} prefix="$" step="25" small />
            <button type="button" onClick={() => setAddOns(a => a.filter(x => x.id !== addon.id))}
              className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setAddOns(a => [...a, { id: plumbId++, label: "", amount: "" }])}
          className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold hover:text-amber-400 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add extra line item
        </button>
      </div>
      {calc.total > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <span className="text-sm text-amber-300 font-semibold">Plumbing Total</span>
          <span className="text-amber-400 font-mono font-bold">${fmtInt(calc.total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Punch List section ────────────────────────────────────────────────────────

type ServiceType = "half-day" | "full-day";
const SERVICE_OPTIONS: Record<ServiceType, { label: string; subtitle: string; range: string; default: number }> = {
  "half-day": { label: "Half-Day Service", subtitle: "Up to 4 hours", range: "$400–$600", default: 500 },
  "full-day":  { label: "Full-Day Service", subtitle: "Up to 8 hours", range: "$800–$1,200", default: 1000 },
};

function PunchListSection({ onTotalChange }: { onTotalChange: (t: number, lines: DraftLine[]) => void }) {
  const [serviceType, setServiceType] = useState<ServiceType>("half-day");
  const [servicePrice, setServicePrice] = useState(500);
  const [helperCount, setHelperCount] = useState(0);
  const [helperRate, setHelperRate] = useState(275);
  const [notes, setNotes] = useState("");

  function handleServiceChange(t: ServiceType) { setServiceType(t); setServicePrice(SERVICE_OPTIONS[t].default); }

  const total = useMemo(() => servicePrice + helperCount * helperRate, [servicePrice, helperCount, helperRate]);

  const lines = useMemo((): DraftLine[] => {
    const opt = SERVICE_OPTIONS[serviceType];
    const out: DraftLine[] = [{
      category: "Labor",
      description: `Punch List — ${opt.label} (${opt.subtitle})${notes.trim() ? ` — ${notes.trim()}` : ""}`,
      quantity: 1,
      unit: "LOT",
      unitCost: servicePrice,
    }];
    if (helperCount > 0) {
      out.push({
        category: "Labor",
        description: `Additional Helper${helperCount > 1 ? "s" : ""} (${helperCount} × $${helperRate}/day)`,
        quantity: helperCount,
        unit: "DAY",
        unitCost: helperRate,
      });
    }
    return out;
  }, [serviceType, servicePrice, helperCount, helperRate, notes]);

  useEffect(() => { onTotalChange(total, lines); }, [total, lines]);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Service Duration</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(SERVICE_OPTIONS) as [ServiceType, typeof SERVICE_OPTIONS[ServiceType]][]).map(([key, opt]) => (
            <button key={key} type="button" onClick={() => handleServiceChange(key)}
              className={`py-3 px-3 rounded-xl border-2 text-left transition-all ${serviceType === key ? "border-amber-500 bg-amber-500/10" : "border-zinc-600 bg-zinc-800 hover:border-amber-600"}`}>
              <div className={`text-sm font-bold ${serviceType === key ? "text-amber-400" : "text-zinc-200"}`}>{opt.label}</div>
              <div className={`text-xs mt-0.5 ${serviceType === key ? "text-amber-300" : "text-zinc-500"}`}>{opt.subtitle}</div>
              <div className={`text-xs font-semibold mt-1 ${serviceType === key ? "text-amber-500" : "text-zinc-600"}`}>{opt.range}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Service Price</p>
        <NumField value={servicePrice} onChange={v => setServicePrice(parseFloat(v) || 0)} prefix="$" step="25" />
        <p className="text-xs text-zinc-600 mt-1">Range: {SERVICE_OPTIONS[serviceType].range}</p>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Additional Helpers</p>
        <div className="flex items-center gap-3 flex-wrap">
          <NumField label="Count" value={helperCount || ""} onChange={v => setHelperCount(parseInt(v) || 0)} small />
          <span className="text-zinc-500 mt-4">@</span>
          <NumField label="$/day" value={helperRate} onChange={v => setHelperRate(parseFloat(v) || 0)} prefix="$" step="25" small />
          {helperCount > 0 && <span className="text-amber-400 text-xs font-mono mt-4">${fmtInt(helperCount * helperRate)}</span>}
        </div>
      </div>
      <div>
        <p className="text-xs text-zinc-400 mb-1">Scope Notes (optional)</p>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Touch-ups, door adjustments, caulk gaps…"
          className="w-full bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-sm" />
      </div>
      {total > 0 && (
        <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
          <span className="text-sm text-amber-300 font-semibold">Punch List Total</span>
          <span className="text-amber-400 font-mono font-bold">${fmtInt(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main AllTradesCalculator ──────────────────────────────────────────────────

export function AllTradesCalculator({ onClose, onUseNumbers }: AllTradesCalculatorProps) {
  const [contractingOn, setContractingOn] = useState(false);
  const [flooringOn, setFlooringOn]       = useState(false);
  const [plumbingOn, setPlumbingOn]       = useState(false);
  const [punchOn, setPunchOn]             = useState(false);

  const [contractingTotal, setContractingTotal] = useState(0);
  const [contractingLines, setContractingLines] = useState<DraftLine[]>([]);
  const [flooringTotal, setFlooringTotal]       = useState(0);
  const [flooringLines, setFlooringLines]       = useState<DraftLine[]>([]);
  const [plumbingTotal, setPlumbingTotal]       = useState(0);
  const [plumbingLines, setPlumbingLines]       = useState<DraftLine[]>([]);
  const [punchTotal, setPunchTotal]             = useState(0);
  const [punchLines, setPunchLines]             = useState<DraftLine[]>([]);

  const [copied, setCopied]       = useState(false);
  const [appendMode, setAppendMode] = useState(true);

  const grandTotal =
    (contractingOn ? contractingTotal : 0) +
    (flooringOn ? flooringTotal : 0) +
    (plumbingOn ? plumbingTotal : 0) +
    (punchOn ? punchTotal : 0);

  const activeTrades = [
    contractingOn && contractingTotal > 0,
    flooringOn && flooringTotal > 0,
    plumbingOn && plumbingTotal > 0,
    punchOn && punchTotal > 0,
  ].filter(Boolean).length;

  function handleUseNumbers() {
    const lines: DraftLine[] = [];
    if (contractingOn && contractingLines.length > 0) lines.push(...contractingLines);
    if (flooringOn && flooringLines.length > 0)       lines.push(...flooringLines);
    if (plumbingOn && plumbingLines.length > 0)       lines.push(...plumbingLines);
    if (punchOn && punchLines.length > 0)             lines.push(...punchLines);
    if (lines.length > 0) { onUseNumbers(lines, appendMode); onClose(); }
  }

  function handleCopyQuote() {
    const parts: string[] = ["All Trades Estimate — Willard's General Contracting", ""];
    if (contractingOn && contractingTotal > 0) parts.push(`Contracting:  $${fmtInt(contractingTotal)}`);
    if (flooringOn && flooringTotal > 0)       parts.push(`Flooring:     $${fmtInt(flooringTotal)}`);
    if (plumbingOn && plumbingTotal > 0)       parts.push(`Plumbing:     $${fmtInt(plumbingTotal)}`);
    if (punchOn && punchTotal > 0)             parts.push(`Punch List:   $${fmtInt(punchTotal)}`);
    parts.push("─────────────────────", `TOTAL: $${fmtInt(grandTotal)}`);
    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-zinc-900 w-full max-w-2xl rounded-2xl border border-zinc-700 shadow-2xl flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="font-bold text-white text-base">All Trades Calculator</h2>
            <p className="text-xs text-zinc-400">Toggle each trade — one grand total, one estimate</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Trade sections — scrollable */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <TradeSectionShell
            title="Contracting"
            subtitle="Trim Work · Siding · Drywall · Other Work"
            enabled={contractingOn}
            onToggle={() => setContractingOn(o => !o)}
            total={contractingTotal}
          >
            <ContractingTradeSection
              onTotalChange={setContractingTotal}
              onLinesChange={setContractingLines}
            />
          </TradeSectionShell>

          <TradeSectionShell
            title="Flooring"
            subtitle="Carpet / Laminate / LVP / Hardwood / Tile · Rooms · Add-ons"
            enabled={flooringOn}
            onToggle={() => setFlooringOn(o => !o)}
            total={flooringTotal}
          >
            <FlooringSection onTotalChange={(t, l) => { setFlooringTotal(t); setFlooringLines(l); }} />
          </TradeSectionShell>

          <TradeSectionShell
            title="Plumbing"
            subtitle="$1,000 base · $125/drop after 2 · Custom add-ons"
            enabled={plumbingOn}
            onToggle={() => setPlumbingOn(o => !o)}
            total={plumbingTotal}
          >
            <PlumbingSection onTotalChange={(t, l) => { setPlumbingTotal(t); setPlumbingLines(l); }} />
          </TradeSectionShell>

          <TradeSectionShell
            title="Punch List"
            subtitle="Half-day or full-day service · Additional helpers"
            enabled={punchOn}
            onToggle={() => setPunchOn(o => !o)}
            total={punchTotal}
          >
            <PunchListSection onTotalChange={(t, l) => { setPunchTotal(t); setPunchLines(l); }} />
          </TradeSectionShell>
        </div>

        {/* Sticky footer */}
        <div className="border-t border-zinc-700 px-5 py-4 bg-zinc-900 rounded-b-2xl space-y-3 shrink-0">
          {activeTrades > 0 && (
            <div className="space-y-1.5">
              {contractingOn && contractingTotal > 0 && <div className="flex justify-between text-sm"><span className="text-zinc-300">Contracting</span><span className="font-mono text-white">${fmtInt(contractingTotal)}</span></div>}
              {flooringOn && flooringTotal > 0 && <div className="flex justify-between text-sm"><span className="text-zinc-300">Flooring</span><span className="font-mono text-white">${fmtInt(flooringTotal)}</span></div>}
              {plumbingOn && plumbingTotal > 0 && <div className="flex justify-between text-sm"><span className="text-zinc-300">Plumbing</span><span className="font-mono text-white">${fmtInt(plumbingTotal)}</span></div>}
              {punchOn && punchTotal > 0 && <div className="flex justify-between text-sm"><span className="text-zinc-300">Punch List</span><span className="font-mono text-white">${fmtInt(punchTotal)}</span></div>}
              <div className="flex justify-between pt-2 border-t border-zinc-700">
                <span className="font-bold text-white">Grand Total</span>
                <span className="font-mono font-bold text-amber-400 text-lg">${fmtInt(grandTotal)}</span>
              </div>
            </div>
          )}
          {activeTrades === 0 && (
            <p className="text-center text-zinc-500 text-sm py-1">Toggle a trade above to get started</p>
          )}
          <div className="flex items-center justify-between bg-zinc-800 rounded-xl px-3 py-2 border border-zinc-700">
            <span className="text-xs text-zinc-400">Add to estimate</span>
            <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
              <button type="button" onClick={() => setAppendMode(true)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${appendMode ? "bg-amber-500 text-black" : "text-zinc-400 hover:text-white"}`}>Append</button>
              <button type="button" onClick={() => setAppendMode(false)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${!appendMode ? "bg-amber-500 text-black" : "text-zinc-400 hover:text-white"}`}>Replace</button>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={handleCopyQuote} disabled={activeTrades === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-600 bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-40">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Quote"}
            </button>
            <button type="button" onClick={handleUseNumbers} disabled={activeTrades === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {appendMode ? "Append to Estimate →" : "Replace Lines →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
