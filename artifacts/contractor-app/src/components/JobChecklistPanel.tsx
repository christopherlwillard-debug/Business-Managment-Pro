import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, X, ClipboardCheck, Plus, Check, Minus, ChevronDown, ChevronUp,
  Share2, ExternalLink, AlertCircle, Loader2, Copy, ToggleLeft, ToggleRight, Trash2,
  MessageSquare, FileDown, Mail,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChecklistItem {
  id: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
  skipped: boolean;
  notes: string | null;
  sortOrder: number;
}

interface ChecklistSection {
  id: number;
  name: string;
  active: boolean;
  notes: string | null;
  percentComplete: string;
  sortOrder: number;
  items: ChecklistItem[];
}

interface JobChecklist {
  id: number;
  jobId: number;
  templateName: string;
  shareToken: string;
  shareEnabled: boolean;
  statusOverride: string | null;
  publicNotes: string | null;
  overallPercent: number;
  totalItems: number;
  completedItems: number;
  sections: ChecklistSection[];
}

interface Template {
  id: number;
  name: string;
  active: boolean;
  sections: Array<{
    id: number;
    name: string;
    items: Array<{ id: number; title: string }>;
  }>;
}

interface JobChecklistPanelProps {
  job: { id: number; title: string; clientEmail?: string | null };
  onClose: () => void;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function JobChecklistPanel({ job, onClose }: JobChecklistPanelProps) {
  const { toast } = useToast();
  const { canEdit } = useUserPermissions();

  const [checklist, setChecklist] = useState<JobChecklist | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [updatingItem, setUpdatingItem] = useState<number | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [activeSectionIds, setActiveSectionIds] = useState<number[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [sectionNotes, setSectionNotes] = useState<Record<number, string>>({});
  const [savingNotes, setSavingNotes] = useState<number | null>(null);
  const [itemNoteOpen, setItemNoteOpen] = useState<Set<number>>(new Set());
  const [itemNoteDraft, setItemNoteDraft] = useState<Record<number, string>>({});
  const [savingItemNote, setSavingItemNote] = useState<number | null>(null);
  const [publicNotes, setPublicNotes] = useState("");
  const [statusOverride, setStatusOverride] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setChecklist(data);
        if (data) {
          setPublicNotes(data.publicNotes ?? "");
          setStatusOverride(data.statusOverride ?? "");
          const notes: Record<number, string> = {};
          for (const s of data.sections) notes[s.id] = s.notes ?? "";
          setSectionNotes(notes);
          setExpandedSections(new Set(data.sections.filter((s: ChecklistSection) => s.active).map((s: ChecklistSection) => s.id)));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => { load(); }, [load]);

  async function loadTemplates() {
    const r = await fetch(`${BASE}/api/checklist-templates`, { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      setTemplates(data.filter((t: Template) => t.active));
    }
  }

  function openAttach() {
    setShowAttach(true);
    loadTemplates();
  }

  function selectTemplate(id: number) {
    setSelectedTemplate(id);
    const t = templates.find(t => t.id === id);
    if (t) setActiveSectionIds(t.sections.map(s => s.id));
  }

  async function handleAttach() {
    if (!selectedTemplate) return;
    setAttaching(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplate, activeSectionIds }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setChecklist(data);
      setPublicNotes(data.publicNotes ?? "");
      setStatusOverride(data.statusOverride ?? "");
      const notes: Record<number, string> = {};
      for (const s of data.sections) notes[s.id] = s.notes ?? "";
      setSectionNotes(notes);
      setExpandedSections(new Set(data.sections.filter((s: ChecklistSection) => s.active).map((s: ChecklistSection) => s.id)));
      setShowAttach(false);
      toast({ title: "Checklist attached", description: `${data.templateName} — ${data.totalItems} items` });
    } catch {
      toast({ title: "Failed to attach checklist", variant: "destructive" });
    } finally {
      setAttaching(false);
    }
  }

  async function toggleItem(item: ChecklistItem, sectionId: number) {
    if (updatingItem !== null || item.skipped) return;
    setUpdatingItem(item.id);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !item.completed }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to update item", variant: "destructive" });
    } finally {
      setUpdatingItem(null);
    }
  }

  async function toggleSkip(item: ChecklistItem) {
    if (updatingItem !== null) return;
    setUpdatingItem(item.id);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/skip`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: !item.skipped }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to update item", variant: "destructive" });
    } finally {
      setUpdatingItem(null);
    }
  }

  async function toggleSectionActive(section: ChecklistSection) {
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/sections/${section.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !section.active }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to update section", variant: "destructive" });
    }
  }

  function openItemNote(item: ChecklistItem) {
    setItemNoteDraft(prev => ({ ...prev, [item.id]: item.notes ?? "" }));
    setItemNoteOpen(prev => { const s = new Set(prev); s.add(item.id); return s; });
  }

  async function saveItemNote(item: ChecklistItem) {
    const note = itemNoteDraft[item.id] ?? "";
    setSavingItemNote(item.id);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: note }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      setItemNoteOpen(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    } catch {
      toast({ title: "Failed to save note", variant: "destructive" });
    } finally {
      setSavingItemNote(null);
    }
  }

  async function saveSectionNotes(sectionId: number) {
    setSavingNotes(sectionId);
    try {
      await fetch(`${BASE}/api/jobs/${job.id}/checklist/sections/${sectionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: sectionNotes[sectionId] ?? "" }),
      });
    } finally {
      setSavingNotes(null);
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicNotes, statusOverride: statusOverride || null, shareEnabled: checklist?.shareEnabled }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/pdf`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to generate PDF");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Checklist - ${job.title} - ${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Could not generate PDF. Please try again.", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  }

  function openEmailForm() {
    setEmailTo(job.clientEmail ?? "");
    setShowEmailForm(true);
  }

  async function handleEmailPdf() {
    const trimmed = emailTo.trim();
    if (!trimmed) return;
    setSendingEmail(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send email");
      }
      setShowEmailForm(false);
      toast({ title: "Email sent", description: `Checklist PDF sent to ${trimmed}` });
    } catch (err: any) {
      toast({ title: "Failed to send email", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  }

  async function toggleShare() {
    if (!checklist) return;
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareEnabled: !checklist.shareEnabled }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to update sharing", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!confirm("Remove this checklist from the job? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      setChecklist(null);
      toast({ title: "Checklist removed" });
    } catch {
      toast({ title: "Failed to remove checklist", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  function copyStatusLink() {
    if (!checklist) return;
    const url = `${window.location.origin}${BASE}/status/${checklist.shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const toggleSection = (id: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg bg-card border-l border-border flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400 flex-shrink-0" />
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 flex-shrink-0 bg-card">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ClipboardCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Checklist</p>
              <h2 className="font-bold text-foreground text-sm truncate">{job.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : checklist === null ? (
            // ── No checklist attached ──────────────────────────────────────
            showAttach ? (
              <AttachChecklistForm
                templates={templates}
                selectedTemplate={selectedTemplate}
                activeSectionIds={activeSectionIds}
                onSelectTemplate={selectTemplate}
                onToggleSection={(id) => {
                  setActiveSectionIds(prev =>
                    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                  );
                }}
                onAttach={handleAttach}
                onCancel={() => setShowAttach(false)}
                attaching={attaching}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 gap-4 p-8">
                <ClipboardCheck className="w-12 h-12 text-muted-foreground/20" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">No checklist attached</p>
                  <p className="text-xs text-muted-foreground mt-1">Attach a template to start tracking progress</p>
                </div>
                {canEdit("jobs") && (
                  <button
                    onClick={openAttach}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Attach Checklist
                  </button>
                )}
              </div>
            )
          ) : (
            // ── Checklist view ─────────────────────────────────────────────
            <div className="space-y-0">
              {/* Overall progress */}
              <div className="px-5 py-4 bg-muted/20 border-b border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{checklist.templateName}</p>
                    <p className="text-sm font-bold text-foreground">
                      {checklist.completedItems} / {checklist.totalItems} items complete
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-black ${checklist.overallPercent === 100 ? "text-emerald-600" : "text-foreground"}`}>
                      {checklist.overallPercent}%
                    </span>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${checklist.overallPercent === 100 ? "bg-emerald-500" : "bg-emerald-400"}`}
                    style={{ width: `${checklist.overallPercent}%` }}
                  />
                </div>
                {checklist.overallPercent === 100 && (
                  <p className="text-xs text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> All items complete!
                  </p>
                )}
              </div>

              {/* Share Progress Link */}
              {canEdit("jobs") && (
                <div className="px-5 py-3 border-b border-border/50 bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleShare}
                      className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {checklist.shareEnabled
                        ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                        : <ToggleLeft className="w-5 h-5 text-muted-foreground/50" />}
                      Share Progress Link
                    </button>
                    <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${checklist.shareEnabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {checklist.shareEnabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  {checklist.shareEnabled && (
                    <div className="flex items-center gap-2 bg-muted/30 border border-border/60 rounded-xl px-3 py-2">
                      <span className="flex-1 text-[11px] text-muted-foreground font-mono truncate">
                        {`${window.location.origin}${BASE}/status/${checklist.shareToken}`}
                      </span>
                      <button
                        onClick={copyStatusLink}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Download PDF + Email PDF */}
              {canEdit("jobs") && (
                <div className="px-5 py-3 border-b border-border/50 bg-background space-y-2">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                      className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {downloadingPdf
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <FileDown className="w-4 h-4" />}
                      {downloadingPdf ? "Generating PDF…" : "Download as PDF"}
                    </button>
                    <button
                      onClick={openEmailForm}
                      disabled={sendingEmail}
                      className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <Mail className="w-4 h-4" />
                      Email PDF
                    </button>
                  </div>
                  {showEmailForm && (
                    <div className="flex items-center gap-2 bg-muted/30 border border-border/60 rounded-xl px-3 py-2">
                      <input
                        type="email"
                        autoFocus
                        value={emailTo}
                        onChange={e => setEmailTo(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleEmailPdf(); if (e.key === "Escape") setShowEmailForm(false); }}
                        placeholder="recipient@email.com"
                        className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
                      />
                      <button
                        onClick={() => setShowEmailForm(false)}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleEmailPdf}
                        disabled={sendingEmail || !emailTo.trim()}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {sendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                        {sendingEmail ? "Sending…" : "Send"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Sections */}
              <div className="divide-y divide-border/50">
                {checklist.sections.map(section => {
                  const isExpanded = expandedSections.has(section.id);
                  const sectionPct = parseFloat(section.percentComplete);
                  const doneCount = section.items.filter(i => i.completed && !i.skipped).length;
                  const activeCount = section.items.filter(i => !i.skipped).length;

                  return (
                    <div key={section.id} className={section.active ? "" : "opacity-50"}>
                      {/* Section header */}
                      <div className="flex items-center gap-2 px-5 py-3 bg-muted/10">
                        <button
                          onClick={() => toggleSection(section.id)}
                          className="flex-1 flex items-center gap-2 text-left min-w-0"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-foreground truncate">{section.name}</p>
                            <p className="text-[10px] text-muted-foreground">{doneCount}/{activeCount} · {Math.round(sectionPct)}%</p>
                          </div>
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${sectionPct}%` }}
                            />
                          </div>
                        </button>
                        {canEdit("jobs") && (
                          <button
                            onClick={() => toggleSectionActive(section)}
                            title={section.active ? "Deactivate section" : "Activate section"}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                          >
                            {section.active
                              ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                              : <ToggleLeft className="w-4 h-4 text-muted-foreground/40" />}
                          </button>
                        )}
                      </div>

                      {/* Items */}
                      {isExpanded && (
                        <div className="px-5 pb-2 space-y-1">
                          {section.items.map(item => (
                            <div
                              key={item.id}
                              className={`flex items-start gap-2.5 py-2 rounded-lg px-1 transition-colors ${
                                item.skipped ? "opacity-50" : ""
                              } ${canEdit("jobs") && !item.skipped ? "hover:bg-muted/20 cursor-pointer" : ""}`}
                            >
                              {/* Checkbox */}
                              <button
                                onClick={() => canEdit("jobs") && toggleItem(item, section.id)}
                                disabled={updatingItem === item.id || item.skipped || !canEdit("jobs")}
                                className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 mt-0.5 transition-all ${
                                  item.skipped
                                    ? "border-muted bg-muted"
                                    : item.completed
                                    ? "bg-emerald-500 border-emerald-500"
                                    : "border-muted-foreground/30 hover:border-emerald-400"
                                }`}
                              >
                                {updatingItem === item.id
                                  ? <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground" />
                                  : item.skipped
                                  ? <Minus className="w-2.5 h-2.5 text-muted-foreground" />
                                  : item.completed
                                  ? <Check className="w-2.5 h-2.5 text-white" />
                                  : null}
                              </button>

                              {/* Title + meta + note */}
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-xs leading-5 ${
                                    item.skipped ? "line-through text-muted-foreground" : item.completed ? "line-through text-muted-foreground" : "text-foreground"
                                  } ${canEdit("jobs") && !item.skipped ? "cursor-pointer" : ""}`}
                                  onClick={() => canEdit("jobs") && !item.skipped && toggleItem(item, section.id)}
                                >
                                  {item.title}
                                </p>
                                {item.completed && item.completedByName && (
                                  <p className="text-[10px] text-emerald-600">
                                    ✓ {item.completedByName} · {formatDate(item.completedAt)}
                                  </p>
                                )}
                                {/* Existing note display (when editor is closed) */}
                                {item.notes && !itemNoteOpen.has(item.id) && (
                                  <p className="text-[10px] text-muted-foreground italic mt-0.5">{item.notes}</p>
                                )}
                                {/* Note textarea (when open) */}
                                {itemNoteOpen.has(item.id) && (
                                  <div className="mt-1.5">
                                    <textarea
                                      autoFocus
                                      value={itemNoteDraft[item.id] ?? ""}
                                      onChange={e => setItemNoteDraft(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      onBlur={() => saveItemNote(item)}
                                      placeholder="Add a note…"
                                      rows={2}
                                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                                    />
                                    {savingItemNote === item.id && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Note icon + N/A toggle */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {canEdit("jobs") && !item.skipped && (
                                  <button
                                    onClick={() => openItemNote(item)}
                                    title="Add note"
                                    className={`w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50 transition-colors mt-0.5 ${item.notes ? "text-emerald-500" : ""}`}
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
                                )}
                                {canEdit("jobs") && !item.completed && (
                                  <button
                                    onClick={() => toggleSkip(item)}
                                    disabled={updatingItem === item.id}
                                    title={item.skipped ? "Unskip" : "Mark N/A"}
                                    className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-muted text-muted-foreground hover:bg-muted/30 transition-colors mt-0.5"
                                  >
                                    {item.skipped ? "Undo" : "N/A"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Section notes */}
                          {canEdit("jobs") && section.active && (
                            <div className="pt-1 pb-2">
                              <textarea
                                value={sectionNotes[section.id] ?? ""}
                                onChange={e => setSectionNotes(prev => ({ ...prev, [section.id]: e.target.value }))}
                                onBlur={() => saveSectionNotes(section.id)}
                                placeholder="Section notes (delays, context)…"
                                rows={2}
                                className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-muted/20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                              />
                            </div>
                          )}
                          {!canEdit("jobs") && section.notes && (
                            <p className="text-xs text-muted-foreground italic pb-2 px-1">{section.notes}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Meta: publicNotes + statusOverride */}
              {canEdit("jobs") && (
                <div className="px-5 py-4 border-t border-border/50 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Share2 className="w-3 h-3" /> Public Status Page
                  </p>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Status Override</label>
                      <input
                        type="text"
                        value={statusOverride}
                        onChange={e => setStatusOverride(e.target.value)}
                        placeholder="e.g. Waiting on Factory Parts, Weather Delay…"
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">Leave blank to show auto-calculated progress</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Public Note</label>
                      <textarea
                        value={publicNotes}
                        onChange={e => setPublicNotes(e.target.value)}
                        placeholder="Note visible to dealers on the status page…"
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                      />
                    </div>
                    <button
                      onClick={saveMeta}
                      disabled={savingMeta}
                      className="w-full py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-60"
                    >
                      {savingMeta ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* Danger zone */}
              {canEdit("jobs") && (
                <div className="px-5 py-4 border-t border-border/50">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 text-xs text-destructive/70 hover:text-destructive transition-colors font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting ? "Removing…" : "Remove checklist from job"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Attach checklist form ─────────────────────────────────────────────────────
function AttachChecklistForm({
  templates, selectedTemplate, activeSectionIds,
  onSelectTemplate, onToggleSection, onAttach, onCancel, attaching,
}: {
  templates: Template[];
  selectedTemplate: number | null;
  activeSectionIds: number[];
  onSelectTemplate: (id: number) => void;
  onToggleSection: (id: number) => void;
  onAttach: () => void;
  onCancel: () => void;
  attaching: boolean;
}) {
  const selected = templates.find(t => t.id === selectedTemplate);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-foreground">Attach Checklist Template</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <ClipboardCheck className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No templates available.</p>
          <p className="text-xs text-muted-foreground">Create templates in Settings → Checklist Templates.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground mb-2">Select Template</label>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => onSelectTemplate(t.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  selectedTemplate === t.id
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-border hover:bg-muted/30 text-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{t.name}</span>
                  <span className="text-[10px] text-muted-foreground">{t.sections.reduce((s, sec) => s + sec.items.length, 0)} items</span>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground">Active Sections</label>
              <p className="text-[10px] text-muted-foreground">Uncheck sections not needed for this job</p>
              {selected.sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => onToggleSection(s.id)}
                  className={`w-full text-left px-3.5 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeSectionIds.includes(s.id)
                      ? "border-emerald-300 bg-emerald-50/60 text-emerald-800"
                      : "border-border bg-muted/20 text-muted-foreground"
                  }`}
                >
                  <span className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${
                    activeSectionIds.includes(s.id) ? "bg-emerald-500 border-emerald-500" : "border-gray-300"
                  }`}>
                    {activeSectionIds.includes(s.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="flex-1">{s.name}</span>
                  <span className="text-muted-foreground">{s.items.length} items</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onAttach}
            disabled={!selectedTemplate || attaching}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-sm"
          >
            {attaching ? "Attaching…" : "Attach Checklist"}
          </button>
        </>
      )}
    </div>
  );
}
