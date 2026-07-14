import { Router } from "express";
import { Readable } from "stream";
import { db } from "@workspace/db";
import {
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobChecklistItemPartsTable,
  jobChecklistItemPhotosTable,
  jobStartPhotosTable,
  jobChecklistStatusLogTable,
  jobChecklistSectionNotesTable,
  jobsTable,
  clientsTable,
  settingsTable,
} from "@workspace/db/schema";
import { eq, asc, inArray, and, isNotNull, ne } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const objStorage = new ObjectStorageService();

const router = Router();

router.get("/business-logo", async (req, res) => {
  try {
    const [settings] = await db
      .select({ logoUrl: settingsTable.logoUrl })
      .from(settingsTable)
      .limit(1);
    if (!settings?.logoUrl) return res.status(404).end();
    const objectFile = await objStorage.getObjectEntityFile(settings.logoUrl);
    const response = await objStorage.downloadObject(objectFile, 3600);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "cache-control") res.setHeader(key, value);
    });
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).end();
    console.error("business-logo error", err);
    res.status(500).end();
  }
});

router.get("/status/:token/summary", async (req, res) => {
  try {
    const { token } = req.params;

    const [row] = await db
      .select({
        checklist: jobChecklistsTable,
        jobTitle: jobsTable.title,
      })
      .from(jobChecklistsTable)
      .innerJoin(jobsTable, eq(jobChecklistsTable.jobId, jobsTable.id))
      .where(eq(jobChecklistsTable.shareToken, token));

    if (!row) return res.status(404).json({ error: "Link not found" });
    if (!row.checklist.shareEnabled) return res.status(410).json({ error: "Link not available" });

    const items = await db
      .select({
        id: jobChecklistItemsTable.id,
        jobChecklistSectionId: jobChecklistItemsTable.jobChecklistSectionId,
        completed: jobChecklistItemsTable.completed,
        skipped: jobChecklistItemsTable.skipped,
      })
      .from(jobChecklistItemsTable)
      .where(eq(jobChecklistItemsTable.jobChecklistId, row.checklist.id));

    const sections = await db
      .select({ id: jobChecklistSectionsTable.id, active: jobChecklistSectionsTable.active })
      .from(jobChecklistSectionsTable)
      .where(eq(jobChecklistSectionsTable.jobChecklistId, row.checklist.id));

    const activeSectionIds = new Set(sections.filter(s => s.active).map(s => s.id));
    const activeItems = items.filter(i => activeSectionIds.has(i.jobChecklistSectionId) && !i.skipped);
    const completedCount = activeItems.filter(i => i.completed).length;
    const overallPercent = activeItems.length === 0
      ? 0
      : Math.round((completedCount / activeItems.length) * 100);

    const [settings] = await db
      .select({ companyName: settingsTable.companyName, logoUrl: settingsTable.logoUrl })
      .from(settingsTable)
      .limit(1);

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json({
      jobTitle: row.jobTitle,
      statusOverride: row.checklist.statusOverride || null,
      overallPercent,
      companyName: settings?.companyName ?? null,
      logoUrl: settings?.logoUrl ? "/api/public/business-logo" : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load status summary" });
  }
});

router.get("/status/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const [row] = await db
      .select({
        checklist: jobChecklistsTable,
        jobTitle: jobsTable.title,
        jobAddress: jobsTable.address,
        jobCity: jobsTable.city,
        jobState: jobsTable.state,
        locationName: jobsTable.locationName,
        clientName: clientsTable.name,
      })
      .from(jobChecklistsTable)
      .innerJoin(jobsTable, eq(jobChecklistsTable.jobId, jobsTable.id))
      .leftJoin(clientsTable, eq(jobsTable.clientId, clientsTable.id))
      .where(eq(jobChecklistsTable.shareToken, token));

    if (!row) return res.status(404).json({ error: "Link not found" });
    if (!row.checklist.shareEnabled) return res.status(410).json({ error: "Link not available" });

    const [sections, items] = await Promise.all([
      db
        .select()
        .from(jobChecklistSectionsTable)
        .where(eq(jobChecklistSectionsTable.jobChecklistId, row.checklist.id))
        .orderBy(asc(jobChecklistSectionsTable.sortOrder)),
      db
        .select({
          id: jobChecklistItemsTable.id,
          jobChecklistSectionId: jobChecklistItemsTable.jobChecklistSectionId,
          title: jobChecklistItemsTable.title,
          completed: jobChecklistItemsTable.completed,
          completedAt: jobChecklistItemsTable.completedAt,
          skipped: jobChecklistItemsTable.skipped,
          notes: jobChecklistItemsTable.notes,
          sortOrder: jobChecklistItemsTable.sortOrder,
        })
        .from(jobChecklistItemsTable)
        .where(eq(jobChecklistItemsTable.jobChecklistId, row.checklist.id))
        .orderBy(asc(jobChecklistItemsTable.sortOrder)),
    ]);

    const activeSections = sections.filter(s => s.active);
    const activeItems = items.filter(i => {
      const s = activeSections.find(s => s.id === i.jobChecklistSectionId);
      return s && !i.skipped;
    });

    // Fetch parts + photos + start photos + section notes + delay log in parallel
    const allItemIds = items.map(i => i.id);
    const activeSectionIds = activeSections.map(s => s.id);

    const [parts, photos, startPhotos, sectionNoteRows, delayLog] = await Promise.all([
      allItemIds.length > 0
        ? db.select().from(jobChecklistItemPartsTable)
            .where(inArray(jobChecklistItemPartsTable.jobChecklistItemId, allItemIds))
            .orderBy(asc(jobChecklistItemPartsTable.sortOrder))
        : Promise.resolve([]),
      allItemIds.length > 0
        ? db.select({
            id: jobChecklistItemPhotosTable.id,
            jobChecklistItemId: jobChecklistItemPhotosTable.jobChecklistItemId,
            createdAt: jobChecklistItemPhotosTable.createdAt,
          })
          .from(jobChecklistItemPhotosTable)
          .where(inArray(jobChecklistItemPhotosTable.jobChecklistItemId, allItemIds))
        : Promise.resolve([]),
      db.select({ id: jobStartPhotosTable.id, createdAt: jobStartPhotosTable.createdAt })
        .from(jobStartPhotosTable)
        .where(eq(jobStartPhotosTable.jobChecklistId, row.checklist.id))
        .orderBy(asc(jobStartPhotosTable.createdAt)),
      activeSectionIds.length > 0
        ? db.select()
            .from(jobChecklistSectionNotesTable)
            .where(inArray(jobChecklistSectionNotesTable.jobChecklistSectionId, activeSectionIds))
            .orderBy(asc(jobChecklistSectionNotesTable.createdAt))
        : Promise.resolve([]),
      db.select()
        .from(jobChecklistStatusLogTable)
        .where(
          and(
            eq(jobChecklistStatusLogTable.jobChecklistId, row.checklist.id),
            isNotNull(jobChecklistStatusLogTable.endedAt),
            ne(jobChecklistStatusLogTable.status, "In Progress"),
          )
        )
        .orderBy(asc(jobChecklistStatusLogTable.startedAt)),
    ]);

    const photosByItemId = new Map<number, { id: number; createdAt: Date }[]>();
    for (const p of photos) {
      if (!photosByItemId.has(p.jobChecklistItemId)) photosByItemId.set(p.jobChecklistItemId, []);
      photosByItemId.get(p.jobChecklistItemId)!.push({ id: p.id, createdAt: p.createdAt });
    }

    const partsByItemId = new Map<number, any[]>();
    for (const p of parts) {
      if (!partsByItemId.has(p.jobChecklistItemId)) partsByItemId.set(p.jobChecklistItemId, []);
      partsByItemId.get(p.jobChecklistItemId)!.push(p);
    }

    const notesBySection = new Map<number, any[]>();
    for (const n of sectionNoteRows) {
      if (!notesBySection.has(n.jobChecklistSectionId)) notesBySection.set(n.jobChecklistSectionId, []);
      notesBySection.get(n.jobChecklistSectionId)!.push(n);
    }

    // Fractional overall percent: split items contribute completedParts/totalParts
    let weightedComplete = 0;
    for (const item of activeItems) {
      const itemParts = partsByItemId.get(item.id) ?? [];
      if (itemParts.length > 0) {
        weightedComplete += itemParts.filter(p => p.completed).length / itemParts.length;
      } else {
        weightedComplete += item.completed ? 1 : 0;
      }
    }
    const overallPercent = activeItems.length === 0
      ? 0
      : Math.round((weightedComplete / activeItems.length) * 100);
    const completedCount = activeItems.filter(i => i.completed).length;

    const locationParts = [row.jobAddress, row.jobCity, row.jobState].filter(Boolean);

    const [detailSettings] = await db
      .select({ companyName: settingsTable.companyName, logoUrl: settingsTable.logoUrl })
      .from(settingsTable)
      .limit(1);

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json({
      jobTitle: row.jobTitle,
      location: locationParts.join(", ") || null,
      dealerName: row.locationName || null,
      customerName: row.clientName || null,
      templateName: row.checklist.templateName,
      statusOverride: row.checklist.statusOverride || null,
      publicNotes: row.checklist.publicNotes || null,
      updatedAt: row.checklist.updatedAt,
      companyName: detailSettings?.companyName ?? null,
      logoUrl: detailSettings?.logoUrl ? "/api/public/business-logo" : null,
      overallPercent,
      totalItems: activeItems.length,
      completedItems: completedCount,
      startPhotos: startPhotos.map(p => ({ id: p.id, createdAt: p.createdAt })),
      startNotes: row.checklist.startNotes || null,
      delayLog: delayLog.map(d => ({
        id: d.id,
        status: d.status,
        startedAt: d.startedAt,
        endedAt: d.endedAt,
        durationMin: d.durationMin,
      })),
      sections: activeSections.map(s => {
        const sectionItems = items.filter(i => i.jobChecklistSectionId === s.id && !i.skipped);
        const activeCount = sectionItems.length;
        let sectionWeighted = 0;
        for (const item of sectionItems) {
          const itemParts = partsByItemId.get(item.id) ?? [];
          if (itemParts.length > 0) {
            sectionWeighted += itemParts.filter(p => p.completed).length / itemParts.length;
          } else {
            sectionWeighted += item.completed ? 1 : 0;
          }
        }
        const doneCount = sectionItems.filter(i => i.completed).length;
        return {
          id: s.id,
          name: s.name,
          notes: s.notes || null,
          noteEntries: (notesBySection.get(s.id) ?? []).map(n => ({
            id: n.id,
            note: n.note,
            authorName: n.authorName,
            createdAt: n.createdAt,
          })),
          sortOrder: s.sortOrder,
          totalItems: activeCount,
          completedItems: doneCount,
          percentComplete: activeCount === 0 ? 0 : Math.round((sectionWeighted / activeCount) * 100),
          items: items.filter(i => i.jobChecklistSectionId === s.id).map(i => {
            const itemParts = partsByItemId.get(i.id) ?? [];
            return {
              id: i.id,
              title: i.title,
              completed: i.completed,
              completedAt: i.completedAt,
              skipped: i.skipped,
              notes: i.notes || null,
              sortOrder: i.sortOrder,
              partsTotal: itemParts.length,
              partsDone: itemParts.filter(p => p.completed).length,
              photos: (photosByItemId.get(i.id) ?? []).map(p => ({ id: p.id, createdAt: p.createdAt })),
            };
          }),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load status page" });
  }
});

router.get("/checklist-photos/:photoId", async (req, res) => {
  try {
    const photoId = parseInt(req.params.photoId);
    if (isNaN(photoId)) return res.status(400).json({ error: "Invalid photo ID" });

    const [photo] = await db
      .select({
        objectPath: jobChecklistItemPhotosTable.objectPath,
        checklistShareEnabled: jobChecklistsTable.shareEnabled,
      })
      .from(jobChecklistItemPhotosTable)
      .innerJoin(jobChecklistItemsTable, eq(jobChecklistItemPhotosTable.jobChecklistItemId, jobChecklistItemsTable.id))
      .innerJoin(jobChecklistsTable, eq(jobChecklistItemsTable.jobChecklistId, jobChecklistsTable.id))
      .where(eq(jobChecklistItemPhotosTable.id, photoId));

    if (!photo) return res.status(404).json({ error: "Photo not found" });
    if (!photo.checklistShareEnabled) return res.status(403).json({ error: "Checklist not publicly shared" });

    const objectFile = await objStorage.getObjectEntityFile(photo.objectPath);
    const response = await objStorage.downloadObject(objectFile, 3600);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "cache-control") res.setHeader(key, value);
    });
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Photo not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to serve photo" });
  }
});

router.get("/start-photos/:photoId", async (req, res) => {
  try {
    const photoId = parseInt(req.params.photoId);
    if (isNaN(photoId)) return res.status(400).json({ error: "Invalid photo ID" });

    const [photo] = await db
      .select({
        objectPath: jobStartPhotosTable.objectPath,
        checklistShareEnabled: jobChecklistsTable.shareEnabled,
      })
      .from(jobStartPhotosTable)
      .innerJoin(jobChecklistsTable, eq(jobStartPhotosTable.jobChecklistId, jobChecklistsTable.id))
      .where(eq(jobStartPhotosTable.id, photoId));

    if (!photo) return res.status(404).json({ error: "Photo not found" });
    if (!photo.checklistShareEnabled) return res.status(403).json({ error: "Checklist not publicly shared" });

    const objectFile = await objStorage.getObjectEntityFile(photo.objectPath);
    const response = await objStorage.downloadObject(objectFile, 3600);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "cache-control") res.setHeader(key, value);
    });
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return res.status(404).json({ error: "Photo not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to serve photo" });
  }
});

export default router;
