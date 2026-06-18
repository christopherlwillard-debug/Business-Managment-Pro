import { Router, type Request, type Response, type NextFunction } from "express";
import { sectionGuard } from "./guards";
import { db } from "@workspace/db";
import { subcontractorsTable, jobsTable, jobSubcontractorsTable, expensesTable, mileageLogsTable, settingsTable, vendorsTable, generated1099sTable, paymentsTable, dailyLogsTable, materialListsTable, subPaymentRecordsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, or, inArray, sql } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { computeYtd } from "./subcontractors";

const portalUploadsDir = path.resolve("uploads");
if (!fs.existsSync(portalUploadsDir)) fs.mkdirSync(portalUploadsDir, { recursive: true });

const ALLOWED_RECEIPT_MIMETYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
]);

const portalUpload = multer({
  storage: multer.diskStorage({
    destination: portalUploadsDir,
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_RECEIPT_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed"));
    }
  },
});

const router = Router();

async function getSubByToken(token: string) {
  const [sub] = await db.select().from(subcontractorsTable).where(eq(subcontractorsTable.portalToken, token));
  return sub ?? null;
}

async function getRate() {
  const [s] = await db.select().from(settingsTable).limit(1);
  return parseFloat(s?.mileageRate ?? "0.725");
}

// ─── PIN Security ─────────────────────────────────────────────────────────────

const PORTAL_SESSION_COOKIE = "portal_sessions";
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Signing secret for HMAC-protected portal session cookies.
 * Prefer SESSION_SECRET from env. If not set, generate a cryptographically
 * random secret at startup so it is never guessable, at the cost of sessions
 * being invalidated on server restart (acceptable for a PIN session).
 */
const PIN_COOKIE_SECRET: string = process.env.SESSION_SECRET ??
  crypto.randomBytes(32).toString("hex");

/** HMAC-sign the sessions map so the cookie cannot be forged by the client */
function signSessions(sessions: Record<string, number>): string {
  const data = JSON.stringify(sessions);
  return crypto.createHmac("sha256", PIN_COOKIE_SECRET).update(data).digest("hex");
}

/** Read and cryptographically verify the portal session cookie. Returns {} on any tampering. */
function getVerifiedPortalSessions(req: Request): Record<string, number> {
  try {
    const raw = req.cookies?.[PORTAL_SESSION_COOKIE] as string | undefined;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { s: Record<string, number>; t: string };
    if (!parsed?.s || !parsed?.t) return {};
    // Constant-time comparison to prevent timing attacks
    const expected = signSessions(parsed.s);
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(parsed.t, "utf8");
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return {}; // cookie tampered
    }
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed.s).filter(([, exp]) => (exp as number) > now));
  } catch {
    return {};
  }
}

/** Write an HMAC-signed portal session cookie */
function setPortalSession(res: Response, token: string, current: Record<string, number>) {
  current[token] = Date.now() + SESSION_TTL_MS;
  const t = signSessions(current);
  res.cookie(PORTAL_SESSION_COOKIE, JSON.stringify({ s: current, t }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000, // 24-hour cookie lifetime
  });
}

/**
 * Server-side gate: if the subcontractor has a PIN set, require a valid
 * signed session cookie before serving any portal data.
 * Routes that do NOT need this gate: /check-session, /set-pin, /verify-pin
 */
async function requirePinSession(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token;
  if (!token) return res.status(401).json({ error: "Invalid portal link" });

  const sub = await getSubByToken(token);
  if (!sub) return res.status(404).json({ error: "Invalid portal link" });

  // PIN not yet set → frontend must guide sub through PIN setup before data loads
  if (!sub.portalPinHash) {
    return res.status(401).json({ error: "PIN setup required", requirePinSetup: true });
  }

  // PIN is configured → verify signed session cookie
  const sessions = getVerifiedPortalSessions(req);
  const exp = sessions[token];
  if (!exp || exp < Date.now()) {
    return res.status(401).json({ error: "PIN verification required", requirePin: true });
  }
  return next();
}

// Check if a portal PIN session is valid
router.post("/check-session", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ valid: false, pinSet: false });

  try {
    const sub = await getSubByToken(token);
    if (!sub) return res.json({ valid: false, pinSet: false });

    const pinSet = !!sub.portalPinHash;
    const sessions = getVerifiedPortalSessions(req);
    const exp = sessions[token];
    const valid = !!exp && exp > Date.now();

    return res.json({ valid, pinSet });
  } catch {
    return res.json({ valid: false, pinSet: false });
  }
});

// Set a PIN for the first time
router.post("/set-pin", async (req, res) => {
  const { token, pin } = req.body;
  if (!token || !pin) return res.status(400).json({ error: "Token and PIN are required" });
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4–6 digits" });

  try {
    const sub = await getSubByToken(token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (sub.portalPinHash) return res.status(400).json({ error: "PIN already set. Use Reset PIN from admin." });

    const hash = await bcrypt.hash(pin, 10);
    await db.update(subcontractorsTable)
      .set({ portalPinHash: hash, portalPinAttempts: 0, portalPinLockedUntil: null })
      .where(eq(subcontractorsTable.id, sub.id));

    const sessions = getVerifiedPortalSessions(req);
    setPortalSession(res, token, sessions);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to set PIN" });
  }
});

// Verify PIN and issue session
router.post("/verify-pin", async (req, res) => {
  const { token, pin } = req.body;
  if (!token || !pin) return res.status(400).json({ error: "Token and PIN are required" });

  try {
    const sub = await getSubByToken(token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!sub.portalPinHash) return res.status(400).json({ error: "No PIN set" });

    // Check lockout — still locked
    if (sub.portalPinLockedUntil && sub.portalPinLockedUntil > new Date()) {
      const mins = Math.ceil((sub.portalPinLockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`, locked: true });
    }

    // If lockout has ELAPSED, reset the attempt counter so the sub gets a fresh 3-attempt window
    const baseAttempts = sub.portalPinLockedUntil && sub.portalPinLockedUntil <= new Date() ? 0 : sub.portalPinAttempts;

    const match = await bcrypt.compare(pin, sub.portalPinHash);
    if (!match) {
      const attempts = baseAttempts + 1;
      const lockedUntil = attempts >= 3 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.update(subcontractorsTable)
        .set({ portalPinAttempts: attempts, portalPinLockedUntil: lockedUntil })
        .where(eq(subcontractorsTable.id, sub.id));

      const remaining = Math.max(0, 3 - attempts);
      return res.status(401).json({
        error: remaining > 0
          ? `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
          : "Too many incorrect attempts. Locked for 15 minutes.",
        attemptsLeft: remaining,
        locked: attempts >= 3,
      });
    }

    // Reset attempts on success
    await db.update(subcontractorsTable)
      .set({ portalPinAttempts: 0, portalPinLockedUntil: null })
      .where(eq(subcontractorsTable.id, sub.id));

    const sessions = getVerifiedPortalSessions(req);
    setPortalSession(res, token, sessions);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to verify PIN" });
  }
});

// Approve or revoke portal access — requires authenticated admin access
router.post("/approve/:subId", sectionGuard("subcontractors"), async (req, res) => {
  try {
    const id = parseInt(req.params.subId);
    const { approved } = req.body; // boolean
    const [sub] = await db
      .update(subcontractorsTable)
      .set({ portalApproved: !!approved })
      .where(eq(subcontractorsTable.id, id))
      .returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ portalApproved: sub.portalApproved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update portal approval" });
  }
});

// Generate portal token for a sub — requires authenticated admin access
router.post("/generate/:subId", sectionGuard("subcontractors"), async (req, res) => {
  try {
    const id = parseInt(req.params.subId);
    const token = crypto.randomUUID();
    const [sub] = await db
      .update(subcontractorsTable)
      .set({ portalToken: token })
      .where(eq(subcontractorsTable.id, id))
      .returning();
    if (!sub) return res.status(404).json({ error: "Subcontractor not found" });
    res.json({ portalToken: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate portal token" });
  }
});

function maskTaxId(id: string): string {
  if (id.length <= 4) return "***-" + id;
  return "***-**-" + id.slice(-4);
}

// ─── Phone lookup — lets a sub verify their account by phone number ───────────
// Normalises both stored and submitted phone numbers (digits only) before comparing.
// Returns only the subcontractor's first name — does NOT disclose the portal token.
router.post("/lookup", async (req, res) => {
  try {
    const raw: string = req.body.phone ?? "";
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return res.status(400).json({ error: "Enter a valid phone number" });

    const subs = await db
      .select({ id: subcontractorsTable.id, name: subcontractorsTable.name, phone: subcontractorsTable.phone, portalToken: subcontractorsTable.portalToken, portalApproved: subcontractorsTable.portalApproved })
      .from(subcontractorsTable);

    const match = subs.find(s => s.phone && s.phone.replace(/\D/g, "") === digits);
    if (!match) return res.status(404).json({ error: "No portal found for that number. Ask your contractor for your portal link." });
    if (!match.portalApproved) return res.status(403).json({ error: "Portal access not yet approved. Ask your contractor to approve your portal." });
    if (!match.portalToken) return res.status(404).json({ error: "No portal link generated yet. Ask your contractor to create your portal." });

    res.json({ name: match.name.split(" ")[0] });
  } catch (err) {
    console.error("[portal-lookup]", err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// ─── Per-token PWA manifest — gives "Sub Portal" name + correct start_url ──────
router.get("/:token/manifest.json", async (req, res) => {
  const sub = await getSubByToken(req.params.token);
  if (!sub) return res.status(404).json({ error: "Not found" });
  const base = process.env.BASE_URL ?? "";
  res.json({
    name: "Sub Portal",
    short_name: "Sub Portal",
    description: `Secure subcontractor portal for ${sub.name}`,
    start_url: `${base}/portal/${req.params.token}`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#f59e0b",
    background_color: "#f59e0b",
    icons: [
      { src: `${base}/apple-touch-icon.png`, sizes: "180x180", type: "image/png", purpose: "any" },
      { src: `${base}/favicon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
  });
});

// ─── Token-scoped data routes (all gated by requirePinSession) ─────────────────
// Every route below requires either no PIN to be set on the subcontractor, or a
// valid HMAC-verified PIN session cookie.  This is enforced server-side by the
// requirePinSession middleware — bypassing the frontend does NOT grant access.

const tokenRouter = Router({ mergeParams: true });
tokenRouter.use(requirePinSession);

// Get full portal data
tokenRouter.get("/", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!sub.portalApproved) return res.status(403).json({ error: "Portal access not yet approved", pendingApproval: true });

    // Get all job IDs where the sub appears in the junction table
    const junctionRows = await db
      .select({ jobId: jobSubcontractorsTable.jobId })
      .from(jobSubcontractorsTable)
      .where(eq(jobSubcontractorsTable.subcontractorId, sub.id));
    const junctionJobIds = junctionRows.map(r => r.jobId);

    // Jobs: primary subcontractor OR via junction table (deduplicated by ID set)
    const allJobIds = new Set(junctionJobIds);
    const jobsQuery = allJobIds.size > 0
      ? db.select().from(jobsTable).where(
          or(eq(jobsTable.subcontractorId, sub.id), inArray(jobsTable.id, [...allJobIds]))
        )
      : db.select().from(jobsTable).where(eq(jobsTable.subcontractorId, sub.id));

    const [jobs, expenses, mileage] = await Promise.all([
      jobsQuery,
      // Exclude contractor-logged subcontractor payments (category='subcontractor');
      // those already count toward ytdPayments and should not appear as the sub's own expenses
      db.select().from(expensesTable).where(
        and(
          eq(expensesTable.subcontractorId, sub.id),
          sql`LOWER(${expensesTable.category}) != 'subcontractor'`
        )
      ),
      db.select().from(mileageLogsTable).where(eq(mileageLogsTable.subcontractorId, sub.id)),
    ]);

    const totalExpenses = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const businessMileage = mileage.filter(m => m.classification === "business");
    const totalMiles = businessMileage.reduce((s, m) => s + parseFloat(m.miles), 0);
    const [rate, ytdPayments] = await Promise.all([getRate(), computeYtd(sub.id, new Date().getFullYear())]);

    const features: string[] = Array.isArray(sub.portalFeatures)
      ? (sub.portalFeatures as string[])
      : ["payments", "income_report", "jobs", "expenses", "mileage", "w9", "tax_reports", "home_office"];

    res.json({
      subcontractor: {
        id: sub.id,
        name: sub.name,
        email: sub.email,
        phone: sub.phone,
        trade: sub.trade,
        ytdPayments,
        w9OnFile: sub.w9OnFile,
        w9LegalName: sub.w9LegalName,
        w9BusinessName: sub.w9BusinessName,
        w9TaxClassification: sub.w9TaxClassification,
        w9LlcType: sub.w9LlcType,
        w9Address: sub.w9Address,
        w9City: sub.w9City,
        w9State: sub.w9State,
        w9Zip: sub.w9Zip,
        w9TaxIdType: sub.w9TaxIdType,
        w9TaxIdMasked: sub.w9TaxId ? maskTaxId(sub.w9TaxId) : null,
        w9Signature: sub.w9Signature,
        w9SignedAt: sub.w9SignedAt,
        w9Complete: !!sub.w9Signature,
      },
      jobs: jobs.map(j => ({
        id: j.id,
        title: j.title,
        status: j.status,
        city: j.city,
        state: j.state,
        startDate: j.startDate,
        endDate: j.endDate,
        description: j.description,
      })),
      stats: {
        ytdPayments,
        totalExpenses,
        totalMiles,
        mileageDeduction: totalMiles * rate,
        ratePerMile: rate,
        expenseCount: expenses.length,
        mileageCount: mileage.length,
      },
      features,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load portal" });
  }
});

// Income report for a year (payments made by contractor to this subcontractor)
tokenRouter.get("/income-report", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!sub.portalApproved) return res.status(403).json({ error: "Portal access not yet approved" });

    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Fetch pay-worker payments from the dedicated ledger table
    const subPayments = await db
      .select({
        id: subPaymentRecordsTable.id,
        amount: subPaymentRecordsTable.amount,
        date: subPaymentRecordsTable.paymentDate,
        description: subPaymentRecordsTable.description,
        jobId: subPaymentRecordsTable.jobId,
        notes: subPaymentRecordsTable.notes,
        jobTitle: jobsTable.title,
      })
      .from(subPaymentRecordsTable)
      .leftJoin(jobsTable, eq(subPaymentRecordsTable.jobId, jobsTable.id))
      .where(
        and(
          eq(subPaymentRecordsTable.subcontractorId, sub.id),
          gte(subPaymentRecordsTable.paymentDate, startDate),
          lte(subPaymentRecordsTable.paymentDate, endDate),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
        )
      )
      .orderBy(subPaymentRecordsTable.paymentDate);

    // Fetch direct payments from paymentsTable (manually recorded, separate flow)
    const directPayments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.subcontractorId, sub.id),
          eq(paymentsTable.year, year),
        )
      )
      .orderBy(paymentsTable.paymentDate);

    // Build unified payment entries
    const entries: Array<{
      id: string;
      date: string;
      amount: number;
      description: string | null;
      jobId: number | null;
      jobTitle: string | null;
      notes: string | null;
      source: "payment" | "expense";
    }> = [
      ...subPayments.map(e => ({
        id: `spr-${e.id}`,
        date: e.date,
        amount: parseFloat(e.amount),
        description: e.description ?? null,
        jobId: e.jobId ?? null,
        jobTitle: e.jobTitle ?? null,
        notes: e.notes ?? null,
        source: "payment" as const,
      })),
      ...directPayments.map(p => ({
        id: `pay-${p.id}`,
        date: p.paymentDate,
        amount: parseFloat(p.amount),
        description: p.description ?? null,
        jobId: null,
        jobTitle: null,
        notes: p.notes ?? null,
        source: "payment" as const,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    const totalPaid = entries.reduce((s, e) => s + e.amount, 0);

    // Per-job breakdown
    const byJob: Record<string, { jobId: number | null; jobTitle: string; total: number; count: number }> = {};
    for (const e of entries) {
      const key = e.jobId != null ? String(e.jobId) : "__none__";
      if (!byJob[key]) {
        byJob[key] = {
          jobId: e.jobId,
          jobTitle: e.jobTitle ?? (e.jobId != null ? `Job #${e.jobId}` : "General / Unassigned"),
          total: 0,
          count: 0,
        };
      }
      byJob[key].total += e.amount;
      byJob[key].count += 1;
    }

    res.json({
      year,
      subName: sub.name,
      w9LegalName: sub.w9LegalName,
      totalPaid,
      entries,
      byJob: Object.values(byJob).sort((a, b) => b.total - a.total),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate income report" });
  }
});

// Tax report for a year
tokenRouter.get("/tax-report", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!sub.portalApproved) return res.status(403).json({ error: "Portal access not yet approved" });

    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const [expenses, mileage] = await Promise.all([
      db.select().from(expensesTable).where(
        and(
          eq(expensesTable.subcontractorId, sub.id),
          gte(expensesTable.date, startDate),
          lte(expensesTable.date, endDate),
          sql`LOWER(${expensesTable.category}) != 'subcontractor'`
        )
      ),
      db.select().from(mileageLogsTable).where(
        and(eq(mileageLogsTable.subcontractorId, sub.id), gte(mileageLogsTable.date, startDate), lte(mileageLogsTable.date, endDate))
      ),
    ]);

    const yearStr = String(year);

    // Qualifying income = manual payments + pay-worker ledger records for the year
    const [qualifyingPayRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.subcontractorId, sub.id),
          eq(paymentsTable.year, year)
        )
      );
    const [qualifyingSprRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${subPaymentRecordsTable.amount}), 0)` })
      .from(subPaymentRecordsTable)
      .where(
        and(
          eq(subPaymentRecordsTable.subcontractorId, sub.id),
          gte(subPaymentRecordsTable.paymentDate, `${yearStr}-01-01`),
          lte(subPaymentRecordsTable.paymentDate, `${yearStr}-12-31`),
          sql`${subPaymentRecordsTable.isReversal} IS NOT TRUE`,
        )
      );
    const qualifyingIncome = parseFloat(qualifyingPayRow?.total ?? "0") + parseFloat(qualifyingSprRow?.total ?? "0");

    const [rate, grossIncome] = await Promise.all([getRate(), computeYtd(sub.id, year)]);

    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    for (const e of expenses) {
      const amt = parseFloat(e.amount);
      expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + amt;
      totalExpenses += amt;
    }

    const businessMiles = mileage.filter(m => m.classification === "business");
    const totalBusinessMiles = businessMiles.reduce((s, m) => s + parseFloat(m.miles), 0);
    const mileageDeduction = totalBusinessMiles * rate;
    const totalDeductions = totalExpenses + mileageDeduction;
    const netIncome = Math.max(0, grossIncome - totalDeductions);
    const seTaxEstimate = netIncome * 0.9235 * 0.153;
    const seDeduction = seTaxEstimate / 2;
    const federalTaxableIncome = Math.max(0, netIncome - seDeduction);

    res.json({
      year, grossIncome, qualifyingIncome,
      expenses: { total: totalExpenses, byCategory: expensesByCategory, count: expenses.length },
      mileage: { totalMiles: totalBusinessMiles, ratePerMile: rate, deduction: mileageDeduction, count: businessMiles.length },
      totalDeductions, netIncome, seTaxEstimate, seDeduction, federalTaxableIncome,
      subName: sub.name, w9LegalName: sub.w9LegalName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate tax report" });
  }
});

// Save W-9 data
tokenRouter.put("/w9", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const { w9LegalName, w9BusinessName, w9TaxClassification, w9LlcType,
      w9Address, w9City, w9State, w9Zip, w9TaxIdType, w9TaxId, w9Signature } = req.body;

    if (!w9LegalName || !w9TaxClassification || !w9Address || !w9City || !w9State || !w9Zip || !w9TaxIdType || !w9TaxId || !w9Signature) {
      return res.status(400).json({ error: "All W-9 fields are required" });
    }

    const signedAt = new Date().toISOString().split("T")[0];
    await db.update(subcontractorsTable)
      .set({ w9LegalName, w9BusinessName, w9TaxClassification, w9LlcType,
        w9Address, w9City, w9State, w9Zip, w9TaxIdType, w9TaxId, w9Signature, w9SignedAt: signedAt, w9OnFile: true })
      .where(eq(subcontractorsTable.id, sub.id));

    res.json({ success: true, w9SignedAt: signedAt, w9OnFile: true, w9TaxIdMasked: maskTaxId(w9TaxId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save W-9" });
  }
});

// Save portal feature preferences
tokenRouter.put("/features", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const { features } = req.body;
    if (!Array.isArray(features)) return res.status(400).json({ error: "features must be an array" });
    await db.update(subcontractorsTable).set({ portalFeatures: features }).where(eq(subcontractorsTable.id, sub.id));
    res.json({ success: true, features });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save features" });
  }
});

// Expenses
tokenRouter.get("/expenses", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const expenses = await db.select().from(expensesTable)
      .where(
        and(
          eq(expensesTable.subcontractorId, sub.id),
          sql`LOWER(${expensesTable.category}) != 'subcontractor'`
        )
      ).orderBy(expensesTable.date);
    res.json(expenses.map(e => ({ ...e, amount: parseFloat(e.amount) })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

tokenRouter.post("/expenses", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const { description, amount, category, date, vendor, jobId, notes, receiptUrl } = req.body;
    if (!description || !amount || !category || !date) return res.status(400).json({ error: "Missing required fields" });
    const [expense] = await db.insert(expensesTable).values({
      description, amount: amount.toString(), category, date, vendor, jobId: jobId || null, notes,
      receiptUrl: receiptUrl || null,
      subcontractorId: sub.id,
    }).returning();
    res.status(201).json({ ...expense, amount: parseFloat(expense.amount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

tokenRouter.get("/vendors", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
    res.json(vendors);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

tokenRouter.post("/upload", portalUpload.single("file"), async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    // Return a portal-scoped URL so receipts are served through PIN-authenticated route
    res.json({ url: `/api/portal/${req.params.token}/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Serve portal receipt files — gated by requirePinSession (applied to all tokenRouter routes)
// Verifies the file is referenced by one of this subcontractor's expenses (object-level authorization)
tokenRouter.get("/uploads/:filename", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const filename = path.basename(req.params.filename); // prevent path traversal
    const portalScopedUrl = `/api/portal/${req.params.token}/uploads/${filename}`;

    // Verify this file belongs to one of the subcontractor's expenses
    const [ownerExpense] = await db
      .select({ id: expensesTable.id })
      .from(expensesTable)
      .where(and(
        eq(expensesTable.subcontractorId, sub.id),
        eq(expensesTable.receiptUrl, portalScopedUrl),
      ))
      .limit(1);

    if (!ownerExpense) return res.status(403).json({ error: "Access denied" });

    const filePath = path.join(portalUploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: "Failed to serve file" });
  }
});

tokenRouter.delete("/expenses/:id", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    await db.delete(expensesTable).where(
      and(eq(expensesTable.id, parseInt(req.params.id)), eq(expensesTable.subcontractorId, sub.id))
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// Mileage
tokenRouter.get("/mileage", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const logs = await db.select().from(mileageLogsTable)
      .where(eq(mileageLogsTable.subcontractorId, sub.id)).orderBy(mileageLogsTable.date);
    res.json(logs.map(m => ({
      ...m,
      miles: parseFloat(m.miles),
      deductionAmount: parseFloat(m.deductionAmount),
      ratePerMile: parseFloat(m.ratePerMile),
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch mileage" });
  }
});

tokenRouter.post("/mileage", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    const { date, miles, startLocation, endLocation, purpose, jobId, classification, notes } = req.body;
    if (!date || miles == null) return res.status(400).json({ error: "Missing required fields" });
    const rate = await getRate();
    const milesNum = parseFloat(miles);
    const deductionAmount = classification === "business" ? milesNum * rate : 0;
    const [log] = await db.insert(mileageLogsTable).values({
      date, miles: milesNum.toString(), startLocation, endLocation,
      purpose, jobId: jobId || null, classification: classification || "business",
      ratePerMile: rate.toString(), deductionAmount: deductionAmount.toString(),
      notes, subcontractorId: sub.id,
    }).returning();
    res.status(201).json({
      ...log,
      miles: parseFloat(log.miles),
      deductionAmount: parseFloat(log.deductionAmount),
      ratePerMile: parseFloat(log.ratePerMile),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create mileage log" });
  }
});

tokenRouter.delete("/mileage/:id", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    await db.delete(mileageLogsTable).where(
      and(eq(mileageLogsTable.id, parseInt(req.params.id)), eq(mileageLogsTable.subcontractorId, sub.id))
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete mileage log" });
  }
});

// GET /portal/:token/1099s — list generated 1099s for this subcontractor
tokenRouter.get("/1099s", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const records = await db
      .select()
      .from(generated1099sTable)
      .where(eq(generated1099sTable.subcontractorId, sub.id));

    res.json(
      records.map(r => ({
        id: r.id,
        taxYear: r.taxYear,
        totalPaid: parseFloat(String(r.totalPaid)),
        generatedAt: r.generatedAt,
        hasPdf: !!r.pdfData,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch 1099s" });
  }
});

// GET /portal/:token/1099s/:id/pdf — download a specific 1099 PDF (base64)
tokenRouter.get("/1099s/:id/pdf", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });

    const [record] = await db
      .select()
      .from(generated1099sTable)
      .where(
        and(
          eq(generated1099sTable.id, parseInt(req.params.id)),
          eq(generated1099sTable.subcontractorId, sub.id)
        )
      );
    if (!record) return res.status(404).json({ error: "Not found" });

    res.json({ pdfData: record.pdfData, taxYear: record.taxYear });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch 1099 PDF" });
  }
});

// Get material lists for a job (portal use: sub can view and select)
tokenRouter.get("/jobs/:jobId/material-lists", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!sub.portalApproved) return res.status(403).json({ error: "Portal access not yet approved" });

    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    // Verify subcontractor is assigned to this job
    const [junctionRow] = await db
      .select()
      .from(jobSubcontractorsTable)
      .where(and(eq(jobSubcontractorsTable.jobId, jobId), eq(jobSubcontractorsTable.subcontractorId, sub.id)))
      .limit(1);
    const primaryJob = await db.select().from(jobsTable)
      .where(and(eq(jobsTable.id, jobId), eq(jobsTable.subcontractorId, sub.id))).limit(1);
    if (!junctionRow && primaryJob.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    const lists = await db
      .select()
      .from(materialListsTable)
      .where(eq(materialListsTable.jobId, jobId));

    res.json(lists);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch material lists" });
  }
});

// Complete a job from the portal — writes a daily log entry on the BMS job
tokenRouter.post("/jobs/:jobId/complete", async (req, res) => {
  try {
    const sub = await getSubByToken(req.params.token);
    if (!sub) return res.status(404).json({ error: "Invalid portal link" });
    if (!sub.portalApproved) return res.status(403).json({ error: "Portal access not yet approved" });

    const jobId = parseInt(req.params.jobId);
    if (isNaN(jobId)) return res.status(400).json({ error: "Invalid job ID" });

    // Verify this sub is assigned to the job
    const [junctionRow] = await db
      .select()
      .from(jobSubcontractorsTable)
      .where(and(eq(jobSubcontractorsTable.jobId, jobId), eq(jobSubcontractorsTable.subcontractorId, sub.id)))
      .limit(1);
    const primaryJobRows = await db.select().from(jobsTable)
      .where(and(eq(jobsTable.id, jobId), eq(jobsTable.subcontractorId, sub.id))).limit(1);
    if (!junctionRow && primaryJobRows.length === 0) {
      return res.status(403).json({ error: "You are not assigned to this job" });
    }

    const { notes, photoUrls, materialListId } = req.body;
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: "Field notes are required" });
    }

    const today = new Date().toISOString().split("T")[0];

    // Insert daily log attributed to this subcontractor
    const [log] = await db.insert(dailyLogsTable).values({
      jobId,
      date: today,
      workCompleted: notes.trim(),
      notes: null,
      photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
      materialListId: materialListId ? parseInt(materialListId) : null,
      authorName: sub.name,
    }).returning();

    // Mark job as completed
    await db.update(jobsTable)
      .set({ status: "completed" })
      .where(eq(jobsTable.id, jobId));

    res.status(201).json({ success: true, logId: log.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to complete job" });
  }
});

// Mount token sub-router — MUST come after all static routes
router.use("/:token", tokenRouter);

export default router;
