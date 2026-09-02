import { decodeFrame, type UniverseFrame, type UniversesMessage } from "@beamhouse/wire";

export interface LiveFeedHandlers {
  frame(frame: UniverseFrame[]): void;
  health(message: UniversesMessage): void;
  status(status: "connecting" | "live" | "disconnected"): void;
}

export class LiveFeed {
  readonly #socket: WebSocket;

  constructor(universes: readonly number[], handlers: LiveFeedHandlers) {
    handlers.status("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.#socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.#socket.binaryType = "arraybuffer";
    this.#socket.addEventListener("open", () => {
      this.#socket.send(JSON.stringify({ op: "subscribe", universes }));
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
