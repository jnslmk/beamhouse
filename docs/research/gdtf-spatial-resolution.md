# GDTF spatial resolution: a reference mined from the spec, BlenderDMX and the Clay Paky importer

Ticket: jnslmk/beamhouse#11 (part of #1). Companion to `gdtf-resolution-reference.md`, which covers the
*channel* half from `mizer-gdtf-provider`. This document covers the *spatial* half: transforms,
primitives, meshes, `GeometryReference` positioning, pan/tilt hinges, and physical-unit interpolation.

**Sources read, with the exact revision each citation is against** (all cloned fresh 2026-09-01):

| Short name | Repository | Commit | Licence |
| --- | --- | --- | --- |
| **spec** | `mvrdevelopment/spec` — the GDTF/MVR DIN SPEC in Markdown, published by the GDTF group | `098d379` (2026-04-08) | no `LICENSE` file; see §9 |
| **blender-dmx** | `open-stage/blender-dmx` | `4fb9cb7` (2026-08-23) | **GPL-3.0-or-later** |
| **pygdtf** | `open-stage/python-gdtf` | `5252bcc` (2026-08-23) | MIT |
| **pymvr** | `open-stage/python-mvr` | `9bbcabc` (2026-08-23) | MIT |
| **gdtf-rs** | `cpdt/gdtf-rs` | `410dcae` (2026-08-11) | MIT |
| **claypaky** | `ClayPakyOfficial/gdtf-importer` (Unreal Engine plugin) | `6521fe7` (2023-07-28) | **MIT** |

Also read: the official GDTF XSD (`python-gdtf/tests/gdtf.xsd`, "XML Schema for GDTF 1.2 … from DIN SPEC
15800:2022-02"), two real `.gdtf` archives unzipped and inspected byte-for-byte
(`python-gdtf/tests/BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf`, `gdtf-rs/Generic@RGBW8@test.gdtf`), and the
rendered spec at `gdtf.eu/gdtf/file-spec/` to cross-check the Markdown mirror. Spec citations are given
as `gdtf-spec.md:LINE` **and** the DIN SPEC table number, so they survive a re-render.

---

## Headline finding

**The ticket's premise — "BlenderDMX is the leading candidate, establish its licence so we know whether
we can borrow" — resolves the wrong way twice, and both surprises matter more than the licence answer.**

1. **BlenderDMX is GPL-3.0-or-later** (`blender-dmx/LICENSE`, `gpl-header.txt` applied to every source
   file including `gdtf.py`). Read-only for Beamhouse. That was the expected downside case.
2. **It is not the only implementation, and it is not the best-licensed one.** `ClayPakyOfficial/gdtf-importer`
   — written by a fixture manufacturer, MIT-licensed, C++ — solves the same spatial problem, and on the
   two questions where the two implementations disagree, reading them *against each other* is worth more
   than reading either alone. Beamhouse can copy from Clay Paky. It cannot copy from BlenderDMX.
3. **Neither of them, nor the spec, is a complete answer to "how do I position a GDTF fixture."** Three
   specific things are unresolved or wrong in the wild, and §1.3, §5 and §10 are the load-bearing sections:
   - the **rotation sub-matrix convention** is applied by both implementations as the *transpose* of what
     the spec text literally says, each arriving there by an undocumented empirical fix, and each leaving
     a comment admitting they were not sure (`blender-dmx/gdtf.py` git history: *"this makes applying
     rotations correct"*; `claypaky/…/CPGDTFImporterUtils.cpp:310` *"TODO CHECK THE UNREAL ROTATION
     CALCULATION"*). This is the one thing Beamhouse must settle experimentally rather than by reading.
   - **`GeometryReference` instantiation is wrong in both**, in *opposite* directions: BlenderDMX creates
     the right number of instances but throws away the referenced geometry's own `Position`; Clay Paky
     keeps both positions but creates **one instance per `<Break>` child**, which the spec explicitly says
     is a per-DMX-break offset list, not an instance count. The "strip class" that DESIGN.md §5.3 depends
     on has no correct reference implementation anywhere.
   - **`PrimitiveType` does not need to be generated procedurally.** DESIGN.md §5.1 says "Generate those
     procedurally"; that is unnecessary for the five named types. The GDTF group ships the canonical
     `Base` / `Yoke` / `Head` / `Scanner` / `Conventional` meshes in `mvrdevelopment/spec/meshes/`, in both
     a 1.0 and a 1.1 flavour, under an explicit royalty-free grant (§3.2). Beamhouse should convert those,
     not reinvent them and not lift BlenderDMX's GPL-packaged `.glb` copies of them.

A fourth, smaller correction to DESIGN.md: §5.1's table says filter geometries are "parse, ignore in v1".
The spec's geometry-children list (Table 34, `gdtf-spec.md:1189`) has **fifteen** child element types, not
four; `Laser` and `Display` are visualiser-relevant and `WiringObject` / `Support` / `Structure` /
`Magnet` are not. See §2.4.

---

## 1. The coordinate system and the matrix

### 1.1 What the spec actually says, verbatim

The `Matrix` value type, `gdtf-spec.md:201` (DIN SPEC 15800 §"Attribute Value Types"):

> The transformation matrix consists 4 x 4 floats. Stored in a row-major order. For example, each row of
> the matrix is stored as a 4-component vector. The mathematical definition of the matrix is in a
> column-major order. For example, the matrix rotation is stored in the first three columns, and the
> translation is stored in the 4th column. The metric system consists of the Right-handed Cartesian
> Coordinates XYZ: X – from left (-X) to right (+X), Y – from the outside of the monitor (-Y) to the
> inside of the monitor (+Y), Z – from bottom (-Z) to top (+Z). 0,0,0 – center base.

The serialised form is four brace-groups of four comma-separated floats,
`{a,b,c,d}{e,f,g,h}{i,j,k,l}{m,n,o,p}`, and the XSD enforces exactly that shape and nothing more:

```xml
<!-- python-gdtf/tests/gdtf.xsd:890 -->
<xs:simpleType name="matrixtype">
  <xs:restriction base="xs:string">
    <xs:pattern value="None|(\{-?[0-9]+\.?[0-9]*(,-?[0-9]+\.?[0-9]*){3}\}){4}"/>
  </xs:restriction>
</xs:simpleType>
```

Note the literal string `None` is a legal value. The default is the identity matrix
(`gdtf.xsd:507`, `Position` default `{1,0,0,0}{0,1,0,0}{0,0,1,0}{0,0,0,1}`).

Related types, for the port's parser: `Rotation` is 3×3 in three brace-groups of three
(`gdtf-spec.md:202` / `gdtf.xsd:895`) with the same wording, and `Vector3` is a bare
`{float,float,float}`. `Rotation` does **not** appear on any geometry — it is used by `Laser` (`Table 46`)
and physical-description nodes — so the geometry tree only ever needs `Matrix`.

### 1.2 Translation is in the 4th column — verified against real files, not just the text

`python-gdtf/tests/BlenderDMX@LED_PAR_64_RGBW@v0.3.gdtf` → `description.xml`, the whole geometry tree:

```xml
<Geometry Model="Body" Name="Body"
  Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,0.000000}{0,0,0,1}">
  <Beam … Name="Beam"
    Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,-0.134000}{0,0,0,1}"/>
  <Axis  Model="Yoke" Name="Yoke"
    Position="{1.000000,0.000000,0.000000,0.000000}{0.000000,1.000000,0.000000,0.000000}{0.000000,0.000000,1.000000,0.161000}{0,0,0,1}"/>
</Geometry>
```

The offsets land at element index 11 — the 4th entry of the 3rd brace-group — and the 4th group is
`{0,0,0,1}`. So with `M[row][col]` indexing over the brace-groups-as-rows, **translation is
`(M[0][3], M[1][3], M[2][3])` and the bottom row is the affine `{0,0,0,1}`**. Every example in the spec's
own `examples/geometry.md` has the same shape. Both implementations agree independently:

- `blender-dmx/gdtf.py:724` — `translate = geometry_mtx.to_translation()`, and Blender's `mathutils.Matrix`
  built from a list of rows reads `to_translation()` off the 4th column.
- `claypaky/Source/ClayPakyGDTFImporter/Private/Utils/CPFActorGeometryTree.cpp:196` —
  `FVector Location = Geometry->Position.GetColumn(3); // Location on last column`.

**Units are metres.** The spec's `Matrix` paragraph does *not* say so (it says only "metric system"), and
that is a real gap in the text; `Model` `Length`/`Width`/`Height` do say "Unit: meter" explicitly
(Table 32, `gdtf-spec.md:1065-1067`), and `BeamRadius` says "Unit: meter" (Table 41, `gdtf-spec.md:1378`).
Both implementations treat the matrix translation as metres too, and say so in comments:
`claypaky/…/CPGDTFDescription.cpp:60` — `* 100.0f; // Multiplication by 100 because the unit on GDTF is
the meter. // Note: On Unreal the unit is the centimeter.` BlenderDMX applies no scale at all in
`gdtf.py` (grep for `0.001` / `1000` across `gdtf.py`: **zero matches**), because Blender's default unit
is the metre. Treat metres as settled.

### 1.3 The rotation convention — the one unresolved question

Read literally, §1.1 says the rotation basis vectors are the **first three columns**. That is the ordinary
"column-vector / OpenGL" convention written out row by row, and it means a direct construction with no
transpose is correct.

**Both implementations effectively transpose it, and neither can explain why.**

*BlenderDMX* (`gdtf.py:721-733`):

```python
def add_child_position(geometry):
    obj_child = objs[sanitize_obj_name(geometry)]
    geometry_mtx = Matrix(geometry.position.matrix)
    translate = geometry_mtx.to_translation()
    rotation = geometry_mtx.to_3x3().inverted()      # <-- inverse of a rotation == transpose
    scale = geometry_mtx.to_scale()
    obj_child.matrix_local = Matrix.LocRotScale(translate, rotation, scale)
    obj_child.rotation_mode = "XYZ"
    obj_child["applied_rotation"] = obj_child.rotation_euler
    # baking into the object did not work, we store the rotation and re-apply it on pan/tilt in render()
```

Blender's `Matrix` is column-vector, so `Matrix(rows)` already puts the GDTF columns in the basis
position; `.inverted()` then flips it. The git history shows this is an empirical fix, not a derivation —
the previous version (`git log -L` on the function, commit `9a40f52`) did:

```python
obj_child.rotation_euler = Matrix(geometry.position.matrix).to_euler("XYZ")
# this makes applying rotations correct
obj_child.rotation_euler[0] *= -1
obj_child.rotation_euler[1] *= -1
obj_child.rotation_euler[2] *= -1
```

Negating all three Euler angles is only equivalent to a transpose for a single-axis rotation, so the
author changed it to a real inverse later. The comment "this makes applying rotations correct" is the
entire justification on record.

*Clay Paky* fills the matrix positionally and then extracts a rotator with Unreal's default:

```cpp
// claypaky/…/CPGDTFDescription.cpp:60
Matrix.M[i][j] = FCString::Atof(*CellsStrs[j]) * 100.0f;
// claypaky/…/CPGDTFImporterUtils.cpp:302-318
void FCPGDTFImporterUtils::MatrixToRotator(FMatrix InMatrix, FRotator* OutRotator) {
    /* … quotes the spec's own row-major/column-major paragraph verbatim … */
    /*********************************************************************
     *          TODO \todo CHECK THE UNREAL ROTATION CALCULATION         *
    **********************************************************************/
    *OutRotator = InMatrix.Rotator(); // If the Unreal default calculation is correct this function can be deleted
}
```

Unreal's `FMatrix` is **row-vector** convention: its basis vectors live in rows. So `M[i][j] = gdtf[i][j]`
followed by `.Rotator()` reads the basis off the *rows of the GDTF matrix* — arriving at exactly the same
place as BlenderDMX's explicit transpose, by a completely different route, in a codebase written by a
fixture manufacturer.

**Two independent implementations converge on "basis = rows", which is the transpose of the spec text,
while both read translation from the 4th column.** That combination is internally inconsistent as a
matrix convention, which is why it is worth flagging rather than adopting.

What Beamhouse should do: **do not decide this from the documents.** It does not bite for the common case
— every `Position` in both test archives and in all four of the spec's worked examples
(`spec/examples/geometry.md`) is a pure translation with an identity rotation block, and for those the two
readings are identical. It bites only on fixtures with genuinely rotated sub-geometry (angled multi-head
bars, tilted pixel arrays, mirror scanners). The experiment: take one GDTF with a non-identity rotation
block, render it both ways, and compare against the manufacturer's product photo. Record the answer in
this file. Until then, implement the transform load behind a single function so the convention is one
line to flip, and add the assertion `M[3] == [0,0,0,1]` to catch files that are transposed the other way.

Also note, for the parser: Clay Paky's `* 100.0f` is applied to **all sixteen** cells including the
rotation block (`CPGDTFDescription.cpp:60`). It happens to be harmless because `FMatrix::Rotator()`
normalises the basis and the location is scaled by the same factor, but it means the matrix is not a
valid transform after parsing. Do not copy that shape; scale the translation only.

### 1.4 MVR's matrix is a different type — do not share code

`pymvr/value.py:93-110` parses MVR's `Matrix` as **four groups of three** floats, and the fourth group is
the *translation*:

```python
self.matrix = [
    [component[0], component[1], component[2], 0],
    [component[3], component[4], component[5], 0],
    [component[6], component[7], component[8], 0],
    [component[9], component[10], component[11], 0],   # <- origin, i.e. 4th ROW
]
```

and BlenderDMX's MVR path scales exactly that row and then transposes the whole thing:

```python
# blender-dmx/mvr.py:42, :129-144
MVR_UNIT_SCALE = 0.001
def get_matrix(obj, mtx):
    …
    scaled[3][0] *= MVR_UNIT_SCALE
    scaled[3][1] *= MVR_UNIT_SCALE
    scaled[3][2] *= MVR_UNIT_SCALE
    …
    obj_mtx = Matrix(scaled).transposed()
```

So the metres-vs-millimetres boundary DESIGN.md §4.3 asks about is precisely this: **GDTF geometry is
metres with translation in the 4th column; MVR placement is millimetres with translation in the 4th row,
in a 4×3 matrix.** They are different types that happen to share a name. Convert and transpose once, at
the MVR import boundary, exactly as DESIGN.md §4.3 already plans — and give the two types different names
in `gdtf-ts` so they can never be passed to each other.

**Verdict on ticket candidate 2 (pymvr / the open-stage ecosystem more broadly): a clean negative for this
ticket.** pymvr is scene placement, not fixture-internal geometry; it contributes nothing to the spatial
resolution of a GDTF file beyond this units-boundary datum. pygdtf is a different matter — see §7.

---

## 2. Transform accumulation down the tree

### 2.1 The spec settles the semantics; it is unambiguous

`gdtf-spec.md:1113-1120` (the Models section, immediately after Table 33):

> The mesh of each fixture part shall be drawn around its own suspension point. The zero point of a device
> does not necessarily have to contain the offset related to the yoke, but it must be centered on its axis
> of rotation. **The offset is defined by the geometry and has to be related to its parent geometry and
> not to the base.**
>
> Note 1: In general, the offsets are mostly negative, because the device is displayed in a hanging
> position.

So: each geometry's `Position` is **relative to its parent geometry**, and the world transform of a node
is the ordinary product down the path from the mode's root geometry. Every geometry-type table
(Tables 35–55) repeats "Relative position of geometry; Default value: Identity Matrix" for `Position`
(`gdtf-spec.md:1233`, `1256`, `1279`, `1301`, `1324`, `1347`, `1370`, `1425`, …).

Note 1 is a useful sanity check for a test suite: in a well-formed fixture the Z offsets down the trunk
should mostly be negative, and the LED PAR above matches (beam at −0.134 below the body).

### 2.2 What the implementations actually do — and why neither is copyable as-is

**Clay Paky is the clean one and is the model to follow.** `CPFActorGeometryTree.cpp:190-253`,
`CreateTreeBranch`:

```cpp
USceneComponent* CurrentComponent = this->CreateAndAttachSceneComponent(Parent, Geometry->Name);
FVector Location = Geometry->Position.GetColumn(3);   // Location on last column
FRotator ElementRotation;
FCPGDTFImporterUtils::MatrixToRotator(Geometry->Position, &ElementRotation);
CurrentComponent->SetRelativeLocationAndRotation(Location, ElementRotation);
for (UCPGDTFDescriptionGeometryBase* ChildGeometry : Geometry->Childrens) {
    if (ChildGeometry) this->CreateTreeBranch(CurrentComponent, ChildGeometry, Models, FixturePackagePath);
    …
}
```

One scene node per geometry, transform set as a **relative** transform, children attached to it, recursion.
That is exactly the shape `gdtf-ts` wants and exactly what the spec describes. The mesh is a *child* of
the geometry node rather than the node itself (`CreateStaticMeshComponentChild`, `CPFActorGeometryTree.cpp:319`), which keeps
the mesh's own normalisation scale from contaminating the hinge transform — worth copying, because a
three.js `Object3D` per geometry with a `Mesh` child is the same separation.

**BlenderDMX delegates accumulation to Blender's scene graph and is therefore not a readable algorithm.**
`buildCollection` runs two passes over the tree (`gdtf.py:829-830`):

```python
load_geometries(root_geometry)    # gdtf.py:373 — create one Blender object per geometry, meshes loaded
update_geometry(root_geometry)    # gdtf.py:745 — set matrix_local, set parent, recurse
```

`update_geometry` calls `add_child_position(geometry)` (§1.3), then for each child calls
`constraint_child_to_parent` before recursing:

```python
# gdtf.py:735-743
def constraint_child_to_parent(parent_geometry, child_geometry):
    obj_parent = objs[sanitize_obj_name(parent_geometry)]
    obj_child  = objs[sanitize_obj_name(child_geometry)]
    obj_child.parent = obj_parent
    obj_child.matrix_parent_inverse = obj_parent.matrix_world.inverted()
```

Blender composes as `world = parent.matrix_world @ matrix_parent_inverse @ matrix_basis`. Setting
`matrix_parent_inverse` to the parent's inverted world matrix would, if the parent's world matrix were
current, **cancel the parent transform entirely** and make every `Position` absolute — the opposite of
what the spec says. It does not do that in practice, for two reasons worth stating so nobody copies the
line: the objects are not linked into any collection until the very end of `buildCollection`
(`gdtf.py:948-949`), so the depsgraph never evaluates them and `matrix_world` stays at whatever it was
after `obj.matrix_basis.identity()` (`gdtf.py:477`); and the same idiom appears twice, transparently
cargo-culted, with parent and child swapped —

```python
# gdtf.py:626-629, in create_beam: light_object is the CHILD of obj_child
light_object.parent = obj_child
obj_child.matrix_parent_inverse = light_object.matrix_world.inverted()   # sets it on the parent
```

**Takeaway for `gdtf-ts`:** compose explicitly. `worldMatrix = parentWorld · localMatrix`, threaded down
a depth-first walk, with the mode's root geometry seeded at identity. Do not model it on BlenderDMX's
parenting, and do not port `matrix_parent_inverse` in any form.

### 2.3 Where the walk starts

Both implementations start from the geometry named by the active DMX mode's `Geometry` attribute
(`DMXMode` Table, `gdtf-spec.md:1810`: *"Name of the first geometry in the device; Only top level
geometries are allowed to be linked"*). BlenderDMX: `root_geometry = profile.geometries.get_geometry_by_name(dmx_mode.geometry)`
(`gdtf.py:360`), with a fallback to `dmx_modes[0]` if the named mode is missing (`gdtf.py:356-358`) —
useful for MVR imports where the GDTF was substituted. pygdtf does the same and additionally falls back to
`self[0].name` if the mode names no geometry (`pygdtf/geometries.py:48-65`). Mizer, by contrast, **drops
the whole mode** if the root geometry is not found (see the companion document §3); the visualisers are
more forgiving. Beamhouse should follow the visualisers: warn and fall back, do not lose the fixture.

### 2.4 Which element types the walk must handle

Table 34, *Geometry Children Types*, `gdtf-spec.md:1189-1210` — fifteen types, not four:
`Geometry`, `Axis`, `FilterBeam`, `FilterColor`, `FilterGobo`, `FilterShaper`, `Beam`, `MediaServerLayer`,
`MediaServerCamera`, `MediaServerMaster`, `Display`, `Laser`, `WiringObject`, `Inventory`, `Structure`,
`Support`, `Magnet`. Every one of them carries `Name` / `Model` / `Position` and may have children, so
**all of them must be walked and transformed even if their kind is ignored** — a `FilterColor` node with
a `Beam` child is legal, and skipping the filter node loses the beam.

This is where BlenderDMX is a genuinely useful map of "what a visualiser must classify". Its
`get_geometry_type_as_string` (`gdtf.py:486-503`) collapses the tree to five tags —
`camera` / `beam` / `laser` / `axis` / `normal` — and its own comment is the design note:

```python
# From these, we end up using "beam" and "pigtail".
# The Pigtail is a special primitive type and we don't have access to get to know this here
# Even axis is not needed, as we rotate the geometry based on attributes during controlling
```

That is §6's finding stated by the implementer: `<Axis>` carries no information a visualiser needs.

Note the recursion for `GeometryReference` in that function (`gdtf.py:500-502`) resolves the *target's*
kind — so a reference to a `Beam` is itself tagged `beam`. Beamhouse's node classifier needs the same.

---

## 3. `PrimitiveType` and fallback geometry

### 3.1 What the spec defines — and what it conspicuously does not

Table 32, `gdtf-spec.md:1068`:

> PrimitiveType | Enum | Type of 3D model; The currently defined values are: "Undefined", "Cube",
> "Cylinder", "Sphere", "Base", "Yoke", "Head", "Scanner", "Conventional", "Pigtail", "Base1_1",
> "Scanner1_1", "Conventional1_1"; TODO Default value: "Undefined"

(The stray `TODO` is in the published spec.) The XSD enumerates the same thirteen values
(`gdtf.xsd:995-1013`). **The spec gives no description, no dimensions and no geometry for any of them.**
It never says what a `Yoke` looks like. There is exactly one normative constraint that applies to all of
them, Table 32's dimension rule (`gdtf-spec.md:1135-1139`):

> The dimension XML attributes of model (see table 32) are always used, no matter the scaling and ratio of
> the mesh file. The mesh is explicitly scaled to this dimension. The length defines the dimension of the
> model on the X axis, the width on the Y axis and the height on the Z axis.

So whatever mesh you use — shipped or primitive — you **normalise its bounding box and rescale it to
`(Length, Width, Height)` in metres**. Both implementations do exactly this and it is the single most
copyable rule in this whole document:

```python
# blender-dmx/gdtf.py:65-81, load_gdtf_primitive
obj.data.transform(Matrix.Diagonal((
    model.length / obj.dimensions.x,
    model.width  / obj.dimensions.y,
    model.height / obj.dimensions.z,
)).to_4x4())
```

```cpp
// claypaky/…/CPFActorGeometryTree.cpp:346-347
FVector ActualSize   = StaticMesh->GetBounds().GetBox().GetSize();
FVector ScaleFactor  = FVector(Model.Length, Model.Width, Model.Height) / ActualSize;
```

Guard the divide: BlenderDMX clamps with `max(obj.dimensions[val], 1e-09)` for meshes
(`gdtf.py:286-289`) and logs an error for any zero/negative dimension (`gdtf.py:272-284`), because real
files ship degenerate meshes. The LED PAR test file has a `Beam` model with `Height="0.000023"` — 23
microns — which is a legal and common way to say "this is a flat emitter face".

### 3.2 The official primitive meshes exist and are royalty-free — this overturns DESIGN.md §5.1

`mvrdevelopment/spec/meshes/` contains the canonical meshes, and the repository README (line 22) grants
them explicitly:

> The folder [meshes] contains the default meshes that are used by the GDTF spec. **They are free to use,
> modify, and distribute, including in commercial applications, without any licensing fees or royalties.**

Contents:

```
meshes/1.0/  primitivetype_base.3ds  primitivetype_conventional.3ds  primitivetype_head.3ds
             primitivetype_scanner.3ds  primitivetype_yoke.3ds
meshes/1.1/  primitivetype_base_1.1.3ds  primitivetype_conventional_1.1.3ds  primitivetype_scanner_1.1.3ds
```

The 1.1 folder contains exactly the three types that have `1_1` enum values (`Base1_1`, `Scanner1_1`,
`Conventional1_1`) — `Head` and `Yoke` were not revised, which is why there is no `Head1_1`. That
correspondence is a good cross-check that these are the real assets and not an incidental folder.

DESIGN.md §5.1's "Generate those procedurally" therefore needs a split:

| PrimitiveType | Beamhouse v1 |
| --- | --- |
| `Cube`, `Cylinder`, `Sphere` | generate procedurally — trivially, see §3.3 |
| `Pigtail` | generate as a `Cube`, and tag the node so it can be hidden (§3.4) |
| `Base`, `Yoke`, `Head`, `Scanner`, `Conventional`, `Base1_1`, `Scanner1_1`, `Conventional1_1` | **convert the spec's `.3ds` files to `.glb` once, ship the eight `.glb`s as static assets** |
| `Undefined` | no primitive — the mesh must come from the zip (§4) |

**Do not take BlenderDMX's `assets/primitives/{Base,Conventional,Head,Scanner,Yoke}.glb`.** They are
almost certainly conversions of exactly these five 1.0 meshes (same five names, same set), but they sit
inside a GPL-3 repository. `blender-dmx/licenserc.toml` excludes `assets` from the *GPL header insertion
tool*, which is a lint configuration, not a licence grant, and `ASSETS_ATTRIBUTION.md` lists icons only —
the primitive `.glb`s are not attributed to anything. Converting from `mvrdevelopment/spec` directly costs
one `assimp` invocation and removes the question entirely. Clay Paky's `Content/GenericMeshes/*.uasset`
are MIT but are Unreal binary assets, so they are no easier to reuse than the source `.3ds`.

Clay Paky's set is the more complete map of what is needed: `Base`, `Base1_1`, `Conventional`,
`Conventional1_1`, `Cube`, `Cylinder`, `Head`, `Pigtail`, `Scanner`, `Scanner1_1`, `Sphere`, `Yoke` — all
twelve non-`Undefined` types, resolved by enum name
(`CPGDTFImporterUtils.cpp:267-274`: `AssetPath += "GenericMeshes/" + AssetName + "." + AssetName;`).
BlenderDMX ships only five and **collapses the `1_1` variants into the 1.0 ones**:

```python
# blender-dmx/gdtf.py:410-414
# (From GDTF v1.1 on, the 1_1 was added to the end of primitive names, we just ignore them and use the same primitives)
if primitive[-3:] == "1_1":
    primitive = primitive[:-3]
    model.primitive_type = pygdtf.PrimitiveType(primitive)
```

That is a divergence from the spec, which ships genuinely different geometry for 1.1. Beamhouse can ship
both without extra work, so it should.

### 3.3 The procedural primitives, precisely

BlenderDMX builds `Cube`, `Plane`, `Cylinder`, `Sphere` and `Pigtail` from Blender's own generators and
then rescales to the model dimensions (`gdtf.py:43-63`):

- `Cube` and `Pigtail`: `primitive_cube_add(size=1.0)` — a unit cube centred on its origin.
- `Plane`: `primitive_plane_add(size=1.0)` — note `Plane` is **not** a GDTF `PrimitiveType`; BlenderDMX
  synthesises it for the gobo projection quad (`gdtf.py:632-645`). Ignore it in the parser.
- `Cylinder`: `primitive_cylinder_add(vertices=16, radius=0.5, depth=1.0)` — axis along **Z**, 16 sides.
- `Sphere`: `primitive_uv_sphere_add(segments=16, ring_count=16, radius=0.5)`.
- then `obj.data.transform(Matrix.Diagonal((length, width, height)).to_4x4())`.

Since everything is rescaled to the model box anyway, the only decisions that carry over are: unit size,
origin at the centre, cylinder axis along **+Z**, and 16 radial segments (which is a sane budget given the
spec's 1200-vertex cap for a whole device, `gdtf-spec.md:1081`). three.js's
`BoxGeometry(1,1,1)`, `CylinderGeometry(0.5, 0.5, 1, 16)` rotated to Z-up, and `SphereGeometry(0.5,16,16)`
are direct equivalents.

### 3.4 `Pigtail` is not a shape, it is a marker

`Pigtail` is the fixture's power lead. BlenderDMX creates it as a cube and then tags it separately so the
rest of the addon can hide it (`gdtf.py:464-465`: `if model.primitive_type.value == "Pigtail":
obj["geometry_type"] = "pigtail"`), and it is deliberately excluded from the "load the shipped mesh
instead" branch (`gdtf.py:415-419`, see §4.1). Beamhouse should emit the node, tag it, and not draw it by
default — a dangling cable is noise in a visualiser.

---

## 4. Model files: extraction from the zip, formats and LOD

### 4.1 Which wins, `PrimitiveType` or `File`? The two implementations disagree, and BlenderDMX is right

This matters more than it sounds, because the spec's own examples set **both** on nearly every model:
`<Model Name="Body" Length="0.25" Width="0.25" Height="0.4" PrimitiveType="Cylinder" File="Body"/>`
(`spec/examples/models.md:13`). Every PARcan, moving head and LED panel example does the same.

**BlenderDMX prefers the file** (`gdtf.py:415-448`):

```python
if (model.primitive_type.value == "Undefined") or (
    model.file is not None and model.file.name != "" and model.primitive_type.value != "Pigtail"
):
    try:
        obj = DMX_GDTF.loadModel(profile, model, use_high_mesh)
    except Exception as e:
        …
        if model.primitive_type.value == "Undefined":
            model.primitive_type.value = "Cube"
        if model.primitive_type.value in ["Base","Conventional","Head","Yoke","Scanner"]:
            obj = DMX_GDTF.load_gdtf_primitive(model)
        else:
            obj = DMX_GDTF.load_blender_primitive(model)
elif model.primitive_type.value in ["Base","Conventional","Head","Yoke","Scanner"]:
    obj = DMX_GDTF.load_gdtf_primitive(model)
else:
    obj = DMX_GDTF.load_blender_primitive(model)
```

i.e. *any* non-empty `File` (except on a `Pigtail`) wins; the primitive is the **fallback**, used when
`File` is empty or when the mesh fails to load. That is the correct behaviour for a visualiser and matches
the ticket's framing.

**Clay Paky prefers the primitive** (`CPFActorGeometryTree.cpp:336-339`):

```cpp
if (Model.PrimitiveType == ECPGDTFDescriptionModelsPrimitiveType::Undefined) {
    TArray<UStaticMesh*> Meshes = FCPGDTFImporterUtils::LoadMeshesInFolder(FixturePackagePath + "/models/" + …);
    if (Meshes.Num() > 0) StaticMesh = Meshes[0];
} else StaticMesh = FCPGDTFImporterUtils::LoadGDTFGenericMesh(Model.PrimitiveType);
```

Only `Undefined` reaches the zip. Applied to the spec's own examples this renders every fixture as a
generic primitive and never shows the shipped mesh. Read Clay Paky for the tree walk (§2.2) and the
primitive set (§3.2), **not** for this branch.

**Rule for `gdtf-ts`:** if `File` is non-empty and the resource resolves, use the mesh; otherwise fall
back to the primitive; if `PrimitiveType` is `Undefined` and there is no resolvable file, emit an empty
transform node (BlenderDMX substitutes a 0.1 mm cube for it, `gdtf.py:388-397`, with the comment "Empty
geometries are allowed as of GDTF 1.2" — for three.js an `Object3D` with no mesh is cleaner). Note
`geometry.model` may legitimately be `None`; that path must not throw.

### 4.2 Paths inside the zip, and the LOD variants

Table 32 (`gdtf-spec.md:1069`) and Table 33 (`gdtf-spec.md:1085-1095`):

- `File` is the **name without extension and without subfolder**.
- `./models/3ds/`, `./models/gltf/`, `./models/svg/` for the default LOD; `3ds_low` / `gltf_low` (≈30% of
  default vertex count), `3ds_high` / `gltf_high` (unbounded) for the optional variants.
- "Preferable format for the 3D model is GLTF." glTF must be binary `.glb`, version 2.0, no extensions, no
  animations, jpeg/png textures only, all vertex attributes `GL_FLOAT`
  (spelled out in `gdtf-rs/src/resource.rs:96-121`, which reproduces the spec's requirements as doc
  comments — the clearest single statement of them in any of the sources).
- "Software that is utilizing GDTF files should always be able to read both 3ds and GlTF file formats."

The three implementations resolve this differently, and the differences are the port's checklist:

| | resolution strategy | LODs | 3DS |
| --- | --- | --- | --- |
| **pygdtf** (`pygdtf/__init__.py:305-321`) | probes the zip's `namelist()` against a **fixed priority list** and records the first hit as `model.file.extension` + `model.file_lod` | gltf → gltf_high → gltf_low → 3ds → 3ds_high → 3ds_low → svg | yes |
| **blender-dmx** (`gdtf.py:217-295`, path building at `:221-259`) | builds `models/gltf{_high}/{name}.{ext}` from a user preference, falls back to the non-`_high` path if absent | default + high only; **never uses `_low`** | yes, via `io_scene_3ds` |
| **claypaky** (`CPGDTFImporterUtils.cpp:127`) | hardcodes `models/gltf/{File}.glb` | default only | no — README: *"Incompatible with GDTF < 1.2 because of `.3ds` models only"* |

pygdtf's probe-the-namelist approach is the one to copy — it is MIT, it is six lines, and it handles the
real-world case where a file ships only `gltf_high` or only `3ds`:

```python
available_paths = [
    ("glb", "default", f"models/gltf/{model.file.name}.glb"),
    ("glb", "high",    f"models/gltf_high/{model.file.name}.glb"),
    ("glb", "low",     f"models/gltf_low/{model.file.name}.glb"),
    ("3ds", "default", f"models/3ds/{model.file.name}.3ds"),
    ("3ds", "high",    f"models/3ds_high/{model.file.name}.3ds"),
    ("3ds", "low",     f"models/3ds_low/{model.file.name}.3ds"),
    ("svg", "default", f"models/svg/{model.file.name}.svg"),
]
for extension, lod, path in available_paths:
    if path in self._package.namelist():
        model.file.extension = extension
        model.file_lod = lod
        model.file.crc = self._package.getinfo(path).CRC
        break
```

Beamhouse should reorder to prefer `gltf` → `gltf_low` → `gltf_high` (a browser wants the small one) and
should treat a `3ds`-only fixture as **unsupported with a named warning**, not as a broken fixture — there
is no reasonable 3DS loader for the browser, and DESIGN.md §9.1's URL-fragment budget argues against one.
That is a real, quantifiable coverage question that belongs in the profile-availability research, not here.

The names are case-sensitive inside a zip and `File` may contain spaces; `sanitize`-style rewriting of the
model name (BlenderDMX's `sanitize_obj_name`, `util.py:66-71`) must **not** be applied to the zip path.

### 4.3 Multi-part GLBs

Real GDTF `.glb` files frequently contain several mesh nodes with their own transforms. BlenderDMX has a
whole function for flattening them, and its docstring is the warning worth carrying over
(`gdtf.py:297-303`):

> This ensures that glbs made of multiple parts are used as a single object. It feels convoluted but
> without this and all particular steps, some fixture files do not load correctly. Surely there is better
> way. Can be tested on files as per this issue: <https://github.com/open-stage/blender-dmx/issues/67>

The load-bearing part is that each part's own `matrix_basis` must be **baked into its vertices** before
joining (`gdtf.py:317-324`), because the bounding box used for the §3.1 rescale must be the box of the
assembled object, not of the untransformed parts. In three.js the equivalent is: parse the GLB, then
compute the `Box3` of the whole `gltf.scene` with world matrices updated, and apply the normalisation
scale to that group — not to each mesh. Getting this wrong makes multi-part fixtures the wrong size in a
way that only shows on some files, which is exactly the bug BlenderDMX's issue #67 describes.

BlenderDMX also strips animation data from imported models (`gdtf.py:339-341`); the spec forbids
animations in GDTF `.glb`s, but files in the wild have them.

---

## 5. `GeometryReference` expansion into positioned nodes — the real gap

### 5.1 What the spec says

Table 48, `gdtf-spec.md:1571-1597`:

| Attribute | Description |
| --- | --- |
| `Name` | The unique name of geometry. |
| `Position` | Relative position of geometry; Default value: Identity Matrix |
| `Geometry` | Name of the referenced geometry. **Only top level geometries are allowed to be referenced.** |
| `Model` | Optional. *"The model only replaces the model of the parent of the referenced geometry. The models of the children of the referenced geometry are not affected. … If model is not set, the model is taken from the referenced geometry."* |

and the children rule, `gdtf-spec.md:1584-1592`:

> As children, the Geometry Type Reference has a list of breaks. **The count of the children depends on
> the number of different breaks in the DMX channels of the referenced geometry.** If the referenced
> geometry, for example, has DMX channels with DMX break 2 and 4, the geometry reference has to have 2
> children. The first child with DMX offset for DMX break 2 and the second child for DMX break 4. If one
> or more of the DMX channels of the referenced geometry have the special value "Overwrite" as a DMX
> break, the DMX break for those channels and the DMX offsets need to be defined.

**One `<GeometryReference>` element is one instance.** Its `<Break>` children are a per-DMX-break offset
table for that one instance, not a repeat count. The spec's own LED-panel example
(`spec/examples/geometry.md`, "Example - LED Panel") makes this unambiguous: a 3×3 panel is written as
**nine** `<GeometryReference>` elements, each with exactly one `<Break DMXOffset="…"/>`, each with its own
`Position` placing it in the grid:

```xml
<Beam Name="Pixel" Model="Pixel"
      Position="{1,0,0,0}{0,1,0,0}{0,0,1,-0.020000}{0,0,0,1}" LampType="LED" />
<Geometry Name="Body" Model="Body">
  <GeometryReference Name="Pixel1" Position="{1,0,0,-0.100000}{0,1,0,0.100000}{0,0,1,0}{0,0,0,1}" Geometry="Pixel">
    <Break DMXOffset="1" />
  </GeometryReference>
  <GeometryReference Name="Pixel2" Position="{1,0,0,0.000000}{0,1,0,0.100000}{0,0,1,0}{0,0,0,1}"  Geometry="Pixel">
    <Break DMXOffset="4" />
  </GeometryReference>
  … Pixel3 … Pixel9 …
</Geometry>
```

(Abridged; the real values are six decimal places. Two other things are visible in that example and are
worth knowing before you write a parser against real files: `Pixel5` has **no** `Position` attribute at
all and references `Geometry="LED"`, a name that does not exist in the example — the published spec's own
example contains a typo and a missing element. Handle a dangling `Geometry` link by warning and skipping
the node, never by throwing.)

This is the answer to DESIGN.md §5.3 and to the ticket's "this is what the strip class depends on": **a
pixel strip's per-pixel positions live on the `GeometryReference` nodes themselves**, and the referenced
`Beam`'s own `Position` (here `Z = −0.02`, the light-exit offset in front of the panel face) is the same
for all of them. Collinearity detection (ticket 7) therefore operates on the world translations of the
expanded reference nodes, which is exactly the data a correct §2 walk produces.

### 5.2 Is the referenced geometry's own `Position` composed, or replaced? — unresolved, and the two implementations differ

The spec **does not say**. It says the `Model` attribute "replaces", explicitly; it says nothing
equivalent for `Position`, and describes `Position` on both nodes with the identical phrase "Relative
position of geometry". The two readings:

- **Compose** — `world(instance) = world(refNode.parent) · refNode.Position · target.Position`. Under this
  reading the LED panel's pixels sit at `(±0.1, ±0.1, −0.02)`, i.e. the emitter faces sit 20 mm proud of
  the body, which is what "the position of the fixture's light output (usually the position of the lens)"
  (`gdtf-spec.md:1390-1392`) is for.
- **Replace** — the reference's `Position` stands in for the target's. Under this reading all nine pixels
  sit at `Z = 0`, flush in the plane of the body, and the `Z = −0.02` on `<Beam Name="Pixel">` is dead data.

**BlenderDMX replaces**, and does so by writing the transform twice with the second call clobbering the
first (`gdtf.py:775-787`):

```python
reference = copy.deepcopy(profile.geometries.get_geometry_by_name(geometry.geometry))
reference.original_name = geometry.name
if hasattr(geometry, "parent_name"):
    reference.parent_name = geometry.parent_name
reference.name = sanitize_obj_name(geometry)

# apply position of the reference
add_child_position(reference)

# apply position of the referring geometry
reference.position = geometry.position
add_child_position(reference)
```

`add_child_position` **assigns** `obj_child.matrix_local` (§1.3) — it does not multiply. Both calls target
the same single Blender object (`objs[sanitize_obj_name(reference)]`, and `reference.name` was just set to
the reference node's sanitised name), so the first call's result is entirely discarded. The comments say
the author intended to apply both; the code applies one. Whether that is a bug or an accidental encoding
of the "replace" reading, the net effect is: **the referenced geometry's own `Position` is dropped.**

**Clay Paky composes**, because it makes the referenced tree a genuine child of the reference node's
scene component (`CPFActorGeometryTree.cpp:229-250`, the `<Break>` loop at `:241`) — but it gets the instance count wrong:

```cpp
if (ReferencedGeometry != nullptr) {
    for (FDMXImportGDTFBreak Break : GeometryReference->Breaks) {
        this->NamePrefix = FString::FromInt(Break.DMXBreak).AppendChar('-').Append(FString::FromInt(Break.DMXOffset));
        this->NamePrefix.AppendChar('-');
        this->CreateTreeBranch(CurrentComponent, ReferencedGeometry, Models, FixturePackagePath);
    }
    this->NamePrefix = "";
}
```

One full copy of the referenced subtree **per `<Break>` child**. For the single-break case that is right,
which is why it works on most files. For the spec's own two-break example ("if the referenced geometry has
DMX channels with DMX break 2 and 4, the geometry reference has to have 2 children") it produces two
co-located copies of the same physical part.

**So: BlenderDMX gets the count right and the transform wrong; Clay Paky gets the transform right and the
count wrong. Neither is a correct reference for §5.3, and the ticket's assumption that "BlenderDMX must
solve every item above" does not hold for this item.**

`gdtf-ts` should implement: **one instance per `<GeometryReference>` element; transform composed as
`refNode.Position · target.Position`; `<Break>` children consumed only by the channel-offset arithmetic**
(which is the half Mizer *does* have a reference for — `DmxChannel::with_offsets`, companion document §3 —
and which pygdtf implements more completely at `pygdtf/utils/__init__.py:174-186`, including the
`Overwrite` break case that Mizer ignores). Then write a test asserting the composition, because it is a
decision this document cannot settle from the sources and a real fixture will settle it in one look.

### 5.3 Naming the expanded nodes

Both implementations prefix. BlenderDMX threads a `reference_root` attribute down the referenced subtree
and builds names as `{ReferenceName}_{ChildName}` (`util.py:66-71`, set at `gdtf.py:377-387` in the load
pass and `gdtf.py:818-821` in the transform pass); Clay Paky uses `{DMXBreak}-{DMXOffset}-{Name}`. This is
structurally the same trick as Mizer's string-prefix walk (companion document §1b) and is what keeps two
references to the same target from colliding in a flat name→node map.

One hazard to avoid when porting BlenderDMX's version: it calls
`setattr(sub_geometry, "reference_root", …)` on the **shared** pygdtf objects of the referenced subtree
(`gdtf.py:386`, and `:483` for grandchildren), mutating the parsed document as a side effect of the walk. Two references to the same
target take turns overwriting each other's marker. It happens to work because the name is read
immediately, but it makes the parse tree non-reentrant. Thread the prefix as a parameter instead.

Nested references (a referenced tree that itself contains a `GeometryReference`) get the *outermost*
prefix only in BlenderDMX, not the chain — a latent collision. pygdtf's `_expand_tree`
(`pygdtf/geometries.py:123-176`) is the more careful implementation: it deep-copies rather than mutating,
and it carries a `_visited` set keyed by `(name, type)` with `try/finally` discard, specifically to break
reference cycles. That cycle guard is worth copying verbatim — a self-referencing GDTF is a stack
overflow otherwise, and nothing in the format forbids one.

---

## 6. Axis geometries as pan/tilt hinges

### 6.1 The spec fixes the axes, globally

`gdtf-spec.md:1100-1102`, in the Models section:

> The device shall be drawn in a hanging position displaying the front view. That results in the **pan axis
> is Z aligned, and the tilt axis is X aligned.**

and `gdtf-spec.md:1113-1116`:

> The mesh of each fixture part shall be drawn around its own suspension point. The zero point of a device
> does not necessarily have to contain the offset related to the yoke, but it must be centered on its axis
> of rotation.

So pan is a rotation about the hinge node's **local Z**, tilt about its **local X**, and the geometry's own
origin is already the pivot — no separate pivot data to find. That last sentence is why the transform in
§2 is sufficient: the rotation composes as an extra local rotation at that node, before its children.

### 6.2 `<Axis>` carries no information — the hinge is chosen by DMX channel, not by element type

Table 36 (`gdtf-spec.md:1250-1262`) gives `Axis` exactly the same three attributes as a plain `Geometry` —
`Name`, `Model`, `Position` — plus naming *recommendations* ("Recommendation for an axis-geometry is
'Yoke'… representing the lamp housing of a moving head is 'Head'"). There is no axis vector, no limit, no
direction. The binding comes from the DMX side, stated in the spec's own worked example
(`spec/examples/geometry.md`, "Example - Basic Moving Head"):

> A DMX channel that has a pan or tilt attribute assigned to its logical channel affects the rotation of
> the geometry it is linked to.

Both implementations do exactly that and **never consult the element type**:

```python
# blender-dmx/gdtf.py:832-851, then :853-854
def get_axis(attribute):
    axis_objects = []
    for obj in objs.values():
        for channel in dmx_channels_flattened:
            if attribute == channel.attribute.str_link and channel.geometry == obj.get("original_name", "None"):
                obj["mobile_type"] = "head" if attribute == "Tilt" else "yoke"
                obj["geometry_type"] = "axis"
                axis_objects.append(obj)
        for channel in virtual_channels:      # same test again over virtual channels
            …
    return axis_objects

yokes = get_axis("Pan")
heads = get_axis("Tilt")
```

```cpp
// claypaky/…/CPGDTFFixtureComponentBase.h:689-704
FName geometryName = ch.GDTFDMXChannelDescription.Geometry;
…
USceneComponent** geometry = this->GetParentFixtureActor()->GeometryTree.Components.Find(geometryName);
if (geometry) this->AttachedGeometries.Add(type, *geometry);
```

Note BlenderDMX's `get_axis` **overwrites** `geometry_type` to `"axis"` on whatever node the Pan/Tilt
channel names, whether or not it was parsed as an `<Axis>`, and it scans virtual channels too — a fixture
whose Pan is a virtual channel still gets a hinge.

### 6.3 Applying the rotation

`blender-dmx/fixture.py:2518-2536`:

```python
def updatePTDirectly(self, geometry, axis_type, value, current_frame):
    if axis_type == "pan":
        mobile_type = "yoke"; offset = 2       # Euler Z
    else:  # tilt
        mobile_type = "head"; offset = 0       # Euler X
    …
    value = value + geometry.get("applied_rotation", [0, 0, 0])[offset]
    geometry.rotation_mode = "XYZ"
    geometry.rotation_euler[offset] = value
```

`claypaky/…/CPGDTFMovementFixtureComponent.cpp:183-196` — Unreal's `FRotator(Pitch, Yaw, Roll)`, so Pan
writes **Yaw** (Z) and Tilt writes **Roll** (X):

```cpp
case ECPGDTFMovementFixtureType::Pan: {
    FRotator CurrentRotation = this->geometryP->GetRelativeRotation();
    this->geometryP->SetRelativeRotation(FRotator(CurrentRotation.Pitch, value, CurrentRotation.Roll));
}
case ECPGDTFMovementFixtureType::Tilt: {
    FRotator CurrentRotation = this->geometryT->GetRelativeRotation();
    this->geometryT->SetRelativeRotation(FRotator(CurrentRotation.Pitch, CurrentRotation.Yaw, value));
}
```

Spec, BlenderDMX and Clay Paky agree three ways: **pan → local Z, tilt → local X, applied at the geometry
node the channel names.** This is the most solid finding in the document.

The `applied_rotation` term in BlenderDMX's version is the important detail for a port. Writing a single
Euler component **replaces** the node's rotation, destroying the static rotation that came from the
geometry's own `Position` matrix — so the static Euler is stashed at build time
(`gdtf.py:731-733`, `obj_child["applied_rotation"] = obj_child.rotation_euler`) and added back on every
frame. In `gdtf-ts` the clean equivalent is to keep the static local matrix immutable and compose
`local = staticLocal · R_z(pan) · R_x(tilt)` per tick, which sidesteps the whole problem — but only if
pan and tilt land on *different* nodes. They usually do (Yoke and Head), and BlenderDMX's data model
assumes it (one `"yoke"`, one `"head"`). A fixture that routes both to one geometry needs the composed
form; write it that way from the start.

The value fed in is **degrees, from the ChannelFunction interpolation** (§7), converted at the call site:
`pan = math.radians(pan_vals[0])` (`fixture.py:1845`). It is not a 0–255 remap.

### 6.4 What both implementations do *not* do

Neither reads pan/tilt **limits** from the fixture. GDTF expresses them as the `PhysicalFrom`/`PhysicalTo`
of the Pan/Tilt `ChannelFunction` (e.g. −270°…+270°), which §7's interpolation yields for free — so
Beamhouse gets range clamping as a side effect of doing §7 correctly, and does not need a separate model.
Neither implements `PanTiltRotate`-style compound attributes; BlenderDMX handles `PanRotate`/`TiltRotate`
(continuous rotation) as a separate driver path (`fixture.py:1653-1660`, `2299-2305`), out of scope for v1.

---

## 7. `ChannelFunction` interpolation and `modeMaster`

This is nominally the channel half, but the ticket asks for it and the spatial half is useless without it —
§6.3 needs degrees, and DESIGN.md §8.2's beam cone needs a zoom angle. Mizer has **no** reference for
either (companion document §6); these do.

### 7.1 `DMXTo` does not exist in the file — it is inferred

A `ChannelFunction` has `DMXFrom` but no `DMXTo`. The end of each range is *the next function's `DMXFrom`
minus one*, and the last one runs to the channel's full width. pygdtf implements the backfill in
`pygdtf/__init__.py:1694-1770` and it is the piece most likely to be got wrong in a from-scratch port:

```python
for channel_functions in function_containers.values():
    previous_function_dmx_from = None
    for channel_function in sorted(channel_functions,
                                   key=lambda cf: cf.dmx_from.value, reverse=True):
        byte_count = channel_function.dmx_from.byte_count if self.offset is None else len(self.offset)
        if previous_function_dmx_from is None:
            channel_function.dmx_to = DmxValue("0/1")
            channel_function.dmx_to.value = (1 << (byte_count * 8)) - 1     # max for the channel width
            channel_function.dmx_to.byte_count = byte_count
        else:
            channel_function.dmx_to = copy.deepcopy(previous_function_dmx_from)
            channel_function.dmx_to.value -= 1
        previous_function_dmx_from = channel_function.dmx_from
```

Two subtleties worth the citation:

1. **The functions are bucketed before sorting**, by `_channel_function_container_key`
   (`pygdtf/__init__.py:75-84`) = `(mode_master link, mode_from value, mode_from byte_count, mode_to
   value, mode_to byte_count)`. Functions under *different* mode-master conditions overlap in DMX range by
   design, so they must be range-terminated independently. A naive "sort all functions by DMXFrom and take
   the next one" produces garbage on any fixture that uses `ModeMaster` — which is exactly the case
   DESIGN.md §5.2 says must work in v1.
2. **The channel's width comes from `len(offset)`**, not from the `DMXValue`'s own byte count, whenever the
   channel has offsets. Same rule as Mizer's coarse/fine/finest/ultra inference (companion document §3).

The same loop backfills `ChannelSet.DMXTo` (last set ends at the function's end, others at the next set's
start − 1) and, where a `ChannelSet` omits `PhysicalFrom`/`PhysicalTo`, **derives them by interpolating
the parent function** at the set's own DMX bounds (`pygdtf/__init__.py:1751-1770`), tagging the result
`PhysicalSource("Function")`. That derivation is normative behaviour a port has to implement, not an
optimisation.

### 7.2 The interpolation itself — copy the formula, not the code

`pygdtf/utils/__init__.py:454-477`, duplicated verbatim into BlenderDMX at `fixture.py:127-140` (ChannelSet) and
`fixture.py:164-177` (ChannelFunction):

```python
dmx_range = dmx_to - dmx_from
if dmx_range == 0:
    return physical_from
if ((dmx_from - dmx_to) + physical_from) == 0:
    return (dmx_from - dmx_from) * (physical_to - physical_from)     # always 0
return (dmx_value - dmx_from) * (physical_to - physical_from) / (dmx_to - dmx_from) + physical_from
```

The middle branch is **dead and wrong** — its body evaluates to `0 * anything == 0` unconditionally, and
its guard mixes a DMX-domain difference with a physical-domain value, which is dimensionally meaningless.
It fires whenever `physical_from == dmx_to - dmx_from`, e.g. a Pan channel with `DMXFrom=0`, `DMXTo=255`,
`PhysicalFrom=255`. Rare, but it silently returns 0° instead of the correct angle. **Port the first and
third branches only.** This is the same shape of finding as the companion document's SGM `Macro` hack: the
reference implementations carry small empirical scars, and a port should copy the intent, not the lines.

### 7.3 `modeMaster`

`ModeMaster` / `ModeFrom` / `ModeTo` live on `ChannelFunction` (Table for ChannelFunction,
`gdtf-spec.md:1930-1932`):

> ModeMaster — Optional. Link to DMX Channel or Channel Function; Starting point DMX mode.
> ModeFrom / ModeTo — Only used together with ModeMaster; DMX start/end value; Default value: 0/1

BlenderDMX's resolution loop, `fixture.py:230-320` (`get_function_attribute_data`), is the readable
reference. The algorithm, stated plainly:

1. Assemble the channel's raw value across its offsets, MSB-first: `raw = (raw << 8) | byte` over the
   non-zero offsets (`fixture.py:1475-1499`). If the channel is wider than 16 bits, **normalise down to
   16 bits** (`_normalize_dmx_value`, `fixture.py:231-239`: `round(value * target_max / source_max)`)
   because the stored function ranges are 16-bit.
2. Walk the channel's functions in document order; take the first whose `[dmx_from, dmx_to]` contains the
   value.
3. If that function has a `mode_master`, read the master channel's current value the same way (its break
   and offsets are pre-resolved onto the function as `mm_dmx_break` / `mm_offsets` / `mm_offsets_bytes`)
   and require `mode_from <= master_value <= mode_to`. **If the check fails, keep walking** — the next
   function whose range also contains the value may be the active one. That "try another channel function
   or exit" branch (`fixture.py:305`) is the whole point of mode-master and the thing a naive
   implementation drops.
4. Interpolate to physical with §7.2, then let any matching `ChannelSet` override both the physical value
   and the wheel-slot index (`fixture.py:297-303`).
5. Return `(attribute, physical_value, wheel_slot)` — note the **attribute comes from the matched
   `ChannelFunction`, not from the `DMXChannel`**. A channel's meaning changes with its active function.
   That is a structural difference from Mizer's model, which reads only `LogicalChannel/Attribute`
   (companion document §6), and it is what makes `channel_function_attribute` rather than
   `channel.attribute` the key in BlenderDMX's big dispatch (`fixture.py:1647-1651`).

BlenderDMX caches the last `(dmx_value → attribute, value, slot)` per channel and skips the whole search
on an unchanged value (`fixture.py:1509-1531`). Given DESIGN.md §5.3's "resolve on a fixed 30 Hz tick,
diff against the previous frame", that is the same optimisation and worth building in from the start.

`ModeMaster` may link to either a `DMXChannel` or a `ChannelFunction`; pygdtf stores the raw link string
(`NodeLink("DMXChannel", xml_node.attrib.get("ModeMaster"))`, `pygdtf/__init__.py:2011`) and leaves
resolution to the consumer. Beamhouse must resolve both forms.

---

## 8. What a visualiser reads off a `<Beam>`

Table 41, `gdtf-spec.md:1364-1381`, with defaults — this is the table the companion document lists as a
pure gap:

| Attribute | Unit | Default | Beamhouse use |
| --- | --- | --- | --- |
| `BeamAngle` | degree | 25.0 | cone angle, **full** — apex to apex (DESIGN.md §8.2). **[corrected 2026-09-02 — #28]** this row said *half*-angle; see [ADR-0013](../adr/0013-atmosphere-is-one-closed-form-scattering-term.md). §8's own `BeamAngle > 180 → point light` rule below only parses under full-angle semantics, and BlenderDMX's `spot_size = radians(beam_angle)` is Blender's *total* cone angle |
| `FieldAngle` | degree | 25.0 | the 10%-intensity angle; outer falloff |
| `BeamRadius` | **meter** | 0.05 | cone radius at the origin — a beam is a frustum, not a cone |
| `BeamType` | enum | `Wash` | how to render; see below |
| `LuminousFlux` | lumen | 10000 | intensity scale |
| `ColorTemperature` | kelvin | 6000 | white point when there is no colour mixing |
| `LampType` | enum `Discharge`/`Tungsten`/`Halogen`/`LED` | `Discharge` | dimming curve, strike behaviour |
| `PowerConsumption` | Watt | 1000 | — |
| `ThrowRatio` | none | 1 | only for `BeamType="Rectangle"` |
| `RectangleRatio` | none | 1.7777 | only for `BeamType="Rectangle"` |
| `ColorRenderingIndex` | uint | 100 | — |
| `EmitterSpectrum` | Node | — | link into `PhysicalDescriptions/Emitters`; *"Default spectrum is a Black-Body with the defined ColorTemperature"* |

Normative rendering text, `gdtf-spec.md:1390-1408`:

> Use the Geometry Type "Beam" to describe the position of the fixture's light output (usually the
> position of the lens) and not the position of the light source inside the device. The origin of the
> Geometry Type "Beam" is the origin of the rendered beam. The origin of the Geometry Type "Beam" should
> not be covered by any faces of other geometries in order to not block the rendered beam.
>
> "Wash", "Fresnel", "PC" — A conical beam with soft edges and softened field projection.
> "Spot" — A conical beam with hard edges.
> "Rectangle" — A pyramid-shaped beam with hard edges.
> "None", "Glow" — No beam will be drawn, only the geometry will emit light itself.
>
> **The beam geometry emits its light into negative Z direction (and Y-up).**

So the beam direction is the node's local **−Z** after §2's accumulation, which is why the LED PAR's beam
sits at `Z = −0.134` and why the spec notes offsets are "mostly negative".

BlenderDMX's mapping of these onto a renderer (`gdtf.py:588-644`, `create_beam`) is worth reading for the
decisions rather than the code:

- `spot_size = radians(beam_angle)`, `shadow_soft_size = beam_radius`, `energy = luminous_flux`
  (`gdtf.py:607`, `:615`, `:616`).
- soft-vs-hard edge from `BeamType`, exactly as the spec's list says
  (`calculate_spot_blend`, `gdtf.py:712-719`: `1.0` for `Wash`/`Fresnel`/`PC`, `0.0` otherwise).
- `BeamType` in `("None", "Glow")` → **no beam object at all**, only the emissive geometry
  (`gdtf.py:596-597`, and again in `create_bulb` at `gdtf.py:654-655`).
- a `BeamAngle` of exactly 360, or `> 180` on a fixture with no Zoom channel, is rendered as a **point
  light** rather than a spot (`gdtf.py:760-765`, and for referenced beams again at `:790-795`) — a pragmatic reading of "a 200° cone is a bulb, not a
  beam" that Beamhouse's beam shader will want too.
- `has_gobos` / `has_zoom` are precomputed once per mode by substring-matching the attribute names of all
  channels (`gdtf.py:367-371`: `if "Gobo" in ch.attribute.str_link` at :368), a cheap trick for deciding what
  render features to build.

pygdtf offers `get_beam_geometries_for_mode(profile, mode_name)` (`pygdtf/utils/__init__.py:282-296`,
MIT) which walks from the mode's root and collects every `GeometryBeam`, following `GeometryReference`
targets. It is the ready-made "how many emitters does this fixture have" query. Caveat: it collects the
*definition* objects, so two references to the same target yield the same object twice with no positions —
useful for counting and for the beam-attribute lookup, useless for placement. Placement must come from §2.

---

## 9. Licence verdicts, per source

**The rule this section applies:** Beamhouse is a permissively-licensed browser app. GPL-3 code may be
*read* to understand a problem; no code, structure, comment or asset may be copied from it, and no
GPL-derived artefact may ship.

| Source | Licence | Verdict |
| --- | --- | --- |
| **`open-stage/blender-dmx`** | **GPL-3.0-or-later** — `LICENSE` is the full GPLv3; `gpl-header.txt` is applied to every `.py` by `licenserc.toml`, and `gdtf.py:1-16` / `model.py:1-16` carry it | **Read only.** Understand the algorithm, then write it from the spec and from the MIT sources. Do not transcribe code, do not paraphrase its comments into ours, do not vendor `assets/primitives/*.glb`. The `licenserc.toml` `excludes` list (which contains `assets`) configures a header-insertion lint; it is not a licence grant for those files. |
| **`ClayPakyOfficial/gdtf-importer`** | **MIT** — `LICENSE`, "Copyright (c) 2022 Clay Paky S.R.L." | **Borrowable** with attribution. Best structural reference for the geometry-tree walk (§2.2) and the primitive set (§3.2). Caveats: last commit 2023-07-28, its own README says "still under development", and it requires a patched Unreal Engine (`dmxEngine.patch`) — but the patch and the engine dependency do not affect the licence of the plugin source we are reading. Do not use `Content/*.uasset` (Unreal binaries). |
| **`open-stage/python-gdtf` (pygdtf)** | MIT — `LICENSE`, "Copyright (c) 2023 Open Stage" | **Borrowable.** The object model, the model-file probe (§4.2), the `DMXTo` backfill and mode-master bucketing (§7.1), the `_expand_tree` cycle guard (§5.3). Note `AttributeDefinitions.xml` bundled at the repo root is the GDTF group's Annex A attribute list, not pygdtf's own work — treat it as spec data, not as MIT code. |
| **`open-stage/python-mvr` (pymvr)** | MIT — "Copyright (c) 2023 vanous" | Borrowable, but out of scope (§1.4). |
| **`cpdt/gdtf-rs`** | MIT — `LICENSE`, "Copyright 2026 Tom Barham" | **Borrowable**, and the best *documentation* of the format: its doc comments restate the spec's requirements accurately (`src/resource.rs:96-121`, `src/description/model.rs:22-63`). |
| **`mvrdevelopment/spec`** | **No `LICENSE` file.** `package.json` declares `"license": "ISC"`, which is npm boilerplate and weak evidence. The underlying DIN SPEC 15800:2022-02 is a paid standard sold by Beuth; this repository is the working mirror published by the GDTF group. | **The `meshes/` folder has an explicit grant** (README line 22: "free to use, modify, and distribute, including in commercial applications, without any licensing fees or royalties") — that covers §3.2 unambiguously. For the **spec text**, cite and paraphrase (as this document does); do not vendor `gdtf-spec.md` wholesale into the repo. The `.xsd` in `python-gdtf/tests/` is separately available under pygdtf's MIT licence. |
| **ASLS beam shader** (already known) | GPL-3 | Read only, per DESIGN.md. Same rule as BlenderDMX. |

Two candidates found but not read in depth, both MIT, both worth a look if §1.3 or §5.2 needs a third
opinion: `nasshu2916/GDTF-Unity` (C#, MIT) and `MomentFactory/Omniverse-MVR-GDTF-converter` (MIT over an
Apache-2.0 NVIDIA base; converts GDTF to USD, so it must solve the transform composition). Neither was
examined; they are named here so the next investigation does not have to re-find them. A GitHub-wide
search for GDTF renderers turned up **no** browser/WebGL/three.js implementation of GDTF resolution at
any licence — Beamhouse's `gdtf-ts` would be the first one, which is worth knowing when estimating M4.

---

## 10. What this document could not verify

Stated plainly, because each of these is a decision someone will otherwise make by guessing.

1. **The rotation sub-matrix convention (§1.3).** Two implementations transpose; the spec text says not to;
   both implementations left a comment saying they were unsure. Unresolvable from documents. Needs one
   fixture with a non-identity rotation block, rendered both ways.
2. **Whether a `GeometryReference` composes or replaces the referenced geometry's `Position` (§5.2).** The
   spec is silent; the two implementations differ; the spec's own LED-panel example is suggestive of
   composition but not decisive. Needs a real pixel fixture and a look at whether the emitters sit proud
   of the body.
3. **BlenderDMX's `matrix_parent_inverse` (§2.2).** The static reading says the lines are no-ops because
   the depsgraph never runs during `buildCollection`, and the copy-paste inversion at `gdtf.py:629` is
   strong supporting evidence — but this was not confirmed by running Blender. It does not matter for the
   port (Beamhouse composes explicitly regardless); it is recorded so nobody re-derives it.
4. **Whether the spec's `meshes/` `.3ds` files are the same geometry as BlenderDMX's `.glb`s.** Same five
   names, same set; not diffed. Irrelevant if Beamhouse converts from the spec, which it should.
5. **How many GDTF files in the wild ship `3ds` only (§4.2).** A real coverage risk for a browser
   implementation with no 3DS loader. Belongs in the profile-availability research, not here.
6. **Whether the spec's `Matrix` translation is normatively metres.** The `Matrix` type paragraph says only
   "metric system"; `Model` dimensions and `BeamRadius` say "meter" explicitly. Both implementations assume
   metres for the matrix and say so in comments. Treated as settled in §1.2, but the spec text does not
   actually close it.

---

## 11. Summary for the report-back

- **Licence.** BlenderDMX is **GPL-3.0-or-later** — read-only, same boundary as the ASLS beam shader.
  **`ClayPakyOfficial/gdtf-importer` is MIT** and covers the same spatial ground; pygdtf, pymvr and gdtf-rs
  are MIT; the GDTF group's `meshes/` folder is explicitly royalty-free. Beamhouse never needs to copy
  from a GPL source to build the spatial half.
- **The spec answers more than expected.** Transforms are relative to the parent (`gdtf-spec.md:1113-1120`),
  pan is Z and tilt is X (`:1100`), beams point down local −Z (`:1408`), meshes are rescaled to the model
  box (`:1135`), and translation is the 4th column in metres (`:201`, confirmed against two real archives).
  Where a spec section is authoritative, it beats both implementations — as the ticket predicted.
- **Two things the spec does not answer and the implementations answer inconsistently:** the rotation
  sub-matrix convention, and whether a `GeometryReference` composes or replaces the target's `Position`.
  Both are §10 experiments, both are one fixture away from settled, and both are cheap to get wrong
  silently.
- **`GeometryReference` expansion — the item DESIGN.md §5.3 and the strip class depend on — has no correct
  reference implementation.** BlenderDMX creates one instance per reference element (right) but discards
  the target's `Position` (wrong); Clay Paky composes the transforms (right) but creates one instance per
  `<Break>` child (wrong). Beamhouse must implement it from the spec: one instance per element, transforms
  composed, `<Break>` consumed only by channel-offset arithmetic.
- **`PrimitiveType` needs less work than DESIGN.md assumes.** Generate `Cube`/`Cylinder`/`Sphere`/`Pigtail`
  procedurally; ship the eight official `Base`/`Yoke`/`Head`/`Scanner`/`Conventional` meshes (1.0 and 1.1)
  converted from `mvrdevelopment/spec/meshes/`. Everything is rescaled to the model's `Length`/`Width`/
  `Height` box regardless of source, which is the one rule that unifies meshes and primitives.
- **`ChannelFunction`/`modeMaster` have a good reference at last** (pygdtf for the `DMXTo` backfill and the
  mode-master bucketing that makes it correct; BlenderDMX for the per-tick resolution loop), with one
  concrete landmine: the shared `dmx_to_physical` helper's middle branch is dead and silently returns 0.
- **What still transfers from Mizer** (companion document): the string-prefix walk, channels-grouped-by-
  geometry-name, offset-width-from-array-length, and the `Break`-offset arithmetic. Nothing in this
  document replaces those; §5 and §7 sit on top of them.
