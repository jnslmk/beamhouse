#!/usr/bin/env python3
"""Re-run #23's acceptance against the GDTF index space (wayfinder #46).

[ADR-0033](../../docs/adr/0033-the-spoke-is-an-authored-gdtf-because-only-gdtf-can-say-it.md)'s
last consequence asks for #26's conformance oracle to be re-run once after the
re-patch, because the re-patch changes *which definition supplies the strip's
index space* -- OFL's `matrix.pixelCount [23,1,1]` for GDTF's 23 strided
`GeometryReference` nodes. "The numbers should be identical; that they are is
the check."

This is that check, offline. `verify.py` needs the node powered and reachable
and hardcodes `3 * k` for a pixel's slots; this script needs neither, and
derives every slot from the two files that actually changed:

  * the authored GDTF -- one pixel's `<Break DMXOffset>` plus its three
    `<DMXChannel Offset>`s, and the pixel's *spatial* order off its
    `GeometryReference` `Position`;
  * the Mizer patch -- the ten `fixture:` lines' universe and start channel.

It then replays #23's captured hardware readback through WLED's own packing and
asserts the decoded 230 pixels are byte-identical to what the node returned on
2026-09-02. A wrong stride, a transposed colour order, a reversed pixel run or
an off-by-one start address all fail here.

    python3 conformance-gdtf.py [path/to/OBF26_Bunte-Stube_gdtf-ofl.yml]
"""
from __future__ import annotations

import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
GDTF = REPO / "definitions/authored/Beamhouse@WLED STAR-TENT Spoke 23px@v1.gdtf"
CAPTURE = HERE / "capture"
DEFAULT_PATCH = pathlib.Path.home() / "git-projects/mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml"

FIXTURE_TYPE_ID = "1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016"
MODE = "23px RGB 69-channel"
DMX_ADDRESS = 30          # ADR-0011; ledsInFirstUniverse = (512 - 30 + 1)/3 = 161
N_LEDS = 230
PROFILE = 23

failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {msg}")
    if not cond:
        failures.append(msg)


# --------------------------------------------------------------- the definition
def pixel_slots() -> list[tuple[int, int, int]]:
    """One spoke's per-pixel (R, G, B) slots, 1-based, read out of the GDTF.

    Pixels come back in *spatial* order -- sorted by the translation on their
    `GeometryReference` `Position` -- not in file order, so a definition whose
    geometry and DMX disagree cannot pass by accident.
    """
    ft = ET.fromstring(zipfile.ZipFile(GDTF).read("description.xml")).find("FixtureType")
    assert ft.get("FixtureTypeID") == FIXTURE_TYPE_ID, ft.get("FixtureTypeID")

    mode = next(m for m in ft.find("DMXModes") if m.get("Name") == MODE)
    by_attr = {}
    for chan in mode.find("DMXChannels"):
        attr = list(chan)[0].get("Attribute")
        by_attr[attr] = int(chan.get("Offset"))
    rgb = (by_attr["ColorAdd_R"], by_attr["ColorAdd_G"], by_attr["ColorAdd_B"])

    refs = []
    for ref in ft.iter("GeometryReference"):
        tx = float(ref.get("Position").split("}{")[0].split(",")[-1])
        base = int(list(ref)[0].get("DMXOffset"))
        refs.append((tx, base))
    refs.sort()
    return [tuple(base + o - 1 for o in rgb) for _, base in refs]


# -------------------------------------------------------------------- the patch
def patch_entries(path: pathlib.Path) -> list[dict]:
    import yaml

    doc = yaml.safe_load(path.read_text())
    rows = [
        f
        for f in doc["fixtures"]
        if f["fixture"] == f"gdtf:{FIXTURE_TYPE_ID}" and f["mode"] == MODE
    ]
    return sorted(rows, key=lambda f: f["id"])


# ------------------------------------------------------------- WLED's own packing
def decode(universes: dict[int, bytes]) -> list[tuple[int, int, int]]:
    """`wled00/e131.cpp:347` -- (512 - DMXAddress + 1) / 3 LEDs in the first."""
    first = (512 - DMX_ADDRESS + 1) // 3
    out = []
    for led in range(N_LEDS):
        if led < first:
            uni, off = 2, DMX_ADDRESS - 1 + 3 * led
        else:
            uni, off = 3, 3 * (led - first)
        out.append(tuple(universes[uni][off : off + 3]))
    return out


def main() -> int:
    patch_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATCH
    if not patch_path.exists():
        print(f"patch file not found: {patch_path}\nPass it as the first argument.")
        return 2

    recorded = json.loads((CAPTURE / "result.json").read_text())
    sent = [tuple(p) for p in recorded["sent_pixels"]]
    read = [tuple(p) for p in recorded["read_pixels"]]

    print(f"definition  {GDTF.name}")
    print(f"patch       {patch_path}")
    print(f"capture     {recorded['verified_utc']}  node {recorded['node']['ip']} "
          f"WLED {recorded['node']['wled_version']}\n")

    # --- the definition supplies the same index space the OFL entry did -------
    slots = pixel_slots()
    check(len(slots) == PROFILE, f"the GDTF expands to {len(slots)} pixels (OFL: pixelCount 23)")
    check(slots == [(3 * k + 1, 3 * k + 2, 3 * k + 3) for k in range(PROFILE)],
          "pixel n occupies slots 3n-2, 3n-1, 3n in R G B order -- identical to "
          "the OFL entry's `Red n` / `Green n` / `Blue n` at pixelKey n")
    check(max(max(s) for s in slots) == 69, "the mode is 69 channels wide")

    # --- the patch is the one #23 verified, minus the definition id -----------
    rows = patch_entries(patch_path)
    check(len(rows) == 10, f"ten spokes patch the authored GDTF ({len(rows)} found)")
    expected = [(r["beamhouse_universe"], r["channel"]) for r in recorded["patch"]]
    actual = [(r["universe"], r["channel"]) for r in rows]
    check(actual == expected,
          "every universe and start channel is unchanged from the verified patch")

    # --- replay: GDTF slots -> universes -> WLED's packing -> pixels ----------
    universes = {2: bytearray(512), 3: bytearray(512)}
    for spoke, row in enumerate(rows):
        base = row["channel"] - 1
        for k, (r_s, g_s, b_s) in enumerate(slots):
            colour = sent[PROFILE * spoke + k]
            for slot, value in zip((r_s, g_s, b_s), colour):
                universes[row["universe"]][base + slot - 1] = value

    decoded = decode({u: bytes(b) for u, b in universes.items()})
    check(decoded == sent, "the ten 69-channel patches reassemble into the node's "
                           "230-pixel index space with no gap and no overlap")
    check(decoded == read, f"all {N_LEDS} decoded pixels are byte-identical to the "
                           f"hardware readback of {recorded['verified_utc']}")

    # --- and the raw capture agrees with the JSON it was summarised into ------
    raw = (CAPTURE / "peek-frames.bin").read_bytes()
    frame_len = 2 + 3 * N_LEDS
    frames = [raw[i : i + frame_len] for i in range(0, len(raw), frame_len)]
    check(len({bytes(f) for f in frames}) == 1,
          f"peek-frames.bin holds {len(frames)} identical frames")
    last = frames[-1]
    check(last[0] == ord("L") and last[1] == 1, "frame header is 'L' version 1")
    check([tuple(last[2 + 3 * i : 5 + 3 * i]) for i in range(N_LEDS)] == read,
          "result.json's read_pixels match the raw Peek capture")

    if failures:
        print(f"\nFAIL: {len(failures)} check(s) failed")
        return 1
    print("\nPASS: the GDTF index space is identical to the OFL one it replaced")
    return 0


if __name__ == "__main__":
    sys.exit(main())
