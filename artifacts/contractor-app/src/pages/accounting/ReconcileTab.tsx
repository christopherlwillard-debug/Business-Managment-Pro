import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, X, Eye, EyeOff, RefreshCw, Download,
  CheckCircle2, FileSpreadsheet, Trash2, Paperclip, Plus,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RECONCILE_BATCHES_API = `${BASE}/api/bank-reconciliation/batches`;
const RECONCILE_PARSE_API = `${BASE}/api/bank-reconciliation/parse`;
const RECONCILE_TX_API = `${BASE}/api/bank-reconciliation/transactions`;

interface ReconcileBatch {
  id: number;
  accountName: string;
  fileName: string | null;
  rowCount: number;
  importedAt: string;
  matched: number;
  ignored: number;
  unmatched: number;
  total: number;
}

interface ReconcileTx {
  id: number;
  importBatchId: number;
  date: string;
  description: string;
  amount: number;
  transactionType: string;
  status: string;
  matchedExpenseId: number | null;
  matchedInvoiceId: number | null;
  matchedOtherIncomeId: number | null;
  suggestedMatchType: string | null;
  suggestedMatchId: number | null;
}

interface ParsedPreviewRow {
  date: string;
  description: string;
  amount: number;
  transactionType: string;
  suggestedMatchType: string | null;
  suggestedMatchId: number | null;
}

interface ManualMatchCandidate {
  id: number;
  label: string;
  date: string;
  amount: number;
  type: "expense" | "invoice" | "other_income";
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ReconcileTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [fileFile, setFileFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedPreviewRow[] | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingTxId, setUpdatingTxId] = useState<number | null>(null);

  const [linkPanelTxId, setLinkPanelTxId] = useState<number | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<ManualMatchCandidate[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const { data: batches = [], isLoading: batchesLoading } = useQuery<ReconcileBatch[]>({
    queryKey: ["reconcile-batches"],
    queryFn: async () => {
      const r = await fetch(RECONCILE_BATCHES_API, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load batches");
      return r.json();
    },
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<ReconcileTx[]>({
    queryKey: ["reconcile-txs", selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return [];
      const r = await fetch(`${RECONCILE_BATCHES_API}/${selectedBatchId}/transactions`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load transactions");
      return r.json();
    },
    enabled: selectedBatchId !== null,
  });

  async function handleParseFile() {
    if (!fileFile) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", fileFile);
      const r = await fetch(RECONCILE_PARSE_API, { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error("Parse failed");
      const result = await r.json();
      setPreview(result.rows);
      setPreviewFileName(result.fileName);
    } catch {
      toast({ title: "Parse failed", description: "Could not read the file. Check that it is a CSV or Excel file with Date, Description, and Amount columns.", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveBatch() {
    if (!preview || !accountName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(RECONCILE_BATCHES_API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: accountName.trim(), fileName: previewFileName, transactions: preview }),
      });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "Import complete", description: `${preview.length} transactions imported.` });
      await qc.invalidateQueries({ queryKey: ["reconcile-batches"] });
      setImportOpen(false);
      setPreview(null);
      setFileFile(null);
      setAccountName("");
    } catch {
      toast({ title: "Import failed", description: "Could not save the batch.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBatch(id: number) {
    setDeletingId(id);
    try {
      await fetch(`${RECONCILE_BATCHES_API}/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Batch deleted" });
      await qc.invalidateQueries({ queryKey: ["reconcile-batches"] });
      if (selectedBatchId === id) setSelectedBatchId(null);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function patchTx(id: number, payload: Record<string, unknown>) {
    setUpdatingTxId(id);
    try {
      const r = await fetch(`${RECONCILE_TX_API}/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["reconcile-txs", selectedBatchId] });
      await qc.invalidateQueries({ queryKey: ["reconcile-batches"] });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setUpdatingTxId(null);
    }
  }

  async function openLinkPanel(tx: ReconcileTx) {
    if (linkPanelTxId === tx.id) { setLinkPanelTxId(null); return; }
    setLinkPanelTxId(tx.id);
    setLinkSearch("");
    setLinkLoading(true);
    setLinkCandidates([]);
    try {
      const candidates: ManualMatchCandidate[] = [];
      if (tx.transactionType === "debit") {
        const r = await fetch(`${BASE}/api/expenses`, { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          for (const e of (data.expenses ?? data)) {
            candidates.push({
              id: e.id,
              label: e.description || e.vendor || `Expense #${e.id}`,
              date: e.date ?? "",
              amount: parseFloat(e.amount ?? "0"),
              type: "expense",
            });
          }
        }
      } else {
        const [invR, oiR] = await Promise.all([
          fetch(`${BASE}/api/invoices`, { credentials: "include" }),
          fetch(`${BASE}/api/other-income`, { credentials: "include" }),
        ]);
        if (invR.ok) {
          const data = await invR.json();
          for (const inv of (data.invoices ?? data)) {
            if (inv.status !== "paid") continue;
            candidates.push({
              id: inv.id,
              label: `Invoice #${inv.invoiceNumber ?? inv.id} — ${inv.clientName ?? ""}`,
              date: inv.issueDate ?? "",
              amount: parseFloat(inv.total ?? "0"),
              type: "invoice",
            });
          }
        }
        if (oiR.ok) {
          const data = await oiR.json();
          for (const oi of (data.otherIncome ?? data)) {
            candidates.push({
              id: oi.id,
              label: oi.source || oi.description || `Income #${oi.id}`,
              date: oi.date ?? "",
              amount: parseFloat(oi.amount ?? "0"),
              type: "other_income",
            });
          }
        }
      }
      candidates.sort((a, b) => Math.abs(a.amount - tx.amount) - Math.abs(b.amount - tx.amount));
      setLinkCandidates(candidates);
    } catch {
      toast({ title: "Could not load records", variant: "destructive" });
    } finally {
      setLinkLoading(false);
    }
  }

  async function applyManualLink(tx: ReconcileTx, candidate: ManualMatchCandidate) {
    const payload =
      candidate.type === "expense" ? { matchedExpenseId: candidate.id } :
      candidate.type === "invoice" ? { matchedInvoiceId: candidate.id } :
      { matchedOtherIncomeId: candidate.id };
    await patchTx(tx.id, payload);
    setLinkPanelTxId(null);
  }

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  const statusColor: Record<string, string> = {
    matched: "text-emerald-600 bg-emerald-50",
    unmatched: "text-amber-600 bg-amber-50",
    ignored: "text-muted-foreground bg-muted/60",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bank Statement Reconciliation</h2>
          <p className="text-sm text-muted-foreground">Import CSV bank statements and match transactions to expenses and income.</p>
        </div>
        <button
          onClick={() => { setImportOpen(true); setPreview(null); setFileFile(null); setAccountName(""); }}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" /> Import Statement
        </button>
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-base">Import Bank Statement</h3>
              <button onClick={() => { setImportOpen(false); setPreview(null); setFileFile(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Account Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder="e.g. Chase Business Checking ****4523"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">CSV or Excel File</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => { setFileFile(e.target.files?.[0] ?? null); setPreview(null); }}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-colors"
                />
                <p className="text-xs text-muted-foreground">Supports: Chase, Bank of America, PNC, Fifth Third, and most standard CSV exports.</p>
              </div>

              {!preview && (
                <button
                  onClick={handleParseFile}
                  disabled={!fileFile || parsing}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {parsing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {parsing ? "Parsing…" : "Preview Transactions"}
                </button>
              )}

              {preview && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{preview.length} transactions found — review before importing</p>
                    <button
                      onClick={() => { setPreview(null); setFileFile(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Choose different file
                    </button>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Date</th>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Description</th>
                            <th className="px-2 py-2 text-right text-muted-foreground font-medium">Amount</th>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Type</th>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Auto-Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{row.date}</td>
                              <td className="px-2 py-1.5 max-w-[200px] truncate">{row.description}</td>
                              <td className={`px-2 py-1.5 text-right font-mono font-medium whitespace-nowrap ${row.transactionType === "credit" ? "text-emerald-600" : "text-foreground"}`}>
                                {row.transactionType === "credit" ? "+" : "-"}{formatCurrency(row.amount)}
                              </td>
                              <td className="px-2 py-1.5">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${row.transactionType === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                  {row.transactionType}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                {row.suggestedMatchType ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 className="w-3 h-3" />{row.suggestedMatchType} #{row.suggestedMatchId}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => { setImportOpen(false); setPreview(null); }}
                className="h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
              >
                Cancel
              </button>
              {preview && (
                <button
                  onClick={handleSaveBatch}
                  disabled={!accountName.trim() || saving}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {saving ? "Saving…" : "Save Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Import Batches</h3>
          {batchesLoading && <div className="text-sm text-muted-foreground animate-pulse p-2">Loading…</div>}
          {!batchesLoading && batches.length === 0 && (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">
              No batches yet. Import a statement to get started.
            </div>
          )}
          {batches.map(batch => (
            <div
              key={batch.id}
              onClick={() => setSelectedBatchId(batch.id === selectedBatchId ? null : batch.id)}
              className={`cursor-pointer rounded-lg border p-3 space-y-1 transition-colors ${selectedBatchId === batch.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{batch.accountName}</p>
                  <p className="text-xs text-muted-foreground truncate">{batch.fileName ?? "Imported"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(batch.importedAt).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteBatch(batch.id); }}
                  disabled={deletingId === batch.id}
                  className="text-muted-foreground hover:text-destructive transition-colors mt-0.5 flex-shrink-0"
                >
                  {deletingId === batch.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex gap-2 text-[10px] font-medium">
                <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{batch.matched} matched</span>
                <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{batch.unmatched} open</span>
                {batch.ignored > 0 && <span className="text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{batch.ignored} ignored</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="md:col-span-2">
          {!selectedBatchId && (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border rounded-xl text-center text-muted-foreground gap-2">
              <FileSpreadsheet className="w-8 h-8 opacity-30" />
              <p className="text-sm">Select a batch to review transactions</p>
            </div>
          )}

          {selectedBatchId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">
                  {selectedBatch?.accountName}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">{selectedBatch?.total} transactions</span>
                </h3>
              </div>

              {selectedBatch && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Debits</p>
                    <p className="font-mono font-semibold text-sm mt-0.5">
                      {formatCurrency(transactions.filter(t => t.transactionType === "debit").reduce((s, t) => s + t.amount, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Credits</p>
                    <p className="font-mono font-semibold text-sm mt-0.5 text-emerald-600">
                      {formatCurrency(transactions.filter(t => t.transactionType === "credit").reduce((s, t) => s + t.amount, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Matched / Open</p>
                    <p className="font-mono font-semibold text-sm mt-0.5">
                      {selectedBatch.matched} / {selectedBatch.unmatched}
                    </p>
                  </div>
                </div>
              )}

              {txLoading && <div className="text-sm text-muted-foreground animate-pulse p-4">Loading transactions…</div>}

              {!txLoading && transactions.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No transactions found.</div>
              )}

              {!txLoading && transactions.length > 0 && (() => {
                const grouped = transactions.reduce<Record<string, ReconcileTx[]>>((acc, tx) => {
                  const mo = tx.date.slice(0, 7);
                  if (!acc[mo]) acc[mo] = [];
                  acc[mo].push(tx);
                  return acc;
                }, {});
                const months = Object.keys(grouped).sort();
                const filteredCandidates = linkCandidates.filter(c => {
                  const q = linkSearch.toLowerCase();
                  return !q || c.label.toLowerCase().includes(q) || String(c.amount).includes(q);
                });
                return (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-[60vh]">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Date</th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Description</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Amount</th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Status</th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Match</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {months.map(mo => (
                            <>
                              <tr key={`mo-${mo}`} className="bg-muted/30 border-t border-border/50">
                                <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  {formatMonth(mo)}
                                  <span className="ml-2 font-normal normal-case">
                                    {grouped[mo].filter(t => t.status === "matched").length}/{grouped[mo].length} matched
                                  </span>
                                </td>
                              </tr>
                              {grouped[mo].map(tx => (
                                <>
                                  <tr key={tx.id} className={`border-t border-border/30 hover:bg-muted/20 ${tx.status === "ignored" ? "opacity-40" : ""}`}>
                                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">{tx.date}</td>
                                    <td className="px-3 py-2 max-w-[200px]">
                                      <span className="truncate block text-xs">{tx.description}</span>
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono text-xs font-medium whitespace-nowrap ${tx.transactionType === "credit" ? "text-emerald-600" : "text-foreground"}`}>
                                      {tx.transactionType === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor[tx.status] ?? ""}`}>
                                        {tx.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs">
                                      {tx.matchedExpenseId && <span className="text-emerald-600 text-[10px]">Expense #{tx.matchedExpenseId}</span>}
                                      {tx.matchedInvoiceId && <span className="text-blue-600 text-[10px]">Invoice #{tx.matchedInvoiceId}</span>}
                                      {tx.matchedOtherIncomeId && <span className="text-emerald-600 text-[10px]">Income #{tx.matchedOtherIncomeId}</span>}
                                      {!tx.matchedExpenseId && !tx.matchedInvoiceId && !tx.matchedOtherIncomeId && tx.suggestedMatchType && (
                                        <span className="text-amber-600 text-[10px]">Suggested: {tx.suggestedMatchType} #{tx.suggestedMatchId}</span>
                                      )}
                                      {!tx.matchedExpenseId && !tx.matchedInvoiceId && !tx.matchedOtherIncomeId && !tx.suggestedMatchType && (
                                        <span className="text-[10px] text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1 justify-end flex-wrap">
                                        {tx.status === "unmatched" && tx.suggestedMatchType && (
                                          <button
                                            onClick={() => {
                                              const payload =
                                                tx.suggestedMatchType === "expense" ? { matchedExpenseId: tx.suggestedMatchId } :
                                                tx.suggestedMatchType === "invoice" ? { matchedInvoiceId: tx.suggestedMatchId } :
                                                { matchedOtherIncomeId: tx.suggestedMatchId };
                                              patchTx(tx.id, payload);
                                            }}
                                            disabled={updatingTxId === tx.id}
                                            title="Accept suggested match"
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                            Accept
                                          </button>
                                        )}
                                        {tx.status === "unmatched" && (
                                          <button
                                            onClick={() => openLinkPanel(tx)}
                                            title="Manually link to existing record"
                                            className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium transition-colors ${linkPanelTxId === tx.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"}`}
                                          >
                                            <Paperclip className="w-3 h-3" />Link
                                          </button>
                                        )}
                                        {tx.status === "matched" && (
                                          <button
                                            onClick={() => patchTx(tx.id, { status: "unmatched", matchedExpenseId: null, matchedInvoiceId: null, matchedOtherIncomeId: null })}
                                            disabled={updatingTxId === tx.id}
                                            title="Clear match"
                                            className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                          </button>
                                        )}
                                        {tx.status === "unmatched" && tx.transactionType === "debit" && (
                                          <a
                                            href={`${BASE}/expenses?prefill_amount=${tx.amount}&prefill_date=${tx.date}&prefill_desc=${encodeURIComponent(tx.description)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            title="Create new expense from this transaction"
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                                          >
                                            <Plus className="w-3 h-3" />Expense
                                          </a>
                                        )}
                                        {tx.status !== "ignored" && (
                                          <button
                                            onClick={() => patchTx(tx.id, { status: "ignored" })}
                                            disabled={updatingTxId === tx.id}
                                            title="Ignore this transaction"
                                            className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                                          </button>
                                        )}
                                        {tx.status === "ignored" && (
                                          <button
                                            onClick={() => patchTx(tx.id, { status: "unmatched" })}
                                            disabled={updatingTxId === tx.id}
                                            title="Restore"
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                            Restore
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                  {linkPanelTxId === tx.id && (
                                    <tr key={`link-${tx.id}`} className="bg-primary/5 border-t border-primary/20">
                                      <td colSpan={6} className="px-4 py-3">
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2">
                                            <p className="text-xs font-medium text-foreground">
                                              Link to existing {tx.transactionType === "debit" ? "expense" : "invoice or income"} record
                                            </p>
                                            <button onClick={() => setLinkPanelTxId(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          <input
                                            type="text"
                                            value={linkSearch}
                                            onChange={e => setLinkSearch(e.target.value)}
                                            placeholder="Search by description or amount…"
                                            className="w-full h-8 px-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                                          />
                                          {linkLoading && <p className="text-xs text-muted-foreground animate-pulse">Loading records…</p>}
                                          {!linkLoading && filteredCandidates.length === 0 && (
                                            <p className="text-xs text-muted-foreground">No matching records found.</p>
                                          )}
                                          {!linkLoading && filteredCandidates.length > 0 && (
                                            <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto bg-background">
                                              {filteredCandidates.slice(0, 30).map(c => (
                                                <button
                                                  key={`${c.type}-${c.id}`}
                                                  onClick={() => applyManualLink(tx, c)}
                                                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/60 border-b border-border/50 last:border-0 text-left transition-colors"
                                                >
                                                  <span className="truncate max-w-[60%]">{c.label}</span>
                                                  <span className="flex items-center gap-2 text-muted-foreground flex-shrink-0 ml-2">
                                                    <span className="font-mono">{formatCurrency(c.amount)}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${c.type === "expense" ? "bg-red-50 text-red-600" : c.type === "invoice" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"}`}>
                                                      {c.type.replace("_", " ")}
                                                    </span>
                                                  </span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              ))}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
