# ADR-0027: Ownership is claimed implicitly and released on silence, and a non-owner follows along with its auto-save off

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#37](https://github.com/jnslmk/beamhouse/issues/37)
- **Amends:** [ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md)

## Context

[ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md) point 4 fixed **that**
exactly one connected client owns the scene, and deliberately left *how* open. It also left open
what a non-owner does when the scene moves under it, and sent that to the UI work.

**The first thing to establish is how rarely this bites.** The MCP server is a client of the
*control channel*; the owning **page** applies the requests. So a lone browser tab plus an agent
has no contention at all — the agent's commands go to the human's page, and the human watches
them land. Ownership is contended between **pages**, and only §09's *"LAN too"* produces a second
one.

The trap ADR-0015 named is not the following. §4.6 auto-saves working state to **each browser's
own IndexedDB**, so a non-owner that follows along *and keeps saving* is the silent divergence the
single-owner rule exists to prevent, arriving by the other door: two machines, two `.bhs` files,
seconds apart, neither wrong on its face.

## Decision

**First connection owns implicitly. Any other client may take over explicitly. Ownership releases
on socket close, or on ~15 s of silence. A non-owner adopts the owner's scene, follows its
commands, and does not auto-save.**

1. **Claim is implicit**: the first client to connect with no owner present becomes the owner.
2. **Takeover is explicit and one click**, behind a confirmation naming who currently holds it.
   There is no queue.
3. **Release** is immediate on socket close, and after ~15 s of no liveness ping otherwise.
4. **A woken page never silently resumes ownership.** It returns as a non-owner and must re-claim.
5. **A non-owner adopts the owner's scene** — a snapshot sent on the control channel — renders it,
   and applies subsequent commands. **Its auto-save is suspended for as long as it is a
   non-owner**, and its own working state stays in IndexedDB untouched.
6. Ownership is shown in the chrome, beside [ADR-0023](0023-the-chip-bar-is-the-navigation.md)'s
   viewer indication.

## Considered options

- **Explicit claim for everyone.** Rejected on the single-tab case, which is every case on the
  bench: it puts a ceremony in front of the app §01 wants opened fifty times a night.
- **A queue, or a lease with a renewal.** Rejected as machinery for an adversarial conflict that
  does not exist. The realistic conflict is *"I opened it on the laptop too"*.
- **Socket close as the only release.** Rejected: a slept laptop then holds the rig with no way to
  take it back except closing a lid you are not near. The 15 s figure is short enough to be usable
  and long enough to survive a Wi-Fi blip, and the cost of getting it wrong is bounded by takeover
  being one click.
- **"Nothing — refresh to see it"** for a non-owner. Rejected: a LAN tablet showing a rig that
  quietly stopped matching the room is the same false-confidence failure
  [ADR-0025](0025-trust-and-provenance-marks-are-additive.md) spent a whole ADR on.
- **Full sync including IndexedDB.** This is the divergence, not the cure.

## Consequences

- **The divergence is switched off at its source.** ADR-0015 read the hazard as *following*; it is
  the *saving*. Turning off the auto-save lets a non-owner follow along freely, which is the
  useful half.
- **Following is cheap because of [ADR-0016](0016-every-scene-mutation-is-one-undo-grained-command.md).**
  Commands are undo-grained, so replaying them lands on identical state — that ADR's own
  consequence, *"Q11's non-owning clients get a clean unit to observe"*, cashed in.
- **The control channel gains a scene snapshot message.** It is the same shape a share link
  carries ([ADR-0021](0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)'s inline
  `snapshot` patch variant, plus the override layer), so it is not a new serialisation.
- **A loopback agent may drive a scene owned by a LAN page.** Accepted: ADR-0015's loopback rule
  is about who may *send*, and the machine running the bridge is the trusted one.
- **None of this exists in the viewer deployments.** No bridge, no control channel, no ownership —
  ADR-0009 gates it structurally, as ADR-0015 already observed.
