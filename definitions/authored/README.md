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

## Using it with Mizer

Copy the `.gdtf` into a directory on Mizer's GDTF library path (settings key `gdtf`, defaulting
to `fixtures/gdtf` relative to Mizer). It then patches as a `gdtf:` id.
