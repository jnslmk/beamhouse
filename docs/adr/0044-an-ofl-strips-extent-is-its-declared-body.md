# ADR-0044: An OFL strip's extent is its declared body; the count tiles it

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#54](https://github.com/jnslmk/beamhouse/issues/54)
- **Amends:** [ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 5 and rule 7
- **Confirms:** [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md), [ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md),
  [ADR-0031](0031-a-share-link-carries-resolved-definitions.md), [ADR-0034](0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md),
  [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md)

## Context

[ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 7 corrected ADR-0005 rule 1's OFL clause —
*"OFL states the layout outright for 17 of its 115 matrix fixtures"* — and stopped there, leaving the
other 85% with **"the stride half of rule 1, with extent left undeclared."** This ticket fills that
gap. Measured against the live 629-fixture corpus (2026-09-02): 115 matrix fixtures, **98 (85%)
declare no `physical.matrixPixels` at all**. Of those 98, **95 declare `physical.dimensions`**;
three declare neither (Ribalta Beam, the 4-Channel Dimmer Pack — ADR-0037's own file — and the
8 × 3W LED Spider Effect); roughly half are 1D `[N,1,1]`, half 2D panels (`Y > 1`); one has
Z-depth 2.

The 17 that *do* declare `matrixPixels` show what the format's authors mean by it: **pixel
dimension ≈ the cell, spacing 0 in 14 of 17** — a continuous band, the idiom our own spoke record
named — two with real gaps (Litebar H9: 50 mm cells/61 mm spacing; MagicBlade FX: 64 mm/2.8 mm),
and the `physical.dimensions` box is **always larger than the pixel span** (housing): Color Force II
72 declares 24 × 72.7 = 1744.8 mm on a 1759 mm box; POLAR3000's 372 mm span sits in a 455 mm box. So
tiling the full box overstates the cell by 0–22% — which is exactly why the box must not be *read as
pitch*, only as the extent the pixels tile.

Where v1's strip render is concerned the question has a structural answer. §8.1 renders a strip as a
**continuous emissive surface** — N texels of one `DataTexture` sampled along the textured geometry's
axis — and ADR-0022's COB note makes the pixels **zones of the band**, never discrete lamps. The
strip class never places lamps, so it never needs a per-pixel pitch to place; and
[ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 5 already gives an OFL emissive body from
`physical.dimensions`. The body is declared, the count is declared, and the texture tiles one across
the other. The spoke record's 1500/23-vs-1500/22 ends ambiguity is an artifact of discrete-lamp
thinking the class does not have.

OFL's own tooling agrees with the minimal reading: its website pixel diagram falls back to **square
unit cells** when `matrixPixels` is absent — count and structure drawn, no physical claim invented.

## Decision

1. **An OFL matrix fixture's extent is its `physical.dimensions` emissive body, and the pixel count
   tiles it.** Where [ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 5's per-pixel branch
   (`matrixPixels.dimensions`) is absent, its whole-body branch is the layout: N or M × N texels tile
   the body along the axis rule 2 gives, and the cell (body ÷ count) is **UV math, not a minted
   pitch**. No ends-inclusive choice exists — there are no lamp positions to place. Nothing is
   inferred: the body and the count are both declared. This is what rule 7's "extent left undeclared"
   is filled by.
2. **The pixel X axis is `dimensions[0]`; the pixel Y axis is `dimensions[1]`.** The mapping OFL's
   own UI diagram uses (pixel width ∝ `dimensions[0]`, rows stacked along `dimensions[1]`). No
   longest-axis heuristic — the definition's own X/Y, declared. A Z-depth > 1 fixture (one in the
   corpus) is unexercised, not ruled out.
3. **A matrix fixture with no `physical.dimensions` at all is ADR-0034's marker**, by
   [ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 5's residue clause unchanged — a
   body-less matrix has no body to size. Three of the 98 land here, including the 4-Channel Dimmer
   Pack, which closes [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md)'s original
   four-texel-strip misfire by the stack rather than by a new rule.
4. **Dimensioned ganged packs are accepted residue.** DIM-4LC, EDX-4 and DMX-4 declare a box *and*
   `Master`/`1/2`/`3/4`-style `pixelGroups`, so under rule 1 they render as short lit bodies —
   ADR-0037's misfire in miniature. No heuristic catches them: `categories` cannot select
   ([ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 3) and group names are free text. The
   rule mints no pitch, so it adds nothing to ganged groups; ADR-0037's console-side remedy (the
   pack *is* its loads) stands. Recorded, not fixed.
5. **`matrixPixels.spacing` is parsed and never rendered in v1.** The single-texture surface cannot
   show gaps without inventing texture content, and two corpus fixtures declare a real gap. Parsed,
   never consulted — the posture [ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md)
   rule 5 gives `ColorSpace` — and the value stays in the model if a gap-aware path ever wants it.

## Consequences

- [ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) rule 5's *"or per pixel from
  `matrixPixels.dimensions`"* is one of two branches, now told apart: the per-pixel branch for the
  17, the whole-body-tiled branch for the other 98.
- §8.1's textured-geometry rule is GDTF's; an OFL strip textures its ADR-0043 rule 5 body
  (`physical.dimensions`) with N or M × N texels. `CONTEXT.md`'s **Strip class** gains the OFL extent
  reading.
- The share link's *"emitter count and pitch"* ([ADR-0031](0031-a-share-link-carries-resolved-definitions.md)):
  for an OFL matrix without `matrixPixels`, pitch is **derived** (body ÷ count), informational, never
  an input.
- Nothing on the reference rig exercises this — ADR-0033 and ADR-0037 leave it zero OFL fixtures —
  so it is decided deliberately for the library [ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md)
  keeps in scope. It will not be found by running the rig.
