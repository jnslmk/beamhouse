# GLP impression 90 RGB: source a GDTF profile, or author one?

Research for [issue #15](https://github.com/jnslmk/beamhouse/issues/15) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)), following on from
[issue #2](https://github.com/jnslmk/beamhouse/issues/2) /
[`docs/research/gdtf-profile-availability.md`](https://github.com/jnslmk/beamhouse/blob/research/gdtf-profiles/docs/research/gdtf-profile-availability.md),
which could not confirm or deny a profile for this fixture because GDTF Share's
search UI is JS-rendered and gated. Context: `docs/DESIGN.md` §5.1 (geometry tree,
`PrimitiveType`), §8.2 (beams), §01 (the two rendering classes), and
`~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf` (hand-authored physical spec).

The GLP impression 90 RGB is 6 of the reference rig's 13 fixtures and the only true
moving head — the only fixture that exercises volumetric beams and the pan/tilt axis
hierarchy (`docs/DESIGN.md` §01, §5.1).

**Headline answer: no GDTF profile exists for this fixture, anywhere, and GLP's own
manufacturer catalog on GDTF Share proves it rather than merely failing to prove the
opposite.** A near-relative (impression X4) has a real, downloadable profile, but its
optics and housing diverge too far to reuse directly. GLP publishes real technical
material — DMX profile documents, photometric data, and two DWG CAD files — but this
research could not open the DWG files to check for pivot dimensions, which is the one
remaining unknown standing between "estimated" and "derived" pivots for a hand-authored
profile. Given that gap, and given the design already treats `PrimitiveType` procedural
geometry as the v1 render path (§5.1, §9.2), the recommendation is to go
**primitive-plus-own-GLB now**, and treat full GDTF authoring as an optional, bounded,
parallel track — see §7.

## 1 · Does a GDTF profile exist?

### 1.1 GDTF Share — resolved definitively, without an account

Issue #2's blocker was that GDTF Share's manufacturer/device listing pages render
client-side via JavaScript, so a plain fetch can't see what's listed. That blocker is
gone: GDTF Share's own page-building JS for a manufacturer profile calls an
**unauthenticated JSON API** to populate the fixture list. The endpoint (reconstructed
from the string-concatenated call in that page's own JS bundle,
`'/apis/getF'+'ixtureList'+'ByUser.php'`) is:

```
https://gdtf-share.com/apis/getFixtureListByUser.php?name=German+Light+Products
```

No login is required to call it — only the file *download* (`downloadFile.php`) is
gated, matching what issue #2 established about the API in general. This returns GLP's
complete GDTF Share catalog: **49 fixtures**, independently fetched and enumerated twice
in this research pass (once via a background research agent, once directly via
`WebFetch` as a check). Every "impression"-family entry in that catalog:

```
ArenaLED1 Touring Color, ArenaLED1 Touring White, Creos, EXO Beam 10, EXO Spot 30,
Exo Wash 30, FUSION by GLP EXO Hybrid 40, Fusion Stick FS16Z, impression E350,
impression FR1, impression FR10 Bar, impression S350, impression S350 Wash,
impression S500 Profil HC, impression S500 Profil HO, impression S500 Wash HC,
impression X 4 s, impression X4, impression X5, impression X5 Bar 1000,
impression X5 Compact, impression X5 Dot Wash, impression X5 IP,
impression X5 IP Bar 1000, impression X5 IP Maxx, impression X5ip Bar 1000
```

**No entry named "impression 90" or containing "90 RGB" exists.** No "impression 120"
entry exists either (only mentioned in prose, see §1.2). This is GLP's own authoritative
account on the platform — not a third party's incomplete mirror — so absence here is
strong evidence of absence, not just an unconfirmed gap. Source:
`https://gdtf-share.com/apis/getFixtureListByUser.php?name=German+Light+Products`,
fetched 2026-08-31/09-01.

### 1.2 Near-relative: impression X4 exists, but doesn't retarget cleanly

**impression X4** (GDTF Share `id: 13248`, `files: 1` — i.e. one real revision on the
platform, confirmed by direct fetch of the same JSON) is the closest relative with an
actual profile. GLP's own catalog description for it states:

> "The impression X4 features 19 high power RGBW LEDs, each rated at 15W with a
> 7° – 50° zoom range. The housing design is based on the legendary, and award winning,
> **impression 90 and 120RZ fixtures** including their baseless design and small
> footprint."
> — GLP, via `getFixtureListByUser.php`, `id: 13248`

That confirms a real lineage (shared housing/yoke design language, "baseless" — no
separate base assembly, unusual for a mover), so the X4's `Axis` geometry tree
*shape* is a legitimate reference. But it fails as a drop-in retarget on the numbers
that matter for this ticket:

- **Optics**: X4 is RGBW with a 7°–50° zoom range; the impression 90 RGB is RGB with a
  **fixed** 10° beam (`~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf:` `<Lens
  DegreesMin="10" DegreesMax="10"/>`, no Zoom channel). Retargeting would mean stripping
  the zoom mechanism and the white LED entirely — most of what makes the X4 profile
  what it is.
- **Pan/Tilt range**: the X4's GDTF profile itself was not opened (gated download), so
  its `PhysicalFrom`/`PhysicalTo` on Pan/Tilt are unconfirmed against the impression
  90's 660°/300° (`GLP-Impression-90-RGB.qxf`, `<Focus PanMax="660" TiltMax="300"/>`).
  Unverified, flagged.
- No "impression 120" GDTF entry exists to check either — it's referenced only in the
  X4's own descriptive text ("120RZ"), not as a separate downloadable profile in the
  catalog.

**Verdict**: X4 geometry is a plausible *shape* reference (housing proportions, yoke
layout) if a model is ever pulled and inspected, but not a profile that can be
retargeted by editing physical values — the optics and channel layout diverge too far.
Not pursued further in this pass because the X4 file itself was not downloaded (account
gate).

### 1.3 Other sources checked

- **BlenderDMX** (`github.com/open-stage/blender-dmx`) bundles exactly 8 fixtures under
  its own `BlenderDMX@…` namespace in `assets/profiles/` — synthetic placeholder
  fixtures for its own testing, not manufacturer profiles. No GLP fixture of any kind is
  bundled.
- **GitHub / community repos**: no repository, gist, or committed MVR show file
  referencing "impression 90" as a GDTF/`description.xml` was found via code search.
- **Public MVR example files** (mvrdevelopment, Vectorworks example scenes): none found
  embedding this fixture.
- **pygdtf** (`github.com/open-stage/python-gdtf`) ships exactly one bundled test
  fixture, `BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf` — a generic PAR, unrelated.

Given §1.1's definitive negative from GLP's own catalog, these are corroborating rather
than load-bearing, but all point the same way. **Conclusion: no GDTF profile exists for
the GLP impression 90 RGB, anywhere accessible without a GDTF Share account** (and the
account only gates *download* of the X4 or any other listed fixture — it would not
surface an impression 90 entry that this research's unauthenticated listing call
already shows doesn't exist).

## 2 · What GLP publishes

Source: `https://www.germanlightproducts.com/product/impression-90/`, titled
"Impression RGB 90 — LED Stage Lighting Product — GLP", breadcrumbed **Home / GLP /
Discontinued / impression 90** — this is explicitly an archived/discontinued product
page, not a current-catalog listing. Fetched 2026-08-31/09-01; two separate fetches of
this page returned different levels of detail (one full downloads list, one much
sparser), consistent with the downloads panel being populated by page-level JS/tabs
rather than present in a single static HTML pull — treat individual document links
below as **page-listed, not all independently link-verified** (see caveat per item).

Downloads listed on the page, by category:

| Category | Documents |
| --- | --- |
| Manuals & DMX charts | 12 documents covering the 90's several lamp variants (White Amber, WWC-CCW, RGB) in both "Static" and dimmable trims — e.g. *Impression 90 RGB Manual V1.26 EN*, *impression 90 RGB DMX V1.17* |
| Illustrations & dimensions | *impression 90 Dimensions* (PDF) |
| CAD | *Vectorworks GLP Library v2014* (ZIP), *impression 90 2000 CAD File* (zipped DWG), *impression 90 2004 CAD File* (zipped DWG) |
| Photometric data | 7 PDFs, split by lamp variant and beam angle (e.g. *Impression-90-RGB-10-°-Photometric*, *Impression-90-RGB-25°-Photometric*) |
| Specifications | *impression 90 Specifications* (PDF) |

No `.gdtf` file, and no reference to one, appears anywhere on the page.

**Verified download URLs** (confirmed working, resolved via a link-listing fetch of the
page rather than the AI-summarized one):

- Manual: `https://www.germanlightproducts.com/wp-content/uploads/2016/02/Impression-90-RGB-Manual-V1.26-EN.pdf`
- Photometric (10°): `https://www.germanlightproducts.com/wp-content/uploads/2016/02/Impression-90-RGB-10-°-Photometric.pdf`
- CAD, 2000 revision: `https://www.germanlightproducts.com/wp-content/uploads/2013/01/impression-90_2000-DWG-File.zip`
- CAD, 2004 revision: `https://www.germanlightproducts.com/wp-content/uploads/2013/01/impression-90_2004-DWG-File.zip`

**Unverified**: the *impression 90 Dimensions* PDF is listed on the page by name, but a
guessed URL for it (`…/2015/12/impression-90_Dimensions.pdf`, by analogy with the CAD
files' naming pattern) returned **HTTP 404**. Its real URL was not recovered in this
pass — this document exists (it's listed) but its exact link needs re-deriving from the
live page (e.g. by rendering it in a browser) rather than guessed.

**A 2013-era marketing brochure** was also read directly during the background research
pass: it is an annotated product photo with headline dimensions given as plain text,
**145 × 340 × 370 mm** — no dimension lines, no drawing, no pivot data. This number
**does not match** `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`'s `<Dimensions
Weight="7.5" Width="341" Height="375" Depth="338"/>` (341×375×338). The two triples are
close in magnitude but not identical and don't even obviously permute into each other
cleanly (145 has no match in the qxf triple at all) — flagged as an open discrepancy,
not resolved here. Possible explanations, none confirmed: the brochure and the qxf
describe different lamp variants of the "impression 90" family (White Amber vs RGB vs
WWC-CCW, per the manual list above, which could plausibly differ slightly in housing),
rounding/packaging vs. unit dimensions, or a transcription slip in one source or the
other.

**Is what's published enough to model base/yoke/head as separate bodies with correct
pivots?** Undetermined, and this is the load-bearing open question for §3. The
*Dimensions* PDF and the two DWG CAD files are exactly the kind of document that would
answer it — a proper dimensioned drawing or a DWG opened in CAD software would show
pivot offsets directly, rather than requiring them to be estimated. **This research
could not open the DWG files** — no DWG-capable tool (no ODA File Converter, no
LibreCAD/FreeCAD with DWG import) was available in this environment, and the Dimensions
PDF's working URL wasn't recovered. This is the single most useful next step, and it
is one the user is well-placed to do directly: pull the CAD zips onto a machine with
CAD software (or convert DWG→DXF with the ODA converter) and read the pivot geometry
straight off the drawing, rather than have this research estimate it.

## 3 · The articulation problem: what GDTF requires for `Axis` geometry

Primary source: `https://raw.githubusercontent.com/mvrdevelopment/spec/main/gdtf-spec.md`
(the official spec repo under the `mvrdevelopment` GitHub org).

### 3.1 `Axis` has no dedicated pivot field

An `<Axis>` geometry node's attributes (spec Table 36) are just `Name`, `Model`, and
`Position` — a 4×4 matrix, identity by default. **There is no separate "pivot point"
attribute anywhere in the schema.** The pivot is wherever the node's local origin ends
up after its own `Position` matrix is applied on top of its parent's accumulated
transform. The spec is explicit about the convention:

> "The zero point of a device does not necessarily have to contain the offset related
> to the yoke, but it must be centered on its axis of rotation. […] The offsets are to
> be defined by the position matrix of the according geometry."
> — GDTF spec (`mvrdevelopment/spec`, geometry/Axis discussion)

And on meshes specifically: a geometry's mesh "shall be drawn around its own suspension
point" — i.e. the *modeller* is responsible for authoring (or offsetting, via
`Position`) each body so that its local origin sits exactly on the real rotation axis.
This confirms `docs/DESIGN.md` §5.1's "hinge" framing exactly (`Axis` → "a hinge —
parent of everything Pan or Tilt rotates") but sharpens the practical requirement: this
is a **modelling** discipline as much as an XML one. There are only two ways to place an
offset pivot: model the geometry so its own local origin is already on the axis, or
insert a translation in the `Position` matrix of the node one level up. There is no
third field to fill in.

### 3.2 `PanMax`/`TiltMax` gives range, not location — and isn't even GDTF

Confirmed by direct search of the spec text: **no `PanMax`, `TiltMax`, or any single
range attribute exists anywhere in GDTF.** `<Focus Type="Head" PanMax="660"
TiltMax="300"/>`, as it appears in `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`, is a
**QLC+ legacy fixture-definition field**, not a GDTF one. GDTF's actual mechanism for
range is entirely different and lives on the DMX side: a `ChannelFunction`'s
`ChannelSet` entries map DMX sub-ranges to `PhysicalFrom`/`PhysicalTo` values (degrees,
for Pan/Tilt) — this is the same interpolation mechanism `docs/DESIGN.md` §5.2 already
assumes for all attributes, not something specific to movement. (The exact verbatim
`ChannelSet` table text could not be pulled in this pass — a fetch of that section of
the spec truncated — so treat the *wording* as unquoted, though the mechanism itself is
corroborated by `docs/DESIGN.md`'s own independent description of GDTF's interpolation
model.)

**The consequence for this ticket is the crux finding of the whole document**: pivot
location and movement range are two *independent* pieces of data in GDTF, coming from
different parts of the schema entirely (geometry tree vs. DMX channel functions). The
`.qxf`'s 660°/300° numbers, however precisely captured, say nothing about *where* the
yoke or head rotate around. **`PanMax`/`TiltMax` cannot be converted into pivot
coordinates by any formula — pivot location has to come from somewhere else: a
dimensioned drawing, a physical measurement, or an estimate from the outer envelope
(e.g. "tilt axis passes through the head's vertical center, at roughly half the yoke
arm's length above the base") accepted as approximate.** This is exactly the gap §2
identifies GLP's Dimensions PDF / DWG files as the one remaining lead for closing.

## 4 · Minimum viable GDTF

Confirmed structure (spec Table 4, mandatory child order under
`<GDTF DataVersion="1.2"><FixtureType>`):

| Element | Status | Needed for a minimal impression 90 RGB profile |
| --- | --- | --- |
| `AttributeDefinitions` | mandatory | Pan, Tilt, Dimmer, ColorAdd_R/G/B, Shutter — all already identified in the `.qxf`'s channel list |
| `Wheels` | optional | skip — no gobo/colour wheel on this fixture |
| `PhysicalDescriptions` | optional, but needed for a real `Emitter` (LED colour/luminous data) | the `.qxf`'s `<Bulb Type="LED" Lumens="0" ColourTemperature="5600"/>` gives colour temperature but **`Lumens="0"` — luminous flux is unknown from the physical spec already in hand**. GLP's own photometric PDFs (§2) are the actual source for this and were not opened in this pass |
| `Models` | optional | can be entirely omitted if using `PrimitiveType` (see below) |
| `Geometries` | **mandatory** | the `Base → Axis(Yoke, Pan) → Axis(Head, Tilt) → Beam` tree is authored here |
| `DMXModes` | mandatory | maps directly onto the `.qxf`'s three modes: `Normal`, `Compress`, `High Resolution (Extended)` — channel order and offsets are already fully worked out in `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf` |

**`PrimitiveType` can fully substitute for a `Model`/GLB reference.** Confirmed enum
(spec Table 32): `Undefined, Cube, Cylinder, Sphere, Base, Yoke, Head, Scanner,
Conventional, Pigtail, Base1_1, Scanner1_1, Conventional1_1`. A geometry node can
declare `Primitive="Yoke"` with **no GLB at all** and remain spec-valid — this is the
exact mechanism `docs/DESIGN.md` §5.1 already plans to resolve for the shared-link
proxy-geometry path (§9.2). Practically: **a hand-authored GDTF for this fixture does
not require CAD or a GLB to be spec-valid**, only to look non-schematic. It does still
need correct pivot *locations* on the `Axis` nodes (§3) even when using primitives —
`PrimitiveType` sidesteps modelling, not geometry-tree correctness.

**Vertex budget**: `docs/DESIGN.md:335` ("The spec caps a device at 1200 vertices for
default LOD") is confirmed correct, verbatim in the spec's Model Collect section: "All
models of a device combined should not exceed a maximum vertices count of 1200 for the
default mesh level of detail." Three LOD tiers exist (`Low`/`Default`/`High`, spec
Table 33); only `Default` carries the cap.

### 4.1 Tooling

- **GDTF Builder, GDTF Bench Online, GDTF Fixture Finder** (listed at
  `https://www.gdtf.eu/docs/list-of-projects/`) are all **closed-source, account-gated
  web services** — the same GDTF Share account gate issue #2 already ran into, with no
  offline/local path through any of them.
- **pygdtf** (`https://github.com/open-stage/python-gdtf`, MIT license) has a
  `FixtureTypeWriter` class alongside its parser, so **programmatic authoring without a
  GUI tool is real**: `writer = pygdtf.FixtureTypeWriter(fixture); writer.write_gdtf(path)`.
  Its README demonstrates parse → edit → re-save (round-trip), not building a
  `FixtureType` from scratch with a guided API — so this is "you can write the object
  model in Python and serialize it," not "there's a wizard." Building a minimal
  from-scratch profile this way is feasible but unassisted: the author (a person) still
  needs to know the full geometry-tree/attribute/DMXMode shape from §4's table and the
  spec directly, same as hand-editing XML, just with less angle-bracket typing and a
  format-correctness guarantee from the writer.
- **gdtf-build.com** ("GDTF Builder" by LMNR) surfaced as a free, AI-based GDTF
  generator explicitly pitched for "the manufacturer has never published a GDTF"
  scenarios, and its supported-manufacturer list explicitly includes GLP. This is an
  unverified, third-party tool this research did not exercise end-to-end — no
  confirmation it produces correct `Axis` pivots, valid `PhysicalDescriptions`, or
  anything beyond a plausible-looking skeleton. Worth a trial run before hand-authoring
  from nothing, but treat its output as a draft to check against §3's pivot requirement,
  not a finished profile. `gdtffixturebuilder.com` and `gogobo.app/tools/gdtf-builder`
  also turned up in search but their actual capabilities could not be determined
  (unclear/placeholder page content in this pass).

**Realistic path if authoring is pursued**: hand-author (or pygdtf-script-author) the
`AttributeDefinitions`/`DMXModes` from the `.qxf`'s already-complete channel data —
essentially transcription, low-risk — then spend the actual effort on the `Geometries`
tree's `Axis` pivots, gated on getting real numbers out of GLP's Dimensions PDF or DWG
files (§2), or accepting estimated pivots (§3.1) as a first pass.

## 5 · The cheaper alternative: primitive geometry + the user's own GLB

`docs/DESIGN.md` §5.1 already treats `PrimitiveType` procedural generation (`Base`,
`Yoke`, `Cylinder`, …) as the fallback render path for any fixture without a shipped
model, and doubles it as the proxy geometry for the shared-link viewer (§9.2). Ticket
#14 is separately evaluating "definition from QLC+/OFL, mesh from the user's own repo."
This ticket's own framing asks which gets a correct-looking, correctly-articulated
mover on screen sooner: authoring a full GDTF, or modelling the mover in build123d and
driving it from the `.qxf` data directly.

**Checked directly against the user's build123d pipeline
(`~/git-projects/build123d/build123d-models/`)**: it already produces exactly the kind
of articulated, multi-body export this needs, with no new tooling required.

- `export.py`'s `export_gltf()` call (`export.py:130`) is a thin wrapper over
  build123d's own `export_gltf`
  (`.venv/lib/python3.12/site-packages/build123d/exporters3d.py:183`), which builds an
  **OCCT XCAF assembly document** from the input shape
  (`_create_xde(to_export, unit)`, `exporters3d.py:235`) and writes it via
  `RWGltf_CafWriter` — XCAF assembly structure is exactly what preserves a Compound's
  labeled children as **separate named nodes in the output glTF/GLB**, not one fused
  mesh. `PreOrderIter(to_export)` (`exporters3d.py:230`) walks and tessellates every
  sub-shape in the tree before writing.
- `export.py`'s `_export_child_stls()` (`export.py:62`-`81`) already relies on and
  documents this same shape: "export individual child STL files when a compound exposes
  named children," iterating `part.children` and reading each child's `.label`.

**In practice**: a build123d `Compound` with three labeled `Part` children — `"base"`,
`"yoke"`, `"head"` — assembled at their real relative offsets already exports as a
single GLB with three distinct, named nodes, via the pipeline's existing `export_gltf`
call. No new export code, no new pipeline. `GLTFLoader.parse()` on the browser side
(already planned in `docs/DESIGN.md`'s `models.ts`) hands back exactly this node
hierarchy in the resulting `THREE.Scene`. Beamhouse's renderer then needs a small,
fixture-specific convention — "the node named `yoke` gets Pan applied around its local
Y axis, the node named `head` gets Tilt applied around its local X axis" — driven
straight from the `.qxf`'s channel/mode data, with **no GDTF schema to satisfy at all**
(no `AttributeDefinitions`, no `DMXModes`, no `PhysicalDescriptions`, no `Axis`
`Position`-matrix XML).

This sidesteps §4's authoring effort almost entirely and inherits the **same pivot
problem as §3** — a build123d body still has to be modelled with its local origin at
the true rotation axis, so the "estimate vs. derive from GLP's drawings" question from
§2/§3 doesn't go away, it just moves from GDTF XML into build123d part placement. What
it does remove is the surrounding schema-compliance work (mode tables, attribute
definitions, PhysicalDescriptions, DMXMode channel offsets) that GDTF requires and
Beamhouse's own renderer does not.

**What's lost going this route**: the profile isn't reusable by anyone outside
Beamhouse (no GDTF Share upload, no use in Mizer's `gdtf:` provider, no use in
BlenderDMX or any other GDTF consumer), and it breaks the "GDTF is the only definition
format" framing (`docs/DESIGN.md` §4.2 — itself already "under review" per that
section, and directly matching what ticket #14 is evaluating). It also means Beamhouse
carries one more piece of fixture-specific logic (the node-name → axis convention)
rather than a spec-defined one.

## 6 · Reusability

If a full GDTF profile is authored anyway (following §4, gated on the pivot question in
§3), it is worth publishing back to GDTF Share: this research found **zero** existing
profiles for this fixture (§1), so a correct one would be a genuine first, not a
duplicate. That is a separable follow-on decision from what gets the reference rig
rendering soonest, and does not need to happen before or instead of §5's approach — the
two are not mutually exclusive; the primitive+GLB path could ship first, and a GDTF
profile authored later from the same pivot data would only need re-deriving the schema
wrapper, not re-solving the geometry.

## 7 · What this research could not determine

- **The Dimensions PDF's working URL**, and therefore its content — whether it's a
  proper dimensioned drawing showing pivot locations, or just headline W×H×D like the
  brochure. Listed on GLP's product page by name; a guessed URL 404'd.
- **The two DWG CAD files' content** (`impression-90_2000-DWG-File.zip`,
  `impression-90_2004-DWG-File.zip`) — no DWG-capable tool was available in this
  environment to open them. This is the single highest-value unresolved item: if either
  file contains a proper elevation/section drawing, the pivot-location problem in §3
  is solved outright rather than estimated.
- **The impression X4's actual GDTF file contents** (Pan/Tilt range, exact `Axis` tree
  shape) — gated behind a GDTF Share account; only its catalog-listing metadata
  (§1.2) was accessible.
- **The exact verbatim `ChannelFunction`/`ChannelSet` spec table text** for
  `PhysicalFrom`/`PhysicalTo` — a spec fetch truncated before reaching it. The
  *mechanism* (§3.2) is corroborated independently by `docs/DESIGN.md` §5.2, but the
  precise wording is unquoted here.
- **gdtf-build.com's actual output quality** — not exercised end-to-end; flagged as an
  untested lead, not a verified tool.
- **The 145×340×370mm vs. 341×375×338mm dimension discrepancy** between the marketing
  brochure and `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf` (§2) — not resolved,
  noted as an open flag for whoever next touches the physical spec.
- **GDTF Share's bulk-download mechanism and ToS on scripted access** — out of this
  ticket's scope, already flagged as open in issue #2's research.

## 8 · Recommendation

**Go primitive-plus-own-GLB for the impression 90 RGB now; treat full GDTF authoring
as an optional, parallel, bounded side-track — not a prerequisite for M4.**

Reasoning, against the four options the ticket poses:

1. **Source it** — ruled out. §1.1 is a definitive negative from GLP's own GDTF Share
   catalog, not just an inability to check.
2. **Retarget a relative** — ruled out as a direct substitute. The impression X4 exists
   and confirms shared housing lineage (§1.2), but its zoom RGBW optics and unconfirmed
   Pan/Tilt range diverge too far from the fixed-10°-RGB impression 90 to retarget by
   editing physical values; it's a shape reference at best, and its file wasn't even
   opened in this pass.
3. **Author a GDTF** — technically feasible per §4 (the `.qxf` already has full
   attribute/mode data; `PrimitiveType` legally substitutes for a mesh; pygdtf gives a
   programmatic write path) but **gated on the same unresolved pivot question as every
   other option** (§3), and additionally requires satisfying GDTF's full schema
   (`AttributeDefinitions`, `PhysicalDescriptions`, `DMXModes`) for a payoff — spec
   compliance, GDTF Share reusability (§6) — that doesn't move the reference rig
   forward any faster than §5 does.
4. **Primitive + own GLB** — fastest correctly-articulated result, per §5's direct
   confirmation that the user's existing build123d pipeline already exports
   multi-node, named-hierarchy GLBs with zero new tooling (`export.py:130` →
   `exporters3d.py:183`, XCAF assembly preservation). It carries exactly one
   unresolved dependency — real or estimated pivot locations — which options 2 and 3
   share anyway, so it isn't paying a unique cost for that gap.

The one action worth taking before committing further to either track: **open the two
DWG CAD files GLP publishes** (§2, §7). If they contain real pivot dimensions, both the
GDTF-authoring track and the build123d-modelling track get to "derived," not
"estimated," pivots for the price of one file open — worth doing regardless of which
rendering path ships first.
