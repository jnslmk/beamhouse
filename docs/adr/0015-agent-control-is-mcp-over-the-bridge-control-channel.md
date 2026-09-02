# ADR-0015: Agent control is an MCP server over the bridge's control channel, and the bridge stays a pipe

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#5](https://github.com/jnslmk/beamhouse/issues/5)

## Context

[ADR-0014](0014-the-agent-surface-is-two-surfaces.md) split the agent surface in two and sent the
**scene** half here. The requirement is an agent that arranges the rig in 3D — *"look at the 10
WLED star and configure it in 3D in Beamhouse without reloading a file"* — incrementally, against
a running page.

**Files are ruled out, and not for the obvious reason.** §4.6's watcher already avoids the crude
failure: *"rig changes rebuild the scene graph in place. Never reload the socket."* What rules
files out is semantics, not latency. A `.bhs` is a **whole-document write**, so a file-based agent
must read-modify-write the entire scene to move one fixture — against IndexedDB working state it
never saw. That is the same lossy round-trip `docs/agents/issue-tracker.md` documents for the
wayfinder map itself.

**The constraint that shaped everything else** is `CONTEXT.md` on **Bridge**: *"It knows nothing
about fixtures, definitions or the scene — that ignorance is the design, and it is enforced by the
toolchain rather than by language"* ([ADR-0006](0006-bridge-is-typescript-on-bun.md)). §03 permits
it exactly one shared surface, the §07 frame codec. §4.6's existing control message,
`{"op": "reload", "path": "…"}`, names a **path**, never a fixture.

## Decision

**The agent reaches Beamhouse through an MCP server that speaks the bridge's control channel. The
bridge forwards command envelopes it never opens.**

1. **Transport is the bridge control channel**, not a `window` API driven by CDP.
2. **The bridge is a pipe, not an endpoint.** It forwards opaque command envelopes exactly as it
   forwards opaque slot bytes. ADR-0006's ignorance is intact; validation lives next to the scene
   that validates it, which the browser must do anyway since a malformed command has to fail there
   regardless.
3. **The MCP server is a separate process**, holding every tool schema, connecting to the control
   channel as one more client. The chain is: agent → MCP server (stdio) → bridge control channel
   (opaque) → owning page → scene. A bridge exposing a `place_fixture` schema would be a bridge
   that knows what a fixture is, which is point 2 reversed.
4. **Exactly one connected client owns the scene** at a time and applies commands.
5. **Commands are accepted from loopback only.**
6. **Capture is a first-class command.** The owning page renders and reads back within one
   `requestAnimationFrame` tick and returns an image, which MCP carries as an image content block.
7. **Scope is Beamhouse only.** A Mizer MCP server is a separate effort; the agent spans the two.

## Considered options

- **A `window` API driven by CDP.** Recommended during grilling and not taken. Its real advantages
  were that it keeps the bridge ignorant *for free* and reaches all three deployments. Both
  survive here anyway — point 2 keeps the ignorance, and the deployments it reaches are the ones
  with a bridge, which is the correct set. Its cost was that the agent must run a browser; MCP
  removes that.
- **The bridge as the MCP server.** Fewer processes, and it ends ADR-0006.
- **Broadcast commands to every client.** §09 serves the bridge deployment on `localhost:7070`
  — **"LAN too"** — and §4.6 auto-saves to *each browser's own* IndexedDB, so a broadcast diverges
  silently, each client saving a different `.bhs` seconds later. Silent divergence is the failure
  class this map keeps ruling against.
- **Shared scene state in the bridge.** Fixes divergence properly and makes the bridge the scene's
  home, dragging ADR-0006 down with it.
- **Beamhouse writing into Mizer.** Rejected: Mizer owns control, and §4.2 + M5a already make
  Beamhouse follow Mizer's project file without being told.

## Consequences

- **No new trust gate is needed for the viewer deployments.** Pages and single-file have no
  bridge, so the agent surface is unreachable there by construction — the inverse of the
  **Viewer** glossary entry's *"capabilities ship in every build and are merely unreachable."*
  [ADR-0009](0009-deployment-is-inferred-from-origin.md) does the gating.
- **§9.4's rule now has a direction.** *"Never expose the bridge's WebSocket unauthenticated"* was
  written when the socket only pushed frames out. It now accepts writes, and read and write have
  earned different rules: frames may cross a tunnel, commands may not. LAN clients still view;
  they cannot own or command.
- **The frame socket carries its first bulk payload.** A capture is megabytes on a wire delivering
  30 Hz DMX. Accepted, JPEG-encoded and size-capped: captures are agent-driven and occasional, and
  §06 already has the machinery to notice and report a dropped frame
  ([#31](https://github.com/jnslmk/beamhouse/issues/31)).
- **`preserveDrawingBuffer` is not needed.** Because capture is command-driven rather than
  ambient, there is no per-frame cost paid by every user for a feature only agents use.
- **A relay returns.** ADR-0009 deleted `relay` from `feed.ts` for never having been defined; the
  bridge is now a relay on the **control channel**, running the other direction.
- **What a non-owning client does when the scene moves under it is left open**, and belongs with
  the UI work ([#35](https://github.com/jnslmk/beamhouse/issues/35)).
