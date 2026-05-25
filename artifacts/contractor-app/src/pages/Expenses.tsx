import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  useListExpenses, useCreateExpense, useUploadExpenseReceipt, useListJobs, useListSubcontractors,
} from "@workspace/api-client-react";
import type { RecurringExpense, RecurringExpenseFrequency } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, localDateString } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Receipt, Plus, Upload, ImageIcon, X, FileText,
  ExternalLink, Store, ChevronDown, Eye, Trash2, AlertTriangle,
  Calendar, Tag, Briefcase, DollarSign, StickyNote, HardHat,
  RotateCcw, Pause, Play, ChevronUp, Pencil, Maximize2, Download, EyeOff, Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpenseImportDialog } from "@/components/ExpenseImportDialog";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { openDrivePicker } from "@/lib/googleDrivePicker";

const CATEGORIES = [
  "Materials",             // Sch C Line 4
  "Advertising",           // Sch C Line 8
  "Fuel/Travel",           // Sch C Line 9
  "Subcontractor",         // Sch C Line 11
  "Insurance",             // Sch C Line 15
  "Professional Services", // Sch C Line 17
  "Office/Admin",          // Sch C Line 18
  "Rent/Lease",            // Sch C Line 20
  "Repairs/Maintenance",   // Sch C Line 21
  "Tools/Equipment",       // Sch C Line 22
  "Utilities",             // Sch C Line 25
  "Other",                 // Sch C Line 27
  "Owner Draw",            // Non-deductible — personal distribution
];

const CATEGORY_LABELS: Record<string, string> = {
  "Materials":             "Materials — Line 4 (Cost of Goods)",
  "Advertising":           "Advertising — Line 8 (Advertising)",
  "Fuel/Travel":           "Fuel/Travel — Line 9 (Car & Truck)",
  "Subcontractor":         "Subcontractor — Line 11 (Contract Labor)",
  "Insurance":             "Insurance — Line 15 (Insurance)",
  "Professional Services": "Professional Services — Line 17 (Legal & Prof.)",
  "Office/Admin":          "Office/Admin — Line 18 (Office Expense)",
  "Rent/Lease":            "Rent/Lease — Line 20 (Rent or Lease)",
  "Repairs/Maintenance":   "Repairs/Maintenance — Line 21 (Repairs)",
  "Tools/Equipment":       "Tools/Equipment — Line 22 (Supplies)",
  "Utilities":             "Utilities — Line 25 (Utilities)",
  "Other":                 "Other — Line 27 (Other Expenses)",
  "Owner Draw":            "Owner Draw — Personal distribution (not tax-deductible)",
};
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const FREQUENCY_LABELS: Record<RecurringExpenseFrequency, string> = {
  weekly:    "Weekly",
  biweekly:  "Bi-weekly",
  monthly:   "Monthly",
  quarterly: "Quarterly",
  yearly:    "Yearly",
};

const FREQUENCY_COLORS: Record<RecurringExpenseFrequency, string> = {
  weekly:    "bg-purple-100 text-purple-700",
  biweekly:  "bg-indigo-100 text-indigo-700",
  monthly:   "bg-blue-100 text-blue-700",
  quarterly: "bg-teal-100 text-teal-700",
  yearly:    "bg-green-100 text-green-700",
};

const MONTHLY_MULTIPLIER: Record<RecurringExpenseFrequency, number> = {
  weekly:    52 / 12,
  biweekly:  26 / 12,
  monthly:   1,
  quarterly: 1 / 3,
  yearly:    1 / 12,
};

function toMonthlyRate(amount: number, frequency: RecurringExpenseFrequency): number {
  return amount * (MONTHLY_MULTIPLIER[frequency] ?? 1);
}

// ─── Recurring expense hooks ───────────────────────────────────────────────────
function useRecurringExpenses() {
  return useQuery<RecurringExpense[]>({
    queryKey: ["recurring-expenses"],
    queryFn: async () => {
      const res = await fetch(`${API}/recurring-expenses`);
      if (!res.ok) throw new Error("Failed to load recurring expenses");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`${API}/recurring-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create recurring expense");
      return res.json() as Promise<RecurringExpense>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
  });
}

function useUpdateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await fetch(`${API}/recurring-expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update recurring expense");
      return res.json() as Promise<RecurringExpense>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring-expenses"] }),
  });
}

function useDeleteRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/recurring-expenses/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete recurring expense");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
  });
}

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

function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API}/expenses/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete expense");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/subcontractors"] });
    },
  });
}

function useUpdateExpense() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await fetch(`${API}/expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update expense");
      return res.json();
    },
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
function isHeic(f: File) {
  const mimeCheck = f.type === "image/heic" || f.type === "image/heif" || f.type === "image/heic-sequence" || f.type === "image/heif-sequence";
  const nameCheck = /\.(heic|heif|heics)$/i.test(f.name);
  return mimeCheck || nameCheck;
}

async function processReceiptFile(f: File): Promise<File> {
  if (!isHeic(f)) return f;
  const heic2anyModule = await import("heic2any");
  const heic2any = heic2anyModule.default || heic2anyModule;
  const result = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.92 });
  const jpegBlob = Array.isArray(result) ? result[0] : result;
  if (!(jpegBlob instanceof Blob)) throw new Error("Unexpected output from HEIC converter");
  const baseName = f.name.replace(/\.(heic|heif)$/i, "");
  return new File([jpegBlob], `${baseName}.jpg`, { type: "image/jpeg" });
}

function ReceiptDropZone({ file, onFile, onClear, onDriveClick, driveLoading, showDrive }: {
  file: File | null; onFile: (f: File) => void; onClear: () => void;
  onDriveClick?: () => void; driveLoading?: boolean; showDrive?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setConvertError(null);
    if (isHeic(f)) {
      setConverting(true);
      try {
        const processed = await processReceiptFile(f);
        onFile(processed);
        const reader = new FileReader();
        reader.onload = e => setPreview(e.target?.result as string);
        reader.readAsDataURL(processed);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("HEIC conversion error:", errMsg);
        setConvertError(`Could not convert HEIC file (${errMsg}). Try exporting as JPEG from your camera roll.`);
        if (inputRef.current) inputRef.current.value = "";
      } finally {
        setConverting(false);
      }
      return;
    }
    onFile(f);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, [onFile]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    if (file.type.startsWith("image/") && !preview) {
      const reader = new FileReader();
      reader.onload = e => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, [file]);

  const handleClear = () => { onClear(); setPreview(null); setConvertError(null); if (inputRef.current) inputRef.current.value = ""; };
  const handleDrop  = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  };

  if (converting) {
    return (
      <div className="border-2 border-dashed border-primary/50 rounded-xl px-4 py-5 flex flex-col items-center gap-2 bg-primary/5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
          <Upload className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">Converting HEIC to JPEG…</p>
        <p className="text-xs text-muted-foreground">This only takes a moment</p>
      </div>
    );
  }

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
    <div className="space-y-2">
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
        <p className="text-xs text-muted-foreground">Any photo or PDF up to 10 MB</p>
        <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {showDrive && onDriveClick && (
        <button
          type="button"
          onClick={onDriveClick}
          disabled={driveLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/40 transition-all disabled:opacity-60"
        >
          {driveLoading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          )}
          Pick from Google Drive
        </button>
      )}
      {convertError && (
        <p className="text-xs text-red-600 text-center">{convertError}</p>
      )}
    </div>
  );
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function ExpenseDeleteConfirm({
  expense, onConfirm, onCancel, deleting,
}: {
  expense: any; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  const isSubPayment = expense?.category?.toLowerCase() === "subcontractor" && expense?.subcontractorName;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">Permanently delete expense?</h3>
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-semibold text-gray-700">{expense.description}</span>
              {expense.vendor ? ` · ${expense.vendor}` : ""} will be{" "}
              <span className="font-semibold text-red-600">permanently deleted</span> and cannot be recovered.
            </p>
            {isSubPayment && (
              <p className="text-xs text-indigo-600 mt-2 bg-indigo-50 rounded-lg px-2.5 py-1.5 border border-indigo-100">
                This is a subcontractor payment for <strong>{expense.subcontractorName}</strong>. Deleting it will reduce their YTD total by <strong>${parseFloat(expense.amount ?? "0").toFixed(2)}</strong>.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? "Deleting…" : "Yes, Delete Permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Expense View Modal ───────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  "Materials":             "bg-amber-100 text-amber-700",
  "Advertising":           "bg-pink-100 text-pink-700",
  "Fuel/Travel":           "bg-green-100 text-green-700",
  "Subcontractor":         "bg-purple-100 text-purple-700",
  "Insurance":             "bg-cyan-100 text-cyan-700",
  "Professional Services": "bg-indigo-100 text-indigo-700",
  "Office/Admin":          "bg-gray-100 text-gray-600",
  "Rent/Lease":            "bg-violet-100 text-violet-700",
  "Repairs/Maintenance":   "bg-red-100 text-red-700",
  "Tools/Equipment":       "bg-blue-100 text-blue-700",
  "Utilities":             "bg-sky-100 text-sky-700",
  "Other":                 "bg-orange-100 text-orange-700",
};

function ExpenseViewModal({
  expense, onClose, onDelete, onJumpToTemplate,
}: {
  expense: any; onClose: () => void; onDelete: () => void; onJumpToTemplate?: (id: number) => void;
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  function buildReceiptUrl(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (raw.startsWith("http")) return raw;
    // GCS object path stored as /objects/... → serve via /api/storage/objects/...
    if (raw.startsWith("/objects/")) return `${base}/api/storage${raw}`;
    // Legacy /api/uploads/... paths (may be broken if file was lost on redeploy)
    return `${base}${raw}`;
  }

  const receiptUrl = buildReceiptUrl(expense.receiptUrl);
  // HEIC/HEIF files cannot be rendered inline in browsers — show download only
  const isHeic = receiptUrl && /\.(heic|heif)$/i.test(receiptUrl);
  const isImage = receiptUrl && !isHeic && /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(receiptUrl);
  const isPdf = receiptUrl && /\.pdf$/i.test(receiptUrl);
  const [lightbox, setLightbox] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl rounded-2xl overflow-hidden flex flex-col my-auto">

        {/* Header bar */}
        <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400 flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-gray-900">Expense Detail</span>
            {expense.recurringExpenseId && (
              <button
                type="button"
                onClick={() => { onClose(); onJumpToTemplate?.(expense.recurringExpenseId!); }}
                title="View recurring template"
                className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Recurring ↓
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(92vh - 100px)" }}>

          {/* Amount — hero stat */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 text-center">
            <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-1">Amount</p>
            <p className="text-4xl font-black text-amber-600">{formatCurrency(expense.amount)}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Calendar className="w-3 h-3" /> Date
              </div>
              <p className="text-sm font-semibold text-gray-800">{formatDate(expense.date)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Tag className="w-3 h-3" /> Category
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[expense.category] ?? "bg-gray-100 text-gray-600"}`}>
                {expense.category}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
              <DollarSign className="w-3 h-3" /> Description
            </div>
            <p className="text-sm font-semibold text-gray-800">{expense.description}</p>
          </div>

          {expense.vendor && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Store className="w-3 h-3" /> Vendor
              </div>
              <p className="text-sm font-semibold text-gray-800">{expense.vendor}</p>
            </div>
          )}

          {expense.jobTitle && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <Briefcase className="w-3 h-3" /> Job
              </div>
              <p className="text-sm font-semibold text-gray-800">{expense.jobTitle}</p>
            </div>
          )}

          {(expense as any).subcontractorName && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-1">
                <HardHat className="w-3 h-3" /> Subcontractor
              </div>
              <p className="text-sm font-semibold text-gray-800">{(expense as any).subcontractorName}</p>
              <p className="text-xs text-amber-600 mt-0.5">Visible in subcontractor portal</p>
            </div>
          )}

          {expense.notes && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">
                <StickyNote className="w-3 h-3" /> Notes
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          {/* Receipt */}
          {receiptUrl ? (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400">
                  <ImageIcon className="w-3 h-3" /> Receipt
                </div>
                {!isHeic && (
                  <button type="button" onClick={() => {
                    if (isPdf) { window.open(receiptUrl!, "_blank", "noopener,noreferrer"); }
                    else { setLightbox(true); }
                  }}
                    className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                    <Maximize2 className="w-3 h-3" /> {isPdf ? "Open PDF" : "Expand"}
                  </button>
                )}
              </div>
              {isImage && !imgError ? (
                <img
                  src={receiptUrl} alt="Receipt"
                  className="w-full max-h-52 object-contain bg-gray-100 cursor-zoom-in"
                  onClick={() => setLightbox(true)}
                  onError={() => setImgError(true)}
                />
              ) : isImage && imgError ? (
                <div className="flex flex-col items-center gap-2 px-4 py-5 bg-red-50 text-center">
                  <ImageIcon className="w-8 h-8 text-red-300" />
                  <p className="text-sm font-semibold text-red-700">Receipt no longer available</p>
                  <p className="text-xs text-red-500">This file was lost in a previous deployment. Please re-upload the receipt.</p>
                </div>
              ) : isHeic ? (
                <div className="flex flex-col items-center gap-3 px-4 py-5 bg-gray-50">
                  <ImageIcon className="w-10 h-10 text-gray-300" />
                  <p className="text-sm text-gray-500 text-center">iPhone photo (HEIC) — cannot preview in browser</p>
                  <a
                    href={receiptUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Download className="w-4 h-4" /> Download Receipt
                  </a>
                </div>
              ) : isPdf ? (
                <div className="flex flex-col items-center gap-3 px-4 py-6 bg-gray-50">
                  <Receipt className="w-10 h-10 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-700">Receipt PDF</p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open PDF
                    </a>
                    <a
                      href={receiptUrl}
                      download
                      className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 bg-white text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-center py-3 text-xs text-gray-400 italic">No receipt attached</div>
          )}
        </div>
        {/* Close button footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
        <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500 flex-shrink-0" />
      </div>

      {/* Full-screen receipt lightbox */}
      {lightbox && receiptUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" /> Close
          </button>

          {/* Content */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            {isImage && !imgError ? (
              <img
                src={receiptUrl}
                alt="Receipt full view"
                className="max-w-full max-h-full object-contain select-none"
                onClick={e => e.stopPropagation()}
                onError={() => setImgError(true)}
              />
            ) : isImage && imgError ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-red-300" />
                <p className="text-white font-semibold text-lg">Receipt no longer available</p>
                <p className="text-white/70 text-sm">This file was lost in a previous deployment.<br/>Please close and re-upload the receipt.</p>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 mx-4 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <Receipt className="w-16 h-16 text-white/30" />
                <div>
                  <p className="text-white font-semibold text-lg">Receipt PDF</p>
                  <p className="text-white/50 text-sm mt-1">Tap "Open PDF" to view in a new tab</p>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF
                  </a>
                  <a
                    href={receiptUrl}
                    download
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Bottom hint — safe area aware */}
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recurring Expense Modal ──────────────────────────────────────────────────
function RecurringModal({
  open,
  onClose,
  jobs,
}: {
  open: boolean;
  onClose: () => void;
  jobs: any[];
}) {
  const createRecurring = useCreateRecurring();
  const saveVendor      = useSaveVendor();
  const [vendor, setVendor]     = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [error, setError]       = useState("");

  function resetForm() {
    setVendor("");
    setCategory(CATEGORIES[0]);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);

    try {
      await createRecurring.mutateAsync({
        description: fd.get("description") as string,
        amount:      parseFloat(fd.get("amount") as string),
        category,
        vendor:      vendor.trim() || undefined,
        jobId:       fd.get("jobId") ? parseInt(fd.get("jobId") as string) : undefined,
        notes:       fd.get("notes") as string || undefined,
        frequency:   fd.get("frequency") as string,
        startDate:   fd.get("startDate") as string,
        endDate:     (fd.get("endDate") as string) || undefined,
      });

      if (vendor.trim()) {
        await saveVendor.mutateAsync(vendor.trim()).catch(() => {});
      }

      resetForm();
      onClose();
    } catch {
      setError("Failed to save. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-500" />
            Add Recurring Expense
          </DialogTitle>
        </DialogHeader>
        <form id="recurring-form" onSubmit={handleSubmit} className="space-y-4 mt-4 overflow-y-auto flex-1">
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
              <label className="block text-sm font-medium mb-1">Frequency *</label>
              <select
                name="frequency" required
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
                defaultValue="monthly"
              >
                {(Object.entries(FREQUENCY_LABELS) as [RecurringExpenseFrequency, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description *</label>
            <input
              name="description" required
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. General liability insurance"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <VendorCombobox value={vendor} onChange={setVendor} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <select
                name="category" required value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <input
                name="startDate" type="date" required defaultValue={localDateString()}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                End Date
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                name="endDate" type="date"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              />
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

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="pt-4 border-t border-dashed border-border flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={() => { resetForm(); onClose(); }}
            className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            form="recurring-form"
            disabled={createRecurring.isPending}
            className="px-6 py-2 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {createRecurring.isPending ? "Saving…" : "Save Recurring"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recurring Section ────────────────────────────────────────────────────────
function RecurringSection({
  jobs,
  highlightedTemplateId,
  onClearHighlight,
}: {
  jobs: any[];
  highlightedTemplateId: number | null;
  onClearHighlight: () => void;
}) {
  const { canEdit } = useUserPermissions();
  const { data: templates = [], isLoading } = useRecurringExpenses();
  const updateRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();
  const [modalOpen,   setModalOpen]   = useState(false);
  const [collapsed,   setCollapsed]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpense | null>(null);
  const [deletingId,  setDeletingId]  = useState<number | null>(null);

  useEffect(() => {
    if (!highlightedTemplateId) return;
    setCollapsed(false);
    const timer = setTimeout(() => {
      const el = document.getElementById(`template-row-${highlightedTemplateId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    const clear = setTimeout(() => onClearHighlight(), 3500);
    return () => { clearTimeout(timer); clearTimeout(clear); };
  }, [highlightedTemplateId]);

  async function toggleActive(t: RecurringExpense) {
    await updateRecurring.mutateAsync({ id: t.id, data: { active: !t.active } });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteRecurring.mutateAsync(deleteTarget.id);
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  }

  const activeCount = templates.filter(t => t.active).length;
  const activeTemplates = templates.filter(t => t.active);
  const totalMonthly = activeTemplates.reduce((sum, t) => sum + toMonthlyRate(t.amount, t.frequency), 0);
  const totalAnnual = totalMonthly * 12;

  return (
    <>
      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-border/50 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Recurring Expenses</h2>
                {activeCount > 0 && (
                  <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {activeCount} active
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Auto-generate expenses on a schedule</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit("expenses") && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setModalOpen(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Recurring
              </button>
            )}
            {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-x-auto custom-scrollbar">
            {/* Monthly overhead summary banner */}
            {activeTemplates.length > 0 && (
              <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border-b border-indigo-100 dark:border-indigo-900/40">
                <div className="flex flex-wrap items-start gap-4">
                  {/* Totals */}
                  <div className="flex gap-4 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide">Est. Monthly</p>
                      <p className="text-2xl font-display font-bold text-indigo-700 dark:text-indigo-300 leading-tight">
                        {formatCurrency(totalMonthly)}
                      </p>
                    </div>
                    <div className="w-px bg-indigo-200 dark:bg-indigo-700 self-stretch" />
                    <div className="text-center">
                      <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wide">Est. Annual</p>
                      <p className="text-2xl font-display font-bold text-indigo-500 dark:text-indigo-400 leading-tight">
                        {formatCurrency(totalAnnual)}
                      </p>
                    </div>
                  </div>
                  {/* Per-expense breakdown */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {activeTemplates.map(t => {
                      const mo = toMonthlyRate(t.amount, t.frequency);
                      return (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/70 dark:bg-white/10 border border-indigo-100 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 shadow-sm"
                        >
                          {t.description}
                          <span className="text-indigo-400 dark:text-indigo-500">·</span>
                          <span className="font-semibold">{formatCurrency(mo)}/mo</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[10px] text-indigo-400 mt-2 leading-tight">
                  All frequencies normalized to monthly equivalent &bull; Active templates only
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="px-6 py-8 text-center text-muted-foreground animate-pulse text-sm">Loading…</div>
            ) : templates.length === 0 ? (
              <div className="px-6 py-10 text-center text-muted-foreground">
                <RotateCcw className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No recurring expenses set up yet.</p>
                <p className="text-xs mt-1">Add one to auto-generate expenses on a schedule.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-6 py-3">Description / Vendor</th>
                    <th className="px-6 py-3">Frequency</th>
                    <th className="px-6 py-3">Next Due</th>
                    <th className="px-6 py-3">End Date</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    {canEdit("expenses") && <th className="px-6 py-3 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {templates.map(t => (
                    <tr
                      key={t.id}
                      id={`template-row-${t.id}`}
                      className={`transition-all duration-500 ${
                        highlightedTemplateId === t.id
                          ? "bg-blue-50 ring-2 ring-inset ring-blue-300"
                          : t.active ? "hover:bg-muted/20" : "opacity-60 hover:bg-muted/10"
                      }`}
                    >
                      <td className="px-6 py-3">
                        <div className="font-medium text-foreground">{t.description}</div>
                        {t.vendor && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Store className="w-3 h-3" /> {t.vendor}
                          </div>
                        )}
                        {t.jobTitle && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Briefcase className="w-3 h-3" /> {t.jobTitle}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${FREQUENCY_COLORS[t.frequency] ?? "bg-gray-100 text-gray-600"}`}>
                          <RotateCcw className="w-3 h-3" />
                          {FREQUENCY_LABELS[t.frequency] ?? t.frequency}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {t.active ? formatDate(t.nextDueDate) : <span className="italic">Paused</span>}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {t.endDate ? formatDate(t.endDate) : <span className="italic text-xs">No end</span>}
                      </td>
                      <td className="px-6 py-3 text-right font-display font-semibold text-foreground">
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {t.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                            <Pause className="w-2.5 h-2.5" /> Paused
                          </span>
                        )}
                      </td>
                      {canEdit("expenses") && (
                        <td className="px-6 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => toggleActive(t)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title={t.active ? "Pause" : "Resume"}
                            >
                              {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setDeleteTarget(t)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete template"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <RecurringModal open={modalOpen} onClose={() => setModalOpen(false)} jobs={jobs} />

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Delete recurring expense?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  The template for <span className="font-semibold text-gray-700">{deleteTarget.description}</span> will be deleted.
                  Previously generated expense entries will remain.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deletingId !== null}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deletingId !== null}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow disabled:opacity-60 flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                {deletingId !== null ? "Deleting…" : "Delete Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const { canEdit } = useUserPermissions();
  const { activeBusiness, businesses } = useBusiness();
  const { toast } = useToast();
  const { isConfigured: googleConfigured, isConnected: googleConnected, signIn: googleSignIn, getToken } = useGoogleAuth();
  const [drivePickingNew, setDrivePickingNew] = useState(false);
  const [drivePickingEdit, setDrivePickingEdit] = useState(false);

  const [filterCategory, setFilterCategory] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("filter_category") ?? "";
  });
  const { data: expenses, isLoading, refetch } = useListExpenses(filterCategory ? { category: filterCategory } : undefined);
  const { data: jobs }    = useListJobs();
  const { data: subs }    = useListSubcontractors();
  const qc                = useQueryClient();
  const createMutation    = useCreateExpense();
  const uploadMutation    = useUploadExpenseReceipt();
  const saveVendor        = useSaveVendor();
  const deleteExpense     = useDeleteExpense();
  const updateExpense     = useUpdateExpense();

  const [isDialogOpen, setIsDialogOpen]               = useState(false);
  const [importOpen,   setImportOpen]                 = useState(false);
  const [receiptFile, setReceiptFile]                 = useState<File | null>(null);
  const [uploadError, setUploadError]                 = useState("");

  const [prefillAmount, setPrefillAmount]             = useState("");
  const [prefillDate,   setPrefillDate]               = useState("");
  const [prefillDesc,   setPrefillDesc]               = useState("");
  const [prefillKey,    setPrefillKey]                = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pa = params.get("prefill_amount");
    const pd = params.get("prefill_date");
    const pDesc = params.get("prefill_desc");
    const pCat = params.get("prefill_category");
    if (pa || pd || pDesc || pCat) {
      if (pCat && CATEGORIES.includes(pCat)) {
        setCategory(pCat);
        if (pCat === "Owner Draw") setExcludeFromNetProfit(true);
      }
      setPrefillAmount(pa ?? "");
      setPrefillDate(pd ?? "");
      setPrefillDesc(pDesc ?? "");
      setPrefillKey(k => k + 1);
      setIsDialogOpen(true);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("prefill_amount");
      clean.searchParams.delete("prefill_date");
      clean.searchParams.delete("prefill_desc");
      clean.searchParams.delete("prefill_category");
      window.history.replaceState({}, "", clean.toString());
    }
  }, []);
  const [vendor, setVendor]                           = useState("");
  const [category, setCategory]                       = useState(CATEGORIES[0]);
  const [subcontractorId, setSubcontractorId]         = useState("");
  const [excludeFromNetProfit, setExcludeFromNetProfit] = useState(false);
  const [businessLine, setBusinessLine]               = useState<string | undefined>(
    activeBusiness?.slug ?? undefined
  );
  useEffect(() => {
    setBusinessLine(activeBusiness?.slug ?? undefined);
  }, [activeBusiness?.slug]);
  const [viewExpense,   setViewExpense]                = useState<any | null>(null);
  const [editingRow,    setEditingRow]                = useState<{id: number; description: string; amount: string; date: string; category: string; vendor: string; jobId: string; notes: string; excludeFromNetProfit: boolean; businessLine: string} | null>(null);
  const [editReceiptFile, setEditReceiptFile]         = useState<File | null>(null);
  const [editLightboxUrl, setEditLightboxUrl]         = useState<string | null>(null);
  const [editLightboxImgError, setEditLightboxImgError] = useState(false);
  const [receiptLightboxUrl, setReceiptLightboxUrl]   = useState<string | null>(null);
  const [receiptLightboxIsPdf, setReceiptLightboxIsPdf] = useState(false);
  const [receiptLightboxImgError, setReceiptLightboxImgError] = useState(false);

  async function handleDrivePickNew() {
    if (!googleConnected) {
      googleSignIn(() => handleDrivePickNew());
      return;
    }
    setDrivePickingNew(true);
    try {
      const token = await getToken();
      const file = await openDrivePicker(token);
      if (file) {
        const processed = await processReceiptFile(file);
        setReceiptFile(processed);
      }
    } catch (err: any) {
      toast({ title: "Drive error", description: err?.message ?? "Could not open Google Drive picker.", variant: "destructive" });
    } finally {
      setDrivePickingNew(false);
    }
  }

  async function handleDrivePickEdit() {
    if (!googleConnected) {
      googleSignIn(() => handleDrivePickEdit());
      return;
    }
    setDrivePickingEdit(true);
    try {
      const token = await getToken();
      const file = await openDrivePicker(token);
      if (file) {
        const processed = await processReceiptFile(file);
        setEditReceiptFile(processed);
      }
    } catch (err: any) {
      toast({ title: "Drive error", description: err?.message ?? "Could not open Google Drive picker.", variant: "destructive" });
    } finally {
      setDrivePickingEdit(false);
    }
  }

  function openReceiptLightbox(url: string) {
    const path = url.split("?")[0];
    if (/\.pdf$/i.test(path)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setReceiptLightboxIsPdf(false);
    setReceiptLightboxImgError(false);
    setReceiptLightboxUrl(url);
  }
  const editReceiptInputRef                           = useRef<HTMLInputElement>(null);
  const [deleteTarget,  setDeleteTarget]              = useState<any | null>(null);
  const [deleting,     setDeleting]                   = useState(false);
  const [highlightedTemplateId, setHighlightedTemplateId] = useState<number | null>(null);

  // ─── Year / month grouping ───────────────────────────────────────────────────
  const currentYear      = useMemo(() => String(new Date().getFullYear()), []);
  const todayYearMonth   = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  function initMonthCollapsed(year: string): Record<string, boolean> {
    // Only the current month starts open; everything else collapsed
    return year === currentYear ? { [todayYearMonth]: false } : {};
  }

  const [selectedYear,   setSelectedYear]   = useState(currentYear);
  const [monthCollapsed, setMonthCollapsed] = useState<Record<string, boolean>>(
    () => initMonthCollapsed(currentYear)
  );
  const [searchQuery, setSearchQuery] = useState("");

  function toggleMonth(key: string) {
    setMonthCollapsed(prev => ({ ...prev, [key]: prev[key] === false }));
  }

  const allYears = useMemo(() => {
    const years = new Set([currentYear]);
    (expenses ?? []).forEach(e => {
      const y = (e.date ?? "").slice(0, 4);
      if (y.length === 4) years.add(y);
    });
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [expenses, currentYear]);

  const yearExpenses = useMemo(
    () => (expenses ?? [])
      .filter(e => (e.date ?? "").startsWith(selectedYear))
      .filter(e => !activeBusiness || (e as any).businessLine === activeBusiness.slug),
    [expenses, selectedYear, activeBusiness]
  );

  const filteredYearExpenses = useMemo(() => {
    if (!searchQuery.trim()) return yearExpenses;
    const q = searchQuery.trim().toLowerCase();
    return yearExpenses.filter(e => {
      const amtNum = parseFloat(String(e.amount ?? "0"));
      const amtRaw = String(e.amount ?? "");
      const amtFormatted = Number.isFinite(amtNum)
        ? amtNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "";
      return (
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.vendor ?? "").toLowerCase().includes(q) ||
        amtRaw.includes(q) ||
        amtFormatted.includes(q)
      );
    });
  }, [yearExpenses, searchQuery]);

  const monthlyGroups = useMemo(() => {
    const groups: Record<string, typeof filteredYearExpenses> = {};
    filteredYearExpenses.forEach(e => {
      const mk = (e.date ?? "").slice(0, 7);
      if (mk.length === 7) {
        if (!groups[mk]) groups[mk] = [];
        groups[mk].push(e);
      }
    });
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(mk => {
      const [y, m] = mk.split("-");
      return {
        key: mk,
        expenses: [...groups[mk]].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
        total: groups[mk].reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0),
        label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
          month: "long", year: "numeric",
        }),
      };
    });
  }, [filteredYearExpenses]);

  const yearTotal = filteredYearExpenses.reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0);

  function jumpToTemplate(id: number) {
    setHighlightedTemplateId(id);
    document.getElementById("recurring-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openDialog() {
    setIsDialogOpen(true);
    setReceiptFile(null);
    setUploadError("");
    setVendor("");
    setCategory(CATEGORIES[0]);
    setSubcontractorId("");
    setExcludeFromNetProfit(false);
    setBusinessLine(activeBusiness?.slug ?? undefined);
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploadError("");
    const fd = new FormData(e.currentTarget);

    try {
      const expense = await createMutation.mutateAsync({
        data: {
          description:    fd.get("description") as string,
          amount:         parseFloat(fd.get("amount") as string),
          category:       fd.get("category") as string,
          date:           fd.get("date") as string,
          vendor:         vendor.trim() || undefined,
          notes:          fd.get("notes") as string || undefined,
          jobId:          fd.get("jobId") ? parseInt(fd.get("jobId") as string) : undefined,
          subcontractorId: subcontractorId ? parseInt(subcontractorId) : undefined,
          excludeFromNetProfit,
          businessLine: businessLine || null,
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
      setSubcontractorId("");
      setExcludeFromNetProfit(false);
      setBusinessLine(activeBusiness?.slug ?? undefined);
      refetch();
    } catch {
      setUploadError("Failed to save expense. Please try again.");
    }
  };

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExpense.mutateAsync(deleteTarget.id);
      if (viewExpense?.id === deleteTarget.id) setViewExpense(null);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground mt-1">Track materials, tools, and subs with receipt documentation.</p>
        </div>
        {canEdit("expenses") && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border"
            >
              <Upload className="w-4 h-4 mr-2" /> Import
            </button>
            <button
              onClick={openDialog}
              className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
            >
              <Plus className="w-5 h-5 mr-2" /> Log Expense
            </button>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by description, vendor, or amount…"
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filterCategory && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-sm text-violet-800">
          <span className="font-semibold">Filtered by category:</span>
          <span className="font-bold">{filterCategory}</span>
          <button
            onClick={() => { setFilterCategory(""); window.history.replaceState({}, "", window.location.pathname); }}
            className="ml-auto flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-semibold"
          >
            Clear filter ×
          </button>
        </div>
      )}

      <Card className="border-border/50 shadow-md overflow-hidden bg-card">

        {/* ── Year tabs ─────────────────────────────────────────────────────── */}
        {allYears.length > 0 && (
          <div className="flex items-center gap-1 px-5 pt-4 pb-3 border-b border-border/50 overflow-x-auto">
            {allYears.map(year => (
              <button
                key={year}
                onClick={() => { setSelectedYear(year); setMonthCollapsed(initMonthCollapsed(year)); }}
                className={`flex-shrink-0 px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                  selectedYear === year
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}

        {/* ── Annual summary banner ──────────────────────────────────────────── */}
        {!isLoading && (
          <div className="px-6 py-2.5 border-b border-border/40 bg-muted/20 flex items-center gap-2 text-sm flex-wrap">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-bold text-foreground">{selectedYear}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {filteredYearExpenses.length}{searchQuery.trim() ? ` of ${yearExpenses.length}` : ""} {filteredYearExpenses.length === 1 ? "expense" : "expenses"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-foreground">{formatCurrency(yearTotal)} total</span>
            {filteredYearExpenses.some(e => e.category !== "mileage") && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground text-xs">
                  {formatCurrency(filteredYearExpenses.filter(e => e.category !== "mileage").reduce((s, e) => s + parseFloat(e.amount ?? "0"), 0))} excl. mileage
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Month sections ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="px-6 py-10 text-center text-muted-foreground animate-pulse text-sm">
            Loading expenses…
          </div>
        ) : monthlyGroups.length === 0 ? (
          <div className="px-6 py-14 text-center text-muted-foreground">
            {(searchQuery.trim() || filterCategory)
              ? <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
              : <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
            }
            <p className="text-sm">
              {(() => {
                const parts: string[] = [];
                if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
                if (filterCategory) parts.push(`category "${filterCategory}"`);
                return parts.length > 0
                  ? `No expenses in ${selectedYear} match ${parts.join(" + ")}`
                  : `No expenses logged for ${selectedYear}`;
              })()}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {monthlyGroups.map(({ key, expenses: monthExp, total: monthTotal, label }) => {
              const isCollapsed = monthCollapsed[key] !== false;
              return (
                <div key={key}>
                  {/* Month header */}
                  <div
                    className="flex items-center justify-between px-6 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                    onClick={() => toggleMonth(key)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isCollapsed
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        : <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      }
                      <span className="font-semibold text-sm text-foreground">{label}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                        {monthExp.length} {monthExp.length === 1 ? "expense" : "expenses"}
                      </span>
                    </div>
                    <span className="font-bold text-sm text-foreground ml-4 flex-shrink-0">
                      {formatCurrency(monthTotal)}
                    </span>
                  </div>

                  {/* Month table */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto custom-scrollbar border-t border-border/30">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-muted/40 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                          <tr>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Description / Vendor</th>
                            <th className="px-6 py-3">Category</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3 text-center">Receipt</th>
                            <th className="px-6 py-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {monthExp.map(exp => {
                            const isEditing = editingRow?.id === exp.id;
                            if (isEditing) {
                              return (
                                <tr key={exp.id} className="bg-amber-500/5 border-l-2 border-amber-500">
                                  <td className="px-3 py-2">
                                    <input type="date" value={editingRow.date}
                                      onChange={e => setEditingRow(r => r && ({ ...r, date: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400" />
                                  </td>
                                  <td className="px-3 py-2 space-y-1">
                                    <input type="text" value={editingRow.description}
                                      onChange={e => setEditingRow(r => r && ({ ...r, description: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400"
                                      placeholder="Description" />
                                    <VendorCombobox value={editingRow.vendor} onChange={v => setEditingRow(r => r && ({ ...r, vendor: v }))} />
                                  </td>
                                  <td className="px-3 py-2">
                                    <select value={editingRow.category}
                                      onChange={e => setEditingRow(r => r && ({ ...r, category: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none">
                                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="relative">
                                      <span className="absolute left-2 top-1.5 text-xs text-muted-foreground">$</span>
                                      <input type="number" step="0.01" min="0" value={editingRow.amount}
                                        onChange={e => setEditingRow(r => r && ({ ...r, amount: e.target.value }))}
                                        className="w-full pl-5 pr-2 py-1 text-xs text-right rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400" />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 space-y-1">
                                    {editReceiptFile ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-emerald-600 font-medium truncate max-w-[80px]" title={editReceiptFile.name}>{editReceiptFile.name}</span>
                                        <button type="button" onClick={() => { setEditReceiptFile(null); if (editReceiptInputRef.current) editReceiptInputRef.current.value = ""; }}
                                          className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                                      </div>
                                    ) : exp.receiptUrl ? (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <button type="button" onClick={() => {
                                          const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                                          const url = exp.receiptUrl.startsWith("http") ? exp.receiptUrl : `${base}${exp.receiptUrl}`;
                                          if (/\.pdf$/i.test(url.split("?")[0])) {
                                            window.open(url, "_blank", "noopener,noreferrer");
                                            return;
                                          }
                                          setEditLightboxImgError(false);
                                          setEditLightboxUrl(url);
                                        }} className="text-xs text-primary hover:underline flex items-center gap-1">
                                          <ImageIcon className="w-3 h-3" />View
                                        </button>
                                        <button type="button" onClick={() => editReceiptInputRef.current?.click()}
                                          className="text-xs text-muted-foreground hover:text-amber-500 flex items-center gap-1">
                                          <Upload className="w-3 h-3" />Replace
                                        </button>
                                        {googleConfigured && (
                                          <button type="button" onClick={handleDrivePickEdit} disabled={drivePickingEdit}
                                            className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 disabled:opacity-60">
                                            {drivePickingEdit ? (
                                              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <svg className="w-3 h-3" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                              </svg>
                                            )}
                                            Drive
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => editReceiptInputRef.current?.click()}
                                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                                          <Upload className="w-3 h-3" />Add Receipt
                                        </button>
                                        {googleConfigured && (
                                          <button type="button" onClick={handleDrivePickEdit} disabled={drivePickingEdit}
                                            className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-1 disabled:opacity-60">
                                            {drivePickingEdit ? (
                                              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                              <svg className="w-3 h-3" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                                                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                                                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                                                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                              </svg>
                                            )}
                                            Drive
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    <input ref={editReceiptInputRef} type="file" className="hidden"
                                      accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/gif,image/webp,image/bmp,image/tiff,.pdf"
                                      onChange={e => { const f = e.target.files?.[0]; if (f) setEditReceiptFile(f); }} />
                                    <input type="text" value={editingRow.notes}
                                      onChange={e => setEditingRow(r => r && ({ ...r, notes: e.target.value }))}
                                      className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-amber-400"
                                      placeholder="Notes" />
                                    <label className="flex items-center gap-1.5 cursor-pointer mt-1">
                                      <input
                                        type="checkbox"
                                        checked={editingRow.excludeFromNetProfit}
                                        onChange={e => setEditingRow(r => r && ({ ...r, excludeFromNetProfit: e.target.checked }))}
                                        className="w-3 h-3 accent-amber-500"
                                      />
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <EyeOff className="w-2.5 h-2.5" /> Write-off
                                      </span>
                                    </label>
                                    <div className="flex items-center gap-0.5 mt-1">
                                      {[
                                        { val: "", label: "—" },
                                        { val: "general_contracting", label: "GC" },
                                        { val: "asphalt_sealing", label: "AS" },
                                      ].map(({ val, label }) => (
                                        <button
                                          key={val}
                                          type="button"
                                          title={val === "" ? "Untagged" : val === "general_contracting" ? "General Contracting" : "Asphalt Sealing"}
                                          onClick={() => setEditingRow(r => r && ({ ...r, businessLine: val }))}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                            editingRow.businessLine === val
                                              ? val === "asphalt_sealing" ? "bg-amber-500 text-white" : val === "general_contracting" ? "bg-blue-600 text-white" : "bg-muted text-foreground"
                                              : "text-muted-foreground hover:bg-muted"
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                      <span className="text-[10px] text-muted-foreground ml-0.5">Line</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={async () => {
                                          await updateExpense.mutateAsync({
                                            id: editingRow.id,
                                            data: {
                                              description: editingRow.description,
                                              amount: parseFloat(editingRow.amount),
                                              date: editingRow.date,
                                              category: editingRow.category,
                                              vendor: editingRow.vendor || undefined,
                                              jobId: editingRow.jobId ? parseInt(editingRow.jobId) : undefined,
                                              notes: editingRow.notes || undefined,
                                              receiptUrl: exp.receiptUrl,
                                              excludeFromNetProfit: editingRow.excludeFromNetProfit,
                                              businessLine: editingRow.businessLine || null,
                                            },
                                          });
                                          if (editReceiptFile) {
                                            await uploadMutation.mutateAsync({ id: editingRow.id, data: { receipt: editReceiptFile } });
                                          }
                                          await qc.invalidateQueries({ queryKey: ["/api/expenses"] });
                                          if (editingRow.vendor.trim()) saveVendor.mutate(editingRow.vendor.trim());
                                          setEditReceiptFile(null);
                                          setEditingRow(null);
                                        }}
                                        disabled={updateExpense.isPending || uploadMutation.isPending}
                                        className="px-2 py-1 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors">
                                        {updateExpense.isPending || uploadMutation.isPending ? "…" : "Save"}
                                      </button>
                                      <button
                                        onClick={() => { setEditReceiptFile(null); setEditingRow(null); }}
                                        className="w-6 h-6 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={exp.id}
                                onClick={() => setViewExpense(exp)}
                                className="hover:bg-muted/30 transition-colors cursor-pointer group">
                                <td className="px-6 py-4 text-muted-foreground">{formatDate(exp.date)}</td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-foreground group-hover:text-primary transition-colors">{exp.description}</span>
                                    {exp.excludeFromNetProfit && (
                                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0">
                                        <EyeOff className="w-2.5 h-2.5" /> Write-off
                                      </span>
                                    )}
                                    {exp.recurringExpenseId && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); jumpToTemplate(exp.recurringExpenseId!); }}
                                        title="View recurring template"
                                        className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-blue-100 flex-shrink-0 hover:bg-blue-100 hover:border-blue-300 transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" /> Recurring ↓
                                      </button>
                                    )}
                                    {(exp as any).subcontractorName && exp.category?.toLowerCase() === "subcontractor" && (
                                      <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-indigo-100 flex-shrink-0">
                                        <HardHat className="w-2.5 h-2.5" /> Sub Payment
                                      </span>
                                    )}
                                  </div>
                                  {exp.vendor && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Store className="w-3 h-3" /> {exp.vendor}
                                    </div>
                                  )}
                                  {(exp as any).subcontractorName && (
                                    <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                      <HardHat className="w-3 h-3" /> {(exp as any).subcontractorName}
                                    </div>
                                  )}
                                  {(exp as any).jobTitle && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Briefcase className="w-3 h-3" /> {(exp as any).jobTitle}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${CATEGORY_COLORS[exp.category] ?? "bg-gray-100 text-gray-600"}`}>
                                    {exp.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right font-display font-semibold text-foreground">{formatCurrency(exp.amount)}</td>
                                <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                                  {exp.receiptUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => openReceiptLightbox(exp.receiptUrl)}
                                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors border border-primary/20 hover:border-primary/40"
                                    >
                                      <ImageIcon className="w-3 h-3" /> View
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">No receipt</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-2">
                                    <button onClick={() => setViewExpense(exp)}
                                      className="text-muted-foreground hover:text-primary transition-colors" title="View expense">
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    {canEdit("expenses") && (
                                      <>
                                        <button onClick={() => { setEditReceiptFile(null); setEditingRow({
                                            id: exp.id,
                                            description: exp.description ?? "",
                                            amount: String(exp.amount ?? ""),
                                            date: (exp.date ?? "").slice(0, 10),
                                            category: exp.category ?? CATEGORIES[0],
                                            vendor: exp.vendor ?? "",
                                            jobId: exp.jobId ? String(exp.jobId) : "",
                                            notes: exp.notes ?? "",
                                            excludeFromNetProfit: exp.excludeFromNetProfit ?? false,
                                            businessLine: exp.businessLine ?? "",
                                          }); }}
                                          className="text-muted-foreground hover:text-amber-500 transition-colors" title="Edit expense">
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setDeleteTarget(exp)}
                                          className="text-muted-foreground hover:text-destructive transition-colors" title="Delete expense">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recurring Expenses Section */}
      <div id="recurring-section">
        <RecurringSection
          jobs={jobs ?? []}
          highlightedTemplateId={highlightedTemplateId}
          onClearHighlight={() => setHighlightedTemplateId(null)}
        />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={open => {
        setIsDialogOpen(open);
        if (!open) {
          setReceiptFile(null);
          setPrefillAmount("");
          setPrefillDate("");
          setPrefillDesc("");
        }
      }}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Log Expense</DialogTitle>
          </DialogHeader>
          <form key={prefillKey} id="expense-form" onSubmit={handleSubmit} className="space-y-4 mt-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                  <input
                    name="amount" type="number" step="0.01" required min="0"
                    defaultValue={prefillAmount}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input
                  name="date" type="date" required defaultValue={prefillDate || localDateString()}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <input
                name="description" required
                defaultValue={prefillDesc}
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
                  onChange={e => {
                    const val = e.target.value;
                    setCategory(val);
                    if (val === "Owner Draw") setExcludeFromNetProfit(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
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

            {subs && subs.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                  <HardHat className="w-3.5 h-3.5 text-muted-foreground" />
                  Assign to Subcontractor
                  <span className="font-normal text-muted-foreground">(Optional)</span>
                </label>
                <select
                  value={subcontractorId}
                  onChange={e => setSubcontractorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— Not assigned —</option>
                  {subs.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.trade ? ` · ${s.trade}` : ""}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">This expense will appear in the subcontractor's portal and on the P&L.</p>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5">Only use this for payments <strong>not</strong> already recorded on a job card — recording both will double-count on the P&L and the sub's YTD.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <input
                name="notes"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Optional notes"
              />
            </div>

            {/* Business line toggle — hidden when a specific business is active (auto-assigned) */}
            {!activeBusiness && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Business Line <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
              <div className="flex flex-wrap items-center gap-1 p-0.5 bg-muted/50 rounded-lg border border-border w-fit">
                <button
                  type="button"
                  onClick={() => setBusinessLine(undefined)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    !businessLine
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Untagged
                </button>
                {businesses.map(b => (
                  <button
                    key={b.slug}
                    type="button"
                    onClick={() => setBusinessLine(b.slug)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      businessLine === b.slug
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
            )}

            {category === "Owner Draw" ? (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50/60">
                <div className="mt-0.5 flex-shrink-0 w-10 h-6 rounded-full relative bg-amber-500 opacity-70 cursor-not-allowed">
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow translate-x-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-amber-600" /> Always excluded from net profit
                  </p>
                  <p className="text-xs text-amber-700/70 mt-0.5">Owner draws are personal distributions — not a deductible business expense</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
                <button
                  type="button"
                  onClick={() => setExcludeFromNetProfit(v => !v)}
                  className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${excludeFromNetProfit ? "bg-amber-500" : "bg-muted-foreground/30"}`}
                  aria-pressed={excludeFromNetProfit}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${excludeFromNetProfit ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-amber-500" /> Exclude from net profit view
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Still counts for taxes — only hidden from the dashboard profit card</p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-dashed border-border">
              <label className="block text-sm font-medium mb-2 flex items-center gap-2 text-primary">
                <ImageIcon className="w-4 h-4" /> Receipt Photo / PDF
                <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </label>
              <ReceiptDropZone
                file={receiptFile}
                onFile={setReceiptFile}
                onClear={() => setReceiptFile(null)}
                showDrive={googleConfigured}
                onDriveClick={handleDrivePickNew}
                driveLoading={drivePickingNew}
              />
            </div>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </form>

          <div className="pt-4 border-t border-dashed border-border flex justify-end gap-3 flex-shrink-0">
            <button type="button" onClick={() => { setIsDialogOpen(false); setReceiptFile(null); }}
              className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              form="expense-form"
              disabled={createMutation.isPending || uploadMutation.isPending}
              className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md"
            >
              {createMutation.isPending || uploadMutation.isPending ? "Saving…" : "Save Expense"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense View Modal */}
      {viewExpense && (
        <ExpenseViewModal
          expense={viewExpense}
          onClose={() => setViewExpense(null)}
          onDelete={() => {
            setDeleteTarget(viewExpense);
            setViewExpense(null);
          }}
          onJumpToTemplate={id => { setViewExpense(null); jumpToTemplate(id); }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ExpenseDeleteConfirm
          expense={deleteTarget}
          deleting={deleting}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Import Dialog */}
      <ExpenseImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); refetch(); }}
      />

      {/* Edit-row receipt lightbox */}
      {editLightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setEditLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditLightboxUrl(null); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" /> Close
          </button>

          {/* Content */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            {/\.(heic|heif)$/i.test(editLightboxUrl) ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-white/30" />
                <p className="text-white font-semibold text-lg">iPhone Photo (HEIC)</p>
                <p className="text-white/60 text-sm">Cannot preview in browser</p>
                <a href={editLightboxUrl} download
                  className="inline-flex items-center gap-2 px-5 py-3 bg-white text-gray-900 rounded-xl font-semibold hover:bg-gray-100 transition-colors">
                  <Download className="w-4 h-4" /> Download Receipt
                </a>
              </div>
            ) : /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(editLightboxUrl) && !editLightboxImgError ? (
              <img
                src={editLightboxUrl}
                alt="Receipt"
                className="max-w-full max-h-full object-contain select-none"
                onClick={e => e.stopPropagation()}
                onError={() => setEditLightboxImgError(true)}
              />
            ) : /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(editLightboxUrl) && editLightboxImgError ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-red-300" />
                <p className="text-white font-semibold text-lg">Receipt no longer available</p>
                <p className="text-white/70 text-sm">This file was lost in a previous deployment.<br/>Please close and re-upload the receipt.</p>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 mx-4 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <Receipt className="w-16 h-16 text-white/30" />
                <div>
                  <p className="text-white font-semibold text-lg">Receipt PDF</p>
                  <p className="text-white/50 text-sm mt-1">Tap "Open PDF" to view in a new tab</p>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <a
                    href={editLightboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF
                  </a>
                  <a
                    href={editLightboxUrl}
                    download
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Bottom hint — safe area aware */}
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}

      {/* ── Quick Receipt Lightbox (from table "View" button) ──────────────── */}
      {receiptLightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setReceiptLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setReceiptLightboxUrl(null); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
            aria-label="Close"
          >
            <X className="w-4 h-4" /> Close
          </button>

          {/* Content */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            {receiptLightboxIsPdf ? (
              <div
                className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 mx-4 w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                <Receipt className="w-16 h-16 text-white/30" />
                <div>
                  <p className="text-white font-semibold text-lg">Receipt PDF</p>
                  <p className="text-white/50 text-sm mt-1">Tap "Open PDF" to view in a new tab</p>
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <a
                    href={receiptLightboxUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF
                  </a>
                  <a
                    href={receiptLightboxUrl}
                    download
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            ) : receiptLightboxImgError ? (
              <div className="flex flex-col items-center gap-3 text-center" onClick={e => e.stopPropagation()}>
                <ImageIcon className="w-16 h-16 text-red-300" />
                <p className="text-white font-semibold text-lg">Receipt no longer available</p>
                <p className="text-white/70 text-sm">Please close and re-upload the receipt.</p>
              </div>
            ) : (
              <img
                src={receiptLightboxUrl}
                alt="Receipt"
                className="max-w-full max-h-full object-contain select-none rounded-lg"
                onClick={e => e.stopPropagation()}
                onError={() => setReceiptLightboxImgError(true)}
              />
            )}
          </div>

          {/* Bottom hint */}
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}
    </div>
  );
}
