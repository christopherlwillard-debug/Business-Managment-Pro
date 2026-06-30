import { useState, useEffect } from "react";
import { Brain, X, CheckCircle2, MinusCircle, Clock, TrendingUp, AlertCircle } from "lucide-react";
import {
  useJobLaborEntries,
  useJobKnowledgeRecord,
  useSaveKnowledgeRecord,
  useAcceptKnowledgeRecord,
  useExcludeKnowledgeRecord,
  type KnowledgeRecord,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { LaborSummaryPanel } from "./LaborSummaryPanel";

interface Job {
  id: number;
  title: string;
  mfhModelId?: number | null;
  mfhManufacturerId?: number | null;
  [key: string]: unknown;
}

interface Props {
  job: Job;
  onComplete: (action: "accept" | "exclude") => void;
  onClose: () => void;
}

function fmtNum(v: number | string | null | undefined) {
  if (v == null || v === "") return "";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "" : String(n);
}

function fmtCurrency(v: number | string | null | undefined) {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function NumInput({ label, value, onChange, prefix, suffix, hint, badge }: {
  label: string; value: string; onChange: (v: string) => void;
  prefix?: string; suffix?: string; hint?: string; badge?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
        {badge}
      </div>
      {hint && <p className="text-[9px] text-muted-foreground/70 mb-0.5">{hint}</p>}
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}
        <input
          type="number" min="0" step="any"
          className={`w-full py-1.5 text-xs rounded-lg border border-border bg-background ${prefix ? "pl-6" : "pl-2.5"} ${suffix ? "pr-10" : "pr-2.5"}`}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export function KbTrainingModal({ job, onComplete, onClose }: Props) {
  const { toast } = useToast();
  const { data: kbRaw, isLoading: kbLoading } = useJobKnowledgeRecord(job.id);
  const { data: laborData } = useJobLaborEntries(job.id);
  const saveKb = useSaveKnowledgeRecord();
  const acceptKb = useAcceptKnowledgeRecord();
  const excludeKb = useExcludeKnowledgeRecord();

  const [tab, setTab] = useState<"labor" | "financial" | "quality">("labor");
  const [fields, setFields] = useState({
    productiveHours: "",
    travelHours: "",
    crewSize: "",
    daysOnSite: "",
    invoiceAmount: "",
    materialCost: "",
    consumablesCost: "",
    grossProfit: "",
    netProfit: "",
    callbacks: "0",
    warrantyVisit: false,
    missingMaterialsNotes: "",
    factoryDefectNotes: "",
    editReason: "",
  });
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!kbRaw) return;
    const laborSummary = laborData?.summary;
    setFields({
      productiveHours: fmtNum(kbRaw.productiveHours ?? laborSummary?.totalProductiveHours),
      travelHours: fmtNum(kbRaw.travelHours ?? laborSummary?.totalTravelHours),
      crewSize: fmtNum(kbRaw.crewSize ?? laborSummary?.crewCount),
      daysOnSite: fmtNum(kbRaw.daysOnSite),
      invoiceAmount: fmtNum(kbRaw.invoiceAmount),
      materialCost: fmtNum(kbRaw.materialCost),
      consumablesCost: fmtNum(kbRaw.consumablesCost),
      grossProfit: fmtNum(kbRaw.grossProfit),
      netProfit: fmtNum(kbRaw.netProfit),
      callbacks: String(kbRaw.callbacks ?? 0),
      warrantyVisit: kbRaw.warrantyVisit ?? false,
      missingMaterialsNotes: kbRaw.missingMaterialsNotes ?? "",
      factoryDefectNotes: kbRaw.factoryDefectNotes ?? "",
      editReason: "",
    });
  }, [kbRaw, laborData]);

  function set<K extends keyof typeof fields>(k: K, v: typeof fields[K]) {
    setFields(f => ({ ...f, [k]: v }));
  }

  async function saveRecord() {
    const payload: Partial<KnowledgeRecord> & { jobId: number } = {
      jobId: job.id,
      productiveHours: parseFloat(fields.productiveHours) || 0,
      travelHours: parseFloat(fields.travelHours) || 0,
      crewSize: parseInt(fields.crewSize) || null,
      daysOnSite: parseInt(fields.daysOnSite) || null,
      invoiceAmount: fields.invoiceAmount ? parseFloat(fields.invoiceAmount) : null,
      materialCost: fields.materialCost ? parseFloat(fields.materialCost) : null,
      consumablesCost: fields.consumablesCost ? parseFloat(fields.consumablesCost) : null,
      grossProfit: fields.grossProfit ? parseFloat(fields.grossProfit) : null,
      netProfit: fields.netProfit ? parseFloat(fields.netProfit) : null,
      callbacks: parseInt(fields.callbacks) || 0,
      warrantyVisit: fields.warrantyVisit,
      missingMaterialsNotes: fields.missingMaterialsNotes || null,
      factoryDefectNotes: fields.factoryDefectNotes || null,
      editReason: fields.editReason || null,
      status: "reviewed",
    };
    await saveKb.mutateAsync(payload);
  }

  async function handleAccept() {
    setActing(true);
    try {
      await saveRecord();
      await acceptKb.mutateAsync(job.id);
      onComplete("accept");
    } catch {
      toast({ title: "Failed to save", description: "Could not save knowledge record.", variant: "destructive" });
    } finally { setActing(false); }
  }

  async function handleExclude() {
    setActing(true);
    try {
      await saveRecord();
      await excludeKb.mutateAsync(job.id);
      onComplete("exclude");
    } catch {
      toast({ title: "Failed to save", description: "Could not save knowledge record.", variant: "destructive" });
    } finally { setActing(false); }
  }

  const laborSummary = laborData?.summary;
  const modelInfo = kbRaw?.modelNameSnapshot ?? kbRaw?.builderNameSnapshot;

  // Per-field badge: "📊 Auto" if value matches original auto-computed snapshot, "✏️ Edited" if changed
  function fieldBadge(fieldKey: string, currentVal: string) {
    if (!currentVal) return null;
    const origVals = kbRaw?.originalValues;
    if (kbRaw?.isDraft || !origVals) {
      return <span className="text-[9px] text-blue-500 font-semibold">📊 Auto</span>;
    }
    const origRaw = origVals[fieldKey];
    if (origRaw == null) return null;
    const curr = parseFloat(currentVal);
    const orig = parseFloat(String(origRaw));
    if (isNaN(curr) || isNaN(orig)) return null;
    if (Math.abs(curr - orig) < 0.01) return <span className="text-[9px] text-blue-500 font-semibold">📊 Auto</span>;
    return <span className="text-[9px] text-amber-600 font-semibold">✏️ Edited</span>;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-foreground text-base leading-tight">Teach the Knowledge Base</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review this job's data before closing. Accept to feed it into the KB averages.
            </p>
            {modelInfo && (
              <p className="text-[11px] font-medium text-amber-700 mt-1">
                {kbRaw?.builderNameSnapshot} · {kbRaw?.modelNameSnapshot}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border flex-shrink-0">
          {(["labor", "financial", "quality"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors capitalize ${tab === t ? "text-amber-600 border-b-2 border-amber-500" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "labor" ? "🧑 Labor" : t === "financial" ? "💰 Financials" : "📋 Quality"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {kbLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Labor Tab */}
              {tab === "labor" && (
                <div className="space-y-4">
                  {/* Labor entries */}
                  <div className="border border-border rounded-xl p-3">
                    <LaborSummaryPanel jobId={job.id} compact />
                  </div>

                  {/* Labor fields for KB */}
                  <div className="border border-border rounded-xl p-3 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <p className="text-xs font-semibold text-foreground">Hours Summary for KB</p>
                      {kbRaw?.isDraft && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">Auto-calculated</span>}
                    </div>
                    {(!laborSummary || laborSummary.crewCount === 0) && (
                      <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <p>No crew hours logged yet — add entries above so the KB knows who worked on this job.</p>
                      </div>
                    )}
                    {laborSummary && laborSummary.crewCount > 0 && (
                      <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg px-2.5 py-1.5">
                        From crew log: {laborSummary.crewCount} people · {laborSummary.totalProductiveHours.toFixed(1)} productive hrs · {laborSummary.totalTravelHours.toFixed(1)} travel hrs
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <NumInput label="Productive Hours" value={fields.productiveHours} onChange={v => set("productiveHours", v)} suffix="hrs" hint="Time on-site working" badge={fieldBadge("productiveHours", fields.productiveHours)} />
                      <NumInput label="Travel Hours" value={fields.travelHours} onChange={v => set("travelHours", v)} suffix="hrs" hint="Drive time" badge={fieldBadge("travelHours", fields.travelHours)} />
                      <NumInput label="Crew Size" value={fields.crewSize} onChange={v => set("crewSize", v)} suffix="people" badge={fieldBadge("crewSize", fields.crewSize)} />
                      <NumInput label="Days On-Site" value={fields.daysOnSite} onChange={v => set("daysOnSite", v)} suffix="days" badge={fieldBadge("daysOnSite", fields.daysOnSite)} />
                    </div>
                    {(parseFloat(fields.productiveHours) !== parseFloat(fmtNum(kbRaw?.productiveHours))) && (
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground">Reason for edit (optional)</label>
                        <input className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background mt-0.5"
                          placeholder="e.g. Extra time for unexpected re-work"
                          value={fields.editReason} onChange={e => set("editReason", e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Financial Tab */}
              {tab === "financial" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    <p className="text-xs font-semibold text-foreground">Financial Summary</p>
                    {kbRaw?.isDraft && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">Auto-calculated</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Invoice Amount" value={fields.invoiceAmount} onChange={v => set("invoiceAmount", v)} prefix="$" badge={fieldBadge("invoiceAmount", fields.invoiceAmount)} />
                    <NumInput label="Material Cost" value={fields.materialCost} onChange={v => set("materialCost", v)} prefix="$" badge={fieldBadge("materialCost", fields.materialCost)} />
                    <NumInput label="Consumables" value={fields.consumablesCost} onChange={v => set("consumablesCost", v)} prefix="$" badge={fieldBadge("consumablesCost", fields.consumablesCost)} />
                    <div />
                    <NumInput label="Gross Profit" value={fields.grossProfit} onChange={v => set("grossProfit", v)} prefix="$" hint="Revenue − materials" badge={fieldBadge("grossProfit", fields.grossProfit)} />
                    <NumInput label="Net Profit" value={fields.netProfit} onChange={v => set("netProfit", v)} prefix="$" hint="Revenue − all expenses" badge={fieldBadge("netProfit", fields.netProfit)} />
                  </div>

                  {fields.invoiceAmount && fields.materialCost && (
                    <div className="bg-muted/20 rounded-xl px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Margin: </span>
                      <span className="font-semibold text-foreground">
                        {fmtCurrency(parseFloat(fields.invoiceAmount) - parseFloat(fields.materialCost))}
                      </span>
                      {" "}
                      <span className="text-muted-foreground">
                        ({((parseFloat(fields.invoiceAmount) - parseFloat(fields.materialCost)) / parseFloat(fields.invoiceAmount) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Quality Tab */}
              {tab === "quality" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Callbacks</label>
                      <input type="number" min="0"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background mt-0.5"
                        value={fields.callbacks} onChange={e => set("callbacks", e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <input type="checkbox" id="kb-warranty" className="rounded"
                        checked={fields.warrantyVisit} onChange={e => set("warrantyVisit", e.target.checked)} />
                      <label htmlFor="kb-warranty" className="text-xs font-medium text-foreground">Warranty visit needed</label>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Missing Materials Notes</label>
                    <textarea rows={3}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background resize-none"
                      placeholder="Any materials that were missing, wrong, or had to be sourced…"
                      value={fields.missingMaterialsNotes} onChange={e => set("missingMaterialsNotes", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Factory Defect Notes</label>
                    <textarea rows={3}
                      className="w-full mt-0.5 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-background resize-none"
                      placeholder="Any factory defects or quality issues noticed…"
                      value={fields.factoryDefectNotes} onChange={e => set("factoryDefectNotes", e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border bg-muted/10 flex-shrink-0">
          <div className="flex gap-2">
            <button onClick={handleAccept} disabled={acting || kbLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors">
              <CheckCircle2 className="w-4 h-4" />
              {acting ? "Saving…" : "Accept & Teach KB"}
            </button>
            <button onClick={handleExclude} disabled={acting || kbLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors">
              <MinusCircle className="w-3.5 h-3.5" />
              Save Without Teaching
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            <span className="font-semibold">Accept & Teach</span> — feeds this job into KB averages · <span className="font-semibold">Save Without Teaching</span> — records data, won't change averages
          </p>
        </div>
      </div>
    </div>
  );
}
