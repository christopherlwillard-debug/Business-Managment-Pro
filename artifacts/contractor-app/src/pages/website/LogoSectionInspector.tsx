// Inspector panel content for Featured Clients and Partners sections in logo mode.
// Rendered as `specialContent` inside InspectorPanel — replaces the default
// "click to edit on canvas" placeholder with actual section controls.

import type { FeaturedClientsContent } from "./sections/FeaturedClientsSection";
import type { PartnersContent } from "./sections/PartnersSection";

// ── Shared content shape ───────────────────────────────────────────────────────

type LogoContent = (FeaturedClientsContent | PartnersContent) & {
  displayMode?: "card" | "logo";
  logoMaxHeight?: number;
  normalizePadding?: boolean;
  showHoverEffect?: boolean;
  grayscaleUntilHover?: boolean;
  roundedCorners?: boolean;
};

interface Props {
  content: LogoContent;
  sectionType: "featured-clients" | "partners";
  onChange: (patch: Partial<LogoContent>) => void;
}

// ── Preset titles per section type ────────────────────────────────────────────

const TITLE_PRESETS: Record<string, string[]> = {
  "featured-clients": [
    "Trusted By",
    "Featured Clients",
    "Our Clients",
    "Who We've Worked With",
    "Companies We've Served",
  ],
  "partners": [
    "Brands We Work With",
    "Our Partners",
    "Manufacturers We Use",
    "Dealer Partners",
    "Trusted Brands",
  ],
};

const LOGO_HEIGHTS = [
  { label: "Small (48px)",      value: 48  },
  { label: "Medium (64px)",     value: 64  },
  { label: "Large (80px)",      value: 80  },
  { label: "XL (96px)",         value: 96  },
];

const COLUMN_OPTIONS: { label: string; value: 2 | 3 | 4 | 5 | undefined }[] = [
  { label: "Auto", value: undefined },
  { label: "2",    value: 2 },
  { label: "3",    value: 3 },
  { label: "4",    value: 4 },
  { label: "5",    value: 5 },
];

// ── Helper: small toggle button ───────────────────────────────────────────────

function ToggleBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

// ── Main component ────────────────────────────────────────────────────────────

export function LogoSectionInspector({ content, sectionType, onChange }: Props) {
  const isLogoMode = content.displayMode === "logo";
  const maxH       = content.logoMaxHeight ?? 64;
  const presets    = TITLE_PRESETS[sectionType] ?? TITLE_PRESETS["featured-clients"];
  const isPreset   = presets.includes(content.heading);

  return (
    <div className="p-3 flex flex-col gap-4 overflow-y-auto">

      {/* ── Display Mode ────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Display Mode
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <ToggleBtn active={!isLogoMode} onClick={() => onChange({ displayMode: "card" })}>
            🃏 Cards
          </ToggleBtn>
          <ToggleBtn active={isLogoMode} onClick={() => onChange({ displayMode: "logo" })}>
            🖼️ Logo Grid
          </ToggleBtn>
        </div>
      </div>

      {/* ── Section Title preset ─────────────────────────────────────────── */}
      <div>
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
          Section Title
        </label>
        <select
          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          value={isPreset ? content.heading : "__custom__"}
          onChange={e => {
            if (e.target.value !== "__custom__") onChange({ heading: e.target.value });
          }}
        >
          {presets.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value="__custom__">Custom — edit on canvas</option>
        </select>
      </div>

      {/* ── Columns ──────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          Columns
        </p>
        <div className="flex flex-wrap gap-1">
          {COLUMN_OPTIONS.map(opt => (
            <ToggleBtn
              key={opt.label}
              active={content.columns === opt.value}
              onClick={() => onChange({ columns: opt.value })}
            >
              {opt.label}
            </ToggleBtn>
          ))}
        </div>
      </div>

      {/* ── Logo-specific controls (only in logo mode) ────────────────────── */}
      {isLogoMode && (
        <>
          {/* Logo size */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Logo Size
            </p>
            <div className="grid grid-cols-2 gap-1">
              {LOGO_HEIGHTS.map(opt => (
                <ToggleBtn
                  key={opt.value}
                  active={maxH === opt.value}
                  onClick={() => onChange({ logoMaxHeight: opt.value })}
                >
                  {opt.label}
                </ToggleBtn>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Options
            </p>
            <div className="flex flex-col gap-2.5">
              {([
                {
                  key:   "normalizePadding" as const,
                  label: "Normalize Logo Padding",
                  desc:  "Adds equal CSS padding around every logo so mixed-whitespace sets look balanced",
                },
                {
                  key:   "roundedCorners" as const,
                  label: "Rounded Cards",
                  desc:  null,
                },
                {
                  key:   "showHoverEffect" as const,
                  label: "Hover Effect",
                  desc:  "Scale + shadow on hover",
                },
                {
                  key:   "grayscaleUntilHover" as const,
                  label: "Grayscale Until Hover",
                  desc:  "Logos fade to color when hovered",
                },
              ] as const).map(({ key, label, desc }) => (
                <label key={key} className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-border cursor-pointer"
                    checked={!!content[key]}
                    onChange={e => onChange({ [key]: e.target.checked })}
                  />
                  <div>
                    <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                      {label}
                    </span>
                    {desc && (
                      <p className="text-[10px] text-muted-foreground leading-snug">{desc}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Footer hint ──────────────────────────────────────────────────── */}
      <p className="text-[10px] text-muted-foreground/60 text-center border-t border-border pt-2">
        {content.items.length} item{content.items.length !== 1 ? "s" : ""} · click any item on canvas to edit
      </p>
    </div>
  );
}
