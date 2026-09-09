import type { BhsDefinition, LocalFixture, Placement } from "./scene.ts";
import { mintLinearRGB, type LinearRGB } from "./resolve.ts";
export type { LinearRGB };
export interface BreakAddress {
  universe: number;
  slot: number;
  firstPixel: number;
  pixels: number;
}

export interface StripFixture {
  id: number;
  definitionId?: string;
  pixels: number;
  addresses: readonly BreakAddress[];
  definition: ResolvedStripDefinition;
  placement: StripPlacement;
}

export interface ResolvedStripDefinition {
  length: number;
  width: number;
  height: number;
}

export interface StripPlacement {
  position: readonly [number, number, number];
  radialAngle: number;
  reversed: boolean;
}
const PIXELS_PER_SPOKE = 23;
const SLOTS_PER_PIXEL = 3;
const SPOKE_DEFINITION: ResolvedStripDefinition = {
  // The authored GDTF's Diffuser cube: 1.5 m × 26.1 mm × 13.7 mm.
  length: 1.5,
  width: 0.0261,
  height: 0.0137,
};

export const referenceDefinitionId = "gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016";

export const resolvedReferenceDefinitions: Readonly<
  Record<string, ResolvedStripDefinition & { footprint: number }>
> = {
  [referenceDefinitionId]: { ...SPOKE_DEFINITION, footprint: PIXELS_PER_SPOKE * SLOTS_PER_PIXEL },
  "ofl:beamhouse:wled-star-tent-spoke-23px": {
    ...SPOKE_DEFINITION,
    footprint: PIXELS_PER_SPOKE * SLOTS_PER_PIXEL,
  },
};

export function resolvedReferenceDefinition(id: string) {
  return resolvedReferenceDefinitions[id];
}

export const referenceStrips: readonly StripFixture[] = Array.from({ length: 10 }, (_, index) => {
  const radialAngle = (index / 10) * Math.PI * 2;
  return {
    id: 101 + index,
    definitionId: referenceDefinitionId,
    pixels: PIXELS_PER_SPOKE,
    definition: SPOKE_DEFINITION,
    placement: {
      position: [Math.cos(radialAngle) * 0.75, 3, Math.sin(radialAngle) * 0.75],
      radialAngle,
      reversed: index % 2 === 1,
    },
    addresses: [
      index < 7
        ? {
            universe: 2,
            slot: 30 + index * PIXELS_PER_SPOKE * SLOTS_PER_PIXEL,
            firstPixel: 0,
            pixels: PIXELS_PER_SPOKE,
          }
        : {
            universe: 3,
            slot: 1 + (index - 7) * PIXELS_PER_SPOKE * SLOTS_PER_PIXEL,
            firstPixel: 0,
            pixels: PIXELS_PER_SPOKE,
          },
    ],
  };
});

// gled2's own LED-index space (universe = Art-Net Port-Address + 1), verified
// live on the bridge: LED g sits at universe 2 + floor(g / 170), slot
// 1 + (g % 170) * 3, and arm i holds LEDs 23i..23i+22 — so the ten spokes
// start at slot 1 of their universes, and arm 8 is the only one straddling
// the 170-LED seam between universes 2 and 3. The console's DMXAddress-30
// patch above is the other layout; gled2 is ADR-0012's second source and
// streams the rig's own index space, not the console's patch.
const GLED_LEDS_PER_UNIVERSE = 170;

/** The arm's 23 pixels as contiguous per-universe runs at gled2's wire slots. */
function gledBreaksForArm(arm: number): BreakAddress[] {
  const breaks: BreakAddress[] = [];
  let firstPixel = 0;
  let led = arm * PIXELS_PER_SPOKE;
  while (firstPixel < PIXELS_PER_SPOKE) {
    const ledInUniverse = led % GLED_LEDS_PER_UNIVERSE;
    const pixels = Math.min(PIXELS_PER_SPOKE - firstPixel, GLED_LEDS_PER_UNIVERSE - ledInUniverse);
    breaks.push({
      universe: 2 + Math.floor(led / GLED_LEDS_PER_UNIVERSE),
      slot: 1 + ledInUniverse * SLOTS_PER_PIXEL,
      firstPixel,
      pixels,
    });
    firstPixel += pixels;
    led += pixels;
  }
  return breaks;
}

export const REFERENCE_STRIP_DEFINITION = "bhs:reference-strip";
/** Hung house rig: authored tungsten conventionals, one dimmer channel each. */
export const par38DefinitionId = "gdtf:FFC1C66D-905A-47AB-87DB-5FCEEF121B1A";
export const practicalDefinitionId = "gdtf:AD8F1059-A90D-4477-85EB-FD93C185D1B3";
export const profileDefinitionId = "gdtf:1081DF90-2D92-493F-B1F7-7B7D90B778CD";
const HOUSE_MODE = "Dimmer";
/** Stage set: BÜTEC 2x1 m decks (rotated: 1 m across x, 2 m deep), 0.6 m legs. */
export const deckLegH = 0.6;
export const deckFrameH = 0.09;
export const deckTopH = 0.022;
export const deckTopY = deckLegH + deckFrameH + deckTopH;
export const stageDeckDefinitionId = "bhs:buetex-deck";
export const stageTrussDefinitionId = "bhs:truss-2m";
export const stageSingerDefinitionId = "bhs:singer";

export const referenceSceneDefinitions: Readonly<Record<string, BhsDefinition>> = {
  [REFERENCE_STRIP_DEFINITION]: {
    kind: "strip",
    pixels: PIXELS_PER_SPOKE,
    pitchMm: Math.round((SPOKE_DEFINITION.length * 1000) / PIXELS_PER_SPOKE),
    channelsPerPixel: SLOTS_PER_PIXEL,
    primitive: "Cube",
  },
  // Overall extents only: the deck builds slab + legs, truss/singer load GLBs.
  [stageDeckDefinitionId]: {
    kind: "primitive",
    primitive: "Cube",
    width: 1,
    depth: 2,
    height: deckTopY,
  },
  [stageTrussDefinitionId]: {
    kind: "primitive",
    primitive: "Cube",
    width: 0.22,
    depth: 2,
    height: 0.22,
  },
  [stageSingerDefinitionId]: {
    kind: "primitive",
    primitive: "Cube",
    width: 0.7,
    depth: 0.7,
    height: 1.7,
  },
};

const hungConventional = (id: number, definition: string): LocalFixture => ({
  id,
  definition,
  mode: HOUSE_MODE,
  addresses: [{ universe: 1, address: id, footprint: 1 }],
});

/** A scene object is a fixture with an empty mode and no addresses. */
const stageObject = (id: number, definition: string): LocalFixture => ({
  id,
  definition,
  mode: "",
  addresses: [],
});

/** The reference rig's public identity is the same fixture shape as every ingested fixture. */
export const referenceSceneFixtures: readonly LocalFixture[] = [
  hungConventional(1, par38DefinitionId),
  hungConventional(2, profileDefinitionId),
  hungConventional(3, practicalDefinitionId),
  ...referenceStrips.map((strip) => ({
    id: strip.id,
    definition: REFERENCE_STRIP_DEFINITION,
    mode: "default",
    addresses: strip.addresses.map((address) => ({
      universe: address.universe,
      address: address.slot,
      footprint: address.pixels * SLOTS_PER_PIXEL,
    })),
  })),
  ...[201, 202, 203, 204, 205].map((id) => stageObject(id, stageDeckDefinitionId)),
  ...[206, 207, 208, 209, 210, 211, 212].map((id) => stageObject(id, stageTrussDefinitionId)),
  stageObject(213, stageSingerDefinitionId),
];

/**
 * The same ten spokes re-declared at gled2's wire addresses as same-id
 * shadows of the reference entries: visibleFixtures() substitutes these for
 * ids 101-110 when the gled2 stream is the one being watched (?gled2). The
 * default view stays the console patch; geometry and placement are untouched
 * because they are keyed by id and live in referenceScenePlacements.
 */
export const gledSceneFixtures: readonly LocalFixture[] = referenceStrips.map((strip, arm) => ({
  id: strip.id,
  definition: REFERENCE_STRIP_DEFINITION,
  mode: "default",
  addresses: gledBreaksForArm(arm).map((address) => ({
    universe: address.universe,
    address: address.slot,
    footprint: address.pixels * SLOTS_PER_PIXEL,
  })),
}));

// Beam fires along local +Z: hung placements yaw toward stage, then pitch down.
export const referenceScenePlacements: ReadonlyMap<number, Placement> = new Map([
  [1, { position: [-2, 3.8, -1.5], rotation: [48, 45, 0] }],
  [2, { position: [0, 3.8, -1.5], rotation: [57, 0, 0] }],
  [3, { position: [-1.5, deckTopY, -0.5], rotation: [0, 0, 0] }],
  ...referenceStrips.map(
    (strip) =>
      [
        strip.id,
        {
          position: [...strip.placement.position],
          rotation: [0, (-strip.placement.radialAngle * 180) / Math.PI, 0],
        },
      ] as [number, Placement],
  ),
  ...[201, 202, 203, 204, 205].map(
    (id, index) =>
      [id, { position: [-2 + index, 0, 0], rotation: [0, 0, 0] }] as [number, Placement],
  ),
  // Truss long axis is z: uprights pitch 90° to stand, span yaws 90° to lie along x.
  ...[
    [206, [-3, 1, -1.5], [90, 0, 0]],
    [207, [-3, 3, -1.5], [90, 0, 0]],
    [208, [3, 1, -1.5], [90, 0, 0]],
    [209, [3, 3, -1.5], [90, 0, 0]],
    [210, [-2, 4, -1.5], [0, 90, 0]],
    [211, [0, 4, -1.5], [0, 90, 0]],
    [212, [2, 4, -1.5], [0, 90, 0]],
  ].map(
    ([id, position, rotation]) => [id, { position, rotation }] as unknown as [number, Placement],
  ),
  [213, { position: [0.5, deckTopY, 0.3], rotation: [0, 0, 0] }],
]);

export function universesForStrips(strips: readonly StripFixture[]): number[] {
  return [
    ...new Set(strips.flatMap((strip) => strip.addresses.map(({ universe }) => universe))),
  ].sort((left, right) => left - right);
}

export function textureBytesForStrip(
  strip: StripFixture,
  frames: ReadonlyMap<number, Uint8Array>,
): Uint8Array {
  const texture = new Uint8Array(strip.pixels * SLOTS_PER_PIXEL);
  for (const address of strip.addresses) {
    const slots = frames.get(address.universe);
    if (!slots) continue;
    const byteOffset = address.firstPixel * SLOTS_PER_PIXEL;
    const byteLength = address.pixels * SLOTS_PER_PIXEL;
    texture.set(slots.subarray(address.slot - 1, address.slot - 1 + byteLength), byteOffset);
  }
  return texture;
}

// ASSUMES: ColorAdd_* values are proportional to radiance (ADR-0008).
export function resolveColor(bytes: Uint8Array): LinearRGB {
  // ColorAdd_* is the v1 linear-radiance assumption; no inverse transfer curve is applied.
  const linear = new Float32Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    linear[index] = (bytes[index] ?? 0) / 255;
  }
  return mintLinearRGB(linear);
}
