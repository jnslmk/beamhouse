# ADR-0030: GDTFSpec resolves inside the archive, and a `gdtf:` id names a fixture type

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#39](https://github.com/jnslmk/beamhouse/issues/39)
- **Informed by:** [#33](https://github.com/jnslmk/beamhouse/issues/33), [#43](https://github.com/jnslmk/beamhouse/issues/43)

## Context

[ADR-0020](0020-the-live-loop-serves-patch-files-not-consoles.md) makes a patch source admissible
only if it names its definitions in a library Beamhouse resolves. MVR names a `<GDTFSpec>`
filename and a `<GDTFMode>` mode name; Mizer mints `gdtf:<FixtureTypeID>`. #39 asked how the first
becomes the second, and framed it as a fuzzy filename resolving into a sharp id through a ladder:
embedded file, then library by filename, then library by `FixtureTypeID`, then fail.

**Four of #39's five premises are false, and the fifth is upside down.**

### The filename is not a library key

`GDTFSpec` is declared as the MVR type `FileName`, defined normatively as *"The case-sensitive
name of a file **within the archive** including the extension"* (mvr-spec.md:124). The general
format section adds *"If there are no changes to the original GDTF file it is mandatory to keep it
in the MVR during export"* (:91). It is a zip entry path, not a name to match against a library —
so #39's middle two rungs describe a lookup the format does not have.

### The `gdtf:` id is the lossy end, not the sharp one

Measured across all 12,623 revisions in `definitions/gdtf-share-list.json`:

| key | distinct | colliding keys | keys spanning >1 uuid |
| --- | --- | --- | --- |
| `manufacturer@fixture@revision` | 12,622 | **1** | 0 |
| `manufacturer@fixture` | 9,851 | 1,682 | 1 |
| `FixtureTypeID` | **9,852** | — | — |

A spec filename is *sharper* than the id #39 wanted to map it into. **1,681 UUIDs cover more than
one revision** — up to 17, for one Ali Express `Matrix1`. And the loss lands where it hurts: of
those 1,681, **606** have revisions whose mode sets differ and **134** carry *the same mode name at
a different DMX footprint*. So `gdtf:<uuid>` plus a mode name can resolve to two different channel
counts — a silently mis-addressed patch.

CONTEXT.md said *"a `.gdtf` file holds exactly one definition"* while the id scheme let one id name
seventeen files. Both could not hold.

### BlinderKitten does not do what #39 says

`valid = false` fires only when the `GDTFSpec`/`GDTFMode` **elements are absent**
(`BKEngine.cpp:1552`,`1554`). On a definition **miss** it does the opposite (`:1580`–`1591`):
creates an empty `FixtureType` named `"<spec> - <mode>"` and patches the fixture anyway. It also
looks **only** inside the archive — the library fallback #39 attributes to it exists in no importer
on this machine.

### Two things #39 did not see

`GDTFSpec` is `0 or 1` — **optional** — with `GDTFMode` mandatory only when `GDTFSpec` is defined.
And `GDTFSpec` appears on **six** node types: `SceneObject`, `Fixture`, `Truss`, `Support`,
`VideoScreen`, `Projector`. The spec's own examples (`Custom@Robe Robin MMX WashBeam`,
`Generic@TV`) omit the extension its own `FileName` type mandates, which is why BlinderKitten
appends `.gdtf`.

## Decision

1. **A `gdtf:` id names a fixture *type*, and the patch carries a revision hint.** `gdtf:<uuid>`
   stays the resolvable id — Mizer mints it and M5a depends on it — and an **optional revision
   hint** rides alongside, carrying the **last `<Revision>`'s `Text`**. Verified 4 for 4 against
   `gdtf-manifest.json`: that string is exactly GDTF Share's `revision` field (`Release 1`,
   `HR Mode richtig geschrieben`, `TMSv01`, `rev-09`), readable from the file with no network.
   **"Last" means document order, never latest date** — the X4's first two revisions run 12:31
   then 10:31.

   The hint's job is reconciliation, not identity: **nothing resolves, selects or arrays on it**,
   exactly as ADR-0020's MVR fixture UUID hint one level up. It does nothing during the MVR load
   itself; it earns its place when that patch is later saved as a `.bhs` or shared as a snapshot,
   where the archive is gone and `gdtf:<uuid>` meets a library that may hold a different revision.
   A mismatch then renders as *"patched against `rev-09`, library has `for-v16-rev3`"*. Free-form
   and non-unique `Text` is tolerable precisely because it is a hint; a content hash would prove
   two files differ without saying what differs or which is newer.

2. **`GDTFSpec` resolves inside the archive, and nowhere else.** The embedded file *is* the
   definition. A miss is a malformed MVR, surfaced under ADR-0012's rule — never a cue to
   substitute a library definition, which can only fire on a file that already violates the spec
   and would trade a loud error for a silently wrong footprint.

3. **The lookup tolerates exactly two documented malformities, each marked.** Exact match, then
   append `.gdtf`, then case-insensitive. The extension retry because the spec contradicts its own
   examples; the case retry because mvr-spec.md:88 forbids two archive entries differing only by
   case, so the retry is unambiguous by construction. Each fallback surfaces as a provenance mark
   ([ADR-0025](0025-trust-and-provenance-marks-are-additive.md)): the fixture renders, and the mark
   says the file we opened was not the file we were asked for.

4. **The resolver is node-agnostic.** It takes any node carrying a `GDTFSpec`. *Which* of the six
   node types Beamhouse patches, renders or ignores is
   [#43](https://github.com/jnslmk/beamhouse/issues/43)'s question, not this one.

5. **`GDTFMode` resolves on the same shape of ladder, and never guesses.** Exact, then
   case-insensitive, then — **only if the file offers exactly one mode** — that mode, marked. Past
   that it is unresolved: the fixture stays in the patch, placed and rendered, marked, **with no
   DMX binding**. Falling back to the first of several modes would be the 134-collision defect in a
   new costume. Demoting the fixture would discard its address, which is the one thing the operator
   can cross-check against their console.

6. **A `Fixture` node with no `GDTFSpec` is not a patchable fixture.** There is nothing to render —
   no geometry, no beam angle, no emitter count, the self-contradiction #27 already corrected §9.2
   for. It is surfaced and handed to #43's population of positioned objects. Minting a placeholder
   definition from placement data is ADR-0012's rule pointed the wrong way.

7. **Nothing is persisted into the library. An MVR is a self-contained patch source.**
   `gdtf-manifest.json` is a lockfile keyed by GDTF Share `rid`, and an MVR-extracted file **has no
   `rid`** — it could be neither pinned nor restored, so caching it would put an unmanaged,
   unprovenanced file into a directory gitignored precisely because provenance there is unstated
   ([ADR-0001](0001-gdtf-and-ofl-as-definition-formats.md)). ADR-0020's live loop re-reads a watched
   MVR on change, so a cache buys nothing the loop does not already do, and §9.2 already solved the
   downstream case — a recipient without the definition degrades through bundled definitions, then
   proxy geometry, then drag-and-drop.

8. **The seam is where ADR-0004 already put it.** Decision 6 reads *"an MVR reader can pull an
   embedded `.gdtf` out of the outer zip and hand the bytes over with no coupling"*, and decision 2
   makes the `gdtf-ts` entry point take a `Uint8Array`. The `mvr` parser owns the archive lookup
   and the two tolerance retries; `gdtf-ts` owns bytes → definition, and must expose the last
   revision's `Text` for (1). Nothing here amends ADR-0004; #39 asked a question its own citation
   answers verbatim.

## Consequences

**An MVR needs no library at all.** That is the property that lets a dropped `.mvr` work in the
M3a phone viewer, where there is no library to have — and it is worth defending against any future
proposal to add a library rung to (2).

**The Mizer path keeps the ambiguity.** A hint carries only what the source knew, and Mizer mints a
bare `gdtf:<uuid>` with no revision anywhere in `conversion.rs`. So the 134 same-name-different-
footprint cases stay latent on the M5a path. This ADR bounds the defect on the MVR side; it does
not eliminate it. The honest statement is that a Mizer patch resolves to *some* revision of the
right fixture type, and Beamhouse cannot tell which one the operator patched against.

**ADR-0010's totality begins after mode selection.** *"Resolution is total and mechanical"* is
scoped to resolving every `ChannelFunction` within a mode; decision 5 shows mode selection is
itself not total, and gives the non-total outcome a defined shape. ADR-0010 is unamended — its
boundary is now stated rather than assumed.

**CONTEXT.md gains a term and loses an overstatement.** **Revision** is new. **Definition** drops
*"a `.gdtf` file holds exactly one definition"* as an identity claim. **Mode** and **Patch** admit a
fixture whose mode did not resolve. **Library** notes that an MVR supplies definitions out of its
own archive rather than through a prefix.
