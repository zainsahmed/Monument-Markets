#!/usr/bin/env bash
# Starts a throwaway local Postgres for migration/RLS tests. Usage: scripts/test-db.sh start|stop
# Prints the connection URL on start. Requires Postgres 15+ server binaries (no Docker needed).
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
DIR=${FP_PG_DIR:-/tmp/fieldpoint-pg}
PORT=${FP_PG_PORT:-54329}
RUN=""; [ "$(id -u)" = 0 ] && RUN="runuser -u postgres --"
case "${1:-start}" in
  start)
    if [ ! -d "$DIR/data" ]; then
      mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown postgres "$DIR"
      $RUN "$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
    fi
    $RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null || true
    echo "postgres://postgres@127.0.0.1:$PORT/postgres" ;;
  stop) $RUN "$PGBIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null || true ;;
esac
