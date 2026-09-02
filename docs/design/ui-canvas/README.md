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

## The ten artboards

| Artboard | Shows | Embodies |
| --- | --- | --- |
| [`Empty`](renders/Empty.png) | First run: the empty grid, the patch picker, and the refusal message for a file Beamhouse cannot resolve | ADR-0023, [ADR-0020](../../adr/0020-the-live-loop-serves-patch-files-not-consoles.md) |
| [`Main`](renders/Main.png) | Resting, bridge-local: the rig live, on the implicit ground plane, with pools and human proxies | ADR-0023, [ADR-0036](../../adr/0036-the-ground-plane-is-the-only-surface-light-reaches.md) |
| [`Trouble`](renders/Trouble.png) | The same screen with a stale universe, a patch overlap, an unpatched fixture and a missing definition | ADR-0025 |
| [`Place`](renders/Place.png) | Placing a fixture: gizmo, numeric entry, and the override reading *as* an override | ADR-0024, ADR-0025 |
| [`Array`](renders/Array.png) | A live radial array — the STAR-TENT's ten spokes, five flipped 180° ([#23](https://github.com/jnslmk/beamhouse/issues/23)) | [ADR-0016](../../adr/0016-every-scene-mutation-is-one-undo-grained-command.md) |
| [`Overlay`](renders/Overlay.png) | The overlay at **Fixtures** (top) and **Universes** (bottom) — the notation package and §13.2 verbatim | ADR-0023, [ADR-0018](../../adr/0018-signal-health-is-one-per-universe-snapshot.md) |
| [`Objects`](renders/Objects.png) | The overlay at **Objects** — the same table filtered on *has no address*, not a second one | [ADR-0035](../../adr/0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md), [ADR-0034](../../adr/0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md) |
| [`HistoryIssues`](renders/HistoryIssues.png) | The overlay at **History** (top, agent commands marked) and **Issues** (bottom, the ingest inbox) | ADR-0016, ADR-0025 |
| [`Phone`](renders/Phone.png) | The M3a share-link viewer at 390 px — resting (top) and one fixture tapped (bottom) | [ADR-0031](../../adr/0031-a-share-link-carries-resolved-definitions.md), [ADR-0032](../../adr/0032-the-m3a-viewer-is-read-only.md) |
| [`PhoneLandscape`](renders/PhoneLandscape.png) | The same viewer turned sideways — 844 × 390, the only orientation the rig fits | ADR-0032 |

`Overlay` and `HistoryIssues` are 1440 × 1800 — two 900 px frames stacked, one per tab. `Phone`
is 390 × 1688, two 844 px frames stacked; `PhoneLandscape` is 844 × 390. The rest are 1440 × 900.

**[updated 2026-09-02 — [#43](https://github.com/jnslmk/beamhouse/issues/43)]** The human proxies in
`Main`, `Trouble`, `Place` and `Array` are **boxes** at EMEX7's own measured bounding box,
0.64 × 0.59 × 1.77 m — they were drawn as figures while #43 was open, and
[ADR-0035](../../adr/0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md) settled that v1 has
no mesh loader. The beams visibly pass **through** them and land on the floor unbroken, which is
[ADR-0036](../../adr/0036-the-ground-plane-is-the-only-surface-light-reaches.md)'s stated non-claim
drawn rather than described.

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

## Regenerating

The artboards are generated, not hand-written, so the chips and the scene stay identical across
all nine:

```
python3 gen.py          # writes the seven .dc.html files and canvas.json
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

## What this canvas does not decide

Two screens were split out of #35 rather than guessed at, and each is unprecedented in the field
survey. (The third, #40's M3a viewer, is now the `Phone` artboards above — §9.2's degradation
ladder was retired rather than designed.)

- [#41](https://github.com/jnslmk/beamhouse/issues/41) — authoring a `bhs:` definition.
- [#43](https://github.com/jnslmk/beamhouse/issues/43) — scene objects, the stage and musicians,
  and the analytic floor pool. **The stage and pool in these artboards are drawn ahead of that
  decision** and are the only speculative thing here.

The `Objects` tab appears in the overlay's tab strip with an empty count for the same reason: the
tab is settled, its contents are #43's.
