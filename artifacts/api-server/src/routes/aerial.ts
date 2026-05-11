import { Router, type Request, type Response } from "express";
import { wrapAsync } from "./guards";

const router = Router();

interface OverpassNode {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: "way" | "relation" | "node";
  id: number;
  geometry?: OverpassNode[];
  members?: Array<{
    type: string;
    geometry?: OverpassNode[];
  }>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

type LatLng = [number, number];

function polygonAreaApprox(pts: LatLng[]): number {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][1] * pts[j][0];
    area -= pts[j][1] * pts[i][0];
  }
  return Math.abs(area) / 2;
}

router.get(
  "/aerial/detect",
  wrapAsync(async (req: Request, res: Response) => {
    const latStr = req.query.lat as string | undefined;
    const lngStr = req.query.lng as string | undefined;

    if (!latStr || !lngStr) {
      res.status(400).json({ error: "lat and lng are required" });
      return;
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: "lat and lng must be valid numbers" });
      return;
    }

    const radius = 80;

    const query = `
[out:json][timeout:15];
(
  way["amenity"="parking"](around:${radius},${lat},${lng});
  way["surface"="asphalt"](around:${radius},${lat},${lng});
  way["surface"="concrete"](around:${radius},${lat},${lng});
  way["surface"="paved"](around:${radius},${lat},${lng});
  way["landuse"="parking"](around:${radius},${lat},${lng});
  way["landuse"="commercial"](around:${radius},${lat},${lng});
  relation["amenity"="parking"](around:${radius},${lat},${lng});
);
out geom;
    `.trim();

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "BuildPro/1.0 (Willards General Contracting)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.warn(`[aerial] Overpass API error: HTTP ${response.status}`);
      res.status(502).json({ error: "Overpass API unavailable", polygons: [] });
      return;
    }

    const data = await response.json() as OverpassResponse;
    const elements = data.elements ?? [];

    const polygons: LatLng[][] = [];

    for (const el of elements) {
      if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 3) {
        const pts: LatLng[] = el.geometry.map(n => [n.lat, n.lon]);
        if (pts.length >= 3) polygons.push(pts);
      }

      if (el.type === "relation" && Array.isArray(el.members)) {
        for (const member of el.members) {
          if (member.type === "way" && Array.isArray(member.geometry) && member.geometry.length >= 3) {
            const pts: LatLng[] = member.geometry.map(n => [n.lat, n.lon]);
            if (pts.length >= 3) polygons.push(pts);
          }
        }
      }
    }

    polygons.sort((a, b) => polygonAreaApprox(b) - polygonAreaApprox(a));

    const deduped: LatLng[][] = [];
    for (const poly of polygons) {
      const centroid = poly.reduce(
        (acc, p) => [acc[0] + p[0] / poly.length, acc[1] + p[1] / poly.length],
        [0, 0]
      );
      const isDuplicate = deduped.some(existing => {
        const ec = existing.reduce(
          (acc, p) => [acc[0] + p[0] / existing.length, acc[1] + p[1] / existing.length],
          [0, 0]
        );
        const dlat = Math.abs(centroid[0] - ec[0]);
        const dlng = Math.abs(centroid[1] - ec[1]);
        return dlat < 0.00005 && dlng < 0.00005;
      });
      if (!isDuplicate) deduped.push(poly);
    }

    res.json({ polygons: deduped });
  })
);

export default router;
