import { Router } from "express";
import { db } from "@workspace/db";
import {
  jobChecklistsTable,
  jobChecklistSectionsTable,
  jobChecklistItemsTable,
  jobsTable,
  clientsTable,
} from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

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

    const sections = await db
      .select()
      .from(jobChecklistSectionsTable)
      .where(eq(jobChecklistSectionsTable.jobChecklistId, row.checklist.id))
      .orderBy(asc(jobChecklistSectionsTable.sortOrder));

    const items = await db
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
      .orderBy(asc(jobChecklistItemsTable.sortOrder));

    const activeSections = sections.filter(s => s.active);
    const activeItems = items.filter(i => {
      const s = activeSections.find(s => s.id === i.jobChecklistSectionId);
      return s && !i.skipped;
    });
    const completedCount = activeItems.filter(i => i.completed).length;
    const overallPercent = activeItems.length === 0
      ? 0
      : Math.round((completedCount / activeItems.length) * 100);

    const locationParts = [row.jobAddress, row.jobCity, row.jobState].filter(Boolean);

    res.json({
      jobTitle: row.jobTitle,
      location: locationParts.join(", ") || null,
      dealerName: row.locationName || null,
      customerName: row.clientName || null,
      templateName: row.checklist.templateName,
      statusOverride: row.checklist.statusOverride || null,
      publicNotes: row.checklist.publicNotes || null,
      updatedAt: row.checklist.updatedAt,
      overallPercent,
      totalItems: activeItems.length,
      completedItems: completedCount,
      sections: activeSections.map(s => {
        const sectionItems = items.filter(i => i.jobChecklistSectionId === s.id);
        const activeCount = sectionItems.filter(i => !i.skipped).length;
        const doneCount = sectionItems.filter(i => i.completed && !i.skipped).length;
        return {
          id: s.id,
          name: s.name,
          notes: s.notes || null,
          sortOrder: s.sortOrder,
          totalItems: activeCount,
          completedItems: doneCount,
          percentComplete: activeCount === 0 ? 0 : Math.round((doneCount / activeCount) * 100),
          items: sectionItems.map(i => ({
            id: i.id,
            title: i.title,
            completed: i.completed,
            completedAt: i.completedAt,
            skipped: i.skipped,
            notes: i.notes || null,
            sortOrder: i.sortOrder,
          })),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load status page" });
  }
});

export default router;
