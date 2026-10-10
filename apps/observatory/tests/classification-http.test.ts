import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/classification-store", () => ({ runClassification: vi.fn(), listClassifications: vi.fn() }));
import { runClassification, listClassifications } from "@/lib/classification-store";
import { POST } from "../src/app/api/research/classifications/route";
import { GET } from "../src/app/api/monitoring/classifications/route";
const key="collection-synthetic-only-key-0123456789";
beforeEach(()=>{vi.stubEnv("OBSERVATORY_COLLECTION_KEY",key);vi.stubEnv("OBSERVATORY_EVALUATION_KEY","evaluation-synthetic-only-key-0123456789");vi.stubEnv("PUBLIC_MODE","false");vi.clearAllMocks();});
afterEach(()=>vi.unstubAllEnvs());
it("classifications require collector key and cannot run in public mode",async()=>{
 const denied=await POST(new Request("http://local",{method:"POST",body:"{}"}));expect(denied.status).toBe(401);expect(runClassification).not.toHaveBeenCalled();
 vi.stubEnv("PUBLIC_MODE","true");expect((await GET(new Request("http://local",{headers:{"x-collection-key":key}}))).status).toBe(503);expect(listClassifications).not.toHaveBeenCalled();
});
it("research writes are independent and monitoring is private",async()=>{
 vi.mocked(runClassification).mockResolvedValue({id:"run"} as never);
 const result=await POST(new Request("http://local",{method:"POST",headers:{"x-collection-key":key},body:JSON.stringify({source_service:"hmrc",source_event_id:"id"})}));expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toContain("no-store");expect(runClassification).toHaveBeenCalledWith({source_service:"hmrc",source_event_id:"id"});
 vi.mocked(listClassifications).mockResolvedValue([]);expect((await GET(new Request("http://local",{headers:{"x-collection-key":key}}))).status).toBe(200);
});
