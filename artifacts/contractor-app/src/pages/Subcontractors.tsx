import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListSubcontractors, useCreateSubcontractor, useDeleteSubcontractor } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import {
  HardHat, Plus, ShieldAlert, CheckCircle2, Link2, Copy,
  RefreshCw, CheckCheck, ShieldCheck, Clock, AlertCircle, ShieldX, Lock, LockOpen, Trash2,
  FileText, Download, ChevronDown, ChevronUp, AlertTriangle, BadgeCheck, Ban,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generate1099NecPdf } from "@/lib/generate1099NecPdf";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Subcontractors() {
  const { data: subs, isLoading, refetch } = useListSubcontractors();
  const createMutation = useCreateSubcontractor();
  const deleteMutation = useDeleteSubcontractor();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string; hasLinkedRecords: boolean } | null>(null);
  const [inviteModal, setInviteModal] = useState<{
    name: string; token: string | null; id: number; portalApproved: boolean; portalPinSet: boolean;
  } | null>(null);
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

  async function generate1099Pdf(sub: any) {
    setGenerating1099(sub.subcontractorId);
    try {
      const payer = report1099Data?.payerSettings ?? {};
      const blob = generate1099NecPdf({
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
        const blob = generate1099NecPdf({
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
    try {
      await createMutation.mutateAsync({
        data: {
          name: formData.get("name") as string,
          email: formData.get("email") as string || undefined,
          trade: formData.get("trade") as string || undefined,
          phone: formData.get("phone") as string || undefined,
          w9OnFile: formData.get("w9") === "on",
        },
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
    setInviteModal({
      name: sub.name,
      token: sub.portalToken ?? null,
      id: sub.id,
      portalApproved: sub.portalApproved ?? false,
      portalPinSet: !!sub.portalPinSet,
    });
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync({ id });
      refetch();
    } catch (err) {
      console.error(err);
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
          <button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5 mr-2" /> Add Subcontractor
          </button>
        </div>
      </div>

      <Card className="border-border/50 shadow-md overflow-hidden bg-card">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border">
              <tr>
                <th className="px-6 py-4">Name / Trade</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">W-9 Status</th>
                <th className="px-6 py-4 text-right">YTD Payments</th>
                <th className="px-6 py-4 text-center">Portal Access</th>
                <th className="px-4 py-4 text-center">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading subs…</td></tr>
              ) : subs?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
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
                        <button
                          onClick={() => setDeleteConfirm({ id: sub.id, name: sub.name, hasLinkedRecords: !!(sub as any).hasLinkedRecords })}
                          disabled={deletingId === sub.id}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors mx-auto disabled:opacity-40"
                          title="Delete subcontractor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
          <DialogContent className="bg-card border-border shadow-2xl p-5 sm:p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-display flex items-center gap-2 pr-6">
                <Link2 className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="truncate">Portal Access — {inviteModal.name}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-4">
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
                                <Trash2 className="w-3 h-3" /> Revoke
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
    </div>
  );
}
