import { Printer, X } from "lucide-react";
import type { Estimate } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

type CustomerQuoteView = {
  title: string;
  clientName: string | null;
  jobType: string | null;
  workAddress: string | null;
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
            <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
            <button type="button" aria-label="Close preview" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
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
      </div>
    </div>
  );
}
