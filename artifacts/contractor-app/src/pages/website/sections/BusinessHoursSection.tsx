import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";

export interface DayHours {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

export interface BusinessHoursContent {
  heading?: string;
  hours: DayHours[];
  showBadge?: boolean;
}

const DEFAULT_DAYS: DayHours[] = [
  { day: "Monday",    open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Tuesday",   open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Wednesday", open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Thursday",  open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Friday",    open: "8:00 AM", close: "5:00 PM", closed: false },
  { day: "Saturday",  open: "9:00 AM", close: "2:00 PM", closed: false },
  { day: "Sunday",    open: "",        close: "",         closed: true  },
];

export function defaultBusinessHoursContent(): BusinessHoursContent {
  return {
    heading: "Business Hours",
    hours: DEFAULT_DAYS.map(d => ({ ...d })),
    showBadge: true,
  };
}

interface BusinessHoursSectionProps {
  content: BusinessHoursContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: BusinessHoursContent) => void;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

function isOpenNow(hours: DayHours[]): boolean {
  const now = new Date();
  const dayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()];
  const row = hours.find(h => h.day === dayName);
  if (!row || row.closed) return false;

  function parseTime(t: string): number | null {
    const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ampm = m[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }

  const openMin = parseTime(row.open);
  const closeMin = parseTime(row.close);
  if (openMin === null || closeMin === null) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= openMin && nowMin < closeMin;
}

export function BusinessHoursSection({ content, settings, isEditing, onChange, blockStyle, sectionId }: BusinessHoursSectionProps) {
  const c: BusinessHoursContent = {
    ...defaultBusinessHoursContent(),
    ...content,
    hours: content.hours?.length ? content.hours : DEFAULT_DAYS.map(d => ({ ...d })),
  };

  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const openNow = isOpenNow(c.hours);

  function update(patch: Partial<BusinessHoursContent>) {
    onChange?.({ ...c, ...patch });
  }

  function updateDay(idx: number, patch: Partial<DayHours>) {
    const next = c.hours.map((h, i) => i === idx ? { ...h, ...patch } : h);
    update({ hours: next });
  }

  if (!isEditing) {
    return (
      <BlockStyleWrapper blockStyle={blockStyle} isEditing={false} wrapperClassName="px-6 py-14">
        <div className="max-w-lg mx-auto">
          {(c.heading || c.showBadge) && (
            <div className="flex items-center justify-between mb-6">
              {c.heading && (
                <h2 className="text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>
                  {c.heading}
                </h2>
              )}
              {c.showBadge && (
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${openNow ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}
                >
                  {openNow ? "Open Now" : "Closed Now"}
                </span>
              )}
            </div>
          )}
          <div className="divide-y" style={{ borderColor: "var(--theme-border, #e5e7eb)" }}>
            {c.hours.map((row, i) => {
              const isToday = row.day === todayName;
              return (
                <div
                  key={i}
                  className={`flex justify-between py-3 text-sm ${isToday ? "font-semibold" : ""}`}
                  style={{
                    color: row.closed
                      ? "var(--theme-text-muted, #9ca3af)"
                      : isToday
                      ? settings.brandColor
                      : "var(--theme-text, #374151)",
                  }}
                >
                  <span className="flex items-center gap-2">
                    {isToday && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: settings.brandColor }}
                      />
                    )}
                    {row.day}
                  </span>
                  <span>{row.closed ? "Closed" : `${row.open} – ${row.close}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </BlockStyleWrapper>
    );
  }

  return (
    <BlockStyleWrapper blockStyle={blockStyle} isEditing={true} wrapperClassName="px-4 py-2">
      <div onClick={e => e.stopPropagation()} className="space-y-3 bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-sm">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Business Hours</p>

        <input
          type="text"
          className="w-full text-lg font-bold bg-background border border-border text-foreground rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Section heading"
          value={c.heading ?? ""}
          onChange={e => update({ heading: e.target.value })}
        />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={c.showBadge ?? true} onChange={e => update({ showBadge: e.target.checked })} className="rounded" />
          <span className="text-xs text-foreground">Show Open / Closed badge</span>
        </label>

        <div className="space-y-1.5">
          <div className="grid grid-cols-[100px_1fr_1fr_36px] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-1">
            <span>Day</span><span>Open</span><span>Close</span><span>Off</span>
          </div>
          {c.hours.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[100px_1fr_1fr_36px] gap-2 items-center">
              <span className={`text-xs font-medium ${row.day === todayName ? "text-primary font-bold" : "text-foreground"}`}>{row.day}</span>
              <input
                type="text"
                disabled={row.closed}
                className="text-xs border border-border bg-background text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                placeholder="8:00 AM"
                value={row.open}
                onChange={e => updateDay(idx, { open: e.target.value })}
              />
              <input
                type="text"
                disabled={row.closed}
                className="text-xs border border-border bg-background text-foreground rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                placeholder="5:00 PM"
                value={row.close}
                onChange={e => updateDay(idx, { close: e.target.value })}
              />
              <label className="flex items-center justify-center cursor-pointer" title={row.closed ? "Closed" : "Open"}>
                <input
                  type="checkbox"
                  checked={row.closed}
                  onChange={e => updateDay(idx, { closed: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary"
                />
              </label>
            </div>
          ))}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
