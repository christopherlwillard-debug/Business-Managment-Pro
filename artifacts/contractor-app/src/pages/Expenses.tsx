import { useState, useRef } from "react";
import { useListExpenses, useCreateExpense, useUploadExpenseReceipt, useListJobs } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Receipt, Plus, Upload, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Expenses() {
  const { data: expenses, isLoading, refetch } = useListExpenses();
  const { data: jobs } = useListJobs();
  const createMutation = useCreateExpense();
  const uploadMutation = useUploadExpenseReceipt();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = fileInputRef.current?.files?.[0];
    
    try {
      // 1. Create expense record
      const expense = await createMutation.mutateAsync({
        data: {
          description: formData.get("description") as string,
          amount: parseFloat(formData.get("amount") as string),
          category: formData.get("category") as string,
          date: formData.get("date") as string,
          vendor: formData.get("vendor") as string,
          jobId: formData.get("jobId") ? parseInt(formData.get("jobId") as string) : undefined,
        }
      });

      // 2. Upload receipt if selected
      if (file && expense.id) {
        await uploadMutation.mutateAsync({
          id: expense.id,
          data: { receipt: file }
        });
      }

      setIsDialogOpen(false);
      refetch(); // Ensure list is updated
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track materials, tools, and subs with receipt documentation.</p>
        </div>
        <button 
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" /> Log Expense
        </button>
      </div>

      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Description / Vendor</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Job Allocation</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading expenses...</td></tr>
              ) : expenses?.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-20"/> No expenses logged</td></tr>
              ) : (
                expenses?.map(exp => (
                  <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(exp.date)}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{exp.description}</div>
                      <div className="text-xs text-muted-foreground">{exp.vendor}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded border border-border bg-background text-xs text-muted-foreground">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{exp.jobTitle || '-'}</td>
                    <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(exp.amount)}</td>
                    <td className="px-6 py-4 text-center">
                      {exp.receiptUrl ? (
                        <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-medium text-accent hover:underline bg-accent/10 px-2 py-1 rounded-md transition-colors hover:bg-accent/20">
                          <LinkIcon className="w-3 h-3 mr-1.5" /> View Receipt
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No receipt</span>
                      )}
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
            <DialogTitle className="text-2xl font-display">Log Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                  <input name="amount" type="number" step="0.01" required className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none" placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <input name="description" required className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none" placeholder="e.g. Lumber for framing" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Vendor</label>
                <input name="vendor" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none" placeholder="e.g. Home Depot" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select name="category" required className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none">
                  <option value="Materials">Materials</option>
                  <option value="Tools/Equipment">Tools/Equipment</option>
                  <option value="Fuel/Travel">Fuel/Travel</option>
                  <option value="Subcontractor">Subcontractor</option>
                  <option value="Office/Admin">Office/Admin</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Allocate to Job (Optional)</label>
              <select name="jobId" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none">
                <option value="">-- None (Overhead) --</option>
                {jobs?.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>

            <div className="pt-2 border-t border-border border-dashed">
              <label className="block text-sm font-medium mb-2 flex items-center text-primary">
                <Upload className="w-4 h-4 mr-2" /> Upload Receipt Image/PDF
              </label>
              <input 
                type="file" 
                ref={fileInputRef}
                accept="image/*,.pdf"
                className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-colors" 
              />
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending || uploadMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {(createMutation.isPending || uploadMutation.isPending) ? "Saving..." : "Save Expense"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
