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
import {
  normalize,
  SCENE_BEAM_LENGTH_M,
  SCENE_DENSITY,
  eulerMatrix,
  applyMatrix,
  type BhsDefinition,
  type LocalFixture,
  type Placement,
} from "../app/src/scene.ts";
import { parseBhs } from "../app/src/bhs.ts";
import {
  buildSharePayload,
  decodeShareFragment,
  encodeShareSnapshot,
  snapshotScene,
} from "../app/src/share.ts";

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

// ── Issue #85: origin-pivot rotation and the ten-spoke star ──
// All rotation assertions drive the PRODUCTION eulerMatrix/applyMatrix path
// (app/src/scene.ts), not a standalone helper.  These are the exact same
// functions used by rotateTargets and the viewport's setPlacement.

test("rotation pivots about the definition origin — a tilted mover never drifts", () => {
  // A mover at world position P with tilt rotation: the definition origin
  // (local (0,0,0)) stays at P, not drifting to a bounding-box centre.
  // Verified through the production eulerMatrix: R*(0,0,0) = (0,0,0) for
  // any rotation, so world_origin = P + R*(0,0,0) = P regardless of tilt.
  const P: [number, number, number] = [2, 1.5, -3];
  for (const tiltDeg of [0, 15, 45, -30, 90]) {
    // Production path: eulerMatrix builds the XYZ-order rotation matrix
    // from Euler degrees; applyMatrix multiplies it against a vector.
    const R = eulerMatrix([tiltDeg, 0, 0]);
    const origin = applyMatrix(R, [0, 0, 0]);
    const worldOrigin: [number, number, number] = [
      P[0] + origin[0],
      P[1] + origin[1],
      P[2] + origin[2],
    ];
    expect(worldOrigin[0]).toBeCloseTo(P[0], 10);
    expect(worldOrigin[1]).toBeCloseTo(P[1], 10);
    expect(worldOrigin[2]).toBeCloseTo(P[2], 10);
  }
  // For a 1.5m spoke centred at origin with pixel 0 at the -X end:
  // the production rotation matrix flips which end is furthest from hub.
  const halfLen = 0.75;
  const pixel0Local: [number, number, number] = [-halfLen, 0, 0];
  const R0 = eulerMatrix([0, 0, 0]);
  expect(applyMatrix(R0, pixel0Local)).toEqual([-halfLen, 0, 0]);
  const R180 = eulerMatrix([0, 180, 0]);
  const pixel0Rotated = applyMatrix(R180, pixel0Local);
  expect(pixel0Rotated[0]).toBeCloseTo(halfLen, 5);
  expect(pixel0Rotated[1]).toBeCloseTo(0, 5);
  expect(pixel0Rotated[2]).toBeCloseTo(0, 5);
});

test("reversed Spoke: pixel 0 at tip on the same ray", () => {
  const hubCenter: [number, number, number] = [0, 3, 0];
  const halfLen = 0.75;
  const angle0 = 0;
  const rad0 = (angle0 * Math.PI) / 180;
  const ray0: [number, number, number] = [Math.cos(rad0), 0, Math.sin(rad0)];
  const pos0: [number, number, number] = [
    hubCenter[0] + halfLen * ray0[0],
    hubCenter[1] + halfLen * ray0[1],
    hubCenter[2] + halfLen * ray0[2],
  ];
  // Non-reversed: production eulerMatrix(0,0,0) applied to pixel0 at -halfLen
  const nonRevOrigin = applyMatrix(eulerMatrix([0, angle0, 0]), [-halfLen, 0, 0]);
  const nonRevPixel0: [number, number, number] = [
    pos0[0] + nonRevOrigin[0],
    pos0[1] + nonRevOrigin[1],
    pos0[2] + nonRevOrigin[2],
  ];
  expect(nonRevPixel0[0]).toBeCloseTo(hubCenter[0], 4);
  expect(nonRevPixel0[1]).toBeCloseTo(hubCenter[1], 4);
  expect(nonRevPixel0[2]).toBeCloseTo(hubCenter[2], 4);

  // Reversed: production eulerMatrix(0,180,0) applied to pixel0 at -halfLen → +X
  const revOrigin = applyMatrix(eulerMatrix([0, angle0 + 180, 0]), [-halfLen, 0, 0]);
  const revPixel0: [number, number, number] = [
    pos0[0] + revOrigin[0],
    pos0[1] + revOrigin[1],
    pos0[2] + revOrigin[2],
  ];
  const tip0: [number, number, number] = [
    hubCenter[0] + 2 * halfLen * ray0[0],
    hubCenter[1] + 2 * halfLen * ray0[1],
    hubCenter[2] + 2 * halfLen * ray0[2],
  ];
  expect(revPixel0[0]).toBeCloseTo(tip0[0], 4);
  expect(revPixel0[1]).toBeCloseTo(tip0[1], 4);
  expect(revPixel0[2]).toBeCloseTo(tip0[2], 4);
  // Same ray: reversed pixel0 − hubCenter is colinear with ray0
  const revDir: [number, number, number] = [
    revPixel0[0] - hubCenter[0],
    revPixel0[1] - hubCenter[1],
    revPixel0[2] - hubCenter[2],
  ];
  const dot = revDir[0] * ray0[0] + revDir[1] * ray0[1] + revDir[2] * ray0[2];
  const norm = Math.sqrt(revDir[0] ** 2 + revDir[1] ** 2 + revDir[2] ** 2);
  expect(dot).toBeCloseTo(norm, 4);
});

test("all ten star spokes survive share encode-decode round-trip", async () => {
  const hubCenter: [number, number, number] = [0, 3, 0];
  const halfLen = 0.75;
  const spokeDef: BhsDefinition = {
    kind: "strip",
    pixels: 23,
    pitchMm: 65,
    channelsPerPixel: 3,
    primitive: "Cube",
  };
  const fixtures: LocalFixture[] = Array.from({ length: 10 }, (_, i) => ({
    id: -(i + 1),
    definition: "bhs:star-spoke",
    mode: "23px RGB",
    addresses: [
      {
        universe: 2,
        address: 1 + i * 69,
        footprint: 69,
      },
    ],
  }));
  const placements = new Map<number, Placement>();
  for (let i = 0; i < 10; i++) {
    const angleDeg = i * 36;
    const rad = (angleDeg * Math.PI) / 180;
    const ray: [number, number, number] = [Math.cos(rad), 0, Math.sin(rad)];
    const pos: [number, number, number] = [
      hubCenter[0] + halfLen * ray[0],
      hubCenter[1] + halfLen * ray[1],
      hubCenter[2] + halfLen * ray[2],
    ];
    // Even: non-reversed (rot_y = -angle), Odd: reversed (rot_y = -angle + 180)
    const rotY = i % 2 === 0 ? -angleDeg : -angleDeg + 180;
    placements.set(-(i + 1), { position: pos, rotation: [0, rotY, 0] });
  }
  const result = await encodeShareSnapshot({
    fixtures,
    definitions: { "bhs:star-spoke": spokeDef },
    placements,
  });
  expect(result.kind).toBe("link");
  if (result.kind !== "link") return;
  const snapshot = await decodeShareFragment(`#${result.fragment}`);
  expect(snapshot).not.toBeNull();
  expect(snapshot!.fixtures.length).toBe(10);
  expect(snapshot!.definitions.length).toBe(1);
  // Verify reversed placements survive: odd-indexed fixtures carry 180° offset
  for (let i = 0; i < 10; i++) {
    const fixture = snapshot!.fixtures[i]!;
    const angleDeg = i * 36;
    const expectedRaw = i % 2 === 0 ? -angleDeg : -angleDeg + 180;
    const expectedRotY = ((expectedRaw % 360) + 360) % 360;
    const actualRotY = ((fixture.placement.rotation[1] % 360) + 360) % 360;
    expect(actualRotY).toBeCloseTo(expectedRotY, 1);
    expect(fixture.placement.rotation[0]).toBeCloseTo(0, 2);
    expect(fixture.placement.rotation[2]).toBeCloseTo(0, 2);
  }
  // Verify the snapshot scene builds correctly from columnar data alone
  const scene = snapshotScene(snapshot!);
  expect(Object.keys(scene.definitions)).toEqual(["bhs:share-0"]);
  expect(scene.fixtures.length).toBe(10);
  expect(scene.placements.size).toBe(10);
  // The ten fixture placements all have the correct rotation values
  for (let i = 0; i < 10; i++) {
    const placement = scene.placements.get(-(i + 1));
    expect(placement).toBeDefined();
    if (!placement) continue;
    const angleDeg = i * 36;
    const expectedRaw = i % 2 === 0 ? -angleDeg : -angleDeg + 180;
    const expectedRotY = ((expectedRaw % 360) + 360) % 360;
    const actualRotY = ((placement.rotation[1] % 360) + 360) % 360;
    expect(actualRotY).toBeCloseTo(expectedRotY, 1);
  }
});

test("whole-link share opens the star on the M3a read path — columnar payload", async () => {
  // The M3a read path: encode → decode → snapshotScene. No console files,
  // no GDTF registrations, no bridge.  Columnar payload only.
  const spokeDef: BhsDefinition = {
    kind: "strip",
    pixels: 23,
    pitchMm: 65,
    channelsPerPixel: 3,
    primitive: "Cube",
  };
  const fixtures: LocalFixture[] = Array.from({ length: 10 }, (_, i) => ({
    id: -(i + 1),
    definition: "bhs:star-spoke",
    mode: "23px RGB",
    addresses: [{ universe: 2, address: 1 + i * 69, footprint: 69 }],
  }));
  const placements = new Map<number, Placement>();
  for (let i = 0; i < 10; i++) {
    const angleDeg = i * 36;
    const rad = (angleDeg * Math.PI) / 180;
    const ray: [number, number, number] = [Math.cos(rad), 0, Math.sin(rad)];
    placements.set(-(i + 1), {
      position: [0.75 * ray[0], 3, 0.75 * ray[1]],
      rotation: [0, i % 2 === 0 ? -angleDeg : -angleDeg + 180, 0],
    });
  }
  const result = await encodeShareSnapshot({
    fixtures,
    definitions: { "bhs:star-spoke": spokeDef },
    placements,
    now: 1756730620000,
  });
  expect(result.kind).toBe("link");
  if (result.kind !== "link") return;
  // The fragment is a self-contained URL parameter — no filesystem, no registrations
  expect(result.fragment).toContain("s=");
  const snapshot = await decodeShareFragment(`#${result.fragment}`);
  expect(snapshot).not.toBeNull();
  expect(snapshot!.fixtures.length).toBe(10);
  // Columnar payload carries no sender paths or library identifiers
  const { payload } = buildSharePayload({
    fixtures,
    definitions: { "bhs:star-spoke": spokeDef },
    placements,
  });
  const raw = JSON.stringify(payload);
  expect(raw).not.toContain("gdtf:");
  expect(raw).not.toContain("bhs:");
  // The star opens on the read path: snapshotScene builds the scene from the
  // columnar data alone, same as the M3a viewer would
  const scene = snapshotScene(snapshot!);
  expect(scene.fixtures.length).toBe(10);
  expect(scene.placements.size).toBe(10);
  expect(scene.density).toBe(SCENE_DENSITY);
  expect(scene.beamLength).toBe(SCENE_BEAM_LENGTH_M);
});

test("star fixture document overrides drive production placement — end to end", () => {
  // Load the star .bhs fixture file, parse, extract overrides, verify
  // through the production eulerMatrix/applyMatrix path.  Rotations use
  // the correct sign: production eulerMatrix R_y(θ)*(1,0,0) = (cosθ,0,-sinθ).
  // For a ray at +θ, rot_y = -θ (non-rev) / -θ+180 (rev) to align the
  // local +X axis with the ray.
  const fixtureFile = readFileSync(resolve(repository, "tests/fixtures/star-tent.bhs"), "utf-8");
  const doc = parseBhs(fixtureFile);
  expect(doc.overrides).toBeDefined();
  expect(Object.keys(doc.overrides!).length).toBe(10);
  expect(doc.definitions).toBeDefined();
  expect(doc.fixtures).toBeDefined();
  expect(doc.fixtures!.length).toBe(10);

  const hubCenter: [number, number, number] = [0, 3, 0];
  const halfLen = 0.75;

  for (let i = 0; i < 10; i++) {
    const id = String(-(i + 1));
    const override = doc.overrides![id];
    expect(override).toBeDefined();
    if (!override) continue;

    const pos: [number, number, number] = [...override.pos];
    const rot: [number, number, number] = [...override.rot];

    // Production rotation path: the exact same eulerMatrix called by
    // rotateTargets and the viewport's setPlacement
    const R = eulerMatrix(rot);

    // The production applyMatrix with this rotation: origin-pivot semantics
    // means R*(0,0,0) = (0,0,0) so the definition origin stays at the
    // fixture's world position regardless of rotation.
    expect(applyMatrix(R, [0, 0, 0])).toEqual([0, 0, 0]);

    // Verify the rotation values match the expected star pattern.
    // Convention: non-rev = -angle, rev = -angle + 180 (mod 360).
    const angleDeg = i * 36;
    const expectedRaw = i % 2 === 0 ? -angleDeg : -angleDeg + 180;
    const actualRotY = ((rot[1] % 360) + 360) % 360;
    const expectedNorm = ((expectedRaw % 360) + 360) % 360;
    expect(actualRotY).toBeCloseTo(expectedNorm, 5);
    expect(rot[0]).toBeCloseTo(0, 5);
    expect(rot[2]).toBeCloseTo(0, 5);

    // Verify pixel 0 lies on the ray for non-zero-angle spokes
    // Pixel 0 is at local -halfLen (the UV.u=0 end of the strip).
    // After rotation, it should land colinear with the ray direction.
    const pixel0 = applyMatrix(R, [-halfLen, 0, 0]);
    // pixel0_world = pos + pixel0_rotated
    const worldX = pos[0] + pixel0[0];
    const worldY = pos[1] + pixel0[1];
    const worldZ = pos[2] + pixel0[2];

    const rad = (angleDeg * Math.PI) / 180;
    const ray: [number, number, number] = [Math.cos(rad), 0, Math.sin(rad)];
    const tip: [number, number, number] = [
      hubCenter[0] + 2 * halfLen * ray[0],
      hubCenter[1] + 2 * halfLen * ray[1],
      hubCenter[2] + 2 * halfLen * ray[2],
    ];
    const hub: [number, number, number] = [...hubCenter];

    if (i % 2 === 0) {
      // Non-reversed: pixel0 at hub center (0,3,0)
      expect(worldX).toBeCloseTo(hub[0], 3);
      expect(worldY).toBeCloseTo(hub[1], 3);
      expect(worldZ).toBeCloseTo(hub[2], 3);
    } else {
      // Reversed: pixel0 at the tip (2*halfLen along the ray)
      expect(worldX).toBeCloseTo(tip[0], 3);
      expect(worldY).toBeCloseTo(tip[1], 3);
      expect(worldZ).toBeCloseTo(tip[2], 3);
    }
  }
});
