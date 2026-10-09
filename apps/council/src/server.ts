import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { councilHandler, type Case } from "./service";
const cases = JSON.parse(await readFile(new URL("../cases.json", import.meta.url), "utf8")) as Case[];
const handler = councilHandler({ delegateUrl: process.env.DELEGATE_INTERNAL_URL ?? "http://localhost:3300", serviceKey: process.env.COUNCIL_SERVICE_KEY ?? "dev-council-service-key", cases });
createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    const answer = await handler(new Request(`http://localhost:3305${req.url}`, { method: req.method, headers }));
    res.writeHead(answer.status, Object.fromEntries(answer.headers)); res.end(await answer.text());
  } catch { res.writeHead(500); res.end("Service unavailable"); }
}).listen(3305, "0.0.0.0", () => console.log("Synthetic council listening on 3305"));
