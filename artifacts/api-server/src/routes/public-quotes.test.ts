import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("public estimate quote routes", () => {
  it("keeps the token route reachable without an authenticated session", async () => {
    const response = await request(app)
      .get("/api/public/quotes/not-a-valid-token")
      .expect(404);

    expect(response.body).toEqual({ error: "Quote is unavailable" });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});
