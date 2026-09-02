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

## The seven artboards

| Artboard | Shows | Embodies |
| --- | --- | --- |
| [`Empty`](renders/Empty.png) | First run: the empty grid, the patch picker, and the refusal message for a file Beamhouse cannot resolve | ADR-0023, [ADR-0020](../../adr/0020-the-live-loop-serves-patch-files-not-consoles.md) |
| [`Main`](renders/Main.png) | Resting, bridge-local: the rig live, on the implicit ground plane, with pools and human proxies | ADR-0023 |
| [`Trouble`](renders/Trouble.png) | The same screen with a stale universe, a patch overlap, an unpatched fixture and a missing definition | ADR-0025 |
| [`Place`](renders/Place.png) | Placing a fixture: gizmo, numeric entry, and the override reading *as* an override | ADR-0024, ADR-0025 |
| [`Array`](renders/Array.png) | A live radial array — the STAR-TENT's ten spokes, five flipped 180° ([#23](https://github.com/jnslmk/beamhouse/issues/23)) | [ADR-0016](../../adr/0016-every-scene-mutation-is-one-undo-grained-command.md) |
| [`Overlay`](renders/Overlay.png) | The overlay at **Fixtures** (top) and **Universes** (bottom) — the notation package and §13.2 verbatim | ADR-0023, [ADR-0018](../../adr/0018-signal-health-is-one-per-universe-snapshot.md) |
| [`HistoryIssues`](renders/HistoryIssues.png) | The overlay at **History** (top, agent commands marked) and **Issues** (bottom, the ingest inbox) | ADR-0016, ADR-0025 |

`Overlay` and `HistoryIssues` are 1440 × 1800 — two 900 px frames stacked, one per tab. The rest
are 1440 × 900.

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
bridge-local artboards. The phone layout is [#40](https://github.com/jnslmk/beamhouse/issues/40)
and has to solve that itself.

## Regenerating

The artboards are generated, not hand-written, so the eight chips and the scene stay identical
across all seven:

```
python3 gen.py          # writes the seven .dc.html files and canvas.json
python3 render.py       # writes renders/*.png  (Playwright + Chromium)
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

Three screens were split out of #35 rather than guessed at, and each is unprecedented in the field
survey:

- [#40](https://github.com/jnslmk/beamhouse/issues/40) — the M3a viewer and §9.2's degradation
  ladder, on a phone.
- [#41](https://github.com/jnslmk/beamhouse/issues/41) — authoring a `bhs:` definition.
- [#43](https://github.com/jnslmk/beamhouse/issues/43) — scene objects, the stage and musicians,
  and the analytic floor pool. **The stage and pool in these artboards are drawn ahead of that
  decision** and are the only speculative thing here.

The `Objects` tab appears in the overlay's tab strip with an empty count for the same reason: the
tab is settled, its contents are #43's.
