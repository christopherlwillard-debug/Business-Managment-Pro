// Dedicated inspector panel for the Services section.
// Mounted as specialContent in WebsiteEditor for all three inspector locations.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface ServicesInspectorContent {
  heading?: string;
  columns?: 1 | 2 | 3 | 4;
  layout?: "cards" | "icon_row" | "feature_grid";
  iconStyle?: "inline" | "circle";
  hoverLift?: boolean;
  items?: { id: string }[];
}

interface Props {
  content: ServicesInspectorContent;
  onChange: (patch: Partial<ServicesInspectorContent>) => void;
}

// ── Collapsible section ────────────────────────────────────────────────────────
function Section({ title, defaultOpen = false, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-medium text-foreground/80">{title}</span>
        {open
          ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
          : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Btn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded px-2 py-1.5 border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
      }`}
    >
      {children}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ServicesInspector({ content, onChange }: Props) {
  const layout    = content.layout    ?? "cards";
  const iconStyle = content.iconStyle ?? "inline";
  const columns   = content.columns;

  return (
    <div className="overflow-y-auto flex flex-col divide-y divide-border">

      {/* ── Presentation Layout ── */}
      <Section title="Presentation" defaultOpen>
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Layout</p>
          <div className="grid grid-cols-3 gap-1">
            <Btn active={layout === "cards"} onClick={() => onChange({ layout: "cards" })}>
              ⊞ Cards
            </Btn>
            <Btn active={layout === "icon_row"} onClick={() => onChange({ layout: "icon_row" })}>
              ☰ Icon Row
            </Btn>
            <Btn active={layout === "feature_grid"} onClick={() => onChange({ layout: "feature_grid" })}>
              ◈ Feature
            </Btn>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {layout === "cards"        && "Classic bordered cards in a grid."}
            {layout === "icon_row"     && "Horizontal list — icon on left, text on right."}
            {layout === "feature_grid" && "Large cards with bigger icons and more whitespace."}
          </p>
        </div>

        <div className="space-y-1.5 mt-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Icon Style</p>
          <div className="grid grid-cols-2 gap-1">
            <Btn active={iconStyle === "inline"} onClick={() => onChange({ iconStyle: "inline" })}>
              ⬜ Rounded
            </Btn>
            <Btn active={iconStyle === "circle"} onClick={() => onChange({ iconStyle: "circle" })}>
              ◯ Circle
            </Btn>
          </div>
        </div>
      </Section>

      {/* ── Columns ── */}
      <Section title="Columns">
        <div className="flex flex-wrap gap-1">
          {([
            { label: "Auto", value: undefined as undefined },
            { label: "1",    value: 1 as const },
            { label: "2",    value: 2 as const },
            { label: "3",    value: 3 as const },
            { label: "4",    value: 4 as const },
          ]).map(opt => (
            <Btn
              key={opt.label}
              active={columns === opt.value}
              onClick={() => onChange({ columns: opt.value })}
            >
              {opt.label}
            </Btn>
          ))}
        </div>
        {layout === "feature_grid" && !columns && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Auto = 2 columns for feature grid.</p>
        )}
      </Section>

      {/* ── Options ── */}
      <Section title="Options">
        <label className="flex items-start gap-2 cursor-pointer group">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border cursor-pointer"
            checked={content.hoverLift ?? false}
            onChange={e => onChange({ hoverLift: e.target.checked })}
          />
          <div>
            <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
              Hover Lift Effect
            </span>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Cards rise with a shadow on hover.
            </p>
          </div>
        </label>
      </Section>

      <p className="text-[10px] text-muted-foreground/60 text-center px-3 py-2">
        {content.items?.length ?? 0} service{(content.items?.length ?? 0) !== 1 ? "s" : ""} · click any card to edit
      </p>
    </div>
  );
}
