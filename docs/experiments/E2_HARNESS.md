# E2 controlled harness checkpoint

Related: #47, [fixed protocol](../VALIDATION.md), [evidence register](../EVIDENCE.md).

**A bounded technical E2 run is published:** [RUN-20261009-E2-01](../evidence/RUN-20261009-E2-01.md). It is T evidence, not a measured citizen-effort or product-benefit finding. The full issue remains open until a reviewer reproduces and publishes actual B/C runs and resolves the acceptance gaps below.

## Comparator and isolation

B uses an **HMRC-owned research authority process**, not Delegate. SQLite persists registered representative credential hashes, citizen-approved scoped/expiring grants, revocation, receipts and activity. The opaque random credential authenticates the representative; a separate citizen-approved relationship authorises action. The representative cannot approve its own relationship. Approval and revocation are invoked directly by isolated synthetic citizen fixtures, equivalently to C's existing test fixtures calling the actual consent/revocation functions.

The B process implements HMRC's existing authority-check/receipt/outcome contract. HMRC's `DELEGATE_INTERNAL_URL` selects B or C; no business handler, API route, idempotency, durable queue, worker, eligibility rule or throughput code changes between arms. The environment variable retains its existing name to avoid a core change. The sidecar is loopback-only, authenticates HMRC with its service key and has no public grant/reset endpoint. It must never be mounted in public mode.

This is a deliberately narrow, safe comparator: claim/status/follow-up capabilities only. Consequential changes require transaction-specific approval; B cannot grant them. The forbidden-action task tests an **ungranted** employment change, not a permitted consequential change with an inferior safeguard. Provider handoff, subdelegation and receipt disputes are excluded from both workloads and must be added symmetrically before drawing conclusions about those features. C's authentication uses its actual signed identity credential; B uses an expiring opaque credential with comparable possession requirements. No new portable delegation format is introduced.

Both arms use direct citizen fixture approval, not real sign-in/handoff. **Human effort, comprehension, consent friction, assistance and drop-offs are unmeasured, represented as null, not zero.** B's SQLite and separate research process versus C's PostgreSQL/Next runtime are unavoidable differences at this checkpoint; latency differences cannot isolate authority architecture alone.

## Reproduction

Requires Node 22.13+ with `node:sqlite` (tested on Node 24), PostgreSQL, generated Prisma clients, a seeded Delegate and the normal HMRC queue worker. Use an isolated local synthetic stack. Do not use a shared demonstration database.

```bash
npm ci
npm exec -w apps/delegate -- prisma generate
npm exec -w apps/hmrc -- prisma generate
node --test scripts/e2/local-authority.test.mjs
```

Run **sequentially**, restarting HMRC and its worker cleanly between arms, so in-memory throughput counters are empty in each arm. Keep the same HMRC build/source, domain settings, throughput settings, worker budget, repeats and seed. Use fresh isolated databases or reseed between arms; the runner additionally creates fresh subjects and grants for every fixture. Never reset a shared stack. Record the exact deployment configuration and arm order separately; repeat in reversed order before studying timing.

1. Start the normal seeded Delegate stack. In B configure HMRC and its worker with `DELEGATE_INTERNAL_URL=http://127.0.0.1:3310`. In C use the actual local Delegate URL (normally `http://127.0.0.1:3300`). The runner starts B's authority process itself at port 3310. Do not run B and C concurrently.
2. Export `DATABASE_URL` for Delegate's isolated DB, `E2_HMRC_DATABASE_URL` for HMRC's separate isolated DB, and the matching `HMRC_SERVICE_KEY`. For C also set `AGENT_TOKEN_SECRET` to Delegate's configured synthetic secret. These are never written to run records.
3. Set `E2_SOURCE_SHA` to the full source commit deployed and `E2_CONFIG_ID` to an operator-reviewed manifest identifier recording the equal HMRC/worker configuration. The runner also records the actual local Git SHA. For downloaded synthetic checkouts, record both snapshot source and local commit explicitly; do not imply they are identical.
4. Execute each arm from repository root:

```bash
E2_ARM=B E2_SEED=20261009 E2_REPEATS=5 TSX_TSCONFIG_PATH=apps/delegate/tsconfig.json node --import tsx scripts/e2/run.mjs
# Restart/reseed isolated HMRC and worker, selecting actual Delegate for C.
E2_ARM=C E2_SEED=20261009 E2_REPEATS=5 TSX_TSCONFIG_PATH=apps/delegate/tsconfig.json node --import tsx scripts/e2/run.mjs
node scripts/e2/compare.mjs .e2-runs/<B-run>/run.json .e2-runs/<C-run>/run.json
```

The comparison refuses mismatched source, config identifier, workload, seed or repeat count. Config equality is operator-attested, not automatically verified: attach the reviewed configuration. No model is used; this controlled deterministic harness isolates technical pathways, not agent route adoption.

## Ground truth and records

Each repeat has three distinct legitimate intents: read existing status, lodge one claim (including its retry), answer an independently created follow-up query. Separate forbidden and revoked attempts test authority boundaries. Requests have correlation IDs and synthetic intent IDs; retry shares the claim's intent. The independent HMRC Prisma client reads durable transactions, claims and answers. It verifies one completed claim, receipt-backed approved follow-up, no unauthorised employment change and no second transaction after revocation. A 202 or ALLOW alone does not satisfy a business outcome. Authority/service logs supplement final state; B additionally verifies that HMRC actually called its comparator.

Each run writes `run.json`, `SHA256SUMS`, and B's local authority DB into a unique output directory; failure also produces a run record and a nonzero exit. Output defaults to `.e2-runs` (scratch, not a public deliverable). Counts and request p50/p95 are descriptive; raw cost classes are technical-work proxies, never financial savings. The summary's planned intent denominator is not a completion rate; fixture-group checks are reported separately from individual-intent completion.

After review, redact/check raw synthetic records, preserve *both* arms including failed/null runs, and write the permanent `docs/evidence/RUN-...md` record following EVIDENCE.md. Include protocol, configuration, arm order, hashes, independent DB evidence, owner/reviewer and limitations. Only then update the evidence register and About-site link. The first recorded run is linked above; future runs must append records rather than overwrite it.

## Remaining acceptance gaps

- Full B,C,C,B stack execution passed in Actions; independently review the pinned raw records before merging.
- Record configuration equality, counterbalanced repeats and actual resource deployment. Latency requires topology controls before causal interpretation.
- Include support/drop-off evidence through a real consent/handoff study; direct fixture effort is unmeasured. The runner reports individual legitimate-intent completion, durable claim admission, verified unauthorised effects and duplicate effects with explicit planned/attempted denominators.
- Add provider handoff and any expanded safeguards symmetrically; do not generalise this narrow capability comparator to all existing Delegate features.
- Immutable run records, ledger entry and About link are included; the research gaps above remain. Do not close #47 on merging this harness checkpoint.

## Automated execution

`.github/workflows/e2.yml` builds Delegate and HMRC once, starts an isolated PostgreSQL fixture volume and runs B,C,C,B sequentially against the same host production HMRC build, restarting HMRC/worker before each arm. `scripts/e2/ci-run.sh` records each arm separately, compares both pairs and retains complete artifacts including failures. The workflow uses no model or browser and never measures human consent friction. Its run artifacts are technical evidence for reviewer inspection; a successful workflow does not automatically establish product benefit or update the public evidence register.
