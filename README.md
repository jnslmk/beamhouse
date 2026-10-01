# Beamhouse

A passive, browser-first lighting visualiser. The first live patch is three cubes on universe 1,
slots 1–3; sACN and Art-Net may drive it at the same time.

## Run

Requires [Bun](https://bun.sh/) 1.3.14 or newer.

```sh
bun install
bun run start
```

Open <http://localhost:7070>. The bridge listens for sACN on UDP 5568 and Art-Net on UDP 6455.
Art-Net Port-Address 0 is presented as Beamhouse universe 1.

To open a saved scene in the desktop app, run `bun run beamhouse -- path/to/scene.bhs`. If
Beamhouse is already running, the file is handed to its open window.
External scenes with `assets` import their referenced body/diffuser GLBs into an isolated
content-addressed subdirectory under the watched shows directory. Relative mesh URLs and scene
bytes are preserved; reopening identical scene and mesh bytes reuses the bundle. Changed bundles
import beside existing files, never over user assets. Mesh URLs must stay inside the scene's
directory (including symlink targets).

CAD strip templates are Z-up, metre-scale, and run along local X. Body and diffuser share one
centre, including body connectors; diffuser UVs use the assembled diffuser's X extent, so pixel
zero stays at its -X end across multiple solids. A split-universe strip's ordered address
footprints describe its successive channel runs (for example, 27 + 42 slots for 23 RGB pixels),
not a full-strip footprint at each address.
Off CAD diffuser regions retain an opaque milky-white/grey surface. Lit regions smoothly tint
that surface toward each sampled pixel's LED hue, so dim cyan, red and magenta remain visible
at reduced show brightness (including representative RGB channel bytes 8–64 at 35% output).
The blend retains the strongest reflected channel rather than fading the surface to black,
avoiding dark transition bands between off, dim and bright regions. This viewport-only correction
leaves source RGB bytes, animation and DMX output unchanged; scalar fixture levels do not
re-dim RGB strips.
The viewport combines 4× MSAA with FXAA after tone mapping to reduce broken subpixel
CAD highlights. FXAA adds one fullscreen pass and slightly softens fine detail; it
does not change the imported geometry or material properties.

In the viewport, **Ground** toggles the floor and grid. Each `old` badge is a
per-reference-strip freshness marker: its required universe has no current
frame or its data is stale.

## Verify

```sh
bunx playwright install chromium # once, if Chromium is not installed system-wide
bun run format:check
bun run lint
bun run typecheck
bun run test
```

The process test starts the real bridge and browser, sends both UDP protocols, checks source and
sequence diagnostics, staleness, termination, last-writer-wins frames, and audits the bridge for
UDP sends. Git hooks run formatting on staged files and then typechecking and the test suite; CI
runs the same checks on every push and pull request.

For the focused CAD diffuser GPU regression, run `bun test tests/diffuser-render.test.ts`.
It renders the actual viewport through both RGB-byte and resolved-state updates, checking
near-zero continuity, dim cyan/red/magenta hue, stronger output and spatial mixed off/dim/bright
regions with 30 screenshot readbacks, including every screen pixel between the sampled texel centres.
