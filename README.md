# GOV.UK Delegate

> Independent prototype — not an official GOV.UK service. Synthetic data only.

Scoped, revocable delegation to software agents, copying HMRC's agent-authorisation lifecycle.
See `docs/` for the case, spec and decisions.

## Run it

```bash
docker compose up --build        # app http://localhost:3300, One Login simulator :3301, Postgres :5433
```

The database is migrated and seeded on first start (principal, Demo Personal Agent, DWP Benefits Demo, five capabilities, history).
To return to the clean demo state: `npm run db:reset` (with `.env` copied from `.env.example`).

For development: `docker compose up -d db simulator && npm install && npm run db:migrate && npm run db:seed && npm run dev`.

## Three-minute demo

1. `/agent` → **Request authority**. The agent signs in as itself and asks for three capabilities.
2. Open the approval link. You are sent to the **One Login simulator**; press **Continue**.
3. Untick a permission, **Continue**, **Authorise agent**.
4. Back on `/agent`, try the five actions: allowed ones succeed, others are `PERMISSION_MISSING`.
5. `/delegates` → **Revoke access**. Retry the same action: `AUTHORISATION_REVOKED`.
6. `/agent` → "without identifying" shows the untrusted lane. `/activity` shows every attempt.

## Tests

With the stack running:

```bash
npm test            # Vitest: scenarios A–F, every-attempt-logged, lanes, request lifecycle
npm run test:e2e    # Playwright: full browser flow via the real simulator, a11y/reflow checks
```

Tests leave synthetic rows behind; `npm run db:reset` before a demo.

## Notes

- Check API: `POST /api/authorisations/check` (service key). The mock DWP calls it over HTTP; middleware is `src/lib/dwp.ts`.
- Agent identity: client-credentials sign-in at `/api/agent/token`; the principal's session is never used by the agent.
- Extra activity reasons beyond the spec: `RATE_LIMITED`, `HUMAN_SESSION`.
- Not implemented: step-up authentication for high-risk capabilities (flagged in data and UI only), Lexend Deca font files (the CSS falls back to Arial).
- `dev/oidc-client-private.pem` is the simulator's published default test key. Dev secrets in `.env.example` are for local use only.
