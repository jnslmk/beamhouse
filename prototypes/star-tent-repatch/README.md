# STAR-TENT re-addressing check

Acceptance evidence for [#23](https://github.com/jnslmk/beamhouse/issues/23): the tent's
ten-fixture per-pixel patch, verified against the live node rather than against arithmetic.

## What it checks

[ADR-0009](../../docs/adr/0009-a-fixture-is-addressed-per-break.md) re-addresses the node to
`DMXAddress 30` so that WLED's fixed

```
ledsInFirstUniverse = (512 - DMXAddress + 1) / 3        # wled00/e131.cpp:347
```

comes out at `161 = 7 x 23` — putting the universe boundary on a spoke boundary, so no fixture
straddles it. That is a claim about a device, derived by reading its source. This turns it into
an observation.

`verify.py` drives [#26](https://github.com/jnslmk/beamhouse/issues/26)'s index-ramp pattern
into the node **through the patch under test** — each of the ten spokes written into its own
69 patched slots, across Art-Net Port-Addresses 1 and 2 — then reads all 230 pixels back off the
Peek (Live LED Stream) websocket and asserts they match pixel for pixel.

Building the universes per fixture rather than as one flat 690-byte ramp split in two is the
point: what is under test is that **ten independent 69-channel patches reassemble into the
node's one 230-pixel index space** with no gap and no overlap. A flat ramp would pass even if
the per-fixture addressing were wrong.

## Result (2026-09-02, node 192.168.1.243, WLED 16.0.1)

```
ledsInFirstUniverse = (512 - 30 + 1) / 3 = 161  (7 x 23)
frames=30 distinct=1 leds=230 bytes=692
exact pixel matches: 230/230
  spoke 0  u2 ch  30- 98  LED   0- 22  OK
  spoke 1  u2 ch  99-167  LED  23- 45  OK
  spoke 2  u2 ch 168-236  LED  46- 68  OK
  spoke 3  u2 ch 237-305  LED  69- 91  OK
  spoke 4  u2 ch 306-374  LED  92-114  OK
  spoke 5  u2 ch 375-443  LED 115-137  OK
  spoke 6  u2 ch 444-512  LED 138-160  OK
  spoke 7  u3 ch   1- 69  LED 161-183  OK
  spoke 8  u3 ch  70-138  LED 184-206  OK
  spoke 9  u3 ch 139-207  LED 207-229  OK
  LED 160: sent (160, 95, 242) got (160, 95, 242)  <- last LED of universe 2 (ch 510-512)
  LED 161: sent (161, 94, 0)   got (161, 94, 0)    <- first LED of universe 3 (ch 1-3)
PASS
```

The seam moved from LED 169 -> 170 (what #26 observed at `DMXAddress 1`) to LED 160 -> 161, which
is exactly the spoke 6 -> spoke 7 boundary. Universe 2 fills to the byte: spoke 6 ends at slot
512.

**Reproduced after a power cycle.** The node dropped off and came back mid-session; the run above
is the post-reboot one. WLED persists `cfg.json` to flash, so `addr 30` / `mode 4` survived, and
the round-trip is identical. That makes the cutover durable rather than a runtime setting -- and
it is also the failure mode ADR-0009 decision 4 guards against, since the day someone reflashes
or factory-resets the node it comes back at `DMXAddress 1` and this patch is silently wrong.

## Preconditions

The script **refuses to run** unless the node is already in DMX mode 4 (`MULTIPLE_RGB`) at
`DMXAddress 30`. It deliberately does not perform the cutover it is auditing — a script that
fixes the configuration it is checking cannot fail. The cutover itself, and its one-call revert,
are in
[`docs/research/obf26-definition-migration.md` §3](../../docs/research/obf26-definition-migration.md).

Needs the node powered and reachable, and `websocket-client`. WLED serves the Peek stream to one
client at a time.

## Relation to #26's oracle

Different jobs. `prototypes/wled-peek-oracle/` is a captured **offline** oracle for the strip
render path — frames on disk, no hardware needed ever again. This is a **live** check of one
specific patch, and it is not a substitute for anything: ADR-0009 rule 4 explicitly tests the
multi-break path against that offline oracle rather than against this rig, precisely so that the
re-addressing here stays revertible rather than load-bearing.
