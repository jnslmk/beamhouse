import { describe, expect, test } from "bun:test";
import { decodeFrame, encodeFrame } from "../src/index.ts";

describe("the browser frame codec", () => {
  test("round-trips complete universes in the normalized universe space", () => {
    const first = new Uint8Array(512);
    first.set([17, 34, 51]);
    const last = new Uint8Array(512);
    last[511] = 255;

    const encoded = encodeFrame(42, [
      { universe: 1, slots: first },
      { universe: 32768, slots: last },
    ]);

    expect(decodeFrame(encoded)).toEqual({
      tMs: 42,
      universes: [
        { universe: 1, slots: first },
        { universe: 32768, slots: last },
      ],
    });
  });

  test("rejects truncated frames instead of exposing partial slot data", () => {
    const encoded = encodeFrame(9, [{ universe: 1, slots: new Uint8Array(512) }]);

    expect(() => decodeFrame(encoded.subarray(0, encoded.length - 1))).toThrow("frame length");
  });
});
