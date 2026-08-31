# OBF26 Bunte Stube: migrating the reference rig off `qlc:`

Migration record for [issue #6](https://github.com/jnslmk/beamhouse/issues/6) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)), executed against
[ADR-0001](../adr/0001-gdtf-and-ofl-as-definition-formats.md) — GDTF **or** OFL per fixture,
never QLC+ as a resolved runtime format.

- **Source (untouched, still the reference):** `~/git-projects/mizer-shows/OBF26_Bunte-Stube.yml`
- **Migrated:** `~/git-projects/mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml`

**Headline: 7 of 13 fixtures migrated, 6 did not.** The two dimmer packs and the fogger moved
cleanly and channel-for-channel — dimmers to OFL, fogger to the pinned GDTF. The four WLED
tubes migrated to a newly authored 35-pixel OFL definition and had to be **re-addressed**,
because an 18-channel effect segment cannot become a 105-channel per-pixel fixture at its old
address. The six GLP impression 90 RGB movers **did not migrate and stay on `qlc:`** — there is
no GDTF profile in the 12,623-revision GDTF Share catalogue, no OFL fixture, and the closest
relative (the impression X4) is channel-incompatible from offset 9 onward, so patching against
it would resolve silently wrong values. `id` and `universe` are preserved for all 13 fixtures;
`channel` is preserved for 10 of 13.

---

## 1 · What each fixture became

| id | Name | Was | Mode | Now | Mode | Ch | Verdict |
|----|------|-----|------|-----|------|----|---------|
| 1–6 | Impression 1–6 | `qlc:GLP:impression 90 RGB` | `Normal` | *unchanged* | `Normal` | 14 | **not migrated** — no definition exists |
| 7 | Dimmerpack 4ch | `qlc:Generic:Dimmer` | `4 Channel` | `ofl:generic:4-channel-dimmer-pack` | `4-channel` | 4 | clean, 1:1 |
| 8 | Dimmerpack 1ch | `qlc:Generic:Dimmer` | `1 Channel` | `ofl:generic:4-channel-dimmer-pack` | `1-channel` | 1 | clean, 1:1 |
| 10 | Fog Fury Jett | `qlc:American DJ:Fog Fury Jett (HTP Fog)` | `7 Channel` | `gdtf:26D59406-1AE9-4D59-8E00-A9DAF08EA018` | `7 Channel Mode` | 7 | clean, 1:1 |
| 9 | WLED Star | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | migrated, **re-addressed** |
| 11 | WLED Highlight | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | migrated, **re-addressed** |
| 13 | WLED Sparkle | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | migrated, **re-addressed** |
| 12 | WLED Flash | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | migrated, **re-addressed** |

Everything outside the `fixtures:` block — `groups`, `connections`, `presets`, `layouts`,
`plans`, `version`, `playback` — is byte-identical to the original, verified by parsing both
files and comparing every top-level key.

### Addressing

| id | Universe | Channel was | Channel now | Occupies |
|----|----------|-------------|-------------|----------|
| 1–6 | 1 | 1 / 15 / 29 / 43 / 57 / 71 | *unchanged* | 1–84 |
| 7 | 1 | 85 | 85 | 85–88 |
| 8 | 1 | 89 | 89 | 89 |
| 10 | 1 | 90 | 90 | 90–96 |
| 9 | 2 | 1 | **1** | 1–105 |
| 11 | 2 | 19 | **106** | 106–210 |
| 13 | 2 | 37 | **211** | 211–315 |
| 12 | 2 | 55 | **316** | 316–420 |

Universe 1: 96 slots used. Universe 2: 420 of 512, next free slot 421. No overlaps, no
overruns — checked programmatically against each fixture's new channel count.

**On the "preserve `id`, `universe`, `channel`" requirement.** It holds for 10 of 13 fixtures
and for the thing the requirement exists to protect: the placement-override layer is keyed by
fixture id ([ADR-0003](../adr/0003-fixture-id-is-the-only-identity.md), DESIGN §4.5), and every
`id` and `universe` is unchanged. It cannot hold for WLED ids 11, 12 and 13: four 18-channel
segments were packed 18 slots apart, and four 105-channel per-pixel fixtures physically cannot
be. The new addresses are not an arbitrary reshuffle — WLED's per-pixel DMX input maps its start
address straight onto the LED string and consumes 3 slots per LED contiguously, so
1 / 106 / 211 / 316 is what the hardware actually wants. The four tubes keep their original
relative order (Star, Highlight, Sparkle, Flash), which is the only ordering information the old
patch carried.

---

## 2 · Mode-name mapping (what later tickets need)

QLC+ mode names survive nowhere. This is the full table, including modes not used by this rig,
because the patch may change.

### GLP impression 90 RGB — no target, mapping is hypothetical

`~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`

| QLC+ mode | Ch | Nearest GDTF (impression X4, rid 46490) | Ch | Aligned? |
|-----------|----|----------------------------------------|----|----------|
| `Normal` | 14 | `Normal Mode 20Ch` | 20 | offsets 1–8 only |
| `Compress` | 10 | `Compress Mode 14Ch` | 14 | offsets 1–8 only |
| `High Resolution (Extended)` | 13 | `High Resolution (Extended) Mode 21Ch` | 21 | offsets 1–10 only |

The impression 90 is the RGB sibling of the RGBW X4, and the divergence is exactly that one
channel:

| Off | impression 90 `Normal` | X4 `Normal Mode 20Ch` |
|-----|------------------------|------------------------|
| 1–2 | Pan coarse / fine | `Pan` (16-bit) |
| 3–4 | Tilt coarse / fine | `Tilt` (16-bit) |
| 5 | Color (fixed) | `Color1` |
| 6 | Red | `ColorAdd_R` |
| 7 | Green | `ColorAdd_G` |
| 8 | Blue | `ColorAdd_B` |
| 9 | Shutter | **`ColorAdd_W`** ← divergence starts |
| 10 | Dimmer | `Shutter1` |
| 11 | Colour temperature | `Dimmer` |
| 12 | Special | `CTO` |
| 13 | Movement macros | `Control1` |
| 14 | Speed Pan / Tilt | `Movement` |
| — | — | 15 `PositionMSpeed`, 16 `Zoom`, 17–20 `Pattern` |

So the impression 90's `Normal` **is** the X4's `Normal Mode 20Ch` with the White channel
deleted and the 5-channel zoom/pattern tail dropped. That is a good geometry cross-check and a
useless runtime substitute: patching the movers as X4s would mis-resolve Shutter, Dimmer, CTC,
Special, Movement and Speed onto neighbouring slots without erroring. The X4's `Compress Mode
14Ch` is tempting because the channel *count* matches (so the 1/15/29/43/57/71 grid would
survive), but it is wrong from offset 9 in the same way. Rejected.

The same divergence explains the other two rows: `Compress` aligns through offset 8 and breaks
where the X4 puts White; `High Resolution (Extended)` aligns further, through offset 10 (both
carry 16-bit Pan, Tilt, R, G and B), and breaks at 11 where the X4 has 16-bit White and the
impression 90 has Shutter.

### Generic Dimmer → OFL

`qlc:Generic:Dimmer` → `ofl:generic:4-channel-dimmer-pack` (Mizer's bundled OFL library).

| QLC+ mode | OFL mode | Ch |
|-----------|----------|----|
| `1 Channel` | `1-channel` | 1 |
| — | `2-channel` | 2 |
| `4 Channel` | `4-channel` | 4 |

One OFL fixture serves both dimmer packs because it declares a `matrix` of
`pixelCount: [4,1,1]` with `pixelGroups` (`Master`, `1/2`, `3/4`) and derives all three modes
from it. Every channel is a plain `Intensity` capability — exact semantic match. OFL's
`generic/desk-channel` (`8 bit` / `16 bit` / `24 bit`) was the alternative for the 1ch pack;
using one fixture for both packs is simpler and keeps the two dimmer rows visibly the same
device.

### ADJ Fog Fury Jett → GDTF

`qlc:American DJ:Fog Fury Jett (HTP Fog)` → GDTF Share rid **105377**, FixtureTypeID
`26D59406-1AE9-4D59-8E00-A9DAF08EA018`, already pinned in
[`definitions/gdtf-manifest.json`](../../definitions/gdtf-manifest.json).

| QLC+ mode | GDTF mode |
|-----------|-----------|
| `7 Channel` | `7 Channel Mode` (Description `DIM+RGBA+FOG`) |

Channel-for-channel, the only fully clean GDTF migration in the rig:

| Off | QLC+ | GDTF attribute |
|-----|------|----------------|
| 1 | Fog | `Fog1` |
| 2 | Red | `ColorAdd_R` |
| 3 | Green | `ColorAdd_G` |
| 4 | Blue | `ColorAdd_B` |
| 5 | Amber | `ColorAdd_RY` |
| 6 | Strobing | `Shutter1` |
| 7 | Master Dimmer | `Dimmer` |

The GDTF profile offers only this one mode. Note OFL has `american-dj/fog-fury-jett-pro` — the
**Pro**, a different fixture with 1/2/3/7/9-channel modes — not a substitute.

### WLED tubes → authored OFL

`qlc:WLED:WLED Segment Effect` (`15 Channel` / `18 Channel`, both effect-parameter layouts)
→ `ofl:beamhouse:wled-t8-pixel-tube-35px`, mode `35px RGB 105-channel`.

There is no mode-to-mode mapping here and there cannot be: the old 18 channels were
`Segment Opacity`, `Effect`, `Effect Speed`, `Effect Intensity`, `Palette`, `Effect Option`,
then primary/secondary/tertiary RGB and W. Under effect mode WLED computes the pixels
on-device, so per-pixel data never crosses the wire — the exclusion in
[`docs/DESIGN.md` §01](../DESIGN.md) and the standing decision on #1 (2026-08-31). The
migration is a change of *what is patched*, not a mode rename.

For completeness, the two GDTF profiles that do model effect mode, both already pinned and both
now unused by this rig:

| Definition | rid | Mode |
|------------|-----|------|
| WLED Project · WLED RGB Effect Mode | 142265 | `RGB Effect Mode 15ch` |
| MarkeEigenbau · RGB LED Pixel Strip 30px 1m | 138539 | `Ws2812 30led/m 90Channel` |

---

## 3 · The WLED per-pixel patch

### The choice: author a 35-pixel OFL fixture

The ticket offered three routes. Taken: **author a 35px definition, in OFL, not GDTF.**

- **Use the pinned 30px GDTF as-is — rejected.** `MarkeEigenbau RGB LED Pixel Strip 30px 1m`
  (rid 138539) is 30 pixels / 90 channels against real hardware of 35 pixels / 105 channels.
  Five pixels would go unrendered and every fixture addressed after the first would sit 15
  slots off. The whole point of migrating this rig is to have a *genuine* multi-pixel fixture
  for the strip-detection work (#8); a deliberately wrong pixel count defeats that.
- **Author a 35px GDTF from its pattern — rejected on licensing.** Mechanically it is trivial:
  the profile is 16.7 KB of `description.xml` with no meshes, 30 `GeometryReference` nodes on a
  `Beam` template at 32 mm spacing with `Break` `DMXOffset` 1, 4, 7 … , and extending it to 35
  is a loop. But it would be a derivative of a GDTF Share file that grants no redistribution
  right (ADR-0001, T&C §36–38), it would land in the gitignored `definitions/gdtf/`, and it
  would have no rid — so `gdtf-share.sh restore` could never rebuild it. The definition would
  exist on exactly one laptop, untracked.
- **Author it in OFL — taken.** OFL is MIT, ungated and vendorable, which is precisely why
  ADR-0001 added it and why the bundled library is OFL-only. An authored OFL fixture commits
  into this repo, matches the hardware exactly, and exercises OFL's declarative
  `matrix.pixelCount` + `physical.matrixPixels.spacing` — the path ADR-0001 calls the bonus for
  the strip class, and the newer of the two readers.

No 35-pixel strip exists to copy: GDTF Share has 20, 30, 40, 60 and 80-pixel strips and nothing
at 35; OFL's largest 1-D matrices are Astera FP3 (32 px), Gruft Pixel Tube (30 px), Chroma-Q
Color Force II 72 (24 px). Confirmed by searching both catalogues.

### The definition

[`definitions/ofl/beamhouse.json`](../../definitions/ofl/beamhouse.json) — an OFL
`ofl`-export-format library file (`{version, fixtures:[…]}`), the shape Mizer's OFL provider
reads. One fixture:

```
manufacturer  Beamhouse            (explicitly not upstream OFL)
fixtureKey    wled-t8-pixel-tube-35px
name          WLED T8 Pixel Tube 35px
Mizer id      ofl:beamhouse:wled-t8-pixel-tube-35px
matrix        pixelCount [35, 1, 1]
physical      dimensions [600, 26, 26] mm
              matrixPixels.dimensions [16.667, 26, 26], spacing [16.667, 0, 0] mm
channels      Red 1..35, Green 1..35, Blue 1..35 — each ColorIntensity, pixelKey "n"
mode          "35px RGB 105-channel", channels ordered R1 G1 B1 R2 G2 B2 … R35 G35 B35
```

**The physical numbers are derived, not measured.** 35 pixels is the count this project has
carried since DESIGN §4.5 (`"diy_t8_35px": { "kind": "strip", "pixels": 35 }`) and is what the
ticket specifies. 16.667 mm spacing and a 600 mm body follow from the only self-consistent
reading of that: a 60 LED/m WS2812 strip cut into a 2 ft T8 diffuser gives 35 pixels over
583 mm. Nothing in `~/qlc/README.md` or the QLC+ workspace records the tube's length or LED
density, so **this needs one physical measurement to confirm** before the strip class is
trusted for real geometry. See the discrepancy in §5.

### Slot layout

Per fixture, with `start` = its `channel`, pixel *n* = 1…35:

```
Red   pixel n  ->  start + 3(n-1)
Green pixel n  ->  start + 3(n-1) + 1
Blue  pixel n  ->  start + 3(n-1) + 2
```

Universe 2, in full:

| id | Name | Start | Pixel 1 (R,G,B) | Pixel 35 (R,G,B) | Range |
|----|------|-------|-----------------|------------------|-------|
| 9 | WLED Star | 1 | 1, 2, 3 | 103, 104, 105 | 1–105 |
| 11 | WLED Highlight | 106 | 106, 107, 108 | 208, 209, 210 | 106–210 |
| 13 | WLED Sparkle | 211 | 211, 212, 213 | 313, 314, 315 | 211–315 |
| 12 | WLED Flash | 316 | 316, 317, 318 | 418, 419, 420 | 316–420 |

Slots 421–512 free.

**The WLED node must be reconfigured to match.** This patch assumes WLED is switched from
effect/segment DMX mode to per-pixel (Multi RGB) input on Art-Net universe 1, with the four
tubes ordered Star → Highlight → Sparkle → Flash along the string. The node was not reachable
from this machine (`192.168.8.243`), so the tube order is the migration's assumption, taken
from the segments' original channel order, and is the second thing to confirm on site.

---

## 4 · The OFL QLC+ bridge — evaluated, not used

OFL ships `plugins/qlcplus_4.12.2/` with both `import.js` and `export.js` (genuinely
bidirectional), plus `plugins/gdtf/import.js` (GDTF → OFL, import only — there is no OFL → GDTF
export). Verified against the live repo.

**Hand-mapping was used instead, and it was not close.** The bridge converts a `.qxf` into an
OFL fixture. This rig has four distinct `.qxf` profiles, and the bridge helps with none of them:

- **Generic Dimmer** and **Fog Fury Jett** already have targets in libraries that exist
  (bundled OFL, pinned GDTF). Importing them would create *duplicate* definitions under new ids
  and buy nothing.
- **WLED Segment Effect** would convert faithfully — into 18 channels of effect parameters,
  the exact thing DESIGN §01 puts out of scope. The bridge cannot invent a 35-pixel matrix.
- **impression 90 RGB** is the one case where it would genuinely help, and it is out of scope
  here (#15/#16/#17 own it).

Setting the bridge up means cloning OFL and an `npm install` of a large Node toolchain. At 13
fixtures resolving to four profiles, three of which map onto library entries in one line each,
that is not a trade worth making.

**Worth recording for later:** for the impression 90, the QLC+ importer is a channel-exact,
zero-guesswork path from the existing `.qxf` to an OFL definition. It supplies channels and
capabilities only — no pivots, no geometry tree, which is the actual blocker — so it
complements rather than replaces the geometry work in #16/#17. If that ticket wants a
channel-correct definition before the geometry lands, this is how to get one.

---

## 5 · Open discrepancies

1. **Pixel count vs the node's own report.** `~/qlc/README.md` §5 records the STAR-TENT as
   **230 RGBW LEDs**. Four 35-pixel RGB tubes is 140 RGB pixels. The numbers do not reconcile:
   either the tent carries more LEDs than the four patched segments covered, or the tubes are
   not 35 px, or they are RGBW rather than RGB. The migration follows the ticket's 35 px RGB
   figure. **Read the WLED node's `/json/info` and segment map to settle it** — that single
   check fixes the pixel count, the LED density, the tube order and the RGB/RGBW question at
   once, and it is the last unknown in this fixture class.
2. **Tube order along the string** — assumed from the old segment channel order (§3).
3. **Tube length and LED pitch** — derived, not measured (§3).

---

## 6 · Where the definition library now lives

| Library | Repo | Machine (Mizer reads both this and its bundled library) |
|---------|------|--------------------------------------------------------|
| GDTF | `definitions/gdtf/` — **gitignored**, rebuilt by `tools/gdtf-share.sh restore` from `definitions/gdtf-manifest.json` | `~/Documents/Mizer/Fixture Definitions/GDTF/` |
| OFL (authored) | `definitions/ofl/beamhouse.json` — **tracked** | `~/Documents/Mizer/Fixture Definitions/Open Fixture Library/beamhouse.json` |
| OFL (upstream) | not vendored | ships with Mizer, `fixtures/open-fixture-library/fixtures.json` |
| QLC+ (movers only) | not vendored | `~/Documents/Mizer/Fixture Definitions/QLC+/fixtures/` |

All four pinned `.gdtf` files and the authored OFL file were installed to those paths as part of
this migration.

`definitions/gdtf-manifest.json` is **unchanged** — nothing new was pinned. Everything the
migrated rig needs from GDTF Share was already there. Two pins are now unused by this rig but
retained deliberately: rid 46490 (impression X4) is the geometry reference for the impression 90
work, and rids 138539 / 142265 (30px strip, WLED effect mode) document the routes not taken.

### Mizer's id formats — worth knowing before editing the patch by hand

Read out of Mizer's own providers, because getting these wrong fails silently as an
unresolvable fixture:

- **GDTF**: `gdtf:<FixtureTypeID>` — the **UUID** from `description.xml`, *not* manufacturer and
  model. `crates/components/fixtures/gdtf/src/lib.rs:87`; definitions are keyed by
  `fixture_type_id`. The manifest's `uuid` field is exactly this value.
- **OFL**: `ofl:<manufacturer-slug>:<name-slug>`, colon-separated, where the slug is
  `lowercase` with spaces and `*` replaced by `-`.
  `crates/components/fixtures/open-fixture-library/src/lib.rs:363`. Note Mizer reads OFL as a
  single `{version, fixtures:[…]}` library file per directory entry — the `ofl` export plugin's
  shape — not the upstream repo's per-fixture layout.
- **QLC+**: `qlc:<Manufacturer>:<Model>` from the `.qxf` itself.
- Library search paths: `crates/runtime/settings/src/defaults/mod.rs` — each provider reads both
  an app-bundled path and `~/Documents/Mizer/Fixture Definitions/<Provider>/`.

---

## 7 · What is still blocked

The six GLP impression 90 RGB movers, and only those. They remain on `qlc:` in the migrated
file, which keeps the show file correct and playable in Mizer but leaves them unresolvable by
Beamhouse, since ADR-0001 does not resolve `qlc:`.

Unblocking is #15/#16/#17's geometry work, not a library search — the search is finished and its
answer is no. What exists to build on: the impression X4's GDTF (rid 46490, pinned, real `Axis`
chain but no meshes), MIT-licensed mesh and pivot data in `heliostate/OpenGDTFLibrary`
([`impression-90-geometry-sources.md`](impression-90-geometry-sources.md) §3.1), the full
channel map in `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`, and the offset-by-offset
correspondence with the X4 in §2 above.
