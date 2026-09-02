# ADR-0026: The control channel carries requests, and only one of the four classes is a command

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#37](https://github.com/jnslmk/beamhouse/issues/37)
- **Amends:** [ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md), [ADR-0016](0016-every-scene-mutation-is-one-undo-grained-command.md)

## Context

[ADR-0016](0016-every-scene-mutation-is-one-undo-grained-command.md) closed with *"the MCP tool
vocabulary is not a separate design — it is whatever the command layer holds"*, and
[#37](https://github.com/jnslmk/beamhouse/issues/37) inherited that sentence as its premise.

**The premise is wrong, and it is wrong on #37's own acceptance case.** That case reads:
*"enumerate the rig, build a ten-member radial array, rotate five members 180° about their own
mid-points, capture."* The first verb is a **read** and the last is a **screenshot**. Neither
mutates scene state, so neither is a `Command` under ADR-0016 or under `CONTEXT.md`, which defines
one as *"one undo-grained mutation of the scene"* and bans `action`, `operation`, `edit`,
`mutation` and `transaction` as synonyms.

The word had already split without anyone noticing. ADR-0015 point 6 says *"capture is a
first-class **command**"*; `CONTEXT.md`'s **Control channel** entry says the channel carries *"the
**command** envelopes an agent sends"*. Both mean *envelope*. ADR-0016 means *undo unit*. The tool
vocabulary is strictly **larger** than the command layer, and no document said by how much.

Two further questions could not be answered while the word was ambiguous. **What a command's
target is** — §14.4 gives fixtures and objects one shared selection space, so `move(selection)`
would make the agent mutate a selection it cannot see, and selection is not a scene mutation.
And **whether an ingest is a command** — the History artboard lists `Read patch warehouse.yml`
and `Import stage-left.mvr` in the same timeline as `Move Mover MR`, under the undo cursor.

## Decision

**The control channel carries *requests*. There are four classes and only `command` is the
command layer.**

| Class | Mutates | Undoable | Examples |
| ----- | ------- | -------- | -------- |
| `command` | the scene | **yes** | `move`, `rotate`, `array.set`, `define` |
| `query` | nothing | no | `rig.list`, `issues.list`, `select`, `undo`, `camera.set`, `hold` |
| `capture` | nothing | no | renders and returns a handle ([ADR-0028](0028-a-capture-is-a-handle-fetched-over-http.md)) |
| `look` | the **feed** | no | sets the `generated` frame ([ADR-0014](0014-the-agent-surface-is-two-surfaces.md)) |

Three rules follow, each answering one of the questions above.

1. **A command carries its target ids explicitly.** The selection is a UI-side *input* that fills
   them at commit time, never part of the command. So is the snap step: the agent passes exact
   values and never inherits the human's grid silently.
2. **Commands write everything in the `.bhs` except `patch`; ingests write only `patch`.** Two
   writers, disjoint targets. Undo therefore covers the override layer, the definitions, the
   arrays and the objects — and never tries to rewind a file read.
3. **One undo stack, shared by both front-ends, with agent-driven rows marked.**

**The History tab is a journal with two row kinds** — commands, where the undo cursor stops, and
**events**, which are ingests. The canvas already draws them differently; this is what the
difference means.

## Considered options

- **One word, accepting that some "commands" earn no undo entry.** Cheapest, and it guts
  ADR-0016's definition — the one three documents and a glossary `_Avoid_` line already depend on.
- **Renaming ADR-0016's unit and leaving `command` as the envelope.** Same information, and it
  invalidates every existing reference to the sharp meaning to protect the vague one.
- **Ingests as commands.** Rejected on §4.6's watcher: it fires ingests **without anyone asking**,
  so a colleague's file save would push an entry onto your undo stack, and ⌘Z would roll the patch
  back to bytes we never kept while the file on disk has moved on.
- **A stack per front-end.** Makes *"undo the last thing that happened"* unanswerable, which is
  the only question anyone asks at 4pm — ADR-0016's own motivating scenario.

## Consequences

- **ADR-0016's closing sentence is narrowed, not reversed.** *"The tools cannot drift from the
  UI's capabilities"* now holds exactly of the `command` class, and stops over-claiming of the
  other three. §14's *"anything it omits the agent cannot do either"* is likewise a statement
  about commands.
- **Rule 2 is a new invariant on the `.bhs`, and it is §4.5 generalised.** That section's whole
  argument is that the patch and the override layer are separate writers; this states it as a
  rule and hands the second editor the same guarantee. It also fixes what undo is *for*: the
  evening of positioning §4.5 calls the thing worth saving.
- **`undo` and `redo` are queries, not commands.** They move the cursor and earn no entry, or the
  stack could never be emptied. This is the one place where "the tools are the command layer" is
  false in the useful direction.
- **Rule 1 makes an undo entry self-describing.** `Rotate 5 spokes 180°` names its five ids, which
  is what the History rows render — they could not, if the target were an ambient selection.
- **`CONTEXT.md` gains `Request`, `Query` and `Journal`**, and **Command** gains rule 2. The
  **Control channel** entry's *"command envelopes"* is corrected to *"request envelopes"* — the
  bridge still never opens one, so ADR-0006's ignorance is untouched by the rename.
- **The four request classes are one MCP server**, not two. ADR-0014 split the agent surface in
  two, but the split is in what the requests *reach*, not in how they arrive: a capture is
  worthless if the rig is dark, so specifying `capture` without `look` would have shipped half a
  tool.
