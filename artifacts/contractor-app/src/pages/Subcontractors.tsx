import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useLocation } from "wouter";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useQuery } from "@tanstack/react-query";
import { useListSubcontractors, useCreateSubcontractor, useDeleteSubcontractor } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  HardHat, Plus, ShieldAlert, CheckCircle2, Link2, Copy,
  RefreshCw, CheckCheck, ShieldCheck, Clock, AlertCircle, ShieldX, Lock, LockOpen, Trash2,
  FileText, Download, ChevronDown, ChevronUp, AlertTriangle, BadgeCheck, Ban,
  History, DollarSign, TrendingUp, Users, Wallet, ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generate1099NecPdf } from "@/lib/generate1099NecPdf";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Subcontractors() {
  const { canEdit } = useUserPermissions();
  const { data: subs, isLoading, refetch } = useListSubcontractors();
  const [searchParams, setSearchParams] = useSearchParams();
  const createMutation = useCreateSubcontractor();
  const deleteMutation = useDeleteSubcontractor();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string; hasLinkedRecords: boolean } | null>(null);
  const [inviteModal, setInviteModal] = useState<{
    name: string; token: string | null; id: number; portalApproved: boolean; portalPinSet: boolean;
    payRate: number | null; payType: string | null; role: string | null; growthPct: number | null;
  } | null>(null);
  const [editingRate, setEditingRate] = useState(false);
  const [rateForm, setRateForm] = useState({ payRate: "", travelPayRate: "", payType: "hourly", role: "hourly", growthPct: "" });
  const [savingRate, setSavingRate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [resettingPin, setResettingPin] = useState(false);
  const [pinResetDone, setPinResetDone] = useState<Record<number, boolean>>({});
  const [show1099Modal, setShow1099Modal] = useState(false);
  const [report1099Year, setReport1099Year] = useState(new Date().getFullYear());
  const [generating1099, setGenerating1099] = useState<number | null>(null);
  const [expanded1099, setExpanded1099] = useState<number | null>(null);
  const [issuingAll, setIssuingAll] = useState(false);
  const [revoke1099Confirm, setRevoke1099Confirm] = useState<{ id: number; subName: string } | null>(null);
  const [revoking1099Id, setRevoking1099Id] = useState<number | null>(null);
  const [revoke1099Error, setRevoke1099Error] = useState<string | null>(null);
  const [subDetailTab, setSubDetailTab] = useState<"portal" | "history">("portal");
  const [historyYear, setHistoryYear] = useState<number | "all">(new Date().getFullYear());
  const [historyBusinessLine, setHistoryBusinessLine] = useState<string>("");
  const [pageTab, setPageTab] = useState<"directory" | "balances">("directory");
  const [showSettled, setShowSettled] = useState(false);
  const [settleConfirm, setSettleConfirm] = useState<{ id: number; name: string; reopen: boolean } | null>(null);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [, navigate] = useLocation();

  async function handleSettle(id: number, reopen: boolean) {
    setSettlingId(id);
    try {
      const url = `${BASE}/api/subcontractors/${id}/settle`;
      const res = await fetch(url, { method: reopen ? "DELETE" : "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      refetch();
      toast({ title: reopen ? "Balance reopened" : "Balance marked as settled" });
    } catch {
      toast({ title: "Error", description: "Could not update settlement status.", variant: "destructive" });
    } finally {
      setSettlingId(null);
      setSettleConfirm(null);
    }
  }

  useEffect(() => {
    const subIdParam = searchParams.get("subId");
    if (!subIdParam || !subs || subs.length === 0) return;
    const id = parseInt(subIdParam, 10);
    const target = subs.find(s => s.id === id);
    if (target) {
      openInviteModal(target);
      setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete("subId"); return n; }, { replace: true });
    }
  }, [searchParams, subs]);

  const { data: report1099Data, isLoading: report1099Loading, refetch: refetch1099 } = useQuery({
    queryKey: ["1099-report", report1099Year],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/1099s/report?year=${report1099Year}`);
      if (!res.ok) throw new Error("Failed to load 1099 report");
      return res.json();
    },
    enabled: show1099Modal,
    staleTime: 30000,
  });

  const { data: outstandingBalances, isLoading: balancesLoading, refetch: refetchBalances } = useQuery({
    queryKey: ["outstanding-balances", showSettled],
    queryFn: async () => {
      const params = showSettled ? "?includeSettled=true" : "";
      const res = await fetch(`${BASE}/api/subcontractors/outstanding-balances${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load outstanding balances");
      return res.json() as Promise<{
        totalOutstanding: number;
        subsOwed: number;
        jobsImpacted: number;
        perSubTotals: Array<{
          subcontractorId: number;
          subName: string;
          totalOwed: number;
          totalPaid: number;
          balance: number;
          percentComplete: number | null;
          lastPaymentDate: string | null;
          jobs: Array<{
            jobId: number; jobTitle: string; jobStatus: string | null; businessLine: string | null;
            compensationType: string; fixedAmount: number | null; allocationPct: number | null;
            amountOwed: number | null; amountPaid: number; paymentStatus: string; lastPaidAt: string | null;
          }>;
        }>;
      }>;
    },
    enabled: pageTab === "balances",
    staleTime: 30000,
  });

  const { data: paymentHistory, isLoading: paymentHistoryLoading } = useQuery({
    queryKey: ["sub-payment-history", inviteModal?.id, historyYear, historyBusinessLine],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyYear !== "all") params.set("year", String(historyYear));
      if (historyBusinessLine) params.set("businessLine", historyBusinessLine);
      const res = await fetch(`${BASE}/api/subcontractors/${inviteModal!.id}/payment-history?${params}`);
      if (!res.ok) throw new Error("Failed to load payment history");
      return res.json() as Promise<{
        jobs: Array<{
          jobId: number; jobTitle: string; jobStatus: string; businessLine: string | null;
          compensationType: string; totalHours: number; amountOwed: number | null;
          amountPaid: number; paidDate: string | null; paidNotes: string | null;
          paymentStatus: string; paidAt: string | null; effectiveYear: number | null;
        }>;
        ytdPaid: number; totalOwed: number; totalPaid: number; balance: number;
        allBusinessLines: string[];
      }>;
    },
    enabled: !!inviteModal && subDetailTab === "history",
    staleTime: 30000,
  });

  async function generate1099Pdf(sub: any) {
    setGenerating1099(sub.subcontractorId);
    try {
      const payer = report1099Data?.payerSettings ?? {};
      const blob = await generate1099NecPdf({
        taxYear: report1099Year,
        payer: {
          name: payer.companyName || "Contractor",
          address: payer.companyAddress,
          city: payer.companyCity,
          state: payer.companyState,
          zip: payer.companyZip,
          phone: payer.companyPhone,
          ein: payer.ein,
        },
        payee: {
          name: sub.w9LegalName || sub.name,
          address: sub.w9Address,
          city: sub.w9City,
          state: sub.w9State,
          zip: sub.w9Zip,
          tinType: sub.w9TaxIdType,
          tinLastFour: sub.w9TaxIdLastFour ?? null,
        },
        nonemployeeCompensation: sub.totalQualifying,
      });

      // Convert blob to base64 for storage
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Save to backend
      await fetch(`${BASE}/api/1099s/generate/${sub.subcontractorId}?year=${report1099Year}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalPaid: sub.totalQualifying, pdfData: base64 }),
      });

      // Download the PDF immediately
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `1099-NEC-${sub.w9LegalName || sub.name}-${report1099Year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      refetch1099();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating1099(null);
    }
  }

  async function downloadExisting1099(sub: any) {
    const rec = sub.existingRecord;
    if (!rec) return;
    setGenerating1099(sub.subcontractorId);
    try {
      const res = await fetch(`${BASE}/api/1099s/download/${rec.id}`);
      if (!res.ok) throw new Error("Failed to fetch stored 1099");
      const data = await res.json();
      if (!data.pdfData) {
        // No stored PDF — fall back to re-generating
        await generate1099Pdf(sub);
        return;
      }
      const bytes = Uint8Array.from(atob(data.pdfData), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `1099-NEC-${sub.w9LegalName || sub.name}-${data.taxYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating1099(null);
    }
  }

  async function issueAll1099s() {
    if (!report1099Data?.subcontractors) return;
    const pending = report1099Data.subcontractors.filter((s: any) => s.requires1099 && s.status !== "generated");
    if (pending.length === 0) return;
    setIssuingAll(true);
    try {
      for (const sub of pending) {
        const payer = report1099Data.payerSettings ?? {};
        const blob = await generate1099NecPdf({
          taxYear: report1099Year,
          payer: {
            name: payer.companyName || "Contractor",
            address: payer.companyAddress,
            city: payer.companyCity,
            state: payer.companyState,
            zip: payer.companyZip,
            phone: payer.companyPhone,
            ein: payer.ein,
          },
          payee: {
            name: sub.w9LegalName || sub.name,
            address: sub.w9Address,
            city: sub.w9City,
            state: sub.w9State,
            zip: sub.w9Zip,
            tinType: sub.w9TaxIdType,
            tinLastFour: sub.w9TaxIdLastFour ?? null,
          },
          nonemployeeCompensation: sub.totalQualifying,
        });
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        await fetch(`${BASE}/api/1099s/generate/${sub.subcontractorId}?year=${report1099Year}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ totalPaid: sub.totalQualifying, pdfData: base64 }),
        });
      }
      refetch1099();
    } catch (err) {
      console.error(err);
    } finally {
      setIssuingAll(false);
    }
  }

  async function handleRevoke1099(recordId: number) {
    setRevoking1099Id(recordId);
    setRevoke1099Error(null);
    try {
      const res = await fetch(`${BASE}/api/1099s/${recordId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke 1099");
      }
      setRevoke1099Confirm(null);
      refetch1099();
    } catch (err: any) {
      console.error(err);
      setRevoke1099Error(err.message || "Failed to revoke the 1099. Please try again.");
    } finally {
      setRevoking1099Id(null);
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const rawRate = formData.get("payRate") as string;
    try {
      await createMutation.mutateAsync({
        data: {
          name: formData.get("name") as string,
          email: formData.get("email") as string || undefined,
          trade: formData.get("trade") as string || undefined,
          phone: formData.get("phone") as string || undefined,
          w9OnFile: formData.get("w9") === "on",
          payRate: rawRate ? parseFloat(rawRate) : undefined,
          payType: (formData.get("payType") as string) || "hourly",
        } as Parameters<typeof createMutation.mutateAsync>[0]["data"],
      });
      setIsDialogOpen(false);
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  async function generateAndApprovePortalLink(subId: number) {
    setGenerating(true);
    setPortalError(null);
    try {
      const genRes = await fetch(`${BASE}/api/portal/generate/${subId}`, { method: "POST" });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error || `Generate failed (${genRes.status})`);
      }
      const genData = await genRes.json();
      const token = genData.portalToken;
      if (!token) throw new Error("No token returned from server");

      const approveRes = await fetch(`${BASE}/api/portal/approve/${subId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (!approveRes.ok) {
        const err = await approveRes.json().catch(() => ({}));
        throw new Error(err.error || `Approve failed (${approveRes.status})`);
      }

      setInviteModal(prev => prev ? { ...prev, token, portalApproved: true } : null);
      refetch();
    } catch (err: any) {
      console.error(err);
      setPortalError(err.message || "Failed to generate portal link. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function revokeAccess(subId: number) {
    setRevoking(true);
    setPortalError(null);
    try {
      const res = await fetch(`${BASE}/api/portal/approve/${subId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Revoke failed (${res.status})`);
      }
      setInviteModal(prev => prev ? { ...prev, portalApproved: false } : null);
      refetch();
    } catch (err: any) {
      console.error(err);
      setPortalError(err.message || "Failed to revoke access. Please try again.");
    } finally {
      setRevoking(false);
    }
  }

  function getPortalUrl(token: string) {
    return `${window.location.origin}${BASE}/portal/${token}`;
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(getPortalUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function resetPortalPin(subId: number) {
    setResettingPin(true);
    setPortalError(null);
    try {
      const res = await fetch(`${BASE}/api/subcontractors/${subId}/reset-portal-pin`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Reset failed (${res.status})`);
      }
      setPinResetDone(prev => ({ ...prev, [subId]: true }));
      // Immediately reflect cleared PIN status in the invite modal
      setInviteModal(prev => prev && prev.id === subId ? { ...prev, portalPinSet: false } : prev);
      refetch();
      setTimeout(() => setPinResetDone(prev => ({ ...prev, [subId]: false })), 3000);
    } catch (err: any) {
      setPortalError(err.message || "Failed to reset PIN.");
    } finally {
      setResettingPin(false);
    }
  }

  function openInviteModal(sub: NonNullable<typeof subs>[number]) {
    setCopied(false);
    setPortalError(null);
    setEditingRate(false);
    setSubDetailTab("portal");
    setHistoryYear(new Date().getFullYear());
    setHistoryBusinessLine("");
    const pr = (sub as any).payRate;
    const tpr = (sub as any).travelPayRate;
    const pt = (sub as any).payType;
    const rl = (sub as any).role ?? "hourly";
    const gp = (sub as any).growthPct ?? 0;
    setRateForm({ payRate: pr != null ? String(pr) : "", travelPayRate: tpr != null ? String(tpr) : "", payType: pt ?? "hourly", role: rl, growthPct: gp > 0 ? String(gp * 100) : "" });
    setInviteModal({
      name: sub.name,
      token: sub.portalToken ?? null,
      id: sub.id,
      portalApproved: sub.portalApproved ?? false,
      portalPinSet: !!sub.portalPinSet,
      payRate: pr ?? null,
      payType: pt ?? null,
      role: rl,
      growthPct: gp,
    });
  }

  async function handleSaveRate() {
    if (!inviteModal) return;
    setSavingRate(true);
    try {
      const rate = rateForm.payRate ? parseFloat(rateForm.payRate) : null;
      const travelRate = rateForm.travelPayRate ? parseFloat(rateForm.travelPayRate) : null;
      const growthPctDecimal = rateForm.role === "member" && rateForm.growthPct ? parseFloat(rateForm.growthPct) / 100 : 0;
      const res = await fetch(`${BASE}/api/subcontractors/${inviteModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payRate: rate, travelPayRate: travelRate, payType: rateForm.payType, role: rateForm.role, growthPct: growthPctDecimal }),
      });
      if (!res.ok) throw new Error();
      setInviteModal(prev => prev ? { ...prev, payRate: rate, payType: rateForm.payType, role: rateForm.role, growthPct: growthPctDecimal } : null);
      setEditingRate(false);
      refetch();
    } catch {
      toast({ title: "Failed to save rate", variant: "destructive" });
    } finally {
      setSavingRate(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const result = await deleteMutation.mutateAsync({ id }) as unknown as {
        reassignedJobs?: Array<{ jobId: number; jobTitle: string | null }>;
      };
      refetch();
      const reassignedJobs = result?.reassignedJobs ?? [];
      if (reassignedJobs.length > 0) {
        const jobNames = reassignedJobs.map(job => job.jobTitle || `Job #${job.jobId}`);
        toast({
          title: "Subcontractor deleted",
          description: `Mileage reimbursement reassigned to the business owner for: ${jobNames.join(", ")}.`,
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Delete failed", description: "Could not delete this subcontractor. Please try again.", variant: "destructive" });
    } finally {
      setDeletingId(null);
      setDeleteConfirm(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Subcontractors</h1>
          <p className="text-muted-foreground mt-1">Manage subs, W-9s, 1099 compliance, and portal access.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShow1099Modal(true)}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-amber-600 text-white hover:bg-amber-700 shadow-md transition-all hover:shadow-lg active:scale-95"
          >
            <FileText className="w-4 h-4 mr-2" /> 1099 Report
          </button>
          {canEdit("subcontractors") && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
            >
              <Plus className="w-5 h-5 mr-2" /> Add Subcontractor
            </button>
          )}
        </div>
      </div>

      {/* Page-level tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button
          onClick={() => setPageTab("directory")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${pageTab === "directory" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="w-4 h-4" /> Directory
        </button>
        <button
          onClick={() => setPageTab("balances")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${pageTab === "balances" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Wallet className="w-4 h-4" /> Sub Balances
          {outstandingBalances && outstandingBalances.subsOwed > 0 && (
            <span className="ml-1 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{outstandingBalances.subsOwed}</span>
          )}
        </button>
      </div>

      {/* ── Sub Balances tab ── */}
      {pageTab === "balances" && (
        <div className="space-y-4">
          {/* Toolbar: settled toggle + refresh */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setShowSettled(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${showSettled ? "bg-primary" : "bg-muted border border-border"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showSettled ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">Show settled</span>
            </label>
            <button onClick={() => refetchBalances()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors border border-border">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {balancesLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}</div>
          ) : !outstandingBalances || (!showSettled && outstandingBalances.subsOwed === 0) || (showSettled && outstandingBalances.perSubTotals.length === 0) ? (
            <Card className="border-border/50 shadow-md p-12 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
              <p className="text-lg font-semibold text-foreground">All subs are settled</p>
              <p className="text-sm text-muted-foreground mt-1">No outstanding balances across any jobs.</p>
            </Card>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-border/50 shadow-sm p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Outstanding</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{formatCurrency(outstandingBalances.totalOutstanding)}</p>
                </Card>
                <Card className="border-border/50 shadow-sm p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Subs Owed</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{outstandingBalances.subsOwed}</p>
                </Card>
                <Card className="border-border/50 shadow-sm p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Jobs Impacted</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{outstandingBalances.jobsImpacted}</p>
                </Card>
              </div>

              {/* Per-sub breakdown */}
              <div className="space-y-3">
                {outstandingBalances.perSubTotals.map(sub => {
                  const isSettled = sub.balance <= 0.005;
                  return (
                    <Card key={sub.subcontractorId} className={`border-border/50 shadow-sm overflow-hidden ${isSettled ? "opacity-60" : ""}`}>
                      {/* Sub header */}
                      <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <HardHat className="w-4 h-4 text-muted-foreground/60" />
                          <span className="font-semibold text-foreground text-sm">{sub.subName}</span>
                          {isSettled ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Settled
                            </span>
                          ) : sub.percentComplete != null && sub.percentComplete > 0 ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              {sub.percentComplete}% paid
                            </span>
                          ) : null}
                        </div>
                        <div className="text-right">
                          {isSettled ? (
                            <p className="text-sm font-bold text-emerald-600">{formatCurrency(sub.totalPaid)} paid</p>
                          ) : (
                            <p className="text-sm font-bold text-orange-600">{formatCurrency(sub.balance)} owed</p>
                          )}
                          {sub.totalPaid > 0 && !isSettled && <p className="text-[10px] text-muted-foreground">{formatCurrency(sub.totalPaid)} paid of {formatCurrency(sub.totalOwed)}</p>}
                          {sub.lastPaymentDate && <p className="text-[10px] text-muted-foreground">Last: {new Date(sub.lastPaymentDate).toLocaleDateString()}</p>}
                        </div>
                      </div>

                      {/* Progress bar */}
                      {sub.totalOwed > 0 && sub.totalPaid > 0 && (
                        <div className="px-5 py-2 bg-muted/10">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isSettled ? "bg-emerald-500" : "bg-amber-500"}`}
                              style={{ width: `${Math.min(100, Math.round((sub.totalPaid / sub.totalOwed) * 100))}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Job detail rows — click to navigate to that job */}
                      <div className="divide-y divide-border/30">
                        {sub.jobs.map(j => {
                          const balance = j.amountOwed != null ? Math.max(0, j.amountOwed - j.amountPaid) : null;
                          const jobSettled = j.paymentStatus === "paid";
                          return (
                            <button
                              key={j.jobId}
                              onClick={() => navigate(`/jobs?jobId=${j.jobId}`)}
                              className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-muted/30 transition-colors text-left group"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 group-hover:text-primary transition-colors" />
                                <div className="min-w-0">
                                  <p className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{j.jobTitle}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {j.businessLine && <span className="text-[10px] text-muted-foreground">{j.businessLine}</span>}
                                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                      jobSettled
                                        ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                        : j.paymentStatus === "partial"
                                          ? "text-amber-700 bg-amber-50 border border-amber-200"
                                          : "text-orange-600 bg-orange-50 border border-orange-200"
                                    }`}>
                                      {jobSettled ? "✓ Paid" : j.paymentStatus === "partial" ? "● Partial" : "Unpaid"}
                                    </span>
                                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                                      j.compensationType === "allocation"
                                        ? "text-purple-600 bg-purple-50 border-purple-200"
                                        : j.compensationType === "fixed"
                                          ? "text-orange-600 bg-orange-50 border-orange-200"
                                          : "text-blue-600 bg-blue-50 border-blue-200"
                                    }`}>
                                      {j.compensationType === "allocation" ? "%Alloc" : j.compensationType === "fixed" ? "Fixed" : "Hourly"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 ml-3">
                                {balance != null ? (
                                  <>
                                    {jobSettled ? (
                                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(j.amountPaid)} paid</p>
                                    ) : (
                                      <p className="text-sm font-bold text-orange-600">{formatCurrency(balance)} left</p>
                                    )}
                                    {j.amountPaid > 0 && !jobSettled && <p className="text-[10px] text-muted-foreground">{formatCurrency(j.amountPaid)} of {formatCurrency(j.amountOwed!)}</p>}
                                  </>
                                ) : (
                                  <p className="text-xs text-muted-foreground italic">{j.compensationType === "allocation" ? "Pool-based" : "See job"}</p>
                                )}
                                {j.lastPaidAt && <p className="text-[10px] text-muted-foreground">{new Date(j.lastPaidAt).toLocaleDateString()}</p>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Directory tab ── */}
      {pageTab === "directory" && (
      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Name / Trade</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">W-9 Status</th>
                <th className="px-6 py-4 text-right">YTD Payments</th>
                <th className="px-4 py-4 text-right">Hrs Tracked</th>
                <th className="px-4 py-4 text-right">Owed</th>
                <th className="px-4 py-4 text-right">Paid</th>
                <th className="px-4 py-4 text-right">Balance</th>
                <th className="px-6 py-4 text-center">Portal Access</th>
                <th className="px-4 py-4 text-center">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={10} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading subs…</td></tr>
              ) : subs?.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
                    <HardHat className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No subcontractors added
                  </td>
                </tr>
              ) : (
                subs?.map(sub => {
                  const hasToken = !!sub.portalToken;
                  const approved = !!sub.portalApproved;
                  return (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground text-base">{sub.name}</div>
                        <div className="text-xs text-muted-foreground">{sub.trade || "Unspecified Trade"}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{sub.phone || sub.email || "—"}</td>
                      <td className="px-6 py-4 text-center">
                        {sub.w9OnFile ? (
                          <span className="inline-flex items-center text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md text-xs font-semibold">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> On File
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-rose-600 bg-rose-50 px-2 py-1 rounded-md text-xs font-semibold">
                            <ShieldAlert className="w-3 h-3 mr-1" /> Missing
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-display font-bold text-foreground">
                        {formatCurrency(sub.ytdPayments)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm">
                        {(sub as any).totalTrackedHours > 0 ? (
                          <span className="font-medium text-orange-600">{((sub as any).totalTrackedHours as number).toFixed(1)}h</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right text-sm">
                        {(sub as any).totalOwed > 0 ? (
                          <span className="font-medium text-foreground">{formatCurrency((sub as any).totalOwed)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right text-sm">
                        {(sub as any).totalPaid > 0 ? (
                          <span className="font-medium text-emerald-600">{formatCurrency((sub as any).totalPaid)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-4 text-right text-sm">
                        {(sub as any).balanceSettled ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Settled
                            </span>
                            <button
                              onClick={() => setSettleConfirm({ id: sub.id, name: sub.name, reopen: true })}
                              className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
                            >
                              Reopen
                            </button>
                          </div>
                        ) : (sub as any).balance > 0.01 ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-bold text-red-600">{formatCurrency((sub as any).balance)}</span>
                            {canEdit("subcontractors") && (
                              <button
                                onClick={() => setSettleConfirm({ id: sub.id, name: sub.name, reopen: false })}
                                className="text-[10px] text-emerald-700 hover:text-emerald-900 underline transition-colors"
                              >
                                Mark Settled
                              </button>
                            )}
                          </div>
                        ) : (sub as any).totalOwed > 0 ? (
                          <span className="text-emerald-600 font-medium">✓</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            onClick={() => openInviteModal(sub)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              hasToken && approved
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                : hasToken
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
                            }`}
                          >
                            {hasToken && approved ? (
                              <><ShieldCheck className="w-3.5 h-3.5" /> Active</>
                            ) : hasToken ? (
                              <><ShieldX className="w-3.5 h-3.5" /> Revoked</>
                            ) : (
                              <><Link2 className="w-3.5 h-3.5" /> Set Up Portal</>
                            )}
                          </button>
                          {hasToken && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${sub.portalPinSet ? "text-emerald-600" : "text-muted-foreground"}`}>
                              {sub.portalPinSet
                                ? <><Lock className="w-2.5 h-2.5" /> PIN set</>
                                : <><LockOpen className="w-2.5 h-2.5" /> No PIN</>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {canEdit("subcontractors") && (
                          <button
                            onClick={() => setDeleteConfirm({ id: sub.id, name: sub.name, hasLinkedRecords: !!(sub as any).hasLinkedRecords })}
                            disabled={deletingId === sub.id}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors mx-auto disabled:opacity-40"
                            title="Delete subcontractor"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm bg-card border-border shadow-2xl p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-display flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Delete Subcontractor
              </DialogTitle>
            </DialogHeader>
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete <strong className="text-foreground">{deleteConfirm.name}</strong>? This will remove them from your subcontractor list.
              </p>
              {deleteConfirm.hasLinkedRecords && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                  <span>This subcontractor has linked payment records. Those expenses and payments will remain in your records but will no longer be associated with a subcontractor.</span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors text-sm border border-border"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  disabled={deletingId === deleteConfirm.id}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm disabled:opacity-60 shadow"
                >
                  {deletingId === deleteConfirm.id ? "Deleting…" : "Yes, Delete"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Subcontractor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">Add Subcontractor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company / Full Name *</label>
              <input name="name" required className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Trade</label>
                <input name="trade" placeholder="e.g. Plumbing" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input name="phone" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input name="email" type="email" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pay Rate ($/hr or flat)</label>
                <input name="payRate" type="number" step="0.01" min="0" placeholder="0.00" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rate Type</label>
                <select name="payType" className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="hourly">Hourly</option>
                  <option value="flat">Flat per Job</option>
                  <option value="per_sqft">Per Sq Ft</option>
                </select>
              </div>
            </div>
            <div className="pt-2">
              <label className="flex items-center p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                <input type="checkbox" name="w9" className="w-4 h-4 text-primary rounded border-muted-foreground focus:ring-primary/20" />
                <span className="ml-3 text-sm font-medium">W-9 Form is already on file</span>
              </label>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {createMutation.isPending ? "Saving…" : "Add Sub"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Portal Invite Modal */}
      {inviteModal && (
        <Dialog open={!!inviteModal} onOpenChange={() => { setInviteModal(null); setPortalError(null); }}>
          <DialogContent className="bg-card border-border shadow-2xl p-5 sm:p-6 rounded-2xl max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-display flex items-center gap-2 pr-6">
                <HardHat className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="truncate">{inviteModal.name}</span>
              </DialogTitle>
            </DialogHeader>

            {/* Tab navigation */}
            <div className="flex rounded-xl border border-border overflow-hidden mt-3">
              <button
                onClick={() => setSubDetailTab("portal")}
                className={`flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${subDetailTab === "portal" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/40"}`}
              >
                <Link2 className="w-3.5 h-3.5" /> Portal & Pay
              </button>
              <button
                onClick={() => setSubDetailTab("history")}
                className={`flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${subDetailTab === "history" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/40"}`}
              >
                <History className="w-3.5 h-3.5" /> Payment History
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {subDetailTab === "portal" && (
              <>
              {/* Error display */}
              {portalError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{portalError}</p>
                </div>
              )}

              {inviteModal.token && inviteModal.portalApproved ? (
                <>
                  {/* Active portal state */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-100">
                        <ShieldCheck className="w-5 h-5 text-emerald-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-emerald-900">Portal Access Active</p>
                        <p className="text-xs mt-0.5 text-emerald-700">
                          {inviteModal.name} can log in and use their portal with the link below.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => revokeAccess(inviteModal.id)}
                      disabled={revoking}
                      className="self-start sm:self-auto flex-shrink-0 px-4 py-2 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50 bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                    >
                      {revoking ? "…" : "Revoke"}
                    </button>
                  </div>

                  {/* Explanation */}
                  <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                    <p className="text-sm text-foreground/80">
                      Share this private link with <strong>{inviteModal.name}</strong>. They can view their payments, track expenses, log mileage, complete their W-9, and generate their own tax documents.
                    </p>
                  </div>

                  {/* PIN status */}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-xl border border-border">
                    <div className="flex items-center gap-2">
                      {inviteModal.portalPinSet && !pinResetDone[inviteModal.id]
                        ? <Lock className="w-4 h-4 text-emerald-600" />
                        : <LockOpen className="w-4 h-4 text-muted-foreground" />}
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {inviteModal.portalPinSet && !pinResetDone[inviteModal.id] ? "PIN protection active" : "No PIN set"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {inviteModal.portalPinSet && !pinResetDone[inviteModal.id]
                            ? `${inviteModal.name} set a PIN — their portal is secure.`
                            : `${inviteModal.name} will be prompted to create a PIN on first visit.`}
                        </p>
                      </div>
                    </div>
                    {inviteModal.portalPinSet && !pinResetDone[inviteModal.id] && (
                      <button
                        onClick={() => resetPortalPin(inviteModal.id)}
                        disabled={resettingPin}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50 ml-3"
                      >
                        {resettingPin ? "…" : "Reset PIN"}
                      </button>
                    )}
                    {pinResetDone[inviteModal.id] && (
                      <span className="text-xs text-emerald-600 font-semibold ml-3 flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> Reset!
                      </span>
                    )}
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={() => copyLink(inviteModal.token!)}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {copied ? <><CheckCheck className="w-5 h-5" /> Link Copied!</> : <><Copy className="w-5 h-5" /> Copy Portal Link</>}
                  </button>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Paste the link and send it to {inviteModal.name}.</p>
                    <button
                      onClick={() => generateAndApprovePortalLink(inviteModal.id)}
                      disabled={generating}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                    >
                      <RefreshCw className={`w-3 h-3 ${generating ? "animate-spin" : ""}`} />
                      {generating ? "Regenerating…" : "New Link"}
                    </button>
                  </div>
                </>
              ) : inviteModal.token && !inviteModal.portalApproved ? (
                <>
                  {/* Revoked state — has token but not approved */}
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 rounded-2xl border-2 border-amber-200 bg-amber-50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-100">
                        <ShieldX className="w-5 h-5 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-amber-900">Access Revoked</p>
                        <p className="text-xs mt-0.5 text-amber-700">
                          {inviteModal.name} has a portal link but access has been revoked. Re-enable to restore access.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => generateAndApprovePortalLink(inviteModal.id)}
                      disabled={generating}
                      className="self-start sm:self-auto flex-shrink-0 px-4 py-2 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {generating ? "…" : "Re-enable"}
                    </button>
                  </div>
                </>
              ) : (
                /* No token yet */
                <div className="text-center py-4 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                    <Link2 className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No portal link yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generate a secure link for {inviteModal.name}. They'll be able to access it immediately — you can revoke access at any time.
                    </p>
                  </div>
                  <button
                    onClick={() => generateAndApprovePortalLink(inviteModal.id)}
                    disabled={generating}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md"
                  >
                    <Link2 className="w-4 h-4" />
                    {generating ? "Generating…" : "Generate Portal Link"}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    The sub can access the portal immediately after you generate the link.
                  </p>
                </div>
              )}
              {/* Pay Rate section — always visible, editable */}
              <div className="border-t border-border/50 pt-4 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay Rate</p>
                  {!editingRate && (
                    <button onClick={() => setEditingRate(true)}
                      className="text-xs text-primary hover:underline">
                      Edit
                    </button>
                  )}
                </div>
                {editingRate ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Work rate/hr or flat</label>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={rateForm.payRate}
                          onChange={e => setRateForm(f => ({ ...f, payRate: e.target.value }))}
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Travel rate/hr</label>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={rateForm.travelPayRate}
                          onChange={e => setRateForm(f => ({ ...f, travelPayRate: e.target.value }))}
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Type</label>
                      <select value={rateForm.payType}
                        onChange={e => setRateForm(f => ({ ...f, payType: e.target.value }))}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none">
                        <option value="hourly">Hourly</option>
                        <option value="flat">Flat per Job</option>
                        <option value="per_sqft">Per Sq Ft</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Role</label>
                      <div className="flex rounded-lg border border-border overflow-hidden">
                        <button type="button"
                          onClick={() => setRateForm(f => ({ ...f, role: "hourly" }))}
                          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${rateForm.role !== "member" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/40"}`}>
                          Hourly Worker
                        </button>
                        <button type="button"
                          onClick={() => setRateForm(f => ({ ...f, role: "member" }))}
                          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${rateForm.role === "member" ? "bg-violet-600 text-white" : "bg-background text-muted-foreground hover:bg-muted/40"}`}>
                          Member
                        </button>
                      </div>
                    </div>
                    {rateForm.role === "member" && (
                      <div>
                        <label className="block text-[10px] font-medium mb-1 text-muted-foreground">Growth % (of job revenue)</label>
                        <div className="relative">
                          <input type="number" step="0.1" min="0" max="100" placeholder="e.g. 5"
                            value={rateForm.growthPct}
                            onChange={e => setRateForm(f => ({ ...f, growthPct: e.target.value }))}
                            className="w-full px-2 py-1.5 pr-8 text-sm rounded-lg border border-violet-300 bg-background outline-none focus:ring-2 focus:ring-violet-200" />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Portion of each job's revenue contributed to the growth fund before the member split.</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setEditingRate(false)}
                        className="flex-1 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleSaveRate} disabled={savingRate}
                        className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                        {savingRate ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-sm text-foreground">
                      {inviteModal.payRate != null
                        ? <><span className="font-semibold">{formatCurrency(inviteModal.payRate)}</span> <span className="text-muted-foreground text-xs">{inviteModal.payType ?? "hourly"}</span></>
                        : <span className="text-muted-foreground italic text-xs">No rate set — click Edit to add one</span>}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {inviteModal.role === "member" ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 border border-violet-200 text-violet-700">Member</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600">Hourly Worker</span>
                      )}
                      {inviteModal.role === "member" && (inviteModal.growthPct ?? 0) > 0 && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{((inviteModal.growthPct ?? 0) * 100).toFixed(1)}% growth</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </>
              )}

              {/* Payment History Tab */}
              {subDetailTab === "history" && (
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex gap-2 flex-wrap">
                    <div className="flex-1 min-w-[100px]">
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Year</label>
                      <select
                        value={historyYear}
                        onChange={e => setHistoryYear(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none"
                      >
                        <option value="all">All Years</option>
                        {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Business Line</label>
                      <select
                        value={historyBusinessLine}
                        onChange={e => setHistoryBusinessLine(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-border bg-background outline-none"
                      >
                        <option value="">All Lines</option>
                        {(paymentHistory?.allBusinessLines ?? []).map(bl => (
                          <option key={bl} value={bl}>{bl}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* YTD Totals */}
                  {paymentHistory && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">YTD Paid</p>
                        <p className="text-sm font-bold text-emerald-800 mt-0.5">{formatCurrency(paymentHistory.ytdPaid)}</p>
                      </div>
                      <div className="bg-muted/50 border border-border rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total Owed</p>
                        <p className="text-sm font-bold text-foreground mt-0.5">{formatCurrency(paymentHistory.totalOwed)}</p>
                      </div>
                      <div className={`rounded-xl px-3 py-2.5 text-center border ${paymentHistory.balance > 0.01 ? "bg-red-50 border-red-200" : "bg-muted/30 border-border"}`}>
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${paymentHistory.balance > 0.01 ? "text-red-700" : "text-muted-foreground"}`}>Outstanding</p>
                        <p className={`text-sm font-bold mt-0.5 ${paymentHistory.balance > 0.01 ? "text-red-700" : "text-muted-foreground"}`}>
                          {paymentHistory.balance > 0.01 ? formatCurrency(paymentHistory.balance) : "—"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Jobs table */}
                  {paymentHistoryLoading ? (
                    <div className="text-center py-8 text-muted-foreground text-sm animate-pulse">Loading history…</div>
                  ) : !paymentHistory || paymentHistory.jobs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <History className="w-7 h-7 mx-auto mb-2 opacity-20" />
                      No jobs found{historyYear !== "all" ? ` for ${historyYear}` : ""}{historyBusinessLine ? ` · ${historyBusinessLine}` : ""}
                    </div>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden">
                      <div className="max-h-72 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/60 text-muted-foreground text-[10px] uppercase font-semibold sticky top-0">
                            <tr>
                              <th className="px-3 py-2">Job</th>
                              <th className="px-3 py-2 text-center">Type</th>
                              <th className="px-3 py-2 text-right">Owed</th>
                              <th className="px-3 py-2 text-right">Paid</th>
                              <th className="px-3 py-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {paymentHistory.jobs.map(job => (
                              <tr key={job.jobId} className="hover:bg-muted/20">
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-foreground leading-tight">{job.jobTitle}</div>
                                  {job.businessLine && <div className="text-muted-foreground text-[10px] mt-0.5">{job.businessLine}</div>}
                                  {job.paidDate && <div className="text-muted-foreground text-[10px]">{job.paidDate}</div>}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground capitalize">
                                    {job.compensationType === "hourly" && job.totalHours > 0
                                      ? `${job.totalHours.toFixed(1)}h`
                                      : job.compensationType}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-foreground">
                                  {job.amountOwed != null ? formatCurrency(job.amountOwed) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-emerald-700">
                                  {job.amountPaid > 0 ? formatCurrency(job.amountPaid) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {job.paymentStatus === "paid" ? (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                                    </span>
                                  ) : job.paymentStatus === "partial" ? (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                      <Clock className="w-2.5 h-2.5" /> Partial
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                      <AlertCircle className="w-2.5 h-2.5" /> Unpaid
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-2 bg-muted/30 border-t border-border text-[10px] text-muted-foreground text-right">
                        {paymentHistory.jobs.length} job{paymentHistory.jobs.length !== 1 ? "s" : ""}{historyYear !== "all" ? ` · ${historyYear}` : " · all time"}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 1099 Revoke Confirmation Dialog */}
      {revoke1099Confirm && (
        <Dialog open={!!revoke1099Confirm} onOpenChange={() => { setRevoke1099Confirm(null); setRevoke1099Error(null); }}>
          <DialogContent className="max-w-sm bg-card border-border shadow-2xl p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-display flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Revoke 1099?
              </DialogTitle>
            </DialogHeader>
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">
                This will permanently delete the 1099-NEC for{" "}
                <strong className="text-foreground">{revoke1099Confirm.subName}</strong>.
              </p>
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <strong>{revoke1099Confirm.subName}</strong> will immediately lose access to this tax document in their portal. This cannot be undone — you can re-generate a new 1099 at any time.
                </span>
              </div>
              {revoke1099Error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <span>{revoke1099Error}</span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setRevoke1099Confirm(null); setRevoke1099Error(null); }}
                  disabled={revoking1099Id === revoke1099Confirm.id}
                  className="flex-1 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors text-sm border border-border disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRevoke1099(revoke1099Confirm.id)}
                  disabled={revoking1099Id === revoke1099Confirm.id}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm disabled:opacity-60 shadow"
                >
                  {revoking1099Id === revoke1099Confirm.id ? "Revoking…" : "Yes, Revoke"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 1099 Report Modal */}
      {show1099Modal && (
        <Dialog open={show1099Modal} onOpenChange={(o) => { if (!o) setShow1099Modal(false); }}>
          <DialogContent className="max-w-2xl bg-card border-border shadow-2xl p-0 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-amber-50">
              <DialogTitle className="text-xl font-display flex items-center gap-2 text-amber-900">
                <FileText className="w-5 h-5 text-amber-600" /> Year-End 1099-NEC Report
              </DialogTitle>
              <div className="flex items-center gap-3 mt-3">
                <label className="text-sm font-medium text-amber-800">Tax Year:</label>
                <select
                  value={report1099Year}
                  onChange={e => setReport1099Year(parseInt(e.target.value))}
                  className="px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-sm font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <p className="text-xs text-amber-700 ml-2">Threshold: $2,000 (qualifying cash/check/ACH payments)</p>
              </div>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {report1099Loading ? (
                <div className="text-center py-8 text-muted-foreground animate-pulse">Loading 1099 data…</div>
              ) : !report1099Data?.subcontractors?.length ? (
                <div className="text-center py-8">
                  <HardHat className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm text-muted-foreground">No subcontractors to report.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 pb-2">
                    {[
                      {
                        label: "1099 Required",
                        count: report1099Data.subcontractors.filter((s: any) => s.requires1099).length,
                        color: "text-amber-700 bg-amber-50 border-amber-200",
                      },
                      {
                        label: "W-9 Complete",
                        count: report1099Data.subcontractors.filter((s: any) => s.w9Complete).length,
                        color: "text-emerald-700 bg-emerald-50 border-emerald-200",
                      },
                      {
                        label: "1099s Generated",
                        count: report1099Data.subcontractors.filter((s: any) => s.status === "generated").length,
                        color: "text-blue-700 bg-blue-50 border-blue-200",
                      },
                    ].map(stat => (
                      <div key={stat.label} className={`rounded-xl border px-3 py-2.5 text-center ${stat.color}`}>
                        <p className="text-2xl font-display font-bold">{stat.count}</p>
                        <p className="text-xs font-semibold">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {report1099Data.subcontractors.map((sub: any) => {
                    const isExpanded = expanded1099 === sub.subcontractorId;
                    const isGenerating = generating1099 === sub.subcontractorId;

                    const statusBadge = sub.status === "generated"
                      ? { cls: "bg-blue-100 text-blue-700", icon: <BadgeCheck className="w-3 h-3" />, label: "Generated" }
                      : sub.requires1099
                      ? { cls: "bg-amber-100 text-amber-700", icon: <AlertTriangle className="w-3 h-3" />, label: "Required" }
                      : { cls: "bg-muted text-muted-foreground", icon: <Ban className="w-3 h-3" />, label: "Below Threshold" };

                    return (
                      <div key={sub.subcontractorId} className={`rounded-2xl border transition-all ${
                        sub.requires1099 ? "border-amber-200 bg-amber-50/40" : "border-border bg-card"
                      }`}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-foreground">{sub.name}</p>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.cls}`}>
                                {statusBadge.icon} {statusBadge.label}
                              </span>
                              {!sub.w9Complete && sub.requires1099 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                                  <AlertCircle className="w-3 h-3" /> W-9 Incomplete
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {sub.requires1099
                                ? <span className="font-semibold text-amber-700">{formatCurrency(sub.totalQualifying)} qualifying payments</span>
                                : <span>{formatCurrency(sub.totalQualifying)} — below $2,000 threshold</span>
                              }
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {sub.status === "generated" && sub.existingRecord && (
                              <button
                                onClick={() => downloadExisting1099(sub)}
                                disabled={isGenerating}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
                              >
                                {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                Download
                              </button>
                            )}
                            {sub.status === "generated" && sub.existingRecord && (
                              <button
                                onClick={() => setRevoke1099Confirm({ id: sub.existingRecord.id, subName: sub.name })}
                                disabled={isGenerating || revoking1099Id === sub.existingRecord.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                                title="Revoke / Delete this 1099"
                              >
                                <Trash2 className="w-3 h-3" /> Revoke / Delete
                              </button>
                            )}
                            {sub.requires1099 && (
                              <button
                                onClick={() => generate1099Pdf(sub)}
                                disabled={isGenerating}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50 shadow-sm"
                              >
                                {isGenerating ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                {sub.status === "generated" ? "Re-generate" : "Generate PDF"}
                              </button>
                            )}
                            <button
                              onClick={() => setExpanded1099(isExpanded ? null : sub.subcontractorId)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-border/50 mt-0 pt-3 space-y-2">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-muted-foreground font-semibold">Legal Name</p>
                                <p className="text-foreground">{sub.w9LegalName || sub.name}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">TIN</p>
                                <p className="text-foreground">
                                  {sub.w9TaxIdLastFour
                                    ? `${sub.w9TaxIdType || "SSN"}: ***-**-${sub.w9TaxIdLastFour}`
                                    : <span className="text-red-600">Not on file</span>}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">Address</p>
                                <p className="text-foreground">
                                  {[sub.w9Address, sub.w9City, sub.w9State, sub.w9Zip].filter(Boolean).join(", ") || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-semibold">W-9 Status</p>
                                <p className={sub.w9Complete ? "text-emerald-600 font-semibold" : "text-red-600"}>
                                  {sub.w9Complete ? "Complete" : "Incomplete — portal W-9 needed"}
                                </p>
                              </div>
                              {sub.status === "generated" && sub.existingRecord && (
                                <div className="col-span-2">
                                  <p className="text-muted-foreground font-semibold">Last Generated</p>
                                  <p className="text-blue-700">
                                    {new Date(sub.existingRecord.generatedAt).toLocaleDateString()} · {formatCurrency(sub.existingRecord.totalPaid)} filed
                                  </p>
                                </div>
                              )}
                            </div>
                            {!sub.w9Complete && (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                Ask {sub.name} to complete their W-9 in the subcontractor portal before generating the 1099-NEC.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-between items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">
                Generated PDFs are available for subcontractors to download from their portal. All subcontractor payments count toward the $2,000 OBBBA 2026 reporting threshold.
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                {report1099Data?.subcontractors?.some((s: any) => s.requires1099 && s.status !== "generated") && (
                  <button
                    onClick={issueAll1099s}
                    disabled={issuingAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {issuingAll ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                    Issue All
                  </button>
                )}
                <button
                  onClick={() => setShow1099Modal(false)}
                  className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Settle / Reopen confirmation dialog ── */}
      <Dialog open={!!settleConfirm} onOpenChange={() => setSettleConfirm(null)}>
        <DialogContent className="max-w-sm bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              {settleConfirm?.reopen ? "Reopen Balance?" : "Mark Balance as Settled?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            {settleConfirm?.reopen
              ? <><strong className="text-foreground">{settleConfirm.name}</strong>'s balance will calculate normally again.</>
              : <>This marks <strong className="text-foreground">{settleConfirm?.name}</strong>'s balance as fully settled — OWED and PAID will both reflect the actual expense total, and the balance will show $0.</>
            }
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setSettleConfirm(null)}
              className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => settleConfirm && handleSettle(settleConfirm.id, settleConfirm.reopen)}
              disabled={settlingId === settleConfirm?.id}
              className={`px-4 py-2 rounded-xl font-semibold text-sm transition-colors ${
                settleConfirm?.reopen
                  ? "bg-muted text-foreground hover:bg-muted/80"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {settlingId === settleConfirm?.id ? "Saving…" : settleConfirm?.reopen ? "Yes, Reopen" : "Yes, Mark Settled"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
