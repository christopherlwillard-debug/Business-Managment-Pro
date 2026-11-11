import { useState } from "react";
import { Calculator, Check, DollarSign, FileText, Layers, Briefcase, Mail, Edit2, Clock3 } from "lucide-react";
import "./_group.css";

const rows = [
  { status: "sent", date: "Mar 18, 2025", title: "Kitchen backsplash & counters", client: "Mara Ellison", type: "Kitchen Remodel", lines: [["Quartz countertop fabrication", "$3,840.00"], ["Backsplash tile installation", "$1,275.00"], ["Demolition & disposal", "$420.00"], ["", "+2 more items"]], total: "$7,860.00" },
  { status: "won", date: "Mar 16, 2025", title: "Guest bath refresh", client: "Daniel Cho", type: "Bathroom Remodel", lines: [["Vanity and fixture replacement", "$1,640.00"], ["Tile surround repair", "$2,180.00"]], total: "$5,920.00" },
  { status: "draft", date: "Mar 14, 2025", title: "Rear deck rebuild", client: "Nina Patel", type: "Deck Repair", lines: [["Remove existing deck boards", "$1,120.00"], ["Composite decking — materials", "$4,260.00"], ["Framing repairs", "$980.00"], ["", "+1 more items"]], total: "$8,475.00" },
  { status: "lost", date: "Mar 11, 2025", title: "Laundry room flooring", client: "Owen Brooks", type: "Flooring", lines: [["Subfloor preparation", "$480.00"], ["Porcelain tile installation", "$2,760.00"]], total: "$4,160.00" },
];
const statusClass: Record<string, string> = { draft: "bg-gray-100 text-gray-700", sent: "bg-blue-100 text-blue-700", won: "bg-emerald-100 text-emerald-700", lost: "bg-red-100 text-red-700" };

export function Current() {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? rows : rows.filter(row => row.status === filter);
  return (
    <main className="qcp-current min-h-[100dvh] bg-slate-50 p-4 sm:p-7">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quote Center</h1>
            <p className="mt-1 text-sm text-slate-500">Create service, maintenance, and project quotes in one place.</p>
          </div>
          <button className="flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-amber-600">
            <Calculator className="mr-2 h-4 w-4" /> Build Quote
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Estimate summary">
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Layers className="h-3 w-3" /> Total Estimates</p><p className="text-2xl font-bold">24</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><FileText className="h-3 w-3" /> Open / Sent</p><p className="text-2xl font-bold text-blue-600">11</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><Check className="h-3 w-3" /> Won</p><p className="text-2xl font-bold text-emerald-600">8</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-1 flex items-center gap-1 text-xs text-slate-500"><DollarSign className="h-3 w-3" /> Won Value</p><p className="text-xl font-bold text-emerald-600">$46,280.00</p></div>
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Quote filters">
          {["all", "draft", "sent", "won", "lost"].map(key => {
            const count = key === "all" ? 24 : key === "draft" ? 5 : key === "sent" ? 6 : key === "won" ? 8 : 5;
            return <button key={key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${filter === key ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{key === "all" ? `All (${count})` : `${key} (${count})`}</button>;
          })}
        </nav>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3" aria-label="Estimate cards">
          {filtered.map(row => <article key={row.title} className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex-1 p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${statusClass[row.status]}`}>{row.status}</span>
                <span className="text-xs text-slate-500">{row.date}</span>
              </div>
              <h2 className="mb-1 text-base font-bold leading-snug">{row.title}</h2>
              <p className="mb-1 text-sm text-slate-500">{row.client}</p>
              <div className="mt-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{row.type}</span></div>
              <div className="mt-3 space-y-0.5">{row.lines.map(([name, amount], i) => <div key={i} className="flex justify-between gap-3 text-xs text-slate-500"><span className={name ? "max-w-[70%] truncate" : "italic"}>{name}</span><span>{amount}</span></div>)}</div>
            </div>
            <div className="rounded-b-2xl border-t border-slate-200 bg-slate-50/70 px-5 py-3">
              <p className="text-xl font-bold">{row.total}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"><Edit2 className="h-3 w-3" /> Edit</button>
                <button className="flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"><FileText className="h-3 w-3" /> Customer Preview</button>
                <button className="flex items-center gap-1 rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50"><Mail className="h-3 w-3" /> Send Quote</button>
                <button className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"><Clock3 className="h-3 w-3" /> Quote History</button>
                {(row.status === "sent" || row.status === "won") && <button className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><Briefcase className="h-3 w-3" /> Convert to Job</button>}
              </div>
            </div>
          </article>)}
        </section>
        <p className="border-t border-slate-200 pt-3 text-[11px] text-slate-400">Current baseline · Source structure: Estimates.tsx · Quote history opens a revision timeline with provider acceptance and response events.</p>
      </div>
    </main>
  );
}
