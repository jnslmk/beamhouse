import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  referenceStrips,
  textureBytesForStrip,
  universesForStrips,
  type StripFixture,
} from "../app/src/reference-rig.ts";

const repository = resolve(import.meta.dir, "..");
const authoritativeBreaks = [
  { universe: 2, slot: 30 },
  { universe: 2, slot: 99 },
  { universe: 2, slot: 168 },
  { universe: 2, slot: 237 },
  { universe: 2, slot: 306 },
  { universe: 2, slot: 375 },
  { universe: 2, slot: 444 },
  { universe: 3, slot: 1 },
  { universe: 3, slot: 70 },
  { universe: 3, slot: 139 },
] as const;

test("maps the committed Peek index ramp into strip texture order across ordinary breaks", () => {
  const parsed: unknown = JSON.parse(
    readFileSync(
      resolve(repository, "prototypes/wled-peek-oracle/capture/peek-readback.json"),
      "utf8",
    ),
  );
  if (!hasPixels(parsed)) throw new Error("invalid Peek readback fixture");
  const expected = parsed;
  const frames = new Map<number, Uint8Array>();

  for (const [stripIndex, address] of authoritativeBreaks.entries()) {
    const slots = frames.get(address.universe) ?? new Uint8Array(512);
    frames.set(address.universe, slots);
    slots.set(
      expected.pixels.slice(stripIndex * 23, (stripIndex + 1) * 23).flat(),
      address.slot - 1,
    );
  }

  expect(universesForStrips(referenceStrips)).toEqual([2, 3]);
  expect([...textureBytesForStrip(referenceStrips[0]!, frames)]).toEqual(
    expected.pixels.slice(0, 23).flat(),
  );
  expect([...referenceStrips.flatMap((strip) => [...textureBytesForStrip(strip, frames)])]).toEqual(
    expected.pixels.flat(),
  );
});

function hasPixels(value: unknown): value is { pixels: number[][] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "pixels" in value &&
    Array.isArray(value.pixels) &&
    value.pixels.every(
      (pixel) =>
        Array.isArray(pixel) &&
        pixel.length === 3 &&
        pixel.every((channel) => typeof channel === "number"),
    )
  );
}

test("maps a strip spanning universes by its break addresses without fixture-specific logic", () => {
  const strip: StripFixture = {
    id: 999,
    pixels: 4,
    definition: { length: 1, width: 0.1, height: 0.1 },
    placement: { position: [0, 0, 0], radialAngle: 0, reversed: false },
    addresses: [
      { universe: 31, slot: 500, firstPixel: 0, pixels: 2 },
      { universe: 32, slot: 1, firstPixel: 2, pixels: 2 },
    ],
  };
  const first = new Uint8Array(512);
  first.set([1, 2, 3, 4, 5, 6], 499);
  const second = new Uint8Array(512);
  second.set([7, 8, 9, 10, 11, 12]);

  expect([
    ...textureBytesForStrip(
      strip,
      new Map([
        [31, first],
        [32, second],
      ]),
    ),
  ]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
