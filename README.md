# GOV.UK Delegate

> Independent prototype — not an official GOV.UK service. Synthetic data only.

Scoped, revocable permission for AI agents (and people and organisations) to act for someone with government services. It copies HMRC's agent-authorisation pattern and is meant to work like GOV.UK One Login: you meet it inside other services, and manage it in your account.

See `docs/` for the case, the original brief and the decisions. Decision 11 covers how this demo differs from the brief.

## Run it

```bash
docker compose up --build        # http://localhost:3300 · One Login simulator :3301 · Postgres :5433
```

The database is migrated and seeded on first start.

**Live AI agent (optional):** `ANTHROPIC_API_KEY=sk-... docker compose up --build`. The agent then runs on Claude (`claude-opus-5-5` by default, override with `ANTHROPIC_MODEL`). Without a key, a scripted agent runs the same tools, so the demo always works.

For development: `cp .env.example .env && docker compose up -d db simulator && npm install && npm run db:migrate && npm run db:seed && npm run dev`.

Back to a clean demo: `npm run db:reset`.

## The demo (about 2 minutes)

You are **Sam**. The assistant suggests what to ask next; GOV.UK pages link back to it in the footer.

1. **Example AI assistant** (`/example-ai`). Ask: *"Can you claim my working-from-home tax relief?"* The agent decides it needs permission and gives you a link to GOV.UK.
2. **GOV.UK consent.** Sign in through the One Login simulator (press **Continue**), choose what to allow, then **Allow**. You are sent straight back to the agent.
3. The agent carries on by itself. It reads your tax code, claims the relief, and reports the new code, 1288L.
4. Ask it to change your refund bank account. HMRC refuses because you never allowed that.
5. **Your GOV.UK account › Who can act for you.** Remove its access.
6. Ask for your tax code again. HMRC refuses because access was removed.
7. **HMRC service team view** (`/operator/activity`). See every attempt from your session, and send an unidentified request to compare the untrusted lane.

## How it fits together

| Surface | Path | Role |
|---|---|---|
| Example AI assistant | `/example-ai` | Third-party agent. Its own credentials; talks to Delegate and HMRC over HTTP only (`src/lib/agent/`) |
| GOV.UK consent | `/consent/:id` | Delegate's consent screen; redirects back to the agent's registered return URL |
| GOV.UK account | `/account/delegates` | See and remove who can act for you |
| Mock HMRC API | `/api/hmrc/*` | `requireDelegatedAuthority` (`src/lib/hmrc.ts`) calls `POST /api/authorisations/check` on every request |
| HMRC team view | `/operator/activity` | Activity, lanes, per-delegate metrics |

## Tests

With the stack running (dev server with `AGENT_MODE=scripted`, or `docker compose up` without a key):

```bash
npm test            # Vitest: scenarios A–F, logging, lanes, lifecycle, return URLs,
                    # scripted agent story, LLM loop against a mocked Messages API
npm run test:e2e    # Playwright: the whole journey through the real simulator, a11y, reflow
```

`e2e/llm.spec.ts` runs against the real model only when the app has `ANTHROPIC_API_KEY`; otherwise it is skipped. Tests leave synthetic rows behind, so run `npm run db:reset` before a demo.

## Notes

- **Activity reasons:** two are added beyond the brief, `RATE_LIMITED` and `HUMAN_SESSION`.
- **Step-up:** step-up authentication for high-risk permissions is flagged in the data and UI only.
- **Dev keys:** `dev/oidc-client-private.pem` is the simulator's published test key. The dev secrets in `.env.example` are for local use only.
- **Fonts:** Lexend Deca from Google Fonts, under the SIL Open Font License.
