import { useState, useMemo } from "react";
import {
  useListContacts,
  useListClients,
  useListSubcontractors,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  type Contact,
  type ContactInput,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "wouter";
import {
  Plus, Search, Edit2, Trash2, Phone, Mail, MapPin,
  Building2, X, Users, User, ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceType = "client" | "sub" | "contact";

interface UnifiedEntry {
  key: string;
  id: number;
  sourceType: SourceType;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  rawContact?: Contact;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STANDALONE_TYPES = [
  "Vendor", "Supplier", "Electrician", "Plumber", "Inspector",
  "Subcontractor", "Government", "Client", "Other",
] as const;

const ALL_FILTER_TYPES = [
  "Client", "Subcontractor",
  "Vendor", "Supplier", "Electrician", "Plumber", "Inspector",
  "Government", "Other",
] as const;

const TYPE_COLORS: Record<string, string> = {
  Client:         "bg-blue-100 text-blue-700 border-blue-200",
  Subcontractor:  "bg-amber-100 text-amber-700 border-amber-200",
  Vendor:         "bg-orange-100 text-orange-700 border-orange-200",
  Supplier:       "bg-teal-100 text-teal-700 border-teal-200",
  Electrician:    "bg-yellow-100 text-yellow-700 border-yellow-200",
  Plumber:        "bg-cyan-100 text-cyan-700 border-cyan-200",
  Inspector:      "bg-purple-100 text-purple-700 border-purple-200",
  Government:     "bg-slate-100 text-slate-700 border-slate-200",
  Other:          "bg-gray-100 text-gray-700 border-gray-200",
};

const SOURCE_RING: Record<SourceType, string> = {
  client:  "ring-1 ring-blue-200",
  sub:     "ring-1 ring-amber-200",
  contact: "",
};

// ─── Contact form ─────────────────────────────────────────────────────────────

type ContactForm = {
  name: string; company: string; type: string; title: string;
  phone: string; fax: string; email: string;
  address: string; city: string; state: string; zip: string;
  notes: string;
};

const EMPTY: ContactForm = {
  name: "", company: "", type: "Other", title: "",
  phone: "", fax: "", email: "",
  address: "", city: "", state: "", zip: "",
  notes: "",
};

function toInput(f: ContactForm): ContactInput {
  return {
    name:    f.name.trim(),
    company: f.company.trim()  || null,
    type:    f.type            || null,
    title:   f.title.trim()    || null,
    phone:   f.phone.trim()    || null,
    fax:     f.fax.trim()      || null,
    email:   f.email.trim()    || null,
    address: f.address.trim()  || null,
    city:    f.city.trim()     || null,
    state:   f.state.trim()    || null,
    zip:     f.zip.trim()      || null,
    notes:   f.notes.trim()    || null,
  };
}

function toForm(c: Contact): ContactForm {
  return {
    name:    c.name ?? "",
    company: c.company ?? "",
    type:    c.type ?? "Other",
    title:   c.title ?? "",
    phone:   c.phone ?? "",
    fax:     c.fax ?? "",
    email:   c.email ?? "",
    address: c.address ?? "",
    city:    c.city ?? "",
    state:   c.state ?? "",
    zip:     c.zip ?? "",
    notes:   c.notes ?? "",
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AddressBook() {
  const { data: contacts = [], isLoading: loadingContacts } = useListContacts();
  const { data: clients = [], isLoading: loadingClients } = useListClients();
  const { data: subs = [], isLoading: loadingSubs } = useListSubcontractors();

  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { toast } = useToast();
  const [, setSearchParams] = useSearchParams();

  const isLoading = loadingContacts || loadingClients || loadingSubs;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Build unified list ──────────────────────────────────────────────────────
  const unified: UnifiedEntry[] = useMemo(() => {
    const entries: UnifiedEntry[] = [];

    for (const c of clients) {
      entries.push({
        key: `client-${c.id}`,
        id: c.id,
        sourceType: "client",
        name: c.name ?? "",
        type: "Client",
        phone: c.phone ?? null,
        email: c.email ?? null,
        company: null,
        address: c.address ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        zip: c.zip ?? null,
        notes: null,
      });
    }

    for (const s of subs) {
      entries.push({
        key: `sub-${s.id}`,
        id: s.id,
        sourceType: "sub",
        name: s.name ?? "",
        type: "Subcontractor",
        phone: s.phone ?? null,
        email: s.email ?? null,
        company: s.trade ?? null,
        address: s.address ?? null,
        city: null,
        state: null,
        zip: null,
        notes: null,
      });
    }

    for (const c of contacts) {
      entries.push({
        key: `contact-${c.id}`,
        id: c.id,
        sourceType: "contact",
        name: c.name ?? "",
        type: c.type ?? "Other",
        phone: c.phone ?? null,
        email: c.email ?? null,
        company: c.company ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        zip: c.zip ?? null,
        notes: c.notes ?? null,
        rawContact: c,
      });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, subs, contacts]);

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return unified.filter(e => {
      if (typeFilter !== "All" && e.type !== typeFilter) return false;
      if (!q) return true;
      return [e.name, e.company, e.phone, e.email, e.address, e.city, e.notes]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [unified, typeFilter, search]);

  // ── Type pill counts ────────────────────────────────────────────────────────
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = { All: unified.length };
    for (const e of unified) {
      map[e.type] = (map[e.type] ?? 0) + 1;
    }
    return map;
  }, [unified]);

  const visibleTypes = ALL_FILTER_TYPES.filter(t => (typeCounts[t] ?? 0) > 0);

  // ── Dialog helpers ──────────────────────────────────────────────────────────
  function openCreate() {
    setEditingContact(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }

  function openEdit(c: Contact) {
    setEditingContact(c);
    setForm(toForm(c));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingContact(null);
    setForm(EMPTY);
  }

  function set(field: keyof ContactForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingContact) {
        await updateContact.mutateAsync({ id: editingContact.id, ...toInput(form) });
        toast({ title: "Contact updated" });
      } else {
        await createContact.mutateAsync(toInput(form));
        toast({ title: "Contact added" });
      }
      closeDialog();
    } catch {
      toast({ title: "Failed to save contact", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteContact.mutateAsync(deleteTarget.id);
      toast({ title: `${deleteTarget.name} removed` });
      setDeleteTarget(null);
    } catch {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  // ── Navigation for clients/subs ─────────────────────────────────────────────
  function handleEntryTap(entry: UnifiedEntry) {
    if (entry.sourceType === "client") {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("tab", "clients");
        return next;
      }, { replace: false });
    } else if (entry.sourceType === "sub") {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("tab", "subcontractors");
        return next;
      }, { replace: false });
    } else if (entry.rawContact) {
      openEdit(entry.rawContact);
    }
  }

  // ── Badge ───────────────────────────────────────────────────────────────────
  function typeBadge(type: string) {
    return (
      <span className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        TYPE_COLORS[type] ?? TYPE_COLORS.Other
      )}>
        {type}
      </span>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Directory</h1>
            <p className="text-sm text-muted-foreground">
              {unified.length} people — clients, subs &amp; contacts
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Contact
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone, email…"
          className="w-full pl-9 pr-4 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Type filter pills */}
      {visibleTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter("All")}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
              typeFilter === "All"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            )}
          >
            All <span className="ml-1 text-xs opacity-70">({unified.length})</span>
          </button>
          {visibleTypes.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              )}
            >
              {t} <span className="ml-1 text-xs opacity-70">({typeCounts[t] ?? 0})</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Users className="w-10 h-10 opacity-30" />
          <div className="text-center">
            <p className="font-medium">
              {unified.length === 0 ? "No one here yet" : "No matches"}
            </p>
            <p className="text-sm">
              {unified.length === 0
                ? "Your clients and subs will appear here automatically. Tap + Add Contact for vendors, inspectors, and others."
                : "Try a different search or filter"}
            </p>
          </div>
          {unified.length === 0 && (
            <button
              onClick={openCreate}
              className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Add Contact
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(entry => {
            const isNavigable = entry.sourceType !== "contact";
            return (
              <div
                key={entry.key}
                onClick={() => handleEntryTap(entry)}
                className={cn(
                  "bg-card border border-border rounded-xl p-4 space-y-3 transition-shadow",
                  SOURCE_RING[entry.sourceType],
                  isNavigable ? "cursor-pointer hover:shadow-md hover:border-primary/30" : "hover:shadow-md"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{entry.name}</p>
                    {entry.company && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Building2 className="w-3 h-3 flex-shrink-0" />{entry.company}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isNavigable ? (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        View <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); entry.rawContact && openEdit(entry.rawContact); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); entry.rawContact && setDeleteTarget(entry.rawContact); }}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {typeBadge(entry.type)}
                </div>

                <div className="space-y-1.5 text-sm">
                  {entry.phone && (
                    <a
                      href={`tel:${entry.phone}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{entry.phone}</span>
                    </a>
                  )}
                  {entry.email && (
                    <a
                      href={`mailto:${entry.email}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{entry.email}</span>
                    </a>
                  )}
                  {(entry.address || entry.city) && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="text-xs leading-snug">
                        {[entry.address, entry.city, entry.state, entry.zip].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {entry.notes && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-2">
                    {entry.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {editingContact ? "Edit Contact" : "Add Contact"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            For clients and subs, use their dedicated tabs. This form is for vendors, inspectors, suppliers, and other contacts.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Name <span className="text-destructive">*</span></label>
                <input
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="Sam Drake"
                  required
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company</label>
                <input
                  value={form.company}
                  onChange={e => set("company", e.target.value)}
                  placeholder="KY Division of Surplus Property"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => set("type", e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STANDALONE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Title / Role</label>
                <input
                  value={form.title}
                  onChange={e => set("title", e.target.value)}
                  placeholder="Assistant Director"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  value={form.phone}
                  onChange={e => set("phone", e.target.value)}
                  placeholder="502-573-4836"
                  type="tel"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fax</label>
                <input
                  value={form.fax}
                  onChange={e => set("fax", e.target.value)}
                  placeholder="502-573-2210"
                  type="tel"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="Samuel.Drake@ky.gov"
                  type="email"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Street Address</label>
                <input
                  value={form.address}
                  onChange={e => set("address", e.target.value)}
                  placeholder="999 Chenault Road"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  value={form.city}
                  onChange={e => set("city", e.target.value)}
                  placeholder="Frankfort"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">State</label>
                  <input
                    value={form.state}
                    onChange={e => set("state", e.target.value)}
                    placeholder="KY"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Zip</label>
                  <input
                    value={form.zip}
                    onChange={e => set("zip", e.target.value)}
                    placeholder="40601"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => set("notes", e.target.value)}
                  placeholder="Any additional notes…"
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeDialog}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !form.name.trim()}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editingContact ? "Save Changes" : "Add Contact"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.name}</span> from your directory.
          </p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
