# ADR-0013: Atmosphere is one closed-form scattering term, and the deferred tier begins at the second sample of `density(p)`

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#28](https://github.com/jnslmk/beamhouse/issues/28)
- **Amends:** [ADR-0010](0010-resolution-is-total-the-renderer-selects-by-attribute.md)

## Context

`DESIGN.md` §01 deferred haze to a later high-fidelity tier and §8.2 bought the option back by
writing the fragment shader as `density(p) → float`, so haze could become a raymarch through the
same function later. The competitive review (2026-09-02) made that deferral the single most
visible difference between a Beamhouse screenshot and every other product in the field: Capture
2026's headline is that smoke now *absorbs* all light, DMXpressions leads with a physics-simulated
atmosphere, Showcase 2026 added animated fog. The observation underneath all three is that **a
beam in clean air is invisible** — what you see in a room is scattering off particulate, so a cone
with no atmosphere term is a translucent solid that reads as a diagram of a beam.

Measuring the ticket's premises against the six `.gdtf` profiles on disk moved four of them, and
turned up a defect.

1. **`BeamAngle` is a full angle, and six sites in this repo called it a half-angle.**
   `CONTEXT.md`'s **Cone angle** entry, `DESIGN.md` §8.2, [ADR-0010](0010-resolution-is-total-the-renderer-selects-by-attribute.md),
   and three research docs — `gdtf-spatial-resolution.md`, `gdtf-resolution-reference.md` and
   `definition-format-comparison.md` — all said half. Three independent readings say otherwise: BlenderDMX assigns
   `spot_size = radians(beam_angle)` and Blender's `spot_size` is the total cone angle; the same
   research doc records the rule "`BeamAngle > 180` on a fixture with no Zoom renders as a point
   light", which only parses if the value is a full angle; and the WLED profile declares
   `BeamAngle="120"`, which as a half-angle would be a nonsensical 240° cone. It is not a
   GDTF-only fact: QLC+'s `<Lens DegreesMin="10" DegreesMax="10"/>` for the impression 90 is GLP's
   published **10° beam**, and OFL's `lens.degreesMinMax` is the same quantity — so the converged
   fixture model ([ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md)) carries a full angle
   whichever reader produced it, and the correction is one, not one per format. Left alone this
   renders **every cone in the rig at twice its true width**, silently — the
   [ADR-0011](0011-a-fixture-is-addressed-per-break.md) failure shape exactly, an error with
   nothing to compare it against. It belongs here because the atmosphere term is precisely what
   makes cone width perceptually obvious: shipping (2) would have shipped the bug into the feature
   that displays it.

2. **The falloff question has one witness in the rig, and it is the fog machine.** Across all six
   profiles, `BeamAngle ≠ FieldAngle` in exactly one: `ADJ_Fog_Fury_Jett` (15° / 25°). The X4, the
   `MarkeEigenbau` strip, the Purelight derby, the WLED profile and our own authored impression 90
   all declare them equal. So for five of six there is no two-angle falloff to design at all.

3. **The rig's hazer cannot drive a density uniform.** The Fog Fury declares `Fog1` with
   `PhysicalUnit="None"`, one `ChannelFunction` at `PhysicalFrom 1.0 → PhysicalTo 1.0`, and one
   `ChannelSet` — `Fog+LED`, `DMXFrom 32`. Under ADR-0010's total resolution that is a **constant**.
   There is no proportional fog level anywhere on the wire.

4. **No fixture in the reference rig has a `Zoom` channel.** The show is 6 × impression 90
   (authored, fixed 10° lens), 4 × WLED, 2 × Generic Dimmer, 1 × Fog Fury. The X4 is the only
   profile on disk carrying `Zoom`, and it is not in the show. M6's own done-when clause — "six
   movers, volumetric cones, **zoom** and strobe correct" — was therefore unsatisfiable as written.

5. **Not one of the six profiles carries a `LuminousFlux` worth trusting.** The Fog Fury declares
   exactly `10000`, which is the GDTF **default** — unfilled. The X4, the strip and the derby each
   declare a round `1000`. Our own impression 90 declares `3000`, and `impression-90-pivots.md`
   enumerates what came from the `.qxf` — `BeamAngle`, `ColorTemperature`, `PowerConsumption`,
   `BeamRadius` — with `LuminousFlux` absent from that list.

6. **There is no venue geometry in v1.** `DESIGN.md` has zero occurrences of
   `throw|beam length|distance|inverse-square|attenuat`, and no floor, truss or room anywhere.
   The beams render into empty space, so nothing catches a beam and nothing terminates it. This
   cuts both ways: it removes occlusion as a v1 question, and it means the atmosphere term is
   doing **all** of the work of making a beam legible, since there is no lit surface to infer one
   from.

## Decision

**A constant-density single-scattering term ships in v1**, and the deferred tier's boundary is a
single mechanical test.

1. **One scattering term, closed-form.** Single scattering off a point source in a homogeneous
   medium, integrated analytically along the view ray. No raymarch, no volume texture, no second
   pass.

2. **No extinction, isotropic phase — and this is what buys the closed form.** Without
   Beer–Lambert attenuation the integral is an elementary `atan`; *with* it, it is Sun et al.
   (2005), a special function precomputed into a 2D lookup table, which is not "one integral in
   the same fragment shader". Likewise an isotropic phase function is a constant, while
   Henyey–Greenstein depends on an angle that varies along the ray. The consequence is stated
   plainly rather than discovered: **v1's beam does not glare when aimed at the camera.** Forward
   scattering is the term that produces that, and it is deliberately absent.

3. **Density is one scene-wide uniform, and the hazer never touches it.** A participating medium
   is a property of the room, not of a lamp, so per-fixture density is incoherent. Gating on the
   Fog Fury's `Fog1` was considered and rejected: it would make every beam in the rig invisible
   until one specific fixture crosses DMX 32 — a spectacular way for a preparation visualiser to
   look broken — for a boolean that would also add a ninth consumed attribute to ADR-0010.
   **The consumed-attribute set is unchanged at eight.**

4. **Haze is on by default, at a low fixed value, written into the `.bhs`** rather than defaulted
   at read time. A zero default means the first thing anyone sees is the diagram-not-a-beam case
   this decision exists to fix, and they will not know a slider exists. Storing it in the scene
   means a shared link carries what the sender saw, and keeps the value out of the
   "defaulted somewhere, overridden elsewhere" class §9.2 was just corrected for.

5. **No scaling by declared `LuminousFlux`.** Scattering scales by resolved `Dimmer` × `LinearRGB`
   alone. `gdtf-ts` still parses and exposes the field per ADR-0004, and the fixture model carries
   it **unconsumed** — the shape ADR-0008 used for `ColorSpace`, so nothing can half-consult it.
   Relative photometric intensity is a real feature; it needs profiles that declare real flux, and
   we have none.

6. **One scene-wide beam length, as a soft shader falloff with no geometric terminus.** Inverse
   square is already implicit in the `atan` integral and does most of this; a scene-scale cutoff
   stops a 10° beam striping the horizon. Not per-fixture — GDTF supplies no such value and every
   user would have to invent one.

7. **One bloom pass, unchanged, and the threshold is now tuned rather than free.** Scattering
   renders into the same HDR target as everything else and is `LinearRGB`, so ADR-0008's ordering
   already covers it. Bloom must be re-tuned **after** the density default is set, not before —
   otherwise the first haze added re-tunes every colour already tuned, which is the failure §8.2
   invokes early tone mapping to avoid.

8. **`BeamAngle` is the full cone angle.** Corrected at all six sites. **Cone angle** in
   `CONTEXT.md` is redefined as the full angle, which amends ADR-0010's statement of it.

9. **The falloff graduates out of the map's fog and is answered small.** `BeamAngle` is the cone;
   `FieldAngle` shapes the edge falloff **only where the two differ**, degenerating to the
   `BeamType` soft/hard edge (`Wash`/`Fresnel`/`PC` soft, `Spot`/`Rectangle` hard) when they are
   equal — which is five of the six profiles. This needed no beam on screen after all.

10. **The tier's boundary is one criterion: does it need more than one sample of `density(p)`?**
    Volumetric (beam-on-beam) shadows, soft shadows onto geometry, gobo projection *through* the
    medium, heterogeneous or animated density, and absorption of one beam by another's haze all
    fail that test and all stay out, as one unit for one reason. The boundary of the tier is
    therefore the same line as the `density(p)` seam itself, rather than a list an argument can
    move an item off.

11. **M6 is where this is *shown*, not validated, and the X4 is its instrument.** There is no
    ground truth for "looks like a beam" and no oracle can be built for one; this is a judgment
    call and the ADR says so rather than borrowing credibility from a measurement. GLP's published
    10° photometric PDF was considered as a check and rejected: it validates illuminance on a
    surface, which is the *lit* half, and says nothing about the scattering term — claiming it
    would be the overreach #18's language was corrected for. M6's clause is rewritten, and the
    **impression X4** becomes the test instrument in place of a standalone impression 90: it is a
    genuine third-party profile with a real `Zoom`, whereas testing "an arbitrary GDTF" against a
    profile we authored ourselves is circular.

## Considered options

- **Hold the deferral** (analytic cone only; atmosphere arrives with the tier). Rejected. The seam
  is only insurance if it is claimed once, and a `density(p)` integrated by nothing but the
  analytic path is an untested assumption. Finding 6 sharpens this: with no venue geometry there
  is not even a lit surface to infer a beam from, so "cone only" is the weakest possible reading
  of a rig.
- **Full raymarch** (what Capture and DMXpressions ship). Rejected on budget, and now also on
  coherence — it is the far side of the criterion in decision 10, together with everything else
  that needs a second sample.
- **Density gated by the hazer's `Fog1`.** Rejected — see decision 3.
- **Photometric validation against GLP's published PDF.** Rejected — see decision 11.

## Consequences

- **`gdtf-ts` gains an assertion-shaped obligation and Beamhouse a correction.** Nothing in the
  package changes for the angle fix — it emits what the file declares — but every consumer that
  halved or doubled the value must be found. Today that is documentation only; after M6 it would
  have been tuned artwork.
- **The `.bhs` schema gains two fixed points**, the way [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)
  gave it three: a scene **density** and a scene **beam length**, both written explicitly, neither
  defaulted at read time.
- **The deferred tier is now testable as a rule rather than remembered as a list.** A future
  session proposing an atmosphere feature answers one question about `density(p)` sampling.
- **A known cosmetic gap is on the record.** Beams will not glare into the camera and haze will not
  be shadowed by the beams crossing it. Both are the tier, both are visible in competitors'
  screenshots, and neither is a defect.
- **M6 changes shape.** It patches a fixture the show does not own, which makes it the first
  milestone to consume M4's "arbitrary GDTF" capability as an instrument rather than as a feature.
- **Six documentation sites were carrying a 2× error into a renderer that does not exist yet.**
  That it was caught by a grilling about atmosphere, not by anyone reading the beam code, is the
  argument for measuring a ticket's premises before answering it.
