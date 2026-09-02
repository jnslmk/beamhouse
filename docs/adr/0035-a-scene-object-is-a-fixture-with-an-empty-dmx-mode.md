# ADR-0035: A scene object is a fixture with an empty DMX mode

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#43](https://github.com/jnslmk/beamhouse/issues/43)
- **Confirms:** [ADR-0003](0003-fixture-id-is-the-only-identity.md), [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md), [ADR-0030](0030-gdtfspec-resolves-inside-the-archive.md)
- **Amends:** [ADR-0026](0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)

## Context

[#35](https://github.com/jnslmk/beamhouse/issues/35) asked for *"a mock stage and musicians"* and
settled a **built-in primitive kit — box, cylinder, plane, human proxy — placed through the command
layer**, with MVR scene objects explicitly *not* the v1 route because §4.3 measured that no console
on this machine writes an MVR. [#37](https://github.com/jnslmk/beamhouse/issues/37) then named
`object.place(kind, params)` as a command class *"whose parameter space is #43's to fill"*,
deliberately, so that #43 could not invent a parallel path into scene state.
[#39](https://github.com/jnslmk/beamhouse/issues/39) handed over the rest: `GDTFSpec` sits on six
node types, [ADR-0030](0030-gdtfspec-resolves-inside-the-archive.md) made the resolver
node-agnostic, and *which of the six Beamhouse patches, renders or ignores* was left here.

The ticket's open bullets were an object model, an identity scheme, a `.bhs` block, a UI home and a
scope guard — five designs. **Measuring against GDTF Share collapsed four of them into one fact.**

1. **A scene object already has a canonical GDTF form, and there are seven human proxies on
   Share.** `EMEX7` publishes `Person with Microphone`, `Person at Drum Kit`, `Person at Keyboard`,
   `Person with Electric Bass`, `Person with Electric Guitar` (two revisions) and `People Dance`.
   Pulled and read, `Person with Microphone` (rid 43576) is a `FixtureType` whose own
   `Description` is **`"Environment from MVR"`** and whose body is empty everywhere a lamp is full:

   ```xml
   <AttributeDefinitions><ActivationGroups/><FeatureGroups/><Attributes/></AttributeDefinitions>
   <PhysicalDescriptions>…<Emitters/>…</PhysicalDescriptions>
   <Models><Model File="Person with Microphone _680E…" Height="1.769315" Length="0.593438"
                  PrimitiveType="Undefined" Width="0.644898" Name="Model 1"/></Models>
   <DMXModes><DMXMode Geometry="Person with Microphone " Name="Default">
     <DMXChannels/><Relations/><FTMacros/></DMXMode></DMXModes>
   ```

   One geometry, one model, a `.3ds` mesh, a real bounding box, **zero attributes, zero emitters,
   zero channels**. The format's own answer to *what is a scene object* is: **a fixture with an
   empty DMX mode.**

2. **A truss ships no mesh, only primitives — so the kit is already the render path.** 52 truss
   profiles on Share. `BakaCowpoke Truss 10ft 12x18in` (rid 104571) is **16 KB, one file, zero
   meshes**: 46 `<Geometry>` nodes over 7 `<Model>`s — `Cylinder` cords, `Cube` gusset plates. It
   is drawn by exactly the proxy-geometry path [ADR-0031](0031-a-share-link-carries-resolved-definitions.md)
   promoted from a fallback to the primary render path. Rendering a truss needs no renderer work at
   all.

3. **The human proxy is the one member of the kit with no primitive.** GDTF's enum is `Undefined ·
   Cube · Cylinder · Sphere · Base · Yoke · Head · Scanner · Conventional · Pigtail` plus three
   `1_1` variants (`gdtf-spec.md:1068`) — **there is no `Plane` and no person**. EMEX7's model is
   `Undefined` with a `.3ds`, and this repo's own resolution rule
   ([`gdtf-spatial-resolution.md` §4.1](../research/gdtf-spatial-resolution.md)) is that `Undefined`
   with no resolvable file emits **an empty transform node**. A person is therefore *invisible*
   unless v1 reads meshes out of the zip.

4. **None of the seven can ship with Beamhouse.** [ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md)
   records that GDTF Share grants no redistribution right, which is why the bundled library is
   OFL-only. A built-in kit has to be Beamhouse's own geometry.

## Decision

**1 · A scene object is a fixture with an empty DMX mode. There is no object model.** It resolves
through the same definition path, carries a **placement** and nothing else, and is distinguished
from a lamp by a single predicate: **it has no address**. Four of the ticket's five designs stop
existing rather than getting designed:

- **Identity is [ADR-0003](0003-fixture-id-is-the-only-identity.md), unamended.** An object is a
  **local fixture** and takes a **negative id** ([ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)),
  which Mizer's `u32` cannot represent. Because no patch ever mentions an object, nothing can
  collide with a console id and nothing can orphan on re-import. The ticket asked *"what keys an
  object, and how does it survive a re-import"*; the answer is that the question does not arise.
- **There is no `objects` block in the `.bhs`.** Objects are `fixtures` entries with a `definition`
  and no `universe`/`address` (§4.5).
- **A share link carries objects for free.** ADR-0031's `snapshot` already resolves `PrimitiveType`,
  bounding box, pitch and bindings per definition with fixtures indexing into the table; an object
  is one more row with an empty binding set.
- **The `Objects` tab is a filter, not a second table** — the predicate *has no address*, which is
  also what makes [ADR-0032](0032-the-m3a-viewer-is-read-only.md) rule 5's *"`Objects` joins it when
  non-empty"* a one-line change on the phone rather than a second list.

**2 · `object.place` stays a named command and lowers onto `define` + `fixture.add`.** ADR-0026's
rule that the UI draws no affordance outside the command list still binds, and *place a musician* is
a real affordance that must be one undo entry and one agent tool. What it is not is a second writer:
it lowers exactly the way #37's `rotate(…, pivot)` lowers onto ADR-0012's stored transform. This
**amends ADR-0026** by fixing `object.place`'s parameter space as *(definition, placement)* — the
same pair `fixture.add` takes, minus the address — rather than the open `(kind, params)` it was
named with.

**3 · ADR-0012's rule is restated, not weakened: placement mints nothing.** Every *emitter* traces
to a definition; an object has **no emitter**, and it still traces to a definition — its geometry
comes from a `bhs:` or `gdtf:` entry, never from the placement. The rule reads the same for a thing
with zero emitters as for a thing with 230.

**4 · The kit is GDTF's primitive set, and the human proxy is a box.** `Cube`, `Cylinder`, `Sphere`
are generated procedurally and are the whole kit; a **plane is a flattened `Cube`**, since GDTF has
no `Plane`. The human proxy ships as a Beamhouse `bhs:` definition at EMEX7's own measured
dimensions — **0.64 × 0.59 × 1.77 m** — and renders as that box. This is the
[ADR-0019](0019-the-intensity-map-is-relative-not-photometric.md) posture applied to geometry: the
job is *"can I tell whether the beam is on the singer"*, and a 1.77 m box answers it. **Meshes
arrive with the deferred GLB drag-and-drop** (§01) and never before, so v1 gains no `.3ds` loader
and no shipped human mesh.

**5 · An MVR ingest places all six node types and patches only what carries an address.**
`SceneObject`, `Truss`, `Support`, `VideoScreen` and `Projector` resolve out of the archive exactly
as a `Fixture` does (ADR-0030) and land in the Objects filter. A **`Fixture` node with no
`GDTFSpec` at all** — which the spec permits at `0 or 1` and ADR-0030 ruled not a patchable fixture
— becomes an object too: it has a name and a matrix, which is all an object needs, and it renders
[ADR-0034](0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md)'s fixed marker,
since there is no definition to size it from.

**6 · MVR-borne objects keep their MVR ids, positive.** Negative ids are for what Beamhouse mints;
an object authored in a design tool must survive that tool's next export, so it goes through
ADR-0020's ingest ladder and carries the UUID reconciliation hint like any other MVR fixture. The
negative keyspace stays what ADR-0012 defined it as — *this file invented it* — rather than becoming
*this is an object*.

## Considered options

- **A parallel object model, as #35's wording implied.** Rejected on cost against nothing: a second
  geometry system, a second id space, a second `.bhs` block, a second share-link encoding and a
  second table, to render cubes and cylinders the definition path already renders. The `.bhs` would
  have grown a block whose entries were structurally identical to `fixtures` minus two fields.
- **Ship the seven EMEX7 profiles.** Not available — ADR-0001, no redistribution right. A user may
  download them into their own library, where they resolve like any other definition and get their
  mesh; that is a property of *their* library, not of the product.
- **Read `.3ds` out of the zip for v1, so the human proxy has a mesh.** Rejected: it is a mesh path
  the product otherwise does not have, for one decorative object, and it can only ever fire on a
  profile the user themselves downloaded. `gdtf-spatial-resolution.md` §4.1 already specifies the
  rule for when the loader arrives; nothing here forecloses it.
- **Drop the six non-`Fixture` MVR node types on ingest.** Rejected. The resolver is already
  node-agnostic, so dropping them is *more* code than keeping them, and a truss silently missing
  from an imported rig is the "wrong in a way that looks right" failure this map keeps finding.

## Consequences

- **The primitive kit is not new work.** It is `Cube`/`Cylinder`/`Sphere` from §5.1's procedural
  generation, plus one authored `bhs:` human box. The stage is a `Cube`.
- **The `Objects` tab shows the fixture table's non-patch columns only** — name, definition,
  position, rotation. The patch columns are empty by construction, which is why #35 wanted a
  separate tab; under this decision that stays true and costs a filter rather than a table.
- **An object can be selected, moved, rotated, aligned, distributed, arrayed and reverted** with no
  new commands, because it is a fixture. §14.4's *"you can select a musician and a mover together
  and align them"* is not a feature to build; it is what falls out.
- **`rig.list` and `fixture.get` return objects.** An agent asked to *"put the drummer behind the
  centre spoke"* uses the same vocabulary it uses for fixtures. ADR-0025's marks ride along
  unchanged.
- **A definition with an empty DMX mode is now a first-class arrival**, not an error. `gdtf-ts` must
  return zero bindings without complaint — the `<DMXChannels/>` case. That is one guard, and it is
  the same one ADR-0030 rule 5 already needs for an unresolved mode.
- **The human proxy is visibly a box, and that is the design.** Anyone who wants a person-shaped
  person downloads EMEX7's profile or waits for GLB import.
