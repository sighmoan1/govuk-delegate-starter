// HMRC's own database, and the secrets the code reads. Local development values only.
process.env.DATABASE_URL ??= "postgresql://delegate:delegate@localhost:5433/hmrc";
process.env.SESSION_SECRET ??= "dev-only-hmrc-session-secret-change-me-0123456789";
process.env.HMRC_SERVICE_KEY ??= "dev-hmrc-service-key";
process.env.APP_URL ??= "http://localhost:3302";
