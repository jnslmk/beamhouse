# ADR-0012: Beamhouse may define pixels, as a third definition source — placement still mints nothing

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#27](https://github.com/jnslmk/beamhouse/issues/27)

## Context

[#27](https://github.com/jnslmk/beamhouse/issues/27) came out of the competitive review: Capture
2026 ships a **generic LED Strip** drawn as a Bézier curve with a pixel pitch, the pixel count
falling out of length ÷ pitch, with no definition file anywhere in the flow. The ticket asked
whether **placement** may create renderable emitters, and offered three options — no minting,
path-only, or a full placement-side primitive.

**Four of the ticket's premises were false, and repairing them moved the answer.**

1. **"Parametric arrays already do this."** They do not. §4.5's `arrays` block takes
   `members: [12, 13, 14, 15]` — **existing fixture ids from the patch**. An array mints no
   fixture and no emitter; it computes a transform per already-patched fixture. Arrays are
   precedent for parametrically generating *placement of declared things*, one level up from
   what the ticket claimed.
2. **"§9.2 already mints geometry."** It does not, and §9.2 contradicted itself: it said proxy
   geometry is rendered "from `PrimitiveType` when no definition is available", but
   `PrimitiveType` *is* a field of the definition. The coherent reading — and the one
   [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md) rule 6 and the `MarkeEigenbau` profile
   (ships `description.xml`, zero meshes) both support — is **no *mesh* available**.
3. **The STAR-TENT, the ticket's motivating case, needs none of this.** Its requirement is that
   reversed spokes are "placed rotated 180° about their own mid-point so pixel 0 lands at the tip
   on the same ray" — a **rigid transform per fixture**, which §4.4 and §4.5 already carry.
4. **ADR-0005 rule 8 had already ruled on most of it:** "genuine per-emitter deviation (a bent
   tube, masked pixels) is a different feature and is out of scope for v1."

**And the ticket's option 2 does not exist as posed.** ADR-0005 rule 1 says positions supply
"ordering, axis and extent" only, which makes a path look like a drop-in substitution. But §8.1
renders the **declared primitive** — the real strip profile is a 25 × 50 × 1000 mm `Cube` —
carrying a `DataTexture` along its axis. A rigid cube cannot be mapped along a Bézier. So
"path only" silently requires Beamhouse to **generate swept geometry**, discarding the declared
primitive, which is precisely what ADR-0005 rule 6 forbids. Option 2 splits into a **polyline**
of rigid segments (compatible) and a **swept curve** (not).

**What actually justifies the feature is not Capture — it is gled2.**
[ADR-0002](0002-bridge-speaks-both-sacn-and-artnet.md)'s requirement is that "gled2 and Mizer
stream to the rig simultaneously", and §01 names gled2 as a per-pixel driver for the tubes. So
**universes carrying pixels that Mizer has never patched are a standing feature of this rig.**
Beamhouse listening on the wire sees them and, until now, had no way to describe them. That is a
rig-grounded case; the Capture framing was not.

Half the mechanism also already existed: §4.5's `.bhs` carries
`"classes": { "diy_t8_35px": { "kind": "strip", "pixels": 35 } }` — a Beamhouse-side pixel count,
keyed by definition id.

## Decision

1. **Placement mints nothing.** Every emitter traces to a definition; placement supplies a rigid
   transform and nothing else. The ticket's option 1 stands, and ADR-0005 is unamended.

2. **Beamhouse is a third definition source.** A `.bhs` may carry a `definitions` block, and its
   entries are addressed by the prefix **`bhs:`**, alongside `gdtf:`, `ofl:` and `qlc:` in
   `CONTEXT.md`'s **Library**. The minting moves into the *definition* layer, which is where this
   repo already does it (`definitions/authored/`, [#19](https://github.com/jnslmk/beamhouse/issues/19)).
   What is new is that a definition may live **inside the `.bhs`** rather than as a file on disk.
   Nothing downstream changes: ADR-0005 keys off "the definition" without caring who wrote it,
   §8.1 renders the declared primitive, and `gdtf-ts` is untouched — ADR-0004 made it GDTF-only
   regardless.

3. **Two bindings, one mechanism.**
   - **(a) Definition-only.** Attaches to a fixture the console already patched; id and address
     come from the patch, unchanged. This is the `classes` block generalised from
     `{kind, pixels}` to a full pixel declaration. `bhs:` never appears in the console's `fixture:`
     field — Mizer cannot write it — so the binding is keyed by the patch's own definition id, the
     way `classes` is today.
   - **(b) Local fixture.** Definition *and* universe/address, with no console entry at all. This
     is what a gled2-driven run needs. It makes Beamhouse a **limited patch source**, which
     qualifies §4.2's "patch comes from the console's project file".

4. **A local fixture's id is negative, and this is structural rather than conventional.**
   `FixtureConfig.id` is `u32` (`crates/projects/src/lib.rs:206`), so **Mizer cannot represent a
   negative id** and a collision is impossible by construction — the same move
   [ADR-0007](0007-one-universe-space-sacn-numbered.md) made for universe numbering.
   [ADR-0003](0003-fixture-id-is-the-only-identity.md) stays literally true: one integer space,
   one type, a sign bit partitioning it. **Caveat:** MVR's `FixtureID` carries no `u32`
   guarantee, so against an MVR patch this is a convention, not a proof.

5. **On disagreement, the definition is authoritative for rendering and the patch for
   addressing — and a mismatch is surfaced, never reconciled.** If a `bhs:` definition declares
   23 pixels (69 channels) against a patched fixture spanning 60, the strip is not silently
   truncated: it is an error in the UI. Silent truncation renders a strip that is wrong in a way
   that looks right. This hands [#31](https://github.com/jnslmk/beamhouse/issues/31) a second
   concrete requirement alongside staleness. Under binding (b) the question dissolves — there is
   no patch to disagree with.

6. **ADR-0005 rule 8 stands unamended.** Rule 8 rejected **deviating from a definition that
   exists**; this **supplies a definition where none does**. Rule 8's grounds — such a file "is
   wrong for every consumer, not just this show" — have no purchase when there is no file. The
   `definitions` block is therefore explicitly **not** an escape hatch for a wrong third-party
   profile: those are still corrected in `gdtf-ts`'s quirks table.

7. **A placement rotation pivots about the definition's own origin.** The tent's spoke reversal
   is stored as rotation **plus** translation. Rotating about a resolved bounding-box centre is
   the seductive wrong answer: that centre moves when a mover's head tilts, so the pivot would
   drift per frame. An explicit per-fixture pivot in `.bhs` invents schema for one rig's cabling.
   Keeping placement a plain rigid transform composes it the same way as GDTF's own `<Position>`
   matrices, whose convention [#20](https://github.com/jnslmk/beamhouse/issues/20) settled.

8. **Swept-curve paths are out of scope, not deferred.** They reverse ADR-0005 rule 6, and no
   fixture in the rig is curved. The **polyline** form stays available without being built:
   ADR-0005 rule 1 already made the strip's line a *derived* quantity, so whatever later supplies
   ordering, axis and extent is a local substitution. It belongs in §01's "do not architect them
   out", which is exactly where a seam that already exists should sit.

9. **§9.2's proxy geometry means "no mesh available", not "no definition".** Wording corrected.
   The stronger reading was unreachable anyway: a `.bhs` carries `patch` and `gdtfDir` as **local
   paths**, so a share recipient can resolve neither. A resolved-digest share format is a separate
   decision belonging to §09.

## Consequences

- A `bhs:` definition carries **no local path**, unlike `gdtf:`/`ofl:`, so it is the only fixture
  kind that survives §9.1's URL fragment and the Pages deployment intact. The feature closes part
  of the sharing gap that rule 9 above just named.
- **A binding-(b) fixture has no conformance oracle.**
  [#26](https://github.com/jnslmk/beamhouse/issues/26) pins the strip path to 230 real pixels via
  the *patch's* index space, so it still covers binding (a) fully — a gled2-driven local fixture
  is validated by eye alone. Accepted risk, and the honest cost of the feature.
- §4.2's "patch comes from the console's project file" and `CONTEXT.md`'s **Patch** ("authored in
  the console; Beamhouse only reads it") both need qualifying. This lands next to
  [#33](https://github.com/jnslmk/beamhouse/issues/33), which is reopening the same seam from the
  console-widening side — #33 should not re-decide the identity scheme rule 4 fixes.
- The `.bhs` schema gains a `definitions` block and negative fixture ids, and `classes` is
  subsumed by it. That schema is still unspecified on the map; this constrains it rather than
  writing it.
