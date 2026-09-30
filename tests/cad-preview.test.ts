import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseBhs } from "../app/src/bhs.ts";
import { loadLedProfile } from "../app/src/strip-template.ts";
import { sceneFromArgv } from "../electron/scene-arg.ts";
import { startBridge, type RunningBridge } from "../bridge/src/server.ts";

// A real embedded GLB: two CAD solids share a geometry but have different transforms.
function glb(translations: number[][]): Buffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: translations.map((_, index) => index) }],
      nodes: translations.map((translation) => ({ mesh: 0, translation })),
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: positions.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
      ],
    }),
  );
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + jsonLength + 8 + positions.byteLength);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.fill(0x20, 20, 20 + jsonLength);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(positions.byteLength, 20 + jsonLength);
  bytes.writeUInt32LE(0x004e4942, 24 + jsonLength);
  Buffer.from(positions.buffer).copy(bytes, 28 + jsonLength);
  return bytes;
}

function scene(body = "meshes/body.glb"): string {
  return JSON.stringify({
    patch: { kind: "snapshot", fixtures: [] },
    assets: { "bhs:strip": { body, diffuser: "meshes/diffuser.glb" } },
    density: 0.32,
    beamLength: 10,
  });
}

test("external CAD scene imports relative meshes without overwriting and loads aligned assembled UVs", async () => {
  const root = await mkdtemp(join(tmpdir(), "beamhouse-cad-"));
  let bridge: RunningBridge | null = null;
  try {
    const shows = join(root, "shows");
    const source = join(root, "source", "stella.bhs");
    await mkdir(join(shows, "meshes"), { recursive: true });
    await mkdir(join(dirname(source), "meshes"), { recursive: true });
    await writeFile(join(shows, "stella.bhs"), "user scene");
    await writeFile(join(shows, "meshes", "body.glb"), "user mesh");
    const body = glb([[-0.5, 0, 1]]);
    const diffuser = glb([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    await writeFile(source, scene());
    await writeFile(join(dirname(source), "meshes", "body.glb"), body);
    await writeFile(join(dirname(source), "meshes", "diffuser.glb"), diffuser);
    const imported = await sceneFromArgv([source], shows);
    expect(imported).not.toBeNull();
    const scenePath = imported!;
    expect(await sceneFromArgv([source], shows)).toBe(scenePath);
    expect(await readFile(join(root, scenePath), "utf8")).toBe(scene());
    expect(await readFile(join(shows, "stella.bhs"), "utf8")).toBe("user scene");
    expect(await readFile(join(shows, "meshes", "body.glb"), "utf8")).toBe("user mesh");
    bridge = await startBridge({
      hostname: "127.0.0.1",
      httpPort: 0,
      sacnPort: 0,
      artnetPort: 0,
      appDirectory: root,
      watchDirectory: shows,
      sacnStaleMs: 2_500,
      artnetStaleMs: 6_000,
      recordPath: null,
    });
    const sceneUrl = new URL(scenePath, `${bridge.url}/`);
    const document = parseBhs(await (await fetch(sceneUrl)).text());
    const asset = document.assets!["bhs:strip"]!;
    const preview = await loadLedProfile(
      new URL(asset.body, sceneUrl).href,
      new URL(asset.diffuser, sceneUrl).href,
    );
    expect(preview).not.toBeNull();
    // Combined CAD bounds are [-0.5,2] X, [-1,0] Y and [0,1] Z after tipping.
    for (const half of [preview!.body, preview!.diffuser]) {
      expect(half.position.x).toBeCloseTo(-0.75);
      expect(half.position.y).toBeCloseTo(0.5);
      expect(half.position.z).toBeCloseTo(-0.5);
      expect(half.rotation.x).toBeCloseTo(Math.PI / 2);
      expect(half.scale.toArray()).toEqual([1, 1, 1]);
    }
    const uvs: number[][] = [];
    preview!.diffuser.traverse((entry) => {
      if (!("geometry" in entry)) return;
      const geometry = entry.geometry as {
        getAttribute(name: string): { array: ArrayLike<number> };
      };
      uvs.push(Array.from(geometry.getAttribute("uv").array));
    });
    expect(uvs).toEqual([
      [0, 0, 0.5, 0, 0, 0],
      [0.5, 0, 1, 0, 0.5, 0],
    ]);
    // Scene bytes alone cannot identify a bundle: a regenerated mesh is a new revision.
    const changedBody = glb([[-1, 0, 1]]);
    await writeFile(join(dirname(source), "meshes", "body.glb"), changedBody);
    const changed = await sceneFromArgv([source], shows);
    expect(changed).not.toBe(scenePath);
    expect(
      (await readFile(join(dirname(join(root, scenePath)), "meshes", "body.glb"))).equals(body),
    ).toBe(true);
    const changedMesh = join(dirname(join(root, changed!)), "meshes", "body.glb");
    await writeFile(changedMesh, "user modified imported mesh");
    const restored = await sceneFromArgv([source], shows);
    expect(restored).not.toBe(changed);
    expect(await readFile(changedMesh, "utf8")).toBe("user modified imported mesh");
    expect(
      (await readFile(join(dirname(join(root, restored!)), "meshes", "body.glb"))).equals(
        changedBody,
      ),
    ).toBe(true);
  } finally {
    await bridge?.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("external mesh imports reject URL traversal and symlink escapes before publishing a scene", async () => {
  const root = await mkdtemp(join(tmpdir(), "beamhouse-cad-path-"));
  try {
    const shows = join(root, "shows");
    const source = join(root, "source", "stella.bhs");
    await mkdir(shows);
    await mkdir(join(dirname(source), "meshes"), { recursive: true });
    await writeFile(join(dirname(source), "meshes", "diffuser.glb"), glb([[0, 0, 0]]));
    await writeFile(join(root, "outside.glb"), glb([[0, 0, 0]]));
    for (const path of [
      "../outside.glb",
      "%2e%2e/outside.glb",
      "..%5coutside.glb",
      "/outside.glb",
      "file:outside.glb",
      "meshes/body.glb?redirect=1",
    ]) {
      await writeFile(source, scene(path));
      const failure = await sceneFromArgv([source], shows).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
    }
    await symlink(join(root, "outside.glb"), join(dirname(source), "body.glb"));
    await writeFile(source, scene("body.glb"));
    const failure = await sceneFromArgv([source], shows).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty("message", expect.stringContaining("escapes"));
    expect(await readdir(shows)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
