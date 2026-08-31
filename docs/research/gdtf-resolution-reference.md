# GDTF resolution algorithm: a specification mined from `mizer-gdtf-provider`

Ticket: jnslmk/beamhouse#3 (part of #1). Subject: `~/git-projects/Mizer/crates/components/fixtures/gdtf/`,
crate `mizer-gdtf-provider`, 663 lines of Rust hand-rolled over `zip` + `hard-xml`. All citations
below are `file:line` relative to that crate directory unless stated otherwise. Line numbers are
against the tree as read on 2026-08-31 (no local uncommitted changes were found).

Files read in full: `src/conversion.rs` (317), `src/definition.rs` (216), `src/lib.rs` (130),
`src/types/geometries.rs` (346), `src/types/mod.rs`, `src/types/dmx_offset.rs`,
`src/types/dmx_value.rs`, `src/types/feature_ref.rs`, `src/types/physical_unit.rs`,
`tests/load_fixtures.rs`, `examples/load_gdtf.rs`, `Cargo.toml`, plus the consumer crate's
`../src/definition.rs` (the `mizer_fixtures::definition` types this crate converts into) for
context on what the algorithm's output actually is.

**Headline finding, stated up front because it reframes the whole ticket:** this crate does not
solve the rendering/geometry half of the problem at all. It is a *console patch resolver* — it
turns a GDTF file into DMX-channel-to-fader mappings (`FixtureControls`, `FixtureChannelDefinition`)
for Mizer's programmer. It never reads a `Matrix`, `Position`, `PrimitiveType`, luminous flux,
beam angle, or lamp type attribute, and it never touches `models/gltf/*.glb`. A grep for
`Matrix|PrimitiveType|Position|LuminousFlux|BeamAngle|LampType|ChannelFunction|ModeMaster|colorSpace|Gamut|\.glb`
across `src/`, `examples/`, `tests/` returns **zero matches**. Section 6 below is the load-bearing
part of this document for planning purposes: it enumerates exactly what Beamhouse needs that has
no reference here.

## 1. Geometry tree walk — `visit_children` / `visit_child`

There are, in effect, **two** tree walks in this crate, and conflating them is the easiest way to
misread it.

### 1a. `ResolvedGeometry::resolve` — flattening `GeometryReference`

Before any walk relevant to `visit_children` happens, `Geometries::get_root`
(`types/geometries.rs:106-111`) resolves the *named* root geometry of a `DmxMode` into a
`DmxModeGeometry`, whose constructor calls `ResolvedGeometry::resolve` (`types/geometries.rs:268-272`,
dispatching to `GeometryType::resolve` at `types/geometries.rs:274-332`). This is a **recursive,
eager inline of every `GeometryReference`**: when it hits a `GeometryReference`, it looks up the
target geometry by name in the *flat* top-level `Geometries` list (`types/geometries.rs:334-338`,
note: `self.children.iter().find(...)` — this only searches **direct children of the document
root**, not the whole tree, so a `GeometryReference` pointing at a nested geometry would silently
fail the `.unwrap()` at `types/geometries.rs:317`) and substitutes a full clone of that subtree,
stamping the reference's own `dmx_breaks` onto the result (`types/geometries.rs:320`). The output
type, `ResolvedGeometryType`, mirrors the four GDTF geometry kinds (`Geometry`, `Beam`, `Axis`,
`GeometryReference` — where the resolved `GeometryReference` variant just wraps a boxed
`ResolvedGeometry`, i.e. it is *not* collapsed away, only its children are inlined).

**No transform accumulation happens here or anywhere else in the crate.** `Geometry`, `Beam`,
`Axis` structs (`types/geometries.rs:64-104`) carry only `Name`, an optional `Model` string, and
children — no `Matrix` attribute is parsed at all. This is expected for a console: Mizer never
needs to know where a fixture's yoke sits in space, only which DMX channel drives which control.
It means **Beamhouse gets nothing here for §5.1's "accumulating transforms down the tree"** — that
part of the port has to be built from the GDTF spec directly (`Matrix` is a `Position` XML
attribute containing a row-major 4×4, present on `Geometry`/`Beam`/`Axis`/`GeometryReference`
elements in real files even though this crate ignores it).

### 1b. `visit_children` / `visit_child` — sub-fixture discovery

This is the walk the ticket actually names, and it operates on the *IGeometry* trait objects
(`DmxModeGeometry` / `ResolvedGeometry`, both implement `IGeometry`, `types/geometries.rs:134-191`),
not on raw GDTF geometry structs. It runs only after `build_fixture_mode` has found the "lowest
common parent" of all beam-bearing geometry (§3 below) and exists to produce **one sub-fixture per
distinct beam-bearing branch** — e.g. the two barrels of a dual-head wash fixture.

```rust
// conversion.rs:252-278
fn visit_children(&self, prefix: &str, parent: &dyn IGeometry, channels_per_geometry: &...)
    -> Vec<(String, FixtureControls<SubFixtureControlChannel>, Vec<FixtureChannelDefinition>)>
{
    let mut sub_fixtures = Vec::default();
    for child in parent.children() {
        if let Some(child_definition) = self.visit_child(prefix, child, channels_per_geometry) {
            sub_fixtures.push(child_definition);
        }
        let grand_children = self.visit_children(
            &format!("{prefix}{}_", child.name()),
            child,
            channels_per_geometry,
        );
        sub_fixtures.extend(grand_children);
    }
    sub_fixtures
}
```

- **Prefix accumulation, not transform accumulation.** The only thing threaded down the recursion
  is a *string* prefix built as `{prefix}{child.name()}_`, used purely to namespace channel and
  sub-fixture names uniquely (e.g. `Head1_Head2_Pan`). There is no matrix, no position, no
  rotation in this walk — confirming §1a's finding that this crate is entirely blind to physical
  layout.
- **Every node is visited, regardless of kind.** `visit_children` does not classify by geometry
  kind (`Geometry` vs `Axis` vs `Beam` vs `GeometryReference`) — `IGeometry::children()`
  (`types/geometries.rs:157-172`) already erases that distinction by returning `Vec<&dyn IGeometry>`
  for all four kinds uniformly (for `GeometryReference` it returns the single boxed inlined
  geometry, `types/geometries.rs:168-170`). So "what gets skipped and why" is answered one level
  up, in `visit_child`, not by kind but by **whether the node has DMX channels bound to it**.
- **`visit_child` skips a node if it has no channels of its own**, not by structural type:

  ```rust
  // conversion.rs:280-291
  fn visit_child(&self, prefix: &str, child: &dyn IGeometry, channels_per_geometry: &...) -> Option<(...)> {
      let geometry = channels_per_geometry.get(child.name())?;   // None -> skip
      if geometry.is_empty() { return None; }                     // empty Vec -> skip
      ...
  }
  ```

  So a purely structural node (e.g. an intermediate `Geometry` that exists only to group children,
  or a `Beam` geometry with no channels of its own routed to it — common, since Beam-feature
  channels like Zoom/Iris are often routed to a parent `Axis` name, not the `Beam` node itself)
  produces no sub-fixture entry, but its children are still recursed into (`visit_children` always
  recurses regardless of what `visit_child` returned). The walk therefore silently drops any node
  whose name doesn't appear as a key in `channels_per_geometry` — the map built once, up front, in
  `build_fixture_mode` from the *flat* list of `<DMXChannel Geometry="...">` attributes in the
  active `DMXMode` (`conversion.rs:198-205`). A channel's `Geometry` attribute is a string that
  must exactly match a geometry node's `Name`; nothing here validates that match beyond a hash
  lookup, so a typo'd `Geometry` attribute in a real GDTF file just produces channels that never
  attach anywhere and log nothing.
- **Filter geometries and other unmodelled GDTF elements are skipped by construction**, not by an
  explicit skip rule: `Geometries` (`types/geometries.rs:5-15`) only ever parses child elements
  tagged `Geometry`, `Beam`, `Axis`, `GeometryReference`. GDTF's other geometry-tree element kinds
  (`FilterBeam`, `FilterColor`, `FilterGobo`, `FilterShaper`, `MediaServerLayer`, `MediaServerCamera`,
  `MediaServerMaster`, `Display`, `Laser`, `WiringObject`, `Inventory`, `Structure`, `Support`,
  `Magnet`) are not in `hard-xml`'s `#[xml(child = ...)]` list at all — `hard-xml` derive requires
  every possible child tag to be declared, so anything not declared is invisible to the parser,
  not parsed-then-discarded. This matters for the port: DOMParser has no such implicit filter, so
  Beamhouse's own tree walk must explicitly ignore unrecognised element tags (§5.1 of DESIGN.md
  already plans for this: "filter geometries — parse, ignore in v1").

## 2. `GeometryStateBuilder` / `GeometryState`

`GeometryStateBuilder` (`conversion.rs:33-38`) is the per-geometry-node accumulator used by *both*
walks (the root-features walk in `build_fixture_mode` and each call to `visit_child`). It is
built fresh for every geometry node — state is **not** threaded across nodes, only within one
node's channel list.

```rust
#[derive(Default)]
struct GeometryStateBuilder {
    controls: FixtureControls<FixtureControlChannel>,      // typed slots: intensity, pan, tilt, zoom, ...
    color_builder: ColorGroupBuilder<FixtureControlChannel>, // RGB/CMY channels accumulate here first
    channels: Vec<FixtureChannelDefinition>,                 // flat list: name -> DMX address/width
}
```

`add_channel` (`conversion.rs:41-129`) is called once per `<DMXChannel>` belonging to that
geometry node, and does two independent things:

1. **Always** (unless the channel is "virtual", see below): push a `FixtureChannelDefinition`
   with a synthesised name (`"{geometry}_{attribute}"`, `conversion.rs:220`, or with the
   sub-fixture prefix prepended, `conversion.rs:300-303`) and a `resolution` computed by
   `channel.with_offsets(dmx_breaks).into()` — i.e. this is where **coarse/fine offset handling**
   actually happens (§3 below); the channel is recorded regardless of whether it maps to a
   recognised control.
2. **If** the channel's `LogicalChannel/Attribute` name matches a known GDTF `Attribute`
   (looked up in the fixture-wide `attributes: GdtfAttributes` map, `conversion.rs:57`) *and*
   that attribute's `Feature` matches a known `Feature` (`conversion.rs:63`): route it into a
   typed slot on `controls` by a `match feature.name.as_str() { ... }` over the *feature* name,
   then a nested match over the *attribute* name for feature groups with several members (RGB,
   PanTilt, Beam, Gobo). Anything that doesn't match a known feature/attribute pair, or whose
   feature isn't recognised at all, is silently dropped from `controls` — it still exists as a
   raw `FixtureChannelDefinition` from step 1, just with no typed meaning.

**"Virtual" channels** (`channel.offset.is_virtual()`, `types/dmx_offset.rs:8-11` — true when the
GDTF `Offset` attribute is the empty string, parsed to `DmxChannelOffset(None)`,
`types/dmx_offset.rs:17-20`) are excluded from the flat channel list entirely (`conversion.rs:49`),
and if such a channel would otherwise map to a control, `add_channel` bails with a `TODO` instead
of adding it (`conversion.rs:64-67`, `types/dmx_offset.rs` — "add `FixtureControlChannel::Virtual`
which delegates to other channels" is unimplemented). A virtual channel in GDTF means "this
attribute exists logically but consumes no DMX slots of its own" — this crate simply drops those
attributes on the floor.

`build` (`conversion.rs:131-138`) finalises the builder into `GeometryState`: it resolves
`color_builder` into an `Option<ColorGroup>` (RGB wins over CMY if both were populated — see
`ColorGroupBuilder::build`, `../src/definition.rs:557-577`) and returns `{ controls, channels }`.
That's the entire output shape threaded through the walk — no positional/transform state, nothing
beam-physical, nothing about geometry hierarchy. It is purely "which DMX channels, mapped to which
typed console fader, live on this one named geometry node."

## 3. `build_fixture_mode` — `DmxMode` → `FixtureMode`

`conversion.rs:188-250`. Steps, in order:

1. **Resolve the mode's root geometry.** `self.geometries.get_root(&mode.geometry)`
   (`conversion.rs:189`, delegating to `types/geometries.rs:106-111`) looks the mode's
   `Geometry="..."` attribute up by exact name match against the top-level geometry list. **If
   not found, the whole mode is dropped**, not defaulted or partially resolved:
   ```rust
   // conversion.rs:189-196
   let Some(mode_geometry) = self.geometries.get_root(&mode.geometry) else {
       tracing::warn!("Geometry {} not found in fixture mode {}", mode.geometry, mode.name);
       return None;
   };
   ```
   This `None` propagates through `.filter_map(...)` in `From<GdtfFixtureDefinition>`
   (`conversion.rs:17-23`) — the mode is simply absent from `FixtureDefinition.modes`, with only a
   log line as evidence. A TypeScript port should treat "mode geometry not found" as a
   recoverable per-mode failure (skip and warn), not a fatal parse error for the whole file — a
   single bad mode shouldn't take out an otherwise-usable fixture with several modes.

2. **Group all `<DMXChannel>`s in the mode by their `Geometry` attribute** into
   `channels_per_geometry: HashMap<String, Vec<DmxChannel>>` (`conversion.rs:198-205`). This is a
   flat, one-pass grouping over `mode.channels.channels` — the mode's DMX channel list is not
   itself tree-shaped in GDTF; each channel just names the geometry it belongs to.

3. **Resolve "root features".** `mode_geometry.root_features()` (`types/geometries.rs:201-219`,
   via the `IGeometry` trait) walks *down* from the mode's root for as long as there is **exactly
   one** beam-bearing child at each level (`children.iter().filter(|c| c.has_beams()).count() == 1`),
   collecting every node visited (root plus each single-beam-child) into a `GeometryFeatures` map
   keyed by name. `has_beams()` (`types/geometries.rs:174-183`) is a recursive "does this subtree
   contain a `Beam` node anywhere" test. Intuitively: this walks past the fixture's "trunk" (base →
   yoke → head, one at a time) and stops branching where it forks into two-or-more independently
   beam-bearing children (e.g. a dual-barrel fixture's shared base). Everything from the mode root
   down to (and including) that fork point is the "root" fixture's own geometry; everything past
   the fork belongs to sub-fixtures.

   For each of those root-feature nodes, a fresh `GeometryStateBuilder` accumulates the channels
   grouped under that node's exact name (`channels_per_geometry.remove(&geometry.name)` —
   note: `.remove`, so once claimed by the root walk a geometry's channels can't also be claimed
   by the sub-fixture walk in step 4). The resulting `controls` from every root-feature node are
   merged with `+=` (`conversion.rs:226`, using `FixtureControls`'s `AddAssign`,
   `../src/definition.rs:200-216`, which is "last non-None wins per field, generic list appends") —
   i.e. **root-level controls from different geometries silently overwrite each other** field by
   field if two nodes both claim, say, a Pan channel; there is no ambiguity error.

4. **Sub-fixtures via `lowest_parent` + `visit_children`.** `mode_geometry.lowest_parent()`
   (`types/geometries.rs:221-236`) is the same one-beam-child descent as `root_features()`, but
   returns only the final fork node (not the accumulated path). If that fork node exists, §1b's
   `visit_children` walk runs from it, using whatever channels remain in `channels_per_geometry`
   after step 3's `.remove()` calls. Each `(name, controls, channels)` triple becomes a
   `SubFixtureDefinition::new(index+1, name, controls)` (1-indexed, `conversion.rs:238`), and its
   raw channels are appended to the mode-wide flat channel list.

5. **Construct `FixtureMode::new(mode.name, channels, controls, sub_fixtures)`**
   (`conversion.rs:244-249`). Notably `FixtureMode::new` (`../src/definition.rs:74-119`) then does
   two more inference passes Beamhouse should be aware of if it wants matching behaviour:
   auto-inserting a `VirtualDimmer` intensity control when a color mixer exists with no dimmer
   channel (`../src/definition.rs:81-91`), and propagating a `Delegate` intensity/color-mixer up
   to the mode level when *any* sub-fixture has one but the root doesn't
   (`../src/definition.rs:93-110`) — i.e. "this fixture has no top-level dimmer/color, but its
   sub-fixtures do; treat the whole fixture as if it delegates."

### Coarse/fine offset handling, precisely

The `Offset` XML attribute is a comma-separated list of **1-based DMX slot numbers within the
`DMXBreak`** (e.g. `"1,2"` for a 16-bit channel), parsed by `DmxChannelOffset::from_str`
(`types/dmx_offset.rs:14-44`) into a **0-based** `Vec<u16>` (each value `- 1`, rejecting `0` and
overflow past 511 explicitly, `types/dmx_offset.rs:25-35`). This vector's *length* determines
resolution — `Coarse`/`Fine`/`Finest`/`Ultra` for 1/2/3/4 entries respectively
(`types/dmx_offset.rs:46-56`, `../src/definition.rs:941-959`), with anything longer hitting
`unimplemented!` (`types/dmx_offset.rs:53`) — a hard panic, not a graceful degradation, if a real
file ever has a 5-byte channel.

`DmxChannel::with_offsets` (`definition.rs:191-209`) is the piece that turns a **per-break-local**
offset into what the crate treats as an address, by walking every `ReferenceDmxBreak` (from a
`GeometryReference`'s `<Break DMXBreak="n" DMXOffset="k">` children) whose `dmx_break >=`
the channel's own `DMXBreak`, and adding `(offset - 1)` (saturating) to the coarse/fine/etc. slot
at index `(reference_break.dmx_break - self.dmx_break)`:

```rust
// definition.rs:192-208
pub fn with_offsets(&self, breaks: &[ReferenceDmxBreak]) -> DmxChannelOffset {
    if let Some(mut offsets) = self.offset.clone().0 {
        for reference_break in breaks {
            if reference_break.dmx_break < self.dmx_break { continue; }
            let index = reference_break.dmx_break - self.dmx_break;
            if let Some(offset) = offsets.get_mut(index as usize) {
                *offset += reference_break.offset.saturating_sub(1);
            }
        }
        DmxChannelOffset(Some(offsets))
    } else {
        DmxChannelOffset(None)
    }
}
```

Caveat for the port: **this is a partial reading of GDTF's break model.** It handles the case
where a `GeometryReference`'s `Break` gives a per-break DMX-offset shift (used for pixel-run
expansion, §6 below), but the resulting `ChannelResolution` still carries **no notion of which
`DmxBreak`/universe an address belongs to** — `channels_per_geometry`/`FixtureChannelDefinition`
carry no `dmx_break: number` field at all (confirmed: `dmx_break` is read off `DmxChannel`,
`definition.rs:177`, and consumed only inside `with_offsets`'s break-matching loop — it is never
stored on the output type). DESIGN.md's `ChannelBinding.dmxBreak` (§5.2) has **no analogue in this
crate's output** — Beamhouse must carry `DMXBreak` through explicitly, because Mizer's console
model apparently assumes every mode resolves to one break/universe and doesn't need to disambiguate.
This is worth flagging as a real gap, not just an omission: a multi-break (multi-universe) fixture
mode would be mis-resolved by directly porting this logic as-is.

## 4. Beam attribute handling (`conversion.rs:109-116`)

This is the section named in the ticket at "line ~109", and it is worth being precise about what
it actually is, because the name is easy to over-read: it is **not** code that reads the `<Beam>`
XML geometry element's physical properties (no `LampType`, `PowerConsumption`, `LuminousFlux`,
`ColorTemperature`, `BeamAngle`, `FieldAngle`, `BeamRadius`, `ThrowRatio` attribute is parsed
anywhere in this crate — confirmed by the grep in the headline finding above). It is the arm of
`add_channel`'s big `match feature.name.as_str()` that handles DMX channels whose GDTF **Feature
Group is named `"Beam"`** (an attribute-definition-level grouping, unrelated to whether the
channel happens to be routed to a `<Beam>` geometry node):

```rust
// conversion.rs:109-116
"Beam" => match attribute.name.as_str() {
    "Shutter1" => self.controls.shutter = Some(channel),
    "Iris1" => self.controls.iris = Some(channel),
    "Frost1" => self.controls.frost = Some(channel),
    "Prism1" => self.controls.prism = Some(channel),
    "Zoom1" => self.controls.zoom = Some(channel),
    _ => {}
},
```

So "what is read off a Beam geometry" is, precisely: **five specific DMX-controlled attributes
under the GDTF `Beam` feature group** — strobe/shutter, iris, frost, prism, zoom — each mapped
1:1 to a `FixtureControls` fader slot. Anything else under that feature group (e.g. `Shutter2`,
`Iris2`, `Frost2`, `PrismRot1`, `Zoom2` for a fixture with two beam-effect stages, or
`Shutter1Strobe`/`Shutter1StrobePulse` etc. — GDTF's actual strobe-mode sub-attributes) falls into
the `_ => {}` arm and is dropped from `controls` (though it is still recorded, unattributed, as a
raw `FixtureChannelDefinition`). **Ignored, always:** the static Beam-geometry physical properties
themselves — beam angle, field angle, lamp type, luminous flux, colour temperature, throw ratio,
beam radius, colour rendering index — none of these have a Rust struct field anywhere in this
crate, because the console has no use for them. This is exactly the data Beamhouse's beam shader
needs (`beam angle` drives the cone half-angle per DESIGN.md §8.2, `LuminousIntensity`/`LuminousFlux`
could drive intensity falloff) and it is a **pure gap** — see §6.

## 5. The `FIXME` at `conversion.rs:58` — the SGM G-1 hack

```rust
// conversion.rs:57-62
if let Some(attribute) = attributes.get(&channel.logical_channel.attribute) {
    // FIXME: This is a hack so the SGM G-1 Beam profile works properly
    // I need to investigate how to handle this case better
    if attribute.name == "Macro" {
        return;
    }
    ...
```

This is a single, unconditional early `return` from `add_channel` the instant a DMX channel's
`LogicalChannel/Attribute` resolves to an `Attribute` named exactly `"Macro"`. Two things happen
as a result, and both matter:

1. **The channel is dropped from `controls`**, which is the intended, comment-documented effect —
   `Macro` in this GDTF file evidently isn't a real usable fader-worthy attribute for the console
   (GDTF's `Macro` attribute is a "run internal macro N" control — a value range that triggers
   fixture-internal behaviour, not a physical property with a sensible linear fader mapping).
2. **The channel is *also* dropped from the flat `channels: Vec<FixtureChannelDefinition>` list**,
   because the `return` fires *after* the `if !channel.offset.is_virtual() { self.channels.push(...) }`
   block at the top of the function has already run (`conversion.rs:49-55`) — wait, precisely:
   the push happens *before* this `return`, at lines 49–55, so the raw channel **is** still
   recorded in `self.channels`. Re-reading the control flow carefully: the `FIXME` only skips the
   *feature/attribute → typed-control* routing (the rest of the function body, past line 62), not
   the raw-channel bookkeeping. So the precise effect is: **`Macro` channels still occupy DMX
   address space and appear in the flat channel list (so DMX-channel-count and addressing stay
   correct), but never become a named `FixtureControls` fader.**

**What breaks without it:** the fields immediately below the guard are `feature.name.as_str()`
matched against `"Dimmer" | "Focus" | "RGB" | "Color" | "PanTilt" | "Control" | "Beam" | "Gobo"`
(`conversion.rs:70-126`). If `Macro`'s `Feature` happens to be a `FeatureGroup`/`Feature` pair
whose **group** name collides with one of those recognised names (this is the plausible failure
mode implied by "I need to investigate how to handle this case better" — the author didn't fully
diagnose *why* SGM's file broke, only that gating on the attribute name fixed it), the `Macro`
channel would get routed into a real control slot it has no business occupying — e.g. if SGM's G-1
profile groups its macro-select attribute under a `"Control"` feature, it would land as a
`GenericControl` with a `label` taken from `attribute.pretty` (`conversion.rs:103-107`), polluting
the fixture's generic-control fader list with a macro selector that behaves nothing like a fader
(it selects discrete internal chases/effects, not a continuous physical quantity). Without
diagnosing SGM's actual `description.xml`, the safest reading of "what breaks" is: **a spurious
fader-labelled control appears for an attribute whose DMX range doesn't mean what a fader implies**
— visually harmless in Mizer's UI (it's just an extra slider) but semantically wrong, and
plausibly the kind of thing that made this fixture profile "not work properly" for someone driving
it live.

**What this implies for Beamhouse, generalised beyond this one attribute:** this is the single
most important signal in the whole file, exactly as the ticket says, and it generalises past
`Macro` specifically:

- **GDTF's `Attribute`/`Feature`/`FeatureGroup` taxonomy is not a closed, well-behaved
  classification in files seen in the wild.** A real manufacturer's `description.xml` can
  associate a name-recognised `Attribute` (`Macro`, in this case — `Macro` is itself a
  standard GDTF attribute name) with a `Feature`/`FeatureGroup` in a way the code's author did not
  anticipate, and the fix that shipped is a **name-based special case**, not a structural one.
  There is no principled rule here to port — the port should expect to accumulate its own list of
  named special cases as real fixture files are tested against it, not assume the spec's category
  system is sufficient on its own.
- **The fix is conservative (skip), not corrective (reclassify).** That is the safer failure mode
  for a port to copy: when an attribute's routing looks wrong or its feature/attribute combination
  is unexpected, prefer silently excluding it from typed controls (while still keeping it in the
  raw channel list, exactly as this code does) over guessing at a "better" classification. A
  dropped fader is recoverable (the operator/visualiser just doesn't animate that one attribute);
  a wrongly-typed one produces confidently-wrong behaviour.
- Concretely for Beamhouse: `Attribute` name → `Feature` name resolution should be defensive by
  default (attributes with no recognised feature/attribute-name pairing are simply inert — this is
  already what happens for every attribute not explicitly matched in the crate's `match` arms,
  §2), and any attribute name known to carry non-physical, mode-selecting semantics (GDTF has
  several: `Macro`, `AnimationWheel*Macro`, various `*Mode`/`*Select` attributes) is worth an
  explicit exclusion list from day one rather than discovering it fixture-by-fixture the way this
  crate did.

## 6. Gaps — what Beamhouse needs that this crate does not do

This is the load-bearing section. Everything here has **no reference implementation** in
`mizer-gdtf-provider`; the port has to work from the GDTF specification (and BlenderDMX's Python
implementation, per DESIGN.md's own reference list) instead.

| Beamhouse need (DESIGN.md §5) | Status in `mizer-gdtf-provider` |
| --- | --- |
| **GLB/model extraction from the zip** | Absent entirely. `GdtfArchive::read` (`lib.rs:112-123`) opens the zip and reads exactly one entry, `description.xml` (`lib.rs:117`), then closes over it — the `ZipArchive` handle itself doesn't outlive `read()`. `Geometry`/`Beam`/`Axis` do parse a `Model: Option<String>` attribute (`types/geometries.rs:67`, `81`(none — Beam has no Model field, see below), `95`(none — Axis has no Model field either)) — actually only `Geometry` (`types/geometries.rs:64-76`) carries `Model`; `Beam` (`types/geometries.rs:78-90`) and `Axis` (`types/geometries.rs:92-104`) do not, in this crate's schema — but that string is never dereferenced against `PhysicalDescriptions/Models` or a `models/gltf/*.glb` zip entry anywhere in the crate. `PhysicalDescriptions` itself is parsed as a bare empty tag struct: `pub struct PhysicalDescriptions {}` (`definition.rs:144-146`) — the whole subtree (including the `<Models>` list that maps a model `Name` to its `File` and its `PrimitiveType`) is discarded by `hard-xml` before it ever reaches this crate's types. Beamhouse has to write this from scratch: parse `<Models>` to get `File`/`PrimitiveType` per named model, then `gdtf.file(`models/gltf/${file}.glb`)` per §5.1 of DESIGN.md. |
| **`PrimitiveType` → procedural proxy geometry** | Not read (see above — `PhysicalDescriptions` is empty). No fallback-primitive concept exists in this crate at all, because it never needed one. |
| **Transforms (`Matrix` accumulation down the tree)** | Not read anywhere (§1a). No `Position`/`Rotation`/`Matrix` field on any geometry struct. This is the single biggest structural gap relative to what DESIGN.md §5.1 asks for ("how transforms accumulate down the tree") — there is nothing to port here; it must be designed from the spec (GDTF `Matrix` is a space-separated 16-value row-major 4×4 in metres, composed parent-to-child by standard matrix multiplication — confirm against the spec PDF, not assumed here). |
| **`GeometryReference` pixel expansion into N concrete nodes** | Partially present, but only the DMX-offset bookkeeping half (§3, `DmxChannel::with_offsets`), not node instantiation. `ResolvedGeometry::resolve`'s `GeometryReference` case (`types/geometries.rs:316-329`) inlines the referenced subtree exactly **once** per `GeometryReference` element — it does not multiply by the number of `Break` entries or expand into N sibling copies of the node with per-pixel channel offsets. A 35-pixel tube's GDTF file has 35 `GeometryReference` elements at the XML level already (one per pixel, typically, each with its own `Break DMXOffset`), so *if* the file is authored that way, this crate's single-inline-per-reference behaviour is actually adequate per element — but it never aggregates them into a "this is a strip of 35" concept, and it never assigns positions (no transforms, per above) so there is no way to tell they're collinear. Beamhouse's expansion step (`pixels.ts` per DESIGN.md's layout) and its downstream collinearity heuristic (ticket 7) have nothing to lean on here beyond the offset-arithmetic pattern in `DmxChannel::with_offsets`. |
| **`modeMaster` handling** | Not read. No `ModeMaster`/`ModeFrom`/`ModeTo` field anywhere; `<ChannelFunction>` itself isn't parsed (next row), and `ModeMaster` lives on `ChannelFunction`/`ChannelSet` in the GDTF schema, so this is downstream of a gap that's already total. |
| **`ChannelFunction` interpolation to physical units** | Not read at all. `<DMXChannel>` (`definition.rs:173-189`) has no `child = "ChannelFunction"` — `hard-xml`'s derive silently ignores any child element not declared, so every `<ChannelFunction>`/`<ChannelSet>` under a channel (which carries `DMXFrom`, `PhysicalFrom`, `PhysicalTo`, and the `Attribute`/`Feature` chain) is invisible to this crate. It works entirely off `LogicalChannel/Attribute` (`definition.rs:211-216`, just the attribute name) — one level up from where physical-unit interpolation would live. `PhysicalUnit` itself *is* modelled (`types/physical_unit.rs`, an enum with all 22 GDTF units) and parsed onto `Attribute.physical_unit` (`definition.rs:113-114`), but nothing in `conversion.rs` ever reads that field — it's dead data as far as resolution goes. This is a full, from-spec build for Beamhouse: per DESIGN.md §5.2, per-tick you need the raw value, the matching `ChannelFunction` by `DMXFrom` range, and a `physicalFrom..physicalTo` lerp. |
| **`colorSpace`/gamut** | Not read. No `ColorSpace` field, no gamut/primaries model anywhere. DESIGN.md's own ticket 2 (open question) already flags this as unresolved for v1 (linear sRGB assumed) — consistent with there being no reference here either. |
| **DMX break / universe disambiguation on output channels** | Read into the offset math (`DMXBreak` attribute, `definition.rs:176-177`) but not carried onto the output `FixtureChannelDefinition`/`ChannelResolution` (§3's caveat) — Mizer's model implicitly assumes single-break resolution per mode. DESIGN.md's `ChannelBinding.dmxBreak` field (§5.2) has to be added independently. |
| **Wheel/Gobo media** | `Wheel`/`WheelSlot` *are* parsed (`definition.rs:117-142`, including `MediaFileName`), but `add_channel`'s `"Gobo"` arm only ever constructs an empty `gobos: vec![]` with an explicit `// TODO: read gobo wheel variants` (`conversion.rs:117-123`) — the wheel data exists in the parsed tree but resolution never cross-references it to the channel. Not needed for Beamhouse v1 (gobos are explicitly deferred, DESIGN.md §01), but worth knowing this isn't a "done" example to copy either. |

**Net read:** everything under DESIGN.md's "5.2 DMX mode → channel bindings" table that isn't the
bare `attribute`/`geometry` identity — i.e. `functions: ChannelFunction[]` and `modeMaster` — is a
from-scratch build. Everything under "5.1 Geometry tree → renderable nodes" that isn't "classify
which of the four tags this is" — i.e. transform accumulation, `PrimitiveType`, model file
resolution — is also from-scratch. What *does* transfer directly: the geometry-kind enum shape
(`Geometry`/`Beam`/`Axis`/`GeometryReference`, exhaustive per `hard-xml`'s declared children,
§1b), the depth-first walk-with-string-prefix pattern for naming nested nodes uniquely, the
coarse/fine/finest/ultra offset-width-from-array-length trick, the `GeometryReference`
`Break`-offset arithmetic pattern, and the general shape of "group DMX channels by their
`Geometry` attribute, then walk the tree looking them up by name" as the connective tissue between
`DMXChannels` (flat) and `Geometries` (tree).

## 7. XML parsing approach (`hard-xml`) and DOMParser translation notes

`hard-xml`'s `XmlRead` derive macro (`hard-xml = "1.36"`, `Cargo.toml:13`) is a compile-time,
schema-driven binding, not a general-purpose XML tree — every struct declares its own tag
(`#[xml(tag = "GDTF")]`), every attribute it reads (`#[xml(attr = "DataVersion")]`) and every
child element it recurses into (`#[xml(child = "FixtureType")]`), all as proc-macro attributes on
plain Rust structs (see the whole of `definition.rs` and `types/geometries.rs` for the pattern
throughout). A few specific mechanisms matter for the DOMParser port:

- **Attribute parsing goes through `FromStr`.** Every non-`String` attribute type in this crate
  (`DmxChannelOffset`, `DmxValue`, `FeatureRef`, `PhysicalUnit`) implements `std::str::FromStr`
  and `hard-xml` calls it automatically for typed attribute fields (e.g. `definition.rs:179`,
  `pub offset: DmxChannelOffset`, backed by `types/dmx_offset.rs:14-44`). This translates cleanly:
  a DOMParser port should write the equivalent as small `parseX(attrValue: string): X` functions
  called explicitly per attribute after `element.getAttribute(...)` — there's no macro magic to
  replicate, just discipline about doing the parsing at the boundary rather than scattering
  `parseInt`/string-splitting through the resolution logic. `DmxValue::from_str`
  (`types/dmx_value.rs:13-27`, parsing GDTF's `"value/byteCount"` or literal `"None"` syntax) and
  `FeatureRef::from_str` (`types/feature_ref.rs:10-22`, `"Group.Feature"` split on `.`) are good
  direct templates.
- **Optional vs. required attributes are `Option<T>` vs. `T`**, and `hard-xml` presumably errors
  at parse time if a required (non-`Option`) attribute is missing — e.g. `FixtureType::thumbnail:
  Option<String>` (`definition.rs:29-30`) vs. `FixtureType::name: String` (`definition.rs:17-18`).
  With `DOMParser`, `getAttribute` always returns `string | null`, so the equivalent discipline is
  explicit: treat a `null` on a field this crate types as non-`Option` as a hard parse error for
  that element (throw), and a `null` on an `Option`-typed field as an actual absence. This is a
  place where the Rust type signatures across `definition.rs` are directly useful as a checklist
  of which GDTF attributes real files can omit versus must supply — worth transcribing field-by-
  field into the TS parser's required/optional split rather than re-deriving it from the spec PDF.
- **`#[xml(default)]` supplies a `Default` when the child element is entirely absent**, distinct
  from `Option` (which handles an *attribute* being absent within a present element) — see
  `DmxMode.channels: DmxChannels` with `#[xml(child = "DMXChannels", default)]`
  (`definition.rs:160-161`) and `Wheels` similarly on `FixtureType` (`definition.rs:33-34`). In
  DOMParser terms: `element.querySelector("DMXChannels")` returning `null` should map to an empty
  `{ channels: [] }` rather than a thrown error, for every field this crate marks `default`. This
  is a real, checkable list (grep `#\[xml\(.*default` across the crate) worth carrying over
  attribute-for-attribute rather than guessing which child elements GDTF permits to be missing.
- **Polymorphic / mixed-tag child lists are declared, not discovered.** `Geometries.children`
  (`types/geometries.rs:5-15`) declares four possible child tags on one `Vec<GeometryType>` field
  (`#[xml(child = "Geometry", child = "Beam", child = "Axis", child = "GeometryReference")]`), and
  `GeometryType` is a tagged enum whose variants each carry their own `#[xml(tag = "...")]`
  (`types/geometries.rs:17-27`). `hard-xml` reads children **in document order**, dispatching each
  one to whichever enum variant matches its tag name, and *interleaving* is expected — i.e. a
  `<Geometry>` can be followed by an `<Axis>` then another `<Geometry>` in the source and all three
  land in the same `Vec<GeometryType>` in that order. **This is the part that translates most
  awkwardly to `DOMParser`.** There is no built-in "declare the set of child tags I accept, in any
  order, and get a discriminated union back" — the direct equivalent is manually iterating
  `element.children` (an `HTMLCollection`/`Element[]`, already document-order) and switching on
  `child.tagName` per iteration, building the discriminated union by hand:
  ```ts
  function parseGeometryChildren(el: Element): GeometryType[] {
    const out: GeometryType[] = [];
    for (const child of Array.from(el.children)) {
      switch (child.tagName) {
        case "Geometry": out.push({ kind: "Geometry", ...parseGeometry(child) }); break;
        case "Beam": out.push({ kind: "Beam", ...parseBeam(child) }); break;
        case "Axis": out.push({ kind: "Axis", ...parseAxis(child) }); break;
        case "GeometryReference": out.push({ kind: "GeometryReference", ...parseGeometryReference(child) }); break;
        // anything else (Filter*, MediaServer*, ...): fall through, ignore — §1b
      }
    }
    return out;
  }
  ```
  This is mechanical, not hard, but it's the one place a straight structural port ("give this
  library your types, get a parser") isn't available — every polymorphic child list in the GDTF
  schema (there's at least one more: `DMXModes`/`DMXChannels`-adjacent structures don't recurse
  this way, but `Geometries` itself is recursive, so this pattern must be written once and reused
  at every geometry nesting level, exactly as `types/geometries.rs:69-104` repeats the same four-
  tag declaration on `Geometry`, `Beam`, and `Axis` individually).
- **Whole subtrees can be silently discarded by omission.** As noted in §6,
  `PhysicalDescriptions {}` (`definition.rs:144-146`) is the starkest example — an empty struct
  bound to a tag that, per spec, has substantial content (`Models`, `DMXProfiles`, `Properties`,
  `Emitters`, `Filters`, `ColorSpace`, `AdditionalColorSpaces`). Because `hard-xml` only reads
  what a struct declares, this is silent and produces no parse error or warning — the crate simply
  never sees that data. The direct risk for a DOMParser port copying this crate's struct shapes
  too literally: **do not treat "this crate has a type for element X" as "this crate fully models
  element X."** Cross-check every struct against the GDTF XML schema/spec before assuming a field
  list is complete — `PhysicalDescriptions`, `Attribute` (missing `PhysicalFrom`/`PhysicalTo`/
  `PhysicalDefault`, which live on `ChannelFunction` not `Attribute` in the real schema, another
  reminder that this crate's `Attribute` type is the *definition-level* attribute record, not a
  channel's resolved function), and `DMXChannel` (missing `ChannelFunction`/`ChannelSet` entirely)
  are the three worth treating as known-incomplete rather than as templates.
- **No schema validation, no namespace handling, no comments/CDATA concerns surfaced in this
  crate** — `hard-xml` is evidently permissive about unknown attributes/children (as shown above)
  and there's no evidence of GDTF-file XML namespaces being an issue in practice (GDTF's
  `description.xml` is unnamespaced), so `DOMParser`'s default namespace-less mode should be a
  direct match with no extra ceremony needed there.

## Summary for the report-back

- **Algorithm shape.** The crate is a console patch resolver, not a scene resolver: it (a) eagerly
  inlines every `GeometryReference` into a flat resolved tree with no transform data, (b) finds
  the "single-beam-child" trunk of that tree to separate the fixture's own controls from its
  sub-fixtures, (c) for each geometry node, buckets its DMX channels by GDTF `Feature`/`Attribute`
  name into a fixed set of typed console fader slots (dimmer, pan/tilt, RGB/CMY, zoom/iris/frost/
  prism/shutter, gobo, generic), silently dropping anything it doesn't recognise into an
  unattributed-but-still-addressed raw channel list, and (d) recurses that same per-node logic
  down through the sub-fixture tree, threading only a naming prefix, never a transform.
- **Gap list (repeated, condensed):** no transform/`Matrix` accumulation, no `PrimitiveType`
  fallback geometry, no GLB/model file resolution from the zip, no `GeometryReference` node
  multiplication (only per-reference offset math), no `modeMaster`, no `ChannelFunction`/
  `ChannelSet` parsing at all (hence no physical-unit interpolation, no `DMXFrom` range dispatch),
  no `colorSpace`/gamut, no DMX-break carried onto output channel bindings, and gobo-wheel media
  is parsed but never cross-referenced to a channel.
- **How much of the M4 "3–5 day wall" this removes.** Real, but partial, and concentrated in the
  *DMX-mode-to-channel-bindings* half rather than the *geometry-to-renderable-scene* half. What
  transfers directly and saves real time: the depth-first tree-walk-with-prefix pattern; the
  "group flat DMX channels by geometry name, then walk the tree looking them up" connective
  pattern between `DMXChannels` and `Geometries`; the coarse/fine/finest/ultra offset-width
  inference from array length; the `GeometryReference` `Break`-offset arithmetic; the concrete,
  battle-tested list of GDTF `Feature`/`Attribute` name pairs worth recognising for v1 (which maps
  almost exactly onto DESIGN.md §5.2's own v1 attribute list — Dimmer, Pan, Tilt, ColorAdd_R/G/B,
  Zoom, and by extension Shutter1/Iris1/Frost1/Prism1); and, most valuably, the `FIXME` as a
  concrete demonstration that real GDTF files need defensive, name-based exclusion rules the spec
  alone won't predict. What does **not** transfer, and is the actual substance of the "wall":
  transform composition down the geometry tree, model/GLB extraction and `PrimitiveType` fallback,
  `ChannelFunction` physical-unit interpolation, and `GeometryReference` pixel-run expansion into
  concrete positioned nodes — i.e. essentially all of DESIGN.md §5.1 and half of §5.2, which is
  also the harder, more spatial half of the milestone. This reference de-risks "how do I structure
  a GDTF resolver in a hand-rolled zip+XML pipeline without the `gdtf` crate" convincingly; it does
  not de-risk "how do I turn GDTF geometry into a positioned, animated 3D scene," which is the part
  that actually makes M4 a 3–5 day estimate rather than a 1 day one.
