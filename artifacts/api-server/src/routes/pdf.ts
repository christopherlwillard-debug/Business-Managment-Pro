import { Router } from "express";
import { launchBrowser } from "../lib/launchBrowser.js";
import {
  generateCapabilityStatementPdfBuffer,
  getCapabilityStatementOptions,
} from "../lib/generateCapabilityStatementPdf.js";

const router = Router();

function parseIdList(value: unknown): { ids?: number[]; error?: string } {
  if (value === undefined) return {};
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  if (raw.trim() === "") return { ids: [] };
  const ids = raw.split(",").map((part) => Number(part.trim()));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { error: "selection IDs must be positive integers" };
  }
  return { ids: [...new Set(ids)] };
}

router.get("/capability-statement/options", async (req, res) => {
  const businessId = Number(req.query.businessId);
  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({ error: "businessId query param is required" });
    return;
  }

  try {
    const options = await getCapabilityStatementOptions(businessId);
    if (!options) {
      res.status(404).json({ error: "Business not found" });
      return;
    }
    res.json(options);
  } catch (err) {
    console.error("capability statement options error:", err);
    res.status(500).json({ error: "Failed to load capability statement options" });
  }
});

router.get("/capability-statement", async (req, res) => {
  const businessId = Number(req.query.businessId);
  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({ error: "businessId query param is required" });
    return;
  }

  const capabilityProfileIds = parseIdList(req.query.capabilityProfileIds);
  const pastProjectIds = parseIdList(req.query.pastProjectIds);
  if (capabilityProfileIds.error || pastProjectIds.error) {
    res.status(400).json({ error: capabilityProfileIds.error ?? pastProjectIds.error });
    return;
  }

  try {
    const result = await generateCapabilityStatementPdfBuffer(businessId, {
      capabilityProfileIds: capabilityProfileIds.ids,
      pastProjectIds: pastProjectIds.ids,
    });
    if (!result) {
      res.status(404).json({ error: "Business not found" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (err) {
    console.error("capability statement PDF error:", err);
    res.status(500).json({ error: "Failed to generate capability statement" });
  }
});

router.post("/render-html", async (req, res) => {
  try {
    const { html } = req.body as { html: string };
    if (!html || typeof html !== "string") {
      res.status(400).json({ error: "html required" });
      return;
    }
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith("data:") || url === "about:blank") {
          req.continue();
        } else {
          req.abort();
        }
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
      });
      const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");
      res.json({ pdfBase64 });
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    console.error("pdf render-html error:", err);
    res.status(500).json({ error: err.message || "PDF render failed" });
  }
});

export default router;
