import { useEffect, useRef, useState } from "react";

export interface BlockStyle {
  bgType?: "color" | "image" | "gradient";
  bgColor?: string;
  bgImageUrl?: string;
  bgImageObjectPath?: string;
  bgGradientFrom?: string;
  bgGradientTo?: string;
  bgGradientAngle?: number;
  overlayColor?: string;
  overlayOpacity?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
  minHeight?: number;
  maxWidth?: number;
  alignment?: "left" | "center" | "right" | "full";
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  borderColor?: string;
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  animation?: "none" | "fadeIn" | "slideUp" | "slideLeft";
  hideOnMobile?: boolean;
  hideOnTablet?: boolean;
  customClass?: string;
  anchorId?: string;
  customAttrs?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textColor?: string;
  accentColor?: string;
}

const SHADOW_MAP: Record<string, string> = {
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
};

const ANIM_CLASS_MAP: Record<string, string> = {
  fadeIn: "bs-anim-fade-in",
  slideUp: "bs-anim-slide-up",
  slideLeft: "bs-anim-slide-left",
};

interface BlockStyleWrapperProps {
  blockStyle?: BlockStyle;
  children: React.ReactNode;
  id?: string;
  wrapperClassName?: string;
  isEditing?: boolean;
  defaultBg?: string;
}

export function BlockStyleWrapper({
  blockStyle,
  children,
  id,
  wrapperClassName = "",
  isEditing,
  defaultBg,
}: BlockStyleWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const bs = blockStyle ?? {};
  const anim = bs.animation && bs.animation !== "none" ? bs.animation : null;

  useEffect(() => {
    if (isEditing || !anim) {
      setRevealed(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [anim, isEditing]);

  const style: React.CSSProperties = {};

  if (bs.bgType === "color" && bs.bgColor) {
    style.backgroundColor = bs.bgColor;
  } else if (bs.bgType === "image" && bs.bgImageUrl) {
    style.backgroundImage = `url(${JSON.stringify(bs.bgImageUrl)})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
    style.backgroundRepeat = "no-repeat";
  } else if (bs.bgType === "gradient" && bs.bgGradientFrom && bs.bgGradientTo) {
    const angle = bs.bgGradientAngle ?? 135;
    style.backgroundImage = `linear-gradient(${angle}deg, ${bs.bgGradientFrom}, ${bs.bgGradientTo})`;
  } else if (defaultBg) {
    style.backgroundColor = defaultBg;
  }

  if (bs.paddingTop !== undefined) style.paddingTop = bs.paddingTop;
  if (bs.paddingBottom !== undefined) style.paddingBottom = bs.paddingBottom;
  if (bs.paddingLeft !== undefined) style.paddingLeft = bs.paddingLeft;
  if (bs.paddingRight !== undefined) style.paddingRight = bs.paddingRight;
  if (bs.marginTop !== undefined) style.marginTop = bs.marginTop;
  if (bs.marginBottom !== undefined) style.marginBottom = bs.marginBottom;
  if (bs.minHeight) style.minHeight = bs.minHeight;
  if (bs.maxWidth) style.maxWidth = bs.maxWidth;
  if (bs.alignment === "center") { style.marginLeft = "auto"; style.marginRight = "auto"; }
  if (bs.alignment && bs.alignment !== "full") style.textAlign = bs.alignment as React.CSSProperties["textAlign"];
  if (bs.borderRadius !== undefined) style.borderRadius = bs.borderRadius;
  if (bs.borderWidth) {
    style.borderWidth = bs.borderWidth;
    style.borderStyle = (bs.borderStyle && bs.borderStyle !== "none") ? bs.borderStyle : "solid";
    if (bs.borderColor) style.borderColor = bs.borderColor;
  }
  if (bs.textColor) style.color = bs.textColor;
  if (bs.fontFamily) style.fontFamily = bs.fontFamily;
  if (bs.fontSize) style.fontSize = bs.fontSize;
  if (bs.fontWeight) style.fontWeight = bs.fontWeight;
  if (bs.lineHeight) style.lineHeight = bs.lineHeight;
  if (bs.letterSpacing !== undefined) style.letterSpacing = bs.letterSpacing;
  if (bs.textTransform && bs.textTransform !== "none") style.textTransform = bs.textTransform as React.CSSProperties["textTransform"];

  const shadowClass = bs.shadow && bs.shadow !== "none" ? (SHADOW_MAP[bs.shadow] ?? "") : "";
  const hideClasses = [
    bs.hideOnMobile ? "max-md:!hidden" : "",
    bs.hideOnTablet ? "md:max-lg:!hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  let animClass = "";
  if (anim && !isEditing) {
    animClass = revealed ? (ANIM_CLASS_MAP[anim] ?? "") : "bs-anim-hidden";
  }

  const hasOverlay = !!(bs.overlayColor && (bs.overlayOpacity ?? 0) > 0);

  const combined = [wrapperClassName, shadowClass, hideClasses, animClass, bs.customClass ?? ""]
    .filter(Boolean)
    .join(" ");

  let extraDataAttrs: Record<string, string> = {};
  if (bs.customAttrs) {
    try {
      const parsed = JSON.parse(bs.customAttrs);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([k, v]) => {
          if (typeof v === "string") {
            extraDataAttrs[k.startsWith("data-") ? k : `data-${k}`] = v;
          }
        });
      }
    } catch {}
  }

  return (
    <div ref={ref} id={bs.anchorId || id} className={`relative ${combined}`} style={style} {...extraDataAttrs}>
      {hasOverlay && (
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{ backgroundColor: bs.overlayColor, opacity: bs.overlayOpacity }}
        />
      )}
      {hasOverlay ? <div className="relative z-10">{children}</div> : children}
    </div>
  );
}
