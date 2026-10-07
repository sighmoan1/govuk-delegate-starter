import { NextResponse } from "next/server";
import { config } from "@/lib/config";

// For AI agents and apps: how to act for a person with this service properly.
export function GET() {
  const base = config.appUrl;
  return NextResponse.json(
    {
      service: "Claim tax relief for your job expenses",
      policy:
        "Do not sign in as the person or use their password. Agents acting for someone must identify themselves and use permission the person gives through GOV.UK Delegate.",
      routes: {
        browser_agents: {
          description: "Agents using a browser: start here, say who you are, and give the person the code to approve on GOV.UK.",
          start: `${base}/act-for-someone`,
        },
        api_agents: {
          description: "Registered agents with GOV.UK Delegate credentials: ask the person for permission, then call the API with your token and the person's id.",
          delegate: config.delegateUrl,
          openapi: `${base}/openapi.json`,
        },
      },
      identification: {
        web_bot_auth: "Requests signed with Web Bot Auth (RFC 9421) by a recognised operator are identified automatically.",
        recognised_operators: ["https://chatgpt.com", "https://agent.bot.goog"],
      },
      limits: "Limits apply to the person, however many agents act for them.",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
