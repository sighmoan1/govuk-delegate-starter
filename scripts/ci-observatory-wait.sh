#!/usr/bin/env bash
set -euo pipefail

deadline=$((SECONDS + 90))
until curl --fail --silent --output /dev/null --connect-timeout 2 --max-time 5 http://localhost:3303/api/health; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for Observatory's migrated database" >&2
    exit 1
  fi
  sleep 2
done
node -e 'fetch("http://localhost:3303/api/health").then(async r => { const h = await r.json(); if (!r.ok || h.service !== "observatory" || h.status !== "ready" || h.database !== "ready") process.exit(1); console.log("Observatory migrated database ready"); }).catch(() => process.exit(1));'
