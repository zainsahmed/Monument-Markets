#!/usr/bin/env bash
# Local QA stack (no Docker / Supabase needed): Postgres + Supabase-compatible shim + fake Anthropic + the real Next app.
#   scripts/qa.sh up      build + start everything with fixtures (ports 54400 shim, 54401 fake AI, 3100 app)
#   scripts/qa.sh down    stop it
#   scripts/qa.sh reseed  restart only the data stack (fresh DB + fixtures)
set -uo pipefail
cd "$(dirname "$0")/.."
kill_port() { for p in $(ss -ltnp 2>/dev/null | grep ":$1 " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p" 2>/dev/null || true; done; }
stack() {
  kill_port 54400; kill_port 54401; sleep 1
  export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54400 SKIP_ENV_VALIDATION=1
  setsid npx tsx --tsconfig tests/qa/tsconfig.json tests/qa/stack.ts > /tmp/qa-stack.log 2>&1 &
  for _ in $(seq 1 90); do grep -q "QA stack up" /tmp/qa-stack.log 2>/dev/null && return 0; sleep 1; done
  echo "stack failed to start:"; tail -20 /tmp/qa-stack.log; return 1
}
app() {
  kill_port 3100; sleep 1
  npx tsx --tsconfig tests/qa/tsconfig.json tests/qa/env.ts > /tmp/qa.env
  ( set -a; . /tmp/qa.env; set +a; SKIP_ENV_VALIDATION=1 npx next build > /tmp/qa-build.log 2>&1 ) || { tail -30 /tmp/qa-build.log; return 1; }
  ( set -a; . /tmp/qa.env; set +a; setsid npx next start -p 3100 > /tmp/qa-next.log 2>&1 & )
  for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3100/sign-in && return 0; sleep 1; done
  echo "app failed to start"; tail /tmp/qa-next.log; return 1
}
case "${1:-up}" in
  up) stack && app && echo "QA up: http://127.0.0.1:3100  (member@qa.test / owner@qa.test / viewer@qa.test, password qa-password-123)" ;;
  reseed) stack && echo "reseeded" ;;
  down) kill_port 3100; kill_port 54400; kill_port 54401; scripts/test-db.sh stop ;;
esac
