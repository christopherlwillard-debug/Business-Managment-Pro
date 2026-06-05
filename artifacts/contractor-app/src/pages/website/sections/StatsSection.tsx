import { Plus, Trash2 } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

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
}

export function StatsSection({ content, settings, isEditing, onChange, blockStyle }: StatsSectionProps) {
  const stats = content.stats ?? [];

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
              <h2 className="text-3xl font-bold text-gray-900">{content.heading}</h2>
              {content.subheading && <p className="text-gray-500 mt-2">{content.subheading}</p>}
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
                <div className="text-gray-600 text-sm font-medium uppercase tracking-wide">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} wrapperClassName="px-4 py-8" isEditing={true}>
      <div onClick={e => e.stopPropagation()} className="space-y-4">
        <div className="space-y-2">
          <input
            type="text"
            className="w-full text-lg font-bold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none focus:border-white/60"
            placeholder="Section heading (optional)"
            value={content.heading ?? ""}
            onChange={e => update({ heading: e.target.value })}
          />
          <input
            type="text"
            className="w-full text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-1.5 outline-none focus:border-white/60"
            placeholder="Subheading (optional)"
            value={content.subheading ?? ""}
            onChange={e => update({ subheading: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(stat => (
            <div key={stat.id} className="bg-white/10 border border-white/20 rounded-xl p-3 space-y-2 relative">
              <button
                type="button"
                onClick={() => removeStat(stat.id)}
                className="absolute top-2 right-2 p-0.5 text-white/30 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <input
                type="text"
                className="w-full text-xl font-bold bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1 outline-none focus:border-white/50 text-center"
                placeholder="500+"
                value={stat.value}
                onChange={e => updateStat(stat.id, { value: e.target.value })}
              />
              <input
                type="text"
                className="w-full text-xs bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-2 py-1 outline-none focus:border-white/50 text-center"
                placeholder="Label"
                value={stat.label}
                onChange={e => updateStat(stat.id, { label: e.target.value })}
              />
            </div>
          ))}

          {stats.length < 6 && (
            <button
              type="button"
              onClick={addStat}
              className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-white/30 rounded-xl p-4 text-white/50 hover:text-white hover:border-white/60 transition-colors min-h-[90px]"
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
