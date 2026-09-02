# ADR-0023: The chip bar is the navigation, nothing is docked, and there is exactly one overlay

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#35](https://github.com/jnslmk/beamhouse/issues/35)
- **Amended by:** [ADR-0032](0032-the-m3a-viewer-is-read-only.md)

## Context

`DESIGN.md` described a renderer, a resolver, a bridge and a wire protocol in detail and **never
once described the screen**. §4.4's four editing affordances were the only description of the UI
anywhere in the document. #35 surveyed grandMA3, Capture 2026, BlenderDMX, DMXpressions and
Vectorworks Showcase from their own documentation, and the field splits three ways:

- **grandMA3** docks nothing. A title bar of *state chips* — each showing its current value and
  opening on click — plus a left tool rail, and viewport for everything else. The bar doubles as
  the status line.
- **Capture 2026** and **DMXpressions** dock a table or panel beside the 3D view.
- **DMXpressions** additionally has eight top-level *workspaces*.

## Decision

**Viewport-dominant. Nothing is docked. Eight state chips are the navigation, and there is exactly
one overlay, tabbed.**

The chips are **Feed · Universes · Patch · Selection · Render · Hold · Snap · Camera**. Each shows
its current value and opens the overlay at its matching tab. The overlay's tabs are
**Fixtures · Objects · Universes · History · Issues**.

§01's *"fast to open, fifty times a night"* is the argument. Workspace rails are rejected on
scale: Beamhouse does a fraction of what DMXpressions does.

## Consequences

- **§13's signal inventory costs no layout.** The chip bar is already the status line, so the
  Feed, Universes and Patch chips carry [ADR-0018](0018-signal-health-is-one-per-universe-snapshot.md)'s
  signals for free — which is what #31's fog note reserved chips for.
- **Nothing exists in two fidelities.** A per-chip read-only popover *plus* an overlay tab was
  rejected as a duplication trap: §13.2's read-out has seven columns and does not fit a popover.
- **No ninth chip for issues.** The unreconciled count rides the **Patch** chip, because every
  issue class originates in an ingest; staleness rides **Universes**.
- **Capture's spreadsheet becomes a thing you summon**, not a thing you live in. This is the real
  cost of the decision and it is accepted knowingly.
- **The Pages viewer runs the same shell** with bridge-dependent chips **absent, not greyed** —
  §13 says those signals are *unreachable, not false*, and a greyed control claims "not blind"
  where the truth is "no bridge to ask". A persistent viewer indication in the chrome announces
  the mode, after Showcase's purple border.
- **First run is the empty grid**, not a start screen: §4.6's IndexedDB auto-save means the honest
  normal case is that the app opens where you left it, and a start screen would be a wall in front
  of the thing §01 wants opened fifty times a night.
