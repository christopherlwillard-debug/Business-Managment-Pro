import { ExternalLink, Building2, MapPin, Calendar, DollarSign, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BidOpportunity } from "./types";

interface AwardMeta {
  amount: number | null;
  recipientName: string | null;
  state: string | null;
}

function parseAwardMeta(description: string | null): AwardMeta {
  if (!description) return { amount: null, recipientName: null, state: null };
  try {
    const parsed = JSON.parse(description);
    return {
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      recipientName: typeof parsed.recipientName === "string" ? parsed.recipientName : null,
      state: typeof parsed.state === "string" ? parsed.state : null,
    };
  } catch {
    return { amount: null, recipientName: null, state: null };
  }
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

interface Props {
  award: BidOpportunity;
  profileNaicsCodes?: string[];
}

export default function AwardCard({ award, profileNaicsCodes }: Props) {
  const meta = parseAwardMeta(award.description);
  const recipientName = meta.recipientName ?? award.title;
  const isMatch =
    profileNaicsCodes && award.naicsCode
      ? profileNaicsCodes.includes(award.naicsCode)
      : false;

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-border/80 transition-colors">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
          Market intelligence · Awarded
        </span>
        {isMatch && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Similar to your work
          </span>
        )}
      </div>

      <div>
        <p className="font-semibold text-foreground leading-snug">{recipientName}</p>
        {award.agency && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Building2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{award.agency}</span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
          {formatCurrency(meta.amount)}
        </span>

        {meta.state && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            {meta.state}
          </span>
        )}

        {award.postedDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {award.postedDate}
          </span>
        )}

        {award.naicsCode && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Tag className="w-3 h-3" />
            NAICS {award.naicsCode}
          </span>
        )}
      </div>

      <div className={cn("pt-2 border-t border-border/50", "flex items-center justify-between")}>
        <span className="text-xs text-muted-foreground italic">Read-only — awarded contract</span>
        {award.url && (
          <a
            href={award.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            USASpending
          </a>
        )}
      </div>
    </div>
  );
}
