import { Router } from "express";
import multer from "multer";
import { Readable } from "stream";
import { createHmac, createHash } from "crypto";
import OpenAI from "openai";
import { BUILDPRO_AI_MINI_MODEL } from "../ai-models";
import { db } from "@workspace/db";
import { websiteConfigsTable, websitePageViewsTable, businessesTable, prospectsTable, websiteFormSubmissionsTable, websiteMediaTable, websiteMediaFoldersTable, depositSubmissionsTable, contactsTable, savedSectionsTable } from "@workspace/db/schema";
import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";
import { wrapAsync } from "./guards";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getSuggestedImages } from "../lib/industryImageKeywords";
import { createSquarePaymentLink, isSquareConfigured } from "../lib/square";
import { sendEmail } from "../lib/sendEmail";

const objectStorageService = new ObjectStorageService();

const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const router = Router();
const publicRouter = Router();

const BASE_URL = process.env["BASE_URL"] ?? "";

function getPrefillKey(): string {
  const raw = process.env.DATABASE_URL ?? "buildpro-prefill-default-key";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function createPrefillToken(data: { name: string; email: string | null; phone: string | null }): string {
  const payload = JSON.stringify({ n: data.name, e: data.email, p: data.phone, x: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  const b64 = Buffer.from(payload).toString("base64url");
  const mac = createHmac("sha256", getPrefillKey()).update(b64).digest("hex").slice(0, 16);
  return `${b64}.${mac}`;
}

function decodePrefillToken(token: string): { name: string; email: string | null; phone: string | null } | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const b64 = token.slice(0, dotIdx);
    const mac = token.slice(dotIdx + 1);
    const expectedMac = createHmac("sha256", getPrefillKey()).update(b64).digest("hex").slice(0, 16);
    if (mac !== expectedMac) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString()) as { n: string; e: string | null; p: string | null; x: number };
    if (Date.now() > payload.x) return null;
    return { name: payload.n, email: payload.e, phone: payload.p };
  } catch {
    return null;
  }
}

function defaultSections() {
  return [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      order: 0,
      content: {
        headline: "Professional Contracting Services",
        subheadline: "Quality work, honest pricing, and results you can count on.",
        ctaLabel: "Get a Free Quote",
        bgColor: "#1a1a2e",
      },
    },
    {
      id: "services",
      type: "services",
      enabled: true,
      order: 1,
      content: {
        heading: "Our Services",
        items: [
          { id: "s1", title: "General Contracting", description: "Full-service construction and renovation for residential and commercial projects." },
          { id: "s2", title: "Site Preparation", description: "Land clearing, grading, and excavation for new builds and renovations." },
          { id: "s3", title: "Project Management", description: "End-to-end coordination to keep your project on time and on budget." },
        ],
      },
    },
    {
      id: "about",
      type: "about",
      enabled: true,
      order: 2,
      content: {
        heading: "About Us",
        body: "We are a family-owned contracting business dedicated to delivering high-quality workmanship on every project. With years of experience in the industry, we bring expertise, integrity, and attention to detail to everything we build.",
        photoUrl: "",
      },
    },
    {
      id: "contact",
      type: "contact",
      enabled: true,
      order: 3,
      content: {
        heading: "Request a Free Quote",
        subheading: "Fill out the form below and we'll be in touch within 24 hours.",
        serviceTypes: ["General Contracting", "Site Preparation", "Asphalt Sealing", "Repairs & Maintenance", "Other"],
      },
    },
    {
      id: "portfolio",
      type: "portfolio",
      enabled: true,
      order: 4,
      content: {
        heading: "Our Work",
        projects: [],
      },
    },
    {
      id: "footer",
      type: "footer",
      enabled: true,
      order: 5,
      content: {
        phone: "",
        email: "",
        licenseNumber: "",
        copyright: "",
      },
    },
    {
      id: "deposit",
      type: "deposit",
      enabled: false,
      order: 6,
      content: {
        heading: "Reserve Your Spot",
        description: "Secure your project date with a deposit. Pay online in minutes.",
        amount: 250,
        buttonLabel: "Pay Deposit Now",
      },
    },
  ];
}

function defaultSettings() {
  return {
    brandColor: "#1a1a2e",
    fontFamily: "Inter",
    logoUrl: "",
  };
}

type SectionRow = { id: string; type: string; enabled: boolean; order: number; content: Record<string, unknown> };

function normalizeSections(existing: SectionRow[]): SectionRow[] {
  const defaults = defaultSections() as SectionRow[];
  const result = existing.map(s => {
    if (s.type === "portfolio") {
      const c = s.content as any;
      if (!Array.isArray(c.projects)) {
        const legacy = Array.isArray(c.photos) ? c.photos : [];
        return {
          ...s,
          content: {
            heading: c.heading ?? "Our Work",
            projects: legacy.length > 0
              ? [{ id: "default", name: "Featured Work", description: "", photos: legacy }]
              : [],
          },
        } as SectionRow;
      }
    }
    return s;
  });
  const maxOrder = result.reduce((m, s) => Math.max(m, s.order ?? 0), -1);
  let nextOrder = maxOrder + 1;
  for (const def of defaults) {
    const alreadyPresent = result.some(s => s.type === def.type);
    if (!alreadyPresent) {
      result.push({ ...def, order: nextOrder++, enabled: def.enabled });
    }
  }
  return result;
}

// ── Business Profile Pre-fill ─────────────────────────────────────────────────
// Reads the user's existing BuildPro data and returns a flat object that the
// AI Website Wizard uses to pre-populate its form fields. Read-only; never
// writes back to any settings table.

router.get("/business-profile-prefill", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }

  // ── 1. Core business row ────────────────────────────────────────────────────
  const [biz] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) {
    return res.status(404).json({ error: "Business not found" });
  }

  // ── 2. Existing website config (sections + settings) ───────────────────────
  const [config] = await db
    .select({ sections: websiteConfigsTable.sections, settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  type SectionRow = { type: string; content: Record<string, unknown> };
  const sections = (config?.sections ?? []) as SectionRow[];
  const settings = (config?.settings ?? {}) as Record<string, unknown>;

  // ── 3. Extract from sections ───────────────────────────────────────────────
  // Services section items
  const servicesSection = sections.find(s => s.type === "services");
  const serviceItems = (servicesSection?.content?.items as Array<{ title?: string }> | undefined) ?? [];
  const services = serviceItems.map(i => i.title ?? "").filter(Boolean);

  // Service-area section
  const serviceAreaSection = sections.find(s => s.type === "service-area");
  const coverageAreas  = (serviceAreaSection?.content?.areas          as string[] | undefined) ?? [];
  const coverageStates = (serviceAreaSection?.content?.selectedStates as string[] | undefined) ?? [];

  // Footer section — social links
  const footerSection = sections.find(s => s.type === "footer");
  type SocialLink = { platform: string; url: string };
  const socialLinks = (footerSection?.content?.socialLinks as SocialLink[] | undefined) ?? [];

  // Business-hours section
  type DayHours = { day: string; open: string; close: string; closed: boolean };
  const hoursSection = sections.find(s => s.type === "business-hours");
  const workingHours = (hoursSection?.content?.hours as DayHours[] | undefined) ?? null;

  // ── 4. Brand settings ──────────────────────────────────────────────────────
  const brandColor = (settings.brandColor as string | undefined) ?? null;
  const fontFamily = (settings.fontFamily as string | undefined) ?? null;
  const themeId    = (settings.themeId    as string | undefined) ?? null;
  // Prefer website logoUrl from settings; fall back to the business row
  const logoUrl    = (settings.logoUrl as string | undefined) || biz.logoUrl || null;

  // ── 5. Build address string ────────────────────────────────────────────────
  // Assemble full address: street + city/state + zip (omit blank parts)
  const streetLine = [biz.address].filter(Boolean).join(" ");
  const cityStateZip = [biz.city, biz.state, biz.zip].filter(Boolean).join(" ");
  const addressParts = [streetLine, cityStateZip].filter(p => p.length > 0);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  // ── 6. Determine which fields were inferred (non-empty from existing data) ─
  const inferred: string[] = [];
  if (biz.name)            inferred.push("businessName");
  if (biz.phone)           inferred.push("phone");
  if (biz.email)           inferred.push("email");
  if (address)             inferred.push("address");
  if (services.length > 0) inferred.push("services");
  if (coverageAreas.length > 0 || coverageStates.length > 0) inferred.push("coverageAreas");
  if (brandColor)          inferred.push("brandColor");
  if (fontFamily)          inferred.push("fontFamily");
  if (logoUrl)             inferred.push("logoUrl");
  if (socialLinks.length > 0) {
    for (const sl of socialLinks) {
      if (sl.url) inferred.push(sl.platform);
    }
  }

  return res.json({
    businessName:   biz.name   ?? null,
    tagline:        null,
    phone:          biz.phone  ?? null,
    email:          biz.email  ?? null,
    address,
    services,
    coverageAreas,
    coverageStates,
    brandColor,
    fontFamily,
    themeId,
    logoUrl,
    socialLinks,
    workingHours,
    inferred,
  });
}));

router.get("/", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  if (!config) {
    const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
    const autofill = defaultSettings();
    if (biz?.phone) (defaultSections().find(s => s.id === "footer") as any).content.phone = biz.phone;
    const sections = defaultSections();
    if (biz) {
      const hero = sections.find(s => s.id === "hero") as any;
      hero.content.headline = `${biz.name} — Professional Services`;
      const footer = sections.find(s => s.id === "footer") as any;
      footer.content.phone = biz.phone ?? "";
      footer.content.email = biz.email ?? "";
      footer.content.licenseNumber = biz.licenseNumber ?? "";
      footer.content.copyright = `© ${new Date().getFullYear()} ${biz.name}. All rights reserved.`;
      if (biz.logoUrl) autofill.logoUrl = biz.logoUrl;
    }
    return res.json({
      id: null,
      businessId,
      sections,
      settings: autofill,
      published: false,
      publishedAt: null,
    });
  }

  const normalizedSections = normalizeSections(config.sections as SectionRow[]);
  res.json({ ...config, sections: normalizedSections });
}));

router.put("/", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }

  const { sections, settings } = req.body as { sections: unknown[]; settings: Record<string, unknown> };

  const [existing] = await db
    .select({ id: websiteConfigsTable.id })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  if (existing) {
    const [updated] = await db
      .update(websiteConfigsTable)
      .set({ sections: sections as any, settings: settings as any, updatedAt: new Date() })
      .where(eq(websiteConfigsTable.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(websiteConfigsTable)
    .values({ businessId, sections: sections as any, settings: settings as any })
    .returning();
  res.json(created);
}));

router.post("/publish", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }

  const { sections, settings } = req.body as { sections?: unknown[]; settings?: Record<string, unknown> };

  const [existing] = await db
    .select({ id: websiteConfigsTable.id })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  const now = new Date();

  if (existing) {
    const updateData: Record<string, unknown> = { published: true, publishedAt: now, updatedAt: now };
    if (sections) updateData.sections = sections;
    if (settings) updateData.settings = settings;
    const [updated] = await db
      .update(websiteConfigsTable)
      .set(updateData as any)
      .where(eq(websiteConfigsTable.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(websiteConfigsTable)
    .values({
      businessId,
      sections: (sections ?? defaultSections()) as any,
      settings: (settings ?? defaultSettings()) as any,
      published: true,
      publishedAt: now,
    })
    .returning();
  res.json(created);
}));

publicRouter.get("/:slug/logo", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const settings = config.settings as Record<string, unknown>;
  const logoObjectPath = settings.logoObjectPath as string | undefined;
  if (!logoObjectPath?.startsWith("/objects/uploads/website-logos/")) {
    return res.status(404).json({ error: "No logo" });
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(logoObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Logo not found" });
    throw err;
  }
}));

publicRouter.get("/:slug/about-photo", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ sections: websiteConfigsTable.sections })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const sections = config.sections as Array<{ id: string; type: string; content: Record<string, unknown> }>;
  const aboutSection = sections.find(s => s.type === "about");
  const photoObjectPath = aboutSection?.content?.photoObjectPath as string | undefined;
  if (!photoObjectPath?.startsWith("/objects/uploads/website-about-photos/")) {
    return res.status(404).json({ error: "No about photo" });
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(photoObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "About photo not found" });
    throw err;
  }
}));

function normalizeHost(raw: string): string {
  return raw.toLowerCase().split(":")[0].replace(/\.+$/, "").trim();
}

// ── Per-business Web App Manifests ────────────────────────────────────────────
// These endpoints let published websites have their own browser identity (name,
// icon, theme colour) so "Add to Home Screen" reflects the business, not BuildPro.
// They are intentionally public (no auth) and mounted before the /:slug catch-all.

function buildManifest(biz: { name: string; slug: string }, settings: Record<string, unknown>): Record<string, unknown> {
  const brandColor = (settings.brandColor as string | undefined) ?? "#1a1a2e";
  const logoUrl = (settings.logoUrl as string | undefined) ?? "";
  const icons: unknown[] = [];
  if (logoUrl && (logoUrl.startsWith("http") || logoUrl.startsWith("/"))) {
    icons.push({ src: logoUrl, sizes: "any", type: "image/png", purpose: "any" });
  }
  // Always include a fallback favicon-sized entry
  icons.push({ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" });

  return {
    name: biz.name,
    short_name: biz.name.slice(0, 12),
    description: `${biz.name} — official website`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: brandColor,
    background_color: brandColor,
    icons,
  };
}

publicRouter.get("/by-host/manifest.json", wrapAsync(async (req, res) => {
  const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.hostname || "";
  const host = normalizeHost(rawHost);
  if (!host) return res.status(400).json({ error: "Cannot determine host" });

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(
      and(
        eq(websiteConfigsTable.published, true),
        sql`lower(trim(trailing '.' from ${websiteConfigsTable.settings}->>'customDomain')) = ${host}`
      )
    );

  if (!config) return res.status(404).json({ error: "No site found for this domain" });

  const [biz] = await db.select({ id: businessesTable.id, name: businessesTable.name, slug: businessesTable.slug })
    .from(businessesTable)
    .where(eq(businessesTable.id, config.businessId));

  if (!biz) return res.status(404).json({ error: "Business not found" });

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(buildManifest(biz, config.settings as Record<string, unknown>));
}));

publicRouter.get("/:slug/manifest.json", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db
    .select({ id: businessesTable.id, name: businessesTable.name, slug: businessesTable.slug })
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug));

  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(and(eq(websiteConfigsTable.businessId, biz.id), eq(websiteConfigsTable.published, true)));

  if (!config) return res.status(404).json({ error: "Website not published" });

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(buildManifest(biz, config.settings as Record<string, unknown>));
}));

publicRouter.get("/by-host", wrapAsync(async (req, res) => {
  const rawHost = (req.headers["x-forwarded-host"] as string | undefined) || req.hostname || "";
  const host = normalizeHost(rawHost);
  if (!host) return res.status(400).json({ error: "Cannot determine host" });

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(
      and(
        eq(websiteConfigsTable.published, true),
        sql`lower(trim(trailing '.' from ${websiteConfigsTable.settings}->>'customDomain')) = ${host}`
      )
    );

  if (!config) return res.status(404).json({ error: "No site found for this domain" });

  const [biz] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, config.businessId));

  if (!biz) return res.status(404).json({ error: "Business not found" });

  res.json({ ...config, businessName: biz.name, businessSlug: biz.slug });
}));

publicRouter.get("/:slug", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(and(eq(websiteConfigsTable.businessId, biz.id), eq(websiteConfigsTable.published, true)));

  if (!config) return res.status(404).json({ error: "Website not published" });

  res.json({ ...config, businessName: biz.name, businessSlug: biz.slug });
}));

publicRouter.post("/:slug/view", (req, res) => {
  const slug = req.params.slug as string;
  const ua = req.headers["user-agent"] ?? "";
  const deviceType = /Mobile|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";

  res.status(204).send();

  db.select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug as string))
    .then(([biz]) => {
      if (biz) {
        return db.insert(websitePageViewsTable).values({ businessId: biz.id, deviceType });
      }
    })
    .catch(() => {});
});

publicRouter.post("/:slug/contact", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db.select({ id: businessesTable.id, slug: businessesTable.slug }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const { name, phone, email, serviceType, message, fieldValues, labeledFields } = req.body as {
    name?: string; phone?: string; email?: string; serviceType?: string; message?: string;
    fieldValues?: Record<string, string>;
    labeledFields?: Record<string, string>;
  };

  const normName = name ?? fieldValues?.name;
  const normPhone = phone ?? fieldValues?.phone;
  const normEmail = email ?? fieldValues?.email;
  const normServiceType = serviceType ?? fieldValues?.serviceType;
  const normMessage = message ?? fieldValues?.message;

  const submissionFields: Record<string, string> =
    labeledFields && Object.keys(labeledFields).length > 0
      ? labeledFields
      : Object.fromEntries(
          ([
            normName ? ["Full Name", normName] : null,
            normPhone ? ["Phone", normPhone] : null,
            normEmail ? ["Email", normEmail] : null,
            normServiceType ? ["Service", normServiceType] : null,
            normMessage ? ["Message", normMessage] : null,
          ] as Array<[string, string] | null>).filter(Boolean) as [string, string][]
        );

  if (Object.keys(submissionFields).length === 0) {
    return res.status(400).json({ error: "At least one contact field is required" });
  }

  await db.insert(websiteFormSubmissionsTable).values({
    businessId: biz.id,
    siteSlug: slug,
    fields: submissionFields as Record<string, unknown>,
  });

  const notes = [
    normServiceType ? `Service: ${normServiceType}` : null,
    normMessage ? `Message: ${normMessage}` : null,
  ].filter(Boolean).join("\n");

  const [prospect] = await db
    .insert(prospectsTable)
    .values({
      address: "Website Lead",
      contactName: normName ?? null,
      contactPhone: normPhone ?? null,
      contactEmail: normEmail ?? null,
      notes: notes || null,
      status: "cold",
      source: "website",
      businessLine: biz.slug,
    })
    .returning({ id: prospectsTable.id });

  try {
    const [config] = await db
      .select({ sections: websiteConfigsTable.sections })
      .from(websiteConfigsTable)
      .where(eq(websiteConfigsTable.businessId, biz.id));
    const sections = (config?.sections ?? []) as Array<{ type: string; content: Record<string, unknown> }>;
    const contactSection = sections.find(s => s.type === "contact");
    const notifEmail = contactSection?.content?.notificationEmail as string | undefined;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (notifEmail && EMAIL_RE.test(notifEmail)) {
      const rows = Object.entries(submissionFields)
        .map(([k, v]) => `<tr><td style="padding:6px 10px;font-weight:600;color:#374151;border-bottom:1px solid #f3f4f6;">${k}</td><td style="padding:6px 10px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${v}</td></tr>`)
        .join("");
      await sendEmail({
        to: notifEmail,
        subject: `New Form Submission — ${slug}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#1a1a2e;margin-bottom:4px;">New Contact Form Submission</h2>
          <p style="color:#6b7280;font-size:14px;margin-bottom:16px;">Someone filled out your website contact form.</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${rows}</table>
        </div>`,
      });
    }
  } catch {
    // Email errors must not fail the submission
  }

  res.json({ success: true, prospectId: prospect.id });
}));

publicRouter.post("/:slug/create-deposit-link", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;

  if (!isSquareConfigured()) {
    return res.status(400).json({ error: "Payments are not configured for this site." });
  }

  const [biz] = await db
    .select({ id: businessesTable.id, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ sections: websiteConfigsTable.sections })
    .from(websiteConfigsTable)
    .where(and(eq(websiteConfigsTable.businessId, biz.id), eq(websiteConfigsTable.published, true)));
  if (!config) return res.status(404).json({ error: "Website not published" });

  const sections = config.sections as Array<{ type: string; enabled: boolean; content: Record<string, unknown> }>;
  const depositSection = sections.find(s => s.type === "deposit" && s.enabled);
  if (!depositSection) return res.status(404).json({ error: "Deposit section not found or not enabled" });

  const configuredAmount = parseFloat(String(depositSection.content.amount ?? 0));
  if (!configuredAmount || configuredAmount <= 0) return res.status(400).json({ error: "Deposit amount is not configured" });

  const allowCustomAmount = !!(depositSection.content.allowCustomAmount);

  const heading = (depositSection.content.heading as string) || "Deposit";

  const { returnUrl, customAmount } = req.body as { returnUrl?: string; customAmount?: number };

  let amount = configuredAmount;
  if (customAmount !== undefined) {
    if (!allowCustomAmount) {
      return res.status(400).json({ error: "Custom amount is not allowed for this deposit." });
    }
    const parsed = parseFloat(String(customAmount));
    if (isNaN(parsed) || parsed <= 0) {
      return res.status(400).json({ error: "Invalid custom amount." });
    }
    if (parsed < configuredAmount) {
      return res.status(400).json({ error: `Custom amount must be at least $${configuredAmount.toFixed(2)}.` });
    }
    amount = parsed;
  }

  const amountCents = Math.round(amount * 100);

  let redirectUrl: string | undefined;
  if (returnUrl) {
    try {
      const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() ?? req.protocol ?? "https";
      const host = ((req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "").split(",")[0].trim();
      const requestOrigin = `${proto}://${host}`.toLowerCase();
      const parsed = new URL(returnUrl);
      if (parsed.origin.toLowerCase() === requestOrigin) {
        redirectUrl = `${parsed.origin}${parsed.pathname}?payment=success`;
      }
    } catch {
      // Invalid or mismatched URL — no redirect
    }
  }

  const { url } = await createSquarePaymentLink({
    amountCents,
    currency: "USD",
    productName: `${biz.name}: ${heading}`,
    referenceId: `website_deposit_${slug}`,
    redirectUrl,
  });

  res.json({ checkoutUrl: url });
}));

publicRouter.post("/:slug/deposit-submit", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;

  if (!isSquareConfigured()) {
    return res.status(400).json({ error: "Payments are not configured for this site." });
  }

  const { customerName, customerEmail, customerPhone, customerNotes, customAmount, returnUrl } = req.body as {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerNotes?: string;
    customAmount?: number;
    returnUrl?: string;
  };

  const [biz] = await db
    .select({ id: businessesTable.id, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ id: websiteConfigsTable.id, sections: websiteConfigsTable.sections })
    .from(websiteConfigsTable)
    .where(and(eq(websiteConfigsTable.businessId, biz.id), eq(websiteConfigsTable.published, true)));
  if (!config) return res.status(404).json({ error: "Website not published" });

  const sections = config.sections as Array<{ type: string; enabled: boolean; content: Record<string, unknown> }>;
  const depositSection = sections.find(s => s.type === "deposit" && s.enabled);
  if (!depositSection) return res.status(404).json({ error: "Deposit section not found or not enabled" });

  const configuredAmount = parseFloat(String(depositSection.content.amount ?? 0));
  if (!configuredAmount || configuredAmount <= 0) return res.status(400).json({ error: "Deposit amount is not configured" });

  const allowCustomAmount = !!(depositSection.content.allowCustomAmount);
  const heading = (depositSection.content.heading as string) || "Deposit";

  type FieldCfg = { show?: boolean; required?: boolean };
  const fName  = (depositSection.content.fieldName  as FieldCfg | undefined) ?? { show: true,  required: true };
  const fEmail = (depositSection.content.fieldEmail as FieldCfg | undefined) ?? { show: true,  required: true };
  const fPhone = (depositSection.content.fieldPhone as FieldCfg | undefined) ?? { show: false, required: false };
  const fNotes = (depositSection.content.fieldNotes as FieldCfg | undefined) ?? { show: false, required: false };

  if (fName.show !== false && fName.required !== false && !customerName?.trim()) {
    return res.status(400).json({ error: "Name is required." });
  }
  if (fEmail.show !== false && fEmail.required !== false) {
    if (!customerEmail?.trim()) return res.status(400).json({ error: "Email is required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
  } else if (customerEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (fPhone.show !== false && fPhone.required !== false && !customerPhone?.trim()) {
    return res.status(400).json({ error: "Phone number is required." });
  }
  if (fNotes.show !== false && fNotes.required !== false && !customerNotes?.trim()) {
    return res.status(400).json({ error: "Notes are required." });
  }

  let amount = configuredAmount;
  if (customAmount !== undefined) {
    if (!allowCustomAmount) return res.status(400).json({ error: "Custom amount is not allowed." });
    const parsed = parseFloat(String(customAmount));
    if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ error: "Invalid custom amount." });
    if (parsed < configuredAmount) return res.status(400).json({ error: `Minimum deposit is $${configuredAmount.toFixed(2)}.` });
    amount = parsed;
  }

  const amountCents = Math.round(amount * 100);

  let redirectUrl: string | undefined;
  if (returnUrl) {
    try {
      const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() ?? req.protocol ?? "https";
      const host = ((req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "").split(",")[0].trim();
      const requestOrigin = `${proto}://${host}`.toLowerCase();
      const parsed = new URL(returnUrl);
      if (parsed.origin.toLowerCase() === requestOrigin) {
        redirectUrl = `${parsed.origin}${parsed.pathname}?payment=success`;
      }
    } catch {
      // Invalid or mismatched URL — no redirect
    }
  }

  const [submission] = await db.insert(depositSubmissionsTable).values({
    businessId: biz.id,
    siteConfigId: config.id,
    customerName: customerName?.trim() || "",
    customerEmail: customerEmail?.trim().toLowerCase() || "",
    customerPhone: customerPhone?.trim() || null,
    customerNotes: customerNotes?.trim() || null,
    amount: String(amount),
    paymentStatus: "pending",
  }).returning();

  const { url, id: checkoutId } = await createSquarePaymentLink({
    amountCents,
    currency: "USD",
    productName: `${biz.name}: ${heading}`,
    referenceId: `website_deposit_${slug}_${submission.id}`,
    customerEmail: customerEmail?.trim() || undefined,
    redirectUrl,
  });

  await db.update(depositSubmissionsTable)
    .set({ squareCheckoutId: checkoutId, squareCheckoutUrl: url })
    .where(eq(depositSubmissionsTable.id, submission.id));

  res.json({ checkoutUrl: url });
}));

publicRouter.get("/:slug/contact-prefill", wrapAsync(async (req, res) => {
  const { token } = req.query;
  if (typeof token !== "string" || !token) {
    return res.status(400).json({ error: "token required" });
  }
  const data = decodePrefillToken(token);
  if (!data) return res.status(400).json({ error: "Invalid or expired prefill token" });
  res.json(data);
}));

router.get("/contact-prefill-token", wrapAsync(async (req, res) => {
  const contactId = parseInt(req.query.contactId as string);
  if (!contactId || isNaN(contactId)) return res.status(400).json({ error: "contactId required" });
  const [contact] = await db
    .select({ name: contactsTable.name, email: contactsTable.email, phone: contactsTable.phone })
    .from(contactsTable)
    .where(eq(contactsTable.id, contactId));
  if (!contact) return res.status(404).json({ error: "Contact not found" });
  const token = createPrefillToken({ name: contact.name, email: contact.email ?? null, phone: contact.phone ?? null });
  res.json({ token });
}));

router.get("/deposit-submissions", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }
  const subs = await db
    .select()
    .from(depositSubmissionsTable)
    .where(eq(depositSubmissionsTable.businessId, businessId))
    .orderBy(desc(depositSubmissionsTable.createdAt))
    .limit(50);
  res.json(subs);
}));

router.get("/form-submissions", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }
  const subs = await db
    .select()
    .from(websiteFormSubmissionsTable)
    .where(eq(websiteFormSubmissionsTable.businessId, businessId))
    .orderBy(desc(websiteFormSubmissionsTable.submittedAt))
    .limit(20);
  res.json(subs);
}));

router.get("/analytics", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }

  const now = new Date();
  const ago7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ago28 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(websitePageViewsTable)
    .where(eq(websitePageViewsTable.businessId, businessId));

  const [week7Row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(websitePageViewsTable)
    .where(and(eq(websitePageViewsTable.businessId, businessId), gte(websitePageViewsTable.viewedAt, ago7)));

  const [month30Row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(websitePageViewsTable)
    .where(and(eq(websitePageViewsTable.businessId, businessId), gte(websitePageViewsTable.viewedAt, ago30)));

  const dailyRows = await db
    .select({
      date: sql<string>`date(${websitePageViewsTable.viewedAt})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(websitePageViewsTable)
    .where(and(eq(websitePageViewsTable.businessId, businessId), gte(websitePageViewsTable.viewedAt, ago28)))
    .groupBy(sql`date(${websitePageViewsTable.viewedAt})`)
    .orderBy(sql`date(${websitePageViewsTable.viewedAt})`);

  const dailyMap: Record<string, number> = {};
  dailyRows.forEach(r => { dailyMap[r.date] = r.count; });

  const daily: Array<{ date: string; views: number }> = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    daily.push({ date: dateStr, views: dailyMap[dateStr] ?? 0 });
  }

  res.json({
    total: totalRow?.count ?? 0,
    last7days: week7Row?.count ?? 0,
    last30days: month30Row?.count ?? 0,
    daily,
  });
}));

// ── AI Copywriter (Phase 5 M4) ────────────────────────────────────────────────

/** Shared BusinessContext type (mirrors frontend website-types.ts — keep in sync). */
interface BusinessContext {
  businessName: string;
  businessType?: string;
  location?: string;
  phone?: string;
  email?: string;
  services?: string[];
  yearsInBusiness?: number;
  isVeteranOwned?: boolean;
  ownerName?: string;
  tagline?: string;
  serviceArea?: string;
  trustSignals?: string[];
  serviceKeywords?: string[];
}

/** One-sentence business summary injected into every copy prompt. */
function bizSummary(ctx: BusinessContext): string {
  const parts: string[] = [`${ctx.businessName}`];
  if (ctx.businessType) parts.push(`a ${ctx.businessType} contractor`);
  if (ctx.location)     parts.push(`based in ${ctx.location}`);
  if (ctx.services?.length) parts.push(`specializing in ${ctx.services.slice(0, 4).join(", ")}`);
  return parts.join(", ") + ".";
}

const COPY_SYSTEM_PROMPT = `You are a professional copywriter for contractor and trade business websites.
Write clear, confident, trustworthy copy that appeals to homeowners and property managers.
Rules: Be concise and direct. No fluff. No hype words like "premier", "unparalleled", or "world-class".
Include the business name, location, and trade naturally where it adds value.
Return ONLY the copy text, no quotes, no explanation, no markdown.`;

/**
 * POST /generate-copy
 *
 * Two modes:
 *   1. Legacy: { prompt: string } — free-form prompt, returns { result }
 *   2. Structured: { field, businessContext, currentText? } — returns { result }
 */
router.post("/generate-copy", wrapAsync(async (req, res) => {
  const body = req.body as {
    prompt?: string;
    field?: string;
    businessContext?: BusinessContext;
    currentText?: string;
  };

  let userPrompt: string;

  if (body.businessContext && body.field) {
    // Structured mode — targeted, context-aware copy for a specific field
    const ctx = body.businessContext;
    const summary = bizSummary(ctx);
    const currentHint = body.currentText
      ? `\n\nExisting text to improve or replace:\n"${body.currentText.slice(0, 300)}"`
      : "";
    const trust = ctx.trustSignals?.length ? `\nTrust signals: ${ctx.trustSignals.join(", ")}.` : "";
    const area = ctx.serviceArea ? `\nService area: ${ctx.serviceArea}.` : "";

    switch (body.field) {
      case "hero-headline":
        userPrompt = `Write a hero headline (8–12 words) for: ${summary}${area}${trust}
Make it specific to their trade and location. Lead with the service or a key benefit, not the company name.${currentHint}`;
        break;
      case "hero-subheadline":
        userPrompt = `Write a hero subheading (1–2 sentences, 20–35 words) for: ${summary}${area}
Expand on the headline — mention licensed/insured, free estimates, or response time if relevant.${currentHint}`;
        break;
      case "cta-label":
        userPrompt = `Write a CTA button label (3–6 words) for a ${ctx.businessType ?? "contractor"} website. Be action-oriented. Examples: "Get a Free Estimate", "Schedule Service Today", "Call for Emergency Help".${currentHint}`;
        break;
      case "section-heading":
        userPrompt = `Write a section heading (3–7 words) for: ${summary}${currentHint}`;
        break;
      case "section-subheading":
        userPrompt = `Write a section subheading (1–2 sentences) for: ${summary}${currentHint}`;
        break;
      case "service-description":
        userPrompt = `Write a service description (2–3 sentences) for a "${body.currentText ?? "service"}" offered by: ${summary}
Focus on what the customer gets — not features, but outcomes and peace of mind.${currentHint}`;
        break;
      case "about-body":
        userPrompt = `Write an About Us paragraph (4–6 sentences) for: ${summary}${area}
${ctx.yearsInBusiness ? `In business for ${ctx.yearsInBusiness} years.` : ""}
${ctx.isVeteranOwned ? "Veteran-owned business." : ""}
${ctx.ownerName ? `Founded by ${ctx.ownerName}.` : ""}
Be authentic, warm, and trust-building. Mention community, reliability, and pride in workmanship.${currentHint}`;
        break;
      case "faq-answer":
        userPrompt = `Write a concise FAQ answer (2–4 sentences) for a ${ctx.businessType ?? "contractor"} business. Business: ${summary}
Question: "${body.currentText ?? "question"}"
Be direct and reassuring. Address common customer concerns.`;
        break;
      default:
        userPrompt = `Write copy for a "${body.field ?? "text"}" field on a contractor website. Business: ${summary}${currentHint}`;
    }
  } else if (body.prompt?.trim()) {
    // Legacy free-form prompt mode
    userPrompt = body.prompt.trim();
  } else {
    return res.status(400).json({ error: "prompt or (field + businessContext) is required" });
  }

  const completion = await openai.chat.completions.create({
    model: BUILDPRO_AI_MINI_MODEL,
    max_completion_tokens: 400,
    messages: [
      { role: "system", content: COPY_SYSTEM_PROMPT },
      { role: "user",   content: userPrompt },
    ],
  });

  const result = completion.choices[0]?.message?.content?.trim() ?? "";
  res.json({ result });
}));

// ── generate-site-copy: batch copy for all sections ───────────────────────────

type SectionForCopy = { id: string; type: string; content: Record<string, unknown> };

/** Build a targeted OpenAI call for each section type, returns partial content to merge. */
async function generateSectionCopy(
  section: SectionForCopy,
  ctx: BusinessContext,
): Promise<Record<string, unknown> | null> {
  const summary = bizSummary(ctx);
  const trust = ctx.trustSignals?.length ? `Trust signals: ${ctx.trustSignals.join(", ")}. ` : "";
  const area  = ctx.serviceArea ? `Service area: ${ctx.serviceArea}. ` : "";
  const sys   = COPY_SYSTEM_PROMPT;

  // Per-type schema + prompt pairs
  let prompt: string;
  let schema: Record<string, unknown>;

  switch (section.type) {
    case "hero": {
      prompt = `Write hero section copy for: ${summary}${area}${trust}
Return JSON with: headline (8-12 words, trade + location specific, not starting with business name), subheadline (20-35 words, benefit-focused), ctaLabel (3-6 words, action-oriented).`;
      schema = {
        name: "hero_copy", strict: true,
        schema: { type: "object", properties: { headline: { type: "string" }, subheadline: { type: "string" }, ctaLabel: { type: "string" } }, required: ["headline", "subheadline", "ctaLabel"], additionalProperties: false },
      };
      break;
    }
    case "services": {
      const items = (section.content.items as Array<{ title?: string }> | undefined) ?? [];
      const titles = items.map((it, i) => it.title ?? `Service ${i + 1}`);
      prompt = `Write services section copy for: ${summary}
Return JSON with: heading (4-7 words), subheading (1-2 sentences), items (array of {title, description} — one per service).
Services to describe: ${JSON.stringify(titles)}
Each description: 2-3 sentences, outcome-focused, no generic filler.`;
      schema = {
        name: "services_copy", strict: true,
        schema: {
          type: "object",
          properties: {
            heading:    { type: "string" },
            subheading: { type: "string" },
            items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"], additionalProperties: false } },
          },
          required: ["heading", "subheading", "items"], additionalProperties: false,
        },
      };
      break;
    }
    case "about": {
      prompt = `Write an About Us section for: ${summary}${area}
${ctx.yearsInBusiness ? `In business ${ctx.yearsInBusiness}+ years. ` : ""}${ctx.isVeteranOwned ? "Veteran-owned. " : ""}${ctx.ownerName ? `Founded by ${ctx.ownerName}. ` : ""}
Return JSON with: heading (3-5 words), body (4-6 sentences, authentic and trust-building, mention community and reliability).`;
      schema = {
        name: "about_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"], additionalProperties: false },
      };
      break;
    }
    case "stats": {
      prompt = `Write a stats section heading (5-8 words) for: ${summary}${trust}
The heading introduces trust-building numbers. Return JSON with: heading.`;
      schema = {
        name: "stats_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" } }, required: ["heading"], additionalProperties: false },
      };
      break;
    }
    case "testimonials": {
      prompt = `Write testimonials section intro for: ${summary}
Return JSON with: heading (5-8 words), subheading (1-2 sentences about customer satisfaction).`;
      schema = {
        name: "testimonials_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" }, subheading: { type: "string" } }, required: ["heading", "subheading"], additionalProperties: false },
      };
      break;
    }
    case "cta": {
      prompt = `Write a CTA section for: ${summary}${trust}
Return JSON with: heading (6-10 words, action-driven), subheading (1-2 sentences, remove hesitation), primaryLabel (3-6 words), secondaryLabel (3-6 words).`;
      schema = {
        name: "cta_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" }, subheading: { type: "string" }, primaryLabel: { type: "string" }, secondaryLabel: { type: "string" } }, required: ["heading", "subheading", "primaryLabel", "secondaryLabel"], additionalProperties: false },
      };
      break;
    }
    case "contact": {
      prompt = `Write a contact section for: ${summary}
Return JSON with: heading (3-6 words), subheading (1-2 sentences, set expectation for response time).`;
      schema = {
        name: "contact_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" }, subheading: { type: "string" } }, required: ["heading", "subheading"], additionalProperties: false },
      };
      break;
    }
    case "faq": {
      const bizType = ctx.businessType ?? "contractor";
      prompt = `Write 6 FAQ questions and answers for: ${summary}${area}
Questions should cover: pricing/quotes, licensing/insurance, scheduling, project timeline, payment, and a ${bizType}-specific concern.
Return JSON with: heading (3-5 words), items (array of {question, answer} — answer is 2-4 sentences each).`;
      schema = {
        name: "faq_copy", strict: true,
        schema: {
          type: "object",
          properties: {
            heading: { type: "string" },
            items: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } }, required: ["question", "answer"], additionalProperties: false } },
          },
          required: ["heading", "items"], additionalProperties: false,
        },
      };
      break;
    }
    case "process": {
      const steps = (section.content.steps as Array<{ title?: string }> | undefined) ?? [];
      const stepCount = steps.length || 4;
      prompt = `Write process steps for: ${summary}
Return JSON with: heading (3-6 words), subheading (1 sentence), steps (${stepCount} items, each {title (2-4 words), description (1-2 sentences)}).
Steps should walk a customer from first contact to project completion.`;
      schema = {
        name: "process_copy", strict: true,
        schema: {
          type: "object",
          properties: {
            heading:    { type: "string" },
            subheading: { type: "string" },
            steps: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"], additionalProperties: false } },
          },
          required: ["heading", "subheading", "steps"], additionalProperties: false,
        },
      };
      break;
    }
    case "alert-bar": {
      prompt = `Write a short, urgent alert bar message (8-14 words) for: ${summary}
${trust}Examples: "Emergency available 24/7 — call now!", "Storm damage? Free inspections available today."
Return JSON with: message.`;
      schema = {
        name: "alert_bar_copy", strict: true,
        schema: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false },
      };
      break;
    }
    case "why-choose-us": {
      prompt = `Write "Why Choose Us" section for: ${summary}${trust}
Return JSON with: heading (3-6 words), items (4 items, each {title (3-5 words), description (2-3 sentences)}).
Items should highlight: free estimates, licensing, quality guarantee, communication.`;
      schema = {
        name: "why_choose_us_copy", strict: true,
        schema: {
          type: "object",
          properties: {
            heading: { type: "string" },
            items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"], additionalProperties: false } },
          },
          required: ["heading", "items"], additionalProperties: false,
        },
      };
      break;
    }
    case "meet-owner": {
      prompt = `Write a Meet the Owner bio for: ${summary}${area}
${ctx.ownerName ? `Owner: ${ctx.ownerName}. ` : ""}${ctx.yearsInBusiness ? `${ctx.yearsInBusiness}+ years experience. ` : ""}${ctx.isVeteranOwned ? "Veteran-owned business. " : ""}
Return JSON with: heading (3-5 words), bio (4-5 sentences, personal, honest, community-focused).`;
      schema = {
        name: "meet_owner_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" }, bio: { type: "string" } }, required: ["heading", "bio"], additionalProperties: false },
      };
      break;
    }
    case "trust-counter": {
      prompt = `Write a trust counter section heading (5-8 words) for: ${summary}${trust}
Return JSON with: heading.`;
      schema = {
        name: "trust_counter_copy", strict: true,
        schema: { type: "object", properties: { heading: { type: "string" } }, required: ["heading"], additionalProperties: false },
      };
      break;
    }
    default:
      return null; // section type has no text to generate
  }

  try {
    const completion = await openai.chat.completions.create({
      model: BUILDPRO_AI_MINI_MODEL,
      max_completion_tokens: 800,
      response_format: { type: "json_schema", json_schema: schema as any },
      messages: [
        { role: "system", content: sys },
        { role: "user",   content: prompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * POST /generate-site-copy
 *
 * Takes the section skeleton from generate-full-site (M3) + a businessContext,
 * generates copy for all text-bearing sections in parallel, and returns the
 * sections with copy injected.
 *
 * Called by the AI Website Wizard (M1) and the AI Website Generator (M20)
 * after building the industry skeleton.
 *
 * Body: { sections, businessContext }
 * Response: { sections }
 */
router.post("/generate-site-copy", wrapAsync(async (req, res) => {
  const { sections, businessContext } = req.body as {
    sections?: SectionForCopy[];
    businessContext?: BusinessContext;
  };

  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "sections array is required" });
  }
  if (!businessContext?.businessName) {
    return res.status(400).json({ error: "businessContext.businessName is required" });
  }

  // Generate copy for all sections in parallel
  const results = await Promise.allSettled(
    sections.map(s => generateSectionCopy(s, businessContext)),
  );

  // Merge generated copy back into sections immutably
  const enriched = sections.map((section, i) => {
    const outcome = results[i];
    if (outcome?.status !== "fulfilled" || !outcome.value) return section;

    const copy = outcome.value;

    // For services, merge item descriptions into existing items (preserve IDs)
    if (section.type === "services" && Array.isArray(copy.items)) {
      const existingItems = (section.content.items as Array<Record<string, unknown>> | undefined) ?? [];
      const copyItems = copy.items as Array<{ title: string; description: string }>;
      const mergedItems = existingItems.map((item, idx) => ({
        ...item,
        title:       copyItems[idx]?.title       ?? item.title,
        description: copyItems[idx]?.description ?? item.description,
      }));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items: _items, ...restCopy } = copy;
      return { ...section, content: { ...section.content, ...restCopy, items: mergedItems } };
    }

    // For process, merge step descriptions into existing steps (preserve icons + IDs)
    if (section.type === "process" && Array.isArray(copy.steps)) {
      const existingSteps = (section.content.steps as Array<Record<string, unknown>> | undefined) ?? [];
      const copySteps = copy.steps as Array<{ title: string; description: string }>;
      const mergedSteps = existingSteps.map((step, idx) => ({
        ...step,
        title:       copySteps[idx]?.title       ?? step.title,
        description: copySteps[idx]?.description ?? step.description,
      }));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { steps: _steps, ...restCopy } = copy;
      return { ...section, content: { ...section.content, ...restCopy, steps: mergedSteps } };
    }

    // For faq, merge question/answer pairs (preserve IDs if present)
    if (section.type === "faq" && Array.isArray(copy.items)) {
      const copyItems = copy.items as Array<{ question: string; answer: string }>;
      const faqItems = copyItems.map((q, idx) => ({ id: `faq-${idx + 1}`, ...q }));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items: _items, ...restCopy } = copy;
      return { ...section, content: { ...section.content, ...restCopy, items: faqItems } };
    }

    // For why-choose-us, merge items similarly
    if (section.type === "why-choose-us" && Array.isArray(copy.items)) {
      const existingItems = (section.content.items as Array<Record<string, unknown>> | undefined) ?? [];
      const copyItems = copy.items as Array<{ title: string; description: string }>;
      const mergedItems = copyItems.map((item, idx) => ({
        id: (existingItems[idx] as any)?.id ?? `why-${idx + 1}`,
        icon: (existingItems[idx] as any)?.icon ?? "✓",
        ...item,
      }));
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { items: _items, ...restCopy } = copy;
      return { ...section, content: { ...section.content, ...restCopy, items: mergedItems } };
    }

    // For meet-owner, map bio → bio (content field name)
    if (section.type === "meet-owner") {
      const { bio, ...restCopy } = copy;
      return { ...section, content: { ...section.content, ...restCopy, ...(bio ? { bio } : {}) } };
    }

    // Default: shallow merge copy into content
    return { ...section, content: { ...section.content, ...copy } };
  });

  res.json({ sections: enriched });
}));

// ── AI Layout Assistant ────────────────────────────────────────────────────────

import { condenseSectionsForAI } from "../lib/layoutSuggestion";

const LAYOUT_SUGGESTION_SCHEMA = {
  name: "layout_suggestions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id:                  { type: "string" },
            category:            { type: "string", enum: ["Hero", "Services", "Gallery", "Footer", "Trust Signals", "Structure"] },
            label:               { type: "string" },
            description:         { type: "string" },
            sectionId:           { type: "string" },
            contentPatch:        { type: "object", additionalProperties: true },
            blockStylePatch:     { type: "object", additionalProperties: true },
            moveBeforeSectionId: { type: "string" },
          },
          required: ["id", "category", "label", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  },
};

router.post("/suggest-layout", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "businessId required" });
  }

  const { sections, businessName } = req.body as { sections?: any[]; businessName?: string };
  if (!Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({ error: "sections array required" });
  }

  const condensed = condenseSectionsForAI(sections);

  const completion = await openai.chat.completions.create({
    model: BUILDPRO_AI_MINI_MODEL,
    max_completion_tokens: 1200,
    response_format: { type: "json_schema", json_schema: LAYOUT_SUGGESTION_SCHEMA },
    messages: [
      {
        role: "system",
        content: `You are an expert contractor website layout consultant. Analyze the section tree and return actionable layout improvements. Focus ONLY on layout, structure, ordering, and numeric configuration — never text content, colors, or fonts.

Valid contentPatch keys by section type (use ONLY these exact keys and allowed values):
- hero: layout ("centered"|"split"|"minimal"), trustBar {"enabled":true} to enable the trust strip below the hero, secondaryCta {"enabled":true} to enable a secondary CTA button
  → For hero height: use blockStylePatch {"minHeight": <number 60-100>} — NOT contentPatch
- services: columns (1|2|3|4), layout ("cards"|"icon_row"|"feature_grid"), hoverLift (true|false)
- gallery: columns (2|3|4), aspectRatio ("square"|"video"|"auto")
- service-area: displayMode ("map"|"list"|"both"|"selected_only")
- stats: columns (2|3|4)
- For section reordering: set moveBeforeSectionId to move sectionId directly before that target section

Important: trustBar and secondaryCta patches are deep-merged with existing values, so {"trustBar":{"enabled":true}} safely enables the feature without wiping any existing items the user has configured.

Rules:
- sectionId must exactly match a real id from the input sections list
- moveBeforeSectionId must exactly match a real id from the input sections list
- Suggest 3–7 focused, actionable improvements
- Prioritize: poor section ordering (contact form near the top, trust signals after the footer), services section with only 1–2 columns when 5+ services exist, hero with no background image, no testimonials/stats/certifications sections present
- Each description must be exactly one sentence explaining the specific benefit to the contractor`,
      },
      {
        role: "user",
        content: `Business: ${businessName ?? "a contractor business"}\n\nSections (sorted by order):\n${JSON.stringify(condensed, null, 2)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { suggestions: unknown[] };
    res.json({ suggestions: parsed.suggestions ?? [] });
  } catch {
    res.json({ suggestions: [] });
  }
}));

router.post("/upload-logo", wrapAsync(async (req, res) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-logos");
  res.json({ uploadURL, objectPath });
}));

router.post("/upload-about-photo", wrapAsync(async (req, res) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-about-photos");
  res.json({ uploadURL, objectPath });
}));

router.post("/upload-portfolio-photo", wrapAsync(async (req, res) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-portfolio-photos");
  res.json({ uploadURL, objectPath });
}));

// ── Industry Intelligence (Phase 5 M3) ────────────────────────────────────────

import { INDUSTRY_PROFILES, FALLBACK_PROFILE, matchIndustryProfile, buildIndustrySections } from "../lib/industryProfiles";

/** Returns the full registry as a lightweight list for the wizard UI. */
router.get("/industry-profiles", wrapAsync(async (_req, res) => {
  res.json({
    profiles: INDUSTRY_PROFILES.map(p => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      tagline: p.tagline,
      aliases: p.aliases,
      trustSignals: p.trustSignals,
      serviceKeywords: p.serviceKeywords,
      sectionCount: p.sections.filter(s => s.priority !== "optional").length,
    })),
    fallbackId: FALLBACK_PROFILE.id,
  });
}));

/**
 * POST /generate-full-site
 * Returns an industry-appropriate section skeleton for a new website.
 * M1 (AI Website Wizard) calls this to get the page structure, then uses
 * OpenAI to replace placeholder copy with industry-tailored content.
 *
 * Body: { businessType, businessName?, phone?, email?, includeOptional? }
 * Response: { profile, sections, settings }
 */
router.post("/generate-full-site", wrapAsync(async (req, res) => {
  const { businessType, businessName, phone, email, includeOptional } = req.body as {
    businessType?: string;
    businessName?: string;
    phone?: string;
    email?: string;
    includeOptional?: boolean;
  };

  const profile = matchIndustryProfile(businessType ?? "");
  const biz = { name: businessName, phone, email };
  const sections = buildIndustrySections(profile, biz, includeOptional ?? false);

  res.json({
    profile: {
      id: profile.id,
      name: profile.name,
      emoji: profile.emoji,
      tagline: profile.tagline,
      aiDescription: profile.aiDescription,
      trustSignals: profile.trustSignals,
      serviceKeywords: profile.serviceKeywords,
    },
    sections,
    settings: {
      brandColor: "#1a1a2e",
      fontFamily: "Inter",
      logoUrl: "",
    },
  });
}));

// ── AI Color Assistant (Phase 5 M7) ──────────────────────────────────────────

import { extractDominantColors } from "../lib/colorExtraction";
import { generateColorPalettes } from "../lib/colorPalette";

/**
 * POST /api/website/suggest-colors
 *
 * Extracts dominant colors from the business logo (or falls back to a
 * user-supplied base color) and returns 4 named ThemeOverrides suggestions.
 *
 * Body (at least one of the three required):
 *   businessId?:  number  — if set, server fetches the logo from object storage
 *   logoUrl?:     string  — public http/https URL to fetch directly
 *   baseColor?:   string  — hex color used when no logo is available
 */
router.post("/suggest-colors", wrapAsync(async (req, res) => {
  const { businessId, logoUrl, baseColor } = req.body as {
    businessId?: number;
    logoUrl?: string;
    baseColor?: string;
  };

  let dominantColors: string[] = [];

  // ── 1. Resolve image buffer from one of the three inputs ─────────────────
  try {
    let imageBuffer: Buffer | null = null;

    if (businessId && !isNaN(businessId)) {
      // Fetch logo from object storage via the business's website config
      const [config] = await db
        .select({ settings: websiteConfigsTable.settings })
        .from(websiteConfigsTable)
        .where(eq(websiteConfigsTable.businessId, businessId));

      const settings = (config?.settings ?? {}) as Record<string, unknown>;
      const logoObjectPath = settings.logoObjectPath as string | undefined;

      if (logoObjectPath?.startsWith("/objects/uploads/")) {
        const objectFile = await objectStorageService.getObjectEntityFile(logoObjectPath);
        const response = await objectStorageService.downloadObject(objectFile);
        if (response.body) {
          const chunks: Buffer[] = [];
          const nodeStream = Readable.fromWeb(response.body as any);
          await new Promise<void>((resolve, reject) => {
            nodeStream.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            nodeStream.on("end", resolve);
            nodeStream.on("error", reject);
          });
          imageBuffer = Buffer.concat(chunks);
        }
      }
    }

    if (!imageBuffer && logoUrl && /^https?:\/\//.test(logoUrl)) {
      // Fetch logo from a public URL
      const fetchRes = await fetch(logoUrl);
      if (fetchRes.ok) {
        imageBuffer = Buffer.from(await fetchRes.arrayBuffer());
      }
    }

    if (imageBuffer && imageBuffer.length > 0) {
      dominantColors = await extractDominantColors(imageBuffer);
    }
  } catch {
    // Extraction failure is non-fatal — fall through to baseColor or defaults
    dominantColors = [];
  }

  // ── 2. Fall back to baseColor if extraction yielded nothing ──────────────
  if (dominantColors.length === 0 && baseColor && /^#[0-9a-fA-F]{6}$/.test(baseColor)) {
    dominantColors = [baseColor];
  }

  // ── 3. Generate 4 themed palette suggestions ─────────────────────────────
  const suggestions = generateColorPalettes(dominantColors);

  res.json({ suggestions, extractedColors: dominantColors });
}));

router.post("/upload-section-bg", wrapAsync(async (req, res) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-section-bgs");
  res.json({ uploadURL, objectPath });
}));

router.post("/upload-column-image", wrapAsync(async (req, res) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-column-images");
  res.json({ uploadURL, objectPath });
}));

router.post("/upload-favicon", wrapAsync(async (req, res) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-favicons");
  res.json({ uploadURL, objectPath });
}));

router.post("/upload-card-image", wrapAsync(async (req, res) => {
  const { name, size, contentType, businessId: rawBusinessId } = req.body as { name?: string; size?: number; contentType?: string; businessId?: number };
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "Missing required fields: name, size, contentType" });
  }
  const businessId = Number(rawBusinessId);
  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "Valid businessId required" });
  }
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) return res.status(404).json({ error: "Business not found" });
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-card-images");
  res.json({ uploadURL, objectPath });
}));

publicRouter.get("/:slug/favicon", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const settings = config.settings as Record<string, unknown>;
  const faviconObjectPath = settings.faviconObjectPath as string | undefined;
  if (!faviconObjectPath?.startsWith("/objects/uploads/website-favicons/")) {
    return res.status(404).json({ error: "No favicon" });
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(faviconObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Favicon not found" });
    throw err;
  }
}));

publicRouter.get("/:slug/section-bg/:bgUuid", wrapAsync(async (req, res) => {
  const { slug, bgUuid } = req.params;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ sections: websiteConfigsTable.sections })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const expectedObjectPath = `/objects/uploads/website-section-bgs/${bgUuid}`;
  const sections = config.sections as Array<{ blockStyle?: { bgImageObjectPath?: string } }>;
  const found = sections.some(s => s.blockStyle?.bgImageObjectPath === expectedObjectPath);
  if (!found) return res.status(404).json({ error: "Image not found" });

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(expectedObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Image not found" });
    throw err;
  }
}));

publicRouter.get("/:slug/column-image/:imgUuid", wrapAsync(async (req, res) => {
  const { slug, imgUuid } = req.params;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ sections: websiteConfigsTable.sections })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const expectedObjectPath = `/objects/uploads/website-column-images/${imgUuid}`;
  const sections = config.sections as Array<{ type: string; content: Record<string, unknown> }>;
  const found = sections
    .filter(s => s.type === "columns")
    .some(s => {
      const cols = (s.content?.columns as Array<{ blocks: Array<{ objectPath?: string }> }>) ?? [];
      return cols.some(col => col.blocks?.some(b => b.objectPath === expectedObjectPath));
    });
  if (!found) return res.status(404).json({ error: "Image not found" });

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(expectedObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Image not found" });
    throw err;
  }
}));

publicRouter.get("/:slug/portfolio-photo/:photoUuid", wrapAsync(async (req, res) => {
  const { slug, photoUuid } = req.params;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select({ sections: websiteConfigsTable.sections })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const sections = config.sections as Array<{ id: string; type: string; content: Record<string, unknown> }>;
  const portfolioSection = sections.find(s => s.type === "portfolio");
  const expectedObjectPath = `/objects/uploads/website-portfolio-photos/${photoUuid}`;
  type PhotoRow = { photoObjectPath?: string };
  const allPhotos: PhotoRow[] = (() => {
    const c = portfolioSection?.content ?? {};
    if (Array.isArray((c as any).projects)) {
      return (c as any).projects.flatMap((proj: any) => proj.photos ?? []) as PhotoRow[];
    }
    return ((c as any).photos ?? []) as PhotoRow[];
  })();
  const photo = allPhotos.find(p => p.photoObjectPath === expectedObjectPath);

  if (!photo?.photoObjectPath) {
    return res.status(404).json({ error: "Photo not found" });
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(photo.photoObjectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Photo not found" });
    throw err;
  }
}));

// ── Media Library ──────────────────────────────────────────────────────────────

router.get("/media", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  const items = await db
    .select()
    .from(websiteMediaTable)
    .where(eq(websiteMediaTable.businessId, businessId))
    .orderBy(desc(websiteMediaTable.uploadedAt));
  res.json(items);
}));

router.post("/media/upload", mediaUpload.single("file"), wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const { originalname, mimetype, buffer, size } = req.file;
  const objectPath = await objectStorageService.uploadBufferWithFilename(buffer, mimetype, "uploads/website-media", originalname);
  const uuid = objectPath.split("/").pop()!;
  const url = `${BASE_URL}/api/public/site/media-image/${uuid}`;
  const folderId = req.body.folderId ? parseInt(req.body.folderId) : null;
  const [item] = await db
    .insert(websiteMediaTable)
    .values({ businessId, filename: originalname, objectPath, url, size: size ?? 0, folderId: folderId ?? null })
    .returning();
  res.json(item);
}));

router.post("/media", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  const { filename, objectPath, url, size, folderId } = req.body as { filename: string; objectPath: string; url: string; size: number; folderId?: number | null };
  if (!filename || !objectPath || !url) return res.status(400).json({ error: "Missing fields" });
  const [item] = await db
    .insert(websiteMediaTable)
    .values({ businessId, filename, objectPath, url, size: size ?? 0, folderId: folderId ?? null })
    .returning();
  res.json(item);
}));

router.delete("/media/:id", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const id = parseInt(req.params.id as string);
  if (!businessId || !id) return res.status(400).json({ error: "Invalid params" });
  const [item] = await db
    .select()
    .from(websiteMediaTable)
    .where(and(eq(websiteMediaTable.id, id), eq(websiteMediaTable.businessId, businessId)));
  if (!item) return res.status(404).json({ error: "Not found" });
  await db.delete(websiteMediaTable).where(eq(websiteMediaTable.id, id));
  res.json({ ok: true });
}));

// ── Media PATCH (rename / move to folder) ──────────────────────────────────

router.patch("/media/:id", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const id = parseInt(req.params.id as string);
  if (!businessId || !id) return res.status(400).json({ error: "Invalid params" });
  const { displayName, folderId } = req.body as { displayName?: string | null; folderId?: number | null };
  const updateValues: Record<string, unknown> = {};
  if (displayName !== undefined) updateValues.displayName = displayName || null;
  if (folderId !== undefined) {
    if (folderId !== null) {
      const [folder] = await db.select({ id: websiteMediaFoldersTable.id })
        .from(websiteMediaFoldersTable)
        .where(and(eq(websiteMediaFoldersTable.id, folderId), eq(websiteMediaFoldersTable.businessId, businessId)));
      if (!folder) return res.status(400).json({ error: "Invalid folder" });
    }
    updateValues.folderId = folderId ?? null;
  }
  if (Object.keys(updateValues).length === 0) return res.status(400).json({ error: "Nothing to update" });
  const [updated] = await db
    .update(websiteMediaTable)
    .set(updateValues as any)
    .where(and(eq(websiteMediaTable.id, id), eq(websiteMediaTable.businessId, businessId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
}));

// ── Media replace-everywhere ────────────────────────────────────────────────

router.post("/media/:id/replace", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const id = parseInt(req.params.id as string);
  if (!businessId || !id) return res.status(400).json({ error: "Invalid params" });
  const { newUrl, newObjectPath, newFilename } = req.body as { newUrl: string; newObjectPath: string; newFilename: string };
  if (!newUrl || !newObjectPath) return res.status(400).json({ error: "newUrl and newObjectPath required" });

  const [item] = await db.select().from(websiteMediaTable)
    .where(and(eq(websiteMediaTable.id, id), eq(websiteMediaTable.businessId, businessId)));
  if (!item) return res.status(404).json({ error: "Not found" });

  const oldUrl = item.url;
  const configs = await db.select().from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  let replacedInConfigs = 0;
  for (const config of configs) {
    const sectionsJson = JSON.stringify(config.sections);
    const settingsJson = JSON.stringify(config.settings);
    const newSectionsJson = sectionsJson.split(oldUrl).join(newUrl);
    const newSettingsJson = settingsJson.split(oldUrl).join(newUrl);
    if (newSectionsJson !== sectionsJson || newSettingsJson !== settingsJson) {
      await db.update(websiteConfigsTable)
        .set({ sections: JSON.parse(newSectionsJson) as any, settings: JSON.parse(newSettingsJson) as any, updatedAt: new Date() })
        .where(eq(websiteConfigsTable.id, config.id));
      replacedInConfigs++;
    }
  }

  const [updated] = await db.update(websiteMediaTable)
    .set({ url: newUrl, objectPath: newObjectPath, filename: newFilename ?? item.filename })
    .where(eq(websiteMediaTable.id, id))
    .returning();

  res.json({ ok: true, replacedInConfigs, item: updated });
}));

router.post("/media/:id/replace-upload", mediaUpload.single("file"), wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const id = parseInt(req.params.id as string);
  if (!businessId || !id) return res.status(400).json({ error: "Invalid params" });
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const [item] = await db.select().from(websiteMediaTable)
    .where(and(eq(websiteMediaTable.id, id), eq(websiteMediaTable.businessId, businessId)));
  if (!item) return res.status(404).json({ error: "Not found" });

  const { originalname, mimetype, buffer, size } = req.file;
  const newObjectPath = await objectStorageService.uploadBufferWithFilename(buffer, mimetype, "uploads/website-media", originalname);
  const uuid = newObjectPath.split("/").pop()!;
  const newUrl = `${BASE_URL}/api/public/site/media-image/${uuid}`;
  const oldUrl = item.url;

  const configs = await db.select().from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  let replacedInConfigs = 0;
  for (const config of configs) {
    const sectionsJson = JSON.stringify(config.sections);
    const settingsJson = JSON.stringify(config.settings);
    const newSectionsJson = sectionsJson.split(oldUrl).join(newUrl);
    const newSettingsJson = settingsJson.split(oldUrl).join(newUrl);
    if (newSectionsJson !== sectionsJson || newSettingsJson !== settingsJson) {
      await db.update(websiteConfigsTable)
        .set({ sections: JSON.parse(newSectionsJson) as any, settings: JSON.parse(newSettingsJson) as any, updatedAt: new Date() })
        .where(eq(websiteConfigsTable.id, config.id));
      replacedInConfigs++;
    }
  }

  const [updated] = await db.update(websiteMediaTable)
    .set({ url: newUrl, objectPath: newObjectPath, filename: originalname, size: size ?? item.size })
    .where(eq(websiteMediaTable.id, id))
    .returning();

  res.json({ ok: true, replacedInConfigs, item: updated });
}));

// ── Media bulk delete ──────────────────────────────────────────────────────

router.post("/media/bulk-delete", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  await db.delete(websiteMediaTable)
    .where(and(eq(websiteMediaTable.businessId, businessId), inArray(websiteMediaTable.id, ids)));
  res.json({ ok: true, deleted: ids.length });
}));

// ── Media usage counts ─────────────────────────────────────────────────────

router.get("/media/usage-counts", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });

  const items = await db.select({ id: websiteMediaTable.id, url: websiteMediaTable.url })
    .from(websiteMediaTable)
    .where(eq(websiteMediaTable.businessId, businessId));

  const configs = await db.select({ sections: websiteConfigsTable.sections, settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  const configBlob = JSON.stringify(configs);
  const counts: Record<number, number> = {};
  for (const item of items) {
    let count = 0;
    let pos = 0;
    while ((pos = configBlob.indexOf(item.url, pos)) !== -1) { count++; pos++; }
    counts[item.id] = count;
  }
  res.json(counts);
}));

// ── Media usage details (which sections use this image) ────────────────────

router.get("/media/:id/usage-details", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const id = parseInt(req.params.id as string);
  if (!businessId || !id) return res.status(400).json({ error: "Invalid params" });

  const [item] = await db.select({ url: websiteMediaTable.url })
    .from(websiteMediaTable)
    .where(and(eq(websiteMediaTable.id, id), eq(websiteMediaTable.businessId, businessId)));
  if (!item) return res.status(404).json({ error: "Not found" });

  const configs = await db.select({ sections: websiteConfigsTable.sections, settings: websiteConfigsTable.settings })
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, businessId));

  const locations: Array<{ sectionId: string; sectionType: string }> = [];
  for (const config of configs) {
    const sections = config.sections as Array<{ id: string; type: string; content: unknown }>;
    if (Array.isArray(sections)) {
      for (const section of sections) {
        if (JSON.stringify(section.content ?? {}).includes(item.url)) {
          locations.push({ sectionId: section.id, sectionType: section.type });
        }
      }
    }
    if (JSON.stringify(config.settings ?? {}).includes(item.url)) {
      locations.push({ sectionId: "settings", sectionType: "settings" });
    }
  }
  res.json({ locations, total: locations.length });
}));

// ── Media folders ──────────────────────────────────────────────────────────

router.get("/media/folders", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });

  const folderRows = await db.select().from(websiteMediaFoldersTable)
    .where(eq(websiteMediaFoldersTable.businessId, businessId))
    .orderBy(websiteMediaFoldersTable.createdAt);

  const countRows = await db
    .select({ folderId: websiteMediaTable.folderId, count: sql<number>`count(*)::int` })
    .from(websiteMediaTable)
    .where(eq(websiteMediaTable.businessId, businessId))
    .groupBy(websiteMediaTable.folderId);

  const countMap: Record<number, number> = {};
  for (const row of countRows) {
    if (row.folderId) countMap[row.folderId] = row.count;
  }

  res.json(folderRows.map(f => ({ ...f, itemCount: countMap[f.id] ?? 0 })));
}));

router.post("/media/folders", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const [folder] = await db.insert(websiteMediaFoldersTable)
    .values({ businessId, name: name.trim() })
    .returning();
  res.json({ ...folder, itemCount: 0 });
}));

router.patch("/media/folders/:folderId", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const folderId = parseInt(req.params.folderId as string);
  if (!businessId || !folderId) return res.status(400).json({ error: "Invalid params" });
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const [updated] = await db.update(websiteMediaFoldersTable)
    .set({ name: name.trim() })
    .where(and(eq(websiteMediaFoldersTable.id, folderId), eq(websiteMediaFoldersTable.businessId, businessId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
}));

router.delete("/media/folders/:folderId", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  const folderId = parseInt(req.params.folderId as string);
  if (!businessId || !folderId) return res.status(400).json({ error: "Invalid params" });
  await db.update(websiteMediaTable)
    .set({ folderId: null })
    .where(and(eq(websiteMediaTable.folderId, folderId), eq(websiteMediaTable.businessId, businessId)));
  await db.delete(websiteMediaFoldersTable)
    .where(and(eq(websiteMediaFoldersTable.id, folderId), eq(websiteMediaFoldersTable.businessId, businessId)));
  res.json({ ok: true });
}));

publicRouter.get("/media-image/:uuid", wrapAsync(async (req, res) => {
  const { uuid } = req.params;
  // Serve directly from storage — no DB presence required so that deleting an
  // image from the media library (which removes the DB row but NOT the object)
  // does not break pages that still reference this URL.
  const objectPath = `/objects/uploads/website-media/${uuid}`;
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Image not found" });
    throw err;
  }
}));

publicRouter.get("/card-image/:uuid", wrapAsync(async (req, res) => {
  const { uuid } = req.params;
  const objectPath = `/objects/uploads/website-card-images/${uuid}`;
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Image not found" });
    throw err;
  }
}));

router.get("/preview-by-slug/:slug", wrapAsync(async (req, res) => {
  const slug = req.params.slug as string;
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.slug, slug as string));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const normalizedSections = normalizeSections(config.sections as SectionRow[]);
  res.json({ ...config, sections: normalizedSections, businessName: biz.name, businessSlug: biz.slug });
}));

// ── Saved Sections — CRUD ─────────────────────────────────────────────────────

router.get("/saved-sections", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  const rows = await db
    .select()
    .from(savedSectionsTable)
    .where(eq(savedSectionsTable.businessId, businessId))
    .orderBy(desc(savedSectionsTable.createdAt));
  return res.json(rows.map(r => {
    const json = r.sectionJson as { type: string; content: unknown; blockStyle?: unknown };
    return {
      id: r.id,
      name: r.name,
      sectionType: json.type,
      content: json.content ?? {},
      blockStyle: json.blockStyle ?? undefined,
      createdAt: r.createdAt.toISOString(),
    };
  }));
}));

router.post("/saved-sections", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.body.businessId);
  const { name, sectionType, content, blockStyle } = req.body as {
    name: string; sectionType: string;
    content: Record<string, unknown>; blockStyle?: Record<string, unknown>;
  };
  if (!businessId || !name || !sectionType) {
    return res.status(400).json({ error: "businessId, name, sectionType required" });
  }
  const [row] = await db
    .insert(savedSectionsTable)
    .values({
      businessId,
      name: name.trim().slice(0, 255),
      sectionJson: { type: sectionType, content: content ?? {}, blockStyle: blockStyle ?? null },
    })
    .returning();
  const json = row.sectionJson as { type: string; content: unknown; blockStyle?: unknown };
  return res.json({
    id: row.id,
    name: row.name,
    sectionType: json.type,
    content: json.content ?? {},
    blockStyle: json.blockStyle ?? undefined,
    createdAt: row.createdAt.toISOString(),
  });
}));

router.patch("/saved-sections/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const businessId = parseInt(req.body.businessId);
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: "name required" });
  const [row] = await db
    .update(savedSectionsTable)
    .set({ name: name.trim().slice(0, 255) })
    .where(and(eq(savedSectionsTable.id, id), eq(savedSectionsTable.businessId, businessId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json({ id: row.id, name: row.name });
}));

router.delete("/saved-sections/:id", wrapAsync(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const businessId = parseInt((Array.isArray(req.query.businessId) ? req.query.businessId[0] : req.query.businessId ?? req.body.businessId) as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  await db
    .delete(savedSectionsTable)
    .where(and(eq(savedSectionsTable.id, id), eq(savedSectionsTable.businessId, businessId)));
  return res.json({ ok: true });
}));

// ── M5: Suggest Images ────────────────────────────────────────────────────────
// GET /api/website/suggest-images?businessType=X&sectionType=Y&businessId=Z
// Returns own uploaded photos (prepended) + curated industry suggestions.

router.get("/suggest-images", wrapAsync(async (req, res) => {
  const businessType = (req.query.businessType as string | undefined) ?? "";
  const sectionType  = (req.query.sectionType  as string | undefined) ?? "";
  const businessId   = parseInt(req.query.businessId as string);

  // ── Own uploaded photos ─────────────────────────────────────────────────────
  let ownPhotos: Array<{ id: number; url: string; displayName: string | null; filename: string }> = [];
  if (!isNaN(businessId) && businessId > 0) {
    const media = await db
      .select({
        id:          websiteMediaTable.id,
        url:         websiteMediaTable.url,
        displayName: websiteMediaTable.displayName,
        filename:    websiteMediaTable.filename,
      })
      .from(websiteMediaTable)
      .where(and(
        eq(websiteMediaTable.businessId, businessId),
        // Only surface image files (filter out PDFs, etc.)
        sql`lower(${websiteMediaTable.filename}) similar to '%(jpg|jpeg|png|gif|webp|avif|svg)'`,
      ))
      .orderBy(desc(websiteMediaTable.uploadedAt))
      .limit(24);
    ownPhotos = media;
  }

  // ── Curated suggestions ─────────────────────────────────────────────────────
  const suggestions = getSuggestedImages(businessType, sectionType);

  return res.json({ ownPhotos, suggestions });
}));

export { router as websiteRouter, publicRouter as websitePublicRouter };
