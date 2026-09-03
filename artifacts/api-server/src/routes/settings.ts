import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable, settingsTable, usersTable, vehiclesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getCredential } from "../lib/credentialManager.js";
import { sendEmail, escapeHtml } from "../lib/sendEmail";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";
import { validateTaxAssumptionConfig } from "../lib/tax-estimate.js";
import { findInvoiceBusiness, loadInvoiceBrand } from "../lib/invoiceBranding.js";

const router = Router();
const objectStorage = new ObjectStorageService();

// ── Logo upload ────────────────────────────────────────────────────────────────
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

router.post("/logo", logoUpload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Upload to GCS
    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads/logos",
      req.file.originalname
    );
    // DB stores raw objectPath; serving URL is /api/storage/objects/...
    const servingUrl = toServingUrl(objectPath)!;

    // Persist raw objectPath to settings
    let [s] = await db.select().from(settingsTable).limit(1);
    if (!s) {
      [s] = await db.insert(settingsTable).values({ logoUrl: objectPath } as any).returning();
    } else {
      // Delete old logo from GCS if it's a GCS path
      if (s.logoUrl && s.logoUrl.startsWith("/objects/")) {
        try { await objectStorage.deleteObject(s.logoUrl); } catch { /* ignore */ }
      }
      [s] = await db.update(settingsTable).set({ logoUrl: objectPath, updatedAt: new Date() }).where(eq(settingsTable.id, s.id)).returning();
    }
    // Return the serving URL so frontend can use it directly
    res.json({ logoUrl: servingUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload logo" });
  }
});

router.delete("/logo", async (_req, res) => {
  try {
    let [s] = await db.select().from(settingsTable).limit(1);
    if (s?.logoUrl) {
      if (s.logoUrl.startsWith("/objects/")) {
        try { await objectStorage.deleteObject(s.logoUrl); } catch { /* ignore */ }
      }
      await db.update(settingsTable).set({ logoUrl: null, updatedAt: new Date() }).where(eq(settingsTable.id, s.id));
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove logo" });
  }
});

router.post("/dba-logo", logoUpload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads/logos",
      req.file.originalname
    );
    const servingUrl = toServingUrl(objectPath)!;

    let [s] = await db.select().from(settingsTable).limit(1);
    if (!s) {
      [s] = await db.insert(settingsTable).values({ dbaLogoUrl: objectPath } as any).returning();
    } else {
      if (s.dbaLogoUrl && s.dbaLogoUrl.startsWith("/objects/")) {
        try { await objectStorage.deleteObject(s.dbaLogoUrl); } catch { /* ignore */ }
      }
      [s] = await db.update(settingsTable).set({ dbaLogoUrl: objectPath, updatedAt: new Date() }).where(eq(settingsTable.id, s.id)).returning();
    }
    res.json({ dbaLogoUrl: servingUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload DBA logo" });
  }
});

// ── Logo data URI (for embedding in emails) ────────────────────────────────────
// Resolves the selected invoice business logo and returns an optimized data URI.
// Owner-only: logo objects are owner-managed private files.
router.get("/logo-data-uri", async (req, res) => {
  try {
    const [s] = await db.select().from(settingsTable).limit(1);
    if (!s) return res.status(404).json({ error: "No settings found" });

    const requestUserId = (req.user as { id?: string } | undefined)?.id;
    if (!requestUserId || s.ownerUserId !== requestUserId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const businessLine = typeof req.query.businessLine === "string" ? req.query.businessLine : null;
    const businesses = await db.select().from(businessesTable);
    const business = findInvoiceBusiness(businesses, businessLine);
    const brand = await loadInvoiceBrand(businessLine, s, business, objectStorage);
    if (!brand.logo) return res.status(404).json({ error: "No usable logo configured" });
    res.json({
      dataUri: brand.logo.dataUri,
      mimeType: brand.logo.mimeType,
      base64: brand.logo.buffer.toString("base64"),
      filename: brand.logo.filename,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load logo" });
  }
});

// ── Signature image upload ──────────────────────────────────────────────────────
router.post("/signature", logoUpload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads/signatures",
      req.file.originalname
    );
    const servingUrl = toServingUrl(objectPath)!;
    let [s] = await db.select().from(settingsTable).limit(1);
    if (!s) {
      [s] = await db.insert(settingsTable).values({ signatureImage: objectPath } as any).returning();
    } else {
      if (s.signatureImage && s.signatureImage.startsWith("/objects/")) {
        try { await objectStorage.deleteObject(s.signatureImage); } catch { /* ignore */ }
      }
      [s] = await db.update(settingsTable).set({ signatureImage: objectPath, updatedAt: new Date() }).where(eq(settingsTable.id, s.id)).returning();
    }
    res.json({ signatureImage: servingUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload signature" });
  }
});

router.delete("/signature", async (_req, res) => {
  try {
    const [s] = await db.select().from(settingsTable).limit(1);
    if (s?.signatureImage) {
      if (s.signatureImage.startsWith("/objects/")) {
        try { await objectStorage.deleteObject(s.signatureImage); } catch { /* ignore */ }
      }
      await db.update(settingsTable).set({ signatureImage: null, updatedAt: new Date() }).where(eq(settingsTable.id, s.id));
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove signature" });
  }
});

router.delete("/dba-logo", async (_req, res) => {
  try {
    let [s] = await db.select().from(settingsTable).limit(1);
    if (s?.dbaLogoUrl) {
      if (s.dbaLogoUrl.startsWith("/objects/")) {
        try { await objectStorage.deleteObject(s.dbaLogoUrl); } catch { /* ignore */ }
      }
      await db.update(settingsTable).set({ dbaLogoUrl: null, updatedAt: new Date() }).where(eq(settingsTable.id, s.id));
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove DBA logo" });
  }
});

// ── Settings ───────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  companyName: null,
  companyAddress: null,
  companyCity: null,
  companyState: "KY",
  companyZip: null,
  companyPhone: null,
  companyEmail: null,
  logoUrl: null,
  dbaLogoUrl: null,
  entityType: null,
  ein: null,
  defaultTaxRate: null,
  defaultPaymentTerms: "Net 30",
  lateFeePercent: null,
  invoicePrefix: "INV-2026-",
  invoiceNextNumber: 1001,
  invoiceLogoPosition: "top-left",
  invoiceLogoSize: "medium",
  smtpHost: null,
  smtpPort: "587",
  smtpUser: null,
  smtpPass: null,
  smtpSecure: 0,
  mileageRate: "0.725",
  mileageDefaultClassification: "business",
  mileageUnits: "miles",
  mileageReminderFrequency: "daily",
  currency: "USD",
  enabledFeatures: ["invoices", "expenses", "mileage", "estimates", "subcontractors", "daily_logs", "compliance", "clients"],
  thresholdAmount1099: "600",
  bottomNavItems: null,
  complianceNotificationEmail: null,
  complianceEmailEnabled: 1,
  taxFilingFrequency: "quarterly",
  // P&L layout defaults
  ownerSplitPct: "50",
  taxReservePct: "25",
  growthReservePct: "5",
  plStepOrder: '["expenses","growth","labor"]',
  // Tax Profile defaults: single-member LLC taxed as sole proprietorship
  federalTaxElection: "sole_prop",
  taxElectionEffectiveDate: null,
  calculatorDefaults: {
    plumbing: { baseCharge: 1000, dropRate: 125 },
    flooring: {
      labor: { Carpet: 4.50, Laminate: 4.50, LVP: 4.50, Hardwood: 4.50, Tile: 6.00 },
      full:  { Carpet: 5.00, Laminate: 6.50, LVP: 7.00, Hardwood: 11.50, Tile: 13.50 },
      minimumCharge: 500,
    },
    trim:    { laborRate: 5.50 },
    siding:  { laborRate: 2.00 },
    drywall: { laborRate: 2.50 },
    punchList: { halfDayPrice: 500, fullDayPrice: 1000, helperDayRate: 275 },
  },
  taxAssumptions: null,
};

/** Convert a raw DB path to a correct serving URL.
 * - /objects/...      → /api/storage/objects/... (GCS-backed, new uploads)
 * - /api/uploads/...  → returned as-is (legacy, served by static middleware)
 * - /uploads/...      → /api/uploads/... (corrects a brief bad-fix period)
 */
function toServingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/")) return `/api/storage/objects/${raw.slice("/objects/".length)}`;
  if (raw.startsWith("/uploads/")) return `/api${raw}`;
  return raw; // Already /api/uploads/... or http://...
}

function parseJsonArray(v: string | null | undefined): string[] | null {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function format(s: any) {
  return {
    ...s,
    logoUrl: toServingUrl(s.logoUrl),
    dbaLogoUrl: toServingUrl(s.dbaLogoUrl),
    signatureImage: toServingUrl(s.signatureImage),
    defaultTaxRate: s.defaultTaxRate ? parseFloat(s.defaultTaxRate) : null,
    lateFeePercent: s.lateFeePercent ? parseFloat(s.lateFeePercent) : null,
    mileageRate: s.mileageRate ? parseFloat(s.mileageRate) : 0.725,
    thresholdAmount1099: s.thresholdAmount1099 ? parseFloat(s.thresholdAmount1099) : 600,
    enabledFeatures: Array.isArray(s.enabledFeatures) ? s.enabledFeatures : DEFAULT_SETTINGS.enabledFeatures,
    invoiceLogoPosition: s.invoiceLogoPosition ?? "top-left",
    invoiceLogoSize: s.invoiceLogoSize ?? "medium",
    smtpHost: s.smtpHost ?? null,
    smtpPort: s.smtpPort ?? "587",
    smtpUser: s.smtpUser ?? null,
    smtpSecure: s.smtpSecure === 1 || s.smtpSecure === true,
    // smtpPass is intentionally omitted from GET responses for security
    smtpConfigured: !!(s.smtpHost && s.smtpUser && s.smtpPass),
    mileageDefaultClassification: s.mileageDefaultClassification ?? "business",
    mileageUnits: s.mileageUnits ?? "miles",
    mileageReminderFrequency: s.mileageReminderFrequency ?? "daily",
    bottomNavItems: parseJsonArray(s.bottomNavItems),
    complianceNotificationEmail: s.complianceNotificationEmail ?? null,
    complianceEmailEnabled: s.complianceEmailEnabled === 1 || s.complianceEmailEnabled === true,
    taxFilingFrequency: s.taxFilingFrequency ?? "quarterly",
    invoiceReminderEnabled: s.invoiceReminderEnabled === 1 || s.invoiceReminderEnabled === true,
    invoiceReminderDay1: s.invoiceReminderDay1 ?? 7,
    invoiceReminderDay2: s.invoiceReminderDay2 ?? 14,
    calculatorDefaults: s.calculatorDefaults ?? null,
    taxAssumptions: s.taxAssumptions ?? null,
    quickLinks: Array.isArray(s.quickLinks) ? s.quickLinks : [],
    // P&L layout
    ownerSplitPct: s.ownerSplitPct != null ? parseFloat(String(s.ownerSplitPct)) : 50,
    taxReservePct: s.taxReservePct != null ? parseFloat(String(s.taxReservePct)) : 25,
    growthReservePct: s.growthReservePct != null ? parseFloat(String(s.growthReservePct)) : 5,
    plStepOrder: !s.plStepOrder || s.plStepOrder === '["growth","labor","expenses"]'
      ? '["expenses","growth","labor"]'
      : s.plStepOrder,
    // Tax Profile
    federalTaxElection: s.federalTaxElection ?? "sole_prop",
    taxElectionEffectiveDate: s.taxElectionEffectiveDate ?? null,
    // Business Reserve Dashboard
    operatingReserveMode: s.operatingReserveMode ?? "0",
    operatingReserveCustom: s.operatingReserveCustom != null ? parseFloat(String(s.operatingReserveCustom)) : null,
    includeGrowthFundInReserve: s.includeGrowthFundInReserve === 1 || s.includeGrowthFundInReserve === true,
    // Vehicle & fuel cost estimation
    vehicleMpg: s.vehicleMpg ?? 17,
    fuelPricePerGallon: s.fuelPricePerGallon != null ? parseFloat(String(s.fuelPricePerGallon)) : null,
    fuelPriceUpdatedAt: s.fuelPriceUpdatedAt instanceof Date ? s.fuelPriceUpdatedAt.toISOString() : (s.fuelPriceUpdatedAt ?? null),
  };
}

router.get("/", async (req, res) => {
  try {
    let [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(settingsTable).values(DEFAULT_SETTINGS as any).returning();
    }
    const userId = (req.user as { id?: string } | undefined)?.id;
    const isOwner = settings.ownerUserId === userId;
    const formatted = format(settings);
    if (!isOwner) {
      const { smtpHost, smtpPort, smtpUser, smtpSecure, smtpConfigured, ein, ownerUserId, complianceNotificationEmail, complianceEmailEnabled, quickLinks, logoUrl, dbaLogoUrl, ...safe } = formatted;
      res.json(safe);
      return;
    }
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body;

    // quickLinks mutations are owner-only — enforce server-side
    if (body.quickLinks !== undefined) {
      const [s] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
      const userId = (req.user as { id?: string } | undefined)?.id;
      if (s?.ownerUserId && s.ownerUserId !== userId) {
        return res.status(403).json({ error: "Only the owner can modify portal links." });
      }
      // Validate payload shape: must be an array of objects with id, label, url strings
      if (!Array.isArray(body.quickLinks)) {
        return res.status(400).json({ error: "quickLinks must be an array." });
      }
      for (const item of body.quickLinks) {
        if (typeof item !== "object" || item === null ||
            typeof item.id !== "string" || !item.id ||
            typeof item.label !== "string" || !item.label.trim() ||
            typeof item.url !== "string" || !item.url.trim()) {
          return res.status(400).json({ error: "Each quick link must have id, label, and url strings." });
        }
        if (!/^https?:\/\//i.test(item.url.trim())) {
          return res.status(400).json({ error: "Quick link URLs must start with http:// or https://." });
        }
        if (item.label.trim().length > 200) {
          return res.status(400).json({ error: "Quick link label must be 200 characters or fewer." });
        }
        if (item.username !== undefined && typeof item.username !== "string") {
          return res.status(400).json({ error: "quick link username must be a string." });
        }
        if (item.username !== undefined && item.username.length > 500) {
          return res.status(400).json({ error: "Quick link username must be 500 characters or fewer." });
        }
        if (item.password !== undefined && typeof item.password !== "string") {
          return res.status(400).json({ error: "quick link password must be a string." });
        }
        if (item.password !== undefined && item.password.length > 500) {
          return res.status(400).json({ error: "Quick link password must be 500 characters or fewer." });
        }
      }
    }

    if (body.complianceNotificationEmail) {
      const email = body.complianceNotificationEmail.toString().trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "complianceNotificationEmail must be a valid email address" });
      }
    }

    if (body.invoiceReminderDay1 !== undefined || body.invoiceReminderDay2 !== undefined) {
      const d1 = parseInt(body.invoiceReminderDay1 ?? "7") || 7;
      const d2 = parseInt(body.invoiceReminderDay2 ?? "14") || 14;
      if (d1 < 1 || d1 > 365) {
        return res.status(400).json({ error: "First reminder day must be between 1 and 365." });
      }
      if (d2 < 1 || d2 > 365) {
        return res.status(400).json({ error: "Second reminder day must be between 1 and 365." });
      }
      if (d2 <= d1) {
        return res.status(400).json({ error: "Second reminder day must be greater than the first reminder day." });
      }
    }

    let [settings] = await db.select().from(settingsTable).limit(1);

    const patch = {
      companyName: body.companyName ?? settings?.companyName,
      companyAddress: body.companyAddress ?? settings?.companyAddress,
      companyCity: body.companyCity ?? settings?.companyCity,
      companyState: body.companyState ?? settings?.companyState,
      companyZip: body.companyZip ?? settings?.companyZip,
      companyPhone: body.companyPhone ?? settings?.companyPhone,
      companyEmail: body.companyEmail ?? settings?.companyEmail,
      entityType: body.entityType !== undefined ? body.entityType : settings?.entityType,
      ein: body.ein !== undefined ? body.ein : settings?.ein,
      logoUrl: body.logoUrl !== undefined ? body.logoUrl : settings?.logoUrl,
      defaultTaxRate: body.defaultTaxRate?.toString() ?? settings?.defaultTaxRate,
      defaultPaymentTerms: body.defaultPaymentTerms ?? settings?.defaultPaymentTerms,
      lateFeePercent: body.lateFeePercent?.toString() ?? settings?.lateFeePercent,
      invoicePrefix: body.invoicePrefix ?? settings?.invoicePrefix,
      invoiceNextNumber: body.invoiceNextNumber ?? settings?.invoiceNextNumber,
      invoiceLogoPosition: body.invoiceLogoPosition ?? settings?.invoiceLogoPosition,
      invoiceLogoSize: body.invoiceLogoSize ?? settings?.invoiceLogoSize,
      smtpHost: body.smtpHost !== undefined ? (body.smtpHost || null) : settings?.smtpHost,
      smtpPort: body.smtpPort ?? settings?.smtpPort ?? "587",
      smtpUser: body.smtpUser !== undefined ? (body.smtpUser || null) : settings?.smtpUser,
      smtpPass: body.smtpPass ? body.smtpPass : (settings?.smtpPass ?? null),
      smtpSecure: body.smtpSecure !== undefined ? (body.smtpSecure ? 1 : 0) : settings?.smtpSecure,
      mileageRate: body.mileageRate?.toString() ?? settings?.mileageRate,
      mileageDefaultClassification: body.mileageDefaultClassification ?? settings?.mileageDefaultClassification,
      mileageUnits: body.mileageUnits ?? settings?.mileageUnits,
      mileageReminderFrequency: body.mileageReminderFrequency ?? settings?.mileageReminderFrequency,
      currency: body.currency ?? settings?.currency,
      enabledFeatures: body.enabledFeatures ?? settings?.enabledFeatures,
      thresholdAmount1099: body.thresholdAmount1099?.toString() ?? settings?.thresholdAmount1099,
      bottomNavItems: body.bottomNavItems !== undefined
        ? (Array.isArray(body.bottomNavItems) ? JSON.stringify(body.bottomNavItems) : null)
        : settings?.bottomNavItems,
      complianceNotificationEmail: body.complianceNotificationEmail !== undefined
        ? (body.complianceNotificationEmail ? body.complianceNotificationEmail.toString().trim() || null : null)
        : settings?.complianceNotificationEmail,
      complianceEmailEnabled: body.complianceEmailEnabled !== undefined
        ? (body.complianceEmailEnabled ? 1 : 0)
        : (settings?.complianceEmailEnabled ?? 1),
      invoiceReminderEnabled: body.invoiceReminderEnabled !== undefined
        ? (body.invoiceReminderEnabled ? 1 : 0)
        : (settings?.invoiceReminderEnabled ?? 0),
      invoiceReminderDay1: body.invoiceReminderDay1 !== undefined
        ? (parseInt(body.invoiceReminderDay1) || 7)
        : (settings?.invoiceReminderDay1 ?? 7),
      invoiceReminderDay2: body.invoiceReminderDay2 !== undefined
        ? (parseInt(body.invoiceReminderDay2) || 14)
        : (settings?.invoiceReminderDay2 ?? 14),
      taxFilingFrequency: body.taxFilingFrequency !== undefined
        ? (body.taxFilingFrequency || "quarterly")
        : (settings?.taxFilingFrequency ?? "quarterly"),
      calculatorDefaults: body.calculatorDefaults !== undefined
        ? body.calculatorDefaults
        : (settings?.calculatorDefaults ?? null),
      taxAssumptions: body.taxAssumptions !== undefined
        ? validateTaxAssumptionConfig(body.taxAssumptions)
        : (settings?.taxAssumptions ?? null),
      quickLinks: body.quickLinks !== undefined
        ? (Array.isArray(body.quickLinks) ? body.quickLinks : null)
        : (settings?.quickLinks ?? null),
      // P&L layout
      ownerSplitPct: body.ownerSplitPct != null ? String(parseFloat(body.ownerSplitPct)) : settings?.ownerSplitPct,
      taxReservePct: body.taxReservePct != null ? String(parseFloat(body.taxReservePct)) : settings?.taxReservePct,
      growthReservePct: body.growthReservePct != null ? String(parseFloat(body.growthReservePct)) : settings?.growthReservePct,
      plStepOrder: body.plStepOrder !== undefined ? body.plStepOrder : settings?.plStepOrder,
      // Tax Profile
      federalTaxElection: body.federalTaxElection !== undefined ? (body.federalTaxElection || "sole_prop") : (settings?.federalTaxElection ?? "sole_prop"),
      taxElectionEffectiveDate: body.taxElectionEffectiveDate !== undefined ? (body.taxElectionEffectiveDate || null) : (settings?.taxElectionEffectiveDate ?? null),
      // Business Reserve Dashboard
      operatingReserveMode: body.operatingReserveMode !== undefined ? String(body.operatingReserveMode) : (settings?.operatingReserveMode ?? "0"),
      operatingReserveCustom: body.operatingReserveCustom !== undefined ? (body.operatingReserveCustom != null ? String(parseFloat(body.operatingReserveCustom)) : null) : (settings?.operatingReserveCustom ?? null),
      includeGrowthFundInReserve: body.includeGrowthFundInReserve !== undefined ? (body.includeGrowthFundInReserve ? 1 : 0) : (settings?.includeGrowthFundInReserve ?? 0),
      // Vehicle & fuel cost estimation
      vehicleMpg: body.vehicleMpg !== undefined ? (parseInt(String(body.vehicleMpg)) || 17) : (settings?.vehicleMpg ?? 17),
      fuelPricePerGallon: body.fuelPricePerGallon !== undefined
        ? (body.fuelPricePerGallon != null && body.fuelPricePerGallon !== "" ? String(parseFloat(String(body.fuelPricePerGallon))) : null)
        : (settings?.fuelPricePerGallon ?? null),
      updatedAt: new Date(),
    };

    if (!settings) {
      [settings] = await db.insert(settingsTable).values({ ...DEFAULT_SETTINGS, ...patch } as any).returning();
    } else {
      [settings] = await db.update(settingsTable).set(patch).returning();
    }
    res.json(format(settings));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// EIA duoarea codes for US states (used for state-level retail gasoline price lookup)
const STATE_TO_EIA_CODE: Record<string, string> = {
  AL: "SAL", AK: "SAK", AZ: "SAZ", AR: "SAR", CA: "SCA", CO: "SCO",
  CT: "SCT", DE: "SDE", FL: "SFL", GA: "SGA", HI: "SHI", ID: "SID",
  IL: "SIL", IN: "SIN", IA: "SIA", KS: "SKS", KY: "SKY", LA: "SLA",
  ME: "SME", MD: "SMD", MA: "SMA", MI: "SMI", MN: "SMN", MS: "SMS",
  MO: "SMO", MT: "SMT", NE: "SNE", NV: "SNV", NH: "SNH", NJ: "SNJ",
  NM: "SNM", NY: "SNY", NC: "SNC", ND: "SND", OH: "SOH", OK: "SOK",
  OR: "SOR", PA: "SPA", RI: "SRI", SC: "SSC", SD: "SSD", TN: "STN",
  TX: "STX", UT: "SUT", VT: "SVT", VA: "SVA", WA: "SWA", WV: "SWV",
  WI: "SWI", WY: "SWY", DC: "SDC",
};

// POST /api/settings/fuel-price/refresh
// Fetches the latest weekly retail regular gasoline price for the business's state from EIA
// and saves it to settings. POST is used (not GET) so it is covered by requireOwnerForWrites
// and cannot be triggered by non-owner users.
// Requires EIA_API_KEY env var (free registration at eia.gov).
// Falls back gracefully: if API unavailable, the last stored price is used for calculations.
router.post("/fuel-price/refresh", async (req, res) => {
  try {
    const apiKey = getCredential("eia", "EIA_API_KEY");
    if (!apiKey) {
      return res.status(422).json({
        error: "EIA fuel price API is not configured. Enter a fuel price manually, or add a free EIA API key via Integrations & APIs.",
        canManual: true,
      });
    }

    const [s] = await db.select({
      id: settingsTable.id,
    }).from(settingsTable).limit(1);

    // Use national average (NUS + EPM0 = All Grades, All Formulations).
    // State-level weekly data is only surveyed for ~30 states; national is always available.
    const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&frequency=weekly&data%5B0%5D=value&facets%5Bproduct%5D%5B%5D=EPM0&facets%5Bduoarea%5D%5B%5D=NUS&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=desc&length=1`;
    const eiaRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!eiaRes.ok) throw new Error(`EIA API returned ${eiaRes.status}`);

    const eiaData = await eiaRes.json() as { response?: { data?: Array<{ value?: string | number; period?: string }> } };
    const raw = eiaData?.response?.data?.[0]?.value;
    if (raw == null) throw new Error("No price data in EIA response");

    const price = parseFloat(String(raw));
    if (isNaN(price) || price <= 0) throw new Error("Invalid price in EIA response");

    const updatedAt = new Date();
    // Write to both settings (legacy fallback) and the default vehicle (primary source).
    await Promise.all([
      s
        ? db.update(settingsTable)
            .set({ fuelPricePerGallon: String(price), fuelPriceUpdatedAt: updatedAt, updatedAt: new Date() })
            .where(eq(settingsTable.id, s.id))
        : Promise.resolve(),
      db.update(vehiclesTable)
        .set({ fuelPricePerGallon: String(price), fuelPriceUpdatedAt: updatedAt, updatedAt: new Date() })
        .where(eq(vehiclesTable.isDefault, true)),
    ]);

    res.json({ price, updatedAt: updatedAt.toISOString() });
  } catch (err: any) {
    console.error("[fuel-price/refresh]", err);
    res.status(500).json({
      error: "Failed to fetch fuel price from EIA. Enter a price manually.",
      canManual: true,
    });
  }
});

router.post("/test-compliance-email", async (req, res) => {
  try {
    const [settings] = await db
      .select({
        ownerUserId: settingsTable.ownerUserId,
        companyEmail: settingsTable.companyEmail,
        complianceNotificationEmail: settingsTable.complianceNotificationEmail,
        complianceEmailEnabled: settingsTable.complianceEmailEnabled,
      })
      .from(settingsTable)
      .limit(1);

    const bodyEmail = typeof req.body?.email === "string" ? req.body.email.trim() : null;

    if (bodyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bodyEmail)) {
      res.status(400).json({ error: "The provided email address is not valid." });
      return;
    }

    let recipientEmail: string | null = bodyEmail || settings?.complianceNotificationEmail || null;

    if (!recipientEmail && settings?.ownerUserId) {
      const [owner] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, settings.ownerUserId))
        .limit(1);
      recipientEmail = owner?.email ?? null;
    }

    if (!recipientEmail) {
      recipientEmail = settings?.companyEmail ?? null;
    }

    if (!recipientEmail) {
      res.status(400).json({ error: "No recipient email configured. Add a notification email address or business email in settings." });
      return;
    }

    const safeEmail = escapeHtml(recipientEmail);
    const html = `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a56db;">Test: Compliance Notification</h2>
  <p>This is a test email confirming your compliance notification settings are working correctly.</p>
  <p>Compliance advance emails will be delivered to <strong>${safeEmail}</strong>.</p>
  ${process.env.APP_URL ? `<p>
    <a href="${process.env.APP_URL}/compliance" style="display: inline-block; background: #1a56db; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px;">
      View Compliance Center
    </a>
  </p>` : ""}
  <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
    This is a test notification from your Contractor Management App.
  </p>
</body>
</html>`.trim();

    const text = `Test: Compliance Notification\n\nThis is a test email confirming your compliance notification settings are working correctly.\n\nCompliance advance emails will be delivered to: ${recipientEmail}`;

    await sendEmail({ to: recipientEmail, subject: "Test: Compliance Notification Email", html, text });
    res.json({ ok: true, sentTo: recipientEmail });
  } catch (err) {
    console.error("Test compliance email failed:", err);
    res.status(500).json({ error: "Failed to send test email. Check your Gmail connection." });
  }
});

export default router;
