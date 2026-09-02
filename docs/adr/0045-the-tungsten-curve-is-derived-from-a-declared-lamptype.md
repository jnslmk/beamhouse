# ADR-0045: The tungsten curve is derived from a declared `LampType`, not declared as a spectrum

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#50](https://github.com/jnslmk/beamhouse/issues/50)
- **Amends:** [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) decision 5
- **Confirms:** [ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md), [ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md), [ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md) rule 5
- **Amended by:** [#57](https://github.com/jnslmk/beamhouse/issues/57) (2026-09-02) — decision 6, the OFL clause
- **Source:** [`docs/research/gdtf-spectrum-vs-level.md`](../research/gdtf-spectrum-vs-level.md)

## Context

[ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) decision 5 ships a tungsten dimming
curve — `T / T0 = (radiance fraction) ^ 0.1235`, taking a 2700 K PAR38 to 2031 K at 10 % and 1527 K
at 1 % — and did not say where it is declared.
[ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md) rule 5 then moved the three tungsten
definitions to authored `gdtf:` files and left itself one escape clause:

> One thing could pull back: ADR-0037 decision 5's tungsten dimming curve needs a spectrum that
> varies with level, and whether GDTF can declare one is **unverified** — #50. If it cannot, that
> curve has nowhere to live but a `bhs:` definition, and rule 5 is revisited for that one field.

[#50](https://github.com/jnslmk/beamhouse/issues/50) is that verification. The findings are in
[`gdtf-spectrum-vs-level.md`](../research/gdtf-spectrum-vs-level.md); the five that decide this are
below.

### 1 · GDTF *can* declare a spectrum-versus-level curve. ADR-0037's guess at the construct was right

`Measurement@Physical` is a drive level, normatively:

> The measurement defines the relation between the requested output by a control channel and the
> physically achieved intensity. — `gdtf-spec.md:681`

> **Physical** — For additive color mixing: uniquely given emitter intensity DMX percentage. Value
> range between > 0 and <= 100. — `gdtf-spec.md:692`

The XSD gives `Emitter` a `maxOccurs="unbounded"` `Measurement` sequence and scopes the
wavelength-uniqueness constraint *inside each measurement* (`gdtf.xsd:285-311`), so every
`Measurement` carries its own independent spectrum. A three-measurement emitter with per-level
spectra was built and **validates against the official XSD**, and **round-trips through pygdtf**.

### 2 · But `Physical` indexes the *emitter's* percentage, and a `Dimmer` may not drive an emitter

The spec's machine-readable attribute table gives `UseEmitter="True"` to exactly sixteen
attributes — all `ColorAdd_*`. `Dimmer` is `UseEmitter="False"` (`gdtf-spec-next.md:2971`). ADR-0037
decision 4 already recorded that these six loads are *"the first fixtures on the rig with no
`ColorAdd_*` channels at all"*.

So the file would have to **acquire one**: an `<Emitter>` with a measurement per level, a
`<DMXChannel Offset="None">` virtual `ColorAdd_WW` channel (`gdtf-spec.md:1857`), and a
`<Relation Type="Multiply">` — the spec's own `"VirtualDimmer"` idiom (`gdtf-spec.md:2072`). Each
clause is separately normative; **the combination has no example in the spec and no implementation
anywhere.** It is legal by construction and untested in practice.

`DMXProfile`/`Point` is not an alternative route: it remaps one channel function's own physical
value, bounded by that function's `Min`/`Max` (`gdtf-spec.md:866-868`, `:1934`), and is referenced
by exactly two things — `ChannelFunction@DMXProfile` and `SubChannelSet@DMXProfile`. It cannot read
another channel and cannot touch a spectrum.

### 3 · No real profile does it, and no reachable consumer would read it

Measured over **5,408** real `description.xml` files (the `heliostate/OpenGDTFLibrary` corpus —
*not* the GDTF Share corpus, see below). Every file containing a `<Measurement>` was fetched and
parsed — 121 unique profiles, 470 `Emitter`/`Filter` elements:

| measured | result |
|---|---|
| elements with more than one `<Measurement>` | **0** (469 of 470 at `Physical="100"`) |
| profiles using `EmitterSpectrum` | **0** of 5,408 |
| profiles using `DMXProfile` (any `CFC1`) | **0** of 5,408 |

The only multi-measurement file found anywhere is BlenderDMX's own test fixture — no
`<MeasurementPoint>` children, so no spectrum varies, and it is **XSD-invalid** on exactly that
construct (`Physical="0"` violates `minExclusive="0"`).

Readers, measured directly: **BlenderDMX** contains zero occurrences of `Measurement`,
`measurement_points`, `dmx_profiles` or `profile.emitters`, and does not read `Beam@ColorTemperature`
either — it would render the fixture at a hardcoded warm-white constant. **Mizer** models
`PhysicalDescriptions` as a literal empty struct. **pygdtf** and **gdtf-rs** keep the full ordered
list losslessly and render nothing from it.

### 4 · The industry's own answer to this exact fixture

`Robe@PATT_2013` is a deliberate emulation of a tungsten PATT lamp — its whole selling point is
tungsten-like behaviour, and its DMX modes contain **exactly two channel functions, `Dimmer` and
`Tilt`**, the same shape as ADR-0037's loads. It declares a **single flat `ColorTemperature="3050"`,
`EmitterSpectrum="None"`, and zero emitters.** Of six real `LampType="Tungsten"` profiles examined,
not one declares warm-dim. Even `Robin MegaPointe`'s `Convers 2700K` and `Convers 3200K` filters —
a fixture whose job includes converting *to* 2700 K — are fixed spectra at full insertion.

### 5 · The `bhs:` fallback ADR-0038 named did not exist

Rule 5's escape clause says the curve would have *"nowhere to live but a `bhs:` definition"*. But
rule 5 defines `bhs:` in the same breath as `{kind, pixels, pitch}` — *"it never declares beam
optics or spectrum"* — and these three definitions need `BeamType`, `BeamAngle`, `BeamRadius` and
`ColorTemperature` whatever happens to the curve. Falling back to `bhs:` would have meant
**extending it past the line rule 5 had just drawn**, not moving into a place that was waiting. The
escape clause named a destination that was not there.

## Decision

**1 · ADR-0038 rule 5 stands unamended, and its escape clause is discharged rather than triggered.**
GDTF *can* declare a spectrum that varies with level (finding 1), so the stated condition — *"if it
cannot"* — never fires. The three definitions stay authored `gdtf:` files in `definitions/authored/`.
Finding 5 records that the fallback was unavailable in any case; that is worth knowing rather than
rediscovering, but it is not what decides this.

**2 · The curve is not declared as a spectrum. The definitions declare `LampType`, and Beamhouse
derives the drift from it.** Each of the three authored files carries, on its `Beam` geometry:

| definition | `LampType` | `ColorTemperature` |
|---|---|---|
| `gdtf:` generic PAR38 | `Tungsten` | 2700 K |
| `gdtf:` generic E27 practical | `Tungsten` | 2700 K |
| `gdtf:` generic profile | `Halogen` | 3200 K |

`LampType` is a declared GDTF field, not an invention:

> **LampType** — Defines type of the light source; The currently defined types are: Discharge,
> Tungsten, Halogen, LED; Default value "Discharge" — `gdtf-spec.md:1371`

and [`gdtf-spatial-resolution.md:1003`](../research/gdtf-spatial-resolution.md)'s attribute table
already annotates its Beamhouse use as *"dimming curve, strike behaviour"* — written before #50 and
unexercised until now. No `<Emitter>`, no `<EmitterSpectrum>`, no virtual channel and no `<Relation>`
appears in any of the three files.

**3 · Declaring the curve as an emitter measurement set is rejected — on the measurements, not on
taste.** It is unprecedented (0 of 5,408), unread by every reachable consumer, and reaches the
dimmer only through one undocumented combination of two normative clauses. Beamhouse would be
simultaneously the author and the only reader of the construct, and the file would carry an emitter,
a virtual channel and a relation existing solely to encode six numbers. **#50's stated upside —
*"the curve is portable to every other GDTF consumer"* — is false, and should not be repeated.** The
consumers were counted; there are none.

**4 · "Declared, not invented" has a third category, and this is it: derived from declared.**
[ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md)'s standard has read as a
binary — a value is read from the file or it is assumed. A *rule* keyed on a declared field is
neither. The lamp technology is read; the black-body behaviour of a heated filament is a universal
constant, not a per-fixture measurement, and no file needs to restate it.

GDTF applies exactly this reasoning itself: `EmitterSpectrum`'s documented default is *"a Black-Body
with the defined ColorTemperature"* — one declared number plus universal physics yielding a full
spectrum. Decision 2 extends that one step along the dimming axis, using the field the spec provides
for saying which physics applies.

**5 · `LampType` joins the fixture model, and this is not an ADR-0008 amendment.** It sits beside
`BeamType`, `BeamAngle`, `BeamRadius` and `ColorTemperature`, which the converged model already
carries. ADR-0008 rule 5's exclusion list — `ColorSpace`, `Gamut`, `Emitter` — is untouched, and
notably **`Emitter` stays excluded**, which decision 3 is what makes affordable: had the curve been
declared as measurements, rule 5 would have had to reopen `Emitter` far enough to admit a spectrum
set, which is the widening #50 warned the answer would feed back into. It does not.

**6 · The drift fires on the declared type, not on three fixture ids, and only where colour is not
on the wire.** Any fixture declaring `LampType="Tungsten"` or `"Halogen"` **and** having no
colour-mixing channels takes the curve; a tungsten fixture with `ColorAdd_*` or `CTO` takes its
colour off the wire as every other fixture does, and the curve does not apply. This is ADR-0037
decision 4's condition — a white point matters precisely where nothing else supplies colour — reused
rather than restated, and it means a tungsten profile pulled from GDTF Share tomorrow gets the
behaviour without an edit.

**[amended 2026-09-02 — #57]** Decision 6 is format-neutral as written — it keys on a **declared**
lamp type — and OFL has no field that declares one, which is now a decision rather than the accident
ADR-0045's consequence bullet below flagged. OFL's only lamp-technology field,
`physical.bulb.type`, is free text: populated on 550 of the 629-fixture corpus, but across **339
distinct values** mixing model numbers, wattages and technologies, and proven unreliable where it
does name one — Martin's Mac 250 Krypton declares `"Halogen"` at **CCT 8500 K** (a discharge
mover), while genuine halogen lamps named only by model code (`ELC 250W`, `A1/259`) carry no word
to match. It is **parsed and never consulted**, the posture [ADR-0043](0043-ofl-sole-emitter-draws-the-cone.md)
decision 1 gave `physical.lens.name`. An OFL fixture's lamp type is therefore **absent** in the
converged model, and stays absent: it is never defaulted to GDTF's schema-level `Discharge`, which
is a statement GDTF makes about GDTF files, not a property of the model. The drift is **unreachable
from OFL by decision**: an OFL fixture renders at its static white point
(`physical.bulb.colorTemperature`, ADR-0043 decision 6) and never warms — the same outcome as every
non-Beamhouse consumer renders for any tungsten GDTF (finding 3), the defensible answer #57 demanded
rather than a default nobody chose. The measured population this costs is ~1 clean fixture of 629
(Robert Juliat 613SX: a single `Dimmer` channel, `Tungsten T19`, 3050 K); the remedy for a user
whose OFL fixture is genuinely tungsten is the one ADR-0043 decision 1 already names for any
under-expressive third-party definition — an authored definition ([ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)
rule 2, [ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md) rule 5) — not new per-fixture
machinery on the model.

**7 · ADR-0037 decision 5 is untouched in substance.** The exponent, the derivation from
`T ∝ V^0.42` and `Φ ∝ V^3.4`, the level table and the argument against a fixed 2700 K all stand.
This ADR amends it only by stating where the curve lives, which decision 5 left open.
[ADR-0019](0019-the-intensity-map-is-relative-not-photometric.md)'s objection still does not reach
it: this is a chromaticity claim about a filament, not a photometric prediction about a room.

## Consequences

- **[#48](https://github.com/jnslmk/beamhouse/issues/48) is unblocked and its authoring is now
  fully specified.** Three GDTF files, each declaring `LampType` and a flat `ColorTemperature` on its
  `Beam`, with no `PhysicalDescriptions` content at all. Nothing in them encodes the curve.

- **The drift becomes a renderer rule, so it needs a home in the fixture model rather than in three
  files.** `CONTEXT.md` gains a **White point** entry covering both halves — ADR-0037 decision 4's
  static declaration and this ADR's derived drift — which is where the term should have landed when
  decision 4 minted it.

- **The GDTF Share corpus count is still owed.** The 5,408-profile count above is
  `heliostate/OpenGDTFLibrary`, reachable from a container; the 12,623-revision Share corpus from
  [#12](https://github.com/jnslmk/beamhouse/issues/12) lives on the user's own machine and was not
  consulted. It could raise the precedent count above zero. **It cannot change this decision**, because
  what decides it is the *reader* count, and the readers were measured directly rather than inferred
  from the corpus: BlenderDMX, Mizer, pygdtf and gdtf-rs render nothing from a measurement set no
  matter how many profiles carry one.

- **[#49](https://github.com/jnslmk/beamhouse/issues/49) gains a second permanently-absent field.**
  It asks what selects the render path for an OFL fixture given OFL has no `BeamType`; OFL has no
  `LampType` either, so no OFL fixture can ever take the tungsten drift. Whatever #49 decides for
  `BeamType` should cover this at the same time — the two are the same shape of gap, and deciding
  them separately would leave OFL a second silent default nobody chose. **[settled 2026-09-02 —
  #57]** #49's ADR closed on the emitter count without reaching the lamp-type field, so #57 decided
  it separately; the outcome is decision 6's amendment — the lamp type is absent for OFL and the
  drift is unreachable from OFL **by decision**, with the static white point (ADR-0043 decision 6)
  as the ceiling of what OFL can declare.

- **The `Relation Type="Multiply"` / virtual-channel idiom is now a read fact, not a used one.** It
  is the only construct in GDTF that lets a non-emitter channel drive an emitter, it is documented,
  and nothing implements it. If Beamhouse later meets a real profile using it, `gdtf-ts` will be
  parsing something no other reader honours — worth knowing before that is discovered as a bug.
