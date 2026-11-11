import { useMemo, useState } from "react";
import {
  Archive, CalendarDays, Check, CheckCircle2, Clock3, FileText, History,
  RotateCcw, Search, ShieldCheck, X,
} from "lucide-react";
import {
  useArchiveEstimateQuote,
  useCompleteEstimateQuoteFollowUp,
  useRecordEstimateWorkAuthorization,
  useRecordManualEstimateQuoteResponse,
  useRestoreEstimateQuote,
  useScheduleEstimateQuoteFollowUp,
  type Estimate,
  type EstimateQuoteCenterItem,
  type EstimateQuoteCenterSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getGetEstimateQuoteCenterQueryKey } from "@workspace/api-client-react";

type DialogKind = "response" | "authorize" | "schedule" | "complete" | null;
type QuoteItemFollowUp = EstimateQuoteCenterItem & {
  nextFollowUpEventId?: number | null;
  nextFollowUpSource?: "scheduled" | "three_day" | "seven_day" | null;
};
type Props = {
  items: EstimateQuoteCenterItem[];
  summary: EstimateQuoteCenterSummary | undefined;
  estimates: Estimate[];
  centerParams?: { businessId?: number; businessLine?: string };
  canEdit: boolean;
  onEdit: (estimate: Estimate) => void;
  onPreview: (estimate: Estimate) => void;
  onSend: (estimate: Estimate) => void;
  onHistory: (estimate: Estimate) => void;
  onConvert: (estimate: Estimate) => void;
  onDeposit: (estimate: Estimate) => void;
  onDeleteDraft: (estimate: Estimate) => void;
};

const fieldClass = "mt-1 w-full rounded-lg border border-[#d6dfe1] bg-white px-3 py-2.5 text-sm text-[#263d50] outline-none focus:border-[#d9901d] focus:ring-2 focus:ring-[#d9901d]/15";
const buttonClass = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d6dfe1] bg-white px-2.5 py-2 text-xs font-semibold text-[#526675] transition-colors hover:bg-[#f1f4f2] disabled:cursor-not-allowed disabled:opacity-50";
const makeKey = () => crypto.randomUUID();
const decisionLabel = (decision?: string | null) => ({
  approved: "Accepted online",
  declined: "Declined",
  changes_requested: "Changes requested",
}[decision ?? ""] ?? "Awaiting response");
const acceptanceMethodLabel = (method?: string | null) => ({
  online: "online",
  phone: "by phone",
  text: "by text",
  email: "by email",
  in_person: "in person",
  purchase_order: "by purchase order",
  other: "by documented communication",
}[method ?? ""] ?? "manually recorded");
const documentLabel = (status: string) => ({
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  expired: "Expired",
  archived: "Archived",
}[status] ?? status);

export function QuoteCenterBoard({
  items, summary, estimates, centerParams, canEdit, onEdit, onPreview, onSend,
  onHistory, onConvert, onDeposit, onDeleteDraft,
}: Props) {
  const qc = useQueryClient();
  const manualResponse = useRecordManualEstimateQuoteResponse();
  const authorization = useRecordEstimateWorkAuthorization();
  const scheduleFollowUp = useScheduleEstimateQuoteFollowUp();
  const completeFollowUp = useCompleteEstimateQuoteFollowUp();
  const archiveQuote = useArchiveEstimateQuote();
  const restoreQuote = useRestoreEstimateQuote();
  const mutationsPending = manualResponse.isPending || authorization.isPending
    || scheduleFollowUp.isPending || completeFollowUp.isPending
    || archiveQuote.isPending || restoreQuote.isPending;
  const [view, setView] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<EstimateQuoteCenterItem | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [method, setMethod] = useState("phone");
  const [outcome, setOutcome] = useState("approved");
  const [contactName, setContactName] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [authorizedConfirmed, setAuthorizedConfirmed] = useState(false);
  const [error, setError] = useState("");
  const estimatesById = useMemo(() => new Map(estimates.map(estimate => [estimate.id, estimate])), [estimates]);
  const visibleItems = useMemo(() => items.filter(item => {
    const isArchived = item.documentStatus === "archived";
    if ((view === "archived") !== isArchived) return false;
    const statusMatches = statusFilter === "all"
      || statusFilter === item.documentStatus
      || (statusFilter === "awaiting" && ["sent", "viewed"].includes(item.documentStatus) && !item.decision)
      || (statusFilter === "accepted" && item.decision === "approved")
      || (statusFilter === "declined" && item.decision === "declined")
      || (statusFilter === "authorized" && item.authorizationStatus === "authorized")
      || (statusFilter === "due" && item.followUpDue);
    if (!statusMatches) return false;
    const query = search.trim().toLowerCase();
    return !query || `${item.title} ${item.clientName ?? ""} ${item.estimateId}`.toLowerCase().includes(query);
  }), [items, view, statusFilter, search]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getGetEstimateQuoteCenterQueryKey(centerParams) }),
      qc.invalidateQueries({ queryKey: ["/api/estimates"] }),
      qc.invalidateQueries({ predicate: query => String(query.queryKey[0] ?? "").startsWith("/api/estimates/") && String(query.queryKey[0]).endsWith("/quote-events") }),
    ]);
  }

  function open(kind: DialogKind, item: EstimateQuoteCenterItem) {
    setSelected(item);
    setDialog(kind);
    setError("");
    setMethod("phone");
    setOutcome("approved");
    setContactName("");
    setReference("");
    setNote("");
    setFollowUpDate("");
    setAuthorizedConfirmed(false);
  }

  async function saveAction() {
    if (!selected) return;
    const followUpItem = selected as QuoteItemFollowUp;
    if (selected.revisionSnapshotId == null) {
      setError("This quote revision is not available for an update yet.");
      return;
    }
    setError("");
    try {
      if (dialog === "response") {
        await manualResponse.mutateAsync({
          id: selected.estimateId,
          data: {
            ...centerParams,
            revisionSnapshotId: selected.revisionSnapshotId,
            responseType: outcome as "approved" | "declined" | "changes_requested",
            method: method as "phone" | "text" | "email" | "in_person" | "other",
            contactName: contactName.trim() || null,
            responseText: note.trim() || null,
            reference: reference.trim() || null,
            idempotencyKey: makeKey(),
          },
        });
      } else if (dialog === "authorize") {
        if (!authorizedConfirmed) return;
        await authorization.mutateAsync({
          id: selected.estimateId,
          data: {
            ...centerParams,
            revisionSnapshotId: selected.revisionSnapshotId,
            confirmed: true,
            note: note.trim() || null,
            idempotencyKey: makeKey(),
          },
        });
      } else if (dialog === "schedule") {
        if (!followUpDate) return;
        await scheduleFollowUp.mutateAsync({
          id: selected.estimateId,
          data: {
            ...centerParams,
            revisionSnapshotId: selected.revisionSnapshotId,
            dueAt: new Date(followUpDate).toISOString(),
            method: method as "phone" | "text" | "email" | "in_person" | "other",
            note: note.trim() || null,
            idempotencyKey: makeKey(),
          },
        });
      } else if (dialog === "complete") {
        if (followUpItem.nextFollowUpEventId == null || followUpItem.nextFollowUpSource == null) {
          setError("This reminder cannot be completed because its event is unavailable.");
          return;
        }
        await completeFollowUp.mutateAsync({
          id: selected.estimateId,
          eventId: followUpItem.nextFollowUpEventId,
          data: {
            ...centerParams,
            source: followUpItem.nextFollowUpSource,
            method: method as "phone" | "text" | "email" | "in_person" | "other",
            note: note.trim() || null,
            idempotencyKey: makeKey(),
          },
        });
      }
      await refresh();
      setDialog(null);
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this quote update.");
    }
  }

  async function toggleArchive(item: EstimateQuoteCenterItem) {
    try {
      if (item.documentStatus === "archived") {
        await restoreQuote.mutateAsync({ id: item.estimateId, data: centerParams ?? {} });
      } else {
        await archiveQuote.mutateAsync({ id: item.estimateId, data: centerParams ?? {} });
      }
      await refresh();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update archive state.");
    }
  }

  const stageSummary = summary ? [
    { label: "Potential", value: summary.potentialValue, detail: "Current quote revisions" },
    { label: "Customer accepted", value: summary.acceptedValue, detail: "Decision recorded" },
    { label: "Authorized work", value: summary.authorizedValue, detail: "Permission confirmed", accent: true },
    { label: "Converted jobs", value: summary.convertedValue, detail: "Moved into Jobs" },
  ] : [];

  return (
    <section className="space-y-4" aria-label="Quote Center">
      {summary && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-label="Quote value summaries">
          {stageSummary.map(stage => (
            <article key={stage.label} className={`rounded-xl border border-[#dce2e4] bg-white p-3.5 sm:p-4 ${stage.accent ? "border-l-[3px] border-l-[#55745f]" : ""}`}>
              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#768591]">{stage.label}</p>
              <p className="mt-1 font-display text-xl font-bold tracking-tight text-[#203244]">{formatCurrency(stage.value)}</p>
              <p className="mt-1 hidden text-[10px] text-[#84919a] sm:block">{stage.detail}</p>
            </article>
          ))}
          <p className="col-span-2 text-[11px] text-[#7c898f] sm:col-span-4">Stage totals overlap; they are independent views of current frozen revision values, not additive.</p>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-[#e7d6b3] bg-[#fbf5e9] px-3 py-2.5 text-xs leading-relaxed text-[#70541e]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span><strong>Accepted ≠ authorized.</strong> Online approval records the customer’s decision only. Confirm permission separately before work begins.</span>
      </div>
      {error && !dialog && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          {(["active", "archived"] as const).map(value => (
            <button key={value} onClick={() => { setView(value); setStatusFilter("all"); }} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${view === value ? "bg-[#223b52] text-white" : "border border-[#dce2e4] bg-white text-[#5d6d79] hover:bg-[#edf0ee]"}`}>
              {value} <span className="ml-1 opacity-70">{value === "archived" ? summary?.archivedCount ?? 0 : summary?.totalQuotes ?? items.length - (summary?.archivedCount ?? 0)}</span>
            </button>
          ))}
          <select aria-label="Filter quotes by document status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-[#dce2e4] bg-white px-3 py-2 text-xs font-semibold text-[#526370]">
            <option value="all">All quote states</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="viewed">Viewed</option>
            <option value="expired">Expired</option>
            <option value="awaiting">Awaiting response</option>
            <option value="accepted">Customer accepted</option>
            <option value="declined">Declined</option>
            <option value="authorized">Authorized work</option>
            <option value="due">Follow-ups due</option>
            {view === "archived" && <option value="archived">Archived</option>}
          </select>
        </div>
        <label className="flex min-w-0 items-center gap-2 rounded-lg border border-[#dce2e4] bg-white px-3 py-2 lg:w-64">
          <Search className="h-4 w-4 shrink-0 text-[#87939b]" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search quotes or customers" className="w-full bg-transparent text-xs outline-none placeholder:text-[#98a2a9]" />
        </label>
      </div>

      <div className="hidden grid-cols-[minmax(180px,1.45fr)_92px_130px_120px_110px_100px_minmax(200px,1fr)] gap-3 px-4 text-[10px] font-bold uppercase tracking-[.12em] text-[#84919a] xl:grid">
        <span>Estimate / customer</span><span>Document</span><span>Customer decision</span><span>Authorization</span><span>Next follow-up</span><span className="text-right">Value</span><span className="text-right">Actions</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#dce2e4] bg-white">
        {visibleItems.map(item => {
          const followUpItem = item as QuoteItemFollowUp;
          const estimate = estimatesById.get(item.estimateId);
          const accepted = item.decision === "approved";
          const decision = item.decision === "approved"
            ? `Accepted ${acceptanceMethodLabel(item.decisionMethod)} — ${item.authorizationStatus === "authorized" ? "Authorized" : "Awaiting Work Authorization"}`
            : decisionLabel(item.decision);
          const followDate = item.nextFollowUpAt ? formatDate(item.nextFollowUpAt) : item.followUpDue ? "Due now" : "—";
          const isDraft = item.documentStatus === "draft";
          const pendingSchedule = followUpItem.nextFollowUpEventId != null && followUpItem.nextFollowUpSource != null && (item.followUpDue || item.nextFollowUpAt);
          return (
            <article key={item.estimateId} className={`border-b border-[#e8eceb] p-4 last:border-0 ${item.documentStatus === "archived" ? "bg-[#f8f8f5]" : ""}`}>
              <div className="grid gap-3 xl:grid-cols-[minmax(180px,1.45fr)_92px_130px_120px_110px_100px_minmax(200px,1fr)] xl:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-wide text-[#9aa4aa]">Q-{item.estimateId}</span>{item.jobId != null && <span className="rounded bg-[#e9f0eb] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#55745f]">Job created</span>}</div>
                  <h2 className="mt-1 truncate text-sm font-bold text-[#203244]">{item.title}</h2>
                  <p className="mt-0.5 truncate text-xs text-[#73818c]">{item.clientName || "No customer linked"} · Revision {item.revision}</p>
                </div>
                <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Document</span><span className="inline-flex rounded-md bg-[#edf2f3] px-2 py-1 text-[11px] font-semibold text-[#506a75]">{documentLabel(item.documentStatus)}</span></div>
                <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Decision</span><span className={`text-xs font-semibold ${accepted ? "text-[#52745a]" : item.decision === "declined" ? "text-[#9b5b51]" : "text-[#65747e]"}`}>{decision}</span></div>
                <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Authorization</span>{item.authorizationStatus === "authorized" ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[#55745f]"><CheckCircle2 className="h-3.5 w-3.5" />Authorized</span> : <span className="rounded border border-[#e1e4e1] px-2 py-1 text-[10px] font-medium text-[#7f8a8f]">Not authorized</span>}</div>
                <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Follow-up</span><span className={`text-xs ${item.followUpDue ? "font-bold text-[#a96d14]" : "text-[#65747e]"}`}>{followDate}</span></div>
                <div className="flex items-center justify-between gap-2 xl:block xl:text-right"><span className="text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Frozen revision</span><span className="font-display text-sm font-bold text-[#203244]">{formatCurrency(item.total)}</span></div>
                <div className="flex flex-wrap gap-1.5 xl:justify-end">
                  {estimate && <button onClick={() => onPreview(estimate)} className={buttonClass} title="Customer preview"><FileText className="h-3.5 w-3.5" /><span className="sr-only">Customer preview</span></button>}
                  {canEdit && estimate && <button onClick={() => onEdit(estimate)} className={buttonClass}>Edit</button>}
                  {canEdit && estimate && !isDraft && item.documentStatus !== "archived" && <button onClick={() => onSend(estimate)} className={buttonClass}>Send</button>}
                  {canEdit && estimate && accepted && item.documentStatus !== "archived" && item.authorizationStatus !== "authorized" && item.revisionSnapshotId != null && <button onClick={() => open("authorize", item)} className={`${buttonClass} border-[#d5e1d7] text-[#55745f]`}>Authorize</button>}
                  {canEdit && estimate && item.jobId == null && item.authorizationStatus === "authorized" && <button onClick={() => onConvert(estimate)} className={`${buttonClass} border-[#d5e1d7] text-[#55745f]`}>Convert to Job</button>}
                  {estimate && (estimate.businessLine === "asphalt_sealing" || estimate.jobType === "Asphalt Sealing") && ["sent", "won"].includes(estimate.status) && Number(estimate.total) > 0 && (estimate.depositPaidAt
                    ? <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Deposit received</span>
                    : canEdit && item.documentStatus !== "archived" && <button onClick={() => onDeposit(estimate)} className={buttonClass}>{estimate.squarePaymentLinkUrl || estimate.stripePaymentLinkUrl ? "Deposit link" : "Request deposit"}</button>)}
                  {canEdit && item.documentStatus !== "archived" && !isDraft && item.revisionSnapshotId != null && <button onClick={() => open("response", item)} className={buttonClass}>Record response</button>}
                  {canEdit && item.documentStatus !== "archived" && !isDraft && !item.decision && item.revisionSnapshotId != null && <button onClick={() => open("schedule", item)} className={buttonClass} title="Schedule internal follow-up"><CalendarDays className="h-3.5 w-3.5" /><span className="sr-only">Schedule follow-up</span></button>}
                  {canEdit && item.followUpDue && pendingSchedule && <button onClick={() => open("complete", item)} className={`${buttonClass} border-[#e7d6b3] text-[#926319]`}><Check className="h-3.5 w-3.5" />Complete</button>}
                  {canEdit && estimate && <button onClick={() => onHistory(estimate)} className={buttonClass} title="Quote history"><History className="h-3.5 w-3.5" /><span className="sr-only">Quote history</span></button>}
                  {canEdit && isDraft && estimate && <button onClick={() => onDeleteDraft(estimate)} className={`${buttonClass} text-[#9b5b51]`}>Delete draft</button>}
                  {canEdit && !isDraft && <button onClick={() => void toggleArchive(item)} disabled={mutationsPending} className={buttonClass} title={item.documentStatus === "archived" ? "Restore quote" : "Archive quote"}>{item.documentStatus === "archived" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}<span className="sr-only">{item.documentStatus === "archived" ? "Restore quote" : "Archive quote"}</span></button>}
                </div>
              </div>
              {item.followUpDue && item.documentStatus !== "archived" && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-[#fbf5e9] px-3 py-2 text-[11px] text-[#806128]">
                  <Clock3 className="h-3.5 w-3.5" /><span><strong>Follow-up due.</strong> Internal reminder only; no message is sent.</span>
                  {canEdit && pendingSchedule && <button onClick={() => open("complete", item)} className="ml-auto font-bold underline underline-offset-2">Complete reminder</button>}
                </div>
              )}
            </article>
          );
        })}
        {visibleItems.length === 0 && <div className="px-6 py-14 text-center"><Search className="mx-auto h-6 w-6 text-[#a1aaa9]" /><h3 className="mt-3 text-sm font-bold text-[#203244]">{search || statusFilter !== "all" ? "No quotes match this view" : `No ${view} quotes`}</h3><p className="mt-1 text-xs text-[#7c898f]">{search || statusFilter !== "all" ? "Try another filter or search term." : "Quotes will appear here as they are created."}</p>{(search || statusFilter !== "all") && <button onClick={() => { setSearch(""); setStatusFilter("all"); }} className="mt-3 text-xs font-bold text-[#9d6817]">Clear filters</button>}</div>}
      </div>
      <p className="text-[10px] leading-relaxed text-[#89949a]">Amounts use the backend’s frozen revision snapshots. Reminder scheduling and completion are internal only; no email or text is sent.</p>
      {dialog && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#172633]/45 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="quote-action-title" className="w-full max-w-md overflow-hidden rounded-xl border border-[#dce2e4] bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-[#e5e9e7] px-5 py-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#aa741d]">Quote · Q-{selected?.estimateId}</p><h2 id="quote-action-title" className="mt-1 text-lg font-bold text-[#203244]">{dialog === "response" ? "Record customer response" : dialog === "authorize" ? "Confirm work authorization" : dialog === "schedule" ? "Schedule internal follow-up" : "Complete follow-up"}</h2><p className="mt-0.5 text-xs text-[#78868f]">{selected?.title}</p></div>
              <button onClick={() => setDialog(null)} aria-label="Close dialog" className="rounded-md p-1.5 text-[#71808a] hover:bg-[#f1f3f1]"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-4 px-5 py-4">
              {dialog === "response" && <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[11px] font-semibold text-[#667680]">Method<select value={method} onChange={event => setMethod(event.target.value)} className={fieldClass}><option value="phone">Phone</option><option value="text">Text</option><option value="email">Email</option><option value="in_person">In person</option><option value="purchase_order">Purchase order</option><option value="other">Other</option></select></label>
                  <label className="text-[11px] font-semibold text-[#667680]">Decision<select value={outcome} onChange={event => setOutcome(event.target.value)} className={fieldClass}><option value="approved">Approved</option><option value="declined">Declined</option><option value="changes_requested">Changes requested</option></select></label>
                </div>
                <label className="block text-[11px] font-semibold text-[#667680]">Customer contact<input value={contactName} onChange={event => setContactName(event.target.value)} maxLength={200} placeholder="Name or role" className={fieldClass} /></label>
                <label className="block text-[11px] font-semibold text-[#667680]">Reference<input value={reference} onChange={event => setReference(event.target.value)} maxLength={500} placeholder="Email subject, message ID, or reference" className={fieldClass} /></label>
                <label className="block text-[11px] font-semibold text-[#667680]">Notes<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={4000} placeholder="What did the customer say?" className={fieldClass} /></label>
                <p className="rounded-md bg-[#f5f6f3] p-2.5 text-[10px] leading-relaxed text-[#73818a]">This records a response received outside the quote page. Online responses are preserved and are not rewritten.</p>
              </>}
              {dialog === "authorize" && <>
                <div className="rounded-lg border border-[#e1eadf] bg-[#f3f7f2] p-3 text-xs leading-relaxed text-[#4c6652]">
                  <strong>Review the accepted revision before authorizing work.</strong> Customer acceptance does not authorize work or create a job.
                </div>
                {selected && (() => {
                  const estimate = estimatesById.get(selected.estimateId);
                  return (
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[#dce2e4] bg-[#fafbf9] p-3 text-xs text-[#425666]">
                      <p><strong>Customer:</strong> {selected.clientName ?? "Not linked"}</p>
                      <p><strong>Work location:</strong> {selected.workAddress ?? "Not recorded"}</p>
                      <p><strong>Accepted revision:</strong> {selected.revision} · <strong>Total:</strong> {formatCurrency(selected.total)}</p>
                      <p><strong>Acceptance:</strong> {acceptanceMethodLabel(selected.decisionMethod)}{selected.decisionAt ? ` · ${formatDate(selected.decisionAt)}` : ""}{selected.decisionContact ? ` · ${selected.decisionContact}` : ""}</p>
                      <div>
                        <strong>Accepted scope:</strong>
                        {selected.acceptedScope?.length ? (
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {selected.acceptedScope.map((line, index) => (
                              <li key={`${line.description}-${index}`}>{line.quantity} {line.unit ?? ""} {line.description} — {formatCurrency(line.amount)}</li>
                            ))}
                          </ul>
                        ) : <p className="mt-1 text-[#7b8790]">No frozen line items were recorded.</p>}
                      </div>
                      <p><strong>Deposit:</strong> {estimate?.depositPaidAt ? `Paid${estimate.depositPaidAmount != null ? ` · ${formatCurrency(Number(estimate.depositPaidAmount))}` : ""}` : "Not recorded as paid"}</p>
                      <p><strong>Terms / conditions:</strong> {selected.terms ?? "None recorded"}</p>
                    </div>
                  );
                })()}
                <label className="block text-[11px] font-semibold text-[#667680]">Authorization details<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={4000} placeholder="How was permission explicitly given?" className={fieldClass} /></label>
                <label className="flex items-start gap-2 rounded-lg border border-[#dce2e4] p-3 text-xs leading-relaxed text-[#425666]"><input type="checkbox" checked={authorizedConfirmed} onChange={event => setAuthorizedConfirmed(event.target.checked)} className="mt-0.5 accent-[#55745f]" /><span>I confirm the customer explicitly authorized work for this quote revision.</span></label>
              </>}
              {dialog === "schedule" && <>
                <p className="text-xs leading-relaxed text-[#6e7c85]">Create an internal reminder. This does not contact the customer.</p>
                <label className="block text-[11px] font-semibold text-[#667680]">Follow-up date and time<input type="datetime-local" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} className={fieldClass} /></label>
                <label className="block text-[11px] font-semibold text-[#667680]">Planned method<select value={method} onChange={event => setMethod(event.target.value)} className={fieldClass}><option value="phone">Phone</option><option value="text">Text</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></select></label>
                <label className="block text-[11px] font-semibold text-[#667680]">Note<textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={4000} className={fieldClass} /></label>
              </>}
              {dialog === "complete" && <>
                <p className="text-xs leading-relaxed text-[#6e7c85]">Mark this internal reminder complete and record how it was handled. No email or text is sent.</p>
                <label className="block text-[11px] font-semibold text-[#667680]">Contact method<select value={method} onChange={event => setMethod(event.target.value)} className={fieldClass}><option value="phone">Phone</option><option value="text">Text</option><option value="email">Email</option><option value="in_person">In person</option><option value="other">Other</option></select></label>
                <label className="block text-[11px] font-semibold text-[#667680]">Completion note<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={4000} placeholder="Outcome or next step" className={fieldClass} /></label>
              </>}
              {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-[#e5e9e7] px-5 py-3">
              <button onClick={() => setDialog(null)} className="rounded-md px-3 py-2 text-xs font-semibold text-[#667680] hover:bg-[#f2f3f1]">Cancel</button>
              <button onClick={() => void saveAction()} disabled={mutationsPending || (dialog === "authorize" && !authorizedConfirmed) || (dialog === "schedule" && !followUpDate)} className="rounded-md bg-[#223b52] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#304e68] disabled:cursor-not-allowed disabled:opacity-50">
                {mutationsPending ? "Saving…" : dialog === "response" ? "Save response" : dialog === "authorize" ? "Confirm authorization" : dialog === "schedule" ? "Schedule follow-up" : "Complete follow-up"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
