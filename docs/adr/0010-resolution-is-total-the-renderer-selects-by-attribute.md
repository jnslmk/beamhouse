# ADR-0010: Resolution is total, and the renderer selects by attribute

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#25](https://github.com/jnslmk/beamhouse/issues/25)
- **Amends:** [ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md)
- **Amended by:** [ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md)

## Context

[ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md) decided that Beamhouse
**reads** the declared `PhysicalFrom`/`PhysicalTo` mapping rather than assuming identity, and
deferred the general form — how far that reading goes — to #25.

#25 was posed against a single profile, the one we authored ourselves. Measured across all six
profiles on the rig, **four of its six premises do not survive**.

### What the profiles actually contain

Six profiles: `definitions/authored/GLP@impression 90 RGB/` plus the five under
`definitions/gdtf/`. 103 `ChannelFunction`s, 756 `ChannelSet`s.

| #25 premise | Measurement |
| --- | --- |
| The unit is `AngleDeg` | **No such unit.** It is `Angle`, one of GDTF's 22. Both #25's table and ADR-0008's named a value absent from the enum. |
| `ColorSub_C` (CTC) and shutter carry no unit | **Both declare one.** The attribute is `CTC` (`Temperature`), and strobe is `Shutter1Strobe` (`Frequency`). Nothing on the rig is unit-less: four attributes declare `None`, a *declared* value meaning dimensionless. |
| `ChannelSet`s carry sub-range fidelity | **0 of 756 carry `PhysicalFrom`/`PhysicalTo`.** They are pure labels — named DMX landmarks for a console encoder wheel — and never refine the mapping. |
| `ModeMaster` needs a v1 answer | **0 of 103 `ChannelFunction`s use it**, in any profile. |

Two facts #25 did not raise, both load-bearing:

- **12 of 103 `ChannelFunction`s run backwards** (`PhysicalFrom > PhysicalTo`). The X4's `Pan` is
  `311 → -311`, `Tilt` `121 → -121`, `Zoom` `50 → 7`. A lerp handles this; a `clamp(min, max)` or
  any `from < to` assumption silently mirrors the fixture.
- **`Zoom` is an `Angle`** and feeds the beam cone directly. #25 lists `Pan` and `Tilt` and stops.

The unit is a property of the **`ChannelFunction`'s attribute, not the channel**: the impression
90's shutter is one channel whose three functions carry two attributes and two units
(`Shutter1`/`None`, `Shutter1Strobe`/`Frequency`).

### The `Dimmer` finding, which amends ADR-0008

ADR-0008 decision 2 reads: *"`Dimmer` in `LuminousIntensity` is linear in radiance because the
file says so."*

```
ADJ Fog Fury Jett    <Attribute ... Name="Dimmer" PhysicalUnit="None"/>
GLP impression X4    <Attribute ... Name="Dimmer" PhysicalUnit="None"/>
MarkeEigenbau strip  <Attribute ... Name="Dimmer" PhysicalUnit="None"/>
Purelight Derby      <Attribute ... Name="Dimmer" PhysicalUnit="None"/>
WLED Effect Mode     <Attribute ... Name="Dimmer" PhysicalUnit="None"/>
AUTHORED imp. 90     <Attribute ... Name="Dimmer" PhysicalUnit="LuminousIntensity"/>
```

**Every third-party profile declares `None`.** The `LuminousIntensity` declaration ADR-0008 rested
on exists in exactly one file, and we wrote it. `PositionMSpeed` splits the same way (`Speed` in
ours, `None` in the X4), so the unit is not even stable per attribute name across files.

### No reference implementation

Mizer parses `PhysicalUnit` into `Attribute.physical_unit` — an enum with all 22 units — and
nothing in `conversion.rs` ever reads it. `<DMXChannel>` declares no `ChannelFunction` child, so
every `ChannelFunction` and `ChannelSet` is invisible to that crate
([#3](https://github.com/jnslmk/beamhouse/issues/3),
`docs/research/gdtf-resolution-reference.md`). This is a from-spec build.

## Decision

1. **Resolution is total and mechanical.** `gdtf-ts` resolves *every* `ChannelFunction`: select the
   active one by `DMXFrom`, lerp, and emit `{ attribute, value, unit }`. No function is ever left
   unresolved, so there is no unresolved case to design against. #25 asked whether an unmodelled
   unit should pass through normalised, clamp, or refuse — the question dissolves, because the
   failure mode it guards against ("a silent passthrough of a value the renderer then treats as
   physical") is a **bare number** problem. A `{value, unit}` pair cannot be mistaken for the wrong
   quantity; a normalised `0.5` can.

2. **The renderer selects by attribute name; the unit only interprets the number.** `Shutter1`
   proves unit alone is the wrong selector — it carries `None`, no physical quantity at all, and
   must still gate the render or a closed fixture draws lit. v1 consumes **eight** attributes:

   | attribute | unit | drives |
   | --- | --- | --- |
   | `Pan`, `Tilt` | `Angle` | pointing |
   | `Zoom` | `Angle` | cone angle |
   | `ColorAdd_R/G/B` | `ColorComponent` | colour |
   | `Dimmer` | `None` or `LuminousIntensity` | intensity |
   | `Shutter1` | `None` | open/closed gate |

   Everything else on the rig — `CTC`/`CTO`, `ColorMacro1`, `Color1`, `Control1/2`, `Movement`,
   `Pattern*`, `PositionMSpeed`, `Effects1*`, `Fog1`, `Soundcontrol`, `ColorAdd_W`, `ColorAdd_RY` —
   resolves normally and no consumer reads it. `ColorAdd_W`/`ColorAdd_RY` land in the unconsumed
   pile *by construction*, which is how the map's white-channel exclusion is enforced: no special
   case in the resolver.

3. **The lerp never sorts its endpoints.** `physical = from + t·(to − from)`, with `t` clamped to
   `[0,1]` in **DMX** space only — never clamping the physical result to `[min, max]` of the pair.
   A conformance test is pinned on the X4's `Pan`: DMX `0` must resolve to **+311°**, not −311°.

4. **`ChannelSet`s: parsed by `gdtf-ts`, dropped from the fixture model.** They are the fixture's
   own UI labels and ADR-0004 makes the package GDTF-complete, but 0 of 756 carry physical data, so
   resolving them buys no fidelity. Same seam as `ColorSpace` in ADR-0008.

5. **`ModeMaster`: parsed and exposed, ignored by the resolver, detected.** The active function is
   picked by `DMXFrom` alone — correct for every profile we have. Where a profile does carry a
   `ModeMaster`, Beamhouse emits one diagnostic per fixture type. Free today, and it converts a
   future silent mis-pick into a message.

6. **Beam cone angle has two sources.** The `Beam` geometry's static `BeamAngle` is the cone
   angle, **overridden per-tick by a resolved `Zoom`** where the DMX mode has one. Only the X4
   does; the impression 90 is a static 10°.

   **[amended 2026-09-02 — [ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md)]**
   This clause originally read "the cone **half**-angle", as did five other sites in the repo.
   `BeamAngle` is the **full** cone angle; treating it as a half-angle renders every cone at twice
   its true width. It also said `FieldAngle`'s role "would be guessing" without a beam on screen —
   ADR-0013 settled it without one, by measuring that `BeamAngle ≠ FieldAngle` in exactly **one**
   of the six profiles on disk (the Fog Fury, 15°/25°). `FieldAngle` shapes the edge falloff only
   where the two differ, degenerating to the `BeamType` soft/hard edge otherwise.

7. **OFL converges onto the same shape.** The OFL reader parses capability entity strings into the
   same `{value, unit}` — `"off" → 0`, `"bright" → 1`, unit `ColorComponent`. #25 supposed OFL
   states ranges as `angleStart`/`angleEnd` float pairs; it states them as **unit-suffixed entity
   strings** (`"45deg"`, `"500lm"`), and the rig's entire OFL surface is 69 capabilities of one
   type, `ColorIntensity`, all `"off"`→`"bright"`. A general entity parser is needed only once a
   fixture uses angle or speed capabilities. None does; that is the trigger to build it.

8. **ADR-0008's decision 2 is amended.** Its rationale — "linear in radiance *because the file says
   so*" — held for one file, ours. v1 assumes **intensity-like quantities are linear in radiance**,
   full stop; a `LuminousIntensity` declaration merely agrees. Branching on the declared unit was
   rejected as a distinction with no observable difference: both paths produce the same 0..1 linear
   number, so it is a code path that can never be caught differing.

## Consequences

- ADR-0008's structure survives intact — still one assumption, still minted at one site behind the
  branded `LinearRGB`. Only its **scope sentence** widens, from "`ColorComponent` 0..1 is
  proportional to radiance" to "intensity-like quantities are". What has to go is the
  "declared, not assumed" framing for `Dimmer`.
- The `gdtf-ts`/Beamhouse seam is now stated in general: the package owns the **mechanical** half
  (parse, select, lerp) because it has one correct answer; Beamhouse owns the **policy** half (the
  eight-attribute set). Putting the set in `gdtf-ts` would make it renderer-aware, which ADR-0004
  forbids.
- `Zoom` enters v1 scope, which #25 did not anticipate. It is cheap — it rides the same `Angle`
  path as `Pan`/`Tilt` — but it makes the cone angle the first renderer input fed by both a static
  physical description and a resolved channel.
- **#6's three "sub-range fidelity gaps" are not resolver gaps** and are ruled out of this ticket.
  They are divergences between the authored impression 90 profile and the real fixture's behaviour
  (16–31 resolving Closed while the fixture pulses; 224–239 resolving Open while it strobes; the
  CTC dead zone). No resolver fidelity closes them — only re-authoring the profile does. Two of the
  three concern `Shutter1Strobe` and `CTC`, which v1 does not consume at all.
- The GDTF unit enum has 22 members; v1 consumes three of them (`Angle`, `ColorComponent`,
  `None`) and resolves the rest. `Temperature`, `Frequency`, `Speed` and `LuminousIntensity` appear
  on the rig and are carried unconsumed.
