#!/usr/bin/env node
// Put One Login, GOV.UK Delegate and HMRC on temporary public URLs, so agents
// that browse from the cloud (ChatGPT agent, Google's agent) can reach them.
//
//   npm run public        start Cloudflare quick tunnels, then the compose stack in public mode
//   npm run public:stop   stop the tunnels and the stack, and put local development back
//
// Public mode:
//   - fresh random secrets (the dev ones are in this repository, so anyone could forge sessions);
//   - the local test agent isn't trusted (its private key is in this repository too);
//   - demo endpoints (reset, swarm set-up) refuse anything that came through the tunnel.
// The about site and Example AI stay on localhost. All data is synthetic.
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, openSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const STATE = ".public";
const ENV_FILE = ".env.public";
const TUNNELS = [
  { name: "onelogin", port: 3301, env: "ONELOGIN_PUBLIC_URL" },
  { name: "delegate", port: 3300, env: "DELEGATE_PUBLIC_URL" },
  { name: "hmrc", port: 3302, env: "HMRC_PUBLIC_URL" },
];
const APPS = ["onelogin", "delegate", "hmrc", "agent", "about"];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const secret = () => randomBytes(32).toString("base64url");

async function start() {
  if (existsSync(`${STATE}/pids.json`)) fail("Already running. Run `npm run public:stop` first.");
  const busy = [3300, 3301, 3302, 3303, 3304].filter((p) => listenerIsNotDocker(p));
  if (busy.length) fail(`Ports ${busy.join(", ")} are in use (probably \`npm run dev\`). Stop the dev servers first.`);

  mkdirSync(STATE, { recursive: true });
  console.log("Starting Cloudflare quick tunnels…");
  const pids = {};
  const urls = {};
  // An empty config of our own: otherwise cloudflared reads ~/.cloudflared/config.yml,
  // whose ingress rules (for any named tunnel you have) would answer instead of these apps.
  writeFileSync(`${STATE}/cloudflared.yml`, "# Intentionally empty: quick tunnels only.\n");
  for (const t of TUNNELS) {
    const log = `${STATE}/${t.name}.log`;
    const child = spawn("cloudflared", ["--config", `${STATE}/cloudflared.yml`, "tunnel", "--no-autoupdate", "--url", `http://localhost:${t.port}`], {
      detached: true,
      stdio: ["ignore", openSync(log, "w"), openSync(log, "a")],
    });
    child.unref();
    pids[t.name] = child.pid;
  }
  writeFileSync(`${STATE}/pids.json`, JSON.stringify(pids, null, 2));
  for (const t of TUNNELS) urls[t.env] = await tunnelUrl(`${STATE}/${t.name}.log`);

  const env = {
    PUBLIC_MODE: "true",
    ...urls,
    DELEGATE_SESSION_SECRET: secret(),
    HMRC_SESSION_SECRET: secret(),
    AGENT_TOKEN_SECRET: secret(),
    HMRC_SERVICE_KEY: secret(),
    AGENT_CLIENT_SECRET: secret(),
    DEMO_CONSOLE_KEY: secret(),
  };
  writeFileSync(ENV_FILE, `# Written by scripts/public.mjs. Temporary; deleted by \`npm run public:stop\`.\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);

  console.log("\nBuilding and starting the stack in public mode…");
  sh("docker", ["compose", "--env-file", ENV_FILE, "up", "--build", "-d"]);

  console.log("\nWaiting for the services…");
  for (const port of [3300, 3301, 3302, 3303, 3304]) await waitFor(`http://localhost:${port}/`);
  // Through the tunnels, ask for something only these apps serve.
  await waitFor(`${urls.ONELOGIN_PUBLIC_URL}/.well-known/openid-configuration`, 120);
  await waitFor(`${urls.DELEGATE_PUBLIC_URL}/approve`, 120);
  await waitFor(`${urls.HMRC_PUBLIC_URL}/.well-known/agent-access.json`, 120);

  // Reseed, so the database holds hashes of the new service key and agent secret.
  // Called on localhost, so the demo gate lets it through.
  console.log("Resetting the demo with the new secrets…");
  const reset = (port, body) =>
    fetch(`http://localhost:${port}/api/demo/reset`, { method: "POST", headers: { "content-type": "application/json", "x-demo-key": env.DEMO_CONSOLE_KEY }, body: JSON.stringify(body) })
      .then((r) => { if (!r.ok) throw new Error(`reset on ${port}: ${r.status}`); return r.json(); });
  await reset(3300, {});
  await reset(3302, {});
  await reset(3303, {});

  console.log(`
Public URLs (temporary; they change every time):

  HMRC               ${urls.HMRC_PUBLIC_URL}
  GOV.UK Delegate    ${urls.DELEGATE_PUBLIC_URL}/account/delegates
  GOV.UK One Login   ${urls.ONELOGIN_PUBLIC_URL}

Local only:  about site http://localhost:3304 (reset buttons work) · Example AI http://localhost:3303

A prompt to try with an agent:

  Claim my working-from-home tax relief at ${urls.HMRC_PUBLIC_URL}

Sam approves at ${urls.DELEGATE_PUBLIC_URL}/approve — in your own browser, not the agent's.
Stop with: npm run public:stop
`);
}

async function stop() {
  if (existsSync(`${STATE}/pids.json`)) {
    for (const pid of Object.values(JSON.parse(readFileSync(`${STATE}/pids.json`, "utf8")))) {
      try { process.kill(pid); } catch { /* already gone */ }
    }
  }
  console.log("Stopping the public stack…");
  sh("docker", ["compose", "stop", ...APPS]);
  // Recreate the simulator with its local configuration (issuer and return URLs on localhost).
  sh("docker", ["compose", "up", "-d", "db", "simulator"]);
  rmSync(STATE, { recursive: true, force: true });
  rmSync(ENV_FILE, { force: true });
  // The database holds hashes of the public run's secrets; put the dev ones back.
  console.log("Reseeding with the local development secrets…");
  sh("npm", ["run", "db:reset"]);
  console.log("\nBack to local development. Start the apps with `npm run dev`.");
}

/** A port is busy with something other than this project's own containers. */
function listenerIsNotDocker(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fc"], { encoding: "utf8" });
    return out.split("\n").some((l) => l.startsWith("c") && !/docker|vpnkit|com\.docke/i.test(l));
  } catch {
    return false; // lsof exits 1 when nothing is listening
  }
}

async function tunnelUrl(log) {
  for (let i = 0; i < 60; i++) {
    const m = readFileSync(log, "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) return m[0];
    await sleep(1000);
  }
  fail(`No tunnel URL after 60 seconds. See ${log}.`);
}

async function waitFor(url, seconds = 180) {
  for (let i = 0; i < seconds; i++) {
    try {
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      if (r.status < 400) return; // Cloudflare answers 502/530 (or 404) until the app behind it is up
    } catch { /* not yet */ }
    await sleep(1000);
  }
  fail(`${url} didn't respond within ${seconds} seconds.`);
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

const cmd = process.argv[2];
if (cmd === "start") await start();
else if (cmd === "stop") await stop();
else fail("Usage: node scripts/public.mjs start|stop");
