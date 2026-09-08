import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGdtf } from "../packages/gdtf-ts/src/index.ts";
import {
  buildSharePayload,
  decodeShareFragment,
  encodeShareSnapshot,
  formatSnapshotAge,
  SHARE_FRAGMENT_BUDGET,
  snapshotScene,
  type ShareBuildInput,
} from "../app/src/share.ts";
import {
  clearDefinitions,
  registerGdtf,
  registerOfl,
  shareDefinition,
} from "../app/src/resolve.ts";
import {
  referenceSceneDefinitions,
  referenceSceneFixtures,
  referenceScenePlacements,
} from "../app/src/reference-rig.ts";
import type { BhsDefinition, LocalFixture, Placement } from "../app/src/scene.ts";

const stripDef: BhsDefinition = {
  kind: "strip",
  pixels: 23,
  pitchMm: 25,
  channelsPerPixel: 3,
  primitive: "Cube",
};
const boxDef: BhsDefinition = {
  kind: "primitive",
  primitive: "Cube",
  width: 1,
  depth: 1,
  height: 1,
};

function representativeRig(): ShareBuildInput {
  const fixtures: LocalFixture[] = Array.from({ length: 20 }, (_, index) => ({
    id: -index - 1,
    definition:
      index < 10
        ? "bhs:strip"
        : index < 19
          ? "bhs:box"
          : "gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016",
    mode: "default",
    addresses: [{ universe: 2, address: 1 + index * 69, footprint: 69 }],
  }));
  const placements = new Map<number, Placement>(
    fixtures.map((fixture, index) => [
      fixture.id,
      {
        position: [index * 0.25, 0.5, -index * 0.1],
        rotation: [0, index * 1.5, 0],
      },
    ]),
  );
  return {
    fixtures,
    definitions: { "bhs:strip": stripDef, "bhs:box": boxDef },
    placements,
    views: { Front: { position: [0, 3, 8], target: [0, 1, 0] } },
    resolveReference: (id) => (id.startsWith("gdtf:") ? stripDef : null),
    now: 1756730620000,
  };
}
async function fragmentOf(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const deflated = new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")),
    ).arrayBuffer(),
  );
  return `s=${Buffer.from(deflated).toString("base64url")}`;
}

describe("share snapshot codec", () => {
  test("the representative rig fits the fragment budget and round-trips", async () => {
    const result = await encodeShareSnapshot(representativeRig());
    expect(result.kind).toBe("link");
    if (result.kind !== "link") return;
    expect(result.fragment.length).toBeLessThanOrEqual(SHARE_FRAGMENT_BUDGET);
    const snapshot = await decodeShareFragment(`#${result.fragment}`);
    expect(snapshot?.fixtures.length).toBe(20);
    expect(snapshot?.definitions.length).toBe(2);
    expect(snapshot?.takenAt).toBe(1756730620000);
    expect(snapshot?.views["Front"]?.target).toEqual([0, 1, 0]);
    const first = snapshot?.fixtures[0];
    expect(first?.placement.position[0]).toBeCloseTo(0, 3);
    expect(snapshot?.fixtures[19]?.placement.position[0]).toBeCloseTo(19 * 0.25, 3);
    const scene = snapshotScene(snapshot!);
    expect(Object.keys(scene.definitions)).toEqual(["bhs:share-0", "bhs:share-1"]);
    expect(scene.placements.get(-1)?.position).toEqual([0, 0.5, 0]);
  });

  test("the fragment carries no sender paths or library identifiers", async () => {
    const { payload } = buildSharePayload(representativeRig());
    const raw = JSON.stringify(payload);
    for (const marker of ["gdtf:", "ofl:", "gdtfDir", ".yml", ".gdtf", "definitions/"])
      expect(raw).not.toContain(marker);
    const result = await encodeShareSnapshot(representativeRig());
    expect(result.kind).toBe("link");
  });

  test("fixtures without a resolvable definition are dropped, never half-encoded", async () => {
    const input = representativeRig();
    const result = await encodeShareSnapshot({ ...input, resolveReference: () => null });
    expect(result.kind).toBe("link");
    if (result.kind !== "link") return;
    expect(result.dropped).toEqual([-20]);
    const snapshot = await decodeShareFragment(`#${result.fragment}`);
    expect(snapshot?.fixtures.length).toBe(19);
  });

  test("registered definitions convert to inline share geometry instead of dropping fixtures", () => {
    clearDefinitions();
    registerOfl("ofl:test:spot", {
      name: "Spot",
      physical: { dimensions: { width: 200, height: 300, depth: 200 } },
      availableChannels: { Dimmer: { capability: { type: "Intensity" } } },
      modes: [{ name: "Spot", channels: ["Dimmer"] }],
    });
    const built = buildSharePayload({
      fixtures: [
        {
          id: -1,
          definition: "ofl:test:spot",
          mode: "Spot",
          addresses: [{ universe: 1, address: 1, footprint: 1 }],
        },
      ],
      definitions: {},
      placements: new Map(),
      resolveReference: shareDefinition,
    });
    expect(built.dropped).toEqual([]);
    expect(built.payload.d).toHaveLength(1);
    clearDefinitions();
  });

  test("reference fixtures use the same fixture and definition records as a share", () => {
    // Mirrors production boot: the hung house rig resolves from registered authored GDTFs.
    const repository = resolve(import.meta.dir, "..");
    for (const filename of [
      "Beamhouse@generic PAR38@v1.gdtf",
      "Beamhouse@generic E27 practical@v1.gdtf",
      "Beamhouse@generic profile@v1.gdtf",
    ]) {
      const definition = parseGdtf(
        new Uint8Array(readFileSync(resolve(repository, "definitions/authored", filename))),
      );
      registerGdtf(`gdtf:${definition.fixtureTypeId}`, definition);
    }
    const built = buildSharePayload({
      fixtures: referenceSceneFixtures,
      definitions: referenceSceneDefinitions,
      placements: referenceScenePlacements,
      resolveReference: shareDefinition,
    });
    clearDefinitions();
    expect(built.dropped).toEqual([]);
    expect(new Set(referenceSceneFixtures.map((fixture) => fixture.id)).size).toBe(
      referenceSceneFixtures.length,
    );
    expect(built.payload.f.map((fixture) => fixture[0])).toEqual(
      referenceSceneFixtures.map((fixture) => fixture.id),
    );
  });

  test("an over-budget rig falls back to a .bhs download payload", async () => {
    const fixtures: LocalFixture[] = Array.from({ length: 700 }, (_, index) => ({
      id: -index - 1,
      definition: "bhs:box",
      mode: `long-mode-name-${index}`,
      addresses: [{ universe: 1 + (index % 3), address: 1 + (index % 512), footprint: 10 }],
    }));
    const result = await encodeShareSnapshot({
      fixtures,
      definitions: { "bhs:box": boxDef },
      placements: new Map(),
    });
    expect(result.kind).toBe("file");
    if (result.kind !== "file") return;
    expect(result.filename.endsWith(".bhs")).toBe(true);
    expect(result.fragmentLength).toBeGreaterThan(SHARE_FRAGMENT_BUDGET);
  });

  test("malformed fragments decode to null without throwing", async () => {
    expect(await decodeShareFragment("")).toBeNull();
    expect(await decodeShareFragment("#s=!!!")).toBeNull();
    const good = await encodeShareSnapshot(representativeRig());
    if (good.kind !== "link") return;
    expect(await decodeShareFragment(`#${good.fragment.slice(0, 20)}`)).toBeNull();
    expect(await decodeShareFragment("#s=e30")).toBeNull();
  });

  test("caps refuse oversized inflations, view tables, and modes", async () => {
    const defs = [["p", 0, 1000, 1000, 1000]];
    const bomb = {
      v: 1,
      t: 1,
      d: defs,
      f: Array.from({ length: 5000 }, (_, index) => [
        -index - 1,
        0,
        "default",
        [],
        [0, 500, 0],
        [0, 0, 0],
      ]),
      views: {},
    };
    expect(await decodeShareFragment(`#${await fragmentOf(bomb)}`)).toBeNull();
    const manyViews = {
      v: 1,
      t: 1,
      d: defs,
      f: [],
      views: Object.fromEntries(
        Array.from({ length: 65 }, (_, index) => [`view-${index}`, [0, 0, 0, 0, 0, 0]]),
      ),
    };
    expect(await decodeShareFragment(`#${await fragmentOf(manyViews)}`)).toBeNull();
    const longMode = {
      v: 1,
      t: 1,
      d: defs,
      f: [[-1, 0, "m".repeat(129), [], [0, 500, 0], [0, 0, 0]]],
      views: {},
    };
    expect(await decodeShareFragment(`#${await fragmentOf(longMode)}`)).toBeNull();
    const boundary = {
      v: 1,
      t: 1,
      d: defs,
      f: [[-1, 0, "m".repeat(128), [], [0, 500, 0], [0, 0, 0]]],
      views: Object.fromEntries(
        Array.from({ length: 64 }, (_, index) => [`view-${index}`, [0, 0, 0, 0, 0, 0]]),
      ),
    };
    const accepted = await decodeShareFragment(`#${await fragmentOf(boundary)}`);
    expect(accepted?.fixtures.length).toBe(1);
    expect(Object.keys(accepted?.views ?? {}).length).toBe(64);
  });

  test("the viewer states the snapshot age", () => {
    const label = formatSnapshotAge(1756730620000, 1756730620000 + 3 * 3600 * 1000);
    expect(label.startsWith("Snapshot · ")).toBe(true);
    expect(label).toContain("3h ago");
    expect(formatSnapshotAge(1756730620000, 1756730620000 + 10 * 1000)).toContain("just now");
  });
});
