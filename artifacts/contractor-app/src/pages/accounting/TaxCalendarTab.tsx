import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, MapPin, AlertCircle, CheckCircle2, Download, FileText,
  AlertTriangle, Calendar, ExternalLink, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Shield, Plus, Pencil, CalendarClock,
  RefreshCw, Trash2, FileCheck, X, Upload, Eye, EyeOff, Settings2,
  Paperclip, HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { openDrivePicker } from "@/lib/googleDrivePicker";
import { useGetSettings } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const QUARTERLY_TAX_API = `${BASE}/api/estimated-tax-payments`;

interface TaxPaymentRow {
  id: number;
  year: number;
  quarter: number;
  level: string;
  amountDue: number | null;
  amountPaid: number;
  paidDate: string | null;
  paymentMethod: string | null;
  notes: string | null;
}

interface QuarterData {
  quarter: number;
  label: string;
  period: string;
  federalDueDateLabel: string;
  kyDueDateLabel: string;
  recommendedFederal: number;
  recommendedKy: number;
  recommendedTotal: number;
  safeHarborFederal: number;
  safeHarborKy: number;
  safeHarborTotal: number;
  totalPaidFederal: number;
  totalPaidKy: number;
  totalPaidCombined: number;
  totalPaid: number;
  payments: TaxPaymentRow[];
  status: "paid" | "partial" | "due" | "overdue";
}

interface QuarterlyTaxResponse {
  year: number;
  quarters: QuarterData[];
  payments: TaxPaymentRow[];
  safeHarborMethod: string;
  priorYearAvailable: boolean;
  summary: {
    netProfit: number;
    priorYearNetProfit: number;
    fullYearFederalTax: number;
    fullYearKyTax: number;
    totalRecommended: number;
    totalSafeHarbor: number;
    safeHarborPerQuarter: number;
    totalPaid: number;
    remaining: number;
  };
}

function useQuarterlyTaxData(year: number) {
  return useQuery<QuarterlyTaxResponse>({
    queryKey: ["quarterly-taxes", year],
    queryFn: async () => {
      const res = await fetch(`${QUARTERLY_TAX_API}?year=${year}`);
      if (!res.ok) throw new Error("Failed to load quarterly tax data");
      return res.json();
    },
  });
}

function useCreateTaxPayment(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { year: number; quarter: number; level: string; amountPaid: string; paidDate: string; paymentMethod: string; notes: string }) => {
      const res = await fetch(QUARTERLY_TAX_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quarterly-taxes", year] }),
  });
}

function useUpdateTaxPayment(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; amountPaid?: string; paidDate?: string; paymentMethod?: string; notes?: string; level?: string }) => {
      const res = await fetch(`${QUARTERLY_TAX_API}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quarterly-taxes", year] }),
  });
}

function useDeleteTaxPayment(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${QUARTERLY_TAX_API}/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quarterly-taxes", year] }),
  });
}

async function fetchAccounting(year: number, businessLine?: string) {
  const params = new URLSearchParams({ year: String(year) });
  if (businessLine) params.set("businessLine", businessLine);
  const res = await fetch(`${BASE}/api/reports/accounting?${params}`);
  if (!res.ok) throw new Error("Failed to load accounting data");
  return res.json();
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

// ─── KY Filing Calendar Data ────────────────────────────────────────────────

type FilingStatus = "not-filed" | "filed" | "na";

interface Filing {
  id: string; name: string; authority: string;
  dueDate: (year: number) => Date | null;
  dueDateLabel: (year: number) => string;
  fee: string; description: string;
  link: string; linkLabel: string; learnMore: string; penalty: string;
  conditional?: string;
}

const KY_FILINGS: Filing[] = [
  {
    id: "ky-annual-report", name: "KY Annual Report", authority: "KY Secretary of State",
    dueDate: (y) => new Date(y, 5, 30), dueDateLabel: (y) => `June 30, ${y}`, fee: "$15",
    description: "Annual LLC filing to keep your business in good standing with the state.",
    link: "https://sos.ky.gov", linkLabel: "sos.ky.gov",
    learnMore: "Every Kentucky LLC must file an Annual Report with the Secretary of State by June 30 each year. This report confirms your registered agent, principal office address, and members/managers. Failure to file can result in administrative dissolution of your LLC.",
    penalty: "Late or missing filings can result in administrative dissolution of your LLC and a $50+ late fee. A dissolved LLC loses liability protection.",
  },
  {
    id: "ky-llet-725", name: "LLET / Form 725", authority: "KY Dept. of Revenue",
    dueDate: (y) => new Date(y, 3, 15), dueDateLabel: (y) => `April 15, ${y}`, fee: "$175 minimum",
    description: "Kentucky Limited Liability Entity Tax — required for all LLCs doing business in KY.",
    link: "https://onestop.ky.gov", linkLabel: "Kentucky Online Gateway",
    learnMore: "The LLET is Kentucky's annual business privilege tax on LLCs. For a single-member LLC, you file Form 725. The tax is the greater of $175 or a percentage of gross receipts / gross profits. It is due the same day as your federal return (April 15 for calendar-year filers).",
    penalty: "Penalty of 2% per month (up to 20%) on unpaid tax, plus interest at 1% per month. Minimum $175 due even with no income.",
  },
  {
    id: "federal-1040", name: "Federal 1040 + Schedule C + SE", authority: "IRS",
    dueDate: (y) => new Date(y, 3, 15), dueDateLabel: (y) => `April 15, ${y}`, fee: "No state fee",
    description: "Personal income tax return including business profit/loss and self-employment tax.",
    link: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040", linkLabel: "IRS.gov / Schedule C",
    learnMore: "As a single-member LLC, you report your business income and expenses on Schedule C of your personal Form 1040. Self-employment tax (Social Security + Medicare, ~15.3%) is calculated on Schedule SE.",
    penalty: "Late filing: 5% of unpaid tax per month (max 25%). Late payment: 0.5% per month.",
  },
  {
    id: "est-q1", name: "Quarterly Estimated Tax — Q1", authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y, 3, 15), dueDateLabel: (y) => `April 15, ${y}`, fee: "Pay estimated tax owed",
    description: "Q1 estimated payment covering Jan 1 – Mar 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es", linkLabel: "IRS.gov / 1040-ES",
    learnMore: "If you expect to owe $1,000 or more in federal income taxes after withholding, you must make quarterly estimated payments. Q1 covers January–March income.",
    penalty: "Underpayment penalty (typically ~8% annualized rate) on amounts underpaid, plus interest.",
  },
  {
    id: "est-q2", name: "Quarterly Estimated Tax — Q2", authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y, 5, 15), dueDateLabel: (y) => `June 15, ${y}`, fee: "Pay estimated tax owed",
    description: "Q2 estimated payment covering Apr 1 – May 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es", linkLabel: "IRS.gov / 1040-ES",
    learnMore: "Q2 covers April–May income and is due June 15. Note: this is a shorter payment period than Q1 or Q3.",
    penalty: "Underpayment penalty on any shortfall, calculated from the due date of each installment.",
  },
  {
    id: "est-q3", name: "Quarterly Estimated Tax — Q3", authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y, 8, 15), dueDateLabel: (y) => `September 15, ${y}`, fee: "Pay estimated tax owed",
    description: "Q3 estimated payment covering Jun 1 – Aug 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es", linkLabel: "IRS.gov / 1040-ES",
    learnMore: "Q3 covers June–August income and is due September 15.",
    penalty: "Underpayment penalty calculated from September 15 if payment was insufficient.",
  },
  {
    id: "est-q4", name: "Quarterly Estimated Tax — Q4", authority: "IRS (Form 1040-ES)",
    dueDate: (y) => new Date(y + 1, 0, 15), dueDateLabel: (y) => `January 15, ${y + 1}`, fee: "Pay estimated tax owed",
    description: "Q4 estimated payment covering Sep 1 – Dec 31 income.",
    link: "https://www.irs.gov/forms-pubs/about-form-1040-es", linkLabel: "IRS.gov / 1040-ES",
    learnMore: "Q4 covers September–December income and is due January 15 of the following year.",
    penalty: "Underpayment penalty from January 15 if payment was insufficient.",
  },
  {
    id: "owensboro-occ-license", name: "Owensboro Occ. License / Net Profit Return", authority: "City of Owensboro",
    dueDate: (y) => new Date(y, 3, 15), dueDateLabel: (y) => `April 15, ${y} (same as federal)`, fee: "$75 minimum or 1.39% of net profit",
    description: "Annual net profit return for work performed in Owensboro city limits.",
    link: "https://owensboro.org/city-services/finance/occupational-license/", linkLabel: "owensboro.org / Occ. License",
    learnMore: "If you performed work within the Owensboro city limits, you owe a local occupational tax on your net profit. The rate is 1.39% with a $75 annual minimum license fee.",
    penalty: "Late filing penalty of 5% per month (max 25%) plus 1% interest per month on unpaid tax.",
  },
  {
    id: "ky-sales-use-tax", name: "KY Sales & Use Tax", authority: "KY Dept. of Revenue",
    dueDate: (_y) => null, dueDateLabel: (_y) => "Monthly or quarterly (if applicable)", fee: "6% of taxable sales",
    description: "Required only if you sell taxable goods or collect sales tax from customers.",
    link: "https://revenue.ky.gov/Business/Sales-Use-Tax/Pages/default.aspx", linkLabel: "KY Revenue / Sales Tax",
    learnMore: "Most contractor services are not subject to Kentucky sales tax. However, if you sell materials or equipment directly to customers, you may need to collect and remit 6% KY sales tax.",
    penalty: "Failure to collect/remit sales tax can result in back-taxes, penalties (2%/month up to 20%), interest, and personal liability.",
    conditional: "Only required if you sell taxable goods",
  },
  {
    id: "boi-report", name: "BOI Report (Beneficial Ownership)", authority: "FinCEN (Federal)",
    dueDate: (_y) => null, dueDateLabel: (_y) => "One-time (or within 30 days of change)", fee: "No fee",
    description: "One-time federal report of who owns and controls the business. Required for most LLCs.",
    link: "https://www.fincen.gov/boi", linkLabel: "fincen.gov/boi",
    learnMore: "Under the Corporate Transparency Act, most U.S. LLCs must file a Beneficial Ownership Information (BOI) report with FinCEN.",
    penalty: "Civil penalties of $500/day per violation. Criminal penalties of up to $10,000 and 2 years imprisonment for willful violations.",
    conditional: "One-time filing — mark N/A once complete",
  },
  {
    id: "personal-property-tax", name: "Personal Property Tax Return", authority: "Daviess County PVA",
    dueDate: (y) => new Date(y, 4, 15), dueDateLabel: (y) => `May 15, ${y} (if applicable)`, fee: "Based on assessed value",
    description: "Annual return for business personal property (equipment, tools, vehicles) if applicable.",
    link: "https://www.daviesspva.org", linkLabel: "Daviess County PVA",
    learnMore: "If your business owns tangible personal property (tools, equipment, machinery) valued above the threshold, you must file an annual Personal Property Tax Return with the Daviess County PVA by May 15.",
    penalty: "Late returns receive a 10% penalty on the assessed value. Failure to file can result in estimated assessment plus penalties.",
    conditional: "Only required if business owns tangible personal property",
  },
];

function getFilingStatusColor(filing: Filing, year: number, status: FilingStatus): string {
  if (status === "filed") return "bg-emerald-50 border-emerald-200";
  if (status === "na") return "bg-muted/30 border-border";
  const due = filing.dueDate(year);
  if (!due) return "bg-card border-border";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueCopy = new Date(due); dueCopy.setHours(0, 0, 0, 0);
  if (dueCopy < today) return "bg-red-50 border-red-200";
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  if (dueCopy <= soon) return "bg-amber-50 border-amber-200";
  return "bg-card border-border";
}

function getFilingDueDateStyle(filing: Filing, year: number, status: FilingStatus): string {
  if (status === "filed" || status === "na") return "text-muted-foreground";
  const due = filing.dueDate(year);
  if (!due) return "text-muted-foreground";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueCopy = new Date(due); dueCopy.setHours(0, 0, 0, 0);
  if (dueCopy < today) return "text-red-600 font-semibold";
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  if (dueCopy <= soon) return "text-amber-600 font-semibold";
  return "text-foreground";
}

function getFilingDueBadge(filing: Filing, year: number, status: FilingStatus) {
  if (status === "filed" || status === "na") return null;
  const due = filing.dueDate(year);
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueCopy = new Date(due); dueCopy.setHours(0, 0, 0, 0);
  if (dueCopy < today) return { label: "Overdue", cls: "bg-red-100 text-red-700" };
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  if (dueCopy <= soon) {
    const days = Math.ceil((dueCopy.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { label: `Due in ${days}d`, cls: "bg-amber-100 text-amber-700" };
  }
  return null;
}

const STATUS_CYCLE: FilingStatus[] = ["not-filed", "filed", "na"];

// ─── Compliance Items ────────────────────────────────────────────────────────

interface ComplianceDoc {
  objectPath: string;
  fileName: string;
  uploadedAt: string;
  servingUrl?: string;
}

interface ComplianceItem {
  id: number; title: string; category: string; jurisdiction: string | null;
  dueDate: string; recurrence: string; status: string; computedStatus: string;
  daysUntilDue: number; notes: string | null;
  enabled: boolean;
  documents: ComplianceDoc[];
}

interface KyFilingSetting {
  filingId: string;
  enabled: boolean;
  documents: ComplianceDoc[];
  completions?: Record<string, string>; // keyed by year string, value: "filed" | "na" | "not-filed"
}

const COMPLIANCE_CATEGORIES = [
  "License", "Tax Filing", "Permit", "Insurance", "Bond",
  "Registration", "Certification", "Inspection", "Other",
];

const COMPLIANCE_RECURRENCES = [
  { value: "one-time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "every_5_years", label: "Every 5 Years" },
];

const COMPLIANCE_API = `${BASE}/api/compliance-items`;

function useComplianceItems() {
  return useQuery<ComplianceItem[]>({
    queryKey: ["compliance-items"],
    queryFn: async () => {
      const res = await fetch(COMPLIANCE_API);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useCreateComplianceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ComplianceItem>) => {
      const res = await fetch(COMPLIANCE_API, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

function useUpdateComplianceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ComplianceItem> & { id: number }) => {
      const res = await fetch(`${COMPLIANCE_API}/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

function useDeleteComplianceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => { await fetch(`${COMPLIANCE_API}/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

const KY_SETTINGS_API = `${BASE}/api/ky-filing-settings`;

function useKyFilingSettings() {
  return useQuery<KyFilingSetting[]>({
    queryKey: ["ky-filing-settings"],
    queryFn: async () => {
      const res = await fetch(KY_SETTINGS_API);
      if (!res.ok) throw new Error("Failed to load KY filing settings");
      return res.json();
    },
  });
}

function useUpdateKyFilingSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filingId, enabled }: { filingId: string; enabled: boolean }) => {
      const res = await fetch(`${KY_SETTINGS_API}/${filingId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ky-filing-settings"] }),
  });
}

function useToggleKyFilingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filingId, year, status }: { filingId: string; year: number; status: string }) => {
      const res = await fetch(`${KY_SETTINGS_API}/${filingId}/status/${year}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update filing status");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ky-filing-settings"] }),
  });
}

function useUploadKyFilingDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filingId, file }: { filingId: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${KY_SETTINGS_API}/${filingId}/documents`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ky-filing-settings"] }),
  });
}

function useDeleteKyFilingDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ filingId, docIndex }: { filingId: string; docIndex: number }) => {
      const res = await fetch(`${KY_SETTINGS_API}/${filingId}/documents/${docIndex}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ky-filing-settings"] }),
  });
}

function useUploadComplianceItemDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${COMPLIANCE_API}/${id}/documents`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

function useDeleteComplianceItemDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, docIndex }: { id: number; docIndex: number }) => {
      const res = await fetch(`${COMPLIANCE_API}/${id}/documents/${docIndex}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items"] }),
  });
}

function complianceStatusBadge(s: string) {
  if (s === "overdue") return "bg-red-100 text-red-700 border-red-200";
  if (s === "due-soon") return "bg-amber-100 text-amber-700 border-amber-200";
  if (s === "complete") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function complianceStatusLabel(s: string) {
  if (s === "overdue") return "Overdue";
  if (s === "due-soon") return "Due Soon";
  if (s === "complete") return "Complete";
  return "Upcoming";
}

function complianceCategoryIcon(cat: string) {
  switch (cat) {
    case "License": return "🪪"; case "Tax Filing": return "📋";
    case "Permit": return "📝"; case "Insurance": return "🛡️";
    case "Bond": return "🔒"; case "Registration": return "📄";
    case "Certification": return "🎓"; case "Inspection": return "🔍";
    default: return "📌";
  }
}

function formatComplianceDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ci = "w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-gray-300";
const cl = "block text-xs font-semibold text-gray-500 mb-1";

function ComplianceItemForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<ComplianceItem>;
  onSave: (d: Partial<ComplianceItem>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    title: initial?.title ?? "", category: initial?.category ?? "License",
    jurisdiction: initial?.jurisdiction ?? "", dueDate: initial?.dueDate ?? "",
    recurrence: initial?.recurrence ?? "one-time", notes: initial?.notes ?? "",
    status: initial?.status ?? "upcoming",
  });
  const [enabled, setEnabled] = useState(initial?.enabled !== false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ ...form, enabled, jurisdiction: form.jurisdiction.trim() || null, notes: form.notes.trim() || null });
  }
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={cl}>Item Name *</label>
        <input className={ci} required placeholder="e.g. Business License Renewal"
          value={form.title} onChange={e => set("title", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={cl}>Category *</label>
          <select className={ci} value={form.category} onChange={e => set("category", e.target.value)}>
            {COMPLIANCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={cl}>Due Date *</label>
          <input type="date" className={ci} required value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={cl}>Jurisdiction</label>
          <input className={ci} placeholder="e.g. City of Louisville, KY"
            value={form.jurisdiction} onChange={e => set("jurisdiction", e.target.value)} />
        </div>
        <div>
          <label className={cl}>Recurrence</label>
          <select className={ci} value={form.recurrence} onChange={e => set("recurrence", e.target.value)}>
            {COMPLIANCE_RECURRENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>
      {initial?.id && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={cl}>Status</label>
            <select className={ci} value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="upcoming">Upcoming</option>
              <option value="complete">Complete</option>
            </select>
          </div>
          <div>
            <label className={cl}>Visibility</label>
            <button type="button" onClick={() => setEnabled(v => !v)}
              className={`flex items-center gap-2 w-full h-9 px-3 rounded-xl text-sm font-medium border transition-colors ${enabled ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-muted border-border text-muted-foreground"}`}>
              {enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {enabled ? "Visible on calendar" : "Hidden from calendar"}
            </button>
          </div>
        </div>
      )}
      <div>
        <label className={cl}>Notes</label>
        <textarea className={ci + " resize-none"} rows={2}
          placeholder="Filing instructions, contact info, account numbers…"
          value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-60 shadow">
          {saving ? "Saving…" : initial?.id ? "Update Item" : "Add Item"}
        </button>
      </div>
    </form>
  );
}


// ─── Quarterly Estimated Tax Tracker ─────────────────────────────────────────

const PAYMENT_METHOD_OPTIONS = [
  { value: "irs_direct_pay", label: "IRS Direct Pay" },
  { value: "eftps", label: "EFTPS" },
  { value: "check", label: "Check / Money Order" },
  { value: "ky_direct", label: "KY One Stop Portal" },
  { value: "other", label: "Other" },
];

const LEVEL_OPTIONS = [
  { value: "federal", label: "Federal (IRS)" },
  { value: "state", label: "KY State" },
  { value: "combined", label: "Combined" },
];

function quarterStatusBadge(status: QuarterData["status"]) {
  switch (status) {
    case "paid": return { label: "Paid", cls: "bg-emerald-100 text-emerald-700" };
    case "partial": return { label: "Partial", cls: "bg-blue-100 text-blue-700" };
    case "overdue": return { label: "Overdue", cls: "bg-red-100 text-red-700" };
    default: return { label: "Due", cls: "bg-amber-100 text-amber-700" };
  }
}

function formatPaidDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function QuarterlyTaxTracker({ year }: { year: number }) {
  const { data, isLoading } = useQuarterlyTaxData(year);
  const createPayment = useCreateTaxPayment(year);
  const updatePayment = useUpdateTaxPayment(year);
  const deletePayment = useDeleteTaxPayment(year);
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(true);
  const [logFormQuarter, setLogFormQuarter] = useState<number | null>(null);
  const [editPayment, setEditPayment] = useState<TaxPaymentRow | null>(null);
  const [saving, setSaving] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ amount: "", level: "federal", paymentMethod: "irs_direct_pay", paidDate: todayStr, notes: "" });

  function openLog(quarter: number) {
    setEditPayment(null);
    setForm({ amount: "", level: "federal", paymentMethod: "irs_direct_pay", paidDate: todayStr, notes: "" });
    setLogFormQuarter(prev => prev === quarter ? null : quarter);
  }

  function openEdit(payment: TaxPaymentRow) {
    setLogFormQuarter(payment.quarter);
    setEditPayment(payment);
    setForm({
      amount: String(payment.amountPaid),
      level: payment.level,
      paymentMethod: payment.paymentMethod ?? "irs_direct_pay",
      paidDate: payment.paidDate ?? todayStr,
      notes: payment.notes ?? "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || !logFormQuarter) return;
    setSaving(true);
    try {
      if (editPayment) {
        await updatePayment.mutateAsync({ id: editPayment.id, amountPaid: form.amount, paidDate: form.paidDate, paymentMethod: form.paymentMethod, notes: form.notes, level: form.level });
      } else {
        await createPayment.mutateAsync({ year, quarter: logFormQuarter, level: form.level, amountPaid: form.amount, paidDate: form.paidDate, paymentMethod: form.paymentMethod, notes: form.notes });
      }
      setLogFormQuarter(null);
      setEditPayment(null);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save payment. Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this payment record?")) return;
    try {
      await deletePayment.mutateAsync(id);
    } catch {
      toast({ title: "Error", description: "Failed to delete payment. Please try again.", variant: "destructive" });
    }
  }

  const summary = data?.summary;
  const totalPaid = summary?.totalPaid ?? 0;
  const totalRec = summary?.totalSafeHarbor ?? 0;
  const remaining = summary?.remaining ?? 0;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-sm text-foreground">Quarterly Estimated Tax Payments</span>
            <span className="hidden sm:inline text-xs text-muted-foreground ml-2">IRS Form 1040-ES · KY Form 740-ES</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {data && totalRec > 0 && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${totalPaid >= totalRec ? "bg-emerald-100 text-emerald-700" : remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
              {formatCurrency(totalPaid)} of {formatCurrency(totalRec)} paid
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border p-5 space-y-5">
          {isLoading && <div className="text-center py-8 text-muted-foreground text-sm animate-pulse">Loading…</div>}

          {data && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Safe Harbor Total", value: formatCurrency(totalRec), sub: `${formatCurrency(summary!.safeHarborPerQuarter)}/qtr · ${data.priorYearAvailable ? "prior-yr + 90% current" : "90% current-yr estimate"}`, color: "text-foreground" },
                  { label: "Total Paid", value: formatCurrency(totalPaid), sub: `${data.payments.length} payment${data.payments.length !== 1 ? "s" : ""} logged`, color: "text-emerald-600" },
                  { label: "Remaining", value: formatCurrency(remaining), sub: remaining > 0 ? "Still owed this year" : "Fully paid", color: remaining > 0 ? "text-amber-600" : "text-emerald-600" },
                ].map(tile => (
                  <div key={tile.label} className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{tile.label}</p>
                    <p className={`text-lg font-display font-bold ${tile.color}`}>{tile.value}</p>
                    <p className="text-[11px] text-muted-foreground">{tile.sub}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-xl px-3.5 py-2.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  {data.priorYearAvailable
                    ? `Safe harbor = smaller of 25% of prior-year (${year - 1}) tax liability or 90% of ${year} estimated tax — per quarter.`
                    : `Safe harbor = 90% of estimated ${year} tax (no prior-year data). Add ${year - 1} invoices/expenses to enable prior-year comparison.`}
                </span>
              </div>

              {summary!.netProfit === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  No income data for {year} yet. Recommended amounts will appear once invoices or other income are recorded.
                </div>
              )}

              {/* Quarter cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.quarters.map(q => {
                  const badge = quarterStatusBadge(q.status);
                  const isLogging = logFormQuarter === q.quarter;
                  const borderCls = q.status === "paid" ? "border-emerald-200" : q.status === "overdue" ? "border-red-200" : q.status === "partial" ? "border-blue-200" : "border-border";

                  return (
                    <div key={q.quarter} className={`rounded-xl border ${borderCls} overflow-hidden`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-sm text-foreground">{q.label} — {q.period}</span>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                            </div>
                            <div className="space-y-0.5 mt-0.5">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                <span className="font-medium">Federal:</span> {q.federalDueDateLabel}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                <span className="font-medium">KY:</span> {q.kyDueDateLabel}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => openLog(q.quarter)}
                            className={`flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${isLogging ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}
                          >
                            <Plus className="w-3 h-3" />
                            Log Payment
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                          <div className="bg-muted/30 rounded-lg px-2.5 py-2">
                            <p className="text-muted-foreground mb-0.5">Federal (IRS)</p>
                            <p className="font-semibold text-foreground">{formatCurrency(q.safeHarborFederal)} safe harbor</p>
                            {q.totalPaidFederal > 0 && <p className="text-emerald-600 font-medium">{formatCurrency(q.totalPaidFederal)} paid</p>}
                          </div>
                          <div className="bg-muted/30 rounded-lg px-2.5 py-2">
                            <p className="text-muted-foreground mb-0.5">KY State (740-ES)</p>
                            <p className="font-semibold text-foreground">{formatCurrency(q.safeHarborKy)} safe harbor</p>
                            {q.totalPaidKy > 0 && <p className="text-emerald-600 font-medium">{formatCurrency(q.totalPaidKy)} paid</p>}
                          </div>
                        </div>

                        {q.payments.length > 0 && (
                          <div className="space-y-1.5">
                            {q.payments.map(p => (
                              <div key={p.id} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-semibold text-emerald-800">{formatCurrency(p.amountPaid)}</span>
                                  <span className="text-xs text-muted-foreground ml-1.5">{LEVEL_OPTIONS.find(l => l.value === p.level)?.label}</span>
                                  {p.paidDate && <span className="text-xs text-muted-foreground ml-1.5">· {formatPaidDate(p.paidDate)}</span>}
                                  {p.paymentMethod && <span className="text-xs text-muted-foreground ml-1.5">· {PAYMENT_METHOD_OPTIONS.find(m => m.value === p.paymentMethod)?.label}</span>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => openEdit(p)} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => handleDelete(p.id)} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {isLogging && (
                        <div className="border-t border-border bg-muted/20 p-4">
                          <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-foreground">{editPayment ? "Edit Payment" : "Log Payment"}</span>
                              <button type="button" onClick={() => { setLogFormQuarter(null); setEditPayment(null); }} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className={cl}>Amount Paid *</label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                  <input type="number" min="0.01" step="0.01" required className={ci + " pl-6"} placeholder="0.00"
                                    value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                                </div>
                              </div>
                              <div>
                                <label className={cl}>Date Paid</label>
                                <input type="date" className={ci} value={form.paidDate} onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))} />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className={cl}>Applies To</label>
                                <select className={ci} value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                                  {LEVEL_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className={cl}>Payment Method</label>
                                <select className={ci} value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                                  {PAYMENT_METHOD_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className={cl}>Notes (optional)</label>
                              <input className={ci} placeholder="Confirmation number, etc." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => { setLogFormQuarter(null); setEditPayment(null); }}
                                className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                                Cancel
                              </button>
                              <button type="submit" disabled={saving}
                                className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors">
                                {saving ? "Saving…" : editPayment ? "Update" : "Save Payment"}
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <a href="https://www.irs.gov/payments/direct-pay" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors">
                  <ExternalLink className="w-3 h-3" /> IRS Direct Pay
                </a>
                <a href="https://onestop.ky.gov" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors">
                  <ExternalLink className="w-3 h-3" /> KY One Stop
                </a>
              </div>

              <p className="text-[11px] text-muted-foreground italic">
                Federal recommended includes estimated SE tax + ~22% income tax estimate. KY state is 4% flat rate. Recommendations are based on {year} YTD net profit — consult a CPA for exact amounts.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tax Calendar & Compliance — unified sorted list ────────────────────────

type UnifiedStatus = "overdue" | "due-soon" | "upcoming" | "filed" | "na" | "no-date";

interface UnifiedEntry {
  id: string;
  kind: "ky" | "ci";
  title: string;
  authority: string;
  dueDateObj: Date | null;
  dueDateLabel: string;
  unifiedStatus: UnifiedStatus;
  // ky-specific
  filing?: Filing;
  filingStatus?: FilingStatus;
  // ci-specific
  item?: ComplianceItem;
}

function computeUnifiedStatus(
  dueDate: Date | null,
  isFiledOrComplete: boolean,
  isNa: boolean,
  today: Date,
): UnifiedStatus {
  if (isNa) return "na";
  if (isFiledOrComplete) return "filed";
  if (!dueDate) return "no-date";
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  if (d < today) return "overdue";
  const soon = new Date(today); soon.setDate(soon.getDate() + 30);
  if (d <= soon) return "due-soon";
  return "upcoming";
}

const STATUS_SORT_ORDER: Record<UnifiedStatus, number> = {
  overdue: 0, "due-soon": 1, upcoming: 2, filed: 3, na: 4, "no-date": 5,
};

function TaxCalendarTab({ year }: { year: number }) {
  const { canEdit, isOwner } = useUserPermissions();
  const { data: appSettings } = useGetSettings();
  const taxFilingFrequency = (appSettings as any)?.taxFilingFrequency ?? "quarterly";
  const annualOnly = taxFilingFrequency === "annual";
  const { isConfigured: googleConfigured, isConnected: googleConnected, getToken, signIn: googleSignIn } = useGoogleAuth();
  const { toast } = useToast();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "due-soon" | "filed" | "na">("all");
  const [showManage, setShowManage] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [drivePickingFor, setDrivePickingFor] = useState<string | null>(null);

  const { data: items = [], isLoading: loadingItems } = useComplianceItems();
  const { data: kySettings = [], isSuccess: kySettingsLoaded } = useKyFilingSettings();
  const createItem = useCreateComplianceItem();
  const updateItem = useUpdateComplianceItem();
  const deleteItem = useDeleteComplianceItem();
  const updateKyFilingSetting = useUpdateKyFilingSetting();
  const toggleKyFilingStatus = useToggleKyFilingStatus();
  const uploadKyDoc = useUploadKyFilingDocument();
  const deleteKyDoc = useDeleteKyFilingDocument();
  const uploadCiDoc = useUploadComplianceItemDocument();
  const deleteCiDoc = useDeleteComplianceItemDocument();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ComplianceItem | null>(null);
  const saving = createItem.isPending || updateItem.isPending;
  const [docLightboxUrl, setDocLightboxUrl] = useState<string | null>(null);
  const [docLightboxFileName, setDocLightboxFileName] = useState("");

  const kySettingsMap = Object.fromEntries(kySettings.map(s => [s.filingId, s]));

  // Migrate any localStorage statuses to the server on first successful load (one-time)
  const migrationDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!kySettingsLoaded || migrationDoneRef.current) return;
    migrationDoneRef.current = true;
    const storageKey = `ky-filing-statuses-${year}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, FilingStatus>;
      for (const [filingId, status] of Object.entries(saved)) {
        // Only migrate if the server has no status for this filing+year yet
        const setting = kySettingsMap[filingId];
        const serverStatus = (setting?.completions ?? {})[String(year)];
        if (!serverStatus || serverStatus === "not-filed") {
          toggleKyFilingStatus.mutate({ filingId, year, status });
        }
      }
      localStorage.removeItem(storageKey);
    } catch {}
  }, [kySettingsLoaded, year]);

  // Derive filing status from server data (kySettings completions) for the current year
  const getFilingStatus = useCallback((id: string): FilingStatus => {
    const setting = kySettingsMap[id];
    const status = (setting?.completions ?? {})[String(year)] as FilingStatus | undefined;
    return status ?? "not-filed";
  }, [kySettingsMap, year]);

  const cycleFilingStatus = useCallback((id: string) => {
    const current = getFilingStatus(id);
    const idx = STATUS_CYCLE.indexOf(current);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    toggleKyFilingStatus.mutate({ filingId: id, year, status: next });
  }, [getFilingStatus, toggleKyFilingStatus, year]);

  async function handleFileUpload(entityKey: string, file: File) {
    setUploadingFor(entityKey);
    try {
      if (entityKey.startsWith("ky-")) {
        const filingId = entityKey.slice(3);
        await uploadKyDoc.mutateAsync({ filingId, file });
      } else {
        const id = parseInt(entityKey.slice(3));
        await uploadCiDoc.mutateAsync({ id, file });
      }
    } finally {
      setUploadingFor(null);
    }
  }

  async function handleDriveUpload(entityKey: string) {
    if (!googleConnected) {
      googleSignIn(() => {
        handleDriveUpload(entityKey);
      });
      return;
    }
    setDrivePickingFor(entityKey);
    try {
      const token = await getToken();
      const file = await openDrivePicker(token);
      if (file) {
        await handleFileUpload(entityKey, file);
      }
    } catch (err: any) {
      toast({ title: "Drive error", description: err?.message ?? "Could not open Google Drive picker.", variant: "destructive" });
    } finally {
      setDrivePickingFor(null);
    }
  }

  async function handleDocDelete(entityKey: string, docIndex: number) {
    if (!confirm("Remove this document?")) return;
    if (entityKey.startsWith("ky-")) {
      const filingId = entityKey.slice(3);
      await deleteKyDoc.mutateAsync({ filingId, docIndex });
    } else {
      const id = parseInt(entityKey.slice(3));
      await deleteCiDoc.mutateAsync({ id, docIndex });
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const QUARTERLY_FILING_IDS = new Set(["est-q1", "est-q2", "est-q3", "est-q4"]);

  // Build unified list from both KY filings (filtered by enabled) and compliance items
  const kyEntries: UnifiedEntry[] = KY_FILINGS
    .filter(f => {
      if (annualOnly && QUARTERLY_FILING_IDS.has(f.id)) return false;
      const setting = kySettingsMap[f.id];
      return setting ? setting.enabled : true;
    })
    .map(f => {
      const fs = getFilingStatus(f.id);
      const dueDate = f.dueDate(year);
      const us = computeUnifiedStatus(dueDate, fs === "filed", fs === "na", today);
      return {
        id: `ky-${f.id}`, kind: "ky" as const, title: f.name, authority: f.authority,
        dueDateObj: dueDate, dueDateLabel: f.dueDateLabel(year),
        unifiedStatus: us, filing: f, filingStatus: fs,
      };
    });

  const ciEntries: UnifiedEntry[] = items
    .filter(i => i.enabled !== false)
    .map(i => {
      const [y, m, d] = i.dueDate.split("-").map(Number);
      const dueDate = new Date(y, m - 1, d);
      const us = computeUnifiedStatus(
        dueDate,
        i.computedStatus === "complete",
        false,
        today,
      );
      return {
        id: `ci-${i.id}`, kind: "ci" as const, title: i.title, authority: i.category,
        dueDateObj: dueDate, dueDateLabel: formatComplianceDate(i.dueDate),
        unifiedStatus: us, item: i,
      };
    });

  const allEntries: UnifiedEntry[] = [...kyEntries, ...ciEntries].sort((a, b) => {
    // Primary: due date ascending (null/no-date entries pushed to end)
    const aHasDate = a.dueDateObj !== null;
    const bHasDate = b.dueDateObj !== null;
    if (aHasDate && bHasDate) {
      const dateDiff = a.dueDateObj!.getTime() - b.dueDateObj!.getTime();
      if (dateDiff !== 0) return dateDiff;
    } else if (aHasDate && !bHasDate) {
      return -1;
    } else if (!aHasDate && bHasDate) {
      return 1;
    }
    // Secondary tiebreaker: status order (overdue before due-soon before upcoming, etc.)
    return STATUS_SORT_ORDER[a.unifiedStatus] - STATUS_SORT_ORDER[b.unifiedStatus];
  });

  // Summary tile counts
  const totalOverdue = allEntries.filter(e => e.unifiedStatus === "overdue").length;
  const totalDueSoon = allEntries.filter(e => e.unifiedStatus === "due-soon").length;
  const totalFiled = allEntries.filter(e => e.unifiedStatus === "filed").length;
  const totalNa = allEntries.filter(e => e.unifiedStatus === "na").length;

  // Filtered list
  const filteredEntries = allEntries.filter(e => {
    if (statusFilter === "all") return true;
    if (statusFilter === "filed") return e.unifiedStatus === "filed";
    if (statusFilter === "na") return e.unifiedStatus === "na";
    if (statusFilter === "overdue") return e.unifiedStatus === "overdue";
    if (statusFilter === "due-soon") return e.unifiedStatus === "due-soon";
    return true;
  });

  async function handleSave(data: Partial<ComplianceItem>) {
    if (editTarget) { await updateItem.mutateAsync({ id: editTarget.id, ...data }); setEditTarget(null); }
    else { await createItem.mutateAsync(data); setShowForm(false); }
  }
  async function handleToggleComplete(item: ComplianceItem) {
    await updateItem.mutateAsync({ ...item, status: item.status === "complete" ? "upcoming" : "complete" });
  }
  async function handleDelete(id: number) {
    if (!confirm("Delete this compliance item?")) return;
    await deleteItem.mutateAsync(id);
  }

  function statusRowBg(us: UnifiedStatus): string {
    if (us === "overdue") return "bg-red-50 border-red-200";
    if (us === "due-soon") return "bg-amber-50 border-amber-200";
    if (us === "filed") return "bg-emerald-50 border-emerald-200";
    if (us === "na") return "bg-muted/30 border-border";
    return "bg-card border-border";
  }

  function entryBadge(entry: UnifiedEntry): { label: string; cls: string } | null {
    const us = entry.unifiedStatus;
    if (us === "filed") return { label: entry.kind === "ky" ? "Filed" : "Complete", cls: "bg-emerald-100 text-emerald-700" };
    if (us === "na") return { label: "N/A", cls: "bg-muted text-muted-foreground" };
    if (us === "overdue") return { label: "Overdue", cls: "bg-red-100 text-red-700" };
    if (us === "due-soon") {
      if (entry.dueDateObj) {
        const days = Math.ceil((entry.dueDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { label: days <= 0 ? "Due today" : `Due in ${days}d`, cls: "bg-amber-100 text-amber-700" };
      }
      return { label: "Due Soon", cls: "bg-amber-100 text-amber-700" };
    }
    return null;
  }

  return (
    <div className="space-y-6">
      {isOwner && !annualOnly && <QuarterlyTaxTracker year={year} />}
      {isOwner && annualOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Annual filing mode is on</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Quarterly estimated tax deadlines and the payment tracker are hidden. All your payment history is safely preserved.
              To re-enable, go to <strong>Settings → Financial → Tax Filing Frequency</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Add Item form */}
      {(showForm || editTarget) && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-amber-500" />
              {editTarget ? "Edit Compliance Item" : "New Compliance Item"}
            </h4>
            <button onClick={() => { setShowForm(false); setEditTarget(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ComplianceItemForm initial={editTarget ?? undefined} onSave={handleSave} onCancel={() => { setShowForm(false); setEditTarget(null); }} saving={saving} />
        </div>
      )}

      {/* Combined summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: "overdue" as const, label: "Overdue", count: totalOverdue, icon: XCircle, active: "bg-red-50 border-red-200 text-red-600", inactive: "bg-card border-border text-muted-foreground" },
          { key: "due-soon" as const, label: "Due Soon", count: totalDueSoon, icon: Clock, active: "bg-amber-50 border-amber-200 text-amber-600", inactive: "bg-card border-border text-muted-foreground" },
          { key: "filed" as const, label: "Filed / Complete", count: totalFiled, icon: CheckCircle, active: "bg-emerald-50 border-emerald-200 text-emerald-600", inactive: "bg-card border-border text-emerald-600" },
          { key: "na" as const, label: "N/A", count: totalNa, icon: Shield, active: "bg-muted border-border text-muted-foreground", inactive: "bg-card border-border text-muted-foreground" },
        ].map(({ key, label, count, icon: Icon, active, inactive }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(prev => prev === key ? "all" : key)}
            className={`rounded-xl border p-4 flex items-center gap-3 transition-all hover:shadow-sm active:scale-95 ${statusFilter === key ? active + " ring-2 ring-offset-1 ring-gray-300" : count > 0 && (key === "overdue" || key === "due-soon") ? active : inactive}`}
          >
            <Icon className="w-6 h-6 flex-shrink-0" />
            <div className="text-left">
              <p className="text-2xl font-display font-bold">{count}</p>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {statusFilter !== "all" && (
            <>
              <span className="text-sm text-muted-foreground">Filtering: <strong>{statusFilter === "filed" ? "Filed / Done" : statusFilter === "due-soon" ? "Due Soon" : statusFilter === "na" ? "N/A" : "Overdue"}</strong></span>
              <button onClick={() => setStatusFilter("all")} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs hover:bg-muted/80 transition-colors">
                <X className="w-3 h-3" /> Clear
              </button>
            </>
          )}
          {statusFilter === "all" && (
            <span className="text-xs text-muted-foreground">{allEntries.length} active items, sorted by due date</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManage(v => !v)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold transition-all ${showManage ? "bg-primary/10 text-primary border border-primary/30" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage Items
          </button>
          {canEdit("invoices") && (
            <button
              onClick={() => { setShowForm(true); setEditTarget(null); }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* Manage Items panel */}
      {showManage && (
        <div className="bg-white rounded-2xl border border-primary/20 shadow-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Manage Visible Items
            </h4>
            <button onClick={() => setShowManage(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Toggle items off to hide them from the calendar. Data is preserved and can be re-enabled at any time.</p>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Built-in Filings (KY/Federal)</p>
            {KY_FILINGS.map(f => {
              const setting = kySettingsMap[f.id];
              const isEnabled = setting ? setting.enabled : true;
              return (
                <div key={f.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{f.authority}</p>
                  </div>
                  <button
                    onClick={() => updateKyFilingSetting.mutate({ filingId: f.id, enabled: !isEnabled })}
                    className={`ml-3 flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${isEnabled ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {isEnabled ? "Visible" : "Hidden"}
                  </button>
                </div>
              );
            })}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">My Custom Items</p>
            {items.length === 0 && <p className="text-xs text-muted-foreground px-3">No custom items added yet.</p>}
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                </div>
                <button
                  onClick={() => updateItem.mutate({ ...item, enabled: !item.enabled })}
                  className={`ml-3 flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${item.enabled !== false ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {item.enabled !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {item.enabled !== false ? "Visible" : "Hidden"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unified sorted list */}
      {loadingItems && items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm animate-pulse">Loading…</div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm rounded-2xl border border-dashed border-border">
          {statusFilter === "all" ? "No items to show." : "No items match this filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map(entry => {
            const isExpanded = expandedIds[entry.id];
            const badge = entryBadge(entry);
            const rowBg = statusRowBg(entry.unifiedStatus);

            if (entry.kind === "ky" && entry.filing && entry.filingStatus !== undefined) {
              const filing = entry.filing;
              const filingStatus = entry.filingStatus;
              const dateStyle = entry.unifiedStatus === "overdue" ? "text-red-600 font-semibold"
                : entry.unifiedStatus === "due-soon" ? "text-amber-600 font-semibold"
                : "text-muted-foreground";

              return (
                <div key={entry.id} className={`rounded-2xl border ${rowBg} overflow-hidden transition-colors`}>
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => cycleFilingStatus(filing.id)}
                        className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors mt-0.5 ${
                          filingStatus === "filed" ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200" :
                          filingStatus === "na" ? "bg-muted text-muted-foreground hover:bg-muted/80" :
                          "bg-background border border-border text-muted-foreground hover:bg-muted/40"
                        }`}
                        title={`Status: ${filingStatus === "not-filed" ? "Not Filed" : filingStatus === "filed" ? "Filed" : "N/A"} — click to cycle`}
                      >
                        {filingStatus === "filed" ? <CheckCircle className="w-4 h-4" /> :
                         filingStatus === "na" ? <XCircle className="w-3.5 h-3.5" /> :
                         <Clock className="w-3.5 h-3.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className={`font-semibold text-sm text-foreground ${filingStatus === "na" ? "opacity-50" : ""}`}>{filing.name}</span>
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wide">KY / Federal</span>
                          {badge && <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>{badge.label}</span>}
                          {filing.conditional && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{filing.conditional}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1.5">{filing.authority} · {filing.description}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className={`flex items-center gap-1 ${dateStyle}`}><Calendar className="w-3.5 h-3.5" />{filing.dueDateLabel(year)}</span>
                          {filing.fee !== "No state fee" && filing.fee !== "Pay estimated tax owed" && (
                            <span className="flex items-center gap-1 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" />{filing.fee}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <a href={filing.link} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors">
                          <ExternalLink className="w-3 h-3" /><span className="hidden sm:inline">File</span>
                        </a>
                        <button onClick={() => setExpandedIds(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                          className="h-7 w-7 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-4 bg-background/50 space-y-3">
                      <p className="text-sm text-foreground leading-relaxed">{filing.learnMore}</p>
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700"><strong>Penalty:</strong> {filing.penalty}</p>
                      </div>
                      {/* Documents section */}
                      {(() => {
                        const entityKey = `ky-${filing.id}`;
                        const kyDoc = kySettingsMap[filing.id];
                        const docs: ComplianceDoc[] = kyDoc?.documents ?? [];
                        const isUploading = uploadingFor === entityKey;
                        const isDrivePicking = drivePickingFor === entityKey;
                        return (
                          <div className="border-t border-border/30 pt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Paperclip className="w-3 h-3" /> Documents</span>
                              <div className="flex items-center gap-1.5">
                                {googleConfigured && (
                                  <button
                                    type="button"
                                    disabled={isDrivePicking || isUploading}
                                    onClick={() => handleDriveUpload(entityKey)}
                                    title={googleConnected ? "Pick from Google Drive" : "Connect Google to pick from Drive"}
                                    className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${isDrivePicking ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"}`}
                                  >
                                    {isDrivePicking ? <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <HardDrive className="w-3 h-3" />}
                                    {isDrivePicking ? "Picking…" : "Drive"}
                                  </button>
                                )}
                                <label className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${isUploading ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}>
                                  {isUploading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
                                  {isUploading ? "Uploading…" : "Attach"}
                                  <input type="file" className="hidden" disabled={isUploading}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload(entityKey, f); e.target.value = ""; } }} />
                                </label>
                              </div>
                            </div>
                            {docs.length === 0 && <p className="text-xs text-muted-foreground italic">No documents attached.</p>}
                            {docs.map((doc, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-1.5">
                                <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const url = `${BASE}${doc.servingUrl ?? `/api/storage/objects${doc.objectPath.slice("/objects".length)}`}`;
                                    setDocLightboxFileName(doc.fileName);
                                    setDocLightboxUrl(url);
                                  }}
                                  className="flex-1 text-xs text-primary hover:underline truncate text-left"
                                >{doc.fileName}</button>
                                <button onClick={() => handleDocDelete(entityKey, idx)}
                                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            }

            if (entry.kind === "ci" && entry.item) {
              const item = entry.item;
              const s = entry.unifiedStatus;
              const borderCls = s === "overdue" ? "border-red-200"
                : s === "due-soon" ? "border-amber-200"
                : s === "filed" ? "border-emerald-200"
                : "border-border";
              const barCls = s === "overdue" ? "bg-red-400"
                : s === "due-soon" ? "bg-amber-400"
                : s === "filed" ? "bg-emerald-400"
                : "bg-blue-400";

              const ciEntityKey = `ci-${item.id}`;
              const isCiUploading = uploadingFor === ciEntityKey;
              const ciDocs: ComplianceDoc[] = Array.isArray(item.documents) ? item.documents : [];

              return (
                <div key={entry.id} className={`bg-card rounded-2xl border shadow-sm transition-all hover:shadow-md ${borderCls} ${s === "filed" ? "opacity-70" : ""} overflow-hidden`}>
                  <div className="p-4 flex gap-4">
                    <div className={`flex-shrink-0 w-1 rounded-full ${barCls}`} />
                    <div className="text-xl flex-shrink-0 mt-0.5">{complianceCategoryIcon(item.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <span className={`font-semibold text-foreground leading-tight text-sm ${s === "filed" ? "line-through opacity-60" : ""}`}>{item.title}</span>
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-wide">My Item</span>
                            {badge && <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>{badge.label}</span>}
                            {ciDocs.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700">
                                <Paperclip className="w-2.5 h-2.5" />{ciDocs.length}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {s === "filed" ? "Completed" : item.daysUntilDue < 0 ? `${Math.abs(item.daysUntilDue)}d overdue` : item.daysUntilDue === 0 ? "Due today" : `${item.daysUntilDue}d away`}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {canEdit("invoices") && (
                            <>
                              <button onClick={() => handleToggleComplete(item)} title={s === "filed" ? "Mark upcoming" : "Mark complete"}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => { setEditTarget(item); setShowForm(false); }} title="Edit"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(item.id)} title="Delete"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button onClick={() => setExpandedIds(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                            className="w-7 h-7 rounded-lg bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3" />{formatComplianceDate(item.dueDate)}</span>
                        {item.jurisdiction && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.jurisdiction}</span>}
                        {item.recurrence !== "one-time" && (
                          <span className="flex items-center gap-1 capitalize"><RefreshCw className="w-3 h-3" />{COMPLIANCE_RECURRENCES.find(r => r.value === item.recurrence)?.label}</span>
                        )}
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">{item.category}</span>
                      </div>
                      {item.notes && (
                        <p className="mt-2 text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-lg px-2.5 py-1.5 border border-border">{item.notes}</p>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-3 bg-background/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Paperclip className="w-3 h-3" /> Documents</span>
                        <div className="flex items-center gap-1.5">
                          {googleConfigured && (
                            <button
                              type="button"
                              disabled={drivePickingFor === ciEntityKey || isCiUploading}
                              onClick={() => handleDriveUpload(ciEntityKey)}
                              title={googleConnected ? "Pick from Google Drive" : "Connect Google to pick from Drive"}
                              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${drivePickingFor === ciEntityKey ? "bg-muted text-muted-foreground" : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"}`}
                            >
                              {drivePickingFor === ciEntityKey ? <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <HardDrive className="w-3 h-3" />}
                              {drivePickingFor === ciEntityKey ? "Picking…" : "Drive"}
                            </button>
                          )}
                          <label className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${isCiUploading ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary hover:bg-primary/20"}`}>
                            {isCiUploading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
                            {isCiUploading ? "Uploading…" : "Attach"}
                            <input type="file" className="hidden" disabled={isCiUploading}
                              onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileUpload(ciEntityKey, f); e.target.value = ""; } }} />
                          </label>
                        </div>
                      </div>
                      {ciDocs.length === 0 && <p className="text-xs text-muted-foreground italic">No documents attached.</p>}
                      {ciDocs.map((doc, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-1.5">
                          <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${BASE}${doc.servingUrl ?? `/api/storage/objects${doc.objectPath.slice("/objects".length)}`}`;
                              setDocLightboxFileName(doc.fileName);
                              setDocLightboxUrl(url);
                            }}
                            className="flex-1 text-xs text-primary hover:underline truncate text-left"
                          >{doc.fileName}</button>
                          <button onClick={() => handleDocDelete(ciEntityKey, idx)}
                            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* CPA Disclaimer */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          <strong>Informational only — consult a CPA.</strong> Filing deadlines, fees, and requirements can change.
          Always verify with the relevant authority before filing.
          Kentucky SBDC (<a href="https://kysbdc.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">kysbdc.com</a>) offers free small-business advising.
        </p>
      </div>

      {/* ── Compliance Document Lightbox ───────────────────────────────────── */}
      {docLightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 overflow-hidden"
          onClick={() => setDocLightboxUrl(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setDocLightboxUrl(null); }}
            className="absolute z-10 right-4 flex items-center gap-1.5 text-white font-bold text-sm bg-black/70 hover:bg-black/90 px-4 py-2 rounded-xl border border-white/30 backdrop-blur-sm transition-colors"
            style={{ top: "max(16px, env(safe-area-inset-top, 16px))" }}
          >
            <X className="w-4 h-4" /> Close
          </button>
          <div
            className="absolute inset-0 flex items-center justify-center px-4 overflow-hidden"
            style={{ paddingTop: "calc(max(52px, env(safe-area-inset-top, 52px)) + 32px)" }}
          >
            <div
              className="flex flex-col items-center gap-6 p-8 text-center rounded-2xl bg-white/8 border border-white/12 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <FileText className="w-16 h-16 text-white/30" />
              <div>
                <p className="text-white font-semibold text-lg truncate max-w-xs">{docLightboxFileName}</p>
                <p className="text-white/50 text-sm mt-1">Tap "Open" to view in a new tab</p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <a
                  href={docLightboxUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                >
                  <ExternalLink className="w-4 h-4" /> Open
                </a>
                <a
                  href={docLightboxUrl}
                  download={docLightboxFileName}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-white/15 text-white rounded-xl font-semibold hover:bg-white/25 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
              </div>
            </div>
          </div>
          <div
            className="absolute left-0 right-0 text-center text-white/30 text-xs pointer-events-none"
            style={{ bottom: "max(16px, env(safe-area-inset-bottom, 16px))" }}
          >
            Tap anywhere outside to close
          </div>
        </div>
      )}
    </div>
  );
}


export default TaxCalendarTab;
