import { useState, useRef, useCallback } from "react";
import { useListJobs } from "@workspace/api-client-react";
import {
  X, Upload, FileText, FileSpreadsheet, CheckCircle2,
  AlertCircle, Loader2, ChevronDown, Trash2, Receipt,
  Sparkles, TableProperties, CloudUpload,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api`;

const CATEGORIES = ["Materials", "Tools/Equipment", "Fuel/Travel", "Subcontractor", "Insurance", "Office/Admin", "Other"];

const CAT_COLORS: Record<string, string> = {
  "Materials":        "bg-amber-100 text-amber-700",
  "Tools/Equipment":  "bg-blue-100 text-blue-700",
  "Fuel/Travel":      "bg-green-100 text-green-700",
  "Subcontractor":    "bg-purple-100 text-purple-700",
  "Insurance":        "bg-cyan-100 text-cyan-700",
  "Office/Admin":     "bg-gray-100 text-gray-600",
  "Other":            "bg-orange-100 text-orange-700",
};

type Tab = "receipt" | "spreadsheet";

// ─── Drop Zone ────────────────────────────────────────────────────────────────
function DropZone({
  accept, onFile, label, sublabel, icon: Icon,
}: {
  accept: string; onFile: (f: File) => void;
  label: string; sublabel: string; icon: React.ElementType;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) onFile(f);
  };
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-2xl px-6 py-10 flex flex-col items-center gap-3 cursor-pointer transition-all select-none ${
        dragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/40"
      }`}
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icon className="w-7 h-7 text-primary" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{sublabel}</p>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 bg-primary/8 rounded-xl border border-primary/20">
        <CloudUpload className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-primary">Click to browse or drag & drop</span>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

// ─── Receipt (AI) Tab ─────────────────────────────────────────────────────────
function ReceiptTab({ onImported }: { onImported: () => void }) {
  const { data: jobs = [] } = useListJobs();
  const [phase, setPhase] = useState<"idle" | "parsing" | "review" | "saving" | "done">("idle");
  const [error, setError]   = useState("");
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState({
    description: "", vendor: "", amount: "", date: "", category: CATEGORIES[0], notes: "", jobId: "",
  });

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setPhase("parsing");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/expense-import/parse-receipt`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Parse failed");
      const data = await res.json();
      setForm({
        description: data.description ?? "",
        vendor:      data.vendor      ?? "",
        amount:      data.amount      ? String(data.amount) : "",
        date:        data.date        ?? new Date().toISOString().slice(0, 10),
        category:    CATEGORIES.includes(data.category) ? data.category : CATEGORIES[0],
        notes:       data.notes       ?? "",
        jobId:       "",
      });
      setPhase("review");
    } catch (err: any) {
      setError(err.message ?? "Failed to parse. Please fill in manually.");
      setPhase("idle");
    }
  }, []);

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount) return;
    setPhase("saving");
    try {
      await fetch(`${API}/expense-import/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenses: [{
            description: form.description,
            vendor:      form.vendor || undefined,
            amount:      parseFloat(form.amount),
            date:        form.date,
            category:    form.category,
            notes:       form.notes || undefined,
            jobId:       form.jobId || undefined,
          }],
        }),
      });
      setPhase("done");
      setTimeout(() => { setPhase("idle"); setForm({ description: "", vendor: "", amount: "", date: "", category: CATEGORIES[0], notes: "", jobId: "" }); onImported(); }, 1200);
    } catch {
      setError("Failed to save. Please try again.");
      setPhase("review");
    }
  };

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="font-bold text-foreground text-lg">Expense saved!</p>
      </div>
    );
  }

  if (phase === "parsing") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div className="text-center">
          <p className="font-bold text-foreground">AI is reading your receipt…</p>
          <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
        </div>
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (phase === "review" || phase === "saving") {
    const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-700 text-sm">
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">AI filled these fields from <span className="font-bold">{fileName}</span> — review and adjust before saving.</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <input type="number" step="0.01" value={form.amount} onChange={e => f("amount")(e.target.value)}
                className="w-full pl-7 pr-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Date *</label>
            <input type="date" value={form.date} onChange={e => f("date")(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Description *</label>
          <input value={form.description} onChange={e => f("description")(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Vendor</label>
            <input value={form.vendor} onChange={e => f("vendor")(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Category</label>
            <select value={form.category} onChange={e => f("category")(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Job (optional)</label>
            <select value={form.jobId} onChange={e => f("jobId")(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none text-sm">
              <option value="">— None —</option>
              {(jobs as any[]).map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Notes</label>
            <input value={form.notes} onChange={e => f("notes")(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button onClick={() => setPhase("idle")} disabled={phase === "saving"}
            className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            ← Try Another File
          </button>
          <button onClick={handleSave} disabled={!form.description.trim() || !form.amount || phase === "saving"}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow">
            {phase === "saving" ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save Expense"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-100 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <DropZone
        accept="image/*,.pdf"
        onFile={handleFile}
        icon={Receipt}
        label="Upload a receipt or invoice"
        sublabel="JPG, PNG, PDF — AI will auto-fill the expense fields"
      />
      <div className="text-center text-xs text-muted-foreground">
        Works with photos of paper receipts, digital receipts, and PDF invoices.
        <br />You can also upload files downloaded from Google Drive.
      </div>
    </div>
  );
}

// ─── Spreadsheet Tab ──────────────────────────────────────────────────────────
function SpreadsheetTab({ onImported }: { onImported: () => void }) {
  const { data: jobs = [] } = useListJobs();
  type Phase = "idle" | "parsing" | "preview" | "importing" | "done";
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError]   = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [jobId, setJobId] = useState("");
  const [count, setCount] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setPhase("parsing");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/expense-import/parse-spreadsheet`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Parse failed");
      const data = await res.json();
      setRows(data.rows ?? []);
      setSelected(new Set((data.rows ?? []).map((_: any, i: number) => i).filter((i: number) => data.rows[i]?.valid)));
      setPhase("preview");
    } catch (err: any) {
      setError(err.message ?? "Failed to parse spreadsheet.");
      setPhase("idle");
    }
  }, []);

  const toggle = (i: number) => setSelected(s => {
    const n = new Set(s);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const handleImport = async () => {
    const toImport = rows.filter((_, i) => selected.has(i)).map(r => ({ ...r, jobId: jobId || undefined }));
    if (!toImport.length) return;
    setPhase("importing");
    try {
      const res = await fetch(`${API}/expense-import/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: toImport }),
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      setCount(data.count);
      setPhase("done");
      setTimeout(() => { setPhase("idle"); setRows([]); setSelected(new Set()); onImported(); }, 1500);
    } catch {
      setError("Import failed. Please try again.");
      setPhase("preview");
    }
  };

  if (phase === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <p className="font-bold text-foreground text-lg">{count} expense{count !== 1 ? "s" : ""} imported!</p>
      </div>
    );
  }

  if (phase === "parsing" || phase === "importing") {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <TableProperties className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <div className="text-center">
          <p className="font-bold text-foreground">{phase === "parsing" ? "Reading your spreadsheet…" : "Importing expenses…"}</p>
          <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
        </div>
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (phase === "preview") {
    const selCount = selected.size;
    const total = rows.filter((_, i) => selected.has(i)).reduce((s, r) => s + (r.amount ?? 0), 0);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Found <span className="font-bold text-foreground">{rows.length}</span> rows in <span className="font-medium">{fileName}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set(rows.map((_, i) => i)))} className="text-xs text-primary hover:underline font-medium">Select all</button>
            <span className="text-muted-foreground">·</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:underline">None</button>
          </div>
        </div>

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-muted-foreground uppercase font-semibold sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Vendor</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((row, i) => (
                  <tr key={i}
                    onClick={() => toggle(i)}
                    className={`cursor-pointer transition-colors ${selected.has(i) ? "bg-primary/5" : "hover:bg-muted/30 opacity-50"}`}>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)}
                        onClick={e => e.stopPropagation()}
                        className="w-3.5 h-3.5 accent-primary" />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.date}</td>
                    <td className="px-3 py-2 font-medium text-foreground max-w-[120px] truncate">{row.description || <span className="italic text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[80px] truncate">{row.vendor || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CAT_COLORS[row.category] ?? "bg-gray-100 text-gray-600"}`}>
                        {row.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Allocate all to Job (optional)</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none text-sm">
            <option value="">— None (Overhead) —</option>
            {(jobs as any[]).map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between pt-1">
          <div className="text-sm text-muted-foreground">
            {selCount} selected · <span className="font-semibold text-foreground">{formatCurrency(total)}</span> total
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPhase("idle")} className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              ← Back
            </button>
            <button onClick={handleImport} disabled={selCount === 0}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 shadow">
              Import {selCount} Expense{selCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-100 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <DropZone
        accept=".xlsx,.xls,.csv,.ods,.numbers"
        onFile={handleFile}
        icon={FileSpreadsheet}
        label="Upload a spreadsheet"
        sublabel="Excel (.xlsx, .xls), CSV, or Numbers — bulk import multiple expenses"
      />
      <div className="bg-muted/40 rounded-xl p-4 text-xs text-muted-foreground space-y-1 border border-border/50">
        <p className="font-semibold text-foreground text-sm">Column tips</p>
        <p>The spreadsheet can have any column order. Common column names are auto-detected:</p>
        <div className="grid grid-cols-2 gap-x-4 mt-2">
          <div><span className="font-medium text-foreground">Date</span> — date, day, when</div>
          <div><span className="font-medium text-foreground">Amount</span> — amount, cost, total, $</div>
          <div><span className="font-medium text-foreground">Description</span> — desc, item, memo</div>
          <div><span className="font-medium text-foreground">Vendor</span> — vendor, merchant, payee</div>
          <div><span className="font-medium text-foreground">Category</span> — category, type, kind</div>
          <div><span className="font-medium text-foreground">Notes</span> — notes, comment</div>
        </div>
        <p className="mt-2 italic">Works with files exported from Google Sheets, QuickBooks, or any bank export.</p>
      </div>
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────
export function ExpenseImportDialog({
  open, onClose, onImported,
}: {
  open: boolean; onClose: () => void; onImported: () => void;
}) {
  const [tab, setTab] = useState<Tab>("receipt");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border shadow-2xl rounded-2xl flex flex-col"
        style={{ maxHeight: "92vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            <span className="font-bold text-foreground">Import Expenses</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-1 bg-muted/40 border-b border-border flex-shrink-0">
          <button
            onClick={() => setTab("receipt")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${
              tab === "receipt" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Receipt / PDF
            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">AI</span>
          </button>
          <button
            onClick={() => setTab("spreadsheet")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${
              tab === "spreadsheet" ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Spreadsheet / CSV
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "receipt"
            ? <ReceiptTab onImported={onImported} />
            : <SpreadsheetTab onImported={onImported} />
          }
        </div>
      </div>
    </div>
  );
}
