import { useState, useRef, useEffect, Component, type ReactNode } from "react";
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
  Monitor, Tablet, Smartphone, LayoutTemplate, BarChart2, Pencil, Plus, Columns, Undo2, Redo2, Trash2, ChevronUp, ChevronDown,
  Star, HelpCircle, Megaphone, Lock, Layers, LayoutGrid, AlignLeft, Images, Palette,
  ChevronsLeft, ChevronsRight, Maximize2, Minimize2, ChevronRight, FileText, X, Search,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigationBlocker } from "@/contexts/NavigationBlockerContext";
import { useFontLoader, HEADING_FONTS, BODY_FONTS } from "./useFontLoader";
import { SITE_THEMES, HEADING_SCALES, BODY_SIZES, type SiteTheme, applyThemeCssVars } from "./themes";
import { WebsiteAnalytics } from "./WebsiteAnalytics";
import { MediaLibrary } from "./MediaLibrary";
import { HeroSection } from "./sections/HeroSection";
import { ServicesSection } from "./sections/ServicesSection";
import { AboutSection } from "./sections/AboutSection";
import { ContactFormSection } from "./sections/ContactFormSection";
import { FooterSection } from "./sections/FooterSection";
import { PortfolioSection } from "./sections/PortfolioSection";
import { DepositSection } from "./sections/DepositSection";
import { ColumnsSection, defaultColumnsContent, type ColumnsContent } from "./sections/ColumnsSection";
import { TestimonialsSection, defaultTestimonialsContent } from "./sections/TestimonialsSection";
import { FAQSection, defaultFAQContent } from "./sections/FAQSection";
import { CTASection, defaultCTAContent } from "./sections/CTASection";
import { StatsSection, defaultStatsContent } from "./sections/StatsSection";
import { HeaderSection, defaultHeaderContent } from "./sections/HeaderSection";
import { ContentSection, defaultContentSectionData } from "./sections/ContentSection";
import { RowSection, defaultRowSectionData, type RowSectionData } from "./sections/RowSection";
import { ComponentEditorPanel } from "./ComponentEditorPanel";
import { RowEditorPanel } from "./RowEditorPanel";
import { TextSection, defaultTextContent } from "./sections/TextSection";
import { ImageGallerySection, defaultImageGalleryContent } from "./sections/ImageGallerySection";
import { ImageSection, defaultImageContent } from "./sections/ImageSection";
import { type BlockStyle } from "./sections/BlockStyleWrapper";
import { SectionStylePanel } from "./SectionStylePanel";
import { DepositSubmissionsPanel } from "./DepositSubmissionsPanel";
import { type WebsiteTemplate, WEBSITE_TEMPLATES } from "./websiteTemplates";
import { SECTION_TEMPLATES } from "./sectionTemplates";
import { PAGE_TEMPLATES, type PageTemplate } from "./pageTemplates";
import { useEditorHistory } from "./useEditorHistory";
import { EditableWrapper } from "./EditableWrapper";
import { nanoid } from "nanoid";
import type { SiteSettings } from "./website-types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

class WebsiteEditorErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center space-y-4">
          <p className="font-semibold text-destructive text-lg">Website editor failed to load</p>
          <p className="text-sm text-muted-foreground max-w-sm">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Section {
  id: string;
  type: "header" | "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns" | "testimonials" | "faq" | "cta" | "stats" | "content" | "row" | "text" | "gallery" | "image";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
}

export interface SitePage {
  id: string;
  name: string;
  slug: string;
  sections: Section[];
}

export type { SiteSettings } from "./website-types";

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
    onGalleryImageUpload?: (sectionId: string, imageId: string, file: File) => Promise<void>;
    uploadingGalleryImageIds?: Set<string>;
    businessName?: string;
    businessId?: number;
    sectionId?: string;
    siteSlug?: string;
    pages?: Array<{ id: string; name: string; slug: string }>;
    selectedComponentId?: string | null;
    onSelectComponent?: (id: string | null) => void;
    selectedRowColumnId?: string | null;
    selectedRowComponentId?: string | null;
    onSelectRowComponent?: (columnId: string, componentId: string | null) => void;
    onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
  }
) {
  const props = { content: section.content as any, settings, isEditing, onChange: onChange as any, blockStyle: section.blockStyle };
  switch (section.type) {
    case "hero":    return <HeroSection {...props} businessName={extras?.businessName} />;
    case "services": return <ServicesSection {...props} businessName={extras?.businessName} />;
    case "about":   return <AboutSection {...props} onPhotoUpload={extras?.onAboutPhotoUpload} isPhotoUploading={extras?.isAboutPhotoUploading} businessName={extras?.businessName} />;
    case "contact": return <ContactFormSection {...props} businessId={extras?.businessId} />;
    case "footer":  return <FooterSection {...props} onOpenMediaLibrary={extras?.onOpenMediaLibrary} />;
    case "image":   return <ImageSection {...props} onOpenMediaLibrary={extras?.onOpenMediaLibrary} />;
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
    case "testimonials": return <TestimonialsSection {...props} />;
    case "faq": return <FAQSection {...props} />;
    case "cta": return <CTASection {...props} />;
    case "stats": return <StatsSection {...props} />;
    case "text": return <TextSection {...props} />;
    case "gallery": return (
      <ImageGallerySection
        {...props}
        onImageUpload={extras?.onGalleryImageUpload
          ? (imageId, file) => extras.onGalleryImageUpload!(section.id, imageId, file)
          : undefined}
        uploadingImageIds={extras?.uploadingGalleryImageIds}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "header": return <HeaderSection content={section.content as any} settings={settings} isEditing={isEditing} onChange={onChange as any} businessName={extras?.businessName} siteSlug={extras?.siteSlug} pages={extras?.pages} />;
    case "content": return (
      <ContentSection
        {...props}
        selectedComponentId={extras?.selectedComponentId}
        onSelectComponent={extras?.onSelectComponent}
      />
    );
    case "row": return (
      <RowSection
        {...props}
        selectedColumnId={extras?.selectedRowColumnId}
        selectedComponentId={extras?.selectedRowComponentId}
        onSelectRowComponent={extras?.onSelectRowComponent}
      />
    );
    default: return null;
  }
}

const SECTION_LABELS: Record<string, string> = {
  header: "Header",
  hero: "Hero Banner",
  services: "Services",
  about: "About Us",
  contact: "Contact / Quote Form",
  footer: "Footer",
  portfolio: "Portfolio / Gallery",
  deposit: "Pay Deposit",
  columns: "Columns",
  testimonials: "Testimonials",
  faq: "FAQ",
  cta: "CTA Banner",
  stats: "Stats / Numbers",
  content: "Content Block",
  row: "Row",
  text: "Text Block",
  gallery: "Image Gallery",
  image: "Image",
};

const SECTION_TYPE_ICONS: Record<string, React.ReactNode> = {
  header:       <Layers    className="w-3 h-3 flex-shrink-0" />,
  hero:         <Star      className="w-3 h-3 flex-shrink-0" />,
  services:     <LayoutGrid className="w-3 h-3 flex-shrink-0" />,
  about:        <FileText  className="w-3 h-3 flex-shrink-0" />,
  contact:      <AlignLeft className="w-3 h-3 flex-shrink-0" />,
  footer:       <Layers    className="w-3 h-3 flex-shrink-0" />,
  portfolio:    <Images    className="w-3 h-3 flex-shrink-0" />,
  deposit:      <ChevronDown className="w-3 h-3 flex-shrink-0" />,
  columns:      <Columns   className="w-3 h-3 flex-shrink-0" />,
  testimonials: <Star      className="w-3 h-3 flex-shrink-0" />,
  faq:          <HelpCircle className="w-3 h-3 flex-shrink-0" />,
  cta:          <Megaphone className="w-3 h-3 flex-shrink-0" />,
  stats:        <BarChart2 className="w-3 h-3 flex-shrink-0" />,
  content:      <AlignLeft className="w-3 h-3 flex-shrink-0" />,
  row:          <LayoutGrid className="w-3 h-3 flex-shrink-0" />,
  text:         <AlignLeft className="w-3 h-3 flex-shrink-0" />,
  gallery:      <Images    className="w-3 h-3 flex-shrink-0" />,
  image:        <Images    className="w-3 h-3 flex-shrink-0" />,
};

const ADDABLE_SECTION_TYPES: Array<{
  type: Section["type"];
  label: string;
  icon: React.ReactNode;
  allowMultiple?: boolean;
}> = [
  { type: "hero", label: "Hero Banner", icon: <ImagePlus className="w-4 h-4" />, allowMultiple: true },
  { type: "text", label: "Text Block", icon: <AlignLeft className="w-4 h-4" />, allowMultiple: true },
  { type: "gallery", label: "Image Gallery", icon: <Images className="w-4 h-4" />, allowMultiple: true },
  { type: "image",   label: "Image",         icon: <Images className="w-4 h-4" />, allowMultiple: true },
  { type: "testimonials", label: "Testimonials", icon: <Star className="w-4 h-4" />, allowMultiple: true },
  { type: "faq", label: "FAQ", icon: <HelpCircle className="w-4 h-4" />, allowMultiple: true },
  { type: "cta", label: "CTA Banner", icon: <Megaphone className="w-4 h-4" />, allowMultiple: true },
  { type: "stats", label: "Stats / Numbers", icon: <BarChart2 className="w-4 h-4" />, allowMultiple: true },
  { type: "columns", label: "Columns", icon: <Columns className="w-4 h-4" />, allowMultiple: true },
  { type: "content", label: "Content Block", icon: <Layers className="w-4 h-4" />, allowMultiple: true },
  { type: "row", label: "Row", icon: <LayoutGrid className="w-4 h-4" />, allowMultiple: true },
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
      <span className={`flex-1 flex items-center gap-1.5 text-sm font-medium ${section.enabled ? "text-foreground" : "text-muted-foreground"}`}>
        <span className="opacity-50">{SECTION_TYPE_ICONS[section.type] ?? <Layers className="w-3 h-3 flex-shrink-0" />}</span>
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

interface TreeNodeData {
  id: string;
  type: "page" | "section";
  label: string;
  icon: React.ReactNode;
  section?: Section;
  page?: SitePage;
  pageId?: string;
  children: TreeNodeData[];
}

function SiteTreeNode({
  node, depth, expandedIds, onToggleExpand,
  activePageId, activeSection,
  switchPage, editingPageId, setEditingPageId, editingPageName, setEditingPageName,
  renamePage, deletePage, setPageTemplatePickerMode, setShowPageTemplatePicker,
  sensors, handleDragEnd, toggleSection, setActiveSection, sections: activeSections,
  setInsertAfterSectionId, setShowAddSection, showAddSection,
  addSectionTab, setAddSectionTab, addSection, addSectionFromTemplate,
}: {
  node: TreeNodeData; depth: number;
  expandedIds: Set<string>; onToggleExpand: (id: string) => void;
  activePageId: string; activeSection: string | null;
  switchPage: (id: string) => void;
  editingPageId: string | null; setEditingPageId: (id: string | null) => void;
  editingPageName: string; setEditingPageName: (n: string) => void;
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => void;
  setPageTemplatePickerMode: (m: "add" | "apply") => void;
  setShowPageTemplatePicker: (v: boolean) => void;
  sensors: ReturnType<typeof useSensors>;
  handleDragEnd: (e: DragEndEvent) => void;
  toggleSection: (id: string) => void;
  setActiveSection: (id: string | null) => void;
  sections: Section[];
  setInsertAfterSectionId: (id: string | null | undefined) => void;
  setShowAddSection: React.Dispatch<React.SetStateAction<boolean>>;
  showAddSection: boolean;
  addSectionTab: "sections" | "templates";
  setAddSectionTab: (tab: "sections" | "templates") => void;
  addSection: (type: Section["type"]) => void;
  addSectionFromTemplate: (id: string) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isActivePage = node.type === "page" && node.id === activePageId;
  const isActiveSection = node.type === "section" && activeSection === node.id;

  const sharedProps = {
    depth, expandedIds, onToggleExpand, activePageId, activeSection,
    switchPage, editingPageId, setEditingPageId, editingPageName, setEditingPageName,
    renamePage, deletePage, setPageTemplatePickerMode, setShowPageTemplatePicker,
    sensors, handleDragEnd, toggleSection, setActiveSection, sections: activeSections,
    setInsertAfterSectionId, setShowAddSection, showAddSection,
    addSectionTab, setAddSectionTab, addSection, addSectionFromTemplate,
  };

  if (node.type === "section") {
    const parentPageId = node.pageId ?? "";
    if (parentPageId === activePageId) {
      return (
        <div data-section-id={node.id}>
          <SortableRow
            section={node.section!}
            active={isActiveSection}
            onToggle={() => toggleSection(node.id)}
            onActivate={() => setActiveSection(node.id)}
          />
        </div>
      );
    }
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-muted transition-colors opacity-60"
        onClick={() => { switchPage(parentPageId); if (!expandedIds.has(parentPageId)) onToggleExpand(parentPageId); }}
      >
        <span className="opacity-60 flex-shrink-0">{node.icon}</span>
        <span className="flex-1 text-xs font-medium text-foreground">{node.label}</span>
      </div>
    );
  }

  const page = node.page!;
  const lockedHeader = node.id === "home"
    ? (isActivePage ? activeSections : (page.sections ?? [])).find(s => s.type === "header")
    : null;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-1.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isActivePage ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
        }`}
        onClick={() => { switchPage(node.id); if (!expandedIds.has(node.id)) onToggleExpand(node.id); }}
      >
        <button type="button" className="flex-shrink-0 p-0.5 rounded hover:bg-muted-foreground/20 transition-colors"
          onClick={e => { e.stopPropagation(); onToggleExpand(node.id); }}>
          <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
        </button>
        <FileText className="w-3 h-3 flex-shrink-0 opacity-60" />
        {editingPageId === node.id ? (
          <input type="text" value={editingPageName}
            onChange={e => setEditingPageName(e.target.value)}
            onBlur={() => { if (editingPageName.trim()) renamePage(node.id, editingPageName.trim()); setEditingPageId(null); }}
            onKeyDown={e => {
              if (e.key === "Enter") { if (editingPageName.trim()) renamePage(node.id, editingPageName.trim()); setEditingPageId(null); }
              if (e.key === "Escape") setEditingPageId(null);
            }}
            className="flex-1 text-xs bg-transparent border-b border-primary focus:outline-none min-w-0"
            autoFocus onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-xs font-medium truncate">{node.label}</span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button type="button" onClick={e => { e.stopPropagation(); setEditingPageId(node.id); setEditingPageName(node.label); }}
            className="p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground" title="Rename">
            <Pencil className="w-2.5 h-2.5" />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); switchPage(node.id); setPageTemplatePickerMode("apply"); setShowPageTemplatePicker(true); }}
            className="p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground" title="Replace page with template">
            <LayoutTemplate className="w-2.5 h-2.5" />
          </button>
          {node.id !== "home" && (
            <button type="button" onClick={e => { e.stopPropagation(); deletePage(node.id); }}
              className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive" title="Delete page">
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="ml-3 mt-0.5 space-y-0.5">
          {lockedHeader && (
            <div data-section-id={lockedHeader.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                activeSection === lockedHeader.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
              }`}
              onClick={() => setActiveSection(lockedHeader.id)}
            >
              <Lock className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
              <span className="flex-1 text-xs font-medium text-foreground">Header</span>
              <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wide font-medium">Fixed</span>
            </div>
          )}

          {isActivePage ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={node.children.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {node.children.map(child => (
                  <SiteTreeNode key={child.id} node={child} depth={depth + 1} {...sharedProps} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            node.children.map(child => (
              <SiteTreeNode key={child.id} node={child} depth={depth + 1} {...sharedProps} />
            ))
          )}

          {isActivePage && (
            <div className="relative">
              <button type="button"
                onClick={() => { setInsertAfterSectionId(undefined); setShowAddSection(v => !v); }}
                className="flex items-center gap-1 w-full px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Plus className="w-3 h-3" />
                Add Section
              </button>
              {showAddSection && (
                <div className="absolute left-0 top-full mt-1 z-30 w-72 bg-popover border border-border rounded-xl shadow-xl overflow-hidden text-sm">
                  <div className="flex border-b border-border">
                    <button type="button" onClick={() => setAddSectionTab("sections")}
                      className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors ${addSectionTab === "sections" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                      Blank Sections
                    </button>
                    <button type="button" onClick={() => setAddSectionTab("templates")}
                      className={`flex-1 px-3 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${addSectionTab === "templates" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                      <LayoutTemplate className="w-3 h-3" />
                      Templates
                    </button>
                  </div>
                  {addSectionTab === "sections" ? (
                    <div className="py-1 max-h-72 overflow-y-auto">
                      {ADDABLE_SECTION_TYPES.map(opt => (
                        <button key={opt.type} type="button" onClick={() => addSection(opt.type)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors">
                          {opt.icon}{opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-1 max-h-96 overflow-y-auto">
                      {SECTION_TEMPLATES.map(tpl => (
                        <button key={tpl.id} type="button" onClick={() => addSectionFromTemplate(tpl.id)}
                          className="flex items-start gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted transition-colors group">
                          <span className="text-base flex-shrink-0 mt-0.5">{tpl.emoji}</span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{tpl.name}</span>
                            <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5">{tpl.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageTemplatePicker({
  mode,
  currentPageName,
  onSelect,
  onApply,
  onBlank,
  onClose,
}: {
  mode: "add" | "apply";
  currentPageName?: string;
  onSelect: (t: PageTemplate, customName: string) => void;
  onApply: (t: PageTemplate) => void;
  onBlank: () => void;
  onClose: () => void;
}) {
  const [namePrompt, setNamePrompt] = useState<{ template: PageTemplate; name: string } | null>(null);
  const businessTemplates = PAGE_TEMPLATES.filter(t => t.category === "business");
  const pageTemplates = PAGE_TEMPLATES.filter(t => t.category === "page");

  function handleCardClick(t: PageTemplate) {
    if (mode === "apply") {
      onApply(t);
    } else {
      setNamePrompt({ template: t, name: t.name });
    }
  }

  function TemplateCard({ t }: { t: PageTemplate }) {
    const thumb = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t.thumbnailSvg)}`;
    return (
      <button
        onClick={() => handleCardClick(t)}
        className="text-left rounded-xl border-2 border-border hover:border-primary hover:shadow-md transition-all overflow-hidden group"
      >
        <div className="bg-muted/30 border-b border-border flex items-center justify-center py-2 px-3">
          <img src={thumb} alt={`${t.name} layout`} className="w-full max-h-24 object-contain" />
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-lg">{t.emoji}</span>
            <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{t.name}</p>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug mb-2">{t.tagline}</p>
          <div className="flex flex-wrap gap-1">
            {t.sectionSummary.slice(0, 5).map((s, i) => (
              <span key={i} className="inline-flex items-center text-[9px] font-medium bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                {s}
              </span>
            ))}
            {t.sectionSummary.length > 5 && (
              <span className="inline-flex items-center text-[9px] font-medium bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                +{t.sectionSummary.length - 5} more
              </span>
            )}
          </div>
        </div>
      </button>
    );
  }

  // ── Name-prompt step (add mode only) ──────────────────────────────────────
  if (namePrompt) {
    const thumb = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(namePrompt.template.thumbnailSvg)}`;
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-card rounded-2xl border border-border shadow-xl p-6">
          <div className="flex items-start gap-4 mb-5">
            <img src={thumb} alt="layout preview" className="w-16 h-20 object-contain rounded-lg bg-muted/40 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xl">{namePrompt.template.emoji}</span>
                <p className="font-bold text-foreground">{namePrompt.template.name}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{namePrompt.template.tagline}</p>
            </div>
          </div>
          <label className="text-sm font-medium text-foreground block mb-1.5">Name this page</label>
          <input
            value={namePrompt.name}
            onChange={e => setNamePrompt(p => p ? { ...p, name: e.target.value } : p)}
            onKeyDown={e => {
              if (e.key === "Enter" && namePrompt.name.trim()) {
                onSelect(namePrompt.template, namePrompt.name.trim());
                setNamePrompt(null);
              }
              if (e.key === "Escape") setNamePrompt(null);
            }}
            placeholder="e.g. Home, About, Services…"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary bg-background"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => setNamePrompt(null)}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              ← Back
            </button>
            <button
              disabled={!namePrompt.name.trim()}
              onClick={() => { onSelect(namePrompt.template, namePrompt.name.trim()); setNamePrompt(null); }}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Create Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main picker ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center p-6 overflow-y-auto">
      <div className="max-w-4xl w-full pt-8 pb-16">
        <div className="text-center mb-8 relative">
          <button
            onClick={onClose}
            className="absolute right-0 top-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <LayoutTemplate className="w-10 h-10 text-primary mx-auto mb-3" />
          {mode === "apply" ? (
            <>
              <h1 className="text-2xl font-bold text-foreground">Replace "{currentPageName}" with a template</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                The current sections on this page will be replaced. Pick a template to start from.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-foreground">Choose a page template</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Pick a starting point — every section is fully editable after selection.
              </p>
            </>
          )}
        </div>

        {/* Business layouts */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">🏢 Business Layouts</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {businessTemplates.map(t => <TemplateCard key={t.id} t={t} />)}
          </div>
        </div>

        {/* Page type templates */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">📄 Page Types</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {pageTemplates.map(t => <TemplateCard key={t.id} t={t} />)}
          </div>
        </div>

        <div className="text-center space-y-2">
          <button
            onClick={onBlank}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            {mode === "apply" ? "Keep current sections (cancel)" : "Start with a blank page instead"}
          </button>
        </div>
      </div>
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

function WebsiteEditor() {
  const { activeBusiness } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { setBlocker } = useNavigationBlocker();

  const [activeSection, setActiveSection] = useState<string | null>("hero");
  const [localPages, setLocalPages] = useState<SitePage[] | null>(null);
  const [localSettings, setLocalSettings] = useState<SiteSettings | null>(null);
  const [activePageId, setActivePageId] = useState<string>("home");
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState("");
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageName, setNewPageName] = useState("");
  const [newPageSlug, setNewPageSlug] = useState("");
  const [deletePageConfirm, setDeletePageConfirm] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showPublished, setShowPublished] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [aboutPhotoUploading, setAboutPhotoUploading] = useState(false);
  const [uploadingPortfolioPhotoIds, setUploadingPortfolioPhotoIds] = useState<Set<string>>(new Set());
  const [uploadingColumnImageKeys, setUploadingColumnImageKeys] = useState<Set<string>>(new Set());
  const [uploadingGalleryImageIds, setUploadingGalleryImageIds] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [addSectionTab, setAddSectionTab] = useState<"sections" | "templates">("sections");
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const history = useEditorHistory<SitePage, SiteSettings>();
  const pagesRef = useRef<SitePage[]>([]);
  const settingsRef = useRef<SiteSettings>({ brandColor: "#1a1a2e", fontFamily: "Inter", logoUrl: "" });
  const activePageIdRef = useRef<string>("home");
  const textEditSessionRef = useRef<{ active: boolean; timer: ReturnType<typeof setTimeout> | null }>({ active: false, timer: null });
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">(() => {
    return (localStorage.getItem("website-editor-viewport") as "desktop" | "tablet" | "mobile") ?? "desktop";
  });
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [pickerIsReset, setPickerIsReset] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<WebsiteTemplate | null>(null);
  const [showPageTemplatePicker, setShowPageTemplatePicker] = useState(false);
  const [pageTemplatePickerMode, setPageTemplatePickerMode] = useState<"add" | "apply">("add");
  const [pendingApplyPageTemplate, setPendingApplyPageTemplate] = useState<PageTemplate | null>(null);
  const [showApplyPageTemplateConfirm, setShowApplyPageTemplateConfirm] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "analytics" | "media">("editor");
  const [mediaPickerState, setMediaPickerState] = useState<{ onSelect: (url: string) => void } | null>(null);

  function openMediaLibrary(onSelect: (url: string) => void) {
    setMediaPickerState({ onSelect });
  }
  const [insertAfterSectionId, setInsertAfterSectionId] = useState<string | null | undefined>(undefined);
  const [selectedComponentState, setSelectedComponentState] = useState<{ sectionId: string; componentId: string } | null>(null);
  const [selectedRowState, setSelectedRowState] = useState<{ sectionId: string; columnId: string; componentId?: string | null } | null>(null);
  const pickerShownRef = useRef(false);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const pendingFocusFieldRef = useRef<string | null>(null);
  const [bgUploading, setBgUploading] = useState<Record<string, boolean>>({});
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [copiedBlockStyle, setCopiedBlockStyle] = useState<BlockStyle | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem("website-editor-left-collapsed") === "true"
  );
  const [rightCollapsed, setRightCollapsed] = useState(
    () => localStorage.getItem("website-editor-right-collapsed") === "true"
  );
  const [focusMode, setFocusMode] = useState(false);
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const preFocusSidebarState = useRef<{ left: boolean; right: boolean } | null>(null);
  const [expandedPageIds, setExpandedPageIds] = useState<Set<string>>(() => new Set(["home"]));
  const [treeSearch, setTreeSearch] = useState("");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const leftCollapsedRef = useRef(leftCollapsed);
  const rightCollapsedRef = useRef(rightCollapsed);
  const [autoCollapsedRight, setAutoCollapsedRight] = useState(false);
  const autoCollapsedRightRef = useRef(false);
  const editorBodyRef = useRef<HTMLDivElement>(null);

  function changeViewport(v: "desktop" | "tablet" | "mobile") {
    setViewport(v);
    localStorage.setItem("website-editor-viewport", v);
  }

  useEffect(() => {
    localStorage.setItem("website-editor-left-collapsed", String(leftCollapsed));
    leftCollapsedRef.current = leftCollapsed;
  }, [leftCollapsed]);

  useEffect(() => {
    localStorage.setItem("website-editor-right-collapsed", String(rightCollapsed));
    rightCollapsedRef.current = rightCollapsed;
  }, [rightCollapsed]);

  useEffect(() => {
    function checkLayout() {
      // Right sidebar needs ≥200px useful width; at 15% clamp that requires editor ≥ 1333px
      const editorWidth = editorBodyRef.current?.offsetWidth ?? window.innerWidth;
      const isNarrow = editorWidth * 0.15 < 200;
      if (isNarrow && !rightCollapsedRef.current && !autoCollapsedRightRef.current) {
        autoCollapsedRightRef.current = true;
        setAutoCollapsedRight(true);
        setRightCollapsed(true);
      } else if (!isNarrow && autoCollapsedRightRef.current) {
        autoCollapsedRightRef.current = false;
        setAutoCollapsedRight(false);
        setRightCollapsed(false);
      }
    }
    checkLayout();
    const ro = new ResizeObserver(checkLayout);
    if (editorBodyRef.current) ro.observe(editorBodyRef.current);
    window.addEventListener("resize", checkLayout);
    return () => { ro.disconnect(); window.removeEventListener("resize", checkLayout); };
  }, []);

  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataInitializedRef = useRef(false);

  const bizId = activeBusiness?.id;

  useEffect(() => {
    setLocalPages(null);
    setLocalSettings(null);
    setActivePageId("home");
    isDirtyRef.current = false;
    pickerShownRef.current = false;
    dataInitializedRef.current = false;
    history.reset();
    if (textEditSessionRef.current.timer) { clearTimeout(textEditSessionRef.current.timer); }
    textEditSessionRef.current = { active: false, timer: null };
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
  }, [bizId]);

  useEffect(() => {
    setBlocker(() => isDirtyRef.current);
    return () => setBlocker(null);
  }, [setBlocker]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveSection(null);
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
        setFocusMode(prev => {
          if (prev) {
            if (preFocusSidebarState.current) {
              setLeftCollapsed(preFocusSidebarState.current.left);
              setRightCollapsed(preFocusSidebarState.current.right);
              preFocusSidebarState.current = null;
            }
            return false;
          } else {
            preFocusSidebarState.current = { left: leftCollapsedRef.current, right: rightCollapsedRef.current };
            return true;
          }
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!showFullscreenPreview) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowFullscreenPreview(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFullscreenPreview]);

  useEffect(() => {
    if (!activeSection || !sidebarListRef.current) return;
    const el = sidebarListRef.current.querySelector(`[data-section-id="${activeSection}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSection]);

  useEffect(() => {
    if (!activeSection) return;
    const field = pendingFocusFieldRef.current;
    const timer = setTimeout(() => {
      const sectionEl = document.querySelector(`[data-section-canvas-id="${activeSection}"]`);
      if (!sectionEl) return;
      let target: HTMLElement | null = null;
      if (field) {
        target = sectionEl.querySelector(`[data-edit-field="${field}"]`) as HTMLElement | null;
        if (target && !["INPUT", "TEXTAREA"].includes(target.tagName)) target = null;
      }
      if (!target) {
        target = sectionEl.querySelector("input, textarea") as HTMLElement | null;
      }
      if (target) (target as HTMLInputElement).focus();
      pendingFocusFieldRef.current = null;
    }, 30);
    return () => clearTimeout(timer);
  }, [activeSection]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const prev = history.undo({ sections: pagesRef.current, settings: settingsRef.current });
        if (prev) {
          isDirtyRef.current = true;
          setLocalPages(prev.sections);
          setLocalSettings(prev.settings);
        }
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        const next = history.redo({ sections: pagesRef.current, settings: settingsRef.current });
        if (next) {
          isDirtyRef.current = true;
          setLocalPages(next.sections);
          setLocalSettings(next.settings);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Non-ctrl keyboard shortcuts — Delete (active section), Escape (deselect all)
  useEffect(() => {
    function onNavKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) return;
      const tag = (document.activeElement as HTMLElement)?.tagName ?? "";
      const isTyping =
        ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (e.key === "Escape") {
        // Deselect everything — always fires even when typing (mirrors Escape behavior in editors)
        setActiveSection(null);
        setSelectedComponentState(null);
        setSelectedRowState(null);
        return;
      }
      if (isTyping) return;
      if (e.key === "Delete" && activeSection) {
        e.preventDefault();
        handleDeleteSectionClick(activeSection);
      }
    }
    window.addEventListener("keydown", onNavKey);
    return () => window.removeEventListener("keydown", onNavKey);
  }, [activeSection, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * selectSectionAndScroll — sets the active section AND scrolls the canvas
   * to make it visible. Used by the structure tree (tree→canvas sync) and
   * wherever we want bidirectional highlighting.
   */
  function selectSectionAndScroll(id: string | null) {
    setActiveSection(id);
    setSelectedComponentState(null);
    setSelectedRowState(null);
    if (!id) return;
    setTimeout(() => {
      document
        .querySelector(`[data-section-canvas-id="${id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
  }

  const { data: config, isLoading } = useQuery<WebsiteConfig>({
    queryKey: ["website-config", bizId],
    enabled: !!bizId,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website?businessId=${bizId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  useEffect(() => {
    if (!config || dataInitializedRef.current) return;
    dataInitializedRef.current = true;

    const sorted = [...(config.sections as Section[])].sort((a, b) => a.order - b.order);
    let migrated = sorted.map(s => {
      if (s.type === "hero" && !s.blockStyle?.bgType && (s.content as any).bgColor) {
        return { ...s, blockStyle: { ...(s.blockStyle ?? {}), bgType: "color" as const, bgColor: (s.content as any).bgColor } };
      }
      return s;
    });
    if (!migrated.find(s => s.type === "header")) {
      const defHeader: Section = {
        id: "header-" + Math.random().toString(36).slice(2, 9),
        type: "header",
        enabled: true,
        order: -1,
        content: defaultHeaderContent() as unknown as Record<string, unknown>,
      };
      migrated = [defHeader, ...migrated];
      isDirtyRef.current = true;
    }
    const rawSettings = config.settings as SiteSettings & { pages?: SitePage[] };
    const extraPages: SitePage[] = rawSettings.pages ?? [];
    const isNewSite = config.id === null;
    const shouldBootstrapDefaults = isNewSite && extraPages.length === 0;
    const defaultExtraPages: SitePage[] = shouldBootstrapDefaults
      ? [
          { id: "page-about", name: "About", slug: "about", sections: [] },
          { id: "page-services", name: "Services", slug: "services", sections: [] },
          { id: "page-contact", name: "Contact", slug: "contact", sections: [] },
        ]
      : extraPages;
    if (shouldBootstrapDefaults) {
      const siteSlug = activeBusiness?.slug ?? "";
      const defaultNavLinks = defaultExtraPages.map(p => ({
        id: nanoid(), label: p.name, href: `/site/${siteSlug}/${p.slug}`, pageId: p.id,
      }));
      migrated = migrated.map(s => s.type === "header" ? {
        ...s,
        content: { ...s.content, navLinks: [...((s.content.navLinks as any[]) ?? []), ...defaultNavLinks] },
      } : s);
      isDirtyRef.current = true;
    }
    const allPages: SitePage[] = [
      { id: "home", name: "Home", slug: "home", sections: migrated },
      ...defaultExtraPages,
    ];
    setLocalPages(allPages);
    const cleanSettings = { ...rawSettings };
    delete (cleanSettings as any).pages;
    setLocalSettings(cleanSettings as SiteSettings);
    if (isNewSite && !pickerShownRef.current) {
      pickerShownRef.current = true;
      setShowTemplatePicker(true);
      setPickerIsReset(false);
    }
  }, [config]);

  const pages: SitePage[] = localPages ?? (config
    ? [{ id: "home", name: "Home", slug: "home", sections: [...(config.sections as Section[])].sort((a, b) => a.order - b.order) }]
    : [{ id: "home", name: "Home", slug: "home", sections: [] }]);
  const activePage: SitePage = pages.find(p => p.id === activePageId) ?? pages[0] ?? { id: "home", name: "Home", slug: "home", sections: [] };
  const sections: Section[] = activePage.sections;
  const settings: SiteSettings = localSettings ?? config?.settings ?? { brandColor: "#1a1a2e", fontFamily: "Inter", logoUrl: "" };
  pagesRef.current = pages;
  settingsRef.current = settings;
  activePageIdRef.current = activePageId;

  function updatePageSections(newSections: Section[]) {
    setLocalPages(prev =>
      prev ? prev.map(p => p.id === activePageId ? { ...p, sections: newSections } : p) : prev
    );
  }

  useFontLoader(settings.headingFont, settings.bodyFont);

  useEffect(() => {
    applyThemeCssVars(settings.themeId, {
      brandColor: settings.brandColor,
      secondaryColor: settings.secondaryColor,
      accentColor: settings.accentColor,
      bgColor: settings.bgColor,
      surfaceColor: settings.surfaceColor,
      textColor: settings.textColor,
      textMutedColor: settings.textMutedColor,
      headingFont: settings.headingFont,
      bodyFont: settings.bodyFont,
      buttonRadius: settings.buttonRadius,
      buttonFontWeight: settings.buttonFontWeight,
      buttonShadow: settings.buttonShadow,
      cardRadius: settings.cardRadius,
      cardShadow: settings.cardShadow,
      cardBorder: settings.cardBorder,
      inputRadius: settings.inputRadius,
      headingSizeScale: settings.headingSizeScale,
      baseFontSize: settings.baseFontSize,
      headerBgColor: settings.headerBgColor,
      headerTextColor: settings.headerTextColor,
      headerLinkColor: settings.headerLinkColor,
      footerTextColor: settings.footerTextColor,
      footerLinkColor: settings.footerLinkColor,
      focusRingColor: settings.focusRingColor,
    });
    const scale = settings.headingSizeScale ?? (settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId)?.headingSizeScale : undefined);
    const bfSize = settings.baseFontSize ?? (settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId)?.baseFontSize : undefined);
    const hs = scale ? HEADING_SCALES[scale] : undefined;
    const bs = bfSize ? BODY_SIZES[bfSize] : undefined;
    const fr = settings.focusRingColor;
    let el = document.getElementById("__bp-theme-rules") as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = "__bp-theme-rules"; document.head.appendChild(el); }
    let css = "";
    if (hs) css += `h1{font-size:${hs.h1}!important}h2{font-size:${hs.h2}!important}h3{font-size:${hs.h3}!important}`;
    if (bs) css += `body{font-size:${bs}}`;
    if (fr) css += `input:focus,textarea:focus,select:focus{box-shadow:0 0 0 2px ${fr};outline:none}`;
    el.textContent = css;
    return () => { applyThemeCssVars(undefined); document.getElementById("__bp-theme-rules")?.remove(); };
  }, [
    settings.themeId, settings.brandColor, settings.secondaryColor, settings.accentColor,
    settings.bgColor, settings.surfaceColor, settings.textColor, settings.textMutedColor,
    settings.headingFont, settings.bodyFont,
    settings.buttonRadius, settings.buttonFontWeight, settings.buttonShadow,
    settings.cardRadius, settings.cardShadow, settings.cardBorder,
    settings.inputRadius, settings.headingSizeScale, settings.baseFontSize,
    settings.headerBgColor, settings.headerTextColor, settings.headerLinkColor,
    settings.footerTextColor, settings.footerLinkColor, settings.focusRingColor,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const currentPages = pagesRef.current;
      const homePage = currentPages.find(p => p.id === "home") ?? currentPages[0];
      const additionalPages = currentPages.filter(p => p.id !== "home");
      const payload = {
        sections: (homePage?.sections ?? []).map((s, i) => ({ ...s, order: i })),
        settings: {
          ...settingsRef.current,
          ...(additionalPages.length > 0 ? { pages: additionalPages } : {}),
        },
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
      isDirtyRef.current = false;
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
  }, [localPages, localSettings, bizId]);

  async function handlePublish() {
    setPublishing(true);
    try {
      const currentPages = pagesRef.current;
      const homePage = currentPages.find(p => p.id === "home") ?? currentPages[0];
      const additionalPages = currentPages.filter(p => p.id !== "home");
      const payload = {
        sections: (homePage?.sections ?? []).map((s, i) => ({ ...s, order: i })),
        settings: {
          ...settingsRef.current,
          ...(additionalPages.length > 0 ? { pages: additionalPages } : {}),
        },
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
      const nonHeader = sections.filter(s => s.type !== "header");
      const header = sections.find(s => s.type === "header");
      const oldIdx = nonHeader.findIndex(s => s.id === active.id);
      const newIdx = nonHeader.findIndex(s => s.id === over.id);
      history.pushSnapshot({ sections: pagesRef.current, settings });
      isDirtyRef.current = true;
      const reordered = arrayMove(nonHeader, oldIdx, newIdx);
      updatePageSections(header ? [header, ...reordered] : reordered);
    }
  }

  function toggleSection(id: string) {
    const sec = sections.find(s => s.id === id);
    const willHide = sec?.enabled !== false;
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    updatePageSections(sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
    toast({
      title: willHide ? "Section hidden" : "Section shown",
      description: `${SECTION_LABELS[sec?.type ?? ""] ?? "Section"} is now ${willHide ? "hidden from" : "visible on"} your site. Press Ctrl+Z to undo.`,
    });
  }

  function updateContent(id: string, content: Record<string, unknown>) {
    if (!textEditSessionRef.current.active) {
      textEditSessionRef.current.active = true;
      history.pushSnapshot({ sections: pagesRef.current, settings });
    }
    if (textEditSessionRef.current.timer) clearTimeout(textEditSessionRef.current.timer);
    textEditSessionRef.current.timer = setTimeout(() => {
      textEditSessionRef.current.active = false;
      textEditSessionRef.current.timer = null;
    }, 1500);
    isDirtyRef.current = true;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.sections.some(s => s.id === id)) {
          return { ...p, sections: p.sections.map(s => s.id === id ? { ...s, content } : s) };
        }
        return p;
      });
    });
  }

  function updateBlockStyle(id: string, blockStyle: BlockStyle) {
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.sections.some(s => s.id === id)) {
          return { ...p, sections: p.sections.map(s => s.id === id ? { ...s, blockStyle } : s) };
        }
        return p;
      });
    });
  }

  function patchSettings(patch: Partial<SiteSettings>) {
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalSettings({ ...settings, ...patch });
  }

  function applyTheme(theme: SiteTheme) {
    patchSettings({
      themeId: theme.id,
      brandColor: theme.brandColor,
      secondaryColor: theme.secondaryColor,
      accentColor: theme.accentColor,
      bgColor: theme.bgColor,
      surfaceColor: theme.surfaceColor,
      textColor: theme.textColor,
      textMutedColor: theme.textMutedColor,
      headingFont: theme.headingFont,
      bodyFont: theme.bodyFont,
      buttonRadius: theme.buttonRadius,
      buttonFontWeight: theme.buttonFontWeight,
      buttonShadow: theme.buttonShadow,
      cardRadius: theme.cardRadius,
      cardShadow: theme.cardShadow,
      cardBorder: theme.cardBorder,
      inputRadius: theme.inputRadius,
      headingSizeScale: theme.headingSizeScale,
      baseFontSize: theme.baseFontSize,
    });
  }

  function handleUndo() {
    const prev = history.undo({ sections: pagesRef.current, settings });
    if (prev) {
      isDirtyRef.current = true;
      setLocalPages(prev.sections);
      setLocalSettings(prev.settings);
    }
  }

  function handleRedo() {
    const next = history.redo({ sections: pagesRef.current, settings });
    if (next) {
      isDirtyRef.current = true;
      setLocalPages(next.sections);
      setLocalSettings(next.settings);
    }
  }

  function moveSection(id: string, direction: "up" | "down") {
    const enabled = sections.filter(s => s.enabled && s.type !== "header");
    const enabledIdx = enabled.findIndex(s => s.id === id);
    if (direction === "up" && enabledIdx <= 0) return;
    if (direction === "down" && enabledIdx >= enabled.length - 1) return;
    const swapId = enabled[direction === "up" ? enabledIdx - 1 : enabledIdx + 1].id;
    const idxA = sections.findIndex(s => s.id === id);
    const idxB = sections.findIndex(s => s.id === swapId);
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    updatePageSections(arrayMove(sections, idxA, idxB));
  }

  function duplicateSection(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    const idx = sections.indexOf(sec);
    const dup: Section = { ...JSON.parse(JSON.stringify(sec)), id: nanoid() };
    const inserted = [...sections.slice(0, idx + 1), dup, ...sections.slice(idx + 1)];
    const newSections = inserted.map((s, i) => ({ ...s, order: i }));
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    updatePageSections(newSections);
    setActiveSection(dup.id);
    toast({ title: "Section duplicated", description: "Press Ctrl+Z to undo." });
  }

  const CORE_SECTION_TYPES = new Set(["hero", "services", "about", "contact", "footer", "portfolio", "deposit"]);

  function handleDeleteSectionClick(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    if (CORE_SECTION_TYPES.has(sec.type)) {
      setDeleteSectionConfirm(id);
    } else {
      doDeleteSection(id);
    }
  }

  function doDeleteSection(id: string) {
    const sec = sections.find(s => s.id === id);
    const label = SECTION_LABELS[sec?.type ?? ""] ?? "Section";
    const newSections = sections
      .filter(s => s.id !== id)
      .map((s, i) => ({ ...s, order: i }));
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    updatePageSections(newSections);
    setActiveSection(null);
    setDeleteSectionConfirm(null);
    toast({ title: `${label} deleted`, description: "Press Ctrl+Z to undo." });
  }

  async function handleSectionBgUpload(sectionId: string, file: File) {
    setBgUploading(prev => ({ ...prev, [sectionId]: true }));
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
    const pagesAtStart = pagesRef.current;
    history.pushSnapshot({ sections: pagesAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    updatePageSections(sections.map(s =>
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
      updatePageSections(savedSections.map(s =>
        s.id === sectionId
          ? { ...s, blockStyle: { ...(s.blockStyle ?? {}), bgImageUrl: `${canonicalUrl}?v=${Date.now()}` } }
          : s
      ));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Background image uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalPages(pagesAtStart);
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
    const currentPageId = activePageIdRef.current;
    const currentPages = pagesRef.current;
    const allPages = overrideSections
      ? currentPages.map(p => p.id === currentPageId ? { ...p, sections: overrideSections } : p)
      : currentPages;
    const homePage = allPages.find(p => p.id === "home") ?? allPages[0];
    const additionalPages = allPages.filter(p => p.id !== "home");
    const effectiveSettings = overrideSettings ?? settingsRef.current;
    const payload = {
      sections: (homePage?.sections ?? []).map((s, i) => ({ ...s, order: i })),
      settings: {
        ...effectiveSettings,
        ...(additionalPages.length > 0 ? { pages: additionalPages } : {}),
      },
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
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsAtStart });
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
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsAtStart });
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
    const pagesAtStart = pagesRef.current;
    history.pushSnapshot({ sections: pagesAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    updatePageSections(sectionsAtStart.map(s =>
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
      updatePageSections(savedSections.map(s =>
        s.type === "about"
          ? { ...s, content: { ...s.content, photoUrl: `${canonicalUrl}?v=${Date.now()}` } }
          : s
      ));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Photo uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalPages(pagesAtStart);
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
    const pagesAtStart = pagesRef.current;
    history.pushSnapshot({ sections: pagesAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    updatePageSections(patchPortfolioPhoto(sectionsAtStart, projectId, photoId, { photoUrl: blobUrl }));
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
      updatePageSections(patchPortfolioPhoto(savedSections, projectId, photoId, { photoUrl: `${canonicalUrl}?v=${Date.now()}` }));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Photo uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalPages(pagesAtStart);
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
    const pagesAtStart = pagesRef.current;
    history.pushSnapshot({ sections: pagesAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    updatePageSections(sectionsAtStart.map(s =>
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
      updatePageSections(savedSections.map(s =>
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
      setLocalPages(pagesAtStart);
      toast({ title: "Image upload failed", variant: "destructive" });
    } finally {
      setUploadingColumnImageKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleContentComponentImageUpload(file: File): Promise<string> {
    const urlRes = await fetch(`${BASE}/api/website/upload-column-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!urlRes.ok) throw new Error("Failed to get upload URL");
    const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
    const uploadRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!uploadRes.ok) throw new Error("Upload failed");
    const slug = activeBusiness!.slug;
    const imgUuid = objectPath.split("/").pop()!;
    return `${BASE}/api/public/site/${slug}/column-image/${imgUuid}`;
  }

  async function handleGalleryImageUpload(sectionId: string, imageId: string, file: File) {
    setUploadingGalleryImageIds(prev => new Set(prev).add(imageId));
    const blobUrl = URL.createObjectURL(file);
    const sectionsAtStart = sections;
    const settingsAtStart = settings;
    const pagesAtStart = pagesRef.current;
    history.pushSnapshot({ sections: pagesAtStart, settings: settingsAtStart });
    isDirtyRef.current = true;
    updatePageSections(sectionsAtStart.map(s =>
      s.id === sectionId
        ? {
            ...s,
            content: {
              ...s.content,
              images: ((s.content.images as any[]) ?? []).map((img: any) =>
                img.id === imageId ? { ...img, url: blobUrl } : img
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
                images: ((s.content.images as any[]) ?? []).map((img: any) =>
                  img.id === imageId ? { ...img, objectPath, url: canonicalUrl } : img
                ),
              },
            }
          : s
      );
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      await saveNow(settingsAtStart, savedSections);
      URL.revokeObjectURL(blobUrl);
      isDirtyRef.current = false;
      updatePageSections(savedSections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              content: {
                ...s.content,
                images: ((s.content.images as any[]) ?? []).map((img: any) =>
                  img.id === imageId ? { ...img, url: `${canonicalUrl}?v=${Date.now()}` } : img
                ),
              },
            }
          : s
      ));
      qc.invalidateQueries({ queryKey: ["website-config", bizId] });
      toast({ title: "Image uploaded" });
    } catch {
      URL.revokeObjectURL(blobUrl);
      setLocalPages(pagesAtStart);
      toast({ title: "Image upload failed", variant: "destructive" });
    } finally {
      setUploadingGalleryImageIds(prev => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  }

  function addSection(type: Section["type"]) {
    const id = Math.random().toString(36).slice(2, 9);
    let content: Record<string, unknown> = {};
    if (type === "columns") {
      content = defaultColumnsContent() as unknown as Record<string, unknown>;
    } else if (type === "testimonials") {
      content = defaultTestimonialsContent() as unknown as Record<string, unknown>;
    } else if (type === "faq") {
      content = defaultFAQContent() as unknown as Record<string, unknown>;
    } else if (type === "cta") {
      content = defaultCTAContent() as unknown as Record<string, unknown>;
    } else if (type === "stats") {
      content = defaultStatsContent() as unknown as Record<string, unknown>;
    } else if (type === "content") {
      content = defaultContentSectionData() as unknown as Record<string, unknown>;
    } else if (type === "row") {
      content = defaultRowSectionData() as unknown as Record<string, unknown>;
    } else if (type === "text") {
      content = defaultTextContent() as unknown as Record<string, unknown>;
    } else if (type === "gallery") {
      content = defaultImageGalleryContent() as unknown as Record<string, unknown>;
    } else if (type === "image") {
      content = defaultImageContent() as unknown as Record<string, unknown>;
    } else if (type === "hero") {
      content = {
        headline: "Your Page Title",
        subheadline: "A brief description of this page.",
        ctaLabel: "Learn More",
        bgColor: settings.brandColor ?? "#1a1a2e",
      } as Record<string, unknown>;
    }
    const newSection: Section = { id, type, enabled: true, order: sections.length, content };
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    const afterId = insertAfterSectionId;
    if (afterId === null) {
      updatePageSections([newSection, ...sections].map((s, i) => ({ ...s, order: i })));
    } else if (afterId !== undefined) {
      const idx = sections.findIndex(s => s.id === afterId);
      if (idx >= 0) {
        const inserted = [...sections.slice(0, idx + 1), newSection, ...sections.slice(idx + 1)];
        updatePageSections(inserted.map((s, i) => ({ ...s, order: i })));
      } else {
        updatePageSections([...sections, newSection].map((s, i) => ({ ...s, order: i })));
      }
    } else {
      updatePageSections([...sections, newSection].map((s, i) => ({ ...s, order: i })));
    }
    setActiveSection(id);
    setShowAddSection(false);
    setInsertAfterSectionId(undefined);
  }

  function addSectionFromTemplate(templateId: string) {
    const tpl = SECTION_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    const sectionId = Math.random().toString(36).slice(2, 9);
    const newSection: Section = {
      id: sectionId,
      type: "row",
      enabled: true,
      order: sections.length,
      content: tpl.content() as unknown as Record<string, unknown>,
      ...(tpl.blockStyle ? { blockStyle: tpl.blockStyle } : {}),
    };
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    const afterId = insertAfterSectionId;
    if (afterId === null) {
      updatePageSections([newSection, ...sections].map((s, i) => ({ ...s, order: i })));
    } else if (afterId !== undefined) {
      const idx = sections.findIndex(s => s.id === afterId);
      if (idx >= 0) {
        const inserted = [...sections.slice(0, idx + 1), newSection, ...sections.slice(idx + 1)];
        updatePageSections(inserted.map((s, i) => ({ ...s, order: i })));
      } else {
        updatePageSections([...sections, newSection].map((s, i) => ({ ...s, order: i })));
      }
    } else {
      updatePageSections([...sections, newSection].map((s, i) => ({ ...s, order: i })));
    }
    setActiveSection(sectionId);
    setShowAddSection(false);
    setInsertAfterSectionId(undefined);
  }

  function switchPage(pageId: string) {
    if (pageId === activePageId) return;
    setActivePageId(pageId);
    setActiveSection(null);
  }

  function patchHomeHeaderNavLinks(allPages: SitePage[], updater: (links: any[]) => any[]): SitePage[] {
    return allPages.map(p => p.id === "home" ? {
      ...p,
      sections: p.sections.map(s => s.type === "header" ? {
        ...s,
        content: { ...s.content, navLinks: updater((s.content.navLinks as any[]) ?? []) },
      } : s),
    } : p);
  }

  function addPage(name: string, customSlug?: string, prebuiltSections?: Section[]) {
    const slug = (customSlug ?? name).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "page";
    const id = "page-" + Math.random().toString(36).slice(2, 9);
    const newPage: SitePage = { id, name, slug, sections: prebuiltSections ?? [] };
    const siteSlug = activeBusiness?.slug ?? "";
    const newLink = { id: nanoid(), label: name, href: `/site/${siteSlug}/${slug}`, pageId: id };
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalPages(prev => {
      const base = prev ?? pages;
      const withPage = [...base, newPage];
      return patchHomeHeaderNavLinks(withPage, links => [...links, newLink]);
    });
    setActivePageId(id);
    setActiveSection(null);
  }

  function addPageFromTemplate(tpl: PageTemplate, customName?: string) {
    const name = customName?.trim() || tpl.name;
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || tpl.defaultSlug;
    const sections: Section[] = tpl.sections().map((s, i) => ({
      id: "s-" + Math.random().toString(36).slice(2, 9),
      type: s.type,
      enabled: s.enabled,
      order: i,
      content: s.content,
      blockStyle: s.blockStyle as BlockStyle | undefined,
    }));
    addPage(name, slug, sections);
    setShowPageTemplatePicker(false);
  }

  function applyTemplateToCurrentPage(tpl: PageTemplate) {
    const newSections: Section[] = tpl.sections().map((s, i) => ({
      id: "s-" + Math.random().toString(36).slice(2, 9),
      type: s.type,
      enabled: s.enabled,
      order: i,
      content: s.content,
      blockStyle: s.blockStyle as BlockStyle | undefined,
    }));
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalPages(prev => {
      const base = prev ?? pages;
      return base.map(p => p.id === activePageId ? { ...p, sections: newSections } : p);
    });
    setActiveSection(null);
    setShowPageTemplatePicker(false);
    setShowApplyPageTemplateConfirm(false);
    setPendingApplyPageTemplate(null);
  }

  function deletePage(pageId: string) {
    if (pageId === "home") return;
    setDeletePageConfirm(pageId);
  }

  function doDeletePage(pageId: string) {
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalPages(prev => {
      const filtered = (prev ?? pages).filter(p => p.id !== pageId);
      return patchHomeHeaderNavLinks(filtered, links =>
        links.filter(link => (link as any).pageId !== pageId)
      );
    });
    if (activePageId === pageId) {
      setActivePageId("home");
      setActiveSection(null);
    }
    setDeletePageConfirm(null);
  }

  function renamePage(pageId: string, name: string) {
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "page";
    const siteSlug = activeBusiness?.slug ?? "";
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalPages(prev => {
      const updated = (prev ?? pages).map(p => p.id === pageId ? { ...p, name, slug } : p);
      return patchHomeHeaderNavLinks(updated, links =>
        links.map(link =>
          (link as any).pageId === pageId
            ? { ...link, label: name, href: `/site/${siteSlug}/${slug}` }
            : link
        )
      );
    });
  }

  async function handleApplyTemplate(t: WebsiteTemplate, bizInfo?: { phone?: string; email?: string; licenseNumber?: string; name?: string }) {
    history.pushSnapshot({ sections: pagesRef.current, settings });
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
      const templatePayload = {
        sections: appliedSections.map((s, i) => ({ ...s, order: i })),
        settings: savedSettings,
      };
      const templateRes = await fetch(`${BASE}/api/website?businessId=${bizId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(templatePayload),
      });
      if (!templateRes.ok) throw new Error("Failed to apply template");
      setLocalPages([{ id: "home", name: "Home", slug: "home", sections: appliedSections }]);
      setActivePageId("home");
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

  const isPublished = config?.published ?? false;
  const publicUrl = activeBusiness ? `${window.location.origin}${BASE}/site/${activeBusiness.slug}` : "";
  const previewUrl = activeBusiness
    ? isPublished
      ? publicUrl
      : `${window.location.origin}${BASE}/site/${activeBusiness.slug}?draft=1`
    : "";

  function renderSections() {
    const homePageSections = pages.find(p => p.id === "home")?.sections ?? sections;
    const headerSec = homePageSections.find(s => s.type === "header");
    const enabled = sections.filter(s => s.enabled && s.type !== "header");
    const previewBodyStyle = settings.bodyFont
      ? { fontFamily: `'${settings.bodyFont}', system-ui, sans-serif` }
      : undefined;

    const sectionExtras = {
      onAboutPhotoUpload: handleAboutPhotoUpload,
      isAboutPhotoUploading: aboutPhotoUploading,
      onPortfolioPhotoUpload: handlePortfolioPhotoUpload,
      uploadingPortfolioPhotoIds,
      onColumnImageUpload: handleColumnImageUpload,
      uploadingColumnImageKeys,
      onGalleryImageUpload: handleGalleryImageUpload,
      uploadingGalleryImageIds,
      businessName: activeBusiness?.name,
      businessId: activeBusiness?.id,
      siteSlug: activeBusiness?.slug,
      pages: pages.filter(p => p.id !== "home").map(p => ({ id: p.id, name: p.name, slug: p.slug })),
      onOpenMediaLibrary: openMediaLibrary,
    };

    function renderWrapped(s: Section, opts: { isHeader?: boolean; isFirst?: boolean; isLast?: boolean }) {
      const isActive = activeSection === s.id;
      const { isHeader = false, isFirst = false, isLast = false } = opts;
      return (
        <EditableWrapper
          key={s.id}
          id={s.id}
          label={isHeader ? "Header" : SECTION_LABELS[s.type]}
          isSelected={isActive}
          isHidden={!s.enabled}
          isFirst={isFirst}
          isLast={isLast}
          isHeader={isHeader}
          onSelect={e => {
            e.stopPropagation();
            const tgt = e.target as HTMLElement;
            if (tgt.closest("a[href]")) e.preventDefault();
            if (isActive && tgt.closest("input, textarea, select, button, a[href], [role=button]")) return;
            if (!isActive) {
              const fieldEl = tgt.closest("[data-edit-field]") as HTMLElement | null;
              pendingFocusFieldRef.current = fieldEl?.dataset.editField ?? null;
              setActiveSection(s.id);
            }
          }}
          onDuplicate={!isHeader ? () => duplicateSection(s.id) : undefined}
          onToggleHide={!isHeader ? () => toggleSection(s.id) : undefined}
          onDelete={!isHeader ? () => handleDeleteSectionClick(s.id) : undefined}
          onMoveUp={!isHeader ? () => moveSection(s.id, "up") : undefined}
          onMoveDown={!isHeader ? () => moveSection(s.id, "down") : undefined}
          onInsertBelow={!isHeader ? () => { setInsertAfterSectionId(s.id); setShowAddSection(true); } : undefined}
        >
          {renderSection(s, settings, isActive, content => updateContent(s.id, content), {
            ...sectionExtras,
            selectedComponentId: selectedComponentState?.sectionId === s.id ? selectedComponentState.componentId : null,
            onSelectComponent: (id: string | null) => {
              if (id) {
                setSelectedComponentState({ sectionId: s.id, componentId: id });
              } else {
                setSelectedComponentState(null);
              }
            },
            selectedRowColumnId: selectedRowState?.sectionId === s.id ? selectedRowState.columnId : null,
            selectedRowComponentId: selectedRowState?.sectionId === s.id ? (selectedRowState.componentId ?? null) : null,
            onSelectRowComponent: (colId: string, compId: string | null) => {
              setSelectedRowState(compId
                ? { sectionId: s.id, columnId: colId, componentId: compId }
                : { sectionId: s.id, columnId: colId }
              );
            },
          })}
        </EditableWrapper>
      );
    }

    function addBetween(afterSectionId: string | null | undefined, key: string) {
      return (
        <div
          key={key}
          className="group/ins relative h-6 flex items-center justify-center z-20"
          onClick={e => e.stopPropagation()}
        >
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-px bg-primary/0 group-hover/ins:bg-primary/40 transition-colors pointer-events-none" />
          <button
            type="button"
            title="Add section here"
            className="relative z-10 w-5 h-5 rounded-full bg-primary text-primary-foreground shadow-md opacity-0 group-hover/ins:opacity-100 transition-opacity hover:scale-110 flex items-center justify-center"
            onClick={e => {
              e.stopPropagation();
              setInsertAfterSectionId(afterSectionId);
              setShowAddSection(true);
            }}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      );
    }

    return (
      <div style={previewBodyStyle}>
        {settings.headingFont && (
          <style>{`h1,h2,h3,h4,h5,h6{font-family:'${settings.headingFont}',system-ui,sans-serif}`}</style>
        )}
        {headerSec && renderWrapped(headerSec, { isHeader: true })}
        {enabled.length === 0 && !headerSec && (
          <div className="py-20 text-center text-muted-foreground text-sm">
            Enable at least one section to preview your site.
          </div>
        )}
        {enabled.flatMap((s, idx) => [
          addBetween(idx === 0 ? (headerSec ? headerSec.id : null) : enabled[idx - 1]?.id, `ins-${idx}`),
          renderWrapped(s, { isFirst: idx === 0, isLast: idx === enabled.length - 1 }),
        ])}
        {enabled.length > 0 && addBetween(enabled[enabled.length - 1]?.id, "ins-end")}
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

  return (
    <>
    {showPageTemplatePicker && (
      <PageTemplatePicker
        mode={pageTemplatePickerMode}
        currentPageName={pages.find(p => p.id === activePageId)?.name}
        onSelect={addPageFromTemplate}
        onApply={tpl => { setPendingApplyPageTemplate(tpl); setShowApplyPageTemplateConfirm(true); }}
        onBlank={() => { setShowPageTemplatePicker(false); if (pageTemplatePickerMode === "add") setShowAddPage(true); }}
        onClose={() => setShowPageTemplatePicker(false)}
      />
    )}
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
            {pages.length > 1 && " Any additional pages you've added (About, Services, etc.) will be reset to a single Home page."}
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
    <AlertDialog open={!!deletePageConfirm} onOpenChange={v => { if (!v) setDeletePageConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{deletePageConfirm ? pages.find(p => p.id === deletePageConfirm)?.name ?? "Page" : "Page"}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This page and all its sections will be removed. Its nav link will also be removed from the header. You can recover it with Ctrl+Z (undo).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletePageConfirm && doDeletePage(deletePageConfirm)}
          >
            Delete Page
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!deleteSectionConfirm} onOpenChange={v => { if (!v) setDeleteSectionConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{deleteSectionConfirm ? SECTION_LABELS[sections.find(s => s.id === deleteSectionConfirm)?.type ?? ""] ?? "Section" : "Section"}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This section will be removed from your website. You can recover it with Ctrl+Z (undo).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteSectionConfirm && doDeleteSection(deleteSectionConfirm)}
          >
            Delete Section
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={showApplyPageTemplateConfirm} onOpenChange={v => { if (!v) { setShowApplyPageTemplateConfirm(false); setPendingApplyPageTemplate(null); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace page with "{pendingApplyPageTemplate?.name}" template?</AlertDialogTitle>
          <AlertDialogDescription>
            All current sections on "{pages.find(p => p.id === activePageId)?.name}" will be replaced with the template sections. You can undo this with Ctrl+Z.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => pendingApplyPageTemplate && applyTemplateToCurrentPage(pendingApplyPageTemplate)}>
            Replace with Template
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
    {mediaPickerState && bizId && (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
        <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl h-[70vh] flex flex-col overflow-hidden border border-border">
          <MediaLibrary
            businessId={bizId}
            mode="select"
            onSelect={url => { mediaPickerState.onSelect(url); setMediaPickerState(null); }}
            onClose={() => setMediaPickerState(null)}
          />
        </div>
      </div>
    )}
    {showFullscreenPreview && previewUrl && (
      <div className="fixed inset-0 z-[100] flex flex-col bg-black">
        {/* Minimal floating controls */}
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-black/70 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
          <div className="flex items-center rounded-lg overflow-hidden border border-white/20 bg-white/5">
            {([
              { id: "desktop" as const, Icon: Monitor,    label: "Desktop" },
              { id: "tablet"  as const, Icon: Tablet,     label: "Tablet"  },
              { id: "mobile"  as const, Icon: Smartphone, label: "Mobile"  },
            ] as const).map(({ id, Icon, label }) => (
              <button key={id} type="button" onClick={() => setPreviewViewport(id)} title={label}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                  previewViewport === id ? "bg-white text-black font-medium" : "text-white/60 hover:text-white"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowFullscreenPreview(false)} title="Close (Esc)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
        {previewViewport === "desktop" ? (
          <iframe src={previewUrl} className="flex-1 w-full border-0" title="Site preview" />
        ) : (
          <div className="flex-1 flex items-start justify-center overflow-auto py-6 bg-gray-950">
            <div className="relative bg-white shadow-2xl overflow-hidden flex-shrink-0 transition-all duration-300"
              style={{
                width:        previewViewport === "tablet" ? "800px" : "430px",
                height:       previewViewport === "tablet" ? "1024px" : "844px",
                borderRadius: previewViewport === "tablet" ? "16px" : "44px",
                border:       "8px solid #374151",
              }}>
              {previewViewport === "mobile" && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-700 rounded-b-xl z-10 pointer-events-none" />
              )}
              <iframe src={previewUrl} className="w-full h-full border-0" title="Site preview" />
            </div>
          </div>
        )}
      </div>
    )}
    <div className="flex flex-col h-full">
      {/* Top bar — compact single row */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 border-b border-border bg-card h-12">
        {/* Site identity */}
        <Globe className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground truncate max-w-[140px] hidden sm:block">{activeBusiness.name}</span>

        {/* Tab switcher */}
        <div className="flex items-center bg-muted/60 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("editor")}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === "editor" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pencil className="w-3 h-3" />
            <span className="hidden sm:inline">Editor</span>
          </button>
          <button
            onClick={() => setActiveTab("media")}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === "media" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Images className="w-3 h-3" />
            <span className="hidden sm:inline">Media</span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === "analytics" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart2 className="w-3 h-3" />
            <span className="hidden sm:inline">Analytics</span>
          </button>
        </div>

        <div className="flex-1" />

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
              className={`flex items-center px-2 py-1.5 transition-colors ${
                viewport === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/50">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!history.canUndo}
            title="Undo (Ctrl+Z)"
            className={`flex items-center px-2 py-1.5 transition-colors ${!history.canUndo ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted"}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!history.canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className={`flex items-center px-2 py-1.5 transition-colors ${!history.canRedo ? "text-muted-foreground/30 cursor-not-allowed" : "text-foreground hover:bg-muted"}`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Focus mode toggle */}
        <button
          type="button"
          onClick={() => {
            if (focusMode) {
              setFocusMode(false);
              if (preFocusSidebarState.current) {
                setLeftCollapsed(preFocusSidebarState.current.left);
                setRightCollapsed(preFocusSidebarState.current.right);
                preFocusSidebarState.current = null;
              }
            } else {
              preFocusSidebarState.current = { left: leftCollapsed, right: rightCollapsed };
              setFocusMode(true);
            }
          }}
          title={focusMode ? "Exit focus mode (F)" : "Focus mode (F)"}
          className={`flex items-center px-2 py-1.5 rounded-lg border transition-colors ${
            focusMode ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        {/* Preview — full-screen overlay */}
        {previewUrl && (
          <button
            type="button"
            onClick={() => setShowFullscreenPreview(true)}
            title={isPublished ? "Preview live site (full screen)" : "Preview site full screen (draft)"}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isPublished
                ? "border-green-500/40 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{isPublished ? "Live" : "Preview"}</span>
          </button>
        )}
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-60"
        >
          <Save className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Save Draft</span>
        </button>
        <button
          onClick={() => setShowPublishConfirm(true)}
          disabled={publishing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Upload className="w-3.5 h-3.5" />
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      {showPublished && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle className="w-4 h-4" />
          <span>Your website is live at </span>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium break-all">{publicUrl}</a>
        </div>
      )}

      <div ref={editorBodyRef} className="flex-1 flex overflow-hidden">
        {activeTab === "analytics" ? (
          <WebsiteAnalytics businessId={bizId!} />
        ) : activeTab === "media" ? (
          <MediaLibrary businessId={bizId!} />
        ) : (<>
        {/* Left panel — collapsible Site Structure + Brand */}
        {focusMode ? null : (
        <div
          className="flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out"
          style={{ width: leftCollapsed ? '36px' : 'clamp(180px, 15%, 240px)' }}
        >
          {leftCollapsed ? (
            <div className="flex flex-col items-center py-2 gap-3">
              <button
                type="button"
                onClick={() => setLeftCollapsed(false)}
                title="Expand panel"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
              <Layers className="w-4 h-4 text-muted-foreground/40" />
              <Palette className="w-4 h-4 text-muted-foreground/40" />
            </div>
          ) : (<>
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Site Structure</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpandedPageIds(new Set(pages.map(p => p.id)))}
                title="Expand all pages"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setExpandedPageIds(new Set())}
                title="Collapse all pages"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => { setShowAddPage(false); setPageTemplatePickerMode("add"); setShowPageTemplatePicker(true); }}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Add page"
              >
                <Plus className="w-3.5 h-3.5" />
                Page
              </button>
              <button
                type="button"
                onClick={() => setLeftCollapsed(true)}
                title="Collapse panel"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {/* Tree search */}
          <div className="px-2 py-1.5 border-b border-border/50 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search sections…"
                value={treeSearch}
                onChange={e => {
                  setTreeSearch(e.target.value);
                  if (e.target.value) setExpandedPageIds(new Set(pages.map(p => p.id)));
                }}
                className="w-full pl-6 pr-6 py-0.5 text-[11px] border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {treeSearch && (
                <button
                  onClick={() => setTreeSearch("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* Inline add-page form */}
          {showAddPage && (
            <div className="px-3 pt-2 pb-1 border-b border-border space-y-1">
              <input
                type="text"
                placeholder="Page name (e.g. About)"
                value={newPageName}
                onChange={e => {
                  setNewPageName(e.target.value);
                  setNewPageSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && newPageName.trim()) {
                    addPage(newPageName.trim(), newPageSlug.trim() || undefined);
                    setNewPageName(""); setNewPageSlug(""); setShowAddPage(false);
                  }
                  if (e.key === "Escape") { setShowAddPage(false); setNewPageName(""); setNewPageSlug(""); }
                }}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="url-slug"
                  value={newPageSlug}
                  onChange={e => setNewPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newPageName.trim()) {
                      addPage(newPageName.trim(), newPageSlug.trim() || undefined);
                      setNewPageName(""); setNewPageSlug(""); setShowAddPage(false);
                    }
                  }}
                  className="px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Unified tree — pages + their sections */}
          <div ref={sidebarListRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
            {(() => {
              const q = treeSearch.toLowerCase();
              const filteredPages = treeSearch
                ? pages.filter(p =>
                    p.name.toLowerCase().includes(q) ||
                    (p.id === activePageId ? sections : (p.sections ?? [])).some(s =>
                      (SECTION_LABELS[s.type] ?? s.type).toLowerCase().includes(q)))
                : pages;
              const treeData: TreeNodeData[] = filteredPages.map(p => ({
                id: p.id,
                type: "page" as const,
                label: p.name,
                icon: <FileText className="w-3 h-3 flex-shrink-0 opacity-60" />,
                page: p,
                pageId: p.id,
                children: (p.id === activePageId ? sections : (p.sections ?? []))
                  .filter(s => s.type !== "header")
                  .filter(s => !treeSearch || (SECTION_LABELS[s.type] ?? s.type).toLowerCase().includes(q))
                  .map(s => ({
                    id: s.id,
                    type: "section" as const,
                    label: SECTION_LABELS[s.type] ?? s.type,
                    icon: SECTION_TYPE_ICONS[s.type] ?? <Layers className="w-3 h-3 flex-shrink-0" />,
                    section: s,
                    page: p,
                    pageId: p.id,
                    children: [],
                  })),
              }));
              const treeNodeProps = {
                expandedIds: expandedPageIds,
                onToggleExpand: (id: string) => setExpandedPageIds(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                }),
                activePageId,
                activeSection,
                switchPage,
                editingPageId, setEditingPageId, editingPageName, setEditingPageName,
                renamePage, deletePage, setPageTemplatePickerMode, setShowPageTemplatePicker,
                sensors, handleDragEnd, toggleSection, setActiveSection: selectSectionAndScroll, sections,
                setInsertAfterSectionId, setShowAddSection, showAddSection,
                addSectionTab, setAddSectionTab, addSection, addSectionFromTemplate,
              };
              return treeData.map(node => (
                <SiteTreeNode key={node.id} node={node} depth={0} {...treeNodeProps} />
              ));
            })()}
          </div>

          {/* Theme Designer */}
          <div className="border-t border-border">

            {/* Presets */}
            <details className="group" open>
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <Palette className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Theme Presets</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {SITE_THEMES.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => applyTheme(theme)}
                      title={`${theme.name}: ${theme.description}`}
                      className={`rounded-lg overflow-hidden border-2 transition-all text-left ${
                        settings.themeId === theme.id
                          ? "border-primary shadow-sm"
                          : "border-transparent hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="h-7 w-full" style={{ backgroundColor: theme.brandColor }} />
                      <div className="h-1.5 w-full" style={{ backgroundColor: theme.secondaryColor }} />
                      <div className="h-1 w-full" style={{ backgroundColor: theme.accentColor }} />
                      <div className="px-1 py-0.5 bg-muted/40">
                        <p className="text-[9px] font-medium text-foreground truncate">{theme.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {settings.themeId ? (
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    {SITE_THEMES.find(t => t.id === settings.themeId)?.description}
                    {" · "}
                    <button
                      onClick={() => patchSettings({ themeId: undefined })}
                      className="underline hover:text-foreground transition-colors"
                    >
                      Clear
                    </button>
                  </p>
                ) : (
                  <p className="text-[9px] text-muted-foreground">Pick a theme to instantly apply fonts &amp; colors.</p>
                )}
              </div>
            </details>

            {/* Colors */}
            <details className="group border-t border-border" open>
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Colors</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-1.5">
                {([
                  { label: "Primary", key: "brandColor" },
                  { label: "Secondary", key: "secondaryColor" },
                  { label: "Accent", key: "accentColor" },
                  { label: "Background", key: "bgColor" },
                  { label: "Surface", key: "surfaceColor" },
                  { label: "Text", key: "textColor" },
                  { label: "Muted text", key: "textMutedColor" },
                ] as const).map(({ label, key }) => {
                  const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                  const effectiveVal = (settings as Record<string, unknown>)[key] as string | undefined
                    ?? (activeTheme as Record<string, unknown> | undefined)?.[key] as string | undefined
                    ?? "#888888";
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{label}</label>
                      <input
                        type="color"
                        value={effectiveVal}
                        onChange={e => patchSettings({ [key]: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent flex-shrink-0"
                      />
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    const t = settings.themeId ? SITE_THEMES.find(th => th.id === settings.themeId) : undefined;
                    patchSettings({ secondaryColor: t?.secondaryColor, accentColor: t?.accentColor, bgColor: t?.bgColor, surfaceColor: t?.surfaceColor, textColor: t?.textColor, textMutedColor: t?.textMutedColor, ...(t ? { brandColor: t.brandColor } : {}) });
                  }}
                  className="text-[9px] text-muted-foreground hover:text-primary underline transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </details>

            {/* Typography */}
            <details className="group border-t border-border" open>
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Typography</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-2">
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
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Heading Scale</label>
                  <div className="flex gap-1">
                    {(["compact", "regular", "large", "xl"] as const).map(scale => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.headingSizeScale ?? activeTheme?.headingSizeScale ?? "regular";
                      const sizes = HEADING_SCALES[scale];
                      return (
                        <button
                          key={scale}
                          onClick={() => patchSettings({ headingSizeScale: scale })}
                          title={`H1: ${sizes.h1}, H2: ${sizes.h2}, H3: ${sizes.h3}`}
                          className={`flex-1 py-1 text-[10px] rounded capitalize transition-colors ${current === scale ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {scale}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Base Font Size</label>
                  <div className="flex gap-1">
                    {([
                      { label: "Small", value: "sm" as const },
                      { label: "Regular", value: "base" as const },
                      { label: "Large", value: "lg" as const },
                    ]).map(({ label, value }) => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.baseFontSize ?? activeTheme?.baseFontSize ?? "base";
                      return (
                        <button
                          key={value}
                          onClick={() => patchSettings({ baseFontSize: value })}
                          title={`Body: ${BODY_SIZES[value]}`}
                          className={`flex-1 py-1 text-[10px] rounded transition-colors ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const t = settings.themeId ? SITE_THEMES.find(th => th.id === settings.themeId) : undefined;
                    patchSettings({ headingFont: t?.headingFont, bodyFont: t?.bodyFont, headingSizeScale: t?.headingSizeScale, baseFontSize: t?.baseFontSize });
                  }}
                  className="text-[9px] text-muted-foreground hover:text-primary underline transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </details>

            {/* Buttons */}
            <details className="group border-t border-border">
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Buttons</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Shape</label>
                  <div className="flex gap-1">
                    {([
                      { label: "Pill", value: "9999px" },
                      { label: "Round", value: "8px" },
                      { label: "Slight", value: "4px" },
                      { label: "Sharp", value: "0px" },
                    ] as const).map(({ label, value }) => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.buttonRadius ?? activeTheme?.buttonRadius ?? "9999px";
                      return (
                        <button
                          key={value}
                          onClick={() => patchSettings({ buttonRadius: value })}
                          className={`flex-1 py-1 text-[10px] rounded transition-colors ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Weight</label>
                  <div className="flex gap-1">
                    {([
                      { label: "400", value: "400" },
                      { label: "500", value: "500" },
                      { label: "600", value: "600" },
                      { label: "700", value: "700" },
                    ] as const).map(({ label, value }) => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.buttonFontWeight ?? activeTheme?.buttonFontWeight ?? "600";
                      return (
                        <button
                          key={value}
                          onClick={() => patchSettings({ buttonFontWeight: value })}
                          style={{ fontWeight: value as React.CSSProperties["fontWeight"] }}
                          className={`flex-1 py-1 text-[10px] rounded transition-colors ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground">Shadow</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.buttonShadow ?? (settings.themeId ? (SITE_THEMES.find(t => t.id === settings.themeId)?.buttonShadow ?? false) : false)}
                      onChange={e => patchSettings({ buttonShadow: e.target.checked })}
                    />
                    <div className="w-8 h-4 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
                <button
                  onClick={() => {
                    const t = settings.themeId ? SITE_THEMES.find(th => th.id === settings.themeId) : undefined;
                    patchSettings({ buttonRadius: t?.buttonRadius, buttonFontWeight: t?.buttonFontWeight, buttonShadow: t?.buttonShadow });
                  }}
                  className="text-[9px] text-muted-foreground hover:text-primary underline transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </details>

            {/* Cards */}
            <details className="group border-t border-border">
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Cards</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Radius</label>
                  <div className="flex gap-1">
                    {([
                      { label: "Large", value: "16px" },
                      { label: "Med", value: "8px" },
                      { label: "Small", value: "4px" },
                      { label: "None", value: "0px" },
                    ] as const).map(({ label, value }) => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.cardRadius ?? activeTheme?.cardRadius ?? "8px";
                      return (
                        <button
                          key={value}
                          onClick={() => patchSettings({ cardRadius: value })}
                          className={`flex-1 py-1 text-[10px] rounded transition-colors ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Shadow</label>
                  <div className="flex gap-1">
                    {([
                      { label: "None", value: "none" },
                      { label: "Soft", value: "0 1px 4px rgba(0,0,0,0.08)" },
                      { label: "Med", value: "0 4px 12px rgba(0,0,0,0.12)" },
                      { label: "Strong", value: "0 8px 24px rgba(0,0,0,0.18)" },
                    ] as const).map(({ label, value }) => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.cardShadow ?? activeTheme?.cardShadow ?? "none";
                      return (
                        <button
                          key={value}
                          onClick={() => patchSettings({ cardShadow: value })}
                          className={`flex-1 py-1 text-[10px] rounded transition-colors ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground">Border</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.cardBorder ?? (settings.themeId ? (SITE_THEMES.find(t => t.id === settings.themeId)?.cardBorder ?? false) : false)}
                      onChange={e => patchSettings({ cardBorder: e.target.checked })}
                    />
                    <div className="w-8 h-4 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
                <button
                  onClick={() => {
                    const t = settings.themeId ? SITE_THEMES.find(th => th.id === settings.themeId) : undefined;
                    patchSettings({ cardRadius: t?.cardRadius, cardShadow: t?.cardShadow, cardBorder: t?.cardBorder });
                  }}
                  className="text-[9px] text-muted-foreground hover:text-primary underline transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </details>

            {/* Forms */}
            <details className="group border-t border-border">
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Forms</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Input Shape</label>
                  <div className="flex gap-1">
                    {([
                      { label: "Pill", value: "9999px" },
                      { label: "Round", value: "8px" },
                      { label: "Slight", value: "4px" },
                      { label: "Sharp", value: "0px" },
                    ] as const).map(({ label, value }) => {
                      const activeTheme = settings.themeId ? SITE_THEMES.find(t => t.id === settings.themeId) : undefined;
                      const current = settings.inputRadius ?? activeTheme?.inputRadius ?? "8px";
                      return (
                        <button
                          key={value}
                          onClick={() => patchSettings({ inputRadius: value })}
                          className={`flex-1 py-1 text-[10px] rounded transition-colors ${current === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Focus Ring</label>
                  <input
                    type="color"
                    value={settings.focusRingColor ?? settings.brandColor ?? "#2563EB"}
                    onChange={e => patchSettings({ focusRingColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <button
                  onClick={() => {
                    const t = settings.themeId ? SITE_THEMES.find(th => th.id === settings.themeId) : undefined;
                    patchSettings({ inputRadius: t?.inputRadius, focusRingColor: undefined });
                  }}
                  className="text-[9px] text-muted-foreground hover:text-primary underline transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </details>

            {/* Layout */}
            <details className="group border-t border-border">
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Layout</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Header Style</label>
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
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Footer BG</label>
                  <input
                    type="color"
                    value={settings.footerBgColor ?? settings.brandColor}
                    onChange={e => patchSettings({ footerBgColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Footer Text</label>
                  <input
                    type="color"
                    value={settings.footerTextColor ?? "#ffffff"}
                    onChange={e => patchSettings({ footerTextColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Header BG</label>
                  <input
                    type="color"
                    value={settings.headerBgColor ?? settings.bgColor ?? "#ffffff"}
                    onChange={e => patchSettings({ headerBgColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Header Text</label>
                  <input
                    type="color"
                    value={settings.headerTextColor ?? settings.textColor ?? "#111111"}
                    onChange={e => patchSettings({ headerTextColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Header Links</label>
                  <input
                    type="color"
                    value={settings.headerLinkColor ?? settings.textMutedColor ?? "#4b5563"}
                    onChange={e => patchSettings({ headerLinkColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground flex-1">Footer Links</label>
                  <input
                    type="color"
                    value={settings.footerLinkColor ?? "#ffffff"}
                    onChange={e => patchSettings({ footerLinkColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  />
                </div>
                <button
                  onClick={() => patchSettings({ footerBgColor: undefined, footerTextColor: undefined, footerLinkColor: undefined, headerBgColor: undefined, headerTextColor: undefined, headerLinkColor: undefined })}
                  className="text-[9px] text-muted-foreground hover:text-primary underline transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            </details>

            {/* Assets */}
            <details className="group border-t border-border">
              <summary className="list-none flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-muted/50 select-none">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Assets</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground group-open:rotate-90 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-3 pb-3 space-y-3">
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
            </details>

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
        </>
        )}
        </div>
        )}

        {/* Canvas — live preview */}
        <div
          className={`flex-1 overflow-y-auto bg-muted/30 lg:min-w-[70%] ${!focusMode ? "cursor-zoom-in" : ""}`}
          onClick={() => setActiveSection(null)}
          onDoubleClick={e => {
            if (focusMode) return;
            if ((e.target as HTMLElement).closest("[data-section-canvas-id]")) return;
            preFocusSidebarState.current = { left: leftCollapsed, right: rightCollapsed };
            setFocusMode(true);
          }}
        >
          <div className={`mx-auto my-6 transition-all duration-300 ${
            viewport === "desktop" ? "w-full px-6 min-w-[400px]" :
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
        {activeSection && activeTab === "editor" && !focusMode && (() => {
          const sec = sections.find(s => s.id === activeSection);
          if (!sec || sec.type === "header") return null;

          const rightCollapseBtn = (
            <button
              type="button"
              onClick={() => setRightCollapsed(true)}
              title="Collapse panel"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          );

          let panelContent: React.ReactNode;

          if (rightCollapsed) {
            panelContent = (
              <div className="flex flex-col items-center py-2 gap-3">
                <button
                  type="button"
                  onClick={() => { autoCollapsedRightRef.current = false; setAutoCollapsedRight(false); setRightCollapsed(false); }}
                  title={autoCollapsedRight ? "Expand panel (auto-collapsed for canvas space)" : "Expand panel"}
                  className="relative p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronsLeft className="w-4 h-4" />
                  {autoCollapsedRight && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
                <Layers className="w-4 h-4 text-muted-foreground/40" />
              </div>
            );
          } else if (
            sec.type === "content" &&
            selectedComponentState?.sectionId === sec.id
          ) {
            const contentData = sec.content as { components?: Array<{ id: string; type: string; props: Record<string, unknown> }> };
            const selectedComp = contentData.components?.find(c => c.id === selectedComponentState.componentId);
            if (selectedComp) {
              panelContent = (
                <div className="flex flex-col overflow-hidden h-full">
                  <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1">
                      <span>{pages.find(p => p.id === activePageId)?.name ?? "Home"}</span>
                      <ChevronRight className="w-2.5 h-2.5" />
                      <span>{SECTION_LABELS[sec.type] ?? "Section"}</span>
                      <ChevronRight className="w-2.5 h-2.5" />
                      <span className="font-medium text-muted-foreground">Component</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Component</span>
                      {rightCollapseBtn}
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1 min-h-0">
                    <ComponentEditorPanel
                      component={selectedComp as any}
                      onChange={updatedComp => {
                        const newComponents = (contentData.components ?? []).map(c =>
                          c.id === updatedComp.id ? updatedComp : c
                        );
                        updateContent(sec.id, { ...contentData, components: newComponents });
                      }}
                      onImageUpload={handleContentComponentImageUpload}
                      onOpenMediaLibrary={openMediaLibrary}
                    />
                  </div>
                </div>
              );
            }
          } else if (sec.type === "row") {
            const rowData = sec.content as RowSectionData;
            if (selectedRowState?.sectionId === sec.id && selectedRowState.componentId) {
              const selCol = rowData.columns?.find(c => c.id === selectedRowState.columnId);
              const selComp = selCol?.components?.find(c => c.id === selectedRowState.componentId);
              if (selComp) {
                panelContent = (
                  <div className="flex flex-col overflow-hidden h-full">
                    <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1">
                        <span>{pages.find(p => p.id === activePageId)?.name ?? "Home"}</span>
                        <ChevronRight className="w-2.5 h-2.5" />
                        <span>Row</span>
                        <ChevronRight className="w-2.5 h-2.5" />
                        <span className="font-medium text-muted-foreground">Component</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Component</span>
                        {rightCollapseBtn}
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 min-h-0">
                      <ComponentEditorPanel
                        component={selComp as any}
                        onChange={updatedComp => {
                          const newCols = (rowData.columns ?? []).map(col =>
                            col.id === selectedRowState.columnId
                              ? { ...col, components: col.components.map(cp => cp.id === updatedComp.id ? updatedComp : cp) }
                              : col
                          );
                          updateContent(sec.id, { ...rowData, columns: newCols } as unknown as Record<string, unknown>);
                        }}
                        onImageUpload={handleContentComponentImageUpload}
                        onOpenMediaLibrary={openMediaLibrary}
                      />
                    </div>
                  </div>
                );
              }
            }
            if (!panelContent) {
              panelContent = (
                <div className="flex flex-col overflow-hidden h-full">
                  <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1">
                      <span>{pages.find(p => p.id === activePageId)?.name ?? "Home"}</span>
                      <ChevronRight className="w-2.5 h-2.5" />
                      <span className="font-medium text-muted-foreground">Row</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Row</span>
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => duplicateSection(sec.id)} title="Duplicate section" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => handleDeleteSectionClick(sec.id)} title="Delete section (Del)" className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        {rightCollapseBtn}
                      </div>
                    </div>
                  </div>
                  <RowEditorPanel
                    data={rowData}
                    onChange={newData => updateContent(sec.id, newData as unknown as Record<string, unknown>)}
                  />
                  <div className="flex-1 min-h-0">
                    <SectionStylePanel
                      sectionId={sec.id}
                      sectionType="row"
                      blockStyle={sec.blockStyle ?? {}}
                      onChange={bs => updateBlockStyle(sec.id, bs)}
                      onBgImageUpload={file => handleSectionBgUpload(sec.id, file)}
                      isBgUploading={!!bgUploading[sec.id]}
                      onOpenMediaLibrary={openMediaLibrary}
                      copiedStyle={copiedBlockStyle}
                      onCopyStyle={() => setCopiedBlockStyle(sec.blockStyle ?? {})}
                      onPasteStyle={() => {
                        if (copiedBlockStyle) {
                          updateBlockStyle(sec.id, copiedBlockStyle);
                          toast({ title: "Styles pasted", description: "Section styles applied", duration: 2000 });
                        }
                      }}
                    />
                  </div>
                </div>
              );
            }
          }

          if (sec.type === "deposit") {
            panelContent = (
              <div className="flex flex-col overflow-hidden h-full">
                <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1">
                    <span>{pages.find(p => p.id === activePageId)?.name ?? "Home"}</span>
                    <ChevronRight className="w-2.5 h-2.5" />
                    <span className="font-medium text-muted-foreground">Pay Deposit</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      Pay Deposit
                    </span>
                    {rightCollapseBtn}
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0">
                  <DepositSubmissionsPanel businessId={bizId} />
                  <SectionStylePanel
                    sectionId={sec.id}
                    sectionType={sec.type}
                    blockStyle={sec.blockStyle ?? {}}
                    onChange={bs => updateBlockStyle(sec.id, bs)}
                    onBgImageUpload={file => handleSectionBgUpload(sec.id, file)}
                    isBgUploading={!!bgUploading[sec.id]}
                    onOpenMediaLibrary={openMediaLibrary}
                    copiedStyle={copiedBlockStyle}
                    onCopyStyle={() => setCopiedBlockStyle(sec.blockStyle ?? {})}
                    onPasteStyle={() => {
                      if (copiedBlockStyle) {
                        updateBlockStyle(sec.id, copiedBlockStyle);
                        toast({ title: "Styles pasted", description: "Section styles applied", duration: 2000 });
                      }
                    }}
                  />
                </div>
              </div>
            );
          }

          if (!panelContent) {
            panelContent = (
              <div className="flex flex-col overflow-y-auto h-full">
                <div className="px-3 pt-2 pb-1.5 flex-shrink-0 border-b border-border">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50 mb-1">
                    <span>{pages.find(p => p.id === activePageId)?.name ?? "Home"}</span>
                    <ChevronRight className="w-2.5 h-2.5" />
                    <span className="font-medium text-muted-foreground">{SECTION_LABELS[sec.type] ?? "Section"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {SECTION_LABELS[sec.type] ?? "Section"}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleSection(sec.id)}
                        title={sec.enabled ? "Hide section" : "Show section"}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {sec.enabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateSection(sec.id)}
                        title="Duplicate section"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSectionClick(sec.id)}
                        title="Delete section (Del)"
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {rightCollapseBtn}
                    </div>
                  </div>
                </div>
                <SectionStylePanel
                  sectionId={sec.id}
                  sectionType={sec.type}
                  blockStyle={sec.blockStyle ?? {}}
                  onChange={bs => updateBlockStyle(sec.id, bs)}
                  onBgImageUpload={file => handleSectionBgUpload(sec.id, file)}
                  isBgUploading={!!bgUploading[sec.id]}
                  onOpenMediaLibrary={openMediaLibrary}
                  copiedStyle={copiedBlockStyle}
                  onCopyStyle={() => setCopiedBlockStyle(sec.blockStyle ?? {})}
                  onPasteStyle={() => {
                    if (copiedBlockStyle) {
                      updateBlockStyle(sec.id, copiedBlockStyle);
                      toast({ title: "Styles pasted", description: "Section styles applied", duration: 2000 });
                    }
                  }}
                />
              </div>
            );
          }

          return (
            <div
              className="flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden transition-[width] duration-200 ease-in-out"
              style={{ width: rightCollapsed ? '36px' : 'clamp(200px, 15%, 288px)' }}
            >
              {panelContent}
            </div>
          );
        })()}
        </>)}
      </div>
    </div>
    </>
  );
}

export default function WebsiteEditorWithBoundary() {
  return (
    <WebsiteEditorErrorBoundary>
      <WebsiteEditor />
    </WebsiteEditorErrorBoundary>
  );
}
