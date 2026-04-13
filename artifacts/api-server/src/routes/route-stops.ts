import { Router } from "express";
import { db } from "@workspace/db";
import { routeStopsTable } from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (date) conditions.push(eq(routeStopsTable.scheduledDate, date as string));
    if (startDate) conditions.push(gte(routeStopsTable.scheduledDate, startDate as string));
    if (endDate) conditions.push(lte(routeStopsTable.scheduledDate, endDate as string));

    const stops = await db
      .select()
      .from(routeStopsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(routeStopsTable.scheduledDate, routeStopsTable.sortOrder, routeStopsTable.createdAt);

    res.json(stops.map(formatStop));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch route stops" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder } = req.body;
    if (!address) return res.status(400).json({ error: "Address is required" });

    const [stop] = await db.insert(routeStopsTable).values({
      title: title || null,
      address,
      lat: lat ?? null,
      lng: lng ?? null,
      notes: notes || null,
      scheduledDate: scheduledDate || null,
      status: status || "prospect",
      estimatedDurationMinutes: estimatedDurationMinutes ?? 60,
      sortOrder: sortOrder ?? 0,
    }).returning();

    res.status(201).json(formatStop(stop));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create route stop" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder } = req.body;

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title || null;
    if (address !== undefined) updates.address = address;
    if (lat !== undefined) updates.lat = lat;
    if (lng !== undefined) updates.lng = lng;
    if (notes !== undefined) updates.notes = notes || null;
    if (scheduledDate !== undefined) updates.scheduledDate = scheduledDate || null;
    if (status !== undefined) updates.status = status;
    if (estimatedDurationMinutes !== undefined) updates.estimatedDurationMinutes = estimatedDurationMinutes;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [updated] = await db.update(routeStopsTable).set(updates).where(eq(routeStopsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Route stop not found" });

    res.json(formatStop(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update route stop" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(routeStopsTable).where(eq(routeStopsTable.id, parseInt(req.params.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete route stop" });
  }
});

function formatStop(s: any) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

export default router;
