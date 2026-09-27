// Which `.bhs` on the command line should open, as a watch-relative path the
// bridge serves and the app fetches (`?scene=shows/<file>`). No electron
// imports here: the argument mapping stays unit-testable.
import { copyFile, readFile, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
  const extension = extname(source);
  const stem = basename(source, extension);

  // Collision safety: never overwrite an existing show, and when the existing
  // file is byte-identical to the source, reuse it instead of stacking
  // duplicates on every open.
  for (let candidate = basename(source), index = 2; ; index += 1) {
    const target = join(watchDirectory, candidate);
    if (!(await probe(target))) {
      await copyFile(source, target);
      return watchRelative(watchDirectory, target);
    }
    if ((await readFile(source)).equals(await readFile(target))) {
      return watchRelative(watchDirectory, target);
    }
    candidate = `${stem} (${index})${extension}`;
  }
}
