import React, { useState } from "react";
import { ImagePlus, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { BlockStyleWrapper, type BlockStyle } from "./BlockStyleWrapper";
import { AiCopyPopover } from "./AiCopyPopover";
import { TextStyleToolbar, textStyleToCSS, type TextStyle } from "./TextStyleToolbar";
import { InlineEditableText } from "../InlineEditableText";

const SHADOW_CLASSES: Record<string, string> = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
};

interface PhotoSettings {
  borderRadius?: number;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  alt?: string;
  objectFit?: "cover" | "contain";
}

interface AboutContent {
  heading: string;
  body: string;
  photoUrl?: string;
  photoObjectPath?: string;
  headingStyle?: TextStyle;
  bodyStyle?: TextStyle;
  photoSettings?: PhotoSettings;
}

interface AboutSectionProps {
  content: AboutContent;
  settings: { brandColor: string };
  isEditing?: boolean;
  onChange?: (content: AboutContent) => void;
  onPhotoUpload?: (file: File) => Promise<void>;
  isPhotoUploading?: boolean;
  businessName?: string;
  blockStyle?: BlockStyle;
  sectionId?: string;
}

function PhotoSettingsPanel({
  settings: ps = {},
  onChange,
}: {
  settings?: PhotoSettings;
  onChange: (s: PhotoSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  function patch(p: Partial<PhotoSettings>) {
    onChange({ ...ps, ...p });
  }
  const shadows = ["none", "sm", "md", "lg", "xl"] as const;
  return (
    <div className="mt-1.5 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <span>Photo Settings</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div>
            <label className="text-[10px] text-gray-500 block mt-2 mb-1">Border radius: {ps.borderRadius ?? 12}px</label>
            <input
              type="range"
              min={0}
              max={50}
              value={ps.borderRadius ?? 12}
              onChange={e => patch({ borderRadius: parseInt(e.target.value) })}
              className="w-full h-1.5 accent-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Shadow</label>
            <div className="flex gap-1">
              {shadows.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch({ shadow: s })}
                  className={`flex-1 text-[9px] py-1 rounded border transition-colors capitalize ${
                    (ps.shadow ?? "md") === s
                      ? "bg-blue-500 border-blue-500 text-white"
                      : "border-gray-200 dark:border-gray-600 text-gray-500 hover:border-blue-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Object fit</label>
            <div className="flex gap-1">
              {(["cover", "contain"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => patch({ objectFit: f })}
                  className={`flex-1 text-[10px] py-1 rounded border transition-colors capitalize ${
                    (ps.objectFit ?? "cover") === f
                      ? "bg-blue-500 border-blue-500 text-white"
                      : "border-gray-200 dark:border-gray-600 text-gray-500 hover:border-blue-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Alt text</label>
            <input
              value={ps.alt ?? ""}
              onChange={e => patch({ alt: e.target.value || undefined })}
              placeholder="Describe the photo…"
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 outline-none focus:border-blue-500 text-gray-700 dark:text-gray-300 placeholder-gray-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function AboutSection({ content, settings, isEditing, onChange, onPhotoUpload, isPhotoUploading, businessName, blockStyle, sectionId }: AboutSectionProps) {
  const biz = businessName ?? "a contractor business";
  const sid = sectionId ?? "about";
  const ps = content.photoSettings ?? {};

  function update(patch: Partial<AboutContent>) {
    onChange?.({ ...content, ...patch });
  }

  const photoStyle: React.CSSProperties = {
    borderRadius: `${ps.borderRadius ?? 12}px`,
    objectFit: ps.objectFit ?? "cover",
  };

  const shadowClass = SHADOW_CLASSES[ps.shadow ?? "md"] ?? "shadow-md";
  const photoAlt = ps.alt || "About";

  return (
    <BlockStyleWrapper
      wrapperClassName="py-16 px-6 bg-gray-50 dark:bg-gray-800"
      blockStyle={blockStyle}
      isEditing={isEditing}
    >
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-10 items-center">
        <div className="flex-1">
          {isEditing ? (
            <>
              <InlineEditableText
                id={`${sid}-heading`}
                as="h2"
                value={content.heading}
                placeholder="Section heading"
                className="text-3xl font-bold mb-1 w-full"
                style={{ color: "var(--theme-text, #111827)", ...textStyleToCSS(content.headingStyle) }}
                onCommit={v => update({ heading: v })}
              />
              <TextStyleToolbar
                dark={false}
                style={content.headingStyle}
                onChange={s => update({ headingStyle: s })}
              />
              <InlineEditableText
                id={`${sid}-body`}
                as="p"
                value={content.body}
                placeholder="Write your About Us paragraph here…"
                className="leading-relaxed mt-2 w-full"
                style={{ color: "var(--theme-text-muted, #4b5563)", ...textStyleToCSS(content.bodyStyle) }}
                onCommit={v => update({ body: v })}
              />
              <TextStyleToolbar
                dark={false}
                style={content.bodyStyle}
                onChange={s => update({ bodyStyle: s })}
              />
              <AiCopyPopover
                label="About body"
                defaultPrompt={`Write a 3-4 sentence About Us paragraph for ${biz}. Use a warm, professional tone. Mention experience, quality, and serving the local community.`}
                onAccept={v => update({ body: v })}
              />
            </>
          ) : (
            <>
              <h2
                data-edit-field="heading"
                className="text-3xl font-bold mb-4"
                style={{ color: "var(--theme-text, #111827)", ...textStyleToCSS(content.headingStyle) }}
              >
                {content.heading}
              </h2>
              <p
                data-edit-field="body"
                className="leading-relaxed"
                style={{ color: "var(--theme-text-muted, #4b5563)", ...textStyleToCSS(content.bodyStyle) }}
              >
                {content.body}
              </p>
            </>
          )}
        </div>

        <div className="w-full md:w-72 flex-shrink-0">
          {content.photoUrl ? (
            <img
              src={content.photoUrl}
              alt={photoAlt}
              className={`w-full h-56 ${shadowClass}`}
              style={photoStyle}
            />
          ) : (
            <div
              className="w-full h-56 rounded-xl flex items-center justify-center text-white/60 text-sm font-medium"
              style={{ backgroundColor: settings.brandColor + "30", border: `2px dashed ${settings.brandColor}40` }}
            >
              {isEditing ? "Photo (optional)" : ""}
            </div>
          )}
          {isEditing && (
            <div className="mt-2 space-y-1.5">
              {onPhotoUpload && (
                <label className={`flex items-center justify-center gap-1.5 w-full text-xs border border-border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted ${isPhotoUploading ? "opacity-60 pointer-events-none" : ""}`}>
                  {isPhotoUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                  {isPhotoUploading ? "Uploading…" : content.photoUrl ? "Replace Photo" : "Upload Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={isPhotoUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ""; }}
                  />
                </label>
              )}
              <input
                className="text-xs text-gray-500 bg-transparent border-b border-gray-200 focus:border-blue-500 outline-none w-full placeholder-gray-400"
                value={content.photoUrl ?? ""}
                placeholder="Or paste a photo URL"
                onChange={e => update({ photoUrl: e.target.value, photoObjectPath: undefined })}
              />
              <PhotoSettingsPanel
                settings={content.photoSettings}
                onChange={s => update({ photoSettings: s })}
              />
            </div>
          )}
        </div>
      </div>
    </BlockStyleWrapper>
  );
}
