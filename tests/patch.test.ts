import { describe, expect, test } from "bun:test";
import { parseMizerProject } from "../app/src/patch.ts";
import { applyPatchIngest, normalize } from "../app/src/scene.ts";

const SPOKE = "gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016";

function project(rows: string): string {
  return `version: 6\nplayback:\n  fps: 60\nfixtures:\n${rows}`;
}

describe("mizer project ingest", () => {
  test("parses ids, definitions, modes, and the single address break", () => {
    const patch = parseMizerProject(
      project(
        `  - id: 1\n    name: Impression 1\n    fixture: "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48"\n    mode: Normal\n    universe: 1\n    channel: 1\n  - id: 101\n    name: Spoke 1\n    fixture: "${SPOKE}"\n    mode: "23px RGB 69-channel"\n    universe: 2\n    channel: 30\n`,
      ),
    );
    expect(patch.fixtures).toEqual([
      {
        id: 1,
        definition: "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48",
        mode: "Normal",
        addresses: [{ universe: 1, address: 1, footprint: 1 }],
      },
      {
        id: 101,
        definition: SPOKE,
        mode: "23px RGB 69-channel",
        addresses: [{ universe: 2, address: 30, footprint: 1 }],
      },
    ]);
  });

  test("accepts raw bytes and resolves ofl:/bhs: definitions", () => {
    const patch = parseMizerProject(
      new TextEncoder().encode(
        project(
          `  - id: 7\n    fixture: "ofl:generic:dimmer"\n    mode: Dimmer\n    universe: 1\n    channel: 85\n  - id: 8\n    fixture: "bhs:strip"\n    mode: default\n    universe: 4\n    channel: 1\n`,
        ),
      ),
    );
    expect(patch.fixtures.map((fixture) => fixture.definition)).toEqual([
      "ofl:generic:dimmer",
      "bhs:strip",
    ]);
  });

  test("skips malformed rows without dropping the ingest", () => {
    const patch = parseMizerProject(
      project(
        [
          `  - id: 1.5\n    fixture: "${SPOKE}"\n    mode: X\n    universe: 1\n    channel: 1`,
          `  - id: -2\n    fixture: "${SPOKE}"\n    mode: X\n    universe: 1\n    channel: 1`,
          `  - id: 2\n    fixture: "qlc:generic"\n    mode: X\n    universe: 1\n    channel: 1`,
          `  - id: 3\n    fixture: "${SPOKE}"\n    mode: ""\n    universe: 1\n    channel: 1`,
          `  - id: 4\n    fixture: "${SPOKE}"\n    mode: X\n    universe: 0\n    channel: 1`,
          `  - id: 5\n    fixture: "${SPOKE}"\n    mode: X\n    universe: 1\n    channel: 513`,
          `  - just: a string`,
          `  - id: 6\n    fixture: "${SPOKE}"\n    mode: Kept\n    universe: 3\n    channel: 512`,
        ].join("\n"),
      ),
    );
    expect(patch.fixtures).toEqual([
      {
        id: 6,
        definition: SPOKE,
        mode: "Kept",
        addresses: [{ universe: 3, address: 512, footprint: 1 }],
      },
    ]);
  });

  test("last duplicate id wins", () => {
    const patch = parseMizerProject(
      project(
        `  - id: 1\n    fixture: "${SPOKE}"\n    mode: Old\n    universe: 1\n    channel: 1\n  - id: 1\n    fixture: "${SPOKE}"\n    mode: New\n    universe: 1\n    channel: 2\n`,
      ),
    );
    expect(patch.fixtures).toEqual([
      {
        id: 1,
        definition: SPOKE,
        mode: "New",
        addresses: [{ universe: 1, address: 2, footprint: 1 }],
      },
    ]);
  });

  test("rejects documents without a fixtures list", () => {
    expect(() => parseMizerProject("{{{{")).toThrow();
    expect(() => parseMizerProject("version: 6\n")).toThrow();
    expect(() => parseMizerProject("fixtures: 5\n")).toThrow();
  });
});

describe("repatch merge", () => {
  const seed = {
    overrides: { 2: { position: [7.5, 0, 0], rotation: [0, 0, 0] } },
    views: { booth: { position: [0, 2, 6], target: [0, 1, 0] } },
    arrays: {
      seed: {
        kind: "radial",
        id: "seed",
        memberIds: [2],
        center: [0, 3, 0],
        radius: 0.75,
        startAngleDeg: 0,
        stepDeg: 360,
      },
    },
    definitions: {
      "bhs:seed": { kind: "strip", pixels: 4, pitchMm: 25, channelsPerPixel: 3, primitive: "Cube" },
    },
    fixtures: {
      "-1": {
        id: -1,
        definition: "bhs:seed",
        mode: "default",
        addresses: [{ universe: 4, address: 1, footprint: 12 }],
      },
      "-2": { id: -2, definition: "bhs:seed", mode: "", addresses: [] },
    },
  };

  test("replaces the patch while id-keyed layers survive", () => {
    const before = normalize(seed);
    const after = applyPatchIngest(
      before,
      parseMizerProject(
        project(
          `  - id: 1\n    fixture: "${SPOKE}"\n    mode: A\n    universe: 1\n    channel: 1\n  - id: 2\n    fixture: "${SPOKE}"\n    mode: B\n    universe: 1\n    channel: 15\n`,
        ),
      ),
      "shows/rig.yml",
    );
    expect(after.patchPath).toBe("shows/rig.yml");
    expect(Object.keys(after.patch).sort()).toEqual(["1", "2"]);
    expect(after.overrides).toEqual(before.overrides);
    expect(after.arrays).toEqual(before.arrays);
    expect(after.views).toEqual(before.views);
    expect(after.definitions).toEqual(before.definitions);
    expect(after.fixtures).toEqual(before.fixtures);
    expect(before.patch).toEqual({});
    expect(before.patchPath).toBeNull();
  });

  test("add, remove, readdress, and remode replace the record wholesale", () => {
    const first = applyPatchIngest(
      normalize(seed),
      parseMizerProject(
        project(
          `  - id: 1\n    fixture: "${SPOKE}"\n    mode: A\n    universe: 1\n    channel: 1\n  - id: 2\n    fixture: "${SPOKE}"\n    mode: B\n    universe: 1\n    channel: 15\n`,
        ),
      ),
      "shows/rig.yml",
    );
    const second = applyPatchIngest(
      first,
      parseMizerProject(
        project(
          `  - id: 2\n    fixture: "${SPOKE}"\n    mode: C\n    universe: 1\n    channel: 20\n  - id: 3\n    fixture: "${SPOKE}"\n    mode: A\n    universe: 2\n    channel: 30\n`,
        ),
      ),
      "shows/rig.yml",
    );
    expect(Object.keys(second.patch).sort()).toEqual(["2", "3"]);
    expect(second.patch["2"]).toEqual({
      id: 2,
      definition: SPOKE,
      mode: "C",
      addresses: [{ universe: 1, address: 20, footprint: 1 }],
    });
    expect(second.overrides).toEqual(first.overrides);
    expect(second.fixtures).toEqual(first.fixtures);
  });

  test("normalize drops invalid patch entries and defaults missing keys", () => {
    const scene = normalize({
      ...seed,
      patchPath: 7,
      patch: {
        2: {
          id: 2,
          definition: SPOKE,
          mode: "B",
          addresses: [{ universe: 1, address: 15, footprint: 1 }],
        },
        9: {
          id: -9,
          definition: SPOKE,
          mode: "B",
          addresses: [{ universe: 1, address: 1, footprint: 1 }],
        },
        10: {
          id: 11,
          definition: SPOKE,
          mode: "B",
          addresses: [{ universe: 1, address: 1, footprint: 1 }],
        },
        12: { id: 12, definition: SPOKE, mode: "B", addresses: [] },
      },
    });
    expect(Object.keys(scene.patch)).toEqual(["2"]);
    expect(scene.patchPath).toBeNull();
    expect(normalize({}).patch).toEqual({});
  });
});
