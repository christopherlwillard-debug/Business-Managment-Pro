/**
 * Field Crew & Certifications Management
 *
 * Tracks crew members and their certifications for industrial maintenance bids.
 * Certifications feed into bid qualification readiness — expired or expiring certs
 * can be converted to dashboard tasks with a single click.
 *
 * Route: /crew  (owner-only)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HardHat, Plus, Pencil, Trash2, Award, AlertTriangle, CheckCircle2,
  Clock, X, ChevronDown, ChevronUp, Phone, Mail, FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

interface CrewMember {
  id:         number;
  businessId: number | null;
  name:       string;
  role:       string;
  title:      string | null;
  email:      string | null;
  phone:      string | null;
  notes:      string | null;
  active:     boolean;
  createdAt:  string;
  updatedAt:  string;
}

interface CrewCertification {
  id:                number;
  crewMemberId:      number;
  certificationName: string;
  issuingBody:       string | null;
  certNumber:        string | null;
  issuedDate:        string | null;
  expiresAt:         string | null;
  status:            string;
  notes:             string | null;
  createdAt:         string;
  updatedAt:         string;
}

interface ExpiringCert extends CrewCertification {
  memberName:      string;
  memberRole:      string;
  computedStatus:  string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner:          "Owner / Lead",
  crew:           "Crew Member",
  subcontractor:  "Subcontractor",
};

const ROLE_COLORS: Record<string, string> = {
  owner:         "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  crew:          "bg-slate-100 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300",
  subcontractor: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  active:        { label: "Active",         icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
  expiring_soon: { label: "Expiring soon",  icon: Clock,        color: "text-amber-600 dark:text-amber-400" },
  expired:       { label: "Expired",        icon: AlertTriangle,color: "text-red-600 dark:text-red-400" },
  unknown:       { label: "No expiry set",  icon: CheckCircle2, color: "text-muted-foreground" },
};

function certStatus(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "unknown";
  const expiry = new Date(expiresAt);
  const now = new Date();
  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0)  return "expired";
  if (days <= 90) return "expiring_soon";
  return "active";
}

function daysLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days <= 30) return `Expires in ${days}d`;
  if (days <= 90) return `Expires in ${Math.round(days / 7)}wk`;
  return null;
}

// ── Modals ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

// ── Crew Member Form Modal ────────────────────────────────────────────────────

interface MemberFormProps {
  initial?: Partial<CrewMember>;
  onSave: (data: Partial<CrewMember>) => void;
  onClose: () => void;
  loading?: boolean;
}

function MemberFormModal({ initial, onSave, onClose, loading }: MemberFormProps) {
  const [form, setForm] = useState({
    name:  initial?.name  ?? "",
    role:  initial?.role  ?? "crew",
    title: initial?.title ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    notes: initial?.notes ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal title={initial?.id ? "Edit Crew Member" : "Add Crew Member"} onClose={onClose}>
      <Field label="Name *">
        <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Full name" />
      </Field>
      <Field label="Role">
        <select className={inputCls} value={form.role} onChange={set("role")}>
          <option value="owner">Owner / Lead</option>
          <option value="crew">Crew Member</option>
          <option value="subcontractor">Subcontractor</option>
        </select>
      </Field>
      <Field label="Title / Trade">
        <input className={inputCls} value={form.title} onChange={set("title")} placeholder="e.g. Boilermaker, Welder" />
      </Field>
      <Field label="Phone">
        <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" type="tel" />
      </Field>
      <Field label="Email">
        <input className={inputCls} value={form.email} onChange={set("email")} placeholder="email@example.com" type="email" />
      </Field>
      <Field label="Notes">
        <textarea className={inputCls} value={form.notes} onChange={set("notes")} rows={2} placeholder="Any additional notes" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
        <button
          disabled={!form.name.trim() || loading}
          onClick={() => onSave(form)}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

// ── Cert Form Modal ───────────────────────────────────────────────────────────

interface CertFormProps {
  initial?: Partial<CrewCertification>;
  onSave: (data: Partial<CrewCertification>) => void;
  onClose: () => void;
  loading?: boolean;
}

function CertFormModal({ initial, onSave, onClose, loading }: CertFormProps) {
  const [form, setForm] = useState({
    certificationName: initial?.certificationName ?? "",
    issuingBody:       initial?.issuingBody ?? "",
    certNumber:        initial?.certNumber ?? "",
    issuedDate:        initial?.issuedDate ?? "",
    expiresAt:         initial?.expiresAt ?? "",
    notes:             initial?.notes ?? "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal title={initial?.id ? "Edit Certification" : "Add Certification"} onClose={onClose}>
      <Field label="Certification Name *">
        <input className={inputCls} value={form.certificationName} onChange={set("certificationName")}
          placeholder="e.g. AWS D1.1 Welder Certification, OSHA 30, TWIC" />
      </Field>
      <Field label="Issuing Body">
        <input className={inputCls} value={form.issuingBody} onChange={set("issuingBody")}
          placeholder="e.g. AWS, OSHA, TSA, NCCER" />
      </Field>
      <Field label="Cert / Card Number">
        <input className={inputCls} value={form.certNumber} onChange={set("certNumber")} placeholder="Optional" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Issued Date">
          <input className={inputCls} value={form.issuedDate} onChange={set("issuedDate")} type="date" />
        </Field>
        <Field label="Expires">
          <input className={inputCls} value={form.expiresAt} onChange={set("expiresAt")} type="date" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={inputCls} value={form.notes} onChange={set("notes")} rows={2} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
        <button
          disabled={!form.certificationName.trim() || loading}
          onClick={() => onSave(form)}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

// ── Crew Member Card ──────────────────────────────────────────────────────────

function CrewMemberCard({
  member,
  businessId,
  onEdit,
  onDeactivate,
}: {
  member: CrewMember;
  businessId: number | null;
  onEdit: (m: CrewMember) => void;
  onDeactivate: (m: CrewMember) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [addingCert, setAddingCert] = useState(false);
  const [editingCert, setEditingCert] = useState<CrewCertification | null>(null);

  const { data: certs = [] } = useQuery<CrewCertification[]>({
    queryKey: ["crew-certs", member.id],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/crew/members/${member.id}/certifications`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load certifications");
      return res.json();
    },
    enabled: expanded,
  });

  const addCert = useMutation({
    mutationFn: async (data: Partial<CrewCertification>) => {
      const res = await fetch(`${BASE_URL}/api/crew/members/${member.id}/certifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-certs", member.id] });
      queryClient.invalidateQueries({ queryKey: ["crew-expiring"] });
      setAddingCert(false);
      toast({ title: "Certification added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateCert = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CrewCertification> }) => {
      const res = await fetch(`${BASE_URL}/api/crew/certifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-certs", member.id] });
      queryClient.invalidateQueries({ queryKey: ["crew-expiring"] });
      setEditingCert(null);
      toast({ title: "Certification updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCert = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE_URL}/api/crew/certifications/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-certs", member.id] });
      queryClient.invalidateQueries({ queryKey: ["crew-expiring"] });
      toast({ title: "Certification removed" });
    },
  });

  const expiredCount = certs.filter((c) => certStatus(c.expiresAt) === "expired").length;
  const expiringCount = certs.filter((c) => certStatus(c.expiresAt) === "expiring_soon").length;

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl overflow-hidden transition-opacity",
      !member.active && "opacity-60"
    )}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between p-4 gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <HardHat className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-foreground">{member.name}</span>
              {!member.active && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactive</span>}
            </div>
            {member.title && <p className="text-sm text-muted-foreground">{member.title}</p>}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", ROLE_COLORS[member.role] ?? ROLE_COLORS.crew)}>
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
              {expiredCount > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {expiredCount} expired cert{expiredCount !== 1 ? "s" : ""}
                </span>
              )}
              {expiringCount > 0 && expiredCount === 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  {expiringCount} expiring soon
                </span>
              )}
            </div>
            {(member.phone || member.email) && (
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                {member.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{member.phone}</span>}
                {member.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{member.email}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(member)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/60 transition-colors"
            title="Edit crew member"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDeactivate(member)}
            className="p-2 text-muted-foreground hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title={member.active ? "Deactivate crew member" : "This member is already inactive"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Certifications toggle ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 border-t border-border/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5" />
          {certs.length > 0 ? `${certs.length} certification${certs.length !== 1 ? "s" : ""}` : "Certifications"}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* ── Certifications list ── */}
      {expanded && (
        <div className="border-t border-border/50">
          {certs.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-3">No certifications recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {certs.map((cert) => {
                const status = certStatus(cert.expiresAt);
                const statusConf = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
                const Icon = statusConf.icon;
                const dayLbl = daysLabel(cert.expiresAt);
                return (
                  <li key={cert.id} className="px-4 py-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", statusConf.color)} />
                        <span className="text-sm font-medium text-foreground">{cert.certificationName}</span>
                        {dayLbl && (
                          <span className={cn("text-xs font-medium", statusConf.color)}>{dayLbl}</span>
                        )}
                      </div>
                      {cert.issuingBody && <p className="text-xs text-muted-foreground ml-5">{cert.issuingBody}{cert.certNumber ? ` · #${cert.certNumber}` : ""}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingCert(cert)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Remove this certification?")) deleteCert.mutate(cert.id); }}
                        className="p-1.5 text-muted-foreground hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-4 py-2.5 border-t border-border/40">
            <button
              onClick={() => setAddingCert(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Certification
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {addingCert && (
        <CertFormModal
          onSave={(data) => addCert.mutate(data)}
          onClose={() => setAddingCert(false)}
          loading={addCert.isPending}
        />
      )}
      {editingCert && (
        <CertFormModal
          initial={editingCert}
          onSave={(data) => updateCert.mutate({ id: editingCert.id, data })}
          onClose={() => setEditingCert(null)}
          loading={updateCert.isPending}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CrewManagement() {
  const { activeBusiness, businesses, setActiveBusiness } = useBusiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const businessId = activeBusiness?.id ?? null;

  const [tab, setTab] = useState<"members" | "expiring">("members");
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<CrewMember | null>(null);
  const [creatingTasks, setCreatingTasks] = useState(false);

  // ── Fetch crew members ──
  const { data: members = [], isLoading } = useQuery<CrewMember[]>({
    queryKey: ["crew-members", businessId],
    queryFn: async () => {
      const qs = businessId ? `?businessId=${businessId}` : "";
      const res = await fetch(`${BASE_URL}/api/crew/members${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load crew");
      return res.json();
    },
  });

  // ── Fetch expiring certifications ──
  const { data: expiring = [] } = useQuery<ExpiringCert[]>({
    queryKey: ["crew-expiring", businessId],
    queryFn: async () => {
      const qs = businessId ? `?businessId=${businessId}&days=90` : "?days=90";
      const res = await fetch(`${BASE_URL}/api/crew/certifications/expiring${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load expiring certs");
      return res.json();
    },
  });

  const addMember = useMutation({
    mutationFn: async (data: Partial<CrewMember>) => {
      const res = await fetch(`${BASE_URL}/api/crew/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, businessId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-members"] });
      setAddingMember(false);
      toast({ title: "Crew member added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CrewMember> }) => {
      const res = await fetch(`${BASE_URL}/api/crew/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error ?? "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-members"] });
      setEditingMember(null);
      toast({ title: "Crew member updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deactivateMember = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE_URL}/api/crew/members/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-members"] });
      toast({ title: "Crew member deactivated" });
    },
  });

  async function createTasksForExpiring() {
    if (!businessId) {
      toast({ title: "Select a business first", variant: "destructive" }); return;
    }
    setCreatingTasks(true);
    try {
      const res = await fetch(`${BASE_URL}/api/crew/certifications/create-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId }),
      });
      const data = await res.json() as { created?: number; message?: string };
      toast({ title: data.message ?? `Created ${data.created ?? 0} task(s)` });
    } catch {
      toast({ title: "Error creating tasks", variant: "destructive" });
    } finally {
      setCreatingTasks(false);
    }
  }

  const activeMembers   = members.filter((m) => m.active);
  const inactiveMembers = members.filter((m) => !m.active);
  const expiringCount   = expiring.filter((c) => c.computedStatus === "expiring_soon").length;
  const expiredCount    = expiring.filter((c) => c.computedStatus === "expired").length;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <HardHat className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Field Crew</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track crew certifications for industrial maintenance bid qualification
          </p>
        </div>
        <button
          onClick={() => setAddingMember(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Crew Member
        </button>
      </div>

      {/* ── Business selector (multi-biz) ── */}
      {businesses.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          <button
            onClick={() => setActiveBusiness(null)}
            className={cn(
              "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
              !activeBusiness ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
            )}
          >
            All Businesses
          </button>
          {businesses.map((biz) => (
            <button
              key={biz.id}
              onClick={() => setActiveBusiness(biz)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap",
                activeBusiness?.id === biz.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
              )}
            >
              {biz.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-2 border-b border-border">
        {([
            { key: "members"  as const,  label: "Crew Members",  count: activeMembers.length, alert: false },
          { key: "expiring" as const, label: "Cert Health",    count: expiring.length,      alert: expiredCount + expiringCount > 0 },
        ]).map(({ key, label, count, alert }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-full",
              tab === key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {count}
            </span>
            {alert && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
          </button>
        ))}
      </div>

      {/* ── Members tab ── */}
      {tab === "members" && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <HardHat className="w-10 h-10 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">No crew members yet</p>
              <p className="text-sm text-muted-foreground/60">Add your crew to track certifications and build your industrial bid qualification profile.</p>
              <button
                onClick={() => setAddingMember(true)}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add First Member
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeMembers.map((m) => (
                <CrewMemberCard
                  key={m.id}
                  member={m}
                  businessId={businessId}
                  onEdit={setEditingMember}
                  onDeactivate={(mem) => { if (confirm(`Deactivate ${mem.name}?`)) deactivateMember.mutate(mem.id); }}
                />
              ))}
            </div>
          )}

          {inactiveMembers.length > 0 && (
            <details className="mt-4">
              <summary className="text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                {inactiveMembers.length} inactive member{inactiveMembers.length !== 1 ? "s" : ""}
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {inactiveMembers.map((m) => (
                  <CrewMemberCard
                    key={m.id}
                    member={m}
                    businessId={businessId}
                    onEdit={setEditingMember}
                    onDeactivate={() => {}}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* ── Cert health tab ── */}
      {tab === "expiring" && (
        <div className="space-y-4">
          {/* Summary strip — only shows counts for certs needing attention.
              The expiring query returns only expired + expiring-within-90d certs;
              certs with >90 days to go are not included in this feed. */}
          {(expiredCount > 0 || expiringCount > 0) && (
            <div className="flex flex-wrap gap-3">
              {expiringCount > 0 && (
                <div className="bg-card border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Expiring within 90 days</p>
                    <p className="text-lg font-bold text-amber-600">{expiringCount}</p>
                  </div>
                </div>
              )}
              {expiredCount > 0 && (
                <div className="bg-card border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Expired</p>
                    <p className="text-lg font-bold text-red-600">{expiredCount}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {expiring.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <FileCheck className="w-8 h-8 text-green-500/50" />
              <p className="font-medium text-muted-foreground">All certifications are current</p>
              <p className="text-sm text-muted-foreground/60">No certs expiring within 90 days.</p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Crew Member</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Certification</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {expiring
                      .sort((a, b) => {
                        const order: Record<string, number> = { expired: 0, expiring_soon: 1, active: 2, unknown: 3 };
                        return (order[a.computedStatus] ?? 3) - (order[b.computedStatus] ?? 3);
                      })
                      .map((cert) => {
                        const statusConf = STATUS_CONFIG[cert.computedStatus] ?? STATUS_CONFIG.unknown;
                        const Icon = statusConf.icon;
                        return (
                          <tr key={cert.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-foreground">{cert.memberName}</td>
                            <td className="px-4 py-2.5">
                              <span>{cert.certificationName}</span>
                              {cert.issuingBody && <span className="text-muted-foreground ml-1 text-xs">({cert.issuingBody})</span>}
                            </td>
                            <td className="px-4 py-2.5 hidden sm:table-cell">
                              <span className={cn("flex items-center gap-1", statusConf.color)}>
                                <Icon className="w-3.5 h-3.5" />
                                {statusConf.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{cert.expiresAt ?? "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {businessId && (
                <button
                  disabled={creatingTasks}
                  onClick={createTasksForExpiring}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  <FileCheck className="w-4 h-4" />
                  {creatingTasks ? "Creating tasks…" : "Create renewal tasks for expiring certs"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Add/Edit member modals ── */}
      {addingMember && (
        <MemberFormModal
          onSave={(data) => addMember.mutate(data)}
          onClose={() => setAddingMember(false)}
          loading={addMember.isPending}
        />
      )}
      {editingMember && (
        <MemberFormModal
          initial={editingMember}
          onSave={(data) => updateMember.mutate({ id: editingMember.id, data })}
          onClose={() => setEditingMember(null)}
          loading={updateMember.isPending}
        />
      )}
    </div>
  );
}
