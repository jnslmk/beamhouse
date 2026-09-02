# ADR-0009: Deployment is inferred from origin, and only the single file is a separate build

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decides:** [#24](https://github.com/jnslmk/beamhouse/issues/24)

## Context

`DESIGN.md` §09 promises "one build, three deployments" — bridge-local, GitHub Pages, single file —
and never says what differs between them. #24 could not be answered while the bridge was
undecided; [ADR-0006](0006-bridge-is-typescript-on-bun.md) fixed the load-bearing half by making
the bridge serve the static app over `http://localhost`, which is what turns §9.4's mixed-content
trap into a clean split rather than a documented hazard.

Two things then falsified §09's own framing.

**"One build" is not true**, and §12 already contradicted it: `vite-plugin-singlefile` is a
different plugin set with no code-splitting and no separate assets. That is a toolchain
constraint, not a preference.

**But §09 drew the line in the wrong place.** Bridge-local and Pages differ in what is *reachable
at runtime*, not in what is compiled. Bundled definitions in `public/gdtf/` are inert static
assets when a bridge is present, and a live socket is either there or it is not.

**And "the single file cannot fetch" is wrong in the direction that matters.** Measured against
Chromium 141 with default flags ([`docs/research/file-url-capabilities.md`](../research/file-url-capabilities.md)):
a `file://` page *is* a secure context, *can* open `ws://localhost:7070` and exchange frames
cleanly, and *can* `fetch` an `http(s)` origin that answers `Access-Control-Allow-Origin: *`. What
it cannot do is read the file sitting next to it. So the §09 table's "Live data? no" for the
single file was recorded as a limitation when it is really a choice.

## Decision

**One source, two build outputs, three deployments.**

| Output | Deployments it serves |
| --- | --- |
| `app` | bridge-local **and** GitHub Pages — byte-identical |
| `single` | the self-contained `.html` |

The split falls on the one real toolchain constraint and nowhere else. `base` is relative
(`'./'`), which the single-file output needs anyway and which lets the same `app` bytes sit under
Pages' `/beamhouse/` path.

**A deployment is not a build variant. It is a runtime property of where the page was loaded
from, inferred from the page's own origin — with no build-time flag, no probe and no
configuration.**

- Served by the bridge → an `http:` origin, so the bridge is at `location.host` by construction:
  connect `ws://${location.host}`.
- Pages → an `https:` origin, which by §9.4 never has a same-origin bridge.
- Single file → `file://`, where `location.host` is empty.

This makes the mixed-content trap **structurally impossible** rather than merely documented: an
`https` page never constructs a `ws://` URL, because it never had a same-origin bridge to
construct one from. The §9.4 tunnel case stays available through an explicit fragment override, so
`wss://` through cloudflared or Tailscale does not require weakening the default.

### Also decided

- **Viewer capabilities are always present, never compiled out.** §9.2's bundled definitions,
  drag-and-drop and demo motion mode, and §9.3's hosted recordings, are not viewer-*only*:
  drag-and-drop is useful with a bridge running, and **proxy geometry is not a fallback at all** —
  [#2](https://github.com/jnslmk/beamhouse/issues/2) found the `MarkeEigenbau` strip profile ships
  `description.xml` with no meshes, making proxy geometry the primary render path for strips in
  every deployment. Compiling them out would fork behaviour along a seam that does not exist in
  the domain.
- **`relay` is removed from `feed.ts`.** §07 and §11 both named `live | relay | recorded`, and
  nothing in the design ever said what `relay` was. The §9.4 tunnel is `live` at a different URL,
  not a different implementation. v1 has **`live` and `recorded`**; the injected-state agent
  surface ([#5](https://github.com/jnslmk/beamhouse/issues/5)) would be the third if it lands. An
  undefined slot in an interface is an invitation to invent semantics for it during M0.
- **The bridge serves a directory**, defaulting to its own embedded `dist/`. One mechanism:
  self-contained by default, `--serve <dir>` for iteration.
- **Vite's dev server proxies the WebSocket path to the bridge.** Without it, origin inference
  fails in exactly the setup development happens in every day — the page comes from Vite's port,
  the bridge is on `:7070`, and the first workaround anyone reaches for is a hardcoded localhost
  URL, which re-opens the mixed-content question.
- **The 4 KB fragment budget (§9.1) belongs to the link, not the deployment.** It is enforced once
  at encode time wherever a link is produced. A per-deployment budget would make a link's validity
  depend on which page minted it, and links get pasted between contexts — which is the entire
  point of them.
- **The single file persists nothing automatically.** §4.6's IndexedDB auto-save is wrong there:
  the `file://` storage bucket is **shared by every `file://` document the user ever opens**,
  measured by writing from one HTML file and reading it back verbatim from another in a different
  directory. Silently writing a collidable, neighbour-readable store to a recipient's machine is a
  poor trade for a convenience they did not ask for. Explicit save stays — `showSaveFilePicker` is
  present and works in a `file://` secure context.
- **The single file gets no live data**, now recorded as a decision rather than a limitation. It
  *could* open the bridge socket, but the bridge would see `Origin: null`, and §9.4 already says
  never to expose that socket unauthenticated — a server trusting `Origin: null` is trusting every
  local file on the machine, a materially worse posture than same-origin. Chrome 141's Local
  Network Access prompt is an unquantified risk on top. Anyone with a bridge running already has
  the bridge-served app, which is strictly better. Motion in a shared file comes from §9.2's
  seeded demo mode; baking a recording in stays an explicit opt-in at M8.

## Consequences

- §09's table gains a build column and loses the claim that there is one build.
- The `single` build config is load-bearing rather than cosmetic. Vite must inline every asset and
  emit **classic/`iife`** workers: a Blob-URL classic worker works from `file://`, a Blob-URL
  **module** worker fails **with no error message at all**. This is the kind of defect that ships,
  because it is invisible until someone opens the console.
- Nothing in the app may assume it can read a sibling file. Any such read is a `file://` defect
  that the bridge-served and Pages deployments would never expose.
- `feed.ts` drops to two implementations, so §07's interface and §11.3's "nearly free given
  `feed.ts`" claim both refer to a smaller surface than written.
- If `relay` was meant to be a browser holding the live socket and relaying frames to remote
  viewers — sharing a *live* link rather than a recording — that is a real feature with a server
  requirement Pages cannot satisfy, and it returns as a fresh ticket rather than a reserved slot.
  This ADR does not rule it out; it declines to reserve space for an undefined thing.
