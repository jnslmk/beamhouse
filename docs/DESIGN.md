# Beamhouse

A live GDTF/MVR lighting visualiser: a browser app, a 150-line bridge, and nothing else.

|          |                                        |
| -------- | -------------------------------------- |
| Status   | design, pre-code                       |
| Target   | TypeScript · WebGL2 · Linux            |
| Drivers  | Mizer · gled2 · WLED                   |
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

  **[corrected 2026-09-02 — #35]** The *capability* claim was too strong. Capture 2026 ships
  fixtures patched across universe boundaries and modes exceeding 512 channels, and exposes a
  second break as suffixed `Patch #2` / `Mode #2` columns. ADR-0011 is therefore **aligned with
  Capture, not ahead of it** — the goal is unmetered *access* to that capability, which is the
  half that stands. The Eos limitation is unaffected.
- **Shareable.** Live over LAN or a tunnel; or as a static bundle anyone can open later, with
  no bridge running. **[sharpened 2026-09-02]** No product surveyed lets a third party open a
  link and watch a rig move — Vectorworks Cloud's Web View is the nearest and is static geometry
  on a two-week expiry. This is the only capability in the design with no competitor, which is
  why §10 no longer leaves it to the end.
- **Coexists.** Runs on the same laptop as the console without fighting over ports or GPU.
  **[settled 2026-09-02 — #33]** Same-laptop is a property of the **live repatch loop**, not of
  Beamhouse: it is condition (i) of [ADR-0020](adr/0020-the-live-loop-serves-patch-files-not-consoles.md)'s
  predicate — a patch file on a watchable path. MVR file import never carried the assumption and is
  machine-agnostic already, and [ADR-0009](adr/0009-deployment-is-inferred-from-origin.md)'s origin
  inference plus §9.4's fragment override already cover the LAN case.

### Not in v1 — but do not architect them out

Deferred, not excluded. Concrete consequences are in §8: the beam shader is written as a
density function so haze can raymarch it later, the beam material carries a projective texture
slot from day one so gobos drop in, and tone mapping is on from the start so a high-quality
tier is a switch rather than a rewrite.

- Higher-fidelity rendering — soft shadows and a slower "render" tier. PBR is free from glTF.

  **[resolved 2026-09-02 — #28]** The atmosphere half of this tier **left it**
  ([ADR-0013](adr/0013-atmosphere-is-one-closed-form-scattering-term.md)). A beam in clean air is
  invisible; what you see in a room is scattering off particulate, so a cone with no atmosphere
  term reads as a diagram of a beam rather than a beam — and since v1 renders **no venue
  geometry**, there is not even a lit surface to infer one from. A **constant-density
  single-scattering term** ships in v1: closed-form, one integral in the same fragment shader, no
  raymarch and no second pass. What buys that closed form is dropping **extinction** and using an
  **isotropic phase function**, so v1's beam does not glare when aimed at the camera — deliberate,
  not a defect. What stays deferred is now a rule rather than a list: **anything needing more than
  one sample of `density(p)`** — volumetric shadows, soft shadows, gobo projection through the
  medium, heterogeneous or animated density, and beam-on-beam absorption.
- **Polyline-distributed pixel runs.** A strip whose emitters follow an authored polyline rather
  than the definition's own positions, each segment still rendering its declared primitive. Not
  built, and cheap to leave so: ADR-0005 rule 1 already made the run's line a derived quantity
  (ordering, axis, extent), so substituting what supplies it is a local change
  ([ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)). The *swept-curve*
  version is genuinely out of scope rather than deferred — it would force generated geometry over
  the declared primitive, reversing ADR-0005 rule 6.
- Gobos, prisms, framing shutters. GDTF carries wheel media in the same zip.
- ~~The agent surface.~~ **[answered 2026-09-02 — #5]** It is **in v1**, and it was never one
  thing: [ADR-0014](adr/0014-the-agent-surface-is-two-surfaces.md) splits it into a **look**
  surface (a `generated` feed, §07) and a **scene** surface (an agent arranging the rig, §4.7).
  "A fourth feed implementation injecting state directly" was wrong twice — `relay` had already
  been deleted, so it is the *third*, and the half the ticket actually wanted is not a feed.

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
  current one.

  **[strengthened 2026-09-02 — #33]** The "no station" argument was expected to weaken once
  Beamhouse looked past Mizer. It did the opposite. Of MVR-xchange's six named peers **only
  grandMA3 is a console** — the rest are design and previz tools — and neither of the two other
  consoles measured on this machine speaks the protocol either: BlinderKitten has no MVR export at
  all, and MagicQ links Vectorworks' `libMVRgdtf` for *reading* only, with no xchange station.

  **[settled 2026-09-02 — [#30](https://github.com/jnslmk/beamhouse/issues/30),
  [ADR-0021](adr/0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)]** **Out of scope,
  not deferred.** The deciding ground is neither the trust boundary nor the file watcher: it is
  that MVR-xchange is a protocol **between stations**, and the population it would reach —
  BlenderDMX, Vectorworks, Production Assist, zactrack, DMXRouter; every peer but grandMA3 is a
  design or previz tool — **already reaches Beamhouse through MVR file import**. A second door onto
  a population that has one buys nothing.

  **The one condition that reopens it:** a patch source Beamhouse wants that has an xchange station
  and **no watchable file**. That is a multi-tool room, which is a redrawn destination and a fresh
  effort rather than a resumption — the same shape as ADR-0017's simulated atmosphere.

  What makes that re-entry *cheap* if it ever happens is §4.3's seam: MVR-xchange would be a
  **delivery**, a station pushing bytes, reusing the `mvr` parser unchanged.
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
~150 LOC, static bin   scene + persistence        one beam shader pair
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
│  ├─ patch/            # parse(bytes) -> Patch; delivery is not in here (ADR-0021)
│  │  ├─ patch.ts       # the interface, and the merge pass
│  │  ├─ mizer.ts       # Mizer project YAML
│  │  ├─ mvr.ts         # GeneralSceneDescription.xml, plus the id ladder
│  │  └─ snapshot.ts    # a resolved patch, inline JSON — what a share link carries
│  ├─ scene.ts          # rig state, overrides, persistence
│  ├─ feed.ts           # pluggable: live | recorded | generated (ADR-0014)
│  ├─ command.ts        # the one scene-mutation path — UI and agent (ADR-0016)
│  ├─ agent.ts          # control-channel command endpoint (ADR-0015)
│  ├─ resolve.ts        # DMX buffers → fixture attributes, 30 Hz
│  ├─ render/
│  │  ├─ fixture.ts     # GLB instance + axis rig (pan/tilt)
│  │  ├─ beam.ts        # cone + density shader
│  │  └─ strip.ts       # 1D DataTexture emissive segment
│  ├─ edit/
│  │  ├─ gizmo.ts       # TransformControls wrapper
│  │  └─ arrays.ts      # parametric generators (radial, line, grid)
│  └─ shaders/{beam.vert,beam.frag}.glsl   # the only hand-written shader (ADR-0017)
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

**[added 2026-09-02 — #33] Two other consoles are on this machine, and neither is a driver.**
They are **reference implementations to read**, recorded so their status is not mistaken again —
BlinderKitten was in the Drivers row above until #33, on the strength of an MVR-export claim that
is false.

- **BlinderKitten** (`~/git-projects/BlinderKitten`) — declares `importMVR` (`BKEngine.h:124`) and
  **no export**; the single `.mvr` hit in `Source/` is a file-open filter. Its MVR importer keys on
  `<FixtureID>` as an integer and **ignores the UUID**, falling back to `<UnitNumber>` then
  synthesising from 1000 — a second implementation independently making
  [ADR-0003](adr/0003-fixture-id-is-the-only-identity.md)'s choice. Its project file
  (`workFile.olga`, plain JSON) is watchable but **not resolvable**: `/fixtureType` names a
  project-internal type, universe is absent from the patch, and OrganicUI omits default-valued
  parameters, so fixture 1 carries no `/id` key at all.
- **MagicQ** (`/opt/magicq`, `magicq-beta 1.9.8.3-1`) — imports MVR, cannot write one, and exports a
  CSV patch list. Worth keeping for one reason: `bin/mqqt` statically links **Vectorworks' own
  `libMVRgdtf`**, the canonical GDTF/MVR implementation `gdtf-ts` is reimplementing. That makes it
  an **M4 conformance instrument**, the way #26's WLED Peek readback is one for the strip class.

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

**[qualified 2026-09-02 — #27]** The heading is true of every fixture a console knows about, and
there is exactly one bounded exception. gled2 streams Art-Net to the rig *alongside* Mizer
([ADR-0002](adr/0002-bridge-speaks-both-sacn-and-artnet.md)) and drives tubes per pixel (§01), so
universes carrying pixels that Mizer never patched are a standing feature of this rig. A **local
fixture** describes those: a `bhs:` definition plus its own universe and address, with no console
entry ([ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)). Its fixture id
is **negative**, which Mizer's `u32` cannot represent, so it can never collide with one the console
allocates. That is the whole of the exception — Beamhouse still authors no fixture a console
*does* know about.

**[corrected] The existing show is on QLC+, and is being left behind.**
`mizer-shows/OBF26_Bunte-Stube.yml` is 13 fixtures over 2 universes, every one of them
resolving via the `qlc:` provider — `qlc:GLP:impression 90 RGB` ×6,
`qlc:WLED:WLED Segment Effect` ×4, `qlc:Generic:Dimmer` ×2,
`qlc:American DJ:Fog Fury Jett` ×1 — imported from a QLC+ workspace. There are zero `.gdtf`
and zero `.mvr` files on disk.

That rig is a past show, not a constraint. The decision is to **move off QLC+**: Beamhouse
resolves GDTF only, and the OBF26 rig gets migrated onto `gdtf:` definitions where definitions exist
([#6](https://github.com/jnslmk/beamhouse/issues/6)), primarily to serve as a real test rig. Future rigs may use entirely different
lamps, which is exactly why the generic-from-GDTF goal is the first goal.

The CSV export remains a fallback — `ID,Name,Address,Manufacturer,Model,Mode` — but note it is
built by `format!` interpolation with no quoting or escaping, so a fixture named `Mover, SL`
produces a broken row. Prefer the YAML.

### 4.3 MVR, when something else writes one

MVR stays supported because it is the only interchange format that carries positions, and
because BlinderKitten exports it and BlenderDMX reads and writes it. It is a side door rather
than the spine: a zip containing `GeneralSceneDescription.xml` plus the GDTF files it
references. Use `pymvr` as the reference implementation.

**[settled 2026-09-02 — #33, [ADR-0020](adr/0020-the-live-loop-serves-patch-files-not-consoles.md)]**
This section briefly claimed that "every console that exports MVR is a supported patch source
today". That was measured and it is **empty**. Not one console reachable on this machine writes an
MVR: Mizer's `PatchExporter` has only `export_csv()`; BlinderKitten declares `importMVR` and no
export at all; MagicQ 1.9.8.3 links Vectorworks' own `libMVRgdtf` but binds only its *read* symbols,
and its manual's section is titled "MVR File Import" with no counterpart in ~31,000 lines.

**MVR is a format consoles read and design tools write.** So this is not a side door onto the
console world — it is the **front door onto a different population**: Vectorworks, BlenderDMX,
Depence, Capture. Consoles reach Beamhouse through the live repatch loop (§4.2, §4.6) or not at
all. Two doors, two populations, and ADR-0020 states the predicate that decides which door a given
source comes through.

#### The seam: format, not delivery

**[settled 2026-09-02 — [#30](https://github.com/jnslmk/beamhouse/issues/30),
[ADR-0021](adr/0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)]** MVR is one parser
of three behind one interface:

```ts
parse(bytes: Uint8Array): Patch
```

| Implementation | Reads                                              | Earned by  |
| -------------- | -------------------------------------------------- | ---------- |
| `mizer`        | Mizer project YAML                                 | §4.2, M5a  |
| `mvr`          | `GeneralSceneDescription.xml` out of an MVR zip     | §4.3, M5b  |
| `snapshot`     | a resolved patch, inline JSON                      | §9.1, M3a  |

**Delivery is deliberately outside it.** Watched, one-shot and inline are §4.6's file watcher plus
a byte source, not members of this enum — and they do not factor into it. ADR-0020's live predicate
is satisfied by *any* patch file on a watchable path, so an MVR dropped in `shows/` is **live**;
the same parser reached by drag-and-drop in the Pages viewer is not. Naming those two as different
implementations would be naming two points on a grid as if they were two values of one thing.

Three things follow, and they are the reason the seam is worth drawing:

- **Drag-and-drop is a transport, not a source.** §9.2 offers the recipient's own GDTF *or* MVR —
  the GDTF half is a **Library** input and never touches this interface at all.
- **Watching a re-exported MVR is free.** It is a byte source change, not a fourth member.
- **MVR-xchange, if §01's reopening condition ever fires, is a delivery** — a station pushing bytes
  into the `mvr` parser unchanged. A new implementation, never a refactor, which is the whole test
  #30 set for itself.

**The MVR id ladder lives inside the `mvr` parser**, not in a shared normalisation step:
`FixtureIDNumeric` → parsed `FixtureID` → `UnitNumber` → synthesised-and-surfaced
([ADR-0020](adr/0020-the-live-loop-serves-patch-files-not-consoles.md)) has no meaning for a format
that supplies a `u32` directly. Every parser emits a `Patch` whose ids are already integers, so the
merge pass below knows nothing about formats — §02's discipline for transports, ADR-0008's for
colour.

#### The definition ladder, which is a different ladder

**[settled 2026-09-02 — [#39](https://github.com/jnslmk/beamhouse/issues/39),
[ADR-0030](adr/0030-gdtfspec-resolves-inside-the-archive.md)]** The ladder above resolves a
fixture's **id**. Resolving its **definition** is a separate problem and a much shorter ladder,
because `<GDTFSpec>` is not a library key: MVR types it as a `FileName`, *"the case-sensitive name
of a file within the archive including the extension"*, and mandates keeping that file in the zip
on export.

- **The archive is the only place we look.** The embedded file *is* the definition the author
  patched against. A miss is a malformed MVR, surfaced — never a cue to substitute a library
  definition, which would trade a loud error for a silently wrong channel count.
- **Two documented malformities are tolerated, each marked.** Exact match → append `.gdtf` (the
  spec's own examples omit the extension its own type mandates) → case-insensitive (the spec
  forbids two entries differing only by case, so the retry cannot be ambiguous).
- **`GDTFMode` never guesses.** Exact → case-insensitive → the sole mode if the file offers exactly
  one. Past that the fixture stays placed, rendered and marked, with **no DMX binding**: one uuid
  can cover 17 files, 134 of which reuse a mode *name* at a different footprint, so picking the
  first of several modes is picking a channel count at random.
- **A `Fixture` with no `GDTFSpec` at all** — the spec allows it — is not a patchable fixture and
  goes to §4.x's positioned objects, not the patch.
- **Nothing is cached.** An MVR-extracted `.gdtf` has no GDTF Share `rid`, so `gdtf-manifest.json`
  could neither pin nor restore it. **An MVR therefore needs no library at all**, which is what
  makes a dropped `.mvr` work in the M3a viewer where there is none.

`gdtf-ts` is untouched by all of it: the `mvr` parser owns the zip lookup and hands over bytes,
exactly as [ADR-0004](adr/0004-gdtf-ts-is-a-published-gdtf-only-package.md) decision 6 already
described.

**`bhs:` local fixtures are a contribution, not a source.** They arrive from the `.bhs` after
whatever parser ran and merge into the patch alongside the override layer — same file, same merge
pass. ADR-0012's phrase "a limited patch source" is loose: a source *produces* a patch, and a local
fixture can never be the only thing present.

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

All four are **front-ends onto the command layer**, not direct writes to scene state — see
§4.7 and [ADR-0016](adr/0016-every-scene-mutation-is-one-undo-grained-command.md). This is a
constraint on [#35](https://github.com/jnslmk/beamhouse/issues/35) rather than a free choice
for it, and it is recorded before #35 runs because retrofitting it afterwards is the
expensive version.

**[gap noted 2026-09-02 — #35]** Those four affordances are the *only* description of the screen
anywhere in this document. There is no layout, no navigation model, and nothing that says what is
visible when the app opens — a gap the size of the ones the ADRs closed, and the one a user
actually touches. #35 carries a survey of how grandMA3, Capture 2026, BlenderDMX, DMXpressions and
Showcase solve it, with screenshots, and produces a design canvas. Four things it found that this
document should adopt on sight: **`universe.address` as one token** (Capture and BlenderDMX
converged on it independently), **a second break as suffixed columns** with `Unpatched` as a
literal value, **patch errors as in-cell glyphs rather than modals**, and **state chips that show
their value and open on click**, which is where §13's signals can live for free.

It also found the four things nobody has solved for us: the rig moves while you edit it (we never
send DMX, so we cannot hold a fixture still); the transport is wanted in the diagnostics and is
deliberately absent from the §07 frame (ADR-0007); the M3a viewer's degradation ladder (§9.2) is
entirely a UI problem with no design; and the override layer, this design's most load-bearing idea,
is invisible.

**[one of the four settled 2026-09-02 — #31]** The transport has returned, on the **control**
channel, before #35 runs ([ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md)) —
ADR-0007's rule was about the frame and is unchanged. #35 inherits it as a fact rather than a
question, along with §13's whole signal inventory: **what** must be visible is settled, **where** it
sits is #35's.

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
    "12": { "pos": [1.2, 4.1, -0.6], "rot": [0, 45, 0], "uuid": "8f3c…" }
  },
  "arrays": [{
    "id": "star",
    "members": [12, 13, 14, 15],
    "kind": "radial",
    "center": [0, 3.2, 0], "radius": 2.4, "tilt": 90
  }],
  "classes": { "diy_t8_35px": { "kind": "strip", "pixels": 35 } },
  "definitions": { "spoke23": { "kind": "strip", "pixels": 23, "pitch": 0.065 } },
  "fixtures": [
    { "id": -1, "definition": "bhs:spoke23", "universe": 4, "address": 1 }
  ]
}
```

**[added 2026-09-02 — #27]** The `definitions` block is Beamhouse's own fixture library, addressed
by the `bhs:` prefix alongside `gdtf:`/`ofl:`/`qlc:`, and it **subsumes `classes`** — which was
already a Beamhouse-side pixel count in all but name
([ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)). It binds two ways: to
a fixture the console already patched, keyed by the patch's definition id the way `classes` is
today; or, as in the `fixtures` entry above, as a **local fixture** carrying its own address and a
**negative id**. Where a `bhs:` definition and the patch disagree about extent, the definition wins
for *rendering* and the patch for *addressing*, and the mismatch is **surfaced as an error rather
than truncated** — a silently shortened strip is wrong in a way that looks right.

**[added 2026-09-02 — #33]** The optional `uuid` on an override is the **MVR re-import
reconciliation hint** ([ADR-0020](adr/0020-the-live-loop-serves-patch-files-not-consoles.md)). MVR's
mandatory key is the UUID, not `FixtureID` — which `pymvr` types as an *optional string* — so an
MVR that omits it has its integer id synthesised, and without the hint a re-import synthesises
different integers and silently drops every override. Nothing resolves, selects or arrays on the
hint; it is written on ingest and read only by the next ingest. A synthesised id is **surfaced**,
like the extent mismatch above.

**[added 2026-09-02 — [#39](https://github.com/jnslmk/beamhouse/issues/39),
[ADR-0030](adr/0030-gdtfspec-resolves-inside-the-archive.md)]** A patched fixture may carry a second
hint of the same standing, one level down: an optional **revision**, the last `<Revision>` element's
`Text` — document order, never latest date, since the X4's first two revisions run 12:31 then 10:31.
A `gdtf:` id is a `FixtureTypeID` and names a fixture *type*: 1,681 of GDTF Share's UUIDs cover more
than one file, 606 of those have revisions whose mode sets differ, and **134 reuse a mode name at a
different DMX footprint**. The hint does nothing during an MVR load — §4.3's archive already
supplied the exact file — and earns its place when that patch is saved as a `.bhs` or shared as a
snapshot, where `gdtf:<uuid>` meets a library that may hold a different revision and the mismatch
can be stated: *"patched against `rev-09`, library has `for-v16-rev3`"*. Nothing resolves, selects
or arrays on it.

**A hint carries only what the source knew.** Mizer mints a bare `gdtf:<uuid>` with no revision
anywhere in `conversion.rs`, so the 134 cases stay latent on the M5a path: a Mizer patch resolves to
*some* revision of the right fixture type and Beamhouse cannot tell which one the operator patched
against. Bounded on the MVR side, open on the Mizer side, and stated rather than assumed.

**[added 2026-09-02 — [#30](https://github.com/jnslmk/beamhouse/issues/30)]** `patch` is a **tagged
union**, one variant per §4.3 parser, and **only one of them is shareable**:

```json
"patch": { "kind": "mizer",    "path": "~/mizer/warehouse.yml" }
"patch": { "kind": "mvr",      "path": "shows/warehouse.mvr" }
"patch": { "kind": "snapshot", "fixtures": [ ... ] }
```

The path-bearing variants name files on the *sender's* disk; the inline `snapshot` is what a share
link carries (§9.1) and what makes M3a satisfiable at all. This is a fixed point on the `.bhs`
schema, not the schema — recorded the way ADR-0012's `definitions` block and ADR-0013's scene
density were, and it is the first statement anywhere of what "share" means for the patch half.

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

### 4.7 The scene is also edited by an agent

**[added 2026-09-02 — [#5](https://github.com/jnslmk/beamhouse/issues/5)]** §4.4 assumes a person
with a mouse. An agent is the second editor, and the case that motivates it is the STAR-TENT: ten
spokes, five of which must sit rotated 180° about their own mid-point
([#23](https://github.com/jnslmk/beamhouse/issues/23)) — a thing Mizer cannot represent at all,
since `FixturePosition` has no Z and no rotation.

**Every mutation goes through one command layer**
([ADR-0016](adr/0016-every-scene-mutation-is-one-undo-grained-command.md)). The gizmo, numeric
entry, the array generators and the agent are **front-ends onto it**, never parallel paths into
scene state. A command is **undo-grained**: one command, one undo entry, one thing a person would
say out loud — a drag commits *once*, on release. That is what makes an agent's edits undoable,
which is the property you need at 4pm when it rotated the wrong five spokes.

**The agent arrives over the bridge's control channel, through an MCP server**
([ADR-0015](adr/0015-agent-control-is-mcp-over-the-bridge-control-channel.md)). The bridge
forwards command envelopes **it never opens**, so §02's ignorance holds; the MCP server is a
separate process holding the tool schemas; exactly one connected client owns the scene; commands
are loopback-only, while frames may still cross §9.4's tunnel. Capture is a command — the owning
page renders and reads back inside one `requestAnimationFrame`, so no `preserveDrawingBuffer` tax
is paid by users who never ask for a screenshot.

Files are **not** the mechanism, and not because of latency — §4.6 already rebuilds in place
without dropping the socket. A `.bhs` is a whole-document write, so a file-driven agent would
read-modify-write the entire scene to move one fixture, against IndexedDB working state it never
saw.

Patch, cues, animations, triggers and MIDI are **not** part of this. The agent does that work in
Mizer, and §4.2 plus M5a already make Beamhouse follow.

**[specified 2026-09-02 — [#37](https://github.com/jnslmk/beamhouse/issues/37)]** The vocabulary
is **§15**. One correction lands here: ADR-0016's *"the MCP tool vocabulary is whatever the command
layer holds"* was too strong — the channel carries **requests** in four classes and only `command`
is that layer ([ADR-0026](adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)).
And the two writers above are now a rule rather than a habit: **commands write everything in the
`.bhs` except `patch`, ingests write only `patch`**, so §4.6's watcher can never push an entry onto
your undo stack.

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

A 35-pixel RGB tube resolves to 35 nodes × 3 bindings = 105 channels. The renderer then
recognises that run as a strip rather than 35 separate lamps.

**[corrected 2026-09-02 — #36]** This paragraph named two things that no longer exist. The
"detection heuristic is ticket 7" — collinear nodes become a strip — was replaced by
[ADR-0005](adr/0005-emitter-grouping-is-by-dmx-stride.md): grouping is by **constant DMX offset
stride**, never by spatial evenness, because the one real strip on disk is 70 % off even. And the
"`.bhs` `classes` block as an explicit override" was **subsumed into the `definitions` block** by
[ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md) (§4.5). No render-class
override was reinstated in its place
([ADR-0022](adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md) rule 6): a wrong
third-party profile is corrected in `gdtf-ts`'s quirks table, and a missing one is supplied as a
`bhs:` definition — both of which fix the file for every consumer rather than for this show.

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

**[corrected 2026-09-02 — [#38](https://github.com/jnslmk/beamhouse/issues/38)] That table is
capabilities, and this rig runs none of the sACN in it.** `mizer-shows/OBF26_Bunte-Stube.yml`'s
`connections:` are two entries, **both `type: artnet`** — a broadcast to `192.168.8.255` and a
unicast to `192.168.8.243`. So "Mizer streaming sACN" above is what Mizer *can* do, not what it
does here, and priority and `Preview_Data` are `null` on **every** universe today. Every claim in
this document about those fields being "free on exactly the universes Mizer sends" inherited that
conflation. Moving Mizer to sACN is [#44](https://github.com/jnslmk/beamhouse/issues/44), and it
changes no Beamhouse universe number — Art-Net Port-Address 0 → universe 1 and sACN universe 1 →
universe 1 are the same number
([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).

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

   **[corrected 2026-09-02 — #38] The rule is per source and per transport, and the bridge owns
   it.** `sacn` npm detects out-of-order packets and **throws before emitting**, handing back a
   bare `Error` whose universe and source name exist only inside its message string — so a
   per-source `drops` off that path would be a regex on English prose. The bridge tracks sequence
   itself. On sACN, E1.31's own rule: discard when the signed difference (new − last) falls in
   **−20..0 inclusive**, which tolerates wrap while admitting a genuine restart, and is tighter
   than the library's `Math.abs(last − seq) > 20`. On Art-Net, ArtDmx sequence is 1–255 with **0
   meaning sequencing is disabled**, so the path branches on 0 — applying a numeric rule to a 0
   discards every frame from a node that opted out, which is job 4's failure with a new cause.
   This does not reopen ADR-0006: the package keeps the packet parsing and the multicast group
   management ([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).

4. Mark a universe stale after silence and say so. Silent frozen output is the worst
   failure mode, because you debug the console instead of the network.

   **[corrected 2026-09-02 — #31] The threshold is per transport, and 2.5 s was E1.31's number
   applied to both.** 2.5 s is right for sACN — it is E1.31's network data loss timeout. It is
   wrong for Art-Net, whose specification has an input that is *active but not changing*
   re-transmit its last valid ArtDmx at **approximately 4-second intervals**. A flat 2.5 s marks a
   live gled2 holding a static look as stale, which is this job's failure mode inverted into a
   false alarm — and a false staleness alarm is worse than none, because it teaches you to ignore
   the one indicator that matters. **~6 s for Art-Net**, the spec interval plus margin
   ([ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md)).

   **[refined 2026-09-02 — #38] The threshold is per *source*, and a universe is stale only when
   *every* source is stale.** A universe fed by both transports has two thresholds and needed a
   rule; each source ages on its own transport's clock. The rollup is **all**, not any — a
   contended universe where one console falls silent still has live data arriving, and marking it
   stale would say *do not believe this* about a picture that is currently correct. This is the
   **opposite** rollup from §13.3's fixture rule, and the asymmetry is the point: breaks are
   disjoint slices of one fixture, so a silent break is *missing data*; sources are redundant
   claims on the same slots, so a silent source is *one fewer claim*
   ([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).

5. Pass through the priority and `Preview_Data` flags. **[corrected 2026-09-02 — #31] Not "a free
   blind-mode indicator" — free on sACN and unavailable on Art-Net.** E1.31 carries a priority
   octet and a `Preview_Data` options bit; ArtDmx carries neither. The table above records that
   gled2 has **no sACN at all**, so blind indication is missing on exactly the universes gled2
   sends. The bridge reports those fields as `null` there, and `null` means *this transport cannot
   tell you* — which the UI must not render as *not blind*
   ([ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md)).

   **[settled 2026-09-02 — #38] Priority is reported, never enforced — permanently.** Job 2
   forwards; nothing merges or arbitrates, and nothing ever will
   ([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)). Beamhouse never
   sends DMX; its claim is *this is what the network is doing*, and a bridge that silently
   resolves contention hides the exact fault job 4 exists to surface. A visualiser that picks a
   winner also **disagrees with the stage**, since real fixtures each run their own merge. And it
   is the only behaviour that generalises: ArtDmx carries no priority field at all. `sacn` npm's
   own `MergingReceiver` was the free-looking option and is the broken one — deprecated,
   self-described as untested, and silently wrong for every universe ≥ 10.

   **The bridge decodes the options byte itself.** `sacn` npm exposes `options` raw with a TODO
   and decodes neither flag. `Preview_Data` is bit 7 (`options & 0x80`). **Bit 6,
   `Stream_Terminated`, is now consumed too** — it is the difference between *a source left* and
   *a source died*, and without it a console releasing a universe is indistinguishable from a
   network failure for a full 2.5 s, keeping a contended universe flagged for the whole timeout
   after the second source has gone.

   **What replaces arbitration is detection.** The bridge keeps one entry per **source** per
   universe — identified by CID on sACN and by source IP on Art-Net, the only identity ArtDmx
   supplies — and a universe with more than one is **contended**. Detection keys on the *merged*
   universe number, so it spans transports: per ADR-0007 an Art-Net Port-Address 0 and an sACN
   universe 1 are the same universe 1, and that is the collision this rig sits one config change
   away from. **One packet is enough; there is no debounce** — a stray packet on a patched
   universe is precisely the fault worth naming, and §13.2's *Arriving* column carries the
   discrimination between a source at 0.03 Hz and one at 44 Hz.
6. **Merge both transports into one universe space**, sACN-numbered: an Art-Net Port-Address *p*
   is forwarded as universe *p* + 1 ([ADR-0007](adr/0007-one-universe-space-sacn-numbered.md)).
   This is the only place that mapping may live, and it is worth a test.

   **[corrected 2026-09-02 — #38] The merged space is *shared*, not collision-free.** ADR-0007
   claimed the mapping was "collision-free by construction" and conceded in the same sentence that
   the two sources are merely "expected to use distinct numbers". Port-Address *p* + 1 lands
   inside sACN's own 1–63999, so the two ranges **fully overlap**: the mapping is total and
   injective *within* Art-Net and guarantees nothing across transports. Collisions are **detected,
   not prevented** — job 5's contention bookkeeping doing the work the construction was assumed to
   do ([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).
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
{ "op": "universes", "universes": [
    { "universe": 1, "stale": false, "sources": [
        { "id": "…cid…",        "name": "Mizer", "transport": "sacn",
          "priority": 100,  "preview": false, "drops": 3 },
        { "id": "192.168.8.31", "name": null,    "transport": "artnet",
          "priority": null, "preview": null,  "drops": 0 }
    ]},
    { "universe": 2, "stale": true, "sources": [
        { "id": "192.168.8.31", "name": null, "transport": "artnet",
          "priority": null, "preview": null, "drops": 0 }
    ]}
]}
{ "op": "reload", "path": "shows/warehouse.mvr" }
```

**[extended 2026-09-02 — #37]** The control channel also carries the agent's **request** envelopes,
which the bridge forwards without opening
([ADR-0015](adr/0015-agent-control-is-mcp-over-the-bridge-control-channel.md)), and a **scene
snapshot** for a joining non-owner ([ADR-0027](adr/0027-ownership-is-implicit-and-a-non-owner-stops-saving.md))
— the same shape a share link carries, so it is not a new serialisation. Bulk stays off this socket
entirely: a capture returns a handle fetched over HTTP
([ADR-0028](adr/0028-a-capture-is-a-handle-fetched-over-http.md)).

**[revised 2026-09-02 — #31]** `universes` replaces both `stale` and `sacn_source`
([ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md)). One record per subscribed
universe, sent on change and on a slow heartbeat — a **snapshot, not a set-diff**, because §13's
read-out *is* this table and renders straight from it, and because a missed `stale` diff fails in
the direction where everything looks fine. `drops` is job 3's out-of-order count, which was
computed and discarded. `null` for `priority`/`preview` means the transport cannot supply them,
which is not the same as `false`. `sacn_source` is gone by name as well as by shape: it was named
for the only transport it could describe.

**[revised again 2026-09-02 — [#38](https://github.com/jnslmk/beamhouse/issues/38)] The record is
now source-shaped**, with `transport`, `priority`, `preview` and `drops` moved from the universe
onto a `sources[]` array
([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)). The flat record was
coherent only while every universe had exactly one source; a **contended** universe has two
priorities, and a cross-transport one has two transports, neither of which a scalar can state.
This is the second revision of a message introduced the same day, and both had the same cause —
a scalar standing in for something plural.

- **`contended` is derived** (`sources.length > 1`), never carried. ADR-0018 chose a snapshot
  precisely so the client reconstructs nothing; a carried boolean is a second chance to disagree
  with the array beside it.
- **`id` is the sACN CID, or the source IP on Art-Net**, which is the only identity ArtDmx
  supplies. `name` is E1.31's `sourceName` and is `null` on Art-Net for the same reason.
- **`null` keeps ADR-0018's meaning** — *this transport cannot tell you* — and is now `null` per
  **source**, which is what makes a mixed-transport universe describable at all.
- **`stale` stays on the universe** and is the **all**-rollup of its sources (§06 job 4).

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
([ADR-0007](adr/0007-one-universe-space-sacn-numbered.md)). Nothing in the **render path** can
tell, or needs to tell, how a universe arrived.

**[bounded 2026-09-02 — #31]** That rule is about the frame, and it stays exactly that
([ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md) amends ADR-0007's reach, not
its principle). **Diagnostics are not the render path**, and the `universes` control message above
does name the transport — because a read-out that cannot say which transport a universe came in on
cannot explain why one has no priority and another has a longer stale threshold. `CONTEXT.md`
already calls the bridge "the only component that knows how a universe arrived"; it is now also
the only one that may act on it.

Keep a `feed.ts` interface in front of it with three implementations — `live`, `recorded` and
`generated`. `relay` was removed by [ADR-0009](adr/0009-deployment-is-inferred-from-origin.md):
nothing ever defined it, and §9.4's tunnel is `live` at a different URL rather than a different
implementation.

**[answered 2026-09-02 — [#5](https://github.com/jnslmk/beamhouse/issues/5)]** `generated` takes
the slot `relay` vacated, with a definition this time
([ADR-0014](adr/0014-the-agent-surface-is-two-surfaces.md)): frames **computed** rather than
received or stored, behind one `nextFrame(t)`. It has two callers — §9.2's demo motion mode, and
an agent holding a **look**. A look carries DMX slot values, never resolved fixture attributes,
because `CONTEXT.md` defines a **Frame** as slot values and because entering above `resolve.ts` is
what makes an agent's screenshot exercise the real pipeline rather than sit on top of it.

## 08 · Rendering

### 8.1 Strips: one texture, not thirty-five objects

Render each tube as **the geometry its definition declares** — the declared `PrimitiveType`, or a
real mesh where the definition ships one — carrying a `DataTexture` of N texels sampled along the
run's axis, `LinearFilter` on.

**Which geometry, when a definition declares more than one.** The textured geometry is the
strided run's **common parent**
([ADR-0022](adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md)). "The geometry its
definition declares" was singular and the authored STAR-TENT tube declares two models — an opaque
aluminium body and the translucent diffuser that is what actually glows. A naming convention would
not generalise to a third-party profile; the parent does, reproduces `MarkeEigenbau` unchanged (its
30 references sit under `Body`, the visible 25 x 50 x 1000 mm cube), and is *checkable* — hang the
references off the wrong parent and the aluminium lights up instead of the diffuser, visibly rather
than silently. Where the parent carries no model at all — the WLED profile ships **zero**
`<Model>` elements — the emitter falls back to an emissive body of the declared `BeamRadius` and
the definition defect is surfaced. Interpolation gives the continuous COB glow for free, and it is one
draw call per fixture rather than thirty-five. A 2D matrix is the same path with an `M × N`
texture (ADR-0005). Do not substitute a cylinder for a declared `Cube`: the real
`MarkeEigenbau` strip declares a 25 x 50 x 1000 mm cube, and overriding that is the renderer
claiming to know better than the definition.

**[answered 2026-09-02 — #27]** That last rule holds, and it survives contact with Capture 2026's
definition-free **LED Strip** ([ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).
Placement mints nothing; what Beamhouse gains instead is a **third definition source**, `bhs:`,
carried inside the `.bhs` (§4.5). Distributing emitters along an authored *path* was rejected on
this rule's own terms: a declared 25 × 50 × 1000 mm `Cube` cannot be mapped along a Bézier, so a
swept path would force Beamhouse to generate geometry and discard the declared primitive — exactly
what ADR-0005 rule 6 forbids. The **polyline** form, rigid segments each keeping their primitive,
stays available unbuilt: ADR-0005 rule 1 already made the run's line a derived quantity, so
substituting its source is local. The STAR-TENT needs neither — its reversed spokes are a rigid
rotation plus translation (#21, #23).

```ts
const tex = new THREE.DataTexture(
  new Float32Array(pixelCount * 4), pixelCount, 1,
  THREE.RGBAFormat, THREE.FloatType);
tex.minFilter = tex.magFilter = THREE.LinearFilter;
// per frame: copy resolved RGB in, set needsUpdate.
```

One bloom pass over the whole scene. Resist per-fixture glow sprites. The §8.2 scattering term
renders into the same HDR target and goes through this same pass — no separate pass, no exclusion.
Its threshold is therefore a **tuned** parameter, and must be tuned *after* the haze default is
set ([ADR-0013](adr/0013-atmosphere-is-one-closed-form-scattering-term.md)); tuning it first means
the first haze you add re-tunes every colour you already tuned.

The chain is `RenderPass → UnrealBloomPass → OutputPass` from `three/addons`, and it needs no
post-processing library ([ADR-0017](adr/0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md)).
`OutputPass` carries tone mapping and the colour-space conversion, reading both off the renderer,
so §8.2's `ACESFilmicToneMapping` is a renderer setting the chain honours rather than an effect to
configure twice. `EffectComposer` allocates its default target as `{ type: HalfFloatType }` — the
HDR target above, for free.

### 8.2 Beams — write them as a density function

**[corrected 2026-09-02 — #36]** This opened "Cone geometry from each `Beam` node", which is the
same defect `CONTEXT.md`'s **Beam class** entry carried and draws thirty cones down a pixel tube.
A cone comes from each `Beam` node **whose `BeamType` is `Wash`, `Fresnel`, `PC`, `Spot` or
`Rectangle`**; `None` and `Glow` draw none
([ADR-0022](adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md)). §5.1's table was
already right — a `Beam` node is a *beam origin*, and nothing about declaring one says a cone is
drawn.

Cone geometry from each cone-drawing `Beam` node, additively blended, depth-write off, sorted back
to front, cone angle driven by the resolved `Zoom`. The cone is **added to** the emissive body
every emitter has, not chosen instead of it — which is what makes a `Wash` mover visible before
any atmosphere exists to scatter in.

**`BeamAngle` is the FULL cone angle, apex to apex.** This document, `CONTEXT.md`, ADR-0010 and
three research docs all called it a half-angle until 2026-09-02; treating it as one renders every
cone at **twice** its true width, silently, with nothing to compare against
([ADR-0013](adr/0013-atmosphere-is-one-closed-form-scattering-term.md)). `FieldAngle` shapes the
**edge falloff** only where it differs from `BeamAngle` — which across the six profiles on disk is
exactly one, the Fog Fury at 15°/25° — and otherwise degenerates to the `BeamType` soft/hard edge
(`Wash`/`Fresnel`/`PC` soft, `Spot`/`Rectangle` hard).

Structure the fragment shader as `density(p) → float` and integrate it analytically for v1.
That one choice is what lets haze become a raymarch through the same function later. Likewise,
give the beam material a projective texture uniform now, unused; gobos then become a matter of
feeding it wheel media from the GDTF zip.

Turn on `ACESFilmicToneMapping` and physically-correct lighting from day one. Retrofitting tone
mapping means re-tuning every colour you have already tuned.

ASLS Studio's `beam.frag.glsl` is the best open reference, but it is **GPL-3**: read it for
technique freely; reusing it makes your renderer GPL-3 too.

Drive strobe from a shader uniform on wall time, not by dropping frames.

#### Atmosphere — resolved 2026-09-02, [ADR-0013](adr/0013-atmosphere-is-one-closed-form-scattering-term.md)

**Yes, it lands in v1.** The seam above is only insurance if it is claimed once, and `density(p)`
integrated by nothing but the analytic path is an untested assumption. Constant-density single
scattering off a point source integrates to an elementary `atan` along the view ray — but only
because two things are dropped, and the ADR names them rather than discovering them later:

- **No extinction.** With Beer–Lambert attenuation on both legs this becomes Sun et al. (2005), a
  special function precomputed into a 2D lookup table — not one integral in a fragment shader.
- **Isotropic phase.** Henyey–Greenstein depends on an angle that varies along the ray. Forward
  scattering is what makes a beam glare when aimed at the camera; **v1's does not.**

Four more things it fixes: density is **one scene-wide uniform**, not per-fixture and never gated
by the Fog Fury's `Fog1` (which resolves to a *constant* — `PhysicalUnit="None"`, `PhysicalFrom 1
→ PhysicalTo 1` — so the rig's hazer cannot supply a level, and gating on it would blank every
beam until one fixture crosses DMX 32). Haze is **on by default**, at a low value written into the
`.bhs` rather than defaulted at read time, so a shared link carries what the sender saw. The term
**does not scale by declared `LuminousFlux`** — the Fog Fury declares the GDTF default `10000` and
three others a round `1000`, so the field is unfilled in every profile we have and would render
the fog machine as the rig's brightest source; scattering scales by resolved `Dimmer` ×
`LinearRGB` alone, and `LuminousFlux` is carried **unconsumed**, the shape ADR-0008 used for
`ColorSpace`. And the beam ends by a **soft shader falloff at one scene-wide length**, with no
geometric terminus — v1 renders no venue geometry, so nothing catches a beam.

**The deferred tier's boundary is one question: does it need more than one sample of
`density(p)`?** Volumetric shadows, soft shadows, gobo projection through the medium,
heterogeneous or animated density and beam-on-beam absorption all fail it and all stay out, as one
unit for one reason.

#### Shader authoring — resolved 2026-09-02, [ADR-0017](adr/0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md)

**Hand-written GLSL in a `ShaderMaterial` on `WebGLRenderer`, and this pair is the only shader in
the project** — §8.1's strip is a texture `map`, not a shader, so the run with a measured
conformance oracle behind it ([#26](https://github.com/jnslmk/beamhouse/issues/26)) has nothing to
rewrite. Vite's built-in `?raw` suffix loads the files; no glsl plugin.

**WebGPU is out of scope, not deferred**, and the reason is *not* that the tier above is far off.
It is that the tier does not need it: every item past the second sample of `density(p)` is
fragment-shader raymarching, and heterogeneous density wants a 3D texture, which is core WebGL2.
The one thing genuinely across the API boundary is a **simulated** medium — advected haze, the
DMXpressions headline — and that is the single condition that would reopen it. Two facts closed
the alternative rather than the deferral argument: `WebGPURenderer` **rejects `ShaderMaterial` in
the NodeBuilder**, so its WebGL2 backend is no halfway house, and TSL's `glslFn` pins native code
to one backend, so it cannot soften a later move.

### 8.3 Colour: RGB now, white channels later

v1 resolves `ColorAdd_R/G/B` and stops. Keep the seam explicit anyway — one function, one call
site.

**v1 assumes the colour space and reads the transfer function**
([ADR-0008](adr/0008-colour-space-is-assumed-transfer-function-is-read.md)). Primaries are assumed
sRGB, which is what GDTF's `<ColorSpace>` defaults to anyway; the fixture model carries no
`colorSpace` field, so there is nothing to half-consult. `PhysicalFrom`/`PhysicalTo` *is* read
wherever it is declared, and the renderer selects by attribute **name** rather than by declared
unit ([ADR-0010](adr/0010-resolution-is-total-the-renderer-selects-by-attribute.md)).

**[corrected 2026-09-02 — #31]** This sentence used to end *"`Dimmer` declares `LuminousIntensity`,
so its linearity is a stated fact, not an assumption"*. Measured across all six profiles on disk:
**every `Dimmer` `ChannelFunction` is `PhysicalUnit="None"` over 0 → 1**, and the single
`LuminousIntensity` declaration is on the `AttributeDefinitions` entry of the impression 90 profile
*we authored ourselves*. ADR-0010 had already found this and ruled the declared unit unread;
the claim survived here and at §11.2 for a day. Resolved `Dimmer` is a dimensionless 0..1 — which
is what makes §13's intensity map cheap and what stops it being photometric
([ADR-0019](adr/0019-the-intensity-map-is-relative-not-photometric.md)).

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

**[measured 2026-09-02 — [#40](https://github.com/jnslmk/beamhouse/issues/40)]** 4096 characters
holds **188 fixtures with names, 229 without** — a columnar payload, deflate, base64url. The
reference rig is **20 fixtures at 675 characters, 16% of budget**, and that is with §9.2's
definitions resolved inline ([ADR-0031](adr/0031-a-share-link-carries-resolved-definitions.md));
by id it is 464. The fallback is therefore one line of copy on a path that needs a rig ten times
this one to reach, and it gets no screen design.

### 9.2 What a URL cannot carry

**Recordings, and nothing else.** A share link carries the whole scene: §4.5's `snapshot` variant
resolves the patch inline, and **the definitions with it** — `PrimitiveType`, beam angle, emitter
count and pitch, bounding box, and the mode's channel bindings, keyed per definition with fixtures
indexing into the table. It names no `gdtf:` id the recipient must resolve and carries no
`gdtfDir`.

**[retired 2026-09-02 — [#40](https://github.com/jnslmk/beamhouse/issues/40),
[ADR-0031](adr/0031-a-share-link-carries-resolved-definitions.md)]** This section described a
three-rung **degradation ladder** — bundled definitions in `public/gdtf/`, then proxy geometry
from the declared `PrimitiveType`, then drag-and-drop. Two measurements retired it:

- **No definition on this rig ships a mesh.** All five archives in `definitions/gdtf/` hold a
  `description.xml` and, in two cases, a `thumbnail.png`. Zero meshes. So the proxy rung fires on
  **every fixture on the operator's own desktop** — proxy geometry is *the* render path, not a
  degraded one, and a recipient rendering proxies sees exactly what the sender sees. #27's
  correction (from "when no definition is available", which was self-contradictory, since
  `PrimitiveType` is a field *of* the definition) was right and moved the ladder onto an axis that
  never varies.
- **Resolving the definitions inline costs 211 characters** of the 4096 in §9.1 — 675 against 464
  — and moves the over-budget crossover from 188 fixtures to about 176. The definition half #30
  reported "unchanged" was never blocked; it was unpriced.

So there is no rung, nothing for the viewer to announce, and no recipient to tell what they are
missing. What replaces it is **the snapshot's age**, which the viewer states permanently
([ADR-0032](adr/0032-the-m3a-viewer-is-read-only.md) decision 7): a link is frozen, and *how old
is this* is the question that survives.

`public/gdtf/` keeps ADR-0009's inert-static-asset meaning for the bridge-local app, where a
dropped `.gdtf` is a **Library** entry. It is no longer part of any sharing story.

**[split 2026-09-02 — [#30](https://github.com/jnslmk/beamhouse/issues/30),
[ADR-0021](adr/0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)]** This paragraph used
to treat the patch and the definitions as one undecided problem — "a resolved-digest format, a
separate decision, not reachable today, since a `.bhs` carries `patch` and `gdtfDir` as **local
paths** the recipient cannot resolve". **They degrade differently and only one of them was ever
blocked:**

- **The patch half is solved.** §4.5's `snapshot` variant carries a resolved patch inline, with no
  path. Without it M3a's own done-when — "opens the rig on a phone" — was unsatisfiable, because
  the phone would have been handed `~/mizer/warehouse.yml`.
- **The definition half is now solved too.** It read "unchanged" here until #40 measured it. A
  snapshot resolves its definitions inline, so it names no `gdtf:` id and carries no `gdtfDir`.
  This makes every definition in a share link behave the way a `bhs:` definition already did —
  carried inline, holding no path at all
  ([ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)) — which is why the
  two are deliberately the same shape.

**Drag-and-drop is a transport, not a patch source** (§4.3): a dropped `.mvr` is bytes for the
`mvr` parser, and a dropped `.gdtf` is a **Library** entry that never reaches the patch path.

Worth building early: give a shared link a **demo motion mode** — a canned chase generated from
a seed, running on the real rig geometry. **[owned 2026-09-02 — #5]** This is not its own
mechanism: it is the `generated` feed of §07, sharing one `nextFrame(t)` with the agent's held
look ([ADR-0014](adr/0014-the-agent-surface-is-two-surfaces.md)).

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
| M3b | Agent surface | An agent configures the STAR-TENT's ten spokes in 3D and screenshots it | 1 d   |
| M4  | gdtf-ts       | An arbitrary GDTF patches and its real GLB renders with working pan/tilt| 3–5 d |
| M5a | Mizer patch   | Beamhouse reads the project YAML; repatching updates the rig live       | ½ d   |
| M5b | MVR import    | The committed MVR in `shows/` loads and its overrides merge cleanly     | 1 d   |
| M6  | Beams         | Six movers in haze, cones and strobe correct; an X4 patched in for zoom | 1–2 d |
| M7  | Record/replay | A committed `.bhr` plays back through the same shared link              | 1 d   |

M4 is the wall; §5.0 is what makes it survivable.

**[M5b re-targeted again 2026-09-02 — [#30](https://github.com/jnslmk/beamhouse/issues/30)]** Its
clause read *"a rig exported from BlenderDMX loads"* and was **unsatisfiable**: BlenderDMX is not
on this disk. Blender 5.2.0 LTS is installed at `/usr/bin/blender` with `print3d_toolbox` as its
only extension, and `import pymvr` fails. ADR-0020 had just re-targeted M5b off BlinderKitten for
having the same defect, and reproduced it in the same commit. The done-when now names a **committed
file** — an MVR generated once and checked into `shows/` — so it is checkable from a clean clone
forever. Installing BlenderDMX is a bench decision, not a milestone gate.

**The rule, since this is the third instance** (M6's zoom, M5b twice): a milestone's done-when may
name a **file in this repo** or a **capability**, never a third-party tool that has to be installed
for the clause to parse.

**[M6 rewritten 2026-09-02 — #28]** Its clause read "six movers, volumetric cones, **zoom** and
strobe correct" and was **unsatisfiable**: the six movers are impression 90s with a fixed 10° lens
and no `Zoom` channel, and the X4 — the only profile on disk that has one — is not in the show. M6
now patches an **impression X4** the rig does not own, which makes it the first milestone to use
M4's "arbitrary GDTF" capability as an *instrument* rather than as a feature. The X4 replaces a
standalone impression 90 in that role: testing "an arbitrary GDTF" against a profile we authored
ourselves is circular. Strobe is unaffected — both the impression 90 and the Fog Fury carry
`Shutter1Strobe`. M6 is also where the [ADR-0013](adr/0013-atmosphere-is-one-closed-form-scattering-term.md)
haze term is **shown**; it is not validated there, because there is no ground truth for "looks like
a beam" and no oracle can be built for one.

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

**[added 2026-09-02 — [#5](https://github.com/jnslmk/beamhouse/issues/5)]** **M3b sits before the
wall for the same reason M3a does.** The scene surface (§4.7) needs M2 and M3 and explicitly *not*
M4: the STAR-TENT is a `bhs:` definition rendered as proxy geometry
([ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)), and the strip
profile ships no meshes at all ([#2](https://github.com/jnslmk/beamhouse/issues/2)), so nothing in
the motivating case waits on `gdtf-ts`. Putting the way the rig is most likely to actually get
configured behind a 3–5 day wall makes it the first casualty if the wall overruns.

**M3 gains a constraint rather than a sibling.** The command layer
([ADR-0016](adr/0016-every-scene-mutation-is-one-undo-grained-command.md)) lands *with* the scene
editor, not with M3b — M3b adds the transport, the MCP server and capture on top of a layer that
already exists.

## 11 · Open questions

These are the wayfinder map's tickets. See the map issue for current state.

1. **Strip detection heuristic.** Collinear-references-become-a-strip holds for tape and bars,
   breaks on a matrix panel. Future rigs may add fixture kinds that fit neither class.
2. ~~**Colour space.**~~ **Answered:** the colour space is assumed, the transfer function is read
   ([ADR-0008](adr/0008-colour-space-is-assumed-transfer-function-is-read.md)). "Linear sRGB" was
   two assumptions under one name; GDTF's `<ColorSpace>` defaults to sRGB, and only the
   `ColorComponent` → radiance reading is genuinely assumed. (**[corrected 2026-09-02 — #31]** this
   read "and `Dimmer` declares `LuminousIntensity`" — measured false in all six profiles; see
   §8.3.) The
   enumeration is a branded `LinearRGB` type rather than a marker convention, so correcting it is
   a compiler error, not archaeology. Surfaced #25.
3. ~~**Agent surface.**~~ **Answered:** it was **two** surfaces sharing a word
   ([ADR-0014](adr/0014-the-agent-surface-is-two-surfaces.md)). The **look** half is a feed and is
   `generated` (§07), carrying DMX slot values so it *does not* bypass resolution — "bypassing
   DMX" was the wrong instinct, since entering above `resolve.ts` is the whole value. The **scene**
   half — an agent arranging the rig (§4.7) — is not a feed at all, and is where the real want
   turned out to be. "Nearly free" held only for the half nobody was asking for. Surfaced
   [ADR-0015](adr/0015-agent-control-is-mcp-over-the-bridge-control-channel.md) and
   [ADR-0016](adr/0016-every-scene-mutation-is-one-undo-grained-command.md).
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

10. ~~**Does placement ever mint emitters a definition did not declare?**~~ **Answered: no —
    placement mints nothing, and Beamhouse gains a third *definition* source instead** (#27,
    [ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)). Four of the
    ticket's premises were false: arrays take existing fixture ids, §9.2 mints no geometry, the
    STAR-TENT needs only a rigid transform, and ADR-0005 rule 8 had already ruled. The real
    justification turned out to be **gled2**, not Capture — it streams pixels Mizer never patched,
    so a **local fixture** (`bhs:` definition, own address, negative id) describes them. Swept
    paths are out of scope; the polyline form stays unbuilt but cheap.
11. **Does v1 render atmosphere?** (#28) The whole field's headline feature against §01's
    deferred render tier. See §8.2.
12. ~~**Raw GLSL or node material?**~~ **Answered: hand-written GLSL, and WebGPU is out of
    scope** (#29, [ADR-0017](adr/0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md)).
    Not decided on the deferral argument: `WebGPURenderer` **rejects `ShaderMaterial`** in the
    NodeBuilder so its WebGL2 backend is no halfway house, `glslFn` is backend-pinned, the
    hand-written surface is **one** pair rather than two — the strip is a texture `map` — and the
    ADR-0013 tier is fragment-shader raymarching WebGL2 reaches. Closes §12 outright rather than
    half of it: `postprocessing` leaves the table and `three` pins exactly.
13. ~~**Is MVR-xchange a ceiling we accept, and where is the seam?**~~ **Answered: out of scope,
    and the seam is format rather than delivery** (#30,
    [ADR-0021](adr/0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)). Excluded, not
    deferred — every peer but grandMA3 is a design tool, and that population already has a door.
    The seam is `parse(bytes) -> Patch` with `mizer`, `mvr` and `snapshot`; delivery stays outside
    it, so a pushing station would be a byte source reusing the `mvr` parser. The ticket's "three
    real sources" **counted drag-and-drop**, which is a transport, and **missed the URL fragment** —
    which is what exposed M3a as unsatisfiable. Also re-targets M5b, again.
14. ~~**Which consoles does Beamhouse serve?**~~ **Answered: the live repatch loop serves patch
    files, not consoles** (#33, [ADR-0020](adr/0020-the-live-loop-serves-patch-files-not-consoles.md)).
    Any patch file on a watchable path whose definitions name a library Beamhouse resolves. Mizer is
    the only source that passes; BlinderKitten and MagicQ fail because both flatten a GDTF into their
    own channel model. ADR-0003 stands, **amended** with an MVR ingest ladder and a UUID
    reconciliation hint. Opens the `GDTFSpec` → `gdtf:` resolution rule as its own question.
15. **What does the screen look like?** (#35) The whole UI — navigation model, notation, where the
    bridge's signals live, and the M3a viewer's degradation ladder. Surveyed against the field
    with screenshots; deliverable is a design canvas and the layout of §13.
16. ~~**Does anything consume the bridge's signals?**~~ **Answered: §13, and four of the ticket's
    premises were false** (#31, [ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md)
    and [ADR-0019](adr/0019-the-intensity-map-is-relative-not-photometric.md)). Blind and priority
    are **sACN-only**, so they are absent on exactly the universes gled2 sends; the 2.5 s stale
    threshold is E1.31's and **false-alarms on Art-Net**, whose idle re-transmit is ~4 s; priority
    is an **arbitration** rule carried as a decoration, since nothing merges; and no profile
    resolves `Dimmer` to a photometric quantity, so "false colour" is a name for something v1
    cannot compute. Amends ADR-0007's *reach* — the transport returns on the control channel, never
    in the frame. Surfaced #38.
17. ~~**Does the bridge arbitrate sACN priority, or forward every source?**~~ **Answered: it
    detects and never arbitrates, and three more premises were false** (#38,
    [ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)). The rig has **no
    sACN in it at all** — Mizer's two connections are both `type: artnet`, so priority and blind
    are `null` on every universe today and the sACN case the ticket asked about cannot arise here
    (#44 moves it). ADR-0007's "collision-free by construction" is **false** — the mapped Art-Net
    range sits inside sACN's own, so the real case is **cross-transport** contention, which the
    ticket never raised. ADR-0018 promised a `contended` flag with **no field on the wire to carry
    it**. And `sacn` npm already ships an arbitrator that is deprecated, self-described as
    untested, and silently wrong for every universe ≥ 10. The record becomes **source-shaped**,
    the stale threshold becomes per source with an **all**-rollup, `Stream_Terminated` is consumed,
    and the bridge takes over sequence tracking. Per-slot HTP/LTP merging is **out of scope**.
    Surfaced #44.

18. ~~**What is the agent's tool vocabulary, and who owns the scene?**~~ **Answered: four request
    classes, fourteen commands, and ownership is implicit** (#37,
    [ADR-0026](adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md),
    [ADR-0027](adr/0027-ownership-is-implicit-and-a-non-owner-stops-saving.md),
    [ADR-0028](adr/0028-a-capture-is-a-handle-fetched-over-http.md)). The ticket's premise —
    ADR-0016's *"the vocabulary is whatever the command layer holds"* — was **false on its own
    acceptance case**, which opens with a read and ends with a screenshot. See §15.

## 12 · Dependencies

The **browser** table is settled as of 2026-09-02, by
[ADR-0017](adr/0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md) — which was what
[#29](https://github.com/jnslmk/beamhouse/issues/29) was chartered to close. The **bridge** table
is settled by [ADR-0006](adr/0006-bridge-is-typescript-on-bun.md).

| Package                | Version | Role                                             | Licence |
| ---------------------- | ------- | ------------------------------------------------ | ------- |
| `three`                | `0.185.1` | renderer, GLTFLoader, TransformControls, EffectComposer | MIT     |
| `fflate`               | ≥0.8    | unzip GDTF and MVR in the browser                | MIT     |
| `vite`                 | ≥6      | dev server, HMR, static build                    | MIT     |
| `vite-plugin-singlefile`| ≥2     | inline everything into one `.html`               | MIT     |

**`three` is pinned exactly, and that is not tidiness.** It ships breaking changes in every minor
— r183 renamed `PostProcessing` to `RenderPipeline`, r185 renamed TSL functions and changed
`WebGPURenderer`'s premultiplied alpha — so a floor-only pin lets an unrelated `npm install`
change how the rig renders, with nothing to compare the result against. Bumping it is a deliberate
commit, and the bump is where the renderer gets looked at.

**`postprocessing` is deliberately absent.** §8.1's chain comes from `three/addons`, so the one
dependency that would have been pulled in for a single bloom effect is gone — and with it its
`three: ">= 0.168.0 < 0.186.0"` peer ceiling, which under the old `≥0.170` floor admitted
resolutions the post chain forbids. There is no glsl plugin either: Vite's `?raw` loads the
shaders.

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

## 13 · The UI: signal health and diagnostics

**[added 2026-09-02 — [#31](https://github.com/jnslmk/beamhouse/issues/31)]** This section is the
**signal inventory** — what must be visible and what each signal means. It is deliberately not a
layout: **where** any of it sits on screen is [#35](https://github.com/jnslmk/beamhouse/issues/35),
which surveys the field and produces a design canvas. Its fog note already reserves *state chips
that show their value and open on click* for most of what follows.

§06 gives the bridge seven jobs; jobs 3, 4 and 5 produce four signals, and until now nothing in
this document consumed any of them. Job 4 names the reason it matters in its own words: *silent
frozen output is the worst failure mode, because you debug the console instead of the network.*
The bridge prevents the silence. This is where it stops being silent.

### 13.1 Signal health belongs to the feed

Every signal here is a fact about a **live network**, so it is a property of the **feed**, not of
the renderer ([ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md)):

| Feed | What signal health shows |
| ---- | ------------------------ |
| `live` | the universe read-out below, and per-fixture staleness |
| `recorded` | timeline position. **No staleness** — a recording is not silent, it is finished |
| `generated` | "no network". Frames are computed; there is nothing to be stale |
| §9.2 Pages viewer | nothing. There is no bridge to ask |

Off a live feed these signals are **unreachable, not false**. This is the load-bearing half: if
staleness merely evaluated false, a shared link running §9.2's demo motion mode would ship a rig
that looks fine; if it evaluated true, every shared link would ship a greyed-out rig. The mode
ADR-0014 put on the `generated` feed exists to make a shared link look *alive*.

### 13.2 The universe read-out

One row per subscribed universe, rendered straight from §07's `universes` snapshot. This is the
panel you look at when the rig looks wrong.

**[revised 2026-09-02 — [#38](https://github.com/jnslmk/beamhouse/issues/38)] The row is a
universe; the columns after the first two belong to a *source*.** A universe with one source reads
as a single row, which is every universe on this rig today; a **contended** one expands to one
sub-row per source. Six of the eight columns move with it, because a universe with two sources has
two priorities ([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).

| Column | Source | Scope | Notes |
| ------ | ------ | ----- | ----- |
| Universe | `universe` | universe | sACN-numbered, always — ADR-0007. An Art-Net Port-Address is never shown |
| Stale | `stale` | universe | the **all**-rollup of its sources; the sub-row says which threshold applied |
| Source | `id` / `name` | source | sACN CID and `sourceName`; on Art-Net the source IP, and `name` is `null` |
| Transport | `transport` | source | control channel only; never in the frame |
| Arriving | derived | source | frames seen, and at what rate. This is what separates a stray packet from a live console |
| Priority | `priority` | source | **observed, never enforced** — see below |
| Blind | `preview` | source | `Preview_Data`. sACN only |
| Drops | `drops` | source | job 3's out-of-order count, tracked by the bridge |

**`null` is a third state and must render as one.** Priority and blind are `null` on every Art-Net
universe, permanently. *Unknown* and *not blind* are different claims, and the operator would act
on the second. Render `null` as "—" or an equivalent, never as an unlit indicator.

**Priority is what a source claims, not what the bridge enforces — and that is now permanent.**
ADR-0018 wrote "if arbitration is adopted, this column's label changes with it". It has not been
adopted and will not be: Beamhouse detects contention and never resolves it
([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)). **Observed, not
enforced** is the final wording.

**A universe with more than one source is `contended`, across transports.** Not just two sACN
sources: per ADR-0007 an Art-Net Port-Address 0 and an sACN universe 1 are both universe 1, and
that is the collision this rig is one config change away from. **One packet is enough** — there is
no debounce, because a stray packet on a patched universe is exactly the fault worth naming, and
the *Arriving* column is what tells a 0.03 Hz stray from a 44 Hz console.

### 13.3 Staleness on a fixture

A fixture is stale if **any** of its breaks' universes is stale, and it renders **wholly** stale
([ADR-0011](adr/0011-a-fixture-is-addressed-per-break.md)). Not half.

A 230-pixel strip spanning two universes with one break frozen would otherwise draw half live and
half frozen — which is §06 job 4's failure made *more* convincing by the live half, because the
moving half is the evidence you would trust. The STAR-TENT is exactly this fixture: #23 patched it
across Beamhouse universes 2 and 3.

Staleness is a **trust** signal, so it must read as "do not believe this", not as "this fixture is
off". A fixture at zero and a fixture whose data stopped look identical at full brightness zero,
and only one of them is a problem.

### 13.3a Contention on a fixture

**[added 2026-09-02 — #38]** Every fixture on a **contended** universe is marked the same way, in
[ADR-0025](adr/0025-trust-and-provenance-marks-are-additive.md)'s additive vocabulary rather than
a second notation ([ADR-0029](adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).

The universe is **still drawn**, flicker and all: the frame is last-writer-wins, which is true of
the wire and true of no single console. Freezing or blanking it would discard real data and
re-create §06 job 4's silent-frozen-output failure by hand. But flicker alone is **not
diagnostic** — a strobe chase, a three-source conflict and a failing switch look identical at the
fixture.

The two marks must read differently, because they are different claims:

| Mark | Claim | What the operator does |
| ---- | ----- | ---------------------- |
| **stale** | *this is old* | look at the network, or at the console that went quiet |
| **contended** | *this is disputed* | look at the read-out and find out **who else** is sending |

Note the rollups run opposite ways and both are right. A fixture is stale if **any** break is
stale (§13.3), because breaks are disjoint slices and a silent one is missing data. A universe is
stale only if **every** source is stale (§06 job 4), because sources are redundant claims on the
same slots and a silent one is one fewer claim.

### 13.4 Blind indication

`Preview_Data` set means the console is deliberately not driving the stage — the output is a
preview, so what Beamhouse draws is *correct* and *not what the audience sees*. It reads as a
mode, not a fault. On Art-Net there is no such flag and the state is **unknown**, per §13.2.

### 13.5 The intensity map

A render mode that shades every emitter by its resolved intensity, for spotting the fixture at 3%
that should be at 30% ([ADR-0019](adr/0019-the-intensity-map-is-relative-not-photometric.md)).

- It reads **resolved per-emitter intensity**, off the resolved `LinearRGB` after `Dimmer` — not
  per-fixture `Dimmer`. §8.1 already carries an N-texel `DataTexture`, so the values exist. For a
  single-emitter fixture the two readings are identical; for a strip, only the per-emitter one can
  show a dead pixel run, which #23's per-pixel cutover just made possible.
- It is **relative**. It compares emitters within one rendered frame and carries no unit and no
  absolute reference.
- **It is not false colour**, and must not be labelled as such. The field's false colour is
  illuminance at a surface in lux; v1 renders no venue geometry (ADR-0013 ends beams at a soft
  falloff with no geometric terminus), and no profile on disk carries a credible `LuminousFlux` —
  the Fog Fury declares the GDTF default. **v1 makes no photometric prediction**, and that is a
  stated non-claim rather than a gap.
- It is not in ADR-0013's deferred tier: that tier is fenced at the second sample of `density(p)`,
  and a shading swap samples no density.

### 13.6 Still owed to #35

The degradation ladder of §9.2 and the invisibility of the override layer (§4.5) are UI problems
with no design, and §4.4 lists both. Neither is signal health, and neither is settled here.

**[both answered 2026-09-02 — #35]** The override layer is settled by
[ADR-0025](adr/0025-trust-and-provenance-marks-are-additive.md) and §14.3; the degradation ladder
is now [#40](https://github.com/jnslmk/beamhouse/issues/40). §14 is where this section's inventory
was given a place to sit.

## 14 · The UI: layout, navigation and notation

**[added 2026-09-02 — [#35](https://github.com/jnslmk/beamhouse/issues/35)]** §13 is the signal
*inventory* — **what** must be visible. This is **where** it sits, and the rest of the screen with
it. §4.4's four editing affordances were, until now, the only description of the UI in this
document.

The canvas: **[Beamhouse UI](https://claude.ai/code/artifact/55aa72b4-ab78-4d5c-91e4-71c992fca7b5)**
— seven artboards, editable in place. A snapshot of it lives in the repo as the implementation
reference, with the design tokens, metrics and the generator that produces the artboards:
[`docs/design/ui-canvas/`](design/ui-canvas/README.md). The published canvas is the one the tickets
link and can move ahead of that folder; the README says how to reconcile them.

It is drawn on top of the command layer
([ADR-0016](adr/0016-every-scene-mutation-is-one-undo-grained-command.md)), not against scene
state, so **every affordance it draws is also an agent tool and anything it omits the agent cannot
do either**.

### 14.1 The shape of the screen

Viewport-dominant; **nothing is docked**
([ADR-0023](adr/0023-the-chip-bar-is-the-navigation.md)). Eight state chips across the top are the
navigation — each shows its current value and opens **one** tabbed overlay at its tab — plus a left
tool rail.

| Chip | Shows | Opens |
| ---- | ----- | ----- |
| Feed | `live` / `recorded` / `generated` — §13's table keys off this | — |
| Universes | count and worst state (`5 · 1 stale`) | Universes |
| Patch | the watched file, and the count of unreconciled items | Issues |
| Selection | `4 · Spoke 3 +3` | Fixtures |
| Render | `normal` / `intensity map` (§13.5) | — |
| Hold | the selection pin ([ADR-0024](adr/0024-a-selection-hold-pins-the-render.md)) | — |
| Snap | grid step | — |
| Camera | named view | — |

The overlay's tabs are **Fixtures · Objects · Universes · History · Issues**. There is no ninth
chip for issues: the count rides **Patch**, because every issue class originates in an ingest.

**First run is the empty grid**, not a start screen — §4.6 auto-saves to IndexedDB, so the honest
normal case is that the app opens where you left it. The picker takes **Mizer YAML and MVR**, and
refuses a BlinderKitten `.olga` or a MagicQ CSV **with the reason**
([ADR-0020](adr/0020-the-live-loop-serves-patch-files-not-consoles.md) measured that neither names
its definitions resolvably) rather than with a parse error, which would send you to debug the wrong
thing.

Off a live feed the bridge-dependent chips are **absent, not greyed** — §13 says those signals are
*unreachable, not false*.

**[superseded 2026-09-02 — [#40](https://github.com/jnslmk/beamhouse/issues/40)]** The rest of
this paragraph read "the Pages viewer therefore runs the same shell minus those chips, with a
persistent viewer indication in the chrome, after Vectorworks Showcase's purple border". Measured,
that shell is **561 px wide against a 390 px phone**. The viewer's chip set, its indication and
its layout are §14.6.

### 14.2 The notation, adopted from the field

Four of these `§4.4` already said to adopt on sight; #35's survey supplied two more.

- **`universe.address` as one token** — `20.102`. Capture 2026 and BlenderDMX converged on it
  independently.
- **A second break as a suffixed column set** — `Patch #2`, `Mode #2` — with **`Unpatched` as a
  literal value**. [ADR-0011](adr/0011-a-fixture-is-addressed-per-break.md) rendered as UI, and it
  degrades correctly: a one-break fixture shows the columns empty rather than the UI changing
  shape. `Unpatched` is a literal in the *primary* column too, for a fixture placed but never
  addressed.
- **Patch errors as in-cell glyphs, never modals** — Capture's interlocking circles for an overlap.
- **The table and the viewport are one selection**, bound both ways. Universal across all five
  surveyed products.
- **Multi-row edit with no modifier keys** (Capture).
- **`Editable` as a toggle on the table itself** rather than a separate edit surface (BlenderDMX).
  It earns its place because the table is *summoned* here, so "open it to look" and "open it to
  edit" want to be distinguishable.

### 14.3 The four nobody had solved

#35 was worth more for where the survey ran out than for what it found.

1. **The rig moves while you edit it.** Settled:
   [ADR-0024](adr/0024-a-selection-hold-pins-the-render.md).
2. **Transport wanted in diagnostics, absent from the wire.** Already settled before #35 ran, by
   [ADR-0018](adr/0018-signal-health-is-one-per-universe-snapshot.md) — it returned on the
   **control** channel, and ADR-0007's rule about the frame is untouched.
3. **The override layer is invisible.** Settled:
   [ADR-0025](adr/0025-trust-and-provenance-marks-are-additive.md), which also gives the three
   homeless "must be surfaced" requirements of ADR-0012, ADR-0020 and §4.5 one shared **Issues**
   surface.
4. **The M3a viewer's degradation ladder** (§9.2). Settled, by retiring it:
   [ADR-0031](adr/0031-a-share-link-carries-resolved-definitions.md) measured the ladder out of
   existence and [ADR-0032](adr/0032-the-m3a-viewer-is-read-only.md) designed the screen that was
   left. §14.6. **All four are now closed.**

### 14.4 What the screen shows besides fixtures

**[opened 2026-09-02 — #35]** An implicit **ground plane at `y = 0`** always exists, and beam pools
land on it whether or not any scenery is placed — which keeps the pool a *render* decision,
independent of scene objects. A **stage and human proxies** are wanted as scale reference, and the
pool is the grandMA3 *spot reflection* fader rather than a lighting solution. Both are
[#43](https://github.com/jnslmk/beamhouse/issues/43), which also carries the amendment they force
on [ADR-0013](adr/0013-atmosphere-is-one-closed-form-scattering-term.md)'s finding 6.

Fixtures and objects share **one selection space and one command layer** — you can select a
musician and a mover together and align them — but a **separate `Objects` tab**, because the
Fixtures table's columns are patch columns and a human proxy has none of them.

### 14.5 Still owed

Both of §13.6's items had tickets rather than silence. **[#40 is now closed — see §14.6.]**
[#41](https://github.com/jnslmk/beamhouse/issues/41) remains: `bhs:` definition authoring, the
screen for [ADR-0012](adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)'s third
definition source, which **no surveyed product has**, because none of them has a definition source
of its own.

Added by #40: [#45](https://github.com/jnslmk/beamhouse/issues/45), the recording transport
(§9.3) on the same link — the only part of the viewer with prior art to copy, and a second
interaction model on a screen §14.6 gives two chips.

### 14.6 The M3a viewer, on a phone

**[added 2026-09-02 — [#40](https://github.com/jnslmk/beamhouse/issues/40)]** The share link's
screen, and the only capability in this design that nothing in the field survey also does. Two
artboards on the canvas: [`Phone`](design/ui-canvas/renders/Phone.png) (390 × 1688 — resting, and
one fixture tapped) and
[`PhoneLandscape`](design/ui-canvas/renders/PhoneLandscape.png) (844 × 390).

**It is read-only** ([ADR-0032](adr/0032-the-m3a-viewer-is-read-only.md)). Tap-to-select and orbit
are the whole interaction: no gizmo, no numeric entry, no array generators, **no tool rail**. The
command layer is not reachable from a shared link, and neither is the agent surface — a link has
no bridge, so it has no second editor either. §9.2's drag-and-drop survives as §4.3's *transport*
and is a desktop affordance; the phone does not offer it.

**Two chips, not eight.** Measured through the canvas's own `parts.py` at 390 px: the desktop set
is **1015 px**, §14.1's four survivors are **561 px**, and `Selection` + `Camera` is **328 px**.
So the rule is not *bridge-dependent chips go* — it is **a chip earns its place by being
actionable**. `Render`, `Snap` and `Hold` would all evaluate on the viewer and go anyway, because
there is nothing to snap, nothing to pin the render against, and no repatching to do. Applied to
the desktop the test changes nothing, which is what keeps it one navigation model.

| | Desktop | Viewer |
| --- | --- | --- |
| Chips | eight | **`Selection` · `Camera`** |
| Wordmark slot | `Beamhouse` | **`Beamhouse · demo`** — the feed, §13.1 |
| Tool rail | ten tools | absent |
| Overlay | five tabs, summoned | the fixture list, docked |
| Chip bar | 44 px, 28 px chips | 56 px, **44 px** chips |

**The wordmark slot is the viewer indication, and it carries the feed.** Showcase's purple border
costs ~8 px on every edge of a 390 px screen and reads as chrome damage. The `mark` element is
already there. This is also the answer to the sharpest thing #40 asked: a viewer on ADR-0014's
`generated` feed **must not imply the frames are the rig's**, and the feed is the one piece of
state a viewer genuinely has. Stating it in the mark costs no bar width — which is what makes
dropping the `Feed` chip affordable.

**Portrait gives the viewport a band, and says to turn the phone.** The viewport is 1.63:1 and a
390 × 844 phone is 0.46:1: the whole rig at full width is a **240 px strip on an 844 px screen**.
No framing fixes that. So portrait spends **320 px** on the rig — the largest band that still
slices to the rig's own content span rather than cropping into it — and the rest on the fixture
list, and the payoff frame is the phone **turned sideways**, where 844 × 390 is 2.16:1 and the rig
gets the screen. This is the one place the viewer departs from ADR-0023's *nothing is docked*, and
it is not a preference: a docked band is what 0.46:1 leaves.

**The five-tab overlay collapses to the fixture list.** `Universes` has no bridge to read,
`History` no commands to show, and `Issues` nothing to reconcile — §9.2's link arrives already
resolved. `Fixtures` remains, with `Objects` ([#43](https://github.com/jnslmk/beamhouse/issues/43))
beside it when non-empty. It is docked rather than summoned because on a phone there is no
viewport left to summon it over. §14.2's notation is unchanged: `universe.address` as one token,
the table and the viewport bound both ways.

**The chip carries the count, the sheet carries the identity.** `SEL 4`, never
`SEL 4 · Spoke 3 +3` — which measures 393 px and overflows a 390 px bar. The count keeps the bar a
constant width; the sheet has all 390 px to name things in.

**What the viewer states instead of a rung.** §9.2's ladder is retired
([ADR-0031](adr/0031-a-share-link-carries-resolved-definitions.md)), so there is no rung to
announce. A link is **frozen**, so the viewer states its age — `Snapshot · 2 Sep 14:02`,
persistent in the viewport — and the fixture sheet says the definitions travelled in the link.
*How old is this* is the recipient's real question, and it is the one the ladder was going to
answer badly.

Not settled here: the recording transport (§9.3) is
[#45](https://github.com/jnslmk/beamhouse/issues/45), and `Objects` on the viewer is #43's.

## 15 · The agent scene surface: the request vocabulary

**[added 2026-09-02 — [#37](https://github.com/jnslmk/beamhouse/issues/37)]** §4.7 says an agent is
the second editor and [ADR-0015](adr/0015-agent-control-is-mcp-over-the-bridge-control-channel.md)
says how it arrives. This is **what it can say**.

### 15.1 Four request classes, and only one is the command layer

[ADR-0016](adr/0016-every-scene-mutation-is-one-undo-grained-command.md) closed with *"the MCP tool
vocabulary is whatever the command layer holds"*, and that turned out to be **wrong on #37's own
acceptance case** — *"enumerate the rig, build a ten-member radial array, rotate five members 180°
about their own mid-points, capture"* opens with a read and ends with a screenshot. The control
channel therefore carries **requests**, in four classes
([ADR-0026](adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)):

| Class | Mutates | Undoable |
| ----- | ------- | -------- |
| `command` | the scene | **yes** |
| `query` | nothing | no |
| `capture` | nothing | no |
| `look` | the **feed** ([ADR-0014](adr/0014-the-agent-surface-is-two-surfaces.md)) | no |

All four are **one MCP server**. ADR-0014 split the agent surface in two, but the split is in what
the requests *reach*, not in how they arrive — and a capture is worthless if the rig is dark, so
shipping `capture` without `look` would ship half a tool.

### 15.2 The commands

Fourteen, and they are the whole editing surface: **the UI draws no affordance that is not one of
these, and the agent can do nothing else.** Sources are §4.4's four affordances, the History rows
of #35's canvas, and ADR-0012's two bindings.

| Command | Writes |
| ------- | ------ |
| `move(ids, …)` | overrides |
| `rotate(ids, …, pivot)` | overrides |
| `align(ids, axis, mode)` | overrides |
| `distribute(ids, axis)` | overrides |
| `revert(ids, fields?)` | overrides |
| `array.create(ids, kind, params)` | arrays |
| `array.set(arrayId, params)` | arrays |
| `array.dissolve(arrayId)` | arrays |
| `define(defId, kind, params)` | definitions |
| `map(patchDefId, bhsDefId)` | definitions |
| `fixture.add(defId, universe, address)` / `.remove(id)` | fixtures |
| `object.place(kind, params)` / `.remove(id)` | objects |
| `camera.saveView(name)` | views |
| `scene.new()` | all |

**Nothing here writes `patch`.** That is ADR-0026's second rule and it is §4.5 generalised: the
patch and the override layer are separate writers, so **ingests write only `patch` and commands
write everything else**. Undo therefore covers the evening of positioning §4.5 calls the thing
worth saving, and never tries to rewind a file read — which matters because §4.6's watcher fires
ingests *without anyone asking*.

Three of the rows are load-bearing beyond their own behaviour:

- **`array.set` re-places every member as one command** — the canvas's own note — and must do so
  **without discarding the members' overrides**. That is the same merge §4.5 performs on
  re-import, applied to a second writer.
- **`object.place` is a command *class* whose parameter space is
  [#43](https://github.com/jnslmk/beamhouse/issues/43)'s to fill.** Naming it now is what keeps
  #43 from inventing a parallel path into scene state.
- **`camera.saveView` is a command and the camera *pose* is not.** A named view is stored in the
  `.bhs` and survives a reload; anything that writes the `.bhs` and is not `patch` is a command.

### 15.3 The queries

`rig.list` · `fixture.get` · `issues.list` · `universes.get` · `history.list` · `select` ·
`measure` · `camera.set` · `hold` · `undo` · `redo`.

**Every query returns the marks** — [ADR-0025](adr/0025-trust-and-provenance-marks-are-additive.md)'s
stale, overridden and patch-overlap badges, ADR-0012's extent mismatch, ADR-0020's synthesised ids,
§9.2's missing-definition placeholder. A read path that drops them re-opens the hole ADR-0025
closed: an agent given bare geometry will confidently place a fixture that is drawing as a
placeholder because its definition is absent, and report success.

Three of these are not obviously reads. **`undo`/`redo` move the cursor and earn no entry of their
own** — the one place where "the tools are the command layer" is false in the useful direction, and
without it the stack could never be emptied. **`select` and `hold` are the human's state**, which
the agent may set so you can see what it is about to touch, but neither mutates the scene
([ADR-0024](adr/0024-a-selection-hold-pins-the-render.md) already ruled on `hold`). **`measure`
earns its place as a query** rather than a rail-only readout: an agent asked to space tubes evenly
needs the distance it is about to change.

### 15.4 Targets are explicit, and so is the snap

A command **carries its target ids**. The selection is a UI-side *input* that fills them at commit
time, never part of the command — otherwise the agent would have to mutate a selection it cannot
see, and §14.4 gives fixtures and objects one shared selection space. **The snap step is the same
shape**: the agent passes exact values and never silently inherits your grid.

This is what makes an undo entry self-describing. `Rotate 5 spokes 180°` names its five ids, which
is what the History rows render — they could not, if the target were ambient.

### 15.5 The STAR-TENT, end to end

The acceptance case, and the two things it settles.

**Pivot.** The sentence is *"rotate these five 180° about their own mid-points"*; ADR-0012 stores
placement rotation **pivoting about the definition origin**. So `rotate` takes a `pivot` mode —
`own` | `shared` | an explicit point — and **the command layer lowers it away** into ADR-0012's
stored form, rotation plus translation. Nothing downstream learns a second rotation convention,
which is the class of defect [#28](https://github.com/jnslmk/beamhouse/issues/28) found six sites
of.

**Where the flips live.** The canvas draws `5 MEMBERS FLIPPED · spokes 2 4 6 8 10` inside the array
panel, but they are **overrides on top of the array, not array state**. The panel is *reporting*
its members' overrides, not owning them — and it has to be that way, or the flip would be
unreachable for the half of a rig that is not in an array. This is why `array.set` merges rather
than replaces.

### 15.6 Ownership, and what a second page does

[ADR-0027](adr/0027-ownership-is-implicit-and-a-non-owner-stops-saving.md). **First connection owns
implicitly**; takeover is one click behind a confirmation naming the holder; release is on socket
close or ~15 s of silence; a woken page returns as a **non-owner** and must re-claim.

This bites more rarely than it reads. The MCP server is a client of the *control channel* and the
owning **page** applies requests, so one tab plus an agent has **no contention at all** — ownership
is contended between pages, which only §09's *"LAN too"* produces.

**A non-owner adopts the owner's scene, follows its commands, and has §4.6's auto-save suspended.**
ADR-0015 read the hazard as the *following*; it is the *saving* — two machines, two `.bhs` files,
seconds apart, neither wrong on its face.

### 15.7 Capture

[ADR-0028](adr/0028-a-capture-is-a-handle-fetched-over-http.md). `capture` returns a **handle**;
the MCP server `GET`s `http://localhost:7070/capture/<id>` over the HTTP the bridge already serves
(§9.4). **No bulk touches the DMX socket** — §07 is one socket, so a capture would not share the
wire but block it, and the resulting drop is indistinguishable in §13 from a real fault.

`maxEdge` defaults to **1280** and quality to **0.8**, so the normal path **cannot** reach the
**1 MB** cap. The reply states the dimensions, the encoded size and whether it downscaled;
exceeding the cap is an **error naming the size**, never a truncated image.

**Every capture is stamped with the feed it fired against.** Beamhouse never sends DMX, so two
captures of an unchanged scene can differ entirely — and an agent that cannot tell `live` from
`generated` would measure chase phase as if it were its own edit, which looks exactly like a
successful measurement.

## References

- `~/git-projects/Mizer` — `crates/components/fixtures/gdtf/` is the resolution reference
- [cpdt/gdtf-rs](https://github.com/cpdt/gdtf-rs) — object model to mirror in TS
- [pymvr](https://github.com/open-stage/python-mvr) — MVR reference implementation
- ASLS Studio — beam shader (GPL-3, read only)
- [BlenderDMX](https://github.com/open-stage/blender-dmx) — resolution layer in Python
