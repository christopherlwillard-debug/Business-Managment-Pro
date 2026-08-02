import { useEffect, useRef, useState } from "react";

export interface BgImageEffects {
  opacity?: number;
  brightness?: number;
  blur?: number;
  position?: string;
  scale?: "cover" | "contain" | "fill";
}

export interface BlockStyle {
  bgType?: "color" | "image" | "gradient";
  bgColor?: string;
  bgImageUrl?: string;
  bgImageObjectPath?: string;
  bgGradientFrom?: string;
  bgGradientTo?: string;
  bgGradientAngle?: number;
  bgImageEffects?: BgImageEffects;
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
  animation?: "none" | "fadeIn" | "slideUp" | "slideLeft" | "slideRight" | "scaleUp" | "zoomIn";
  /** Entrance animation delay in ms (0–1000, step 50). Default: 0. */
  animationDelay?: number;
  /** Entrance animation duration in ms (200–1200, step 100). Default: 700. */
  animationDuration?: number;
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
  fadeIn:     "bs-anim-fade-in",
  slideUp:    "bs-anim-slide-up",
  slideLeft:  "bs-anim-slide-left",
  slideRight: "bs-anim-slide-right",
  scaleUp:    "bs-anim-scale-up",
  zoomIn:     "bs-anim-zoom-in",
};

/** Map from animation key to the underlying @keyframes name — used for live DOM preview. */
export const ANIM_KEYFRAME_MAP: Record<string, string> = {
  fadeIn:     "bs-fade-in",
  slideUp:    "bs-slide-up",
  slideLeft:  "bs-slide-left",
  slideRight: "bs-slide-right",
  scaleUp:    "bs-scale-up",
  zoomIn:     "bs-zoom-in",
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

  const hasImageBg = bs.bgType === "image" && !!bs.bgImageUrl;

  const style: React.CSSProperties = {};

  if (bs.bgType === "color" && bs.bgColor) {
    style.backgroundColor = bs.bgColor;
  } else if (bs.bgType === "gradient" && bs.bgGradientFrom && bs.bgGradientTo) {
    const angle = bs.bgGradientAngle ?? 135;
    style.backgroundImage = `linear-gradient(${angle}deg, ${bs.bgGradientFrom}, ${bs.bgGradientTo})`;
  } else if (!hasImageBg && defaultBg) {
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
  // Entrance-animation timing CSS variables (consumed by .bs-anim-* classes)
  if (anim) {
    if (bs.animationDelay !== undefined && bs.animationDelay > 0) {
      (style as Record<string, unknown>)["--bs-anim-delay"] = `${bs.animationDelay}ms`;
    }
    if (bs.animationDuration !== undefined) {
      (style as Record<string, unknown>)["--bs-anim-duration"] = `${bs.animationDuration}ms`;
    }
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

  const fx = bs.bgImageEffects ?? {};
  const imgBrightness = fx.brightness ?? 100;
  const imgOpacity = fx.opacity ?? 1;
  const imgBlur = fx.blur ?? 0;
  const imgPosition = fx.position ?? "center";
  const imgScale = fx.scale ?? "cover";
  const imgBgSize = imgScale === "fill" ? "100% 100%" : imgScale;

  const imgLayerStyle: React.CSSProperties = {
    backgroundImage: hasImageBg ? `url(${JSON.stringify(bs.bgImageUrl)})` : undefined,
    backgroundSize: imgBgSize,
    backgroundPosition: imgPosition,
    backgroundRepeat: "no-repeat",
    opacity: imgOpacity,
    filter: `brightness(${imgBrightness / 100}) blur(${imgBlur}px)`,
    transition: "opacity 0.2s ease, filter 0.2s ease",
  };

  const needsContentWrapper = hasImageBg || hasOverlay;

  return (
    <div ref={ref} id={bs.anchorId || id} className={`relative ${combined}`} style={style} {...extraDataAttrs}>
      {hasImageBg && (
        <div
          className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
          style={imgLayerStyle}
          aria-hidden="true"
        />
      )}
      {hasOverlay && (
        <div
          className={`absolute inset-0 pointer-events-none ${hasImageBg ? "z-10" : "z-0"}`}
          style={{ backgroundColor: bs.overlayColor, opacity: bs.overlayOpacity }}
        />
      )}
      {needsContentWrapper
        ? <div className={`relative ${hasImageBg ? "z-20" : "z-10"}`}>{children}</div>
        : children}
    </div>
  );
}
