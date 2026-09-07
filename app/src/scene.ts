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

interface PersistedScene {
  overrides: Record<string, Placement>;
  views: Record<string, CameraView>;
  arrays: Record<string, ArrayDef>;
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
  | { kind: "camera.saveView"; name: string; view: CameraView };

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
  #socket: WebSocket;
  #liveness: number | null = null;

  private constructor(scene: PersistedScene, database: IDBDatabase) {
    this.#scene = scene;
    this.#database = database;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.#socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.#socket.addEventListener("open", () => {
      this.#send({ op: "control.join" });
      this.#liveness = window.setInterval(() => this.#send({ op: "control.liveness" }), 5_000);
    });
    this.#socket.addEventListener("message", (event) => this.#receive(event.data));
    window.addEventListener(
      "pagehide",
      () => {
        if (this.#liveness !== null) window.clearInterval(this.#liveness);
        this.#socket.close();
      },
      { once: true },
    );
  }

  static async create(): Promise<SceneCommands> {
    const database = await openDatabase();
    return new SceneCommands(await load(database), database);
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

  arrays(): Readonly<Record<string, ArrayDef>> {
    return this.#scene.arrays;
  }

  views(): Readonly<Record<string, CameraView>> {
    return this.#scene.views;
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

  apply(command: SceneCommand): void {
    if (!this.#owner) return;
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
      if (this.#owner && !message.owner) this.#clearHistory();
      this.#owner = message.owner;
      this.#ownerName = message.ownerName;
      this.#notify();
      return;
    }
    if (message.op === "control.snapshot.request") {
      if (this.#owner) {
        if (message.relinquish) {
          this.#owner = false;
          this.#clearHistory();
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

  #send(message: object): void {
    if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message));
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
  } else {
    after.views[command.name] = command.view;
  }
  return after;
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
  if (!value || typeof value !== "object") return { overrides: {}, views: {}, arrays: {} };
  const scene = value as Partial<PersistedScene>;
  const arrays: Record<string, ArrayDef> = {};
  if (scene.arrays && typeof scene.arrays === "object") {
    for (const [id, array] of Object.entries(scene.arrays)) {
      const valid = normalizeArray(id, array);
      if (valid) arrays[id] = valid;
    }
  }
  return { overrides: scene.overrides ?? {}, views: scene.views ?? {}, arrays };
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
