import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useGetSettings, useUpdateSettings, useSquareStatus, type AppSettings } from "@workspace/api-client-react";
import { RegisteredAgentSection } from "@/components/RegisteredAgentSection";
import { useQueryClient } from "@tanstack/react-query";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Building2, Settings2, Receipt, Check, AlertCircle, Upload,
  X, ImagePlus, Trash2, AlignLeft, AlignCenter, AlignRight,
  ChevronRight, DollarSign, Navigation, FileText, ShieldCheck,
  Bell, Users2, Shield, CheckCircle2, XCircle, UserMinus, UserPlus, Mail,
  Link2, Link2Off, Smartphone, LayoutDashboard, Send, Loader2,
  Plus, ChevronDown, ChevronUp, Home, Globe, Eye, EyeOff, Copy, ClipboardList, BookOpen,
} from "lucide-react";
import { useGoogleAuth } from "@/contexts/GoogleAuth";
import { useUserPermissions, type SectionKey, type Permissions } from "@/contexts/UserPermissions";
import { useToast } from "@/hooks/use-toast";
import { FEATURE_OPTIONS } from "@/lib/featureOptions";
import { HomeLibraryModal } from "@/components/MfhPanel";
import { SignaturePad } from "@/components/SignaturePad";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PAYMENT_TERMS_OPTIONS = ["Due on Receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60"];

const BOTTOM_NAV_OPTIONS = [
  { href: "/jobs", label: "Jobs" },
  { href: "/expenses", label: "Expenses" },
  { href: "/mileage", label: "Mileage" },
  { href: "/people", label: "People" },
  { href: "/subcontractors", label: "Subcontractors" },
  { href: "/materials", label: "Materials" },
  { href: "/route-planner", label: "Route Planner" },
  { href: "/assets", label: "Assets" },
  { href: "/accounting", label: "Accounting & Tax" },
  { href: "/square-transactions", label: "Square Transactions" },
  { href: "/settings", label: "Settings" },
];

const DEFAULT_BOTTOM_NAV_HREFS = ["/route-planner", "/people", "/accounting"];

const ENTITY_TYPES = ["LLC", "Single-Member LLC", "Multi-Member LLC", "S Corporation", "C Corporation", "Sole Proprietor", "Partnership", "DBA"];

const LOGO_POSITIONS = [
  { key: "top-left", label: "Left", icon: AlignLeft },
  { key: "top-center", label: "Center", icon: AlignCenter },
  { key: "top-right", label: "Right", icon: AlignRight },
];

const LOGO_SIZES = [
  { key: "small", label: "Small", px: 64 },
  { key: "medium", label: "Medium", px: 100 },
  { key: "large", label: "Large", px: 160 },
];

const TABS = [
  { key: "profile", label: "Business", icon: Building2 },
  { key: "invoice", label: "Invoice Defaults", icon: FileText },
  { key: "financial", label: "Financial", icon: DollarSign },
  { key: "mileage", label: "Mileage", icon: Navigation },
  { key: "modules", label: "Modules", icon: Settings2 },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "payments", label: "Payments", icon: Receipt },
  { key: "team", label: "Team", icon: Users2 },
  { key: "google", label: "Google", icon: Link2 },
  { key: "integrations", label: "Wix Website", icon: Globe },
];


const PERMISSION_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "expenses", label: "Expenses" },
  { key: "jobs", label: "Jobs" },
  { key: "invoices", label: "Invoices" },
  { key: "clients", label: "Clients" },
  { key: "mileage", label: "Mileage" },
  { key: "subcontractors", label: "Subcontractors" },
  { key: "daily_logs", label: "Daily Logs" },
  { key: "estimates", label: "Estimates" },
  { key: "compliance", label: "Compliance" },
];

function defaultPerms(): Permissions {
  const result = {} as Permissions;
  PERMISSION_SECTIONS.forEach(s => { result[s.key as SectionKey] = { view: false, edit: false }; });
  return result;
}

interface AccessRecord {
  id: number;
  userId: string;
  userName: string;
  userEmail: string | null;
  profileImageUrl: string | null;
  status: string;
  permissions: Permissions | null;
  requestedAt: string;
  resolvedAt: string | null;
}

function PermissionsGrid({ perms, onChange, readonly = false }: {
  perms: Permissions;
  onChange?: (p: Permissions) => void;
  readonly?: boolean;
}) {
  function toggle(section: SectionKey, field: "view" | "edit") {
    if (readonly || !onChange) return;
    const cur = perms[section];
    let next = { ...cur };
    if (field === "edit") {
      next.edit = !cur.edit;
      if (next.edit) next.view = true;
    } else {
      next.view = !cur.view;
      if (!next.view) next.edit = false;
    }
    onChange({ ...perms, [section]: next });
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden text-sm">
      <div className="grid grid-cols-[1fr_80px_80px] bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
        <span>Section</span>
        <span className="text-center">View</span>
        <span className="text-center">Add/Edit</span>
      </div>
      {PERMISSION_SECTIONS.map((s, i) => (
        <div key={s.key} className={`grid grid-cols-[1fr_80px_80px] px-4 py-2.5 items-center ${i % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
          <span className="font-medium text-foreground text-sm">{s.label}</span>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => toggle(s.key, "view")}
              disabled={readonly}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                perms[s.key]?.view
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/40 bg-background"
              } ${readonly ? "cursor-default" : "cursor-pointer hover:border-primary/70"}`}
            >
              {perms[s.key]?.view && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
            </button>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => toggle(s.key, "edit")}
              disabled={readonly}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                perms[s.key]?.edit
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-muted-foreground/40 bg-background"
              } ${readonly ? "cursor-default" : "cursor-pointer hover:border-emerald-400"}`}
            >
              {perms[s.key]?.edit && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamSection() {
  const [requests, setRequests] = useState<AccessRecord[]>([]);
  const [members, setMembers] = useState<AccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Permissions>(defaultPerms());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, Permissions>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState<Permissions>(defaultPerms());
  const [inviting, setInviting] = useState(false);
  const { refresh: refreshPermissions, userName: ownerName, profileImageUrl: ownerAvatar } = useUserPermissions();
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, memRes] = await Promise.all([
        fetch(`${BASE}/api/team/requests`, { credentials: "include" }),
        fetch(`${BASE}/api/team/members`, { credentials: "include" }),
      ]);
      const reqs = reqRes.ok ? await reqRes.json() : [];
      const mems = memRes.ok ? await memRes.json() : [];
      setRequests(reqs);
      setMembers(mems);
      const ep: Record<string, Permissions> = {};
      mems.forEach((m: AccessRecord) => {
        ep[m.userId] = m.permissions ?? defaultPerms();
      });
      setEditPerms(ep);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(req: AccessRecord) {
    try {
      const res = await fetch(`${BASE}/api/team/requests/${req.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ permissions: pendingPerms }),
      });
      if (res.ok) {
        setApprovingId(null);
        setPendingPerms(defaultPerms());
        load();
        toast({ title: "Access approved", description: `${req.userName || "Team member"} has been approved.` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to approve", description: err?.error ?? "An error occurred.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to approve", description: "Network error. Please try again.", variant: "destructive" });
    }
  }

  async function handleReject(req: AccessRecord) {
    try {
      const res = await fetch(`${BASE}/api/team/requests/${req.id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        load();
        toast({ title: "Access denied", description: `${req.userName || "Request"} has been rejected.` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to reject", description: err?.error ?? "An error occurred.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to reject", description: "Network error. Please try again.", variant: "destructive" });
    }
  }

  async function handleSavePerms(userId: string) {
    setSavingId(userId);
    try {
      const res = await fetch(`${BASE}/api/team/members/${encodeURIComponent(userId)}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ permissions: editPerms[userId] }),
      });
      if (res.ok) {
        refreshPermissions();
        toast({ title: "Permissions saved" });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to save permissions", description: err?.error ?? "An error occurred.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save permissions", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemove(userId: string) {
    const isInvite = userId.startsWith("invite:");
    const label = isInvite ? "Cancel this invite?" : "Remove this team member? Their access will be revoked immediately.";
    if (!confirm(label)) return;
    try {
      const res = await fetch(`${BASE}/api/team/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        load();
        if (!isInvite) refreshPermissions();
        toast({ title: isInvite ? "Invite cancelled" : "Member removed", description: isInvite ? "The invite has been removed." : "Their access has been revoked." });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to remove", description: err?.error ?? "An error occurred.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to remove", description: "Network error. Please try again.", variant: "destructive" });
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }
    const alreadyMember = members.some(m => (m.userEmail ?? "").toLowerCase() === email);
    const alreadyPending = requests.some(r => (r.userEmail ?? "").toLowerCase() === email);
    if (alreadyMember) {
      toast({ title: "Already on team", description: "Someone with this email is already a member or has a pending invite.", variant: "destructive" });
      return;
    }
    if (alreadyPending) {
      toast({ title: "Pending request", description: "This person has already requested access. Approve them from the Access Requests section.", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const res = await fetch(`${BASE}/api/team/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, permissions: invitePerms }),
      });
      if (res.ok) {
        setShowInvite(false);
        setInviteEmail("");
        setInvitePerms(defaultPerms());
        load();
        toast({ title: "Invite sent", description: `${email} will have access when they log in.` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to invite", description: err?.error ?? "An error occurred.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to invite", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  if (loading) {
    return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  const activeMembers = members.filter(m => m.status === "approved");
  const invitedMembers = members.filter(m => m.status === "invited");

  return (
    <div className="space-y-6">
      {/* Owner row */}
      <Card className="border-border/50 shadow-md bg-card">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-display flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Owner
          </CardTitle>
          <CardDescription>The owner has full access to all sections of the app.</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {ownerAvatar ? (
              <img src={ownerAvatar} alt={ownerName ?? "Owner"} className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-primary/20" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                {ownerName ? ownerName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "?"}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">{ownerName ?? "Account Owner"}</p>
              <p className="text-xs text-muted-foreground">Full access to everything</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Owner
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pending requests */}
      <Card className="border-border/50 shadow-md bg-card">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-display flex items-center gap-2">
            <Users2 className="w-5 h-5 text-primary" /> Access Requests
            {requests.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">{requests.length}</span>
            )}
          </CardTitle>
          <CardDescription>People who have logged in and are waiting for you to approve their access.</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pending access requests.</p>
          ) : (
            <div className="space-y-4">
              {requests.map(req => (
                <div key={req.id} className="border border-border rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    {req.profileImageUrl ? (
                      <img src={req.profileImageUrl} className="w-10 h-10 rounded-full object-cover" alt={req.userName} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {req.userName?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">{req.userName || "Unknown user"}</p>
                      {req.userEmail && <p className="text-xs text-muted-foreground">{req.userEmail}</p>}
                    </div>
                    <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-semibold">Pending</span>
                  </div>

                  {approvingId === req.id ? (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-foreground">Set what this person can access:</p>
                      <PermissionsGrid perms={pendingPerms} onChange={setPendingPerms} />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleApprove(req)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve with these permissions
                        </button>
                        <button
                          type="button"
                          onClick={() => { setApprovingId(null); setPendingPerms(defaultPerms()); }}
                          className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setApprovingId(req.id); setPendingPerms(defaultPerms()); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(req)}
                        className="flex items-center gap-1.5 px-4 py-2 border border-destructive/30 text-destructive rounded-lg text-sm font-semibold hover:bg-destructive/5 transition-colors"
                      >
                        <XCircle className="w-4 h-4" /> Deny
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team members (approved + invited) */}
      <Card className="border-border/50 shadow-md bg-card">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="font-display flex items-center gap-2">
                <Users2 className="w-5 h-5 text-primary" /> Team Members
              </CardTitle>
              <CardDescription className="mt-1">Manage member access and permissions. Add someone before they log in by entering their email.</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => { setShowInvite(v => !v); setInviteEmail(""); setInvitePerms(defaultPerms()); }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Add Member
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-6">

          {/* Invite form */}
          {showInvite && (
            <div className="border-2 border-primary/20 bg-primary/5 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Invite a team member by email</p>
              </div>
              <p className="text-xs text-muted-foreground">Enter their email address. When they log in with a matching Replit account, they'll get instant access with the permissions you set below.</p>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                onKeyDown={e => { if (e.key === "Enter") handleInvite(); }}
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">Permissions</p>
                <PermissionsGrid perms={invitePerms} onChange={setInvitePerms} />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={inviting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" /> {inviting ? "Adding…" : "Add Team Member"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteEmail(""); setInvitePerms(defaultPerms()); }}
                  className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Invited members awaiting login */}
          {invitedMembers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invited — Awaiting Login</p>
              {invitedMembers.map(m => (
                <div key={m.userId} className="border border-dashed border-border rounded-xl p-4 space-y-3 bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{m.userEmail ?? m.userName}</p>
                      <p className="text-xs text-muted-foreground">Invite pending — access granted on first login</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(m.userId)}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-destructive/30 text-destructive rounded-lg text-xs font-semibold hover:bg-destructive/5 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                  {editPerms[m.userId] && (
                    <>
                      <PermissionsGrid
                        perms={editPerms[m.userId]}
                        onChange={p => setEditPerms(prev => ({ ...prev, [m.userId]: p }))}
                      />
                      <button
                        type="button"
                        onClick={() => handleSavePerms(m.userId)}
                        disabled={savingId === m.userId}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {savingId === m.userId ? "Saving…" : "Save Permissions"}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Active members */}
          {activeMembers.length === 0 && invitedMembers.length === 0 && !showInvite ? (
            <p className="text-sm text-muted-foreground text-center py-6">No team members yet. Use "Add Member" to invite someone, or approve a request above.</p>
          ) : activeMembers.length > 0 ? (
            <div className="space-y-3">
              {invitedMembers.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Members</p>
              )}
              {activeMembers.map(m => (
                <div key={m.userId} className="border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {m.profileImageUrl ? (
                      <img src={m.profileImageUrl} className="w-10 h-10 rounded-full object-cover" alt={m.userName} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {m.userName?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-foreground">{m.userName || "Unknown user"}</p>
                      {m.userEmail && <p className="text-xs text-muted-foreground">{m.userEmail}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(m.userId)}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-destructive/30 text-destructive rounded-lg text-xs font-semibold hover:bg-destructive/5 transition-colors"
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                  {editPerms[m.userId] && (
                    <>
                      <PermissionsGrid
                        perms={editPerms[m.userId]}
                        onChange={p => setEditPerms(prev => ({ ...prev, [m.userId]: p }))}
                      />
                      <button
                        type="button"
                        onClick={() => handleSavePerms(m.userId)}
                        disabled={savingId === m.userId}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {savingId === m.userId ? "Saving…" : "Save Permissions"}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Mini invoice preview showing logo placement ──────────────────────────────
function InvoiceLogoPreview({
  logoUrl, position, size, companyName,
}: {
  logoUrl: string | null; position: string; size: string; companyName: string;
}) {
  const px = LOGO_SIZES.find(s => s.key === size)?.px ?? 100;
  const imgStyle = { height: px, width: "auto", maxWidth: px * 2.5, objectFit: "contain" as const };
  const [previewImgError, setPreviewImgError] = useState(false);

  const logoEl = logoUrl && !previewImgError
    ? <img src={`${BASE}${logoUrl}`} style={imgStyle} alt="Logo" className="rounded" onError={() => setPreviewImgError(true)} />
    : (
      <div style={{ width: px, height: px }} className="rounded bg-amber-100 flex items-center justify-center">
        <Building2 className="text-amber-500" style={{ width: px * 0.4, height: px * 0.4 }} />
      </div>
    );

  const nameCol = (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-gray-900 truncate">{companyName || "Your Company"}</p>
      <p className="text-[8px] text-gray-400">Lexington, KY 40501</p>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm text-[10px] select-none">
      <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400" />
      <div className="px-4 py-3">
        {position === "top-center" ? (
          <div className="flex flex-col items-center gap-1 mb-2">
            {logoEl}
            {nameCol}
          </div>
        ) : position === "top-right" ? (
          <div className="flex justify-between items-start mb-2">
            {nameCol}
            {logoEl}
          </div>
        ) : (
          <div className="flex items-start gap-2 mb-2">
            {logoEl}
            {nameCol}
          </div>
        )}
        {/* Fake invoice content lines */}
        <div className="space-y-1 mt-1">
          {[60, 80, 50].map((w, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-1.5 bg-gray-100 rounded" style={{ width: `${w}%` }} />
              <div className="h-1.5 bg-gray-100 rounded w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Logo drop zone ───────────────────────────────────────────────────────────
function LogoUpload({
  logoUrl, onUploaded, onRemoved, uploadPath = "/api/settings/logo", deletePath = "/api/settings/logo", responseKey = "logoUrl",
}: {
  logoUrl: string | null; onUploaded: (url: string) => void; onRemoved: () => void;
  uploadPath?: string; deletePath?: string; responseKey?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [logoImgError, setLogoImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return setError("Please upload an image file (PNG, JPG, SVG, etc.)");
    if (file.size > 5 * 1024 * 1024) return setError("File must be under 5 MB");
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`${BASE}${uploadPath}`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      const data = await res.json();
      setLogoImgError(false);
      onUploaded(data[responseKey]);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, []);

  async function handleRemove() {
    setUploading(true);
    try {
      await fetch(`${BASE}${deletePath}`, { method: "DELETE" });
      onRemoved();
    } finally {
      setUploading(false);
    }
  }

  if (logoUrl) {
    return (
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-xl border-2 border-border bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoImgError ? (
            <div className="flex flex-col items-center justify-center gap-1 p-2 text-center">
              <span className="text-xs text-red-500 font-semibold">File lost</span>
              <span className="text-[10px] text-muted-foreground">Please re-upload</span>
            </div>
          ) : (
            <img
              src={`${BASE}${logoUrl}`}
              className="w-full h-full object-contain p-1"
              alt="Company logo"
              onError={() => setLogoImgError(true)}
            />
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{logoImgError ? "Logo unavailable" : "Logo uploaded"}</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, or SVG · Max 5 MB</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/60 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        {uploading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Uploading…
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <ImagePlus className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Drop your logo here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse · PNG, JPG, SVG · Max 5 MB</p>
            </div>
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function LF({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Google Section ───────────────────────────────────────────────────────────
function GoogleSection() {
  const { isConfigured, isConnected, userEmail, signIn, signOut } = useGoogleAuth();
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    setConnecting(true);
    signIn(() => setConnecting(false));
    setTimeout(() => setConnecting(false), 15000);
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Status Card */}
      <Card className="border-border/50 shadow-md bg-card">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-display flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google Account
          </CardTitle>
          <CardDescription>
            Connect your Google account to pick files from Drive and send invoices directly from Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {!isConfigured ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Google credentials not configured</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    To enable this feature, add <code className="bg-amber-100 px-1 rounded font-mono">VITE_GOOGLE_CLIENT_ID</code> and{" "}
                    <code className="bg-amber-100 px-1 rounded font-mono">VITE_GOOGLE_API_KEY</code> to your environment secrets.
                  </p>
                </div>
              </div>
              <div className="text-xs text-amber-700 space-y-1 pl-8">
                <p className="font-semibold">Setup steps:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to <span className="font-medium">console.cloud.google.com</span></li>
                  <li>Create a project and enable <span className="font-medium">Google Drive API</span> and <span className="font-medium">Gmail API</span></li>
                  <li>Create an <span className="font-medium">OAuth 2.0 Client ID</span> (Web application type) and an <span className="font-medium">API Key</span></li>
                  <li>Add your app's origin to the authorized origins list</li>
                  <li>Add both credentials to your environment secrets</li>
                </ol>
              </div>
            </div>
          ) : isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-900">Connected</p>
                  {userEmail && <p className="text-xs text-emerald-700 truncate">{userEmail}</p>}
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-colors flex-shrink-0"
                >
                  <Link2Off className="w-3.5 h-3.5" /> Disconnect
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">What this enables:</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> Pick compliance documents directly from your Google Drive</li>
                  <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> Send invoices from Gmail — delivered from your Google account</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">What this enables:</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><Link2 className="w-3.5 h-3.5 text-primary/60 flex-shrink-0 mt-0.5" /> Pick compliance documents directly from your Google Drive</li>
                  <li className="flex items-start gap-2"><Link2 className="w-3.5 h-3.5 text-primary/60 flex-shrink-0 mt-0.5" /> Send invoices from Gmail — delivered from your Google account</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white"/>
                </svg>
                {connecting ? "Connecting…" : "Connect Google Account"}
              </button>
              <p className="text-xs text-muted-foreground">
                You'll be prompted to sign in to Google and grant access to Drive (read-only) and Gmail (send only). Your files and emails are never stored on our servers.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Wix Integration Section ──────────────────────────────────────────────────
function WixIntegrationSection() {
  const [config, setConfig] = useState<{ webhookUrl: string; token: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`${BASE}/api/integrations/wix/config`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setConfig(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copyText(text: string, which: "url" | "token") {
    navigator.clipboard.writeText(text).then(() => {
      if (which === "url") { setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000); }
      else { setCopiedToken(true); setTimeout(() => setCopiedToken(false), 2000); }
    }).catch(() => toast({ title: "Copy failed", variant: "destructive" }));
  }

  return (
    <div className="space-y-5 pb-8">
      <Card className="border-border/50 shadow-md bg-card">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <CardTitle className="font-display flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            Wix Website Integration
          </CardTitle>
          <CardDescription>
            Connect your Wix website so that quote request form submissions automatically create a new Prospect in BuildPro — no manual re-entry needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {loading ? (
            <div className="h-20 rounded-xl bg-muted animate-pulse" />
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">Integration is ready — paste the URL below into your Wix Automation to start receiving leads.</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Your Webhook URL</p>
                <p className="text-xs text-muted-foreground">Copy this URL and paste it into Wix → Automations → Action: "Send an HTTP request".</p>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <code className="text-xs text-gray-700 font-mono flex-1 truncate">
                    {config?.webhookUrl ?? `${typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/wix`}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyText(config?.webhookUrl ?? `${window.location.origin}/api/integrations/wix`, "url")}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0 transition-colors"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedUrl ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {config?.token && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Secret Token</p>
                  <p className="text-xs text-muted-foreground">Add this as a custom header <code className="bg-muted px-1 rounded font-mono">x-wix-secret</code> in your Wix HTTP request to authenticate it.</p>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <code className="text-xs text-gray-700 font-mono flex-1 truncate">
                      {showToken ? config.token : "•".repeat(24)}
                    </code>
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(config.token!, "token")}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0 transition-colors"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedToken ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                <p className="text-sm font-semibold text-foreground">How to set this up in Wix (4 steps)</p>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</span>
                    <span>In Wix, go to <strong className="text-foreground">Automations</strong> → <strong className="text-foreground">+ New Automation</strong> and choose your quote/contact form as the trigger.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">2</span>
                    <span>Add an action: <strong className="text-foreground">Send an HTTP request</strong> → Method: <code className="bg-muted px-1 rounded font-mono text-xs">POST</code> → paste your Webhook URL above.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">3</span>
                    <span>Add a custom header — Key: <code className="bg-muted px-1 rounded font-mono text-xs">x-wix-secret</code> · Value: your Secret Token above.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">4</span>
                    <span>Map your form fields in the request body (name, phone, email, address, message). A new <strong className="text-foreground">Prospect</strong> will appear in BuildPro instantly when someone submits your form.</span>
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">What gets created</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> A new Prospect with the contact's name, phone, email, and address</li>
                  <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> Status set to "Cold" — ready for you to follow up and qualify</li>
                  <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> A "From Website" badge so you know which leads came from Wix</li>
                  <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" /> Any service description or message stored in the Notes field</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Square App ID Card ───────────────────────────────────────────────────────
function SquareAppIdCard() {
  const [copied, setCopied] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "launched" | "error">("idle");
  const { toast } = useToast();

  function handleCopy() {
    navigator.clipboard.writeText("EXPO_PUBLIC_SQUARE_APP_ID").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Copy failed", description: "Please select and copy the variable name manually.", variant: "destructive" });
    });
  }

  function handleTestLink() {
    setTestState("testing");
    const testAmountCents = 100;
    const posData = JSON.stringify({
      amount_money: { amount: testAmountCents, currency_code: "USD" },
      callback_url: "buildpro://square-callback",
      client_id: "YOUR_APP_ID_HERE",
      version: "1.3",
      notes: "Deep link smoke test from BuildPro settings",
    });
    try {
      const encoded = btoa(unescape(encodeURIComponent(posData)));
      const squareUrl = `square-commerce-v1://payment/create?data=${encoded}`;
      window.location.href = squareUrl;
      setTimeout(() => {
        setTestState("launched");
        toast({
          title: "Deep link sent",
          description: "If Square POS opened on your device, the deep link mechanism works. This test uses a placeholder App ID — set EXPO_PUBLIC_SQUARE_APP_ID to your real ID in the build environment.",
        });
        setTimeout(() => setTestState("idle"), 6000);
      }, 1200);
    } catch {
      setTestState("error");
      toast({ title: "Could not open deep link", description: "Open this page on your mobile device with Square POS installed to test.", variant: "destructive" });
      setTimeout(() => setTestState("idle"), 3000);
    }
  }

  return (
    <Card className="border-border/50 shadow-md bg-card">
      <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          Square App ID — Mobile In-Person Payments
        </CardTitle>
        <CardDescription>
          Required for the BuildPro mobile app to deep-link into Square POS and collect card payments in person.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        {/* Status banner */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-800">Build environment variable required</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              The <code className="bg-amber-100 px-1 rounded font-mono">EXPO_PUBLIC_SQUARE_APP_ID</code> environment variable must be set before building the mobile app. Without it, the "Charge" button will show a setup error.
            </p>
          </div>
        </div>

        {/* Step 1 — Find your App ID */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            Find your Square App ID
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed pl-7">
            Log in to your Square Developer Dashboard, open your application (or create one), and copy the <strong>Application ID</strong> from the Credentials tab. It starts with <code className="bg-muted px-1 rounded font-mono">sq0idp-</code>.
          </p>
          <div className="pl-7">
            <a
              href="https://developer.squareup.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Open Square Developer Dashboard
            </a>
          </div>
        </div>

        {/* Step 2 — Set in EAS */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            Add it to your EAS / Expo build environment
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed pl-7">
            Because this is a build-time variable (prefixed with <code className="bg-muted px-1 rounded font-mono">EXPO_PUBLIC_</code>), it must be set in your EAS project secrets or <code className="bg-muted px-1 rounded font-mono">.env</code> file before running a build. It cannot be changed at runtime.
          </p>
          <div className="pl-7 space-y-2">
            <p className="text-xs text-muted-foreground font-semibold">Environment variable name:</p>
            <div className="flex items-center gap-2 bg-muted/60 border border-border rounded-lg px-3 py-2">
              <code className="text-xs text-foreground font-mono flex-1">EXPO_PUBLIC_SQUARE_APP_ID</code>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-primary hover:text-primary/80 font-medium flex-shrink-0 flex items-center gap-1"
              >
                {copied ? <><Check className="w-3 h-3" /> Copied</> : "Copy"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              In EAS: go to <strong>expo.dev → your project → Secrets</strong> and add <code className="bg-muted px-1 rounded font-mono">EXPO_PUBLIC_SQUARE_APP_ID</code> with your Application ID as the value. Then trigger a new EAS build.
            </p>
          </div>
        </div>

        {/* Step 3 — Test the link */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold">3</span>
            Smoke-test the Square POS deep link (optional)
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed pl-7">
            Open this page on your iPhone with Square POS installed, then tap the button below. It sends a $1.00 deep link using a placeholder App ID to verify the URL scheme works on your device — cancel immediately, no real payment is processed. This only confirms the deep link mechanism works; it does not validate your actual App ID.
          </p>
          <div className="pl-7">
            <button
              type="button"
              onClick={handleTestLink}
              disabled={testState === "testing"}
              className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              {testState === "testing" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
              ) : testState === "launched" ? (
                <><Check className="w-4 h-4 text-emerald-600" /> Deep link sent</>
              ) : (
                <><Send className="w-4 h-4 text-primary" /> Test Square POS Deep Link</>
              )}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Settings ────────────────────────────────────────────────────────────


function BusinessProfileCard() {
  const { activeBusiness, businesses, refresh } = useBusiness();
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", zip: "", licenseNumber: "", taxId: "" });
  const [parentBusinessId, setParentBusinessId] = useState<number | null>(null);
  const [seededId, setSeededId] = useState<number | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const inp = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  useEffect(() => {
    if (activeBusiness && activeBusiness.id !== seededId) {
      setForm({
        name: activeBusiness.name ?? "",
        phone: activeBusiness.phone ?? "",
        email: activeBusiness.email ?? "",
        address: activeBusiness.address ?? "",
        city: activeBusiness.city ?? "",
        state: activeBusiness.state ?? "",
        zip: activeBusiness.zip ?? "",
        licenseNumber: activeBusiness.licenseNumber ?? "",
        taxId: activeBusiness.taxId ?? "",
      });
      setParentBusinessId(activeBusiness.parentBusinessId ?? null);
      setLogoUrl(activeBusiness.logoUrl ?? null);
      setSeededId(activeBusiness.id);
      setSaved(false);
    }
  }, [activeBusiness, seededId]);

  if (!activeBusiness) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${activeBusiness!.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, parentBusinessId: parentBusinessId ?? null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const setF = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  return (
    <Card className="border-blue-200 shadow-md bg-blue-50/30">
      <CardHeader className="border-b border-blue-200/60 bg-blue-50/50 pb-4">
        <CardTitle className="font-display flex items-center gap-2 text-blue-800">
          <Building2 className="w-5 h-5" /> Active Business — {activeBusiness.name}
        </CardTitle>
        <CardDescription className="text-blue-700/70">Contact info, address, and logo for this business line — these override the LLC defaults on invoices and estimates.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-5">
        {/* Logo upload */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-2">Business Logo</label>
          <LogoUpload
            logoUrl={logoUrl}
            uploadPath={`/api/businesses/${activeBusiness.id}/logo`}
            deletePath={`/api/businesses/${activeBusiness.id}/logo`}
            onUploaded={url => { setLogoUrl(url); refresh(); }}
            onRemoved={() => { setLogoUrl(null); refresh(); }}
          />
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Business Name</label>
              <input className={inp} value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Willard's Asphalt Sealing" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone</label>
              <input className={inp} value={form.phone} onChange={e => setF("phone", e.target.value)} placeholder="(270) 555-0123" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
              <input className={inp} type="email" value={form.email} onChange={e => setF("email", e.target.value)} placeholder="contact@business.com" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Address</label>
              <input className={inp} value={form.address} onChange={e => setF("address", e.target.value)} placeholder="123 Main St" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">City</label>
              <input className={inp} value={form.city} onChange={e => setF("city", e.target.value)} placeholder="Bowling Green" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">State</label>
              <input className={inp} value={form.state} onChange={e => setF("state", e.target.value)} placeholder="KY" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">ZIP</label>
              <input className={inp} value={form.zip} onChange={e => setF("zip", e.target.value)} placeholder="42101" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">License Number</label>
              <input className={inp} value={form.licenseNumber} onChange={e => setF("licenseNumber", e.target.value)} placeholder="KY-2024-XXXXX" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Tax ID / EIN</label>
              <input className={inp} value={form.taxId} onChange={e => setF("taxId", e.target.value)} placeholder="XX-XXXXXXX" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Parent Business <span className="font-normal text-muted-foreground/70">(optional — for DBAs / subsidiaries)</span></label>
              <select
                className={inp}
                value={parentBusinessId ?? ""}
                onChange={e => { setParentBusinessId(e.target.value ? parseInt(e.target.value) : null); setSaved(false); }}
              >
                <option value="">— Standalone (no parent) —</option>
                {businesses.filter(b => b.id !== activeBusiness.id).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {parentBusinessId && (
                <p className="mt-1 text-xs text-blue-600">
                  DBA under {businesses.find(b => b.id === parentBusinessId)?.name ?? "another business"}
                </p>
              )}
            </div>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60">
              {saving ? "Saving…" : "Save Business Profile"}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved</span>}
          </div>
        </div>
        <DeleteBusinessSection activeBusiness={activeBusiness} businesses={businesses} BASE={BASE} refresh={refresh} />
      </CardContent>
    </Card>
  );
}

function DeleteBusinessSection({ activeBusiness, businesses, BASE, refresh }: {
  activeBusiness: NonNullable<ReturnType<typeof useBusiness>["activeBusiness"]>;
  businesses: ReturnType<typeof useBusiness>["businesses"];
  BASE: string;
  refresh: () => void;
}) {
  const { clearSelection } = useBusiness();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const hasChildren = businesses.some(b => b.parentBusinessId === activeBusiness.id);

  async function handleDelete() {
    if (confirmName !== activeBusiness.name) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${activeBusiness.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      clearSelection();
      await refresh();
    } finally {
      setDeleting(false);
      setOpen(false);
      setConfirmName("");
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-red-200/60">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={hasChildren}
          title={hasChildren ? "Remove all DBAs under this business first" : undefined}
          className="px-4 py-2 rounded-xl border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Delete This Business…
        </button>
      ) : (
        <div className="rounded-xl border border-red-300 bg-red-50/50 p-4 space-y-3">
          <p className="text-sm font-semibold text-red-700">Delete "{activeBusiness.name}"?</p>
          <p className="text-xs text-red-600">This is permanent. Type the business name to confirm.</p>
          <input
            className="flex h-9 w-full rounded-md border border-red-300 bg-white px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
            placeholder={activeBusiness.name}
            value={confirmName}
            onChange={e => setConfirmName(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || confirmName !== activeBusiness.name}
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Permanently Delete"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirmName(""); }}
              className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



export default function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const { isOwner } = useUserPermissions();
  const { data: squareStatus } = useSquareStatus();
  const { activeBusiness } = useBusiness();

  const [activeTab, setActiveTab] = useState("profile");
  const [form, setForm] = useState({
    companyName: "", entityType: "", ein: "",
    companyEmail: "", companyPhone: "",
    companyAddress: "", companyCity: "", companyState: "KY", companyZip: "",
    defaultTaxRate: "", invoicePrefix: "INV-2026-",
    defaultPaymentTerms: "Net 30", lateFeePercent: "",
    mileageRate: "0.725", thresholdAmount1099: "2000",
    invoiceLogoPosition: "top-left", invoiceLogoSize: "medium",
    // SMTP email delivery
    smtpHost: "", smtpPort: "587", smtpUser: "", smtpSecure: "0",
    // mileage tracking
    mileageDefaultClassification: "business",
    mileageUnits: "miles",
    mileageReminderFrequency: "daily",
    // compliance notifications
    complianceNotificationEmail: "",
    complianceEmailEnabled: "1",
    // invoice payment reminders
    invoiceReminderEnabled: "1",
    invoiceReminderDay1: "7",
    invoiceReminderDay2: "14",
    // tax filing preference
    taxFilingFrequency: "quarterly",
  });
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [homeLibraryOpen, setHomeLibraryOpen] = useState(false);
  const [bottomNavHrefs, setBottomNavHrefs] = useState<string[]>(DEFAULT_BOTTOM_NAV_HREFS);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [testEmailState, setTestEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  useEffect(() => {
    if (settings && !seeded) {
      const s = settings as AppSettings & Record<string, unknown>;
      setForm({
        companyName: s.companyName ?? "",
        entityType: (s.entityType as string | undefined) ?? "",
        ein: (s.ein as string | undefined) ?? "",
        companyEmail: s.companyEmail ?? "",
        companyPhone: s.companyPhone ?? "",
        companyAddress: (s.companyAddress as string | undefined) ?? "",
        companyCity: s.companyCity ?? "",
        companyState: s.companyState ?? "KY",
        companyZip: s.companyZip ?? "",
        defaultTaxRate: s.defaultTaxRate != null ? String(s.defaultTaxRate) : "",
        invoicePrefix: s.invoicePrefix ?? "INV-2026-",
        defaultPaymentTerms: s.defaultPaymentTerms ?? "Net 30",
        lateFeePercent: s.lateFeePercent != null ? String(s.lateFeePercent) : "",
        mileageRate: s.mileageRate != null ? String(s.mileageRate) : "0.725",
        thresholdAmount1099: s.thresholdAmount1099 != null ? String(s.thresholdAmount1099) : "2000",
        invoiceLogoPosition: s.invoiceLogoPosition ?? "top-left",
        invoiceLogoSize: s.invoiceLogoSize ?? "medium",
        smtpHost: s.smtpHost ?? "",
        smtpPort: s.smtpPort ?? "587",
        smtpUser: s.smtpUser ?? "",
        smtpSecure: s.smtpSecure ? "1" : "0",
        mileageDefaultClassification: s.mileageDefaultClassification ?? "business",
        mileageUnits: s.mileageUnits ?? "miles",
        mileageReminderFrequency: s.mileageReminderFrequency ?? "daily",
        complianceNotificationEmail: s.complianceNotificationEmail ?? "",
        complianceEmailEnabled: s.complianceEmailEnabled === false ? "0" : "1",
        invoiceReminderEnabled: s.invoiceReminderEnabled === false ? "0" : "1",
        invoiceReminderDay1: String(s.invoiceReminderDay1 ?? 7),
        invoiceReminderDay2: String(s.invoiceReminderDay2 ?? 14),
        taxFilingFrequency: (s.taxFilingFrequency as string | undefined) ?? "quarterly",
      });
      setLogoUrl(s.logoUrl ?? null);
      setSignatureUrl((s as any).signatureImage ?? null);
      const feat: Record<string, boolean> = {};
      FEATURE_OPTIONS.forEach(f => {
        feat[f.key] = Array.isArray(s.enabledFeatures) ? s.enabledFeatures.includes(f.key) : true;
      });
      setFeatures(feat);
      setBottomNavHrefs(Array.isArray(s.bottomNavItems) ? s.bottomNavItems : DEFAULT_BOTTOM_NAV_HREFS);
      setSeeded(true);
    }
  }, [settings, seeded]);

  // Initialize browser notification permission state
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setNotifPermission(Notification.permission);
  }, []);

  const setF = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    try {
      await updateMutation.mutateAsync({
        data: {
          companyName: form.companyName || undefined,
          entityType: form.entityType || null,
          ein: form.ein || null,
          companyEmail: form.companyEmail || undefined,
          companyPhone: form.companyPhone || undefined,
          companyAddress: form.companyAddress || undefined,
          companyCity: form.companyCity || undefined,
          companyState: form.companyState || undefined,
          companyZip: form.companyZip || undefined,
          defaultTaxRate: form.defaultTaxRate ? parseFloat(form.defaultTaxRate) : undefined,
          invoicePrefix: form.invoicePrefix || undefined,
          defaultPaymentTerms: form.defaultPaymentTerms || undefined,
          lateFeePercent: form.lateFeePercent ? parseFloat(form.lateFeePercent) : undefined,
          mileageRate: form.mileageRate ? parseFloat(form.mileageRate) : 0.725,
          thresholdAmount1099: form.thresholdAmount1099 ? parseFloat(form.thresholdAmount1099) : 2000,
          invoiceLogoPosition: form.invoiceLogoPosition,
          invoiceLogoSize: form.invoiceLogoSize,
          mileageDefaultClassification: form.mileageDefaultClassification,
          mileageUnits: form.mileageUnits,
          mileageReminderFrequency: form.mileageReminderFrequency,
          enabledFeatures: FEATURE_OPTIONS.filter(f => features[f.key]).map(f => f.key),
          bottomNavItems: bottomNavHrefs,
          complianceNotificationEmail: form.complianceNotificationEmail || null,
          complianceEmailEnabled: form.complianceEmailEnabled === "1",
          invoiceReminderEnabled: form.invoiceReminderEnabled === "1",
          invoiceReminderDay1: parseInt(form.invoiceReminderDay1) || 7,
          invoiceReminderDay2: parseInt(form.invoiceReminderDay2) || 14,
          taxFilingFrequency: form.taxFilingFrequency || "quarterly",

        } as Partial<AppSettings>,
      });
      queryClient.invalidateQueries();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Failed to save settings. Please try again.");
    }
  }

  async function handleTestEmail() {
    setTestEmailState("sending");
    try {
      const res = await fetch(`${BASE}/api/settings/test-compliance-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.complianceNotificationEmail || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Test email failed", description: data.error ?? "Unknown error", variant: "destructive" });
        setTestEmailState("error");
      } else {
        toast({ title: "Test email sent!", description: `Check the inbox at ${data.sentTo}.` });
        setTestEmailState("sent");
      }
    } catch {
      toast({ title: "Test email failed", description: "Could not reach the server.", variant: "destructive" });
      setTestEmailState("error");
    } finally {
      setTimeout(() => setTestEmailState("idle"), 4000);
    }
  }

  const inp = "w-full px-3 py-2.5 rounded-xl border border-border bg-background focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none text-sm transition-colors";

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-12">
        {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your business profile, logo, invoice defaults, and app configuration.</p>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto scrollbar-hide gap-1 mb-6 bg-muted/40 rounded-2xl p-1.5 border border-border">
        {TABS.filter(t => t.key !== "team" || isOwner).map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                active
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Team (outside form, owner-only) ── */}
      {activeTab === "team" && isOwner && (
        <div className="space-y-5 pb-8">
          <TeamSection />
        </div>
      )}

      {/* ── Google (outside form) ── */}
      {activeTab === "google" && <GoogleSection />}

      {/* ── Wix Integration (outside form) ── */}
      {activeTab === "integrations" && <WixIntegrationSection />}

      {/* ── Square Payments (outside form) ── */}
      {activeTab === "payments" && (
        <div className="space-y-5 pb-8">
          <Card className="border-border/50 shadow-md bg-card">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Square Payments
              </CardTitle>
              <CardDescription>Accept card payments on invoices, deposits, and quick charges via Square</CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {squareStatus?.connected ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      Square is connected{squareStatus.businessName ? ` — ${squareStatus.businessName}` : ""}
                    </p>
                    <p className="text-xs text-emerald-700">
                      {squareStatus.country ? `${squareStatus.country}` : "Ready to accept payments"}
                      {squareStatus.currency ? ` · ${squareStatus.currency}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Square not connected</p>
                    <p className="text-xs text-amber-700">{squareStatus?.message ?? "Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to your environment to enable payments"}</p>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">What's enabled</p>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Invoice payment links — get paid online per invoice</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Quick Charge — instant payment links with QR codes</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Prospect deposit links — collect 50% deposits automatically</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Mobile in-person payments via Square POS deep link</li>
                  </ul>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-semibold text-foreground mb-1">Webhook (for auto-payment confirmation)</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Add this endpoint in your Square Developer Dashboard → Webhooks to automatically mark invoices and charges as paid when a payment completes.
                  </p>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <code className="text-xs text-gray-700 font-mono flex-1 truncate">
                      {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/square` : "/api/webhooks/square"}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/square`)}
                      className="text-xs text-amber-600 hover:text-amber-700 font-medium flex-shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Events to subscribe to: <code className="text-xs">payment.completed</code>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Square App ID — In-Person Payments */}
          <SquareAppIdCard />
        </div>
      )}

      <form onSubmit={handleSave} className={`space-y-5 ${(activeTab === "team" || activeTab === "google" || activeTab === "payments" || activeTab === "integrations") ? "hidden" : ""}`}>

        {/* ── Profile ── */}
        {activeTab === "profile" && (
          <>
            {/* When a specific business is active, show its card first */}
            {activeBusiness && <BusinessProfileCard />}

            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Company Identity
                </CardTitle>
                <CardDescription>
                  {activeBusiness
                    ? "LLC-level legal information — used on all tax forms, 1099s, and year-end reports."
                    : "Your legal company info — appears on all invoices, estimates, and reports."}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <LF label={activeBusiness ? "Legal Company Name (LLC)" : "Company / Business Name"}>
                      <input className={inp} value={form.companyName} onChange={e => setF("companyName", e.target.value)} placeholder="Smith Construction LLC" />
                    </LF>
                  </div>
                  <LF label="Legal Entity Type">
                    <select className={inp} value={form.entityType} onChange={e => setF("entityType", e.target.value)}>
                      <option value="">Select type…</option>
                      {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </LF>
                  <LF label="EIN (Employer ID Number)" hint="Format: XX-XXXXXXX">
                    <input className={inp} value={form.ein} onChange={e => setF("ein", e.target.value)} placeholder="12-3456789" />
                  </LF>
                </div>

                {activeBusiness ? (
                  <div className="border-t border-border/50 pt-4">
                    <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                      <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" /></svg>
                      <p className="text-xs text-blue-700 leading-relaxed">
                        <span className="font-semibold">Email, phone, and address</span> are managed in the <span className="font-semibold">Active Business card above</span> — edit them there and click <span className="font-semibold">Save Business Profile</span>.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="border-t border-border/50 pt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact Information</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <LF label="Business Email">
                          <input className={inp} type="email" value={form.companyEmail} onChange={e => setF("companyEmail", e.target.value)} placeholder="contact@smithconstruction.com" />
                        </LF>
                        <LF label="Business Phone">
                          <input className={inp} value={form.companyPhone} onChange={e => setF("companyPhone", e.target.value)} placeholder="(270) 555-0123" />
                        </LF>
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Business Address</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <LF label="Street Address">
                            <input className={inp} value={form.companyAddress} onChange={e => setF("companyAddress", e.target.value)} placeholder="123 Main Street" />
                          </LF>
                        </div>
                        <LF label="City">
                          <input className={inp} value={form.companyCity} onChange={e => setF("companyCity", e.target.value)} placeholder="Owensboro" />
                        </LF>
                        <div className="grid grid-cols-2 gap-3">
                          <LF label="State">
                            <input className={inp} value={form.companyState} onChange={e => setF("companyState", e.target.value.toUpperCase())} placeholder="KY" maxLength={2} />
                          </LF>
                          <LF label="ZIP Code">
                            <input className={inp} value={form.companyZip} onChange={e => setF("companyZip", e.target.value)} placeholder="42301" />
                          </LF>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Registered Agent */}
            <Card className="border-border/50 shadow-md bg-card">
              <CardContent className="p-6">
                <RegisteredAgentSection className="space-y-4" />
              </CardContent>
            </Card>

            {/* Branding — Logo & Invoice Placement */}
            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <ImagePlus className="w-5 h-5 text-primary" /> Company Logo
                </CardTitle>
                <CardDescription>Your logo appears on invoices, estimates, and reports. PNG or SVG recommended for crisp quality.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <LogoUpload
                  logoUrl={logoUrl}
                  onUploaded={url => { setLogoUrl(url); queryClient.invalidateQueries(); }}
                  onRemoved={() => { setLogoUrl(null); queryClient.invalidateQueries(); }}
                />
              </CardContent>
            </Card>

            {/* Company Signature */}
            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <ImagePlus className="w-5 h-5 text-primary" /> Company Signature
                </CardTitle>
                <CardDescription>Upload your signature once — it auto-embeds at the bottom of every exported checklist PDF.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <SignaturePad
                  savedUrl={signatureUrl}
                  onSaved={url => setSignatureUrl(url)}
                  onRemoved={() => setSignatureUrl(null)}
                />
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" /> Invoice Logo Placement
                </CardTitle>
                <CardDescription>Choose where and how big your logo appears on invoices. Preview updates in real time.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Position picker */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Logo Position</p>
                  <div className="grid grid-cols-3 gap-3">
                    {LOGO_POSITIONS.map(pos => {
                      const Icon = pos.icon;
                      const active = form.invoiceLogoPosition === pos.key;
                      return (
                        <button
                          key={pos.key}
                          type="button"
                          onClick={() => setF("invoiceLogoPosition", pos.key)}
                          className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                            active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-xs font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>{pos.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Size picker */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Logo Size</p>
                  <div className="grid grid-cols-3 gap-3">
                    {LOGO_SIZES.map(sz => {
                      const active = form.invoiceLogoSize === sz.key;
                      return (
                        <button
                          key={sz.key}
                          type="button"
                          onClick={() => setF("invoiceLogoSize", sz.key)}
                          className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                            active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                          }`}
                        >
                          <div className={`rounded bg-primary/20 flex items-center justify-center ${active ? "bg-primary/20" : "bg-muted"}`} style={{ width: sz.px * 0.4, height: sz.px * 0.4 }}>
                            <ImagePlus className={`${active ? "text-primary" : "text-muted-foreground"}`} style={{ width: sz.px * 0.2, height: sz.px * 0.2 }} />
                          </div>
                          <span className={`text-xs font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>{sz.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live preview */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Preview</p>
                  <InvoiceLogoPreview
                    logoUrl={logoUrl}
                    position={form.invoiceLogoPosition}
                    size={form.invoiceLogoSize}
                    companyName={form.companyName}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Invoice ── */}
        {activeTab === "invoice" && (<>
          <Card className="border-border/50 shadow-md bg-card">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Invoice Defaults
              </CardTitle>
              <CardDescription>These settings pre-fill on every new invoice. You can override them per invoice.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <LF label="Default Payment Terms">
                  <select className={inp} value={form.defaultPaymentTerms} onChange={e => setF("defaultPaymentTerms", e.target.value)}>
                    {PAYMENT_TERMS_OPTIONS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </LF>
                <LF label="Late Fee (%)" hint="Charged if payment is past due">
                  <div className="relative">
                    <input className={inp + " pr-8"} type="number" step="0.1" min="0" max="30" value={form.lateFeePercent} onChange={e => setF("lateFeePercent", e.target.value)} placeholder="e.g. 1.5" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                </LF>
                <LF label="Invoice Number Prefix" hint="e.g. INV-2026- → INV-2026-1001">
                  <input className={inp} value={form.invoicePrefix} onChange={e => setF("invoicePrefix", e.target.value)} placeholder="INV-2026-" />
                </LF>
                <LF label="Default Tax Rate (%)" hint="KY sales tax or per-city occupational">
                  <div className="relative">
                    <input className={inp + " pr-8"} type="number" step="0.01" min="0" max="25" value={form.defaultTaxRate} onChange={e => setF("defaultTaxRate", e.target.value)} placeholder="e.g. 6" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                </LF>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-800">
                  <strong>KY Occupational Tax:</strong> Cities like Louisville and Lexington charge an occupational tax (1–2.2%) on income earned within city limits. Set the default here and override per invoice under the city field. Use the Accounting page's "Income by City" report for city-level tax filing.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Reminder Automation */}
          <Card className="border-border/50 shadow-md bg-card mt-5">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-display flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" /> Payment Reminder Automation
              </CardTitle>
              <CardDescription>Automatically email clients when their invoice is still unpaid after a set number of days. Uses your connected Gmail account to send emails.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Enable toggle */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-5 py-4 bg-muted/20">
                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Auto-Reminder Emails</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Send reminder emails automatically when an unpaid invoice reaches the day thresholds below.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setF("invoiceReminderEnabled", form.invoiceReminderEnabled === "1" ? "0" : "1")}
                  className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    form.invoiceReminderEnabled === "1" ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                  role="switch"
                  aria-checked={form.invoiceReminderEnabled === "1"}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      form.invoiceReminderEnabled === "1" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {form.invoiceReminderEnabled === "1" && (
                <div className="grid grid-cols-2 gap-4">
                  <LF label="First Reminder (days)" hint="Days after invoice creation to send first reminder">
                    <input
                      className={inp}
                      type="number"
                      min="1"
                      max="90"
                      value={form.invoiceReminderDay1}
                      onChange={e => setF("invoiceReminderDay1", e.target.value)}
                      placeholder="7"
                    />
                  </LF>
                  <LF label="Second Reminder (days)" hint="Days after invoice creation to send second reminder">
                    <input
                      className={inp}
                      type="number"
                      min="1"
                      max="180"
                      value={form.invoiceReminderDay2}
                      onChange={e => setF("invoiceReminderDay2", e.target.value)}
                      placeholder="14"
                    />
                  </LF>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Bell className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Reminders are only sent to invoices with a Square payment link and a client email address. Emails are sent via your connected Gmail account (or SMTP if configured in Payments).
                </p>
              </div>
            </CardContent>
          </Card>
        </>)}

        {/* ── Financial ── */}
        {activeTab === "financial" && (
          <Card className="border-border/50 shadow-md bg-card">
            <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
              <CardTitle className="font-display flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> Financial Defaults
              </CardTitle>
              <CardDescription>IRS rates and reporting thresholds used across the app.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <LF label="IRS Mileage Rate ($/mile)" hint="">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input className={inp + " pl-7"} type="number" step="0.001" min="0" value={form.mileageRate} onChange={e => setF("mileageRate", e.target.value)} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>IRS 2025: $0.700/mi</span>
                    <span>IRS 2026: $0.725/mi</span>
                    <span>Your rate: ${Number(form.mileageRate || 0).toFixed(3)}/mi</span>
                    {parseFloat(form.mileageRate) === 0.725 && <span className="text-emerald-600 font-medium">✓ matches 2026</span>}
                    {parseFloat(form.mileageRate) === 0.700 && <span className="text-blue-600 font-medium">✓ matches 2025</span>}
                  </div>
                </LF>
                <LF label="1099-NEC Threshold ($)" hint="2026 OBBBA rule: $2,000 for qualifying (cash/check/ACH) payments">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input className={inp + " pl-7"} type="number" value={form.thresholdAmount1099} onChange={e => setF("thresholdAmount1099", e.target.value)} />
                  </div>
                </LF>
              </div>

              {/* Tax Filing Frequency */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tax Filing Frequency</label>
                <p className="text-xs text-muted-foreground">
                  Choose how you file your income taxes. Selecting "Annual only" hides quarterly estimated tax deadlines and the quarterly payment tracker throughout the app — your data is preserved and can be restored by switching back.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: "quarterly", label: "Quarterly (default)", desc: "File estimated taxes each quarter" },
                    { key: "annual", label: "Annual only", desc: "Pay taxes once a year at filing" },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setF("taxFilingFrequency", opt.key)}
                      className={`py-3 px-4 rounded-xl border-2 text-left transition-all ${
                        (form as any).taxFilingFrequency === opt.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[11px] mt-0.5 opacity-70">{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {(form as any).taxFilingFrequency === "annual" && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-blue-800">
                      Quarterly estimated tax cards and the payment tracker are hidden while this is set to "Annual only." All existing payment records are safely stored and will reappear if you switch back.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-800">
                  <strong>Tip:</strong> The IRS mileage rate applies to all new mileage logs. Update it here when the IRS announces a new rate each January — existing log entries keep the rate they were saved with.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Mileage ── */}
        {activeTab === "mileage" && (
          <div className="space-y-5">
            {/* Trip Defaults */}
            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-primary" /> Trip Defaults
                </CardTitle>
                <CardDescription>Pre-fill settings when a new trip is recorded.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Default Trip Classification</label>
                  <p className="text-xs text-muted-foreground">This will be pre-selected when classifying a completed trip.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["business", "personal"] as const).map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setF("mileageDefaultClassification", c)}
                        className={`py-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${
                          form.mileageDefaultClassification === c
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {c === "business" ? "Business (default)" : "Personal"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Distance Units</label>
                  <p className="text-xs text-muted-foreground">The Mileage page will display distances in your chosen unit. IRS deductions always use miles.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(["miles", "km"] as const).map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setF("mileageUnits", u)}
                        className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                          form.mileageUnits === u
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {u === "miles" ? "Miles (mi)" : "Kilometers (km)"}
                      </button>
                    ))}
                  </div>
                  {form.mileageUnits === "km" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                      IRS deductions are always calculated in miles. Km display is for your reference only.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Reminders */}
            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" /> Trip Reminders
                </CardTitle>
                <CardDescription>Get notified about trips that haven't been reviewed.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Reminder Frequency</label>
                  <p className="text-xs text-muted-foreground">Shows a banner on the Mileage page when there are recent trips without a purpose or notes entered.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(["daily", "weekly", "never"] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setF("mileageReminderFrequency", f)}
                        className={`py-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all ${
                          form.mileageReminderFrequency === f
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Push Notification Permission */}
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-5 py-4 bg-muted/20">
                  <div className="flex items-start gap-3">
                    <Bell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Trip Reminder Notifications</p>
                      {notifPermission === "unsupported" ? (
                        <p className="text-xs text-muted-foreground mt-0.5">Browser notifications are not available in your current browser. Try Chrome, Edge, or Safari on iOS 16.4+ to enable this feature.</p>
                      ) : notifPermission === "granted" ? (
                        <p className="text-xs text-muted-foreground mt-0.5">Notifications are enabled. The app can alert you about trips with missing details even when you're on another tab.</p>
                      ) : notifPermission === "denied" ? (
                        <p className="text-xs text-muted-foreground mt-0.5">Notifications are blocked. To enable them, open your browser settings and allow notifications for this site.</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">Allow notifications so the app can remind you about incomplete trips even when you've navigated away.</p>
                      )}
                    </div>
                  </div>
                  {notifPermission !== "unsupported" && (
                  <div className="flex-shrink-0">
                    {notifPermission === "granted" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg">
                        <Check className="w-3.5 h-3.5" /> Enabled
                      </span>
                    ) : notifPermission === "denied" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                        Blocked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          if (typeof Notification === "undefined") return;
                          const perm = await Notification.requestPermission();
                          setNotifPermission(perm);
                        }}
                        className="text-sm font-semibold text-primary border border-primary/40 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        Enable Notifications
                      </button>
                    )}
                  </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Modules ── */}
        {activeTab === "modules" && (
          <div className="space-y-5">
            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" /> Feature Modules
                </CardTitle>
                <CardDescription>Global defaults — applied to any business that hasn't been configured independently. Dashboard and Settings always show. You can override these per-business from the Business Selector.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {FEATURE_OPTIONS.map(feature => (
                  <button
                    key={feature.key}
                    type="button"
                    onClick={() => setFeatures(p => ({ ...p, [feature.key]: !p[feature.key] }))}
                    className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all text-left ${
                      features[feature.key] ? "border-primary bg-primary/5" : "border-border bg-background hover:border-muted-foreground/40"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      features[feature.key] ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}>
                      {features[feature.key] && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${features[feature.key] ? "text-foreground" : "text-muted-foreground"}`}>{feature.label}</p>
                      <p className="text-xs text-muted-foreground">{feature.desc}</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${features[feature.key] ? "text-primary" : "text-muted-foreground/40"}`} />
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-amber-500" /> Manufactured Home Library
                </CardTitle>
                <CardDescription>Browse and manage builder models, construction types, pricing templates, and add-ons.</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <button
                  onClick={() => setHomeLibraryOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-sm font-semibold text-amber-700">
                  <BookOpen className="w-4 h-4" /> Open Home Library
                </button>
              </CardContent>
            </Card>

            {homeLibraryOpen && <HomeLibraryModal onClose={() => setHomeLibraryOpen(false)} />}

            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" /> Bottom Navigation
                </CardTitle>
                <CardDescription>
                  Choose up to 4 shortcuts for the mobile bottom bar. Home is always the first slot.
                  {bottomNavHrefs.length >= 4 && (
                    <span className="ml-1 text-amber-600 font-medium">Max 4 selected — deselect one to add another.</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-4 p-3 rounded-xl border-2 border-muted bg-muted/20 opacity-60 cursor-not-allowed">
                  <div className="w-5 h-5 rounded-md border-2 border-primary bg-primary flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  </div>
                  <LayoutDashboard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <p className="font-semibold text-sm text-muted-foreground flex-1">Home (Dashboard)</p>
                  <span className="text-xs text-muted-foreground">Always on</span>
                </div>
                {BOTTOM_NAV_OPTIONS.map(option => {
                  const selected = bottomNavHrefs.includes(option.href);
                  const maxReached = !selected && bottomNavHrefs.length >= 4;
                  return (
                    <button
                      key={option.href}
                      type="button"
                      disabled={maxReached}
                      onClick={() => {
                        setBottomNavHrefs(prev =>
                          prev.includes(option.href)
                            ? prev.filter(h => h !== option.href)
                            : [...prev, option.href]
                        );
                      }}
                      className={`w-full flex items-center gap-4 p-3 border-2 rounded-xl cursor-pointer transition-all text-left ${
                        selected
                          ? "border-primary bg-primary/5"
                          : maxReached
                          ? "border-border bg-background opacity-40 cursor-not-allowed"
                          : "border-border bg-background hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                      </div>
                      <p className={`font-semibold text-sm flex-1 ${selected ? "text-foreground" : "text-muted-foreground"}`}>{option.label}</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Notifications ── */}
        {activeTab === "notifications" && (
          <div className="space-y-5">
            <Card className="border-border/50 shadow-md bg-card">
              <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
                <CardTitle className="font-display flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" /> Compliance Notifications
                </CardTitle>
                <CardDescription>
                  Control where compliance advance emails are sent when a recurring item is marked complete and auto-advances to its next due date.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Enable / disable toggle */}
                <div className="flex items-start justify-between gap-4 rounded-xl border border-border px-5 py-4 bg-muted/20">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Compliance Advance Emails</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Send an email whenever a recurring compliance item is marked complete and its next due date is set.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setF("complianceEmailEnabled", form.complianceEmailEnabled === "1" ? "0" : "1")}
                    className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      form.complianceEmailEnabled === "1" ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                    role="switch"
                    aria-checked={form.complianceEmailEnabled === "1"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        form.complianceEmailEnabled === "1" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Notification email */}
                {form.complianceEmailEnabled === "1" && (
                  <div className="space-y-4">
                    <LF
                      label="Notification Email Address"
                      hint="If left blank, emails will be sent to the account owner's email (or the business email if no owner is set)."
                    >
                      <div className="flex gap-2">
                        <input
                          className={`${inp} flex-1`}
                          type="email"
                          value={form.complianceNotificationEmail}
                          onChange={e => setF("complianceNotificationEmail", e.target.value)}
                          placeholder="compliance@yourcompany.com"
                        />
                        {form.complianceNotificationEmail.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={handleTestEmail}
                            disabled={testEmailState === "sending"}
                            title="Send a test email to verify this address"
                            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                              testEmailState === "sent"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : testEmailState === "error"
                                ? "border-red-300 bg-red-50 text-red-700"
                                : "border-border bg-muted/40 hover:bg-muted text-foreground"
                            } disabled:opacity-60`}
                          >
                            {testEmailState === "sending" ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : testEmailState === "sent" ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : testEmailState === "error" ? (
                              <XCircle className="w-4 h-4" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            <span className="hidden sm:inline">
                              {testEmailState === "sending" ? "Sending…" : testEmailState === "sent" ? "Sent!" : testEmailState === "error" ? "Failed" : "Send Test Email"}
                            </span>
                          </button>
                        )}
                      </div>
                    </LF>
                    {form.complianceNotificationEmail && (
                      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-800">
                          Compliance advance emails will be sent to <strong>{form.complianceNotificationEmail}</strong>.
                        </p>
                      </div>
                    )}
                    {!form.complianceNotificationEmail && (
                      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                        <Mail className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800">
                          No dedicated address set — emails will fall back to the account owner's email or your business email.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {form.complianceEmailEnabled === "0" && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Compliance advance emails are <strong>disabled</strong>. No email will be sent when recurring items auto-advance.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Save bar */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
          <div>
            {error && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertCircle className="w-4 h-4" /> {error}
              </span>
            )}
            {success && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <Check className="w-4 h-4" /> All settings saved successfully!
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-8 py-3 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </form>

      {isOwner && (
        <div className="mt-8 pt-6 border-t border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Admin</h2>
          <a
            href={`${BASE}/checklist-templates`}
            className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors group mb-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Checklist Templates</p>
                <p className="text-xs text-muted-foreground">Manage job progress checklist templates</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>
          <a
            href={`${BASE}/admin/errors`}
            className="flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Error Log</p>
                <p className="text-xs text-muted-foreground">View and manage captured crash reports</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </a>
        </div>
      )}
    </div>
  );
}
