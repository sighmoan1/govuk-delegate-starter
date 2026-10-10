import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function publicEnvValues(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

// Validate before touching the retained environment, containers or tunnel ingress.
// Root separately verifies address/mailbox ownership and the live catalogue contents.
export function whenisbinsPublicPlan(named, environment, options = {}) {
  const env = publicEnvValues(environment), host = named?.hosts?.whenisbins;
  if (!host && env.WHENISBINS_LIVE_ENABLED !== "true") return { enabled: false };
  if (!host || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || !host.includes(".")) throw new Error("Configure a valid named WhenIsBins hostname and DNS route before enabling live delivery.");
  if (env.PUBLIC_MODE !== "true" || env.WHENISBINS_MODE !== "live" || env.WHENISBINS_LIVE_ENABLED !== "true") throw new Error("Public WhenIsBins requires explicit live mode; fixture fallback is refused.");
  if (!env.WHENISBINS_PRIVATE_CONFIG_DIR) throw new Error("Private WhenIsBins input directory is required.");
  const configDir = resolve(options.cwd || process.cwd(), env.WHENISBINS_PRIVATE_CONFIG_DIR);
  const present = options.exists || existsSync;
  for (const file of ["properties.json", "catalogue.json", "mailboxes.json"]) if (!present(resolve(configDir, file))) throw new Error(`Required private WhenIsBins input is missing: ${file}.`);
  for (const name of ["WHENISBINS_SERVICE_KEY", "WHENISBINS_AGENT_CLIENT_SECRET", "WHENISBINS_RESEARCH_FEED_KEY", "WHENISBINS_RESEARCH_PSEUDONYM_KEY"]) if (!env[name] || env[name].length < 32) throw new Error(`A strong private ${name} is required.`);
  if (!env.WHENISBINS_AGENT_CLIENT_ID || !/^[0-9a-f]{64}$/i.test(env.WHENISBINS_PRESENTER_CODE_HASH || "")) throw new Error("Registered agent identity and a private presenter code hash are required.");
  if (env.WHENISBINS_RESEARCH_FEED_ENABLED !== "true") throw new Error("Explicit private WhenIsBins research collection configuration is required.");
  const credentials = [env.WHENISBINS_SERVICE_KEY, env.WHENISBINS_AGENT_CLIENT_SECRET, env.WHENISBINS_RESEARCH_FEED_KEY, env.WHENISBINS_RESEARCH_PSEUDONYM_KEY];
  if (new Set(credentials).size !== credentials.length) throw new Error("WhenIsBins service, agent, feed and pseudonym credentials must be separate.");
  return { enabled: true, configDir, url: `https://${host}` };
}

export function updatePublicAddresses(environment, aboutUrl, whenisbins) {
  const replaced = new Set(["ABOUT_PUBLIC_URL", ...(whenisbins.enabled ? ["WHENISBINS_PUBLIC_URL"] : [])]);
  const retained = environment.split("\n").filter(line => !replaced.has(line.split("=", 1)[0])).join("\n").trimEnd();
  return `${retained}\nABOUT_PUBLIC_URL=${aboutUrl}\n${whenisbins.enabled ? `WHENISBINS_PUBLIC_URL=${whenisbins.url}\n` : ""}`;
}
