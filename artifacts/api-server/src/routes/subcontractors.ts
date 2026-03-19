import { Router } from "express";
import { db } from "@workspace/db";
import { subcontractorsTable, settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

function format(s: any) {
  return {
    ...s,
    ytdPayments: parseFloat(s.ytdPayments ?? "0"),
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

router.get("/1099-report", async (req, res) => {
  try {
    const { year } = req.query;
    const [settings] = await db.select().from(settingsTable).limit(1);
    const threshold = parseFloat(settings?.thresholdAmount1099 ?? "600");
    const subs = await db.select().from(subcontractorsTable).orderBy(subcontractorsTable.name);

    res.json(subs.map(s => {
      const ytd = parseFloat(s.ytdPayments ?? "0");
      const alerts: string[] = [];
      if (ytd >= threshold) alerts.push(`YTD payments $${ytd.toFixed(2)} exceed $${threshold} threshold`);
      if (!s.w9OnFile) alerts.push("W-9 not on file");
      if (ytd >= threshold * 0.8 && ytd < threshold) alerts.push(`Approaching $${threshold} threshold`);

      return {
        subcontractorId: s.id,
        name: s.name,
        ytdPayments: ytd,
        threshold,
        needsForm: ytd >= threshold,
        w9OnFile: s.w9OnFile,
        alerts,
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get 1099 report" });
  }
});

router.get("/", async (req, res) => {
  try {
    const subs = await db.select().from(subcontractorsTable).orderBy(subcontractorsTable.name);
    res.json(subs.map(format));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subcontractors" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const [sub] = await db.insert(subcontractorsTable).values({ name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile: !!w9OnFile, address, notes }).returning();
    res.status(201).json(format(sub));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create subcontractor" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.id, parseInt(req.params.id)));
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json(format(sub));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subcontractor" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile, address, notes, ytdPayments } = req.body;
    const [sub] = await db.update(subcontractorsTable).set({ name, email, phone, trade, licenseNumber, licenseExpiry, insuranceExpiry, w9OnFile: !!w9OnFile, address, notes, ytdPayments: ytdPayments?.toString() }).where(eq(subcontractorsTable.id, id)).returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json(format(sub));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update subcontractor" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(subcontractorsTable).where(eq(subcontractorsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete subcontractor" });
  }
});

export default router;
