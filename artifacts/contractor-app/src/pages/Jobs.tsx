import { useState } from "react";
import { useListJobs, useCreateJob, useListClients, useListSubcontractors, CreateJobRequestStatus } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, MapPin, Calendar, DollarSign, Building, HardHat, Briefcase } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: jobs, isLoading } = useListJobs(statusFilter ? { status: statusFilter } : undefined);
  const { data: clients } = useListClients();
  const { data: subs } = useListSubcontractors();
  const createMutation = useCreateJob();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createMutation.mutateAsync({
        data: {
          title: formData.get("title") as string,
          clientId: formData.get("clientId") ? parseInt(formData.get("clientId") as string) : undefined,
          subcontractorId: formData.get("subcontractorId") ? parseInt(formData.get("subcontractorId") as string) : undefined,
          status: (formData.get("status") as CreateJobRequestStatus) || CreateJobRequestStatus.scheduled,
          jobType: formData.get("jobType") as string,
          address: formData.get("address") as string,
          city: formData.get("city") as string,
          estimatedAmount: formData.get("estimatedAmount") ? parseFloat(formData.get("estimatedAmount") as string) : undefined,
        }
      });
      setIsDialogOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Jobs</h1>
          <p className="text-muted-foreground mt-1">Manage active, scheduled, and completed jobs.</p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Job
        </button>
      </div>

      <div className="flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
        {['', 'scheduled', 'in_progress', 'completed', 'invoiced'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-accent text-accent-foreground shadow-sm'
                : 'bg-card text-muted-foreground border border-border hover:border-accent/50'
            }`}
          >
            {status === '' ? 'All Jobs' : status.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-card rounded-2xl border border-border/50"></div>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs?.map(job => (
            <div key={job.id} className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-all group flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="inline-flex px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary">
                  {job.status.replace('_', ' ')}
                </div>
                {job.estimatedAmount && (
                  <span className="font-display font-bold text-lg">{formatCurrency(job.estimatedAmount)}</span>
                )}
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-1">{job.title}</h3>

              <div className="space-y-2 mt-auto pt-4 flex-1">
                {job.clientName && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Building className="w-4 h-4 mr-2 text-primary/50" />
                    {job.clientName}
                  </div>
                )}
                {job.subcontractorName && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <HardHat className="w-4 h-4 mr-2 text-amber-500/70" />
                    <span className="text-amber-700 font-medium">{job.subcontractorName}</span>
                  </div>
                )}
                {(job.address || job.city) && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4 mr-2 text-primary/50" />
                    {job.address} {job.city}
                  </div>
                )}
                {job.startDate && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4 mr-2 text-primary/50" />
                    {formatDate(job.startDate)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {jobs?.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
              <Briefcase className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No jobs found</h3>
              <p className="text-muted-foreground mt-1">Create a new job to get started.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Create New Job</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Job Title *</label>
              <input name="title" required className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder="e.g. Smith Kitchen Remodel" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client</label>
                <select name="clientId" className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none">
                  <option value="">Select Client...</option>
                  {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select name="status" className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none">
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Assign Subcontractor</label>
              <select name="subcontractorId" className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none">
                <option value="">None (Admin job)</option>
                {subs?.map(s => <option key={s.id} value={s.id}>{s.name}{s.trade ? ` — ${s.trade}` : ""}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Estimated Amount</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
                <input name="estimatedAmount" type="number" step="0.01" className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none" placeholder="0.00" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Address</label>
                <input name="address" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input name="city" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {createMutation.isPending ? "Creating..." : "Create Job"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
