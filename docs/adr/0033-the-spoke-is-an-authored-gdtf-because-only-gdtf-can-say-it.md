# ADR-0033: The spoke is an authored GDTF, because only GDTF can say what it needs to say

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#42](https://github.com/jnslmk/beamhouse/issues/42)
- **Amends:** [ADR-0022](0022-beamtype-selects-the-path-stride-aggregates-within-it.md)
- **Confirms:** [ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md), [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)

## Context

[#42](https://github.com/jnslmk/beamhouse/issues/42) asked whether the STAR-TENT spoke definition
ships as an authored `gdtf:` file ([ADR-0005](0005-emitter-grouping-is-by-dmx-stride.md) rule 7) or
as an inline `bhs:` definition
([ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md) rule 2), and grounded the
question entirely in §9.2: *"A `.bhs` naming `definitions/authored/…` hands the recipient a path
they cannot resolve."*

**The ticket's framing did not survive contact with the repo, on five counts.**

1. **There is no "STAR-TENT definition."** There is a **spoke** definition, instanced ten times.
   `mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml` patches ten independent fixtures, ids 101–110,
   each naming one `23px RGB 69-channel` definition; its own comment says *"one outward-spoke
   definition, reversed spokes placed"*. The single-fixture framing was the **pre-#23 `qlc:`
   patch** — four `WLED Segment Effect` fixtures named Star / Highlight / Flash / Sparkle — which
   [#23](https://github.com/jnslmk/beamhouse/issues/23) already replaced. ADR-0022 rule 7 says "the
   STAR-TENT **spoke** definition" correctly; the ticket title does not.

2. **Neither of the ticket's two routes is what ships today. A third does.**
   `definitions/ofl/beamhouse.json` carries `WLED STAR-TENT Spoke 23px` —
   `matrix.pixelCount [23,1,1]`, `matrixPixels.dimensions` at 65.217 mm — authored 2026-09-02 by
   #23, and the Mizer patch names it as **`ofl:beamhouse:wled-star-tent-spoke-23px`**, ten times.
   The status quo is `ofl:`, not either option the ticket offered.

3. **The repo says three different things about where the spoke lives.** §10: "the STAR-TENT is a
   `bhs:` definition rendered as proxy geometry". §8.1 and ADR-0022 rule 8: an authored GDTF
   declaring two models. On disk: `ofl:`. No ADR reconciled them.

4. **The size figure is a false multiplier.** The ticket reasoned "21.6 KB and the rig has ten".
   One definition serves ten instances — ADR-0022's 216 KB is the *runtime vertex* cost of ten
   instances, not payload. The payload is 21.6 KB **once**. For scale, the committed authored
   impression 90 `.gdtf` is 2,084 bytes.

5. **The question the ticket was built on was dissolved four hours before it was taken.**
   [ADR-0031](0031-a-share-link-carries-resolved-definitions.md) makes the `snapshot` variant carry
   **render-resolved definitions inline**, and retires §9.2's ladder. Its own consequences say so:
   *"#42 loses a constraint. Its choice between an authored `gdtf:` file and an inline `bhs:`
   definition for the STAR-TENT no longer changes what a recipient can see, because both now travel
   in the link."* ADR-0031 also **rejects by name** the answer this ticket was otherwise heading
   for — *"Keep definition ids and bundle every recurring definition. Rejected. It makes the link's
   completeness depend on what the deployment happens to ship."*

So the sharing argument — the whole of the ticket's "Why it is a decision" — is gone, and with it
any reason to amend ADR-0001's "the bundled library is OFL-only". What remains is a question with
a different and better ground: **which format can express what ADR-0022 requires.**

## Decision

1. **The spoke is an authored GDTF, decided on expressiveness rather than on sharing.**
   ADR-0022 rule 7 requires `BeamType="Glow"`, 23 sibling `GeometryReference` nodes at constant
   stride, each targeting one geometry, hung off a **diffuser** parent that carries a real model
   (rule 5). Of the three candidate formats, only GDTF has a geometry tree at all: a `bhs:`
   definition is `{kind, pixels, pitch}` (§4.5) and OFL's `Matrix{pixelCount}` declares a count and
   a pitch with no tree, no parent, no `BeamType` and no model. **ADR-0005 rule 7 stands
   unamended**, and it is now the only rule doing any work here.

   Expressing this in `bhs:` would mean writing a geometry-tree vocabulary into the `.bhs` for one
   fixture — re-inventing GDTF in JSON, which is the move ADR-0005 rule 8 and ADR-0022 rule 6 both
   already refused from the other direction.

2. **A `bhs:` definition never carries geometry, and this costs nothing.** It declares pixels where
   **no file declares them** — the gled2 case ADR-0012 was actually argued from, where universes
   carry pixels Mizer never patched. It is not an envelope for a base64 GDTF. Before ADR-0031 this
   would have been a real cost, because `bhs:` was "the only fixture kind that survives §9.1's URL
   fragment intact" (ADR-0012's first consequence). ADR-0031 removed that asymmetry: **every**
   definition now travels in a link as render facts, so `bhs:`'s pathlessness stopped being an
   advantage worth contorting a format for.

3. **The `<Model>` declares a `PrimitiveType` of `Cube` *and* a `File`, and this is what makes the
   shared spoke correct.** ADR-0022 rule 8 argued for a real mesh because "GDTF's `PrimitiveType`
   enum has no stadium and a `Cylinder` would be wrong in both axes at once". That is true of
   `Cylinder` and **not** of `Cube`, which rule 8 did not consider. Measured from
   `models/led_profiles/config.py`: `WIDTH = 26.1`, `HEIGHT = 30.5`, `RADIUS = 13.05`,
   `STRAIGHT_H = 4.4` — the section is two half-circles joined by 4.4 mm of vertical flank. A
   `Cube` of 26.1 × 30.5 × 1500 is **exact in both principal dimensions** and wrong only at the
   four corner fillets; a `Cylinder` must pick one diameter and is wrong by 4.4 mm along one axis
   everywhere.

   So the model carries both, which is how GDTF is meant to be authored: the mesh is used where it
   resolves, the primitive where it does not. ADR-0031's snapshot carries `PrimitiveType` and a
   bounding box, so **a shared spoke renders at exactly the right dimensions with square corners**,
   and needs no special case in the share path.

4. **The mesh is therefore cosmetic, not correctness, and belongs to M4.** ADR-0022 rules 8 and 9
   stand — the simplification is still done upstream in build123d, still ships one GLB per
   `<Model>`, still measures 544 verts / 21.6 KB. What changes is its *status*: with rule 3 above,
   the GLB buys rounded corners on a 26 mm section, not a correct one. §10's claim that M3b works
   with "the STAR-TENT as a `bhs:` definition rendered as proxy geometry" is wrong on the format
   and right on the adequacy; it is corrected rather than deleted.

5. **All ten spokes re-patch from `ofl:beamhouse:wled-star-tent-spoke-23px` onto the authored
   GDTF's `FixtureTypeID`.** One fixture, one definition, one id. This follows the impression 90's
   own precedent exactly — `qlc:GLP:impression 90 RGB` became `gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48`,
   the authored file's own `FixtureTypeID`, once that file existed.

   **The authored spoke GDTF does not exist yet.** ADR-0022 rules 7-9 specify it completely —
   shape, models, simplification, file split — and nobody has written it; `definitions/authored/`
   holds the impression 90 alone. So rules 5 and 6 are **decisions with a prerequisite**, in this
   order: author the file, re-patch the ten `fixture:` lines onto its `FixtureTypeID`, then delete
   the OFL entry. Doing either edit first would leave ten spokes naming a definition that resolves
   to nothing, which is ADR-0034's marker case inflicted on the reference rig on purpose. The
   authoring is its own ticket, the way [#19](https://github.com/jnslmk/beamhouse/issues/19) was
   for the impression 90.

   **Nothing #23 verified against the physical node depends on the definition id.** The addressing
   it proved — `addr 30`, universes 2 and 3, the 69-channel stride, the seam landing exactly on the
   spoke 6 → 7 boundary — is a property of the *patch entry*, not of the definition it names. The
   re-patch is ten `fixture:` lines in one file.

6. **The spoke's OFL entry is deleted.** `definitions/ofl/beamhouse.json` held exactly one fixture,
   and after rule 5 nothing patches it. Keeping a second definition for one fixture is drift with
   no consumer, and ADR-0012 rule 5's disagreement machinery exists for definition-versus-patch,
   not definition-versus-definition. #23's authoring survives in git history.

7. **The impression 90 stays primitives-only.** #17's MIT-licensed meshes are redistributable and
   could ship, but the spoke's mesh case was a *correctness* gap (rule 3 above shows it was smaller
   than ADR-0022 thought, and it was still real) while the impression 90 has none: `Base`, `Yoke`
   and `Head` are exactly the primitives GDTF provides for a mover, its pivots are measured to
   0.1% ([#16](https://github.com/jnslmk/beamhouse/issues/16)), and what the six of them are under
   test for is the pan/tilt axis hierarchy, not the silhouette. `definitions/authored/README.md`
   already files a donor mesh as a polish pass; it stays one.

8. **A local fixture may name any resolvable definition id, not only `bhs:`.** ADR-0012 rule 3(b)
   defines a local fixture as "definition *and* universe/address, with no console entry", and
   rule 4 constrains the **id** to be negative. Neither constrains the *prefix* — but §4.5's only
   example is `"definition": "bhs:spoke23"`, which read together with rule 2 above would wrongly
   imply every locally-added fixture is geometry-less. Stated explicitly so it is true by decision
   rather than by omission. Its grounds are gled2 driving a run whose profile we authored; it is
   **not** grounded in adding fixtures speculatively, which is not a claimed feature — an eleventh
   spoke that exists gets patched in Mizer like the other ten.

## Considered options

- **An inline `bhs:` definition** (the ticket's option 2). Rejected by rule 1: it cannot express a
  geometry tree, and giving it one is re-writing GDTF for one fixture.
- **A `bhs:` definition carrying a base64 GDTF.** Rejected. It makes `bhs:` an envelope rather than
  a format, pays ~29 KB in every `.bhs`, and buys nothing ADR-0031 does not already give away free.
- **Keep `ofl:` as the patch id and supply geometry Beamhouse-side.** Rejected by name: this is the
  "Beamhouse-side attachment layer" ADR-0005 rule 7 exists to refuse.
- **Keep `ofl:` and never ship the mesh.** Coherent, and cheaper by ten edited lines. Rejected
  because OFL cannot express `BeamType` or the strided tree either, so ADR-0022 rules 5 and 7 would
  have no file to be true of — the render class would be inferred rather than declared, which is
  the arrangement ADR-0022 rule 6 declined to reinstate.
- **Amend ADR-0001 so the bundle is licence-gated rather than format-gated**, letting
  `definitions/authored/` ship with the app. This was the intended answer until ADR-0031 landed
  mid-session. Rejected: ADR-0031 rejects it explicitly and on better grounds — bundling makes a
  link's completeness depend on what the deployment happened to ship, and the sender cannot tell.
  ADR-0001 is **unamended**.

## Consequences

- **`definitions/ofl/` will be empty of our own content once rule 6 fires.** The reference rig still patches
  `ofl:generic:4-channel-dimmer-pack` for fixtures 7 and 8, and **that definition is nowhere on
  disk** — there is no OFL fetch tooling (`tools/` holds `adr.sh` and `gdtf-share.sh` only). Two of
  thirteen fixtures therefore do not resolve locally today. That is a real gap and it is **not**
  this ticket's: it is filed separately, because ADR-0031 removed the sharing rationale that would
  have made it part of this decision. **[closed 2026-09-02 —
  [#48](https://github.com/jnslmk/beamhouse/issues/48)]** It closed by dissolving rather than by
  fetching: [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) ruled a dimmer pack is
  not a fixture, so fixtures 7 and 8 are gone and their six loads are on authored GDTF. Rule 6 has
  now fired on both sides — with #46 retiring the spoke, `definitions/ofl/` empties completely and
  the reference rig ends with **zero OFL fixtures**.
- **ADR-0022 rule 8's mesh argument is weakened but its conclusion holds.** The mesh ships; it is
  no longer load-bearing for correctness. Recorded here rather than by editing rule 8, so the
  measurement that changed the reading stays attached to the reading.
- **§10's M3b premise is corrected in wording, not in substance.** M3b still needs nothing from M4:
  a `Cube` at 26.1 × 30.5 × 1500 is what the agent arranges ten of, and the GLB changes only the
  corners.
- **`#26`'s conformance oracle should be re-run once after the re-patch.** It pins the strip path
  to 230 real pixels through the *patch's* index space, and the re-patch changes which definition
  supplies that space — from OFL's `pixelCount` to GDTF's 23 strided `GeometryReference`s. The
  numbers should be identical; that they are is the check.
- **The `.bhs` schema gains nothing.** Every fixed point this decision touches — the tagged union
  (#30), the `definitions` block (ADR-0012), the snapshot's definition table (ADR-0031) — already
  exists. This is the first #42-adjacent decision to add no schema at all.
- **`gdtf-manifest.json` is untouched.** It is a GDTF Share lockfile keyed by `rid`
  ([ADR-0030](0030-gdtfspec-resolves-inside-the-archive.md) rule 7) and an authored definition has
  no `rid`, exactly as an MVR-extracted one does not.
