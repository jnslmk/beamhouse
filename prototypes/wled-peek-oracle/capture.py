#!/usr/bin/env python3
"""Capture a WLED Peek (Live LED Stream) readback as a strip-path conformance oracle.

Drives the node per-pixel over Art-Net with an index-ramp pattern, reads the
resulting segment buffer back off ws://<node>/ws, and writes both halves plus
the preconditions that make the pair interpretable.

Resolves wayfinder ticket #26. See README.md for why each precondition matters.
"""
import json, socket, struct, sys, threading, time, pathlib

NODE      = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.243"
ARTNET_PORT = 6454
N_LEDS    = 230
PROFILE   = 23                    # pixels per LED profile (#21)
OUT       = pathlib.Path(__file__).parent / "capture"

DMX_MODE_EFFECT_SEGMENT_W = 9     # what the node is configured for (show config)
DMX_MODE_MULTIPLE_RGB     = 4     # what the capture needs

# --- the pattern -------------------------------------------------------------
# Index ramp, not a flat colour: each channel catches a different index-space bug.
#   R = i          -> absolute index; catches offset and global reversal
#   G = 255 - i    -> redundant descending ramp; catches channel swaps
#   B = (i%23)*11  -> profile-relative sawtooth; catches stride errors and
#                     per-spoke reversal, which a monotone ramp hides
def pattern(i):
    return (i & 0xFF, (255 - i) & 0xFF, (i % PROFILE) * 11)

PIXELS = [pattern(i) for i in range(N_LEDS)]

# --- Art-Net -----------------------------------------------------------------
def artdmx(port_address, seq, data):
    return (b"Art-Net\x00"
            + struct.pack("<H", 0x5000)          # OpDmx, little-endian
            + struct.pack(">H", 14)              # ProtVer 14, big-endian
            + bytes([seq & 0xFF, 0])             # sequence, physical
            + struct.pack("<H", port_address)    # SubUni | Net<<8 (e131.cpp:115)
            + struct.pack(">H", len(data))       # length, big-endian
            + bytes(data))

# WLED: universe N carries LEDs [prev, prev+len); 170 LEDs/universe at 3 ch/LED
# (MAX_3_CH_LEDS_PER_UNIVERSE, e131.cpp:3). DMXAddress=1 and Art-Net is 0-indexed,
# so universe 1 starts at data index 0.
UNIVERSES = [(1, 0, 170), (2, 170, 230)]        # (port-address, first led, last led)

def frames():
    out = []
    for pa, lo, hi in UNIVERSES:
        data = bytearray()
        for i in range(lo, hi):
            data += bytes(PIXELS[i])
        out.append((pa, bytes(data)))
    return out

_stop = threading.Event()
def stream():
    """WLED holds realtime for `timeout` (2.5 s); keep it fed at ~30 Hz."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    fs, seq = frames(), 0
    while not _stop.is_set():
        for pa, data in fs:
            sock.sendto(artdmx(pa, seq, data), (NODE, ARTNET_PORT))
        seq = (seq + 1) & 0xFF
        time.sleep(1/30)
    sock.close()

# --- node config -------------------------------------------------------------
import urllib.request
def get(path):
    with urllib.request.urlopen(f"http://{NODE}{path}", timeout=10) as r:
        return json.load(r)

def post_cfg(obj):
    req = urllib.request.Request(f"http://{NODE}/json/cfg",
                                 data=json.dumps(obj).encode(),
                                 headers={"Content-Type": "application/json"},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read().decode()

def set_mode(mode):
    post_cfg({"if": {"live": {"dmx": {"mode": mode}}}})
    time.sleep(1.0)
    got = get("/json/cfg")["if"]["live"]["dmx"]["mode"]
    if got != mode:
        raise SystemExit(f"node refused DMX mode {mode} (still {got})")
    return got

# --- capture -----------------------------------------------------------------
def main():
    import websocket
    OUT.mkdir(parents=True, exist_ok=True)

    info_before = get("/json/info")
    cfg_before  = get("/json/cfg")
    original_mode = cfg_before["if"]["live"]["dmx"]["mode"]
    print(f"node {NODE}  ver {info_before['ver']}  arch {info_before['arch']}  "
          f"leds {info_before['leds']['count']}  dmx mode {original_mode}")

    set_mode(DMX_MODE_MULTIPLE_RGB)
    print(f"dmx mode {original_mode} -> {DMX_MODE_MULTIPLE_RGB} (MULTIPLE_RGB)")

    captured, stamps = [], []
    try:
        threading.Thread(target=stream, daemon=True).start()
        time.sleep(0.5)                       # let realtime engage

        ws = websocket.WebSocket()
        ws.connect(f"ws://{NODE}/ws", timeout=10)
        ws.send(json.dumps({"lv": True}))

        deadline = time.time() + 20
        while time.time() < deadline and len(captured) < 40:
            f = ws.recv()
            if not isinstance(f, (bytes, bytearray)) or len(f) < 2 or f[0] != ord('L'):
                continue
            stamps.append(time.time())
            captured.append(bytes(f))
            # collect a run long enough to characterise cadence; the ticket asks
            # for the observed interval against the nominal 40 ms, and two
            # samples cannot answer that.
            if len(captured) >= 30:
                break

        info_live = get("/json/info")
        ws.send(json.dumps({"lv": False}))
        ws.close()
    finally:
        _stop.set()
        time.sleep(0.3)
        set_mode(original_mode)
        print(f"dmx mode restored -> {original_mode}")

    if not captured:
        raise SystemExit("no Peek frames received")

    final = captured[-1]
    version, n_px = final[1], (len(final) - 2) // 3
    readback = [tuple(final[2 + 3*i: 5 + 3*i]) for i in range(n_px)]
    intervals = [round((b - a) * 1000, 1) for a, b in zip(stamps, stamps[1:])]

    (OUT / "peek-frames.bin").write_bytes(b"".join(captured))
    (OUT / "sent-pattern.json").write_text(json.dumps({
        "description": "Art-Net per-pixel index ramp driven into the node",
        "channels_per_led": 3,
        "universes": [{"art_net_port_address": pa, "leds": [lo, hi - 1],
                       "channels": (hi - lo) * 3} for pa, lo, hi in UNIVERSES],
        "formula": {"r": "i & 0xFF", "g": "(255 - i) & 0xFF",
                    "b": "(i % 23) * 11"},
        "pixels": PIXELS,
    }, indent=1))
    (OUT / "peek-readback.json").write_text(json.dumps({
        "frame_header": {"magic": "L", "version": version},
        "led_count": n_px,
        "pixels": readback,
    }, indent=1))
    (OUT / "metadata.json").write_text(json.dumps({
        "captured_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "node": {
            "ip": NODE, "name": info_before["name"], "mac": info_before["mac"],
            "wled_version": info_before["ver"], "vid": info_before["vid"],
            "arch": info_before["arch"], "release": info_before["release"],
        },
        "preconditions": {
            "brightness": info_before["state"]["bri"] if "state" in info_before else get("/json/state")["bri"],
            "force_max_brightness": cfg_before["if"]["live"]["maxbri"],
            "gamma_correction_disabled": cfg_before["if"]["live"]["no-gc"],
            "driven_rgb_only_white_zero": True,
            "max_live_leds_ws": 1024 if info_before["arch"] == "esp32" else 256,
            "downsample_n": 1,
            "led_count": info_before["leds"]["count"],
            "rgbw_bus": info_before["leds"]["rgbw"],
            "light_capabilities": info_before["leds"]["lc"],
            "dmx_mode_during_capture": DMX_MODE_MULTIPLE_RGB,
            "dmx_mode_restored_to": original_mode,
            "dmx_start_address": cfg_before["if"]["live"]["dmx"]["addr"],
            "configured_universe": cfg_before["if"]["live"]["dmx"]["uni"],
        },
        "live_state_during_capture": {
            "live": info_live.get("live"), "lm": info_live.get("lm"),
            "lip": info_live.get("lip"),
        },
        "cadence_ms": {
            "frames": len(captured), "intervals": intervals,
            "min": min(intervals) if intervals else None,
            "max": max(intervals) if intervals else None,
            "mean": round(sum(intervals) / len(intervals), 1) if intervals else None,
            "nominal": 40,
        },
        "frame_bytes": len(final),
    }, indent=1))

    exact = sum(1 for i in range(min(n_px, N_LEDS)) if readback[i] == tuple(PIXELS[i]))
    print(f"frames={len(captured)} version={version} leds={n_px} bytes={len(final)}")
    print(f"cadence ms: min={min(intervals) if intervals else '-'} "
          f"max={max(intervals) if intervals else '-'} "
          f"mean={round(sum(intervals)/len(intervals),1) if intervals else '-'}")
    print(f"exact pixel matches: {exact}/{n_px}")
    for i in (0, 1, 22, 23, 169, 170, 228, 229):
        if i < n_px:
            print(f"  led {i:3d}  sent {tuple(PIXELS[i])}  read {readback[i]}")

if __name__ == "__main__":
    main()
