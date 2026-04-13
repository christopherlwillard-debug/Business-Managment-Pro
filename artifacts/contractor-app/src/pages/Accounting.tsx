import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, MapPin, Receipt,
  Navigation, HardHat, FileSpreadsheet, Printer, AlertCircle, CheckCircle2,
  Download, FileText, BarChart3, AlertTriangle, Calendar, ExternalLink,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Shield,
  Plus, Pencil, CalendarClock, RefreshCw, Trash2, Bell,
  FileCheck, X, ChevronRight, Home,
  Upload, Eye, EyeOff, Settings2, Paperclip, HardDrive,
} from "lucide-react";
import { useScheduleCReport } from "@workspace/api-client-react";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { openDrivePicker } from "@/lib/googleDrivePicker";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function downloadCSV(records: any[], year: number) {
  const OWENSBORO_OCC_RATE = 0.0139;
  const headers = ["Type", "Invoice #", "Date", "Client / Source", "Description", "City", "State", "Subtotal", "Est. Occ. Tax", "Total", "Status", "Payment Method"];
  const rows = records.map((r: any) => {
    const isOwensboro = (r.city ?? "").trim().toLowerCase() === "owensboro";
    const estOccTax = isOwensboro ? ((r.total ?? 0) * OWENSBORO_OCC_RATE) : 0;
    return [
      r.type === "other_income" ? "Other Income" : "Invoice",
      r.invoiceNumber ?? "", r.issueDate ?? "", r.clientName ?? "",
      r.jobTitle ?? "",
      r.city ?? "", r.state ?? "",
      r.subtotal?.toFixed(2) ?? "0.00", estOccTax.toFixed(2),
      r.total?.toFixed(2) ?? "0.00", r.status ?? "",
      r.paymentMethod ?? "",
    ];
  });
  const csvContent = [headers, ...rows].map(row =>
    row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
  ).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `tax-records-${year}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const OTHER_INCOME_API = `${BASE}/api/other-income`;
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash", check: "Check", bank_transfer: "Bank Transfer", other: "Other",
};

function useOtherIncome(year: number) {
  return useQuery<any[]>({
    queryKey: ["other-income", year],
    queryFn: async () => {
      const res = await fetch(`${OTHER_INCOME_API}?startDate=${year}-01-01&endDate=${year}-12-31`);
      if (!res.ok) throw new Error("Failed to load other income");
      return res.json();
    },
  });
}

function useCreateOtherIncome(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(OTHER_INCOME_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["other-income", year] }); qc.invalidateQueries({ queryKey: ["accounting", year] }); },
  });
}

function useUpdateOtherIncome(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await fetch(`${OTHER_INCOME_API}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["other-income", year] }); qc.invalidateQueries({ queryKey: ["accounting", year] }); },
  });
}

function useDeleteOtherIncome(year: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`${OTHER_INCOME_API}/${id}`, { method: "DELETE" }); if (!res.ok && res.status !== 204) throw new Error("Failed to delete"); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["other-income", year] }); qc.invalidateQueries({ queryKey: ["accounting", year] }); },
  });
}

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

async function fetchAccounting(year: number) {
  const res = await fetch(`${BASE}/api/reports/accounting?year=${year}`);
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

// ─── Tax Spend Planner ────────────────────────────────────────────────────────
function TaxSpendPlanner({ netProfit, estimatedTaxes }: {
  netProfit: number;
  estimatedTaxes: { owensboroOccTax: number; kyStateTax: number; federalSETax: number; totalEstimated: number };
}) {
  const [targetTax, setTargetTax] = useState(String(Math.round(estimatedTaxes.totalEstimated * 0.5)));

  const KY_RATE = 0.04;
  const FED_RATE = 0.9235 * 0.153;
  const COMBINED_RATE = KY_RATE + FED_RATE;

  const fixedTax = estimatedTaxes.owensboroOccTax;
  const currentIncomeTax = estimatedTaxes.kyStateTax + estimatedTaxes.federalSETax;
  const currentTotal = estimatedTaxes.totalEstimated;

  const target = Math.max(0, parseFloat(targetTax) || 0);
  const minAchievable = fixedTax;
  const clampedTarget = Math.max(target, minAchievable);

  const targetIncomeTax = Math.max(0, clampedTarget - fixedTax);
  const targetNetProfit = COMBINED_RATE > 0 ? targetIncomeTax / COMBINED_RATE : 0;
  const spendingNeeded = Math.max(0, netProfit - targetNetProfit);
  const taxSavings = Math.max(0, currentTotal - clampedTarget);
  const canReachTarget = target >= minAchievable;

  return (
    <div className="bg-card border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-amber-50/80 border-b border-amber-200 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-sm text-amber-900">Tax Spend Planner</span>
        <span className="text-xs text-amber-700/70 ml-1">— How much to spend to hit your target tax bill</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/30 rounded-xl p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Current Tax Bill</p>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(currentTotal)}</p>
          </div>
          <div className="bg-muted/30 rounded-xl p-3">
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">I want to owe</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={targetTax}
                onChange={e => setTargetTax(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 border border-border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 bg-background"
              />
            </div>
          </div>
        </div>

        {!canReachTarget ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Note:</strong> Your Owensboro Occupational Tax ({formatCurrency(fixedTax)}) is based on gross revenue earned in Owensboro — it can't be reduced by spending more. The lowest you can bring your total bill to is <strong>{formatCurrency(minAchievable)}</strong>.
          </div>
        ) : spendingNeeded < 1 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 font-medium">
            You're already at or below your target. Your current deductible expenses have your tax bill where you want it.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-700 font-semibold uppercase tracking-wider mb-1">Additional Deductible Spending Needed</p>
              <p className="text-3xl font-black text-blue-800">{formatCurrency(spendingNeeded)}</p>
              <p className="text-xs text-blue-600 mt-1">Spend this on deductible business expenses to bring your tax bill from {formatCurrency(currentTotal)} down to {formatCurrency(clampedTarget)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground">Tax savings</p>
                <p className="font-bold text-emerald-700">{formatCurrency(taxSavings)}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground">SE + KY rate</p>
                <p className="font-bold text-foreground">{(COMBINED_RATE * 100).toFixed(1)}¢/dollar</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-muted-foreground">Income tax left</p>
                <p className="font-bold text-foreground">{formatCurrency(currentIncomeTax - taxSavings)}</p>
              </div>
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground italic">Estimate only. Every deductible dollar you spend reduces net profit, saving ~{(COMBINED_RATE * 100).toFixed(1)} cents in federal SE + KY state tax. Consult a tax professional for your specific situation.</p>
      </div>
    </div>
  );
}

// ─── Overview Dashboard ──────────────────────────────────────────────────────

type ModuleKey = "city" | "monthly" | "expenses" | "mileage" | "subs" | "records" | "other_income";

function OverviewTab({ data, year }: { data: any; year: number }) {
  const [openModule, setOpenModule] = useState<ModuleKey | null>(null);
  const s = data?.summary ?? {};
  const netProfit = s.netProfit ?? 0;
  const otherIncomeTotal: number = s.otherIncomeTotal ?? 0;

  const { data: otherIncomeRows = [], isLoading: oiLoading } = useOtherIncome(year);
  const createOI = useCreateOtherIncome(year);
  const updateOI = useUpdateOtherIncome(year);
  const deleteOI = useDeleteOtherIncome(year);
  const [oiForm, setOiForm] = useState<null | Partial<{ id: number; amount: string; date: string; description: string; source: string; paymentMethod: string; city: string; state: string; notes: string }>>(null);
  const [oiSaving, setOiSaving] = useState(false);

  const { canEdit } = useUserPermissions();

  function openAddOI() {
    setOiForm({ amount: "", date: new Date().toISOString().split("T")[0], description: "", source: "", paymentMethod: "cash", city: "", state: "", notes: "" });
    setOpenModule("other_income");
  }
  function openEditOI(row: any) {
    setOiForm({ id: row.id, amount: String(row.amount), date: row.date, description: row.description, source: row.source ?? "", paymentMethod: row.paymentMethod ?? "cash", city: row.city ?? "", state: row.state ?? "", notes: row.notes ?? "" });
    setOpenModule("other_income");
  }
  async function handleSaveOI(e: React.FormEvent) {
    e.preventDefault();
    if (!oiForm) return;
    setOiSaving(true);
    try {
      const payload = { amount: oiForm.amount, date: oiForm.date, description: oiForm.description, source: oiForm.source || null, paymentMethod: oiForm.paymentMethod || "other", city: oiForm.city || null, state: oiForm.state || null, notes: oiForm.notes || null };
      if (oiForm.id) { await updateOI.mutateAsync({ id: oiForm.id, ...payload }); }
      else { await createOI.mutateAsync(payload); }
      setOiForm(null);
    } catch { } finally { setOiSaving(false); }
  }
  async function handleDeleteOI(id: number) {
    if (!confirm("Delete this income entry?")) return;
    await deleteOI.mutateAsync(id);
  }

  function toggleModule(key: ModuleKey) {
    setOpenModule(prev => prev === key ? null : key);
  }

  const statTiles = [
    { label: "Gross Revenue", value: formatCurrency(s.grossRevenue), sub: otherIncomeTotal > 0 ? `Invoices + ${formatCurrency(otherIncomeTotal)} other` : "All invoices", icon: TrendingUp, color: "bg-emerald-100 text-emerald-700", border: "border-l-emerald-500" },
    { label: "Collected", value: formatCurrency(s.paidRevenue), sub: otherIncomeTotal > 0 ? "Paid invoices + other income" : "Paid invoices", icon: DollarSign, color: "bg-blue-100 text-blue-700", border: "border-l-blue-500" },
    { label: "Business Expenses (excl. mileage)", value: formatCurrency(s.totalExpenses), sub: `+${formatCurrency(s.mileageDeduction ?? 0)} mileage`, icon: TrendingDown, color: "bg-red-100 text-red-700", border: "border-l-red-500" },
    { label: "Est. Net Profit", value: formatCurrency(netProfit), sub: "Collected − Expenses − Mileage", icon: netProfit >= 0 ? TrendingUp : TrendingDown, color: netProfit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700", border: netProfit >= 0 ? "border-l-emerald-500" : "border-l-red-500" },
  ];

  const modules: { key: ModuleKey; label: string; icon: any; stat: string; statLabel: string; color: string }[] = [
    {
      key: "city", label: "Income by City", icon: MapPin,
      stat: data?.incomeByCity?.length > 0 ? `${data.incomeByCity.length} cities` : "No data",
      statLabel: "For local tax filings", color: "text-primary",
    },
    {
      key: "monthly", label: "Monthly Trend", icon: BarChart3,
      stat: data?.monthlyIncome?.filter((m: any) => m.gross > 0 || m.expenses > 0).length > 0
        ? `${data.monthlyIncome.filter((m: any) => m.gross > 0 || m.expenses > 0).length} active months`
        : "No activity",
      statLabel: `${year} breakdown`, color: "text-violet-600",
    },
    {
      key: "expenses", label: "Expense Breakdown", icon: Receipt,
      stat: s.totalExpenses > 0 ? formatCurrency(s.totalExpenses) : "$0",
      statLabel: "Total categorized", color: "text-orange-600",
    },
    {
      key: "mileage", label: "Mileage & Deductions", icon: Navigation,
      stat: s.totalMiles ? `${s.totalMiles.toFixed(0)} mi` : "0 mi",
      statLabel: formatCurrency(s.mileageDeduction ?? 0) + " deduction", color: "text-violet-600",
    },
    {
      key: "subs", label: "Subcontractor / 1099", icon: HardHat,
      stat: data?.subcontractor1099?.length > 0 ? `${data.subcontractor1099.length} subs` : "None",
      statLabel: formatCurrency(s.totalSubPayments ?? 0) + " total paid", color: "text-amber-600",
    },
    {
      key: "records", label: "Tax Records", icon: FileSpreadsheet,
      stat: data?.invoiceRecords?.length > 0 ? `${data.invoiceRecords.length} entries` : "No records",
      statLabel: "Full ledger · CSV export", color: "text-emerald-600",
    },
    {
      key: "other_income", label: "Other Income", icon: DollarSign,
      stat: otherIncomeTotal > 0 ? formatCurrency(otherIncomeTotal) : "$0",
      statLabel: `${otherIncomeRows.length} entr${otherIncomeRows.length !== 1 ? "ies" : "y"} · Non-invoice income`, color: "text-teal-600",
    },
  ];

  return (
    <div className="space-y-6">
      {s.pendingRevenue > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{formatCurrency(s.pendingRevenue)} pending (sent/overdue) — not yet counted in net profit.</span>
        </div>
      )}

      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statTiles.map(t => (
          <div key={t.label} className={`bg-card border border-border rounded-2xl p-4 shadow-sm border-l-4 ${t.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.color}`}>
                <t.icon className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t.label}</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">{t.value}</p>
            {t.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</p>}
          </div>
        ))}
      </div>

      {/* Tax Spend Planner */}
      {data.estimatedTaxes && (
        <TaxSpendPlanner netProfit={netProfit} estimatedTaxes={data.estimatedTaxes} />
      )}

      {/* Module cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {modules.map(mod => {
          const isOpen = openModule === mod.key;
          return (
            <button
              key={mod.key}
              onClick={() => toggleModule(mod.key)}
              className={`text-left rounded-2xl border p-4 transition-all hover:shadow-md active:scale-[0.98] ${
                isOpen
                  ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
                  : "bg-card border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isOpen ? "bg-primary/10" : "bg-muted/60"}`}>
                  <mod.icon className={`w-4 h-4 ${isOpen ? "text-primary" : mod.color}`} />
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-primary" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                }
              </div>
              <p className="font-semibold text-sm text-foreground mb-0.5">{mod.label}</p>
              <p className={`text-lg font-display font-bold ${isOpen ? "text-primary" : mod.color}`}>{mod.stat}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{mod.statLabel}</p>
            </button>
          );
        })}
      </div>

      {/* Expanded panel — only one open at a time */}
      {openModule === "city" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Income by City / Location</span>
            <span className="text-xs text-muted-foreground ml-1">— For KY local occupational tax filing</span>
          </div>
          {data.incomeByCity.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No invoices with location data yet. Add a city to your invoices to see this report.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="px-5 py-3 text-left">City</th>
                    <th className="px-5 py-3 text-left">State</th>
                    <th className="px-5 py-3 text-right">Invoices</th>
                    <th className="px-5 py-3 text-right">Gross Income</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                    <th className="px-5 py-3 text-right">Est. Occ. Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data.incomeByCity.map((row: any) => (
                    <tr key={`${row.city}-${row.state}`} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-semibold text-foreground">{row.city}</td>
                      <td className="px-5 py-3 text-muted-foreground">{row.state || "—"}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{row.invoiceCount}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.gross)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 font-medium">{formatCurrency(row.paid)}</td>
                      <td className="px-5 py-3 text-right text-amber-600 font-medium">{formatCurrency(row.estOccTax ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 border-t border-border font-semibold text-sm">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-foreground">Totals</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.gross, 0))}</td>
                    <td className="px-5 py-3 text-right text-emerald-600">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + r.paid, 0))}</td>
                    <td className="px-5 py-3 text-right text-amber-600">{formatCurrency(data.incomeByCity.reduce((s: number, r: any) => s + (r.estOccTax ?? 0), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Estimated Taxes Owed panel */}
          {data.estimatedTaxes && (
            <div className="border-t border-border">
              <div className="px-5 py-3 bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-200/50">
                <span className="font-semibold text-sm text-amber-900 dark:text-amber-300">Estimated Taxes Owed — YTD</span>
                <span className="text-xs text-amber-700/70 dark:text-amber-400/70 ml-2">Based on net profit after expenses &amp; mileage</span>
              </div>
              <div className="divide-y divide-border/50">
                <div className="px-5 py-3 flex justify-between items-center text-sm">
                  <span className="text-foreground">Owensboro Occupational Tax <span className="text-xs text-muted-foreground">({((data.estimatedTaxes.owensboroOccRate ?? 0.0139) * 100).toFixed(2)}% of Owensboro gross)</span></span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(data.estimatedTaxes.owensboroOccTax)}</span>
                </div>
                <div className="px-5 py-3 flex justify-between items-center text-sm">
                  <span className="text-foreground">Kentucky State Income Tax <span className="text-xs text-muted-foreground">(4.0% flat rate on net profit)</span></span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(data.estimatedTaxes.kyStateTax)}</span>
                </div>
                <div className="px-5 py-3 flex justify-between items-center text-sm">
                  <span className="text-foreground">Federal Self-Employment Tax <span className="text-xs text-muted-foreground">(15.3% × 92.35% of net profit)</span></span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(data.estimatedTaxes.federalSETax)}</span>
                </div>
                <div className="px-5 py-3 flex justify-between items-center text-sm bg-amber-50/80 dark:bg-amber-900/20 font-semibold">
                  <span className="text-foreground">Total Estimated Tax Liability</span>
                  <span className="text-amber-800 dark:text-amber-300 text-base">{formatCurrency(data.estimatedTaxes.totalEstimated)}</span>
                </div>
              </div>
              <div className="px-5 py-2 bg-muted/30 border-t border-border">
                <p className="text-xs text-muted-foreground italic">Estimates only — actual liability depends on deductions, filing status, and other income. Consult a tax professional for your exact figures.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {openModule === "monthly" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-600" />
            <span className="font-semibold text-sm text-foreground">Monthly Income vs. Expenses — {year}</span>
          </div>
          <div className="overflow-x-auto">
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
                {(data.monthlyIncome as any[]).filter((m: any) => m.gross > 0 || m.expenses > 0).length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No data for {year}</td></tr>
                ) : (
                  (data.monthlyIncome as any[]).filter((m: any) => m.gross > 0 || m.expenses > 0).map((m: any) => {
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openModule === "expenses" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-600" />
            <span className="font-semibold text-sm text-foreground">Expense Breakdown — Schedule C Categories</span>
          </div>
          {data.expensesByCategory.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No expenses recorded for {year}.
            </div>
          ) : (
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
          )}
        </div>
      )}

      {openModule === "mileage" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
            <Navigation className="w-4 h-4 text-violet-600" />
            <span className="font-semibold text-sm text-foreground">Mileage & Deductions</span>
            <span className="text-xs text-muted-foreground ml-1">IRS rate: ${s.mileageRate?.toFixed(3)}/mile</span>
          </div>
          <div className="p-5 grid grid-cols-3 gap-4">
            {[
              { label: "Business Miles", value: s.totalMiles?.toFixed(1) ?? "0", sub: "Tracked this year", icon: Navigation, color: "bg-violet-100 text-violet-600" },
              { label: "IRS Deduction", value: formatCurrency(s.mileageDeduction), sub: `@ $${s.mileageRate?.toFixed(3)}/mi`, icon: DollarSign, color: "bg-emerald-100 text-emerald-600" },
              { label: "Sub Payments", value: formatCurrency(s.totalSubPayments), sub: "Total YTD", icon: HardHat, color: "bg-orange-100 text-orange-600" },
            ].map(t => (
              <div key={t.label} className="bg-muted/30 rounded-xl p-4 flex gap-3 items-start">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.color}`}>
                  <t.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t.label}</p>
                  <p className="text-xl font-display font-bold text-foreground">{t.value}</p>
                  <p className="text-[11px] text-muted-foreground">{t.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {openModule === "subs" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
            <HardHat className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-sm text-foreground">Subcontractor / 1099 Report</span>
            <span className="text-xs text-muted-foreground ml-1">$600 threshold for {year}</span>
          </div>
          {data.subcontractor1099.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <HardHat className="w-8 h-8 mx-auto mb-2 opacity-20" />No subcontractors on file.
            </div>
          ) : (
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
          )}
        </div>
      )}

      {openModule === "records" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-sm text-foreground">Tax Records — All Invoices</span>
              <span className="text-xs text-muted-foreground ml-1">Full ledger for {year}</span>
            </div>
            <button
              onClick={() => data.invoiceRecords?.length > 0 && downloadCSV(data.invoiceRecords, year)}
              disabled={!data.invoiceRecords?.length}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Download CSV
            </button>
          </div>
          {(!data.invoiceRecords || data.invoiceRecords.length === 0) ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No invoices found for {year}.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left">Invoice #</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">City</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(data.invoiceRecords as any[]).map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">{r.invoiceNumber}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{r.issueDate}</td>
                        <td className="px-4 py-2.5 font-medium">{r.clientName || "—"}</td>
                        <td className="px-4 py-2.5">
                          {r.city
                            ? <span className="inline-flex items-center gap-1 text-primary font-medium text-xs"><MapPin className="w-3 h-3" />{r.city}</span>
                            : <span className="text-muted-foreground italic text-xs">No city</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(r.subtotal)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-600">{r.taxAmount > 0 ? formatCurrency(r.taxAmount) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(r.total)}</td>
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
                      <td colSpan={4} className="px-4 py-3 text-foreground">{data.invoiceRecords.length} invoice{data.invoiceRecords.length !== 1 ? "s" : ""}</td>
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
                  <strong>KY Occupational Tax tip:</strong> Use the City column to determine which city jurisdictions you owe local occupational tax to. Download the CSV to attach to your city tax filings.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {openModule === "other_income" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-muted/40 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-sm text-foreground">Other Income — {year}</span>
              <span className="text-xs text-muted-foreground ml-1">Cash jobs, pre-app payments, retainers, etc.</span>
            </div>
            {canEdit("invoices") && !oiForm && (
              <button
                onClick={openAddOI}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Entry
              </button>
            )}
          </div>

          {/* Add / Edit form */}
          {oiForm && (
            <form onSubmit={handleSaveOI} className="px-5 py-4 border-b border-border bg-muted/20 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">{oiForm.id ? "Edit Entry" : "New Other Income"}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Amount *</label>
                  <input type="number" step="0.01" min="0" required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="0.00"
                    value={oiForm.amount ?? ""}
                    onChange={e => setOiForm(f => f ? { ...f, amount: e.target.value } : f)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Date *</label>
                  <input type="date" required
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    value={oiForm.date ?? ""}
                    onChange={e => setOiForm(f => f ? { ...f, date: e.target.value } : f)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Description *</label>
                <input type="text" required
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="e.g. Cash payment for fence repair"
                  value={oiForm.description ?? ""}
                  onChange={e => setOiForm(f => f ? { ...f, description: e.target.value } : f)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Received From</label>
                  <input type="text"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="Client or payer name (optional)"
                    value={oiForm.source ?? ""}
                    onChange={e => setOiForm(f => f ? { ...f, source: e.target.value } : f)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Method</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    value={oiForm.paymentMethod ?? "cash"}
                    onChange={e => setOiForm(f => f ? { ...f, paymentMethod: e.target.value } : f)}
                  >
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
                  <input type="text"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="e.g. Lexington (optional)"
                    value={oiForm.city ?? ""}
                    onChange={e => setOiForm(f => f ? { ...f, city: e.target.value } : f)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">State</label>
                  <input type="text" maxLength={2}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="e.g. KY (optional)"
                    value={oiForm.state ?? ""}
                    onChange={e => setOiForm(f => f ? { ...f, state: e.target.value.toUpperCase() } : f)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes</label>
                <input type="text"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="Optional notes"
                  value={oiForm.notes ?? ""}
                  onChange={e => setOiForm(f => f ? { ...f, notes: e.target.value } : f)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOiForm(null)}
                  className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={oiSaving}
                  className="px-5 py-2 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-60 shadow">
                  {oiSaving ? "Saving…" : oiForm.id ? "Save Changes" : "Add Entry"}
                </button>
              </div>
            </form>
          )}

          {/* Entries table */}
          {oiLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Loading…</div>
          ) : otherIncomeRows.length === 0 && !oiForm ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No other income entries for {year}. Click "Add Entry" to record cash jobs, pre-app payments, etc.
            </div>
          ) : otherIncomeRows.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">From</th>
                      <th className="px-4 py-3 text-left">City, ST</th>
                      <th className="px-4 py-3 text-left">Method</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      {canEdit("invoices") && <th className="px-4 py-3 text-center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(otherIncomeRows as any[]).map((row: any) => (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{row.date}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{row.description}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{row.source || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {row.city && row.state ? `${row.city}, ${row.state}` : row.city || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                            {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-teal-700">{formatCurrency(parseFloat(row.amount))}</td>
                        {canEdit("invoices") && (
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => openEditOI(row)} title="Edit"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteOI(row.id)} title="Delete"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border font-semibold text-sm">
                    <tr>
                      <td colSpan={canEdit("invoices") ? 5 : 4} className="px-4 py-3 text-foreground">{otherIncomeRows.length} entr{otherIncomeRows.length !== 1 ? "ies" : "y"}</td>
                      <td className="px-4 py-3 text-right text-teal-700">{formatCurrency(otherIncomeTotal)}</td>
                      {canEdit("invoices") && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {canEdit("invoices") && !oiForm && (
                <div className="px-4 py-2.5 border-t border-border">
                  <button onClick={openAddOI} className="flex items-center gap-1.5 text-xs text-teal-600 font-semibold hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add another entry
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pb-2">
        Auto-generated from your invoices, expenses, mileage logs, and subcontractor records. Always verify with your accountant before filing.
      </p>
    </div>
  );
}

// ─── Schedule C + Home Office ─────────────────────────────────────────────────

function loadHomeOffice(year: number) {
  try {
    const raw = localStorage.getItem(`home-office-${year}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveHomeOffice(year: number, data: Record<string, string>) {
  try { localStorage.setItem(`home-office-${year}`, JSON.stringify(data)); } catch {}
}

function ScheduleCTab({ year }: { year: number }) {
  const { data: report, isLoading: reportLoading } = useScheduleCReport(year);
  const [showHomeOffice, setShowHomeOffice] = useState(false);

  const [ho, setHo] = useState<Record<string, string>>(() => loadHomeOffice(year));

  useEffect(() => { setHo(loadHomeOffice(year)); }, [year]);

  function setHoField(k: string, v: string) {
    setHo(prev => {
      const next = { ...prev, [k]: v };
      saveHomeOffice(year, next);
      return next;
    });
  }

  const totalSqft = parseFloat(ho.totalSqft || "0");
  const officeSqft = parseFloat(ho.officeSqft || "0");
  const businessUsePct = totalSqft > 0 && officeSqft > 0 ? Math.min(officeSqft / totalSqft, 1) : 0;
  const annualRentMortgage = parseFloat(ho.rentMortgage || "0");
  const annualUtilities = parseFloat(ho.utilities || "0");
  const annualPhone = parseFloat(ho.phone || "0");
  const phoneBusinessPct = parseFloat(ho.phonePct || "0") / 100;
  const homeOfficeDed = businessUsePct * (annualRentMortgage + annualUtilities) + phoneBusinessPct * annualPhone;

  const scheduleCLines = report?.scheduleLines ?? [];
  const totalDeductions = (report?.totalExpenses ?? 0) + homeOfficeDed;
  const netProfit = (report?.grossReceipts ?? 0) - totalDeductions;

  const lineMap: Record<number, { description: string; amount: number }> = {};
  for (const l of scheduleCLines) { lineMap[l.line] = { description: l.description, amount: l.amount }; }

  // Inject home office into line 30
  if (homeOfficeDed > 0) { lineMap[30] = { description: "Expenses for business use of your home (Form 8829)", amount: homeOfficeDed }; }


  return (
    <div className="space-y-6">
      {reportLoading && (
        <div className="text-center py-20 text-muted-foreground animate-pulse">Loading Schedule C…</div>
      )}

      {report && (
        <>
          {/* Export actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                const csvContent = `Schedule C - Tax Year ${report.year}\n\nLine,Description,Amount\n1,Gross receipts or sales,"$${report.grossReceipts.toFixed(2)}"\n${report.scheduleLines.filter(l => l.line > 1).map(l => `${l.line},"${l.description}","$${l.amount.toFixed(2)}"`).join("\n")}${homeOfficeDed > 0 ? `\n30,"Home office deduction (Form 8829)","$${homeOfficeDed.toFixed(2)}"` : ""}\n28,Total expenses,"$${totalDeductions.toFixed(2)}"\n31,Net profit or loss,"$${netProfit.toFixed(2)}"`;
                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `Schedule_C_${year}.csv`; a.click();
                window.URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-all border border-border text-sm"
            >
              <Download className="w-4 h-4" /> CSV Export
            </button>
            <button
              onClick={() => {
                const printWindow = window.open("", "", "width=800,height=600");
                if (printWindow) {
                  printWindow.document.write(`<html><head><title>Schedule C - Tax Year ${report.year}</title><style>body{font-family:Arial,sans-serif;padding:40px;padding-top:80px;line-height:1.6}h1{text-align:center;font-size:18px;margin-bottom:5px}h2{font-size:13px;margin:20px 0 10px}.line{display:flex;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px}.ln{font-weight:bold;width:50px;color:#666;font-size:12px}.desc{flex:1;margin:0 20px;font-size:13px}.amt{width:100px;text-align:right;font-weight:600}.total{border-top:2px solid #333;font-weight:bold;background:#f5f5f5;padding:8px 4px}.top-bar{position:fixed;top:max(16px,env(safe-area-inset-top,16px));left:0;right:0;display:flex;justify-content:space-between;padding:0 16px;z-index:9999;pointer-events:none}.top-bar button{pointer-events:all;background:rgba(0,0,0,0.75);color:#fff;border:none;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer}@media print{.top-bar{display:none}}</style></head><body><div class="top-bar"><button onclick="window.close()">&#8592; Back to App</button><button onclick="window.print()">&#128438; Print</button></div><h1>SCHEDULE C (FORM 1040)</h1><p style="text-align:center;color:#666">Profit or Loss from Business — Tax Year ${report.year}</p><h2>PART I — INCOME</h2>${report.scheduleLines.filter(l => l.line <= 7).map(l => `<div class="line"><span class="ln">Line ${l.line}</span><span class="desc">${l.description}</span><span class="amt">$${l.amount.toFixed(2)}</span></div>`).join("")}<h2>PART II — EXPENSES</h2>${report.scheduleLines.filter(l => l.line >= 8 && l.line < 28).map(l => `<div class="line"><span class="ln">Line ${l.line}</span><span class="desc">${l.description}</span><span class="amt">$${l.amount.toFixed(2)}</span></div>`).join("")}${homeOfficeDed > 0 ? `<div class="line"><span class="ln">Line 30</span><span class="desc">Home office deduction (Form 8829)</span><span class="amt">$${homeOfficeDed.toFixed(2)}</span></div>` : ""}<div class="line total"><span class="ln">Line 28</span><span class="desc">Total expenses</span><span class="amt">$${totalDeductions.toFixed(2)}</span></div><div class="line total"><span class="ln">Line 31</span><span class="desc">Net profit or (loss)</span><span class="amt">$${netProfit.toFixed(2)}</span></div></body></html>`);
                  printWindow.document.close();
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all text-sm"
            >
              <FileText className="w-4 h-4" /> PDF Print
            </button>
          </div>

          {/* Data quality warnings */}
          {report.dataQuality.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 text-sm">Data Quality Warnings</p>
                {report.dataQuality.warnings.map((w, i) => <p key={i} className="text-sm text-amber-800">• {w}</p>)}
              </div>
            </div>
          )}

          {/* IRS-style Schedule C form */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Form header */}
            <div className="bg-muted/50 px-6 py-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Schedule C (Form 1040)</p>
                  <h2 className="text-base font-display font-bold text-foreground mt-0.5">Profit or Loss From Business</h2>
                  <p className="text-xs text-muted-foreground">Sole Proprietorship / Single-Member LLC — Tax Year {year}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">OMB No. 1545-0074</p>
                  <p className="text-xs font-bold text-foreground mt-0.5">Attachment Sequence No. 09</p>
                </div>
              </div>
            </div>

            {/* Part I — Income */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded">PART I</div>
                <span className="text-sm font-bold text-foreground uppercase tracking-wide">Income</span>
              </div>
              <div className="space-y-0 divide-y divide-border/30">
                {[
                  { line: 1, desc: 'Gross receipts or sales. See instructions for line 1 and check the box if this income was reported to you on Form W-2 and the \u201cStatutory employee\u201d box on that form was checked' },
                  { line: 2, desc: "Returns and allowances" },
                  { line: 3, desc: "Subtract line 2 from line 1" },
                  { line: 4, desc: "Cost of goods sold (from Part III, line 42)" },
                  { line: 5, desc: "Gross profit. Subtract line 4 from line 3" },
                  { line: 6, desc: "Other income, including federal and state gasoline or fuel tax credit or refund" },
                  { line: 7, desc: "Gross income. Add lines 5 and 6" },
                ].map(({ line, desc }) => {
                  const entry = lineMap[line];
                  const amount = entry?.amount ?? 0;
                  const isKey = [1, 5, 7].includes(line);
                  return (
                    <div key={line} className={`flex items-start gap-3 py-2.5 ${isKey ? "bg-muted/10" : ""}`}>
                      <span className="text-[11px] text-muted-foreground font-mono w-8 flex-shrink-0 pt-0.5 text-right">{line}</span>
                      <span className={`flex-1 text-xs leading-relaxed ${isKey ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{desc}</span>
                      <span className={`font-semibold tabular-nums text-sm min-w-[80px] text-right ${isKey && amount > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {amount !== 0 ? formatCurrency(amount) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t-4 border-border" />

            {/* Part II — Expenses */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-foreground text-background text-[10px] font-bold px-2 py-0.5 rounded">PART II</div>
                <span className="text-sm font-bold text-foreground uppercase tracking-wide">Expenses</span>
                <span className="text-xs text-muted-foreground">Enter expenses for business use of your home only on line 30</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-border/30">
                {[
                  { line: 8, desc: "Advertising" },
                  { line: 9, desc: "Car and truck expenses (see instructions)" },
                  { line: 10, desc: "Commissions and fees" },
                  { line: 11, desc: "Contract labor (see instructions)" },
                  { line: 12, desc: "Depletion" },
                  { line: 13, desc: "Depreciation and section 179 expense" },
                  { line: 14, desc: "Employee benefit programs" },
                  { line: 15, desc: "Insurance (other than health)" },
                  { line: 16, desc: "Interest — Mortgage (paid to banks, etc.)" },
                  { line: 17, desc: "Legal and professional services" },
                  { line: 18, desc: "Office expense" },
                  { line: 19, desc: "Pension and profit-sharing plans" },
                  { line: 20, desc: "Rent or lease (vehicles, machinery, equipment)" },
                  { line: 21, desc: "Repairs and maintenance" },
                  { line: 22, desc: "Supplies (not included in Part III)" },
                  { line: 23, desc: "Taxes and licenses" },
                  { line: 24, desc: "Travel and meals" },
                  { line: 25, desc: "Utilities" },
                  { line: 26, desc: "Wages (less employment credits)" },
                  { line: 27, desc: "Other expenses (from line 48)" },
                ].map(({ line, desc }) => {
                  const entry = lineMap[line];
                  const amount = entry?.amount ?? 0;
                  return (
                    <div key={line} className="flex items-center gap-2 py-2 px-1">
                      <span className="text-[11px] text-muted-foreground font-mono w-7 flex-shrink-0 text-right">{line}</span>
                      <span className="flex-1 text-xs text-muted-foreground leading-tight">{desc}</span>
                      <span className={`font-medium tabular-nums text-sm min-w-[72px] text-right ${amount > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                        {amount > 0 ? formatCurrency(amount) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Line 28 Total, Line 30 Home Office, Line 31 Net */}
              <div className="mt-3 space-y-0 border-t-2 border-border divide-y divide-border/30">
                {[
                  { line: 28, desc: "Total expenses before expenses for business use of home. Add lines 8 through 27", amount: report.totalExpenses, key: true },
                  { line: 30, desc: "Expenses for business use of your home. Do not report these expenses elsewhere. Attach Form 8829 unless using the simplified method", amount: homeOfficeDed, key: false },
                  { line: 31, desc: "Net profit or (loss). Subtract line 30 from line 28. If a profit, enter on both Schedule 1 (Form 1040), line 3, and on Schedule SE, line 2.", amount: netProfit, key: true },
                ].map(({ line, desc, amount, key }) => (
                  <div key={line} className={`flex items-start gap-2 py-3 ${key ? "bg-muted/20 px-3 rounded" : "px-1"}`}>
                    <span className="text-[11px] text-muted-foreground font-mono w-7 flex-shrink-0 text-right pt-0.5">{line}</span>
                    <span className={`flex-1 text-xs leading-relaxed ${key ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{desc}</span>
                    <span className={`font-bold tabular-nums text-sm min-w-[80px] text-right ${amount < 0 ? "text-red-500" : key && amount > 0 ? "text-primary" : "text-foreground"}`}>
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form 8829 — Home Office Calculator */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setShowHomeOffice(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Home className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground text-sm">Form 8829 — Home Office Deduction Calculator</p>
                  <p className="text-xs text-muted-foreground">
                    {homeOfficeDed > 0
                      ? `Calculated deduction: ${formatCurrency(homeOfficeDed)} → flows to Schedule C line 30`
                      : "Enter your home office details to calculate your deduction"}
                  </p>
                </div>
              </div>
              {showHomeOffice ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </button>

            {showHomeOffice && (
              <div className="px-6 py-5 space-y-5">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                  <strong>Part I — Business Use of Home</strong> — Enter square footage to calculate the business-use percentage. Only expenses attributable to the office portion are deductible.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={cl}>Total Home Sq Ft</label>
                    <input type="number" min="0" className={ci} placeholder="e.g. 1800"
                      value={ho.totalSqft ?? ""} onChange={e => setHoField("totalSqft", e.target.value)} />
                  </div>
                  <div>
                    <label className={cl}>Office Sq Ft</label>
                    <input type="number" min="0" className={ci} placeholder="e.g. 180"
                      value={ho.officeSqft ?? ""} onChange={e => setHoField("officeSqft", e.target.value)} />
                  </div>
                  <div>
                    <label className={cl}>Business Use %</label>
                    <div className="px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm font-semibold text-foreground">
                      {totalSqft > 0 ? `${(businessUsePct * 100).toFixed(1)}%` : "—"}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Part II — Deductible Expenses</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={cl}>Annual Rent or Mortgage Interest ($)</label>
                      <input type="number" min="0" step="0.01" className={ci} placeholder="e.g. 12000"
                        value={ho.rentMortgage ?? ""} onChange={e => setHoField("rentMortgage", e.target.value)} />
                    </div>
                    <div>
                      <label className={cl}>Annual Utilities — Electric, Gas, Water ($)</label>
                      <input type="number" min="0" step="0.01" className={ci} placeholder="e.g. 2400"
                        value={ho.utilities ?? ""} onChange={e => setHoField("utilities", e.target.value)} />
                    </div>
                    <div>
                      <label className={cl}>Annual Phone / Internet ($)</label>
                      <input type="number" min="0" step="0.01" className={ci} placeholder="e.g. 1200"
                        value={ho.phone ?? ""} onChange={e => setHoField("phone", e.target.value)} />
                    </div>
                    <div>
                      <label className={cl}>Business Use of Phone / Internet (%)</label>
                      <input type="number" min="0" max="100" className={ci} placeholder="e.g. 80"
                        value={ho.phonePct ?? ""} onChange={e => setHoField("phonePct", e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Calculated Home Office Deduction (Line 30)</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      {businessUsePct > 0
                        ? `${(businessUsePct * 100).toFixed(1)}% × (rent + utilities) + ${ho.phonePct || 0}% of phone`
                        : "Enter square footage above to calculate"}
                    </p>
                  </div>
                  <p className="text-2xl font-display font-bold text-emerald-700">{formatCurrency(homeOfficeDed)}</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Values are saved automatically and persist across sessions. This calculator is for estimation only — consult a CPA and attach the actual Form 8829 when filing.
                </p>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              <strong>Tax Disclaimer:</strong> This Schedule C summary is for informational purposes only and does not constitute tax advice.
              Consult with a qualified CPA before filing. BuildPro is not responsible for filing accuracy or penalties.
            </p>
          </div>
        </>
      )}
    </div>
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
  const { isConfigured: googleConfigured, isConnected: googleConnected, getToken, signIn: googleSignIn } = useGoogleAuth();
  const { toast } = useToast();
  const storageKey = `ky-filing-statuses-${year}`;
  const [statuses, setStatuses] = useState<Record<string, FilingStatus>>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "due-soon" | "filed" | "na">("all");
  const [showManage, setShowManage] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [drivePickingFor, setDrivePickingFor] = useState<string | null>(null);

  const { data: items = [], isLoading: loadingItems } = useComplianceItems();
  const { data: kySettings = [] } = useKyFilingSettings();
  const createItem = useCreateComplianceItem();
  const updateItem = useUpdateComplianceItem();
  const deleteItem = useDeleteComplianceItem();
  const updateKyFilingSetting = useUpdateKyFilingSetting();
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

  const getFilingStatus = useCallback((id: string): FilingStatus => statuses[id] ?? "not-filed", [statuses]);
  const cycleFilingStatus = useCallback((id: string) => {
    setStatuses(prev => {
      const current = prev[id] ?? "not-filed";
      const idx = STATUS_CYCLE.indexOf(current);
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
      const updated = { ...prev, [id]: next };
      try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, [storageKey]);

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

  // Build unified list from both KY filings (filtered by enabled) and compliance items
  const kyEntries: UnifiedEntry[] = KY_FILINGS
    .filter(f => {
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
      {isOwner && <QuarterlyTaxTracker year={year} />}

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
                  onClick={() => updateItem.mutate({ id: item.id, ...item, enabled: !item.enabled })}
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

// ─── Reconcile Tab ────────────────────────────────────────────────────────────

const RECONCILE_BATCHES_API = `${BASE}/api/bank-reconciliation/batches`;
const RECONCILE_PARSE_API = `${BASE}/api/bank-reconciliation/parse`;
const RECONCILE_TX_API = `${BASE}/api/bank-reconciliation/transactions`;

interface ReconcileBatch {
  id: number;
  accountName: string;
  fileName: string | null;
  rowCount: number;
  importedAt: string;
  matched: number;
  ignored: number;
  unmatched: number;
  total: number;
}

interface ReconcileTx {
  id: number;
  importBatchId: number;
  date: string;
  description: string;
  amount: number;
  transactionType: string;
  status: string;
  matchedExpenseId: number | null;
  matchedInvoiceId: number | null;
  matchedOtherIncomeId: number | null;
  suggestedMatchType: string | null;
  suggestedMatchId: number | null;
}

interface ParsedPreviewRow {
  date: string;
  description: string;
  amount: number;
  transactionType: string;
  suggestedMatchType: string | null;
  suggestedMatchId: number | null;
}

interface ManualMatchCandidate {
  id: number;
  label: string;
  date: string;
  amount: number;
  type: "expense" | "invoice" | "other_income";
}

function formatMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ReconcileTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [fileFile, setFileFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedPreviewRow[] | null>(null);
  const [previewFileName, setPreviewFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingTxId, setUpdatingTxId] = useState<number | null>(null);

  const [linkPanelTxId, setLinkPanelTxId] = useState<number | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<ManualMatchCandidate[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const { data: batches = [], isLoading: batchesLoading } = useQuery<ReconcileBatch[]>({
    queryKey: ["reconcile-batches"],
    queryFn: async () => {
      const r = await fetch(RECONCILE_BATCHES_API, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load batches");
      return r.json();
    },
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<ReconcileTx[]>({
    queryKey: ["reconcile-txs", selectedBatchId],
    queryFn: async () => {
      if (!selectedBatchId) return [];
      const r = await fetch(`${RECONCILE_BATCHES_API}/${selectedBatchId}/transactions`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load transactions");
      return r.json();
    },
    enabled: selectedBatchId !== null,
  });

  async function handleParseFile() {
    if (!fileFile) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", fileFile);
      const r = await fetch(RECONCILE_PARSE_API, { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error("Parse failed");
      const result = await r.json();
      setPreview(result.rows);
      setPreviewFileName(result.fileName);
    } catch {
      toast({ title: "Parse failed", description: "Could not read the file. Check that it is a CSV or Excel file with Date, Description, and Amount columns.", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveBatch() {
    if (!preview || !accountName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(RECONCILE_BATCHES_API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: accountName.trim(), fileName: previewFileName, transactions: preview }),
      });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "Import complete", description: `${preview.length} transactions imported.` });
      await qc.invalidateQueries({ queryKey: ["reconcile-batches"] });
      setImportOpen(false);
      setPreview(null);
      setFileFile(null);
      setAccountName("");
    } catch {
      toast({ title: "Import failed", description: "Could not save the batch.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBatch(id: number) {
    setDeletingId(id);
    try {
      await fetch(`${RECONCILE_BATCHES_API}/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Batch deleted" });
      await qc.invalidateQueries({ queryKey: ["reconcile-batches"] });
      if (selectedBatchId === id) setSelectedBatchId(null);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function patchTx(id: number, payload: Record<string, unknown>) {
    setUpdatingTxId(id);
    try {
      const r = await fetch(`${RECONCILE_TX_API}/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error();
      await qc.invalidateQueries({ queryKey: ["reconcile-txs", selectedBatchId] });
      await qc.invalidateQueries({ queryKey: ["reconcile-batches"] });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setUpdatingTxId(null);
    }
  }

  async function openLinkPanel(tx: ReconcileTx) {
    if (linkPanelTxId === tx.id) { setLinkPanelTxId(null); return; }
    setLinkPanelTxId(tx.id);
    setLinkSearch("");
    setLinkLoading(true);
    setLinkCandidates([]);
    try {
      const candidates: ManualMatchCandidate[] = [];
      if (tx.transactionType === "debit") {
        const r = await fetch(`${BASE}/api/expenses`, { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          for (const e of (data.expenses ?? data)) {
            candidates.push({
              id: e.id,
              label: e.description || e.vendor || `Expense #${e.id}`,
              date: e.date ?? "",
              amount: parseFloat(e.amount ?? "0"),
              type: "expense",
            });
          }
        }
      } else {
        const [invR, oiR] = await Promise.all([
          fetch(`${BASE}/api/invoices`, { credentials: "include" }),
          fetch(`${BASE}/api/other-income`, { credentials: "include" }),
        ]);
        if (invR.ok) {
          const data = await invR.json();
          for (const inv of (data.invoices ?? data)) {
            if (inv.status !== "paid") continue;
            candidates.push({
              id: inv.id,
              label: `Invoice #${inv.invoiceNumber ?? inv.id} — ${inv.clientName ?? ""}`,
              date: inv.issueDate ?? "",
              amount: parseFloat(inv.total ?? "0"),
              type: "invoice",
            });
          }
        }
        if (oiR.ok) {
          const data = await oiR.json();
          for (const oi of (data.otherIncome ?? data)) {
            candidates.push({
              id: oi.id,
              label: oi.source || oi.description || `Income #${oi.id}`,
              date: oi.date ?? "",
              amount: parseFloat(oi.amount ?? "0"),
              type: "other_income",
            });
          }
        }
      }
      candidates.sort((a, b) => Math.abs(a.amount - tx.amount) - Math.abs(b.amount - tx.amount));
      setLinkCandidates(candidates);
    } catch {
      toast({ title: "Could not load records", variant: "destructive" });
    } finally {
      setLinkLoading(false);
    }
  }

  async function applyManualLink(tx: ReconcileTx, candidate: ManualMatchCandidate) {
    const payload =
      candidate.type === "expense" ? { matchedExpenseId: candidate.id } :
      candidate.type === "invoice" ? { matchedInvoiceId: candidate.id } :
      { matchedOtherIncomeId: candidate.id };
    await patchTx(tx.id, payload);
    setLinkPanelTxId(null);
  }

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  const statusColor: Record<string, string> = {
    matched: "text-emerald-600 bg-emerald-50",
    unmatched: "text-amber-600 bg-amber-50",
    ignored: "text-muted-foreground bg-muted/60",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bank Statement Reconciliation</h2>
          <p className="text-sm text-muted-foreground">Import CSV bank statements and match transactions to expenses and income.</p>
        </div>
        <button
          onClick={() => { setImportOpen(true); setPreview(null); setFileFile(null); setAccountName(""); }}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" /> Import Statement
        </button>
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-base">Import Bank Statement</h3>
              <button onClick={() => { setImportOpen(false); setPreview(null); setFileFile(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Account Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  placeholder="e.g. Chase Business Checking ****4523"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">CSV or Excel File</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => { setFileFile(e.target.files?.[0] ?? null); setPreview(null); }}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition-colors"
                />
                <p className="text-xs text-muted-foreground">Supports: Chase, Bank of America, PNC, Fifth Third, and most standard CSV exports.</p>
              </div>

              {!preview && (
                <button
                  onClick={handleParseFile}
                  disabled={!fileFile || parsing}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {parsing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {parsing ? "Parsing…" : "Preview Transactions"}
                </button>
              )}

              {preview && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{preview.length} transactions found — review before importing</p>
                    <button
                      onClick={() => { setPreview(null); setFileFile(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Choose different file
                    </button>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Date</th>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Description</th>
                            <th className="px-2 py-2 text-right text-muted-foreground font-medium">Amount</th>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Type</th>
                            <th className="px-2 py-2 text-left text-muted-foreground font-medium">Auto-Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{row.date}</td>
                              <td className="px-2 py-1.5 max-w-[200px] truncate">{row.description}</td>
                              <td className={`px-2 py-1.5 text-right font-mono font-medium whitespace-nowrap ${row.transactionType === "credit" ? "text-emerald-600" : "text-foreground"}`}>
                                {row.transactionType === "credit" ? "+" : "-"}{formatCurrency(row.amount)}
                              </td>
                              <td className="px-2 py-1.5">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${row.transactionType === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                                  {row.transactionType}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                {row.suggestedMatchType ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 className="w-3 h-3" />{row.suggestedMatchType} #{row.suggestedMatchId}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button
                onClick={() => { setImportOpen(false); setPreview(null); }}
                className="h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
              >
                Cancel
              </button>
              {preview && (
                <button
                  onClick={handleSaveBatch}
                  disabled={!accountName.trim() || saving}
                  className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {saving ? "Saving…" : "Save Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Import Batches</h3>
          {batchesLoading && <div className="text-sm text-muted-foreground animate-pulse p-2">Loading…</div>}
          {!batchesLoading && batches.length === 0 && (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">
              No batches yet. Import a statement to get started.
            </div>
          )}
          {batches.map(batch => (
            <div
              key={batch.id}
              onClick={() => setSelectedBatchId(batch.id === selectedBatchId ? null : batch.id)}
              className={`cursor-pointer rounded-lg border p-3 space-y-1 transition-colors ${selectedBatchId === batch.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{batch.accountName}</p>
                  <p className="text-xs text-muted-foreground truncate">{batch.fileName ?? "Imported"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(batch.importedAt).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteBatch(batch.id); }}
                  disabled={deletingId === batch.id}
                  className="text-muted-foreground hover:text-destructive transition-colors mt-0.5 flex-shrink-0"
                >
                  {deletingId === batch.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex gap-2 text-[10px] font-medium">
                <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{batch.matched} matched</span>
                <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{batch.unmatched} open</span>
                {batch.ignored > 0 && <span className="text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">{batch.ignored} ignored</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="md:col-span-2">
          {!selectedBatchId && (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border rounded-xl text-center text-muted-foreground gap-2">
              <FileSpreadsheet className="w-8 h-8 opacity-30" />
              <p className="text-sm">Select a batch to review transactions</p>
            </div>
          )}

          {selectedBatchId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">
                  {selectedBatch?.accountName}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">{selectedBatch?.total} transactions</span>
                </h3>
              </div>

              {selectedBatch && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Debits</p>
                    <p className="font-mono font-semibold text-sm mt-0.5">
                      {formatCurrency(transactions.filter(t => t.transactionType === "debit").reduce((s, t) => s + t.amount, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Credits</p>
                    <p className="font-mono font-semibold text-sm mt-0.5 text-emerald-600">
                      {formatCurrency(transactions.filter(t => t.transactionType === "credit").reduce((s, t) => s + t.amount, 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Matched / Open</p>
                    <p className="font-mono font-semibold text-sm mt-0.5">
                      {selectedBatch.matched} / {selectedBatch.unmatched}
                    </p>
                  </div>
                </div>
              )}

              {txLoading && <div className="text-sm text-muted-foreground animate-pulse p-4">Loading transactions…</div>}

              {!txLoading && transactions.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No transactions found.</div>
              )}

              {!txLoading && transactions.length > 0 && (() => {
                const grouped = transactions.reduce<Record<string, ReconcileTx[]>>((acc, tx) => {
                  const mo = tx.date.slice(0, 7);
                  if (!acc[mo]) acc[mo] = [];
                  acc[mo].push(tx);
                  return acc;
                }, {});
                const months = Object.keys(grouped).sort();
                const filteredCandidates = linkCandidates.filter(c => {
                  const q = linkSearch.toLowerCase();
                  return !q || c.label.toLowerCase().includes(q) || String(c.amount).includes(q);
                });
                return (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-[60vh]">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Date</th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Description</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Amount</th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Status</th>
                            <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Match</th>
                            <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {months.map(mo => (
                            <>
                              <tr key={`mo-${mo}`} className="bg-muted/30 border-t border-border/50">
                                <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                  {formatMonth(mo)}
                                  <span className="ml-2 font-normal normal-case">
                                    {grouped[mo].filter(t => t.status === "matched").length}/{grouped[mo].length} matched
                                  </span>
                                </td>
                              </tr>
                              {grouped[mo].map(tx => (
                                <>
                                  <tr key={tx.id} className={`border-t border-border/50 hover:bg-muted/20 ${linkPanelTxId === tx.id ? "bg-primary/5" : ""}`}>
                                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{tx.date}</td>
                                    <td className="px-3 py-2 max-w-[180px]">
                                      <span className="block truncate text-xs">{tx.description}</span>
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono text-xs font-semibold whitespace-nowrap ${tx.transactionType === "credit" ? "text-emerald-600" : "text-foreground"}`}>
                                      {tx.transactionType === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusColor[tx.status] ?? "text-muted-foreground bg-muted/50"}`}>
                                        {tx.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 max-w-[140px]">
                                      {tx.matchedExpenseId && <span className="text-[10px] text-emerald-700 truncate block">Expense #{tx.matchedExpenseId}</span>}
                                      {tx.matchedInvoiceId && <span className="text-[10px] text-emerald-700 truncate block">Invoice #{tx.matchedInvoiceId}</span>}
                                      {tx.matchedOtherIncomeId && <span className="text-[10px] text-emerald-700 truncate block">Income #{tx.matchedOtherIncomeId}</span>}
                                      {!tx.matchedExpenseId && !tx.matchedInvoiceId && !tx.matchedOtherIncomeId && tx.suggestedMatchType && tx.status === "unmatched" && (
                                        <span className="text-[10px] text-amber-600 truncate block">Suggested: {tx.suggestedMatchType} #{tx.suggestedMatchId}</span>
                                      )}
                                      {!tx.matchedExpenseId && !tx.matchedInvoiceId && !tx.matchedOtherIncomeId && !tx.suggestedMatchType && (
                                        <span className="text-[10px] text-muted-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1 justify-end flex-wrap">
                                        {tx.status === "unmatched" && tx.suggestedMatchType && (
                                          <button
                                            onClick={() => {
                                              const payload =
                                                tx.suggestedMatchType === "expense" ? { matchedExpenseId: tx.suggestedMatchId } :
                                                tx.suggestedMatchType === "invoice" ? { matchedInvoiceId: tx.suggestedMatchId } :
                                                { matchedOtherIncomeId: tx.suggestedMatchId };
                                              patchTx(tx.id, payload);
                                            }}
                                            disabled={updatingTxId === tx.id}
                                            title="Accept suggested match"
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                            Accept
                                          </button>
                                        )}
                                        {tx.status === "unmatched" && (
                                          <button
                                            onClick={() => openLinkPanel(tx)}
                                            title="Manually link to existing record"
                                            className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium transition-colors ${linkPanelTxId === tx.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"}`}
                                          >
                                            <Paperclip className="w-3 h-3" />Link
                                          </button>
                                        )}
                                        {tx.status === "matched" && (
                                          <button
                                            onClick={() => patchTx(tx.id, { status: "unmatched", matchedExpenseId: null, matchedInvoiceId: null, matchedOtherIncomeId: null })}
                                            disabled={updatingTxId === tx.id}
                                            title="Clear match"
                                            className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                          </button>
                                        )}
                                        {tx.status === "unmatched" && tx.transactionType === "debit" && (
                                          <a
                                            href={`${BASE}/expenses?prefill_amount=${tx.amount}&prefill_date=${tx.date}&prefill_desc=${encodeURIComponent(tx.description)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            title="Create new expense from this transaction"
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                                          >
                                            <Plus className="w-3 h-3" />Expense
                                          </a>
                                        )}
                                        {tx.status !== "ignored" && (
                                          <button
                                            onClick={() => patchTx(tx.id, { status: "ignored" })}
                                            disabled={updatingTxId === tx.id}
                                            title="Ignore this transaction"
                                            className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />}
                                          </button>
                                        )}
                                        {tx.status === "ignored" && (
                                          <button
                                            onClick={() => patchTx(tx.id, { status: "unmatched" })}
                                            disabled={updatingTxId === tx.id}
                                            title="Restore"
                                            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                          >
                                            {updatingTxId === tx.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                            Restore
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                  {linkPanelTxId === tx.id && (
                                    <tr key={`link-${tx.id}`} className="bg-primary/5 border-t border-primary/20">
                                      <td colSpan={6} className="px-4 py-3">
                                        <div className="space-y-2">
                                          <div className="flex items-center gap-2">
                                            <p className="text-xs font-medium text-foreground">
                                              Link to existing {tx.transactionType === "debit" ? "expense" : "invoice or income"} record
                                            </p>
                                            <button onClick={() => setLinkPanelTxId(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          <input
                                            type="text"
                                            value={linkSearch}
                                            onChange={e => setLinkSearch(e.target.value)}
                                            placeholder="Search by description or amount…"
                                            className="w-full h-8 px-3 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                                          />
                                          {linkLoading && <p className="text-xs text-muted-foreground animate-pulse">Loading records…</p>}
                                          {!linkLoading && filteredCandidates.length === 0 && (
                                            <p className="text-xs text-muted-foreground">No matching records found.</p>
                                          )}
                                          {!linkLoading && filteredCandidates.length > 0 && (
                                            <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto bg-background">
                                              {filteredCandidates.slice(0, 30).map(c => (
                                                <button
                                                  key={`${c.type}-${c.id}`}
                                                  onClick={() => applyManualLink(tx, c)}
                                                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/60 border-b border-border/50 last:border-0 text-left transition-colors"
                                                >
                                                  <span className="truncate max-w-[60%]">{c.label}</span>
                                                  <span className="flex items-center gap-2 text-muted-foreground flex-shrink-0 ml-2">
                                                    <span className="font-mono">{formatCurrency(c.amount)}</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${c.type === "expense" ? "bg-red-50 text-red-600" : c.type === "invoice" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"}`}>
                                                      {c.type.replace("_", " ")}
                                                    </span>
                                                  </span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              ))}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type AccountingTab = "overview" | "schedule-c" | "tax-calendar" | "reconcile";

function getInitialTab(): AccountingTab {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "schedule-c" || tab === "tax-calendar" || tab === "reconcile") return tab;
  return "overview";
}

export default function Accounting() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<AccountingTab>(getInitialTab);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const { isOwner } = useUserPermissions();

  const { data, isLoading, error } = useQuery({
    queryKey: ["accounting", year],
    queryFn: () => fetchAccounting(year),
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Accounting & Tax</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Financial overview, Schedule C, and filing calendar.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[
          { key: "overview" as const, label: "Overview", icon: BarChart3 },
          { key: "schedule-c" as const, label: "Schedule C + Home Office", icon: FileText },
          { key: "tax-calendar" as const, label: "Tax Calendar & Compliance", icon: Calendar },
          ...(isOwner ? [{ key: "reconcile" as const, label: "Reconcile", icon: FileCheck }] : []),
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors ${
              activeTab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <>
          {isLoading && <div className="text-center py-20 text-muted-foreground animate-pulse">Loading {year} report…</div>}
          {error && <div className="text-center py-20 text-destructive">Failed to load report. Check that the API is running.</div>}
          {data && <OverviewTab data={data} year={year} />}
        </>
      )}

      {activeTab === "schedule-c" && <ScheduleCTab year={year} />}

      {activeTab === "tax-calendar" && <TaxCalendarTab year={year} />}

      {activeTab === "reconcile" && isOwner && <ReconcileTab />}
    </div>
  );
}
