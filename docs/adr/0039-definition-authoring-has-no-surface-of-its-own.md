# ADR-0039: Definition authoring has no surface of its own

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#41](https://github.com/jnslmk/beamhouse/issues/41)
- **Confirms:** [ADR-0023](0023-the-chip-bar-is-the-navigation.md), [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md)
- **Related:** [ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md)

## Context

[#41](https://github.com/jnslmk/beamhouse/issues/41) asked *"how do you author a `bhs:` definition,
and how do you bind one?"*, and noted that **no product in #35's survey has this screen** — none of
grandMA3, Capture 2026, BlenderDMX, DMXpressions or Showcase has a fixture-definition source of its
own. It listed the overlay's five tabs — **Fixtures · Objects · Universes · History · Issues** — and
asked whether a sixth is needed.

[ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md) shrinks the question before it is
answered. With binding (a) removed, a `bhs:` definition is reachable **only** through a local
fixture, so there is exactly one way in rather than two gestures that must read differently. And
with optics ruled out of the format, the whole editable surface is four fields for a `strip` and
four for a `primitive`.

[ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md) then made the machinery serve
a second feature: `object.place` **lowers onto `define` + `fixture.add`**, and the `Objects` tab is
a *filter* on the Fixtures table whose predicate is *has no address*. Every musician placed is a
`define` firing. Whatever this decides is exercised by scene objects from the first placement, not
only by gled2.

## Decision

**1 · There is no `Definitions` tab.** The overlay keeps its five. A tab would be a library browser
for a library holding one or two entries on a real rig, and — worse — it would present *authoring a
definition* and *placing a fixture* as peers in the same chrome, which is the exact confusion
ADR-0012 rule 1's **"placement mints nothing"** exists to prevent.

**2 · One gesture: `add local fixture`, on the Fixtures tab, which creates the definition inline.**
Definition and fixture are made in one act because ADR-0038 leaves no way to have one without the
other. The gesture offers existing `bhs:` ids alongside **new** — reuse is the second-instance case,
the way one spoke definition serves ten spokes.

**3 · A definition is edited from any fixture that names it**, not from a place of its own. It is
one-to-many, so the edit announces its reach: editing `bhs:spoke23` from spoke 3 says it changes
ten. This is §14.2's *multi-row edit with no modifier keys* arriving from the definition side.

**4 · `define` is never a standalone UI gesture.** It stays in §15.2 as a command because ADR-0035
needs it as `object.place`'s lowering target, and because the agent may compose it. §14's rule is
one-directional — *the UI draws no affordance that is not a command* — so a command with no
affordance is legal, and this is the second one after `object.place`'s own lowering.

**5 · The editor is per-`kind`, and small.** ADR-0038 rule 5 fixes the two:

| `kind` | Fields |
| --- | --- |
| `strip` | pixel count · pitch · channels-per-pixel · `PrimitiveType` |
| `primitive` | `PrimitiveType` · width · depth · height |

No mesh import: ADR-0038 rule 5 keeps geometry trees in GDTF, and #42's resolution priced the
alternative. No beam fields, for the same reason. Values are mono per §14.2, pitch in millimetres
because that is what a tape measure reads and what #21 argued about.

**6 · The negative id is allocated, never typed, and not editable.** Next free negative. The sign
carries a *meaning* — **no console knows about this** — so an input invites typing a positive one
and silently claiming an id a console may allocate later, which is the one failure
[ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md) rule 4 made structurally
impossible and a text field would hand back. It is displayed and selectable — the agent addresses it
by id — but it is a value, not a field. #35's canvas already draws the notation: `−1`, mono, a real
minus sign.

**7 · One allocator over the whole negative space, shared with scene objects.** ADR-0035 says it
from the other side: *"the negative keyspace stays what Beamhouse minted, not this is an object."*
Two minters that must agree is a bug waiting for the first rig with both, and
[ADR-0003](0003-fixture-id-is-the-only-identity.md)'s "one integer space" reads more literally with
one.

**8 · The tab split is the DMX mode, not the sign.** Addressed goes to **Fixtures**, empty goes to
**Objects** — ADR-0035's *has no address* predicate, unchanged. A `bhs:` local fixture and a
musician are both negative-id, Beamhouse-minted things; splitting on the sign would put a gled2 tube
in the same table as a human proxy. §14.4 already gave the real reason: the Fixtures table's columns
are patch columns, and a proxy has none of them.

## Considered options

- **A `Definitions` tab.** Rejected by rule 1. It was the reading #41 leaned toward, and it made
  sense while binding (a) existed and a definition could be authored with no fixture to attach it
  to. ADR-0038 removed that case.
- **Two gestures reading visibly differently**, as #41 asked for — *create a local fixture* versus
  *bind a definition to a patched one*. Rejected because the second gesture no longer exists.
- **A typed negative id**, matching how a console patch is entered. Rejected by rule 6: the id is
  minted, not chosen, and the only thing typing it buys is the ability to get it wrong.

## Consequences

- **The screen #41 was chartered to design does not get built**, and that is the finding rather
  than a deferral: two field groups and an allocator, hosted by gestures that already exist. #35's
  observation that no surveyed product has this screen turns out to be right for a reason — a
  definition source this small does not want one.
- **Every affordance here is an agent tool**, per §14's rule: `fixture.add` with a new definition
  lowers to `define` + `fixture.add`, which is the shape ADR-0035 already established for
  `object.place`. The agent gains nothing special and loses nothing.
- **`DESIGN.md` §14.5's "still owed" empties.** Both items #13.6 handed forward — the degradation
  ladder (#40, retired by ADR-0031) and this — are now decided.
- **#45 is the only UI ticket left on the map**, and it is a transport rather than a screen.
