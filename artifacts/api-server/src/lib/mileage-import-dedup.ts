export interface MileageImportTrip {
  date: string;
  miles: number;
  startLocation: string;
  endLocation: string;
  classification: "business" | "personal";
  notes?: string;
  sourceTripKey?: string;
}

interface ExistingMileageImportTrip {
  date: string;
  miles: string | null;
  startLocation: string | null;
  endLocation: string | null;
  source: string;
  sourceTripKey: string | null;
}

function normalizeSourceTripKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function legacyTripKey(trip: Pick<MileageImportTrip, "date" | "miles" | "startLocation" | "endLocation">): string {
  return [
    trip.date,
    Number(trip.miles).toFixed(2),
    trip.startLocation.trim().toLowerCase(),
    trip.endLocation.trim().toLowerCase(),
  ].join("|");
}

export function partitionMileageImportTrips(
  trips: MileageImportTrip[],
  existingLogs: ExistingMileageImportTrip[],
  importSource: string,
): {
  toInsert: Array<Omit<MileageImportTrip, "sourceTripKey"> & { sourceTripKey: string | null }>;
  duplicatesSkipped: number;
} {
  const fallbackDupSet = new Set(existingLogs.map(log => legacyTripKey({
    date: log.date,
    miles: parseFloat(log.miles ?? "0"),
    startLocation: log.startLocation ?? "",
    endLocation: log.endLocation ?? "",
  })));
  const legacyImportDupSet = new Set(
    existingLogs
      .filter(log => !log.sourceTripKey)
      .map(log => legacyTripKey({
        date: log.date,
        miles: parseFloat(log.miles ?? "0"),
        startLocation: log.startLocation ?? "",
        endLocation: log.endLocation ?? "",
      })),
  );
  const sourceTripDupSet = new Set(
    existingLogs
      .filter(log => log.source === importSource)
      .map(log => normalizeSourceTripKey(log.sourceTripKey))
      .filter((key): key is string => key !== null),
  );

  const toInsert: Array<Omit<MileageImportTrip, "sourceTripKey"> & { sourceTripKey: string | null }> = [];
  let duplicatesSkipped = 0;

  for (const trip of trips) {
    const sourceTripKey = normalizeSourceTripKey(trip.sourceTripKey);
    const fallbackKey = legacyTripKey(trip);
    const isDuplicate = sourceTripKey
      ? sourceTripDupSet.has(sourceTripKey) || legacyImportDupSet.has(fallbackKey)
      : fallbackDupSet.has(fallbackKey);

    if (isDuplicate) {
      duplicatesSkipped++;
      continue;
    }

    toInsert.push({ ...trip, sourceTripKey });
    if (sourceTripKey) sourceTripDupSet.add(sourceTripKey);
    fallbackDupSet.add(fallbackKey);
  }

  return { toInsert, duplicatesSkipped };
}