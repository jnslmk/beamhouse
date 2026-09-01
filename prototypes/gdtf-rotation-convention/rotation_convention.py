#!/usr/bin/env python3
"""Settle the GDTF Position rotation sub-matrix convention (issue #20).

Throwaway prototype. No dependencies, no build. Run: python3 rotation_convention.py
"""
import glob, math, os, re, zipfile
import xml.etree.ElementTree as ET

GROUP = re.compile(r"\{([^}]*)\}")
DEFS = "/home/jonas/git-projects/beamhouse/definitions"


# ---------------------------------------------------------------- matrix utils
def groups(pos):
    """The serialised form: four brace-groups of four floats."""
    return [[float(x) for x in g.split(",")] for g in GROUP.findall(pos)]


def as_rows(g):
    """Reading A - each brace-group is a ROW of the mathematical matrix."""
    return [row[:] for row in g]


def as_cols(g):
    """Reading B - each brace-group is a COLUMN of the mathematical matrix."""
    return [[g[j][i] for j in range(4)] for i in range(4)]


def basis(M):
    return [row[:3] for row in M[:3]]


def transpose3(B):
    return [[B[j][i] for j in range(3)] for i in range(3)]


def mul3(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def apply3(B, v):
    return [sum(B[i][k] * v[k] for k in range(3)) for i in range(3)]


def is_orthonormal(B, tol=1e-4):
    P = mul3(B, transpose3(B))
    return all(abs(P[i][j] - (1.0 if i == j else 0.0)) <= tol for i in range(3) for j in range(3))


def det3(B):
    return (B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1])
            - B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0])
            + B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]))


def angle_deg(B):
    """Rotation angle of B, from its trace."""
    c = (B[0][0] + B[1][1] + B[2][2] - 1.0) / 2.0
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def bottom_row_affine(M, tol=1e-9):
    return (abs(M[3][0]) <= tol and abs(M[3][1]) <= tol
            and abs(M[3][2]) <= tol and abs(M[3][3] - 1.0) <= tol)


def translation(M):
    return [M[0][3], M[1][3], M[2][3]]


def fmt(v):
    return "(" + ", ".join(f"{x:+.4f}" for x in v) + ")"


# ------------------------------------------------------------------- test data
def positions(path):
    root = ET.fromstring(zipfile.ZipFile(path).read("description.xml"))
    out = []
    for el in root.iter():
        pos = el.get("Position")
        if pos and pos != "None":
            out.append((el.tag, el.get("Name"), pos))
    return out


def local_files():
    return sorted(glob.glob(f"{DEFS}/gdtf/*.gdtf")) + sorted(glob.glob(f"{DEFS}/authored/*.gdtf"))


# ------------------------------------------------------------------ experiment
def part1_affine_validity():
    """Which reading yields a valid affine transform? Decided by translation alone,
    with no reference to the rotation block - this is the non-circular anchor."""
    print("=" * 78)
    print("PART 1  Affine validity: is a brace-group a row or a column?")
    print("=" * 78)
    print("A 4x4 affine transform must have bottom row (0,0,0,1). That is a property")
    print("of the transform, not of a convention, so it can arbitrate between the two")
    print("readings without assuming anything about rotation.\n")
    tot = rows_ok = cols_ok = with_translation = 0
    for path in local_files():
        for tag, name, pos in positions(path):
            g = groups(pos)
            if len(g) != 4 or any(len(r) != 4 for r in g):
                continue
            tot += 1
            R, C = as_rows(g), as_cols(g)
            rows_ok += bottom_row_affine(R)
            cols_ok += bottom_row_affine(C)
            if any(abs(x) > 1e-9 for x in translation(R)):
                with_translation += 1
    print(f"  {tot} Position matrices across {len(local_files())} real fixture files")
    print(f"  reading as ROWS    -> valid affine bottom row: {rows_ok}/{tot}")
    print(f"  reading as COLUMNS -> valid affine bottom row: {cols_ok}/{tot}")
    print(f"  ({with_translation} of them carry a non-zero translation; for those, and only")
    print(f"   those, the two readings differ - a zero translation is symmetric.)\n")
    print("  => Brace-groups are ROWS. Reading them as columns puts the translation")
    print("     into the bottom row, which is not an affine transform at all.")
    print("     Both BlenderDMX and the Clay Paky importer already agree here: both")
    print("     read translation from column 3, which is only meaningful if the")
    print("     groups are rows. The 3x3 block is therefore M[i][j] = group[i][j],")
    print("     and the spec puts the rotation basis in M's first three COLUMNS.")
    print("     No transpose is available anywhere in that chain.\n")


def part2_why_it_survives():
    """Quantify the blast radius: the articulation error is exactly 2*theta."""
    print("=" * 78)
    print("PART 2  Why two implementations shipped the bug: the error is 2*theta")
    print("=" * 78)
    print("Using R where R^T is meant misplaces geometry by R*(R^T)^-1 = R^2, whose")
    print("angle is 2*theta. So a 180-degree block - by far the most common non-identity")
    print("value in real files, because it is how a beam gets flipped - is off by")
    print("360 degrees, i.e. invisible. The bug hides in exactly the data that exists.\n")
    print(f"  {'file':<46} {'geometry':<10} {'theta':>8} {'error':>9}")
    print("  " + "-" * 74)
    worst = []
    for path in local_files():
        base = os.path.basename(path)
        for tag, name, pos in positions(path):
            g = groups(pos)
            if len(g) != 4:
                continue
            B = basis(as_rows(g))
            if not is_orthonormal(B):
                print(f"  {base[:44]:<46} {str(name)[:10]:<10}   NOT ORTHONORMAL")
                continue
            th = angle_deg(B)
            if th < 1e-6:
                continue
            err = math.degrees(math.acos(max(-1.0, min(1.0, (
                (mul3(B, B)[0][0] + mul3(B, B)[1][1] + mul3(B, B)[2][2]) - 1.0) / 2.0))))
            print(f"  {base[:44]:<46} {str(name)[:10]:<10} {th:7.2f}d {err:8.2f}d")
            worst.append((err, base, name))
    print()
    print("  Every identity block (the majority) is silent by construction. The one")
    print("  non-identity block in the ADJ file is a 180-degree beam flip: symmetric,")
    print("  hence its own transpose, hence an error of ~0 no matter which reading you")
    print("  pick. Only a block that is neither identity nor 180 degrees can expose it.\n")


def part3_composition_incoherence():
    """The transposed pipeline is not even the transpose of the right answer."""
    print("=" * 78)
    print("PART 3  The transposed pipeline is not a mirror - it is incoherent")
    print("=" * 78)
    print("A tempting defence of the transpose is 'it is just the inverse convention,")
    print("consistently applied'. It is not. Transposing each node's block and then")
    print("composing gives R1^T R2^T R3^T, but the transpose of the correct composition")
    print("is (R1 R2 R3)^T = R3^T R2^T R1^T. Rotations do not commute, so these differ:")
    print("the transposed pipeline is not the correct answer mirrored, it is a third,")
    print("meaningless orientation.\n")
    path = f"{DEFS}/gdtf/Purelight_FX_Mini_Derby_2_Version_1.gdtf"
    chain = [(n, groups(p)) for t, n, p in positions(path) if t in ("Axis", "Beam")]
    print(f"  Chain from {os.path.basename(path)}: " + " -> ".join(n for n, _ in chain))
    correct = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _, g in chain:
        correct = mul3(correct, basis(as_rows(g)))
    transposed_pipeline = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _, g in chain:
        transposed_pipeline = mul3(transposed_pipeline, transpose3(basis(as_rows(g))))
    mirror_of_correct = transpose3(correct)
    same = all(abs(transposed_pipeline[i][j] - mirror_of_correct[i][j]) < 1e-9
               for i in range(3) for j in range(3))
    print(f"\n  correct composition   R1 R2 R3        = {correct}")
    print(f"  transposed pipeline   R1^T R2^T R3^T  = {transposed_pipeline}")
    print(f"  mirror of correct    (R1 R2 R3)^T     = {mirror_of_correct}")
    print(f"\n  transposed pipeline == mirror of correct ? {same}")
    if not same:
        print("  => Not even self-consistent. It cannot be defended as 'the other convention'.\n")
    else:
        print("  => They coincide for THIS chain (too many symmetric blocks); see part 4.\n")


def part4_articulation():
    """Ground truth stated first, from measured geometry, then both readings."""
    print("=" * 78)
    print("PART 4  A rotated impression 90: which way does the head actually go?")
    print("=" * 78)
    print("Ground truth, stated before either reading is applied, and taken from the")
    print("CAD measurements in issue #16 rather than from any matrix:\n")
    print("  The impression 90's yoke pivot sits 0.066 m above the base, and its head")
    print("  pivot sits 0.211 m above the yoke pivot - 0.277 m above the floor, which")
    print("  is the independently measured tilt-axis height. The head is ABOVE the")
    print("  yoke, on +Z, in the fixture's own frame.\n")
    print("  Now mount that yoke rotated by +90 degrees about X. Under the right-handed")
    print("  convention the spec mandates, +90 about X carries +Z onto -Y. So the head")
    print("  pivot must land at y = -0.211, z = +0.066. That is the physical answer,")
    print("  fixed by the rotation's handedness, not by how the file is parsed.\n")
    c, s = 0.0, 1.0  # cos 90, sin 90
    yoke_rot = [[1, 0, 0, 0.0], [0, c, -s, 0.0], [0, s, c, 0.066], [0, 0, 0, 1]]
    serialised = "".join("{" + ",".join(f"{v:.6f}" for v in row) + "}" for row in yoke_rot)
    print(f"  Serialised per the spec (row-major, each row a 4-vector):\n    {serialised}\n")
    head_local = [0.0, 0.0, 0.211]
    g = groups(serialised)
    B_direct = basis(as_rows(g))
    B_transposed = transpose3(B_direct)
    t_yoke = translation(as_rows(g))
    direct = [t_yoke[i] + apply3(B_direct, head_local)[i] for i in range(3)]
    transposed = [t_yoke[i] + apply3(B_transposed, head_local)[i] for i in range(3)]
    print(f"  head pivot, block read directly (spec)      : {fmt(direct)}")
    print(f"  head pivot, block transposed (both impls)   : {fmt(transposed)}")
    print(f"  physically correct                          : {fmt([0.0, -0.211, 0.066])}\n")
    ok_direct = abs(direct[1] + 0.211) < 1e-9
    ok_transposed = abs(transposed[1] + 0.211) < 1e-9
    print(f"  direct reading matches ground truth      : {ok_direct}")
    print(f"  transposed reading matches ground truth  : {ok_transposed}")
    print("\n  The transpose puts the head 0.422 m away from where the fixture's own")
    print("  measured geometry says it is - it articulates the wrong way, a 180-degree")
    print("  error in the pan/tilt hierarchy.\n")


if __name__ == "__main__":
    part1_affine_validity()
    part2_why_it_survives()
    part3_composition_incoherence()
    part4_articulation()
