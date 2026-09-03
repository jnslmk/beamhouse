import type { UniverseHealth, UniversesMessage } from "@beamhouse/wire";
import { LiveFeed } from "./live-feed.ts";
import {
  referenceStrips,
  resolveColor,
  textureBytesForStrip,
  universesForStrips,
} from "./reference-rig.ts";
import { createViewport, type StripProbeMarkers } from "./viewport.ts";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("missing application root");

root.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark"></span><strong>Beamhouse</strong></div>
    <div class="status-chips">
      <div class="chip"><span>Feed</span><b id="feed-status">connecting</b></div>
      <div class="chip"><span>Universe</span><b id="universe-status">1 · waiting</b></div>
      <div class="chip passive"><span>DMX out</span><b>none · passive</b></div>
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
    <aside class="panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Reference patch</span><h1>Live cubes</h1></div>
        <span class="live-dot" aria-hidden="true"></span>
      </div>
      <p class="lede">Universe 1 · slots 1–3. Every accepted packet is drawn last-writer-wins.</p>
      <ol class="fixtures" id="fixtures">
        ${[1, 2, 3]
          .map(
            (address) => `
              <li data-fixture="${address}" data-level="0">
                <span class="swatch swatch-${address}"></span>
                <span><b>Cube ${address}</b><small>1.${String(address).padStart(3, "0")}</small></span>
                <output>0</output>
              </li>`,
          )
          .join("")}
      </ol>
      <section class="strip-status" aria-live="polite">
        <div class="health-heading"><b>STAR-TENT strips</b><span>texture-backed</span></div>
        <ol class="strip-list">
          ${referenceStrips.map((strip) => `<li data-texture-strip="${strip.id}">Spoke ${strip.id} · 23 px</li>`).join("")}
        </ol>
        <output class="strip-readback" data-strip-readback="">Waiting for universes 2 · 3</output>
      </section>
      <section class="universe-health" id="universe-health" aria-live="polite">
        <div class="empty-state">Waiting for an sACN or Art-Net source…</div>
      </section>
      <section class="terminations" id="terminations"></section>
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
const { cubes, strips } = createViewport(
  viewport,
  fixtureMarks,
  referenceStrips,
  stripMarkers,
  stripProbeMarkers,
);
const fixtureRows = [...document.querySelectorAll<HTMLElement>("[data-fixture]")];
const receivedUniverses = new Set<number>();
const latestFrames = new Map<number, Uint8Array>();
let latestHealth: UniversesMessage | null = null;

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

function trustLabel(stale: boolean, contended: boolean): string {
  return [contended ? "disputed" : "", stale ? "old" : ""].filter(Boolean).join(" · ");
}

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}
