import { useState } from "react";
import { useListSubcontractors, useCreateSubcontractor } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { HardHat, Plus, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Subcontractors() {
  const { data: subs, isLoading, refetch } = useListSubcontractors();
  const createMutation = useCreateSubcontractor();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    try {
      await createMutation.mutateAsync({
        data: {
          name: formData.get("name") as string,
          trade: formData.get("trade") as string,
          phone: formData.get("phone") as string,
          w9OnFile: formData.get("w9") === 'on',
        }
      });
      setIsDialogOpen(false);
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Subcontractors</h1>
          <p className="text-muted-foreground mt-1">Manage subs, W-9s, and 1099 compliance.</p>
        </div>
        <button 
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" /> Add Subcontractor
        </button>
      </div>

      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Name / Trade</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">W-9 Status</th>
                <th className="px-6 py-4 text-right">YTD Payments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading subs...</td></tr>
              ) : subs?.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-muted-foreground"><HardHat className="w-8 h-8 mx-auto mb-2 opacity-20"/> No subcontractors added</td></tr>
              ) : (
                subs?.map(sub => (
                  <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground text-base">{sub.name}</div>
                      <div className="text-xs text-muted-foreground">{sub.trade || 'Unspecified Trade'}</div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{sub.phone || sub.email || '-'}</td>
                    <td className="px-6 py-4 text-center">
                      {sub.w9OnFile ? (
                        <span className="inline-flex items-center text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> On File
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-rose-600 bg-rose-50 px-2 py-1 rounded-md text-xs font-semibold">
                          <ShieldAlert className="w-3 h-3 mr-1" /> Missing
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-display font-bold text-foreground">
                      {formatCurrency(sub.ytdPayments)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Add Subcontractor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company / Name *</label>
              <input name="name" required className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Trade</label>
                <input name="trade" placeholder="e.g. Plumbing" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input name="phone" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="pt-2">
               <label className="flex items-center p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                 <input type="checkbox" name="w9" className="w-4 h-4 text-primary rounded border-muted-foreground focus:ring-primary/20" />
                 <span className="ml-3 text-sm font-medium">W-9 Form is on file</span>
               </label>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {createMutation.isPending ? "Saving..." : "Add Sub"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
