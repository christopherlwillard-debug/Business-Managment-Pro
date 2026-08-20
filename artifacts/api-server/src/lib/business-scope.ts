import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type BusinessScope = {
  id: number;
  slug: string;
};

/**
 * Canonical ownership policy:
 * - businessId is authoritative for records that have it.
 * - businessLine is a legacy slug fallback while the backfill is in progress.
 * - an absent selector means the caller explicitly requested the existing
 *   "all businesses" view; it must never be used for an ID-based mutation.
 */
export async function requestedBusiness(req: Request): Promise<BusinessScope | null> {
  const rawId = req.query.businessId ?? req.body?.businessId;
  const rawSlug = req.query.businessLine ?? req.body?.businessLine;
  const id = rawId != null && String(rawId).trim() !== "" ? Number(rawId) : NaN;
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";

  if (Number.isFinite(id)) {
    const [business] = await db
      .select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.id, id))
      .limit(1);
    return business ?? null;
  }
  if (slug) {
    const [business] = await db
      .select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.slug, slug))
      .limit(1);
    return business ?? null;
  }
  return null;
}

export function invalidBusinessScope(res: Response, scope: BusinessScope | null): boolean {
  if ((res.locals as { businessScopeError?: boolean }).businessScopeError) return true;
  if (scope === null && (res.locals as { businessScopeRequested?: boolean }).businessScopeRequested) {
    res.status(400).json({ error: "Unknown business" });
    return true;
  }
  return false;
}

export function belongsToBusiness(
  record: { businessId?: number | string | null; businessLine?: string | null },
  scope: BusinessScope | null,
): boolean {
  if (!scope) return true;
  if (record.businessId != null) return Number(record.businessId) === scope.id;
  return record.businessLine === scope.slug;
}

export function businessPredicate(
  columns: { businessId?: any; businessLine?: any },
  scope: BusinessScope | null,
) {
  if (!scope) return undefined;
  if (columns.businessId) return eq(columns.businessId, scope.id);
  return eq(columns.businessLine, scope.slug);
}