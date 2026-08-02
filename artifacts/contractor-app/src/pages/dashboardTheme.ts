/**
 * dashboardTheme — shared design constants for the V2 Business Command Center.
 * No logic here — only visual constants.
 */

export const dashboardTheme = {
  card: "rounded-2xl border border-border bg-card shadow-sm",
  cardPadding: "p-4 sm:p-5",
  sectionGap: "space-y-6",
  sectionTitleSize: "text-base font-display font-bold text-foreground",
  labelSize: "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
  valueSize: "text-lg font-bold",
  badgeSmall: "text-[10px] font-bold px-2 py-0.5 rounded-full",
  iconSm: "w-3.5 h-3.5",
  iconMd: "w-4 h-4",
  iconLg: "w-5 h-5",
  iconBg: (color: string) => `p-2 rounded-xl ${color}`,
  rowDivider: "border-t border-border/40",
  mutedRow: "bg-muted/20",
} as const;
