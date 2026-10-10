# Delegate

> Independent prototype — not an official GOV.UK service. Synthetic data only.

**The idea.** A person who has signed in with GOV.UK One Login can give an agent limited, revocable permission to act for them. The prototype gives HMRC an authority-check interface alongside a fuller integration for consent, agent sessions, discovery, receipts and outcomes. Because a trusted route exists, government can put friction on traffic that will not identify itself, and steer automation into the approved route instead of being flooded.

The pattern copies HMRC's agent authorisation: an agent asks, the person approves, a relationship is recorded, the service checks it, the person can remove it. **Delegate verifies authority; it does not plan or orchestrate AI tasks.** Decision 28 records this boundary.

## Architecture and scope

**Canonical reference:** [Delegate vs Orchestrate — target architecture](docs/ARCHITECTURE.md). This explains system ownership, service-defined capabilities, richer mandates, citizen control, consent, cross-service integration, and why a possible **GOV.UK Orchestrate** is a separate, **theoretical** service rather than part of Delegate.

**On the About site:** [Delegate or Orchestrate?](apps/about/src/app/delegate-orchestrate/page.tsx) is the accessible, plain-language version, served at `/delegate-orchestrate`. The detailed Markdown document and [Decision 28](docs/DECISIONS.md) are the engineering source of truth; the About site explains them to product and policy audiences.

| Product boundary | Responsibility |
|---|---|
| **One Login** | Authenticate the person |
| **Delegate** | Record scoped, revocable authority for their chosen representative |
| **HMRC / other government services** | Define delegable actions and enforce the underlying business rules |
| **Citizen's assistant / model provider** | Understand goals, plan and execute tasks within granted authority |
| **GOV.UK Orchestrate (hypothetical)** | Potential future provider-neutral task continuity and cross-service coordination, **not built** |

**Open architecture question:** [Where should authority records live?](docs/FEDERATED_AUTHORITY.md) compares a central national registry with federated and hybrid recognition of existing departmental authority. It proposes one narrow experiment; federation is **not yet decided or implemented**.

**Current catalogue status:** authenticated publication, immutable versions and public discovery are implemented (Decision 29). HMRC owns its versioned capability catalogue and registers it during bootstrap ([PR #86](https://github.com/sighmoan1/govuk-delegate-starter/pull/86)); generic unchecked consent and immutable original approval evidence are implemented (#30–31). Bounded service-defined restrictions are enforced (#32), and the independent council proof uses the same contract (#33). Publication alone changes no existing grant. See [Service catalogues](docs/SERVICE_CATALOGUES.md).

## What still needs deciding

**[Decision backlog — `docs/DECISION_BACKLOG.md`](docs/DECISION_BACKLOG.md)** is the canonical index of unresolved product, legal, security and architecture choices. It links to twelve individual `[decision]` issues, with priorities, owner roles, alternative options, evidence needed and clear triggers for an actual decision. It distinguishes what this synthetic prototype **implements** from what participating government services would still have to **approve**.

National decisions DB-01–DB-12 are explicitly deferred with responsible roles and reopening triggers in [DECISION_DISPOSITIONS.md](docs/DECISION_DISPOSITIONS.md).

Start with **DB-01 (legal authority)** and **DB-02 (when the person must approve the precise action)**. Keep settled/historical decisions in [DECISIONS.md](docs/DECISIONS.md), and treat the merged [evaluation protocol](docs/VALIDATION.md) as a separate evidence programme.

## Documentation

[Documentation index](docs/README.md) links the current behaviour, target architecture, decision history, evidence and setup guidance. [Repository status](docs/REPOSITORY_STATUS.md) records the 9 October branch audit. The About site serves the plain-language current-state summary at `/project-status`.

## Where to start

Open the [public briefing](https://about-demo.bathos.org/briefing) for an explanation and decks, then follow the [current demo guide](docs/DEMO_GUIDE.md) for the available URLs and three-minute consent → action → revocation journey. The [browser demo guide](https://about-demo.bathos.org/briefing/demo) presents the same core journey.

The private presenter dashboard is [localhost:3304](http://localhost:3304). Observatory review instances on 5303 and 5703 are temporary protected research environments, not visitor destinations. Public tunnels depend on the presenter computer staying running; see [local runtime inventory](docs/LOCAL_RUNTIME.md) before starting or retiring a stack.

## Six apps

The core includes One Login, Delegate, HMRC, About, Observatory and an independent synthetic council service. Citizen-facing service screens link to About; the separate research workbench explains its own evidence limits.

| App | Port | What it is |
|---|---|---|
| **About this prototype** (`apps/about`) | 3304 | The case, the three systems, the scenarios and their setup controls, how it works (including HMRC's integration code), why, and precedents. **Start here.** |



| System | Port | What it does | What it had to add |
|---|---|---|---|
| GOV.UK One Login (`apps/onelogin` in front of the official simulator) | 3301 | Signs people in, for Delegate and for HMRC: "Enter your email address", "Enter your password". The official simulator (internal, :3399) does the OIDC work | Prototype sign-in screens and simulator proxy; no delegation logic in authentication |
| **Delegate** (`apps/delegate`) | 3300 | Part of the GOV.UK account: consent screen, "Who can act for you", agent and service registry, one check API. Internal view at `/ops` | New |
| **Example council** (`apps/council`) | 3305 | A separate synthetic service with local case records and a read-only agent API | Its own catalogue, credential, case-ownership rule and Delegate checks |
| **HMRC: Claim tax relief for your job expenses** (`apps/hmrc`) | 3302 | A One Login relying party with a human journey and an API for agents. Three lanes: signed-in person, authorised agent, not identified. Internal view at `/ops` | Authority checks; request creation/polling; agent sessions and browser guards; discovery; domain/traffic controls; receipts, disputes and outcome reporting |

Observatory (`apps/observatory`, port **3303**) is a separate, local-only read-only research workbench. It has its own database/login and generated Prisma client. Synthetic research feeds are available behind explicit opt-in; collection is disabled by default. A protected dashboard, versioned blind classification contract and deterministic signature-evidence test stub are implemented; there is no trained detector or validated accuracy result. It cannot change authority or service outcomes. See [Observatory setup](docs/observatory/SETUP.md) and [research protocol](docs/observatory/RESEARCH_PROTOCOL.md). The historical Example AI brief mentioned 3303; that app is not implemented and the port is now assigned to Observatory.

The optional **WhenIsBins connector** (`apps/whenisbins`, default port 3310) is a separate service integration beyond these six core apps. It checks scoped Delegate authority before a bin-collection lookup and owns its provider validation and local operation records. The separate [agent-owned recurring lookup runner](docs/whenisbins/SCHEDULER.md) supplies agreed jobs and a deliberately started foreground worker; Delegate remains the authority service. Native email signup/activation and the presenter journeys are implemented with qualified receipts and explicit evidence boundaries. Real cancellation remains unverified, disabled and separately parked in [#132](https://github.com/sighmoan1/govuk-delegate-starter/issues/132); the test subscription remains active. See [connector setup and limits](docs/whenisbins/CONNECTOR.md) and the [dated delivery snapshot](docs/REPOSITORY_STATUS.md).

Delegate, HMRC and Observatory have separate databases/logins in one Postgres container. The synthetic council uses its own local fixture records; One Login and About have no application database. Services integrate over HTTP. The join key between HMRC and Delegate is the person's One Login subject.

## Run it

```bash
docker compose up --build
```

Open **http://localhost:3304** and pick a scenario. Data is seeded on first start. To start again, use **Reset everything** on the about site, or a scenario page’s starting-point buttons.

For development: `docker compose up -d db simulator`, copy each `apps/*/.env.example` to `.env` (the about app has no database), then `npm install && npm run db:migrate --workspaces --if-present && npm run db:reset && npm run dev`.

### Updating an existing local stack

After fetching and reviewing merged changes, fast-forward `main` and rebuild the containers:

```bash
git switch main
git pull --ff-only
npm ci
docker compose up -d --build
docker compose ps
```

For existing database volumes, first provision the new Observatory database/login using [the upgrade steps](docs/observatory/SETUP.md#existing-database-volumes); Postgres init scripts run only on a new volume.

Startup applies migrations and seeds only empty databases. Rebuilding retains the existing database volume; `db:reset` deliberately replaces citizen demo fixtures. The HMRC queue worker is a separate compose service and must be running for asynchronous claims. See [current behaviour](docs/CURRENT_BEHAVIOUR.md) before resetting or testing.

Read-only public briefings and non-resetting updates are documented in [the public briefing deployment guide](docs/briefings/PUBLIC_DEPLOYMENT.md).

### On public URLs, for agents that browse from the cloud

ChatGPT agent and Google's agent browse from their own cloud machines, so they can't reach localhost. With the dev servers stopped:

```bash
npm run public        # Cloudflare quick tunnels for One Login, Delegate and HMRC, then the stack in public mode
npm run test:public   # optional: check the public URLs from outside
npm run public:stop   # tunnels down, simulator back to localhost, dev secrets reseeded
```

`npm run public` prints the public URLs and a prompt to give the agent. By default these are Cloudflare quick tunnels with random URLs, and Cloudflare blocks OpenAI's crawler on that domain, so ChatGPT's own page fetcher gets a 403. For stable URLs where you control the bot settings, create a named tunnel on a domain you own and describe it in `public.config.json` (gitignored; the format is in the header of `scripts/public.mjs`). Public mode uses fresh random secrets, doesn't trust the local test agent (its private key is in this repository), and refuses demo tooling (reset, swarm set-up) through the tunnel. The about site stays on localhost, and its reset buttons still work. Public service “About this prototype” links default to localhost:3304, so remote visitors cannot follow them without a local stack. If a reachable explanatory site is provided, configure ABOUT_URL explicitly; do not expose the local demo console or Sam’s phone tooling. Anyone with the URLs can use the demo while it's up. The data is synthetic, but stop it when you're done.

## The demo: four scenarios

Open http://localhost:3304. Scenarios 1 and 2 have starting-point buttons. Scenario 3 displays existing observations and has no reset. Scenario 4 creates fresh synthetic people for each run.

1. **Sam manages who can act for her.** In her GOV.UK account she sees the assistant, what it can do and what it has done, and removes access.
2. **Government prioritises people and authorised agents.** HMRC treats signed-in people, authorised agents and unidentified traffic differently. The page sends bursts of traffic as a bot and as an anonymous visitor, and shows who got through.

3. **Which route do agents choose?** Findings from live runs with real agents (ChatGPT with TinyFish so far), from HMRC's own logs: what HMRC could see, and which route each took.
4. **Can a swarm beat the system?** Seven scenarios through the real services, counting technical load (requests, authority checks, 429 and 503 answers, back-end work) apart from service outcomes (claims received, queued, recorded, duplicates absorbed, waiting and worker time). One person with one agent, 100 sub-agents or 100 hidden sessions is one claim, however many requests. 100 people through one agent is 100 claims, received at once and recorded gradually. A burst, a retry storm and a status-poll flood are added, and a labelled, seeded simulation compares an agent-level throttle, a person-level throttle and fair scheduling. Every number is marked measured, depends on a demo-only limit, or simulated. Decision 27.

The core idea, in one line: **identify the agent, authorise the mandate, limit the principal at the service** (Decision 16 in `docs/DECISIONS.md`).

**Reset everything** is on the overview page. From the command line, `npm run db:reset` does the same.

## Validation and evidence

**The working experiment plan is [docs/VALIDATION.md](docs/VALIDATION.md).** It frames Delegate as a falsifiable proposition: can identified, authorised agents improve the management of legitimate automated demand **beyond what a good API and service-local authorisation already deliver**?

- [Experimental protocol](docs/VALIDATION.md) — hypotheses, seven experiments (E1–E7), fair API-only comparator, metrics, controls and falsification criteria.
- [Evidence register](docs/EVIDENCE.md) — what is exploratory, what exists only as technical test source, and links to independently recorded experimental runs when available.
- [Current demo and claims guide](docs/DEMO_GUIDE.md) — public/private URLs, the three-minute core journey and a seven-minute stakeholder discussion.
- [About-site evidence page](apps/about/src/app/evidence/page.tsx) — readable explanation at `/evidence` when deployed.

**A [bounded technical B/C comparison](docs/evidence/RUN-20261009-E2-01.md) is recorded; no citizen-effort, economic or real-world product-benefit result has been established.** Existing route-choice observations and synthetic swarm tests are useful starting points, not proof of national-scale benefit. Keep further architecture debates in the relevant ADRs, not in experiment results.

## Tests

With the stack running, test in two phases to avoid the background worker consuming queue fixtures:

```bash
docker compose stop hmrc-worker
npm test -w apps/hmrc
docker compose start hmrc-worker
npx vitest run
```

The tests use synthetic data and reset fixtures. Use an isolated test database, not a shared demonstration database.

```bash
npm test            # Observatory unit health tests first. Pause hmrc-worker for HMRC database tests; restart it for root HTTP/swarm tests.
                    # Vitest: HMRC database-backed idempotency/atomicity/queue tests (apps/hmrc/tests), then over HTTP: scenarios A–F at Delegate's check API and again through HMRC;
                    # the swarm experiments (tests/swarm.test.ts: seven scenarios measured, then a seeded simulation; needs the queue worker running);
                    # one event per attempt in both logs; untrusted-lane friction; lifecycle; return URLs
npm run test:e2e    # Playwright: the scenarios (each started from its UI reset) across all apps, each system alone, a check
                    # that the services carry no demo copy, skip link, 320px reflow. Resets demo data first.
```

## Notes

- **Local sign-in.** The One Login screens are a lookalike; any nonempty password works, and `sam.taylor@example.com` (pre-filled) is the seeded person. Any other email is a different person. Behind the screens, the official simulator issues the codes, signed tokens and userinfo.
- **Public/strict sign-in.** Only Sam’s email is accepted; the configured password is validated, followed by a mock phone code. Local “Continue twice” instructions do not apply in this mode.
- **The simulator supports one client.** Delegate and HMRC share its client id and test key. In production they would be separate relying parties.
- **Pairwise subjects.** Real One Login gives each relying party its own subject for the same person. Here both see the same one; production would need a shared sector or a mapping held by Delegate (Decision 12).
- **Receive now, record later.** `POST /api/job-expenses` with `Prefer: respond-async` and an `Idempotency-Key` stores the claim and answers `202 Accepted` with a `Location: /api/transactions/{id}`; a queue worker (`npm run worker -w apps/hmrc`, started by `npm run dev` and as the `hmrc-worker` compose service) records it shortly after. 202 is a receipt, never an approval, and the receipt time is not a legal filing date. Decision 25.
- **The friction is a stand-in:** an in-memory limiter, a 1.5 second delay, plain-text refusals and a checkbox challenge page. It shows the incentive, not real abuse controls.
- **Step-up:** high-risk permissions need the person's approval of one proposed change (`STEP_UP_REQUIRED`, then the approval page showing the details). The approval is used up only when HMRC makes that change, not by being checked, and expires `STEP_UP_MAX_AGE_MINUTES` after the change is proposed (default 10). The details are made up. What the demo does and does not guarantee is in Decision 24.
- **Dev keys:** `dev/oidc-client-private.pem` is the simulator's published test key. All secrets in compose and `.env.example` files are for local use only.
- **Fonts:** Lexend Deca, under the SIL Open Font License.

## Current behaviour and historical briefs

[Current integration contract](docs/CURRENT_BEHAVIOUR.md) is the implemented-state entry point. [BUILD_SPEC.md](docs/BUILD_SPEC.md) and [PROTOTYPE_CONTENT.md](docs/PROTOTYPE_CONTENT.md) preserve the original DWP/Example AI brief; later decisions supersede those examples. The current HMRC seed has eight capabilities; the browser request form offers seven and omits `change_address`, which remains available through the API.

Service-owned catalogue publication and immutable version/discovery rules are described in [Service catalogues](docs/SERVICE_CATALOGUES.md).

## Independent council proof

A second synthetic service runs on port 3305 with its own catalogue, credential, records and case-ownership rule. Run `npm run council:register` after database setup for local development; Docker Compose registers it automatically. Authorise it through the same unchecked generic consent UI. See [the integration guide and identity limits](docs/SECOND_SERVICE.md).
