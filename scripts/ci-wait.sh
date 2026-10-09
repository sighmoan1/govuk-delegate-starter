#!/usr/bin/env bash
set -euo pipefail

# A started container is not a migrated, seeded and usable application. Probe
# OIDC metadata and Delegate's seeded catalogue as well as both other pages.
urls=(
  http://localhost:3301/.well-known/openid-configuration
  http://localhost:3300/api/catalogues/hmrc-personal-tax
  http://localhost:3302/
  http://localhost:3304/
)
deadline=$((SECONDS + 180))
for url in "${urls[@]}"; do
  until curl --fail --silent --output /dev/null --connect-timeout 2 --max-time 5 "$url"; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for $url" >&2
      exit 1
    fi
    sleep 2
  done
  echo "Ready: $url"
done
