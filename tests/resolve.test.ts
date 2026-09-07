// Total attribute convergence: the 8-attribute policy set, the colour
// boundary, declared white points, tungsten drift, emitter layout, and the
// missing-definition/mode marks — over committed authored definitions plus
// inline third-party OFL shapes.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  identityMatrix,
  parseGdtf,
  type GdtfChannel,
  type GdtfChannelFunction,
  type GdtfDefinition,
} from "../packages/gdtf-ts/src/index.ts";
import { parseOflFixture } from "../app/src/ofl.ts";
import {
  ATTR,
  blackbodyLinear,
  clearDefinitions,
  CONSUMED_ATTRIBUTES,
  emitterLayout,
  hasDefinition,
  hasMode,
  MARKER_SIZE,
  registerGdtf,
  registerOfl,
  resolveFixture,
  staticsFor,
  type BreakBase,
} from "../app/src/resolve.ts";

const repository = resolve(import.meta.dir, "..");

const GLP = "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48";
const SPOKE = "gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016";
const PAR38 = "gdtf:FFC1C66D-905A-47AB-87DB-5FCEEF121B1A";
const E27 = "gdtf:AD8F1059-A90D-4477-85EB-FD93C185D1B3";
const PROFILE = "gdtf:1081DF90-2D92-493F-B1F7-7B7D90B778CD";

function loadAuthored(filename: string): GdtfDefinition {
  return parseGdtf(
    new Uint8Array(readFileSync(resolve(repository, "definitions/authored", filename))),
  );
}

function seedCommitted(): void {
  clearDefinitions();
  registerGdtf(GLP, loadAuthored("GLP@impression 90 RGB@v1.gdtf"));
  registerGdtf(SPOKE, loadAuthored("Beamhouse@WLED STAR-TENT Spoke 23px@v1.gdtf"));
  registerGdtf(PAR38, loadAuthored("Beamhouse@generic PAR38@v1.gdtf"));
  registerGdtf(E27, loadAuthored("Beamhouse@generic E27 practical@v1.gdtf"));
  registerGdtf(PROFILE, loadAuthored("Beamhouse@generic profile@v1.gdtf"));
}

function frame(universe: number, slots: readonly number[]): Map<number, Uint8Array> {
  const bytes = new Uint8Array(512);
  slots.forEach((value, index) => {
    bytes[index] = value ?? 0;
  });
  return new Map([[universe, bytes]]);
}

const readFrom = (frames: ReadonlyMap<number, Uint8Array>) => (universe: number, slot: number) =>
  frames.get(universe)?.[slot - 1];

function close(actual: ArrayLike<number>, expected: readonly number[], eps = 1e-6): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(Math.abs((actual[index] ?? 0) - (expected[index] ?? 0))).toBeLessThan(eps);
  }
}

const MATRIX_BAR = {
  name: "Test Bar 6px",
  physical: { dimensions: { width: 1200, height: 100, depth: 50 } },
  matrix: { pixelCount: [6, 1, 1] },
  templateChannels: {
    "Red $pixelKey": {
      capability: {
        type: "ColorIntensity",
        color: "Red",
        brightnessStart: "off",
        brightnessEnd: "bright",
      },
    },
    "Green $pixelKey": {
      capability: {
        type: "ColorIntensity",
        color: "Green",
        brightnessStart: "off",
        brightnessEnd: "bright",
      },
    },
    "Blue $pixelKey": {
      capability: {
        type: "ColorIntensity",
        color: "Blue",
        brightnessStart: "off",
        brightnessEnd: "bright",
      },
    },
  },
  modes: [{ name: "6px RGB", channels: ["Red $pixelKey", "Green $pixelKey", "Blue $pixelKey"] }],
};

const SPOT_OFL = {
  name: "Test Spot",
  physical: {
    dimensions: { width: 200, height: 300, depth: 200 },
    lens: { degreesMinMax: [4.5, 25] },
    bulb: { colorTemperature: 3000, type: "Tungsten T19" },
  },
  templateChannels: {
    Dimmer: { capability: { type: "Intensity" } },
    Shutter: {
      capabilities: [
        { type: "Shutter", shutterEffect: "Closed", dmxRange: [0, 10] },
        { type: "Shutter", shutterEffect: "Strobe", dmxRange: [11, 255] },
      ],
    },
  },
  modes: [{ name: "Spot", channels: ["Dimmer", "Shutter"] }],
};

test("the policy set is exactly the eight consumed attributes", () => {
  expect([...CONSUMED_ATTRIBUTES].sort()).toEqual(
    [
      ATTR.pan,
      ATTR.tilt,
      ATTR.zoom,
      ATTR.red,
      ATTR.green,
      ATTR.blue,
      ATTR.dimmer,
      ATTR.shutter,
    ].sort(),
  );
});

test("a mover resolves Pan, Tilt, colour, dimmer and shutter through one seam", () => {
  seedCommitted();
  // Pan/tilt at zero, macro shut, full red, shutter open, full dimmer.
  const slots = [0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0];
  const state = resolveFixture(GLP, "Normal", readFrom(frame(7, slots)), [
    { universe: 7, address: 1 },
  ]);
  expect(state.status).toBe("ok");
  expect(state.unbound).toBe(false);
  expect(state.panDeg).toBe(-330);
  expect(state.tiltDeg).toBe(-150);
  close(state.color, [1, 0, 0]);
  expect(state.level).toBe(1);
  expect(state.shutterOpen).toBe(true);
  expect(state.zoomDeg).toBe(10);
  expect(state.beam).toEqual({ kind: "cone", angleDeg: 10 });
  expect(state.pixels).toBeNull();
  expect(state.notes).toEqual([]);
});

test("unconsumed attributes resolve but change nothing", () => {
  seedCommitted();
  const plain = [0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0];
  const piled = [0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255, 255];
  const read = (slots: number[]) =>
    resolveFixture(GLP, "Normal", readFrom(frame(7, slots)), [{ universe: 7, address: 1 }]);
  const left = read(plain);
  const right = read(piled);
  close(left.color, [...right.color]);
  expect(left.level).toBe(right.level);
  expect(left.panDeg).toBe(right.panDeg);
});

test("a closed shutter gates the render; a strobe range reads lit", () => {
  seedCommitted();
  const at = (shutter: number) => {
    const slots = [0, 0, 0, 0, 0, 255, 0, 0, shutter, 255, 0, 0, 0, 0];
    return resolveFixture(GLP, "Normal", readFrom(frame(7, slots)), [{ universe: 7, address: 1 }]);
  };
  expect(at(0).shutterOpen).toBe(false);
  expect(at(0).level).toBe(0);
  expect(at(255).shutterOpen).toBe(true);
  expect(at(255).level).toBe(1);
  expect(at(100).shutterOpen).toBe(true);
  expect(at(100).level).toBe(1);
});

test("tungsten loads drift from their declared white point", () => {
  seedCommitted();
  const at = (id: string, dimmer: number) =>
    resolveFixture(id, "Dimmer", readFrom(frame(7, [dimmer])), [{ universe: 7, address: 1 }]);
  close(at(PAR38, 255).color, blackbodyLinear(2700));
  expect(at(PAR38, 255).level).toBe(1);
  expect(at(PAR38, 255).beam).toEqual({ kind: "cone", angleDeg: 60 });
  // ADR-0037 level table: 10% of 2700 K reads 2031 K.
  close(at(PAR38, 26).color, blackbodyLinear(2031), 0.02);
  expect(at(PAR38, 26).level).toBeCloseTo(26 / 255, 6);
  // Halogen profilers drift from 3200 K: 10% reads 2407 K.
  close(at(PROFILE, 26).color, blackbodyLinear(2407), 0.02);
  // The E27 practical shares the PAR38 filament behaviour without a cone.
  close(at(E27, 26).color, blackbodyLinear(2031), 0.02);
  expect(at(E27, 26).beam.kind).toBe("glow");
});

test("the zoom precedence runs resolved, hang override, static declaration", () => {
  seedCommitted();
  const at = (overrides?: { zoomDeg?: number }) =>
    resolveFixture(
      PROFILE,
      "Dimmer",
      readFrom(frame(7, [255])),
      [{ universe: 7, address: 1 }],
      overrides,
    );
  expect(at().zoomDeg).toBe(25);
  expect(at({ zoomDeg: 30 }).zoomDeg).toBe(30);
  expect(at({ zoomDeg: 42 }).beam).toEqual({ kind: "cone", angleDeg: 42 });
});

test("an LED strip resolves per-emitter texels and never drifts", () => {
  seedCommitted();
  const slots = new Array<number>(69).fill(0);
  slots[0] = 255;
  const state = resolveFixture(SPOKE, "23px RGB 69-channel", readFrom(frame(7, slots)), [
    { universe: 7, address: 1 },
  ]);
  expect(state.status).toBe("ok");
  expect(state.pixels?.length).toBe(69);
  close(state.pixels ?? [], [1, 0, 0, ...new Array<number>(66).fill(0)]);
  close(state.color, [1, 0, 0]);
  expect(state.level).toBe(1);
  expect(state.beam.kind).toBe("glow");
});

test("an OFL matrix tiles its declared body with the pixel count", () => {
  seedCommitted();
  registerOfl("ofl:test:bar", MATRIX_BAR);
  const slots = new Array<number>(18).fill(0);
  slots[0] = 255;
  slots[6] = 255;
  slots[12] = 255;
  const state = resolveFixture("ofl:test:bar", "6px RGB", readFrom(frame(7, slots)), [
    { universe: 7, address: 1 },
  ]);
  expect(state.status).toBe("ok");
  expect(state.pixels?.length).toBe(18);
  close(state.pixels ?? [], [1, 1, 1, ...new Array<number>(15).fill(0)]);
  expect(state.bodySize).toEqual([1.2, 0.1, 0.05]);
  expect(state.beam.kind).toBe("glow");
  expect(emitterLayout("ofl:test:bar")).toEqual({
    kind: "tiled",
    count: 6,
    sizeM: [1.2, 0.1, 0.05],
  });
});

test("an OFL sole emitter draws its lens cone at a static white point", () => {
  seedCommitted();
  registerOfl("ofl:test:spot", SPOT_OFL);
  const at = (dimmer: number, shutter: number) =>
    resolveFixture("ofl:test:spot", "Spot", readFrom(frame(7, [dimmer, shutter])), [
      { universe: 7, address: 1 },
    ]);
  // Declared tungsten text never drifts an OFL fixture: the static point holds.
  close(at(128, 200).color, blackbodyLinear(3000));
  expect(at(128, 200).color[1]).toBeGreaterThan(blackbodyLinear(2757)[1] + 0.01);
  expect(at(128, 200).level).toBeCloseTo(128 / 255, 6);
  expect(at(128, 200).zoomDeg).toBe(4.5);
  expect(at(128, 200).beam).toEqual({ kind: "cone", angleDeg: 4.5 });
  expect(at(128, 5).level).toBe(0);
  expect(at(128, 5).shutterOpen).toBe(false);
});

test("an OFL matrix without dimensions is the fixed marker", () => {
  seedCommitted();
  registerOfl("ofl:test:bare", {
    name: "Bare Matrix",
    matrix: { pixelCount: [4, 1, 1] },
    templateChannels: { "Dimmer $pixelKey": { capability: { type: "Intensity" } } },
    modes: [{ name: "Dim", channels: ["Dimmer $pixelKey"] }],
  });
  const state = resolveFixture("ofl:test:bare", "Dim", readFrom(frame(7, [255, 255, 255, 255])), [
    { universe: 7, address: 1 },
  ]);
  expect(state.status).toBe("ok");
  expect(state.beam.kind).toBe("marker");
  expect(state.bodySize).toEqual([...MARKER_SIZE]);
  expect(emitterLayout("ofl:test:bare")).toEqual({ kind: "marker" });
});

test("a missing definition stays a fixed-size marked fixture", () => {
  seedCommitted();
  const state = resolveFixture("gdtf:nope", "Normal", readFrom(frame(7, [255])), [
    { universe: 7, address: 1 },
  ]);
  expect(state.status).toBe("missing-definition");
  expect(state.bodySize).toEqual([...MARKER_SIZE]);
  expect(state.beam.kind).toBe("marker");
  expect(state.level).toBe(0);
  expect(emitterLayout("gdtf:nope")).toEqual({ kind: "marker" });
  expect(staticsFor("gdtf:nope")).toBeNull();
  expect(hasDefinition("gdtf:nope")).toBe(false);
});

test("a named but unavailable mode leaves the fixture visibly unbound", () => {
  seedCommitted();
  const state = resolveFixture(PAR38, "Nope", readFrom(frame(7, [255])), [
    { universe: 7, address: 1 },
  ]);
  expect(state.status).toBe("missing-mode");
  expect(state.unbound).toBe(true);
  expect(state.level).toBe(0);
  expect(state.pixels).toBeNull();
  // The declared body survives — only the footprint is never guessed.
  expect(state.bodySize).toEqual([0.121, 0.136, 0.121]);
  expect(state.beam).toEqual({ kind: "cone", angleDeg: 60 });
  expect(hasDefinition(PAR38)).toBe(true);
  expect(hasMode(PAR38, "Nope")).toBe(false);
  expect(hasMode(PAR38, "Dimmer")).toBe(true);
});

function channelFunction(
  name: string,
  attribute: string,
  extra?: Partial<GdtfChannelFunction>,
): GdtfChannelFunction {
  return {
    name,
    attribute,
    dmxFrom: "0/1",
    dmxTo: "",
    dmxFromValue: 0,
    dmxToValue: 255,
    physicalFrom: 0,
    physicalTo: 1,
    defaultValue: 0,
    sets: [],
    ...extra,
  };
}

function channel(
  breakNo: number,
  attribute: string,
  functions: GdtfChannelFunction[],
  offset = 1,
  geometry = "",
): GdtfChannel {
  return {
    geometry,
    offset: String(offset),
    offsets: [offset],
    dmxBreak: breakNo,
    attribute,
    master: "None",
    functions,
  };
}

function literalDef(
  modeName: string,
  channels: GdtfChannel[],
  beam?: { lampType: string; cct: number },
  groupings?: GdtfDefinition["pixelGroupings"],
): GdtfDefinition {
  return {
    fixtureTypeId: "literal",
    manufacturer: "",
    name: "",
    longName: "",
    shortName: "",
    description: "",
    revisionHint: "",
    revisionTexts: [],
    attributeUnits: { Dimmer: "None", ColorAdd_R: "ColorComponent", CTC: "Temperature" },
    models: [],
    geometries: beam
      ? [
          {
            kind: "beam",
            name: "Beam",
            target: "",
            position: identityMatrix(),
            breaks: [],
            beamAngle: 60,
            fieldAngle: 60,
            beamType: "Wash",
            colorTemperature: beam.cct,
            lampType: beam.lampType,
            children: [],
          },
        ]
      : [],
    modes: [{ name: modeName, description: "", geometry: "", channels }],
    pixelGroupings: groupings ?? [],
  };
}

test("addressing routes per break without leaking across universes", () => {
  seedCommitted();
  registerGdtf(
    "gdtf:two-break",
    literalDef("Two", [
      channel(1, "Dimmer", [channelFunction("Dimmer", "Dimmer")]),
      channel(2, "ColorAdd_R", [channelFunction("Red", "ColorAdd_R")]),
    ]),
  );
  const breaks: BreakBase[] = [
    { universe: 7, address: 1 },
    { universe: 8, address: 5 },
  ];
  const frames = new Map<number, Uint8Array>();
  const seventh = new Uint8Array(512);
  seventh[0] = 255;
  seventh[4] = 255;
  frames.set(7, seventh);
  const eighth = new Uint8Array(512);
  frames.set(8, eighth);
  const state = resolveFixture("gdtf:two-break", "Two", readFrom(frames), breaks);
  expect(state.level).toBe(1);
  // Slot 5 of universe 7 is hot, but red reads universe 8: no leak.
  close(state.color, [0, 0, 0]);
});

test("ModeMaster diagnostics ride the state without touching select", () => {
  seedCommitted();
  registerGdtf(
    "gdtf:mastered",
    literalDef("M", [
      channel(1, "Dimmer", [channelFunction("Dimmer", "Dimmer", { modeMaster: "Grand" })]),
    ]),
  );
  const state = resolveFixture("gdtf:mastered", "M", readFrom(frame(7, [128])), [
    { universe: 7, address: 1 },
  ]);
  expect(state.notes.length).toBe(1);
  expect(state.level).toBeCloseTo(128 / 255, 6);
});

test("statics size meshes from declarations: spoke body, mover cone", () => {
  seedCommitted();
  registerOfl("ofl:test:bar", MATRIX_BAR);
  const spoke = staticsFor(SPOKE, "23px RGB 69-channel");
  expect(spoke?.size).toEqual([1.5, 0.0168, 0.0261]);
  expect(spoke?.beamKind).toBe("glow");
  expect(spoke?.beamAngle).toBeNull();
  expect(spoke?.layout.kind).toBe("discrete");
  if (spoke?.layout.kind === "discrete") expect(spoke.layout.positions.length).toBe(23);
  expect(staticsFor(GLP, "Normal")?.beamKind).toBe("cone");
  expect(staticsFor(GLP, "Normal")?.beamAngle).toBe(10);
  expect(staticsFor("ofl:test:bar")).toMatchObject({ beamKind: "glow" });
  expect(emitterLayout(PAR38)).toEqual({ kind: "single" });
});

const OFL_MASTER = {
  name: "Master Bar 2px",
  physical: { dimensions: { width: 600, height: 100, depth: 50 } },
  matrix: { pixelCount: [2, 1, 1] },
  templateChannels: {
    Master: { capability: { type: "Intensity" } },
    "Red $pixelKey": { capability: { type: "ColorIntensity", color: "Red" } },
    "Green $pixelKey": { capability: { type: "ColorIntensity", color: "Green" } },
    "Blue $pixelKey": { capability: { type: "ColorIntensity", color: "Blue" } },
    "Dim $pixelKey": { capability: { type: "Intensity" } },
    Gate: {
      capabilities: [
        { type: "Shutter", shutterEffect: "Closed", dmxRange: [0, 127] },
        { type: "Shutter", shutterEffect: "Open", dmxRange: [128, 255] },
      ],
    },
  },
  modes: [
    {
      name: "Master",
      channels: ["Master", "Red $pixelKey", "Green $pixelKey", "Blue $pixelKey", "Gate"],
    },
    {
      name: "Pixel",
      channels: [
        "Master",
        "Red $pixelKey",
        "Green $pixelKey",
        "Blue $pixelKey",
        "Dim $pixelKey",
        "Gate",
      ],
    },
  ],
};

test("colour off a CTO wire holds tungsten drift", () => {
  seedCommitted();
  registerGdtf(
    "gdtf:ctc-tungsten",
    literalDef(
      "Warm",
      [
        channel(1, "Dimmer", [channelFunction("Dimmer", "Dimmer")]),
        channel(
          1,
          "CTC",
          [{ ...channelFunction("CTC", "CTC"), physicalFrom: 2700, physicalTo: 8000 }],
          2,
        ),
      ],
      { lampType: "Tungsten", cct: 2700 },
    ),
  );
  const at = (dimmer: number, ctc: number) =>
    resolveFixture("gdtf:ctc-tungsten", "Warm", readFrom(frame(7, [dimmer, ctc])), [
      { universe: 7, address: 1 },
    ]);
  close(at(255, 0).color, blackbodyLinear(2700));
  close(at(128, 255).color, blackbodyLinear(2700));
  expect(at(128, 255).level).toBeCloseTo(128 / 255, 6);
});

test("strip texels carry the master dimmer and shutter gate", () => {
  seedCommitted();
  registerOfl("ofl:test:master", OFL_MASTER);
  const at = (mode: string, slots: number[]) =>
    resolveFixture("ofl:test:master", mode, readFrom(frame(7, slots)), [
      { universe: 7, address: 1 },
    ]);
  // Master scales full-red texels; the gate stands open.
  close(at("Master", [128, 255, 255, 0, 0, 0, 0, 200]).pixels ?? [], [
    128 / 255,
    0,
    0,
    128 / 255,
    0,
    0,
  ]);
  // A closed gate blacks the texels and zeroes the level.
  const shut = at("Master", [128, 255, 255, 0, 0, 0, 0, 0]);
  close(shut.pixels ?? [], [0, 0, 0, 0, 0, 0]);
  expect(shut.level).toBe(0);
  expect(shut.shutterOpen).toBe(false);
  // Per-pixel dimmers win; the master does not double-count them.
  close(at("Pixel", [128, 255, 255, 0, 0, 0, 0, 255, 128, 200]).pixels ?? [], [
    1,
    0,
    0,
    128 / 255,
    0,
    0,
  ]);
});

test("a GDTF strip gates and masters like an OFL one", () => {
  seedCommitted();
  registerGdtf(
    "gdtf:strip-two",
    literalDef(
      "Bar",
      [
        channel(1, "ColorAdd_R", [channelFunction("Red", "ColorAdd_R")], 1, "Pixel"),
        channel(1, "ColorAdd_G", [channelFunction("Green", "ColorAdd_G")], 2, "Pixel"),
        channel(1, "ColorAdd_B", [channelFunction("Blue", "ColorAdd_B")], 3, "Pixel"),
        channel(1, "Dimmer", [channelFunction("Dimmer", "Dimmer")], 7),
        channel(
          1,
          "Shutter1",
          [
            { ...channelFunction("Closed", "Shutter1"), physicalFrom: 0, physicalTo: 0 },
            {
              ...channelFunction("Open", "Shutter1"),
              dmxFromValue: 224,
              physicalFrom: 1,
              physicalTo: 1,
            },
          ],
          8,
        ),
      ],
      undefined,
      [
        {
          geometry: "Pixel",
          members: [
            { name: "P1", dmxBreak: 1, dmxOffset: 1 },
            { name: "P2", dmxBreak: 1, dmxOffset: 4 },
          ],
        },
      ],
    ),
  );
  const at = (slots: number[]) =>
    resolveFixture("gdtf:strip-two", "Bar", readFrom(frame(7, slots)), [
      { universe: 7, address: 1 },
    ]);
  close(at([255, 0, 0, 0, 0, 255, 255, 255]).pixels ?? [], [1, 0, 0, 0, 0, 1]);
  close(at([255, 0, 0, 0, 0, 255, 128, 255]).pixels ?? [], [128 / 255, 0, 0, 0, 0, 128 / 255]);
  close(at([255, 0, 0, 0, 0, 255, 255, 0]).pixels ?? [], [0, 0, 0, 0, 0, 0]);
});

test("matrix depth rides along while tiling stays two-dimensional", () => {
  seedCommitted();
  registerOfl("ofl:test:flat", {
    ...MATRIX_BAR,
    name: "Flat Panel",
    matrix: { pixelCount: [2, 1, 2] },
    modes: [{ name: "2px RGB", channels: ["Red $pixelKey", "Green $pixelKey", "Blue $pixelKey"] }],
  });
  expect(emitterLayout("ofl:test:flat")).toEqual({
    kind: "tiled",
    count: 2,
    sizeM: [1.2, 0.1, 0.05],
  });
});

test("ofl slot attributes land in the canonical vocabulary", () => {
  const known = new Set<string>([...Object.values(ATTR), "Shutter1Strobe", "CTC"]);
  for (const sample of [MATRIX_BAR, SPOT_OFL, OFL_MASTER]) {
    for (const mode of parseOflFixture(sample).modes)
      for (const slot of mode.slots)
        expect(known.has(slot.attribute) || slot.attribute.startsWith("ColorAdd_")).toBe(true);
  }
});
