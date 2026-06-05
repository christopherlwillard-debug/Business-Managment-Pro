import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye, EyeOff, GripVertical, Globe, Save, Upload, CheckCircle, ExternalLink, ImagePlus, Loader2, Link2, Copy, Info,
  Monitor, Tablet, Smartphone, LayoutTemplate, BarChart2, Pencil, Plus, Columns, Undo2, Redo2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { useFontLoader, HEADING_FONTS, BODY_FONTS } from "./useFontLoader";
import { WebsiteAnalytics } from "./WebsiteAnalytics";
import { HeroSection } from "./sections/HeroSection";
import { ServicesSection } from "./sections/ServicesSection";
import { AboutSection } from "./sections/AboutSection";
import { ContactFormSection } from "./sections/ContactFormSection";
import { FooterSection } from "./sections/FooterSection";
import { PortfolioSection } from "./sections/PortfolioSection";
import { DepositSection } from "./sections/DepositSection";
import { ColumnsSection, defaultColumnsContent, type ColumnsContent } from "./sections/ColumnsSection";
import { type BlockStyle } from "./sections/BlockStyleWrapper";
import { SectionStylePanel } from "./SectionStylePanel";
import { type WebsiteTemplate, WEBSITE_TEMPLATES } from "./websiteTemplates";
import { useEditorHistory } from "./useEditorHistory";
import { nanoid } from "nanoid";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Section {
  id: string;
  type: "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
}

export interface SiteSettings {
  brandColor: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily: string;
  headingFont?: string;
  bodyFont?: string;
  logoUrl: string;
  logoObjectPath?: string;
  faviconUrl?: string;
  faviconObjectPath?: string;
  customDomain?: string;
  headerStyle?: "light" | "dark" | "transparent";
  footerBgColor?: string;
}

interface WebsiteConfig {
  id: number | null;
  businessId: number;
  sections: Section[];
  settings: SiteSettings;
  published: boolean;
  publishedAt: string | null;
}

function renderSection(
  section: Section,
  settings: SiteSettings,
  isEditing: boolean,
  onChange: (content: Record<string, unknown>) => void,
  extras?: {
    onAboutPhotoUpload?: (file: File) => Promise<void>;
    isAboutPhotoUploading?: boolean;
    onPortfolioPhotoUpload?: (projectId: string, photoId: string, file: File) => Promise<void>;
    uploadingPortfolioPhotoIds?: Set<string>;
    onColumnImageUpload?: (sectionId: string, colId: string, blockId: string, file: File) => Promise<void>;
    uploadingColumnImageKeys?: Set<string>;
    businessName?: string;
    businessId?: number;
    sectionId?: string;
  }
) {
  const props = { content: section.content as any, settings, isEditing, onChange: onChange as any, blockStyle: section.blockStyle };
  switch (section.type) {
    case "hero":    return <HeroSection {...props} businessName={extras?.businessName} />;
    case "services": return <ServicesSection {...props} businessName={extras?.businessName} />;
    case "about":   return <AboutSection {...props} onPhotoUpload={extras?.onAboutPhotoUpload} isPhotoUploading={extras?.isAboutPhotoUploading} businessName={extras?.businessName} />;
    case "contact": return <ContactFormSection {...props} businessId={extras?.businessId} />;
    case "footer":  return <FooterSection {...props} />;
    case "portfolio": return (
      <PortfolioSection
        {...props}
        onPhotoUpload={extras?.onPortfolioPhotoUpload}
        uploadingPhotoIds={extras?.uploadingPortfolioPhotoIds}
      />
    );
    case "deposit": return <DepositSection {...props} />;
    case "columns": return (
      <ColumnsSection
        {...props}
        onImageUpload={extras?.onColumnImageUpload
          ? (colId, blockId, file) => extras.onColumnImageUpload!(section.id, colId, blockId, file)
          : undefined}
        uploadingImageKeys={extras?.uploadingColumnImageKeys}
      />
    );
    default: return null;
  }
}

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Banner",
  services: "Services",
  about: "About Us",
  contact: "Contact / Quote Form",
  footer: "Footer",
  portfolio: "Portfolio / Gallery",
  deposit: "Pay Deposit",
  columns: "Columns",
};

const ADDABLE_SECTION_TYPES: Array<{
  type: Section["type"];
  label: string;
  icon: React.ReactNode;
  allowMultiple?: boolean;
}> = [
  { type: "columns", label: "Columns", icon: <Columns className="w-4 h-4" />, allowMultiple: true },
];

function SortableRow({
  section,
  active,
  onToggle,
  onActivate,
}: {
  section: Section;
  active: boolean;
  onToggle: () => void;
  onActivate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        active ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
      }`}
      onClick={onActivate}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground" onClick={e => e.stopPropagation()}>
        <GripVertical className="w-4 h-4" />
      </div>
      <span className={`flex-1 text-sm font-medium ${section.enabled ? "text-foreground" : "text-muted-foreground"}`}>
        {SECTION_LABELS[section.type] ?? section.type}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        title={section.enabled ? "Hide section" : "Show section"}
      >
        {section.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  );
}

function CustomDomainPanel({
  customDomain,
  appHost,
  onChange,
  onCopy,
}: {
  customDomain: string;
  appHost: string;
  onChange: (v: string) => void;
  onCopy: (v: string) => void;
}) {
  return (
    <div className="border-t border-border p-3 space-y-2">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        <Link2 className="w-3 h-3" />
        Custom Domain
      </p>
      <input
        type="text"
        placeholder="www.yourdomain.com"
        value={customDomain}
        onChange={e => onChange(e.target.value.trim())}
        className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {customDomain ? (
        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1">
            <Info className="w-3 h-3 flex-shrink-0" />
            DNS Setup Instructions
          </p>
          <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
            Add a <strong>CNAME</strong> record at your domain registrar:
          </p>
          <div className="rounded bg-blue-100 dark:bg-blue-900/40 px-2 py-1 flex items-center justify-between gap-1">
            <span className="text-[10px] font-mono text-blue-900 dark:text-blue-200 break-all">{appHost}</span>
            <button
              type="button"
              onClick={() => onCopy(appHost)}
              className="flex-shrink-0 text-blue-600 hover:text-blue-800 dark:text-blue-400"
              title="Copy"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 leading-relaxed">
            DNS changes can take up to 48 hours to propagate. Save and publish your site first.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Enter a domain to get CNAME setup instructions.
        </p>
      )}
    </div>
  );
}


function TemplatePicker({
  businessName,
  isReset,
  onSelect,
  onScratch,
  applying,
}: {
  businessName: string;
  isReset: boolean;
  onSelect: (t: WebsiteTemplate) => void;
  onScratch: () => void;
  applying: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <LayoutTemplate className="w-10 h-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-foreground">
            {isReset ? "Reset to a template" : "Choose a starter template"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isReset
              ? "This will replace all current content. Pick a template to start fresh."
              : <>Pick a starting point for <strong>{businessName}</strong>'s website. You can customize everything after.</>
            }
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {WEBSITE_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => !applying && onSelect(t)}
              disabled={applying}
              className="text-left rounded-xl border-2 border-border hover:border-primary hover:shadow-md transition-all p-4 group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div
                className="w-full h-20 rounded-lg mb-3 flex flex-col justify-center px-3 py-2"
                style={{ backgroundColor: t.brandColor }}
              >
                <p className="text-white font-bold text-[11px] leading-snug line-clamp-2">
                  {(t.sections.find(s => s.type === "hero")?.content?.headline as string) ?? t.name}
                </p>
                <div className="mt-1.5 w-8 h-0.5 bg-white/40 rounded-full" />
              </div>
              <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.description}</p>
            </button>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={onScratch}
            disabled={applying}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-60"
          >
            {isReset ? "Cancel — keep current content" : "Start from scratch with generic defaults"}
          </button>
        </div>

        {applying && (
          <div className="flex items-center justify-center gap-2 mt-6 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Applying template…
          </div>
        )}
      </div>
    </div>
  );
}

export default function WebsiteEditor() {
  const { activeBusiness } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeSection, setActiveSection] = useState<string | null>("hero");
  const [localSections, setLocalSections] = useState<Section[] | null>(null);
  const [localSettings, setLocalSettings] = useState<SiteSettings | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showPublished, setShowPublished] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [aboutPhotoUploading, setAboutPhotoUploading] = useState(false);
  const [uploadingPortfolioPhotoIds, setUploadingPortfolioPhotoIds] = useState<Set<string>>(new Set());
  const [uploadingColumnImageKeys, setUploadingColumnImageKeys] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const history = useEditorHistory<Section, SiteSettings>();
  const sectionsRef = useRef<Section[]>([]);
  const settingsRef = useRef<SiteSettings>({ brandColor: "#1a1a2e", fontFamily: "Inter", logoUrl: "" });
  const textEditSessionRef = useRef<{ active: boolean; timer: ReturnType<typeof setTimeout> | null }>({ active: false, timer: null });
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">(() => {
    return (localStorage.getItem("website-editor-viewport") as "desktop" | "tablet" | "mobile") ?? "desktop";
  });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [pickerIsReset, setPickerIsReset] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<WebsiteTemplate | null>(null);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "analytics">("editor");
  const pickerShownRef = useRef(false);
  const [bgUploading, setBgUploading] = useState<Record<string, boolean>>({});
  const [faviconUploading, setFaviconUploading] = useState(false);

  function changeViewport(v: "desktop" | "tablet" | "mobile") {
    setViewport(v);
    localStorage.setItem("website-editor-viewport", v);
  }
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bizId = activeBusiness?.id;

  useEffect(() => {
    setLocalSections(null);
    setLocalSettings(null);
    isDirtyRef.current = false;
    pickerShownRef.current = false;
    history.reset();
    if (textEditSessionRef.current.timer) { clearTimeout(textEditSessionRef.current.timer); }
    textEditSessionRef.current = { active: false, timer: null };
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
  }, [bizId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveSection(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const prev = history.undo({ sections: sectionsRef.current, settings: settingsRef.current });
        if (prev) {
          isDirtyRef.current = true;
          setLocalSections(prev.sections);
          setLocalSettings(prev.settings);
        }
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        const next = history.redo({ sections: sectionsRef.current, settings: settingsRef.current });
        if (next) {
          isDirtyRef.current = true;
          setLocalSections(next.sections);
          setLocalSettings(next.settings);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: config, isLoading } = useQuery<WebsiteConfig>({
    queryKey: ["website-config", bizId],
    enabled: !!bizId,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website?businessId=${bizId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    onSuccess: (data) => {
      const sorted = [...(data.sections as Section[])].sort((a, b) => a.order - b.order);
      const migrated = sorted.map(s => {
        if (s.type === "hero" && !s.blockStyle?.bgType && (s.content as any).bgColor) {
          return { ...s, blockStyle: { ...(s.blockStyle ?? {}), bgType: "color" as const, bgColor: (s.content as any).bgColor } };
        }
        return s;
      });
      setLocalSections(migrated);
      setLocalSettings(data.settings as SiteSettings);
      if (data.id === null && !pickerShownRef.current) {
        pickerShownRef.current = true;
        setShowTemplatePicker(true);
        setPickerIsReset(false);
      }
    },
  } as any);

  const sections: Section[] = localSections ?? (config ? [...(config.sections as Section[])].sort((a, b) => a.order - b.order) : []);
  const settings: SiteSettings = localSettings ?? config?.settings ?? { brandColor: "#1a1a2e", fontFamily: "Inter", logoUrl: "" };
  sectionsRef.current = sections;
  settingsRef.current = settings;

  useFontLoader(settings.headingFont, settings.bodyFont);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sections: sections.map((s, i) => ({ ...s, order: i })),
        settings,
      };
      const res = await fetch(`${BASE}/api/website?businessId=${bizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Draft saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  useEffect(() => {
    if (!isDirtyRef.current) return;
    if (!bizId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate();
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [localSections, localSettings, bizId]);

  async function handlePublish() {
    setPublishing(true);
    try {
      const payload = {
        sections: sections.map((s, i) => ({ ...s, order: i })),
        settings,
      };
      const res = await fetch(`${BASE}/api/website/publish?businessId=${bizId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Publish failed");
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      setShowPublished(true);
      setTimeout(() => setShowPublished(false), 5000);
      toast({ title: "Website published!" });
    } catch {
      toast({ title: "Publish failed", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = sections.findIndex(s => s.id === active.id);
      const newIdx = sections.findIndex(s => s.id === over.id);
      history.pushSnapshot({ sections, settings });
      isDirtyRef.current = true;
      setLocalSections(arrayMove(sections, oldIdx, newIdx));
    }
  }

  function toggleSection(id: string) {
    history.pushSnapshot({ sections, settings });
    isDirtyRef.current = true;
    setLocalSections(sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  function updateContent(id: string, content: Record<string, unknown>) {
    if (!textEditSessionRef.current.active) {
      textEditSessionRef.current.active = true;
      history.pushSnapshot({ sections, settings });
    }
    if (textEditSessionRef.current.timer) clearTimeout(textEditSessionRef.current.timer);
    textEditSessionRef.current.timer = setTimeout(() => {
      textEditSessionRef.current.active = false;
      textEditSessionRef.current.timer = null;
    }, 1500);
    isDirtyRef.current = true;
    setLocalSections(sections.map(s => s.id === id ? { ...s, content } : s));
  }

  function updateBlockStyle(id: string, blockStyle: BlockStyle) {
    history.pushSnapshot({ sections, settings });
    isDirtyRef.current = true;
    setLocalSections(sections.map(s => s.id === id ? { ...s, blockStyle } : s));
  }

  function patchSettings(patch: Partial<SiteSettings>) {
    history.pushSnapshot({ sections, settings });
    isDirtyRef.current = true;
    setLocalSettings({ ...settings, ...patch });
  }

  function handleUndo() {
    const prev = history.undo({ sections, settings });
    if (prev) {
      isDirtyRef.current = true;
      setLocalSections(prev.sections);
      setLocalSettings(prev.settings);
    }
  }

  function handleRedo() {
    const next = history.redo({ sections, settings });
    if (next) {
      isDirtyRef.current = true;
      setLocalSections(next.sections);
      setLocalSettings(next.settings);
    }
  }

  function duplicateSection(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    const idx = sections.indexOf(sec);
    const dup: Section = { ...JSON.parse(JSON.stringify(sec)), id: nanoid() };
    const inserted = [...sections.slice(0, idx + 1), dup, ...sections.slice(idx + 1)];
    const newSections = inserted.map((s, i) => ({ ...s, order: i }));
    history.pushSnapshot({ sections, settings });
    isDirtyRef.current = true;
    setLocalSections(newSections);
    setActiveSection(dup.id);
  }

  async function handleSectionBgUpload(sectionId: string, file: File) {
    setBgUploading(prev => ({ ...prev, [sectionId]: true }));
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
    history.pushSnapshot({ sections: sectionsAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    setLocalSections(sections.map(s =>
      s.id === sectionId ? { ...s, blockStyle: { ...(s.blockStyle ?? {}), bgImageUrl: blobUrl, bgType: "image" as const } } : s
    ));
    try {
      const urlRes = await fetch(`${BASE}/api/website/upload-section-bg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const slug = activeBusiness!.slug;
      const bgUuid = objectPath.split("/").pop()!;
      const canonicalUrl = `${BASE}/api/public/site/${slug}/section-bg/${bgUuid}`;
      const savedSections = sectionsAtStart.map(s =>
        s.id === sectionId
          ? { ...s, blockStyle: { ...(s.blockStyle ?? {}), bgImageObjectPath: objectPath, bgImageUrl: canonicalUrl, bgType: "image" as const } }
          : s
      );
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(settingsAtStart, savedSections);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      setLocalSections(savedSections.map(s =>
        s.id === sectionId
          ? { ...s, blockStyle: { ...(s.blockStyle ?? {}), bgImageUrl: `${canonicalUrl}?v=${Date.now()}` } }
          : s
      ));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Background image uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalSections(sectionsAtStart);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setBgUploading(prev => {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      });
    }
  }

  async function saveNow(overrideSettings?: SiteSettings, overrideSections?: Section[]) {
    const payload = {
      sections: (overrideSections ?? sections).map((s, i) => ({ ...s, order: i })),
      settings: overrideSettings ?? settings,
    };
    const res = await fetch(`${BASE}/api/website?businessId=${bizId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Save failed");
    return res.json();
  }

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    const blobUrl = URL.createObjectURL(file);
    const settingsAtStart = settings;
    history.pushSnapshot({ sections, settings: settingsAtStart });
    isDirtyRef.current = true;
    setLocalSettings({ ...settingsAtStart, logoUrl: blobUrl } as SiteSettings);
    try {
      const urlRes = await fetch(`${BASE}/api/website/upload-logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const slug = activeBusiness!.slug;
      const canonicalUrl = `${BASE}/api/public/site/${slug}/logo`;
      const savedSettings = { ...settingsAtStart, logoObjectPath: objectPath, logoUrl: canonicalUrl } as SiteSettings & { logoObjectPath: string };
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(savedSettings);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      setLocalSettings({ ...savedSettings, logoUrl: `${canonicalUrl}?v=${Date.now()}` } as SiteSettings);
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Logo uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalSettings(settingsAtStart);
      toast({ title: "Logo upload failed", variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleFaviconUpload(file: File) {
    setFaviconUploading(true);
    const blobUrl = URL.createObjectURL(file);
    const settingsAtStart = settings;
    history.pushSnapshot({ sections, settings: settingsAtStart });
    isDirtyRef.current = true;
    setLocalSettings({ ...settingsAtStart, faviconUrl: blobUrl });
    try {
      const urlRes = await fetch(`${BASE}/api/website/upload-favicon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const slug = activeBusiness!.slug;
      const canonicalUrl = `${BASE}/api/public/site/${slug}/favicon`;
      const savedSettings = { ...settingsAtStart, faviconObjectPath: objectPath, faviconUrl: canonicalUrl };
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(savedSettings);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      setLocalSettings({ ...savedSettings, faviconUrl: `${canonicalUrl}?v=${Date.now()}` });
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Favicon uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalSettings(settingsAtStart);
      toast({ title: "Favicon upload failed", variant: "destructive" });
    } finally {
      setFaviconUploading(false);
    }
  }

  async function handleAboutPhotoUpload(file: File) {
    setAboutPhotoUploading(true);
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
    history.pushSnapshot({ sections: sectionsAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    setLocalSections(sectionsAtStart.map(s =>
      s.type === "about" ? { ...s, content: { ...s.content, photoUrl: blobUrl } } : s
    ));
    try {
      const urlRes = await fetch(`${BASE}/api/website/upload-about-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const slug = activeBusiness!.slug;
      const canonicalUrl = `${BASE}/api/public/site/${slug}/about-photo`;
      const savedSections = sectionsAtStart.map(s =>
        s.type === "about"
          ? { ...s, content: { ...s.content, photoObjectPath: objectPath, photoUrl: canonicalUrl } }
          : s
      );
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(settingsAtStart, savedSections);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      setLocalSections(savedSections.map(s =>
        s.type === "about"
          ? { ...s, content: { ...s.content, photoUrl: `${canonicalUrl}?v=${Date.now()}` } }
          : s
      ));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Photo uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalSections(sectionsAtStart);
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setAboutPhotoUploading(false);
    }
  }

  function patchPortfolioPhoto(
    sectionList: Section[],
    projectId: string,
    photoId: string,
    patch: Record<string, unknown>
  ): Section[] {
    return sectionList.map(s =>
      s.type === "portfolio"
        ? {
            ...s,
            content: {
              ...s.content,
              projects: ((s.content.projects as any[]) ?? []).map((proj: any) =>
                proj.id === projectId
                  ? {
                      ...proj,
                      photos: (proj.photos ?? []).map((p: any) =>
                        p.id === photoId ? { ...p, ...patch } : p
                      ),
                    }
                  : proj
              ),
            },
          }
        : s
    );
  }

  async function handlePortfolioPhotoUpload(projectId: string, photoId: string, file: File) {
    setUploadingPortfolioPhotoIds(prev => new Set(prev).add(photoId));
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
    history.pushSnapshot({ sections: sectionsAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    setLocalSections(patchPortfolioPhoto(sectionsAtStart, projectId, photoId, { photoUrl: blobUrl }));
    try {
      const urlRes = await fetch(`${BASE}/api/website/upload-portfolio-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const slug = activeBusiness!.slug;
      const photoUuid = objectPath.split("/").pop()!;
      const canonicalUrl = `${BASE}/api/public/site/${slug}/portfolio-photo/${photoUuid}`;
      const savedSections = patchPortfolioPhoto(sectionsAtStart, projectId, photoId, { photoObjectPath: objectPath, photoUrl: canonicalUrl });
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(settingsAtStart, savedSections);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      setLocalSections(patchPortfolioPhoto(savedSections, projectId, photoId, { photoUrl: `${canonicalUrl}?v=${Date.now()}` }));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Photo uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalSections(sectionsAtStart);
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setUploadingPortfolioPhotoIds(prev => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  }

  async function handleColumnImageUpload(sectionId: string, colId: string, blockId: string, file: File) {
    const key = `${colId}:${blockId}`;
    setUploadingColumnImageKeys(prev => new Set(prev).add(key));
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
    history.pushSnapshot({ sections: sectionsAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    setLocalSections(sectionsAtStart.map(s =>
      s.id === sectionId
        ? {
            ...s,
            content: {
              ...s.content,
              columns: ((s.content.columns as any[]) ?? []).map((col: any) =>
                col.id === colId
                  ? { ...col, blocks: (col.blocks ?? []).map((b: any) => b.id === blockId ? { ...b, url: blobUrl } : b) }
                  : col
              ),
            },
          }
        : s
    ));
    try {
      const urlRes = await fetch(`${BASE}/api/website/upload-column-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const slug = activeBusiness!.slug;
      const imgUuid = objectPath.split("/").pop()!;
      const canonicalUrl = `${BASE}/api/public/site/${slug}/column-image/${imgUuid}`;
      const savedSections = sectionsAtStart.map(s =>
        s.id === sectionId
          ? {
              ...s,
              content: {
                ...s.content,
                columns: ((s.content.columns as any[]) ?? []).map((col: any) =>
                  col.id === colId
                    ? {
                        ...col,
                        blocks: (col.blocks ?? []).map((b: any) =>
                          b.id === blockId ? { ...b, objectPath, url: canonicalUrl } : b
                        ),
                      }
                    : col
                ),
              },
            }
          : s
      );
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(settingsAtStart, savedSections);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      setLocalSections(savedSections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              content: {
                ...s.content,
                columns: ((s.content.columns as any[]) ?? []).map((col: any) =>
                  col.id === colId
                    ? {
                        ...col,
                        blocks: (col.blocks ?? []).map((b: any) =>
                          b.id === blockId ? { ...b, url: `${canonicalUrl}?v=${Date.now()}` } : b
                        ),
                      }
                    : col
                ),
              },
            }
          : s
      ));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Image uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalSections(sectionsAtStart);
      toast({ title: "Image upload failed", variant: "destructive" });
    } finally {
      setUploadingColumnImageKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function addSection(type: Section["type"]) {
    const id = Math.random().toString(36).slice(2, 9);
    let content: Record<string, unknown> = {};
    if (type === "columns") {
      content = defaultColumnsContent() as unknown as Record<string, unknown>;
    }
    const newSection: Section = { id, type, enabled: true, order: sections.length, content };
    history.pushSnapshot({ sections, settings });
    isDirtyRef.current = true;
    setLocalSections([...sections, newSection]);
    setActiveSection(id);
    setShowAddSection(false);
  }

  async function handleApplyTemplate(t: WebsiteTemplate, bizInfo?: { phone?: string; email?: string; licenseNumber?: string; name?: string }) {
    history.pushSnapshot({ sections, settings });
    setApplyingTemplate(true);
    try {
      const appliedSections = t.sections.map(s => {
        if (s.type === "footer" && bizInfo) {
          return { ...s, content: { ...s.content, phone: bizInfo.phone ?? "", email: bizInfo.email ?? "", licenseNumber: bizInfo.licenseNumber ?? "", copyright: `© ${new Date().getFullYear()} ${bizInfo.name ?? ""}. All rights reserved.` } };
        }
        return { ...s };
      });
      const savedSettings: SiteSettings = {
        ...t.settings,
        logoUrl: settings.logoUrl || "",
        ...(settings.logoObjectPath ? { logoObjectPath: settings.logoObjectPath } : {}),
        ...(settings.faviconUrl ? { faviconUrl: settings.faviconUrl } : {}),
        ...(settings.faviconObjectPath ? { faviconObjectPath: settings.faviconObjectPath } : {}),
        ...(settings.customDomain ? { customDomain: settings.customDomain } : {}),
      };
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(savedSettings, appliedSections);
      setLocalSections(appliedSections);
      setLocalSettings(savedSettings);
      isDirtyRef.current = false;
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      setShowTemplatePicker(false);
      setShowApplyConfirm(false);
      setPendingTemplate(null);
      toast({ title: `"${t.name}" template applied` });
    } catch {
      toast({ title: "Failed to apply template", variant: "destructive" });
    } finally {
      setApplyingTemplate(false);
    }
  }

  function openResetPicker() {
    setPickerIsReset(true);
    setShowTemplatePicker(true);
  }

  function handleTemplatePickerSelect(t: WebsiteTemplate) {
    if (pickerIsReset) {
      setPendingTemplate(t);
      setShowApplyConfirm(true);
    } else {
      handleApplyTemplate(t, activeBusiness ? { phone: (activeBusiness as any).phone, email: (activeBusiness as any).email, licenseNumber: (activeBusiness as any).licenseNumber, name: activeBusiness.name } : undefined);
    }
  }

  const publicUrl = activeBusiness ? `${window.location.origin}${BASE}/site/${activeBusiness.slug}` : "";

  function renderSections() {
    const enabled = sections.filter(s => s.enabled);
    if (enabled.length === 0) {
      return (
        <div className="py-20 text-center text-muted-foreground text-sm">
          Enable at least one section to preview your site.
        </div>
      );
    }
    const previewBodyStyle = settings.bodyFont
      ? { fontFamily: `'${settings.bodyFont}', system-ui, sans-serif` }
      : undefined;
    return (
      <div style={previewBodyStyle}>
        {settings.headingFont && (
          <style>{`h1,h2,h3,h4,h5,h6{font-family:'${settings.headingFont}',system-ui,sans-serif}`}</style>
        )}
        {enabled.map(s => (
          <div
            key={s.id}
            onClick={(e) => { e.stopPropagation(); setActiveSection(s.id); }}
            className={`relative transition-all cursor-pointer ${
              activeSection === s.id
                ? "ring-2 ring-inset ring-primary/60"
                : "hover:ring-2 hover:ring-inset hover:ring-muted-foreground/20"
            }`}
          >
            {activeSection === s.id && (
              <div className="absolute top-1 left-1 z-10 flex items-center gap-1.5">
                <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded">
                  {SECTION_LABELS[s.type]}
                </span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); duplicateSection(s.id); }}
                  title="Duplicate section"
                  className="flex items-center gap-1 bg-primary/90 text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded hover:bg-primary transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
              </div>
            )}
            {renderSection(s, settings, activeSection === s.id, (content) => updateContent(s.id, content), {
              onAboutPhotoUpload: handleAboutPhotoUpload,
              isAboutPhotoUploading: aboutPhotoUploading,
              onPortfolioPhotoUpload: handlePortfolioPhotoUpload,
              uploadingPortfolioPhotoIds,
              onColumnImageUpload: handleColumnImageUpload,
              uploadingColumnImageKeys,
              businessName: activeBusiness?.name,
              businessId: activeBusiness?.id,
            })}
          </div>
        ))}
      </div>
    );
  }

  if (!activeBusiness) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Select a business to edit its website.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isPublished = config?.published ?? false;

  return (
    <>
    {showTemplatePicker && (
      <TemplatePicker
        businessName={activeBusiness?.name ?? "your business"}
        isReset={pickerIsReset}
        onSelect={handleTemplatePickerSelect}
        onScratch={() => setShowTemplatePicker(false)}
        applying={applyingTemplate}
      />
    )}
    <AlertDialog open={showApplyConfirm} onOpenChange={v => { if (!v && !applyingTemplate) { setShowApplyConfirm(false); setPendingTemplate(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply "{pendingTemplate?.name}" template?</AlertDialogTitle>
          <AlertDialogDescription>
            This will replace your current copy, service items, and brand color with the template defaults. Your uploaded logo, about photo, and portfolio photos will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={applyingTemplate}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={applyingTemplate}
            onClick={() => pendingTemplate && handleApplyTemplate(pendingTemplate, activeBusiness ? { phone: (activeBusiness as any).phone, email: (activeBusiness as any).email, licenseNumber: (activeBusiness as any).licenseNumber, name: activeBusiness.name } : undefined)}
          >
            {applyingTemplate ? "Applying…" : "Apply Template"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish Website?</AlertDialogTitle>
          <AlertDialogDescription>
            Your site will be publicly visible at{" "}
            <span className="font-medium text-foreground break-all">{publicUrl}</span>
            . Anyone with the link will be able to see it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setShowPublishConfirm(false); handlePublish(); }}>
            Publish Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Website Editor
          </h1>
          <p className="text-xs text-muted-foreground">{activeBusiness.name}</p>
          <div className="flex items-center bg-muted/60 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => setActiveTab("editor")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === "editor"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="w-3 h-3" />
              Editor
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeTab === "analytics"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              Analytics
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Undo / Redo */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/50">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!history.canUndo}
              title="Undo (Ctrl+Z)"
              className={`flex items-center px-2.5 py-1.5 transition-colors ${!history.canUndo ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted"}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={!history.canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className={`flex items-center px-2.5 py-1.5 transition-colors ${!history.canRedo ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted"}`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Viewport toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/50">
            {([ 
              { id: "desktop", Icon: Monitor, label: "Desktop" },
              { id: "tablet",  Icon: Tablet,  label: "Tablet"  },
              { id: "mobile",  Icon: Smartphone, label: "Mobile" },
            ] as const).map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => changeViewport(id)}
                title={label}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewport === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>

          {isPublished && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Live
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            Save Draft
          </button>
          <button
            onClick={() => setShowPublishConfirm(true)}
            disabled={publishing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {showPublished && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle className="w-4 h-4" />
          <span>Your website is live at </span>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium break-all">{publicUrl}</a>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {activeTab === "analytics" ? (
          <WebsiteAnalytics businessId={bizId!} />
        ) : (<>
        {/* Left panel — section list */}
        <div className="w-56 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-y-auto">
          <div className="px-3 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sections</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddSection(v => !v)}
                  title="Add section"
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
                {showAddSection && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-popover border border-border rounded-lg shadow-lg py-1 text-sm">
                    {ADDABLE_SECTION_TYPES.map(opt => (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => addSection(opt.type)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Drag to reorder</p>
          </div>
          <div className="p-2 space-y-0.5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {sections.map(s => (
                  <SortableRow
                    key={s.id}
                    section={s}
                    active={activeSection === s.id}
                    onToggle={() => toggleSection(s.id)}
                    onActivate={() => setActiveSection(s.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Brand settings */}
          <div className="border-t border-border p-3 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Brand</p>

            {/* Colors */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Colors</p>
              {([
                { label: "Primary", key: "brandColor" },
                { label: "Secondary", key: "secondaryColor" },
                { label: "Accent", key: "accentColor" },
              ] as const).map(({ label, key }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground flex-1">{label}</label>
                  <input
                    type="color"
                    value={(settings as Record<string, string>)[key] ?? "#888888"}
                    onChange={e => patchSettings({ [key]: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
              ))}
            </div>

            {/* Fonts */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fonts</p>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Headings</label>
                <select
                  value={settings.headingFont ?? "Inter"}
                  onChange={e => patchSettings({ headingFont: e.target.value })}
                  className="w-full text-xs border border-border rounded px-1.5 py-1 bg-background"
                >
                  {HEADING_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Body text</label>
                <select
                  value={settings.bodyFont ?? "Inter"}
                  onChange={e => patchSettings({ bodyFont: e.target.value })}
                  className="w-full text-xs border border-border rounded px-1.5 py-1 bg-background"
                >
                  {BODY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            {/* Header style */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Header Style</p>
              <div className="flex gap-1">
                {(["light", "dark", "transparent"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => patchSettings({ headerStyle: s })}
                    className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                      (settings.headerStyle ?? "light") === s
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer background color */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex-1">Footer BG</label>
              <input
                type="color"
                value={settings.footerBgColor ?? settings.brandColor}
                onChange={e => patchSettings({ footerBgColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
              />
            </div>

            {/* Logo */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Logo</label>
              {settings.logoUrl && (
                <img src={settings.logoUrl} alt="Logo preview" className="w-full h-10 object-contain rounded border border-border mb-1 bg-muted/30" />
              )}
              <label className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted ${logoUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {logoUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                {logoUploading ? "Uploading…" : settings.logoUrl ? "Replace Logo" : "Upload Logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={logoUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
                />
              </label>
            </div>

            {/* Favicon */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Favicon</label>
              {settings.faviconUrl && (
                <img src={settings.faviconUrl} alt="Favicon" className="w-8 h-8 object-contain rounded border border-border mb-1 bg-muted/30" />
              )}
              <label className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted ${faviconUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {faviconUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                {faviconUploading ? "Uploading…" : settings.faviconUrl ? "Replace Favicon" : "Upload Favicon"}
                <input
                  type="file"
                  accept="image/png,image/x-icon,image/svg+xml,image/jpeg"
                  className="sr-only"
                  disabled={faviconUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFaviconUpload(f); e.target.value = ""; }}
                />
              </label>
            </div>
          </div>

          {/* Apply template */}
          <div className="border-t border-border p-3">
            <button
              onClick={openResetPicker}
              className="flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <LayoutTemplate className="w-3 h-3" />
              Apply Template…
            </button>
          </div>

          {/* Custom domain settings */}
          <CustomDomainPanel
            customDomain={settings.customDomain ?? ""}
            appHost={window.location.host}
            onChange={domain => patchSettings({ customDomain: domain })}
            onCopy={text => { navigator.clipboard.writeText(text).then(() => toast({ title: "Copied!" })); }}
          />
        </div>

        {/* Canvas — live preview */}
        <div className="flex-1 overflow-y-auto bg-muted/30" onClick={() => setActiveSection(null)}>
          <div className={`mx-auto my-6 transition-all duration-300 ${
            viewport === "desktop" ? "max-w-4xl px-4" :
            viewport === "tablet" ? "max-w-[800px] px-4" :
            "max-w-[430px] px-3"
          }`}>
            {viewport === "mobile" ? (
              /* Phone chrome */
              <div className="bg-gray-800 rounded-[3rem] p-[10px] shadow-2xl border border-gray-700">
                {/* Notch bar */}
                <div className="flex items-center justify-center h-6 mb-1">
                  <div className="w-20 h-1.5 bg-gray-600 rounded-full" />
                </div>
                <div className="rounded-[2.4rem] overflow-hidden bg-white dark:bg-gray-900 shadow-inner">
                  {renderSections()}
                </div>
                {/* Home indicator */}
                <div className="flex items-center justify-center h-6 mt-1">
                  <div className="w-24 h-1 bg-gray-600 rounded-full" />
                </div>
              </div>
            ) : viewport === "tablet" ? (
              /* Tablet chrome */
              <div className="bg-gray-800 rounded-2xl p-2.5 shadow-xl border border-gray-700">
                <div className="flex items-center justify-center h-4 mb-1">
                  <div className="w-10 h-1 bg-gray-600 rounded-full" />
                </div>
                <div className="rounded-xl overflow-hidden bg-white dark:bg-gray-900">
                  {renderSections()}
                </div>
                <div className="flex items-center justify-center h-4 mt-1">
                  <div className="w-10 h-1 bg-gray-600 rounded-full" />
                </div>
              </div>
            ) : (
              /* Desktop — existing card */
              <div className="bg-white dark:bg-gray-900 shadow-lg rounded-xl overflow-hidden">
                {renderSections()}
              </div>
            )}
          </div>
        </div>
        {activeSection && activeTab === "editor" && (() => {
          const sec = sections.find(s => s.id === activeSection);
          return sec ? (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card overflow-y-auto">
              <SectionStylePanel
                sectionId={sec.id}
                sectionType={sec.type}
                blockStyle={sec.blockStyle ?? {}}
                onChange={bs => updateBlockStyle(sec.id, bs)}
                onBgImageUpload={file => handleSectionBgUpload(sec.id, file)}
                isBgUploading={!!bgUploading[sec.id]}
              />
            </div>
          ) : null;
        })()}
        </>)}
      </div>
    </div>
    </>
  );
}
