#!/usr/bin/env python3
"""Cut the STAR-TENT over from Art-Net to sACN and prove it on the wire (#44).

Three settings, all on the node:
    e131Universe   1    -> 2       (ADR-0007: sACN universe u IS Beamhouse u)
    e131Port       6454 -> 5568    (one port for both protocols, wled.h:467)
    e131Multicast  off  -> on      (Mizer's sACN is multicast-only)

`e131.begin()` runs only from initConnection() (wled.cpp:955), which a live-settings
write does not trigger, so the node is rebooted. Config is flash-persisted -- #23
already showed addr/mode survive a power cycle.

Then it proves the result the way Mizer will actually drive it: real multicast E1.31
to 239.255.0.2 and 239.255.0.3 on 5568, read back off the Peek websocket. Finally a
negative control -- Art-Net to 6454 must no longer reach the node.
"""
import json, socket, struct, sys, time, urllib.request, importlib.util
spec = importlib.util.spec_from_file_location("us", "universe-semantics.py")
us = importlib.util.module_from_spec(spec); spec.loader.exec_module(us)

NODE, IFACE = us.NODE, "192.168.1.171"
WANT = {"uni": 2, "port": 5568, "mc": True}

def cfg():
    with urllib.request.urlopen(f"http://{NODE}/json/cfg", timeout=10) as r:
        return json.load(r)["if"]["live"]

def post(path, payload):
    req = urllib.request.Request(f"http://{NODE}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()

def show(live, label):
    print(f"  {label:<9} uni={live['dmx']['uni']} port={live['port']} mc={live['mc']} "
          f"mode={live['dmx']['mode']} addr={live['dmx']['addr']}")

def mcast_stream(universes, stop):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 8)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(IFACE))
    seq = 0
    while not stop.is_set():
        for u, payload in universes:
            grp = f"239.255.{(u >> 8) & 0xFF}.{u & 0xFF}"
            sock.sendto(us.e131(u, seq, payload), (grp, 5568))
        seq = (seq + 1) & 0xFF
        time.sleep(1/30)
    sock.close()

def measure(universes, streamer):
    import threading
    stop = threading.Event()
    threading.Thread(target=streamer, args=(universes, stop), daemon=True).start()
    time.sleep(1.2)
    try:
        return us.peek()
    finally:
        stop.set(); time.sleep(0.3)

def main():
    before = cfg()
    print("before:"); show(before, "")
    if (before["dmx"]["mode"], before["dmx"]["addr"]) != (4, 30):
        raise SystemExit("node is not in #23's mode/addr configuration; aborting")

    print("\napplying cutover ...")
    post("/json/cfg", {"if": {"live": {"dmx": {"uni": WANT["uni"]},
                                      "port": WANT["port"], "mc": WANT["mc"]}}})
    time.sleep(1.0)
    post("/json/state", {"rb": True})
    print("rebooting ...")
    deadline = time.time() + 60
    while time.time() < deadline:
        time.sleep(3)
        try:
            after = cfg(); break
        except Exception:
            continue
    else:
        raise SystemExit("node did not come back after reboot")
    time.sleep(2)
    after = cfg()
    print("after:"); show(after, "")
    got = {"uni": after["dmx"]["uni"], "port": after["port"], "mc": after["mc"]}
    if got != WANT:
        raise SystemExit(f"cutover did not take: wanted {WANT}, got {got}")
    if (after["dmx"]["mode"], after["dmx"]["addr"]) != (4, 30):
        raise SystemExit("mode/addr did not survive the reboot")

    print("\nmulticast sACN -- 239.255.0.2 = YELLOW (Beamhouse u2), 239.255.0.3 = MAGENTA (u3)")
    px = measure([(2, us.universe_payload(us.YELLOW, True)),
                  (3, us.universe_payload(us.MAGENTA, False))], mcast_stream)
    a, b = px[0], px[us.SEAM]
    print(f"  LEDs     0-{us.SEAM-1}  ->  {a}  {us.NAMES.get(a,'?')}")
    print(f"  LEDs   {us.SEAM}-{us.N_LEDS-1}  ->  {b}  {us.NAMES.get(b,'?')}")
    live_ok = (a == us.YELLOW and b == us.MAGENTA)

    print("\nnegative control -- Art-Net PA 1 = RED to 6454 (must NOT reach the node)")
    import threading
    stop = threading.Event()
    def artnet_stream(universes, st):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        seq = 0
        while not st.is_set():
            for u, payload in universes:
                sock.sendto(us.artdmx(u, seq, payload), (NODE, 6454))
            seq = (seq + 1) & 0xFF; time.sleep(1/30)
        sock.close()
    px2 = measure([(1, us.universe_payload(us.RED, True))], artnet_stream)
    c = px2[0]
    print(f"  LEDs     0-{us.SEAM-1}  ->  {c}  {us.NAMES.get(c,'?')}")
    artnet_deaf = (c != us.RED)

    print("\n--- verdict ---")
    print(f"  sACN multicast drives the tent on Beamhouse universes 2 and 3: "
          f"{'YES' if live_ok else 'NO'}")
    print(f"  Art-Net on 6454 no longer reaches it: {'YES' if artnet_deaf else 'NO'}")
    ok = live_ok and artnet_deaf
    print("  CUTOVER CONFIRMED" if ok else "  CUTOVER NOT CONFIRMED")
    (us.OUT / "cutover.json").write_text(json.dumps({
        "before": before, "after": after,
        "sacn_multicast": {"led_0": a, f"led_{us.SEAM}": b, "ok": live_ok},
        "artnet_negative_control": {"led_0": c, "deaf": artnet_deaf},
        "confirmed": ok}, indent=2))
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
