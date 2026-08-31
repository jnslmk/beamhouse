#!/usr/bin/env bash
# GDTF Share API client. Docs: github.com/mvrdevelopment/tools/GDTF_Share_API
# Credentials come from .env (gitignored) - never pass them on the command line.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
COOKIE="$ROOT/.gdtf-session.txt"
LIST="$ROOT/fixtures/gdtf-share-list.json"
OUTDIR="$ROOT/fixtures/gdtf"
API="https://gdtf-share.com/apis/public"

die() { echo "error: $*" >&2; exit 1; }

load_env() {
  [ -f "$ENV_FILE" ] || die "no .env - copy .env.example to .env and fill it in"
  set -a; . "$ENV_FILE"; set +a
  [ -n "${GDTF_SHARE_USER:-}" ]     || die "GDTF_SHARE_USER not set in .env"
  [ -n "${GDTF_SHARE_PASSWORD:-}" ] || die "GDTF_SHARE_PASSWORD not set in .env"
}

# Session cookie lasts 2h; log in only when the cookie is missing or stale.
login() {
  load_env
  local body
  body=$(jq -n --arg u "$GDTF_SHARE_USER" --arg p "$GDTF_SHARE_PASSWORD" \
    '{user:$u, password:$p}')
  local resp
  resp=$(curl -s -c "$COOKIE" -L -X POST "$API/login.php" \
    -H 'Content-Type: application/json' -d "$body")
  if [ "$(jq -r '.result' <<<"$resp")" != "true" ]; then
    die "login failed: $(jq -r '.error // .' <<<"$resp")"
  fi
  chmod 600 "$COOKIE"
  echo "logged in as $GDTF_SHARE_USER"
}

ensure_session() {
  if [ ! -f "$COOKIE" ] || [ -n "$(find "$COOKIE" -mmin +110 2>/dev/null)" ]; then
    login >&2
  fi
}

# Pull the full revision list once so every later question is a local grep.
sync_list() {
  ensure_session
  local resp; resp=$(curl -s -b "$COOKIE" "$API/getList.php")
  if [ "$(jq -r '.result' <<<"$resp")" != "true" ]; then
    rm -f "$COOKIE"; ensure_session
    resp=$(curl -s -b "$COOKIE" "$API/getList.php")
    [ "$(jq -r '.result' <<<"$resp")" = "true" ] \
      || die "getList failed: $(jq -r '.error // .' <<<"$resp")"
  fi
  jq '.' <<<"$resp" > "$LIST"
  echo "$(jq '.list | length' "$LIST") revisions -> ${LIST#$ROOT/}"
}

search() {
  [ -f "$LIST" ] || die "no local list - run: $0 sync"
  jq -r --arg q "${1:-}" '
    .list[]
    | select((.manufacturer + " " + .fixture + " " + .revision) | ascii_downcase
             | contains($q | ascii_downcase))
    | "\(.rid)\t\(.manufacturer)\t\(.fixture)\t[\(.revision)]\tv\(.version)\t\(.filesize)B"
  ' "$LIST" | sort -t$'\t' -k2,3
}

get() {
  local rid="${1:?usage: $0 get <rid>}"
  ensure_session
  local name
  name=$(jq -r --arg r "$rid" '.list[] | select(.rid|tostring == $r)
         | "\(.manufacturer)_\(.fixture)_\(.revision)"' "$LIST" 2>/dev/null \
         | tr -c 'A-Za-z0-9._-' '_' | sed 's/_*$//')
  [ -n "$name" ] || name="rid-$rid"
  local out="$OUTDIR/${name}.gdtf"
  curl -s -b "$COOKIE" "$API/downloadFile.php?rid=$rid" --output "$out"
  file "$out" | grep -qi zip || { rm -f "$out"; die "rid $rid did not return a zip"; }
  echo "$(du -h "$out" | cut -f1)  ${out#$ROOT/}"
}

case "${1:-}" in
  login)  login ;;
  sync)   sync_list ;;
  search) shift; search "$@" ;;
  get)    shift; get "$@" ;;
  *) cat <<USAGE
usage: $0 <command>
  login           authenticate and store the session cookie
  sync            download the full revision list to fixtures/gdtf-share-list.json
  search <term>   grep the local list (manufacturer / fixture / revision)
  get <rid>       download one profile into fixtures/gdtf/
USAGE
  ;;
esac
