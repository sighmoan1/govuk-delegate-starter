#!/usr/bin/env bash
set -euo pipefail

# Only for disposable Linux GitHub Actions runners, before any containers start.
# https://docs.cloud.google.com/artifact-registry/docs/pull-cached-dockerhub-images
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "This Docker cache setup is for disposable GitHub Actions runners only." >&2
  exit 1
fi

sudo python3 - <<'PY'
import json
from pathlib import Path
p = Path("/etc/docker/daemon.json")
config = json.loads(p.read_text()) if p.exists() else {}
mirror = "https://mirror.gcr.io"
config["registry-mirrors"] = [mirror] + [
    value for value in config.get("registry-mirrors", []) if value != mirror
]
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(config, indent=2) + "\n")
PY
sudo systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}' | python3 -c 'import json,sys; assert "https://mirror.gcr.io/" in [v.rstrip("/")+"/" for v in json.load(sys.stdin)]; print("Docker public cache configured.")'

# Pull exact existing tags through the daemon cache. A cache miss falls back to
# Docker Hub and fails visibly if neither source is available; no test is skipped.
if (( $# == 0 )); then
  set -- postgres:16-alpine node:22-slim node:22-alpine
fi
for image in "$@"; do
  docker pull "$image"
done
