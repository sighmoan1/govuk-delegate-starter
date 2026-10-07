// Everything except the sign-in screens goes straight to the official GOV.UK
// One Login simulator: discovery, keys, token and userinfo are untouched.
const SIMULATOR = process.env.SIMULATOR_INTERNAL_URL ?? "http://localhost:3399";

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  transpilePackages: ["@prototype/web-bot-auth"],
  async rewrites() {
    return { fallback: [{ source: "/:path*", destination: `${SIMULATOR}/:path*` }] };
  },
};
