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

- **Generic.** Any rig, from an MVR file plus GDTF definitions. No hard-coded fixtures.
- **Fast to open.** Under two seconds to a rendered rig. You will open it fifty times a night.
- **Editable while running.** Move a fixture, repatch, reload a GDTF — without restarting
  anything or losing the live connection.
- **Two fixture classes done well.** Volumetric beams for movers; continuous emissive strips
  for pixel tape. These are *rendering* classes, not fixture models: anything with a GDTF
  `Beam` geometry is class one, any collinear run of emitter references is class two. New
  lamps land in one bucket or the other without new code.
  **Strips are per-pixel only** (decided 2026-08-31): the tubes are driven per pixel, via gled2
  or WLED's virtual per-pixel DMX output. See the effect-mode exclusion below.
- **Shareable.** Live over LAN or a tunnel; or as a static bundle anyone can open later, with
  no bridge running.
- **Coexists.** Runs on the same laptop as the console without fighting over ports or GPU.

### Not in v1 — but do not architect them out

Deferred, not excluded. Concrete consequences are in §8: the beam shader is written as a
density function so haze can raymarch it later, the beam material carries a projective texture
slot from day one so gobos drop in, and tone mapping is on from the start so a high-quality
tier is a switch rather than a rewrite.

- Higher-fidelity rendering. PBR is free from glTF; the missing pieces are haze, soft shadows,
  and a slower "render" tier.
- Gobos, prisms, framing shutters. GDTF carries wheel media in the same zip.
- The agent surface — a fourth feed implementation injecting state directly. Undecided
  for v1.

### Genuinely out of scope

- **WLED effect mode.** `~/.qlcplus/fixtures/WLED-SegmentEffect.qxf` is 18 channels of *effect
  parameters* — `Segment Opacity`, `Effect`, `Effect Speed`, `Palette` — and the OBF26 show
  patches four tubes that way. Under effect mode WLED computes the pixels on-device, so the
  per-pixel data never crosses the wire and Beamhouse could only render it by reimplementing
  WLED's effect engine. v1 therefore assumes **per-pixel drive** (gled2, or WLED's virtual
  output) and does not attempt to visualise effect-mode output.
- Paperwork, plots, patch sheets, MVR-xchange.
- **Being a control surface. Beamhouse never sends DMX.** Mizer is the control surface;
  Beamhouse is the preparation visualiser. The pair is the product.
- **QLC+ as a definition library.** ~~GDTF is the only library Beamhouse
  resolves against.~~ **Under review.** Research found no confirmed GDTF definition for 5 of 13 fixtures in
  the reference rig, no QLC+→GDTF converter in either direction, and no working generic
  pixel-strip GDTF definition anywhere. Whether GDTF stays the sole definition library is now an
  open decision — note that Open Fixture Library is a third option neither this document nor the
  original framing considered, and it models pixel matrices natively. See §4.2 and §11.
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
├─ bridge/              # the only native code. ~150 LOC.
│   └─ src/main.rs      # sACN multicast → WebSocket
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

- Working state auto-saves to IndexedDB every few seconds.
- Explicit save writes the `.bhs` JSON via the File System Access API where available.
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

The draft's position: default to sACN, not Art-Net. Art-Net is UDP 6454 and only one process
per host can bind it, which is why BlenderDMX's own docs tell you to start it first. sACN is
multicast on UDP 5568, so any number of receivers coexist with no start-order ritual.

**[corrected] Mizer supports both.** `connections/protocols/dmx/src/outputs/sacn.rs` exists
alongside the Art-Net output, with `add_sacn_output` and `configure_sacn_output` commands. The
existing show file uses `type: artnet` twice — broadcast to a CueCore2 at `192.168.8.255` and
unicast to a WLED tent at `192.168.8.243` — but that is a configuration choice, not a Mizer
limitation. **The transport decision is therefore genuinely open (ticket 3),** and the real
question is whether switching Mizer's output to sACN disturbs the CueCore2 and WLED paths.

### The whole job

1. Accept a WebSocket; read a `subscribe` message listing universes.
2. Join those multicast groups; forward each universe's 512 bytes.
3. Drop out-of-order packets by sequence number rather than flickering.
4. Mark a universe stale after ~2.5 s of silence and say so. Silent frozen output is the worst
   failure mode, because you debug the console instead of the network.
5. Pass through the priority and `Preview_Data` flags — a free blind-mode indicator.
6. Optionally serve the static app and watch `shows/` for changes.

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
    u16   universe
    u8[512] slots
```

Keep a `feed.ts` interface in front of it with three implementations — `live`, `relay`,
`recorded`. A fourth, injected-state implementation is the agent surface (ticket 4).

## 08 · Rendering

### 8.1 Strips: one texture, not thirty-five objects

Render each tube as a single cylinder or quad carrying a 1D `DataTexture` of N texels sampled
along its length, `LinearFilter` on. Interpolation gives the continuous COB glow for free, and
it is one draw call per fixture rather than thirty-five.

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

### 8.3 Colour: RGB now, white channels later

v1 resolves `ColorAdd_R/G/B` and stops. Keep the seam explicit anyway — one function, one call
site. Whether v1 also honours GDTF's `colorSpace`/gamut is ticket 8.

```ts
export function resolveColor(ch: ColorChannels): RGB {
  return [ch.r, ch.g, ch.b];
  // later: blend warm/cool by ratio → kelvin → linear RGB, add to RGB, clamp.
}
```

## 09 · Sharing

One build, three deployments.

| Deployment    | Serves                                        | Live data? |
| ------------- | --------------------------------------------- | ---------- |
| Bridge, local | `http://localhost:7070` — LAN too              | yes        |
| GitHub Pages  | public viewer: shared links, hosted recordings | no         |
| Single file   | one self-contained `.html`                     | no         |

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

## 10 · Milestones

Ordered so each step renders something. Do not build the resolution layer before you can see a
cube move.

| #   | Milestone     | Done when                                                              | Est.  |
| --- | ------------- | ---------------------------------------------------------------------- | ----- |
| M0  | Bridge        | Console logs universe 1 slot 1 changing as you move a Mizer fader       | ½ d   |
| M1  | Cubes, live   | Three cubes change brightness from real DMX, hard-coded patch           | ¾ d   |
| M2  | Strips        | One tube renders as a smooth gradient driven by gled2 or WLED           | 1 d   |
| M3  | Scene editor  | Drag a fixture, edit a radial array, reload the tab, it persists        | 1½ d  |
| M4  | gdtf-ts       | An arbitrary GDTF patches and its real GLB renders with working pan/tilt| 3–5 d |
| M5a | Mizer patch   | Beamhouse reads the project YAML; repatching updates the rig live       | ½ d   |
| M5b | MVR import    | A rig exported from BlinderKitten loads, overrides merge cleanly        | 1 d   |
| M6  | Beams         | Six movers, volumetric cones, zoom and strobe correct                   | 1–2 d |
| M7  | Share link    | A Pages URL with the scene in its fragment opens the rig on a phone     | ½ d   |
| M8  | Record/replay | A committed `.bhr` plays back through the same shared link              | 1 d   |

M4 is the wall; §5.0 is what makes it survivable.

## 11 · Open questions

These are the wayfinder map's tickets. See the map issue for current state.

1. **Strip detection heuristic.** Collinear-references-become-a-strip holds for tape and bars,
   breaks on a matrix panel. Future rigs may add fixture kinds that fit neither class.
2. **Colour space.** GDTF carries `colorSpace` and gamut per channel function. v1 assumes
   linear sRGB — note every place the assumption is made so correcting it is not archaeology.
3. **Agent surface.** The renderer taking injected state directly, bypassing DMX, would let an
   agent set a look and screenshot it with no console running. Nearly free given `feed.ts`.
4. **Bridge language.** Rust gives a single static binary; Node keeps one toolchain.
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

## 12 · Dependencies

**Nothing in this table is settled** — versions and choices fall out of the open questions
above.

| Package                | Version | Role                                    | Licence |
| ---------------------- | ------- | --------------------------------------- | ------- |
| `three`                | ≥0.170  | renderer, GLTFLoader, TransformControls | MIT     |
| `postprocessing`       | ≥6.36   | bloom, tone mapping                     | Zlib    |
| `fflate`               | ≥0.8    | unzip GDTF and MVR in the browser       | MIT     |
| `vite`                 | ≥6      | dev server, HMR, static build           | MIT     |
| `vite-plugin-singlefile`| ≥2     | inline everything into one `.html`      | MIT     |

Bridge — pick one side:

| `sacn` (crate)      | 0.11.1 | ANSI E1.31 receive, Rust    | —          |
| `artnet_protocol`   | 0.4.4  | Art-Net fallback            | —          |
| `sacn` (npm)        | 4.6.2  | ANSI E1.31 receive, Node    | Apache-2.0 |

Check each licence before depending on it. The one that bites is ASLS's beam shader: GPL-3.

## References

- `~/git-projects/Mizer` — `crates/components/fixtures/gdtf/` is the resolution reference
- [cpdt/gdtf-rs](https://github.com/cpdt/gdtf-rs) — object model to mirror in TS
- [pymvr](https://github.com/open-stage/python-mvr) — MVR reference implementation
- ASLS Studio — beam shader (GPL-3, read only)
- [BlenderDMX](https://github.com/open-stage/blender-dmx) — resolution layer in Python
