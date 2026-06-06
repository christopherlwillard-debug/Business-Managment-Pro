import { Router } from "express";
import { Readable } from "stream";
import { createHmac, createHash } from "crypto";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { websiteConfigsTable, websitePageViewsTable, businessesTable, prospectsTable, websiteFormSubmissionsTable, websiteMediaTable, websiteMediaFoldersTable, depositSubmissionsTable, contactsTable } from "@workspace/db/schema";
import { eq, and, sql, gte, desc, inArray } from "drizzle-orm";
import { wrapAsync } from "./guards";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { createSquarePaymentLink, isSquareConfigured } from "../lib/square";
import { sendEmail } from "../lib/sendEmail";

const objectStorageService = new ObjectStorageService();

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
  const { slug } = req.params;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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
  const { slug } = req.params;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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
  const { slug } = req.params;
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.slug, slug));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(and(eq(websiteConfigsTable.businessId, biz.id), eq(websiteConfigsTable.published, true)));

  if (!config) return res.status(404).json({ error: "Website not published" });

  res.json({ ...config, businessName: biz.name, businessSlug: biz.slug });
}));

publicRouter.post("/:slug/view", (req, res) => {
  const { slug } = req.params;
  const ua = req.headers["user-agent"] ?? "";
  const deviceType = /Mobile|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";

  res.status(204).send();

  db.select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug))
    .then(([biz]) => {
      if (biz) {
        return db.insert(websitePageViewsTable).values({ businessId: biz.id, deviceType });
      }
    })
    .catch(() => {});
});

publicRouter.post("/:slug/contact", wrapAsync(async (req, res) => {
  const { slug } = req.params;
  const [biz] = await db.select({ id: businessesTable.id, slug: businessesTable.slug }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
  const { slug } = req.params;

  if (!isSquareConfigured()) {
    return res.status(400).json({ error: "Payments are not configured for this site." });
  }

  const [biz] = await db
    .select({ id: businessesTable.id, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug));
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
  const { slug } = req.params;

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
    .where(eq(businessesTable.slug, slug));
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

router.post("/generate-copy", wrapAsync(async (req, res) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt?.trim()) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_completion_tokens: 300,
    messages: [
      {
        role: "system",
        content: `You are a professional copywriter for contractor and trade business websites. Write clear, confident, trustworthy copy that appeals to homeowners and property managers hiring a contractor. Be concise and direct — no fluff, no hype words like "premier" or "unparalleled". Return ONLY the copy text, no quotes, no explanation, no markdown formatting.`,
      },
      { role: "user", content: prompt.trim() },
    ],
  });

  const result = completion.choices[0]?.message?.content?.trim() ?? "";
  res.json({ result });
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

publicRouter.get("/:slug/favicon", wrapAsync(async (req, res) => {
  const { slug } = req.params;
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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
  const [biz] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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

router.post("/media/upload-url", wrapAsync(async (req, res) => {
  const businessId = parseInt(req.query.businessId as string);
  if (!businessId) return res.status(400).json({ error: "businessId required" });
  const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURLForSubPath("uploads/website-media");
  res.json({ uploadURL, objectPath });
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
  const id = parseInt(req.params.id);
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
  const id = parseInt(req.params.id);
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
  const id = parseInt(req.params.id);
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
  const id = parseInt(req.params.id);
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
  const folderId = parseInt(req.params.folderId);
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
  const folderId = parseInt(req.params.folderId);
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
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
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
  const { slug } = req.params;
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.slug, slug));
  if (!biz) return res.status(404).json({ error: "Not found" });

  const [config] = await db
    .select()
    .from(websiteConfigsTable)
    .where(eq(websiteConfigsTable.businessId, biz.id));

  if (!config) return res.status(404).json({ error: "No website config" });

  const normalizedSections = normalizeSections(config.sections as SectionRow[]);
  res.json({ ...config, sections: normalizedSections, businessName: biz.name, businessSlug: biz.slug });
}));

export { router as websiteRouter, publicRouter as websitePublicRouter };
