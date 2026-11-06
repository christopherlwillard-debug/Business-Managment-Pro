import { useState } from "react";
import { useListClients, useCreateClient, useUpdateClient } from "@workspace/api-client-react";
import { Users, Plus, Phone, Mail, MapPin, Edit2, Trash2, AlertTriangle, ChevronRight, Calendar, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientProfileDrawer } from "@/components/ClientProfileDrawer";
import { useUserPermissions } from "@/contexts/UserPermissions";
import { useBusiness } from "@/contexts/BusinessContext";
import { useLocation } from "wouter";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getClientBusinessScopeQuery, getClientSourceBusinessFields } from "@/lib/clientBusinessScope";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isDueSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  return d <= in90;
}

export default function Clients() {
  const { canEdit } = useUserPermissions();
  const { activeBusiness } = useBusiness();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { data: clients, isLoading, refetch } = useListClients(
    activeBusiness?.id != null ? { businessId: activeBusiness.id } : undefined,
  );
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLinkCounts, setDeleteLinkCounts] = useState<{ jobCount: number; invoiceCount: number; estimateCount: number; billingProfileCount: number; mfhPricingCount: number; productionPricingCount: number } | null>(null);
  const [isCheckingDelete, setIsCheckingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profileClientId, setProfileClientId] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      address: formData.get("address") as string,
      city: formData.get("city") as string,
      state: formData.get("state") as string,
      zip: formData.get("zip") as string,
      notes: formData.get("notes") as string,
      reminderOptOut: formData.get("reminderOptOut") === "on",
      mileageSurchargeEnabled: formData.get("mileageSurchargeEnabled") === "on",
      mileageSurchargeTriggerMiles: formData.get("mileageSurchargeTriggerMiles") ? Number(formData.get("mileageSurchargeTriggerMiles")) : null,
      mileageSurchargeDailyRate: formData.get("mileageSurchargeDailyRate") ? Number(formData.get("mileageSurchargeDailyRate")) : null,
      ...(editingClient ? getClientSourceBusinessFields(editingClient) : {}),
    };

    try {
      if (editingClient) {
        await updateMutation.mutateAsync({ id: editingClient.id, data: payload });
      } else {
        await createMutation.mutateAsync({ data: payload });
      }
      setIsDialogOpen(false);
      setEditingClient(null);
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditDialog = (client: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingClient(client);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingClient(null);
  };

  const handleDeleteClick = async (client: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCheckingDelete(true);
    setDeleteTarget(client);
    try {
      const res = await fetch(`${BASE}/api/clients/${client.id}/link-counts${getClientBusinessScopeQuery(client)}`, { credentials: "include" });
      if (res.ok) {
        const counts = await res.json();
        setDeleteLinkCounts(counts);
      } else {
        setDeleteLinkCounts({ jobCount: 0, invoiceCount: 0, estimateCount: 0, billingProfileCount: 0, mfhPricingCount: 0, productionPricingCount: 0 });
      }
    } catch {
      setDeleteLinkCounts({ jobCount: 0, invoiceCount: 0, estimateCount: 0 });
    } finally {
      setIsCheckingDelete(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`${BASE}/api/clients/${deleteTarget.id}${getClientBusinessScopeQuery(deleteTarget)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete client");
      }
      refetch();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Failed to delete client", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
      setDeleteLinkCounts(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
    setDeleteLinkCounts(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your customer relationships.</p>
        </div>
        {canEdit("clients") && (
          <button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-md transition-all hover:shadow-lg active:scale-95"
          >
            <Plus className="w-5 h-5 mr-2" /> Add Client
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-40 bg-card rounded-2xl border border-border/50 animate-pulse" />)
        ) : clients?.length === 0 ? (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Add your first client to get started.</p>
          </div>
        ) : (
          clients?.map(client => {
            const c = client as any;
            const dueSoon = isDueSoon(c.nextServiceDate);
            return (
              <Card
                key={client.id}
                onClick={() => setProfileClientId(client.id)}
                className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-card overflow-hidden group cursor-pointer"
              >
                <div className={cn("h-2 transition-colors", dueSoon ? "bg-amber-400 group-hover:bg-amber-500" : "bg-primary/20 group-hover:bg-primary")} />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold font-display text-foreground truncate">{client.name}</h3>
                      {c.nextServiceDate && (
                        <p className={cn("text-xs mt-0.5 flex items-center gap-1", dueSoon ? "text-amber-600 font-medium" : "text-muted-foreground")}>
                          <Calendar className="w-3 h-3" />
                          Next service: {formatDate(c.nextServiceDate)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={e => openEditDialog(client, e)}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit client"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => handleDeleteClick(client, e)}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Delete client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {client.phone && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Phone className="w-4 h-4 mr-3 text-primary/60" /> {client.phone}
                      </div>
                    )}
                    {client.email && (
                      <div className="flex items-center text-sm text-muted-foreground truncate">
                        <Mail className="w-4 h-4 mr-3 text-primary/60 flex-shrink-0" /> <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {(client.address || client.city || client.state || client.zip) && (
                      <div className="flex items-start text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4 mr-3 mt-0.5 text-primary/60 flex-shrink-0" />
                        <span className="line-clamp-2">
                          {client.address && <>{client.address}<br /></>}
                          {[client.city, client.state, client.zip].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  {(c.outstandingBalance > 0) && (
                    <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
                      c.hasOverdueInvoice
                        ? "bg-red-50 text-red-700 border border-red-100"
                        : "bg-amber-50 text-amber-700 border border-amber-100"
                    }`}>
                      <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>
                        {formatCurrency(c.outstandingBalance)} outstanding
                        {c.openInvoiceCount > 0 && (
                          <span className="ml-1 opacity-75">· {c.openInvoiceCount} open {c.openInvoiceCount === 1 ? "invoice" : "invoices"}</span>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center text-xs text-primary/60 group-hover:text-primary transition-colors font-medium">
                    View profile <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Client Profile Drawer */}
      {profileClientId !== null && (
        <ClientProfileDrawer
          clientId={profileClientId}
          onClose={() => setProfileClientId(null)}
          onAddToRoute={(id) => {
            setProfileClientId(null);
            navigate(`${BASE}/route-planner?clientId=${id}`);
          }}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md bg-card border-border shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display">
              {editingClient ? "Edit Client" : "Add Client"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name / Company *</label>
              <input
                name="name"
                required
                defaultValue={editingClient?.name || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingClient?.email || ""}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  name="phone"
                  defaultValue={editingClient?.phone || ""}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                name="address"
                defaultValue={editingClient?.address || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 mb-3"
                placeholder="Street"
              />
              <div className="grid grid-cols-5 gap-2">
                <input name="city" defaultValue={editingClient?.city || ""} className="col-span-2 px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="City" />
                <input name="state" defaultValue={editingClient?.state || ""} maxLength={2} className="col-span-1 px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 uppercase" placeholder="ST" />
                <input name="zip" defaultValue={editingClient?.zip || ""} className="col-span-2 px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20" placeholder="Zip" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                name="notes"
                defaultValue={editingClient?.notes || ""}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                rows={3}
                placeholder="Additional notes..."
              />
            </div>
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/30">
              <input
                type="checkbox"
                name="reminderOptOut"
                id="reminderOptOut"
                defaultChecked={editingClient?.reminderOptOut ?? false}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary accent-primary cursor-pointer"
              />
              <label htmlFor="reminderOptOut" className="cursor-pointer select-none">
                <span className="block text-sm font-medium">Exclude from invoice reminders</span>
                <span className="block text-xs text-muted-foreground mt-0.5">This client will not receive automated payment reminder emails.</span>
              </label>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Mileage surcharge</p>
                <p className="text-xs text-muted-foreground mt-0.5">Prompt before adding a daily travel charge to a draft invoice when the route reaches the threshold.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="mileageSurchargeEnabled" defaultChecked={editingClient?.mileageSurchargeEnabled ?? false} className="h-4 w-4 accent-primary" />
                Enable mileage surcharge prompts
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Trigger miles
                  <input name="mileageSurchargeTriggerMiles" type="number" min="0" step="0.1" defaultValue={editingClient?.mileageSurchargeTriggerMiles ?? ""} className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background" />
                </label>
                <label className="text-xs text-muted-foreground">Daily rate
                  <input name="mileageSurchargeDailyRate" type="number" min="0" step="0.01" defaultValue={editingClient?.mileageSurchargeDailyRate ?? ""} className="mt-1 w-full px-3 py-2 rounded-xl border border-border bg-background" />
                </label>
              </div>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={closeDialog} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-6 py-2 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md">
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Client"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleDeleteCancel} />
          <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-2xl border border-red-100 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">Permanently delete client?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-semibold text-foreground">{deleteTarget.name}</span>
                  {" "}will be{" "}
                  <span className="font-semibold text-red-600">permanently deleted</span> and cannot be recovered.
                </p>
              </div>
            </div>
            {isCheckingDelete && (
              <div className="text-sm text-muted-foreground animate-pulse px-1">Checking linked records…</div>
            )}
            {!isCheckingDelete && deleteLinkCounts && (deleteLinkCounts.jobCount > 0 || deleteLinkCounts.invoiceCount > 0 || deleteLinkCounts.estimateCount > 0 || deleteLinkCounts.billingProfileCount > 0 || deleteLinkCounts.mfhPricingCount > 0 || deleteLinkCounts.productionPricingCount > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-amber-800">This client has linked records:</p>
                <ul className="text-sm text-amber-700 list-disc list-inside space-y-0.5">
                  {deleteLinkCounts.jobCount > 0 && (
                    <li>{deleteLinkCounts.jobCount} {deleteLinkCounts.jobCount === 1 ? "job" : "jobs"}</li>
                  )}
                  {deleteLinkCounts.invoiceCount > 0 && (
                    <li>{deleteLinkCounts.invoiceCount} {deleteLinkCounts.invoiceCount === 1 ? "invoice" : "invoices"}</li>
                  )}
                  {deleteLinkCounts.estimateCount > 0 && (
                    <li>{deleteLinkCounts.estimateCount} {deleteLinkCounts.estimateCount === 1 ? "estimate" : "estimates"}</li>
                  )}
                  {deleteLinkCounts.billingProfileCount > 0 && (
                    <li>{deleteLinkCounts.billingProfileCount} saved billing {deleteLinkCounts.billingProfileCount === 1 ? "profile" : "profiles"}</li>
                  )}
                  {deleteLinkCounts.mfhPricingCount > 0 && (
                    <li>{deleteLinkCounts.mfhPricingCount} manufacturer-specific price {deleteLinkCounts.mfhPricingCount === 1 ? "override" : "overrides"}</li>
                  )}
                  {deleteLinkCounts.productionPricingCount > 0 && (
                    <li>{deleteLinkCounts.productionPricingCount} production price {deleteLinkCounts.productionPricingCount === 1 ? "override" : "overrides"}</li>
                  )}
                </ul>
                {(deleteLinkCounts.billingProfileCount > 0 || deleteLinkCounts.mfhPricingCount > 0 || deleteLinkCounts.productionPricingCount > 0) && (
                  <p className="text-xs text-red-700 mt-1">Deletion is blocked until saved billing and pricing settings are transferred or removed.</p>
                )}
                {(deleteLinkCounts.jobCount > 0 || deleteLinkCounts.invoiceCount > 0 || deleteLinkCounts.estimateCount > 0) && (
                  <p className="text-xs text-amber-600 mt-1">Linked jobs, invoices, and estimates will remain but will no longer be associated with this client.</p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={handleDeleteCancel} disabled={isDeleting} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteConfirmed} disabled={isDeleting || isCheckingDelete} className="px-4 py-2 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {isDeleting ? "Deleting…" : <><Trash2 className="w-4 h-4" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
