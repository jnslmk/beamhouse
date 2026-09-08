// Volumetric beams and ground pools (#72): beam-path selection, declared
// optics, stored atmosphere fixed points, and the closed-form shader terms.
// Assertions observe resolved state and helper math, never absolute brightness.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGdtf } from "../packages/gdtf-ts/src/index.ts";
import {
  BEAM_FRAG,
  BEAM_VERT,
  POOL_FRAG,
  POOL_VERT,
  beamThrowM,
  edgeWidthFraction,
  poolRadiusM,
  poolStretch,
} from "../app/src/beam-shader.ts";
import {
  clearDefinitions,
  registerGdtf,
  registerOfl,
  resolveFixture,
  staticsFor,
} from "../app/src/resolve.ts";
import { normalize, SCENE_BEAM_LENGTH_M, SCENE_DENSITY } from "../app/src/scene.ts";

const repository = resolve(import.meta.dir, "..");
const GLP = "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48";

function seedMover(): void {
  clearDefinitions();
  registerGdtf(
    GLP,
    parseGdtf(
      new Uint8Array(
        readFileSync(resolve(repository, "definitions/authored/GLP@impression 90 RGB@v1.gdtf")),
      ),
    ),
  );
}

function frame(slots: readonly number[]): Map<number, Uint8Array> {
  const bytes = new Uint8Array(512);
  slots.forEach((value, index) => {
    bytes[index] = value ?? 0;
  });
  return new Map([[7, bytes]]);
}

const readFrom = (frames: ReadonlyMap<number, Uint8Array>) => (universe: number, slot: number) =>
  frames.get(universe)?.[slot - 1];

const SOLE_SPOT = {
  name: "Sole Spot",
  physical: {
    dimensions: { width: 200, height: 300, depth: 200 },
    lens: { degreesMinMax: [8, 8] },
  },
  templateChannels: {
    Dimmer: { capability: { type: "Intensity" } },
    Shutter: {
      capabilities: [
        { type: "Shutter", shutterEffect: "Closed", dmxRange: [0, 10] },
        { type: "Shutter", shutterEffect: "Open", dmxRange: [11, 255] },
      ],
    },
  },
  modes: [{ name: "Spot", channels: ["Dimmer", "Shutter"] }],
};

const MATRIX_BAR = {
  name: "Matrix Bar",
  physical: {
    dimensions: { width: 1200, height: 100, depth: 50 },
    lens: { degreesMinMax: [8, 8] },
  },
  matrix: { pixelCount: [6, 1, 1] },
  templateChannels: {
    "Red $pixelKey": {
      capability: { type: "ColorIntensity", color: "Red" },
    },
  },
  modes: [{ name: "6px RGB", channels: ["Red $pixelKey"] }],
};

test("the mover declares full-angle beam optics with a soft wash edge", () => {
  seedMover();
  const statics = staticsFor(GLP, "Normal");
  expect(statics?.beamKind).toBe("cone");
  expect(statics?.beamAngle).toBe(10);
  expect(statics?.fieldDeg).toBe(10);
  expect(statics?.radiusM).toBeCloseTo(0.116, 6);
  expect(statics?.softEdge).toBe(true);
});

test("BeamAngle, Zoom and Shutter1 drive the cone through one seam", () => {
  seedMover();
  const at = (slots: number[], overrides?: { zoomDeg: number }) =>
    resolveFixture(GLP, "Normal", readFrom(frame(slots)), [{ universe: 7, address: 1 }], overrides);
  const open = [0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0];
  expect(at(open).beam).toEqual({ kind: "cone", angleDeg: 10 });
  expect(at(open).level).toBe(1);
  // A hang zoom steers the cone past its static declaration.
  expect(at(open, { zoomDeg: 25 }).beam).toEqual({ kind: "cone", angleDeg: 25 });
  // A closed shutter gates the beam without touching the colour.
  const closed = [0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0];
  expect(at(closed).level).toBe(0);
  expect(at(closed).beam).toEqual({ kind: "cone", angleDeg: 10 });
  // A strobe range reads lit: the beam stays up.
  const strobe = [0, 0, 0, 0, 0, 255, 0, 0, 100, 255, 0, 0, 0, 0];
  expect(at(strobe).level).toBe(1);
});

test("an OFL sole emitter draws the cone while matrix pixels never do", () => {
  clearDefinitions();
  registerOfl("ofl:test:sole", SOLE_SPOT);
  registerOfl("ofl:test:matrix", MATRIX_BAR);
  const sole = resolveFixture(
    "ofl:test:sole",
    "Spot",
    readFrom(new Map([[7, new Uint8Array([255, 255])]])),
    [{ universe: 7, address: 1 }],
  );
  expect(sole.beam.kind).toBe("cone");
  expect(staticsFor("ofl:test:sole", "Spot")?.beamKind).toBe("cone");
  const matrix = resolveFixture(
    "ofl:test:matrix",
    "6px RGB",
    readFrom(new Map([[7, new Uint8Array([255])]])),
    [{ universe: 7, address: 1 }],
  );
  expect(matrix.beam.kind).not.toBe("cone");
  expect(staticsFor("ofl:test:matrix", "6px RGB")?.beamKind).not.toBe("cone");
});

test("atmosphere is stored explicitly and repairs to the fixed points", () => {
  expect(normalize(null).atmosphere).toEqual({
    density: SCENE_DENSITY,
    beamLengthM: SCENE_BEAM_LENGTH_M,
  });
  expect(normalize({}).atmosphere).toEqual({
    density: SCENE_DENSITY,
    beamLengthM: SCENE_BEAM_LENGTH_M,
  });
  const stored = normalize({ atmosphere: { density: 0.2, beamLengthM: 15 } });
  expect(stored.atmosphere).toEqual({ density: 0.2, beamLengthM: 15 });
  expect(normalize({ atmosphere: { density: -1, beamLengthM: 15 } }).atmosphere).toEqual({
    density: SCENE_DENSITY,
    beamLengthM: SCENE_BEAM_LENGTH_M,
  });
  expect(normalize({ atmosphere: { density: 0.2, beamLengthM: 500 } }).atmosphere).toEqual({
    density: SCENE_DENSITY,
    beamLengthM: SCENE_BEAM_LENGTH_M,
  });
});

test("FieldAngle softens the edge only where it differs; BeamType decides the rest", () => {
  // Equal angles degenerate to the BeamType edge: soft wash, hard spot.
  expect(edgeWidthFraction(10, 10, true)).toBe(0.35);
  expect(edgeWidthFraction(10, null, true)).toBe(0.35);
  expect(edgeWidthFraction(10, null, false)).toBe(0);
  expect(edgeWidthFraction(10, 10, false)).toBe(0);
  // The split-angle witness: Fog Fury 15/25 softens by the difference.
  expect(edgeWidthFraction(15, 25, true)).toBeCloseTo(10 / 15, 6);
  expect(edgeWidthFraction(15, 25, false)).toBeCloseTo(10 / 15, 6);
});

test("pools size from BeamAngle and throw, and vanish above the horizon", () => {
  // 10° beam, 5 m throw, 0.116 m lens: tan(5°) * 5 + 0.116.
  expect(poolRadiusM(10, 5, 0.116)).toBeCloseTo(0.5535, 3);
  expect(beamThrowM(3, -0.5)).toBe(6);
  expect(beamThrowM(0.5, -1)).toBe(0.5);
  expect(beamThrowM(3, 0)).toBeNull();
  expect(beamThrowM(3, 0.5)).toBeNull();
  expect(poolStretch(-1)).toBe(1);
  expect(poolStretch(-0.1)).toBe(2.5);
});

test("the shader is one fixed-cost closed-form term", () => {
  for (const source of [BEAM_VERT, BEAM_FRAG, POOL_VERT, POOL_FRAG]) {
    expect(source).not.toContain("sampler");
    expect(source).not.toMatch(/\bfor\s*\(/);
    expect(source).not.toMatch(/\bwhile\s*\(/);
  }
  // Single scattering off one density uniform, integrated in closed form.
  expect(BEAM_FRAG).toContain("uDensity");
  expect(BEAM_FRAG).toContain("float density(");
  expect(BEAM_FRAG).toContain("atan(");
  expect(BEAM_FRAG).toContain("uEdge");
  expect(BEAM_FRAG).toContain("uLenK");
  // The pool samples no density: the ADR-0013 fence is untouched.
  expect(POOL_FRAG).not.toContain("density");
  expect(POOL_FRAG).toContain("smoothstep");
});
