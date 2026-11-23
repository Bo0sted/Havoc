#!/bin/bash
# Sets up and manages Havoc's daily restic backups to Backblaze. Run it as the
# user Havoc runs as, not root: backups/manager.sh

ROOT="$(cd "$(dirname "$0")" && pwd)"
HAVOC="$(dirname "$ROOT")"
CONFIG="$ROOT/restic/.env"
REPORTS="$ROOT/backups"
UNITS="$HOME/.config/systemd/user"
ME="$(id -un)"
OWNER="$(stat -c %U "$HAVOC/havoc.db" 2>/dev/null || stat -c %U "$HAVOC")"
TIME_PATTERN='^([01][0-9]|2[0-3]):[0-5][0-9]$'

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as $OWNER, the user Havoc runs as, not as root."
  exit 1
fi
if [ "$ME" != "$OWNER" ]; then
  echo "Havoc's files belong to $OWNER. Run this as $OWNER, not $ME."
  exit 1
fi

confirm() {
  local answer
  read -rp "$1 [y/N] " answer
  [[ $answer =~ ^[Yy] ]]
}

# ask VAR "question" default pattern: asks until the answer matches pattern
ask() {
  local answer
  while true; do
    read -rp "$2${3:+ [$3]}: " answer
    answer="${answer:-$3}"
    [[ $answer =~ $4 ]] && break
    echo "That doesn't look right, try again."
  done
  printf -v "$1" '%s' "$answer"
}

enabled() { systemctl --user is-enabled --quiet havoc-backup.timer 2>/dev/null; }
lingering() { [ "$(loginctl show-user "$ME" --property=Linger --value 2>/dev/null)" = yes ]; }

save_config() {
  (umask 077; printf '%s=%q\n' \
    RESTIC_REPOSITORY "$RESTIC_REPOSITORY" \
    RESTIC_PASSWORD "$RESTIC_PASSWORD" \
    AWS_ACCESS_KEY_ID "$AWS_ACCESS_KEY_ID" \
    AWS_SECRET_ACCESS_KEY "$AWS_SECRET_ACCESS_KEY" \
    BACKUP_TIME "$BACKUP_TIME" \
    KEEP_MONTHS "$KEEP_MONTHS" > "$CONFIG")
}

save_timer() {
  mkdir -p "$UNITS"
  cat > "$UNITS/havoc-backup.service" <<EOF
[Unit]
Description=Havoc backup to Backblaze

[Service]
Type=oneshot
ExecStart=$ROOT/restic/backup.sh
EOF
  cat > "$UNITS/havoc-backup.timer" <<EOF
[Unit]
Description=Daily Havoc backup

[Timer]
OnCalendar=*-*-* $BACKUP_TIME:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
}

enable_daily() {
  save_timer
  if ! lingering; then
    echo "Without lingering, the daily backup only runs while $ME is logged in."
    confirm "Turn lingering on with sudo loginctl enable-linger $ME?" && sudo loginctl enable-linger "$ME"
  fi
  systemctl --user enable --now havoc-backup.timer
}

setup() {
  local auth endpoint bucket again
  echo "No backup is set up yet. Let's set one up."
  while true; do
    read -rp "Backblaze key ID: " AWS_ACCESS_KEY_ID
    read -rsp "Backblaze application key: " AWS_SECRET_ACCESS_KEY
    echo
    # The key goes in on stdin so it doesn't show in the process list
    auth="$(curl -sS -f -K - https://api.backblazeb2.com/b2api/v3/b2_authorize_account \
      <<<"user = \"$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY\"")" && break
    echo "Backblaze didn't accept that key, try again."
  done
  endpoint="$(grep -o '"s3ApiUrl": *"[^"]*"' <<<"$auth" | cut -d'"' -f4)"
  if [ -z "$endpoint" ]; then
    echo "Backblaze's reply had no S3 address for this key."
    return 1
  fi
  ask bucket "Bucket name" "" '^[A-Za-z0-9-]+$'
  RESTIC_REPOSITORY="s3:$endpoint/$bucket/havoc"

  while true; do
    read -rsp "Backup password, or press Enter to generate one: " RESTIC_PASSWORD
    echo
    [ -z "$RESTIC_PASSWORD" ] && break
    read -rsp "Type it again: " again
    echo
    [ "$again" = "$RESTIC_PASSWORD" ] && break
    echo "Those don't match, try again."
  done
  if [ -z "$RESTIC_PASSWORD" ]; then
    RESTIC_PASSWORD="$(head -c 24 /dev/urandom | base64)"
    echo "Your backup password is: $RESTIC_PASSWORD"
  fi
  echo "Keep this password somewhere other than this server. Without it the backups can't be decrypted."
  read -rp "Press Enter to continue."

  ask BACKUP_TIME "Daily backup time, 24 hour HH:MM" 00:00 "$TIME_PATTERN"
  ask KEEP_MONTHS "Keep backups for how many months (0 keeps them forever)" 3 '^[0-9]+$'

  export RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  if restic cat config >/dev/null 2>&1; then
    echo "Found existing Havoc backups in that bucket, using them."
  else
    restic init || return 1
  fi
  save_config
  enable_daily
}

status() {
  local snaps last newest
  echo
  echo "Havoc backups ($CONFIG)"
  if enabled; then echo "  Daily backup:   enabled, at $BACKUP_TIME"; else echo "  Daily backup:   disabled"; fi
  if lingering; then
    echo "  Lingering:      on"
  else
    echo "  Lingering:      off, so the daily backup only runs while $ME is logged in"
  fi
  if [ "$KEEP_MONTHS" = 0 ]; then echo "  Kept for:       forever"; else echo "  Kept for:       $KEEP_MONTHS months"; fi
  if snaps="$(restic snapshots --json 2>&1)"; then
    echo "  Backblaze:      credentials OK, $(grep -o '"short_id"' <<<"$snaps" | wc -l) backups stored"
  else
    echo "  Backblaze:      FAILED"
    sed 's/^/    /' <<<"$snaps"
  fi
  echo "  Backups run:    $(cat "$REPORTS"/SUCCESS__*.txt 2>/dev/null | grep -c '^Backed up ')"
  last="$(ls -t "$REPORTS"/SUCCESS__*.txt 2>/dev/null | head -1)"
  if [ -n "$last" ]; then
    echo "  Last backed up: $(grep '^Backed up ' "$last" | tail -1 | cut -d' ' -f3-)"
  else
    echo "  Last backed up: never"
  fi
  newest="$(ls -t "$REPORTS"/*__*.txt 2>/dev/null | head -1)"
  if [[ $newest == */FAILED__* ]]; then
    echo
    echo "The last backup FAILED:"
    awk '/^Failed [0-9][0-9][0-9][0-9]-/ { entry = "" } { entry = entry $0 "\n" } END { printf "%s", entry }' "$newest"
  fi
}

view() {
  local snaps n id day clock files f dest
  echo "Viewing backups downloads them from Backblaze, which can cost extra on your Backblaze bill."
  confirm "Continue?" || return
  mapfile -t snaps < <(restic snapshots --compact | grep -E '^[0-9a-f]{8} ' | tac)
  if [ ${#snaps[@]} -eq 0 ]; then
    echo "There are no backups in Backblaze yet."
    return
  fi
  for n in "${!snaps[@]}"; do
    read -r id day clock _ <<<"${snaps[n]}"
    printf '  %d) %s %s  %s\n' $((n + 1)) "$day" "$clock" "$id"
  done
  while true; do
    read -rp "Pick one: " n
    [[ $n =~ ^[0-9]+$ ]] && ((n >= 1 && n <= ${#snaps[@]})) && break
  done
  read -r id day _ <<<"${snaps[n - 1]}"

  # Each line is "<size> <path>" for a file in that backup
  mapfile -t files < <(restic ls --long "$id" | awk '/^-/ { print $4, $NF }')
  for f in "${files[@]}"; do
    printf '  %-10s %s\n' "$(basename "${f#* }")" "$(numfmt --to=iec --suffix=B "${f%% *}")"
  done

  dest="/tmp/havoc-restore-$(date -d "$day" +%m-%d-%y)"
  confirm "Download and decrypt it to $dest?" || return
  if [ -e "$dest" ] && [ ! -O "$dest" ]; then
    echo "$dest belongs to someone else, so it wasn't used."
    return
  fi
  mkdir -p -m 700 "$dest"
  for f in "${files[@]}"; do
    restic dump "$id" "${f#* }" > "$dest/$(basename "${f#* }")" || return
  done
  echo "Saved to $dest. /tmp is cleared when the server restarts."
}

change() {
  ask BACKUP_TIME "Daily backup time, 24 hour HH:MM" "$BACKUP_TIME" "$TIME_PATTERN"
  ask KEEP_MONTHS "Keep backups for how many months (0 keeps them forever)" "$KEEP_MONTHS" '^[0-9]+$'
  save_config
  save_timer
  enabled && systemctl --user restart havoc-backup.timer
  echo "Saved. The new retention applies from the next backup."
}

if ! command -v restic >/dev/null; then
  confirm "restic isn't installed. Install it with sudo apt-get?" || exit 1
  sudo apt-get update && sudo apt-get install -y restic || exit 1
fi

if [ -f "$CONFIG" ]; then
  set -a
  . "$CONFIG"
  set +a
else
  setup || exit 1
fi

while true; do
  status
  echo
  echo "  1) Run a backup now"
  if enabled; then echo "  2) Disable the daily backup"; else echo "  2) Enable the daily backup"; fi
  echo "  3) View backups in Backblaze"
  echo "  4) Change the backup time or retention"
  echo "  5) Quit"
  read -rp "Choose: " choice
  case $choice in
    1) "$ROOT/restic/backup.sh" ;;
    2) if enabled; then systemctl --user disable --now havoc-backup.timer; else enable_daily; fi ;;
    3) view ;;
    4) change ;;
    5) exit 0 ;;
  esac
done
