# GOV.UK Delegate

> Independent prototype — not an official GOV.UK service. Synthetic data only.

**The idea.** A person who has signed in with GOV.UK One Login can give an agent limited, revocable permission to act for them. A service like HMRC then needs to add very little to let that agent through on the same happy path as a signed-in person. Because a trusted route exists, government can put friction on traffic that will not identify itself, and steer automation into the approved route instead of being flooded.

The pattern copies HMRC's agent authorisation: an agent asks, the person approves, a relationship is recorded, the service checks it, the person can remove it. See `docs/` for the case, the original brief and the decisions. Decision 12 describes the current shape.

## Four systems, four ports

| System | Port | What it does | What it had to add |
|---|---|---|---|
| GOV.UK One Login (official simulator) | 3301 | Signs people in, for Delegate and for HMRC | Nothing |
| **GOV.UK Delegate** (`apps/delegate`) | 3300 | Consent screen, "Who can act for you", agent and service registry, one check API, declared-agent activity | New |
| **HMRC: Claim tax relief for working from home** (`apps/hmrc`) | 3302 | A One Login relying party with a human journey and an API for agents. Three lanes: signed-in person, authorised agent, not identified | Registered once; one middleware, `src/lib/delegated-authority.ts`, shown on its `/ops` page |
| **Example AI** (`apps/agent`) | 3303 | A third-party agent: task runner with a step log, an unregistered-bot persona, a flood test | Registered once; asks for permission; sends its own token |

Each service has its own database (one Postgres container, three databases) and they talk only over HTTP. The join key between HMRC and Delegate is the person's One Login subject.

## Run it

```bash
docker compose up --build
```

Open http://localhost:3300 for the front door. Data is seeded on first start. To return to the clean demo state: `npm install && npm run db:reset`.

For development: `docker compose up -d db simulator`, copy each `apps/*/.env.example` to `.env`, then `npm install && npm run db:migrate --workspaces && npm run db:reset && npm run dev`.

## The demo (about three minutes; you are Sam throughout)

1. **HMRC** (3302): Start now, sign in with the simulator (press Continue), see tax code 1257L. You could claim yourself. Instead: *Try Example AI*.
2. **Example AI** (3303): Run task. It signs in to Delegate as itself and asks for permission. *Give permission on GOV.UK.*
3. **Delegate** (3300): choose what to allow, then Allow. You are sent back to the agent.
4. **Example AI** carries on: reads the tax code, claims the relief (new code 1288L). *Try something Sam didn't allow*: HMRC refuses, because Delegate says no.
5. **Flood test** (3303/flood): 40 requests as an unregistered bot, 40 as Example AI. The bot gets 0 of 40, slow plain-text refusals and 429s; the agent gets 40 of 40. Watch **HMRC's operations view** (3302/ops?live=1).
6. **Delegate › Who can act for you**: remove access. Back in Example AI, *Check Sam's tax code again*: refused.
7. **HMRC › Your tax**: the claim is there, *Submitted by Example AI assistant on your behalf*.

Also: **Example AI › Unregistered bot** runs the whole task with no identity and shows the challenge page. **Delegate › Activity** is the declared-agent view across services.

## Tests

With the stack running:

```bash
npm test            # Vitest over HTTP: scenarios A–F at Delegate's check API and again through HMRC;
                    # one event per attempt in both logs; untrusted-lane friction; lifecycle; return URLs
npm run test:e2e    # Playwright: the seven steps across all four systems, each system alone,
                    # the bot, skip link, 320px reflow. Resets demo data first.
```

## Notes

- **The simulator supports one client.** Delegate and HMRC share its client id and test key. In production they would be separate relying parties.
- **Pairwise subjects.** Real One Login gives each relying party its own subject for the same person. Here both see the same one; production would need a shared sector or a mapping held by Delegate (Decision 12).
- **The friction is a stand-in:** an in-memory limiter, a 1.5 second delay, plain-text refusals and a checkbox challenge page. It shows the incentive, not real abuse controls.
- **Step-up:** high-risk permissions are flagged in the data and on the consent screen only.
- **Dev keys:** `dev/oidc-client-private.pem` is the simulator's published test key. All secrets in compose and `.env.example` files are for local use only.
- **Fonts:** Lexend Deca, under the SIL Open Font License.
