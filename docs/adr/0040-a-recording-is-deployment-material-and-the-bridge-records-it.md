# ADR-0040: A recording is deployment material, and the bridge records it under a flag

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#45](https://github.com/jnslmk/beamhouse/issues/45)
- **Confirms:** [ADR-0021](0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md), [ADR-0039](0039-definition-authoring-has-no-surface-of-its-own.md)
- **Related:** [ADR-0031](0031-a-share-link-carries-resolved-definitions.md), [ADR-0028](0028-a-capture-is-a-handle-fetched-over-http.md)

## Context

§9.3 is three lines: `track.bhr` is the §07 frame stream appended verbatim with length prefixes,
gzipped; *"reference one from the fragment; keep it out of the fragment itself."*
[#45](https://github.com/jnslmk/beamhouse/issues/45) read that as an outward-pointing reference —
*"a recording reference is the one thing in a share link that would still point outward"* — and
asked where it points, now that [ADR-0031](0031-a-share-link-carries-resolved-definitions.md) has
made the scene half of a link self-contained and pathless.

Two things already written down answer it, and a third says the question was aimed at the wrong
half of the problem.

**1 · §09's deployment table already names the host.** GitHub Pages serves *"public viewer: shared
links, **hosted recordings**"*. It has said so since the table was written.

**2 · M7's done-when already names the artefact.** *"A **committed** `.bhr` plays back through the
same shared link."* A committed recording is in the repo, in the Pages build, at the viewer's own
origin. It never pointed outward.

**3 · There is nowhere else for it to point.** ADR-0021 rules the network side of exchange out of
scope, so there is no service to host one. §9.4 forbids an `https` Pages page reaching a
`http://localhost` bridge, so the sender's own machine is not reachable either. An operator who
records their own show and wants to *link* it has no host — and no decision on this map creates
one.

**4 · Nothing writes a `.bhr`.** §06 gives the bridge seven jobs and recording is not among them.
§03 lists `shows/  # *.mvr, *.bhs, recorded bundles` and §10 has M7, so the artefact has a home and
a milestone and **no producer named anywhere**. `capture` is not it: ADR-0028 is a single still
image fetched over HTTP.

## Decision

**1 · A recording behind a share link is deployment material, not link payload.** A `.bhr` that a
share link can reach is one committed to the repo and shipped in the Pages build. Publishing a
recording is an act by whoever controls the deployment, not a gesture available to an operator
mid-show.

This is ADR-0031's argument arriving at the same place from the other side: inline definitions were
chosen because *"inline is the only form whose correctness the sender can see"*, and the same test
applied to a recording — 0.8 MB gzipped for a held look, far past §9.1's 4 KB fragment budget —
puts it in the build rather than the link.

**2 · The fragment carries a name, not a URL.** `#s=…&r=opener` resolves against the viewer's own
origin, the way §09 infers the deployment from the origin
([ADR-0009](0009-deployment-is-inferred-from-origin.md)). A link therefore stays pathless in
exactly ADR-0031's sense — it names nothing the *recipient* must resolve externally — and §9.3's
*"reference one from the fragment; keep it out of the fragment itself"* is satisfied literally,
with the reference being a build-local name.

**3 · An operator's own recording plays bridge-local, where the file is on disk.** The desktop is
therefore the **primary** playback surface and the phone the derived one, which is the reverse of
how #45 framed it and why [ADR-0042](0042-the-transport-is-a-viewport-overlay.md) designs both.

**4 · The `single` build is the operator's shareable form, and is not built in v1.** A 0.8 MB
gzipped recording is ~1.1 MB of base64 inside a `vite-plugin-singlefile` page — the one artefact an
operator can hand someone without a host. It is named here so that the gap is a known gap rather
than a discovered one; nothing in v1 builds it.

**5 · The bridge records, under a CLI flag, with no surface.** `--record shows/opener.bhr`. The
bridge already constructs the exact §07 bytes, so recording is a tee of a buffer that exists;
anywhere else re-serialises frames that were already serialised. There is no ninth chip, no
eleventh tool and no control-channel request — this is ADR-0039's finding reached from the other
direction, that a surface small enough to be hosted by something that already exists does not get a
screen of its own.

## Considered options

- **Invent a host for operator recordings.** Rejected: it reopens ADR-0021, and it makes a share
  link require a third-party account to *play*, which is a heavier dependency than the one ADR-0021
  refused for definitions.
- **Carry the recording in the fragment.** Rejected on measurement. §9.1's budget is 4096
  characters; the smallest realistic recording measured here is 0.82 MB — 200× over, against
  definitions' 211 characters. §9.3 already said to keep it out of the fragment; this prices the
  instruction.
- **Record in the browser and offer a download.** Rejected. It re-serialises what the bridge just
  serialised, it needs the tab held open for the length of the show, and it puts
  [ADR-0041](0041-a-bhr-is-a-sequence-of-independently-decompressible-members.md)'s 84 MB inside a
  tab that is also rendering.
- **A record chip or a rail tool.** Rejected. It puts a persistent control on every desktop for an
  operation run once per show, and ADR-0023's chip bar is also the status line — a chip that is a
  button for eight hours and a state for none of them is not one.

## Consequences

- **§06's seven jobs stay seven.** Recording is a flag on the process, not a job it always does,
  and the distinction is worth keeping: every one of the seven runs on every launch.
- **§13.1's `recorded` row now has a producer.** It described what the UI shows off a recorded feed
  before anything could make one.
- **An operator cannot share a recording by link in v1**, and this is stated rather than
  discovered. The bridge-local app plays their file; decision 4 names the form that would change
  that.
- **`track.bhr` is renamed in §9.3.** `CONTEXT.md`'s **Recording** entry lists *track* on its own
  *Avoid* line, and the one example filename in the document used it.
