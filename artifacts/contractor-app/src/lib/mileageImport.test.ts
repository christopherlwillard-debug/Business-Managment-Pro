import { describe, expect, it } from "vitest";
import { MileIQProvider } from "./mileageImport";

function csvTrip(rowNumber: number) {
  const day = String(Math.min(31, Math.ceil(rowNumber / 5))).padStart(2, "0");
  return [
    `08/${day}/2026 08:16`,
    `08/${day}/2026 08:46`,
    "Business",
    `"Start ${rowNumber}, Owensboro, KY"`,
    `"Stop ${rowNumber}, Evansville, IN"`,
    "0.76",
    "20.1",
    `=ROUND(PRODUCT(F${rowNumber + 11}, G${rowNumber + 11}), 2)`,
    "0",
    "0",
    `=SUM(H${rowNumber + 11}, I${rowNumber + 11}, J${rowNumber + 11})`,
    "Missing Vehicle",
    "Business",
    "",
  ].join(",");
}

function mileIQReport(detailRows: string[]) {
  return [
    "rates >>>,business $,0.76,medical $,0.235,charity $,0.14,moving $,0.235",
    "",
    "SUMMARY",
    "",
    "VEHICLE,ODOMETER (START OF YEAR),BUSINESS,COMMUTE,PERSONAL (OTHER),TOTAL DISTANCE,BUSINESS VALUE IN $,PARKING IN $,TOLLS IN $,TOTAL VALUE IN $,MEDICAL,MOVING,CHARITY,UNCLASSIFIED",
    "Missing Vehicle,0,formula,formula,formula,formula,formula,formula,formula,formula,formula,formula,formula,formula",
    "",
    "DETAILED LOG",
    "",
    "START_DATE*,END_DATE*,CATEGORY*,START*,STOP*,RATE,MILES*,MILES_VALUE,PARKING,TOLLS,TOTAL,VEHICLE,PURPOSE,NOTES",
    ...detailRows,
    "Totals,,,,,,=SUM(G11:G157),=SUM(H11:H157),=SUM(I11:I157),=SUM(J11:J157),=SUM(K11:K157)",
    "",
    "Report created at MileIQ.com",
    "",
    "* For an IRS compliant log, these are required for every drive.",
  ].join("\n");
}

describe("MileIQProvider", () => {
  it("imports all 146 detailed trips and ignores MileIQ report footers", () => {
    const csv = mileIQReport(Array.from({ length: 146 }, (_, index) => csvTrip(index + 1)));

    const result = new MileIQProvider().parse(csv);

    expect(result.valid).toHaveLength(146);
    expect(result.invalid).toEqual([]);
    expect(result.valid.reduce((sum, trip) => sum + trip.miles, 0)).toBeCloseTo(2934.6);
  });

  it("still reports malformed rows inside the detailed trip table", () => {
    const csv = mileIQReport([
      csvTrip(1),
      "not-a-date,08/01/2026 09:12,Business,Start,Stop,0.76,7.0",
      csvTrip(3),
    ]);

    const result = new MileIQProvider().parse(csv);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toEqual([
      expect.objectContaining({
        reason: "Invalid or missing date",
        rawData: expect.stringContaining("not-a-date"),
      }),
    ]);
  });
});