// CLI `.bhs` argument → watch-relative scene path: selection, relative
// resolution, in-watch passthrough, and copy/collision handling for imports.
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { sceneFromArgv } from "../electron/scene-arg.ts";

const scratchDirectories: string[] = [];
afterAll(async () => {
  await Promise.all(
    scratchDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bhs-scene-"));
  scratchDirectories.push(root);
  return root;
}

// Throws if touched: proves the paths under test never reach the filesystem.
function refuseFs(): never {
  throw new Error("unexpected filesystem access");
}

async function showsIn(root: string): Promise<string> {
  const shows = join(root, "shows");
  await mkdir(shows);
  return shows;
}

test("no .bhs argument resolves to no scene", async () => {
  expect(await sceneFromArgv([], "/shows", { exists: refuseFs })).toBeNull();
  expect(
    await sceneFromArgv(["--record", "gig.bhs.bak"], "/shows", { exists: refuseFs }),
  ).toBeNull();
});

test("a relative argument resolves against the given base directory", async () => {
  const root = await scratch();
  const shows = await showsIn(root);
  expect(await sceneFromArgv(["stella.BHS"], shows, { resolveBase: shows, exists: refuseFs })).toBe(
    "shows/stella.BHS",
  );
});

test("a scene already inside the watch directory opens in place, untouched", async () => {
  const root = await scratch();
  const shows = await showsIn(root);
  await writeFile(join(shows, "gig.bhs"), "<show/>");
  expect(await sceneFromArgv([join(shows, "gig.bhs")], shows, { exists: refuseFs })).toBe(
    "shows/gig.bhs",
  );
  expect(await readdir(shows)).toEqual(["gig.bhs"]);
});

test("an outside scene is imported under its own name", async () => {
  const root = await scratch();
  const shows = await showsIn(root);
  const downloads = join(root, "downloads");
  await mkdir(downloads);
  const source = join(downloads, "stella.bhs");
  await writeFile(source, "BYTES-1");
  expect(await sceneFromArgv([source], shows)).toBe("shows/stella.bhs");
  expect(await readFile(join(shows, "stella.bhs"), "utf8")).toBe("BYTES-1");
});

test("a name collision imports beside the existing show instead of overwriting", async () => {
  const root = await scratch();
  const shows = await showsIn(root);
  const downloads = join(root, "downloads");
  await mkdir(downloads);
  const source = join(downloads, "stella.bhs");
  await writeFile(source, "NEW-SHOW-BYTES!!!!");
  await writeFile(join(shows, "stella.bhs"), "OLD-SHOW-BYTES!!!!");
  expect(await sceneFromArgv([source], shows)).toBe("shows/stella (2).bhs");
  expect(await readFile(join(shows, "stella.bhs"), "utf8")).toBe("OLD-SHOW-BYTES!!!!");
  expect(await readFile(join(shows, "stella (2).bhs"), "utf8")).toBe("NEW-SHOW-BYTES!!!!");
});

test("reopening an already-imported scene reuses the copy", async () => {
  const root = await scratch();
  const shows = await showsIn(root);
  const downloads = join(root, "downloads");
  await mkdir(downloads);
  const source = join(downloads, "stella.bhs");
  await writeFile(source, "BYTES-1");
  await copyFile(source, join(shows, "stella.bhs"));
  expect(await sceneFromArgv([source], shows)).toBe("shows/stella.bhs");
  expect(await readdir(shows)).toEqual(["stella.bhs"]);
});

test("a missing outside source rejects instead of inventing a scene", async () => {
  const root = await scratch();
  const shows = await showsIn(root);
  // main.ts catches this and launches without the scene; the helper's job is
  // to fail loudly, not to hand back a path that will never resolve.
  expect(sceneFromArgv([join(root, "gone.bhs")], shows)).rejects.toThrow();
});
