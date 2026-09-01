# The GDTF rotation sub-matrix convention, settled

Resolves [issue #20](https://github.com/jnslmk/beamhouse/issues/20) (part of the
[wayfinder map, #1](https://github.com/jnslmk/beamhouse/issues/1)). Surfaced by
[#11](https://github.com/jnslmk/beamhouse/issues/11), whose findings are in
[`gdtf-spatial-resolution.md`](gdtf-spatial-resolution.md) §1.3.

Prototype: [`prototypes/gdtf-rotation-convention/rotation_convention.py`](../../prototypes/gdtf-rotation-convention/rotation_convention.py)
— no dependencies, `python3 rotation_convention.py`.

## Verdict

**The spec is right. Both implementations are wrong. Read the 3×3 block directly, with no
transpose.**

Concretely, for the serialised form `{a,b,c,d}{e,f,g,h}{i,j,k,l}{m,n,o,p}`:

- each brace-group is a **row** of the mathematical matrix `M`
- the rotation basis is `M`'s first three **columns**, i.e. `M[i][j]` for `i,j < 3` taken as written
- the translation is `(M[0][3], M[1][3], M[2][3])`, in metres
- the bottom row is the affine `(0,0,0,1)`

`gdtf-ts` should assert that bottom row on load and reject files that fail it.

## The spec is confusing, but it is not contradictory

§1.3 of the #11 research treated the `Matrix` paragraph as ambiguous. Re-reading it, the two
sentences are about **two different things**, and #11's own §1.2 already contains the key:

> The transformation matrix consists 4 x 4 floats. **Stored in a row-major order.** For example, each
> row of the matrix is stored as a 4-component vector. **The mathematical definition of the matrix is
> in a column-major order.** For example, the matrix rotation is stored in the first three columns,
> and the translation is stored in the 4th column.

The first sentence fixes the **serialisation**: brace-groups are rows. The second describes the
**mathematics**: `M` is a column-vector matrix, so its basis vectors are columns and its translation
is the 4th column. Both are true at once, and together they leave no freedom. The misreading is to
take "rotation is stored in the first three columns" as a claim about the brace-groups — but the
brace-groups were already spoken for one sentence earlier.

## Why this is not circular

The reading is pinned by translation alone, without appealing to any rotation convention:

**A 4×4 affine transform must have bottom row `(0,0,0,1)`.** That is a property of the transform, not
of a convention, so it arbitrates between the two readings on its own. Across the 55 `Position`
matrices in the six vendor and authored files in `definitions/`:

| reading | valid affine bottom row |
| --- | --- |
| brace-groups as **rows** | **55 / 55** |
| brace-groups as **columns** | 17 / 55 |

The 17 are exactly the matrices whose translation is zero, where the two readings coincide. Every
matrix that actually carries an offset falsifies the column reading — it puts the translation into
the bottom row, producing something that is not an affine transform at all.

Both implementations already agree with this. BlenderDMX (`gdtf.py:724`) and the Clay Paky importer
(`CPFActorGeometryTree.cpp:196`, *"Location on last column"*) both read translation from column 3,
which is only meaningful if the groups are rows. **Having accepted that, there is no transpose left
to apply to the rotation block** — it is the same matrix. Transposing one half of `M` and not the
other is the inconsistency, and it is visible without leaving the file.

## Why two independent implementations shipped it anyway

Using `R` where `Rᵀ` is meant misplaces geometry by `R·(Rᵀ)⁻¹ = R²`, whose angle is **2θ**. So the
error is not uniform across fixtures — it is a function of the rotation already present:

| file | geometry | θ | articulation error |
| --- | --- | --- | --- |
| `ADJ_Fog_Fury_Jett` | `Beam` | 179.92° | **0.17°** |
| `Purelight_FX_Mini_Derby_2` | `Yoke1` | 90.00° | **180.00°** |
| `Purelight_FX_Mini_Derby_2` | `Yoke2` | 180.00° | 0.00° |
| `Purelight_FX_Mini_Derby_2` | `Mirror` | 180.00° | 0.00° |

Every identity block is silent by construction. A **180° block is symmetric — its own transpose —
so the error is 0° regardless of reading**, and 180° is by far the most common non-identity value in
real files, because it is how a beam gets flipped to point downward. Of 55 real matrices, exactly
**one** (the derby's `Yoke1`, a 90° block) exposes the bug at all.

That is the whole explanation for how this survived in two shipped renderers: on the fixture data
that exists, it is very nearly a no-op. It waits for a tilted pixel bar, an angled multi-head, or a
mirror scanner.

## The transpose is not "the other convention"

The natural defence — that transposing is simply the inverse convention, consistently applied — is
false. Transposing each node and then composing gives `R₁ᵀR₂ᵀR₃ᵀ`, whereas the transpose of the
correct composition is `(R₁R₂R₃)ᵀ = R₃ᵀR₂ᵀR₁ᵀ`. Rotations do not commute, so these are different
orientations. On the derby's real `Yoke1 → Yoke2 → Mirror` chain:

```
correct composition   R1 R2 R3       = diag( 1, -1, -1)
transposed pipeline   R1ᵀ R2ᵀ R3ᵀ    = diag( 1,  1,  1)   <- identity: no rotation at all
mirror of correct    (R1 R2 R3)ᵀ     = diag( 1, -1, -1)
```

The transposed pipeline does not mirror the correct answer; it loses the rotation entirely. It is a
third, meaningless orientation.

## The physical check

Ground truth first, from #16's CAD measurements rather than from any matrix: the impression 90's yoke
pivot sits 0.066 m above the base and its head pivot 0.211 m above that — 0.277 m, the independently
measured tilt-axis height. The head is **above** the yoke, on +Z.

Mount that yoke rotated +90° about X. Under the right-handed system the spec mandates, +90° about X
carries +Z onto −Y, so the head pivot must land at `y = −0.211, z = +0.066`. That answer is fixed by
handedness, before any parsing happens.

| | head pivot |
| --- | --- |
| block read directly (spec) | `(0.0000, −0.2110, +0.0660)` ✓ |
| block transposed (both impls) | `(0.0000, **+0.2110**, +0.0660)` ✗ |
| physically correct | `(0.0000, −0.2110, +0.0660)` |

The transpose puts the head **0.422 m** from where the fixture's own measured geometry says it is —
the yoke articulates the wrong way.

## What this does not settle

The finding is about **reading GDTF**. It does not trace BlenderDMX's or Unreal's full render path,
so it remains possible that either engine compensates downstream in a way that cancels the transpose
for some cases. Two things argue against treating that as likely: the compensation would have to be
non-commutative to match (see above), and the 2θ table explains the observed "it looks fine" without
needing a compensation to exist. But it was not verified end-to-end, and BlenderDMX remains GPL-3.0
— readable, not borrowable — so `gdtf-ts` implements this from the spec regardless.

Still open from `gdtf-spatial-resolution.md` §10, untouched here: `GeometryReference` expansion, which
both implementations also get wrong, and which the strip rendering class depends on.
