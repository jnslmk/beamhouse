# ADR-0031: A share link carries render-resolved definitions, and §9.2's degradation ladder retires

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#40](https://github.com/jnslmk/beamhouse/issues/40)
- **Amends:** [ADR-0021](0021-mvr-xchange-is-out-of-scope-the-patch-seam-is-format.md)
- **Related:** [ADR-0009](0009-deployment-is-inferred-from-origin.md), [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md), [ADR-0014](0014-the-agent-surface-is-two-surfaces.md)

## Context

§9.2 has described a three-rung **degradation ladder** since the document was written: bundled
definitions in `public/gdtf/`, then **proxy geometry** from the declared `PrimitiveType` where a
definition ships no mesh, then drag-and-drop for the recipient's own GDTF or MVR. #30 split the
problem in half and reported the patch half solved by §4.5's inline `snapshot` and **the
definition half "unchanged"**. #40 was chartered to design the ladder as a screen.

Three measurements say the ladder does not exist.

**1 · Not one definition on this rig ships a mesh.** All five files in `definitions/gdtf/`, read
straight out of the archives:

| Archive | Entries | Meshes |
| --- | --- | --- |
| `ADJ_Fog_Fury_Jett_Release_1.gdtf` | `thumbnail.png`, `description.xml` | **0** |
| `GLP_impression_X4_HR_Mode_richtig_geschrieben.gdtf` | `thumbnail.png`, `description.xml` | **0** |
| `MarkeEigenbau_RGB_LED_Pixel_Strip_30px_1m_TMSv01.gdtf` | `description.xml` | **0** |
| `Purelight_FX_Mini_Derby_2_Version_1.gdtf` | `description.xml` | **0** |
| `WLED_Project_WLED_RGB_Effect_Mode_rev-09.gdtf` | `description.xml` | **0** |

So rung 2 fires on **every fixture on the operator's own desktop**. Proxy geometry is not a
degraded rendering of this rig; it is *the* rendering of this rig, on both screens. #40's premise
— *"a rig of proxies is correct and looks nothing like the sender's screen"* — is false, and the
question it raised, *how does a proxy rig announce itself as a proxy*, would mark the normal case
as degraded in both deployments.

#27 already corrected this paragraph once, from *"when no definition is available"* to *"when the
definition ships no mesh"*. That fixed a real self-contradiction — `PrimitiveType` is a field
*of* the definition — but it moved the ladder onto an axis that never varies.

**2 · The only axis that does vary costs 211 characters to remove.** Measured on the reference
rig — `mizer-shows/OBF26_Bunte-Stube_gdtf-ofl.yml`, 20 fixtures over three universes — as a
columnar payload (arrays not objects, millimetre integers, raw deflate, base64url), against
§9.1's 4096-character budget:

| Fragment | Characters | Of budget |
| --- | --- | --- |
| definitions named by `gdtf:` / `ofl:` id | 464 | 11% |
| **the same, render-resolved inline** — `PrimitiveType`, beam angle, emitter count, pitch, bounding box, channel bindings | **675** | **16%** |

The crossover into over-budget moves from 188 fixtures to about 176. The definition half was not
blocked; it was unpriced.

**3 · The budget has an order of magnitude more headroom than anything assumed.** 4096 characters
holds **188 fixtures with names, 229 without**. This rig is 20. §9.1's bare *"treat 4 KB as the
budget"* reads like a constraint on M3a and is a constraint on a rig ten times its size.

## Decision

**1 · The `snapshot` patch variant carries render-resolved definitions inline.** A share link
contains everything the renderer needs — `PrimitiveType`, beam angle, emitter count and pitch,
bounding box, and the mode's channel bindings — keyed per definition, with fixtures indexing into
that table. It names no `gdtf:` id it expects the recipient to resolve and carries no `gdtfDir`.

This is what §4.5 line 387 already promised. `snapshot` is described there as **"a resolved
patch"**; it resolved addressing and stopped at geometry, and there was never a measured reason
for the stop.

**2 · §9.2's degradation ladder is retired, not redesigned.** With definitions in the link there
is no rung, so there is nothing for the viewer to announce and nothing for a recipient to be told
they are missing.

- **`public/gdtf/` bundling loses its purpose** for share links. It buys meshes, and there are no
  meshes. It stays in ADR-0009's inert-static-asset sense for the *bridge-local* app, where a
  dropped `.gdtf` is a Library entry, but it is no longer part of any degradation story.
- **Proxy geometry stops being a rung and becomes the render path**, named as such in §05 and §08
  rather than as a fallback in §09.
- **Drag-and-drop stops being a rescue.** §4.3 already says what it is — a **transport**, not a
  patch source. A recipient dropping their own `.mvr` is importing their own rig, which is a
  different feature from repairing a broken link.

**3 · A share link is a frozen snapshot, and its age is what the viewer states.** Resolving inline
means an updated definition does not reach an old link. That is the honest semantics of a link
rather than a cost of this decision — the patch half has been frozen since #30, and a link whose
beam angles silently changed under it would be worse. The recipient-facing consequence replaces
the one the ladder was going to carry: instead of *which rung am I on*, the viewer states **when
this was taken** ([ADR-0032](0032-the-m3a-viewer-is-read-only.md)).

**4 · The over-budget fallback stays as written, with the measurement recorded beside it.** §9.1
keeps its *"fall back to offering a `.bhs` download and say so in the UI"*. It is one line of copy
on a path that needs a 188-fixture rig to reach, so it is not an M3a screen and gets no design
here. The number goes into §9.1 so the budget stops reading as a live constraint.

## Considered options

- **Design the ladder as specified.** Rejected by fact 1: two of its three rungs are the same
  rung, and the third is a different feature. Designing a *which-rung-am-I-on* indicator for a rig
  where every fixture is always on rung 2 would ship a permanent warning about the normal case —
  the failure ADR-0011 and §06 job 4 both name, arrived at from the other direction.
- **Keep definition ids and bundle every recurring definition.** Rejected. It makes the link's
  completeness depend on what the *deployment* happens to ship, so the same link works or does not
  depending on when the viewer was built, and the sender cannot tell which. Inline is the only
  form whose correctness the sender can see.
- **Carry the whole GDTF archive in the fragment.** Rejected on measurement: `description.xml`
  alone is 257 KB for the GLP profile, two orders of magnitude past the budget. The render-facts
  subset is the part that is small.
- **Resolve on the recipient's side from GDTF Share.** Rejected. It makes a share link require a
  network round-trip and an account to a third-party service, and ADR-0021 already ruled the
  network side of definition exchange out of scope.

## Consequences

- **§9.2 loses its ladder** and gains a statement that the link is complete. §13.1's table row for
  the Pages viewer — *"nothing. There is no bridge to ask"* — is unchanged and now the whole story.
- **The `snapshot` variant grows a `definitions` table**, which is the third fixed point recorded
  on the `.bhs` schema, after ADR-0012's `definitions` block and #30's tagged union. The two are
  deliberately the same shape: a `bhs:` definition was **already** inline and pathless
  (ADR-0012), and this makes every definition in a share link behave the way that one already did.
- **[#42](https://github.com/jnslmk/beamhouse/issues/42) loses a constraint.** Its choice between
  an authored `gdtf:` file and an inline `bhs:` definition for the STAR-TENT no longer changes what
  a recipient can see, because both now travel in the link. #40 cited that dependency against
  [#38](https://github.com/jnslmk/beamhouse/issues/38), which is the contention ticket; the
  dependency was #42's and it is now gone either way.
- **`gdtfDir` never appears in a shareable artefact.** The path-bearing variants stay
  sender-local, which is what #30 established and what this completes.
- **A stale link is now possible and was not before.** Nothing detects it: the viewer states the
  snapshot time and the recipient judges. This is the same posture as ADR-0029's — detect and
  state, never resolve.
