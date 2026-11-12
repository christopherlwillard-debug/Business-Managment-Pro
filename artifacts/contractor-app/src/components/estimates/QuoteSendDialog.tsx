import { useEffect, useState } from "react";
import { CheckCircle2, Download, Mail, RefreshCw, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type SendResult = { status: "accepted" | "failed" | "unresolved"; revision: number; eventId: number; message: string };
type PreparedQuote = {
  revisionEventId: number;
  revision: number;
  title: string;
  quoteNumber: string;
  total: number;
};

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
  const [preparing, setPreparing] = useState(true);
  const [prepared, setPrepared] = useState<PreparedQuote | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [sendBlocked, setSendBlocked] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const canRetry = result?.status === "failed";
  const validRecipient = recipient.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const params = new URLSearchParams();
    if (businessId != null) params.set("businessId", String(businessId));
    else if (businessLine) params.set("businessLine", businessLine);

    setPreparing(true);
    setPrepared(null);
    setPreviewError("");
    setReviewed(false);
    setNeedsRefresh(false);
    setSendBlocked(false);
    setError("");
    void (async () => {
      try {
        const prepareResponse = await fetch(`${base}/api/estimates/${estimate.id}/quote-preview?${params}`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const body = await prepareResponse.json().catch(() => null) as (PreparedQuote & { error?: string }) | null;
        if (!prepareResponse.ok || !body || typeof body.revisionEventId !== "number") {
          throw new Error(body?.error ?? "Could not prepare the quote PDF.");
        }
        if (cancelled) return;
        setPrepared(body);
        const pdfParams = new URLSearchParams(params);
        pdfParams.set("inline", "1");
        const pdfResponse = await fetch(
          `${base}/api/estimates/${estimate.id}/quote-events/${body.revisionEventId}/pdf?${pdfParams}`,
          { credentials: "include", headers: { Accept: "application/pdf" } },
        );
        if (!pdfResponse.ok) {
          const pdfError = await pdfResponse.json().catch(() => ({}));
          throw new Error(pdfError.error ?? "Could not load the prepared quote PDF.");
        }
        const pdf = await pdfResponse.blob();
        if (pdf.type && pdf.type !== "application/pdf") {
          throw new Error("The server did not return a valid PDF.");
        }
        if (cancelled) return;
        setPreviewUrl(URL.createObjectURL(pdf));
      } catch (err) {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : "Could not prepare the quote PDF.");
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [estimate.id, businessId, businessLine, refreshKey]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function send() {
    if (sending || result?.status === "accepted" || result?.status === "unresolved") return;
    if (!prepared || !previewUrl || !reviewed) {
      setError("Load and review the PDF before sending.");
      return;
    }
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
        body: JSON.stringify({ recipient: recipient.trim(), idempotencyKey, revisionEventId: prepared.revisionEventId }),
      });
      const body = await response.json().catch(() => null) as SendResult & { error?: string; code?: string } | null;
      if (!response.ok && response.status !== 202 && response.status !== 502) {
        if (response.status === 409) {
          setReviewed(false);
          setSendBlocked(true);
          setNeedsRefresh(body?.code === "stale_revision" || body?.code === "pricing_mismatch");
        }
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

  function downloadReviewedPdf() {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `${prepared?.quoteNumber ?? "quote"}-revision-${prepared?.revision ?? ""}.pdf`;
    link.click();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="quote-send-title">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-amber-600" /><h2 id="quote-send-title" className="font-semibold text-slate-900">Review quote before sending</h2></div>
            <p className="mt-1 text-xs text-slate-500">Nothing is emailed until you press Send quote below.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="min-h-[50vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {preparing ? <div className="grid h-full min-h-[50vh] place-items-center text-sm text-slate-600">Preparing the customer PDF…</div>
              : previewError ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                <p className="font-semibold">The quote PDF is not ready</p><p className="mt-1">{previewError}</p>
              </div>
                : previewUrl ? <iframe title={`Quote PDF preview: ${prepared?.title ?? estimate.title}`} src={previewUrl} className="h-[68vh] min-h-[50vh] w-full border-0" />
                  : <div className="grid h-full min-h-[50vh] place-items-center text-sm text-red-700">The PDF could not be loaded.</div>}
          </section>
          <section className="space-y-4">
            <div><p className="font-semibold text-slate-900">{prepared?.title ?? estimate.title}</p><p className="mt-1 text-sm text-slate-600">{prepared?.quoteNumber ?? "Customer quote"}{prepared ? ` · Revision ${prepared.revision}` : ""}</p><p className="mt-1 text-lg font-bold text-slate-900">Total: {formatCurrency(prepared?.total ?? estimate.total)}</p></div>
            <label className="block text-sm font-medium text-slate-700">Customer email
              <input type="email" required value={recipient} onChange={event => setRecipient(event.target.value)} disabled={sending || result?.status === "accepted" || result?.status === "unresolved"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
            {previewUrl && <button type="button" onClick={downloadReviewedPdf} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Download this PDF</button>}
            {needsRefresh && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              <p>The estimate changed after this PDF was prepared. Refresh and review the latest PDF before sending.</p>
              <button type="button" onClick={() => { setPrepared(null); setPreviewUrl(null); setResult(null); setIdempotencyKey(crypto.randomUUID()); setRefreshKey(value => value + 1); }} className="mt-2 inline-flex items-center gap-1 font-semibold"><RefreshCw className="h-3.5 w-3.5" />Refresh PDF</button>
            </div>}
            {previewUrl && !needsRefresh && !sendBlocked && <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} disabled={sending || result?.status === "accepted" || result?.status === "unresolved"} className="mt-0.5 accent-amber-600" />
              <span><span className="font-semibold">I reviewed this quote.</span> The email will include the PDF shown here.</span>
            </label>}
            {result && <div className={`rounded-lg p-3 text-sm ${result.status === "accepted" ? "bg-emerald-50 text-emerald-800" : result.status === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
              <p className="flex items-center gap-1 font-semibold">{result.status === "accepted" && <CheckCircle2 className="h-4 w-4" />}{result.status === "accepted" ? `Email accepted for revision ${result.revision}` : result.status === "failed" ? "The email was rejected" : "Send needs attention"}</p>
              <p className="mt-1">{result.message}</p>
            </div>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {result?.status === "unresolved" && <p className="text-xs text-amber-800">Do not send again until the send history is reconciled.</p>}
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">{result?.status === "accepted" || result?.status === "unresolved" ? "Close" : "Cancel"}</button>
          {(!result || canRetry) && <button onClick={send} disabled={sending || !prepared || !previewUrl || !reviewed || !validRecipient || needsRefresh || sendBlocked} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{sending ? "Sending…" : canRetry ? "Retry send" : "Send quote"}</button>}
          </div>
      </div>
    </div>
  );
}
