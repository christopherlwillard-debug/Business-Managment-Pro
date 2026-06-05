import { useState } from "react";
import { Plus, Trash2, GripVertical, Phone, Menu, FileText, ChevronDown } from "lucide-react";
import { ButtonEditor, type ButtonConfig } from "./ButtonEditor";

export interface NavLink {
  id: string;
  label: string;
  href: string;
}

export interface HeaderContent {
  navLinks: NavLink[];
  phone?: string;
  ctaLabel?: string;
  ctaConfig?: ButtonConfig;
  sticky?: boolean;
}

export interface SitePageRef {
  id: string;
  name: string;
  slug: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultHeaderContent(): HeaderContent {
  return {
    navLinks: [
      { id: uid(), label: "Services", href: "#services" },
      { id: uid(), label: "About", href: "#about" },
      { id: uid(), label: "Contact", href: "#contact" },
      { id: uid(), label: "Portfolio", href: "#portfolio" },
    ],
    phone: "",
    ctaLabel: "Get a Quote",
    ctaConfig: { url: "#contact", borderRadius: "pill" },
    sticky: true,
  };
}

interface HeaderSectionProps {
  content: HeaderContent;
  settings: {
    brandColor: string;
    accentColor?: string;
    logoUrl?: string;
    headerStyle?: "light" | "dark" | "transparent";
  };
  isEditing?: boolean;
  onChange?: (content: HeaderContent) => void;
  businessName?: string;
  siteSlug?: string;
  pages?: SitePageRef[];
}

function HeaderPreviewBar({
  content,
  settings,
  businessName,
}: {
  content: HeaderContent;
  settings: HeaderSectionProps["settings"];
  businessName?: string;
}) {
  const headerStyle = settings.headerStyle ?? "light";
  const isDark = headerStyle === "dark" || headerStyle === "transparent";
  const borderClass =
    headerStyle === "dark"
      ? "border-gray-700"
      : headerStyle === "transparent"
      ? "border-white/10"
      : "border-gray-100";
  const transparentBgClass = headerStyle === "transparent" ? "bg-white/10 backdrop-blur-sm" : "";

  const darkFallbackBg = headerStyle === "dark" ? "#111827" : "#ffffff";
  const darkFallbackText = isDark ? "#ffffff" : "#111111";
  const darkFallbackLink = isDark ? "rgba(255,255,255,0.7)" : "#4b5563";

  const navLinks = content.navLinks ?? [];
  const phone = content.phone ?? "";
  const ctaLabel = content.ctaLabel ?? "Get a Quote";

  return (
    <div
      className={`px-6 py-3 flex items-center justify-between border-b ${transparentBgClass} ${borderClass}`}
      style={{
        backgroundColor: headerStyle !== "transparent" ? `var(--theme-header-bg, ${darkFallbackBg})` : undefined,
        color: `var(--theme-header-text, ${darkFallbackText})`,
      }}
    >
      <div className="flex items-center gap-3 flex-shrink-0">
        {settings.logoUrl && (
          <img
            src={settings.logoUrl}
            alt={businessName ?? "Logo"}
            className="h-8 w-auto object-contain"
          />
        )}
        <span className="font-bold text-sm" style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}>
          {businessName ?? "Your Business"}
        </span>
      </div>

      <nav className="hidden md:flex items-center gap-6">
        {navLinks.map((link) => (
          <span
            key={link.id}
            className="text-sm font-medium transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
          >
            {link.label}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3 flex-shrink-0">
        {phone && (
          <span
            className="hidden md:block text-sm font-medium"
            style={{ color: `var(--theme-header-link, ${darkFallbackLink})` }}
          >
            {phone}
          </span>
        )}
        <span
          className="px-4 py-2 text-sm text-white cursor-pointer transition-opacity hover:opacity-90"
          style={{
            backgroundColor: settings.brandColor,
            borderRadius: "var(--theme-btn-radius, 9999px)",
            fontWeight: "var(--theme-btn-font-weight, 600)" as React.CSSProperties["fontWeight"],
            boxShadow: "var(--theme-btn-shadow, none)",
          }}
        >
          {ctaLabel}
        </span>
        <span className="md:hidden cursor-pointer" style={{ color: `var(--theme-header-text, ${darkFallbackText})` }}>
          <Menu className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

export function HeaderSection({
  content,
  settings,
  isEditing,
  onChange,
  businessName,
  siteSlug,
  pages = [],
}: HeaderSectionProps) {
  const navLinks = content.navLinks ?? [];
  const phone = content.phone ?? "";
  const ctaLabel = content.ctaLabel ?? "Get a Quote";
  const ctaConfig = content.ctaConfig;
  const sticky = content.sticky ?? true;

  const [showPagesPicker, setShowPagesPicker] = useState(false);

  const extraPages = pages.filter(p => p.id !== "home");

  function update(patch: Partial<HeaderContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateNavLink(id: string, patch: Partial<NavLink>) {
    update({ navLinks: navLinks.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }

  function addNavLink(pageOption?: SitePageRef) {
    if (pageOption && siteSlug) {
      update({
        navLinks: [...navLinks, {
          id: uid(),
          label: pageOption.name,
          href: `/site/${siteSlug}/${pageOption.slug}`,
        }],
      });
    } else {
      update({
        navLinks: [...navLinks, { id: uid(), label: "New Link", href: "#" }],
      });
    }
    setShowPagesPicker(false);
  }

  function fillLinkFromPage(linkId: string, page: SitePageRef) {
    if (!siteSlug) return;
    updateNavLink(linkId, {
      label: page.name,
      href: `/site/${siteSlug}/${page.slug}`,
    });
  }

  function removeNavLink(id: string) {
    update({ navLinks: navLinks.filter((l) => l.id !== id) });
  }

  if (!isEditing) {
    return (
      <HeaderPreviewBar content={content} settings={settings} businessName={businessName} />
    );
  }

  return (
    <div>
      <HeaderPreviewBar content={content} settings={settings} businessName={businessName} />

      <div
        className="bg-slate-900 border-t border-white/10 px-4 py-4 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
          Header Settings
        </p>

        {/* Nav links */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/70">Navigation Links</p>
          <div className="space-y-1.5">
            {navLinks.map((link) => {
              const isPageLink = link.href.startsWith("/site/");
              return (
                <div key={link.id} className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                  <input
                    type="text"
                    value={link.label}
                    onChange={(e) => updateNavLink(link.id, { label: e.target.value })}
                    placeholder="Label"
                    className="flex-1 min-w-0 text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <input
                      type="text"
                      value={link.href}
                      onChange={(e) => updateNavLink(link.id, { href: e.target.value })}
                      placeholder="#section or /page"
                      className={`flex-1 min-w-0 text-xs bg-white/10 border text-white/70 placeholder-white/20 rounded px-2 py-1.5 outline-none focus:border-white/50 ${
                        isPageLink ? "border-primary/50 text-primary/80" : "border-white/20"
                      }`}
                    />
                    {extraPages.length > 0 && (
                      <div className="relative flex-shrink-0">
                        <PageLinkPicker
                          pages={extraPages}
                          onSelect={(page) => fillLinkFromPage(link.id, page)}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeNavLink(link.id)}
                    className="p-1 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add link — smart picker if pages exist */}
          <div className="relative">
            {extraPages.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowPagesPicker(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add link
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showPagesPicker && (
                  <div className="absolute top-full left-0 mt-1 z-30 bg-gray-800 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                    <div className="px-3 py-1.5 border-b border-white/10">
                      <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wide">Your Pages</p>
                    </div>
                    {extraPages.map(page => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => addNavLink(page)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-white hover:bg-white/10 transition-colors"
                      >
                        <FileText className="w-3 h-3 text-primary/70 flex-shrink-0" />
                        {page.name}
                      </button>
                    ))}
                    <div className="border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => addNavLink()}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-white/60 hover:bg-white/10 transition-colors"
                      >
                        <Plus className="w-3 h-3 flex-shrink-0" />
                        Custom link
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => addNavLink()}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add link
              </button>
            )}
          </div>
        </div>

        {/* Phone number */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
            <Phone className="w-3 h-3" />
            Phone Number
          </label>
          <input
            type="text"
            value={phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="(555) 555-5555 — leave blank to hide"
            className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
          />
        </div>

        {/* CTA button */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-white/70">CTA Button</p>
          <input
            type="text"
            value={ctaLabel}
            onChange={(e) => update({ ctaLabel: e.target.value })}
            placeholder="Button label"
            className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
          />
          <ButtonEditor
            config={ctaConfig}
            onChange={(cfg) => update({ ctaConfig: cfg })}
          />
        </div>

        {/* Sticky toggle */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={!!sticky}
              onChange={(e) => update({ sticky: e.target.checked })}
            />
            <div className="w-8 h-4 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
          </label>
          <span className="text-xs text-white/70">
            Sticky header (stays visible on scroll)
          </span>
        </div>
      </div>
    </div>
  );
}

function PageLinkPicker({
  pages,
  onSelect,
}: {
  pages: SitePageRef[];
  onSelect: (page: SitePageRef) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        title="Fill from page"
        onClick={() => setOpen(v => !v)}
        className="p-1.5 text-white/30 hover:text-primary hover:bg-primary/10 rounded transition-colors"
      >
        <FileText className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-30 bg-gray-800 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
            <div className="px-2.5 py-1.5 border-b border-white/10">
              <p className="text-[9px] text-white/40 font-semibold uppercase tracking-wide">Fill from page</p>
            </div>
            {pages.map(page => (
              <button
                key={page.id}
                type="button"
                onClick={() => { onSelect(page); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs text-white hover:bg-white/10 transition-colors"
              >
                {page.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
