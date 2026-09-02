# WLED Peek readback — strip-path conformance oracle

A committed **capture**, not a running tool. A known Art-Net per-pixel pattern went
into the STAR-TENT; the bytes WLED computed came back off its Live LED Stream. The
pair is stored here so every later check of Beamhouse's strip render path — M2's
included — is an **offline diff that needs no hardware**.

Resolves [#26](https://github.com/jnslmk/beamhouse/issues/26). Topology from
[#21](https://github.com/jnslmk/beamhouse/issues/21), mechanism from
[#18](https://github.com/jnslmk/beamhouse/issues/18).

Captured 2026-09-02 against `STAR-TENT` at `192.168.1.243`, WLED 16.0.1
(`vid 2606300`), `ESP32_Ethernet`.

## Files

| file | what it is |
|---|---|
| `capture/sent-pattern.json` | the 230 RGB triplets driven in, and the universe split that carried them |
| `capture/peek-readback.json` | the 230 RGB triplets read back out of the settled frame |
| `capture/peek-frames.bin` | all 30 raw frames, 692 bytes each, concatenated |
| `capture/metadata.json` | the preconditions, as data — a capture whose brightness is unknown is worthless |
| `capture.py` | the harness that produced all of the above |

## The result

**230/230 pixels round-trip exactly.** The index space runs precisely the direction
the pattern predicts: no offset, no reversal, no stride error. All 30 frames are
byte-identical.

Two boundaries in the pattern were the point of it, and both are clean:

- **LED 169 → 170**, the *universe* boundary. Continuous, confirming the two-universe
  split derived on #21 (170 LEDs in the first, 60 in the second).
- **LED 22 → 23**, the *profile* boundary. The `(i % 23)` sawtooth resets exactly on
  23, confirming the 23-px profile against the wiring evidence from #21.

Observed cadence over 30 frames: **40.8–42.6 ms, mean 41.6** against a nominal 40 —
materially tighter than #26 anticipated. It is still not a guarantee: the frame
carries no timestamp and no sequence number, so **drops remain undetectable** and
this capture cannot be *proven* gap-free, only observed stable.

## The pattern, and why it is not a flat colour

```
R = i & 0xFF        absolute index      -> catches offset, global reversal
G = (255 - i) & 0xFF descending ramp    -> catches channel swaps
B = (i % 23) * 11   profile sawtooth    -> catches stride errors and per-spoke
                                           reversal, which a monotone ramp hides
```

The third channel matters for this rig specifically: the tent's ten spokes are
cabled **back and forth** (#21), so a per-spoke reversal is a live failure mode. A
monotone ramp cannot see it; the sawtooth can.

## Preconditions — the capture is unsound without all of them

Each is recorded in `metadata.json`, and each is a way a naive byte-diff fails for
reasons that have nothing to do with Beamhouse being wrong.

1. **Brightness pinned.** `sendLiveLedsWs` is `buffer[pos++] = bri ? qadd8(w, r) : 0`
   (`ws.cpp`) — brightness is applied at the bus, not here. The stream reads full
   value at any non-zero brightness and all-black at zero. Node was at `bri 255` with
   `maxbri` (`arlsForceMaxBri`) true, which forces max brightness during realtime anyway.
2. **Driven RGB-only, W = 0.** White is folded by *saturating* addition, `qadd8(w, r)`,
   which is only the identity when there is no white to clip.
3. **Under the cap, no downsampling.** ESP32 → `MAX_LIVE_LEDS_WS` 1024
   (`ws.cpp:195`), so `n = ((230-1)/1024)+1 = 1`. Every LED is served. **Extending the
   tent past 1024 would silently halve the stream's resolution** — and past 256 on an
   ESP8266, which this is not.
4. **Gamma correction off.** `no-gc: true` = `arlsDisableGammaCorrection`
   (`cfg.cpp:628`), so the captured bytes are raw values.
5. **Sole client.** Only one client receives at a time (`wsLiveClientId` is a single
   id) — opening Peek in WLED's own web UI mid-capture silently starves the harness.
6. **Provably the live stream.** `/json/info` during capture read `live: true`,
   `lm: "Art-Net"`, `lip: 192.168.1.171` — the readback is the harness's own data,
   not a residual effect.

The stream is **whole-strip and per node** (`strip.getLengthTotal()`), one flat index
space: the tent's four named WLED segments are invisible in it.

## The node was borrowed, then given back

The tent is configured for its show in `DMX_MODE_EFFECT_SEGMENT_W` (mode 9). Per-pixel
capture requires `DMX_MODE_MULTIPLE_RGB` (mode 4), so `capture.py` switches the mode,
captures, and **restores mode 9 in a `finally`**. Re-running it is safe. Nothing else
about the node's configuration is touched.

## Re-running

```
python3 capture.py [ip]      # defaults to 192.168.1.243
```

Needs `websocket-client`. Requires the tent powered and on the LAN — which is the whole
reason this capture is committed rather than performed on demand.
