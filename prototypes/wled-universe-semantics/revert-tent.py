#!/usr/bin/env python3
"""Revert the STAR-TENT to Art-Net (#44 option 1).

WLED's E1.31 group join is not effective on this node's Ethernet interface, so
Mizer's multicast-only sACN cannot reach it at all. Until that is fixed upstream
or Mizer gains a unicast destination, Art-Net is the only transport that works.

    e131Universe   2    -> 1       (Art-Net Port-Address 1/2 = Beamhouse 2/3)
    e131Port       5568 -> 6454
    e131Multicast  on   -> off

Reboots, because e131.begin() only re-binds from initConnection(). Then proves
the revert with an Art-Net frame, the same index-free solid-colour check the
cutover used.
"""
import json, socket, sys, time, threading, urllib.request, importlib.util
spec = importlib.util.spec_from_file_location("us", "universe-semantics.py")
us = importlib.util.module_from_spec(spec); spec.loader.exec_module(us)
NODE = us.NODE
WANT = {"uni": 1, "port": 6454, "mc": False}

def live():
    with urllib.request.urlopen(f"http://{NODE}/json/cfg", timeout=10) as r:
        return json.load(r)["if"]["live"]

def post(path, payload):
    req = urllib.request.Request(f"http://{NODE}{path}", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r: return r.read()

def show(l): print(f"  uni={l['dmx']['uni']} port={l['port']} mc={l['mc']} "
                   f"mode={l['dmx']['mode']} addr={l['dmx']['addr']}")

def artnet_stream(universes, stop):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); seq = 0
    while not stop.is_set():
        for pa, data in universes: s.sendto(us.artdmx(pa, seq, data), (NODE, 6454))
        seq = (seq + 1) & 0xFF; time.sleep(1/30)
    s.close()

print("before:"); show(live())
post("/json/cfg", {"if": {"live": {"dmx": {"uni": WANT["uni"]},
                                   "port": WANT["port"], "mc": WANT["mc"]}}})
time.sleep(1.0); post("/json/state", {"rb": True}); print("rebooting ...")
deadline = time.time() + 60
while time.time() < deadline:
    time.sleep(3)
    try: after = live(); break
    except Exception: continue
else: raise SystemExit("node did not come back")
time.sleep(2); after = live()
print("after:"); show(after)
got = {"uni": after["dmx"]["uni"], "port": after["port"], "mc": after["mc"]}
if got != WANT: raise SystemExit(f"revert did not take: wanted {WANT}, got {got}")
if (after["dmx"]["mode"], after["dmx"]["addr"]) != (4, 30):
    raise SystemExit("mode/addr did not survive the reboot")

print("\nArt-Net PA 1 = RED, PA 2 = BLUE (as the rig drove it before the cutover)")
stop = threading.Event()
threading.Thread(target=artnet_stream, args=([(1, us.universe_payload(us.RED, True)),
                                             (2, us.universe_payload(us.BLUE, False))], stop),
                 daemon=True).start()
time.sleep(1.5)
try: px = us.peek()
finally: stop.set(); time.sleep(0.4)
a, b = px[0], px[us.SEAM]
print(f"  LEDs     0-{us.SEAM-1}  ->  {a}  {us.NAMES.get(a,'?')}")
print(f"  LEDs   {us.SEAM}-{us.N_LEDS-1}  ->  {b}  {us.NAMES.get(b,'?')}")
ok = (a == us.RED and b == us.BLUE)
print("\n  REVERT CONFIRMED -- the tent is back on Art-Net, Beamhouse universes 2 and 3"
      if ok else "\n  REVERT NOT CONFIRMED")
(us.OUT / "revert.json").write_text(json.dumps(
    {"after": after, "artnet": {"led_0": a, f"led_{us.SEAM}": b}, "confirmed": ok}, indent=2))
sys.exit(0 if ok else 1)
