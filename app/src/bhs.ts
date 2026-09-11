// .bhs document envelope and patch block types (issue #81).
// This loader covers the `patch` block only. Later issues (#82/#83) extend
// the schema with definitions, fixtures, scene properties, and views.

export type BhsPatch =
  | { readonly kind: "mizer"; readonly path: string }
  | { readonly kind: "mvr"; readonly path: string }
  | { readonly kind: "snapshot"; readonly fixtures: unknown };

export interface BhsDocument {
  readonly patch: BhsPatch;
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

/**
 * Parse a .bhs document from JSON text. The loader is strict: any top-level
 * key other than `patch` is a `BhsUnknownKeyError`. Returns the parsed object
 * directly (key order preserved by JSON.parse) so that round-trip serialization
 * reproduces compact input byte-identically.
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

  // Strict: reject any unknown top-level key
  for (const key of Object.keys(obj)) {
    if (key !== "patch") {
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
      return parsed as BhsDocument;
    case "snapshot":
      if (!("fixtures" in patchObj)) {
        throw new BhsError('"patch.fixtures" is required for kind "snapshot"');
      }
      return parsed as BhsDocument;
    default:
      throw new BhsError(`Unknown patch kind: "${patchObj.kind}"`);
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
