import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gledSceneFixtures,
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

// The ?gled2 layout (ADR-0012's second source): ten spokes at gled2's wire
// addresses — LED g at universe 2 + g//170, slot 1 + (g%170)*3 — so spokes
// 1-7 start at slot 1 of universe 2, spoke 8 straddles the 170-LED seam
// (27 slots on U2 + 42 on U3), and spokes 9-10 sit at 3.43 / 3.112.
const authoritativeGledBreaks: { universe: number; address: number; footprint: number }[] = [
  { universe: 2, address: 1, footprint: 69 },
  { universe: 2, address: 70, footprint: 69 },
  { universe: 2, address: 139, footprint: 69 },
  { universe: 2, address: 208, footprint: 69 },
  { universe: 2, address: 277, footprint: 69 },
  { universe: 2, address: 346, footprint: 69 },
  { universe: 2, address: 415, footprint: 69 },
  { universe: 2, address: 484, footprint: 27 },
  { universe: 3, address: 1, footprint: 42 },
  { universe: 3, address: 43, footprint: 69 },
  { universe: 3, address: 112, footprint: 69 },
];

test("gled2 shadows declare exactly the verified wire breaks, in arm order", () => {
  expect(gledSceneFixtures.map((fixture) => fixture.id)).toEqual([
    101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  ]);
  expect(gledSceneFixtures.flatMap((fixture) => fixture.addresses)).toEqual(
    authoritativeGledBreaks,
  );
});

test("gled2 breaks cover LEDs 0-229 exactly once: no gap, no overlap", () => {
  const owned = new Array<number>(230).fill(0);
  for (const fixture of gledSceneFixtures) {
    for (const address of fixture.addresses) {
      // Universe 2 holds LEDs 0-169, universe 3 holds LEDs 170-229, 3 slots/LED.
      const firstLed = (address.universe - 2) * 170 + (address.address - 1) / 3;
      const leds = address.footprint / 3;
      for (let led = firstLed; led < firstLed + leds; led += 1) {
        owned[led] = (owned[led] ?? 0) + 1;
      }
    }
  }
  expect(owned).toEqual(new Array<number>(230).fill(1));
});
