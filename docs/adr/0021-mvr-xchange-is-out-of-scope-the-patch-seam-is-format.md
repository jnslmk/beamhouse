# ADR-0021: MVR-xchange is out of scope, and the patch seam is format, not delivery

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#30](https://github.com/jnslmk/beamhouse/issues/30)
- **Amends:** [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md), [ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md)

## Context

#30 was opened by the 2026-09-02 competitive review to do two things: state the MVR-xchange
ceiling honestly instead of leaving it as one word in a shared out-of-scope bullet, and **name the
seam** — so that if MVR-xchange is ever reconsidered, the cost is a new implementation rather than
a refactor. The criterion it set for itself came from [ADR-0009](0009-deployment-is-inferred-from-origin.md),
which deleted `relay` from `feed.ts` precisely because nothing had ever defined it: a seam must be
*defined* or it must not exist.

Half the ticket was already done when it was claimed, and the other half was asking about the
wrong set of sources.

### Deliverable one had already shipped

The ticket asks for "the wording that replaces the shared out-of-scope bullet". That bullet was
split out when the ticket was filed and strengthened by
[ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md): §01 carries MVR-xchange as its
own entry with the ceiling stated outright, and `CONTEXT.md` carries a **Patch source** term. What
was left of item one is a single word — *deferred* or *excluded* — and the map's own rule settles
it: out of scope never graduates.

### "Three real sources already" is wrong in both directions

The ticket justifies the interface by counting three existing sources: Mizer YAML, an MVR file,
and drag-and-drop in the Pages viewer. Measured against `DESIGN.md`:

**Drag-and-drop is not a source.** §9.2 offers "drag-and-drop for the recipient's own GDTF *or*
MVR". The GDTF half is a **Library** input — definitions, not a patch. The MVR half is §4.3's
importer reached by a different gesture. It is a *transport*, and counting it is the `relay`
failure in miniature: an interface justified by a member that turns out not to exist.

**Two genuine sources were missing.**

1. **The URL fragment.** `CONTEXT.md` defines a **Scene** as *patch plus placement*, and M3a's
   done-when is "a Pages URL with the scene in its fragment opens the rig on a phone". That is a
   patch with **no file on disk anywhere** — exactly the case the ticket wants the interface to
   prove, required two milestones before MVR import.
2. **`bhs:` local fixtures.** [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)
   says it in as many words: "It makes Beamhouse a **limited patch source**."

### M3a was unsatisfiable, and nobody had noticed the patch half

§9.2 records that a `.bhs` carries `patch` and `gdtfDir` as **local paths the recipient cannot
resolve**, and §4.5's example confirms it: `{"kind": "mizer", "path": "~/mizer/warehouse.yml"}`.
§9.2 draws the consequence for **definitions** and calls the fix "a separate decision, and not
reachable today". The **patch** has the identical problem and no section says so — so M3a as
written opens a phone on a path that phone cannot read.

### The enum did not factor

[ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md)'s live predicate is *any patch
file that (i) sits on a watchable path and (ii) names its definitions in a library Beamhouse
resolves*. An MVR file dropped in `shows/` satisfies both, and §4.6 already has the bridge watching
`shows/` and pushing a reload on change. **So MVR-on-disk is `live`**, and `imported` is not a
delivery mode at all — it is the *no-path* case. A three-member enum of `live | imported | …` mixes
**delivery** (watched / one-shot / inline) with **format** (Mizer YAML / MVR / snapshot JSON) and
names three points on a grid as if they were three values of one thing.

## Decision

### 1. MVR-xchange is out of scope, not deferred

Not a v1 concession. The grounds are [ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md)'s
rather than the ticket's: MVR-xchange is a protocol **between stations**, and of its six named
peers — grandMA3, BlenderDMX, Vectorworks 2026 Spotlight, Production Assist, zactrack, DMXRouter —
**only grandMA3 is a console**. The rest are design and previz tools, and that population already
reaches Beamhouse through MVR **file** import. The protocol would buy a second door onto a
population that already has one.

**The one condition that reopens it:** a patch source Beamhouse wants that has an xchange station
and **no watchable file**. That is a multi-tool room, which is a redrawn destination and a fresh
effort — not a resumption. The same shape as
[ADR-0017](0017-shaders-are-hand-written-glsl-webgpu-is-out-of-scope.md)'s simulated atmosphere.

**The ceiling, stated:** Beamhouse can be half of the Mizer pair and cannot appear in a multi-tool
room. No console pushing a rig into it live, no Vectorworks round-trip.

### 2. The seam is **format**, and delivery is deliberately outside it

```
parse(bytes: Uint8Array) → Patch
```

Three implementations, and they are the three the design already has:

| Implementation | Reads | Earned by |
| --- | --- | --- |
| `mizer` | Mizer project YAML | §4.2, M5a |
| `mvr` | `GeneralSceneDescription.xml` out of an MVR zip | §4.3, M5b |
| `snapshot` | a resolved patch, inline JSON | §9.1, **M3a** |

**Delivery is not the interface's business.** Watched-vs-one-shot-vs-inline is §4.6's existing file
watcher plus a byte source, and `shows/` already works that way. This is what makes the seam cheap
and what answers the ticket's own question: **MVR-xchange, if it ever returns, is a *delivery* — a
station pushing bytes — reusing the `mvr` parser unchanged.** A new byte source, not a refactor.
It also buys something wanted today: watching an MVR re-exported into `shows/` is free rather than
a fourth enum member.

### 3. Format-specific identity work lives inside its parser

ADR-0020's MVR ingest ladder — `FixtureIDNumeric` → parsed `FixtureID` → `UnitNumber` →
synthesised, with a **loud** synthesised id — runs **inside the `mvr` parser**. It has no meaning
for Mizer YAML, which supplies a `u32` directly. The alternative is a normalise-identity step every
implementation carries and two of three no-op.

Every parser emits a `Patch` whose ids are already integers. The merge pass downstream sees one
shape and knows nothing about formats — the discipline §02 enforces for transports and
[ADR-0008](0008-colour-space-is-assumed-transfer-function-is-read.md) for colour.

### 4. Drag-and-drop is a transport; local fixtures are a merge

- **Drag-and-drop** is a byte source onto the `mvr` parser (or, for a `.gdtf`, onto the **Library**,
  which is not a patch path at all). Said explicitly in §9.2 so it cannot be recounted as a source.
- **`bhs:` local fixtures** are a **contribution**, not a source. They arrive from the `.bhs` after
  whatever parser ran and merge into the patch alongside the override layer — same file, same merge
  pass. ADR-0012's "limited patch source" is loose and is tightened here: a source *produces* a
  patch; local fixtures *add to* one, and can never be the only thing present.

### 5. `patch` in a `.bhs` is a tagged union, and only one variant is shareable

```json
"patch": { "kind": "mizer",    "path": "~/mizer/warehouse.yml" }
"patch": { "kind": "mvr",      "path": "shows/warehouse.mvr" }
"patch": { "kind": "snapshot", "fixtures": [ … ] }
```

The path-bearing variants are **unshareable**; the inline `snapshot` is what a share link carries.
That is what makes M3a satisfiable, and it is the first statement anywhere of what "share" means
for the patch half. A fixed point on the still-unwritten `.bhs` schema, recorded the way
ADR-0012's `definitions` block and ADR-0013's scene density and beam length were.

### 6. §9.2's two halves degrade differently, and must stop being one sentence

- **Patch half — solved.** The `snapshot` variant carries it inline.
- **Definition half — unchanged.** A snapshot names `gdtf:` ids the recipient may not have, and
  `gdtfDir` is still a local path. It degrades exactly as §9.2 already describes: bundled
  definitions in `public/gdtf/`, then proxy geometry from the declared `PrimitiveType`, then
  drag-and-drop. `bhs:` definitions, carried inline, are the one kind immune.

What §9.2 must stop implying is that both halves wait on the same undecided format.

### 7. M5b's done-when names a capability, not a tool

Measured while resolving this ticket: **BlenderDMX is not on this disk.** Blender 5.2.0 LTS is
installed at `/usr/bin/blender`; its only extension is `print3d_toolbox`, and `import pymvr` fails.
ADR-0020 re-targeted M5b from BlinderKitten to BlenderDMX and reproduced the defect it had just
diagnosed — the third milestone in this map whose done-when named a **producer** rather than a
capability (M6's zoom, M5b twice).

M5b becomes: *a committed MVR in `shows/` loads and overrides merge cleanly.* Generated once and
checked in, so it is satisfiable from a clean clone forever. Installing BlenderDMX is a bench
decision, not a milestone gate.

**The rule, since this is now a pattern:** a milestone's done-when may name a **file in this repo**
or a **capability**, never a third-party tool that has to be present for the clause to parse.

## Consequences

- §01's MVR-xchange bullet moves from "stays out of v1" to **out of scope**, with the reopening
  condition named.
- `DESIGN.md` §03 gains `src/patch/` with `mizer.ts`, `mvr.ts`, `snapshot.ts` behind `patch.ts`;
  the standalone `src/mvr.ts` is folded in.
- §4.3 stops being "a side door" in structure as well as in wording: it is one parser of three.
- §4.5 gains the tagged `patch` union.
- §9.2's degradation ladder splits into its patch and definition halves.
- M5b's clause changes, and the milestone-clause rule is stated in §10.
- `CONTEXT.md`'s **Patch source** entry is rewritten: it currently says Beamhouse "has two kinds",
  which was ADR-0020's *population* distinction being read as an implementation list. The two axes
  are named instead, and the `_Avoid_: patch reader` guidance stands — the module is `patch/` and
  the members are parsers.
- **Nothing here widens the show network's attack surface**, which was the ticket's third argument
  for declining: every implementation reads bytes Beamhouse was already given.

## Considered and rejected

- **Defer MVR-xchange to v2.** Rejected for the reason ADR-0017 rejected deferring WebGPU: a
  deferral implies a route back, and there is none that does not redraw the destination. Naming the
  reopening condition is more honest and costs less than a standing promise.
- **Make delivery the interface (`live | imported | inline`).** Rejected: it does not factor, it
  makes "watch an MVR in `shows/`" either impossible or a fourth member, and it puts MVR-xchange on
  the same axis as the thing it would actually reuse.
- **A fourth `local` implementation for `bhs:` fixtures.** Rejected: it could never be the only
  member present, which makes it a merge step wearing an interface's clothes — the `relay` shape
  again.
- **Per-parser identity normalisation as a shared step.** Rejected: two of three implementations
  would no-op it, and the MVR ladder's synthesised-id surfacing has no counterpart in a format that
  supplies a `u32`.
- **Install BlenderDMX and keep M5b's clause.** Rejected as a milestone gate; kept as an optional
  bench instrument. A done-when that depends on an install is not checkable from a clean clone.
