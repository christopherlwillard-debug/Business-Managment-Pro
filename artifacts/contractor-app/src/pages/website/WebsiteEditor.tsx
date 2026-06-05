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
  Monitor, Tablet, Smartphone, LayoutTemplate, BarChart2, Pencil,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { WebsiteAnalytics } from "./WebsiteAnalytics";
import { HeroSection } from "./sections/HeroSection";
import { ServicesSection } from "./sections/ServicesSection";
import { AboutSection } from "./sections/AboutSection";
import { ContactFormSection } from "./sections/ContactFormSection";
import { FooterSection } from "./sections/FooterSection";
import { PortfolioSection } from "./sections/PortfolioSection";
import { DepositSection } from "./sections/DepositSection";
import { type BlockStyle } from "./sections/BlockStyleWrapper";
import { SectionStylePanel } from "./SectionStylePanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Section {
  id: string;
  type: "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
}

interface SiteSettings {
  brandColor: string;
  fontFamily: string;
  logoUrl: string;
  logoObjectPath?: string;
  customDomain?: string;
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
    businessName?: string;
  }
) {
  const props = { content: section.content as any, settings, isEditing, onChange: onChange as any, blockStyle: section.blockStyle };
  switch (section.type) {
    case "hero":    return <HeroSection {...props} businessName={extras?.businessName} />;
    case "services": return <ServicesSection {...props} businessName={extras?.businessName} />;
    case "about":   return <AboutSection {...props} onPhotoUpload={extras?.onAboutPhotoUpload} isPhotoUploading={extras?.isAboutPhotoUploading} businessName={extras?.businessName} />;
    case "contact": return <ContactFormSection {...props} />;
    case "footer":  return <FooterSection {...props} />;
    case "portfolio": return (
      <PortfolioSection
        {...props}
        onPhotoUpload={extras?.onPortfolioPhotoUpload}
        uploadingPhotoIds={extras?.uploadingPortfolioPhotoIds}
      />
    );
    case "deposit": return <DepositSection {...props} />;
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
};

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

interface WebsiteTemplate {
  id: string;
  name: string;
  description: string;
  brandColor: string;
  settings: SiteSettings;
  sections: Section[];
}

const WEBSITE_TEMPLATES: WebsiteTemplate[] = [
  {
    id: "general-contracting",
    name: "General Contracting",
    description: "Construction, renovation & site work",
    brandColor: "#1e3a5f",
    settings: { brandColor: "#1e3a5f", fontFamily: "Inter", logoUrl: "" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Built Right, Built to Last", subheadline: "Full-service general contracting for residential and commercial projects.", ctaLabel: "Get a Free Quote", bgColor: "#1e3a5f" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "Our Services", items: [
        { id: "s1", title: "New Construction", description: "From ground-up homes to commercial build-outs — we handle every phase." },
        { id: "s2", title: "Renovations & Remodels", description: "Kitchen, bath, basement, or full home renovations done on time and on budget." },
        { id: "s3", title: "Site Preparation", description: "Land clearing, grading, drainage, and excavation before the first nail is driven." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "About Our Company", body: "We are a licensed, insured general contracting firm with deep roots in this community. Our crew brings decades of hands-on experience to every job — big or small. We treat your project like it's our own, with the craftsmanship and communication you deserve.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Request a Free Quote", subheading: "Tell us about your project and we'll follow up within one business day.", serviceTypes: ["New Construction", "Renovation / Remodel", "Site Preparation", "Repairs", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Our Work", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
  {
    id: "asphalt-sealing",
    name: "Asphalt & Sealing",
    description: "Paving, sealcoating & striping",
    brandColor: "#1a1a1a",
    settings: { brandColor: "#1a1a1a", fontFamily: "Inter", logoUrl: "" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Smooth Roads. Lasting Results.", subheadline: "Professional asphalt paving, sealcoating, and crack repair for driveways and parking lots.", ctaLabel: "Get a Free Estimate", bgColor: "#1a1a1a" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "What We Do", items: [
        { id: "s1", title: "Asphalt Paving", description: "New asphalt for driveways, parking lots, and roadways — hot-mix applied and compacted to spec." },
        { id: "s2", title: "Sealcoating", description: "Protect pavement from UV, oil, and water. Extends asphalt life by years at a fraction of replacement cost." },
        { id: "s3", title: "Crack Repair & Striping", description: "Hot-pour crack filler and fresh line striping to keep your lot safe, compliant, and looking sharp." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "About Us", body: "We've been sealing and paving in this area for years. Our equipment is commercial-grade, our materials are top quality, and every crew member is trained to deliver results you'll be proud of. No shortcuts — just honest work at a fair price.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Get Your Free Estimate", subheading: "Send us your location and what you need — we get back to you fast.", serviceTypes: ["Asphalt Paving", "Sealcoating", "Crack Repair", "Striping", "Parking Lot Maintenance", "Other"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Recent Projects", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
  {
    id: "property-management",
    name: "Property Management",
    description: "Maintenance, inspections & tenant services",
    brandColor: "#1b4332",
    settings: { brandColor: "#1b4332", fontFamily: "Inter", logoUrl: "" },
    sections: [
      { id: "hero", type: "hero", enabled: true, order: 0, content: { headline: "Property Care You Can Count On", subheadline: "Professional maintenance and management services — keeping your investment protected and your tenants happy.", ctaLabel: "Contact Us Today", bgColor: "#1b4332" } },
      { id: "services", type: "services", enabled: true, order: 1, content: { heading: "Our Services", items: [
        { id: "s1", title: "Routine Maintenance", description: "Scheduled inspections, HVAC servicing, plumbing checks, and landscaping to protect your property year-round." },
        { id: "s2", title: "Tenant Services", description: "Fast response to maintenance requests, move-in/move-out inspections, and 24/7 emergency contact." },
        { id: "s3", title: "Repairs & Renovation", description: "From small fixes to full unit turns, we handle the work so you don't have to." },
      ] } },
      { id: "about", type: "about", enabled: true, order: 2, content: { heading: "Who We Are", body: "We manage residential and light commercial properties with a hands-on approach. Our team handles everything from routine upkeep to emergency repairs, so property owners stay hands-off while their investment stays protected.", photoUrl: "" } },
      { id: "contact", type: "contact", enabled: true, order: 3, content: { heading: "Get In Touch", subheading: "Whether you're a property owner or a tenant, we're here to help.", serviceTypes: ["Property Management", "Maintenance Request", "Repair Request", "General Inquiry"] } },
      { id: "portfolio", type: "portfolio", enabled: true, order: 4, content: { heading: "Properties We Manage", projects: [] } },
      { id: "footer", type: "footer", enabled: true, order: 5, content: { phone: "", email: "", licenseNumber: "", copyright: "" } },
    ],
  },
];

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
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
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
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
  }, [bizId]);

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
      setLocalSections(sorted);
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
      isDirtyRef.current = true;
      setLocalSections(arrayMove(sections, oldIdx, newIdx));
    }
  }

  function toggleSection(id: string) {
    isDirtyRef.current = true;
    setLocalSections(sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  function updateContent(id: string, content: Record<string, unknown>) {
    isDirtyRef.current = true;
    setLocalSections(sections.map(s => s.id === id ? { ...s, content } : s));
  }

  function updateBlockStyle(id: string, blockStyle: BlockStyle) {
    isDirtyRef.current = true;
    setLocalSections(sections.map(s => s.id === id ? { ...s, blockStyle } : s));
  }

  async function handleSectionBgUpload(sectionId: string, file: File) {
    setBgUploading(prev => ({ ...prev, [sectionId]: true }));
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
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

  async function handleAboutPhotoUpload(file: File) {
    setAboutPhotoUploading(true);
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
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

  async function handleApplyTemplate(t: WebsiteTemplate, bizInfo?: { phone?: string; email?: string; licenseNumber?: string; name?: string }) {
    setApplyingTemplate(true);
    try {
      const existingAbout = sections.find(s => s.type === "about");
      const existingPortfolio = sections.find(s => s.type === "portfolio");

      const appliedSections = t.sections.map(s => {
        if (s.type === "footer" && bizInfo) {
          return { ...s, content: { ...s.content, phone: bizInfo.phone ?? "", email: bizInfo.email ?? "", licenseNumber: bizInfo.licenseNumber ?? "", copyright: `© ${new Date().getFullYear()} ${bizInfo.name ?? ""}. All rights reserved.` } };
        }
        if (s.type === "about" && existingAbout) {
          return { ...s, content: { ...s.content, photoUrl: (existingAbout.content.photoUrl as string) ?? "", photoObjectPath: (existingAbout.content.photoObjectPath as string | undefined) } };
        }
        if (s.type === "portfolio" && existingPortfolio) {
          return { ...s, content: { ...s.content, projects: existingPortfolio.content.projects ?? [] } };
        }
        return s;
      });
      const savedSettings: SiteSettings = {
        ...t.settings,
        logoUrl: settings.logoUrl || "",
        ...(settings.logoObjectPath ? { logoObjectPath: settings.logoObjectPath } : {}),
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
    return (
      <>
        {enabled.map(s => (
          <div
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`relative transition-all cursor-pointer ${
              activeSection === s.id
                ? "ring-2 ring-inset ring-primary/60"
                : "hover:ring-2 hover:ring-inset hover:ring-muted-foreground/20"
            }`}
          >
            {activeSection === s.id && (
              <div className="absolute top-1 left-1 z-10 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded pointer-events-none">
                {SECTION_LABELS[s.type]}
              </div>
            )}
            {renderSection(s, settings, activeSection === s.id, (content) => updateContent(s.id, content), {
              onAboutPhotoUpload: handleAboutPhotoUpload,
              isAboutPhotoUploading: aboutPhotoUploading,
              onPortfolioPhotoUpload: handlePortfolioPhotoUpload,
              uploadingPortfolioPhotoIds,
              businessName: activeBusiness?.name,
            })}
          </div>
        ))}
      </>
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
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Sections</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Drag to reorder</p>
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
          <div className="mt-auto border-t border-border p-3 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Brand</p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex-1">Color</label>
              <input
                type="color"
                value={settings.brandColor}
                onChange={e => { isDirtyRef.current = true; setLocalSettings({ ...settings, brandColor: e.target.value }); }}
                className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
              />
            </div>
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
            onChange={domain => { isDirtyRef.current = true; setLocalSettings({ ...settings, customDomain: domain }); }}
            onCopy={text => { navigator.clipboard.writeText(text).then(() => toast({ title: "Copied!" })); }}
          />
        </div>

        {/* Canvas — live preview */}
        <div className="flex-1 overflow-y-auto bg-muted/30">
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
