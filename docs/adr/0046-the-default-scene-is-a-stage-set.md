# ADR-0046: The default scene is a stage set, not three cubes

- **Status:** Accepted
- **Date:** 2026-09-08
- **Source:** grill-with-docs session, 2026-09-08
- **Confirms:** [ADR-0034](0034-an-unresolved-definition-is-a-marked-fixture-not-a-missing-one.md), [ADR-0035](0035-a-scene-object-is-a-fixture-with-an-empty-dmx-mode.md), [ADR-0031](0031-a-share-link-carries-resolved-definitions.md), [ADR-0038](0038-bhs-binds-one-way-through-a-local-fixture.md)

## Context

The reference rig opened on three 1.35 m `bhs:reference-cube` placeholders (fixtures 1–3,
universe 1, slots 1–3) plus the ten STAR-TENT spokes. The cubes proved the live feed end to
end and nothing else: on a first open, Beamhouse showed boxes, not a rig. The spokes stay;
the cubes are replaced by a stage the rig plays on — five BÜTEC 2×1 m decks, a truss
goalpost, one singer — and by hung conventional fixtures on the same three slots, so every
existing sACN feed keeps driving visible light with no remapping.

## Decision

1. **Fixtures 1–3 are hung authored-tungsten conventionals, one dimmer channel each, on
   universe 1 slots 1–3.** PAR38, generic profile, E27 practical — the definitions ADR-0038
   rule 5 already authored. They throw real Wash/Spot/Glow beams with tungsten white points
   instead of glowing white boxes, and the slot contract the cubes established is unchanged.
2. **The stage is scene objects, all dark.** Five BÜTEC decks (2.00 × 1.00 m, 0.6 m legs,
   90 mm alu frame, 22 mm top, per the manufacturer), a 6 m truss span on two 4 m towers, one
   blocky singer center-stage. Empty mode, no addresses, never emitting — ADR-0035/0036 hold
   verbatim.
3. **Meshes arrive two ways, both behind proxy extents.** The deck builds procedurally in the
   mesh builder (a deck is a box with legs; a GLB buys nothing). Truss and singer are
   vendored GLBs, loaded async and cloned per fixture; the `bhs:` definition still declares
   only the overall extent, so validation, framing and shares never learn about files.
4. **The house GDTFs boot-register from vendored copies.** `app/src/stage/` carries the three
   ~1.5 KB authored files; the browser fetches, parses and registers them before the first
   sync, so the default scene resolves with no library and no bridge — static hosting
   included. A failed fetch degrades to ADR-0034 marks, never a blank rig.
5. **`bhs:reference-cube` is deleted, no shim.** Saved scenes and shares that name it lose
   those fixtures on load. The reference rig is documented placeholder content, not user
   data; carrying a dead definition forever is compat weight v1 just finished shedding.
6. **Quaternius is rejected after its 2026-08-28 relicense** (QAL v1.0 forbids standalone
   redistribution, which is exactly what vendoring is). The singer is Kenney direct (CC0);
   the truss is Poly Pizza CC-BY with the attribution pinned next to the file.

## Considered options

- **Procedural everything.** Cheapest, no licenses to pin — and what the deck does. Rejected
  for truss (a lattice is the one shape painful to hand-model) and singer (must read as a
  person, ADR-0035's honesty rule cuts the other way here: a person-shaped proxy, not a box
  with a name).
- **Keep the lights as `bhs:` cylinders.** Zero new infrastructure and the same slot
  behaviour — but no beams, no tungsten, and it invents a second set of conventional
  definitions beside the authored ones. The `?url` boot registration is ~20 lines and works
  everywhere the bundle loads, so the authored files win.
- **GLB drag-and-drop import first** (the deferred ADR-0035 path) with the default staying
  boxes until a drop. Correct sequencing for user meshes, but the default scene should not
  wait on it; vendored files with pinned licenses close the gap now.

## Consequences

- The reference panel's "Live cubes" becomes "House rig"; the browser suite's pinned cube
  positions move to the hung placements.
- Share payloads resolve the house fixtures through the registry like production boot does
  (the share test seeds the same three files).
- The `app/src/stage/` convention is now: mesh or boot definition plus a license pin per
  file, low-poly only — the single-file build inlines nothing, but every vendored byte
  still ships to every viewer.
- Future user meshes still want the deferred drag-and-drop; this ADR's `defineStageMesh`
  seam (template per definition id, clones per fixture, survives re-sync) is the hook it
  hangs off.
