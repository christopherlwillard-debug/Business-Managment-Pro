import React, { useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
  DragOverlay, type DragStartEvent, type DragOverEvent, type DragMoveEvent,
} from "@dnd-kit/core";
import { InlineEditableText } from "../InlineEditableText";
import { useInlineEditContext } from "../InlineEditContext";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, GripVertical, Trash2, Copy, Type, AlignLeft, AlignCenter, AlignRight, MousePointer,
  Image as ImageIcon, Minus, Smile, PlayCircle, Square, Quote, Mail, MapPin, Layers,
  ClipboardPaste, Link2, FileText, Check, X,
} from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { buttonConfigToStyle, buttonConfigToClasses, type ButtonConfig } from "./ButtonEditor";
import { textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { EditableWrapper } from "../EditableWrapper";
import { useToast } from "@/hooks/use-toast";
import type { CardComponent } from "../website-types";

export type ComponentType =
  | "heading" | "paragraph" | "button" | "image" | "divider"
  | "icon" | "video" | "card" | "testimonial" | "form" | "map";

export interface HeadingProps {
  text: string;
  level?: 1 | 2 | 3 | 4;
  align?: "left" | "center" | "right";
  style?: TextStyle;
  link?: string;
}
export interface ParagraphProps {
  text: string;
  align?: "left" | "center" | "right";
  style?: TextStyle;
  link?: string;
}
export interface ButtonCompProps {
  label: string;
  config?: ButtonConfig;
  align?: "left" | "center" | "right";
  /** Fixed pixel width set via canvas drag-resize. When set the button is block-level at that width. */
  widthPx?: number;
}
export interface ImageCompProps {
  url?: string;
  alt?: string;
  objectFit?: "cover" | "contain";
  width?: "full" | "half" | "quarter" | "auto";
  /** Fixed pixel width set via canvas drag-resize; overrides the class-based `width` preset when present. */
  widthPx?: number;
  borderRadius?: number;
  caption?: string;
  link?: string;
}
export interface DividerCompProps {
  color?: string;
  thickness?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  marginY?: number;
}
export interface IconCompProps {
  emoji?: string;
  size?: number;
  align?: "left" | "center" | "right";
}
export interface VideoCompProps {
  url?: string;
  caption?: string;
  aspectRatio?: "16/9" | "4/3" | "1/1";
}
/**
 * Card component props for the ContentSection row/column builder.
 * Extends the shared CardComponent design fields so ContentSection cards
 * inherit universal per-card design overrides (shadow, radius, padding, etc.)
 * while keeping backward-compatible aliases (body → description, ctaLabel → buttonLabel).
 */
export interface CardCompProps extends Pick<CardComponent,
  | "title"
  | "mediaType" | "iconName" | "iconColor" | "iconBgColor" | "iconSize"
  | "imageUrl"
  | "buttonLabel" | "buttonUrl"
  | "hoverEffect" | "layout" | "textAlign"
  | "cardBgColor" | "cardBorderColor" | "cardBorderWidth" | "cardBorderRadius"
  | "cardShadow" | "cardPadding" | "cardTextColor" | "cardTitleColor"
> {
  /** Card body / description text */
  body: string;
  /** @deprecated Use buttonLabel */
  ctaLabel?: string;
  /** @deprecated Use buttonUrl */
  ctaUrl?: string;
}
export interface TestimonialCompProps {
  quote: string;
  author: string;
  role?: string;
  avatarUrl?: string;
  rating?: number;
}
export interface FormCompProps {
  heading?: string;
  submitLabel?: string;
  nameField?: boolean;
  emailField?: boolean;
  phoneField?: boolean;
  messageField?: boolean;
}
export interface MapCompProps {
  address?: string;
  embedUrl?: string;
  height?: number;
}

export type SiteComponentProps =
  | HeadingProps | ParagraphProps | ButtonCompProps | ImageCompProps | DividerCompProps
  | IconCompProps | VideoCompProps | CardCompProps | TestimonialCompProps | FormCompProps | MapCompProps;

export interface SiteComponent {
  id: string;
  type: ComponentType;
  props: SiteComponentProps;
  /** When true the component is hidden from the public site; dimmed on canvas */
  hidden?: boolean;
  /** When true the component is locked: cannot be edited, moved, or deleted until unlocked */
  locked?: boolean;
}

export interface ContentSectionData {
  components: SiteComponent[];
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultContentSectionData(): ContentSectionData {
  return {
    components: [
      { id: uid(), type: "heading", props: { text: "Section Heading", level: 2, align: "left" } as HeadingProps },
      { id: uid(), type: "paragraph", props: { text: "Add your content here. Click a component to select it and edit its properties in the right panel.", align: "left" } as ParagraphProps },
    ],
    maxWidth: "lg",
  };
}

type ContentComponentTypeEntry = {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  description: string;
};

let _contentComponentTypes: ContentComponentTypeEntry[] | null = null;

export function getContentComponentTypes(): ContentComponentTypeEntry[] {
  if (!_contentComponentTypes) {
    _contentComponentTypes = [
      { type: "heading",     label: "Heading",     icon: <Type className="w-4 h-4" />,         description: "H1–H4 title text" },
      { type: "paragraph",   label: "Paragraph",   icon: <AlignLeft className="w-4 h-4" />,    description: "Body text block" },
      { type: "button",      label: "Button",      icon: <MousePointer className="w-4 h-4" />, description: "Clickable button or link" },
      { type: "image",       label: "Image",       icon: <ImageIcon className="w-4 h-4" />,    description: "Photo or graphic" },
      { type: "divider",     label: "Divider",     icon: <Minus className="w-4 h-4" />,        description: "Horizontal rule" },
      { type: "icon",        label: "Icon",        icon: <Smile className="w-4 h-4" />,        description: "Emoji or symbol" },
      { type: "video",       label: "Video",       icon: <PlayCircle className="w-4 h-4" />,   description: "YouTube / Vimeo embed" },
      { type: "card",        label: "Card",        icon: <Square className="w-4 h-4" />,       description: "Image + text + CTA card" },
      { type: "testimonial", label: "Testimonial", icon: <Quote className="w-4 h-4" />,        description: "Customer quote" },
      { type: "form",        label: "Form",        icon: <Mail className="w-4 h-4" />,         description: "Simple contact form" },
      { type: "map",         label: "Map",         icon: <MapPin className="w-4 h-4" />,       description: "Google Maps embed" },
    ];
  }
  return _contentComponentTypes;
}

export function defaultPropsForType(type: ComponentType): SiteComponentProps {
  switch (type) {
    case "heading":     return { text: "New Heading", level: 2, align: "left" } as HeadingProps;
    case "paragraph":   return { text: "Enter your paragraph text here.", align: "left" } as ParagraphProps;
    case "button":      return { label: "Click Here", config: { url: "#contact" } } as ButtonCompProps;
    case "image":       return { url: "", alt: "", width: "full" } as ImageCompProps;
    case "divider":     return { color: "#e5e7eb", thickness: 1 } as DividerCompProps;
    case "icon":        return { emoji: "⭐", size: 40, align: "left" } as IconCompProps;
    case "video":       return { url: "", caption: "" } as VideoCompProps;
    case "card":        return { title: "Card Title", body: "Card description text.", ctaLabel: "Learn More", ctaUrl: "#" } as CardCompProps;
    case "testimonial": return { quote: "This service was exceptional!", author: "Customer Name", role: "Customer", rating: 5 } as TestimonialCompProps;
    case "form":        return { heading: "Get in Touch", submitLabel: "Send Message", nameField: true, emailField: true, phoneField: false, messageField: true } as FormCompProps;
    case "map":         return { address: "", height: 300 } as MapCompProps;
  }
}

function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  if (url.includes("embed") || url.includes("player")) return url;
  return null;
}

function getMapEmbedUrl(address: string, embedUrl?: string): string {
  if (embedUrl) return embedUrl;
  if (!address) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

const MAX_WIDTH_CLASS: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-none",
};

/**
 * Inline-editable variant of renderSiteComponent.
 * Used in the canvas public-view when a sectionId is available, so that
 * double-clicking heading/paragraph/button text opens inline editing.
 * Non-text component types fall back to the static renderer.
 */
export function renderSiteComponentEditable(
  comp: SiteComponent,
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string },
  sectionId: string,
  onUpdateComp: (updated: SiteComponent) => void,
): React.ReactNode {
  switch (comp.type) {
    case "heading": {
      const p = comp.props as HeadingProps;
      const Tag = (`h${p.level ?? 2}`) as "h1" | "h2" | "h3" | "h4";
      const sizes: Record<number, string> = { 1: "text-4xl", 2: "text-3xl", 3: "text-2xl", 4: "text-xl" };
      return (
        <InlineEditableText
          id={`${sectionId}-${comp.id}-heading`}
          value={p.text}
          placeholder="Heading text"
          as={Tag}
          className={`font-bold ${sizes[p.level ?? 2] ?? "text-3xl"} leading-tight`}
          style={{ textAlign: p.align ?? "left", whiteSpace: "pre-line", color: "var(--theme-text, #111827)", ...textStyleToCSS(p.style) }}
          onCommit={(v) => onUpdateComp({ ...comp, props: { ...p, text: v } })}
        />
      );
    }
    case "paragraph": {
      const p = comp.props as ParagraphProps;
      return (
        <InlineEditableText
          id={`${sectionId}-${comp.id}-paragraph`}
          value={p.text}
          placeholder="Paragraph text"
          as="p"
          className="leading-relaxed"
          style={{ textAlign: p.align ?? "left", whiteSpace: "pre-line", color: "var(--theme-text-muted, #374151)", ...textStyleToCSS(p.style) }}
          onCommit={(v) => onUpdateComp({ ...comp, props: { ...p, text: v } })}
        />
      );
    }
    case "button": {
      const p = comp.props as ButtonCompProps;
      const bStyle = buttonConfigToStyle(p.config);
      const bClasses = buttonConfigToClasses(p.config);
      const bg = bStyle.backgroundColor ?? settings.accentColor ?? settings.brandColor;
      const color = bStyle.color ?? "white";
      const radius = bStyle.borderRadius ?? "var(--theme-btn-radius, 9999px)";
      return (
        <div style={{ textAlign: p.widthPx ? "left" : (p.align ?? "left") }}>
          <InlineEditableText
            id={`${sectionId}-${comp.id}-button`}
            value={p.label || ""}
            placeholder="Button label"
            enterBehavior="commit"
            escapeBehavior="cancel"
            as="span"
            className={`inline-block transition-opacity hover:opacity-90 ${bClasses}`}
            style={{
              backgroundColor: bg,
              color,
              borderRadius: radius,
              fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
              boxShadow: "var(--theme-btn-shadow, none)",
              width: p.widthPx ? `${p.widthPx}px` : undefined,
              textAlign: p.widthPx ? "center" : undefined,
            }}
            onCommit={(v) => onUpdateComp({ ...comp, props: { ...p, label: v } })}
          />
        </div>
      );
    }
    default:
      return renderSiteComponent(comp, settings);
  }
}

export function renderSiteComponent(
  comp: SiteComponent,
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string }
): React.ReactNode {
  switch (comp.type) {
    case "heading": {
      const p = comp.props as HeadingProps;
      const Tag = (`h${p.level ?? 2}`) as "h1" | "h2" | "h3" | "h4";
      const sizes: Record<number, string> = { 1: "text-4xl", 2: "text-3xl", 3: "text-2xl", 4: "text-xl" };
      const el = (
        <Tag
          style={{ textAlign: p.align ?? "left", whiteSpace: "pre-line", color: "var(--theme-text, #111827)", ...textStyleToCSS(p.style) }}
          className={`font-bold ${sizes[p.level ?? 2] ?? "text-3xl"} leading-tight`}
        >
          {p.text}
        </Tag>
      );
      return p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{el}</a> : el;
    }
    case "paragraph": {
      const p = comp.props as ParagraphProps;
      const el = (
        <p
          style={{ textAlign: p.align ?? "left", whiteSpace: "pre-line", color: "var(--theme-text-muted, #374151)", ...textStyleToCSS(p.style) }}
          className="leading-relaxed"
        >
          {p.text}
        </p>
      );
      return p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{el}</a> : el;
    }
    case "button": {
      const p = comp.props as ButtonCompProps;
      const bStyle = buttonConfigToStyle(p.config);
      const bClasses = buttonConfigToClasses(p.config);
      const bg = bStyle.backgroundColor ?? settings.accentColor ?? settings.brandColor;
      const color = bStyle.color ?? "white";
      const radius = bStyle.borderRadius ?? "var(--theme-btn-radius, 9999px)";
      return (
        <div style={{ textAlign: p.widthPx ? "left" : (p.align ?? "left") }}>
          <a
            href={p.config?.url || "#"}
            target={p.config?.newTab ? "_blank" : undefined}
            rel={p.config?.newTab ? "noopener noreferrer" : undefined}
            className={`inline-block transition-opacity hover:opacity-90 ${bClasses}`}
            style={{
              backgroundColor: bg,
              color,
              borderRadius: radius,
              fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
              boxShadow: "var(--theme-btn-shadow, none)",
              width: p.widthPx ? `${p.widthPx}px` : undefined,
              textAlign: p.widthPx ? "center" : undefined,
            }}
          >
            {p.label || "Click here"}
          </a>
        </div>
      );
    }
    case "image": {
      const p = comp.props as ImageCompProps;
      const widthClassMap: Record<string, string> = { full: "w-full", half: "w-1/2", quarter: "w-1/4", auto: "w-auto" };
      if (!p.url) {
        return (
          <div className="w-full h-48 rounded-lg bg-gray-100 flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-gray-300" />
          </div>
        );
      }
      const figure = (
        <figure>
          <img
            src={p.url}
            alt={p.alt || ""}
            className={p.widthPx ? "rounded-lg" : `${widthClassMap[p.width ?? "full"] ?? "w-full"} rounded-lg`}
            style={{
              objectFit: p.objectFit ?? "cover",
              borderRadius: p.borderRadius ? `${p.borderRadius}px` : undefined,
              width: p.widthPx ? `${p.widthPx}px` : undefined,
              maxWidth: p.widthPx ? "100%" : undefined,
            }}
          />
          {p.caption && <figcaption className="text-xs mt-1 text-center" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{p.caption}</figcaption>}
        </figure>
      );
      return p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>{figure}</a> : figure;
    }
    case "divider": {
      const p = comp.props as DividerCompProps;
      return (
        <hr
          style={{
            borderColor: p.color ?? "#e5e7eb",
            borderTopWidth: p.thickness ?? 1,
            borderStyle: p.borderStyle ?? "solid",
            marginTop: p.marginY ?? 8,
            marginBottom: p.marginY ?? 8,
          }}
        />
      );
    }
    case "icon": {
      const p = comp.props as IconCompProps;
      return (
        <div style={{ textAlign: p.align ?? "left" }}>
          <span style={{ fontSize: `${p.size ?? 40}px`, lineHeight: 1 }}>{p.emoji ?? "⭐"}</span>
        </div>
      );
    }
    case "video": {
      const p = comp.props as VideoCompProps;
      const embedUrl = getVideoEmbedUrl(p.url ?? "");
      if (!embedUrl) {
        return (
          <div className="w-full aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
            <PlayCircle className="w-10 h-10 text-gray-300" />
          </div>
        );
      }
      const aspect = p.aspectRatio ?? "16/9";
      const paddingPct = aspect === "1/1" ? "100%" : aspect === "4/3" ? "75%" : "56.25%";
      return (
        <div className="rounded-lg overflow-hidden" style={{ position: "relative", paddingBottom: paddingPct, height: 0 }}>
          <iframe
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={p.caption || "Video"}
          />
        </div>
      );
    }
    case "card": {
      const p = comp.props as CardCompProps;
      return (
        <div
          className="overflow-hidden bg-white"
          style={{
            borderRadius: "var(--theme-card-radius, 0.75rem)",
            border: "var(--theme-card-border, 1px solid #e5e7eb)",
            boxShadow: "var(--theme-card-shadow, 0 1px 3px rgba(0,0,0,0.08))",
          }}
        >
          {p.imageUrl && <img src={p.imageUrl} alt="" className="w-full h-48 object-cover" />}
          <div className="p-5">
            <h3 className="font-bold text-lg mb-2" style={{ color: "var(--theme-text, #111827)" }}>{p.title}</h3>
            <p className="text-sm mb-4" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{p.body}</p>
            {p.ctaLabel && p.ctaUrl && (
              <a
                href={p.ctaUrl}
                className="inline-block px-4 py-2 text-sm text-white transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: settings.accentColor ?? settings.brandColor,
                  borderRadius: "var(--theme-btn-radius, 9999px)",
                  fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
                  boxShadow: "var(--theme-btn-shadow, none)",
                }}
              >
                {p.ctaLabel}
              </a>
            )}
          </div>
        </div>
      );
    }
    case "testimonial": {
      const p = comp.props as TestimonialCompProps;
      const stars = Math.max(0, Math.min(5, p.rating ?? 5));
      return (
        <blockquote className="border-l-4 pl-5 py-2" style={{ borderColor: settings.brandColor }}>
          {stars > 0 && <div className="text-yellow-400 text-sm mb-1">{"★".repeat(stars)}</div>}
          <p className="italic mb-3" style={{ color: "var(--theme-text-muted, #374151)" }}>"{p.quote}"</p>
          <div className="flex items-center gap-2">
            {p.avatarUrl && <img src={p.avatarUrl} alt={p.author} className="w-8 h-8 rounded-full object-cover" />}
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--theme-text, #111827)" }}>{p.author}</p>
              {p.role && <p className="text-xs" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{p.role}</p>}
            </div>
          </div>
        </blockquote>
      );
    }
    case "form": {
      const p = comp.props as FormCompProps;
      return (
        <div
          className="p-6"
          style={{
            backgroundColor: "var(--theme-surface, #f9fafb)",
            borderRadius: "var(--theme-card-radius, 0.75rem)",
            border: "var(--theme-card-border, 1px solid #e5e7eb)",
          }}
        >
          {p.heading && <h3 className="font-bold text-lg mb-4" style={{ color: "var(--theme-text, #111827)" }}>{p.heading}</h3>}
          <div className="space-y-3">
            {p.nameField    && <input type="text"  placeholder="Your Name"       className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" readOnly />}
            {p.emailField   && <input type="email" placeholder="Email Address"   className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" readOnly />}
            {p.phoneField   && <input type="tel"   placeholder="Phone Number"    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" readOnly />}
            {p.messageField && <textarea placeholder="Your message…" rows={4}    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-none" readOnly />}
          </div>
          <button
            type="button"
            className="mt-4 px-6 py-2.5 text-sm text-white w-full hover:opacity-90 transition-opacity"
            style={{
              backgroundColor: settings.accentColor ?? settings.brandColor,
              borderRadius: "var(--theme-btn-radius, 9999px)",
              fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
              boxShadow: "var(--theme-btn-shadow, none)",
            }}
          >
            {p.submitLabel ?? "Send Message"}
          </button>
        </div>
      );
    }
    case "map": {
      const p = comp.props as MapCompProps;
      const src = getMapEmbedUrl(p.address ?? "", p.embedUrl);
      if (!src) {
        return (
          <div className="w-full rounded-lg bg-gray-100 flex items-center justify-center" style={{ height: p.height ?? 300 }}>
            <MapPin className="w-10 h-10 text-gray-300" />
          </div>
        );
      }
      return (
        <iframe
          src={src}
          className="w-full rounded-lg border-0"
          style={{ height: p.height ?? 300 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Map"
        />
      );
    }
    default: return null;
  }
}

interface SortableItemProps {
  comp: SiteComponent;
  isSelected: boolean;
  /** M8: True when Shift+click has added this component to multi-selection. */
  isMultiSelected?: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onEdit?: () => void;
  /** Update this component's props directly from the toolbar (e.g. bold, align). */
  onUpdate?: (props: SiteComponentProps) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onToggleHide?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Opens the media library; calls back with the chosen URL. */
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string };
}

function SortableItem({ comp, isSelected, isMultiSelected, onSelect, onEdit, onUpdate, onDuplicate, onDelete, onCopy, onToggleHide, onContextMenu, onOpenMediaLibrary, settings }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: comp.id });
  const label = getContentComponentTypes().find(t => t.type === comp.type)?.label ?? comp.type;
  // Inline input mode for image/button/icon toolbars
  const [showInputMode, setShowInputMode] = useState<"alt" | "link" | "emoji" | null>(null);
  const [inputDraft, setInputDraft] = useState("");

  const dragHandle = (
    <div
      {...attributes}
      {...listeners}
      className="p-1 cursor-grab active:cursor-grabbing text-white/60 hover:text-white"
      title="Drag to reorder"
      onClick={e => e.stopPropagation()}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </div>
  );

  const copyBtn = onCopy ? (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onCopy(); }}
      title="Copy component"
      className="p-1 rounded text-white hover:bg-white/20 transition-colors"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  ) : null;

  /** Type-specific toolbar: text formatting for heading/paragraph; Replace for image.
   *  These buttons mutate props immediately (no sidebar needed) via onUpdate. */
  let typeToolbar: React.ReactNode = null;
  if (onUpdate && (comp.type === "heading" || comp.type === "paragraph")) {
    const p = comp.props as HeadingProps | ParagraphProps;
    const style = p.style ?? {};
    const isBold = style.fontWeight === "700";
    const isItalic = style.fontStyle === "italic";
    const align = style.textAlign ?? "left";
    const patchStyle = (patch: Partial<TextStyle>) =>
      onUpdate({ ...p, style: { ...style, ...patch } });
    typeToolbar = (
      <>
        <div className="w-px h-3.5 bg-white/20 mx-0.5" />
        <button type="button" title="Bold" onClick={e => { e.stopPropagation(); patchStyle({ fontWeight: isBold ? "400" : "700" }); }}
          className={`p-1 rounded text-xs font-bold leading-none transition-colors ${isBold ? "bg-white/30 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
          B
        </button>
        <button type="button" title="Italic" onClick={e => { e.stopPropagation(); patchStyle({ fontStyle: isItalic ? "normal" : "italic" }); }}
          className={`p-1 rounded text-xs italic leading-none transition-colors ${isItalic ? "bg-white/30 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
          I
        </button>
        <button type="button" title="Align left" onClick={e => { e.stopPropagation(); patchStyle({ textAlign: "left" }); }}
          className={`p-1 rounded transition-colors ${align === "left" ? "bg-white/30 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
          <AlignLeft className="w-3 h-3" />
        </button>
        <button type="button" title="Align center" onClick={e => { e.stopPropagation(); patchStyle({ textAlign: "center" }); }}
          className={`p-1 rounded transition-colors ${align === "center" ? "bg-white/30 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
          <AlignCenter className="w-3 h-3" />
        </button>
        <button type="button" title="Align right" onClick={e => { e.stopPropagation(); patchStyle({ textAlign: "right" }); }}
          className={`p-1 rounded transition-colors ${align === "right" ? "bg-white/30 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
          <AlignRight className="w-3 h-3" />
        </button>
        <label title="Text color" onClick={e => e.stopPropagation()}
          className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white transition-colors cursor-pointer flex items-center">
          <span className="w-3.5 h-3.5 rounded-full border border-white/40 inline-block flex-shrink-0"
            style={{ backgroundColor: style.color || "#374151" }} />
          <input type="color" value={style.color || "#374151"}
            onChange={e => patchStyle({ color: e.target.value })}
            className="sr-only" />
        </label>
        <button type="button" title={p.link ? `Link: ${p.link}` : "Add link"} onClick={e => { e.stopPropagation(); onEdit?.(); }}
          className={`p-1 rounded transition-colors ${p.link ? "bg-blue-500/40 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
          <Link2 className="w-3 h-3" />
        </button>
      </>
    );
  } else if (comp.type === "image") {
    const imgP = comp.props as ImageCompProps;
    if (showInputMode === "alt") {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <input autoFocus type="text" value={inputDraft} onChange={e => setInputDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onUpdate?.({ ...imgP, alt: inputDraft }); setShowInputMode(null); } if (e.key === "Escape") setShowInputMode(null); }}
            placeholder="Alt text…"
            className="px-1.5 py-0.5 rounded text-xs bg-white/20 text-white placeholder-white/40 outline-none border border-white/30 w-28"
            onClick={e => e.stopPropagation()} />
          <button type="button" onClick={e => { e.stopPropagation(); onUpdate?.({ ...imgP, alt: inputDraft }); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><Check className="w-3 h-3" /></button>
          <button type="button" onClick={e => { e.stopPropagation(); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><X className="w-3 h-3" /></button>
        </>
      );
    } else if (showInputMode === "link") {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <input autoFocus type="url" value={inputDraft} onChange={e => setInputDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onUpdate?.({ ...imgP, link: inputDraft || undefined }); setShowInputMode(null); } if (e.key === "Escape") setShowInputMode(null); }}
            placeholder="https://…"
            className="px-1.5 py-0.5 rounded text-xs bg-white/20 text-white placeholder-white/40 outline-none border border-white/30 w-36"
            onClick={e => e.stopPropagation()} />
          <button type="button" onClick={e => { e.stopPropagation(); onUpdate?.({ ...imgP, link: inputDraft || undefined }); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><Check className="w-3 h-3" /></button>
          <button type="button" onClick={e => { e.stopPropagation(); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><X className="w-3 h-3" /></button>
        </>
      );
    } else {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <button type="button" title="Replace image"
            onClick={e => { e.stopPropagation(); onOpenMediaLibrary?.(url => onUpdate?.({ ...imgP, url })); }}
            className="flex items-center gap-1 p-1 rounded text-white/60 hover:bg-white/20 hover:text-white transition-colors text-xs">
            <ImageIcon className="w-3.5 h-3.5" /><span>Replace</span>
          </button>
          <button type="button" title="Edit alt text"
            onClick={e => { e.stopPropagation(); setInputDraft(imgP.alt ?? ""); setShowInputMode("alt"); }}
            className="flex items-center gap-1 p-1 rounded text-white/60 hover:bg-white/20 hover:text-white transition-colors text-xs">
            <FileText className="w-3.5 h-3.5" /><span>Alt</span>
          </button>
          <button type="button" title={imgP.link ? `Link: ${imgP.link}` : "Add link"}
            onClick={e => { e.stopPropagation(); setInputDraft(imgP.link ?? ""); setShowInputMode("link"); }}
            className={`flex items-center gap-1 p-1 rounded transition-colors text-xs ${imgP.link ? "bg-blue-500/40 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
            <Link2 className="w-3.5 h-3.5" /><span>Link</span>
          </button>
        </>
      );
    }
  } else if (comp.type === "button") {
    const btnP = comp.props as ButtonCompProps;
    if (showInputMode === "link") {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <input autoFocus type="url" value={inputDraft} onChange={e => setInputDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onUpdate?.({ ...btnP, config: { ...(btnP.config ?? {}), url: inputDraft } }); setShowInputMode(null); } if (e.key === "Escape") setShowInputMode(null); }}
            placeholder="https://…"
            className="px-1.5 py-0.5 rounded text-xs bg-white/20 text-white placeholder-white/40 outline-none border border-white/30 w-36"
            onClick={e => e.stopPropagation()} />
          <button type="button" onClick={e => { e.stopPropagation(); onUpdate?.({ ...btnP, config: { ...(btnP.config ?? {}), url: inputDraft } }); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><Check className="w-3 h-3" /></button>
          <button type="button" onClick={e => { e.stopPropagation(); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><X className="w-3 h-3" /></button>
        </>
      );
    } else {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <button type="button" title={btnP.config?.url ? `Link: ${btnP.config.url}` : "Set button link"}
            onClick={e => { e.stopPropagation(); setInputDraft(btnP.config?.url ?? ""); setShowInputMode("link"); }}
            className={`flex items-center gap-1 p-1 rounded transition-colors text-xs ${btnP.config?.url ? "bg-blue-500/40 text-white" : "text-white/60 hover:bg-white/20 hover:text-white"}`}>
            <Link2 className="w-3.5 h-3.5" /><span>Link</span>
          </button>
        </>
      );
    }
  } else if (comp.type === "icon") {
    const iconP = comp.props as IconCompProps;
    if (showInputMode === "emoji") {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <input autoFocus type="text" value={inputDraft} onChange={e => setInputDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onUpdate?.({ ...iconP, emoji: inputDraft }); setShowInputMode(null); } if (e.key === "Escape") setShowInputMode(null); }}
            placeholder="Paste emoji…"
            className="px-1.5 py-0.5 rounded text-xs bg-white/20 text-white placeholder-white/40 outline-none border border-white/30 w-24"
            onClick={e => e.stopPropagation()} />
          <button type="button" onClick={e => { e.stopPropagation(); onUpdate?.({ ...iconP, emoji: inputDraft }); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><Check className="w-3 h-3" /></button>
          <button type="button" onClick={e => { e.stopPropagation(); setShowInputMode(null); }} className="p-1 rounded text-white/60 hover:bg-white/20 hover:text-white"><X className="w-3 h-3" /></button>
        </>
      );
    } else {
      typeToolbar = (
        <>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <button type="button" title="Change icon emoji"
            onClick={e => { e.stopPropagation(); setInputDraft(iconP.emoji ?? ""); setShowInputMode("emoji"); }}
            className="flex items-center gap-1 p-1 rounded text-white/60 hover:bg-white/20 hover:text-white transition-colors text-xs">
            <Smile className="w-3.5 h-3.5" /><span>Change</span>
          </button>
        </>
      );
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <EditableWrapper
        id={comp.id}
        label={label}
        isSelected={isSelected}
        isMultiSelected={isMultiSelected}
        isHidden={!!comp.hidden}
        locked={!!comp.locked}
        onSelect={e => { e.stopPropagation(); onSelect(e); }}
        onEdit={onEdit}
        onDoubleClick={onEdit ? e => { e.stopPropagation(); onEdit!(); } : undefined}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onToggleHide={onToggleHide}
        onContextMenu={onContextMenu}
        extraToolbar={<>{typeToolbar}{copyBtn}{dragHandle}</>}
      >
        <div className="px-3 py-3 pointer-events-none select-none overflow-hidden max-h-40">
          {renderSiteComponent(comp, settings)}
        </div>
      </EditableWrapper>
    </div>
  );
}

interface AddComponentPickerProps {
  onAdd: (type: ComponentType) => void;
  onClose: () => void;
}

function AddComponentPicker({ onAdd, onClose }: AddComponentPickerProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Add Component</span>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {getContentComponentTypes().map(ct => (
          <button
            key={ct.type}
            type="button"
            onClick={() => { onAdd(ct.type); onClose(); }}
            className="flex items-center gap-2 px-2 py-2 rounded-lg text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors text-gray-700 group"
          >
            <span className="text-gray-400 group-hover:text-primary transition-colors flex-shrink-0">{ct.icon}</span>
            <div className="min-w-0">
              <div className="font-medium">{ct.label}</div>
              <div className="text-[10px] text-gray-400 truncate">{ct.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hover-triggered "+" button rendered between components for on-canvas quick-add. */
function QuickAddBetween({ onAdd }: { onAdd: (type: ComponentType) => void }) {
  const [hovered, setHovered] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const close = () => { setPickerOpen(false); setHovered(false); };
  return (
    <div
      className="relative h-5 flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!pickerOpen) setHovered(false); }}
    >
      {(hovered || pickerOpen) ? (
        <div className="flex items-center w-full">
          <div className="flex-1 h-px bg-primary/40" />
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setPickerOpen(v => !v); }}
            className="mx-1.5 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-sm flex-shrink-0"
            title="Add component here"
          >
            <Plus className="w-3 h-3" />
          </button>
          <div className="flex-1 h-px bg-primary/40" />
        </div>
      ) : (
        <div className="w-full" />
      )}
      {pickerOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1 w-72">
          <AddComponentPicker
            onAdd={type => { onAdd(type); close(); }}
            onClose={close}
          />
        </div>
      )}
    </div>
  );
}

interface ContentSectionProps {
  content: ContentSectionData;
  settings: { brandColor: string; accentColor?: string; secondaryColor?: string };
  isEditing?: boolean;
  onChange?: (content: ContentSectionData) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  /** The component currently on the clipboard — enables Paste button */
  copiedComponent?: SiteComponent | null;
  /** Called when the user copies a component via the toolbar Copy button */
  onCopyComponent?: (comp: SiteComponent) => void;
  /** Called before any discrete mutation (duplicate, delete, paste, add, reorder) — push history snapshot */
  onBeforeAction?: () => void;
  /** Toggle component hidden state; called with component id */
  onToggleHide?: (id: string) => void;
  /** Called when user right-clicks a component — opens the canvas context menu */
  onComponentContextMenu?: (sectionId: string, compId: string, compType: string, e: React.MouseEvent) => void;
  /** Opens the media library; calls back with the chosen URL (for Replace Image action). */
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
  /** M8: Shift+click handler to toggle a component into multi-selection. */
  onMultiSelectComponent?: (id: string) => void;
  /** M8: IDs currently in multi-selection (cyan ring indicator). */
  multiSelectedIds?: ReadonlySet<string>;
  /**
   * Called on every pointer-move during a dnd-kit drag with the current
   * viewport rect of the dragged element. Pass null to clear guides (drag end).
   */
  onAlignmentDrag?: (
    draggedId: string,
    rect: { top: number; bottom: number; left: number; right: number; width: number; height: number } | null,
  ) => void;
}

export function ContentSection({
  content,
  settings,
  isEditing,
  onChange,
  blockStyle,
  sectionId,
  selectedComponentId,
  onSelectComponent,
  copiedComponent,
  onCopyComponent,
  onBeforeAction,
  onToggleHide,
  onComponentContextMenu,
  onOpenMediaLibrary,
  onMultiSelectComponent,
  multiSelectedIds,
  onAlignmentDrag,
}: ContentSectionProps) {
  const { toast } = useToast();
  const [showPicker, setShowPicker] = useState(false);
  const components = content.components ?? [];
  const mwClass = MAX_WIDTH_CLASS[content.maxWidth ?? "lg"] ?? "max-w-4xl";
  const inlineCtx = useInlineEditContext();

  // Suppress DnD while the user is inline-editing a text field.
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: inlineCtx?.editingId ? 99999 : 5 },
  }));

  // M3: track which component is actively being dragged for DragOverlay ghost
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingComp = draggingId ? (components.find(c => c.id === draggingId) ?? null) : null;
  /** M7: ID of the component being hovered over during drag — used for drop zone guide. */
  const [overDropId, setOverDropId] = useState<string | null>(null);

  function updateComps(newComps: SiteComponent[]) {
    onChange?.({ ...content, components: newComps });
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverDropId(event.over ? String(event.over.id) : null);
  }

  function handleDragMove(event: DragMoveEvent) {
    const translated = event.active.rect.current.translated;
    if (!translated) return;
    onAlignmentDrag?.(String(event.active.id), {
      top: translated.top,
      bottom: translated.bottom,
      left: translated.left,
      right: translated.right,
      width: translated.width,
      height: translated.height,
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    setOverDropId(null);
    onAlignmentDrag?.(String(event.active.id), null); // clear guides
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onBeforeAction?.();
      const oldIdx = components.findIndex(c => c.id === active.id);
      const newIdx = components.findIndex(c => c.id === over.id);
      updateComps(arrayMove(components, oldIdx, newIdx));
    }
  }

  function addComponent(type: ComponentType) {
    onBeforeAction?.();
    const newComp: SiteComponent = { id: uid(), type, props: defaultPropsForType(type) };
    updateComps([...components, newComp]);
    onSelectComponent?.(newComp.id);
  }

  function addComponentAt(index: number, type: ComponentType) {
    onBeforeAction?.();
    const newComp: SiteComponent = { id: uid(), type, props: defaultPropsForType(type) };
    const next = [...components];
    next.splice(index, 0, newComp);
    updateComps(next);
    onSelectComponent?.(newComp.id);
  }

  function duplicateComponent(id: string) {
    onBeforeAction?.();
    const idx = components.findIndex(c => c.id === id);
    if (idx === -1) return;
    const copy: SiteComponent = { ...components[idx], id: uid(), hidden: false };
    const next = [...components];
    next.splice(idx + 1, 0, copy);
    updateComps(next);
    onSelectComponent?.(copy.id);
  }

  function deleteComponent(id: string) {
    onBeforeAction?.();
    updateComps(components.filter(c => c.id !== id));
    if (selectedComponentId === id) onSelectComponent?.(null);
  }

  /** Insert the clipboard component below the currently selected component (or at the end) */
  function pasteComponent() {
    if (!copiedComponent) return;
    onBeforeAction?.();
    const newComp: SiteComponent = { ...copiedComponent, id: uid(), hidden: false };
    if (selectedComponentId) {
      const idx = components.findIndex(c => c.id === selectedComponentId);
      if (idx !== -1) {
        const next = [...components];
        next.splice(idx + 1, 0, newComp);
        updateComps(next);
        onSelectComponent?.(newComp.id);
        toast({ title: "Component pasted", duration: 2000 });
        return;
      }
    }
    updateComps([...components, newComp]);
    onSelectComponent?.(newComp.id);
    toast({ title: "Component pasted", duration: 2000 });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={false}>
        <div className={`${mwClass} mx-auto space-y-6`}>
          {components.filter(c => !c.hidden).map(comp => (
            <div key={comp.id}>
              {sectionId
                ? renderSiteComponentEditable(comp, settings, sectionId, (updated) => {
                    onChange?.({ ...content, components: components.map(c => c.id === updated.id ? updated : c) });
                  })
                : renderSiteComponent(comp, settings)}
            </div>
          ))}
        </div>
      </BlockStyleWrapper>
    );
  }

  const pasteLabel = copiedComponent
    ? (getContentComponentTypes().find(t => t.type === copiedComponent.type)?.label ?? "Component")
    : null;

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-6" isEditing={true} defaultBg="#f8fafc">
      <div onClick={e => e.stopPropagation()}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragMove={onAlignmentDrag ? handleDragMove : undefined}>
          <SortableContext items={components.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0">
              <QuickAddBetween onAdd={type => addComponentAt(0, type)} />
              {components.map((comp, index) => (
                <React.Fragment key={comp.id}>
                  {/* M7: Snap guide — glowing line shows where dragged item will land */}
                  {draggingId && overDropId === comp.id && comp.id !== draggingId && (
                    <div className="h-0.5 bg-primary rounded-full mx-4 -mb-0.5 relative z-10 animate-pulse shadow-[0_0_6px_2px_rgba(99,102,241,0.4)]" />
                  )}
                  <SortableItem
                    comp={comp}
                    isSelected={selectedComponentId === comp.id}
                    onSelect={(e) => {
                      if (e.shiftKey && onMultiSelectComponent) {
                        // M8: Shift+click adds/removes this component from multi-selection
                        onMultiSelectComponent(comp.id);
                      } else {
                        onSelectComponent?.(selectedComponentId === comp.id ? null : comp.id);
                      }
                    }}
                    isMultiSelected={multiSelectedIds?.has(comp.id) ?? false}
                    onEdit={() => {
                      // Always select this component (not toggle), then focus first
                      // editable field in the component inspector panel (Enter contract)
                      onSelectComponent?.(comp.id);
                      requestAnimationFrame(() => {
                        const panel = document.querySelector("[data-component-editor-panel]");
                        (panel?.querySelector("input, textarea, select") as HTMLElement | null)?.focus();
                      });
                    }}
                    onUpdate={(newProps) => {
                      // Direct prop update from the type-specific toolbar (bold, align, etc.)
                      // Each toolbar click is a discrete action — push a snapshot first.
                      onBeforeAction?.();
                      updateComps(components.map(c => c.id === comp.id ? { ...c, props: newProps } : c));
                    }}
                    onOpenMediaLibrary={onOpenMediaLibrary}
                    onDuplicate={() => duplicateComponent(comp.id)}
                    onDelete={() => deleteComponent(comp.id)}
                    onCopy={onCopyComponent ? () => onCopyComponent(comp) : undefined}
                    onToggleHide={onToggleHide ? () => onToggleHide(comp.id) : undefined}
                    onContextMenu={onComponentContextMenu && sectionId
                      ? (e) => onComponentContextMenu(sectionId, comp.id, comp.type, e)
                      : undefined}
                    settings={settings}
                  />
                  <QuickAddBetween onAdd={type => addComponentAt(index + 1, type)} />
                </React.Fragment>
              ))}
            </div>
          </SortableContext>
          {/* M3: drag ghost overlay — appears while component is being dragged */}
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
            {draggingComp && (
              <div className="bg-white border-2 border-primary/80 rounded-lg shadow-2xl px-4 py-3 rotate-1 opacity-90 max-w-xs">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {getContentComponentTypes().find(t => t.type === draggingComp.type)?.label ?? draggingComp.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">moving</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {components.length === 0 && (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl mb-2">
            <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-400 mb-3">+ Add content</p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={() => addComponent("heading")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-colors">
                <Type className="w-3 h-3" />Text
              </button>
              <button type="button" onClick={() => addComponent("image")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-colors">
                <ImageIcon className="w-3 h-3" />Image
              </button>
              <button type="button" onClick={() => addComponent("button")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-colors">
                <MousePointer className="w-3 h-3" />Button
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 relative flex gap-2">
          {showPicker && (
            <div className="absolute bottom-full left-0 mb-1 z-50 w-80">
              <AddComponentPicker onAdd={addComponent} onClose={() => setShowPicker(false)} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowPicker(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-1 justify-center border border-primary/20"
          >
            <Plus className="w-4 h-4" />
            Add Component
          </button>
          {copiedComponent && (
            <button
              type="button"
              onClick={pasteComponent}
              title={`Paste ${pasteLabel} below selection`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors border border-border"
            >
              <ClipboardPaste className="w-4 h-4" />
              Paste
            </button>
          )}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
