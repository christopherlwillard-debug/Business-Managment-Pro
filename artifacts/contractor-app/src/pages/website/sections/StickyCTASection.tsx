import { Phone } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { getSafeWebsiteHref } from "../storageUtils";

export interface StickyCTAContent {
  primaryLabel: string;
  primaryAction: string;
  primaryActionType?: "phone" | "url" | "anchor";
  secondaryLabel?: string;
  secondaryAction?: string;
  secondaryActionType?: "phone" | "url" | "anchor";
  bgColor?: string;
  textColor?: string;
  visible?: boolean;
}

export function defaultStickyCTAContent(): StickyCTAContent {
  return {
    primaryLabel: "Call Now",
    primaryAction: "tel:",
    primaryActionType: "phone",
    secondaryLabel: "Get Free Estimate",
    secondaryAction: "#contact",
    secondaryActionType: "anchor",
    bgColor: "#1a1a2e",
    textColor: "#ffffff",
    visible: true,
  };
}

interface StickyCTASectionProps {
  content: StickyCTAContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: StickyCTAContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

function buildHref(action: unknown, type?: unknown): string {
  if (typeof action !== "string" || !action.trim()) return "#";
  const value = action.trim();
  const candidate = type === "phone" && !/^tel:/i.test(value) ? `tel:${value}` : value;
  return getSafeWebsiteHref(candidate) ?? "#";
}

export function StickyCTASection({ content, settings, isEditing, onChange, blockStyle }: StickyCTASectionProps) {
  const c = { ...defaultStickyCTAContent(), ...content };

  function update(patch: Partial<StickyCTAContent>) {
    onChange?.({ ...c, ...patch });
  }

  const barStyle: React.CSSProperties = {
    backgroundColor: c.bgColor ?? settings.brandColor,
    color: c.textColor ?? "#ffffff",
  };

  const bar = (
    <div style={barStyle} className="w-full flex items-center justify-center gap-3 px-4 py-3 shadow-lg">
      {c.primaryActionType === "phone" && <Phone className="w-4 h-4 flex-shrink-0" />}
      {isEditing ? (
        <span className="font-semibold text-sm">{c.primaryLabel}</span>
      ) : (
        <a
          href={buildHref(c.primaryAction, c.primaryActionType)}
          className="font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          {c.primaryLabel}
        </a>
      )}
      {c.secondaryLabel && (
        <>
          <span className="opacity-40 hidden md:inline">|</span>
          {isEditing ? (
            <span className="text-sm opacity-80 hidden md:inline">{c.secondaryLabel}</span>
          ) : (
            <a
              href={buildHref(c.secondaryAction ?? "#", c.secondaryActionType)}
              className="text-sm opacity-80 hover:opacity-100 transition-opacity hidden md:inline"
            >
              {c.secondaryLabel}
            </a>
          )}
        </>
      )}
    </div>
  );

  if (!isEditing) {
    if (!c.visible) return null;
    return (
      <div className="fixed bottom-0 inset-x-0 z-50" style={{ pointerEvents: "auto" }}>
        {bar}
      </div>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sticky CTA Bar</p>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-xs text-muted-foreground">Visible</span>
            <div
              onClick={() => update({ visible: !c.visible })}
              className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${c.visible ? "bg-primary" : "bg-muted"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${c.visible ? "translate-x-4" : ""}`} />
            </div>
          </label>
        </div>

        <div className="rounded-lg overflow-hidden border border-border">
          {bar}
        </div>

        <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
          ⚓ This bar sticks to the bottom of the screen on the live site. It appears inline here for editing.
        </p>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Background</p>
            <div className="flex items-center gap-1.5">
              <input type="color" className="w-7 h-7 rounded border border-border cursor-pointer p-0" value={c.bgColor ?? settings.brandColor} onChange={e => update({ bgColor: e.target.value })} />
              <input type="text" className="flex-1 text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none font-mono" value={c.bgColor ?? settings.brandColor} onChange={e => update({ bgColor: e.target.value })} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Text Color</p>
            <div className="flex items-center gap-1.5">
              <input type="color" className="w-7 h-7 rounded border border-border cursor-pointer p-0" value={c.textColor ?? "#ffffff"} onChange={e => update({ textColor: e.target.value })} />
              <input type="text" className="flex-1 text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none font-mono" value={c.textColor ?? "#ffffff"} onChange={e => update({ textColor: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Primary Button</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Label</p>
              <input type="text" className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" value={c.primaryLabel} onChange={e => update({ primaryLabel: e.target.value })} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Type</p>
              <select className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none" value={c.primaryActionType ?? "phone"} onChange={e => update({ primaryActionType: e.target.value as StickyCTAContent["primaryActionType"] })}>
                <option value="phone">Phone Number</option>
                <option value="anchor">Page Anchor</option>
                <option value="url">URL</option>
              </select>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">
              {c.primaryActionType === "phone" ? "Phone number (e.g. 5551234567)" : "Link (e.g. #contact or https://…)"}
            </p>
            <input type="text" className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" value={c.primaryAction} onChange={e => update({ primaryAction: e.target.value })} />
          </div>
        </div>

        {/* Secondary CTA */}
        <div className="border border-border rounded-lg p-3 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Secondary Button (optional)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Label</p>
              <input type="text" className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" placeholder="Leave empty to hide" value={c.secondaryLabel ?? ""} onChange={e => update({ secondaryLabel: e.target.value })} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Type</p>
              <select className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none" value={c.secondaryActionType ?? "anchor"} onChange={e => update({ secondaryActionType: e.target.value as StickyCTAContent["secondaryActionType"] })}>
                <option value="phone">Phone Number</option>
                <option value="anchor">Page Anchor</option>
                <option value="url">URL</option>
              </select>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Link</p>
            <input type="text" className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" placeholder="#contact" value={c.secondaryAction ?? ""} onChange={e => update({ secondaryAction: e.target.value })} />
          </div>
        </div>

        <button type="button" onClick={() => update({ bgColor: settings.brandColor })} className="text-xs text-primary hover:underline">
          Use brand color
        </button>
      </div>
    </BlockStyleWrapper>
  );
}
