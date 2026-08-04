/**
 * Phase 5 M5 – Image Picker Modal
 *
 * Modal wrapper shown when the user clicks "Replace Image" in Website Studio.
 * Adds a "✨ Suggested" tab to the existing "My Library" tab.
 *
 * Tabs:
 *   ✨ Suggested  — own uploaded photos first, then curated industry picks
 *   My Library   — existing MediaLibrary component (upload + browse)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Sparkles, Images, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { MediaLibrary } from "./MediaLibrary";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface SuggestedImage {
  id:               string;
  url:              string;
  thumbUrl:         string;
  attribution:      string;
  attributionUrl:   string;
  category:         string;
  alt:              string;
}

interface OwnPhoto {
  id:          number;
  url:         string;
  displayName: string | null;
  filename:    string;
}

interface SuggestResponse {
  ownPhotos:   OwnPhoto[];
  suggestions: SuggestedImage[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ImageGrid({
  images,
  onSelect,
}: {
  images: Array<{ url: string; thumbUrl: string; label: string; sublabel?: string; attributionUrl?: string }>;
  onSelect: (url: string) => void;
}) {
  const [errored, setErrored] = useState<Set<string>>(new Set());

  return (
    <div className="grid grid-cols-3 gap-2">
      {images.map((img, i) => {
        if (errored.has(img.thumbUrl)) return null; // skip broken images
        return (
          <button
            key={`${img.url}-${i}`}
            type="button"
            onClick={() => onSelect(img.url)}
            className="group relative rounded-lg overflow-hidden border border-border hover:border-primary hover:shadow-md transition-all aspect-video bg-muted"
            title={img.label}
          >
            <img
              src={img.thumbUrl}
              alt={img.label}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={() => setErrored(prev => new Set(prev).add(img.thumbUrl))}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-[10px] text-white font-medium leading-tight truncate">{img.label}</p>
              {img.sublabel && (
                <p className="text-[9px] text-white/70 leading-tight truncate">{img.sublabel}</p>
              )}
            </div>
            {img.attributionUrl && (
              <a
                href={img.attributionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded bg-black/50 hover:bg-black/70"
                onClick={e => e.stopPropagation()}
                title="View on Unsplash"
              >
                <ExternalLink className="w-2.5 h-2.5 text-white" />
              </a>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Suggested tab ─────────────────────────────────────────────────────────────

function SuggestedTab({
  businessId,
  businessType,
  sectionType,
  onSelect,
}: {
  businessId:   number;
  businessType: string;
  sectionType:  string;
  onSelect:     (url: string) => void;
}) {
  const params = new URLSearchParams({
    businessType: businessType || "general-contractor",
    sectionType:  sectionType  || "image",
    businessId:   String(businessId),
  });

  const { data, isLoading, isError } = useQuery<SuggestResponse>({
    queryKey: ["suggest-images", businessType, sectionType, businessId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/website/suggest-images?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load suggestions");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <p className="text-sm">Finding great photos…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <p className="text-sm">Couldn't load suggestions. Try My Library.</p>
      </div>
    );
  }

  const ownPhotos   = data?.ownPhotos   ?? [];
  const suggestions = data?.suggestions ?? [];
  const hasOwn      = ownPhotos.length > 0;
  const hasSuggested = suggestions.length > 0;

  if (!hasOwn && !hasSuggested) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <Sparkles className="w-5 h-5" />
        <p className="text-sm text-center">No suggestions for this section type yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Own uploaded photos — always show first */}
      {hasOwn && (
        <div>
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Images className="w-3.5 h-3.5 text-primary" />
            Your Photos
          </p>
          <ImageGrid
            images={ownPhotos.map(p => ({
              url:      p.url,
              thumbUrl: p.url,
              label:    p.displayName || p.filename,
            }))}
            onSelect={onSelect}
          />
        </div>
      )}

      {/* Curated suggestions */}
      {hasSuggested && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              Suggested for Your Industry
            </p>
            <span className="text-[10px] text-muted-foreground">
              Photos via{" "}
              <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                Unsplash
              </a>
            </span>
          </div>
          <ImageGrid
            images={suggestions.map(s => ({
              url:            s.url,
              thumbUrl:       s.thumbUrl,
              label:          s.category,
              sublabel:       `Photo by ${s.attribution}`,
              attributionUrl: s.attributionUrl,
            }))}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface ImagePickerModalProps {
  businessId:    number;
  businessType?: string;
  sectionType?:  string;
  onSelect:      (url: string) => void;
  onClose:       () => void;
}

type Tab = "suggested" | "library";

export function ImagePickerModal({
  businessId,
  businessType = "",
  sectionType  = "",
  onSelect,
  onClose,
}: ImagePickerModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("suggested");

  function handleSelect(url: string) {
    onSelect(url);
    onClose();
  }

  const tabs: Array<{ id: Tab; label: string; Icon: React.ElementType }> = [
    { id: "suggested", label: "✨ Suggested",  Icon: Sparkles },
    { id: "library",   label: "My Library",    Icon: Images   },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl h-[70vh] flex flex-col overflow-hidden border border-border">

        {/* Modal header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <p className="font-semibold text-foreground text-sm flex-1">Replace Image</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-border flex-shrink-0 px-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "suggested" ? (
            <div className="h-full overflow-y-auto p-4">
              <SuggestedTab
                businessId={businessId}
                businessType={businessType}
                sectionType={sectionType}
                onSelect={handleSelect}
              />
            </div>
          ) : (
            // My Library tab — existing MediaLibrary in select mode
            <MediaLibrary
              businessId={businessId}
              mode="select"
              onSelect={handleSelect}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
