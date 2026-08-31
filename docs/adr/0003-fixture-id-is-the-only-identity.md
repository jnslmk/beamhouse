# The integer fixture id is a fixture's only identity

Beamhouse merges a patch it does not own (Mizer's project YAML, or an MVR file) with placement
it does own, so it needs a key that survives a re-read of the patch. MVR carries a UUID and a
`FixtureID`; Mizer's `FixtureConfig.id` is a plain integer and there is no UUID anywhere in its
project file. The integer id is therefore the only key **both** patch formats can supply, and it
is what an operator reads off the console, so it is the sole identity: overrides, array members
and selections all key on it.

## Consequences

Renumbering a fixture in the console orphans its override and silently drops it from any array —
the same failure a UUID scheme would avoid. Accepted, because a UUID scheme cannot be built at
all against a Mizer patch. A `.bhs` therefore reads as integers rather than names, which is worse
to hand-edit; that is the price.
