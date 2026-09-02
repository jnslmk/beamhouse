# ADR-0025: Trust and provenance are additive screen-space marks, never subtractive shading

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#35](https://github.com/jnslmk/beamhouse/issues/35)

## Context

Three things must be visible on a fixture in the viewport and none had a design:

1. **Staleness.** [ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md) and §13.3 are
   emphatic about the constraint and silent on the execution — it must read as *"do not believe
   this"*, never as *"this fixture is off"*.
2. **The override layer.** §4.5 calls it *"this design's most load-bearing idea"*, and #35's own
   finding is that it is **invisible**.
3. **Patch faults** — overlap, unpatched, a definition the library does not have.

## Decision

**Every trust and provenance mark is additive and drawn in screen space: a badge or glyph pinned
to the fixture, never a change to how the fixture itself is shaded.**

§13.3 supplies the proof, not merely a preference: *"a fixture at zero and a fixture whose data
stopped look identical at full brightness zero."* Every **subtractive** cue — dimming, greying,
desaturating — modulates something the fixture is already rendering, and a fixture at zero renders
nothing to modulate. The cue would therefore vanish in exactly the case that matters. A badge is
additive by construction and survives it.

**A stale fixture keeps rendering its frozen values at full strength.** The badge is the only thing
that says so.

## Consequences

- **Marks compose.** A fixture can be stale *and* overridden *and* in a patch overlap; screen-space
  pins stack where geometry shading cannot.
- **One badge per fixture, never per break.** [ADR-0011](0011-a-fixture-is-addressed-per-break.md)
  and §13.3: the STAR-TENT spanning universes 2 and 3 gets one.
- In the table the same marks are **in-cell glyphs, never modals** — Capture's interlocking-circle
  overlap glyph adopted directly.
- **The override carries the patch's own value and the way back**: the numeric panel shows what the
  patch said and offers a revert, which is what makes the override layer legible rather than merely
  marked.
- **Everything an ingest could not reconcile shares one Issues surface** — this ADR's patch faults,
  [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)'s extent mismatch,
  [ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md)'s synthesised fixture ids, and
  orphaned overrides. Those three ADRs each require something to be *surfaced* and none of them
  said where.
- **A missing definition is not proxy geometry.** §9.2, as corrected by #27, is explicit: a
  `PrimitiveType` is a field *of* the definition, so a fixture whose definition is absent has no
  primitive, no beam angle and no emitter count. It draws as a placeholder at its patched position
  and nothing more — distinct from a definition that ships no *mesh*, which does render as proxy
  geometry.
