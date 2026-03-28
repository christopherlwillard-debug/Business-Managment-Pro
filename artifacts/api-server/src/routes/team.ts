import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { db, accessRequestsTable, sessionsTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { getOwnerId } from "./guards";

type SectionKey =
  | "expenses" | "jobs" | "invoices" | "clients" | "mileage"
  | "subcontractors" | "daily_logs" | "estimates" | "compliance";

const SECTION_KEYS: SectionKey[] = [
  "expenses", "jobs", "invoices", "clients", "mileage",
  "subcontractors", "daily_logs", "estimates", "compliance",
];

type RawSectionPerm = { view?: unknown; edit?: unknown };

function validatePermissionsPayload(value: unknown): string | null {
  if (value === null || value === undefined) return "permissions required";
  if (typeof value !== "object" || Array.isArray(value)) return "permissions must be a plain object";
  const obj = value as Record<string, unknown>;
  for (const key of SECTION_KEYS) {
    const section = obj[key];
    if (section === undefined) continue;
    if (section === null || typeof section !== "object" || Array.isArray(section)) {
      return `${key}: section permissions must be an object`;
    }
  }
  return null;
}

function normalizePermissions(raw: unknown): Record<SectionKey, { view: boolean; edit: boolean }> {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, RawSectionPerm | undefined>;
  const result = {} as Record<SectionKey, { view: boolean; edit: boolean }>;
  for (const key of SECTION_KEYS) {
    const p: RawSectionPerm = input[key] ?? {};
    const edit = !!p.edit;
    const view = !!p.view || edit;
    result[key] = { view, edit };
  }
  return result;
}

const router = Router();

const requireOwner: RequestHandler = (req, res, next) => {
  const userId = (req.user as { id?: string } | undefined)?.id;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  getOwnerId().then(ownerId => {
    if (ownerId === userId) next();
    else res.status(403).json({ error: "Owner access required" });
  }).catch(next);
};

router.use(requireOwner);

router.get("/requests", async (_req: Request, res: Response) => {
  try {
    const requests = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.status, "pending"))
      .orderBy(accessRequestsTable.requestedAt);
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

router.post("/requests/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request id" }); return; }
    const { permissions } = req.body;
    const permError = validatePermissionsPayload(permissions);
    if (permError) { res.status(400).json({ error: permError }); return; }

    const [existing] = await db.select({ status: accessRequestsTable.status })
      .from(accessRequestsTable).where(eq(accessRequestsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Request not found" }); return; }
    if (existing.status !== "pending") { res.status(409).json({ error: "Only pending requests can be approved" }); return; }

    const normalized = normalizePermissions(permissions);

    const [updated] = await db
      .update(accessRequestsTable)
      .set({ status: "approved", permissions: normalized, resolvedAt: new Date() })
      .where(eq(accessRequestsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Request not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve request" });
  }
});

router.post("/requests/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid request id" }); return; }
    const [existing] = await db.select({ status: accessRequestsTable.status })
      .from(accessRequestsTable).where(eq(accessRequestsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Request not found" }); return; }
    if (existing.status !== "pending") { res.status(409).json({ error: "Only pending requests can be rejected" }); return; }
    const [updated] = await db
      .update(accessRequestsTable)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(accessRequestsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Request not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

router.get("/members", async (_req: Request, res: Response) => {
  try {
    const members = await db
      .select()
      .from(accessRequestsTable)
      .where(or(
        eq(accessRequestsTable.status, "approved"),
        eq(accessRequestsTable.status, "invited"),
      ))
      .orderBy(accessRequestsTable.resolvedAt);
    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

router.post("/members/invite", async (req: Request, res: Response) => {
  try {
    const { email, permissions } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email address required" });
      return;
    }

    const permError = validatePermissionsPayload(permissions);
    if (permError) { res.status(400).json({ error: permError }); return; }

    const normalized = normalizePermissions(permissions ?? {});

    const trimmedEmail = email.trim().toLowerCase();

    const [existing] = await db
      .select({ id: accessRequestsTable.id, status: accessRequestsTable.status })
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.userEmail, trimmedEmail));

    if (existing) {
      if (existing.status === "approved") {
        res.status(409).json({ error: "A team member with this email is already active." });
      } else if (existing.status === "invited") {
        res.status(409).json({ error: "This email has already been invited." });
      } else if (existing.status === "pending") {
        res.status(409).json({ error: "This person has already requested access. Approve them from the pending requests list." });
      } else {
        res.status(409).json({ error: "A record already exists for this email." });
      }
      return;
    }

    const placeholderUserId = `invite:${trimmedEmail}`;
    const [created] = await db
      .insert(accessRequestsTable)
      .values({
        userId: placeholderUserId,
        userName: trimmedEmail,
        userEmail: trimmedEmail,
        status: "invited",
        permissions: normalized,
        resolvedAt: new Date(),
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create invite" });
  }
});

router.put("/members/:userId/permissions", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;
    const permError = validatePermissionsPayload(permissions);
    if (permError) { res.status(400).json({ error: permError }); return; }

    const normalized = normalizePermissions(permissions);

    const [updated] = await db
      .update(accessRequestsTable)
      .set({ permissions: normalized })
      .where(and(
        eq(accessRequestsTable.userId, userId),
        or(eq(accessRequestsTable.status, "approved"), eq(accessRequestsTable.status, "invited")),
      ))
      .returning();
    if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update permissions" });
  }
});

router.delete("/members/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const ownerId = await getOwnerId();
    if (ownerId === userId) {
      res.status(400).json({ error: "Cannot remove the owner" });
      return;
    }

    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.userId, userId));

    if (!userId.startsWith("invite:")) {
      await db.delete(sessionsTable)
        .where(sql`${sessionsTable.sess}->'user'->>'id' = ${userId}`);
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

export default router;
