# Agent-owned scheduled bin lookups

The runner is an external agent component, not a Delegate scheduler. It makes one bounded collection-date request for the agreed property. The connector verifies current identity, relationship, permission and property restrictions on every call, including retries. This package neither creates authority nor caches an ALLOW decision.

## Agreement and controls

The browser integrator supplies an affirmative agreement containing principal, agent, confirmed property ID, opaque grant reference, credential environment-variable name, daily or weekly frequency, local hour/minute, Europe/London timezone and start/end instants. The end must be within 366 days of the start. Weekly weekday uses Sunday=0 through Saturday=6. No raw email/address or credential is needed in a stored job. The file contains identifiable references: keep it private and exclude it from Git and Observatory exports.

`create()` validates and persists the agreement; `control(id, "pause" | "resume" | "stop")` controls its execution; `store.list()` provides the current state and receipts. An agent-side browser UI should show schedule state separately from Delegate grant state. Permission changes never edit the old agreement: stop the job and obtain a fresh appropriate agreement before creating a replacement. A refused job cannot silently resume; its owner must resolve the refusal and explicitly create a newly agreed job.

Stopping or revoking cannot retrospectively cancel an already sent provider request. Its result is still recorded. Recurring lookup authority does not permit email signup, missed-bin reports or requests to another service. Signup and subscription cancellation are separate capabilities.

## Executions and recovery

Each occurrence has a stable job/date idempotency key. A tick claims at most one request with a two-minute lease, then calls the injected connector. The HTTP adapter has a 30-second timeout and accepts fresh token acquisition from the owning agent. Run ticks repeatedly at a modest interval, such as once per minute; a saved agreement alone is not an independently running task. There is no background process or Codex automation installed by this package.

The file store writes a private temporary file, fsyncs it, atomically renames it and fsyncs the directory. A store lock excludes concurrent processes on the same host. Store operations do not include outbound calls. A runner crash during an outbound lookup is recovered after its lease expires, using the same idempotency key. The connector must persist idempotency and check current authority before responding to a replay; durable deduplication does not come from this runner alone.

A crash during the brief store transaction may leave `<store>.lock`. The store fails closed rather than risking removal of a live writer's lock. Stop all workers, verify the recorded owner process is absent, retain a backup of the store and remove that lock directory before restarting. This is a single-host prototype store, not a distributed queue, multi-host scheduler or unattended production operating model.

Only the latest eligible missed occurrence runs after downtime; earlier missed dates are skipped. Three total attempts per occurrence are allowed, with 60-second minimum and one-hour maximum backoff. Pending provider jobs use the same occurrence key on retry so the connector can reuse unfinished provider lookups. Partial results and accepted/queued requests are not reported as completed. After three attempts the runner leaves the last pending/unavailable receipt visible and proceeds at the next agreed occurrence. No backlog flood is generated.

London civil time applies: the missing spring hour is skipped; the repeated autumn hour runs once, at its first real instant. No work starts at or after the agreement's end. A live tick snapshots the end and pause/stop state when claiming work; changes made after a claim affect subsequent claims.

`metrics(job)` separates occurrences, attempts, observed attempt receipts, completed lookups, unchanged results, durable replays, refusals, reported provider calls and attempts whose provider-call count is unknown. The connector envelope’s `unchanged: true` means this request made a conditional provider read and received an unchanged result; `replayed: true` means the same operation was replayed from the connector store. Replays are counted separately from completed and unchanged reads. Ambiguous transport/response failures and attempts without receipts retain unknown provider-call counts rather than claiming zero. A timeout or crash cannot establish how much upstream work occurred. The agent execution receipts are research evidence about this runner, not observations of all WhenIsBins traffic.

## Local synthetic use

```sh
npm test --prefix packages/whenisbins-runner
npm run typecheck --prefix packages/whenisbins-runner
npm run cli --prefix packages/whenisbins-runner -- create /private/tmp/bins-jobs.json /private/tmp/bins-agreement.json
npm run cli --prefix packages/whenisbins-runner -- list /private/tmp/bins-jobs.json
npm run cli --prefix packages/whenisbins-runner -- tick /private/tmp/bins-jobs.json
npm run cli --prefix packages/whenisbins-runner -- stop /private/tmp/bins-jobs.json JOB_ID
```

The CLI defaults to a loopback connector; the environment variable named by the agreement contains the agent client secret, never a bearer token. `WHENISBINS_CONNECTOR_URL` can select an explicitly configured HTTPS connector. The CLI obtains a fresh token from Delegate on every lookup attempt and verifies that its returned registered agent ID matches the saved agreement. Library integrations can inject equivalent token acquisition into `connectorLookup`. Secrets and provider signup data must not appear in receipt JSON. The CLI prints private job references, so do not stream it into a public console.

Tests inject a synthetic connector and accelerated clock. They create no external traffic, reminder subscriptions, live recurring jobs or Tom-repository changes. To end a separately authorised live trial, stop its jobs and process; revocation is an additional independent authority control. Live WhenIsBins usage stays subject to its usage guidance and the separate connector opt-in.

## Foreground worker

`run-worker` is an actual agent-owned runtime entrypoint. It uses the ordinary clock, reads durable jobs and executes due work repeatedly. It is separate from the browser demonstration's accelerated ticks. Nothing installs or starts it automatically.

```sh
WHENISBINS_CONNECTOR_URL=http://127.0.0.1:3310 \
WHENISBINS_DELEGATE_URL=http://localhost:3300 \
WHENISBINS_AGENT_CLIENT_ID=demo-personal-agent \
npm run worker --prefix packages/whenisbins-runner -- /private/tmp/bins-jobs.json 10080 60000
```

Set the private client-secret environment variable referenced by each agreement before running; never put its value in a command example, job JSON or receipt. The saved `agentId` must be the actual registered Delegate ID, not the client-ID label. A mismatch refuses the job. The connector URL must pass a `/health` check: fixture mode is allowed by default; live mode additionally requires `WHENISBINS_RUNNER_ALLOW_LIVE=true`. Unknown or unavailable modes fail closed. Configure both services using HTTPS or loopback URLs.

The worker runs in the foreground, caps itself at 1–10080 ticks and stops when no active jobs remain. The optional interval must be 1000–3600000 milliseconds; defaults are 10080 ticks at 60000 milliseconds (at most seven days). An owning agent/platform may deliberately restart it using the retained store. SIGINT/SIGTERM stops after any already-started execution settles and retains the job state and receipts. No OAuth reapproval, new grant, cron job, Codex automation or unattended process is created. The grant's expiry/refusal and the agreed end date remain independent controls.

Smoke tests inject only a synthetic connector/token endpoint and clock. They prove repeated execution and fresh token acquisition, original-grant transport, finite-loop bounds, stop-signal retention and live-mode gating without launching a real recurring process or making an upstream request.
