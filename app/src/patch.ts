import { parse as parseYaml } from "yaml";

// Common parse-to-Patch contract (ADR-0021): parse(bytes) → Patch.
// Mizer project YAML is the first implementation; MVR and snapshot follow
// with the same output shape. Every parser emits integer ids with resolvable
// definition ids, modes, and address-per-break data; the scene merge
// downstream sees one shape and knows nothing about formats.
export interface PatchFixture {
  id: number;
  definition: string;
  mode: string;
  addresses: { universe: number; address: number; footprint: number }[];
}

export interface Patch {
  fixtures: PatchFixture[];
}

const DEFINITION_PATTERN = /^(gdtf|ofl|bhs):.+/;

/** Parses a Mizer project (`{fixtures: [{id, fixture, mode, universe, channel}]}`) into a Patch. */
export function parseMizerProject(source: string | Uint8Array): Patch {
  const text = typeof source === "string" ? source : new TextDecoder().decode(source);
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    throw new Error(
      `Mizer project does not parse: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!document || typeof document !== "object" || !("fixtures" in document)) {
    throw new Error("Mizer project has no fixtures list.");
  }
  const rows = document.fixtures;
  if (!Array.isArray(rows)) throw new Error("Mizer project has no fixtures list.");
  // One bad row never drops the loop: malformed entries are skipped, a
  // wholly-unparseable file fails the ingest and keeps the last patch.
  const fixtures = new Map<number, PatchFixture>();
  for (const row of rows) {
    const fixture = mizerFixture(row);
    if (fixture) fixtures.set(fixture.id, fixture);
  }
  return { fixtures: [...fixtures.values()] };
}

// A Mizer fixture carries exactly one address: universe is already in
// Beamhouse space (Port-Address + 1) and channel is 1-based, so the channel
// is the slot. Footprint stays a single slot here; breakRanges upgrades it
// from the resolved definition footprint wherever one exists.
function mizerFixture(row: unknown): PatchFixture | null {
  if (!row || typeof row !== "object") return null;
  const { id, fixture, mode, universe, channel } = row as Record<string, unknown>;
  if (!Number.isInteger(id) || (id as number) < 0) return null;
  if (typeof fixture !== "string" || !DEFINITION_PATTERN.test(fixture)) return null;
  if (typeof mode !== "string" || mode.length === 0) return null;
  if (!Number.isInteger(universe) || (universe as number) < 1 || (universe as number) > 63_999)
    return null;
  if (!Number.isInteger(channel) || (channel as number) < 1 || (channel as number) > 512)
    return null;
  return {
    id: id as number,
    definition: fixture,
    mode,
    addresses: [{ universe: universe as number, address: channel as number, footprint: 1 }],
  };
}
