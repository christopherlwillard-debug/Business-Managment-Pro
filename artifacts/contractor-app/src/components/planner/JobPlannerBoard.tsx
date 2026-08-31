import { useState, useMemo } from "react";
import { ExtendedJob } from "./types";
import { localDateString,  } from "@/lib/utils";
import { Calendar, Clock, AlertCircle, Inbox, Archive } from "lucide-react";
import { type ScheduleJob } from "../../pages/Jobs"; // need to get checklist items

export function JobPlannerBoard({
  jobs,
  scheduleJobsById,
  checklistSummaries,
  onOpenJob,
  onOpenPlanning,
  onOpenChecklist,
}: {
  jobs: ExtendedJob[];
  scheduleJobsById: Map<number, ScheduleJob>;
  checklistSummaries: Record<number, any>;
  onOpenJob: (job: ExtendedJob) => void;
  onOpenPlanning: (job: ExtendedJob) => void;
  onOpenChecklist: (job: ExtendedJob) => void;
}) {
  const [mode, setMode] = useState<"Pipeline" | "Today" | "This Week" | "Month" | "Agenda">("Pipeline");

  const todayStr = localDateString();

  const filteredJobs = useMemo(() => {
    if (mode === "Pipeline") return jobs;

    const todayDate = new Date(todayStr);
    
    return jobs.filter(j => {
      const sJob = scheduleJobsById.get(j.id);
      let matches = false;
      
      const checkDate = (dStr: string) => {
        if (mode === "Today") return dStr === todayStr;
        if (mode === "This Week") {
          const d = new Date(dStr);
          const diff = (d.getTime() - todayDate.getTime()) / (1000 * 3600 * 24);
          return diff >= 0 && diff <= 7;
        }
        if (mode === "Month") {
          const d = new Date(dStr);
          return d.getMonth() === todayDate.getMonth() && d.getFullYear() === todayDate.getFullYear();
        }
        if (mode === "Agenda") {
          const d = new Date(dStr);
          return d >= todayDate;
        }
        return false;
      };

      if (j.startDate && checkDate(j.startDate)) matches = true;
      if (j.endDate && checkDate(j.endDate)) matches = true;
      if (sJob) {
        if (sJob.checklistItems.some((i: any) => i.scheduledDate && checkDate(i.scheduledDate))) matches = true;
      }
      return matches;
    });
  }, [jobs, scheduleJobsById, mode, todayStr]);

  const readyJobs = filteredJobs.filter(j => j.planningState === "ready" || (!j.planningState && !j.startDate));
  const scheduledJobs = filteredJobs.filter(j => j.planningState === "scheduled" || (!j.planningState && j.startDate && j.status !== "completed"));
  const waitingJobs = filteredJobs.filter(j => j.planningState === "waiting");
  const queueJobs = filteredJobs.filter(j => j.planningState === "queue");
  const completedJobs = filteredJobs.filter(j => j.status === "completed");

  const Column = ({ title, icon: Icon, color, items }: { title: string, icon: any, color: string, items: ExtendedJob[] }) => (
    <div className="flex flex-col min-w-[280px] sm:min-w-[320px] max-w-[350px] flex-1 bg-muted/30 rounded-2xl border border-border overflow-hidden h-full max-h-[800px]">
      <div className={`px-4 py-3 border-b border-border flex items-center justify-between ${color}`}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <h3 className="font-bold text-sm">{title}</h3>
        </div>
        <span className="text-xs font-bold bg-background/50 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.map(job => {
          const sJob = scheduleJobsById.get(job.id);
          const cSum = checklistSummaries[job.id];
          const activeChecklistItems = sJob?.checklistItems.filter((i: any) => !i.completed && !i.skipped) || [];
          const scopeCompleted = cSum?.completedItems || 0;
          const scopeTotal = cSum?.totalItems || 0;
          
          return (
          <div key={job.id} className="bg-background border border-border rounded-xl p-3 shadow-sm hover:border-primary/40 transition-colors group">
            <div className="flex justify-between items-start mb-2 cursor-pointer" onClick={() => onOpenPlanning(job)}>
              <h4 className="font-bold text-sm truncate pr-2 group-hover:text-primary transition-colors">{job.title}</h4>
              {job.priority && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 ${job.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                  {job.priority}
                </span>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground truncate mb-2">{job.clientName || job.locationName || 'Unknown Client'}</p>
            
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">Stage: {job.planningState || "none"}</span>
              {job.startDate && <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100">{job.startDate}</span>}
            </div>

            {/* Scope / Checklist Progress */}
            {(scopeTotal > 0) && (
              <div className="text-[10px] text-muted-foreground bg-muted/30 p-1.5 rounded-lg mb-2 cursor-pointer hover:bg-muted/50" onClick={() => onOpenChecklist(job)}>
                <div className="flex justify-between font-semibold mb-1 text-foreground">
                  <span>Scope Progress</span>
                  <span>{scopeCompleted} / {scopeTotal} items</span>
                </div>
                {activeChecklistItems.length > 0 && (
                  <div className="truncate text-blue-600 font-medium">Next: {activeChecklistItems[0].title}</div>
                )}
              </div>
            )}

            {/* Blocker */}
            {job.activeReadinessCondition && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-md border border-red-100 cursor-pointer" onClick={() => onOpenPlanning(job)}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-bold shrink-0">Blocked:</span>
                <span className="truncate font-medium">{job.activeReadinessCondition.reason}</span>
              </div>
            )}
            
            <div className="mt-3 flex gap-2">
              <button onClick={() => onOpenJob(job)} className="flex-1 text-[11px] font-bold bg-muted text-muted-foreground py-1.5 rounded-lg hover:bg-muted/80">View Details</button>
            </div>
          </div>
        )})}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Inbox className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs">No jobs</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Mode Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(["Pipeline", "Today", "This Week", "Month", "Agenda"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${mode === m ? "bg-foreground text-background" : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"}`}>
            {m}
          </button>
        ))}
      </div>
      
      {/* Board */}
      <div className="flex items-start gap-4 overflow-x-auto pb-4 h-[75vh]">
        <Column title="Queue / Limbo" icon={Inbox} color="text-gray-700" items={queueJobs} />
        <Column title="Waiting" icon={AlertCircle} color="text-amber-700" items={waitingJobs} />
        <Column title="Ready to Schedule" icon={Calendar} color="text-blue-700" items={readyJobs} />
        <Column title="Scheduled / This Week" icon={Clock} color="text-emerald-700" items={scheduledJobs} />
        <Column title="Completed/Archived" icon={Archive} color="text-slate-700" items={completedJobs} />
      </div>
    </div>
  );
}
