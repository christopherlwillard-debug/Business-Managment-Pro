import { useState } from "react";
import {
  useListJobs, useCreateJob, useUpdateJob, useDeleteJob,
  useListClients, useListSubcontractors, useListInvoices,
  useUpdateInvoiceStatus, useDeleteInvoice,
  Job, Invoice, Client, Subcontractor, InvoiceDraft, CreateJobRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { InvoiceEditorDialog } from "@/components/InvoiceEditorDialog";
import {
  Briefcase, MapPin, Calendar, HardHat, Users,
  Plus, Check, X, Trash2, ChevronDown, ChevronUp, FileText,
  Edit2, CheckCircle, Clock,
} from "lucide-react";

// ─── Status helpers ────────────────────────────────────────────────────────────
const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid:      "bg-emerald-100 text-emerald-700",
  sent:      "bg-blue-100 text-blue-700",
  overdue:   "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
  cancelled: "bg-orange-100 text-orange-700",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  paid:      "Paid",
  sent:      "Pending",
  draft:     "Draft",
  overdue:   "Overdue",
  cancelled: "Cancelled",
};

function displayStatus(status: string): "scheduled" | "completed" {
  if (status === "completed" || status === "invoiced") return "completed";
  return "scheduled";
}

// ─── Subcontractor multi-select chip picker ────────────────────────────────────
function SubcontractorPicker({
  subcontractors, selected, onChange,
}: {
  subcontractors: Subcontractor[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSubs = subcontractors.filter(s => selected.includes(s.id));

  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter(i => i !== id) : [...selected, id]);
  }

  return (
    <div className="relative">
      <button type="button"
        className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground flex flex-wrap gap-1.5 items-center focus:outline-none focus:ring-2 focus:ring-primary/20"
        onClick={() => setOpen(o => !o)}>
        {selectedSubs.length === 0
          ? <span className="text-muted-foreground">Select subcontractors…</span>
          : selectedSubs.map(s => (
            <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              {s.name}
              <span className="cursor-pointer" onMouseDown={e => { e.stopPropagation(); toggle(s.id); }}><X className="w-3 h-3" /></span>
            </span>
          ))
        }
        <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {subcontractors.length === 0
              ? <p className="px-3 py-2 text-xs text-muted-foreground">No subcontractors yet</p>
              : subcontractors.map(s => (
                <button key={s.id} type="button"
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/40 text-sm transition-colors"
                  onClick={() => toggle(s.id)}>
                  <span className={`w-4 h-4 rounded flex items-center justify-center border ${selected.includes(s.id) ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                    {selected.includes(s.id) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  {s.name}
                </button>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

// ─── Job Card ──────────────────────────────────────────────────────────────────
function JobCard({
  job, onEdit, onDelete, onReviewInvoice, onMarkCompleted,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (job: Job) => void;
  onReviewInvoice: (job: Job) => void;
  onMarkCompleted: (job: Job) => void;
}) {
  const isCompleted = displayStatus(job.status) === "completed";

  return (
    <Card className="p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-foreground text-sm truncate">{job.title}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            }`}>
              {isCompleted ? <CheckCircle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
              {isCompleted ? "Completed" : "Scheduled"}
            </span>
          </div>
          {job.estimatedAmount && (
            <p className="text-amber-600 font-bold text-sm">{formatCurrency(job.estimatedAmount)}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onEdit(job)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(job)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        {job.clientName && (
          <div className="flex items-center gap-1.5">
            <Users className="w-3 h-3 flex-shrink-0" />
            <span>{job.clientName}</span>
          </div>
        )}
        {(job.locationName || job.city || job.state) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>{[job.locationName, job.city, job.state].filter(Boolean).join(", ")}</span>
          </div>
        )}
        {job.startDate && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span>{formatDate(job.startDate)}{job.endDate && ` – ${formatDate(job.endDate)}`}</span>
          </div>
        )}
        {job.subcontractorNames?.length > 0 && (
          <div className="flex items-center gap-1.5">
            <HardHat className="w-3 h-3 flex-shrink-0" />
            <span>{job.subcontractorNames.join(", ")}</span>
          </div>
        )}
      </div>

      {isCompleted ? (
        <button
          onClick={() => onReviewInvoice(job)}
          className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm">
          <FileText className="w-3.5 h-3.5" /> Review Invoice
        </button>
      ) : (
        <button
          onClick={() => onMarkCompleted(job)}
          className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition-colors">
          <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
        </button>
      )}
    </Card>
  );
}

// ─── Job Form Dialog ───────────────────────────────────────────────────────────
function JobFormDialog({
  open, onOpenChange, editJob, clients, subcontractors, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editJob: Job | null;
  clients: Client[];
  subcontractors: Subcontractor[];
  onSaved: () => void;
}) {
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();

  function makeForm() {
    if (editJob) {
      return {
        title: editJob.title,
        clientId: String(editJob.clientId ?? ""),
        status: displayStatus(editJob.status),
        locationName: editJob.locationName ?? "",
        city: editJob.city ?? "",
        state: editJob.state ?? "KY",
        estimatedAmount: editJob.estimatedAmount ? String(editJob.estimatedAmount) : "",
        startDate: editJob.startDate ?? "",
        endDate: editJob.endDate ?? "",
        notes: editJob.notes ?? "",
      };
    }
    return {
      title: "", clientId: "", status: "scheduled",
      locationName: "", city: "", state: "KY",
      estimatedAmount: "", startDate: "", endDate: "", notes: "",
    };
  }

  const [form, setFormState] = useState(makeForm);
  const [subIds, setSubIds]   = useState<number[]>(editJob?.subcontractorIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(k: string, v: string) { setFormState(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      const payload: CreateJobRequest = {
        title: form.title.trim(),
        clientId: form.clientId ? parseInt(form.clientId) : undefined,
        subcontractorIds: subIds,
        status: form.status as CreateJobRequest["status"],
        locationName: form.locationName || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        estimatedAmount: form.estimatedAmount ? parseFloat(form.estimatedAmount) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
      };
      if (editJob) {
        await updateJob.mutateAsync({ id: editJob.id, data: payload });
      } else {
        await createJob.mutateAsync({ data: payload });
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setError("Failed to save job. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400" />
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{editJob ? "Edit Job" : "New Job"}</h2>
            <button type="button" onClick={() => onOpenChange(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="px-4 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Job Title *</label>
            <input type="text" required
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Kitchen Renovation"
              value={form.title} onChange={e => setField("title", e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Status</label>
            <div className="flex gap-3">
              {["scheduled", "completed"].map(s => (
                <label key={s} className="flex-1">
                  <input type="radio" name="status" value={s} checked={form.status === s}
                    onChange={() => setField("status", s)} className="sr-only" />
                  <span className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${
                    form.status === s
                      ? s === "completed"
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                        : "bg-blue-500 border-blue-500 text-white shadow-sm"
                      : "bg-background border-border text-muted-foreground hover:border-primary/30"
                  }`}>
                    {s === "completed" ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    {s === "completed" ? "Completed" : "Scheduled"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Client</label>
            <select
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={form.clientId} onChange={e => setField("clientId", e.target.value)}>
              <option value="">No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <label className="block text-sm font-medium text-foreground mb-1">
                <MapPin className="w-3 h-3 inline mr-1 text-amber-500" />Work Location Name
              </label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. 123 Main St"
                value={form.locationName} onChange={e => setField("locationName", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">City</label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.city} onChange={e => setField("city", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">State</label>
              <input type="text"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.state} onChange={e => setField("state", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              <HardHat className="w-3 h-3 inline mr-1" />Subcontractors
            </label>
            <SubcontractorPicker subcontractors={subcontractors} selected={subIds} onChange={setSubIds} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Est. Amount</label>
              <input type="number" min="0" step="0.01"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.estimatedAmount} onChange={e => setField("estimatedAmount", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
              <input type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.startDate} onChange={e => setField("startDate", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
              <input type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.endDate} onChange={e => setField("endDate", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              value={form.notes} onChange={e => setField("notes", e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors shadow disabled:opacity-60">
              {submitting ? "Saving…" : editJob ? "Save Changes" : "Create Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation ───────────────────────────────────────────────────────
function DeleteConfirm({
  label, onConfirm, onCancel, deleting,
}: {
  label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <Trash2 className="w-6 h-6 text-destructive" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">Delete {label}?</h3>
          <p className="text-sm text-muted-foreground mt-1">This action cannot be undone.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:bg-destructive/90 transition-colors shadow disabled:opacity-60">
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Saved Invoices Section ────────────────────────────────────────────────────
function SavedInvoicesSection() {
  const { data: invoices = [], isLoading } = useListInvoices();
  const updateStatus  = useUpdateInvoiceStatus();
  const deleteInvoice = useDeleteInvoice();
  const queryClient   = useQueryClient();

  const [collapsed, setCollapsed]       = useState(false);
  const [editInvoice, setEditInvoice]   = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const jobInvoices = invoices.filter(inv => inv.jobId != null);

  async function handleMarkPaid(inv: Invoice) {
    await updateStatus.mutateAsync({ id: inv.id, data: { status: "paid" } });
    queryClient.invalidateQueries();
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInvoice.mutateAsync({ id: deleteTarget.id });
      queryClient.invalidateQueries();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => setCollapsed(c => !c)}>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-foreground">Saved Invoices</span>
            {jobInvoices.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                {jobInvoices.length}
              </span>
            )}
          </div>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>

        {!collapsed && (
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : jobInvoices.length === 0 ? (
              <div className="py-10 text-center space-y-2 text-muted-foreground px-6">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground/30" />
                <p className="text-sm">No saved invoices yet. Mark a job Completed and click "Review Invoice" to create one.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice #</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {jobInvoices.map((inv: Invoice) => (
                    <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-foreground">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-sm text-foreground">{inv.clientName ?? <span className="text-muted-foreground italic">No client</span>}</td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{formatDate(inv.issueDate)}</td>
                      <td className="px-5 py-3 text-right font-bold text-amber-600">{formatCurrency(inv.total)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${INVOICE_STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setEditInvoice(inv)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors">
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                          {inv.status !== "paid" && (
                            <button onClick={() => handleMarkPaid(inv)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors">
                              <Check className="w-3 h-3" /> Mark Paid
                            </button>
                          )}
                          <button onClick={() => setDeleteTarget(inv)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {editInvoice && (
        <InvoiceEditorDialog
          open={Boolean(editInvoice)}
          onOpenChange={open => { if (!open) setEditInvoice(null); }}
          existingInvoice={editInvoice}
          onSaved={() => { setEditInvoice(null); queryClient.invalidateQueries(); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          label={`Invoice ${deleteTarget.invoiceNumber}`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </>
  );
}

// ─── Main Jobs Page ────────────────────────────────────────────────────────────
export default function Jobs() {
  const queryClient = useQueryClient();
  const { data: jobs = [],    isLoading } = useListJobs();
  const { data: clients = [] }            = useListClients();
  const { data: subcontractors = [] }     = useListSubcontractors();
  const deleteJobMutation                 = useDeleteJob();
  const updateJob                         = useUpdateJob();

  const [statusFilter, setStatusFilter] = useState<"all" | "scheduled" | "completed">("all");
  const [jobFormOpen, setJobFormOpen]   = useState(false);
  const [editJob, setEditJob]           = useState<Job | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const [invoiceEditorOpen, setInvoiceEditorOpen] = useState(false);
  const [invoiceDraftData, setInvoiceDraftData]   = useState<InvoiceDraft | null>(null);
  const [invoiceFetching, setInvoiceFetching]     = useState(false);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const filteredJobs  = jobs.filter(j => {
    if (statusFilter === "all") return true;
    return displayStatus(j.status) === statusFilter;
  });
  const scheduledJobs = filteredJobs.filter(j => displayStatus(j.status) === "scheduled");
  const completedJobs = filteredJobs.filter(j => displayStatus(j.status) === "completed");
  const showAll       = statusFilter === "all";

  function openNewJob() { setEditJob(null); setJobFormOpen(true); }
  function openEditJob(job: Job) { setEditJob(job); setJobFormOpen(true); }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteJobMutation.mutateAsync({ id: deleteTarget.id });
      queryClient.invalidateQueries();
    } finally { setDeleting(false); setDeleteTarget(null); }
  }

  async function handleMarkCompleted(job: Job) {
    await updateJob.mutateAsync({ id: job.id, data: { status: "completed" } });
    queryClient.invalidateQueries();
  }

  async function handleReviewInvoice(job: Job) {
    setInvoiceFetching(true);
    try {
      const resp = await fetch(`${BASE}/api/jobs/${job.id}/invoice-draft`, { credentials: "include" });
      if (resp.ok) {
        setInvoiceDraftData(await resp.json());
        setInvoiceEditorOpen(true);
      }
    } finally { setInvoiceFetching(false); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground mt-1">Manage jobs and generate invoices for completed work.</p>
        </div>
        <button onClick={openNewJob}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> New Job
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { key: "all",       label: "All Jobs" },
          { key: "scheduled", label: "Scheduled", count: jobs.filter(j => displayStatus(j.status) === "scheduled").length },
          { key: "completed", label: "Completed",  count: jobs.filter(j => displayStatus(j.status) === "completed").length },
        ] as const).map(f => (
          <button key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              statusFilter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:bg-muted/50"
            }`}>
            {f.label}
            {"count" in f && <span className="ml-1.5 text-xs opacity-80">({f.count})</span>}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && jobs.length === 0 && (
        <Card className="py-16 text-center space-y-3">
          <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="font-semibold text-foreground">No jobs yet</p>
          <p className="text-sm text-muted-foreground">Create your first job to get started.</p>
          <button onClick={openNewJob}
            className="mx-auto mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Job
          </button>
        </Card>
      )}

      {/* Jobs grid */}
      {!isLoading && jobs.length > 0 && (
        <>
          {(showAll || statusFilter === "scheduled") && scheduledJobs.length > 0 && (
            <div>
              {showAll && (
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <h2 className="font-semibold text-foreground">Scheduled</h2>
                  <span className="text-sm text-muted-foreground">({scheduledJobs.length})</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {scheduledJobs.map(job => (
                  <JobCard key={job.id} job={job} onEdit={openEditJob}
                    onDelete={j => setDeleteTarget(j)} onReviewInvoice={handleReviewInvoice}
                    onMarkCompleted={handleMarkCompleted} />
                ))}
              </div>
            </div>
          )}

          {(showAll || statusFilter === "completed") && completedJobs.length > 0 && (
            <div>
              {showAll && (
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <h2 className="font-semibold text-foreground">Completed</h2>
                  <span className="text-sm text-muted-foreground">({completedJobs.length})</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedJobs.map(job => (
                  <JobCard key={job.id} job={job} onEdit={openEditJob}
                    onDelete={j => setDeleteTarget(j)} onReviewInvoice={handleReviewInvoice}
                    onMarkCompleted={handleMarkCompleted} />
                ))}
              </div>
            </div>
          )}

          {filteredJobs.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              <p>No {statusFilter} jobs found.</p>
            </div>
          )}
        </>
      )}

      {/* Saved Invoices section */}
      <SavedInvoicesSection />

      {/* Dialogs */}
      {jobFormOpen && (
        <JobFormDialog
          open={jobFormOpen}
          onOpenChange={setJobFormOpen}
          editJob={editJob}
          clients={clients}
          subcontractors={subcontractors}
          onSaved={() => queryClient.invalidateQueries()}
        />
      )}

      {invoiceEditorOpen && (
        <InvoiceEditorDialog
          open={invoiceEditorOpen}
          onOpenChange={open => { if (!open) { setInvoiceEditorOpen(false); setInvoiceDraftData(null); } }}
          initialData={invoiceDraftData}
          onSaved={() => { setInvoiceEditorOpen(false); setInvoiceDraftData(null); queryClient.invalidateQueries(); }}
        />
      )}

      {invoiceFetching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-xl">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-700">Loading invoice data…</span>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirm
          label={`job "${deleteTarget.title}"`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
