import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// ── Logo upload ────────────────────────────────────────────────────────────────
const logosDir = path.resolve("uploads/logos");
if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

router.post("/logo", logoUpload.single("logo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const logoUrl = `/api/uploads/logos/${req.file.filename}`;
    // Persist to settings
    let [s] = await db.select().from(settingsTable).limit(1);
    if (!s) {
      [s] = await db.insert(settingsTable).values({ logoUrl } as any).returning();
    } else {
      // Delete old logo file if different
      if (s.logoUrl) {
        const old = path.resolve(s.logoUrl.replace("/api/uploads/", "uploads/"));
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      [s] = await db.update(settingsTable).set({ logoUrl, updatedAt: new Date() }).where(eq(settingsTable.id, s.id)).returning();
    }
    res.json({ logoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload logo" });
  }
});

router.delete("/logo", async (_req, res) => {
  try {
    let [s] = await db.select().from(settingsTable).limit(1);
    if (s?.logoUrl) {
      const fp = path.resolve(s.logoUrl.replace("/api/uploads/", "uploads/"));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      await db.update(settingsTable).set({ logoUrl: null, updatedAt: new Date() });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove logo" });
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
};

function format(s: any) {
  return {
    ...s,
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
      // Non-owners receive display/invoice settings only — SMTP details and EIN are owner-only
      const { smtpHost, smtpPort, smtpUser, smtpSecure, smtpConfigured, ein, ownerUserId, ...safe } = formatted;
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

export default router;
