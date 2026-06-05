import React from "react";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";

export interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
}

export function textStyleToCSS(ts?: TextStyle): React.CSSProperties {
  if (!ts) return {};
  const css: React.CSSProperties = {};
  if (ts.fontFamily) css.fontFamily = ts.fontFamily;
  if (ts.fontSize) css.fontSize = ts.fontSize;
  if (ts.fontWeight) css.fontWeight = ts.fontWeight as React.CSSProperties["fontWeight"];
  if (ts.color) css.color = ts.color;
  if (ts.textAlign) css.textAlign = ts.textAlign;
  return css;
}

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Arial Black", value: "'Arial Black', Arial, sans-serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
  { label: "Palatino", value: "'Palatino Linotype', Palatino, serif" },
];

const SIZE_OPTIONS = [
  { label: "XS", value: "0.75rem" },
  { label: "SM", value: "0.875rem" },
  { label: "MD", value: "1rem" },
  { label: "LG", value: "1.25rem" },
  { label: "XL", value: "1.5rem" },
  { label: "2XL", value: "2rem" },
  { label: "3XL", value: "2.5rem" },
  { label: "4XL", value: "3rem" },
  { label: "5XL", value: "4rem" },
];

const WEIGHT_OPTIONS = [
  { label: "Normal", value: "400" },
  { label: "Medium", value: "500" },
  { label: "Semi", value: "600" },
  { label: "Bold", value: "700" },
  { label: "Extra", value: "800" },
];

interface TextStyleToolbarProps {
  style?: TextStyle;
  onChange: (style: TextStyle) => void;
  dark?: boolean;
}

function Btn({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
        active
          ? "bg-white/90 text-gray-900 shadow-sm"
          : "text-white/70 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

export function TextStyleToolbar({ style = {}, onChange, dark = true }: TextStyleToolbarProps) {
  function patch(patch: Partial<TextStyle>) {
    onChange({ ...style, ...patch });
  }

  const bg = dark ? "bg-black/50 backdrop-blur-sm border-white/10" : "bg-gray-800/90 border-gray-700";

  return (
    <div className={`flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg border text-white mt-1 mb-2 ${bg}`} onClick={e => e.stopPropagation()}>
      <select
        value={style.fontFamily ?? ""}
        onChange={e => patch({ fontFamily: e.target.value || undefined })}
        className="text-[10px] bg-white/10 text-white border-0 rounded px-1 py-0.5 outline-none cursor-pointer max-w-[90px]"
      >
        <option value="">Font</option>
        {FONT_OPTIONS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <div className="w-px h-3 bg-white/20" />

      <select
        value={style.fontSize ?? ""}
        onChange={e => patch({ fontSize: e.target.value || undefined })}
        className="text-[10px] bg-white/10 text-white border-0 rounded px-1 py-0.5 outline-none cursor-pointer max-w-[60px]"
      >
        <option value="">Size</option>
        {SIZE_OPTIONS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <div className="w-px h-3 bg-white/20" />

      <div className="flex gap-0.5">
        {WEIGHT_OPTIONS.map(w => (
          <Btn key={w.value} active={style.fontWeight === w.value} onClick={() => patch({ fontWeight: w.value === style.fontWeight ? undefined : w.value })}>
            {w.label}
          </Btn>
        ))}
      </div>

      <div className="w-px h-3 bg-white/20" />

      <label className="flex items-center gap-1 cursor-pointer" title="Text color">
        <span className="text-[10px] text-white/70">Color</span>
        <input
          type="color"
          value={style.color ?? "#ffffff"}
          onChange={e => patch({ color: e.target.value })}
          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
        />
        {style.color && (
          <button
            type="button"
            onClick={() => patch({ color: undefined })}
            className="text-[9px] text-white/50 hover:text-white/90"
            title="Reset color"
          >✕</button>
        )}
      </label>

      <div className="w-px h-3 bg-white/20" />

      <div className="flex gap-0.5">
        <Btn active={style.textAlign === "left"} onClick={() => patch({ textAlign: style.textAlign === "left" ? undefined : "left" })} title="Align left">
          <AlignLeft className="w-3 h-3" />
        </Btn>
        <Btn active={style.textAlign === "center"} onClick={() => patch({ textAlign: style.textAlign === "center" ? undefined : "center" })} title="Align center">
          <AlignCenter className="w-3 h-3" />
        </Btn>
        <Btn active={style.textAlign === "right"} onClick={() => patch({ textAlign: style.textAlign === "right" ? undefined : "right" })} title="Align right">
          <AlignRight className="w-3 h-3" />
        </Btn>
      </div>
    </div>
  );
}
