# The Beamhouse UI canvas

The design produced by [#35](https://github.com/jnslmk/beamhouse/issues/35), kept in the repo as an
**implementation reference**. The decisions it embodies are
[ADR-0023](../../adr/0023-the-chip-bar-is-the-navigation.md),
[ADR-0024](../../adr/0024-a-selection-hold-pins-the-render.md) and
[ADR-0025](../../adr/0025-trust-and-provenance-marks-are-additive.md), written up in
[`DESIGN.md` §14](../../DESIGN.md).

**Live canvas:** <https://claude.ai/code/artifact/55aa72b4-ab78-4d5c-91e4-71c992fca7b5> — pan/zoom,
with the reasoning as notes beside each artboard.

These are **mockups, not components**. Nothing here is meant to be imported; it is here so that
when M3 builds the scene editor, the numbers do not have to be reinvented or guessed from a
screenshot. Lift the values, not the markup.

## The eleven artboards

| Artboard | Shows | Embodies |
| --- | --- | --- |
| [`Empty`](renders/Empty.png) | First run: the empty grid, the patch picker, and the refusal message for a file Beamhouse cannot resolve | ADR-0023, [ADR-0020](../../adr/0020-the-live-loop-serves-patch-files-not-consoles.md) |
| [`Main`](renders/Main.png) | Resting, bridge-local: the rig live, on the implicit ground plane, with pools and human proxies | ADR-0023, [ADR-0036](../../adr/0036-the-ground-plane-is-the-only-surface-light-reaches.md) |
| [`Trouble`](renders/Trouble.png) | The same screen with a stale universe, a patch overlap, an unpatched fixture and a missing definition | ADR-0025 |
| [`Place`](renders/Place.png) | Placing a fixture: gizmo, numeric entry, and the override reading *as* an override | ADR-0024, ADR-0025 |
| [`Array`](renders/Array.png) | A live radial array — the STAR-TENT's ten spokes, five flipped 180° ([#23](https://github.com/jnslmk/beamhouse/issues/23)) | [ADR-0016](../../adr/0016-every-scene-mutation-is-one-undo-grained-command.md) |
| [`Overlay`](renders/Overlay.png) | The overlay at **Fixtures** (top) and **Universes** (bottom) — the notation package and §13.2 verbatim | ADR-0023, [ADR-0018](../../adr/0018-signal-health-is-one-per-universe-snapshot.md), [ADR-0038](../../adr/0038-bhs-binds-one-way-through-a-local-fixture.md) |
| [`Objects`](renders/Objects.png) | The overlay at **Objects** — the same table filtered on *has no address*, not a second one | [ADR-0035](../../adr/0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md), [ADR-0034](../../adr/0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md) |
| [`HistoryIssues`](renders/HistoryIssues.png) | The overlay at **History** (top, agent commands marked) and **Issues** (bottom, the ingest inbox) | ADR-0016, ADR-0025, [ADR-0039](../../adr/0039-definition-authoring-has-no-surface-of-its-own.md) |
| [`Phone`](renders/Phone.png) | The M3a share-link viewer at 390 px — resting (top) and one fixture tapped (bottom) | [ADR-0031](../../adr/0031-a-share-link-carries-resolved-definitions.md), [ADR-0032](../../adr/0032-the-m3a-viewer-is-read-only.md) |
| [`PhoneLandscape`](renders/PhoneLandscape.png) | The same viewer turned sideways — 844 × 390, the only orientation the rig fits | ADR-0032 |
| [`Recorded`](renders/Recorded.png) | A recording playing: the **same transport overlay** in the desktop app (top), the landscape phone and the portrait phone | [ADR-0042](../../adr/0042-the-transport-is-a-viewport-overlay.md), [ADR-0040](../../adr/0040-a-recording-is-deployment-material-and-the-bridge-records-it.md) |

`Overlay` and `HistoryIssues` are 1440 × 1800 — two 900 px frames stacked, one per tab. `Phone`
is 390 × 1688, two 844 px frames stacked; `PhoneLandscape` is 844 × 390. `Recorded` is 1440 × 1760,
a composite: the 1440 × 900 desktop above the two phone frames side by side, so that the claim it
makes — one component, three surfaces — is visible in a single frame rather than asserted across
three. The rest are 1440 × 900.

**[updated 2026-09-02 — [#43](https://github.com/jnslmk/beamhouse/issues/43)]** The human proxies in
`Main`, `Trouble`, `Place` and `Array` are **boxes** at EMEX7's own measured bounding box,
0.64 × 0.59 × 1.77 m — they were drawn as figures while #43 was open, and
[ADR-0035](../../adr/0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md) settled that v1 has
no mesh loader. The beams visibly pass **through** them and land on the floor unbroken, which is
[ADR-0036](../../adr/0036-the-ground-plane-is-the-only-surface-light-reaches.md)'s stated non-claim
drawn rather than described.

**[updated 2026-09-02 — [#51](https://github.com/jnslmk/beamhouse/issues/51)]** Three things
[ADR-0038](../../adr/0038-bhs-binds-one-way-through-a-local-fixture.md) removed had been drawn here,
all of them the same removal — **binding (a)**, a `bhs:` definition attached to a fixture the console
already patched:

- The **`Extent mismatch` Issues row is gone**, and nothing replaces it. It needed a patch and a
  `bhs:` definition disagreeing about extent, and with one binding left there is no second source.
  Its replacement — a **universe over-run** on a local fixture — is caught *when the address is
  typed*, so it is not an ingest finding, and §14.1 rides the issue count on **Patch** precisely
  because *"every issue class originates in an ingest"*. The `Issues` tab is at **3 open**.
- The **local fixture is `bhs:tube35`, not `bhs:tube60`**. `60` was #35's own invention and
  [#41](https://github.com/jnslmk/beamhouse/issues/41) then cited it as *"§4.5's own example"*,
  which it never was. The row is now a **gled2-driven tube** — the one case `bhs:` is scoped to,
  pixels on the wire that no console has patched — and it carries **one** universe and address, so
  `Uni.Addr #2` reads `Unpatched`: 35 px × 3 ch from `4.400` ends at slot 504. **Its 35 px and
  33 mm pitch are illustrative, not measured.** `bhs:` has no instance on the reference rig
  (ADR-0038's own consequence), so nothing on this row may be cited as a measurement; 35 px is
  `DESIGN.md` §05's worked example and 33 mm is a 30 LED/m strip.
- The **ten spokes now name the authored `Beamhouse@WLED STAR-TENT Spoke 23px`** —
  `gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016` — which is what the Mizer patch names today.
  [#46](https://github.com/jnslmk/beamhouse/issues/46) wrote the definition and deleted the OFL
  entry, executing the flip [ADR-0033](../../adr/0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md)
  promised; at #51 they were `ofl:beamhouse:wled-star-tent-spoke-23px`, and before that
  `bhs:spoke23`, a positive-id fixture naming a `bhs:` definition, which is binding (a) exactly.
  This is the fiction #41's first premise was built on. The prefix did not change before #46
  because a definition id that resolves to nothing is ADR-0034's marker case.

The `Fixtures` footer follows: **889 ch patched over 4 universes**, against the `Universes` tab's
**5 subscribed**. The two counts are different quantities and now differ — the bridge listens to
what the show network carries, not to what the patch claims.

## Design tokens

Authored in oklch so the accents share chroma and lightness and vary only in hue. The two design
accents are `--beam` (light) and `--sel` (selection and the override layer); the rest are semantic.

| Token | Value | Used for |
| --- | --- | --- |
| `--bg0` | `oklch(0.155 0.006 75)` | viewport ground, field insets |
| `--bg1` | `oklch(0.205 0.007 75)` | chip bar, tool rail, overlay panel |
| `--bg2` | `oklch(0.252 0.008 75)` | chips, panel header, footer |
| `--bg3` | `oklch(0.305 0.009 75)` | active tool, count pills |
| `--line` | `oklch(0.345 0.008 75)` | panel border, table header rule |
| `--line2` | `oklch(0.275 0.007 75)` | row rules, chip borders |
| `--hi` | `oklch(0.945 0.004 85)` | primary text and every resolved value |
| `--mid` | `oklch(0.735 0.006 85)` | secondary text, table body |
| `--lo` | `oklch(0.565 0.008 85)` | chip keys, column heads, units |
| `--beam` | `oklch(0.80 0.150 72)` | the light itself; active tab underline; the one call to action |
| `--sel` | `oklch(0.78 0.150 220)` | selection, **and the override layer** |
| `--ok` | `oklch(0.78 0.150 152)` | a universe arriving |
| `--warn` | `oklch(0.78 0.150 52)` | **stale** — a trust signal, never a fault |
| `--bad` | `oklch(0.70 0.165 22)` | patch faults: overlap, missing definition |
| `--blind` | `oklch(0.74 0.150 300)` | `Preview_Data`, and agent-originated commands |

`--warn` and `--bad` are deliberately different: §13.4 says blind *"reads as a mode, not a fault"*,
and §13.3 says staleness reads as *"do not believe this"*, not as a failure. Only `--bad` is a
fault.

**Type.** `Barlow` 400/500/600 for chrome; `IBM Plex Mono` 400/500/600 for **every address, value,
count and identifier** — a `universe.address` token wants tabular figures. No third face.

## Metrics

| | |
| --- | --- |
| Chip bar | 44 px, 1 px bottom rule, 7 px gap, 12 px side padding |
| Chip | 28 px tall; key 9.5 px/600/`.105em` uppercase, value 11.5 px mono/500, 8 px gap |
| Tool rail | 48 px wide; 32 px targets, 19 px icons, 3 px gap |
| Overlay panel | 1264 × 744 at (64, 56); header 46 px, tabs 38 px, footer 34 px |
| Table | 31 px rows; heads 9.5 px/600/`.11em` uppercase; cells 11.5 px |
| Badge | 23 px tall, centred on the fixture, 1 px border in the status colour |

Mockup hit targets are smaller than the 44 px touch floor because these are the **desktop**,
bridge-local artboards. **[#40, 2026-09-02]** The phone artboards solve it on their own metrics:

| | |
| --- | --- |
| Phone frame | 390 × 844 portrait; 844 × 390 landscape |
| Phone chip bar | 56 px, **44 px** chips — the touch floor, not the desktop's 28 |
| Viewport band | 320 px in portrait; full-bleed in landscape |
| List row | 44 px |
| Sheet row | 38 px min, 16 px side padding |

The two chips plus the marked wordmark measure **355 px of 390** in the widest realistic state,
which is why the phone `Selection` chip carries the count rather than the name
([ADR-0032](../../adr/0032-the-m3a-viewer-is-read-only.md)).

**[#45, 2026-09-02]** The recording transport is an overlay, not a chip, and the measurement is why:
a third chip puts the bar at **483 px** — 93 px over — and **415 px** even with the feed deleted from
the wordmark to pay for it. It is 44 px tall so the drag target meets the touch floor, though the
track itself is 3 px.

| | |
| --- | --- |
| Transport block | 44 px tall; 8/11/10 px padding, bottom-left of the viewport at 10 px |
| Scrub track | 3 px, 13 px head with a 3 px halo |
| Label | 9.5 px/600/`.105em` uppercase in `--beam`; position and duration 10.5 px mono |

**Two defects in the #40 artboards were corrected here**, both cases of the drawing contradicting
its own ADR:

- **`PhoneLandscape` used the desktop 44 px chip bar with 28 px chips.** ADR-0032 decision 6 sets
  the phone bar at 56 px with 44 px chips and landscape is still a phone. It costs 12 px of 390.
- **`PhoneLandscape` cropped the rig.** Its scene SVG had no size rule, so it rendered at its
  intrinsic 1392 × 856 and was simply clipped by the 844 px frame — `preserveAspectRatio` never
  applied at all. Sized to the box and set to `meet`, the whole rig is visible, which is the claim
  ADR-0032 decision 4 makes for this orientation. It also shows that *fits* is the honest word and
  *fills* is not: the rig's content span is ~1.49:1 against a 2.53:1 frame, so it is bounded by
  height with horizontal margins either side.
  **[#55, 2026-09-02]** That measurement went one step further and changed the drawing: a
  full-canvas `meet` left the rig at 407 of 844 px (48%), which is not what "the rig gets the
  screen" means. The landscape scene now frames the rig's **content box** — `viewBox="174 190
  1043 526"`, x 174..1217 × y 190..716, everything the scene draws between the truss and the
  stage lip — so the rig takes 662 px (78%) and the ~91 px side margins are the honest residue of
  a 1.98:1 content box in a 2.53:1 frame. Cropping x alone (the portrait band's lever) is a no-op
  here: the frame is height-bound at every x-window, so the trim is in y. The same rule reaches
  `Recorded`'s landscape frame — #45 made them one component.

## Regenerating

The artboards are generated, not hand-written, so the chips and the scene stay identical across
all eleven:

```
python3 gen.py          # writes the .dc.html files and canvas.json
python3 render.py       # writes renders/*.png  (Playwright + Chromium; viewport per artboard)
optipng -o3 renders/*.png
```

`parts.py` holds the tokens, the chip and the tool rail; `scene.py` draws the viewport as inline
SVG; `gen.py` assembles each artboard and the canvas layout.

## Keeping this and the live canvas in step

The published canvas is **editable in place**, so it can move ahead of this folder. This is a
snapshot, and the live artifact is the one the tickets link.

- To pull the canvas back down: read the artifact, then
  `seed-canvas.mjs --extract <saved page> --to <empty dir>`, which writes the artboards,
  `canvas.json` and images back out as working files. Note it returns *hand-edited* `.dc.html`,
  which `gen.py` cannot round-trip — reconcile by hand, or treat the extract as authoritative and
  retire the generator.
- To push a change up: edit here, re-run `gen.py`, re-seed, and republish to the **same URL**.

## Nothing here is speculative any more

Two screens were split out of #35 rather than guessed at, each unprecedented in the field survey,
and both have since landed — as has #40's M3a viewer, whose §9.2 degradation ladder was **retired**
rather than designed.

| Split out | Landed as | Outcome |
| --- | --- | --- |
| [#40](https://github.com/jnslmk/beamhouse/issues/40) | `Phone`, `PhoneLandscape` | the ladder does not exist ([ADR-0031](../../adr/0031-a-share-link-carries-resolved-definitions.md)) |
| [#41](https://github.com/jnslmk/beamhouse/issues/41) — authoring a `bhs:` definition | no artboard | the screen does not exist either ([ADR-0039](../../adr/0039-definition-authoring-has-no-surface-of-its-own.md)) |
| [#43](https://github.com/jnslmk/beamhouse/issues/43) — scene objects, stage, musicians, floor pool | `Objects` | a scene object is a fixture with an empty DMX mode ([ADR-0035](../../adr/0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md)) |
| [#45](https://github.com/jnslmk/beamhouse/issues/45) — the recording transport | `Recorded` | one overlay, three surfaces ([ADR-0042](../../adr/0042-the-transport-is-a-viewport-overlay.md)) |

**[updated 2026-09-02 — #45]** This section used to say the stage and floor pool were "drawn ahead
of that decision" and "the only speculative thing here". #43 settled both: the pool is analytic and
the ground plane is the only surface light reaches
([ADR-0036](../../adr/0036-the-ground-plane-is-the-only-surface-light-reaches.md)), and the human
proxies became boxes at EMEX7's measured bounding box. The `Objects` tab's count is no longer a
placeholder either.
