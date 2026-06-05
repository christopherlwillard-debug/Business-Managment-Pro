import { useState } from "react";
import { Loader2, Upload, Images } from "lucide-react";
import type {
  SiteComponent, HeadingProps, ParagraphProps, ButtonCompProps, ImageCompProps,
  DividerCompProps, IconCompProps, VideoCompProps, CardCompProps, TestimonialCompProps,
  FormCompProps, MapCompProps,
} from "./sections/ContentSection";
import { ButtonEditor } from "./sections/ButtonEditor";
import { TextStyleToolbar } from "./sections/TextStyleToolbar";

interface ComponentEditorPanelProps {
  component: SiteComponent;
  onChange: (comp: SiteComponent) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onOpenMediaLibrary?: (onSelect: (url: string) => void) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function AlignBtns({ value, onChange }: { value?: string; onChange: (v: "left" | "center" | "right") => void }) {
  return (
    <div className="flex gap-1">
      {(["left", "center", "right"] as const).map(a => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
            (value ?? "left") === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

function textInput(value: string, onChange: (v: string) => void, placeholder?: string) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function textArea(value: string, onChange: (v: string) => void, rows = 4) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

export function ComponentEditorPanel({ component, onChange, onImageUpload, onOpenMediaLibrary }: ComponentEditorPanelProps) {
  const [uploading, setUploading] = useState(false);
  const p = component.props;

  function set(updates: Record<string, unknown>) {
    onChange({ ...component, props: { ...component.props, ...updates } as typeof component.props });
  }

  const LABEL_MAP: Record<string, string> = {
    heading: "Heading", paragraph: "Paragraph", button: "Button", image: "Image",
    divider: "Divider", icon: "Icon", video: "Video", card: "Card",
    testimonial: "Testimonial", form: "Form", map: "Map",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border flex-shrink-0">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Component Editor</p>
        <p className="text-sm font-semibold text-foreground mt-0.5">{LABEL_MAP[component.type] ?? component.type}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">

        {component.type === "heading" && (() => {
          const pp = p as HeadingProps;
          return (
            <>
              <Field label="Text">{textArea(pp.text, v => set({ text: v }), 3)}</Field>
              <Field label="Level">
                <div className="flex gap-1">
                  {([1, 2, 3, 4] as const).map(l => (
                    <button key={l} type="button" onClick={() => set({ level: l })}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${(pp.level ?? 2) === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      H{l}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Alignment"><AlignBtns value={pp.align} onChange={v => set({ align: v })} /></Field>
              <Field label="Style"><TextStyleToolbar style={pp.style} onChange={s => set({ style: s })} /></Field>
            </>
          );
        })()}

        {component.type === "paragraph" && (() => {
          const pp = p as ParagraphProps;
          return (
            <>
              <Field label="Text">{textArea(pp.text, v => set({ text: v }), 6)}</Field>
              <Field label="Alignment"><AlignBtns value={pp.align} onChange={v => set({ align: v })} /></Field>
              <Field label="Style"><TextStyleToolbar style={pp.style} onChange={s => set({ style: s })} /></Field>
            </>
          );
        })()}

        {component.type === "button" && (() => {
          const pp = p as ButtonCompProps;
          return (
            <>
              <Field label="Label">{textInput(pp.label, v => set({ label: v }), "Click Here")}</Field>
              <Field label="Alignment"><AlignBtns value={pp.align} onChange={v => set({ align: v })} /></Field>
              <Field label="Style & Link">
                <ButtonEditor config={pp.config} onChange={cfg => set({ config: cfg })} />
              </Field>
            </>
          );
        })()}

        {component.type === "image" && (() => {
          const pp = p as ImageCompProps;
          return (
            <>
              {pp.url && <img src={pp.url} alt="" className="w-full h-32 object-cover rounded mb-3" />}
              {onImageUpload && (
                <Field label="Upload">
                  <label className={`flex items-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 cursor-pointer hover:bg-muted transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {uploading ? "Uploading…" : pp.url ? "Replace Image" : "Upload Image"}
                    <input type="file" accept="image/*" className="sr-only" disabled={uploading}
                      onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setUploading(true);
                        try { const url = await onImageUpload(f); set({ url }); } finally { setUploading(false); }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Field>
              )}
              {onOpenMediaLibrary && (
                <Field label="Library">
                  <button
                    type="button"
                    onClick={() => onOpenMediaLibrary(url => set({ url }))}
                    className="flex items-center gap-1.5 w-full text-xs border border-border rounded px-2 py-2 cursor-pointer hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Images className="w-3 h-3" />
                    Choose from Library
                  </button>
                </Field>
              )}
              <Field label="Image URL">{textInput(pp.url ?? "", v => set({ url: v }), "https://…")}</Field>
              <Field label="Alt Text">{textInput(pp.alt ?? "", v => set({ alt: v }), "Describe the image…")}</Field>
              <Field label="Caption">{textInput(pp.caption ?? "", v => set({ caption: v }), "Optional caption")}</Field>
              <Field label="Width">
                <div className="flex gap-1 flex-wrap">
                  {(["full", "half", "quarter", "auto"] as const).map(w => (
                    <button key={w} type="button" onClick={() => set({ width: w })}
                      className={`px-2 py-1 rounded text-xs capitalize transition-colors ${(pp.width ?? "full") === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {w}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Object Fit">
                <div className="flex gap-1">
                  {(["cover", "contain"] as const).map(f => (
                    <button key={f} type="button" onClick={() => set({ objectFit: f })}
                      className={`px-2 py-1 rounded text-xs capitalize transition-colors ${(pp.objectFit ?? "cover") === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          );
        })()}

        {component.type === "divider" && (() => {
          const pp = p as DividerCompProps;
          return (
            <>
              <Field label="Color">
                <div className="flex items-center gap-2">
                  <input type="color" value={pp.color ?? "#e5e7eb"} onChange={e => set({ color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent flex-shrink-0" />
                  {textInput(pp.color ?? "", v => set({ color: v }), "#e5e7eb")}
                </div>
              </Field>
              <Field label="Thickness">
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={8} value={pp.thickness ?? 1}
                    onChange={e => set({ thickness: Number(e.target.value) })} className="flex-1 accent-primary" />
                  <span className="text-xs font-mono w-6 text-right tabular-nums">{pp.thickness ?? 1}px</span>
                </div>
              </Field>
              <Field label="Style">
                <div className="flex gap-1">
                  {(["solid", "dashed", "dotted"] as const).map(s => (
                    <button key={s} type="button" onClick={() => set({ borderStyle: s })}
                      className={`px-2 py-1 rounded text-xs capitalize transition-colors ${(pp.borderStyle ?? "solid") === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Vertical Spacing">
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={64} value={pp.marginY ?? 8}
                    onChange={e => set({ marginY: Number(e.target.value) })} className="flex-1 accent-primary" />
                  <span className="text-xs font-mono w-8 text-right tabular-nums">{pp.marginY ?? 8}px</span>
                </div>
              </Field>
            </>
          );
        })()}

        {component.type === "icon" && (() => {
          const pp = p as IconCompProps;
          return (
            <>
              <Field label="Emoji / Symbol">
                <input type="text" value={pp.emoji ?? ""} placeholder="⭐"
                  onChange={e => set({ emoji: e.target.value })}
                  className="w-full text-2xl border border-border rounded px-2 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                <p className="text-[10px] text-muted-foreground mt-1">Type or paste any emoji or Unicode symbol</p>
              </Field>
              <Field label="Size">
                <div className="flex items-center gap-2">
                  <input type="range" min={16} max={120} value={pp.size ?? 40}
                    onChange={e => set({ size: Number(e.target.value) })} className="flex-1 accent-primary" />
                  <span className="text-xs font-mono w-8 text-right tabular-nums">{pp.size ?? 40}px</span>
                </div>
              </Field>
              <Field label="Alignment"><AlignBtns value={pp.align} onChange={v => set({ align: v })} /></Field>
            </>
          );
        })()}

        {component.type === "video" && (() => {
          const pp = p as VideoCompProps;
          return (
            <>
              <Field label="Video URL">
                {textInput(pp.url ?? "", v => set({ url: v }), "https://youtu.be/… or vimeo.com/…")}
                <p className="text-[10px] text-muted-foreground mt-1">Paste a YouTube or Vimeo URL</p>
              </Field>
              <Field label="Caption">{textInput(pp.caption ?? "", v => set({ caption: v }), "Optional caption")}</Field>
              <Field label="Aspect Ratio">
                <div className="flex gap-1">
                  {(["16/9", "4/3", "1/1"] as const).map(a => (
                    <button key={a} type="button" onClick={() => set({ aspectRatio: a })}
                      className={`px-2 py-1 rounded text-xs transition-colors ${(pp.aspectRatio ?? "16/9") === a ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          );
        })()}

        {component.type === "card" && (() => {
          const pp = p as CardCompProps;
          return (
            <>
              <Field label="Title">{textInput(pp.title, v => set({ title: v }))}</Field>
              <Field label="Body Text">{textArea(pp.body, v => set({ body: v }))}</Field>
              <Field label="Image URL">{textInput(pp.imageUrl ?? "", v => set({ imageUrl: v }), "https://…")}</Field>
              <Field label="CTA Label">{textInput(pp.ctaLabel ?? "", v => set({ ctaLabel: v }), "Learn More")}</Field>
              <Field label="CTA URL">{textInput(pp.ctaUrl ?? "", v => set({ ctaUrl: v }), "#")}</Field>
            </>
          );
        })()}

        {component.type === "testimonial" && (() => {
          const pp = p as TestimonialCompProps;
          return (
            <>
              <Field label="Quote">{textArea(pp.quote, v => set({ quote: v }))}</Field>
              <Field label="Author Name">{textInput(pp.author, v => set({ author: v }))}</Field>
              <Field label="Role / Title">{textInput(pp.role ?? "", v => set({ role: v }), "e.g. Homeowner")}</Field>
              <Field label="Avatar URL">{textInput(pp.avatarUrl ?? "", v => set({ avatarUrl: v }), "https://…")}</Field>
              <Field label="Star Rating">
                <div className="flex gap-1">
                  {([0, 1, 2, 3, 4, 5] as const).map(n => (
                    <button key={n} type="button" onClick={() => set({ rating: n })}
                      className={`px-2 py-1 rounded text-xs transition-colors ${(pp.rating ?? 5) === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {n === 0 ? "—" : `${n}★`}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          );
        })()}

        {component.type === "form" && (() => {
          const pp = p as FormCompProps;
          return (
            <>
              <Field label="Heading">{textInput(pp.heading ?? "", v => set({ heading: v }), "Get in Touch")}</Field>
              <Field label="Submit Button Label">{textInput(pp.submitLabel ?? "", v => set({ submitLabel: v }), "Send Message")}</Field>
              <Field label="Fields">
                <div className="space-y-2">
                  {(["nameField", "emailField", "phoneField", "messageField"] as const).map(field => (
                    <label key={field} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!pp[field]} onChange={e => set({ [field]: e.target.checked })}
                        className="rounded border-border accent-primary w-3.5 h-3.5" />
                      <span className="text-xs text-foreground">
                        {field === "nameField" ? "Name" : field === "emailField" ? "Email" : field === "phoneField" ? "Phone" : "Message"}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>
            </>
          );
        })()}

        {component.type === "map" && (() => {
          const pp = p as MapCompProps;
          return (
            <>
              <Field label="Address">
                {textInput(pp.address ?? "", v => set({ address: v }), "123 Main St, City, State")}
                <p className="text-[10px] text-muted-foreground mt-1">Or paste a Google Maps embed URL below</p>
              </Field>
              <Field label="Embed URL (optional)">
                {textInput(pp.embedUrl ?? "", v => set({ embedUrl: v }), "https://www.google.com/maps/embed?…")}
              </Field>
              <Field label="Height">
                <div className="flex items-center gap-2">
                  <input type="range" min={200} max={600} value={pp.height ?? 300}
                    onChange={e => set({ height: Number(e.target.value) })} className="flex-1 accent-primary" />
                  <span className="text-xs font-mono w-10 text-right tabular-nums">{pp.height ?? 300}px</span>
                </div>
              </Field>
            </>
          );
        })()}

      </div>
    </div>
  );
}
