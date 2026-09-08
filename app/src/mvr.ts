// MVR ingest: the second implementation of the patch contract (ADR-0021).
// Reads GeneralSceneDescription.xml out of an MVR zip, resolves every
// GDTFSpec inside the archive (never a library substitution, ADR-0030),
// and emits the shared Patch shape plus the MVR-only arrivals: placed
// scene objects, metre placements, and additive provenance marks.
//
// Identity runs the ADR-0020 ladder inside this parser: FixtureIDNumeric
// → FixtureID parsed as an integer → UnitNumber → synthesised-and-loud.
// UUID and definition Revision ride as reconciliation hints only.
// Units convert once at this boundary: MVR matrices are 4x3 rows in
// millimetres (translation in the 4th row); placements leave here in metres.

import { parseGdtf, type GdtfDefinition } from "gdtf-ts";
import type { Patch, PatchFixture } from "./patch.ts";
import type { LocalFixture, Placement } from "./scene.ts";

/** Everything an MVR ingest carries beyond the shared Patch shape. */
export interface MvrIngest {
  patch: Patch;
  /** Scene objects: positive MVR ids, empty mode, no addresses. */
  objects: LocalFixture[];
  /** Starting placements in metres, keyed by fixture id. */
  placements: Record<string, Placement>;
  /** Embedded definitions to register, keyed by their gdtf: type id. */
  definitions: { id: string; definition: GdtfDefinition }[];
}

interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

// A purpose-built XML subset reader: elements, attributes, text, comments
// and processing instructions. No DTD, no namespaces, no mixed exotic
// content — GeneralSceneDescription never uses them.
function parseXmlDocument(source: string): XmlElement {
  let cursor = 0;
  const fail = (message: string): never => {
    throw new Error(`MVR scene description does not parse: ${message}`);
  };
  const skipPrologue = (): void => {
    for (;;) {
      while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1;
      if (source.startsWith("<!--", cursor)) {
        const end = source.indexOf("-->", cursor + 4);
        if (end < 0) fail("unterminated comment");
        cursor = end + 3;
      } else if (source.startsWith("<?", cursor)) {
        const end = source.indexOf("?>", cursor + 2);
        if (end < 0) fail("unterminated processing instruction");
        cursor = end + 2;
      } else if (source.startsWith("<!", cursor)) {
        const end = source.indexOf(">", cursor + 2);
        if (end < 0) fail("unterminated declaration");
        cursor = end + 1;
      } else {
        return;
      }
    }
  };
  const parseElement = (): XmlElement => {
    skipPrologue();
    if (source[cursor] !== "<") fail(`expected < at offset ${cursor}`);
    const close = source.indexOf(">", cursor + 1);
    if (close < 0) fail("unterminated tag");
    const raw = source.slice(cursor + 1, close).trim();
    cursor = close + 1;
    if (raw.startsWith("/")) fail(`stray closing tag ${raw}`);
    const selfClosing = raw.endsWith("/");
    const head = (selfClosing ? raw.slice(0, -1) : raw).trim();
    const space = head.search(/\s/);
    const tag = space < 0 ? head : head.slice(0, space);
    if (!tag) fail("empty tag name");
    const attrs: Record<string, string> = {};
    const attrPattern = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    for (let match = attrPattern.exec(head); match; match = attrPattern.exec(head)) {
      attrs[match[1]!] = decodeEntities(match[3] ?? match[4] ?? "");
    }
    if (selfClosing) return { tag, attrs, children: [], text: "" };
    const children: XmlElement[] = [];
    let text = "";
    for (;;) {
      const next = source.indexOf("<", cursor);
      if (next < 0) fail(`unterminated <${tag}>`);
      text += decodeEntities(source.slice(cursor, next));
      cursor = next;
      if (source.startsWith(`</`, cursor)) {
        const end = source.indexOf(">", cursor + 2);
        if (end < 0) fail("unterminated closing tag");
        const name = source.slice(cursor + 2, end).trim();
        cursor = end + 1;
        if (name !== tag) fail(`<${tag}> closed by </${name}>`);
        return { tag, attrs, children, text: text.trim() };
      }
      if (source.startsWith("<!--", cursor) || source.startsWith("<?", cursor)) {
        skipPrologue();
        continue;
      }
      children.push(parseElement());
    }
  };
  skipPrologue();
  const root = parseElement();
  skipPrologue();
  return root;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// A purpose-built zip reader: stored and deflated entries via the platform
// inflater. Central-directory driven, so entry order never matters.
async function unzipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = (message: string): never => {
    throw new Error(`MVR archive does not unzip: ${message}`);
  };
  const little16 = (offset: number): number => view.getUint16(offset, true);
  const little32 = (offset: number): number => view.getUint32(offset, true);
  let directoryOffset = -1;
  let directoryCount = 0;
  const scanStart = Math.max(0, bytes.length - 65_536 - 22);
  for (let offset = bytes.length - 22; offset >= scanStart; offset -= 1) {
    if (little32(offset) === 0x06054b50) {
      directoryCount = little16(offset + 10);
      directoryOffset = little32(offset + 16);
      break;
    }
  }
  if (directoryOffset < 0) fail("no end-of-central-directory record");
  // Ingest caps: a hostile size field fails the ingest instead of
  // allocating. Generous for real GDTFs, which top out in single megabytes.
  const ENTRY_CAP = 64 * 1024 * 1024;
  const TOTAL_CAP = 256 * 1024 * 1024;
  let totalOutput = 0;
  const entries = new Map<string, Uint8Array>();
  let cursor = directoryOffset;
  for (let index = 0; index < directoryCount; index += 1) {
    if (little32(cursor) !== 0x02014b50) fail("corrupt central directory");
    const method = little16(cursor + 10);
    // Central-directory layout: crc at 16, compressed size at 20,
    // uncompressed at 24 — stored entries mask the mix-up, deflated do not.
    const compressedSize = little32(cursor + 20);
    const uncompressedSize = little32(cursor + 24);
    const localOffset = little32(cursor + 42);
    const nameLength = little16(cursor + 28);
    const extraLength = little16(cursor + 30);
    const commentLength = little16(cursor + 32);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (uncompressedSize > ENTRY_CAP) fail(`entry ${name} exceeds the 64 MiB ingest cap`);
    totalOutput += uncompressedSize;
    if (totalOutput > TOTAL_CAP) fail("archive exceeds the 256 MiB ingest cap");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (little32(localOffset) !== 0x04034b50) fail(`bad local header for ${name}`);
    const dataStart = localOffset + 30 + little16(localOffset + 26) + little16(localOffset + 28);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) {
      entries.set(name, data.slice());
    } else if (method === 8) {
      const stream = new DecompressionStream("deflate-raw");
      const reader = new Response(stream.readable).arrayBuffer();
      const writer = stream.writable.getWriter();
      await writer.write(data.slice());
      await writer.close();
      const inflated = new Uint8Array(await reader);
      if (inflated.length > ENTRY_CAP) fail(`entry ${name} exceeds the 64 MiB ingest cap`);
      entries.set(name, inflated);
    } else {
      fail(`unsupported compression method ${method} for ${name}`);
    }
  }
  return entries;
}

/** A scalar MVR field: element text or its value attribute, whichever the writer used. */
function fieldText(parent: XmlElement, tag: string): string {
  const child = parent.children.find((entry) => entry.tag === tag);
  if (!child) return "";
  return (child.text || child.attrs["value"] || child.attrs["Value"] || "").trim();
}

function child(parent: XmlElement, tag: string): XmlElement | undefined {
  return parent.children.find((entry) => entry.tag === tag);
}

function parseInteger(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

interface MvrAddress {
  universe: number;
  address: number;
  dmxBreak: number;
}

// universe.address, universe/address, universe:address, or a bare channel on universe 1.
function parseAddressText(text: string): { universe: number; address: number } | null {
  const paired = text.trim().match(/^(\d+)\s*[./:]\s*(\d+)$/);
  if (paired) return { universe: Number(paired[1]), address: Number(paired[2]) };
  const bare = text.trim().match(/^(\d+)$/);
  if (bare) return { universe: 1, address: Number(bare[1]) };
  return null;
}

/** Inverse of scene.ts eulerMatrix for XYZ order: keep the two in sync. */
function eulerFromRows(
  rows: [[number, number, number], [number, number, number], [number, number, number]],
): [number, number, number] {
  // The + 0 canonicalizes atan2's negative zero so persisted placements compare clean.
  const toDegrees = (radians: number): number => (radians * 180) / Math.PI + 0;
  const clamped = Math.min(1, Math.max(-1, rows[0][2]));
  if (Math.abs(clamped) < 0.9999999) {
    return [
      toDegrees(Math.atan2(-rows[1][2], rows[2][2])),
      toDegrees(Math.asin(clamped)),
      toDegrees(Math.atan2(-rows[0][1], rows[0][0])),
    ];
  }
  return [toDegrees(Math.atan2(rows[2][1], rows[1][1])), toDegrees(Math.asin(clamped)), 0];
}

// MVR Matrix: four rows of three in millimetres, translation in the 4th row.
function parseMatrix(element: XmlElement | undefined): Placement | null {
  if (!element) return null;
  const numbers = element.text
    .split(/[\s,;]+/)
    .filter((part) => part.length > 0)
    .map(Number);
  if (numbers.length !== 12 || numbers.some((value) => !Number.isFinite(value))) return null;
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22, tx, ty, tz] = numbers as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    position: [tx / 1000, ty / 1000, tz / 1000],
    rotation: eulerFromRows([
      [r00, r01, r02],
      [r10, r11, r12],
      [r20, r21, r22],
    ]),
  };
}
const PATCHABLE_NODE: Record<string, true> = { Fixture: true };
const OBJECT_NODES: Record<string, true> = {
  SceneObject: true,
  Truss: true,
  Support: true,
  VideoScreen: true,
  Projector: true,
  FocusPoint: true,
};
const CONTAINER_NODES: Record<string, true> = {
  GeneralSceneDescription: true,
  Scene: true,
  Layers: true,
  Layer: true,
  ChildList: true,
  GroupObject: true,
  Fixture: true,
};
interface ResolvedSpec {
  entryName: string;
  /** Null when the entry exists but does not parse: placed without a definition, never fatal. */
  definition: GdtfDefinition | null;
  repairs: string[];
}

// ADR-0030 decision 2-3: the archive is the only place we look; exactly two
// documented malformities are tolerated, each marked. A present-but-corrupt
// entry marks its node and keeps the ingest — one bad file never drops the loop.
function resolveSpec(entries: Map<string, Uint8Array>, spec: string): ResolvedSpec | null {
  const names = [...entries.keys()];
  const exact = names.find((name) => name === spec);
  const entryName =
    exact ?? names.find((name) => name === `${spec}.gdtf`) ?? findCaseInsensitive(names, spec);
  if (!entryName) return null;
  const repairs: string[] = [];
  if (entryName !== spec) {
    repairs.push(
      entryName === `${spec}.gdtf`
        ? `GDTFSpec "${spec}" opened as "${entryName}" (missing extension repaired)`
        : `GDTFSpec "${spec}" opened as "${entryName}" (filename case repaired)`,
    );
  }
  try {
    return { entryName, definition: parseGdtf(entries.get(entryName)!), repairs };
  } catch {
    repairs.push(
      `GDTFSpec "${spec}" found as "${entryName}" but does not parse — placed without a definition`,
    );
    return { entryName, definition: null, repairs };
  }
}

function findCaseInsensitive(names: string[], spec: string): string | undefined {
  const folded = spec.toLowerCase();
  const withExtension = `${folded}.gdtf`;
  return names.find((name) => {
    const candidate = name.toLowerCase();
    return candidate === folded || candidate === withExtension;
  });
}

interface ResolvedMode {
  name: string;
  repairs: string[];
}

// ADR-0030 decision 5: exact, then case-insensitive, then the sole mode of a
// single-mode file (marked). Past that the fixture keeps its requested mode
// and resolves unbound downstream — never a guess at a footprint.
function resolveMode(definition: GdtfDefinition, requested: string): ResolvedMode | null {
  if (definition.modes.some((mode) => mode.name === requested))
    return { name: requested, repairs: [] };
  const folded = definition.modes.find(
    (mode) => mode.name.toLowerCase() === requested.toLowerCase(),
  );
  if (folded) {
    return {
      name: folded.name,
      repairs: [`mode "${requested}" matched "${folded.name}" (mode case repaired)`],
    };
  }
  if (definition.modes.length === 1) {
    const sole = definition.modes[0]!;
    return {
      name: sole.name,
      repairs: [`mode "${requested}" fell back to the file's only mode "${sole.name}"`],
    };
  }
  return null;
}

// Per-break DMX footprint from the resolved mode: the highest 1-based slot
// offset bound to the break. A single-break mode answers every break, which
// keeps MVR Break numbering (0- or 1-based) from mattering.
function breakFootprints(definition: GdtfDefinition, modeName: string): Map<number, number> {
  const footprints = new Map<number, number>();
  const mode = definition.modes.find((entry) => entry.name === modeName);
  for (const channel of mode?.channels ?? []) {
    if (channel.offsets.length === 0) continue;
    const last = Math.max(...channel.offsets);
    footprints.set(channel.dmxBreak, Math.max(footprints.get(channel.dmxBreak) ?? 0, last));
  }
  return footprints;
}

function attr(element: XmlElement, ...names: string[]): string {
  for (const name of names) {
    const value = element.attrs[name];
    if (value !== undefined && value.length > 0) return value;
  }
  return "";
}

/**
 * Parses MVR bytes into the patch contract plus MVR-only arrivals.
 * One bad node never drops the ingest; a wholly-unparseable file throws
 * and the caller keeps the last patch.
 */
export async function parseMvr(bytes: Uint8Array): Promise<MvrIngest> {
  const entries = await unzipEntries(bytes);
  const sceneEntry = entries.get("GeneralSceneDescription.xml");
  if (!sceneEntry) throw new Error("MVR archive carries no GeneralSceneDescription.xml.");
  const root = parseXmlDocument(new TextDecoder().decode(sceneEntry));
  if (root.tag !== "GeneralSceneDescription") {
    throw new Error("MVR scene description has no GeneralSceneDescription root.");
  }

  const patch = new Map<number, PatchFixture>();
  const objects = new Map<number, LocalFixture>();
  const placements: Record<string, Placement> = {};
  const definitions = new Map<string, GdtfDefinition>();
  const usedIds = new Set<number>();
  let nextSynthetic = 1000;

  const takeId = (candidates: (number | null)[], marks: string[], uuid: string): number => {
    for (const candidate of candidates) {
      if (candidate !== null && candidate >= 0 && !usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
    }
    while (usedIds.has(nextSynthetic)) nextSynthetic += 1;
    const id = nextSynthetic;
    nextSynthetic += 1;
    usedIds.add(id);
    marks.push(
      uuid.length > 0
        ? `synthesized id ${id}: no FixtureIDNumeric, FixtureID, or UnitNumber (uuid ${uuid})`
        : `synthesized id ${id}: no FixtureIDNumeric, FixtureID, or UnitNumber`,
    );
    return id;
  };

  const visit = (element: XmlElement): void => {
    if (PATCHABLE_NODE[element.tag] || OBJECT_NODES[element.tag]) ingestNode(element);
    if (CONTAINER_NODES[element.tag]) {
      for (const entry of element.children) visit(entry);
    }
  };

  const ingestNode = (element: XmlElement): void => {
    const kind = element.tag;
    const uuid = attr(element, "uuid", "UUID");
    const spec = fieldText(element, "GDTFSpec");
    const requestedMode = fieldText(element, "GDTFMode");
    const marks: string[] = [];

    const addresses: MvrAddress[] = [];
    const addressesParent = child(element, "Addresses");
    for (const entry of addressesParent?.children.filter((node) => node.tag === "Address") ?? []) {
      const parsed = parseAddressText(
        entry.text || entry.attrs["value"] || entry.attrs["Value"] || "",
      );
      const dmxBreak =
        parseInteger(
          entry.attrs["Break"] ?? entry.attrs["break"] ?? entry.attrs["DMXBreak"] ?? "1",
        ) ?? 1;
      if (
        !parsed ||
        !Number.isInteger(parsed.universe) ||
        parsed.universe < 1 ||
        parsed.universe > 63_999 ||
        !Number.isInteger(parsed.address) ||
        parsed.address < 1 ||
        parsed.address > 512
      ) {
        marks.push(
          `address "${(entry.text || "").trim()}" ignored (not a universe.address in range)`,
        );
        continue;
      }
      addresses.push({ ...parsed, dmxBreak });
    }

    const id = takeId(
      [
        parseInteger(fieldText(element, "FixtureIDNumeric")),
        parseInteger(fieldText(element, "FixtureID")),
        parseInteger(fieldText(element, "UnitNumber")),
      ],
      marks,
      uuid,
    );

    const placement = parseMatrix(child(element, "Matrix"));
    if (placement) placements[String(id)] = placement;

    const hint = uuid.length > 0 ? { uuid } : {};
    const addressed = kind === "Fixture" && spec.length > 0 && addresses.length > 0;
    if (!addressed) {
      if (kind === "Fixture" && spec.length > 0 && addresses.length === 0) {
        marks.push("addressed fixture carries no usable address and lands in Objects");
      }
      objects.set(id, {
        id,
        definition: definitionForObject(entries, definitions, spec, marks),
        mode: "",
        addresses: [],
        ...hint,
        ...(marks.length > 0 ? { marks: [...marks] } : {}),
      });
      return;
    }

    const resolved = resolveSpec(entries, spec);
    if (!resolved || !resolved.definition) {
      if (!resolved)
        marks.push(`GDTFSpec "${spec}" is not in the archive — placed without a definition`);
      else marks.push(...resolved.repairs);
      patch.set(id, {
        id,
        definition: `mvr:${spec}`,
        mode: requestedMode || "unresolved",
        addresses: addresses.map((entry) => ({
          universe: entry.universe,
          address: entry.address,
          footprint: 1,
        })),
        ...hint,
        marks: [...marks],
      });
      return;
    }
    marks.push(...resolved.repairs);
    const definition = resolved.definition;
    const definitionId = `gdtf:${definition.fixtureTypeId}`;
    definitions.set(definitionId, definition);
    const revision =
      definition.revisionHint.length > 0 ? { revision: definition.revisionHint } : {};
    // An empty request still runs the ladder: a single-mode file binds its
    // sole mode, anything else stays unbound but keeps its patch row.
    const mode = resolveMode(definition, requestedMode);
    if (!mode && requestedMode.length > 0) {
      marks.push(
        `mode "${requestedMode}" is not in "${resolved.entryName}" — placed without a DMX binding`,
      );
    }
    if (!mode && requestedMode.length === 0) {
      marks.push(
        `no GDTFMode named and ${definition.modes.length} modes to choose from — placed without a DMX binding`,
      );
    }
    if (mode) marks.push(...mode.repairs);
    const footprints = mode ? breakFootprints(definition, mode.name) : new Map<number, number>();
    const single = footprints.size === 1 ? [...footprints.values()][0]! : null;
    patch.set(id, {
      id,
      definition: definitionId,
      mode: (mode?.name ?? requestedMode) || "unresolved",
      addresses: addresses.map((entry) => ({
        universe: entry.universe,
        address: entry.address,
        footprint: footprints.get(entry.dmxBreak) ?? single ?? 1,
      })),
      ...hint,
      ...revision,
      ...(marks.length > 0 ? { marks: [...marks] } : {}),
    });
  };

  visit(root);
  return {
    patch: { fixtures: [...patch.values()] },
    objects: [...objects.values()],
    placements,
    definitions: [...definitions].map(([id, definition]) => ({ id, definition })),
  };
}

function definitionForObject(
  entries: Map<string, Uint8Array>,
  definitions: Map<string, GdtfDefinition>,
  spec: string,
  marks: string[],
): string {
  if (spec.length === 0) return "mvr:unresolved";
  const resolved = resolveSpec(entries, spec);
  if (!resolved || !resolved.definition) {
    if (!resolved)
      marks.push(`GDTFSpec "${spec}" is not in the archive — placed without a definition`);
    else marks.push(...resolved.repairs);
    return `mvr:${spec}`;
  }
  marks.push(...resolved.repairs);
  const definitionId = `gdtf:${resolved.definition.fixtureTypeId}`;
  definitions.set(definitionId, resolved.definition);
  return definitionId;
}
