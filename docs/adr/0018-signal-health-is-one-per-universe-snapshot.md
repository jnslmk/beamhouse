# ADR-0018: Signal health is one per-universe snapshot, and it belongs to the feed

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#31](https://github.com/jnslmk/beamhouse/issues/31)
- **Amends:** [ADR-0007](0007-one-universe-space-sacn-numbered.md)

## Context

`DESIGN.md` §06 gives the bridge seven jobs. Three of them — dedupe by sequence number, mark a
universe stale after silence, pass through priority and `Preview_Data` — produce **four signals
that nothing in the document consumed**. §07 carried three of them on the wire and they stopped
there. §06 job 4 states the stakes in its own words: *"Silent frozen output is the worst failure
mode, because you debug the console instead of the network."* The bridge prevents the silence;
there was no UI for it to stop being silent in.

#31 was filed as a writing task — "nothing here needs a decision, these are consequences of
decisions already made." Measuring its premises found four that were not.

1. **`Preview_Data` and priority are sACN-only, and the rig's other transport has neither.**
   E1.31 carries a priority octet and a `Preview_Data` options bit; ArtDmx carries no equivalent
   of either. §07's message is even *named* `sacn_source`. §06's own source table records that
   **gled2 has no sACN at all** — it depends on `artnet_protocol` with no E1.31 anywhere in its
   source, which is the fact ADR-0002 rests on. So "a free blind-mode indicator" is free on
   exactly the universes Mizer sends and unavailable on exactly the universes gled2 sends.

2. **The 2.5 s stale threshold is E1.31's number applied to a transport that does not share it.**
   2.5 s is E1.31's network data loss timeout. Art-Net's own specification has an input that is
   **active but not changing re-transmit its last valid ArtDmx at approximately 4-second
   intervals**. A flat 2.5 s therefore marks a *live* gled2 holding a static look as stale. That
   is not a tuning imprecision — it is job 4's failure mode inverted into a false alarm, and a
   false staleness alarm is worse than none, because it teaches the operator to ignore the one
   indicator that matters.

3. **Priority is an arbitration rule being carried as a decoration.** E1.31 priority exists to
   resolve *two sources sending the same universe*. Nothing in `DESIGN.md` merges or arbitrates:
   §06 job 2 is "join those multicast groups; forward each universe's 512 bytes", and the words
   `merge`, `arbitrat`, `HTP` and `LTP` appear nowhere in the document in that sense. So the
   read-out would display "priority 100" beside a universe the renderer is drawing last-writer-wins.

4. **The out-of-order drop count has nowhere to go.** Job 3 computes it and discards it; §07
   defines no field for it.

A fifth thing was not a false premise but an omission: §07 has **three feed implementations** and
§9.2 has a viewer with no bridge at all. Every signal here is a fact about a live network.

## Decision

**1 · The bridge reports signal health as one `universes` snapshot on the control channel.**
It replaces both `stale` and `sacn_source` — one record per subscribed universe, sent on change
and on a slow heartbeat:

```jsonc
{ "op": "universes", "universes": [
  { "universe": 2, "transport": "artnet", "stale": false, "drops": 0,
    "priority": null, "preview": null },
  { "universe": 1, "transport": "sacn",   "stale": false, "drops": 3,
    "priority": 100, "preview": false }
]}
```

A snapshot rather than a set-diff, because the universe read-out *is* this table and renders
straight from it with no client-side state to reconstruct — and because a missed diff on the
`stale` op fails in the direction where everything looks fine.

**2 · `null` means "this transport cannot tell you", and is distinct from a value.** Priority and
preview are `null` on every Art-Net universe, permanently, and the UI must render that as
*unknown* rather than as *not blind*. Absence-versus-unknown is the whole of what job 4 protects.

**3 · The stale threshold is per transport, inside the bridge.** 2.5 s for sACN, per E1.31; ~6 s
for Art-Net — the spec's ~4 s idle re-transmit interval plus margin. Both numbers are the bridge's
alone.

**4 · The transport returns, on the control channel only.** This amends ADR-0007 in reach, not in
principle. ADR-0007 keeps the transport out of the **frame**, so that nothing in the render path
can branch on how a universe arrived — that stands untouched and the binary frame is unchanged.
Diagnostics are not the render path: a read-out that cannot name the transport cannot explain why
one universe has no priority and another has a longer stale threshold. `CONTEXT.md` already calls
the bridge "the only component that knows how a universe arrived"; this makes it the only
component that may *act* on it.

**5 · Priority is reported as observed, not enforced.** Until the bridge decides whether it
arbitrates, the read-out labels priority as what a source *claims*, and a universe with two
sACN sources is shown as **contended**. Deciding the arbitration itself is
[#38](https://github.com/jnslmk/beamhouse/issues/38), not this ADR.

**6 · Signal health is a property of the feed, and is unreachable off a live one.** Not merely
false — absent. `live` has the universe table; `recorded` has a timeline position and no
staleness; `generated` reports "no network"; §9.2's Pages viewer has no bridge to ask. Whole-
fixture staleness must be structurally unavailable on those feeds, because a greyed-out rig is
what every shared link would otherwise look like — including the demo motion mode ADR-0014 put on
the `generated` feed to make shared links look *alive*.

**7 · A fixture is stale if any of its breaks is stale**, unchanged from
[ADR-0011](0011-a-fixture-is-addressed-per-break.md), and renders **wholly** stale. A strip drawn
half live and half frozen is job 4's failure made *more* convincing by the live half.

## Considered options

- **Keep `stale` as a set-diff and add two more ops.** Rejected. Three ops describing one table is
  three chances for the client's reconstruction to drift from the bridge's truth, and the drift is
  invisible in the one direction that matters.
- **Accept the Art-Net blind hole silently.** Rejected. It is indistinguishable on screen from
  "the console is not in blind", which is the assertion the operator would act on.
- **Drop blind indication as unreliable.** Rejected. It is exactly reliable on sACN, which is what
  Mizer sends, and Mizer is the console this pair is built around.
- **One 4 s threshold for both transports.** Rejected. It doubles sACN's detection latency to
  avoid one branch in the only component that already knows the transport.

## Consequences

- **§07 loses two ops and gains one.** `sacn_source` is gone by name as well as by shape — it was
  named for the transport it could describe.
- **ADR-0007 now has a stated boundary rather than an implied one.** "The transport is invisible
  downstream" was doing two jobs: keeping it out of the render path, and keeping it out of
  everything. Only the first was ever argued.
- **§4.4's open list is one shorter.** It recorded "the transport is wanted in the diagnostics and
  is deliberately absent from the §07 frame — if it returns it must return on the control channel"
  as an unsolved thing for [#35](https://github.com/jnslmk/beamhouse/issues/35). It has returned,
  on the control channel, before #35 runs.
- **#35 inherits a signal inventory, not a blank.** What must be visible and what each signal
  means is settled here; where it sits on screen is #35's, and the fog note already reserves state
  chips for it.
- **The bridge gains its second transport-dependent behaviour**, after ADR-0007's `+1`. Both live
  in the same component and both are worth a test.
