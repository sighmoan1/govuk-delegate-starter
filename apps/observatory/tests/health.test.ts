import { describe, expect, it } from "vitest";
import { healthResponse } from "../src/lib/health";

describe("Observatory readiness", () => {
  it("reports ready only after the database schema check succeeds", async () => {
    let checked = false;
    const response = await healthResponse(async () => { checked = true; return 0; });
    expect(checked).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ service: "observatory", status: "ready", database: "ready" });
  });
  it("returns unavailable without disclosing database errors", async () => {
    const response = await healthResponse(async () => { throw new Error("secret connection URL"); });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ service: "observatory", status: "unavailable", database: "unavailable" });
  });
});
