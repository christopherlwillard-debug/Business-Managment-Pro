import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail, escapeHtml } from "../lib/sendEmail";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";

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
      const { smtpHost, smtpPort, smtpUser, smtpSecure, smtpConfigured, ein, ownerUserId, complianceNotificationEmail, complianceEmailEnabled, ...safe } = formatted;
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

    if (body.complianceNotificationEmail) {
      const email = body.complianceNotificationEmail.toString().trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "complianceNotificationEmail must be a valid email address" });
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
