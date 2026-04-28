import { Router } from "express";
import { db } from "@workspace/db";
import { routeStopsTable, clientsTable, prospectsTable, type RouteStop as RouteStopRow } from "@workspace/db/schema";
import { eq, and, gte, lte, isNull, asc, SQL } from "drizzle-orm";
import { geocodeAddressString } from "../geocode-helpers";

const VALID_STATUSES = ["prospect", "scheduled", "completed", "skipped"] as const;
type ValidStatus = typeof VALID_STATUSES[number];

function isValidStatus(s: unknown): s is ValidStatus {
  return typeof s === "string" && (VALID_STATUSES as readonly string[]).includes(s);
}

const router = Router();

function formatStop(s: RouteStopRow & { clientName?: string | null; prospectContactName?: string | null }) {
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
      .select({
        id: routeStopsTable.id,
        title: routeStopsTable.title,
        address: routeStopsTable.address,
        lat: routeStopsTable.lat,
        lng: routeStopsTable.lng,
        notes: routeStopsTable.notes,
        scheduledDate: routeStopsTable.scheduledDate,
        status: routeStopsTable.status,
        estimatedDurationMinutes: routeStopsTable.estimatedDurationMinutes,
        sortOrder: routeStopsTable.sortOrder,
        blockNumber: routeStopsTable.blockNumber,
        crewLabel: routeStopsTable.crewLabel,
        clientId: routeStopsTable.clientId,
        prospectId: routeStopsTable.prospectId,
        createdAt: routeStopsTable.createdAt,
        clientName: clientsTable.name,
        prospectContactName: prospectsTable.contactName,
        prospectAddress: prospectsTable.address,
      })
      .from(routeStopsTable)
      .leftJoin(clientsTable, eq(routeStopsTable.clientId, clientsTable.id))
      .leftJoin(prospectsTable, eq(routeStopsTable.prospectId, prospectsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(routeStopsTable.scheduledDate, routeStopsTable.sortOrder, routeStopsTable.createdAt);

    res.json(stops.map(s => ({
      ...s,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch route stops" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder, blockNumber, crewLabel, clientId, prospectId } = req.body as {
      title?: string; address: string; lat?: number; lng?: number; notes?: string;
      scheduledDate?: string; status?: string; estimatedDurationMinutes?: number; sortOrder?: number;
      blockNumber?: number | null; crewLabel?: string | null;
      clientId?: number | null; prospectId?: number | null;
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
      blockNumber: blockNumber ?? null,
      crewLabel: crewLabel ?? null,
      clientId: clientId ?? null,
      prospectId: prospectId ?? null,
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

    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder, blockNumber, crewLabel, clientId, prospectId } = req.body as {
      title?: string | null; address?: string; lat?: number | null; lng?: number | null;
      notes?: string | null; scheduledDate?: string | null; status?: string;
      estimatedDurationMinutes?: number; sortOrder?: number;
      blockNumber?: number | null; crewLabel?: string | null;
      clientId?: number | null; prospectId?: number | null;
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
    if (blockNumber !== undefined) updates.blockNumber = blockNumber;
    if (crewLabel !== undefined) updates.crewLabel = crewLabel;
    if (clientId !== undefined) updates.clientId = clientId;
    if (prospectId !== undefined) updates.prospectId = prospectId;

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

const BLOCK_LABELS = [
  "Block A","Block B","Block C","Block D","Block E","Block F",
  "Block G","Block H","Block I","Block J","Block K","Block L",
  "Block M","Block N","Block O","Block P","Block Q","Block R",
  "Block S","Block T","Block U","Block V","Block W","Block X","Block Y","Block Z",
];

router.post("/split-blocks", async (req, res) => {
  try {
    const { date, blockSize = 9 } = req.body as { date: string; blockSize?: number };
    if (!date) return res.status(400).json({ error: "date is required" });

    const stops = await db
      .select({ id: routeStopsTable.id, sortOrder: routeStopsTable.sortOrder })
      .from(routeStopsTable)
      .where(eq(routeStopsTable.scheduledDate, date))
      .orderBy(asc(routeStopsTable.sortOrder), asc(routeStopsTable.createdAt));

    if (stops.length === 0) return res.json({ updated: 0 });

    const size = Math.max(1, Math.floor(blockSize));
    await Promise.all(stops.map((stop, i) => {
      const blockIdx = Math.floor(i / size);
      const blockNumber = blockIdx + 1;
      const crewLabel = BLOCK_LABELS[blockIdx] ?? `Block ${blockIdx + 1}`;
      return db.update(routeStopsTable)
        .set({ blockNumber, crewLabel })
        .where(eq(routeStopsTable.id, stop.id));
    }));

    res.json({ updated: stops.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to split blocks" });
  }
});

router.post("/clear-blocks", async (req, res) => {
  try {
    const { date } = req.body as { date: string };
    if (!date) return res.status(400).json({ error: "date is required" });

    await db.update(routeStopsTable)
      .set({ blockNumber: null, crewLabel: null })
      .where(eq(routeStopsTable.scheduledDate, date));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear blocks" });
  }
});

router.post("/fix-geocoding", async (req, res) => {
  try {
    const missing = await db
      .select({ id: routeStopsTable.id, address: routeStopsTable.address })
      .from(routeStopsTable)
      .where(isNull(routeStopsTable.lat));

    let fixed = 0;
    let failed = 0;

    for (const stop of missing) {
      const coords = await geocodeAddressString(stop.address);
      if (coords) {
        await db
          .update(routeStopsTable)
          .set({ lat: coords.lat, lng: coords.lng })
          .where(eq(routeStopsTable.id, stop.id));
        fixed++;
        console.log(`[fix-geocoding] Fixed stop ${stop.id}: ${stop.address} → ${coords.lat},${coords.lng}`);
      } else {
        failed++;
        console.warn(`[fix-geocoding] Could not geocode stop ${stop.id}: ${stop.address}`);
      }
    }

    res.json({ total: missing.length, fixed, failed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fix geocoding" });
  }
});

export default router;
