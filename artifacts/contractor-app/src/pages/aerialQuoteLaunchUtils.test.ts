import { describe, expect, it } from "vitest";
import {
  latestMeasurementRevision,
  parseAerialQuoteLaunch,
  shouldShowNewPropertyForm,
} from "./aerialQuoteLaunchUtils";

describe("Aerial Quote profile launch", () => {
  it("opens a saved client property without opening the new-property form", () => {
    const params = parseAerialQuoteLaunch("?propertyId=42");
    expect(params).toMatchObject({
      propertyId: 42,
      prospectId: null,
      address: "",
    });
    expect(shouldShowNewPropertyForm(params)).toBe(false);
  });

  it("keeps prospect address launches ready to create a linked property", () => {
    const params = parseAerialQuoteLaunch("?prospectId=7&address=12%20Oak%20St&city=Owensboro&state=KY");
    expect(params).toMatchObject({
      propertyId: null,
      prospectId: 7,
      address: "12 Oak St",
      city: "Owensboro",
      state: "KY",
    });
    expect(shouldShowNewPropertyForm(params)).toBe(true);
  });

  it("ignores invalid IDs and chooses the newest immutable revision", () => {
    expect(parseAerialQuoteLaunch("?propertyId=0&prospectId=1.5").propertyId).toBeNull();
    expect(parseAerialQuoteLaunch("?propertyId=0&prospectId=1.5").prospectId).toBeNull();
    const history = [{ id: 2, revision: 1 }, { id: 9, revision: 3 }, { id: 5, revision: 2 }];
    expect(latestMeasurementRevision(history)).toEqual({ id: 9, revision: 3 });
    expect(latestMeasurementRevision([])).toBeNull();
    expect(history).toEqual([{ id: 2, revision: 1 }, { id: 9, revision: 3 }, { id: 5, revision: 2 }]);
  });
});
