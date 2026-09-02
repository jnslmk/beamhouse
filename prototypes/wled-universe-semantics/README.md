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

## Running it

```
python universe-semantics.py [node-ip]     # read-only: no config change
python confirm-fix.py                      # writes uni=2, measures, always reverts to 1
```

Needs the `websocket` module for the Peek readback, as
[`../star-tent-repatch`](../star-tent-repatch) does. Both scripts abort unless the node is in
#23's configuration (`mode 4`, `addr 30`, `uni 1`).

## Preconditions and state

The node is left exactly as found — verified after the run: `uni 1`, `addr 30`, `mode 4`,
`mc false`, `port 6454`, `live false`. `confirm-fix.py` reverts in a `finally` and reports the
readback, so an interrupted run still says what the node was left at.
