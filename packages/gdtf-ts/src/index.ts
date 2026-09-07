// gdtf-ts: parse and resolve GDTF. Bytes in, plain GDTF-shaped data out.
// Runtime-agnostic: no fetch, fs, File, or DOM. No Beamhouse or renderer types.

import { unzipSync } from "fflate";
import { child, children, parseXml, type XmlNode } from "./xml.ts";

export { GDTF_QUIRKS, proxyPrimitive, PROXY_PRIMITIVE, type GdtfQuirk } from "./quirks.ts";

/** Row-major 4x4: M[i][j] is element i * 4 + j. Brace-groups are rows (never transposed). */
export type Matrix4 = [
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
  number,
  number,
  number,
  number,
];

export function identityMatrix(): Matrix4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Parse a GDTF Position string: four brace-groups of four floats, each a matrix row. */
export function parsePosition(text: string): Matrix4 {
  const groups = [...text.matchAll(/\{([^}]*)\}/g)].map((match) =>
    match[1]!.split(",").map((part) => Number(part.trim())),
  );
  if (
    groups.length !== 4 ||
    groups.some((group) => group.length !== 4 || group.some(Number.isNaN))
  ) {
    throw new Error(`gdtf: malformed Position "${text}"`);
  }
  return groups.flat() as Matrix4;
}

/** Translation lives in the 4th column: the 4th float of the first three rows. */
export function translationOf(matrix: Matrix4): [number, number, number] {
  return [matrix[3], matrix[7], matrix[11]];
}

export function multiplyMatrices(parent: Matrix4, local: Matrix4): Matrix4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1)
    for (let column = 0; column < 4; column += 1)
      for (let k = 0; k < 4; k += 1)
        out[row * 4 + column]! += parent[row * 4 + k]! * local[k * 4 + column]!;
  return out as Matrix4;
}

export function applyToPoint(
  matrix: Matrix4,
  point: [number, number, number],
): [number, number, number] {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
  ];
}

export interface GdtfBreak {
  dmxBreak: number;
  dmxOffset: number;
}

export type GdtfGeometryKind = "geometry" | "axis" | "beam" | "reference";

export interface GdtfGeometryNode {
  kind: GdtfGeometryKind;
  name: string;
  /** Model name for geometry/axis/beam; referenced geometry name for reference. After expandReferences, the template's model — kind stays "reference" to mark the instance. */
  target: string;
  position: Matrix4;
  breaks: GdtfBreak[];
  beamAngle?: number;
  fieldAngle?: number;
  beamType?: string;
  children: GdtfGeometryNode[];
}

export interface GdtfModel {
  name: string;
  primitiveType: string;
  length: number;
  width: number;
  height: number;
  file: string;
  /** Raw GLB bytes when the archive carries models/gltf/<file>.glb, else null. */
  glb: Uint8Array | null;
}

export interface GdtfChannelFunction {
  name: string;
  attribute: string;
  dmxFrom: string;
  dmxTo: string;
}

export interface GdtfChannel {
  geometry: string;
  offset: string;
  dmxBreak: number;
  attribute: string;
  functions: GdtfChannelFunction[];
}

export interface GdtfMode {
  name: string;
  description: string;
  geometry: string;
  channels: GdtfChannel[];
}

export interface GdtfPixelMember {
  name: string;
  dmxBreak: number;
  dmxOffset: number;
}

export interface GdtfPixelGrouping {
  /** Referenced (template) geometry name; members follow document order. */
  geometry: string;
  members: GdtfPixelMember[];
}

export interface GdtfDefinition {
  fixtureTypeId: string;
  manufacturer: string;
  name: string;
  longName: string;
  shortName: string;
  description: string;
  /** Last Revision Text in document order: reconciliation hint only, never identity. */
  revisionHint: string;
  revisionTexts: string[];
  models: GdtfModel[];
  geometries: GdtfGeometryNode[];
  modes: GdtfMode[];
  pixelGroupings: GdtfPixelGrouping[];
}

const GEOMETRY_TAGS: Record<string, GdtfGeometryKind> = {
  Geometry: "geometry",
  Axis: "axis",
  Beam: "beam",
  GeometryReference: "reference",
};

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value === undefined || Number.isNaN(parsed) ? fallback : parsed;
}

function parseGeometryNode(node: XmlNode): GdtfGeometryNode {
  const kind = GEOMETRY_TAGS[node.tag];
  if (!kind) throw new Error(`gdtf: unexpected geometry tag <${node.tag}>`);
  const isReference = kind === "reference";
  const parsed: GdtfGeometryNode = {
    kind,
    name: node.attrs["Name"] ?? "",
    target: node.attrs[isReference ? "Geometry" : "Model"] ?? "",
    position: parsePosition(node.attrs["Position"] ?? "{1,0,0,0}{0,1,0,0}{0,0,1,0}{0,0,0,1}"),
    breaks: children(node, "Break").map((entry) => ({
      dmxBreak: num(entry.attrs["DMXBreak"], 1),
      dmxOffset: num(entry.attrs["DMXOffset"], 0),
    })),
    children: [],
  };
  if (kind === "beam") {
    const beamType = node.attrs["BeamType"];
    if (beamType !== undefined) parsed.beamType = beamType;
    parsed.beamAngle = num(node.attrs["BeamAngle"], 0);
    parsed.fieldAngle = num(node.attrs["FieldAngle"], 0);
  }
  for (const entry of node.children) {
    if (entry.tag === "Break") continue;
    parsed.children.push(parseGeometryNode(entry));
  }
  return parsed;
}

function parseMode(node: XmlNode): GdtfMode {
  return {
    name: node.attrs["Name"] ?? "",
    description: node.attrs["Description"] ?? "",
    geometry: node.attrs["Geometry"] ?? "",
    channels: children(
      child(node, "DMXChannels") ?? { tag: "", attrs: {}, children: [] },
      "DMXChannel",
    ).map((entry) => {
      const logical = child(entry, "LogicalChannel");
      return {
        geometry: entry.attrs["Geometry"] ?? "",
        offset: entry.attrs["Offset"] ?? "",
        dmxBreak: num(entry.attrs["DMXBreak"], 1),
        attribute: logical?.attrs["Attribute"] ?? "",
        functions: logical
          ? children(logical, "ChannelFunction").map((fn) => ({
              name: fn.attrs["Name"] ?? "",
              attribute: fn.attrs["Attribute"] ?? "",
              dmxFrom: fn.attrs["DMXFrom"] ?? "",
              dmxTo: fn.attrs["DMXTo"] ?? "",
            }))
          : [],
      };
    }),
  };
}

/** Expand every GeometryReference into its template's children under the reference's own name, Position, and Breaks; target becomes the template's model. */
export function expandReferences(nodes: readonly GdtfGeometryNode[]): GdtfGeometryNode[] {
  const templates = new Map<string, GdtfGeometryNode>();
  const collect = (node: GdtfGeometryNode) => {
    if (node.kind !== "reference" && !templates.has(node.name)) templates.set(node.name, node);
    for (const entry of node.children) collect(entry);
  };
  for (const node of nodes) collect(node);
  const expand = (node: GdtfGeometryNode): GdtfGeometryNode => {
    if (node.kind !== "reference") return { ...node, children: node.children.map(expand) };
    const template = templates.get(node.target);
    if (!template)
      throw new Error(`gdtf: GeometryReference "${node.name}" targets unknown "${node.target}"`);
    return {
      kind: "reference",
      name: node.name,
      target: template.target,
      position: node.position,
      breaks: [...node.breaks],
      children: template.children.map((entry) => expand(clone(entry))),
    };
  };
  return nodes.map(expand);
}

function clone(node: GdtfGeometryNode): GdtfGeometryNode {
  return {
    ...node,
    position: [...node.position] as Matrix4,
    breaks: [...node.breaks],
    children: node.children.map(clone),
  };
}

/** Composed world transform of the node at path (names from the forest root). */
export function worldTransform(
  nodes: readonly GdtfGeometryNode[],
  path: readonly string[],
): Matrix4 {
  let current = nodes;
  let world = identityMatrix();
  for (const name of path) {
    const node = current.find((entry) => entry.name === name);
    if (!node) throw new Error(`gdtf: no geometry "${name}" in path ${path.join(" / ")}`);
    world = multiplyMatrices(world, node.position);
    current = node.children;
  }
  return world;
}

/** Entry point: archive bytes to a resolved, plain-data definition. */
export function parseGdtf(bytes: Uint8Array): GdtfDefinition {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("gdtf: not a zip archive");
  }
  const description = entries["description.xml"];
  if (!description) throw new Error("gdtf: archive carries no description.xml");
  const fixture = child(parseXml(new TextDecoder().decode(description)), "FixtureType");
  if (!fixture) throw new Error("gdtf: description.xml carries no FixtureType");

  const models = children(
    child(fixture, "Models") ?? { tag: "", attrs: {}, children: [] },
    "Model",
  ).map((entry) => {
    const file = entry.attrs["File"] ?? "";
    return {
      name: entry.attrs["Name"] ?? "",
      primitiveType: entry.attrs["PrimitiveType"] ?? "",
      length: num(entry.attrs["Length"], 0),
      width: num(entry.attrs["Width"], 0),
      height: num(entry.attrs["Height"], 0),
      file,
      glb: file ? (entries[`models/gltf/${file}.glb`] ?? null) : null,
    } satisfies GdtfModel;
  });

  const geometriesRoot = child(fixture, "Geometries");
  const geometries = geometriesRoot ? geometriesRoot.children.map(parseGeometryNode) : [];
  const modes = children(
    child(fixture, "DMXModes") ?? { tag: "", attrs: {}, children: [] },
    "DMXMode",
  ).map(parseMode);

  const revisionTexts = children(
    child(fixture, "Revisions") ?? { tag: "", attrs: {}, children: [] },
    "Revision",
  ).map((entry) => entry.attrs["Text"] ?? "");

  const grouping = new Map<string, GdtfPixelMember[]>();
  const collectReferences = (node: GdtfGeometryNode) => {
    if (node.kind === "reference") {
      const members = grouping.get(node.target) ?? [];
      for (const entry of node.breaks) {
        members.push({ name: node.name, dmxBreak: entry.dmxBreak, dmxOffset: entry.dmxOffset });
      }
      grouping.set(node.target, members);
    }
    for (const entry of node.children) collectReferences(entry);
  };
  for (const node of geometries) collectReferences(node);

  return {
    fixtureTypeId: fixture.attrs["FixtureTypeID"] ?? "",
    manufacturer: fixture.attrs["Manufacturer"] ?? "",
    name: fixture.attrs["Name"] ?? "",
    longName: fixture.attrs["LongName"] ?? "",
    shortName: fixture.attrs["ShortName"] ?? "",
    description: fixture.attrs["Description"] ?? "",
    revisionHint: revisionTexts.length > 0 ? revisionTexts[revisionTexts.length - 1]! : "",
    revisionTexts,
    models,
    geometries,
    modes,
    pixelGroupings: [...grouping].map(([geometry, members]) => ({ geometry, members })),
  };
}
