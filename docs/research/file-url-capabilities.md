# What a `file://` page can and cannot do

Ticket: jnslmk/beamhouse#24 (part of #1). Establishes the constraints on the **single file**
deployment (§09), where the recipient double-clicks one `.html` and the page runs from a `file://`
URL.

**Everything here is measured, not recalled.** Chromium **141.0.7390.37**, driven by Playwright
with **no extra flags** (`args: []`), page loaded from a real `file:///…/test.html`. Every headline
result was re-verified in a **headed** run under Xvfb (UA `Chrome/141.0.0.0`, not
`HeadlessChrome`) and matched exactly, so none of it is a headless artifact.

Measured 2026-09-02.

## Why the design's premise needed checking

`DESIGN.md` §09 says the single file "cannot fetch", and #24 inherited that as a constraint. It is
**too broad in one direction and too narrow in the other**: the page can reach the network
perfectly well, and cannot read the file sitting next to it.

## Results

| # | Capability | Observed | Exact error |
| --- | --- | --- | --- |
| 1 | `window.isSecureContext` | **`true`** | — |
| 2 | `location.origin` | `"file://"` (`protocol` `"file:"`). The *security* origin is opaque and serialises as **`null`** everywhere it matters | — |
| 3 | `fetch('./data.json')` | **throws** | `TypeError: Failed to fetch` — console: `Fetch API cannot load file:///….  URL scheme "file" is not supported.` |
| 3b | `XMLHttpRequest`, same file | fails, `status === 0` | `Access to XMLHttpRequest at 'file:///…' from origin 'null' has been blocked by CORS policy: Cross origin requests are only supported for protocol schemes: chrome, chrome-untrusted, data, http, https.` |
| 3c | `<img src="./pixel.png">` | **loads** — subresource loads are not blocked | — |
| 4b | `fetch` → local **http** origin with `ACAO: *` | **works**, 200 | — |
| 4c | `fetch` → local **https** origin with `ACAO: *` | **works**, `response.type === "cors"` | — |
| 4d | same origin **without** `ACAO` | blocked | `…has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.` |
| 4e | `fetch(…, {mode:'no-cors'})` | request **is sent**, `type: "opaque"`, `status: 0` | — |
| 4f | preflighted `POST` (JSON content-type) | **works** — server saw `OPTIONS` then `POST` | — |
| 4g | `Origin` header the server saw | **`null`** (the literal string) on every CORS request; absent on `no-cors` | — |
| 5 | `new WebSocket('ws://localhost:7070')`, nothing listening | attempted, then `error` + `close` at ~5 ms, `code=1006` | `WebSocket connection to 'ws://localhost:7070/' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED` |
| 5b | same, **with a real server on 7070** | **works**: `open` @5 ms, message round-tripped, clean `close code=1000 wasClean=true` | — |
| 5c | `Origin` header sent to that server | **`Origin: null`** (header present, value the string `null`) | — |
| 5d | mixed content | `ws://` is **not** blocked despite `isSecureContext === true` | — |
| 6 | `indexedDB.open()` | **succeeds**; survives page reload **and** full browser restart | — |
| 6b | IndexedDB **scope** | **shared across every `file://` document, any path** — a DB written by `…/filetest/test.html` was read verbatim by `…/filetest/other/other.html` | — |
| 7 | `localStorage` | works, persists across reload and restart | — |
| 7b | `localStorage` **scope** | **likewise shared across all `file://` documents** | — |
| 8 | `showSaveFilePicker` / `showOpenFilePicker` | **present** (`typeof "function"`), as are `showDirectoryPicker`, `FileSystemHandle`, `navigator.storage.getDirectory`. Not invoked — needs a gesture | — |
| 9 | `crypto.subtle` | **present**; SHA-256 digest returned 32 bytes | — |
| 10 | inline classic `<script>` and inline `<script type="module">` | both **run** | — |
| 10c | **external** `<script type="module" src="./mod.mjs">` | **does not run** | `Access to script at 'file:///…/mod.mjs' from origin 'null' has been blocked by CORS policy…` |
| 10d | dynamic `import('./mod.mjs')` | fails | `TypeError: Failed to fetch dynamically imported module: file:///…/mod.mjs` |
| 10e | `import(blobURL)` | **works** | — |
| 11 | Web Worker from a Blob URL, **classic** | **works** | — |
| 11b | same with `{type:'module'}` | **fails — with no error text at all** (`e.message` undefined). Confirmed `file://`-specific: identical code works over `http://` | none exposed |
| 11c | module worker from a **`data:`** URL | **works** | — |
| 11d | `new Worker('./worker.js')` | throws | `SecurityError: Failed to construct 'Worker': Script at 'file:///…/worker.js' cannot be accessed from origin 'null'.` |
| 12 | `canvas.getContext('webgl2')` | **created**; `WebGL 2.0 (OpenGL ES 3.0 Chromium)` | — |
| 12b | WebGL2 `readPixels` + `toDataURL` | **work**; the WebGL canvas is **not** tainted | — |
| 12c | 2D canvas after `drawImage` of a **`file://`** image | **tainted** | `SecurityError: … The canvas has been tainted by cross-origin data.` |
| 12d | same with a **`data:`** or **`blob:`** image | **not** tainted | — |

Also observed: `ServiceWorker` registration **fails** —
`TypeError: Failed to register a ServiceWorker: The URL protocol of the current origin ('null') is not supported.`
`SharedWorker`, `EventSource`, `Notification`, `navigator.clipboard`, `sessionStorage` present;
`WebAssembly.compile` on inline bytes works; `sendBeacon` returned `true`.

## What could not be measured

- **Real remote HTTPS.** Browser egress is broken in the sandbox this ran in: `https://example.com`
  died as `net::ERR_CONNECTION_RESET` with default flags, and through the agent proxy the tunnel
  closed mid-exchange, while `curl` to the same host succeeded. That is a **transport failure, not
  a CORS verdict** — no real remote response was ever judged. The mechanism was instead reproduced
  against local `http` *and* local `https` origins with a header-logging server, which is what
  rows 4b–4g record. What stays unverified is whether any given real host would emit acceptable
  CORS headers for a `null` origin; many reflect `Origin` or use an allowlist, and neither
  accommodates `null`.
- **Chrome 141's Local Network Access prompt.** Headless/Xvfb has no UI, so the `localhost`
  requests here were never subjected to it. A real user's browser may prompt or block a
  `file://` → `localhost` request that succeeded in this measurement.
- **Hardware WebGL.** No GPU in the container; it fell back to software
  (`Automatic fallback to software WebGL has been deprecated`), so row 12 reflects the software
  path.

## Contrast run: `--allow-file-access-from-files`

Recorded only to show what the flag does *not* fix. No ordinary recipient of an `.html` file has
it set.

| Capability | Default | With the flag |
| --- | --- | --- |
| `XHR('./data.json')` | fails | **works** |
| external `<script type="module" src>` | blocked | **runs** |
| `new Worker('./worker.js')` | `SecurityError` | **works** |
| Blob-URL **module** worker | fails | **works** |
| 2D canvas taint from a `file://` image | tainted | **not** tainted |
| `Origin` header to the WS server | `null` | **`file://`** |
| **`fetch('./data.json')`** | fails | **still fails** — `URL scheme "file" is not supported` |

The last row is the point: the flag relaxes the *origin* check, but `fetch` rejects the `file:`
**scheme** unconditionally. Even the escape hatch does not restore `fetch` of a sibling file.

## Consequences for Beamhouse

1. **The single file must be genuinely single.** No companion `.json`, `.mjs` or asset beside the
   HTML — `fetch` refuses the scheme, XHR is CORS-blocked, external module scripts and file-based
   workers are blocked, and a `file://` image drawn to a 2D canvas taints it. A bundler config
   that emits an external module chunk or a **module-format** worker produces a page that
   half-executes with only a console error. Worker output must be classic/`iife`; a Blob-URL
   classic worker is fine, a Blob-URL module worker is not.
2. **It is a secure context**, so `crypto.subtle`, the File System Access pickers, WebGL2 and
   WASM are all available — the single file can still offer an explicit save.
3. **It can reach the network.** `ws://localhost:7070` opens and exchanges cleanly. That makes
   "single file gets no live data" a *policy* choice rather than a technical limit — see
   [ADR-0009](../adr/0009-deployment-is-inferred-from-origin.md) for why the answer is still no.
   Any HTTP endpoint it talked to would need `Access-Control-Allow-Origin: *`, since the origin is
   the literal string `null`; a server that trusts `Origin: null` is trusting **every local file
   on the machine**.
4. **Storage is the sharpest hazard.** `localStorage` and IndexedDB work and survive restarts, but
   they live in one opaque `file://` bucket **shared by every `file://` document the user ever
   opens**. Two Beamhouse exports, or two versions of one export, collide with no origin
   separation, and an unrelated local page can read them. `ServiceWorker` is unavailable outright,
   so there is no offline layer by that route.
