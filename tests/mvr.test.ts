// MVR ingest through the patch contract: ladders, repairs with marks,
// patch/object split, unit conversion, and the scene merge.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMvr } from "../app/src/mvr.ts";
import { applyMvrIngest, applyPatchIngest, normalize } from "../app/src/scene.ts";
import { clearDefinitions, hasMode, registerGdtf, resolveFixture } from "../app/src/resolve.ts";

const repository = resolve(import.meta.dir, "..");

const CRC_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256);
  for (let value = 0; value < 256; value += 1) {
    let entry = value;
    for (let round = 0; round < 8; round += 1)
      entry = entry & 1 ? 0xedb88320 ^ (entry >>> 1) : entry >>> 1;
    table[value] = entry >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal multi-file zip: stored entries, or deflated ones on request. */
function zipFiles(
  entries: { name: string; raw: Uint8Array; stored: Uint8Array; method: number }[],
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, raw, stored, method } of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc32(raw), true);
    local.setUint32(18, stored.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, stored);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0, true);
    entry.setUint16(10, method, true);
    entry.setUint32(16, crc32(raw), true);
    entry.setUint32(20, stored.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + stored.length;
  }
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let cursor = 0;
  for (const part of [...chunks, ...central, new Uint8Array(end.buffer)]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** Minimal multi-file stored zip: dependency-free MVR bytes. */
function mvrZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipFiles(
    Object.entries(files).map(([name, raw]) => ({ name, raw, stored: raw, method: 0 })),
  );
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate-raw");
  const reader = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(data.slice());
  await writer.close();
  return new Uint8Array(await reader);
}
interface TestMode {
  name: string;
  channels: { offset: string; dmxBreak?: number }[];
}

/** Minimal GDTF bytes: modes with channel offsets plus revision texts. */
function gdtfBytes(fixtureTypeId: string, modes: TestMode[], revisions: string[]): Uint8Array {
  const channels = (mode: TestMode): string =>
    mode.channels
      .map(
        (channel, index) =>
          `<DMXChannel Geometry="Body" Offset="${channel.offset}" DMXBreak="${channel.dmxBreak ?? 1}"><LogicalChannel Attribute="Dimmer"><ChannelFunction Name="Dim${index}" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Default="0/1"/></LogicalChannel></DMXChannel>`,
      )
      .join("");
  const xml =
    `<GDTF DataVersion="1.2">` +
    `<FixtureType FixtureTypeID="${fixtureTypeId}" Manufacturer="Test" Name="Test ${fixtureTypeId}">` +
    `<Revisions>${revisions.map((text) => `<Revision Text="${text}"/>`).join("")}</Revisions>` +
    `<AttributeDefinitions><ActivationGroups/><FeatureGroups/><Attributes><Attribute Name="Dimmer" PhysicalUnit="Percent"/></Attributes></AttributeDefinitions>` +
    `<DMXModes>${modes.map((mode) => `<DMXMode Name="${mode.name}" Geometry="Body"><DMXChannels>${channels(mode)}</DMXChannels></DMXMode>`).join("")}</DMXModes>` +
    `</FixtureType></GDTF>`;
  return mvrZip({ "description.xml": new TextEncoder().encode(xml) });
}

interface TestNode {
  kind?: string;
  uuid?: string;
  name?: string;
  spec?: string | null;
  mode?: string | null;
  numeric?: string;
  fixtureId?: string;
  unit?: string;
  addresses?: { text: string; dmxBreak?: number }[];
  matrix?: string | null;
  children?: string;
}

function nodeText(node: TestNode): string {
  const kind = node.kind ?? "Fixture";
  const scalar = (tag: string, value: string | null | undefined): string =>
    value === undefined || value === null ? "" : `<${tag} value="${value}"/>`;
  const addresses = (node.addresses ?? [])
    .map((address) => `<Address Break="${address.dmxBreak ?? 1}">${address.text}</Address>`)
    .join("");
  return (
    `<${kind} uuid="${node.uuid ?? "00000000-0000-0000-0000-000000000000"}" name="${node.name ?? kind}">` +
    (node.matrix === null ? "" : `<Matrix>${node.matrix ?? "1 0 0 0 1 0 0 0 1 0 0 0"}</Matrix>`) +
    (node.spec === null ? "" : scalar("GDTFSpec", node.spec ?? "test.gdtf")) +
    (node.mode === null ? "" : scalar("GDTFMode", node.mode ?? "Main")) +
    scalar("FixtureIDNumeric", node.numeric) +
    scalar("FixtureID", node.fixtureId) +
    scalar("UnitNumber", node.unit) +
    (addresses.length > 0 ? `<Addresses>${addresses}</Addresses>` : "") +
    (node.children ?? "") +
    `</${kind}>`
  );
}

function sceneBytes(nodes: string[], files: Record<string, Uint8Array> = {}): Uint8Array {
  const xml =
    `<GeneralSceneDescription verMajor="1" verMinor="6"><Scene/><Layers>` +
    `<Layer uuid="11111111-1111-1111-1111-111111111111" name="Test"><ChildList>${nodes.join("")}</ChildList></Layer>` +
    `</Layers></GeneralSceneDescription>`;
  return mvrZip({ "GeneralSceneDescription.xml": new TextEncoder().encode(xml), ...files });
}

const SINGLE = gdtfBytes(
  "AAAAAAAA-0000-0000-0000-000000000001",
  [{ name: "Main", channels: [{ offset: "1" }, { offset: "4" }] }],
  ["rev-one"],
);
const DOUBLE = gdtfBytes(
  "AAAAAAAA-0000-0000-0000-000000000002",
  [
    { name: "Spot", channels: [{ offset: "1" }] },
    {
      name: "Wash",
      channels: [
        { offset: "1", dmxBreak: 1 },
        { offset: "3", dmxBreak: 2 },
      ],
    },
  ],
  ["rev-a", "rev-b"],
);

function singleMvr(nodes: TestNode[]): Uint8Array {
  return sceneBytes(nodes.map(nodeText), { "test.gdtf": SINGLE });
}

describe("MVR id ladder", () => {
  test("FixtureIDNumeric beats FixtureID beats UnitNumber", async () => {
    const ingest = await parseMvr(
      singleMvr([
        { numeric: "11", fixtureId: "12", unit: "13", addresses: [{ text: "1.1" }] },
        { fixtureId: "22", unit: "23", addresses: [{ text: "1.2" }] },
        { unit: "33", addresses: [{ text: "1.3" }] },
      ]),
    );
    expect(ingest.patch.fixtures.map((fixture) => fixture.id)).toEqual([11, 22, 33]);
    expect(ingest.patch.fixtures.every((fixture) => fixture.marks === undefined)).toBe(true);
  });

  test("a non-integer FixtureID falls through to UnitNumber", async () => {
    const ingest = await parseMvr(
      singleMvr([{ fixtureId: "A-7", unit: "7", addresses: [{ text: "1.1" }] }]),
    );
    expect(ingest.patch.fixtures.map((fixture) => fixture.id)).toEqual([7]);
  });

  test("a missing id synthesizes loud from 1000 and skips taken ids", async () => {
    const ingest = await parseMvr(
      singleMvr([
        { numeric: "1000", addresses: [{ text: "1.1" }] },
        { uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", addresses: [{ text: "1.2" }] },
      ]),
    );
    const [taken, synthesized] = ingest.patch.fixtures;
    expect(taken!.id).toBe(1000);
    expect(synthesized!.id).toBe(1001);
    expect(synthesized!.marks?.join(" ")).toMatch(/synthesized id 1001/);
    expect(synthesized!.marks?.join(" ")).toContain("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(synthesized!.uuid).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  test("the UUID never becomes an identity", async () => {
    const ingest = await parseMvr(
      singleMvr([
        {
          uuid: "11111111-2222-3333-4444-555555555555",
          numeric: "5",
          addresses: [{ text: "1.1" }],
        },
        {
          uuid: "11111111-2222-3333-4444-555555555555",
          numeric: "6",
          addresses: [{ text: "1.2" }],
        },
      ]),
    );
    expect(ingest.patch.fixtures.map((fixture) => fixture.id)).toEqual([5, 6]);
  });
});

describe("MVR definition ladder", () => {
  test("exact, extension-repaired, and case-repaired specs resolve with marks", async () => {
    const ingest = await parseMvr(
      sceneBytes(
        [
          nodeText({
            name: "Exact",
            spec: "exact.gdtf",
            numeric: "1",
            addresses: [{ text: "1.1" }],
          }),
          nodeText({ name: "Ext", spec: "added", numeric: "2", addresses: [{ text: "1.2" }] }),
          nodeText({
            name: "Case",
            spec: "MIXED.GDTF",
            numeric: "3",
            addresses: [{ text: "1.3" }],
          }),
        ],
        { "exact.gdtf": SINGLE, "added.gdtf": SINGLE, "mixed.gdtf": SINGLE },
      ),
    );
    const byId = new Map(ingest.patch.fixtures.map((fixture) => [fixture.id, fixture]));
    expect(byId.get(1)!.definition).toBe("gdtf:AAAAAAAA-0000-0000-0000-000000000001");
    expect(byId.get(1)!.marks).toBeUndefined();
    expect(byId.get(2)!.marks?.join(" ")).toMatch(/opened as "added\.gdtf".*extension repaired/);
    expect(byId.get(3)!.marks?.join(" ")).toMatch(/opened as "mixed\.gdtf".*case repaired/);
    expect(ingest.definitions.map((entry) => entry.id)).toEqual([
      "gdtf:AAAAAAAA-0000-0000-0000-000000000001",
    ]);
  });

  test("a missing spec stays placed in the patch without a definition", async () => {
    const ingest = await parseMvr(
      sceneBytes([nodeText({ spec: "ghost.gdtf", numeric: "4", addresses: [{ text: "2.7" }] })], {
        "test.gdtf": SINGLE,
      }),
    );
    const [fixture] = ingest.patch.fixtures;
    expect(fixture!.definition).toBe("mvr:ghost.gdtf");
    expect(fixture!.addresses).toEqual([{ universe: 2, address: 7, footprint: 1 }]);
    expect(fixture!.marks?.join(" ")).toMatch(/not in the archive/);
  });

  test("the definition id comes from file content, and the revision is the last Text", async () => {
    const ingest = await parseMvr(
      sceneBytes([nodeText({ spec: "renamed.gdtf", numeric: "1", addresses: [{ text: "1.1" }] })], {
        "renamed.gdtf": DOUBLE,
      }),
    );
    const [fixture] = ingest.patch.fixtures;
    expect(fixture!.definition).toBe("gdtf:AAAAAAAA-0000-0000-0000-000000000002");
    expect(fixture!.revision).toBe("rev-b");
  });
  test("a corrupt embedded definition marks its node and keeps the ingest", async () => {
    const ingest = await parseMvr(
      sceneBytes(
        [
          nodeText({ spec: "rot.gdtf", numeric: "1", addresses: [{ text: "1.1" }] }),
          nodeText({ spec: "test.gdtf", numeric: "2", addresses: [{ text: "1.2" }] }),
        ],
        {
          "rot.gdtf": mvrZip({ "nope.txt": new TextEncoder().encode("not a gdtf") }),
          "test.gdtf": SINGLE,
        },
      ),
    );
    const byId = new Map(ingest.patch.fixtures.map((fixture) => [fixture.id, fixture]));
    expect(byId.get(1)!.definition).toBe("mvr:rot.gdtf");
    expect(byId.get(1)!.marks?.join(" ")).toMatch(/does not parse/);
    expect(byId.get(2)!.definition).toBe("gdtf:AAAAAAAA-0000-0000-0000-000000000001");
    expect(ingest.definitions.map((entry) => entry.id)).toEqual([
      "gdtf:AAAAAAAA-0000-0000-0000-000000000001",
    ]);
  });

  test("hostile size fields fail the ingest instead of allocating", async () => {
    const scene = new TextEncoder().encode(
      `<GeneralSceneDescription verMajor="1" verMinor="6"><Layers><Layer uuid="22222222-2222-2222-2222-222222222222" name="A"><ChildList>` +
        nodeText({ numeric: "1", addresses: [{ text: "1.1" }] }) +
        `</ChildList></Layer></Layers></GeneralSceneDescription>`,
    );
    const bloated = zipFiles([
      // Declared sizes dwarf the stored bytes; the caps must trip first.
      { name: "GeneralSceneDescription.xml", raw: scene, stored: scene, method: 0 },
      { name: "test.gdtf", raw: SINGLE, stored: SINGLE, method: 0 },
    ]);
    const view = new DataView(bloated.buffer, bloated.byteOffset, bloated.byteLength);
    let eocd = -1;
    for (let offset = bloated.length - 22; offset >= 0; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    // Forge a 2 GiB uncompressed size on the last central entry.
    const dirOff = view.getUint32(eocd + 16, true);
    const count = view.getUint16(eocd + 10, true);
    let cursor = dirOff;
    for (let index = 0; index < count - 1; index += 1) {
      cursor += 46 + view.getUint16(cursor + 28, true);
    }
    view.setUint32(cursor + 24, 0x80000000, true);
    let failures = 0;
    try {
      await parseMvr(bloated);
    } catch {
      failures += 1;
    }
    expect(eocd).toBeGreaterThan(-1);
    expect(failures).toBe(1);
  });
});

describe("MVR mode ladder", () => {
  test("exact and case-insensitive modes bind; the sole mode binds marked", async () => {
    const ingest = await parseMvr(
      sceneBytes(
        [
          nodeText({ spec: "one.gdtf", mode: "Main", numeric: "1", addresses: [{ text: "1.1" }] }),
          nodeText({ spec: "one.gdtf", mode: "main", numeric: "2", addresses: [{ text: "1.2" }] }),
          nodeText({ spec: "one.gdtf", mode: "Bogus", numeric: "3", addresses: [{ text: "1.3" }] }),
        ],
        { "one.gdtf": SINGLE },
      ),
    );
    const byId = new Map(ingest.patch.fixtures.map((fixture) => [fixture.id, fixture]));
    expect(byId.get(1)!.mode).toBe("Main");
    expect(byId.get(1)!.marks).toBeUndefined();
    expect(byId.get(2)!.mode).toBe("Main");
    expect(byId.get(2)!.marks?.join(" ")).toMatch(/matched "Main"/);
    expect(byId.get(3)!.mode).toBe("Main");
    expect(byId.get(3)!.marks?.join(" ")).toMatch(/only mode/);
  });

  test("a real mismatch stays placed and visible with no DMX binding", async () => {
    clearDefinitions();
    const ingest = await parseMvr(
      sceneBytes(
        [nodeText({ spec: "two.gdtf", mode: "Nope", numeric: "9", addresses: [{ text: "1.50" }] })],
        {
          "two.gdtf": DOUBLE,
        },
      ),
    );
    const [fixture] = ingest.patch.fixtures;
    expect(fixture!.mode).toBe("Nope");
    expect(fixture!.addresses).toEqual([{ universe: 1, address: 50, footprint: 1 }]);
    expect(fixture!.marks?.join(" ")).toMatch(/without a DMX binding/);
    for (const { id, definition } of ingest.definitions) registerGdtf(id, definition);
    try {
      expect(hasMode(fixture!.definition, "Nope")).toBe(false);
      const state = resolveFixture(fixture!.definition, fixture!.mode, () => 255, [
        { universe: 1, address: 50 },
      ]);
      expect(state.unbound).toBe(true);
    } finally {
      clearDefinitions();
    }
  });

  test("footprints come from the resolved mode per break", async () => {
    const ingest = await parseMvr(
      sceneBytes(
        [
          nodeText({
            spec: "two.gdtf",
            mode: "Wash",
            numeric: "1",
            addresses: [
              { text: "1.10", dmxBreak: 1 },
              { text: "2.10", dmxBreak: 2 },
            ],
          }),
          nodeText({
            spec: "one.gdtf",
            mode: "Main",
            numeric: "2",
            addresses: [{ text: "1.20", dmxBreak: 7 }],
          }),
        ],
        { "one.gdtf": SINGLE, "two.gdtf": DOUBLE },
      ),
    );
    const byId = new Map(ingest.patch.fixtures.map((fixture) => [fixture.id, fixture]));
    expect(byId.get(1)!.addresses).toEqual([
      { universe: 1, address: 10, footprint: 1 },
      { universe: 2, address: 10, footprint: 3 },
    ]);
    // A single-break mode answers every break regardless of Break numbering.
    expect(byId.get(2)!.addresses).toEqual([{ universe: 1, address: 20, footprint: 4 }]);
  });
});

describe("MVR nodes and units", () => {
  test("all six spec node types land in Objects; only addressed fixtures join the patch", async () => {
    const ingest = await parseMvr(
      sceneBytes(
        [
          nodeText({
            kind: "Fixture",
            spec: "test.gdtf",
            numeric: "1",
            addresses: [{ text: "1.1" }],
          }),
          nodeText({ kind: "Truss", spec: "test.gdtf", numeric: "2" }),
          nodeText({ kind: "Support", spec: null, numeric: "3" }),
          nodeText({ kind: "VideoScreen", spec: null, numeric: "4" }),
          nodeText({ kind: "Projector", spec: "missing.gdtf", numeric: "5" }),
          nodeText({ kind: "SceneObject", spec: null, numeric: "6" }),
          nodeText({ kind: "Fixture", spec: null, numeric: "7" }),
        ],
        { "test.gdtf": SINGLE },
      ),
    );
    expect(ingest.patch.fixtures.map((fixture) => fixture.id)).toEqual([1]);
    const objects = new Map(ingest.objects.map((object) => [object.id, object]));
    expect([...objects.keys()].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(objects.get(2)!.definition).toBe("gdtf:AAAAAAAA-0000-0000-0000-000000000001");
    expect(objects.get(2)!.mode).toBe("");
    expect(objects.get(3)!.definition).toBe("mvr:unresolved");
    expect(objects.get(5)!.definition).toBe("mvr:missing.gdtf");
    expect(objects.get(7)!.definition).toBe("mvr:unresolved");
    expect(ingest.objects.every((object) => object.addresses.length === 0)).toBe(true);
  });

  test("matrices convert millimetres to metres once at the boundary", async () => {
    const ingest = await parseMvr(
      singleMvr([
        {
          numeric: "1",
          addresses: [{ text: "1.1" }],
          matrix: "1 0 0 0 1 0 0 0 1 2400 500 -1500",
        },
        {
          kind: "SceneObject",
          numeric: "2",
          matrix: "0 0 1 0 1 0 -1 0 0 0 2000 0",
        },
      ]),
    );
    expect(ingest.placements["1"]!.position).toEqual([2.4, 0.5, -1.5]);
    expect(ingest.placements["1"]!.rotation.map((value) => Math.round(value))).toEqual([0, 0, 0]);
    expect(ingest.placements["2"]!.position).toEqual([0, 2, 0]);
    expect(ingest.placements["2"]!.rotation[1]).toBeCloseTo(90, 5);
  });

  test("bad addresses are marked and ignored; an addressless fixture becomes an object", async () => {
    const ingest = await parseMvr(
      singleMvr([
        {
          numeric: "1",
          addresses: [{ text: "1.1" }, { text: "0.5" }, { text: "nonsense" }, { text: "1.600" }],
        },
        { numeric: "2", addresses: [{ text: "9.999" }] },
      ]),
    );
    const [fixture] = ingest.patch.fixtures;
    expect(fixture!.addresses).toEqual([{ universe: 1, address: 1, footprint: 4 }]);
    expect(fixture!.marks?.filter((mark) => mark.startsWith("address"))).toHaveLength(3);
    expect(ingest.objects.map((object) => object.id)).toEqual([2]);
    expect(ingest.objects[0]!.marks?.join(" ")).toMatch(/lands in Objects/);
  });

  test("grouped layers traverse and deflated entries inflate", async () => {
    const scene = new TextEncoder().encode(
      `<GeneralSceneDescription verMajor="1" verMinor="6"><Layers>` +
        `<Layer uuid="22222222-2222-2222-2222-222222222222" name="A"><ChildList>` +
        `<GroupObject uuid="33333333-3333-3333-3333-333333333333" name="G"><ChildList>` +
        nodeText({ numeric: "1", addresses: [{ text: "1.1" }] }) +
        `</ChildList></GroupObject></ChildList></Layer></Layers></GeneralSceneDescription>`,
    );
    const files = zipFiles([
      {
        name: "GeneralSceneDescription.xml",
        raw: scene,
        stored: await deflateRaw(scene),
        method: 8,
      },
      { name: "test.gdtf", raw: SINGLE, stored: SINGLE, method: 0 },
    ]);
    const ingest = await parseMvr(files);
    expect(ingest.patch.fixtures.map((fixture) => fixture.id)).toEqual([1]);
  });
});

describe("MVR scene merge", () => {
  test("re-ingest replaces patch and MVR objects while overrides merge by id", async () => {
    const first = await parseMvr(
      singleMvr([
        { numeric: "1", addresses: [{ text: "1.1" }], matrix: "1 0 0 0 1 0 0 0 1 1000 0 0" },
        { kind: "SceneObject", numeric: "2", matrix: "1 0 0 0 1 0 0 0 1 2000 0 0" },
      ]),
    );
    const seed = normalize({
      overrides: { 1: { position: [7.5, 0, 0], rotation: [0, 0, 0] } },
      views: {},
      arrays: {},
      definitions: {
        "bhs:seed": { kind: "primitive", primitive: "Cube", width: 1, depth: 1, height: 1 },
      },
      fixtures: {
        "-1": { id: -1, definition: "bhs:seed", mode: "", addresses: [] },
        2: { id: 2, definition: "mvr:stale", mode: "", addresses: [] },
      },
      patchPath: null,
      patch: {},
    });
    const merged = applyMvrIngest(seed, first, "shows/rig.mvr");
    expect(merged.patchPath).toBe("shows/rig.mvr");
    expect(merged.patch["1"]!.definition).toContain("gdtf:");
    // The operator's override wins over the MVR starting placement.
    expect(merged.overrides["1"]).toEqual({ position: [7.5, 0, 0], rotation: [0, 0, 0] });
    // The MVR placement seeds ids with no override yet.
    expect(merged.overrides["2"]).toEqual({ position: [2, 0, 0], rotation: [0, 0, 0] });
    // Stale MVR objects sweep; the local negative id survives.
    expect(Object.keys(merged.fixtures).sort()).toEqual(["-1", "2"]);
    expect(merged.fixtures["2"]!.definition).toBe("gdtf:AAAAAAAA-0000-0000-0000-000000000001");

    const second = await parseMvr(singleMvr([]));
    const repatched = applyMvrIngest(merged, second, "shows/rig.mvr");
    expect(repatched.patch).toEqual({});
    expect(Object.keys(repatched.fixtures)).toEqual(["-1"]);
    // Overrides outlive the fixtures that seeded them.
    expect(repatched.overrides["1"]).toEqual({ position: [7.5, 0, 0], rotation: [0, 0, 0] });
  });

  test("provenance survives a normalize round-trip and mizer ingests are untouched", async () => {
    const ingest = await parseMvr(
      singleMvr([{ uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", addresses: [{ text: "1.1" }] }]),
    );
    const merged = normalize(applyMvrIngest(normalize(null), ingest, "shows/rig.mvr"));
    const [fixture] = Object.values(merged.patch);
    expect(fixture!.uuid).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(fixture!.revision).toBe("rev-one");
    expect(fixture!.marks?.join(" ")).toMatch(/synthesized id/);
    const mizer = normalize(
      applyPatchIngest(
        normalize(null),
        {
          fixtures: [
            {
              id: 1,
              definition: "bhs:x",
              mode: "default",
              addresses: [{ universe: 1, address: 1, footprint: 1 }],
            },
          ],
        },
        "rig.yml",
      ),
    );
    expect(mizer.patch["1"]).toEqual({
      id: 1,
      definition: "bhs:x",
      mode: "default",
      addresses: [{ universe: 1, address: 1, footprint: 1 }],
    });
  });

  test("garbage fails the ingest instead of half a patch", async () => {
    let failures = 0;
    try {
      await parseMvr(new Uint8Array([1, 2, 3]));
    } catch {
      failures += 1;
    }
    try {
      await parseMvr(mvrZip({ "GeneralSceneDescription.xml": new TextEncoder().encode("<nope>") }));
    } catch {
      failures += 1;
    }
    expect(failures).toBe(2);
  });
});

describe("committed representative MVR", () => {
  test("loads through the contract with repairs, ladder rungs, and node types", async () => {
    const bytes = readFileSync(resolve(repository, "tests/fixtures/beamhouse-representative.mvr"));
    const ingest = await parseMvr(new Uint8Array(bytes));
    const patch = new Map(ingest.patch.fixtures.map((fixture) => [fixture.id, fixture]));
    // Ladder rungs: numeric, string FixtureID, UnitNumber, synthesized.
    expect(patch.get(21)!.definition).toBe("gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48");
    expect(patch.get(21)!.mode).toBe("Normal");
    expect(patch.get(21)!.marks).toBeUndefined();
    expect(patch.get(22)!.mode).toBe("Dimmer");
    expect(patch.get(23)!.mode).toBe("23px RGB 69-channel");
    expect(patch.get(1000)!.marks?.join(" ")).toMatch(/synthesized id 1000/);
    // Every repair is a mark.
    const marks = ingest.patch.fixtures.flatMap((fixture) => fixture.marks ?? []);
    expect(marks.join("\n")).toMatch(/extension repaired/);
    expect(marks.join("\n")).toMatch(/case repaired/);
    expect(marks.join("\n")).toMatch(/only mode/);
    expect(marks.join("\n")).toMatch(/not in the archive/);
    // Millimetres arrive as metres.
    expect(ingest.placements["21"]!.position).toEqual([2.4, 0.5, 0]);
    // Objects keep positive ladder ids with placements.
    const objects = new Map(ingest.objects.map((object) => [object.id, object]));
    expect(objects.get(6)!.definition).toBe("mvr:unresolved");
    expect(ingest.placements["6"]).toBeDefined();
    expect(
      ingest.objects.every((object) => object.mode === "" && object.addresses.length === 0),
    ).toBe(true);
  });
});
