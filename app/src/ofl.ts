// OFL reader: third-party JSON fixtures converge onto the same
// { attribute, value, unit } shape gdtf-ts resolves. Parsed here, consumed by
// resolve.ts; the renderer never branches on source format (ADR-0043 rule 8).
//
// Assumed OFL subset (schemas/fixture.json at master): physical.dimensions as
// { width, height, depth } in mm (an array reads positionally), physical.lens
// .degreesMinMax as [min, max], physical.bulb.colorTemperature in kelvin,
// matrix.pixelCount as [x, y, ...], templateChannels keyed by channel template
// with $pixelKey expanded over the pixel keys, modes[].channels in DMX order.
// physical.bulb.type is parsed into bulbTypeRaw and never consulted (ADR-0045).

/** One DMX slot of an OFL mode, in wire order. */
export interface OflSlot {
  /** 0-based offset within the mode footprint. */
  index: number;
  /** Pixel index for matrix fixtures, null for single-emitter channels. */
  pixel: number | null;
  /** True when expanded from a $pixelKey template; a master channel is not. */
  perPixel: boolean;
  attribute: string;
  unit: string;
  /** DMX byte 0..255 to physical value. */
  resolve: (dmx: number) => number;
}

export interface OflMode {
  name: string;
  slots: OflSlot[];
}

export interface OflConverged {
  name: string;
  modes: OflMode[];
  /** [width, height, depth] in metres, null where the file declares none. */
  dimensionsM: [number, number, number] | null;
  /** [min, max] beam degrees, null where the file declares none. */
  lensDeg: [number, number] | null;
  whitePointK: number | null;
  /** Raw lamp-technology text: parsed and never consulted. */
  bulbTypeRaw: string | null;
  /** Declared matrix extent; null for single-emitter fixtures. */
  matrix: { x: number; y: number; z: number } | null;
}

/** Unit-suffixed entity strings to numbers: "off" to 0, "bright" to 1. */
export function entityNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (text === "off" || text === "closed" || text === "blackout") return 0;
  if (text === "bright" || text === "open" || text === "full") return 1;
  const percent = text.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (percent) return Number(percent[1]) / 100;
  const suffixed = text.match(/^(-?\d+(?:\.\d+)?)\s*(deg|°|lm|k|kelvin)?$/);
  if (suffixed) return Number(suffixed[1]);
  return null;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Array.isArray narrows to any[]; this keeps unknown[] so the JSON stays typed. */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

interface CapabilityRange {
  from: number;
  to: number;
  start: number;
  end: number;
}

const START_KEYS = ["brightnessStart", "angleStart", "rangeStart", "startValue", "start"];
const END_KEYS = ["brightnessEnd", "angleEnd", "rangeEnd", "endValue", "end"];
const EFFECT_KEYS = ["shutterEffect", "effectName", "effect", "value", "name"];

function firstNumber(capability: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const raw = capability[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const parsed = entityNumber(raw);
    if (parsed !== null) return parsed;
  }
  return null;
}

function rangeFor(
  capability: Record<string, unknown>,
  fallback: [number, number],
): CapabilityRange {
  const range = capability["dmxRange"];
  const from = Array.isArray(range) && typeof range[0] === "number" ? range[0] : 0;
  const to = Array.isArray(range) && typeof range[1] === "number" ? range[1] : 255;
  const start = firstNumber(capability, START_KEYS) ?? fallback[0];
  const end = firstNumber(capability, END_KEYS) ?? fallback[1];
  return { from, to, start, end };
}

/** Attribute and unit for a capability; unknown types pass through unconsumed. */
// Emitted names stay identical to resolve.ts ATTR: the mapping table is the
// OFL side of that contract, pinned by the canonical-vocabulary unit test.
function attributeFor(type: string, capability: Record<string, unknown>): [string, string] {
  switch (type) {
    case "Intensity":
      return ["Dimmer", "None"];
    case "ColorIntensity": {
      const color = capability["color"];
      if (color === "Red") return ["ColorAdd_R", "ColorComponent"];
      if (color === "Green") return ["ColorAdd_G", "ColorComponent"];
      if (color === "Blue") return ["ColorAdd_B", "ColorComponent"];
      return [`ColorAdd_${typeof color === "string" ? color : "Unknown"}`, "ColorComponent"];
    }
    case "Shutter":
      return ["Shutter1", "None"];
    case "Strobe":
      return ["Shutter1Strobe", "Frequency"];
    case "Pan":
      return ["Pan", "Angle"];
    case "Tilt":
      return ["Tilt", "Angle"];
    case "Zoom":
      return ["Zoom", "Angle"];
    case "ColorTemperature":
      return ["CTC", "Temperature"];
    default:
      return [type, ""];
  }
}
function constantFor(capability: Record<string, unknown>): number | null {
  for (const key of EFFECT_KEYS) {
    const parsed = entityNumber(capability[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function slotResolve(type: string, capability: Record<string, unknown>): (dmx: number) => number {
  const constant = constantFor(capability);
  if (constant !== null && capability["dmxRange"] === undefined) {
    if (
      START_KEYS.every((key) => capability[key] === undefined) &&
      END_KEYS.every((key) => capability[key] === undefined)
    )
      return () => constant;
  }
  // A named shutter effect the entity table cannot parse (strobe, pulse) is
  // active light, not a closed shutter: it resolves lit.
  if (
    constant === null &&
    type === "Shutter" &&
    EFFECT_KEYS.some((key) => typeof capability[key] === "string" && capability[key] !== "")
  )
    return () => 1;
  const fallback: [number, number] = type === "Shutter" ? [constant ?? 0, constant ?? 0] : [0, 1];
  const range = rangeFor(capability, fallback);
  return (dmx: number) => {
    const span = range.to - range.from;
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, (dmx - range.from) / span));
    return range.start + t * (range.end - range.start);
  };
}

function templateSlots(
  templateKey: string,
  templates: Record<string, unknown>,
): Omit<OflSlot, "index" | "pixel" | "perPixel"> {
  const entry = recordOf(templates[templateKey]);
  const capability = recordOf(entry?.["capability"]);
  const listed = entry?.["capabilities"];
  const capabilities = Array.isArray(listed) ? listed : capability ? [capability] : [];
  const parsed = capabilities.map(recordOf).filter((candidate) => candidate !== null);
  const first = parsed[0];
  if (!first) return { attribute: "", unit: "", resolve: () => 0 };
  const type = typeof first["type"] === "string" ? first["type"] : "";
  const [attribute, unit] = attributeFor(type, first);
  if (parsed.length === 1) return { attribute, unit, resolve: slotResolve(type, first) };
  const ranges = parsed.map((candidate) => ({
    from:
      Array.isArray(candidate["dmxRange"]) && typeof candidate["dmxRange"][0] === "number"
        ? candidate["dmxRange"][0]
        : 0,
    resolve: slotResolve(type, candidate),
  }));
  return {
    attribute,
    unit,
    resolve: (dmx: number) => {
      let active = ranges[0]?.resolve ?? (() => 0);
      for (const range of ranges) {
        if (range.from <= dmx) active = range.resolve;
      }
      return active(dmx);
    },
  };
}

function pixelKeysOf(fixture: Record<string, unknown>): string[] {
  // Tiling is explicitly 2D (x * y): a Z-depth above 1 is carried on matrix.z
  // for information and never tiled, per ADR-0044 rule 2 (unexercised, not ruled out).
  const matrix = recordOf(fixture["matrix"]);
  const declared = matrix?.["pixelKeys"];
  if (isArray(declared)) {
    const keys = declared.filter((key): key is string => typeof key === "string");
    if (keys.length === declared.length) return keys;
  }
  const count = matrix?.["pixelCount"];
  const axes = isArray(count) ? count.slice(0, 2) : [];
  const factors = axes.filter(
    (entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry > 0,
  );
  const total =
    axes.length > 0 && factors.length === axes.length
      ? factors.reduce((product, entry) => product * entry, 1)
      : 0;
  return Array.from({ length: total }, (_, index) => String(index + 1));
}

function dimensionsOf(fixture: Record<string, unknown>): [number, number, number] | null {
  const dimensions = recordOf(fixture["physical"])?.["dimensions"];
  const fields = recordOf(dimensions);
  const triple: unknown[] | null = isArray(dimensions)
    ? dimensions
    : fields
      ? [fields["width"], fields["height"], fields["depth"]]
      : null;
  if (!triple) return null;
  const metres = triple.map((entry) =>
    typeof entry === "number" && Number.isFinite(entry) ? entry / 1000 : NaN,
  );
  const [width, height, depth] = metres;
  return metres.every((entry) => Number.isFinite(entry) && entry > 0) &&
    typeof width === "number" &&
    typeof height === "number" &&
    typeof depth === "number"
    ? [width, height, depth]
    : null;
}

/** Fixture JSON to the converged shape; throws on a non-fixture input. */
export function parseOflFixture(input: unknown): OflConverged {
  const fixture = recordOf(input);
  if (!fixture || typeof fixture["name"] !== "string") throw new Error("ofl: not a fixture object");
  const physical = recordOf(fixture["physical"]);
  const lens = recordOf(physical?.["lens"]);
  const bulb = recordOf(physical?.["bulb"]);
  const degrees = lens?.["degreesMinMax"];
  const degMin = isArray(degrees) ? degrees[0] : undefined;
  const degMax = isArray(degrees) ? degrees[1] : undefined;
  const lensDeg: [number, number] | null =
    typeof degMin === "number" &&
    typeof degMax === "number" &&
    Number.isFinite(degMin) &&
    Number.isFinite(degMax)
      ? [degMin, degMax]
      : null;
  const whitePointK =
    typeof bulb?.["colorTemperature"] === "number" && Number.isFinite(bulb["colorTemperature"])
      ? bulb["colorTemperature"]
      : null;
  const rawCount = recordOf(fixture["matrix"])?.["pixelCount"];
  const countAxes = isArray(rawCount) ? rawCount.slice(0, 3) : null;
  const countInts =
    countAxes?.filter(
      (entry): entry is number => typeof entry === "number" && Number.isInteger(entry),
    ) ?? [];
  const matrix =
    countAxes && countInts.length === countAxes.length
      ? {
          x: countInts[0] ?? 0,
          y: countInts[1] ?? 1,
          z: countInts[2] ?? 1,
        }
      : null;
  const templates = recordOf(fixture["templateChannels"]) ?? {};
  const available = recordOf(fixture["availableChannels"]) ?? templates;
  const keys = pixelKeysOf(fixture);
  const modes = isArray(fixture["modes"]) ? fixture["modes"] : [];
  return {
    name: fixture["name"],
    modes: modes.flatMap((mode): OflMode[] => {
      const entry = recordOf(mode);
      const channels = entry ? entry["channels"] : undefined;
      if (!entry || typeof entry["name"] !== "string" || !isArray(channels)) return [];
      const slots: OflSlot[] = [];
      for (const raw of channels) {
        if (typeof raw !== "string") continue;
        const resolved = recordOf(available[raw])?.["channel"];
        const templateKey = typeof resolved === "string" ? resolved : raw;
        if (templateKey.includes("$pixelKey")) {
          // Modes reference the template itself; it expands in place over the
          // pixel keys, one slot per pixel in pixel-key order.
          const slot = templateSlots(templateKey, templates);
          keys.forEach((_key, pixel) => {
            slots.push({ ...slot, index: slots.length, pixel, perPixel: true });
          });
        } else {
          const slot = templateSlots(templateKey, templates);
          slots.push({ ...slot, index: slots.length, pixel: matrix ? 0 : null, perPixel: false });
        }
      }
      return [{ name: entry["name"], slots }];
    }),
    dimensionsM: dimensionsOf(fixture),
    lensDeg,
    whitePointK,
    bulbTypeRaw: typeof bulb?.["type"] === "string" ? bulb["type"] : null,
    matrix,
  };
}
