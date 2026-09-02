#!/usr/bin/env bash
# ADR bookkeeping. Two subcommands:
#
#   tools/adr.sh next     what number a new ADR should take, INCLUDING numbers
#                         claimed on remote branches that have not merged yet
#   tools/adr.sh check    validate the whole record; exit 1 on any problem
#
# `next` exists because `ls docs/adr/` is not enough. On 2026-09-02 two agent
# sessions working in parallel worktrees both read 0008 as the maximum and both
# wrote an 0009 (issue #34). Only a scan that includes other branches would have
# caught it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADR="$ROOT/docs/adr"

# Every 4-digit ADR number visible anywhere: the working tree, origin/main, and
# every other ref. Deliberately over-inclusive -- a number claimed on a branch
# that is later abandoned costs nothing; a number claimed twice costs a rename
# across every citation.
all_numbers() {
  ls "$ADR" 2>/dev/null | sed -n 's/^\([0-9]\{4\}\)-.*\.md$/\1/p'
  git -C "$ROOT" for-each-ref --format='%(refname)' refs/heads refs/remotes 2>/dev/null |
    while read -r ref; do
      git -C "$ROOT" ls-tree --name-only "$ref" docs/adr/ 2>/dev/null |
        sed -n 's|^docs/adr/\([0-9]\{4\}\)-.*\.md$|\1|p'
    done
}

cmd_next() {
  echo "Scanning the working tree and every local and remote ref." >&2
  echo "Run 'git fetch --all' first if you have not recently." >&2
  echo >&2
  local max=0 n
  while read -r n; do
    [ -n "$n" ] || continue
    n=$((10#$n))
    [ "$n" -gt "$max" ] && max=$n
  done < <(all_numbers | sort -u)
  printf 'highest number claimed anywhere: %04d\n' "$max"
  printf 'use: %04d\n' $((max + 1))
  echo
  echo "Claim it by adding the row to docs/adr/README.md in the SAME commit as"
  echo "the ADR itself. An ADR that is not in the index is not findable, and an"
  echo "index row without an ADR is the cheapest possible collision marker."
}

fail=0
bad() { echo "  FAIL: $*"; fail=1; }

cmd_check() {
  echo "== numbers are unique in the working tree"
  local dupes
  dupes=$(ls "$ADR" | sed -n 's/^\([0-9]\{4\}\)-.*\.md$/\1/p' | sort | uniq -d)
  [ -z "$dupes" ] || bad "duplicate ADR numbers: $dupes"

  echo "== filename number matches the title number, and front matter exists"
  local f base num title
  for f in "$ADR"/[0-9][0-9][0-9][0-9]-*.md; do
    base=$(basename "$f"); num=${base:0:4}
    title=$(head -1 "$f")
    case "$title" in
      "# ADR-$num:"*) ;;
      *) bad "$base: title is '$title', expected '# ADR-$num: …'" ;;
    esac
    grep -q '^- \*\*Status:\*\*' "$f" || bad "$base: no Status field"
    grep -q '^- \*\*Date:\*\*'   "$f" || bad "$base: no Date field"
  done

  echo "== no two ADRs claim to decide the same issue"
  local d
  d=$(grep -h '^- \*\*Decides:\*\*' "$ADR"/*.md | grep -o 'issues/[0-9]*' | sort | uniq -d)
  [ -z "$d" ] || bad "two ADRs both claim Decides: $d"

  echo "== every ADR is in the index, and every index row is an ADR"
  local idx="$ADR/README.md"
  if [ ! -f "$idx" ]; then
    bad "docs/adr/README.md is missing"
  else
    for f in "$ADR"/[0-9][0-9][0-9][0-9]-*.md; do
      base=$(basename "$f")
      grep -q "$base" "$idx" || bad "$base is not listed in README.md"
    done
    while read -r base; do
      [ -f "$ADR/$base" ] || bad "README.md lists $base, which does not exist"
    done < <(grep -o '[0-9]\{4\}-[a-z0-9-]*\.md' "$idx" | sort -u)
  fi

  echo "== every relative markdown link in the repo resolves"
  python3 - "$ROOT" <<'PY' || fail=1
import re, sys, pathlib
root = pathlib.Path(sys.argv[1]); bad = 0
for p in root.rglob('*.md'):
    if '.git' in p.parts: continue
    for m in re.finditer(r'\]\((?!https?:|#|mailto:)([^)\s#]+)', p.read_text()):
        if not (p.parent / m.group(1)).resolve().exists():
            print(f"  FAIL: {p.relative_to(root)} -> {m.group(1)}"); bad = 1
sys.exit(bad)
PY

  echo
  if [ "$fail" -eq 0 ]; then echo "ADR record OK"; else echo "ADR record has problems"; fi
  return $fail
}

case "${1:-}" in
  next)  cmd_next ;;
  check) cmd_check ;;
  *) echo "usage: tools/adr.sh {next|check}" >&2; exit 2 ;;
esac
