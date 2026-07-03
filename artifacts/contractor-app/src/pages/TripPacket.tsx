import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, Download, Printer, MapPin, Calendar, Users, Briefcase,
  Receipt, ImageIcon, ClipboardCheck, FileText, CheckCircle2, Phone, Mail,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Keep in sync with the API's TRAVEL_CATEGORIES (lib/tripPacket.ts)
export const TRAVEL_CATEGORY_ORDER = ["Travel/Lodging", "Meals", "Parking/Tolls", "Fuel/Travel"];

interface PacketPhoto { url: string; rawPath: string; }
interface PacketExpense {
  id: number; description: string; amount: number; category: string; date: string;
  vendor: string | null; businessPurpose: string | null;
  receiptUrl: string | null; receiptRawPath: string | null;
}
interface PacketDailyLog {
  id: number; date: string; weather: string | null; crewCount: number | null;
  workCompleted: string | null; issues: string | null; materialsUsed: string | null;
  hoursWorked: string | null; notes: string | null; authorName: string | null;
  photos: PacketPhoto[];
}
interface PacketInvoice {
  id: number; invoiceNumber: string; status: string; issueDate: string;
  total: number; amountPaid: number | null; paidAt: string | null;
}
interface TripPacketData {
  generatedAt: string;
  companyName: string | null;
  job: {
    id: number; title: string; description: string | null; status: string;
    jobType: string | null; address: string | null; city: string | null; state: string | null;
    locationName: string | null; startDate: string | null; endDate: string | null; notes: string | null;
  };
  client: { name: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null } | null;
  crew: string[];
  travelExpenses: PacketExpense[];
  travelTotal: number;
  otherExpenses: { count: number; total: number };
  dailyLogs: PacketDailyLog[];
  finishedPhotos: PacketPhoto[];
  checklist: { templateName: string; completedItems: number; totalItems: number; percent: number } | null;
  invoices: PacketInvoice[];
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function servingUrl(u: string | null): string | null {
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return `${BASE}${u}`;
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-gray-300 print:break-inside-avoid">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50/60">
        <Icon className="w-4 h-4 text-blue-600" />
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function TripPacket() {
  const [, params] = useRoute("/trip-packet/:jobId");
  const jobId = params?.jobId;

  const { data, isLoading, error } = useQuery<TripPacketData>({
    queryKey: ["trip-packet", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/jobs/${jobId}/trip-packet`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trip packet");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center py-20">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 font-semibold">Couldn't load the trip packet for this job.</p>
        <Link href="/jobs" className="text-blue-600 text-sm font-semibold hover:underline mt-2 inline-block">Back to Jobs</Link>
      </div>
    );
  }

  const { job, client } = data;
  const jobLocation = [job.locationName, job.address, job.city, job.state].filter(Boolean).join(", ");
  const dates = [fmtDate(job.startDate), fmtDate(job.endDate)].filter(Boolean).join(" – ");

  const groups = new Map<string, PacketExpense[]>();
  for (const e of data.travelExpenses) {
    if (!groups.has(e.category)) groups.set(e.category, []);
    groups.get(e.category)!.push(e);
  }
  const orderedCategories = [
    ...TRAVEL_CATEGORY_ORDER.filter(c => groups.has(c)),
    ...Array.from(groups.keys()).filter(c => !TRAVEL_CATEGORY_ORDER.includes(c)),
  ];

  const totalInvoiced = data.invoices.reduce((s, i) => s + i.total, 0);
  const totalCollected = data.invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const receiptsAttached = data.travelExpenses.filter(e => e.receiptUrl).length;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4 print:p-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <button onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            <Printer className="w-4 h-4" /> Print
          </button>
          <a href={`${BASE}/api/jobs/${job.id}/trip-packet/pdf`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Download PDF
          </a>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 print:shadow-none print:border-gray-300">
        {data.companyName && (
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">{data.companyName}</p>
        )}
        <h1 className="text-2xl font-black text-gray-900">Trip Documentation Packet</h1>
        <p className="text-gray-600 font-medium mt-0.5">{job.title}</p>
        <p className="text-xs text-gray-400 mt-1">Generated {fmtDate(data.generatedAt)}</p>
        <p className="text-xs text-gray-500 mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          This packet ties every travel expense to the job it was for — who the customer was, where the work happened,
          what was done each day, and how the job was billed and paid. Keep it with your tax records.
        </p>
      </div>

      {/* Trip & Job Summary */}
      <Section icon={Briefcase} title="Trip & Job Summary">
        <div className="grid sm:grid-cols-2 gap-4">
          {client && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Customer</p>
              <p className="text-sm font-semibold text-gray-800">{client.name}</p>
              {(client.address || client.city) && (
                <p className="text-xs text-gray-500">{[client.address, client.city, client.state].filter(Boolean).join(", ")}</p>
              )}
              <div className="flex flex-wrap gap-3 mt-1">
                {client.phone && <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{client.phone}</span>}
                {client.email && <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{client.email}</span>}
              </div>
            </div>
          )}
          {jobLocation && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Job Location</p>
              <p className="text-sm font-semibold text-gray-800 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />{jobLocation}
              </p>
            </div>
          )}
          {dates && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Job Dates</p>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />{dates}
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Status</p>
            <p className="text-sm font-semibold text-gray-800 capitalize">{job.status}{job.jobType ? ` · ${job.jobType}` : ""}</p>
          </div>
          {data.crew.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Crew On This Job</p>
              <p className="text-sm font-semibold text-gray-800 flex items-start gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />{data.crew.join(", ")}
              </p>
            </div>
          )}
          {job.description && (
            <div className="sm:col-span-2">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Work Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
            </div>
          )}
        </div>
      </Section>

      {/* Travel Expenses */}
      <Section icon={Receipt} title="Travel Expenses">
        {data.travelExpenses.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No travel expenses are linked to this job yet. Link fuel, lodging, meal, and parking expenses to this job
            on the Expenses page and they'll show up here automatically.
          </p>
        ) : (
          <div className="space-y-4">
            {orderedCategories.map(cat => {
              const exps = groups.get(cat)!;
              const catTotal = exps.reduce((s, e) => s + e.amount, 0);
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{cat}</p>
                    <p className="text-xs font-bold text-gray-700">{money(catTotal)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {exps.map(e => (
                      <div key={e.id} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {fmtDate(e.date)}{e.vendor ? ` · ${e.vendor}` : ""} · {e.description}
                          </p>
                          {e.businessPurpose && (
                            <p className="text-xs text-gray-500 italic mt-0.5">Business purpose: {e.businessPurpose}</p>
                          )}
                          {e.receiptUrl ? (
                            <a href={servingUrl(e.receiptUrl)!} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline mt-0.5">
                              <ImageIcon className="w-3 h-3" /> View receipt
                            </a>
                          ) : (
                            <p className="text-[11px] text-gray-400 mt-0.5">No receipt attached</p>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{money(e.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Total travel expenses</p>
                <p className="text-[11px] text-gray-500">{receiptsAttached} of {data.travelExpenses.length} with receipts attached</p>
              </div>
              <p className="text-lg font-black text-blue-700">{money(data.travelTotal)}</p>
            </div>
          </div>
        )}
        {data.otherExpenses.count > 0 && (
          <p className="text-xs text-gray-500 mt-3 bg-gray-50 rounded-lg px-3 py-2">
            This job also has {data.otherExpenses.count} non-travel expense{data.otherExpenses.count === 1 ? "" : "s"} totaling {money(data.otherExpenses.total)} (materials, labor, etc.).
          </p>
        )}
      </Section>

      {/* Finished Photos */}
      {data.finishedPhotos.length > 0 && (
        <Section icon={ImageIcon} title="Finished Work Photos">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.finishedPhotos.map((p, i) => (
              <a key={i} href={servingUrl(p.url)!} target="_blank" rel="noopener noreferrer" className="block">
                <img src={servingUrl(p.url)!} alt={`Finished work ${i + 1}`} loading="lazy"
                  className="w-full h-28 object-cover rounded-xl border border-gray-200 hover:opacity-90 transition-opacity" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Daily Logs */}
      {data.dailyLogs.length > 0 && (
        <Section icon={FileText} title="Daily Logs — Work Performed On Site">
          <div className="space-y-4">
            {data.dailyLogs.map(log => (
              <div key={log.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                <p className="text-sm font-bold text-gray-800">
                  {fmtDate(log.date)}
                  {log.authorName ? ` · ${log.authorName}` : ""}
                  {log.crewCount != null ? ` · ${log.crewCount} crew` : ""}
                  {log.hoursWorked ? ` · ${log.hoursWorked} hrs` : ""}
                  {log.weather ? ` · ${log.weather}` : ""}
                </p>
                {log.workCompleted && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{log.workCompleted}</p>}
                {log.materialsUsed && <p className="text-xs text-gray-500 mt-1">Materials: {log.materialsUsed}</p>}
                {log.issues && <p className="text-xs text-gray-500 mt-1">Issues: {log.issues}</p>}
                {log.notes && <p className="text-xs text-gray-500 italic mt-1 whitespace-pre-wrap">{log.notes}</p>}
                {log.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {log.photos.map((p, i) => (
                      <a key={i} href={servingUrl(p.url)!} target="_blank" rel="noopener noreferrer">
                        <img src={servingUrl(p.url)!} alt={`Log photo ${i + 1}`} loading="lazy"
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Completion */}
      {data.checklist && (
        <Section icon={ClipboardCheck} title="Job Completion">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">{data.checklist.templateName}</p>
              <p className="text-xs text-gray-500">{data.checklist.completedItems} of {data.checklist.totalItems} items complete</p>
            </div>
            <div className="text-right">
              <p className={`text-xl font-black ${data.checklist.percent === 100 ? "text-emerald-600" : "text-amber-600"}`}>{data.checklist.percent}%</p>
            </div>
          </div>
          {data.checklist.percent === 100 && (
            <a href={`${BASE}/api/jobs/${job.id}/checklist/pdf`}
              className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:underline mt-2 print:hidden">
              <CheckCircle2 className="w-3.5 h-3.5" /> Download signed completion document (PDF)
            </a>
          )}
        </Section>
      )}

      {/* Invoices & Payments */}
      <Section icon={Receipt} title="Invoices & Payments Received">
        {data.invoices.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No invoices have been created for this job yet.</p>
        ) : (
          <div className="space-y-2">
            {data.invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">Invoice {inv.invoiceNumber}</p>
                  <p className="text-xs text-gray-500">Issued {fmtDate(inv.issueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{money(inv.total)}</p>
                  <p className={`text-[11px] font-bold uppercase ${inv.status === "paid" ? "text-emerald-600" : "text-gray-400"}`}>
                    {inv.status === "paid" ? `Paid${inv.paidAt ? " " + fmtDate(inv.paidAt) : ""}` : inv.status}
                  </p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
              <p className="font-semibold text-gray-600">Total invoiced: <span className="text-gray-900 font-bold">{money(totalInvoiced)}</span></p>
              <p className="font-semibold text-gray-600">Payments received: <span className="text-emerald-600 font-bold">{money(totalCollected)}</span></p>
            </div>
          </div>
        )}
      </Section>

      <p className="text-[11px] text-gray-400 text-center pb-6">
        Compiled from business records{data.companyName ? ` for ${data.companyName}` : ""}. Receipts, photos, daily logs,
        and invoices are stored in the job management system.
      </p>
    </div>
  );
}
