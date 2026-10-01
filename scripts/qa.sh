#!/usr/bin/env bash
# Local QA stack (no Docker / Supabase needed): Postgres + Supabase-compatible shim + fake Anthropic + the real Next app.
#   scripts/qa.sh up      build + start everything with fixtures (ports 54400 shim, 54401 fake AI, 3100 app)
#   scripts/qa.sh down    stop it
#   scripts/qa.sh reseed  restart only the data stack (fresh DB + fixtures)
set -uo pipefail
cd "$(dirname "$0")/.."
# stop by command pattern (ss/lsof may be missing); patterns never match this script's own command line
stop_stack() { pkill -f "tests/qa/stack\.ts" 2>/dev/null; pkill -f "tests/qa/fake-anthropic" 2>/dev/null; pkill -f "tests/qa/fake-sam" 2>/dev/null; true; }
stop_app() { pkill -f "next start -p 3100" 2>/dev/null; pkill -f "next-server" 2>/dev/null; true; }
stack() {
  stop_stack; sleep 1
  export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54400 SKIP_ENV_VALIDATION=1
  setsid npx tsx --tsconfig tests/qa/tsconfig.json tests/qa/stack.ts > /tmp/qa-stack.log 2>&1 &
  for _ in $(seq 1 90); do grep -q "QA stack up" /tmp/qa-stack.log 2>/dev/null && return 0; sleep 1; done
  echo "stack failed to start:"; tail -20 /tmp/qa-stack.log; return 1
}
app() {
  stop_app; sleep 1
  npx tsx --tsconfig tests/qa/tsconfig.json tests/qa/env.ts > /tmp/qa.env
  ( set -a; . /tmp/qa.env; set +a; SKIP_ENV_VALIDATION=1 npx next build > /tmp/qa-build.log 2>&1 ) || { tail -30 /tmp/qa-build.log; return 1; }
  ( set -a; . /tmp/qa.env; set +a; setsid npx next start -p 3100 > /tmp/qa-next.log 2>&1 & )
  for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3100/sign-in && return 0; sleep 1; done
  echo "app failed to start"; tail /tmp/qa-next.log; return 1
}
case "${1:-up}" in
  up) stack && app && echo "QA up: http://127.0.0.1:3100  (member@qa.test / owner@qa.test / viewer@qa.test, password qa-password-123)" ;;
  reseed) stack && echo "reseeded" ;;
  down) stop_app; stop_stack; scripts/test-db.sh stop ;;
esac
