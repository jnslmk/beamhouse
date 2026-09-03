# ADR-0029: The bridge detects contention and never arbitrates, and the universe record becomes source-shaped

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#38](https://github.com/jnslmk/beamhouse/issues/38)
- **Amends:** [ADR-0007](0007-one-universe-space-sacn-numbered.md), [ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md)

## Context

[ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md) put a priority number on screen and
labelled it **observed, not enforced**, deliberately leaving the behaviour underneath undecided.
#38 asked for that behaviour. Six measurements answered a different and larger question.

**1 · The reference rig has no sACN in it at all.** `mizer-shows/OBF26_Bunte-Stube.yml`'s
`connections:` are two entries, both `type: artnet` — a broadcast to `192.168.8.255` and a unicast
to `192.168.8.243`. §06's prose "Mizer streaming sACN" and this repo's repeated "free on exactly
the universes Mizer sends" describe a **capability Mizer has**, not the configuration this rig
runs. Priority and `Preview_Data` are therefore `null` on **every** universe today, and the
two-sACN-source case #38 was chartered to decide cannot arise on this rig at all.

**2 · [ADR-0007](0007-one-universe-space-sacn-numbered.md)'s "collision-free by construction" is
not true.** Art-Net Port-Address *p* maps to universe *p* + 1, which lands inside sACN's
1–63999, so the mapped Art-Net range and the native sACN range **fully overlap**. That ADR's own
consequence bullet concedes it in the same sentence — "the two sources are expected to use
distinct numbers" is an assumption, not a construction. Mizer's Art-Net Port-Address 0 is
Beamhouse universe 1, which is also sACN universe 1. The contention that matters here is
**cross-transport**, and #38 never raised it: it assumed contention meant two sACN sources.

**3 · The `contended` flag ADR-0018 promised has nowhere to live.** §13.2 says a two-source
universe "is flagged **contended**", but §07's record is
`{universe, transport, stale, drops, priority, preview}` — no source count, no CID. The display
shipped without the field behind it.

**4 · `sacn` npm 4.6.2 already ships an arbitrator, and it is unusable.** `MergingReceiver`
implements HTP and LTP. It is marked `@deprecated CAUTION: This feature is experimental, and has
not been thoroughly tested. It may not behave correctly. There is no guarantee that it adheres to
the E1.33 standard` — naming the wrong standard, E1.33 rather than E1.31. And it is **silently
broken for every universe ≥ 10**: `prepareData` keys its state by
`parseInt(packet.universe.toString(36), 10)`. Measured on node — `10 → NaN`, `35 → NaN`,
`36 → 10`, `100 → 2`. `HTP` then filters `packet.universe === data.universe`, so a universe ≥ 10
merges to an all-zero payload and universe 100 shares a state bucket with universe 2. It also
emits a sparse object keyed 1..512 rather than the 512-byte buffer the bridge forwards.

**5 · Detection, unlike merging, is nearly free.** The plain `Receiver` emits every packet with
`.cid`, `.priority` and `.sourceName`, and it already keys sequence tracking on
`(cid, universe)` — so multiple sources do not false-trigger §06 job 3. A
`Map<universe, Map<source, …>>` is the whole of detection, and the bridge already ages universes
for staleness.

**6 · Two more orphans in the same options byte.** `Packet.options` is exposed raw and the package
carries a TODO: it does **not** decode `Preview_Data`, so §06 job 5 is bridge work
(`options & 0x80`), not library work. Bit 6 is `Stream_Terminated` — E1.31's graceful
"I am releasing this universe" — and `DESIGN.md` consumes it nowhere.

## Decision

**1 · The bridge detects contention and never arbitrates.** It forwards every source; the frame
stays last-writer-wins; nothing merges, and nothing picks a winner.

Four reasons, in order of weight:

- **Beamhouse never sends DMX.** It is the preparation visualiser, and its claim is *this is what
  the network is doing*. A bridge that silently resolves contention hides the exact fault the
  operator needs to see — §06 job 4's own argument, *"you debug the console instead of the
  network"*, applied one level up.
- **Arbitration would make Beamhouse disagree with the stage.** Real fixtures each run their own
  merge. A visualiser that picks a winner renders a fiction no fixture sees, which is worse than
  rendering a mess every fixture sees.
- **It is the only behaviour that generalises across both transports.** ArtDmx carries no priority
  field, so two Art-Net sources on one Port-Address are unarbitrable by any rule the packet
  supplies — and per fact 1 this rig is entirely Art-Net.
- **The one available implementation is deprecated and silently wrong above universe 9** (fact 4).

**2 · Contention is a property of the merged universe number, across transports.** Detection keys
on the post-`+1` number and counts sources regardless of how they arrived. This **amends
ADR-0007**: "collision-free by construction" holds *within* Art-Net and is false across the merged
space. The honest statement is that the space is **shared**, and collisions are **detected, not
prevented**.

**3 · The `universes` record becomes source-shaped.** `priority`, `preview`, `transport` and
`drops` move from the universe onto a `sources[]` array. This **amends ADR-0018**, whose flat
record was coherent only while every universe had exactly one source:

```jsonc
{ "op": "universes", "universes": [
  { "universe": 1, "stale": false, "sources": [
      { "id": "…cid…",        "name": "Mizer", "transport": "sacn",   "priority": 100,  "preview": false, "drops": 3, "stale": false },
      { "id": "192.168.8.31", "name": null,    "transport": "artnet", "priority": null, "preview": null,  "drops": 0, "stale": false }
  ]}
], "terminations": []}
```

- `contended` stays **derived** (`sources.length > 1`), never carried. ADR-0018 chose a snapshot
  precisely so the client reconstructs nothing; a carried boolean is a second chance to disagree
  with the array beside it.
- **Source identity within a universe is the CID on sACN and the source IP on Art-Net**, which is
  the only identity ArtDmx supplies. A single source sending several Port-Addresses is one source
  appearing in several universe records.
- `null` keeps ADR-0018's meaning — *this transport cannot tell you* — and is now `null` per
  source rather than per universe, which is what makes a mixed-transport universe describable.
- **[implemented 2026-09-03 — #59]** `stale` is also exposed per source. The universe value
  remains the `all` rollup, while the source value makes the transport-specific threshold that
  fired observable instead of hiding one dead source behind another live one.

**4 · The stale threshold is per source; a universe is stale only when every source is stale.**
Each source ages on its own transport's clock — 2.5 s sACN, ~6 s Art-Net — which is what
ADR-0018 §3 argued for and could not express. The rollup is **all**, not any: a contended universe
where one console falls silent still has live data arriving, and marking it stale would say *do
not believe this* about a picture that is currently correct.

This is deliberately the **opposite** rollup from [ADR-0011](0011-a-fixture-is-addressed-per-break.md)
and §13.3's fixture rule, where **any** stale break makes the fixture stale. The asymmetry is the
point: breaks are **disjoint slices** of one fixture, so a silent break is *missing data*; sources
are **redundant claims** on the same slots, so a silent source is *one fewer claim*.

**5 · The bridge consumes `Stream_Terminated` (options bit 6).** It is the difference between *a
source left* and *a source died*. Without it, a console releasing a universe is indistinguishable
from a network failure for a full 2.5 s, and a source departing a contended universe keeps that
universe flagged for the whole timeout after it is gone. It costs one mask on a byte the bridge
must already decode for `Preview_Data` (fact 6).

**[implemented 2026-09-03 — #59]** The source is removed immediately, and the snapshot retains a
short-lived `terminations[]` observation with its identity and termination time. This keeps
contention derived solely from the active `sources[]` while making a graceful release observable
rather than indistinguishable from a source that was never present.

**6 · A contended universe renders as a trust mark, not as a fault or a freeze.** The flicker is
drawn — it is true data — and **every fixture on that universe is marked untrusted**, reusing
§13.3's staleness vocabulary and [ADR-0025](0025-trust-and-provenance-marks-are-additive.md)'s
additive marks rather than inventing a second notation. Flicker alone is **not diagnostic**: a
strobe chase, a three-source conflict and a failing switch all look identical at the fixture. The
distinction the screen must preserve is **stale means *this is old*, contended means *this is
disputed***.

**7 · One packet makes a universe contended. There is no debounce.** A stray packet on a patched
universe is precisely the fault worth naming, and a threshold hides the intermittent case — the
hardest one to catch. §13.2's **Arriving** column carries the discrimination instead: a source at
0.03 Hz reads visibly differently from one at 44 Hz. Detection is immediate; **judgement is the
operator's**, which is the posture the whole of decision 1 rests on.

**8 · The bridge owns sequence tracking; `sacn` npm stays for parsing and multicast only.** The
library detects out-of-order packets and **throws before emitting**, so the bridge never sees the
packet — only a bare `Error` whose universe and source name exist inside its message string.
Per-source `drops` would be a regex on English prose, which breaks on a patch release and fails
silently in the direction where the read-out looks fine. The bridge already owns per-source
bookkeeping (decision 3), the options byte (decision 5) and per-source ageing (decision 4);
sequence tracking is the fourth thing in the same map.

The rule itself, per source and per transport:

- **sACN** — E1.31's own rule: discard when the signed difference (new − last) falls in
  **−20..0 inclusive**. This tolerates wrap while admitting a genuine restart, and is both tighter
  and better-motivated than the library's `Math.abs(last − seq) > 20`, which lets a single-frame
  reorder through.
- **Art-Net** — ArtDmx sequence is 1–255, with **0 meaning sequencing is disabled**. A bridge
  applying any numeric rule to a 0 discards every frame from a node that opted out, which is job
  4's silent failure with a new cause. The Art-Net path branches on 0.

This does **not** reopen [ADR-0006](0006-bridge-is-typescript-on-bun.md). The package keeps
earning its place on E1.31 packet parsing and multicast group management, which is the tedious and
correct part. Fact 4 makes the general point: this library's value is its **parser**, and the
stateful things built on top of it — `MergingReceiver`, out-of-order handling — are either broken
or unusable at the boundary.

**9 · Mizer moves to sACN, as a rig task that does not block this decision.** It buys three things
at once: priority and `Preview_Data` become real rather than permanently `null`; multicast
replaces one broadcast plus one hand-configured unicast destination; and Mizer's universes leave
the shared Art-Net Port-Address space, removing the decision-2 collision at its source rather than
detecting it. **Beamhouse universe numbers do not change** — Art-Net Port-Address 0 → universe 1
and sACN universe 1 → universe 1 are the same number — so the patch, §13's read-out and the
STAR-TENT's universes are untouched. The move is invisible above the bridge, which is ADR-0007
doing exactly the job it was written for. Tracked as
[#44](https://github.com/jnslmk/beamhouse/issues/44); it touches live hardware (the CueCore2 at
`.146` and the WLED STAR-TENT at `.243` must both be switched to E1.31) in another repo.

## Considered options

- **Arbitrate on sACN, forward on Art-Net.** Rejected. It makes the picture's truthfulness depend
  on which transport a source happened to choose, and this rig's answer to that is currently
  "Art-Net, all of it" — so the arbitration would be dead code on the only rig that exists.
- **Adopt `MergingReceiver`.** Rejected twice over: by decision 1 on principle, and by fact 4 on
  correctness. It is worth recording that the free-looking option was also the broken one.
- **Per-slot E1.31 merging, hand-written.** Ruled **out of scope**, not deferred — see below.
- **Add a scalar `contended: bool` and leave the record flat.** Rejected. It flags the condition
  while discarding the only information that resolves it: a contended universe has two priorities,
  and a cross-transport one has two transports, neither of which a scalar can state.
- **Freeze or blank a contended universe.** Rejected. It discards true data and re-creates §06 job
  4's silent-frozen-output failure by hand.
- **Debounce contention over N packets.** Rejected. It hides the intermittent source, which is the
  case an operator would otherwise chase for an hour.

## Out of scope

**Per-slot sACN merging (HTP/LTP) is out of scope, not deferred.** Decision 1's ground — Beamhouse
renders what the network carries and never picks a winner — is not a "not yet", so this does not
graduate as the frontier advances. It returns only if the destination is redrawn.

## Consequences

- **§07's `universes` record changes shape**, four fields moving from the universe to the source.
  This is the second revision of a message ADR-0018 introduced the same day, and both revisions had
  the same cause: a scalar standing in for something plural.
- **ADR-0007 loses a claim it should not have made.** "Collision-free by construction" is replaced
  by a stated overlap and a detection rule. The `+1` itself is untouched and still lives in exactly
  one place.
- **ADR-0018's per-transport stale threshold becomes per-source**, and gains the rollup rule it was
  missing for a universe fed by two transports.
- **§13.2's Priority column label is now permanent, not provisional.** ADR-0018 wrote "if
  arbitration is adopted, this column's label changes with it". It has not been adopted, and will
  not be: **observed, not enforced** is the final wording.
- **§13 gains a contention mark** in ADR-0025's additive vocabulary, and §13.3's *do not believe
  this* framing now covers two distinct claims that must read differently.
- **The bridge's transport-dependent behaviours reach four** — ADR-0007's `+1`, ADR-0018's stale
  threshold, and now source identity (CID versus source IP) and the sequence rule (E1.31's window
  versus Art-Net's 0-means-disabled). All four live in the same component and all four are worth a
  test.
- **`Stream_Terminated` and the options byte are now bridge-owned**, because the library decodes
  neither.
- **§06's source table describes capabilities, and the rig's actual configuration is now stated
  separately.** The two were conflated, and every downstream claim about where priority is "free"
  inherited the confusion.
