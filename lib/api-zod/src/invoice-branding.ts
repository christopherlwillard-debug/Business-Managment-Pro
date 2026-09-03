export const PRIMARY_BUSINESS_SLUG = "general_contracting";

export const INVOICE_LOGO_SIZES = ["small", "medium", "large"] as const;
export type InvoiceLogoSize = (typeof INVOICE_LOGO_SIZES)[number];

export const INVOICE_LOGO_POSITIONS = ["top-left", "top-center", "top-right"] as const;
export type InvoiceLogoPosition = (typeof INVOICE_LOGO_POSITIONS)[number];

export interface InvoiceLogoDimensions {
  width: number;
  height: number;
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
  };
}