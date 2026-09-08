// Idle-frame gating for the bridge tick seam (snapshot → encode → fan-out).
//
// One encoding per tick is shared read-only across every client with identical
// subscription content; handlers must never mutate the broadcast bytes.
// Skip-send compares slot payloads (never the tMs header) against the last
// broadcast, so a periodic heartbeat still goes out and idle never reads as
// stale or disconnected (sACN ~2.5 s, Art-Net ~4 s idle retransmit).

import type { UniverseFrame } from "@beamhouse/wire";

/** Ticks between heartbeat re-sends of an identical frame (~2 s at 30 fps). */
export const HEARTBEAT_EVERY_TICKS = 60;

export interface SubscribedClient {
  subscriptions: Set<number>;
  send(bytes: Uint8Array): void;
}

/** One canonicalizer: valid, deduplicated, sorted. Key and grouping share it. */
function normalizeUniverses(universes: Iterable<number>): number[] {
  return [...new Set(universes)]
    .filter((universe) => Number.isInteger(universe) && universe > 0)
    .sort((left, right) => left - right);
}

/** Canonical group key: order- and duplicate-insensitive. */
export function subscriptionKey(universes: readonly number[]): string {
  return normalizeUniverses(universes).join(",");
}

/** Group clients so one encoding serves every identical subscription set. */
export function groupBySubscription<T extends SubscribedClient>(
  clients: readonly T[],
): Map<string, { universes: number[]; clients: T[] }> {
  const groups = new Map<string, { universes: number[]; clients: T[] }>();
  for (const client of clients) {
    const universes = normalizeUniverses(client.subscriptions);
    const key = universes.join(",");
    let group = groups.get(key);
    if (!group) {
      group = { universes, clients: [] };
      groups.set(key, group);
    }
    group.clients.push(client);
  }
  return groups;
}

/** Byte-equality of slot payloads across identically ordered universe lists. */
export function payloadEqual(
  left: readonly UniverseFrame[],
  right: readonly UniverseFrame[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftFrame = left[index]!;
    const rightFrame = right[index]!;
    if (leftFrame.universe !== rightFrame.universe) return false;
    if (!slotsEqual(leftFrame.slots, rightFrame.slots)) return false;
  }
  return true;
}

/**
 * Skip-on-identical per subscription group with heartbeat. Single writer only:
 * call due() once per tick with that tick's snapshots.
 */
export class BroadcastGate {
  readonly #last = new Map<string, { frames: UniverseFrame[]; age: number }>();
  /**
   * Keys that must send this tick: changed payloads plus heartbeat dues.
   * Pass heartbeat=false for the recording tee: tMs-indexed playback already
   * distinguishes gaps from loss, so idle stays out of the recording.
   */
  due(snapshots: ReadonlyMap<string, UniverseFrame[]>, heartbeat = true): Set<string> {
    const send = new Set<string>();
    for (const [key, frames] of snapshots) {
      const previous = this.#last.get(key);
      const age = (previous?.age ?? HEARTBEAT_EVERY_TICKS) + 1;
      const changed = !previous || !payloadEqual(previous.frames, frames);
      if (changed || (heartbeat && age >= HEARTBEAT_EVERY_TICKS)) {
        send.add(key);
        this.#last.set(key, { frames: copyFrames(frames), age: 0 });
      } else {
        this.#last.set(key, { frames: previous.frames, age });
      }
    }
    for (const key of this.#last.keys()) {
      if (!snapshots.has(key)) this.#last.delete(key);
    }
    return send;
  }
}

function slotsEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function copyFrames(frames: readonly UniverseFrame[]): UniverseFrame[] {
  return frames.map((frame) => ({ universe: frame.universe, slots: frame.slots.slice() }));
}
