# ADR-0014: The agent surface is two surfaces, and only the look half is a feed

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#5](https://github.com/jnslmk/beamhouse/issues/5)

## Context

[#5](https://github.com/jnslmk/beamhouse/issues/5) asked whether `DESIGN.md` §11.3's "agent
surface" — the renderer taking injected state directly, so an agent could set a look and
screenshot it with no console running — is a fourth `source.ts` implementation in v1.

**Five of the ticket's premises were false, and the fifth moved the answer.**

1. **`source.ts` does not exist.** The module is `feed.ts`, and `CONTEXT.md` lists
   *"source (unqualified)"* on the **Feed** entry's `_Avoid_` line. The ticket is written in
   vocabulary the glossary bans.
2. **There are two implementations, not three.**
   [ADR-0009](0009-deployment-is-inferred-from-origin.md) removed `relay` — nothing ever defined
   it. §03's layout comment still said `live | relay | recorded`, stale by a day.
3. **The glossary already settled the ticket's first bullet.** A **Frame** is *"one tick's worth
   of slot values"* — *"the unit a feed delivers."* A feed emitting resolved fixture attributes
   is not emitting Frames, so it is not a feed. §03 confirms it structurally: `feed.ts` sits
   **upstream** of `resolve.ts`. The ticket's "resolved attributes, or raw DMX?" was not a choice
   within its own title; picking attributes *is* the answer "no, it is not a feed implementation."
4. **"Check it against the real interface once `resolve.ts` has a shape" is unrunnable.** There is
   no `src/`, no `bridge/`, no `packages/`. M0–M8 is downstream of the map, so that check can
   never be performed inside it.
5. **The ticket asked about the wrong surface entirely.** Grilling the intended consumer produced
   a use that is not a feed at all: *"look at the 10 WLED star and configure it in 3D in Beamhouse
   without reloading a file"* — placement, arrays and overrides (§4.4, §4.5), which sit on the
   **opposite side of the pipeline from `feed.ts`**. It is also the map's homeless requirement:
   [#23](https://github.com/jnslmk/beamhouse/issues/23) found the STAR-TENT's spokes cabled back
   and forth, so five of ten must be placed rotated 180° about their own mid-point, and Mizer
   cannot carry it (`FixturePosition` has no Z and no rotation).

## Decision

**"The agent surface" names two surfaces. They share only the word *agent*, and they are decided
separately.**

1. **The look surface is a feed, and it is `generated`.** A third `feed.ts` implementation whose
   frames are **computed** rather than received or stored, exposing one `nextFrame(t)`.
2. **A look carries DMX slot values, never resolved attributes.** It is a Frame, so it enters at
   the top of the pipeline and exercises patch, breaks
   ([ADR-0011](0011-a-fixture-is-addressed-per-break.md)), resolution
   ([ADR-0010](0010-resolution-is-total-the-renderer-selects-by-attribute.md)) and colour
   ([ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md)).
3. **`generated` is shared with §9.2's demo motion mode.** The seeded chase for shared links and
   the agent's held look are two callers of one implementation.
4. **The scene surface is not a feed**, and is decided by
   [ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md) and
   [ADR-0016](0016-every-scene-mutation-is-one-undo-grained-command.md).
5. **The agent surface is in v1**, as **M3b** — after M3a, *before* the M4 wall.

## Considered options

- **A one-frame `Recording`.** A held look is a one-frame recording, and `recorded` already
  exists, so this needs no new implementation. Rejected: an agent sets a look, captures, sets
  another, and `recorded` replays a *fixed stored* thing — so swapping it per command means
  re-loading a whole recording to change one slot. That is the whole-document-write hazard that
  ruled out the file-based scene path, in miniature. A `generated` feed with a settable current
  frame is incremental by construction.
- **Injecting resolved attributes.** Far easier to drive, and the reason it loses is that it
  bypasses everything worth testing: a green screenshot can sit on top of a broken resolver.
  ADR-0010 made resolution *total*, which makes the resolver the part most worth keeping under a
  screenshot.
- **Keeping the two surfaces as one ticket.** Rejected: one ADR arguing two unrelated invariants.
  The feed half was nearly answered by the glossary; the scene half had not started.

## Consequences

- `feed.ts` has three implementations — `live`, `recorded`, `generated`. The ticket's premise of
  "three" turns out true, with a different third: **ADR-0009 deleted `relay` for never having
  been defined, and `generated` takes the vacated slot with a definition.**
- §9.2's demo motion mode stops being an unowned aspiration and becomes a caller of a v1
  component.
- §01 no longer lists the agent surface as *"undecided for v1"*.
- **M3 gains a constraint, not a sibling**: ADR-0016's command layer must land *with* the scene
  editor.
- The ticket's throwaway line — *"screenshot-via-headless-browser is a harness concern outside
  Beamhouse"* — survives in spirit and is reversed in detail by ADR-0015: the harness is outside,
  but Beamhouse serves the capture itself.
- `docs/DESIGN.md`'s "ticket N" citations were found to be **systematically one low** (§4.2's
  "ticket 5" is [#6](https://github.com/jnslmk/beamhouse/issues/6), §07's "ticket 4" is
  [#5](https://github.com/jnslmk/beamhouse/issues/5)). Both corrected.
