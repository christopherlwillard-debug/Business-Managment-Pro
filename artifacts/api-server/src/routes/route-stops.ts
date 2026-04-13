import { Router } from "express";
import { db } from "@workspace/db";
import { routeStopsTable, type RouteStop as RouteStopRow } from "@workspace/db/schema";
import { eq, and, gte, lte, SQL } from "drizzle-orm";

const VALID_STATUSES = ["prospect", "scheduled", "completed", "skipped"] as const;
type ValidStatus = typeof VALID_STATUSES[number];

function isValidStatus(s: unknown): s is ValidStatus {
  return typeof s === "string" && (VALID_STATUSES as readonly string[]).includes(s);
}

const router = Router();

function formatStop(s: RouteStopRow) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const conditions: SQL<unknown>[] = [];
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
    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder } = req.body as {
      title?: string; address: string; lat?: number; lng?: number; notes?: string;
      scheduledDate?: string; status?: string; estimatedDurationMinutes?: number; sortOrder?: number;
    };
    if (!address) return res.status(400).json({ error: "Address is required" });
    if (status !== undefined && !isValidStatus(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const [stop] = await db.insert(routeStopsTable).values({
      title: title || null,
      address,
      lat: lat ?? null,
      lng: lng ?? null,
      notes: notes || null,
      scheduledDate: scheduledDate || null,
      status: status ?? "prospect",
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
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid stop ID" });

    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder } = req.body as {
      title?: string | null; address?: string; lat?: number | null; lng?: number | null;
      notes?: string | null; scheduledDate?: string | null; status?: string;
      estimatedDurationMinutes?: number; sortOrder?: number;
    };

    if (status !== undefined && !isValidStatus(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const updates: Partial<RouteStopRow> = {};
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
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid stop ID" });
    await db.delete(routeStopsTable).where(eq(routeStopsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete route stop" });
  }
});

export default router;
