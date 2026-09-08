import {
  decodeFrame,
  indexRecording,
  splitMemberFrames,
  type BrowserFrame,
  type UniverseFrame,
} from "@beamhouse/wire";

// ponytail: member index from prefixes, one member resident, frames delivered as
// the same UniverseFrame batch the live socket emits — no second render path.

export interface RecordHandlers {
  frame(universes: UniverseFrame[]): void;
  time?(positionMs: number): void;
}

async function gunzipMember(file: Uint8Array, offset: number): Promise<Uint8Array> {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const length = view.getUint32(offset);
  const member = file.slice(offset + 4, offset + 4 + length);
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  // The reader runs before the write: a pending write waits for the queue to
  // drain, and close() waits for the same, so neither may precede the reader.
  const draining = (async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = stream.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    return { chunks, total };
  })();
  await writer.write(member);
  await writer.close();
  const { chunks, total } = await draining;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** One .bhr file: prefix index up front, members decompressed one at a time. */
export class Recording {
  readonly bytes: Uint8Array;
  readonly members: number[];
  readonly #starts: (number | null)[];
  #duration: number | null = null;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.members = indexRecording(bytes);
    this.#starts = this.members.map(() => null);
  }

  get memberCount(): number {
    return this.members.length;
  }

  async readMember(index: number): Promise<BrowserFrame[]> {
    const frames = splitMemberFrames(await gunzipMember(this.bytes, this.members[index] ?? -1)).map(
      (bytes) => decodeFrame(bytes),
    );
    if (frames.length === 0) throw new Error(`empty member ${index}`);
    if (this.#starts[index] === null) this.#starts[index] = frames[0]?.tMs ?? 0;
    return frames;
  }

  /** Member start times, learned by touching one member at a time and then cached. */
  async memberStart(index: number): Promise<number> {
    const known = this.#starts[index];
    if (known !== null && known !== undefined) return known;
    const frames = await this.readMember(index);
    return frames[0]?.tMs ?? 0;
  }

  async durationMs(): Promise<number> {
    if (this.#duration === null) {
      const frames = await this.readMember(this.members.length - 1);
      this.#duration = frames[frames.length - 1]?.tMs ?? 0;
    }
    return this.#duration;
  }

  /** The frame with the largest tMs at or before the target, with its member frames. */
  async frameAt(
    tMs: number,
  ): Promise<{ frame: BrowserFrame; member: number; frames: BrowserFrame[] }> {
    const target = Math.max(0, tMs);
    let low = 0;
    let high = this.members.length - 1;
    let member = 0;
    // Member starts are monotonic, so a cold seek decompresses O(log n) starts
    // plus the selected member instead of scanning every preceding member.
    while (low <= high) {
      const index = Math.floor((low + high) / 2);
      if ((await this.memberStart(index)) <= target) {
        member = index;
        low = index + 1;
      } else high = index - 1;
    }
    const frames = await this.readMember(member);
    let picked = frames[0];
    if (!picked) throw new Error(`empty member ${member}`);
    for (const frame of frames) {
      if (frame.tMs <= target) picked = frame;
      else break;
    }
    return { frame: picked, member, frames };
  }
}

/** Playback of one Recording through RecordHandlers: autoplay, seek, transport time. */
export class RecordPlayer {
  readonly recording: Recording;
  readonly durationMs: number;
  positionMs = 0;
  playing = false;
  readonly #handlers: RecordHandlers;
  #timer: ReturnType<typeof setInterval> | null = null;
  #lastTick = 0;
  #member = -1;
  #frames: BrowserFrame[] = [];
  #emitted = -1;
  #busy = false;
  #closed = false;

  private constructor(recording: Recording, handlers: RecordHandlers, durationMs: number) {
    this.recording = recording;
    this.#handlers = handlers;
    this.durationMs = durationMs;
  }

  static async open(bytes: Uint8Array, handlers: RecordHandlers): Promise<RecordPlayer> {
    const recording = new Recording(bytes);
    return new RecordPlayer(recording, handlers, await recording.durationMs());
  }

  /** Autoplay entry: first member, position zero, playing (ADR-0042 §7). */
  async start(): Promise<void> {
    await this.seek(0);
    this.play();
  }

  play(): void {
    if (this.playing || this.#closed || this.positionMs >= this.durationMs) return;
    this.playing = true;
    this.#lastTick = performance.now();
    this.#timer = setInterval(() => void this.#advance(), 33);
  }

  pause(): void {
    this.playing = false;
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  close(): void {
    this.#closed = true;
    this.pause();
  }

  /** A seek starts from an independently decompressible member and emits complete state. */
  async seek(tMs: number): Promise<void> {
    const target = Math.min(Math.max(0, tMs), this.durationMs);
    const { frame, member, frames } = await this.recording.frameAt(target);
    if (this.#closed) return;
    this.positionMs = target;
    this.#member = member;
    this.#frames = frames;
    this.#emitted = frames.indexOf(frame);
    this.#handlers.frame(frame.universes);
    this.#handlers.time?.(this.positionMs);
  }

  async #advance(): Promise<void> {
    if (!this.playing || this.#closed || this.#busy) return;
    this.#busy = true;
    try {
      const now = performance.now();
      const elapsed = now - this.#lastTick;
      this.#lastTick = now;
      let position = this.positionMs + elapsed;
      if (position >= this.durationMs) position = this.durationMs;
      if (this.#frames.length === 0) {
        await this.seek(position);
      } else {
        let last = this.#frames[this.#frames.length - 1]?.tMs ?? 0;
        while (position > last && this.#member + 1 < this.recording.memberCount) {
          this.#frames = await this.recording.readMember(this.#member + 1);
          if (this.#closed) return;
          this.#member += 1;
          this.#emitted = -1;
          last = this.#frames[this.#frames.length - 1]?.tMs ?? last;
        }
        this.positionMs = position;
        for (
          let index = this.#emitted + 1;
          index < this.#frames.length && (this.#frames[index]?.tMs ?? 0) <= position;
          index += 1
        ) {
          this.#emitted = index;
          const frame = this.#frames[index];
          if (frame) this.#handlers.frame(frame.universes);
        }
        this.#handlers.time?.(this.positionMs);
      }
      if (position >= this.durationMs) this.pause();
    } finally {
      this.#busy = false;
    }
  }
}

/** Transport position: `04:12 / 18:30`. */
export function formatTransportTime(positionMs: number, totalMs: number): string {
  const stamps: string[] = [];
  for (const value of [positionMs, totalMs]) {
    const total = Math.max(0, Math.floor(value / 1000));
    stamps.push(
      String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0"),
    );
  }
  return stamps[0] + " / " + stamps[1];
}
