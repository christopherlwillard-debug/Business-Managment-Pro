/**
 * M16 – AI Marketing Assistant Panel
 * Slide-in right panel for generating branded marketing content:
 * social posts, emails, blog posts, and print materials.
 */
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, Megaphone, Sparkles, Loader2, Copy, Check, Download,
  ChevronRight, Clock, RefreshCw, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  MARKETING_CONTENT_TYPES, CONTENT_TYPE_MAP, CATEGORY_ORDER,
  type MarketingContentType, type ContentCategory,
} from "./marketingContentTypes";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── API helpers ───────────────────────────────────────────────────────────────

async function generateMarketing(params: {
  businessId: number;
  type: MarketingContentType;
  promoHint?: string;
}): Promise<{ id: number; type: string; content: string; createdAt: string }> {
  const res = await fetch(`${BASE}/api/website/generate-marketing?businessId=${params.businessId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ type: params.type, promoHint: params.promoHint }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchMarketingHistory(businessId: number): Promise<{
  items: Array<{ id: number; type: string; promoHint: string | null; content: string; createdAt: string }>;
}> {
  const res = await fetch(`${BASE}/api/website/marketing-history?businessId=${businessId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load history");
  return res.json();
}

async function downloadMarketingPdf(params: {
  businessId: number;
  type: MarketingContentType;
  content: string;
}): Promise<Blob> {
  const res = await fetch(`${BASE}/api/website/marketing-pdf?businessId=${params.businessId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ type: params.type, content: params.content }),
  });
  if (!res.ok) throw new Error("Failed to generate PDF");
  return res.blob();
}

// ── Content preview components ────────────────────────────────────────────────

function FacebookMockup({
  content,
  businessName,
  logoUrl,
  brandColor,
}: {
  content: string;
  businessName: string;
  logoUrl?: string;
  brandColor: string;
}) {
  const initials = businessName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-xl border border-[#cfd9de] bg-white shadow-sm overflow-hidden text-[13px] font-['-apple-system','Segoe_UI',sans-serif]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        {logoUrl ? (
          <img src={logoUrl} alt={businessName} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
               style={{ backgroundColor: brandColor }}>
            {initials}
          </div>
        )}
        <div>
          <p className="font-semibold text-[#1c1e21] text-[13px] leading-tight">{businessName}</p>
          <p className="text-[#65676b] text-[11px]">Just now · 🌐</p>
        </div>
      </div>
      {/* Post text */}
      <div className="px-3 pb-2.5">
        <p className="text-[#1c1e21] whitespace-pre-wrap leading-[1.55]">{content}</p>
      </div>
      {/* Divider + actions */}
      <div className="border-t border-[#cfd9de] mx-3" />
      <div className="flex text-[#65676b] text-[12px] font-semibold">
        {["👍 Like", "💬 Comment", "↗ Share"].map(a => (
          <button key={a} className="flex-1 py-2 hover:bg-[#f0f2f5] transition-colors text-center">{a}</button>
        ))}
      </div>
    </div>
  );
}

function GoogleMockup({
  content,
  businessName,
  brandColor,
}: {
  content: string;
  businessName: string;
  brandColor: string;
}) {
  const initials = businessName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header bar */}
      <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
             style={{ backgroundColor: brandColor }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{businessName}</p>
          <p className="text-[10px] text-muted-foreground">Google Business · Update</p>
        </div>
        <span className="text-[10px] text-muted-foreground">Now</span>
      </div>
      {/* Post body */}
      <div className="px-3 py-3">
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{content}</p>
      </div>
      {/* CTA row */}
      <div className="px-3 pb-3">
        <button className="text-xs font-semibold px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors">
          Learn more
        </button>
      </div>
    </div>
  );
}

function EmailMockup({ content }: { content: string }) {
  const lines = content.split("\n");
  const subjectLine = lines.find(l => l.toLowerCase().startsWith("subject:"));
  const body = subjectLine
    ? lines.slice(lines.indexOf(subjectLine) + 1).join("\n").trim()
    : content;
  const subject = subjectLine?.replace(/^subject:\s*/i, "").trim() ?? "";

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden text-[13px]">
      {/* Email header */}
      <div className="bg-muted/40 px-3 py-2 border-b border-border space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-12 shrink-0">From:</span>
          <span className="text-[11px] text-foreground font-medium">Your Business Name &lt;hello@yourbusiness.com&gt;</span>
        </div>
        {subject && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0">Subject:</span>
            <span className="text-[11px] font-semibold text-foreground">{subject}</span>
          </div>
        )}
      </div>
      {/* Email body */}
      <div className="px-4 py-3">
        <p className="text-foreground whitespace-pre-wrap leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function ArticleMockup({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-4">
        <div className="prose prose-sm max-w-none text-foreground">
          {content.split("\n").map((line, i) => {
            if (line.startsWith("## ")) {
              return <h3 key={i} className="font-bold text-base mt-4 mb-1 text-foreground">{line.slice(3)}</h3>;
            }
            if (line.startsWith("# ")) {
              return <h2 key={i} className="font-bold text-lg mb-2 text-foreground">{line.slice(2)}</h2>;
            }
            if (!line.trim()) {
              return <br key={i} />;
            }
            return <p key={i} className="text-sm leading-relaxed text-foreground mb-1">{line}</p>;
          })}
        </div>
      </div>
    </div>
  );
}

function PrintMockup({
  content,
  type,
  brandColor,
  businessName,
}: {
  content: string;
  type: MarketingContentType;
  brandColor: string;
  businessName: string;
}) {
  const isBizCard = type === "business-card";
  const isDoorHanger = type === "door-hanger";

  const lines = content.split("\n").filter(Boolean);
  const headline = lines[0] ?? businessName;
  const bodyLines = lines.slice(1);

  const containerCls = isBizCard
    ? "rounded-xl border border-border overflow-hidden bg-white" // 3.5:2 ratio
    : isDoorHanger
    ? "rounded-xl border border-border overflow-hidden bg-white mx-auto" // narrow
    : "rounded-xl border border-border overflow-hidden bg-white"; // flyer

  return (
    <div className={containerCls} style={{ maxWidth: isDoorHanger ? "220px" : "100%" }}>
      {/* Branded header */}
      <div className="px-4 py-3" style={{ backgroundColor: brandColor }}>
        <p className={cn(
          "font-black text-white leading-tight",
          isBizCard ? "text-base" : isDoorHanger ? "text-sm" : "text-xl",
        )}>
          {headline}
        </p>
      </div>
      {/* Body */}
      <div className={cn("px-4", isBizCard ? "py-2" : "py-3")}>
        {bodyLines.map((line, i) => {
          if (line.startsWith("• ") || line.startsWith("- ")) {
            return (
              <p key={i} className="text-[11px] text-gray-700 flex items-start gap-1 mb-0.5">
                <span className="text-gray-400 mt-px">•</span>
                <span>{line.slice(2)}</span>
              </p>
            );
          }
          if (line.trim().startsWith("📞") || line.trim().startsWith("🌐") || line.trim().startsWith("📧")) {
            return (
              <p key={i} className="text-[11px] text-gray-600 mt-1">{line}</p>
            );
          }
          if (line.toUpperCase() === line && line.length > 3) {
            return (
              <p key={i} className="text-[11px] font-bold text-gray-900 mt-2 mb-0.5">{line}</p>
            );
          }
          return (
            <p key={i} className="text-[11px] text-gray-600 leading-snug">{line}</p>
          );
        })}
      </div>
      {/* Footer stripe */}
      <div className="h-1" style={{ backgroundColor: brandColor, opacity: 0.4 }} />
    </div>
  );
}

// ── History item ──────────────────────────────────────────────────────────────

function HistoryItem({
  item,
  onSelect,
}: {
  item: { id: number; type: string; promoHint: string | null; content: string; createdAt: string };
  onSelect: () => void;
}) {
  const cfg = CONTENT_TYPE_MAP[item.type as MarketingContentType];
  const label = cfg?.label ?? item.type;
  const emoji = cfg?.emoji ?? "📄";
  const date = new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const preview = item.content.slice(0, 80).replace(/\n/g, " ") + (item.content.length > 80 ? "…" : "");

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left px-3 py-2.5 rounded-xl border border-border hover:bg-muted/40 transition-colors flex items-start gap-2"
    >
      <span className="text-base flex-shrink-0 mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{date}</span>
        </div>
        {item.promoHint && (
          <p className="text-[10px] text-muted-foreground/70 truncate italic mb-0.5">"{item.promoHint}"</p>
        )}
        <p className="text-[11px] text-muted-foreground leading-snug truncate">{preview}</p>
      </div>
      <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0 mt-1" />
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface MarketingPanelProps {
  show: boolean;
  onClose: () => void;
  businessId: number;
  businessName: string;
  brandColor: string;
  logoUrl?: string;
}

type PanelTab = "generate" | "history";

export function MarketingPanel({
  show,
  onClose,
  businessId,
  businessName,
  brandColor,
  logoUrl,
}: MarketingPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<PanelTab>("generate");
  const [selectedType, setSelectedType] = useState<MarketingContentType>("facebook-post");
  const [promoHint, setPromoHint] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [editableContent, setEditableContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const selectedCfg = CONTENT_TYPE_MAP[selectedType];

  // ── History ────────────────────────────────────────────────────────────────
  const historyQuery = useQuery({
    queryKey: ["marketing-history", businessId],
    queryFn: () => fetchMarketingHistory(businessId),
    enabled: show,
    staleTime: 30_000,
  });

  // ── Generate mutation ──────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: () => generateMarketing({ businessId, type: selectedType, promoHint: promoHint.trim() || undefined }),
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      setEditableContent(data.content);
      queryClient.invalidateQueries({ queryKey: ["marketing-history", businessId] });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  // ── PDF download ──────────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const blob = await downloadMarketingPdf({ businessId, type: selectedType, content: editableContent });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedCfg.label.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "PDF generation failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Copy ──────────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(editableContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied!", description: "Content copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Please select and copy the text manually.", variant: "destructive" });
    }
  }

  if (!show) return null;

  const hasContent = editableContent.length > 0;
  const isLoading = generateMutation.isPending;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />

      <div
        className="fixed top-0 right-0 z-[401] w-full max-w-[480px] h-full bg-card border-l border-border shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="AI Marketing Assistant"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <Megaphone className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">AI Marketing Assistant</h2>
            <p className="text-[11px] text-muted-foreground">Generate branded content in seconds</p>
          </div>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tabs */}
        <div className="flex-shrink-0 flex border-b border-border">
          {(["generate", "history"] as PanelTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 text-xs font-semibold transition-colors border-b-2",
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "generate" ? (
                <span className="flex items-center justify-center gap-1.5"><Sparkles className="w-3 h-3" />Generate</span>
              ) : (
                <span className="flex items-center justify-center gap-1.5"><Clock className="w-3 h-3" />History</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Generate tab */}
        {tab === "generate" && (
          <div className="flex-1 overflow-y-auto">
            {/* Content type picker */}
            <div className="px-4 pt-4 pb-3 border-b border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Content Type</p>
              <div className="space-y-3">
                {CATEGORY_ORDER.map(cat => {
                  const types = MARKETING_CONTENT_TYPES.filter(t => t.category === cat);
                  return (
                    <div key={cat}>
                      <p className="text-[10px] font-medium text-muted-foreground/70 mb-1.5">{cat}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {types.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => { setSelectedType(t.id); setGeneratedContent(""); setEditableContent(""); }}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors",
                              selectedType === t.id
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border text-foreground hover:bg-muted/50",
                            )}
                          >
                            <span className="text-base leading-none">{t.emoji}</span>
                            <span className="text-[11px] font-medium leading-tight">{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Promo hint */}
            <div className="px-4 pt-3 pb-3 border-b border-border/50">
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Promo Idea <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={promoHint}
                onChange={e => setPromoHint(e.target.value)}
                placeholder={selectedCfg.placeholderHint}
                className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={e => { if (e.key === "Enter") generateMutation.mutate(); }}
              />
            </div>

            {/* Generate button */}
            <div className="px-4 pt-3 pb-4 border-b border-border/50">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => generateMutation.mutate()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                style={{ backgroundColor: brandColor, color: "#fff" }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate {selectedCfg.label}</span>
                  </>
                )}
              </button>
            </div>

            {/* Preview + edit area */}
            {hasContent && (
              <div className="px-4 pt-4 pb-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</p>

                {/* Type-specific mockup */}
                <div>
                  {selectedCfg.previewStyle === "social-facebook" && (
                    <FacebookMockup content={editableContent} businessName={businessName} logoUrl={logoUrl} brandColor={brandColor} />
                  )}
                  {selectedCfg.previewStyle === "social-google" && (
                    <GoogleMockup content={editableContent} businessName={businessName} brandColor={brandColor} />
                  )}
                  {selectedCfg.previewStyle === "email" && (
                    <EmailMockup content={editableContent} />
                  )}
                  {selectedCfg.previewStyle === "article" && (
                    <ArticleMockup content={editableContent} />
                  )}
                  {selectedCfg.previewStyle === "print" && (
                    <PrintMockup content={editableContent} type={selectedType} brandColor={brandColor} businessName={businessName} />
                  )}
                </div>

                {/* Editable textarea */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Edit before using
                  </p>
                  <textarea
                    ref={contentRef}
                    value={editableContent}
                    onChange={e => setEditableContent(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  {selectedCfg.printable && (
                    <button
                      type="button"
                      disabled={pdfLoading}
                      onClick={handleDownloadPdf}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {pdfLoading ? "Generating…" : "Download PDF"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => generateMutation.mutate()}
                    disabled={isLoading}
                    title="Regenerate"
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {!hasContent && !isLoading && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">Ready to generate</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Pick a content type above, add an optional promo idea, then hit Generate. Your business context is pre-loaded automatically.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History tab */}
        {tab === "history" && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {historyQuery.isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {historyQuery.data?.items?.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <FileText className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No generations yet</p>
                <button type="button" onClick={() => setTab("generate")}
                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                  Generate your first piece →
                </button>
              </div>
            )}
            {historyQuery.data?.items?.map(item => (
              <HistoryItem
                key={item.id}
                item={item}
                onSelect={() => {
                  setSelectedType(item.type as MarketingContentType);
                  setGeneratedContent(item.content);
                  setEditableContent(item.content);
                  setTab("generate");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
