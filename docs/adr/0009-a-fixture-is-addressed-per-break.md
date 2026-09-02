# ADR-0009: A fixture is addressed per break, and is stale if any break is stale

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#22](https://github.com/jnslmk/beamhouse/issues/22)

## Context

Every fixture in a Mizer patch carries a singular `universe:` and a singular `channel:`, and
Beamhouse inherited that shape. [#21](https://github.com/jnslmk/beamhouse/issues/21) produced a
rig where it is a lie: the STAR-TENT's 230 pixels need 690 slots, against a 512-slot universe.

**The obvious escape does not work.** The ticket assumed that patching the tent as ten 23-pixel
spokes would keep every fixture inside one universe. WLED packs
`(512 − DMXAddress + 1) / 3 = 170` LEDs into the first universe (`wled00/e131.cpp:347`), and 170
is not a multiple of 23 — so spoke 7 (LEDs 161–183) straddles the boundary, with LEDs 161–169 in
one universe and 170–183 in the next. [#26](https://github.com/jnslmk/beamhouse/issues/26)'s
oracle had already confirmed that 169 → 170 boundary by observation. Grouping does not decide
this; the device's fixed packing does.

**The two patch sources disagree about whether the case is even expressible.**

- **Mizer cannot express it.** `FixtureConfig` is `{ channel: u16, universe: Option<u16> }`
  (`crates/projects/src/lib.rs:205`) with no breaks, and `Fixture::write_dmx` builds a
  `[u8; 512]` indexed by *absolute* channel before handing it to one universe
  (`crates/components/fixtures/src/fixture.rs:295`–`301`) — a 690-channel mode indexes
  `buffer[689]` and panics on the bounds check. Its `SubFixture` is not a way out: the comment on
  `channel_values` records that it holds "all dmx channels including sub-fixtures", sharing the
  one buffer and the one universe. It is a control grouping, not an addressing unit.
- **MVR can express it.** `Addresses` is universe + address *per DMX break* (`DESIGN.md` §4.3),
  which is exactly what GDTF's `DMXBreak` is for. Beamhouse reads MVR files it did not author.

Beamhouse **never sends DMX**, so Mizer's 512-slot buffer is Mizer's constraint and not
Beamhouse's. The mapping from a fixture's channels to a universe's slots is a *read* concern.

## Decision

1. **A fixture carries one address per break, not one address.** `address: {universe, slot}`
   becomes `addresses: Map<break, {universe, slot}>`. A fixture *can* span universes. Mizer's
   singular pair is the **degenerate one-break case**, not a special case — the reader fills a
   one-entry table and nothing downstream branches on which patch format it came from.
2. **v1 resolves multi-break fixtures for real, not parse-and-warn.** Each break's slots are read
   from its own universe, and the browser's `subscribe` list is the union of every break's
   universe. The alternative renders a real multi-break MVR visibly wrong.
3. **A fixture is stale if *any* of its breaks' universes is stale.** Staleness is a trust signal,
   and a partly-trusted fixture is worse than an untrusted one. Per-break staleness would render a
   strip as one emissive surface (ADR-0005 §5) with half of it live and half frozen 2.5 s ago,
   with nothing in the image saying which — precisely the silent frozen output `DESIGN.md` §07.4
   calls the worst failure mode, and made *more* convincing by the live half. The rule adds no
   mechanism: union the breaks' universes, and if any is in the bridge's stale set, the fixture is
   stale.
4. **The multi-break path is covered by a synthetic test, not by the rig.** After the
   re-addressing below, no fixture in the only real rig exercises it. The acceptance criterion is a
   two-break fixture built from #26's oracle frames — already a byte-exact offline diff, and
   splitting its 230 pixels across two universes is exactly the shape under test. This is what
   keeps the re-addressing revertible rather than load-bearing.
5. **No new identity tier.** The ticket's third option — a pixel-block between fixture and emitter
   — is rejected. ADR-0003 makes the integer fixture id the *only* identity, and neither patch
   format supplies a key for such a tier.

## Considered options

**One fixture spans universes** (chosen) versus **the patch unit is always small enough not to**
(rejected: falsified by WLED's packing, above) versus **a pixel-block abstraction** (rejected: a
third identity, see 5).

## Consequences

- **The seam #22 predicted did not appear.** The ticket expected the *patch* unit and the *render*
  unit to diverge and require naming in `CONTEXT.md`. They aligned instead: spoke = fixture =
  strip. ADR-0005 §3 already decoupled the two by making the render unit follow the patch unit, and
  that is what happened. Recording the closure matters as much as a name would have.
- **`CONTEXT.md` sharpens two entries.** **Address** was "the first slot a fixture occupies in a
  universe" — singular, now false; it is the first slot a **break** occupies, and a fixture has one
  per break. **Break** said "addressed independently of the fixture's own address", which
  understated it: a break carries its own *universe* too, and that is the whole point.
- **The tent patches as ten fixtures, and it is an Array.** #21's physical finding and ADR-0005's
  collinearity reject-check agree — ten spokes at ten angles fail collinearity, each 23-pixel spoke
  passes. Ten fixtures sharing one node need no "device" tier: `CONTEXT.md`'s **Array** is already
  a placement from count, radius and angle step, which is exactly a ten-spoke radial star.
- **The tent is re-addressed to `DMXAddress 30`, and this is rig configuration, not architecture.**
  It makes `ledsInFirstUniverse` exactly `(512 − 30 + 1) / 3 = 161 = 7 × 23`, so the universe
  boundary lands on a spoke boundary: spokes 0–6 at universe 1 slots 30, 99, 168, 237, 306, 375,
  444 — ending at exactly 512 with no padding — and spokes 7–9 at universe 2 slots 1, 70, 139,
  ending at 207. Every fixture becomes single-break. It is done because a fixture that needlessly
  straddles a boundary half-renders under rule 3, **not** as a substitute for rule 1; decision 4 is
  what stops it silently mattering the day someone resets the node to address 1. Carried out in
  [#23](https://github.com/jnslmk/beamhouse/issues/23).
- **Mizer's `reverse_pixel_order` must not be read.** #21 found the spokes cabled back and forth,
  so odd spokes run pixel 0 at the tip, and the flag looks like the answer. It is not: it only
  reorders sub-fixture *lookup* (`fixture.rs:171`, `fixtures.rev().nth(p)`) and never the slot
  mapping in `write_dmx`, so it changes what the console writes rather than how the wire is laid
  out, and is invisible to a listener. The reversal belongs in the **placement** layer per ADR-0005
  §8 — one outward-spoke definition, reversed spokes placed rotated 180° about their own mid-point
  so pixel 0 lands at the tip on the same ray. The work is #23's.
- **`DESIGN.md` needs amending**: §4.2's patch example and §07's `subscribe` both read as though a
  fixture has one universe.
