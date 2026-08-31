# OBF26 Bunte Stube: migrating the reference rig off `qlc:`

Migration record for [issue #6](https://github.com/jnslmk/beamhouse/issues/6) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)), executed against
[ADR-0001](../adr/0001-gdtf-and-ofl-as-definition-formats.md) — GDTF **or** OFL per fixture,
never QLC+ as a resolved runtime format.

- **Source (untouched, still the reference):** `~/git-projects/mizer-shows/OBF26_Bunte-Stube.yml`
- **Migrated:** `~/git-projects/mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml`

**Headline: 13 of 13 fixtures migrated. No `qlc:` id remains in the rig.** The two dimmer packs
and the fogger moved cleanly and channel-for-channel — dimmers to OFL, fogger to the pinned
GDTF. The four WLED tubes moved to a newly authored 35-pixel OFL definition and had to be
**re-addressed**, because an 18-channel effect segment cannot become a 105-channel per-pixel
fixture at its old address — **that part is provisional and now known wrong, see below**. The six GLP impression 90 RGB movers moved to the GDTF definition
authored for this project in [#16](https://github.com/jnslmk/beamhouse/issues/16) — the one
fixture with no profile anywhere, now with one built from GLP's own dimensioned CAD. `id` and
`universe` are preserved for all 13 fixtures; `channel` for 10 of 13, the three exceptions all
being WLED tubes.

> **⚠ The four WLED tubes are migrated but the model behind them is known wrong.** A user
> correction after this was written gives **23 pixels per LED profile, not 35**, and the four
> patched entries are WLED *segments* over one physical run rather than four physical tubes —
> so both the pixel count and the unit are wrong, and per-pixel at the real scale
> (230 px × 3 = 690 ch) overruns a 512-slot universe. **§3 is superseded**; see the banner
> there. Ticketed separately. Everything in §1 and §2 about ids 1–8 and 10 is unaffected.

> **Sequencing note.** This migration first landed with 7 of 13 and the six movers left on
> `qlc:`, because the authored profile
> ([`82f422b`](https://github.com/jnslmk/beamhouse/commit/82f422b)) reached `main` after this
> branch was cut. The impression 90 section below is written as it stands now; the reasoning
> that made the impression X4 unusable as a substitute is **kept in full** and is still the
> load-bearing warning, because the trap it describes has not gone away.

---

## 1 · What each fixture became

| id | Name | Was | Mode | Now | Mode | Ch | Verdict |
|----|------|-----|------|-----|------|----|---------|
| 1–6 | Impression 1–6 | `qlc:GLP:impression 90 RGB` | `Normal` | `gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48` | `Normal` | 14 | clean, 1:1 — **authored profile**, not from GDTF Share |
| 7 | Dimmerpack 4ch | `qlc:Generic:Dimmer` | `4 Channel` | `ofl:generic:4-channel-dimmer-pack` | `4-channel` | 4 | clean, 1:1 |
| 8 | Dimmerpack 1ch | `qlc:Generic:Dimmer` | `1 Channel` | `ofl:generic:4-channel-dimmer-pack` | `1-channel` | 1 | clean, 1:1 |
| 10 | Fog Fury Jett | `qlc:American DJ:Fog Fury Jett (HTP Fog)` | `7 Channel` | `gdtf:26D59406-1AE9-4D59-8E00-A9DAF08EA018` | `7 Channel Mode` | 7 | clean, 1:1 |
| 9 | WLED Star | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | **provisional — superseded, see §3** |
| 11 | WLED Highlight | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | **provisional — superseded, see §3** |
| 13 | WLED Sparkle | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | **provisional — superseded, see §3** |
| 12 | WLED Flash | `qlc:WLED:WLED Segment Effect` | `18 Channel` | `ofl:beamhouse:wled-t8-pixel-tube-35px` | `35px RGB 105-channel` | 105 | **provisional — superseded, see §3** |

Everything outside the `fixtures:` block — `groups`, `connections`, `presets`, `layouts`,
`plans`, `version`, `playback` — is byte-identical to the original, verified by parsing both
files and comparing every top-level key.

### Addressing

| id | Universe | Channel was | Channel now | Occupies |
|----|----------|-------------|-------------|----------|
| 1–6 | 1 | 1 / 15 / 29 / 43 / 57 / 71 | *unchanged* | 1–84 (14 slots each) |
| 7 | 1 | 85 | 85 | 85–88 |
| 8 | 1 | 89 | 89 | 89 |
| 10 | 1 | 90 | 90 | 90–96 |
| 9 | 2 | 1 | **1** | 1–105 *(provisional)* |
| 11 | 2 | 19 | **106** | 106–210 *(provisional)* |
| 13 | 2 | 37 | **211** | 211–315 *(provisional)* |
| 12 | 2 | 55 | **316** | 316–420 *(provisional)* |

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

### GLP impression 90 RGB → authored GDTF

`qlc:GLP:impression 90 RGB` / `Normal` → `gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48` / `Normal`.

The definition is **authored for this project**, not fetched:
`definitions/authored/GLP@impression 90 RGB@v1.gdtf`, geometry measured from GLP's own
dimensioned DWG in [#16](https://github.com/jnslmk/beamhouse/issues/16)
([`impression-90-pivots.md`](impression-90-pivots.md)), channels translated from the `.qxf`.
It declares one mode, `Normal`, described as "14 channel Normal mode, as patched in QLC+".

| QLC+ mode | Ch | Authored GDTF mode | Ch |
|-----------|----|--------------------|----|
| `Normal` | 14 | `Normal` | 14 |
| `Compress` | 10 | *not implemented* | — |
| `High Resolution (Extended)` | 13 | *not implemented* | — |

Only `Normal` exists, which is the only mode this rig uses. Patching a fixture in either other
mode would fail to resolve rather than resolve wrongly — the safe failure.

**Verified independently against `~/.qlcplus/fixtures/GLP-Impression-90-RGB.qxf`** before
patching, parsing both files rather than reading them:

| Off | QLC+ `Normal` | Authored GDTF | Geometry |
|-----|---------------|---------------|----------|
| 1–2 | Pan coarse / fine | `Pan` (`Offset="1,2"`) | Yoke |
| 3–4 | Tilt coarse / fine | `Tilt` (`Offset="3,4"`) | Head |
| 5 | Color (fixed) | `ColorMacro1` | Beam |
| 6 | Red | `ColorAdd_R` | Beam |
| 7 | Green | `ColorAdd_G` | Beam |
| 8 | Blue | `ColorAdd_B` | Beam |
| 9 | Shutter | `Shutter1` | Beam |
| 10 | Dimmer | `Dimmer` | Beam |
| 11 | Colour temperature | `CTC` | Beam |
| 12 | Special | `Control1` | Base |
| 13 | Movement macros | `Control2` | Base |
| 14 | Speed Pan / Tilt | `PositionMSpeed` | Yoke |

Slots occupied are contiguous 1…14 with no duplicates (12 `DMXChannel` elements, because Pan
and Tilt each span two slots — correct GDTF modelling of a 16-bit channel, not a missing pair).
**No White channel anywhere**, so the offset-9 slip described below does not arise. Pan is
−330°…+330° and Tilt −150°…+150°, matching the `.qxf`'s `<Focus PanMax="660" TiltMax="300"/>`.
The 14-slot count keeps the 1 / 15 / 29 / 43 / 57 / 71 address grid untouched.

#### Fidelity gaps within correctly-placed channels

These are *sub-range* differences, not misalignments — every channel sits at the right offset —
but they change what a slot value resolves to, so they belong in the profile's backlog rather
than in this migration:

| Ch | Authored GDTF | `.qxf` | Effect |
|----|---------------|--------|--------|
| 9 Shutter | Closed 0–31, Strobe 32–223 @ 0.5–20 Hz, Open 224–255 | Closed 0–15, pulse/random 16–143, strobe 144–239 (200–239 = 1–10 Hz), Open 240–255 | 16–31 resolves Closed but is really pulsing; 224–239 resolves Open but is really strobing; strobe Hz range is wider than the fixture's |
| 11 CTC | 2700–8000 K across 0–255 | 0–6 no correction, 7–255 = 3200–7200 K | no dead zone, and both endpoints overshoot |
| 5, 12, 13, 14 | one generic 0…1 `ChannelFunction` each | enumerated capability tables (128 movement macros, 6 maintenance ranges, …) | coarse, but macros/maintenance/speed are not resolved attributes for the beam class in v1 |

None of these blocks the migration. All are recorded in `definitions/authored/README.md`'s own
"Known gaps" or follow from it.

#### Why the impression X4 is still not a substitute — keep this

This is the trap that made the migration land at 7 of 13 in its first pass, and it has not gone
away: the X4 remains the obvious-looking stand-in, and it patches without erroring.

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

The other two QLC+ modes fail the same way against their X4 counterparts: `Compress` (10 ch) vs
`Compress Mode 14Ch` aligns through offset 8 and breaks where the X4 puts White;
`High Resolution (Extended)` (13 ch) vs `High Resolution (Extended) Mode 21Ch` aligns further,
through offset 10 — both carry 16-bit Pan, Tilt, R, G and B — and breaks at 11, where the X4 has
16-bit White and the impression 90 has Shutter.

**The X4 (rid 46490, pinned) stays in the library as a geometry cross-check for the authored
profile. It must never be patched as an impression 90.**

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

### WLED tubes → authored OFL  *(provisional — superseded, see §3)*

`qlc:WLED:WLED Segment Effect` (`15 Channel` / `18 Channel`, both effect-parameter layouts)
→ `ofl:beamhouse:wled-t8-pixel-tube-35px`, mode `35px RGB 105-channel`.

**The target definition and the four-fixture shape are both wrong** — 23 px per profile rather
than 35, and these four entries are segments over one physical run rather than four physical
tubes. The mode-name row below is recorded for completeness; do not carry it forward. What does
carry forward is the point immediately following it: this is not a mode rename at all.

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

> ## ⚠ SUPERSEDED — the tube half of this migration is wrong
>
> **Do not build on the numbers in §3, or on the WLED rows of §1 and §2.** The reasoning
> survives; the model does not.
>
> After this was written the user corrected a fact this record had inferred rather than
> measured: **an LED profile contains 23 pixels, not 35.** Three things follow, and they
> compound:
>
> 1. **23 px per profile, not 35.** The 35 came from `docs/DESIGN.md` §4.5's
>    `diy_t8_35px` class and was carried forward here as given. It was never measured.
> 2. **The physical unit is probably not four.** `~/qlc/README.md:513` records the
>    STAR-TENT as 230 RGBW LEDs, and 230 ÷ 23 = 10 — so there are likely **10 profiles**,
>    not 4 tubes. (That division is inference, not a stated fact; treat the 10 as
>    unconfirmed.)
> 3. **The segment-to-fixture mapping is the wrong shape.** Star, Highlight, Flash and
>    Sparkle at ch 1 / 19 / 37 / 55 are WLED **segments** — effect zones layered over one
>    physical run — not four physical tubes. Mapping one segment to one per-pixel fixture
>    was wrong regardless of the pixel count.
>
> **And per-pixel no longer fits the universe.** 230 px × 3 ch = **690 channels** against a
> 512-slot universe. The 4 × 105 = 420 in §3 fitted comfortably; 690 does not fit at all.
> That is an unresolved modelling problem — it needs either a second universe, a different
> pixel-to-slot mapping, or a coarser strip model — and it is **ticketed separately**, not
> resolved here.
>
> **What still stands, and is why this section is kept rather than deleted:**
>
> - **OFL over GDTF on licensing** — the argument in §3 is about redistribution rights and
>   the manifest's rid requirement, not about pixel counts. It applies unchanged to a 23px
>   fixture, or a 230px one.
> - **Per-pixel over effect mode** — WLED computing pixels on-device means the data never
>   crosses the wire, so effect mode is unrenderable without reimplementing WLED's effect
>   engine. Unaffected by how many pixels there are.
> - **The 230-vs-140 discrepancy flagged in §5** was the right thing to notice; it is what
>   surfaced this.
>
> `definitions/ofl/beamhouse.json` is **left in place**, not deleted — the follow-up ticket
> decides whether to re-author it at the real pixel count or replace the whole model. The
> patched addresses in the migrated project file are likewise left as they are: they are
> known-provisional, not silently wrong.


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

**Resolved into something larger.** This section originally flagged one unknown — that
`~/qlc/README.md:513` records the STAR-TENT as **230 RGBW LEDs** while four 35-pixel RGB tubes
is only 140 pixels, and that reading the node would settle it. That was the right thing to
notice, and the answer turned out to be worse than a miscount: the pixel count, the unit and
the segment mapping are all wrong (see the banner in §3), and per-pixel at 230 px needs 690
channels against a 512-slot universe.

What is still genuinely open, now scoped to the follow-up ticket rather than to this record:

1. **Confirmed pixel count and profile count** — 23 px per profile is stated; 10 profiles is
   arithmetic from the 230 figure and unconfirmed. Read the node's `/json/info` and segment map.
2. **RGB vs RGBW** — the README says RGBW; the authored OFL fixture models RGB.
3. **How 690 channels map onto DMX at all** — a second universe, a different pixel-to-slot
   mapping, or a coarser strip model. This is the actual design question and it is not answered
   anywhere yet.
4. **Whether the node is in per-pixel (Multi RGB) input at all**, which the migrated patch
   assumes throughout.

The two assumptions this record made and labelled as such — tube order along the string, and
tube length / LED pitch — are moot: they belonged to a four-tube model that no longer holds.

---

## 6 · Where the definition library now lives

| Library | Repo | Machine (Mizer reads both this and its bundled library) |
|---------|------|--------------------------------------------------------|
| GDTF (from GDTF Share) | `definitions/gdtf/` — **gitignored**, rebuilt by `tools/gdtf-share.sh restore` from `definitions/gdtf-manifest.json` | `~/Documents/Mizer/Fixture Definitions/GDTF/` |
| GDTF (authored) | `definitions/authored/GLP@impression 90 RGB@v1.gdtf` — **tracked** | same directory, `~/Documents/Mizer/Fixture Definitions/GDTF/` |
| OFL (authored) | `definitions/ofl/beamhouse.json` — **tracked** | `~/Documents/Mizer/Fixture Definitions/Open Fixture Library/beamhouse.json` |
| OFL (upstream) | not vendored | ships with Mizer, `fixtures/open-fixture-library/fixtures.json` |
| QLC+ | **no longer used by this rig** | — |

All four pinned `.gdtf` files, the authored impression 90 `.gdtf` and the authored OFL file were
installed to those paths as part of this migration. The two authored definitions and the four
fetched ones live side by side in Mizer's single GDTF directory — Mizer keys on `FixtureTypeID`,
so provenance makes no difference at resolution time. In the repo they stay separate, because
the licensing does: `definitions/gdtf/` is referenced-not-vendored, `definitions/authored/` is
ours and committed.

### The authored profile is deliberately *not* in `gdtf-manifest.json`

The manifest is a lockfile of GDTF Share rids: `pin` refuses anything absent from the local
catalogue, and `restore` iterates `.definitions[].rid` and downloads each one. A rid-less entry
would be unpinnable and would break `restore` outright. More to the point, the manifest exists
because ADR-0001 cannot vendor GDTF Share content — and that constraint does not apply to a
definition this project wrote. So the impression 90 is committed directly under
`definitions/authored/`, which is exactly the split
[`definitions/authored/README.md`](../../definitions/authored/README.md) already states. **The
manifest is unchanged by this migration and correctly so.**

Two manifest pins are now unused by this rig but retained deliberately: rid 46490 (impression X4)
is the geometry cross-check for the authored profile, and rids 138539 / 142265 (30px strip, WLED
effect mode) document the routes not taken.

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

## 7 · What is left

**Nothing blocks the migration.** All 13 fixtures resolve through `gdtf:` or `ofl:`, and no
`qlc:` id remains in the rig — the format side of ADR-0001 is fully satisfied for this show.

What remains is fidelity work on definitions that already exist and already patch:

- **The impression 90's shutter and CTC sub-ranges** diverge from the `.qxf` inside otherwise
  correctly-placed channels (§2). Worth a pass on the authored profile; not worth blocking on.
- **`Compress` and `High Resolution (Extended)` modes** are not implemented in the authored
  profile. This rig only patches `Normal`, so it costs nothing today, and a mode that does not
  exist fails loudly instead of resolving wrongly.
- **`PhysicalDescriptions` is empty** on the authored profile — no emitter spectrum, no colour
  space — and every model is a `PrimitiveType` with no mesh. That matches what real profiles
  ship (GLP's own X4 and ADJ's Fog Fury Jett carry no geometry either), and MIT-licensed `.3ds`
  meshes exist in `heliostate/OpenGDTFLibrary`
  ([`impression-90-geometry-sources.md`](impression-90-geometry-sources.md) §3.1) if a polish
  pass ever wants them.
- **The WLED tubes are not finished.** They patch and they resolve, but the model is known
  wrong: 23 px per profile rather than 35, segments rather than physical tubes, and 690 channels
  of per-pixel data against a 512-slot universe. See the banner in §3 and the scoped list in §5.
  This is the one part of the migration that should not be treated as done.

The rig is now genuinely usable as the reference rig this ticket set out to produce: a real
patch, six beam-class movers with a measured axis hierarchy, and four 35-pixel strip-class
fixtures — one of each of the two rendering classes v1 commits to, both resolvable without
QLC+.
