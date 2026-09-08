import type { UniverseHealth, UniversesMessage } from "@beamhouse/wire";
import { parseGdtf, proxyPrimitive, type GdtfGeometryNode } from "gdtf-ts";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LiveFeed } from "./live-feed.ts";
import {
  referenceStrips,
  resolvedReferenceDefinition,
  resolveColor,
  textureBytesForStrip,
  universesForStrips,
  type LinearRGB,
} from "./reference-rig.ts";
import {
  hasDefinition,
  hasMode,
  mintLinearRGB,
  registerGdtf,
  registerOfl,
  resolveFixture,
  staticsFor,
  type FixtureState,
} from "./resolve.ts";
import { createViewport, type StripProbeMarkers } from "./viewport.ts";
import {
  decodeShareFragment,
  encodeShareSnapshot,
  formatSnapshotAge,
  snapshotScene,
  type ShareSnapshot,
} from "./share.ts";
import {
  alignTargets,
  distributeTargets,
  rotateTargets,
  samePlacement,
  SceneCommands,
  type ArrayDef,
  type BhsDefinition,
  type BreakAddress,
  type LocalFixture,
  type Pivot,
  type AgentRequest,
  type Placement,
  type SceneCommand,
} from "./scene.ts";
import { parseMvr } from "./mvr.ts";
import { parseMizerProject } from "./patch.ts";
import { GeneratedFeed, type FeedId } from "./look.ts";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("missing application root");

root.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark"></span><strong>Beamhouse</strong></div>
    <div class="status-chips" aria-label="Scene navigation">
      <button class="chip" type="button" data-chip-tab="universes"><span>Feed</span><b id="feed-status">connecting</b></button>
      <button class="chip" type="button" data-chip-tab="universes"><span>Universes</span><b id="universe-status">1 · waiting</b></button>
      <button class="chip" type="button" data-chip-tab="issues"><span>Patch</span><b id="patch-status">reference</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Selection</span><b id="selection-status">none</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures" data-render-toggle aria-pressed="false"><span>Render</span><b id="render-status">live</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures" data-hold-toggle aria-pressed="false"><span>Hold</span><b id="hold-status">off</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Snap</span><b id="snap-status">0.25 m</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures" data-takeover><span>Camera</span><b id="ownership-status">claiming</b></button>
      <button class="chip" type="button" data-share title="Copy a frozen snapshot link"><span>Share</span><b data-share-state>link</b></button>
    </div>
  </header>
  <section class="workspace">
    <div id="viewport" aria-label="Live cube and STAR-TENT strip reference patch" aria-describedby="viewport-hint">
      <span class="at-only" id="viewport-hint" data-viewport-hint>Drag to orbit · scroll to zoom</span>
      <div class="viewport-marks" aria-live="polite">
        <span class="fixture-mark" data-fixture-mark="1"></span>
        <span class="fixture-mark" data-fixture-mark="2"></span>
        <span class="fixture-mark" data-fixture-mark="3"></span>
        ${referenceStrips.map((strip) => `<span class="strip-mark" data-strip-mark="${strip.id}"></span>`).join("")}
        ${referenceStrips.map((strip) => `<span data-strip-probe="${strip.id}-start"></span><span data-strip-probe="${strip.id}-end"></span>`).join("")}
      </div>
      <div class="render-note" data-intensity-note hidden>Intensity map · relative per emitter · no photometric claim</div>
      <div class="snapshot-age" data-snapshot-age hidden></div>
    </div>
    <section class="viewer-list" data-viewer-list hidden aria-label="Shared fixtures">
      <div class="health-heading"><b>Shared rig</b><output data-viewer-count></output></div>
      <ol class="fixtures" data-viewer-fixtures></ol>
    </section>
    <aside class="overlay" data-overlay hidden aria-label="Scene workspace">
      <nav class="overlay-tabs" aria-label="Scene panels" role="tablist">
        <button type="button" role="tab" data-overlay-tab="fixtures">Fixtures</button>
        <button type="button" role="tab" data-overlay-tab="objects">Objects</button>
        <button type="button" role="tab" data-overlay-tab="universes">Universes</button>
        <button type="button" role="tab" data-overlay-tab="history">History</button>
        <button type="button" role="tab" data-overlay-tab="issues">Issues</button>
        <button type="button" data-overlay-close aria-label="Close workspace">Close</button>
      </nav>
      <section data-overlay-panel="fixtures">
      <div class="panel-heading">
        <div><span class="eyebrow">Reference patch</span><h1>Live cubes</h1></div>
        <span class="live-dot" aria-hidden="true"></span>
      </div>
      <p class="lede">Universe 1 · slots 1–3. Every accepted packet is drawn last-writer-wins.</p>
      <ol class="fixtures" id="fixtures">
        ${[1, 2, 3]
          .map(
            (address) => `
              <li data-fixture="${address}" data-editable-fixture="${address}" data-level="0">
                <span class="swatch swatch-${address}"></span>
                <span><b>Cube ${address}</b><small>1.${String(address).padStart(3, "0")}</small></span>
                <output>0</output>
              </li>`,
          )
          .join("")}
      </ol>
      <section class="local-fixtures" aria-label="Fixtures">
        <div class="health-heading"><b>Fixtures</b><output data-local-error></output></div>
        <ol data-local-fixtures></ol>
        <div class="array-form">
          <label>source<select data-local-definition-source><option value="existing">existing definition</option><option value="new-strip">new Beamhouse strip</option></select></label>
          <label>definition<input data-local-definition value="gdtf:example"></label>
          <label data-inline-definition-fields hidden>id<input data-inline-definition-id value="bhs:strip"></label>
          <label data-inline-definition-fields hidden>pixels<input data-inline-strip="pixels" type="number" min="1" value="23"></label>
          <label data-inline-definition-fields hidden>pitch mm<input data-inline-strip="pitch" type="number" min="1" value="25"></label>
          <label data-inline-definition-fields hidden>channels/pixel<input data-inline-strip="channels" type="number" min="1" value="3"></label>
          <label data-inline-definition-fields hidden>primitive<select data-inline-strip="primitive"><option>Cube</option><option>Cylinder</option><option>Sphere</option></select></label>
          <label>mode<input data-local-mode value="default"></label>
          <label>universe<input data-local-universe type="number" min="1" value="4"></label>
          <label>address<input data-local-address type="number" min="1" max="512" value="1"></label>
          <label>footprint<input data-local-footprint type="number" min="1" value="1"></label>
          <label>additional breaks<input data-local-breaks placeholder="5.001, 6.001"></label>
          <button type="button" data-local-add>Add local fixture</button>
        </div>
        <section data-definition-editor hidden>
          <p data-definition-affects></p>
          <div class="array-form">
            <label>pixels<input data-definition-strip="pixels" type="number" min="1"></label>
            <label>pitch mm<input data-definition-strip="pitch" type="number" min="1"></label>
            <label>channels/pixel<input data-definition-strip="channels" type="number" min="1"></label>
            <label>primitive<select data-definition-strip="primitive"><option>Cube</option><option>Cylinder</option><option>Sphere</option></select></label>
            <div data-definition-primitive-fields hidden>
              <label>primitive<select data-definition-primitive="type"><option>Cube</option><option>Cylinder</option><option>Sphere</option></select></label>
              <label>width<input data-definition-primitive="width" type="number" min="0.01"></label>
              <label>depth<input data-definition-primitive="depth" type="number" min="0.01"></label>
              <label>height<input data-definition-primitive="height" type="number" min="0.01"></label>
            </div>
            <button type="button" data-definition-save>Save definition</button>
          </div>
        </section>
      </section>
      <section class="editor" aria-label="Fixture placement editor">
        <div class="health-heading"><b>Placement</b><output data-history-count>0</output></div>
        <p data-placement-empty>Select a fixture to edit its placement.</p>
        <div data-placement-controls hidden>
          <div class="history-actions" role="group" aria-label="Gizmo mode"><button type="button" data-gizmo-mode="translate">Translate</button><button type="button" data-gizmo-mode="rotate">Rotate</button></div>
          <label>Grid <select data-grid-snap><option value="0.25">0.25 m</option><option value="0.5">0.5 m</option><option value="0">off</option></select></label>
          <p class="editor-note">Hold Alt while dragging the gizmo to bypass snapping.</p>
          <div class="placement-fields">
            ${["x", "y", "z", "rx", "ry", "rz"].map((field) => `<label>${field}<input data-placement-field="${field}" type="number" step="0.01"></label>`).join("")}
          </div>
          <div class="history-actions"><button type="button" data-undo>Undo</button><button type="button" data-redo>Redo</button></div>
        </div>
      </section>
      <section class="arrange" aria-label="Arrange selection" data-arrange data-selection-ids="">
        <div class="health-heading"><b>Arrange</b><output data-selection-count>0</output></div>
        <p class="editor-note">Shift-click fixtures to multi-select. Align, distribute, rotate, and revert each apply as one undo entry.</p>
        <div class="history-actions" role="group" aria-label="Align selection"><button type="button" data-arrange-mutation data-align="x">Align X</button><button type="button" data-arrange-mutation data-align="y">Align Y</button><button type="button" data-arrange-mutation data-align="z">Align Z</button></div>
        <div class="history-actions" role="group" aria-label="Distribute selection"><button type="button" data-arrange-mutation data-distribute="x">Distribute X</button><button type="button" data-arrange-mutation data-distribute="y">Distribute Y</button><button type="button" data-arrange-mutation data-distribute="z">Distribute Z</button></div>
        <div class="history-actions" role="group" aria-label="Revert selection"><button type="button" data-arrange-mutation data-revert>Revert to array/default</button></div>
        <div class="rotate-row">
          <label>rx<input data-arrange-mutation data-rotate="rx" type="number" step="1" value="0"></label>
          <label>ry<input data-arrange-mutation data-rotate="ry" type="number" step="1" value="0"></label>
          <label>rz<input data-arrange-mutation data-rotate="rz" type="number" step="1" value="0"></label>
          <label>pivot<select data-arrange-mutation data-rotate-pivot><option value="own">own</option><option value="shared">shared</option><option value="explicit">explicit</option></select></label>
          <label>px<input data-arrange-mutation data-pivot="x" type="number" step="0.01" value="0"></label>
          <label>py<input data-arrange-mutation data-pivot="y" type="number" step="0.01" value="0"></label>
          <label>pz<input data-arrange-mutation data-pivot="z" type="number" step="0.01" value="0"></label>
          <button type="button" data-arrange-mutation data-rotate-apply>Rotate selection</button>
        </div>
        <div class="array-form">
          <label>id<input data-arrange-mutation data-array-id placeholder="array id"></label>
          <label>kind<select data-arrange-mutation data-array-kind><option value="radial">radial</option><option value="line">line</option><option value="grid">grid</option></select></label>
          <label>members<input data-arrange-mutation data-array-members placeholder="1,2,3"></label>
          <label>cx<input data-arrange-mutation data-array="centerX" type="number" step="0.01" value="0"></label>
          <label>cy<input data-arrange-mutation data-array="centerY" type="number" step="0.01" value="3"></label>
          <label>cz<input data-arrange-mutation data-array="centerZ" type="number" step="0.01" value="0"></label>
          <label>radius<input data-arrange-mutation data-array="radius" type="number" step="0.01" value="0.75"></label>
          <label>start<input data-arrange-mutation data-array="startAngle" type="number" step="1" value="0"></label>
          <label>step<input data-arrange-mutation data-array="stepDeg" type="number" step="1" value="" placeholder="auto"></label>
          <label>ox<input data-arrange-mutation data-array="originX" type="number" step="0.01" value="0"></label>
          <label>oy<input data-arrange-mutation data-array="originY" type="number" step="0.01" value="0"></label>
          <label>oz<input data-arrange-mutation data-array="originZ" type="number" step="0.01" value="0"></label>
          <label>sx<input data-arrange-mutation data-array="spacingX" type="number" step="0.01" value="1"></label>
          <label>sy<input data-arrange-mutation data-array="spacingY" type="number" step="0.01" value="0"></label>
          <label>sz<input data-arrange-mutation data-array="spacingZ" type="number" step="0.01" value="0"></label>
          <label>cols<input data-arrange-mutation data-array="columns" type="number" step="1" value="2"></label>
          <button type="button" data-arrange-mutation data-array-save>Save array</button>
          <output data-array-status>No array</output>
        </div>
      </section>
      <section class="camera-views" aria-label="Named camera views">
        <div class="health-heading"><b>Camera views</b></div>
        <div class="camera-save"><input data-camera-mutation data-camera-view-name placeholder="View name"><button type="button" data-camera-mutation data-camera-save>Save view</button></div>
        <div data-camera-views></div>
      </section>
      <section class="strip-status" aria-live="polite">
        <div class="health-heading"><b>STAR-TENT strips</b><span>texture-backed</span></div>
        <ol class="strip-list">
          ${referenceStrips.map((strip) => `<li data-texture-strip="${strip.id}" data-editable-fixture="${strip.id}">Spoke ${strip.id} · 23 px</li>`).join("")}
        </ol>
        <output class="strip-readback" data-strip-readback="">Waiting for universes 2 · 3</output>
      </section>
      </section>
      <section data-overlay-panel="universes" hidden>
      <p class="lede" data-arbitration-note>Beamhouse never arbitrates contention — every source is drawn last-writer-wins.</p>
      <section class="universe-health" id="universe-health" aria-live="polite">
      </section>
      <section class="terminations" id="terminations"></section>
      </section>
      <section data-overlay-panel="objects" hidden>
        <p class="lede">Objects share the fixture selection space.</p>
        <ol data-scene-objects></ol>
        <div class="array-form">
          <label>definition<input data-object-definition value="bhs:object"></label>
          <label>primitive<select data-object-primitive="type"><option>Cube</option><option>Cylinder</option><option>Sphere</option></select></label>
          <label>width<input data-object-primitive="width" type="number" min="0.01" value="1"></label>
          <label>depth<input data-object-primitive="depth" type="number" min="0.01" value="1"></label>
          <label>height<input data-object-primitive="height" type="number" min="0.01" value="1"></label>
          <button type="button" data-object-add>Add scene object</button>
        </div>
      </section>
      <section data-overlay-panel="history" hidden><p class="lede">One stack shared by both front-ends: undo walks it back, redo walks it forward.</p><ol data-history></ol></section>
      <section data-overlay-panel="issues" hidden><p class="lede">Every issue originates in an ingest; the count rides the Patch chip.</p><ol data-issues><li data-issues-empty>No patch issues in the reference rig.</li></ol><div class="array-form"><input type="file" data-mvr-file accept=".mvr" hidden><button type="button" data-mvr-pick>Load MVR file</button><span class="editor-note">A dropped .mvr loads the same way.</span></div></section>
    </aside>
  </section>
`;

const viewport = required("#viewport");
const fixtureMarks = [...document.querySelectorAll<HTMLElement>("[data-fixture-mark]")];
const stripMarkers = [...document.querySelectorAll<HTMLElement>("[data-strip-mark]")];
const stripProbeMarkers: StripProbeMarkers[] = referenceStrips.map((strip) => ({
  start: required(`[data-strip-probe="${strip.id}-start"]`),
  end: required(`[data-strip-probe="${strip.id}-end"]`),
}));
const viewerSnapshot = await decodeShareFragment(location.hash);
let viewerActive = false;
let selectedIds: number[] = [];
let holdActive = false;
let renderMode: "live" | "intensity" = "live";
const heldIds = new Set<number>();
let editingDefinition: string | null = null;
const commands = await SceneCommands.create({ control: viewerSnapshot === null });
const viewportApi = createViewport(
  viewport,
  fixtureMarks,
  referenceStrips,
  stripMarkers,
  stripProbeMarkers,
  (id, placement) =>
    commands.apply({ kind: "placement.set", fixtureIds: [id], placements: { [id]: placement } }),
  (id, additive) => selectFixture(id, additive),
);
const { cubes, strips, fixtures: editableFixtures } = viewportApi;
// Beamhouse-side convergence: gdtf-ts owns bytes → definition, this layer owns
// definition → display, including the canonical-mesh cache.
const gdtfMeshCache = new Map<string, Object3D>();
function findGdtfGeometry(
  nodes: readonly GdtfGeometryNode[],
  name: string,
): GdtfGeometryNode | undefined {
  for (const node of nodes) {
    if (node.name === name) return node;
    const nested = findGdtfGeometry(node.children, name);
    if (nested) return nested;
  }
  return undefined;
}
async function loadGdtfPreview(base64: string): Promise<{ definition: string; source: string }> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const definition = parseGdtf(bytes);
  registerGdtf(`gdtf:${definition.fixtureTypeId}`, definition);
  const root =
    (definition.modes[0]
      ? findGdtfGeometry(definition.geometries, definition.modes[0].geometry)
      : undefined) ?? definition.geometries[0];
  const model = definition.models.find((entry) => entry.name === root?.target);
  // The mesh is the mode-root model's own GLB: any other part would misattribute the preview.
  const meshModel = model?.glb ? model : undefined;
  let mesh: Object3D | null = null;
  if (meshModel?.glb) {
    // One stem names different meshes in different archives: key by fixture plus stem.
    const cacheKey = `${definition.fixtureTypeId}/${meshModel.file}`;
    let cached = gdtfMeshCache.get(cacheKey);
    if (!cached) {
      try {
        cached = (await new GLTFLoader().parseAsync(meshModel.glb.slice().buffer, "")).scene;
        gdtfMeshCache.set(cacheKey, cached);
      } catch {
        cached = undefined;
      }
    }
    mesh = cached ?? null;
  }
  viewportApi.showGdtfFixture(
    {
      kind: "primitive",
      primitive: proxyPrimitive(model?.primitiveType ?? ""),
      width: model?.width ?? 1,
      depth: model?.length ?? 1,
      height: model?.height ?? 0.5,
    },
    mesh,
  );
  const id = `gdtf:${definition.fixtureTypeId}`;
  viewport.dataset.gdtfDefinition = id;
  viewport.dataset.gdtfRevision = definition.revisionHint;
  return { definition: id, source: mesh ? "mesh" : "proxy" };
}
declare global {
  interface Window {
    __beamhouseLoadGdtf: typeof loadGdtfPreview;
    __beamhouseRegisterOfl: (id: string, fixture: unknown) => { definition: string };
    __beamhouseZoomOverride: (id: number, degrees: number | null) => void;
    __beamhouseIngestMvr: (bytes: Uint8Array, label: string) => Promise<boolean>;
  }
}
window.__beamhouseLoadGdtf = loadGdtfPreview;
window.__beamhouseRegisterOfl = (id: string, fixture: unknown) => {
  registerOfl(id, fixture);
  return { definition: id };
};
window.__beamhouseZoomOverride = (id: number, degrees: number | null) => {
  // A non-finite hang value is no value: it clears rather than poisoning resolve.
  if (degrees === null || typeof degrees !== "number" || !Number.isFinite(degrees))
    zoomOverrides.delete(id);
  else zoomOverrides.set(id, degrees);
};
// Product-proof seam: the drop handler calls this same function, so driving
// it with bytes exercises the drop path minus the gesture.
window.__beamhouseIngestMvr = (bytes: Uint8Array, label: string): Promise<boolean> =>
  ingestMvrBytes(bytes, label);
const fixtureRows = [...document.querySelectorAll<HTMLElement>("[data-fixture]")];
const receivedUniverses = new Set<number>();
const latestFrames = new Map<number, Uint8Array>();
let latestHealth: UniversesMessage | null = null;
// The generated look enters above the same resolution seam as live frames.
const generated = new GeneratedFeed();
let activeFeed: FeedId = "live";
let lastTrustKey = "";
let liveFeed: LiveFeed | null = null;

const defaultPlacements = new Map(
  editableFixtures.map((fixture) => [fixture.id, fixture.placement()]),
);
for (const fixture of editableFixtures) {
  const fallback = defaultPlacements.get(fixture.id);
  if (fallback) fixture.setPlacement(commands.placement(fixture.id, fallback));
}
let pendingPatchPath: string | null = null;
let patchIssue: string | null = null;

/** Watched-file save → re-ingest: bridge bytes through the patch contract into patch-only state. The live socket stays connected throughout. */
async function maybeIngestPatch(): Promise<void> {
  const path = pendingPatchPath;
  if (!path || viewerSnapshot || !commands.isOwner()) return;
  pendingPatchPath = null;
  const hadIssue = patchIssue !== null;
  patchIssue = null;
  let bytes: Uint8Array;
  try {
    const response = await fetch(`/${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    patchIssue = `Patch ${path} is unreachable; keeping the last ingested patch.`;
    renderSceneFixtures(commands.fixtures());
    return;
  }
  if (path.toLowerCase().endsWith(".mvr")) {
    await ingestMvrBytes(bytes, path);
    return;
  }
  try {
    commands.ingestPatch(parseMizerProject(bytes), path);
  } catch {
    patchIssue = `Patch ${path} does not parse; keeping the last ingested patch.`;
    renderSceneFixtures(commands.fixtures());
    return;
  }
  // An unchanged re-ingest notifies nothing; still repaint a cleared issue row.
  if (hadIssue) renderSceneFixtures(commands.fixtures());
}
/** One-shot MVR bytes from a watched file, the file picker, or a drop: parse, register the archive's own definitions, and ingest. */
async function ingestMvrBytes(bytes: Uint8Array, label: string): Promise<boolean> {
  const hadIssue = patchIssue !== null;
  patchIssue = null;
  try {
    const ingest = await parseMvr(bytes);
    for (const { id, definition } of ingest.definitions) registerGdtf(id, definition);
    commands.ingestMvr(ingest, label);
    // An unchanged re-ingest notifies nothing; still repaint a cleared issue row.
    if (hadIssue) renderSceneFixtures(commands.fixtures());
    return true;
  } catch {
    patchIssue = `MVR ${label} does not parse; keeping the last ingested patch.`;
    renderSceneFixtures(commands.fixtures());
    return false;
  }
}

syncSceneFixtures();
commands.onChanged(() => {
  // A shared link is frozen: later scene traffic never rewrites the snapshot rig.
  if (!viewerSnapshot) syncSceneFixtures();
  renderPlacementEditor();
  void maybeIngestPatch();
});
// A watched save adopts the latest patch file; the stored path re-ingests on startup.
commands.onReload((path) => {
  pendingPatchPath = path;
  void maybeIngestPatch();
});
pendingPatchPath = commands.patchPath();
void maybeIngestPatch();
// The owning page applies control-channel requests; followers never see them.
commands.onRequest((requestId, request) => void handleAgentRequest(requestId, request));
required("#viewport").dataset.feed = resolvingFeed();
renderPlacementEditor();

if (!viewerSnapshot) {
  required<HTMLButtonElement>("[data-takeover]").addEventListener("click", () => {
    if (
      commands.isOwner() ||
      confirm(`Take over scene from ${commands.ownerName() ?? "the current owner"}?`)
    )
      commands.takeover();
  });
}

for (const chip of document.querySelectorAll<HTMLButtonElement>("[data-chip-tab]")) {
  if ("holdToggle" in chip.dataset || "renderToggle" in chip.dataset) continue;
  chip.addEventListener("click", () => openOverlay(chip.dataset.chipTab ?? "fixtures"));
}
for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]")) {
  tab.addEventListener("click", () => openOverlay(tab.dataset.overlayTab ?? "fixtures"));
}
required<HTMLButtonElement>("[data-overlay-close]").addEventListener("click", () => {
  required("[data-overlay]").hidden = true;
});
required("[data-hold-toggle]").addEventListener("click", () => {
  holdActive = !holdActive;
  heldIds.clear();
  if (holdActive) for (const id of selectedIds) heldIds.add(id);
  required("#hold-status").textContent = holdActive ? "on" : "off";
  required("[data-hold-toggle]").setAttribute("aria-pressed", String(holdActive));
});
required("[data-render-toggle]").addEventListener("click", () => {
  renderMode = renderMode === "live" ? "intensity" : "live";
  viewportApi.setRenderMode(renderMode);
  required("#render-status").textContent = renderMode;
  required("#viewport").dataset.renderMode = renderMode;
  required("[data-intensity-note]").hidden = renderMode === "live";
  required("[data-render-toggle]").setAttribute("aria-pressed", String(renderMode === "intensity"));
});

// File-selected and dropped MVR bytes are transports onto the same parser a
// watched file reaches; delivery never touches the patch contract.
required<HTMLButtonElement>("[data-mvr-pick]").addEventListener("click", () => {
  if (!commands.isOwner()) return;
  required<HTMLInputElement>("[data-mvr-file]").click();
});
required<HTMLInputElement>("[data-mvr-file]").addEventListener("change", (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !commands.isOwner()) return;
  void file.arrayBuffer().then((buffer) => ingestMvrBytes(new Uint8Array(buffer), file.name));
});
document.addEventListener("dragover", (event) => {
  event.preventDefault();
});
document.addEventListener("drop", (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((entry) =>
    entry.name.toLowerCase().endsWith(".mvr"),
  );
  if (!file || !commands.isOwner()) return;
  event.preventDefault();
  void file.arrayBuffer().then((buffer) => ingestMvrBytes(new Uint8Array(buffer), file.name));
});
bindFixtureRows();
required<HTMLSelectElement>("[data-local-definition-source]").addEventListener("change", () => {
  const inline =
    required<HTMLSelectElement>("[data-local-definition-source]").value === "new-strip";
  for (const field of document.querySelectorAll<HTMLElement>("[data-inline-definition-fields]"))
    field.hidden = !inline;
  required<HTMLInputElement>("[data-local-definition]").disabled = inline;
});
required<HTMLButtonElement>("[data-local-add]").addEventListener("click", () => {
  if (!commands.isOwner()) return;
  const source = required<HTMLSelectElement>("[data-local-definition-source]").value;
  const inline = source === "new-strip";
  const definition = inline ? inlineStripDefinition() : undefined;
  const fixture: LocalFixture = {
    id: commands.nextFixtureId(),
    definition: inline
      ? required<HTMLInputElement>("[data-inline-definition-id]").value.trim()
      : required<HTMLInputElement>("[data-local-definition]").value.trim(),
    mode: required<HTMLInputElement>("[data-local-mode]").value.trim(),
    addresses: localAddresses(),
  };
  const command: Extract<SceneCommand, { kind: "fixture.add" }> = {
    kind: "fixture.add",
    fixture,
    placement: { position: [0, 0.5, 0], rotation: [0, 0, 0] },
    ...(definition ? { definition: { id: fixture.definition, value: definition } } : {}),
  };
  const error = commands.fixtureAddError(command);
  required("[data-local-error]").textContent = error ?? "";
  if (!error) commands.apply(command);
});
required<HTMLButtonElement>("[data-definition-save]").addEventListener("click", () => {
  if (!commands.isOwner() || !editingDefinition) return;
  const definition = commands.definitions()[editingDefinition];
  if (!definition) return;
  const value =
    definition.kind === "strip" ? inlineStripDefinition(true) : inlinePrimitiveDefinition(true);
  const error = commands.definitionSetError(editingDefinition, value);
  required("[data-local-error]").textContent = error ?? "";
  if (!error) commands.apply({ kind: "definition.set", id: editingDefinition, value });
});
required<HTMLButtonElement>("[data-object-add]").addEventListener("click", () => {
  if (!commands.isOwner()) return;
  const fixture: LocalFixture = {
    id: commands.nextFixtureId(),
    definition: required<HTMLInputElement>("[data-object-definition]").value.trim(),
    mode: "",
    addresses: [],
  };
  const existing = commands.definitions()[fixture.definition];
  const command: Extract<SceneCommand, { kind: "fixture.add" }> = {
    kind: "fixture.add",
    fixture,
    placement: { position: [0, 0.5, 0], rotation: [0, 0, 0] },
    ...(existing || !fixture.definition.startsWith("bhs:")
      ? {}
      : { definition: { id: fixture.definition, value: inlinePrimitiveDefinition() } }),
  };
  const error = commands.fixtureAddError(command);
  if (error) return;
  commands.apply(command);
});
required<HTMLSelectElement>("[data-grid-snap]").addEventListener("change", (event) => {
  const select = event.currentTarget as HTMLSelectElement;
  required("#snap-status").textContent = select.value === "0" ? "off" : `${select.value} m`;
  if (!commands.isOwner()) return;
  const value = Number(select.value);
  viewportApi.setSnap(value === 0 ? null : value);
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-gizmo-mode]")) {
  button.addEventListener("click", () => {
    if (!commands.isOwner()) return;
    const mode = button.dataset.gizmoMode;
    if (mode !== "translate" && mode !== "rotate") return;
    viewportApi.setGizmoMode(mode);
    for (const candidate of document.querySelectorAll<HTMLButtonElement>("[data-gizmo-mode]")) {
      candidate.dataset.active = String(candidate === button);
    }
  });
}
for (const input of document.querySelectorAll<HTMLInputElement>("[data-placement-field]")) {
  input.addEventListener("change", () => commitNumericPlacement());
}
required<HTMLButtonElement>("[data-undo]").addEventListener("click", () => commands.undo());
required<HTMLButtonElement>("[data-redo]").addEventListener("click", () => commands.redo());
required<HTMLButtonElement>("[data-camera-save]").addEventListener("click", () => {
  if (!commands.isOwner()) return;
  const input = required<HTMLInputElement>("[data-camera-view-name]");
  const name = input.value.trim();
  if (!name) return;
  commands.apply({ kind: "camera.saveView", name, view: viewportApi.cameraView() });
  input.value = "";
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-align]")) {
  button.addEventListener("click", () => {
    if (!commands.isOwner() || selectedIds.length < 2) return;
    const axis = button.dataset.align;
    if (axis !== "x" && axis !== "y" && axis !== "z") return;
    commands.apply({
      kind: "placement.set",
      fixtureIds: [...selectedIds],
      placements: alignTargets(effectivePlacements(), selectedIds, axis),
    });
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-distribute]")) {
  button.addEventListener("click", () => {
    if (!commands.isOwner() || selectedIds.length < 2) return;
    const axis = button.dataset.distribute;
    if (axis !== "x" && axis !== "y" && axis !== "z") return;
    commands.apply({
      kind: "placement.set",
      fixtureIds: [...selectedIds],
      placements: distributeTargets(effectivePlacements(), selectedIds, axis),
    });
  });
}
required<HTMLButtonElement>("[data-revert]").addEventListener("click", () => {
  if (!commands.isOwner() || selectedIds.length === 0) return;
  commands.apply({ kind: "placement.clear", fixtureIds: [...selectedIds] });
});
required<HTMLButtonElement>("[data-rotate-apply]").addEventListener("click", () => {
  if (!commands.isOwner() || selectedIds.length === 0) return;
  const read = (selector: string) => {
    const value = Number(document.querySelector<HTMLInputElement>(selector)?.value);
    return Number.isFinite(value) ? value : 0;
  };
  const delta: [number, number, number] = [
    read('[data-rotate="rx"]'),
    read('[data-rotate="ry"]'),
    read('[data-rotate="rz"]'),
  ];
  if (delta.every((value) => value === 0)) return;
  const mode = required<HTMLSelectElement>("[data-rotate-pivot]").value;
  const pivot: Pivot =
    mode === "explicit"
      ? {
          mode,
          point: [read('[data-pivot="x"]'), read('[data-pivot="y"]'), read('[data-pivot="z"]')],
        }
      : { mode: mode === "shared" ? "shared" : "own" };
  commands.apply({
    kind: "placement.set",
    fixtureIds: [...selectedIds],
    placements: rotateTargets(effectivePlacements(), selectedIds, delta, pivot),
  });
});
required<HTMLButtonElement>("[data-array-save]").addEventListener("click", () => {
  if (!commands.isOwner()) return;
  const id = required<HTMLInputElement>("[data-array-id]").value.trim();
  const kind = required<HTMLSelectElement>("[data-array-kind]").value;
  const known = new Set(editableFixtures.map((fixture) => fixture.id));
  const memberIds = [
    ...new Set(
      required<HTMLInputElement>("[data-array-members]")
        .value.split(",")
        .map((part) => Number(part.trim()))
        .filter((value) => Number.isInteger(value)),
    ),
  ].filter((value) => known.has(value));
  if (!id || memberIds.length === 0) return;
  const numeric = (name: string) => {
    const value = Number(required<HTMLInputElement>(`[data-array="${name}"]`).value);
    return Number.isFinite(value) ? value : 0;
  };
  const tuple = (x: string, y: string, z: string): [number, number, number] => [
    numeric(x),
    numeric(y),
    numeric(z),
  ];
  const array: ArrayDef =
    kind === "line"
      ? {
          kind,
          id,
          memberIds,
          origin: tuple("originX", "originY", "originZ"),
          spacing: tuple("spacingX", "spacingY", "spacingZ"),
        }
      : kind === "grid"
        ? {
            kind,
            id,
            memberIds,
            origin: tuple("originX", "originY", "originZ"),
            spacingX: numeric("spacingX"),
            spacingZ: numeric("spacingZ"),
            columns: Math.max(1, Math.trunc(numeric("columns"))),
          }
        : {
            kind: "radial",
            id,
            memberIds,
            center: tuple("centerX", "centerY", "centerZ"),
            radius: numeric("radius"),
            startAngleDeg: numeric("startAngle"),
            stepDeg: numeric("stepDeg"),
          };
  commands.apply({ kind: "array.set", id, array });
});

if (!viewerSnapshot) {
  liveFeed = new LiveFeed(subscriptionUniverses(commands.fixtures()), {
    frame(universes) {
      for (const universe of universes) {
        receivedUniverses.add(universe.universe);
        latestFrames.set(universe.universe, universe.slots);
      }
      const { levels, states } = applyLocalResolution();
      for (const [id, level] of levels)
        document
          .querySelector<HTMLElement>(`[data-local-fixture="${CSS.escape(String(id))}"]`)
          ?.setAttribute("data-local-level", String(level));
      for (const [id, state] of states) {
        const row = document.querySelector<HTMLElement>(
          `[data-local-fixture="${CSS.escape(String(id))}"]`,
        );
        if (!row) continue;
        row.setAttribute("data-local-level", String(Math.round(state.level * 255)));
        row.setAttribute("data-state", state.status);
        row.setAttribute("data-pan", state.panDeg.toFixed(1));
        row.setAttribute("data-tilt", state.tiltDeg.toFixed(1));
        row.setAttribute("data-zoom", state.zoomDeg === null ? "" : state.zoomDeg.toFixed(1));
        row.setAttribute(
          "data-color",
          [state.color[0] ?? 0, state.color[1] ?? 0, state.color[2] ?? 0]
            .map((channel) => Math.round(channel * 255))
            .join(","),
        );
        row.setAttribute("data-beam", `${state.beam.kind} ${state.beam.angleDeg.toFixed(1)}`);
      }
      for (const [index, strip] of strips.entries()) {
        const definition = referenceStrips[index];
        if (definition && !(holdActive && heldIds.has(definition.id))) {
          const resolved = resolveColor(textureBytesForStrip(definition, effectiveFrames()));
          strip.setPixels(renderMode === "intensity" ? intensityPixels(resolved) : resolved);
        }
      }
      const first = referenceStrips[0]
        ? textureBytesForStrip(referenceStrips[0], effectiveFrames())
        : null;
      const subscriptionElement = required("[data-local-error]");
      subscriptionElement.dataset.subscribed = liveFeed?.subscribed().join(",") ?? "";
      const last = referenceStrips.at(-1)
        ? textureBytesForStrip(referenceStrips.at(-1)!, effectiveFrames())
        : null;
      if (first && last) {
        const readback = required("[data-strip-readback]");
        const value = `${first.slice(0, 3).join(",")}|${last.slice(-3).join(",")}`;
        readback.dataset.stripReadback = value;
        readback.textContent = `Pixel gradient · ${value.replace("|", " → ")}`;
      }
      const universe = universes.find((candidate) => candidate.universe === 1);
      if (!universe) return;
      const resolvedSlots = effectiveFrames().get(1) ?? universe.slots;
      cubes.forEach((cube, index) => {
        if (holdActive && heldIds.has(cube.id)) return;
        const level = resolvedSlots[cube.address - 1] ?? 0;
        cube.setLevel(level);
        const row = fixtureRows[index];
        if (!row) return;
        row.dataset.level = String(level);
        const output = row.querySelector("output");
        if (output) output.textContent = String(level);
      });
      if (latestHealth) renderHealth(latestHealth);
    },
    health(message) {
      latestHealth = message;
      renderHealth(message);
    },
    status(status) {
      const statusElement = required("#feed-status");
      statusElement.textContent = status;
      statusElement.dataset.status = status;
    },
  });
} else {
  enterViewerMode(viewerSnapshot);
}

required<HTMLButtonElement>("[data-share]").addEventListener("click", () => void shareScene());

document.documentElement.dataset.ready = "true";

function renderHealth(message: UniversesMessage): void {
  renderStripTrust(message);
  const universe = message.universes.find((candidate) => candidate.universe === 1);
  const status = required("#universe-status");
  const health = required("#universe-health");
  if (!universe || universe.sources.length === 0) {
    const retainedFrame = receivedUniverses.has(1);
    status.textContent = retainedFrame ? "1 · stale" : "1 · waiting";
    status.dataset.contention = "false";
    health.dataset.stale = String(retainedFrame);
    setFixtureTrust(retainedFrame, false);
  } else {
    const contended = universe.sources.length > 1;
    status.textContent = `1 · ${contended ? "contended" : universe.stale ? "stale" : "live"}`;
    status.dataset.contention = String(contended);
    health.dataset.stale = String(universe.stale);
    setFixtureTrust(universe.stale, contended);
  }
  health.innerHTML =
    message.universes.map(universeSection).join("") ||
    `<div class="empty-state">Waiting for an sACN or Art-Net source…</div>`;

  const terminations = required("#terminations");
  terminations.innerHTML = message.terminations
    .map(
      ({ universe: number, source }) => `
        <p data-termination="${escapeHtml(source.id)}">
          <span>terminated</span> ${escapeHtml(source.name ?? source.id)} released universe ${number}
        </p>`,
    )
    .join("");
  const trustKey = message.universes
    .map((candidate) => `${candidate.universe}:${candidate.stale}:${candidate.sources.length}`)
    .join(";");
  if (trustKey !== lastTrustKey) {
    lastTrustKey = trustKey;
    renderSceneFixtures(commands.fixtures());
  }
}

function universeSection(universe: UniverseHealth): string {
  if (universe.sources.length === 0)
    return `<section data-universe="${universe.universe}"><div class="empty-state">No active source on universe ${universe.universe}</div></section>`;
  return `<section data-universe="${universe.universe}">
    <div class="health-heading"><b>Universe ${universe.universe}</b><span>${universe.stale ? "all stale" : "receiving"}</span></div>
    ${universeMarkup(universe)}</section>`;
}

function renderStripTrust(message: UniversesMessage): void {
  for (const strip of referenceStrips) {
    const universes = strip.addresses.map(({ universe }) =>
      message.universes.find((candidate) => candidate.universe === universe),
    );
    const stale = universes.some((universe) => universe?.stale ?? true);
    const contended = universes.some((universe) => (universe?.sources.length ?? 0) > 1);
    const label = trustLabel(stale, contended);
    const item = document.querySelector<HTMLElement>(`[data-texture-strip="${strip.id}"]`);
    if (!item) continue;
    item.dataset.stale = String(stale);
    item.dataset.contended = String(contended);
    item.textContent = `Spoke ${strip.id} · 23 px${label ? ` · ${label}` : ""}`;
    const renderedStrip = strips.find((candidate) => candidate.id === strip.id);
    renderedStrip?.setTrust(stale, contended);
  }
}

function universeMarkup(universe: UniverseHealth): string {
  return `
    <div class="health-heading">
      <b>Arriving sources</b>
      <span>${universe.sources.length} source${universe.sources.length === 1 ? "" : "s"}</span>
    </div>
    <div class="source-list">
      ${universe.sources
        .map(
          (source) => `
            <article class="source" data-source="${escapeHtml(source.transport)}:${escapeHtml(source.id)}" data-stale="${source.stale}">
              <div class="source-title"><b>${escapeHtml(source.name ?? source.id)}</b><span>${source.transport === "sacn" ? "sACN" : "Art-Net"}</span></div>
              <dl>
                <div><dt>Identity</dt><dd>${escapeHtml(source.id)}</dd></div>
                <div><dt>Arriving</dt><dd>${source.frames} frames · ${source.rateHz} Hz</dd></div>
                <div><dt>Sequence</dt><dd>${source.drops === 0 ? "healthy" : `${source.drops} dropped`}</dd></div>
                <div><dt>State</dt><dd>${source.stale ? "stale" : "live"}</dd></div>
                <div><dt>Priority</dt><dd>${source.priority === null ? "— unavailable" : `${source.priority} claimed`}</dd></div>
                <div><dt>Blind</dt><dd>${source.preview === null ? "— unavailable" : source.preview ? "preview" : "program"}</dd></div>
              </dl>
            </article>`,
        )
        .join("")}
    </div>`;
}

function setFixtureTrust(stale: boolean, contended: boolean): void {
  const label = trustLabel(stale, contended);
  for (const marker of fixtureMarks) {
    marker.textContent = label;
    marker.dataset.visible = String(label.length > 0);
  }
}

function syncSceneFixtures(): void {
  const fixtures = commands.fixtures();
  viewportApi.setSceneFixtures(fixtures, commands.definitions());
  for (const fixture of fixtures)
    defaultPlacements.set(
      fixture.id,
      defaultPlacements.get(fixture.id) ?? {
        position: [0, 0.5, 0],
        rotation: [0, 0, 0],
      },
    );
  renderSceneFixtures(fixtures);
  viewportApi.selectFixtures(selectedIds);
  liveFeed?.setUniverses(subscriptionUniverses(fixtures));
}
function renderSceneFixtures(fixtures: readonly LocalFixture[]): void {
  const overlaps = patchOverlaps(fixtures);
  const marksFor = (fixture: LocalFixture): string[] => {
    const marks: string[] = [];
    if (fixture.addresses.length > 0) {
      const trust = breakTrust(fixture.addresses);
      if (trust.contended) marks.push("disputed");
      if (trust.stale) marks.push("old");
    }
    if (commands.isOverridden(fixture.id)) marks.push("overridden");
    if ((overlaps.get(fixture.id)?.size ?? 0) > 0) marks.push("patch overlap");
    // A definition counts as resolved through any path that renders it: an
    // inline bhs: entry, the reference rig, or the resolve.ts registry the
    // MVR ingest registers its archive into.
    if (
      !commands.definitions()[fixture.definition] &&
      !resolvedReferenceDefinition(fixture.definition) &&
      !hasDefinition(fixture.definition)
    )
      marks.push("unresolved definition");
    if (
      fixture.addresses.length > 0 &&
      fixture.mode.length > 0 &&
      hasDefinition(fixture.definition) &&
      !hasMode(fixture.definition, fixture.mode)
    )
      marks.push("unbound mode");
    if (
      hasDefinition(fixture.definition) &&
      staticsFor(fixture.definition, fixture.mode)?.layout.kind === "marker"
    )
      marks.push("marker · no declared extent");
    // Ingest provenance renders verbatim: every MVR repair and synthesized id
    // is a mark here and an Issues row below.
    if (fixture.marks) marks.push(...fixture.marks);
    return marks;
  };
  const item = (fixture: LocalFixture) => {
    const definition = commands.definitions()[fixture.definition];
    const detail =
      fixture.addresses.length === 0
        ? "no address"
        : fixture.addresses
            .map(
              (address) =>
                `<span data-break="${address.universe}.${String(address.address).padStart(3, "0")}">${address.universe}.${String(address.address).padStart(3, "0")}</span>`,
            )
            .join(" · ");
    const pixels = definition?.kind === "strip" ? ` · ${definition.pixels} px` : "";
    const resolved = resolvedReferenceDefinition(fixture.definition);
    const resolvedDetail = resolved ? ` · ${resolved.length} m · ${resolved.footprint} slots` : "";
    const marks = marksFor(fixture);
    const marksDetail = marks.length > 0 ? ` · ${marks.join(" · ")}` : "";
    const hintDetail =
      (fixture.uuid ? ` · uuid ${escapeHtml(fixture.uuid.slice(0, 8))}` : "") +
      (fixture.revision
        ? ` · rev ${escapeHtml(fixture.revision.length > 32 ? `${fixture.revision.slice(0, 32)}…` : fixture.revision)}`
        : "");
    const edit = definition
      ? `<button type="button" data-edit-definition="${escapeHtml(fixture.definition)}">Edit definition</button>`
      : "";
    const hintAttrs =
      (fixture.uuid ? ` data-uuid="${escapeHtml(fixture.uuid)}"` : "") +
      (fixture.revision ? ` data-revision="${escapeHtml(fixture.revision)}"` : "");
    return `<li role="button" tabindex="0" data-local-fixture="${fixture.id}" data-editable-fixture="${fixture.id}" data-mode="${escapeHtml(fixture.mode)}" data-marks="${escapeHtml(marks.join(" · "))}"${hintAttrs}${resolved ? ` data-resolved-footprint="${resolved.footprint}" data-resolved-length="${resolved.length}"` : ""}><span><b>${fixture.id} · ${escapeHtml(fixture.definition)}${pixels}</b><small>${detail}${resolvedDetail}${marksDetail}${hintDetail}</small></span>${edit}</li>`;
  };
  for (const [kind, list] of [
    ["local-fixtures", fixtures.filter((fixture) => fixture.addresses.length > 0)],
    ["scene-objects", fixtures.filter((fixture) => fixture.addresses.length === 0)],
  ] as const) {
    const host = required(`[data-${kind}]`);
    const signature = list
      .map((fixture) => {
        const definition = commands.definitions()[fixture.definition];
        const pixels = definition?.kind === "strip" ? definition.pixels : "";
        return [
          fixture.id,
          fixture.definition,
          fixture.mode,
          pixels,
          fixture.addresses
            .map((address) => `${address.universe}.${address.address}.${address.footprint}`)
            .join("+"),
          marksFor(fixture).join("+"),
          fixture.uuid ?? "",
          fixture.revision ?? "",
        ].join("|");
      })
      .join(";");
    if (host.dataset.fixtureSignature !== signature) {
      host.dataset.fixtureSignature = signature;
      host.innerHTML = list.map(item).join("");
      bindFixtureRows();
    }
  }
  renderIssues(fixtures, overlaps);
}

function breakTrust(addresses: readonly BreakAddress[]): {
  stale: boolean;
  contended: boolean;
} {
  let stale = false;
  let contended = false;
  if (!latestHealth) return { stale, contended };
  for (const address of addresses) {
    const universe = latestHealth.universes.find(
      (candidate) => candidate.universe === address.universe,
    );
    if (!universe || universe.sources.length === 0) continue;
    stale = stale || universe.stale;
    contended = contended || universe.sources.length > 1;
  }
  return { stale, contended };
}

function breakRanges(fixture: LocalFixture): { universe: number; from: number; to: number }[] {
  const inline = commands.definitions()[fixture.definition];
  const resolved = inline ?? resolvedReferenceDefinition(fixture.definition);
  const stripFootprint =
    resolved && "pixels" in resolved
      ? resolved.pixels * resolved.channelsPerPixel
      : resolved && "footprint" in resolved
        ? resolved.footprint
        : null;
  return fixture.addresses.map((address) => {
    const slots = stripFootprint ?? address.footprint;
    return { universe: address.universe, from: address.address, to: address.address + slots - 1 };
  });
}

function patchOverlaps(fixtures: readonly LocalFixture[]): Map<number, Set<number>> {
  const overlaps = new Map<number, Set<number>>();
  const ranges = fixtures.map((fixture) => ({ fixture, ranges: breakRanges(fixture) }));
  for (let left = 0; left < ranges.length; left += 1) {
    for (let right = left + 1; right < ranges.length; right += 1) {
      const a = ranges[left]!;
      const b = ranges[right]!;
      const shared = a.ranges.some((first) =>
        b.ranges.some(
          (second) =>
            first.universe === second.universe &&
            first.from <= second.to &&
            second.from <= first.to,
        ),
      );
      if (!shared) continue;
      for (const [one, other] of [
        [a.fixture.id, b.fixture.id],
        [b.fixture.id, a.fixture.id],
      ] as const) {
        const entry = overlaps.get(one) ?? new Set<number>();
        entry.add(other);
        overlaps.set(one, entry);
      }
    }
  }
  return overlaps;
}

function renderIssues(fixtures: readonly LocalFixture[], overlaps: Map<number, Set<number>>): void {
  const rows: string[] = [];
  if (patchIssue) rows.push(`<li data-issue="patch:source">${escapeHtml(patchIssue)}</li>`);
  for (const fixture of fixtures) {
    const others = [...(overlaps.get(fixture.id) ?? [])].sort((a, b) => a - b);
    if (others.length > 0)
      rows.push(
        `<li data-issue="overlap:${fixture.id}">Fixture ${fixture.id} · ${escapeHtml(fixture.definition)} shares addressed slots with ${others.join(", ")}</li>`,
      );
    if (
      !commands.definitions()[fixture.definition] &&
      !resolvedReferenceDefinition(fixture.definition) &&
      !hasDefinition(fixture.definition)
    )
      rows.push(
        `<li data-issue="unresolved:${fixture.id}">Fixture ${fixture.id} · ${escapeHtml(fixture.definition)} has no resolved definition and renders a placeholder</li>`,
      );
    if (
      fixture.addresses.length > 0 &&
      fixture.mode.length > 0 &&
      hasDefinition(fixture.definition) &&
      !hasMode(fixture.definition, fixture.mode)
    )
      rows.push(
        `<li data-issue="mode:${fixture.id}">Fixture ${fixture.id} · mode "${escapeHtml(fixture.mode)}" is unavailable and the fixture renders unbound</li>`,
      );
    for (const [index, mark] of (fixture.marks ?? []).entries())
      rows.push(
        `<li data-issue="mvr:${fixture.id}:${index}">Fixture ${fixture.id} · ${escapeHtml(mark)}</li>`,
      );
  }
  required("[data-issues]").innerHTML =
    rows.length === 0
      ? `<li data-issues-empty>No patch issues in the reference rig.</li>`
      : rows.join("");
  required("#patch-status").textContent =
    rows.length === 0
      ? "reference"
      : `reference · ${rows.length} issue${rows.length === 1 ? "" : "s"}`;
}

function bindFixtureRows(): void {
  for (const row of document.querySelectorAll<HTMLElement>("[data-editable-fixture]")) {
    if (row.dataset.selectionBound) continue;
    row.dataset.selectionBound = "true";
    row.addEventListener("click", (event) => {
      selectFixture(Number(row.dataset.editableFixture), event.shiftKey);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      row.click();
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-edit-definition]")) {
    if (button.dataset.definitionBound) continue;
    button.dataset.definitionBound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openDefinitionEditor(button.dataset.editDefinition ?? "");
    });
  }
}

function openDefinitionEditor(id: string): void {
  const definition = commands.definitions()[id];
  if (!definition) return;
  editingDefinition = id;
  const editor = required<HTMLElement>("[data-definition-editor]");
  editor.hidden = false;
  const strip = definition.kind === "strip";
  for (const control of editor.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "[data-definition-strip]",
  ))
    control.closest("label")!.hidden = !strip;
  required<HTMLElement>("[data-definition-primitive-fields]").hidden = strip;
  required("[data-definition-affects]").textContent =
    `Editing ${id} affects ${commands.fixtures().filter((fixture) => fixture.definition === id).length} fixtures.`;
  if (strip) {
    required<HTMLInputElement>('[data-definition-strip="pixels"]').value = String(
      definition.pixels,
    );
    required<HTMLInputElement>('[data-definition-strip="pitch"]').value = String(
      definition.pitchMm,
    );
    required<HTMLInputElement>('[data-definition-strip="channels"]').value = String(
      definition.channelsPerPixel,
    );
    required<HTMLSelectElement>('[data-definition-strip="primitive"]').value = definition.primitive;
  } else {
    required<HTMLSelectElement>('[data-definition-primitive="type"]').value = definition.primitive;
    required<HTMLInputElement>('[data-definition-primitive="width"]').value = String(
      definition.width,
    );
    required<HTMLInputElement>('[data-definition-primitive="depth"]').value = String(
      definition.depth,
    );
    required<HTMLInputElement>('[data-definition-primitive="height"]').value = String(
      definition.height,
    );
  }
}

function inlineStripDefinition(editing = false): BhsDefinition {
  const selector = editing ? "data-definition-strip" : "data-inline-strip";
  const value = (field: string) =>
    Number(required<HTMLInputElement>(`[${selector}="${field}"]`).value);
  const primitive = required<HTMLSelectElement>(`[${selector}="primitive"]`).value;
  return {
    kind: "strip",
    pixels: value("pixels"),
    pitchMm: value("pitch"),
    channelsPerPixel: value("channels"),
    primitive: primitive === "Cylinder" || primitive === "Sphere" ? primitive : "Cube",
  };
}

function inlinePrimitiveDefinition(editing = false): BhsDefinition {
  const selector = editing ? "data-definition-primitive" : "data-object-primitive";
  const value = (field: string) =>
    Number(required<HTMLInputElement>(`[${selector}="${field}"]`).value);
  const primitive = required<HTMLSelectElement>(`[${selector}="type"]`).value;
  return {
    kind: "primitive",
    primitive: primitive === "Cylinder" || primitive === "Sphere" ? primitive : "Cube",
    width: value("width"),
    depth: value("depth"),
    height: value("height"),
  };
}

function localAddresses(): LocalFixture["addresses"] {
  const footprint = Number(required<HTMLInputElement>("[data-local-footprint]").value);
  const primary = {
    universe: Number(required<HTMLInputElement>("[data-local-universe]").value),
    address: Number(required<HTMLInputElement>("[data-local-address]").value),
    footprint,
  };
  const additional = required<HTMLInputElement>("[data-local-breaks]")
    .value.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const [universe, address] = value.split(".");
      return { universe: Number(universe), address: Number(address), footprint };
    });
  return [primary, ...additional];
}

function subscriptionUniverses(fixtures: readonly LocalFixture[]): number[] {
  return [
    1,
    ...universesForStrips(referenceStrips),
    ...fixtures.flatMap((fixture) => fixture.addresses.map((address) => address.universe)),
  ];
}

function localFixtureLevels(): Map<number, number> {
  const levels = new Map<number, number>();
  for (const fixture of commands.fixtures()) {
    const inline = commands.definitions()[fixture.definition];
    const resolved = inline ?? resolvedReferenceDefinition(fixture.definition);
    const stripFootprint =
      resolved && "pixels" in resolved
        ? resolved.pixels * resolved.channelsPerPixel
        : resolved && "footprint" in resolved
          ? resolved.footprint
          : null;
    let level = 0;
    for (const address of fixture.addresses) {
      const slots = effectiveFrames().get(address.universe);
      if (!slots) continue;
      const footprint = stripFootprint ?? address.footprint;
      for (const value of slots.subarray(address.address - 1, address.address - 1 + footprint))
        level = Math.max(level, value ?? 0);
    }
    if (fixture.addresses.length > 0) levels.set(fixture.id, level);
  }
  return levels;
}
/** Per-fixture hang values for Zoom channels with no wire (ADR-0037 decision 7). */
const zoomOverrides = new Map<number, number>();

function localFixtureStates(): Map<number, FixtureState> {
  const states = new Map<number, FixtureState>();
  const frames = effectiveFrames();
  for (const fixture of commands.fixtures()) {
    if (!hasDefinition(fixture.definition) || fixture.addresses.length === 0) continue;
    const zoomDeg = zoomOverrides.get(fixture.id);
    states.set(
      fixture.id,
      resolveFixture(
        fixture.definition,
        fixture.mode,
        (universe, slot) => frames.get(universe)?.[slot - 1],
        fixture.addresses,
        zoomDeg === undefined ? undefined : { zoomDeg },
      ),
    );
  }
  return states;
}
function applyLocalResolution(): {
  levels: Map<number, number>;
  states: Map<number, FixtureState>;
} {
  const levels = localFixtureLevels();
  const states = localFixtureStates();
  if (holdActive)
    for (const id of heldIds) {
      levels.delete(id);
      states.delete(id);
    }
  // Registered fixtures resolve through the states seam; the levels map keeps the rest.
  for (const id of states.keys()) levels.delete(id);
  viewportApi.setSceneFixtureLevels(levels);
  viewportApi.setSceneFixtureStates(states);
  return { levels, states };
}

function effectivePlacements(): Map<number, Placement> {
  const placements = new Map<number, Placement>();
  for (const fixture of editableFixtures) {
    const fallback = defaultPlacements.get(fixture.id);
    if (fallback) placements.set(fixture.id, commands.placement(fixture.id, fallback));
  }
  return placements;
}

function commitNumericPlacement(): void {
  const target = selectedIds[0];
  if (!commands.isOwner() || target === undefined) return;
  const fixture = editableFixtures.find((candidate) => candidate.id === target);
  if (!fixture) return;
  const current = fixture.placement();
  const read = (field: string, fallback: number) => {
    const value = Number(required<HTMLInputElement>(`[data-placement-field="${field}"]`).value);
    return Number.isFinite(value) ? value : fallback;
  };
  const placement: Placement = {
    position: [
      read("x", current.position[0]),
      read("y", current.position[1]),
      read("z", current.position[2]),
    ],
    rotation: [
      read("rx", current.rotation[0]),
      read("ry", current.rotation[1]),
      read("rz", current.rotation[2]),
    ],
  };
  if (samePlacement(current, placement)) return;
  commands.apply({
    kind: "placement.set",
    fixtureIds: [target],
    placements: { [target]: placement },
  });
}

function renderPlacementEditor(): void {
  const owner = commands.isOwner();
  viewportApi.setEditable(owner);
  for (const editableFixture of editableFixtures) {
    const fallback = defaultPlacements.get(editableFixture.id);
    if (!fallback) throw new Error(`missing default placement for fixture ${editableFixture.id}`);
    editableFixture.setPlacement(commands.placement(editableFixture.id, fallback));
  }
  const controls = required("[data-placement-controls]");
  const empty = required("[data-placement-empty]");
  const fixture = editableFixtures?.find((candidate) => candidate.id === selectedIds[0]);
  controls.hidden = !fixture;
  empty.hidden = Boolean(fixture);
  if (fixture) {
    const fallback = defaultPlacements.get(fixture.id);
    if (!fallback) throw new Error(`missing default placement for fixture ${fixture.id}`);
    const placement = commands.placement(fixture.id, fallback);
    const values: Record<string, number> = {
      x: placement.position[0],
      y: placement.position[1],
      z: placement.position[2],
      rx: placement.rotation[0],
      ry: placement.rotation[1],
      rz: placement.rotation[2],
    };
    for (const [field, value] of Object.entries(values))
      required<HTMLInputElement>(`[data-placement-field="${field}"]`).value = String(value);
    controls.setAttribute("data-placement-x", String(placement.position[0]));
  }
  required("#selection-status").textContent =
    selectedIds.length === 0 ? "none" : selectedIds.join(",");
  const arrange = required("[data-arrange]");
  arrange.dataset.selectionIds = selectedIds.join(",");
  required("[data-selection-count]").textContent = String(selectedIds.length);
  for (const row of document.querySelectorAll<HTMLElement>("[data-editable-fixture]")) {
    row.dataset.selected = String(selectedIds.includes(Number(row.dataset.editableFixture)));
  }
  const defined = Object.values(commands.arrays());
  required("[data-array-status]").textContent =
    defined.length === 0
      ? "No array"
      : defined.map((array) => `${array.id} · ${array.memberIds.length} members`).join(" · ");
  required("#ownership-status").textContent = owner
    ? "owner"
    : commands.ownerName()
      ? `follower · ${commands.ownerName()}`
      : "unowned";
  required<HTMLButtonElement>('[data-gizmo-mode="translate"]').dataset.active ??= "true";
  controls.dataset.readonly = String(!owner);
  for (const control of controls.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement
  >("input, select, button"))
    control.disabled = !owner;
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    "[data-camera-mutation]",
  ))
    control.disabled = !owner;
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement
  >("[data-arrange-mutation]"))
    control.disabled = !owner;
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement
  >(
    '[data-local-fixtures] input, [data-local-fixtures] select, [data-local-fixtures] button, [data-definition-editor] input, [data-definition-editor] select, [data-definition-editor] button, [data-overlay-panel="objects"] input, [data-overlay-panel="objects"] select, [data-overlay-panel="objects"] button',
  ))
    control.disabled = !owner;
  required("[data-history-count]").textContent = String(commands.historyCount());
  const journal = required("[data-history]");
  const entries = commands.history();
  journal.innerHTML =
    entries.length === 0
      ? `<li data-history-empty>No commands yet.</li>`
      : entries
          .map(
            (entry) =>
              `<li data-history-entry data-undone="${entry.undone}" data-agent="${entry.agent}">${entry.agent ? "agent · " : ""}${escapeHtml(entry.label)}</li>`,
          )
          .join("");
  required<HTMLButtonElement>("[data-undo]").disabled = !owner || !commands.canUndo();
  required<HTMLButtonElement>("[data-redo]").disabled = !owner || !commands.canRedo();
  // A shared link carries its own frozen views; the command journal behind them is unreachable.
  if (viewerActive) return;
  const views = required("[data-camera-views]");
  views.innerHTML = Object.keys(commands.views())
    .sort()
    .map(
      (name) =>
        `<button type="button" data-camera-view="${escapeHtml(name)}">${escapeHtml(name)}</button>`,
    )
    .join("");
  for (const button of views.querySelectorAll<HTMLButtonElement>("[data-camera-view]")) {
    button.addEventListener("click", () => {
      const view = commands.views()[button.dataset.cameraView ?? ""];
      if (view) viewportApi.setCameraView(view);
    });
  }
}

function openOverlay(tab: string): void {
  const overlay = required("[data-overlay]");
  overlay.hidden = false;
  for (const panel of overlay.querySelectorAll<HTMLElement>("[data-overlay-panel]")) {
    const active = panel.dataset.overlayPanel === tab;
    panel.hidden = !active;
  }
  for (const button of overlay.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]")) {
    const active = button.dataset.overlayTab === tab;
    button.dataset.active = String(active);
    button.setAttribute("aria-selected", String(active));
  }
  overlay
    .querySelector<HTMLElement>(`[data-overlay-panel="${tab}"]`)
    ?.setAttribute("tabindex", "-1");
}
function selectFixture(id: number, additive: boolean): void {
  if (viewerActive && additive) return;
  if (additive) {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((member) => member !== id)
      : [...selectedIds, id];
  } else {
    selectedIds = [id];
  }
  if (holdActive) pinHold();
  viewportApi.selectFixtures(selectedIds);
  renderPlacementEditor();
  // The phone chip carries the count, never the name (ADR-0032 §6).
  if (viewerActive)
    required("#selection-status").textContent =
      selectedIds.length === 0 ? "none" : `SEL ${selectedIds.length}`;
}

/** Frames resolve from the generated look when one is held, else from live DMX. */
function effectiveFrames(): ReadonlyMap<number, Uint8Array> {
  return activeFeed === "generated" && generated.hasFrame() ? generated.frame() : latestFrames;
}

function resolvingFeed(): FeedId {
  return activeFeed === "generated" && generated.hasFrame() ? "generated" : "live";
}

/** The owning page applies control-channel requests through its existing seams. */
async function handleAgentRequest(requestId: number, request: AgentRequest): Promise<void> {
  try {
    switch (request.class) {
      case "command":
        commands.respond(requestId, {
          ok: true,
          result: applyAgentCommand(request.name, request.params),
        });
        return;
      case "query":
        commands.respond(requestId, {
          ok: true,
          result: answerAgentQuery(request.name, request.params),
        });
        return;
      case "look":
        commands.respond(requestId, { ok: true, result: applyAgentLook(request.params) });
        return;
      case "capture":
        commands.respond(requestId, { ok: true, result: await captureAgentView(request.params) });
        return;
      default:
        commands.respond(requestId, { ok: false, error: `unknown request class` });
    }
  } catch (error) {
    commands.respond(requestId, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Commands carry explicit ids and exact values; all land in the shared undo stack, marked. */
function applyAgentCommand(name: string, params: Record<string, unknown>): unknown {
  if (name === "rotate") {
    const fixtureIds = exactIds(params.fixtureIds, "rotate");
    const delta = exactTriple(params.delta, "rotate");
    const pivot = exactPivot(params.pivot);
    const placements = rotateTargets(effectivePlacements(), fixtureIds, delta, pivot);
    commands.apply({ kind: "placement.set", fixtureIds, placements }, { agent: true });
    return { applied: fixtureIds, history: commands.historyCount() };
  }
  if (name === "placement.set") {
    const fixtureIds = exactIds(params.fixtureIds, "placement.set");
    const raw = params.placements;
    if (!raw || typeof raw !== "object") throw new Error("placement.set needs exact placements");
    const placements: Record<string, Placement> = {};
    for (const id of fixtureIds) {
      const placement = (raw as Record<string, unknown>)[String(id)];
      if (!placement || typeof placement !== "object")
        throw new Error(`placement.set needs exact values for fixture ${id}`);
      const { position, rotation } = placement as Record<string, unknown>;
      placements[String(id)] = {
        position: exactTriple(position, "placement.set"),
        rotation: exactTriple(rotation, "placement.set"),
      };
    }
    commands.apply({ kind: "placement.set", fixtureIds, placements }, { agent: true });
    return { applied: fixtureIds, history: commands.historyCount() };
  }
  if (name === "placement.clear") {
    const fixtureIds = exactIds(params.fixtureIds, "placement.clear");
    commands.apply({ kind: "placement.clear", fixtureIds }, { agent: true });
    return { applied: fixtureIds, history: commands.historyCount() };
  }
  if (name === "array.set") {
    if (typeof params.id !== "string" || params.id.length === 0)
      throw new Error("array.set needs an id");
    if (!params.array || typeof params.array !== "object")
      throw new Error("array.set needs an array");
    const staged = exactArray(params.array as Record<string, unknown>);
    commands.apply(
      { kind: "array.set", id: params.id, array: { ...staged, id: params.id } },
      { agent: true },
    );
    return { applied: params.id, history: commands.historyCount() };
  }
  if (name === "camera.saveView") {
    if (typeof params.name !== "string" || params.name.length === 0)
      throw new Error("camera.saveView needs a name");
    const view = params.view;
    if (!view || typeof view !== "object") throw new Error("camera.saveView needs a view");
    const { position, target } = view as Record<string, unknown>;
    commands.apply(
      {
        kind: "camera.saveView",
        name: params.name,
        view: {
          position: exactTriple(position, "camera.saveView"),
          target: exactTriple(target, "camera.saveView"),
        },
      },
      { agent: true },
    );
    return { applied: params.name, history: commands.historyCount() };
  }
  if (name === "fixture.add") {
    const raw = params.fixture;
    if (!raw || typeof raw !== "object") throw new Error("fixture.add needs a fixture");
    const candidate = raw as Record<string, unknown>;
    if (!Number.isInteger(candidate.id) || (candidate.id as number) >= 0)
      throw new Error("fixture.add needs a new negative fixture id");
    if (typeof candidate.definition !== "string" || candidate.definition.length === 0)
      throw new Error("fixture.add needs a definition id");
    if (typeof candidate.mode !== "string") throw new Error("fixture.add needs a mode");
    if (!Array.isArray(candidate.addresses)) throw new Error("fixture.add needs addresses");
    const placement = params.placement;
    if (!placement || typeof placement !== "object")
      throw new Error("fixture.add needs an exact placement");
    const { position, rotation } = placement as Record<string, unknown>;
    const command: Extract<SceneCommand, { kind: "fixture.add" }> = {
      kind: "fixture.add",
      fixture: {
        id: candidate.id as number,
        definition: candidate.definition,
        mode: candidate.mode,
        addresses: candidate.addresses.map((address) => exactBreak(address)),
      },
      placement: {
        position: exactTriple(position, "fixture.add"),
        rotation: exactTriple(rotation, "fixture.add"),
      },
    };
    if (params.definition !== undefined) {
      const inline = params.definition;
      if (!inline || typeof inline !== "object")
        throw new Error("fixture.add needs a definition object");
      const { id, value } = inline as Record<string, unknown>;
      if (typeof id !== "string" || id.length === 0 || !value || typeof value !== "object")
        throw new Error("fixture.add needs a definition id and value");
      command.definition = { id, value: value as BhsDefinition };
    }
    const rejection = commands.fixtureAddError(command);
    if (rejection) throw new Error(rejection);
    commands.apply(command, { agent: true });
    return { history: commands.historyCount() };
  }
  if (name === "definition.set") {
    if (typeof params.id !== "string" || !params.id.startsWith("bhs:"))
      throw new Error("definition.set needs a bhs: id");
    if (!params.value || typeof params.value !== "object")
      throw new Error("definition.set needs a value");
    const rejection = commands.definitionSetError(params.id, params.value);
    if (rejection) throw new Error(rejection);
    commands.apply(
      { kind: "definition.set", id: params.id, value: params.value as BhsDefinition },
      { agent: true },
    );
    return { history: commands.historyCount() };
  }
  throw new Error(`unknown command ${name}`);
}

function exactIds(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => Number.isInteger(id)))
    throw new Error(`${name} needs non-empty integer fixture ids`);
  return value as number[];
}

function exactTriple(value: unknown, name: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => Number.isFinite(n)))
    throw new Error(`${name} needs exact numeric triples`);
  return value as [number, number, number];
}

/** Arrays carry exact values like every command: the resolver has no defaults to inherit. */
function exactArray(value: Record<string, unknown>): ArrayDef {
  const memberIds = exactIds(value.memberIds, "array.set");
  if (value.kind === "radial") {
    const center = value.center;
    const radius = Number(value.radius);
    const startAngleDeg = Number(value.startAngleDeg);
    const stepDeg = Number(value.stepDeg);
    if (!Array.isArray(center) || center.length !== 3 || !center.every((n) => Number.isFinite(n)))
      throw new Error("array.set needs an exact radial center");
    if (![radius, startAngleDeg, stepDeg].every((n) => Number.isFinite(n)))
      throw new Error("array.set needs exact radial radius, startAngleDeg, and stepDeg");
    return {
      kind: "radial",
      id: "",
      memberIds,
      center: center as [number, number, number],
      radius,
      startAngleDeg,
      stepDeg,
    };
  }
  if (value.kind === "line") {
    const origin = value.origin;
    const spacing = value.spacing;
    if (!Array.isArray(origin) || !Array.isArray(spacing))
      throw new Error("array.set needs an exact line origin and spacing");
    return {
      kind: "line",
      id: "",
      memberIds,
      origin: exactTriple(origin, "array.set"),
      spacing: exactTriple(spacing, "array.set"),
    };
  }
  if (value.kind === "grid") {
    const spacingX = Number(value.spacingX);
    const spacingZ = Number(value.spacingZ);
    const columns = Number(value.columns);
    if (![spacingX, spacingZ, columns].every((n) => Number.isFinite(n)))
      throw new Error("array.set needs exact grid spacingX, spacingZ, and columns");
    return {
      kind: "grid",
      id: "",
      memberIds,
      origin: exactTriple(value.origin, "array.set"),
      spacingX,
      spacingZ,
      columns: Math.max(1, Math.trunc(columns)),
    };
  }
  throw new Error("array.set needs kind radial, line, or grid with explicit geometry");
}

function exactBreak(value: unknown): BreakAddress {
  if (!value || typeof value !== "object")
    throw new Error("fixture.add needs exact break addresses");
  const address = value as Record<string, unknown>;
  const universe = Number(address.universe);
  const slot = Number(address.address);
  const footprint = Number(address.footprint);
  if (!Number.isInteger(universe) || universe < 1 || universe > 63999)
    throw new Error("fixture.add needs break universes 1-63999");
  if (!Number.isInteger(slot) || slot < 1 || slot > 512)
    throw new Error("fixture.add needs break addresses 1-512");
  if (!Number.isInteger(footprint) || footprint < 1)
    throw new Error("fixture.add needs positive break footprints");
  return { universe, address: slot, footprint };
}

function exactPivot(value: unknown): Pivot {
  if (!value || typeof value !== "object") throw new Error("rotate needs a pivot");
  const pivot = value as Record<string, unknown>;
  if (pivot.mode === "own" || pivot.mode === "shared") return { mode: pivot.mode };
  if (pivot.mode === "explicit")
    return { mode: "explicit", point: exactTriple(pivot.point, "rotate") };
  throw new Error("rotate needs a pivot with mode own, shared, or explicit");
}

/** Queries read and move cursors; none mutate the persistent scene or earn undo entries. */
function answerAgentQuery(name: string, params: Record<string, unknown>): unknown {
  switch (name) {
    case "rig.list":
      return {
        feed: resolvingFeed(),
        referenceStrips: referenceStrips.map((strip) => ({
          id: strip.id,
          pixels: strip.pixels,
          addresses: strip.addresses,
          placement: strip.placement,
        })),
        sceneFixtures: commands.fixtures().map((fixture) => ({
          ...fixture,
          placement: commands.placement(fixture.id, { position: [0, 0, 0], rotation: [0, 0, 0] }),
          marks: breakTrust(fixture.addresses),
        })),
        arrays: commands.arrays(),
        views: Object.keys(commands.views()),
      };
    case "fixture.get": {
      if (!Number.isInteger(params.id)) throw new Error("fixture.get needs an integer id");
      const scene = commands.fixtures().find((fixture) => fixture.id === params.id);
      if (scene)
        return {
          ...scene,
          placement: commands.placement(scene.id, { position: [0, 0, 0], rotation: [0, 0, 0] }),
          level: localFixtureLevels().get(scene.id) ?? 0,
          marks: breakTrust(scene.addresses),
        };
      const strip = referenceStrips.find((candidate) => candidate.id === params.id);
      if (strip) return { ...strip, level: 0, marks: { stale: false, contended: false } };
      throw new Error(`unknown fixture ${String(params.id)}`);
    }
    case "issues.list": {
      const overlaps = patchOverlaps(commands.fixtures());
      return {
        overlaps: [...overlaps.entries()].map(([slot, ids]) => ({ slot, fixtures: [...ids] })),
        fixtures: commands
          .fixtures()
          .map((fixture) => ({ id: fixture.id, marks: breakTrust(fixture.addresses) })),
      };
    }
    case "universes.list":
      return {
        health: latestHealth,
        subscribed: liveFeed?.subscribed() ?? [],
        received: [...receivedUniverses],
      };
    case "history":
      return {
        entries: commands.history(),
        canUndo: commands.canUndo(),
        canRedo: commands.canRedo(),
      };
    case "measurements":
      return {
        feed: resolvingFeed(),
        levels: Object.fromEntries(localFixtureLevels()),
        universes: latestHealth?.universes ?? [],
      };
    case "camera.get":
      return viewportApi.cameraView();
    case "camera.set": {
      const view = params.view;
      if (!view || typeof view !== "object") throw new Error("camera.set needs a view");
      const { position, target } = view as Record<string, unknown>;
      const next = {
        position: exactTriple(position, "camera.set"),
        target: exactTriple(target, "camera.set"),
      };
      viewportApi.setCameraView(next);
      return next;
    }
    case "select": {
      if (
        params.ids !== undefined &&
        (!Array.isArray(params.ids) || !params.ids.every((id) => Number.isInteger(id)))
      )
        throw new Error("select needs an integer id array");
      const ids = Array.isArray(params.ids) ? (params.ids as number[]) : [];
      selectedIds = [...new Set(ids)];
      if (holdActive) pinHold();
      viewportApi.selectFixtures(selectedIds);
      renderPlacementEditor();
      return { selected: selectedIds };
    }
    case "hold": {
      if (typeof params.on !== "boolean") throw new Error("hold needs a boolean on");
      holdActive = params.on;
      heldIds.clear();
      if (holdActive) {
        const ids = Array.isArray(params.ids) ? params.ids : selectedIds;
        for (const id of ids) if (Number.isInteger(id)) heldIds.add(id as number);
      }
      required("#hold-status").textContent = holdActive ? "on" : "off";
      required("[data-hold-toggle]").setAttribute("aria-pressed", String(holdActive));
      return { hold: holdActive, held: [...heldIds] };
    }
    case "undo":
      commands.undo();
      return { canUndo: commands.canUndo(), canRedo: commands.canRedo() };
    case "redo":
      commands.redo();
      return { canUndo: commands.canUndo(), canRedo: commands.canRedo() };
    default:
      throw new Error(`unknown query ${name}`);
  }
}

/** A look sets the generated frame and holds it above the resolution seam. */
function applyAgentLook(params: Record<string, unknown>): unknown {
  if (params.clear === true || params.feed === "live") {
    generated.clear();
    activeFeed = "live";
  } else {
    const slots = params.slots;
    if (!slots || typeof slots !== "object") throw new Error("look needs slots or clear");
    generated.setFrame(slots as Record<string, number[]>);
    activeFeed = "generated";
  }
  required("#viewport").dataset.feed = resolvingFeed();
  paintGeneratedLevels();
  return { feed: resolvingFeed() };
}

function paintGeneratedLevels(): void {
  const frames = effectiveFrames();
  applyLocalResolution();
  for (const [index, strip] of strips.entries()) {
    const definition = referenceStrips[index];
    if (definition && !(holdActive && heldIds.has(definition.id))) {
      const resolved = resolveColor(textureBytesForStrip(definition, frames));
      strip.setPixels(renderMode === "intensity" ? intensityPixels(resolved) : resolved);
    }
  }
}

/** Captures are handles: bytes go to the bridge over HTTP, the reply states the rest. */
async function captureAgentView(params: Record<string, unknown>): Promise<unknown> {
  const maxEdge = params.maxEdge === undefined ? 1280 : Number(params.maxEdge);
  const quality = params.quality === undefined ? 0.8 : Number(params.quality);
  if (!Number.isFinite(maxEdge) || maxEdge < 16 || maxEdge > 4096)
    throw new Error("maxEdge must be between 16 and 4096");
  if (!Number.isFinite(quality) || quality < 0.1 || quality > 1)
    throw new Error("quality must be between 0.1 and 1");
  const shot = await viewportApi.capture(maxEdge, quality);
  // Mirrors the bridge's hard cap: over-cap is an error naming the size, never truncated output.
  if (shot.bytes.byteLength > 1000000)
    throw new Error(`capture is ${shot.bytes.byteLength} bytes, over the 1000000 byte cap`);
  const captureId = crypto.randomUUID();
  const feed = resolvingFeed();
  const stored = await fetch(`/capture/${captureId}`, {
    method: "POST",
    headers: {
      "content-type": "image/jpeg",
      "x-capture-feed": feed,
      "x-capture-width": String(shot.width),
      "x-capture-height": String(shot.height),
      "x-capture-downscaled": String(shot.downscaled),
    },
    body: shot.bytes.slice().buffer,
  });
  if (stored.status === 413) throw new Error(await stored.text());
  if (!stored.ok) throw new Error(`capture store refused the upload (${stored.status})`);
  return {
    captureId,
    width: shot.width,
    height: shot.height,
    size: shot.bytes.byteLength,
    downscaled: shot.downscaled,
    feed,
  };
}

function resolveShareReference(id: string): BhsDefinition | null {
  const resolved = resolvedReferenceDefinition(id);
  if (!resolved) return null;
  const pixels =
    referenceStrips.find((strip) => strip.definitionId === id)?.pixels ??
    referenceStrips[0]?.pixels ??
    23;
  return {
    kind: "strip",
    pixels,
    pitchMm: Math.round((resolved.length * 1000) / pixels),
    channelsPerPixel: Math.max(1, Math.round(resolved.footprint / pixels)),
    primitive: "Cube",
  };
}

async function shareScene(): Promise<string | null> {
  const state = required("[data-share-state]");
  const result = await encodeShareSnapshot({
    fixtures: commands.fixtures(),
    definitions: commands.definitions(),
    placements: effectivePlacements(),
    views: commands.views(),
    resolveReference: resolveShareReference,
  });
  if (result.kind === "link") {
    location.hash = result.fragment;
    state.textContent = "copied";
    const url = `${location.origin}${location.pathname}#${result.fragment}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard denial still leaves the link in the address bar.
    }
    return url;
  }
  const blob = new Blob([result.json], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = result.filename;
  // A detached anchor click is ignored in Firefox: attach, click, remove.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  // §9.1 fallback copy, stated in the UI where the link would have been.
  state.textContent = "file";
  state.title = "Link too large for a URL — downloaded the snapshot as .bhs instead.";
  return null;
}

function enterViewerMode(snapshot: ShareSnapshot): void {
  viewerActive = true;
  document.body.dataset.viewer = "true";
  const brand = document.querySelector(".brand strong");
  if (brand) brand.textContent = "Beamhouse · demo";
  // Actionable chips only: Selection + Camera survive (ADR-0032 §2).
  for (const chip of document.querySelectorAll<HTMLElement>(".status-chips .chip")) {
    const label = chip.querySelector("span")?.textContent;
    if (label !== "Selection" && label !== "Camera") chip.hidden = true;
  }
  for (const tab of document.querySelectorAll<HTMLElement>("[data-overlay-tab]")) {
    if (tab.dataset.overlayTab !== "fixtures" && tab.dataset.overlayTab !== "objects")
      tab.hidden = true;
  }
  const { definitions, fixtures, placements } = snapshotScene(snapshot);
  viewportApi.setSceneFixtures(fixtures, definitions);
  // Objects joins the viewer list only when non-empty (ADR-0032 §5).
  if (!fixtures.some((fixture) => fixture.addresses.length === 0))
    document.querySelector<HTMLElement>('[data-overlay-tab="objects"]')!.hidden = true;
  for (const fixture of fixtures) {
    const placement = placements.get(fixture.id);
    if (placement) defaultPlacements.set(fixture.id, placement);
  }
  for (const editable of editableFixtures) {
    const placement = placements.get(editable.id) ?? defaultPlacements.get(editable.id);
    if (placement) editable.setPlacement(commands.placement(editable.id, placement));
  }
  const age = required("[data-snapshot-age]");
  age.textContent = formatSnapshotAge(snapshot.takenAt);
  age.hidden = false;
  required("[data-viewport-hint]").textContent = "Tap to select · drag to orbit";
  const list = required("[data-viewer-list]");
  list.hidden = false;
  const host = required("[data-viewer-fixtures]");
  host.innerHTML = fixtures
    .map(
      (fixture) =>
        `<li role="button" tabindex="0" data-viewer-fixture="${fixture.id}" data-editable-fixture="${fixture.id}"><span><b>${fixture.id} · ${escapeHtml(fixture.mode)}</b><small>${fixture.addresses.map((address) => `${address.universe}.${String(address.address).padStart(3, "0")}`).join(" · ") || "no address"}</small></span></li>`,
    )
    .join("");
  required("[data-viewer-count]").textContent =
    fixtures.length === 1 ? "1 fixture" : `${fixtures.length} fixtures`;
  for (const row of host.querySelectorAll<HTMLElement>("[data-viewer-fixture]"))
    row.addEventListener("click", () => selectFixture(Number(row.dataset.viewerFixture), false));
  const names = Object.keys(snapshot.views);
  if (names.length > 0) {
    const views = required("[data-camera-views]");
    views.innerHTML = names
      .sort()
      .map(
        (name) =>
          `<button type="button" data-camera-view="${escapeHtml(name)}">${escapeHtml(name)}</button>`,
      )
      .join("");
    for (const button of views.querySelectorAll<HTMLButtonElement>("[data-camera-view]")) {
      button.disabled = false;
      button.addEventListener("click", () => {
        const view = snapshot.views[button.dataset.cameraView ?? ""];
        if (view) viewportApi.setCameraView(view);
      });
    }
  }
  viewportApi.frameContentBox([
    ...referenceStrips.map((strip) => strip.placement.position),
    ...fixtures.map(
      (fixture) =>
        placements.get(fixture.id)?.position ?? ([0, 0.5, 0] as [number, number, number]),
    ),
  ]);
  renderPlacementEditor();
  if (viewerActive) required("#selection-status").textContent = "none";
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !required("[data-overlay]").hidden)
    required("[data-overlay]").hidden = true;
});
function pinHold(): void {
  heldIds.clear();
  for (const id of selectedIds) heldIds.add(id);
}
const intensityScratch = new Map<number, Float32Array>();
function intensityPixels(resolved: LinearRGB): LinearRGB {
  let out = intensityScratch.get(resolved.length);
  if (!out) {
    out = new Float32Array(resolved.length);
    intensityScratch.set(resolved.length, out);
  }
  for (let index = 0; index + 2 < resolved.length; index += 3) {
    const peak = Math.max(resolved[index]!, resolved[index + 1]!, resolved[index + 2]!);
    out[index] = peak;
    out[index + 1] = peak;
    out[index + 2] = peak;
  }
  return mintLinearRGB(out);
}

function trustLabel(stale: boolean, contended: boolean): string {
  return [contended ? "disputed" : "", stale ? "old" : ""].filter(Boolean).join(" · ");
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  // Text nodes never emit a raw quote, but attributes interpolate the same
  // helper — an unescaped quote would truncate the attribute at first use.
  return node.innerHTML.replace(/"/g, "&quot;");
}
