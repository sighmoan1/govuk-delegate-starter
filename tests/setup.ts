import { existsSync } from "node:fs";

// Delegate's dev env gives the tests its database URL and secrets.
if (existsSync("apps/delegate/.env")) process.loadEnvFile("apps/delegate/.env");
process.env.DATABASE_URL ??= "postgresql://delegate:delegate@localhost:5433/delegate";
process.env.OIDC_PRIVATE_KEY_FILE ??= "dev/oidc-client-private.pem";
