import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface ButtonConfig {
  url?: string;
  newTab?: boolean;
  bgColor?: string;
  textColor?: string;
  borderRadius?: "pill" | "rounded" | "square";
  size?: "sm" | "md" | "lg";
}

const BORDER_RADIUS_OPTIONS: { label: string; value: ButtonConfig["borderRadius"] }[] = [
  { label: "Pill", value: "pill" },
  { label: "Rounded", value: "rounded" },
  { label: "Square", value: "square" },
];

const SIZE_OPTIONS: { label: string; value: ButtonConfig["size"]; cls: string }[] = [
  { label: "SM", value: "sm", cls: "px-4 py-1.5 text-xs" },
  { label: "MD", value: "md", cls: "px-6 py-2.5 text-sm" },
  { label: "LG", value: "lg", cls: "px-8 py-3 text-base" },
];

export function buttonConfigToStyle(cfg?: ButtonConfig): React.CSSProperties {
  if (!cfg) return {};
  return {
    backgroundColor: cfg.bgColor ?? undefined,
    color: cfg.textColor ?? undefined,
    borderRadius:
      cfg.borderRadius === "pill" ? "9999px" :
      cfg.borderRadius === "rounded" ? "0.5rem" :
      cfg.borderRadius === "square" ? "4px" :
      undefined,
  };
}

export function buttonConfigToClasses(cfg?: ButtonConfig): string {
  const size = cfg?.size ?? "md";
  const sizeOpt = SIZE_OPTIONS.find(s => s.value === size);
  return sizeOpt?.cls ?? "px-6 py-2.5 text-sm";
}

interface ButtonEditorProps {
  config?: ButtonConfig;
  onChange: (cfg: ButtonConfig) => void;
}

export function ButtonEditor({ config = {}, onChange }: ButtonEditorProps) {
  const [open, setOpen] = useState(false);

  function patch(p: Partial<ButtonConfig>) {
    onChange({ ...config, ...p });
  }

  return (
    <div className="mt-2 rounded-lg border border-white/20 overflow-hidden" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
      >
        <span>Button Settings</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 bg-black/20">
          <div>
            <label className="text-[10px] text-white/60 block mb-1">Link URL</label>
            <input
              type="text"
              value={config.url ?? ""}
              onChange={e => patch({ url: e.target.value || undefined })}
              placeholder="#contact or https://..."
              className="w-full text-[11px] bg-white/10 border border-white/20 text-white placeholder-white/30 rounded px-2 py-1.5 outline-none focus:border-white/50"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.newTab ?? false}
              onChange={e => patch({ newTab: e.target.checked })}
              className="rounded"
            />
            <span className="text-[10px] text-white/70">Open in new tab</span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/60 block mb-1">Background</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={config.bgColor ?? "#ffffff"}
                  onChange={e => patch({ bgColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-white/20 bg-transparent p-0"
                />
                {config.bgColor && (
                  <button type="button" onClick={() => patch({ bgColor: undefined })} className="text-[9px] text-white/50 hover:text-white/90">✕</button>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/60 block mb-1">Text color</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={config.textColor ?? "#000000"}
                  onChange={e => patch({ textColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-white/20 bg-transparent p-0"
                />
                {config.textColor && (
                  <button type="button" onClick={() => patch({ textColor: undefined })} className="text-[9px] text-white/50 hover:text-white/90">✕</button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/60 block mb-1">Shape</label>
            <div className="flex gap-1">
              {BORDER_RADIUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => patch({ borderRadius: config.borderRadius === opt.value ? undefined : opt.value })}
                  className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                    config.borderRadius === opt.value
                      ? "bg-white/25 border-white/50 text-white font-semibold"
                      : "border-white/20 text-white/60 hover:text-white hover:border-white/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/60 block mb-1">Size</label>
            <div className="flex gap-1">
              {SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => patch({ size: config.size === opt.value ? undefined : opt.value })}
                  className={`flex-1 text-[10px] py-1 rounded border transition-colors ${
                    config.size === opt.value
                      ? "bg-white/25 border-white/50 text-white font-semibold"
                      : "border-white/20 text-white/60 hover:text-white hover:border-white/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
