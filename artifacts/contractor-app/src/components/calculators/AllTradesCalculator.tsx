import { useState, useMemo, useEffect, useRef } from "react";
import { X, Copy, Check, ChevronDown, ChevronRight, Plus, Trash2, Zap, Settings2 } from "lucide-react";

// ─── Defaults type ─────────────────────────────────────────────────────────────

export interface CalcDefaults {
  plumbing: { baseCharge: number; dropRate: number };
  flooring: {
    labor: Record<string, number>;
    full: Record<string, number>;
    minimumCharge: number;
  };
  trim: { laborRate: number };
  siding: { laborRate: number };
  drywall: { laborRate: number };
  punchList: { halfDayPrice: number; fullDayPrice: number; helperDayRate: number };
}

interface PartialCalcDefaults {
  plumbing?: { baseCharge?: number; dropRate?: number };
  flooring?: { labor?: Record<string, number>; full?: Record<string, number>; minimumCharge?: number };
  trim?: { laborRate?: number };
  siding?: { laborRate?: number };
  drywall?: { laborRate?: number };
  punchList?: { halfDayPrice?: number; fullDayPrice?: number; helperDayRate?: number };
}

const HARDCODED_DEFAULTS: CalcDefaults = {
  plumbing: { baseCharge: 1000, dropRate: 125 },
  flooring: {
    labor: { Carpet: 4.50, Laminate: 4.50, LVP: 4.50, Hardwood: 4.50, Tile: 6.00 },
    full:  { Carpet: 5.00, Laminate: 6.50, LVP: 7.00, Hardwood: 11.50, Tile: 13.50 },
    minimumCharge: 500,
  },
  trim:    { laborRate: 5.50 },
  siding:  { laborRate: 2.00 },
  drywall: { laborRate: 2.50 },
  punchList: { halfDayPrice: 500, fullDayPrice: 1000, helperDayRate: 275 },
};

function mergeDefaults(incoming?: Record<string, unknown> | null): CalcDefaults {
  if (!incoming) return HARDCODED_DEFAULTS;
  const h = HARDCODED_DEFAULTS;
  const p = incoming as PartialCalcDefaults;
  return {
    plumbing: {
      baseCharge: p.plumbing?.baseCharge ?? h.plumbing.baseCharge,
      dropRate:   p.plumbing?.dropRate   ?? h.plumbing.dropRate,
    },
    flooring: {
      labor: { ...h.flooring.labor, ...(p.flooring?.labor ?? {}) },
      full:  { ...h.flooring.full,  ...(p.flooring?.full  ?? {}) },
      minimumCharge: p.flooring?.minimumCharge ?? h.flooring.minimumCharge,
    },
    trim:    { laborRate: p.trim?.laborRate    ?? h.trim.laborRate },
    siding:  { laborRate: p.siding?.laborRate  ?? h.siding.laborRate },
    drywall: { laborRate: p.drywall?.laborRate ?? h.drywall.laborRate },
    punchList: {
      halfDayPrice:  p.punchList?.halfDayPrice  ?? h.punchList.halfDayPrice,
      fullDayPrice:  p.punchList?.fullDayPrice  ?? h.punchList.fullDayPrice,
      helperDayRate: p.punchList?.helperDayRate ?? h.punchList.helperDayRate,
    },
  };
}

// ─── Shared types ──────────────────────────────────────────────────────────────

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
  calculatorDefaults?: Record<string, unknown> | null;
  onSaveDefaults?: (defaults: Record<string, unknown>) => Promise<void>;
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

// ─── Sub-section shell ─────────────────────────────────────────────────────────

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
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
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

function OverrideRow({
  label, settingsRate, unit, overrideRate, onOverrideRate, override, onToggle,
}: {
  label: string; settingsRate: number; unit: string;
  overrideRate: number; onOverrideRate: (v: string) => void;
  override: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-zinc-900 rounded-xl px-3 py-2.5 border border-zinc-700">
      <div className="min-w-0">
        <span className="text-xs text-zinc-500">{label}</span>
        {override ? (
          <div className="mt-1">
            <NumField value={overrideRate} onChange={onOverrideRate} prefix="$" suffix={unit} step="0.25" small />
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm font-bold text-amber-400">${fmt(settingsRate)}{unit}</span>
            <span className="text-[10px] text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700/80">from Settings</span>
          </div>
        )}
      </div>
      <button type="button" onClick={onToggle}
        className={`shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${override ? "border-amber-500/70 text-amber-400 bg-amber-500/10" : "border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"}`}>
        {override ? "Override ✓" : "Override"}
      </button>
    </div>
  );
}

// ─── Trim section ──────────────────────────────────────────────────────────────

function TrimSection({ onTotalChange, defs }: { onTotalChange: (t: number) => void; defs: CalcDefaults }) {
  const settingsRate = defs.trim.laborRate;
  const [lf, setLf] = useState("");
  const [roomL, setRoomL] = useState("");
  const [roomW, setRoomW] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideRate, setOverrideRate] = useState(settingsRate);
  const rate = override ? overrideRate : settingsRate;

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
      setLf(String(Math.round(2 * (l + w))));
      setRoomL(""); setRoomW("");
    }
  }

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
        <NumField label="Linear Feet" value={lf} onChange={setLf} suffix="LF" />
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

      <OverrideRow
        label="Labor Rate"
        settingsRate={settingsRate}
        unit="/LF"
        overrideRate={overrideRate}
        onOverrideRate={v => setOverrideRate(parseFloat(v) || 0)}
        override={override}
        onToggle={() => { if (override) setOverrideRate(settingsRate); setOverride(o => !o); }}
      />

      {parseFloat(lf) > 0 && rate > 0 && (
        <p className="text-xs text-zinc-500 font-mono">{parseFloat(lf).toFixed(0)} LF × ${fmt(rate)} = <span className="text-amber-400">${fmtInt(parseFloat(lf) * rate)}</span></p>
      )}

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

type SideRow = { length: string; height: string };

function SidingSection({ onTotalChange, defs }: { onTotalChange: (t: number) => void; defs: CalcDefaults }) {
  const settingsRate = defs.siding.laborRate;
  const [sf, setSf] = useState("");
  const [sides, setSides] = useState<SideRow[]>([{ length: "", height: "" }]);
  const [override, setOverride] = useState(false);
  const [overrideRate, setOverrideRate] = useState(settingsRate);
  const rate = override ? overrideRate : settingsRate;

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

      <OverrideRow
        label="Labor Rate"
        settingsRate={settingsRate}
        unit="/SF"
        overrideRate={overrideRate}
        onOverrideRate={v => setOverrideRate(parseFloat(v) || 0)}
        override={override}
        onToggle={() => { if (override) setOverrideRate(settingsRate); setOverride(o => !o); }}
      />

      {parseFloat(sf) > 0 && rate > 0 && (
        <p className="text-xs text-zinc-500 font-mono">{parseFloat(sf).toFixed(0)} SF × ${fmt(rate)} = <span className="text-amber-400">${fmtInt(parseFloat(sf) * rate)}</span></p>
      )}

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

function DrywallSection({ onTotalChange, defs }: { onTotalChange: (t: number) => void; defs: CalcDefaults }) {
  const settingsRate = defs.drywall.laborRate;
  const [sf, setSf] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideRate, setOverrideRate] = useState(settingsRate);
  const rate = override ? overrideRate : settingsRate;
  const [texture, setTexture] = useState(false);
  const [textureAmt, setTextureAmt] = useState(150);
  const [corners, setCorners] = useState("");
  const [cornerRate, setCornerRate] = useState(25);

  const total = useMemo(() => {
    const sqft = parseFloat(sf) || 0;
    return sqft * rate + (texture ? textureAmt : 0) + (parseInt(corners) || 0) * cornerRate;
  }, [sf, rate, texture, textureAmt, corners, cornerRate]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      <NumField label="Square Feet (SF)" value={sf} onChange={setSf} suffix="SF" />

      <OverrideRow
        label="Labor Rate"
        settingsRate={settingsRate}
        unit="/SF"
        overrideRate={overrideRate}
        onOverrideRate={v => setOverrideRate(parseFloat(v) || 0)}
        override={override}
        onToggle={() => { if (override) setOverrideRate(settingsRate); setOverride(o => !o); }}
      />

      {parseFloat(sf) > 0 && rate > 0 && (
        <p className="text-xs text-zinc-500 font-mono">{parseFloat(sf).toFixed(0)} SF × ${fmt(rate)} = <span className="text-amber-400">${fmtInt(parseFloat(sf) * rate)}</span></p>
      )}

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
  onTotalChange, onLinesChange, defs,
}: {
  onTotalChange: (t: number) => void;
  onLinesChange: (lines: DraftLine[]) => void;
  defs: CalcDefaults;
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
        <TrimSection onTotalChange={setTrimTotal} defs={defs} />
      </SubSectionShell>
      <SubSectionShell title="Siding" subtitle="SF-based · Windows & Doors · Tear-off" enabled={sidingOn} onToggle={() => setSidingOn(o => !o)} total={sidingTotal}>
        <SidingSection onTotalChange={setSidingTotal} defs={defs} />
      </SubSectionShell>
      <SubSectionShell title="Drywall" subtitle="SF-based · Texture match · Corner bead" enabled={drywallOn} onToggle={() => setDrywallOn(o => !o)} total={drywallTotal}>
        <DrywallSection onTotalChange={setDrywallTotal} defs={defs} />
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
interface FlooringRoom { id: number; label: string; length: string; width: string; manualSF: string; }

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

function FlooringSection({ onTotalChange, defs }: { onTotalChange: (t: number, lines: DraftLine[]) => void; defs: CalcDefaults }) {
  const [flooringType, setFlooringType] = useState<FlooringType>("LVP");
  const [mode, setMode] = useState<QuoteMode>("labor");
  const [override, setOverride] = useState(false);
  const [overrideRate, setOverrideRate] = useState(defs.flooring.labor["LVP"] ?? 4.5);
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

  const settingsRate = (defs.flooring[mode === "full" ? "full" : "labor"][flooringType] ?? 4.5);
  const rate = override ? overrideRate : settingsRate;
  const minCharge = defs.flooring.minimumCharge;

  function handleTypeChange(t: FlooringType) {
    setFlooringType(t);
    if (!override) setOverrideRate(defs.flooring[mode === "full" ? "full" : "labor"][t] ?? 4.5);
  }
  function handleModeChange(m: QuoteMode) {
    setMode(m);
    if (!override) setOverrideRate(defs.flooring[m === "full" ? "full" : "labor"][flooringType] ?? 4.5);
  }
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
    const final = subtotal > 0 ? Math.max(minCharge, Math.ceil(subtotal / 50) * 50) : 0;
    return { totalSF, installAmt, subfloor, remSF, remAmt, underAmt, transAmt, stairAmt, subtotal, final };
  }, [rooms, rate, subfloorCost, removalSF, removalRate, underlayment, underlayRate, transQty, transRate, stairQty, stairRate, minCharge]);

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
            </button>
          ))}
        </div>
      </div>

      <OverrideRow
        label={`${flooringType} ${mode === "full" ? "Materials + Labor" : "Labor"} Rate`}
        settingsRate={settingsRate}
        unit="/SF"
        overrideRate={overrideRate}
        onOverrideRate={v => setOverrideRate(parseFloat(v) || 0)}
        override={override}
        onToggle={() => { if (override) setOverrideRate(settingsRate); setOverride(o => !o); }}
      />

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
        <div className="space-y-1">
          <p className="text-xs text-zinc-600 font-mono text-right">Min charge: ${fmtInt(minCharge)} · rounded to $50</p>
          <div className="flex justify-between items-center px-3 py-2 bg-amber-500/10 rounded-xl border border-amber-500/30">
            <span className="text-sm text-amber-300 font-semibold">Flooring Total</span>
            <span className="text-amber-400 font-mono font-bold">${fmtInt(calc.final)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plumbing section ──────────────────────────────────────────────────────────

interface PlumbAddOn { id: number; label: string; amount: string; }
let plumbId = 2000;

function PlumbingSection({ onTotalChange, defs }: { onTotalChange: (t: number, lines: DraftLine[]) => void; defs: CalcDefaults }) {
  const settingsBase = defs.plumbing.baseCharge;
  const settingsDrop = defs.plumbing.dropRate;

  const [drops, setDrops] = useState(2);
  const [overrideBase, setOverrideBase] = useState(false);
  const [overrideBaseVal, setOverrideBaseVal] = useState(settingsBase);
  const [overrideDrop, setOverrideDrop] = useState(false);
  const [overrideDropVal, setOverrideDropVal] = useState(settingsDrop);
  const [addOns, setAddOns] = useState<PlumbAddOn[]>([]);

  const baseCharge = overrideBase ? overrideBaseVal : settingsBase;
  const dropRate   = overrideDrop ? overrideDropVal : settingsDrop;

  const calc = useMemo(() => {
    const extraDrops = Math.max(0, drops - 2);
    const extraAmt = extraDrops * dropRate;
    const addOnTotal = addOns.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    return { extraDrops, extraAmt, addOnTotal, total: baseCharge + extraAmt + addOnTotal };
  }, [drops, baseCharge, dropRate, addOns]);

  const lines = useMemo((): DraftLine[] => {
    const out: DraftLine[] = [
      { category: "Labor", description: `Plumbing – Base Charge (2 drops)`, quantity: 1, unit: "LOT", unitCost: baseCharge },
    ];
    if (calc.extraDrops > 0) {
      out.push({
        category: "Labor",
        description: `Plumbing – Additional Drops (${calc.extraDrops} × $${dropRate})`,
        quantity: calc.extraDrops,
        unit: "EA",
        unitCost: dropRate,
      });
    }
    for (const addon of addOns) {
      const amt = parseFloat(addon.amount) || 0;
      if (amt > 0 && addon.label.trim()) {
        out.push({ category: "Labor", description: addon.label.trim(), quantity: 1, unit: "LOT", unitCost: amt });
      }
    }
    return out;
  }, [calc.extraDrops, baseCharge, dropRate, addOns]);

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
            <p className="text-xs text-zinc-500 font-mono mt-1">${fmtInt(baseCharge)} + ({calc.extraDrops} × ${dropRate}) = <span className="text-amber-400">${fmtInt(baseCharge + calc.extraAmt)}</span></p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {[2, 4, 9, 10].map(d => {
            const extraD = Math.max(0, d - 2);
            const tot = baseCharge + extraD * dropRate;
            return (
              <button key={d} type="button" onClick={() => setDrops(d)}
                className={`px-3 py-1.5 rounded-lg border text-xs text-center transition-colors ${drops === d ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-amber-600"}`}>
                <div className="font-semibold">{d} drops</div>
                <div>${fmtInt(tot)}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <OverrideRow
          label="Base Charge (2 drops)"
          settingsRate={settingsBase}
          unit=""
          overrideRate={overrideBaseVal}
          onOverrideRate={v => setOverrideBaseVal(parseFloat(v) || 0)}
          override={overrideBase}
          onToggle={() => { if (overrideBase) setOverrideBaseVal(settingsBase); setOverrideBase(o => !o); }}
        />
        <OverrideRow
          label="Rate per Additional Drop"
          settingsRate={settingsDrop}
          unit="/ea"
          overrideRate={overrideDropVal}
          onOverrideRate={v => setOverrideDropVal(parseFloat(v) || 0)}
          override={overrideDrop}
          onToggle={() => { if (overrideDrop) setOverrideDropVal(settingsDrop); setOverrideDrop(o => !o); }}
        />
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

function PunchListSection({ onTotalChange, defs }: { onTotalChange: (t: number, lines: DraftLine[]) => void; defs: CalcDefaults }) {
  const [serviceType, setServiceType] = useState<ServiceType>("half-day");
  const [overridePrice, setOverridePrice] = useState(false);
  const [overridePriceVal, setOverridePriceVal] = useState(defs.punchList.halfDayPrice);
  const [overrideHelper, setOverrideHelper] = useState(false);
  const [overrideHelperVal, setOverrideHelperVal] = useState(defs.punchList.helperDayRate);
  const [helperCount, setHelperCount] = useState(0);
  const [notes, setNotes] = useState("");

  const settingsPrice = serviceType === "half-day" ? defs.punchList.halfDayPrice : defs.punchList.fullDayPrice;
  const settingsHelper = defs.punchList.helperDayRate;
  const servicePrice = overridePrice ? overridePriceVal : settingsPrice;
  const helperRate   = overrideHelper ? overrideHelperVal : settingsHelper;

  function handleServiceChange(t: ServiceType) {
    setServiceType(t);
    if (!overridePrice) setOverridePriceVal(t === "half-day" ? defs.punchList.halfDayPrice : defs.punchList.fullDayPrice);
  }

  const total = useMemo(() => servicePrice + helperCount * helperRate, [servicePrice, helperCount, helperRate]);

  const SERVICE_LABELS: Record<ServiceType, { label: string; subtitle: string }> = {
    "half-day": { label: "Half-Day Service", subtitle: "Up to 4 hours" },
    "full-day":  { label: "Full-Day Service", subtitle: "Up to 8 hours" },
  };

  const lines = useMemo((): DraftLine[] => {
    const opt = SERVICE_LABELS[serviceType];
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
          {(["half-day", "full-day"] as ServiceType[]).map(key => {
            const opt = SERVICE_LABELS[key];
            const settP = key === "half-day" ? defs.punchList.halfDayPrice : defs.punchList.fullDayPrice;
            return (
              <button key={key} type="button" onClick={() => handleServiceChange(key)}
                className={`py-3 px-3 rounded-xl border-2 text-left transition-all ${serviceType === key ? "border-amber-500 bg-amber-500/10" : "border-zinc-600 bg-zinc-800 hover:border-amber-600"}`}>
                <div className={`text-sm font-bold ${serviceType === key ? "text-amber-400" : "text-zinc-200"}`}>{opt.label}</div>
                <div className={`text-xs mt-0.5 ${serviceType === key ? "text-amber-300" : "text-zinc-500"}`}>{opt.subtitle}</div>
                <div className={`text-xs font-semibold mt-1 font-mono ${serviceType === key ? "text-amber-500" : "text-zinc-600"}`}>${fmtInt(settP)}</div>
              </button>
            );
          })}
        </div>
      </div>

      <OverrideRow
        label="Service Price"
        settingsRate={settingsPrice}
        unit=""
        overrideRate={overridePriceVal}
        onOverrideRate={v => setOverridePriceVal(parseFloat(v) || 0)}
        override={overridePrice}
        onToggle={() => { if (overridePrice) setOverridePriceVal(settingsPrice); setOverridePrice(o => !o); }}
      />

      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Additional Helpers</p>
        <div className="flex items-center gap-3 flex-wrap">
          <NumField label="Count" value={helperCount || ""} onChange={v => setHelperCount(parseInt(v) || 0)} small />
          <span className="text-zinc-500 mt-4">@</span>
          <OverrideRow
            label="Helper Day Rate"
            settingsRate={settingsHelper}
            unit="/day"
            overrideRate={overrideHelperVal}
            onOverrideRate={v => setOverrideHelperVal(parseFloat(v) || 0)}
            override={overrideHelper}
            onToggle={() => { if (overrideHelper) setOverrideHelperVal(settingsHelper); setOverrideHelper(o => !o); }}
          />
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

export function AllTradesCalculator({ onClose, onUseNumbers, calculatorDefaults, onSaveDefaults }: AllTradesCalculatorProps) {
  const defs = mergeDefaults(calculatorDefaults);

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

  const [defaultRatesOpen, setDefaultRatesOpen] = useState(false);
  const [editedRates, setEditedRates] = useState(() => ({
    plumbingBase: defs.plumbing.baseCharge,
    plumbingDrop: defs.plumbing.dropRate,
    floorLabor: { ...defs.flooring.labor },
    floorFull:  { ...defs.flooring.full },
    floorMin:   defs.flooring.minimumCharge,
    trim:   defs.trim.laborRate,
    siding: defs.siding.laborRate,
    drywall: defs.drywall.laborRate,
    halfDay:  defs.punchList.halfDayPrice,
    fullDay:  defs.punchList.fullDayPrice,
    helperDay: defs.punchList.helperDayRate,
  }));
  const [ratesSaved, setRatesSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleRatesSave(nextRates: typeof editedRates) {
    if (!onSaveDefaults) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await onSaveDefaults({
        plumbing: { baseCharge: nextRates.plumbingBase, dropRate: nextRates.plumbingDrop },
        flooring: { labor: nextRates.floorLabor, full: nextRates.floorFull, minimumCharge: nextRates.floorMin },
        trim:    { laborRate: nextRates.trim },
        siding:  { laborRate: nextRates.siding },
        drywall: { laborRate: nextRates.drywall },
        punchList: { halfDayPrice: nextRates.halfDay, fullDayPrice: nextRates.fullDay, helperDayRate: nextRates.helperDay },
      });
      setRatesSaved(true);
      setTimeout(() => setRatesSaved(false), 2000);
    }, 800);
  }

  function updateRate<K extends keyof typeof editedRates>(key: K, val: (typeof editedRates)[K]) {
    const next = { ...editedRates, [key]: val };
    setEditedRates(next);
    scheduleRatesSave(next);
  }

  const grandTotal =
    (contractingOn ? contractingTotal : 0) +
    (flooringOn ? flooringTotal : 0) +
    (plumbingOn ? plumbingTotal : 0) +
    (punchOn ? punchTotal : 0);

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
            <p className="text-xs text-zinc-500 mt-0.5">Rates auto-loaded from Settings · Override per section as needed</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white p-2 hover:bg-zinc-800 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">

          {/* Contracting */}
          <TradeSectionShell
            title="Contracting"
            subtitle="Trim · Siding · Drywall · Other"
            enabled={contractingOn}
            onToggle={() => setContractingOn(o => !o)}
            total={contractingTotal}
          >
            <ContractingTradeSection
              onTotalChange={setContractingTotal}
              onLinesChange={setContractingLines}
              defs={defs}
            />
          </TradeSectionShell>

          {/* Flooring */}
          <TradeSectionShell
            title="Flooring"
            subtitle="LVP · Carpet · Laminate · Hardwood · Tile"
            enabled={flooringOn}
            onToggle={() => setFlooringOn(o => !o)}
            total={flooringTotal}
          >
            <FlooringSection onTotalChange={(t, l) => { setFlooringTotal(t); setFlooringLines(l); }} defs={defs} />
          </TradeSectionShell>

          {/* Plumbing */}
          <TradeSectionShell
            title="Plumbing"
            subtitle="Drop-based · base charge + extras"
            enabled={plumbingOn}
            onToggle={() => setPlumbingOn(o => !o)}
            total={plumbingTotal}
          >
            <PlumbingSection onTotalChange={(t, l) => { setPlumbingTotal(t); setPlumbingLines(l); }} defs={defs} />
          </TradeSectionShell>

          {/* Punch List */}
          <TradeSectionShell
            title="Punch List"
            subtitle="Half-day or full-day service"
            enabled={punchOn}
            onToggle={() => setPunchOn(o => !o)}
            total={punchTotal}
          >
            <PunchListSection onTotalChange={(t, l) => { setPunchTotal(t); setPunchLines(l); }} defs={defs} />
          </TradeSectionShell>
        </div>

        {/* ── Default Rates Editor (inline, collapsed by default) ── */}
        {onSaveDefaults && (
          <div className="mt-4 rounded-xl border border-zinc-700 overflow-hidden">
            <button type="button"
              onClick={() => setDefaultRatesOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-300">Default Rates</span>
                {ratesSaved && <span className="text-[10px] text-emerald-400 font-medium">✓ Saved</span>}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${defaultRatesOpen ? "rotate-180" : ""}`} />
            </button>
            {defaultRatesOpen && (
              <div className="px-4 pt-3 pb-4 bg-zinc-900 space-y-4 text-xs">
                {/* Plumbing */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Plumbing</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-400 mb-1">Base Charge</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                        <input type="number" min="0" step="25" value={editedRates.plumbingBase}
                          onChange={e => updateRate("plumbingBase", parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-right focus:outline-none focus:border-amber-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-zinc-400 mb-1">Per Drop</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                        <input type="number" min="0" step="5" value={editedRates.plumbingDrop}
                          onChange={e => updateRate("plumbingDrop", parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-right focus:outline-none focus:border-amber-500" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Flooring */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Flooring ($/SF)</p>
                  <div className="grid grid-cols-5 gap-1.5 text-[10px] text-zinc-500 mb-1">
                    {Object.keys(editedRates.floorLabor).map(t => <span key={t} className="text-center">{t}</span>)}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.keys(editedRates.floorLabor).map(t => (
                      <div key={t}>
                        <label className="block text-zinc-500 text-[10px] mb-0.5">Labor</label>
                        <input type="number" min="0" step="0.25" value={editedRates.floorLabor[t]}
                          onChange={e => updateRate("floorLabor", { ...editedRates.floorLabor, [t]: parseFloat(e.target.value) || 0 })}
                          className="w-full px-1 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-right text-[10px] focus:outline-none focus:border-amber-500" />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.keys(editedRates.floorFull).map(t => (
                      <div key={t}>
                        <label className="block text-zinc-500 text-[10px] mb-0.5">Full</label>
                        <input type="number" min="0" step="0.25" value={editedRates.floorFull[t]}
                          onChange={e => updateRate("floorFull", { ...editedRates.floorFull, [t]: parseFloat(e.target.value) || 0 })}
                          className="w-full px-1 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-right text-[10px] focus:outline-none focus:border-amber-500" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-zinc-400 shrink-0">Min Charge</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                      <input type="number" min="0" step="25" value={editedRates.floorMin}
                        onChange={e => updateRate("floorMin", parseFloat(e.target.value) || 0)}
                        className="w-full pl-5 pr-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-right focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>
                </div>

                {/* Contracting */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Contracting ($/unit)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([["trim", "Trim/LF"], ["siding", "Siding/SF"], ["drywall", "Drywall/SF"]] as const).map(([k, label]) => (
                      <div key={k}>
                        <label className="block text-zinc-400 mb-1">{label}</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                          <input type="number" min="0" step="0.25" value={editedRates[k]}
                            onChange={e => updateRate(k, parseFloat(e.target.value) || 0)}
                            className="w-full pl-5 pr-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-right focus:outline-none focus:border-amber-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Punch List */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Punch List</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([["halfDay", "Half Day"], ["fullDay", "Full Day"], ["helperDay", "Helper/Day"]] as const).map(([k, label]) => (
                      <div key={k}>
                        <label className="block text-zinc-400 mb-1">{label}</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                          <input type="number" min="0" step="25" value={editedRates[k]}
                            onChange={e => updateRate(k, parseFloat(e.target.value) || 0)}
                            className="w-full pl-5 pr-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-right focus:outline-none focus:border-amber-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sticky footer */}
        <div className="border-t border-zinc-800 px-4 py-3 shrink-0 space-y-3">
          {/* Grand Total */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 rounded-xl border border-zinc-700">
            <span className="text-zinc-300 font-semibold text-sm">Grand Total</span>
            <span className="text-2xl font-black text-amber-400 font-mono">${fmtInt(grandTotal)}</span>
          </div>

          {/* Append / Replace + actions */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-zinc-700 overflow-hidden flex-shrink-0">
              <button type="button" onClick={() => setAppendMode(true)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${appendMode ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                Append
              </button>
              <button type="button" onClick={() => setAppendMode(false)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${!appendMode ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                Replace
              </button>
            </div>

            <button type="button" onClick={handleCopyQuote} disabled={grandTotal === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700 disabled:opacity-40 transition-colors">
              {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Quote</>}
            </button>

            <button type="button" onClick={handleUseNumbers} disabled={grandTotal === 0}
              className="flex-1 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold disabled:opacity-40 transition-colors">
              Use Numbers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
