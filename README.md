# GOV.UK Delegate

> Independent prototype — not an official GOV.UK service. Synthetic data only.

**The idea.** A person who has signed in with GOV.UK One Login can give an agent limited, revocable permission to act for them. A service like HMRC then needs to add very little to let that agent through on the same happy path as a signed-in person. Because a trusted route exists, government can put friction on traffic that will not identify itself, and steer automation into the approved route instead of being flooded.

The pattern copies HMRC's agent authorisation: an agent asks, the person approves, a relationship is recorded, the service checks it, the person can remove it. See `docs/` for the case, the original brief and the decisions. Decision 12 describes the current shape.

## Five apps

The four systems in the scenario are mock-ups of real services. They carry no explanation of the demo, only a "Prototype · About this prototype" line. Everything explanatory lives on the about site.

| App | Port | What it is |
|---|---|---|
| **About this prototype** (`apps/about`) | 3304 | The case, the four systems, the three scenarios (each with its own reset), how it works (including HMRC's integration code), why, and precedents. **Start here.** |



| System | Port | What it does | What it had to add |
|---|---|---|---|
| GOV.UK One Login (`apps/onelogin` in front of the official simulator) | 3301 | Signs people in, for Delegate and for HMRC: "Enter your email address", "Enter your password". The official simulator (internal, :3399) does the OIDC work | Nothing |
| **GOV.UK Delegate** (`apps/delegate`) | 3300 | Part of the GOV.UK account: consent screen, "Who can act for you", agent and service registry, one check API. Internal view at `/ops` | New |
| **HMRC: Claim tax relief for your job expenses** (`apps/hmrc`) | 3302 | A One Login relying party with a human journey and an API for agents. Three lanes: signed-in person, authorised agent, not identified. Internal view at `/ops` | Registered once; one middleware, `src/lib/delegated-authority.ts` |
| **Example AI** (`apps/agent`) | 3303 | A consumer AI assistant: a conversation with Sam and a "Connected services" page. Scripted, no LLM | Registered once; asks for permission; sends its own token |

Each service has its own database (one Postgres container, three databases) and they talk only over HTTP. The join key between HMRC and Delegate is the person's One Login subject.

## Run it

```bash
docker compose up --build
```

Open **http://localhost:3304** and pick a scenario. Data is seeded on first start. To start again, use **Reset everything** on the about site, or a scenario page’s starting-point buttons.

For development: `docker compose up -d db simulator`, copy each `apps/*/.env.example` to `.env` (the about app has no database), then `npm install && npm run db:migrate --workspaces && npm run db:reset && npm run dev`.

## The demo: three scenarios

Open http://localhost:3304. Each scenario has its own page, and each page resets everything to the right starting point with one button: clean, or with Example AI already connected.

1. **Sam asks her assistant to claim tax relief.** Example AI gets Sam's permission through GOV.UK, then claims working-from-home relief with HMRC. It's refused when it tries something she didn't allow.
2. **Sam manages who can act for her.** In her GOV.UK account she sees Example AI, what it can do and what it has done, and removes access. Its next request is refused.
3. **Government prioritises people and authorised agents.** HMRC treats signed-in people, authorised agents and unidentified traffic differently. The page sends bursts of traffic as a bot, as Example AI and as an anonymous visitor, and shows who got through.

**Reset everything** is on the overview page. From the command line, `npm run db:reset` does the same.

## Tests

With the stack running:

```bash
npm test            # Vitest over HTTP: scenarios A–F at Delegate's check API and again through HMRC;
                    # one event per attempt in both logs; untrusted-lane friction; lifecycle; return URLs
npm run test:e2e    # Playwright: the three scenarios (each started from its UI reset) across all apps, each system alone, a check
                    # that the services carry no demo copy, skip link, 320px reflow. Resets demo data first.
```

## Notes

- **Sign-in.** The One Login screens are a lookalike; any password works, and `sam.taylor@example.com` (pre-filled) is the seeded person. Any other email is a different person. Behind the screens, the official simulator issues the codes, signed tokens and userinfo.
- **The simulator supports one client.** Delegate and HMRC share its client id and test key. In production they would be separate relying parties.
- **Pairwise subjects.** Real One Login gives each relying party its own subject for the same person. Here both see the same one; production would need a shared sector or a mapping held by Delegate (Decision 12).
- **The friction is a stand-in:** an in-memory limiter, a 1.5 second delay, plain-text refusals and a checkbox challenge page. It shows the incentive, not real abuse controls.
- **Step-up:** high-risk permissions are flagged in the data and on the consent screen only.
- **Dev keys:** `dev/oidc-client-private.pem` is the simulator's published test key. All secrets in compose and `.env.example` files are for local use only.
- **Fonts:** Lexend Deca, under the SIL Open Font License.
