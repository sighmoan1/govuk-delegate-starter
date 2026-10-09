// Diagnostics are from a synthetic stack, but avoid persisting common secret
// formats if a future log statement accidentally emits request credentials.
import { createInterface } from "node:readline";

for await (const line of createInterface({ input: process.stdin })) {
  const redacted = line
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/(\b(?:authorization|cookie|set-cookie|x-service-key|x-demo-key)\s*[:=]\s*).*/gi, "$1[REDACTED]")
    .replace(/("?(?:access_token|refresh_token|client_secret|session_secret)"?\s*[:=]\s*)"?[^",\s}]+"?/gi, "$1[REDACTED]");
  console.log(redacted);
}
