import { useState, useMemo, useEffect } from "react";
import { X, Copy, Check, ChevronDown, ChevronRight, Plus, Trash2, Zap } from "lucide-react";

interface DraftLine {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface ContractingCalculatorProps {
  onClose: () => void;
  onUseNumbers: (lines: DraftLine[], append: boolean) => void;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ─── Shared UI primitives ──────────────────────────────────────────────────────

function SectionShell({
  icon,
  title,
  subtitle,
  enabled,
  onToggle,
  total,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  onToggle: () => void;
  total: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`rounded-2xl border transition-colors ${enabled ? "border-amber-500/40 bg-zinc-800/60" : "border-zinc-700 bg-zinc-800/30"}`}>
      {/* Section header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${enabled ? "bg-amber-500" : "bg-zinc-600"}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
        >
          <span className="text-base">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold leading-tight ${enabled ? "text-white" : "text-zinc-400"}`}>{title}</p>
            <p className="text-xs text-zinc-500 truncate">{subtitle}</p>
          </div>
          {enabled && total > 0 && (
            <span className="text-amber-400 font-mono font-bold text-sm shrink-0">${fmtInt(total)}</span>
          )}
          {open
            ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />}
        </button>
      </div>

      {/* Always mounted — hidden via CSS so child state is preserved on collapse/disable */}
      <div className={`px-4 pb-4 space-y-3 border-t border-zinc-700/60 pt-3 ${(!open || !enabled) ? "hidden" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function TierButton({
  label,
  range,
  active,
  onClick,
}: {
  label: string;
  range: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 px-1 rounded-xl border text-center transition-colors ${
        active
          ? "bg-amber-500 border-amber-500 text-black"
          : "bg-zinc-800 border-zinc-600 text-zinc-300 hover:border-amber-400"
      }`}
    >
      <div className="text-xs font-bold">{label}</div>
      <div className={`text-[10px] mt-0.5 ${active ? "text-black/70" : "text-zinc-500"}`}>{range}</div>
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "1",
  small = false,
}: {
  label?: string;
  value: string | number;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-zinc-400">{label}</span>}
      <div className="flex items-center gap-1">
        {prefix && <span className="text-zinc-400 text-sm">{prefix}</span>}
        <input
          type="number"
          step={step}
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl text-white ${
            small ? "w-20 px-2 py-1.5 text-sm" : "flex-1 px-3 py-2 text-base"
          }`}
        />
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
  const [lf, setLf]         = useState("");
  const [roomL, setRoomL]   = useState("");
  const [roomW, setRoomW]   = useState("");
  const [tier, setTier]     = useState<TrimTier>("medium");
  const [rate, setRate]     = useState(TRIM_TIERS.medium.rate);

  const [crown, setCrown]           = useState(false);
  const [crownRate, setCrownRate]   = useState(8);
  const [doorJamsOn, setDoorJamsOn] = useState(false);
  const [doorJams, setDoorJams]     = useState("0");
  const [doorRate, setDoorRate]     = useState(350);
  const [marriage, setMarriage]     = useState(false);
  const [marriageAmt, setMarriageAmt] = useState(1400);
  const [ceilPatch, setCeilPatch]   = useState(false);
  const [ceilAmt, setCeilAmt]       = useState(200);
  const [vaulted, setVaulted]       = useState(false);
  const [vaultPct, setVaultPct]     = useState(30);

  function calcPerimeter() {
    const l = parseFloat(roomL) || 0;
    const w = parseFloat(roomW) || 0;
    if (l > 0 && w > 0) {
      const perim = String(Math.round(2 * (l + w)));
      setLf(perim);
      setRoomL("");
      setRoomW("");
      autoTier(parseFloat(perim));
    }
  }

  function autoTier(feet: number) {
    if (feet < 60)       { setTier("small");  setRate(TRIM_TIERS.small.rate);  }
    else if (feet <= 120) { setTier("medium"); setRate(TRIM_TIERS.medium.rate); }
    else                  { setTier("large");  setRate(TRIM_TIERS.large.rate);  }
  }

  function handleTier(t: TrimTier) {
    setTier(t);
    setRate(TRIM_TIERS[t].rate);
  }

  const total = useMemo(() => {
    const feet = parseFloat(lf) || 0;
    const vm = vaulted ? 1 + vaultPct / 100 : 1;
    const base = feet * rate * vm;
    const crownAmt = crown ? feet * crownRate * vm : 0;
    const jams = doorJamsOn ? (parseInt(doorJams) || 0) * doorRate : 0;
    return base + crownAmt + jams + (marriage ? marriageAmt : 0) + (ceilPatch ? ceilAmt : 0);
  }, [lf, rate, vaulted, vaultPct, crown, crownRate, doorJamsOn, doorJams, doorRate, marriage, marriageAmt, ceilPatch, ceilAmt]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      {/* LF input + room shortcut */}
      <div className="space-y-2">
        <NumField label="Linear Feet" value={lf} onChange={v => { setLf(v); autoTier(parseFloat(v) || 0); }} suffix="LF" />
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <p className="text-xs text-zinc-400">Or enter room size to calculate LF:</p>
          <div className="flex items-end gap-2">
            <NumField label="Length ft" value={roomL} onChange={setRoomL} small />
            <span className="text-zinc-500 pb-2">×</span>
            <NumField label="Width ft" value={roomW} onChange={setRoomW} small />
            <button
              type="button"
              onClick={calcPerimeter}
              disabled={!roomL || !roomW}
              className="pb-0 px-3 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold disabled:opacity-40 hover:bg-amber-400 transition-colors whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5 inline mr-1" />Calc LF
            </button>
          </div>
        </div>
      </div>

      {/* Tiers */}
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Labor Tier</p>
        <div className="flex gap-2">
          {(Object.entries(TRIM_TIERS) as [TrimTier, typeof TRIM_TIERS[TrimTier]][]).map(([k, t]) => (
            <TierButton key={k} label={t.label} range={t.range} active={tier === k} onClick={() => handleTier(k)} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-zinc-400">Rate</span>
          <NumField value={rate} onChange={v => setRate(parseFloat(v) || 0)} prefix="$" suffix="/LF" step="0.25" small />
          {parseFloat(lf) > 0 && <span className="text-amber-400 text-xs font-mono">${fmtInt(parseFloat(lf) * rate)}</span>}
        </div>
      </div>

      {/* Vaulted ceiling uplift */}
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

      {/* Add-ons */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons</p>

        {/* Crown Moulding */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={crown} onChange={e => setCrown(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200">Crown Moulding</span>
            {crown && parseFloat(lf) > 0 && <span className="ml-auto text-amber-300 text-xs font-mono">${fmtInt(parseFloat(lf) * crownRate * (vaulted ? 1 + vaultPct / 100 : 1))}</span>}
          </label>
          {crown && (
            <div className="flex items-center gap-2 pl-6">
              <NumField value={crownRate} onChange={v => setCrownRate(parseFloat(v) || 0)} prefix="$" suffix="/LF" step="0.5" small />
              <span className="text-xs text-zinc-500">(same LF as base)</span>
            </div>
          )}
        </div>

        {/* Door Jams */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={doorJamsOn} onChange={e => setDoorJamsOn(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200 flex-1">Door Jams</span>
            {doorJamsOn && parseInt(doorJams) > 0 && <span className="text-amber-300 text-xs font-mono">${fmtInt(parseInt(doorJams) * doorRate)}</span>}
            {!doorJamsOn && <span className="text-zinc-500 text-sm">$350/ea</span>}
          </label>
          {doorJamsOn && (
            <div className="flex items-center gap-2 pl-6">
              <NumField label="Count" value={doorJams} onChange={setDoorJams} small />
              <span className="text-zinc-500 mt-4">×</span>
              <NumField label="$/ea" value={doorRate} onChange={v => setDoorRate(parseFloat(v) || 0)} prefix="$" small />
            </div>
          )}
        </div>

        {/* Marriage Line */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={marriage} onChange={e => setMarriage(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <div className="flex-1">
              <span className="text-sm text-zinc-200">Double Wide Marriage Line</span>
              <p className="text-xs text-zinc-500">Ceiling + wall seams & texture blending</p>
            </div>
            {marriage
              ? <NumField value={marriageAmt} onChange={v => setMarriageAmt(parseFloat(v) || 0)} prefix="$" small />
              : <span className="text-zinc-500 text-sm">$1,400</span>}
          </label>
        </div>

        {/* Ceiling Patch */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ceilPatch} onChange={e => setCeilPatch(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <div className="flex-1">
              <span className="text-sm text-zinc-200">Ceiling Patch</span>
              <p className="text-xs text-zinc-500">Patch & texture blend</p>
            </div>
            {ceilPatch
              ? <NumField value={ceilAmt} onChange={v => setCeilAmt(parseFloat(v) || 0)} prefix="$" small />
              : <span className="text-zinc-500 text-sm">$200</span>}
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

function SidingSection({ onTotalChange }: { onTotalChange: (t: number) => void }) {
  const [sf, setSf]         = useState("");
  const [wallW, setWallW]   = useState("");
  const [wallL, setWallL]   = useState("");
  const [wallH, setWallH]   = useState("");
  const [tier, setTier]     = useState<SidingTier>("standard");
  const [rate, setRate]     = useState(SIDING_TIERS.standard.rate);

  const [windows, setWindows]     = useState("");
  const [winRate, setWinRate]     = useState(150);
  const [doors, setDoors]         = useState("");
  const [doorRate, setDoorRate]   = useState(250);
  const [tearoff, setTearoff]     = useState(false);
  const [tearMode, setTearMode]   = useState<"flat" | "sf">("flat");
  const [tearFlat, setTearFlat]   = useState("");
  const [tearSfRate, setTearSfRate] = useState(1.5);

  function applyDoubleWide() {
    setWallW("36");
    setWallL("90");
    setWallH("13.6");
  }

  function calcSf() {
    const w = parseFloat(wallW) || 0;
    const l = parseFloat(wallL) || 0;
    const h = parseFloat(wallH) || 0;
    if (w > 0 && l > 0 && h > 0) {
      setSf(String(Math.round(2 * (w + l) * h)));
      setWallW(""); setWallL(""); setWallH("");
    }
  }

  function handleTier(t: SidingTier) {
    setTier(t);
    setRate(SIDING_TIERS[t].rate);
  }

  const total = useMemo(() => {
    const sqft = parseFloat(sf) || 0;
    const base = sqft * rate;
    const winAmt = (parseInt(windows) || 0) * winRate;
    const doorAmt = (parseInt(doors) || 0) * doorRate;
    const tearAmt = tearoff
      ? (tearMode === "flat" ? parseFloat(tearFlat) || 0 : sqft * tearSfRate)
      : 0;
    return base + winAmt + doorAmt + tearAmt;
  }, [sf, rate, windows, winRate, doors, doorRate, tearoff, tearMode, tearFlat, tearSfRate]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      {/* SF input + wall shortcut */}
      <div className="space-y-2">
        <NumField label="Square Feet (SF)" value={sf} onChange={setSf} suffix="SF" />
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">Or calculate from wall dimensions:</p>
            <button type="button" onClick={applyDoubleWide}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-900/40 border border-amber-700/40 text-amber-400 text-xs font-semibold hover:bg-amber-800/40">
              <Zap className="w-3 h-3" /> Standard Double Wide (36×90×13.6)
            </button>
          </div>
          <div className="flex items-end gap-1 flex-wrap">
            <NumField label="Width ft" value={wallW} onChange={setWallW} small />
            <span className="text-zinc-500 pb-2">×</span>
            <NumField label="Length ft" value={wallL} onChange={setWallL} small />
            <span className="text-zinc-500 pb-2">×</span>
            <NumField label="Height ft" value={wallH} onChange={setWallH} small />
            <button type="button" onClick={calcSf} disabled={!wallW || !wallL || !wallH}
              className="px-3 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold disabled:opacity-40 hover:bg-amber-400 transition-colors whitespace-nowrap">
              <Zap className="w-3.5 h-3.5 inline mr-1" />Calc SF
            </button>
          </div>
          {wallW && wallL && wallH && (
            <p className="text-xs text-zinc-500">= {Math.round(2 * (parseFloat(wallW || "0") + parseFloat(wallL || "0")) * parseFloat(wallH || "0"))} SF total (perimeter × height)</p>
          )}
        </div>
      </div>

      {/* Tiers */}
      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Labor Tier</p>
        <div className="flex gap-2">
          {(Object.entries(SIDING_TIERS) as [SidingTier, typeof SIDING_TIERS[SidingTier]][]).map(([k, t]) => (
            <TierButton key={k} label={t.label} range={t.range} active={tier === k} onClick={() => handleTier(k)} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-zinc-400">Rate</span>
          <NumField value={rate} onChange={v => setRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" small />
          {parseFloat(sf) > 0 && <span className="text-amber-400 text-xs font-mono">${fmtInt(parseFloat(sf) * rate)}</span>}
        </div>
      </div>

      {/* Add-ons */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">Add-Ons</p>

        {/* Windows */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-sm text-zinc-200 mb-2">Windows</p>
          <div className="flex items-center gap-2">
            <NumField label="Count" value={windows} onChange={setWindows} small />
            <span className="text-zinc-500 mt-4">×</span>
            <NumField label="$/ea" value={winRate} onChange={v => setWinRate(parseFloat(v) || 0)} prefix="$" small />
            {parseInt(windows) > 0 && <span className="text-amber-300 text-xs font-mono mt-4">${fmtInt(parseInt(windows) * winRate)}</span>}
          </div>
        </div>

        {/* Exterior Doors */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700">
          <p className="text-sm text-zinc-200 mb-2">Exterior Doors</p>
          <div className="flex items-center gap-2">
            <NumField label="Count" value={doors} onChange={setDoors} small />
            <span className="text-zinc-500 mt-4">×</span>
            <NumField label="$/ea" value={doorRate} onChange={v => setDoorRate(parseFloat(v) || 0)} prefix="$" small />
            {parseInt(doors) > 0 && <span className="text-amber-300 text-xs font-mono mt-4">${fmtInt(parseInt(doors) * doorRate)}</span>}
          </div>
        </div>

        {/* Tear-off */}
        <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-700 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={tearoff} onChange={e => setTearoff(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-zinc-200">Tear-off & Disposal</span>
          </label>
          {tearoff && (
            <div className="pl-6 space-y-2">
              <div className="flex gap-2">
                <button type="button" onClick={() => setTearMode("flat")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${tearMode === "flat" ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300"}`}>
                  Flat $
                </button>
                <button type="button" onClick={() => setTearMode("sf")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${tearMode === "sf" ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-800 border-zinc-600 text-zinc-300"}`}>
                  $/SF
                </button>
              </div>
              {tearMode === "flat"
                ? <NumField value={tearFlat} onChange={setTearFlat} prefix="$" />
                : <NumField value={tearSfRate} onChange={v => setTearSfRate(parseFloat(v) || 0)} prefix="$" suffix="/SF" step="0.25" />}
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
  patch:   { label: "Patch / Repair", range: "$2–3/SF",      rate: 2.50 },
  partial: { label: "Partial Room",   range: "$1.50–2/SF",   rate: 1.75 },
  full:    { label: "Full / New",     range: "$1–1.50/SF",   rate: 1.25 },
};

function DrywallSection({ onTotalChange }: { onTotalChange: (t: number) => void }) {
  const [sf, setSf]         = useState("");
  const [tier, setTier]     = useState<DrywallTier>("patch");
  const [rate, setRate]     = useState(DRYWALL_TIERS.patch.rate);
  const [texture, setTexture] = useState(false);
  const [textureAmt, setTextureAmt] = useState(150);
  const [corners, setCorners] = useState("");
  const [cornerRate, setCornerRate] = useState(25);

  function handleTier(t: DrywallTier) {
    setTier(t);
    setRate(DRYWALL_TIERS[t].rate);
  }

  const total = useMemo(() => {
    const sqft = parseFloat(sf) || 0;
    const base = sqft * rate;
    const texAmt = texture ? textureAmt : 0;
    const cornerAmt = (parseInt(corners) || 0) * cornerRate;
    return base + texAmt + cornerAmt;
  }, [sf, rate, texture, textureAmt, corners, cornerRate]);

  useEffect(() => { onTotalChange(total); }, [total]);

  return (
    <div className="space-y-3">
      <NumField label="Square Feet (SF)" value={sf} onChange={setSf} suffix="SF" />

      <div>
        <p className="text-xs text-zinc-400 mb-1.5">Labor Tier</p>
        <div className="flex gap-2">
          {(Object.entries(DRYWALL_TIERS) as [DrywallTier, typeof DRYWALL_TIERS[DrywallTier]][]).map(([k, t]) => (
            <TierButton key={k} label={t.label} range={t.range} active={tier === k} onClick={() => handleTier(k)} />
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
            {texture
              ? <NumField value={textureAmt} onChange={v => setTextureAmt(parseFloat(v) || 0)} prefix="$" small />
              : <span className="text-zinc-500 text-sm">$150</span>}
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

interface OtherRow {
  id: number;
  desc: string;
  amount: string;
}

function OtherWorkSection({ onRowsChange }: { onRowsChange: (rows: OtherRow[]) => void }) {
  const [rows, setRows] = useState<OtherRow[]>([{ id: Date.now(), desc: "", amount: "" }]);
  let idCounter = Date.now();

  function addRow() {
    const updated = [...rows, { id: ++idCounter, desc: "", amount: "" }];
    setRows(updated);
    onRowsChange(updated);
  }

  function updateRow(id: number, field: "desc" | "amount", val: string) {
    const updated = rows.map(r => r.id === id ? { ...r, [field]: val } : r);
    setRows(updated);
    onRowsChange(updated);
  }

  function removeRow(id: number) {
    if (rows.length === 1) return;
    const updated = rows.filter(r => r.id !== id);
    setRows(updated);
    onRowsChange(updated);
  }

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.id} className="flex gap-2 items-center">
          <input
            type="text"
            value={row.desc}
            onChange={e => updateRow(row.id, "desc", e.target.value)}
            placeholder="Description"
            className="flex-1 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-3 py-2 text-white text-sm"
          />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-zinc-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              step="1"
              value={row.amount}
              onChange={e => updateRow(row.id, "amount", e.target.value)}
              placeholder="0"
              className="w-24 bg-zinc-800 border border-zinc-600 focus:border-amber-500 focus:outline-none rounded-xl px-2 py-2 text-white text-sm text-right"
            />
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

// ─── Main ContractingCalculator ────────────────────────────────────────────────

export function ContractingCalculator({ onClose, onUseNumbers }: ContractingCalculatorProps) {
  const [trimOn, setTrimOn]     = useState(false);
  const [sidingOn, setSidingOn] = useState(false);
  const [drywallOn, setDrywallOn] = useState(false);
  const [otherOn, setOtherOn]   = useState(false);

  const [trimTotal, setTrimTotal]     = useState(0);
  const [sidingTotal, setSidingTotal] = useState(0);
  const [drywallTotal, setDrywallTotal] = useState(0);
  const [otherRows, setOtherRows]     = useState<OtherRow[]>([{ id: Date.now(), desc: "", amount: "" }]);

  const [copied, setCopied] = useState(false);
  const [appendMode, setAppendMode] = useState(true);

  const otherTotal = otherRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const grandTotal = (trimOn ? trimTotal : 0) + (sidingOn ? sidingTotal : 0) + (drywallOn ? drywallTotal : 0) + (otherOn ? otherTotal : 0);

  const activeSections = [
    trimOn && trimTotal > 0,
    sidingOn && sidingTotal > 0,
    drywallOn && drywallTotal > 0,
    otherOn && otherRows.some(r => r.desc && parseFloat(r.amount) > 0),
  ].filter(Boolean).length;

  function handleUseNumbers() {
    const lines: DraftLine[] = [];
    if (trimOn && trimTotal > 0) {
      lines.push({ category: "Labor", description: "Trim Work", quantity: 1, unit: "LOT", unitCost: Math.round(trimTotal) });
    }
    if (sidingOn && sidingTotal > 0) {
      lines.push({ category: "Labor", description: "Siding", quantity: 1, unit: "LOT", unitCost: Math.round(sidingTotal) });
    }
    if (drywallOn && drywallTotal > 0) {
      lines.push({ category: "Labor", description: "Drywall", quantity: 1, unit: "LOT", unitCost: Math.round(drywallTotal) });
    }
    if (otherOn) {
      otherRows
        .filter(r => r.desc.trim() && parseFloat(r.amount) > 0)
        .forEach(r => {
          lines.push({ category: "Labor", description: r.desc.trim(), quantity: 1, unit: "LOT", unitCost: Math.round(parseFloat(r.amount)) });
        });
    }
    if (lines.length > 0) {
      onUseNumbers(lines, appendMode);
      onClose();
    }
  }

  function handleCopyQuote() {
    const parts: string[] = ["Contracting Estimate — Willard's General Contracting", ""];
    if (trimOn && trimTotal > 0) parts.push(`Trim Work: $${fmtInt(trimTotal)}`);
    if (sidingOn && sidingTotal > 0) parts.push(`Siding: $${fmtInt(sidingTotal)}`);
    if (drywallOn && drywallTotal > 0) parts.push(`Drywall: $${fmtInt(drywallTotal)}`);
    if (otherOn) {
      otherRows.filter(r => r.desc && parseFloat(r.amount) > 0).forEach(r => {
        parts.push(`${r.desc}: $${fmtInt(parseFloat(r.amount))}`);
      });
    }
    parts.push("─────────────────────", `TOTAL: $${fmtInt(grandTotal)}`);
    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-zinc-900 w-full max-w-2xl rounded-2xl border border-zinc-700 shadow-2xl flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]">

        {/* Header — fixed */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="font-bold text-white text-base">Contracting Calculator</h2>
            <p className="text-xs text-zinc-400">Toggle the trades that apply — one clean line per section</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Trade sections — scrollable middle */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <SectionShell
            icon="🪵"
            title="Trim Work"
            subtitle="Baseboard · Crown Moulding · Door Jams · Ceiling Services"
            enabled={trimOn}
            onToggle={() => setTrimOn(o => !o)}
            total={trimTotal}
          >
            <TrimSection onTotalChange={setTrimTotal} />
          </SectionShell>

          <SectionShell
            icon="🏠"
            title="Siding"
            subtitle="SF-based · On-lot / Standard / Premium tiers · Windows & Doors"
            enabled={sidingOn}
            onToggle={() => setSidingOn(o => !o)}
            total={sidingTotal}
          >
            <SidingSection onTotalChange={setSidingTotal} />
          </SectionShell>

          <SectionShell
            icon="🧱"
            title="Drywall"
            subtitle="Patch / Partial / Full · Texture match · Corner bead"
            enabled={drywallOn}
            onToggle={() => setDrywallOn(o => !o)}
            total={drywallTotal}
          >
            <DrywallSection onTotalChange={setDrywallTotal} />
          </SectionShell>

          <SectionShell
            icon="🔧"
            title="Other Work"
            subtitle="Freeform — any description + flat dollar amount"
            enabled={otherOn}
            onToggle={() => setOtherOn(o => !o)}
            total={otherTotal}
          >
            <OtherWorkSection onRowsChange={setOtherRows} />
          </SectionShell>
        </div>

        {/* Sticky summary footer — always visible */}
        <div className="border-t border-zinc-700 px-5 py-4 bg-zinc-900 rounded-b-2xl space-y-3 shrink-0">
          {/* Active section breakdown */}
          {activeSections > 0 && (
            <div className="space-y-1.5">
              {trimOn && trimTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">Trim Work</span>
                  <span className="font-mono text-white">${fmtInt(trimTotal)}</span>
                </div>
              )}
              {sidingOn && sidingTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">Siding</span>
                  <span className="font-mono text-white">${fmtInt(sidingTotal)}</span>
                </div>
              )}
              {drywallOn && drywallTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">Drywall</span>
                  <span className="font-mono text-white">${fmtInt(drywallTotal)}</span>
                </div>
              )}
              {otherOn && otherRows.filter(r => r.desc && parseFloat(r.amount) > 0).map(r => (
                <div key={r.id} className="flex justify-between text-sm">
                  <span className="text-zinc-300 truncate max-w-[70%]">{r.desc}</span>
                  <span className="font-mono text-white">${fmtInt(parseFloat(r.amount))}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-zinc-700">
                <span className="font-bold text-white">Grand Total</span>
                <span className="font-mono font-bold text-amber-400 text-lg">${fmtInt(grandTotal)}</span>
              </div>
            </div>
          )}

          {activeSections === 0 && (
            <p className="text-center text-zinc-500 text-sm py-1">Toggle a section above to get started</p>
          )}

          {/* Append / Replace toggle */}
          <div className="flex items-center justify-between bg-zinc-800 rounded-xl px-3 py-2 border border-zinc-700">
            <span className="text-xs text-zinc-400">Add to estimate</span>
            <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setAppendMode(true)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${appendMode ? "bg-amber-500 text-black" : "text-zinc-400 hover:text-white"}`}
              >
                Append
              </button>
              <button
                type="button"
                onClick={() => setAppendMode(false)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${!appendMode ? "bg-amber-500 text-black" : "text-zinc-400 hover:text-white"}`}
              >
                Replace
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button type="button" onClick={handleCopyQuote} disabled={activeSections === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-600 bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-40">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Quote"}
            </button>
            <button type="button" onClick={handleUseNumbers} disabled={activeSections === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {appendMode ? "Append to Estimate →" : "Replace Lines →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
