# ADR-0038: `bhs:` binds one way — through a local fixture — and declares pixels only

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#41](https://github.com/jnslmk/beamhouse/issues/41)
- **Amends:** [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md), [ADR-0026](0026-the-control-channel-carries-requests-only-one-class-is-a-command.md), [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md)
- **Confirms:** [ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md), [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md)

## Context

[ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md) rule 3 gave the `bhs:`
definition source **two bindings**: **(a)** definition-only, attaching to a fixture the console
already patched, keyed by the patch's definition id — `classes` generalised; and **(b)** a local
fixture carrying definition *and* universe/address with no console entry at all.

[#41](https://github.com/jnslmk/beamhouse/issues/41) was chartered to design the screen for both.
Its premises did not survive contact with the repo.

**1 · The motivating case has no `bhs:` in it.** #41 cites *"ten `bhs:spoke23` fixtures at ids
101–110"*. `mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml` does patch ten spokes at ids 101–110 —
universe 2 at slots 30, 99, 168, 237, 306, 375, 444 and universe 3 at 1, 70, 139 — but every one of
them names **`ofl:beamhouse:wled-star-tent-spoke-23px`**, a real file in `definitions/ofl/`. Positive
ids, console-patched, resolving definition. That is neither binding. [ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md)
then moved it further away, to an authored `gdtf:`.

**2 · The "real case on disk" of a 60 px tube does not exist.** #41 cites it as *"§4.5's own
example"*. §4.5 declares `"classes": { "diy_t8_35px": { "kind": "strip", "pixels": 35 } }`, and the
string `60` appears nowhere in `DESIGN.md`. `bhs:tube60` / *"Tube FOH"* at id `−1` was invented by
#35's canvas (`gen.py:390`) to demonstrate the notation.

**3 · No `.bhs` file exists anywhere on disk.** The `definitions` block has never been written once.

**4 · The sharing pillar was removed four hours before this ticket was taken.** ADR-0012's leading
consequence was that a `bhs:` definition *"carries no local path … so it is the only fixture kind
that survives §9.1's URL fragment intact"*. [ADR-0031](0031-a-share-link-carries-resolved-definitions.md)
makes the `snapshot` variant carry render-resolved definitions inline, so **every** definition now
survives a link. #42's resolution states it: *"its pathlessness stopped being an advantage worth
contorting a format for."*

So `bhs:` entered this ticket with one leg left, and it is binding (b)'s: **a fixture with no console
entry needs a universe and an address, and a definition file cannot carry those.** That is the gled2
case ADR-0012 was actually argued from, and it is the only thing no other mechanism does.

## Decision

**1 · Binding (a) is removed. `bhs:` is reachable only through a local fixture.** A `bhs:` id never
appears on a positive-id fixture. ADR-0012 rule 3 keeps one binding, not two.

The use case (a) covered — *the console patched a fixture whose definition I do not have, or have
wrong* — now has two better answers, both accepted the same afternoon:

- **Missing**: [ADR-0034](0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md)
  renders it as a marked fixture, and you author a real file — the route #46 and #48 take.
- **Wrong**: ADR-0012 rule 6 already refused this and sends it to `gdtf-ts`'s quirks table. That
  refusal is unchanged and is now unambiguous, because there is no second mechanism to reach for.

**2 · `classes` is removed outright, not subsumed.** ADR-0012 rule 3(a) described `classes` as
generalised into `definitions`; `classes` **was** binding (a) — a Beamhouse-side pixel count keyed by
the patch's definition id — so cutting (a) cuts it. "Subsumed" is on the record and would otherwise
be implemented. §4.5's example loses the block.

**3 · `map(patchDefId, bhsDefId)` is deleted. §15.2's fourteen commands become thirteen.** Its
stated source is *"ADR-0012's two bindings"* and it is binding (a) verbatim. This is a subtraction
from a table [#37](https://github.com/jnslmk/beamhouse/issues/37) settled, not a re-opening of it:
ADR-0026's four request classes and its "nothing writes `patch`" rule are untouched, and one row
loses its cause.

**`define` stays.** ADR-0035 needs it as `object.place`'s lowering target. It is never a standalone
UI gesture ([ADR-0039](0039-definition-authoring-has-no-surface-of-its-own.md)).

**4 · The `Extent mismatch` issue class is retired, and a universe over-run replaces it.** ADR-0012
rule 5 required a surfaced error where a `bhs:` definition and the patch disagree about extent, and
in the same breath said *"under binding (b) the question dissolves — there is no patch to disagree
with."* With (a) gone there is no second source and the class has no cause. ADR-0025 names it, §4.5
specifies it, and #35's canvas draws it as a live Issues row.

What is left is a different error with a different cause: a local fixture addressed at `4.400`
declaring 60 px × 3 ch **runs past slot 512**. It is caught when you type the address rather than at
ingest — so it is arguably not an *issue* at all, nothing having ingested it — and everything else
the class covered folds into the existing **patch overlap** row.

**5 · `bhs:` declares pixels. A definition that must describe *light* is an authored GDTF — which
corrects the prefix in [ADR-0037](0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md).** ADR-0037
decision 3 mints `bhs:generic-par38` (`Wash`, 60° flood, `BeamRadius` 0.060),
`bhs:generic-e27-practical` (`Glow`, 2700 K) and `bhs:generic-profile` (`Spot`,
`BeamAngle == FieldAngle`). **`BeamType`, `BeamAngle`, `BeamRadius` and `ColorTemperature` are all
GDTF fields, and `bhs:`'s shape is `{kind, pixels, pitch}`** — it can say none of them.

This is [ADR-0033](0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md)'s test
applied unchanged: *only GDTF has a geometry tree at all*. The three become **authored `gdtf:`
files** in `definitions/authored/`, beside the impression 90 and the spoke.

**The line is optics, not shape.** `bhs:` declares **geometry and emitter layout**; it never
declares **beam optics or spectrum**. Two `kind`s exist in v1 and both sit on the geometry side:

| `kind` | Declares | Source |
| --- | --- | --- |
| `strip` | pixel count, pitch, channels-per-pixel, primitive | ADR-0012 — the gled2 case |
| `primitive` | `PrimitiveType` and bounding dimensions | [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md) — the human proxy box, `0.64 x 0.59 x 1.77` m |

ADR-0035 already shipped the second one 40 minutes before this was written, so `kind` was never
going to stay singular; what it was never asked to carry is a cone. Anything needing `BeamType`,
`BeamAngle`, `BeamRadius` or `ColorTemperature` is a GDTF. That is one rule covering the tent
(ADR-0033), the tungsten loads (above), the human proxy (ADR-0035) and the gled2 tube, and `kind`
stays the seam §01's *"do not architect them out"* asks for.

The other consequence is immediate: the six loads become **ordinary positive-id Mizer fixtures**,
since Mizer writes `gdtf:` and cannot write `bhs:` — so ADR-0037 decision 6's non-injective address
map is exercised by console fixtures, not local ones, which changes nothing about the rule.

One thing could pull back: ADR-0037 decision 5's tungsten dimming curve needs a spectrum that varies
with level, and whether GDTF can declare one is **unverified** —
[#50](https://github.com/jnslmk/beamhouse/issues/50). If it cannot, that curve has nowhere to live
but a `bhs:` definition, and rule 5 is revisited for that one field. It is a research question and
not a reason to hold the rule.

**[discharged 2026-09-02 — #50]** It does not pull back.
[ADR-0040](0040-the-tungsten-curve-is-derived-from-a-declared-lamptype.md) finds that GDTF *can*
declare a spectrum that varies with level, so the stated condition never fires — and that the
fallback named here did not exist anyway, since a `bhs:` definition declaring a spectrum would have
crossed the very line this rule draws. The curve is derived from a declared `LampType` instead, and
rule 5 stands unamended.

**6 · A local fixture is a slot range, not a universe.** ADR-0012 rule 3(b) is framed as
*"universes carrying pixels that Mizer has never patched"*, and §4.2 repeats it. The schema never
supported that reading — a local fixture carries `universe` **and** `address` — so the real rule is
**slots no console fixture claims**, on any universe. Universe 1 of the reference rig is Mizer's
busiest and would be perfectly legal to place one on. Clarified rather than decided; it has no
instance today.

## Consequences

- **`bhs:` rests on exactly one leg, and that is now stated rather than implied.** Not sharing
  (ADR-0031 took it), not overriding a patched definition (rule 1 takes it), not describing light
  (rule 5 takes it): only *these pixels are on the wire and no console has patched them*.
- **The `strip` kind has no instance on the reference rig.** The tent left for `gdtf:`, and rule 5
  sends the tungsten loads there too. This is the honest state: it is scoped in on a case the user
  confirmed is real — a fixture addressed only by gled2 — and not yet exercised. A future
  Mizer→gled2 remote-control link would control gled2, not patch the fixture, so the case survives
  that change. The `primitive` kind is exercised from the first placed musician.
- **ADR-0012's consequence about the conformance oracle is unchanged and now total.** Every `bhs:`
  fixture is binding (b), so every one of them is validated by eye alone.
  [#26](https://github.com/jnslmk/beamhouse/issues/26)'s 230-pixel oracle covers the patch path,
  which is where the tent went.
- **`DESIGN.md` §4.5 loses the `classes` block and the extent-mismatch paragraph; §15.2 loses a
  row.** ADR-0025's inventory loses one of the three "must be surfaced" requirements it was written
  to house — the other two, ADR-0020's synthesised ids and the override marks, are untouched.
- **#35's canvas now draws two things that do not exist**: the `Extent mismatch` Issues row and the
  `bhs:tube60` local fixture it refers to. Filed as
  [#51](https://github.com/jnslmk/beamhouse/issues/51) rather than edited here — three sessions have
  touched `gen.py` today and the fix belongs with whoever regenerates next.
- **ADR-0037's decision 3 table changes prefix in place**; its reasoning, its measurements and its
  tungsten curve are untouched. [#48](https://github.com/jnslmk/beamhouse/issues/48) carries the
  work and is amended to say `gdtf:`.
