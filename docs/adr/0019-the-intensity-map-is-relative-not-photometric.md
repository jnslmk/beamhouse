# ADR-0019: The intensity map is relative, per-emitter, and not photometric

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#31](https://github.com/jnslmk/beamhouse/issues/31)

## Context

The competitive review (2026-09-02) found that **Vectorworks Showcase 2026** had added false-colour
modes specifically to spot lighting problems, and #31 proposed one for Beamhouse: a render mode
driven by resolved `Dimmer` "and, where present, the `LuminousIntensity` the definition declares",
for spotting a fixture at 3% that should be at 30%. ADR-0010 was cited as making it nearly free.

The mode is worth having. The *name* and the second half of that sentence are the problem, and
measurement decided both.

**Measured across all six profiles on disk** (`definitions/gdtf/` plus the authored impression 90):

| Profile | `Dimmer` ChannelFunction `PhysicalUnit` | `Attribute` `PhysicalUnit` | `Beam@LuminousFlux` |
|---|---|---|---|
| ADJ Fog Fury Jett | `None`, 0 → 1 | `None` | 10000 |
| GLP impression 90 (authored) | `None`, 0 → 1 | `LuminousIntensity` | 3000 |
| GLP impression X4 | `None`, 0 → 1 | `None` | 1000 |
| MarkeEigenbau 30px strip | `None`, 0 → 1 | `None` | 1000 |
| Purelight FX Mini Derby 2 | `None`, 0 → 1 | `None` | 1000 |
| WLED RGB Effect Mode | `None`, 0 → 1 | `None` | 2000 |

Three facts fall out of it.

1. **No profile resolves `Dimmer` to a photometric quantity.** Every `ChannelFunction` is
   `PhysicalUnit="None"` over 0 → 1. The single `LuminousIntensity` declaration is on the
   `AttributeDefinitions` entry of the profile **we authored ourselves**, and ADR-0010 already
   ruled that the renderer selects by attribute *name* and never branches on the declared unit.
   So resolved `Dimmer` is a dimensionless 0..1 everywhere — which is exactly what makes the mode
   cheap, and exactly what stops it being photometric.

2. **`LuminousFlux` is untrustworthy and, by decision, unconsumed.** The Fog Fury declares the
   GDTF default `10000`, three others a round `1000`, and our own `3000` is absent from the values
   `impression-90-pivots.md` records as coming from the `.qxf`. §8.2 already decided the beam term
   **does not scale by declared `LuminousFlux`**, carrying it unconsumed, precisely because it
   would render the fog machine as the rig's brightest source. A mode that read it would be
   contradicting the renderer beside it.

3. **What the field calls false colour is not reachable in v1 at all.** Showcase and Capture
   false-colour **illuminance at a surface, in lux**. That needs venue geometry, throw distance,
   an inverse-square falloff and a credible flux. `DESIGN.md` contains no venue geometry and zero
   occurrences of `throw|beam length|distance|inverse-square|attenuat` (#28), and ADR-0013 ends
   beams at "a soft shader falloff at one scene-wide length, with no geometric terminus — v1
   renders no venue geometry, so nothing catches a beam." There is no surface for lux to land on.

A fourth fact came from the rig rather than the profiles. `MarkeEigenbau` declares **one** `Dimmer`
for all 30 pixels, so a per-fixture reading cannot show a half-dead strip — and #23 has just cut
the STAR-TENT over to per-pixel, which is where a dead pixel run becomes possible for the first
time.

## Decision

**The mode ships in v1 and is called the intensity map.** Not false colour. Borrowing the field's
term invites the comparison against a lux reading, which is a feature Beamhouse never claimed and
cannot compute — and the name would have to be retracted rather than merely qualified if venue
geometry ever arrives.

**It reads resolved per-emitter intensity**, taken off the resolved `LinearRGB` after `Dimmer`,
not per-fixture `Dimmer`. For a single-emitter fixture the two are identical, so nothing is lost;
for a strip, §8.1 already carries an N-texel `DataTexture`, so the per-emitter values exist and
the mode is a shading swap on data the renderer holds. It is what actually reaches the screen,
which is what a diagnostic should show.

**It is explicitly relative, and `DESIGN.md` says so.** It compares emitters within one rendered
frame. It carries no unit, no absolute reference and no claim about what a surface would measure.

**`LuminousFlux` stays unconsumed**, as §8.2 has it. This ADR does not give it a second reader.

**It is not in ADR-0013's deferred tier.** That tier is fenced at the second sample of
`density(p)`; a shading swap samples no density at all.

This **applies** ADR-0010 rather than amending it. ADR-0010's rule — select by attribute name,
never by declared unit — is unchanged; this is simply its first *diagnostic* consumer rather than a
render path, and the measurement above is the same measurement ADR-0010 made, arriving at a claim
`DESIGN.md` had not yet retracted.

## Considered options

- **Keep the name "false colour".** Rejected. It is the field's name for a photometric instrument,
  and everything that makes it photometric is absent here.
- **Read per-fixture `Dimmer`, as the ticket framed it.** Rejected. It cannot show the failure
  #23's per-pixel cutover just made reachable, and it costs nothing to read the per-emitter values
  already in the texture.
- **Scale by declared `LuminousFlux` where it looks plausible.** Rejected. "Looks plausible" is a
  judgement about third-party data with no way to check it, and §8.2 already declined it for the
  beam on measured grounds.
- **Defer the whole mode with the ADR-0013 tier.** Rejected. It does not belong to that tier by
  the tier's own test, and it is close to free.

## Consequences

- **`DESIGN.md` §8.3 and §11.2 carried a falsified claim** — "`Dimmer` declares
  `LuminousIntensity`, so its linearity is a stated fact, not an assumption" — which ADR-0010 had
  already measured false in every third-party profile. Corrected in the same commit.
- **Beamhouse has a stated non-claim.** "No photometric prediction in v1" is now written down
  rather than merely absent, so a future illuminance feature is a decision to add one, not the
  filling of a gap someone assumed was an oversight.
- **The mode is a diagnostic, not a look.** It sits with signal health
  ([ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md)) in §13, not with §08's
  rendering, even though it is implemented there.
- **#35 gets a named mode with settled semantics** and owns only how it is entered and what ramp
  it draws.
