#!/usr/bin/env bash
set -euo pipefail

# CI uses only the checked-in synthetic localhost configuration. Avoid replacing
# a developer's existing environment when this helper is run outside Actions.
mkdir -p ci-artifacts
for app in delegate hmrc onelogin; do
  target="apps/$app/.env"
  if [[ -e "$target" ]]; then
    echo "Refusing to replace $target; use a clean checkout for CI." >&2
    exit 1
  fi
done
for app in delegate hmrc onelogin; do
  cp "apps/$app/.env.example" "apps/$app/.env"
done
