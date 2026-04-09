import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, MailOpen, User, Phone, MessageSquare, Briefcase, Clock, Trash2 } from "lucide-react";

interface Inquiry {
  id: number;
  name: string;
  phone: string | null;
  bestContactMethod: string | null;
  service: string | null;
  message: string | null;
  read: boolean;
  createdAt: string;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${base}/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Inquiries() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [selected, setSelected] = useState<Inquiry | null>(null);

  const { data: inquiries = [], isLoading } = useQuery<Inquiry[]>({
    queryKey: ["/api/inquiries"],
    queryFn: () => apiFetch("/inquiries"),
    refetchInterval: 30000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/inquiries/${id}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/inquiries"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/inquiries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/inquiries"] });
      setSelected(null);
    },
  });

  function openInquiry(inq: Inquiry) {
    setSelected(inq);
    if (!inq.read) markReadMut.mutate(inq.id);
  }

  const filtered = inquiries.filter(i => {
    if (filter === "unread") return !i.read;
    if (filter === "read") return i.read;
    return true;
  });

  const unreadCount = inquiries.filter(i => !i.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" /> Website Inquiries
            {unreadCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full">
                {unreadCount} new
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contact form submissions from your public website.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "unread", "read"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f} {f === "unread" && unreadCount > 0 ? `(${unreadCount})` : ""}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No inquiries yet</p>
          <p className="text-sm">When someone fills out your contact form, they'll appear here.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-4">
          {/* List */}
          <div className="lg:col-span-2 space-y-2">
            {filtered.map(inq => (
              <div
                key={inq.id}
                onClick={() => openInquiry(inq)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selected?.id === inq.id
                    ? "bg-primary/10 border-primary/40"
                    : "bg-card border-border hover:border-primary/30 hover:bg-card/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {inq.read ? (
                      <MailOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                    <span className={`font-semibold text-sm ${!inq.read ? "text-foreground" : "text-muted-foreground"}`}>
                      {inq.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatDate(inq.createdAt)}
                  </span>
                </div>
                {inq.service && (
                  <div className="mt-1 ml-6">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      {inq.service}
                    </span>
                  </div>
                )}
                {inq.message && (
                  <p className="mt-1.5 ml-6 text-xs text-muted-foreground line-clamp-2">{inq.message}</p>
                )}
              </div>
            ))}
          </div>

          {/* Detail */}
          <div className="lg:col-span-3">
            {selected ? (
              <div className="bg-card border border-border rounded-2xl p-6 space-y-5 sticky top-0">
                <div className="flex items-start justify-between">
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <div className="flex items-center gap-2">
                    {!selected.read && (
                      <button
                        onClick={() => markReadMut.mutate(selected.id)}
                        className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors"
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm("Delete this inquiry?")) deleteMut.mutate(selected.id);
                      }}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selected.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{selected.phone}</span>
                    </div>
                  )}
                  {selected.bestContactMethod && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>{selected.bestContactMethod}</span>
                    </div>
                  )}
                  {selected.service && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <span>{selected.service}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{formatDate(selected.createdAt)}</span>
                  </div>
                </div>

                {selected.message && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Message</span>
                    </div>
                    <div className="bg-muted/50 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
                      {selected.message}
                    </div>
                  </div>
                )}

                {selected.phone && (
                  <div className="pt-2 border-t border-border flex gap-3">
                    <a
                      href={`tel:${selected.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Phone className="w-4 h-4" /> Call
                    </a>
                    <a
                      href={`sms:${selected.phone}`}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" /> Text
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-16">
                Select an inquiry to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
