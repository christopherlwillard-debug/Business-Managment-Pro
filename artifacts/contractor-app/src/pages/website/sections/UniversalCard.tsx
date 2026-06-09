import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Pencil, Copy, EyeOff, Eye, Trash2, GripVertical, ArrowRight,
  Wrench, Home, Truck, Shield, Hammer, Building2, Drill, Zap, Droplet, Flame,
  Wind, Snowflake, Sun, Shovel, PaintBucket, Ruler, CircuitBoard, Wifi,
  Phone, Star, CheckCircle2, Award, Clock, Calendar, MapPin, Users, Briefcase,
  Settings, Car, Layers, Package, DollarSign, ThumbsUp, Heart, Leaf, Recycle,
  Camera, FileText, Globe, Lock, Anchor, Mountain, Scissors, Gauge, Paintbrush,
  TreePine, Lightbulb, Banknote, HardHat,
} from "lucide-react";
import type {
  CardComponent, CardBadgePosition, CardIconSize,
} from "../website-types";

// ── Icon registry ─────────────────────────────────────────────────────────────

export const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  Wrench, Home, Truck, Shield, Hammer, Building2, Drill, Zap, Droplet, Flame,
  Wind, Snowflake, Sun, Shovel, PaintBucket, Ruler, CircuitBoard, Wifi,
  Phone, Star, CheckCircle2, Award, Clock, Calendar, MapPin, Users, Briefcase,
  Settings, Car, Layers, Package, DollarSign, ThumbsUp, Heart, Leaf, Recycle,
  Camera, FileText, Globe, Lock, Anchor, Mountain, Scissors, Gauge, Paintbrush,
  TreePine, Lightbulb, Banknote, HardHat,
};

// ── Icon size lookup ──────────────────────────────────────────────────────────

const ICON_SIZE: Record<CardIconSize, { wrap: string; icon: string; img: string }> = {
  sm: { wrap: "w-8 h-8",  icon: "w-4 h-4",  img: "w-10 h-10" },
  md: { wrap: "w-10 h-10", icon: "w-5 h-5", img: "w-14 h-14" },
  lg: { wrap: "w-12 h-12", icon: "w-6 h-6", img: "w-16 h-16" },
  xl: { wrap: "w-16 h-16", icon: "w-8 h-8", img: "w-20 h-20" },
};

// ── Badge position lookup ─────────────────────────────────────────────────────

const BADGE_POS_CLASS: Record<CardBadgePosition, string> = {
  "top-left":     "top-3 left-3",
  "top-right":    "top-3 right-3",
  "bottom-left":  "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};

// ── Visibility evaluation ─────────────────────────────────────────────────────

function evaluateVisibility(rule: CardComponent["visibilityRule"]): boolean {
  if (!rule || !rule.enabled) return true; // no rule or disabled → always show
  if (rule.type === "always") return true;
  if (rule.type === "date-range") {
    const now = new Date();
    if (rule.startDate && new Date(rule.startDate) > now) return false;
    if (rule.endDate   && new Date(rule.endDate)   < now) return false;
  }
  return true; // unknown type → fail open (safe default)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UniversalCardProps {
  card: CardComponent;
  settings: { brandColor: string; secondaryColor?: string; accentColor?: string };
  isEditing?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleHide?: () => void;
  /** Drag handle element injected by the parent SortableCardWrapper */
  dragHandle?: React.ReactNode;
}

export function UniversalCard({
  card,
  settings,
  isEditing,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onToggleHide,
  dragHandle,
}: UniversalCardProps) {
  const [hovered, setHovered] = useState(false);

  const brandColor  = settings.brandColor;
  const accentColor = settings.accentColor ?? brandColor;

  // ── Visibility ───────────────────────────────────────────────────────────
  if (!isEditing && card.hidden) return null;
  if (!isEditing && !evaluateVisibility(card.visibilityRule)) return null;

  const layout      = card.layout      ?? "icon-top";
  const textAlign   = card.textAlign   ?? "left";
  const hoverEffect = card.hoverEffect ?? "none";
  const iconSize    = card.iconSize    ?? "md";
  const hasBgImage  = !!card.cardBgImage;

  // ── Click handler ────────────────────────────────────────────────────────
  function handleClick(e: React.MouseEvent) {
    if (isEditing) { onSelect?.(); return; }
    if (card.trackClicks) {
      (window as any).__buildpro_track?.("card_click", {
        label: card.analyticsLabel || card.title,
      });
    }
    const action = card.clickAction ?? "none";
    if (action === "scroll" && card.clickTarget) {
      e.preventDefault();
      document.getElementById(card.clickTarget)?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "contact-form") {
      e.preventDefault();
      (
        document.getElementById("contact") ??
        document.querySelector<HTMLElement>('[data-section-type="contact"]')
      )?.scrollIntoView({ behavior: "smooth" });
    } else if (action === "tel" && card.clickTarget) {
      window.location.href = `tel:${card.clickTarget.replace(/\s/g, "")}`;
    } else if (action === "email" && card.clickTarget) {
      window.location.href = `mailto:${card.clickTarget}`;
    } else if ((action === "url" || action === "page") && card.clickTarget) {
      if (card.clickTarget.startsWith("/")) window.location.href = card.clickTarget;
      else window.open(card.clickTarget, "_blank", "noopener");
    }
  }

  // ── Hover effect styles ──────────────────────────────────────────────────
  const hoverTransformClass =
    hoverEffect === "lift"   ? "hover:-translate-y-1 transition-all duration-200" :
    hoverEffect === "border" ? "hover:ring-2 hover:ring-primary transition-all duration-200" : "";

  const glowStyle: React.CSSProperties =
    hoverEffect === "glow" && hovered && !isEditing
      ? { boxShadow: `0 0 20px ${accentColor}50, ${card.cardShadow ?? "var(--theme-card-shadow, none)"}` }
      : {};

  // ── Per-card design ──────────────────────────────────────────────────────
  const borderVal = card.cardBorderWidth
    ? `${card.cardBorderWidth} solid ${card.cardBorderColor ?? "currentColor"}`
    : card.cardBorderColor
      ? `1px solid ${card.cardBorderColor}`
      : "var(--theme-card-border, 1px solid #f3f4f6)";

  const baseStyle: React.CSSProperties = {
    backgroundColor: hasBgImage ? undefined : (card.cardBgColor ?? "var(--theme-surface, #f9fafb)"),
    borderRadius:    card.cardBorderRadius ?? "var(--theme-card-radius, 0.75rem)",
    boxShadow:       hoverEffect === "glow" ? undefined : (card.cardShadow ?? "var(--theme-card-shadow, none)"),
    border:          borderVal,
    ...(card.cardPadding ? { padding: card.cardPadding } : {}),
    ...glowStyle,
  };

  const hasPaddingOverride = !!card.cardPadding;
  const defaultPadding = "p-6";

  // ── Selection/state helpers ──────────────────────────────────────────────
  const selectedRing  = selected && isEditing ? "ring-2 ring-primary ring-offset-2" : "";
  const hiddenOpacity = isEditing && card.hidden ? "opacity-40" : "";
  const cursorClass   = (isEditing || (card.clickAction && card.clickAction !== "none")) ? "cursor-pointer" : "";

  // ── Badge ────────────────────────────────────────────────────────────────
  function renderBadge() {
    if (!card.badgeEnabled || !card.badgeText) return null;
    const posClass = BADGE_POS_CLASS[card.badgePosition ?? "top-right"];
    return (
      <span
        className={`absolute ${posClass} text-[10px] font-bold px-2 py-0.5 rounded-full z-10`}
        style={{
          backgroundColor: card.badgeBgColor  ?? brandColor,
          color:           card.badgeTextColor ?? "#ffffff",
        }}
      >
        {card.badgeText}
      </span>
    );
  }

  // ── Icon / image media ───────────────────────────────────────────────────
  function renderMedia(extraClass = "") {
    const mt = card.mediaType ?? "icon";
    if (mt === "none") return null;

    if (mt === "image") {
      if (!card.imageUrl) return null;
      const sz = ICON_SIZE[iconSize].img;
      return (
        <img
          src={card.imageUrl}
          alt={card.imageAlt ?? card.title}
          className={`${sz} object-cover rounded-lg flex-shrink-0 ${extraClass}`}
        />
      );
    }

    const iconKey  = card.iconName && LUCIDE_ICON_MAP[card.iconName] ? card.iconName : "Wrench";
    const IconComp = LUCIDE_ICON_MAP[iconKey]!;
    const { wrap, icon } = ICON_SIZE[iconSize];
    const iconBg    = card.iconBgColor ?? `${accentColor}20`;
    const iconColor = card.iconColor   ?? accentColor;

    return (
      <div
        className={`${wrap} rounded-lg flex items-center justify-center flex-shrink-0 ${extraClass}`}
        style={{ backgroundColor: iconBg }}
      >
        <IconComp className={icon} style={{ color: iconColor }} />
      </div>
    );
  }

  // ── Text block ───────────────────────────────────────────────────────────
  function renderText() {
    const titleColor = card.cardTitleColor ?? settings.secondaryColor ?? "var(--theme-text, #111827)";
    const descColor  = card.cardTextColor  ?? "var(--theme-text-muted, #4b5563)";
    const alignClass =
      textAlign === "center" ? "text-center" :
      textAlign === "right"  ? "text-right"  : "text-left";

    return (
      <div className={`flex-1 ${alignClass}`}>
        <h3 className="font-semibold text-base mb-1.5" style={{ color: titleColor }}>
          {card.title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: descColor }}>
          {card.description}
        </p>
        {card.buttonLabel && (
          <a
            href={isEditing ? undefined : (card.buttonUrl || "#")}
            onClick={isEditing ? (e) => e.preventDefault() : undefined}
            className="inline-flex items-center gap-1 mt-3 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: accentColor }}
          >
            {card.buttonLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  }

  // ── Edit toolbar ─────────────────────────────────────────────────────────
  function renderEditToolbar() {
    if (!isEditing) return null;
    return (
      <div className="absolute top-1.5 right-1.5 z-20 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-0.5 bg-white/95 dark:bg-gray-900/95 rounded-md shadow-md px-1 py-0.5 border border-border/50">
        {dragHandle && (
          <span className="text-muted-foreground cursor-grab active:cursor-grabbing px-0.5">
            {dragHandle}
          </span>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit card">
          <Pencil className="w-3 h-3" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Duplicate">
          <Copy className="w-3 h-3" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleHide?.(); }}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={card.hidden ? "Show card" : "Hide card"}>
          {card.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors" title="Delete card">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // ── Background image overlay helper ──────────────────────────────────────
  function renderBgLayer() {
    if (!hasBgImage) return null;
    return (
      <>
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            backgroundImage:    `url(${JSON.stringify(card.cardBgImage!)})`,
            backgroundSize:     "cover",
            backgroundPosition: card.cardBgPosition ?? "center",
            backgroundRepeat:   "no-repeat",
          }}
        />
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            backgroundColor: card.cardBgOverlayColor  ?? "#000000",
            opacity:          card.cardBgOverlayOpacity ?? 0.5,
          }}
        />
      </>
    );
  }

  // ── image-bg layout ──────────────────────────────────────────────────────
  if (layout === "image-bg") {
    return (
      <div
        className={`group/card relative flex flex-col justify-end overflow-hidden ${hasPaddingOverride ? "" : defaultPadding} min-h-[220px] ${hoverTransformClass} ${selectedRing} ${hiddenOpacity} ${cursorClass}`}
        style={{ ...baseStyle, backgroundImage: card.cardBgImage ? `url(${JSON.stringify(card.cardBgImage)})` : undefined, backgroundSize: "cover", backgroundPosition: card.cardBgPosition ?? "center" }}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ backgroundColor: card.cardBgOverlayColor ?? "#000000", opacity: card.cardBgOverlayOpacity ?? 0.5 }}
        />
        <div className="relative z-10 flex flex-col">
          {renderMedia("mb-3")}
          <div className={textAlign === "center" ? "text-center" : textAlign === "right" ? "text-right" : "text-left"}>
            <h3 className="font-semibold text-base mb-1.5 text-white">{card.title}</h3>
            <p className="text-sm text-white/80 leading-relaxed">{card.description}</p>
            {card.buttonLabel && (
              <a href={isEditing ? undefined : (card.buttonUrl || "#")} onClick={isEditing ? (e) => e.preventDefault() : undefined}
                className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-white/90 hover:text-white transition-colors">
                {card.buttonLabel}<ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
        {renderBadge()}
        {renderEditToolbar()}
      </div>
    );
  }

  // ── icon-left / horizontal layout ────────────────────────────────────────
  if (layout === "icon-left" || layout === "horizontal") {
    return (
      <div
        className={`group/card relative flex items-start overflow-hidden ${hasPaddingOverride ? "" : defaultPadding} ${hoverTransformClass} ${selectedRing} ${hiddenOpacity} ${cursorClass}`}
        style={baseStyle}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderBgLayer()}
        <div className="relative z-10 flex items-start w-full gap-4">
          {renderMedia("mt-0.5")}
          {renderText()}
        </div>
        {renderBadge()}
        {renderEditToolbar()}
      </div>
    );
  }

  // ── Default: icon-top ────────────────────────────────────────────────────
  return (
    <div
      className={`group/card relative flex flex-col overflow-hidden ${hasPaddingOverride ? "" : defaultPadding} ${hoverTransformClass} ${selectedRing} ${hiddenOpacity} ${cursorClass}`}
      style={baseStyle}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {renderBgLayer()}
      <div className="relative z-10 flex flex-col">
        {renderMedia("mb-4")}
        {renderText()}
      </div>
      {renderBadge()}
      {renderEditToolbar()}
    </div>
  );
}

// Re-export GripVertical for SortableCardWrapper
export { GripVertical };
