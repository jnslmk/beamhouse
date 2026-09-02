# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — start at [`docs/adr/README.md`](../adr/README.md), the index: number, title, date, originating ticket and a one-line gist of each. Read the ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Writing an ADR: get the number from the tool

**Never take the next ADR number from `ls docs/adr/`.** Run:

```
git fetch --all
tools/adr.sh next
```

It scans the working tree, `origin/main` and every other local and remote ref, because **a number claimed on an unmerged branch is still claimed**. `ls` sees only your own worktree.

This rule exists because the obvious approach failed. On 2026-09-02 two sessions working in parallel worktrees each read `0008` as the maximum and each wrote an `0009` ([#34](https://github.com/jnslmk/beamhouse/issues/34)). Neither could have known: nothing on either machine's filesystem said otherwise. `docs/DESIGN.md` then coined `ADR-0009a` as a local workaround, which is what kept the clash invisible — a reader saw a number that looked deliberate rather than broken. Unpicking it touched eleven citation sites, the index and the wayfinder map.

Two things make it stick:

- **Add the index row in the same commit as the ADR.** An ADR missing from `docs/adr/README.md` is unfindable; an index row with no ADR behind it is the cheapest collision marker there is. Both directions are enforced.
- **Run `tools/adr.sh check` before pushing anything under `docs/adr/`.** It verifies unique numbers, that the filename number and the title number agree, that required front matter is present, that no two ADRs claim the same `Decides:` ticket, that the index and the directory match both ways, and that every relative Markdown link in the repo resolves.

`docs/adr/README.md` documents the front-matter field vocabulary (`Decides:` vs `Surfaced by:` vs `Source:`) and the body structure. Follow it rather than copying whichever ADR you happened to open — three of the eleven had drifted before this was written.

**Numbers are never reused.** If a number has to change after publication, the moved ADR carries a `Renumbered:` line naming the old one, and old commits and issue comments stay as written.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
