import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

type QuoteEvent = {
  id: number;
  estimateId: number;
  revision: number;
  eventType: string;
  status: string;
  recipient: string | null;
  actorName: string | null;
  requestedAt: string;
  completedAt: string | null;
  providerMessageId: string | null;
  responseType: string | null;
  responseText: string | null;
  responseAt: string | null;
  errorMessage: string | null;
};

export function QuoteHistoryPanel({
  estimate,
  businessId,
  businessLine,
  onClose,
}: {
  estimate: { id: number; title: string };
  businessId?: number | null;
  businessLine?: string | null;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<QuoteEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [messageIds, setMessageIds] = useState<Record<number, string>>({});
  const [threadIds, setThreadIds] = useState<Record<number, string>>({});
  const [savingEventId, setSavingEventId] = useState<number | null>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (businessId != null) params.set("businessId", String(businessId));
    else if (businessLine) params.set("businessLine", businessLine);
    fetch(`${base}/api/estimates/${estimate.id}/quote-events?${params.toString()}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not load quote history.");
      }
      return await response.json() as QuoteEvent[];
    }).then(data => {
      if (!cancelled) setEvents(data);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load quote history.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [base, estimate.id, businessId, businessLine, refreshKey]);

  async function reconcile(eventId: number) {
    const providerMessageId = messageIds[eventId]?.trim();
    if (!providerMessageId || savingEventId != null) return;
    setSavingEventId(eventId);
    setError("");
    try {
      const response = await fetch(`${base}/api/estimates/${estimate.id}/quote-events/${eventId}/reconcile`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          providerMessageId,
          providerThreadId: threadIds[eventId]?.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not reconcile the quote send.");
      }
      setMessageIds(current => ({ ...current, [eventId]: "" }));
      setThreadIds(current => ({ ...current, [eventId]: "" }));
      setRefreshKey(key => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reconcile the quote send.");
    } finally {
      setSavingEventId(null);
    }
  }

  const revisions = events.filter(event => event.eventType === "revision");

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="quote-history-title">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div><h2 id="quote-history-title" className="font-semibold text-slate-900">Quote history</h2><p className="mt-1 text-sm text-slate-600">{estimate.title}</p></div>
          <button onClick={onClose} aria-label="Close quote history" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </header>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
          {loading && <p className="text-sm text-slate-500">Loading history…</p>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {!loading && !error && revisions.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No sent quote history yet.</p>}
          {revisions.map(revision => {
            const related = events.filter(event => event.revision === revision.revision);
            const sends = related.filter(event => event.eventType === "send_attempt");
            const response = related.find(event => event.eventType === "response");
            const accepted = sends.some(event => event.status === "accepted");
            const currentStatus = response
              ? response.responseType === "approved" ? "Customer approved online" : response.responseType === "declined" ? "Customer declined" : "Customer requested changes"
              : accepted ? "Sent" : sends.some(event => event.status === "unresolved") ? "Needs reconciliation" : sends.some(event => event.status === "failed") ? "Send failed" : "Not sent";
            return (
              <article key={revision.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold text-slate-900">Revision {revision.revision}</p><p className="mt-1 text-sm text-slate-600">{currentStatus}</p></div>
                  {accepted && (
                    <a href={`${base}/api/estimates/${estimate.id}/quote-events/${revision.id}/pdf?${businessId != null ? `businessId=${businessId}` : `businessLine=${encodeURIComponent(businessLine ?? "")}`}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <Download className="h-3.5 w-3.5" /> Saved PDF
                    </a>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {sends.map(send => (
                    <div key={send.id}>
                      <p>{send.status === "accepted" ? "Email accepted by provider" : `Send ${send.status}`} · {send.recipient ?? "No recipient"} · {formatDate(send.requestedAt)}</p>
                      {send.status === "unresolved" && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs text-amber-900">If Gmail accepted this message, confirm it in Gmail and enter its message ID before activating the customer link.</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <input value={messageIds[send.id] ?? ""} onChange={event => setMessageIds(current => ({ ...current, [send.id]: event.target.value }))} placeholder="Gmail message ID" maxLength={500} className="min-w-0 rounded-md border border-amber-300 bg-white px-2.5 py-2 text-xs" />
                            <input value={threadIds[send.id] ?? ""} onChange={event => setThreadIds(current => ({ ...current, [send.id]: event.target.value }))} placeholder="Thread ID (optional)" maxLength={500} className="min-w-0 rounded-md border border-amber-300 bg-white px-2.5 py-2 text-xs" />
                          </div>
                          <button onClick={() => reconcile(send.id)} disabled={!messageIds[send.id]?.trim() || savingEventId != null} className="mt-2 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{savingEventId === send.id ? "Saving…" : "Confirm accepted"}</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {response && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-blue-900">{currentStatus}{response.responseText ? `: ${response.responseText}` : ""}</p>}
                </div>
              </article>
            );
          })}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      </section>
    </div>
  );
}
