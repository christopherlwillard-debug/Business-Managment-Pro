import { describe, expect, it } from "vitest";
import { getWebsiteViewTrackingKey } from "./publicViewTracking";

describe("getWebsiteViewTrackingKey", () => {
  it("separates pages within a website", () => {
    expect(getWebsiteViewTrackingKey("site", null)).toBe("site:home");
    expect(getWebsiteViewTrackingKey("site", "services")).toBe("site:services");
    expect(getWebsiteViewTrackingKey("site", "about")).not.toBe(getWebsiteViewTrackingKey("site", "services"));
  });
});
