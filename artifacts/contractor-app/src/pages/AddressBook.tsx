import { useState, useMemo } from "react";
import {
  useListContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  type Contact,
  type ContactInput,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Edit2, Trash2, Phone, Mail, MapPin,
  Building2, X, BookMarked, User,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CONTACT_TYPES = [
  "Vendor", "Supplier", "Electrician", "Plumber", "Inspector",
  "Subcontractor", "Government", "Client", "Other",
] as const;

type ContactType = typeof CONTACT_TYPES[number];

const TYPE_COLORS: Record<string, string> = {
  Vendor:         "bg-orange-100 text-orange-700 border-orange-200",
  Supplier:       "bg-amber-100 text-amber-700 border-amber-200",
  Electrician:    "bg-yellow-100 text-yellow-700 border-yellow-200",
  Plumber:        "bg-blue-100 text-blue-700 border-blue-200",
  Inspector:      "bg-purple-100 text-purple-700 border-purple-200",
  Subcontractor:  "bg-indigo-100 text-indigo-700 border-indigo-200",
  Government:     "bg-slate-100 text-slate-700 border-slate-200",
  Client:         "bg-green-100 text-green-700 border-green-200",
  Other:          "bg-gray-100 text-gray-700 border-gray-200",
};

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
    name: f.name.trim(),
    company:  f.company.trim()  || null,
    type:     f.type            || null,
    title:    f.title.trim()    || null,
    phone:    f.phone.trim()    || null,
    fax:      f.fax.trim()      || null,
    email:    f.email.trim()    || null,
    address:  f.address.trim()  || null,
    city:     f.city.trim()     || null,
    state:    f.state.trim()    || null,
    zip:      f.zip.trim()      || null,
    notes:    f.notes.trim()    || null,
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

export default function AddressBook() {
  const { data: contacts = [], isLoading } = useListContacts();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return contacts.filter(c => {
      if (typeFilter !== "All" && c.type !== typeFilter) return false;
      if (!q) return true;
      return [c.name, c.company, c.title, c.phone, c.email, c.address, c.city, c.notes]
        .some(v => v?.toLowerCase().includes(q));
    });
  }, [contacts, typeFilter, search]);

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

  const typeBadge = (type: string | null) => {
    if (!type) return null;
    return (
      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", TYPE_COLORS[type] ?? TYPE_COLORS.Other)}>
        {type}
      </span>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Address Book</h1>
            <p className="text-sm text-muted-foreground">All your business contacts in one place</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Contact
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, phone, email…"
          className="w-full pl-9 pr-4 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {["All", ...CONTACT_TYPES].map(t => (
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
            {t}
            {t !== "All" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({contacts.filter(c => c.type === t).length})
              </span>
            )}
            {t === "All" && (
              <span className="ml-1.5 text-xs opacity-70">({contacts.length})</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <BookMarked className="w-10 h-10 opacity-30" />
          <div className="text-center">
            <p className="font-medium">{contacts.length === 0 ? "No contacts yet" : "No contacts match your search"}</p>
            <p className="text-sm">{contacts.length === 0 ? "Add your first contact to get started" : "Try a different search or filter"}</p>
          </div>
          {contacts.length === 0 && (
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
          {filtered.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{c.name}</p>
                  {c.title && <p className="text-xs text-muted-foreground truncate">{c.title}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {typeBadge(c.type)}
                {c.company && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-muted text-muted-foreground">
                    <Building2 className="w-3 h-3" />{c.company}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-sm">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{c.phone}</span>
                  </a>
                )}
                {c.fax && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span className="w-3.5 text-center flex-shrink-0 font-medium">Fax</span>
                    <span className="truncate">{c.fax}</span>
                  </div>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </a>
                )}
                {(c.address || c.city) && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span className="text-xs leading-snug">
                      {[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {c.notes && (
                <p className="text-xs text-muted-foreground border-t border-border pt-2 line-clamp-2">{c.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {editingContact ? "Edit Contact" : "Add Contact"}
            </DialogTitle>
          </DialogHeader>
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
                  {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.name}</span> from your address book.
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
