import { Router } from "express";
import { db } from "@workspace/db";
import { routeStopsTable, clientsTable, prospectsTable, jobsTable, type RouteStop as RouteStopRow } from "@workspace/db/schema";
import { eq, and, gte, lte, isNull, or, asc, SQL } from "drizzle-orm";
import { geocodeAddressString } from "../geocode-helpers";

const VALID_STATUSES = ["prospect", "scheduled", "completed", "skipped"] as const;
type ValidStatus = typeof VALID_STATUSES[number];

function isValidStatus(s: unknown): s is ValidStatus {
  return typeof s === "string" && (VALID_STATUSES as readonly string[]).includes(s);
}

const router = Router();

function formatStop(s: RouteStopRow & { clientName?: string | null; prospectContactName?: string | null; jobSqFt?: number | null; jobCoats?: number | null }) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

async function validateJobClientMatch(jobId: number | null | undefined, clientId: number | null | undefined): Promise<boolean> {
  if (jobId == null) return true;
  const [job] = await db.select({ id: jobsTable.id, clientId: jobsTable.clientId }).from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return false;
  // A route stop may be linked to a job without duplicating its optional client link.
  // When both links are present, they must identify the same customer.
  return clientId == null || job.clientId === clientId;
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
        jobId: routeStopsTable.jobId,
        createdAt: routeStopsTable.createdAt,
        clientName: clientsTable.name,
        prospectContactName: prospectsTable.contactName,
        prospectAddress: prospectsTable.address,
        jobSqFt: jobsTable.sqFt,
        jobCoats: jobsTable.coats,
      })
      .from(routeStopsTable)
      .leftJoin(clientsTable, eq(routeStopsTable.clientId, clientsTable.id))
      .leftJoin(prospectsTable, eq(routeStopsTable.prospectId, prospectsTable.id))
      .leftJoin(jobsTable, eq(routeStopsTable.jobId, jobsTable.id))
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
    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder, blockNumber, crewLabel, clientId, prospectId, jobId } = req.body as {
      title?: string; address: string; lat?: number; lng?: number; notes?: string;
      scheduledDate?: string; status?: string; estimatedDurationMinutes?: number; sortOrder?: number;
      blockNumber?: number | null; crewLabel?: string | null;
      clientId?: number | null; prospectId?: number | null; jobId?: number | null;
    };
    if (!address) return res.status(400).json({ error: "Address is required" });
    if (status !== undefined && !isValidStatus(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    if (jobId != null) {
      const valid = await validateJobClientMatch(jobId, clientId);
      if (!valid) return res.status(400).json({ error: "The selected job does not exist or does not belong to the linked client" });
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
      jobId: jobId ?? null,
    }).returning();

    res.status(201).json(formatStop(stop));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create route stop" });
  }
});

router.post("/reorder", async (req, res) => {
  try {
    const { date, stopIds } = req.body as { date?: unknown; stopIds?: unknown };
    if (typeof date !== "string" || !date) {
      return res.status(400).json({ error: "date is required" });
    }
    if (
      !Array.isArray(stopIds)
      || stopIds.length === 0
      || stopIds.some(id => !Number.isInteger(id) || id <= 0)
      || new Set(stopIds).size !== stopIds.length
    ) {
      return res.status(400).json({ error: "stopIds must be a non-empty list of unique stop IDs" });
    }

    const updated = await db.transaction(async tx => {
      const stops = await tx
        .select({ id: routeStopsTable.id })
        .from(routeStopsTable)
        .where(eq(routeStopsTable.scheduledDate, date));
      const requestedIds = stopIds as number[];
      const existingIds = new Set(stops.map(stop => stop.id));
      if (
        existingIds.size !== requestedIds.length
        || requestedIds.some(id => !existingIds.has(id))
      ) {
        return null;
      }

      for (const [sortOrder, id] of requestedIds.entries()) {
        await tx
          .update(routeStopsTable)
          .set({ sortOrder })
          .where(and(eq(routeStopsTable.id, id), eq(routeStopsTable.scheduledDate, date)));
      }
      return requestedIds.length;
    });

    if (updated == null) {
      return res.status(400).json({ error: "stopIds must contain every route stop for the selected date" });
    }
    res.json({ updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reorder route stops" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid stop ID" });

    const { title, address, lat, lng, notes, scheduledDate, status, estimatedDurationMinutes, sortOrder, blockNumber, crewLabel, clientId, prospectId, jobId } = req.body as {
      title?: string | null; address?: string; lat?: number | null; lng?: number | null;
      notes?: string | null; scheduledDate?: string | null; status?: string;
      estimatedDurationMinutes?: number; sortOrder?: number;
      blockNumber?: number | null; crewLabel?: string | null;
      clientId?: number | null; prospectId?: number | null; jobId?: number | null;
    };

    if (status !== undefined && !isValidStatus(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    // RoutePlanner sends partial edits (often jobId without clientId). Resolve
    // the effective pair from the stored row before validating either link.
    if (clientId !== undefined || jobId !== undefined) {
      const [existing] = await db.select({
        id: routeStopsTable.id,
        clientId: routeStopsTable.clientId,
        jobId: routeStopsTable.jobId,
      }).from(routeStopsTable).where(eq(routeStopsTable.id, id));
      if (!existing) return res.status(404).json({ error: "Route stop not found" });

      const effectiveClientId = clientId !== undefined ? clientId : existing.clientId;
      const effectiveJobId = jobId !== undefined ? jobId : existing.jobId;
      const valid = await validateJobClientMatch(effectiveJobId, effectiveClientId);
      if (!valid) {
        return res.status(400).json({ error: "The selected job does not exist or does not belong to the linked client" });
      }
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
    if (jobId !== undefined) updates.jobId = jobId;

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
    const { date, blockSize = 9 } = (req.body ?? {}) as { date?: unknown; blockSize?: unknown };
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be a YYYY-MM-DD string" });
    }
    if (!Number.isSafeInteger(blockSize) || (blockSize as number) < 1 || (blockSize as number) > 1000) {
      return res.status(400).json({ error: "blockSize must be a whole number between 1 and 1000" });
    }

    // Assign every stop for the date as one unit. A failed row update must not
    // leave the day's route split across a mixture of old and new blocks.
    const updated = await db.transaction(async tx => {
      const stops = await tx
        .select({ id: routeStopsTable.id, sortOrder: routeStopsTable.sortOrder })
        .from(routeStopsTable)
        .where(eq(routeStopsTable.scheduledDate, date))
        .orderBy(asc(routeStopsTable.sortOrder), asc(routeStopsTable.createdAt));

      const size = blockSize as number;
      for (const [index, stop] of stops.entries()) {
        const blockIdx = Math.floor(index / size);
        const blockNumber = blockIdx + 1;
        const crewLabel = BLOCK_LABELS[blockIdx] ?? `Block ${blockIdx + 1}`;
        await tx.update(routeStopsTable)
          .set({ blockNumber, crewLabel })
          .where(eq(routeStopsTable.id, stop.id));
      }
      return stops.length;
    });

    res.json({ updated });
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
      .where(or(isNull(routeStopsTable.lat), isNull(routeStopsTable.lng)));

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
