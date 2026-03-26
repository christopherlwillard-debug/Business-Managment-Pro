import { useState } from "react";
import {
  useListDailyLogs,
  useCreateDailyLog,
  useDeleteDailyLog,
  useListJobs,
  useGetSettings,
  useListMaterialLists,
  useAttachMaterialListToInvoice,
  type DailyLog,
  type CreateDailyLogRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { generateMaterialListPdf } from "@/lib/generateMaterialListPdf";
import { ClipboardList, Plus, Trash2, FileText, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function today() {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  jobId: string;
  date: string;
  workCompleted: string;
  notes: string;
  materialListId: string;
};

export default function DailyLogs() {
  const { data: logs = [], isLoading } = useListDailyLogs();
  const { data: materialLists = [] } = useListMaterialLists();
  const { data: jobs = [] } = useListJobs();
  const { data: settings } = useGetSettings();
  const createLog = useCreateDailyLog();
  const deleteLog = useDeleteDailyLog();
  const attachToInvoice = useAttachMaterialListToInvoice();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [attachMsg, setAttachMsg] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [form, setForm] = useState<FormState>({
    jobId: "",
    date: today(),
    workCompleted: "",
    notes: "",
    materialListId: "",
  });

  const jobMaterialLists = form.jobId
    ? materialLists.filter(l => l.jobId === parseInt(form.jobId))
    : materialLists;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date) return;
    setSubmitting(true);
    try {
      const body: CreateDailyLogRequest = {
        date: form.date,
        workCompleted: form.workCompleted || undefined,
        notes: form.notes || undefined,
        materialListId: form.materialListId ? parseInt(form.materialListId) : undefined,
      };
      if (form.jobId) (body as Record<string, unknown>).jobId = parseInt(form.jobId);
      await createLog.mutateAsync({ data: body });
      setForm({ jobId: "", date: today(), workCompleted: "", notes: "", materialListId: "" });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-logs"] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteLog.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-logs"] });
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePushToInvoice(log: DailyLog) {
    if (!log.materialListId) return;
    const list = materialLists.find(l => l.id === log.materialListId);
    if (!list) return;
    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;
    let attachmentSize: number | undefined;
    try {
      const pdfBlob = generateMaterialListPdf(list, log.jobTitle ?? undefined, settings?.companyName ?? undefined);
      const fd = new FormData();
      fd.append("file", pdfBlob, `material-list-${list.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`);
      const uploadRes = await fetch(`${BASE}/api/uploads`, { method: "POST", body: fd });
      if (uploadRes.ok) {
        const up = await uploadRes.json() as { url: string; filename: string; size: number };
        attachmentUrl = up.url;
        attachmentName = `Material List – ${list.name}.pdf`;
        attachmentSize = up.size;
      }
    } catch { }
    try {
      await attachToInvoice.mutateAsync({ id: list.id, attachmentUrl, attachmentName, attachmentSize });
      setAttachMsg(prev => ({ ...prev, [log.id]: { ok: true, text: "Pushed to invoice." } }));
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    } catch {
      setAttachMsg(prev => ({ ...prev, [log.id]: { ok: false, text: "Failed to push." } }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Daily Field Logs</h1>
          <p className="text-muted-foreground mt-1">Documentation of site conditions and progress.</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Log"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">New Field Log</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Job</label>
              <select
                value={form.jobId}
                onChange={e => setForm(f => ({ ...f, jobId: e.target.value, materialListId: "" }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">No specific job</option>
                {(jobs as Array<{ id: number; title: string }>).map(j => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Work Completed</label>
            <textarea
              rows={2}
              value={form.workCompleted}
              onChange={e => setForm(f => ({ ...f, workCompleted: e.target.value }))}
              placeholder="Describe what was accomplished..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional notes..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          {jobMaterialLists.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Material List</label>
              <select
                value={form.materialListId}
                onChange={e => setForm(f => ({ ...f, materialListId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">None</option>
                {jobMaterialLists.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.jobTitle ? ` (${l.jobTitle})` : ""}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              {submitting ? "Saving…" : "Save Log"}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          [1,2].map(i => <div key={i} className="h-64 bg-card rounded-2xl border border-border/50 animate-pulse"></div>)
        ) : logs.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <ClipboardList className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No field logs</h3>
            <p className="text-muted-foreground mt-1">Add your first log above.</p>
          </div>
        ) : (
          logs.map(log => {
            const materialList = log.materialListId != null
              ? materialLists.find(l => l.id === log.materialListId)
              : null;
            const materialTotal = materialList
              ? materialList.items.reduce((s, it) => s + it.unitCostSnapshot * it.qty * (materialList.markup / 100 + 1), 0)
              : 0;
            const msg = log.id != null ? attachMsg[log.id] : undefined;

            return (
              <Card key={log.id} className="border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-center mb-4 border-b border-border/50 pb-4">
                    <div>
                      <h3 className="font-bold text-lg text-foreground">{formatDate(log.date)}</h3>
                      <p className="text-sm text-primary font-medium">{log.jobTitle || 'General'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right text-sm text-muted-foreground">
                        <div>{log.weather || 'Unknown weather'}</div>
                        <div>Crew: {log.crewCount || 0}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(log.id)}
                        disabled={deletingId === log.id}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Work Completed</span>
                      <p className="text-sm text-foreground">{log.workCompleted || 'None recorded'}</p>
                    </div>
                    {log.issues && (
                      <div>
                        <span className="text-xs font-semibold text-destructive uppercase tracking-wider block mb-1">Issues/Delays</span>
                        <p className="text-sm text-foreground bg-destructive/5 p-2 rounded-md border border-destructive/10">{log.issues}</p>
                      </div>
                    )}
                    {materialList && (
                      <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 block mb-0.5">Material List</span>
                          <p className="text-xs font-medium text-foreground truncate">{materialList.name}</p>
                          <p className="text-xs text-amber-600 font-bold">{formatCurrency(materialTotal)}</p>
                          {msg && <p className={`text-[10px] mt-0.5 ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p>}
                        </div>
                        <button
                          onClick={() => handlePushToInvoice(log)}
                          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 text-white text-[10px] font-bold hover:bg-amber-600 transition-colors">
                          <FileText className="w-3 h-3" /> Push to Invoice
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
