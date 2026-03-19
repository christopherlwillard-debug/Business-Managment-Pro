import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";

const router = Router();

const DEFAULT_SETTINGS = {
  companyName: null,
  companyAddress: null,
  companyCity: null,
  companyState: "KY",
  companyZip: null,
  companyPhone: null,
  companyEmail: null,
  logoUrl: null,
  defaultTaxRate: null,
  defaultPaymentTerms: "Net 30",
  lateFeePercent: null,
  invoicePrefix: "INV-2026-",
  invoiceNextNumber: 1001,
  mileageRate: "0.725",
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
  };
}

router.get("/", async (_req, res) => {
  try {
    let [settings] = await db.select().from(settingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(settingsTable).values(DEFAULT_SETTINGS as any).returning();
    }
    res.json(format(settings));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body;
    let [settings] = await db.select().from(settingsTable).limit(1);

    if (!settings) {
      [settings] = await db.insert(settingsTable).values({ ...DEFAULT_SETTINGS, ...body } as any).returning();
    } else {
      [settings] = await db.update(settingsTable).set({
        companyName: body.companyName ?? settings.companyName,
        companyAddress: body.companyAddress ?? settings.companyAddress,
        companyCity: body.companyCity ?? settings.companyCity,
        companyState: body.companyState ?? settings.companyState,
        companyZip: body.companyZip ?? settings.companyZip,
        companyPhone: body.companyPhone ?? settings.companyPhone,
        companyEmail: body.companyEmail ?? settings.companyEmail,
        logoUrl: body.logoUrl !== undefined ? body.logoUrl : settings.logoUrl,
        defaultTaxRate: body.defaultTaxRate?.toString() ?? settings.defaultTaxRate,
        defaultPaymentTerms: body.defaultPaymentTerms ?? settings.defaultPaymentTerms,
        lateFeePercent: body.lateFeePercent?.toString() ?? settings.lateFeePercent,
        invoicePrefix: body.invoicePrefix ?? settings.invoicePrefix,
        invoiceNextNumber: body.invoiceNextNumber ?? settings.invoiceNextNumber,
        mileageRate: body.mileageRate?.toString() ?? settings.mileageRate,
        currency: body.currency ?? settings.currency,
        enabledFeatures: body.enabledFeatures ?? settings.enabledFeatures,
        thresholdAmount1099: body.thresholdAmount1099?.toString() ?? settings.thresholdAmount1099,
        updatedAt: new Date(),
      }).returning();
    }
    res.json(format(settings));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
