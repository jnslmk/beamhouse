# ADR-0042: The transport is a viewport overlay, in the slot that says what you are watching

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#45](https://github.com/jnslmk/beamhouse/issues/45)
- **Confirms:** [ADR-0023](0023-the-chip-bar-is-the-navigation.md), [ADR-0032](0032-the-m3a-viewer-is-read-only.md)
- **Related:** [ADR-0040](0040-a-recording-is-deployment-material-and-the-bridge-records-it.md), [ADR-0041](0041-a-bhr-is-a-sequence-of-independently-decompressible-members.md), [ADR-0014](0014-the-agent-surface-is-two-surfaces.md)

## Context

[ADR-0032](0032-the-m3a-viewer-is-read-only.md) closed with *"recordings on a phone are untouched
by this … it is [#45](https://github.com/jnslmk/beamhouse/issues/45)"*, and #45 opened with the
observation that a transport is the viewer's first genuinely **actionable** element — so by
ADR-0032 decision 2's own test, *a chip earns its place by being actionable*, it is the first
candidate for a third chip, with **"~35 px spare"** to put it in.

Rendered through the canvas's own `parts.py` at 390 px:

| Bar | Width | Against 390 px |
| --- | --- | --- |
| `demo` mark, `Sel —` `Cam Front` — as ADR-0032 built it | 331 px | fits |
| `demo` mark, widest realistic (`Sel 12`, `Cam Front-L`) | 352 px | fits, **38 px spare** |
| **`recorded` mark**, same chips | **381 px** | fits, **9 px spare** |
| **+ a `Time 04:12` chip** | **483 px** | **93 px over** |
| + a `Time` chip, mark stripped back to bare `Beamhouse` | 415 px | **25 px over** |
| + `Time 04:12 / 18:30` | 539 px | **149 px over** |

**A chip costs ~102 px and there are 38.** Deleting the feed from the wordmark to make room still
leaves it 25 px over. ADR-0032's *actionable* test admits the transport; the bar physically will
not hold it. The 35 px #45 counted was never chip-sized.

Three more facts.

**The bottom of a phone is taken.** ADR-0032 decision 5 docks the fixture list, and the selection
sheet rises from `bottom: 0` of it. A media-player transport bar — Showcase's form, and the prior
art #45 was chartered to copy — lands exactly where the sheet slides up, on the only screen it
would live on.

**There is already a persistent overlay in the viewport, in both orientations.** ADR-0032 decision
7's `Snapshot · 2 Sep 14:02`, bottom-left, 24 px tall, present in `Phone` and `PhoneLandscape`
alike.

**The mark has never carried the feed.** ADR-0032 decision 3 says the second half of
`Beamhouse · demo` *"is the §13.1 feed"*. §13.1's feeds are `live`, `recorded` and `generated`;
**`demo` is none of them** — it is §9.2's demo motion *mode*, one of the two callers ADR-0014 put
on the `generated` feed. The slot has been carrying **which canned thing you are watching**, one
level below the feed, since it was written.

## Decision

**1 · The transport is not a chip, on any surface.** Measured out on the phone; refused on the
desktop by §14.1's own precedent — *"there is no ninth chip for issues: the count rides `Patch`"* —
which says a new signal rides the chip that already states it rather than minting a ninth.

**2 · The transport is a persistent viewport overlay, in the slot that already says what you are
watching.** Bottom-left of the viewport, the same element in the desktop app, the portrait phone
and the landscape phone. It is the `Snapshot` tag grown a scrub track, not a second element beside
it. §13.1 says a `recorded` feed shows **timeline position** and explicitly **no staleness** —
*"a recording is not silent, it is finished"* — and ADR-0032 decision 7 put **snapshot age** in
that exact slot because *how old is this* was the recipient's real question. Position and age are
the same question asked of a moving thing.

**3 · The label states what you are watching, then the position.** On the viewer that is the
snapshot's date — `Snapshot · 2 Sep 14:02 · 04:12 / 18:30` — one date, and it is the scene's,
because ADR-0041 decision 4 leaves a `.bhr` with no date of its own and deliberately so. On the
desktop there is no snapshot date, because a bridge-local page is not frozen; the lead is the file,
`opener.bhr · 04:12 / 18:30`. Same slot, same rule as decision 6, different thing to name.

**4 · This amends nothing in ADR-0023.** *Nothing is docked* is about panes; an overlay inside the
viewport is not one, and the `Snapshot` tag set that precedent already. The desktop keeps its eight
chips and the viewer its two.

**5 · The `Feed` chip is unchanged**, and stays the desktop's statement of `live` / `recorded` /
`generated`. It opens nothing, as §14.1 already has it. The transport's *presence* is what states
`recorded` on the viewer, where there is no `Feed` chip to ask.

**6 · The wordmark carries the recording's name, not the word `recorded`.** `Beamhouse · opener`,
beside `Beamhouse · demo`. This is not a new rule; it is the rule the slot has been following since
ADR-0032, stated correctly. The feed itself is stated in the two places that already carry it —
§13.1's table and ADR-0028's capture stamp — and by whether a transport is on screen at all.
`Beamhouse · recorded` measures 381 px of 390: it fits, and 9 px of slack is not worth spending on
a word the screen is already showing.

**7 · A recording autoplays from `t=0`.** ADR-0041's members put the first 10 s in 5–66 KB, so the
rig is moving before the file is down. §9.2 gave a shared link a demo motion mode for one stated
reason — to make it look **alive** — and a recipient who opens a recording to a still rig has been
handed the failure that mode was invented to prevent. It is also the failure ADR-0028's feed stamp
guards against on the agent side: a held frame is indistinguishable from a `generated` link that
has not started.

## Considered options

- **A third chip.** Rejected on measurement — 93 px over, and 25 px over even after deleting the
  feed from the mark to pay for it. The rule that admits it is ADR-0032's own, which is why the
  measurement is the whole argument.
- **A bottom-docked media-player bar, after Showcase.** Rejected: it is the prior art, and on the
  one screen it would occupy it collides with ADR-0032 decision 5's sheet. Prior art that does not
  survive contact with the layout it is being copied into is not prior art for this screen.
- **A 44 px bar between the band and the list.** Rejected. ADR-0032's 320 px band is *exactly* the
  rig — 390 px across the content span x 174..1217 is a 0.374 scale, and 856 × 0.374 = 320 — so
  height taken from the band crops the rig, and height taken from the list costs a row. It also
  answers only portrait and leaves landscape to invent a second layout.
- **Grow the `Feed` chip into the transport on the desktop.** Rejected. It hides a control you hold
  continuously behind a click, makes one chip behave unlike the other seven, and produces two
  designs joined by a rule where one component does.
- **`Beamhouse · recorded` in the mark.** Rejected — see decision 6. It fits, and it would make
  `demo` retroactively wrong rather than revealing that it was always naming something else.
- **Hold on frame 0 until tapped.** Rejected — see decision 7.

## Consequences

- **§14.6 gains the transport**, and the canvas gains a `Recorded` artboard showing the same
  element in the desktop, landscape and portrait frames — the single-component claim drawn rather
  than asserted.
- **ADR-0032 decision 3's wording is corrected, not reversed.** The mark carries what you are
  watching; it has done since it was drawn, and calling that "the feed" was the slip.
- **The desktop gains its first viewport overlay.** It had none: `Snapshot` is viewer-only, because
  a bridge-local page is not frozen.
- **Off a recorded feed the slot is unchanged** — `Snapshot · …` on the viewer, nothing on the
  desktop. The transport appears with the recording and takes no space when there is none.
