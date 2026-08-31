# GLP impression 90 RGB: pan/tilt pivot locations, measured from GLP's own CAD

Research for [issue #16](https://github.com/jnslmk/beamhouse/issues/16), following on from
[`docs/research/glp-impression-90-profile.md`](./glp-impression-90-profile.md) (issue #15's
research), which established that GDTF's `Axis` geometry has no dedicated pivot field — the
pivot is the node's local origin after its `Position` matrix is applied — and that the one
number blocking a correctly articulated impression 90 profile is *where* those origins sit.
That research flagged GLP's two DWG CAD files as the one lead that could turn an estimate into
a measurement, but could not open them (no DWG-capable tool in that environment) and could not
resolve the *Dimensions* PDF's URL.

**Headline result: the DWGs opened, one of them fully, and it is a proper dimensioned
engineering drawing of exactly this fixture.** The pivot numbers below are **measured**, not
estimated — cited to specific `DIMENSION` entities and geometry in GLP's own CAD file, with one
short, clearly-flagged interpretive step (splitting a single measured dimension at a
independently-confirmed axis location). The impression X4's pivot ratios (issue #16's original
fallback plan) turned out not to be needed as the primary source; they're used only as a
secondary sanity check in §5.

## 1 · Sources

Fetched from GLP's discontinued-product page,
`https://www.germanlightproducts.com/product/impression-90/` (fetched 2026-09-01):

- CAD, 2000 revision (AutoCAD 2000 / `AC1015` format):
  `https://www.germanlightproducts.com/wp-content/uploads/2013/01/impression-90_2000-DWG-File.zip`
  — **this is the file used below.**
- CAD, 2004 revision (AutoCAD 2004 / `AC1018` format):
  `https://www.germanlightproducts.com/wp-content/uploads/2013/01/impression-90_2004-DWG-File.zip`
  — opened but only partially parsed (see §2); not needed once the 2000 file was confirmed
  complete.
- The *impression 90 Dimensions* PDF remains unresolved. The page's own markup links it to
  `http://www.glp.de/index.php?id=downloads&L=1&eID=dam_frontend_push&docID=2678` — GLP's old
  `glp.de` domain, which 404s — and the *same* dead link is reused (copy-paste) for the "2000
  CAD File" list item next to it, so this was never a live link on any page snapshot back to
  the earliest Wayback capture (2019-07-17). Not pursued further: the DWG supersedes it.
- Per the licensing precedent in `definitions/gdtf-manifest.json` (profiles pinned by
  reference, not vendored), **no DWG or PDF binary is committed to this repo.** The URLs above
  are the record; re-fetch to reproduce.

While fetching the live product page, its raw HTML also resolved an open discrepancy flagged in
the prior research (§2 of `glp-impression-90-profile.md`): the 2013 brochure's
"145 × 340 × 370 mm" figure is explicitly labelled on GLP's own page as **"Length x width x
height (head vertical): 5.7 in. x 13.4 in. x 14.6 in."** — a different axis order and a
specific head orientation, not a transcription error against the `.qxf`'s 341×375×338. Width
(340≈341) and height (370≈375) line up once that's understood; only "length" (145mm, the
footprint depth) has no counterpart in the `.qxf` triple, which is expected since the `.qxf`
only records one W×H×D triple. Side note, not otherwise pursued here.

## 2 · Opening the DWGs without a system install

Per the ticket's constraints: FreeCAD is installed but has no DWG import path (`Import.insert()`
on either file returns `no supported file format` — it needs the ODA File Converter, which is
not installed and was not added). `dwg2dxf`, an ODA converter, `librecad`, and Python `ezdxf`
(DXF-only; its `odafc` add-on also shells out to the same missing ODA binary) were all
confirmed absent, consistent with the ticket brief.

**What worked**: `@mlightcad/libredwg-web` — LibreDWG (GPLv3) compiled to WebAssembly and
published on npm, with a documented plain-Node.js usage path. Installed with a local
`npm install` into a scratchpad project directory (no system package, no `pacman`, no `sudo`):

```
/tmp/…/scratchpad/dwgjs/  (npm project)
  node_modules/@mlightcad/libredwg-web   — WASM binary + JS glue, ~0.7.10
  read.mjs                               — libredwg.dwg_read_data() → convert() → JSON dump
```

Result, per file:

- **`impression-90_2000-DWG-File.dwg`** (`AC1015` = AutoCAD 2000 format): **read cleanly**,
  zero error code. 29,299 entities recovered — 17,776 `SPLINE`, 7,570 `LINE`, 2,009 `ARC`,
  1,180 `LWPOLYLINE`, 679 `CIRCLE`, 26 `DIMENSION`, 35 `MTEXT`, 24 `TEXT`. This is the file used
  for every measurement below.
- **`impression-90_2004-DWG-File.dwg`** (`AC1018` = AutoCAD 2004 format): opened with **error
  code 68** (LibreDWG's newer-format R18 support is less complete) and returned only 9
  entities/8 objects — effectively just the table section, no drawing geometry. Not usable, and
  not needed since the 2000 file was already complete.

The parsed JSON was rendered back to PNG with matplotlib (`LINE`/`ARC`/`CIRCLE`/`LWPOLYLINE`
geometry, `DIMENSION` witness lines and values, `TEXT`/`MTEXT` labels) so the drawing could be
read visually, the same way a person would read a printed sheet — see `plot.py` in the
scratchpad for the renderer (not committed; regenerate from the JSON dump if needed).

**Positive identification.** The drawing's title block reads `DESCRIPTION: IMPRESSION -
DIMENSIONS`, `FILENAME: IMPRESSION.DWG`, `GERMAN LIGHT PRODUCTS GMBH, IM STÖCKMÄDLE 13, 76307
KARLSBAD`, dated `22.06.07`, 2 sheets. Two `MTEXT` labels read verbatim **"Pan movement range:
660°"** and **"Tilt movement range: 300°"**, and one `DIMENSION`'s override text is the literal
string `"300%%d"` (AutoCAD's degree-symbol escape) — an exact match to
`~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`'s `<Focus PanMax="660" TiltMax="300"/>`. Two
more dimensions on an unrotated front view read 338.2mm and 367.9mm, within a few mm of the
`.qxf`'s Width=341/Height=375 (see §1's brochure-axis-order note for why these aren't expected
to match to the millimetre). All units are explicit: `"ALL DIMENSIONS ARE IN MILLIMETERS
UNLESS NOTED OTHERWISE."`

## 3 · Measured geometry

Sheet 1 of `IMPRESSION.DWG` includes a side elevation of the fixture mounted on its tripod
stand with the head rotated 90° from rest (lens pointing sideways rather than down) — this is
the view that puts the tilt axis, the yoke column, and the base all in the same picture, with
the tilt axis foreshortened to a point instead of a line. All coordinates below are the
drawing's own model-space mm, before any renaming to a fixture-local frame in §4.

### 3.1 Floor reference

Two tripod-foot line segments sit at **y = 3809.13 mm** (handles `C0B7`, `C0B8`), symmetric
about x = 1515.6 (see 3.2). This is also the bottom witness point of the drawing's own overall
height dimension (`CCD2`, see 3.3) — GLP's own draftsman used the same point, which is the
strongest indication this is the intended "zero." All heights below are measured from this
plane.

### 3.2 Pan axis (lateral position) and base/yoke split

Two mounting-boss arcs of equal radius (21.04mm, handles `C440` and `C4A1`) sit at x = 1510.6
and x = 1520.6 — symmetric about **x = 1515.6 mm**, which recurs as the center of every
concentric circular feature on the base and (see 3.4) the head. This is the fixture's vertical
centerline, i.e. the pan axis, in this view.

A pair of seam lines spanning nearly the full base width (`C104`/`C105`, x = 1445.6–1585.6) sit
at y = 3872.4–3875.4mm, with several small fillet arcs at y = 3878.1 right beside them (handles
`C45D`, `C4BA`/`C4BB`, and line `C122`) — this cluster of five independent features, all within
6mm of each other, is the visible mechanical seam between the static base shell and the
rotating turntable/yoke assembly. Taking its midpoint, **y ≈ 3875.5mm**, gives:

> **base height (floor to pan-axis reference / yoke split) = 3875.5 − 3809.13 ≈ 66 mm**

This is a measured position (read directly off drawing geometry) but not an explicitly labelled
dimension value, so it carries slightly lower confidence than the numbers in 3.3–3.4, which are
GLP's own dimension callouts.

### 3.3 Tilt axis height — measured twice, independently

**First measurement.** A cluster of concentric arcs describing the head's lens/heatsink rings
(radii 9, 19, 19.2, 19.5, 25.5, 26mm — handles `C4DA`…`C502` etc.) are *all* centered at the
identical point **(1515.6, 4086.13)**. Since x = 1515.6 is already established as the pan axis
(3.2), and the head in this view is rotated 90° so the tilt axis is foreshortened to a point,
this is the tilt axis: **y = 4086.13mm**, i.e. **4086.13 − 3809.13 = 277.00mm above the floor.**

**Second, independent measurement.** `DIMENSION CCD2` (override-free, measured value
393.201mm) runs from the floor witness point `(1655.24, 3809.13)` to the top-of-unit witness
point `(1541.90, 4202.33)` — the overall height of the unit in this rotated pose. Since the
head is a body of revolution around the tilt axis, its extreme point above the axis, when
rotated 90°, is one lens radius away. `DIMENSION CCCB` gives the lens diameter directly — its
override text is `{\Ftxt.shx|c0;%%c}<>` (AutoCAD's ⌀ symbol prefix on the real measurement),
value **231.72mm**, i.e. radius 115.86mm. Predicted top-of-unit height on that basis:

```
277.00 (tilt axis, first measurement) + 115.86 (lens radius) = 392.86mm
```

against the drawing's own directly-dimensioned **393.20mm** — a 0.34mm (0.1%) discrepancy,
which is rounding. The two independent routes to the tilt axis height agree to within a third
of a millimetre.

> **tilt axis height above floor = 277.0 mm** (measured, cross-validated two ways)
> **lens/head face diameter = 231.72 mm** (measured, explicit ⌀ dimension, handle `CCCB`)

### 3.4 Beam origin — tilt axis to LED face

`DIMENSION CCCC` (value 144.241mm, handle `CCCC`) is a horizontal-only linear dimension (its
witness points differ in both x and y, but the recorded measurement equals only their x
difference — a common drafting shortcut for picking two points that aren't at the same height).
Its witness points are `sp1 = (1435.06, 4086.13)` — note the y-coordinate is *exactly* the tilt
axis height from 3.3 — and `sp2 = (1579.30, 4198.50)`, near the head's back-top corner. A close
crop of this area (front lens/heatsink silhouette at x ≈ 1445–1450, back vent panel at
x ≈ 1550–1580) confirms `sp1` sits right at the lens's front face and `sp2` at the back of the
head housing. So 144.24mm is the head's total depth along the beam axis, split by the
already-confirmed tilt-axis x-position (1515.6):

```
lens front (1435.06) to tilt axis (1515.6):  80.5mm
tilt axis (1515.6) to head back (1579.30):    63.7mm
                                             --------
                                              144.24mm ✓ (matches CCCC exactly)
```

> **tilt axis to LED/lens face (beam origin offset) ≈ 80.5 mm** (measured, one interpretive
> split of an explicitly-dimensioned total — flagged as slightly softer than 3.3's numbers)

### 3.5 Other measured dimensions (context / cross-checks)

- Base assembly width, at the connector panel: **140.00mm** (`DIMENSION CCCF`, purely
  horizontal, handle confirms the base housing is ≈140mm across — also the span of seam lines
  `C0DA`/`C104`/`C105` used in 3.2).
- Front (unrotated) view width ≈ **338.2mm** and height ≈ **367.9mm** (`DIMENSION E404`,
  `E408`) — both within a few mm of the `.qxf`'s 341×375mm envelope, corroborating that this
  drawing is the same fixture/variant as the physical spec already in hand (§1's brochure note
  explains the residual few-mm gap).
- Tripod stand (accessory, not part of the fixture body): leg span ≈ 299.4mm
  (`DIMENSION DE1B`), foot spacing 89mm (`DE18`).
- Optional trussbar mount footprint: 420mm × 89mm, with 220–360mm MIN/MAX callouts
  (`ACB1`/`ACB4`/`ACBF`/`ACC2`) — accessory geometry, not used below.

## 4 · What's measured vs. estimated

| Quantity | Value | Status |
| --- | --- | --- |
| Floor to pan-axis / base-yoke split | 66 mm | measured (interpreted from seam geometry, no explicit dimension label) |
| Floor to tilt axis | 277.0 mm | **measured, cross-validated two independent ways** |
| Tilt axis to LED/lens face (beam origin) | 80.5 mm | measured (one interpretive split of dimension `CCCC`) |
| Lens/head face diameter | 231.72 mm | **measured, explicit ⌀ dimension** |
| Base width | 140.0 mm | **measured, explicit dimension** |
| Head depth along beam axis | 144.24 mm | **measured, explicit dimension** |
| Yoke lateral width/length (for the `Model` primitive box, not a pivot) | 140 mm | **estimated** — assumed equal to base width; no explicit dimension for the yoke arm's own lateral thickness was found in the sheets examined |
| Beam disc thickness (`Model Height` for the `Cylinder` primitive) | 20 mm | **estimated** — arbitrary thin-disc convention, copied from the X4 profile's own `Beam` primitive |

No number here is a scaled X4 ratio — the DWG supplied real measurements for every pivot value
the ticket asked for. The X4 comparison in §5 is a secondary sanity check, not the source.

## 5 · Secondary cross-check against the X4

GLP's impression X4 GDTF profile (rid `46490`,
`definitions/gdtf/GLP_impression_X4_HR_Mode_richtig_geschrieben.gdtf`, restored via
`tools/gdtf-share.sh restore`) encodes its own pivots as pure Z-translations in its
`Axis` `Position` matrices: Yoke (pan) at 280mm, Head (tilt) a further 140mm above that, Beam a
further 210mm above that — all relative to each parent geometry's own local origin, sign
negative throughout (a datum-direction choice internal to that file, not replicated here). Its
`Model` primitives give Base 120mm tall, Yoke 320mm tall, Head 450mm deep along the beam axis,
lens/beam width 80mm.

Scaling the X4's head-depth-to-beam-offset ratio (210 / 450 = 0.467) onto this document's
*measured* impression 90 head depth (144.24mm) predicts a beam offset of 144.24 × 0.467 ≈
67.4mm — the same order of magnitude as, but about 13mm less than, §3.4's measured 80.5mm. That
gap is plausible (different internal head geometry between a 7 LED-cluster 90 and a 19-LED
X4, not a like-for-like optical path) and is exactly the kind of discrepancy the original
research (issue #15) flagged as a reason not to trust X4 ratios as more than a rough estimate.
Where this document has an actual measurement (all of §3), it is used in preference to any
X4-derived figure.

## 5.1 · Second cross-check: OpenGDTFLibrary's fan-made impression 90

Issue #17's research (`docs/research/impression-90-geometry-sources.md`, commit `b4ac052`)
independently found `heliostate/OpenGDTFLibrary` — an MIT-licensed, anonymous 2021
Vectorworks-export reconstruction with real `Base → Yoke → Body` `Axis` pivot translations for
this exact fixture — and explicitly deferred reconciling it to this ticket ("a numeric
hypothesis to cross-check against issue #16's DWG numbers, not ground truth on its own").
Fetched directly (`raw.githubusercontent.com/heliostate/OpenGDTFLibrary/main/unpackedGDTFs/
GLP/GLP%40Impression%2090/description.xml`) to check against §3's measurements:

```xml
<Axis Model="Base" Name="Base" Position="{…}{…,0.016500}{…,-0.017500}{0,0,0,1}">
  <Axis Model="Yoke" Name="Yoke" Position="{…}{…,-0.016500}{…,-0.130286}{0,0,0,1}">
    <Axis Model="Body" Name="Body" Position="{…}{…,0.000000}{…,-0.060286}{0,0,0,1}"/>
  </Axis>
</Axis>
```

Model sizes: Base 170×173×40mm, Yoke 340×221×80mm, Body 266×266×145mm.

Two things check out well: the small Y-components (+16.5mm then −16.5mm) net to zero, so — as
in this document's own convention — the file's real pivot data lives entirely in Z, matching
GDTF's Z-up spec (§3.1 of `glp-impression-90-profile.md`). And the sum of the three models' own
heights, 40 + 220.6 + 145 = 405.6mm, lands within 3% of this document's measured 393.2mm
top-of-unit height (§3.3) — a good coarse sanity check that both sources describe a
similarly-sized real fixture.

What doesn't reconcile cleanly: the file never states what its root `Base` Axis's Z=0 is
measured *from* (issue #17's research flagged this as unresolved, and this pass didn't resolve
it either — there's no comment, no `LegHeight` value — `PhysicalDescriptions/LegHeight` is
`0.000000`, unfilled — and no other anchor in the file). Depending on whether that root sits at
the floor or at the top of the assembly, the cumulative Yoke-to-Body offset (60.3mm) implies a
tilt-axis-above-floor figure somewhere in the 185–208mm range — 70–90mm (25–30%) below this
document's measured **277.0mm** (§3.3). Given this source is anonymous fan data with no working
Pan/Tilt channel and an admittedly-unresolved coordinate datum, against §3's numbers, which are
read directly off two independent, explicitly-labelled dimensions on GLP's own manufacturer
drawing (and cross-validate each other to 0.1%), **this document's DWG-measured 277.0mm is used
as ground truth**, exactly as issue #17's research recommended. The OpenGDTFLibrary numbers are
recorded here as a coarse (order-of-magnitude, not pivot-precision) corroboration, not as a
tie-break.

## 6 · GDTF geometry tree

Following the impression X4's own `PrimitiveType`-only structure (no mesh required — see issue
#16's opening comment and `docs/research/glp-impression-90-profile.md` §4), using this
document's measured values. Root `Base` geometry origin is placed at the floor, centered on the
base footprint — an authoring choice (the X4 file uses a different datum direction; GDTF does
not mandate one, only that each `Axis` node's own local origin sit on its real rotation axis).

```xml
<Model Name="Base" PrimitiveType="Base1_1" Width="0.140000" Height="0.066000" Length="0.140000"/>
<Model Name="Yoke" PrimitiveType="Yoke"    Width="0.140000" Height="0.211000" Length="0.140000"/>
<Model Name="Head" PrimitiveType="Head"    Width="0.232000" Height="0.144000" Length="0.232000"/>
<Model Name="Beam" PrimitiveType="Cylinder" Width="0.232000" Height="0.020000" Length="0.232000"/>
```

```xml
<Geometries>
  <Geometry Model="Base" Name="Base" Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,0.000000}{0,0,0,1}">
    <Axis Model="Yoke" Name="Yoke" Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,0.066000}{0,0,0,1}">
      <Axis Model="Head" Name="Head" Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,0.211000}{0,0,0,1}">
        <Beam BeamAngle="10.000000" BeamRadius="0.116000" BeamType="Wash" ColorTemperature="5600.000000" FieldAngle="10.000000" LampType="LED" Model="Beam" Name="Beam" Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,0.080500}{0,0,0,1}" PowerConsumption="300.000000"/>
      </Axis>
    </Axis>
  </Geometry>
</Geometries>
```

Translations are cumulative up the tree (each is relative to its own parent's local frame, all
along the shared vertical/beam Z axis, X/Y = 0 throughout — no lateral offset between pan and
tilt axes was found, matching the X4's own zero-offset yoke and GLP's "baseless, small
footprint" description of this housing lineage): floor → +0.066 (pan axis / yoke root) →
+0.211 more (tilt axis, 0.277 cumulative above floor) → +0.0805 more (beam/LED face, 0.3575m
cumulative above floor when tilt = 0 and the beam points straight up the same axis the drawing
was measured along).

`BeamAngle`/`FieldAngle` (10°) and `ColorTemperature` (5600K) come straight from
`GLP-Impression-90-RGB.qxf`'s `<Lens DegreesMin="10" DegreesMax="10"/>` and `<Bulb
ColourTemperature="5600"/>` — already known, not re-derived here. `PowerConsumption` (300W)
likewise from the `.qxf`'s stated wattage. `BeamRadius` is half the measured lens diameter
(§3.3).

## 7 · What this still doesn't resolve

- The Yoke primitive's own lateral width/length (estimated at 140mm, §4) — the sheets examined
  don't carry an explicit dimension for the yoke arm's thickness separate from the base width
  it was assumed to match. A future pass could look for it in the 1,180 `LWPOLYLINE` /
  2,009 `ARC` entities not otherwise inspected here, or in the 2004 DWG if a more complete DWG
  reader becomes available (§2 — LibreDWG's R18/`AC1018` support returned only table data,
  error code 68).
- The *impression 90 Dimensions* PDF's URL is still unresolved (§1) — moot for this ticket since
  the DWG supplied everything asked for, but noted for completeness against the prior
  research's open item.
- Pan/tilt DMX range (660°/300°) is already fully known from the `.qxf` and confirmed verbatim
  in this drawing's own annotations (§2) — not re-derived, and, per issue #15's research, is a
  separate GDTF mechanism (`ChannelSet` `PhysicalFrom`/`PhysicalTo`) from the pivot geometry
  this document addresses.
