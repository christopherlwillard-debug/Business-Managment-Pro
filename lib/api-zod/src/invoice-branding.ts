export const PRIMARY_BUSINESS_SLUG = "general_contracting";

export const INVOICE_LOGO_SIZES = ["small", "medium", "large"] as const;
export type InvoiceLogoSize = (typeof INVOICE_LOGO_SIZES)[number];

export const INVOICE_LOGO_POSITIONS = ["top-left", "top-center", "top-right"] as const;
export type InvoiceLogoPosition = (typeof INVOICE_LOGO_POSITIONS)[number];

export interface InvoiceLogoDimensions {
  width: number;
  height: number;
}

export interface InvoiceLogoLayout extends InvoiceLogoDimensions {
  /** Horizontal anchor within the safe header area: 0 = left, 0.5 = center, 1 = right. */
  x: number;
}

export const INVOICE_LOGO_DIMENSIONS: Record<InvoiceLogoSize, InvoiceLogoDimensions> = {
  small: { width: 120, height: 50 },
  medium: { width: 200, height: 75 },
  large: { width: 300, height: 120 },
};

export function normalizeInvoiceLogoSize(value: string | null | undefined): InvoiceLogoSize {
  return INVOICE_LOGO_SIZES.includes(value as InvoiceLogoSize)
    ? value as InvoiceLogoSize
    : "medium";
}

export function normalizeInvoiceLogoPosition(value: string | null | undefined): InvoiceLogoPosition {
  return INVOICE_LOGO_POSITIONS.includes(value as InvoiceLogoPosition)
    ? value as InvoiceLogoPosition
    : "top-left";
}

export function getInvoiceLogoDimensions(value: string | null | undefined): InvoiceLogoDimensions {
  return INVOICE_LOGO_DIMENSIONS[normalizeInvoiceLogoSize(value)];
}

export function invoiceLogoPositionToX(value: string | null | undefined): number {
  const position = normalizeInvoiceLogoPosition(value);
  return position === "top-center" ? 0.5 : position === "top-right" ? 1 : 0;
}

export function invoiceLogoPositionFromLayout(layout: InvoiceLogoLayout): InvoiceLogoPosition {
  return layout.x >= 0.75 ? "top-right" : layout.x >= 0.25 ? "top-center" : "top-left";
}

/** Email-safe horizontal offset that keeps both logo edges inside its full-width header row. */
export function invoiceLogoMarginLeft(layout: InvoiceLogoLayout): string {
  return `calc(${layout.x * 100}% - ${layout.x * layout.width}px)`;
}

export function normalizeInvoiceLogoLayout(
  value: unknown,
  fallbackPosition?: string | null,
  fallbackSize?: string | null,
): InvoiceLogoLayout {
  const fallbackDimensions = getInvoiceLogoDimensions(fallbackSize);
  const candidate = value && typeof value === "object"
    ? value as Partial<Record<keyof InvoiceLogoLayout, unknown>>
    : {};
  const numberOr = (raw: unknown, fallback: number) => {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    x: Math.max(0, Math.min(1, numberOr(candidate.x, invoiceLogoPositionToX(fallbackPosition)))),
    width: Math.max(80, Math.min(320, numberOr(candidate.width, fallbackDimensions.width))),
    height: Math.max(32, Math.min(140, numberOr(candidate.height, fallbackDimensions.height))),
  };
}

export interface InvoiceBrandProfile {
  slug?: string | null;
  type?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  invoiceLogoLayout?: unknown;
}

export interface InvoiceBrandSettings {
  companyName?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  logoUrl?: string | null;
  dbaLogoUrl?: string | null;
  invoiceLogoPosition?: string | null;
  invoiceLogoSize?: string | null;
}

export interface ResolvedInvoiceBrand {
  businessLine: string | null;
  displayName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  logoLayout: InvoiceLogoLayout;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function labelFromSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveInvoiceBrand(
  businessLine: string | null | undefined,
  settings: InvoiceBrandSettings | null | undefined,
  business: InvoiceBrandProfile | null | undefined,
): ResolvedInvoiceBrand {
  const selectedLine = clean(businessLine) || clean(business?.slug) || null;
  const isPrimary = !selectedLine || selectedLine === PRIMARY_BUSINESS_SLUG;
  const profileMatchesSelection = Boolean(
    business && (!selectedLine || clean(business.slug) === selectedLine),
  );
  const selectedProfile = profileMatchesSelection ? business : null;

  const displayName = isPrimary
    ? clean(settings?.companyName) || clean(selectedProfile?.name) || "Your Company"
    : clean(selectedProfile?.name) || (selectedLine ? labelFromSlug(selectedLine) : "") || "Your Company";

  const profileValue = (
    key: "address" | "city" | "state" | "zip" | "phone" | "email",
    settingsValue: string | null | undefined,
  ) => clean(selectedProfile?.[key]) || clean(settingsValue);

  const logoUrl = isPrimary
    ? clean(settings?.logoUrl) || null
    : clean(selectedProfile?.logoUrl) ||
      (selectedLine === "asphalt_sealing" && !business ? clean(settings?.dbaLogoUrl) : "") ||
      null;

  return {
    businessLine: selectedLine,
    displayName,
    address: profileValue("address", settings?.companyAddress),
    city: profileValue("city", settings?.companyCity),
    state: profileValue("state", settings?.companyState),
    zip: profileValue("zip", settings?.companyZip),
    phone: profileValue("phone", settings?.companyPhone),
    email: profileValue("email", settings?.companyEmail),
    logoUrl,
    logoLayout: normalizeInvoiceLogoLayout(
      selectedProfile?.invoiceLogoLayout,
      settings?.invoiceLogoPosition,
      settings?.invoiceLogoSize,
    ),
  };
}