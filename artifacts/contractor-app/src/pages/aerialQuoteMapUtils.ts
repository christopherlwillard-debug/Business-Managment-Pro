export type LatLng = [number, number];
export type AerialMapGeometry = { polygons: LatLng[][]; lines: LatLng[][] };
export type AerialMapResult = {
  polygons: Array<{ points: LatLng[]; squareFeet: number; perimeterFeet: number }>;
  lines: Array<{ points: LatLng[]; feet: number }>;
};

const GEOMETRY_PREFIX = "aerial-map-geometry:";

export function parseAerialMapGeometry(json: string): AerialMapGeometry {
  try {
    const parsed = JSON.parse(json) as Partial<AerialMapGeometry>;
    return {
      polygons: Array.isArray(parsed.polygons) ? parsed.polygons : [],
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
  } catch {
    return { polygons: [], lines: [] };
  }
}

export function getAerialMapGeometryJson(entries: Array<{ notes?: string | null }>): string {
  const polygons: LatLng[][] = [];
  const lines: LatLng[][] = [];
  for (const entry of entries) {
    if (!entry.notes?.startsWith(GEOMETRY_PREFIX)) continue;
    try {
      const geometry = JSON.parse(entry.notes.slice(GEOMETRY_PREFIX.length)) as {
        kind?: string;
        points?: LatLng[];
      };
      if (!Array.isArray(geometry.points)) continue;
      if (geometry.kind === "area") polygons.push(geometry.points);
      if (geometry.kind === "length") lines.push(geometry.points);
    } catch {
      // Ignore malformed notes so older revisions remain readable.
    }
  }
  return JSON.stringify({ polygons, lines });
}

export function aerialMapGeometryNote(kind: "area" | "length", points: LatLng[]): string {
  return `${GEOMETRY_PREFIX}${JSON.stringify({ kind, points })}`;
}
