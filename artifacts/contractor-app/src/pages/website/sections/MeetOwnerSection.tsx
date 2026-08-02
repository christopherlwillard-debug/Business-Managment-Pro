import { useState } from "react";
import { Camera, Plus, Trash2, Quote as QuoteIcon } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";
import type { SiteSettings } from "../website-types";

// ── Types ──────────────────────────────────────────────────────────────────────

export type MeetOwnerLayout = "split" | "centered" | "card" | "full-bg";

export interface OwnerStat {
  id: string;
  label: string;
  value: string;
}

export interface OwnerBadge {
  id: string;
  label: string;
  icon?: string;
}

export interface MeetOwnerContent {
  layout: MeetOwnerLayout;
  heading?: string;
  subheading?: string;
  ownerName: string;
  ownerTitle: string;
  bio: string;
  quote?: string;
  signature?: string;
  photoUrl?: string;
  stats: OwnerStat[];
  badges: OwnerBadge[];
  ctaText?: string;
  ctaUrl?: string;
  showQuote?: boolean;
  showSignature?: boolean;
  showStats?: boolean;
  showBadges?: boolean;
}

// ── Preset badge library ───────────────────────────────────────────────────────

export const PRESET_BADGES: OwnerBadge[] = [
  { id: "veteran",    label: "Veteran Owned",               icon: "🪖" },
  { id: "marine",     label: "Marine Corps",                icon: "🇺🇸" },
  { id: "sdvosb",     label: "SDVOSB",                      icon: "⭐" },
  { id: "licensed",   label: "Licensed",                    icon: "📋" },
  { id: "insured",    label: "Fully Insured",               icon: "🛡️" },
  { id: "mh-spec",    label: "Manufactured Home Specialist",icon: "🏠" },
  { id: "bbb",        label: "BBB Accredited",              icon: "✓" },
  { id: "5star",      label: "5-Star Rated",                icon: "⭐" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Default content ────────────────────────────────────────────────────────────

export function defaultMeetOwnerContent(): MeetOwnerContent {
  return {
    layout: "split",
    heading: "Meet the Owner",
    subheading: "The person behind every job we complete.",
    ownerName: "Willard Smith",
    ownerTitle: "Owner & Lead Installer",
    bio: "I started this company after 20 years in the manufactured housing industry because I saw too many families getting poor service from companies that didn't care. Every home we install is treated like it's our own family moving in. When I'm not on a job site, I'm probably fishing — or answering your call.",
    quote: "If my name is on it, I stand behind it. Period.",
    signature: "Willard Smith",
    photoUrl: "",
    stats: [
      { id: uid(), value: "20+", label: "Years Experience" },
      { id: uid(), value: "500+", label: "Homes Completed" },
      { id: uid(), value: "5★",   label: "Average Rating" },
    ],
    badges: [
      { id: uid(), label: "Veteran Owned", icon: "🪖" },
      { id: uid(), label: "Licensed",      icon: "📋" },
      { id: uid(), label: "Fully Insured", icon: "🛡️" },
    ],
    ctaText: "Request a Free Estimate",
    ctaUrl: "#contact",
    showQuote: true,
    showSignature: true,
    showStats: true,
    showBadges: true,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface SharedProps {
  content: MeetOwnerContent;
  settings: SiteSettings;
  sid: string;
  isEditing: boolean;
  onChange?: (c: MeetOwnerContent) => void;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

function up(content: MeetOwnerContent, patch: Partial<MeetOwnerContent>, onChange?: (c: MeetOwnerContent) => void) {
  onChange?.({ ...content, ...patch });
}

// Photo slot — handles empty, populated, and edit-mode interactions

function PhotoSlot({
  content, isEditing, onChange, onOpenMediaLibrary, shape = "rounded-xl",
  className = "",
}: SharedProps & { shape?: string; className?: string }) {
  const [hovered, setHovered] = useState(false);

  function pickPhoto() {
    onOpenMediaLibrary?.((url) => onChange?.({ ...content, photoUrl: url }));
  }

  if (!content.photoUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 ${shape} ${className}`}
        style={{ minHeight: 280 }}
      >
        <Camera className="w-10 h-10 text-gray-400" />
        <p className="text-sm text-gray-400 text-center px-4">Your photo here</p>
        {isEditing && (
          <button
            type="button"
            onClick={pickPhoto}
            className="px-4 py-2 text-xs rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            Add Photo
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${shape} ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img src={content.photoUrl} alt={content.ownerName} className="w-full h-full object-cover" />
      {isEditing && hovered && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 transition-opacity">
          <button
            type="button"
            onClick={pickPhoto}
            className="px-3 py-1.5 text-xs rounded-lg bg-white text-gray-900 font-medium hover:bg-gray-100 transition-colors"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange?.({ ...content, photoUrl: "" })}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// Stats strip

function StatsStrip({ content, sid, isEditing, onChange }: SharedProps) {
  if (!content.showStats && !isEditing) return null;
  const stats = content.stats;

  function updateStat(id: string, patch: Partial<OwnerStat>) {
    onChange?.({ ...content, stats: stats.map(s => s.id === id ? { ...s, ...patch } : s) });
  }

  return (
    <div className="flex flex-wrap gap-6 justify-center sm:justify-start mt-6">
      {stats.map(stat => (
        <div key={stat.id} className="flex flex-col items-center sm:items-start gap-0.5">
          <InlineEditableText
            id={`${sid}-stat-v-${stat.id}`}
            as="span"
            value={stat.value}
            placeholder="15+"
            className="text-3xl font-bold"
            style={{ color: "var(--theme-primary, #2563eb)" }}
            onCommit={v => updateStat(stat.id, { value: v })}
          />
          <InlineEditableText
            id={`${sid}-stat-l-${stat.id}`}
            as="span"
            value={stat.label}
            placeholder="Years Experience"
            className="text-xs text-muted-foreground font-medium uppercase tracking-wider"
            onCommit={v => updateStat(stat.id, { label: v })}
          />
        </div>
      ))}
      {isEditing && (
        <button
          type="button"
          onClick={() => onChange?.({ ...content, stats: [...stats, { id: uid(), value: "0+", label: "New Stat" }] })}
          className="flex flex-col items-center gap-0.5 opacity-40 hover:opacity-80 transition-opacity"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[10px] uppercase tracking-wider">Add stat</span>
        </button>
      )}
    </div>
  );
}

// Badge pills

function BadgePills({ content, isEditing, onChange }: SharedProps) {
  if (!content.showBadges && !isEditing) return null;
  const badges = content.badges;

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {badges.map(badge => (
        <span
          key={badge.id}
          className="relative group flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
          style={{ borderColor: "rgba(0,0,0,0.15)", backgroundColor: "rgba(0,0,0,0.04)", color: "var(--theme-text, #111827)" }}
        >
          {badge.icon && <span>{badge.icon}</span>}
          {badge.label}
          {isEditing && (
            <button
              type="button"
              onClick={() => onChange?.({ ...content, badges: badges.filter(b => b.id !== badge.id) })}
              className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
      {isEditing && (
        <button
          type="button"
          onClick={() => {
            // Cycle through presets not yet used
            const usedLabels = new Set(badges.map(b => b.label));
            const next = PRESET_BADGES.find(p => !usedLabels.has(p.label));
            if (next) {
              onChange?.({ ...content, badges: [...badges, { ...next, id: uid() }] });
            } else {
              onChange?.({ ...content, badges: [...badges, { id: uid(), label: "New Badge", icon: "" }] });
            }
          }}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add badge
        </button>
      )}
    </div>
  );
}

// Owner bio block (name, title, bio, quote, signature, stats, badges, CTA)

function OwnerBioBlock({
  content, settings, sid, isEditing, onChange, onOpenMediaLibrary,
  align = "left",
  textClass = "",
  onDark = false,
}: SharedProps & { align?: "left" | "center"; textClass?: string; onDark?: boolean }) {
  const ta = align === "center" ? "text-center" : "text-left";
  const ja = align === "center" ? "justify-center" : "justify-start";

  // Color tokens — switch to white-on-dark palette for full-bg layout
  const c = {
    name:       onDark ? "#ffffff"                   : "var(--theme-text, #111827)",
    title:      onDark ? "rgba(255,255,255,0.85)"    : "var(--theme-primary, #2563eb)",
    bio:        onDark ? "rgba(255,255,255,0.8)"     : "var(--theme-text-muted, #4b5563)",
    quote:      onDark ? "rgba(255,255,255,0.7)"     : "var(--theme-text-muted, #4b5563)",
    sig:        onDark ? "rgba(255,255,255,0.9)"     : "var(--theme-primary, #2563eb)",
    statVal:    onDark ? "#ffffff"                   : "var(--theme-primary, #2563eb)",
    statLbl:    onDark ? "rgba(255,255,255,0.6)"     : "var(--theme-text-muted, #6b7280)",
    badgeBg:    onDark ? "rgba(255,255,255,0.12)"    : "rgba(0,0,0,0.04)",
    badgeBdr:   onDark ? "rgba(255,255,255,0.3)"     : "rgba(0,0,0,0.12)",
    badgeTxt:   onDark ? "#ffffff"                   : "var(--theme-text, #111827)",
  };

  return (
    <div className={`flex flex-col gap-3 ${textClass}`}>
      {/* Name */}
      <InlineEditableText
        id={`${sid}-name`}
        as="h2"
        value={content.ownerName}
        placeholder="Owner Name"
        className={`text-3xl font-bold ${ta}`}
        style={{ color: c.name }}
        onCommit={v => up(content, { ownerName: v }, onChange)}
      />

      {/* Optional signature */}
      {content.showSignature && (
        <InlineEditableText
          id={`${sid}-signature`}
          as="p"
          value={content.signature ?? ""}
          placeholder="Handwritten signature…"
          className={`text-2xl ${ta} italic`}
          style={{ fontFamily: "cursive, 'Dancing Script', Georgia", color: c.sig }}
          onCommit={v => up(content, { signature: v }, onChange)}
        />
      )}

      {/* Title / role */}
      <InlineEditableText
        id={`${sid}-title`}
        as="p"
        value={content.ownerTitle}
        placeholder="Owner & Lead Installer"
        className={`text-sm font-semibold uppercase tracking-wider ${ta}`}
        style={{ color: c.title }}
        onCommit={v => up(content, { ownerTitle: v }, onChange)}
      />

      {/* Bio */}
      <InlineEditableText
        id={`${sid}-bio`}
        as="p"
        value={content.bio}
        placeholder="Tell your story…"
        className={`text-base leading-relaxed ${ta}`}
        style={{ color: c.bio }}
        onCommit={v => up(content, { bio: v }, onChange)}
      />

      {/* Pull quote */}
      {content.showQuote && (content.quote || isEditing) && (
        <blockquote className={`flex gap-2 items-start mt-1 ${align === "center" ? "justify-center" : ""}`}>
          <QuoteIcon className="w-5 h-5 flex-shrink-0 mt-1" style={{ color: c.title, opacity: 0.5 }} />
          <InlineEditableText
            id={`${sid}-quote`}
            as="span"
            value={content.quote ?? ""}
            placeholder="A memorable quote or tagline…"
            className="text-base italic"
            style={{ color: c.quote }}
            onCommit={v => up(content, { quote: v }, onChange)}
          />
        </blockquote>
      )}

      {/* Stats */}
      {content.showStats !== false && (
        <div className={`flex flex-wrap gap-6 mt-2 ${ja}`}>
          {content.stats.map(stat => (
            <div key={stat.id} className={`group relative flex flex-col items-${align === "center" ? "center" : "start"} gap-0`}>
              <InlineEditableText
                id={`${sid}-stat-v-${stat.id}`}
                as="span"
                value={stat.value}
                placeholder="15+"
                className="text-2xl font-bold"
                style={{ color: c.statVal }}
                onCommit={v => onChange?.({ ...content, stats: content.stats.map(s => s.id === stat.id ? { ...s, value: v } : s) })}
              />
              <InlineEditableText
                id={`${sid}-stat-l-${stat.id}`}
                as="span"
                value={stat.label}
                placeholder="Years Experience"
                className="text-xs uppercase tracking-wider font-medium"
                style={{ color: c.statLbl }}
                onCommit={v => onChange?.({ ...content, stats: content.stats.map(s => s.id === stat.id ? { ...s, label: v } : s) })}
              />
              {isEditing && (
                <button
                  type="button"
                  onClick={() => onChange?.({ ...content, stats: content.stats.filter(s => s.id !== stat.id) })}
                  className="absolute -top-1 -right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          {isEditing && (
            <button
              type="button"
              onClick={() => onChange?.({ ...content, stats: [...content.stats, { id: uid(), value: "0+", label: "Stat" }] })}
              className="flex flex-col items-center gap-0 opacity-30 hover:opacity-70 transition-opacity"
            >
              <Plus className="w-5 h-5" />
              <span className="text-[10px] uppercase tracking-wider">Add</span>
            </button>
          )}
        </div>
      )}

      {/* Badges */}
      {content.showBadges !== false && (
        <div className={`flex flex-wrap gap-2 mt-1 ${ja}`}>
          {content.badges.map(badge => (
            <span
              key={badge.id}
              className="group relative flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
              style={{ borderColor: c.badgeBdr, backgroundColor: c.badgeBg, color: c.badgeTxt }}
            >
              {badge.icon && <span>{badge.icon}</span>}
              {badge.label}
              {isEditing && (
                <button
                  type="button"
                  onClick={() => onChange?.({ ...content, badges: content.badges.filter(b => b.id !== badge.id) })}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
          {isEditing && (
            <button
              type="button"
              onClick={() => {
                const usedLabels = new Set(content.badges.map(b => b.label));
                const next = PRESET_BADGES.find(p => !usedLabels.has(p.label));
                onChange?.({ ...content, badges: [...content.badges, next ? { ...next, id: uid() } : { id: uid(), label: "New Badge", icon: "" }] });
              }}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add badge
            </button>
          )}
        </div>
      )}

      {/* CTA */}
      {(content.ctaText || isEditing) && (
        <div className={`flex ${ja} mt-4 gap-3 flex-wrap`}>
          <a
            href={content.ctaUrl ?? "#contact"}
            className="inline-flex items-center px-6 py-3 rounded-lg font-semibold text-sm text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: settings.brandColor }}
            onClick={isEditing ? (e) => e.preventDefault() : undefined}
          >
            <InlineEditableText
              id={`${sid}-cta`}
              as="span"
              value={content.ctaText ?? ""}
              placeholder="Get a Free Estimate"
              className="text-white text-sm font-semibold"
              enterBehavior="commit"
              onCommit={v => up(content, { ctaText: v }, onChange)}
            />
          </a>
          {isEditing && (
            <input
              type="text"
              value={content.ctaUrl ?? ""}
              onChange={e => up(content, { ctaUrl: e.target.value }, onChange)}
              placeholder="Button URL (e.g. #contact)"
              className="px-3 py-2 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary w-48"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Layout variants ────────────────────────────────────────────────────────────

function SplitLayout(props: SharedProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
      <PhotoSlot {...props} shape="rounded-2xl" className="w-full aspect-[3/4] max-h-[520px]" />
      <OwnerBioBlock {...props} align="left" />
    </div>
  );
}

function CenteredLayout(props: SharedProps) {
  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto text-center gap-6">
      <PhotoSlot
        {...props}
        shape="rounded-full"
        className="w-48 h-48 flex-shrink-0"
      />
      <OwnerBioBlock {...props} align="center" />
    </div>
  );
}

function CardLayout(props: SharedProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {/* Photo column */}
          <div className="sm:col-span-1">
            <PhotoSlot
              {...props}
              shape=""
              className="w-full h-full min-h-[260px] rounded-none"
            />
          </div>
          {/* Content column */}
          <div className="sm:col-span-2 p-8">
            <OwnerBioBlock {...props} align="left" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FullBgLayout(props: SharedProps) {
  const { content, settings } = props;
  const bgStyle: React.CSSProperties = content.photoUrl
    ? { backgroundImage: `url(${content.photoUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundColor: settings.brandColor };

  return (
    <div className="relative min-h-[480px] flex items-center" style={bgStyle}>
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/20" />
      {/* Photo change overlay in edit mode */}
      {props.isEditing && (
        <button
          type="button"
          onClick={() => props.onOpenMediaLibrary?.((url) => props.onChange?.({ ...content, photoUrl: url }))}
          className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/20 hover:bg-white/30 text-white rounded-lg border border-white/30 transition-colors"
        >
          <Camera className="w-3 h-3" />
          {content.photoUrl ? "Change photo" : "Add background photo"}
        </button>
      )}
      {/* Content */}
      <div className="relative z-10 max-w-3xl px-8 py-16">
        <OwnerBioBlock
          {...props}
          align="left"
          onDark={true}
        />
      </div>
    </div>
  );
}

// ── Layout picker (edit mode) ──────────────────────────────────────────────────

const LAYOUTS: Array<{ key: MeetOwnerLayout; label: string; icon: string }> = [
  { key: "split",    label: "Split",    icon: "⬛▪" },
  { key: "centered", label: "Centered", icon: "○" },
  { key: "card",     label: "Card",     icon: "▭" },
  { key: "full-bg",  label: "Full Bg",  icon: "▓" },
];

// ── Section header (heading/subheading) ───────────────────────────────────────

function SectionHeader({ content, sid, onChange }: Pick<SharedProps, "content" | "sid" | "onChange">) {
  if (!content.heading && !content.subheading) return null;
  return (
    <div className="text-center mb-12">
      {content.heading !== undefined && (
        <InlineEditableText
          id={`${sid}-heading`}
          as="h2"
          value={content.heading ?? ""}
          placeholder="Meet the Owner"
          className="text-3xl font-bold mb-2"
          style={{ color: "var(--theme-text, #111827)" }}
          onCommit={v => onChange?.({ ...content!, heading: v })}
        />
      )}
      {content.subheading !== undefined && (
        <InlineEditableText
          id={`${sid}-subheading`}
          as="p"
          value={content.subheading ?? ""}
          placeholder="The person behind the work"
          className="text-base"
          style={{ color: "var(--theme-text-muted, #6b7280)" }}
          onCommit={v => onChange?.({ ...content!, subheading: v || undefined })}
        />
      )}
    </div>
  );
}

// ── Edit-mode toggle bar ───────────────────────────────────────────────────────

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-primary" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface MeetOwnerSectionProps {
  content: MeetOwnerContent;
  settings: SiteSettings;
  isEditing?: boolean;
  onChange?: (content: MeetOwnerContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

export function MeetOwnerSection({
  content,
  settings,
  isEditing = false,
  onChange,
  blockStyle,
  sectionId,
  onOpenMediaLibrary,
}: MeetOwnerSectionProps) {
  const sid = sectionId ?? "meet-owner";

  const sharedProps: SharedProps = { content, settings, sid, isEditing, onChange, onOpenMediaLibrary };

  function renderLayout() {
    switch (content.layout) {
      case "split":    return <SplitLayout    {...sharedProps} />;
      case "centered": return <CenteredLayout {...sharedProps} />;
      case "card":     return <CardLayout     {...sharedProps} />;
      case "full-bg":  return <FullBgLayout   {...sharedProps} />;
      default:         return <SplitLayout    {...sharedProps} />;
    }
  }

  const isFullBg = content.layout === "full-bg";

  return (
    <BlockStyleWrapper
      wrapperClassName={isFullBg ? "" : "py-16 px-6"}
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      {/* Edit toolbar: layout switcher + toggle options */}
      {isEditing && (
        <div className="flex flex-wrap items-center gap-4 mb-6 px-2 py-3 bg-muted/30 rounded-lg border border-border">
          {/* Layout selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1 font-medium">Layout:</span>
            {LAYOUTS.map(l => (
              <button
                key={l.key}
                type="button"
                onClick={() => onChange?.({ ...content, layout: l.key })}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  content.layout === l.key
                    ? "bg-primary text-white border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary hover:text-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          {/* Section toggles */}
          <div className="flex items-center gap-4 ml-auto">
            <ToggleRow label="Quote"     checked={content.showQuote     !== false} onChange={v => onChange?.({ ...content, showQuote: v })} />
            <ToggleRow label="Signature" checked={content.showSignature !== false} onChange={v => onChange?.({ ...content, showSignature: v })} />
            <ToggleRow label="Stats"     checked={content.showStats     !== false} onChange={v => onChange?.({ ...content, showStats: v })} />
            <ToggleRow label="Badges"    checked={content.showBadges    !== false} onChange={v => onChange?.({ ...content, showBadges: v })} />
          </div>
        </div>
      )}

      {/* Section heading (not shown in full-bg layout) */}
      {!isFullBg && (content.heading || content.subheading) && (
        <SectionHeader content={content} sid={sid} onChange={onChange} />
      )}

      {/* Layout */}
      {isFullBg ? renderLayout() : (
        <div className={isEditing ? "px-2" : ""}>
          {renderLayout()}
        </div>
      )}
    </BlockStyleWrapper>
  );
}
