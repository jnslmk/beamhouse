// Which `.bhs` on the command line should open, as a watch-relative path the
// bridge serves and the app fetches (`?scene=shows/<file>`). No electron
// imports here: the argument mapping stays unit-testable.
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseBhs, previewAssetPath } from "../app/src/bhs.ts";

export type SceneArgOptions = {
  /** Directory relative CLI arguments resolve against; defaults to process.cwd(). */
  resolveBase?: string;
  /** Existence probe, injectable for tests; defaults to the real filesystem. */
  exists?: (path: string) => Promise<boolean>;
};

async function existsOnDisk(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Watch-relative paths ride in URLs (`shows/rig.yml`), so always forward slashes.
function watchRelative(watchDirectory: string, path: string): string {
  return `${basename(watchDirectory)}/${relative(watchDirectory, path).split(sep).join("/")}`;
}

function isInsideWatch(watchDirectory: string, path: string): boolean {
  const rel = relative(watchDirectory, path);
  return rel !== "" && rel.split(sep)[0] !== ".." && !isAbsolute(rel);
}

async function importWithAssets(
  source: string,
  sceneBytes: Buffer,
  watchDirectory: string,
  paths: readonly string[],
): Promise<string> {
  const sourceRoot = await realpath(dirname(source));
  const files = new Map<string, Buffer>([[basename(source), sceneBytes]]);
  for (const url of paths) {
    const path = previewAssetPath(url);
    if (path === basename(source))
      throw new Error("Preview asset cannot reference the scene itself");
    if (files.has(path)) continue;
    const asset = await realpath(resolve(sourceRoot, path));
    if (!isInsideWatch(sourceRoot, asset))
      throw new Error("Preview asset escapes the scene directory");
    files.set(path, await readFile(asset));
  }
  // ponytail: one private bundle per content revision; relative URLs stay unchanged.
  const hash = createHash("sha256");
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(JSON.stringify([path, bytes.length]));
    hash.update(bytes);
  }
  const stem = `${basename(source, extname(source))}-${hash.digest("hex")}`;
  for (let index = 1; ; index += 1) {
    const directory = join(watchDirectory, index === 1 ? stem : `${stem} (${index})`);
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (!(await lstat(directory)).isDirectory()) continue;
        let identical = true;
        for (const [path, bytes] of files) {
          const target = join(directory, path);
          if (
            !(await lstat(target)).isFile() ||
            !isInsideWatch(await realpath(directory), await realpath(target)) ||
            !bytes.equals(await readFile(target))
          ) {
            identical = false;
            break;
          }
        }
        if (identical) return watchRelative(watchDirectory, join(directory, basename(source)));
      } catch {
        // An incomplete or user-modified bundle belongs to the user; import beside it.
      }
      continue;
    }
    try {
      // Publish the scene last, after every referenced mesh is ready to fetch.
      for (const [path, bytes] of files) {
        if (path === basename(source)) continue;
        const target = join(directory, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
      }
      const target = join(directory, basename(source));
      await writeFile(target, sceneBytes, { flag: "wx" });
      return watchRelative(watchDirectory, target);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

// ponytail: sources outside the watch directory are copied in on open, not
// linked — the browser can only fetch what the bridge serves from that one
// directory.
export async function sceneFromArgv(
  argv: readonly string[],
  watchDirectory: string,
  options: SceneArgOptions = {},
): Promise<string | null> {
  const raw = argv.find((argument) => argument.toLowerCase().endsWith(".bhs"));
  if (!raw) return null;
  const source = resolve(options.resolveBase ?? process.cwd(), raw);

  // Already watch-relative: open it where it lies.
  if (isInsideWatch(watchDirectory, source)) return watchRelative(watchDirectory, source);

  const probe = options.exists ?? existsOnDisk;
  const sceneBytes = await readFile(source);
  let parsed: unknown;
  try {
    parsed = JSON.parse(sceneBytes.toString("utf8"));
  } catch {
    // Scene validation remains the browser's job when there are no readable asset references.
  }
  if (parsed && typeof parsed === "object" && "assets" in parsed) {
    const assets = parseBhs(sceneBytes.toString("utf8")).assets ?? {};
    const paths = Object.values(assets).flatMap((asset) => [asset.body, asset.diffuser]);
    if (paths.length > 0) return importWithAssets(source, sceneBytes, watchDirectory, paths);
  }
  const extension = extname(source);
  const stem = basename(source, extension);

  // Collision safety: never overwrite an existing show, and when the existing
  // file is byte-identical to the source, reuse it instead of stacking
  // duplicates on every open.
  for (let candidate = basename(source), index = 2; ; index += 1) {
    const target = join(watchDirectory, candidate);
    if (!(await probe(target))) {
      try {
        await copyFile(source, target, constants.COPYFILE_EXCL);
        return watchRelative(watchDirectory, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    if ((await lstat(target)).isFile() && sceneBytes.equals(await readFile(target))) {
      return watchRelative(watchDirectory, target);
    }
    candidate = `${stem} (${index})${extension}`;
  }
}
