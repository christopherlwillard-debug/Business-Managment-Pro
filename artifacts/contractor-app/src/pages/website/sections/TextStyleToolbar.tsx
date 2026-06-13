import React, { useEffect, useRef, useState } from "react";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { useInlineEditContext } from "../InlineEditContext";

export interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  textAlign?: "left" | "center" | "right";
}

export function textStyleToCSS(ts?: TextStyle): React.CSSProperties {
  if (!ts) return {};
  const css: React.CSSProperties = {};
  if (ts.fontFamily) css.fontFamily = ts.fontFamily;
  if (ts.fontSize) css.fontSize = ts.fontSize;
  if (ts.fontWeight) css.fontWeight = ts.fontWeight as React.CSSProperties["fontWeight"];
  if (ts.fontStyle) css.fontStyle = ts.fontStyle;
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
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "30", value: "30px" },
  { label: "36", value: "36px" },
  { label: "48", value: "48px" },
  { label: "60", value: "60px" },
  { label: "72", value: "72px" },
  { label: "96", value: "96px" },
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
    <div className={`flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg border text-white ${bg}`} onClick={e => e.stopPropagation()}>
      <select
        value={style.fontFamily ?? ""}
        onChange={e => patch({ fontFamily: e.target.value || undefined })}
        className="text-[10px] bg-gray-800 text-white border-0 rounded px-1 py-0.5 outline-none cursor-pointer max-w-[90px]"
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
        className="text-[10px] bg-gray-800 text-white border-0 rounded px-1 py-0.5 outline-none cursor-pointer max-w-[60px]"
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

/**
 * FloatingToolbar
 *
 * Wraps TextStyleToolbar in an absolutely-positioned container that floats
 * above (or below) its nearest `position: relative` ancestor. Visibility is
 * controlled by InlineEditContext — shows whenever the given `id` is selected
 * or being edited.
 *
 * Place this as a direct child of a `relative`-positioned wrapper div alongside
 * InlineEditableText so `bottom-full` aligns the toolbar flush above the text.
 *
 * Edge detection:
 *   - Flips to `top-full` when the element is within 52px of the viewport top.
 *   - Clamps `left` to keep toolbar fully within the viewport (8px margin).
 */
export function FloatingToolbar({
  id,
  style,
  onChange,
  dark,
}: {
  id: string;
  style?: TextStyle;
  onChange: (s: TextStyle) => void;
  dark?: boolean;
}) {
  const ctx = useInlineEditContext();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [leftAdjust, setLeftAdjust] = useState(0);

  const isVisible = ctx !== null && (ctx.selectedId === id || ctx.editingId === id);

  useEffect(() => {
    if (!isVisible) {
      setFlipped(false);
      setLeftAdjust(0);
      return;
    }

    const el = wrapperRef.current;
    const parent = el?.parentElement;
    if (!parent) return;

    // Measure bounds against the editor canvas container, not the viewport.
    // Falls back to viewport when rendered outside the editor (e.g. previews).
    const canvasEl = parent.closest("[data-editor-canvas]");
    const canvasRect = canvasEl
      ? canvasEl.getBoundingClientRect()
      : { top: 0, left: 0, right: window.innerWidth };

    // Flip detection: use the parent element's position relative to the canvas top
    const parentRect = parent.getBoundingClientRect();
    setFlipped(parentRect.top - canvasRect.top < 52);

    // Left clamping: measure after paint so we have real toolbar dimensions
    requestAnimationFrame(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      if (rect.right > canvasRect.right - 8) {
        setLeftAdjust(canvasRect.right - 8 - rect.right);
      } else if (rect.left < canvasRect.left + 8) {
        setLeftAdjust(canvasRect.left + 8 - rect.left);
      } else {
        setLeftAdjust(0);
      }
    });
  }, [isVisible, id]);

  if (!isVisible) return null;

  return (
    <div
      ref={wrapperRef}
      data-inline-toolbar=""
      className={`absolute z-[25] pointer-events-auto min-w-max ${
        flipped ? "top-full mt-1" : "bottom-full mb-1"
      }`}
      style={{ left: leftAdjust !== 0 ? leftAdjust : undefined }}
    >
      <TextStyleToolbar style={style} onChange={onChange} dark={dark} />
    </div>
  );
}
