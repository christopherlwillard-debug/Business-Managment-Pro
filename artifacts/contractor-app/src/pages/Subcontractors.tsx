import { useState } from "react";
import { useListSubcontractors, useCreateSubcontractor } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import {
  HardHat, Plus, ShieldAlert, CheckCircle2, Link2, Copy, ExternalLink,
  RefreshCw, CheckCheck, ShieldCheck, ShieldX, Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Subcontractors() {
  const { data: subs, isLoading, refetch } = useListSubcontractors();
  const createMutation = useCreateSubcontractor();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inviteModal, setInviteModal] = useState<{
    name: string; token: string | null; id: number; portalApproved: boolean;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function generatePortalLink(subId: number) {
    setGenerating(true);
    try {
      const res = await fetch(`${BASE}/api/portal/generate/${subId}`, { method: "POST" });
      const data = await res.json();
      if (data.portalToken) {
        setInviteModal(prev => prev ? { ...prev, token: data.portalToken } : null);
        refetch();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function toggleApproval(subId: number, approve: boolean) {
    setApproving(true);
    try {
      await fetch(`${BASE}/api/portal/approve/${subId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: approve }),
      });
      setInviteModal(prev => prev ? { ...prev, portalApproved: approve } : null);
      refetch();
    } finally {
      setApproving(false);
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

  function openInviteModal(sub: any) {
    setCopied(false);
    setInviteModal({
      name: sub.name,
      token: sub.portalToken ?? null,
      id: sub.id,
      portalApproved: sub.portalApproved ?? false,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Subcontractors</h1>
          <p className="text-muted-foreground mt-1">Manage subs, W-9s, 1099 compliance, and portal access.</p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
        >
          <Plus className="w-5 h-5 mr-2" /> Add Subcontractor
        </button>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground animate-pulse">Loading subs…</td></tr>
              ) : subs?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <HardHat className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No subcontractors added
                  </td>
                </tr>
              ) : (
                subs?.map(sub => {
                  const hasToken = !!(sub as any).portalToken;
                  const approved = !!(sub as any).portalApproved;
                  return (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground text-base">{sub.name}</div>
                        <div className="text-xs text-muted-foreground">{(sub as any).trade || "Unspecified Trade"}</div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{(sub as any).phone || (sub as any).email || "—"}</td>
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
                            <><ShieldCheck className="w-3.5 h-3.5" /> Approved</>
                          ) : hasToken ? (
                            <><Clock className="w-3.5 h-3.5" /> Pending</>
                          ) : (
                            <><Link2 className="w-3.5 h-3.5" /> Invite</>
                          )}
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

      {/* Portal Invite + Approval Modal */}
      {inviteModal && (
        <Dialog open={!!inviteModal} onOpenChange={() => setInviteModal(null)}>
          <DialogContent className="max-w-lg bg-card border-border shadow-2xl p-6 rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-display flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                Portal Access — {inviteModal.name}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-5">
              {inviteModal.token ? (
                <>
                  {/* Approval toggle — the key feature */}
                  <div className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-colors ${
                    inviteModal.portalApproved
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-amber-200 bg-amber-50"
                  }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      inviteModal.portalApproved ? "bg-emerald-100" : "bg-amber-100"
                    }`}>
                      {inviteModal.portalApproved
                        ? <ShieldCheck className="w-5 h-5 text-emerald-700" />
                        : <Clock className="w-5 h-5 text-amber-700" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm ${inviteModal.portalApproved ? "text-emerald-900" : "text-amber-900"}`}>
                        {inviteModal.portalApproved ? "Portal Access Approved" : "Access Pending Your Approval"}
                      </p>
                      <p className={`text-xs mt-0.5 ${inviteModal.portalApproved ? "text-emerald-700" : "text-amber-700"}`}>
                        {inviteModal.portalApproved
                          ? `${inviteModal.name} can currently access their portal using the link below.`
                          : `${inviteModal.name} has a link but cannot access the portal until you approve them.`}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleApproval(inviteModal.id, !inviteModal.portalApproved)}
                      disabled={approving}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50 ${
                        inviteModal.portalApproved
                          ? "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {approving ? "…" : inviteModal.portalApproved ? "Revoke" : "Approve"}
                    </button>
                  </div>

                  {/* Explanation */}
                  <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                    <p className="text-sm text-foreground/80">
                      Share this private link with <strong>{inviteModal.name}</strong>. They can view their payments, track expenses, log mileage, complete their W-9, and generate their own tax documents.
                    </p>
                  </div>

                  {/* Portal link */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Portal Link</label>
                    <div className="flex gap-2">
                      <div className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs font-mono text-foreground/70 overflow-hidden text-ellipsis whitespace-nowrap">
                        {getPortalUrl(inviteModal.token)}
                      </div>
                      <button
                        onClick={() => copyLink(inviteModal.token!)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors flex-shrink-0 ${
                          copied
                            ? "bg-emerald-600 text-white"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {copied ? <><CheckCheck className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy</>}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <a
                      href={getPortalUrl(inviteModal.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Preview Portal
                    </a>
                    <button
                      onClick={() => generatePortalLink(inviteModal.id)}
                      disabled={generating}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted/60 transition-colors text-muted-foreground disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
                      {generating ? "Regenerating…" : "New Link"}
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    Generating a new link will invalidate the old one.
                  </p>
                </>
              ) : (
                <div className="text-center py-4 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                    <Link2 className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No portal link yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generate a secure link for {inviteModal.name}. You'll be able to approve or revoke their access at any time.
                    </p>
                  </div>
                  <button
                    onClick={() => generatePortalLink(inviteModal.id)}
                    disabled={generating}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md"
                  >
                    <Link2 className="w-4 h-4" />
                    {generating ? "Generating…" : "Generate Portal Link"}
                  </button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
