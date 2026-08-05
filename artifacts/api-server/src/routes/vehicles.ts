import { Router } from "express";
import { db } from "@workspace/db";
import { vehiclesTable, settingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// EIA duoarea codes for US states
const STATE_TO_EIA_CODE: Record<string, string> = {
  AL: "SAL", AK: "SAK", AZ: "SAZ", AR: "SAR", CA: "SCA", CO: "SCO",
  CT: "SCT", DE: "SDE", FL: "SFL", GA: "SGA", HI: "SHI", ID: "SID",
  IL: "SIL", IN: "SIN", IA: "SIA", KS: "SKS", KY: "SKY", LA: "SLA",
  ME: "SME", MD: "SMD", MA: "SMA", MI: "SMI", MN: "SMN", MS: "SMS",
  MO: "SMO", MT: "SMT", NE: "SNE", NV: "SNV", NH: "SNH", NJ: "SNJ",
  NM: "SNM", NY: "SNY", NC: "SNC", ND: "SND", OH: "SOH", OK: "SOK",
  OR: "SOR", PA: "SPA", RI: "SRI", SC: "SSC", SD: "SSD", TN: "STN",
  TX: "STX", UT: "SUT", VT: "SVT", VA: "SVA", WA: "SWA", WV: "SWV",
  WI: "SWI", WY: "SWY", DC: "SDC",
};

function formatVehicle(v: typeof vehiclesTable.$inferSelect) {
  return {
    ...v,
    avgMpg: v.avgMpg ?? 17,
    fuelPricePerGallon: v.fuelPricePerGallon != null ? parseFloat(String(v.fuelPricePerGallon)) : null,
    fuelPriceUpdatedAt: v.fuelPriceUpdatedAt instanceof Date ? v.fuelPriceUpdatedAt.toISOString() : (v.fuelPriceUpdatedAt ?? null),
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : v.updatedAt,
  };
}

// GET /api/vehicles — list all vehicles
router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(vehiclesTable).orderBy(desc(vehiclesTable.isDefault), vehiclesTable.createdAt);
    res.json(rows.map(formatVehicle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// POST /api/vehicles — create a vehicle
router.post("/", async (req, res) => {
  try {
    const { nickname, year, make, model, avgMpg, fuelPricePerGallon, isDefault } = req.body;
    if (!nickname || !String(nickname).trim()) {
      return res.status(400).json({ error: "Nickname is required" });
    }
    const mpg = avgMpg != null ? parseInt(String(avgMpg)) : 17;
    if (isNaN(mpg) || mpg < 1 || mpg > 999) {
      return res.status(400).json({ error: "avgMpg must be between 1 and 999" });
    }

    // If this is default, clear other defaults first
    const makeDefault = isDefault === true || isDefault === 1;
    if (makeDefault) {
      await db.update(vehiclesTable).set({ isDefault: false, updatedAt: new Date() });
    }

    // If no vehicles exist yet, auto-make this one the default
    const existing = await db.select({ id: vehiclesTable.id }).from(vehiclesTable).limit(1);
    const shouldBeDefault = makeDefault || existing.length === 0;

    const [vehicle] = await db.insert(vehiclesTable).values({
      nickname: String(nickname).trim(),
      year: year != null ? parseInt(String(year)) : null,
      make: make ? String(make).trim() || null : null,
      model: model ? String(model).trim() || null : null,
      avgMpg: mpg,
      fuelPricePerGallon: fuelPricePerGallon != null && fuelPricePerGallon !== ""
        ? String(parseFloat(String(fuelPricePerGallon)))
        : null,
      isDefault: shouldBeDefault,
    }).returning();

    res.status(201).json(formatVehicle(vehicle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});

// PUT /api/vehicles/:id — update a vehicle
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid vehicle id" });

    const { nickname, year, make, model, avgMpg, fuelPricePerGallon, isDefault } = req.body;

    const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Vehicle not found" });

    const patch: Partial<typeof vehiclesTable.$inferInsert> = { updatedAt: new Date() };
    if (nickname !== undefined) patch.nickname = String(nickname).trim() || existing.nickname;
    if (year !== undefined) patch.year = year != null && year !== "" ? parseInt(String(year)) : null;
    if (make !== undefined) patch.make = make ? String(make).trim() || null : null;
    if (model !== undefined) patch.model = model ? String(model).trim() || null : null;
    if (avgMpg !== undefined) {
      const mpg = parseInt(String(avgMpg));
      if (!isNaN(mpg) && mpg >= 1 && mpg <= 999) patch.avgMpg = mpg;
    }
    if (fuelPricePerGallon !== undefined) {
      patch.fuelPricePerGallon = fuelPricePerGallon != null && fuelPricePerGallon !== ""
        ? String(parseFloat(String(fuelPricePerGallon)))
        : null;
    }

    const makeDefault = isDefault === true || isDefault === 1;
    if (makeDefault && !existing.isDefault) {
      await db.update(vehiclesTable).set({ isDefault: false, updatedAt: new Date() });
      patch.isDefault = true;
    }

    const [updated] = await db.update(vehiclesTable).set(patch).where(eq(vehiclesTable.id, id)).returning();
    res.json(formatVehicle(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

// DELETE /api/vehicles/:id — delete a vehicle
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid vehicle id" });

    const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Vehicle not found" });

    await db.delete(vehiclesTable).where(eq(vehiclesTable.id, id));

    // If deleted vehicle was default, set the oldest remaining one as default
    if (existing.isDefault) {
      const [next] = await db.select().from(vehiclesTable).orderBy(vehiclesTable.createdAt).limit(1);
      if (next) {
        await db.update(vehiclesTable).set({ isDefault: true, updatedAt: new Date() }).where(eq(vehiclesTable.id, next.id));
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

// POST /api/vehicles/:id/set-default — set as default vehicle
router.post("/:id/set-default", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid vehicle id" });

    const [existing] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Vehicle not found" });

    // Clear all defaults then set this one
    await db.update(vehiclesTable).set({ isDefault: false, updatedAt: new Date() });
    const [updated] = await db.update(vehiclesTable)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(vehiclesTable.id, id))
      .returning();

    res.json(formatVehicle(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to set default vehicle" });
  }
});

// POST /api/vehicles/:id/fuel-price/refresh — EIA fetch for a specific vehicle
router.post("/:id/fuel-price/refresh", async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid vehicle id" });

    const apiKey = process.env.EIA_API_KEY;
    if (!apiKey) {
      return res.status(422).json({
        error: "EIA_API_KEY not configured. Enter a fuel price manually, or add a free EIA API key (register at eia.gov/opendata) to enable auto-fetch.",
        canManual: true,
      });
    }

    const [vehicle] = await db.select().from(vehiclesTable).where(eq(vehiclesTable.id, id));
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const [s] = await db.select({ companyState: settingsTable.companyState }).from(settingsTable).limit(1);
    const stateAbbr = (s?.companyState ?? "KY").toUpperCase().slice(0, 2);
    const eiaCode = STATE_TO_EIA_CODE[stateAbbr];

    if (!eiaCode) {
      return res.status(422).json({
        error: `No EIA weekly gas price data available for state "${stateAbbr}". Enter a price manually.`,
        canManual: true,
      });
    }

    const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[product][]=EPMRR&facets[duoarea][]=${eiaCode}&sort[0][column]=period&sort[0][direction]=desc&length=1`;
    const eiaRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!eiaRes.ok) throw new Error(`EIA API returned ${eiaRes.status}`);

    const eiaData = await eiaRes.json() as { response?: { data?: Array<{ value?: string | number; period?: string }> } };
    const raw = eiaData?.response?.data?.[0]?.value;
    if (raw == null) throw new Error("No price data in EIA response");

    const price = parseFloat(String(raw));
    if (isNaN(price) || price <= 0) throw new Error("Invalid price in EIA response");

    const updatedAt = new Date();
    const [updated] = await db.update(vehiclesTable)
      .set({ fuelPricePerGallon: String(price), fuelPriceUpdatedAt: updatedAt, updatedAt: new Date() })
      .where(eq(vehiclesTable.id, id))
      .returning();

    res.json({ price, updatedAt: updatedAt.toISOString(), state: stateAbbr, vehicle: formatVehicle(updated) });
  } catch (err: any) {
    console.error("[vehicles/fuel-price/refresh]", err);
    res.status(500).json({
      error: "Failed to fetch fuel price from EIA. Enter a price manually.",
      canManual: true,
    });
  }
});

export default router;
