# ADR-0024: A selection hold pins the render, because Beamhouse cannot hold the rig still

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#35](https://github.com/jnslmk/beamhouse/issues/35)

## Context

**Beamhouse never sends DMX** (§01), so a fixture can be mid-chase while you are dragging it. Not
one of the five products #35 surveyed has this problem: each is either the console, and owns the
values, or has a programmer of its own. BlenderDMX's *Target lock* is the nearest prior art and it
is aimed at the opposite problem — it stops live DMX fighting a manual aim, where Beamhouse has no
aim to defend.

§4.4 opens with *"you will nudge a tube ten centimetres forty times in an evening"*, and a strip
whose pixels are strobing is genuinely hard to aim.

## Decision

**A `Hold` chip pins the render of the current selection while it is selected. Frames keep
arriving and the feed never notices.**

It is render-side only: no feed state changes, nothing is dropped, and nothing downstream of
`resolve.ts` learns about it.

## Considered options

- **Do nothing.** You are editing *position*, not values, so the movement is arguably irrelevant.
  Rejected: it underrates how hard it is to place a fixture whose emitters are strobing.
- **A global edit mode** rendering the rig at a fixed synthetic look — all fixtures on, white,
  centred. Rejected because it throws away the reason you are in the app: you position fixtures
  *against what they are doing*.

## Consequences

- It is a render-side pin, so it sits cleanly under
  [ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md): signal health is a property of
  the feed, and the hold touches no feed state. A held universe is not stale and must never read
  as stale.
- The hold is **not** a command under
  [ADR-0016](0016-every-scene-mutation-is-one-undo-grained-command.md) — it mutates no scene state
  and earns no undo entry.
