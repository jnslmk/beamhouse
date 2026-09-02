# ADR-0041: A `.bhr` is a sequence of independently decompressible members

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#45](https://github.com/jnslmk/beamhouse/issues/45)
- **Amends:** §9.3, which said "gzipped" without saying how
- **Related:** [ADR-0040](0040-a-recording-is-deployment-material-and-the-bridge-records-it.md), [ADR-0007](0007-one-universe-space-sacn-numbered.md)

## Context

[#45](https://github.com/jnslmk/beamhouse/issues/45) raised *"scrubbing against a rig that renders
per-frame — §07's stream is length-prefixed frames; seeking is not the same operation as playing"*.

**Seeking is exactly the same operation as playing, and the format is why.** §07's frame carries
`u8[512] slots` for every subscribed universe — a **complete** state, not a delta. Every frame in a
`.bhr` is independently renderable; there are no keyframes to hunt backwards for, because they are
all keyframes. `resolve.ts` diffs against the previous frame (§05), but that is a throughput
optimisation and a seek merely invalidates it.

What is actually in the way is the container. Measured on the reference rig — three universes, so
a §07 frame is 1552 bytes, at §05's fixed 30 Hz tick:

| Content | 30 min raw | 30 min gzipped | gzipped bitrate |
| --- | --- | --- | --- |
| a held look | 83.8 MB | **0.82 MB** | 0.5 KB/s |
| a busy per-pixel chase | 83.8 MB | **6.6 MB** | 3.7 KB/s |

Fetching a recording is free — a busy half-hour is smaller than one GDTF `description.xml`, which
§9.2 measured at 257 KB for the GLP profile. **Holding one is not.** A single gzip stream cannot be
seeked by byte offset, so the only way to reach an arbitrary frame is to decompress from the
beginning — which on a phone means holding 84 MB per half-hour to get O(1) scrubbing, or
re-decompressing the file on every drag.

§9.3's length prefixes also buy nothing as written: a §07 frame is already self-delimiting through
its own `universe_count`, and no prefix lets you skip inside a gzip stream.

## Decision

**1 · A `.bhr` is concatenated gzip members, one per 10 s of recording.** Concatenated members are
legal gzip — `gzip -d` and `DecompressionStream('gzip')` both consume them as one stream — so a
`.bhr` remains a single file that ordinary tools decompress whole.

**2 · A seek decompresses one member.** 10 s is ≈0.5 MB raw and 5–66 KB compressed on the rig
above, so a scrub lands on a member boundary immediately and refines to the frame within it, and
resident memory is bounded by the member rather than by the length of the show.

**3 · The length prefixes become the member index and finally earn their place.** They are what
lets the reader find member boundaries without decompressing, which is the one thing they could
never do while there was a single member.

**4 · There is no header, and a `.bhr` does not say when it was recorded.** §07's `t_ms` is `u32`
— 49.7 days — so it is monotonic and relative by construction; a Unix epoch in milliseconds needs
41 bits. The date the viewer shows is the **scene snapshot's**, carried in the fragment
([ADR-0042](0042-the-transport-is-a-viewport-overlay.md)). A recording is made against the rig
that is then shared, so a header's date would agree with the fragment's every time — and §07
rejected a carried `contended` flag on precisely this ground, that it is *"a second chance to
disagree with the array beside it"*.

## Considered options

- **Keep one gzip stream; decompress once into an `ArrayBuffer` and index `t_ms → offset`.**
  Rejected on the 84 MB. It is correct and fast and fails only on long recordings, on phones,
  silently — the failure class §06 job 4 exists to prevent, arrived at from the storage side.
- **Store deltas instead of full frames.** Rejected. It would shrink the raw stream by roughly the
  100× that compression already recovers, and it would buy that by making frames dependent — which
  is what forces keyframes, which is re-deriving video coding for a signal that is already all
  keyframes. §9.3's *verbatim* is what avoids it and it should stay.
- **Leave it as an M7 implementation detail.** Rejected: the choice is visible in the artefact, so
  it is a format decision. A `.bhr` recorded as one member cannot be re-containered by the reader.

## Consequences

- **§9.3 gains the member rule and loses `track.bhr` as a name** (ADR-0040).
- **The recorder chooses the member boundary**, so a `.bhr` written by a future recorder at a
  different cadence still reads — the reader follows the prefixes and never assumes 10 s.
- **Scrub granularity is a member, then a frame.** Nothing in the UI needs to state this: at 10 s
  and 5–66 KB the refinement is not perceptible, and ADR-0042's transport shows position, not
  buffering.
- **A `.bhr` stays `gzip -d`-able**, which keeps it inspectable with ordinary tools — the property
  that made "gzipped" the right call in the first place.
