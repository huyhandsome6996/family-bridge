#!/usr/bin/env bash
# B17 — MySQL backup script (RUNBOOK TEMPLATE — never auto-runs against
# production; an operator executes it deliberately with secrets supplied
# out-of-band, NOT committed here).
#
# Requirements it encodes (US-018 / master prompt §9.1):
# - dump with single transaction (consistent snapshot, InnoDB);
# - secret input via environment, never via CLI args or files in repo;
# - output to an operator-provided directory, encrypted by the operator's
#   tooling of choice (key ownership SEPARATE from the DB credentials);
# - exit non-zero on any failure; no silent partial backups.
#
# Usage (operator):
#   FB_MYSQL_HOST=... FB_MYSQL_PORT=... FB_MYSQL_DB=... \
#   FB_MYSQL_USER=... FB_MYSQL_PASSWORD=... \
#   FB_BACKUP_DIR=/secure/path ./ops/backup/backup.sh
set -euo pipefail

: "${FB_MYSQL_HOST:?missing FB_MYSQL_HOST}"
: "${FB_MYSQL_PORT:=3306}"
: "${FB_MYSQL_DB:?missing FB_MYSQL_DB}"
: "${FB_MYSQL_USER:?missing FB_MYSQL_USER}"
: "${FB_MYSQL_PASSWORD:?missing FB_MYSQL_PASSWORD (supplied out-of-band)}"
: "${FB_BACKUP_DIR:?missing FB_BACKUP_DIR}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${FB_BACKUP_DIR}/${FB_MYSQL_DB}-${STAMP}.sql.gz"

echo "[backup] start ${STAMP} db=${FB_MYSQL_DB} host=${FB_MYSQL_HOST}"
mysqldump \
  --host="${FB_MYSQL_HOST}" --port="${FB_MYSQL_PORT}" \
  --user="${FB_MYSQL_USER}" --password="${FB_MYSQL_PASSWORD}" \
  --single-transaction --routines --triggers --set-gtid-purged=OFF \
  --no-tablespaces "${FB_MYSQL_DB}" | gzip -c > "${TARGET}"

SIZE=$(wc -c < "${TARGET}")
if [ "${SIZE}" -lt 1024 ]; then
  echo "[backup] FAIL: dump suspiciously small (${SIZE} bytes)" >&2
  exit 2
fi
echo "[backup] OK file=${TARGET} bytes=${SIZE}"
echo "[backup] NEXT: encrypt at rest with the key-owner tooling, then run"
echo "         ops/backup/verify_restore.sh against an ISOLATED database"
echo "         (never the production one) and replay the deletion/"
echo "         revocation ledger before serving (WF-21)."
