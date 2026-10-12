# Public briefings and existing-demo upgrades

The public briefing instance is separate from the private About presenter console. Enable Compose profile `public-briefing`; `about-public` listens on loopback port 3306 and accepts only GET/HEAD for the four briefing pages, committed slides/image and their static assets. `/` redirects to `/briefing`. Other paths are 404 and write methods on allowed paths are 405, including Next server actions. It receives no presenter key or internal-service configuration. Observatory research workbench and source feeds stay outside the tunnel.

The public instance resolves navigation and service links at request time. Its connected navigation uses the public menu documented in [connected navigation](../CONNECTED_NAVIGATION.md): briefings, the demo guide and verified public service entry points only. The demo guide directs presenters to run the swarm privately. The existing About console on 3304 retains its local tools.

For a named Cloudflare tunnel, add `hosts.about` to the ignored `public.config.json`, create its DNS route using the existing tunnel credentials, and point its ingress to `http://localhost:3306`. Do not point it to the presenter console on 3304. `ABOUT_PUBLIC_URL` changes the explanatory link in One Login, Delegate and HMRC.

To upgrade an existing named public stack after fetching/reviewing merged main:

```sh
git pull --ff-only
node scripts/public.mjs update
```

`update` requires the existing `.env.public` and tunnel state. It preserves credential values and database volumes, adds the briefing address, rebuilds the public apps/worker, waits for readiness and then restarts the named tunnel with the new ingress. It does not run demo reset or reseed fixtures. Startup still applies migrations and registers current catalogues; existing citizen rows are retained. Back up the existing databases and private deployment configuration before an upgrade.

For a new installation, `npm run public` keeps its original fresh-install behaviour: it creates new credentials and resets the synthetic fixtures. Quick tunnels additionally publish the read-only briefing instance. Existing named configs without `hosts.about` retain the original three public service hosts. Do not use `public:stop`/`public` to perform an in-place upgrade: those commands deliberately restore/reset demo state.

Acceptance checks: both briefing levels and demo guide render on desktop/mobile; keyboard notes work; styles/fonts/image load; downloads exactly match committed deck bytes; no links to localhost or presenter tools; private paths and encoded bypasses refused; all writes refused before server actions; existing service discovery/strict sign-in/demo gates work; queue worker runs; pre-upgrade rows and credential fingerprints persist.

A public prototype running through a tunnel on the presenter's computer is available only while that computer, Docker and the tunnel remain running. It is not independently hosted production infrastructure.
