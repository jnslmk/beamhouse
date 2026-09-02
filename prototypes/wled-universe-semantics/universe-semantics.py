#!/usr/bin/env python3
"""Measure WLED's universe semantics across Art-Net and sACN (wayfinder #44).

#44's cutover claims "Beamhouse universe numbers do not change". That is true
above the bridge and false at the receiver, because WLED holds ONE universe
number and compares it against the raw universe field of whichever protocol
arrived:

    Art-Net   uni = p->art_universe        e131.cpp:115   (the Port-Address)
    E1.31     uni = htons(p->universe)     e131.cpp:130   (the sACN universe)
    gate      if (uni < e131Universe || uni >= e131Universe + N) return;  :160

Under ADR-0007, Beamhouse universe u is Art-Net Port-Address u-1 and sACN
universe u. So the same e131Universe means different Beamhouse universes on the
two transports -- an off-by-one that lights the rig from the wrong console
universe with nothing reporting an error.

This turns that source reading into a measurement, with NO config change to the
node: ESPAsyncE131::parsePacket sniffs ACN_ID vs ART_ID per packet
(ESPAsyncE131.cpp:100-126) while listening on a single port, so E1.31 sent to
the node's currently-configured 6454 is parsed as E1.31.

Phase A  Art-Net  PA 1 = RED     PA 2 = BLUE
Phase B  sACN     uni 1 = GREEN  uni 2 = YELLOW  uni 3 = MAGENTA

If the gate is a raw compare, both phases put their FIRST-listed universe on
LEDs 0-160 -- i.e. sACN universe 1 lands where Art-Net Port-Address 1 lands,
one Beamhouse universe apart. If instead anything adjusted for the transport,
phase B would put YELLOW on LEDs 0-160.
"""
import json, socket, struct, sys, threading, time, pathlib, urllib.request, uuid

NODE     = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.243"
PORT     = 6454                    # the node's configured live input port
N_LEDS   = 230
DMX_ADDR = 30
SEAM     = (512 - DMX_ADDR + 1) // 3          # 161
OUT      = pathlib.Path(__file__).parent / "capture"

RED, BLUE, GREEN, YELLOW, MAGENTA = (255,0,0),(0,0,255),(0,255,0),(255,255,0),(255,0,255)
NAMES = {RED:"RED", BLUE:"BLUE", GREEN:"GREEN", YELLOW:"YELLOW", MAGENTA:"MAGENTA", (0,0,0):"black"}

CID = uuid.uuid4().bytes

def artdmx(pa, seq, data):
    return (b"Art-Net\x00" + struct.pack("<H", 0x5000) + struct.pack(">H", 14)
            + bytes([seq & 0xFF, 0]) + struct.pack("<H", pa)
            + struct.pack(">H", len(data)) + bytes(data))

def e131(universe, seq, data, priority=100):
    """ANSI E1.31 data packet. property_values[0] is the start code, so DMX
    channel N sits at property_values[N] -- which is what WLED's dataOffset =
    DMXAddress indexes without the Art-Net decrement (e131.cpp:110-113)."""
    pv = bytes([0]) + bytes(data)                 # start code + data
    total = 126 + len(data)
    p  = bytearray(total)
    struct.pack_into(">HH", p, 0, 0x0010, 0x0000)                  # preamble/postamble
    p[4:16]  = b"ASC-E1.17\x00\x00\x00"
    struct.pack_into(">H", p, 16, 0x7000 | (total - 16))           # root flags/length
    struct.pack_into(">I", p, 18, 0x00000004)                      # VECTOR_ROOT_E131_DATA
    p[22:38] = CID
    struct.pack_into(">H", p, 38, 0x7000 | (total - 38))           # framing flags/length
    struct.pack_into(">I", p, 40, 0x00000002)                      # VECTOR_E131_DATA_PACKET
    p[44:44+11] = b"beamhouse44"                                   # source name (64 bytes)
    p[108] = priority
    struct.pack_into(">H", p, 109, 0)                              # sync address
    p[111] = seq & 0xFF
    p[112] = 0                                                     # options: preview bit clear
    struct.pack_into(">H", p, 113, universe)
    struct.pack_into(">H", p, 115, 0x7000 | (total - 115))         # DMP flags/length
    p[117] = 0x02                                                  # VECTOR_DMP_SET_PROPERTY
    p[118] = 0xa1
    struct.pack_into(">HHH", p, 119, 0x0000, 0x0001, len(pv))
    p[125:125+len(pv)] = pv
    return bytes(p)

def universe_payload(colour, first):
    """Fill one universe with a solid colour, respecting DMXAddress on the
    first universe and starting at channel 1 on every later one."""
    if first:
        buf = bytearray(512)
        for i in range(SEAM):
            buf[DMX_ADDR - 1 + 3*i : DMX_ADDR - 1 + 3*i + 3] = bytes(colour)
    else:
        buf = bytearray(3 * (N_LEDS - SEAM))
        for i in range(N_LEDS - SEAM):
            buf[3*i:3*i+3] = bytes(colour)
    return bytes(buf)

_stop = threading.Event()

def stream(builder, universes):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    seq = 0
    while not _stop.is_set():
        for u, payload in universes:
            sock.sendto(builder(u, seq, payload), (NODE, PORT))
        seq = (seq + 1) & 0xFF
        time.sleep(1/30)
    sock.close()

def peek(n=6):
    import websocket
    ws = websocket.WebSocket()
    ws.connect(f"ws://{NODE}/ws", timeout=10)
    ws.send(json.dumps({"lv": True}))
    frames, deadline = [], time.time() + 15
    while time.time() < deadline and len(frames) < n:
        f = ws.recv()
        if isinstance(f, (bytes, bytearray)) and len(f) > 2 and f[0] == ord('L'):
            frames.append(bytes(f))
    ws.send(json.dumps({"lv": False}))
    ws.close()
    if not frames:
        raise SystemExit("no Peek frames received")
    final = frames[-1]
    return [tuple(final[2+3*i : 5+3*i]) for i in range((len(final) - 2)//3)]

def run(label, builder, universes):
    global _stop
    _stop = threading.Event()
    t = threading.Thread(target=stream, args=(builder, universes), daemon=True)
    t.start()
    time.sleep(1.2)                       # let realtime lock take and settle
    try:
        px = peek()
    finally:
        _stop.set(); time.sleep(0.3)
    blocks = {"0-%d" % (SEAM-1): px[0], "%d-%d" % (SEAM, N_LEDS-1): px[SEAM]}
    print(f"\n{label}")
    for rng, c in blocks.items():
        print(f"  LEDs {rng:>9}  ->  {c}  {NAMES.get(c, '?')}")
    return px

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"http://{NODE}/json/cfg", timeout=10) as r:
        dmx = json.load(r)["if"]["live"]["dmx"]
    print(f"node {NODE}  mode={dmx['mode']} addr={dmx['addr']} uni={dmx['uni']} "
          f"e131prio={dmx['e131prio']}  seam at LED {SEAM}")
    if (dmx["mode"], dmx["addr"], dmx["uni"]) != (4, 30, 1):
        raise SystemExit("node is not in the #23 configuration; aborting")

    a = run("Phase A -- Art-Net: PA 1 = RED, PA 2 = BLUE",
            artdmx, [(1, universe_payload(RED, True)), (2, universe_payload(BLUE, False))])
    b = run("Phase B -- sACN: uni 1 = GREEN, uni 2 = YELLOW, uni 3 = MAGENTA",
            e131, [(1, universe_payload(GREEN, True)),
                   (2, universe_payload(YELLOW, False)),
                   (3, universe_payload(MAGENTA, False))])

    first_a, first_b = a[0], b[0]
    print("\n--- verdict ---")
    print(f"  Art-Net Port-Address 1  (Beamhouse universe 2) -> LEDs 0-{SEAM-1}: {NAMES.get(first_a,'?')}")
    print(f"  sACN    universe     1  (Beamhouse universe 1) -> LEDs 0-{SEAM-1}: {NAMES.get(first_b,'?')}")
    raw = (first_a == RED and first_b == GREEN and b[SEAM] == YELLOW)
    if raw:
        print("  RAW COMPARE CONFIRMED: the node's one universe number means")
        print("  Port-Address n on Art-Net and universe n on sACN -- one Beamhouse")
        print("  universe apart. Cutting Mizer over with e131Universe=1 would put")
        print("  Beamhouse universe 1 (the CueCore2's) onto the tent's first 161 pixels.")
        print("  Fix: set the tent's e131Universe to 2.")
    elif first_b == YELLOW:
        print("  NOT a raw compare: sACN appears to be adjusted by one. #44 needs rewriting.")
    else:
        print("  INCONCLUSIVE -- see the capture.")
    (OUT / "result.json").write_text(json.dumps({
        "node": NODE, "cfg": dmx, "seam": SEAM,
        "phase_a_artnet": {"led_0": first_a, f"led_{SEAM}": a[SEAM]},
        "phase_b_sacn":   {"led_0": first_b, f"led_{SEAM}": b[SEAM]},
        "raw_compare_confirmed": raw,
    }, indent=2))
    print(f"\nwrote {OUT/'result.json'}")

if __name__ == "__main__":
    main()
