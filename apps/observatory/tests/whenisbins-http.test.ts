import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: { observedEvent: { findMany: vi.fn() } } }));
import { prisma } from "@/lib/db";
import { GET } from "../src/app/api/monitoring/whenisbins/route";
const query = vi.mocked(prisma.observedEvent.findMany);
const key = "synthetic-collection-key-at-least-32";
const request = (credential = key) => new Request("http://observatory/api/monitoring/whenisbins", { headers: { "x-collection-key": credential } });
beforeEach(() => { vi.stubEnv("PUBLIC_MODE", "false"); vi.stubEnv("OBSERVATORY_COLLECTION_KEY", key); vi.stubEnv("OBSERVATORY_EVALUATION_KEY", "independent-evaluation-key-at-least-32"); query.mockReset(); query.mockResolvedValue([]); });
afterEach(() => vi.unstubAllEnvs());
test("public mode, missing credentials and reused role secrets prevent any DB read", async () => {
 vi.stubEnv("PUBLIC_MODE", "true"); expect((await GET(request())).status).toBe(503);
 vi.stubEnv("PUBLIC_MODE", "false"); expect((await GET(request("wrong"))).status).toBe(401);
 vi.stubEnv("OBSERVATORY_EVALUATION_KEY", key); expect((await GET(request())).status).toBe(503); expect(query).not.toHaveBeenCalled();
});
test("monitoring reads only bounded connector snapshots, never truth or another source", async () => {
 const response = await GET(request()); expect(response.status).toBe(200); expect(query).toHaveBeenCalledWith({ where: { sourceService: "whenisbins_connector" }, orderBy: { receivedAt: "desc" }, take: 500, select: { snapshot: true } }); expect(JSON.stringify(await response.json())).not.toContain("execution_class"); expect(response.headers.get("cache-control")).toContain("no-store");
});
