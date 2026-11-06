export type MapCoordinateStop = {
  id: number;
  lat: number | null;
  lng: number | null;
};

export function hasValidMapCoordinates<T extends Pick<MapCoordinateStop, "lat" | "lng">>(
  stop: T,
): stop is T & { lat: number; lng: number } {
  return typeof stop.lat === "number"
    && Number.isFinite(stop.lat)
    && stop.lat >= -90
    && stop.lat <= 90
    && typeof stop.lng === "number"
    && Number.isFinite(stop.lng)
    && stop.lng >= -180
    && stop.lng <= 180;
}

export function getMapReadyStops<T extends MapCoordinateStop>(
  stops: T[],
): Array<T & { lat: number; lng: number }> {
  return stops.filter(hasValidMapCoordinates);
}

/**
 * Stable dependency key for map fitting. It changes when a stop's actual
 * coordinates change, even if the number of geocoded stops stays the same.
 */
export function getMapCoordinateKey(stops: MapCoordinateStop[]): string {
  return getMapReadyStops(stops)
    .map(stop => `${stop.id}:${stop.lat}:${stop.lng}`)
    .join("|");
}
