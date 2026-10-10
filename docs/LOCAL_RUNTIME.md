# Local runtime and agent-owned test environments

This is the operator map. Visitors start at [the public briefing](https://about-demo.bathos.org/briefing) and follow [its demo guide](https://about-demo.bathos.org/briefing/demo). Worktrees and research ports are engineering environments, not additional visitor destinations. Availability depends on the presenter's computer, Docker and its named tunnel remaining running.

## Canonical demonstration

The public runtime uses Compose project `govuk-delegate-starter` from the main checkout. Its deployed source at the 10 October 2026 inventory was `7979c85`; a newer branch or merged commit does not by itself update that runtime. The live stack retains its existing private configuration and data.

| Address | Audience and purpose |
|---|---|
| https://about-demo.bathos.org/briefing | Public project explanation and briefing downloads |
| https://about-demo.bathos.org/briefing/demo | Public demonstration instructions |
| https://login-demo.bathos.org | Synthetic One Login; normally reached through a service |
| https://delegate-demo.bathos.org/account/delegates | Citizen consent, authority, activity and removal of access |
| https://hmrc-demo.bathos.org | Mock tax service and claim outcomes |
| https://hmrc-demo.bathos.org/act-for-someone | Browser-agent permission request entry |
| https://whenisbins-demo.bathos.org | Optional external-service connector demonstration |
| https://whenisbins-demo.bathos.org/evidence | Connector evidence and remaining limitations |
| http://localhost:3304 | Private presenter console, scenario controls and agent prompts |
| http://localhost:3304/sams-phone | Private synthetic sign-in details and mock phone code |
| http://localhost:3306 | Read-only briefing instance behind the About tunnel |
| http://localhost:3303 | Main Observatory address; not running at this inventory |
| http://localhost:3305 | Independent council proof; not running at this inventory |

Loopback `3311` is the connector's private keyed research feed, not a visitor site. The tunnel must route About to `3306`, never to the presenter console on `3304`, Observatory or research feeds. Public and private modes have different sign-in behaviour; see [current behaviour](CURRENT_BEHAVIOUR.md).

For the core demonstration: the agent requests access; Sam signs in and approves selected capabilities; the agent reads/submits within that scope; HMRC refuses an excluded capability; Sam inspects activity and removes access; a subsequent agent action is refused. HMRC still owns validation, idempotency and processing of work already accepted. Revocation stops future actions; it does not undo an accepted claim or unsubscribe an existing bin reminder. The public connector's real cancellation remains disabled and unverified.

Do not reset this stack for tests. `npm run public` creates fresh credentials and resets synthetic fixtures; `public:stop` restores local configuration. Neither is an upgrade command. The existing-runtime upgrade procedure is [public briefing deployment](briefings/PUBLIC_DEPLOYMENT.md); connector private configuration has its own [deployment guide](whenisbins/PUBLIC_DEPLOYMENT.md).

## Dated inventory and ownership

Read-only inspection on 10 October 2026 found the following Delegate environments. This inventory is a snapshot, not a shutdown or migration record. Docker lists dependency containers; some app servers run as host processes, so container counts alone do not prove a stack is unused.

| Project | Runtime observed | Ownership and next step |
|---|---|---|
| `govuk-delegate-starter` | Public apps, private About, read-only briefing, connector, worker, database and simulator; database `5433`, simulator `3399` | Canonical demo. One designated runtime owner performs reviewed updates; agents use isolated fixtures. |
| `delegate-branding-137` | Database `55437` and simulator `5499`; completed branding verification | The branding run's owner may stop its own remaining dependencies, retaining volumes. This document does not assert shutdown. |
| `delegate-validation` | Database `55433` and simulator dependencies; older validation checkout | Confirm the originating run has finished and identify any host processes before stopping. Retain data/evidence. No active owner was established by this inventory. |
| `delegate-obs-20261009` | Database `55434`, simulator `5399`, host Observatory listening on loopback `5303` | Research checkout, distinct from the main demo. Confirm its owner and retained evidence before any retirement. |
| `whenisbins-demo-ebf3e8b0` | Database `55435`, simulator `5799`, host Observatory listening on loopback `5703` | Existing WhenIsBins worktree fixture. Its managed launcher owns the app processes; verify ownership in that original checkout before stopping. |

Other projects on the machine are outside this task. Never use global Docker prune, blanket process kills, `down -v`, or removal of another worktree to clean up Delegate.

The intended steady state is **one main visitor runtime and one designated local research workbench**, with issue-specific fixtures started on demand. Prefer the main Observatory on loopback `3303` for new canonical monitoring once its owner provisions/verifies it. This is a consolidation plan: no research database has been moved or merged, and existing `5303`/`5703` records remain with their original provenance. Before retiring a research environment, record source commit, protocol/run identifiers, source feeds, database/volume, private evidence location and owner; verify a retained snapshot or export. Keep collection and evaluator truth separate. See [Observatory evidence boundaries](whenisbins/OBSERVATORY.md) and [setup](observatory/SETUP.md); older scaffold prose is superseded by [current behaviour](CURRENT_BEHAVIOUR.md).

## Claim a runtime before starting it

In the issue claim/checkpoint, record a unique run ID, issue, branch/worktree, Compose project, reserved ports, volume, process ownership mechanism and planned stop command. Check recent claims and `docker compose ls` before allocating a range. An agent that needs no server should run static checks without starting one.

Use a separate worktree for each issue. `docker compose -p` isolates networks/volumes but **does not change host ports**. Separate `.env` files and explicit HTTP test URLs are also necessary: tests can write directly to databases, and Playwright's global setup runs `db:reset`.

## Repeatable isolated core stack

This example reserves `6300`–`6305`, `6343` and `6399` for one run. Agree a different complete range for another agent. Use a fresh issue worktree with Node 22+, Docker Compose and no copied `.env.public` or deployment configuration. The recipe derives a standalone Compose file from the checked-in synthetic defaults, removes public-only services and replaces every host port with loopback bindings. It creates no tunnel.

```sh
# Run in the issue worktree; keep these values in its issue checkpoint.
export RUNTIME_PROJECT=delegate-issue-142-run-example
export RUNTIME_DIR="$(mktemp -d /tmp/delegate-runtime-142.XXXXXX)"
npm ci
python3 - <<'PY'
import json, os, re, subprocess
from pathlib import Path
root = Path.cwd()
project = os.environ['RUNTIME_PROJECT']
if not re.fullmatch(r'delegate-issue-[0-9]+-[a-z0-9-]+', project):
    raise SystemExit('Use an issue-specific Delegate project name')
# Ignore shell interpolation settings and local Compose .env; use repo defaults.
variables = re.findall(r'\$\{([A-Z_][A-Z_0-9]*)', (root/'docker-compose.yml').read_text())
env = {k:v for k,v in os.environ.items() if k not in variables}
config = json.loads(subprocess.check_output([
    'docker','compose','--env-file','/dev/null','-p',project,
    '-f','docker-compose.yml','config','--format','json'], env=env))
services = config['services']
for name in ['about-public', 'whenisbins-public']:
    services.pop(name, None)
ports = {'db':(6343,5432), 'simulator':(6399,3000),
         'delegate':(6300,3300), 'onelogin':(6301,3301),
         'hmrc':(6302,3302), 'observatory':(6303,3303),
         'about':(6304,3304), 'council':(6305,3305)}
for name, (host, target) in ports.items():
    services[name]['ports'] = [{'target':target,'published':str(host),
                               'host_ip':'127.0.0.1','protocol':'tcp'}]
for service in services.values():
    settings = service.get('environment', {})
    for key, value in settings.items():
        if isinstance(value, str):
            for old, new in [('3300','6300'),('3301','6301'),('3302','6302'),
                             ('3303','6303'),('3304','6304'),('3305','6305')]:
                value = value.replace('http://localhost:'+old, 'http://localhost:'+new)
            settings[key] = value
# Host-side tests/reset scripts must point at the same isolated databases.
replacements = {'5433':'6343','3399':'6399', **{str(3300+i):str(6300+i) for i in range(6)}}
for app in ['delegate','hmrc','onelogin','observatory']:
    target = root/'apps'/app/'.env'
    if target.exists():
        raise SystemExit(f'Refusing to overwrite {target}; use a fresh worktree')
for app in ['delegate','hmrc','onelogin','observatory']:
    text = (root/'apps'/app/'.env.example').read_text()
    for old, new in replacements.items():
        text = text.replace('localhost:'+old, 'localhost:'+new)
    target = root/'apps'/app/'.env'
    target.write_text(text)
    target.chmod(0o600)
path = Path(os.environ['RUNTIME_DIR'])/'compose.json'
path.write_text(json.dumps(config, indent=2)+'\n')
path.chmod(0o600)
print('Synthetic isolated configuration prepared; no service started.')
PY
docker compose -p "$RUNTIME_PROJECT" -f "$RUNTIME_DIR/compose.json" config --quiet
docker compose -p "$RUNTIME_PROJECT" -f "$RUNTIME_DIR/compose.json" up -d --build
docker compose -p "$RUNTIME_PROJECT" -f "$RUNTIME_DIR/compose.json" ps
```

Check readiness rather than only container startup: `6301/.well-known/openid-configuration`, `6300/api/catalogues/hmrc-personal-tax`, `6302/`, `6303/api/health`, `6304/`, `6305/health` and `6300/api/catalogues/council-casework` should return success on localhost. Inspect failures using only this project's services; redact logs before posting. The loopback ports must be unused before startup; never evict their owner.

For HTTP tests and browser journeys, set all destinations explicitly in the issue worktree's test shell:

```sh
export DELEGATE_URL=http://localhost:6300 HMRC_URL=http://localhost:6302
export ONELOGIN_URL=http://localhost:6301 ABOUT_URL=http://localhost:6304
export COUNCIL_URL=http://localhost:6305 TEST_APP_URL=http://localhost:6300
export APP_URL=http://localhost:6300
# Generate the host-side Prisma clients before running database-backed tests.
npm exec -w apps/delegate -- prisma generate
npm exec -w apps/hmrc -- prisma generate
npm exec -w apps/observatory -- prisma generate
# HMRC tests own queue fixtures; use its isolated database only.
docker compose -p "$RUNTIME_PROJECT" -f "$RUNTIME_DIR/compose.json" stop hmrc-worker
APP_URL=http://localhost:3302 DATABASE_URL=postgresql://delegate:delegate@localhost:6343/hmrc npm test -w apps/hmrc
docker compose -p "$RUNTIME_PROJECT" -f "$RUNTIME_DIR/compose.json" start hmrc-worker
DATABASE_URL=postgresql://delegate:delegate@localhost:6343/delegate HMRC_DATABASE_URL=postgresql://delegate:delegate@localhost:6343/hmrc npx vitest run
npx playwright test e2e/demo.spec.ts e2e/agents.spec.ts e2e/delegate.spec.ts e2e/hmrc.spec.ts e2e/onelogin.spec.ts e2e/swarm.spec.ts e2e/second-service.spec.ts
```

HMRC workspace tests construct requests with their fixed synthetic `3302` origin; that one command overrides `APP_URL` to match those in-memory requests while keeping its database isolated. Run the relevant workspace unit/type checks as well. These explicit browser files avoid the optional Fingerprint suite, which currently uses fixed `3302` destinations; do not run it against this range or the public stack. Public-tunnel tests also require a separate intentional public fixture. Read the actual test setup before expanding a suite or inheriting shell database variables. Confirm the demo from fresh synthetic state in this stack; record authorised/excluded/revoked/expired/unknown/no-relationship checks and activity-event results before claiming integration acceptance.

Pause and resume your own stack with `stop` / `start` using the same project and retained file. To retire its containers while preserving databases:

```sh
docker compose -p "$RUNTIME_PROJECT" -f "$RUNTIME_DIR/compose.json" down
```

Retain the config path and volume name in the handoff if resumption is expected; `up -d` recreates containers using the retained volume. Never add `-v`. Stop any host processes separately through their own verified ownership record; do not infer ownership from a reused PID or port. Post the final checkpoint with checks, retained evidence/data and released ports. Do not remove the worktree until its host processes are stopped and its owner has completed the handoff.

## Optional bin fixture

For synthetic bin journeys, the existing `npm run whenisbins:demo` launcher provides managed host-process ownership and a path-derived Compose project. It uses fixed `5700`–`5703`, `5710`, `55435` and `5799`, so only one fixture can use that range at a time even across different worktrees. Coordinate with the owner of the existing fixture before starting another. Run `npm run whenisbins:stop` from the **same originating checkout** to stop only its managed processes/dependencies and retain synthetic data. A new checkout cannot adopt the old fixture simply by using its ports. Do not use the public connector for regression resets or repeat real signup/cancellation. See [bin fixture/demo guide](whenisbins/DEMO.md).
