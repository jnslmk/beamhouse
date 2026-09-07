// One MCP server over the bridge control channel (ADR-0026, ADR-0028).
//
// The server is a client of the control channel: it joins the bridge as a
// follower (never the owner) and forwards the four request classes to the
// owning page, which applies them. Commands earn undo entries through the
// page's SceneCommands; queries, captures and looks never do.

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_SERVER_NAME = "beamhouse";
export const DEFAULT_MAX_EDGE = 1280;
export const DEFAULT_QUALITY = 0.8;
export const MAX_CAPTURE_BYTES = 1_000_000;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: McpTool[] = [
  {
    name: "command",
    description:
      "Mutate the scene through the owning page's SceneCommands (undoable, agent-marked). Carries explicit fixture ids and exact values.",
    inputSchema: {
      type: "object",
      required: ["kind"],
      properties: { kind: { type: "string" } },
    },
  },
  {
    name: "query",
    description:
      "Read without mutating: rig, fixtures, issues, universes, history, measurements; camera, selection, hold, undo/redo move no scene state.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    },
  },
  {
    name: "capture",
    description:
      "Render the viewport and return an HTTP-fetchable handle with feed stamp, dimensions, size and downscale status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "look",
    description:
      "Set the generated feed's slot-value frame (enters above the resolution seam) or release back to live.",
    inputSchema: { type: "object", properties: {} },
  },
];

const COMMAND_KINDS = new Set([
  "placement.set",
  "placement.clear",
  "array.set",
  "fixture.add",
  "definition.set",
  "camera.saveView",
  "rotate",
]);

const QUERY_NAMES = new Set([
  "rig.list",
  "fixture.get",
  "issues.list",
  "universes.list",
  "history",
  "measurements",
  "camera.get",
  "camera.set",
  "select",
  "hold",
  "undo",
  "redo",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((id) => Number.isInteger(id));
}

function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));
}

/** A command carries its target ids explicitly — never ambient selection or snap. */
export function validateCommandInput(params: unknown): string | null {
  if (!isRecord(params) || typeof params.kind !== "string") return "command needs a kind";
  if (!COMMAND_KINDS.has(params.kind)) return `unknown command kind ${params.kind}`;
  switch (params.kind) {
    case "placement.set": {
      if (!isIdList(params.fixtureIds)) return "placement.set needs non-empty integer fixtureIds";
      if (!isRecord(params.placements)) return "placement.set needs exact placements";
      for (const id of params.fixtureIds) {
        const placement = params.placements[String(id)];
        if (!isRecord(placement) || !isTriple(placement.position) || !isTriple(placement.rotation))
          return `placement.set needs an exact position and rotation for fixture ${id}`;
      }
      return null;
    }
    case "placement.clear":
      return isIdList(params.fixtureIds)
        ? null
        : "placement.clear needs non-empty integer fixtureIds";
    case "array.set":
      if (typeof params.id !== "string" || params.id.length === 0) return "array.set needs an id";
      if (!isRecord(params.array) || !isIdList(params.array.memberIds))
        return "array.set needs an array with non-empty integer memberIds";
      return null;
    case "rotate": {
      if (!isIdList(params.fixtureIds)) return "rotate needs non-empty integer fixtureIds";
      if (!isTriple(params.delta)) return "rotate needs an exact delta triple in degrees";
      const pivot = params.pivot;
      if (
        !isRecord(pivot) ||
        (pivot.mode !== "own" && pivot.mode !== "shared" && pivot.mode !== "explicit")
      )
        return "rotate needs a pivot with mode own, shared, or explicit";
      if (pivot.mode === "explicit" && !isTriple(pivot.point))
        return "rotate with an explicit pivot needs an exact point";
      return null;
    }
    default:
      return null;
  }
}

export function validateQueryInput(params: unknown): string | null {
  if (!isRecord(params) || typeof params.name !== "string") return "query needs a name";
  if (!QUERY_NAMES.has(params.name)) return `unknown query ${params.name}`;
  if (params.name === "fixture.get" && !Number.isInteger(params.id))
    return "fixture.get needs an integer id";
  if (params.name === "camera.set") {
    const view = params.view;
    if (!isRecord(view) || !isTriple(view.position) || !isTriple(view.target))
      return "camera.set needs a view with exact position and target";
  }
  if (params.name === "select" && params.ids !== undefined) {
    if (!Array.isArray(params.ids) || !params.ids.every(Number.isInteger))
      return "select needs an integer id array";
  }
  if (params.name === "hold" && typeof params.on !== "boolean") return "hold needs a boolean on";
  return null;
}

export function validateCaptureInput(
  params: unknown,
): { maxEdge: number; quality: number } | { error: string } {
  const raw = isRecord(params) ? params : {};
  const maxEdge = raw.maxEdge === undefined ? DEFAULT_MAX_EDGE : Number(raw.maxEdge);
  const quality = raw.quality === undefined ? DEFAULT_QUALITY : Number(raw.quality);
  if (!Number.isFinite(maxEdge) || maxEdge < 16 || maxEdge > 4096)
    return { error: "maxEdge must be between 16 and 4096" };
  if (!Number.isFinite(quality) || quality < 0.1 || quality > 1)
    return { error: "quality must be between 0.1 and 1" };
  return { maxEdge, quality };
}

export function validateLookInput(params: unknown): string | null {
  if (!isRecord(params)) return "look needs an object";
  if (params.clear === true) return null;
  if (params.feed === "live") return null;
  const slots = params.slots;
  if (!isRecord(slots)) return "look needs slots or clear";
  for (const [universe, values] of Object.entries(slots)) {
    const id = Number(universe);
    if (!Number.isInteger(id) || id < 1 || id > 63999) return `invalid universe ${universe}`;
    if (!Array.isArray(values) || values.length === 0 || values.length > 512)
      return `universe ${universe} needs 1 to 512 slot values`;
    if (!values.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
      return `universe ${universe} needs integer slot values 0-255`;
  }
  return null;
}

export interface CaptureEntry {
  bytes: Uint8Array<ArrayBuffer>;
  feed: string;
  width: number;
  height: number;
  downscaled: boolean;
}

/** Opaque bytes under an opaque key: single-fetch, expiring, hard-capped. */
export function createCaptureStore(limitBytes = MAX_CAPTURE_BYTES) {
  const entries = new Map<string, { entry: CaptureEntry; timer: ReturnType<typeof setTimeout> }>();
  let heldBytes = 0;
  const remove = (id: string): CaptureEntry | undefined => {
    const held = entries.get(id);
    if (!held) return undefined;
    clearTimeout(held.timer);
    entries.delete(id);
    heldBytes -= held.entry.bytes.byteLength;
    return held.entry;
  };
  return {
    put(id: string, entry: CaptureEntry): { ok: true } | { ok: false; error: string } {
      if (entry.bytes.byteLength > limitBytes)
        return {
          ok: false,
          error: `capture is ${entry.bytes.byteLength} bytes, over the ${limitBytes} byte cap`,
        };
      const freed = entries.get(id)?.entry.bytes.byteLength ?? 0;
      if (heldBytes - freed + entry.bytes.byteLength > limitBytes)
        return {
          ok: false,
          error: `capture store is full (holding ${heldBytes} of ${limitBytes} bytes)`,
        };
      remove(id);
      // ponytail: single timer per capture; a sweep would be machinery for one small buffer.
      const timer = setTimeout(() => remove(id), 5 * 60_000);
      timer.unref();
      entries.set(id, { entry, timer });
      heldBytes += entry.bytes.byteLength;
      return { ok: true };
    },
    take(id: string): CaptureEntry | undefined {
      return remove(id);
    },
    has(id: string): boolean {
      return entries.has(id);
    },
  };
}

export type CaptureStore = ReturnType<typeof createCaptureStore>;

export interface CaptureUpload {
  feed: string;
  width: number;
  height: number;
  downscaled: boolean;
}

const MAX_CAPTURE_DIMENSION = 16384;

/** Header contract for POST /capture/:id — garbage is a 400, never stored bytes. */
export function validateCaptureUpload(
  headers: Record<string, string | null>,
): CaptureUpload | { error: string } {
  const feed = headers.feed ?? "unknown";
  if (feed.length === 0 || feed.length > 64) return { error: "x-capture-feed must be 1-64 chars" };
  if (headers.width === null || headers.height === null)
    return { error: "capture needs x-capture-width and x-capture-height" };
  const width = Number(headers.width);
  const height = Number(headers.height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 0 ||
    height < 0 ||
    width > MAX_CAPTURE_DIMENSION ||
    height > MAX_CAPTURE_DIMENSION
  )
    return { error: "x-capture-width and x-capture-height must be integers 0-16384" };
  const rawDownscaled = headers.downscaled ?? "false";
  if (rawDownscaled !== "true" && rawDownscaled !== "false")
    return { error: "x-capture-downscaled must be true or false" };
  return { feed, width, height, downscaled: rawDownscaled === "true" };
}

export interface JsonRpcContext {
  callTool(name: string, args: Record<string, unknown>): Promise<{ content: unknown[] }>;
}

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

/** Minimal MCP stdio framing: newline-delimited JSON-RPC. Pure except via ctx. */
export async function handleJsonRpc(
  raw: unknown,
  ctx: JsonRpcContext,
): Promise<Record<string, unknown> | null> {
  const message: JsonRpcMessage = isRecord(raw) ? raw : {};
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    if (message.id === undefined) return null;
    return {
      jsonrpc: "2.0",
      id: message.id ?? null,
      error: { code: -32600, message: "invalid request" },
    };
  }
  if (message.id === undefined) return null;
  const id = message.id;
  const params: Record<string, unknown> = isRecord(message.params) ? message.params : {};
  switch (message.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: MCP_SERVER_NAME, version: "0.0.0" },
        },
      };
    case "notifications/initialized":
      return null;
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name;
      const args: Record<string, unknown> = isRecord(params.arguments) ? params.arguments : {};
      if (typeof name !== "string" || !TOOLS.some((tool) => tool.name === name))
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `unknown tool ${String(name)}` },
        };
      try {
        const result = await ctx.callTool(name, args);
        return { jsonrpc: "2.0", id, result };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: error instanceof Error ? error.message : String(error) },
        };
      }
    }
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `unknown method ${message.method}` },
      };
  }
}

export interface McpRequestResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Control-channel client: joins as a follower and routes the four classes. */
export class McpBridgeClient {
  #socket: WebSocket | null = null;
  #nextId = 1;
  #pending = new Map<
    number,
    {
      resolve: (result: McpRequestResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  #ready: Promise<void>;
  #resolveReady!: () => void;

  constructor(
    private readonly bridgeUrl: string,
    private readonly timeoutMs = 15_000,
  ) {
    this.#ready = new Promise<void>((resolve) => (this.#resolveReady = resolve));
  }

  async connect(): Promise<void> {
    const wsUrl = this.bridgeUrl.replace(/^http/, "ws");
    this.#socket = new WebSocket(`${wsUrl}/ws`);
    this.#socket.addEventListener("open", () => {
      // A follower never contends for ownership: the owning page applies requests.
      this.#socket?.send(JSON.stringify({ op: "control.join", follow: true }));
      this.#resolveReady();
    });
    this.#socket.addEventListener("message", (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isRecord(message) || message.op !== "response" || typeof message.requestId !== "number")
        return;
      const waiting = this.#pending.get(message.requestId);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.#pending.delete(message.requestId);
      const detail: McpRequestResult = { ok: message.ok === true };
      if (message.result !== undefined) detail.result = message.result;
      if (typeof message.error === "string") detail.error = message.error;
      waiting.resolve(detail);
    });
    await this.#ready;
  }

  async request(
    requestClass: "command" | "query" | "capture" | "look",
    name: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this.#socket || this.#socket.readyState !== WebSocket.OPEN)
      throw new Error("not connected to the bridge");
    const requestId = this.#nextId++;
    const reply = new Promise<McpRequestResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#pending.delete(requestId)) reject(new Error(`request ${name} timed out`));
      }, this.timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
    });
    this.#socket.send(
      JSON.stringify({ op: "request", requestId, request: { class: requestClass, name, params } }),
    );
    const response = await reply;
    if (!response.ok) throw new Error(response.error ?? `request ${name} failed`);
    return response.result;
  }

  /** Captures arrive as handles; the bytes travel over HTTP, never the DMX socket. */
  async fetchCapture(id: string): Promise<{ bytes: Uint8Array; response: Response }> {
    const response = await fetch(`${this.bridgeUrl}/capture/${id}`);
    if (!response.ok) throw new Error(`capture ${id} unavailable (${response.status})`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), response };
  }

  close(): void {
    for (const waiting of this.#pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("bridge connection closed"));
    }
    this.#pending.clear();
    this.#socket?.close();
    this.#socket = null;
  }
}

if (import.meta.main) {
  const bridgeUrl = process.env.BEAMHOUSE_BRIDGE_URL ?? "http://127.0.0.1:7070";
  const client = new McpBridgeClient(bridgeUrl);
  await client.connect();
  const ctx: JsonRpcContext = {
    async callTool(name, args) {
      switch (name) {
        case "command": {
          const invalid = validateCommandInput(args);
          if (invalid) throw new Error(invalid);
          const result = await client.request("command", String(args.kind), args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "query": {
          const invalid = validateQueryInput(args);
          if (invalid) throw new Error(invalid);
          const result = await client.request("query", String(args.name), args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "capture": {
          const validated = validateCaptureInput(args);
          if ("error" in validated) throw new Error(validated.error);
          const result = (await client.request("capture", "capture", validated)) as {
            captureId: string;
            width: number;
            height: number;
            size: number;
            downscaled: boolean;
            feed: string;
          };
          const { bytes } = await client.fetchCapture(result.captureId);
          const mimeType = "image/jpeg";
          return {
            content: [
              {
                type: "image",
                data: Buffer.from(bytes).toString("base64"),
                mimeType,
              },
              { type: "text", text: JSON.stringify(result) },
            ],
          };
        }
        case "look": {
          const invalid = validateLookInput(args);
          if (invalid) throw new Error(invalid);
          const result = await client.request("look", "look", args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        default:
          throw new Error(`unknown tool ${name}`);
      }
    },
  };
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = async (line: string): Promise<void> => {
    if (line.trim().length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "parse error" },
        }),
      );
      return;
    }
    const response = await handleJsonRpc(parsed, ctx);
    if (response) console.log(JSON.stringify(response));
  };
  for await (const chunk of Bun.stdin.stream() as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) await handleLine(line);
  }
  if (buffer.trim().length > 0) await handleLine(buffer);
  client.close();
}
