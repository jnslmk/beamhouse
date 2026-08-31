# ADR-0001: Resolve GDTF and OFL as fixture-definition formats

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** [#13](https://github.com/jnslmk/beamhouse/issues/13)
- **Informed by:** [#2](https://github.com/jnslmk/beamhouse/issues/2), [#12](https://github.com/jnslmk/beamhouse/issues/12), [#14](https://github.com/jnslmk/beamhouse/issues/14)

## Context

Beamhouse originally assumed GDTF would be its sole fixture-definition format. Three findings
put that under review, and a fourth resolved it in an unexpected direction.

**GDTF availability is real but gated.** The full GDTF Share catalogue — 12,623 revisions,
synced locally in #12 — shows 7 of the 13 fixtures in the reference rig have a usable profile.
Only the GLP impression 90 RGB is genuinely absent, and authoring it is small: four `<Model>`
elements and two `<Axis>` matrices, since real profiles ship no meshes.

**GDTF handles pixel strips after all.** #14 recommended adding OFL because GDTF supposedly had
no working per-pixel strip profile. That was false. `MarkeEigenbau`'s WS2812 profiles (20/30/60px)
carry 30 `GeometryReference` nodes with explicit `Position` matrices at 32 mm spacing and `Break`
offsets of 3 channels per pixel. **#14's load-bearing argument does not survive.**

**But GDTF Share grants no redistribution right.** Its terms are explicit: title stays with the
respective content owner (§36), content may carry separate third-party terms (§37), and the terms
grant no rights to use the content (§38). GDTF profiles also carry no licence field, so
provenance is unstated on every file. Downloads are account-gated.

That collides with a stated goal. §9.2 plans a **bundled library** shipped with the app, and
§01's *Shareable* goal depends on it: a static bundle someone opens with no bridge running.
**Beamhouse cannot legally ship GDTF profiles in that bundle.** OFL is MIT-licensed, ungated and
vendorable.

## Decision

**Resolve GDTF and OFL. Do not resolve QLC+.**

- **GDTF** stays as the primary format. It is the only one with a geometry-tree concept, and it
  covers the rig adequately.
- **OFL** is added as a second definition source — adopted for **licensing and availability**,
  not capability. It is the only format that can legally populate a shipped library or a shared
  static bundle. Its declarative `Matrix{pixelKeys|pixelCount}` and millimetre `matrixPixels.spacing`
  are a genuine bonus for the strip class, but they are not the reason.
- **The bundled library is OFL-only.** Combined with procedural `PrimitiveType` geometry, that
  gets a shared link to right positions, right beam angles and right colours while redistributing
  nothing.
- **QLC+ is rejected as a resolved runtime format.** Its capabilities are a strict subset of
  OFL's — no geometry, no millimetre matrix spacing, no colour space — so a third parser and a
  third id namespace buy no coverage. It remains a **one-time migration source** for the rig
  already patched against `qlc:` ids.

### The seam

Both readers converge on **one internal fixture model**, so the renderer never learns which
format a fixture came from. That model carries exactly two things:

1. a **geometry tree** — nodes with transforms, axis hinges, beam origins, emitter runs
2. **channel bindings** — offset → attribute → physical units

`gdtf-ts` stays free of Beamhouse types (§03) and returns plain GDTF data; a thin adapter maps it
into the internal model, and a second adapter does the same for OFL.

**Mizer's `FixtureDefinition` is explicitly not mirrored.** It is shaped for a console — channels
and faders, not positions and pivots — and its providers discard QLC+ physical data entirely
(`qlcplus/src/definition.rs:29`), model GDTF with no transforms at all, and mismatch the live OFL
schema (`open-fixture-library/src/lib.rs:480`, `:12-16`).

## Consequences

- A second reader must be written. That is real cost against a project whose hardest milestone
  (M4, `gdtf-ts`) is already the first reader. Mitigated by the adapter seam: the second reader
  targets the same small internal model, and OFL is JSON rather than zipped XML.
- **Do not port Mizer's OFL provider.** Write against the live OFL schema.
- Goal #1 is reworded: "any rig, from a patch source plus GDTF **or OFL** profiles."
- **#8 narrows.** Strip detection no longer needs a collinearity heuristic — GDTF ships explicit
  positions and OFL declares layout. What remains is a grouping rule.
- GDTF profiles stay **referenced, not vendored** — `fixtures/gdtf-manifest.json` records rids and
  `gdtf-share.sh restore` rebuilds the library.
- "Moving off QLC+" still holds and is unaffected. QLC+ the *application* and QLC+ the
  *definition library* were always separate questions; conflating them is what made this
  decision look settled when it was not.
