# ADR-0002: The bridge speaks both sACN and Art-Net

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** [#4](https://github.com/jnslmk/beamhouse/issues/4)

## Context

`DESIGN.md` §06 originally defaulted to sACN and presented it as forced rather than chosen:
"Art-Net is UDP 6454 and only one process per host can bind it." Two findings dismantled that.

**The port claim is false on the target platform.** Measured on Linux: three sockets bound to
`0.0.0.0:6454` with `SO_REUSEADDR` + `SO_REUSEPORT` all received the same broadcast Art-Net
frame, both to the subnet broadcast address and to `255.255.255.255`. Mizer does not contend for
the port in any case — its Art-Net output binds `("0.0.0.0", 0)` and only sends to 6454.

**gled2 cannot speak sACN.** It depends on `artnet_protocol` and the Enttec USB DMX driver, with
no E1.31 support anywhere in its source. The requirement is that **gled2 and Mizer stream to
Beamhouse simultaneously**, so sACN-only is not an option.

Both field devices are protocol-agnostic: the CueCore2 does "Art-Net & sACN (in and out)" and
WLED supports E1.31.

## Decision

**The bridge receives both sACN and Art-Net.**

- **Art-Net is mandatory**, because gled2 has no alternative.
- **sACN is preferred wherever a source supports it.** Multicast means any number of receivers
  with no start-order ritual, and group join/leave maps directly onto the `subscribe` message in
  §07. Mizer should move to sACN.
- Putting the two sources on different ports with different semantics means they never contend.

### The residual port conflict

gled2 binds `("0.0.0.0", 6454)` *without* reuse options — its source comments that the input
"actually needs to own 6454" — falling back to an ephemeral port if the bind fails. It shares one
socket for input and output.

So the conflict arises **only when gled2's Art-Net input is in use**. As a pure source, 6454
stays free and the bridge can bind it. Mitigations, preferred first:

1. **Add sACN output to gled2.** Removes the contention rather than working around it. External
   to this repo; the user has indicated willingness.
2. **Set `SO_REUSEADDR`/`SO_REUSEPORT` on gled2's socket.** Two lines. Requires the gled2-side
   change regardless, since every socket sharing a port must set them.
3. **Send gled2's Art-Net to a non-standard port** — its output destination is a configurable
   `SocketAddr`. No gled2 change, but a non-standard setup.

## Consequences

- The bridge grows a second receive path, against §02's promise that it is ~150 lines written
  once. Accepted: sACN receive is a crate call, and the Art-Net path is unavoidable.
- **This changes the input to [#10](https://github.com/jnslmk/beamhouse/issues/10)** (bridge
  language). Both protocols are needed, so the choice now turns on which ecosystem covers both
  well — Rust has `sacn` and `artnet_protocol`; Node's coverage of both should be checked rather
  than assumed.
- The `subscribe` protocol in §07 must carry which transport a universe arrives on, or the bridge
  must merge both into one universe space. Merging is likely simpler and matches §07's existing
  frame format, which has no transport field.
- **Unicast Art-Net remains invisible to the bridge** — this is a transport property, not a port
  one. The existing rig unicasts to a WLED tent at `192.168.8.243`; a passive listener on another
  host cannot see that stream at all. Anything to be visualised must be broadcast or multicast.
