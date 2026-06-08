import { Plus, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { InlineEditableText } from "../InlineEditableText";

export interface StatItem {
  id: string;
  value: string;
  label: string;
}

export interface StatsContent {
  heading?: string;
  subheading?: string;
  stats: StatItem[];
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function defaultStatsContent(): StatsContent {
  return {
    heading: "By the Numbers",
    stats: [
      { id: uid(), value: "500+", label: "Projects Completed" },
      { id: uid(), value: "15+", label: "Years in Business" },
      { id: uid(), value: "100%", label: "Licensed & Insured" },
      { id: uid(), value: "5★", label: "Average Rating" },
    ],
  };
}

interface StatsSectionProps {
  content: StatsContent;
  settings: { brandColor: string; accentColor?: string };
  isEditing?: boolean;
  onChange?: (content: StatsContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

export function StatsSection({ content, settings, isEditing, onChange, blockStyle, sectionId }: StatsSectionProps) {
  const stats = content.stats ?? [];
  const sid = sectionId ?? "stats";

  function update(patch: Partial<StatsContent>) {
    onChange?.({ ...content, ...patch });
  }

  function updateStat(id: string, patch: Partial<StatItem>) {
    update({ stats: stats.map(s => s.id === id ? { ...s, ...patch } : s) });
  }

  function addStat() {
    if (stats.length >= 6) return;
    update({ stats: [...stats, { id: uid(), value: "0", label: "Stat Label" }] });
  }

  function removeStat(id: string) {
    update({ stats: stats.filter(s => s.id !== id) });
  }

  const colClass =
    stats.length <= 2 ? "sm:grid-cols-2" :
    stats.length === 3 ? "sm:grid-cols-3" :
    "sm:grid-cols-2 lg:grid-cols-4";

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-16" isEditing={false}>
        <div className="max-w-5xl mx-auto">
          {content.heading && (
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>{content.heading}</h2>
              {content.subheading && <p className="mt-2" style={{ color: "var(--theme-text-muted, #6b7280)" }}>{content.subheading}</p>}
            </div>
          )}
          <div className={`grid grid-cols-2 ${colClass} gap-6`}>
            {stats.map(stat => (
              <div key={stat.id} className="text-center">
                <div
                  className="text-4xl md:text-5xl font-bold mb-2"
                  style={{ color: settings.brandColor }}
                >
                  {stat.value}
                </div>
                <div className="text-sm font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-6 py-12" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="max-w-5xl mx-auto space-y-6">
        {/* Section headings */}
        <div className="text-center space-y-1">
          <InlineEditableText
            id={`${sid}-heading`}
            as="h2"
            value={content.heading ?? ""}
            placeholder="Section heading (optional)"
            className="text-3xl font-bold"
            style={{ color: "var(--theme-text, #111827)" }}
            onCommit={v => update({ heading: v || undefined })}
          />
          <InlineEditableText
            id={`${sid}-subheading`}
            as="p"
            value={content.subheading ?? ""}
            placeholder="Subheading (optional)"
            style={{ color: "var(--theme-text-muted, #6b7280)" }}
            onCommit={v => update({ subheading: v || undefined })}
          />
        </div>

        {/* Stats grid — looks like the public view with InlineEditableText */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(stat => (
            <div key={stat.id} className="relative text-center group">
              <button
                type="button"
                onClick={() => removeStat(stat.id)}
                className="absolute -top-2 -right-2 p-0.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 z-10 bg-white shadow-sm border border-gray-100"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <InlineEditableText
                id={`${sid}-stat-${stat.id}-value`}
                as="div"
                value={stat.value}
                placeholder="500+"
                enterBehavior="commit"
                escapeBehavior="cancel"
                className="text-4xl font-bold mb-1 text-center"
                style={{ color: settings.brandColor }}
                onCommit={v => updateStat(stat.id, { value: v })}
              />
              <InlineEditableText
                id={`${sid}-stat-${stat.id}-label`}
                as="div"
                value={stat.label}
                placeholder="Stat Label"
                enterBehavior="commit"
                escapeBehavior="cancel"
                className="text-sm font-medium uppercase tracking-wide text-center"
                style={{ color: "var(--theme-text-muted, #4b5563)" }}
                onCommit={v => updateStat(stat.id, { label: v })}
              />
            </div>
          ))}

          {stats.length < 6 && (
            <button
              type="button"
              onClick={addStat}
              className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl p-4 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors min-h-[80px] bg-gray-50"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Add Stat</span>
            </button>
          )}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
