import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { businessesTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";

export type BusinessScope = {
  id: number;
  slug: string;
};

export type MutationBusinessResolution =
  | { ok: true; business: BusinessScope; explicit: boolean }
  | { ok: false; error: "Unknown business" };

export type CanonicalRecordBusinessResolution =
  | { state: "resolved"; business: BusinessScope }
  | { state: "blank" }
  | { state: "invalid" };

function suppliedSelector(req: Request): { id?: number; slug?: string; explicit: boolean; invalid?: boolean } {
  const rawId = req.query.businessId ?? req.body?.businessId;
  const rawSlug = req.query.businessLine ?? req.body?.businessLine;
  const idText = rawId == null ? "" : String(rawId).trim();
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
  if (idText) {
    const id = Number(idText);
    return Number.isInteger(id) && id > 0
      ? { id, ...(slug ? { slug } : {}), explicit: true }
      : { ...(slug ? { slug } : {}), explicit: true, invalid: true };
  }
  return slug ? { slug, explicit: true } : { explicit: false };
}

/**
 * Resolves an owner for a write. Unlike requestedBusiness (which permits an
 * all-business read), writes always receive a canonical business id and slug.
 * General Contracting is deliberately identified by its stable slug, never an
 * installation-specific numeric id.
 */
export async function resolveMutationBusiness(req: Request): Promise<MutationBusinessResolution> {
  const selector = suppliedSelector(req);
  if (selector.invalid) {
    return { ok: false, error: "Unknown business" };
  }
  if (selector.id != null && selector.slug) {
    const matches = await db
      .select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(or(eq(businessesTable.id, selector.id), eq(businessesTable.slug, selector.slug)))
      .limit(2);
    const idBusiness = matches.find(business => business.id === selector.id);
    const slugBusiness = matches.find(business => business.slug === selector.slug);
    return idBusiness && slugBusiness && idBusiness.id === slugBusiness.id
      ? { ok: true, business: idBusiness, explicit: true }
      : { ok: false, error: "Unknown business" };
  }
  const where = selector.id != null
    ? eq(businessesTable.id, selector.id)
    : selector.slug
      ? eq(businessesTable.slug, selector.slug)
      : eq(businessesTable.slug, "general_contracting");
  const [business] = await db
    .select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable)
    .where(where)
    .limit(1);
  return business ? { ok: true, business, explicit: selector.explicit } : { ok: false, error: "Unknown business" };
}

/** The permanent parent/default owner, identified only by its stable slug. */
export async function generalContractingBusiness(): Promise<BusinessScope | null> {
  const [business] = await db.select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable).where(eq(businessesTable.slug, "general_contracting")).limit(1);
  return business ?? null;
}

/** Resolve a legacy owner stored as an id or slug to its canonical pair. */
export async function canonicalRecordBusiness(
  record: { businessId?: number | string | null; businessLine?: string | null },
): Promise<CanonicalRecordBusinessResolution> {
  const idText = record.businessId == null ? "" : String(record.businessId).trim();
  const id = idText ? Number(idText) : null;
  const slug = typeof record.businessLine === "string" ? record.businessLine.trim() : "";
  if (!idText && !slug) return { state: "blank" };
  if (idText && (!Number.isInteger(id) || (id as number) <= 0)) return { state: "invalid" };

  if (id != null && slug) {
    const matches = await db.select({ id: businessesTable.id, slug: businessesTable.slug })
      .from(businessesTable)
      .where(or(eq(businessesTable.id, id), eq(businessesTable.slug, slug)))
      .limit(2);
    const idBusiness = matches.find(business => business.id === id);
    const slugBusiness = matches.find(business => business.slug === slug);
    return idBusiness && slugBusiness && idBusiness.id === slugBusiness.id
      ? { state: "resolved", business: idBusiness }
      : { state: "invalid" };
  }

  const where = id != null ? eq(businessesTable.id, id) : eq(businessesTable.slug, slug);
  const [business] = await db.select({ id: businessesTable.id, slug: businessesTable.slug })
    .from(businessesTable).where(where).limit(1);
  return business ? { state: "resolved", business } : { state: "invalid" };
}

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