import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getOwnerId, getRequestUserId } from "./guards";
import type { Permissions, SectionKey } from "./guards";
import { db, accessRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Determine required authorization for a private object path.
 *
 * Returns:
 *   { kind: "owner" }              – only the business owner may access
 *   { kind: "section", key }       – any user with view access to that section
 *   { kind: "approved" }           – any approved user (e.g. logos shown in UI)
 */
function resolveObjectPolicy(
  wildcardPath: string,
): { kind: "owner" } | { kind: "section"; key: SectionKey } | { kind: "approved" } {
  if (wildcardPath.startsWith("uploads/receipts/")) {
    return { kind: "section", key: "expenses" };
  }
  if (wildcardPath.startsWith("uploads/asset-receipts/")) {
    return { kind: "owner" };
  }
  if (wildcardPath.startsWith("compliance-items/")) {
    return { kind: "section", key: "compliance" };
  }
  if (wildcardPath.startsWith("ky-filings/")) {
    return { kind: "section", key: "compliance" };
  }
  if (wildcardPath.startsWith("uploads/logos/")) {
    return { kind: "owner" };
  }
  if (wildcardPath.startsWith("uploads/checklist-photos/")) {
    return { kind: "section", key: "jobs" };
  }
  // All other paths default to owner-only.
  return { kind: "owner" };
}

async function canDownloadObject(req: Request, wildcardPath: string): Promise<boolean> {
  const userId = getRequestUserId(req);
  if (!userId) return false;

  const ownerId = await getOwnerId();
  if (ownerId === userId) return true;

  const policy = resolveObjectPolicy(wildcardPath);

  if (policy.kind === "approved") {
    return true;
  }

  if (policy.kind === "owner") {
    return false;
  }

  // policy.kind === "section" — check that the approved user has view access to that section.
  const [record] = await db
    .select({ permissions: accessRequestsTable.permissions })
    .from(accessRequestsTable)
    .where(and(eq(accessRequestsTable.userId, userId), eq(accessRequestsTable.status, "approved")));

  if (!record) return false;

  const perms = record.permissions as Permissions | null;
  return perms?.[policy.key]?.view === true;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned GCS URL for direct file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response): Promise<void> => {
  const userId = getRequestUserId(req);
  const ownerId = await getOwnerId();
  if (!userId || userId !== ownerId) {
    res.status(403).json({ error: "Owner access required" });
    return;
  }

  const { name, size, contentType } = req.body ?? {};
  if (!name || !size || !contentType) {
    res.status(400).json({ error: "Missing required fields: name, size, contentType" });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * Note: In this app this route is mounted behind requireAuth, so access
 * is limited to authenticated users. Move before auth guards if truly
 * public access is needed.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Error serving public object:", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * Protected — requires prior requireAuth + requireAccess middleware
 * (mounted in index.ts after those guards), plus per-object authorization
 * enforced here based on object path prefix.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

    const allowed = await canDownloadObject(req, wildcardPath);
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const objectPath = `/objects/${wildcardPath}`;
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
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    console.error("Error serving storage object:", error);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

export default router;
