import { useState } from "react";
import { X, Megaphone } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface AlertBarContent {
  message: string;
  bgColor?: string;
  textColor?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  showDismiss?: boolean;
  /** If false the bar is hidden on live site without deletion */
  visible?: boolean;
}

export function defaultAlertBarContent(): AlertBarContent {
  return {
    message: "🎉 Now Hiring! Join our growing team — click to learn more.",
    bgColor: "#1a1a2e",
    textColor: "#ffffff",
    ctaLabel: "Learn More",
    ctaUrl: "#contact",
    showDismiss: true,
    visible: true,
  };
}

interface AlertBarSectionProps {
  content: AlertBarContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: AlertBarContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

const LS_KEY_PREFIX = "alert-bar-dismissed-";

export function AlertBarSection({ content, settings, isEditing, onChange, blockStyle, sectionId }: AlertBarSectionProps) {
  const c = { ...defaultAlertBarContent(), ...content };
  const dismissKey = `${LS_KEY_PREFIX}${sectionId ?? "default"}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (isEditing) return false;
    try { return localStorage.getItem(dismissKey) === "1"; } catch { return false; }
  });

  function update(patch: Partial<AlertBarContent>) {
    onChange?.({ ...c, ...patch });
  }

  function handleDismiss() {
    try { localStorage.setItem(dismissKey, "1"); } catch {}
    setDismissed(true);
  }

  const barStyle: React.CSSProperties = {
    backgroundColor: c.bgColor ?? settings.brandColor,
    color: c.textColor ?? "#ffffff",
  };

  if (!isEditing) {
    if (!c.visible || dismissed) return null;
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="">
        <div style={barStyle} className="w-full py-2.5 px-4 flex items-center justify-center gap-3 text-sm font-medium relative">
          <Megaphone className="w-4 h-4 flex-shrink-0 opacity-80" />
          <span className="flex-1 text-center">{c.message}</span>
          {c.ctaLabel && c.ctaUrl && (
            <a
              href={c.ctaUrl}
              className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border border-current opacity-90 hover:opacity-100 transition-opacity whitespace-nowrap"
            >
              {c.ctaLabel}
            </a>
          )}
          {c.showDismiss && (
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-shrink-0 absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </BlockStyleWrapper>
    );
  }

  // Editing mode
  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Alert Bar</p>
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

        {/* Live preview */}
        <div style={barStyle} className="w-full py-2.5 px-4 rounded-lg flex items-center gap-3 text-sm font-medium">
          <Megaphone className="w-4 h-4 flex-shrink-0 opacity-80" />
          <span className="flex-1 truncate">{c.message || "Alert message…"}</span>
          {c.ctaLabel && (
            <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border border-current opacity-80 whitespace-nowrap">
              {c.ctaLabel}
            </span>
          )}
          {c.showDismiss && <X className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />}
        </div>

        {/* Message */}
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Message</p>
          <textarea
            rows={2}
            className="w-full text-sm bg-background border border-border text-foreground rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder="Your announcement here…"
            value={c.message}
            onChange={e => update({ message: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Background color */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Background</p>
            <div className="flex items-center gap-1.5">
              <input type="color" className="w-7 h-7 rounded border border-border cursor-pointer p-0" value={c.bgColor ?? settings.brandColor} onChange={e => update({ bgColor: e.target.value })} />
              <input type="text" className="flex-1 text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none font-mono" value={c.bgColor ?? settings.brandColor} onChange={e => update({ bgColor: e.target.value })} />
            </div>
          </div>

          {/* Text color */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Text Color</p>
            <div className="flex items-center gap-1.5">
              <input type="color" className="w-7 h-7 rounded border border-border cursor-pointer p-0" value={c.textColor ?? "#ffffff"} onChange={e => update({ textColor: e.target.value })} />
              <input type="text" className="flex-1 text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none font-mono" value={c.textColor ?? "#ffffff"} onChange={e => update({ textColor: e.target.value })} />
            </div>
          </div>

          {/* CTA label */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Button Label</p>
            <input type="text" className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" placeholder="e.g. Learn More" value={c.ctaLabel ?? ""} onChange={e => update({ ctaLabel: e.target.value })} />
          </div>

          {/* CTA URL */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Button Link</p>
            <input type="text" className="w-full text-xs border border-border bg-background text-foreground rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary" placeholder="#contact or https://…" value={c.ctaUrl ?? ""} onChange={e => update({ ctaUrl: e.target.value })} />
          </div>
        </div>

        {/* Dismiss toggle */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={c.showDismiss ?? true} onChange={e => update({ showDismiss: e.target.checked })} className="rounded" />
          <span className="text-xs text-foreground">Show dismiss (×) button</span>
        </label>

        <button type="button" onClick={() => update({ bgColor: settings.brandColor })} className="text-xs text-primary hover:underline">
          Use brand color
        </button>
      </div>
    </BlockStyleWrapper>
  );
}
