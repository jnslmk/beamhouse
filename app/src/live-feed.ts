import { decodeFrame, type UniverseFrame, type UniversesMessage } from "@beamhouse/wire";

export interface LiveFeedHandlers {
  frame(frame: UniverseFrame[]): void;
  health(message: UniversesMessage): void;
  status(status: "connecting" | "live" | "disconnected"): void;
}

export class LiveFeed {
  readonly #socket: WebSocket;
  #universes: number[];

  constructor(universes: readonly number[], handlers: LiveFeedHandlers) {
    this.#universes = normalizeUniverses(universes);
    handlers.status("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.#socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.#socket.binaryType = "arraybuffer";
    this.#socket.addEventListener("open", () => {
      this.#subscribe();
      handlers.status("live");
    });
    this.#socket.addEventListener("close", () => handlers.status("disconnected"));
    this.#socket.addEventListener("error", () => handlers.status("disconnected"));
    this.#socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        const message: unknown = JSON.parse(event.data);
        if (isUniversesMessage(message)) handlers.health(message);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        handlers.frame(decodeFrame(event.data).universes);
      }
    });
  }

  setUniverses(universes: readonly number[]): void {
    this.#universes = normalizeUniverses(universes);
    if (this.#socket.readyState === WebSocket.OPEN) this.#subscribe();
  }
  subscribed(): readonly number[] {
    return [...this.#universes];
  }

  #subscribe(): void {
    this.#socket.send(JSON.stringify({ op: "subscribe", universes: this.#universes }));
  }
  close(): void {
    this.#socket.close();
  }
}

function isUniversesMessage(value: unknown): value is UniversesMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    value.op === "universes" &&
    "universes" in value &&
    Array.isArray(value.universes)
  );
}

function normalizeUniverses(universes: readonly number[]): number[] {
  return [
    ...new Set(universes.filter((universe) => Number.isInteger(universe) && universe > 0)),
  ].sort((left, right) => left - right);
}
