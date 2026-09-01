# Prototype: hand-rolled ArtDmx receive

Throwaway spike for [#10](https://github.com/jnslmk/beamhouse/issues/10), kept because it is the
evidence behind [ADR-0006](../../docs/adr/0006-bridge-is-typescript-on-bun.md)'s claim that
dropping the Art-Net library costs ~25 lines.

`artnet.ts` is the whole ArtDmx receive path — parser and builder, with `Art-Net\0` ID, opcode,
protocol-version and length validation. **25 non-comment lines.**

`soak.ts` runs it against a native `Bun.udpSocket` bound to 6454 with `reuseAddr`:

```
bun run soak.ts
```

Measured 2026-09-01 on Bun 1.3.11: **295 sent, 295 received, 0 rejected, 0 sequence gaps** over
10 s at 30 Hz.

**This is not the bridge.** It has no ArtSync, ignores nothing explicitly, and is not hardened
against malformed packets from an untrusted broadcast socket — all three are called out as owned
work in ADR-0006's consequences.
