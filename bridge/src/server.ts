import { watch } from "node:fs";
import type { Socket } from "node:dgram";
import { once } from "node:events";
import { basename, resolve, sep } from "node:path";
import { Receiver, type Packet } from "sacn";
import { encodeFrame } from "@beamhouse/wire";
import { parseArtDmx, parseSacn } from "./protocols.ts";
import { UniverseStore } from "./universe-store.ts";

interface ClientData {
  subscriptions: Set<number>;
  lastHealth: string;
}

export interface BridgeConfig {
  hostname: string;
  httpPort: number;
  sacnPort: number;
  artnetPort: number;
  appDirectory: string;
  watchDirectory: string;
  sacnStaleMs: number;
  artnetStaleMs: number;
}

export interface RunningBridge {
  url: string;
  stop(): Promise<void>;
}

export async function startBridge(config: BridgeConfig): Promise<RunningBridge> {
  const store = new UniverseStore({
    sacnStaleMs: config.sacnStaleMs,
    artnetStaleMs: config.artnetStaleMs,
  });
  const clients = new Set<Bun.ServerWebSocket<ClientData>>();
  const joinedUniverses = new Set<number>();

  const sacn = new Receiver({ universes: [], port: config.sacnPort, reuseAddr: true });
  // Receiver's built-in ordering rejects before emitting and cannot report the source.
  // Clearing its JS-private cache leaves parsing and multicast membership to the package while
  // UniverseStore applies E1.31's per-source ordering rule with an observable drop count.
  const libraryReceiver = sacn as unknown as {
    lastSequence: Record<string, number>;
    socket: Socket;
  };
  sacn.on("packet", (packet: Packet) => {
    libraryReceiver.lastSequence = {};
    const parsed = parseSacn(packet.buffer, packet.sourceAddress ?? "unknown", Date.now());
    if (parsed && store.ingest(parsed)) broadcastHealth();
  });
  sacn.on("PacketCorruption", (error) => console.warn("Rejected malformed sACN packet", error));
  sacn.on("PacketOutOfOrder", (error) => console.warn("sACN parser rejected packet", error));
  sacn.on("error", (error) => console.warn("sACN listener error", error));
  await once(libraryReceiver.socket, "listening");

  const artnet = await Bun.udpSocket({
    hostname: config.hostname,
    port: config.artnetPort,
    socket: {
      data(_socket, bytes, _port, address) {
        const parsed = parseArtDmx(bytes, address, Date.now());
        if (parsed && store.ingest(parsed)) broadcastHealth();
      },
      error(_socket, error) {
        console.warn("Art-Net listener error", error);
      },
    },
  });

  const server = Bun.serve<ClientData>({
    hostname: config.hostname,
    port: config.httpPort,
    fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (url.pathname === "/ws") {
        return serverInstance.upgrade(request, {
          data: { subscriptions: new Set(), lastHealth: "" },
        })
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 });
      }
      return serveApp(request, url, config.appDirectory);
    },
    websocket: {
      open(socket) {
        clients.add(socket);
      },
      message(socket, message) {
        if (typeof message !== "string") return;
        const subscriptions = parseSubscription(message);
        if (!subscriptions) return;
        socket.data.subscriptions = subscriptions;
        reconcileMemberships();
        sendHealth(socket, true);
      },
      close(socket) {
        clients.delete(socket);
        reconcileMemberships();
      },
    },
  });

  const frameTimer = setInterval(() => {
    const tMs = Math.round(performance.now());
    for (const client of clients) {
      const frames = store.frames([...client.data.subscriptions]);
      if (frames.length > 0) client.send(encodeFrame(tMs, frames));
    }
  }, 1000 / 30);
  const healthTimer = setInterval(() => broadcastHealth(true), 1_000);
  const patchWatcher = watch(config.watchDirectory, { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(?:bhs|mvr|ya?ml)$/i.test(filename)) return;
    const path = `${basename(config.watchDirectory)}/${filename}`;
    const message = JSON.stringify({ op: "reload", path });
    for (const client of clients) client.send(message);
  });

  function broadcastHealth(force = false): void {
    for (const client of clients) sendHealth(client, force);
  }

  function sendHealth(client: Bun.ServerWebSocket<ClientData>, force: boolean): void {
    const serialized = JSON.stringify(store.health([...client.data.subscriptions], Date.now()));
    if (force || serialized !== client.data.lastHealth) {
      client.data.lastHealth = serialized;
      client.send(serialized);
    }
  }

  function reconcileMemberships(): void {
    const wanted = new Set<number>();
    for (const client of clients) {
      for (const universe of client.data.subscriptions) wanted.add(universe);
    }
    for (const universe of wanted) {
      if (!joinedUniverses.has(universe)) {
        sacn.addUniverse(universe);
        joinedUniverses.add(universe);
      }
    }
    for (const universe of joinedUniverses) {
      if (!wanted.has(universe)) {
        sacn.removeUniverse(universe);
        joinedUniverses.delete(universe);
      }
    }
  }

  return {
    url: server.url.toString().replace(/\/$/, ""),
    async stop() {
      clearInterval(frameTimer);
      clearInterval(healthTimer);
      for (const client of clients) client.close(1001, "bridge stopping");
      await server.stop(true);
      patchWatcher.close();
      artnet.close();
      await new Promise<void>((done) => sacn.close(done));
    },
  };
}

function parseSubscription(message: string): Set<number> | null {
  try {
    const value: unknown = JSON.parse(message);
    if (
      typeof value !== "object" ||
      value === null ||
      !("op" in value) ||
      value.op !== "subscribe" ||
      !("universes" in value) ||
      !Array.isArray(value.universes)
    ) {
      return null;
    }
    const universes = value.universes.filter(
      (universe): universe is number =>
        Number.isInteger(universe) && universe >= 1 && universe <= 63_999,
    );
    return new Set(universes);
  } catch {
    return null;
  }
}

async function serveApp(request: Request, url: URL, appDirectory: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const relativePath =
    url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const absolutePath = resolve(appDirectory, relativePath);
  const appRoot = resolve(appDirectory);
  if (absolutePath !== appRoot && !absolutePath.startsWith(`${appRoot}${sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(absolutePath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : file, {
    headers: {
      "Cache-Control":
        relativePath === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
    },
  });
}
