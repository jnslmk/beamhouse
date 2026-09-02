# Can GDTF declare a spectrum that varies with drive level? `Measurement@Physical`, `DMXProfile`, and the tungsten curve

Ticket: [jnslmk/beamhouse#50](https://github.com/jnslmk/beamhouse/issues/50). Resolves the "two questions
leave with tickets rather than answers" bullet in
[ADR-0037](../adr/0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) — *"whether GDTF can declare a
spectrum-versus-level curve — plausibly `<Emitter>` carrying several `<Measurement Physical=…>` nodes — is
**unverified**; if it can, decision 5's curve ships in an authored `gdtf:` file, and if it cannot, only a
`bhs:` definition can hold it."* Companion to `gdtf-spatial-resolution.md` (geometry half) and
`gdtf-resolution-reference.md` (channel half).

**Sources read, with the exact revision each citation is against** (all fetched 2026-09-02):

| Short name | Source | Revision | Licence |
| --- | --- | --- | --- |
| **spec** | `mvrdevelopment/spec` → `gdtf-spec.md`, branch `main` | `098d379` (confirmed via GitHub code-search index ref); `sha256 3a48a49b…9229`, 3530 lines | no `LICENSE` file |
| **spec-next** | `mvrdevelopment/spec` → `gdtf-spec.md`, branch `next` | HEAD at fetch; `sha256 1d79afc6…6ed5`, 481 KB | as above |
| **xsd** | `open-stage/python-gdtf` → `tests/gdtf.xsd`, *"XML Schema for GDTF 1.2 … from DIN SPEC 15800:2022-02"* | `5252bcc`; `sha256 3a161265…6c92` | MIT |
| **pygdtf** | `open-stage/python-gdtf` → `pygdtf/__init__.py` (`__version__ = "1.4.6"`) | `5252bcc`; `sha256 588b5e00…0fef` | MIT |
| **pygdtf-1.4.5** | `pygdtf` 1.4.5 wheel from PyPI, installed and *executed* in this container | 1.4.5 | MIT |
| **gdtf-rs** | `cpdt/gdtf-rs` → `src/description/physical_descriptions.rs` | `410dcae` | MIT |
| **blender-dmx** | `open-stage/blender-dmx` → `gdtf.py`, `fixture.py`, `color_utils.py` | `4fb9cb7` | **GPL-3.0-or-later** (read-only for Beamhouse) |
| **mizer** | `maxjoehnk/Mizer` → `crates/components/fixtures/gdtf/src/definition.rs` | `be73963` | — |
| **OGL** | `heliostate/OpenGDTFLibrary` — 5,408 unpacked real `description.xml` files | `c1d4d92` (search-index ref); files fetched from `main` HEAD | — |
| **spec examples** | `mvrdevelopment/spec` → `examples/physical_descriptions.md`, `proposal/mvr-update-for-gdtf12/basic_gdtf.mvr` | `main` | — |

Also: `definitions/authored/GLP@impression 90 RGB@v1.gdtf` (this repo), `Robin MegaPointe.gdtf` (a real Robe
profile, extracted from the spec repo's own MVR example), `BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf`
(pygdtf's test fixture), `Generic@RGBW8@test.gdtf` (gdtf-rs's test fixture). Two experiments were **run**,
not reasoned about: a synthetic three-`Measurement` emitter was validated against the official XSD with
`lxml`, and parsed and re-serialised with pygdtf 1.4.5. Both are reproduced below.

---

## Headline finding

**Yes — GDTF can declare a spectrum-versus-level curve, and `Measurement@Physical` is exactly a driving
level. But the level it indexes is the *emitter's own additive-colour channel percentage*, and the spec's
machine-readable attribute table says only the sixteen `ColorAdd_*` attributes may drive an emitter —
`Dimmer` is explicitly `UseEmitter="False"`. A tungsten load with nothing but a `Dimmer` channel therefore
cannot attach the curve to its dimmer directly.**

Four findings, in decreasing order of how much they decide:

1. **`Measurement@Physical` is a drive level, verbatim: "For additive color mixing: uniquely given emitter
   intensity DMX percentage"** (spec:692). The section's opening sentence is even more explicit — *"The
   measurement defines the relation between the requested output by a control channel and the physically
   achieved intensity"* (spec:681). Several `<Measurement>` nodes under one `<Emitter>`, each carrying its
   own full `<MeasurementPoint>` spectrum, is **schema-valid** (§1.3) and **is** a declared spectrum-vs-level
   curve. §1.
2. **No real profile uses it that way.** Across **5,408** real `description.xml` files, only ~116 declare any
   `<Measurement>` at all; the **122 that do were fetched and parsed here (121 unique by content), yielding
   470 `<Emitter>`/`<Filter>` elements — every single one with exactly one `<Measurement>`, 469 of them at
   `Physical="100"`.** The one profile anywhere in this investigation with two measurements per emitter is
   BlenderDMX's own test fixture, and it is **XSD-invalid** on precisely that construct. §2.
3. **`DMXProfile`/`Point` is not the answer.** It is a piecewise-cubic remap of *one channel function's own
   physical value*, referenced only by `ChannelFunction@DMXProfile` and `SubChannelSet@DMXProfile`, bounded
   by that function's `Min`/`Max`. It cannot modulate another channel, and it cannot touch a spectrum. Zero
   of the 5,408 real profiles contain a single `CFC1` coefficient. §1.7.
4. **Every reachable consumer would render nothing from it.** pygdtf and gdtf-rs both keep the full list
   (verified by execution, §3.1), so the data survives parsing — but BlenderDMX contains **zero** occurrences
   of `Measurement`, `measurement_points`, `dmx_profiles` or `profile.emitters`, and does not even read
   `Beam@ColorTemperature`; Mizer's GDTF provider models `PhysicalDescriptions` as a literal empty struct.
   A consumer that ignores the curve renders **a flat, un-drifting colour**. §3.2.

The construct that *does* bridge dimmer → emitter percentage is `<Relation Type="Multiply">`, which the spec's
own Listing 1 names `"VirtualDimmer"` (spec:2072). That is the load-bearing discovery for ADR-0037, and §5
spells out exactly what it costs.

---

## 1. What the spec actually says

### 1.1 `Measurement` — the normative text, verbatim

`gdtf-spec.md:677-714`, DIN SPEC 15800 §"Measurement", Table 18. Quoted in full because every clause of it
is load-bearing:

> ### Measurement
>
> #### General
>
> The measurement defines the relation between the requested output by a
> control channel and the physically achieved intensity. XML node for
> measurement is `<Measurement>`. The currently defined XML attributes of
> the measurement are specified in table 18.

Table 18 (`gdtf-spec.md:690-695`):

| XML Attribute Name | Value Type | Description |
|---|---|---|
| Physical | Float | For additive color mixing: uniquely given emitter intensity DMX percentage. Value range between \> 0 and \<= 100. For subtractive color mixing: uniquely given flag insertion DMX percentage. Value range between 0 and 100. |
| LuminousIntensity | Float | Used for additive color mixing: overall candela value for the enclosed set of measurement. |
| Transmission | Float | Used for subtractive color mixing: total amount of lighting energy passed at this insertion percentage. |
| InterpolationTo | Enum | Interpolation scheme from the previous value. The currently defined values are: "Linear", "Step", "Log"; Default: Linear |

And the four paragraphs that follow it (`gdtf-spec.md:700-714`):

> The order of the measurements corresponds to their ascending physical
> values.
>
> Additional definition for additive color mixing: It is assumed that the
> physical value 0 exists and has zero output.
>
> Additional definition for subtractive color mixing: The flag is removed
> with physical value 0 and it does not affect the beam. Physical value
> 100 is maximally inserted and affects the beam.
>
> Note 1: Some fixtures may vary in color response. These fixtures define
> multiple measurement points and corresponding interpolations.
>
> As children the Measurement Collect has an optional list of a
> measurement point.

**This settles question 1's first half.** `Physical` is *not* "the physical value the measurement was taken
at" in some free-form sense. It is a **percentage of the control channel's drive**, on a 0–100 scale, with
`> 0` at the low end because zero output is assumed rather than measured. `LuminousIntensity` is the achieved
candela **at that drive percentage** — the words "for the enclosed set of measurement" tie the candela and
the enclosed `<MeasurementPoint>` spectrum to the same `Physical`.

Because `Physical` is per-`Measurement` and the measurements are ordered ascending, **a list of
`<Measurement>` nodes under one `<Emitter>` is a curve indexed by drive level, and each node may carry its own
spectrum.** That is structurally identical to what ADR-0037 decision 5 needs.

**Note 1 is the one ambiguous sentence, and it should not be over-read.** *"These fixtures define multiple
measurement points and corresponding interpolations"* — "measurement point" is the name of a *different*
element (`<MeasurementPoint>`, which has only `WaveLength` and `Energy` and no interpolation attribute at
all), so read literally the sentence is incoherent. The only element that has an interpolation is
`<Measurement>` (`InterpolationTo`, "Interpolation scheme from the previous value"), so the sentence is best
read as loose prose meaning *multiple `<Measurement>` nodes*. **The mechanism does not depend on that
reading**: "The order of the measurements corresponds to their ascending physical values" already
presupposes a plural, and the XSD (§1.3) makes it unambiguous. Note 1 is nevertheless the *only* place in the
spec that gestures at colour changing with level, and it does so in a non-normative note.

**What the spec never says:** it never states that the `<MeasurementPoint>` energies of successive
`<Measurement>` nodes are interpolated, nor how. `InterpolationTo` is documented as *"Interpolation scheme
from the previous value"* (singular "value") and sits in a table alongside `LuminousIntensity` and
`Transmission`. Whether it governs the spectrum as well as the scalar is **undefined by the text**. Flagged
as unverified in §4.

### 1.2 `MeasurementPoint`

`gdtf-spec.md:716-735`:

> The measurement point defines the energy of a specific wavelength of a
> spectrum. The XML node for measurement point is `<MeasurementPoint>`. […]
>
> It is recommended, but not required, that measurement points are evenly
> spaced. Regions with minimal light energy can be omitted, but the
> decisive range of spectrum must be included. Recommended measurement
> spacing is 1 nm. Measurement spacing should not exceed 4 nm.

| XML Attribute Name | Value Type | Description |
|---|---|---|
| WaveLength | Float | Center wavelength of measurement (nm). |
| Energy | Float | Lighting energy (W/m2/nm) |

> The measurement point does not have any children.

So a `<Measurement>`'s children are a **sampled spectral power distribution in W/m²/nm**, at 1–4 nm spacing
over "the decisive range". A visible-range 1 nm spectrum is ~400 points; the real Robe profile inspected here
uses 421 points per filter (§2.4). That is the practical cost of one spectrum, and the cost of a *curve* is
that times the number of levels.

### 1.3 The XSD: multiple `<Measurement>` per `<Emitter>` is legal, and each holds an independent spectrum

`gdtf.xsd:285-311` — the official schema, whose header states it *"tries to describe GDTF 1.2 from DIN SPEC
15800:2022-02 to the extent possible with XSD 1.0"*:

```xml
<xs:complexType name="Emitter">
  <xs:sequence minOccurs="0" maxOccurs="unbounded">
    <xs:element name="Measurement" type="EmitterMeasurement">
      <xs:unique name="UniqueWaveLengthInEmitterMeasurement">
        <xs:selector xpath="MeasurementPoint"/>
        <xs:field xpath="@WaveLength"/>
      </xs:unique>
    </xs:element>
  </xs:sequence>
  <xs:attribute name="Name" type="nametype" use="required"/>
  <xs:attribute name="Color" type="vector3type"/>
  <xs:attribute name="DominantWaveLength" type="xs:float"/> <!-- Required if Color is omitted! -->
  <xs:attribute name="DiodePart" type="xs:string"/>
</xs:complexType>
<xs:complexType name="EmitterMeasurement">
 <xs:sequence minOccurs="0" maxOccurs="unbounded">
  <xs:element name="MeasurementPoint"
   type="MeasurementPoint"/>
 </xs:sequence>
 <xs:attribute name="Physical" type="physicaltype"
  use="required"/>
  <xs:attribute name="LuminousIntensity" type="xs:float"
    use="required"/>
    <xs:attribute name="InterpolationTo"
      type="InterpolationToEnum" default="Linear"/>
      <xs:attribute name="Transmission" type="xs:float"/>
    </xs:complexType>
```

Three things decide here:

1. `maxOccurs="unbounded"` on `Measurement` — **many measurements per emitter, explicitly.**
2. The `xs:unique` constraint on wavelength is scoped **inside each `Measurement`**, not across the emitter.
   The same 550 nm may therefore appear once per `Measurement`. That is only meaningful if each
   `<Measurement>` is expected to hold **its own complete spectrum** — which is precisely the "spectrum at
   this driving level" reading.
3. `physicaltype` (`gdtf.xsd:879-884`) enforces the text's range exactly:

```xml
<xs:simpleType name="physicaltype">
  <xs:restriction base="xs:float">
    <xs:minExclusive value="0"/>
    <xs:maxInclusive value="100"/>
  </xs:restriction>
</xs:simpleType>
```

`<Filter>`/`FilterMeasurement` (`gdtf.xsd:318-337`) is structurally identical, except `Transmission` is
`use="required"` and `LuminousIntensity` is absent — the subtractive mirror image. `Filter@Physical` is
"flag insertion DMX percentage", i.e. **how far a physical flag is inserted into the beam**, which is again a
drive level, not a lab condition.

**Verified by execution.** A synthetic emitter with three measurements at `Physical` 1/10/100, each carrying
`<MeasurementPoint>` children, was injected into an otherwise-unmodified real profile and validated with
`lxml` against `gdtf.xsd`:

```
multi.gdtf valid: True
```

(The synthetic emitter, for the record:)

```xml
<Emitters>
  <Emitter Color="0.4599,0.4106,100.0" Name="Tungsten">
    <Measurement InterpolationTo="Linear" LuminousIntensity="8.0" Physical="1.000000">
      <MeasurementPoint Energy="0.10" WaveLength="450"/>
      <MeasurementPoint Energy="0.55" WaveLength="650"/>
    </Measurement>
    <Measurement InterpolationTo="Linear" LuminousIntensity="100.0" Physical="10.000000">
      <MeasurementPoint Energy="0.20" WaveLength="450"/>
      <MeasurementPoint Energy="0.70" WaveLength="650"/>
    </Measurement>
    <Measurement InterpolationTo="Linear" LuminousIntensity="1000.0" Physical="100.000000">
      <MeasurementPoint Energy="0.50" WaveLength="450"/>
      <MeasurementPoint Energy="1.00" WaveLength="650"/>
    </Measurement>
  </Emitter>
</Emitters>
```

**A declared drift curve is therefore a well-formed, schema-valid GDTF document. This is verified, not
inferred.**

### 1.4 `Emitter@Color` and `Emitter@DominantWaveLength`

`gdtf-spec.md:612-643`, Table 16:

> This section contains the description of the emitters. Emitter Collect
> defines additive mixing of light sources, such as LEDs and tungsten
> lamps with permanently fitted filters.

| XML Attribute Name | Value Type | Description |
|---|---|---|
| Name | Name | Unique Name of the emitter |
| Color | ColorCIE | Approximate absolute color point if applicable. Omit for non-visible emitters (eg., UV). For Y give relative value compared to overall output defined in property Luminous Flux of related Beam Geometry (transmissive case). |
| DominantWaveLength | Float | Required if color is omitted, otherwise it is optional. Dominant wavelength of the LED. |
| DiodePart | String | Optional. Manufacturer's part number of the diode. |

> As children, the Emitter has a list of measurements.

Note the phrase **"tungsten lamps"** is in the Emitter Collect's own definition — the element is not
LED-only, despite `DominantWaveLength`'s "of the LED" wording.

`Emitter@Color` is **a single CIE xyY point for the whole emitter**, with no level qualifier. It is
the emitter's headline colour; `Y` is a *relative* value against the Beam geometry's `LuminousFlux`, not an
absolute. So an emitter has exactly one declared chromaticity plus zero-or-more measured spectra. If a curve
is declared, `@Color` describes the emitter at full — nothing in the spec says which measurement `@Color`
corresponds to, though `Physical="100"` is the only plausible reading and is what all 470 real
emitter/filter elements surveyed in §2 use.

### 1.5 How a channel links to an emitter — and which channels are *allowed* to

Three places in GDTF reference the Emitter Collect (`gdtf-spec.md`, greps confirmed exhaustive):

| Site | Line | Semantics |
|---|---|---|
| `ChannelFunction@Emitter` | 1926 | *"Optional. Link to an emitter in the physical description; Starting point: Emitter Collect"* |
| `Beam@EmitterSpectrum` | 1382 | *"Optional link to emitter in the physical description; use this to define the white light source of a subtractive color mixing system. Starting point: Emitter Collect; **Default spectrum is a Black-Body with the defined ColorTemperature**."* |
| `Laser@Emitter` | 1526 | *"Optional link to the emitter group."* |

The XSD's referential-integrity constraint only covers the first (`gdtf.xsd:60-63`):

```xml
<xs:keyref name="EmitterKeyReference" refer="UniqueEmitter">
  <xs:selector xpath="DMXModes/DMXMode/DMXChannels/DMXChannel/LogicalChannel/ChannelFunction"/>
  <xs:field xpath="@Emitter"/>
</xs:keyref>
```

The spec's own worked example (`examples/physical_descriptions.md`) shows the link exactly once, and it is a
colour channel:

```xml
<DMXChannel Offset="5" Default="255/1" Highlight="255/1" Geometry="Head">
    <LogicalChannel Attribute="ColorAdd_R" >
        <ChannelFunction Attribute="ColorAdd_R" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Emitter="measured R">
        </ChannelFunction>
    </LogicalChannel>
</DMXChannel>
```

**And in the `next` branch this stops being a convention and becomes machine-readable.** `spec-next` extends
every entry in the Attribute Definitions with `UseEmitter` / `UseFilter` / `UseWheel` / … flags. Of 282
attribute definitions, **exactly 16 carry `UseEmitter="True"`**, and they are precisely the additive colour
attributes:

```
ColorAdd_R, ColorAdd_G, ColorAdd_B, ColorAdd_C, ColorAdd_M, ColorAdd_Y,
ColorAdd_RY, ColorAdd_GY, ColorAdd_GC, ColorAdd_BC, ColorAdd_BM, ColorAdd_RM,
ColorAdd_W, ColorAdd_WW, ColorAdd_CW, ColorAdd_UV
```

`Dimmer` is not among them (`gdtf-spec-next.md:2964-2977`):

```xml
<Attribute
  Name="Dimmer"
  Pretty="Dim"
  Feature="Dimmer.Dimmer"
  Definition="Controls the intensity of a fixture."
  Explanation="Gradual (fading) change of intensity or brightness or in some cases even opacity shall be controlled with this attribute. Physical values go from 0 = no output, to 1 = full output. …"
  Label="Dimmer"
  UseEmitter="False"
  UseFilter="False"
  …/>
```

versus, e.g., `ColorAdd_WW` (`gdtf-spec-next.md:4378-4392`):

```xml
<Attribute
  Name="ColorAdd_WW"
  Pretty="WW"
  ActivationGroup="ColorRGB"
  Feature="Color.RGB"
  PhysicalUnit="ColorComponent"
  Color="0.319,0.340,99.3"
  Definition="Controls the intensity of the fixture's warm white emitters for direct additive color mixing."
  Explanation="Gradual (fading) change of intensity or saturation of an additive Warm White color/emitter/flag with direct access to the color. Physical values go from 0 = no output, to 1 = full output/saturation."
  Label="Warm-White Additive Direct"
  UseEmitter="True"
  …/>
```

**This is the sharpest single constraint in the whole investigation.** `Measurement@Physical` is "emitter
intensity DMX percentage", and the only attributes GDTF permits to *be* an emitter's intensity are the
sixteen `ColorAdd_*`. A one-channel `Dimmer` load cannot carry the curve on its dimmer.

### 1.6 `ColorTemperature` is not a channel attribute

There is no `ColorTemperature` in GDTF's attribute list. Grep across all 282 attribute definitions in both
branches: `ColorTemperature` appears only as (a) `Beam@ColorTemperature`, a static geometry attribute
(`gdtf-spec.md:1374`, *"Color temperature; Default value: 6000; Unit: kelvin"*), and (b) `CRIGroup@ColorTemperature`
(`gdtf-spec.md:900`), which groups TM-30 fidelity samples, not a rendering input.

The only *channel* attributes measured in kelvin are `CTO`, `CTC`, `CTB` (`gdtf-spec.md:2851-2853`):

```xml
<Attribute Name="CTO" Pretty="CTO" Feature="Color.Color" PhysicalUnit="Temperature" />
<Attribute Name="CTC" Pretty="CTC" Feature="Color.Color" PhysicalUnit="Temperature" />
<Attribute Name="CTB" Pretty="CTB" Feature="Color.Color" PhysicalUnit="Temperature" />
```

`spec-next` supplies their explanations (`gdtf-spec-next.md:4559-4603`), which matter because they establish
what a CT channel's physical value *means*:

> **CTO** — "Choose this attribute to control a function that modifies the Color Temperature of a fixture's
> light output. CTO decreases the Color Temperature from its default. **Physical values describe the
> resulting Color Temperature.**"
>
> **CTC** — "… CTC either increases or decreases the Color Temperature from its default. Physical values
> describe the resulting Color Temperature."

All three are `UseEmitter="False"`, `UseFilter="True"`.

**So GDTF *can* express a colour temperature that varies with DMX** — via a `ChannelFunction` whose
`Attribute` is `CTO`/`CTC`/`CTB` and whose `PhysicalFrom`/`PhysicalTo` are kelvin, refined per range by
`ChannelSet@PhysicalFrom`/`PhysicalTo` (`gdtf-spec.md:1970-1976`) and shaped non-linearly by a
`DMXProfile` (§1.7). What it does *not* do is let that channel be the same channel as the dimmer.

### 1.7 `DMXProfile` / `Point` — checked carefully, and it is not the answer

`gdtf-spec.md:820-874`. The collect is introduced in the Physical Descriptions children table
(`gdtf-spec.md:604`) as *"Describes nonlinear correlation between DMX input and physical output of a
channel."* A `<DMXProfile>` has only a `Name` and a list of `<Point>`:

| XML Attribute Name | Value Type | Description |
|---|---|---|
| DMXPercentage | Float | DMX percentage of the point; Unit: Percentage; Default value: 0 |
| CFC0 | Float | Cubic Function Coefficient for x⁰; Default value: 0 |
| CFC1 | Float | Cubic Function Coefficient for x; Default value: 0 |
| CFC2 | Float | Cubic Function Coefficient for x²; Default value: 0 |
| CFC3 | Float | Cubic Function Coefficient for x³; Default value: 0 |

and the evaluation rule, verbatim (`gdtf-spec.md:866-868`):

> Find the Point with the biggest DMXPercentage below or equal x. If there is none, the output is expected to be 0.
>
> Output(x) = CFC3 * (x - DMXPercent)³ + CFC2 * (x - DMXPercent)² + CFC1 * (x - DMXPercent) + CFC0

**Who may reference it — exhaustively two sites**, confirmed by grep over both branches and by the XSD
(`gdtf.xsd:744`, `gdtf.xsd:761`):

| Site | Line | Text |
|---|---|---|
| `ChannelFunction@DMXProfile` | spec:1933 | "Optional link to DMX Profile; Starting point: DMX Profile Collect" |
| `SubChannelSet@DMXProfile` | spec:1998 | "Optional link to the DMX Profile; Starting Point: DMX Profile Collect" |

Nothing else. Not `DMXChannel`, not `LogicalChannel`, not `ChannelSet`, not `Emitter`, not `Beam`.

**What quantity it modulates** is fixed by the two attributes that sit immediately beneath the reference in
Table 60 (`gdtf-spec.md:1934-1935`):

| Min | Float | Minimum Physical Value that will be used for the DMX Profile. Default: Value from PhysicalFrom |
| Max | Float | Maximum Physical Value that will be used for the DMX Profile. Default: Value from PhysicalTo |

So the profile's `Output(x)` is **the physical value of the channel function it is attached to**, clamped to
that function's own `Min`/`Max` (defaulting to `PhysicalFrom`/`PhysicalTo`). `x` is the DMX percentage of
that same channel. A `DMXProfile` is therefore a **per-channel transfer curve on one scalar attribute** —
a dimmer curve on a `Dimmer` function, a kelvin curve on a `CTC` function, a degrees curve on a `Zoom`
function. It has no access to a spectrum, no access to an emitter, and no way to read a different channel's
level.

**It is also entirely unused in the wild.** GitHub code search over the 5,408-file OGL corpus for `CFC1`
returns **0 results**. (Searching for `<DMXProfile` is useless — it matches the empty `<DMXProfiles/>`
element present in essentially every file.)

One schema wrinkle worth recording: the official XSD declares `DMXProfile`'s child sequence **without**
`maxOccurs`, i.e. **at most one `<Point>`** —

```xml
<xs:complexType name="DMXProfile">
  <xs:sequence minOccurs="0">
    <xs:element name="Point" type="Point"/>
  </xs:sequence>
  <xs:attribute name="Name" type="nametype"/>
</xs:complexType>
```

`gdtf.xsd:371-375`. This contradicts the spec text (*"As children a DMX Profile has a list of point"*,
`gdtf-spec.md:844`) and the whole point of the piecewise construction. It is an XSD bug, not a spec
restriction — but any Beamhouse-authored file relying on multi-point profiles would fail this XSD. (`Gamuts`
at `gdtf.xsd:357-361` has the identical bug.) Contrast `Emitter`, which correctly carries
`maxOccurs="unbounded"` — so the multi-`Measurement` construct §1.3 relies on is *not* affected.

### 1.8 The one construct that bridges a dimmer to an emitter percentage: `Relation Type="Multiply"`

`gdtf-spec.md:2007-2030`:

> This section describes the dependencies between DMX channels and channel
> functions, such as multiply and override.

| XML Attribute Name | Value Type | Description |
|---|---|---|
| Name | Name | The unique name of the relation |
| Master | Node | Link to the master DMX channel; Starting point: DMX mode |
| Follower | Node | Link to the following channel function; Starting point: DMX mode |
| Type | Enum | Type of the relation; Values: "Multiply", "Override" |

The spec's own Listing 1 (`gdtf-spec.md:2072-2074`) uses it for exactly this purpose, and names it:

```xml
<Relation Name="VirtualDimmer" Master="Pixel_Dimmer" Follower="Pixel_ColorAdd_R.ColorAdd_R.ColorAdd_R 1" Type="Multiply" />
<Relation Name="VirtualDimmer" Master="Pixel_Dimmer" Follower="Pixel_ColorAdd_G.ColorAdd_G.ColorAdd_G 1" Type="Multiply" />
<Relation Name="VirtualDimmer" Master="Pixel_Dimmer" Follower="Pixel_ColorAdd_B.ColorAdd_B.ColorAdd_B 1" Type="Multiply" />
```

A `Dimmer` DMX channel multiplying the `ColorAdd_*` channel functions is **the spec's own idiom** for "the
dimmer scales the emitters". And a DMX channel need not consume an address — `DMXChannel@Offset`
(`gdtf-spec.md:1857`) reads:

> Relative addresses of the current DMX channel from highest to least significant; Separator of values is
> ","; **Special value: "None" – does not have any addresses**; Default value: "None"; Size per int: 4 bytes

So a `ColorAdd_WW` channel with `Offset="None"`, defaulted to full, followed off a real `Dimmer` channel via
`Relation Type="Multiply"`, gives an emitter whose intensity percentage **is** the dimmer level — without
consuming a second DMX slot. §5 assesses that. **The spec has no example of a virtual (`Offset="None"`)
follower, so this specific combination is inference from two independently-quoted normative clauses, not a
documented pattern.**

### 1.9 What the `next` branch changes

`Measurement`, `MeasurementPoint`, `Emitter`, `Filter`, `DMXProfile` and `Point` are **byte-identical**
between `main` and `next` (compared directly; `next` Table 18 is at `gdtf-spec-next.md:754-777` with the same
text). So none of the above is a moving target.

Two `next`-only additions matter:

1. **`Beam@EmitterSpectrum` is widened** (`gdtf-spec-next.md:1467`) — the clause added over `main` is
   emphasised:

   > Optional link to emitter in the physical description; use this to define the white light source of a
   > subtractive color mixing system **or the color for the beam when no color mixing is defined**. Starting
   > point: Emitter Collect; Default spectrum is a Black-Body with the defined ColorTemperature.

   That is a direct invitation for a dimmer-only fixture — precisely ADR-0037's loads — to declare its beam
   colour by pointing at an `<Emitter>`. It does **not**, however, say anything about which of that emitter's
   measurements applies, and `Beam@EmitterSpectrum` is not in the XSD's `EmitterKeyReference` (§1.5).
2. **`Beam@Photometric`** (`gdtf-spec-next.md:1468`) — "Optional. File name … containing description of the
   IES or EULUMDAT file in the subfolder `./photometric/`." An intensity distribution, not a spectrum; noted
   only so it is not mistaken for one.

### 1.10 Verdict on question 1

| Question | Answer | Evidence |
|---|---|---|
| Is `Measurement@Physical` a driving level? | **Yes**, unambiguously — "emitter intensity DMX percentage" / "flag insertion DMX percentage" | spec:681, spec:692 |
| Do several `<Measurement>` under one `<Emitter>` mean "spectrum at this driving level"? | **Yes** structurally, and it validates; the spec's only textual acknowledgement is the loosely-worded non-normative Note 1 | xsd:285-311, spec:700, spec:710; validated with lxml |
| Can `ColorTemperature` be a channel attribute? | **No.** Only `CTO`/`CTC`/`CTB`, `PhysicalUnit="Temperature"` | spec:2851-2853, spec-next:4559-4597 |
| Can `ChannelFunction`/`ChannelSet` `PhysicalFrom`/`PhysicalTo` express a value that varies with DMX? | **Yes** — that is exactly what they are, for *one* attribute of *that* channel | spec:1921-1922, spec:1970-1976 |
| Is `DMXProfile`/`Point` the answer to "declare X as a function of level"? | **Yes for one scalar physical value on one channel function; no for a spectrum, and no across channels** | spec:866-868, spec:1933-1935, spec:1998 |
| Can anything other than `ChannelFunction@DMXProfile` reference a `DMXProfile`? | **Yes, exactly one thing: `SubChannelSet@DMXProfile`** | spec:1998, xsd:761 |
| Can a `Dimmer` channel drive an emitter's measurement curve directly? | **No** — `Dimmer` is `UseEmitter="False"`; only the 16 `ColorAdd_*` are `True` | spec-next:2971, spec-next:4388 |

---

## 2. What real profiles actually do

### 2.1 What is and is not reachable from this container

**The 12,623-revision GDTF Share corpus referenced in [#12](https://github.com/jnslmk/beamhouse/issues/12)
is on the user's own machine and is NOT present in this container. Nothing below is a count of it, and the
corpus count is still owed.** GDTF Share requires an authenticated account and was not contacted.

`api.github.com` and `github.com` HTML are blocked (403 from the proxy); `codeload.github.com` is likewise
403. What worked: `raw.githubusercontent.com`, `pypi.org`/`files.pythonhosted.org`, `data.jsdelivr.com`
(directory listings for GitHub repos under 50 MB), and the session's GitHub MCP `search_code` tool (which
searches across all of GitHub even though `get_file_contents` is scoped to `jnslmk/beamhouse`).

**Profile evidence actually obtained and parsed:**

| Source | Count | How |
|---|---|---|
| `heliostate/OpenGDTFLibrary` — community repo of **unpacked** real GDTFs | 5,408 profiles indexed; **122 fetched and parsed** | `search_code` to enumerate paths, `raw.githubusercontent.com` to fetch |
| `Robin MegaPointe.gdtf` — a real Robe profile shipped inside the **spec repo's own** MVR example | 1 | `proposal/mvr-update-for-gdtf12/basic_gdtf.mvr`, unzipped |
| `BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf` — pygdtf's test fixture | 1 | `python-gdtf/tests/` |
| `Generic@RGBW8@test.gdtf` — gdtf-rs's test fixture | 1 | `gdtf-rs` repo root |
| `GLP@impression 90 RGB@v1.gdtf` — this repo's authored profile | 1 | on disk |
| `mvrdevelopment/spec` `examples/physical_descriptions.md` | normative example | raw |

Not obtained: BlenderDMX's `assets/profiles/*.gdtf` (11 files jsDelivr lists but which return a genuine
GitHub 404 at `main` and at tags `2.3.0`/`2.2.2` — they appear to have been moved or removed since jsDelivr's
snapshot).

**Caveat on OGL as a corpus.** `OpenGDTFLibrary` is a community re-packaging ("There doesn't appear to exist
an open library of GDTF fixtures at this time … This repository contains a list of unpacked GDTF files"), not
GDTF Share. Its 5,408 files are real manufacturer profiles (Robe, Martin, Ayrton, ACME, Prolights, SGM, Arri,
DTS, GLP, Cameo, Fiilex, Terbly, …) but the population is not the Share population and the counts below
should not be reported as Share statistics.

### 2.2 The count

Two `search_code` queries over `repo:heliostate/OpenGDTFLibrary` enumerated every file containing a
`<Measurement` element (100 + 22 = **122 distinct paths**; GitHub's `total_count` field reported 116, which is
its usual approximation). All 122 fetched successfully (HTTP 200); 121 are unique by SHA-256 (one
manufacturer-name duplicate). Parsed with `xml.etree`:

```
profiles analysed: 121   (of 5,408 in the repo)
(node, #Measurement) -> count: {('Emitter', 1): 352, ('Filter', 1): 118}
elements with >1 Measurement: 0
Physical values seen: [('100.000000', 469), ('70.000000', 1)]
```

**470 emitter and filter elements. Every one has exactly one `<Measurement>`. 469 of the 470 measurements are
at `Physical="100"`.** The single exception is one filter in `unpackedGDTFs/Cameo/Cameo@F2_FC`:

```xml
<Measurement InterpolationTo="Linear" LuminousIntensity="5793.000000" Physical="70.000000" Transmission="0.000000">
```

— still a single measurement, merely taken at 70 % rather than 100 %.

Supporting counts over the same 5,408 files:

| Query | Matches | Reading |
|---|---|---|
| `DataVersion` (present in every GDTF) | 5,408 | corpus size |
| `<Emitters>` (non-empty collect) | 115 | ~2 % of profiles declare emitters at all |
| `<Measurement` | ~116 (122 enumerated) | the set analysed above |
| `MeasurementPoint` | 60 | half of those carry an actual spectrum |
| `EmitterSpectrum` | **0** | not one profile links a Beam to an emitter spectrum |
| `CFC1` (a `DMXProfile` `Point` coefficient) | **0** | not one profile uses a DMX profile |

### 2.3 The one profile with more than one measurement — and why it does not count

`BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf` (pygdtf's test fixture, authored by the BlenderDMX project, not a
manufacturer) is the only file found anywhere with two measurements per emitter:

```xml
<Emitters>
  <Emitter Color="0.640100,0.330000,21.260000" DiodePart="" DominantWaveLength="0.000000" Name="Red">
    <Measurement InterpolationTo="Linear" LuminousIntensity="0.000000" Physical="0.000000"/>
    <Measurement InterpolationTo="Linear" LuminousIntensity="1.000000" Physical="100.000000"/>
  </Emitter>
  … Green, Blue, White identically …
</Emitters>
```

This is **not** a drift curve. There are no `<MeasurementPoint>` children at all, so no spectrum varies; it
is a two-point *intensity* ramp from 0 to 1, restating the linearity the spec already assumes
("It is assumed that the physical value 0 exists and has zero output", spec:703).

And it is **invalid against the official XSD**, on exactly this construct:

```
../profiles/pygdtf_LED_PAR_64_RGBW.gdtf valid: False
    33 Element 'Measurement', attribute 'Physical': [facet 'minExclusive'] The value '0.000000' must be greater than '0'.
    37 …  41 …  45 …
```

`Physical="0"` violates `physicaltype`'s `minExclusive="0"` (§1.3). So the sole real-world instance of a
multi-measurement emitter is a schema-invalid authoring artefact from a consumer's own test data.

### 2.4 What a manufacturer's spectral data actually looks like

`Robin MegaPointe.gdtf` — extracted from the **spec repository's own** MVR example, so it is as
close to a reference profile as exists. It declares **no emitters** and **17 filters**, each with exactly one
`<Measurement Physical="100">` carrying **421 `<MeasurementPoint>` nodes**:

```
('Filter', 'Cyan Filter', 1, ['100.000000'], [421])
('Filter', 'Magenta Filter', 1, ['100.000000'], [421])
… 'White', 'Dark red', 'Deep blue', 'Yellow', 'Light green', 'Magenta', 'Lavender',
  'Deep Green', 'Convers 2700K', 'Blue', 'Orange', 'Convers 3200K', 'UV' …
```

Note `Convers 2700K` and `Convers 3200K`: even a fixture whose whole job includes *converting to 2700 K*
declares that as a **fixed filter spectrum at full insertion**, not as a curve.

The spec's own worked example does the same (`examples/physical_descriptions.md`) — five emitters, one
`<Measurement … Physical="100">` each:

```xml
<Emitter Color="0.6951,0.3044,100" Name="measured R">
    <Measurement LuminousIntensity="534" Physical="100">
        <MeasurementPoint Energy="0.048200" WaveLength="634"/>
        …
    </Measurement>
</Emitter>
<Emitter Color="0.3002,0.5998,71,55" Name="measured G">
    <Measurement LuminousIntensity="974" Physical="100" />
</Emitter>
```

### 2.5 What real *tungsten* profiles declare — the most on-point datum

49 profiles in OGL carry `LampType="Tungsten"`. Six genuinely-tungsten ones were fetched and parsed:

| Profile | `LampType` | `Beam@ColorTemperature` | `EmitterSpectrum` | `<Emitter>` count |
|---|---|---|---|---|
| `Robe@PATT_2013` | Tungsten | 3050 K | `"None"` | **0** |
| `Terbly@G9B` | Tungsten | 8000 K | `"None"` | 0 |
| `Terbly@G9_Hybrid` | Tungsten | 8000 K | `"None"` | 0 |
| `Terbly@PT189B` | Tungsten | 8000 K | `"None"` | 0 |
| `Terbly@PT230B` | Tungsten | 8000 K | `"None"` | 0 |
| `Terbly@PT330W` | Tungsten | 8000 K | `"None"` | 0 |

`Robe@PATT_2013` is the sharpest case: its DMX modes contain **exactly two channel functions, `Dimmer` and
`Tilt`** — the same shape as ADR-0037's loads — it is a deliberate emulation of a tungsten PATT lamp whose
entire selling point is tungsten-like behaviour, and it declares **a single flat 3050 K and no emitters at
all**. Not one real profile examined declares warm-dim.

### 2.6 Verdict on question 2

**No real profile uses more than one `<Measurement>` per `<Emitter>` for a spectral drift curve. In 121
unique real profiles (470 emitter/filter elements) the count is 1, always. The single multi-measurement file
found anywhere is a consumer's own schema-invalid test fixture, and it carries no spectra.** The Share-corpus
count remains owed.

---

## 3. What the reference readers do with multiple measurements

### 3.1 pygdtf keeps every one, in order, losslessly

`pygdtf/__init__.py:910-918` — `Emitter._read_xml`:

```python
    def _read_xml(self, xml_node: "Element", xml_parent: Optional["Element"] = None):
        self.name = xml_node.attrib.get("Name")
        color_str = xml_node.attrib.get("Color")
        self.color = ColorCIE(str_repr=color_str) if color_str else ColorCIE()
        self.dominant_wave_length = float(xml_node.attrib.get("DominantWaveLength", 0))
        self.diode_part = xml_node.attrib.get("DiodePart")
        self.measurements = [
            Measurement(xml_node=i) for i in xml_node.findall("Measurement")
        ]
```

`findall` + list comprehension: **a list, in document order, nothing dropped and nothing overwritten.**
`Filter._read_xml` is identical (`pygdtf/__init__.py:954-960`), and `Measurement._read_xml`
(`pygdtf/__init__.py:993-1001`) does the same one level down:

```python
    def _read_xml(self, xml_node: "Element", xml_parent: Optional["Element"] = None):
        self.physical = float(xml_node.attrib.get("Physical", 0))
        self.luminous_intensity = float(xml_node.attrib.get("LuminousIntensity", 0))
        self.transmission = float(xml_node.attrib.get("Transmission", 0))
        self.interpolation_to = InterpolationTo(xml_node.attrib.get("InterpolationTo"))
        self.measurement_points = [
            MeasurementPoint(xml_node=i) for i in xml_node.findall("MeasurementPoint")
        ]
        self._attr_keys = set(xml_node.attrib.keys())
```

Serialisation round-trips them all (`pygdtf/__init__.py:932-933`):

```python
        for measurement in getattr(self, "measurements", []):
            element.append(measurement.to_xml())
```

**Verified by execution** (pygdtf 1.4.5 from PyPI, run in this container against the synthetic profile from
§1.3):

```
Tungsten 3
   Physical= 1.0 Lum= 8.0 interp= Linear points= [(450.0, 0.1), (650.0, 0.55)]
   Physical= 10.0 Lum= 100.0 interp= Linear points= [(450.0, 0.2), (650.0, 0.7)]
   Physical= 100.0 Lum= 1000.0 interp= Linear points= [(450.0, 0.5), (650.0, 1.0)]
```

and re-serialising the emitter emits all three measurements with their points intact.

**One authoring trap, verified by execution.** `Filter.__init__` accepts a `measurements=` keyword;
`Emitter.__init__` (`pygdtf/__init__.py:895-908`) does not, and `BaseNode.__init__` accepts only
`xml_node`/`xml_parent`:

```
Emitter(measurements=...) TypeError: BaseNode.__init__() got an unexpected keyword argument 'measurements'
Filter(measurements=...)  OK -> 1
Emitter().to_xml -> <Emitter Name="T" />
```

So pygdtf can **read and round-trip** a multi-measurement emitter perfectly, but **cannot construct one via
its constructor** — the attribute must be assigned after the fact. Relevant only if Beamhouse ever authors
GDTF *with* pygdtf rather than by hand.

pygdtf also parses `Beam@ColorTemperature` and `Beam@EmitterSpectrum` (`pygdtf/geometries.py:553`, `:563-565`,
the latter as a `NodeLink("EmitterCollect", …)`), and `DmxProfile.points` as a list
(`pygdtf/__init__.py:1161-1163`) — so nothing in §1 is lost at the pygdtf layer.

### 3.2 Nothing downstream reads them

**BlenderDMX (`4fb9cb7`) — zero.** Repo-wide GitHub code search:

| Search over `repo:open-stage/blender-dmx` | Matches |
|---|---|
| `Measurement` | **0** |
| `measurement_points` | **0** |
| `dmx_profiles` | **0** |
| `profile.emitters` | **0** |

Its **only** use of the Physical Descriptions is filter colours for wheel slots (`gdtf.py:97-104`):

```python
                slot_filter = next(
                    (
                        w_filter
                        for w_filter in profile.filters
                        if w_filter.name == slot.filter.str_link
                    ),
                    None,
                )
```

— and even there it takes `w_filter.color`, the single CIE point, never a measurement. The word "emitter"
elsewhere in BlenderDMX means a *Blender emissive material*, not a GDTF `<Emitter>`.

Its additive colours are **hardcoded constants**, not read from the file at all
(`color_utils.py:228-258`):

```python
def colors_to_rgb(colors):
    # 0  1  2    3     4   5     6     7     8    9     10      11
    # R, G, B, White, WW, CW, Amber, Lime, UV, Cyan, Magenta, Yellow
    # color definitions below, these have been tuned to look OK in Blender

    white_rgb  = color_to_rgb([128, 128, 128], colors, 3)
    wwhite_rgb = color_to_rgb([253, 244, 220], colors, 4)
    …
```

and its colour temperature comes only from a **CTC channel's physical value**, mapped through a hardcoded
table borrowed from a blog (`fixture.py:2332-2344`):

```python
    def get_color_temperature(self, ctc, dmx_value):
        if dmx_value == 0:
            return None

        if ctc < 101:
            # for fixtures that do not define physical range
            # get ct form dmx range
            if 1 <= dmx_value <= 255:
                ctc = 1000 + (dmx_value - 1) * (20000 - 1000) / (255 - 1)

        ctc = max(1000, min(20000, ctc))
        ctc -= ctc % -100  # round to full 100s
        return kelvin_table[ctc]
```

applied as a **multiplicative RGB filter** on the mixed colour (`fixture.py:2193-2194`). Critically,
`gdtf.py` reads `geometry.beam_type`, `geometry.luminous_flux`, `geometry.beam_angle` and
`geometry.beam_radius` from the Beam geometry, but **never `geometry.color_temperature` and never
`geometry.emitter_spectrum`**. So BlenderDMX ignores not just the curve but the *static* declared CCT too.

**Mizer (`be73963`)** models the whole section as a no-op
(`crates/components/fixtures/gdtf/src/definition.rs`):

```rust
#[derive(Debug, Clone, XmlRead, Serialize)]
#[xml(tag = "PhysicalDescriptions")]
pub struct PhysicalDescriptions {}
```

**gdtf-rs (`410dcae`)** is the one non-Python reader that models it fully, and it also keeps a list
(`src/description/physical_descriptions.rs:302-307, 440-490`):

```rust
    /// Measurements describing the relation between the requested output by a control channel and
    /// the physically achieved intensity.
    ///
    /// Corresponds to the `Measurement` XML attribute.
    #[serde(rename = "Measurement", skip_serializing_if = "Vec::is_empty", default)]
    pub measurements: Vec<Measurement>,
```

```rust
    /// A unique value between 0 and 100.
    ///
    ///  - For additive color mixing: emitter intensity DMX percentage.
    ///  - For subtractive color mixing: flag insertion DMX percentage.
    ///
    /// Corresponds to the `Physical` XML attribute.
    #[serde(rename = "@Physical")]
    pub physical: f64,
```

gdtf-rs is a parsing library with no renderer, so "keeps them" is as far as it goes.

### 3.3 Verdict on question 3

**pygdtf keeps a list — verified by reading the source and by running it. It neither keeps only the last nor
drops any, and it round-trips them to XML losslessly. Nothing downstream reads them: BlenderDMX has zero
references to `Measurement` anywhere in the codebase and does not even consume `Beam@ColorTemperature`;
Mizer parses `PhysicalDescriptions` as an empty struct; gdtf-rs stores them but renders nothing.** No
reachable implementation anywhere interpolates a spectrum against a level.

---

## 4. What could not be established

- **The GDTF Share corpus count.** The 12,623-revision corpus of #12 is not in this container and was not
  contacted. "How many Share profiles use >1 `<Measurement>` per `<Emitter>`" is **still owed**, and the
  121-profile OGL result is a *different population*, not a proxy for it. It is, however, a strong prior:
  0/470 with a sample drawn from ~12 manufacturers.
- **Whether `InterpolationTo` governs the spectrum or only the scalar.** The spec says "Interpolation scheme
  from the previous value" and never mentions `MeasurementPoint` energies. No implementation interpolates
  anything, so there is no behaviour to observe. **Undefined.**
- **What `Emitter@Color` means when a curve is declared.** The spec gives one chromaticity per emitter and
  never says which `Physical` it corresponds to. All 470 real elements make it moot by having exactly one
  measurement.
- **Whether a `ColorAdd_*` channel with `Offset="None"` may legally be a `Relation` follower.** Both clauses
  are quoted normatively (§1.8) and nothing forbids the combination, but the spec shows no such example, the
  XSD does not constrain it either way, and no consumer was found that implements `Relation` at all. This is
  **inference**, and it is the single load-bearing inference in §5.
- **Whether any console or visualiser reads `Beam@EmitterSpectrum`.** Zero of 5,408 real profiles set it, so
  there is nothing to test against and no implementation was found that looks for it.
- **BlenderDMX's `assets/profiles/*.gdtf`** — 11 files jsDelivr lists but which 404 at `main` and at tags.
  Not counted.
- **`Filter@Physical` in a real varying case.** Every real filter measured here is at insertion 100 % (one at
  70 %), so the "spectrum at partial insertion" reading of the subtractive half is equally untested.

---

## 5. What this means for the tungsten curve

ADR-0037 decision 5 ships `T / T0 = (radiance fraction) ^ 0.1235`, taking a 2700 K PAR38 to 2031 K at 10 %
and 1527 K at 1 %, for three definitions (`bhs:generic-par38`, `bhs:generic-e27-practical`,
`bhs:generic-profile`) covering six loads on a one-channel `Dimmer` patch each.

**From the evidence above, and nothing else:**

### The curve *can* be declared in GDTF. Exactly one construct carries it.

`<Emitter>` with several `<Measurement Physical="…">` children, each carrying a full `<MeasurementPoint>`
spectrum. This is verified three ways: `Physical` is normatively "emitter intensity DMX percentage"
(spec:692); the XSD permits `maxOccurs="unbounded"` measurements with wavelength-uniqueness scoped *inside*
each one (xsd:285-311); and a three-measurement emitter built here **validates against the official XSD and
round-trips through pygdtf**. ADR-0037's guess — *"plausibly `<Emitter>` carrying several
`<Measurement Physical=…>` nodes"* — is **correct**.

### But it cannot be hung on the `Dimmer` channel, and closing that gap costs an inference.

`Measurement@Physical` indexes the **emitter's** drive percentage, and `spec-next`'s machine-readable
attribute table permits only the sixteen `ColorAdd_*` attributes to link an emitter — `Dimmer` is
`UseEmitter="False"` (spec-next:2971). ADR-0037 decision 4 already records that these are *"the first
fixtures on the rig with no `ColorAdd_*` channels at all"*. So the file would have to **acquire one**:

1. an `<Emitter Name="Tungsten2700">` with N `<Measurement Physical="…">` nodes at the ADR's levels
   (1, 5, 10, 25, 50, 100), each carrying a black-body spectrum at the corresponding T;
2. a `<DMXChannel Offset="None">` (spec:1857, "does not have any addresses") whose `ChannelFunction` has
   `Attribute="ColorAdd_WW"` and `Emitter="Tungsten2700"`, defaulted to full;
3. a `<Relation Type="Multiply" Master="…Dimmer" Follower="…ColorAdd_WW…"/>`, the spec's own `"VirtualDimmer"`
   idiom (spec:2072).

Each clause is separately normative and quoted above; **the combination — a virtual, unaddressed channel as
a `Relation` follower — has no example in the spec and no implementation anywhere.** It is legal by
construction and untested in practice.

The alternatives are worse, and each is ruled out by a quoted clause rather than by taste:

- **`Beam@ColorTemperature`** is a single float (spec:1374). `Beam@EmitterSpectrum`'s default is *"a
  Black-Body with the defined ColorTemperature"* (spec:1382) — **one** spectrum. This is the construct
  ADR-0037 decision 4 already uses, and it is a fixed point, not a curve. Correct for the static 2700 K /
  3200 K; structurally incapable of the drift.
- **`CTO`/`CTC`/`CTB` with `PhysicalFrom`/`PhysicalTo` in kelvin, optionally shaped by a `DMXProfile`** is a
  real GDTF way to make colour temperature vary with DMX (spec-next:4580, *"Physical values describe the
  resulting Color Temperature"*) — but it needs its **own** channel. A `DMXProfile` is bounded by *that
  channel function's* `Min`/`Max` (spec:1934-1935) and reads *that channel's* DMX percentage
  (spec:866-868); it cannot read the dimmer. Reaching the dimmer requires the same `Relation Multiply`
  inference as above, and multiplying a *kelvin* channel by a dimmer level is not the ADR's radiance-keyed
  curve anyway.
- **`DMXProfile` on the `Dimmer` function itself** shapes the dimmer's own physical value — a dimmer curve.
  It has no access to colour. Zero of 5,408 real profiles use `DMXProfile` at all.

### What a consumer that ignores the construct would render

**A flat colour that never drifts** — and "ignores it" is the overwhelmingly likely case:

- **BlenderDMX** would render the fixture at its hardcoded warm-white constant `[253, 244, 220]` scaled by
  intensity (`color_utils.py:234`), because it contains **zero** references to `Measurement` or
  `profile.emitters`, and it does not read `Beam@ColorTemperature` either. Exactly the failure mode ADR-0037
  decision 5 argues against: *"a PAR at 10% would read as bright white next to six LED movers that genuinely
  do not shift."*
- **Mizer** would render nothing from it — `PhysicalDescriptions {}`.
- **A consumer that reads the emitter but ignores the *multiplicity*** — taking `Emitter@Color` alone, or the
  last/first `<Measurement>` — gets the fixture's chromaticity at whichever level that measurement sits, held
  constant. With the measurements ordered ascending (spec:700), "first" gives the dimmest colour at all
  levels and "last" gives the full-output colour at all levels. **Neither is catastrophic; both are simply
  flat.**
- **A consumer that ignores the `Relation`** (and so leaves the virtual `ColorAdd_WW` at its default of full)
  reads the emitter at `Physical=100`, i.e. **the correct full-output colour, never drifting** — the same
  outcome as declaring a static 2700 K. The degradation is graceful.

### The consequence for the format decision

The curve is **declarable in a `gdtf:` file** — that half of ADR-0037's open question resolves in GDTF's
favour, and decision 5 does not force a `bhs:` definition on formal grounds. But the declaration is
**unprecedented in 5,408 real profiles (0 use `EmitterSpectrum`, 0 use `DMXProfile`, 0 have >1 measurement per
emitter), unread by every reachable consumer, and reaches the dimmer only through one undocumented
combination of two normative clauses.** Beamhouse would be simultaneously the author and the only reader of
the construct, and the file it authored would carry an emitter, a virtual channel and a relation that exist
solely to encode six numbers that a `bhs:` definition could state directly.

**That is the trade the ADR now has evidence for, stated in the terms it asked for: not "can it" — it can —
but "does declaring it in GDTF buy anything over `bhs:`", and on this evidence it buys interoperability with
no one.**
