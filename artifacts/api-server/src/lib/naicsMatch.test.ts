import { describe, expect, it } from "vitest";
// This pure classifier is owned by the bid UI; the API suite is the project's
// existing Vitest workspace, so regression coverage intentionally crosses the
// package boundary without adding a second frontend test runner.
// @ts-ignore -- test-only import intentionally sits outside the API rootDir
import { getNaicsMatch } from "../../../contractor-app/src/pages/bids/types.js";

describe("getNaicsMatch", () => {
  const primaryCodes = ["238350", "811310"];

  it("returns exact for a full-code match", () => {
    expect(getNaicsMatch("238350", primaryCodes)).toBe("exact");
  });

  it("returns related for a different code in the same three-digit group", () => {
    expect(getNaicsMatch("238990", primaryCodes)).toBe("related");
  });

  it("returns none for a different three-digit group", () => {
    expect(getNaicsMatch("561720", primaryCodes)).toBe("none");
  });

  it("returns none when the bid or profile codes are missing", () => {
    expect(getNaicsMatch(null, primaryCodes)).toBe("none");
    expect(getNaicsMatch("238350", [])).toBe("none");
  });

  it("does not classify malformed or truncated codes", () => {
    expect(getNaicsMatch("23", primaryCodes)).toBe("none");
    expect(getNaicsMatch("238350", ["238"])).toBe("none");
    expect(getNaicsMatch("238-350", primaryCodes)).toBe("none");
  });
});