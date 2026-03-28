import { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { db, accessRequestsTable, settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOwnerCache, setOwnerCache } from "./owner-cache";

export type SectionKey =
  | "expenses"
  | "jobs"
  | "invoices"
  | "clients"
  | "mileage"
  | "subcontractors"
  | "daily_logs"
  | "estimates"
  | "compliance";

export type SectionPermission = { view: boolean; edit: boolean };
export type Permissions = Record<SectionKey, SectionPermission>;

export const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function getOwnerId(): Promise<string | null> {
  const cached = getOwnerCache();
  if (cached !== undefined) return cached;
  const [settings] = await db.select({ ownerUserId: settingsTable.ownerUserId }).from(settingsTable).limit(1);
  const id = settings?.ownerUserId ?? null;
  setOwnerCache(id);
  return id;
}

interface RequestUser {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  profileImageUrl?: string;
}

export function getRequestUserId(req: Request): string | undefined {
  return (req.user as RequestUser | undefined)?.id;
}

export function getRequestUser(req: Request): RequestUser | undefined {
  return req.user as RequestUser | undefined;
}

export function wrapAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next); };
}

export function sectionGuard(section: SectionKey): RequestHandler {
  return wrapAsync(async (req, res, next) => {
    const userId = getRequestUserId(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const ownerId = await getOwnerId();
    if (ownerId === userId) { next(); return; }

    const [record] = await db
      .select({ permissions: accessRequestsTable.permissions })
      .from(accessRequestsTable)
      .where(and(eq(accessRequestsTable.userId, userId), eq(accessRequestsTable.status, "approved")));

    if (!record) { res.status(403).json({ error: "Forbidden" }); return; }

    const perms = record.permissions as Permissions | null;
    const sectionPerms = perms?.[section];

    if (!sectionPerms) { res.status(403).json({ error: "Forbidden" }); return; }

    const isWrite = WRITE_METHODS.has(req.method.toUpperCase());
    const allowed = isWrite ? sectionPerms.edit : sectionPerms.view;

    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  });
}
