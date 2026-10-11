#!/usr/bin/env bash
# B17 — restore verification into an ISOLATED database (rehearsal only).
# NEVER points at production. After restore, an operator MUST replay the
# deletion/revocation ledger (F15/B18) before serving — a raw restore
# NEVER revives revoked grants or deleted data (WF-21).
set -euo pipefail
DUMP="${1:?usage: verify_restore.sh <dump.sql.gz>}"
: "${FB_RESTORE_HOST:?missing FB_RESTORE_HOST}"
: "${FB_RESTORE_DB:?missing FB_RESTORE_DB (use an ISOLATED rehearsal db)}"
: "${FB_RESTORE_USER:?missing FB_RESTORE_USER}"
: "${FB_RESTORE_PASSWORD:?missing FB_RESTORE_PASSWORD}"
: "${FB_RESTORE_PORT:=3306}"
case "${FB_RESTORE_DB}" in
  *prod*|*production*)
    echo "[restore] REFUSING: rehearsal db name must not look production" >&2
    exit 3;;
esac
echo "[restore] creating isolated schema ${FB_RESTORE_DB}"
mysql --host="${FB_RESTORE_HOST}" --port="${FB_RESTORE_PORT}" \
  --user="${FB_RESTORE_USER}" --password="${FB_RESTORE_PASSWORD}" \
  -e "CREATE DATABASE IF NOT EXISTS \`${FB_RESTORE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "[restore] loading dump"
gunzip -c "${DUMP}" | mysql --host="${FB_RESTORE_HOST}" \
  --port="${FB_RESTORE_PORT}" --user="${FB_RESTORE_USER}" \
  --password="${FB_RESTORE_PASSWORD}" "${FB_RESTORE_DB}"
echo "[restore] row-count sanity:"
mysql --host="${FB_RESTORE_HOST}" --port="${FB_RESTORE_PORT}" \
  --user="${FB_RESTORE_USER}" --password="${FB_RESTORE_PASSWORD}" \
  -e "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='${FB_RESTORE_DB}' ORDER BY table_name;"
echo "[restore] DONE (rehearsal). NEXT: 1) replay deletion/revocation ledger (F15/B18); 2) readiness checks; 3) operator sign-off. RPO/RTO/cadence PENDING (DEC-12)."
