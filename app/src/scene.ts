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
}

export type SceneCommand =
  | { kind: "placement.set"; fixtureIds: number[]; placements: Record<string, Placement> }
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
    return this.#scene.overrides[String(id)] ?? fallback;
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
  if (!value || typeof value !== "object") return { overrides: {}, views: {} };
  const scene = value as Partial<PersistedScene>;
  return { overrides: scene.overrides ?? {}, views: scene.views ?? {} };
}

function clone(scene: PersistedScene): PersistedScene {
  return structuredClone(scene);
}

function sameScene(left: PersistedScene, right: PersistedScene): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
