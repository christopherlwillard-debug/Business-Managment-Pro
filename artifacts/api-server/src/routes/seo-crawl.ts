/**
 * seo-crawl.ts — Root-level sitemap.xml and robots.txt for published websites.
 *
 * Mounted at the Express root BEFORE static-file serving and auth middleware so
 * that search-engine crawlers (Googlebot, etc.) receive proper XML/plain-text
 * responses instead of the SPA fallback HTML when they visit:
 *
 *   GET /sitemap.xml   → sitemap XML for the published site on this host
 *   GET /robots.txt    → robots.txt referencing the above sitemap
 *
 * Detection strategy
 * ------------------
 * 1. Custom-domain mode (production): the request arrives with a Host / X-Forwarded-Host
 *    header that matches websiteConfigs.settings->>'customDomain'. We look up the config
 *    and generate the sitemap/robots on the fly.
 *
 * 2. Slug-based mode (dev / Replit preview): crawlers use the slug-based URL
 *    `/api/public/site/:slug/sitemap.xml` which is served by the publicRouter in
 *    website.ts. Nothing extra is needed for that path.
 *
 * If no matching published site is found for the Host header, we return 404 so
 * that normal Express routing continues (static file handler, SPA fallback, etc.).
 */

import { Router } from "express";
import { db, websiteConfigsTable, businessesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router = Router();

// ── Shared helpers ─────────────────────────────────────────────────────────────

function normalizeHostForSeo(raw: string): string {
  return raw.toLowerCase().split(":")[0].replace(/\.+$/, "").trim();
}

function buildSitemapXml(baseUrl: string, pages: Array<{ slug: string; name: string }>): string {
  const trimBase = baseUrl.replace(/\/$/, "");
  const urls = [
    `  <url><loc>${trimBase}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...pages.map(p =>
      `  <url><loc>${trimBase}/${p.slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

function buildRobotsTxt(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
}

/** Look up a published website config whose customDomain matches the request host. */
async function findConfigByHost(host: string) {
  if (!host) return null;
  const [config] = await db
    .select({ settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(
      and(
        eq(websiteConfigsTable.published, true),
        sql`lower(trim(trailing '.' from ${websiteConfigsTable.settings}->>'customDomain')) = ${host}`
      )
    );
  return config ?? null;
}

// ── GET /sitemap.xml ───────────────────────────────────────────────────────────

router.get("/sitemap.xml", async (req, res) => {
  try {
    const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.hostname || "";
    const host = normalizeHostForSeo(rawHost);

    const config = await findConfigByHost(host);
    if (!config) {
      // No custom-domain site found — let Express continue to static files / SPA
      res.status(404).type("text/plain").send("Not found");
      return;
    }

    const settings = config.settings as Record<string, unknown>;
    const pages = (settings.pages as Array<{ slug: string; name: string }> | undefined) ?? [];
    const baseUrl = `https://${host}`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildSitemapXml(baseUrl, pages));
  } catch (err) {
    console.error("[seo-crawl] /sitemap.xml error:", err);
    res.status(500).type("text/plain").send("Internal error");
  }
});

// ── GET /robots.txt ────────────────────────────────────────────────────────────

router.get("/robots.txt", async (req, res) => {
  try {
    const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.hostname || "";
    const host = normalizeHostForSeo(rawHost);

    const config = await findConfigByHost(host);
    if (!config) {
      // No custom-domain site — return a permissive default robots.txt
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send("User-agent: *\nAllow: /\n");
      return;
    }

    const sitemapUrl = `https://${host}/sitemap.xml`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buildRobotsTxt(sitemapUrl));
  } catch (err) {
    console.error("[seo-crawl] /robots.txt error:", err);
    res.status(500).type("text/plain").send("Internal error");
  }
});

export default router;
export { buildSitemapXml, buildRobotsTxt, normalizeHostForSeo };
