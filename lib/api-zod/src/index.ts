export * from "./generated/api";
export type * from "./generated/types";
// Orval emits path-parameter Zod schemas and query-parameter TypeScript types
// with the same operation name for job-scoped endpoints. Resolve those
// intentional value/type namespace overlaps explicitly.
export type {
  CreateJobComponentWorkSessionParams,
  ListJobComponentWorkSessionsParams,
  UpdateJobComponentWorkSessionParams,
} from "./generated/types";
export {
  PortalCheckSessionBody,
  PortalSetPinBody,
  PortalVerifyPinBody,
  UpdateInvoiceStatusBody,
  UploadExpenseReceiptBody,
  UploadFileBody,
} from "./generated/api";
export { calculateInvoiceTotals, roundCurrency } from "./invoice-calculations";
export type {
  InvoiceCalculationLine,
  InvoiceTotals,
} from "./invoice-calculations";
export {
  SEO_LIMITS,
  isAbsoluteHttpUrl,
  validateSeoMetadata,
} from "./website-seo";
export type { SeoValidationErrors } from "./website-seo";
export {
  getInvoiceLogoDimensions,
  invoiceLogoPositionFromLayout,
  invoiceLogoMarginLeft,
  invoiceLogoPositionToX,
  INVOICE_LOGO_DIMENSIONS,
  INVOICE_LOGO_POSITIONS,
  INVOICE_LOGO_SIZES,
  normalizeInvoiceLogoPosition,
  normalizeInvoiceLogoLayout,
  normalizeInvoiceLogoSize,
  PRIMARY_BUSINESS_SLUG,
  resolveInvoiceBrand,
} from "./invoice-branding";
export type {
  InvoiceBrandProfile,
  InvoiceBrandSettings,
  InvoiceLogoDimensions,
  InvoiceLogoLayout,
  InvoiceLogoPosition,
  InvoiceLogoSize,
  ResolvedInvoiceBrand,
} from "./invoice-branding";
