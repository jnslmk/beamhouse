# Beamhouse

A live GDTF/MVR lighting visualiser: a browser app, a 150-line bridge, and nothing else.

|          |                                        |
| -------- | -------------------------------------- |
| Status   | design, pre-code                       |
| Target   | TypeScript · WebGL2 · Linux            |
| Drivers  | Mizer · BlinderKitten · gled2 · WLED    |
| Estimate | ~2 weeks of evenings                   |

> **Verification note (2026-08-31).** Claims about Mizer, gled2 and BlinderKitten in this
> document were checked against the local clones in `~/git-projects/`. Four claims in the
> original draft were wrong; they are corrected inline and marked **[corrected]**.

## 01 · Goals and non-goals

Beamhouse exists because Mizer ships no visualiser, and because programming a busked show at
home without the rig hung is where most of the hours go. It is a working instrument, not a
previz package.

### Goals

- **Generic.** Any rig, from a patch source plus **GDTF or OFL** definitions. No hard-coded
  fixtures. MVR has no opinion about which definition format a fixture's spec reference
  points at, so the second format is additive rather than a change to the MVR path.
  See [ADR-0001](adr/0001-gdtf-and-ofl-as-definition-formats.md).
- **Fast to open.** Under two seconds to a rendered rig. You will open it fifty times a night.
- **Editable while running.** Move a fixture, repatch, reload a GDTF — without restarting
  anything or losing the live connection.
- **Two fixture classes done well.** Volumetric beams for movers; continuous emissive strips
  for pixel tape. These are *rendering* classes, not fixture models: anything with a GDTF
  `Beam` geometry is class one; a pixel run grouped by constant DMX offset stride is class two,
  in its 1D (strip) or 2D (matrix) form. Grouping is *not* by even spatial spacing — real
  definitions are not evenly spaced (ADR-0005). New
  lamps land in one bucket or the other without new code.
  **Strips are per-pixel only** (decided 2026-08-31): the tubes are driven per pixel, via gled2
  or WLED's virtual per-pixel DMX output. See the effect-mode exclusion below.
- **Unmetered.** Any number of universes, any pixel count, no tier. A fixture is addressed
  **per break** and may therefore span universes ([ADR-0011](adr/0011-a-fixture-is-addressed-per-break.md)) —
  the STAR-TENT's 230 pixels are 690 slots across two universes and that is a normal rig, not an
  edge case. **[added 2026-09-02]** Stated as a goal because the paid field prices exactly this:
  Capture meters universes per edition, from one at €395 to unlimited at €2,195, with the limit
  reaching into documentation; ETC's Eos cannot build a multi-cell fixture from a GDTF import at
  all. Pixel-heavy DIY rigs are the case the market serves worst.
- **Shareable.** Live over LAN or a tunnel; or as a static bundle anyone can open later, with
  no bridge running. **[sharpened 2026-09-02]** No product surveyed lets a third party open a
  link and watch a rig move — Vectorworks Cloud's Web View is the nearest and is static geometry
  on a two-week expiry. This is the only capability in the design with no competitor, which is
  why §10 no longer leaves it to the end.
- **Coexists.** Runs on the same laptop as the console without fighting over ports or GPU.
  Assumes the console *is* on this laptop; #33 asks whether that stays true.

### Not in v1 — but do not architect them out

Deferred, not excluded. Concrete consequences are in §8: the beam shader is written as a
density function so haze can raymarch it later, the beam material carries a projective texture
slot from day one so gobos drop in, and tone mapping is on from the start so a high-quality
tier is a switch rather than a rewrite.

- Higher-fidelity rendering. PBR is free from glTF; the missing pieces are haze, soft shadows,
  and a slower "render" tier.

  **[under review 2026-09-02 — #28]** The atmosphere half of this tier may not belong in it. A
  beam in clean air is invisible; what you see in a room is scattering off particulate, so a cone
  with no atmosphere term reads as a diagram of a beam rather than a beam. It is also the whole
  field's headline: Capture 2026's is that smoke now *absorbs* all light, DMXpressions leads with
  a physics-simulated atmosphere, Showcase 2026 added animated fog. #28 grills whether a
  **constant-density single-scattering term** — closed-form for a cone, one integral in the same
  fragment shader, no raymarch and no second pass — lands in v1 while absorption, volumetric
  shadows and the render tier stay deferred. Recommendation there is yes, validated at M6.
- Gobos, prisms, framing shutters. GDTF carries wheel media in the same zip.
- The agent surface — a fourth feed implementation injecting state directly. Undecided
  for v1.

### Genuinely out of scope

- **WLED effect mode, as a render source.** `~/.qlcplus/fixtures/WLED-SegmentEffect.qxf` is 18
  channels of *effect parameters* — `Segment Opacity`, `Effect`, `Effect Speed`, `Palette` — and
  the OBF26 show patches four tubes that way. v1 assumes **per-pixel drive** (gled2, or WLED's
  virtual output) and does not visualise effect-mode output.

  **[corrected 2026-09-01]** The original reason — WLED computes pixels on-device, so the data
  never crosses the wire — is **false**. WLED's **Live LED Stream** (send `{"lv":true}` on
  `ws://[node]/ws`) hands the computed buffer straight back, at most one binary frame every
  40 ms. The exclusion stands on entirely different grounds, settled in #18 by reading
  `wled00/ws.cpp`:

  - It needs the **node powered and on the rig network** — precisely the case Beamhouse exists
    to cover *without*. If the tent is lit you can look at the tent.
  - It is **not the device's output**: `bri ? qadd8(w, r) : 0` reads the segment buffer *before*
    master brightness, so it shows full value at 1% and black only at zero.
  - White is folded by **saturating addition**, not colorimetry — it clips on an RGBW node, and
    arrives outside the one seam ADR-0008 allows colour to be minted at.
  - It **downsamples** above 256 LEDs (ESP8266) or 1024 (ESP32), serving every n'th LED.
  - **One client only**: `wsLiveClientId` is a single id, so opening Peek in WLED's own web UI
    silently starves whoever had it.
  - `ws://` only, so it can never work from the Pages deployment (§9.4).

  What survives is that `strip.getPixelColor()` reflects **any** input source, E1.31 and Art-Net
  included — which makes the stream a **conformance oracle** for the strip class rather than a
  feature. See the prototype ticket on the map.
- Paperwork, plots, patch sheets.
- **MVR-xchange.** **[split out 2026-09-02 — #30]** It was sharing a bullet with paperwork and
  does not belong there. Paperwork is a feature Beamhouse declines; MVR-xchange is the
  **interoperability floor the rest of the ecosystem has agreed on** — a network protocol that
  pushes scene changes between tools, live as of 2026 in grandMA3, BlenderDMX, Vectorworks 2026,
  Production Assist, zactrack and DMXRouter.

  It stays out of v1 because **Mizer has no station on the other end** (§4.1: zero `mvr` across
  every `.rs`, `.toml` and `.proto`), because watching the project YAML is a strictly better
  mechanism for this pair — no export step, no discovery — and because accepting pushed scene
  files would give the bridge a trust boundary it currently does not have on a network it does
  not own.

  **The ceiling that buys is explicit:** Beamhouse can be half of the Mizer pair and cannot
  appear in a multi-tool room. §4.3's MVR *file* import is now the legacy path rather than the
  current one. #30 settles the wording and whether the patch reader gets a defined source
  interface; #33 asks the prior question, since the "no station" argument holds only while
  Mizer is the only console — and #30 is blocked on it.
- **Being a control surface. Beamhouse never sends DMX.** Mizer is the control surface;
  Beamhouse is the preparation visualiser. The pair is the product.
- **QLC+ as a *resolved runtime* format.** Settled in
  [ADR-0001](adr/0001-gdtf-and-ofl-as-definition-formats.md): Beamhouse resolves **GDTF and OFL**,
  not QLC+. Every capability QLC+ has that matters to a visualiser is present in OFL in a strictly
  richer form, so a third parser and a third id namespace buy no coverage. QLC+'s value is as a
  **one-time migration source** for the rig already patched against `qlc:` ids. Note this is
  separate from moving off QLC+ the *application*, which was never in question.
- White-channel resolution. WLED computes its own whites, and the movers are RGB. Treat every
  emitter as RGB; see §8.3 for the seam where RGBW/RGBCCT slots in later.

## 02 · Architecture: what the bridge is actually for

Worth answering directly, because it determines the shape of everything else.

A browser cannot open a UDP socket or join a multicast group. That is the only thing a native
process is required for. Unzipping, XML parsing, GDTF resolution, glTF loading, rendering,
recording — the browser does all of it perfectly well.

So the native part is a **bridge**, not a sidecar: it joins the sACN multicast groups and
forwards raw universe buffers over a WebSocket. Roughly 150 lines. It knows nothing about
fixtures, GDTF, or the scene, and once written it never changes again.

```
native                 browser                    browser
Bridge                 Engine                     Renderer
sACN multicast join    MVR + GDTF parse           three.js + WebGL2
raw universes → WS     DMX → attributes           GLTFLoader from zip
~150 LOC, static bin   scene + persistence        beam & strip shaders
```

### Why this beats a fat Rust sidecar

- **Edit while running.** All the interesting logic is TypeScript behind Vite HMR. Change the
  resolution code and the page updates with the socket still connected.
- **It becomes a real static site.** Drag an MVR onto the page and it works with no server at
  all. That is the sharing story in §9, for free.
- **No marshalling layer.** A fat sidecar needs a schema, a serialiser, and TS types mirroring
  Rust types — pure overhead.
- **Models load without a round trip.** `GLTFLoader.parse()` takes an ArrayBuffer straight from
  the unzipped GDTF.

### What you give up

The `gdtf` Rust crate. You will write GDTF parsing in TypeScript instead: `fflate` to unzip,
`DOMParser` for the XML, then your own object model. Unglamorous, not hard — and you were
writing the resolution half by hand in either language, which is the part gdtf-rs explicitly
declines to provide. **See §5.0: Mizer has already solved this in Rust without the crate, and
that code is the reference.**

Bandwidth sanity check: four universes at 512 bytes, 30 Hz, is 61 KB/s. Forwarding raw DMX
costs nothing, so there is no argument for resolving server-side.

**Status: locked.** The architecture is not an open question.

## 03 · Repository layout

```
beamhouse/
├─ bridge/              # bun workspace package. TypeScript, isolated linker.
│   └─ src/main.ts      # sACN + Art-Net → WebSocket (ADR-0006)
├─ packages/
│  └─ gdtf-ts/          # standalone; publishable is an open question (§11)
│      ├─ zip.ts        # fflate wrapper, lazy entries
│      ├─ parse.ts      # description.xml → object model
│      ├─ geometry.ts   # tree walk → flat nodes + transforms
│      ├─ mode.ts       # DMX mode → channel bindings
│      ├─ pixels.ts     # GeometryReference expansion
│      └─ models.ts     # GLB entry → ArrayBuffer
├─ src/
│  ├─ mvr.ts            # MVR scene reader
│  ├─ scene.ts          # rig state, overrides, persistence
│  ├─ feed.ts           # pluggable: live | relay | recorded
│  ├─ resolve.ts        # DMX buffers → fixture attributes, 30 Hz
│  ├─ render/
│  │  ├─ fixture.ts     # GLB instance + axis rig (pan/tilt)
│  │  ├─ beam.ts        # cone + density shader
│  │  └─ strip.ts       # 1D DataTexture emissive segment
│  ├─ edit/
│  │  ├─ gizmo.ts       # TransformControls wrapper
│  │  └─ arrays.ts      # parametric generators (radial, line, grid)
│  └─ shaders/{beam.vert,beam.frag}.glsl
└─ shows/               # *.mvr, *.bhs, recorded bundles
```

Keep `gdtf-ts` free of any Beamhouse types and free of three.js. It should parse and resolve,
and hand back plain data.

`bridge/` is under the same discipline for the opposite reason: it depends on neither the app nor
`gdtf-ts`, so §02's ignorance is enforced by the isolated linker rather than by being a different
language ([ADR-0006](adr/0006-bridge-is-typescript-on-bun.md)). Its one permitted shared surface
is the §07 frame codec, so bridge and `feed.ts` cannot drift.

## 04 · The scene: where it comes from and how you edit it

The scene has two halves that change at completely different rates, and conflating them is the
mistake to avoid.

| Half      | Contains                                          | Source                          | Changes      |
| --------- | ------------------------------------------------- | ------------------------------- | ------------ |
| Patch     | which fixtures, which GDTF, which mode, addresses | the console's own project file  | once per rig |
| Placement | position, orientation, array parameters           | the app itself                  | constantly   |

### 4.1 What Mizer can and cannot give you

**Verified.** Mizer has **no MVR support whatsoever** — a grep for `mvr` across every `.rs`,
`.toml` and `.proto` returns zero files. `PatchExporter` exposes exactly two methods, `new()`
and `export_csv()` (`crates/components/fixtures/patch-export/src/lib.rs:13`). Any workflow that
routes through "export MVR from Mizer" does not exist.

Its 2D plan is no help either: **[corrected]** `FixturePosition` is
`{ fixture, x: f64, y: f64, width: f64, height: f64 }` (`crates/components/plan/src/lib.rs:39`)
— no Z, and *no rotation field at all*; the original draft claimed a scalar rotation. `PlansApi`
is also absent from the network API, whose services are `FixturesApi`, `SequencerRemoteApi` and
`ProgrammerApi`. Use the plan for what it is: a selection and grouping surface inside Mizer.

**[corrected] Mizer has a first-class GDTF provider.** `crates/components/fixtures/gdtf/` is
`mizer-gdtf-provider`, one of four fixture-library providers alongside `qlcplus`,
`open-fixture-library` and `mizer-definitions`. It resolves ids prefixed `gdtf:` and reads from
configurable library paths (`fixtures/gdtf`, settable in Mizer's settings). The original draft
treated "point both at the same GDTF folder" as an integration trick to arrange; it is a
feature that already exists on both sides.

### 4.2 Patch comes from the console's project file

Mizer's project file is YAML, with the patch sitting in plain sight:

```yaml
fixtures:
  - id: 1
    name: Mover SL
    universe: 1
    channel: 1
    fixture: "gdtf:<definition id>"   # resolve against the shared GDTF folder
    mode: "16ch Extended"
groups: [...]
```

Read it directly. No export step, and the bridge's file watcher can watch it alongside `shows/`
— repatch in Mizer, save, and Beamhouse merges the change with the socket still live.

**[corrected] The existing show is on QLC+, and is being left behind.**
`mizer-shows/OBF26_Bunte-Stube.yml` is 13 fixtures over 2 universes, every one of them
resolving via the `qlc:` provider — `qlc:GLP:impression 90 RGB` ×6,
`qlc:WLED:WLED Segment Effect` ×4, `qlc:Generic:Dimmer` ×2,
`qlc:American DJ:Fog Fury Jett` ×1 — imported from a QLC+ workspace. There are zero `.gdtf`
and zero `.mvr` files on disk.

That rig is a past show, not a constraint. The decision is to **move off QLC+**: Beamhouse
resolves GDTF only, and the OBF26 rig gets migrated onto `gdtf:` definitions where definitions exist
(ticket 5), primarily to serve as a real test rig. Future rigs may use entirely different
lamps, which is exactly why the generic-from-GDTF goal is the first goal.

The CSV export remains a fallback — `ID,Name,Address,Manufacturer,Model,Mode` — but note it is
built by `format!` interpolation with no quoting or escaping, so a fixture named `Mover, SL`
produces a broken row. Prefer the YAML.

### 4.3 MVR, when something else writes one

MVR stays supported because it is the only interchange format that carries positions, and
because BlinderKitten exports it and BlenderDMX reads and writes it. It is a side door rather
than the spine: a zip containing `GeneralSceneDescription.xml` plus the GDTF files it
references. Use `pymvr` as the reference implementation.

**[reframed 2026-09-02 — #33]** "Side door" undersells what this already delivers. Because MVR
carries positions, per-break addresses, `FixtureID` and layers, **every console that exports MVR
is a supported patch source today** — M5b is that, not a nicety. What is Mizer-only is the *live
repatch loop* (§4.2, §4.6), which rests on a file on the same disk that no other console writes.
So the open question is not "support more consoles" but whether the live loop generalises, and it
drags ADR-0003 with it: the integer id was chosen as the only key both sources supply **because
Mizer has no UUID**, and MVR has one. #33 grills it.

| Element   | Use                                            |
| --------- | ---------------------------------------------- |
| Fixture   | uuid, name, GDTF spec filename, DMX mode name  |
| Addresses | universe + address per DMX break               |
| Matrix    | 4×3 transform, millimetres — starting placement |
| FixtureID | the number the operator uses; show it on hover |
| Layer     | grouping; drives show/hide toggles             |

**Units.** MVR matrices are millimetres, GDTF geometry is metres, three.js has no opinion.
Convert once at the MVR boundary into metres, and write a test — everything downstream
silently inherits the mistake.

### 4.4 Placement is edited in the app

You will nudge a tube ten centimetres forty times in an evening; that loop has to be instant.

- Click a fixture, get a `TransformControls` gizmo. Translate and rotate. Snap to a grid, with
  a modifier to disable snapping.
- Numeric entry alongside the gizmo, because "exactly 2.4 m" beats dragging.
- **Parametric arrays.** A star of ten tubes is `count / radius / angle_step`, not ten
  hand-placed transforms. Generators for radial, line and grid; the array stays live.
- Multi-select with align and distribute.

### 4.5 Overrides are stored separately — this matters

**Status: locked.** Keep placement edits in a layer keyed by fixture id, separate from whatever
supplied the patch. Re-reading a changed Mizer project or a re-exported MVR then merges rather
than destroying an evening of positioning. This one decision is what makes the whole import
path survivable.

Use the fixture id rather than a UUID, and use it *everywhere* a fixture is referenced —
overrides, array members, selections. Mizer's `FixtureConfig.id` is a plain integer and MVR
carries `FixtureID` too, so the id is the one key both patch formats can supply.

```json
{
  "patch": { "kind": "mizer", "path": "~/mizer/warehouse.yml" },
  "gdtfDir": "~/lighting/gdtf",
  "overrides": {
    "12": { "pos": [1.2, 4.1, -0.6], "rot": [0, 45, 0] }
  },
  "arrays": [{
    "id": "star",
    "members": [12, 13, 14, 15],
    "kind": "radial",
    "center": [0, 3.2, 0], "radius": 2.4, "tilt": 90
  }],
  "classes": { "diy_t8_35px": { "kind": "strip", "pixels": 35 } }
}
```

### 4.6 Persistence and hot reload

- Working state auto-saves to IndexedDB every few seconds — **except in the single-file
  deployment**, which persists nothing automatically
  ([ADR-0009](adr/0009-deployment-is-inferred-from-origin.md)). A `file://` page's storage is one
  bucket shared by every `file://` document the user ever opens, so two exports — or two versions
  of one export — collide, and a neighbouring local page can read them.
- Explicit save writes the `.bhs` JSON via the File System Access API where available. This *does*
  work in the single file: `file://` is a secure context and `showSaveFilePicker` is present.
- **Watched files.** When served by the bridge, have it watch `shows/` and push a reload
  message on change.
- **Never reload the socket.** Rig changes rebuild the scene graph in place. The DMX stream is
  independent of the scene and must survive every edit.

## 05 · GDTF in the browser

The interesting half of the project. Three stages, all in `gdtf-ts`.

### 5.0 What reference implementation actually exists

**[corrected 2026-08-31 — this section previously overstated the case badly.]**

`mizer-gdtf-provider` implements a GDTF resolution layer in 663 lines of Rust, without the
`gdtf` crate, hand-rolled over `zip` + `hard-xml` — structurally the same approach `gdtf-ts`
must take with `fflate` + `DOMParser`. That much is true and useful.

But it is a **console patch resolver, not a scene resolver**, and the difference is the whole
spatial half of this milestone. Verified by grep across the crate:

- `Matrix`, `Position`, `transform` — **zero occurrences**. No transform data is parsed anywhere.
- `ChannelFunction`, `ChannelSet` — **zero occurrences**. No interpolation to physical units,
  despite `PhysicalUnit` existing as a dead type.
- `PhysicalDescriptions` is parsed as a literal empty struct (`definition.rs:146`), so model and
  GLB data in the zip is never touched.
- Virtual channels hit `if channel.offset.is_virtual() { return; }` behind a `TODO`.
- Its tests point `GdtfProvider::new(".fixtures")` at a directory that does not exist in the
  repo, and assert only that `load()` is `Ok` and `list_definitions()` does not panic. Against a
  missing directory **both pass vacuously** — there is no regression coverage against real files.

**What transfers to `gdtf-ts`:** the tree-walk-with-prefix pattern, channels-grouped-by-geometry-name
lookup, offset-width inference, `GeometryReference` break-offset arithmetic, a v1 attribute list
closely matching §5.2, and the `conversion.rs:58` `FIXME` — which drops channels whose attribute is
named `Macro` so the SGM G-1 Beam definition works. That hack generalises to a rule: GDTF's
Feature/Attribute taxonomy is not closed in real files, and the safe failure mode is
**skip, don't misclassify**.

**What has no reference here at all:** transform accumulation, `PrimitiveType` fallback geometry,
GLB extraction from the zip, `GeometryReference` expansion into *positioned* nodes, `modeMaster`,
`ChannelFunction` interpolation to physical units, virtual channels, and `colorSpace`/gamut.

That is essentially all of §5.1 plus half of §5.2 — the half a visualiser needs. The M4 estimate
was set assuming a ladder against the wall; there is one against the near side only. Finding a
reference for the spatial half is a separate open question (BlenderDMX is the leading candidate).

### 5.1 Geometry tree → renderable nodes

Walk depth-first, accumulating transforms, emitting one node per geometry tagged by kind:

| GDTF geometry       | Becomes                                                        |
| ------------------- | -------------------------------------------------------------- |
| `Geometry`          | static mesh                                                     |
| `Axis`              | a hinge — parent of everything Pan or Tilt rotates              |
| `Beam`              | beam origin: direction, beam angle, lamp type, luminous flux    |
| `GeometryReference` | a repeat — see 5.3                                              |
| filter geometries   | parse, ignore in v1                                             |

Resolve `PrimitiveType` before looking for a mesh — fixtures may declare `Cube`, `Cylinder`,
`Sphere`, `Base`, `Yoke` instead of shipping geometry. Generate those procedurally; a rig where
half the fixtures are invisible is a confusing first bug. These primitives double as the proxy
geometry for the shared-link viewer (§9.2).

Models live in `models/gltf/` as GLB. The spec caps a device at 1200 vertices for default LOD,
so the whole rig ships to a remote viewer in under a megabyte.

```ts
// models.ts — no HTTP, no cache, no round trip
const glb = await gdtf.file(`models/gltf/${name}.glb`);   // ArrayBuffer
loader.parse(glb, "", (gltf) => scene.add(gltf.scene));
```

### 5.2 DMX mode → channel bindings

```ts
interface ChannelBinding {
  offset:     number[];           // coarse..fine, absolute within the break
  dmxBreak:   number;
  geometry:   NodeId;
  attribute:  Attribute;          // Dimmer, Pan, ColorAdd_R, Zoom, ...
  functions:  ChannelFunction[];  // dmxFrom → physicalFrom..physicalTo
  modeMaster?: ModeMasterRef;
}
```

Per tick: read the raw value across coarse/fine offsets, pick the `ChannelFunction` whose
`dmxFrom` range contains it, interpolate `physicalFrom..physicalTo`. That yields degrees for
Pan, hertz for Shutter1Strobe — real units, not 0–255.

Handle `modeMaster` in v1. It is how a fixture says "this channel means something different
when channel 12 is above 128", and skipping it produces wrong output on exactly the cheap
movers you own.

Attributes for v1: `Dimmer`, `Pan`, `Tilt`, `ColorAdd_R/G/B`, `Zoom`, `Shutter1Strobe`.
Everything else logs once and is ignored. Store raw values as 32-bit and normalise by declared
width.

### 5.3 GeometryReference expansion

What makes pixel fixtures work generically. A `GeometryReference` instantiates another geometry
with a `Break` offset per DMX break. Expand into N concrete nodes, each with channel offsets
shifted by its break offset.

A 35-pixel RGB tube resolves to 35 nodes × 3 bindings = 105 channels. The renderer should then
recognise that a run of collinear emitter nodes is a strip, not 35 separate beams — the
detection heuristic is ticket 7, with the `.bhs` `classes` block as an explicit override,
keyed by definition id.

**Performance.** Resolve on a fixed 30 Hz tick, not per packet. Diff against the previous frame:
beam fixtures move rarely, strips change constantly.

## 06 · The bridge

**The bridge speaks both sACN and Art-Net.** Settled in
[ADR-0002](adr/0002-bridge-speaks-both-sacn-and-artnet.md).

**It is TypeScript on Bun**, settled in [ADR-0006](adr/0006-bridge-is-typescript-on-bun.md) —
`sacn` npm 4.6.2 for E1.31, a hand-rolled 25-line ArtDmx receiver on `Bun.udpSocket` (a passive
listener that never announces itself, which `dmxnet` gets wrong), and `Bun.serve` plus `fs.watch`
with no dependencies for the rest. **[corrected] It is not ~150 lines and not "the only native
code".** Both of those framings predate ADR-0002 and the job list below.

**[corrected] The original argument for sACN-only was false.** The draft claimed Art-Net is
UDP 6454 and "only one process per host can bind it". On Linux that is not true for broadcast
Art-Net, which is what this rig uses. Measured on the target platform: three sockets bound to
`0.0.0.0:6454` with `SO_REUSEADDR` + `SO_REUSEPORT` **all three received** the same broadcast
frame, to both the subnet broadcast address and `255.255.255.255`. Mizer never contends for the
port anyway — its Art-Net output binds `("0.0.0.0", 0)`, an ephemeral port, and only *sends* to
6454.

**What actually decides it is that gled2 cannot speak sACN.** It depends on `artnet_protocol`
and the Enttec USB DMX driver, with no E1.31 anywhere in its source. Since gled2 and Mizer must
stream to Beamhouse simultaneously, sACN-only is impossible and Art-Net support is mandatory.

| Source        | Art-Net                                     | sACN                       |
| ------------- | ------------------------------------------- | -------------------------- |
| gled2         | only — binds 6454 exclusively on its input   | **none**                   |
| Mizer         | output from an ephemeral port                | yes, `sacn` crate          |
| CueCore2      | yes                                          | yes, in and out            |
| WLED          | yes                                          | yes, E1.31                 |

**The real port conflict, and it is narrow.** gled2 binds `("0.0.0.0", 6454)` *without* reuse
options — its source comments that the input "actually needs to own 6454" — and falls back to an
ephemeral port if that fails. So the conflict exists **only when gled2's Art-Net input is in
use**; as a pure source, 6454 stays free and the bridge can share it. Three mitigations, in
order of preference:

1. **Give gled2 sACN output.** Removes the contention entirely rather than working around it,
   and puts both sources on multicast. External to this repo but the cleanest end state.
2. **Set `SO_REUSEADDR`/`SO_REUSEPORT` on gled2's socket** — two lines, and the measurement above
   shows sharing then works. Every socket must set them, so this requires the gled2-side change.
3. **Send gled2's Art-Net to a non-standard port.** Its output destination is a configurable
   `SocketAddr`. Works without touching gled2, at the cost of a non-standard setup.

Prefer sACN where a source supports it: multicast means any number of receivers with no
start-order ritual, and group join/leave maps directly onto the `subscribe` message in §07.

### The whole job

1. Accept a WebSocket; read a `subscribe` message listing universes.
2. Join those multicast groups; forward each universe's 512 bytes.
3. Drop out-of-order packets by sequence number rather than flickering.
4. Mark a universe stale after ~2.5 s of silence and say so. Silent frozen output is the worst
   failure mode, because you debug the console instead of the network.
5. Pass through the priority and `Preview_Data` flags — a free blind-mode indicator.

   **[gap noted 2026-09-02 — #31]** Jobs 3, 4 and 5 all produce signals that **nothing in this
   document consumes**: staleness, sACN priority, `Preview_Data`, and the out-of-order drop
   count. The bridge prevents the silence job 4 warns about; the UI is where it stops being
   silent, and there is no UI section. #31 writes one, covering a universe read-out, whole-fixture
   staleness (a multi-break fixture with one stale break renders **wholly** stale per ADR-0011 —
   a strip half live and half frozen is job 4's failure made *more* convincing by the live half),
   blind indication, and a false-colour mode over resolved `Dimmer`, which ADR-0010 makes nearly
   free.
6. **Merge both transports into one universe space**, sACN-numbered: an Art-Net Port-Address *p*
   is forwarded as universe *p* + 1 ([ADR-0007](adr/0007-one-universe-space-sacn-numbered.md)).
   This is the only place that mapping may live, and it is worth a test.
7. Serve the static app and watch `shows/` and Mizer's project YAML for changes. **Not optional**
   — serving over `http://localhost` is what sidesteps §9.4's mixed-content trap rather than
   merely documenting it.

Confirm exact options-flag bit positions, priority range and data-loss timeout against
ANSI E1.31-2018 before relying on them.

## 07 · Wire protocol

Thin, because the browser does the thinking. Text frames for control, binary for data.

```jsonc
// browser → bridge
{ "op": "subscribe", "universes": [1, 2, 3, 4] }

// bridge → browser, control
{ "op": "stale",  "universes": [4] }
{ "op": "sacn_source", "universe": 1, "priority": 100, "preview": false }
{ "op": "reload", "path": "shows/warehouse.mvr" }
```

```
// bridge → browser, data. one frame per tick, all universes.
u32   magic  'BHU1'
u32   t_ms
u16   universe_count
  per universe:
    u16   universe        // sACN-numbered, transport-independent — ADR-0007
    u8[512] slots
```

The frame carries no transport field, and that is deliberate: the bridge has already merged sACN
and Art-Net into one universe space before anything is written here
([ADR-0007](adr/0007-one-universe-space-sacn-numbered.md)). Nothing downstream can tell, or needs
to tell, how a universe arrived.

Keep a `feed.ts` interface in front of it with two implementations — `live` and `recorded`.
`relay` was removed by [ADR-0009](adr/0009-deployment-is-inferred-from-origin.md): nothing ever
defined it, and §9.4's tunnel is `live` at a different URL rather than a different
implementation. A third, injected-state implementation is the agent surface (ticket 4).

## 08 · Rendering

### 8.1 Strips: one texture, not thirty-five objects

Render each tube as **the geometry its definition declares** — the declared `PrimitiveType`, or a
real mesh where the definition ships one — carrying a `DataTexture` of N texels sampled along the
run's axis, `LinearFilter` on. Interpolation gives the continuous COB glow for free, and it is one
draw call per fixture rather than thirty-five. A 2D matrix is the same path with an `M × N`
texture (ADR-0005). Do not substitute a cylinder for a declared `Cube`: the real
`MarkeEigenbau` strip declares a 25 x 50 x 1000 mm cube, and overriding that is the renderer
claiming to know better than the definition.

**[open 2026-09-02 — #27]** That last rule assumes every emitter traces back to a declared
geometry. Capture 2026 shipped the opposite: a **generic LED Strip** drawn as a Bézier curve with
a pixel pitch, pixel count falling out of length ÷ pitch, no definition file anywhere. The naive
import of that idea is falsified by §04's split — Capture *is* the patch, Beamhouse only reads
one, so a tube that exists only here is a tube Mizer cannot address. What survives is the narrow
question #27 grills: may **placement** distribute a definition's emitters along an authored path,
given the STAR-TENT's ten spokes cabled back and forth (#21) are a shape no definition will ever
carry, and §4.4's parametric arrays already generate placement from parameters?

```ts
const tex = new THREE.DataTexture(
  new Float32Array(pixelCount * 4), pixelCount, 1,
  THREE.RGBAFormat, THREE.FloatType);
tex.minFilter = tex.magFilter = THREE.LinearFilter;
// per frame: copy resolved RGB in, set needsUpdate.
```

One bloom pass over the whole scene. Resist per-fixture glow sprites.

### 8.2 Beams — write them as a density function

Cone geometry from each `Beam` node, additively blended, depth-write off, sorted back to front,
cone half-angle driven by the resolved `Zoom`.

Structure the fragment shader as `density(p) → float` and integrate it analytically for v1.
That one choice is what lets haze become a raymarch through the same function later. Likewise,
give the beam material a projective texture uniform now, unused; gobos then become a matter of
feeding it wheel media from the GDTF zip.

Turn on `ACESFilmicToneMapping` and physically-correct lighting from day one. Retrofitting tone
mapping means re-tuning every colour you have already tuned.

ASLS Studio's `beam.frag.glsl` is the best open reference, but it is **GPL-3**: read it for
technique freely; reusing it makes your renderer GPL-3 too.

Drive strobe from a shader uniform on wall time, not by dropping frames.

**[two questions opened 2026-09-02]**

- **#28 — does the atmosphere term land in v1?** The seam above is only insurance if it is
  claimed once, and `density(p)` integrated by nothing but the analytic path is an untested
  assumption. A constant-density single-scattering term is closed-form for a cone and needs no
  raymarch. Recommendation: yes, validated at M6, with absorption and volumetric shadows staying
  in the deferred tier.
- **#29 — raw GLSL or node material?** §03 lists hand-written `.glsl`, which is the right default
  and also the thing that fixes the cost of ever leaving WebGL2: three.js's WebGPU path expects
  node graphs, and `postprocessing` is a WebGL-era library. **WebGL2 stays locked** — the survey's
  one WebGPU competitor (DMXpressions) spends it on raymarched volumetrics, i.e. precisely the
  tier §01 deferred, and nothing v1 renders needs it. #29 records that as a decision rather than
  a default, and closes the `three`/`postprocessing` versions in §12 with it.

### 8.3 Colour: RGB now, white channels later

v1 resolves `ColorAdd_R/G/B` and stops. Keep the seam explicit anyway — one function, one call
site.

**v1 assumes the colour space and reads the transfer function**
([ADR-0008](adr/0008-colour-space-is-assumed-transfer-function-is-read.md)). Primaries are assumed
sRGB, which is what GDTF's `<ColorSpace>` defaults to anyway; the fixture model carries no
`colorSpace` field, so there is nothing to half-consult. `PhysicalFrom`/`PhysicalTo` *is* read
wherever the `PhysicalUnit` gives it meaning — `Dimmer` declares `LuminousIntensity`, so its
linearity is a stated fact, not an assumption (#25).

**Exactly one assumption is made, at exactly one site:** `ColorComponent` 0..1 is proportional to
radiance. GDTF is genuinely silent there. `resolveColor` is the sole minter of `LinearRGB`, so
every consumer of colour is a compiler-visible correction site.

```ts
/** Radiance-linear, sRGB primaries. Only `resolveColor` may mint this. */
export type LinearRGB = readonly [number, number, number] & { readonly __linear: unique symbol };

export function resolveColor(ch: ColorChannels): LinearRGB {
  // ASSUMPTION (ADR-0008): PhysicalUnit `ColorComponent` is undefined photometrically;
  // v1 reads 0..1 as proportional to radiance. The only such assumption in the codebase.
  return [ch.r, ch.g, ch.b] as unknown as LinearRGB;
  // later: blend warm/cool by ratio → kelvin → linear RGB, add to RGB, clamp.
}
```

Both render paths consume that type and no other. The strip's `DataTexture` is annotated
`LinearSRGBColorSpace` **explicitly** — it matches three.js's default for a float texture, and
that is the point: a deliberate default documents the assumption where a silent one hides it. The
conversion happens in `resolveColor`, **before** anything reaches `ACESFilmicToneMapping`; the
tone mapper on unconverted input is the compounding error §8.2 risks.

## 09 · Sharing

**One source, two builds, three deployments**
([ADR-0009](adr/0009-deployment-is-inferred-from-origin.md)). "One build" was not true — §12's
`vite-plugin-singlefile` already contradicted it — but the line falls in one place only, and
bridge-local and Pages are byte-identical.

| Deployment    | Build    | Serves                                        | Live data? |
| ------------- | -------- | --------------------------------------------- | ---------- |
| Bridge, local | `app`    | `http://localhost:7070` — LAN too              | yes        |
| GitHub Pages  | `app`    | public viewer: shared links, hosted recordings | no         |
| Single file   | `single` | one self-contained `.html`                     | no — by decision, not by limitation |

**Which deployment a page is in is inferred at runtime from its own origin**, never compiled in:
the bridge-served page finds its bridge at `location.host` by construction, an `https` Pages
origin never has a same-origin bridge, and `file://` has no host at all. `base` is relative so
the same `app` bytes sit under Pages' `/beamhouse/` path.

The single file's "no" is a choice: a `file://` page *can* open `ws://localhost:7070` — measured,
see [`docs/research/file-url-capabilities.md`](research/file-url-capabilities.md). It is declined
because the bridge would see `Origin: null`, and trusting that means trusting every local file on
the machine.

### 9.1 The scene travels in the URL fragment

Use the fragment, not the query string: it is never transmitted to the server, and no
server-side length cap applies. Encode with the `fflate` already depended on for GDTF
unzipping. Pack the payload as arrays, not objects, and round every float to millimetres.

Treat 4 KB as the budget; past that, fall back to offering a `.bhs` download and say so in the
UI rather than silently producing a broken URL.

### 9.2 What a URL cannot carry

Geometry and recordings. The viewer degrades in layers: a bundled set of recurring definitions
in `public/gdtf/`; **proxy geometry** rendered from `PrimitiveType` when no definition is
available (schematic but correct — right positions, right beam angles, right colours); and
drag-and-drop for the recipient's own GDTF or MVR.

Worth building early: give a shared link a **demo motion mode** — a canned chase generated from
a seed, running on the real rig geometry.

### 9.3 Recordings

`track.bhr` is the binary frame stream (§7) appended verbatim with length prefixes, gzipped.
Reference one from the fragment; keep it out of the fragment itself.

### 9.4 The mixed-content trap

A page served over `https` from GitHub Pages talking to a `ws://localhost` bridge is mixed
content, and browser behaviour for the localhost exception has changed more than once. The
clean split avoids the question: the bridge serves the app over `http://localhost` for live
work, and Pages serves the viewer for sharing, where there is no live socket. For live data
through a public URL, terminate TLS properly with a cloudflared or Tailscale Funnel tunnel.
Never expose the bridge's WebSocket unauthenticated.

[ADR-0009](adr/0009-deployment-is-inferred-from-origin.md) makes the split **structural rather
than documented**: the socket URL is derived from the page's own origin, so an `https` page never
constructs a `ws://` URL at all — it never had a same-origin bridge to derive one from. The
tunnel case rides an explicit fragment override, so it does not weaken the default.

## 10 · Milestones

Ordered so each step renders something. Do not build the resolution layer before you can see a
cube move.

| #   | Milestone     | Done when                                                              | Est.  |
| --- | ------------- | ---------------------------------------------------------------------- | ----- |
| M0  | Bridge        | Console logs universe 1 slot 1 changing as you move a Mizer fader       | ½ d   |
| M1  | Cubes, live   | Three cubes change brightness from real DMX, hard-coded patch           | ¾ d   |
| M2  | Strips        | One tube renders as a smooth gradient driven by gled2 or WLED           | 1 d   |
| M3  | Scene editor  | Drag a fixture, edit a radial array, reload the tab, it persists        | 1½ d  |
| M3a | Share link    | A Pages URL with the scene in its fragment opens the rig on a phone     | ½ d   |
| M4  | gdtf-ts       | An arbitrary GDTF patches and its real GLB renders with working pan/tilt| 3–5 d |
| M5a | Mizer patch   | Beamhouse reads the project YAML; repatching updates the rig live       | ½ d   |
| M5b | MVR import    | A rig exported from BlinderKitten loads, overrides merge cleanly        | 1 d   |
| M6  | Beams         | Six movers, volumetric cones, zoom and strobe correct                   | 1–2 d |
| M7  | Record/replay | A committed `.bhr` plays back through the same shared link              | 1 d   |

M4 is the wall; §5.0 is what makes it survivable.

**[reordered 2026-09-02]** The share link was M7, behind the wall. It is now **M3a**, immediately
after the scene editor, and record/replay takes the freed M7 slot.

The reason is the competitive review: sharing is the **only** capability in this design that no
surveyed product has, commercial or open. Everything else Beamhouse does, something in the field
also does, usually better-funded. Leaving the one uncontested thing until after a 3–5 day wall
means it is the first casualty if the wall costs more than budgeted — which is exactly backwards.

M3a is cheap where it now sits because it needs nothing M4 provides: §9.1's fragment encoding uses
the `fflate` already depended on, and §9.2's degradation ladder starts at **proxy geometry from
`PrimitiveType`**, which is the render path for strips anyway (#2 found the `MarkeEigenbau` profile
ships `description.xml` with no meshes at all). A crude M3a that shares a scene of proxies is worth
more than a polished one that arrives at the end.

## 11 · Open questions

These are the wayfinder map's tickets. See the map issue for current state.

1. **Strip detection heuristic.** Collinear-references-become-a-strip holds for tape and bars,
   breaks on a matrix panel. Future rigs may add fixture kinds that fit neither class.
2. ~~**Colour space.**~~ **Answered:** the colour space is assumed, the transfer function is read
   ([ADR-0008](adr/0008-colour-space-is-assumed-transfer-function-is-read.md)). "Linear sRGB" was
   two assumptions under one name; GDTF's `<ColorSpace>` defaults to sRGB, and `Dimmer` declares
   `LuminousIntensity`, so only the `ColorComponent` → radiance reading is genuinely assumed. The
   enumeration is a branded `LinearRGB` type rather than a marker convention, so correcting it is
   a compiler error, not archaeology. Surfaced #25.
3. **Agent surface.** The renderer taking injected state directly, bypassing DMX, would let an
   agent set a look and screenshot it with no console running. Nearly free given `feed.ts`.
4. ~~**Bridge language.**~~ **Answered:** TypeScript on Bun
   ([ADR-0006](adr/0006-bridge-is-typescript-on-bun.md)). The Rust-vs-Node framing was wrong on
   both sides — ADR-0004 had already made the TS option Bun rather than Node, and the static
   binary was never a requirement. Surfaced the universe-space collision
   ([ADR-0007](adr/0007-one-universe-space-sacn-numbered.md)).
5. **Publishing `gdtf-ts`.** No maintained TypeScript GDTF library exists.
6. **Transport.** sACN or Art-Net, given Mizer does both.
7. **GDTF definition availability.** Whether definitions exist for the fixtures in hand at all.
   Partially answered: GDTF Share has a curl-friendly REST API but is account-gated, so this is
   blocked on obtaining access.
8. **Is GDTF the sole definition library?** Reopened after the availability research. Open Fixture
   Library (`ofl:`) is JSON, ungated, already supported by Mizer via a 972-line provider, and
   carries a native `Matrix { pixels: MatrixPixels }` concept plus `BeamAngle`/`BeamPosition`
   capabilities — the pixel-strip class GDTF has no working definition for.
9. **What is the reference for the spatial half of resolution?** Mizer provides none; BlenderDMX
   is the leading candidate.

**[opened 2026-09-02 by the competitive review]**

10. **Does placement ever mint emitters a definition did not declare?** (#27) Capture 2026's
    definition-free LED Strip against §04's patch/placement split and ADR-0005.
11. **Does v1 render atmosphere?** (#28) The whole field's headline feature against §01's
    deferred render tier. See §8.2.
12. **Raw GLSL or node material?** (#29) WebGL2 stays locked; what is open is the shader
    authoring model, which is what fixes the cost of ever leaving it. Closes half of §12.
13. **Is MVR-xchange a ceiling we accept, and where is the seam?** (#30) Blocked by #33.
14. **Which consoles does Beamhouse serve?** (#33) Whether the live repatch loop generalises past
    Mizer — and if it does, ADR-0003's integer id reopens, because the UUID it declined exists in
    every source but Mizer's.

## 12 · Dependencies

The **browser** table below is still unsettled — versions and choices fall out of the open
questions above, and **#29 is the one that closes it**: `three` and `postprocessing` cannot be
pinned before the shader authoring model is chosen, since a node-material renderer replaces
`postprocessing` rather than versioning it. The **bridge** table is settled
([ADR-0006](adr/0006-bridge-is-typescript-on-bun.md)).

| Package                | Version | Role                                    | Licence |
| ---------------------- | ------- | --------------------------------------- | ------- |
| `three`                | ≥0.170  | renderer, GLTFLoader, TransformControls | MIT     |
| `postprocessing`       | ≥6.36   | bloom, tone mapping                     | Zlib    |
| `fflate`               | ≥0.8    | unzip GDTF and MVR in the browser       | MIT     |
| `vite`                 | ≥6      | dev server, HMR, static build           | MIT     |
| `vite-plugin-singlefile`| ≥2     | inline everything into one `.html`      | MIT     |

Two Vite settings are **not** free choices, per
[ADR-0009](adr/0009-deployment-is-inferred-from-origin.md): `base` is relative (`'./'`), and
workers must be emitted **classic/`iife`**. A Blob-URL classic worker runs from `file://`; a
Blob-URL *module* worker fails there **with no error message at all**, which is the kind of
defect that ships. The dev server also proxies the WebSocket path to the bridge, without which
origin inference breaks in the setup development happens in daily.

Bridge — **settled** ([ADR-0006](adr/0006-bridge-is-typescript-on-bun.md)):

| Package             | Version | Role                                     | Licence    |
| ------------------- | ------- | ---------------------------------------- | ---------- |
| `sacn` (npm)        | 4.6.2   | ANSI E1.31 receive                       | Apache-2.0 |
| —                   | —       | ArtDmx receive is ~25 lines of our own   | —          |
| —                   | —       | WebSocket, static serving, file watching are `Bun.serve` / `fs.watch` | — |

The Rust crates (`sacn` 0.11.1, `artnet_protocol` 0.4.4) are out. Both are good — the `sacn`
crate is a more complete E1.31 receiver than the npm package — but see ADR-0006 for why that did
not carry the decision.

Check each licence before depending on it. The one that bites is ASLS's beam shader: GPL-3.

## References

- `~/git-projects/Mizer` — `crates/components/fixtures/gdtf/` is the resolution reference
- [cpdt/gdtf-rs](https://github.com/cpdt/gdtf-rs) — object model to mirror in TS
- [pymvr](https://github.com/open-stage/python-mvr) — MVR reference implementation
- ASLS Studio — beam shader (GPL-3, read only)
- [BlenderDMX](https://github.com/open-stage/blender-dmx) — resolution layer in Python
