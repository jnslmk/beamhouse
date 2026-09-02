# ADR-0032: The M3a viewer is read-only, and a chip earns its place by being actionable

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#40](https://github.com/jnslmk/beamhouse/issues/40)
- **Amends:** [ADR-0023](0023-the-chip-bar-is-the-navigation.md)
- **Related:** [ADR-0031](0031-a-share-link-carries-resolved-definitions.md), [ADR-0014](0014-the-agent-surface-is-two-surfaces.md), [ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md)

## Context

[ADR-0023](0023-the-chip-bar-is-the-navigation.md) made eight state chips the navigation and
§14.1 gave the Pages viewer one rule: **bridge-dependent chips are absent, not greyed**, because
§13 says those signals are *unreachable, not false*. #35 read that as `Feed`, `Universes`, `Patch`
and `Hold` gone, `Selection` and `Camera` surviving, and handed the phone to #40.

Rendered through the canvas's own `parts.py` at a 390 px viewport:

| Chip set | Bar width | Against 390 px |
| --- | --- | --- |
| all eight, the desktop set | **1015 px** | 2.6× over |
| the four §14.1's rule leaves | **561 px** | **1.44× over** |
| `Selection` + `Camera` only | **328 px** | fits, 62 px spare |

§14.1's rule does not produce a phone layout. It produces a bar that is still 44% too wide, so
the phone forces a cut the desktop rule was never asked to make.

Two more facts from building it:

- **The rig does not fit a portrait phone.** The viewport is 1392 × 856 (1.63:1); a 390 × 844
  phone is 0.46:1. Fitting the whole rig at full width is a **240 px strip on an 844 px screen**.
  No framing choice fixes this; it is the aspect ratio.
- **§4.4 states no hit-target floor.** #40 attributed a 44 px floor to it; §4.4 lists four editing
  affordances and nothing else. The 44 px in this repo is the chip bar's *height*, and the canvas
  README names a touch floor only to hand the problem here. There was nothing to inherit.

## Decision

**1 · The M3a viewer is read-only.** Tap-to-select and orbit are the whole interaction. No
gizmo, no numeric entry, no array generators, no tool rail — [ADR-0016](0016-every-scene-mutation-is-one-undo-grained-command.md)'s
command layer is not reachable from a shared link, and neither is the agent surface
(ADR-0014): a share link has no bridge, so it has no second editor either.

Drag-and-drop survives as §4.3's **transport**, and is a desktop affordance that happens to live
in the same build. It is not a phone gesture and the phone layout does not offer it.

**2 · A chip earns its place by being actionable, not by existing on the desktop.** This is the
rule §14.1's absent-not-greyed only half-stated. `Render`, `Snap` and `Hold` are not
bridge-dependent — they would evaluate perfectly well on the viewer — and they go anyway, because
by decision 1 there is nothing to snap, nothing to pin the render against while you place it, and
no reason to reach for §13.5's intensity map on a rig you cannot repatch. The viewer's chip set is
**`Selection` and `Camera`**.

This **amends ADR-0023** by narrowing it: the chip bar is still the navigation, and *actionable*
is now the test for what sits in it. Applied to the desktop the test changes nothing, which is
what makes it a narrowing rather than a second model.

**3 · The viewer indication is the wordmark slot, and it carries the feed.** #35 inherited
"a persistent viewer indication after Vectorworks Showcase's purple border". A border costs ~8 px
on each edge of a 390 px screen and reads as chrome damage. The `mark` element already holds
120 px of the bar; on the viewer it reads **`Beamhouse · demo`**, where the second half is the
§13.1 feed.

This absorbs the `Feed` chip rather than dropping it. #40's sharpest requirement was that a
viewer running ADR-0014's `generated` feed **must not imply the frames are the rig's**, and the
feed is the one piece of state a viewer genuinely has. Putting it in the mark states it
permanently, in the slot that was going to hold a weaker claim, and costs no bar width — which is
what makes decision 2's cut affordable.

**4 · Portrait gives the viewport a band and spends the rest on the list.** 320 px of rig, then
the fixture list. 320 is the largest band that still slices to the rig's own content span
(x 174..1217 of 1392) instead of cropping into it. **The payoff frame is the phone turned
sideways**: 844 × 390 is 2.16:1, the only orientation in which the rig gets the screen, and
portrait says so in one line.

This is the one place the viewer departs from ADR-0023's *viewport-dominant, nothing is docked*.
It is not a preference: a docked band is what 0.46:1 leaves. The desktop is untouched.

**5 · The overlay's five tabs collapse to the fixture list.** `Universes` has no bridge to read,
`History` no commands to show, `Issues` nothing to reconcile — ADR-0031 puts the definitions in
the link, so a share link arrives already resolved. `Fixtures` remains, and `Objects`
([#43](https://github.com/jnslmk/beamhouse/issues/43)) joins it when non-empty. It is a list in
the lower half rather than a summoned overlay, because on a phone there is no viewport left to
summon it over.

**6 · The phone chip carries the count, never the name.** `SEL 4`, not `SEL 4 · Spoke 3 +3` —
which measures 393 px and overflows. The count keeps the bar a constant width, and identity
belongs to the sheet, which has all 390 px to say it in. Touch targets are **44 px**, so the
phone chip bar is 56 px rather than the desktop's 44.

**7 · The viewer states the snapshot's age.** `Snapshot · 2 Sep 14:02`, persistent in the
viewport. ADR-0031 makes a share link frozen, which makes *how old is this* the recipient's real
question — and it is the question the retired degradation ladder was going to answer badly.

## Considered options

- **Scroll the chip bar horizontally.** Rejected. It keeps ADR-0023 literally intact while
  defeating its purpose: a chip bar is also the status line, and a status line that hides its own
  contents behind a swipe is not one. A viewer's whole job is to be legible in three seconds.
- **Drop the bar; put state in a bottom sheet.** Rejected. It is the phone-native form and it
  costs a second navigation model to maintain against the desktop's, for two chips.
- **Grey the unreachable chips instead of removing them.** Rejected — this is §13's
  *unreachable, not false* argument, and it is already settled in §14.1. Nothing here reopens it.
- **Make the viewer editable and offer "save a copy".** Rejected for M3a. Its done-when is *opens
  the rig on a phone*; an editable viewer needs the command layer, undo, persistence and an
  ownership story (ADR-0027) on a deployment that has no bridge.
- **Letterbox the rig in portrait and leave the rest empty.** Rejected on sight once drawn: it
  spends two-thirds of an 844 px screen on nothing, in the one deployment whose entire purpose is
  to show someone a rig.

## Consequences

- **§14 gains a phone section** and the canvas gains two artboards, `Phone` (390 × 1688, resting
  and one fixture tapped) and `PhoneLandscape` (844 × 390).
- **ADR-0023's chip rule now has a test attached.** *Actionable* is a stronger statement than
  *bridge-dependent* and subsumes it, since nothing bridge-dependent is actionable without a
  bridge.
- **§14.1's viewer sentence is superseded** — "the same shell minus those chips" was measured and
  is not a layout. The viewer shell is `Selection` + `Camera`, a marked wordmark, and no rail.
- **The Pages viewer is now the one deployment with a docked element.** Worth stating plainly in
  §14 rather than leaving ADR-0023 to look violated.
- **`Objects` is the only tab whose viewer status is still open**, and it is [#43](https://github.com/jnslmk/beamhouse/issues/43)'s
  — the tab is settled, its contents are not.
- **Recordings on a phone are untouched by this.** §9.3's `.bhr` through the same link needs a
  transport, which is a second interaction model and the only part of #40 with real prior art to
  copy. It is [#45](https://github.com/jnslmk/beamhouse/issues/45).
