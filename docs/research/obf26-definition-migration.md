# OBF26 Bunte Stube: migrating the reference rig off `qlc:`

Migration record for [issue #6](https://github.com/jnslmk/beamhouse/issues/6) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)), executed against
[ADR-0001](../adr/0001-gdtf-and-ofl-as-definition-formats.md) — GDTF **or** OFL per fixture,
never QLC+ as a resolved runtime format.

- **Source (untouched, still the reference):** `~/git-projects/mizer-shows/OBF26_Bunte-Stube.yml`
- **Migrated:** `~/git-projects/mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml`

**Headline: the whole rig is migrated, and the WLED half was rebuilt from scratch afterwards.**
The two dimmer packs and the fogger moved cleanly and channel-for-channel — dimmers to OFL,
fogger to the pinned GDTF. **[the dimmer half was undone 2026-09-02 —
[#48](https://github.com/jnslmk/beamhouse/issues/48)]** "Cleanly and channel-for-channel" was true
and beside the point: a dimmer pack is not a fixture, so the clean mapping mapped the wrong thing.
See §5, and the row for ids 7 and 8 below. The six GLP impression 90 RGB movers moved to the GDTF definition
authored for this project in [#16](https://github.com/jnslmk/beamhouse/issues/16) — the one
fixture with no profile anywhere, now with one built from GLP's own dimensioned CAD.

The WLED half is on its **second** pass. #6 patched four 35-pixel "tubes";
[#21](https://github.com/jnslmk/beamhouse/issues/21) read the node and falsified every number in
that, and [#23](https://github.com/jnslmk/beamhouse/issues/23) rebuilt it as **ten 23-pixel
spokes** — see §3, which is rewritten rather than annotated. The rig therefore holds **19**
fixtures, not 13. `id` and `universe` are preserved for ids 1–8 and 10; the four WLED ids
9 / 11 / 12 / 13 are **retired**, because #21 proved they named WLED segments rather than
fixtures.

> **The WLED half of this record was rewritten on 2026-09-02.** #6's four 35-pixel tubes are
> gone. What replaced them, and why every one of #6's tube numbers was wrong, is
> [§3](#3--the-star-tent-per-pixel-patch). Everything in §1 and §2 about ids 1–8 and 10 is
> unaffected and was never in doubt.

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
| ~~7~~ | ~~Dimmerpack 4ch~~ | `qlc:Generic:Dimmer` | `4 Channel` | ~~`ofl:generic:4-channel-dimmer-pack`~~ | — | — | **retired** — a pack is not a fixture (#48, §5) |
| ~~8~~ | ~~Dimmerpack 1ch~~ | `qlc:Generic:Dimmer` | `1 Channel` | ~~`ofl:generic:4-channel-dimmer-pack`~~ | — | — | **retired** — same |
| 14, 15 | Standing lamp 1, 2 | *(4ch pack ch 1, 2)* | — | `gdtf:AD8F1059-…D1B3` | `Dimmer` | 1 | authored, #48 |
| 16, 17 | Profiler 1, 2 | *(4ch pack ch 3, 4)* | — | `gdtf:1081DF90-…B78CD` | `Dimmer` | 1 | authored, #48 |
| 18, 19 | PAR front L, R | *(1ch pack ch 1, ganged)* | — | `gdtf:FFC1C66D-…1B1A` | `Dimmer` | 1 | authored, #48 — **both on slot 89** |
| 10 | Fog Fury Jett | `qlc:American DJ:Fog Fury Jett (HTP Fog)` | `7 Channel` | `gdtf:26D59406-1AE9-4D59-8E00-A9DAF08EA018` | `7 Channel Mode` | 7 | clean, 1:1 |
| ~~9, 11, 12, 13~~ | ~~WLED Star / Highlight / Sparkle / Flash~~ | `qlc:WLED:WLED Segment Effect` | `18 Channel` | — | — | — | **retired**: these were WLED *segments*, not fixtures (#21) |
| 101–110 | STAR-TENT Spoke 1–10 | *(part of the same four segments)* | — | `ofl:beamhouse:wled-star-tent-spoke-23px` | `23px RGB 69-channel` | 69 | clean — verified on the live node, §3 |

Everything outside the `fixtures:` block was byte-identical to the original after #6. #23
changed three things in it, all forced by the tent becoming ten fixtures: group 12 (`WLED` →
`STAR-TENT`, now selecting 101–110), the `plans` entries for the retired ids, and the `dmx-1`
connection host — the node **moved to `192.168.1.243`** (#21; same Ethernet MAC, only the subnet
changed). `presets`, `layouts`, `version` and `playback` are still untouched.

### Addressing

| id | Universe | Channel was | Channel now | Occupies |
|----|----------|-------------|-------------|----------|
| 1–6 | 1 | 1 / 15 / 29 / 43 / 57 / 71 | *unchanged* | 1–84 (14 slots each) |
| 7 | 1 | 85 | 85 | 85–88 |
| 8 | 1 | 89 | 89 | 89 |
| 10 | 1 | 90 | 90 | 90–96 |
| 101–107 | 2 | *(9, 11, 13, 12 were at 1 / 19 / 37 / 55)* | **30 / 99 / 168 / 237 / 306 / 375 / 444** | 30–512, spoke by spoke |
| 108–110 | 3 | — | **1 / 70 / 139** | 1–207 |

Universe 1: 96 slots used. Universe 2: slots 30–512, **filled to the byte** — spoke 7 (id 107)
ends at 512 exactly, and 1–29 are left free deliberately (see §3). Universe 3: 1–207. No
overlaps, no overruns, checked programmatically, and then checked again *on the hardware*: all
230 pixels round-trip through exactly this patch (§3).

**On the "preserve `id`, `universe`, `channel`" requirement.** It holds for the nine fixtures it
can hold for — ids 1–8 and 10 keep all three — and for the thing the requirement exists to
protect: the placement-override layer is keyed by fixture id
([ADR-0003](../adr/0003-fixture-id-is-the-only-identity.md), DESIGN §4.5).

For the tent it cannot hold, and #23 stopped trying. #6 preserved ids 9 / 11 / 12 / 13 on the
grounds that the override layer keys on them. #21 then showed those ids named four **fully
overlapping whole-strip effect layers**, all four spanning `start 0, stop 230` — WLED segments,
not fixtures. There is no placement to preserve for a thing that was never in a place. Reusing
four of the ids for four of the ten spokes would have implied a continuity that does not exist,
so they are retired and the spokes get a fresh block at 101–110.

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

### Generic Dimmer → OFL — **superseded 2026-09-02 by [#48](https://github.com/jnslmk/beamhouse/issues/48)**

**This whole subsection is historical.** The mapping below was clean on channel count and
semantics and still wrong, because the thing being mapped is not a fixture:
[ADR-0037](../adr/0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) rules that **a dimmer pack
emits no light and its loads are the fixtures**. The `matrix` this subsection praises is a
*ganging* statement — `pixelGroups` named `Master`, `1/2`, `3/4` — with no `physical` block at
all, so traced through ADR-0022 then ADR-0005 a pack renders as a four-texel strip of no declared
extent. The two packs are now **six one-channel loads** on **three authored GDTF definitions**
(`definitions/authored/`), and the definition named below was never on disk anyway.

Kept rather than deleted: it records what the migration actually did, and the mode table is still
the correct reading of the OFL file.

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

### WLED segments → ten authored OFL spokes  *(rewritten by #23)*

`qlc:WLED:WLED Segment Effect` (`15 Channel` / `18 Channel`, both effect-parameter layouts)
→ `ofl:beamhouse:wled-star-tent-spoke-23px`, mode `23px RGB 69-channel`, **ten of them**.

There is no mode-to-mode mapping here and there cannot be, for two independent reasons.

**The channels mean different things.** The old 18 were `Segment Opacity`, `Effect`,
`Effect Speed`, `Effect Intensity`, `Palette`, `Effect Option`, then primary/secondary/tertiary
RGB and W — parameters WLED expands into pixels on-device. Effect mode is out of scope for
Beamhouse v1, re-ruled in [#18](https://github.com/jnslmk/beamhouse/issues/18) on grounds that
have nothing to do with the original ones. The migration is a change of *what is patched*.

**And the units are different things.** #6 read the four blocks as four physical tubes. #21 read
the node: they are four WLED **segments**, addressed by WLED's own mode-9 stride formula
`dataOffset = DMXAddress + id * (18 + DMXSegmentSpacing)` → 1 / 19 / 37 / 55, which is exactly
the QLC+ patch. All four span `start 0, stop 230`. They are stacked effect layers over the whole
run, not zones of it. Four blocks did not become four fixtures; they became **zero** fixtures,
and the ten physical spokes underneath them became ten.

For completeness, the two GDTF profiles that do model effect mode, both already pinned and both
still unused by this rig:

| Definition | rid | Mode |
|------------|-----|------|
| WLED Project · WLED RGB Effect Mode | 142265 | `RGB Effect Mode 15ch` |
| MarkeEigenbau · RGB LED Pixel Strip 30px 1m | 138539 | `Ws2812 30led/m 90Channel` |

---

## 3 · The STAR-TENT per-pixel patch

Rewritten in full for [#23](https://github.com/jnslmk/beamhouse/issues/23). What was here
before described four 35-pixel tubes at universe 2 slots 1 / 106 / 211 / 316. Every number in it
was falsified by [#21](https://github.com/jnslmk/beamhouse/issues/21), which read the live node.
The old text is in git history; nothing in it is worth carrying forward except the licensing
argument, which is restated below because it still decides the format.

### What the device actually is

One WLED controller (`STAR-TENT`, WLED 16.0.1, `ESP32_Ethernet`, MAC `68:FE:71:A5:2A:37`) at
**`192.168.1.243`** — it moved subnets since #6 was written. It drives **230 LEDs as one
continuous index space** over two physical buses:

| bus | pin | LEDs | = |
|-----|-----|------|---|
| 0 | 5 | 0–137 | 6 × 23 |
| 1 | 16 | 138–229 | 4 × 23 |

Physically that is **ten 1.5 m aluminium LED profiles arranged as radial spokes** — the tent is
literally a star. The 6/4 bus split is a cabling artifact, not a spatial grouping: the data index
runs continuously across it, and it is what turns `230 ÷ 23 = 10` from arithmetic into a reading
of the hardware. Emitters are `TYPE_FW1906` — **RGB + CW + WW**, not RGBW.

### One spoke is one fixture is one strip

[ADR-0005](../adr/0005-emitter-grouping-is-by-dmx-stride.md) rejects the 230-pixel run as a
single strip: ten spokes at ten angles are nowhere near collinear. Each 23-pixel spoke is
individually collinear and passes.
[ADR-0011](../adr/0011-a-fixture-is-addressed-per-break.md) then makes each spoke its own
fixture. The patch unit and the render unit align — spoke = fixture = strip — which is what
ADR-0005 §3 already arranged by making the render unit follow the patch unit.

### Addressing: why the node is at DMXAddress 30

WLED packs a fixed number of LEDs into its first universe and then spans consecutive universes
upward, each subsequent one starting at channel 1 (channel 0 for Art-Net). The count is not
configurable (`wled00/e131.cpp:347`):

```
ledsInFirstUniverse = (512 - DMXAddress + 1) / 3        # 3 ch/LED, Multi RGB
```

At the node's original `DMXAddress 1` that is **170**, which is not a multiple of 23 — so spoke 7
would have straddled the universe boundary, LEDs 161–169 in one universe and 170–183 in the next.
Under ADR-0011 rule 3 a fixture with a stale break is stale entirely, so a spoke that needlessly
straddles a boundary half-renders for no reason.

At **`DMXAddress 30`** it is `(512 - 30 + 1) / 3 = 161 = 7 × 23`. The boundary lands exactly on
the spoke 6 → spoke 7 seam, universe 2 fills to the byte, and every fixture is single-break.
Slots 1–29 of universe 2 are left free — that is the cost, and it buys the alignment.

**This is rig configuration, not architecture.** ADR-0011 rule 1 stands on its own: a fixture
*can* span universes, and v1 resolves the multi-break case for real. The re-addressing is not a
substitute for that, which is why the multi-break path is tested against
[#26](https://github.com/jnslmk/beamhouse/issues/26)'s offline oracle rather than against this
rig. Reset the node to address 1 and the patch is wrong, but nothing in Beamhouse breaks.

### The address map

Beamhouse/Mizer universe = Art-Net Port-Address + 1
([ADR-0007](../adr/0007-one-universe-space-sacn-numbered.md)). WLED reads the Port-Address
**raw** while its own UI calls that field "universe" (#26), so the node's configured "universe 1"
is Port-Address 1, which is **Beamhouse universe 2**. The tent needs Port-Addresses 1 *and* 2.

| id | Name | Universe | Slots | LEDs | Cable direction |
|----|------|----------|-------|------|-----------------|
| 101 | STAR-TENT Spoke 1 | 2 | 30–98 | 0–22 | centre → outer |
| 102 | STAR-TENT Spoke 2 | 2 | 99–167 | 23–45 | outer → centre |
| 103 | STAR-TENT Spoke 3 | 2 | 168–236 | 46–68 | centre → outer |
| 104 | STAR-TENT Spoke 4 | 2 | 237–305 | 69–91 | outer → centre |
| 105 | STAR-TENT Spoke 5 | 2 | 306–374 | 92–114 | centre → outer |
| 106 | STAR-TENT Spoke 6 | 2 | 375–443 | 115–137 | outer → centre |
| 107 | STAR-TENT Spoke 7 | 2 | 444–**512** | 138–160 | centre → outer |
| 108 | STAR-TENT Spoke 8 | 3 | 1–69 | 161–183 | outer → centre |
| 109 | STAR-TENT Spoke 9 | 3 | 70–138 | 184–206 | centre → outer |
| 110 | STAR-TENT Spoke 10 | 3 | 139–207 | 207–229 | outer → centre |

Within a spoke, pixel *n* = 1…23 from its `channel` **c**:
`R → c + 3(n−1)`, `G → c + 3(n−1) + 1`, `B → c + 3(n−1) + 2`.

### The serpentine, and the flag not to reach for

The spokes are cabled back and forth, so **odd-indexed spokes run outer → centre in data order**
(0-based: spokes 1, 3, 5, 7, 9 — ids 102, 104, 106, 108, 110). Authoring ten identical outward
spokes would render five of them mirrored, and on a symmetric star that looks entirely
plausible — the same silent-failure family as the 2θ rotation error in
[#20](https://github.com/jnslmk/beamhouse/issues/20).

Mizer's `reverse_pixel_order` looks like the answer and is not: it reorders sub-fixture *lookup*
only (`fixture.rs:171`) and never the slot mapping in `write_dmx`, so it changes what the console
writes rather than how the wire is laid out, and is invisible to a listener. The reversal belongs
in **Beamhouse's placement layer** (ADR-0005 §8): one outward-spoke definition, reversed spokes
placed rotated 180° about their own mid-point so pixel 0 lands at the tip on the same ray. Mizer
cannot carry it — `FixturePosition` is `{fixture, x, y, width, height}`, no Z and no rotation —
so this table is the record until the `.bhs` schema exists.

### The definition

[`definitions/ofl/beamhouse.json`](../../definitions/ofl/beamhouse.json), an OFL AGLight-export
library file (`{version, fixtures:[…]}`), which is the shape Mizer's OFL provider reads. One
fixture, **replacing** the 35px one rather than sitting beside it — nothing references the old
id after this re-patch, git holds the history, and a wrong definition left in a bundled library
is a trap rather than an archive.

```
manufacturer  Beamhouse            (explicitly not upstream OFL)
fixtureKey    wled-star-tent-spoke-23px
name          WLED STAR-TENT Spoke 23px
Mizer id      ofl:beamhouse:wled-star-tent-spoke-23px
matrix        pixelCount [23, 1, 1]
physical      dimensions [1500, 20, 20] mm
              matrixPixels.dimensions [65.217, 20, 20], spacing [0, 0, 0] mm
channels      Red 1..23, Green 1..23, Blue 1..23 — ColorIntensity, pixelKey "n"
mode          "23px RGB 69-channel", channels ordered R1 G1 B1 … R23 G23 B23
```

**OFL, not GDTF, and the reason is still licensing.** A 23-pixel GDTF derived from the pinned
`MarkeEigenbau` strip profile is mechanically trivial — that profile is `description.xml` with no
meshes, `GeometryReference` nodes on a `Beam` template with `Break` `DMXOffset` 3 apart — but it
would be a derivative of a GDTF Share file that grants no redistribution right
([ADR-0001](../adr/0001-gdtf-and-ofl-as-definition-formats.md)), so it would land in the
gitignored `definitions/gdtf/` with no rid and exist on exactly one laptop. OFL is MIT, ungated
and vendorable. It also exercises OFL's declarative `matrix.pixelCount` +
`physical.matrixPixels` path, which is the newer of the two readers.

**A defect #6 shipped, found and fixed here.** Mizer's OFL provider matches `ColorIntensity`
against **hex** colours (`COLOR_RED = "#ff0000"`, `lib.rs:658`), because the AGLight export emits
hex. #6's file wrote OFL's *named* form, `"color": "Red"`. It parsed, and it resolved — into 35
sub-fixtures with **zero** colour controls, confirmed by loading the old file through Mizer's own
provider: `color_mixer = None`, `intensity = None` on every pixel. It would have patched, listed
and shown in the UI while being undrivable. The new definition uses hex and resolves an `Rgb`
mixer on all 23 pixels.

**What is measured and what is not.**

- **Measured** (#21, off the node's `hw.led.ins`, 2026-09-02): 23 px per spoke, 230 total, the
  6/4 bus split, `TYPE_FW1906`.
- **Stated by the rig owner:** ten spokes, 1.5 m each, radial, cabled back and forth.
- **Derived, not measured:** the 65.217 mm pitch is 1500/23, the pixels tiling the profile. If
  the first and last pixel instead sit at the profile's ends it is 1500/22 = 68.182 mm, 4.6%
  larger. One tape measure settles it; nothing depends on it yet.
- **Placeholder:** the 20 mm cross-section. No v1 render path reads it — ADR-0005 takes ordering,
  axis and extent from pixel positions and nothing else.

Note that OFL's `matrixPixels.spacing` is the **gap between pixels, not the pitch** — confirmed
against the AGLight export, where Litebar H9 declares 9 pixels of 50 mm with a 61 mm gap over a
1000 mm body. #6's file set both `dimensions` and `spacing` to 16.667 mm, which declares a 33.3 mm
pitch: double what it intended. The new definition declares the whole 65.217 mm cell as the
pixel's own dimension with a zero gap, the idiom 13 of the 17 `matrixPixels` fixtures in the
export use.

**RGB is the protocol's limit, not a v1 concession.** The emitters are RGB + CW + WW, but WLED's
per-pixel DMX modes top out at 4 ch/LED (`is4Chan`, `setRealtimePixel(i, r, g, b, w)`) and derive
CW/WW on-device from W plus segment CCT. There is no wire path to the fifth channel in any mode
WLED offers, so the map's RGB-only exclusion is *reinforced* here rather than merely tolerated.

### The node cutover, and how to undo it

The node was in `DMX_MODE_EFFECT_SEGMENT_W` (mode 9) at `DMXAddress 1` — the configuration the
QLC+ show drives. #6's per-pixel patch could not have played against it, and neither could this
one. #23 cut it over:

```
POST http://192.168.1.243/json/cfg   {"if":{"live":{"dmx":{"addr":30,"mode":4}}}}
```

`/json/cfg` is a deep merge, so nothing else moved: `uni` stays 1, `en` true, port 6454,
`maxbri` true, `no-gc` true, `timeout` 25. **This takes the tent away from the QLC+ workspace**,
which expects mode 9. The revert is the same call with `{"addr":1,"mode":9}`.

### Verified on the hardware

`prototypes/star-tent-repatch/verify.py` drives #26's index-ramp pattern into the node **through
this ten-fixture patch** — building each universe by writing each spoke into its own patched
slots, rather than as one flat 690-byte ramp split in two, because the thing under test is that
ten independent 69-channel patches reassemble into the node's one index space — then reads all
230 pixels back off the Peek websocket.

```
ledsInFirstUniverse = (512 - 30 + 1) / 3 = 161  (7 x 23)
frames=30 distinct=1 leds=230 bytes=692
exact pixel matches: 230/230
  spoke 6  u2 ch 444-512  LED 138-160  OK
  spoke 7  u3 ch   1- 69  LED 161-183  OK
  LED 160: sent (160, 95, 242) got (160, 95, 242)   <- last LED of universe 2
  LED 161: sent (161, 94, 0)   got (161, 94, 0)     <- first LED of universe 3
PASS
```

All ten spokes exact, the universe seam observed at LED 160 → 161 exactly where the arithmetic
puts it, and 30 byte-identical frames. The capture is committed beside the script.

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
  the exact thing DESIGN §01 puts out of scope. The bridge cannot invent a 23-pixel matrix, let alone ten of them.
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

**All four of the questions this section carried are answered.** It originally flagged one
unknown — `~/qlc/README.md:513` records the STAR-TENT as 230 RGBW LEDs while four 35-pixel RGB
tubes is only 140 — and noticing it was right. Reading the node turned it into four:

1. **Pixel and profile count** — **23 px × 10 spokes = 230**, proven by the bus split
   (`138 = 6 × 23`, `92 = 4 × 23`), not inferred from the README (#21).
2. **RGB vs RGBW** — **neither**: `TYPE_FW1906`, RGB + CW + WW. And it does not matter, because
   WLED's per-pixel modes stop at 4 ch/LED, so there is no wire path to CW/WW at all (§3).
3. **How 690 channels map onto DMX** — **two universes**, unavoidably in every mode WLED offers.
   Answered as architecture by [ADR-0011](../adr/0011-a-fixture-is-addressed-per-break.md) (a
   fixture is addressed per break) and as rig configuration by the move to `DMXAddress 30`, which
   puts the boundary on a spoke boundary so no fixture straddles it (§3).
4. **Whether the node is in per-pixel input** — it was not, it was in effect mode 9. #23 cut it
   over to mode 4 and verified 230/230 pixels on the hardware (§3).

The two assumptions #6 labelled as such — tube order along the string, tube length / LED pitch —
are moot: they belonged to a four-tube model that no longer holds.

**What is still open** is one tape measure: whether the 23 pixels tile the 1.5 m profile
(65.217 mm pitch) or sit end-to-end (68.182 mm). Recorded in the definition's own comment.
Nothing in v1 reads it yet.

---

## 6 · Where the definition library now lives

| Library | Repo | Machine (Mizer reads both this and its bundled library) |
|---------|------|--------------------------------------------------------|
| GDTF (from GDTF Share) | `definitions/gdtf/` — **gitignored**, rebuilt by `tools/gdtf-share.sh restore` from `definitions/gdtf-manifest.json` | `~/Documents/Mizer/Fixture Definitions/GDTF/` |
| GDTF (authored) | `definitions/authored/GLP@impression 90 RGB@v1.gdtf` — **tracked** | same directory, `~/Documents/Mizer/Fixture Definitions/GDTF/` |
| OFL (authored) | `definitions/ofl/beamhouse.json` — **tracked**; holds the 23px STAR-TENT spoke, which replaced the superseded 35px tube in #23 | `~/Documents/Mizer/Fixture Definitions/Open Fixture Library/beamhouse.json` |
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
  `crates/components/fixtures/open-fixture-library/src/lib.rs:363`. The slug comes from **`name`,
  not `fixtureKey`** — renaming a fixture changes its Mizer id. Note Mizer reads OFL as a single
  `{version, fixtures:[…]}` library file per directory entry — the **AGLight** export shape
  (`https://open-fixture-library.org/download.aglight`), not the upstream repo's per-fixture
  layout. Match that export's conventions exactly: `manufacturer` is an **object** `{name}`, and
  `ColorIntensity.color` is a **hex string** (`#ff0000`), not OFL's named form — see the defect
  in §3.
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
- **The STAR-TENT is finished** (#23), and it is the part with the strongest evidence behind it:
  ten 23-pixel spokes, addressed per ADR-0011, loaded through Mizer's own OFL provider, and
  round-tripped 230/230 pixels through the live node. What remains is one tape measure for the
  pixel pitch (§5) and the spoke reversal, which has nowhere to live until the `.bhs` placement
  layer exists — §3 holds the table meanwhile.
- **The node no longer answers to the QLC+ workspace.** #23 moved it to `DMXAddress 30` /
  per-pixel mode 4. §3 carries the one-call revert.

The rig is now genuinely usable as the reference rig this ticket set out to produce: a real
patch, six beam-class movers with a measured axis hierarchy, and ten 23-pixel strip-class
fixtures whose addressing has been checked against the hardware — one of each of the two
rendering classes v1 commits to, both resolvable without QLC+.
