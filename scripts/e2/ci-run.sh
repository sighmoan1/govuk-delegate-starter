#!/usr/bin/env bash
set -euo pipefail
mkdir -p e2-artifacts
pids=()
stop_hmrc() {
  for pid in "${pids[@]}"; do kill -- "-$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  pids=()
}
cleanup() { stop_hmrc; kill -- "-$delegate_pid" 2>/dev/null || true; }
setsid npm run start -w apps/delegate > e2-artifacts/delegate-server.log 2>&1 &
delegate_pid=$!
trap cleanup EXIT
wait_url() {
  for i in {1..90}; do
    if curl --silent --fail "$1" >/dev/null; then return 0; fi
    sleep 1
  done
  echo "Server did not become ready: $1" >&2; return 1
}
wait_url http://127.0.0.1:3300/
printf '%s\n' 'Same production HMRC build, default domain/throughput policy, default queue worker settings; restarted for each arm. Fixtures use fresh subjects per arm. No model. Arm order B,C,C,B. Consent/human effort unmeasured.' > e2-artifacts/config.txt
failed=0
for pair in '1 B' '2 C' '3 C' '4 B'; do
  read -r order arm <<< "$pair"
  authority=http://127.0.0.1:3300
  if [[ "$arm" == B ]]; then authority=http://127.0.0.1:3310; fi
  setsid env DELEGATE_INTERNAL_URL="$authority" npm run start -w apps/hmrc > "e2-artifacts/hmrc-$order-$arm.log" 2>&1 &
  pids+=("$!")
  setsid env DELEGATE_INTERNAL_URL="$authority" npm run worker -w apps/hmrc > "e2-artifacts/worker-$order-$arm.log" 2>&1 &
  pids+=("$!")
  wait_url http://127.0.0.1:3302/
  E2_ARM="$arm" E2_SEED=20261009 E2_REPEATS=5 E2_OUTPUT="e2-artifacts/order-$order-$arm" \
    E2_HMRC_DATABASE_URL=postgresql://delegate:delegate@localhost:5433/hmrc \
    TSX_TSCONFIG_PATH=apps/delegate/tsconfig.json node --env-file=apps/delegate/.env --import tsx scripts/e2/run.mjs \
    > "e2-artifacts/runner-$order-$arm.log" 2>&1 || failed=1
  stop_hmrc
  if [[ "$order" == 1 ]]; then b1=$(find e2-artifacts/order-1-B -name run.json | head -1); fi
  if [[ "$order" == 2 ]]; then c1=$(find e2-artifacts/order-2-C -name run.json | head -1); fi
  if [[ "$order" == 3 ]]; then c2=$(find e2-artifacts/order-3-C -name run.json | head -1); fi
  if [[ "$order" == 4 ]]; then b2=$(find e2-artifacts/order-4-B -name run.json | head -1); fi
done
node scripts/e2/compare.mjs "$b1" "$c1" > e2-artifacts/comparison-BC.json
node scripts/e2/compare.mjs "$b2" "$c2" > e2-artifacts/comparison-CB.json
exit "$failed"
