# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Hazard: environments without the `gh` CLI

Some agent environments (Claude Code on the web, for one) have **no `gh` CLI** and reach GitHub
only through the GitHub MCP server. The MCP **read** path HTML-sanitizes issue bodies and
comments before handing them back:

- quotes and apostrophes come back as `&#34;` / `&#39;`
- **anything angle-bracketed is stripped entirely** — `<ColorSpace>`, `<Matrix>`, `<dir>` all
  vanish, leaving empty backticks behind

Verified 2026-09-02 by posting a comment containing ``--serve <dir>`` and an apostrophe, then
reading it back: the `<dir>` was gone and the apostrophe had become `&#39;`. The escaping is
**read-side** — a write-side escape would have returned `&amp;#39;` — so stored bodies are
intact; it is the copy you are handed that is lossy.

**Consequence: never round-trip a body.** Reading an issue, editing the text you got back, and
writing it again will silently delete every angle-bracketed token and entity-encode every quote.
This matters most for the **wayfinder map** (#1), which is long, full of `<Tag>` references, and
edited on every ticket resolution.

Comments and labels are safe to write blind. A **whole-body rewrite is only safe with the
procedure below**, which was used to append the #24 decision to the map and verified end to end.

### Safe whole-body edit without `gh`

1. **Get the body into a file, not into context.** Ask for more than the tool will return
   inline — `list_issues` with `fields: [number, title, body, state]` and `perPage: 100`
   overflows and is spilled to a `tool-results/*.txt` file. Parse that JSON with a script. This
   also avoids retyping 30 KB by hand, which is its own corruption risk.
2. **Reverse the entity escaping** with `html.unescape`. It is deterministic and complete —
   check that no `&…;` entities remain afterwards.
3. **Find the stripped tags.** They leave an **empty backtick pair** behind. Locate every
   occurrence and recover the real token from the *rendered* issue page
   (`https://github.com/<owner>/<repo>/issues/<n>`) — this repo is public, and GitHub renders a
   tag inside backticks as literal text, so the true token is readable there. **Do not guess
   them**: one such spot looked like `<Matrix>` from context and was actually `<Position>`.
4. **Assert, don't hope.** Make each repair a `replace` guarded by `count(old) == 1`, and assert
   no empty backtick pair remains before writing.
5. **Check for a concurrent edit** immediately before writing: re-fetch (step 1 again, still free
   of context cost) and compare byte-for-byte against your snapshot. Other sessions work this
   tracker in parallel, and a stale write silently destroys their resolutions — the #24 session
   caught #21 and #26 landing mid-flight this way.
6. **Verify after writing** by re-fetching and diffing the server's rendering against your
   pre-write snapshot. Because both sides pass through the same sanitiser, the diff must show
   *only* your intended changes — this catches any transcription slip regardless of what the
   sanitiser does. Then confirm on the rendered page that the restored tags survived.

A tag written *outside* backticks cannot be recovered this way, since GitHub treats it as HTML
and it is absent from the rendered page too. Keeping tags inside backticks keeps them
recoverable.
