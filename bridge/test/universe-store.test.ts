import { describe, expect, test } from "bun:test";
import { UniverseStore } from "../src/universe-store.ts";

const slots = (value: number) => {
  const result = new Uint8Array(512);
  result[0] = value;
  return result;
};

describe("the bridge's normalized universe stream", () => {
  test("keeps every source observable while rendering the latest complete frame", () => {
    const store = new UniverseStore({ sacnStaleMs: 2_500, artnetStaleMs: 6_000 });

    store.ingest({
      transport: "artnet",
      universe: 1,
      id: "192.0.2.8",
      name: null,
      priority: null,
      preview: null,
      sequence: 1,
      slots: slots(25),
      receivedAt: 100,
      terminated: false,
    });
    store.ingest({
      transport: "sacn",
      universe: 1,
      id: "00112233445566778899aabbccddeeff",
      name: "Mizer",
      priority: 120,
      preview: true,
      sequence: 7,
      slots: slots(200),
      receivedAt: 101,
      terminated: false,
    });

    expect(store.frames([1])).toEqual([{ universe: 1, slots: slots(200) }]);
    expect(store.health([1], 102).universes).toEqual([
      {
        universe: 1,
        stale: false,
        sources: [
          {
            id: "192.0.2.8",
            name: null,
            transport: "artnet",
            priority: null,
            preview: null,
            drops: 0,
            frames: 1,
            rateHz: 0,
            stale: false,
          },
          {
            id: "00112233445566778899aabbccddeeff",
            name: "Mizer",
            transport: "sacn",
            priority: 120,
            preview: true,
            drops: 0,
            frames: 1,
            rateHz: 0,
            stale: false,
          },
        ],
      },
    ]);
  });

  test("drops reordered sACN data per source and reports sequence health", () => {
    const store = new UniverseStore();
    const source = {
      transport: "sacn" as const,
      universe: 1,
      id: "cid",
      name: "Desk",
      priority: 100,
      preview: false,
      receivedAt: 10,
      terminated: false,
    };

    expect(store.ingest({ ...source, sequence: 100, slots: slots(100) })).toBe(true);
    expect(store.ingest({ ...source, sequence: 99, slots: slots(99), receivedAt: 11 })).toBe(false);
    expect(store.frames([1])[0]?.slots[0]).toBe(100);
    const health = store.health([1], 11).universes[0]?.sources[0];
    expect(health?.drops).toBe(1);
    expect(health?.frames).toBe(2);
    expect(health?.rateHz).toBe(1_000);
  });

  test("ages each transport separately and rolls universe stale state up with all", () => {
    const store = new UniverseStore({ sacnStaleMs: 100, artnetStaleMs: 200 });
    store.ingest({
      transport: "sacn",
      universe: 1,
      id: "cid",
      name: "Desk",
      priority: 100,
      preview: false,
      sequence: 1,
      slots: slots(1),
      receivedAt: 0,
      terminated: false,
    });
    store.ingest({
      transport: "artnet",
      universe: 1,
      id: "192.0.2.8",
      name: null,
      priority: null,
      preview: null,
      sequence: 0,
      slots: slots(2),
      receivedAt: 0,
      terminated: false,
    });

    const partlyStale = store.health([1], 150).universes[0];
    expect(partlyStale?.stale).toBe(false);
    expect(partlyStale?.sources.map((source) => source.stale)).toEqual([true, false]);
    expect(store.health([1], 201).universes[0]?.stale).toBe(true);
  });

  test("removes a terminated source immediately and exposes its termination", () => {
    const store = new UniverseStore();
    const source = {
      transport: "sacn" as const,
      universe: 1,
      id: "cid",
      name: "Desk",
      priority: 100,
      preview: false,
      sequence: 1,
      slots: slots(1),
      receivedAt: 10,
    };
    store.ingest({ ...source, terminated: false });
    store.ingest({ ...source, sequence: 2, terminated: true, receivedAt: 20 });

    const health = store.health([1], 21);
    expect(health.universes[0]?.sources).toEqual([]);
    expect(health.terminations).toEqual([
      {
        universe: 1,
        source: {
          id: "cid",
          name: "Desk",
          transport: "sacn",
          priority: 100,
          preview: false,
          drops: 0,
          frames: 2,
          rateHz: 100,
        },
        terminatedAt: 20,
      },
    ]);
  });
});
