#!/usr/bin/env bash
set -euo pipefail

sensor_container="${COMPOSE_PROJECT_NAME:?Set an isolated Compose project}-hmrc-missing-key"
restore() {
  status=$?
  docker rm -f "$sensor_container" >/dev/null 2>&1 || true
  if ! docker compose start hmrc || ! bash scripts/ci-wait.sh; then
    status=1
  fi
  exit "$status"
}
trap restore EXIT

# Exercise enabled-but-unconfigured runtime coverage using the same built image.
# Never recreate the other services, and restore HMRC before later integration.
docker compose stop hmrc
docker compose run -d --no-deps --service-ports --name "$sensor_container" \
  -e FINGERPRINT_RESEARCH_ENABLED=true -e NEXT_PUBLIC_FINGERPRINT_API_KEY= \
  -e RESEARCH_FEED_ENABLED=true -e RESEARCH_FEED_KEY=ci-fingerprint-feed-key \
  -e RESEARCH_PSEUDONYM_KEY=ci-fingerprint-project-hmac-key-at-least-32-characters hmrc
bash scripts/ci-wait.sh
FINGERPRINT_EXPECT_MISSING=true npx playwright test e2e/fingerprint.spec.ts \
  --reporter=list --output=test-results/fingerprint-missing
