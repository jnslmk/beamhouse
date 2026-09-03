import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createSocket } from "node:dgram";
import { resolve } from "node:path";
import { Packet } from "sacn";
import { chromium, type Browser, type Page } from "playwright";

const repository = resolve(import.meta.dir, "..");
const auditPath = resolve(repository, ".codex-tmp/udp-send-audit.log");

let bridge: Bun.Subprocess;
let browser: Browser;
let page: Page;
let httpPort: number;
let sacnPort: number;
let artnetPort: number;

describe("running Beamhouse", () => {
  beforeAll(async () => {
    rmSync(auditPath, { force: true });
    browser = await chromium.launch({
      executablePath:
        process.env.CHROMIUM_PATH ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : chromium.executablePath()),
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
    });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  });

  afterAll(async () => {
    await browser?.close();
    bridge?.kill("SIGTERM");
    await bridge?.exited;
  });

  test("renders the reference patch within two seconds", async () => {
    rmSync(resolve(repository, "app/dist"), { recursive: true, force: true });
    const build = Bun.spawnSync(["bun", "run", "build"], {
      cwd: repository,
      stdout: "ignore",
      stderr: "pipe",
    });
    if (!build.success) throw new Error(build.stderr.toString());
    httpPort = await freeTcpPort();
    sacnPort = await freeUdpPort();
    artnetPort = await freeUdpPort();
    const startedAt = performance.now();
    bridge = Bun.spawn(["bun", "run", "start"], {
      cwd: repository,
      env: {
        ...process.env,
        BUN_OPTIONS: `--preload=${resolve(repository, "tests/udp-send-audit.ts")}`,
        BEAMHOUSE_HOST: "127.0.0.1",
        BEAMHOUSE_PORT: String(httpPort),
        BEAMHOUSE_SACN_PORT: String(sacnPort),
        BEAMHOUSE_ARTNET_PORT: String(artnetPort),
        BEAMHOUSE_SACN_STALE_MS: "250",
        BEAMHOUSE_ARTNET_STALE_MS: "400",
        BEAMHOUSE_UDP_AUDIT: auditPath,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    await waitUntilReachable(`http://127.0.0.1:${httpPort}`);
    await page.goto(`http://127.0.0.1:${httpPort}`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator('html[data-ready="true"]').waitFor({ timeout: 2_000 });

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    await expectCount(page.locator("#viewport canvas"), 1);
    await expectCount(page.locator("[data-fixture]"), 3);
    await page.locator('[data-status="live"]').waitFor();
  });

  test("delivers concurrent real protocols without arbitration or DMX output", async () => {
    await sendUdp(artDmx(1, [20, 40, 60, 0]), artnetPort);
    await levelsBecome([20, 40, 60]);

    await sendUdp(sacn(10, [201, 202, 203], 0x80), sacnPort);
    await levelsBecome([201, 202, 203]);

    await page.locator('[data-contention="true"]').waitFor();
    await expectCount(page.locator("[data-source]"), 2);
    expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("Mizer");
    expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("123");
    expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("preview");
    expect(await page.locator('[data-source^="artnet:"]').innerText()).toContain("— unavailable");

    // A reordered packet is diagnosed and never becomes the browser's latest complete frame.
    await sendUdp(sacn(9, [1, 1, 1]), sacnPort);
    await page.locator('[data-source^="sacn:"]', { hasText: "1 dropped" }).waitFor();
    expect(await currentLevels()).toEqual([201, 202, 203]);

    // Art-Net wins only because it arrived last, despite the observed sACN priority.
    await sendUdp(artDmx(2, [31, 32, 33, 0]), artnetPort);
    await levelsBecome([31, 32, 33]);

    await page.locator('.universe-health[data-stale="true"]').waitFor({ timeout: 2_000 });
    await page.locator(".health-heading", { hasText: "all stale" }).waitFor({ timeout: 2_000 });
    await expectCount(page.locator('.fixture-mark[data-visible="true"]'), 3);
    expect(await page.locator('[data-fixture-mark="1"]').textContent()).toBe("disputed · old");

    await sendUdp(sacn(11, [0, 0, 0], 0x40), sacnPort);
    await page.locator("[data-termination]", { hasText: "Mizer" }).waitFor();
    await expectCount(page.locator("[data-source]"), 1);
    await expectCount(page.locator('[data-source^="sacn:"]'), 0);
    await expectCount(page.locator('[data-source^="artnet:"]'), 1);
    expect(await page.locator("#universe-status").getAttribute("data-contention")).toBe("false");

    expect(existsSync(auditPath) ? readFileSync(auditPath, "utf8") : "").toBe("");
    expect(await page.locator(".chip.passive").innerText()).toContain("none · passive");
  });
});

async function levelsBecome(expected: number[]): Promise<void> {
  await page.waitForFunction(
    (levels) =>
      [...document.querySelectorAll<HTMLElement>("[data-fixture]")]
        .map((row) => Number(row.dataset.level))
        .join(",") === levels.join(","),
    expected,
  );
}

async function currentLevels(): Promise<number[]> {
  return page
    .locator("[data-fixture]")
    .evaluateAll((rows) => rows.map((row) => Number((row as HTMLElement).dataset.level)));
}

async function expectCount(locator: ReturnType<Page["locator"]>, count: number): Promise<void> {
  await locator.first().waitFor({ state: count > 0 ? "visible" : "detached" });
  expect(await locator.count()).toBe(count);
}

function sacn(sequence: number, values: number[], options = 0): Uint8Array {
  const payload = Object.fromEntries(values.map((value, index) => [index + 1, value]));
  const packet = new Packet({
    universe: 1,
    sequence,
    sourceName: "Mizer",
    priority: 123,
    cid: Buffer.from("00112233445566778899aabbccddeeff", "hex"),
    payload,
    useRawDmxValues: true,
  }).buffer;
  packet[112] = options;
  return packet;
}

function artDmx(sequence: number, values: number[]): Uint8Array {
  const packet = new Uint8Array(18 + values.length);
  packet.set(new TextEncoder().encode("Art-Net\0"));
  packet[8] = 0x00;
  packet[9] = 0x50;
  packet[11] = 14;
  packet[12] = sequence;
  packet[16] = values.length >> 8;
  packet[17] = values.length & 0xff;
  packet.set(values, 18);
  return packet;
}

async function sendUdp(bytes: Uint8Array, port: number): Promise<void> {
  const socket = createSocket("udp4");
  await new Promise<void>((done, reject) => {
    socket.send(bytes, port, "127.0.0.1", (error) => {
      socket.close();
      if (error) reject(error);
      else done();
    });
  });
}

async function freeTcpPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve TCP port");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

async function freeUdpPort(): Promise<number> {
  const socket = createSocket("udp4");
  await new Promise<void>((done) => socket.bind(0, "127.0.0.1", done));
  const address = socket.address();
  await new Promise<void>((done) => socket.close(() => done()));
  return address.port;
}

async function waitUntilReachable(url: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (bridge.exitCode !== null) {
      throw new Error(`bridge exited early with ${bridge.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The bridge is still binding.
    }
    await Bun.sleep(25);
  }
  throw new Error("bridge did not start");
}
