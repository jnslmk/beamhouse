import type { UniverseHealth, UniversesMessage } from "@beamhouse/wire";
import { LiveFeed } from "./live-feed.ts";
import {
  referenceStrips,
  resolvedReferenceDefinition,
  resolveColor,
  textureBytesForStrip,
  universesForStrips,
  type LinearRGB,
} from "./reference-rig.ts";
import { createViewport, type StripProbeMarkers } from "./viewport.ts";
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
  type Placement,
  type SceneCommand,
} from "./scene.ts";
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
    </div>
  </header>
  <section class="workspace">
    <div id="viewport" aria-label="Live cube and STAR-TENT strip reference patch">
      <div class="viewport-marks" aria-live="polite">
        <span class="fixture-mark" data-fixture-mark="1"></span>
        <span class="fixture-mark" data-fixture-mark="2"></span>
        <span class="fixture-mark" data-fixture-mark="3"></span>
        ${referenceStrips.map((strip) => `<span class="strip-mark" data-strip-mark="${strip.id}"></span>`).join("")}
        ${referenceStrips.map((strip) => `<span data-strip-probe="${strip.id}-start"></span><span data-strip-probe="${strip.id}-end"></span>`).join("")}
      <div class="render-note" data-intensity-note hidden>Intensity map · relative per emitter · no photometric claim</div>
    </div>
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
      <section class="local-fixtures" aria-label="Local fixtures">
        <div class="health-heading"><b>Local fixtures</b><output data-local-error></output></div>
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
      <section data-overlay-panel="issues" hidden><p class="lede">Every issue originates in an ingest; the count rides the Patch chip.</p><ol data-issues><li data-issues-empty>No patch issues in the reference rig.</li></ol></section>
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
let selectedIds: number[] = [];
let holdActive = false;
let renderMode: "live" | "intensity" = "live";
const heldIds = new Set<number>();
let editingDefinition: string | null = null;
const commands = await SceneCommands.create();
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
const fixtureRows = [...document.querySelectorAll<HTMLElement>("[data-fixture]")];
const receivedUniverses = new Set<number>();
const latestFrames = new Map<number, Uint8Array>();
let latestHealth: UniversesMessage | null = null;
let lastTrustKey = "";
let liveFeed: LiveFeed | null = null;

const defaultPlacements = new Map(
  editableFixtures.map((fixture) => [fixture.id, fixture.placement()]),
);
for (const fixture of editableFixtures) {
  const fallback = defaultPlacements.get(fixture.id);
  if (fallback) fixture.setPlacement(commands.placement(fixture.id, fallback));
}
syncSceneFixtures();
commands.onChanged(() => {
  syncSceneFixtures();
  renderPlacementEditor();
});
renderPlacementEditor();

required<HTMLButtonElement>("[data-takeover]").addEventListener("click", () => {
  if (
    commands.isOwner() ||
    confirm(`Take over scene from ${commands.ownerName() ?? "the current owner"}?`)
  )
    commands.takeover();
});

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

liveFeed = new LiveFeed(subscriptionUniverses(commands.fixtures()), {
  frame(universes) {
    for (const universe of universes) {
      receivedUniverses.add(universe.universe);
      latestFrames.set(universe.universe, universe.slots);
    }
    const levels = localFixtureLevels();
    if (holdActive) for (const id of heldIds) levels.delete(id);
    viewportApi.setSceneFixtureLevels(levels);
    for (const [id, level] of levels)
      document
        .querySelector<HTMLElement>(`[data-local-fixture="${CSS.escape(String(id))}"]`)
        ?.setAttribute("data-local-level", String(level));
    for (const [index, strip] of strips.entries()) {
      const definition = referenceStrips[index];
      if (definition && !(holdActive && heldIds.has(definition.id))) {
        const resolved = resolveColor(textureBytesForStrip(definition, latestFrames));
        strip.setPixels(renderMode === "intensity" ? intensityPixels(resolved) : resolved);
      }
    }
    const first = referenceStrips[0]
      ? textureBytesForStrip(referenceStrips[0], latestFrames)
      : null;
    const subscriptionElement = required("[data-local-error]");
    subscriptionElement.dataset.subscribed = liveFeed?.subscribed().join(",") ?? "";
    const last = referenceStrips.at(-1)
      ? textureBytesForStrip(referenceStrips.at(-1)!, latestFrames)
      : null;
    if (first && last) {
      const readback = required("[data-strip-readback]");
      const value = `${first.slice(0, 3).join(",")}|${last.slice(-3).join(",")}`;
      readback.dataset.stripReadback = value;
      readback.textContent = `Pixel gradient · ${value.replace("|", " → ")}`;
    }
    const universe = universes.find((candidate) => candidate.universe === 1);
    if (!universe) return;
    cubes.forEach((cube, index) => {
      if (holdActive && heldIds.has(cube.id)) return;
      const level = universe.slots[cube.address - 1] ?? 0;
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
    if (
      !commands.definitions()[fixture.definition] &&
      !resolvedReferenceDefinition(fixture.definition)
    )
      marks.push("unresolved definition");
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
    const edit = definition
      ? `<button type="button" data-edit-definition="${escapeHtml(fixture.definition)}">Edit definition</button>`
      : "";
    return `<li role="button" tabindex="0" data-local-fixture="${fixture.id}" data-editable-fixture="${fixture.id}" data-mode="${escapeHtml(fixture.mode)}" data-marks="${escapeHtml(marks.join(" · "))}"${resolved ? ` data-resolved-footprint="${resolved.footprint}" data-resolved-length="${resolved.length}"` : ""}><span><b>${fixture.id} · ${escapeHtml(fixture.definition)}${pixels}</b><small>${detail}${resolvedDetail}${marksDetail}</small></span>${edit}</li>`;
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
  for (const fixture of fixtures) {
    const others = [...(overlaps.get(fixture.id) ?? [])].sort((a, b) => a - b);
    if (others.length > 0)
      rows.push(
        `<li data-issue="overlap:${fixture.id}">Fixture ${fixture.id} · ${escapeHtml(fixture.definition)} shares addressed slots with ${others.join(", ")}</li>`,
      );
    if (
      !commands.definitions()[fixture.definition] &&
      !resolvedReferenceDefinition(fixture.definition)
    )
      rows.push(
        `<li data-issue="unresolved:${fixture.id}">Fixture ${fixture.id} · ${escapeHtml(fixture.definition)} has no resolved definition and renders a placeholder</li>`,
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
      const slots = latestFrames.get(address.universe);
      if (!slots) continue;
      const footprint = stripFootprint ?? address.footprint;
      for (const value of slots.subarray(address.address - 1, address.address - 1 + footprint))
        level = Math.max(level, value ?? 0);
    }
    if (fixture.addresses.length > 0) levels.set(fixture.id, level);
  }
  return levels;
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
              `<li data-history-entry data-undone="${entry.undone}">${escapeHtml(entry.label)}</li>`,
          )
          .join("");
  required<HTMLButtonElement>("[data-undo]").disabled = !owner || !commands.canUndo();
  required<HTMLButtonElement>("[data-redo]").disabled = !owner || !commands.canRedo();
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
  return out as LinearRGB;
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
  return node.innerHTML;
}
