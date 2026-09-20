# ADR-0047: The bridge runs on Node-compatible TypeScript inside the Electron main process

- **Status:** Accepted
- **Date:** 2026-09-20
- **Decides:** [#87](https://github.com/jnslmk/beamhouse/issues/87)

## Context

[ADR-0006](0006-bridge-is-typescript-on-bun.md) decided on three premises it stated itself: the
sharing story is the bridgeless static bundle, so binary size is worth nothing; the deployment
target is one Linux box running the bridge from a terminal; and the repo is already a Bun
workspace, so "Node" was a strawman. Beamhouse is now required to ship as a **standalone desktop
app** — its own window and process, no terminal, npm-installable — and that requirement breaks
the premises at once. Something must host the window; the choice of render container becomes a
reliability decision about WebGL rather than a packaging preference; and whatever hosts the
window already contains a JavaScript runtime the bridge could simply run on.

### What the research found

Researched 2026-09-19/20 against primary sources.

| Claim | Finding |
| --- | --- |
| WebKitGTK WebGL detectability | Tauri's official Linux graphics docs (v2.tauri.app/develop/debug/linux-graphics, updated June 2026): WebGL2 context creation **succeeds even when backed by a software rasterizer**, and WebKitGTK masks the renderer string — `Apple GPU` is reported on every GPU — so the slow path is **undetectable from inside the app**. Official guidance is to ship a non-WebGL fallback on Linux |
| The fallback | Beamhouse's whole surface **is** the WebGL view. There is no non-WebGL fallback to ship; "ship one" means "abandon the product" |
| WebKitGTK Skia switch (2.46–2.50) | Improved the 2D/tile pipeline only, and the measured wins are 2D-scoped: WebKitGTK 2.46's release notes report MotionMark gains up to **4×** on a discrete-GPU desktop and **2×** on an integrated-GPU laptop; Igalia's April 2025 post measures **1.37×** (Multiply) to **11.3×** (Paths) across its table on a Raspberry Pi 4 — every named test is the 2D canvas/compositing suite, none is WebGL. The same post lists compositor synchronization **with WebGL** as future work, and the 2.50/2.52 release notes contain no WebGL performance work |
| WebKitGTK on real Linux desktops | A documented breakage class — blank windows, flicker, `AcceleratedSurfaceDMABuf` framebuffer errors, `Error 71` Wayland crashes (WebKit #261874, #259644; Tauri #9394). The documented env workarounds are graduated, not uniform: `WEBKIT_DISABLE_DMABUF_RENDERER=1` gives up only the faster DMA-BUF rendering path, while the last resort, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, **disables accelerated compositing entirely** (v2.tauri.app/develop/debug/linux-graphics) |
| Electron's renderer | Bundled Chromium — the best-case WebGL stack, **byte-identical to the app's current browser behaviour** |
| Distribution | `npm i -g` plus an electron-builder AppImage. The WebKitGTK/Tauri route ties the app to each distro's system webview version — the exact fragmentation the first row describes |

The WebKitGTK rows decide the render container, and Electron's row does the rest: the Electron
**main process is a Node runtime already shipping inside the app**. A Bun bridge beside it means
installing and operating two JavaScript runtimes per machine, and the only thing Bun buys there
is a runtime nothing else in the app uses.

ADR-0006 saw this hatch and built it: *"sacn npm rides `node:dgram`, so the intake — and only
the intake — can be moved to Node."* The desktop-app requirement walks through the hatch in
full. 0006's own soak table had already measured `sacn` npm on Node 22 — 557 frames/universe,
0 sequence gaps, indistinguishable from Bun — so the port's intake risk is not new risk; it is
the row 0006 recorded and then chose against.

## Decision

**The bridge is Node-compatible TypeScript, and the Electron main process is its host.** The
desktop app is the bridge's host. [ADR-0006](0006-bridge-is-typescript-on-bun.md) is
**superseded, not amended** — its language/runtime decision is reversed, not refined, so it
takes `Superseded by ADR-0047` rather than an amendment note.

- **Node-compatible APIs only under `bridge/src`:** `node:*` builtins, `ws`, `sacn`,
  `@beamhouse/wire`. No Bun-native APIs and no `bun:` imports in shipped bridge code.
- **The HTTP layer is `node:http` behind a Web `Request`/`Response` adapter**, so handler code
  survives the port unchanged and stays testable without a socket.
- **WebSockets are `ws`** — the bridge's second runtime dependency, replacing the `Bun.serve`
  half of ADR-0006's "no dependencies".
- **The Electron main process calls `startBridge` and owns the window.** The bridge stays a
  plain library call — the same `startBridge` a dev terminal runs today — so "hosted by
  Electron" is a deployment fact, not an API change.
- **The ignorance barrier moves from toolchain to lint.** ADR-0006's barrier had two halves: the
  isolated-linker workspace (no dependency on the app or on `gdtf-ts`) and the Bun-only
  toolchain. The first half survives unchanged; the second is replaced by **eslint banning Bun
  globals and `bun:` imports under `bridge/src`** — a stray `Bun.serve` now fails the lint the
  way a stray `gdtf-ts` import fails the linker. [ADR-0015](0015-agent-control-is-mcp-over-the-bridge-control-channel.md)'s
  opaque-envelope rule is untouched: the bridge still forwards what it never opens.
- **Bun remains the dev and test runner.** `bun test` runs the ported code through Bun's Node
  compatibility, and `bun build` remains available for bundling the Electron main. What changes
  is what the shipped bridge is allowed to *require*: Node.

## Consequences

- **ADR-0006's Bun-only commitment ends, in both directions.** Its "No Node-portability
  constraint" clause is replaced by its mirror image: the bridge is Node-portable only.
- **The live-soak acceptance criterion is re-armed for the port.** ADR-0006 required *"a
  full-show-length soak against real simultaneous Mizer and gled2 traffic, counting sequence
  gaps, before the bridge is trusted on a show."* The ported bridge has not earned that trust;
  the criterion re-arms as written. The in-repo gate stays the synthetic loopback soak; the
  live-wire soak stays the show gate.
- **`ws` enters the bridge's dependency table beside `sacn`.** `node:http`, `node:dgram` and
  `node:fs` are builtins; the "no dependencies" era of the serving half is over.
- **The 95 MB compiled binary leaves the story.** ADR-0006 already argued binary size was worth
  nothing against the static bundle; the desktop app retires the binary itself. What ships is
  the app package, and the sharing story that replaces 0006's is "hand someone the app".
- **What ADR-0006 got right survives the reversal.** `sacn` npm, whose `node:dgram` ride was
  0006's escape hatch and is now load-bearing. The hand-rolled ArtDmx receiver, which moves from
  Bun's `node:dgram` *compatibility layer* to the original — `reuseAddr` semantics identical,
  still a passive listener that never announces itself. And the ignorance barrier as a concept —
  same wall, new enforcement.
- **One runtime per install, one lifetime per app.** The Electron main hosts the bridge, so the
  bridge's lifetime follows the app's. The terminal entry point remains for development and
  stays how CI drives the soak.
