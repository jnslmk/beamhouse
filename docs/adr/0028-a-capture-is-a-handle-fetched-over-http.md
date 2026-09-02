# ADR-0028: A capture is a handle fetched over HTTP, and it states the feed it fired against

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#37](https://github.com/jnslmk/beamhouse/issues/37)
- **Amends:** [ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md)

## Context

[ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md) accepted captures **on
the frame socket**, *"JPEG-encoded and size-capped"*, reasoning that they are occasional and that
§06 can report the frame it costs ([#31](https://github.com/jnslmk/beamhouse/issues/31)).
[#37](https://github.com/jnslmk/beamhouse/issues/37) asked what the cap actually is.

Answering it exposed the transport. **§07 is one socket** — *"text frames for control, binary for
data"* — so a capture does not share a wire with the DMX stream, it **blocks** it. And the drop it
induces is, in §13's read-out, indistinguishable from a real feed problem: ADR-0018's `drops`
counter is job 3's out-of-order count and does not know who caused it. The visualiser would be
manufacturing the diagnostic it displays.

The bridge already serves the app over `http://localhost` (§9.4,
[ADR-0009](0009-deployment-is-inferred-from-origin.md)), so the alternative needs no new surface.

A second problem is not about size at all. **Beamhouse never sends DMX**, so a fixture can be
mid-chase (ADR-0024). Two captures of an unchanged scene can differ completely, and an agent
diffing them is measuring chase phase rather than its own edit.

## Decision

**A `capture` returns a handle. The MCP server fetches the bytes over the bridge's existing HTTP
server, and the reply states the size, the dimensions and the feed.**

1. **No bulk on the DMX socket.** `capture` replies with an id; the MCP server `GET`s
   `http://localhost:7070/capture/<id>` and hands the bytes to the agent as an MCP image block.
2. **The defaults cannot exceed the cap.** `maxEdge` defaults to **1280** and quality to **0.8**;
   the page downscales before encoding. The hard cap is **1 MB** encoded.
3. **The reply says what you got** — actual dimensions, encoded size, and whether it downscaled.
4. **Exceeding the cap is an error naming the size**, never a truncated image.
5. **Every capture is stamped with the feed it fired against** — `live`, `recorded` or
   `generated`.

## Considered options

- **Keep it on the frame socket** (ADR-0015 as written). Its argument was that §06 can report the
  dropped frame. That is true and it is the problem: the report would be indistinguishable from a
  real fault.
- **A second WebSocket.** Solves the blocking and adds a socket, a lifecycle and a second thing
  §9.4 has to have a rule about, to move bytes that HTTP already moves.
- **Base64 on the control channel.** Same socket, ~37% larger.
- **Making `capture` imply a hold.** Rejected in favour of the stamp: an agent that wants
  determinism should say so (`hold`, or a `look`), and one that does not should still be told
  which it got. Implying it would silently change what the human is looking at.

## Consequences

- **ADR-0006's ignorance is untouched.** The bridge buffers opaque bytes under an opaque key,
  which is what it already does with slot bytes and request envelopes. It gains a route, not a
  concept.
- **§13 never has to explain a self-inflicted drop.** The `drops` counter keeps meaning one thing.
- **ADR-0015's `preserveDrawingBuffer` consequence still holds** — capture stays command-driven
  and reads back inside one `requestAnimationFrame`, so no per-frame tax is paid by users who
  never ask for a screenshot.
- **The stamp is ADR-0018's `null` rule applied to images**: *unknown is not the same claim as
  false*. A capture stamped `live` is one instant of a chase and must not be diffed; one stamped
  `generated` is reproducible. Without the stamp an agent cannot tell, and would draw conclusions
  from the difference between two chase phases — a failure that looks exactly like a successful
  measurement.
- **The handle has a lifetime.** A capture id is single-fetch and expires; the bridge holds one
  small buffer, not a gallery.
