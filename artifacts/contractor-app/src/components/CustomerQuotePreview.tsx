import { Download, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Estimate } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

type CustomerQuoteView = {
  title: string;
  clientName: string | null;
  jobType: string | null;
  workAddress: string | null;
  customerNotes: string | null;
  scope: Array<{ description: string; quantity: number; unit: string | null }>;
  tax: number;
  total: number;
};

export function buildCustomerQuoteView(estimate: Estimate): CustomerQuoteView {
  const items = estimate.lineItems ?? [];
  const tax = items
    .filter(item => item.category.trim().toLowerCase() === "tax")
    .reduce((sum, item) => sum + (item.total ?? 0), 0);
  return {
    title: estimate.title,
    clientName: estimate.clientName ?? null,
    jobType: estimate.jobType ?? null,
    workAddress: typeof estimate.workAddress === "string" ? estimate.workAddress : null,
    customerNotes: typeof estimate.customerNotes === "string" ? estimate.customerNotes : null,
    scope: items
      .filter(item => item.category.trim().toLowerCase() !== "tax")
      .map(({ description, quantity, unit }) => ({ description, quantity, unit: unit ?? null }))
      .filter(item => item.description.trim().length > 0),
    tax,
    total: estimate.total,
  };
}

export function CustomerQuotePreview({ estimate, onClose }: { estimate: Estimate; onClose: () => void }) {
  const quote = buildCustomerQuoteView(estimate);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const params = new URLSearchParams();
    if (typeof estimate.businessId === "number") params.set("businessId", String(estimate.businessId));
    else if (estimate.businessLine) params.set("businessLine", estimate.businessLine);
    setLoadingPdf(true);
    setDownloadError(null);
    try {
      void (async () => {
        try {
          const prepareResponse = await fetch(`${base}/api/estimates/${estimate.id}/quote-preview?${params}`, {
            method: "POST",
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const prepared = await prepareResponse.json().catch(() => null) as { revisionEventId?: number; error?: string } | null;
          if (!prepareResponse.ok || typeof prepared?.revisionEventId !== "number") {
            throw new Error(prepared?.error ?? "Could not prepare the quote PDF.");
          }
          const pdfParams = new URLSearchParams(params);
          pdfParams.set("inline", "1");
          const pdfResponse = await fetch(
            `${base}/api/estimates/${estimate.id}/quote-events/${prepared.revisionEventId}/pdf?${pdfParams}`,
            { credentials: "include", headers: { Accept: "application/pdf" } },
          );
          if (!pdfResponse.ok) {
            const body = await pdfResponse.json().catch(() => ({}));
            throw new Error(body.error ?? "Could not load the quote PDF.");
          }
          const pdf = await pdfResponse.blob();
          if (pdf.type && pdf.type !== "application/pdf") throw new Error("The server did not return a valid PDF.");
          if (!cancelled) setPreviewUrl(URL.createObjectURL(pdf));
        } catch (error) {
          if (!cancelled) setDownloadError(error instanceof Error ? error.message : "Could not prepare the quote PDF.");
        } finally {
          if (!cancelled) setLoadingPdf(false);
        }
      })();
    } catch (error) {
      if (!cancelled) {
        setDownloadError(error instanceof Error ? error.message : "Could not prepare the quote PDF.");
        setLoadingPdf(false);
      }
    }
    return () => { cancelled = true; };
  }, [estimate.id, estimate.businessId, estimate.businessLine]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const downloadPdf = () => {
    setDownloadError(null);
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `quote-${estimate.id}.pdf`;
    link.click();
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #customer-quote-document, #customer-quote-document * { visibility: visible !important; }
          #customer-quote-document { position: fixed; inset: 0; width: 100%; padding: 36px; background: white; color: #111827; }
          .quote-preview-controls { display: none !important; }
        }
      `}</style>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="quote-preview-controls flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900">Customer quote preview</h2>
            <p className="text-xs text-gray-500">Internal pricing details are hidden.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={downloadPdf} disabled={!previewUrl} className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Download className="h-4 w-4" /> Download branded PDF
            </button>
            <button type="button" aria-label="Close preview" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {loadingPdf
          ? <div className="grid h-[78vh] place-items-center text-sm text-gray-600">Preparing customer PDF…</div>
          : downloadError
            ? <p role="alert" className="mx-5 my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{downloadError}</p>
            : previewUrl && <iframe
                title={`Branded quote PDF preview: ${quote.title}`}
                src={previewUrl}
                className="h-[78vh] w-full border-0"
              />}
        {!downloadError && <>
        {/*
          The server-generated PDF is the source of truth for customer-visible pricing;
          the legacy HTML preview below is retained as an accessible text fallback.
        */}
        <article id="customer-quote-document" className="space-y-6 p-8">
          <header className="border-b border-gray-200 pb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600">Quote</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">{quote.title}</h1>
            {quote.clientName && <p className="mt-2 text-gray-700">Prepared for {quote.clientName}</p>}
            {quote.workAddress && <p className="mt-1 text-sm text-gray-500">{quote.workAddress}</p>}
            {quote.jobType && <p className="mt-3 text-sm text-gray-600">{quote.jobType}</p>}
          </header>
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Work included</h2>
            {quote.scope.length ? (
              <ul className="divide-y divide-gray-100">
                {quote.scope.map((item, index) => (
                  <li key={`${item.description}-${index}`} className="flex justify-between gap-4 py-3 text-sm">
                    <span>{item.description}</span>
                    <span className="shrink-0 text-gray-500">{item.quantity}{item.unit ? ` ${item.unit}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-500">Scope details will be confirmed with the customer.</p>}
          </section>
          {quote.customerNotes && (
            <section className="border-t border-gray-200 pt-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Notes and terms</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{quote.customerNotes}</p>
            </section>
          )}
          <section className="ml-auto max-w-sm space-y-2 border-t border-gray-200 pt-4">
            {quote.tax > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Sales tax</span><span>{formatCurrency(quote.tax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-3 text-lg font-bold text-gray-900">
              <span>Total quote</span><span>{formatCurrency(quote.total)}</span>
            </div>
          </section>
        </article>
        </>}
      </div>
    </div>
  );
}
