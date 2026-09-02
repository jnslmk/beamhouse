# ADR-0022: `BeamType` selects the render path, stride aggregates within it

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#36](https://github.com/jnslmk/beamhouse/issues/36)
- **Amends:** [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md) rule 7 (its stated blocker is
  false), [ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md) (a `Wash` emitter is
  visible without atmosphere)
- **Amended by:** [ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md),
  [ADR-0040](0040-ofl-sole-emitter-draws-the-cone.md) (rule 1 gains the OFL selector; rule 3's
  `BeamRadius` body is sized from `physical.dimensions` where the format has no such field)

## Context

`CONTEXT.md` defined **beam class** as the class "for a fixture whose definition declares a `Beam`
geometry: rendered as a volumetric cone from that emitter's origin", and `DESIGN.md` §8.2 opened
with the same rule in different words — "Cone geometry from each `Beam` node". Both are wrong on
real files, and #36 was filed to pick a precedence between that rule and ADR-0005's stride
grouping.

**There was no precedence to pick.** Measured across the six profiles on disk:

- The `MarkeEigenbau` 30 px strip declares its pixels as 30 sibling `GeometryReference` nodes at
  constant DMX stride 3, all targeting one `Beam` geometry with `BeamType="Glow"`. Under the old
  wording it draws **30 volumetric cones down a pixel tube**.
- The WLED profile declares **three** `Glow` beams — `Primary`, `SecondaryBeam`, `TertiaryBeam` —
  and they are **not** what the ticket assumed. They are direct `<Beam>` children at *different
  tree depths*, with **no `<Break>` and no `DMXOffset` at all**. ADR-0005's rule is *sibling
  `GeometryReference` nodes under one parent, targeting the same geometry, at constant stride*;
  not one of those four clauses holds, so the stride rule never fires. Their three coincident
  identity `Position`s are three colour slots of one effect (offsets 7/10/13, `ColorAdd_R/G/B`
  three times over), not three emitters.

So the ticket's premise that "the six profiles on disk do not force the conflict" is false, and the
case that forces it is the *opposite* polarity to the one it anticipated: not a `Wash` beam that is
strided, but a **`Glow` beam that is not**.

**And a precedence could not have fixed it, because neither rule has an answer to offer.** The WLED
profile contains **zero `<Model>` elements** — `description.xml` is the only file in the zip and
even `Body` carries no `Model` attribute. The GDTF spec's `Glow` clause reads "No beam will be
drawn, only the geometry will emit light itself"; there is no geometry. The old `CONTEXT.md`
wording draws three coincident 120° cones, the spec's rule draws nothing at all, and both are
wrong.

Three further premises of #36 were false or incomplete:

- **`BeamType` is not "the first *static* `Beam` field the renderer selects on".** It is already
  consumed — §8.2, `CONTEXT.md`'s **Cone angle** and ADR-0010 rule 6 all read it for the soft/hard
  edge where `BeamAngle == FieldAngle`, which is five of the six profiles. What is new is
  selecting a *path* rather than tuning a parameter.
- **The wording lived at two sites, not one.** §8.2 carried the identical defect and the ticket
  named only `CONTEXT.md`. Meanwhile §5.1's table was already right: `Beam` → "beam origin", with
  no cone claimed. §5.1 and §8.2 had disagreed since they were written.
- **The escape hatch the ticket assumed is gone.** §5.3 still pointed at "the `.bhs` `classes`
  block as an explicit override", but ADR-0012 subsumed `classes` into the `definitions` block.
  §5.3 was stale on both halves — the heuristic ADR-0005 replaced, and an override ADR-0012
  deleted.

**No fixture in the reference rig exercises this at all.** The migration record says both `Glow`
profiles are "already pinned and both still unused by this rig"; #21/#23 turned the four WLED
blocks into *zero* fixtures and ten spokes. Everything patched is `Wash`. The leverage is
therefore forward-looking: the ten STAR-TENT spokes need a definition **we author**, so this ADR
decides what our own `Beam` nodes must declare.

## Decision

1. **`BeamType` selects the render path; stride aggregates within it.** `Wash`, `Fresnel`, `PC`,
   `Spot` and `Rectangle` add a cone. `None` and `Glow` do not. ADR-0005's stride grouping then
   operates *only within* the non-cone set, deciding whether N emissive emitters aggregate into a
   1D texture, a 2D texture, or stay N bodies.

   **There is no precedence clause, because the two rules answer different questions.**
   `BeamType` decides *what an emitter emits*; stride decides *how emitters aggregate*. No emitter
   is ever claimed by both. ADR-0005 is unamended in substance — it only ever grouped, and never
   classified.

2. **The two paths are not exclusive per emitter. There is one always-on emissive path, plus a
   conditional cone.** `CONTEXT.md` called beam class "one of the two rendering paths ... the
   other is the emissive surface", which made them alternatives; a real `Wash` mover has a
   glowing lens *and* a beam. Under the exclusive reading, an impression 90 in zero atmosphere
   renders as an unlit dark head — a case ADR-0013 otherwise leaves open, since its scattering
   term is what makes the cone visible and nothing made the lamp visible. `Glow` is now the
   **absence of the cone**, which is what the spec's wording says, rather than a separate class.

3. **A `Glow` beam whose geometry is missing renders as an emissive body of the declared
   `BeamRadius`, and raises a definition defect.** This is the WLED profile, live on disk. §5.1
   already states the principle — "a rig where half the fixtures are invisible is a confusing
   first bug" — and generates primitives for exactly this reason. `BeamRadius` is a declared field
   (0.05 m here), so the fallback invents no number. The defect is surfaced the way ADR-0012
   rule 5 surfaces a pixel-count mismatch: silent invisibility is the failure mode §5.1 already
   ruled against, and a GDTF with no `<Models>` is wrong for every consumer, not just this show.

4. **A strided `Wash` set is N cones and gets no `DataTexture`.** The ticket's original worry, and
   it costs §8.1's one-draw-call win on a 10-cell moving bar. Accepted with no exception: each
   cell has a real optic and a real direction, and merging them into a texture would be the
   renderer claiming to know better than the definition — ADR-0005 rule 6's argument one level up.
   Rule 2 already gives such a bar its emissive bodies for free. Nothing in the rig has this shape.

5. **The textured geometry is the run's common parent.** §8.1 said "render each tube as the
   geometry its definition declares", singular — but the authored tube declares two models, and a
   third-party profile has no naming convention to look for. The rule is therefore structural:
   **the geometry textured by the strip/matrix path is the common parent of the strided run.** It
   reproduces `MarkeEigenbau` unchanged (its 30 references sit under `Body`, the visible
   25 x 50 x 1000 mm cube), it needs no new field, and it degrades into rule 3 when the parent has
   no model — as WLED's `Body` does not. It is also *checkable*: hang the references off the wrong
   parent and the aluminium lights up instead of the diffuser, which is a visible failure rather
   than a silent one.

6. **No render-class override is reinstated.** Both routes already exist and both fix the file for
   every consumer rather than for this show: a wrong third-party profile is corrected in
   `gdtf-ts`'s quirks table (ADR-0005 rule 8, ADR-0012 rule 6), and a missing one is supplied as a
   `bhs:` definition (ADR-0012 rule 2). §5.3's reference to `classes` is deleted rather than
   replaced.

7. **The STAR-TENT spoke definition copies `MarkeEigenbau`'s shape** — `BeamType="Glow"`, 23
   sibling `GeometryReference` nodes at constant stride, each targeting one geometry, under a
   parent that carries a real model. It is the only profile on disk that gets the shape right, and
   writing it down makes the authored definition checkable against a rule rather than against
   taste. Under rule 5 the references hang off the **diffuser**, not the body.

8. **Its geometry is the build123d `led_profiles` model, simplified, and the diffuser is the
   emissive surface.** ADR-0005 rule 7 said "The build123d model of the tube does not exist yet —
   no such model is on disk". **That is now false** and has been since 7 August:
   `~/git-projects/build123d/build123d-models` carries `models/led_profiles`, whose default
   `LENGTH = 1500.0` is "a full 1.5 m stick", exported as `exports/led_profiles.glb`, `.step` and
   per-part STLs.

   - **The section is a stadium, not a cylinder.** `config.py`: "Not an ellipse: two half-circles
     joined by straight flanks, so the outline is a stadium/obround standing on end" —
     `SlotOverall(HEIGHT, WIDTH, rotation=90)`, 26.1 x 30.5 mm. GDTF's `PrimitiveType` enum has no
     stadium and a `Cylinder` would be wrong in both axes at once, so this ships as a real GLB
     mesh — ADR-0005 rule 7's path, with its blocker removed rather than its conclusion changed.
   - **The diffuser carries the `DataTexture`; the COB band is not rendered.** The band is the
     physical emitter (`STRIP_EMITTER_W` 8.0 x `STRIP_EMITTER_T` 0.4 mm, already coloured
     "warm, i.e. lit" in CAD) but it sits at z ~= 15.1 mm under a translucent diffuser capping the
     whole upper half-circle, and is not visible through it. What an audience sees is the diffuser
     glowing at 26 mm. Texturing the band instead would draw a thin bright line inside a
     translucent solid, which needs transmission through a participating solid — everything past
     one scattering sample, which ADR-0013 deferred.
   - **The pixels are zones of a continuous band.** 230 LEDs over ten spokes is 23 per 1500 mm =
     **65.2 mm pitch**, which for a 10 mm 24 V addressable COB is one IC per zone. §8.1's
     `LinearFilter` argument stops being an approximation and becomes literally what the hardware
     does.

9. **The mesh is simplified upstream, not decimated downstream, and ships as one GLB per GDTF
   `<Model>`.** Measured at identical tolerance (`linear_deflection=0.1`, `angular=0.1`):

   | geometry | verts | tris | KB |
   | --- | --- | --- | --- |
   | aluminium, full section | 2076 | 2024 | 73.5 |
   | **aluminium, outer shell only** | **272** | 260 | 10.8 |
   | diffuser, with inner bore | 536 | 520 | 19.3 |
   | **diffuser, solid** | **272** | 260 | 10.8 |

   The shipped pair is **544 verts / 21.6 KB**, against the committed full-lamp GLB's **22,660
   verts / 880 KB** — 42x fewer vertices, and under half the 1200-vertex default LOD budget §5.1
   cites. Ten spokes cost ~5.4 k verts / ~216 KB against §5.1's megabyte. Everything removed is
   invisible on a closed tube: the wiring cavity, corner pockets, screw bosses and pilot ports
   (32 B-rep faces down to 6), the diffuser's inner bore, and — from `create()` — the endcaps,
   M12 glands, cable stubs and PCB, whose two threaded gland meshes alone were **82%** of the
   full lamp's vertices.

   **Simplification happens upstream**, as a sibling of `create_bare()` in `models/led_profiles`,
   because it is a *modelling* decision — which features are invisible on a closed tube — that
   needs `config.py`'s own constants (`RIM_Z`, the stadium) to express. Done downstream it becomes
   mesh decimation guessing at intent, and it would drift the moment the profile is re-measured.
   It also keeps Beamhouse free of a CAD dependency, which is the point of ADR-0005 rule 7.

   **One GLB per GDTF `<Model>`** — a body and a diffuser, each its own file. The committed GLB
   loses every part label (nodes named `=>[0:1:1:2]`, all ten meshes named `SOLID`) and the
   emitter is identifiable only by material colour, so a single-file export cannot address the
   diffuser at all. Per-part files match GDTF's own file-per-model convention, sidestep the label
   loss rather than depending on a fix landing in another repo, and let the two carry different
   materials without colour-matching to tell them apart.

## Consequences

- `CONTEXT.md`'s **Beam class** entry is rewritten, and the "one of the two rendering paths"
  framing goes with it (rule 2). **Emitter** gains the note that every emitter has an emissive
  body; the cone is the conditional part.
- `DESIGN.md` §8.2's opening line is corrected — the same defect as the glossary entry, at the
  second site the ticket did not name. §8.1 gains rule 5's parent rule. §5.3 loses its reference
  to `classes` and to the superseded detection heuristic. §5.1's table is already correct and
  stands as written.
- ADR-0005 rule 7's blocker note is stale and is annotated rather than rewritten: the conclusion
  ("as an authored GDTF, not a Beamhouse-side attachment layer") holds; only "no such model is on
  disk" is false.
- Whether the tent's definition ships as an authored `gdtf:` file in `definitions/authored/` or
  inline as a `bhs:` definition (ADR-0012 rule 2) is **not decided here**. It changes what a
  shared `.bhs` can carry (§9.2) and belongs with the `.bhs` schema, not with render-class
  selection. Graduated as its own ticket.
- A `create_previz()` in `build123d-models` and its per-part GLB export are work in **another
  repo**. This ADR specifies it; it does not do it.
