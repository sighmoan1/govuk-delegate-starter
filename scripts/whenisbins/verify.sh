#!/usr/bin/env bash
set -euo pipefail
export WHENISBINS_TEST_ISOLATED=true
export WHENISBINS_URL=http://127.0.0.1:5710
export DELEGATE_URL=http://localhost:5700
export ONELOGIN_URL=http://localhost:5701
export HMRC_URL=http://localhost:5702
export DATABASE_URL=postgresql://delegate:delegate@localhost:55435/delegate
export AGENT_TOKEN_SECRET=dev-agent-token-secret
export OIDC_PRIVATE_KEY_FILE=dev/oidc-client-private.pem
npx tsx --tsconfig apps/delegate/tsconfig.json scripts/whenisbins/verify-authority.ts
npx playwright test --config e2e/whenisbins.config.ts
npx tsx scripts/whenisbins/verify-scheduled-evidence.ts
npx tsx --tsconfig apps/delegate/tsconfig.json scripts/whenisbins/verify-worker.ts
export DATABASE_URL=postgresql://observatory:observatory@localhost:55435/observatory
export RESEARCH_INGEST_ENABLED=true
export PUBLIC_MODE=false
export OBSERVATORY_COLLECTION_KEY=dev-whenisbins-observatory-key-20261010
export WHENISBINS_CONNECTOR_RESEARCH_FEED_URL=http://127.0.0.1:5710/api/research/events
export WHENISBINS_CONNECTOR_RESEARCH_FEED_KEY=dev-research-feed-key
TSX_TSCONFIG_PATH=apps/observatory/tsconfig.json node --import tsx scripts/whenisbins/verify-observatory.ts
