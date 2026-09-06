import type { UniverseHealth, UniversesMessage } from "@beamhouse/wire";
import { LiveFeed } from "./live-feed.ts";
import {
  referenceStrips,
  resolveColor,
  textureBytesForStrip,
  universesForStrips,
} from "./reference-rig.ts";
import { createViewport, type StripProbeMarkers } from "./viewport.ts";
import { samePlacement, SceneCommands, type Placement } from "./scene.ts";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("missing application root");

root.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark"></span><strong>Beamhouse</strong></div>
    <div class="status-chips" aria-label="Scene navigation">
      <button class="chip" type="button" data-chip-tab="universes"><span>Feed</span><b id="feed-status">connecting</b></button>
      <button class="chip" type="button" data-chip-tab="universes"><span>Universes</span><b id="universe-status">1 · waiting</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Patch</span><b>reference</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Selection</span><b id="selection-status">none</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Render</span><b>live</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Hold</span><b>off</b></button>
      <button class="chip" type="button" data-chip-tab="fixtures"><span>Snap</span><b>0.25 m</b></button>
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
      </div>
    </div>
    <aside class="overlay" data-overlay hidden aria-label="Scene workspace">
      <nav class="overlay-tabs" aria-label="Scene panels">
        <button type="button" data-overlay-tab="fixtures">Fixtures</button>
        <button type="button" data-overlay-tab="objects">Objects</button>
        <button type="button" data-overlay-tab="universes">Universes</button>
        <button type="button" data-overlay-tab="history">History</button>
        <button type="button" data-overlay-tab="issues">Issues</button>
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
      <section class="universe-health" id="universe-health" aria-live="polite">
        <div class="empty-state">Waiting for an sACN or Art-Net source…</div>
      </section>
      <section class="terminations" id="terminations"></section>
      </section>
      <section data-overlay-panel="objects" hidden><p class="lede">Objects share the fixture selection space.</p></section>
      <section data-overlay-panel="history" hidden><p class="lede">Undo and redo are available while editing a selected fixture.</p></section>
      <section data-overlay-panel="issues" hidden><p class="lede">No patch issues in the reference rig.</p></section>
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
let selectedFixture: number | null = null;
const commands = await SceneCommands.create();
const viewportApi = createViewport(
  viewport,
  fixtureMarks,
  referenceStrips,
  stripMarkers,
  stripProbeMarkers,
  (id, placement) =>
    commands.apply({ kind: "placement.set", fixtureIds: [id], placements: { [id]: placement } }),
);
const { cubes, strips, fixtures: editableFixtures } = viewportApi;
const fixtureRows = [...document.querySelectorAll<HTMLElement>("[data-fixture]")];
const receivedUniverses = new Set<number>();
const latestFrames = new Map<number, Uint8Array>();
let latestHealth: UniversesMessage | null = null;

const defaultPlacements = new Map(
  editableFixtures.map((fixture) => [fixture.id, fixture.placement()]),
);
for (const fixture of editableFixtures) {
  const fallback = defaultPlacements.get(fixture.id);
  if (fallback) fixture.setPlacement(commands.placement(fixture.id, fallback));
}
commands.onChanged(renderPlacementEditor);
renderPlacementEditor();

required<HTMLButtonElement>("[data-takeover]").addEventListener("click", () => {
  if (
    commands.isOwner() ||
    confirm(`Take over scene from ${commands.ownerName() ?? "the current owner"}?`)
  )
    commands.takeover();
});

for (const chip of document.querySelectorAll<HTMLButtonElement>("[data-chip-tab]")) {
  chip.addEventListener("click", () => openOverlay(chip.dataset.chipTab ?? "fixtures"));
}
for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]")) {
  tab.addEventListener("click", () => openOverlay(tab.dataset.overlayTab ?? "fixtures"));
}
required<HTMLButtonElement>("[data-overlay-close]").addEventListener("click", () => {
  required("[data-overlay]").hidden = true;
});

for (const row of document.querySelectorAll<HTMLElement>("[data-editable-fixture]")) {
  row.addEventListener("click", () => {
    selectedFixture = Number(row.dataset.editableFixture);
    viewportApi.selectFixture(selectedFixture);
    renderPlacementEditor();
  });
}
required<HTMLSelectElement>("[data-grid-snap]").addEventListener("change", (event) => {
  if (!commands.isOwner()) return;
  const value = Number((event.currentTarget as HTMLSelectElement).value);
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

new LiveFeed([1, ...universesForStrips(referenceStrips)], {
  frame(universes) {
    for (const universe of universes) {
      receivedUniverses.add(universe.universe);
      latestFrames.set(universe.universe, universe.slots);
    }
    for (const [index, strip] of strips.entries()) {
      const definition = referenceStrips[index];
      if (definition) strip.setPixels(resolveColor(textureBytesForStrip(definition, latestFrames)));
    }
    const first = referenceStrips[0]
      ? textureBytesForStrip(referenceStrips[0], latestFrames)
      : null;
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
    health.innerHTML = `<div class="empty-state">${retainedFrame ? "No active source · last frame retained" : "Waiting for an sACN or Art-Net source…"}</div>`;
    health.dataset.stale = String(retainedFrame);
    setFixtureTrust(retainedFrame, false);
  } else {
    const contended = universe.sources.length > 1;
    status.textContent = `1 · ${contended ? "contended" : universe.stale ? "stale" : "live"}`;
    status.dataset.contention = String(contended);
    health.dataset.stale = String(universe.stale);
    health.innerHTML = universeMarkup(universe);
    setFixtureTrust(universe.stale, contended);
  }

  const terminations = required("#terminations");
  terminations.innerHTML = message.terminations
    .map(
      ({ universe: number, source }) => `
        <p data-termination="${escapeHtml(source.id)}">
          <span>terminated</span> ${escapeHtml(source.name ?? source.id)} released universe ${number}
        </p>`,
    )
    .join("");
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
      <span>${universe.stale ? "all stale" : "receiving"}</span>
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
                <div><dt>Priority</dt><dd>${source.priority ?? "— unavailable"}</dd></div>
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

function commitNumericPlacement(): void {
  if (!commands.isOwner() || selectedFixture === null) return;
  const fixture = editableFixtures.find((candidate) => candidate.id === selectedFixture);
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
    fixtureIds: [selectedFixture],
    placements: { [selectedFixture]: placement },
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
  const fixture = editableFixtures?.find((candidate) => candidate.id === selectedFixture);
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
  required("#selection-status").textContent = fixture ? String(fixture.id) : "none";
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
  required("[data-history-count]").textContent = String(commands.historyCount());
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
    panel.hidden = panel.dataset.overlayPanel !== tab;
  }
  for (const button of overlay.querySelectorAll<HTMLButtonElement>("[data-overlay-tab]")) {
    button.dataset.active = String(button.dataset.overlayTab === tab);
  }
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
