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
  frames: number;
  rateHz: number;
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

// ponytail: env-pure container math lives with the codec both sides already import;
// gzip itself stays injected (Bun on the bridge, DecompressionStream in the tab).
/** Ten seconds of recording per gzip member (ADR-0041). The reader never assumes it. */
export const RECORD_MEMBER_MS = 10_000;

/** Length-prefix one section-07 frame the way a member stores it. */
export function prefixFrame(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + frame.length);
  new DataView(out.buffer).setUint32(0, frame.length);
  out.set(frame, 4);
  return out;
}

/** Pack length-prefixed frames into one prefixed gzip member. */
export function encodeRecordMember(
  prefixed: readonly Uint8Array[],
  gzip: (raw: Uint8Array<ArrayBuffer>) => Uint8Array,
): Uint8Array {
  let rawLength = 0;
  for (const chunk of prefixed) rawLength += chunk.length;
  const raw = new Uint8Array(new ArrayBuffer(rawLength));
  let offset = 0;
  for (const chunk of prefixed) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  const gzipped = gzip(raw);
  const out = new Uint8Array(4 + gzipped.length);
  new DataView(out.buffer).setUint32(0, gzipped.length);
  out.set(gzipped, 4);
  return out;
}

/** Member byte offsets from the length prefixes: no decompression, no cadence assumption. */
export function indexRecording(file: Uint8Array): number[] {
  const offsets: number[] = [];
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let offset = 0;
  while (offset < file.length) {
    if (offset + 4 > file.length) throw new Error(`truncated member prefix at ${offset}`);
    const length = view.getUint32(offset);
    if (length < 20 || offset + 4 + length > file.length)
      throw new Error(`bad member length ${length} at ${offset}`);
    offsets.push(offset);
    offset += 4 + length;
  }
  if (offsets.length === 0) throw new Error("empty recording");
  return offsets;
}

/** Split one decompressed member into its section-07 frames. */
export function splitMemberFrames(raw: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let offset = 0;
  while (offset < raw.length) {
    if (offset + 4 > raw.length) throw new Error(`truncated frame prefix at ${offset}`);
    const length = view.getUint32(offset);
    if (length < HEADER_BYTES || offset + 4 + length > raw.length)
      throw new Error(`bad frame length ${length} at ${offset}`);
    frames.push(raw.slice(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return frames;
}
