import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeFrame,
  encodeFrame,
  encodeRecordMember,
  indexRecording,
  prefixFrame,
  RECORD_MEMBER_MS,
  splitMemberFrames,
} from "../packages/wire/src/index.ts";
import { formatTransportTime, Recording, RecordPlayer } from "../app/src/record.ts";
import { decodeRecordingName, formatSnapshotAge, formatSnapshotDate } from "../app/src/share.ts";

// The committed representative recording contract (see the generator note in the
// issue report): 3 universes at 30 fps for 12 s, members split at the 10 s mark.
const FPS = 30;
const MEMBER_FRAMES = 300;
const TOTAL_FRAMES = 360;
const DURATION_MS = Math.round(((TOTAL_FRAMES - 1) * 1000) / FPS);

function slotsFor(frame: number, universe: number): Uint8Array {
  const slots = new Uint8Array(512);
  for (let slot = 0; slot < 512; slot += 1)
    slots[slot] = (frame * (universe + 1) + slot * (universe === 1 ? 1 : 7)) % 256;
  if (universe === 1) {
    slots[0] = frame % 256;
    slots[1] = (2 * frame) % 256;
    slots[2] = (3 * frame) % 256;
  }
  return slots;
}

function frameBytes(frame: number): Uint8Array {
  return encodeFrame(
    Math.round((frame * 1000) / FPS),
    [1, 2, 3].map((universe) => ({ universe, slots: slotsFor(frame, universe) })),
  );
}

function memberOf(frames: number[]): Uint8Array {
  return encodeRecordMember(
    frames.map((frame) => prefixFrame(frameBytes(frame))),
    (raw) => Bun.gzipSync(raw),
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  const owned = new Uint8Array(new ArrayBuffer(bytes.length));
  owned.set(bytes);
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
  await writer.write(owned);
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

describe("the .bhr container", () => {
  test("packs ten-second members behind a prefix index with relative timestamps", async () => {
    expect(RECORD_MEMBER_MS).toBe(10_000);
    const file = concat([memberOf(range(0, MEMBER_FRAMES)), memberOf(range(MEMBER_FRAMES, 120))]);
    const offsets = indexRecording(file);
    expect(offsets.length).toBe(2);
    expect(offsets[0]).toBe(0);
    // No header: the file opens with a member length, then gzip magic.
    expect(new DataView(file.buffer).getUint32(0)).toBe(offsets[1]! - 4);
    expect(file[4]).toBe(0x1f);
    expect(file[5]).toBe(0x8b);
    const first = decodeFrame(splitMemberFrames(await gunzip(file.slice(4, offsets[1])))[0]!);
    expect(first.tMs).toBe(0);
    expect(first.universes.map((universe) => universe.universe)).toEqual([1, 2, 3]);
  });

  test("members decompress independently to the same complete state", async () => {
    const file = concat([memberOf(range(0, MEMBER_FRAMES)), memberOf(range(MEMBER_FRAMES, 60))]);
    const offsets = indexRecording(file);
    const second = await gunzip(file.slice(offsets[1]! + 4));
    const frames = splitMemberFrames(second).map((bytes) => decodeFrame(bytes));
    expect(frames.length).toBe(60);
    expect(frames[0]!.tMs).toBe(10_000);
    expect(frames[0]!.universes[0]!.slots.slice(0, 3)).toEqual(
      frameBytes(MEMBER_FRAMES).slice(12, 15),
    );
  });

  test("member payloads stay one honest gzip stream for ordinary tools", async () => {
    const parts = [memberOf(range(0, 10)), memberOf(range(10, 10))];
    const payloads = parts.map((part) => {
      const offsets = indexRecording(part);
      return part.slice(offsets[0]! + 4);
    });
    const frames = splitMemberFrames(await gunzip(concat(payloads))).map((bytes) =>
      decodeFrame(bytes),
    );
    expect(frames.length).toBe(20);
    expect(frames[19]!.tMs).toBe(Math.round((19 * 1000) / FPS));
  });

  test("the reader follows prefixes and never assumes the ten-second cadence", async () => {
    const file = concat([memberOf(range(0, 5)), memberOf(range(5, 400))]);
    const recording = new Recording(file);
    expect(recording.memberCount).toBe(2);
    const { frame } = await recording.frameAt(0);
    expect(frame.tMs).toBe(0);
    const late = await recording.frameAt(1_000_000);
    expect(late.frame.tMs).toBe(Math.round((404 * 1000) / FPS));
  });
});

describe("recording playback", () => {
  test("a boundary seek reconstructs the same complete universe state", async () => {
    const file = concat([memberOf(range(0, MEMBER_FRAMES)), memberOf(range(MEMBER_FRAMES, 60))]);
    const recording = new Recording(file);
    expect(await recording.durationMs()).toBe(Math.round(((MEMBER_FRAMES + 59) * 1000) / FPS));
    const boundary = await recording.frameAt(10_000);
    expect(boundary.member).toBe(1);
    expect(boundary.frame.universes.map((universe) => universe.universe)).toEqual([1, 2, 3]);
    expect(boundary.frame.universes[0]!.slots).toEqual(slotsFor(MEMBER_FRAMES, 1));
    expect(boundary.frame.universes[2]!.slots).toEqual(slotsFor(MEMBER_FRAMES, 3));
    const before = await recording.frameAt(9_999);
    expect(before.member).toBe(0);
    expect(before.frame.universes[0]!.slots).toEqual(slotsFor(MEMBER_FRAMES - 1, 1));
  });

  test("autoplay starts from the first member and seeks land on exact frames", async () => {
    const file = concat([memberOf(range(0, MEMBER_FRAMES)), memberOf(range(MEMBER_FRAMES, 60))]);
    const emitted: Uint8Array[] = [];
    const player = await RecordPlayer.open(file, {
      frame: (universes) =>
        emitted.push(universes.find((universe) => universe.universe === 1)!.slots),
    });
    expect(player.durationMs).toBe(Math.round(((MEMBER_FRAMES + 59) * 1000) / FPS));
    await player.start();
    try {
      expect(emitted.length).toBeGreaterThan(0);
      expect(emitted[0]).toEqual(slotsFor(0, 1));
      await player.seek(10_000);
      expect(emitted.at(-1)).toEqual(slotsFor(MEMBER_FRAMES, 1));
    } finally {
      player.close();
    }
    expect(formatTransportTime(252_000, 1_110_000)).toBe("04:12 / 18:30");
  });

  test("the committed representative recording plays its first and boundary frames", async () => {
    const raw = readFileSync(resolve(import.meta.dir, "fixtures/representative.bhr"));
    const file = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    const recording = new Recording(file);
    expect(recording.memberCount).toBe(2);
    expect(await recording.durationMs()).toBe(DURATION_MS);
    const { frame: first } = await recording.frameAt(0);
    expect(first.tMs).toBe(0);
    expect(first.universes[0]!.slots.slice(0, 3)).toEqual(Uint8Array.from([0, 0, 0]));
    const { frame: boundary, member } = await recording.frameAt(10_000);
    expect(member).toBe(1);
    expect(boundary.universes[0]!.slots.slice(0, 3)).toEqual(
      Uint8Array.from([MEMBER_FRAMES % 256, (2 * MEMBER_FRAMES) % 256, (3 * MEMBER_FRAMES) % 256]),
    );
  });
});

describe("the recording fragment name", () => {
  test("r= carries a deployment-local name, never a URL", () => {
    expect(decodeRecordingName("#s=abc&r=opener")).toBe("opener");
    expect(decodeRecordingName("#r=shows/opener&s=abc")).toBe("shows/opener");
    expect(decodeRecordingName("#s=abc")).toBeNull();
    expect(decodeRecordingName("")).toBeNull();
    for (const bad of [
      "#s=abc&r=../evil",
      "#s=abc&r=/absolute",
      "#s=abc&r=https://evil.test/x",
      "#s=abc&r=a%20b",
      "#s=abc&r=",
      "#s=abc&r=a//b",
    ])
      expect(decodeRecordingName(bad)).toBeNull();
  });

  test("the transport labels the snapshot date once, then the position", () => {
    expect(formatSnapshotDate(1756730620000)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}$/);
    expect(formatSnapshotAge(1756730620000, 1756730620000 + 3 * 3600 * 1000)).toContain(
      formatSnapshotDate(1756730620000),
    );
  });
});

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}
