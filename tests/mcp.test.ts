import { describe, expect, test } from "bun:test";
import {
  createCaptureStore,
  handleJsonRpc,
  type JsonRpcContext,
  MAX_CAPTURE_BYTES,
  TOOLS,
  validateCaptureInput,
  validateCaptureUpload,
  validateCommandInput,
  validateLookInput,
  validateQueryInput,
} from "../bridge/src/mcp.ts";
import { GeneratedFeed } from "../app/src/look.ts";

const ctx: JsonRpcContext = {
  callTool(name, args) {
    return Promise.resolve({
      content: [{ type: "text", text: `${name}:${JSON.stringify(args)}` }],
    });
  },
};

describe("mcp request model", () => {
  test("exposes one tool per request class", () => {
    expect(TOOLS.map((tool) => tool.name).sort()).toEqual(["capture", "command", "look", "query"]);
  });

  test("commands need explicit ids and exact values", () => {
    expect(validateCommandInput({ kind: "placement.set" })).toMatch(/fixtureIds/);
    expect(
      validateCommandInput({ kind: "placement.set", fixtureIds: [102], placements: {} }),
    ).toMatch(/102/);
    expect(
      validateCommandInput({
        kind: "placement.set",
        fixtureIds: [102],
        placements: { 102: { position: [1, 0, 0], rotation: [0, 180, 0] } },
      }),
    ).toBeNull();
    expect(validateCommandInput({ kind: "rotate", fixtureIds: [102], delta: [0, 180, 0] })).toMatch(
      /pivot/,
    );
    expect(
      validateCommandInput({
        kind: "rotate",
        fixtureIds: [102, 104],
        delta: [0, 180, 0],
        pivot: { mode: "own" },
      }),
    ).toBeNull();
    expect(validateCommandInput({ kind: "move" })).toMatch(/unknown command kind/);
  });

  test("queries accept view moves that mutate nothing", () => {
    expect(validateQueryInput({ name: "rig.list" })).toBeNull();
    expect(validateQueryInput({ name: "select", ids: [101] })).toBeNull();
    expect(validateQueryInput({ name: "hold", on: true })).toBeNull();
    expect(validateQueryInput({ name: "undo" })).toBeNull();
    expect(validateQueryInput({ name: "fixture.get" })).toMatch(/integer id/);
    expect(validateQueryInput({ name: "camera.set", view: {} })).toMatch(/exact position/);
    expect(validateQueryInput({ name: "wipe" })).toMatch(/unknown query/);
  });

  test("captures bound maxEdge and quality", () => {
    expect(validateCaptureInput({})).toEqual({ maxEdge: 1280, quality: 0.8 });
    const overEdge = validateCaptureInput({ maxEdge: 1 });
    expect("error" in overEdge ? overEdge.error : "").toContain("maxEdge");
    const overQuality = validateCaptureInput({ quality: 2 });
    expect("error" in overQuality ? overQuality.error : "").toContain("quality");
  });

  test("looks carry slot values or clear", () => {
    expect(validateLookInput({ clear: true })).toBeNull();
    expect(validateLookInput({ feed: "live" })).toBeNull();
    expect(validateLookInput({ slots: { 2: [255, 0, 128] } })).toBeNull();
    expect(validateLookInput({ slots: { 2: [300] } })).toMatch(/0-255/);
    expect(validateLookInput({})).toMatch(/slots or clear/);
  });
});

describe("capture store", () => {
  const entry = (size: number) => ({
    bytes: new Uint8Array(size),
    feed: "generated",
    width: 640,
    height: 400,
    downscaled: true,
  });

  test("single-fetch handles expire", () => {
    const store = createCaptureStore();
    expect(store.put("a", entry(10))).toEqual({ ok: true });
    expect(store.take("a")?.feed).toBe("generated");
    expect(store.take("a")).toBeUndefined();
    expect(store.take("missing")).toBeUndefined();
  });

  test("over-cap is an error naming the size", () => {
    const store = createCaptureStore();
    const result = store.put("big", entry(MAX_CAPTURE_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_CAPTURE_BYTES + 1));
    expect(store.has("big")).toBe(false);
  });

  test("the store holds one small buffer, not a gallery", () => {
    const store = createCaptureStore(100);
    expect(store.put("a", entry(60))).toEqual({ ok: true });
    const full = store.put("b", entry(50));
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.error).toContain("holding 60 of 100 bytes");
    expect(store.take("a")?.width).toBe(640);
    expect(store.put("b", entry(50))).toEqual({ ok: true });
  });

  test("capture headers are validated before a byte is stored", () => {
    const headers = { feed: "generated", width: "640", height: "400", downscaled: "true" };
    expect(validateCaptureUpload(headers)).toEqual({
      feed: "generated",
      width: 640,
      height: 400,
      downscaled: true,
    });
    const defaulted = validateCaptureUpload({ ...headers, feed: null });
    expect("error" in defaulted ? "" : defaulted.feed).toBe("unknown");
    const badWidth = validateCaptureUpload({ ...headers, width: "wide" });
    expect("error" in badWidth ? badWidth.error : "").toContain("integers");
    const missingHeight = validateCaptureUpload({ ...headers, height: null });
    expect("error" in missingHeight ? missingHeight.error : "").toContain("x-capture-height");
    const badDownscaled = validateCaptureUpload({ ...headers, downscaled: "yes" });
    expect("error" in badDownscaled ? badDownscaled.error : "").toContain("downscaled");
  });
});

describe("generated feed", () => {
  test("holds one settable frame above the resolution seam", () => {
    const feed = new GeneratedFeed();
    expect(feed.hasFrame()).toBe(false);
    feed.setFrame({ 2: [1, 2, 3] });
    expect(feed.hasFrame()).toBe(true);
    expect(feed.frame().get(2)).toEqual(Uint8Array.from([1, 2, 3]));
    feed.clear();
    expect(feed.hasFrame()).toBe(false);
  });

  test("rejects bad universes and oversized frames", () => {
    const feed = new GeneratedFeed();
    expect(() => feed.setFrame({ 0: [1] })).toThrow(/invalid universe/);
    expect(() => feed.setFrame({ 2: [] })).toThrow(/1 to 512/);
  });

  test("rejects non-integer and out-of-range slots instead of wrapping them", () => {
    const feed = new GeneratedFeed();
    expect(() => feed.setFrame({ 2: [1.5] })).toThrow(/integer slot values 0-255/);
    expect(() => feed.setFrame({ 2: [300] })).toThrow(/integer slot values 0-255/);
    expect(() => feed.setFrame({ 2: [-1] })).toThrow(/integer slot values 0-255/);
    expect(feed.hasFrame()).toBe(false);
  });
});

describe("mcp stdio framing", () => {
  test("handshakes and lists tools", async () => {
    const initialized = await handleJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      ctx,
    );
    expect((initialized?.result as { capabilities: object }).capabilities).toEqual({ tools: {} });
    const listed = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx);
    expect((listed?.result as { tools: unknown[] }).tools.length).toBe(4);
  });

  test("notifications answer nothing; unknown tools and methods error", async () => {
    expect(
      await handleJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx),
    ).toBeNull();
    const unknownTool = await handleJsonRpc(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "wipe", arguments: {} } },
      ctx,
    );
    expect((unknownTool?.error as { code: number }).code).toBe(-32601);
    const unknownMethod = await handleJsonRpc({ jsonrpc: "2.0", id: 4, method: "bogus" }, ctx);
    expect((unknownMethod?.error as { code: number }).code).toBe(-32601);
    const failing = await handleJsonRpc(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "query", arguments: {} } },
      {
        callTool(): Promise<{ content: unknown[] }> {
          throw new Error("no owning page connected");
        },
      },
    );
    expect((failing?.error as { message: string }).message).toContain("no owning page");
  });

  test("tools/call reaches the bridge client", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "query", arguments: { name: "history" } },
      },
      ctx,
    );
    const content = (response?.result as { content: { text: string }[] }).content;
    expect(content[0]?.text).toContain("history");
  });
});
