# GOV.UK Delegate

> Independent prototype — not an official GOV.UK service. Synthetic data only.

**The idea.** A person who has signed in with GOV.UK One Login can give an agent limited, revocable permission to act for them. A service like HMRC then needs to add very little to let that agent through on the same happy path as a signed-in person. Because a trusted route exists, government can put friction on traffic that will not identify itself, and steer automation into the approved route instead of being flooded.

The pattern copies HMRC's agent authorisation: an agent asks, the person approves, a relationship is recorded, the service checks it, the person can remove it. **Delegate verifies authority; it does not plan or orchestrate AI tasks.** Decision 28 records this boundary.

## Architecture and scope

**Canonical reference:** [Delegate vs Orchestrate — target architecture](docs/ARCHITECTURE.md). This explains system ownership, service-defined capabilities, richer mandates, citizen control, consent, cross-service integration, and why a possible **GOV.UK Orchestrate** is a separate, **theoretical** service rather than part of Delegate.

**On the About site:** [Delegate or Orchestrate?](apps/about/src/app/delegate-orchestrate/page.tsx) is the accessible, plain-language version, served at `/delegate-orchestrate`. The detailed Markdown document and [Decision 28](docs/DECISIONS.md) are the engineering source of truth; the About site explains them to product and policy audiences.

| Product boundary | Responsibility |
|---|---|
| **One Login** | Authenticate the person |
| **GOV.UK Delegate** | Record scoped, revocable authority for their chosen representative |
| **HMRC / other government services** | Define delegable actions and enforce the underlying business rules |
| **Citizen's assistant / model provider** | Understand goals, plan and execute tasks within granted authority |
| **GOV.UK Orchestrate (hypothetical)** | Potential future provider-neutral task continuity and cross-service coordination, **not built** |

**Open architecture question:** [Where should authority records live?](docs/FEDERATED_AUTHORITY.md) compares a central national registry with federated and hybrid recognition of existing departmental authority. It proposes one narrow experiment; federation is **not yet decided or implemented**.

**Current limitation:** Delegate's demo seed and UI still hard-code some HMRC capability definitions. The target is that each service publishes a versioned catalogue and Delegate renders/checks it generically. This is tracked as follow-up engineering work; the documentation is not a claim that the feature exists.

## Four apps

The three systems in the scenario are mock-ups of real services. They carry no explanation of the demo, only a "Prototype · About this prototype" line. Everything explanatory lives on the about site.

| App | Port | What it is |
|---|---|---|
| **About this prototype** (`apps/about`) | 3304 | The case, the three systems, the scenarios (each with its own reset), how it works (including HMRC's integration code), why, and precedents. **Start here.** |



| System | Port | What it does | What it had to add |
|---|---|---|---|
| GOV.UK One Login (`apps/onelogin` in front of the official simulator) | 3301 | Signs people in, for Delegate and for HMRC: "Enter your email address", "Enter your password". The official simulator (internal, :3399) does the OIDC work | Nothing |
| **GOV.UK Delegate** (`apps/delegate`) | 3300 | Part of the GOV.UK account: consent screen, "Who can act for you", agent and service registry, one check API. Internal view at `/ops` | New |
| **HMRC: Claim tax relief for your job expenses** (`apps/hmrc`) | 3302 | A One Login relying party with a human journey and an API for agents. Three lanes: signed-in person, authorised agent, not identified. Internal view at `/ops` | Registered once; one middleware, `src/lib/delegated-authority.ts` |

Each service has its own database (one Postgres container, a database each) and they talk only over HTTP. The join key between HMRC and Delegate is the person's One Login subject.

## Run it

```bash
docker compose up --build
```

Open **http://localhost:3304** and pick a scenario. Data is seeded on first start. To start again, use **Reset everything** on the about site, or a scenario page’s starting-point buttons.

For development: `docker compose up -d db simulator`, copy each `apps/*/.env.example` to `.env` (the about app has no database), then `npm install && npm run db:migrate --workspaces && npm run db:reset && npm run dev`.

### On public URLs, for agents that browse from the cloud

ChatGPT agent and Google's agent browse from their own cloud machines, so they can't reach localhost. With the dev servers stopped:

```bash
npm run public        # Cloudflare quick tunnels for One Login, Delegate and HMRC, then the stack in public mode
npm run test:public   # optional: check the public URLs from outside
npm run public:stop   # tunnels down, simulator back to localhost, dev secrets reseeded
```

`npm run public` prints the public URLs and a prompt to give the agent. By default these are Cloudflare quick tunnels with random URLs, and Cloudflare blocks OpenAI's crawler on that domain, so ChatGPT's own page fetcher gets a 403. For stable URLs where you control the bot settings, create a named tunnel on a domain you own and describe it in `public.config.json` (gitignored; the format is in the header of `scripts/public.mjs`). Public mode uses fresh random secrets, doesn't trust the local test agent (its private key is in this repository), and refuses demo tooling (reset, swarm set-up) through the tunnel. The about site stays on localhost, and its reset buttons still work. Anyone with the URLs can use the demo while it's up. The data is synthetic, but stop it when you're done.

## The demo: four scenarios

Open http://localhost:3304. Each scenario has its own page, and each page resets everything to the right starting point with one button: clean, or with an agent already authorised.

1. **Sam manages who can act for her.** In her GOV.UK account she sees the assistant, what it can do and what it has done, and removes access.
2. **Government prioritises people and authorised agents.** HMRC treats signed-in people, authorised agents and unidentified traffic differently. The page sends bursts of traffic as a bot and as an anonymous visitor, and shows who got through.

3. **Which route do agents choose?** Findings from live runs with real agents (ChatGPT with TinyFish so far), from HMRC's own logs: what HMRC could see, and which route each took.
4. **Can a swarm beat the system?** Seven scenarios through the real services, counting technical load (requests, authority checks, 429 and 503 answers, back-end work) apart from service outcomes (claims received, queued, recorded, duplicates absorbed, waiting and worker time). One person with one agent, 100 sub-agents or 100 hidden sessions is one claim, however many requests. 100 people through one agent is 100 claims, received at once and recorded gradually. A burst, a retry storm and a status-poll flood are added, and a labelled, seeded simulation compares an agent-level throttle, a person-level throttle and fair scheduling. Every number is marked measured, depends on a demo-only limit, or simulated. Decision 27.

The core idea, in one line: **identify the agent, authorise the mandate, limit the principal at the service** (Decision 16 in `docs/DECISIONS.md`).

**Reset everything** is on the overview page. From the command line, `npm run db:reset` does the same.

## Tests

With the stack running:

```bash
npm test            # Vitest: HMRC database-backed idempotency/atomicity/queue tests (apps/hmrc/tests), then over HTTP: scenarios A–F at Delegate's check API and again through HMRC;
                    # the swarm experiments (tests/swarm.test.ts: seven scenarios measured, then a seeded simulation; needs the queue worker running);
                    # one event per attempt in both logs; untrusted-lane friction; lifecycle; return URLs
npm run test:e2e    # Playwright: the scenarios (each started from its UI reset) across all apps, each system alone, a check
                    # that the services carry no demo copy, skip link, 320px reflow. Resets demo data first.
```

## Notes

- **Sign-in.** The One Login screens are a lookalike; any password works, and `sam.taylor@example.com` (pre-filled) is the seeded person. Any other email is a different person. Behind the screens, the official simulator issues the codes, signed tokens and userinfo.
- **The simulator supports one client.** Delegate and HMRC share its client id and test key. In production they would be separate relying parties.
- **Pairwise subjects.** Real One Login gives each relying party its own subject for the same person. Here both see the same one; production would need a shared sector or a mapping held by Delegate (Decision 12).
- **Receive now, record later.** `POST /api/job-expenses` with `Prefer: respond-async` and an `Idempotency-Key` stores the claim and answers `202 Accepted` with a `Location: /api/transactions/{id}`; a queue worker (`npm run worker -w apps/hmrc`, started by `npm run dev` and as the `hmrc-worker` compose service) records it shortly after. 202 is a receipt, never an approval, and the receipt time is not a legal filing date. Decision 25.
- **The friction is a stand-in:** an in-memory limiter, a 1.5 second delay, plain-text refusals and a checkbox challenge page. It shows the incentive, not real abuse controls.
- **Step-up:** high-risk permissions need the person's approval of one proposed change (`STEP_UP_REQUIRED`, then the approval page showing the details). The approval is used up only when HMRC makes that change, not by being checked, and expires `STEP_UP_MAX_AGE_MINUTES` after the change is proposed (default 10). The details are made up. What the demo does and does not guarantee is in Decision 24.
- **Dev keys:** `dev/oidc-client-private.pem` is the simulator's published test key. All secrets in compose and `.env.example` files are for local use only.
- **Fonts:** Lexend Deca, under the SIL Open Font License.
