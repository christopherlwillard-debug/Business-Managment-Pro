import { useState, useRef, useCallback, useEffect } from "react";
import {
  useListExpenses, useCreateExpense, useUploadExpenseReceipt, useListJobs,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Receipt, Plus, Upload, ImageIcon, X, FileText,
  ExternalLink, Store, ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIES = ["Materials", "Tools/Equipment", "Fuel/Travel", "Subcontractor", "Insurance", "Office/Admin", "Other"];
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

// ─── Vendor hooks (direct, not generated) ─────────────────────────────────────
interface Vendor { id: number; name: string; category: string | null; }

function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await fetch(`${API}/vendors`);
      if (!res.ok) throw new Error("Failed to load vendors");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useSaveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${API}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to save vendor");
      return res.json() as Promise<Vendor>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  });
}

// ─── Vendor Combobox ──────────────────────────────────────────────────────────
function VendorCombobox({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: vendors = [] } = useVendors();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  const suggestions = input.trim()
    ? vendors.filter(v => v.name.toLowerCase().includes(input.toLowerCase()))
    : vendors;

  const isNew = input.trim() !== "" &&
    !vendors.some(v => v.name.toLowerCase() === input.trim().toLowerCase());

  function select(name: string) {
    setInput(name);
    onChange(name);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (dropRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    onChange(input);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-8 pr-8 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm placeholder-muted-foreground"
          placeholder="e.g. Home Depot"
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); onChange(e.target.value); }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          autoComplete="off"
        />
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground cursor-pointer"
          onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
        />
      </div>

      {open && (
        <div
          ref={dropRef}
          className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ maxHeight: 200, overflowY: "auto" }}
        >
          {vendors.length === 0 && !input.trim() && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground italic">
              No saved vendors yet — type to add one
            </p>
          )}
          {suggestions.map(v => (
            <button
              key={v.id}
              type="button"
              onMouseDown={() => select(v.name)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/40 last:border-0"
            >
              <Store className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
              <span>{v.name}</span>
              {v.category && (
                <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{v.category}</span>
              )}
            </button>
          ))}
          {isNew && (
            <button
              type="button"
              onMouseDown={() => select(input.trim())}
              className="w-full text-left px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 flex items-center gap-2 border-t border-border/60"
            >
              <Plus className="w-3.5 h-3.5" />
              Add "{input.trim()}" as new vendor
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Receipt drop zone ─────────────────────────────────────────────────────────
function ReceiptDropZone({ file, onFile, onClear }: {
  file: File | null; onFile: (f: File) => void; onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback((f: File) => {
    onFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, [onFile]);

  const handleClear = () => { onClear(); setPreview(null); if (inputRef.current) inputRef.current.value = ""; };
  const handleDrop  = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  if (file) {
    return (
      <div className="relative border border-border rounded-xl overflow-hidden bg-muted/30">
        {preview
          ? <img src={preview} alt="Receipt preview" className="w-full max-h-36 object-contain bg-black/5" />
          : (
            <div className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-8 h-8 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          )}
        <button type="button" onClick={handleClear}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors">
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
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
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
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const { data: expenses, isLoading, refetch } = useListExpenses();
  const { data: jobs }    = useListJobs();
  const createMutation    = useCreateExpense();
  const uploadMutation    = useUploadExpenseReceipt();
  const saveVendor        = useSaveVendor();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [receiptFile, setReceiptFile]   = useState<File | null>(null);
  const [uploadError, setUploadError]   = useState("");
  const [vendor, setVendor]             = useState("");
  const [category, setCategory]         = useState(CATEGORIES[0]);

  function openDialog() {
    setIsDialogOpen(true);
    setReceiptFile(null);
    setUploadError("");
    setVendor("");
    setCategory(CATEGORIES[0]);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadError("");
    const fd = new FormData(e.currentTarget);

    try {
      const expense = await createMutation.mutateAsync({
        data: {
          description: fd.get("description") as string,
          amount:      parseFloat(fd.get("amount") as string),
          category:    fd.get("category") as string,
          date:        fd.get("date") as string,
          vendor:      vendor.trim() || undefined,
          notes:       fd.get("notes") as string || undefined,
          jobId:       fd.get("jobId") ? parseInt(fd.get("jobId") as string) : undefined,
        },
      });

      if (receiptFile && expense.id) {
        await uploadMutation.mutateAsync({ id: expense.id, data: { receipt: receiptFile } });
      }

      if (vendor.trim()) {
        await saveVendor.mutateAsync(vendor.trim()).catch(() => {});
      }

      setIsDialogOpen(false);
      setReceiptFile(null);
      setVendor("");
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
          onClick={openDialog}
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
                      {exp.vendor && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Store className="w-3 h-3" /> {exp.vendor}
                        </div>
                      )}
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
                          <ExternalLink className="w-3 h-3" /> View
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

      <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) setReceiptFile(null); }}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Log Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
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
                <label className="block text-sm font-medium mb-1">
                  Vendor
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">(saved for reuse)</span>
                </label>
                <VendorCombobox value={vendor} onChange={setVendor} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  name="category" required value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Allocate to Job <span className="font-normal text-muted-foreground">(Optional)</span></label>
              <select name="jobId" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none">
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

            <div className="pt-2 border-t border-dashed border-border">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2 text-primary">
                <ImageIcon className="w-4 h-4" /> Receipt Photo / PDF
                <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </label>
              <ReceiptDropZone file={receiptFile} onFile={setReceiptFile} onClear={() => setReceiptFile(null)} />
            </div>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => { setIsDialogOpen(false); setReceiptFile(null); }}
                className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">
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
