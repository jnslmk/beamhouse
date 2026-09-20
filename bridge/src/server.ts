import { createReadStream, watch } from "node:fs";
import { access, appendFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSocket, type Socket } from "node:dgram";
import { once } from "node:events";
import { basename, extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { gzipSync } from "node:zlib";
import { WebSocketServer, type WebSocket } from "ws";
import { Receiver, type Packet } from "sacn";
import { encodeFrame, encodeRecordMember, prefixFrame, RECORD_MEMBER_MS } from "@beamhouse/wire";
import { parseArtDmx, parseSacn } from "./protocols.ts";
import { BroadcastGate, groupBySubscription, subscriptionKey } from "./frame-dedup.ts";
import { UniverseStore } from "./universe-store.ts";
import type { UniverseFrame } from "@beamhouse/wire";
import { createCaptureStore, validateCaptureUpload, type CaptureStore } from "./mcp.ts";

interface ClientData {
  subscriptions: Set<number>;
  lastHealth: string;
  controlId: number | null;
  lastLiveness: number;
}

/** ws socket carrying the per-client state Bun used to store in its upgrade data. */
type ControlSocket = WebSocket & { data: ClientData };

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
  /** .bhr path when --record tees constructed section-07 bytes; null records nothing. */
  recordPath: string | null;
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
  // Request envelopes stay opaque: the bridge routes by op and id, never opening them.
  // Relay ids are minted here so concurrent requesters can never collide on an id.
  let nextRelayId = 1;
  const pendingRelay = new Map<
    number,
    { requester: ControlSocket; requestId: number; timer: ReturnType<typeof setTimeout> }
  >();
  const captures = createCaptureStore();
  // --record is a byte tee with no surface: constructed section-07 bytes are
  // buffered per tick and gzipped per 10 s member off the tick, so UDP reception
  // never waits on compression or disk.
  const recorder = config.recordPath ? createRecorder(config.recordPath) : null;

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

  const watchPrefix = basename(config.watchDirectory);
  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Without an Upgrade header this never reaches the "upgrade" handler below;
    // keep Bun.serve's answer for a WebSocket path that cannot upgrade.
    if (url.pathname === "/ws") {
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (url.pathname.startsWith("/capture/")) {
      return handleCapture(request, url.pathname.slice("/capture/".length), captures);
    }
    // Reload paths are watch-relative (`shows/rig.yml`), so the watched bytes
    // are served under the same prefix; parsing stays in the browser.
    if (url.pathname === `/${watchPrefix}` || url.pathname.startsWith(`/${watchPrefix}/`)) {
      return serveWatched(request, url, config.watchDirectory, watchPrefix);
    }
    return serveApp(request, url, config.appDirectory);
  }
  const server = createServer((request, response) => {
    void serveWebResponse(request, response);
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/ws") {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (socket) => {
      const client = socket as ControlSocket;
      client.data = { subscriptions: new Set(), lastHealth: "", controlId: null, lastLiveness: 0 };
      sockets.emit("connection", client, request);
    });
  });
  sockets.on("connection", (raw) => {
    const socket = raw as ControlSocket;
    clients.add(socket);
    socket.on("message", (data: unknown, isBinary: boolean) => {
      // ws hands text frames over as Buffers; isBinary is the text/binary gate
      // that Bun's `typeof message === "string"` check used to be.
      if (isBinary) return;
      const message = typeof data === "string" ? data : String(data);
      if (handleControl(socket, message)) return;
      const subscriptions = parseSubscription(message);
      if (!subscriptions) return;
      socket.data.subscriptions = subscriptions;
      reconcileMemberships();
      sendHealth(socket, true);
    });
    socket.on("close", () => {
      clients.delete(socket);
      const ownerGone = socket === owner;
      for (const [relayId, pending] of pendingRelay) {
        if (pending.requester !== socket && !ownerGone) continue;
        clearTimeout(pending.timer);
        pendingRelay.delete(relayId);
        if (pending.requester !== socket)
          pending.requester.send(
            JSON.stringify({
              op: "response",
              requestId: pending.requestId,
              ok: false,
              error: "owning page disconnected",
            }),
          );
      }
      if (socket === owner) releaseOwner();
      else if (socket === pendingTakeover?.candidate) cancelTakeover();
      reconcileMemberships();
    });
  });
  server.listen(config.httpPort, config.hostname);
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : config.httpPort;

  /** Node request in, Web Response out: handlers above and below stay Web-shaped. */
  async function serveWebResponse(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const webResponse = await route(toWebRequest(request));
    const headers: Record<string, string> = {};
    webResponse.headers.forEach((value, key) => {
      headers[key] = value;
    });
    response.writeHead(webResponse.status, headers);
    if (!webResponse.body) {
      response.end();
      return;
    }
    Readable.fromWeb(webResponse.body as unknown as NodeReadableStream).pipe(response);
  }

  // Idle-frame gating: one shared immutable encoding per subscription set per
  // tick, skip-on-identical payloads, heartbeat so quiet never reads as dead.
  // The recording tee reuses the same gate (without heartbeat: tMs-indexed
  // playback already distinguishes gaps from loss, so idle stays unrecorded).
  const broadcastGate = new BroadcastGate();
  const recordGate = new BroadcastGate();
  const frameTimer = setInterval(() => {
    const tMs = Math.round(performance.now());
    const groups = groupBySubscription(
      [...clients].map((socket) => ({
        subscriptions: socket.data.subscriptions,
        send: (bytes: Uint8Array): void => void socket.send(bytes),
      })),
    );
    const snapshots = new Map<string, UniverseFrame[]>();
    for (const [key, group] of groups) {
      const frames = store.frames(group.universes);
      if (frames.length > 0) snapshots.set(key, frames);
    }
    const encoded = new Map<string, Uint8Array>();
    for (const key of broadcastGate.due(snapshots)) {
      // Single writer, read-only fan-out: every same-subscription client
      // receives these exact bytes; handlers must never mutate them.
      const bytes = encodeFrame(tMs, snapshots.get(key) ?? []);
      encoded.set(key, bytes);
      for (const client of groups.get(key)?.clients ?? []) client.send(bytes);
    }
    if (recorder && snapshots.size > 0) {
      // The bridge joins sACN universes per subscription, so the snapshot
      // union is everything it receives; with no clients there is nothing to tee.
      const union = mergeSnapshots(snapshots);
      const unionSubKey = subscriptionKey(union.map((frame) => frame.universe));
      if (recordGate.due(new Map([[`record:${unionSubKey}`, union]]), false).size > 0) {
        // Reuse a group encoding when the union matches it: no second encode.
        recorder.teeEncoded(prefixFrame(encoded.get(unionSubKey) ?? encodeFrame(tMs, union)));
      }
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
    let value: {
      op?: unknown;
      requestId?: unknown;
      request?: unknown;
      ok?: unknown;
      result?: unknown;
      error?: unknown;
      scene?: unknown;
      follow?: unknown;
    };
    try {
      const parsed: unknown = JSON.parse(message);
      if (!parsed || typeof parsed !== "object") return false;
      value = parsed;
    } catch {
      return false;
    }
    if (value.op === "request") {
      if (socket.data.controlId === null || typeof value.requestId !== "number") return true;
      if (!owner) {
        socket.send(
          JSON.stringify({
            op: "response",
            requestId: value.requestId,
            ok: false,
            error: "no owning page connected",
          }),
        );
        return true;
      }
      const callerRequestId = value.requestId;
      const requester = socket;
      const relayId = nextRelayId++;
      const timer = setTimeout(() => {
        if (pendingRelay.delete(relayId))
          requester.send(
            JSON.stringify({
              op: "response",
              requestId: callerRequestId,
              ok: false,
              error: "request timed out waiting for the owning page",
            }),
          );
      }, 15_000);
      pendingRelay.set(relayId, { requester, requestId: callerRequestId, timer });
      owner.send(JSON.stringify({ op: "request", requestId: relayId, request: value.request }));
      return true;
    }
    if (value.op === "response") {
      if (socket !== owner || typeof value.requestId !== "number") return true;
      const relayId = value.requestId;
      const pending = pendingRelay.get(relayId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRelay.delete(relayId);
        pending.requester.send(
          JSON.stringify({
            op: "response",
            requestId: pending.requestId,
            ok: value.ok === true,
            result: value.result,
            error: value.error,
          }),
        );
      }
      return true;
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

  const urlHost = config.hostname.includes(":") ? `[${config.hostname}]` : config.hostname;
  return {
    url: new URL(`http://${urlHost}:${port}/`).toString().replace(/\/$/, ""),
    async stop() {
      clearInterval(frameTimer);
      // Flush the partial member so even a short take stays a readable .bhr.
      await recorder?.flush();
      clearInterval(healthTimer);
      clearInterval(ownershipTimer);
      for (const client of clients) client.close(1001, "bridge stopping");
      sockets.close();
      server.close();
      server.closeAllConnections();
      await once(server, "close");
      patchWatcher.close();
      await new Promise<void>((done) => artnet.close(done));
      await new Promise<void>((done) => sacn.close(done));
    },
  };
}

/** Merge per-group snapshots into one sorted union without re-snapshotting. */
function mergeSnapshots(snapshots: ReadonlyMap<string, UniverseFrame[]>): UniverseFrame[] {
  const union = new Map<number, UniverseFrame>();
  for (const frames of snapshots.values()) {
    for (const frame of frames) union.set(frame.universe, frame);
  }
  return [...union.values()].sort((left, right) => left.universe - right.universe);
}

interface Recorder {
  teeEncoded(prefixed: Uint8Array): void;
  flush(): Promise<void>;
}

function createRecorder(path: string): Recorder {
  let chunks: Uint8Array[] = [];
  let memberStart = Date.now();
  let failed = false;
  const failedNote = " failed; continuing without a record";
  let writing: Promise<void> = writeFile(path, new Uint8Array(0)).catch((error: unknown) => {
    failed = true;
    console.warn("Recording to " + path + failedNote, error);
  });

  function rotate(): void {
    const pending = chunks;
    chunks = [];
    memberStart = Date.now();
    if (pending.length === 0 || failed) return;
    writing = writing
      .then(() =>
        appendFile(
          path,
          encodeRecordMember(pending, (raw) => gzipSync(raw)),
        ),
      )
      .catch((error: unknown) => {
        failed = true;
        console.warn("Recording to " + path + failedNote, error);
      });
  }

  return {
    teeEncoded(prefixed) {
      if (failed || prefixed.length === 0) return;
      chunks.push(prefixed);
      if (Date.now() - memberStart >= RECORD_MEMBER_MS) rotate();
    },
    async flush() {
      rotate();
      await writing;
    },
  };
}

async function handleCapture(
  request: Request,
  id: string,
  captures: CaptureStore,
): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return new Response("unknown capture", { status: 404 });
  if (request.method === "POST") {
    const upload = validateCaptureUpload({
      feed: request.headers.get("x-capture-feed"),
      width: request.headers.get("x-capture-width"),
      height: request.headers.get("x-capture-height"),
      downscaled: request.headers.get("x-capture-downscaled"),
    });
    if ("error" in upload) return new Response(upload.error, { status: 400 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const stored = captures.put(id, { bytes, ...upload });
    if (!stored.ok) return new Response(stored.error, { status: 413 });
    return new Response("stored", { status: 201 });
  }
  if (request.method === "GET") {
    const entry = captures.take(id);
    if (!entry) return new Response("unknown or expired capture", { status: 404 });
    return new Response(entry.bytes, {
      headers: {
        "content-type": "image/jpeg",
        "x-capture-feed": entry.feed,
        "x-capture-width": String(entry.width),
        "x-capture-height": String(entry.height),
        "x-capture-downscaled": String(entry.downscaled),
      },
    });
  }
  return new Response("method not allowed", { status: 405 });
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

/** Adapter: node request in, Web Request out — every handler keeps its Web shape. */
function toWebRequest(request: IncomingMessage): Request {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method ?? "GET",
    headers: request.headers as Record<string, string>,
  };
  if (init.method !== "GET" && init.method !== "HEAD") {
    init.body = Readable.toWeb(request) as unknown as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(`http://${request.headers.host ?? "localhost"}${request.url ?? "/"}`, init);
}

// Bun.file inferred this from the extension; these are the types the app bundle
// and its assets actually travel as. Unknown extensions stay opaque bytes.
const CONTENT_TYPES: Record<string, string> = {
  css: "text/css",
  gif: "image/gif",
  glb: "model/gltf-binary",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  mjs: "text/javascript",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  wasm: "application/wasm",
  webmanifest: "application/manifest+json",
  xml: "application/xml",
};

function contentType(absolutePath: string): string {
  return CONTENT_TYPES[extname(absolutePath).slice(1).toLowerCase()] ?? "application/octet-stream";
}

/** GLB models stream off disk; buffering a model per request would spike RSS. */
function fileBody(absolutePath: string): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(absolutePath)) as unknown as ReadableStream<Uint8Array>;
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
  try {
    await access(absolutePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(request.method === "HEAD" ? null : fileBody(absolutePath), {
    headers: {
      "Content-Type": contentType(absolutePath),
      "Cache-Control":
        relativePath === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
    },
  });
}

async function serveWatched(
  request: Request,
  url: URL,
  watchDirectory: string,
  watchPrefix: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const relativePath = decodeURIComponent(url.pathname.slice(watchPrefix.length + 2));
  if (
    relativePath.length === 0 ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return new Response("Not found", { status: 404 });
  }
  const absolutePath = resolve(watchDirectory, relativePath);
  const watchRoot = resolve(watchDirectory);
  if (!absolutePath.startsWith(`${watchRoot}${sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    await access(absolutePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(request.method === "HEAD" ? null : fileBody(absolutePath), {
    headers: {
      "Content-Type": contentType(absolutePath),
      "Cache-Control": "no-cache",
    },
  });
}
