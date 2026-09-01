# ADR-0006: The bridge is TypeScript on Bun

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** [#10](https://github.com/jnslmk/beamhouse/issues/10)

## Context

`DESIGN.md` §11.4 framed the bridge language as a taste call — "Rust gives a single static
binary worth handing to someone; Node keeps one toolchain with the browser app" — on the
premise that at ~150 lines it genuinely does not matter. Two later decisions falsified the
premise.

[ADR-0002](0002-bridge-speaks-both-sacn-and-artnet.md) made the bridge receive **both** sACN and
Art-Net, so the library burden is no longer symmetric. And the job list kept in scope (§06 job 6,
§4.2, §4.6) has the bridge also serving the static app and watching `shows/` and Mizer's project
YAML. Two transports, a universe-space merge, dynamic subscription, sequence dedupe, stale
detection, priority and preview passthrough, a WebSocket server, static serving and file
watching is not 150 lines.

[ADR-0004](0004-gdtf-ts-is-a-published-gdtf-only-package.md) had meanwhile committed the repo to
**bun** workspaces with an isolated linker. That makes "Node" a strawman: the TS option in this
repo is Bun, which the ticket did not consider.

### What was measured

All of the following was measured on Linux against the real packages, not recalled.

| Claim | Result |
| --- | --- |
| Rust `sacn` 0.11.1 + `artnet_protocol` 0.4.4 | compile clean on rustc 1.94.1; 426 KB release binary |
| Rust `sacn` maintenance | dormant 2018–2025; revived Apr 2025, five releases to 0.11.1 (Jan 2026) |
| Rust `sacn` completeness | `listen_universes`/`mute_universe`, `set_announce_timeout`, `set_process_preview_data`, priority merge fns; `DMXData` carries `priority`, `src_cid`, `preview`. Sync/blocking `recv()`, no async |
| `sacn` npm 4.6.2 (Apache-2.0) | `addUniverse`/`removeUniverse` work on **both** Node 22 and Bun; per-CID sequence dedupe; `priority`; zero-copy `payloadAsBuffer`; `Preview_Data` bit decode is an upstream TODO over a raw `options` byte |
| Node/Bun Art-Net **receive** libraries | none usable. `dmxnet` 0.9.0 is 3½ years stale and calls `ArtPollReply()` on every `newReceiver()`, announcing the host as an Art-Net node with input/output ports. `artnet-protocol` npm is 0.2.1 (2021); `artnet` npm is send-only (2018) |
| Bun UDP | native `addMembership`/`dropMembership`/`addSourceSpecificMembership`; `node:dgram` compat works, so `sacn` npm runs unmodified |
| 20 s soak, 4 universes at 30 Hz, sACN multicast | Bun 1.3.11: 554 frames/universe, **0** sequence gaps, 0 corrupt. Node 22.22.2: 557, **0**, 0. Indistinguishable |
| Hand-rolled ArtDmx on native `Bun.udpSocket` | parser *and* builder in **25 non-comment lines**; 295/295 frames, 0 rejects, 0 gaps, `reuseAddr` on 6454 |
| `bun build --compile` | single binary, 95 MB (against Rust's 426 KB) |

Two framing errors in the ticket are worth recording. **Art-Net has no multicast** — it is
broadcast or unicast on 6454 — so "confirm both ecosystems do dynamic multicast join/leave
cleanly" is a sACN-only question, and it is discharged first-class on both sides. And **"a single
static binary worth handing to someone"** is not a requirement at all: §09's sharing story is the
bridgeless static bundle, the target is one Linux box, and both candidates can emit one binary
anyway.

## Decision

**The bridge is TypeScript running on Bun**, as a workspace package alongside `packages/gdtf-ts/`.

- **sACN intake** uses `sacn` npm 4.6.2.
- **Art-Net intake** is hand-rolled ArtDmx receive on `Bun.udpSocket`. This is deliberate, not a
  concession: it is 25 lines, and it gives a **passive listener that never announces itself**,
  which is what §01's "never sends DMX" requires and what `dmxnet` gets wrong.
- **WebSocket, static serving and file watching** use `Bun.serve` and `fs.watch`, no dependencies.
- **No Node-portability constraint.** Bun-native APIs are used freely.

### Why not Rust

Rust's real advantage survived scrutiny but shrank to one item: the `sacn` crate is a complete
E1.31 receiver where `sacn` npm is closer to a socket, so §06's jobs 4 and 5 are library features
there and roughly sixty lines of stale-detection and bit-twiddling here. Everything else priced
out. The `artnet_protocol` advantage is worth 25 lines. The binary-size advantage is worth
nothing given the sharing story. gled2 code-sharing is speculative and points the wrong way,
since ADR-0002's preferred mitigation removes Art-Net from gled2 rather than creating something
to share.

Against that, Rust costs a second toolchain in a repo that standardised on one nine months of
decisions ago, and its `sacn` crate is sync-blocking with no async — so the WebSocket server it
must feed needs a thread and a channel, which is the awkward seam of the whole program, with
axum, tokio-tungstenite and notify stacked on top of it.

### The ignorance barrier

§02 says the bridge "knows nothing about fixtures, GDTF, or the scene, and that ignorance is the
design". In Rust that is enforced by physics; in Bun it is one `import` away.

**This is answered the way ADR-0004 already answered it for `gdtf-ts`: with the toolchain, not the
language.** The bridge is a workspace package under the isolated linker with no dependency on the
app or on `gdtf-ts`, so a stray import fails at the toolchain rather than in review. The one
permitted shared surface is the §07 frame codec, so bridge and `feed.ts` cannot drift.

## Consequences

- `DESIGN.md` §03's `bridge/src/main.rs` becomes `bridge/` as a bun workspace package.
- §12's three bridge dependency rows are settled: `sacn` npm 4.6.2 in, both crates out.
- The bridge gets Vite-adjacent iteration speed rather than recompile-and-restart, which suits
  §4.6's "never reload the socket" instinct.
- **Accepted risk, and its mitigation.** Bun's UDP stack is young and this decision keeps no Node
  fallback. The 20-second soak above is evidence against a gross defect, not against a regression
  four hours into a show. The spec must therefore carry an acceptance criterion: **a
  full-show-length soak against real simultaneous Mizer and gled2 traffic, counting sequence gaps,
  before the bridge is trusted on a show.** If Bun's UDP ever does regress, the escape hatch is
  that `sacn` npm rides `node:dgram`, so the intake — and only the intake — can be moved to Node.
- Art-Net hardening is now owned code: ArtSync, ignoring ArtPoll, and rejecting malformed packets
  from an untrusted broadcast socket.
