import { describe, expect, it } from "vitest";
import { partitionMileageImportTrips, type MileageImportTrip } from "./mileage-import-dedup";

function trip(overrides: Partial<MileageImportTrip> = {}): MileageImportTrip {
  return {
    date: "2026-08-01",
    miles: 7,
    startLocation: "100 Main St",
    endLocation: "200 Oak St",
    classification: "business",
    sourceTripKey: "08/01/2026 08:00|08/01/2026 08:15",
    ...overrides,
  };
}

describe("partitionMileageImportTrips", () => {
  it("matches a corrected export against legacy imported rows", () => {
    const result = partitionMileageImportTrips(
      [trip({ miles: 7.25, startLocation: "100 Main Street" }), trip()],
      [{
        date: "2026-08-01",
        miles: "7.00",
        startLocation: "100 Main St",
        endLocation: "200 Oak St",
        source: "mileiq",
        sourceTripKey: null,
      }],
      "mileiq",
    );

    expect(result.duplicatesSkipped).toBe(1);
    expect(result.toInsert).toEqual([
      expect.objectContaining({ miles: 7.25, sourceTripKey: "08/01/2026 08:00|08/01/2026 08:15" }),
    ]);
  });

  it("keeps same-route drives distinct when their provider timestamps differ", () => {
    const result = partitionMileageImportTrips(
      [
        trip(),
        trip({ sourceTripKey: "08/01/2026 10:00|08/01/2026 10:15" }),
      ],
      [],
      "mileiq",
    );

    expect(result.duplicatesSkipped).toBe(0);
    expect(result.toInsert).toHaveLength(2);
  });

  it("skips repeated provider keys within the same file", () => {
    const result = partitionMileageImportTrips([trip(), trip()], [], "mileiq");

    expect(result.duplicatesSkipped).toBe(1);
    expect(result.toInsert).toHaveLength(1);
  });
});