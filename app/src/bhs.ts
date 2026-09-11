import type { BhsDefinition, LocalFixture } from "./scene.ts";

// .bhs document envelope and patch block types (issue #81).
// This loader covers the `patch` block only. Later issues (#82/#83) extend
// the schema with definitions, fixtures, scene properties, and views.

export type BhsPatch =
  | { readonly kind: "mizer"; readonly path: string }
  | { readonly kind: "mvr"; readonly path: string }
  | { readonly kind: "snapshot"; readonly fixtures: unknown };

export interface BhsDocument {
  readonly patch: BhsPatch;
  readonly definitions?: Readonly<Record<string, BhsDefinition>>;
  readonly fixtures?: readonly LocalFixture[];
  readonly density?: number;
  readonly beamLength?: number;
  readonly views?: Readonly<
    Record<
      string,
      {
        readonly position: readonly [number, number, number];
        readonly target: readonly [number, number, number];
      }
    >
  >;
}

/** Generic .bhs error. */
export class BhsError extends Error {
  override name = "BhsError";
}

/** A top-level key other than the known set appeared in the document. */
export class BhsUnknownKeyError extends BhsError {
  override name = "BhsUnknownKeyError";
  readonly key: string;

  constructor(key: string) {
    super(`Unknown top-level key: "${key}"`);
    this.key = key;
  }
}

/** A "classes" block is not supported. */
export class BhsClassesBlockError extends BhsError {
  override name = "BhsClassesBlockError";

  constructor() {
    super('"classes" block is not supported');
  }
}

/** An "emitters" block is not supported — definition defects go to the quirks table. */
export class BhsEmittersBlockError extends BhsError {
  override name = "BhsEmittersBlockError";

  constructor() {
    super('"emitters" block is not supported');
  }
}

/** A definition entry is malformed (e.g. forbidden optics keys, bad field types). */
export class BhsDefinitionError extends BhsError {
  override name = "BhsDefinitionError";
  readonly key: string | undefined;

  constructor(message: string, key?: string) {
    super(message);
    this.key = key;
  }
}

/** A fixture entry is malformed. */
export class BhsFixtureError extends BhsError {
  override name = "BhsFixtureError";

  constructor(message: string) {
    super(message);
  }
}

/** A required scene property (density or beamLength) is missing from the document. */
export class BhsMissingPropertyError extends BhsError {
  override name = "BhsMissingPropertyError";
  readonly key: string;

  constructor(key: string) {
    super(`Missing required scene property: "${key}"`);
    this.key = key;
  }
}

const KNOWN_TOP_LEVEL_KEYS: Record<string, true> = {
  patch: true,
  definitions: true,
  fixtures: true,
  density: true,
  beamLength: true,
  views: true,
};
const FORBIDDEN_OPTICS_KEYS: Record<string, true> = {
  BeamType: true,
  BeamAngle: true,
  BeamRadius: true,
  ColorTemperature: true,
};
const VALID_PRIMITIVES: Record<string, true> = {
  Cube: true,
  Cylinder: true,
  Sphere: true,
};

/**
 * Parse a .bhs document from JSON text. The loader is strict: any top-level
 * key other than `patch`, `definitions`, `fixtures`, `density`, `beamLength`,
 * or `views` is a `BhsUnknownKeyError`; `classes` and `emitters` have their
 * own named errors. `density` and `beamLength` are required — missing either
 * is a `BhsMissingPropertyError`. Returns the parsed object directly (key
 * order preserved by JSON.parse) so that round-trip serialization reproduces
 * compact input byte-identically.
 */
export function parseBhs(text: string): BhsDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new BhsError(`Invalid JSON: ${err instanceof SyntaxError ? err.message : String(err)}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BhsError("Root value must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  // Check forbidden blocks before the generic key check
  if ("classes" in obj) throw new BhsClassesBlockError();
  if ("emitters" in obj) throw new BhsEmittersBlockError();

  // Strict: reject any unknown top-level key
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS[key]) {
      throw new BhsUnknownKeyError(key);
    }
  }

  if (!("patch" in obj)) {
    throw new BhsError('Missing required top-level key: "patch"');
  }

  const patch = obj.patch;
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new BhsError('"patch" must be a JSON object');
  }

  const patchObj = patch as Record<string, unknown>;

  if (typeof patchObj.kind !== "string" || patchObj.kind.length === 0) {
    throw new BhsError('"patch.kind" must be a non-empty string');
  }

  switch (patchObj.kind) {
    case "mizer":
    case "mvr":
      if (typeof patchObj.path !== "string" || patchObj.path.length === 0) {
        throw new BhsError(`"patch.path" must be a non-empty string for kind "${patchObj.kind}"`);
      }
      break;
    case "snapshot":
      if (!("fixtures" in patchObj)) {
        throw new BhsError('"patch.fixtures" is required for kind "snapshot"');
      }
      break;
    default:
      throw new BhsError(`Unknown patch kind: "${patchObj.kind}"`);
  }

  // Parse definitions block
  if ("definitions" in obj) {
    validateDefinitionsBlock(obj.definitions);
  }

  // Parse fixtures block
  if ("fixtures" in obj) {
    validateFixturesBlock(obj.fixtures);
  }

  // Validate required scene properties: density and beamLength
  validateSceneProperties(obj);

  // Validate views block if present
  if ("views" in obj) {
    validateViewsBlock(obj.views);
  }

  return parsed as BhsDocument;
}

function validateDefinitionsBlock(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BhsDefinitionError('"definitions" must be an object');
  }

  const dict = value as Record<string, Record<string, unknown>>;
  for (const [id, def] of Object.entries(dict)) {
    if (!id.startsWith("bhs:")) {
      throw new BhsDefinitionError(`Definition id must start with "bhs:", got "${id}"`, id);
    }

    if (typeof def !== "object" || def === null || Array.isArray(def)) {
      throw new BhsDefinitionError(`Definition "${id}" must be an object`, id);
    }

    const d = def;

    // Reject forbidden optics keys before checking kind
    for (const optKeyStr of Object.keys(FORBIDDEN_OPTICS_KEYS)) {
      if (optKeyStr in d) {
        throw new BhsDefinitionError(
          `Definition "${id}" has forbidden optics key "${optKeyStr}"`,
          id,
        );
      }
    }

    if (d.kind === "strip") {
      if (typeof d.pixels !== "number" || !Number.isInteger(d.pixels) || d.pixels < 1) {
        throw new BhsDefinitionError(
          `Definition "${id}" strip.pixels must be a positive integer`,
          id,
        );
      }
      if (typeof d.pitchMm !== "number" || !Number.isFinite(d.pitchMm) || d.pitchMm <= 0) {
        throw new BhsDefinitionError(
          `Definition "${id}" strip.pitchMm must be a positive number`,
          id,
        );
      }
      if (
        typeof d.channelsPerPixel !== "number" ||
        !Number.isInteger(d.channelsPerPixel) ||
        d.channelsPerPixel < 1
      ) {
        throw new BhsDefinitionError(
          `Definition "${id}" strip.channelsPerPixel must be a positive integer`,
          id,
        );
      }
      if (!VALID_PRIMITIVES[String(d.primitive)]) {
        throw new BhsDefinitionError(
          `Definition "${id}" strip.primitive must be "Cube", "Cylinder", or "Sphere"`,
          id,
        );
      }
    } else if (d.kind === "primitive") {
      if (!VALID_PRIMITIVES[String(d.primitive)]) {
        throw new BhsDefinitionError(
          `Definition "${id}" primitive.primitive must be "Cube", "Cylinder", or "Sphere"`,
          id,
        );
      }
      if (typeof d.width !== "number" || !Number.isFinite(d.width) || d.width <= 0) {
        throw new BhsDefinitionError(
          `Definition "${id}" primitive.width must be a positive number`,
          id,
        );
      }
      if (typeof d.depth !== "number" || !Number.isFinite(d.depth) || d.depth <= 0) {
        throw new BhsDefinitionError(
          `Definition "${id}" primitive.depth must be a positive number`,
          id,
        );
      }
      if (typeof d.height !== "number" || !Number.isFinite(d.height) || d.height <= 0) {
        throw new BhsDefinitionError(
          `Definition "${id}" primitive.height must be a positive number`,
          id,
        );
      }
    } else {
      throw new BhsDefinitionError(
        `Definition "${id}" must have kind "strip" or "primitive", got "${String(d.kind)}"`,
        id,
      );
    }
  }
}

function validateFixturesBlock(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new BhsFixtureError('"fixtures" must be an array');
  }

  const fixtures = value as Array<Record<string, unknown>>;
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (typeof f !== "object" || f === null || Array.isArray(f)) {
      throw new BhsFixtureError(`Fixture at index ${i} must be an object`);
    }

    if (typeof f.id !== "number" || !Number.isInteger(f.id)) {
      throw new BhsFixtureError(`Fixture at index ${i} must have an integer id`);
    }

    if (typeof f.definition !== "string" || f.definition.length === 0) {
      throw new BhsFixtureError(`Fixture at index ${i} must have a non-empty definition string`);
    }

    if (typeof f.mode !== "string") {
      throw new BhsFixtureError(`Fixture at index ${i} must have a string mode`);
    }

    if (!Array.isArray(f.addresses)) {
      throw new BhsFixtureError(`Fixture at index ${i} must have an array of addresses`);
    }

    for (let j = 0; j < f.addresses.length; j++) {
      const a = f.addresses[j] as Record<string, unknown>;
      if (typeof a !== "object" || a === null || Array.isArray(a)) {
        throw new BhsFixtureError(`Fixture at index ${i} address ${j} must be an object`);
      }

      if (typeof a.universe !== "number" || !Number.isInteger(a.universe) || a.universe < 1) {
        throw new BhsFixtureError(
          `Fixture at index ${i} address ${j}.universe must be a positive integer`,
        );
      }
      if (typeof a.address !== "number" || !Number.isInteger(a.address) || a.address < 1) {
        throw new BhsFixtureError(
          `Fixture at index ${i} address ${j}.address must be a positive integer`,
        );
      }
      if (typeof a.footprint !== "number" || !Number.isInteger(a.footprint) || a.footprint < 1) {
        throw new BhsFixtureError(
          `Fixture at index ${i} address ${j}.footprint must be a positive integer`,
        );
      }
    }

    // Scene object invariant: empty mode ⇔ empty addresses, fixture needs both
    const hasEmptyMode = f.mode.length === 0;
    const hasEmptyAddresses = f.addresses.length === 0;
    if (hasEmptyMode !== hasEmptyAddresses) {
      throw new BhsFixtureError(
        `Fixture at index ${i}: scene objects have an empty mode and no addresses; fixtures need both`,
      );
    }
  }
}

function validateSceneProperties(obj: Record<string, unknown>): void {
  if (!("density" in obj)) {
    throw new BhsMissingPropertyError("density");
  }
  if (!("beamLength" in obj)) {
    throw new BhsMissingPropertyError("beamLength");
  }
  const density = obj.density;
  if (typeof density !== "number" || !Number.isFinite(density) || density < 0 || density > 1) {
    throw new BhsError('"density" must be a finite number between 0 and 1');
  }
  const beamLength = obj.beamLength;
  if (
    typeof beamLength !== "number" ||
    !Number.isFinite(beamLength) ||
    beamLength < 1 ||
    beamLength > 40
  ) {
    throw new BhsError('"beamLength" must be a finite number between 1 and 40');
  }
}

function validateViewsBlock(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BhsError('"views" must be an object');
  }
  for (const [name, view] of Object.entries(value as Record<string, unknown>)) {
    if (typeof view !== "object" || view === null || Array.isArray(view)) {
      throw new BhsError(`View "${name}" must be an object`);
    }
    const v = view as Record<string, unknown>;
    if (
      !Array.isArray(v.position) ||
      v.position.length !== 3 ||
      !v.position.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
    ) {
      throw new BhsError(`View "${name}" must have a valid position [x, y, z]`);
    }
    if (
      !Array.isArray(v.target) ||
      v.target.length !== 3 ||
      !v.target.every((n: unknown) => typeof n === "number" && Number.isFinite(n))
    ) {
      throw new BhsError(`View "${name}" must have a valid target [x, y, z]`);
    }
  }
}

/**
 * Serialize a .bhs document back to compact JSON. When the document was parsed
 * from compact JSON (no extra whitespace), the output is byte-identical.
 */
export function serializeBhs(doc: BhsDocument): string {
  return JSON.stringify(doc);
}

/**
 * Return the local file path for a path-bearing patch variant, or `null` for
 * the inline `snapshot` variant.
 */
export function bhsPatchPath(patch: BhsPatch): string | null {
  if (patch.kind === "snapshot") return null;
  return patch.path;
}

/**
 * Returns `true` when the patch variant can be shared (only the inline
 * `snapshot` variant is shareable — path-bearing variants name files on the
 * sender's disk and must be refused).
 */
export function isShareableBhsPatch(patch: BhsPatch): boolean {
  return patch.kind === "snapshot";
}
