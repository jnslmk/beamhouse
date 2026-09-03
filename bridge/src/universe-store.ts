import type { SourceHealth, Transport, UniverseFrame, UniversesMessage } from "@beamhouse/wire";

export interface IncomingUniversePacket {
  transport: Transport;
  universe: number;
  id: string;
  name: string | null;
  priority: number | null;
  preview: boolean | null;
  sequence: number;
  slots: Uint8Array;
  receivedAt: number;
  terminated: boolean;
}

interface TrackedSource extends SourceHealth {
  lastSequence: number | null;
  lastSeen: number;
}

interface TrackedUniverse {
  latestSlots: Uint8Array | null;
  sources: Map<string, TrackedSource>;
}

interface UniverseStoreOptions {
  sacnStaleMs?: number;
  artnetStaleMs?: number;
}

export class UniverseStore {
  readonly #universes = new Map<number, TrackedUniverse>();
  readonly #sacnStaleMs: number;
  readonly #artnetStaleMs: number;

  constructor(options: UniverseStoreOptions = {}) {
    this.#sacnStaleMs = options.sacnStaleMs ?? 2_500;
    this.#artnetStaleMs = options.artnetStaleMs ?? 6_000;
  }

  ingest(packet: IncomingUniversePacket): boolean {
    if (packet.slots.length !== 512) {
      return false;
    }

    const universe = this.#universe(packet.universe);
    const key = `${packet.transport}:${packet.id}`;
    const previous = universe.sources.get(key);
    if (previous && !sequenceIsNewer(packet.transport, previous.lastSequence, packet.sequence)) {
      previous.drops += 1;
      previous.lastSeen = packet.receivedAt;
      return false;
    }

    const source: TrackedSource = {
      id: packet.id,
      name: packet.name,
      transport: packet.transport,
      priority: packet.priority,
      preview: packet.preview,
      drops: previous?.drops ?? 0,
      lastSequence: packet.sequence === 0 ? null : packet.sequence,
      lastSeen: packet.receivedAt,
    };

    if (packet.terminated) {
      universe.sources.delete(key);
      return true;
    }

    universe.sources.set(key, source);
    universe.latestSlots = packet.slots.slice();
    return true;
  }

  frames(subscribedUniverses: readonly number[]): UniverseFrame[] {
    const frames: UniverseFrame[] = [];
    for (const universeNumber of sortedUnique(subscribedUniverses)) {
      const slots = this.#universes.get(universeNumber)?.latestSlots;
      if (slots) {
        frames.push({ universe: universeNumber, slots: slots.slice() });
      }
    }
    return frames;
  }

  health(subscribedUniverses: readonly number[], now: number): UniversesMessage {
    const universes = sortedUnique(subscribedUniverses).map((universeNumber) => {
      const trackedSources = [...(this.#universes.get(universeNumber)?.sources.values() ?? [])];
      const sources = trackedSources.map(publicSource);
      return {
        universe: universeNumber,
        stale: trackedSources.every(
          (source) => now - source.lastSeen > this.#staleMs(source.transport),
        ),
        sources,
      };
    });

    return { op: "universes", universes };
  }

  #universe(universe: number): TrackedUniverse {
    const existing = this.#universes.get(universe);
    if (existing) return existing;
    const created: TrackedUniverse = { latestSlots: null, sources: new Map() };
    this.#universes.set(universe, created);
    return created;
  }

  #staleMs(transport: Transport): number {
    return transport === "sacn" ? this.#sacnStaleMs : this.#artnetStaleMs;
  }
}

function publicSource(source: TrackedSource): SourceHealth {
  return {
    id: source.id,
    name: source.name,
    transport: source.transport,
    priority: source.priority,
    preview: source.preview,
    drops: source.drops,
  };
}

function sequenceIsNewer(transport: Transport, previous: number | null, next: number): boolean {
  if (transport === "artnet" && next === 0) return true;
  if (previous === null) return true;

  if (transport === "sacn") {
    const signedDifference = ((next - previous + 128) & 0xff) - 128;
    return !(signedDifference >= -20 && signedDifference <= 0);
  }

  // ArtDmx uses 1...255 and wraps directly from 255 to 1.
  const forward = (next - previous + 255) % 255;
  return forward > 0 && forward <= 127;
}

function sortedUnique(universes: readonly number[]): number[] {
  return [...new Set(universes)].sort((left, right) => left - right);
}
