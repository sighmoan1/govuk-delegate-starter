import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL ??= "postgresql://delegate:delegate@localhost:5433/delegate";
