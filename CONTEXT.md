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
**fixture id**, which is the only key both a console patch and an MVR file can supply, and
therefore the key everything else in Beamhouse refers to a fixture by.
_Avoid_: lamp, head, instrument, device, unit

**Definition**:
The device-model description a fixture is an instance of: its geometry, its DMX modes, its
attributes. A `.gdtf` file holds exactly one definition. Six movers of the same model share one
definition.
_Avoid_: profile, personality, "the GDTF" (when the concept rather than the file is meant)

**Mode**:
One named DMX layout a definition offers, fixing how many channels the fixture occupies and what
each one controls. A fixture is patched in exactly one mode.
_Avoid_: personality, channel mode

**Library**:
A resolvable collection of definitions, addressed by a prefix — `gdtf:`, `ofl:`, `qlc:`, `bhs:`.
What a patch's definition ids are looked up against. `bhs:` is Beamhouse's own
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)): definitions
carried inside a `.bhs` rather than resolved from a path, which is why they are the only kind that
survives a shared URL.
_Avoid_: definition source, provider, fixture library

### The scene

**Scene**:
The rig as Beamhouse knows it: patch plus placement. Not a file format and not a three.js
`Scene` — say "scene graph" when you mean the renderer's tree.
_Avoid_: show, plot, rig state

**Patch**:
The half of the scene that says which fixtures exist, which definition and mode each uses, and
where each is addressed. Authored in the console and read by Beamhouse — with one bounded
exception, the **local fixture**
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).
_Avoid_: patch sheet, fixture list

**Placement**:
The half of the scene that says where each fixture sits in space — position and orientation.
Authored in Beamhouse and nowhere else. It is a **rigid transform and nothing more**: placement
never creates an emitter, and its rotation pivots about the definition's own origin, never a
resolved bounding-box centre, which would drift as a mover's head tilts
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).
_Avoid_: position (that is one component of a placement), layout, transform

**Local fixture**:
A fixture that exists only in Beamhouse — carrying its own `bhs:` definition *and* its own
universe and address, with no entry in any console's patch. What describes pixels that reach the
rig from a second source, such as gled2 streaming Art-Net alongside Mizer. Its **fixture id is
negative**, which Mizer's `u32` cannot represent, so it can never collide with a console's
([ADR-0012](docs/adr/0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).
_Avoid_: virtual fixture, synthetic fixture, unpatched fixture

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
**transfer function**, and the two are never called "colour handling" jointly.
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
_Avoid_: light, lamp, LED

**Pixel**:
An emitter that belongs to a strip-class fixture, arising from a repeated geometry in the
definition. A tube of N pixels has N of them. Not a screen pixel and not a texel.
_Avoid_: LED, segment, cell

**Beam class**:
The rendering class for a fixture whose definition declares a `Beam` geometry: rendered as a
volumetric cone from that emitter's origin. One of the two *rendering paths* v1 handles; the
other is the emissive surface shared by **strip class** and **matrix class**.
_Avoid_: mover, moving head, spot (those are fixture kinds, not rendering classes)

**Cone angle**:
The **full** angle of a **beam class** fixture's volumetric cone — apex to apex, not apex to axis
([ADR-0013](docs/adr/0013-atmosphere-is-one-closed-form-scattering-term.md)). Sourced from the
definition's static `BeamAngle`, overridden per tick by a **resolved** `Zoom` where the DMX mode
has one — the only renderer input fed by both a static declaration and a live channel. Distinct
from `FieldAngle`, which shapes the **edge falloff** only where the two differ, degenerating to
the `BeamType` soft/hard edge when they are equal — which is five of the six profiles on disk.
_Avoid_: half-angle (it is not one; this repo said so at six sites and every cone would have
rendered twice too wide), beam angle (that is the static declaration, only one of the two
sources), spread, zoom

**Strip class**:
The rendering class for a **one-dimensional** pixel run: rendered as one continuous emissive
surface sampled along its length, not as N separate lamps. A run is grouped by **constant DMX
offset stride** among sibling emitters of one fixture — never by even spatial spacing, which real
definitions do not have ([ADR-0005](docs/adr/0005-emitter-grouping-is-by-dmx-stride.md)). A strip
never crosses a fixture boundary.
_Avoid_: tape, tube, bar, pixel bar (those are fixture kinds)

**Matrix class**:
The rendering class for a **two-dimensional** pixel grid — the same emissive surface carrying an
`M × N` texture rather than an `N` one. Distinct from **strip class** to a human describing a rig,
identical to the renderer: one shader, one draw call per fixture, interpolation across both axes.
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
The stand-in mesh generated from a definition's declared primitive when no real model is
available. Schematic but positionally correct.
_Avoid_: placeholder, fallback mesh, stub

### The pipeline

**Bridge**:
The process that listens on the show network and forwards raw universes to the browser, merging
every transport into one **universe space**. It knows nothing about fixtures, definitions or the
scene — that ignorance is the design, and it is enforced by the toolchain rather than by
language ([ADR-0006](docs/adr/0006-bridge-is-typescript-on-bun.md)). The only component that
knows how a universe arrived.
_Avoid_: server, sidecar, daemon, backend, native process (it is no longer one)

**Feed**:
Where frames come from, as one pluggable interface with two implementations in v1 — live and
recorded ([ADR-0009](docs/adr/0009-deployment-is-inferred-from-origin.md) removed the undefined
third, `relay`). Distinct from an **sACN source**, which is E1.31's own term for a transmitting
device and is always written with the `sACN` prefix.
_Avoid_: source (unqualified), stream, input, relay

**Frame**:
One tick's worth of slot values for every subscribed universe, timestamped. The unit a feed
delivers and a recording stores.
_Avoid_: packet (that is one universe on the wire), update

**Recording**:
A stored sequence of frames, replayable through the same feed interface as live data.
_Avoid_: capture, playback file, track

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
unreachable where a bridge is present.
_Avoid_: static build, share build, read-only mode
