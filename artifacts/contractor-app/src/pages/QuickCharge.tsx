import { useState, useEffect, useRef } from "react";
import {
  useListQuickCharges,
  useCreateQuickCharge,
  useDeleteQuickCharge,
  type QuickCharge,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import {
  Zap, Plus, Trash2, Copy, ExternalLink, QrCode,
  CheckCircle2, Clock, DollarSign, X,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getPayUrl(charge: QuickCharge): string | null {
  if (!charge.payToken) return charge.stripePaymentLinkUrl ?? null;
  return `${window.location.origin}${BASE}/pay/${charge.payToken}`;
}

function QrModal({ charge, onClose }: { charge: QuickCharge; onClose: () => void }) {
  const { toast } = useToast();
  const payUrl = getPayUrl(charge);

  function copyLink() {
    if (payUrl) {
      navigator.clipboard.writeText(payUrl);
      toast({ title: "Link copied!" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{charge.label}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-center text-2xl font-black text-amber-600 mb-4">
            {formatCurrency(charge.amount)}
          </p>

          {charge.qrCodeDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={charge.qrCodeDataUrl}
                alt="Payment QR Code"
                className="w-56 h-56 rounded-xl border border-gray-100 shadow-sm"
              />
              <p className="text-xs text-gray-500 text-center">Scan with your phone to pay — no account needed</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              QR code not available
            </div>
          )}

          <div className="mt-4 space-y-2">
            {payUrl && (
              <>
                <button
                  onClick={copyLink}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-xl font-semibold text-sm hover:bg-amber-600 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Payment Link
                </button>
                <a
                  href={payUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Payment Page
                </a>
              </>
            )}
          </div>

          {charge.customerName && (
            <p className="text-center text-xs text-gray-400 mt-3">For: {charge.customerName}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuickCharge() {
  const { data: charges = [], isLoading } = useListQuickCharges();
  const createMutation = useCreateQuickCharge();
  const deleteMutation = useDeleteQuickCharge();
  const { toast } = useToast();
  const prevChargeStatuses = useRef<Record<number, string>>({});

  useEffect(() => {
    if (!charges || !Array.isArray(charges)) return;
    const prev = prevChargeStatuses.current;
    const newlyPaid = charges.filter(
      (c) => c.status === "paid" && prev[c.id] !== undefined && prev[c.id] !== "paid",
    );
    if (newlyPaid.length > 0) {
      newlyPaid.forEach((c) => {
        toast({
          title: `"${c.label}" marked Paid`,
          description: c.paidAt ? "Stripe payment received." : "Status updated to paid.",
        });
      });
    }
    const next: Record<number, string> = {};
    charges.forEach((c) => { next[c.id] = c.status; });
    prevChargeStatuses.current = next;
  }, [charges, toast]);

  const [showForm, setShowForm] = useState(false);
  const [qrCharge, setQrCharge] = useState<QuickCharge | null>(null);
  const [form, setForm] = useState({
    label: "",
    amount: "",
    customerName: "",
    customerEmail: "",
    notes: "",
  });

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.label.trim()) {
      toast({ title: "Label is required", variant: "destructive" });
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    try {
      const payPageBaseUrl = `${window.location.origin}${BASE}/pay/`;
      const charge = await createMutation.mutateAsync({
        label: form.label.trim(),
        amount,
        customerName: form.customerName || null,
        customerEmail: form.customerEmail || null,
        notes: form.notes || null,
        payPageBaseUrl,
      });
      toast({ title: "Pay link created!" });
      setShowForm(false);
      setForm({ label: "", amount: "", customerName: "", customerEmail: "", notes: "" });
      setQrCharge(charge);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create charge";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <Zap className="w-7 h-7 text-amber-500" />
            Quick Charge
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate a payment link instantly — customers pay without creating an account
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-semibold text-sm hover:bg-amber-600 shadow transition-all"
        >
          <Plus className="w-4 h-4" />
          New Charge
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-amber-500 to-amber-400" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">New Quick Charge</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.label}
                  onChange={(e) => setField("label", e.target.value)}
                  placeholder="e.g. Crack fill deposit — Johnson property"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0.50"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="e.g. 250.00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setField("customerName", e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email</label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setField("customerEmail", e.target.value)}
                    placeholder="john@email.com"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Optional notes…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {createMutation.isPending ? (
                    <span>Creating…</span>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Create & Get Link
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {qrCharge && <QrModal charge={qrCharge} onClose={() => setQrCharge(null)} />}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading…
        </div>
      ) : charges.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
          <Zap className="w-10 h-10 opacity-30" />
          <p className="text-sm">No quick charges yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-amber-600 hover:underline font-medium"
          >
            Create your first charge
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {charges.map((c) => {
            const payUrl = getPayUrl(c);
            return (
              <Card key={c.id} className="border border-border hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{c.label}</p>
                      {c.customerName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{c.customerName}</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {(c.qrCodeDataUrl || payUrl) && (
                        <button
                          onClick={() => setQrCharge(c)}
                          className="p-1.5 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Show QR / payment link"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                        c.status === "paid"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                      }`}>
                        {c.status === "paid"
                          ? <><CheckCircle2 className="w-3 h-3" /> Paid</>
                          : <><Clock className="w-3 h-3" /> Pending</>
                        }
                      </span>
                      {c.status === "paid" && c.paidAt && (
                        <span className="text-[10px] text-emerald-600 font-medium pl-0.5">
                          {formatDate(c.paidAt)}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold text-foreground">
                      <DollarSign className="w-3.5 h-3.5 text-amber-500" />
                      {formatCurrency(c.amount)}
                    </span>
                  </div>

                  {payUrl && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(payUrl);
                          toast({ title: "Link copied!" });
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Link
                      </button>
                      <a
                        href={payUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {c.notes && (
                    <p className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-1">{c.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
