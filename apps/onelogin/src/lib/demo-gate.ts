// Demo tooling (reset, swarm set-up) is for the local about site only. It
// needs the console key, and in public mode it refuses anything that came in
// through the Cloudflare tunnel, which always adds cf-connecting-ip. The about
// site calls these endpoints directly, so they keep working during live runs.
export function demoAllowed(req: Request) {
  if (req.headers.get("x-demo-key") !== (process.env.DEMO_CONSOLE_KEY ?? "dev-demo-console-key")) return false;
  return !(process.env.PUBLIC_MODE === "true" && req.headers.has("cf-connecting-ip"));
}
