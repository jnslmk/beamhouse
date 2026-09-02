# ADR-0034: An unresolved definition is a marked fixture, not a missing one

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#42](https://github.com/jnslmk/beamhouse/issues/42)
- **Amends:** [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)

## Context

[ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md) rule 9 corrected §9.2's
proxy-geometry rung to mean **"no mesh available"**, not "no definition available", because
`PrimitiveType` *is* a field of the definition. The correction was right and it left a hole nobody
noticed: **the ladder had no rung for a definition that is missing entirely.** A patch naming a
definition id that does not resolve rendered nothing at all — not proxy geometry, because there was
no `PrimitiveType` to read, no beam angle and no emitter count.

[ADR-0031](0031-a-share-link-carries-resolved-definitions.md) retired the ladder for share links by
making the snapshot carry its definitions inline, so a *recipient* can no longer hit this. **The
live app still can, and does.** The reference rig patches `ofl:generic:4-channel-dimmer-pack` for
fixtures 7 and 8, and no such definition is on disk — two of thirteen fixtures, in the rig this
project is built around, resolve to nothing today.

**[the live instance expired 2026-09-02 — [#48](https://github.com/jnslmk/beamhouse/issues/48)]**
Fixtures 7 and 8 are retired. [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md)
ruled that a dimmer pack is not a fixture, and #48 repatched the six loads onto three authored
GDTF definitions that resolve. **This decision is unaffected — it lost its example, not its
argument**, and the case is not hypothetical in general: any rig naming a definition the machine
does not have hits it. The reference rig now exercises it nowhere, which means nothing here is
covered by the rig we test against.

The failure mode is the one §5.1 already named from the other direction: *"a rig where half the
fixtures are invisible is a confusing first bug."* §5.1 generates primitives to avoid it. Nothing
was doing the equivalent one level up.

## Decision

1. **A fixture whose definition does not resolve stays in the patch, stays placed, and renders a
   marker.** It is never dropped and never silently absent. This is
   [ADR-0030](0030-gdtfspec-resolves-inside-the-archive.md) rule 5's posture taken one level up:
   there, a fixture whose *mode* does not resolve "stays in the patch, placed and rendered, marked,
   with no DMX binding", because demoting it "would discard its address, which is the one thing the
   operator can cross-check against their console". A missing definition discards exactly the same
   thing.

2. **The marker is fixed-size, and no dimensions are invented.** The patch carries id, universe,
   address and channel count; **dimensions are a property of the definition that is missing**, so
   there is nothing to size from. A fixed marker at the fixture's position is the honest rendering.

3. **The `snapshot` variant is not extended with a dimensions hint to avoid this.** That would put
   definition data in the patch, which is the layer split §04's own table is built on, and it would
   be the defaulted-somewhere/overridden-elsewhere class ADR-0013 deliberately kept the scene
   density out of. ADR-0031 already resolves definitions into the snapshot properly; a hint would
   be a second, worse copy of that.

4. **Channel count does not imply a shape.** A 69-channel fixture is probably a strip and a
   7-channel one probably is not, but a guessed shape that looks plausible is "wrong in a way that
   looks right" — the failure ADR-0012 rule 5 rejects truncation for. A marker that is obviously a
   marker is the point.

5. **It surfaces as an ADR-0025 provenance mark**, additive and screen-space, alongside the
   `GDTFSpec` fallbacks (ADR-0030 rule 3) and the unresolved-mode case (rule 5). It is **not** a
   new §9.2 rung: that ladder is retired (ADR-0031) and this is a live-app resolution failure, not
   a share degradation. Naming it a rung would resurrect a structure ADR-0031 just removed.

## Consequences

- **Two of the reference rig's thirteen fixtures render as markers today**, which makes the gap
  visible instead of leaving them silently absent. Closing it properly — vendoring the OFL
  definitions the rig actually names, and the fetch tooling to pin them — is filed separately.
- **§9.2 gains nothing.** The whole of this lives in §05 with the rest of resolution, which is where
  ADR-0031 moved proxy geometry to as well.
- **ADR-0012 rule 9 is completed rather than corrected.** It said what proxy geometry means; this
  says what happens below it.
