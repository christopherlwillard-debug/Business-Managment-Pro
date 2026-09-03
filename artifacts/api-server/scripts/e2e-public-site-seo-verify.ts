/* Public-browser verification for published website SEO metadata.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run verify:public-site-seo
 *
 * Optional environment variables:
 *   PUBLIC_SITE_BASE_URL      Public app origin for slug-site checks (defaults to local preview)
 *   SEO_E2E_SLUG              Published business slug to check
 *   SEO_E2E_CUSTOM_DOMAIN     Published custom domain to check
 *   SEO_E2E_CUSTOM_NAV_URL    Browser URL for the custom-domain check
 *
 * The browser is intentionally unauthenticated. The script only reads published
 * configurations and public document heads; it does not publish or mutate data.
 */
import { launchBrowser } from "../src/lib/launchBrowser";
import { db } from "@workspace/db";
import { businessesTable, websiteConfigsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import type { Page } from "puppeteer";

const DEFAULT_BASE_URL = "http://localhost:80";
const baseUrl = (process.env.PUBLIC_SITE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const configuredSlug = process.env.SEO_E2E_SLUG?.trim();
const configuredCustomDomain = process.env.SEO_E2E_CUSTOM_DOMAIN?.trim().toLowerCase();
const customNavigationUrl = process.env.SEO_E2E_CUSTOM_NAV_URL?.trim();

const results: { name: string; pass: boolean; detail?: string }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

type PublishedSite = {
  slug: string;
  settings: Record<string, unknown>;
};

type HeadSnapshot = {
  canonical: string | null;
  ogUrl: string | null;
  ogImage: string | null;
  twitterImage: string | null;
  jsonLd: unknown[];
  bodyText: string;
};

async function readHead(page: Page, url: string): Promise<HeadSnapshot> {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector('link[rel="canonical"]')),
    { timeout: 30_000 },
  );
  return page.evaluate(() => ({
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
    ogUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? null,
    ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? null,
    twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content ?? null,
    jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(script => {
        try {
          return JSON.parse(script.textContent ?? "");
        } catch {
          return null;
        }
      })
      .filter(Boolean),
    bodyText: document.body.innerText,
  }));
}

function configuredSeo(settings: Record<string, unknown>) {
  return (settings.seo ?? {}) as {
    ogImage?: unknown;
    localBusinessSchema?: unknown;
  };
}

async function verifySite(
  page: Page,
  site: PublishedSite,
  navigationUrl: string,
  expectedPublicUrl: string,
  label: string,
) {
  const head = await readHead(page, navigationUrl);
  const expectedCanonical = new URL(expectedPublicUrl).toString();
  const seo = configuredSeo(site.settings);
  const configuredOgImage = typeof seo.ogImage === "string" && seo.ogImage.trim() ? seo.ogImage.trim() : null;
  const configuredLocalBusiness = typeof seo.localBusinessSchema === "string" && seo.localBusinessSchema.trim()
    ? JSON.parse(seo.localBusinessSchema) as Record<string, unknown>
    : null;

  record(`${label}: public page loads without authentication`, !/sign in|log in/i.test(head.bodyText.slice(0, 500)));
  record(`${label}: canonical matches the public URL`, head.canonical === expectedCanonical, `expected=${expectedCanonical}, actual=${head.canonical}`);
  record(`${label}: og:url matches the public URL`, head.ogUrl === expectedCanonical, `expected=${expectedCanonical}, actual=${head.ogUrl}`);

  if (configuredOgImage) {
    record(`${label}: configured OG image is present`, head.ogImage === configuredOgImage, `expected=${configuredOgImage}, actual=${head.ogImage}`);
    record(`${label}: configured Twitter image is present`, head.twitterImage === configuredOgImage, `expected=${configuredOgImage}, actual=${head.twitterImage}`);
  } else {
    console.log(`SKIP: ${label}: no configured SEO OG image`);
  }

  if (configuredLocalBusiness) {
    const localBusiness = head.jsonLd.find(value =>
      value && typeof value === "object" && (value as Record<string, unknown>)["@type"] === "LocalBusiness",
    ) as Record<string, unknown> | undefined;
    record(`${label}: LocalBusiness JSON-LD is present`, Boolean(localBusiness));
    record(`${label}: LocalBusiness URL matches the configured public URL`, localBusiness?.url === expectedPublicUrl, `expected=${expectedPublicUrl}, actual=${String(localBusiness?.url ?? "")}`);
  } else {
    console.log(`SKIP: ${label}: no configured LocalBusiness JSON-LD`);
  }
}

async function findPublishedSite(slug?: string, customDomain?: string): Promise<PublishedSite | null> {
  const rows = await db
    .select({
      slug: businessesTable.slug,
      settings: websiteConfigsTable.settings,
    })
    .from(websiteConfigsTable)
    .innerJoin(businessesTable, eq(websiteConfigsTable.businessId, businessesTable.id))
    .where(and(
      eq(websiteConfigsTable.published, true),
      slug ? eq(businessesTable.slug, slug) : undefined,
    ))
    ;
  const row = customDomain
    ? rows.find(candidate => {
        const configured = String((candidate.settings as Record<string, unknown>).customDomain ?? "")
          .toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
        return configured === customDomain;
      })
    : rows[0];
  if (!row) return null;
  return { slug: row.slug, settings: row.settings as Record<string, unknown> };
}

async function findPublishedCustomDomainSite(): Promise<PublishedSite | null> {
  const rows = await db
    .select({
      slug: businessesTable.slug,
      settings: websiteConfigsTable.settings,
    })
    .from(websiteConfigsTable)
    .innerJoin(businessesTable, eq(websiteConfigsTable.businessId, businessesTable.id))
    .where(eq(websiteConfigsTable.published, true));

  const row = rows.find(candidate => {
    const customDomain = (candidate.settings as Record<string, unknown>).customDomain;
    return typeof customDomain === "string" && customDomain.trim().length > 0;
  });
  return row
    ? { slug: row.slug, settings: row.settings as Record<string, unknown> }
    : null;
}

async function main() {
  const slugSite = await findPublishedSite(configuredSlug);
  if (!slugSite) throw new Error(configuredSlug ? `Published site not found for slug "${configuredSlug}"` : "No published slug site is available");

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await verifySite(page, slugSite, `${baseUrl}/site/${slugSite.slug}`, `${baseUrl}/site/${slugSite.slug}`, `Slug site ${slugSite.slug}`);

    const customSite = configuredCustomDomain
      ? await findPublishedSite(undefined, configuredCustomDomain)
      : await findPublishedCustomDomainSite();
    if (customSite || configuredCustomDomain) {
      if (!customSite) throw new Error(`No published custom-domain site found for "${configuredCustomDomain}"`);
      const domain = String((customSite.settings.customDomain ?? configuredCustomDomain) as string)
        .replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const publicUrl = `https://${domain}/`;
      await verifySite(page, customSite, customNavigationUrl || publicUrl, publicUrl, `Custom-domain site ${domain}`);
    } else {
      console.log("SKIP: no published custom-domain site is configured");
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter(result => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});