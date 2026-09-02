# ADR-0040: OFL's sole emitter draws the cone, and a pixel never does

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#49](https://github.com/jnslmk/beamhouse/issues/49)
- **Amends:** [ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md) rules 1 and 3,
  [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md) rule 1,
  [ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md) rule 5
- **Confirms:** [ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md), [ADR-0034](0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md), [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md)

## Context

[ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md) rule 1 selects the render
path on `BeamType`. That is a GDTF field, and [#49](https://github.com/jnslmk/beamhouse/issues/49)
observed it has no OFL counterpart — so every OFL fixture falls into the non-cone set **by accident
rather than by decision**. ADR-0022's context section measures six profiles, all GDTF, and its
decision is written entirely in GDTF's vocabulary.

Everything below is measured against the **live OFL corpus** — 629 fixtures, fetched 2026-09-02
from `open-fixture-library.org/download.ofl` — and against `schemas/fixture.json` at `master`.
No such corpus had been read in this repo before; every prior OFL claim here was made from the
schema, from Mizer's provider, or from one file.

### The ticket's premise is half false: OFL does have a lens-type field

`physical.lens.name` exists, and its own schema description is **"e.g. `'PC'`, `'Fresnel'`"** —
two of ADR-0022's five cone-drawing `BeamType` values. It is `nonEmptyString`, not an enum, and
the corpus shows what that buys:

| | count | of 629 |
|---|---|---|
| `physical` | 610 | 97.0% |
| `physical.dimensions` | 603 | 95.9% |
| `physical.bulb` | 550 | 87.4% |
| **`physical.lens.degreesMinMax`** | **400** | **63.6%** |
| `matrix` | 115 | 18.3% |
| `physical.bulb.colorTemperature` | 78 | 12.4% |
| **`physical.lens.name`** | **35** | **5.6%** |
| `physical.matrixPixels` | 17 | 2.7% |

35 fixtures populate `lens.name`, across **21 distinct values**: `Fresnel` (9), `Other` (4),
`PC` (4), and then one apiece — including `Fresnell`, `Fesnel Lens`, `Micro-Fresnel`,
`Ø 112mm Fresnel lens`, `34 beams`, `Manual Frost`, `Zoom` and
`Honey-Comb gapless plano convex optics`. The field exists; it is not load-bearing, and promoting
free text with two misspellings of one value into a render-path selector would be inventing a
declaration rather than reading one.

### `categories` cannot separate a cone from a thing that is not a fixture

`categories` is the one field that is present on **100%** of the corpus — the schema makes it
`minItems: 1`, "most important category first". It is also a fixture-kind field, and
`CONTEXT.md`'s **Beam class** entry already carries the warning:
*"`_Avoid_`: mover, moving head, spot (those are fixture kinds, not rendering classes)"*.

| primary category | n | declares `lens.degreesMinMax` | has `matrix` | both |
|---|---|---|---|---|
| Color Changer | 194 | 143 (74%) | 9 | 7 |
| Moving Head | 146 | 121 (83%) | 21 | 19 |
| **Dimmer** | 94 | **40 (43%)** | 4 | 0 |
| **Pixel Bar** | 39 | **37 (95%)** | 39 | 37 |
| Effect | 17 | 6 (35%) | 2 | 1 |
| Laser | 17 | 2 (12%) | 2 | 1 |
| Scanner | 16 | 8 (50%) | 0 | 0 |
| Smoke | 16 | **0** | 0 | 0 |
| Strobe | 15 | 11 (73%) | 7 | 6 |
| Flower | 15 | 7 (47%) | 5 | 3 |
| Blinder | 14 | 9 (64%) | 8 | 4 |
| Hazer | 14 | **0** | 0 | 0 |
| Other | 10 | 3 (30%) | 0 | 0 |
| Stand | 10 | 7 (70%) | 10 | 7 |
| Matrix | 6 | 5 (83%) | 6 | 5 |
| Fan | 5 | **0** | 2 | 0 |
| Barrel Scanner | 1 | 1 | 0 | 0 |

The Cameo **Q-Spot 40 CW** is `categories: ["Dimmer"]` — that one value and nothing else — with a
4.5–25° lens. The ETC **Source Four LED Series 3** is `["Dimmer", "Color Changer", "Strobe"]`,
5–90°. **49 fixtures carry `["Dimmer"]` alone.** All of them share their primary category with
`ofl:generic:4-channel-dimmer-pack`, which
[ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) ruled **is not a fixture at all**.
A selector that cannot tell a profile spot from a box of switched outlets is not a selector.

`Hazer`, `Smoke` and `Fan` — 35 fixtures, the categories that genuinely emit no beam — declare a
lens angle **zero** times. That is the signal `categories` was suspected of carrying, and
`degreesMinMax` already carries it.

### The cost of the accident is bigger than #49 said, and it is not a missing cone

#49 worried that a wash bar patched from OFL "would render as an emissive body and nothing else".
It would not. Non-cone hands the fixture to [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md)'s
stride grouping, which is the misfire ADR-0037 traced on the dimmer pack — four ganged electrical
outlets rendering as a four-texel strip. **90 fixtures declare both a lens angle and a `matrix`.**
An OFL wash bar does not lose its cone; it becomes a **strip**.

The remaining **310** — a lens angle, no `matrix` — are the single-emitter case: every OFL mover,
every Source Four, every PAR. Under the accident they render coneless, which is §5.1's
*"a rig where half the fixtures are invisible is a confusing first bug"*, the failure mode this
repo has now ruled against from three directions (ADR-0034, ADR-0022 rule 3, ADR-0031).

### ADR-0033's remedy is not available here

[ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md) rejected keeping the
spoke on `ofl:` because *"OFL cannot express `BeamType` or the strided tree either … the render
class would be inferred rather than declared"*, and moved the fixture to an authored GDTF. That
works for a definition **we** author. It is unavailable for a definition a **user** patches, and
DESIGN.md §01's **Generic** goal — *"any rig, from a patch source plus GDTF or OFL definitions. No
hard-coded fixtures"* — puts those in scope. For a user's fixture the alternative to inferring is
not declaring; it is rendering it wrong. ADR-0033's ruling stands for the choice it was making and
does not reach this one.

### One more measurement, which corrects an accepted rule

ADR-0005 rule 1 states: *"OFL requires no inference at all: `pixelKeys` / `pixelCount` **plus**
`physical.matrixPixels.spacing` state the layout outright."* **98 of the 115 OFL matrix fixtures
(85%) declare no `physical.matrixPixels` at all.** The rule holds for 17. ADR-0037 caught this on
one file — *"half of that is absent here, so the strip has no declared extent either"* — and it
generalises to the corpus.

## Decision

**1 · OFL declares no render path, and `physical.lens.name` is not promoted into one.** 5.6%
coverage, free text, 21 values for what would be a 5-value enum, two of them misspellings of
`Fresnel`. Reading it would be ADR-0022 rule 6's inferred render class with a field name attached.
A profile whose `lens.name` matters is corrected the way every other wrong third-party definition
is: in `gdtf-ts`'s quirks table (ADR-0005 rule 8) or by supplying a definition
(ADR-0012 rule 2, ADR-0038).

**2 · The cone attaches to an emitter, and in OFL the emitter count is the type signal. An OFL
fixture's *sole* emitter draws a cone of `physical.lens.degreesMinMax` where one is declared; a
*pixel* never draws one.**

This is ADR-0022 rule 1 read through the only signal OFL carries, and **it introduces no precedence
clause**. In GDTF a strip's pixels each target a `Glow` beam and a mover's sole emitter targets a
`Wash` beam — the type is per-emitter, and stride never competes for the same emitter. OFL has no
per-emitter type but it has a per-emitter *fact*: a `matrix` fixture's emitters are pixels, and a
non-`matrix` fixture has exactly one emitter. So no emitter is claimed by both rules here either,
and ADR-0022 rule 1's *"There is no precedence clause, because the two rules answer different
questions"* stays literally true across both formats.

**310 fixtures gain a cone; 115 matrix fixtures keep none.** The dimmer pack is unaffected — it
declares no lens at all — so ADR-0037 is confirmed rather than reopened.

**3 · `categories` selects nothing, in either direction.** Not the cone (Q-Spot 40 CW vs the dimmer
pack, above) and not its absence (`Hazer`/`Smoke`/`Fan` already declare no lens angle). It is a
fixture-kind field, which `CONTEXT.md`'s **Beam class** entry names as the thing a rendering class
is not. It stays unread by the renderer.

**4 · A declared `degreesMinMax` feeds `CONTEXT.md`'s **Cone angle** precedence unchanged, at its
third rung.** Measured: **271 of 400 (68%)** declare `min == max`, a fixed lens — which lands
exactly on the existing `BeamAngle == FieldAngle` hard/soft-edge degeneration and needs no new
rule. The other 129 are a zoom *range* with nothing to resolve it: only **4 fixtures of 629 (0.6%)**
carry a `BeamAngle` capability, so the DMX rung is empty for practical purposes and the range wants
the **middle** rung — the per-fixture manual override ADR-0037 added for a barrel-set zoom. Until
one is set, the cone renders at `degreesMinMax[0]`: the narrow end is the honest default, because a
wrong-narrow cone reads as a cone and a wrong-wide one reads as a wash.

**5 · An OFL emissive body is sized from `physical.dimensions`, or per pixel from
`physical.matrixPixels.dimensions`. This amends ADR-0022 rule 3.** Rule 3 promises an emissive body
*"of the declared `BeamRadius`"* and notes that this *"invents no number"* — but OFL has no
`BeamRadius`, so for an OFL fixture the rule as written has nothing to fall back to. It does have a
declared size: `physical.dimensions` on **603 of 629 (95.9%)**, `matrixPixels.dimensions` on 17.
Where **neither** is declared (26 fixtures, 4.1%), ADR-0034 rule 2 governs unchanged — *"no
dimensions are invented"*, a fixed marker. The rule's principle is untouched; only its single named
field was format-specific.

**6 · A declared `physical.bulb.colorTemperature` reaches the fixture model as a static
`LinearRGB`, exactly as ADR-0037 decision 4 made a GDTF `<Beam ColorTemperature>` do. This amends
ADR-0008 rule 5 a second time, on the same narrow ground.** 78 fixtures (12.4%) declare it. ADR-0037
admitted the GDTF field because for a fixture with no `ColorAdd_*` channels the colour *"arrives
from the file"*; OFL's field is the same declaration in the other format, and ADR-0001 converges
both onto one model. Declared, not invented. ADR-0008 rule 5's substance — no `colorSpace` field on
the converged model, so nothing can half-consult it — is untouched; a white point is not a colour
space, which is the distinction ADR-0008 exists to keep.

**7 · ADR-0005 rule 1's OFL clause is corrected: OFL states the layout outright for 17 of its 115
matrix fixtures.** The clause is not deleted — when `matrixPixels` is present it is exactly as good
as claimed, and it is what `definitions/ofl/beamhouse.json` was authored against. But it describes
15% of the corpus, and the grouping rule that fires on the other 85% is the *stride* half of rule 1,
with extent left undeclared. Recorded here because ADR-0022 rule 1 hands every non-cone emitter
straight to ADR-0005, so this is the very next rule to fire on an OFL fixture and the answer above
would otherwise rest on an overstated claim.

**8 · The renderer still never learns a fixture's source format.** ADR-0001's seam is the thing this
decision could most easily have broken: rules 2, 4, 5 and 6 all read OFL-specific fields. They are
read by the **OFL adapter**, which resolves them into the converged fixture model's render class,
cone angle, body size and static colour — the same four things the GDTF adapter resolves from
`BeamType`, `BeamAngle`, `BeamRadius` and `ColorTemperature`. Nothing downstream branches on format.

## Considered options

- **OFL never draws a cone — the accident, made explicit.** Coherent with every accepted rule and
  cheapest by far. Rejected on the 310: it mis-renders every single-emitter OFL fixture that
  declares a real beam angle, and routes the 90 matrix-plus-lens fixtures into the strip path on
  top of that. It is also the option ADR-0033 chose for the spoke, correctly — but there the
  fixture could be re-authored as GDTF, and a user's cannot.
- **A lens angle alone selects the cone.** Fatal: **37 of 39 Pixel Bars** declare one, so every
  pixel bar draws a cone per pixel. That is the thirty-cones-down-a-tube bug ADR-0022 was written
  to kill, re-entering through the OFL door.
- **`categories` selects the path.** Dead on Q-Spot-vs-dimmer-pack, and on the glossary's own
  fixture-kind warning.
- **Promote `physical.lens.name` to a `BeamType`.** Rejected by decision 1 — 5.6%, and the values
  measured.
- **A precedence clause: matrix beats lens.** Reaches the same 310/115 split as decision 2 and is
  simpler to state. Rejected because it makes ADR-0022 rule 1's "no precedence clause" claim false
  in OFL while staying true in GDTF, which is a rule that means two different things depending on
  where the file came from — the thing ADR-0001's converged model exists to prevent.

## Consequences

- `CONTEXT.md`'s **Beam class** entry gains the OFL reading; **Cone angle**'s third rung names
  `physical.lens.degreesMinMax` beside `BeamAngle`; **Emitter** gains what sizes the emissive body
  when no `BeamRadius` is declared. The glossary's existing *"fixture kinds, not rendering classes"*
  warning is now load-bearing rather than advisory — it is the reason `categories` is unread.
- `DESIGN.md` §8.2 is corrected a second time. #36 fixed *"cone geometry from each `Beam` node"*;
  the replacement is still GDTF-only and reads as though a fixture with no `BeamType` has no answer.
- **Nothing on the reference rig exercises this.** ADR-0037 dissolved the dimmer packs and ADR-0033
  rule 6 deletes the spoke's OFL entry, so the rig reaches zero OFL fixtures. That was #49's own
  argument for deciding it deliberately: the gap will not be found by running the rig.
- **The OFL adapter's `physical` block is now load-bearing**, where ADR-0001 listed it as a bonus.
  Four fields are read — `lens.degreesMinMax`, `dimensions`, `matrixPixels.dimensions`,
  `bulb.colorTemperature` — and `matrixPixels.spacing` stays optional per decision 7.
- **`physical.lens.name` is parsed and exposed, never consulted**, the same posture ADR-0008 rule 5
  gave `ColorSpace` in `gdtf-ts`: dropping data at parse time is the irreversible mistake.
- **What would reopen decision 2:** OFL gaining an enumerated lens or beam type. The schema's own
  `$comment` on `DMXconnector` — *"additions are welcome"* — shows the project does close enums when
  a field earns it. Until then the emitter count is the only per-emitter signal OFL has.
