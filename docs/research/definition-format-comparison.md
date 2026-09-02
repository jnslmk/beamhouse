# GDTF vs QLC+ `.qxf` vs Open Fixture Library JSON as a visualiser's fixture source

Research for [issue #14](https://github.com/jnslmk/beamhouse/issues/14), feeding
[#13](https://github.com/jnslmk/beamhouse/issues/13) (part of the [wayfinder map,
#1](https://github.com/jnslmk/beamhouse/issues/1)). Context: `docs/DESIGN.md` §01 (two
rendering classes), §4.2 (the OBF26 rig is patched entirely against `qlc:` ids), §5 (GDTF
resolution and its verified reference-implementation gaps), §8.1 (strips render as one
`DataTexture`, not N objects), §8.3 (colour is RGB-only in v1). Prior research: #2 found no
confirmed GDTF profile for 5/13 rig fixtures and no working generic pixel-strip GDTF profile
anywhere; #13 reopened "GDTF only" on that basis and floated Open Fixture Library as a second
format.

**Scope correction, mid-research.** The rig's existing `~/.qlcplus/fixtures/WLED-SegmentEffect.qxf`
(18 channels: opacity, effect#, speed, intensity, palette, option, then RGB×3 sets) is an
**effect-mode** fixture — the console picks a WLED built-in effect and WLED computes pixel
colours on-device. A decision was made during this research that v1 drives strips **per-pixel**
only (via gled2 or WLED's per-pixel DMX input), so WLED-SegmentEffect.qxf is *not* the shape
being evaluated below. Every claim about "the strip class" in this document is about a
**35-pixel RGB tube = 105 discrete DMX channels**, not an effect-parameter fixture. No such
per-pixel profile exists in any of the three libraries surveyed (§2) — this document assesses
how well each format's own primitives support *authoring* one, and how proven the tooling is
for *consuming* one, not which format ships one for free.

**Headline.** All three formats can describe a per-pixel strip's channels. Only OFL's schema
declares pixel layout and channel-repetition *structurally* — GDTF requires inferring it from
geometry, QLC+ requires enumerating it by hand with no spatial semantics beyond a 2D grid size.
But the two "reference implementations" this research leans on hardest — Mizer's GDTF and OFL
providers — both turn out to silently drop or mis-match exactly the data this ticket cares
about (§3.3, §7). None of the three formats carries a mesh or geometry tree except GDTF, and
GDTF's is unimplemented anywhere accessible. The strongest, most concrete finding is in §6: the
user already has GLB models of the actual DIY LED-tube fixture, which changes the "no mesh" gap
from a research question into an engineering task.

---

## 1. Capability matrix

Cited to schema/spec/source, not summaries. "Verified in Mizer" means: the *reference
implementation* Beamhouse would otherwise reuse patterns from actually parses this field into
its common model — several rows below show format capability and Mizer's actual behaviour
diverge sharply.

| Capability | GDTF | QLC+ `.qxf` | OFL JSON |
| --- | --- | --- | --- |
| Channel/mode structure | `DMXChannels`/`DMXMode`, geometry-scoped (`gdtf/src/definition.rs:155-189`) | `<Channel>` + `<Mode><Channel Number>` flat list (`qlcplus/src/definition.rs:99-126`) | `availableChannels`/`templateChannels` + `modes[].channels[]`, can include a matrix-repeat block (`fixture.json:272-337`) |
| Physical units / interpolation | `ChannelFunction dmxFrom→physicalFrom..physicalTo`, `PhysicalUnit` enum exists (DESIGN.md §5.0) — **unparsed in Mizer's provider** | None — capability text has no numeric physical range at all, only DMX min/max | `capability.dmxRange` + typed fields per capability (e.g. `angleStart/angleEnd` in degrees) — physical units are part of the capability's own JSON shape |
| Beam angle | `Beam` geometry (`gdtf/src/types/geometries.rs:79-88`) — no numeric field parsed by Mizer | `<Lens DegreesMin/DegreesMax>` (`qlcphysical.h:41-43`; e.g. `GLP-Impression-90-RGB.qxf`: `DegreesMin="10" DegreesMax="10"`) | `physical.lens.degreesMinMax` (`fixture.json:187-201`); or per-capability `BeamAngle{angleStart,angleEnd}` (`capability.json:735-751`) |
| Pan/tilt range | Geometry tree `Axis` nodes — no numeric range parsed by Mizer | `<Focus Type PanMax TiltMax>` (`qlcphysical.h:52-55`; e.g. GLP file: `PanMax="660" TiltMax="300"`) | `Capability::Pan{angleStart,angleEnd}` / `Tilt{...}` per-channel (`capability.json:272-334`) — **and Mizer's OFL provider actually carries this into its common model** (`open-fixture-library/src/lib.rs:682-705`), unlike its GDTF or QLC+ providers |
| Pan/tilt pivot *location* | In principle, `Axis` node position in the geometry tree's transform — **not parsed anywhere** (DESIGN.md §5.0: "Matrix, Position, transform — zero occurrences") | None. `Focus` gives sweep range only, never where the axis sits in space | None. No spatial concept for a fixture's own internal articulation exists at all |
| Dimensions | `PhysicalDescriptions` — Mizer parses it as `pub struct PhysicalDescriptions {}` (`gdtf/src/definition.rs:144-146`), i.e. a literal no-op | `<Dimensions Weight Width Height Depth>` mm (`qlcphysical.h:44-48`) — **also a no-op in Mizer**: `pub struct PhysicalType {}` (`qlcplus/src/definition.rs:28-29`) and `physical: PhysicalFixtureData::default()` is hardcoded (`qlcplus/src/conversion.rs:48`) | `physical.dimensions` = `[w,h,d]` mm (`fixture.json:107-109`, `definitions.json:50-59`) — **the only one of the three Mizer actually maps into its common `FixtureDimensions`** (`open-fixture-library/src/lib.rs:375-378,490-499`) |
| Colour model | `ColorAdd_R/G/B` attributes + `colorSpace`/gamut per channel function (DESIGN.md §8.3, §11.2) | `<Colour>` enum: `Generic,Red,Green,Blue,Cyan,Magenta,Yellow,Amber,White,UV,Lime,Indigo` (`qlcplus/src/definition.rs:298-311`) — no gamut/colour-space concept at all | `ColorIntensity.color` enum: `Red,Green,Blue,Cyan,Magenta,Yellow,Amber,White,"Warm White","Cold White",UV,Lime,Indigo` (`capability.json:172-186`) — same coverage as QLC+, no gamut concept either |
| 3D geometry / mesh | `Geometries` tree of `Geometry/Beam/Axis/GeometryReference`, `PrimitiveType` fallback, GLB in `models/gltf/` (DESIGN.md §5.1) — **the only format with any concept of this at all** | **None.** Zero `<Geometry>`, `<Mesh>`, `<Matrix>`, `<Position>` elements anywhere in 1710 local files (grep, corroborated) | **None.** No geometry/mesh/model field anywhere in `fixture.json`, `matrix.json`, `channel.json`, `definitions.json` (fetched and read directly, 2026-08-31) |
| Models | GLB, ≤1200 vertices default LOD (DESIGN.md §5.1) | `<Model>` in every one of 1710 files is a **name string** (e.g. `<Model>impression 90 RGB</Model>`), not geometry | No model field of any kind |
| Pixel/matrix concept | Implicit: a `GeometryReference` instantiated per DMX break; "strip" is inferred from collinear positioned instances (DESIGN.md §5.3) — **and per #2, transform accumulation needed to even detect collinearity is unimplemented anywhere** | `<Head>` (list of channel numbers, no coordinates) inside a `<Mode>`, `<Physical><Layout Width Height>` (2D grid *size* only, no per-cell position) — see §2 | `Matrix{pixelCount\|pixelKeys}` (3D grid of string keys) + `physical.matrixPixels.{dimensions,spacing}` (mm) + declarative `insert:"matrixChannels"/repeatFor/templateChannels` mode-expansion (`matrix.json`, `fixture.json:284-330`) — see §2 |
| Wheels/gobos | Media shipped inside the same zip (DESIGN.md §01) | `Capability Res1="Others/rainbow.png"` — **a filename resolved against a separate external `gobos/` asset directory**, not embedded (`qlcplus/src/resource_reader.rs:15-18`) | `Resource{image:{mimeType,extension,data(base64),encoding}}` — **embedded directly in the fixture JSON** (`open-fixture-library/src/lib.rs:339-355`) |

Out-of-v1 scope per DESIGN.md §01 (gobos, colour space) is included above only because the
ticket asked for a complete matrix; none of it should gate the #13 decision.

---

## 2. Pixel/matrix handling — the decisive case

### GDTF

A `GeometryReference` instantiates a named geometry once per `Break` offset (spec; DESIGN.md
§5.3). Nothing in the format declares "these N references form a line" — that has to be
inferred at runtime from the *positions* the instances resolve to after transform accumulation,
which per DESIGN.md §5.0 is unimplemented in the one available reference (`mizer-gdtf-provider`,
663 lines, zero occurrences of `Matrix`/`Position`/`transform`). Per #2, no working generic
pixel-strip GDTF profile exists to test this against even if the code did exist.

**One partial correction to that "no reference implementation" claim.** Open Fixture Library's
own GDTF **importer** (`plugins/gdtf/import.js` in `OpenLightingProject/open-fixture-library`,
fetched 2026-09-01) does exactly this expansion, in JavaScript: `findGeometryReferences()`
(around line 1057) walks `<GeometryReference>` nodes for a given geometry name, and the
mode-building code (around lines 943–1018) turns the matched references into an OFL
`matrix.pixelKeys` array plus an `insert:"matrixChannels"` block. This is real, MIT-licensed,
working code that solves the "which GeometryReference instances belong to a pixel matrix"
half of DESIGN.md's open question 9 (§11) — worth reading directly before writing `gdtf-ts`'s
own version. It is **not** a spatial reference: OFL never needs 3D coordinates, so this importer
never accumulates transforms or computes collinearity — it only groups references by name and
emits them in document order. The "is this run of pixels actually a straight line in 3D"
question DESIGN.md's ticket 7/8 (strip detection heuristic) needs is still unanswered by it.

### QLC+

QLC+ has a genuine multi-emitter concept, just not a spatial one. Confirmed across the entire
1710-file corpus at `/usr/share/qlcplus/fixtures/`:

- `<Head>` (a list of channel numbers belonging to one emitter cell) appears in **360 files**.
- `<Physical><Layout Width="…" Height="…"/>` (a 2D grid *size*, `qlcphysical.h:50` —
  `KXMLQLCPhysicalLayout`) appears in **302 files**.
- Zero files anywhere contain `<Geometry>`, `<Mesh>`, `<Matrix>`, or `<Position>` — confirmed by
  direct grep, corroborating the count already established for this ticket.

A real 48-channel example, `/usr/share/qlcplus/fixtures/AFX/AFX-BARLED200-FX.qxf`: 16 emitter
cells × RGB, each cell declared as `<Head><Channel>0</Channel><Channel>1</Channel><Channel>2</Channel></Head>`,
with `<Physical><Layout Width="8" Height="2"/></Physical>` giving the whole bar's grid shape.
This is structurally the same pattern a hand-authored 35-pixel RGB tube would need: 35 `<Head>`
blocks of 3 channels each, `<Layout Width="35" Height="1"/>`. No file in the corpus is exactly
that (closest is this 16-pixel bar), so — same as GDTF, same as OFL — **a per-pixel WLED/DIY
tube profile does not exist ready-made in QLC+ either**; it would need authoring. What QLC+
offers is a well-trodden, simple pattern to author it against, with no ambiguity about what a
"Head" means (a list of DMX-offset channel indices, nothing more).

**What `<Head>`/`<Layout>` cannot do:** no per-cell 3D or even 2D coordinate exists — `Layout`
is a grid *size*, not a set of positions, and there is no equivalent of OFL's `pixelGroups` for
naming/selecting subsets. A curved or non-rectilinear run of pixels (a ring, an L-shape) has no
representation beyond "this many heads, arranged W×H" — the renderer would still have to assume
linear spacing.

**Independent confirmation that this mapping is real and load-bearing**, not a guess: OFL's own
official QLC+ export plugin (`plugins/qlcplus_4.12.2/export.js`, `OpenLightingProject/open-fixture-library`)
converts OFL's `Matrix` directly into this shape — `Layout: { Width: pixelCountX, Height:
pixelCountY * pixelCountZ }` (line ~426) and one `<Head>` per pixel key, ordered X/Y/Z, each
listing the channels that control it (`addHeads()`, line ~504). OFL's maintainers already treat
QLC+'s Head+Layout as the correct target shape for their own richer Matrix concept — this is
not a novel mapping Beamhouse would be inventing.

### OFL

The schema genuinely declares what QLC+ only enumerates. `matrix.json` (fetched 2026-09-01):
`pixelCount: [x,y,z]` (grid dimensions) or `pixelKeys` (a `[z][y][x]` nested array of string
keys, allowing gaps via `null` and non-rectangular layouts). `fixture.json:187-192` adds
`physical.matrixPixels.{dimensions,spacing}`, both `dimensionsXYZ` — **real millimetre values**
(`definitions.json:50-59`: `"width, height, depth (in mm)"`). So an OFL matrix fixture can
express real 3D pixel spacing, not just a logical grid — grid index × mm spacing reconstructs
actual positions, something neither GDTF (in practice, per above) nor QLC+ can do at all.

Channel expansion is declarative, not inferred: `fixture.json:284-330` defines a mode-channel
`insert:"matrixChannels"` block with `repeatFor` (`"eachPixelXYZ"` or an explicit pixel-key/group
list) and `templateChannels` (channel names containing a `$pixelKey` placeholder). A real,
currently-published fixture demonstrates the exact target shape for the per-pixel strip class:
`fixtures/chauvet-dj/colorband-pix.json` (fetched 2026-09-01) is a 12-pixel RGB bar whose
**36-channel** mode is
```json
{ "insert": "matrixChannels", "repeatFor": "eachPixelABC",
  "channelOrder": "perPixel", "templateChannels": ["Red $pixelKey","Green $pixelKey","Blue $pixelKey"] }
```
— structurally identical to what a 105-channel, 35-pixel WLED tube definition would be, just
at 1/3 the pixel count. This is the closest thing found in any of the three libraries to the
actual target fixture shape, and it is a real, shipping definition, not a hypothetical.

**The consequence the coordinator asked about, stated plainly: yes, OFL's schema dissolves the
strip-detection heuristic — for fixtures whose definition uses it.** `matrix.pixelKeys` plus
`repeatFor`/`templateChannels` is a *declaration* of which channels belong to which pixel and in
what order; a renderer reading it never has to infer "is this a strip" from geometry, because
the definition already says "these are pixels 1..35 of one matrix." Ticket #8 (the
collinear-GeometryReference strip-detection heuristic) becomes unnecessary for any fixture
sourced this way — the heuristic is replaced by "does this mode contain a `matrixChannels`
insert," a structural check, not an inference. This is the single strongest concrete point in
OFL's favour, and it lands on exactly the fixture class GDTF has no working profile for.

**The caveat that must accompany that verdict.** This is true of the *schema*; it is emphatically
**not** true of Mizer's *reference implementation*, which is what #13 leans on for "Mizer already
supports it, so it's as legitimate a patch source as `gdtf:`." Comparing the live schema against
Mizer's Rust types turns up two concrete mismatches:

1. **The `Matrix` field is parsed and then never used.** `OpenFixtureLibraryFixtureDefinition.matrix:
   Option<Matrix>` (`open-fixture-library/src/lib.rs:141`) is deserialized from JSON, but the
   `From<OpenFixtureLibraryFixtureDefinition> for FixtureDefinition` conversion (`lib.rs:357-382`)
   never reads `def.matrix` — it is dropped on the floor. Mizer instead derives pixel grouping
   from a flat, per-channel `pixel_key: Option<String>` string field (`lib.rs:188`) that **does
   not exist anywhere in the current OFL schema** (`channel.json`, checked directly — no
   `pixelKey` property on the channel object). The real mechanism, confirmed against the live
   `colorband-pix.json` fixture above, is the mode-level `insert:"matrixChannels"` block, which
   Mizer's `Mode.channels: Vec<Option<String>>` (`lib.rs:312`) cannot represent — that field
   requires every mode-channel entry to deserialize as a plain string or null, and a
   `matrixChannels` insert is a JSON *object*. This is a strong inference from comparing the
   Rust types against the schema and a real fixture file, not something executed end-to-end;
   flagged as unconfirmed-by-execution in §7, but the type mismatch itself is not in question.
2. **Colour-channel grouping compares against the wrong string shape.** Mizer's colour constants
   are hex strings — `COLOR_RED = "#ff0000"` etc. (`lib.rs:12-19`), matched via `Capability::
   ColorIntensity{color} if color == COLOR_RED` (`lib.rs:658-681`). But the live schema's
   `ColorIntensity.color` is a **named enum** — `"Red","Green","Blue",...,"Warm White","Cold
   White"` (`capability.json:171-186`) — never a hex code. Every real OFL fixture's RGB/RGBW
   channels would therefore fail this match and fall through to `controls.generic` (`lib.rs:
   724-727`) instead of being recognised as a colour mixer. Mizer's own unit tests
   (`lib.rs:754-971`) construct `Capability::ColorIntensity{color:"#ff0000".into()}` directly —
   i.e. the tests encode the same (incorrect, vs. the live schema) assumption they're checking,
   the same "passes vacuously against non-representative data" pattern DESIGN.md §5.0 already
   flagged for the GDTF provider's tests.

Net: OFL's *format* is the right shape for the strip class and is demonstrably compatible with
QLC+'s own format (§ above) and with GDTF's `GeometryReference` (OFL's own importer proves it).
Mizer's *implementation* of that format is not proven for this fixture class — Beamhouse's own
TypeScript OFL reader would need to be written against the live `matrix.json`/`fixture.json`
schema and the `colorband-pix.json`-style fixtures directly, not by porting Mizer's Rust logic.

---

## 3. A common internal model

### 3.1 Sketch

If Beamhouse resolves more than one format, every resolver converges on one shape before the
renderer sees it. A minimal sketch, informed by what's actually recoverable per §1/§2:

```ts
interface ResolvedFixture {
  id: string;                 // "gdtf:<fixtureTypeId>" | "qlc:<mfr>:<model>" | "ofl:<mfr>:<key>"
  manufacturer: string;
  name: string;
  physical?: {
    dimensionsMm?: [number, number, number];   // GDTF: unparsed anywhere; QLC+: present, unused by Mizer; OFL: present, used
    beamAngleDeg?: [number, number];           // QLC+ Lens; OFL BeamAngle/lens; GDTF Beam geometry (no numeric field)
    panRangeDeg?: [number, number];            // QLC+ Focus; OFL Pan capability
    tiltRangeDeg?: [number, number];
  };
  channels: ChannelBinding[];   // per-channel: attribute, dmx offset(s), physical interpolation if any
  geometry:
    | { kind: "mesh"; source: "gdtf-glb"; ref: string }        // only ever from GDTF, and only if the profile ships one
    | { kind: "primitive"; shape: "cube"|"cylinder"|"sphere" }  // the honest default
    | { kind: "user-glb"; ref: string };                        // §6 — supplied outside the fixture definition entirely
  pixels?: {
    order: string[];                 // pixel keys in emission order — from OFL matrix+repeatFor, or hand-derived for QLC+ Head, or GeometryReference order for GDTF
    spacingMm?: [number, number, number]; // only ever from OFL physical.matrixPixels.spacing
    channelsPerPixel: ChannelBinding[][];
  };
}
```

`pixels` is deliberately separate from `geometry` — nothing in any of the three formats ties a
pixel's *position along the strip* to the strip's *3D placement in the room*; that binding is
supplied by Beamhouse's own placement layer (DESIGN.md §4.4/§4.5), same as it already does for
whole-fixture position.

### 3.2 What each format leaves null

- **GDTF** leaves `pixels` null unless the strip-detection heuristic (#8) is built and a
  positioned-`GeometryReference` reference implementation exists to feed it (neither exists
  today, per §2 and #2/#3). `geometry` can be a real mesh *only* for the ~62% of the rig with a
  confirmed profile (#2) — and even then only once `gdtf-ts` implements the geometry-tree walk
  DESIGN.md §5.0 confirms has zero prior art. `physical` is null in practice today (Mizer parses
  it as an empty struct) even though the *format* has the data.
- **QLC+** leaves `geometry` structurally null forever — there is no path from `.qxf` to a mesh,
  the format has no field for one. `pixels[].order` has to be reconstructed by hand from `<Head>`
  channel lists (straightforward, since Head order is already the emission order); `spacingMm`
  is always null (Layout is a size, not a spacing).
- **OFL** leaves `geometry` structurally null forever, same as QLC+. `pixels` is the one thing
  it does *not* leave null when the definition uses `matrix`/`templateChannels` — order, count,
  and physical spacing are all present. Pan/tilt pivot *location* (as opposed to sweep range) is
  null in all three formats, with no exception.

### 3.3 Is Mizer's `FixtureDefinition` worth mirroring?

**Verdict: mirror the pattern, not the type.** Reading it directly
(`Mizer/crates/components/fixtures/src/definition.rs:14-22, 30-36, 962-972`):

```rust
pub struct FixtureDefinition { id, name, manufacturer, modes, physical: PhysicalFixtureData, tags, provider }
pub struct PhysicalFixtureData { dimensions: Option<FixtureDimensions>, weight: Option<f32> }
pub struct SubFixtureDefinition { id: u32, name: String, controls, color_mixer }
```

`PhysicalFixtureData` carries only dimensions and weight — no beam angle, no pan/tilt range, no
lens, nothing DESIGN.md's Physical row in §1 needs; those live instead as ad hoc fields on
specific `Capability` variants (`AxisGroup.angle: Option<Angle>` — degrees, only populated by the
OFL provider today, see §1). `SubFixtureDefinition` has **no position field of any kind** — not
even the 2D grid coordinate OFL's own `Matrix.pixelKeys` would give it — so even a
schema-correct OFL reader built on this type could not carry pixel spatial layout through to a
renderer without extending the type. There is no geometry/mesh field anywhere in the crate, for
the simple reason that Mizer is a console — it drives DMX, it does not render a room — so it has
never needed one.

This is the right call to make explicit for #13: Mizer's `FixtureDefinition` is a **patch/DMX
abstraction**, correctly shaped for "what fader controls what," and it is missing precisely the
three things a visualiser's common model most needs — a spatial pixel layout, a beam-angle/
pan-tilt-range physical block that actually gets populated (today only OFL's provider populates
even the fields that exist), and any geometry concept at all. The *pattern* worth reusing is
real and cheap to take: three independent provider structs each converting into one shared shape
via a `From` impl, id-namespaced by provider prefix (`gdtf:`/`qlc:`/`ofl:`) so a patch file's
fixture ids are self-describing about their source (exactly what `mizer-shows/OBF26_Bunte-Stube.yml`
already does for `qlc:GLP:impression 90 RGB` etc. — DESIGN.md §4.2). The *type itself* is not
worth adopting wholesale; Beamhouse's `ResolvedFixture` (§3.1) needs to be a superset of it from
day one, not a type Beamhouse would grow away from later.

---

## 4. Library coverage & licensing

| | GDTF | QLC+ | OFL |
| --- | --- | --- | --- |
| Local availability | 0 files (account-gated, #12) | **1710** `.qxf` in `/usr/share/qlcplus/fixtures/` (installed qlcplus 5.2.1-1 package) | 0 files locally; public git repo |
| Upstream size | Unknown — gated behind GDTF Share login (#2) | Same 1710, shipped inside the `qlcplus` source tree (`resources/fixtures/`) | **635** fixture JSON files across **133** manufacturer directories, `OpenLightingProject/open-fixture-library` git tree at `master`, counted directly via the GitHub API 2026-09-01 (not truncated) |
| Licence | GDTF spec itself is an open standard (DIN SPEC / MVR-GDTF consortium); individual profile files' licence is set by whoever authored them and is not machine-checkable in bulk | **Apache-2.0** for the whole `qlcplus` project — confirmed both by the installed Arch package metadata (`pacman -Qi qlcplus`: `Licenses: Apache-2.0`) and by the licence header in the engine source itself (`engine/src/qlcphysical.h:8-14`) | **MIT** — `OpenLightingProject/open-fixture-library` repository licence (GitHub API `license.spdx_id: MIT`), copyright Florian & Felix Edelmann |
| Vendorable into this repo? | No — would require per-file redistribution rights not established, and there are zero files to vendor regardless | **Yes.** Apache-2.0 is compatible with the MIT/Zlib/Apache-2.0 stack DESIGN.md §12 already depends on; the 1710-file local corpus (or the upstream `resources/fixtures/` tree) could be vendored directly, attribution preserved per Apache-2.0 §4 | **Yes.** MIT is maximally permissive; the git repo (or a `fixtures/` subset) is directly vendorable |
| Distribution/update mechanism | Manual download per profile via GDTF Share's REST API (#2); no bulk mechanism confirmed | Ships with the QLC+ install; upstream updates by pulling the `qlcplus` repo or its release tarball | Plain git clone/pull of `OpenLightingProject/open-fixture-library`; also has a published npm-consumable export (used by other tools) |
| Overlap with the reference rig | Per #2: at most 8/13 fixtures plausibly present, 5/13 confirmed absent, none independently confirmed present (account-gated) | **13/13** — the entire OBF26 rig is already patched against `qlc:` ids (DESIGN.md §4.2); but note the WLED entries are the effect-mode fixture, not the per-pixel target (see scope correction above) | Not checked fixture-by-fixture; GLP and American DJ both have OFL manufacturer entries in general use, but no confirmation was done here that `impression-90-rgb` or `fog-fury-jett` specifically exist in the 635-file set — **flagged as undetermined**, §7 |

The licensing question the ticket specifically asked to flag is straightforward: unlike GDTF
Share (account-gated, ToS on scripted access unconfirmed per #2), **both QLC+'s fixture library
and OFL's fixture library can be vendored into this repository outright**, under licences
already compatible with Beamhouse's existing dependency stack.

---

## 5. Converters

| Direction | Exists? | Evidence |
| --- | --- | --- |
| QLC+ → GDTF | No (established by #2) | — |
| **GDTF → QLC+** (the reverse, checked here) | **No.** | `GDTF` appears **zero times** anywhere in the `mcallegari/qlcplus` source tree — confirmed via GitHub code search (`gh api "search/code?q=GDTF+repo:mcallegari/qlcplus"` → `"total_count":0`, 2026-09-01). QLC+ can neither import nor export GDTF. |
| OFL → QLC+, QLC+ → OFL | **Yes, both directions, officially maintained.** | `plugins/qlcplus_4.12.2/` in `OpenLightingProject/open-fixture-library` contains both `import.js` and `export.js`. The export side is the one demonstrated in §2 (`Matrix` → `Layout`+`Head`). |
| GDTF → OFL | **Yes, import only.** | `plugins/gdtf/import.js` in the same repo — the `GeometryReference`-to-`matrixChannels` logic cited in §2. No `export.js` exists in that plugin directory, so OFL cannot produce GDTF, consistent with #2's finding that nothing in this ecosystem exports GDTF. |
| OFL → GDTF | No | Absence of `export.js` in `plugins/gdtf/`, as above. |

**The practical consequence for #13's option 5 ("does moving off QLC+ still hold?"):** OFL is
the only format in this whole matrix with a *maintained, bidirectional* bridge to QLC+. If
Beamhouse ever wanted to batch-convert the remaining `qlc:` entries in
`OBF26_Bunte-Stube.yml` toward a second format instead of hand-authoring each one, OFL's
`qlcplus_4.12.2` import plugin is a real, working starting point; nothing equivalent exists for
GDTF in either direction.

---

## 6. Quantifying the geometry gap, and a "bring your own model" alternative

### 6.1 What proxy geometry actually costs

Per §1, only GDTF has any geometry concept, and per DESIGN.md §5.0 that concept is unimplemented
in the one available reference. So in practice, **today, all three formats produce
`PrimitiveType`-class proxy geometry for every fixture** — DESIGN.md §9.2 already plans for
this as the shared-link fallback; per #2 it is closer to Beamhouse's primary v1 render path.

What a `<Physical>`/`physical` block (QLC+ or OFL) buys a proxy fixture, concretely:

- **Right bounding box.** Dimensions in mm → a correctly-sized cube/cylinder instead of a
  guessed one.
- **Right beam cone.** `Lens.DegreesMin/Max` (QLC+) or `lens.degreesMinMax`/`BeamAngle` (OFL) →
  the cone angle DESIGN.md §8.2 drives from `Zoom` is bounded correctly even without a real
  fixture body. **[corrected 2026-09-02 — #28]** this read *half*-angle; all three formats carry
  the **full** angle — the impression 90's QLC+ `<Lens DegreesMin="10" DegreesMax="10"/>` is
  GLP's published 10° beam — so the converged fixture model's cone angle is a full angle whatever
  it was read from ([ADR-0013](../adr/0013-atmosphere-is-one-closed-form-scattering-term.md)).
- **Right sweep.** `Focus.PanMax/TiltMax` (QLC+) or `Pan`/`Tilt` capability angle ranges (OFL) →
  the gizmo/placement UI can clamp to a fixture's real range instead of assuming 540°/270°
  defaults.
- **Right colour.** All three carry enough colour-channel info for correct RGB.

What it does **not** buy, and no proxy scheme fixes: **silhouette**. A GLP impression 90 RGB is
a roughly cubic yoke head; a generic cube proxy at the right bounding-box size and beam angle
is close enough to read correctly across a room, at showback-photo distance — this is a
genuinely small visual cost for the mover class, which is why DESIGN.md already treats
`PrimitiveType` as "schematic but correct." The cost is not zero, but it is bounded and roughly
constant across all three formats, because none of them fixes the geometry gap for a real mover
— only downloading an actual GDTF mesh would, and per #2 that is unconfirmed/unavailable for
this rig's movers anyway.

### 6.2 "Bring your own model" — a fourth option the ticket didn't originally consider

The user has CAD models of the actual physical fixture that matters most for the strip class:
`~/git-projects/build123d/build123d-models/models/led_profiles/` (a parametric build123d model
of the DIY LED-tube fixture, with `assemblies/{standing,suspended,triangle}.py` for the three
mounting rigs actually in use) and its exports, including
`exports/led_profiles.printable.glb` (1.9 MB) plus per-part GLBs
(`led_profiles.stand.glb`, `led_profiles.endcap.glb`, `led_profiles.corner.glb`, …) — **150
`.glb` files total** in that tree. GLB is exactly the format GDTF ships in `models/gltf/` and
exactly what three.js's `GLTFLoader.parse()` consumes directly from an `ArrayBuffer`
(DESIGN.md §5.1) — no conversion step.

This is not a fixture-*definition* format at all — it is a separate mesh, supplied outside
whichever of GDTF/QLC+/OFL provides the channels and physical data, and wired together per
fixture type in the `.bhs` file (extending the pattern DESIGN.md §4.5 already uses for
`emitters: { diy_t8_35px: { kind: "strip", pixels: 35 } }` — a `model: "led_profiles.printable.glb"`
key alongside it is a small, consistent extension).

**Cost comparison, for the strip class specifically:**

| Path | Channel/physical source | Mesh source | New code needed |
| --- | --- | --- | --- |
| Author a GDTF profile from scratch | Hand-authored `.gdtf` (XML+zip) | Export from build123d as GLB, embed in the zip's `models/gltf/` | `gdtf-ts` geometry-tree walker + `GeometryReference` expansion (DESIGN.md confirms **zero** prior art for both, §5.0) |
| Author a QLC+ or OFL profile + bring-your-own-GLB | Hand-authored `.qxf` (§2 pattern) or OFL JSON (§2 `colorband-pix.json` pattern) — both simpler formats, both with worked examples above | Same GLB, loaded directly by `.bhs` reference, no zip/embedding step | A `.bhs` `model:` binding (small, additive to existing planned work) + reusing the already-planned `GLTFLoader.parse()` call (§5.1) — **no geometry-tree walker needed at all**, because the mesh is not derived from the fixture definition |

Bring-your-own-model is strictly cheaper for the strip class: it needs less new code (no
geometry-tree walker, no `GeometryReference` expansion for the *mesh* — pixel *channel*
expansion is still needed, per §2, but that's authoring-format-shaped work, already required
regardless of geometry) and produces a **real, accurate** mesh instead of a proxy, using an
asset that already exists.

**What is genuinely lost versus a real GDTF geometry tree**, and should not be glossed over:

- **No axis hierarchy, ever.** A GLB from build123d is one static mesh (or a flat hierarchy of
  print-part meshes glued at fixed transforms) — it has no concept of "this sub-mesh rotates
  around this axis for Pan, this one for Tilt." GDTF's geometry tree encodes exactly that via
  nested `Axis` geometries (DESIGN.md §5.1). Bring-your-own-model is a complete non-starter for
  the mover class (GLP impression 90 RGB) for this reason — there is no user CAD model of that
  fixture, and even if there were, static GLB has nowhere to put pan/tilt articulation. This path
  only closes the gap for **rigid, non-articulated** fixtures — which the strip class is, and the
  fogger and dimmer packs are too, but the six movers are not.
- **No pivot location even for what little articulation `<Focus PanMax/TiltMax>` implies.**
  As §1 and §3.2 note, none of the three *definition* formats give a pan/tilt pivot's location
  in space either — so this is not a regression bring-your-own-model introduces, but it means
  the gap cannot be closed by combining a QLC+/OFL profile with a GLB; the pivot location would
  need to be authored by hand regardless of geometry source, the same way DESIGN.md §4.5
  overrides already handle position/rotation per fixture.
- **Vertex budget and up-axis/scale conventions are the author's problem now**, not a spec's.
  GDTF's 1200-vertex default-LOD cap (DESIGN.md §5.1) is a convention Beamhouse would have to
  impose on its own build123d exports rather than inherit from a schema.

### 6.3 Net assessment

For the fixture class that matters most (per-pixel strips, per the coordinator's scope
correction) and that GDTF cannot serve today (#2), bring-your-own-GLB plus a QLC+ or OFL profile
for channels/physical is cheaper and more accurate than authoring a GDTF profile from scratch,
and does not require building the one piece of `gdtf-ts` (geometry-tree walking) that has zero
prior art anywhere Beamhouse can reuse. It does not help the mover class at all, which still
needs either a real downloaded GDTF mesh (unconfirmed availability, #2) or a proxy
(§6.1 — a bounded, acceptable cost).

---

## 7. What could not be determined

- **Whether GLP impression 90 RGB or American DJ Fog Fury Jett have OFL entries.** Manufacturer-
  and fixture-level search across the 635-file OFL corpus was not performed; only the total
  count and one representative pixel-bar fixture (`colorband-pix.json`) were checked directly.
- **Whether Mizer's OFL `matrix`-field-dropped and colour-hex-mismatch findings (§2) actually
  cause a load failure versus a silent partial-parse**, in the running Mizer binary. This is a
  strong inference from comparing Rust type definitions against the live JSON Schema and one
  real fixture file — not something executed end-to-end against Mizer's own test suite or a
  built binary. The type-level mismatch itself (`Mode.channels: Vec<Option<String>>` cannot
  represent a `matrixChannels` insert object; `COLOR_RED = "#ff0000"` cannot match a `"Red"`
  enum value) is not in question; the *runtime consequence* (whole-file load error vs. one
  fixture skipped vs. malformed-but-loaded) is inferred, not observed.
- **Whether Mizer bundles a pre-converted/older snapshot of OFL data.** Its loader expects one
  JSON file per manufacturer containing an array under a `fixtures` key — not the live OFL
  repo's one-file-per-fixture layout. This was not established. If Mizer ships its own converted
  bundle, generated from an older OFL schema version, that would explain (and slightly soften)
  the mismatches above without changing the conclusion that Beamhouse cannot safely copy Mizer's
  OFL Rust logic wholesale.
- **GDTF Share's actual current holdings** — unchanged from #2's findings; not re-investigated
  here since #2 already covers it exhaustively and this ticket's job was the QLC+/OFL side.
- **ToS on vendoring QLC+'s specific fixture files** beyond the project-level Apache-2.0 grant —
  not all 1710 files necessarily carry individually-compatible contributor licensing (community
  contributions to an Apache-2.0 project are conventionally under the same licence, but this was
  not verified file-by-file).
- **Whether OFL's `qlcplus_4.12.2` export/import plugin round-trips cleanly for fixtures
  authored against the newer QLC+ 5.2.1 `.qxf` schema** (the plugin name pins it to 4.12.2) —
  not tested; QLC+'s `.qxf` format has not obviously grown new required fields since (`Head`,
  `Layout`, `Physical` all appear unchanged in the 5.2.1 corpus surveyed here), but this is
  inference, not a round-trip test.

---

## Recommendation for #13

**Resolve GDTF and OFL both; do not add QLC+ as a resolved runtime format; keep "move off QLC+"
as the goal it already is.**

- **GDTF stays, for the mover class**, because it is the only format with any geometry-tree
  concept at all, and per #2 roughly half the rig plausibly has a real profile. Nothing in this
  research changes that.
- **Add OFL as a second resolved format**, specifically for the pixel-strip class. §2 shows its
  schema is the only one of the three that *declares* pixel layout and channel repetition
  instead of requiring it be inferred (GDTF) or hand-enumerated with no spatial semantics
  (QLC+), and §5 shows it is the only format with a maintained bidirectional bridge to QLC+
  (useful if the remaining rig ever needs batch conversion rather than one-by-one authoring).
  Build Beamhouse's own minimal OFL reader against the live schema and the `colorband-pix.json`-
  style fixtures (§2), not against Mizer's Rust provider — that provider's `matrix`/colour
  handling does not match the current schema (§2, §7) and should not be treated as validated
  prior art for this specific fixture class, even though it is fine prior art for simple
  non-matrix OFL fixtures (a generic RGB par, a simple wash) where none of the mismatches apply.
- **Pair the pixel-strip class with bring-your-own-GLB (§6)**, using the user's existing
  build123d exports, rather than trying to author a GDTF profile with a from-scratch geometry
  tree for a fixture class that has zero reference implementation for exactly that half of the
  work (DESIGN.md §5.0). This is the cheapest path to *correct* strip geometry, not just correct
  channels.
- **Reject: QLC+ as a third resolved runtime format.** It is the best-covered library locally
  (1710 files, the entire rig already patched against it) and it is genuinely vendorable
  (Apache-2.0), but §1–§3 show it structurally cannot carry more than GDTF-proxy-equivalent
  data — no geometry ever, no physical spacing for matrices ever, no colour space, and its own
  maintainers (via OFL's export plugin) already treat it as a *simpler, derived* shape of OFL's
  matrix concept rather than a peer. Every capability QLC+ has that matters for a visualiser
  (Physical dimensions, Lens beam angle, Focus pan/tilt range, Head/Layout matrix) is also
  present in OFL, in a strictly richer form (mm spacing, declarative channel repetition, JSON
  instead of a bespoke XML dialect needing a hand-rolled parser). Resolving it natively buys
  nothing OFL doesn't already cover for the classes that need a second format, at the cost of a
  third parser and a third id-namespace to maintain. **Its actual value to Beamhouse is as a
  one-time migration source** (via `qlc:` ids already in `OBF26_Bunte-Stube.yml`, hand-converted
  or OFL-plugin-assisted into `gdtf:`/`ofl:` profiles), not as a format the running app resolves.
- This does change what "generic" means in Goal #1 (#13's question 3): "any rig, from an MVR
  file plus GDTF **or OFL** profiles" — MVR itself has no opinion on which definition format a
  fixture's spec-file reference points to, so this is additive, not a rewrite of the MVR path.
- This does soften ticket #8 (#13's question 4): for any fixture whose profile is sourced from
  OFL, the collinear-GeometryReference strip-detection heuristic is unnecessary (§2) — it is
  still needed for any fixture that stays on GDTF and happens to be a pixel matrix, which per
  #2 has no working real-world example anyway, so in practice #8 becomes lower-priority rather
  than eliminated outright.
