import { expect, test } from "bun:test";
import type { Server } from "bun";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";

declare global {
  interface Window {
    __diffuserTestSetPixels?: (rgb: number[]) => void;
  }
}

// Exercise the real Three material, scalar/RGB update paths, and GPU shader together.
test("CAD diffusers are white when off and retain RGB color without scalar double-dimming", async () => {
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
      window.__diffuserTestSetPixels = (rgb) => {
        api.setSceneFixtureLevels(new Map([[1, Math.max(...rgb)]]));
        api.setSceneFixturePixels(new Map([[1, Uint8Array.from([...rgb, ...rgb, ...rgb])]]));
      };
      window.__diffuserTestSetPixels([0, 0, 0]);
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
    const sample = async (rgb: number[]) => {
      await page.evaluate((rgb) => {
        if (!window.__diffuserTestSetPixels) throw new Error("diffuser test entry is not ready");
        window.__diffuserTestSetPixels(rgb);
      }, rgb);
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
        return Array.from(
          context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
            .data,
        ).slice(0, 3);
      }, screenshot.toString("base64"));
    };
    const off = await sample([0, 0, 0]);
    expect(Math.min(...off)).toBeGreaterThan(150);
    expect(Math.max(...off) - Math.min(...off)).toBeLessThan(60);
    const cyan = await sample([0, 96, 96]);
    expect(cyan[1]!).toBeGreaterThan(90);
    expect(cyan[1]! - cyan[0]!).toBeGreaterThan(40);
    expect(cyan[2]! - cyan[0]!).toBeGreaterThan(40);
    const red = await sample([96, 0, 0]);
    expect(red[0]! - Math.max(red[1]!, red[2]!)).toBeGreaterThan(40);
    const offAgain = await sample([0, 0, 0]);
    expect(Math.max(...offAgain.map((value, index) => Math.abs(value - off[index]!)))).toBeLessThan(
      3,
    );
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await server?.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
