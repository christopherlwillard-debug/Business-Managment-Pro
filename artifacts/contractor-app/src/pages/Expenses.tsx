import { useState, useRef, useCallback } from "react";
import { useListExpenses, useCreateExpense, useUploadExpenseReceipt, useListJobs } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Receipt, Plus, Upload, Link as LinkIcon, ImageIcon, X, FileText, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIES = ["Materials", "Tools/Equipment", "Fuel/Travel", "Subcontractor", "Insurance", "Office/Admin", "Other"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function ReceiptDropZone({
  file,
  onFile,
  onClear,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback((f: File) => {
    onFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, [onFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleClear = () => {
    onClear();
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (file) {
    return (
      <div className="relative border border-border rounded-xl overflow-hidden bg-muted/30">
        {preview ? (
          <img src={preview} alt="Receipt preview" className="w-full max-h-36 object-contain bg-black/5" />
        ) : (
          <div className="flex items-center gap-3 px-4 py-3">
            <FileText className="w-8 h-8 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleClear}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
        <div className="px-3 py-1.5 bg-emerald-50 border-t border-emerald-100 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <p className="text-xs text-emerald-700 font-medium">Receipt ready to upload</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center gap-2 cursor-pointer transition-all ${
        dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/40"
      }`}
    >
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
        <Upload className="w-4 h-4 text-primary" />
      </div>
      <p className="text-sm font-medium text-foreground">Drop receipt here or click to browse</p>
      <p className="text-xs text-muted-foreground">JPG, PNG, PDF up to 10 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

export default function Expenses() {
  const { data: expenses, isLoading, refetch } = useListExpenses();
  const { data: jobs } = useListJobs();
  const createMutation = useCreateExpense();
  const uploadMutation = useUploadExpenseReceipt();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadError("");
    const formData = new FormData(e.currentTarget);

    try {
      const expense = await createMutation.mutateAsync({
        data: {
          description: formData.get("description") as string,
          amount: parseFloat(formData.get("amount") as string),
          category: formData.get("category") as string,
          date: formData.get("date") as string,
          vendor: formData.get("vendor") as string || undefined,
          notes: formData.get("notes") as string || undefined,
          jobId: formData.get("jobId") ? parseInt(formData.get("jobId") as string) : undefined,
        },
      });

      if (receiptFile && expense.id) {
        await uploadMutation.mutateAsync({ id: expense.id, data: { receipt: receiptFile } });
      }

      setIsDialogOpen(false);
      setReceiptFile(null);
      refetch();
    } catch {
      setUploadError("Failed to save expense. Please try again.");
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
          onClick={() => { setIsDialogOpen(true); setReceiptFile(null); setUploadError(""); }}
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
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading expenses…</td></tr>
              ) : expenses?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No expenses logged yet
                  </td>
                </tr>
              ) : (
                expenses?.map(exp => (
                  <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(exp.date)}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{exp.description}</div>
                      {exp.vendor && <div className="text-xs text-muted-foreground">{exp.vendor}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded border border-border bg-background text-xs text-muted-foreground">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{exp.jobTitle || "—"}</td>
                    <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(exp.amount)}</td>
                    <td className="px-6 py-4 text-center">
                      {exp.receiptUrl ? (
                        <a
                          href={exp.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors border border-primary/20 hover:border-primary/40"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Click to View Receipt
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setReceiptFile(null); }}>
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
                  <input
                    name="amount" type="number" step="0.01" required min="0"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input
                  name="date" type="date" required defaultValue={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <input
                name="description" required
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Lumber for framing"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Vendor</label>
                <input
                  name="vendor"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="e.g. Home Depot"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  name="category" required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Allocate to Job (Optional)</label>
              <select
                name="jobId"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
              >
                <option value="">— None (Overhead) —</option>
                {jobs?.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <input
                name="notes"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Optional notes"
              />
            </div>

            {/* Receipt Upload */}
            <div className="pt-2 border-t border-dashed border-border">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2 text-primary">
                <ImageIcon className="w-4 h-4" /> Receipt Photo / PDF
                <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </label>
              <ReceiptDropZone
                file={receiptFile}
                onFile={setReceiptFile}
                onClear={() => setReceiptFile(null)}
              />
            </div>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

            <div className="pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setIsDialogOpen(false); setReceiptFile(null); }}
                className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || uploadMutation.isPending}
                className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md"
              >
                {createMutation.isPending || uploadMutation.isPending ? "Saving…" : "Save Expense"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
