#!/usr/bin/env python3
"""Verify the STAR-TENT re-addressing on the live node (wayfinder #23).

ADR-0009 re-addresses the tent to DMXAddress 30 so WLED's fixed
`ledsInFirstUniverse = (512 - DMXAddress + 1) / 3` becomes exactly
`161 = 7 x 23` -- putting the universe boundary on a spoke boundary, so no
fixture straddles it. That is arithmetic off `wled00/e131.cpp:347`. This
script turns it into an observation: drive the ten spokes as ten separate
69-channel fixtures at the addresses the Mizer patch now uses, read all 230
pixels back off the Peek websocket, and assert the two agree pixel for pixel.

The pattern is #26's index ramp, unchanged, so the two captures are comparable:
    R = i           absolute index      -- offset and global reversal
    G = 255 - i     descending ramp     -- channel swaps
    B = (i % 23)*11 per-spoke sawtooth  -- stride and per-spoke reversal

What only this capture can show, which #26's could not:
  * LED 160 -> 161 is now the universe seam (it was 169 -> 170 at address 1),
    and it coincides with the spoke 6 -> spoke 7 boundary.
  * Universe 1 is filled to the byte: spoke 6 ends at channel 512 exactly.
  * Ten independently addressed 69-channel fixtures reassemble into one
    contiguous 230-pixel index space with no gap and no overlap.
"""
import json, socket, struct, sys, threading, time, pathlib, urllib.request

NODE        = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.243"
ARTNET_PORT = 6454
N_LEDS      = 230
PROFILE     = 23
DMX_ADDRESS = 30           # ADR-0009
OUT         = pathlib.Path(__file__).parent / "capture"

def pattern(i):
    return (i & 0xFF, (255 - i) & 0xFF, (i % PROFILE) * 11)

PIXELS = [pattern(i) for i in range(N_LEDS)]

# --- the patch under test ----------------------------------------------------
# Ten spokes, each one fixture of 69 channels. Beamhouse universe = Art-Net
# Port-Address + 1 (ADR-0007); WLED reads the Port-Address raw (#26), so the
# node's configured "universe 1" is Port-Address 1 is Beamhouse universe 2.
SPOKES = []
for s in range(10):
    if s < 7:
        SPOKES.append({"spoke": s, "port_address": 1, "beamhouse_universe": 2,
                       "channel": DMX_ADDRESS + 69 * s,
                       "leds": (23 * s, 23 * s + 22)})
    else:
        SPOKES.append({"spoke": s, "port_address": 2, "beamhouse_universe": 3,
                       "channel": 1 + 69 * (s - 7),
                       "leds": (23 * s, 23 * s + 22)})

def artdmx(port_address, seq, data):
    return (b"Art-Net\x00"
            + struct.pack("<H", 0x5000)
            + struct.pack(">H", 14)
            + bytes([seq & 0xFF, 0])
            + struct.pack("<H", port_address)
            + struct.pack(">H", len(data))
            + bytes(data))

def frames():
    """Build each universe by writing each spoke into its own patched slots.

    Deliberately built per fixture rather than as one flat 690-byte ramp split
    in two: the thing under test is that ten independent 69-channel patches
    reassemble into the node's one index space.
    """
    bufs = {1: bytearray(512), 2: bytearray(207)}
    for sp in SPOKES:
        base = sp["channel"] - 1                       # Art-Net data is 0-indexed
        lo, _ = sp["leds"]
        for k in range(PROFILE):
            r, g, b = PIXELS[lo + k]
            bufs[sp["port_address"]][base + 3*k : base + 3*k + 3] = bytes((r, g, b))
    return [(pa, bytes(buf)) for pa, buf in sorted(bufs.items())]

_stop = threading.Event()
def stream():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    fs, seq = frames(), 0
    while not _stop.is_set():
        for pa, data in fs:
            sock.sendto(artdmx(pa, seq, data), (NODE, ARTNET_PORT))
        seq = (seq + 1) & 0xFF
        time.sleep(1/30)
    sock.close()

def get(path):
    with urllib.request.urlopen(f"http://{NODE}{path}", timeout=10) as r:
        return json.load(r)

def main():
    import websocket
    OUT.mkdir(parents=True, exist_ok=True)

    info = get("/json/info")
    cfg  = get("/json/cfg")
    dmx  = cfg["if"]["live"]["dmx"]
    print(f"node {NODE} {info['name']} ver {info['ver']}  "
          f"dmx mode={dmx['mode']} addr={dmx['addr']} uni={dmx['uni']}")

    # The cutover is a precondition of this check, not something it performs:
    # a script that fixes the config it is auditing cannot fail.
    if dmx["mode"] != 4:
        raise SystemExit(f"node is in DMX mode {dmx['mode']}, expected 4 (MULTIPLE_RGB)")
    if dmx["addr"] != DMX_ADDRESS:
        raise SystemExit(f"node DMXAddress is {dmx['addr']}, expected {DMX_ADDRESS}")

    leds_first_universe = (512 - DMX_ADDRESS + 1) // 3
    print(f"ledsInFirstUniverse = (512 - {DMX_ADDRESS} + 1) / 3 = {leds_first_universe}"
          f"  ({leds_first_universe // PROFILE} x {PROFILE})")

    captured, stamps = [], []
    try:
        threading.Thread(target=stream, daemon=True).start()
        time.sleep(0.5)
        ws = websocket.WebSocket()
        ws.connect(f"ws://{NODE}/ws", timeout=10)
        ws.send(json.dumps({"lv": True}))
        deadline = time.time() + 20
        while time.time() < deadline and len(captured) < 30:
            f = ws.recv()
            if not isinstance(f, (bytes, bytearray)) or len(f) < 2 or f[0] != ord('L'):
                continue
            stamps.append(time.time())
            captured.append(bytes(f))
        info_live = get("/json/info")
        ws.send(json.dumps({"lv": False}))
        ws.close()
    finally:
        _stop.set()
        time.sleep(0.3)

    if not captured:
        raise SystemExit("no Peek frames received")

    final = captured[-1]
    n_px = (len(final) - 2) // 3
    readback = [tuple(final[2 + 3*i : 5 + 3*i]) for i in range(n_px)]
    intervals = [round((b - a) * 1000, 1) for a, b in zip(stamps, stamps[1:])]

    exact = sum(1 for i in range(min(n_px, N_LEDS)) if readback[i] == tuple(PIXELS[i]))
    identical = len({bytes(f) for f in captured})

    per_spoke = []
    for sp in SPOKES:
        lo, hi = sp["leds"]
        ok = all(readback[i] == tuple(PIXELS[i]) for i in range(lo, hi + 1))
        per_spoke.append({**sp, "exact": ok})

    print(f"frames={len(captured)} distinct={identical} leds={n_px} bytes={len(final)}")
    print(f"exact pixel matches: {exact}/{n_px}")
    for sp in per_spoke:
        print(f"  spoke {sp['spoke']}  u{sp['beamhouse_universe']} "
              f"ch {sp['channel']:>3}-{sp['channel']+68:>3}  "
              f"LED {sp['leds'][0]:>3}-{sp['leds'][1]:>3}  "
              f"{'OK' if sp['exact'] else 'MISMATCH'}")
    for i in (0, 22, 23, 160, 161, 229):
        tag = ""
        if i == 160: tag = "  <- last LED of universe 1 (ch 510-512)"
        if i == 161: tag = "  <- first LED of universe 2 (ch 1-3)"
        print(f"  LED {i:>3}: sent {tuple(PIXELS[i])} got {readback[i]}{tag}")

    (OUT / "peek-frames.bin").write_bytes(b"".join(captured))
    (OUT / "result.json").write_text(json.dumps({
        "verified_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "node": {"ip": NODE, "name": info["name"], "mac": info["mac"],
                 "wled_version": info["ver"], "release": info["release"]},
        "node_dmx_config": dmx,
        "leds_in_first_universe": leds_first_universe,
        "patch": SPOKES,
        "pattern": {"r": "i & 0xFF", "g": "(255 - i) & 0xFF", "b": "(i % 23) * 11"},
        "result": {"frames": len(captured), "distinct_frames": identical,
                   "led_count": n_px, "exact_matches": exact,
                   "all_spokes_exact": all(s["exact"] for s in per_spoke)},
        "cadence_ms": {"min": min(intervals), "max": max(intervals),
                       "mean": round(sum(intervals)/len(intervals), 1),
                       "nominal": 40},
        "live_state_during_capture": {"live": info_live.get("live"),
                                      "lm": info_live.get("lm"),
                                      "lip": info_live.get("lip")},
        "sent_pixels": PIXELS,
        "read_pixels": readback,
    }, indent=1))
    print(f"wrote {OUT}")

    if exact != N_LEDS:
        raise SystemExit(f"FAIL: {N_LEDS - exact} pixels differ")
    print("PASS: all 230 pixels round-trip through the ten-fixture patch")

if __name__ == "__main__":
    main()
