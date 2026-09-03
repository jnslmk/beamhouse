import type { UniverseHealth, UniversesMessage } from "@beamhouse/wire";
import { LiveFeed } from "./live-feed.ts";
import { createViewport } from "./viewport.ts";
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
    <div id="viewport" aria-label="Live three-cube reference patch">
      <div class="viewport-marks" aria-live="polite">
        <span class="fixture-mark" data-fixture-mark="1"></span>
        <span class="fixture-mark" data-fixture-mark="2"></span>
        <span class="fixture-mark" data-fixture-mark="3"></span>
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
      <section class="universe-health" id="universe-health" aria-live="polite">
        <div class="empty-state">Waiting for an sACN or Art-Net source…</div>
      </section>
      <section class="terminations" id="terminations"></section>
    </aside>
  </section>
`;

const viewport = required("#viewport");
const fixtureMarks = [...document.querySelectorAll<HTMLElement>("[data-fixture-mark]")];
const cubes = createViewport(viewport, fixtureMarks);
const fixtureRows = [...document.querySelectorAll<HTMLElement>("[data-fixture]")];

new LiveFeed([1], {
  frame(universes) {
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
  },
  health(message) {
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
  const universe = message.universes.find((candidate) => candidate.universe === 1);
  const status = required("#universe-status");
  const health = required("#universe-health");
  if (!universe || universe.sources.length === 0) {
    status.textContent = "1 · waiting";
    status.dataset.contention = "false";
    health.innerHTML = '<div class="empty-state">Waiting for an sACN or Art-Net source…</div>';
    health.dataset.stale = "false";
    setFixtureTrust(false, false);
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
  const label = [contended ? "disputed" : "", stale ? "old" : ""].filter(Boolean).join(" · ");
  for (const marker of fixtureMarks) {
    marker.textContent = label;
    marker.dataset.visible = String(label.length > 0);
  }
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
