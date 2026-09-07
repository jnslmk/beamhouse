export interface Placement {
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

export function samePlacement(left: Placement, right: Placement): boolean {
  return [...left.position, ...left.rotation].every(
    (value, index) => Math.abs(value - [...right.position, ...right.rotation][index]!) < 1e-6,
  );
}

export type PrimitiveType = "Cube" | "Cylinder" | "Sphere";

export type BhsDefinition =
  | {
      kind: "strip";
      pixels: number;
      pitchMm: number;
      channelsPerPixel: number;
      primitive: PrimitiveType;
    }
  | {
      kind: "primitive";
      primitive: PrimitiveType;
      width: number;
      depth: number;
      height: number;
    };

export interface BreakAddress {
  universe: number;
  address: number;
  footprint: number;
}

/** A scene object is this same fixture shape with an empty mode and no addresses. */
export interface LocalFixture {
  id: number;
  definition: string;
  mode: string;
  addresses: BreakAddress[];
}

interface PersistedScene {
  overrides: Record<string, Placement>;
  views: Record<string, CameraView>;
  arrays: Record<string, ArrayDef>;
  definitions: Record<string, BhsDefinition>;
  fixtures: Record<string, LocalFixture>;
}

export type ArrayDef =
  | {
      kind: "radial";
      id: string;
      memberIds: number[];
      center: [number, number, number];
      radius: number;
      startAngleDeg: number;
      /** Degrees between members; 0 (or missing on old scenes) means even 360/n spacing. */
      stepDeg: number;
    }
  | {
      kind: "line";
      id: string;
      memberIds: number[];
      origin: [number, number, number];
      spacing: [number, number, number];
    }
  | {
      kind: "grid";
      id: string;
      memberIds: number[];
      origin: [number, number, number];
      spacingX: number;
      spacingZ: number;
      columns: number;
    };

export type Pivot =
  { mode: "own" } | { mode: "shared" } | { mode: "explicit"; point: [number, number, number] };

export type SceneCommand =
  | { kind: "placement.set"; fixtureIds: number[]; placements: Record<string, Placement> }
  | { kind: "placement.clear"; fixtureIds: number[] }
  | { kind: "array.set"; id: string; array: ArrayDef }
  | { kind: "camera.saveView"; name: string; view: CameraView }
  | {
      kind: "fixture.add";
      fixture: LocalFixture;
      placement: Placement;
      definition?: { id: string; value: BhsDefinition };
    }
  | { kind: "definition.set"; id: string; value: BhsDefinition };

interface HistoryEntry {
  command: SceneCommand;
  before: PersistedScene;
  after: PersistedScene;
}

type ControlMessage =
  | { op: "control.owner"; owner: boolean; ownerName: string | null }
  | { op: "control.snapshot.request"; requestId?: number; relinquish?: boolean }
  | { op: "control.snapshot"; scene: unknown; requestId?: number }
  | { op: "control.scene.changed"; scene: unknown };

function describeCommand(command: SceneCommand): string {
  switch (command.kind) {
    case "placement.set":
      return `move ${command.fixtureIds.join(",")}`;
    case "placement.clear":
      return `revert ${command.fixtureIds.join(",")}`;
    case "array.set":
      return `array ${command.id}`;
    case "camera.saveView":
      return `camera ${command.name}`;
    case "fixture.add":
      return `add fixture ${command.fixture.id}`;
    case "definition.set":
      return `define ${command.id}`;
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
}

const databaseName = "beamhouse.scene.v1";
const storeName = "working-scenes";
const workingSceneKey = "current";

/** The sole persistent-mutation seam shared by every editor front end. */
export class SceneCommands {
  #scene: PersistedScene;
  #history: HistoryEntry[] = [];
  #cursor = 0;
  #changed: (() => void) | null = null;
  #owner = false;
  #ownerName: string | null = null;
  #database: IDBDatabase;
  #socket: WebSocket | undefined;
  #control: boolean;
  #liveness: number | null = null;
  #relinquishing = false;
  #hidden = false;
  #lastTransport = 0;

  private constructor(scene: PersistedScene, database: IDBDatabase, control = true) {
    this.#scene = scene;
    this.#database = database;
    this.#control = control;
    this.#connect(false);
    window.addEventListener("pagehide", () => {
      this.#hidden = true;
      this.#stepDown();
      this.#socket?.close();
    });
    window.addEventListener("pageshow", () => {
      if (!this.#hidden) return;
      this.#hidden = false;
      this.#connect(true);
    });
  }

  static async create(options: { control?: boolean } = {}): Promise<SceneCommands> {
    const database = await openDatabase();
    return new SceneCommands(await load(database), database, options.control ?? true);
  }

  onChanged(changed: () => void): void {
    this.#changed = changed;
  }

  isOwner(): boolean {
    return this.#owner;
  }

  ownerName(): string | null {
    return this.#ownerName;
  }

  takeover(): void {
    this.#send({ op: "control.takeover" });
  }

  placement(id: number, fallback: Placement): Placement {
    return (
      this.#scene.overrides[String(id)] ??
      arrayPlacement(findArray(this.#scene, id), id) ??
      fallback
    );
  }

  isOverridden(id: number): boolean {
    return this.#scene.overrides[String(id)] !== undefined;
  }

  arrays(): Readonly<Record<string, ArrayDef>> {
    return this.#scene.arrays;
  }

  views(): Readonly<Record<string, CameraView>> {
    return this.#scene.views;
  }
  definitions(): Readonly<Record<string, BhsDefinition>> {
    return this.#scene.definitions;
  }

  fixtures(): readonly LocalFixture[] {
    return Object.values(this.#scene.fixtures);
  }

  nextFixtureId(): number {
    return Math.min(0, ...Object.values(this.#scene.fixtures).map((fixture) => fixture.id)) - 1;
  }

  fixtureAddError(command: Extract<SceneCommand, { kind: "fixture.add" }>): string | null {
    return fixtureAddError(command, this.#scene);
  }

  definitionSetError(id: unknown, value: unknown): string | null {
    if (!isBhsId(id) || !isBhsDefinition(value) || !this.#scene.definitions[id])
      return "Choose an existing Beamhouse definition.";
    const footprint = value.kind === "strip" ? value.pixels * value.channelsPerPixel : null;
    if (
      footprint !== null &&
      Object.values(this.#scene.fixtures).some(
        (fixture) =>
          fixture.definition === id &&
          fixture.addresses.some((address) => address.address + footprint - 1 > 512),
      )
    )
      return "This shared definition would run a fixture past slot 512.";
    return null;
  }

  historyCount(): number {
    return this.#history.length;
  }

  canUndo(): boolean {
    return this.#cursor > 0;
  }

  canRedo(): boolean {
    return this.#cursor < this.#history.length;
  }

  history(): { label: string; undone: boolean }[] {
    return this.#history.map((entry, index) => ({
      label: describeCommand(entry.command),
      undone: index >= this.#cursor,
    }));
  }

  apply(command: SceneCommand): void {
    if (!this.#owner || !isCommandKind(command)) return;
    if (command.kind === "fixture.add" && this.fixtureAddError(command)) return;
    if (command.kind === "definition.set" && this.definitionSetError(command.id, command.value))
      return;
    const before = clone(this.#scene);
    const after = apply(command, before);
    if (sameScene(before, after)) return;
    this.#history.splice(this.#cursor);
    this.#history.push({ command, before, after });
    this.#cursor = this.#history.length;
    this.#scene = after;
    void this.#saveAndNotify();
  }

  undo(): void {
    if (!this.#owner) return;
    const entry = this.#history[this.#cursor - 1];
    if (!entry) return;
    this.#scene = clone(entry.before);
    this.#cursor -= 1;
    void this.#saveAndNotify();
  }

  redo(): void {
    if (!this.#owner) return;
    const entry = this.#history[this.#cursor];
    if (!entry) return;
    this.#scene = clone(entry.after);
    this.#cursor += 1;
    void this.#saveAndNotify();
  }

  #receive(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: ControlMessage;
    try {
      message = JSON.parse(raw) as ControlMessage;
    } catch {
      return;
    }
    if (message.op === "control.owner") {
      if (!message.owner && (this.#owner || this.#relinquishing)) this.#clearHistory();
      this.#owner = message.owner;
      this.#ownerName = message.ownerName;
      this.#relinquishing = false;
      this.#notify();
      return;
    }
    if (message.op === "control.snapshot.request") {
      if (this.#owner) {
        if (message.relinquish) {
          this.#owner = false;
          this.#relinquishing = true;
          this.#notify();
        }
        this.#send({
          op: "control.snapshot",
          scene: this.#scene,
          ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
        });
      }
      return;
    }
    if (
      (message.op === "control.snapshot" || message.op === "control.scene.changed") &&
      !this.#owner
    ) {
      this.#scene = normalize(message.scene);
      this.#clearHistory();
      // Followers adopt bridge snapshots in memory; their IndexedDB working scene stays untouched.
      this.#notify();
      if (message.op === "control.snapshot" && message.requestId !== undefined) {
        this.#send({ op: "control.snapshot.ack", requestId: message.requestId });
      }
    }
  }
  #connect(follow: boolean): void {
    // A share-link viewer is frozen at the transport layer too: no dial, no join,
    // no liveness, no reconnect, and therefore no adopted live snapshots.
    if (!this.#control) return;
    if (this.#liveness !== null) window.clearInterval(this.#liveness);
    this.#liveness = null;
    const previous = this.#socket;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.#socket = socket;
    if (previous && previous !== socket && previous.readyState !== WebSocket.CLOSED) {
      try {
        previous.close();
      } catch {
        // Closing a stale predecessor never fails the replacement connection.
      }
    }
    socket.addEventListener("open", () => {
      if (socket !== this.#socket) return;
      this.#lastTransport = Date.now();
      socket.send(JSON.stringify({ op: "control.join", follow }));
      this.#liveness = window.setInterval(() => {
        if (Date.now() - this.#lastTransport > 15_000) {
          this.#stepDown();
          socket.close();
        } else this.#send({ op: "control.liveness" });
      }, 5_000);
    });
    socket.addEventListener("message", (event) => {
      if (socket !== this.#socket) return;
      this.#lastTransport = Date.now();
      this.#receive(event.data);
    });
    socket.addEventListener("error", () => {
      if (socket !== this.#socket) return;
      this.#stepDown();
      socket.close();
    });
    socket.addEventListener("close", () => {
      if (socket !== this.#socket) return;
      this.#stepDown();
      if (this.#hidden) return;
      window.setTimeout(() => {
        if (socket === this.#socket && !this.#hidden) this.#connect(true);
      }, 1_000);
    });
  }

  #stepDown(): void {
    if (this.#liveness !== null) window.clearInterval(this.#liveness);
    this.#liveness = null;
    this.#owner = false;
    this.#ownerName = null;
    this.#relinquishing = false;
    this.#lastTransport = 0;
    this.#clearHistory();
    this.#notify();
  }
  #send(message: object): void {
    if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message));
  }

  #notify(): void {
    this.#changed?.();
  }

  #clearHistory(): void {
    this.#history = [];
    this.#cursor = 0;
  }

  async #saveAndNotify(): Promise<void> {
    await save(this.#database, this.#scene);
    if (this.#owner) this.#send({ op: "control.scene.changed", scene: this.#scene });
    this.#notify();
  }
}

function apply(command: SceneCommand, scene: PersistedScene): PersistedScene {
  const after = clone(scene);
  if (command.kind === "placement.set") {
    for (const id of command.fixtureIds) {
      const placement = command.placements[String(id)];
      if (placement) after.overrides[String(id)] = placement;
    }
  } else if (command.kind === "placement.clear") {
    for (const id of command.fixtureIds) delete after.overrides[String(id)];
  } else if (command.kind === "array.set") {
    const memberIds = command.array.memberIds.map((id) => Math.trunc(id));
    // One fixture has exactly one computed placement, so joining an array evicts the
    // member elsewhere; the per-array member counts in the UI make the move visible.
    for (const other of Object.values(after.arrays)) {
      if (other.id !== command.id)
        other.memberIds = other.memberIds.filter((id) => !memberIds.includes(id));
    }
    after.arrays[command.id] = { ...command.array, id: command.id, memberIds };
  } else if (command.kind === "camera.saveView") {
    after.views[command.name] = command.view;
  } else if (command.kind === "definition.set") {
    if (!isBhsId(command.id) || !isBhsDefinition(command.value) || !after.definitions[command.id])
      return scene;
    const footprint =
      command.value.kind === "strip" ? command.value.pixels * command.value.channelsPerPixel : null;
    if (
      footprint !== null &&
      Object.values(after.fixtures).some(
        (fixture) =>
          fixture.definition === command.id &&
          fixture.addresses.some((address) => address.address + footprint - 1 > 512),
      )
    )
      return scene;
    after.definitions[command.id] = command.value;
  } else {
    if (fixtureAddError(command, scene)) return scene;
    if (command.definition) after.definitions[command.definition.id] = command.definition.value;
    after.fixtures[String(command.fixture.id)] = command.fixture;
    after.overrides[String(command.fixture.id)] = command.placement;
  }
  return after;
}
function isCommandKind(value: unknown): value is SceneCommand {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  return (
    value.kind === "placement.set" ||
    value.kind === "placement.clear" ||
    value.kind === "array.set" ||
    value.kind === "camera.saveView" ||
    value.kind === "fixture.add" ||
    value.kind === "definition.set"
  );
}

function fixtureAddError(command: unknown, scene: PersistedScene): string | null {
  if (!command || typeof command !== "object" || !("fixture" in command))
    return "Local fixtures need a new allocated negative id, definition, and placement.";
  const rawFixture = command.fixture;
  if (!rawFixture || typeof rawFixture !== "object")
    return "Local fixtures need a new allocated negative id, definition, and placement.";
  if (
    !("id" in rawFixture) ||
    !("definition" in rawFixture) ||
    !("mode" in rawFixture) ||
    !("addresses" in rawFixture) ||
    !("placement" in command) ||
    typeof rawFixture.id !== "number" ||
    !Number.isInteger(rawFixture.id) ||
    rawFixture.id >= 0 ||
    scene.fixtures[String(rawFixture.id)] ||
    typeof rawFixture.definition !== "string" ||
    rawFixture.definition.length === 0 ||
    typeof rawFixture.mode !== "string" ||
    !isPlacement(command.placement)
  )
    return "Local fixtures need a new allocated negative id, definition, and placement.";
  if (!Array.isArray(rawFixture.addresses))
    return "Each break needs a universe, address, and footprint.";
  const addresses: unknown[] = rawFixture.addresses;
  for (const address of addresses) {
    if (
      !address ||
      typeof address !== "object" ||
      !("universe" in address) ||
      typeof address.universe !== "number" ||
      !Number.isInteger(address.universe) ||
      address.universe < 1 ||
      address.universe > 63_999
    )
      return "Universe must be 1–63999.";
    if (!isBreakAddress(address)) return "Each break needs a universe, address, and footprint.";
  }
  if ((addresses.length === 0) !== (rawFixture.mode.length === 0))
    return "Scene objects have an empty mode and no address; fixtures need both.";
  let inline: BhsDefinition | undefined;
  if ("definition" in command && command.definition !== undefined) {
    const definition = command.definition;
    if (
      !definition ||
      typeof definition !== "object" ||
      !("id" in definition) ||
      !("value" in definition) ||
      typeof definition.id !== "string" ||
      definition.id !== rawFixture.definition ||
      !isBhsId(definition.id) ||
      scene.definitions[definition.id] ||
      !isBhsDefinition(definition.value)
    )
      return "An inline Beamhouse definition is created with its first local fixture.";
    inline = definition.value;
  }
  const resolved = inline ?? scene.definitions[rawFixture.definition];
  if (isBhsId(rawFixture.definition) && !resolved)
    return "A bhs: definition is reachable only through the fixture that creates it.";
  const footprint = resolved?.kind === "strip" ? resolved.pixels * resolved.channelsPerPixel : null;
  for (const address of addresses) {
    if (!isBreakAddress(address)) return "Each break needs a universe, address, and footprint.";
    const slots = footprint ?? address.footprint;
    if (address.address + slots - 1 > 512)
      return `Universe ${address.universe}.${address.address} runs past slot 512.`;
  }
  return null;
}

function isBhsId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith("bhs:");
}

function isBhsDefinition(value: unknown): value is BhsDefinition {
  if (!value || typeof value !== "object") return false;
  const definition = value as Partial<BhsDefinition>;
  if (
    definition.kind === "strip" &&
    typeof definition.pixels === "number" &&
    Number.isInteger(definition.pixels) &&
    definition.pixels > 0 &&
    typeof definition.pitchMm === "number" &&
    Number.isFinite(definition.pitchMm) &&
    definition.pitchMm > 0 &&
    typeof definition.channelsPerPixel === "number" &&
    Number.isInteger(definition.channelsPerPixel) &&
    definition.channelsPerPixel > 0 &&
    isPrimitiveType(definition.primitive)
  )
    return true;
  return (
    definition.kind === "primitive" &&
    isPrimitiveType(definition.primitive) &&
    typeof definition.width === "number" &&
    Number.isFinite(definition.width) &&
    definition.width > 0 &&
    typeof definition.depth === "number" &&
    Number.isFinite(definition.depth) &&
    definition.depth > 0 &&
    typeof definition.height === "number" &&
    Number.isFinite(definition.height) &&
    definition.height > 0
  );
}

function isPrimitiveType(value: unknown): value is PrimitiveType {
  return value === "Cube" || value === "Cylinder" || value === "Sphere";
}

function isBreakAddress(value: unknown): value is BreakAddress {
  if (!value || typeof value !== "object") return false;
  const address = value as Partial<BreakAddress>;
  return (
    typeof address.universe === "number" &&
    Number.isInteger(address.universe) &&
    address.universe >= 1 &&
    address.universe <= 63_999 &&
    typeof address.address === "number" &&
    Number.isInteger(address.address) &&
    address.address > 0 &&
    address.address <= 512 &&
    typeof address.footprint === "number" &&
    Number.isInteger(address.footprint) &&
    address.footprint > 0
  );
}

function isPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== "object") return false;
  const placement = value as Partial<Placement>;
  return isTuple3(placement.position) && isTuple3(placement.rotation);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function load(database: IDBDatabase): Promise<PersistedScene> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get(workingSceneKey);
    request.onsuccess = () => resolve(normalize(request.result));
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function save(database: IDBDatabase, scene: PersistedScene): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .put(clone(scene), workingSceneKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function normalize(value: unknown): PersistedScene {
  if (!value || typeof value !== "object")
    return { overrides: {}, views: {}, arrays: {}, definitions: {}, fixtures: {} };
  const scene = value as Partial<PersistedScene>;
  const arrays: Record<string, ArrayDef> = {};
  if (scene.arrays && typeof scene.arrays === "object") {
    for (const [id, array] of Object.entries(scene.arrays)) {
      const valid = normalizeArray(id, array);
      if (valid) arrays[id] = valid;
    }
  }
  const definitions: Record<string, BhsDefinition> = {};
  if (scene.definitions && typeof scene.definitions === "object") {
    for (const [id, definition] of Object.entries(scene.definitions)) {
      if (isBhsId(id) && isBhsDefinition(definition)) definitions[id] = definition;
    }
  }
  const fixtures: Record<string, LocalFixture> = {};
  if (scene.fixtures && typeof scene.fixtures === "object") {
    for (const [id, fixture] of Object.entries(scene.fixtures)) {
      const valid = normalizeLocalFixture(fixture, definitions);
      if (valid && String(valid.id) === id) fixtures[id] = valid;
    }
  }
  for (const id of Object.keys(definitions)) {
    if (!Object.values(fixtures).some((fixture) => fixture.definition === id))
      delete definitions[id];
  }
  return {
    overrides: scene.overrides ?? {},
    views: scene.views ?? {},
    arrays,
    definitions,
    fixtures,
  };
}

function normalizeLocalFixture(
  value: unknown,
  definitions: Readonly<Record<string, BhsDefinition>>,
): LocalFixture | null {
  if (!isLocalFixture(value)) return null;
  const fixture = value;
  const definition = definitions[fixture.definition];
  if (isBhsId(fixture.definition) && !definition) return null;
  const footprint =
    definition?.kind === "strip" ? definition.pixels * definition.channelsPerPixel : null;
  if (
    fixture.addresses.some(
      (address) => address.address + (footprint ?? address.footprint) - 1 > 512,
    )
  )
    return null;
  return {
    id: fixture.id,
    definition: fixture.definition,
    mode: fixture.mode,
    addresses: fixture.addresses,
  };
}

function isLocalFixture(value: unknown): value is LocalFixture {
  if (!value || typeof value !== "object") return false;
  const fixture = value as Partial<LocalFixture>;
  return (
    typeof fixture.id === "number" &&
    Number.isInteger(fixture.id) &&
    fixture.id < 0 &&
    typeof fixture.definition === "string" &&
    fixture.definition.length > 0 &&
    typeof fixture.mode === "string" &&
    Array.isArray(fixture.addresses) &&
    fixture.addresses.every(isBreakAddress) &&
    (fixture.addresses.length === 0) === (fixture.mode.length === 0)
  );
}

function isTuple3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((id) => Number.isInteger(id));
}

/** Drops malformed persisted/forwarded arrays so a bad entry can never dereference. */
function normalizeArray(id: string, value: unknown): ArrayDef | null {
  if (!value || typeof value !== "object") return null;
  const array = value as Partial<ArrayDef>;
  if (!isIdList(array.memberIds)) return null;
  if (array.kind === "radial") {
    if (
      !isTuple3(array.center) ||
      typeof array.radius !== "number" ||
      !Number.isFinite(array.radius)
    )
      return null;
    if (typeof array.startAngleDeg !== "number" || !Number.isFinite(array.startAngleDeg))
      return null;
    const stepDeg =
      array.stepDeg === undefined ? 360 / Math.max(1, array.memberIds.length) : array.stepDeg;
    if (!Number.isFinite(stepDeg)) return null;
    return {
      kind: "radial",
      id,
      memberIds: array.memberIds,
      center: array.center,
      radius: array.radius,
      startAngleDeg: array.startAngleDeg,
      stepDeg,
    };
  }
  if (array.kind === "line") {
    if (!isTuple3(array.origin) || !isTuple3(array.spacing)) return null;
    return {
      kind: "line",
      id,
      memberIds: array.memberIds,
      origin: array.origin,
      spacing: array.spacing,
    };
  }
  if (array.kind === "grid") {
    if (!isTuple3(array.origin)) return null;
    if (
      typeof array.spacingX !== "number" ||
      !Number.isFinite(array.spacingX) ||
      typeof array.spacingZ !== "number" ||
      !Number.isFinite(array.spacingZ)
    )
      return null;
    if (typeof array.columns !== "number" || !Number.isFinite(array.columns)) return null;
    return {
      kind: "grid",
      id,
      memberIds: array.memberIds,
      origin: array.origin,
      spacingX: array.spacingX,
      spacingZ: array.spacingZ,
      columns: array.columns,
    };
  }
  return null;
}

function findArray(scene: PersistedScene, id: number): ArrayDef | null {
  for (const array of Object.values(scene.arrays)) {
    if (array.memberIds.includes(id)) return array;
  }
  return null;
}

/** Parameterized member placement. Overrides win; this never writes, so recompute keeps them. */
export function arrayPlacement(array: ArrayDef | null, id: number): Placement | null {
  if (!array) return null;
  const index = array.memberIds.indexOf(id);
  if (index < 0) return null;
  if (array.kind === "radial") {
    const step = array.stepDeg === 0 ? 360 / array.memberIds.length : array.stepDeg;
    const angle = ((array.startAngleDeg + index * step) * Math.PI) / 180;
    return {
      position: [
        array.center[0] + array.radius * Math.cos(angle),
        array.center[1],
        array.center[2] + array.radius * Math.sin(angle),
      ],
      rotation: [0, -(array.startAngleDeg + index * step), 0],
    };
  }
  if (array.kind === "line") {
    return {
      position: [
        array.origin[0] + array.spacing[0] * index,
        array.origin[1] + array.spacing[1] * index,
        array.origin[2] + array.spacing[2] * index,
      ],
      rotation: [0, 0, 0],
    };
  }
  const columns = Math.max(1, Math.trunc(array.columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    position: [
      array.origin[0] + column * array.spacingX,
      array.origin[1],
      array.origin[2] + row * array.spacingZ,
    ],
    rotation: [0, 0, 0],
  };
}

export type AlignAxis = "x" | "y" | "z";

function axisIndex(axis: AlignAxis): number {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

/** One operator-level align: every member moves to the selection midpoint on the axis. */
export function alignTargets(
  current: ReadonlyMap<number, Placement>,
  ids: number[],
  axis: AlignAxis,
): Record<string, Placement> {
  const axisIdx = axisIndex(axis);
  const values = ids.map((id) => current.get(id)?.position[axisIdx] ?? 0);
  const target = (Math.min(...values) + Math.max(...values)) / 2;
  const placements: Record<string, Placement> = {};
  for (const id of ids) {
    const placement = current.get(id);
    if (!placement) continue;
    const position = [...placement.position] as [number, number, number];
    position[axisIdx] = target;
    placements[String(id)] = {
      position,
      rotation: [...placement.rotation] as [number, number, number],
    };
  }
  return placements;
}

/** One operator-level distribute: members spread evenly between the extreme positions. */
export function distributeTargets(
  current: ReadonlyMap<number, Placement>,
  ids: number[],
  axis: AlignAxis,
): Record<string, Placement> {
  const axisIdx = axisIndex(axis);
  const ordered = [...ids].sort(
    (left, right) =>
      (current.get(left)?.position[axisIdx] ?? 0) - (current.get(right)?.position[axisIdx] ?? 0),
  );
  if (ordered.length < 2) return {};
  const first = current.get(ordered[0]!)?.position[axisIdx] ?? 0;
  const last = current.get(ordered.at(-1)!)?.position[axisIdx] ?? 0;
  const step = (last - first) / (ordered.length - 1);
  const placements: Record<string, Placement> = {};
  ordered.forEach((id, rank) => {
    const placement = current.get(id);
    if (!placement) return;
    const position = [...placement.position] as [number, number, number];
    position[axisIdx] = first + step * rank;
    placements[String(id)] = {
      position,
      rotation: [...placement.rotation] as [number, number, number],
    };
  });
  return placements;
}

/**
 * One operator-level rotation about a fixture-id pivot, kept rigid: positions orbit the
 * pivot while orientations compose. Exact for the single-axis deltas the UI issues.
 */
export function rotateTargets(
  current: ReadonlyMap<number, Placement>,
  ids: number[],
  delta: [number, number, number],
  pivot: Pivot,
): Record<string, Placement> {
  const matrix = eulerMatrix(delta);
  const center =
    pivot.mode === "explicit"
      ? pivot.point
      : pivot.mode === "shared"
        ? centroid(ids.map((id) => current.get(id)?.position ?? [0, 0, 0]))
        : null;
  const placements: Record<string, Placement> = {};
  for (const id of ids) {
    const placement = current.get(id);
    if (!placement) continue;
    const origin = center ?? placement.position;
    const offset = [
      placement.position[0] - origin[0],
      placement.position[1] - origin[1],
      placement.position[2] - origin[2],
    ] as [number, number, number];
    const rotated = applyMatrix(matrix, offset);
    const composed = multiplyMatrices(matrix, eulerMatrix(placement.rotation));
    placements[String(id)] = {
      position: [origin[0] + rotated[0], origin[1] + rotated[1], origin[2] + rotated[2]],
      rotation: eulerFromMatrix(composed),
    };
  }
  return placements;
}

type Matrix3 = [[number, number, number], [number, number, number], [number, number, number]];

function multiplyMatrices(left: Matrix3, right: Matrix3): Matrix3 {
  const at = (row: 0 | 1 | 2, column: 0 | 1 | 2) =>
    left[row][0] * right[0][column] +
    left[row][1] * right[1][column] +
    left[row][2] * right[2][column];
  return [
    [at(0, 0), at(0, 1), at(0, 2)],
    [at(1, 0), at(1, 1), at(1, 2)],
    [at(2, 0), at(2, 1), at(2, 2)],
  ];
}

/** Inverse of eulerMatrix for XYZ order: extracts degrees from a composed rotation. */
function eulerFromMatrix(matrix: Matrix3): [number, number, number] {
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const clamped = Math.min(1, Math.max(-1, matrix[0][2]));
  if (Math.abs(clamped) < 0.9999999) {
    return [
      toDegrees(Math.atan2(-matrix[1][2], matrix[2][2])),
      toDegrees(Math.asin(clamped)),
      toDegrees(Math.atan2(-matrix[0][1], matrix[0][0])),
    ];
  }
  return [toDegrees(Math.atan2(matrix[2][1], matrix[1][1])), toDegrees(Math.asin(clamped)), 0];
}

function eulerMatrix([x, y, z]: [number, number, number]): Matrix3 {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const [cx, sx] = [Math.cos(radians(x)), Math.sin(radians(x))];
  const [cy, sy] = [Math.cos(radians(y)), Math.sin(radians(y))];
  const [cz, sz] = [Math.cos(radians(z)), Math.sin(radians(z))];
  return [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
}

function applyMatrix(matrix: Matrix3, vector: [number, number, number]): [number, number, number] {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function centroid(
  positions: readonly (readonly [number, number, number] | [number, number, number])[],
): [number, number, number] {
  const sum = positions.reduce(
    (total, position) =>
      [total[0] + position[0], total[1] + position[1], total[2] + position[2]] as [
        number,
        number,
        number,
      ],
    [0, 0, 0] as [number, number, number],
  );
  const count = Math.max(1, positions.length);
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function clone(scene: PersistedScene): PersistedScene {
  return structuredClone(scene);
}

function sameScene(left: PersistedScene, right: PersistedScene): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
