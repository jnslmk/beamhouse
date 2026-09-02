# ADR-0037: A dimmer pack is not a fixture; its loads are

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#47](https://github.com/jnslmk/beamhouse/issues/47)
- **Amends:** [ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md) rule 5
- **Confirms:** [ADR-0003](0003-fixture-id-is-the-only-identity.md), [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md), [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md), [ADR-0036](0036-the-ground-plane-is-the-only-surface-light-reaches.md)
- **Amended by:** [ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md) (2026-09-02) — decision 3 prefix; [ADR-0040](0040-the-tungsten-curve-is-derived-from-a-declared-lamptype.md) (2026-09-02) — decision 5, where the curve is declared


## Context

[#47](https://github.com/jnslmk/beamhouse/issues/47) asked whether to vendor or fetch
`ofl:generic:4-channel-dimmer-pack`, the definition fixtures 7 and 8 of the reference rig name and
which is nowhere on disk. It framed the gap as a **local resolution** problem — a missing file, and
a choice between a lockfile and a committed copy.

**The file is missing because nothing should be looking for it.** A dimmer pack emits no light. It
is a box of switched mains outlets, and what the rig actually wants drawn are the loads plugged
into it — which the pack's definition does not describe, cannot describe, and is not the right
place to describe.

### What the packs actually drive

Recorded nowhere in this repo before now, and the fact that decides the ticket:

| pack | slots | loads |
|---|---|---|
| Dimmerpack 1ch (fixture 8) | 88 | **2** PAR38 front lights, ganged on the one channel |
| Dimmerpack 4ch (fixture 7) | 84–87 | 2 E27 standing lamps (84, 85), 2 profilers (86, 87) |

Six loads behind two patched fixtures. All six are **tungsten** — the PAR38s and the standing lamps
are plain incandescent, the profilers halogen — on a rig that is otherwise entirely LED.

### The OFL `matrix` is a ganging statement, not a geometry

`~/git-projects/studio/public/fixtures/generic/4-channel-dimmer-pack.json`, read in full:

```json
"matrix": { "pixelCount": [4,1,1],
            "pixelGroups": { "Master": "all", "1/2": ["1","2"], "3/4": ["3","4"] } },
"templateChannels": { "Dimmer $pixelKey": { "capability": { "type": "Intensity" } } }
```

There is **no `physical` block at all** — no lens, no bulb, no `matrixPixels.spacing`. The
`pixelGroups` are named `Master`, `1/2`, `3/4`: those are patterns for *ganging electrical
outputs*, which have no spatial meaning whatever. OFL reached for `matrix` because it needed a way
to say "four intensity channels", not because anything is 32 mm from anything else.

### Traced through the accepted rules, it renders wrong

OFL declares no `BeamType`, so [ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md)
rule 1 leaves the fixture in the non-cone set. [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md)
rule 1 then fires on four sibling emitters at constant DMX stride 1, and the pack renders as a
**four-texel strip**. ADR-0005 rule 1 promised that "OFL requires no inference at all: `pixelKeys` /
`pixelCount` **plus** `physical.matrixPixels.spacing` state the layout outright" — half of that is
absent here, so the strip has no declared extent either.

The 1-channel pack is worse. Its single channel is `Dimmer Master`, the pixelGroup `"all"`, so one
electrical load driving two PAR38s would render as four ganged pixels.

**So vendoring the file would have bought a definition that is wrong in three ways at once**, and
the right correction is upstream of the resolution question the ticket asked.

### The loads are already expressible

Nothing new is needed to draw them. A load is a fixture with a one-channel `Dimmer` mode, addressed
where the pack's channel sits — which is what a console patch is for, and what
[ADR-0003](0003-fixture-id-is-the-only-identity.md) already keys everything by. The tempting
alternative — one fixture with N sockets, each socket carrying its own definition and its own
placement — is rejected in decision 1 below.

## Decision

**1 · A dimmer pack is not a fixture in Beamhouse; its loads are.** The pack is repatched away in
the console, and Beamhouse gains no concept for it. There is **no socket layer, and no per-channel
placement**: that would address a load by fixture id *plus* channel, breaking ADR-0003, and would
need N transforms under one id, breaking [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)
rule 1's "placement supplies a rigid transform and nothing else". Both stay literally true.

**2 · The reference rig repatches two fixtures into six.** Universe 1, sACN-numbered per
[ADR-0007](0007-one-universe-space-sacn-numbered.md):

| load | slot | definition | `BeamType` | CCT |
|---|---|---|---|---|
| PAR front L | **88** | `bhs:generic-par38` | `Wash` | 2700 K |
| PAR front R | **88** | `bhs:generic-par38` | `Wash` | 2700 K |
| Standing lamp 1 | 84 | `bhs:generic-e27-practical` | `Glow` | 2700 K |
| Standing lamp 2 | 85 | `bhs:generic-e27-practical` | `Glow` | 2700 K |
| Profiler 1 | 86 | `bhs:generic-profile` | `Spot` | 3200 K |
| Profiler 2 | 87 | `bhs:generic-profile` | `Spot` | 3200 K |

**3 · Three definitions, not six — because a PAR38 is an E27 lamp behind a reflector.** The PARs and
the standing lamps are the same bulb at the same colour temperature; only the reflector and the body
differ, so the dimming behaviour of decision 5 is authored once and shared by four of the six loads.

| definition | `BeamType` | angle | `BeamRadius` | body |
|---|---|---|---|---|
| `bhs:generic-par38` | `Wash` | 60° flood | 0.060 (121 mm face) | primitive |
| `bhs:generic-e27-practical` | `Glow` | — | 0.030 (A60 bulb) | primitives — stand, shade |
| `bhs:generic-profile` | `Spot` | `BeamAngle` == `FieldAngle` | — | primitive |

`Glow` for the practicals is [ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md)
rule 2's "absence of the cone" with the emissive body still on, which is what a bare bulb in a shade
is. `Spot` with `BeamAngle == FieldAngle` is the hard-edge degeneration `CONTEXT.md`'s **Cone angle**
entry already describes — a profile is the fixture that rule was written for.

None of the three needs a mesh. [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md)
finding 2 measured a 52-profile truss library drawn entirely from `Cylinder` and `Cube` primitives;
a lamp stand and a shade are the same shape of problem.

**4 · A declared `ColorTemperature` reaches the fixture model as a static `LinearRGB`. This amends
ADR-0008 rule 5, narrowly.** These are **the first fixtures on the rig with no `ColorAdd_*` channels
at all** — every other fixture takes its colour off the wire, and `CONTEXT.md`'s "every emitter is
RGB in v1" was written assuming the RGB arrives there. For a tungsten load it arrives from the file.

GDTF declares it: `<Beam ColorTemperature>` defaults to 6000 K and `EmitterSpectrum`'s documented
default is *"a Black-Body with the defined ColorTemperature"*. So 2700 K and 3200 K are **declared,
not invented**, which is the standard [ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md)
holds everything to.

ADR-0008 rule 5 currently omits `ColorSpace`, `Gamut` and `Emitter` from the converged model
outright, so that "assume sRGB" is structural rather than a matter of discipline. **Only the white
point is admitted.** Primaries stay assumed sRGB, rule 3's one-sentence assumption is untouched, and
rule 4's branded `LinearRGB` seam carries it — one number in, one `resolveColor` mint out. Nothing
gains the ability to half-consult a colour space, because no colour space is added.

**5 · Tungsten dims warm, and the curve is keyed to radiance rather than to the DMX value.**

    T / T0 = (radiance fraction) ^ 0.1235          from T ∝ V^0.42, Φ ∝ V^3.4

| level | 2700 K loads | 3200 K profilers |
|---|---|---|
| 100% | 2700 K | 3200 K |
| 50% | 2479 K | 2938 K |
| 25% | 2275 K | 2697 K |
| 10% | 2031 K | 2407 K |
| 5% | 1864 K | 2210 K |
| 1% | 1527 K | 1810 K |

**This costs no new assumption.** ADR-0008 rule 3 as amended by
[ADR-0010](0010-resolution-is-total-the-renderer-selects-by-attribute.md) already states that
intensity-like quantities — `ColorAdd_*` and `Dimmer` — are proportional to radiance. The curve
consumes that and adds nothing to it. It predicts no lux and reads no `LuminousFlux`, so
[ADR-0019](0019-the-intensity-map-is-relative-not-photometric.md)'s objection does not reach it:
this is a chromaticity claim about a filament, not a photometric prediction about a room.

Against the alternative — a fixed 2700 K scaled in brightness — a PAR at 10% would read as bright
white next to six LED movers that genuinely do not shift. The drift *is* the tungsten signature, and
these are the only tungsten sources in the rig.

**6 · The address → fixture map is not injective, and reverse lookups return a set.** The two PAR38s
share slot 88, because one dimmer channel drives both. Nothing anywhere requires address uniqueness
and [ADR-0011](0011-a-fixture-is-addressed-per-break.md) addresses per break without claiming
exclusivity, so this is legal by construction — but it is the first time the reference rig exercises
it. Any reverse mapping (a slot inspector, selection by address, "who owns slot 88") returns a
**set**. Free to specify now, a rewrite once something assumes a single answer.

**7 · A per-fixture override supplies the value for a channel with no DMX offset.** The two
profilers have **manual zoom**, set by hand at different angles on the same model. That is a third
source for the cone angle, and `CONTEXT.md` states two: *"the definition's static `BeamAngle`,
overridden per tick by a resolved `Zoom` where the DMX mode has one — the only renderer input fed by
both a static declaration and a live channel."* A hang setting is neither. It cannot go in the
definition, which is shared by both units and would then encode a hang decision; and it cannot go in
the placement, which ADR-0012 rule 1 pins to a rigid transform.

GDTF already has the slot. A **virtual channel** — `Offset=""`, meaning *"this attribute exists
logically but consumes no DMX slots of its own"* (`docs/research/gdtf-resolution-reference.md:162`) —
is exactly a `Zoom` that is not on the wire. So the override is not a new kind of thing: it is a
value for a channel that has no wire, consulted by `resolve` like any other. `CONTEXT.md`'s **Cone
angle** entry gains a third source, in precedence order: **resolved `Zoom` (per tick) > per-fixture
override (per hang) > definition `BeamAngle`.**

The mechanism is not built for the zoom alone. MVR carries per-instance `<Color>` and `<Gobo>` on
`<Fixture>` — hang-time values for attributes the mode does not drive — so Beamhouse meets the same
concept on a path it already commits to ingesting. One mechanism, three inputs. Manual focus, gel,
iris and barn doors all land in it without further design.

**8 · Invented numbers are labelled as invented, in the definition itself.** The profilers are a
25–50° manual zoom hung at **30°** and **42°**, and the halogen 3200 K is the standard theatre
figure rather than a measurement. All three are placeholders and say so. Everything else on
decision 3's table is a published lamp specification. This repo spends real effort on
declared-versus-assumed; an unlabelled 42° would read as measured within a month.

## Consequences

- **#47 dissolves rather than resolving.** There is nothing to vendor and no `tools/ofl.sh` to
  write, because after this no fixture names `ofl:generic:4-channel-dimmer-pack`. Its subsidiary
  questions — separating vendored from authored files in `definitions/ofl/`, whether a lockfile is
  warranted — go with it. The resolution gap does not vanish, it **moves**: three `bhs:` definitions
  now need authoring, which is [#41](https://github.com/jnslmk/beamhouse/issues/41)'s surface and
  ADR-0012 rule 2's mechanism.

- **The reference rig ends up with zero OFL fixtures.** The dimmer packs were two of the three OFL
  entries in `OBF26_Bunte-Stube_gdtf-ofl.yml`; the third is the ten STAR-TENT spokes on
  `ofl:beamhouse:wled-star-tent-spoke-23px`, which
  [ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md) moves to an
  authored GDTF and [#46](https://github.com/jnslmk/beamhouse/issues/46) retires. So
  [ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md)'s "OFL is the only format that can legally
  populate a shipped library" becomes not merely unused — as #47 already noted — but **unexercised
  by the only rig we test against.** OFL support stays in scope on ADR-0001's own licensing
  argument; it just loses its last live example, and that should be known rather than discovered.

- **`gdtf-ts` must implement virtual channels.** Mizer's GDTF crate drops them: `add_channel` bails
  with a `TODO` and the attribute is discarded (`conversion.rs:64-67`, recorded at
  `docs/research/gdtf-resolution-reference.md:162-169`). ADR-0004 makes `gdtf-ts` our own, so this
  is work rather than a blocker — but no upstream code exists to crib.

- **The practicals sharpen ADR-0035's seam rather than straining it.** A standing lamp is furniture
  *and* a light, which is exactly the pair
  [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md) separates: a scene object
  is a fixture with an **empty** DMX mode, and these have a one-channel one. The mode decides, not
  the appearance. [ADR-0036](0036-the-ground-plane-is-the-only-surface-light-reaches.md) rule 2's
  "an object never emits" is likewise untouched — these are fixtures, and they emit.

- **A `Glow` practical casts no floor pool.** ADR-0036's pool is the cone ∩ the plane `y = 0`, and
  `Glow` draws no cone. A real lamp in a real room does throw one. This is a known and accepted
  consequence of the closed form, not an oversight, and it is the same trade ADR-0036 rule 3 makes
  for occlusion.

- **Two questions leave with tickets rather than answers.** ADR-0022 is written entirely in GDTF
  terms and has no answer for OFL, which has no `BeamType` field — so every OFL fixture falls into
  the non-cone set silently, by accident rather than by decision. And whether GDTF can declare a
  spectrum-*versus-level* curve — plausibly `<Emitter>` carrying several `<Measurement Physical=…>`
  nodes — is **unverified**; if it can, decision 5's curve ships in an authored `gdtf:` file, and if
  it cannot, only a `bhs:` definition can hold it.

- **`CONTEXT.md` changes in two places.** **Cone angle** gains the third source of decision 7 and
  loses "the only renderer input fed by both". **Emitter**'s `_Avoid_: light, lamp, LED` stands —
  under decision 1 a load is a **Fixture** or an **Emitter** depending on its shape, and the project
  needs no new noun for it.
