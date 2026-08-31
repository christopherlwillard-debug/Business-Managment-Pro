import { useEffect, useState } from "react";
import { ExtendedJob, ReadinessBlocker } from "./types";
import { X, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateJob } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function JobPlanningDialog({ job, onClose }: { job: ExtendedJob, onClose: () => void }) {
  const [planningState, setPlanningState] = useState(job.planningState || "ready");
  const [priority, setPriority] = useState(job.priority || "normal");
  const [resourceDemand, setResourceDemand] = useState(job.resourceDemand || "standard");
  const [queuePosition, setQueuePosition] = useState(job.queuePosition ?? 1);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const updateJob = useUpdateJob();
  const { toast } = useToast();
  const [blockers, setBlockers] = useState<ReadinessBlocker[]>([]);
  const [loadingBlockers, setLoadingBlockers] = useState(true);

  const [blockerReason, setBlockerReason] = useState<ReadinessBlocker["reason"]>("materials");
  const [blockerDetail, setBlockerDetail] = useState("");
  const [blockerExpectedDate, setBlockerExpectedDate] = useState("");
  const [addingBlocker, setAddingBlocker] = useState(false);
  const scope = job.businessId != null
    ? `?businessId=${job.businessId}`
    : job.businessLine
      ? `?businessLine=${encodeURIComponent(job.businessLine)}`
      : "";

  useEffect(() => {
    let cancelled = false;
    setLoadingBlockers(true);
    fetch(`${BASE}/api/jobs/${job.id}/readiness${scope}`, { credentials: "include" })
      .then(async res => {
        if (!res.ok) throw new Error("Could not load readiness history");
        return res.json() as Promise<ReadinessBlocker[]>;
      })
      .then(rows => { if (!cancelled) setBlockers(rows); })
      .catch(error => {
        if (!cancelled) toast({ title: "Could not load readiness history", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoadingBlockers(false); });
    return () => { cancelled = true; };
  }, [job.id, scope, toast]);

  async function handleSavePlanning() {
    setSaving(true);
    try {
      await updateJob.mutateAsync({
        id: job.id,
        data: {
          title: job.title,
          planningState,
          priority,
          resourceDemand,
          queuePosition
        }
      });
      await queryClient.invalidateQueries();
      onClose();
    } catch (error) {
      toast({ title: "Planning changes were not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBlocker() {
    if (!blockerDetail.trim()) return;
    setAddingBlocker(true);
    try {
      const res = await fetch(`${BASE}/api/jobs/${job.id}/readiness${scope}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: blockerReason, detail: blockerDetail, expectedDate: blockerExpectedDate || null })
      });
      if (!res.ok) throw new Error("The blocker could not be saved");
      const newBlocker = await res.json() as ReadinessBlocker;
      setBlockers(current => [newBlocker, ...current]);
      await queryClient.invalidateQueries();
      setBlockerDetail("");
      setBlockerExpectedDate("");
    } catch (error) {
      toast({ title: "Blocker was not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setAddingBlocker(false);
    }
  }

  async function handleClearBlocker(blockerId: number) {
    try {
      const res = await fetch(`${BASE}/api/jobs/${job.id}/readiness/${blockerId}/clear${scope}`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) throw new Error("The blocker could not be cleared");
      const cleared = await res.json() as ReadinessBlocker;
      setBlockers(current => current.map(blocker => blocker.id === blockerId ? cleared : blocker));
      await queryClient.invalidateQueries();
    } catch (error) {
      toast({ title: "Blocker was not cleared", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground">Planning: {job.title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Planning Setup</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">State</label>
                <select value={planningState} onChange={e => setPlanningState(e.target.value as any)} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
                  <option value="queue">Queue / Limbo</option>
                  <option value="waiting">Waiting</option>
                  <option value="ready">Ready to Schedule</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as any)} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Resource Demand</label>
                <select value={resourceDemand} onChange={e => setResourceDemand(e.target.value as any)} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm">
                  <option value="standard">Standard</option>
                  <option value="large_crew">Large Crew</option>
                  <option value="all_hands">All Hands</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Queue Position</label>
                <input type="number" min="1" value={queuePosition} onChange={e => setQueuePosition(parseInt(e.target.value, 10))} className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
              </div>
            </div>

            <button onClick={handleSavePlanning} disabled={saving} className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:bg-primary/90 transition-colors">
              {saving ? "Saving..." : "Save Planning State"}
            </button>
          </div>

          <div className="border-t border-border pt-6 space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Internal Readiness Blockers</h3>
            <p className="text-xs text-muted-foreground">Visually and conceptually separate from customer-facing checklist delay messaging.</p>
            
            <div className="bg-muted/30 p-3 rounded-xl border border-border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Reason</label>
                  <select value={blockerReason} onChange={e => setBlockerReason(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm">
                    <option value="electricity">Electricity</option>
                    <option value="water">Water</option>
                    <option value="materials">Materials</option>
                    <option value="inspection">Inspection</option>
                    <option value="crew">Crew</option>
                    <option value="access">Access</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Expected Date</label>
                  <input type="date" value={blockerExpectedDate} onChange={e => setBlockerExpectedDate(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Detail</label>
                <input type="text" placeholder="Explain the blocker..." value={blockerDetail} onChange={e => setBlockerDetail(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm" />
              </div>
              <button onClick={handleAddBlocker} disabled={addingBlocker || !blockerDetail.trim()} className="w-full bg-amber-100 text-amber-800 font-bold text-xs py-2 rounded-lg hover:bg-amber-200">
                Add Blocker
              </button>
            </div>

            {loadingBlockers && <p className="text-xs text-muted-foreground">Loading readiness history...</p>}
            {blockers.length > 0 && (
              <div className="space-y-2 mt-4">
                {blockers.map(b => (
                  <div key={b.id} className={`p-3 rounded-xl border ${b.clearedAt ? 'bg-muted/10 border-border opacity-60' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex gap-2">
                        {b.clearedAt ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />}
                        <div>
                          <p className={`text-sm font-bold capitalize ${b.clearedAt ? 'text-muted-foreground' : 'text-red-900'}`}>{b.reason}</p>
                          <p className={`text-xs ${b.clearedAt ? 'text-muted-foreground' : 'text-red-700'}`}>{b.detail}</p>
                          {b.expectedDate && <p className="text-[10px] text-muted-foreground mt-1">Expected: {b.expectedDate}</p>}
                        </div>
                      </div>
                      {!b.clearedAt && (
                        <button onClick={() => handleClearBlocker(b.id)} className="text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
