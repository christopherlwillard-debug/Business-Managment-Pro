import { Router, type IRouter, type Request, type Response } from "express";
import { db, publicServicesTable, portfolioPhotosTable, inquiriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/public/services", async (req: Request, res: Response): Promise<void> => {
  try {
    const services = await db
      .select()
      .from(publicServicesTable)
      .where(eq(publicServicesTable.active, true))
      .orderBy(asc(publicServicesTable.sortOrder));
    res.json(services);
  } catch (err) {
    console.error("public/services error", err);
    res.status(500).json({ error: "Failed to load services" });
  }
});

router.get("/public/portfolio", async (req: Request, res: Response): Promise<void> => {
  try {
    const photos = await db
      .select()
      .from(portfolioPhotosTable)
      .where(eq(portfolioPhotosTable.active, true))
      .orderBy(asc(portfolioPhotosTable.sortOrder));
    res.json(photos);
  } catch (err) {
    console.error("public/portfolio error", err);
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

router.post("/public/contact", async (req: Request, res: Response): Promise<void> => {
  const { name, phone, bestContactMethod, service, message } = req.body ?? {};
  if (!name || !message) {
    res.status(400).json({ error: "Name and message are required" });
    return;
  }
  try {
    const [inquiry] = await db
      .insert(inquiriesTable)
      .values({ name, phone: phone ?? null, bestContactMethod: bestContactMethod ?? null, service: service ?? null, message })
      .returning();
    res.status(201).json({ success: true, id: inquiry.id });
  } catch (err) {
    console.error("public/contact error", err);
    res.status(500).json({ error: "Failed to submit inquiry" });
  }
});

export default router;
