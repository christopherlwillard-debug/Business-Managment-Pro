/**
 * Crew & Personnel Management API
 *
 * GET  /api/crew/members?businessId=             — list crew members
 * POST /api/crew/members                         — create crew member
 * PATCH /api/crew/members/:id                    — update crew member
 * DELETE /api/crew/members/:id                   — soft-deactivate crew member
 *
 * GET  /api/crew/members/:memberId/certifications — list certs for one member
 * POST /api/crew/members/:memberId/certifications — add certification
 * PATCH /api/crew/certifications/:certId         — update certification
 * DELETE /api/crew/certifications/:certId        — delete certification
 *
 * GET  /api/crew/certifications/expiring?businessId=&days=90 — expiring certs
 * POST /api/crew/certifications/create-tasks     — create dashboard tasks for expiring/expired certs
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { crewMembersTable, crewCertificationsTable, dashboardTasksTable } from "@workspace/db/schema";
import { eq, and, lte, isNull } from "drizzle-orm";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Compute certification status from expires_at date. */
function computeCertStatus(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "unknown";
  const expiry = new Date(expiresAt);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 90) return "expiring_soon";
  return "active";
}

// ── Crew Members ───────────────────────────────────────────────────────────────

/** GET /api/crew/members?businessId= */
router.get("/members", async (req, res) => {
  const businessId = req.query["businessId"] ? Number(req.query["businessId"]) : null;
  try {
    let query = db.select().from(crewMembersTable);
    const rows = businessId
      ? await query.where(eq(crewMembersTable.businessId, businessId))
      : await query;
    res.json(rows);
  } catch (err) {
    console.error("[crew] GET /members error:", err);
    res.status(500).json({ error: "Failed to load crew members" });
  }
});

/** POST /api/crew/members */
router.post("/members", async (req, res) => {
  const { businessId, name, role, title, email, phone, notes } = req.body as {
    businessId?: number;
    name?: string;
    role?: string;
    title?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const [created] = await db
      .insert(crewMembersTable)
      .values({
        businessId: businessId ?? null,
        name: name.trim(),
        role: (role?.trim() ?? "crew") as string,
        title: title?.trim() ?? null,
        email: email?.trim() ?? null,
        phone: phone?.trim() ?? null,
        notes: notes?.trim() ?? null,
        active: true,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("[crew] POST /members error:", err);
    res.status(500).json({ error: "Failed to create crew member" });
  }
});

/** PATCH /api/crew/members/:id */
router.patch("/members/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const { name, role, title, email, phone, notes, active } = req.body as {
    name?: string;
    role?: string;
    title?: string;
    email?: string;
    phone?: string;
    notes?: string;
    active?: boolean;
  };

  const patch: Partial<typeof crewMembersTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined)   patch.name   = name.trim();
  if (role !== undefined)   patch.role   = role.trim() as string;
  if (title !== undefined)  patch.title  = title?.trim() ?? null;
  if (email !== undefined)  patch.email  = email?.trim() ?? null;
  if (phone !== undefined)  patch.phone  = phone?.trim() ?? null;
  if (notes !== undefined)  patch.notes  = notes?.trim() ?? null;
  if (active !== undefined) patch.active = active;

  try {
    const [updated] = await db
      .update(crewMembersTable)
      .set(patch)
      .where(eq(crewMembersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Crew member not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[crew] PATCH /members/:id error:", err);
    res.status(500).json({ error: "Failed to update crew member" });
  }
});

/** DELETE /api/crew/members/:id — soft deactivate */
router.delete("/members/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  try {
    await db
      .update(crewMembersTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(crewMembersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[crew] DELETE /members/:id error:", err);
    res.status(500).json({ error: "Failed to deactivate crew member" });
  }
});

// ── Certifications ─────────────────────────────────────────────────────────────

/** GET /api/crew/members/:memberId/certifications */
router.get("/members/:memberId/certifications", async (req, res) => {
  const memberId = Number(req.params["memberId"]);
  try {
    const rows = await db
      .select()
      .from(crewCertificationsTable)
      .where(eq(crewCertificationsTable.crewMemberId, memberId));
    res.json(rows);
  } catch (err) {
    console.error("[crew] GET /members/:memberId/certifications error:", err);
    res.status(500).json({ error: "Failed to load certifications" });
  }
});

/** POST /api/crew/members/:memberId/certifications */
router.post("/members/:memberId/certifications", async (req, res) => {
  const memberId = Number(req.params["memberId"]);
  const { certificationName, issuingBody, certNumber, issuedDate, expiresAt, notes } = req.body as {
    certificationName?: string;
    issuingBody?: string;
    certNumber?: string;
    issuedDate?: string;
    expiresAt?: string;
    notes?: string;
  };

  if (!certificationName?.trim()) {
    res.status(400).json({ error: "certificationName is required" });
    return;
  }

  // Verify member exists
  const [member] = await db
    .select({ id: crewMembersTable.id })
    .from(crewMembersTable)
    .where(eq(crewMembersTable.id, memberId))
    .limit(1);
  if (!member) { res.status(404).json({ error: "Crew member not found" }); return; }

  const status = computeCertStatus(expiresAt);

  try {
    const [created] = await db
      .insert(crewCertificationsTable)
      .values({
        crewMemberId:      memberId,
        certificationName: certificationName.trim(),
        issuingBody:       issuingBody?.trim() ?? null,
        certNumber:        certNumber?.trim() ?? null,
        issuedDate:        issuedDate ?? null,
        expiresAt:         expiresAt ?? null,
        status,
        notes:             notes?.trim() ?? null,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("[crew] POST /members/:memberId/certifications error:", err);
    res.status(500).json({ error: "Failed to create certification" });
  }
});

/** PATCH /api/crew/certifications/:certId */
router.patch("/certifications/:certId", async (req, res) => {
  const certId = Number(req.params["certId"]);
  const { certificationName, issuingBody, certNumber, issuedDate, expiresAt, notes } = req.body as {
    certificationName?: string;
    issuingBody?: string;
    certNumber?: string;
    issuedDate?: string;
    expiresAt?: string;
    notes?: string;
  };

  const patch: Partial<typeof crewCertificationsTable.$inferInsert> = { updatedAt: new Date() };
  if (certificationName !== undefined) patch.certificationName = certificationName.trim();
  if (issuingBody !== undefined)       patch.issuingBody = issuingBody?.trim() ?? null;
  if (certNumber !== undefined)        patch.certNumber = certNumber?.trim() ?? null;
  if (issuedDate !== undefined)        patch.issuedDate = issuedDate ?? null;
  if (expiresAt !== undefined) {
    patch.expiresAt = expiresAt ?? null;
    patch.status = computeCertStatus(expiresAt);
  }
  if (notes !== undefined) patch.notes = notes?.trim() ?? null;

  try {
    const [updated] = await db
      .update(crewCertificationsTable)
      .set(patch)
      .where(eq(crewCertificationsTable.id, certId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Certification not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[crew] PATCH /certifications/:certId error:", err);
    res.status(500).json({ error: "Failed to update certification" });
  }
});

/** DELETE /api/crew/certifications/:certId */
router.delete("/certifications/:certId", async (req, res) => {
  const certId = Number(req.params["certId"]);
  try {
    await db
      .delete(crewCertificationsTable)
      .where(eq(crewCertificationsTable.id, certId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[crew] DELETE /certifications/:certId error:", err);
    res.status(500).json({ error: "Failed to delete certification" });
  }
});

// ── Expiring certifications ────────────────────────────────────────────────────

/** GET /api/crew/certifications/expiring?businessId=&days=90 */
router.get("/certifications/expiring", async (req, res) => {
  const businessId = req.query["businessId"] ? Number(req.query["businessId"]) : null;
  const days = req.query["days"] ? Number(req.query["days"]) : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = cutoff.toISOString().split("T")[0]!;
  const todayStr  = new Date().toISOString().split("T")[0]!;

  try {
    // Get certs expiring within [today, cutoff] PLUS already-expired ones
    const allCerts = await db
      .select({
        cert:   crewCertificationsTable,
        member: crewMembersTable,
      })
      .from(crewCertificationsTable)
      .innerJoin(crewMembersTable, eq(crewCertificationsTable.crewMemberId, crewMembersTable.id))
      .where(
        and(
          businessId ? eq(crewMembersTable.businessId, businessId) : undefined,
          eq(crewMembersTable.active, true),
          // expires_at IS NOT NULL AND expires_at <= cutoff
          lte(crewCertificationsTable.expiresAt, cutoffStr),
        )
      );

    // Also refresh computed status
    const results = allCerts.map(({ cert, member }) => ({
      ...cert,
      memberName: member.name,
      memberRole: member.role,
      computedStatus: computeCertStatus(cert.expiresAt),
    }));

    res.json(results);
  } catch (err) {
    console.error("[crew] GET /certifications/expiring error:", err);
    res.status(500).json({ error: "Failed to load expiring certifications" });
  }
});

// ── Dashboard task creation ────────────────────────────────────────────────────

/**
 * POST /api/crew/certifications/create-tasks
 * Scans all crew certifications for a business, finds expired or expiring-within-30-days
 * items, and creates dashboard_tasks for them.
 */
router.post("/certifications/create-tasks", async (req, res) => {
  const { businessId } = req.body as { businessId?: number };
  if (!businessId) {
    res.status(400).json({ error: "businessId is required" });
    return;
  }

  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const cutoffStr = thirtyDaysOut.toISOString().split("T")[0]!;

  try {
    const expiring = await db
      .select({
        cert:       crewCertificationsTable,
        memberName: crewMembersTable.name,
      })
      .from(crewCertificationsTable)
      .innerJoin(crewMembersTable, eq(crewCertificationsTable.crewMemberId, crewMembersTable.id))
      .where(
        and(
          eq(crewMembersTable.businessId, businessId),
          eq(crewMembersTable.active, true),
          lte(crewCertificationsTable.expiresAt, cutoffStr),
        )
      );

    if (expiring.length === 0) {
      res.json({ ok: true, created: 0, message: "No certifications expiring within 30 days." });
      return;
    }

    let created = 0;
    for (const { cert, memberName } of expiring) {
      const status = computeCertStatus(cert.expiresAt);
      const expiryLabel = cert.expiresAt
        ? `expires ${cert.expiresAt}`
        : "expiry unknown";
      const prefix = status === "expired" ? "EXPIRED:" : "Renew";
      const title = `${prefix} ${cert.certificationName} for ${memberName} — ${expiryLabel}`;
      const description = `Crew certification ${status === "expired" ? "has expired" : "is expiring soon"}: ${cert.certificationName}` +
        (cert.issuingBody ? ` (${cert.issuingBody})` : "") +
        (cert.certNumber ? ` — cert # ${cert.certNumber}` : "") +
        `. Action required for ${memberName}.`;

      // Idempotency: skip if an open (not completed) task with this exact title already exists.
      const [duplicate] = await db
        .select({ id: dashboardTasksTable.id })
        .from(dashboardTasksTable)
        .where(
          and(
            eq(dashboardTasksTable.businessId, businessId),
            eq(dashboardTasksTable.title, title),
            // Only deduplicate against open tasks — if it was completed, recreate it
            isNull(dashboardTasksTable.completedAt),
          )
        )
        .limit(1);

      if (duplicate) continue;  // already tracked

      await db.insert(dashboardTasksTable).values({
        businessId,
        title,
        notes:    description,
        priority: status === "expired" ? "high" : "medium",
        dueDate:  cert.expiresAt ?? null,  // date column expects string (YYYY-MM-DD), not Date object
      });

      created++;
    }

    res.json({ ok: true, created, message: `Created ${created} certification task(s).` });
  } catch (err) {
    console.error("[crew] POST /certifications/create-tasks error:", err);
    res.status(500).json({ error: "Failed to create certification tasks" });
  }
});

export default router;
