#!/usr/bin/env python3
"""Confirm #44's prescription on the live node: with e131Universe=2, Beamhouse
universe 2 sent as sACN universe 2 lands back on LEDs 0-160, where Art-Net
Port-Address 1 puts it today. Sets uni=2, measures, and ALWAYS reverts to 1."""
import json, time, urllib.request, threading, sys
import importlib.util
spec = importlib.util.spec_from_file_location("us", "universe-semantics.py")
us = importlib.util.module_from_spec(spec); spec.loader.exec_module(us)

NODE = us.NODE

def set_uni(u):
    body = json.dumps({"if": {"live": {"dmx": {"uni": u}}}}).encode()
    req = urllib.request.Request(f"http://{NODE}/json/cfg", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()
    time.sleep(1.0)
    with urllib.request.urlopen(f"http://{NODE}/json/cfg", timeout=10) as r:
        return json.load(r)["if"]["live"]["dmx"]["uni"]

ok = False
try:
    got = set_uni(2)
    print(f"set e131Universe -> {got}")
    if got != 2:
        raise SystemExit("node did not accept uni=2")
    px = us.run("With e131Universe=2 -- sACN: uni 1 = GREEN, uni 2 = YELLOW, uni 3 = MAGENTA",
                us.e131, [(1, us.universe_payload(us.GREEN, True)),
                          (2, us.universe_payload(us.YELLOW, True)),
                          (3, us.universe_payload(us.MAGENTA, False))])
    first = px[0]
    print("\n--- verdict ---")
    print(f"  sACN universe 2 (Beamhouse universe 2) -> LEDs 0-{us.SEAM-1}: {us.NAMES.get(first,'?')}")
    ok = (first == us.YELLOW)
    print("  FIX CONFIRMED: e131Universe=2 restores Beamhouse universe 2 to the"
          if ok else "  FIX NOT CONFIRMED -- unexpected:")
    if ok:
        print("  tent's first 161 pixels, exactly where Art-Net Port-Address 1 puts it today.")
finally:
    back = set_uni(1)
    print(f"\nreverted e131Universe -> {back}  {'OK' if back == 1 else '*** REVERT FAILED ***'}")
    sys.exit(0 if ok and back == 1 else 1)
