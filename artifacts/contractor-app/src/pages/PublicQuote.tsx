import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, Download, FileText, Mail, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type PublicQuote = {
  quoteNumber: string;
  revision: number;
  title: string;
  issuedAt: string;
  expiresAt: string | null;
  customerName: string | null;
  workAddress: string | null;
  jobType: string | null;
  terms: string | null;
  items: Array<{ description: string; quantity: number; unit: string | null; amount: number }>;
  subtotal: number;
  adjustment: number;
  tax: number;
  total: number;
  brand: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null; email: string | null; website: string | null };
  logoUrl: string | null;
  response: { type: string; text: string | null; createdAt: string } | null;
};

const RESPONSE_LABELS: Record<string, string> = {
  approved: "You approved this quote",
  declined: "You declined this quote",
  changes_requested: "You requested changes",
};

export default function PublicQuote() {
  const [, params] = useRoute("/quote/:token");
  const token = params?.token ?? "";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [choice, setChoice] = useState<"approved" | "declined" | "changes_requested" | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}/api/public/quotes/${encodeURIComponent(token)}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      return await response.json() as PublicQuote;
    }).then(data => {
      if (!cancelled) setQuote(data);
    }).catch(() => {
      if (!cancelled) setUnavailable(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [base, token]);

  async function submitResponse() {
    if (!choice || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${base}/api/public/quotes/${encodeURIComponent(token)}/responses`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ type: choice, text: text.trim() || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Your response could not be saved.");
      }
      setQuote(current => current ? {
        ...current,
        response: { type: choice!, text: text.trim() || null, createdAt: new Date().toISOString() },
      } : current);
      setChoice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your response could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><p className="text-sm text-slate-600">Loading quote…</p></main>;
  }
  if (unavailable || !quote) {
    return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><section className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200"><FileText className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-semibold text-slate-900">Quote unavailable</h1><p className="mt-2 text-sm text-slate-600">This quote link may have expired or been replaced. Contact the contractor for help.</p></section></main>;
  }

  const brandAddress = [quote.brand.address, [quote.brand.city, quote.brand.state, quote.brand.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const pdfUrl = `${base}/api/public/quotes/${encodeURIComponent(token)}/pdf`;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-6 sm:px-9">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              {quote.logoUrl && <img src={`${base}${quote.logoUrl.replace(/^\/api/, "/api")}`} alt="" className="max-h-14 max-w-36 object-contain" />}
              <div>
                <p className="text-lg font-bold text-slate-900">{quote.brand.name}</p>
                {brandAddress && <p className="mt-1 text-xs text-slate-500">{brandAddress}</p>}
                {quote.brand.phone && <p className="text-xs text-slate-500">{quote.brand.phone}</p>}
              </div>
            </div>
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> View PDF
            </a>
          </div>
          <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Quote {quote.quoteNumber} · Revision {quote.revision}</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">{quote.title}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Prepared for {quote.customerName || "Customer"}
                {quote.workAddress ? ` · ${quote.workAddress}` : ""}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {quote.expiresAt ? `Valid through ${new Date(`${quote.expiresAt.slice(0, 10)}T12:00:00`).toLocaleDateString()}` : `Issued ${new Date(quote.issuedAt).toLocaleDateString()}`}
            </p>
          </div>
          {quote.jobType && <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{quote.jobType}</p>}
        </header>

        <section className="px-5 py-6 sm:px-9">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Scope of work</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {quote.items.map((item, index) => (
              <div key={`${item.description}-${index}`} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{item.description}</p>
                  {(item.quantity !== 1 || item.unit) && <p className="mt-1 text-xs text-slate-500">{item.quantity}{item.unit ? ` ${item.unit}` : ""}</p>}
                </div>
                <span className="shrink-0 font-medium text-slate-800">{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
          <div className="ml-auto mt-5 max-w-sm space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
            {quote.adjustment !== 0 && <div className="flex justify-between text-slate-600"><span>Adjustment</span><span>{formatCurrency(quote.adjustment)}</span></div>}
            {quote.tax !== 0 && <div className="flex justify-between text-slate-600"><span>Sales tax</span><span>{formatCurrency(quote.tax)}</span></div>}
            <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-950"><span>Total</span><span>{formatCurrency(quote.total)}</span></div>
          </div>
          {quote.terms && <div className="mt-7 rounded-xl bg-slate-50 p-4"><h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Terms & notes</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{quote.terms}</p></div>}
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-5 py-6 sm:px-9">
          {quote.response ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              {quote.response.type === "declined" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
              <div><p className="font-semibold">{RESPONSE_LABELS[quote.response.type] ?? "Response recorded"}</p>{quote.response.text && <p className="mt-1 whitespace-pre-wrap text-sm">{quote.response.text}</p>}</div>
            </div>
          ) : choice ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">{choice === "approved" ? "Approve this quote?" : choice === "declined" ? "Decline this quote?" : "Request changes"}</h2><button onClick={() => setChoice(null)} className="text-sm text-slate-500 underline">Cancel</button></div>
              {choice !== "approved" && <textarea value={text} onChange={event => setText(event.target.value)} maxLength={4000} rows={3} placeholder={choice === "declined" ? "Optional reason" : "Describe the changes you need"} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-amber-400" />}
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <button onClick={submitResponse} disabled={saving || (choice === "changes_requested" && !text.trim())} className="w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{saving ? "Submitting…" : "Confirm response"}</button>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-semibold text-slate-900">What would you like to do?</h2>
              <div className="grid gap-2 sm:grid-cols-3">
                <button onClick={() => setChoice("approved")} className="rounded-lg bg-emerald-700 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Approve quote</button>
                <button onClick={() => setChoice("changes_requested")} className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Request changes</button>
                <button onClick={() => setChoice("declined")} className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Decline</button>
              </div>
            </div>
          )}
          {quote.brand.email && <a href={`mailto:${quote.brand.email}`} className="mt-5 inline-flex items-center gap-2 text-sm text-slate-600 underline"><Mail className="h-4 w-4" /> Contact {quote.brand.name}</a>}
          <p className="mt-4 text-xs text-slate-500">Your online response records your choice for this quote revision. It does not authorize work.</p>
        </section>
      </article>
    </main>
  );
}
