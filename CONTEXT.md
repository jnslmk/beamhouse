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
A resolvable collection of definitions, addressed by a prefix — `gdtf:`, `ofl:`, `qlc:`. What a
patch's definition ids are looked up against.
_Avoid_: definition source, provider, fixture library

### The scene

**Scene**:
The rig as Beamhouse knows it: patch plus placement. Not a file format and not a three.js
`Scene` — say "scene graph" when you mean the renderer's tree.
_Avoid_: show, plot, rig state

**Patch**:
The half of the scene that says which fixtures exist, which definition and mode each uses, and
where each is addressed. Authored in the console; Beamhouse only reads it.
_Avoid_: patch sheet, fixture list

**Placement**:
The half of the scene that says where each fixture sits in space — position and orientation.
Authored in Beamhouse and nowhere else.
_Avoid_: position (that is one component of a placement), layout, transform

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
512 slots of DMX, identified by a number, delivered as one packet per frame.

**Slot**:
One byte within a universe, identified by its 1-based position. What travels on the wire.
_Avoid_: channel, address, DMX value

**Address**:
The first slot a fixture occupies in a universe. What an operator sets on the fixture itself.
_Avoid_: start channel, DMX address

**Channel**:
A definition-level control: one attribute, bound to one or more slot offsets and given meaning
by its channel functions. Channels belong to a mode; slots belong to a universe. A 16-bit Pan is
one channel across two slots.
_Avoid_: slot, parameter

**Break**:
A sub-range of a fixture's channels that is addressed independently of the fixture's own
address. What makes a pixel fixture's repeats addressable.

**Attribute**:
What a channel controls, named from GDTF's taxonomy — `Dimmer`, `Pan`, `ColorAdd_R`, `Zoom`.
The vocabulary in which resolved values are expressed.

### Resolution and rendering

**Resolve**:
To turn raw slot values into physical attribute values — degrees of pan, hertz of strobe — by
applying a fixture's channel bindings. Always this word; never "decode" or "parse", which are
about bytes and XML respectively.
_Avoid_: decode, interpret, apply

**Emitter**:
Any geometry in a definition that gives off light — a beam origin or a single pixel. The unit
colour is resolved for, which is why "every emitter is RGB in v1" covers movers and tape alike.
_Avoid_: light, lamp, LED

**Pixel**:
An emitter that belongs to a strip-class fixture, arising from a repeated geometry in the
definition. A 35-pixel tube has 35 of them. Not a screen pixel and not a texel.
_Avoid_: LED, segment, cell

**Beam class**:
The rendering class for a fixture whose definition declares a `Beam` geometry: rendered as a
volumetric cone from that emitter's origin. One of the two classes v1 handles.
_Avoid_: mover, moving head, spot (those are fixture kinds, not rendering classes)

**Strip class**:
The rendering class for a collinear run of emitters: rendered as one continuous emissive surface
sampled along its length, not as N separate lamps. The other class v1 handles.
_Avoid_: tape, tube, bar, pixel bar (those are fixture kinds), matrix

**Proxy geometry**:
The stand-in mesh generated from a definition's declared primitive when no real model is
available. Schematic but positionally correct.
_Avoid_: placeholder, fallback mesh, stub

### The pipeline

**Bridge**:
The native process that joins the sACN multicast groups and forwards raw universes over a
WebSocket. It knows nothing about fixtures, definitions or the scene — that ignorance is the
design.
_Avoid_: server, sidecar, daemon, backend

**Feed**:
Where frames come from, as one pluggable interface with three implementations — live, relay,
recorded. Distinct from an **sACN source**, which is E1.31's own term for a transmitting device
and is always written with the `sACN` prefix.
_Avoid_: source (unqualified), stream, input

**Frame**:
One tick's worth of slot values for every subscribed universe, timestamped. The unit a feed
delivers and a recording stores.
_Avoid_: packet (that is one universe on the wire), update

**Recording**:
A stored sequence of frames, replayable through the same feed interface as live data.
_Avoid_: capture, playback file, track
