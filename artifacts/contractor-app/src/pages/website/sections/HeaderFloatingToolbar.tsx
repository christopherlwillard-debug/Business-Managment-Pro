import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Image as ImageIcon, List, Phone, MousePointer, Palette, Settings2,
  Plus, Trash2, GripVertical, FileText, ChevronDown, AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ButtonEditor } from "./ButtonEditor";
import type { HeaderContent, SitePageRef, NavLink } from "./HeaderSection";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HeaderFloatingToolbarProps {
  content: HeaderContent;
  settings: {
    brandColor: string;
    accentColor?: string;
    logoUrl?: string;
    headerStyle?: "light" | "dark" | "transparent";
  };
  onChange: (content: HeaderContent) => void;
  businessName?: string;
  siteSlug?: string;
  pages?: SitePageRef[];
  /** Ref to the header's root DOM element — used for toolbar positioning. */
  headerRef: React.RefObject<HTMLElement>;
  /** Called when "Advanced" tab is clicked — opens InspectorPanel. */
  onAdvanced?: () => void;
}

type TabId = "logo" | "nav" | "phone" | "cta" | "style" | "advanced";

// Maps logoSize string aliases → pixel heights
const LOGO_SIZE_TO_PX: Record<string, number> = {
  sm: 48, small: 48,
  md: 64, medium: 64,
  lg: 80, large: 80,
};

function resolveLogoHeightPx(logoSize: string | number | undefined): number {
  if (logoSize === undefined) return 64;
  if (typeof logoSize === "number") return logoSize;
  return LOGO_SIZE_TO_PX[logoSize] ?? 64;
}

// ── Small reusable helpers ─────────────────────────────────────────────────────

function ToolbarToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-white/70">{label}</span>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-8 h-4 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
      </label>
    </div>
  );
}

function PopoverSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

// ── PageLinkPicker (copied from HeaderSection) ────────────────────────────────

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
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 text-white/30 hover:text-primary hover:bg-primary/10 rounded transition-colors"
      >
        <FileText className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 z-[9999] bg-gray-800 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px]">
            <div className="px-2.5 py-1.5 border-b border-white/10">
              <p className="text-[9px] text-white/40 font-semibold uppercase tracking-wide">Fill from page</p>
            </div>
            {pages.map((page) => (
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

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "logo",     label: "Logo",     icon: <ImageIcon      className="w-3 h-3" /> },
  { id: "nav",      label: "Nav",      icon: <List           className="w-3 h-3" /> },
  { id: "phone",    label: "Phone",    icon: <Phone          className="w-3 h-3" /> },
  { id: "cta",      label: "CTA",      icon: <MousePointer   className="w-3 h-3" /> },
  { id: "style",    label: "Style",    icon: <Palette        className="w-3 h-3" /> },
  { id: "advanced", label: "Advanced", icon: <Settings2      className="w-3 h-3" /> },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export function HeaderFloatingToolbar({
  content,
  settings,
  onChange,
  businessName: _businessName,
  siteSlug,
  pages = [],
  headerRef,
  onAdvanced,
}: HeaderFloatingToolbarProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const rafRef = useRef<number>(0);
  const [showPagesPicker, setShowPagesPicker] = useState(false);

  // ── Live-track the header element's position ────────────────────────────────
  useEffect(() => {
    function measure() {
      const el = headerRef.current;
      if (!el) { setRect(null); return; }
      setRect(el.getBoundingClientRect());
    }
    measure();

    const obs = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    if (headerRef.current) obs.observe(headerRef.current);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(rafRef.current);
    };
  }, [headerRef]);

  if (!rect) return null;

  // ── Positioning ──────────────────────────────────────────────────────────────
  const TOOLBAR_H = 36;
  const GAP = 6;
  const top = Math.max(4, rect.top - TOOLBAR_H - GAP);
  const left = rect.left + rect.width / 2;

  // ── Content helpers ──────────────────────────────────────────────────────────
  const navLinks: NavLink[] = content.navLinks ?? [];
  const phone = content.phone ?? "";
  const ctaLabel = content.ctaLabel ?? "Get a Quote";
  const ctaConfig = content.ctaConfig;
  const sticky = content.sticky ?? true;
  const showLogo = content.showLogo !== false;
  const showBusinessName = content.showBusinessName !== false;
  const showNav = content.showNav !== false;
  const showPhone = content.showPhone !== false;
  const showCta = content.showCta !== false;
  const showVeteranBadge = content.showVeteranBadge === true;
  const showSdvosbBadge = content.showSdvosbBadge === true;
  const logoAlignment = content.logoAlignment ?? "left";
  const headerStyleOverride = content.headerStyle ?? settings.headerStyle ?? "light";
  const logoHeightPx = resolveLogoHeightPx(content.logoSize);

  function update(patch: Partial<HeaderContent>) {
    onChange({ ...content, ...patch });
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function updateNavLink(id: string, patch: Partial<NavLink>) {
    update({ navLinks: navLinks.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }

  function addNavLink(pageOption?: SitePageRef) {
    if (pageOption && siteSlug) {
      update({
        navLinks: [...navLinks, { id: uid(), label: pageOption.name, href: `/site/${siteSlug}/${pageOption.slug}` }],
      });
    } else {
      update({ navLinks: [...navLinks, { id: uid(), label: "New Link", href: "#" }] });
    }
    setShowPagesPicker(false);
  }

  function fillLinkFromPage(linkId: string, page: SitePageRef) {
    if (!siteSlug) return;
    updateNavLink(linkId, { label: page.name, href: `/site/${siteSlug}/${page.slug}` });
  }

  function removeNavLink(id: string) {
    update({ navLinks: navLinks.filter((l) => l.id !== id) });
  }

  const extraPages = pages.filter((p) => p.id !== "home");

  // ── Popover content renderers ─────────────────────────────────────────────────

  function renderLogoPopover() {
    return (
      <div className="space-y-4 w-64">
        <PopoverSection title="Logo">
          <ToolbarToggleRow label="Show logo" checked={showLogo} onChange={(v) => update({ showLogo: v })} />
          <ToolbarToggleRow label="Show business name" checked={showBusinessName} onChange={(v) => update({ showBusinessName: v })} />
        </PopoverSection>

        {settings.logoUrl && (
          <PopoverSection title="Size">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60">Height</span>
                <span className="text-xs font-mono text-white/80">{logoHeightPx}px</span>
              </div>
              <input
                type="range"
                min={40}
                max={120}
                step={4}
                value={logoHeightPx}
                onChange={(e) => update({ logoSize: parseInt(e.target.value) as any })}
                className="w-full h-1.5 appearance-none rounded-full cursor-pointer accent-primary bg-white/20"
              />
              <div className="flex justify-between text-[10px] text-white/30">
                <span>40px</span><span>80px</span><span>120px</span>
              </div>
            </div>
          </PopoverSection>
        )}

        <PopoverSection title="Alignment">
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => update({ logoAlignment: a })}
                className={`flex-1 flex items-center justify-center py-1.5 rounded border transition-colors ${
                  logoAlignment === a
                    ? "bg-primary border-primary text-white"
                    : "bg-white/5 border-white/20 text-white/60 hover:border-white/40 hover:text-white"
                }`}
                title={a.charAt(0).toUpperCase() + a.slice(1)}
              >
                {a === "left" ? <AlignLeft className="w-3 h-3" /> : a === "center" ? <AlignCenter className="w-3 h-3" /> : <AlignRight className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </PopoverSection>
      </div>
    );
  }

  function renderNavPopover() {
    return (
      <div className="space-y-4 w-72">
        <PopoverSection title="Visibility">
          <ToolbarToggleRow label="Navigation links" checked={showNav} onChange={(v) => update({ showNav: v })} />
          <ToolbarToggleRow label="Veteran-Owned badge" checked={showVeteranBadge} onChange={(v) => update({ showVeteranBadge: v })} />
          <ToolbarToggleRow label="SDVOSB badge" checked={showSdvosbBadge} onChange={(v) => update({ showSdvosbBadge: v })} />
        </PopoverSection>

        {showNav && (
          <PopoverSection title="Navigation Links">
            <div className="space-y-1.5">
              {navLinks.map((link) => {
                const isPageLink = link.href.startsWith("/site/");
                return (
                  <div key={link.id} className="flex items-center gap-1.5">
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
                        placeholder="#section"
                        className={`flex-1 min-w-0 text-xs bg-white/10 border text-white/70 placeholder-white/20 rounded px-2 py-1.5 outline-none focus:border-white/50 ${
                          isPageLink ? "border-primary/50 text-primary/80" : "border-white/20"
                        }`}
                      />
                      {extraPages.length > 0 && (
                        <PageLinkPicker
                          pages={extraPages}
                          onSelect={(page) => fillLinkFromPage(link.id, page)}
                        />
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

            <div className="relative">
              {extraPages.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPagesPicker((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add link
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showPagesPicker && (
                    <div className="absolute top-full left-0 mt-1 z-[9999] bg-gray-800 border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                      <div className="px-3 py-1.5 border-b border-white/10">
                        <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wide">Your Pages</p>
                      </div>
                      {extraPages.map((page) => (
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
          </PopoverSection>
        )}
      </div>
    );
  }

  function renderPhonePopover() {
    const email = content.email ?? "";
    const showEmail = content.showEmail === true;
    return (
      <div className="space-y-4 w-64">
        <PopoverSection title="Phone">
          <ToolbarToggleRow label="Show phone" checked={showPhone} onChange={(v) => update({ showPhone: v })} />
          <input
            type="text"
            value={phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="(555) 555-5555"
            className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
          />
        </PopoverSection>
        <PopoverSection title="Email">
          <ToolbarToggleRow label="Show email" checked={showEmail} onChange={(v) => update({ showEmail: v })} />
          <input
            type="email"
            value={email}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="info@yourbusiness.com"
            className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
          />
        </PopoverSection>
      </div>
    );
  }

  function renderCtaPopover() {
    return (
      <div className="space-y-4 w-64">
        <PopoverSection title="CTA Button">
          <ToolbarToggleRow label="Show CTA" checked={showCta} onChange={(v) => update({ showCta: v })} />
        </PopoverSection>
        <PopoverSection title="Label">
          <input
            type="text"
            value={ctaLabel}
            onChange={(e) => update({ ctaLabel: e.target.value })}
            placeholder="Button label"
            className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
          />
        </PopoverSection>
        <PopoverSection title="Style">
          <ButtonEditor config={ctaConfig} onChange={(cfg) => update({ ctaConfig: cfg })} />
        </PopoverSection>
      </div>
    );
  }

  function renderStylePopover() {
    return (
      <div className="space-y-4 w-60">
        <PopoverSection title="Header Style">
          <div className="flex gap-1">
            {(["light", "dark", "transparent"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update({ headerStyle: s })}
                className={`flex-1 py-1.5 text-[10px] rounded border transition-colors capitalize ${
                  headerStyleOverride === s
                    ? "bg-primary border-primary text-white"
                    : "bg-white/5 border-white/20 text-white/60 hover:border-white/40 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </PopoverSection>
        <PopoverSection title="Options">
          <ToolbarToggleRow
            label="Sticky (stays visible on scroll)"
            checked={sticky}
            onChange={(v) => update({ sticky: v })}
          />
        </PopoverSection>
      </div>
    );
  }

  // ── Render via portal ─────────────────────────────────────────────────────────

  const toolbar = (
    <div
      data-header-toolbar="true"
      style={{
        position: "fixed",
        top,
        left,
        transform: "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 bg-gray-900/96 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-2xl border border-white/10">
        {TABS.map((tab) => {
          if (tab.id === "advanced") {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { onAdvanced?.(); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Advanced settings"
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          }

          const isOpen = activeTab === tab.id;

          return (
            <Popover
              key={tab.id}
              open={isOpen}
              onOpenChange={(open) => setActiveTab(open ? tab.id : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    isOpen
                      ? "bg-white/20 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="center"
                sideOffset={8}
                className="bg-gray-900/98 border-white/10 text-white p-4 shadow-2xl backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
                onPointerDownOutside={(e) => {
                  // Keep open when interacting with sub-popovers (e.g. page picker)
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-header-toolbar]")) e.preventDefault();
                }}
              >
                {tab.id === "logo"  && renderLogoPopover()}
                {tab.id === "nav"   && renderNavPopover()}
                {tab.id === "phone" && renderPhonePopover()}
                {tab.id === "cta"   && renderCtaPopover()}
                {tab.id === "style" && renderStylePopover()}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );

  return createPortal(toolbar, document.body);
}
