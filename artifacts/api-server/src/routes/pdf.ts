import { Router } from "express";
import { launchBrowser } from "../lib/launchBrowser.js";

const router = Router();

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
