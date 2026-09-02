# ADR-0003: The integer fixture id is a fixture's only identity

- **Status:** Accepted
- **Date:** 2026-09-01
- **Source:** the `/domain-modeling` session that established `CONTEXT.md`
  ([`ae1beeb`](https://github.com/jnslmk/beamhouse/commit/ae1beeb)) — no wayfinder ticket
  asked this; it fell out of naming **Fixture** and **Override**.
- **Amended by:** [ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md) (2026-09-02)

## Context

Beamhouse merges a patch it does not own (Mizer's project YAML, or an MVR file) with placement
it does own, so it needs a key that survives a re-read of the patch. MVR carries a UUID and a
`FixtureID`; Mizer's `FixtureConfig.id` is a plain integer and there is no UUID anywhere in its
project file. The integer id is therefore the only key **both** patch formats can supply, and it
is what an operator reads off the console, so it is the sole identity: overrides, array members
and selections all key on it.

> **[Amended 2026-09-02 by [ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md)]**
> Two sentences above are wrong, and the decision survives both.
>
> **"there is no UUID anywhere in its project file"** is false. `fixture: "gdtf:<id>"` *is* a
> UUID — Mizer builds `format!("gdtf:{}", fixture_type.fixture_type_id)` from the GDTF
> `FixtureTypeID` (`conversion.rs:13`), as
> [`obf26-definition-migration.md:548`](../research/obf26-definition-migration.md) already
> recorded. It is a *definition-type* UUID, not a per-fixture instance one, so the substance —
> no instance UUID to key an override on — holds.
>
> **"the only key both patch formats can supply"** is optimistic. In MVR the mandatory key is
> the **UUID** (`pymvr`: `uuid: str`, generated if the file omits it); `FixtureID` is
> `Optional[str]` — an *optional string* — with `FixtureIDNumeric` a separate optional integer.
> MVR is not obliged to supply an integer id, and when it does it is free text. ADR-0020 adds
> the ingest ladder and the reconciliation hint that make this survivable.

## Decision

The integer fixture id is a fixture's only identity. Overrides, array membership and
selections all key on it. No UUID, no synthetic key, no name.

## Consequences

Renumbering a fixture in the console orphans its override and silently drops it from any array —
the same failure a UUID scheme would avoid. Accepted, because a UUID scheme cannot be built at
all against a Mizer patch. A `.bhs` therefore reads as integers rather than names, which is worse
to hand-edit; that is the price.

> **[Amended 2026-09-02 by [ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md)]**
> The accepted failure is now bounded on the MVR side. On ingest the id comes from an explicit
> ladder — `FixtureIDNumeric` → `FixtureID` parsed as an integer → `UnitNumber` → synthesised —
> and a **synthesised id is loud, never silent**. The MVR **UUID is persisted alongside the
> override** as a re-import reconciliation hint, so a re-import of a file that omits `FixtureID`
> can re-key instead of orphaning every override. The hint never becomes an identity: nothing
> resolves, selects or arrays on it. The console-renumbering failure this ADR accepted is
> unchanged — no UUID exists on the Mizer side to fix it with.
