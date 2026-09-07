import { watch } from "node:fs";
import { createSocket, type Socket } from "node:dgram";
import { once } from "node:events";
import { basename, resolve, sep } from "node:path";
import { Receiver, type Packet } from "sacn";
import { encodeFrame } from "@beamhouse/wire";
import { parseArtDmx, parseSacn } from "./protocols.ts";
import { UniverseStore } from "./universe-store.ts";

interface ClientData {
  subscriptions: Set<number>;
  lastHealth: string;
  controlId: number | null;
  lastLiveness: number;
}

type ControlSocket = Bun.ServerWebSocket<ClientData>;

interface PendingTakeover {
  requestId: number;
  requestedAt: number;
  owner: ControlSocket;
  candidate: ControlSocket;
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
  const clients = new Set<ControlSocket>();
  const joinedUniverses = new Set<number>();
  let nextControlId = 1;
  let nextTakeoverRequestId = 1;
  let owner: ControlSocket | null = null;
  let pendingTakeover: PendingTakeover | null = null;

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

  const artnet = createSocket({ type: "udp4", reuseAddr: true });
  artnet.on("message", (bytes, remote) => {
    const parsed = parseArtDmx(bytes, remote.address, Date.now());
    if (parsed && store.ingest(parsed)) broadcastHealth();
  });
  artnet.on("error", (error) => console.warn("Art-Net listener error", error));
  artnet.bind(config.artnetPort, config.hostname);
  await once(artnet, "listening");

  const server = Bun.serve<ClientData>({
    hostname: config.hostname,
    port: config.httpPort,
    fetch(request, serverInstance) {
      const url = new URL(request.url);
      if (url.pathname === "/ws") {
        return serverInstance.upgrade(request, {
          data: { subscriptions: new Set(), lastHealth: "", controlId: null, lastLiveness: 0 },
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
        if (handleControl(socket, message)) return;
        const subscriptions = parseSubscription(message);
        if (!subscriptions) return;
        socket.data.subscriptions = subscriptions;
        reconcileMemberships();
        sendHealth(socket, true);
      },
      close(socket) {
        clients.delete(socket);
        if (socket === owner) releaseOwner();
        else if (socket === pendingTakeover?.candidate) cancelTakeover();
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
  const ownershipTimer = setInterval(() => {
    const now = Date.now();
    if (owner && now - owner.data.lastLiveness > 15_000) releaseOwner();
    else if (pendingTakeover && now - pendingTakeover.requestedAt > 15_000) cancelTakeover();
  }, 1_000);
  const patchWatcher = watch(config.watchDirectory, { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(?:bhs|mvr|ya?ml)$/i.test(filename)) return;
    const path = `${basename(config.watchDirectory)}/${filename}`;
    const message = JSON.stringify({ op: "reload", path });
    for (const client of clients) client.send(message);
  });

  function broadcastHealth(force = false): void {
    for (const client of clients) sendHealth(client, force);
  }

  function sendHealth(client: ControlSocket, force: boolean): void {
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

  function handleControl(socket: ControlSocket, message: string): boolean {
    let value: { op?: unknown; requestId?: unknown; scene?: unknown; follow?: unknown };
    try {
      const parsed: unknown = JSON.parse(message);
      if (!parsed || typeof parsed !== "object") return false;
      value = parsed;
    } catch {
      return false;
    }
    if (value.op === "control.join") {
      if (socket.data.controlId === null) socket.data.controlId = nextControlId++;
      socket.data.lastLiveness = Date.now();
      if (!owner && value.follow !== true) owner = socket;
      broadcastOwnership();
      owner?.send(JSON.stringify({ op: "control.snapshot.request" }));
      return true;
    }
    if (value.op === "control.liveness") {
      if (socket === owner) socket.data.lastLiveness = Date.now();
      return true;
    }
    if (value.op === "control.takeover") {
      if (socket.data.controlId === null) return true;
      if (socket === owner || pendingTakeover) return true;
      if (!owner) {
        owner = socket;
        socket.data.lastLiveness = Date.now();
        broadcastOwnership();
        return true;
      }
      pendingTakeover = {
        requestId: nextTakeoverRequestId++,
        requestedAt: Date.now(),
        owner,
        candidate: socket,
      };
      owner.send(
        JSON.stringify({
          op: "control.snapshot.request",
          requestId: pendingTakeover.requestId,
          relinquish: true,
        }),
      );
      return true;
    }
    if (
      value.op === "control.snapshot.ack" &&
      pendingTakeover &&
      socket === pendingTakeover.candidate &&
      value.requestId === pendingTakeover.requestId
    ) {
      owner = socket;
      socket.data.lastLiveness = Date.now();
      pendingTakeover = null;
      broadcastOwnership();
      return true;
    }
    if (
      value.op === "control.snapshot" &&
      pendingTakeover &&
      socket === pendingTakeover.owner &&
      value.requestId === pendingTakeover.requestId
    ) {
      pendingTakeover.candidate.send(message);
      const followerSnapshot = JSON.stringify({ op: "control.snapshot", scene: value.scene });
      for (const client of clients) {
        if (
          client !== socket &&
          client !== pendingTakeover.candidate &&
          client.data.controlId !== null
        )
          client.send(followerSnapshot);
      }
      return true;
    }
    if (
      (value.op === "control.snapshot" || value.op === "control.scene.changed") &&
      socket === owner
    ) {
      for (const client of clients) {
        if (client !== socket && client.data.controlId !== null) client.send(message);
      }
      return true;
    }
    return false;
  }

  function releaseOwner(): void {
    pendingTakeover = null;
    owner = null;
    broadcastOwnership();
  }

  function cancelTakeover(): void {
    pendingTakeover = null;
    broadcastOwnership();
  }

  function broadcastOwnership(): void {
    for (const client of clients) {
      if (client.data.controlId === null) continue;
      client.send(
        JSON.stringify({
          op: "control.owner",
          owner: client === owner,
          ownerName: owner ? `page ${owner.data.controlId}` : null,
        }),
      );
    }
  }

  return {
    url: server.url.toString().replace(/\/$/, ""),
    async stop() {
      clearInterval(frameTimer);
      clearInterval(healthTimer);
      clearInterval(ownershipTimer);
      for (const client of clients) client.close(1001, "bridge stopping");
      await server.stop(true);
      patchWatcher.close();
      await new Promise<void>((done) => artnet.close(done));
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
