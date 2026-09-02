# WLED universe semantics across Art-Net and sACN

Acceptance evidence for [#44](https://github.com/jnslmk/beamhouse/issues/44): the claim that
moving Mizer from Art-Net to sACN is invisible to the rig is **true above the bridge and false at
the receivers**, and this measures the difference on the live node.

## The claim under test

[ADR-0007](../../docs/adr/0007-one-universe-space-sacn-numbered.md) maps Beamhouse universe *u* to
Art-Net Port-Address *u−1* and to sACN universe *u*. Mizer implements exactly that — `ArtnetOutput`
sends `PortAddress::try_from(universe - 1)`, `SacnOutput` sends the universe verbatim — so the
transport swap changes no Beamhouse number.

WLED, however, holds **one** universe number and compares it against the raw universe field of
whichever protocol arrived:

```
Art-Net   uni = p->art_universe        wled00/e131.cpp:115   (the Port-Address)
E1.31     uni = htons(p->universe)     wled00/e131.cpp:130   (the sACN universe)
gate      if (uni < e131Universe || uni >= e131Universe + N) return;      :160
block     previousUniverses = uni - e131Universe;                         :162
```

So the same `e131Universe` means **different Beamhouse universes on the two transports**. That is
arithmetic off a source read. This turns it into an observation.

## Why no config change was needed

`ESPAsyncE131::parsePacket` sniffs `ACN_ID` against `ART_ID` **per packet**
(`ESPAsyncE131.cpp:100`–`126`) while `begin()` opens a **single** socket on a single port
(`:41`–`:62`). The tent's configured live port is 6454, so E1.31 sent *to 6454* is parsed as
E1.31. Phase A and B therefore ran against the node exactly as the rig leaves it — `uni 1`,
`addr 30`, `mode 4`, `mc false`, `port 6454`.

## Result (2026-09-02, node 192.168.1.243, WLED 16.0.1)

`universe-semantics.py` — solid colours, one per universe, seam at LED 161:

```
Phase A -- Art-Net: PA 1 = RED, PA 2 = BLUE
  LEDs     0-160  ->  (255, 0, 0)  RED
  LEDs   161-229  ->  (0, 0, 255)  BLUE

Phase B -- sACN: uni 1 = GREEN, uni 2 = YELLOW, uni 3 = MAGENTA
  LEDs     0-160  ->  (0, 255, 0)  GREEN
  LEDs   161-229  ->  (255, 255, 0)  YELLOW
```

**Art-Net Port-Address 1 and sACN universe 1 land on the same 161 pixels.** Those are Beamhouse
universes 2 and 1 respectively — the off-by-one, measured. sACN universe 3 (MAGENTA) never
appears: `previousLeds = 161 + 170 = 331 >= 230` returns early at `:352`.

So a naive cutover — Mizer to sACN, `e131Universe` left at 1 — would put **Beamhouse universe 1,
the CueCore2's**, onto the tent's first 161 pixels, and drop Beamhouse universe 3 entirely. The
tent lights. Nothing reports an error.

`confirm-fix.py` then set `e131Universe = 2`, re-measured, and reverted:

```
With e131Universe=2 -- sACN: uni 1 = GREEN, uni 2 = YELLOW, uni 3 = MAGENTA
  LEDs     0-160  ->  (255, 255, 0)  YELLOW
  LEDs   161-229  ->  (255, 0, 255)  MAGENTA

reverted e131Universe -> 1  OK
```

Beamhouse universes 2 and 3 land on LEDs 0–160 and 161–229 — exactly where Art-Net puts them
today. **The prescription is confirmed, not just the diagnosis.**

## What this adds to #44's checklist

- The tent's `e131Universe` must go **1 → 2**. Measured, both directions.
- The tent's live input port must go **6454 → 5568**: `e131Port` is one port for both protocols
  (`wled00/wled.h:467`), Mizer's sACN is fixed at `239.255.{hi}.{lo}:5568`, and a single socket
  means **the node cannot receive Art-Net and sACN at once** — there is no dual-run cutover.
- E1.31 multicast must be enabled; WLED defaults it off (`wled.h:473`, and the node reads
  `mc: false`).

## The cutover itself (2026-09-02)

`cutover-tent.py` applied all three node settings and rebooted (a live-settings write does not
re-run `initConnection()`, so `e131.begin()` never re-binds without one):

```
before:  uni=1 port=6454 mc=False mode=4 addr=30
after:   uni=2 port=5568 mc=True  mode=4 addr=30
```

`mode` and `addr` survived the reboot, as #23 already showed they do.

**The node half is confirmed.** Byte-identical E1.31 sent *unicast* to `5568` drives it exactly as
designed — Beamhouse universe 2 on LEDs 0–160, universe 3 on 161–229:

```
unicast sACN :5568   LED0=(255,255,0) YELLOW   LED161=(255,0,255) MAGENTA
```

Art-Net to 6454 no longer reaches it at all, as the single-port reading predicted.

### What did not work: multicast on this LAN

Mizer's `SacnOutput` has **no unicast path** — `universe_to_ip` always targets
`239.255.{hi}.{lo}:5568` — and multicast did **not** arrive:

```
multicast ttl=1: LED0 unchanged      multicast ttl=8: LED0 unchanged
```

Tried minutes after boot, so IGMP membership had long settled, and the join logic is correct —
`initMulticast` calls `listenMulticast(239.255.0.2, 5568)` then `igmp_joingroup` for each further
universe (`ESPAsyncE131.cpp:69`–`85`).

The control is what makes this clean: **same packets, same port, same universes — only the
destination address differs.** Unicast arrives, multicast does not. So the variable is delivery,
not the node and not the cutover.

**The cause is the node, not the network.** Chased to ground on 2026-09-02; two earlier guesses in
this file (the AP bridge, then IGMP scope) were both wrong and are replaced by this.

The network was eliminated first. Both OpenWrt devices in the path — the GL.iNet Flint 2 router at
192.168.1.1 and the EAP615 dumb AP — have `multicast_snooping = 0` on `br-lan`, and the AP sets
`network.lan.igmp_snooping='0'` explicitly. A bridge with snooping **off floods** multicast to
every port, so there is nothing to prune the group and no querier is needed. Independently, an
*active* mDNS query from this host resolves `wled-a52a34.local` to `192.168.1.243` — a host→node
multicast round trip on 224.0.0.251 — and `ip route get 239.255.0.2` picks `wlan0` with the right
source, so the packets leave correctly and multicast does reach the node's segment.

Three observations then isolate it to the node:

- Sending from the **wired router itself** (`nc -u -s 192.168.1.1 239.255.0.2 5568`) also fails, so
  the wireless-to-wired bridge is not the variable.
- **Universe 3 fails too**, and it is joined by a *different* code path than universe 2 —
  `e131Universe` is joined by `udp.listenMulticast()`, every later universe by an explicit
  `igmp_joingroup()` with `WLEDNetwork.localIP()` as the interface address
  (`ESPAsyncE131.cpp:69`–`85`). Both failing rules out one bad join.
- **Unicast to the same port, same universes, same packets, arrives perfectly.**

This node is Ethernet-only (`bssid` empty, `rssi` 0, ARP shows its Ethernet MAC). The reading that
fits every observation is that WLED's E1.31 group join is not effective on the Ethernet interface,
so the ESP32's MAC-level multicast filter never accepts `01:00:5e:7f:00:02`. mDNS still works
because WLED's mDNS joins its group by its own path. Not proven from inside the node — there is no
way to inspect lwIP's memberships remotely — so this is an inference from four measurements, not a
source-level confirmation.

**The consequence is much worse than a network fix.** Mizer's sACN is multicast-only, so it cannot
drive this tent over Ethernet *at all*, on any network. Moving Mizer to the wired segment does not
help.

So the rig was **reverted to Art-Net** the same day — one connection unicast to the tent, node back
at `uni 1` / port 6454 / multicast off, verified with an Art-Net frame (`revert-tent.py`). The sACN
move is deferred behind [#52](https://github.com/jnslmk/beamhouse/issues/52) (a unicast destination
for Mizer's sACN) and [#53](https://github.com/jnslmk/beamhouse/issues/53) (the WLED defect);
either one unblocks it.

## Running it

```
python universe-semantics.py [node-ip]   # read-only     no config change at all
python confirm-fix.py                    # transient     writes uni=2, measures, reverts in a finally
python cutover-tent.py                   # PERSISTENT    uni 2 / port 5568 / multicast on + reboot
python revert-tent.py                    # PERSISTENT    uni 1 / port 6454 / multicast off + reboot
```

Needs the `websocket` module for the Peek readback, as
[`../star-tent-repatch`](../star-tent-repatch) does.

The first two abort unless the node is in #23's configuration (`mode 4`, `addr 30`, `uni 1`); the
last two check `mode` and `addr` only, since they are what change `uni`. All four assert `mode 4`
and `addr 30` survive, because those are the patch's own preconditions and a reboot is involved.

## Preconditions and state

**The node is currently on Art-Net** — `uni 1`, `addr 30`, `mode 4`, `mc false`, `port 6454`,
verified after `revert-tent.py`. That is where the rig needs it until
[#52](https://github.com/jnslmk/beamhouse/issues/52) or
[#53](https://github.com/jnslmk/beamhouse/issues/53) lands.

`universe-semantics.py` and `confirm-fix.py` leave the node exactly as they found it —
`confirm-fix.py` reverts in a `finally` and prints the readback, so even an interrupted run says
what the node was left at. **`cutover-tent.py` and `revert-tent.py` do not**: they write flash and
reboot, and are the two halves of a deliberate state change.
