#!/usr/bin/env bash
set -euo pipefail

# Run in an isolated checkout with npm ci already complete. These checks do not
# start services, migrate/reset data, install a browser or contact a vendor.
for app in delegate hmrc observatory; do
  npx prisma generate --schema "apps/$app/prisma/schema.prisma"
done
npm run typecheck
npm run build
npm test -w packages/research-feed
npm test -w apps/council
node --test scripts/e2/local-authority.test.mjs
node --test scripts/observatory/import-e2.test.mjs
