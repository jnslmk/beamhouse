#!/usr/bin/env bash
# GDTF Share API client. Docs: github.com/mvrdevelopment/tools/GDTF_Share_API
# Credentials come from .env (gitignored) - never pass them on the command line.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
COOKIE="$ROOT/.gdtf-session.txt"
LIST="$ROOT/fixtures/gdtf-share-list.json"
MANIFEST="$ROOT/fixtures/gdtf-manifest.json"
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

# Record a dependency by reference. We deliberately do NOT commit .gdtf files:
# GDTF Share grants no redistribution right (T&C 36-38) and profiles carry no
# licence field, so provenance is unstated. The manifest is a lockfile - it
# names what we depend on so `restore` can rebuild the library from the source.
pin() {
  local rid="${1:?usage: $0 pin <rid>}"
  [ -f "$LIST" ] || die "no local list - run: $0 sync"
  local entry
  entry=$(jq --arg r "$rid" '.list[] | select(.rid|tostring == $r)
          | {rid, manufacturer, fixture, revision, version, uuid}' "$LIST")
  [ -n "$entry" ] || die "rid $rid not in the local list"
  [ -f "$MANIFEST" ] || echo '{"fixtures":[]}' > "$MANIFEST"
  jq --argjson e "$entry" '.fixtures |= (map(select(.rid != $e.rid)) + [$e] | sort_by(.rid))' \
    "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
  echo "pinned $(jq -r '"\(.manufacturer) \(.fixture)"' <<<"$entry")"
}

restore() {
  [ -f "$MANIFEST" ] || die "no manifest at ${MANIFEST#$ROOT/}"
  local n=0
  while read -r rid; do get "$rid"; n=$((n+1)); done < <(jq -r '.fixtures[].rid' "$MANIFEST")
  echo "restored $n profiles from the manifest"
}

case "${1:-}" in
  login)  login ;;
  pin)    shift; pin "$@" ;;
  restore) restore ;;
  sync)   sync_list ;;
  search) shift; search "$@" ;;
  get)    shift; get "$@" ;;
  *) cat <<USAGE
usage: $0 <command>
  login           authenticate and store the session cookie
  sync            download the full revision list to fixtures/gdtf-share-list.json
  search <term>   grep the local list (manufacturer / fixture / revision)
  get <rid>       download one profile into fixtures/gdtf/
  pin <rid>       record a profile in fixtures/gdtf-manifest.json (committed)
  restore         re-download every pinned profile (rebuilds the library)
USAGE
  ;;
esac
