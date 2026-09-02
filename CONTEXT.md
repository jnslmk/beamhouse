# Beamhouse

A live lighting visualiser: it reads a rig from a console's patch, places it in 3D, and renders
what the DMX stream is doing to it right now. It never sends DMX — it only listens.

## Language

### The rig

**Rig**:
The set of physical lighting devices for one show, hung and addressed.
_Avoid_: setup, plot, install

**Fixture**:
One addressable device in the rig — a single mover, a single tube. Identified by an integer
**fixture id**, the key everything else in Beamhouse refers to a fixture by
([ADR-0003](docs/adr/0003-fixture-id-is-the-only-identity.md)). A console patch always supplies
one; **MVR does not have to** — its mandatory key is a UUID and its `FixtureID` is an optional
string — so on MVR ingest the id comes from a ladder and a synthesised one is surfaced, never
silent ([ADR-0020](docs/adr/0020-the-live-loop-serves-patch-files-not-consoles.md)).
_Avoid_: lamp, head, instrument, device, unit

**Definition**:
The device-model description a fixture is an instance of: its geometry, its DMX modes, its
attributes. A `.gdtf` file holds exactly one. Six movers of the same model share one definition.

**[sharpened 2026-09-02 — #39]** One file, one definition — but *not* one definition, one file. A
`gdtf:` id is a `FixtureTypeID`, which names a fixture **type**: measured over GDTF Share's 12,623
revisions, 1,681 of those UUIDs cover more than one file, up to 17
([ADR-0030](docs/adr/0030-gdtfspec-resolves-inside-the-archive.md)). Which of them you resolved is a
**Revision**.
_Avoid_: profile, personality, "the GDTF" (when the concept rather than the file is meant)

**Mode**:
One named DMX layout a definition offers, fixing how many channels the fixture occupies and what
each one controls. A fixture is patched in at most one mode — exactly one in the normal case, and
**none** when the source named a mode the definition does not offer, which leaves the fixture
placed and rendered but with no DMX binding
([ADR-0030](docs/adr/0030-gdtfspec-resolves-inside-the-archive.md)).
_Avoid_: personality, channel mode

**Revision**:
One dated edit of a **definition**, labelled by the last `<Revision>` element's `Text` — document
order, never latest date. It is what distinguishes two files sharing a `FixtureTypeID`, and
revisions genuinely differ: 606 of the 1,681 shared UUIDs have revisions whose mode sets differ,
and 134 carry the same mode *name* at a different DMX footprint. A patch may carry a revision as a
**hint** for reconciliation; nothing resolves, selects or arrays on it
([ADR-0030](docs/adr/0030-gdtfspec-resolves-inside-the-archive.md)), the same standing ADR-0020
gives the MVR fixture UUID.
_Avoid_: version, release

**Library**:
A resolvable collection of definitions, addressed by a prefix — `gdtf:`, `ofl:`, `qlc:`, `bhs:`.
What a patch's definition ids are looked up against. An **MVR is the exception that needs none**:
its `<GDTFSpec>` is a file inside its own archive, so an MVR is a self-contained patch source and
resolves with no library present at all
([ADR-0030](docs/adr/0030-gdtfspec-resolves-inside-the-archive.md)) — which is what lets a dropped
`.mvr` work in the M3a viewer. `bhs:` is Beamhouse's own
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)): definitions
carried inside a `.bhs` rather than resolved from a path, reachable **only through a Local
fixture**, and declaring geometry and emitter layout but never optics — a definition that describes
*light* is an authored GDTF
([ADR-0038](docs/adr/0038-bhs-binds-one-way-through-a-local-fixture.md)). **A share link needs no library at
all** — a **snapshot** resolves its definitions inline, so `bhs:` stopped being the only kind that
survives a shared URL and became the shape every kind now takes there
([ADR-0031](docs/adr/0031-a-share-link-carries-resolved-definitions.md)).
_Avoid_: definition source, provider, fixture library

### The scene

**Scene**:
The rig as Beamhouse knows it: patch plus placement. Not a file format and not a three.js
`Scene` — say "scene graph" when you mean the renderer's tree.
_Avoid_: show, plot, rig state

**Patch**:
The half of the scene that says which fixtures exist, which definition and — where it resolved —
which **mode** each uses, and where each is addressed. Authored in the console and read by Beamhouse — with one bounded
exception, the **local fixture**
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).
_Avoid_: patch sheet, fixture list

**Patch source**:
Where a patch comes from. Two independent axes, and conflating them is the mistake
([ADR-0021](docs/adr/0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)).

**Format** is the interface — `parse(bytes) -> Patch`, with `mizer`, `mvr` and `snapshot`.
**Delivery** is how the bytes arrive — watched, one-shot or inline — and is deliberately *not* part
of it, which is why watching an MVR in `shows/` costs nothing and why a pushing station would reuse
the `mvr` parser unchanged.

The **live** predicate cuts across both: any patch file that (i) sits on a watchable path and (ii)
names its definitions in a **Library** Beamhouse resolves — repatch, save, and the rig updates with
the socket still live ([ADR-0020](docs/adr/0020-the-live-loop-serves-patch-files-not-consoles.md)).
Mizer's project YAML is the only *console* source that passes; BlinderKitten and MagicQ fail (ii),
because both flatten a definition into their own channel model. An MVR **file** serves design and
previz tools rather than consoles — no console measured writes one — and is live or not depending
only on whether it sits somewhere watchable.

A source **produces** a patch. Drag-and-drop is a *delivery* onto the `mvr` parser, and `bhs:`
local fixtures are a **merge contribution** — they add to a patch and can never be the only thing
present. Say "patch source", not "console": the predicate is about the file, not the product.
_Avoid_: console (when the file is meant), import path, patch reader

**Ingest**:
One reading of a **patch source** into the scene — a watcher firing, a picker, a drag-and-drop, a
URL fragment. It is **the only writer of the `patch`**, as a **command** is the only writer of
everything else in the `.bhs`
([ADR-0026](docs/adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)).
Not undoable: it is an **event** in the **journal**, because §4.6's watcher fires without anyone
asking and the previous bytes were never kept. Every **issue** originates in one, which is why the
count rides the **Patch** chip ([ADR-0023](docs/adr/0023-the-chip-bar-is-the-navigation.md)).
_Avoid_: import, load, reload, sync

**Placement**:
The half of the scene that says where each fixture sits in space — position and orientation.
Authored in Beamhouse and nowhere else. It is a **rigid transform and nothing more**: placement
never creates an emitter, and its rotation pivots about the definition's own origin, never a
resolved bounding-box centre, which would drift as a mover's head tilts
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).
_Avoid_: position (that is one component of a placement), layout, transform

**Local fixture**:
A fixture that exists only in Beamhouse — carrying a definition *and* its own universe and
address, with no entry in any console's patch. What describes pixels that reach the rig from a
second source, such as gled2 streaming Art-Net alongside Mizer. Its **fixture id is negative**,
which Mizer's `u32` cannot represent, so it can never collide with a console's
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)) — and it is
**minted, never typed**, from one allocator shared with scene objects
([ADR-0039](docs/adr/0039-definition-authoring-has-no-surface-of-its-own.md)). It is a **slot
range, not a universe**, and may name any resolvable definition id, not only a `bhs:` one; it is
also the **only** way a `bhs:` definition is ever reached
([ADR-0038](docs/adr/0038-bhs-binds-one-way-through-a-local-fixture.md)).
_Avoid_: virtual fixture, synthetic fixture, unpatched fixture

**Scene object**:
A stage, truss, screen or human proxy — scale reference, not a lamp. It is **a fixture with an empty
DMX mode**, which is the GDTF format's own answer and not a metaphor: `EMEX7`'s seven `Person …`
profiles on GDTF Share carry zero attributes, zero emitters and an empty `<DMXChannels/>`. So it
resolves through the definition path, carries a **placement**, and is told apart from a lamp by one
predicate — **it has no address**. There is no object model, no object keyspace and no `objects`
block ([ADR-0035](docs/adr/0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md)). It **never
emits, never occludes and never receives**: the **ground plane** is the only surface light reaches
([ADR-0036](docs/adr/0036-the-ground-plane-is-the-only-surface-light-reaches.md)).
_Avoid_: prop, scenery, venue geometry, mesh

**Ground plane**:
The implicit surface at `y = 0`. It is **not** a scene object — it exists whether or not anything is
placed, which is what keeps the **pool** a render decision independent of scene content, and it is
the only surface v1 draws light on.
_Avoid_: floor object, stage (that is a placeable `Cube`)

**Pool**:
The beam's ellipse on the **ground plane** — grandMA3's *spot reflection*, an effect rather than a
lighting solution. **Additive, and not the cone's end**: the cone keeps ADR-0013's soft falloff and
no geometric terminus. Sized by `BeamAngle` against throw distance, edge-softened by `FieldAngle`
only where the two differ, shaded by resolved `Dimmer × LinearRGB`. Samples no `density(p)`, and is
**not in the intensity map**.
_Avoid_: spot reflection (that is grandMA3's name for it), floor wash, light pool

**Override**:
A placement stored apart from the patch and keyed by fixture id, so that re-reading a changed
patch merges into it instead of destroying it.
_Avoid_: edit, adjustment, offset

**Array**:
A placement generated from parameters — a count, a radius, an angle step — rather than authored
per fixture. Its members are fixture ids. Stays live: change a parameter and its members move.
_Avoid_: group (that is a console-side selection concept), pattern

### Addressing

**Universe**:
512 slots of DMX, identified by a number, delivered as one packet per frame. **The number is
always the sACN one** — a flat 1–63999, counting from 1 ([ADR-0007](docs/adr/0007-one-universe-space-sacn-numbered.md)).
Beamhouse has exactly one universe space, so a universe number never depends on which transport
carried it.
_Avoid_: port-address (that is Art-Net's own number, and a different one)

**Port-Address**:
Art-Net's own name for a universe number: 15 bits as Net : Sub-Net : Universe, counting from
**0**. Always written with the `Art-Net` prefix when the concept rather than the universe is
meant, because it is off by one from the **universe** it maps to — Port-Address *p* is universe
*p* + 1. Only the **bridge** ever sees one.
_Avoid_: universe (that is the merged, sACN-numbered one), art-net address

**Source**:
One sender of one **universe**, identified within that universe by its sACN CID or, on Art-Net
where no CID exists, by its source IP ([ADR-0029](docs/adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)).
Priority, `Preview_Data`, the stale threshold and the out-of-order count are all properties of a
**source**, never of the universe it sends to. A source sending several universes appears once in
each. Only the **bridge** ever sees one.
_Avoid_: sender, node, console (a console is one kind of source; gled2 is another)

**Contended**:
A **universe** with more than one **source**. The frame is last-writer-wins, so what is rendered
is true of the wire and true of no single console. Beamhouse **detects** contention and never
resolves it ([ADR-0029](docs/adr/0029-the-bridge-detects-contention-and-never-arbitrates.md)) —
the fixtures on the universe are marked *disputed*, which is a different claim from **stale**'s
*old*. Derived from the source list, never carried as its own flag.
_Avoid_: merged, conflicted, HTP/LTP (Beamhouse performs no merge, so it has no merge mode)

**Slot**:
One byte within a universe, identified by its 1-based position. What travels on the wire.
_Avoid_: channel, address, DMX value

**Address**:
The first slot a **break** occupies in a universe. What an operator sets on the fixture itself. A
fixture has one per break, so a fixture with more than one break has more than one address and may
sit in more than one universe ([ADR-0011](docs/adr/0011-a-fixture-is-addressed-per-break.md)). A
single-break fixture — the common case, and the only one a Mizer patch can express — has exactly
one.
_Avoid_: start channel, DMX address, "the fixture's universe" (a fixture need not have just one)

**Channel**:
A definition-level control: one attribute, bound to one or more slot offsets and given meaning
by its channel functions. Channels belong to a mode; slots belong to a universe. A 16-bit Pan is
one channel across two slots.
_Avoid_: slot, parameter

**Break**:
A sub-range of a fixture's channels carrying its own **universe** and **address**, independent of
every other break of the same fixture. What makes a pixel fixture's repeats addressable, and the
only reason a fixture can span universes. GDTF declares breaks and MVR addresses them; a Mizer
patch has exactly one per fixture.
_Avoid_: offset, sub-fixture (that is Mizer's control grouping, which shares one universe)

**Attribute**:
What a channel controls, named from GDTF's taxonomy — `Dimmer`, `Pan`, `ColorAdd_R`, `Zoom`.
The vocabulary in which resolved values are expressed.

### Resolution and rendering

**Resolve**:
To turn raw slot values into attribute values — degrees of pan, hertz of strobe — by applying a
fixture's channel bindings. Always this word; never "decode" or "parse", which are about bytes and
XML respectively. Resolution is **total**: every channel function resolves, to a value carrying the
unit that gives it meaning, and that unit may be dimensionless
([ADR-0010](docs/adr/0010-resolution-is-total-the-renderer-selects-by-attribute.md)). So a resolved
value is not always a *physical* one — a shutter's open/closed carries no quantity and still
resolves.
_Avoid_: decode, interpret, apply

**Consumed attribute**:
One of the eight attributes the renderer actually reads — `Pan`, `Tilt`, `Zoom`, `ColorAdd_R/G/B`,
`Dimmer`, `Shutter1`. Every *other* attribute still **resolves**; it simply has no consumer. The
pair of words is the point: "unresolved" describes nothing in Beamhouse, and saying it hides that
the value exists and is correct.
_Avoid_: supported attribute, known attribute, handled attribute (all imply the others fail)


**Colour space**:
Which real-world colours a definition's `R`, `G`, `B` name — primaries plus white point. GDTF
declares it per definition and defaults it to sRGB; OFL has no equivalent concept. Distinct from
**transfer function**, and the two are never called "colour handling" jointly. v1 **assumes the
primaries** and reads neither the declared space nor the gamut — but it does read a **white
point**, where a fixture has no `ColorAdd_*` channels and its colour therefore comes from a
declared `<Beam ColorTemperature>`
([ADR-0037](docs/adr/0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md) amending
[ADR-0008](docs/adr/0008-colour-space-is-assumed-transfer-function-is-read.md) rule 5). The two
halves of this term are therefore sourced differently, and saying "the colour space is assumed"
is now imprecise: the primaries are.
_Avoid_: gamut (that is the polygon a colour space encloses, which GDTF names separately), colour
profile

**Transfer function**:
Whether a channel value is proportional to radiance or perceptually encoded. Independent of
**colour space**: a definition can name sRGB primaries and still be linear in radiance
([ADR-0008](docs/adr/0008-colour-space-is-assumed-transfer-function-is-read.md)).
_Avoid_: gamma, colour curve, linearity

**Fixture model**:
The format-neutral internal representation both definition readers converge on — geometry tree
plus channel bindings — so the renderer never learns whether a fixture came from GDTF or OFL
([ADR-0001](docs/adr/0001-gdtf-and-ofl-as-definition-formats.md)). It is a **Beamhouse** type, not
a `gdtf-ts` one: `gdtf-ts` emits a GDTF-shaped result and Beamhouse converges it
([ADR-0004](docs/adr/0004-gdtf-ts-is-a-published-gdtf-only-package.md)).
_Avoid_: fixture definition (that is the file), resolved fixture (collides with **resolve**),
internal model

**Emitter**:
Any geometry in a definition that gives off light — a beam origin or a single pixel. The unit
colour is resolved for, which is why "every emitter is RGB in v1" covers movers and tape alike.
**Every** emitter has an emissive body; only a cone-drawing **`BeamType`** adds a **beam class**
cone on top ([ADR-0022](docs/adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md)).
The body is sized from the declared `BeamRadius`, or in OFL — which has none — from
`physical.dimensions`, or per **pixel** from `physical.matrixPixels.dimensions`; where a
definition declares no size at all, nothing is invented and the fixture renders the fixed marker
([ADR-0043](docs/adr/0043-ofl-sole-emitter-draws-the-cone.md),
[ADR-0034](docs/adr/0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md)).
_Avoid_: light, lamp, LED

**Pixel**:
An emitter that belongs to a strip-class fixture, arising from a repeated geometry in the
definition. A tube of N pixels has N of them. Not a screen pixel and not a texel.
_Avoid_: LED, segment, cell

**Beam class**:
The rendering class for an emitter whose `Beam` geometry declares a cone-drawing **`BeamType`** —
`Wash`, `Fresnel`, `PC`, `Spot` or `Rectangle` — rendered as a volumetric cone from that emitter's
origin ([ADR-0022](docs/adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md)).
Declaring a `Beam` geometry is *not* the test: `None` and `Glow` declare one and draw no cone, and
reading it that way rendered the 30-pixel strip as thirty cones. Not one of two exclusive paths —
the cone is **added to** the emissive body every emitter already has, which is why a `Wash` mover
is visible before any **atmosphere** exists to scatter in.
**OFL has no `BeamType`**, so the class is selected there on the only per-emitter signal the
format carries: an OFL fixture's **sole** emitter is beam class where `physical.lens.degreesMinMax`
is declared, and a **pixel** never is
([ADR-0043](docs/adr/0043-ofl-sole-emitter-draws-the-cone.md)). Same shape, same absence of a
precedence clause — the **fixture model** carries the resolved class, so nothing downstream of the
two adapters knows which format it came from.
_Avoid_: mover, moving head, spot (those are fixture kinds, not rendering classes — which is why
OFL's `categories` selects nothing: `["Dimmer"]` alone is a Cameo Q-Spot *and* a dimmer pack),
beam geometry (a `Beam` node is an emitter; its `BeamType` is what selects this class)

**Cone angle**:
The **full** angle of a **beam class** fixture's volumetric cone — apex to apex, not apex to axis
([ADR-0013](docs/adr/0013-atmosphere-is-one-closed-form-scattering-term.md)). Sourced from
**three** places, in precedence order: a **resolved** `Zoom` where the DMX mode has one, per
tick; then a **per-fixture override**, per hang; then the definition's static `BeamAngle` — or in
OFL, `physical.lens.degreesMinMax`, taking its narrow end where the two differ
([ADR-0037](docs/adr/0037-a-dimmer-pack-is-not-a-fixture-its-loads-are.md),
[ADR-0043](docs/adr/0043-ofl-sole-emitter-draws-the-cone.md)). The middle one is a
**manual** setting the console cannot see and DMX cannot express — a barrel-set zoom, a gel, a
gobo — supplied as the value of a channel with no DMX offset, and stored beside the placement
**override** rather than inside it, which is what keeps **placement** a rigid transform and
nothing more. Distinct from `FieldAngle`, which shapes the **edge falloff** only where the two
differ, degenerating to the `BeamType` soft/hard edge when they are equal — which is five of the
six profiles on disk, and 271 of the 400 OFL fixtures that declare a lens angle.
_Avoid_: half-angle (it is not one; this repo said so at six sites and every cone would have
rendered twice too wide), beam angle (that is the static declaration, only one of the three
sources), spread, zoom

**Strip class**:
The rendering class for a **one-dimensional** pixel run: rendered as one continuous emissive
surface sampled along its length, not as N separate lamps. A run is grouped by **constant DMX
offset stride** among sibling emitters of one fixture — never by even spatial spacing, which real
definitions do not have ([ADR-0005](docs/adr/0005-emitter-grouping-is-by-dmx-stride.md)). A strip
never crosses a fixture boundary. Grouping runs **only within the non-cone set** — `BeamType`
selects the path first, stride aggregates within it, so the two rules never claim the same emitter
([ADR-0022](docs/adr/0022-beamtype-selects-the-path-stride-aggregates-within-it.md)). The geometry
that carries the run's texture is the run's **common parent**, not the referenced emitter. Where the fixture came from OFL there is no geometry tree, so the extent is the emissive
body ADR-0043 rule 5 sizes from `physical.dimensions`, and the count tiles it
([ADR-0044](docs/adr/0044-an-ofl-strips-extent-is-its-declared-body.md)) — the strip class places no
lamps, so nothing else is inferred.
_Avoid_: tape, tube, bar, pixel bar (those are fixture kinds)

**Matrix class**:
The rendering class for a **two-dimensional** pixel grid — the same emissive surface carrying an
`M × N` texture rather than an `N` one. Distinct from **strip class** to a human describing a rig,
identical to the renderer: one material, one draw call per fixture, interpolation across both
axes. Not *one shader* — neither class carries a hand-written shader; the texture is a `map` on a
stock material, and the beam pair is the project's only GLSL
([ADR-0017](docs/adr/0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md)).
_Avoid_: panel, grid, pixel map, third rendering class (there is no third path)

**Atmosphere**:
The participating medium the beams scatter off — a property of the **scene**, never of a fixture,
carried as one scene-wide density
([ADR-0013](docs/adr/0013-atmosphere-is-one-closed-form-scattering-term.md)). "Haze" and "fog" name
the same single thing here and are never split into two. A hazer in the rig is a **fixture** like
any other and does not supply it: the one on this rig resolves `Fog1` to a constant.
_Avoid_: haze, fog, smoke, participating media (all fine in prose about the real world, none of
them a second concept)

**Scattering term**:
The closed-form single-scattering integral that makes a **beam class** cone visible in
**atmosphere**. Closed-form because it drops extinction and uses an isotropic phase function; the
deferred high-fidelity tier is everything needing more than one sample of the density function.
_Avoid_: volumetrics, raymarch, god rays (those name the deferred tier, not this)

**Proxy geometry**:
The mesh generated from a definition's declared primitive. Schematic but positionally correct —
right positions, right beam angles, right colours. **Not a fallback**: measured 2026-09-02, not
one definition on this rig ships a mesh, so this is the render path on every screen including the
operator's own ([ADR-0031](docs/adr/0031-a-share-link-carries-resolved-definitions.md)).
_Avoid_: placeholder, fallback mesh, stub, **degraded** (there is no rung it degrades from)

**Intensity map**:
The diagnostic render mode that shades each emitter by its **resolved per-emitter intensity**, for
spotting a fixture at 3% that should be at 30%. Explicitly **relative** — it compares emitters
within one frame, carries no unit, and makes no photometric prediction, because v1 renders no venue
geometry for lux to land on ([ADR-0019](docs/adr/0019-the-intensity-map-is-relative-not-photometric.md)).
_Avoid_: **false colour** (the field's term for an illuminance reading Beamhouse cannot compute),
heat map, dimmer view

### The pipeline

**Gateway**:
A device that converts a network universe into wired DMX — what the retired CueCore2 was. It is
**not** a **Bridge**: a gateway carries a universe *outward* to fixtures, a bridge carries it
*inward* to the browser, and only the bridge is Beamhouse's. Nothing in Beamhouse addresses,
configures or models a gateway; it matters only because a universe with no gateway reaches no
wired fixture — which is Beamhouse universe 1's state since the CueCore2 was retired
([#44](https://github.com/jnslmk/beamhouse/issues/44)). A replacement must speak **sACN**, or that
universe returns to Art-Net and reopens the cross-transport collision
[ADR-0029](docs/adr/0029-the-bridge-detects-contention-and-never-arbitrates.md) closed.
_Avoid_: bridge (that is the Beamhouse process), node, interface, DMX box

**Bridge**:
The process that listens on the show network and forwards raw universes to the browser, merging
every transport into one **universe space**. It knows nothing about fixtures, definitions or the
scene — that ignorance is the design, and it is enforced by the toolchain rather than by
language ([ADR-0006](docs/adr/0006-bridge-is-typescript-on-bun.md)). The only component that
knows how a universe arrived.
_Avoid_: server, sidecar, daemon, backend, native process (it is no longer one)

**Feed**:
Where frames come from, as one pluggable interface with three implementations in v1 — live,
recorded and generated ([ADR-0009](docs/adr/0009-deployment-is-inferred-from-origin.md) removed
the undefined `relay`; [ADR-0014](docs/adr/0014-the-agent-surface-is-two-surfaces.md) filled the
slot with `generated`). Distinct from an **sACN source**, which is E1.31's own term for a
transmitting device and is always written with the `sACN` prefix.
_Avoid_: source (unqualified), stream, input, relay

**Generated feed**:
The **feed** whose frames are *computed* rather than received from the network or read from
storage. Two callers: a seeded chase for a shared link, and an agent holding a **look**. It is
what "the agent surface" turned out to mean on the feed side
([ADR-0014](docs/adr/0014-the-agent-surface-is-two-surfaces.md)).
_Avoid_: injected feed, synthetic feed, fake feed, agent feed

**Look**:
One **frame** held rather than streamed — a lighting state, in DMX slot values, standing still.
Never a synonym for **scene**, which is the physical arrangement of the rig: a look changes what
the fixtures are *doing*, a scene changes where they *are*. A look is what an agent sets before it
captures.
_Avoid_: cue, state, snapshot, scene

**Frame**:
One tick's worth of slot values for every subscribed universe, timestamped. The unit a feed
delivers and a recording stores.
_Avoid_: packet (that is one universe on the wire), update

**Recording**:
A stored sequence of frames, replayable through the same feed interface as live data. Every frame is
a complete state, so any frame is independently renderable and seeking is the same operation as
playing ([ADR-0041](docs/adr/0041-a-bhr-is-a-sequence-of-independently-decompressible-members.md)).
One reachable from a share link is **deployment material** — committed and shipped in the build, not
carried by the link ([ADR-0040](docs/adr/0040-a-recording-is-deployment-material-and-the-bridge-records-it.md)).
_Avoid_: capture, playback file, track

**Recording transport**:
The viewport overlay that states a **recording**'s position and lets you scrub it — the same element
on the desktop and on both phone orientations
([ADR-0042](docs/adr/0042-the-transport-is-a-viewport-overlay.md)).

**Always written with the qualifier.** The bare word `transport` is taken: it is a §07 field and a
§13.2 column meaning **sACN or Art-Net** — how a universe arrived. That sense is on the wire and
keeps the bare word; this one never gets it.
_Avoid_: transport (unqualified), player, scrubber, timeline bar, playback controls

**Stale**:
A universe the bridge has heard nothing on for longer than **its transport's** threshold — 2.5 s
for sACN, ~6 s for Art-Net, which differ because Art-Net re-transmits an unchanging input only
every ~4 s ([ADR-0018](docs/adr/0018-signal-health-is-one-per-universe-snapshot.md)). A **fixture**
is stale if *any* of its breaks' universes is stale, and renders wholly stale
([ADR-0011](docs/adr/0011-a-fixture-is-addressed-per-break.md)). It is a **trust** signal — "do not
believe this" — never a statement that the fixture is dark.
_Avoid_: offline, disconnected, dead, timed out, dropped

**Signal health**:
The collected facts about a universe's arrival — stale, transport, rate, priority, blind,
out-of-order drops. A property of the **feed**, not the renderer: unreachable rather than false on
a recorded or generated feed, and absent entirely in the Pages viewer, which has no bridge to ask
([ADR-0018](docs/adr/0018-signal-health-is-one-per-universe-snapshot.md)).
_Avoid_: status, diagnostics (that is the wider panel), telemetry, monitoring

**Control channel**:
The non-frame traffic on the bridge's socket — file-reload notices, scene snapshots, and the
**request** envelopes an agent sends. The bridge **forwards envelopes it never opens**, which is
how it carries scene traffic while staying ignorant of fixtures
([ADR-0015](docs/adr/0015-agent-control-is-mcp-over-the-bridge-control-channel.md)). Bulk never
rides it: a **capture** returns a handle fetched over HTTP
([ADR-0028](docs/adr/0028-a-capture-is-a-handle-fetched-over-http.md)).
_Avoid_: command socket, RPC, control plane, API

**Request**:
One envelope on the **control channel**, in exactly one of four classes — **`command`** (mutates
the scene, undoable), **`query`** (reads, and moves the undo cursor), **`capture`**, and
**`look`** (sets the **generated feed**). Only `command` is the command layer, so the agent's
vocabulary is strictly *larger* than it
([ADR-0026](docs/adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)).
Never a synonym for **command**: ADR-0015 used "command envelope" for all four and that is the
overload this term exists to end.
_Avoid_: message, call, RPC, command (unqualified)

**Query**:
A **request** that reads and mutates nothing — the rig, the issues, the universes, the journal —
and, by the same test, `undo`/`redo`, `select`, `hold` and `camera.set`, which move a cursor or the
human's view rather than the scene. **Every query returns the marks**
([ADR-0025](docs/adr/0025-trust-and-provenance-marks-are-additive.md)) alongside the data.
_Avoid_: get, fetch, read (unqualified), inspection

**Command**:
One **undo-grained** mutation of the scene — one command, one undo entry, one thing a person would
say out loud. The unit *both* the editing UI and an agent produce, because they are two front-ends
onto one layer rather than two paths into scene state
([ADR-0016](docs/adr/0016-every-scene-mutation-is-one-undo-grained-command.md)). A drag is one
command, committed on release. It **carries its target ids**: the selection and the snap step are
UI-side inputs that fill them, never part of the command. Commands write everything in the `.bhs`
**except `patch`**, which only an **ingest** writes — two writers, disjoint targets, which is what
keeps §4.6's watcher from pushing entries onto the undo stack
([ADR-0026](docs/adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)).
One kind of **request**, not the whole of it.
_Avoid_: action, operation, edit, mutation, transaction

**Journal**:
The record of everything that changed the scene, in two row kinds — **commands**, where the undo
cursor stops, and **events**, which are **ingests** and are not undoable. Agent-driven rows are
marked, and there is **one stack shared by both front-ends**, because *"undo the last thing that
happened"* is the only question anyone asks at 4pm
([ADR-0026](docs/adr/0026-the-control-channel-carries-requests-only-one-class-is-a-command.md)).
Surfaced as the overlay's **History** tab.
_Avoid_: log, audit trail, undo stack (that is one of its two row kinds)

**Owning client**:
The single connected page that holds the scene and applies **commands**. The bridge deployment
serves the LAN, and each page keeps its own working state, so without one owner a broadcast
command would leave every client saving a different `.bhs`. Ownership is about who may *write*;
every other client still views. **Claimed implicitly by the first connection**, taken over in one
click, released on socket close or ~15 s of silence; a **non-owner** adopts the owner's scene,
follows its commands, and has its auto-save **suspended** — the divergence was the saving, not the
following ([ADR-0027](docs/adr/0027-ownership-is-implicit-and-a-non-owner-stops-saving.md)). Not
contended between the human and the agent: the MCP server is a client of the **control channel**
and the owning *page* applies its requests, so one tab plus an agent has no contention at all.
_Avoid_: primary, leader, master, host, active tab

### Delivery

**Build**:
One output of the toolchain. There are exactly two — the `app` build, whose bytes serve both the
bridge and Pages, and the `single` build, which inlines everything into one `.html`
([ADR-0009](docs/adr/0009-deployment-is-inferred-from-origin.md)). Never a synonym for
**deployment**: two builds serve three deployments, and conflating them is what made
`DESIGN.md` §09's "one build, three deployments" unfalsifiable.
_Avoid_: bundle, target, artifact

**Deployment**:
The situation a running Beamhouse page finds itself in — bridge-local, Pages viewer, or single
file — which fixes what it may assume is reachable. **Inferred at runtime from the page's own
origin, never compiled in**, so it is a property of where the page came from rather than of how
it was built.
_Avoid_: environment, mode, build, target

**Viewer**:
Any **deployment** with no live **feed** — the Pages one and the single file. Names the pair
without implying a separate **build**: viewer capabilities ship in every build and are merely
unreachable where a bridge is present. It is **read-only** — tap-to-select and orbit, no command
layer and so no agent surface either — and its chip set is `Selection` and `Camera`, because
**a chip earns its place by being actionable**
([ADR-0032](docs/adr/0032-the-m3a-viewer-is-read-only.md)).
_Avoid_: static build, share build, read-only mode (the *deployment* is the noun; read-only is
one of its properties)

**Snapshot**:
The one **patch** variant that carries no path: a resolved patch inline, plus its definitions
resolved inline beside it — primitive, beam angle, emitter count, pitch, bounding box, channel
bindings. What a share link contains, and the reason a **viewer** needs no **library**. It is
**frozen**: an updated definition never reaches an already-sent link, so the viewer states the
snapshot's age rather than its completeness
([ADR-0031](docs/adr/0031-a-share-link-carries-resolved-definitions.md)).
_Avoid_: export, resolved patch (that names half of it), bundle
