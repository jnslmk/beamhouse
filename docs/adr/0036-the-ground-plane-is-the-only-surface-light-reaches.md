# ADR-0036: The ground plane is the only surface light reaches, and the pool is an additive term

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#43](https://github.com/jnslmk/beamhouse/issues/43)
- **Amends:** [ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md)
- **Confirms:** [ADR-0019](0019-the-intensity-map-is-relative-not-photometric.md)

## Context

[ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md) finding 6 banked an absence:

> **There is no venue geometry in v1.** `DESIGN.md` has zero occurrences of
> `throw|beam length|distance|inverse-square|attenuat`, and no floor, truss or room anywhere. The
> beams render into empty space, so nothing catches a beam and nothing terminates it. This cuts
> both ways: it removes occlusion as a v1 question, and it means the atmosphere term is doing
> **all** of the work of making a beam legible.

[#35](https://github.com/jnslmk/beamhouse/issues/35) then settled two things that spend it: an
**implicit ground plane at `y = 0`, always**, and an **analytic floor pool** — the cone projected
onto that plane, no raymarch and no shadows, which is grandMA3's *spot reflection*, one of that
product's five rendering faders. [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md)
then made the scene able to contain a stage, a truss and a musician.

So finding 6 cannot stand as written, and two things it left implicit now collide.

1. **The pool is a geometric intersection; the beam has no geometric terminus.** ADR-0013 item 6
   ships *"one scene-wide beam length, as a soft shader falloff with **no** geometric terminus"*.
   A pool is the cone ∩ the plane `y = 0` — a hard geometric fact. Left unstated, a downward beam
   gets a crisp ellipse on the floor and a cone above it that fades out in mid-air at the scene beam
   length, computed by two rules that will not agree.
2. **The scene now has objects in it, so "there is no geometry" stops being the reason occlusion is
   absent.** With a musician standing in a beam, the absence needs a decision behind it rather than
   an accident of the scene being empty.

## Decision

**1 · The ground plane at `y = 0` is the only surface light reaches, and it is not an object.** It
exists whether or not anything is placed, which is what keeps the pool a **render** decision
independent of scene content. Nothing else in the scene interacts with light.

**2 · An object never emits, never occludes and never receives.** This is the scope guard #43 asked
for, and it is written about *light* rather than about content — so it does not have to be
re-litigated each time the kit grows. A truss, a stage, a video screen and a musician are **scale
reference**, and the beams pass straight through them.

**3 · Occlusion is out of scope, by decision rather than by absence.** ADR-0013 finding 6's *"it
removes occlusion as a v1 question"* is amended: it is removed because shadows need a second sample
along the ray, which is exactly the fence ADR-0013 item 1 set, and because the analytic pool is a
closed form that has no place to put an occluder. This is the same shape as
[ADR-0017](0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md)'s WebGPU ruling — not a
*not yet* that graduates, but a boundary that only moves if the destination is redrawn.

**4 · The stated non-claim: a beam passes through a musician and lands on the floor unbroken.** It
goes in the design beside §13.5's photometric non-claim, not into a bug tracker in six months. It is
*more* visible now that the human proxy is a box (ADR-0035 rule 4), and that is the honest reading
of what v1 computes.

**5 · The pool is an additive ground term, not the cone's end.** The cone keeps ADR-0013's soft
falloff and gains no geometric terminus. The pool is drawn separately on the ground plane, shaded
by resolved **`Dimmer × LinearRGB`** and sized by **`BeamAngle`** (the full angle,
[ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md) item 8) against the throw distance
to `y = 0`, with **`FieldAngle`** softening its edge only where the two differ — the degeneracy rule
ADR-0013 item 9 already established for the cone, reused rather than reinvented. Where pool and cone
meet, neither is authoritative over the other: they are two additive contributions into the same HDR
target, which is what makes the disagreement invisible instead of a seam.

**6 · The pool samples no `density(p)`, so ADR-0013's fence is untouched.** It is a closed-form
ellipse shaded by resolved colour. The deferred tier still begins at the second sample.

**7 · The pool does not participate in §13.5's intensity map.** ADR-0019 shades **emitters** by
resolved per-emitter intensity; a floor pool is not an emitter. Shading a reflection by relative
emitter intensity would read as illuminance at a surface — which is the field's *false colour*, in
lux, and precisely the photometric claim ADR-0019 refuses. In intensity-map mode the pool renders
unchanged.

**8 · Legibility is no longer carried by the atmosphere term alone, and ADR-0013 survives it.**
Finding 6's *"the atmosphere term is doing **all** of the work"* becomes *most* of it. That weakens
the argument for shipping haze in v1 without breaking it: a pool only appears where a beam happens
to meet the floor, so an up-lit or side-lit rig still has nothing but scattering to make its beams
visible. Haze stays on by default at ADR-0013's low fixed value.

**9 · Bloom is tuned after both.** ADR-0013 item 7 requires the bloom threshold be tuned after the
density default is set; the pool renders into the same HDR target in `LinearRGB`, so it is part of
that same one-time tuning rather than a second pass at it.

## Considered options

- **Terminate the cone geometrically at the floor.** Rejected. It makes the beam's length depend on
  the scene rather than on ADR-0013's scene-wide value, reintroduces the geometric terminus that ADR
  deliberately refused, and buys a hard edge where the honest rendering is a soft one — a beam does
  not stop at the floor, it scatters off it.
- **Let objects receive light — a pool on the stage deck as well as the floor.** Rejected for v1.
  A stage deck is a `Cube` and projecting onto an arbitrary primitive is no longer closed-form; it
  is a second surface intersection per fixture per frame, and once one object receives light the
  next question is why it does not also cast a shadow. Rule 2 is the line that keeps the closed form
  closed.
- **Put the pool in the intensity map, shaded by the emitter that produced it.** Rejected by
  ADR-0019: the map is *relative and carries no unit*, and a lit floor is where a viewer would read
  a unit into it.
- **Ship no pool, and let haze do all the work as ADR-0013 assumed.** Rejected. The pool is a cheap
  cue that a beam is aimed *somewhere*, which is the preparation visualiser's whole job, and #35
  found the field's flagship shipping it as a fader rather than as a lighting solution.

## Consequences

- **§8 gains a floor-pool term** beside the beam shader, and §14.4 gains the ground plane as a
  permanent element of the viewport rather than scenery someone places.
- **Throw distance enters the renderer for the first time** — as the distance from the fixture to
  `y = 0` along the beam axis, used to size the ellipse. It is a geometric quantity, not a
  photometric one: nothing attenuates by it, and ADR-0013 item 5's refusal to scale by declared
  `LuminousFlux` is unaffected.
- **A fixture aimed at or above the horizon draws no pool.** No special case is needed; the
  intersection simply does not exist.
- **The scope guard is testable.** Any future request of the form *"could the truss cast a shadow"*
  or *"could the screen be lit"* is answered by rule 2 without reopening ADR-0013.
