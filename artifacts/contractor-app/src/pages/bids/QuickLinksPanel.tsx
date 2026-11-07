import { useState } from "react";
import {
  ExternalLink, RefreshCw, Link2, Plus, Eye,
  EyeOff as EyeOffIcon, Copy, Check, XCircle,
  Pencil, Trash2, ChevronDown, ChevronUp, KeyRound, Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { QuickLink } from "./types";

const EMPTY_FORM = { label: "", url: "", username: "", password: "" };

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  function handleCopy() {
    if (!navigator.clipboard) {
      setFailed(true);
      setTimeout(() => setFailed(false), 2000);
      return;
    }
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      setFailed(true);
      setTimeout(() => setFailed(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={failed ? "Copy not available — select and copy manually" : `Copy ${label ?? "to clipboard"}`}
      className={`p-1 rounded transition-colors ${failed ? "text-destructive" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : failed
        ? <XCircle className="w-3.5 h-3.5" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  );
}

export default function QuickLinksPanel({
  links,
  onSave,
  isSaving,
  isOwner,
}: {
  links: QuickLink[];
  onSave: (links: QuickLink[]) => void;
  isSaving: boolean;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPass, setShowPass] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { toast } = useToast();

  function togglePass(id: string) {
    setShowPass(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(link: QuickLink) {
    setEditingId(link.id);
    setForm({ label: link.label, url: link.url, username: link.username ?? "", password: link.password ?? "" });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.url.trim()) {
      toast({ title: "Label and URL are required", variant: "destructive" });
      return;
    }
    const normalizedUrl = normalizeUrl(form.url);
    if (editingId) {
      const updated = links.map(l =>
        l.id === editingId
          ? { ...l, label: form.label.trim(), url: normalizedUrl, username: form.username.trim() || undefined, password: form.password || undefined }
          : l
      );
      onSave(updated);
    } else {
      const newLink: QuickLink = {
        id: crypto.randomUUID(),
        label: form.label.trim(),
        url: normalizedUrl,
        username: form.username.trim() || undefined,
        password: form.password || undefined,
      };
      onSave([...links, newLink]);
    }
    cancelForm();
  }

  function handleDelete(id: string) {
    onSave(links.filter(l => l.id !== id));
    setDeleteConfirm(null);
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Link2 className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground">Contractor Portal Links</span>
          {links.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {links.length}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Link cards */}
          {links.length > 0 && (
            <div className="divide-y divide-border">
              {links.map(link => (
                <div key={link.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-foreground text-sm truncate">{link.label}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open
                          </a>
                          {isOwner && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(link)}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title="Edit link"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {deleteConfirm === link.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(link.id)}
                                    className="px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground font-medium"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm(null)}
                                    className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground font-medium"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm(link.id)}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                                  title="Delete link"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground truncate">{link.url}</p>

                      {(link.username || link.password) && (
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          {link.username && (
                            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5 min-w-0">
                              <span className="text-xs text-muted-foreground font-medium flex-shrink-0">User:</span>
                              <span className="text-xs text-foreground font-mono truncate">{link.username}</span>
                              <CopyButton value={link.username} label="username" />
                            </div>
                          )}
                          {link.password && (
                            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5 min-w-0">
                              <KeyRound className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs font-mono text-foreground">
                                {showPass[link.id] ? link.password : "••••••••"}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePass(link.id)}
                                className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
                                title={showPass[link.id] ? "Hide password" : "Show password"}
                              >
                                {showPass[link.id]
                                  ? <EyeOffIcon className="w-3.5 h-3.5" />
                                  : <Eye className="w-3.5 h-3.5" />
                                }
                              </button>
                              <CopyButton value={link.password} label="password" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {links.length === 0 && !showForm && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 px-5">
              <Link2 className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground font-medium">No portal links saved yet</p>
              {isOwner && (
                <p className="text-xs text-muted-foreground/70 max-w-xs">
                  Add links to Home Depot, Lowe's, or any contractor installer portal — with optional login credentials for your team.
                </p>
              )}
            </div>
          )}

          {/* Add/edit form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="border-t border-border px-5 py-4 space-y-3 bg-muted/20">
              <p className="text-sm font-semibold text-foreground">
                {editingId ? "Edit Link" : "Add New Link"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Label <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Home Depot Installer Portal"
                    value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    URL <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={form.url}
                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Username <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Login username or email"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Password <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingId ? "Save Changes" : "Add Link"}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Footer: Add button */}
          {isOwner && !showForm && (
            <div className="px-5 py-3 border-t border-border">
              <button
                type="button"
                onClick={openAdd}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add portal link
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
