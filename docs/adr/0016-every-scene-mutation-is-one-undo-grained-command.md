# ADR-0016: Every scene mutation is one undo-grained command, and the UI and the agent are two front-ends onto it

- **Status:** Accepted
- **Date:** 2026-09-02
- **Surfaced by:** [#5](https://github.com/jnslmk/beamhouse/issues/5)

## Context

[ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md) settled how an agent's
scene commands *arrive*. This settles what they *are*, and it has to be settled now rather than
later because [#35](https://github.com/jnslmk/beamhouse/issues/35) is about to design the UI.

§4.4 lists four editing affordances — gizmo translate/rotate, numeric entry, parametric array
generators, multi-select align and distribute — and #35's own finding is that they are *"the only
description of the screen anywhere in this document"*, with *"the override layer, this design's
most load-bearing idea, invisible."*

The question is whether the agent gets its own path into scene state, or shares the UI's.

## Decision

**One command layer. The UI and the agent are two front-ends onto it, and no scene mutation
happens by any other route.**

**A command is undo-grained: one command = one undo entry = one thing a person would say out
loud.** A drag is *one* command committed on release, not `begin`/`update`/`end`. If a mutation is
not worth its own undo entry, it is not a command.

## Considered options

- **A parallel agent path** straight into scene state. Cheaper, and it lets the agent move before
  the UI exists. Rejected on the recovery scenario: an agent rotates the wrong five spokes and you
  need Ctrl-Z, not a debugging session. Undo belongs to whatever the gizmo goes through, so an
  agent outside that layer produces edits that cannot be undone — and, over time, scene states the
  UI cannot display.
- **Mirroring a drag-grained layer 1:1 as MCP tools.** The two front-ends pull opposite ways: a UI
  wants fine steps, an agent wants task steps (*"rotate these five 180° about their own
  mid-points"*). Undo-graining resolves the tension rather than splitting the layer, because the
  undo unit and the sentence unit are the same unit.

## Consequences

- **This constrains [#35](https://github.com/jnslmk/beamhouse/issues/35)**: the UI is designed on
  top of a command layer rather than directly against scene state. Retrofitting that after §4.4's
  affordances exist is the expensive version, which is why it is recorded before #35 runs.
- **The MCP tool vocabulary is not a separate design.** It is whatever the command layer holds,
  so the tools cannot drift from the UI's capabilities.
- **The command layer lands in M3**, with the scene editor — not in M3b with the agent surface.
- Q11's non-owning clients get a clean unit to observe, if they are later made to follow along.
- Undo is now load-bearing rather than a nicety, and `.bhs` persistence (§4.6) saves the *result*
  of commands, keeping [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)'s
  "placement mints nothing" true of the agent path as well as the human one.
