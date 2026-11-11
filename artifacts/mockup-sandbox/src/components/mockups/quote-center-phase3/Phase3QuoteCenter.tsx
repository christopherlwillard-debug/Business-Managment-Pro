import { useMemo, useState } from "react";
import { Archive, Bell, CalendarDays, ChevronDown, CircleCheck, Clock3, FileText, History, Plus, RotateCcw, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import "./_group.css";

type Quote = { id: string; title: string; customer: string; doc: string; decision: string; auth: string; follow: string; value: number; source: string; age: string; archived?: boolean; converted?: boolean; activity?: string[] };
const initialQuotes: Quote[] = [
  { id: "Q-248", title: "Kitchen backsplash & counters", customer: "Mara Ellison", doc: "Sent", decision: "Awaiting response", auth: "Not authorized", follow: "Due today", value: 7860, source: "Email · Mar 18", age: "3 days" },
  { id: "Q-247", title: "Guest bath refresh", customer: "Daniel Cho", doc: "Viewed", decision: "Accepted online", auth: "Not authorized", follow: "Apr 02", value: 5920, source: "Customer link · Mar 19", age: "2 days" },
  { id: "Q-245", title: "Deck rebuild — Cedar", customer: "Nina Patel", doc: "Sent", decision: "Accepted by phone", auth: "Authorized", follow: "Complete", value: 12840, source: "Phone · Mar 17", age: "4 days" },
  { id: "Q-244", title: "Laundry room flooring", customer: "Owen Brooks", doc: "Sent", decision: "Awaiting response", auth: "Not authorized", follow: "Mar 28", value: 4160, source: "Email · Mar 14", age: "7 days" },
  { id: "Q-241", title: "Fence repair & staining", customer: "Inez Walker", doc: "Draft", decision: "No response", auth: "Not authorized", follow: "—", value: 2380, source: "Draft · Mar 20", age: "1 day" },
  { id: "Q-238", title: "Front porch railing replacement", customer: "Cora James", doc: "Sent", decision: "Accepted by phone", auth: "Authorized", follow: "Complete", value: 9480, source: "Phone · Mar 11", age: "10 days", converted: true },
  { id: "Q-239", title: "Basement stair rail", customer: "Theo Martin", doc: "Sent", decision: "Declined", auth: "Not authorized", follow: "—", value: 1740, source: "Text · Mar 12", age: "9 days" },
];
const filters = ["All quotes", "Draft", "Sent / Awaiting Response", "Viewed / Awaiting Response", "Customer Accepted", "Authorized Work", "Declined", "Expired", "Follow-Ups Due", "Archived"];
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function Phase3QuoteCenter() {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [active, setActive] = useState("All quotes");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"response" | "authorize" | "reminder" | null>(null);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [toast, setToast] = useState("");
  const [method, setMethod] = useState("Phone");
  const [outcome, setOutcome] = useState("Customer accepted");
  const [actor, setActor] = useState("");
  const [reference, setReference] = useState("");
  const [responseTime, setResponseTime] = useState("2025-03-21T10:30");
  const [note, setNote] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const visible = useMemo(() => quotes.filter(q => {
    const matchFilter = active === "All quotes" || (active === "Draft" && q.doc === "Draft") || (active === "Sent / Awaiting Response" && q.doc === "Sent" && q.decision === "Awaiting response") || (active === "Viewed / Awaiting Response" && q.doc === "Viewed" && q.decision === "Awaiting response") || (active === "Customer Accepted" && q.decision.startsWith("Accepted")) || (active === "Authorized Work" && q.auth === "Authorized") || (active === "Declined" && q.decision === "Declined") || (active === "Expired" && q.decision === "Expired") || (active === "Follow-Ups Due" && (q.follow === "Due today" || q.age === "7 days")) || (active === "Archived" && q.archived);
    return matchFilter && (!search || `${q.title} ${q.customer} ${q.id}`.toLowerCase().includes(search.toLowerCase()));
  }), [quotes, active, search]);
  const totals = useMemo(() => ({
    potential: quotes.filter(q => !q.archived && q.decision !== "Declined" && !q.converted).reduce((s, q) => s + q.value, 0),
    accepted: quotes.filter(q => q.decision.startsWith("Accepted")).reduce((s, q) => s + q.value, 0),
    authorized: quotes.filter(q => q.auth === "Authorized").reduce((s, q) => s + q.value, 0),
    converted: quotes.filter(q => q.converted).reduce((s, q) => s + q.value, 0),
  }), [quotes]);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const update = (id: string, patch: Partial<Quote>) => {
    setQuotes(current => current.map(q => q.id === id ? { ...q, ...patch } : q));
    setSelected(current => current?.id === id ? { ...current, ...patch } : current);
  };

  function saveResponse() {
    if (!selected) return;
    const decision = outcome === "Customer accepted" ? `Accepted by ${method.toLowerCase()}` : outcome;
    const event = `${decision} · ${method} · ${responseTime.replace("T", " ")} · ${actor || "Staff"}${reference ? ` · Ref: ${reference}` : ""}${note ? ` · ${note}` : ""}`;
    update(selected.id, { decision, source: `${method} · Mar 21`, follow: "Complete", activity: [...(selected.activity ?? []), event] });
    setModal(null); setNote(""); flash("Response saved to quote history.");
  }
  function authorize() {
    if (!selected) return;
    update(selected.id, { auth: "Authorized", activity: [...(selected.activity ?? []), `Work authorization confirmed · ${note || "Recorded by staff"}`] });
    setModal(null); flash("Work authorization recorded separately.");
  }
  function saveReminder() {
    if (!selected) return;
    update(selected.id, { follow: customDate ? new Date(customDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Mar 27" });
    setModal(null); flash("Internal reminder schedule updated.");
  }
  function toggleArchive(q: Quote) {
    update(q.id, { archived: !q.archived });
    flash(q.archived ? "Quote restored; history retained." : "Quote archived; history retained.");
  }

  return (
    <main className="qcp-phase3 min-h-[100dvh] bg-[#f4f5f2]">
      <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-7 sm:py-7">
        <header className="mb-5 flex items-center justify-between border-b border-[#dce2e4] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#223b52] text-amber-300"><FileText className="h-5 w-5" /></div>
            <div><p className="display text-[11px] font-bold uppercase tracking-[.2em] text-[#788895]">BuildPro · Workspace</p><p className="text-sm font-semibold text-[#203244]">Estimates <span className="px-1 text-slate-300">/</span> Quote Center</p></div>
          </div>
          <button onClick={() => flash("This prototype uses static sample data.")} className="hidden items-center gap-2 rounded-lg border border-[#dce2e4] bg-white px-3 py-2 text-xs font-semibold text-[#425666] sm:flex"><Bell className="h-4 w-4" /> 2 reminders</button>
          <button onClick={() => flash("This prototype uses static sample data.")} aria-label="Notifications" className="rounded-lg border border-[#dce2e4] bg-white p-2 text-[#425666] sm:hidden"><Bell className="h-4 w-4" /></button>
        </header>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="display text-xs font-bold uppercase tracking-[.18em] text-[#b47716]">Phase 3 · Internal preview</p><h1 className="display mt-1 text-3xl font-bold tracking-tight text-[#203244]">Quote Center</h1><p className="mt-1 max-w-xl text-sm text-[#647482]">Know where every estimate stands—and whether you have permission to start.</p></div>
          <button onClick={() => flash("Quote creation remains in the existing Quote Center.")} className="flex items-center justify-center gap-2 rounded-lg bg-[#d9901d] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#bd7910]"><Plus className="h-4 w-4" /> Build Quote</button>
        </div>

        <section className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-label="Quote value summaries">
          {[["Potential", totals.potential, "Current revisions · excluding declined"], ["Customer accepted", totals.accepted, "Decision received"], ["Authorized work", totals.authorized, "Permission confirmed"], ["Converted jobs", totals.converted, "Moved into Jobs"]].map(([label, amount, detail], i) => <div key={label} className={`rounded-xl border border-[#dce2e4] bg-white p-3.5 sm:p-4 ${i === 2 ? "border-l-[3px] border-l-[#55745f]" : ""}`}><p className="text-[11px] font-semibold uppercase tracking-[.11em] text-[#768591]">{label}</p><p className="display mt-1 text-[22px] font-bold tracking-tight text-[#203244]">{money(amount as number)}</p><p className="mt-1 hidden text-[11px] text-[#84919a] sm:block">{detail}</p></div>)}
        </section>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#e7d6b3] bg-[#fbf5e9] px-3 py-2.5 text-xs text-[#70541e]"><ShieldCheck className="h-4 w-4 shrink-0" /><span><strong>Accepted ≠ authorized.</strong> Online acceptance records the customer’s decision only. Confirm permission separately before work begins.</span></div>

        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2 overflow-x-auto pb-1 lg:flex-wrap">
            {filters.map((f, i) => <button key={f} onClick={() => setActive(f)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${active === f ? "bg-[#223b52] text-white" : "border border-[#dce2e4] bg-white text-[#5d6d79] hover:bg-[#edf0ee]"}`}>{f}{i === 8 && <span className="ml-1 rounded-full bg-[#f4e5c9] px-1.5 py-0.5 text-[10px] text-[#8e641f]">2</span>}</button>)}
          </div>
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#dce2e4] bg-white px-3 py-2 lg:w-56"><Search className="h-4 w-4 shrink-0 text-[#87939b]" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search quotes" className="w-full bg-transparent text-xs outline-none placeholder:text-[#98a2a9]" /></label>
            <button onClick={() => flash("Showing all quote types.")} className="flex items-center gap-1.5 rounded-lg border border-[#dce2e4] bg-white px-3 py-2 text-xs font-semibold text-[#526370]"><SlidersHorizontal className="h-3.5 w-3.5" /><span className="hidden sm:inline">More filters</span><ChevronDown className="h-3 w-3" /></button>
          </div>
        </div>

        <div className="mb-2 hidden grid-cols-[minmax(190px,1.5fr)_110px_145px_132px_112px_88px_102px] gap-3 px-4 text-[10px] font-bold uppercase tracking-[.13em] text-[#84919a] xl:grid">
          <span>Estimate / customer</span><span>Document</span><span>Customer decision</span><span>Work authorization</span><span>Next follow-up</span><span className="text-right">Value</span><span className="text-right">Actions</span>
        </div>
        <section className="overflow-hidden rounded-xl border border-[#dce2e4] bg-white" aria-label="Quote list">
          {visible.map((q, index) => <article key={q.id} className={`border-b border-[#e8eceb] p-4 last:border-0 ${q.archived ? "bg-[#f8f8f5]" : ""}`}>
            <div className="grid gap-3 xl:grid-cols-[minmax(190px,1.5fr)_110px_145px_132px_112px_88px_102px] xl:items-center">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-[10px] font-bold tracking-wide text-[#9aa4aa]">{q.id}</span>{q.converted && <span className="rounded bg-[#e9f0eb] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#55745f]">Job created</span>}{q.archived && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">Archived</span>}</div><h2 className="mt-1 truncate text-sm font-bold text-[#203244]">{q.title}</h2><p className="mt-0.5 truncate text-xs text-[#73818c]">{q.customer}</p></div>
              <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Document</span><span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ${q.doc === "Viewed" ? "bg-[#e9eef4] text-[#465f78]" : q.doc === "Draft" ? "bg-[#f0f1ef] text-[#69747a]" : "bg-[#edf2f3] text-[#506a75]"}`}>{q.doc}</span></div>
              <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Decision</span><span className={`text-xs font-semibold ${q.decision.startsWith("Accepted") ? "text-[#52745a]" : q.decision === "Declined" ? "text-[#9b5b51]" : "text-[#65747e]"}`}>{q.decision}</span>{q.decision.startsWith("Accepted") && <p className="mt-0.5 text-[10px] text-[#8b979e]">{q.source}</p>}</div>
              <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Authorization</span>{q.auth === "Authorized" ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[#55745f]"><CircleCheck className="h-3.5 w-3.5" />Authorized</span> : <span className="rounded border border-[#e1e4e1] px-2 py-1 text-[10px] font-medium text-[#7f8a8f]">Not authorized</span>}</div>
              <div className="flex items-center gap-2 xl:block"><span className="w-24 text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Follow-up</span><span className={`text-xs ${q.follow === "Due today" ? "font-bold text-[#a96d14]" : "text-[#65747e]"}`}>{q.follow}</span></div>
              <div className="flex items-center justify-between gap-2 xl:block xl:text-right"><span className="text-[10px] font-semibold uppercase text-[#9aa4aa] xl:hidden">Current revision value</span><span className="display text-sm font-bold text-[#203244]">{money(q.value)}</span></div>
              <div className="flex flex-wrap gap-1.5 xl:justify-end">
                {!q.archived && q.decision === "Awaiting response" && <button onClick={() => { setSelected(q); setModal("response"); }} title="Record a customer response" className="rounded-md border border-[#dce2e4] p-1.5 text-[#647482] hover:bg-[#f4f5f2]"><FileText className="h-3.5 w-3.5" /></button>}
                {!q.archived && q.decision.startsWith("Accepted") && q.auth !== "Authorized" && <button onClick={() => { setSelected(q); setModal("authorize"); }} className="rounded-md border border-[#d5e1d7] px-2 py-1.5 text-[10px] font-bold text-[#55745f] hover:bg-[#edf3ee]">Authorize</button>}
                {!q.archived && q.auth === "Authorized" && !q.converted && <button onClick={() => { update(q.id, { converted: true }); flash("Job created from the authorized estimate."); }} className="rounded-md border border-[#d5e1d7] px-2 py-1.5 text-[10px] font-bold text-[#55745f] hover:bg-[#edf3ee]">Convert</button>}
                {!q.archived && <button onClick={() => { setSelected(q); setModal("reminder"); }} title="Schedule follow-up" className="rounded-md border border-[#dce2e4] p-1.5 text-[#647482] hover:bg-[#f4f5f2]"><CalendarDays className="h-3.5 w-3.5" /></button>}
                <button onClick={() => toggleArchive(q)} title={q.archived ? "Restore quote" : "Archive quote"} className="rounded-md border border-[#dce2e4] p-1.5 text-[#647482] hover:bg-[#f4f5f2]">{q.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>
                <button onClick={() => { setSelected(q); setHistoryOpen(true); }} title="View quote history" className="rounded-md border border-[#dce2e4] p-1.5 text-[#647482] hover:bg-[#f4f5f2]"><History className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {!q.archived && (q.follow === "Due today" || q.age === "7 days") && <div className="mt-3 flex items-center gap-2 rounded-md bg-[#fbf5e9] px-3 py-2 text-[11px] text-[#806128]"><Clock3 className="h-3.5 w-3.5" /><span><strong>{q.age} without a response.</strong> Internal follow-up reminder is due.</span><button onClick={() => { update(q.id, { follow: "Complete" }); flash("Follow-up marked complete."); }} className="ml-auto font-bold underline underline-offset-2">Complete</button></div>}
          </article>)}
          {visible.length === 0 && <div className="px-6 py-14 text-center"><Search className="mx-auto h-6 w-6 text-[#a1aaa9]" /><h3 className="mt-3 text-sm font-bold">No quotes match this view</h3><p className="mt-1 text-xs text-[#7c898f]">Try another filter or search term.</p><button onClick={() => { setActive("All quotes"); setSearch(""); }} className="mt-3 text-xs font-bold text-[#9d6817]">Clear filters</button></div>}
        </section>
        <footer className="mt-4 flex flex-col gap-1 border-t border-[#dce2e4] pt-3 text-[10px] leading-relaxed text-[#89949a] sm:flex-row sm:justify-between"><span>Reminder cadence: internal prompts after 3 and 7 days; custom schedule and completion supported.</span><span>Amounts reflect one current revision per estimate · static fictional data</span></footer>
        {toast && <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#223b52] px-4 py-3 text-xs font-semibold text-white shadow-lg">{toast}</div>}
      </div>
      {(modal || historyOpen) && <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#172633]/45 p-4" onClick={() => { setModal(null); setHistoryOpen(false); }}>
        <section role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-[#dce2e4] bg-white shadow-xl" onClick={e => e.stopPropagation()}>
          <header className="flex items-start justify-between border-b border-[#e5e9e7] px-5 py-4"><div><p className="display text-[10px] font-bold uppercase tracking-[.15em] text-[#aa741d]">Quote history · {selected?.id}</p><h2 className="mt-1 text-lg font-bold">{historyOpen ? "Activity timeline" : modal === "response" ? "Record customer response" : modal === "authorize" ? "Confirm work authorization" : "Schedule internal reminder"}</h2><p className="mt-0.5 text-xs text-[#78868f]">{selected?.title}</p></div><button onClick={() => { setModal(null); setHistoryOpen(false); }} aria-label="Close dialog" className="rounded-md p-1.5 text-[#71808a] hover:bg-[#f1f3f1]"><X className="h-4 w-4" /></button></header>
          <div className="space-y-4 px-5 py-4">
            {historyOpen ? <div className="space-y-3"><div className="border-l-2 border-[#d9901d] pl-3"><p className="text-xs font-bold">Quote revision sent · {selected?.source}</p><p className="mt-1 text-[11px] text-[#819099]">Email accepted by provider; delivery is not confirmed.</p></div><div className="border-l-2 border-[#dce2e4] pl-3"><p className="text-xs font-bold">Current revision · {money(selected?.value ?? 0)}</p><p className="mt-1 text-[11px] text-[#819099]">Revision value is frozen for this estimate summary.</p></div>{selected?.activity?.map((entry, i) => <div key={i} className="border-l-2 border-[#8aa28e] pl-3"><p className="text-xs font-bold">{entry}</p></div>)}{selected?.decision.startsWith("Accepted") && <div className="border-l-2 border-[#8aa28e] pl-3"><p className="text-xs font-bold">Customer decision · {selected.decision}</p><p className="mt-1 text-[11px] text-[#819099]">Decision does not grant permission to start work.</p></div>}</div> :
            modal === "response" ? <><div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-[#667680]">Response method<select value={method} onChange={e => setMethod(e.target.value)} className="mt-1 w-full rounded-md border border-[#dce2e4] bg-white px-2.5 py-2 text-xs"><option>Phone</option><option>Text</option><option>Email</option><option>In person</option><option>Other</option></select></label><label className="text-[11px] font-semibold text-[#667680]">Decision<select value={outcome} onChange={e => setOutcome(e.target.value)} className="mt-1 w-full rounded-md border border-[#dce2e4] bg-white px-2.5 py-2 text-xs"><option>Customer accepted</option><option>Declined</option><option>Requested changes</option></select></label></div><label className="block text-[11px] font-semibold text-[#667680]">Response time<input type="datetime-local" value={responseTime} onChange={e => setResponseTime(e.target.value)} className="mt-1 w-full rounded-md border border-[#dce2e4] px-2 py-2 text-xs" /></label><label className="block text-[11px] font-semibold text-[#667680]">Contact / actor<input value={actor} onChange={e => setActor(e.target.value)} placeholder="Customer or staff member" className="mt-1 w-full rounded-md border border-[#dce2e4] px-3 py-2 text-xs" /></label><label className="block text-[11px] font-semibold text-[#667680]">Reference (optional)<input value={reference} onChange={e => setReference(e.target.value)} placeholder="Email subject, message ID, or note reference" className="mt-1 w-full rounded-md border border-[#dce2e4] px-3 py-2 text-xs" /></label><label className="block text-[11px] font-semibold text-[#667680]">Notes<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What did the customer say?" className="mt-1 w-full resize-none rounded-md border border-[#dce2e4] px-3 py-2 text-xs" /></label><p className="rounded-md bg-[#f5f6f3] p-2.5 text-[10px] leading-relaxed text-[#73818a]">Recording acceptance captures a customer decision only. Work authorization is a separate confirmation.</p></> :
            modal === "authorize" ? <><div className="rounded-lg border border-[#e1eadf] bg-[#f3f7f2] p-3 text-xs leading-relaxed text-[#4c6652]"><strong>Separate confirmation required.</strong> Confirm the customer has explicitly authorized work—not just accepted the estimate.</div><label className="block text-[11px] font-semibold text-[#667680]">Confirmed by<input placeholder="Staff member" className="mt-1 w-full rounded-md border border-[#dce2e4] px-3 py-2 text-xs" /></label><label className="block text-[11px] font-semibold text-[#667680]">Authorization details<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="How and when was permission given?" className="mt-1 w-full resize-none rounded-md border border-[#dce2e4] px-3 py-2 text-xs" /></label></> :
            <><p className="text-xs text-[#6e7c85]">Schedule an internal reminder; this does not contact the customer.</p><div className="flex flex-wrap gap-2">{["In 3 days", "In 7 days"].map(v => <button key={v} onClick={() => setCustomDate(v === "In 3 days" ? "2025-03-24" : "2025-03-28")} className="rounded-md border border-[#dce2e4] px-3 py-2 text-xs font-semibold hover:bg-[#f3f4f1]">{v}</button>)}</div><label className="block text-[11px] font-semibold text-[#667680]">Custom date<input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="mt-1 w-full rounded-md border border-[#dce2e4] px-3 py-2 text-xs" /></label><button onClick={() => { update(selected!.id, { follow: "Complete" }); setModal(null); flash("Follow-up marked complete."); }} className="text-xs font-bold text-[#637a67] underline">Mark follow-up complete</button></>}
          </div>
          {!historyOpen && <footer className="flex justify-end gap-2 border-t border-[#e5e9e7] px-5 py-3"><button onClick={() => setModal(null)} className="rounded-md px-3 py-2 text-xs font-semibold text-[#667680] hover:bg-[#f2f3f1]">Cancel</button><button onClick={modal === "response" ? saveResponse : modal === "authorize" ? authorize : saveReminder} className="rounded-md bg-[#223b52] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#304e68]">{modal === "response" ? "Save response" : modal === "authorize" ? "Confirm authorization" : "Save reminder"}</button></footer>}
        </section>
      </div>}
    </main>
  );
}
