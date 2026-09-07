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
