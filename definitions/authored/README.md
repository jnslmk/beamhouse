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

### Validation

- XML well-formed; every attribute, feature, model and geometry reference resolves; DMX offsets
  contiguous 1..14 with no duplicates.
- **Loaded through Mizer's own GDTF provider**, which resolved it to typed controls:
  `intensity → Beam_Dimmer`, `shutter → Beam_Shutter1`,
  `color_mixer → Rgb{Beam_ColorAdd_R/G/B}`, `pan → AxisGroup{Yoke_Pan}`, `tilt → AxisGroup{...}`.

### Known gaps

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

## The three tungsten loads

`Beamhouse@generic PAR38`, `Beamhouse@generic E27 practical`, `Beamhouse@generic profile` —
authored for [#48](https://github.com/jnslmk/beamhouse/issues/48) under
[ADR-0037](../../docs/adr/0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md).

A dimmer pack is not a fixture; its loads are. The reference rig's two packs are repatched
into six one-channel loads, and three definitions cover them — a PAR38 is an E27 lamp behind
a reflector, so the PARs and the practicals share a bulb, a colour temperature and a dimming
curve.

**These are `gdtf:`, not `bhs:`.** ADR-0037 decision 3 minted them as `bhs:`;
[ADR-0038](../../docs/adr/0038-bhs-binds-one-way-through-a-local-fixture.md) rule 5 corrects
the prefix, because `bhs:` declares pixels and geometry and never optics — it can say none of
`BeamType`, `BeamAngle`, `BeamRadius` or `ColorTemperature`, and all four are load-bearing
here. Same test ADR-0033 applied to the spoke: only GDTF has a geometry tree at all.

| definition | `BeamType` | angle | `BeamRadius` | CCT | `LampType` |
| --- | --- | --- | --- | --- | --- |
| `generic PAR38` | `Wash` | 60° flood | 0.060 | 2700 K | `Tungsten` |
| `generic E27 practical` | `Glow` | *omitted* | 0.030 | 2700 K | `Tungsten` |
| `generic profile` | `Spot` | `BeamAngle` == `FieldAngle`, 25° | *omitted* | 3200 K | `Halogen` |

`Glow` is [ADR-0022](../../docs/adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md)
rule 2's absence of the cone with the emissive body still on — a bare bulb in a shade. `Spot`
with `BeamAngle == FieldAngle` is the hard-edge degeneration `CONTEXT.md`'s **Cone angle** entry
describes; a profile is the fixture that rule was written for.

**Declared, not invented.** 2700 K and 3200 K are black-body temperatures and GDTF's
`EmitterSpectrum` documents its default as *a black body at the declared `ColorTemperature`*, so
the white point is read from the file rather than assumed. CRI 100 is tungsten physics.
`BeamRadius` 0.060 is half the published 121 mm PAR38 face; 0.030 is half a standard A60 bulb.

**Placeholders, labelled in the files themselves** (ADR-0037 decision 8):

- the halogen **3200 K** is the standard theatre figure, not a measurement;
- the profile's **25–50° zoom range** is a nominal spec, unverified against these two units;
- body dimensions on the practical and the profile are nominal furniture/fixture sizes.

**Two numbers are deliberately omitted rather than defaulted.** The practical declares no
`BeamAngle`/`FieldAngle` — a `Glow` draws no cone, so any value there would later read as
measured. The profile declares no `BeamRadius` — no lens dimension is known. Both fall to the
GDTF default, which is a visible choice rather than a hidden invention.

### The profilers' manual zoom lives here, for now

The two profilers are the same model hung at **different** angles, set by hand on the barrel:

| fixture | id | slot | hung at |
| --- | --- | --- | --- |
| Profiler 1 | 16 | 87 | **30°** |
| Profiler 2 | 17 | 88 | **42°** |

That is a hang setting, and it fits nowhere yet. It cannot go in the definition — both units
share it — and it cannot go in the placement, which
[ADR-0012](../../docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md) rule 1
pins to a rigid transform. ADR-0037 decision 7 gives it a **per-fixture override**, a sibling of
the placement override, and the definition carries the slot GDTF already has for it: a
**virtual channel**, `Offset=""` — an attribute that exists logically and consumes no DMX. So
`generic profile` declares `Zoom` over 25–50° with no offset, and the override supplies its
value, consulted by `resolve` like any other channel.

**No `.bhs` file exists anywhere on disk yet**, so this table is the migration record until the
schema does — the same holding pattern the STAR-TENT's serpentine spoke table sits in.

`gdtf-ts` has to implement virtual channels for this to resolve at all. Mizer's GDTF crate
discards them: `add_channel` bails with a `TODO` and the attribute is dropped
(`conversion.rs:64-67`). ADR-0004 makes `gdtf-ts` ours, so this is work rather than a blocker —
but there is no upstream code to crib.

### Validation

- XML well-formed; every attribute, feature, model and geometry reference resolves;
  `PrimitiveType`, `BeamType` and `LampType` all in the GDTF enums; DMX offsets contiguous
  `1..n` with no duplicates, with the profile's virtual `Zoom` correctly outside that count.
- Not yet loaded through Mizer's GDTF provider — the impression 90 was, and that check is
  still owed here.

### Known gaps

- `PhysicalDescriptions` is empty on all three — no emitter spectrum. Whether GDTF can declare a
  spectrum as a function of *level*, which ADR-0037 decision 5's tungsten dimming curve needs,
  is open in [#50](https://github.com/jnslmk/beamhouse/issues/50). Until it answers, the curve
  lives in the renderer (`DESIGN.md` §8.3) rather than in these files.
- `PowerConsumption` and `LuminousFlux` are omitted on all three. No wattage was measured, and
  no profile on this rig carries a trustworthy `LuminousFlux` anyway.
- The `Wash` PAR38 declares `BeamAngle == FieldAngle == 60`, so its edge falloff comes from
  `BeamType` alone. A real PAR38 flood has a measurable field/beam split; nobody measured it.

## Using it with Mizer

Copy the `.gdtf` files into a directory on Mizer's GDTF library path (settings key `gdtf`, defaulting
to `fixtures/gdtf` relative to Mizer). It then patches as a `gdtf:` id.
