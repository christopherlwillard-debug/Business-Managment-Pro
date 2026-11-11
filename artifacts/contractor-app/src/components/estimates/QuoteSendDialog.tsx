import { useState } from "react";
import { Mail, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type SendResult = { status: "accepted" | "failed" | "unresolved"; revision: number; eventId: number; message: string };

export function QuoteSendDialog({
  estimate,
  recipient: initialRecipient,
  businessId,
  businessLine,
  onClose,
  onSent,
}: {
  estimate: { id: number; title: string; total: number };
  recipient: string;
  businessId?: number | null;
  businessLine?: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [recipient, setRecipient] = useState(initialRecipient);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const canRetry = result?.status === "failed";
  const validRecipient = recipient.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  async function send() {
    if (sending || result?.status === "accepted" || result?.status === "unresolved") return;
    if (!validRecipient) {
      setError("Enter a valid customer email address.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (businessId != null) params.set("businessId", String(businessId));
      else if (businessLine) params.set("businessLine", businessLine);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/api/estimates/${estimate.id}/send?${params.toString()}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ recipient: recipient.trim(), idempotencyKey }),
      });
      const body = await response.json().catch(() => null) as SendResult & { error?: string } | null;
      if (!response.ok && response.status !== 202 && response.status !== 502) {
        throw new Error(body?.error ?? "The quote could not be sent.");
      }
      if (!body || !["accepted", "failed", "unresolved"].includes(body.status)) {
        throw new Error("The server returned an unexpected send status.");
      }
      setResult(body);
      if (body.status === "accepted") onSent();
      if (body.status === "failed") setIdempotencyKey(crypto.randomUUID());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The quote could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="quote-send-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-amber-600" /><h2 id="quote-send-title" className="font-semibold text-slate-900">Send quote</h2></div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div><p className="font-semibold text-slate-900">{estimate.title}</p><p className="mt-1 text-sm text-slate-600">Quote total: {formatCurrency(estimate.total)}</p></div>
          <label className="block text-sm font-medium text-slate-700">Customer email
            <input type="email" required value={recipient} onChange={event => setRecipient(event.target.value)} disabled={sending || result?.status === "accepted" || result?.status === "unresolved"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-400" />
          </label>
          {result && <div className={`rounded-lg p-3 text-sm ${result.status === "accepted" ? "bg-emerald-50 text-emerald-800" : result.status === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
            <p className="font-semibold">{result.status === "accepted" ? `Email accepted for revision ${result.revision}` : result.status === "failed" ? "The email was rejected" : "Send needs attention"}</p>
            <p className="mt-1">{result.message}</p>
          </div>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {result?.status === "unresolved" && <p className="text-xs text-amber-800">Do not send again until the send history is reconciled.</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">{result?.status === "accepted" || result?.status === "unresolved" ? "Close" : "Cancel"}</button>
            {!result || canRetry ? <button onClick={send} disabled={sending || !validRecipient} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{sending ? "Sending…" : canRetry ? "Retry send" : "Send quote"}</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
