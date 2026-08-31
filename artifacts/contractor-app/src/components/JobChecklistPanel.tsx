import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, X, ClipboardCheck, Plus, Check, CheckCircle, Minus, ChevronDown, ChevronUp,
  Share2, ExternalLink, AlertCircle, Loader2, Copy, ToggleLeft, ToggleRight, Trash2,
  MessageSquare, FileDown, Mail, Camera, Pencil, Clock, PauseCircle, Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUserPermissions } from "@/contexts/UserPermissions";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChecklistItemPhoto {
  id: number;
  url: string;
}

interface ChecklistFinishedPhoto {
  id: number;
  url: string;
  createdAt: string;
}

interface ChecklistItemPart {
  id: number;
  label: string;
  sortOrder: number;
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
}

interface ChecklistItem {
  id: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
  skipped: boolean;
  notes: string | null;
  sortOrder: number;
  scheduledDate: string | null;
  assignedSubcontractorId: number | null;
  photos: ChecklistItemPhoto[];
  parts: ChecklistItemPart[];
}

interface SectionNoteEntry {
  id: number;
  note: string;
  authorName: string;
  createdAt: string;
}

interface StatusLogEntry {
  id: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
}

interface ChecklistSection {
  id: number;
  name: string;
  active: boolean;
  notes: string | null;
  noteEntries: SectionNoteEntry[];
  percentComplete: string;
  sortOrder: number;
  items: ChecklistItem[];
  completed?: boolean;
  completedAt?: string | null;
  completedByName?: string | null;
}

interface JobChecklist {
  id: number;
  jobId: number;
  templateName: string;
  shareToken: string;
  shareEnabled: boolean;
  statusOverride: string | null;
  publicNotes: string | null;
  startNotes: string | null;
  overallPercent: number;
  totalItems: number;
  completedItems: number;
  finishedNotes: string | null;
  finishedPhotos: ChecklistFinishedPhoto[];
  startPhotos: ChecklistFinishedPhoto[];
  statusLog: StatusLogEntry[];
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
  job: {
    id: number;
    title: string;
    clientEmail?: string | null;
    businessId?: number | null;
    businessLine?: string | null;
    subcontractorIds?: number[] | null;
  };
  subcontractors?: Array<{ id: number; name: string }>;
  onClose: () => void;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toLocalDatetimeInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function checklistScopeQuery(job: JobChecklistPanelProps["job"]): string {
  const params = new URLSearchParams();
  if (job.businessId != null) params.set("businessId", String(job.businessId));
  else if (job.businessLine) params.set("businessLine", job.businessLine);
  const query = params.toString();
  return query ? `?${query}` : "";
}

const STATUS_BUTTONS = [
  "Weather Delay",
  "Waiting on Parts",
  "Waiting on Inspection",
  "Waiting on Other Crew",
  "Homeowner Not Available",
];

const MAX_RAW_FILE_MB = 20;
const MAX_WIDTH_PX = 1200;
const JPEG_QUALITY = 0.8;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = w > MAX_WIDTH_PX ? MAX_WIDTH_PX / w : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const ext = file.name.replace(/\.[^.]+$/, "") || "photo";
          resolve(new File([blob], `${ext}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read image")); };
    img.src = objectUrl;
  });
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function JobChecklistPanel({ job, subcontractors = [], onClose }: JobChecklistPanelProps) {
  const { toast } = useToast();
  const { canEdit } = useUserPermissions();

  const [checklist, setChecklist] = useState<JobChecklist | null>(null);
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
  const [itemScheduleDraft, setItemScheduleDraft] = useState<Record<number, { scheduledDate: string; assignedSubcontractorId: string }>>({});
  const [savingScheduleItem, setSavingScheduleItem] = useState<number | null>(null);
  const [publicNotes, setPublicNotes] = useState("");
  const [statusOverride, setStatusOverride] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [photoOpen, setPhotoOpen] = useState<Set<number>>(new Set());
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<Record<number, number>>({});
  const [uploadingFinishedPhotos, setUploadingFinishedPhotos] = useState(false);
  const [deletingFinishedPhoto, setDeletingFinishedPhoto] = useState<number | null>(null);
  const [finishedNotesDraft, setFinishedNotesDraft] = useState("");
  const [savingFinishedNotes, setSavingFinishedNotes] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<number | null>(null);
  const [splittingItem, setSplittingItem] = useState<number | null>(null);
  const [partLabelDraft, setPartLabelDraft] = useState<Record<number, string>>({});
  const [togglingPart, setTogglingPart] = useState<number | null>(null);
  const [deletingPart, setDeletingPart] = useState<number | null>(null);
  const [addingPartTo, setAddingPartTo] = useState<number | null>(null);
  const [flashedSectionId, setFlashedSectionId] = useState<number | null>(null);
  const [flashOverall, setFlashOverall] = useState(false);
  const [startNotesDraft, setStartNotesDraft] = useState("");
  const [savingStartNotes, setSavingStartNotes] = useState(false);
  const [uploadingStartPhotos, setUploadingStartPhotos] = useState(false);
  const [deletingStartPhoto, setDeletingStartPhoto] = useState<number | null>(null);
  const [settingStatus, setSettingStatus] = useState(false);
  const [editingLogEntry, setEditingLogEntry] = useState<number | null>(null);
  const [logEditDraft, setLogEditDraft] = useState<Record<number, { startedAt: string; endedAt: string }>>({});
  const [savingLogEdit, setSavingLogEdit] = useState<number | null>(null);
  const [deletingLogEntry, setDeletingLogEntry] = useState<number | null>(null);
  const [addingNoteFor, setAddingNoteFor] = useState<number | null>(null);
  const [noteDraftForSection, setNoteDraftForSection] = useState<Record<number, string>>({});
  const [savingNoteFor, setSavingNoteFor] = useState<number | null>(null);
  const [deletingNote, setDeletingNote] = useState<number | null>(null);

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
          setFinishedNotesDraft(data.finishedNotes ?? "");
          setStartNotesDraft(data.startNotes ?? "");
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
      setFinishedNotesDraft(data.finishedNotes ?? "");
      setStartNotesDraft(data.startNotes ?? "");
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

  async function toggleSkip(item: ChecklistItem, sectionId: number) {
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
      setFlashedSectionId(sectionId);
      setFlashOverall(true);
      setTimeout(() => { setFlashedSectionId(null); setFlashOverall(false); }, 1400);
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

  async function toggleSectionComplete(section: ChecklistSection) {
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/sections/${section.id}/complete${checklistScopeQuery(job)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: !section.completed }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      toast({ title: !section.completed ? "Section marked complete" : "Section reopened" });
    } catch {
      toast({ title: "Section status was not saved", description: "Please try again.", variant: "destructive" });
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

  async function saveItemSchedule(item: ChecklistItem, changes: { scheduledDate?: string | null; assignedSubcontractorId?: number | null }) {
    setSavingScheduleItem(item.id);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}${checklistScopeQuery(job)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save schedule");
      }
      setChecklist(await r.json());
      setItemScheduleDraft(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      toast({ title: "Failed to save schedule", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setSavingScheduleItem(null);
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

  async function saveStartNotes() {
    setSavingStartNotes(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startNotes: startNotesDraft }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to save start notes", variant: "destructive" });
    } finally {
      setSavingStartNotes(false);
    }
  }

  async function handleStartPhotoUpload(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    const oversized = fileArr.filter(f => f.size > MAX_RAW_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      toast({ title: "Photo too large", description: `Each photo must be under ${MAX_RAW_FILE_MB} MB.`, variant: "destructive" });
      return;
    }
    setUploadingStartPhotos(true);
    try {
      const compressed = await Promise.all(fileArr.map(f => compressImage(f)));
      const form = new FormData();
      for (const file of compressed) form.append("photos", file);
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/start-photos`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploadingStartPhotos(false);
    }
  }

  async function handleStartPhotoDelete(photoId: number) {
    setDeletingStartPhoto(photoId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/start-photos/${photoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to delete photo", variant: "destructive" });
    } finally {
      setDeletingStartPhoto(null);
    }
  }

  async function setChecklistStatus(status: string | null) {
    setSettingStatus(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      setStatusOverride(status ?? "");
    } catch {
      toast({ title: "Failed to set status", variant: "destructive" });
    } finally {
      setSettingStatus(false);
    }
  }

  function beginLogEdit(entry: StatusLogEntry) {
    setLogEditDraft(prev => ({
      ...prev,
      [entry.id]: {
        startedAt: toLocalDatetimeInput(entry.startedAt),
        endedAt: toLocalDatetimeInput(entry.endedAt),
      },
    }));
    setEditingLogEntry(entry.id);
  }

  async function saveLogEntryEdit(logId: number) {
    setSavingLogEdit(logId);
    try {
      const draft = logEditDraft[logId];
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/status-log/${logId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: draft.startedAt ? new Date(draft.startedAt).toISOString() : undefined,
          endedAt: draft.endedAt ? new Date(draft.endedAt).toISOString() : null,
        }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      setEditingLogEntry(null);
    } catch {
      toast({ title: "Failed to save edit", variant: "destructive" });
    } finally {
      setSavingLogEdit(null);
    }
  }

  async function deleteLogEntry(logId: number) {
    setDeletingLogEntry(logId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/status-log/${logId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to delete entry", variant: "destructive" });
    } finally {
      setDeletingLogEntry(null);
    }
  }

  async function addSectionNote(sectionId: number) {
    const note = (noteDraftForSection[sectionId] ?? "").trim();
    if (!note) return;
    setSavingNoteFor(sectionId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/sections/${sectionId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      setNoteDraftForSection(prev => ({ ...prev, [sectionId]: "" }));
      setAddingNoteFor(null);
    } catch {
      toast({ title: "Failed to add note", variant: "destructive" });
    } finally {
      setSavingNoteFor(null);
    }
  }

  async function deleteSectionNote(sectionId: number, noteId: number) {
    setDeletingNote(noteId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/sections/${sectionId}/notes/${noteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to delete note", variant: "destructive" });
    } finally {
      setDeletingNote(null);
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

  async function handlePhotoUpload(itemId: number, files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const oversized = fileArr.filter(f => f.size > MAX_RAW_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      toast({
        title: "Photo too large",
        description: `Each photo must be under ${MAX_RAW_FILE_MB} MB. Please choose a smaller file.`,
        variant: "destructive",
      });
      return;
    }

    setUploadingPhotoFor(prev => ({ ...prev, [itemId]: fileArr.length }));
    try {
      const compressed = await Promise.all(fileArr.map(f => compressImage(f)));
      const form = new FormData();
      for (const file of compressed) {
        form.append("photos", file);
      }
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${itemId}/photos`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!r.ok) throw new Error("Upload failed");
      const updated = await r.json();
      setChecklist(updated);
      setPhotoOpen(prev => { const s = new Set(prev); s.add(itemId); return s; });
    } catch {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploadingPhotoFor(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    }
  }

  async function saveFinishedNotes() {
    setSavingFinishedNotes(true);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finishedNotes: finishedNotesDraft || null }),
      });
      if (!r.ok) throw new Error();
      setChecklist(await r.json());
    } catch {
      toast({ title: "Failed to save notes", variant: "destructive" });
    } finally {
      setSavingFinishedNotes(false);
    }
  }

  async function handleFinishedPhotoUpload(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (!fileArr.length) return;
    for (const file of fileArr) {
      if (file.size > MAX_RAW_FILE_MB * 1024 * 1024) {
        toast({ title: "Photo too large", description: `Each photo must be under ${MAX_RAW_FILE_MB} MB.`, variant: "destructive" });
        return;
      }
    }
    setUploadingFinishedPhotos(true);
    try {
      const compressed = await Promise.all(fileArr.map(compressImage));
      const form = new FormData();
      for (const file of compressed) form.append("photos", file);
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/finished-photos`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!r.ok) throw new Error("Upload failed");
      setChecklist(await r.json());
    } catch {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploadingFinishedPhotos(false);
    }
  }

  async function handleFinishedPhotoDelete(photoId: number) {
    setDeletingFinishedPhoto(photoId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/finished-photos/${photoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
      setChecklist(await r.json());
    } catch {
      toast({ title: "Failed to delete photo", variant: "destructive" });
    } finally {
      setDeletingFinishedPhoto(null);
    }
  }

  async function handlePhotoDelete(itemId: number, photoId: number) {
    setDeletingPhoto(photoId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${itemId}/photos/${photoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Delete failed");
      setChecklist(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.map(i => i.id === itemId
              ? { ...i, photos: i.photos.filter(p => p.id !== photoId) }
              : i
            ),
          })),
        };
      });
    } catch {
      toast({ title: "Failed to delete photo", variant: "destructive" });
    } finally {
      setDeletingPhoto(null);
    }
  }

  async function handleSplitItem(item: ChecklistItem) {
    if (splittingItem !== null) return;
    setSplittingItem(item.id);
    try {
      await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/parts`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Part 1" }),
      });
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/parts`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Part 2" }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to split item", variant: "destructive" });
    } finally {
      setSplittingItem(null);
    }
  }

  async function handleTogglePart(item: ChecklistItem, part: ChecklistItemPart) {
    if (togglingPart !== null) return;
    setTogglingPart(part.id);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/parts/${part.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !part.completed }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to update part", variant: "destructive" });
    } finally {
      setTogglingPart(null);
    }
  }

  async function handleRenamePart(item: ChecklistItem, partId: number, label: string) {
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/parts/${partId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      setPartLabelDraft(prev => { const next = { ...prev }; delete next[partId]; return next; });
    } catch {
      toast({ title: "Failed to rename part", variant: "destructive" });
    }
  }

  async function handleDeletePart(item: ChecklistItem, partId: number) {
    setDeletingPart(partId);
    try {
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/parts/${partId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
      setPartLabelDraft(prev => { const next = { ...prev }; delete next[partId]; return next; });
    } catch {
      toast({ title: "Failed to delete part", variant: "destructive" });
    } finally {
      setDeletingPart(null);
    }
  }

  async function handleAddPart(item: ChecklistItem) {
    setAddingPartTo(item.id);
    try {
      const nextNum = item.parts.length + 1;
      const r = await fetch(`${BASE}/api/jobs/${job.id}/checklist/items/${item.id}/parts`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Part ${nextNum}` }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setChecklist(updated);
    } catch {
      toast({ title: "Failed to add part", variant: "destructive" });
    } finally {
      setAddingPartTo(null);
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
    const url = `${window.location.origin}${BASE}/api/public/status/${checklist.shareToken}/share`;
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

  const linkedSubcontractors = subcontractors.filter(sub =>
    job.subcontractorIds?.includes(sub.id)
  );

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
                    <p className={`text-sm font-bold transition-colors duration-75 ${flashOverall ? "text-emerald-600" : "text-foreground"}`}>
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
                        {`${window.location.origin}${BASE}/api/public/status/${checklist.shareToken}/share`}
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
                            <p className={`text-[10px] transition-colors duration-75 ${flashedSectionId === section.id ? "text-emerald-600 font-semibold" : "text-muted-foreground"}`}>{doneCount}/{activeCount} · {Math.round(sectionPct)}%</p>
                          </div>
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${sectionPct}%` }}
                            />
                          </div>
                        </button>
                        {canEdit("jobs") && section.active && (
                          <button
                            onClick={() => toggleSectionComplete(section)}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-colors shrink-0 border ${section.completed ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                            title={section.completed ? "Reopen section" : "Mark section complete"}
                          >
                            <CheckCircle className="w-3 h-3" />
                            {section.completed ? "Done" : "Complete Section"}
                          </button>
                        )}
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
                                onClick={() => canEdit("jobs") && !item.parts.length && toggleItem(item, section.id)}
                                disabled={updatingItem === item.id || item.skipped || !canEdit("jobs") || item.parts.length > 0}
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
                                    item.skipped ? "line-through text-muted-foreground" : item.completed && !item.parts.length ? "line-through text-muted-foreground" : "text-foreground"
                                  } ${canEdit("jobs") && !item.skipped && !item.parts.length ? "cursor-pointer" : ""}`}
                                  onClick={() => canEdit("jobs") && !item.skipped && !item.parts.length && toggleItem(item, section.id)}
                                >
                                  {item.title}
                                  {item.parts.length > 0 && (
                                    <span className="ml-1.5 text-[10px] font-bold text-muted-foreground tabular-nums">
                                      {item.parts.filter(p => p.completed).length}/{item.parts.length}
                                    </span>
                                  )}
                                </p>
                                {item.completed && item.completedByName && (
                                  <p className="text-[10px] text-emerald-600">
                                    ✓ {item.completedByName} · {formatDate(item.completedAt)}
                                  </p>
                                )}
                                 {canEdit("jobs") && (
                                   <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                     <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                       <Calendar className="w-3 h-3" />
                                       <input
                                         type="date"
                                         value={itemScheduleDraft[item.id]?.scheduledDate ?? item.scheduledDate ?? ""}
                                         onChange={e => setItemScheduleDraft(prev => ({
                                           ...prev,
                                           [item.id]: {
                                             scheduledDate: e.target.value,
                                             assignedSubcontractorId: prev[item.id]?.assignedSubcontractorId ?? String(item.assignedSubcontractorId ?? ""),
                                           },
                                         }))}
                                         onBlur={() => {
                                           const draft = itemScheduleDraft[item.id];
                                           if (draft && draft.scheduledDate !== (item.scheduledDate ?? "")) {
                                             void saveItemSchedule(item, { scheduledDate: draft.scheduledDate || null });
                                           }
                                         }}
                                         aria-label={`Schedule ${item.title}`}
                                         className="h-6 rounded-md border border-border bg-background px-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                       />
                                     </label>
                                     {linkedSubcontractors.length > 0 ? (
                                       <select
                                         value={itemScheduleDraft[item.id]?.assignedSubcontractorId ?? String(item.assignedSubcontractorId ?? "")}
                                         onChange={e => {
                                           const assignedSubcontractorId = e.target.value;
                                           setItemScheduleDraft(prev => ({
                                             ...prev,
                                             [item.id]: {
                                               scheduledDate: prev[item.id]?.scheduledDate ?? item.scheduledDate ?? "",
                                               assignedSubcontractorId,
                                             },
                                           }));
                                           void saveItemSchedule(item, {
                                             assignedSubcontractorId: assignedSubcontractorId ? Number(assignedSubcontractorId) : null,
                                           });
                                         }}
                                         disabled={savingScheduleItem === item.id}
                                         aria-label={`Assign ${item.title}`}
                                         className="h-6 max-w-[150px] rounded-md border border-border bg-background px-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                       >
                                         <option value="">Unassigned</option>
                                         {linkedSubcontractors.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                                       </select>
                                     ) : (
                                       <span className="text-[10px] text-muted-foreground/70">Assign crew on the job first</span>
                                     )}
                                     {savingScheduleItem === item.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                   </div>
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
                                {/* Photos */}
                                {(photoOpen.has(item.id) || item.photos.length > 0) && (
                                  <div className="mt-1.5">
                                    {item.photos.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                                        {item.photos.map(photo => (
                                          <div key={photo.id} className="relative group">
                                            <img
                                              src={`${BASE}${photo.url}`}
                                              alt="Checklist photo"
                                              className="w-16 h-12 object-cover rounded-lg border border-border cursor-pointer"
                                              onClick={() => setLightboxPhoto(`${BASE}${photo.url}`)}
                                            />
                                            {canEdit("jobs") && (
                                              <button
                                                onClick={() => handlePhotoDelete(item.id, photo.id)}
                                                disabled={deletingPhoto === photo.id}
                                                className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center transition-opacity [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100"
                                              >
                                                {deletingPhoto === photo.id
                                                  ? <Loader2 className="w-2 h-2 animate-spin" />
                                                  : <X className="w-2 h-2" />}
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {canEdit("jobs") && (
                                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          className="hidden"
                                          onChange={e => {
                                            const files = e.target.files;
                                            if (files && files.length > 0) handlePhotoUpload(item.id, files);
                                            e.target.value = "";
                                          }}
                                        />
                                        {(uploadingPhotoFor[item.id] ?? 0) > 0
                                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading {uploadingPhotoFor[item.id]}…</>
                                          : <><Camera className="w-3 h-3" /> Add photos</>}
                                      </label>
                                    )}
                                  </div>
                                )}
                                {/* Parts */}
                                {item.parts.length > 0 && (
                                  <div className="mt-1.5 space-y-0.5">
                                    {item.parts.map(part => (
                                      <div key={part.id} className="flex items-center gap-1.5 pl-0.5">
                                        <button
                                          onClick={() => canEdit("jobs") && handleTogglePart(item, part)}
                                          disabled={togglingPart === part.id || !canEdit("jobs")}
                                          className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                                            part.completed
                                              ? "bg-emerald-500 border-emerald-500"
                                              : "border-muted-foreground/30 hover:border-emerald-400"
                                          }`}
                                        >
                                          {togglingPart === part.id
                                            ? <Loader2 className="w-2 h-2 animate-spin text-muted-foreground" />
                                            : part.completed
                                            ? <Check className="w-2 h-2 text-white" />
                                            : null}
                                        </button>
                                        <input
                                          type="text"
                                          value={partLabelDraft[part.id] ?? part.label}
                                          onChange={e => setPartLabelDraft(prev => ({ ...prev, [part.id]: e.target.value }))}
                                          onBlur={() => {
                                            const draft = partLabelDraft[part.id];
                                            if (draft !== undefined && draft !== part.label) {
                                              handleRenamePart(item, part.id, draft.trim() || part.label);
                                            }
                                          }}
                                          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                          readOnly={!canEdit("jobs")}
                                          className={`flex-1 text-[11px] bg-transparent text-foreground min-w-0 focus:outline-none border-b border-transparent focus:border-emerald-400/60 ${
                                            part.completed ? "line-through text-muted-foreground" : ""
                                          } ${canEdit("jobs") ? "hover:border-muted-foreground/20" : ""}`}
                                        />
                                        {canEdit("jobs") && (
                                          <button
                                            onClick={() => handleDeletePart(item, part.id)}
                                            disabled={deletingPart === part.id}
                                            className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
                                          >
                                            {deletingPart === part.id
                                              ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                              : <X className="w-2.5 h-2.5" />}
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                    {canEdit("jobs") && item.parts.length < 5 && (
                                      <button
                                        onClick={() => handleAddPart(item)}
                                        disabled={addingPartTo === item.id}
                                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-600 transition-colors pl-0.5 mt-0.5"
                                      >
                                        {addingPartTo === item.id
                                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                          : <Plus className="w-2.5 h-2.5" />}
                                        Add part
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Note icon + Camera + N/A toggle */}
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
                                {canEdit("jobs") && !item.skipped && (
                                  <button
                                    onClick={() => setPhotoOpen(prev => {
                                      const s = new Set(prev);
                                      if (s.has(item.id)) s.delete(item.id); else s.add(item.id);
                                      return s;
                                    })}
                                    title="Add photo"
                                    className={`w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50 transition-colors mt-0.5 ${item.photos.length > 0 ? "text-emerald-500" : ""}`}
                                  >
                                    {(uploadingPhotoFor[item.id] ?? 0) > 0
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <Camera className="w-3 h-3" />}
                                  </button>
                                )}
                                {canEdit("jobs") && !item.skipped && item.parts.length === 0 && (
                                  <button
                                    onClick={() => handleSplitItem(item)}
                                    disabled={splittingItem === item.id}
                                    title="Split into parts"
                                    className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-muted text-muted-foreground hover:bg-muted/30 transition-colors mt-0.5"
                                  >
                                    {splittingItem === item.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Split"}
                                  </button>
                                )}
                                {canEdit("jobs") && !item.completed && !item.parts.length && (
                                  <button
                                    onClick={() => toggleSkip(item, section.id)}
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

                          {/* Section update thread */}
                          {section.active && (
                            <div className="pt-2 pb-1 space-y-1.5">
                              {(section.noteEntries ?? []).map(entry => (
                                <div key={entry.id} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-amber-900 leading-snug">{entry.note}</p>
                                    <p className="text-[10px] text-amber-600 mt-0.5">{formatDateTime(entry.createdAt)}</p>
                                  </div>
                                  {canEdit("jobs") && (
                                    <button
                                      onClick={() => deleteSectionNote(section.id, entry.id)}
                                      disabled={deletingNote === entry.id}
                                      className="text-amber-400 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                                    >
                                      {deletingNote === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>
                              ))}
                              {canEdit("jobs") && addingNoteFor === section.id ? (
                                <div className="space-y-1">
                                  <textarea
                                    value={noteDraftForSection[section.id] ?? ""}
                                    onChange={e => setNoteDraftForSection(prev => ({ ...prev, [section.id]: e.target.value }))}
                                    placeholder="Update (delay, context, issue)…"
                                    rows={2}
                                    autoFocus
                                    className="w-full text-xs px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-amber-300/40 resize-none"
                                  />
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => addSectionNote(section.id)}
                                      disabled={savingNoteFor === section.id || !(noteDraftForSection[section.id] ?? "").trim()}
                                      className="text-[11px] px-3 py-1 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                    >
                                      {savingNoteFor === section.id ? "Saving…" : "Add"}
                                    </button>
                                    <button
                                      onClick={() => setAddingNoteFor(null)}
                                      className="text-[11px] px-3 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted/30 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : canEdit("jobs") ? (
                                <button
                                  onClick={() => setAddingNoteFor(section.id)}
                                  className="text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1 transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> Add update
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Start-of-Job Photos */}
              <div className="px-5 py-4 border-t border-border/50">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Camera className="w-3 h-3" /> Start-of-Job Photos
                </p>
                {(checklist.startPhotos ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(checklist.startPhotos ?? []).map(photo => (
                      <div key={photo.id} className="relative group flex flex-col items-center gap-0.5">
                        <img
                          src={`${BASE}${photo.url}`}
                          alt="Start photo"
                          className="w-20 h-16 object-cover rounded-lg border border-border cursor-pointer"
                          onClick={() => setLightboxPhoto(`${BASE}${photo.url}`)}
                        />
                        {photo.createdAt && (
                          <span className="text-[9px] text-muted-foreground text-center w-20">{formatDateTime(photo.createdAt)}</span>
                        )}
                        {canEdit("jobs") && (
                          <button
                            onClick={() => handleStartPhotoDelete(photo.id)}
                            disabled={deletingStartPhoto === photo.id}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center transition-opacity [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100"
                          >
                            {deletingStartPhoto === photo.id
                              ? <Loader2 className="w-2 h-2 animate-spin" />
                              : <X className="w-2 h-2" />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit("jobs") && (
                  <div className="space-y-2">
                    <textarea
                      value={startNotesDraft}
                      onChange={e => setStartNotesDraft(e.target.value)}
                      onBlur={saveStartNotes}
                      placeholder="Start-of-job notes (site conditions, access, context)…"
                      rows={2}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                    />
                    {savingStartNotes && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…
                      </p>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => {
                          const files = e.target.files;
                          if (files && files.length > 0) handleStartPhotoUpload(files);
                          e.target.value = "";
                        }}
                      />
                      {uploadingStartPhotos
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                        : <><Camera className="w-3.5 h-3.5" /> Add start-of-job photos</>}
                    </label>
                  </div>
                )}
                {!canEdit("jobs") && checklist.startNotes && (
                  <p className="text-xs text-muted-foreground italic">{checklist.startNotes}</p>
                )}
                {(checklist.startPhotos ?? []).length === 0 && !canEdit("jobs") && !checklist.startNotes && (
                  <p className="text-xs text-muted-foreground italic">No start-of-job photos yet.</p>
                )}
              </div>

              {/* Finished Work Photos */}
              <div className="px-5 py-4 border-t border-border/50">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-3">
                  <Camera className="w-3 h-3" /> Finished Work Photos
                </p>
                {(checklist.finishedPhotos ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(checklist.finishedPhotos ?? []).map(photo => (
                      <div key={photo.id} className="relative group">
                        <img
                          src={`${BASE}${photo.url}`}
                          alt="Finished work photo"
                          className="w-20 h-16 object-cover rounded-lg border border-border cursor-pointer"
                          onClick={() => setLightboxPhoto(`${BASE}${photo.url}`)}
                        />
                        {canEdit("jobs") && (
                          <button
                            onClick={() => handleFinishedPhotoDelete(photo.id)}
                            disabled={deletingFinishedPhoto === photo.id}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center transition-opacity [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100"
                          >
                            {deletingFinishedPhoto === photo.id
                              ? <Loader2 className="w-2 h-2 animate-spin" />
                              : <X className="w-2 h-2" />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* Comments / notes */}
                {canEdit("jobs") && (
                  <div className="mb-3">
                    <textarea
                      value={finishedNotesDraft}
                      onChange={e => setFinishedNotesDraft(e.target.value)}
                      onBlur={saveFinishedNotes}
                      placeholder="Add comments about the finished work…"
                      rows={2}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 resize-none"
                    />
                    {savingFinishedNotes && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…
                      </p>
                    )}
                  </div>
                )}
                {!canEdit("jobs") && checklist.finishedNotes && (
                  <p className="text-xs text-muted-foreground italic mb-3">{checklist.finishedNotes}</p>
                )}
                {(checklist.finishedPhotos ?? []).length === 0 && !canEdit("jobs") && !checklist.finishedNotes && (
                  <p className="text-xs text-muted-foreground italic">No finished work photos yet.</p>
                )}
                {canEdit("jobs") && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = e.target.files;
                        if (files && files.length > 0) handleFinishedPhotoUpload(files);
                        e.target.value = "";
                      }}
                    />
                    {uploadingFinishedPhotos
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                      : <><Camera className="w-3.5 h-3.5" /> Add finished work photos</>}
                  </label>
                )}
              </div>

              {/* Status / delay log */}
              {canEdit("jobs") && (
                <div className="px-5 py-4 border-t border-border/50 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <PauseCircle className="w-3 h-3" /> Job Status
                  </p>
                  {/* Current status badge */}
                  {checklist.statusOverride && (
                    <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span className="text-xs font-semibold text-amber-800">{checklist.statusOverride}</span>
                      <button
                        onClick={() => setChecklistStatus(null)}
                        disabled={settingStatus}
                        className="text-amber-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {/* Quick-tap delay buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_BUTTONS.map(s => (
                      <button
                        key={s}
                        onClick={() => setChecklistStatus(checklist.statusOverride === s ? null : s)}
                        disabled={settingStatus}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors disabled:opacity-60 ${
                          checklist.statusOverride === s
                            ? "bg-amber-500 border-amber-500 text-white"
                            : "border-border text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        {settingStatus && checklist.statusOverride === s ? <Loader2 className="w-3 h-3 animate-spin inline" /> : s}
                      </button>
                    ))}
                  </div>
                  {/* Status log history */}
                  {(checklist.statusLog ?? []).length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pauses &amp; Delays</p>
                      {(checklist.statusLog ?? []).map(entry => (
                        <div key={entry.id} className="bg-muted/20 rounded-xl px-3 py-2">
                          {editingLogEntry === entry.id ? (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-semibold text-muted-foreground">{entry.status}</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="text-[10px] text-muted-foreground">Started</label>
                                  <input
                                    type="datetime-local"
                                    value={logEditDraft[entry.id]?.startedAt ?? ""}
                                    onChange={e => setLogEditDraft(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], startedAt: e.target.value } }))}
                                    className="w-full text-[11px] px-2 py-1 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-muted-foreground">Ended</label>
                                  <input
                                    type="datetime-local"
                                    value={logEditDraft[entry.id]?.endedAt ?? ""}
                                    onChange={e => setLogEditDraft(prev => ({ ...prev, [entry.id]: { ...prev[entry.id], endedAt: e.target.value } }))}
                                    className="w-full text-[11px] px-2 py-1 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => saveLogEntryEdit(entry.id)}
                                  disabled={savingLogEdit === entry.id}
                                  className="text-[11px] px-3 py-1 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 disabled:opacity-50"
                                >
                                  {savingLogEdit === entry.id ? "Saving…" : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingLogEntry(null)}
                                  className="text-[11px] px-3 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted/30"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[11px] font-semibold text-foreground">{entry.status}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                                  {formatDateTime(entry.startedAt)}
                                  {entry.endedAt && ` → ${formatDateTime(entry.endedAt)}`}
                                  {entry.durationMin != null && ` (${entry.durationMin} min)`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  onClick={() => beginLogEdit(entry)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit timestamps"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => deleteLogEntry(entry.id)}
                                  disabled={deletingLogEntry === entry.id}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title="Delete entry"
                                >
                                  {deletingLogEntry === entry.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : <Trash2 className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Meta: publicNotes + save */}
              {canEdit("jobs") && (
                <div className="px-5 py-4 border-t border-border/50 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Share2 className="w-3 h-3" /> Public Status Page
                  </p>
                  <div className="space-y-2">
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

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxPhoto}
            alt="Photo"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
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
