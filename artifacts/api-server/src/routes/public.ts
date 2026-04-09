import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { db } from "@workspace/db";
import { publicServicesTable, portfolioPhotosTable, inquiriesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

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

router.get("/public/portfolio-image/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    console.error("public/portfolio-image error", error);
    res.status(500).json({ error: "Failed to serve image" });
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
