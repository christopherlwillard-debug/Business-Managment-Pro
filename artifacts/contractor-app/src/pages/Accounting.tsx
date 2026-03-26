import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, MapPin, Receipt,
  Navigation, HardHat, FileSpreadsheet, Printer, AlertCircle, CheckCircle2,
  Download, FileText, BarChart3, AlertTriangle, Calendar, ExternalLink,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Shield,
} from "lucide-react";
import { useScheduleCReport, useAllSubcontractorsPayments, useCreatePayment, useUpdatePayment, useDeletePayment, type Payment } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function downloadCSV(records: any[], year: number) {
  const headers = ["Invoice #", "Date", "Client", "City", "State", "Subtotal", "Tax Collected", "Total", "Status"];
  const rows = records.map((r: any) => [
    r.invoiceNumber ?? "",
    r.issueDate ?? "",
    r.clientName ?? "",
    r.city ?? "",
    r.state ?? "",
    r.subtotal?.toFixed(2) ?? "0.00",
    r.taxAmount?.toFixed(2) ?? "0.00",
    r.total?.toFixed(2) ?? "0.00",
    r.status ?? "",
  ]);
  const csvContent = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tax-records-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchAccounting(year: number) {
  const res = await fetch(`${BASE}/api/reports/accounting?year=${year}`);
  if (!res.ok) throw new Error("Failed to load accounting data");
  return res.json();
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <h2 className="text-lg font-display font-bold text-foreground">{title}</h2>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  "Materials": "bg-blue-100 text-blue-700",
  "Fuel": "bg-amber-100 text-amber-700",
  "Equipment": "bg-purple-100 text-purple-700",
  "Subcontractors": "bg-orange-100 text-orange-700",
  "Insurance": "bg-green-100 text-green-700",
  "Office": "bg-gray-100 text-gray-600",
  "Tools": "bg-red-100 text-red-700",
  "Other": "bg-slate-100 text-slate-600",
};

// ─── KY LLC Filing Calendar ────────────────────────────────────────────────

type FilingStatus = "not-filed" | "filed" | "na";

interface Filing {
  id: string;
  name: string;
  authority: string;
  dueDate: (year: number) => Date | null;
  dueDateLabel: (year: number) => string;
  fee: string;
  description: string;
  link: string;
  linkLabel: string;
  learnMore: string;
  penalty: string;
  conditional?: string;
}

const KY_FILINGS: Filing[] = [
  {
    id: "ky-annual-report",
    name: "KY Annual Report",
    authority: "KY Secretary of State",
    dueDate: (y) => new Date(y, 5, 30),
    dueDateLabel: (y) => `June 30, ${y}`,
    fee: "$15",
    description: "Annual LLC filing to keep your business in good standing with the state.",
    link: "https://sos.ky.gov",
    linkLabel: "sos.ky.gov",
    learnMore: "Every Kentucky LLC must file an Annual Report with the Secretary of State by June 30 each year. This report confirms your registered agent, principal office address, and members/managers. Failure to file can result in administrative dissolution of your LLC.",
    penalty: "Late or missing filings can result in administrative dissolution of your LLC and a $50+ late fee. A dissolved LLC loses liability protection.",
  },
  {
    id: "ky-llet-725",
    name: "LLET / Form 725",
    authority: "KY Dept. of Revenue",
    dueDate: (y) => new Date(y, 3, 15),
    dueDateLabel: (y) => `April 15, ${y}`,
    fee: "$175 minimum",
    description: "Kentucky Limited Liability Entity Tax — required for all LLCs doing business in KY.",
    link: "https://onestop.ky.gov",
    linkLabel: "Kentucky Online Gateway",
    learnMore: "The LLET is Kentucky's annual business privilege tax on LLCs. For a single-member LLC, you file Form 725. The tax is the greater of $175 or a percentage of gross receipts / gross profits. It is due the same day as your federal return (April 15 for calendar-year filers). If you need more time, you can pay the $175 minimum by April 15 and file an extension.",
    penalty: "Penalty of 2% per month (up to 20%) on unpaid tax, plus interest at 1% per month. Minimum $175 due even with no income.",
  },
  {
    id: "federal-1040",
    name: "Federal 1040 + Schedule C + SE",
    authority: "IRS",
    dueDate: (y) => new Date(y, 3, 15),
    dueDateLabel: (y) => `April 15, ${y}`,
    fee: "No state fee",
    description: "Personal income tax return including business profit/loss and self-employment tax.",
    link: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
    linkLabel: "IRS.gov / Schedule C",
    learnMore: "As a single-member LLC, you report your business income and expenses on Schedule C of your personal Form 1040. Self-employment tax (Social Security + Medicare, ~15.3%) is calculated on Schedule SE. The net profit from Schedule C flows to your 1040 as ordinary income. You may request a 6-month extension (Form 4868) by April 15, but any taxes owed must still be paid by April 15 to avoid penalties.",
    penalty: "Late filing: 5% of unpaid tax per month (max 25%). Late payment: 0.5% per month. Failure-to-pay interest accrues from due date.",
  },
  {
    id: "est-q1",
    name: "Quarterly Estimated Tax — Q1",
    authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y, 3, 15),
    dueDateLabel: (y) => `April 15, ${y}`,
    fee: "Pay estimated tax owed",
    description: "Q1 estimated payment covering Jan 1 – Mar 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es",
    linkLabel: "IRS.gov / 1040-ES",
    learnMore: "If you expect to owe $1,000 or more in federal income taxes after withholding, you must make quarterly estimated payments. Q1 covers January–March income. Use Form 1040-ES to calculate. You can pay online at IRS Direct Pay (no fee). As a rule of thumb, pay 25% of your prior year's total tax liability or 90% of current-year estimated tax.",
    penalty: "Underpayment penalty (typically ~8% annualized rate) on amounts underpaid, plus interest.",
  },
  {
    id: "est-q2",
    name: "Quarterly Estimated Tax — Q2",
    authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y, 5, 15),
    dueDateLabel: (y) => `June 15, ${y}`,
    fee: "Pay estimated tax owed",
    description: "Q2 estimated payment covering Apr 1 – May 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es",
    linkLabel: "IRS.gov / 1040-ES",
    learnMore: "Q2 covers April–May income and is due June 15. Note: this is a shorter payment period than Q1 or Q3. Use IRS Direct Pay or EFTPS to submit. Keep a record of each payment — you'll need these amounts when filing your return to claim credit for estimated taxes paid.",
    penalty: "Underpayment penalty on any shortfall, calculated from the due date of each installment.",
  },
  {
    id: "est-q3",
    name: "Quarterly Estimated Tax — Q3",
    authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y, 8, 15),
    dueDateLabel: (y) => `September 15, ${y}`,
    fee: "Pay estimated tax owed",
    description: "Q3 estimated payment covering Jun 1 – Aug 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es",
    linkLabel: "IRS.gov / 1040-ES",
    learnMore: "Q3 covers June–August income and is due September 15. This is often when contractors are at peak revenue — consider reviewing your YTD income and adjusting your payment upward if business has been strong to avoid an underpayment penalty at tax time.",
    penalty: "Underpayment penalty calculated from September 15 if payment was insufficient.",
  },
  {
    id: "est-q4",
    name: "Quarterly Estimated Tax — Q4",
    authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y + 1, 0, 15),
    dueDateLabel: (y) => `January 15, ${y + 1}`,
    fee: "Pay estimated tax owed",
    description: "Q4 estimated payment covering Sep 1 – Dec 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es",
    linkLabel: "IRS.gov / 1040-ES",
    learnMore: "Q4 covers September–December income and is due January 15 of the following year. You can skip the Q4 payment if you file your complete tax return and pay all taxes owed by January 31. This is a good time to do a year-end tax review and decide if you want to make any last-minute deductions (e.g., equipment purchases before Dec 31).",
    penalty: "Underpayment penalty from January 15 if payment was insufficient.",
  },
  {
    id: "owensboro-occ-license",
    name: "Owensboro Occ. License / Net Profit Return",
    authority: "City of Owensboro",
    dueDate: (y) => new Date(y, 3, 15),
    dueDateLabel: (y) => `April 15, ${y} (same as federal)`,
    fee: "$75 minimum or 1.39% of net profit",
    description: "Annual net profit return for work performed in Owensboro city limits.",
    link: "https://owensboro.org/city-services/finance/occupational-license/",
    linkLabel: "owensboro.org / Occ. License",
    learnMore: "If you performed work within the Owensboro city limits, you owe a local occupational tax on your net profit. The rate is 1.39% with a $75 annual minimum license fee. File the Net Profit Return each year by April 15. You can pay online or mail to the Owensboro Finance Department. Use the Income by City/Location report on this page to determine how much of your income was earned in Owensboro.",
    penalty: "Late filing penalty of 5% per month (max 25%) plus 1% interest per month on unpaid tax.",
  },
  {
    id: "ky-sales-use-tax",
    name: "KY Sales & Use Tax",
    authority: "KY Dept. of Revenue",
    dueDate: (_y) => null,
    dueDateLabel: (_y) => "Monthly or quarterly (if applicable)",
    fee: "6% of taxable sales",
    description: "Required only if you sell taxable goods or collect sales tax from customers.",
    link: "https://revenue.ky.gov/Business/Sales-Use-Tax/Pages/default.aspx",
    linkLabel: "KY Revenue / Sales Tax",
    learnMore: "Most contractor services are not subject to Kentucky sales tax. However, if you sell materials, equipment, or taxable goods directly to customers (rather than charging for services), you may need to collect and remit 6% KY sales tax. If you are collecting sales tax, you must register with the KY Department of Revenue and file returns monthly or quarterly. Check with your CPA if you're unsure whether your work involves taxable sales.",
    penalty: "Failure to collect/remit sales tax can result in back-taxes, penalties (2%/month up to 20%), interest, and personal liability.",
    conditional: "Only required if you sell taxable goods",
  },
  {
    id: "boi-report",
    name: "BOI Report (Beneficial Ownership)",
    authority: "FinCEN (Federal)",
    dueDate: (_y) => null,
    dueDateLabel: (_y) => "One-time (or within 30 days of change)",
    fee: "No fee",
    description: "One-time federal report of who owns and controls the business. Required for most LLCs.",
    link: "https://www.fincen.gov/boi",
    linkLabel: "fincen.gov/boi",
    learnMore: "Under the Corporate Transparency Act, most U.S. LLCs must file a Beneficial Ownership Information (BOI) report with FinCEN. For LLCs formed before January 1, 2024, the initial report was due by January 1, 2025. For new LLCs formed after January 1, 2024, the report is due within 90 days of formation. After filing, you must update the report within 30 days of any changes to ownership or contact information. Filing is free at the FinCEN portal.",
    penalty: "Civil penalties of $500/day per violation. Criminal penalties of up to $10,000 and 2 years imprisonment for willful violations.",
    conditional: "One-time filing — mark N/A once complete",
  },
  {
    id: "personal-property-tax",
    name: "Personal Property Tax Return",
    authority: "Daviess County PVA",
    dueDate: (y) => new Date(y, 4, 15),
    dueDateLabel: (y) => `May 15, ${y} (if applicable)`,
    fee: "Based on assessed value",
    description: "Annual return for business personal property (equipment, tools, vehicles) if applicable.",
    link: "https://www.daviesspva.org",
    linkLabel: "Daviess County PVA",
    learnMore: "If your business owns tangible personal property (tools, equipment, machinery, computers, furniture) valued above the threshold, you must file an annual Personal Property Tax Return with the Daviess County Property Valuation Administrator (PVA) by May 15. The PVA assesses the value and you'll receive a tax bill. Note: vehicles registered in your business name are typically assessed separately through the motor vehicle registration process.",
    penalty: "Late returns receive a 10% penalty on the assessed value. Failure to file can result in estimated assessment plus penalties.",
    conditional: "Only required if business owns tangible personal property",
  },
];

function getFilingStatusColor(filing: Filing, year: number, status: FilingStatus): string {
  if (status === "filed") return "bg-emerald-50 border-emerald-200";
  if (status === "na") return "bg-muted/30 border-border";
  const due = filing.dueDate(year);
  if (!due) return "bg-card border-border";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "bg-red-50 border-red-200";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  if (due <= soon) return "bg-amber-50 border-amber-200";
  return "bg-card border-border";
}

function getFilingDueDateStyle(filing: Filing, year: number, status: FilingStatus): string {
  if (status === "filed" || status === "na") return "text-muted-foreground";
  const due = filing.dueDate(year);
  if (!due) return "text-muted-foreground";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "text-red-600 font-semibold";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  if (due <= soon) return "text-amber-600 font-semibold";
  return "text-foreground";
}

function getFilingDueBadge(filing: Filing, year: number, status: FilingStatus) {
  if (status === "filed") return null;
  if (status === "na") return null;
  const due = filing.dueDate(year);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueCopy = new Date(due);
  dueCopy.setHours(0, 0, 0, 0);
  if (dueCopy < today) return { label: "Overdue", cls: "bg-red-100 text-red-700" };
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  if (dueCopy <= soon) {
    const days = Math.ceil((dueCopy.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { label: `Due in ${days}d`, cls: "bg-amber-100 text-amber-700" };
  }
  return null;
}

const STATUS_CYCLE: FilingStatus[] = ["not-filed", "filed", "na"];

function FilingCalendarTab({ year }: { year: number }) {
  const storageKey = `ky-filing-statuses-${year}`;

  const [statuses, setStatuses] = useState<Record<string, FilingStatus>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const getStatus = useCallback((id: string): FilingStatus => statuses[id] ?? "not-filed", [statuses]);

  const cycleStatus = useCallback((id: string) => {
    setStatuses(prev => {
      const current = prev[id] ?? "not-filed";
      const idx = STATUS_CYCLE.indexOf(current);
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      const updated = { ...prev, [id]: next };
      try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [storageKey]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let overdue = 0, dueSoon = 0, filed = 0, na = 0;
  for (const f of KY_FILINGS) {
    const st = getStatus(f.id);
    if (st === "filed") { filed++; continue; }
    if (st === "na") { na++; continue; }
    const due = f.dueDate(year);
    if (!due) continue;
    const dueCopy = new Date(due); dueCopy.setHours(0, 0, 0, 0);
    if (dueCopy < today) overdue++;
    else {
      const soon = new Date(today); soon.setDate(soon.getDate() + 30);
      if (dueCopy <= soon) dueSoon++;
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${overdue > 0 ? "bg-red-50 border-red-200" : "bg-card border-border"}`}>
          <XCircle className={`w-6 h-6 flex-shrink-0 ${overdue > 0 ? "text-red-600" : "text-muted-foreground"}`} />
          <div>
            <p className={`text-2xl font-display font-bold ${overdue > 0 ? "text-red-600" : "text-muted-foreground"}`}>{overdue}</p>
            <p className="text-xs text-muted-foreground font-medium">Overdue</p>
          </div>
        </div>
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${dueSoon > 0 ? "bg-amber-50 border-amber-200" : "bg-card border-border"}`}>
          <Clock className={`w-6 h-6 flex-shrink-0 ${dueSoon > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
          <div>
            <p className={`text-2xl font-display font-bold ${dueSoon > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{dueSoon}</p>
            <p className="text-xs text-muted-foreground font-medium">Due Soon</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card border-border p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 flex-shrink-0 text-emerald-600" />
          <div>
            <p className="text-2xl font-display font-bold text-emerald-600">{filed}</p>
            <p className="text-xs text-muted-foreground font-medium">Filed / Complete</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card border-border p-4 flex items-center gap-3">
          <Shield className="w-6 h-6 flex-shrink-0 text-muted-foreground" />
          <div>
            <p className="text-2xl font-display font-bold text-muted-foreground">{na}</p>
            <p className="text-xs text-muted-foreground font-medium">N/A</p>
          </div>
        </div>
      </div>

      {/* Filing List */}
      <div className="space-y-3">
        {KY_FILINGS.map(filing => {
          const status = getStatus(filing.id);
          const isExpanded = expanded[filing.id];
          const badge = getFilingDueBadge(filing, year, status);
          const rowBg = getFilingStatusColor(filing, year, status);
          const dateStyle = getFilingDueDateStyle(filing, year, status);

          return (
            <div key={filing.id} className={`rounded-2xl border ${rowBg} overflow-hidden transition-colors`}>
              <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* Status Toggle */}
                  <button
                    onClick={() => cycleStatus(filing.id)}
                    className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors mt-0.5 ${
                      status === "filed"
                        ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                        : status === "na"
                        ? "bg-muted text-muted-foreground hover:bg-muted/80"
                        : "bg-background border border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                    title={`Status: ${status === "not-filed" ? "Not Filed" : status === "filed" ? "Filed" : "N/A"} — click to cycle`}
                  >
                    {status === "filed" ? <CheckCircle className="w-5 h-5" /> :
                     status === "na" ? <XCircle className="w-4 h-4" /> :
                     <Clock className="w-4 h-4" />}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`font-semibold text-foreground ${status === "na" ? "opacity-50" : ""}`}>{filing.name}</span>
                      {badge && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>{badge.label}</span>
                      )}
                      {filing.conditional && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{filing.conditional}</span>
                      )}
                      {status === "filed" && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Filed</span>
                      )}
                      {status === "na" && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground">N/A</span>
                      )}
                    </div>
                    <p className={`text-xs font-medium mb-1.5 ${status === "na" ? "text-muted-foreground/60" : "text-muted-foreground"}`}>{filing.authority}</p>
                    <p className={`text-sm mb-2 ${status === "na" ? "text-muted-foreground/60" : "text-muted-foreground"}`}>{filing.description}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className={`flex items-center gap-1 ${dateStyle}`}>
                        <Calendar className="w-3.5 h-3.5" />
                        {filing.dueDateLabel(year)}
                      </span>
                      {filing.fee !== "No state fee" && filing.fee !== "Pay estimated tax owed" && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <DollarSign className="w-3.5 h-3.5" /> {filing.fee}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={filing.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">File</span>
                    </a>
                    <button
                      onClick={() => toggleExpand(filing.id)}
                      className="flex items-center gap-1 h-8 px-3 rounded-lg border border-border bg-background hover:bg-muted/40 text-xs font-medium text-muted-foreground transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">Learn More</span>
                    </button>
                  </div>
                </div>

                {/* Learn More Panel */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border/60 space-y-3 text-sm">
                    <div>
                      <p className="font-semibold text-foreground mb-1">What it is</p>
                      <p className="text-muted-foreground">{filing.learnMore}</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                      <p className="font-semibold text-red-800 mb-0.5 text-xs uppercase tracking-wide">Penalty for missing</p>
                      <p className="text-red-700 text-sm">{filing.penalty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={filing.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {filing.linkLabel}
                      </a>
                      <span className="text-muted-foreground">—</span>
                      <span className="text-muted-foreground text-xs">{filing.authority}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground italic">Toggle status:</span>
                      <button onClick={() => cycleStatus(filing.id)} className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                        status === "not-filed" ? "bg-background border-border text-foreground hover:bg-muted/40" :
                        status === "filed" ? "bg-emerald-100 border-emerald-200 text-emerald-700 hover:bg-emerald-200" :
                        "bg-muted border-border text-muted-foreground hover:bg-muted/60"
                      }`}>
                        {status === "filed" ? <><CheckCircle className="w-3.5 h-3.5" /> Filed</> :
                         status === "na" ? <><XCircle className="w-3.5 h-3.5" /> N/A</> :
                         <><Clock className="w-3.5 h-3.5" /> Not Filed</>}
                      </button>
                      <span className="text-xs text-muted-foreground">← click to change</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CPA Disclaimer */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900 mb-1">Informational Only — Consult a CPA</p>
            <p className="text-sm text-blue-800">
              This filing calendar is provided for general guidance only and does not constitute legal or tax advice.
              Due dates, fees, and requirements can change. Always verify current requirements with the relevant authority
              and consult a qualified CPA or tax professional before making filing decisions.
              Kentucky SBDC (<a href="https://kysbdc.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">kysbdc.com</a>) offers free small-business advising if you need help.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

export default function Accounting() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<"accounting" | "schedule-c" | "filing-calendar">("accounting");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounting", year],
    queryFn: () => fetchAccounting(year),
    staleTime: 1000 * 60 * 2,
  });

  const { data: report, isLoading: reportLoading } = useScheduleCReport(year);
  const { data: subPayments } = useAllSubcontractorsPayments(year);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const s = data?.summary ?? {};
  const netColor = (s.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500";

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Accounting & Tax Reports</h1>
          <p className="text-muted-foreground mt-1">Auto-generated financials — income, expenses, mileage, Schedule C, and 1099s in one place.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("accounting")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "accounting"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 inline mr-2" /> Accounting Report
        </button>
        <button
          onClick={() => setActiveTab("schedule-c")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "schedule-c"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-4 h-4 inline mr-2" /> Schedule C
        </button>
        <button
          onClick={() => setActiveTab("filing-calendar")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
            activeTab === "filing-calendar"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" /> Filing Calendar
        </button>
      </div>

      {activeTab === "accounting" && (
        <>
          {isLoading && (
            <div className="text-center py-20 text-muted-foreground animate-pulse">Loading {year} report…</div>
          )}
          {error && (
            <div className="text-center py-20 text-destructive">Failed to load report. Check that the API is running.</div>
          )}

          {data && (
            <>
          {/* P&L Summary Cards */}
          <div>
            <SectionHeader title="Profit & Loss Summary" sub={`Jan 1 – Dec 31, ${year}`} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Gross Revenue" value={formatCurrency(s.grossRevenue)} sub="All invoices" icon={TrendingUp} color="bg-emerald-100 text-emerald-600" />
              <StatCard label="Collected" value={formatCurrency(s.paidRevenue)} sub="Paid invoices" icon={DollarSign} color="bg-blue-100 text-blue-600" />
              <StatCard label="Total Expenses" value={formatCurrency(s.totalExpenses)} sub={`+${formatCurrency(s.mileageDeduction)} mileage`} icon={TrendingDown} color="bg-red-100 text-red-600" />
              <div className={`bg-card border border-border rounded-2xl p-5 shadow-sm flex gap-4 items-start border-l-4 ${(s.netProfit ?? 0) >= 0 ? "border-l-emerald-500" : "border-l-red-500"}`}>
                <div className="min-w-0 w-full">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Est. Net Profit</p>
                  <p className={`text-2xl font-display font-bold ${netColor}`}>{formatCurrency(s.netProfit)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Collected − Expenses − Mileage</p>
                </div>
              </div>
            </div>

            {s.pendingRevenue > 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formatCurrency(s.pendingRevenue)} is pending (sent/overdue) — not yet counted in net profit.</span>
              </div>
            )}
          </div>

          {/* Income by City */}
          <div>
            <SectionHeader
              title="Income by City / Location"
              sub="For KY local occupational tax filing"
            />
            {data.incomeByCity.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No invoices with location data yet. Add a city to your invoices to see this report.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left">City</th>
                      <th className="px-5 py-3 text-left">State</th>
                      <th className="px-5 py-3 text-right">Invoices</th>
                      <th className="px-5 py-3 text-right">Gross Income</th>
                      <th className="px-5 py-3 text-right">Collected</th>
                      <th className="px-5 py-3 text-right">Tax Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.incomeByCity.map((row: any) => (
                      <tr key={`${row.city}-${row.state}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-semibold text-foreground flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          {row.city}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{row.state || "—"}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground">{row.invoiceCount}</td>
                        <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.gross)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600 font-medium">{formatCurrency(row.paid)}</td>
                        <td className="px-5 py-3 text-right text-blue-600">{formatCurrency(row.taxCollected)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border font-semibold text-sm">
                    <tr>
                      <td colSpan={3} className="px-5 py-3 text-foreground">Totals</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.gross, 0))}</td>
                      <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.paid, 0))}</td>
                      <td className="px-5 py-3 text-right text-blue-600">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.taxCollected, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Monthly Trend */}
          <div>
            <SectionHeader title="Monthly Income vs. Expenses" sub={String(year)} />
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-left">Month</th>
                    <th className="px-5 py-3 text-right">Gross Invoiced</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                    <th className="px-5 py-3 text-right">Expenses</th>
                    <th className="px-5 py-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(data.monthlyIncome as any[]).filter((m: any) => m.gross > 0 || m.expenses > 0).map((m: any) => {
                    const net = m.paid - m.expenses;
                    const monthName = new Date(m.month + "-15").toLocaleString("default", { month: "long" });
                    return (
                      <tr key={m.month} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{monthName}</td>
                        <td className="px-5 py-3 text-right">{formatCurrency(m.gross)}</td>
                        <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(m.paid)}</td>
                        <td className="px-5 py-3 text-right text-red-500">{formatCurrency(m.expenses)}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(net)}</td>
                      </tr>
                    );
                  })}
                  {(data.monthlyIncome as any[]).every((m: any) => m.gross === 0 && m.expenses === 0) && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No data for {year}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expenses by Category */}
          <div>
            <SectionHeader title="Expense Breakdown" sub="Schedule C categories" />
            {data.expensesByCategory.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No expenses recorded for {year}.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left">Category</th>
                      <th className="px-5 py-3 text-right">Transactions</th>
                      <th className="px-5 py-3 text-right">Total Amount</th>
                      <th className="px-5 py-3 text-right">% of Expenses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {data.expensesByCategory.map((cat: any) => {
                      const pct = s.totalExpenses > 0 ? (cat.amount / s.totalExpenses * 100).toFixed(1) : "0";
                      const colorClass = CATEGORY_COLORS[cat.category] ?? "bg-gray-100 text-gray-600";
                      return (
                        <tr key={cat.category} className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>{cat.category}</span>
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">{cat.count}</td>
                          <td className="px-5 py-3 text-right font-semibold text-foreground">{formatCurrency(cat.amount)}</td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-muted-foreground text-xs w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border font-semibold">
                    <tr>
                      <td className="px-5 py-3 text-foreground">Total</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{data.expensesByCategory.reduce((s: number, c: any) => s + c.count, 0)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(s.totalExpenses)}</td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Mileage Deduction */}
          <div>
            <SectionHeader title="Mileage Deduction" sub={`IRS rate: $${s.mileageRate?.toFixed(3)}/mile`} />
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Business Miles" value={s.totalMiles?.toFixed(1) ?? "0"} sub="Tracked this year" icon={Navigation} color="bg-violet-100 text-violet-600" />
              <StatCard label="IRS Deduction" value={formatCurrency(s.mileageDeduction)} sub={`@ $${s.mileageRate?.toFixed(3)}/mi`} icon={DollarSign} color="bg-emerald-100 text-emerald-600" />
              <StatCard label="Sub Payments" value={formatCurrency(s.totalSubPayments)} sub="Total YTD" icon={HardHat} color="bg-orange-100 text-orange-600" />
            </div>
          </div>

          {/* 1099 / Subcontractors */}
          <div>
            <SectionHeader title="Subcontractor / 1099 Report" sub={`$600 threshold for ${year}`} />
            {data.subcontractor1099.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <HardHat className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No subcontractors on file.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-5 py-3 text-left">Subcontractor</th>
                      <th className="px-5 py-3 text-right">YTD Payments</th>
                      <th className="px-5 py-3 text-center">1099 Required</th>
                      <th className="px-5 py-3 text-center">W-9 on File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(data.subcontractor1099 as any[]).map((sub: any) => (
                      <tr key={sub.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 font-medium text-foreground">{sub.name}</td>
                        <td className={`px-5 py-3 text-right font-semibold ${sub.requires1099 ? "text-amber-600" : "text-foreground"}`}>{formatCurrency(sub.ytdPayments)}</td>
                        <td className="px-5 py-3 text-center">
                          {sub.requires1099
                            ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><AlertCircle className="w-3 h-3" /> Yes — File 1099</span>
                            : <span className="text-muted-foreground text-xs">Not yet (${(sub.threshold - sub.ytdPayments).toFixed(0)} to go)</span>
                          }
                        </td>
                        <td className="px-5 py-3 text-center">
                          {sub.w9OnFile
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                            : <AlertCircle className="w-4 h-4 text-red-400 mx-auto" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tax Records Spreadsheet */}
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <SectionHeader title="Tax Records — All Invoices" sub={`Full ledger for ${year} — export for city occupational tax filings`} />
              </div>
              <button
                onClick={() => data.invoiceRecords?.length > 0 && downloadCSV(data.invoiceRecords, year)}
                disabled={!data.invoiceRecords?.length}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow transition-colors disabled:opacity-40 flex-shrink-0"
              >
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>
            {(!data.invoiceRecords || data.invoiceRecords.length === 0) ? (
              <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No invoices found for {year}. Create invoices with a city to populate this report.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left">Invoice #</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Client</th>
                        <th className="px-4 py-3 text-left">City</th>
                        <th className="px-4 py-3 text-left">State</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                        <th className="px-4 py-3 text-right">Tax</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(data.invoiceRecords as any[]).map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs text-foreground font-semibold">{r.invoiceNumber}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{r.issueDate}</td>
                          <td className="px-4 py-2.5 font-medium text-foreground">{r.clientName || "—"}</td>
                          <td className="px-4 py-2.5">
                            {r.city ? (
                              <span className="inline-flex items-center gap-1 text-primary font-medium">
                                <MapPin className="w-3 h-3 flex-shrink-0" />{r.city}
                              </span>
                            ) : <span className="text-muted-foreground italic text-xs">No city</span>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.state || "—"}</td>
                          <td className="px-4 py-2.5 text-right">{formatCurrency(r.subtotal)}</td>
                          <td className="px-4 py-2.5 text-right text-blue-600">{r.taxAmount > 0 ? formatCurrency(r.taxAmount) : "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-foreground">{formatCurrency(r.total)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              r.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                              r.status === "sent" ? "bg-blue-100 text-blue-700" :
                              r.status === "overdue" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{r.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t-2 border-border font-semibold text-sm">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-foreground">{data.invoiceRecords.length} invoice{data.invoiceRecords.length !== 1 ? "s" : ""}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency((data.invoiceRecords as any[]).reduce((s: number, r: any) => s + r.subtotal, 0))}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{formatCurrency((data.invoiceRecords as any[]).reduce((s: number, r: any) => s + r.taxAmount, 0))}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency((data.invoiceRecords as any[]).reduce((s: number, r: any) => s + r.total, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    <strong>KY Occupational Tax tip:</strong> Use the City and Tax columns to determine which city jurisdictions you owe local occupational tax to. Download the CSV to attach to your city tax filings.
                  </p>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center pb-4">
            This report is auto-generated from your invoices, expenses, mileage logs, and subcontractor records. Always verify with your accountant before filing.
          </p>
            </>
          )}
        </>
      )}

      {/* Filing Calendar Tab */}
      {activeTab === "filing-calendar" && (
        <FilingCalendarTab year={year} />
      )}

      {/* Schedule C Tab */}
      {activeTab === "schedule-c" && (
        <>
          {reportLoading && (
            <div className="text-center py-20 text-muted-foreground animate-pulse">Loading Schedule C…</div>
          )}

          {report && (
            <>
              {/* Export Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!report) return;
                    const csvContent = `Schedule C - Tax Year ${report.year}\nGenerated: ${new Date().toLocaleDateString()}\n\nLine,Description,Amount\n1,Gross receipts or sales,"$${report.grossReceipts.toFixed(2)}"\n${report.scheduleLines
                      .filter(l => l.line > 1)
                      .map(line => `${line.line},"${line.description}","$${line.amount.toFixed(2)}"`)
                      .join("\n")}\n\nData Quality Check\nUncategorized Expenses,${report.dataQuality.uncategorizedExpenses}\nDraft Invoices,${report.dataQuality.invoicesDraft}`;
                    const blob = new Blob([csvContent], { type: "text/csv" });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `Schedule_C_${year}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border"
                >
                  <Download className="w-4 h-4 mr-2" /> CSV Export
                </button>
                <button
                  onClick={() => {
                    if (!report) return;
                    let htmlContent = `
                      <html>
                        <head>
                          <title>Schedule C - Tax Year ${report.year}</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
                            h1 { text-align: center; font-size: 18px; margin-bottom: 30px; }
                            .form-line { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
                            .line-number { font-weight: bold; width: 40px; }
                            .line-description { flex: 1; margin: 0 20px; }
                            .line-amount { width: 120px; text-align: right; }
                          </style>
                        </head>
                        <body>
                          <h1>SCHEDULE C (FORM 1040) - PROFIT OR LOSS FROM BUSINESS</h1>
                          <p style="text-align: center;">Tax Year ${report.year}</p>
                          ${report.scheduleLines
                            .map(
                              line => `
                            <div class="form-line">
                              <span class="line-number">Line ${line.line}</span>
                              <span class="line-description">${line.description}</span>
                              <span class="line-amount">$${line.amount.toFixed(2)}</span>
                            </div>
                          `
                            )
                            .join("")}
                        </body>
                      </html>
                    `;
                    const printWindow = window.open("", "", "width=800,height=600");
                    if (printWindow) {
                      printWindow.document.write(htmlContent);
                      printWindow.document.close();
                      setTimeout(() => printWindow.print(), 250);
                    }
                  }}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all"
                >
                  <FileText className="w-4 h-4 mr-2" /> PDF Print
                </button>
              </div>

              {/* Data Quality Warnings */}
              {report.dataQuality.warnings.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-medium text-amber-900">Data Quality Warnings</p>
                      {report.dataQuality.warnings.map((warning, i) => (
                        <p key={i} className="text-sm text-amber-800">• {warning}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Schedule C Summary */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-muted/50 px-6 py-4 border-b border-border">
                  <h2 className="text-lg font-display font-bold text-foreground">Schedule C Summary</h2>
                </div>
                <div className="p-6 space-y-3">
                  {report.scheduleLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`flex justify-between items-center py-2 ${
                        [1, 28, 29].includes(line.line) ? "border-t border-border pt-3 font-semibold" : ""
                      } ${[28, 29].includes(line.line) ? "bg-muted/30 px-3 rounded" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-sm text-muted-foreground w-8">Line {line.line}</span>
                        <span className="text-foreground">{line.description}</span>
                      </div>
                      <span className="text-lg font-semibold text-primary">{formatCurrency(line.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mileage Data */}
              {report.mileageData.logCount > 0 && (
                <div className="bg-card border border-border rounded-2xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Business Mileage Deduction</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Business Miles</p>
                      <p className="text-2xl font-bold text-foreground">{report.mileageData.totalBusinessMiles.toFixed(0)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Rate per Mile</p>
                      <p className="text-2xl font-bold text-foreground">${report.mileageData.ratePerMile.toFixed(3)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Deduction Amount</p>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(report.mileageData.deduction)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Logs Recorded</p>
                      <p className="text-2xl font-bold text-foreground">{report.mileageData.logCount}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Subcontractor Payments */}
              {subPayments && subPayments.subcontractors.length > 0 && (
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-muted/50 px-6 py-4 border-b border-border flex justify-between items-center">
                    <h2 className="text-lg font-display font-bold text-foreground">Subcontractor Payments</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                        <tr>
                          <th className="px-6 py-3">Subcontractor</th>
                          <th className="px-6 py-3 text-right">Total Payments</th>
                          <th className="px-6 py-3 text-center">Payment Count</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {subPayments.subcontractors.map(sub => (
                          <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-medium text-foreground">{sub.name}</td>
                            <td className="px-6 py-4 text-right font-semibold text-primary">{formatCurrency(sub.totalPayments)}</td>
                            <td className="px-6 py-4 text-center text-muted-foreground">{sub.paymentCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-900 mb-1">⚠️ Tax Disclaimer</p>
                    <p className="text-sm text-blue-800">
                      This Schedule C summary is for informational purposes only and does not constitute tax advice. 
                      Please consult with a qualified tax professional or CPA before filing. BuildPro is not responsible 
                      for tax filing accuracy or penalties resulting from incomplete or incorrect information.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
