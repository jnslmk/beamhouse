// The `generated` feed (ADR-0014): computed slot-value frames entering above
// the same resolution seam as live feeds. A held look is incremental by
// construction — one settable frame, not a re-loaded recording.

export type FeedId = "live" | "recorded" | "generated";

export class GeneratedFeed {
  #slots = new Map<number, Uint8Array>();

  /** Replace the current frame; values are universe slot bytes (1..512 per universe). */
  setFrame(values: Record<string, number[]>): void {
    const next = new Map<number, Uint8Array>();
    for (const [universe, slots] of Object.entries(values)) {
      const id = Number(universe);
      if (!Number.isInteger(id) || id < 1 || id > 63999)
        throw new Error(`invalid universe ${universe}`);
      if (!Array.isArray(slots) || slots.length === 0 || slots.length > 512)
        throw new Error(`universe ${universe} needs 1 to 512 slot values`);
      for (const slot of slots)
        if (!Number.isInteger(slot) || slot < 0 || slot > 255)
          throw new Error(`universe ${universe} needs integer slot values 0-255`);
      next.set(id, Uint8Array.from(slots));
    }
    this.#slots = next;
  }

  clear(): void {
    this.#slots = new Map();
  }

  hasFrame(): boolean {
    return this.#slots.size > 0;
  }

  frame(): ReadonlyMap<number, Uint8Array> {
    return this.#slots;
  }
}
