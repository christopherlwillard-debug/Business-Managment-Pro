import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, CheckCircle2, Minus, Square, AlertCircle, HardHat } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type StatusSummary = {
  jobTitle: string;
  statusOverride: string | null;
  overallPercent: number;
};

type StatusItem = {
  id: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  skipped: boolean;
  notes: string | null;
  sortOrder: number;
};

type StatusSection = {
  id: number;
  name: string;
  notes: string | null;
  totalItems: number;
  completedItems: number;
  percentComplete: number;
  items: StatusItem[];
};

type StatusData = {
  jobTitle: string;
  location: string | null;
  dealerName: string | null;
  customerName: string | null;
  templateName: string;
  statusOverride: string | null;
  publicNotes: string | null;
  updatedAt: string;
  overallPercent: number;
  totalItems: number;
  completedItems: number;
  sections: StatusSection[];
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function StatusLabel({ pct, override }: { pct: number; override: string | null }) {
  if (override) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold">
        <AlertCircle className="w-4 h-4" />
        {override}
      </span>
    );
  }
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold">
        <Square className="w-3.5 h-3.5" />
        Not Started
      </span>
    );
  }
  if (pct === 100) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold">
        <CheckCircle2 className="w-4 h-4" />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-semibold">
      <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-none" style={{ background: "conic-gradient(#2563eb 0% " + pct + "%, transparent " + pct + "%)" }} />
      In Progress
    </span>
  );
}

function SectionCard({ section }: { section: StatusSection }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-800 truncate pr-2">{section.name}</span>
            <span className="text-xs font-bold text-slate-500 flex-shrink-0">
              {section.completedItems}/{section.totalItems}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${section.percentComplete === 100 ? "bg-emerald-500" : "bg-emerald-400"}`}
              style={{ width: `${section.percentComplete}%` }}
            />
          </div>
        </div>
        <div className="flex-shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          {section.notes && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              {section.notes}
            </p>
          )}
          {section.items.map(item => (
            <div key={item.id} className="flex items-start gap-3 py-1">
              {item.skipped ? (
                <Minus className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              ) : item.completed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Square className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-5 ${item.skipped ? "text-slate-400 line-through" : item.completed ? "text-slate-700" : "text-slate-800"}`}>
                  {item.title}
                </p>
                {item.completed && item.completedAt && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                    {formatDate(item.completedAt)}
                  </p>
                )}
                {item.skipped && (
                  <p className="text-[11px] text-slate-400 mt-0.5">Not Applicable</p>
                )}
                {item.notes && (
                  <p className="text-[11px] text-slate-500 italic mt-0.5">{item.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionsSkeleton() {
  return (
    <div className="px-4 py-4 space-y-3 max-w-lg mx-auto pb-8 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 bg-slate-200 rounded-full" style={{ width: `${45 + i * 10}%` }} />
            <div className="h-4 w-8 bg-slate-100 rounded-full" />
          </div>
          <div className="h-1.5 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export default function JobStatusPage() {
  const { token } = useParams<{ token: string }>();

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<StatusSummary>({
    queryKey: ["public-status-summary", token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/public/status/${token}/summary`);
      if (res.status === 404) throw new Error("not-found");
      if (res.status === 410) throw new Error("disabled");
      if (!res.ok) throw new Error("error");
      return res.json();
    },
    retry: false,
    staleTime: 30_000,
  });

  const { data, isLoading: detailLoading } = useQuery<StatusData>({
    queryKey: ["public-status", token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/public/status/${token}`);
      if (res.status === 404) throw new Error("not-found");
      if (res.status === 410) throw new Error("disabled");
      if (!res.ok) throw new Error("error");
      return res.json();
    },
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (summaryLoading) {
    return (
      <div className="min-h-screen bg-slate-50 animate-pulse">
        <div className="bg-white border-b border-slate-200 px-4 pt-6 pb-5">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-slate-200" />
              <div className="h-4 w-40 bg-slate-200 rounded-full" />
            </div>
            <div className="h-6 w-3/4 bg-slate-200 rounded-full mb-2" />
            <div className="h-4 w-1/2 bg-slate-100 rounded-full mb-3" />
            <div className="h-7 w-28 bg-slate-200 rounded-full" />
          </div>
        </div>
        <div className="bg-white border-b border-slate-100 px-4 py-4">
          <div className="max-w-lg mx-auto">
            <div className="flex justify-between items-end mb-2">
              <div className="h-4 w-32 bg-slate-200 rounded-full" />
              <div className="h-5 w-10 bg-slate-200 rounded-full" />
            </div>
            <div className="h-3 rounded-full bg-slate-200" />
            <div className="h-3 w-32 bg-slate-100 rounded-full mt-1.5 ml-auto" />
          </div>
        </div>
        <SectionsSkeleton />
      </div>
    );
  }

  if (summaryError) {
    const msg = summaryError instanceof Error ? summaryError.message : "error";
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 gap-4">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
            <HardHat className="w-6 h-6 text-slate-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">
            {msg === "disabled" ? "Link Not Available" : "Status Page Not Found"}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            {msg === "disabled"
              ? "This progress link has been turned off. Contact the contractor for an update."
              : "This link doesn't exist or may have expired. Check the URL and try again."}
          </p>
        </div>
        <p className="text-xs text-slate-400">Willard's General Contracting</p>
      </div>
    );
  }

  if (!summary) return null;

  const pct = data?.overallPercent ?? summary.overallPercent;
  const override = data?.statusOverride ?? summary.statusOverride;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header — renders as soon as summary resolves */}
      <div className="bg-white border-b border-slate-200 px-4 pt-6 pb-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <HardHat className="w-4 h-4 text-amber-600" />
            </div>
            <span className="text-sm font-semibold text-slate-600">Willard's General Contracting</span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 leading-tight mb-1">{summary.jobTitle}</h1>

          <div className="space-y-0.5 mb-3">
            {data?.dealerName && (
              <p className="text-sm text-slate-600">Dealer: <span className="font-medium text-slate-700">{data.dealerName}</span></p>
            )}
            {data?.location && (
              <p className="text-sm text-slate-500">{data.location}</p>
            )}
            {data?.customerName && (
              <p className="text-sm text-slate-500">Customer: <span className="font-medium text-slate-700">{data.customerName}</span></p>
            )}
          </div>

          <StatusLabel pct={pct} override={override} />
        </div>
      </div>

      {/* Progress bar — renders with summary */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-between items-end mb-2">
            {data ? (
              <span className="text-sm font-medium text-slate-600">{data.templateName}</span>
            ) : (
              <div className="h-4 w-32 bg-slate-200 rounded-full animate-pulse" />
            )}
            <span className={`text-lg font-bold ${pct === 100 ? "text-emerald-600" : "text-slate-800"}`}>
              {pct}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? "bg-emerald-500" : "bg-emerald-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {data ? (
            <p className="text-xs text-slate-400 mt-1.5 text-right">
              {data.completedItems} of {data.totalItems} items complete
            </p>
          ) : (
            <div className="h-3 w-32 bg-slate-100 rounded-full mt-1.5 ml-auto animate-pulse" />
          )}
        </div>
      </div>

      {/* Public notes — only available once full data loads */}
      {data?.publicNotes && (
        <div className="px-4 pt-4">
          <div className="max-w-lg mx-auto">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Note from Contractor</p>
              <p className="text-sm text-amber-900 leading-relaxed">{data.publicNotes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sections — skeleton until full data resolves */}
      {detailLoading || !data ? (
        <SectionsSkeleton />
      ) : (
        <div className="px-4 py-4 space-y-3 max-w-lg mx-auto pb-8">
          {data.sections.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No checklist sections available.</p>
          ) : (
            data.sections.map(section => (
              <SectionCard key={section.id} section={section} />
            ))
          )}
        </div>
      )}

      {/* Footer */}
      {data && (
        <div className="max-w-lg mx-auto px-4 pb-8 text-center">
          <p className="text-xs text-slate-400">
            Last updated {formatDateTime(data.updatedAt)}
          </p>
          <p className="text-xs text-slate-300 mt-1">Willard's General Contracting</p>
        </div>
      )}
    </div>
  );
}
