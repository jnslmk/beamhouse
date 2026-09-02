# Authored definitions

Fixture definitions written for this project, as opposed to fetched from GDTF Share.

Unlike `../gdtf/`, these are **ours** — no third-party redistribution constraint applies, so
they are committed directly rather than referenced through `../gdtf-manifest.json`.

## `GLP@impression 90 RGB`

No GDTF definition for the GLP impression 90 RGB exists anywhere — confirmed against the full
12,623-revision GDTF Share catalogue (issue #2). GLP publishes 18 `impression` models; the 90,
discontinued, is not among them. It is 6 of the 13 fixtures in the reference rig and the only
true moving head, so without it nothing exercises the volumetric-beam class or the pan/tilt axis
hierarchy.

**Geometry is measured, not estimated.** It comes from GLP's own dimensioned CAD drawing, opened
in issue #16 and documented in `docs/research/impression-90-pivots.md`:

| Quantity | Value | Source |
| --- | --- | --- |
| Floor → tilt axis | 277.0 mm | measured, cross-validated two ways to 0.1% |
| Floor → pan axis (base/yoke split) | 66 mm | interpreted from seam geometry |
| Tilt axis → LED face (beam origin) | 80.5 mm | measured |
| Lens/head diameter | 231.72 mm | explicit ⌀ dimension |
| Head depth along beam axis | 144.24 mm | explicit dimension |
| Base width | 140.00 mm | explicit dimension |

The tree is self-consistent: yoke pivot at `Z=0.066` plus head pivot at `Z=0.211` gives the
measured 0.277 m tilt-axis height.

**Channel layout** is translated from `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf` — the
14-channel `Normal` mode, matching the 14-channel spacing in `mizer-shows/OBF26_Bunte-Stube.yml`.
Pan 660° and tilt 300° are confirmed both by that file and by the DWG's own annotations.

**Primitives, not meshes.** Every `<Model File="">` is empty with a `PrimitiveType`. This matches
what real profiles actually ship: GLP's own impression X4 and ADJ's Fog Fury Jett both contain
only `thumbnail.png` and `description.xml`, with no geometry. MIT-licensed `.3ds` meshes exist in
`heliostate/OpenGDTFLibrary` (issue #17) if a polish pass ever wants them.

## Validation

- XML well-formed; every attribute, feature, model and geometry reference resolves; DMX offsets
  contiguous 1..14 with no duplicates.
- **Loaded through Mizer's own GDTF provider**, which resolved it to typed controls:
  `intensity → Beam_Dimmer`, `shutter → Beam_Shutter1`,
  `color_mixer → Rgb{Beam_ColorAdd_R/G/B}`, `pan → AxisGroup{Yoke_Pan}`, `tilt → AxisGroup{...}`.

## Known gaps

- `PhysicalDescriptions` is empty — no emitter spectrum or colour-space data.
- The yoke arm's own lateral thickness (140 mm) is assumed equal to the base width; the drawing
  carries no explicit dimension for it.
- The beam disc thickness (20 mm) is a thin-disc convention borrowed from the X4 profile.
- Only the `Normal` mode is implemented. The `.qxf` also defines `Compress` and
  `High Resolution (Extended)`.
- `modeMaster` is not used; the Normal mode needs no channel-dependent behaviour.

### Sub-range divergences from the `.qxf` (from [#6](https://github.com/jnslmk/beamhouse/issues/6))

Every channel sits at the right offset; these are *within-channel* range differences.
[ADR-0010](../../docs/adr/0010-resolution-is-total-the-renderer-selects-by-attribute.md) splits
them by whether v1 actually consumes the attribute:

- **`Shutter1` breakpoints — v1-visible, fix first.** Authored as Closed 0–31 / Strobe 32–223 /
  Open 224–255; the `.qxf` has Closed 0–15 / pulse-random 16–143 / strobe 144–239 / Open 240–255.
  So **16–31 resolves Closed while the fixture is pulsing, and 224–239 resolves Open while it is
  strobing**. `Shutter1` is one of v1's eight consumed attributes and drives the render gate, so
  both errors are visible on screen.
- **`Shutter1Strobe` Hz range** is wider than the fixture's — **not v1-visible**, the attribute
  resolves but has no consumer.
- **`CTC`** authored as 2700–8000 K across 0–255; the `.qxf` has a 0–6 dead zone and 7–255 =
  3200–7200 K, so there is no dead zone here and both endpoints overshoot — **not v1-visible**,
  same reason.
- **Channels 5, 12, 13, 14** carry one generic `0…1` `ChannelFunction` each where the `.qxf`
  enumerates capability tables (128 movement macros, 6 maintenance ranges). **Not v1-visible.**

Fixing these is a **definition** change, not a resolver change — no resolution fidelity closes
them, per ADR-0010 and the precedent in
[ADR-0005](../../docs/adr/0005-emitter-grouping-is-by-dmx-stride.md).

## Using it with Mizer

Copy the `.gdtf` into a directory on Mizer's GDTF library path (settings key `gdtf`, defaulting
to `fixtures/gdtf` relative to Mizer). It then patches as a `gdtf:` id.
