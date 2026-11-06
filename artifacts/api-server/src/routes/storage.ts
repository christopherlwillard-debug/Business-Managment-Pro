import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getOwnerId, getRequestUserId } from "./guards";
import type { Permissions, SectionKey } from "./guards";
import { db, accessRequestsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_GENERIC_UPLOAD_BYTES = 25 * 1024 * 1024;
const GENERIC_UPLOAD_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/plain",
  "text/csv",
  "application/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "video/mp4",
  "video/quicktime",
]);

function validateGenericUploadMetadata(value: unknown):
  | { ok: true; metadata: { name: string; size: number; contentType: string } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Upload details must be an object." };
  }
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || [...input.name].length > 255) {
    return { ok: false, error: "Choose a valid filename (255 characters or fewer)." };
  }
  if (!Number.isSafeInteger(input.size) || (input.size as number) <= 0 || (input.size as number) > MAX_GENERIC_UPLOAD_BYTES) {
    return { ok: false, error: "Files must be larger than 0 bytes and no larger than 25 MB." };
  }
  if (typeof input.contentType !== "string") {
    return { ok: false, error: "A supported file content type is required." };
  }
  const contentType = input.contentType.split(";")[0].trim().toLowerCase();
  if (!GENERIC_UPLOAD_CONTENT_TYPES.has(contentType)) {
    return { ok: false, error: "This file type is not supported." };
  }
  return { ok: true, metadata: { name: input.name.trim(), size: input.size as number, contentType } };
}


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

  const validation = validateGenericUploadMetadata(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: validation.metadata });
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
