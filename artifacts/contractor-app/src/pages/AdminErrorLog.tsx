import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug, ChevronDown, ChevronRight, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ErrorGroup {
  message: string;
  location: string | null;
  stack: string | null;
  componentStack: string | null;
  firstSeen: string;
  lastSeen: string;
  count: number;
  ids: number[];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function ErrorRow({ group }: { group: ErrorGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate max-w-xl">{group.message}</span>
            <Badge variant={group.count >= 5 ? "destructive" : "secondary"} className="shrink-0">
              {group.count}×
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex gap-4 flex-wrap">
            {group.location && <span>📍 {group.location}</span>}
            <span>Last seen: {formatDate(group.lastSeen)}</span>
            {group.count > 1 && <span>First seen: {formatDate(group.firstSeen)}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/30 p-4 space-y-3">
          {group.stack && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Stack Trace</p>
              <pre className="text-xs bg-background border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {group.stack}
              </pre>
            </div>
          )}
          {group.componentStack && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Component Stack</p>
              <pre className="text-xs bg-background border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {group.componentStack}
              </pre>
            </div>
          )}
          {!group.stack && !group.componentStack && (
            <p className="text-xs text-muted-foreground">No stack trace available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminErrorLog() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ErrorGroup[]>({
    queryKey: ["admin-errors"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/admin/errors`);
      if (!res.ok) throw new Error("Failed to load errors");
      return res.json();
    },
  });

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bug className="h-6 w-6 text-destructive" />
          <h1 className="text-2xl font-bold">Error Log</h1>
          {data && (
            <Badge variant="outline" className="ml-1">
              {data.reduce((s, g) => s + g.count, 0)} total · {data.length} unique
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Loading errors…
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex items-center gap-2 py-8 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load error log. Make sure you are signed in as the owner.</span>
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Bug className="h-8 w-8 opacity-30" />
            <p>No errors recorded in the last 30 days.</p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground font-normal">
              Sorted by frequency (highest first) · last 30 days · most recent 200 entries
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.map((group, i) => (
              <ErrorRow key={i} group={group} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
