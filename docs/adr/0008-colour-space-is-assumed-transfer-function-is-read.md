# ADR-0008: Colour space is assumed, the transfer function is read

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decides:** [#9](https://github.com/jnslmk/beamhouse/issues/9)

## Context

`DESIGN.md` §8.3 resolves `ColorAdd_R/G/B` and stops, and §11.2 records the open question as
*"v1 assumes linear sRGB — note every place the assumption is made so correcting it is not
archaeology"*.

**"Linear sRGB" is two assumptions wearing one name**, and they fail differently:

- **Colour space** — which real-world colours `R`, `G`, `B` name (primaries + white point). Getting
  this wrong is a mild, uniform gamut error.
- **Transfer function** — whether a channel value is proportional to radiance. Getting this wrong
  is a visible brightness error that peaks at half-intensity and is compounded by tone mapping.

Fused, they cannot be reasoned about separately, and the cheap one drags the expensive one along.

### What GDTF actually declares

`<ColorSpace>` carries `Mode` ∈ `Custom | sRGB | ProPhoto | ANSI`, `<Gamut>` carries a CIE polygon,
and `ChannelFunction` has three optional links — `ColorSpace`, `Gamut` and `Emitter`. So the
metadata the ticket suspected does exist.

**But `Mode` defaults to `sRGB`.** An absent `<ColorSpace>` is not "unspecified", it is *specified
as sRGB*. Assuming sRGB primaries is therefore agreeing with the spec, not overriding it.

The transfer function is a different story. Measured against our own authored profile
(`definitions/authored/GLP@impression 90 RGB/description.xml`):

| attribute | `PhysicalUnit` | `PhysicalFrom` → `PhysicalTo` |
| --- | --- | --- |
| `Dimmer` | `LuminousIntensity` | 0.0 → 1.0 |
| `ColorAdd_R/G/B` | `ColorComponent` | 0.0 → 1.0 |
| `Pan` | `AngleDeg` | -330.0 → 330.0 |
| `Tilt` | `AngleDeg` | -150.0 → 150.0 |

`Dimmer` carries a **photometric** unit, so `0 → 1` in luminous intensity states outright that the
dimmer is linear in radiance. That is declared, not assumed. `ColorAdd_*` carries
`ColorComponent`, which is **dimensionless and photometrically undefined** — `0.5` could be half
radiance or half perceptual brightness, and the format does not say.

The assumption is therefore far narrower than §11.2 claims: not "colour handling", but a single
interpretation of a single unit.

### What the renderer already assumes

three.js has made half the decision already. Since r152 `ColorManagement.enabled` is `true` by
default, the working space is **Linear-sRGB**, and `WebGLRenderer.outputColorSpace` defaults to
**sRGB**. A `DataTexture`/`FloatType` is annotated `NoColorSpace`, so its contents pass through
*as if* working-space linear — silently correct or silently wrong, with nothing at the call site
saying which. §8.1's strip path and §8.2's additive beam blend agree today only by coincidence.

### What the rig contains

Of the 13 fixtures in OBF26_Bunte-Stube: six impression 90s on the authored profile (#19, no
`<ColorSpace>`), the dimmer packs on OFL — which has **no colour-space concept at all** — the four
tubes being re-patched under [#23](https://github.com/jnslmk/beamhouse/issues/23), and one
third-party GDTF hazer. ADR-0001 converges GDTF and OFL onto one fixture model, so a `colorSpace`
field on that model would be permanently null for every OFL fixture.

The 12,623-revision library from [#12](https://github.com/jnslmk/beamhouse/issues/12) is
gitignored and was not available when this was decided, so the third-party hazer's declaration is
**unverified**. The spec default makes this cheap: absent metadata and sRGB metadata are the same
answer, and only a `ProPhoto`, `ANSI` or `Custom` declaration would contradict this ADR.

## Decision

1. **Split the assumption in two, and record only one of them as an assumption.** Primaries are
   assumed sRGB/Rec.709, matching the spec default — not a v1 risk. The transfer function is the
   assumption that gets marked and carried.
2. **Read the declared `PhysicalFrom`/`PhysicalTo` mapping wherever the `PhysicalUnit` gives it
   meaning.** `Dimmer` in `LuminousIntensity` is linear in radiance because the file says so.
   Assuming linearity where it is *declared* is not conservative, it is a discarded fact — and the
   same code path drives `Pan` at `-330..330`, where ignoring the declared mapping does not dim a
   fixture slightly, it points it at the wrong place. The general form of this is
   [#25](https://github.com/jnslmk/beamhouse/issues/25).
3. **The one assumption v1 makes is: `ColorComponent` 0..1 is proportional to radiance.** One
   sentence, one site, the only place GDTF is genuinely silent.
4. **The seam is a type, not a comment convention.** `resolveColor()` is the sole minter of a
   branded `LinearRGB`, and every colour consumer takes that type. A future non-linear path cannot
   silently skip conversion, and enumerating the assumption sites becomes a compiler output rather
   than a grep. A `// ASSUMES:` marker convention was rejected precisely because it relies on
   discipline at each *new* call site — which is the archaeology §11.2 warns against, deferred
   rather than avoided.
5. **`gdtf-ts` parses and exposes `ColorSpace`, `Gamut` and `Emitter`; the Beamhouse fixture model
   omits the field entirely in v1.** Dropping data at parse time is the irreversible mistake, and
   ADR-0004 makes `gdtf-ts` a GDTF-complete library with its own users. The field's *absence* from
   the converged model is what makes "assume sRGB" structural rather than a matter of discipline —
   there is nothing to consult, so nothing can half-consult it.
6. **`ACESFilmicToneMapping` stays on from day one**, per §8.2 — the retrofit-and-retune argument
   holds. The risk was never ACES, it is ACES on unconverted input, so the ordering is pinned as a
   spec acceptance criterion: DMX → linear radiance happens in `resolveColor`, **before** anything
   reaches the tone mapper.
7. **The strip and beam paths agree by construction.** Both consume the same `LinearRGB` from
   `resolveColor`, and the strip's `DataTexture` is **explicitly** annotated
   `LinearSRGBColorSpace` rather than left to default. An explicit annotation that happens to match
   the default is the cheapest available documentation of an assumption, and it converts a silent
   default into a deliberate one.

## Consequences

- The recorded assumption shrinks from "v1 assumes linear sRGB" to one interpretation of one
  dimensionless unit — small enough to state in a sentence and defend, rather than a blanket
  caveat nobody can act on.
- Correcting it later is a type error at every affected site, not a search. The `LinearRGB` brand
  is the enumeration §11.2 asked for.
- v1 gains work it would otherwise have skipped: `PhysicalFrom`/`PhysicalTo` resolution is now
  required rather than optional. This is a net win — `Pan`/`Tilt` needed it regardless, and #25
  now owns it explicitly instead of surfacing during M4 as a pointing bug.
- `gdtf-ts` carries colour-space parsing that Beamhouse does not consume. Intentional: the package
  is GDTF-complete by ADR-0004, and the unused surface is what makes honouring colour space later
  a Beamhouse-side change alone.
- The third-party hazer profile remains unverified against the library. Cheap to close once the
  library is restored, and only a non-default `Mode` would reopen this.
- `DESIGN.md` §8.3 and §11.2 need amending; §11.2 is answered.
