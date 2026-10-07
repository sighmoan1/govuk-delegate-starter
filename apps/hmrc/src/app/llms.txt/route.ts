import { config } from "@/lib/config";

// A plain-text pointer for language-model agents.
export function GET() {
  const base = config.appUrl;
  const body = `# Claim tax relief for your job expenses

If you are an AI assistant or agent acting for a person:
- Do not sign in as the person or use their password.
- Go to ${base}/act-for-someone, say who you are and what you need to do, and give the person the code. They approve on GOV.UK.
- Registered agents can use the API instead: ${base}/openapi.json
- Machine-readable policy: ${base}/.well-known/agent-access.json
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
