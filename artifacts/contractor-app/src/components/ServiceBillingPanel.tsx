import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  X, Plus, Trash2, Wrench, Truck, MapPin, Package, DollarSign,
  ChevronDown, ChevronRight, Users, TrendingUp, Save, Info,
} from "lucide-react";
import {
  useListClientBillingProfiles,
  useUpdateJob,
  type ServiceBilling,
  type ServiceBillingPart,
  type ClientBillingProfile,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

interface JobLike {
  id: number;
  title: string;
  clientId?: number | null;
  clientName?: string | null;
  serviceBilling?: ServiceBilling | null;
}

interface Props {
  job: JobLike;
  onClose: () => void;
}

function money(n: number, signed = false): string {
  if (isNaN(n)) n = 0;
  const s = n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return signed && n > 0 ? `+${s}` : s;
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

type RateSnapshot = NonNullable<ServiceBilling["rateSnapshot"]>;

const EMPTY_SNAPSHOT: RateSnapshot = {
  repairRate1Tech: null, repairRate2Tech: null,
  driveRate1Tech: null, driveRate2Tech: null, mileageRate: null,
};

export function ServiceBillingPanel({ job, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateJob = useUpdateJob();

  const { data: profiles = [] } = useListClientBillingProfiles(
    job.clientId != null ? { clientId: job.clientId } : undefined,
    { query: { enabled: job.clientId != null } },
  );

  const existing = job.serviceBilling;

  const [profileId, setProfileId] = useState<number | null>(existing?.profileId ?? null);
  const [profileName, setProfileName] = useState<string | null>(existing?.profileName ?? null);
  const [techCount, setTechCount] = useState<number>(existing?.techCount ?? 2);
  const [repairHours, setRepairHours] = useState<string>(existing?.repairHours != null ? String(existing.repairHours) : "");
  const [driveHours, setDriveHours] = useState<string>(existing?.driveHours != null ? String(existing.driveHours) : "");
  const [mileage, setMileage] = useState<string>(existing?.mileage != null ? String(existing.mileage) : "");
  const [parts, setParts] = useState<ServiceBillingPart[]>(existing?.parts ?? []);
  const [snapshot, setSnapshot] = useState<RateSnapshot>(existing?.rateSnapshot ?? EMPTY_SNAPSHOT);
  const [internalLaborRate, setInternalLaborRate] = useState<string>(existing?.internalLaborRate != null ? String(existing.internalLaborRate) : "");
  const [fuelEstimate, setFuelEstimate] = useState<string>(existing?.fuelEstimate != null ? String(existing.fuelEstimate) : "");
  const [showInternal, setShowInternal] = useState(false);
  // Default reimbursable flag for newly added parts, seeded from the client's profile rule.
  const [partsDefaultReimbursable, setPartsDefaultReimbursable] = useState(true);

  // Auto-load the client's default/active billing profile into a fresh worksheet.
  const autoApplied = useRef(false);
  useEffect(() => {
    if (autoApplied.current) return;
    if (existing) {
      // Existing worksheet already has its own values/snapshot — don't override.
      autoApplied.current = true;
      return;
    }
    if (profiles.length === 0) return;
    const defaultProfile = profiles.find(p => p.active) ?? profiles[0];
    if (defaultProfile) {
      applyProfile(defaultProfile);
    }
    autoApplied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, existing]);

  function applyProfile(p: ClientBillingProfile) {
    setProfileId(p.id);
    setProfileName(p.name);
    setTechCount(p.defaultTechCount);
    setPartsDefaultReimbursable(p.partsReimbursable);
    setSnapshot({
      repairRate1Tech: p.repairRate1Tech ?? null,
      repairRate2Tech: p.repairRate2Tech ?? null,
      driveRate1Tech: p.driveRate1Tech ?? null,
      driveRate2Tech: p.driveRate2Tech ?? null,
      mileageRate: p.mileageRate ?? null,
    });
  }

  function onSelectProfile(id: string) {
    if (id === "") {
      setProfileId(null);
      setProfileName(null);
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    const p = profiles.find(x => x.id === parseInt(id));
    if (p) applyProfile(p);
  }

  // ── Live client-billing calculations ──
  const repairRate = techCount === 1 ? toNum(snapshot.repairRate1Tech) : toNum(snapshot.repairRate2Tech);
  const driveRate = techCount === 1 ? toNum(snapshot.driveRate1Tech) : toNum(snapshot.driveRate2Tech);
  const mileageRate = toNum(snapshot.mileageRate);

  const repairLabor = toNum(repairHours) * repairRate;
  const driveTime = toNum(driveHours) * driveRate;
  const mileageCharge = toNum(mileage) * mileageRate;
  const partsBillable = useMemo(
    () => parts.filter(p => p.reimbursable).reduce((s, p) => s + toNum(p.quantity) * toNum(p.unitCost), 0),
    [parts],
  );
  const grandTotal = repairLabor + driveTime + mileageCharge + partsBillable;

  // ── Internal cost analysis (never on invoice) ──
  const crewProductiveHours = toNum(repairHours) * techCount;
  const crewTravelHours = toNum(driveHours) * techCount;
  const laborRate = toNum(internalLaborRate);
  const estLaborCost = (crewProductiveHours + crewTravelHours) * laborRate;
  const partsCost = useMemo(
    () => parts.reduce((s, p) => s + toNum(p.quantity) * toNum(p.unitCost), 0),
    [parts],
  );
  const fuel = toNum(fuelEstimate);
  const estCompanyCost = estLaborCost + partsCost + fuel;
  const estGrossProfit = grandTotal - estCompanyCost;
  const marginPct = grandTotal > 0 ? (estGrossProfit / grandTotal) * 100 : 0;

  function addPart() {
    setParts(prev => [...prev, { description: "", quantity: 1, unitCost: 0, reimbursable: partsDefaultReimbursable }]);
  }
  function updatePart(i: number, patch: Partial<ServiceBillingPart>) {
    setParts(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }
  function removePart(i: number) {
    setParts(prev => prev.filter((_, idx) => idx !== i));
  }

  const payload: ServiceBilling = useMemo(() => ({
    profileId,
    profileName,
    techCount,
    repairHours: toNum(repairHours),
    driveHours: toNum(driveHours),
    mileage: toNum(mileage),
    parts: parts.map(p => ({
      description: p.description,
      quantity: toNum(p.quantity),
      unitCost: toNum(p.unitCost),
      reimbursable: p.reimbursable,
    })),
    rateSnapshot: snapshot,
    internalLaborRate: internalLaborRate === "" ? null : toNum(internalLaborRate),
    fuelEstimate: fuelEstimate === "" ? null : toNum(fuelEstimate),
  }), [profileId, profileName, techCount, repairHours, driveHours, mileage, parts, snapshot, internalLaborRate, fuelEstimate]);

  // ── Debounced autosave: persist worksheet state to the job on change ──
  const lastSaved = useRef<string>(JSON.stringify(existing ?? null));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    const serialized = JSON.stringify(payload);
    if (serialized === lastSaved.current) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await updateJob.mutateAsync({ id: job.id, data: { serviceBilling: payload } });
        lastSaved.current = serialized;
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [payload, job.id, updateJob]);

  async function handleSave() {
    try {
      await updateJob.mutateAsync({ id: job.id, data: { serviceBilling: payload } });
      lastSaved.current = JSON.stringify(payload);
      qc.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Billing worksheet saved" });
      onClose();
    } catch {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    }
  }

  const labelCls = "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider";
  const inputCls = "w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-card w-full max-w-md h-full flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-foreground truncate">Service Billing</h2>
              <p className="text-[11px] text-muted-foreground truncate">{job.clientName || job.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Profile selector */}
          <div className="space-y-1.5">
            <label className={labelCls}>Billing Profile</label>
            {job.clientId == null ? (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Assign a client to this job to load billing profiles.
              </p>
            ) : profiles.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                No billing profiles for this client yet. Add one from the client profile → Billing tab.
              </p>
            ) : (
              <select className={inputCls} value={profileId ?? ""} onChange={e => onSelectProfile(e.target.value)}>
                <option value="">— Manual rates —</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{!p.active ? " (inactive)" : ""}</option>
                ))}
              </select>
            )}
          </div>

          {/* Tech count selector */}
          <div className="space-y-1.5">
            <label className={labelCls}>Technicians on Job</label>
            <div className="flex gap-2">
              {[1, 2].map(tc => (
                <button
                  key={tc}
                  onClick={() => setTechCount(tc)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    techCount === tc
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-background text-muted-foreground border-border hover:bg-muted/40"
                  }`}
                >
                  {tc} Tech{tc > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Rates (editable, seeded from profile) */}
          <div className="space-y-2 rounded-xl border border-border p-3">
            <p className={labelCls}>Rates {profileName ? `· ${profileName}` : "(manual)"}</p>
            <div className="grid grid-cols-2 gap-2">
              <RateInput label="Repair / 1 Tech" value={snapshot.repairRate1Tech} onChange={v => setSnapshot(s => ({ ...s, repairRate1Tech: v }))} />
              <RateInput label="Repair / 2 Tech" value={snapshot.repairRate2Tech} onChange={v => setSnapshot(s => ({ ...s, repairRate2Tech: v }))} />
              <RateInput label="Drive / 1 Tech" value={snapshot.driveRate1Tech} onChange={v => setSnapshot(s => ({ ...s, driveRate1Tech: v }))} />
              <RateInput label="Drive / 2 Tech" value={snapshot.driveRate2Tech} onChange={v => setSnapshot(s => ({ ...s, driveRate2Tech: v }))} />
              <RateInput label="Mileage / mi" value={snapshot.mileageRate} onChange={v => setSnapshot(s => ({ ...s, mileageRate: v }))} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Active rate: Repair {money(repairRate)}/hr · Drive {money(driveRate)}/hr ({techCount} tech)
            </p>
          </div>

          {/* Worksheet inputs */}
          <div className="space-y-3">
            <LineInput icon={<Wrench className="w-4 h-4 text-blue-500" />} label="Repair Labor Hours" value={repairHours} onChange={setRepairHours} suffix="hrs" />
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted-foreground">Repair Labor</span>
              <span className="font-mono font-semibold text-foreground">{money(repairLabor)}</span>
            </div>

            <LineInput icon={<Truck className="w-4 h-4 text-blue-500" />} label="Drive Time Hours" value={driveHours} onChange={setDriveHours} suffix="hrs" />
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted-foreground">Drive Time</span>
              <span className="font-mono font-semibold text-foreground">{money(driveTime)}</span>
            </div>

            <LineInput icon={<MapPin className="w-4 h-4 text-blue-500" />} label="Mileage" value={mileage} onChange={setMileage} suffix="mi" />
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted-foreground">Mileage</span>
              <span className="font-mono font-semibold text-foreground">{money(mileageCharge)}</span>
            </div>
          </div>

          {/* Parts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}><Package className="w-3 h-3 inline mr-1" />Parts & Materials</label>
              <button onClick={addPart} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {parts.length === 0 && <p className="text-xs text-muted-foreground italic">No parts added.</p>}
            {parts.map((p, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background"
                    placeholder="Description"
                    value={p.description}
                    onChange={e => updatePart(i, { description: e.target.value })}
                  />
                  <button onClick={() => removePart(i)} className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground">Qty</label>
                    <input type="number" step="any" className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                      value={p.quantity} onChange={e => updatePart(i, { quantity: toNum(e.target.value) })} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground">Unit Cost</label>
                    <input type="number" step="any" className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                      value={p.unitCost} onChange={e => updatePart(i, { unitCost: toNum(e.target.value) })} />
                  </div>
                  <div className="flex flex-col items-center">
                    <label className="text-[9px] text-muted-foreground">Bill</label>
                    <input type="checkbox" className="w-4 h-4 accent-blue-500 mt-1"
                      checked={p.reimbursable} onChange={e => updatePart(i, { reimbursable: e.target.checked })} />
                  </div>
                  <div className="text-right min-w-[60px]">
                    <label className="text-[9px] text-muted-foreground block">Total</label>
                    <span className="text-xs font-mono font-semibold">{money(toNum(p.quantity) * toNum(p.unitCost))}</span>
                  </div>
                </div>
              </div>
            ))}
            {parts.length > 0 && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-muted-foreground">Billable Parts</span>
                <span className="font-mono font-semibold text-foreground">{money(partsBillable)}</span>
              </div>
            )}
          </div>

          {/* Grand total (client invoice) */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-blue-900 flex items-center gap-1.5"><DollarSign className="w-4 h-4" />Client Total</span>
            <span className="text-xl font-mono font-extrabold text-blue-700">{money(grandTotal)}</span>
          </div>

          {/* Internal cost analysis */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setShowInternal(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Internal Cost & Profit
              </span>
              {showInternal ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showInternal && (
              <div className="p-4 space-y-3">
                <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  Internal only — never shown on the client invoice.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <RateInput label="Internal Labor $/hr" value={internalLaborRate === "" ? null : internalLaborRate} onChange={v => setInternalLaborRate(v == null ? "" : String(v))} />
                  <RateInput label="Fuel Estimate $" value={fuelEstimate === "" ? null : fuelEstimate} onChange={v => setFuelEstimate(v == null ? "" : String(v))} />
                </div>
                <div className="space-y-1.5 text-xs">
                  <Row icon={<Users className="w-3 h-3" />} label={`Crew productive hrs (×${techCount})`} value={`${crewProductiveHours.toFixed(1)} hrs`} />
                  <Row icon={<Users className="w-3 h-3" />} label={`Crew travel hrs (×${techCount})`} value={`${crewTravelHours.toFixed(1)} hrs`} />
                  <Row label="Est. labor cost" value={money(estLaborCost)} />
                  <Row label="Parts cost (all)" value={money(partsCost)} />
                  <Row label="Fuel" value={money(fuel)} />
                  <div className="border-t border-border my-1" />
                  <Row label="Est. company cost" value={money(estCompanyCost)} bold />
                  <Row label="Est. gross profit" value={money(estGrossProfit, true)} bold accent={estGrossProfit >= 0 ? "text-emerald-600" : "text-red-600"} />
                  <Row label="Margin" value={`${marginPct.toFixed(0)}%`} accent={estGrossProfit >= 0 ? "text-emerald-600" : "text-red-600"} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex-shrink-0 space-y-2">
          <p className="text-[10px] text-center text-muted-foreground h-3">
            {saveState === "saving" ? "Saving changes…" : saveState === "saved" ? "All changes saved automatically" : "\u00A0"}
          </p>
          <button
            onClick={handleSave}
            disabled={updateJob.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" /> {updateJob.isPending ? "Saving…" : "Save & Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateInput({ label, value, onChange }: { label: string; value: number | string | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground font-medium block">{label}</label>
      <input
        type="number"
        step="any"
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
        placeholder="0.00"
      />
    </div>
  );
}

function LineInput({ icon, label, value, onChange, suffix }: { icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">{icon}{label}</label>
      <div className="relative mt-1">
        <input
          type="number"
          step="any"
          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-blue-400 pr-10"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function Row({ icon, label, value, bold, accent }: { icon?: React.ReactNode; label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-muted-foreground flex items-center gap-1 ${bold ? "font-semibold" : ""}`}>{icon}{label}</span>
      <span className={`font-mono ${bold ? "font-bold" : "font-medium"} ${accent ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
