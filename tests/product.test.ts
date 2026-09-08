import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createSocket } from "node:dgram";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Packet } from "sacn";
import { encodeShareSnapshot } from "../app/src/share.ts";
import { Recording } from "../app/src/record.ts";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const repository = resolve(import.meta.dir, "..");
const auditPath = resolve(repository, ".codex-tmp/udp-send-audit.log");

// ponytail: swiftshader runs ~8-10fps on a loaded box; one generous budget for
// every browser test so multi-second actionability waits fail alone, never cascade.
const BROWSER_TEST_TIMEOUT = 120_000;
const BROWSER_HEAVY_TIMEOUT = 180_000;
let bridge: Bun.Subprocess;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let httpPort = 0;
let sacnPort = 0;
let artnetPort = 0;

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
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  });

  // Fresh page per test on the shared context: origin storage (localStorage,
  // IndexedDB) carries over, but leftover dialogs, overlays, and half-finished
  // navigation die with the page instead of cascading into later tests.
  beforeEach(async () => {
    page = await context.newPage();
    if (httpPort !== 0) {
      await page.goto(`http://127.0.0.1:${httpPort}`, {
        waitUntil: "domcontentloaded",
      });
      // Boot the app before any test step: hooks, socket, and first render.
      await page.locator('html[data-ready="true"]').waitFor({ timeout: BROWSER_TEST_TIMEOUT });
      // The old socket's close races the fresh join, so the new page can land
      // as follower while the bridge still names the dead owner; owner-only
      // writes would then silently drop. Promote it instead.
      const ownership = page.locator("#ownership-status");
      await page.waitForFunction(
        () => document.querySelector("#ownership-status")?.textContent !== "claiming",
        null,
        { timeout: BROWSER_TEST_TIMEOUT },
      );
      for (let attempt = 0; (await ownership.textContent()) !== "owner"; attempt += 1) {
        if (attempt >= 6) throw new Error("fresh page could not take ownership");
        page.once("dialog", (dialog) => void dialog.accept());
        await page.locator("[data-takeover]").click();
        await page
          .waitForFunction(
            () => document.querySelector("#ownership-status")?.textContent === "owner",
            null,
            { timeout: 20_000 },
          )
          .catch(() => undefined);
      }
    }
  });

  afterEach(async () => {
    await page?.close();
  });

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    bridge?.kill("SIGTERM");
    await bridge?.exited;
  });

  test(
    "renders the reference patch within five seconds",
    async () => {
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
      await page.locator('html[data-ready="true"]').waitFor({ timeout: 5_000 });

      expect(performance.now() - startedAt).toBeLessThan(5_000);
      expect(await page.locator("[data-overlay]").isHidden()).toBe(true);
      await expectCount(page.locator("#viewport canvas"), 1);
      await openFixtures();
      await expectCount(page.locator("[data-fixture]"), 3);
      await page.locator('[data-status="live"]').waitFor();
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "delivers concurrent real protocols without arbitration or DMX output",
    async () => {
      await openUniverses();
      // A graceful release keeps the last rendered frame visibly marked as old.
      await sendUdp(sacn(1, [9, 8, 7]), sacnPort);
      await levelsBecome([9, 8, 7]);
      await sendUdp(sacn(2, [9, 8, 7], 0x40), sacnPort);
      await expectCount(page.locator("[data-source]"), 0);
      await page.locator("[data-termination]", { hasText: "Mizer" }).last().waitFor();
      expect(await page.locator('[data-fixture-mark="1"]').textContent()).toBe("old");

      await sendUdp(artDmx(1, [20, 40, 60, 0]), artnetPort);
      await levelsBecome([20, 40, 60]);

      await sendUdp(sacn(10, [201, 202, 203], 0x80), sacnPort);
      await levelsBecome([201, 202, 203]);

      await page.locator('[data-contention="true"]').waitFor();
      await expectCount(page.locator("[data-source]"), 2);
      expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("Mizer");
      expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("123");
      expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("preview");
      expect(await page.locator('[data-source^="sacn:"]').innerText()).toContain("Hz");
      expect(await page.locator('[data-source^="artnet:"]').innerText()).toContain("— unavailable");

      // A reordered packet is diagnosed and never becomes the browser's latest complete frame.
      await sendUdp(sacn(9, [1, 1, 1]), sacnPort);
      await page.locator('[data-source^="sacn:"]', { hasText: "1 dropped" }).waitFor();
      expect(await currentLevels()).toEqual([201, 202, 203]);

      // Art-Net wins only because it arrived last, despite the observed sACN priority.
      await sendUdp(artDmx(2, [31, 32, 33, 0]), artnetPort);
      await levelsBecome([31, 32, 33]);

      await page.locator('.universe-health[data-stale="true"]').waitFor({ timeout: 30_000 });
      await page.locator(".health-heading", { hasText: "all stale" }).waitFor({ timeout: 30_000 });
      await expectCount(page.locator('.fixture-mark[data-visible="true"]'), 3);
      expect(await page.locator('[data-fixture-mark="1"]').textContent()).toBe("disputed · old");

      await sendUdp(sacn(11, [0, 0, 0], 0x40), sacnPort);
      await page.locator("[data-termination]", { hasText: "Mizer" }).last().waitFor();
      await expectCount(page.locator("[data-source]"), 1);
      await expectCount(page.locator('[data-source^="sacn:"]'), 0);
      await expectCount(page.locator('[data-source^="artnet:"]'), 1);

      expect(await page.locator("#universe-status").getAttribute("data-contention")).toBe("false");

      expect(existsSync(auditPath) ? readFileSync(auditPath, "utf8") : "").toBe("");
      expect(await page.locator('[data-chip-tab="universes"]').count()).toBe(2);
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "renders the reference STAR-TENT pixel ramp from normal UDP universe frames",
    async () => {
      await openFixtures();
      const universeTwo = new Uint8Array(512);
      const universeThree = new Uint8Array(512);
      for (let pixel = 0; pixel < 230; pixel += 1) {
        const slots = pixel < 161 ? universeTwo : universeThree;
        const slot = pixel < 161 ? 29 + pixel * 3 : (pixel - 161) * 3;
        slots.set([pixel, 255 - pixel, (pixel % 23) * 11], slot);
      }

      for (let sequence = 12; sequence < 42; sequence += 1) {
        await sendUdp(sacn(sequence, [...universeTwo], 0, 2), sacnPort);
        await sendUdp(sacn(sequence, [...universeThree], 0, 3), sacnPort);
        await Bun.sleep(1_000 / 30);
      }

      const readback = page.locator("[data-strip-readback]");
      await readback.waitFor();
      await expectCount(page.locator("[data-texture-strip]"), 10);
      await page.locator('[data-strip-readback="0,255,0|229,26,242"]').waitFor();
      const start = await page.locator('[data-strip-probe="101-start"]').boundingBox();
      const end = await page.locator('[data-strip-probe="101-end"]').boundingBox();
      const canvas = await page.locator("#viewport canvas").boundingBox();
      if (!start || !end || !canvas) throw new Error("missing rendered strip probes");
      const visual = await canvasColorSamples(
        page,
        { x: start.x - canvas.x, y: start.y - canvas.y },
        { x: end.x - canvas.x, y: end.y - canvas.y },
      );
      expect(visual.coloredPixels).toBeGreaterThan(500);
      expect(visual.inner.bestGreen).toBeGreaterThan(20);
      expect(visual.outer.bestBlue).toBeGreaterThan(20);
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "edits fixture placement through one persistent undo history while the live feed continues",
    async () => {
      await expectCount(page.locator("[data-chip-tab]"), 8);
      await openFixtures();
      await sendUdp(sacn(43, [71, 72, 73]), sacnPort);
      await levelsBecome([71, 72, 73]);

      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-placement-field="x"]').fill("2.4");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-placement-x="2.4"]').waitFor();
      expect(await page.locator("[data-history-count]").textContent()).toBe("1");

      await page.locator("[data-undo]").click();
      await page.locator('[data-placement-x="-2"]').waitFor();
      expect(await page.locator("[data-history-count]").textContent()).toBe("1");
      await page.locator("[data-redo]").click();
      await page.locator('[data-placement-x="2.4"]').waitFor();
      await page.locator('[data-placement-field="x"]').fill("2.4");
      await page.locator('[data-placement-field="x"]').press("Enter");
      expect(await page.locator("[data-history-count]").textContent()).toBe("1");

      await page.locator("[data-camera-view-name]").fill("operator");
      await page.locator("[data-camera-save]").click();
      await page.locator('[data-camera-view="operator"]').waitFor();
      expect(await page.locator("[data-history-count]").textContent()).toBe("2");

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('html[data-ready="true"]').waitFor();
      await openFixtures();
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-placement-x="2.4"]').waitFor();
      await page.locator('[data-camera-view="operator"]').waitFor();

      await page.locator('[data-editable-fixture="101"]').click();
      await page.locator('[data-placement-field="x"]').fill("1.75");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-placement-x="1.75"]').waitFor();
      expect(await page.locator("[data-history-count]").textContent()).toBe("1");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('html[data-ready="true"]').waitFor();
      await openFixtures();
      await page.locator('[data-editable-fixture="101"]').click();
      await page.locator('[data-placement-x="1.75"]').waitFor();

      await sendUdp(sacn(44, [81, 82, 83]), sacnPort);
      await levelsBecome([81, 82, 83]);
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "propagates every owner placement while keeping follower controls read-only",
    async () => {
      const follower = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      try {
        await follower.goto(`http://127.0.0.1:${httpPort}`, { waitUntil: "domcontentloaded" });
        await follower.locator('html[data-ready="true"]').waitFor();
        await openFixturesOn(follower);
        await follower.locator("#ownership-status", { hasText: "follower · page" }).waitFor();

        await openFixtures();
        await page.locator('[data-fixture="1"]').click();
        await page.locator('[data-placement-field="x"]').fill("3.1");
        await page.locator('[data-placement-field="x"]').press("Enter");
        await page.locator('[data-placement-x="3.1"]').waitFor();
        await follower.locator('[data-fixture="1"]').click();
        await follower.locator('[data-placement-x="3.1"]').waitFor();
        expect(
          await follower.locator("[data-placement-controls]").getAttribute("data-readonly"),
        ).toBe("true");
        for (const control of await follower
          .locator(
            "[data-placement-controls] input, [data-placement-controls] select, [data-placement-controls] button, [data-camera-mutation]",
          )
          .all())
          expect(await control.isDisabled()).toBe(true);
        expect(
          await follower.locator("[data-placement-controls]").getAttribute("data-placement-x"),
        ).toBe("3.1");

        await page.locator('[data-fixture="2"]').click();
        await page.locator('[data-placement-field="x"]').fill("5.5");
        await page.locator('[data-placement-field="x"]').press("Enter");
        await follower
          .locator('[data-fixture-mark="2"][data-rendered-placement-x="5.5"]')
          .waitFor();
        expect(await follower.locator("#selection-status").textContent()).toBe("1");
        expect(
          await follower.locator("[data-placement-controls]").getAttribute("data-placement-x"),
        ).toBe("3.1");
      } finally {
        await follower.close();
      }
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "adopts an acknowledged current snapshot before completing takeover",
    async () => {
      let candidateContext: BrowserContext | null = null;
      let candidate: Page | null = null;
      try {
        await openFixtures();
        // The placement readout only exists for a selected fixture; the shared
        // page used to inherit this selection from the previous test.
        await page.locator('[data-fixture="2"]').click();
        await page.evaluate(() => {
          const originalSend = Reflect.get(WebSocket.prototype, "send");
          const queued: Array<{ socket: WebSocket; data: string }> = [];
          const control = {
            queued,
            releaseTakeoverSnapshot() {
              const index = queued.findIndex(({ data }) => {
                const value = JSON.parse(data) as { op?: unknown; requestId?: unknown };
                return value.op === "control.snapshot" && typeof value.requestId === "number";
              });
              const message = queued.splice(index, 1)[0];
              if (!message) throw new Error("missing queued takeover snapshot");
              originalSend.call(message.socket, message.data);
            },
            restore() {
              WebSocket.prototype.send = originalSend;
            },
          };
          (
            window as typeof window & { beamhouseSnapshotBlock?: typeof control }
          ).beamhouseSnapshotBlock = control;
          WebSocket.prototype.send = function (data) {
            if (typeof data === "string") {
              const value = JSON.parse(data) as { op?: unknown };
              if (value.op === "control.snapshot") {
                queued.push({ socket: this, data });
                return;
              }
            }
            originalSend.call(this, data);
          };
        });

        candidateContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const seed = await candidateContext.newPage();
        await seed.goto(`http://127.0.0.1:${httpPort}`, { waitUntil: "domcontentloaded" });
        await seed.locator('html[data-ready="true"]').waitFor();
        await writeWorkingPlacement(seed, 2, 9);
        await seed.close();
        candidate = await candidateContext.newPage();
        await candidate.goto(`http://127.0.0.1:${httpPort}`, { waitUntil: "domcontentloaded" });
        await candidate.locator('html[data-ready="true"]').waitFor();
        await openFixturesOn(candidate);
        await candidate.locator("#ownership-status", { hasText: "follower · page" }).waitFor();
        await candidate.locator('[data-fixture="2"]').click();
        await candidate.locator('[data-placement-x="9"]').waitFor();
        expect(await workingPlacementX(candidate, 2)).toBe(9);

        await candidate.evaluate(() => {
          const originalSend = Reflect.get(WebSocket.prototype, "send");
          const queued: Array<{ socket: WebSocket; data: string }> = [];
          const control = {
            queued,
            releaseAcknowledgement() {
              const message = queued.shift();
              if (!message) throw new Error("missing queued snapshot acknowledgement");
              originalSend.call(message.socket, message.data);
            },
            restore() {
              WebSocket.prototype.send = originalSend;
            },
          };
          (
            window as typeof window & {
              beamhouseAcknowledgementBlock?: typeof control;
            }
          ).beamhouseAcknowledgementBlock = control;
          WebSocket.prototype.send = function (data) {
            if (typeof data === "string") {
              const value = JSON.parse(data) as { op?: unknown };
              if (value.op === "control.snapshot.ack") {
                queued.push({ socket: this, data });
                return;
              }
            }
            originalSend.call(this, data);
          };
        });

        candidate.once("dialog", (dialog) => void dialog.accept());
        await candidate.locator("[data-takeover]").click();
        await page.waitForFunction(() => {
          const block = (
            window as typeof window & {
              beamhouseSnapshotBlock?: { queued: Array<{ data: string }> };
            }
          ).beamhouseSnapshotBlock;
          return block?.queued.some(({ data }) => {
            const value = JSON.parse(data) as { requestId?: unknown };
            return typeof value.requestId === "number";
          });
        });
        expect(await candidate.locator("#ownership-status").textContent()).toContain("follower");
        expect(
          await candidate.locator("[data-placement-controls]").getAttribute("data-placement-x"),
        ).toBe("9");

        await page.evaluate(() => {
          const block = (
            window as typeof window & {
              beamhouseSnapshotBlock?: { releaseTakeoverSnapshot(): void };
            }
          ).beamhouseSnapshotBlock;
          if (!block) throw new Error("missing snapshot blocker");
          block.releaseTakeoverSnapshot();
        });
        await candidate.locator('[data-placement-x="5.5"]').waitFor();
        expect(await workingPlacementX(candidate, 2)).toBe(9);
        await candidate.waitForFunction(
          () =>
            (
              window as typeof window & {
                beamhouseAcknowledgementBlock?: { queued: unknown[] };
              }
            ).beamhouseAcknowledgementBlock?.queued.length === 1,
        );
        expect(await candidate.locator("#ownership-status").textContent()).toContain("follower");
        expect(await candidate.locator('[data-placement-field="x"]').isDisabled()).toBe(true);
        expect(await candidate.locator("[data-history-count]").textContent()).toBe("0");

        await candidate.evaluate(() => {
          const block = (
            window as typeof window & {
              beamhouseAcknowledgementBlock?: { releaseAcknowledgement(): void };
            }
          ).beamhouseAcknowledgementBlock;
          if (!block) throw new Error("missing acknowledgement blocker");
          block.releaseAcknowledgement();
        });
        await candidate.locator("#ownership-status", { hasText: "owner" }).waitFor();
        expect(await candidate.locator('[data-placement-field="x"]').isDisabled()).toBe(false);

        await candidate.locator('[data-placement-field="x"]').fill("6");
        await candidate.locator('[data-placement-field="x"]').press("Enter");
        await page.locator('[data-placement-x="6"]').waitFor();
        expect(await candidate.locator("[data-history-count]").textContent()).toBe("1");
        expect(await page.locator("[data-history-count]").textContent()).toBe("0");
        expect(await workingPlacementX(candidate, 2)).toBe(6);
        expect(await workingPlacementX(page, 2)).toBe(5.5);
        await candidate.locator("[data-undo]").click();
        await page.locator('[data-placement-x="5.5"]').waitFor();
        await page.evaluate(() => {
          (
            window as typeof window & {
              beamhouseSnapshotBlock?: { restore(): void };
            }
          ).beamhouseSnapshotBlock?.restore();
        });
        await candidate.evaluate(() => {
          (
            window as typeof window & {
              beamhouseAcknowledgementBlock?: { restore(): void };
            }
          ).beamhouseAcknowledgementBlock?.restore();
        });
        await candidate.close();
        await page.locator("#ownership-status", { hasText: "unowned" }).waitFor();
        page.once("dialog", (dialog) => void dialog.accept());
        await page.locator("[data-takeover]").click();
        await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      } finally {
        try {
          await page.evaluate(() => {
            const target = window as typeof window & {
              beamhouseSnapshotBlock?: { restore(): void };
            };
            target.beamhouseSnapshotBlock?.restore();
            delete target.beamhouseSnapshotBlock;
          });
        } finally {
          try {
            if (candidate && !candidate.isClosed())
              await candidate.evaluate(() => {
                const target = window as typeof window & {
                  beamhouseAcknowledgementBlock?: { restore(): void };
                };
                target.beamhouseAcknowledgementBlock?.restore();
                delete target.beamhouseAcknowledgementBlock;
              });
          } finally {
            await candidateContext?.close();
          }
        }
      }
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "fails closed after a page wake until an explicit takeover",
    async () => {
      await openFixtures();
      await page.locator('[data-fixture="2"]').click();
      const persisted = await workingPlacementX(page, 2);
      await sendUdp(sacn(45, [91, 92, 93]), sacnPort);
      await levelsBecome([91, 92, 93]);

      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
      );
      await page.locator("#ownership-status", { hasText: "unowned" }).waitFor();
      expect(await page.locator('[data-placement-field="x"]').isDisabled()).toBe(true);
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('[data-placement-field="x"]');
        if (!input) throw new Error("missing placement field");
        input.value = "99";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(await workingPlacementX(page, 2)).toBe(persisted);

      const firstWake = page.waitForEvent("websocket");
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
      );
      await (
        await firstWake
      ).waitForEvent("framesent", {
        predicate: (frame) =>
          typeof frame.payload === "string" && frame.payload.includes("control.join"),
      });
      await page.locator("#ownership-status", { hasText: "unowned" }).waitFor();
      expect(await page.locator('[data-placement-field="x"]').isDisabled()).toBe(true);
      page.once("dialog", (dialog) => void dialog.accept());
      await page.locator("[data-takeover]").click();
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      await sendUdp(sacn(46, [94, 95, 96]), sacnPort);
      await levelsBecome([94, 95, 96]);

      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
      );
      await page.locator("#ownership-status", { hasText: "unowned" }).waitFor();
      expect(await page.locator('[data-placement-field="x"]').isDisabled()).toBe(true);
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('[data-placement-field="x"]');
        if (!input) throw new Error("missing placement field");
        input.value = "98";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(await workingPlacementX(page, 2)).toBe(persisted);

      const secondWake = page.waitForEvent("websocket");
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
      );
      await (
        await secondWake
      ).waitForEvent("framesent", {
        predicate: (frame) =>
          typeof frame.payload === "string" && frame.payload.includes("control.join"),
      });
      await page.locator("#ownership-status", { hasText: "unowned" }).waitFor();
      expect(await page.locator('[data-placement-field="x"]').isDisabled()).toBe(true);
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('[data-placement-field="x"]');
        if (!input) throw new Error("missing placement field");
        input.value = "97";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(await workingPlacementX(page, 2)).toBe(persisted);
      page.once("dialog", (dialog) => void dialog.accept());
      await page.locator("[data-takeover]").click();
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      await sendUdp(sacn(47, [97, 98, 99]), sacnPort);
      await levelsBecome([97, 98, 99]);
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "aligns and distributes a multi-selection as one undo entry per operation",
    async () => {
      page.once("dialog", (dialog) => void dialog.accept());
      await page.locator("[data-takeover]").click();
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      await openFixtures();
      for (const [fixture, x] of [
        [1, "1"],
        [2, "2"],
        [3, "9"],
      ] as const) {
        await page.locator(`[data-fixture="${fixture}"]`).click();
        await page.locator('[data-placement-field="x"]').fill(x);
        await page.locator('[data-placement-field="x"]').press("Enter");
        await page
          .locator(`[data-fixture-mark="${fixture}"][data-rendered-placement-x="${x}"]`)
          .waitFor();
      }
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator('[data-fixture="3"]').click({ modifiers: ["Shift"] });
      expect(await page.locator("[data-arrange]").getAttribute("data-selection-ids")).toBe("1,2,3");
      const before = Number(await page.locator("[data-history-count]").textContent());
      await page.locator('[data-distribute="x"]').click();
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="5"]').waitFor();
      expect(Number(await page.locator("[data-history-count]").textContent())).toBe(before + 1);
      await page.locator("[data-undo]").click();
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="2"]').waitFor();
      await page.locator("[data-redo]").click();
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="5"]').waitFor();
      await page.locator('[data-align="x"]').click();
      await page.locator('[data-fixture-mark="1"][data-rendered-placement-x="5"]').waitFor();
      await page.locator('[data-fixture-mark="3"][data-rendered-placement-x="5"]').waitFor();
      expect(Number(await page.locator("[data-history-count]").textContent())).toBe(before + 2);
      await page.locator("[data-undo]").click();
      await page.locator('[data-fixture-mark="1"][data-rendered-placement-x="1"]').waitFor();
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "keeps line and grid arrays live, persistent, and override-durable",
    async () => {
      await openFixtures();
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator('[data-fixture="3"]').click({ modifiers: ["Shift"] });
      await page.locator("[data-revert]").click();
      await page.locator('[data-fixture-mark="1"][data-rendered-placement-x="-2"]').waitFor();
      await page.locator("[data-array-id]").fill("house-line");
      await page.locator("[data-array-kind]").selectOption("line");
      await page.locator("[data-array-members]").fill("1,2,3");
      await page.locator('[data-array="spacingX"]').fill("2");
      await page.locator("[data-array-save]").click();
      await page.locator("[data-array-status]", { hasText: "house-line · 3 members" }).waitFor();
      await page.locator('[data-fixture-mark="3"][data-rendered-placement-x="4"]').waitFor();
      await page.locator('[data-array="spacingX"]').fill("3");
      await page.locator("[data-array-save]").click();
      await page.locator('[data-fixture-mark="3"][data-rendered-placement-x="6"]').waitFor();
      await page.locator('[data-fixture="2"]').click();
      await page.locator('[data-placement-field="x"]').fill("10");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="10"]').waitFor();
      await page.locator('[data-array="spacingX"]').fill("4");
      await page.locator("[data-array-save]").click();
      await page.locator('[data-fixture-mark="3"][data-rendered-placement-x="8"]').waitFor();
      expect(
        await page.locator('[data-fixture-mark="2"]').getAttribute("data-rendered-placement-x"),
      ).toBe("10");
      await page.locator("[data-array-kind]").selectOption("grid");
      await page.locator('[data-array="spacingX"]').fill("2");
      await page.locator('[data-array="spacingZ"]').fill("5");
      await page.locator('[data-array="columns"]').fill("2");
      await page.locator("[data-array-save]").click();
      await page.locator('[data-fixture-mark="3"][data-rendered-placement-z="5"]').waitFor();
      expect(
        await page.locator('[data-fixture-mark="1"]').getAttribute("data-rendered-placement-x"),
      ).toBe("0");
      expect(
        await page.locator('[data-fixture-mark="2"]').getAttribute("data-rendered-placement-x"),
      ).toBe("10");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('html[data-ready="true"]').waitFor();
      await openFixtures();
      await page.locator('[data-fixture-mark="3"][data-rendered-placement-z="5"]').waitFor();
      expect(
        await page.locator('[data-fixture-mark="2"]').getAttribute("data-rendered-placement-x"),
      ).toBe("10");
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "rotates about own, shared, and explicit pivots as rigid transforms",
    async () => {
      await openFixtures();
      for (const [fixture, x] of [
        [1, "-2"],
        [2, "2"],
      ] as const) {
        await page.locator(`[data-fixture="${fixture}"]`).click();
        await page.locator('[data-placement-field="x"]').fill(x);
        await page.locator('[data-placement-field="x"]').press("Enter");
        await page
          .locator(`[data-fixture-mark="${fixture}"][data-rendered-placement-x="${x}"]`)
          .waitFor();
      }
      const mark = (id: number) =>
        page.evaluate((fixtureId) => {
          const marker = document.querySelector(`[data-fixture-mark="${fixtureId}"]`);
          return {
            x: Number(marker?.getAttribute("data-rendered-placement-x")),
            z: Number(marker?.getAttribute("data-rendered-placement-z")),
            ry: Number(marker?.getAttribute("data-rendered-placement-ry")),
          };
        }, id);
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator('[data-rotate="ry"]').fill("90");
      await page.locator("[data-rotate-pivot]").selectOption("own");
      const beforeOwn = await mark(1);
      await page.locator("[data-rotate-apply]").click();
      await page.waitForFunction((previous) => {
        const marker = document.querySelector('[data-fixture-mark="1"]');
        return Math.abs(Number(marker?.getAttribute("data-rendered-placement-ry")) - previous) > 89;
      }, beforeOwn.ry);
      expect((await mark(1)).x).toBe(-2);
      expect((await mark(2)).x).toBe(2);
      await page.locator("[data-undo]").click();
      await page.waitForFunction((previous) => {
        const marker = document.querySelector('[data-fixture-mark="1"]');
        return Math.abs(Number(marker?.getAttribute("data-rendered-placement-ry")) - previous) < 1;
      }, beforeOwn.ry);
      await page.locator("[data-rotate-pivot]").selectOption("shared");
      await page.locator("[data-rotate-apply]").click();
      await page.waitForFunction(() => {
        const read = (id: number) =>
          Number(
            document
              .querySelector(`[data-fixture-mark="${id}"]`)
              ?.getAttribute("data-rendered-placement-x"),
          );
        return Math.abs(read(1)) < 1e-6 && Math.abs(read(2)) < 1e-6;
      });
      const shared = [await mark(1), await mark(2)];
      expect(Math.abs(shared[0]!.z)).toBeCloseTo(2, 3);
      expect(shared[0]!.z).toBeCloseTo(-shared[1]!.z, 3);
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator("[data-revert]").click();
      await page.locator('[data-fixture-mark="1"][data-rendered-placement-x="0"]').waitFor();
      for (const [fixture, x] of [
        [1, "-2"],
        [2, "2"],
      ] as const) {
        await page.locator(`[data-fixture="${fixture}"]`).click();
        await page.locator('[data-placement-field="x"]').fill(x);
        await page.locator('[data-placement-field="x"]').press("Enter");
        await page
          .locator(`[data-fixture-mark="${fixture}"][data-rendered-placement-x="${x}"]`)
          .waitFor();
      }
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator("[data-rotate-pivot]").selectOption("explicit");
      await page.locator('[data-pivot="x"]').fill("-2");
      await page.locator("[data-rotate-apply]").click();
      await page.waitForFunction(
        () => {
          const marker = document.querySelector('[data-fixture-mark="2"]');
          return Math.abs(Number(marker?.getAttribute("data-rendered-placement-x")) + 2) < 1e-6;
        },
        undefined,
        { polling: 100 },
      );
      expect((await mark(1)).x).toBeCloseTo(-2, 6);
      expect((await mark(2)).x).toBeCloseTo(-2, 6);
      expect(Math.abs((await mark(2)).z)).toBeCloseTo(4, 3);
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "arranges the ten STAR-TENT spokes radially with alternating 180-degree flips",
    async () => {
      await openFixtures();
      await page.locator('[data-editable-fixture="101"]').click();
      for (const id of [102, 103, 104, 105, 106, 107, 108, 109, 110]) {
        await page.locator(`[data-editable-fixture="${id}"]`).click({ modifiers: ["Shift"] });
      }
      await page.locator("[data-revert]").click();
      await page.locator('[data-strip-mark="101"][data-rendered-placement-x="0.75"]').waitFor();
      await page.locator("[data-array-id]").fill("spokes");
      await page.locator("[data-array-kind]").selectOption("radial");
      await page.locator("[data-array-members]").fill("101,102,103,104,105,106,107,108,109,110");
      await page.locator("[data-array-save]").click();
      await page.locator("[data-array-status]", { hasText: "spokes · 10 members" }).waitFor();
      const spokes = () =>
        page.evaluate(() =>
          [101, 102, 103, 104, 105, 106, 107, 108, 109, 110].map((id) => {
            const marker = document.querySelector(`[data-strip-mark="${id}"]`);
            return {
              x: Number(marker?.getAttribute("data-rendered-placement-x")),
              z: Number(marker?.getAttribute("data-rendered-placement-z")),
              ry: Number(marker?.getAttribute("data-rendered-placement-ry")),
            };
          }),
        );
      const initial = await spokes();
      for (const spoke of initial) {
        expect(Math.hypot(spoke.x, spoke.z)).toBeCloseTo(0.75, 2);
      }
      type Euler = { rx: number; ry: number; rz: number };
      type Matrix = [[number, number, number], [number, number, number], [number, number, number]];
      const orient = async (id: number): Promise<Euler> => {
        await page.locator(`[data-editable-fixture="${id}"]`).click();
        const read = async (field: string) => {
          const raw = await page.locator(`[data-placement-field="${field}"]`).inputValue();
          const value = Number(raw);
          return Number.isFinite(value) ? value : 0;
        };
        return { rx: await read("rx"), ry: await read("ry"), rz: await read("rz") };
      };
      const toMatrix = (euler: Euler): Matrix => {
        const radians = (degrees: number) => (degrees * Math.PI) / 180;
        const cx = Math.cos(radians(euler.rx));
        const sx = Math.sin(radians(euler.rx));
        const cy = Math.cos(radians(euler.ry));
        const sy = Math.sin(radians(euler.ry));
        const cz = Math.cos(radians(euler.rz));
        const sz = Math.sin(radians(euler.rz));
        return [
          [cy * cz, -cy * sz, sy],
          [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
          [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
        ];
      };
      const multiply = (left: Matrix, right: Matrix): Matrix => {
        const at = (row: 0 | 1 | 2, column: 0 | 1 | 2) =>
          left[row][0] * right[0][column] +
          left[row][1] * right[1][column] +
          left[row][2] * right[2][column];
        return [
          [at(0, 0), at(0, 1), at(0, 2)],
          [at(1, 0), at(1, 1), at(1, 2)],
          [at(2, 0), at(2, 1), at(2, 2)],
        ];
      };
      const matrixDiff = (left: Matrix, right: Matrix): number =>
        Math.max(
          Math.abs(left[0][0] - right[0][0]),
          Math.abs(left[0][1] - right[0][1]),
          Math.abs(left[0][2] - right[0][2]),
          Math.abs(left[1][0] - right[1][0]),
          Math.abs(left[1][1] - right[1][1]),
          Math.abs(left[1][2] - right[1][2]),
          Math.abs(left[2][0] - right[2][0]),
          Math.abs(left[2][1] - right[2][1]),
          Math.abs(left[2][2] - right[2][2]),
        );
      const spokeIds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const initialOrient: Euler[] = [];
      for (const id of spokeIds) initialOrient.push(await orient(id));
      await page.locator('[data-editable-fixture="102"]').click();
      for (const id of [104, 106, 108, 110]) {
        await page.locator(`[data-editable-fixture="${id}"]`).click({ modifiers: ["Shift"] });
      }
      expect(await page.locator("[data-arrange]").getAttribute("data-selection-ids")).toBe(
        "102,104,106,108,110",
      );
      await page.locator('[data-rotate="ry"]').fill("180");
      await page.locator("[data-rotate-pivot]").selectOption("own");
      await page.locator("[data-rotate-apply]").click();
      await page.waitForFunction(
        (previous) => {
          const marker = document.querySelector('[data-strip-mark="102"]');
          return (
            Math.abs(Number(marker?.getAttribute("data-rendered-placement-ry")) - previous) > 1
          );
        },
        initialOrient[1]!.ry,
        { polling: 100 },
      );
      const flipped = await spokes();
      const flippedOrient: Euler[] = [];
      for (const id of spokeIds) flippedOrient.push(await orient(id));
      const spin = toMatrix({ rx: 0, ry: 180, rz: 0 });
      const still = toMatrix({ rx: 0, ry: 0, rz: 0 });
      for (let index = 0; index < 10; index += 1) {
        expect(flipped[index]!.x).toBeCloseTo(initial[index]!.x, 6);
        expect(flipped[index]!.z).toBeCloseTo(initial[index]!.z, 6);
        const expected = multiply(index % 2 === 1 ? spin : still, toMatrix(initialOrient[index]!));
        expect(matrixDiff(expected, toMatrix(flippedOrient[index]!))).toBeLessThan(1e-6);
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('html[data-ready="true"]').waitFor();
      await openFixtures();
      await page.locator("[data-array-status]", { hasText: "spokes · 10 members" }).waitFor();
      const reloaded = await spokes();
      for (let index = 0; index < 10; index += 1) {
        expect(reloaded[index]!.x).toBeCloseTo(flipped[index]!.x, 6);
        expect(reloaded[index]!.z).toBeCloseTo(flipped[index]!.z, 6);
        expect(reloaded[index]!.ry).toBeCloseTo(flipped[index]!.ry, 6);
      }
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "composes multi-axis orientations as one rigid rotation",
    async () => {
      await openFixtures();
      await page.locator('[data-fixture="3"]').click();
      await page.locator('[data-rotate="rx"]').fill("0");
      await page.locator('[data-rotate="ry"]').fill("45");
      await page.locator('[data-rotate="rz"]').fill("0");
      await page.locator("[data-rotate-pivot]").selectOption("own");
      const before = Number(await page.locator("[data-history-count]").textContent());
      await page.locator("[data-rotate-apply]").click();
      await page.waitForFunction(
        () => {
          const marker = document.querySelector('[data-fixture-mark="3"]');
          return Math.abs(Number(marker?.getAttribute("data-rendered-placement-ry")) - 45) < 1e-6;
        },
        undefined,
        { polling: 100 },
      );
      await page.locator('[data-rotate="ry"]').fill("0");
      await page.locator('[data-rotate="rz"]').fill("90");
      await page.locator("[data-rotate-apply]").click();
      await page.waitForFunction(
        () => {
          const marker = document.querySelector('[data-fixture-mark="3"]');
          return Math.abs(Number(marker?.getAttribute("data-rendered-placement-ry"))) < 1e-6;
        },
        undefined,
        { polling: 100 },
      );
      expect(
        Math.abs(Number(await page.locator('[data-placement-field="ry"]').inputValue())),
      ).toBeLessThan(1e-3);
      expect(Number(await page.locator("[data-history-count]").textContent())).toBe(before + 2);
      expect(
        await page.locator('[data-fixture-mark="3"]').getAttribute("data-rendered-placement-x"),
      ).toBe("0");
      expect(
        await page.locator('[data-fixture-mark="3"]').getAttribute("data-rendered-placement-z"),
      ).toBe("5");
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "spaces radial arrays by an explicit angle step",
    async () => {
      await openFixtures();
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator('[data-fixture="3"]').click({ modifiers: ["Shift"] });
      await page.locator("[data-revert]").click();
      await page.locator('[data-fixture-mark="1"][data-rendered-placement-x="0"]').waitFor();
      await page.locator("[data-array-id]").fill("tri");
      await page.locator("[data-array-kind]").selectOption("radial");
      await page.locator("[data-array-members]").fill("1,2,3");
      await page.locator('[data-array="radius"]').fill("2");
      await page.locator('[data-array="stepDeg"]').fill("120");
      await page.locator("[data-array-save]").click();
      await page.locator("[data-array-status]", { hasText: "tri · 3 members" }).waitFor();
      const positions = () =>
        page.evaluate(() =>
          [1, 2, 3].map((id) => {
            const marker = document.querySelector(`[data-fixture-mark="${id}"]`);
            return {
              x: Number(marker?.getAttribute("data-rendered-placement-x")),
              z: Number(marker?.getAttribute("data-rendered-placement-z")),
            };
          }),
        );
      const wide = await positions();
      expect(wide[0]!.x).toBeCloseTo(2, 6);
      expect(wide[1]!.x).toBeCloseTo(-1, 6);
      expect(wide[1]!.z).toBeCloseTo(1.732, 3);
      expect(wide[2]!.x).toBeCloseTo(-1, 6);
      expect(wide[2]!.z).toBeCloseTo(-1.732, 3);
      await page.locator('[data-array="stepDeg"]').fill("90");
      await page.locator("[data-array-save]").click();
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-z="2"]').waitFor();
      const quarter = await positions();
      expect(quarter[1]!.x).toBeCloseTo(0, 6);
      expect(quarter[2]!.x).toBeCloseTo(-2, 6);
      expect(quarter[2]!.z).toBeCloseTo(0, 6);
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "keeps array members unique, known, and id-durable across recompute",
    async () => {
      await openFixtures();
      await page.locator('[data-fixture="1"]').click();
      await page.locator('[data-fixture="2"]').click({ modifiers: ["Shift"] });
      await page.locator("[data-revert]").click();
      await page.locator("[data-array-id]").fill("dedup");
      await page.locator("[data-array-kind]").selectOption("line");
      await page.locator("[data-array-members]").fill("1,1,2,999");
      await page.locator('[data-array="spacingX"]').fill("5");
      await page.locator("[data-array-save]").click();
      await page.locator("[data-array-status]", { hasText: "dedup · 2 members" }).waitFor();
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="5"]').waitFor();
      await page.locator("[data-array-members]").fill("1");
      await page.locator("[data-array-save]").click();
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="0"]').waitFor();
      await page.locator('[data-fixture="2"]').click();
      await page.locator('[data-placement-field="x"]').fill("42");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-fixture-mark="2"][data-rendered-placement-x="42"]').waitFor();
      await page.locator("[data-array-members]").fill("1,2");
      await page.locator('[data-array="originX"]').fill("1");
      await page.locator("[data-array-save]").click();
      await page.locator('[data-fixture-mark="1"][data-rendered-placement-x="1"]').waitFor();
      expect(
        await page.locator('[data-fixture-mark="2"]').getAttribute("data-rendered-placement-x"),
      ).toBe("42");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('html[data-ready="true"]').waitFor();
      await openFixtures();
      await page.locator("[data-array-status]", { hasText: "dedup · 2 members" }).waitFor();
      expect(
        await page.locator('[data-fixture-mark="1"]').getAttribute("data-rendered-placement-x"),
      ).toBe("1");
      expect(
        await page.locator('[data-fixture-mark="2"]').getAttribute("data-rendered-placement-x"),
      ).toBe("42");
    },
    BROWSER_TEST_TIMEOUT,
  );

  test(
    "drops malformed persisted arrays while keeping valid overrides",
    async () => {
      await openFixtures();
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open("beamhouse.scene.v1", 1);
            open.onsuccess = () => {
              const database = open.result;
              const transaction = database.transaction("working-scenes", "readwrite");
              transaction.objectStore("working-scenes").put(
                {
                  overrides: { 2: { position: [42, 0, 0], rotation: [0, 0, 0] } },
                  views: {},
                  arrays: {
                    bad: { kind: "radial", memberIds: [1, 2] },
                    bad2: { kind: "line", memberIds: "nope" },
                    bad3: null,
                  },
                },
                "current",
              );
              transaction.oncomplete = () => resolve();
              transaction.onerror = () =>
                reject(transaction.error ?? new Error("IndexedDB transaction failed"));
            };
            open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
          }),
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('html[data-ready="true"]').waitFor();
      await openFixtures();
      await page.locator("[data-array-status]", { hasText: "No array" }).waitFor();
      expect(
        await page.locator('[data-fixture-mark="2"]').getAttribute("data-rendered-placement-x"),
      ).toBe("42");
      expect(
        await page.locator('[data-fixture-mark="1"]').getAttribute("data-rendered-placement-x"),
      ).toBe("-2");
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "adds addressed local fixtures and addressless scene objects through one persistent fixture model",
    async () => {
      page.once("dialog", (dialog) => void dialog.accept());
      await page.locator("[data-takeover]").click();
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      await openFixtures();

      await page.locator("[data-local-definition-source]").selectOption("new-strip");
      await page.locator("[data-inline-definition-id]").fill("bhs:tube");
      await page.locator('[data-inline-strip="pixels"]').fill("60");
      await page.locator("[data-local-universe]").fill("64000");
      await page.locator("[data-local-address]").fill("1");
      await page.locator("[data-local-add]").click();
      await page.locator("[data-local-error]", { hasText: "1–63999" }).waitFor();
      await page.locator("[data-local-universe]").fill("4");
      await page.locator("[data-local-address]").fill("400");
      await page.locator("[data-local-add]").click();
      await page.locator("[data-local-error]", { hasText: "runs past slot 512" }).waitFor();
      expect(await page.locator('[data-local-fixture="-1"]').count()).toBe(0);

      await page.locator("[data-local-address]").fill("333");
      await page.locator("[data-local-breaks]").fill("5.001");
      const historyBeforeFixture = Number(await page.locator("[data-history-count]").textContent());
      await page.locator("[data-local-add]").click();
      await page.locator('[data-local-fixture="-1"]', { hasText: "4.333 · 5.001" }).waitFor();
      expect(Number(await page.locator("[data-history-count]").textContent())).toBe(
        historyBeforeFixture + 1,
      );
      // LiveFeed's subscription travels over the real WebSocket; wait for that platform boundary.
      await Bun.sleep(250);
      const slot333 = [...Array<number>(332).fill(0), 199];
      for (let sequence = 1; sequence < 41; sequence += 1)
        await sendUdp(sacn(sequence, slot333, 0, 4), sacnPort);
      await page.locator('[data-local-fixture="-1"][data-local-level="199"]').waitFor();

      await page.locator("[data-local-definition-source]").selectOption("existing");
      await page.locator("[data-local-definition]").fill("bhs:tube");
      await page.locator("[data-local-universe]").fill("5");
      await page.locator("[data-local-address]").fill("1");
      await page.locator("[data-local-add]").click();
      await page.locator('[data-local-fixture="-2"]', { hasText: "5.001" }).waitFor();
      const historyBeforeDefinition = Number(
        await page.locator("[data-history-count]").textContent(),
      );
      await page.locator('[data-edit-definition="bhs:tube"]').first().click();
      await page.locator("[data-definition-affects]", { hasText: "2 fixtures" }).waitFor();
      await page.locator('[data-definition-strip="pixels"]').fill("30");
      await page.locator("[data-definition-save]").click();
      await page.locator('[data-local-fixture="-1"]', { hasText: "30 px" }).waitFor();
      expect(Number(await page.locator("[data-history-count]").textContent())).toBe(
        historyBeforeDefinition + 1,
      );
      await page.locator('[data-definition-strip="pixels"]').fill("100");
      await page.locator("[data-definition-save]").click();
      await page.locator("[data-local-error]", { hasText: "would run" }).waitFor();
      await page.locator('[data-local-fixture="-1"]', { hasText: "30 px" }).waitFor();

      await page.locator('[data-overlay-tab="objects"]').click();
      await page.locator("[data-object-definition]").fill("bhs:stage");
      await page.locator('[data-object-primitive="width"]').fill("4");
      const historyBeforeObject = Number(await page.locator("[data-history-count]").textContent());
      await page.locator("[data-object-add]").click();
      await page.locator('[data-local-fixture="-3"]', { hasText: "no address" }).waitFor();
      expect(await page.locator('[data-local-fixture="-3"]').getAttribute("data-mode")).toBe("");
      expect(Number(await page.locator("[data-history-count]").textContent())).toBe(
        historyBeforeObject + 1,
      );
      await page.locator("[data-object-add]").click();
      await page.locator('[data-local-fixture="-4"]', { hasText: "no address" }).waitFor();

      await page.locator('[data-local-fixture="-4"]').click();
      await page.locator('[data-local-fixture="-3"]').press("Enter");
      await page.locator('[data-overlay-tab="fixtures"]').click();
      await page.locator("[data-placement-controls]").getAttribute("data-placement-x");
      expect(await page.locator("#selection-status").textContent()).toBe("-3");
      const subscribeProbe = page.evaluate(
        () =>
          new Promise<unknown[]>((resolve) => {
            const original = Reflect.get(WebSocket.prototype, "send");
            const seen: unknown[] = [];
            WebSocket.prototype.send = function (data) {
              if (typeof data === "string" && data.includes('"subscribe"')) {
                seen.push(JSON.parse(data));
                if (
                  seen.some((message) =>
                    (message as { universes?: number[] }).universes?.includes(6),
                  )
                ) {
                  WebSocket.prototype.send = original;
                  resolve(seen);
                }
              }
              return original.call(this, data);
            };
            setTimeout(() => {
              WebSocket.prototype.send = original;
              resolve(seen);
            }, 2_000);
          }),
      );
      await page.locator("[data-local-definition-source]").selectOption("existing");
      await page
        .locator("[data-local-definition]")
        .fill("gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016");
      await page.locator("[data-local-universe]").fill("6");
      await page.locator("[data-local-address]").fill("1");
      await page.locator("[data-local-footprint]").fill("69");
      await page.locator("[data-local-breaks]").fill("");
      await page.locator("[data-local-add]").click();
      expect(
        (await subscribeProbe).some((message) =>
          (message as { universes?: number[] }).universes?.includes(6),
        ),
      ).toBe(true);
      await page.locator('[data-local-fixture="-5"][data-resolved-footprint="69"]').waitFor();
      expect(
        await page.locator('[data-local-fixture="-5"]').getAttribute("data-resolved-length"),
      ).toBe("1.5");
      // The new universe was subscribed through the same real WebSocket immediately above.
      await Bun.sleep(250);
      for (let sequence = 1; sequence < 41; sequence += 1)
        await sendUdp(sacn(sequence, [123], 0, 6), sacnPort);
      await page.locator('[data-local-fixture="-5"][data-local-level="123"]').waitFor();
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "displays an arbitrary committed third-party definition from mesh or proxy",
    async () => {
      interface GdtfPreviewResult {
        definition: string;
        source: string;
      }
      const preview = (filename: string) => {
        const base64 = Buffer.from(
          readFileSync(resolve(repository, "definitions/authored", filename)),
        ).toString("base64");
        return page.evaluate((payload: string): Promise<GdtfPreviewResult> => {
          // Loader hook installed by main.ts at startup.
          const candidates = window as unknown as Record<string, unknown>;
          const hook = candidates["__beamhouseLoadGdtf"] as (
            base64: string,
          ) => Promise<GdtfPreviewResult>;
          return hook(payload);
        }, base64);
      };
      // Mesh-less third-party definition: proxy primitive, id from FixtureTypeID.
      const glp = await preview("GLP@impression 90 RGB@v1.gdtf");
      expect(glp).toEqual({
        definition: "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48",
        source: "proxy",
      });
      await page.locator('#viewport[data-gdtf-source="proxy"]').waitFor();
      expect(await page.locator("#viewport").getAttribute("data-gdtf-definition")).toBe(
        "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48",
      );
      // Archived GLB present: the referenced mesh renders instead of the proxy.
      const spoke = await preview("Beamhouse@WLED STAR-TENT Spoke 23px@v1.gdtf");
      expect(spoke.definition).toBe("gdtf:1B9F1C2E-7A64-4C0D-9E33-5A2D8B47F016");
      expect(spoke.source).toBe("mesh");
      await page.locator('#viewport[data-gdtf-source="mesh"]').waitFor();
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "navigates the single overlay from state chips showing current values",
    async () => {
      await expectCount(page.locator("[data-chip-tab]"), 8);
      // Fresh page per test: the socket is still connecting right after goto.
      await page.waitForFunction(
        () => document.querySelector("#feed-status")?.textContent !== "connecting",
      );
      await page.waitForFunction(() =>
        /^1 · /.test(document.querySelector("#universe-status")?.textContent ?? ""),
      );
      expect(await page.locator("#patch-status").textContent()).toMatch(/reference/);
      expect(await page.locator("#render-status").textContent()).toBe("live");
      expect(await page.locator("#hold-status").textContent()).toBe("off");
      await page.locator('[data-chip-tab="universes"]').first().click();
      await page.locator('[data-overlay-panel="universes"]:not([hidden])').waitFor();
      await page.locator('[data-chip-tab="issues"]').first().click();
      await page.locator('[data-overlay-panel="issues"]:not([hidden])').waitFor();
      await page.locator('[data-chip-tab="fixtures"]').first().click();
      await page.locator('[data-overlay-panel="fixtures"]:not([hidden])').waitFor();
      await page.locator('[data-overlay-tab="objects"]').click();
      await expectCount(page.locator('[data-overlay-panel="objects"]:not([hidden])'), 1);
      await page.locator('[data-overlay-tab="history"]').click();
      await expectCount(page.locator('[data-overlay-panel="history"]:not([hidden])'), 1);
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "composes additive trust marks and lists patch issues in context",
    async () => {
      page.once("dialog", (dialog) => void dialog.accept());
      await page.locator("[data-takeover]").click();
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      await openFixtures();
      await page.locator("[data-local-definition-source]").selectOption("existing");
      await page.locator("[data-local-definition]").fill("gdtf:missing-fixture");
      await page.locator("[data-local-universe]").fill("40");
      await page.locator("[data-local-address]").fill("1");
      await page.locator("[data-local-footprint]").fill("1");
      await page.locator("[data-local-breaks]").fill("");
      await page.locator("[data-local-add]").click();
      const unresolved = page.locator('[data-local-fixture][data-marks*="unresolved"]');
      await unresolved.first().waitFor();
      expect(await unresolved.first().textContent()).toContain("gdtf:missing-fixture");
      for (let copy = 0; copy < 2; copy += 1) {
        await page.locator("[data-local-definition]").fill("bhs:tube");
        await page.locator("[data-local-universe]").fill("41");
        await page.locator("[data-local-address]").fill("1");
        await page.locator("[data-local-add]").click();
      }
      const overlap41 = page.locator('[data-local-fixture][data-marks*="overlap"]', {
        hasText: "41.001",
      });
      await expectCount(overlap41, 2);
      const overlapped = overlap41.first();
      await overlapped.click();
      await page.locator('[data-placement-field="x"]').fill("7.5");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-placement-x="7.5"]').waitFor();
      const composed = await overlap41.first().getAttribute("data-marks");
      expect(composed).toContain("overlap");
      expect(composed).toContain("overridden");
      await page.locator("[data-local-universe]").fill("64000");
      await page.locator("[data-local-add]").click();
      await page.locator("[data-local-error]", { hasText: "1–63999" }).waitFor();
      await page.locator('[data-chip-tab="issues"]').first().click();
      await page.locator('[data-overlay-panel="issues"]:not([hidden])').waitFor();
      expect(await page.locator("[data-issue]").count()).toBeGreaterThanOrEqual(3);
      expect(await page.locator("#patch-status").textContent()).toMatch(/reference · [1-9]/);
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "surfaces the undo-grained journal in the History view",
    async () => {
      await openFixtures();
      // Seed one undo entry on this fresh page: the shared page used to inherit
      // the journal accumulated by earlier tests.
      await page
        .locator('[data-local-fixture][data-marks*="overlap"]', { hasText: "41.001" })
        .first()
        .click();
      await page.locator('[data-placement-field="x"]').fill("8.4");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-placement-x="8.4"]').waitFor();
      const before = await page.locator("[data-history-entry]").count();
      expect(before).toBeGreaterThan(0);
      await page
        .locator('[data-local-fixture][data-marks*="overlap"]', { hasText: "41.001" })
        .first()
        .click();
      await page.locator('[data-placement-field="x"]').fill("8.5");
      await page.locator('[data-placement-field="x"]').press("Enter");
      await page.locator('[data-placement-x="8.5"]').waitFor();
      await page.locator('[data-overlay-tab="history"]').click();
      await page.locator('[data-overlay-panel="history"]:not([hidden])').waitFor();
      expect(await page.locator("[data-history-entry]").last().textContent()).toContain("move");
      await page.locator('[data-overlay-tab="fixtures"]').click();
      await page.locator('[data-overlay-panel="fixtures"]:not([hidden])').waitFor();
      await page.locator("[data-undo]").click();
      await page.locator('[data-overlay-tab="history"]').click();
      await page.locator('[data-history-entry][data-undone="true"]').first().waitFor();
      await page.locator('[data-overlay-tab="fixtures"]').click();
      await page.locator('[data-overlay-panel="fixtures"]:not([hidden])').waitFor();
      await page.locator("[data-redo]").click();
      await page.locator('[data-overlay-tab="history"]').click();
      await expectCount(page.locator('[data-history-entry][data-undone="true"]'), 0);
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "pins the selected rendered state locally while frames keep arriving",
    async () => {
      await openFixtures();
      await page.locator("[data-local-definition-source]").selectOption("existing");
      await page.locator("[data-local-definition]").fill("bhs:tube");
      await page.locator("[data-local-universe]").fill("42");
      await page.locator("[data-local-address]").fill("1");
      await page.locator("[data-local-breaks]").fill("");
      await page.locator("[data-local-add]").click();
      const held = page.locator("[data-local-fixture]", { hasText: "42.001" });
      // LiveFeed's subscription travels over the real WebSocket; wait for that platform boundary.
      await Bun.sleep(250);
      for (let sequence = 51; sequence < 71; sequence += 1)
        await sendUdp(sacn(sequence, [100], 0, 42), sacnPort);
      await page.locator('[data-local-fixture][data-local-level="100"]').first().waitFor();
      await held.first().click();
      await page.locator('[data-chip-tab="fixtures"]', { hasText: "Hold" }).click();
      expect(await page.locator("#hold-status").textContent()).toBe("on");
      for (let sequence = 71; sequence < 91; sequence += 1) {
        await sendUdp(sacn(sequence, [200], 0, 42), sacnPort);
        await sendUdp(sacn(sequence, [11, 12, 13]), sacnPort);
      }
      await levelsBecome([11, 12, 13]);
      // The pinned row refreshes on its own tick after the live rows do.
      await page
        .locator('[data-local-fixture][data-local-level="100"]', { hasText: "42.001" })
        .waitFor();
      expect(await held.first().getAttribute("data-local-level")).toBe("100");
      await page.locator('[data-chip-tab="fixtures"]', { hasText: "Hold" }).click();
      expect(await page.locator("#hold-status").textContent()).toBe("off");
      for (let sequence = 91; sequence < 111; sequence += 1)
        await sendUdp(sacn(sequence, [150], 0, 42), sacnPort);
      await page.locator('[data-local-fixture][data-local-level="150"]').first().waitFor();
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "renders the explicitly relative intensity map and source-shaped universe health",
    async () => {
      await openFixtures();
      await page.locator('[data-chip-tab="fixtures"]', { hasText: "Render" }).click();
      expect(await page.locator("#render-status").textContent()).toBe("intensity");
      await expectCount(page.locator("[data-intensity-note]:not([hidden])"), 1);
      expect(await page.locator("[data-intensity-note]").textContent()).toMatch(
        /relative per emitter/,
      );
      expect(await page.locator("[data-intensity-note]").textContent()).toMatch(/no photometric/);
      expect(await page.locator("#viewport").getAttribute("data-render-mode")).toBe("intensity");
      await page.locator('[data-chip-tab="fixtures"]', { hasText: "Render" }).click();
      expect(await page.locator("#render-status").textContent()).toBe("live");
      await sendUdp(sacn(120, [50, 51, 52]), sacnPort);
      await levelsBecome([50, 51, 52]);
      await openUniverses();
      const source = page.locator('[data-source^="sacn:"]');
      await source.first().waitFor();
      expect(await source.first().innerText()).toContain("claimed");
      expect(await page.locator("[data-arbitration-note]").textContent()).toMatch(
        /never arbitrates/,
      );
      for (let sequence = 121; sequence < 131; sequence += 1)
        await sendUdp(sacn(sequence, [77], 0, 42), sacnPort);
      const section42 = page.locator('[data-universe="42"]');
      await section42.waitFor();
      await expectCount(section42.locator("[data-source]"), 1);
      expect(await section42.textContent()).toContain("Universe 42");
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "selects fixtures by picking the viewport",
    async () => {
      await openFixtures();
      await page.keyboard.press("Escape");
      await page.locator("[data-overlay]").waitFor({ state: "hidden" });
      const point = await page.evaluate(() => {
        const host = document.querySelector("#viewport")!.getBoundingClientRect();
        const marker = document.querySelector<HTMLElement>('[data-fixture-mark="1"]')!;
        return {
          x: host.left + Number.parseFloat(marker.style.left || "0"),
          y: host.top + Number.parseFloat(marker.style.top || "0"),
        };
      });
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(
        () => document.querySelector("#selection-status")?.textContent === "1",
      );
      expect(await page.locator('[data-fixture="1"]').getAttribute("data-selected")).toBe("true");
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "shares a frozen snapshot link from the desktop action",
    async () => {
      await page.locator("[data-share]").click();
      await page.waitForFunction(
        () =>
          location.hash.includes("#s=") ||
          document.querySelector("[data-share-state]")?.textContent === "file",
      );
      expect(await page.evaluate(() => location.hash.length)).toBeLessThanOrEqual(4099);
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "a share link opens read-only from static hosting with no bridge",
    async () => {
      const encoded = await encodeShareSnapshot({
        fixtures: [
          {
            id: -1,
            definition: "bhs:strip",
            mode: "default",
            addresses: [{ universe: 2, address: 30, footprint: 69 }],
          },
          {
            id: -2,
            definition: "bhs:box",
            mode: "pixel",
            addresses: [{ universe: 1, address: 1, footprint: 3 }],
          },
          { id: -3, definition: "bhs:box", mode: "", addresses: [] },
        ],
        definitions: {
          "bhs:strip": {
            kind: "strip",
            pixels: 23,
            pitchMm: 25,
            channelsPerPixel: 3,
            primitive: "Cube",
          },
          "bhs:box": { kind: "primitive", primitive: "Cube", width: 1, depth: 1, height: 1 },
        },
        placements: new Map([
          [-1, { position: [0, 0.5, 2], rotation: [0, 0, 0] }],
          [-2, { position: [-2, 0.5, 0], rotation: [0, 45, 0] }],
          [-3, { position: [2, 1.5, -1], rotation: [0, 0, 0] }],
        ]),
        views: { Front: { position: [0, 3, 8], target: [0, 1, 0] } },
        now: Date.now() - 3 * 3600 * 1000,
      });
      if (encoded.kind !== "link") throw new Error("fixture rig should fit the fragment budget");
      const dist = resolve(repository, "app/dist");
      if (!existsSync(resolve(dist, "index.html"))) {
        const build = Bun.spawnSync(["bun", "run", "build"], {
          cwd: repository,
          stdout: "ignore",
          stderr: "pipe",
        });
        if (!build.success) throw new Error(build.stderr.toString());
      }
      const staticPort = await freeTcpPort();
      const staticServer = Bun.serve({
        port: staticPort,
        hostname: "127.0.0.1",
        fetch(request) {
          const pathname = new URL(request.url).pathname;
          const file = pathname === "/" ? "index.html" : pathname.slice(1);
          const resolved = resolve(dist, file);
          if (!resolved.startsWith(dist)) return new Response("forbidden", { status: 403 });
          try {
            const body = readFileSync(resolved);
            const type = resolved.endsWith(".html")
              ? "text/html"
              : resolved.endsWith(".js")
                ? "text/javascript"
                : resolved.endsWith(".css")
                  ? "text/css"
                  : "application/octet-stream";
            return new Response(body, { headers: { "content-type": type } });
          } catch {
            return new Response("missing", { status: 404 });
          }
        },
      });
      try {
        const viewer = await browser.newPage({ viewport: { width: 390, height: 844 } });
        try {
          await viewer.goto(`http://127.0.0.1:${staticPort}/#${encoded.fragment}`, {
            waitUntil: "domcontentloaded",
          });
          await viewer.locator('html[data-ready="true"]').waitFor({ timeout: 30_000 });
          await viewer.locator('body[data-viewer="true"]').waitFor({ timeout: 30_000 });
          // No bridge behind static hosting: the socket never opens.
          expect(
            await viewer.evaluate(() => {
              const { promise, resolve: resolveSocket } = Promise.withResolvers<string>();
              const socket = new WebSocket(
                `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
              );
              const done = (value: string) => {
                try {
                  socket.close();
                } catch {
                  // A refused socket has nothing to close.
                }
                resolveSocket(value);
              };
              socket.addEventListener("open", () => done("open"));
              socket.addEventListener("error", () => done("refused"));
              setTimeout(() => done("timeout"), 5_000);
              return promise;
            }),
          ).not.toBe("open");
          await expectCount(viewer.locator("#viewport canvas"), 1);
          expect(await viewer.locator("[data-snapshot-age]").innerText()).toContain("Snapshot ·");
          expect(await viewer.locator("[data-snapshot-age]").innerText()).toContain("3h ago");
          expect(await viewer.locator(".brand strong").innerText()).toContain("demo");
          // Only actionable chips survive.
          expect(await viewer.locator(".status-chips .chip:visible").count()).toBe(2);
          // The Camera chip survives as navigation; its takeover listener is viewer-detached,
          // proven below when clicking it opens the overlay instead of claiming ownership.
          // Portrait reserves the bounded rig band above the fixture list.
          const portraitBox = await viewer.locator("#viewport").boundingBox();
          expect(portraitBox?.height).toBeGreaterThan(300);
          expect(portraitBox?.height).toBeLessThan(340);
          expect(await viewer.locator("[data-viewer-fixture]").count()).toBe(3);
          expect(await viewer.locator("[data-viewer-count]").innerText()).toContain("3 fixtures");
          // Tap selection carries the count, never the name.
          await viewer.locator('[data-viewer-fixture="-2"]').click();
          await viewer.locator("#selection-status", { hasText: "SEL 1" }).waitFor();
          // Canvas tap selection works through the same viewport render path.
          const point = await viewer.evaluate(() => {
            const host = document.querySelector("#viewport")!.getBoundingClientRect();
            const marker = document.querySelector<HTMLElement>('[data-fixture-mark="1"]')!;
            return {
              x: host.left + Number.parseFloat(marker.style.left || "0"),
              y: host.top + Number.parseFloat(marker.style.top || "0"),
            };
          });
          await viewer.mouse.click(point.x, point.y);
          await viewer.waitForFunction(
            () => document.querySelector("#selection-status")?.textContent === "SEL 1",
          );
          // Read-only: the editor never surfaces, even with a selection.
          expect(await viewer.locator(".editor:visible").count()).toBe(0);
          expect(await viewer.locator("[data-placement-controls]:visible").count()).toBe(0);
          // Orbit moves the camera: the marker projection the render loop writes each frame
          // is the awaited state signal, so no fixed pause and no pixel comparison.
          const markBefore = await viewer.evaluate(
            () => document.querySelector<HTMLElement>('[data-fixture-mark="1"]')?.style.left,
          );
          const center = await viewer.locator("#viewport").boundingBox();
          await viewer.mouse.move(
            (center?.x ?? 195) + (center?.width ?? 390) / 2,
            (center?.y ?? 0) + 160,
          );
          await viewer.mouse.down();
          await viewer.mouse.move(
            (center?.x ?? 195) + (center?.width ?? 390) / 2 - 150,
            (center?.y ?? 0) + 160,
            { steps: 8 },
          );
          await viewer.mouse.up();
          await viewer.waitForFunction(
            (before) =>
              document.querySelector<HTMLElement>('[data-fixture-mark="1"]')?.style.left !== before,
            markBefore ?? "",
          );
          // The Camera chip opens the viewer overlay: fixtures and objects only.
          await viewer.locator(".status-chips .chip:visible", { hasText: "Camera" }).click();
          await viewer.locator("[data-overlay]").waitFor({ state: "visible" });
          expect(await viewer.locator('[data-overlay-tab="issues"]:visible').count()).toBe(0);
          // The frozen snapshot view survived selection re-renders and still applies.
          await viewer.locator('[data-camera-view="Front"]').click();
          // Landscape frames the rig full-height with the list floating; the media-query
          // flip is the awaited signal.
          await viewer.keyboard.press("Escape");
          await viewer.setViewportSize({ width: 844, height: 390 });
          await viewer.waitForFunction(
            () =>
              getComputedStyle(document.querySelector("[data-viewer-list]")!).position ===
              "absolute",
          );
          const landscapeBox = await viewer.locator("#viewport").boundingBox();
          expect(landscapeBox?.height).toBeGreaterThan(300);
        } finally {
          await viewer.close();
        }
      } finally {
        await staticServer.stop(true);
      }
    },
    BROWSER_HEAVY_TIMEOUT,
  );
  test(
    "records browser frames under --record and plays them back bridge-local",
    async () => {
      const dist = resolve(repository, "app/dist");
      if (!existsSync(resolve(dist, "index.html"))) {
        const build = Bun.spawnSync(["bun", "run", "build"], {
          cwd: repository,
          stdout: "ignore",
          stderr: "pipe",
        });
        if (!build.success) throw new Error(build.stderr.toString());
      }
      const scratch = mkdtempSync(join(tmpdir(), "beamhouse-record-"));
      const watchDir = join(scratch, "shows");
      mkdirSync(watchDir);
      try {
        writeFileSync(
          join(watchDir, "deck.bhr"),
          readFileSync(resolve(repository, "tests/fixtures/representative.bhr")),
        );
        const recordHttp = await freeTcpPort();
        const recordSacn = await freeUdpPort();
        const recordArt = await freeUdpPort();
        const take = join(watchDir, "take.bhr");
        const recorder = Bun.spawn(["bun", "bridge/src/main.ts", "--record", take], {
          cwd: repository,
          env: {
            ...process.env,
            BEAMHOUSE_HOST: "127.0.0.1",
            BEAMHOUSE_PORT: String(recordHttp),
            BEAMHOUSE_SACN_PORT: String(recordSacn),
            BEAMHOUSE_ARTNET_PORT: String(recordArt),
            BEAMHOUSE_WATCH_DIR: watchDir,
          },
          stdout: "pipe",
          stderr: "pipe",
        });
        try {
          await waitUntilReachable("http://127.0.0.1:" + recordHttp, recorder);
          const socket = new WebSocket("ws://127.0.0.1:" + recordHttp + "/ws");
          socket.binaryType = "arraybuffer";
          await new Promise<void>((done, reject) => {
            let frames = 0;
            const timer = setTimeout(
              () => reject(new Error("no frames flowed during recording")),
              10_000,
            );
            socket.addEventListener("open", () => {
              socket.send(JSON.stringify({ op: "subscribe", universes: [1] }));
              void sendUdp(sacn(1, [201, 202, 203]), recordSacn);
            });
            socket.addEventListener("message", (event) => {
              if (event.data instanceof ArrayBuffer && ++frames >= 3) {
                clearTimeout(timer);
                done();
              }
            });
            socket.addEventListener("error", () => {
              clearTimeout(timer);
              reject(new Error("recorder socket failed"));
            });
          });
          socket.close();
          const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
          try {
            await desk.goto("http://127.0.0.1:" + recordHttp + "/#r=shows/deck", {
              waitUntil: "domcontentloaded",
            });
            await desk.locator('html[data-ready="true"]').waitFor({ timeout: 30_000 });
            await desk.locator("[data-transport-seek]").waitFor({ timeout: 30_000 });
            expect(await desk.locator(".brand strong").innerText()).toContain("deck");
            await desk.locator("#feed-status", { hasText: "recorded" }).waitFor();
            await desk.waitForFunction(
              () =>
                document
                  .querySelector("[data-transport-label]")
                  ?.textContent?.includes("shows/deck.bhr") ?? false,
            );
            await desk.waitForFunction(
              () =>
                /00:0[1-9] /.test(
                  document.querySelector("[data-transport-label]")?.textContent ?? "",
                ),
              null,
              { timeout: 30_000 },
            );
          } finally {
            await desk.close();
          }
          recorder.kill("SIGTERM");
          await recorder.exited;
          const raw = readFileSync(take);
          const taken = new Recording(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
          expect(taken.memberCount).toBeGreaterThanOrEqual(1);
          const last = await taken.frameAt(1_000_000_000);
          expect(last.frame.universes.map((universe) => universe.universe)).toEqual([1]);
          expect(last.frame.universes[0]!.slots.slice(0, 3)).toEqual(
            Uint8Array.from([201, 202, 203]),
          );
        } finally {
          if (recorder.exitCode === null) recorder.kill("SIGTERM");
          await recorder.exited;
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    BROWSER_HEAVY_TIMEOUT,
  );
  test(
    "a named hosted recording autoplays and seeks from static hosting with no bridge",
    async () => {
      const encoded = await encodeShareSnapshot({
        fixtures: [
          {
            id: -1,
            definition: "bhs:box",
            mode: "pixel",
            addresses: [{ universe: 1, address: 1, footprint: 3 }],
          },
        ],
        definitions: {
          "bhs:box": { kind: "primitive", primitive: "Cube", width: 1, depth: 1, height: 1 },
        },
        placements: new Map([[-1, { position: [0, 0.5, 2], rotation: [0, 0, 0] }]]),
        views: {},
        now: Date.now() - 3 * 3600 * 1000,
      });
      if (encoded.kind !== "link") throw new Error("recording rig should fit the fragment budget");
      const dist = resolve(repository, "app/dist");
      if (!existsSync(resolve(dist, "index.html"))) {
        const build = Bun.spawnSync(["bun", "run", "build"], {
          cwd: repository,
          stdout: "ignore",
          stderr: "pipe",
        });
        if (!build.success) throw new Error(build.stderr.toString());
      }
      const bhr = readFileSync(resolve(repository, "tests/fixtures/representative.bhr"));
      const staticPort = await freeTcpPort();
      const staticServer = Bun.serve({
        port: staticPort,
        hostname: "127.0.0.1",
        fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/opener.bhr")
            return new Response(bhr, { headers: { "content-type": "application/octet-stream" } });
          const file = pathname === "/" ? "index.html" : pathname.slice(1);
          const resolved = resolve(dist, file);
          if (!resolved.startsWith(dist)) return new Response("forbidden", { status: 403 });
          try {
            const body = readFileSync(resolved);
            const type = resolved.endsWith(".html")
              ? "text/html"
              : resolved.endsWith(".js")
                ? "text/javascript"
                : resolved.endsWith(".css")
                  ? "text/css"
                  : "application/octet-stream";
            return new Response(body, { headers: { "content-type": type } });
          } catch {
            return new Response("missing", { status: 404 });
          }
        },
      });
      try {
        const viewer = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        try {
          await viewer.goto(
            "http://127.0.0.1:" + staticPort + "/#" + encoded.fragment + "&r=opener",
            {
              waitUntil: "domcontentloaded",
            },
          );
          await viewer.locator("html[data-ready='true']").waitFor({ timeout: 30_000 });
          await viewer.locator("[data-transport-seek]").waitFor({ timeout: 30_000 });
          expect(await viewer.locator(".brand strong").innerText()).toContain("opener");
          expect(await viewer.locator("[data-transport-label]").innerText()).toContain(
            "Snapshot \u00b7",
          );
          expect(await viewer.locator("[data-transport-label]").innerText()).toContain("/ 00:11");
          await viewer.waitForFunction(
            () =>
              /00:0[1-9] /.test(
                document.querySelector("[data-transport-label]")?.textContent ?? "",
              ),
            null,
            { timeout: 30_000 },
          );
          await viewer.locator("[data-transport-seek]").evaluate((slider: HTMLInputElement) => {
            slider.value = "10";
            slider.dispatchEvent(new Event("change", { bubbles: true }));
          });
          await viewer.waitForFunction(
            () =>
              /00:1[0-1] /.test(
                document.querySelector("[data-transport-label]")?.textContent ?? "",
              ),
            null,
            { timeout: 30_000 },
          );
          const levels = await viewer
            .locator("[data-fixture] output")
            .evaluateAll((outputs) => outputs.map((output) => Number(output.textContent)));
          const landed = Array.from({ length: 45 }, (_, offset) => 300 + offset).find(
            (frame) =>
              frame % 256 === levels[0] &&
              (2 * frame) % 256 === levels[1] &&
              (3 * frame) % 256 === levels[2],
          );
          expect(landed).toBeDefined();
          await viewer.setViewportSize({ width: 390, height: 844 });
          expect(await viewer.locator("[data-transport-seek]").isVisible()).toBe(true);
          expect(await viewer.locator(".status-chips .chip:visible").count()).toBe(2);
          const portraitBox = await viewer.locator("#viewport").boundingBox();
          expect(portraitBox?.height).toBeGreaterThan(300);
          expect(portraitBox?.height).toBeLessThan(340);
          await viewer.setViewportSize({ width: 844, height: 390 });
          expect(await viewer.locator("[data-transport-seek]").isVisible()).toBe(true);
        } finally {
          await viewer.close();
        }
      } finally {
        await staticServer.stop(true);
      }
    },
    BROWSER_HEAVY_TIMEOUT,
  );

  test(
    "drives the STAR-TENT spokes, history, and a feed-stamped capture over MCP without stalling DMX",
    async () => {
      await page.locator("#ownership-status", { hasText: "owner" }).waitFor();
      await openFixtures();
      const mcp = Bun.spawn(["bun", "bridge/src/mcp.ts"], {
        cwd: repository,
        env: { ...process.env, BEAMHOUSE_BRIDGE_URL: `http://127.0.0.1:${httpPort}` },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      const reader = mcp.stdout.getReader();
      try {
        const decoder = new TextDecoder();
        let pending = "";
        const readLine = async (): Promise<string> => {
          for (;;) {
            const newline = pending.indexOf("\n");
            if (newline >= 0) {
              const line = pending.slice(0, newline);
              pending = pending.slice(newline + 1);
              return line;
            }
            const next = await reader.read();
            if (next.done) throw new Error("mcp server closed stdout");
            pending += decoder.decode(next.value, { stream: true });
          }
        };
        let rpcId = 1;
        const rpc = async (method: string, params: unknown): Promise<unknown> => {
          const id = rpcId++;
          await mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
          await mcp.stdin.flush();
          const response = JSON.parse(await readLine()) as {
            id: number;
            result?: unknown;
            error?: { message: string };
          };
          if (response.id !== id) throw new Error("mcp response id mismatch");
          if (response.error) throw new Error(response.error.message);
          return response.result;
        };
        const toolsCall = async (name: string, args: unknown) => {
          const result = (await rpc("tools/call", { name, arguments: args })) as {
            content: { type: string; text?: string; data?: string }[];
          };
          return result.content;
        };
        const textResult = async (name: string, args: unknown) => {
          const content = await toolsCall(name, args);
          if (content[0]?.type !== "text" || !content[0]?.text)
            throw new Error("expected text content");
          return JSON.parse(content[0].text) as Record<string, unknown>;
        };
        await rpc("initialize", {});
        const listed = (await rpc("tools/list", {})) as { tools: { name: string }[] };
        expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
          "capture",
          "command",
          "look",
          "query",
        ]);
        // DMX is flowing before the agent acts.
        for (let sequence = 201; sequence < 211; sequence += 1)
          await sendUdp(sacn(sequence, [40, 50, 60]), sacnPort);
        await levelsBecome([40, 50, 60]);
        // Arrange the ten STAR-TENT spokes radially through one MCP command.
        const members = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
        await toolsCall("command", {
          kind: "array.set",
          id: "spokes",
          array: {
            kind: "radial",
            memberIds: members,
            center: [0, 0, 0],
            radius: 0.75,
            startAngleDeg: 0,
            stepDeg: 36,
          },
        });
        await page.locator("[data-array-status]", { hasText: "spokes · 10 members" }).waitFor();
        const radius = () =>
          page.evaluate(() =>
            [101, 102, 103, 104, 105, 106, 107, 108, 109, 110].map((id) => {
              const marker = document.querySelector(`[data-strip-mark="${id}"]`);
              return Math.hypot(
                Number(marker?.getAttribute("data-rendered-placement-x")),
                Number(marker?.getAttribute("data-rendered-placement-z")),
              );
            }),
          );
        for (const spoke of await radius()) expect(spoke).toBeCloseTo(0.75, 2);
        // Rotate alternating members about their own mid-points: positions hold, headings flip.
        const spokePose = (id: number) =>
          page.evaluate((spoke) => {
            const marker = document.querySelector(`[data-strip-mark="${spoke}"]`);
            return {
              x: Number(marker?.getAttribute("data-rendered-placement-x")),
              z: Number(marker?.getAttribute("data-rendered-placement-z")),
              ry: Number(marker?.getAttribute("data-rendered-placement-ry")),
            };
          }, id);
        const before = await spokePose(102);
        await toolsCall("command", {
          kind: "rotate",
          fixtureIds: [102, 104, 106, 108, 110],
          delta: [0, 180, 0],
          pivot: { mode: "own" },
        });
        await page.waitForFunction(
          (previous) => {
            const marker = document.querySelector('[data-strip-mark="102"]');
            return (
              Math.abs(Number(marker?.getAttribute("data-rendered-placement-ry")) - previous) > 1
            );
          },
          before.ry,
          { polling: 100 },
        );
        const after = await spokePose(102);
        expect(after.x).toBeCloseTo(before.x, 6);
        expect(after.z).toBeCloseTo(before.z, 6);
        // Inspect issues and the shared journal; the agent rows are marked.
        const issues = await textResult("query", { name: "issues.list" });
        expect(Array.isArray(issues.overlaps)).toBe(true);
        const history = await textResult("query", { name: "history" });
        const entries = history.entries as { label: string; agent: boolean }[];
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.at(-1)?.agent).toBe(true);
        await page.locator('[data-overlay-tab="history"]').click();
        await page.locator('[data-overlay-panel="history"]:not([hidden])').waitFor();
        await page.locator('[data-history-entry][data-agent="true"]').first().waitFor();
        await page.locator('[data-overlay-tab="fixtures"]').click();
        await page.locator('[data-overlay-panel="fixtures"]:not([hidden])').waitFor();
        // Hold a generated look, keep DMX arriving, then capture against the held feed.
        const look = await textResult("look", { slots: { 2: new Array(69).fill(128) } });
        expect(look.feed).toBe("generated");
        await page.locator('#viewport[data-feed="generated"]').waitFor();
        for (let sequence = 211; sequence < 221; sequence += 1)
          await sendUdp(sacn(sequence, [70, 80, 90]), sacnPort);
        const captureContent = await toolsCall("capture", { maxEdge: 640, quality: 0.8 });
        expect(captureContent[0]?.type).toBe("image");
        expect(captureContent[0]?.data?.length ?? 0).toBeGreaterThan(0);
        const capture = JSON.parse(captureContent[1]?.text ?? "{}") as {
          captureId: string;
          width: number;
          size: number;
          downscaled: boolean;
          feed: string;
        };
        expect(capture.feed).toBe("generated");
        expect(capture.width).toBeLessThanOrEqual(640);
        expect(capture.size).toBeGreaterThan(0);
        expect(capture.size).toBeLessThanOrEqual(1000000);
        expect(capture.downscaled).toBe(true);
        // The handle is single-fetch: the MCP server consumed it.
        expect(
          (await fetch(`http://127.0.0.1:${httpPort}/capture/${capture.captureId}`)).status,
        ).toBe(404);
        // DMX reception never stalled.
        for (let sequence = 221; sequence < 231; sequence += 1)
          await sendUdp(sacn(sequence, [71, 81, 91]), sacnPort);
        await levelsBecome([71, 81, 91]);
        const released = await textResult("look", { clear: true });
        expect(released.feed).toBe("live");
      } finally {
        await reader.cancel().catch(() => undefined);
        try {
          mcp.kill("SIGTERM");
        } catch {
          // The server may already have exited.
        }
        await mcp.exited;
      }
    },
    BROWSER_HEAVY_TIMEOUT,
  );
  test(
    "resolves total attributes from a committed mover through the live viewport",
    async () => {
      await openFixtures();
      const moverId = await injectGdtf("GLP@impression 90 RGB@v1.gdtf");
      expect(moverId).toBe("gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48");
      await addLocalFixture(moverId, "Normal", 7, 1, 14);
      const mover = page.locator('[data-local-fixture][data-mode="Normal"]', { hasText: moverId });
      await mover.waitFor();
      // Pan/tilt at zero scale, full red, shutter open, full dimmer.
      await sendUdp(sacn(1, [0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0], 0, 7), sacnPort);
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-local-fixture][data-mode="Normal"]')
            ?.getAttribute("data-local-level") === "255",
      );
      // Pan resolves on a later tick than the level on a slow renderer.
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-local-fixture][data-mode="Normal"]')
            ?.getAttribute("data-pan") === "-330.0",
      );
      expect(await mover.getAttribute("data-pan")).toBe("-330.0");
      expect(await mover.getAttribute("data-tilt")).toBe("-150.0");
      expect(await mover.getAttribute("data-color")).toBe("255,0,0");
      expect(await mover.getAttribute("data-local-level")).toBe("255");
      expect(await mover.getAttribute("data-beam")).toBe("cone 10.0");
      expect(
        Number(await page.locator("#viewport").getAttribute("data-fixture-cones")),
      ).toBeGreaterThanOrEqual(1);
      // A closed shutter gates the render without touching the colour.
      await sendUdp(sacn(2, [0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0], 0, 7), sacnPort);
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-local-fixture][data-mode="Normal"]')
            ?.getAttribute("data-local-level") === "0",
      );
      expect(await mover.getAttribute("data-color")).toBe("255,0,0");
      // A named but unavailable mode leaves the placed fixture visibly unbound.
      await addLocalFixture(moverId, "Nope", 7, 20, 14);
      const unbound = page.locator('[data-local-fixture][data-mode="Nope"]');
      await unbound.waitFor();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-local-fixture][data-mode="Nope"]')
            ?.getAttribute("data-marks")
            ?.includes("unbound mode") ?? false,
      );
      const unboundId = await unbound.getAttribute("data-local-fixture");
      await page.locator('[data-chip-tab="issues"]').first().click();
      await page.locator('[data-overlay-panel="issues"]:not([hidden])').waitFor();
      await page.locator(`[data-issue="mode:${unboundId}"]`).waitFor();
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "drives white points, tungsten drift, OFL and third-party zoom through the viewport",
    async () => {
      await openFixtures();
      const parId = await injectGdtf("Beamhouse@generic PAR38@v1.gdtf");
      expect(parId).toBe("gdtf:FFC1C66D-905A-47AB-87DB-5FCEEF121B1A");
      await addLocalFixture(parId, "Dimmer", 8, 1, 1);
      const par = page.locator('[data-local-fixture][data-mode="Dimmer"]', { hasText: parId });
      await par.waitFor();
      const profileId = await injectGdtf("Beamhouse@generic profile@v1.gdtf");
      await addLocalFixture(profileId, "Dimmer", 8, 2, 1);
      const profile = page.locator('[data-local-fixture][data-mode="Dimmer"]', {
        hasText: profileId,
      });
      await profile.waitFor();
      await page.evaluate((fixture: unknown) => {
        const hook = (window as unknown as Record<string, unknown>)["__beamhouseRegisterOfl"] as (
          id: string,
          definition: unknown,
        ) => { definition: string };
        return hook("ofl:test:product-bar", fixture);
      }, PRODUCT_BAR);
      await addLocalFixture("ofl:test:product-bar", "6px RGB", 8, 10, 18);
      const bar = page.locator('[data-local-fixture][data-mode="6px RGB"]');
      await bar.waitFor();
      const moverId = await injectThirdPartyMover();
      await addLocalFixture(moverId, "Mover", 8, 30, 9);
      const mover = page.locator('[data-local-fixture][data-mode="Mover"]');
      await mover.waitFor();
      const frame38 = (patch: Record<number, number>): number[] => {
        const slots = new Array<number>(38).fill(0);
        for (const [slot, value] of Object.entries(patch)) slots[Number(slot) - 1] = value;
        return slots;
      };
      // Tungsten at ~10%: warm drift on a declared cone, no colour channels involved.
      await sendUdp(sacn(1, frame38({ 1: 26 }), 0, 8), sacnPort);
      const parIdNumber = Number(await par.getAttribute("data-local-fixture"));
      await page.waitForFunction(
        (fixtureId: number) =>
          document
            .querySelector(`[data-local-fixture="${fixtureId}"]`)
            ?.getAttribute("data-local-level") === "26",
        parIdNumber,
      );
      const warm = (await par.getAttribute("data-color"))?.split(",").map(Number) ?? [];
      expect(warm[0] ?? 0).toBeGreaterThan(200);
      expect((warm[0] ?? 0) - (warm[2] ?? 0)).toBeGreaterThan(150);
      expect(await par.getAttribute("data-beam")).toBe("cone 60.0");
      expect(await par.getAttribute("data-local-level")).toBe("26");
      // The hang override steers the profile barrel past its static declaration.
      const profileIdNumber = Number(await profile.getAttribute("data-local-fixture"));
      await page.evaluate((fixtureId: number) => {
        const hook = (window as unknown as Record<string, unknown>)["__beamhouseZoomOverride"] as (
          id: number,
          degrees: number | null,
        ) => void;
        hook(fixtureId, 30);
      }, profileIdNumber);
      await sendUdp(sacn(2, frame38({ 1: 26, 2: 255 }), 0, 8), sacnPort);
      await page.waitForFunction(
        (fixtureId: number) =>
          document
            .querySelector(`[data-local-fixture="${fixtureId}"]`)
            ?.getAttribute("data-zoom") === "30.0",
        profileIdNumber,
      );
      // The OFL matrix tiles its declared body from the same frame space.
      await sendUdp(sacn(3, frame38({ 1: 26, 2: 255, 10: 255, 16: 255, 22: 255 }), 0, 8), sacnPort);
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-local-fixture][data-mode="6px RGB"]')
            ?.getAttribute("data-color") === "255,255,255",
      );
      expect(await bar.getAttribute("data-color")).toBe("255,255,255");
      expect(await bar.getAttribute("data-beam")).toBe("glow 0.0");
      // Third-party shape, X4 oracle numbers: DMX 0 pans to +311 through the product.
      await sendUdp(
        sacn(
          4,
          frame38({
            1: 26,
            2: 255,
            10: 255,
            16: 255,
            22: 255,
            30: 0,
            31: 0,
            32: 0,
            33: 128,
            34: 255,
            35: 0,
            36: 0,
            37: 255,
            38: 255,
          }),
          0,
          8,
        ),
        sacnPort,
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-local-fixture][data-mode="Mover"]')
            ?.getAttribute("data-zoom") === "28.4",
      );
      expect(await mover.getAttribute("data-tilt")).toBe("121.0");
      expect(await mover.getAttribute("data-zoom")).toBe("28.4");
      expect(await mover.getAttribute("data-beam")).toBe("cone 28.4");
      // A textured strip with a missing mode marks unbound instead of guessing texels.
      const spokeId = await injectGdtf("Beamhouse@WLED STAR-TENT Spoke 23px@v1.gdtf");
      await addLocalFixture(spokeId, "Missing", 8, 40, 69);
      await page.waitForFunction(
        () =>
          document.querySelector(
            '[data-local-fixture][data-mode="Missing"][data-marks*="unbound"]',
          ) !== null,
      );
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "re-patches the live scene from a watched Mizer project without dropping the socket",
    async () => {
      // A two-second build guarantees the served bundle matches these sources.
      const build = Bun.spawnSync(["bun", "run", "build"], {
        cwd: repository,
        stdout: "ignore",
        stderr: "pipe",
      });
      if (!build.success) throw new Error(build.stderr.toString());
      const watchDir = mkdtempSync(join(tmpdir(), "beamhouse-patch-"));
      const watchHttp = await freeTcpPort();
      const watchSacn = await freeUdpPort();
      const watchArtnet = await freeUdpPort();
      // Spawned directly (not via `bun run`) so SIGTERM lands on the process owning the handler.
      const patchBridge = Bun.spawn(["bun", "src/main.ts"], {
        cwd: resolve(repository, "bridge"),
        env: {
          ...process.env,
          BEAMHOUSE_HOST: "127.0.0.1",
          BEAMHOUSE_PORT: String(watchHttp),
          BEAMHOUSE_SACN_PORT: String(watchSacn),
          BEAMHOUSE_ARTNET_PORT: String(watchArtnet),
          BEAMHOUSE_WATCH_DIR: watchDir,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const patchPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      try {
        await waitUntilReachable(`http://127.0.0.1:${watchHttp}`, patchBridge);
        await patchPage.goto(`http://127.0.0.1:${watchHttp}`, { waitUntil: "domcontentloaded" });
        await patchPage.locator('html[data-ready="true"]').waitFor();
        await patchPage.locator("#ownership-status", { hasText: "owner" }).waitFor();
        // Id-keyed contributions seeded before the first ingest must survive every repatch.
        await seedWorkingScene(patchPage);
        await patchPage.reload({ waitUntil: "domcontentloaded" });
        await patchPage.locator('html[data-ready="true"]').waitFor();

        const mover = "gdtf:9C7854E1-32D5-4DE9-BB8E-6D121F27CF48";
        const projectFile = resolve(watchDir, "rig.yml");
        writeFileSync(
          projectFile,
          mizerProject([
            [21, "First", mover, "Normal", 1, 1],
            [22, "Second", mover, "Normal", 1, 15],
          ]),
        );
        await openFixturesOn(patchPage);
        await patchPage.locator('[data-local-fixture="21"]').waitFor();
        await patchPage.locator('[data-local-fixture="22"]').waitFor();
        await expectPatchContribution(patchPage, 22);
        await patchPage.locator("#feed-status", { hasText: "live" }).waitFor();

        writeFileSync(
          projectFile,
          mizerProject([
            [22, "Second", mover, "Wide", 1, 20],
            [23, "Third", mover, "Normal", 2, 30],
          ]),
        );
        await patchPage.locator('[data-local-fixture="21"]').waitFor({ state: "detached" });
        await patchPage.locator('[data-local-fixture="23"]').waitFor();
        await patchPage.locator('[data-local-fixture="22"][data-mode="Wide"]').waitFor();
        await patchPage.locator('[data-local-fixture="22"] [data-break="1.020"]').waitFor();
        await expectPatchContribution(patchPage, 22);

        // Reference-rig ids (house fixtures 1-3, spokes 101-110) are legal: each ingested
        // fixture shadows the same-id reference entry (commands win) and the
        // collision surfaces as a mark and an issue row, never a parse failure.
        writeFileSync(
          projectFile,
          mizerProject([
            [1, "First", mover, "Normal", 4, 40],
            [2, "Second", mover, "Wide", 4, 60],
            [102, "Spoke Shadow", mover, "Normal", 2, 90],
          ]),
        );
        await patchPage
          .locator('[data-local-fixture="1"][data-marks*="shadows the reference rig"]')
          .waitFor();
        await patchPage
          .locator('[data-local-fixture="2"][data-marks*="shadows the reference rig"]')
          .waitFor();
        await patchPage
          .locator('[data-local-fixture="102"][data-marks*="shadows the reference rig"]')
          .waitFor();
        // The earlier 21-23 patch is gone: its rows detached.
        await patchPage.locator('[data-local-fixture="21"]').waitFor({ state: "detached" });
        await patchPage.locator('[data-local-fixture="22"]').waitFor({ state: "detached" });
        await patchPage.locator('[data-local-fixture="23"]').waitFor({ state: "detached" });
        // One visible row per id: no parallel reference copy in the list.
        await expectCount(patchPage.locator('[data-local-fixture="1"]'), 1);
        await expectCount(patchPage.locator('[data-local-fixture="2"]'), 1);
        await expectCount(patchPage.locator('[data-local-fixture="102"]'), 1);
        // The shadowed id is an issue row; the source never claims a parse lie.
        await patchPage.locator('[data-overlay-tab="issues"]').click();
        await patchPage.locator('[data-issue="mvr:1:0"]').waitFor();
        await patchPage.locator('[data-issue="mvr:2:0"]').waitFor();
        await expectCount(patchPage.locator('[data-issue="patch:source"]'), 0);
        expect(await patchPage.locator("#patch-status").textContent()).toMatch(/reference · [1-9]/);

        expect(await patchPage.locator("#feed-status").getAttribute("data-status")).toBe("live");
        await patchPage.locator("#ownership-status", { hasText: "owner" }).waitFor();
      } finally {
        await patchPage.close();
        // Bridge shutdown occasionally ignores SIGTERM; SIGKILL always lands.
        patchBridge.kill("SIGTERM");
        const exited = await Promise.race([
          patchBridge.exited.then(() => true),
          Bun.sleep(5_000).then(() => false),
        ]);
        if (!exited) {
          patchBridge.kill("SIGKILL");
          await patchBridge.exited;
        }
        rmSync(watchDir, { recursive: true, force: true });
      }
    },
    BROWSER_TEST_TIMEOUT,
  );
  test(
    "ingests the committed MVR and dropped bytes without a third-party tool",
    async () => {
      const build = Bun.spawnSync(["bun", "run", "build"], {
        cwd: repository,
        stdout: "ignore",
        stderr: "pipe",
      });
      if (!build.success) throw new Error(build.stderr.toString());
      const watchDir = mkdtempSync(join(tmpdir(), "beamhouse-mvr-"));
      const watchHttp = await freeTcpPort();
      const watchSacn = await freeUdpPort();
      const watchArtnet = await freeUdpPort();
      const mvrBridge = Bun.spawn(["bun", "src/main.ts"], {
        cwd: resolve(repository, "bridge"),
        env: {
          ...process.env,
          BEAMHOUSE_HOST: "127.0.0.1",
          BEAMHOUSE_PORT: String(watchHttp),
          BEAMHOUSE_SACN_PORT: String(watchSacn),
          BEAMHOUSE_ARTNET_PORT: String(watchArtnet),
          BEAMHOUSE_WATCH_DIR: watchDir,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const mvrPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      try {
        await waitUntilReachable(`http://127.0.0.1:${watchHttp}`, mvrBridge);
        await mvrPage.goto(`http://127.0.0.1:${watchHttp}`, { waitUntil: "domcontentloaded" });
        await mvrPage.locator('html[data-ready="true"]').waitFor();
        await mvrPage.locator("#ownership-status", { hasText: "owner" }).waitFor();
        // The seeded override for id 22 must survive the ingest below.
        await seedWorkingScene(mvrPage);
        await mvrPage.reload({ waitUntil: "domcontentloaded" });
        await mvrPage.locator('html[data-ready="true"]').waitFor();

        // The committed representative MVR loads off the watched path.
        writeFileSync(
          resolve(watchDir, "rig.mvr"),
          readFileSync(resolve(repository, "tests/fixtures/beamhouse-representative.mvr")),
        );
        await openFixturesOn(mvrPage);
        await mvrPage.locator('[data-local-fixture="21"]').waitFor();
        await mvrPage.locator('[data-local-fixture="12"]').waitFor();
        await mvrPage
          .locator('[data-local-fixture="1000"][data-marks*="synthesized id"]')
          .waitFor();
        await mvrPage
          .locator('[data-local-fixture="22"][data-marks*="extension repaired"]')
          .waitFor();
        await mvrPage
          .locator('[data-local-fixture="21"][data-uuid="aaaaaaaa-0000-4000-8000-000000000001"]')
          .waitFor();
        await mvrPage.locator('[data-local-fixture="21"][data-revision]').waitFor();
        // The MVR starting placement lands in metres; the seeded override wins.
        await mvrPage.locator('[data-local-fixture="21"]').click();
        await mvrPage.locator('[data-placement-x="2.4"]').waitFor();
        await mvrPage.locator('[data-local-fixture="22"]').click();
        await mvrPage.locator('[data-placement-x="7.5"]').waitFor();
        // Objects keep their positive ladder ids in the Objects filter.
        await mvrPage.locator('[data-overlay-tab="objects"]').click();
        await mvrPage.locator('[data-scene-objects] [data-local-fixture="6"]').waitFor();
        await mvrPage.locator('[data-scene-objects] [data-local-fixture="11"]').waitFor();
        // Every repair is an Issues row: 7 provenance rows plus 6 unresolved-definition rows.
        await mvrPage.locator('[data-overlay-tab="issues"]').click();
        await expectCount(mvrPage.locator('[data-issue^="mvr:"]'), 7);
        await expectCount(mvrPage.locator("[data-issue]"), 16);
        await mvrPage.locator('[data-issue="mvr:23:1"][data-issue]').waitFor();
        await mvrPage.locator('[data-overlay-tab="fixtures"]').click();
        await expectPatchContribution(mvrPage, 22);

        // Dropped bytes reach the same parser and replace the patch wholesale.
        const dropped = Buffer.from(dropMvrBytes()).toString("base64");
        await mvrPage.evaluate((payload: string) => {
          const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
          const file = new File([bytes], "drop.mvr");
          const transfer = new DataTransfer();
          transfer.items.add(file);
          document.dispatchEvent(
            new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
          );
        }, dropped);
        await mvrPage.locator('[data-overlay-tab="fixtures"]').click();
        await mvrPage.locator('[data-local-fixture="40"][data-mode="Nope"]').waitFor();
        await mvrPage
          .locator('[data-local-fixture="40"][data-marks*="without a DMX binding"]')
          .waitFor();
        await mvrPage.locator('[data-local-fixture="1"]').waitFor({ state: "detached" });
        await mvrPage.locator('[data-local-fixture="6"]').waitFor({ state: "detached" });
        await mvrPage.locator('[data-overlay-tab="issues"]').click();
        await mvrPage.locator('[data-issue="mvr:40:0"]').waitFor();

        // A dropped MVR whose fixture and object ids collide with the reference
        // rig (house fixture 1, spoke 101) ingests: the same-id reference entries are
        // shadowed and the collisions surface as marks, never a parse failure.
        const shadowed = Buffer.from(shadowMvrBytes()).toString("base64");
        await mvrPage.evaluate((payload: string) => {
          const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
          const file = new File([bytes], "shadow.mvr");
          const transfer = new DataTransfer();
          transfer.items.add(file);
          document.dispatchEvent(
            new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
          );
        }, shadowed);
        // One row per id: the fixture list and the Objects filter each carry the
        // shadowing entry exactly once, and the earlier drop patch (id 40) is gone.
        await mvrPage.locator('[data-overlay-tab="fixtures"]').click();
        await mvrPage
          .locator('[data-local-fixture="1"][data-marks*="shadows the reference rig"]')
          .waitFor();
        await expectCount(mvrPage.locator('[data-local-fixture="1"]'), 1);
        await mvrPage.locator('[data-local-fixture="40"]').waitFor({ state: "detached" });
        await mvrPage.locator('[data-overlay-tab="objects"]').click();
        await mvrPage
          .locator(
            '[data-scene-objects] [data-local-fixture="101"][data-marks*="shadows the reference rig"]',
          )
          .waitFor();
        // Shadowed ids are issue rows; the source never claims a parse lie.
        await mvrPage.locator('[data-overlay-tab="issues"]').click();
        await mvrPage.locator('[data-issue="mvr:1:0"]').waitFor();
        await mvrPage.locator('[data-issue="mvr:101:0"]').waitFor();
        await expectCount(mvrPage.locator('[data-issue="patch:source"]'), 0);
        expect(await mvrPage.locator("#patch-status").textContent()).toMatch(/reference · [1-9]/);

        expect(await mvrPage.locator("#feed-status").getAttribute("data-status")).toBe("live");
        await mvrPage.locator("#ownership-status", { hasText: "owner" }).waitFor();
      } finally {
        await mvrPage.close();
        mvrBridge.kill("SIGTERM");
        const exited = await Promise.race([
          mvrBridge.exited.then(() => true),
          Bun.sleep(5_000).then(() => false),
        ]);
        if (!exited) {
          mvrBridge.kill("SIGKILL");
          await mvrBridge.exited;
        }
        rmSync(watchDir, { recursive: true, force: true });
      }
    },
    BROWSER_HEAVY_TIMEOUT,
  );
  test(
    "renders volumetric beams and ground pools from movers, strobe, zoom and OFL",
    async () => {
      await openFixtures();
      const moverId = await injectGdtf("GLP@impression 90 RGB@v1.gdtf");
      // Six reference movers plus one authored tungsten load on universe 9.
      for (let index = 0; index < 6; index += 1)
        await addLocalFixture(moverId, "Normal", 9, 1 + index * 14, 14);
      const parId = await injectGdtf("Beamhouse@generic PAR38@v1.gdtf");
      await addLocalFixture(parId, "Dimmer", 9, 100, 1);
      await page.evaluate(
        ([sole, matrix]: unknown[]) => {
          const hook = (window as unknown as Record<string, unknown>)["__beamhouseRegisterOfl"] as (
            id: string,
            definition: unknown,
          ) => { definition: string };
          hook("ofl:test:beam-sole", sole);
          hook("ofl:test:beam-matrix", matrix);
        },
        [BEAM_SOLE_SPOT, PRODUCT_BAR],
      );
      await addLocalFixture("ofl:test:beam-sole", "Spot", 9, 110, 2);
      await addLocalFixture("ofl:test:beam-matrix", "6px RGB", 9, 120, 18);
      // Break-scoped rows: earlier tests leave their own fixtures behind.
      const rowId = async (breakText: string): Promise<number> =>
        Number(
          await page
            .locator("[data-local-fixture]", { hasText: breakText })
            .first()
            .getAttribute("data-local-fixture"),
        );
      const mover1 = await rowId("9.001");
      const par = await rowId("9.100");
      const soleId = await rowId("9.110");
      const barId = await rowId("9.120");
      const row = (id: number): string => `[data-local-fixture="${id}"]`;
      const moverFrame = (): number[] => {
        const slots = new Array<number>(140).fill(0);
        for (let index = 0; index < 6; index += 1) {
          const base = index * 14;
          // Pan 0, tilt full (aimed down), red, shutter open, dimmer full.
          slots.splice(base, 14, 0, 0, 255, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0);
        }
        slots[99] = 26;
        slots[109] = 255;
        slots[110] = 255;
        for (let index = 119; index < 137; index += 1) slots[index] = 255;
        return slots;
      };
      const cones = () => page.locator("#viewport").getAttribute("data-fixture-cones");
      const pools = () => page.locator("#viewport").getAttribute("data-beam-pools");
      const cones0 = Number((await cones()) ?? 0);
      const pools0 = Number((await pools()) ?? 0);
      const frame = moverFrame();
      let sequence = 1;
      await sendUdp(sacn(sequence++, frame, 0, 9), sacnPort);
      await page.waitForFunction(
        (id: number) =>
          document
            .querySelector(`[data-local-fixture="${id}"]`)
            ?.getAttribute("data-local-level") === "255",
        mover1,
      );
      // Six mover cones plus tungsten and sole-spot cones; every down-aimed
      // beam lands a ground pool.
      await page.waitForFunction(
        (count: number) =>
          document.querySelector("#viewport")?.getAttribute("data-fixture-cones") === String(count),
        cones0 + 8,
      );
      expect(await cones()).toBe(String(cones0 + 8));
      expect(await pools()).toBe(String(pools0 + 6));
      // Motion: the first mover pans across the rig, cones unchanged.
      frame[0] = 255;
      frame[1] = 255;
      await sendUdp(sacn(sequence++, frame, 0, 9), sacnPort);
      await page.waitForFunction(
        (id: number) =>
          document.querySelector(`[data-local-fixture="${id}"]`)?.getAttribute("data-pan") ===
          "330.0",
        mover1,
      );
      expect(await cones()).toBe(String(cones0 + 8));
      // Strobe reads lit; a closed shutter gates one cone and its pool.
      frame[8] = 100;
      await sendUdp(sacn(sequence++, frame, 0, 9), sacnPort);
      await page.waitForFunction(
        (id: number) =>
          document
            .querySelector(`[data-local-fixture="${id}"]`)
            ?.getAttribute("data-local-level") === "255",
        mover1,
      );
      expect(await cones()).toBe(String(cones0 + 8));
      frame[8] = 0;
      await sendUdp(sacn(sequence++, frame, 0, 9), sacnPort);
      await page.waitForFunction(
        ([count]: [number]) =>
          document.querySelector("#viewport")?.getAttribute("data-fixture-cones") === String(count),
        [cones0 + 7] as [number],
      );
      expect(await pools()).toBe(String(pools0 + 5));
      // The intensity map hides cones; pools render unchanged.
      await page.locator("[data-render-toggle]").click();
      await page.locator('#viewport[data-render-mode="intensity"]').waitFor();
      expect(await cones()).toBe("0");
      expect(await pools()).toBe(String(pools0 + 5));
      await page.locator("[data-render-toggle]").click();
      await page.locator('#viewport[data-render-mode="live"]').waitFor();
      frame[8] = 255;
      await sendUdp(sacn(sequence, frame, 0, 9), sacnPort);
      await page.waitForFunction(
        ([count]: [number]) =>
          document.querySelector("#viewport")?.getAttribute("data-fixture-cones") === String(count),
        [cones0 + 8] as [number],
      );
      // Tungsten at ~10%: warm drift on a declared cone.
      expect(await page.locator(row(par)).getAttribute("data-beam")).toBe("cone 60.0");
      const warm = ((await page.locator(row(par)).getAttribute("data-color")) ?? "")
        .split(",")
        .map(Number);
      expect(warm[0] ?? 0).toBeGreaterThan(200);
      expect((warm[0] ?? 0) - (warm[2] ?? 0)).toBeGreaterThan(150);
      // OFL sole emitter draws a cone; matrix pixels stay on the strip path.
      expect(await page.locator(row(soleId)).getAttribute("data-beam")).toBe("cone 8.0");
      expect(await page.locator(row(barId)).getAttribute("data-beam")).toBe("glow 0.0");
      expect(await cones()).toBe(String(cones0 + 8));
      expect(await pools()).toBe(String(pools0 + 6));
      // X4 zoom instrument: resolved zoom drives the cone angle.
      const x4Id = await injectThirdPartyMover();
      await addLocalFixture(x4Id, "Mover", 10, 1, 9);
      const x4 = await rowId("10.001");
      await sendUdp(sacn(1, [0, 0, 0, 128, 255, 0, 0, 255, 255], 0, 10), sacnPort);
      await page.waitForFunction(
        (id: number) =>
          document.querySelector(`[data-local-fixture="${id}"]`)?.getAttribute("data-zoom") ===
          "28.4",
        x4,
      );
      expect(await page.locator(row(x4)).getAttribute("data-beam")).toBe("cone 28.4");
      expect(await cones()).toBe(String(cones0 + 9));
      expect(await pools()).toBe(String(pools0 + 7));
    },
    BROWSER_HEAVY_TIMEOUT,
  );
});
async function injectGdtf(filename: string): Promise<string> {
  const base64 = Buffer.from(
    readFileSync(resolve(repository, "definitions/authored", filename)),
  ).toString("base64");
  const loaded = await page.evaluate((payload: string) => {
    const hook = (window as unknown as Record<string, unknown>)["__beamhouseLoadGdtf"] as (
      archive: string,
    ) => Promise<{ definition: string; source: string }>;
    return hook(payload);
  }, base64);
  return loaded.definition;
}

async function addLocalFixture(
  definition: string,
  mode: string,
  universe: number,
  address: number,
  footprint: number,
): Promise<void> {
  await page.locator("[data-local-definition-source]").selectOption("existing");
  await page.locator("[data-local-definition]").fill(definition);
  await page.locator("[data-local-mode]").fill(mode);
  await page.locator("[data-local-universe]").fill(String(universe));
  await page.locator("[data-local-address]").fill(String(address));
  await page.locator("[data-local-footprint]").fill(String(footprint));
  await page.locator("[data-local-breaks]").fill("");
  await page.locator("[data-local-add]").click();
}

const BEAM_SOLE_SPOT = {
  name: "Beam Sole Spot",
  physical: {
    dimensions: { width: 200, height: 300, depth: 200 },
    lens: { degreesMinMax: [8, 8] },
  },
  templateChannels: {
    Dimmer: { capability: { type: "Intensity" } },
    Shutter: {
      capabilities: [
        { type: "Shutter", shutterEffect: "Closed", dmxRange: [0, 10] },
        { type: "Shutter", shutterEffect: "Strobe", dmxRange: [11, 255] },
      ],
    },
  },
  modes: [{ name: "Spot", channels: ["Dimmer", "Shutter"] }],
};

const PRODUCT_BAR = {
  name: "Product Bar 6px",
  physical: { dimensions: { width: 1200, height: 100, depth: 50 } },
  matrix: { pixelCount: [6, 1, 1] },
  templateChannels: {
    "Red $pixelKey": {
      capability: {
        type: "ColorIntensity",
        color: "Red",
        brightnessStart: "off",
        brightnessEnd: "bright",
      },
    },
    "Green $pixelKey": {
      capability: {
        type: "ColorIntensity",
        color: "Green",
        brightnessStart: "off",
        brightnessEnd: "bright",
      },
    },
    "Blue $pixelKey": {
      capability: {
        type: "ColorIntensity",
        color: "Blue",
        brightnessStart: "off",
        brightnessEnd: "bright",
      },
    },
  },
  modes: [{ name: "6px RGB", channels: ["Red $pixelKey", "Green $pixelKey", "Blue $pixelKey"] }],
};

const MOVER_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<GDTF DataVersion="1.2">',
  '  <FixtureType FixtureTypeID="third-party-x4-shape" Manufacturer="Third Party" Name="x4-shape">',
  "    <AttributeDefinitions><Attributes>",
  '      <Attribute Name="Pan" PhysicalUnit="Angle"/>',
  '      <Attribute Name="Tilt" PhysicalUnit="Angle"/>',
  '      <Attribute Name="Zoom" PhysicalUnit="Angle"/>',
  '      <Attribute Name="ColorAdd_R" PhysicalUnit="ColorComponent"/>',
  '      <Attribute Name="ColorAdd_G" PhysicalUnit="ColorComponent"/>',
  '      <Attribute Name="ColorAdd_B" PhysicalUnit="ColorComponent"/>',
  '      <Attribute Name="Dimmer" PhysicalUnit="None"/>',
  '      <Attribute Name="Shutter1" PhysicalUnit="None"/>',
  "    </Attributes></AttributeDefinitions>",
  "    <Models>",
  '      <Model Name="Body" PrimitiveType="Cube" Length="0.2" Width="0.2" Height="0.2" File=""/>',
  '      <Model Name="Lens" PrimitiveType="Cylinder" Length="0.1" Width="0.1" Height="0.02" File=""/>',
  "    </Models>",
  "    <Geometries>",
  '      <Geometry Model="Body" Name="Base" Position="{1,0,0,0}{0,1,0,0}{0,0,1,0}{0,0,0,1}">',
  '        <Beam BeamAngle="25" FieldAngle="25" BeamType="Wash" LampType="LED" ColorTemperature="5600" Model="Lens" Name="Beam" Position="{1,0,0,0}{0,1,0,0}{0,0,1,0}{0,0,0,1}"/>',
  "      </Geometry>",
  "    </Geometries>",
  "    <DMXModes><DMXMode Geometry=",
  '"Base" Name="Mover"><DMXChannels>',
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="1,2">',
  '        <LogicalChannel Attribute="Pan">',
  '          <ChannelFunction Attribute="Pan" Name="Pan" DMXFrom="0/2" PhysicalFrom="311" PhysicalTo="-311"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="3">',
  '        <LogicalChannel Attribute="Tilt">',
  '          <ChannelFunction Attribute="Tilt" Name="Tilt" DMXFrom="0/1" PhysicalFrom="121" PhysicalTo="-121"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="4">',
  '        <LogicalChannel Attribute="Zoom">',
  '          <ChannelFunction Attribute="Zoom" Name="Zoom" DMXFrom="0/1" PhysicalFrom="50" PhysicalTo="7"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="5">',
  '        <LogicalChannel Attribute="ColorAdd_R">',
  '          <ChannelFunction Attribute="ColorAdd_R" Name="Red" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="6">',
  '        <LogicalChannel Attribute="ColorAdd_G">',
  '          <ChannelFunction Attribute="ColorAdd_G" Name="Green" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="7">',
  '        <LogicalChannel Attribute="ColorAdd_B">',
  '          <ChannelFunction Attribute="ColorAdd_B" Name="Blue" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="8">',
  '        <LogicalChannel Attribute="Dimmer">',
  '          <ChannelFunction Attribute="Dimmer" Name="Dimmer" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  '      <DMXChannel DMXBreak="1" Geometry="Base" Offset="9">',
  '        <LogicalChannel Attribute="Shutter1">',
  '          <ChannelFunction Attribute="Shutter1" Name="Closed" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="0"/>',
  '          <ChannelFunction Attribute="Shutter1" Name="Open" DMXFrom="224/1" PhysicalFrom="1" PhysicalTo="1"/>',
  "        </LogicalChannel>",
  "      </DMXChannel>",
  "    </DMXChannels></DMXMode></DMXModes>",
  "    <Revisions/>",
  "  </FixtureType>",
  "</GDTF>",
].join("\n");

async function injectThirdPartyMover(): Promise<string> {
  const base64 = Buffer.from(
    storedZip("description.xml", new TextEncoder().encode(MOVER_XML)),
  ).toString("base64");
  const loaded = await page.evaluate((payload: string) => {
    const hook = (window as unknown as Record<string, unknown>)["__beamhouseLoadGdtf"] as (
      archive: string,
    ) => Promise<{ definition: string; source: string }>;
    return hook(payload);
  }, base64);
  return loaded.definition;
}

const CRC_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256);
  for (let value = 0; value < 256; value += 1) {
    let entry = value;
    for (let round = 0; round < 8; round += 1)
      entry = entry & 1 ? 0xedb88320 ^ (entry >>> 1) : entry >>> 1;
    table[value] = entry >>> 0;
  }
  return table;
})();

/** Minimal stored (uncompressed) zip: dependency-free GDTF bytes for product proof. */
function storedZip(name: string, data: Uint8Array): Uint8Array {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  const checksum = (crc ^ 0xffffffff) >>> 0;
  const nameBytes = new TextEncoder().encode(name);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(8, 0, true);
  local.setUint32(14, checksum, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, nameBytes.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint32(16, checksum, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, data.length, true);
  central.setUint16(28, nameBytes.length, true);
  central.setUint32(42, 0, true);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + nameBytes.length, true);
  end.setUint32(16, 30 + nameBytes.length + data.length, true);
  const out = new Uint8Array(30 + nameBytes.length + data.length + 46 + nameBytes.length + 22);
  out.set(new Uint8Array(local.buffer), 0);
  out.set(nameBytes, 30);
  out.set(data, 30 + nameBytes.length);
  out.set(new Uint8Array(central.buffer), 30 + nameBytes.length + data.length);
  out.set(nameBytes, 30 + nameBytes.length + data.length + 46);
  out.set(new Uint8Array(end.buffer), 30 + nameBytes.length + data.length + 46 + nameBytes.length);
  return out;
}

/** Minimal multi-file stored zip for drop-path MVR bytes. */
function mvrZipFiles(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    let crc = 0xffffffff;
    for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    const checksum = (crc ^ 0xffffffff) >>> 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0, true);
    entry.setUint16(10, 0, true);
    entry.setUint32(16, checksum, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directorySize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let cursor = 0;
  for (const part of [...chunks, ...central, new Uint8Array(end.buffer)]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** Dropped bytes with a genuine mode mismatch: two modes, neither named. */
function dropMvrBytes(): Uint8Array {
  const channel = (offset: string, dmxBreak: number): string =>
    `<DMXChannel Geometry="Body" Offset="${offset}" DMXBreak="${dmxBreak}"><LogicalChannel Attribute="Dimmer"><ChannelFunction Name="Dim" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Default="0/1"/></LogicalChannel></DMXChannel>`;
  const gdtf =
    `<GDTF DataVersion="1.2"><FixtureType FixtureTypeID="DDDDDDDD-0000-4000-8000-000000000000" Manufacturer="Test" Name="Drop">` +
    `<Revisions><Revision Text="drop-rev"/></Revisions>` +
    `<AttributeDefinitions><ActivationGroups/><FeatureGroups/><Attributes><Attribute Name="Dimmer" PhysicalUnit="Percent"/></Attributes></AttributeDefinitions>` +
    `<DMXModes><DMXMode Name="Alpha" Geometry="Body"><DMXChannels>${channel("1", 1)}</DMXChannels></DMXMode>` +
    `<DMXMode Name="Beta" Geometry="Body"><DMXChannels>${channel("1", 1)}${channel("2", 2)}</DMXChannels></DMXMode></DMXModes>` +
    `</FixtureType></GDTF>`;
  const scene =
    `<GeneralSceneDescription verMajor="1" verMinor="6"><Layers>` +
    `<Layer uuid="44444444-4444-4444-8444-444444444444" name="Drop"><ChildList>` +
    `<Fixture uuid="55555555-5555-4555-8555-555555555555" name="Dropped"><Matrix>1 0 0 0 1 0 0 0 1 1000 0 0</Matrix>` +
    `<GDTFSpec value="drop.gdtf"/><GDTFMode value="Nope"/><FixtureIDNumeric value="40"/>` +
    `<Addresses><Address Break="1">4.4</Address></Addresses></Fixture></ChildList></Layer></Layers></GeneralSceneDescription>`;
  return mvrZipFiles({
    "GeneralSceneDescription.xml": new TextEncoder().encode(scene),
    "drop.gdtf": mvrZipFiles({ "description.xml": new TextEncoder().encode(gdtf) }),
  });
}

/** Colliding ids: a fixture on reference fixture 1 and a scene object on spoke 101. */
function shadowMvrBytes(): Uint8Array {
  const channel = (offset: string, dmxBreak: number): string =>
    `<DMXChannel Geometry="Body" Offset="${offset}" DMXBreak="${dmxBreak}"><LogicalChannel Attribute="Dimmer"><ChannelFunction Name="Dim" DMXFrom="0/1" PhysicalFrom="0" PhysicalTo="1" Default="0/1"/></LogicalChannel></DMXChannel>`;
  const gdtf =
    `<GDTF DataVersion="1.2"><FixtureType FixtureTypeID="EEEEEEEE-0000-4000-8000-000000000000" Manufacturer="Test" Name="Shadow">` +
    `<Revisions><Revision Text="shadow-rev"/></Revisions>` +
    `<AttributeDefinitions><ActivationGroups/><FeatureGroups/><Attributes><Attribute Name="Dimmer" PhysicalUnit="Percent"/></Attributes></AttributeDefinitions>` +
    `<DMXModes><DMXMode Name="Alpha" Geometry="Body"><DMXChannels>${channel("1", 1)}</DMXChannels></DMXMode></DMXModes>` +
    `</FixtureType></GDTF>`;
  const scene =
    `<GeneralSceneDescription verMajor="1" verMinor="6"><Layers>` +
    `<Layer uuid="66666666-6666-4666-8666-666666666666" name="Shadow"><ChildList>` +
    `<Fixture uuid="77777777-7777-4777-8777-777777777777" name="Cube Shadow"><Matrix>1 0 0 0 1 0 0 0 1 0 0 0</Matrix>` +
    `<GDTFSpec value="shadow.gdtf"/><GDTFMode value="Alpha"/><FixtureIDNumeric value="1"/>` +
    `<Addresses><Address Break="1">4.30</Address></Addresses></Fixture>` +
    `<SceneObject uuid="88888888-8888-4888-8888-888888888888" name="Spoke Shadow">` +
    `<Matrix>1 0 0 0 1 0 0 0 1 0 0 0</Matrix><FixtureIDNumeric value="101"/>` +
    `</SceneObject></ChildList></Layer></Layers></GeneralSceneDescription>`;
  return mvrZipFiles({
    "GeneralSceneDescription.xml": new TextEncoder().encode(scene),
    "shadow.gdtf": mvrZipFiles({ "description.xml": new TextEncoder().encode(gdtf) }),
  });
}

async function canvasColorSamples(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const screenshot = await page.locator("#viewport canvas").screenshot();
  return page.evaluate(
    async ({ encoded, start, end }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await new Promise<void>((done, reject) => {
        image.addEventListener("load", () => done(), { once: true });
        image.addEventListener(
          "error",
          () => reject(new Error("could not decode viewport screenshot")),
          {
            once: true,
          },
        );
      });
      const copy = document.createElement("canvas");
      copy.width = image.width;
      copy.height = image.height;
      const context = copy.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("could not read viewport canvas");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
      const sampleRegion = (centerX: number, centerY: number) => {
        let bestGreen = 0;
        let bestBlue = 0;
        const xCenter = Math.round(centerX);
        const yCenter = Math.round(centerY);
        for (let y = yCenter - 12; y <= yCenter + 12; y += 1) {
          for (let x = xCenter - 12; x <= xCenter + 12; x += 1) {
            const offset = (y * copy.width + x) * 4;
            const red = pixels[offset] ?? 0;
            const green = pixels[offset + 1] ?? 0;
            const blue = pixels[offset + 2] ?? 0;
            bestGreen = Math.max(bestGreen, green - red);
            bestBlue = Math.max(bestBlue, blue - red);
          }
        }
        return { bestGreen, bestBlue };
      };
      let coloredPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (Math.max(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!) > 45) {
          coloredPixels += 1;
        }
      }
      return {
        coloredPixels,
        inner: sampleRegion(start.x, start.y),
        outer: sampleRegion(end.x, end.y),
      };
    },
    { encoded: screenshot.toString("base64"), start, end },
  );
}

async function openFixturesOn(target: Page): Promise<void> {
  await target.locator('[data-chip-tab="fixtures"]').first().click();
  await target.locator("[data-overlay]").waitFor({ state: "visible" });
}

async function openFixtures(): Promise<void> {
  await page.locator('[data-chip-tab="fixtures"]').first().click();
  await page.locator('[data-overlay-panel="fixtures"]').waitFor();
}

async function openUniverses(): Promise<void> {
  await page.locator('[data-chip-tab="universes"]').first().click();
  await page.locator('[data-overlay-panel="universes"]').waitFor();
}

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

async function workingPlacementX(target: Page, fixtureId: number): Promise<number | null> {
  return target.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("beamhouse.scene.v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("could not open working scene"));
    });
    try {
      const scene = await new Promise<
        { overrides?: Record<string, { position?: number[] }> } | undefined
      >((resolve, reject) => {
        const request = database
          .transaction("working-scenes")
          .objectStore("working-scenes")
          .get("current") as IDBRequest<
          { overrides?: Record<string, { position?: number[] }> } | undefined
        >;
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("could not read working scene"));
      });
      return scene?.overrides?.[String(id)]?.position?.[0] ?? null;
    } finally {
      database.close();
    }
  }, fixtureId);
}

async function writeWorkingPlacement(target: Page, fixtureId: number, x: number): Promise<void> {
  await target.evaluate(
    async ({ id, positionX }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("beamhouse.scene.v1", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("could not open working scene"));
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const request = database
            .transaction("working-scenes", "readwrite")
            .objectStore("working-scenes")
            .put(
              {
                overrides: {
                  [String(id)]: { position: [positionX, 0, 0], rotation: [0, 0, 0] },
                },
                views: {},
                arrays: {},
                definitions: {},
                fixtures: {},
              },
              "current",
            );
          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(request.error ?? new Error("could not seed working scene"));
        });
      } finally {
        database.close();
      }
    },
    { id: fixtureId, positionX: x },
  );
}

function sacn(sequence: number, values: number[], options = 0, universe = 1): Uint8Array {
  const payload = Object.fromEntries(values.map((value, index) => [index + 1, value]));
  const packet = new Packet({
    universe,
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

async function waitUntilReachable(url: string, owner: Bun.Subprocess = bridge): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (owner.exitCode !== null) {
      throw new Error(`bridge exited early with ${owner.exitCode}`);
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

type MizerRow = [
  id: number,
  name: string,
  fixture: string,
  mode: string,
  universe: number,
  channel: number,
];

function mizerProject(rows: MizerRow[]): string {
  const body = rows
    .map(
      ([id, name, fixture, mode, universe, channel]) =>
        `  - id: ${id}\n    name: ${name}\n    fixture: "${fixture}"\n    mode: ${mode}\n    universe: ${universe}\n    channel: ${channel}`,
    )
    .join("\n");
  return `version: 6\nfixtures:\n${body}\n`;
}

async function seedWorkingScene(target: Page): Promise<void> {
  await target.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolveDatabase, rejectDatabase) => {
      const request = indexedDB.open("beamhouse.scene.v1", 1);
      request.onsuccess = () => resolveDatabase(request.result);
      request.onerror = () =>
        rejectDatabase(request.error ?? new Error("could not open working scene"));
    });
    try {
      await new Promise<void>((resolvePut, rejectPut) => {
        const request = database
          .transaction("working-scenes", "readwrite")
          .objectStore("working-scenes")
          .put(
            {
              overrides: { 22: { position: [7.5, 0, 0], rotation: [0, 0, 0] } },
              views: { booth: { position: [0, 2, 6], target: [0, 1, 0] } },
              arrays: {
                "seed-array": {
                  kind: "radial",
                  id: "seed-array",
                  memberIds: [22],
                  center: [0, 3, 0],
                  radius: 0.75,
                  startAngleDeg: 0,
                  stepDeg: 360,
                },
              },
              definitions: {
                "bhs:seed": {
                  kind: "strip",
                  pixels: 4,
                  pitchMm: 25,
                  channelsPerPixel: 3,
                  primitive: "Cube",
                },
              },
              fixtures: {
                "-1": {
                  id: -1,
                  definition: "bhs:seed",
                  mode: "default",
                  addresses: [{ universe: 4, address: 1, footprint: 12 }],
                },
                "-2": { id: -2, definition: "bhs:seed", mode: "", addresses: [] },
              },
              patchPath: null,
              patch: {},
            },
            "current",
          );
        request.onsuccess = () => resolvePut();
        request.onerror = () =>
          rejectPut(request.error ?? new Error("could not seed working scene"));
      });
    } finally {
      database.close();
    }
  });
}

async function expectPatchContribution(target: Page, fixtureId = 22): Promise<void> {
  await target.locator(`[data-local-fixture="${fixtureId}"]`).click();
  await target.locator('[data-placement-x="7.5"]').waitFor();
  await expectCount(target.locator('[data-local-fixture="-1"]'), 1);
  await target.locator("[data-array-status]", { hasText: "seed-array" }).waitFor();
  await target.locator('[data-camera-view="booth"]').waitFor();
  await target.locator('[data-overlay-tab="objects"]').click();
  await target.locator('[data-scene-objects] [data-local-fixture="-2"]').waitFor();
  await target.locator('[data-overlay-tab="fixtures"]').click();
}
