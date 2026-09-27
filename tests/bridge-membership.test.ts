import { EventEmitter, once } from "node:events";
import { createSocket, type Socket } from "node:dgram";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { Receiver } from "sacn";
import {
  createIdempotentStop,
  createSacnLifecycle,
  reconcileReceiverMemberships,
  startBridge,
  type RunningBridge,
} from "../bridge/src/server.ts";

class FakeReceiver extends EventEmitter {
  readonly socket = createSocket("udp4");
  readonly calls: string[] = [];
  readonly removed: Promise<void>;
  private resolveRemoved!: () => void;
  closeCalls = 0;

  constructor() {
    super();
    this.removed = new Promise<void>((resolve) => {
      this.resolveRemoved = resolve;
    });
    queueMicrotask(() => this.socket.bind(0, "127.0.0.1"));
  }

  addUniverse(universe: number): this {
    this.calls.push(`add:${universe}`);
    return this;
  }

  removeUniverse(universe: number): this {
    this.calls.push(`remove:${universe}`);
    this.resolveRemoved();
    return this;
  }

  close(callback?: () => void): this {
    this.closeCalls++;
    this.socket.close(callback);
    return this;
  }
}

test("reconciles active receiver memberships", () => {
  const calls: string[] = [];
  const receiver = {
    addUniverse(universe: number): void {
      calls.push(`add:${universe}`);
    },
    removeUniverse(universe: number): void {
      calls.push(`remove:${universe}`);
    },
    close(): void {},
  };
  const joined = new Set<number>();

  expect(reconcileReceiverMemberships(receiver, joined, new Set([1, 2]), true)).toBe(true);
  expect(reconcileReceiverMemberships(receiver, joined, new Set([2, 3]), true)).toBe(true);
  expect(calls).toEqual(["add:1", "add:2", "add:3", "remove:1"]);
  expect(joined).toEqual(new Set([2, 3]));
});

test("stops reconciliation when the receiver socket closes during membership teardown", () => {
  const joined = new Set([7]);
  const receiver = {
    addUniverse(): void {
      throw new Error("unexpected add");
    },
    removeUniverse(): void {
      const error = new Error("socket closed") as Error & { code: string };
      error.code = "ERR_SOCKET_DGRAM_NOT_RUNNING";
      throw error;
    },
    close(): void {},
  };

  expect(reconcileReceiverMemberships(receiver, joined, new Set(), true)).toBe(false);
  expect(joined).toEqual(new Set([7]));
  expect(reconcileReceiverMemberships(receiver, joined, new Set([8]), false)).toBe(false);
});

test("actual receiver socket close disables reconciliation", async () => {
  const receiver = new Receiver({ universes: [], port: 0, reuseAddr: true });
  const receiverSocket = (receiver as unknown as { socket: Socket }).socket;
  await once(receiverSocket, "listening");
  const lifecycle = createSacnLifecycle(receiver, receiverSocket);
  const joined = new Set<number>();

  lifecycle.reconcile(joined, new Set());
  receiverSocket.close();
  await once(receiverSocket, "close");
  lifecycle.reconcile(joined, new Set([4]));
  await lifecycle.close();
  await lifecycle.close();

  expect(joined).toEqual(new Set());
});

function waitForWebSocketEvent(
  socket: WebSocket,
  event: "open" | "message" | "close",
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const onEvent = (): void => {
    socket.removeEventListener("error", onError);
    resolve();
  };
  const onError = (): void => {
    socket.removeEventListener(event, onEvent);
    reject(new Error(`WebSocket ${event} event failed`));
  };
  socket.addEventListener(event, onEvent, { once: true });
  socket.addEventListener("error", onError, { once: true });
  return promise;
}

test("startBridge reconciles memberships when a WebSocket closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "beamhouse-membership-"));
  const receiver = new FakeReceiver();
  let bridge: RunningBridge | null = null;
  let client: WebSocket | null = null;

  try {
    bridge = await startBridge({
      hostname: "127.0.0.1",
      httpPort: 0,
      sacnPort: 0,
      artnetPort: 0,
      appDirectory: directory,
      watchDirectory: directory,
      sacnStaleMs: 2_500,
      artnetStaleMs: 6_000,
      recordPath: null,
      sacnReceiver: receiver,
    });
    client = new WebSocket(`${bridge.url}/ws`);
    await waitForWebSocketEvent(client, "open");

    const health = waitForWebSocketEvent(client, "message");
    client.send(JSON.stringify({ op: "subscribe", universes: [123] }));
    await health;
    expect(receiver.calls).toEqual(["add:123"]);

    client.close();
    await Promise.all([waitForWebSocketEvent(client, "close"), receiver.removed]);
    expect(receiver.calls).toEqual(["add:123", "remove:123"]);

    const firstStop = bridge.stop();
    const secondStop = bridge.stop();
    expect(firstStop).toBe(secondStop);
    await Promise.all([firstStop, secondStop, bridge.stop()]);
    expect(receiver.closeCalls).toBe(1);
  } finally {
    client?.close();
    if (bridge) await bridge.stop();
    else receiver.socket.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("returned stop function shares one concurrent cleanup", async () => {
  let cleanups = 0;
  const stop = createIdempotentStop(async () => {
    cleanups++;
    await Promise.resolve();
  });

  const first = stop();
  const second = stop();
  expect(first).toBe(second);
  await Promise.all([first, second, stop()]);

  expect(cleanups).toBe(1);
});

test("repeated stop calls share cleanup rejection", async () => {
  const failure = new Error("cleanup failed");
  const stop = createIdempotentStop(() => Promise.reject(failure));
  const first = stop();
  const second = stop();

  expect(first).toBe(second);
  const firstError = await first.catch((error: unknown) => error);
  const secondError = await second.catch((error: unknown) => error);
  expect(firstError).toBe(failure);
  expect(secondError).toBe(failure);
});

test("does not swallow unrelated receiver errors", () => {
  const failure = new Error("membership failed");
  const receiver = {
    addUniverse(): void {
      throw failure;
    },
    removeUniverse(): void {},
    close(): void {},
  };

  expect(() => reconcileReceiverMemberships(receiver, new Set(), new Set([1]), true)).toThrow(
    failure,
  );
});
