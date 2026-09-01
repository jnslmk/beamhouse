# ADR-0007: One universe space, sACN-numbered

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** [#10](https://github.com/jnslmk/beamhouse/issues/10)

## Context

[ADR-0002](0002-bridge-speaks-both-sacn-and-artnet.md) made the bridge receive both sACN and
Art-Net simultaneously — Mizer streaming sACN, gled2 streaming Art-Net — and assumed away the
consequence. **The two protocols do not share an address space.**

- **sACN** universes are a flat **1–63999**, one-based.
- **Art-Net** addresses a 15-bit **Port-Address** as Net(7) : Sub-Net(4) : Universe(4), range
  **0–32767**, **zero**-based. Confirmed from `dmxnet`'s source: `net ≤ 127`, `subnet ≤ 15`,
  `universe ≤ 15`, `subuni = (subnet << 4) | universe`.

§07's frame format carries a bare `u16 universe` and **no transport field**, and the browser's
`subscribe` message names bare integers. So "universe 1" is ambiguous: sACN universe 1, or
Art-Net Port-Address 1 — which is the *second* Art-Net universe, since Art-Net counts from 0.

Because ADR-0002 has both transports arriving at once, this collision is the normal case rather
than an edge case. Its failure mode is silent and looks like a rig problem, not a network one:
fixtures resolve one universe out and the operator debugs the console.

## Decision

**There is one universe space, and it is sACN-numbered.**

An Art-Net Port-Address *p* is presented on the wire and in the UI as universe ***p* + 1**.

- §07's frame format is unchanged — one `u16 universe`, still no transport field.
- **The mapping lives in the bridge**, which is the only component that knows a packet's
  transport. Nothing downstream of the bridge — `feed.ts`, `resolve.ts`, the scene, the UI — can
  tell or needs to tell how a universe arrived.
- Where a universe number is shown to a human, it is this number.

### Alternatives rejected

- **Offset Art-Net into a disjoint high range.** Keeps the spaces provably separate, but invents
  numbers that appear nowhere in Mizer, gled2 or on any fixture, so every lookup becomes
  arithmetic.
- **Add a transport field to §07.** Solves it honestly, but reopens the frame format to carry a
  distinction the rest of the system is deliberately built not to have, and pushes the merge from
  the bridge — where the knowledge is — out into the browser.

## Consequences

- The common rig reads the way an operator already thinks: gled2's "Art-Net universe 0" is
  Beamhouse's "universe 1".
- Art-Net Port-Address 32767 maps to universe 32768, inside sACN's 1–63999 range, so the mapping
  is total and collision-free by construction — the two sources are expected to use distinct
  numbers, exactly as they must on a single console today.
- The `+1` is the kind of off-by-one that ships silently. The bridge must apply it in exactly one
  place, and that place is worth a test.
- **Universe** and **Port-Address** are pinned in `CONTEXT.md` so the ambiguity cannot re-enter
  through vocabulary.
