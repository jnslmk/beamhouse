import { expect, test } from "bun:test";
import type { Server } from "bun";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";

declare global {
  interface Window {
    __diffuserTestSetPixels?: (rgb: number[], resolved: boolean) => void;
  }
}

// Exercise the real Three material, scalar/RGB update paths, and GPU shader together.
test("CAD diffusers retain dim RGB hue, white off regions and smooth spatial transitions", async () => {
  const repository = resolve(import.meta.dir, "..");
  mkdirSync(join(repository, ".codex-tmp"), { recursive: true });
  const directory = mkdtempSync(join(repository, ".codex-tmp/diffuser-render-"));
  let browser: Browser | null = null;
  let server: Server<undefined> | null = null;
  try {
    const entry = join(directory, "entry.ts");
    writeFileSync(
      entry,
      `
      import * as THREE from "three";
      import { createViewport } from "../../app/src/viewport.ts";
      const api = createViewport(document.querySelector("#viewport"), [], [], [], [], undefined, undefined, false);
      api.setGroundVisible(false);
      const body = new THREE.Group();
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 0.08), new THREE.MeshStandardMaterial({color: 0x252525}));
      housing.position.y = 0.09;
      body.add(housing);
      const diffuser = new THREE.Group();
      diffuser.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), new THREE.MeshStandardMaterial()));
      api.defineStripTemplate("bhs:diffuser", body, diffuser);
      api.setSceneFixtures([{id: 1, definition: "bhs:diffuser", mode: "default", addresses: [{universe: 1, address: 1, footprint: 9}]}], {
        "bhs:diffuser": {kind: "strip", pixels: 3, pitchMm: 1000 / 3, channelsPerPixel: 3, primitive: "Cube"}
      });
      api.setCameraView({position: [0, 0.5, 4], target: [0, 0.5, 0]});
      window.__diffuserTestSetPixels = (rgb, resolved) => {
        api.setSceneFixtureLevels(new Map([[1, Math.max(...rgb)]]));
        if (resolved) {
          api.setSceneFixtureStates(new Map([[1, {
            status: "ok", unbound: false, panDeg: 0, tiltDeg: 0, zoomDeg: null,
            color: [1, 1, 1], level: Math.max(...rgb) / 255, shutterOpen: true,
            beam: {kind: "glow", angleDeg: 0}, pixels: rgb.map((value) => value / 255),
            bodySize: [1, 0.08, 0.08], notes: []
          }]]));
        } else {
          api.setSceneFixturePixels(new Map([[1, Uint8Array.from(rgb)]]));
        }
      };
      window.__diffuserTestSetPixels(new Array(9).fill(0), false);
    `,
    );
    // Resolve workspace packages before entering Bun's build hooks.
    const modules: Record<string, string> = {
      three: Bun.resolveSync("three", join(repository, "app")),
      "gdtf-ts": Bun.resolveSync("gdtf-ts", join(repository, "app")),
      fflate: Bun.resolveSync("fflate/browser", join(repository, "packages/gdtf-ts")),
    };
    const threeDirectory = dirname(dirname(modules.three!));
    const bundle = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      plugins: [
        {
          name: "workspace-modules",
          setup(build) {
            build.onResolve(
              { filter: /^(three(?:\/addons\/.*)?|gdtf-ts|fflate)$/ },
              ({ path }) => ({
                path: path.startsWith("three/addons/")
                  ? join(threeDirectory, "examples/jsm", path.slice("three/addons/".length))
                  : modules[path]!,
              }),
            );
          },
        },
      ],
    });
    if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
    const javascript = await bundle.outputs[0]!.text();
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        return new URL(request.url).pathname === "/entry.js"
          ? new Response(javascript, { headers: { "content-type": "application/javascript" } })
          : new Response(
              '<html><body style="margin:0"><div id="viewport" style="width:480px;height:320px"></div><script type="module" src="/entry.js"></script></body></html>',
              { headers: { "content-type": "text/html" } },
            );
      },
    });
    browser = await chromium.launch({
      executablePath:
        process.env.CHROMIUM_PATH ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : chromium.executablePath()),
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
    });
    const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(String(server.url));
    await page.waitForFunction(() => typeof window.__diffuserTestSetPixels === "function");
    const sample = async (pixels: number[][], resolved: boolean) => {
      await page.evaluate(
        ({ rgb, resolved }) => {
          if (!window.__diffuserTestSetPixels) throw new Error("diffuser test entry is not ready");
          window.__diffuserTestSetPixels(rgb, resolved);
        },
        { rgb: pixels.flat(), resolved },
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const screenshot = await page.locator("canvas").screenshot();
      return page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const profile = Array.from({ length: 79 }, (_, index) =>
          Array.from(
            context.getImageData(201 + index, Math.floor(canvas.height / 2), 1, 1).data,
          ).slice(0, 3),
        );
        // Projected texel centres for the fixed camera and one-metre CAD diffuser.
        return { centres: [profile[0]!, profile[39]!, profile[78]!], profile };
      }, screenshot.toString("base64"));
    };
    const colors = [
      [0, 1, 1], // cyan
      [1, 0, 0], // red
      [1, 0, 1], // magenta
    ];
    const difference = (left: number[], right: number[]) =>
      Math.max(...left.map((channel, index) => Math.abs(channel - right[index]!)));
    const expectHue = (rgb: number[], color: number[]) => {
      expect(Math.max(...rgb)).toBeGreaterThan(150);
      for (let lit = 0; lit < 3; lit += 1) {
        if (!color[lit]) continue;
        for (let unlit = 0; unlit < 3; unlit += 1) {
          if (!color[unlit]) expect(rgb[lit]! - rgb[unlit]!).toBeGreaterThan(25);
        }
      }
    };
    // Three texels per capture keep this at 30 screenshots, below the old 36.
    for (const resolved of [false, true]) {
      const off = await sample(
        colors.map(() => [0, 0, 0]),
        resolved,
      );
      for (const rgb of off.centres) {
        expect(Math.min(...rgb)).toBeGreaterThan(150);
        expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThan(60);
      }
      let previous = off;
      // First byte steps must leave white continuously, without a black switch.
      for (const value of [1, 2, 4]) {
        const nearZero = await sample(
          colors.map((color) => color.map((channel) => channel * value)),
          resolved,
        );
        for (const [index, rgb] of nearZero.centres.entries()) {
          expect(Math.max(...rgb)).toBeGreaterThan(150);
          expect(difference(rgb, previous.centres[index]!)).toBeLessThan(40);
        }
        previous = nearZero;
      }
      // These are already-dimmed output bytes, representative of the 35% show.
      let dim = off;
      for (const value of [8, 12, 24, 32, 64]) {
        dim = await sample(
          colors.map((color) => color.map((channel) => channel * value)),
          resolved,
        );
        for (const [index, rgb] of dim.centres.entries()) expectHue(rgb, colors[index]!);
      }
      for (const value of [96, 255]) {
        const bright = await sample(
          colors.map((color) => color.map((channel) => channel * value)),
          resolved,
        );
        for (const [index, rgb] of bright.centres.entries()) {
          expectHue(rgb, colors[index]!);
          expect(Math.max(...rgb)).toBeGreaterThanOrEqual(Math.max(...dim.centres[index]!));
        }
        dim = bright;
      }
      for (const color of colors) {
        const mixed = await sample(
          [[0, 0, 0], color.map((channel) => channel * 12), color.map((channel) => channel * 96)],
          resolved,
        );
        expect(difference(mixed.centres[0]!, off.centres[0]!)).toBeLessThan(10);
        expectHue(mixed.centres[1]!, color);
        expectHue(mixed.centres[2]!, color);
        // Read every screen pixel between centres, not just the texels: an
        // interpolated off/dim/bright boundary must not hide a dark gap.
        for (const [index, rgb] of mixed.profile.entries()) {
          expect(Math.max(...rgb)).toBeGreaterThan(150);
          if (index > 0) expect(difference(rgb, mixed.profile[index - 1]!)).toBeLessThan(25);
        }
      }
      const offAgain = await sample(
        colors.map(() => [0, 0, 0]),
        resolved,
      );
      for (const [index, rgb] of offAgain.centres.entries())
        expect(difference(rgb, off.centres[index]!)).toBeLessThan(3);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await server?.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
