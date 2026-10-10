#!/usr/bin/env node
// Put One Login, GOV.UK Delegate and HMRC on temporary public URLs, so agents
// that browse from the cloud (ChatGPT agent, Google's agent) can reach them.
//
//   npm run public        start the tunnels, then the compose stack in public mode
//   npm run public:stop   stop the tunnels and the stack, and put local development back
//
// Two kinds of tunnel:
//   - Quick tunnels (default): random trycloudflare.com URLs, no account needed. Cloudflare
//     blocks OpenAI's crawler on that domain, so ChatGPT's own fetcher gets a 403.
//   - A named tunnel on a domain you own: stable URLs, and you control the bot settings.
//     Create public.config.json (gitignored):
//       { "tunnel": "govuk-delegate", "tunnelId": "<uuid>", "hosts": { "onelogin": "login-demo.example.org",
//         "delegate": "delegate-demo.example.org", "hmrc": "hmrc-demo.example.org" } }
//     Optionally add hosts.about for the read-only briefing instance on :3306.
//     with `cloudflared tunnel create` and `cloudflared tunnel route dns --overwrite-dns <uuid> <host>`.
//
// Public mode:
//   - fresh random secrets (the dev ones are in this repository, so anyone could forge sessions);
//   - the local test agent isn't trusted (its private key is in this repository too);
//   - demo endpoints (reset, swarm set-up) refuse anything that came through the tunnel.
// The presenter About console stays local. A separate read-only briefing surface may be public.
// `node scripts/public.mjs update` preserves data and credentials on an existing named stack.
// All data is synthetic.
import { spawn, execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { mkdirSync, openSync, readFileSync, writeFileSync, existsSync, rmSync, chmodSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const STATE = ".public";
const ENV_FILE = ".env.public";
const NAMED_CONFIG = "public.config.json";
const TUNNELS = [
  { name: "onelogin", port: 3301, env: "ONELOGIN_PUBLIC_URL" },
  { name: "delegate", port: 3300, env: "DELEGATE_PUBLIC_URL" },
  { name: "hmrc", port: 3302, env: "HMRC_PUBLIC_URL" },
];
const briefingTunnel = { name: "about", port: 3306, env: "ABOUT_PUBLIC_URL" };
const tunnelsFor = (named) => named && !named.hosts.about ? TUNNELS : [...TUNNELS, briefingTunnel];
const writeNamedIngress = (named, tunnels) => {
  const ingress = tunnels.map(t => `  - hostname: ${named.hosts[t.name]}\n    service: http://localhost:${t.port}`).join("\n");
  writeFileSync(`${STATE}/cloudflared.yml`, `tunnel: ${named.tunnelId}\ncredentials-file: ${homedir()}/.cloudflared/${named.tunnelId}.json\ningress:\n${ingress}\n  - service: http_status:404\n`);
};
const APPS = ["onelogin", "delegate", "hmrc", "about", "about-public"];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const secret = () => randomBytes(32).toString("base64url");

async function start() {
  if (existsSync(`${STATE}/pids.json`)) fail("Already running. Run `npm run public:stop` first.");
  const busy = [3300, 3301, 3302, 3304, 3306].filter((p) => listenerIsNotDocker(p));
  if (busy.length) fail(`Ports ${busy.join(", ")} are in use (probably \`npm run dev\`). Stop the dev servers first.`);

  mkdirSync(STATE, { recursive: true });
  const named = existsSync(NAMED_CONFIG) ? JSON.parse(readFileSync(NAMED_CONFIG, "utf8")) : null;
  const tunnels = tunnelsFor(named);
  const pids = {};
  const urls = {};
  if (named) {
    console.log(`Starting the named tunnel ${named.tunnel}…`);
    // Our own config, so ~/.cloudflared/config.yml (another tunnel's ingress) can't answer instead.
    writeNamedIngress(named, tunnels);
    const log = `${STATE}/tunnel.log`;
    const child = spawn("cloudflared", ["--config", `${STATE}/cloudflared.yml`, "tunnel", "--no-autoupdate", "run"], { detached: true, stdio: ["ignore", openSync(log, "w"), openSync(log, "a")] });
    child.unref();
    pids.tunnel = child.pid;
    writeFileSync(`${STATE}/pids.json`, JSON.stringify(pids, null, 2));
    for (const t of tunnels) urls[t.env] = `https://${named.hosts[t.name]}`;
  } else {
    console.log("Starting Cloudflare quick tunnels…");
    // An empty config of our own: otherwise cloudflared reads ~/.cloudflared/config.yml,
    // whose ingress rules (for any named tunnel you have) would answer instead of these apps.
    writeFileSync(`${STATE}/cloudflared.yml`, "no-autoupdate: true\n");
    for (const t of tunnels) {
      const log = `${STATE}/${t.name}.log`;
      const child = spawn("cloudflared", ["--config", `${STATE}/cloudflared.yml`, "tunnel", "--no-autoupdate", "--url", `http://localhost:${t.port}`], {
        detached: true,
        stdio: ["ignore", openSync(log, "w"), openSync(log, "a")],
      });
      child.unref();
      pids[t.name] = child.pid;
    }
    writeFileSync(`${STATE}/pids.json`, JSON.stringify(pids, null, 2));
    for (const t of tunnels) urls[t.env] = await tunnelUrl(`${STATE}/${t.name}.log`);
  }

  const env = {
    PUBLIC_MODE: "true",
    ...urls,
    DELEGATE_SESSION_SECRET: secret(),
    HMRC_SESSION_SECRET: secret(),
    AGENT_TOKEN_SECRET: secret(),
    HMRC_SERVICE_KEY: secret(),
    AGENT_CLIENT_SECRET: secret(),
    DEMO_CONSOLE_KEY: secret(),
    // Sam's password. The code texted to her phone shows on the about site's "Sam's phone" page.
    ONELOGIN_DEMO_PASSWORD: randomBytes(9).toString("base64url"),
  };
  writeFileSync(ENV_FILE, `# Written by scripts/public.mjs. Temporary; deleted by \`npm run public:stop\`.\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);

  console.log("\nBuilding and starting the stack in public mode…");
  sh("docker", ["compose", "--profile", "public-briefing", "--env-file", ENV_FILE, "up", "--build", "-d", "db", "simulator", "onelogin", "delegate", "hmrc", "hmrc-worker", "about", "about-public"]);

  console.log("\nWaiting for the services…");
  for (const port of [3300, 3301, 3302, 3304]) await waitFor(`http://localhost:${port}/`);
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

  console.log(`
Public URLs${named ? "" : " (temporary; they change every time)"}:

  HMRC               ${urls.HMRC_PUBLIC_URL}
  GOV.UK Delegate    ${urls.DELEGATE_PUBLIC_URL}/account/delegates
  GOV.UK One Login   ${urls.ONELOGIN_PUBLIC_URL}
  Briefings          ${urls.ABOUT_PUBLIC_URL ?? "not configured for this named tunnel"}

Local only:  about site http://localhost:3304 (reset buttons work)

Sign-in to One Login is strict in public mode: nothing is pre-filled, and it needs a password and a texted code.
Sam's email, password and codes: http://localhost:3304/sams-phone (open it in your own browser, not the agent's).

Prompts to try with an agent (one at a time):

  1. Go to ${urls.HMRC_PUBLIC_URL} and tell me whether I have any claims with HMRC, what state they are in, and whether HMRC has asked me anything.
  2. Go to ${urls.HMRC_PUBLIC_URL} and claim the working-from-home tax relief I'm entitled to.
  3. HMRC may have asked a question about my claim at ${urls.HMRC_PUBLIC_URL}. Read it, suggest an answer, and check with me before you send anything.
  4. Check my HMRC claim at ${urls.HMRC_PUBLIC_URL} once a day for the next week and tell me if anything changes.

Sam approves at ${urls.DELEGATE_PUBLIC_URL}/approve — in your own browser, not the agent's.
Stop with: npm run public:stop
`);
}

/** Upgrade an existing named public stack without rotating secrets or deleting fixtures. */
async function update() {
  if (!existsSync(ENV_FILE) || !existsSync(`${STATE}/pids.json`) || !existsSync(NAMED_CONFIG)) fail("Update needs an existing named public stack. Use start for a new installation.");
  const named = JSON.parse(readFileSync(NAMED_CONFIG,"utf8"));
  if (!named.hosts.about) fail("Configure hosts.about and its DNS route before publishing the briefings.");
  const pids = JSON.parse(readFileSync(`${STATE}/pids.json`,"utf8"));
  const oldEnv = readFileSync(ENV_FILE,"utf8");
  if (!/^PUBLIC_MODE=true$/m.test(oldEnv)) fail("Existing environment is not in public mode.");
  // Preserve every existing credential. Only add/replace the public explanation address.
  const aboutUrl = `https://${named.hosts.about}`;
  const nextEnv = oldEnv.split("\n").filter(l => !l.startsWith("ABOUT_PUBLIC_URL=")).join("\n").trimEnd()+`\nABOUT_PUBLIC_URL=${aboutUrl}\n`;
  writeFileSync(ENV_FILE,nextEnv,{mode:0o600});chmodSync(ENV_FILE,0o600);
  console.log("Building the public update; existing database volumes and credentials are retained…");
  sh("docker",["compose","--profile","public-briefing","--env-file",ENV_FILE,"up","--build","-d","onelogin","delegate","hmrc","hmrc-worker","about","about-public"]);
  for (const port of [3300,3301,3302,3304,3306]) await waitFor(`http://localhost:${port}/`);
  // Switch the named ingress only after the read-only surface is ready.
  writeNamedIngress(named,tunnelsFor(named));
  if (pids.tunnel) {
    try {
      const command=execFileSync("ps",["-p",String(pids.tunnel),"-o","command="],{encoding:"utf8"});
      if (!command.includes("cloudflared") || !command.includes(`${STATE}/cloudflared.yml`)) fail("Recorded tunnel PID belongs to another process; refusing to stop it.");
      process.kill(pids.tunnel);
    } catch(e) { if (e?.code !== "ESRCH" && e?.status !== 1) throw e; }
  }
  const log=`${STATE}/tunnel.log`;
  const child=spawn("cloudflared",["--config",`${STATE}/cloudflared.yml`,"tunnel","--no-autoupdate","run"],{detached:true,stdio:["ignore",openSync(log,"a"),openSync(log,"a")]});
  child.unref();pids.tunnel=child.pid;writeFileSync(`${STATE}/pids.json`,JSON.stringify(pids,null,2));
  await waitFor(`${aboutUrl}/briefing`,120);
  console.log(`Public briefings: ${aboutUrl}/briefing\nUpdate complete; no demo reset or credential rotation performed.`);
}

async function stop() {
  if (existsSync(`${STATE}/pids.json`)) {
    for (const pid of Object.values(JSON.parse(readFileSync(`${STATE}/pids.json`, "utf8")))) {
      try { process.kill(pid); } catch { /* already gone */ }
    }
  }
  console.log("Stopping the public stack…");
  sh("docker", ["compose", "--profile", "public-briefing", "stop", ...APPS]);
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
else if (cmd === "update") await update();
else if (cmd === "stop") await stop();
else fail("Usage: node scripts/public.mjs start|update|stop");
