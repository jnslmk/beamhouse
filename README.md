# Beamhouse

A passive, browser-first lighting visualiser. The first live patch is three cubes on universe 1,
slots 1–3; sACN and Art-Net may drive it at the same time.

## Run

Requires [Bun](https://bun.sh/) 1.3.14 or newer.

```sh
bun install
bun run start
```

Open <http://localhost:7070>. The bridge listens for sACN on UDP 5568 and Art-Net on UDP 6454.
Art-Net Port-Address 0 is presented as Beamhouse universe 1.

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
