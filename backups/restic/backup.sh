#!/bin/bash
# Backs up Havoc's .env and database to Backblaze with restic, encrypted, and
# writes a SUCCESS__ or FAILED__ report to backups/backups/. Run daily by the
# timer manager.sh sets up, or from its menu.

RESTIC_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORTS="$(dirname "$RESTIC_DIR")/backups"
HAVOC="$(dirname "$(dirname "$RESTIC_DIR")")"
# The live database is in WAL mode, so a consistent copy made with the same
# node:sqlite Havoc uses is what gets backed up. Restore it as havoc.db.
COPY="$RESTIC_DIR/havoc.db"
FILES=("$HAVOC/.env" "$COPY")
DAY="$(date +%m-%d-%y)"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"
LOG="$(mktemp)"
trap 'rm -f "$COPY" "$LOG"' EXIT

backup() {
  if [ ! -f "$RESTIC_DIR/.env" ]; then
    echo "restic/.env is missing. Run manager.sh to set up backups."
    return 1
  fi
  set -a
  . "$RESTIC_DIR/.env"
  set +a
  rm -f "$COPY"
  cd "$HAVOC" && node --no-warnings --env-file-if-exists=.env -e '
    const { existsSync } = require("node:fs");
    const { DatabaseSync } = require("node:sqlite");
    const db = process.env.DB_PATH || "havoc.db";
    if (!existsSync(db)) { console.error(`No database at ${db}`); process.exit(1); }
    new DatabaseSync(db).prepare("VACUUM INTO ?").run(process.argv[1]);
  ' "$COPY" || return 1
  # Clean up any stale lock from a crashed previous run
  restic unlock || return 1
  restic backup "${FILES[@]}" || return 1
  if [ "$KEEP_MONTHS" != 0 ]; then
    restic forget --keep-within "${KEEP_MONTHS}m" --prune || return 1
  fi
}

mkdir -p "$REPORTS"
backup 2>&1 | tee "$LOG"
if [ "${PIPESTATUS[0]}" -eq 0 ]; then
  {
    echo "Backed up $NOW"
    grep -o 'snapshot [0-9a-f]* saved' "$LOG"
    for f in "${FILES[@]}"; do
      printf '  %-10s %s\n' "$(basename "$f")" "$(numfmt --to=iec --suffix=B "$(stat -c %s "$f")")"
    done
    grep '^Added to the repo' "$LOG"
    echo
  } >> "$REPORTS/SUCCESS__$DAY.txt"
  echo "Havoc backup OK"
else
  { echo "Failed $NOW"; cat "$LOG"; echo; } >> "$REPORTS/FAILED__$DAY.txt"
  echo "Havoc backup FAILED, see $REPORTS/FAILED__$DAY.txt" >&2
  exit 1
fi
