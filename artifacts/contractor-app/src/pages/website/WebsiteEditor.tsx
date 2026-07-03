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
  Star, HelpCircle, Megaphone, Lock, Layers, LayoutGrid, AlignLeft, Images, Palette, Briefcase,
  ChevronsLeft, ChevronsRight, Maximize2, Minimize2, ChevronRight, FileText, X, Search,
  Users, Handshake, MapPin, Award, ArrowLeftRight, ThumbsUp,
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
import { ContentSection, defaultContentSectionData, type SiteComponent, type ComponentType, type SiteComponentProps, defaultPropsForType } from "./sections/ContentSection";
import { RowSection, defaultRowSectionData, type RowSectionData, type RowColumn } from "./sections/RowSection";
import { CanvasContextMenu, type ContextMenuGroup } from "./CanvasContextMenu";
import {
  buildSectionActions, buildComponentActions, buildColumnActions,
  type SectionActionParams, type ComponentActionParams, type ColumnActionParams,
} from "./actionRegistry";
import { ComponentEditorPanel } from "./ComponentEditorPanel";
import { RowEditorPanel } from "./RowEditorPanel";
import { TextSection, defaultTextContent } from "./sections/TextSection";
import { ImageGallerySection, defaultImageGalleryContent } from "./sections/ImageGallerySection";
import { ImageSection, defaultImageContent } from "./sections/ImageSection";
import { FeaturedClientsSection, defaultFeaturedClientsContent } from "./sections/FeaturedClientsSection";
import { PartnersSection, defaultPartnersContent } from "./sections/PartnersSection";
import { ServiceAreaSection, defaultServiceAreaContent } from "./sections/ServiceAreaSection";
import { CertificationsSection, defaultCertificationsContent } from "./sections/CertificationsSection";
import { BeforeAfterSection, defaultBeforeAfterContent } from "./sections/BeforeAfterSection";
import { WhyChooseUsSection, defaultWhyChooseUsContent } from "./sections/WhyChooseUsSection";
import { type BlockStyle } from "./sections/BlockStyleWrapper";
import { SectionStylePanel } from "./SectionStylePanel";
import { InspectorPanel } from "./InspectorPanel";
import { type InspectorTab } from "./inspectorFields";
import { DepositSubmissionsPanel } from "./DepositSubmissionsPanel";
import { CardItemEditorPanel } from "./CardItemEditorPanel";
import { type WebsiteTemplate, WEBSITE_TEMPLATES } from "./websiteTemplates";
import { SECTION_TEMPLATES } from "./sectionTemplates";
import { PAGE_TEMPLATES, type PageTemplate } from "./pageTemplates";
import { useEditorHistory } from "./useEditorHistory";
import { EditableWrapper } from "./EditableWrapper";
import { useInlineEdit, InlineEditContext, InlineEditStatus } from "./InlineEditContext";
import { nanoid } from "nanoid";
import type { SiteSettings, CardComponent } from "./website-types";
import { reportCrash } from "@/lib/reportCrash";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

class WebsiteEditorErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[WebsiteEditorErrorBoundary]", error.stack ?? error.message);
    reportCrash({
      message: error.message,
      stack: error.stack ?? undefined,
      location: "WebsiteEditorErrorBoundary",
    });
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
  type: "header" | "hero" | "services" | "about" | "contact" | "footer" | "portfolio" | "deposit" | "columns" | "testimonials" | "faq" | "cta" | "stats" | "content" | "row" | "text" | "gallery" | "image" | "featured-clients" | "partners" | "service-area" | "certifications" | "before-after" | "why-choose-us" | "legal";
  enabled: boolean;
  order: number;
  content: Record<string, unknown>;
  blockStyle?: BlockStyle;
  /**
   * Reserved for future responsive breakpoint overrides.
   * Tablet = 768–1023px; Mobile = <768px.
   * Non-functional until responsive editing ships; persisted so data round-trips safely.
   */
  breakpoints?: import("./website-types").SectionBreakpoints;
  locked?: boolean;
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
    selectedCardId?: string | null;
    onSelectCard?: (id: string | null) => void;
    onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
    copiedComponent?: SiteComponent | null;
    onCopyComponent?: (comp: SiteComponent) => void;
    onBeforeAction?: () => void;
    onToggleHide?: (sectionId: string, compId: string) => void;
    onToggleRowComponentHide?: (sectionId: string, colId: string, compId: string) => void;
    onContentComponentContextMenu?: (sectionId: string, compId: string, compType: string, e: React.MouseEvent) => void;
    onRowComponentContextMenu?: (sectionId: string, colId: string, compId: string, compType: string, e: React.MouseEvent) => void;
    onColumnContextMenu?: (sectionId: string, colId: string, e: React.MouseEvent) => void;
  }
) {
  const props = { content: section.content as any, settings, isEditing, onChange: onChange as any, blockStyle: section.blockStyle };
  switch (section.type) {
    case "hero":    return <HeroSection {...props} businessName={extras?.businessName} sectionId={extras?.sectionId} />;
    case "services": return (
      <ServicesSection
        {...props}
        businessName={extras?.businessName}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "about":   return <AboutSection {...props} onPhotoUpload={extras?.onAboutPhotoUpload} isPhotoUploading={extras?.isAboutPhotoUploading} businessName={extras?.businessName} sectionId={extras?.sectionId} />;
    case "contact": return <ContactFormSection {...props} businessId={extras?.businessId} />;
    case "footer":  return <FooterSection {...props} sectionId={extras?.sectionId} onOpenMediaLibrary={extras?.onOpenMediaLibrary} />;
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
    case "testimonials": return (
      <TestimonialsSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "faq": return (
      <FAQSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "cta": return <CTASection {...props} sectionId={extras?.sectionId} />;
    case "stats": return (
      <StatsSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "text": return <TextSection {...props} />;
    case "legal": return <TextSection {...props} />;
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
        sectionId={extras?.sectionId ?? section.id}
        selectedComponentId={extras?.selectedComponentId}
        onSelectComponent={extras?.onSelectComponent}
        copiedComponent={extras?.copiedComponent}
        onCopyComponent={extras?.onCopyComponent}
        onBeforeAction={extras?.onBeforeAction}
        onToggleHide={extras?.onToggleHide ? (compId) => extras.onToggleHide!(section.id, compId) : undefined}
        onComponentContextMenu={extras?.onContentComponentContextMenu}
      />
    );
    case "row": return (
      <RowSection
        {...props}
        sectionId={extras?.sectionId ?? section.id}
        selectedColumnId={extras?.selectedRowColumnId}
        selectedComponentId={extras?.selectedRowComponentId}
        onSelectRowComponent={extras?.onSelectRowComponent}
        copiedComponent={extras?.copiedComponent}
        onCopyComponent={extras?.onCopyComponent}
        onBeforeAction={extras?.onBeforeAction}
        onToggleRowComponentHide={extras?.onToggleRowComponentHide ? (colId, compId) => extras.onToggleRowComponentHide!(section.id, colId, compId) : undefined}
        onComponentContextMenu={extras?.onRowComponentContextMenu}
        onColumnContextMenu={extras?.onColumnContextMenu}
      />
    );
    case "featured-clients": return (
      <FeaturedClientsSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "partners": return (
      <PartnersSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "service-area": return (
      <ServiceAreaSection
        {...props}
        sectionId={extras?.sectionId}
      />
    );
    case "certifications": return (
      <CertificationsSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "before-after": return (
      <BeforeAfterSection
        {...props}
        sectionId={extras?.sectionId}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
      />
    );
    case "why-choose-us": return (
      <WhyChooseUsSection
        {...props}
        sectionId={extras?.sectionId}
        selectedCardId={extras?.selectedCardId}
        onSelectCard={extras?.onSelectCard}
        onOpenMediaLibrary={extras?.onOpenMediaLibrary}
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
  "featured-clients": "Featured Clients",
  partners: "Partners & Brands",
  "service-area": "Service Area",
  certifications: "Certifications & Badges",
  "before-after": "Before & After Gallery",
  "why-choose-us": "Why Choose Us",
  legal: "Legal / Disclaimer",
};

let _sectionTypeIcons: Record<string, React.ReactNode> | null = null;
function getSectionTypeIcons(): Record<string, React.ReactNode> {
  if (!_sectionTypeIcons) {
    _sectionTypeIcons = {
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
      "featured-clients": <Users     className="w-3 h-3 flex-shrink-0" />,
      partners:           <Handshake className="w-3 h-3 flex-shrink-0" />,
      "service-area":     <MapPin    className="w-3 h-3 flex-shrink-0" />,
      certifications:     <Award     className="w-3 h-3 flex-shrink-0" />,
      "before-after":     <ArrowLeftRight className="w-3 h-3 flex-shrink-0" />,
      "why-choose-us":    <ThumbsUp  className="w-3 h-3 flex-shrink-0" />,
      legal:              <FileText  className="w-3 h-3 flex-shrink-0" />,
    };
  }
  return _sectionTypeIcons;
}

type AddableSectionEntry = {
  type: Section["type"];
  label: string;
  description: string;
  icon: React.ReactNode;
  allowMultiple?: boolean;
  category: string;
};

let _addableSectionTypes: AddableSectionEntry[] | null = null;
function getAddableSectionTypes(): AddableSectionEntry[] {
  if (!_addableSectionTypes) {
    _addableSectionTypes = [
      { category: "Contractor", type: "why-choose-us",    label: "Why Choose Us",           description: "Selling points that explain why customers should hire you",  icon: <ThumbsUp   className="w-4 h-4" />, allowMultiple: true },
      { category: "Contractor", type: "certifications",   label: "Certifications & Badges", description: "Show licenses, awards, and industry credentials",            icon: <Award      className="w-4 h-4" />, allowMultiple: true },
      { category: "Contractor", type: "service-area",     label: "Service Area",            description: "List the cities, counties, or regions you serve",            icon: <MapPin     className="w-4 h-4" />, allowMultiple: true },
      { category: "Contractor", type: "before-after",     label: "Before & After Gallery",  description: "Side-by-side before/after photo pairs from real jobs",        icon: <ArrowLeftRight className="w-4 h-4" />, allowMultiple: true },
      { category: "Contractor", type: "featured-clients", label: "Featured Clients",        description: "Highlight companies and organizations you've worked with",    icon: <Users      className="w-4 h-4" />, allowMultiple: true },
      { category: "Contractor", type: "partners",         label: "Partners & Brands",       description: "Manufacturers, suppliers, and brands you install or service", icon: <Handshake  className="w-4 h-4" />, allowMultiple: true },
      { category: "Business",     type: "services",         label: "Services",                description: "Showcase what you offer with a grid of service cards",       icon: <Briefcase  className="w-4 h-4" />, allowMultiple: true },
      { category: "Business",     type: "stats",            label: "Stats / Numbers",         description: "Highlight key numbers like years in business or jobs done",  icon: <BarChart2  className="w-4 h-4" />, allowMultiple: true },
      { category: "Business",     type: "faq",              label: "FAQ",                     description: "Accordion-style Q&A to answer common questions",             icon: <HelpCircle className="w-4 h-4" />, allowMultiple: true },
      { category: "Social Proof", type: "testimonials",     label: "Testimonials",            description: "Customer reviews in a card or carousel layout",              icon: <Star       className="w-4 h-4" />, allowMultiple: true },
      { category: "Marketing",    type: "cta",              label: "CTA Banner",              description: "Bold call-to-action strip with headline and buttons",        icon: <Megaphone  className="w-4 h-4" />, allowMultiple: true },
      { category: "Marketing",    type: "hero",             label: "Hero Banner",             description: "Full-width headline, subtext, and a call-to-action button",  icon: <ImagePlus  className="w-4 h-4" />, allowMultiple: true },
      { category: "Layout",     type: "columns",          label: "Columns",                 description: "Two or three side-by-side columns of mixed content",         icon: <Columns    className="w-4 h-4" />, allowMultiple: true },
      { category: "Layout",     type: "content",          label: "Content Block",           description: "Rich content area with text, images, and components",        icon: <Layers     className="w-4 h-4" />, allowMultiple: true },
      { category: "Layout",     type: "row",              label: "Row",                     description: "Flexible row for custom component layouts",                  icon: <LayoutGrid className="w-4 h-4" />, allowMultiple: true },
      { category: "Layout",     type: "text",             label: "Text Block",              description: "Simple heading and paragraph for announcements or copy",     icon: <AlignLeft  className="w-4 h-4" />, allowMultiple: true },
      { category: "Media",      type: "gallery",          label: "Image Gallery",           description: "A responsive photo grid — great for portfolio or projects",  icon: <Images     className="w-4 h-4" />, allowMultiple: true },
      { category: "Media",      type: "image",            label: "Image",                   description: "A single full-width or constrained image with caption",      icon: <Images     className="w-4 h-4" />, allowMultiple: true },
      { category: "Contact",    type: "contact",          label: "Contact / Quote Form",    description: "A form visitors can use to request a quote or reach out",     icon: <AlignLeft  className="w-4 h-4" />, allowMultiple: true },
      { category: "Legal",      type: "legal",            label: "Legal / Disclaimer",      description: "Privacy policy, terms of service, or a legal disclosure block", icon: <FileText   className="w-4 h-4" />, allowMultiple: true },
    ];
  }
  return _addableSectionTypes;
}

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
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors ${
        active ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
      }`}
      onClick={onActivate}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground" onClick={e => e.stopPropagation()}>
        <GripVertical className="w-3 h-3" />
      </div>
      <span className={`flex-1 flex items-center gap-1 text-[11px] font-medium ${section.enabled ? "text-foreground" : "text-muted-foreground"}`}>
        <span className="opacity-50">{getSectionTypeIcons()[section.type] ?? <Layers className="w-3 h-3 flex-shrink-0" />}</span>
        {SECTION_LABELS[section.type] ?? section.type}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title={section.enabled ? "Hide section" : "Show section"}
      >
        {section.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
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
        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-2.5 space-y-2.5">
          <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1">
            <Info className="w-3 h-3 flex-shrink-0" />
            3-Step Setup
          </p>

          {/* Step 1 */}
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold mt-0.5">1</span>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Add domain to your Replit deployment</p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                In Replit, go to your published app → <strong>Deployments</strong> → <strong>Custom Domains</strong> → add <strong>{customDomain}</strong>. Do this once per domain.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold mt-0.5">2</span>
            <div className="space-y-1 w-full">
              <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Add a CNAME record at your registrar</p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                At GoDaddy, Cloudflare, etc. — add a <strong>CNAME</strong> pointing to:
              </p>
              <div className="rounded bg-blue-100 dark:bg-blue-900/40 px-2 py-1 flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-blue-900 dark:text-blue-200 break-all">{appHost}</span>
                <button
                  type="button"
                  onClick={() => onCopy(appHost)}
                  className="flex-shrink-0 text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  title="Copy CNAME target"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <p className="text-[10px] text-blue-500 dark:text-blue-400 leading-relaxed">DNS changes can take up to 48 hours to propagate.</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-2">
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold mt-0.5">3</span>
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-blue-800 dark:text-blue-300">Publish this site</p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-relaxed">
                The domain you entered above is saved with this business. Hit <strong>Publish</strong> and your site will be live at <strong>{customDomain}</strong>.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Enter your domain above to see setup instructions.
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

type SiteTreeNodeProps = {
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
};

function PageNodeWithSortable(props: SiteTreeNodeProps) {
  const {
    node, depth, expandedIds, onToggleExpand,
    activePageId, activeSection,
    switchPage, editingPageId, setEditingPageId, editingPageName, setEditingPageName,
    renamePage, deletePage, setPageTemplatePickerMode, setShowPageTemplatePicker,
    sensors, handleDragEnd, toggleSection, setActiveSection, sections: activeSections,
    setInsertAfterSectionId, setShowAddSection, showAddSection,
    addSectionTab, setAddSectionTab, addSection, addSectionFromTemplate,
  } = props;

  const isExpanded = expandedIds.has(node.id);
  const isActivePage = node.id === activePageId;
  const page = node.page!;
  const lockedHeader = node.id === "home"
    ? (isActivePage ? activeSections : (page.sections ?? [])).find(s => s.type === "header")
    : null;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled: node.id === "home",
  });

  const sharedProps = {
    depth, expandedIds, onToggleExpand, activePageId, activeSection,
    switchPage, editingPageId, setEditingPageId, editingPageName, setEditingPageName,
    renamePage, deletePage, setPageTemplatePickerMode, setShowPageTemplatePicker,
    sensors, handleDragEnd, toggleSection, setActiveSection, sections: activeSections,
    setInsertAfterSectionId, setShowAddSection, showAddSection,
    addSectionTab, setAddSectionTab, addSection, addSectionFromTemplate,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <div
        className={`group flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors ${
          isActivePage ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
        }`}
        onClick={() => { switchPage(node.id); if (!expandedIds.has(node.id)) onToggleExpand(node.id); }}
      >
        {node.id !== "home" && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground flex-shrink-0"
            onClick={e => e.stopPropagation()}
            title="Drag to reorder"
          >
            <GripVertical className="w-3 h-3" />
          </div>
        )}
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
          <span className="flex-1 text-[11px] font-medium truncate">{node.label}</span>
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
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors ${
                activeSection === lockedHeader.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
              }`}
              onClick={() => setActiveSection(lockedHeader.id)}
            >
              <Lock className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
              <span className="flex-1 text-[11px] font-medium text-foreground">Header</span>
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
                    <div className="py-1 max-h-96 overflow-y-auto">
                      {(() => {
                        const entries = getAddableSectionTypes();
                        const categories = [...new Set(entries.map(e => e.category))];
                        return categories.map(cat => (
                          <div key={cat}>
                            <div className="px-3 pt-3 pb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{cat}</div>
                            {entries.filter(e => e.category === cat).map(opt => (
                              <button key={opt.type} type="button" onClick={() => addSection(opt.type)}
                                className="flex items-start gap-2 w-full px-3 py-2 text-left hover:bg-muted transition-colors group">
                                <span className="mt-0.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0">{opt.icon}</span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{opt.label}</span>
                                  <span className="block text-[10px] text-muted-foreground leading-snug">{opt.description}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ));
                      })()}
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

function SiteTreeNode(props: SiteTreeNodeProps) {
  const { node, depth, expandedIds, onToggleExpand, activePageId, activeSection,
    switchPage, toggleSection, setActiveSection, sections: activeSections } = props;

  const isActiveSection = node.type === "section" && activeSection === node.id;

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
        className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-muted transition-colors opacity-60"
        onClick={() => { switchPage(parentPageId); if (!expandedIds.has(parentPageId)) onToggleExpand(parentPageId); }}
      >
        <span className="opacity-60 flex-shrink-0">{node.icon}</span>
        <span className="flex-1 text-[11px] font-medium text-foreground">{node.label}</span>
      </div>
    );
  }

  return <PageNodeWithSortable {...props} />;
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

  // ── SELECTION-CRITICAL STATE ───────────────────────────────────────────────
  // These four values own the editor's selection model. Layout restructures,
  // scroll container changes, and panel refactors must NEVER reset or redeclare
  // these at a lower level. They live here and are passed down as props only.
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
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [aboutPhotoUploading, setAboutPhotoUploading] = useState(false);
  const [uploadingPortfolioPhotoIds, setUploadingPortfolioPhotoIds] = useState<Set<string>>(new Set());
  const [uploadingColumnImageKeys, setUploadingColumnImageKeys] = useState<Set<string>>(new Set());
  const [uploadingGalleryImageIds, setUploadingGalleryImageIds] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [addSectionTab, setAddSectionTab] = useState<"sections" | "templates">("sections");
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const history = useEditorHistory<SitePage, SiteSettings>();
  const { contextValue, editingId, editingIdRef } = useInlineEdit();
  const pagesRef = useRef<SitePage[]>([]);
  const settingsRef = useRef<SiteSettings>({ brandColor: "#1a1a2e", fontFamily: "Inter", logoUrl: "" });
  const activePageIdRef = useRef<string>("home");
  const textEditSessionRef = useRef<{ active: boolean; timer: ReturnType<typeof setTimeout> | null }>({ active: false, timer: null });

  // Wire the inline-edit commit boundary so each committed field edit gets its own undo snapshot,
  // bypassing the 1.5-second text-edit session coalescing window used by the settings panel.
  useEffect(() => {
    contextValue.setCommitBoundaryCallback(() => {
      if (textEditSessionRef.current.timer) {
        clearTimeout(textEditSessionRef.current.timer);
        textEditSessionRef.current.timer = null;
      }
      textEditSessionRef.current.active = false;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [selectedComponentState, setSelectedComponentState] = useState<{ sectionId: string; componentId: string } | null>(null); // selection-critical
  const [selectedRowState, setSelectedRowState] = useState<{ sectionId: string; columnId: string; componentId?: string | null } | null>(null);
  const [selectedCardState, setSelectedCardState] = useState<{ sectionId: string; cardId: string } | null>(null); // selection-critical
  const [selectedCardData, setSelectedCardData] = useState<CardComponent | null>(null);
  const pickerShownRef = useRef(false);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const pendingFocusFieldRef = useRef<string | null>(null);
  const [bgUploading, setBgUploading] = useState<Record<string, boolean>>({});
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [copiedBlockStyle, setCopiedBlockStyle] = useState<BlockStyle | null>(null);
  const [copiedComponent, setCopiedComponent] = useState<SiteComponent | null>(null);
  const [copiedComponentStyle, setCopiedComponentStyle] = useState<Record<string, unknown> | null>(null);
  const [copiedColumn, setCopiedColumn] = useState<RowColumn | null>(null);
  const [copiedColumnStyle, setCopiedColumnStyle] = useState<{ widthRatio: number } | null>(null);
  const [copiedSection, setCopiedSection] = useState<Section | null>(null);
  const [contextInspectorTab, setContextInspectorTab] = useState<{ tab: InspectorTab; id: number } | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; groups: ContextMenuGroup[] } | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => localStorage.getItem("website-editor-left-collapsed") === "true"
  );
  const [focusMode, setFocusMode] = useState(false);
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const preFocusSidebarState = useRef<{ left: boolean } | null>(null);
  const [expandedPageIds, setExpandedPageIds] = useState<Set<string>>(() => new Set(["home"]));
  const [treeSearch, setTreeSearch] = useState("");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const leftCollapsedRef = useRef(leftCollapsed);
  const [editorNarrow, setEditorNarrow] = useState(false);
  const editorBodyRef = useRef<HTMLDivElement>(null);

  function changeViewport(v: "desktop" | "tablet" | "mobile") {
    setViewport(v);
    localStorage.setItem("website-editor-viewport", v);
  }

  useEffect(() => {
    localStorage.setItem("website-editor-left-collapsed", String(leftCollapsed));
    leftCollapsedRef.current = leftCollapsed;
  }, [leftCollapsed]);

  // Auto-switch inspector to the most useful tab when a new section is selected.
  // Only fires when the section changes — manual tab switches within the same section are preserved.
  const lastAutoTabSectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSection || activeSection === lastAutoTabSectionRef.current) return;
    lastAutoTabSectionRef.current = activeSection;
    setContextInspectorTab({ tab: "content", id: Date.now() });
  }, [activeSection]);

  useEffect(() => {
    function checkLayout() {
      const editorWidth = editorBodyRef.current?.offsetWidth ?? window.innerWidth;
      setEditorNarrow(editorWidth < 900);
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
      if (e.key === "Escape") {
        // If the user is inline-editing a text field, let InlineEditableText handle
        // the Escape (it commits and stopPropagation()s). Do not deselect section.
        if (editingIdRef.current) return;
        setActiveSection(null);
      }
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
        setFocusMode(prev => {
          if (prev) {
            if (preFocusSidebarState.current) {
              setLeftCollapsed(preFocusSidebarState.current.left);
              preFocusSidebarState.current = null;
            }
            return false;
          } else {
            preFocusSidebarState.current = { left: leftCollapsedRef.current };
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
      if (editingIdRef.current) return;
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
        setSelectedCardState(null);
        setSelectedCardData(null);
        return;
      }
      if (isTyping) return;
      if (e.key === "Enter") {
        // Begin editing: focus and scroll to first editable field in the inspector panel.
        // This satisfies the universal Edit contract — the same action as the toolbar's
        // Edit (pencil) button — without requiring contenteditable on the canvas.
        const panel = document.querySelector("[data-component-editor-panel]");
        const firstField = panel?.querySelector("input, textarea, select") as HTMLElement | null;
        if (firstField) {
          e.preventDefault();
          firstField.focus();
          firstField.scrollIntoView({ block: "nearest" });
        }
        return;
      }

      if (e.key === "Delete") {
        e.preventDefault();

        // Priority order: row component → content component → active section
        if (selectedRowState?.componentId) {
          // Row components are nested under content.columns[].components
          const { sectionId, columnId, componentId } = selectedRowState as { sectionId: string; columnId: string; componentId: string };
          history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
          setLocalPages(prev => {
            if (!prev) return prev;
            return prev.map(p =>
              p.id !== activePageIdRef.current ? p : {
                ...p,
                sections: p.sections.map(s =>
                  s.id !== sectionId ? s : {
                    ...s,
                    content: {
                      ...(s.content as Record<string, unknown>),
                      columns: ((s.content as any)?.columns ?? []).map((col: { id: string; components: { id: string }[] }) =>
                        col.id !== columnId ? col : {
                          ...col,
                          components: col.components.filter((c) => c.id !== componentId),
                        }
                      ),
                    },
                  }
                ),
              }
            );
          });
          isDirtyRef.current = true;
          setSelectedRowState(prev => prev ? { sectionId: prev.sectionId, columnId: prev.columnId } : null);
          toast({ title: "Component deleted", duration: 2000 });
          return;
        }

        if (selectedComponentState) {
          // ContentSection components are stored in content.components
          const { sectionId, componentId } = selectedComponentState;
          history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
          setLocalPages(prev => {
            if (!prev) return prev;
            return prev.map(p =>
              p.id !== activePageIdRef.current ? p : {
                ...p,
                sections: p.sections.map(s =>
                  s.id !== sectionId ? s : {
                    ...s,
                    content: {
                      ...(s.content as Record<string, unknown>),
                      components: ((s.content as any)?.components ?? []).filter(
                        (c: { id: string }) => c.id !== componentId
                      ),
                    },
                  }
                ),
              }
            );
          });
          isDirtyRef.current = true;
          setSelectedComponentState(null);
          toast({ title: "Component deleted", duration: 2000 });
          return;
        }

        if (activeSection) {
          handleDeleteSectionClick(activeSection);
        }
      }
    }
    window.addEventListener("keydown", onNavKey);
    return () => window.removeEventListener("keydown", onNavKey);
  }, [activeSection, selectedComponentState, selectedRowState, selectedCardState]);

  /**
   * selectSectionAndScroll — sets the active section AND scrolls the canvas
   * to make it visible. Used by the structure tree (tree→canvas sync) and
   * wherever we want bidirectional highlighting.
   */
  function selectSectionAndScroll(id: string | null) {
    setActiveSection(id);
    setSelectedComponentState(null);
    setSelectedRowState(null);
    setSelectedCardState(null);
    setSelectedCardData(null);
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

  // Derived constants — declared here, after useQuery, so they are in scope
  // for every hook and callback that follows. Never reference these in a hook
  // dep array above this line or you will hit a TDZ crash.
  const pages: SitePage[] = localPages ?? (config
    ? [{ id: "home", name: "Home", slug: "home", sections: [...(config.sections as Section[])].sort((a, b) => a.order - b.order) }]
    : [{ id: "home", name: "Home", slug: "home", sections: [] }]);
  const activePage: SitePage = pages.find(p => p.id === activePageId) ?? pages[0] ?? { id: "home", name: "Home", slug: "home", sections: [] };
  const sections: Section[] = activePage.sections;
  const settings: SiteSettings = localSettings ?? config?.settings ?? { brandColor: "#1a1a2e", fontFamily: "Inter", logoUrl: "" };
  pagesRef.current = pages;
  settingsRef.current = settings;
  activePageIdRef.current = activePageId;

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
    if (hs) css += `h1:not([style*="font-size"]){font-size:${hs.h1}}h2:not([style*="font-size"]){font-size:${hs.h2}}h3:not([style*="font-size"]){font-size:${hs.h3}}`;
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
    setHasUnpublishedChanges(true);
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
      setHasUnpublishedChanges(false);
      setShowPublished(true);
      setTimeout(() => setShowPublished(false), 5000);
      toast({ title: "Website published!" });
    } catch {
      toast({ title: "Publish failed", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  // Suppress section-level drag entirely while a text field is being inline-edited.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: editingId ? 99999 : 8 },
    })
  );

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

  function handlePageDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    setLocalPages(prev => {
      const base = prev ?? pages;
      const oldIdx = base.findIndex(p => p.id === active.id);
      const newIdx = base.findIndex(p => p.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return base;
      const reordered = arrayMove(base, oldIdx, newIdx);
      return reordered.map(p => {
        if (p.id !== "home") return p;
        const navLinks = (p.sections.find(s => s.type === "header")?.content?.navLinks as any[]) ?? [];
        const pageOrder = reordered.filter(pg => pg.id !== "home").map(pg => pg.id);
        const sortedLinks = [...navLinks].sort((a, b) => {
          const ai = pageOrder.indexOf(a.pageId ?? "");
          const bi = pageOrder.indexOf(b.pageId ?? "");
          if (ai < 0 && bi < 0) return 0;
          if (ai < 0) return 1;
          if (bi < 0) return -1;
          return ai - bi;
        });
        return {
          ...p,
          sections: p.sections.map(s =>
            s.type === "header"
              ? { ...s, content: { ...s.content, navLinks: sortedLinks } }
              : s
          ),
        };
      });
    });
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

  function applyStyleTo(scope: "section" | "page" | "site", style: BlockStyle) {
    const styleOnly: Partial<BlockStyle> = {
      bgType: style.bgType,
      bgColor: style.bgColor,
      bgImageUrl: style.bgImageUrl,
      bgImageObjectPath: style.bgImageObjectPath,
      bgGradientFrom: style.bgGradientFrom,
      bgGradientTo: style.bgGradientTo,
      bgGradientAngle: style.bgGradientAngle,
      bgImageEffects: style.bgImageEffects,
      overlayColor: style.overlayColor,
      overlayOpacity: style.overlayOpacity,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      minHeight: style.minHeight,
      maxWidth: style.maxWidth,
      borderRadius: style.borderRadius,
      borderWidth: style.borderWidth,
      borderStyle: style.borderStyle,
      borderColor: style.borderColor,
      shadow: style.shadow,
      animation: style.animation,
    };
    history.pushSnapshot({ sections: pagesRef.current, settings });
    isDirtyRef.current = true;
    if (scope === "section") {
      const secId = activeSection;
      setLocalPages(prev => {
        if (!prev) return prev;
        return prev.map(p => ({
          ...p,
          sections: p.sections.map(s =>
            s.id === secId ? { ...s, blockStyle: { ...(s.blockStyle ?? {}), ...styleOnly } } : s
          ),
        }));
      });
      toast({ title: "Styles applied to this section", duration: 2000 });
      return;
    }
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (scope === "page" && p.id !== activePageIdRef.current) return p;
        return {
          ...p,
          sections: p.sections.map(s => ({
            ...s,
            blockStyle: { ...(s.blockStyle ?? {}), ...styleOnly },
          })),
        };
      });
    });
    toast({
      title: scope === "page" ? "Styles applied to this page" : "Styles applied to entire website",
      duration: 2000,
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
    // Include hidden sections — they're visible on canvas and should be reorderable
    const enabled = sections.filter(s => s.type !== "header");
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

  function regenerateNestedIds(content: unknown): unknown {
    if (!content || typeof content !== "object") return content;
    const c = content as Record<string, unknown>;
    const result: Record<string, unknown> = { ...c };
    if (Array.isArray(c.components)) {
      result.components = (c.components as Array<Record<string, unknown>>).map(comp => ({ ...comp, id: nanoid() }));
    }
    if (Array.isArray(c.columns)) {
      result.columns = (c.columns as Array<Record<string, unknown>>).map(col => ({
        ...col,
        id: nanoid(),
        components: Array.isArray(col.components)
          ? (col.components as Array<Record<string, unknown>>).map(comp => ({ ...comp, id: nanoid() }))
          : col.components,
      }));
    }
    return result;
  }

  function duplicateSection(id: string) {
    const sec = sections.find(s => s.id === id);
    if (!sec) return;
    const idx = sections.indexOf(sec);
    const cloned = JSON.parse(JSON.stringify(sec));
    const dup: Section = { ...cloned, id: nanoid(), content: regenerateNestedIds(cloned.content) };
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
    if (type === "services") {
      content = {
        heading: "Our Services",
        items: [
          { id: `s-${Math.random().toString(36).slice(2,7)}`, title: "Service One", description: "Describe what this service includes and why clients choose it.", mediaType: "none", layout: "card", textAlign: "left", hoverEffect: "none", clickAction: "none" },
          { id: `s-${Math.random().toString(36).slice(2,7)}`, title: "Service Two", description: "Highlight the key benefits and what sets this service apart.", mediaType: "none", layout: "card", textAlign: "left", hoverEffect: "none", clickAction: "none" },
          { id: `s-${Math.random().toString(36).slice(2,7)}`, title: "Service Three", description: "Explain the process, timeline, or guarantee for this service.", mediaType: "none", layout: "card", textAlign: "left", hoverEffect: "none", clickAction: "none" },
        ],
      } as Record<string, unknown>;
    } else if (type === "columns") {
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
    } else if (type === "featured-clients") {
      content = defaultFeaturedClientsContent() as unknown as Record<string, unknown>;
    } else if (type === "partners") {
      content = defaultPartnersContent() as unknown as Record<string, unknown>;
    } else if (type === "service-area") {
      content = defaultServiceAreaContent() as unknown as Record<string, unknown>;
    } else if (type === "certifications") {
      content = defaultCertificationsContent() as unknown as Record<string, unknown>;
    } else if (type === "before-after") {
      content = defaultBeforeAfterContent() as unknown as Record<string, unknown>;
    } else if (type === "why-choose-us") {
      content = defaultWhyChooseUsContent() as unknown as Record<string, unknown>;
    } else if (type === "legal") {
      content = { heading: "Legal Notices", body: "Privacy Policy | Terms of Service\n\nBy using our services, you agree to our terms and conditions. We respect your privacy and handle your personal information in accordance with applicable laws.\n\n© " + new Date().getFullYear() + " All rights reserved." } as unknown as Record<string, unknown>;
    } else if (type === "contact") {
      content = {} as Record<string, unknown>;
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
    setHasUnpublishedChanges(true);
    const afterId = insertAfterSectionId;
    if (afterId === null) {
      updatePageSections([newSection, ...sections].map((s, i) => ({ ...s, order: i })));
    } else if (afterId !== undefined) {
      const idx = sections.findIndex(s => s.id === afterId);
      if (idx >= 0) {
        const inserted = [...sections.slice(0, idx + 1), newSection, ...sections.slice(idx + 1)];
        updatePageSections(inserted.map((s, i) => ({ ...s, order: i })));
      } else {
        // fallback: insert before footer if present
        const footerIdx = sections.findIndex(s => s.type === "footer");
        const base = footerIdx >= 0
          ? [...sections.slice(0, footerIdx), newSection, ...sections.slice(footerIdx)]
          : [...sections, newSection];
        updatePageSections(base.map((s, i) => ({ ...s, order: i })));
      }
    } else {
      // Default append — insert before footer so it doesn't land below it
      const footerIdx = sections.findIndex(s => s.type === "footer");
      const base = footerIdx >= 0
        ? [...sections.slice(0, footerIdx), newSection, ...sections.slice(footerIdx)]
        : [...sections, newSection];
      updatePageSections(base.map((s, i) => ({ ...s, order: i })));
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
    setHasUnpublishedChanges(true);
    const afterId = insertAfterSectionId;
    if (afterId === null) {
      updatePageSections([newSection, ...sections].map((s, i) => ({ ...s, order: i })));
    } else if (afterId !== undefined) {
      const idx = sections.findIndex(s => s.id === afterId);
      if (idx >= 0) {
        const inserted = [...sections.slice(0, idx + 1), newSection, ...sections.slice(idx + 1)];
        updatePageSections(inserted.map((s, i) => ({ ...s, order: i })));
      } else {
        const footerIdx = sections.findIndex(s => s.type === "footer");
        const base = footerIdx >= 0
          ? [...sections.slice(0, footerIdx), newSection, ...sections.slice(footerIdx)]
          : [...sections, newSection];
        updatePageSections(base.map((s, i) => ({ ...s, order: i })));
      }
    } else {
      const footerIdx = sections.findIndex(s => s.type === "footer");
      const base = footerIdx >= 0
        ? [...sections.slice(0, footerIdx), newSection, ...sections.slice(footerIdx)]
        : [...sections, newSection];
      updatePageSections(base.map((s, i) => ({ ...s, order: i })));
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

  function convertComponentType(comp: SiteComponent, targetType: ComponentType): SiteComponent {
    const newProps = { ...(defaultPropsForType(targetType) as any) };
    const src = comp.props as any;
    if ("text" in src) {
      if ("text" in newProps) newProps.text = src.text;
      if ("label" in newProps) newProps.label = src.text;
    }
    if ("label" in src && "text" in newProps) newProps.text = src.label;
    if ("style" in src && "style" in newProps) newProps.style = src.style;
    if ("align" in src && "align" in newProps) newProps.align = src.align;
    return { ...comp, type: targetType, props: newProps as SiteComponentProps };
  }

  function updateComponentInSection(
    sectionId: string,
    columnId: string | undefined,
    componentId: string,
    updater: (comp: SiteComponent) => SiteComponent | null
  ) {
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            if (columnId) {
              return {
                ...s,
                content: {
                  ...(s.content as Record<string, unknown>),
                  columns: ((s.content as any).columns ?? []).map((col: any) => {
                    if (col.id !== columnId) return col;
                    const newComps: SiteComponent[] = [];
                    for (const c of col.components as SiteComponent[]) {
                      if (c.id === componentId) {
                        const result = updater(c);
                        if (result !== null) newComps.push(result);
                      } else {
                        newComps.push(c);
                      }
                    }
                    return { ...col, components: newComps };
                  }),
                }
              };
            } else {
              return {
                ...s,
                content: {
                  ...(s.content as Record<string, unknown>),
                  components: ((s.content as any).components ?? []).flatMap((c: SiteComponent) => {
                    if (c.id !== componentId) return [c];
                    const result = updater(c);
                    return result !== null ? [result] : [];
                  }),
                }
              };
            }
          }),
        };
      });
    });
    isDirtyRef.current = true;
  }

  function insertComponentAfterInSection(
    sectionId: string,
    columnId: string | undefined,
    afterComponentId: string,
    newComp: SiteComponent
  ) {
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            if (columnId) {
              return {
                ...s,
                content: {
                  ...(s.content as Record<string, unknown>),
                  columns: ((s.content as any).columns ?? []).map((col: any) => {
                    if (col.id !== columnId) return col;
                    const comps = col.components as SiteComponent[];
                    const idx = comps.findIndex(c => c.id === afterComponentId);
                    const next = [...comps];
                    if (idx === -1) next.push(newComp); else next.splice(idx + 1, 0, newComp);
                    return { ...col, components: next };
                  }),
                }
              };
            } else {
              const comps = ((s.content as any).components ?? []) as SiteComponent[];
              const idx = comps.findIndex(c => c.id === afterComponentId);
              const next = [...comps];
              if (idx === -1) next.push(newComp); else next.splice(idx + 1, 0, newComp);
              return { ...s, content: { ...(s.content as Record<string, unknown>), components: next } };
            }
          }),
        };
      });
    });
    isDirtyRef.current = true;
  }

  function pasteSection(afterSectionId: string) {
    if (!copiedSection) return;
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        const idx = p.sections.findIndex(s => s.id === afterSectionId);
        if (idx === -1) return p;
        const cloned = JSON.parse(JSON.stringify(copiedSection)) as Section;
        const newSection: Section = { ...cloned, id: nanoid(), locked: false, order: 0 };
        const inserted = [...p.sections.slice(0, idx + 1), newSection, ...p.sections.slice(idx + 1)];
        return { ...p, sections: inserted.map((s, i) => ({ ...s, order: i })) };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Section pasted", duration: 2000 });
  }

  // ─── Context menu helpers (Action Registry) ─────────────────────────────────

  function moveSectionToPage(sectionId: string, targetPageId: string) {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    setLocalPages(prev => {
      if (!prev) return prev;
      const sourcePage = prev.find(p => p.sections.some(s => s.id === sectionId));
      if (!sourcePage || sourcePage.id === targetPageId) return prev;
      const section = sourcePage.sections.find(s => s.id === sectionId);
      if (!section) return prev;
      return prev.map(p => {
        if (p.id === sourcePage.id) {
          const remaining = p.sections.filter(s => s.id !== sectionId);
          return { ...p, sections: remaining.map((s, i) => ({ ...s, order: i })) };
        }
        if (p.id === targetPageId) {
          return { ...p, sections: [...p.sections, { ...section, order: p.sections.length }] };
        }
        return p;
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Section moved", duration: 2000 });
  }

  function addComponentToColumn(sectionId: string, colId: string, type: ComponentType) {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              content: {
                ...(s.content as Record<string, unknown>),
                columns: ((s.content as any).columns ?? []).map((col: any) => {
                  if (col.id !== colId) return col;
                  const newComp: SiteComponent = { id: nanoid(), type, props: defaultPropsForType(type) };
                  return { ...col, components: [...col.components, newComp] };
                }),
              }
            };
          }),
        };
      });
    });
    isDirtyRef.current = true;
  }

  function pasteComponentToColumn(sectionId: string, colId: string) {
    if (!copiedComponent) return;
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              content: {
                ...(s.content as Record<string, unknown>),
                columns: ((s.content as any).columns ?? []).map((col: any) => {
                  if (col.id !== colId) return col;
                  const pasted: SiteComponent = {
                    ...JSON.parse(JSON.stringify(copiedComponent)), id: nanoid(), hidden: false, locked: false,
                  };
                  return { ...col, components: [...col.components, pasted] };
                }),
              }
            };
          }),
        };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Component pasted", duration: 2000 });
  }

  function openSectionContextMenu(x: number, y: number, s: Section) {
    const nonHeader = sections.filter(sec => sec.type !== "header");
    const idx = nonHeader.findIndex(sec => sec.id === s.id);
    const prevId = idx > 0 ? nonHeader[idx - 1].id : null;

    const groups = buildSectionActions({
      locked: !!s.locked,
      enabled: s.enabled,
      hasCopiedSection: !!copiedSection,
      hasCopiedComponent: !!copiedComponent,
      hasCopiedStyles: !!copiedBlockStyle,
      allPages: pages.map(pg => ({ id: pg.id, name: pg.name })),
      currentPageId: activePageId,
      onAddAbove: () => { setInsertAfterSectionId(prevId); setShowAddSection(true); },
      onAddBelow: () => { setInsertAfterSectionId(s.id); setShowAddSection(true); },
      onDuplicate: () => duplicateSection(s.id),
      onCopy: () => { setCopiedSection(JSON.parse(JSON.stringify(s))); toast({ title: "Section copied", duration: 1500 }); },
      onPasteBelow: () => pasteSection(s.id),
      onMismatchPaste: () => toast({ title: "Clipboard has a component — right-click a component to paste it", duration: 3000 }),
      onToggleHide: () => toggleSection(s.id),
      onLock: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        const pid = activePageIdRef.current;
        setLocalPages(prev => prev ? prev.map(p => p.id !== pid ? p : {
          ...p, sections: p.sections.map(sec => sec.id === s.id ? { ...sec, locked: true } : sec),
        }) : prev);
        isDirtyRef.current = true;
      },
      onUnlock: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        const pid = activePageIdRef.current;
        setLocalPages(prev => prev ? prev.map(p => p.id !== pid ? p : {
          ...p, sections: p.sections.map(sec => sec.id === s.id ? { ...sec, locked: false } : sec),
        }) : prev);
        isDirtyRef.current = true;
      },
      onDelete: () => handleDeleteSectionClick(s.id),
      onCopyStyles: () => { setCopiedBlockStyle(s.blockStyle ?? {}); toast({ title: "Styles copied", duration: 1500 }); },
      onPasteStyles: () => {
        if (copiedBlockStyle) { updateBlockStyle(s.id, copiedBlockStyle); toast({ title: "Styles pasted", duration: 2000 }); }
      },
      onInspect: (tab?: InspectorTab) => {
        setActiveSection(s.id);
        setActiveTab("editor");
        if (tab) setContextInspectorTab({ tab, id: Date.now() });
        requestAnimationFrame(() => selectSectionAndScroll(s.id));
      },
      onMoveToPage: (targetPageId: string) => moveSectionToPage(s.id, targetPageId),
    });

    setContextMenu({ x, y, groups });
  }

  function openComponentContextMenu(
    x: number, y: number,
    sectionId: string, componentId: string, compType: string, columnId?: string
  ) {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;

    let comp: SiteComponent | undefined;
    if (columnId) {
      const col = (sec.content as any)?.columns?.find((c: any) => c.id === columnId);
      comp = col?.components?.find((c: any) => c.id === componentId);
    } else {
      comp = (sec.content as any)?.components?.find((c: any) => c.id === componentId);
    }
    if (!comp) return;
    const compRef = comp;

    const focusInspector = () => {
      setActiveSection(sectionId);
      setActiveTab("editor");
      if (columnId) setSelectedRowState({ sectionId, columnId, componentId });
      else setSelectedComponentState({ sectionId, componentId });
    };

    const sectionTypeLabel = (type: string) =>
      ({ hero: "Hero", services: "Services", about: "About", contact: "Contact",
         footer: "Footer", content: "Content", row: "Row", text: "Text",
         columns: "Columns", gallery: "Gallery", stats: "Stats", cta: "CTA",
         testimonials: "Testimonials", faq: "FAQ" }[type]
       ?? type.charAt(0).toUpperCase() + type.slice(1));

    const movableSections = sections
      .filter(s => s.id !== sectionId && ["content", "row", "text", "columns"].includes(s.type))
      .map((s, i) => ({ id: s.id, label: `${sectionTypeLabel(s.type)} ${i + 1}` }));

    const groups = buildComponentActions({
      comp: compRef,
      locked: !!compRef.locked,
      hasCopiedComponent: !!copiedComponent,
      hasCopiedSection: !!copiedSection,
      hasCopiedComponentStyle: !!copiedComponentStyle,
      allSections: movableSections,
      onEdit: () => {
        focusInspector();
        requestAnimationFrame(() => {
          const panel = document.querySelector("[data-component-editor-panel]");
          (panel?.querySelector("input, textarea, select") as HTMLElement | null)?.focus();
        });
      },
      onDuplicate: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        insertComponentAfterInSection(sectionId, columnId, componentId, {
          ...JSON.parse(JSON.stringify(compRef)), id: nanoid(), hidden: false, locked: false,
        });
        toast({ title: "Component duplicated", duration: 2000 });
      },
      onCopy: () => { setCopiedComponent(compRef); toast({ title: "Component copied", duration: 1500 }); },
      onPaste: () => {
        if (!copiedComponent) return;
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        insertComponentAfterInSection(sectionId, columnId, componentId, {
          ...JSON.parse(JSON.stringify(copiedComponent)), id: nanoid(), hidden: false, locked: false,
        });
        toast({ title: "Component pasted", duration: 2000 });
      },
      onMismatchPaste: () => toast({ title: "Clipboard has a section — right-click the canvas to paste it", duration: 3000 }),
      onCopyComponentStyle: () => {
        const p = compRef.props as any;
        let styleOnly: Record<string, unknown> = {};
        switch (compRef.type) {
          case "heading": case "paragraph": styleOnly = { style: p.style, align: p.align }; break;
          case "button":      styleOnly = { align: p.align, config: p.config }; break;
          case "image":       styleOnly = { objectFit: p.objectFit, borderRadius: p.borderRadius }; break;
          case "divider":     styleOnly = { color: p.color, thickness: p.thickness, borderStyle: p.borderStyle, marginY: p.marginY }; break;
          case "icon":        styleOnly = { size: p.size, align: p.align }; break;
          default: break;
        }
        setCopiedComponentStyle(styleOnly);
        toast({ title: "Component styles copied", duration: 1500 });
      },
      onPasteComponentStyle: () => {
        if (!copiedComponentStyle) return;
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        updateComponentInSection(sectionId, columnId, componentId, c => ({
          ...c,
          props: { ...(c.props as Record<string, unknown>), ...copiedComponentStyle },
        }));
        toast({ title: "Component styles pasted", duration: 2000 });
      },
      onMoveToSection: (targetSectionId: string) => moveComponentToSection(sectionId, columnId, componentId, targetSectionId),
      onToggleHide: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        updateComponentInSection(sectionId, columnId, componentId, c => ({ ...c, hidden: !c.hidden }));
      },
      onLock: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        updateComponentInSection(sectionId, columnId, componentId, c => ({ ...c, locked: true }));
      },
      onUnlock: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        updateComponentInSection(sectionId, columnId, componentId, c => ({ ...c, locked: false }));
      },
      onDelete: () => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        updateComponentInSection(sectionId, columnId, componentId, () => null);
        if (columnId) setSelectedRowState(prev => prev ? { sectionId: prev.sectionId, columnId: prev.columnId } : null);
        else setSelectedComponentState(null);
        toast({ title: "Component deleted", duration: 2000 });
      },
      onConvertTo: (targetType: ComponentType) => {
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
        updateComponentInSection(sectionId, columnId, componentId, c => convertComponentType(c, targetType));
      },
      onInspect: (tab?: InspectorTab) => {
        focusInspector();
        if (tab) setContextInspectorTab({ tab, id: Date.now() });
      },
      onReplaceImage: compRef.type === "image" ? () => {
        openMediaLibrary((url: string) => {
          history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
          updateComponentInSection(sectionId, columnId, componentId, c => ({
            ...c, props: { ...(c.props as any), url },
          }));
        });
      } : undefined,
      onEditAltText: compRef.type === "image" ? () => {
        focusInspector();
        setContextInspectorTab({ tab: "content", id: Date.now() });
        requestAnimationFrame(() => {
          const panel = document.querySelector("[data-component-editor-panel]");
          const altField = panel?.querySelector(
            "input[placeholder*='alt' i], input[name*='alt' i], textarea[placeholder*='alt' i]"
          ) as HTMLInputElement | null;
          const target = altField ?? (panel?.querySelector("input, textarea") as HTMLElement | null);
          target?.focus();
          target?.scrollIntoView({ block: "nearest" });
        });
      } : undefined,
    });

    setContextMenu({ x, y, groups });
  }

  function moveComponentToSection(
    sourceSectionId: string, sourceColId: string | undefined,
    componentId: string, targetSectionId: string,
  ) {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        // Pass 1: extract component from source
        let movedComp: SiteComponent | null = null;
        const afterRemove = p.sections.map(s => {
          if (s.id !== sourceSectionId) return s;
          if (sourceColId) {
            return {
              ...s,
              content: {
                ...(s.content as any),
                columns: ((s.content as any).columns ?? []).map((col: any) => {
                  if (col.id !== sourceColId) return col;
                  movedComp = col.components.find((c: any) => c.id === componentId) ?? null;
                  return { ...col, components: col.components.filter((c: any) => c.id !== componentId) };
                }),
              }
            };
          } else {
            movedComp = ((s.content as any).components ?? []).find((c: any) => c.id === componentId) ?? null;
            return {
              ...s,
              content: {
                ...(s.content as any),
                components: ((s.content as any).components ?? []).filter((c: any) => c.id !== componentId),
              }
            };
          }
        });
        if (!movedComp) return p;
        const targetComp: SiteComponent = { ...(movedComp as SiteComponent), id: nanoid() };
        // Pass 2: insert into target section
        return {
          ...p,
          sections: afterRemove.map(s => {
            if (s.id !== targetSectionId) return s;
            if ((s.content as any).columns) {
              const cols = (s.content as any).columns as any[];
              return {
                ...s,
                content: {
                  ...(s.content as any),
                  columns: cols.map((col: any, i: number) =>
                    i === 0 ? { ...col, components: [...col.components, targetComp] } : col
                  ),
                }
              };
            } else {
              return {
                ...s,
                content: {
                  ...(s.content as any),
                  components: [...((s.content as any).components ?? []), targetComp],
                }
              };
            }
          }),
        };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Component moved", duration: 2000 });
  }

  function duplicateColumn(sectionId: string, colId: string) {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            const cols = (s.content as any).columns ?? [];
            const idx = cols.findIndex((c: any) => c.id === colId);
            if (idx === -1) return s;
            const src = cols[idx];
            const dup = {
              ...JSON.parse(JSON.stringify(src)),
              id: nanoid(),
              components: (src.components ?? []).map((c: any) => ({ ...JSON.parse(JSON.stringify(c)), id: nanoid() })),
            };
            const newCols = [...cols.slice(0, idx + 1), dup, ...cols.slice(idx + 1)];
            return { ...s, content: { ...(s.content as any), columns: newCols } };
          }),
        };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Column duplicated", duration: 2000 });
  }

  function deleteColumn(sectionId: string, colId: string) {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;
    const cols = (sec.content as any).columns ?? [];
    if (cols.length <= 1) return;
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            const remaining = ((s.content as any).columns ?? []).filter((c: any) => c.id !== colId);
            return { ...s, content: { ...(s.content as any), columns: remaining } };
          }),
        };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Column deleted", duration: 2000 });
  }

  function copyColumn(sectionId: string, colId: string) {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;
    const col = ((sec.content as any).columns ?? []).find((c: any) => c.id === colId);
    if (!col) return;
    setCopiedColumn(JSON.parse(JSON.stringify(col)));
    toast({ title: "Column copied", duration: 1500 });
  }

  function pasteColumn(sectionId: string, afterColId: string) {
    if (!copiedColumn) return;
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            const cols = (s.content as any).columns ?? [];
            const idx = cols.findIndex((c: any) => c.id === afterColId);
            const newCol: RowColumn = {
              ...JSON.parse(JSON.stringify(copiedColumn)),
              id: nanoid(),
              components: (copiedColumn.components ?? []).map((c: SiteComponent) => ({
                ...JSON.parse(JSON.stringify(c)), id: nanoid(),
              })),
            };
            const newCols = [...cols.slice(0, idx + 1), newCol, ...cols.slice(idx + 1)];
            return { ...s, content: { ...(s.content as any), columns: newCols } };
          }),
        };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Column pasted", duration: 2000 });
  }

  function toggleHideColumn(sectionId: string, colId: string) {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              content: {
                ...(s.content as any),
                columns: ((s.content as any).columns ?? []).map((c: any) =>
                  c.id === colId ? { ...c, hidden: !c.hidden } : c
                ),
              }
            };
          }),
        };
      });
    });
    isDirtyRef.current = true;
  }

  function setColumnLocked(sectionId: string, colId: string, locked: boolean) {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              content: {
                ...(s.content as any),
                columns: ((s.content as any).columns ?? []).map((c: any) =>
                  c.id === colId ? { ...c, locked } : c
                ),
              }
            };
          }),
        };
      });
    });
    isDirtyRef.current = true;
  }

  function copyColumnStyles(sectionId: string, colId: string) {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;
    const col = ((sec.content as any).columns ?? []).find((c: any) => c.id === colId);
    if (!col) return;
    setCopiedColumnStyle({ widthRatio: col.widthRatio });
    toast({ title: "Column styles copied", duration: 1500 });
  }

  function pasteColumnStyles(sectionId: string, colId: string) {
    if (!copiedColumnStyle) return;
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              content: {
                ...(s.content as any),
                columns: ((s.content as any).columns ?? []).map((c: any) =>
                  c.id === colId ? { ...c, widthRatio: copiedColumnStyle.widthRatio } : c
                ),
              }
            };
          }),
        };
      });
    });
    isDirtyRef.current = true;
    toast({ title: "Column styles pasted", duration: 2000 });
  }

  function moveColumn(sectionId: string, colId: string, direction: "left" | "right") {
    history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
    const pageId = activePageIdRef.current;
    setLocalPages(prev => {
      if (!prev) return prev;
      return prev.map(p => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          sections: p.sections.map(s => {
            if (s.id !== sectionId) return s;
            const cols = [...((s.content as any).columns ?? [])];
            const idx = cols.findIndex((c: any) => c.id === colId);
            if (idx === -1) return s;
            const targetIdx = direction === "left" ? idx - 1 : idx + 1;
            if (targetIdx < 0 || targetIdx >= cols.length) return s;
            [cols[idx], cols[targetIdx]] = [cols[targetIdx], cols[idx]];
            return { ...s, content: { ...(s.content as any), columns: cols } };
          }),
        };
      });
    });
    isDirtyRef.current = true;
  }

  function openColumnContextMenu(x: number, y: number, sectionId: string, colId: string) {
    const sec = sections.find(s => s.id === sectionId);
    const cols: RowColumn[] = (sec?.content as any)?.columns ?? [];
    const colIdx = cols.findIndex(c => c.id === colId);
    const col = cols[colIdx];
    const groups = buildColumnActions({
      isColumnHidden: !!col?.hidden,
      isColumnLocked: !!col?.locked,
      hasCopiedComponent: !!copiedComponent,
      hasCopiedColumn: !!copiedColumn,
      hasCopiedColumnStyle: !!copiedColumnStyle,
      canDeleteColumn: cols.length > 1,
      canMoveLeft: colIdx > 0,
      canMoveRight: colIdx < cols.length - 1,
      onAddComponent: (type: ComponentType) => addComponentToColumn(sectionId, colId, type),
      onPasteComponent: () => pasteComponentToColumn(sectionId, colId),
      onCopyColumn: () => copyColumn(sectionId, colId),
      onPasteColumn: () => pasteColumn(sectionId, colId),
      onDuplicateColumn: () => duplicateColumn(sectionId, colId),
      onToggleHideColumn: () => toggleHideColumn(sectionId, colId),
      onLockColumn: () => setColumnLocked(sectionId, colId, true),
      onUnlockColumn: () => setColumnLocked(sectionId, colId, false),
      onCopyColumnStyles: () => copyColumnStyles(sectionId, colId),
      onPasteColumnStyles: () => pasteColumnStyles(sectionId, colId),
      onMoveLeft: () => moveColumn(sectionId, colId, "left"),
      onMoveRight: () => moveColumn(sectionId, colId, "right"),
      onDeleteColumn: () => deleteColumn(sectionId, colId),
      onInspect: (tab?: InspectorTab) => {
        setActiveSection(sectionId);
        setActiveTab("editor");
        setSelectedRowState({ sectionId, columnId: colId });
        if (tab) setContextInspectorTab({ tab, id: Date.now() });
      },
    });
    setContextMenu({ x, y, groups });
  }

  function renderSections() {
    const homePageSections = pages.find(p => p.id === "home")?.sections ?? sections;
    const headerSec = homePageSections.find(s => s.type === "header");
    // Include ALL non-header sections (even hidden ones) — hidden sections render
    // dimmed with a "Hidden" badge on the canvas via EditableWrapper.isHidden.
    // Only the public site (PublicSite.tsx) filters out s.enabled === false.
    const canvasSections = sections.filter(s => s.type !== "header");
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
      copiedComponent,
      onCopyComponent: (comp: SiteComponent) => {
        setCopiedComponent(comp);
        toast({ title: "Component copied", duration: 2000 });
      },
      /** Push a snapshot before discrete component mutations so each action is individually undoable */
      onBeforeAction: () => {
        textEditSessionRef.current.active = false;
        if (textEditSessionRef.current.timer) {
          clearTimeout(textEditSessionRef.current.timer);
          textEditSessionRef.current.timer = null;
        }
        history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
      },
      /** Toggle hidden on a content-section component — scoped to the exact section to prevent cross-section ID collisions */
      onToggleHide: (sectionId: string, compId: string) => {
        const pageId = activePageIdRef.current;
        setLocalPages(prev => {
          if (!prev) return prev;
          return prev.map(p => p.id !== pageId ? p : {
            ...p,
            sections: p.sections.map(s => {
              if (s.id !== sectionId) return s;
              const comps: SiteComponent[] | undefined = (s.content as any)?.components;
              if (!comps) return s;
              history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
              return {
                ...s,
                content: {
                  ...(s.content as Record<string, unknown>),
                  components: comps.map(c => c.id === compId ? { ...c, hidden: !c.hidden } : c),
                },
              };
            }),
          });
        });
        isDirtyRef.current = true;
        toast({ title: "Component visibility toggled", duration: 2000 });
      },
      /** Toggle hidden on a row-section component inside a column — scoped to the exact section */
      onToggleRowComponentHide: (sectionId: string, colId: string, compId: string) => {
        const pageId = activePageIdRef.current;
        setLocalPages(prev => {
          if (!prev) return prev;
          return prev.map(p => p.id !== pageId ? p : {
            ...p,
            sections: p.sections.map(s => {
              if (s.id !== sectionId) return s;
              const cols: Array<{ id: string; components: SiteComponent[] }> | undefined = (s.content as any)?.columns;
              if (!cols) return s;
              history.pushSnapshot({ sections: pagesRef.current, settings: settingsRef.current });
              return {
                ...s,
                content: {
                  ...(s.content as Record<string, unknown>),
                  columns: cols.map(c => c.id !== colId ? c : {
                    ...c,
                    components: c.components.map(cp => cp.id === compId ? { ...cp, hidden: !cp.hidden } : cp),
                  }),
                },
              };
            }),
          });
        });
        isDirtyRef.current = true;
        toast({ title: "Component visibility toggled", duration: 2000 });
      },
      /** Context menu for a content-section component */
      onContentComponentContextMenu: (sectionId: string, compId: string, compType: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openComponentContextMenu(e.clientX, e.clientY, sectionId, compId, compType, undefined);
      },
      /** Context menu for a row-section component inside a column */
      onRowComponentContextMenu: (sectionId: string, colId: string, compId: string, compType: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openComponentContextMenu(e.clientX, e.clientY, sectionId, compId, compType, colId);
      },
      /** Context menu for a column itself (add component, paste, inspect) */
      onColumnContextMenu: (sectionId: string, colId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openColumnContextMenu(e.clientX, e.clientY, sectionId, colId);
      },
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
          onEdit={() => {
            // Ensure section is selected then focus its first settings field
            setActiveSection(s.id);
            requestAnimationFrame(() => {
              const panel = document.querySelector("[data-component-editor-panel]");
              const firstField = panel?.querySelector("input, textarea, select") as HTMLElement | null;
              firstField?.focus();
              firstField?.scrollIntoView({ block: "nearest" });
            });
          }}
          locked={!!s.locked}
          onContextMenu={!isHeader ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSectionContextMenu(e.clientX, e.clientY, s);
          } : undefined}
          onDoubleClick={!isHeader ? (e) => {
            e.stopPropagation();
            setActiveSection(s.id);
            requestAnimationFrame(() => {
              const panel = document.querySelector("[data-component-editor-panel]");
              const firstField = panel?.querySelector("input, textarea, select") as HTMLElement | null;
              firstField?.focus();
              firstField?.scrollIntoView({ block: "nearest" });
            });
          } : undefined}
          onDuplicate={!isHeader ? () => duplicateSection(s.id) : undefined}
          onToggleHide={!isHeader ? () => toggleSection(s.id) : undefined}
          onDelete={!isHeader ? () => handleDeleteSectionClick(s.id) : undefined}
          onMoveUp={!isHeader ? () => moveSection(s.id, "up") : undefined}
          onMoveDown={!isHeader ? () => moveSection(s.id, "down") : undefined}
          onInsertBelow={!isHeader ? () => { setInsertAfterSectionId(s.id); setShowAddSection(true); } : undefined}
          onDoubleClickPrimary={() => {
            // When the user double-clicks a non-text background area of the section,
            // trigger inline editing on the section's first text target.
            requestAnimationFrame(() => {
              const container = document.querySelector<HTMLElement>(`[data-section-canvas-id="${s.id}"]`);
              const first = container?.querySelector<HTMLElement>("[data-inline-editable]");
              if (first) first.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
            });
          }}
        >
          {renderSection(s, settings, isActive, content => updateContent(s.id, content), {
            ...sectionExtras,
            sectionId: s.id,
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
            selectedCardId: selectedCardState?.sectionId === s.id ? selectedCardState.cardId : null,
            onSelectCard: (id: string | null) => {
              if (id) {
                // Capture card data at click-time so the dedicated editor panel
                // doesn't need a fragile re-lookup at render time.
                let cardData: CardComponent | null = null;
                if (s.type === "services" || s.type === "stats") {
                  const c = s.content as { items?: CardComponent[] };
                  cardData = (c.items ?? []).find(ci => ci.id === id) ?? null;
                } else if (s.type === "testimonials") {
                  const raw = s.content as { items?: CardComponent[]; testimonials?: any[] };
                  let tItems: CardComponent[] = raw.items ?? [];
                  if (tItems.length === 0 && raw.testimonials?.length) {
                    tItems = (raw.testimonials as any[]).map((t: any) => ({
                      id: t.id, title: t.name,
                      description: `"${t.quote}"${t.location ? `\n\n— ${t.location}` : ""}`,
                      mediaType: "none" as const, layout: "horizontal" as const,
                      textAlign: "left" as const, hoverEffect: "none" as const, clickAction: "none" as const,
                      templateType: "testimonial" as const,
                      badgeEnabled: t.rating > 0, badgeText: "★".repeat(Math.min(t.rating, 5)),
                      badgeColor: "#f59e0b", badgeTextColor: "#ffffff", badgePosition: "top-right" as const,
                    }));
                  }
                  cardData = tItems.find(ci => ci.id === id) ?? null;
                } else if (s.type === "faq") {
                  const raw = s.content as { cards?: CardComponent[] };
                  cardData = (raw.cards ?? []).find(ci => ci.id === id) ?? null;
                }
                setSelectedCardState({ sectionId: s.id, cardId: id });
                setSelectedCardData(cardData);
                setActiveSection(s.id);
                setContextInspectorTab({ tab: "content", id: Date.now() });
              } else {
                setSelectedCardState(null);
                setSelectedCardData(null);
              }
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
      <InlineEditContext.Provider value={contextValue}>
        <div style={previewBodyStyle} data-editing={editingId || undefined}>
          {settings.headingFont && (
            <style>{`h1,h2,h3,h4,h5,h6{font-family:'${settings.headingFont}',system-ui,sans-serif}`}</style>
          )}
          {headerSec && renderWrapped(headerSec, { isHeader: true })}
          {canvasSections.length === 0 && !headerSec && (
            <div className="py-20 text-center text-muted-foreground text-sm">
              Add a section to start building your page.
            </div>
          )}
          {canvasSections.flatMap((s, idx) => [
            addBetween(idx === 0 ? (headerSec ? headerSec.id : null) : canvasSections[idx - 1]?.id, `ins-${idx}`),
            renderWrapped(s, { isFirst: idx === 0, isLast: idx === canvasSections.length - 1 }),
          ])}
          {canvasSections.length > 0 && addBetween(canvasSections[canvasSections.length - 1]?.id, "ins-end")}
        </div>
      </InlineEditContext.Provider>
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

        {/* Inline edit status badge */}
        <InlineEditStatus editingId={editingId} />

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
                preFocusSidebarState.current = null;
              }
            } else {
              preFocusSidebarState.current = { left: leftCollapsed };
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
        {hasUnpublishedChanges && !publishing && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-full px-2 py-0.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Unpublished changes
          </span>
        )}
        <button
          onClick={() => setShowPublishConfirm(true)}
          disabled={publishing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
            hasUnpublishedChanges
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/30"
              : "bg-primary/80 text-primary-foreground hover:bg-primary/70"
          }`}
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
          style={{ width: leftCollapsed ? '36px' : 'clamp(160px, 13%, 200px)' }}
        >
          {leftCollapsed ? (
            <div className="flex flex-col items-center py-2 gap-3">
              <button
                type="button"
                onClick={() => setLeftCollapsed(false)}
                title="Show structure panel"
                className="flex flex-col items-center gap-1 px-1.5 py-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronsRight className="w-4 h-4" />
                <span className="text-[9px] font-medium uppercase tracking-wider" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Structure</span>
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
                title="Hide structure panel"
                className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium">Hide</span>
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

          {/* Scrollable body — tree + theme designer scroll together; header & search stay sticky above */}
          <div ref={sidebarListRef} className="flex-1 min-h-0 overflow-y-auto">

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
          <div className="p-2 space-y-0.5">
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
                    icon: getSectionTypeIcons()[s.type] ?? <Layers className="w-3 h-3 flex-shrink-0" />,
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
              const sortablePageIds = treeData
                .filter(n => n.type === "page" && n.id !== "home")
                .map(n => n.id);
              return (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePageDragEnd}>
                  <SortableContext items={sortablePageIds} strategy={verticalListSortingStrategy}>
                    {treeData.map(node => (
                      <SiteTreeNode key={node.id} node={node} depth={0} {...treeNodeProps} />
                    ))}
                  </SortableContext>
                </DndContext>
              );
            })()}
          </div>

          {/* Theme Designer */}
          <div className="border-t border-border">

            {/* Colors */}
            <details className="group" open>
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

          </div>{/* end scrollable body */}
        </>
        )}
        </div>
        )}

        {/* Canvas + docked inspector — flex row fills remaining space */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas — live preview, scrolls */}
          <div
            data-editor-canvas="true"
            className={`flex-1 overflow-y-auto bg-muted/30 ${!focusMode ? "cursor-zoom-in" : ""}`}
            onClick={() => setActiveSection(null)}
            onDoubleClick={e => {
              if (focusMode) return;
              if ((e.target as HTMLElement).closest("[data-section-canvas-id]")) return;
              preFocusSidebarState.current = { left: leftCollapsed };
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
          {/* Docked inspector panel — desktop only, auto-sizes beside canvas as flex sibling */}
          {!editorNarrow && activeSection && activeTab === "editor" && !focusMode && (() => {
            const sec = sections.find(s => s.id === activeSection);
            if (!sec || sec.type === "header") return null;

            let selectedComponent: SiteComponent | undefined;
            let rowData: RowSectionData | undefined;
            let selectedRowColumnId: string | undefined;
            let onChangeComponent: ((comp: SiteComponent) => void) | undefined;
            let onChangeRowData: ((data: RowSectionData) => void) | undefined;
            let specialContent: React.ReactNode | undefined;

            if (sec.type === "content" && selectedComponentState?.sectionId === sec.id) {
              const contentData = sec.content as { components?: SiteComponent[] };
              const comp = contentData.components?.find(c => c.id === selectedComponentState.componentId);
              if (comp) {
                selectedComponent = comp as SiteComponent;
                onChangeComponent = (updatedComp: SiteComponent) => {
                  const newComponents = (contentData.components ?? []).map(c =>
                    c.id === updatedComp.id ? updatedComp : c
                  );
                  updateContent(sec.id, { ...contentData, components: newComponents });
                };
              }
            } else if (sec.type === "row") {
              rowData = sec.content as RowSectionData;
              onChangeRowData = (newData: RowSectionData) =>
                updateContent(sec.id, newData as unknown as Record<string, unknown>);
              if (selectedRowState?.sectionId === sec.id && selectedRowState.componentId) {
                const selCol = rowData.columns?.find(c => c.id === selectedRowState.columnId);
                const selComp = selCol?.components?.find(c => c.id === selectedRowState.componentId);
                if (selComp) {
                  selectedComponent = selComp as SiteComponent;
                  selectedRowColumnId = selectedRowState.columnId;
                  onChangeComponent = (updatedComp: SiteComponent) => {
                    const newCols = (rowData!.columns ?? []).map(col =>
                      col.id === selectedRowState.columnId
                        ? { ...col, components: col.components.map(cp => cp.id === updatedComp.id ? updatedComp : cp) }
                        : col
                    );
                    updateContent(sec.id, { ...rowData!, columns: newCols } as unknown as Record<string, unknown>);
                  };
                }
              }
            } else if (sec.type === "deposit") {
              specialContent = <DepositSubmissionsPanel businessId={bizId} />;
            } else if (sec.type === "service-area") {
              const sa = sec.content as { heading?: string; subheading?: string; areas?: string[] };
              const saAreas = sa.areas ?? [];
              specialContent = (
                <div className="p-3 space-y-2.5 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service Areas</p>
                  <div className="space-y-1.5">
                    {saAreas.map((area, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          value={area}
                          onChange={e => { const next = [...saAreas]; next[idx] = e.target.value; updateContent(sec.id, { ...sa, areas: next }); }}
                        />
                        <button type="button" onClick={() => updateContent(sec.id, { ...sa, areas: saAreas.filter((_, i) => i !== idx) })}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button"
                    onClick={() => updateContent(sec.id, { ...sa, areas: [...saAreas, "New Location"] })}
                    className="text-xs w-full border border-dashed border-border rounded px-2 py-1.5 hover:bg-muted text-muted-foreground transition-colors">
                    + Add Area
                  </button>
                </div>
              );
            } else if (sec.type === "before-after") {
              const ba = sec.content as { heading?: string; pairs?: Array<{ id: string; caption?: string; beforeUrl?: string; afterUrl?: string; beforeLabel?: string; afterLabel?: string }> };
              const baPairs = ba.pairs ?? [];
              specialContent = (
                <div className="p-3 space-y-2.5 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Before & After Pairs</p>
                  <div className="space-y-2">
                    {baPairs.map((pair, idx) => (
                      <div key={pair.id} className="border border-border rounded-lg p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">Pair {idx + 1}</span>
                          <button type="button" onClick={() => updateContent(sec.id, { ...ba, pairs: baPairs.filter(p => p.id !== pair.id) })}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <input
                          className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Caption (optional)"
                          value={pair.caption ?? ""}
                          onChange={e => updateContent(sec.id, { ...ba, pairs: baPairs.map(p => p.id === pair.id ? { ...p, caption: e.target.value } : p) })}
                        />
                        <div className="flex gap-1">
                          <button type="button"
                            onClick={() => openMediaLibrary(url => updateContent(sec.id, { ...ba, pairs: baPairs.map(p => p.id === pair.id ? { ...p, beforeUrl: url } : p) }))}
                            className={`flex-1 text-xs border rounded px-1.5 py-1 hover:bg-muted truncate transition-colors ${pair.beforeUrl ? "border-green-500 text-green-700" : "border-border text-muted-foreground"}`}>
                            {pair.beforeUrl ? "✓ Before" : "Before img"}
                          </button>
                          <button type="button"
                            onClick={() => openMediaLibrary(url => updateContent(sec.id, { ...ba, pairs: baPairs.map(p => p.id === pair.id ? { ...p, afterUrl: url } : p) }))}
                            className={`flex-1 text-xs border rounded px-1.5 py-1 hover:bg-muted truncate transition-colors ${pair.afterUrl ? "border-green-500 text-green-700" : "border-border text-muted-foreground"}`}>
                            {pair.afterUrl ? "✓ After" : "After img"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button"
                    onClick={() => { const id = `pair-${Date.now()}`; updateContent(sec.id, { ...ba, pairs: [...baPairs, { id, beforeLabel: "Before", afterLabel: "After", caption: "" }] }); }}
                    className="text-xs w-full border border-dashed border-border rounded px-2 py-1.5 hover:bg-muted text-muted-foreground transition-colors">
                    + Add Pair
                  </button>
                </div>
              );
            }

            if (selectedCardData && selectedCardState?.sectionId === sec.id) {
              let handleCardChange: (u: CardComponent) => void = () => {};
              let handleCardDuplicate: () => void = () => {};
              let handleCardDelete: () => void = () => {};

              if (sec.type === "services") {
                const d = sec.content as { heading?: string; items?: CardComponent[] };
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...d, items: (d.items ?? []).map(i => i.id === u.id ? u : i) }); };
                handleCardDuplicate = () => {
                  const items = d.items ?? [];
                  const idx = items.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...items[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...d, items: [...items.slice(0, idx + 1), duped, ...items.slice(idx + 1)] });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...d, items: (d.items ?? []).filter(i => i.id !== selectedCardState.cardId) }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (sec.type === "testimonials") {
                const raw = sec.content as { heading?: string; items?: CardComponent[]; testimonials?: any[] };
                let tItems: CardComponent[] = raw.items ?? [];
                if (tItems.length === 0 && raw.testimonials?.length) {
                  tItems = (raw.testimonials as any[]).map((t: any) => ({
                    id: t.id, title: t.name,
                    description: `"${t.quote}"${t.location ? `\n\n— ${t.location}` : ""}`,
                    mediaType: "none" as const, layout: "horizontal" as const,
                    textAlign: "left" as const, hoverEffect: "none" as const, clickAction: "none" as const,
                    templateType: "testimonial" as const,
                    badgeEnabled: t.rating > 0, badgeText: "★".repeat(Math.min(t.rating, 5)),
                    badgeColor: "#f59e0b", badgeTextColor: "#ffffff", badgePosition: "top-right" as const,
                  }));
                }
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, items: tItems.map(i => i.id === u.id ? u : i), testimonials: undefined }); };
                handleCardDuplicate = () => {
                  const idx = tItems.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...tItems[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, items: [...tItems.slice(0, idx + 1), duped, ...tItems.slice(idx + 1)], testimonials: undefined });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, items: tItems.filter(i => i.id !== selectedCardState.cardId), testimonials: undefined }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (sec.type === "stats") {
                const raw = sec.content as { heading?: string; items?: CardComponent[]; stats?: any[] };
                const STAT_ICONS_FB = ["Star", "CheckCircle2", "Award", "Clock", "Users", "Briefcase"];
                let sItems: CardComponent[] = raw.items ?? [];
                if (sItems.length === 0 && raw.stats?.length) {
                  sItems = (raw.stats as any[]).map((st: any, idx: number) => ({
                    id: st.id, title: st.value, description: st.label,
                    mediaType: "icon" as const, iconName: STAT_ICONS_FB[idx % STAT_ICONS_FB.length],
                    layout: "icon-top" as const, textAlign: "center" as const,
                    hoverEffect: "none" as const, clickAction: "none" as const,
                  }));
                }
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, items: sItems.map(i => i.id === u.id ? u : i), stats: undefined }); };
                handleCardDuplicate = () => {
                  const idx = sItems.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...sItems[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, items: [...sItems.slice(0, idx + 1), duped, ...sItems.slice(idx + 1)], stats: undefined });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, items: sItems.filter(i => i.id !== selectedCardState.cardId), stats: undefined }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (sec.type === "faq") {
                const raw = sec.content as { heading?: string; items?: unknown[]; displayMode?: string; cards?: CardComponent[] };
                const faqCards = raw.cards ?? [];
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, cards: faqCards.map(c => c.id === u.id ? u : c) }); };
                handleCardDuplicate = () => {
                  const idx = faqCards.findIndex(c => c.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...faqCards[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, cards: [...faqCards.slice(0, idx + 1), duped, ...faqCards.slice(idx + 1)] });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, cards: faqCards.filter(c => c.id !== selectedCardState.cardId) }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (
                sec.type === "featured-clients" || sec.type === "partners" ||
                sec.type === "certifications" || sec.type === "why-choose-us"
              ) {
                const raw = sec.content as { heading?: string; items?: CardComponent[] };
                const rItems = raw.items ?? [];
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, items: rItems.map(i => i.id === u.id ? u : i) }); };
                handleCardDuplicate = () => {
                  const idx = rItems.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...rItems[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, items: [...rItems.slice(0, idx + 1), duped, ...rItems.slice(idx + 1)] });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, items: rItems.filter(i => i.id !== selectedCardState.cardId) }); setSelectedCardState(null); setSelectedCardData(null); };
              }

              return (
                <div className="flex-shrink-0 border-l border-border bg-card flex flex-col overflow-hidden"
                  style={{ width: 280 }} onClick={e => e.stopPropagation()}>
                  <CardItemEditorPanel
                    card={selectedCardData}
                    onChange={handleCardChange}
                    onDuplicate={handleCardDuplicate}
                    onDelete={handleCardDelete}
                    onClose={() => { setSelectedCardState(null); setSelectedCardData(null); setActiveSection(null); }}
                    onOpenMediaLibrary={openMediaLibrary}
                    businessId={bizId}
                  />
                </div>
              );
            }

            return (
              <InspectorPanel
                pageName={pages.find(p => p.id === activePageId)?.name ?? "Home"}
                section={sec}
                selectedComponent={selectedComponent}
                rowData={rowData}
                selectedRowColumnId={selectedRowColumnId}
                onChangeBlockStyle={bs => updateBlockStyle(sec.id, bs)}
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
                onApplyStyleTo={applyStyleTo}
                onToggleSection={() => toggleSection(sec.id)}
                onDuplicateSection={() => duplicateSection(sec.id)}
                onDeleteSection={() => handleDeleteSectionClick(sec.id)}
                onChangeComponent={onChangeComponent}
                onComponentImageUpload={handleContentComponentImageUpload}
                onChangeRowData={onChangeRowData}
                collapsed={false}
                onCollapse={() => setActiveSection(null)}
                onExpand={() => {}}
                autoCollapsed={false}
                onClearAutoCollapse={() => {}}
                specialContent={specialContent}
                initialTab={contextInspectorTab}
              />
            );
          })()}
          {/* Narrow screen: fixed bottom drawer (position:fixed escapes any overflow clipping) */}
          {editorNarrow && activeSection && activeTab === "editor" && !focusMode && (() => {
            const sec = sections.find(s => s.id === activeSection);
            if (!sec || sec.type === "header") return null;

            let selectedComponent: SiteComponent | undefined;
            let rowData: RowSectionData | undefined;
            let selectedRowColumnId: string | undefined;
            let onChangeComponent: ((comp: SiteComponent) => void) | undefined;
            let onChangeRowData: ((data: RowSectionData) => void) | undefined;
            let specialContent: React.ReactNode | undefined;

            if (sec.type === "content" && selectedComponentState?.sectionId === sec.id) {
              const contentData = sec.content as { components?: SiteComponent[] };
              const comp = contentData.components?.find(c => c.id === selectedComponentState.componentId);
              if (comp) {
                selectedComponent = comp as SiteComponent;
                onChangeComponent = (updatedComp: SiteComponent) => {
                  const newComponents = (contentData.components ?? []).map(c =>
                    c.id === updatedComp.id ? updatedComp : c
                  );
                  updateContent(sec.id, { ...contentData, components: newComponents });
                };
              }
            } else if (sec.type === "row") {
              rowData = sec.content as RowSectionData;
              onChangeRowData = (newData: RowSectionData) =>
                updateContent(sec.id, newData as unknown as Record<string, unknown>);
              if (selectedRowState?.sectionId === sec.id && selectedRowState.componentId) {
                const selCol = rowData.columns?.find(c => c.id === selectedRowState.columnId);
                const selComp = selCol?.components?.find(c => c.id === selectedRowState.componentId);
                if (selComp) {
                  selectedComponent = selComp as SiteComponent;
                  selectedRowColumnId = selectedRowState.columnId;
                  onChangeComponent = (updatedComp: SiteComponent) => {
                    const newCols = (rowData!.columns ?? []).map(col =>
                      col.id === selectedRowState.columnId
                        ? { ...col, components: col.components.map(cp => cp.id === updatedComp.id ? updatedComp : cp) }
                        : col
                    );
                    updateContent(sec.id, { ...rowData!, columns: newCols } as unknown as Record<string, unknown>);
                  };
                }
              }
            } else if (sec.type === "deposit") {
              specialContent = <DepositSubmissionsPanel businessId={bizId} />;
            } else if (sec.type === "service-area") {
              const sa = sec.content as { heading?: string; subheading?: string; areas?: string[] };
              const saAreas = sa.areas ?? [];
              specialContent = (
                <div className="p-3 space-y-2.5 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Service Areas</p>
                  <div className="space-y-1.5">
                    {saAreas.map((area, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          value={area}
                          onChange={e => { const next = [...saAreas]; next[idx] = e.target.value; updateContent(sec.id, { ...sa, areas: next }); }}
                        />
                        <button type="button" onClick={() => updateContent(sec.id, { ...sa, areas: saAreas.filter((_, i) => i !== idx) })}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button"
                    onClick={() => updateContent(sec.id, { ...sa, areas: [...saAreas, "New Location"] })}
                    className="text-xs w-full border border-dashed border-border rounded px-2 py-1.5 hover:bg-muted text-muted-foreground transition-colors">
                    + Add Area
                  </button>
                </div>
              );
            } else if (sec.type === "before-after") {
              const ba = sec.content as { heading?: string; pairs?: Array<{ id: string; caption?: string; beforeUrl?: string; afterUrl?: string; beforeLabel?: string; afterLabel?: string }> };
              const baPairs = ba.pairs ?? [];
              specialContent = (
                <div className="p-3 space-y-2.5 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Before & After Pairs</p>
                  <div className="space-y-2">
                    {baPairs.map((pair, idx) => (
                      <div key={pair.id} className="border border-border rounded-lg p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">Pair {idx + 1}</span>
                          <button type="button" onClick={() => updateContent(sec.id, { ...ba, pairs: baPairs.filter(p => p.id !== pair.id) })}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <input
                          className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Caption (optional)"
                          value={pair.caption ?? ""}
                          onChange={e => updateContent(sec.id, { ...ba, pairs: baPairs.map(p => p.id === pair.id ? { ...p, caption: e.target.value } : p) })}
                        />
                        <div className="flex gap-1">
                          <button type="button"
                            onClick={() => openMediaLibrary(url => updateContent(sec.id, { ...ba, pairs: baPairs.map(p => p.id === pair.id ? { ...p, beforeUrl: url } : p) }))}
                            className={`flex-1 text-xs border rounded px-1.5 py-1 hover:bg-muted truncate transition-colors ${pair.beforeUrl ? "border-green-500 text-green-700" : "border-border text-muted-foreground"}`}>
                            {pair.beforeUrl ? "✓ Before" : "Before img"}
                          </button>
                          <button type="button"
                            onClick={() => openMediaLibrary(url => updateContent(sec.id, { ...ba, pairs: baPairs.map(p => p.id === pair.id ? { ...p, afterUrl: url } : p) }))}
                            className={`flex-1 text-xs border rounded px-1.5 py-1 hover:bg-muted truncate transition-colors ${pair.afterUrl ? "border-green-500 text-green-700" : "border-border text-muted-foreground"}`}>
                            {pair.afterUrl ? "✓ After" : "After img"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button"
                    onClick={() => { const id = `pair-${Date.now()}`; updateContent(sec.id, { ...ba, pairs: [...baPairs, { id, beforeLabel: "Before", afterLabel: "After", caption: "" }] }); }}
                    className="text-xs w-full border border-dashed border-border rounded px-2 py-1.5 hover:bg-muted text-muted-foreground transition-colors">
                    + Add Pair
                  </button>
                </div>
              );
            }

            const drawerClass = "fixed bottom-0 left-0 right-0 z-50 rounded-t-xl shadow-2xl border-t border-border bg-card flex flex-col overflow-hidden max-h-[50vh]";

            if (selectedCardData && selectedCardState?.sectionId === sec.id) {
              let handleCardChange: (u: CardComponent) => void = () => {};
              let handleCardDuplicate: () => void = () => {};
              let handleCardDelete: () => void = () => {};

              if (sec.type === "services") {
                const d = sec.content as { heading?: string; items?: CardComponent[] };
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...d, items: (d.items ?? []).map(i => i.id === u.id ? u : i) }); };
                handleCardDuplicate = () => {
                  const items = d.items ?? [];
                  const idx = items.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...items[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...d, items: [...items.slice(0, idx + 1), duped, ...items.slice(idx + 1)] });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...d, items: (d.items ?? []).filter(i => i.id !== selectedCardState.cardId) }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (sec.type === "testimonials") {
                const raw = sec.content as { heading?: string; items?: CardComponent[]; testimonials?: any[] };
                let tItems: CardComponent[] = raw.items ?? [];
                if (tItems.length === 0 && raw.testimonials?.length) {
                  tItems = (raw.testimonials as any[]).map((t: any) => ({
                    id: t.id, title: t.name,
                    description: `"${t.quote}"${t.location ? `\n\n— ${t.location}` : ""}`,
                    mediaType: "none" as const, layout: "horizontal" as const,
                    textAlign: "left" as const, hoverEffect: "none" as const, clickAction: "none" as const,
                    templateType: "testimonial" as const,
                    badgeEnabled: t.rating > 0, badgeText: "★".repeat(Math.min(t.rating, 5)),
                    badgeColor: "#f59e0b", badgeTextColor: "#ffffff", badgePosition: "top-right" as const,
                  }));
                }
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, items: tItems.map(i => i.id === u.id ? u : i), testimonials: undefined }); };
                handleCardDuplicate = () => {
                  const idx = tItems.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...tItems[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, items: [...tItems.slice(0, idx + 1), duped, ...tItems.slice(idx + 1)], testimonials: undefined });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, items: tItems.filter(i => i.id !== selectedCardState.cardId), testimonials: undefined }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (sec.type === "stats") {
                const raw = sec.content as { heading?: string; items?: CardComponent[]; stats?: any[] };
                const STAT_ICONS_FB = ["Star", "CheckCircle2", "Award", "Clock", "Users", "Briefcase"];
                let sItems: CardComponent[] = raw.items ?? [];
                if (sItems.length === 0 && raw.stats?.length) {
                  sItems = (raw.stats as any[]).map((st: any, idx: number) => ({
                    id: st.id, title: st.value, description: st.label,
                    mediaType: "icon" as const, iconName: STAT_ICONS_FB[idx % STAT_ICONS_FB.length],
                    layout: "icon-top" as const, textAlign: "center" as const,
                    hoverEffect: "none" as const, clickAction: "none" as const,
                  }));
                }
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, items: sItems.map(i => i.id === u.id ? u : i), stats: undefined }); };
                handleCardDuplicate = () => {
                  const idx = sItems.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...sItems[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, items: [...sItems.slice(0, idx + 1), duped, ...sItems.slice(idx + 1)], stats: undefined });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, items: sItems.filter(i => i.id !== selectedCardState.cardId), stats: undefined }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (sec.type === "faq") {
                const raw = sec.content as { heading?: string; items?: unknown[]; displayMode?: string; cards?: CardComponent[] };
                const faqCards = raw.cards ?? [];
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, cards: faqCards.map(c => c.id === u.id ? u : c) }); };
                handleCardDuplicate = () => {
                  const idx = faqCards.findIndex(c => c.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...faqCards[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, cards: [...faqCards.slice(0, idx + 1), duped, ...faqCards.slice(idx + 1)] });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, cards: faqCards.filter(c => c.id !== selectedCardState.cardId) }); setSelectedCardState(null); setSelectedCardData(null); };
              } else if (
                sec.type === "featured-clients" || sec.type === "partners" ||
                sec.type === "certifications" || sec.type === "why-choose-us"
              ) {
                const raw = sec.content as { heading?: string; items?: CardComponent[] };
                const rItems = raw.items ?? [];
                handleCardChange = (u) => { setSelectedCardData(u); updateContent(sec.id, { ...raw, items: rItems.map(i => i.id === u.id ? u : i) }); };
                handleCardDuplicate = () => {
                  const idx = rItems.findIndex(i => i.id === selectedCardState.cardId);
                  if (idx >= 0) {
                    const duped = { ...rItems[idx], id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
                    updateContent(sec.id, { ...raw, items: [...rItems.slice(0, idx + 1), duped, ...rItems.slice(idx + 1)] });
                    setSelectedCardState({ sectionId: sec.id, cardId: duped.id }); setSelectedCardData(duped);
                  }
                };
                handleCardDelete = () => { updateContent(sec.id, { ...raw, items: rItems.filter(i => i.id !== selectedCardState.cardId) }); setSelectedCardState(null); setSelectedCardData(null); };
              }

              return (
                <div className={drawerClass}>
                  <CardItemEditorPanel
                    card={selectedCardData}
                    onChange={handleCardChange}
                    onDuplicate={handleCardDuplicate}
                    onDelete={handleCardDelete}
                    onClose={() => { setSelectedCardState(null); setSelectedCardData(null); setActiveSection(null); }}
                    onOpenMediaLibrary={openMediaLibrary}
                    businessId={bizId}
                  />
                </div>
              );
            }

            return (
              <div className={drawerClass}>
                <div className="flex items-center justify-end px-2 py-1.5 flex-shrink-0 border-b border-border/50 bg-muted/20">
                  <button type="button" onClick={() => setActiveSection(null)}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Close inspector">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  <InspectorPanel
                    pageName={pages.find(p => p.id === activePageId)?.name ?? "Home"}
                    section={sec}
                    selectedComponent={selectedComponent}
                    rowData={rowData}
                    selectedRowColumnId={selectedRowColumnId}
                    onChangeBlockStyle={bs => updateBlockStyle(sec.id, bs)}
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
                    onApplyStyleTo={applyStyleTo}
                    onToggleSection={() => toggleSection(sec.id)}
                    onDuplicateSection={() => duplicateSection(sec.id)}
                    onDeleteSection={() => handleDeleteSectionClick(sec.id)}
                    onChangeComponent={onChangeComponent}
                    onComponentImageUpload={handleContentComponentImageUpload}
                    onChangeRowData={onChangeRowData}
                    collapsed={false}
                    onCollapse={() => setActiveSection(null)}
                    onExpand={() => {}}
                    autoCollapsed={false}
                    onClearAutoCollapse={() => {}}
                    specialContent={specialContent}
                    initialTab={contextInspectorTab}
                  />
                </div>
              </div>
            );
          })()}
        </div>
        </>)}
      </div>
    </div>
    {contextMenu && (
      <CanvasContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        groups={contextMenu.groups}
        onClose={() => setContextMenu(null)}
      />
    )}
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
