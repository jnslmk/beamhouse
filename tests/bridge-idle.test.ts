import { describe, expect, test } from "bun:test";
import {
  BroadcastGate,
  groupBySubscription,
  HEARTBEAT_EVERY_TICKS,
  payloadEqual,
  subscriptionKey,
} from "../bridge/src/frame-dedup.ts";
import type { UniverseFrame } from "../packages/wire/src/index.ts";

function frame(universe: number, values: number[]): UniverseFrame {
  const slots = new Uint8Array(512);
  slots.set(values);
  return { universe, slots };
}

describe("shared-frame broadcast", () => {
  test("subscription keys ignore order and duplicates", () => {
    expect(subscriptionKey([3, 1, 1, 2])).toBe(subscriptionKey([1, 2, 3]));
  });

  test("payload equality is byte-equality over sorted universes", () => {
    const left = [frame(1, [1, 2, 3])];
    expect(payloadEqual(left, [frame(1, [1, 2, 3])])).toBe(true);
    expect(payloadEqual(left, [frame(1, [1, 2, 4])])).toBe(false);
    expect(payloadEqual(left, [frame(1, [1, 2, 3]), frame(2, [0])])).toBe(false);
    expect(payloadEqual(left, [frame(2, [1, 2, 3])])).toBe(false);
  });

  test("clients with identical subscriptions share one group, others do not", () => {
    const sent: [string, Uint8Array][] = [];
    const clients = [
      { subscriptions: new Set([1, 2]), send: (bytes: Uint8Array) => void sent.push(["a", bytes]) },
      { subscriptions: new Set([2, 1]), send: (bytes: Uint8Array) => void sent.push(["b", bytes]) },
      { subscriptions: new Set([1]), send: (bytes: Uint8Array) => void sent.push(["c", bytes]) },
    ];
    const groups = groupBySubscription(clients);
    expect(groups.size).toBe(2);
    // One encoding per group reaches every same-subscription viewer identically.
    const encoding = new Uint8Array([1, 2, 3]);
    for (const group of groups.values()) {
      if (group.clients.length === 2) for (const client of group.clients) client.send(encoding);
    }
    expect(sent.length).toBe(2);
    expect(sent[0]?.[1]).toBe(encoding);
    expect(sent[1]?.[1]).toBe(encoding);
  });

  test("the recording tee reuses the gate without heartbeat bloat", () => {
    const gate = new BroadcastGate();
    const key = `record:${subscriptionKey([1])}`;
    const snapshots = () => new Map([[key, [frame(1, [7])]]]);
    expect([...gate.due(snapshots(), false)]).toEqual([key]);
    for (let tick = 0; tick < HEARTBEAT_EVERY_TICKS + 5; tick += 1)
      expect([...gate.due(snapshots(), false)]).toEqual([]);
    expect([...gate.due(new Map([[key, [frame(1, [8])]]]), false)]).toEqual([key]);
  });
});

describe("skip-on-identical with heartbeat", () => {
  test("first frame sends, identical frames skip, heartbeat still goes out", () => {
    const gate = new BroadcastGate();
    const key = subscriptionKey([1]);
    const snapshots = () => new Map([[key, [frame(1, [7])]]]);
    expect([...gate.due(snapshots())]).toEqual([key]);
    expect([...gate.due(snapshots())]).toEqual([]);
    for (let tick = 0; tick < HEARTBEAT_EVERY_TICKS - 2; tick += 1)
      expect([...gate.due(snapshots())]).toEqual([]);
    // The heartbeat tick re-sends the identical payload so idle never reads as dead.
    expect([...gate.due(snapshots())]).toEqual([key]);
    expect([...gate.due(snapshots())]).toEqual([]);
  });

  test("a changed slot sends promptly and resets the heartbeat", () => {
    const gate = new BroadcastGate();
    const key = subscriptionKey([1]);
    expect([...gate.due(new Map([[key, [frame(1, [7])]]]))]).toEqual([key]);
    expect([...gate.due(new Map([[key, [frame(1, [8])]]]))]).toEqual([key]);
    expect([...gate.due(new Map([[key, [frame(1, [8])]]]))]).toEqual([]);
  });

  test("vanished subscriptions stop retaining payloads", () => {
    const gate = new BroadcastGate();
    const key = subscriptionKey([1]);
    expect([...gate.due(new Map([[key, [frame(1, [7])]]]))]).toEqual([key]);
    expect([...gate.due(new Map())]).toEqual([]);
    // Re-subscribing after the prune sends again rather than reading stale memory.
    expect([...gate.due(new Map([[key, [frame(1, [7])]]]))]).toEqual([key]);
  });
});
