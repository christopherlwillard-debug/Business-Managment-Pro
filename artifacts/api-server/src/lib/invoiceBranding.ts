import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { Business, Settings } from "@workspace/db/schema";
import {
  resolveInvoiceBrand,
  type ResolvedInvoiceBrand,
} from "@workspace/api-zod";
import { ObjectStorageService } from "./objectStorage.js";
import type { InvoiceEmailSettings } from "./invoiceEmail.js";

export interface InvoiceLogoAsset {
  dataUri: string;
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg";
  filename: string;
}

export interface LoadedInvoiceBrand extends ResolvedInvoiceBrand {
  logo: InvoiceLogoAsset | null;
}

function rawObjectPath(rawUrl: string): string {
  if (rawUrl.startsWith("/api/storage/objects/")) {
    return `/objects/${rawUrl.slice("/api/storage/objects/".length)}`;
  }
  return rawUrl;
}

async function readLogoBuffer(
  rawUrl: string,
  objectStorage: ObjectStorageService,
): Promise<Buffer | null> {
  const normalized = rawObjectPath(rawUrl);
  if (normalized.startsWith("/objects/")) {
    const file = await objectStorage.getObjectEntityFile(normalized);
    const [buffer] = await file.download();
    return buffer as Buffer;
  }

  if (normalized.startsWith("/uploads/") || normalized.startsWith("/api/uploads/")) {
    const relative = normalized.startsWith("/api/uploads/")
      ? normalized.slice("/api/uploads/".length)
      : normalized.slice("/uploads/".length);
    const uploadsRoot = path.resolve("uploads");
    const filePath = path.resolve(uploadsRoot, relative);
    if (!filePath.startsWith(`${uploadsRoot}${path.sep}`) && filePath !== uploadsRoot) {
      return null;
    }
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  }

  if (normalized.startsWith("data:image/")) {
    const match = normalized.match(/^data:image\/(?:png|jpe?g|webp|gif);base64,(.+)$/i);
    return match ? Buffer.from(match[1], "base64") : null;
  }

  return null;
}

async function makeEmailSafeLogo(buffer: Buffer): Promise<InvoiceLogoAsset> {
  let optimized = await sharp(buffer, { animated: false })
    .rotate()
    .resize(400, 180, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
  let mimeType: InvoiceLogoAsset["mimeType"] = "image/png";
  let filename = "invoice-logo.png";

  if (optimized.length > 100 * 1024) {
    optimized = await sharp(buffer, { animated: false })
      .rotate()
      .resize(400, 180, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    mimeType = "image/jpeg";
    filename = "invoice-logo.jpg";
  }

  return {
    buffer: optimized,
    mimeType,
    filename,
    dataUri: `data:${mimeType};base64,${optimized.toString("base64")}`,
  };
}

export function findInvoiceBusiness(
  businesses: Business[],
  businessLine?: string | null,
  businessId?: number | null,
): Business | null {
  if (businessId != null) {
    const byId = businesses.find(business => business.id === businessId);
    if (byId) return byId;
  }
  return businessLine
    ? businesses.find(business => business.slug === businessLine) ?? null
    : null;
}

export async function loadInvoiceBrand(
  businessLine: string | null | undefined,
  settings: Settings | null | undefined,
  business: Business | null | undefined,
  objectStorage = new ObjectStorageService(),
): Promise<LoadedInvoiceBrand> {
  const brand = resolveInvoiceBrand(businessLine, settings, business);
  if (!brand.logoUrl) return { ...brand, logo: null };

  try {
    const buffer = await readLogoBuffer(brand.logoUrl, objectStorage);
    if (!buffer) return { ...brand, logo: null };
    return { ...brand, logo: await makeEmailSafeLogo(buffer) };
  } catch (error) {
    console.warn(`[invoiceBranding] Could not load logo for ${brand.businessLine ?? "primary"}:`, error);
    return { ...brand, logo: null };
  }
}

export function invoiceEmailSettingsFromBrand(
  settings: Settings | null | undefined,
  brand: LoadedInvoiceBrand,
): InvoiceEmailSettings {
  return {
    ...(settings ?? {}),
    companyName: brand.displayName,
    companyAddress: brand.address,
    companyCity: brand.city,
    companyState: brand.state,
    companyZip: brand.zip,
    companyPhone: brand.phone,
    companyEmail: brand.email,
    logoDataUri: brand.logo?.dataUri ?? null,
    logoBuffer: brand.logo?.buffer ?? null,
    logoMimeType: brand.logo?.mimeType ?? null,
    logoFilename: brand.logo?.filename ?? null,
  };
}