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
  /** Declared emitter data the converged fixture model reads; absent where the file omits it. */
  beamRadius?: number;
  colorTemperature?: number;
  lampType?: string;
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

/** A ChannelSet is the fixture's own UI label: parsed, never resolved (ADR-0010 rule 4). */
export interface GdtfChannelSet {
  name: string;
  dmxFrom: string;
  dmxTo: string;
}

export interface GdtfChannelFunction {
  name: string;
  attribute: string;
  dmxFrom: string;
  dmxTo: string;
  /** Numeric select/lerp endpoints in DMX space. */
  dmxFromValue: number;
  dmxToValue: number;
  physicalFrom: number;
  physicalTo: number;
  /** DMX value taken when nothing drives the function (virtual channels with no override). */
  defaultValue: number;
  /** Carried for diagnostics; the resolver never consults it (ADR-0010 rule 5). */
  modeMaster?: string;
  /** Parsed UI labels; resolution ignores them — 0 of 756 carry physical data. */
  sets: GdtfChannelSet[];
}

export interface GdtfChannel {
  geometry: string;
  offset: string;
  /** 1-based slot offsets within the break; empty for virtual channels (Offset=""). */
  offsets: number[];
  dmxBreak: number;
  attribute: string;
  /** LogicalChannel Master as written; ModeMaster detection reads functions, not this. */
  master: string;
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
  /** PhysicalUnit per Attribute name: the unit interprets, never selects (ADR-0010 rule 2). */
  attributeUnits: Record<string, string>;
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
    const beamRadius = Number(node.attrs["BeamRadius"]);
    if (node.attrs["BeamRadius"] !== undefined && !Number.isNaN(beamRadius))
      parsed.beamRadius = beamRadius;
    const colorTemperature = Number(node.attrs["ColorTemperature"]);
    if (node.attrs["ColorTemperature"] !== undefined && !Number.isNaN(colorTemperature))
      parsed.colorTemperature = colorTemperature;
    const lampType = node.attrs["LampType"];
    if (lampType !== undefined) parsed.lampType = lampType;
  }
  for (const entry of node.children) {
    if (entry.tag === "Break") continue;
    parsed.children.push(parseGeometryNode(entry));
  }
  return parsed;
}
/** A DMX bound as written ("32768/2"): absolute value plus byte width. */
export interface GdtfDmxBound {
  value: number;
  width: number;
}

export function parseDmxBound(text: string | undefined): GdtfDmxBound {
  const [rawValue, rawWidth] = (text ?? "").split("/");
  const value = Number(rawValue);
  const width = Number(rawWidth);
  return {
    value: rawValue === undefined || rawValue === "" || Number.isNaN(value) ? 0 : value,
    width: Number.isInteger(width) && width > 0 ? width : 1,
  };
}

/** A DMXChannel Offset as written ("1,2", "1", ""): 1-based slot offsets, empty for virtual channels. */
export function parseOffset(text: string | undefined): number[] {
  if (text === undefined || text.trim() === "") return [];
  return text
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 1);
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
      const offsets = parseOffset(entry.attrs["Offset"]);
      // An absent DMXTo spans the channel: every profile on the rig omits it,
      // so the function runs to the channel's own width rather than collapsing.
      const spanTo = 256 ** Math.max(1, offsets.length) - 1;
      return {
        geometry: entry.attrs["Geometry"] ?? "",
        offset: entry.attrs["Offset"] ?? "",
        offsets,
        dmxBreak: num(entry.attrs["DMXBreak"], 1),
        attribute: logical?.attrs["Attribute"] ?? "",
        master: logical?.attrs["Master"] ?? "None",
        functions: logical
          ? children(logical, "ChannelFunction").map((fn) => {
              const from = parseDmxBound(fn.attrs["DMXFrom"]);
              const rawTo = fn.attrs["DMXTo"];
              const to = rawTo === undefined || rawTo === "" ? spanTo : parseDmxBound(rawTo).value;
              const modeMaster = fn.attrs["ModeMaster"];
              return {
                name: fn.attrs["Name"] ?? "",
                attribute: fn.attrs["Attribute"] ?? "",
                dmxFrom: fn.attrs["DMXFrom"] ?? "",
                dmxTo: fn.attrs["DMXTo"] ?? "",
                dmxFromValue: from.value,
                dmxToValue: to,
                physicalFrom: num(fn.attrs["PhysicalFrom"], 0),
                physicalTo: num(fn.attrs["PhysicalTo"], 0),
                defaultValue: parseDmxBound(fn.attrs["Default"]).value,
                ...(modeMaster === undefined ? {} : { modeMaster }),
                sets: children(fn, "ChannelSet").map((set) => ({
                  name: set.attrs["Name"] ?? "",
                  dmxFrom: set.attrs["DMXFrom"] ?? "",
                  dmxTo: set.attrs["DMXTo"] ?? "",
                })),
              };
            })
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
    attributeUnits: attributeUnitsFor(fixture),
    models,
    geometries,
    modes,
    pixelGroupings: [...grouping].map(([geometry, members]) => ({ geometry, members })),
  };
}

function attributeUnitsFor(fixture: XmlNode): Record<string, string> {
  const units: Record<string, string> = {};
  const definitions = child(fixture, "AttributeDefinitions");
  const attributes = definitions ? child(definitions, "Attributes") : undefined;
  for (const entry of attributes ? children(attributes, "Attribute") : []) {
    const name = entry.attrs["Name"];
    const unit = entry.attrs["PhysicalUnit"];
    if (name !== undefined && unit !== undefined) units[name] = unit;
  }
  return units;
}

/** One mechanically resolved channel: the unit interprets the number (ADR-0010 rule 2). */
export interface GdtfResolvedChannel {
  attribute: string;
  value: number;
  unit: string;
}

/** Combine coarse-to-fine bytes into one DMX value, big-endian. */
export function combineDmx(bytes: readonly number[]): number {
  let value = 0;
  for (const byte of bytes) value = value * 256 + (byte & 0xff);
  return value;
}

/** Active function by DMXFrom alone: greatest DMXFrom at or below the value, else the first. */
export function selectFunction(
  functions: readonly GdtfChannelFunction[],
  dmxValue: number,
): GdtfChannelFunction | undefined {
  let active: GdtfChannelFunction | undefined;
  for (const fn of functions) {
    if (fn.dmxFromValue <= dmxValue) active = fn;
  }
  return active ?? functions[0];
}

/** Unsorted-endpoint lerp: t is clamped in DMX space only, the physical result never is. */
export function lerpFunction(fn: GdtfChannelFunction, dmxValue: number): number {
  const span = fn.dmxToValue - fn.dmxFromValue;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (dmxValue - fn.dmxFromValue) / span));
  return fn.physicalFrom + t * (fn.physicalTo - fn.physicalFrom);
}

function unitFor(definition: GdtfDefinition, attribute: string): string {
  return definition.attributeUnits[attribute] ?? "";
}

/**
 * Total mechanical resolution of one mode: every channel emits { attribute, value, unit }.
 * readByte answers raw slot bytes; absent bytes read 0. Virtual channels (Offset="")
 * resolve their Default unless overrides carries the LogicalChannel attribute in
 * physical units — a hang value for a channel with no wire. Null when the mode
 * is missing; a missing mode is marked, never guessed.
 */
export function resolveMode(
  definition: GdtfDefinition,
  modeName: string,
  readByte: (dmxBreak: number, offset: number) => number | undefined,
  overrides?: Readonly<Record<string, number>>,
): GdtfResolvedChannel[] | null {
  const mode = definition.modes.find((entry) => entry.name === modeName);
  if (!mode) return null;
  return mode.channels.map((channel) => {
    if (channel.offsets.length === 0) {
      const fn = channel.functions[0];
      if (!fn)
        return {
          attribute: channel.attribute,
          value: 0,
          unit: unitFor(definition, channel.attribute),
        };
      const override = overrides?.[channel.attribute];
      if (override !== undefined)
        return {
          attribute: fn.attribute,
          value: override,
          unit: unitFor(definition, fn.attribute),
        };
      return {
        attribute: fn.attribute,
        value: lerpFunction(fn, fn.defaultValue),
        unit: unitFor(definition, fn.attribute),
      };
    }
    const value = combineDmx(
      channel.offsets.map((offset) => readByte(channel.dmxBreak, offset) ?? 0),
    );
    const fn = selectFunction(channel.functions, value);
    if (!fn)
      return {
        attribute: channel.attribute,
        value: 0,
        unit: unitFor(definition, channel.attribute),
      };
    return {
      attribute: fn.attribute,
      value: lerpFunction(fn, value),
      unit: unitFor(definition, fn.attribute),
    };
  });
}

/** Every ModeMaster declaration: the resolver ignores them, Beamhouse logs one line per fixture type. */
export function modeMasterNotes(definition: GdtfDefinition): string[] {
  const notes: string[] = [];
  for (const mode of definition.modes)
    for (const channel of mode.channels)
      for (const fn of channel.functions)
        if (fn.modeMaster !== undefined)
          notes.push(
            `${mode.name}/${channel.geometry}/${fn.name}: ModeMaster="${fn.modeMaster}" ignored; select is by DMXFrom`,
          );
  return notes;
}

/** One channel's slots for one emitter: base is the member's 1-based break offset. */
export interface GdtfEmitterBinding {
  emitter: number;
  dmxBreak: number;
  base: number;
  channel: GdtfChannel;
}

/**
+ * Per-emitter channel slots for one mode. Channels bound to a pixel-grouped
+ * geometry expand over the grouping members; every other channel drives
+ * emitter 0 directly. Null when the mode is missing.
+ */
export function emitterBindings(
  definition: GdtfDefinition,
  modeName: string,
): GdtfEmitterBinding[] | null {
  const mode = definition.modes.find((entry) => entry.name === modeName);
  if (!mode) return null;
  const out: GdtfEmitterBinding[] = [];
  const grouped = new Set<string>();
  for (const grouping of definition.pixelGroupings) {
    const bound = mode.channels.filter((channel) => channel.geometry === grouping.geometry);
    if (bound.length === 0) continue;
    grouped.add(grouping.geometry);
    grouping.members.forEach((member, emitter) => {
      for (const channel of bound)
        if (channel.offsets.length > 0)
          out.push({ emitter, dmxBreak: member.dmxBreak, base: member.dmxOffset, channel });
    });
  }
  for (const channel of mode.channels) {
    if (grouped.has(channel.geometry)) continue;
    if (channel.offsets.length === 0) continue;
    out.push({ emitter: 0, dmxBreak: channel.dmxBreak, base: 1, channel });
  }
  return out;
}

function geometryPath(
  nodes: readonly GdtfGeometryNode[],
  name: string,
  trail: readonly string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.name === name) return [...trail, node.name];
    const nested = geometryPath(node.children, name, [...trail, node.name]);
    if (nested) return nested;
  }
  return null;
}

/** Fixture-local emitter origins per pixel grouping, in member order. */
export function emitterPositions(definition: GdtfDefinition): {
  geometry: string;
  positions: [number, number, number][];
}[] {
  return definition.pixelGroupings.map((grouping) => ({
    geometry: grouping.geometry,
    positions: grouping.members.map((member) => {
      const path = geometryPath(definition.geometries, member.name);
      return path ? translationOf(worldTransform(definition.geometries, path)) : [0, 0, 0];
    }),
  }));
}
