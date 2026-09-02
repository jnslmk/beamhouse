# ADR-0005: Emitter grouping is by DMX stride, and the strip path generalises to matrices

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** [#8](https://github.com/jnslmk/beamhouse/issues/8)
- **Amended by:** [ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md) (2026-09-02, rule 1's OFL clause holds for 17 of 115 matrix fixtures)

## Context

Issue #8 proposed the rule *"group emitter nodes that share a parent geometry and are evenly
spaced along one axis"*, on the stated grounds that the real `MarkeEigenbau` WS2812 profile has
"even 32 mm spacing" so that "nothing is inferred; the geometry is stated".

**The geometry is stated, but it is not even.** Measured across the 30 `GeometryReference` nodes
of `MarkeEigenbau_RGB_LED_Pixel_Strip_30px_1m`:

| spatial delta | count |
| --- | --- |
| 32 mm | 13 |
| 33 mm | 13 |
| 34 mm | 1 |
| 35 mm | 1 |
| **56 mm** | 1 |

The final gap is **+69.7 % off the median**. Any "evenly spaced" test fails on the only real strip
artifact in the repository unless its tolerance is widened to ~70 %, at which point it tests
nothing.

**The addressing, by contrast, is exact.** The DMX offset stride is `3`, thirty times running,
offsets 1 → 88. The positions were placed by hand; the addressing was generated. That inverts the
ticket's assumption about which signal is trustworthy.

Two further collisions surfaced while resolving this. `DESIGN.md` §8.1 specifies "a single
cylinder or quad" for a strip, while the real profile declares `PrimitiveType="Cube"`,
25 × 50 × 1000 mm. And OFL — which #6 chose for the STAR-TENT tube — has **no mesh mechanism at
all**, so it cannot carry a CAD-derived model.

## Decision

1. **Group on DMX offset stride, never on spatial evenness.** A pixel run is *sibling
   `GeometryReference` nodes under one parent, targeting the same geometry, with a constant DMX
   offset stride*. A break in the stride splits the run. Positions are used for **ordering, axis
   and extent** — not as the grouping test. OFL requires no inference at all: `pixelKeys` /
   `pixelCount` plus `physical.matrixPixels.spacing` state the layout outright.
2. **A loose collinearity check exists to reject, not to confirm.** It distinguishes a line from a
   plane; it never decides whether a line is a strip.
3. **A strip never crosses a fixture boundary.** Grouping happens strictly within one fixture.
   ADR-0003 makes fixture id the only identity and the placement-override layer is keyed by it, so
   a run spanning fixtures could be neither addressed nor overridden. Ten physical profiles patched
   as ten fixtures render as ten adjacent strips, which is correct rather than a compromise. This
   decouples emitter grouping from [#22](https://github.com/jnslmk/beamhouse/issues/22): the render
   unit follows the patch unit rather than fighting it.
4. **Grouping is computed at load time**, on definition load and on re-import or patch change —
   both of which are load events. Nothing per-frame.
5. **2D matrices are supported, by generalising the strip path rather than adding a class.** The
   same mechanism carries an `N` or `M × N` `DataTexture`: one shader, one draw call per fixture,
   bilinear interpolation across both axes. Rendering a panel as M separate 1D strips would cost M
   draw calls and lose interpolation between rows. **Strip** (1D) and **matrix** (2D) remain
   distinct terms in `CONTEXT.md` because they are distinct to a human describing a rig, while
   being one path to the renderer. The map's "possible third rendering class" fog resolves here.
6. **Render the geometry the definition declares, and support real meshes.** §8.1's "cylinder or
   quad" is replaced by *the declared primitive* — overriding a declared `Cube` with a cylinder is
   the renderer claiming to know better than the definition. Where a real mesh exists it is used
   instead; the `DataTexture` maps along the run's axis either way.
7. **A CAD-derived mesh reaches the renderer as an authored GDTF, not a Beamhouse-side attachment
   layer.** GDTF carries `models/gltf/*.glb` natively and ADR-0004 already returns those buffers.
   #6 chose OFL for the tube on licensing grounds — a GDTF *derived from* the pinned GDTF Share
   profile would be a derivative of non-redistributable content — but **that objection does not
   apply to a definition authored from our own CAD**, which is ours outright. The tube therefore
   moves to `definitions/authored/` as a GDTF carrying its build123d-derived GLB. Folded into
   [#23](https://github.com/jnslmk/beamhouse/issues/23).
8. **No `emitters` override block in `.bhs`.** It was never defined in `DESIGN.md`, so this
   declines to invent it. A definition that misstates its own geometry is a *defect*, and it is
   corrected where the defect lives: in our own definitions, or in `gdtf-ts`'s quirks table
   (ADR-0004) for third-party files — which is strictly better placed, because such a file is
   wrong for every consumer, not just this show. Per-*fixture* deviation is already covered by the
   placement-override layer. Genuine per-*emitter* deviation (a bent tube, masked pixels) is a
   different feature and is out of scope for v1.

## Consequences

- The grouping rule is exact on real data rather than tolerant of it, and the one place tolerance
  remains — collinearity — can only cause a fixture to render as individual emitters, never as a
  confidently wrong line.
- #22 is de-risked before it is even taken: whatever it decides the patch unit to be, grouping
  follows it.
- #23 grows: it becomes "author a GDTF carrying the CAD mesh" rather than "re-author the OFL
  JSON". The build123d model of the tube **does not exist yet** — no such model is on disk — so
  that work is real and is gated on #21's confirmed pixel count and pitch.

  **[corrected 2026-09-02 — #36]** The blocker is false and has been since 7 August:
  `~/git-projects/build123d/build123d-models` carries `models/led_profiles`, whose default
  `LENGTH = 1500.0` is "a full 1.5 m stick", exported as `exports/led_profiles.glb`, `.step` and
  per-part STLs. Rule 7's *conclusion* stands unchanged — the mesh reaches the renderer as an
  authored GDTF, not a Beamhouse-side attachment layer — and
  [ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md) rules 8 and 9 say
  which parts of it ship and at what fidelity.
- `DESIGN.md` §8.1 needs amending: "cylinder or quad" is now "the declared primitive, or a real
  mesh where one exists".
