import type { BhsDefinition, LocalFixture, Placement, PrimitiveType } from "./scene.ts";

// ponytail: columnar arrays + mm ints + deflate-raw keep the representative rig
// at ~16% of the 4096-char budget (ADR-0031); no schema lib, no second renderer.
export const SHARE_FRAGMENT_BUDGET = 4096;
const SHARE_VERSION = 1;

const PRIMITIVES: readonly PrimitiveType[] = ["Cube", "Cylinder", "Sphere"];

export interface ShareBuildInput {
  fixtures: readonly LocalFixture[];
  definitions: Readonly<Record<string, BhsDefinition>>;
  placements: ReadonlyMap<number, Placement>;
  views?: Readonly<
    Record<string, { position: [number, number, number]; target: [number, number, number] }>
  >;
  resolveReference?: (id: string) => BhsDefinition | null;
  now?: number;
}

export interface ShareSnapshotFixture {
  id: number;
  definitionIndex: number;
  mode: string;
  addresses: { universe: number; address: number; footprint: number }[];
  placement: Placement;
}

export interface ShareSnapshot {
  takenAt: number;
  definitions: BhsDefinition[];
  fixtures: ShareSnapshotFixture[];
  views: Record<string, { position: [number, number, number]; target: [number, number, number] }>;
}

export type ShareEncodeResult =
  | { kind: "link"; fragment: string }
  | { kind: "file"; filename: string; json: string; fragmentLength: number };

type ColumnarDef =
  | [kind: "s", pixels: number, pitchMm: number, channels: number, prim: number]
  | [kind: "p", prim: number, wMm: number, dMm: number, hMm: number];
type ColumnarFixture = [
  id: number,
  def: number,
  mode: string,
  addresses: [universe: number, address: number, footprint: number][],
  positionMm: [number, number, number],
  rotationDeg: [number, number, number],
];
interface ColumnarPayload {
  v: number;
  t: number;
  d: ColumnarDef[];
  f: ColumnarFixture[];
  views: Record<string, [number, number, number, number, number, number]>;
}

export interface BuiltSnapshot {
  payload: ColumnarPayload;
  /** Fixture ids left out because no render-resolved definition exists for them. */
  dropped: number[];
}

export function buildSharePayload(input: ShareBuildInput): BuiltSnapshot {
  const defKeys = new Map<string, number>();
  const defs: ColumnarDef[] = [];
  const dropped: number[] = [];
  const fixtures: ColumnarFixture[] = [];
  for (const fixture of input.fixtures) {
    const resolved =
      input.definitions[fixture.definition] ?? input.resolveReference?.(fixture.definition) ?? null;
    if (!resolved) {
      dropped.push(fixture.id);
      continue;
    }
    const key = JSON.stringify(resolved);
    let index = defKeys.get(key);
    if (index === undefined) {
      index = defs.length;
      defKeys.set(key, index);
      defs.push(columnarDefinition(resolved));
    }
    const placement = input.placements.get(fixture.id);
    fixtures.push([
      fixture.id,
      index,
      fixture.mode,
      fixture.addresses.map((address) => [address.universe, address.address, address.footprint]),
      placement
        ? [
            Math.round(placement.position[0] * 1000),
            Math.round(placement.position[1] * 1000),
            Math.round(placement.position[2] * 1000),
          ]
        : [0, 500, 0],
      placement
        ? [
            round2(placement.rotation[0]),
            round2(placement.rotation[1]),
            round2(placement.rotation[2]),
          ]
        : [0, 0, 0],
    ]);
  }
  const views: ColumnarPayload["views"] = {};
  for (const [name, view] of Object.entries(input.views ?? {}))
    views[name] = [...view.position, ...view.target] as ColumnarPayload["views"][string];
  return {
    payload: { v: SHARE_VERSION, t: input.now ?? Date.now(), d: defs, f: fixtures, views },
    dropped,
  };
}

export async function encodeShareSnapshot(input: ShareBuildInput): Promise<ShareEncodeResult> {
  const { payload, dropped } = buildSharePayload(input);
  const fragment = `s=${toBase64Url(await deflateRaw(new TextEncoder().encode(JSON.stringify(payload))))}`;
  if (fragment.length <= SHARE_FRAGMENT_BUDGET) return { kind: "link", fragment };
  return {
    kind: "file",
    filename: `beamhouse-snapshot-${payload.t}.bhs`,
    json: JSON.stringify({ kind: "beamhouse-share-snapshot", snapshot: payload, dropped }),
    fragmentLength: fragment.length,
  };
}

/** Pure decode: no bridge, no filesystem, no definition library. Returns null on any malformed input. */
export async function decodeShareFragment(hash: string): Promise<ShareSnapshot | null> {
  const encoded = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("s");
  if (!encoded) return null;
  try {
    const raw = await inflateRaw(fromBase64Url(encoded));
    // A 4096-char fragment cannot honestly inflate past 64 KiB; refuse the bomb.
    if (raw.length > 65536) return null;
    const payload = JSON.parse(new TextDecoder().decode(raw)) as Partial<ColumnarPayload>;
    if (
      payload.v !== SHARE_VERSION ||
      !Number.isFinite(payload.t) ||
      !Array.isArray(payload.d) ||
      !Array.isArray(payload.f)
    )
      return null;
    if (payload.d.length > 500 || payload.f.length > 5000) return null;
    const definitions = payload.d.map(expandDefinition);
    if (definitions.some((definition) => !definition)) return null;
    const fixtures: ShareSnapshotFixture[] = payload.f.map((entry) => {
      if (
        !Array.isArray(entry) ||
        !Number.isInteger(entry[0]) ||
        !Number.isInteger(entry[1]) ||
        entry[1] < 0 ||
        typeof entry[2] !== "string" ||
        entry[2].length > 128 ||
        !Array.isArray(entry[3]) ||
        !Array.isArray(entry[4]) ||
        !Array.isArray(entry[5])
      )
        throw new Error("bad fixture");
      const addresses = entry[3].map((triple) => {
        if (!Array.isArray(triple) || triple.some((n) => !Number.isInteger(n) || n <= 0))
          throw new Error("bad address");
        return { universe: triple[0], address: triple[1], footprint: triple[2] };
      });
      const position = entry[4].map((n) => (Number.isFinite(n) ? n / 1000 : NaN)) as [
        number,
        number,
        number,
      ];
      const rotation = entry[5].map((n) => (Number.isFinite(n) ? n : NaN)) as [
        number,
        number,
        number,
      ];
      if (position.some((n) => !Number.isFinite(n)) || rotation.some((n) => !Number.isFinite(n)))
        throw new Error("bad placement");
      return {
        id: entry[0],
        definitionIndex: entry[1],
        mode: entry[2],
        addresses,
        placement: { position, rotation },
      };
    });
    const views: ShareSnapshot["views"] = {};
    const viewEntries = Object.entries(payload.views ?? {});
    if (viewEntries.length > 64) return null;
    for (const [name, view] of viewEntries) {
      if (!Array.isArray(view) || view.length !== 6 || view.some((n) => !Number.isFinite(n)))
        return null;
      views[name] = { position: [view[0], view[1], view[2]], target: [view[3], view[4], view[5]] };
    }
    return { takenAt: payload.t!, definitions: definitions as BhsDefinition[], fixtures, views };
  } catch {
    return null;
  }
}

/** Fixture rows the existing viewport render path consumes directly: no second renderer. */
export function snapshotScene(snapshot: ShareSnapshot): {
  definitions: Record<string, BhsDefinition>;
  fixtures: LocalFixture[];
  placements: Map<number, Placement>;
} {
  const definitions: Record<string, BhsDefinition> = {};
  snapshot.definitions.forEach((definition, index) => {
    definitions[`bhs:share-${index}`] = definition;
  });
  const fixtures = snapshot.fixtures.map((fixture) => ({
    id: fixture.id,
    definition: `bhs:share-${fixture.definitionIndex}`,
    mode: fixture.mode,
    addresses: fixture.addresses.map((address) => ({ ...address })),
  }));
  const placements = new Map(snapshot.fixtures.map((fixture) => [fixture.id, fixture.placement]));
  return { definitions, fixtures, placements };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatSnapshotAge(takenAt: number, nowMs = Date.now()): string {
  const taken = new Date(takenAt);
  const absolute = `${taken.getDate()} ${MONTHS[taken.getMonth()]} ${String(taken.getHours()).padStart(2, "0")}:${String(taken.getMinutes()).padStart(2, "0")}`;
  const minutes = Math.max(0, Math.round((nowMs - takenAt) / 60000));
  const relative =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes}m ago`
        : minutes < 1440
          ? `${Math.round(minutes / 60)}h ago`
          : `${Math.round(minutes / 1440)}d ago`;
  return `Snapshot · ${absolute} · ${relative}`;
}

function columnarDefinition(definition: BhsDefinition): ColumnarDef {
  if (definition.kind === "strip") {
    return [
      "s",
      definition.pixels,
      Math.round(definition.pitchMm),
      definition.channelsPerPixel,
      PRIMITIVES.indexOf(definition.primitive),
    ];
  }
  return [
    "p",
    PRIMITIVES.indexOf(definition.primitive),
    Math.round(definition.width * 1000),
    Math.round(definition.depth * 1000),
    Math.round(definition.height * 1000),
  ];
}

function expandDefinition(entry: ColumnarDef): BhsDefinition | null {
  if (!Array.isArray(entry) || (entry[0] !== "s" && entry[0] !== "p")) return null;
  if (entry[0] === "s") {
    const [, pixels, pitchMm, channels, prim] = entry;
    if (
      ![pixels, pitchMm, channels, prim].every((n) => Number.isInteger(n)) ||
      pixels <= 0 ||
      pitchMm <= 0 ||
      channels <= 0 ||
      prim < 0 ||
      prim > 2
    )
      return null;
    return {
      kind: "strip",
      pixels,
      pitchMm,
      channelsPerPixel: channels,
      primitive: PRIMITIVES[prim]!,
    };
  }
  const [, prim, w, d, h] = entry;
  if (
    !Number.isInteger(prim) ||
    prim < 0 ||
    prim > 2 ||
    ![w, d, h].every((n) => Number.isInteger(n) && n > 0)
  )
    return null;
  return {
    kind: "primitive",
    primitive: PRIMITIVES[prim]!,
    width: w / 1000,
    depth: d / 1000,
    height: h / 1000,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(
    new Blob([bytes as unknown as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw")),
  );
  return new Uint8Array(await body.arrayBuffer());
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(
    new Blob([bytes as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw")),
  );
  return new Uint8Array(await body.arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length === 0 || value.length > 6000)
    throw new Error("bad fragment");
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
