export type AerialImageryMode = "current" | "state" | "street";

export type ImageTileCoordinates = {
  x: number;
  y: number;
  z: number;
};

export type StateImagerySource = {
  stateCode: "KY" | "IN" | "IL";
  name: string;
  optionLabel: string;
  details: string;
  coverageNote: string;
  attribution: string;
  kind: "tiled" | "imageServer";
  url: string;
  maxNativeZoom: number;
};

const STATE_IMAGERY: Record<StateImagerySource["stateCode"], StateImagerySource> = {
  KY: {
    stateCode: "KY",
    name: "Kentucky state imagery",
    optionLabel: "Kentucky imagery · 3-inch · 2022–2024",
    details: "3-inch imagery · 2022–2024",
    coverageNote: "Statewide Phase 3 imagery. Areas without a state tile show current imagery.",
    attribution: "Source: Commonwealth of Kentucky, KyFromAbove",
    kind: "tiled",
    url: "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_Imagery_Phase3_3IN_WGS84WM/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 21,
  },
  IN: {
    stateCode: "IN",
    name: "Indiana state imagery",
    optionLabel: "Indiana imagery · 2022–2025",
    details: "2022–2025 collection · usually 6-inch, with some 3-inch areas",
    coverageNote: "Acquisition year and detail vary by county. Areas without state imagery show current imagery.",
    attribution: "Source: Indiana Geographic Information Office (CC0)",
    kind: "imageServer",
    url: "https://di-ingov.img.arcgis.com/arcgis/rest/services/DynamicWebMercator/Indiana_Current_Imagery/ImageServer",
    maxNativeZoom: 20,
  },
  IL: {
    stateCode: "IL",
    name: "Illinois 2025 state imagery",
    optionLabel: "Illinois imagery · 2025 · partial coverage",
    details: "2025 imagery · 6-inch pixels · planning use",
    coverageNote: "This validated 2025 layer covers only part of Illinois. Uncovered areas remain on current imagery.",
    attribution: "Source: Illinois State Geological Survey, 2025 Illinois 911 imagery",
    kind: "imageServer",
    url: "https://data.isgs.illinois.edu/arcgis/rest/services/Imagery/IL_Blk4_East_2025/ImageServer",
    maxNativeZoom: 20,
  },
};

const STATE_ALIASES: Record<string, StateImagerySource["stateCode"]> = {
  KY: "KY",
  KENTUCKY: "KY",
  IN: "IN",
  INDIANA: "IN",
  IL: "IL",
  ILL: "IL",
  ILLINOIS: "IL",
};

export function getStateImagerySource(state?: string | null): StateImagerySource | null {
  const normalized = state?.trim().replace(/\./g, "").toUpperCase();
  const stateCode = normalized ? STATE_ALIASES[normalized] : undefined;
  return stateCode ? STATE_IMAGERY[stateCode] : null;
}

export function buildArcGisImageTileUrl(
  serviceUrl: string,
  coords: ImageTileCoordinates,
  tileSize = 256,
): string {
  const halfWorld = 20037508.342789244;
  const mapUnitsPerPixel = (halfWorld * 2) / (2 ** coords.z * tileSize);
  const minX = coords.x * tileSize * mapUnitsPerPixel - halfWorld;
  const maxX = (coords.x + 1) * tileSize * mapUnitsPerPixel - halfWorld;
  const maxY = halfWorld - coords.y * tileSize * mapUnitsPerPixel;
  const minY = halfWorld - (coords.y + 1) * tileSize * mapUnitsPerPixel;

  const params = new URLSearchParams({
    bbox: [minX, minY, maxX, maxY].map(value => value.toFixed(3)).join(","),
    bboxSR: "3857",
    imageSR: "3857",
    size: `${tileSize},${tileSize}`,
    format: "png32",
    f: "image",
  });

  return `${serviceUrl}/exportImage?${params.toString()}`;
}
