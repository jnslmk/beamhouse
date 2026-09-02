# ADR-0020: The live repatch loop serves patch files, not consoles

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#33](https://github.com/jnslmk/beamhouse/issues/33)
- **Amends:** [ADR-0003](0003-fixture-id-is-the-only-identity.md)

## Context

`DESIGN.md` was written around one console. §4.2 read Mizer's project YAML as *the* patch source,
§01 stated the pair outright — "Mizer is the control surface; Beamhouse is the preparation
visualiser" — and ADR-0003 picked the integer fixture id **because Mizer has no UUID**. #33 asked
whether that stays one console, and what widening would cost.

Its framing did not survive measurement. Three consoles are reachable on this machine, not one,
and what they can actually do reverses the ticket's central claim.

### Three consoles, measured

| Console | MVR in | MVR out | What it does export |
| --- | --- | --- | --- |
| Mizer | none at all | none | `export_csv()` |
| BlinderKitten | `importMVR` | **none** | its own JSON |
| MagicQ 1.9.8.3-beta | `libMVRgdtf`, read-only | **none** | a CSV patch list |

- **Mizer** — `PatchExporter` exposes exactly `new()` and `export_csv()`
  (`crates/components/fixtures/patch-export/src/lib.rs:13`); a grep for `mvr` across every `.rs`,
  `.toml` and `.proto` returns zero files. Already recorded in §4.1.
- **BlinderKitten** (`~/git-projects/BlinderKitten`, `effdcf6e`) — `BKEngine.h:124` declares
  `importMVR(File f)`. There is **no export**. `exportSelection()` (`BKEngine.cpp:973`) writes its
  own manager JSON. A grep for `.mvr` across `Source/` returns exactly one hit: the *file-open*
  filter at `BKEngine.cpp:911`.
- **MagicQ** (`/opt/magicq`, package `magicq-beta 1.9.8.3-1`) — its shipped manual dated
  2026-05-26 has a section titled **"MVR File Import"** and no export counterpart anywhere in
  ~31,000 lines; it notes "importing scene objects is not supported". `bin/mqqt` statically links
  Vectorworks' own **`libMVRgdtf`** (built at `/builds/chamsys/magicq/3rdparty/libMVRgdtf/`), but
  only its *read* symbols are present — `SceneDataExchange::ReadFromGeneralSceneDescription`,
  `SceneDataFixtureObj::OnReadFromNode`, `OpenForRead`. There is no write path. The `/MVR_Export`
  string is the temp **extraction** directory for import: it sits in the string table between
  `MVR - extracting data from %1`, `Importing MVR file` and `.gltf`/`.glb`. MagicQ speaks **no
  MVR-xchange** — the `exchange` hits are `libMVRgdtf`'s own `SceneDataExchange` class, Assimp's
  IFC schema and Qt signals. Its real export is a CSV patch list (`EXPORT HEADS`), and its manual
  recommends CSV for importing from **Depence**, a visualiser.

**Not one console reachable here writes an MVR.** That falsifies the claim §4.3 had been given by
this ticket's own framing — *"every console that exports MVR is a supported patch source today"*.
Measured against every console on this disk, that set is **empty**. MVR is a format consoles
**read**, and design/previz tools **write**.

### Why watching a second project file does not work either

The ticket assumed the live loop is Mizer-only because it "rests on a file on the same disk, and
no other console writes one". Also false: BlinderKitten writes `workFile.olga`, plain JSON, with a
`fixture` manager holding `/id`, `/name`, `/fixtureType` and a `patch` container carrying
`/address`. Watching it is mechanically identical to watching Mizer's YAML.

It fails for a different and more decisive reason: **the file is not resolvable.**
`/fixtureType` points at a **project-internal** type (`/fullko`), and the `fixtureType` block is
self-contained channel lists — zero occurrences of `gdtf`, `ofl` or `uuid` in the whole of it. Its
GDTF importer *flattens* a profile into BlinderKitten's own channel model and discards the
definition identity. MagicQ does the same: "MagicQ will use its own **head files** for a fixture".

Consuming either would mean a fourth resolver for a console's private channel model — exactly what
[ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md) refuses to do for QLC+, on the same
grounds.

Two further traps in the `.olga`, recorded so nobody rediscovers them: OrganicUI **omits
default-valued parameters**, so fixture 1 has no `/id` key at all; and **universe is absent from
the patch**, which carries only `/address` plus an `/interface` reference.

### What this does to ADR-0003

ADR-0003's exposure to the UUID question is **not** created by widening. MVR import already ships
in M5b, so it is live today, and three findings bear on it.

1. **A second console independently made the same choice.** BlinderKitten's MVR importer keys on
   `HashMap<int, Fixture*>` from `<FixtureID>` (`BKEngine.cpp:1557`–`1571`), **ignores the UUID
   entirely**, falls back to `<UnitNumber>`, then synthesises from 1000. The one shipping MVR
   importer on this machine throws away the UUID ADR-0003 is supposedly wrong to decline.
2. **But MVR's mandatory key is the UUID, and `FixtureID` is not.** Per `pymvr` — the reference
   implementation §4.3 names — `uuid: str` is always present and is *generated* if the file omits
   it, while `fixture_id: Optional[str]` is an **optional string**, with `fixture_id_numeric:
   Optional[int]` a separate field. ADR-0003's "the one key both patch formats can supply" is
   therefore optimistic: MVR is not obliged to supply it, and when it does it is free text.
   BlinderKitten's fallback ladder is what that looks like in production.
3. **ADR-0003 contains a false sentence.** "there is no UUID anywhere in [Mizer's] project file" —
   but `fixture: "gdtf:<id>"` **is** a UUID. Mizer builds `format!("gdtf:{}",
   fixture_type.fixture_type_id)` (`conversion.rs:13`), and this repo's own
   [`obf26-definition-migration.md:548`](../research/obf26-definition-migration.md) already records
   it as the GDTF `FixtureTypeID` UUID. It is a *definition-type* UUID, not an instance UUID, so
   the substance survives and only the wording is wrong.

## Decision

**Beamhouse names no console list. The live repatch loop serves any patch file that**

1. **sits on a watchable path, and**
2. **names its definitions in a library Beamhouse resolves** — `gdtf:`, `ofl:` or `bhs:`
   ([ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md),
   [ADR-0012](0012-beamhouse-may-define-pixels-placement-mints-nothing.md)).

Mizer is the only source that passes today. BlinderKitten and MagicQ fail on (2), not on (1). That
is a **fact about consoles, not a limit of Beamhouse**, and it is the honest form of "Beamhouse
serves one console".

### Also decided

1. **MVR import is the second door, and it serves design and previz tools** — Vectorworks,
   BlenderDMX, Depence, Capture — not consoles. §4.3 says that instead of the claim about consoles
   that measured empty. Two doors, two populations.

2. **ADR-0003 stands, amended.** The integer fixture id remains a fixture's only identity. On MVR
   ingest the id is derived by an explicit ladder:

   `FixtureIDNumeric` → `FixtureID` parsed as an integer → `UnitNumber` → synthesised.

   A **synthesised id is loud, never silent** — it is surfaced the way ADR-0012 surfaces an extent
   mismatch, because a quietly invented identity orphans overrides on the next import.

3. **The MVR UUID is persisted alongside the override as a re-import reconciliation hint, and
   never becomes an identity.** Without it, re-importing an MVR that omits `FixtureID`
   resynthesises different integers and silently drops every override — the exact failure §4.5
   calls "what makes the whole import path survivable". With it, a re-import can re-key. It is a
   hint: nothing resolves, selects or arrays on it.

4. **§01's *Coexists* goal keeps its same-laptop assumption, bound to the live loop only.**
   Condition (1) above *is* that assumption. MVR file import never had it and is machine-agnostic
   already; [ADR-0009](0009-deployment-is-inferred-from-origin.md)'s origin inference plus §9.4's
   fragment override already cover the LAN case.

5. **M5b is re-targeted to BlenderDMX.** Its done-when read *"A rig exported from BlinderKitten
   loads, overrides merge cleanly"* and was **unsatisfiable** — the same defect shape
   [ADR-0013](0013-atmosphere-is-one-closed-form-scattering-term.md) found in M6. BlenderDMX
   exports MVR via `pymvr` and is the only MVR *writer* reachable on this machine, which keeps the
   milestone measurable.

6. **The Drivers row loses BlinderKitten**, becoming `Mizer · gled2 · WLED`. It was never a driver
   — nothing in Beamhouse consumes it — and it was listed only because of the false MVR-export
   claim. BlinderKitten and MagicQ are recorded as **reference implementations**, and MagicQ
   additionally as an **M4 conformance instrument**: it carries Vectorworks' own `libMVRgdtf`, the
   canonical implementation `gdtf-ts` is reimplementing, the way #26's WLED Peek readback is an
   oracle for the strip class.

7. **[#30](https://github.com/jnslmk/beamhouse/issues/30) is unblocked**, and its recommendation is
   **strengthened rather than evaporated**. The ticket feared that widening past Mizer would
   destroy its "no station on the other end" argument. The opposite happened: of MVR-xchange's six
   named peers, **only grandMA3 is a console** — the rest are design tools — and neither of the
   other two consoles measured here speaks the protocol either. #30 keeps the patch-source
   interface question; this ADR gives it the admission criterion and declines to draw the seam
   itself, because [ADR-0009](0009-deployment-is-inferred-from-origin.md) deleted `relay` precisely
   for being an interface nothing had defined.

### Considered and rejected

- **"MVR becomes the spine, Mizer the special case."** Rejected: nothing writes an MVR
  continuously, so it cannot carry a *live* loop at all. It is an import format.
- **A defined patch-source interface, minted here.** Deferred to #30, which is chartered for it.
- **Widening to a named second console.** Rejected on measurement: both candidates on this machine
  fail condition (2), and consuming them means a private-channel-model resolver ADR-0001 rejects.
- **Superseding ADR-0003 with a UUID identity.** Rejected: MVR's UUID is mandatory but Mizer has
  no instance UUID at all, so a UUID scheme still cannot be built against the one source that
  passes the predicate. Decisions 2 and 3 buy back the failure mode without splitting the key.

## Consequences

- §4.3's "every console that exports MVR is a supported patch source today" is deleted. It was
  added on 2026-09-02 by this ticket's own framing and measured false the same day.
- **A resolution rule is now owed and does not exist.** Condition (2) leans on it: MVR names a GDTF
  **spec filename** (`GDTFSpec`), Mizer names a **`FixtureTypeID` UUID** (`gdtf:<uuid>`) — two
  different keys into the same library, and nothing in the repo says how one becomes the other. The
  file may not be in the zip, the name may not match any profile on disk, and two profiles can
  share a filename across revisions. Graduated to its own ticket rather than settled in a clause
  here; it is a resolver rule sized for M4/M5b, not a scoping decision.
- The override layer gains a nullable `uuid` field per entry. `.bhs` grows one key; nothing reads
  it except MVR re-import.
- The predicate is testable, and this ADR ran it three times. Any future "does Beamhouse support
  console X" question is answered by opening X's project file and looking for a resolvable
  definition id — not by discussion.
- BlinderKitten's MVR matrix→Euler derivation contradicts its own comment — the code computes
  `asin(matVals[2])` where the comment beside it says `arcsin(−r31)`. Noted only: it is a third
  data point for the unsettled rotation convention in
  [#20](https://github.com/jnslmk/beamhouse/issues/20), and no reason to trust it as a reference.
