export const UNIVERSE_SLOTS = 512;

const MAGIC = 0x42485531; // BHU1
const HEADER_BYTES = 10;
const UNIVERSE_BYTES = 2 + UNIVERSE_SLOTS;

export interface UniverseFrame {
  universe: number;
  slots: Uint8Array;
}

export interface BrowserFrame {
  tMs: number;
  universes: UniverseFrame[];
}

export type Transport = "sacn" | "artnet";

export interface SourceHealth {
  id: string;
  name: string | null;
  transport: Transport;
  priority: number | null;
  preview: boolean | null;
  drops: number;
  stale: boolean;
}

export interface UniverseHealth {
  universe: number;
  stale: boolean;
  sources: SourceHealth[];
}

export interface SourceTermination {
  universe: number;
  source: Omit<SourceHealth, "stale">;
  terminatedAt: number;
}

export interface UniversesMessage {
  op: "universes";
  universes: UniverseHealth[];
  terminations: SourceTermination[];
}

export function encodeFrame(tMs: number, universes: readonly UniverseFrame[]): Uint8Array {
  const bytes = new Uint8Array(HEADER_BYTES + universes.length * UNIVERSE_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC);
  view.setUint32(4, tMs >>> 0);
  view.setUint16(8, universes.length);

  let offset = HEADER_BYTES;
  for (const { universe, slots } of universes) {
    if (!Number.isInteger(universe) || universe < 1 || universe > 63_999) {
      throw new RangeError(`invalid universe ${universe}`);
    }
    if (slots.length !== UNIVERSE_SLOTS) {
      throw new RangeError(
        `universe ${universe} has ${slots.length} slots; expected ${UNIVERSE_SLOTS}`,
      );
    }
    view.setUint16(offset, universe);
    bytes.set(slots, offset + 2);
    offset += UNIVERSE_BYTES;
  }
  return bytes;
}

export function decodeFrame(input: ArrayBuffer | ArrayBufferView): BrowserFrame {
  const bytes = toBytes(input);
  if (bytes.byteLength < HEADER_BYTES) {
    throw new Error(`invalid frame length ${bytes.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== MAGIC) {
    throw new Error("invalid frame magic");
  }

  const universeCount = view.getUint16(8);
  const expectedLength = HEADER_BYTES + universeCount * UNIVERSE_BYTES;
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`invalid frame length ${bytes.byteLength}; expected ${expectedLength}`);
  }

  const universes: UniverseFrame[] = [];
  let offset = HEADER_BYTES;
  for (let index = 0; index < universeCount; index += 1) {
    const universe = view.getUint16(offset);
    if (universe < 1 || universe > 63_999) {
      throw new Error(`invalid universe ${universe}`);
    }
    universes.push({
      universe,
      slots: bytes.slice(offset + 2, offset + UNIVERSE_BYTES),
    });
    offset += UNIVERSE_BYTES;
  }

  return { tMs: view.getUint32(4), universes };
}

function toBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}
