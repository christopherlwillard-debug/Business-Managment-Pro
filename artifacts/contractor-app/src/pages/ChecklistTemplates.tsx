import { useState, useEffect, useCallback } from "react";
import {
  Plus, X, Edit2, Trash2, ChevronDown, ChevronUp, Copy, Search,
  ClipboardCheck, Check, GripVertical, ToggleRight, ToggleLeft,
  ArrowLeft, Loader2, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TemplateItem {
  id: number;
  title: string;
  sortOrder: number;
}

interface TemplateSection {
  id: number;
  name: string;
  sortOrder: number;
  items: TemplateItem[];
}

interface Template {
  id: number;
  name: string;
  category: string | null;
  active: boolean;
  sections: TemplateSection[];
}

async function apiFetch(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...init, credentials: "include" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  return r.json();
}

export default function ChecklistTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<number>>(new Set());
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/checklist-templates");
      setTemplates(data);
    } catch {
      toast({ title: "Failed to load templates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.category?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  async function createTemplate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const data = await apiFetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), category: newCategory.trim() || null }),
      });
      setTemplates(prev => [...prev, data]);
      setNewName("");
      setNewCategory("");
      setShowNewForm(false);
      setEditingTemplate(data);
      setExpandedTemplates(prev => new Set([...prev, data.id]));
      toast({ title: "Template created" });
    } catch (err: unknown) {
      toast({ title: String(err instanceof Error ? err.message : "Failed to create template"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: Template) {
    try {
      const updated = await apiFetch(`/api/checklist-templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !t.active }),
      });
      setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, active: updated.active } : x));
    } catch {
      toast({ title: "Failed to update template", variant: "destructive" });
    }
  }

  async function deleteTemplate(id: number) {
    if (!confirm("Delete this template? Existing job checklists are not affected.")) return;
    try {
      await apiFetch(`/api/checklist-templates/${id}`, { method: "DELETE" });
      setTemplates(prev => prev.filter(t => t.id !== id));
      if (editingTemplate?.id === id) setEditingTemplate(null);
      toast({ title: "Template deleted" });
    } catch {
      toast({ title: "Failed to delete template", variant: "destructive" });
    }
  }

  async function duplicateTemplate(id: number) {
    try {
      const copy = await apiFetch(`/api/checklist-templates/${id}/duplicate`, { method: "POST" });
      setTemplates(prev => [...prev, copy]);
      setExpandedTemplates(prev => new Set([...prev, copy.id]));
      toast({ title: "Template duplicated" });
    } catch {
      toast({ title: "Failed to duplicate template", variant: "destructive" });
    }
  }

  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        onBack={() => { setEditingTemplate(null); load(); }}
      />
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-5 h-5 text-emerald-500" />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Checklist Templates</h1>
          <p className="text-xs text-muted-foreground">Manage templates used to track job progress</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {/* New template form */}
      {showNewForm && (
        <Card className="p-4 space-y-3 border-emerald-200 bg-emerald-50/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">New Template</h3>
            <button onClick={() => setShowNewForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Template name (e.g. Manufactured Home Trim-Out)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createTemplate()}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
              autoFocus
            />
            <input
              type="text"
              placeholder="Category (optional, e.g. Manufactured Homes, Asphalt)"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
            />
          </div>
          <button
            onClick={createTemplate}
            disabled={!newName.trim() || saving}
            className="w-full py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Template"}
          </button>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <ClipboardCheck className="w-10 h-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {search ? "No templates match your search" : "No templates yet. Create one above."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const totalItems = t.sections.reduce((s, sec) => s + sec.items.length, 0);
            const isExpanded = expandedTemplates.has(t.id);
            return (
              <Card key={t.id} className={`overflow-hidden transition-opacity ${t.active ? "" : "opacity-60"}`}>
                <div className="p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground truncate">{t.name}</h3>
                        {t.category && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground">
                            {t.category}
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                        }`}>
                          {t.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.sections.length} section{t.sections.length !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setExpandedTemplates(prev => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                          return next;
                        })}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditingTemplate(t)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => duplicateTemplate(t.id)}
                        title="Duplicate"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        title={t.active ? "Deactivate" : "Activate"}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50"
                      >
                        {t.active
                          ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                          : <ToggleLeft className="w-4 h-4 text-muted-foreground/40" />}
                      </button>
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      {t.sections.map(s => (
                        <div key={s.id}>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">{s.name} ({s.items.length})</p>
                          <div className="space-y-0.5 pl-3">
                            {s.items.slice(0, 5).map(item => (
                              <p key={item.id} className="text-xs text-foreground/70 truncate">· {item.title}</p>
                            ))}
                            {s.items.length > 5 && (
                              <p className="text-[10px] text-muted-foreground">…and {s.items.length - 5} more</p>
                            )}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => setEditingTemplate(t)}
                        className="w-full py-1.5 mt-1 rounded-xl border border-dashed border-emerald-300 text-emerald-600 text-xs font-semibold hover:bg-emerald-50 transition-colors"
                      >
                        Edit sections &amp; items
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Template editor ───────────────────────────────────────────────────────────
function TemplateEditor({ template, onBack }: { template: Template; onBack: () => void }) {
  const { toast } = useToast();
  const [t, setT] = useState<Template>(template);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(t.name);
  const [newSectionName, setNewSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set(t.sections.map(s => s.id)));
  const [newItemTitle, setNewItemTitle] = useState<Record<number, string>>({});
  const [editingItem, setEditingItem] = useState<{ sectionId: number; itemId: number; draft: string } | null>(null);
  const [editingSection, setEditingSection] = useState<{ id: number; draft: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveName() {
    if (!nameDraft.trim() || nameDraft === t.name) { setEditingName(false); return; }
    try {
      const updated = await apiFetch(`/api/checklist-templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft.trim() }),
      });
      setT(prev => ({ ...prev, name: updated.name }));
      setEditingName(false);
    } catch {
      toast({ title: "Failed to save name", variant: "destructive" });
    }
  }

  async function addSection() {
    if (!newSectionName.trim()) return;
    setAddingSection(true);
    try {
      const section = await apiFetch(`/api/checklist-templates/${t.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSectionName.trim(), sortOrder: t.sections.length }),
      });
      setT(prev => ({ ...prev, sections: [...prev.sections, section] }));
      setExpandedSections(prev => new Set([...prev, section.id]));
      setNewSectionName("");
    } catch {
      toast({ title: "Failed to add section", variant: "destructive" });
    } finally {
      setAddingSection(false);
    }
  }

  async function saveSection(sectionId: number, name: string) {
    try {
      await apiFetch(`/api/checklist-templates/${t.id}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setT(prev => ({ ...prev, sections: prev.sections.map(s => s.id === sectionId ? { ...s, name } : s) }));
      setEditingSection(null);
    } catch {
      toast({ title: "Failed to save section", variant: "destructive" });
    }
  }

  async function deleteSection(sectionId: number) {
    if (!confirm("Delete this section and all its items?")) return;
    try {
      await apiFetch(`/api/checklist-templates/${t.id}/sections/${sectionId}`, { method: "DELETE" });
      setT(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== sectionId) }));
    } catch {
      toast({ title: "Failed to delete section", variant: "destructive" });
    }
  }

  async function addItem(sectionId: number) {
    const title = (newItemTitle[sectionId] ?? "").trim();
    if (!title) return;
    try {
      const section = t.sections.find(s => s.id === sectionId)!;
      const item = await apiFetch(`/api/checklist-templates/${t.id}/sections/${sectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sortOrder: section.items.length }),
      });
      setT(prev => ({
        ...prev,
        sections: prev.sections.map(s => s.id === sectionId ? { ...s, items: [...s.items, item] } : s),
      }));
      setNewItemTitle(prev => ({ ...prev, [sectionId]: "" }));
    } catch {
      toast({ title: "Failed to add item", variant: "destructive" });
    }
  }

  async function saveItem(sectionId: number, itemId: number, title: string) {
    try {
      await apiFetch(`/api/checklist-templates/${t.id}/sections/${sectionId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setT(prev => ({
        ...prev,
        sections: prev.sections.map(s => s.id === sectionId
          ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, title } : i) }
          : s),
      }));
      setEditingItem(null);
    } catch {
      toast({ title: "Failed to save item", variant: "destructive" });
    }
  }

  async function deleteItem(sectionId: number, itemId: number) {
    try {
      await apiFetch(`/api/checklist-templates/${t.id}/sections/${sectionId}/items/${itemId}`, { method: "DELETE" });
      setT(prev => ({
        ...prev,
        sections: prev.sections.map(s => s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s),
      }));
    } catch {
      toast({ title: "Failed to delete item", variant: "destructive" });
    }
  }

  const totalItems = t.sections.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                className="flex-1 px-2 py-1 text-sm font-bold border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                autoFocus
              />
              <button onClick={saveName} className="text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground truncate">{t.name}</h1>
              <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t.sections.length} sections · {totalItems} items</p>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {t.sections.map(section => (
          <Card key={section.id} className="overflow-hidden">
            {/* Section header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/20 border-b border-border/50">
              <button
                onClick={() => setExpandedSections(prev => {
                  const next = new Set(prev);
                  if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
                  return next;
                })}
                className="flex-1 text-left min-w-0"
              >
                {editingSection?.id === section.id ? (
                  <input
                    value={editingSection.draft}
                    onChange={e => setEditingSection({ ...editingSection, draft: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") saveSection(section.id, editingSection.draft); if (e.key === "Escape") setEditingSection(null); }}
                    onClick={e => e.stopPropagation()}
                    className="w-full px-2 py-0.5 text-xs font-bold border border-border rounded-lg focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {expandedSections.has(section.id)
                      ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs font-bold text-foreground">{section.name}</span>
                    <span className="text-[10px] text-muted-foreground">({section.items.length})</span>
                  </div>
                )}
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                {editingSection?.id === section.id ? (
                  <>
                    <button onClick={() => saveSection(section.id, editingSection.draft)} className="text-emerald-600 hover:text-emerald-700 w-6 h-6 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingSection(null)} className="text-muted-foreground w-6 h-6 flex items-center justify-center">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditingSection({ id: section.id, draft: section.name })} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteSection(section.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Items */}
            {expandedSections.has(section.id) && (
              <div className="divide-y divide-border/40">
                {section.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-4 py-2 hover:bg-muted/10">
                    {editingItem?.sectionId === section.id && editingItem?.itemId === item.id ? (
                      <>
                        <input
                          value={editingItem.draft}
                          onChange={e => setEditingItem({ ...editingItem, draft: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") saveItem(section.id, item.id, editingItem.draft); if (e.key === "Escape") setEditingItem(null); }}
                          className="flex-1 px-2 py-0.5 text-xs border border-border rounded-lg focus:outline-none"
                          autoFocus
                        />
                        <button onClick={() => saveItem(section.id, item.id, editingItem.draft)} className="text-emerald-600 w-5 h-5 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingItem(null)} className="text-muted-foreground w-5 h-5 flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs text-foreground leading-5">{item.title}</span>
                        <button onClick={() => setEditingItem({ sectionId: section.id, itemId: item.id, draft: item.title })} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground rounded">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteItem(section.id, item.id)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded">
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add item */}
                <div className="flex items-center gap-2 px-4 py-2">
                  <input
                    type="text"
                    placeholder="Add item…"
                    value={newItemTitle[section.id] ?? ""}
                    onChange={e => setNewItemTitle(prev => ({ ...prev, [section.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addItem(section.id)}
                    className="flex-1 text-xs px-2 py-1.5 border border-dashed border-border rounded-lg bg-muted/10 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <button
                    onClick={() => addItem(section.id)}
                    disabled={!(newItemTitle[section.id] ?? "").trim()}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}

        {/* Add section */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="New section name…"
            value={newSectionName}
            onChange={e => setNewSectionName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addSection()}
            className="flex-1 px-3 py-2 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
          />
          <button
            onClick={addSection}
            disabled={!newSectionName.trim() || addingSection}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Section
          </button>
        </div>
      </div>

      <button onClick={onBack} className="w-full py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/30 transition-colors">
        ← Back to Templates
      </button>
    </div>
  );
}
