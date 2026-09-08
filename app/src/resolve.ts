// Beamhouse convergence: GDTF and OFL definitions resolve onto one fixture
// model, and the live renderer consumes it without learning the source format.
// The package owns mechanics (parse, select, lerp); this module owns policy:
// the eight-attribute set, the colour boundary, white points, tungsten drift,
// emitter layout, and the missing-definition/mode marks.
//
// LinearRGB is minted only here (plus reference-rig's delegating resolveColor):
// intensity-like quantities are proportional to radiance (ADR-0008 as amended).

import {
  combineDmx,
  emitterBindings,
  emitterPositions,
  lerpFunction,
  modeMasterNotes,
  resolveMode,
  selectFunction,
  type GdtfDefinition,
  type GdtfGeometryNode,
} from "gdtf-ts";
import { parseOflFixture, type OflConverged } from "./ofl.ts";

/** Branded linear-radiance triple. Minted only at the colour boundary. */
export type LinearRGB = Float32Array & { readonly __linearRgb: unique symbol };

export function mintLinearRGB(values: ArrayLike<number>): LinearRGB {
  const out = new Float32Array(values.length);
  for (let index = 0; index < out.length; index += 1) out[index] = values[index] ?? 0;
  return out as LinearRGB;
}

// T / T0 = (radiance fraction) ^ 0.1235, from T ∝ V^0.42 and Φ ∝ V^3.4
// (ADR-0037 decision 5, declared-lamp derivation in ADR-0045).
const TUNGSTEN_EXPONENT = 0.1235;

/** Declared CCT to LinearRGB via the Tanner-Helland approximation, linearized. */
export function blackbodyLinear(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let red: number;
  let green: number;
  let blue: number;
  if (t <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(t) - 161.1195681661;
    blue = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    blue = 255;
  }
  const linearize = (v: number): number => {
    const clamped = Math.min(255, Math.max(0, v)) / 255;
    return clamped <= 0.04045 ? clamped / 12.92 : Math.pow((clamped + 0.055) / 1.055, 2.4);
  };
  return [linearize(red), linearize(green), linearize(blue)];
}

type RegisteredDefinition =
  { kind: "gdtf"; definition: GdtfDefinition } | { kind: "ofl"; definition: OflConverged };

const registry = new Map<string, RegisteredDefinition>();

export function registerGdtf(id: string, definition: GdtfDefinition): void {
  registry.set(id, { kind: "gdtf", definition });
}

/** Parses (throwing on a non-fixture input) and registers under the id. */
export function registerOfl(id: string, input: unknown): void {
  registry.set(id, { kind: "ofl", definition: parseOflFixture(input) });
}

/** Tests reset the registry; the running product registers once per definition. */
export function clearDefinitions(): void {
  registry.clear();
}
/** Canonical attribute names: the one source of truth both formats resolve into. */
export const ATTR = {
  pan: "Pan",
  tilt: "Tilt",
  zoom: "Zoom",
  red: "ColorAdd_R",
  green: "ColorAdd_G",
  blue: "ColorAdd_B",
  dimmer: "Dimmer",
  shutter: "Shutter1",
  ctc: "CTC",
} as const;

/** The v1 consumed set (ADR-0010 rule 2); everything else resolves unconsumed. */
export const CONSUMED_ATTRIBUTES: readonly string[] = [
  ATTR.pan,
  ATTR.tilt,
  ATTR.zoom,
  ATTR.red,
  ATTR.green,
  ATTR.blue,
  ATTR.dimmer,
  ATTR.shutter,
];
export function hasDefinition(id: string): boolean {
  return registry.has(id);
}

export function hasMode(id: string, mode: string): boolean {
  const registered = registry.get(id);
  if (!registered) return false;
  return registered.definition.modes.some((entry) => entry.name === mode);
}

const CONE_BEAM_TYPES: Record<string, boolean> = {
  Wash: true,
  Fresnel: true,
  PC: true,
  Spot: true,
  Rectangle: true,
};

export type FixtureStatus = "ok" | "missing-definition" | "missing-mode";

export interface FixtureBeam {
  kind: "cone" | "glow" | "marker";
  angleDeg: number;
}

export interface FixtureState {
  status: FixtureStatus;
  /** A named but unavailable mode: placed, visibly unbound, no DMX binding. */
  unbound: boolean;
  panDeg: number;
  tiltDeg: number;
  /** Resolved Zoom, else the hang override, else the static declaration. */
  zoomDeg: number | null;
  /** Chromaticity: mixed RGB, or the declared white point with tungsten drift. */
  color: LinearRGB;
  /** Dimmer fraction gated by the shutter. */
  level: number;
  shutterOpen: boolean;
  beam: FixtureBeam;
  /** Strip texels row-major, null for single-emitter fixtures. */
  pixels: LinearRGB | null;
  /** Declared body size in metres; the fixed marker size where none is declared. */
  bodySize: [number, number, number];
  /** One ModeMaster line per offending function, empty otherwise. */
  notes: string[];
}

export interface BreakBase {
  universe: number;
  address: number;
}

export interface ResolveOverrides {
  /** Hang value in degrees for a Zoom with no wire (ADR-0037 decision 7). */
  zoomDeg?: number;
}

/** Fixed marker size: no dimensions are invented for what the file omits. */
export const MARKER_SIZE: [number, number, number] = [1, 0.5, 1];

export type EmitterLayout =
  | { kind: "discrete"; positions: [number, number, number][] }
  | { kind: "tiled"; count: number; sizeM: [number, number, number] }
  | { kind: "single" }
  | { kind: "marker" };

export interface FixtureStatics {
  size: [number, number, number];
  layout: EmitterLayout;
  beamKind: "cone" | "glow" | "marker";
  beamAngle: number | null;
  /** Declared FieldAngle in degrees, null where the file omits it. */
  fieldDeg: number | null;
  /** Declared BeamRadius in metres, null where the file omits it. */
  radiusM: number | null;
  /** BeamType soft/hard edge: Wash/Fresnel/PC soften, Spot/Rectangle do not. */
  softEdge: boolean;
}

function findBeam(nodes: readonly GdtfGeometryNode[]): GdtfGeometryNode | null {
  for (const node of nodes) {
    if (node.kind === "beam") return node;
    const nested = findBeam(node.children);
    if (nested) return nested;
  }
  return null;
}

function findGeometry(nodes: readonly GdtfGeometryNode[], name: string): GdtfGeometryNode | null {
  for (const node of nodes) {
    if (node.name === name) return node;
    const nested = findGeometry(node.children, name);
    if (nested) return nested;
  }
  return null;
}

interface GdtfStatics {
  beamType?: string;
  beamAngle: number;
  fieldDeg: number | null;
  radiusM: number | null;
  colorTemperature: number;
  lampType?: string;
  size: [number, number, number];
}

/** BeamType soft/hard degeneracy (ADR-0013.9): Wash/Fresnel/PC soften. */
const SOFT_BEAM_TYPES: Record<string, boolean> = {
  Wash: true,
  Fresnel: true,
  PC: true,
};

function gdtfStatics(definition: GdtfDefinition, modeName: string): GdtfStatics {
  const beam = findBeam(definition.geometries);
  const mode = definition.modes.find((entry) => entry.name === modeName);
  const root = mode ? findGeometry(definition.geometries, mode.geometry) : null;
  const model = root
    ? (definition.models.find((entry) => entry.name === root.target) ?? null)
    : null;
  const sized = model ?? definition.models[0] ?? null;
  return {
    ...(beam?.beamType !== undefined ? { beamType: beam.beamType } : {}),
    beamAngle: beam?.beamAngle ?? 0,
    fieldDeg: beam?.fieldAngle !== undefined && beam.fieldAngle > 0 ? beam.fieldAngle : null,
    radiusM: beam?.beamRadius ?? null,
    colorTemperature: beam?.colorTemperature ?? 6000,
    ...(beam?.lampType !== undefined ? { lampType: beam.lampType } : {}),
    size: sized ? [sized.length, sized.height, sized.width] : [...MARKER_SIZE],
  };
}
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function missingDefinitionState(): FixtureState {
  return {
    status: "missing-definition",
    unbound: false,
    panDeg: 0,
    tiltDeg: 0,
    zoomDeg: null,
    color: mintLinearRGB([0.5, 0.5, 0.5]),
    level: 0,
    shutterOpen: false,
    beam: { kind: "marker", angleDeg: 0 },
    pixels: null,
    bodySize: [...MARKER_SIZE],
    notes: [],
  };
}

/** One strip bake: per-emitter colour and dimmer, scaled by the shutter gate and master. */
function mintTexels(
  count: number,
  colors: readonly number[],
  dims: readonly number[],
  scale: number,
): LinearRGB {
  const texels = new Array<number>(count * 3);
  for (let emitter = 0; emitter < count; emitter += 1) {
    const dimmed = (dims[emitter] ?? 1) * scale;
    texels[emitter * 3] = (colors[emitter * 3] ?? 0) * dimmed;
    texels[emitter * 3 + 1] = (colors[emitter * 3 + 1] ?? 0) * dimmed;
    texels[emitter * 3 + 2] = (colors[emitter * 3 + 2] ?? 0) * dimmed;
  }
  return mintLinearRGB(texels);
}

function firstByAttribute(
  raw: readonly { attribute: string; value: number }[],
  attribute: string,
): number | undefined {
  return raw.find((entry) => entry.attribute === attribute)?.value;
}

function finishState(args: {
  status: FixtureStatus;
  unbound: boolean;
  raw: readonly { attribute: string; value: number }[];
  whiteK: number;
  drift: boolean;
  zoom: number | null;
  beam: FixtureBeam;
  pixels: LinearRGB | null;
  bodySize: [number, number, number];
  notes: string[];
}): FixtureState {
  const dimmer = clamp01(args.raw.find((entry) => entry.attribute === ATTR.dimmer)?.value ?? 1);
  const shutter = firstByAttribute(args.raw, ATTR.shutter);
  const shutterOpen = shutter === undefined ? true : shutter >= 0.5;
  const red = clamp01(firstByAttribute(args.raw, ATTR.red) ?? 0);
  const green = clamp01(firstByAttribute(args.raw, ATTR.green) ?? 0);
  const blue = clamp01(firstByAttribute(args.raw, ATTR.blue) ?? 0);
  // Colour off the wire is RGB or CTO (ADR-0045 decision 6): either holds the
  // tungsten drift. Only RGB supplies a colour, so a CTC-only wire keeps the
  // declared white point instead of rendering black.
  const hasColor =
    args.raw.some((entry) => entry.attribute === ATTR.red) ||
    args.raw.some((entry) => entry.attribute === ATTR.green) ||
    args.raw.some((entry) => entry.attribute === ATTR.blue);
  const hasColorWire = hasColor || args.raw.some((entry) => entry.attribute === ATTR.ctc);
  const kelvin =
    args.drift && !hasColorWire ? args.whiteK * Math.pow(dimmer, TUNGSTEN_EXPONENT) : args.whiteK;
  return {
    status: args.status,
    unbound: args.unbound,
    panDeg: firstByAttribute(args.raw, ATTR.pan) ?? 0,
    tiltDeg: firstByAttribute(args.raw, ATTR.tilt) ?? 0,
    zoomDeg: firstByAttribute(args.raw, ATTR.zoom) ?? args.zoom,
    color: mintLinearRGB(hasColor ? [red, green, blue] : blackbodyLinear(kelvin)),
    level: args.unbound ? 0 : dimmer * (shutterOpen ? 1 : 0),
    shutterOpen,
    beam: args.beam,
    pixels: args.unbound ? null : args.pixels,
    bodySize: args.bodySize,
    notes: args.notes,
  };
}

function resolveGdtf(
  definition: GdtfDefinition,
  modeName: string,
  readByte: (dmxBreak: number, offset: number) => number | undefined,
  overrides: ResolveOverrides | undefined,
): FixtureState {
  const statics = gdtfStatics(definition, modeName);
  const whiteK = statics.colorTemperature;
  const drift = statics.lampType === "Tungsten" || statics.lampType === "Halogen";
  const cone = statics.beamType !== undefined && (CONE_BEAM_TYPES[statics.beamType] ?? false);
  const mode = definition.modes.find((entry) => entry.name === modeName);
  if (!mode) {
    return finishState({
      status: "missing-mode",
      unbound: true,
      raw: [],
      whiteK,
      drift: false,
      zoom: statics.beamAngle,
      beam: cone ? { kind: "cone", angleDeg: statics.beamAngle } : { kind: "glow", angleDeg: 0 },
      pixels: null,
      bodySize: statics.size,
      notes: modeMasterNotes(definition),
    });
  }
  const raw =
    resolveMode(
      definition,
      modeName,
      readByte,
      overrides?.zoomDeg !== undefined ? { Zoom: overrides.zoomDeg } : undefined,
    ) ?? [];
  const zoom = firstByAttribute(raw, ATTR.zoom) ?? overrides?.zoomDeg ?? statics.beamAngle;
  const bindings = emitterBindings(definition, modeName) ?? [];
  const emitters = bindings.reduce((count, binding) => Math.max(count, binding.emitter + 1), 0);
  let pixels: LinearRGB | null = null;
  if (emitters > 1) {
    const grouped = new Set(definition.pixelGroupings.map((grouping) => grouping.geometry));
    const colors = new Array<number>(emitters * 3).fill(0);
    const dims = new Array<number>(emitters).fill(1);
    let pixelDimmer = false;
    for (const binding of bindings) {
      const bytes = binding.channel.offsets.map(
        (offset) => readByte(binding.dmxBreak, binding.base + offset - 1) ?? 0,
      );
      const value = combineDmx(bytes);
      const fn = selectFunction(binding.channel.functions, value);
      if (!fn) continue;
      const resolved = lerpFunction(fn, value);
      const base = binding.emitter * 3;
      if (fn.attribute === ATTR.red) colors[base] = clamp01(resolved);
      else if (fn.attribute === ATTR.green) colors[base + 1] = clamp01(resolved);
      else if (fn.attribute === ATTR.blue) colors[base + 2] = clamp01(resolved);
      else if (fn.attribute === ATTR.dimmer && grouped.has(binding.channel.geometry)) {
        dims[binding.emitter] = clamp01(resolved);
        pixelDimmer = true;
      }
    }
    // Texels carry the shutter gate and a master dimmer; a per-pixel dimmer
    // already lives in the texel, so a master would double-count it.
    const shutter = firstByAttribute(raw, ATTR.shutter);
    const gate = shutter === undefined ? 1 : shutter >= 0.5 ? 1 : 0;
    const master = pixelDimmer ? 1 : clamp01(firstByAttribute(raw, ATTR.dimmer) ?? 1);
    pixels = mintTexels(emitters, colors, dims, gate * master);
  }
  return finishState({
    status: "ok",
    unbound: false,
    raw,
    whiteK,
    drift,
    zoom,
    beam: cone ? { kind: "cone", angleDeg: zoom } : { kind: "glow", angleDeg: 0 },
    pixels,
    bodySize: statics.size,
    notes: modeMasterNotes(definition),
  });
}

function resolveOfl(
  definition: OflConverged,
  modeName: string,
  readSlot: (universe: number, slot: number) => number | undefined,
  breaks: readonly BreakBase[],
): FixtureState {
  const whiteK = definition.whitePointK ?? 6000;
  const bodySize = definition.dimensionsM ?? [...MARKER_SIZE];
  const mode = definition.modes.find((entry) => entry.name === modeName);
  const beam: FixtureBeam =
    definition.matrix && !definition.dimensionsM
      ? { kind: "marker", angleDeg: 0 }
      : definition.matrix
        ? { kind: "glow", angleDeg: 0 }
        : definition.lensDeg
          ? { kind: "cone", angleDeg: definition.lensDeg[0] ?? 0 }
          : { kind: "glow", angleDeg: 0 };
  if (!mode) {
    return finishState({
      status: "missing-mode",
      unbound: true,
      raw: [],
      whiteK,
      drift: false,
      zoom: definition.lensDeg?.[0] ?? null,
      beam,
      pixels: null,
      bodySize,
      notes: [],
    });
  }
  const base = breaks[0];
  const raw = mode.slots.map((slot) => ({
    attribute: slot.attribute,
    value: slot.resolve(base ? (readSlot(base.universe, base.address + slot.index) ?? 0) : 0),
    unit: slot.unit,
    perPixel: slot.perPixel,
  }));
  let pixels: LinearRGB | null = null;
  if (definition.matrix && definition.dimensionsM) {
    const count = definition.matrix.x * definition.matrix.y;
    const colors = new Array<number>(count * 3).fill(0);
    const dims = new Array<number>(count).fill(1);
    let pixelDimmer = false;
    for (const slot of mode.slots) {
      if (slot.pixel === null || slot.pixel >= count) continue;
      const value = slot.resolve(
        base ? (readSlot(base.universe, base.address + slot.index) ?? 0) : 0,
      );
      const at = slot.pixel * 3;
      if (slot.attribute === ATTR.red) colors[at] = clamp01(value);
      else if (slot.attribute === ATTR.green) colors[at + 1] = clamp01(value);
      else if (slot.attribute === ATTR.blue) colors[at + 2] = clamp01(value);
      else if (slot.attribute === ATTR.dimmer && slot.perPixel) {
        dims[slot.pixel] = clamp01(value);
        pixelDimmer = true;
      }
    }
    const shutter = firstByAttribute(raw, ATTR.shutter);
    const gate = shutter === undefined ? 1 : shutter >= 0.5 ? 1 : 0;
    const master = pixelDimmer
      ? 1
      : clamp01(
          raw.find((entry) => entry.attribute === ATTR.dimmer && !entry.perPixel)?.value ?? 1,
        );
    pixels = mintTexels(count, colors, dims, gate * master);
  }
  return finishState({
    status: "ok",
    unbound: false,
    raw,
    whiteK,
    // An OFL fixture's lamp type is absent by decision (ADR-0045 amendment):
    // the static white point is the ceiling, it never warms.
    drift: false,
    zoom: firstByAttribute(raw, ATTR.zoom) ?? definition.lensDeg?.[0] ?? null,
    beam,
    pixels,
    bodySize,
    notes: [],
  });
}

/**
 * Total per-tick resolution through one seam for every definition source.
 * Missing definitions and modes resolve to marked states, never throws.
 */
export function resolveFixture(
  id: string,
  mode: string,
  readSlot: (universe: number, slot: number) => number | undefined,
  breaks: readonly BreakBase[],
  overrides?: ResolveOverrides,
): FixtureState {
  const registered = registry.get(id);
  if (!registered) return missingDefinitionState();
  if (registered.kind === "gdtf") {
    const readByte = (dmxBreak: number, offset: number): number | undefined => {
      const base = breaks[dmxBreak - 1];
      if (!base) return undefined;
      return readSlot(base.universe, base.address + offset - 1);
    };
    return resolveGdtf(registered.definition, mode, readByte, overrides);
  }
  return resolveOfl(registered.definition, mode, readSlot, breaks);
}

/** Declared emitter layout: GDTF placement, OFL matrix tiling, else single/marker. */
export function emitterLayout(id: string, mode?: string): EmitterLayout {
  const registered = registry.get(id);
  if (!registered) return { kind: "marker" };
  if (registered.kind === "gdtf") {
    const groupings = emitterPositions(registered.definition);
    const bound =
      mode !== undefined
        ? (registered.definition.modes
            .find((entry) => entry.name === mode)
            ?.channels.map((channel) => channel.geometry) ?? [])
        : [];
    const placed = groupings.find((grouping) => bound.includes(grouping.geometry)) ?? groupings[0];
    if (!placed || placed.positions.length <= 1) return { kind: "single" };
    return { kind: "discrete", positions: placed.positions };
  }
  const matrix = registered.definition.matrix;
  if (!matrix) return { kind: "single" };
  if (!registered.definition.dimensionsM) return { kind: "marker" };
  return {
    kind: "tiled",
    count: matrix.x * matrix.y,
    sizeM: registered.definition.dimensionsM,
  };
}

/** Static declaration for mesh sizing: null only where nothing is declared. */
export function staticsFor(id: string, mode?: string): FixtureStatics | null {
  const registered = registry.get(id);
  if (!registered) return null;
  if (registered.kind === "gdtf") {
    const statics = gdtfStatics(registered.definition, mode ?? "");
    const cone = statics.beamType !== undefined && (CONE_BEAM_TYPES[statics.beamType] ?? false);
    return {
      size: statics.size,
      layout: emitterLayout(id, mode),
      beamKind: cone ? "cone" : "glow",
      beamAngle: cone ? statics.beamAngle : null,
      fieldDeg: cone ? statics.fieldDeg : null,
      radiusM: cone ? statics.radiusM : null,
      softEdge:
        cone && (statics.beamType === undefined || (SOFT_BEAM_TYPES[statics.beamType] ?? false)),
    };
  }
  const layout = emitterLayout(id, mode);
  // Mirrors resolveOfl: a matrix stays on the strip path (glow) even with a
  // lens; only a sole emitter draws the cone (ADR-0043).
  let beamKind: FixtureStatics["beamKind"] = registered.definition.lensDeg ? "cone" : "glow";
  if (layout.kind === "marker") beamKind = "marker";
  else if (layout.kind === "tiled") beamKind = "glow";
  return {
    size: registered.definition.dimensionsM ?? [...MARKER_SIZE],
    layout,
    beamKind,
    beamAngle: registered.definition.lensDeg?.[0] ?? null,
    fieldDeg: null,
    radiusM: null,
    // OFL declares no edge type; a sole lens reads soft.
    softEdge: beamKind === "cone",
  };
}
